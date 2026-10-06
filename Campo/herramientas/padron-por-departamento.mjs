// El padron del estacionamiento visto por departamento de ZK, con antiguedad de
// cada credencial y los casos que se salen de lo normal.
//
// POR QUE HACE FALTA CRUZAR. El departamento vive en ZKBioSecurity y la fecha en que
// se entrego el TAG vive en la hoja de calculo. Ninguna de las dos fuentes puede
// responder sola «cuantos TAGs tiene Maestros y desde cuando»: hay que unirlas por
// numero de TAG, que es la unica llave que comparten.
//
// UNA ADVERTENCIA QUE NO SE PUEDE OMITIR. Aqui se mide ANTIGUEDAD —cuanto tiempo
// lleva emitida una credencial—, no USO. El export de ZK no trae estado de tarjeta
// ni fecha de ultimo acceso, asi que un TAG de 2019 y uno de ayer se ven igual de
// «vivos». Para saber cual se usa de verdad hace falta el reporte de eventos de
// acceso, que es otro export. Presentar antiguedad como uso seria inventar.
//
// «ACTIVO» ES UNA APROXIMACION. El export no tiene columna de estado. El unico
// indicio es el departamento: BAJAS se usa como cementerio. Todo lo que no este en
// BAJAS se cuenta como vigente, sabiendo que es una cota superior.
//
// NO IMPRIME DATOS PERSONALES: conteos, medianas y rangos. Los listados nominales
// para trabajar se escriben en Campo/datos/padron/, fuera de git.
//
//   node Campo/herramientas/padron-por-departamento.mjs [AAAA-MM-DD]
import fs from "node:fs";
import path from "node:path";

const DATOS = path.join(process.cwd(), "Campo", "datos");
const SALIDA = path.join(DATOS, "padron");
// Fecha de referencia para la antiguedad. Se pasa por argumento para que el reporte
// sea reproducible: si dependiera del reloj, dos corridas darian cifras distintas y
// ninguna seria citable.
const HOY = process.argv[2] ?? "2026-09-29";

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
function csv(ruta) {
  const ls = leer(ruta).split(/\r?\n/).filter((l) => l.trim() !== "");
  const cab = ls[0].split(",").map((c) => c.trim());
  return ls.slice(1).map((l) => {
    const c = l.split(",");
    return Object.fromEntries(cab.map((k, i) => [k, (c[i] ?? "").trim()]));
  });
}

const tag = (v) => String(v ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "");
const placa = (v) => {
  const p = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^(NA|NAFORMATO\d*|SN|PENDIENTE|)$/.test(p) ? "" : p;
};
const dias = (iso) => Math.round((Date.parse(HOY + "T00:00:00Z") - Date.parse(iso + "T00:00:00Z")) / 86400000);
const anios = (d) => d / 365.25;
const med = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + "%" : "—");
const L = (a, b) => console.log("  " + String(a).padEnd(44) + b);

// --- Fuentes -------------------------------------------------------------
const catalogo = new Map(tsv(path.join(DATOS, "Departamentos_20260929162502.csv"))
  .map((d) => [d["ID de Departamento"], d["Nombre de Departamento"]]));

const zk = tsv(path.join(DATOS, "Usuarios_20260908103203.csv"));
const padron = JSON.parse(fs.readFileSync(path.join(SALIDA, "normalizado-29sep.json"), "utf8"));

// El padron indexado por TAG. Una misma tarjeta puede tener varias filas en la hoja
// (reposiciones, recapturas): se guardan todas y se usa la mas antigua como fecha de
// entrada en servicio, porque es cuando esa credencial empezo a ocupar un cajon.
const porTag = new Map();
for (const f of padron) {
  if (!f.tag) continue;
  if (!porTag.has(f.tag)) porTag.set(f.tag, []);
  porTag.get(f.tag).push(f);
}

const personas = zk.map((p) => {
  const t = tag(p["Tarjeta"]);
  const filas = porTag.get(t) ?? [];
  const fechas = filas.map((f) => f.fecha?.iso).filter(Boolean).sort();
  const deptoId = p["ID de Departamento"];
  return {
    tag: t,
    deptoId,
    depto: catalogo.get(deptoId) ?? `(id ${deptoId} sin catalogo)`,
    placaZk: placa(p["Celular"]) || placa(p["Placa Vehicular"]),
    tipoUsuario: p["Tipo de Usuario"] ?? "",
    enPadron: filas.length > 0,
    filas,
    desde: fechas[0] ?? null,
    antiguedadDias: fechas[0] ? dias(fechas[0]) : null,
    rol: filas.find((f) => f.rol !== "(sin dato)")?.rol ?? "(sin dato)",
    estacionamiento: filas.find((f) => f.estacionamiento !== "(sin dato)")?.estacionamiento ?? "(sin dato)",
    reposicion: filas.some((f) => f.reposicion),
    externo: filas.some((f) => f.externo),
    baja: filas.some((f) => f.baja),
    fallaLectura: filas.some((f) => f.fallaLectura),
  };
});

const BAJAS = "10";
const vigentes = personas.filter((p) => p.deptoId !== BAJAS);

console.log(`\nFECHA DE REFERENCIA: ${HOY}`);
console.log("ANTIGUEDAD, NO USO: sin el reporte de eventos no se sabe cual se usa.\n");
console.log("PANORAMA\n");
L("personas en ZK", personas.length);
L("con tarjeta asignada", personas.filter((p) => p.tag).length);
L("fuera de BAJAS (vigentes, cota superior)", vigentes.length);
L("en BAJAS", personas.length - vigentes.length);
L("expedientes en la hoja del estacionamiento", padron.length);
L("tarjetas de ZK que cruzan con la hoja", personas.filter((p) => p.enPadron).length);
L("  de esas, vigentes", vigentes.filter((p) => p.enPadron).length);

// --- Por departamento ----------------------------------------------------
const grupos = new Map();
for (const p of personas) {
  if (!grupos.has(p.depto)) grupos.set(p.depto, []);
  grupos.get(p.depto).push(p);
}

console.log("\n\nTAGS POR DEPARTAMENTO\n");
console.log("  departamento            personas  conPlaca  enHoja   antig.mediana  rango");
for (const [d, g] of [...grupos.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const ant = g.map((p) => p.antiguedadDias).filter((x) => x != null);
  const m = med(ant);
  const rango = ant.length
    ? `${anios(Math.min(...ant)).toFixed(1)}–${anios(Math.max(...ant)).toFixed(1)} a`
    : "—";
  console.log(
    "  " + d.padEnd(24) +
    String(g.length).padStart(8) +
    String(g.filter((p) => p.placaZk).length).padStart(10) +
    String(g.filter((p) => p.enPadron).length).padStart(8) +
    (m != null ? (anios(m).toFixed(1) + " anios") : "—").padStart(15) +
    "   " + rango,
  );
}

console.log("\n\nCOMPOSICION DE CADA DEPARTAMENTO (solo los que cruzan con la hoja)\n");
for (const [d, g] of [...grupos.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const c = g.filter((p) => p.enPadron);
  if (!c.length) { console.log(`  ${d}: ninguna de sus ${g.length} tarjetas esta en la hoja\n`); continue; }
  const ant = c.map((p) => p.antiguedadDias).filter((x) => x != null);
  console.log(`  ${d}  ·  ${c.length} de ${g.length} tarjetas en la hoja`);
  if (ant.length) {
    const s = [...ant].sort((a, b) => a - b);
    L("    antiguedad mediana", anios(med(ant)).toFixed(1) + " anios");
    L("    antiguedad promedio", anios(ant.reduce((a, b) => a + b, 0) / ant.length).toFixed(1) + " anios");
    L("    el 10% mas nuevo / el 10% mas viejo",
      anios(s[Math.floor(s.length * 0.1)]).toFixed(1) + " / " + anios(s[Math.floor(s.length * 0.9)]).toFixed(1) + " anios");
  }
  const rep = (f) => { const m = new Map(); for (const x of c) m.set(f(x), (m.get(f(x)) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  L("    rol en la hoja", rep((p) => p.rol).map(([k, v]) => `${k} ${v}`).join(" · "));
  L("    estacionamientos", rep((p) => p.estacionamiento).map(([k, v]) => `${k} ${v}`).join(" · "));
  L("    con senal de reposicion", `${c.filter((p) => p.reposicion).length} (${pct(c.filter((p) => p.reposicion).length, c.length)})`);
  L("    con TAG ajeno (condominio/usuario)", `${c.filter((p) => p.externo).length} (${pct(c.filter((p) => p.externo).length, c.length)})`);
  L("    con baja anotada en la hoja", `${c.filter((p) => p.baja).length} (${pct(c.filter((p) => p.baja).length, c.length)})`);
  L("    con falla de lectura anotada", `${c.filter((p) => p.fallaLectura).length} (${pct(c.filter((p) => p.fallaLectura).length, c.length)})`);
  console.log();
}

// --- Casos fuera de lo normal --------------------------------------------
console.log("\nCASOS QUE SE SALEN DE LO NORMAL\n");

// 1. La contradiccion mas cara: la hoja dice que se dio de baja y ZK la conserva
//    fuera de BAJAS, o sea que la pluma todavia le abre.
const bajaViva = vigentes.filter((p) => p.baja);
L("1. baja anotada en la hoja pero vigente en ZK", bajaViva.length);
console.log("      (la hoja dice que se entrego o retiro el TAG y el control de acceso");
console.log("       lo conserva fuera de BAJAS: sigue abriendo la pluma)");

// 2. En BAJAS pero con placa: eran vehiculos, no credenciales de puerta. Mide
//    cuanto del cementerio es estacionamiento.
const enBajas = personas.filter((p) => p.deptoId === BAJAS);
L("2. en BAJAS con placa registrada", `${enBajas.filter((p) => p.placaZk).length} de ${enBajas.length}`);
L("   en BAJAS que ademas estan en la hoja", enBajas.filter((p) => p.enPadron).length);

// 3. Credenciales facturadas que el control de acceso ya no conoce.
const huerfanas = [...porTag.keys()].filter((t) => !personas.some((p) => p.tag === t));
L("3. TAGs en la hoja que ZK no conoce", `${huerfanas.length} de ${porTag.size}`);
console.log("      (se cobraron y se anotaron, pero no existen en el control de acceso)");

// 4. Vigentes sin expediente: abren la pluma y nadie sabe de que coche son.
const sinExpediente = vigentes.filter((p) => p.tag && !p.enPadron && p.placaZk);
L("4. vigentes con placa pero sin fila en la hoja", sinExpediente.length);

// 5. Antiguedad extrema: credenciales de la primera epoca todavia vivas.
const viejas = vigentes.filter((p) => p.antiguedadDias != null && anios(p.antiguedadDias) >= 6);
L("5. vigentes con 6 anios o mas de antiguedad", viejas.length);
const porAnio = new Map();
for (const p of vigentes) if (p.desde) { const a = p.desde.slice(0, 4); porAnio.set(a, (porAnio.get(a) ?? 0) + 1); }
console.log("      vigentes por anio de emision:");
for (const [a, n] of [...porAnio.entries()].sort()) console.log("        " + a + "   " + String(n).padStart(5));

// 6. Familias de hardware: la longitud del numero delata proveedores distintos, y
//    eso condiciona el puente a ZK.
const largos = new Map();
for (const p of vigentes) if (p.tag) largos.set(p.tag.length, (largos.get(p.tag.length) ?? 0) + 1);
console.log("\n  6. longitud del numero de TAG entre los vigentes:");
for (const [k, v] of [...largos.entries()].sort((a, b) => a[0] - b[0]))
  console.log("        " + String(k).padStart(2) + " digitos   " + String(v).padStart(5));

// 7. La misma placa en varias tarjetas vigentes: o es reposicion sin baja, o un
//    coche con dos credenciales que se estorban.
const porPlaca = new Map();
for (const p of vigentes) if (p.placaZk) {
  if (!porPlaca.has(p.placaZk)) porPlaca.set(p.placaZk, []);
  porPlaca.get(p.placaZk).push(p);
}
const dobles = [...porPlaca.entries()].filter(([, v]) => v.length > 1);
console.log();
L("7. placas con mas de una tarjeta vigente", dobles.length);
L("   tarjetas implicadas", dobles.reduce((a, [, v]) => a + v.length, 0));
const cruzaDepto = dobles.filter(([, v]) => new Set(v.map((x) => x.deptoId)).size > 1);
L("   de esas, repartidas en varios departamentos", cruzaDepto.length);
const maxPlaca = dobles.sort((a, b) => b[1].length - a[1].length)[0];
if (maxPlaca) L("   el caso mayor", maxPlaca[1].length + " tarjetas para una sola placa");

// 8. Departamentos del catalogo sin una sola persona: estructura que sobra.
const usados = new Set(personas.map((p) => p.deptoId));
const vacios = [...catalogo.entries()].filter(([id]) => !usados.has(id));
console.log();
L("8. departamentos del catalogo sin personas", `${vacios.length} de ${catalogo.size}`);
console.log("      " + vacios.map(([id, n]) => `${n} (id ${id})`).join(" · "));
console.log("      Nota: el export de personas es del 8-sep y los departamentos del 29-sep.");
console.log("      Los creados el 28-sep salen vacios por eso, no porque lo esten.");

// --- Listados de trabajo, fuera de git -----------------------------------
fs.mkdirSync(SALIDA, { recursive: true });
const vol = (n, filas) => fs.writeFileSync(path.join(SALIDA, n), filas.join("\n"));
vol("depto-baja-anotada-pero-vigente.txt", bajaViva.map((p) => `${p.tag}\t${p.depto}\t${p.desde ?? ""}`));
vol("depto-tags-de-la-hoja-que-zk-no-conoce.txt", huerfanas);
vol("depto-vigentes-con-placa-sin-expediente.txt", sinExpediente.map((p) => `${p.tag}\t${p.depto}\t${p.placaZk}`));
vol("depto-vigentes-de-6-anios-o-mas.txt", viejas.map((p) => `${p.tag}\t${p.depto}\t${p.desde}`));
vol("depto-placas-con-varias-tarjetas.txt", dobles.map(([pl, v]) => `${pl}\t${v.length}\t${v.map((x) => x.tag).join(",")}`));
console.log("\n  listados en Campo/datos/padron/ (fuera de git)\n");
