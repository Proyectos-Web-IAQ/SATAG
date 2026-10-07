// TAGs que un lector casi nunca lee: muchas estancias de esa tarjeta, en ese lote,
// quedan sin salida (o sin entrada). Diagnostico del 7-oct: 26 tarjetas concentraban
// un tercio de las estancias incompletas de los dias normales. No es una regla de
// software que se arregle aqui: es la colocacion del TAG o la antena, y se atiende
// como CASO «La salida no lee el TAG» con esta evidencia.
//
// El emparejamiento sigue a lib/estacionamiento.ts (emparejarEstancias): misma
// tarjeta, mismo dia, mismo lote; repeticion del lector a 2 min (lib/zk/eventos.ts)
// y la misma lectura otra vez a 10 min (REPETICION_ESTANCIA_MIN).
//
// Escribe Campo/datos/<dia>/salida-no-lee-<dia>.json (con numeros de tarjeta: esa
// carpeta esta fuera de git). A la consola solo salen conteos.
//
//   node Campo/herramientas/salida-no-lee.mjs --datos Campo/datos/2026-10-06 [--excluir 2026-09-25,2026-09-28]
import fs from "node:fs";
import path from "node:path";
import { abrir } from "./fuentes.mjs";

const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i < 0 ? null : process.argv[i + 1];
};
const dir = arg("--datos");
if (!dir) throw new Error("Uso: node Campo/herramientas/salida-no-lee.mjs --datos Campo/datos/AAAA-MM-DD [--excluir AAAA-MM-DD,...]");
const dia = path.basename(dir);

// Minimo de estancias en ese lote para opinar, y proporcion incompleta que ya no es azar
// (en E2 lo normal es ~7 %, en E1 ~15 %).
const MIN_ESTANCIAS = 6;
const UMBRAL = 0.5;
const REPETICION_MIN = 2;
const MISMA_LECTURA_MIN = 10;

const diaDe = (s) => s.slice(0, 10);
const minDe = (s) => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16)) + Number(s.slice(17, 19)) / 60;
const loteDe = (p) => (/1\s*$/.test(p) ? "E1" : /2\s*$/.test(p) ? "E2" : null);
const sentidoDe = (p) => (/entrada/i.test(p) ? "entrada" : /salida/i.test(p) ? "salida" : null);

const crudos = abrir(dir).zkEventos();
const dias = [...new Set(crudos.map((e) => diaDe(e.tiempo)).filter(Boolean))].sort();
// El primer y el ultimo dia los corta el archivo; los atipicos los dice quien corre esto.
const excluir = new Set([dias[0], dias[dias.length - 1], ...(arg("--excluir")?.split(",") ?? [])]);

const ev = crudos
  .filter((e) => e.tarjeta && e.tiempo)
  .map((e) => ({
    id: Number(e.id),
    t: e.tiempo,
    dia: diaDe(e.tiempo),
    min: minDe(e.tiempo),
    tarjeta: e.tarjeta,
    lote: loteDe(e.punto),
    sentido: sentidoDe(e.punto),
    concedido: /normal/i.test(e.evento),
  }));

// Repeticiones del lector (igual que marcarRepeticiones).
const porTarjeta = new Map();
for (const e of ev) (porTarjeta.get(e.tarjeta) ?? porTarjeta.set(e.tarjeta, []).get(e.tarjeta)).push(e);
for (const g of porTarjeta.values()) {
  g.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.id - b.id));
  let u = null;
  for (const e of g) {
    e.rep = !!(u && u.dia === e.dia && u.sentido === e.sentido && u.lote === e.lote && u.concedido === e.concedido && e.min - u.min <= REPETICION_MIN);
    if (!e.rep) u = e;
  }
}
const accesos = ev.filter((e) => e.concedido && !e.rep && e.sentido && e.lote && !excluir.has(e.dia));

// Emparejar por tarjeta + dia + lote.
const grupos = new Map();
for (const e of accesos) {
  const k = `${e.tarjeta}|${e.dia}|${e.lote}`;
  (grupos.get(k) ?? grupos.set(k, []).get(k)).push(e);
}
const cuenta = new Map(); // tarjeta|lote -> {estancias, sinSalida, sinEntrada, dias:Set, ultimo}
const sumar = (e, campo) => {
  const k = `${e.tarjeta}|${e.lote}`;
  const o = cuenta.get(k) ?? cuenta.set(k, { tarjeta: e.tarjeta, lote: e.lote, estancias: 0, sinSalida: 0, sinEntrada: 0, dias: new Set(), ultimo: "" }).get(k);
  o.estancias += 1;
  if (campo) o[campo] += 1;
  if (campo) o.dias.add(e.dia);
  if (e.t > o.ultimo) o.ultimo = e.t;
};
for (const g of grupos.values()) {
  g.sort((a, b) => a.min - b.min);
  let abierta = null;
  let previo = null;
  for (const e of g) {
    if (previo && previo.sentido === e.sentido && e.min - previo.min <= MISMA_LECTURA_MIN) continue;
    previo = e;
    if (e.sentido === "entrada") {
      if (abierta) sumar(abierta, "sinSalida");
      abierta = e;
    } else if (abierta) {
      sumar(abierta, null);
      abierta = null;
    } else sumar(e, "sinEntrada");
  }
  if (abierta) sumar(abierta, "sinSalida");
}

const todas = [...cuenta.values()];
const totalInc = todas.reduce((s, o) => s + o.sinSalida + o.sinEntrada, 0);
const cronicas = todas
  .filter((o) => o.estancias >= MIN_ESTANCIAS && (o.sinSalida + o.sinEntrada) / o.estancias >= UMBRAL)
  .map((o) => ({
    tarjeta: o.tarjeta,
    lote: o.lote,
    estancias: o.estancias,
    sinSalida: o.sinSalida,
    sinEntrada: o.sinEntrada,
    proporcion: Math.round(((o.sinSalida + o.sinEntrada) / o.estancias) * 100),
    lector: o.sinSalida >= o.sinEntrada ? `Salida ${o.lote.slice(1)}` : `Entrada ${o.lote.slice(1)}`,
    diasConFalla: o.dias.size,
    ultimoPaso: o.ultimo,
  }))
  .sort((a, b) => b.sinSalida + b.sinEntrada - (a.sinSalida + a.sinEntrada));

const salida = path.join(dir, `salida-no-lee-${dia}.json`);
fs.writeFileSync(
  salida,
  JSON.stringify({ ventana: `${dias[0]} a ${dias[dias.length - 1]}`, excluidos: [...excluir].sort(), umbral: { MIN_ESTANCIAS, UMBRAL }, tarjetas: cronicas }, null, 2),
);
const inc = cronicas.reduce((s, o) => s + o.sinSalida + o.sinEntrada, 0);
console.log(`Dias usados: ${dias.length - excluir.size} (excluidos ${excluir.size}). Estancias incompletas: ${totalInc}.`);
console.log(`TAGs que el lector casi no lee: ${cronicas.length} (E1 ${cronicas.filter((c) => c.lote === "E1").length}, E2 ${cronicas.filter((c) => c.lote === "E2").length}); concentran ${inc} incompletas (${Math.round((inc / totalInc) * 100)} %).`);
console.log(`Escrito: ${salida}`);
