// Uso REAL del estacionamiento, leido de la bitacora de accesos de ZKBioSecurity.
//
// POR QUE ESTE ARCHIVO CAMBIA LA CONVERSACION. Todo lo medido hasta ahora dice a
// quien se le entrego una credencial. Esto dice quien cruzo una pluma. Es la unica
// fuente que puede responder cuantos coches entran de verdad, a que hora, cuanto se
// quedan y cuantas de las credenciales vigentes no se usan nunca. Sin esto,
// «el estacionamiento esta saturado» es una impresion.
//
// DOS LIMITES QUE HAY QUE DECLARAR ANTES DE CUALQUIER CIFRA:
//
//  1. EL EXPORT ESTA TOPADO. ZK corta en 40,000 filas, asi que un solo archivo trae
//     pocos dias, no un anio. Todo lo que salga de aqui vale para SU ventana y no se
//     puede extrapolar a un ciclo escolar sin mas archivos.
//  2. SE ABREN PLUMAS A MANO. La bitacora de operacion registra aperturas remotas
//     desde la consola; esos vehiculos entraron sin dejar tarjeta. La ocupacion real
//     es algo MAYOR que la que se calcula aqui.
//
// Y una trampa del propio archivo: la mayoria de las filas no son accesos. Son
// avisos del lector («Intervalo de operacion muy corto») sin tarjeta asociada.
// Contar filas como entradas multiplica el trafico por varias veces.
//
// NO IMPRIME DATOS PERSONALES: conteos, medianas y distribuciones. Los listados
// nominales se escriben en Campo/datos/padron/, fuera de git.
//
//   node Campo/herramientas/zk-eventos.mjs
import fs from "node:fs";
import path from "node:path";

const DATOS = path.join(process.cwd(), "Campo", "datos");
const SALIDA = path.join(DATOS, "padron");
const ARCHIVO = process.argv[2] ?? "Todos los Eventos_20260929165910.csv";

function leer(ruta) {
  const b = fs.readFileSync(ruta);
  if (b[0] === 0xff && b[1] === 0xfe) return b.toString("utf16le");
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.slice(3).toString("utf8");
  return b.toString("utf8");
}
function tsv(ruta, saltarTitulo = true) {
  const ls = leer(ruta).split(/\r?\n/).slice(saltarTitulo ? 1 : 0).filter((l) => l.trim() !== "");
  const cab = ls[0].split("\t").map((c) => c.trim());
  return ls.slice(1).map((l) => {
    const c = l.split("\t");
    return Object.fromEntries(cab.map((k, i) => [k, (c[i] ?? "").trim()]));
  });
}
const tag = (v) => String(v ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "");
const L = (a, b) => console.log("  " + String(a).padEnd(46) + b);
const tabla = (pares, tope = 99, sangria = "    ") => {
  for (const [k, n] of pares.slice(0, tope)) console.log(sangria + String(k).padEnd(44) + String(n).padStart(7));
};
const cuenta = (arr, f) => {
  const m = new Map();
  for (const x of arr) { const k = f(x); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const med = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + "%" : "—");
const hhmm = (min) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`;

const ev = tsv(path.join(DATOS, ARCHIVO));
const CAP = 40000;

for (const e of ev) {
  e.t = e["Tiempo"];
  e.dia = e.t.slice(0, 10);
  e.hora = Number(e.t.slice(11, 13));
  e.min = Number(e.t.slice(11, 13)) * 60 + Number(e.t.slice(14, 16)) + Number(e.t.slice(17, 19)) / 60;
  e.tarjeta = tag(e["Tarjeta"]);
  e.depto = e["Nombre de Departamento"] || "(sin departamento)";
  e.punto = e["Punto del Evento"] || "(sin punto)";
  e.lote = /1$/.test(e["Nombre de Dispositivo"] ?? "") || /Estacionamiento 1/.test(e["Nombre de Dispositivo"] ?? "") ? "E1" : "E2";
  e.desc = e["Descripción del Evento"] || "";
  e.entrada = /Entrada/i.test(e.punto);
}

const dias = [...new Set(ev.map((e) => e.dia))].sort();
console.log("\nLA VENTANA QUE TRAJO EL EXPORT\n");
L("filas de evento", ev.length);
if (ev.length >= CAP) console.log("  *** TOPE ALCANZADO: ZK corta en 40,000 filas. Faltan dias. ***");
L("desde", ev.map((e) => e.t).sort()[0]);
L("hasta", ev.map((e) => e.t).sort()[ev.length - 1]);
L("dias distintos con actividad", dias.length);
console.log("    " + dias.join("  "));

console.log("\n\nQUE SON ESAS 40,000 FILAS\n");
tabla(cuenta(ev, (e) => e.desc), 14);

// La separacion que lo decide todo: una fila con tarjeta es una persona; una fila
// sin tarjeta es el lector hablando solo.
const conTarjeta = ev.filter((e) => e.tarjeta);
console.log();
L("filas CON tarjeta (gente)", `${conTarjeta.length} (${pct(conTarjeta.length, ev.length)})`);
L("filas SIN tarjeta (ruido del lector)", `${ev.length - conTarjeta.length} (${pct(ev.length - conTarjeta.length, ev.length)})`);

// Accesos concedidos de verdad.
const okBruto = conTarjeta.filter((e) => /normal|concedid|valid/i.test(e.desc));
const negados = conTarjeta.filter((e) => !/normal|concedid|valid/i.test(e.desc));

// EL LECTOR LEE VARIAS VECES EL MISMO COCHE, y esto no es un detalle: en bruto hay
// 5,015 salidas contra 3,493 entradas, un exceso de 1,522 salidas que fisicamente no
// puede ser. Medido, hay 3,064 salidas repetidas de la misma tarjeta en menos de dos
// minutos: la doble lectura explica el exceso dos veces sobre. Al colapsar las
// rafagas, entradas y salidas quedan casi iguales, que es lo que tiene que pasar en
// un estacionamiento. Sin este paso el trafico sale inflado ~75% y la ocupacion es
// ficcion.
const DEDUP_MIN = 2;
function colapsar(eventos) {
  const porTarjeta = new Map();
  for (const e of eventos) {
    if (!porTarjeta.has(e.tarjeta)) porTarjeta.set(e.tarjeta, []);
    porTarjeta.get(e.tarjeta).push(e);
  }
  const out = [];
  for (const [, g] of porTarjeta) {
    g.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : a.min - b.min));
    let ultimo = null;
    for (const e of g) {
      const rafaga = ultimo && ultimo.dia === e.dia && ultimo.entrada === e.entrada
        && ultimo.lote === e.lote && e.min - ultimo.min <= DEDUP_MIN;
      if (!rafaga) { out.push(e); ultimo = e; }
    }
  }
  return out;
}
const ok = colapsar(okBruto);

console.log();
L("accesos concedidos, en bruto", okBruto.length);
L(`de esos, repeticiones del lector (< ${DEDUP_MIN} min)`, `${okBruto.length - ok.length} (${pct(okBruto.length - ok.length, okBruto.length)})`);
L("ACCESOS REALES tras colapsar repeticiones", ok.length);
L("eventos con tarjeta que NO son acceso concedido", negados.length);
if (negados.length) tabla(cuenta(negados, (e) => e.desc), 8, "      ");
L("  tarjetas distintas rechazadas", new Set(negados.map((e) => e.tarjeta)).size);

console.log("\n\nTRAFICO REAL POR DIA (accesos concedidos)\n");
console.log("    dia           total    entradas    salidas    tarjetas distintas");
for (const d of dias) {
  const g = ok.filter((e) => e.dia === d);
  console.log("    " + d + String(g.length).padStart(9) +
    String(g.filter((e) => e.entrada).length).padStart(12) +
    String(g.filter((e) => !e.entrada).length).padStart(11) +
    String(new Set(g.map((e) => e.tarjeta)).size).padStart(11));
}

console.log("\n\nPOR ESTACIONAMIENTO Y PUNTO (accesos concedidos)\n");
tabla(cuenta(ok, (e) => `${e.lote} · ${e.punto}`));
console.log();
for (const lote of ["E1", "E2"]) {
  const g = ok.filter((e) => e.lote === lote);
  const ent = g.filter((e) => e.entrada).length, sal = g.length - ent;
  L(`${lote}: entradas / salidas`, `${ent} / ${sal}` + (sal ? `  (desbalance ${(((ent - sal) / ent) * 100).toFixed(0)}%)` : ""));
  L(`${lote}: tarjetas distintas`, new Set(g.map((e) => e.tarjeta)).size);
}

console.log("\n\nA QUE HORA SE USA (entradas concedidas, todos los dias juntos)\n");
const porHora = new Map();
for (const e of ok.filter((x) => x.entrada)) porHora.set(e.hora, (porHora.get(e.hora) ?? 0) + 1);
const maxHora = Math.max(...porHora.values());
for (const h of [...porHora.keys()].sort((a, b) => a - b)) {
  const n = porHora.get(h);
  console.log("    " + String(h).padStart(2, "0") + ":00  " + String(n).padStart(5) + "  " + "#".repeat(Math.round((n / maxHora) * 46)));
}

// --- Ocupacion simultanea ------------------------------------------------
// El numero que de verdad define saturacion: cuantos coches hay dentro a la vez.
// Se reconstruye sumando entradas y restando salidas en orden. Si las salidas no se
// registran bien, la cuenta se va hacia arriba y hay que decirlo: por eso arriba se
// mide el desbalance entrada/salida.
console.log("\n\nOCUPACION SIMULTANEA RECONSTRUIDA\n");
console.log("    dia          E1 pico  (hora)     E2 pico  (hora)    total pico");
for (const d of dias) {
  const fila = [];
  for (const lote of ["E1", "E2"]) {
    const g = ok.filter((e) => e.dia === d && e.lote === lote).sort((a, b) => a.min - b.min);
    let cur = 0, pico = 0, horaPico = null;
    for (const e of g) {
      cur += e.entrada ? 1 : -1;
      if (cur > pico) { pico = cur; horaPico = e.t.slice(11, 16); }
    }
    fila.push([pico, horaPico]);
  }
  const g = ok.filter((e) => e.dia === d).sort((a, b) => a.min - b.min);
  let cur = 0, pico = 0;
  for (const e of g) { cur += e.entrada ? 1 : -1; if (cur > pico) pico = cur; }
  console.log("    " + d +
    String(fila[0][0]).padStart(9) + "  " + String(fila[0][1] ?? "—").padEnd(10) +
    String(fila[1][0]).padStart(8) + "  " + String(fila[1][1] ?? "—").padEnd(9) +
    String(pico).padStart(8));
}
console.log("\n  Advertencia: si el desbalance entrada/salida es alto, el pico esta");
console.log("  sobreestimado porque faltan salidas que nunca se registraron.");

// --- Cuanto se quedan ----------------------------------------------------
// Emparejar cada entrada con la siguiente salida de la MISMA tarjeta el MISMO dia.
const estancias = [];
const porTarjetaDia = new Map();
for (const e of ok) {
  const k = e.tarjeta + "|" + e.dia;
  if (!porTarjetaDia.has(k)) porTarjetaDia.set(k, []);
  porTarjetaDia.get(k).push(e);
}
for (const [, g] of porTarjetaDia) {
  g.sort((a, b) => a.min - b.min);
  let abierta = null;
  for (const e of g) {
    if (e.entrada) { if (abierta == null) abierta = e.min; }
    else if (abierta != null) { estancias.push(e.min - abierta); abierta = null; }
  }
}
console.log("\n\nCUANTO SE QUEDAN (entrada emparejada con su salida, mismo dia)\n");
L("estancias que se pudieron emparejar", estancias.length);
if (estancias.length) {
  const s = [...estancias].sort((a, b) => a - b);
  L("mediana", hhmm(med(estancias)));
  L("promedio", hhmm(estancias.reduce((a, b) => a + b, 0) / estancias.length));
  L("el 25% mas corto / el 25% mas largo", hhmm(s[Math.floor(s.length * 0.25)]) + " / " + hhmm(s[Math.floor(s.length * 0.75)]));
  const cortas = estancias.filter((x) => x <= 30).length;
  const largas = estancias.filter((x) => x >= 240).length;
  L("de 30 minutos o menos (dejar y recoger)", `${cortas} (${pct(cortas, estancias.length)})`);
  L("de 4 horas o mas (ocupan el cajon el dia)", `${largas} (${pct(largas, estancias.length)})`);
}

// --- Quien usa el estacionamiento ---------------------------------------
console.log("\n\nQUIEN USA EL ESTACIONAMIENTO (departamento del evento)\n");
console.log("    departamento                 accesos   tarjetas   entradas/tarjeta");
const deptos = cuenta(ok, (e) => e.depto);
for (const [d, n] of deptos) {
  const g = ok.filter((e) => e.depto === d);
  const t = new Set(g.map((e) => e.tarjeta)).size;
  const ent = g.filter((e) => e.entrada).length;
  console.log("    " + String(d).padEnd(28) + String(n).padStart(8) + String(t).padStart(11) +
    String((ent / t).toFixed(1)).padStart(15));
}

const vistas = new Set(ok.map((e) => e.tarjeta));
console.log();
L("tarjetas distintas que cruzaron una pluma", vistas.size);
L("entradas por tarjeta en la ventana", (ok.filter((e) => e.entrada).length / vistas.size).toFixed(1));

// --- Cruce con el universo de credenciales -------------------------------
const zk = tsv(path.join(DATOS, "Usuarios_20260908103203.csv"));
const vigentesZk = zk.filter((p) => p["ID de Departamento"] !== "10").map((p) => tag(p["Tarjeta"])).filter(Boolean);
const setVig = new Set(vigentesZk);
const bajasZk = new Set(zk.filter((p) => p["ID de Departamento"] === "10").map((p) => tag(p["Tarjeta"])).filter(Boolean));

console.log("\n\nCREDENCIALES CONTRA USO REAL\n");
L("vigentes en ZK al 8-sep", setVig.size);
const vigUsadas = [...setVig].filter((t) => vistas.has(t));
L(`vigentes que se usaron en estos ${dias.length} dias`, `${vigUsadas.length} (${pct(vigUsadas.length, setVig.size)})`);
L("vigentes que NO aparecen ni una vez", setVig.size - vigUsadas.length);
console.log(`      Con solo ${dias.length} dias esto NO prueba desuso: hay que repetirlo`);
console.log("      con un ciclo completo antes de proponerle una baja a nadie.");

// Lo que si es concluyente en una ventana corta: lo que NO deberia haber pasado.
const bajasUsadas = [...vistas].filter((t) => bajasZk.has(t));
console.log();
L("tarjetas de BAJAS que cruzaron una pluma", bajasUsadas.length);
const stock = ok.filter((e) => /STOCK/i.test(e.depto));
L("accesos con tarjeta de STOCK SATAG", `${stock.length} (${new Set(stock.map((e) => e.tarjeta)).size} tarjetas)`);
const desconocidas = [...vistas].filter((t) => !setVig.has(t) && !bajasZk.has(t));
L("tarjetas usadas que no estan en el export del 8-sep", desconocidas.length);
console.log("      (altas posteriores al 8-sep: mide cuanto se mueve el padron en tres semanas)");

// --- Atipicos de operacion ----------------------------------------------
console.log("\n\nRUIDO Y ATIPICOS DE OPERACION\n");
const corto = ev.filter((e) => /muy corto/i.test(e.desc));
L("avisos de «intervalo de operacion muy corto»", `${corto.length} (${pct(corto.length, ev.length)})`);
tabla(cuenta(corto, (e) => `${e.lote} · ${e.punto}`), 6, "      ");
console.log();
const topTarjeta = cuenta(ok.filter((e) => e.entrada), (e) => e.tarjeta);
if (topTarjeta.length) {
  L("entradas de la tarjeta mas activa", `${topTarjeta[0][1]} en ${dias.length} dias`);
  const muchas = topTarjeta.filter(([, n]) => n >= dias.length * 3).length;
  L(`tarjetas con 3+ entradas por dia de promedio`, muchas);
}

fs.mkdirSync(SALIDA, { recursive: true });
const vol = (n, filas) => fs.writeFileSync(path.join(SALIDA, n), filas.join("\n"));
vol("eventos-vigentes-sin-uso-en-la-ventana.txt", [...setVig].filter((t) => !vistas.has(t)));
vol("eventos-tarjetas-de-bajas-que-entraron.txt", bajasUsadas);
vol("eventos-tarjetas-usadas-fuera-del-padron-zk.txt", desconocidas);
console.log("\n  listados en Campo/datos/padron/ (fuera de git)\n");
