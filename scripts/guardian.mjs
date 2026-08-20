// Guardián de antipatrones de SATAG.
//
//   node scripts/guardian.mjs          verifica y falla si encuentra algo
//   node scripts/guardian.mjs --mapa   además imprime qué cuerpo SQL está vivo
//
// No sustituye a las pruebas: vigila que NO VUELVAN los errores que este
// proyecto ya pagó caro. Cada regla nació de un defecto real y lo cita.
// Corre en cada envío desde .github/workflows/verificacion.yml
//
// Sale con código 1 si encuentra algo, para que el build falle.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const MAPA = process.argv.includes("--mapa");

// ---------------------------------------------------------------------
// Formas de tuteo. La regla del proyecto (CC-07) es que TODO el texto de
// cara al usuario va de usted, venga del cliente o de la base de datos.
// Defectos que la incumplieron: D-03 (cliente), D-05, D-07 (base).
// ---------------------------------------------------------------------
const TUTEO = [
  { re: /\bDebes\b/, di: "«Debes» va de usted: «Debe»" },
  { re: /\bPuedes\b/, di: "«Puedes» va de usted: «Puede»" },
  { re: /\bTienes\b/, di: "«Tienes» va de usted: «Tiene»" },
  { re: /\bCaptura\b/, di: "«Captura» va de usted: «Capture»" },
  { re: /\bEscribe\b/, di: "«Escribe» va de usted: «Escriba»" },
  { re: /\bIngresa\b/, di: "«Ingresa» va de usted: «Ingrese»" },
  { re: /\bSelecciona\b/, di: "«Selecciona» va de usted: «Seleccione»" },
  { re: /\bElige\b/, di: "«Elige» va de usted: «Elija»" },
  { re: /\bIndica\b/, di: "«Indica» va de usted: «Indique»" },
  { re: /\bDescribe\b/, di: "«Describe» va de usted: «Describa»" },
  { re: /\bRevisa\b/, di: "«Revisa» va de usted: «Revise»" },
  { re: /\bAcepta\b/, di: "«Acepta» va de usted: «Acepte»" },
  { re: /\bDespl[aá]zate\b/, di: "«Desplázate» va de usted: «Desplácese»" },
  { re: /\bCu[eé]ntanos\b/, di: "«Cuéntanos» va de usted: «Cuéntenos»" },
  { re: /\bcierrala\b/i, di: "«ciérrala» va de usted: «ciérrela»" },
  { re: /\btu (folio|registro|usuario|cuenta|veh[ií]culo|nombre|correo|firma|placa)/i, di: "«tu ...» va de usted: «su ...»" },
  { re: /\btus (placas|datos|apellidos)\b/i, di: "«tus ...» va de usted: «sus ...»" },
];

// Líneas que no son texto de cara al usuario.
const NO_ES_PANTALLA = [
  /^\s*(\/\/|\*|\/\*)/,        // comentarios de JS/TS
  /console\.(log|warn|error)/,  // registro técnico
  /^\s*import\s/,               // rutas de importación
];

async function archivos(dir, ext) {
  const salida = [];
  async function recorrer(d) {
    let entradas;
    try { entradas = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      if (["node_modules", ".next", ".git", "out"].includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) await recorrer(p);
      else if (ext.some((x) => e.name.endsWith(x))) salida.push(p);
    }
  }
  await recorrer(dir);
  return salida;
}

const hallazgos = [];
const rel = (p) => path.relative(RAIZ, p).replace(/\\/g, "/");
const anota = (archivo, linea, regla, detalle, texto = "") =>
  hallazgos.push({ archivo, linea, regla, detalle, texto });

// =====================================================================
// REGLA 1 - Tuteo en el texto de las pantallas (D-03, D-05)
// =====================================================================
for (const carpeta of ["app", "components"]) {
  for (const f of await archivos(path.join(RAIZ, carpeta), [".tsx", ".ts"])) {
    const lineas = (await readFile(f, "utf8")).split(/\r?\n/);
    lineas.forEach((linea, i) => {
      if (NO_ES_PANTALLA.some((x) => x.test(linea))) return;
      for (const { re, di } of TUTEO) {
        if (re.test(linea)) anota(rel(f), i + 1, "tuteo en pantalla (CC-07)", di, linea.trim());
      }
    });
  }
}

// =====================================================================
// REGLA 2 - Tuteo en los mensajes de la base (D-07)
//
// Los `raise exception` de los RPC llegan LITERALES a la pantalla. Pero
// un bloque de migración es un REGISTRO HISTÓRICO: no se reescribe, y su
// texto puede estar superado por un bloque posterior. Así que solo se
// revisa el cuerpo VIVO de cada función: el del bloque de número más alto
// que la define. Eso es, además, la única forma de saber qué corre sin
// consultar la base (lección del 18-ago: el repo no es la base).
// =====================================================================
const INICIO_FN = /create\s+or\s+replace\s+function\s+([a-z0-9_]+)/i;
const FIN_FN = /^\s*\$\$\s*(;|language)/i;

const definiciones = new Map(); // función -> { bloque, archivo, cuerpo }

for (const f of await archivos(path.join(RAIZ, "supabase/sql"), [".sql"])) {
  const base = path.basename(f);
  const bloque = Number((base.match(/^(\d+)/) ?? [])[1] ?? -1);
  if (bloque < 0) continue; // no es bloque numerado (seed, limpieza...)
  const lineas = (await readFile(f, "utf8")).split(/\r?\n/);
  let actual = null;
  lineas.forEach((linea, i) => {
    const m = linea.match(INICIO_FN);
    if (m && !actual) actual = { nombre: m[1].toLowerCase(), cuerpo: [] };
    if (!actual) return;
    actual.cuerpo.push({ n: i + 1, txt: linea });
    if (FIN_FN.test(linea) && actual.cuerpo.length > 1) {
      const previo = definiciones.get(actual.nombre);
      if (!previo || bloque >= previo.bloque) {
        definiciones.set(actual.nombre, { bloque, archivo: rel(f), cuerpo: actual.cuerpo });
      }
      actual = null;
    }
  });
}

for (const [nombre, def] of definiciones) {
  for (const { n, txt } of def.cuerpo) {
    if (!/raise\s+exception/i.test(txt)) continue;
    for (const { re, di } of TUTEO) {
      if (re.test(txt)) {
        anota(def.archivo, n, `tuteo en mensaje VIVO de la base (D-07) - función ${nombre}`, di, txt.trim());
      }
    }
  }
}

// =====================================================================
// REGLA 3 - Degradación silenciosa en la capa de datos
//
// D-01, D-04, D-08, D-09 y D-11 fueron el mismo error: un fallo de carga
// que la pantalla presenta como estado vacío legítimo. Nace siempre igual
// -un catch que devuelve un valor de dato- y en la capa de acceso deja a
// quien llama sin forma de distinguir «no cargó» de «vino vacío».
// =====================================================================
const CATCH_QUE_TRAGA = /catch\s*(\([^)]*\))?\s*\{(?:[^{}]|\{[^{}]*\})*?\breturn\b/g;

for (const f of await archivos(path.join(RAIZ, "lib/supabase"), [".ts"])) {
  const contenido = await readFile(f, "utf8");
  for (const m of contenido.matchAll(CATCH_QUE_TRAGA)) {
    if (/\bthrow\b/.test(m[0])) continue; // relanza: correcto
    const linea = contenido.slice(0, m.index).split(/\r?\n/).length;
    anota(rel(f), linea, "degradación silenciosa (D-01/D-04/D-11)",
      "un catch de la capa de datos devuelve un valor en vez de lanzar: quien llama no podrá distinguir «no cargó» de «vino vacío»");
  }
}

// =====================================================================
if (MAPA) {
  console.log("\nCuerpo VIVO de cada función (bloque de número más alto que la define):\n");
  const orden = [...definiciones.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [nombre, def] of orden) {
    console.log(`  ${nombre.padEnd(42)} ${def.archivo.replace("supabase/sql/", "")}`);
  }
  console.log(`\n  ${orden.length} funciones. Este mapa sale del repositorio;`);
  console.log("  para contrastarlo con lo aplicado, consulte pg_proc en la base.\n");
}

if (hallazgos.length === 0) {
  console.log(`Guardián: sin hallazgos (${definiciones.size} funciones SQL vivas revisadas).`);
  process.exit(0);
}

console.error(`\nGuardián: ${hallazgos.length} hallazgo(s).\n`);
for (const h of hallazgos) {
  console.error(`  ${h.archivo}:${h.linea}`);
  console.error(`    ${h.regla}`);
  console.error(`    ${h.detalle}`);
  if (h.texto) console.error(`    > ${h.texto.slice(0, 120)}`);
  console.error("");
}
console.error("Cada regla nació de un defecto real; no se silencia sin explicar por qué.\n");
process.exit(1);
