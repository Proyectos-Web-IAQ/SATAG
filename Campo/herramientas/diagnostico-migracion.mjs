// Diagnostico de la migracion: cuantos vehiculos hay en cada fuente, cuantos
// son el mismo y cuantos no se pueden reconciliar.
//
// POR QUE EXISTE. Antes de mover un solo expediente a SATAG hay que saber contra
// que se esta peleando. Hoy el padron vive en tres sitios —la hoja de calculo
// historica, ZKBioSecurity y SATAG— y nadie tiene el numero de cuantos son en
// realidad ni cuantos estan repetidos entre ellos. Ese numero es el que decide
// si la migracion es una tarde o dos semanas.
//
// NO IMPRIME UN SOLO DATO PERSONAL. A la consola salen conteos; los listados que
// hacen falta para trabajar se escriben a Campo/datos/, que esta en .gitignore.
// Este archivo si se versiona porque es codigo, no datos.
//
//   node Campo/herramientas/diagnostico-migracion.mjs
//
// LA LLAVE ES EL NUMERO DE TAG. En la hoja es «No de TAG»; en ZK es «Tarjeta»
// (la placa de ZK viaja en «Celular», cosa del puente, no un error). Es la unica
// columna que existe en las tres fuentes y que identifica al dispositivo, que es
// lo que de verdad se esta migrando.
import fs from "node:fs";
import path from "node:path";

const DATOS = path.join(process.cwd(), "Campo", "datos");
const HOJA = path.join(DATOS, "Registros.csv");
const ZK = path.join(DATOS, "Usuarios_20260908103203.csv");

// --- Lectura -------------------------------------------------------------

// Los exports de ZK salen en UTF-16 y los de la hoja en UTF-8. Se detecta por la
// marca de orden de bytes en vez de suponerlo: suponerlo da una cabecera con un
// caracter nulo entre cada letra y un diagnostico que no encuentra nada.
function leer(ruta) {
  const b = fs.readFileSync(ruta);
  if (b[0] === 0xff && b[1] === 0xfe) return b.toString("utf16le");
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.slice(3).toString("utf8");
  return b.toString("utf8");
}

// Partidor de CSV que respeta las comillas: hay nombres con coma dentro.
function partir(linea, sep) {
  const out = [];
  let campo = "", comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (comillas && linea[i + 1] === '"') { campo += '"'; i++; }
      else comillas = !comillas;
    } else if (c === sep && !comillas) { out.push(campo); campo = ""; }
    else campo += c;
  }
  out.push(campo);
  return out.map((s) => s.trim());
}

function tabla(ruta, { saltar = 0 } = {}) {
  const lineas = leer(ruta).split(/\r?\n/).slice(saltar).filter((l) => l.trim() !== "");
  const sep = (lineas[0].match(/\t/g) || []).length > (lineas[0].match(/,/g) || []).length ? "\t" : ",";
  const cab = partir(lineas[0], sep);
  return lineas.slice(1).map((l) => {
    const campos = partir(l, sep);
    return Object.fromEntries(cab.map((c, i) => [c, campos[i] ?? ""]));
  });
}

// --- Normalizacion -------------------------------------------------------

// El numero de TAG se compara sin espacios ni ceros a la izquierda: la hoja se
// llena a mano y ZK exporta lo que le cargaron, asi que el mismo dispositivo
// aparece como «13078010» y como « 13078010 » segun quien lo escribio.
const tag = (v) => String(v ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "");
const placa = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function inventario(filas, campo, normaliza) {
  const buenos = new Set(), repetidos = new Map();
  let vacios = 0;
  for (const f of filas) {
    const v = normaliza(f[campo]);
    if (!v) { vacios += 1; continue; }
    if (buenos.has(v)) repetidos.set(v, (repetidos.get(v) ?? 1) + 1);
    buenos.add(v);
  }
  return { unicos: buenos, vacios, repetidos };
}

// --- Diagnostico ---------------------------------------------------------

const hoja = tabla(HOJA);
const zk = tabla(ZK, { saltar: 1 }); // la primera linea de ZK es el titulo

const tHoja = inventario(hoja, "No de TAG", tag);
const tZk = inventario(zk, "Tarjeta", tag);

const enAmbos = [...tHoja.unicos].filter((t) => tZk.unicos.has(t));
const soloHoja = [...tHoja.unicos].filter((t) => !tZk.unicos.has(t));
const soloZk = [...tZk.unicos].filter((t) => !tHoja.unicos.has(t));

const pHoja = inventario(hoja, "Vehiculo (Placas)", placa);
const pZk = inventario(zk, "Celular", placa); // el puente mete la placa aqui

const linea = (a, b) => console.log("  " + String(a).padEnd(48) + b);

console.log("\nFUENTES\n");
linea("hoja de calculo: filas", hoja.length);
linea("hoja de calculo: TAG distintos", tHoja.unicos.size);
linea("hoja de calculo: filas sin TAG", tHoja.vacios);
linea("hoja de calculo: TAG repetidos", tHoja.repetidos.size);
console.log();
linea("ZK: personas", zk.length);
linea("ZK: tarjetas distintas", tZk.unicos.size);
linea("ZK: personas sin tarjeta", tZk.vacios);
linea("ZK: tarjetas repetidas", tZk.repetidos.size);

console.log("\nCRUCE POR NUMERO DE TAG\n");
linea("en las DOS fuentes", enAmbos.length);
linea("solo en la hoja (ZK no lo conoce)", soloHoja.length);
linea("solo en ZK (la hoja no lo tiene)", soloZk.length);
linea("universo de TAG distintos", new Set([...tHoja.unicos, ...tZk.unicos]).size);

// ZK NO es el padron del estacionamiento: es el control de acceso completo del
// Instituto, con las credenciales de puerta de todo el personal. Por eso tiene
// mas tarjetas que vehiculos hay. Tomar su total como «vehiculos que faltan»
// seria inventarse mil coches. El discriminador es la placa, que el puente
// guarda en Celular: sin placa, esa tarjeta no abre una pluma, abre una puerta.
const conPlaca = new Set(zk.filter((f) => placa(f["Celular"])).map((f) => tag(f["Tarjeta"])).filter(Boolean));
const zkSoloConPlaca = soloZk.filter((t) => conPlaca.has(t));

console.log("\nDE LAS QUE SOLO ESTAN EN ZK\n");
linea("con placa: candidatas a vehiculo real", zkSoloConPlaca.length);
linea("sin placa: credencial de acceso, no vehiculo", soloZk.length - zkSoloConPlaca.length);

// El desglose por departamento dice que ES cada cosa en ZK.
const porDepto = new Map();
for (const f of zk) {
  const d = (f["Nombre de Departamento"] || "(sin departamento)").trim();
  const e = porDepto.get(d) ?? { total: 0, conPlaca: 0 };
  e.total += 1;
  if (placa(f["Celular"])) e.conPlaca += 1;
  porDepto.set(d, e);
}
console.log("\nZK POR DEPARTAMENTO (total / con placa)\n");
for (const [d, e] of [...porDepto.entries()].sort((a, b) => b[1].total - a[1].total)) {
  linea(d, e.total + " / " + e.conPlaca);
}

// Las filas de la hoja sin numero de TAG: la placa es el unico rescate.
const sinTag = hoja.filter((f) => !tag(f["No de TAG"]));
const sinTagConPlaca = sinTag.filter((f) => placa(f["Vehiculo (Placas)"]));
const rescatables = sinTagConPlaca.filter((f) => pZk.unicos.has(placa(f["Vehiculo (Placas)"])));

console.log("\nLAS FILAS DE LA HOJA SIN NUMERO DE TAG\n");
linea("sin TAG, en total", sinTag.length);
linea("de esas, con placa escrita", sinTagConPlaca.length);
linea("de esas, cuya placa SI esta en ZK", rescatables.length);
linea("irrecuperables por ahora", sinTag.length - rescatables.length);

// Los listados de trabajo, fuera de git.
const salida = path.join(DATOS, "diagnostico-migracion");
fs.mkdirSync(salida, { recursive: true });
fs.writeFileSync(path.join(salida, "solo-en-la-hoja.txt"), soloHoja.sort().join("\n"));
fs.writeFileSync(path.join(salida, "solo-en-zk-con-placa.txt"), zkSoloConPlaca.sort().join("\n"));
fs.writeFileSync(path.join(salida, "en-ambas.txt"), enAmbos.sort().join("\n"));
fs.writeFileSync(path.join(salida, "hoja-tag-repetidos.txt"),
  [...tHoja.repetidos.entries()].map(([t, n]) => `${t}\t${n}`).join("\n"));

console.log("\nListados en Campo/datos/diagnostico-migracion/ (fuera de git).\n");
