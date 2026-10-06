// Paso 1 de la depuracion del 6-oct: el nombre de cada TAG en las tres fuentes, la
// misma persona o no, y el nombre que se queda.
//
// QUIEN MANDA (Gerardo, 6-oct): para saber QUIEN TIENE un TAG manda ZK, porque es lo
// que abre o no la pluma; un cambio de dueno se hace primero en ZK y en la hoja queda,
// casi siempre, como nota. Para ESCRIBIR el nombre tambien gana ZK, salvo que otra
// fuente lo traiga mas completo (ver canonico() en nombres.mjs).
//
// Produce Campo/datos/<dia>/nombres-<dia>.xlsx con tres pestanas:
//   - «Revisar»: solo los TAG que importan hoy (ZK les da derecho, abrieron en la
//     ventana o tienen expediente vivo) donde las fuentes no nombran a la misma persona.
//     La hoja YA TRAE la respuesta propuesta; Gerardo solo escribe donde no este de
//     acuerdo (columnas «Corrija aqui…»). Al volver a generar el archivo, lo que el
//     escribio se conserva: se lee del archivo anterior por TAG.
//   - «Todos»: cada TAG de cualquier fuente con su nombre normalizado.
//   - «Leyenda».
// A la consola solo salen conteos.
//
//   node Campo/herramientas/normalizar-nombres.mjs --datos Campo/datos/2026-10-06
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { abrir, escribirXlsx, RAIZ } from "./fuentes.mjs";
import { comparar, separarNota, canonico, titulo, DECISION_POR_CLASE } from "./nombres.mjs";

const i = process.argv.indexOf("--datos");
if (i < 0) throw new Error("Uso: node Campo/herramientas/normalizar-nombres.mjs --datos Campo/datos/AAAA-MM-DD");
const dir = process.argv[i + 1];
const dia = path.basename(dir);
const F = abrir(dir);

const zk = F.zkPersonas();
const hoja = F.hoja();
const satag = F.satag();
const privilegios = F.zkPrivilegios();
const eventos = F.zkEventos();

const zkPorTag = new Map(zk.map((r) => [r.tarjeta, r]));
const puede = new Set();
for (const p of privilegios) for (const r of zk) if (p.ids.has(r.idZk)) puede.add(r.tarjeta);
const abrio = new Map();
for (const e of eventos) {
  if (!e.tarjeta || !e.evento.startsWith("Apertura con verificaci")) continue;
  abrio.set(e.tarjeta, (abrio.get(e.tarjeta) ?? 0) + 1);
}
// Un TAG puede tener varias filas en la hoja: cada reasignacion es una fila nueva. La
// vigente es la de fecha MAS RECIENTE, no la ultima del archivo (la 579 es de nov-2019
// y la 581 de ago-2019). En los 14 TAG con varias filas del 6-oct, la mas reciente
// coincide con quien ZK tiene hoy. La fecha decide solo si las dos filas la tienen;
// si no, gana la posterior en el archivo (9426738: la fila sin fecha es la vigente).
const hojaPorTag = new Map();
for (const r of hoja) {
  if (!r.tarjeta) continue;
  const ya = hojaPorTag.get(r.tarjeta);
  if (!ya || !r.fecha || !ya.fecha || r.fecha >= ya.fecha) hojaPorTag.set(r.tarjeta, r);
}
// SATAG: el expediente vivo manda sobre uno dado de baja con el mismo TAG.
const satagPorTag = new Map();
for (const r of satag) {
  if (!r.tarjeta) continue;
  const ya = satagPorTag.get(r.tarjeta);
  if (!ya || (ya.estado === "baja" && r.estado !== "baja")) satagPorTag.set(r.tarjeta, r);
}

const universo = new Set([...zkPorTag.keys(), ...hojaPorTag.keys(), ...satagPorTag.keys()]);
const nombreZk = (z) => (z ? `${z.nombre} ${z.apellido}`.trim() : "");
const PEOR = ["otra", "revisar", "misma"];
// Aqui siempre se compara el MISMO TAG en dos fuentes: el TAG ya los une.
const ML = { mismaLlave: true };

const todos = [];
for (const t of universo) {
  const z = zkPorTag.get(t), h = hojaPorTag.get(t), s = satagPorTag.get(t);
  const nZ = nombreZk(z), nH = h?.nombre ?? "", nS = s?.nombre ?? "";
  const pares = {
    "ZK-hoja": z && h ? comparar(nZ, nH, ML) : "",
    "ZK-SATAG": z && s ? comparar(nZ, nS, ML) : "",
    "hoja-SATAG": h && s ? comparar(nH, nS, ML) : "",
  };
  const decisiones = Object.values(pares).filter(Boolean).map((c) => DECISION_POR_CLASE[c]);
  const veredicto = decisiones.length ? PEOR.find((d) => decisiones.includes(d)) : "una sola fuente";
  // El titular lo dice ZK; el nombre canonico sale de las fuentes que coinciden con el.
  const ancla = z ? nZ : s ? nS : nH;
  const candidatos = [
    z && { nombre: nZ, fuente: "ZK", prioridad: 1 },
    s && { nombre: nS, fuente: "SATAG", prioridad: s.origen_expediente === "satag" ? 2 : 4 },
    h && { nombre: nH, fuente: "hoja", prioridad: 3 },
  ].filter(Boolean).filter((c) => DECISION_POR_CLASE[comparar(ancla, c.nombre, ML)] === "misma" || c.nombre === ancla);
  const canon = canonico(candidatos);
  const notaZk = z ? separarNota(nZ) : { nota: "", rol: "" };
  const vivo = s && s.estado !== "baja";
  todos.push({
    TAG: t,
    "Importa hoy": puede.has(t) || abrio.has(t) || vivo ? "si" : "",
    "ZK le da derecho": puede.has(t) ? "si" : "",
    "Aperturas en la ventana": abrio.get(t) ?? 0,
    "Folio SATAG": s?.folio ?? "",
    "Estado SATAG": s?.estado ?? "",
    "Origen SATAG": s?.origen_expediente ?? "",
    "Nombre que se queda": canon?.nombre ?? "",
    "Tomado de": canon?.fuente ?? "",
    "Veredicto": veredicto,
    "Nombre en ZK": nZ,
    "Depto ZK": z?.depto ?? "",
    "Nota en el nombre (ZK)": notaZk.nota,
    "Rol por la nota": notaZk.rol,
    "Nombre en la hoja": nH,
    "Fila de la hoja": h?.fila ?? "",
    "Observaciones de la hoja": h?.observaciones ?? "",
    "Nombre en SATAG": nS,
    "ZK vs hoja": pares["ZK-hoja"],
    "ZK vs SATAG": pares["ZK-SATAG"],
    "hoja vs SATAG": pares["hoja-SATAG"],
  });
}

// Que pasa con el TAG, en una frase.
function quePasa(r) {
  const otraEn = [];
  if (DECISION_POR_CLASE[r["ZK vs hoja"]] === "otra") otraEn.push("la hoja");
  if (DECISION_POR_CLASE[r["ZK vs SATAG"]] === "otra") otraEn.push("SATAG");
  if (otraEn.length && r["Nombre en ZK"]) return `${["ZK", ...otraEn].join(otraEn.length > 1 ? ", " : " y ").replace(/, ([^,]*)$/, " y $1")} nombran a personas distintas.`;
  if (otraEn.length) return "Las fuentes nombran a personas distintas y no esta en ZK.";
  if (!r["Nombre en ZK"]) return "No esta en ZK; la hoja y SATAG lo escriben distinto.";
  return "Lo escriben distinto: errata o familiar.";
}

// Lo que Gerardo ya escribio en el archivo anterior, por TAG. Solo las columnas de
// correccion: lo demas se recalcula con las fotos.
const COL_NOMBRE = "Corrija aqui el nombre (vacio = el propuesto esta bien)";
const COL_MISMA = "Corrija aqui si/no (vacio = la propuesta esta bien)";
const COL_NOTA = "Nota";
const salida = path.join(F.DATOS, `nombres-${dia}.xlsx`);
const previas = new Map();
// El registro de decisiones que se dicta en la conversacion: TAG,nombre,misma,nota.
// Manda sobre lo escrito en el Excel.
const registro = path.join(F.DATOS, "decisiones-nombres.csv");
const desdeRegistro = new Map();
if (fs.existsSync(registro)) {
  const X = createRequire(path.join(RAIZ, "package.json"))("xlsx");
  const l = X.read(fs.readFileSync(registro, "utf8"), { type: "string", raw: true });
  for (const r of X.utils.sheet_to_json(l.Sheets[l.SheetNames[0]], { defval: "", raw: false })) {
    desdeRegistro.set(String(r.TAG).trim(), { nombre: String(r.nombre ?? "").trim(), misma: String(r.misma ?? "").trim(), nota: String(r.nota ?? "").trim() });
  }
}
if (fs.existsSync(salida)) {
  const X = createRequire(path.join(RAIZ, "package.json"))("xlsx");
  const libro = X.readFile(salida);
  for (const r of X.utils.sheet_to_json(libro.Sheets.Revisar ?? {}, { defval: "" })) {
    const p = { nombre: String(r[COL_NOMBRE] ?? "").trim(), misma: String(r[COL_MISMA] ?? "").trim(), nota: String(r[COL_NOTA] ?? "").trim() };
    if (p.nombre || p.misma || p.nota) previas.set(String(r.TAG), p);
  }
}

for (const [t, p] of desdeRegistro) previas.set(t, p);
console.log(`Decisiones registradas: ${desdeRegistro.size}`);

const revisar = todos
  .filter((r) => r["Importa hoy"] && (r.Veredicto === "otra" || r.Veredicto === "revisar"))
  .sort((a, b) => (a.Veredicto === b.Veredicto ? b["Aperturas en la ventana"] - a["Aperturas en la ventana"] : a.Veredicto === "otra" ? -1 : 1))
  .map((r) => {
    const p = previas.get(r.TAG) ?? {};
    return {
      TAG: r.TAG,
      "Que pasa": quePasa(r),
      "Nombre propuesto": r["Nombre que se queda"],
      [COL_NOMBRE]: p.nombre ?? "",
      "Es la misma persona en todas las fuentes? (propuesta)": r.Veredicto === "otra" ? "no" : "si",
      [COL_MISMA]: p.misma ?? "",
      [COL_NOTA]: p.nota ?? "",
      "Nombre en ZK": r["Nombre en ZK"],
      "Nombre en la hoja": r["Nombre en la hoja"],
      "Nombre en SATAG": r["Nombre en SATAG"],
      "Folio SATAG": r["Folio SATAG"],
      "Depto ZK": r["Depto ZK"],
      "Aperturas en la ventana": r["Aperturas en la ventana"],
      "Observaciones de la hoja": r["Observaciones de la hoja"],
      "Fila de la hoja": r["Fila de la hoja"],
    };
  });
const huerfanas = [...previas.keys()].filter((t) => !revisar.some((r) => r.TAG === t));
if (huerfanas.length) console.log(`AVISO: ${huerfanas.length} correcciones del archivo anterior ya no tienen fila (TAG que dejo de importar o de diferir).`);

const leyenda = [
  { Concepto: "Fotos", Valor: `${dir}: ZK ${zk.length} personas, hoja ${hoja.length} filas, SATAG ${satag.length} expedientes, ${eventos.length} eventos` },
  { Concepto: "Como se llena «Revisar»", Valor: "Cada fila ya trae la respuesta propuesta. Si esta bien, NO escriba nada. Si no, escriba en las columnas «Corrija aqui…»: el nombre correcto, o si/no en si es la misma persona. «GES» en la Nota = lo valida en GES despues." },
  { Concepto: "Nombre propuesto", Valor: "El de ZK (decision del 6-oct: manda ZK), salvo que otra fuente con la misma persona lo traiga mas completo." },
  { Concepto: "Misma persona = no", Valor: "El TAG es de quien dice ZK; la hoja y/o SATAG nombran a otra persona (TAG reasignado, cruzado o mal capturado): se corrigen esas fuentes." },
  { Concepto: "Importa hoy", Valor: "ZK le da derecho, abrio en la ventana de eventos, o tiene expediente vivo en SATAG" },
  { Concepto: "Clases (pestana Todos)", Valor: "1 identico · 2 otro orden · 3 uno contiene al otro · 4 errata: misma persona sin preguntar. 5 comparten 2+: revisar. 6 comparten 1 / 7 nada: otra persona." },
];

escribirXlsx(salida, { Revisar: revisar, Todos: todos.sort((a, b) => a.TAG.localeCompare(b.TAG)), Leyenda: leyenda });

const cuenta = (R, k) => Object.entries(R.reduce((m, r) => ((m[r[k]] = (m[r[k]] ?? 0) + 1), m), {})).map(([a, b]) => `${a}: ${b}`).join(" · ");
console.log(`TAGs en alguna fuente: ${todos.length}  ·  importan hoy: ${todos.filter((r) => r["Importa hoy"]).length}`);
console.log(`Veredicto (todos): ${cuenta(todos, "Veredicto")}`);
console.log(`Veredicto (importan hoy): ${cuenta(todos.filter((r) => r["Importa hoy"]), "Veredicto")}`);
console.log(`Para revisar: ${revisar.length} (${cuenta(revisar, "Es la misma persona en todas las fuentes? (propuesta)")} = misma persona propuesta)`);
console.log(`Con nota en el nombre de ZK: ${todos.filter((r) => r["Nota en el nombre (ZK)"]).length}, de ellos rol alumno: ${todos.filter((r) => r["Rol por la nota"] === "alumno").length}`);
console.log(`Escrito: ${path.relative(process.cwd(), salida)}`);
