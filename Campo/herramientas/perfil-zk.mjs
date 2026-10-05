// Perfil del export de personas de ZKBioSecurity: que columnas trae, cuales
// estan llenas y que valores distintos manejan.
//
// POR QUE. Antes de planear una migracion hay que saber que contiene de verdad
// la fuente, no que columnas tiene. Una columna que existe y esta vacia en el
// 98 % de las filas no es un dato: es una promesa incumplida del sistema que la
// exporto, y planear con ella sale caro.
//
// NO IMPRIME DATOS PERSONALES. Salen conteos y, para las columnas de pocos
// valores distintos (departamento, genero, tipo de usuario), el reparto. De las
// columnas con muchos valores distintos —nombres, placas, telefonos— solo se
// dice cuantas estan llenas y cuantas se repiten, nunca su contenido.
//
//   node Campo/herramientas/perfil-zk.mjs
import fs from "node:fs";
import path from "node:path";

const RUTA = path.join(process.cwd(), "Campo", "datos", "Usuarios_20260908103203.csv");

function leer(ruta) {
  const b = fs.readFileSync(ruta);
  if (b[0] === 0xff && b[1] === 0xfe) return b.toString("utf16le");
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.slice(3).toString("utf8");
  return b.toString("utf8");
}

// El export de ZK sale en UTF-16, separado por tabuladores, y su PRIMERA linea
// es un titulo («Usuarios»), no la cabecera.
const lineas = leer(RUTA).split(/\r?\n/).slice(1).filter((l) => l.trim() !== "");
const cab = lineas[0].split("\t").map((c) => c.trim());
const filas = lineas.slice(1).map((l) => {
  const c = l.split("\t");
  return Object.fromEntries(cab.map((k, i) => [k, (c[i] ?? "").trim()]));
});

console.log(`\n${filas.length} personas, ${cab.length} columnas.\n`);
console.log("COLUMNA                          LLENAS      %   DISTINTOS");

const pocos = [];
for (const c of cab) {
  const vals = filas.map((f) => f[c]).filter((v) => v !== "");
  const dist = new Set(vals);
  const pct = ((vals.length / filas.length) * 100).toFixed(0);
  console.log(
    "  " + c.padEnd(30) + String(vals.length).padStart(6) + String(pct).padStart(7) + "%" +
    String(dist.size).padStart(10),
  );
  // Solo se detalla lo que es claramente una categoria, nunca un dato de
  // persona: con doce valores distintos o menos, no hay forma de identificar a
  // nadie con el reparto.
  if (dist.size > 0 && dist.size <= 12) pocos.push([c, vals]);
}

for (const [c, vals] of pocos) {
  const cuenta = new Map();
  for (const v of vals) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  console.log(`\n${c.toUpperCase()}`);
  for (const [v, n] of [...cuenta.entries()].sort((a, b) => b[1] - a[1])) {
    console.log("  " + String(v).padEnd(32) + String(n).padStart(6));
  }
}

// Lo que ESTE export no puede responder, dicho aqui para que no se planee con
// datos que no existen.
console.log(`
LO QUE ESTE ARCHIVO NO TRAE, y hace falta pedir aparte a ZK:

  · Eventos de acceso (quien paso, por que puerta, cuando). Sin ellos no se
    puede saber que tarjetas llevan tiempo sin usarse ni que estacionamientos
    se usan de verdad. En ZK es el reporte de Transacciones o Eventos.
  · Niveles de acceso por persona: que puerta abre cada tarjeta. La plantilla
    de importacion tampoco los carga, asi que hoy no constan en ningun lado.
  · Estado de la tarjeta (activa, suspendida) y fecha de alta o de baja. Aqui
    solo se deduce por el departamento BAJAS, que es una convencion manual.
`);
