// Que se hace a mano en ZKBioSecurity, medido desde su propia bitacora de operacion.
//
// POR QUE EXISTE. El caso de SATAG no se sostiene con opiniones sobre lo tedioso que
// es ZK: se sostiene con el conteo de operaciones manuales que alguien ejecuto de
// verdad. Esta bitacora es el registro de la consola de administracion —quien edito,
// quien exporto, quien abrio una pluma a mano—, NO el registro de accesos. Son dos
// exports distintos y confundirlos lleva a afirmar ocupacion del estacionamiento con
// datos que no la contienen.
//
// Lo que si responde: cuanto trabajo manual cuesta operar el padron hoy, cuantas
// veces se abrio una pluma desde la consola (que es un acceso sin vehiculo
// identificado), y cuantas cuentas distintas existen para auditar quien hizo que.
//
// NO IMPRIME DATOS PERSONALES. Los ID de persona y numeros de tarjeta que la
// bitacora trae en la columna Contenido no se imprimen nunca: solo se cuentan.
//
//   node Campo/herramientas/zk-bitacora.mjs
import fs from "node:fs";
import path from "node:path";

const DATOS = path.join(process.cwd(), "Campo", "datos");
const ARCHIVO = process.argv[2] ?? "Bitácora de Eventos_20260929162610.csv";

function leer(ruta) {
  const b = fs.readFileSync(ruta);
  if (b[0] === 0xff && b[1] === 0xfe) return b.toString("utf16le");
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.slice(3).toString("utf8");
  return b.toString("utf8");
}

// La primera linea del export de ZK es un titulo, no la cabecera.
const lineas = leer(path.join(DATOS, ARCHIVO)).split(/\r?\n/).slice(1).filter((l) => l.trim() !== "");
const cab = lineas[0].split("\t").map((c) => c.trim());
const ops = lineas.slice(1).map((l) => {
  const c = l.split("\t");
  return Object.fromEntries(cab.map((k, i) => [k, (c[i] ?? "").trim()]));
});

const C = {
  usuario: cab.find((c) => /Usuario/i.test(c)),
  tiempo: cab.find((c) => /Tiempo/i.test(c)),
  ip: cab.find((c) => /IP/i.test(c)),
  modulo: cab.find((c) => /dulo/i.test(c)),
  objeto: cab.find((c) => /Objeto/i.test(c)),
  tipo: cab.find((c) => /Tipo/i.test(c)),
  contenido: cab.find((c) => /Contenido/i.test(c)),
  resultado: cab.find((c) => /Resultado/i.test(c)),
};

const mes = (t) => String(t ?? "").slice(0, 7);
const cuenta = (arr, f) => {
  const m = new Map();
  for (const x of arr) { const k = f(x); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const L = (a, b) => console.log("  " + String(a).padEnd(44) + b);
const tabla = (pares, tope = 99) => {
  for (const [k, n] of pares.slice(0, tope)) console.log("    " + String(k).padEnd(42) + String(n).padStart(6));
};

const fechas = ops.map((o) => o[C.tiempo]).filter(Boolean).sort();

console.log("\nLA BITACORA\n");
L("operaciones registradas", ops.length);
L("desde", fechas[0]);
L("hasta", fechas[fechas.length - 1]);

// Una sola cuenta compartida es un hallazgo de gobierno, no de rendimiento: sin
// cuentas por persona no hay a quien preguntarle por un alta mal hecha.
const usuarios = cuenta(ops, (o) => o[C.usuario]);
const ips = cuenta(ops, (o) => o[C.ip]);
console.log("\nQUIEN OPERA\n");
L("cuentas distintas", usuarios.length);
tabla(usuarios);
L("direcciones IP distintas desde esa cuenta", ips.length);

console.log("\nQUE SE TOCA (objeto de la operacion)\n");
tabla(cuenta(ops, (o) => `${o[C.modulo]} / ${o[C.objeto]}`), 14);

console.log("\nQUE SE HACE (tipo de operacion)\n");
tabla(cuenta(ops, (o) => o[C.tipo]), 16);

const fallidas = ops.filter((o) => /fallido/i.test(o[C.resultado] ?? ""));
console.log("\nOPERACIONES QUE FALLARON\n");
L("total fallidas", fallidas.length);
tabla(cuenta(fallidas, (o) => `${o[C.objeto]} · ${o[C.tipo]}`));

// --- El trabajo manual sobre el padron -----------------------------------
const esPersona = (o) => /Usuarios/i.test(o[C.objeto] ?? "") && /Personal|Acceso/i.test(o[C.modulo] ?? "");
const manual = ops.filter((o) => esPersona(o) && /Editar|Nuevo|Borrar|Cambiar/i.test(o[C.tipo] ?? ""));
console.log("\nTRABAJO MANUAL SOBRE EL PADRON\n");
L("altas, ediciones, bajas y cambios de depto", manual.length);
L("de esas: altas (Nuevo)", manual.filter((o) => /Nuevo/i.test(o[C.tipo])).length);
L("de esas: ediciones (Editar)", manual.filter((o) => /Editar/i.test(o[C.tipo])).length);
L("de esas: bajas (Borrar)", manual.filter((o) => /Borrar/i.test(o[C.tipo])).length);
L("de esas: cambios de departamento", manual.filter((o) => /Cambiar/i.test(o[C.tipo])).length);

// Un «Cambiar de Departamento» puede mover a una persona o a diecisiete: el
// contenido trae la lista de ID separada por comas y luego /departamento. Contar
// operaciones subestima el trabajo; hay que contar personas movidas.
const cambios = ops.filter((o) => /Cambiar/i.test(o[C.tipo] ?? ""));
let movidas = 0, loteMax = 0;
for (const o of cambios) {
  const izq = String(o[C.contenido] ?? "").split("/")[0];
  const n = izq.split(",").filter((s) => /\d/.test(s)).length;
  movidas += n;
  if (n > loteMax) loteMax = n;
}
L("personas movidas de departamento en total", movidas);
L("el lote mas grande de un solo movimiento", loteMax + " personas");

console.log("\n  trabajo manual por mes (altas/ediciones/bajas/cambios)\n");
tabla(cuenta(manual, (o) => mes(o[C.tiempo])).sort((a, b) => a[0].localeCompare(b[0])));

// --- Aperturas de pluma desde la consola ---------------------------------
// Cada una es un vehiculo que entro SIN que su tarjeta quedara registrada: es el
// hueco que va a tener cualquier medicion de ocupacion basada en eventos.
const remotas = ops.filter((o) => /Apertura Remota|Cerrado Remoto/i.test(o[C.tipo] ?? ""));
console.log("\nPLUMAS ABIERTAS O CERRADAS A MANO DESDE LA CONSOLA\n");
L("operaciones remotas sobre plumas", remotas.length);
L("de esas, aperturas", remotas.filter((o) => /Apertura/i.test(o[C.tipo])).length);
console.log("\n  por pluma\n");
tabla(cuenta(remotas, (o) => o[C.contenido] || "(sin puerta)"));
console.log("\n  por mes\n");
tabla(cuenta(remotas, (o) => mes(o[C.tiempo])).sort((a, b) => a[0].localeCompare(b[0])));

// --- El baile de los niveles de acceso -----------------------------------
// Cambiar los niveles de un departamento exige quitarlos y volverlos a poner. Cada
// par quitar/poner separado por segundos es una ejecucion de ese procedimiento.
const niveles = ops.filter((o) => /Niveles/i.test(o[C.tipo] ?? "") || /Niveles/i.test(o[C.objeto] ?? ""));
console.log("\nNIVELES DE ACCESO (el procedimiento de quitar y volver a poner)\n");
L("operaciones sobre niveles", niveles.length);
tabla(cuenta(niveles, (o) => o[C.tipo]));

const orden = [...niveles].sort((a, b) => String(a[C.tiempo]).localeCompare(String(b[C.tiempo])));
let pares = 0;
const seg = (t) => { const m = String(t).match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/); return m ? Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`) / 1000 : 0; };
for (let i = 1; i < orden.length; i++) {
  const a = orden[i - 1], b = orden[i];
  const quitarLuegoPoner = /Borrar/i.test(a[C.tipo] ?? "") && /Agregar/i.test(b[C.tipo] ?? "");
  const mismoContenido = (a[C.contenido] ?? "") === (b[C.contenido] ?? "");
  if (quitarLuegoPoner && mismoContenido && seg(b[C.tiempo]) - seg(a[C.tiempo]) <= 120) pares += 1;
}
L("veces que se ejecuto quitar+poner (< 2 min)", pares);

// A que estacionamiento se le dio acceso a cada departamento, leido de las
// operaciones «Agregar a los Niveles»: es la politica de acceso vigente, y no
// consta en ningun otro export.
const asigna = niveles.filter((o) => /Agregar/i.test(o[C.tipo] ?? "") && (o[C.contenido] ?? "").includes(";"));
const politica = new Map();
for (const o of asigna.sort((a, b) => String(a[C.tiempo]).localeCompare(String(b[C.tiempo])))) {
  const [depto, lotes] = String(o[C.contenido]).split(";");
  politica.set(depto.trim(), { lotes: lotes.trim(), cuando: String(o[C.tiempo]).slice(0, 10) });
}
console.log("\nPOLITICA DE ACCESO POR DEPARTAMENTO (ultima asignacion vista)\n");
for (const [d, v] of [...politica.entries()].sort()) {
  console.log("    " + d.padEnd(26) + v.lotes.padEnd(40) + v.cuando);
}
console.log();
