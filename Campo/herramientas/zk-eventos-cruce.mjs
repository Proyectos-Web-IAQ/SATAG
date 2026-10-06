// El cruce final: lo que el analisis del padron dejo abierto y los eventos cierran.
//
// El diagnostico del padron historico llego hasta una banda: entre 855 y 1,630
// vehiculos compitiendo por cajon, y dijo que la banda solo se cierra con el log de
// accesos. Este archivo lo cierra, y comprueba con datos reales tres hipotesis que
// el padron solo podia plantear:
//
//   1. Cuantas credenciales distintas usan el estacionamiento de verdad, y si la
//      cifra de 8 dias se puede proyectar a un mes o si es un piso.
//   2. Quien ocupa un cajon todo el dia. El padron apuntaba al personal, 5 a 1
//      contra los alumnos, pero sin un solo campo de hora para probarlo.
//   3. Como se reparten de hecho entre E1 y E2 las credenciales que pueden elegir.
//      El padron predijo un desequilibrio de hasta 9 a 1 y no podia medirlo.
//
// Las repeticiones del lector ya se colapsan igual que en zk-eventos.mjs: sin eso el
// trafico sale inflado 53% y las estancias se parten en pedazos.
//
// NO IMPRIME DATOS PERSONALES.
//
//   node Campo/herramientas/zk-eventos-cruce.mjs
import fs from "node:fs";
import path from "node:path";

const DATOS = path.join(process.cwd(), "Campo", "datos");
const SALIDA = path.join(DATOS, "padron");

function leer(ruta) {
  const b = fs.readFileSync(ruta);
  if (b[0] === 0xff && b[1] === 0xfe) return b.toString("utf16le");
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.slice(3).toString("utf8");
  return b.toString("utf8");
}
function tsv(ruta) {
  const ls = leer(ruta).split(/\r?\n/).slice(1).filter((l) => l.trim() !== "");
  const cab = ls[0].split("\t").map((c) => c.trim());
  return ls.slice(1).map((l) => {
    const c = l.split("\t");
    return Object.fromEntries(cab.map((k, i) => [k, (c[i] ?? "").trim()]));
  });
}
const tag = (v) => String(v ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "");
const L = (a, b) => console.log("  " + String(a).padEnd(48) + b);
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + "%" : "—");
const med = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const hhmm = (min) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`;

const ev = tsv(path.join(DATOS, "Todos los Eventos_20260929165910.csv"));
for (const e of ev) {
  e.dia = e["Tiempo"].slice(0, 10);
  e.min = +e["Tiempo"].slice(11, 13) * 60 + +e["Tiempo"].slice(14, 16) + (+e["Tiempo"].slice(17, 19)) / 60;
  e.tarjeta = tag(e["Tarjeta"]);
  e.depto = e["Nombre de Departamento"] || "(sin departamento)";
  e.entrada = /Entrada/i.test(e["Punto del Evento"] ?? "");
  e.lote = /Estacionamiento 1/.test(e["Nombre de Dispositivo"] ?? "") ? "E1" : "E2";
  e.ok = /normal|concedid|valid/i.test(e["Descripción del Evento"] ?? "") && !!e.tarjeta;
}
const DEDUP_MIN = 2;
const porTarjeta = new Map();
for (const e of ev.filter((x) => x.ok)) {
  if (!porTarjeta.has(e.tarjeta)) porTarjeta.set(e.tarjeta, []);
  porTarjeta.get(e.tarjeta).push(e);
}
const ok = [];
for (const [, g] of porTarjeta) {
  g.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : a.min - b.min));
  let u = null;
  for (const e of g) {
    if (!(u && u.dia === e.dia && u.entrada === e.entrada && u.lote === e.lote && e.min - u.min <= DEDUP_MIN)) { ok.push(e); u = e; }
  }
}

// --- 1. La curva de credenciales nuevas por dia --------------------------
// Si cada dia siguen apareciendo tarjetas que no se habian visto, 8 dias es un piso
// y no se puede proyectar. Si la curva se aplana, el total mensual esta cerca.
const dias = [...new Set(ok.map((e) => e.dia))].sort();
console.log("\n1. CUANTAS CREDENCIALES DISTINTAS USAN EL ESTACIONAMIENTO\n");
console.log("    dia           del dia   nuevas   acumulado   % nuevas");
const vistas = new Set();
const nuevasPorDia = [];
for (const d of dias) {
  const hoy = new Set(ok.filter((e) => e.dia === d).map((e) => e.tarjeta));
  let nuevas = 0;
  for (const t of hoy) if (!vistas.has(t)) { nuevas += 1; vistas.add(t); }
  nuevasPorDia.push(nuevas);
  console.log("    " + d + String(hoy.size).padStart(9) + String(nuevas).padStart(9) +
    String(vistas.size).padStart(12) + String(pct(nuevas, hoy.size)).padStart(11));
}
console.log();
L("credenciales distintas en la ventana", vistas.size);
// Los dias hábiles completos son los que informan la tendencia; el sabado y el dia
// truncado no dicen nada.
const habiles = dias.filter((d, i) => nuevasPorDia[i] > 5);
const ultimos = nuevasPorDia.slice(-3).filter((n) => n > 5);
const promNuevas = ultimos.reduce((a, b) => a + b, 0) / (ultimos.length || 1);
L("nuevas por dia habil al final de la ventana", promNuevas.toFixed(1));
L("dias habiles observados", habiles.length);
console.log(`\n      Proyeccion a un mes escolar (20 dias habiles), si el ritmo de`);
console.log(`      aparicion de nuevas se mantiene: ${Math.round(vistas.size + promNuevas * (20 - habiles.length))} credenciales.`);
console.log("      Es una proyeccion lineal, no un dato: la curva real se aplana.");

// --- 2. Quien ocupa un cajon todo el dia --------------------------------
const estancias = [];
const porTD = new Map();
for (const e of ok) {
  const k = e.tarjeta + "|" + e.dia;
  if (!porTD.has(k)) porTD.set(k, []);
  porTD.get(k).push(e);
}
for (const [, g] of porTD) {
  g.sort((a, b) => a.min - b.min);
  let abre = null, lote = null;
  for (const e of g) {
    if (e.entrada) { if (abre == null) { abre = e.min; lote = e.lote; } }
    else if (abre != null) { estancias.push({ dur: e.min - abre, depto: e.depto, lote, tarjeta: e.tarjeta, dia: e.dia, entro: abre }); abre = null; }
  }
}
console.log("\n\n2. QUIEN OCUPA UN CAJON TODO EL DIA (estancias emparejadas)\n");
console.log("    departamento               estancias   mediana   >=4h    % >=4h");
const gd = new Map();
for (const s of estancias) { if (!gd.has(s.depto)) gd.set(s.depto, []); gd.get(s.depto).push(s); }
for (const [d, g] of [...gd.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const largas = g.filter((s) => s.dur >= 240).length;
  console.log("    " + String(d).padEnd(26) + String(g.length).padStart(9) +
    String(hhmm(med(g.map((s) => s.dur)))).padStart(10) + String(largas).padStart(7) +
    String(pct(largas, g.length)).padStart(10));
}
const PERSONAL = /Maestro|DOCENTE|Administraci|MANTENIMIENTO|DEPORTES|TEX/i;
const largas = estancias.filter((s) => s.dur >= 240);
const largasPersonal = largas.filter((s) => PERSONAL.test(s.depto)).length;
const largasPadres = largas.filter((s) => /Padres/i.test(s.depto)).length;
console.log();
L("estancias de 4h o mas, en total", largas.length);
L("  de personal (maestros, docentes, admin, servicios)", `${largasPersonal} (${pct(largasPersonal, largas.length)})`);
L("  de padres de familia", `${largasPadres} (${pct(largasPadres, largas.length)})`);
L("  de alumnos", largas.filter((s) => /Alumno/i.test(s.depto)).length);
// Las que cargan el pico de las 14:00: las que ya estaban dentro antes de las 13:00.
const dentroAlPico = estancias.filter((s) => s.entro < 13 * 60 && s.entro + s.dur > 14 * 60);
console.log();
L("estancias que YA estaban dentro a las 14:00", dentroAlPico.length);
L("  de esas, de personal", `${dentroAlPico.filter((s) => PERSONAL.test(s.depto)).length} (${pct(dentroAlPico.filter((s) => PERSONAL.test(s.depto)).length, dentroAlPico.length)})`);

// --- 3. Que eligen los que pueden elegir --------------------------------
const padron = JSON.parse(fs.readFileSync(path.join(SALIDA, "normalizado-29sep.json"), "utf8"));
const ambos = new Set(padron.filter((f) => f.estacionamiento === "AMBOS" && f.tag).map((f) => f.tag));
console.log("\n\n3. QUE ELIGEN LAS CREDENCIALES CON DERECHO A LOS DOS\n");
const conAmbos = [...vistas].filter((t) => ambos.has(t));
L("credenciales activas con derecho a E1 y E2", conAmbos.length);
let soloE1 = 0, soloE2 = 0, mixto = 0;
for (const t of conAmbos) {
  const l = new Set(ok.filter((e) => e.tarjeta === t && e.entrada).map((e) => e.lote));
  if (l.size > 1) mixto += 1; else if (l.has("E1")) soloE1 += 1; else if (l.has("E2")) soloE2 += 1;
}
L("  entraron SIEMPRE por E2", `${soloE2} (${pct(soloE2, conAmbos.length)})`);
L("  entraron SIEMPRE por E1", `${soloE1} (${pct(soloE1, conAmbos.length)})`);
L("  usaron los dos", `${mixto} (${pct(mixto, conAmbos.length)})`);
const entE1 = ok.filter((e) => e.entrada && e.lote === "E1").length;
const entE2 = ok.filter((e) => e.entrada && e.lote === "E2").length;
console.log();
L("desequilibrio real de entradas E2:E1", (entE2 / entE1).toFixed(1) + " a 1");
console.log("      El analisis del padron predijo hasta 9.0 a 1 como escenario");
console.log("      posible con los derechos ya otorgados. Esto es el realizado.");

// --- 4. Las activas contra el padron ------------------------------------
const enHoja = new Set(padron.map((f) => f.tag).filter(Boolean));
console.log("\n\n4. LAS CREDENCIALES ACTIVAS CONTRA EL PADRON\n");
L("expedientes en la hoja", padron.length);
L("credenciales activas en la ventana", vistas.size);
L("  de esas, con expediente en la hoja", [...vistas].filter((t) => enHoja.has(t)).length);
L("  de esas, SIN expediente en la hoja", [...vistas].filter((t) => !enHoja.has(t)).length);
L("expedientes de la hoja que NO se usaron", [...enHoja].filter((t) => !vistas.has(t)).length);

fs.writeFileSync(path.join(SALIDA, "cruce-activas-sin-expediente.txt"),
  [...vistas].filter((t) => !enHoja.has(t)).join("\n"));
console.log("\n  listado en Campo/datos/padron/ (fuera de git)\n");
