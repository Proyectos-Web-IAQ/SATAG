// Paso 3 de la depuracion del 6-oct: de TAGs a PERSONAS.
//
// POR QUE. Hasta aqui todo se cruzaba por numero de TAG, y una persona con tres TAGs
// eran tres renglones: los dos que ya no usa seguian con derecho a la pluma y nadie lo
// veia. Aqui cada persona junta todos sus TAGs, sus expedientes de SATAG, su familia y
// su puesto en GES, y sale UNA propuesta de que hacer con ella.
//
// COMO SE JUNTAN LOS TAGS (cada liga queda en la pestana «Evidencia»):
//   - mismo nombre (regla estricta de nombres.mjs: un nombre de dos palabras no basta);
//   - SATAG: el TAG anterior de un expediente;
//   - la hoja o el nombre en ZK mencionan el numero del otro TAG (reposiciones);
//   - mismo coche: misma placa, o los dos TAGs se leen a <= 5 s en el mismo lector en
//     dos dias o mas. El coche solo junta si los nombres son compatibles: dos esposos
//     con el mismo coche son dos personas, y eso queda como evidencia de familia.
//
// QUIEN ES QUIEN lo dice GES (familias y personal); lo que se decidio en la
// conversacion manda (decisiones-nombres.csv y decisiones-personas.csv).
//
// Produce Campo/datos/<dia>/personas-<dia>.xlsx. A la consola solo salen conteos.
//
//   node Campo/herramientas/personas.mjs --datos Campo/datos/2026-10-06
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { abrir, ges as abrirGes, escribirXlsx, RAIZ } from "./fuentes.mjs";
import { comparar, DECISION_POR_CLASE, palabras, separarNota, canonico, titulo } from "./nombres.mjs";

const i = process.argv.indexOf("--datos");
if (i < 0) throw new Error("Uso: node Campo/herramientas/personas.mjs --datos Campo/datos/AAAA-MM-DD");
const dir = process.argv[i + 1];
const dia = path.basename(dir);
const F = abrir(dir);
const G = abrirGes(dir);
const X = createRequire(path.join(RAIZ, "package.json"))("xlsx");

// Seis meses de espera para los dormidos (Gerardo y el contador, 6-oct).
const FIN_OBSERVACION = (() => {
  const d = new Date(`${dia}T12:00:00`);
  d.setMonth(d.getMonth() + 6);
  return d.toISOString().slice(0, 10);
})();

// ---------------------------------------------------------------------------
// Fuentes
// ---------------------------------------------------------------------------
const zk = F.zkPersonas();
const hoja = F.hoja();
const satag = F.satag();
const privilegios = F.zkPrivilegios();
const eventos = F.zkEventos();
const ultimaPos = F.zkUltimaPosicion();
const familias = G.familias();
const personal = G.personal();
const empleados = G.empleados();

const leerCsv = (n) => {
  const ruta = path.join(F.DATOS, n);
  if (!fs.existsSync(ruta)) return [];
  const l = X.read(fs.readFileSync(ruta, "utf8"), { type: "string", raw: true });
  return X.utils.sheet_to_json(l.Sheets[l.SheetNames[0]], { defval: "", raw: false });
};
const decNombre = new Map(leerCsv("decisiones-nombres.csv").map((r) => [String(r.TAG).trim(), r]));
const decPersona = new Map(leerCsv("decisiones-personas.csv").map((r) => [String(r.TAG).trim(), r]));

const zkPorTag = new Map(zk.map((r) => [r.tarjeta, r]));
const nombreZk = (z) => (z ? `${z.nombre} ${z.apellido}`.trim() : "");
const lotes = new Map();
for (const p of privilegios)
  for (const r of zk) if (p.ids.has(r.idZk)) (lotes.get(r.tarjeta) ?? lotes.set(r.tarjeta, new Set()).get(r.tarjeta)).add(p.lote);

const aperturas = new Map(), ultima = new Map(), rechazos = new Map();
for (const e of eventos) {
  if (!e.tarjeta) continue;
  if (e.evento.startsWith("Apertura con verificaci")) {
    aperturas.set(e.tarjeta, (aperturas.get(e.tarjeta) ?? 0) + 1);
    ultima.set(e.tarjeta, e.tiempo);
  } else if (e.evento.startsWith("Usuario no registrado")) rechazos.set(e.tarjeta, (rechazos.get(e.tarjeta) ?? 0) + 1);
}
const ultimaPorPos = new Map(ultimaPos.map((r) => [r.tarjeta, r]));

const hojaFilas = new Map();
for (const r of hoja) if (r.tarjeta) (hojaFilas.get(r.tarjeta) ?? hojaFilas.set(r.tarjeta, []).get(r.tarjeta)).push(r);
// La fila vigente: la de fecha mas reciente si las dos la tienen; si no, la posterior.
const hojaVigente = new Map();
for (const [t, filas] of hojaFilas) {
  let v = null;
  for (const r of filas) if (!v || !r.fecha || !v.fecha || r.fecha >= v.fecha) v = r;
  hojaVigente.set(t, v);
}

const satagPorTag = new Map();
for (const r of satag) {
  if (!r.tarjeta) continue;
  const ya = satagPorTag.get(r.tarjeta);
  if (!ya || (ya.estado === "baja" && r.estado !== "baja")) satagPorTag.set(r.tarjeta, r);
}

// STOCK: TAGs de inventario a nombre de «Disponible SATAG». No son personas: van aparte.
const esStock = (t) => /STOCK/i.test(zkPorTag.get(t)?.depto ?? "") || /^DISPONIBLE( |$)/i.test(nombreZk(zkPorTag.get(t)));
const puede = (t) => lotes.has(t);
const vivoSatag = (t) => satagPorTag.get(t) && satagPorTag.get(t).estado !== "baja";
const relevante = (t) => !esStock(t) && (puede(t) || aperturas.has(t) || vivoSatag(t));

// ---------------------------------------------------------------------------
// El nombre de cada TAG (misma regla que normalizar-nombres.mjs + decisiones)
// ---------------------------------------------------------------------------
const ML = { mismaLlave: true };
const todosTags = [...new Set([...zkPorTag.keys(), ...hojaFilas.keys(), ...satagPorTag.keys()])];
const nombreTag = new Map();
for (const t of todosTags) {
  const d = decNombre.get(t);
  if (d && String(d.nombre).trim()) { nombreTag.set(t, String(d.nombre).trim()); continue; }
  const z = zkPorTag.get(t), s = satagPorTag.get(t), h = hojaVigente.get(t);
  const nZ = nombreZk(z), nS = s?.nombre ?? "", nH = h?.nombre ?? "";
  const ancla = nZ || nS || nH;
  const cand = [
    nZ && { nombre: nZ, fuente: "ZK", prioridad: 1 },
    nS && { nombre: nS, fuente: "SATAG", prioridad: s.origen_expediente === "satag" ? 2 : 4 },
    nH && { nombre: nH, fuente: "hoja", prioridad: 3 },
  ].filter(Boolean).filter((c) => c.nombre === ancla || DECISION_POR_CLASE[comparar(ancla, c.nombre, ML)] === "misma");
  nombreTag.set(t, canonico(cand)?.nombre ?? titulo(ancla));
}

// ---------------------------------------------------------------------------
// Ligas entre TAGs
// ---------------------------------------------------------------------------
const padre = new Map(todosTags.map((t) => [t, t]));
const raiz = (t) => { while (padre.get(t) !== t) { padre.set(t, padre.get(padre.get(t))); t = padre.get(t); } return t; };
const unir = (a, b) => { const x = raiz(a), y = raiz(b); if (x !== y) padre.set(x < y ? y : x, x < y ? x : y); };
const evidencia = [];
const ligar = (a, b, tipo, detalle, junta = true) => {
  if (!padre.has(a) || !padre.has(b) || a === b) return;
  evidencia.push({ "TAG A": a, "TAG B": b, Liga: tipo, Junta: junta ? "si" : "no (solo familia)", Detalle: detalle });
  if (junta) unir(a, b);
};
// El coche o una mencion solo juntan si es la MISMA persona: dos esposos, un abuelo o
// una credencial sin nombre en el mismo coche quedan como evidencia de familia.
const compatibles = (a, b) => DECISION_POR_CLASE[comparar(nombreTag.get(a) ?? "", nombreTag.get(b) ?? "", ML)] === "misma";

// 1. Mismo nombre, regla estricta. Se comparan solo los que comparten una palabra poco comun.
{
  const porPalabra = new Map();
  for (const t of todosTags) if (!esStock(t)) for (const w of new Set(palabras(separarNota(nombreTag.get(t)).nombre)))
    (porPalabra.get(w) ?? porPalabra.set(w, []).get(w)).push(t);
  const vistos = new Set();
  for (const [, ts] of porPalabra) {
    if (ts.length > 60) continue; // MARIA, GARCIA: no sirven para acercar a nadie
    for (let x = 0; x < ts.length; x++)
      for (let y = x + 1; y < ts.length; y++) {
        const k = ts[x] < ts[y] ? `${ts[x]}|${ts[y]}` : `${ts[y]}|${ts[x]}`;
        if (vistos.has(k)) continue;
        vistos.add(k);
        const c = comparar(nombreTag.get(ts[x]), nombreTag.get(ts[y]));
        if (DECISION_POR_CLASE[c] === "misma") ligar(ts[x], ts[y], "mismo nombre", `${nombreTag.get(ts[x])} = ${nombreTag.get(ts[y])} (${c})`);
      }
  }
}
// 2. SATAG: los TAGs anteriores del expediente.
for (const s of satag) for (const a of s.tags_anteriores) ligar(s.tarjeta, a, "TAG anterior en SATAG", s.folio);
// 3. Menciones del numero de otro TAG: observaciones de la hoja y notas en el nombre de ZK.
for (const t of todosTags) {
  const textos = [...(hojaFilas.get(t) ?? []).map((r) => r.observaciones), separarNota(nombreZk(zkPorTag.get(t))).nota];
  for (const m of textos.join(" ").matchAll(/\b(\d{7,8})\b/g))
    if (m[1] !== t && padre.has(m[1])) ligar(t, m[1], "se menciona en la hoja o en ZK", m[0], compatibles(t, m[1]));
}
// 4. Mismo coche: placa.
const placaNorm = (v) => {
  const p = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return p.length >= 5 && p.length <= 8 && /[A-Z]/.test(p) && /\d/.test(p) && !/FORMATO|^NA/.test(p) ? p : "";
};
const placasDe = (t) => new Set([placaNorm(satagPorTag.get(t)?.placas), placaNorm(hojaVigente.get(t)?.placa), placaNorm(zkPorTag.get(t)?.placa), placaNorm(zkPorTag.get(t)?.celular)].filter(Boolean));
{
  const porPlaca = new Map();
  for (const t of todosTags) for (const p of placasDe(t)) (porPlaca.get(p) ?? porPlaca.set(p, []).get(p)).push(t);
  for (const [p, ts] of porPlaca) for (let x = 1; x < ts.length; x++) ligar(ts[0], ts[x], "misma placa", p, compatibles(ts[0], ts[x]));
}
// 5. Mismo coche: dos TAGs leidos a <= 5 s en el mismo lector, en dos dias o mas.
{
  const porLector = new Map();
  for (const e of eventos) if (e.tarjeta && e.lector) (porLector.get(e.lector) ?? porLector.set(e.lector, []).get(e.lector)).push(e);
  const juntos = new Map();
  for (const [, ev] of porLector) {
    const ms = ev.map((e) => Date.parse(e.tiempo.replace(" ", "T")));
    for (let a = 0; a < ev.length; a++)
      for (let b = a + 1; b < ev.length && ms[b] - ms[a] <= 5000; b++) {
        if (ev[a].tarjeta === ev[b].tarjeta) continue;
        const k = ev[a].tarjeta < ev[b].tarjeta ? `${ev[a].tarjeta}|${ev[b].tarjeta}` : `${ev[b].tarjeta}|${ev[a].tarjeta}`;
        (juntos.get(k) ?? juntos.set(k, new Set()).get(k)).add(ev[a].tiempo.slice(0, 10));
      }
  }
  for (const [k, dias] of juntos) {
    if (dias.size < 2) continue;
    const [a, b] = k.split("|");
    ligar(a, b, "mismo coche (se leen juntos)", `${dias.size} dias`, compatibles(a, b));
  }
}

// ---------------------------------------------------------------------------
// GES: quien es quien
// ---------------------------------------------------------------------------
const tutores = new Map(); // nombre GES -> { rol, familia, hijos }
const alumnos = new Map(); // nombre del alumno -> { familia, grupo }
for (const f of familias) {
  for (const [rol, n] of [["papa", f.padre], ["mama", f.madre]]) {
    if (!n) continue;
    const t = tutores.get(n) ?? tutores.set(n, { rol, familia: f.familia, hijos: new Set() }).get(n);
    t.hijos.add(`${titulo(f.alumno)} (${f.grupo})`);
  }
  alumnos.set(f.alumno, { familia: f.familia, grupo: f.grupo });
}
const indice = new Map();
const indexar = (n, v) => { for (const w of new Set(palabras(n))) (indice.get(w) ?? indice.set(w, []).get(w)).push(v); };
for (const [n, v] of tutores) indexar(n, { tipo: "tutor", n, v });
for (const [n, v] of alumnos) indexar(n, { tipo: "alumno", n, v });
for (const p of personal) indexar(p.nombre, { tipo: "personal", n: p.nombre, v: p });
for (const e of empleados) indexar(e.nombre, { tipo: "empleado", n: e.nombre, v: e });
function enGes(nombre) {
  const out = { tutor: null, alumno: null, activo: null, baja: null, empleado: null };
  const cand = new Set();
  for (const w of palabras(nombre)) for (const x of indice.get(w) ?? []) cand.add(x);
  for (const x of cand) {
    if (DECISION_POR_CLASE[comparar(nombre, x.n)] !== "misma") continue;
    if (x.tipo === "tutor") out.tutor ??= x;
    else if (x.tipo === "alumno") out.alumno ??= x;
    else if (x.tipo === "empleado") out.empleado ??= x.v;
    else if (x.v.activo) out.activo ??= x.v;
    else out.baja ??= x.v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------
const STAFF = /DOCENTE|ADMON|ADMINISTRACION|DEPORTES|MANTENIMIENTO|EMPLEADO/i;
const grupos = new Map();
for (const t of todosTags) (grupos.get(raiz(t)) ?? grupos.set(raiz(t), []).get(raiz(t))).push(t);

const personas = [], filasTag = [];
for (const [, ts] of grupos) {
  if (!ts.some(relevante)) continue;
  // El TAG principal: el que mas abre; luego el de paso mas reciente; luego el mas nuevo en la hoja.
  const orden = [...ts].sort(
    (a, b) =>
      (aperturas.get(b) ?? 0) - (aperturas.get(a) ?? 0) ||
      String(ultimaPorPos.get(b)?.tiempo ?? "").localeCompare(String(ultimaPorPos.get(a)?.tiempo ?? "")) ||
      String(hojaVigente.get(b)?.fecha ?? "").localeCompare(String(hojaVigente.get(a)?.fecha ?? "")),
  );
  const principal = orden[0];
  const id = `P-${[...ts].sort()[0]}`;
  const z = zkPorTag.get(principal);
  const deptoActual = z?.depto ?? "(no esta en ZK)";

  // GES con todos los nombres de la persona; las decisiones mandan.
  let g = { tutor: null, alumno: null, activo: null, baja: null, empleado: null };
  for (const t of ts) {
    const r = enGes(nombreTag.get(t));
    g = { tutor: g.tutor ?? r.tutor, alumno: g.alumno ?? r.alumno, activo: g.activo ?? r.activo, baja: g.baja ?? r.baja, empleado: g.empleado ?? r.empleado };
  }
  // Los empleados (administracion, mantenimiento) entran como personal activo o de baja.
  if (!g.activo && !g.baja && g.empleado) {
    if (g.empleado.activo) g.activo = g.empleado;
    else g.baja = { ...g.empleado, baja: "(empleado)" };
  }
  const dp = ts.map((t) => decPersona.get(t)).find(Boolean);

  // El nombre: si GES la tiene, la escritura de nuestras fuentes que mas palabras
  // comparte EXACTAS con GES (GES corrige la ortografia, 6-oct); si no, el del TAG
  // principal; si no tiene, el primero que haya.
  const candidatos = [...new Set(ts.flatMap((t) => [nombreTag.get(t), nombreZk(zkPorTag.get(t)), satagPorTag.get(t)?.nombre, hojaVigente.get(t)?.nombre]).filter((n) => n && palabras(separarNota(n).nombre).length))];
  const refGes = g.tutor?.n ?? g.activo?.nombre ?? g.baja?.nombre ?? g.alumno?.n ?? "";
  const exactas = (n) => { const R = new Set(palabras(refGes)); return palabras(separarNota(n).nombre).filter((w) => R.has(w)).length; };
  const mismoQuePrincipal = (n) => DECISION_POR_CLASE[comparar(n, nombreTag.get(principal) || n, ML)] === "misma";
  let nombre = nombreTag.get(principal) || candidatos[0] || "";
  if (refGes) {
    const mejor = candidatos.filter(mismoQuePrincipal).sort((a, b) => exactas(b) - exactas(a) || palabras(b).length - palabras(a).length)[0];
    if (mejor && exactas(mejor) > exactas(nombre)) nombre = titulo(separarNota(mejor).nombre);
  }

  const usa = ts.filter((t) => aperturas.has(t));
  const totalAp = ts.reduce((n, t) => n + (aperturas.get(t) ?? 0), 0);
  const SIN_CAMBIO = "(sin cambio)";

  let categoria, deptoObjetivo;
  if (g.activo && g.tutor) [categoria, deptoObjetivo] = ["Empleado y padre/madre", "Empleado_PPF"];
  else if (g.activo) [categoria, deptoObjetivo] = ["Empleado", STAFF.test(deptoActual) ? deptoActual : `su depto de personal (GES: ${g.activo.area || g.activo.cargo})`];
  else if (dp?.clasificacion === "familiar no tutor") [categoria, deptoObjetivo] = ["Familiar (tipo otro)", "Padres de familia"];
  else if (g.baja && g.tutor) [categoria, deptoObjetivo] = ["Exempleado, padre/madre vigente", "Padres de familia"];
  else if (g.tutor) [categoria, deptoObjetivo] = ["Padre/madre vigente", "Padres de familia"];
  else if (g.alumno) [categoria, deptoObjetivo] = ["Alumno vigente", "Alumnos"];
  // Un exempleado que SIGUE abriendo la pluma no va directo a BAJAS: algo no sabemos
  // (6-oct: un portero de baja con 23 aperturas). Va a revision.
  else if (g.baja && usa.length) [categoria, deptoObjetivo] = ["Exempleado que sigue usando la pluma", SIN_CAMBIO];
  // Tres clases de exempleado (Gerardo, 6-oct):
  //   A. tenia el TAG por su trabajo y GES da la fecha de baja -> BAJAS;
  //   B. baja sin fecha o cargo directivo -> confirmar antes de mover;
  //   C. la hoja lo registra como PADRES: el TAG no era por el trabajo -> dormido (6 meses).
  else if (g.baja && ts.some((t) => /^PADRES/i.test(hojaVigente.get(t)?.tipo ?? ""))) [categoria, deptoObjetivo] = ["Exempleado que tenia TAG como padre/madre", SIN_CAMBIO];
  else if (g.baja && (!/[0-9]{2}.[0-9]{2}.[0-9]{4}/.test(g.baja.baja ?? "") || /DIRECTOR/i.test(g.baja.cargo ?? ""))) [categoria, deptoObjetivo] = ["Exempleado por confirmar", "BAJAS?"];
  else if (g.baja) [categoria, deptoObjetivo] = ["Exempleado", "BAJAS"];
  // A quien no esta en GES no se le mueve nada: no hay con que decidir a donde.
  else if (STAFF.test(deptoActual)) [categoria, deptoObjetivo] = ["Personal no localizado en GES", SIN_CAMBIO];
  else [categoria, deptoObjetivo] = ["No localizado en GES", SIN_CAMBIO];
  const expedientes = [...new Set(ts.map((t) => satagPorTag.get(t)).filter((s) => s && s.estado !== "baja"))];

  // Acciones propuestas
  const acc = [];
  const conDerecho = ts.filter(puede);
  if (deptoObjetivo === "BAJAS?") {
    for (const t of conDerecho) acc.push(`ZK: TAG ${t} a BAJAS SOLO SI se confirma la baja (${g.baja.cargo || "sin cargo"}, baja ${g.baja.baja || "sin fecha"})`);
  } else if (deptoObjetivo === "BAJAS") {
    for (const t of conDerecho) acc.push(/^BAJAS$/i.test(zkPorTag.get(t)?.depto ?? "") ? `ZK: TAG ${t} ya esta en BAJAS pero conserva niveles: quitarlos` : `ZK: TAG ${t} a BAJAS y quitar niveles`);
  } else if (!usa.length && conDerecho.length && categoria === "No localizado en GES") {
    acc.push(`Observacion hasta ${FIN_OBSERVACION}: sin uso y sin rastro en GES`);
  } else {
    if (z && deptoObjetivo !== SIN_CAMBIO && deptoObjetivo !== deptoActual && !deptoObjetivo.startsWith("su depto")) acc.push(`ZK: TAG ${principal} de «${deptoActual}» a «${deptoObjetivo}»`);
    if (deptoObjetivo.startsWith("su depto") && !STAFF.test(deptoActual)) acc.push(`ZK: TAG ${principal} de «${deptoActual}» a ${deptoObjetivo}`);
    if (usa.length) for (const t of conDerecho) if (t !== principal && !aperturas.has(t)) acc.push(`ZK: TAG ${t} sin uso (usa el ${principal}): quitar niveles`);
    if (!usa.length && conDerecho.length) acc.push(`Observacion hasta ${FIN_OBSERVACION}: ${categoria.toLowerCase()}, ningun TAG se usa`);
  }
  if (usa.length && !expedientes.length) acc.push("SATAG: abre la pluma y no tiene expediente");
  // Varios expedientes NO es error por si mismo: en SATAG un expediente es persona +
  // coche + TAG, y quien usa dos TAGs tiene dos coches. Lo que se corrige es el
  // expediente cuyo TAG ya no se usa (abajo).
  for (const s of expedientes) {
    // Solo si cambian las letras: mayusculas y acentos no ameritan tocar el expediente.
    // Un caso «por confirmar» no se renombra: el nombre bueno se sabra cuando llegue.
    if (dp?.clasificacion !== "por confirmar" && nombre && palabras(s.nombre).join(" ") !== palabras(nombre).join(" ")) acc.push(`SATAG ${s.folio}: nombre «${s.nombre}» -> «${nombre}»`);
    if (!usa.includes(s.tarjeta) && usa.length) acc.push(`SATAG ${s.folio}: su TAG ${s.tarjeta} no se usa; la persona usa el ${usa.join(", ")}`);
  }
  if (dp?.preguntar_al_presentarse === "si") acc.push("Preguntar al presentarse");
  if (categoria === "Exempleado que sigue usando la pluma") acc.push(`Revisar: GES lo tiene de baja (${g.baja.cargo}) y abrio ${totalAp} veces`);

  const prioridad = !acc.length ? 3 : usa.length ? 1 : 2;
  const ligas = [...new Set(evidencia.filter((e) => e.Junta === "si" && ts.includes(e["TAG A"])).map((e) => e.Liga))];
  personas.push({
    Persona: id,
    Prioridad: prioridad,
    Nombre: nombre,
    Categoria: categoria,
    "Familia GES": g.tutor ? `${g.tutor.v.rol}, familia ${g.tutor.v.familia}: ${[...g.tutor.v.hijos].join(", ")}` : dp?.familia_ges ? `familia ${dp.familia_ges} (decision)` : "",
    "Puesto GES": g.activo ? `${g.activo.cargo} (${g.activo.area})${g.activo.sinEstatus ? " · sin estatus en GES" : ""}` : g.baja ? `BAJA ${g.baja.baja} · ${g.baja.cargo}` : "",
    TAGs: ts.length,
    "TAG principal": principal,
    "Aperturas 14-sep a hoy": totalAp,
    "Ultimo paso": ultima.get(principal) ?? ultimaPorPos.get(principal)?.tiempo ?? "",
    "Depto ZK hoy": deptoActual,
    "Depto que le toca": deptoObjetivo,
    "Folios SATAG": expedientes.map((s) => s.folio).join(", "),
    "Acciones propuestas": acc.join(" · "),
    "Como se juntaron sus TAGs": ligas.join(", "),
    "Decision (vacio = de acuerdo)": "",
    Nota: dp?.nota ?? "",
  });
  for (const t of orden) {
    const s = satagPorTag.get(t), h = hojaVigente.get(t), zt = zkPorTag.get(t);
    filasTag.push({
      TAG: t, Persona: id, Papel: t === principal ? "principal" : "adicional", Nombre: nombreTag.get(t),
      "Depto ZK": zt?.depto ?? "(no esta en ZK)", Plumas: [...(lotes.get(t) ?? [])].sort().join("+"),
      Aperturas: aperturas.get(t) ?? 0, Rechazos: rechazos.get(t) ?? 0,
      "Ultimo paso": ultima.get(t) ?? ultimaPorPos.get(t)?.tiempo ?? "",
      "Folio SATAG": s ? `${s.folio} (${s.estado})` : "", "Fila hoja": h?.fila ?? "", "Fecha hoja": h?.adquisicion ?? "",
      Placas: [...placasDe(t)].join(", "),
    });
  }
}

personas.sort((a, b) => a.Prioridad - b.Prioridad || b["Aperturas 14-sep a hoy"] - a["Aperturas 14-sep a hoy"]);
const cuenta = (R, f) => Object.entries(R.reduce((m, r) => ((m[f(r)] = (m[f(r)] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
const TIPOS = [
  [/a BAJAS y quitar niveles/, "ZK: TAG a BAJAS (exempleado)"],
  [/ya esta en BAJAS pero conserva niveles/, "ZK: en BAJAS pero con niveles"],
  [/sin uso \(usa el/, "ZK: quitar niveles a TAG sin uso (la persona usa otro)"],
  [/^ZK: TAG \d+ de .* a «Empleado_PPF»/, "ZK: mover a Empleado_PPF"],
  [/^ZK: TAG \d+ de .* a «Padres de familia»/, "ZK: mover a Padres de familia"],
  [/^ZK: TAG \d+ de/, "ZK: mover a otro departamento"],
  [/^Observacion/, "Observacion 6 meses (ningun TAG se usa)"],
  [/no tiene expediente/, "SATAG: abre la pluma sin expediente"],
  [/: nombre «/, "SATAG: corregir nombre"],
  [/no se usa; la persona usa/, "SATAG: el expediente tiene un TAG que ya no se usa"],
  [/^Preguntar/, "Preguntar al presentarse"],
];
const tiposAccion = (r) => r["Acciones propuestas"].split(" · ").filter(Boolean).map((a) => (TIPOS.find(([re]) => re.test(a)) ?? [null, a])[1]);
const resumen = [
  { Que: "Fotos", Valor: `${dir} · ZK ${zk.length} · hoja ${hoja.length} · SATAG ${satag.length} · eventos ${eventos.length} · GES ${familias.length} alumnos, ${personal.length} personal` },
  { Que: "Personas (con al menos un TAG que importa hoy)", Valor: personas.length },
  { Que: "TAGs de esas personas", Valor: filasTag.length },
  ...cuenta(personas, (r) => r.Categoria).map(([k, v]) => ({ Que: `Categoria: ${k}`, Valor: v })),
  ...cuenta(personas.flatMap((r) => tiposAccion(r).map((a) => ({ a }))), (x) => x.a).map(([k, v]) => ({ Que: `Accion: ${k}`, Valor: v })),
  { Que: "Prioridad 1", Valor: "Usa la pluma y hay algo que corregir" },
  { Que: "Prioridad 2", Valor: "No usa la pluma y hay algo que corregir" },
  { Que: "Prioridad 3", Valor: "Todo cuadra" },
];

const salida = path.join(F.DATOS, `personas-${dia}.xlsx`);
escribirXlsx(salida, { Personas: personas, TAGs: filasTag, Evidencia: evidencia, Resumen: resumen });
console.log(`Personas: ${personas.length} · TAGs: ${filasTag.length} · ligas: ${evidencia.length} (${evidencia.filter((e) => e.Junta === "si").length} juntan)`);
console.log("Por prioridad:", cuenta(personas, (r) => r.Prioridad).map(([k, v]) => `${k}: ${v}`).join(" · "));
console.log("Por categoria:", cuenta(personas, (r) => r.Categoria).map(([k, v]) => `${k}: ${v}`).join(" · "));
console.log("Con varios TAGs:", personas.filter((p) => p.TAGs > 1).length, "· con varios expedientes:", personas.filter((p) => p["Folios SATAG"].includes(",")).length);
console.log("Acciones:", cuenta(personas.flatMap((r) => tiposAccion(r).map((a) => ({ a }))), (x) => x.a).map(([k, v]) => `${k}: ${v}`).join(" · "));
console.log(`Escrito: ${path.relative(process.cwd(), salida)}`);
