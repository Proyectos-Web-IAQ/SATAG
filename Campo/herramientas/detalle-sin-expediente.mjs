// Detalle de las personas que abren la pluma sin expediente en SATAG, para decidir su
// alta caso por caso (Gerardo, 6-oct: «prefiero verlos antes»). Lee la tabla por
// persona (personas.mjs) y las fotos del dia; escribe altas-<dia>.xlsx.
//
//   node Campo/herramientas/detalle-sin-expediente.mjs --datos Campo/datos/2026-10-06
import path from "node:path";
import { createRequire } from "node:module";
import { abrir, escribirXlsx, RAIZ } from "./fuentes.mjs";

const i = process.argv.indexOf("--datos");
const dir = process.argv[i + 1];
const dia = path.basename(dir);
const F = abrir(dir);
const X = createRequire(path.join(RAIZ, "package.json"))("xlsx");
const libro = X.readFile(path.join(F.DATOS, `personas-${dia}.xlsx`));
const P = X.utils.sheet_to_json(libro.Sheets.Personas, { defval: "" });
const T = X.utils.sheet_to_json(libro.Sheets.TAGs, { defval: "" });
const E = X.utils.sheet_to_json(libro.Sheets.Evidencia, { defval: "" });

const satag = F.satag();
const hoja = F.hoja();
const zk = new Map(F.zkPersonas().map((r) => [r.tarjeta, r]));
const uso = new Map();
for (const e of F.zkEventos()) {
  if (!e.tarjeta) continue;
  const u = uso.get(e.tarjeta) ?? uso.set(e.tarjeta, { E1: 0, E2: 0, primera: "", ultima: "", dias: new Set(), rechazos: 0 }).get(e.tarjeta);
  if (e.evento.startsWith("Usuario no registrado")) { u.rechazos++; continue; }
  if (!e.evento.startsWith("Apertura con verificaci")) continue;
  if (/Entrada 1|Salida 1/.test(e.punto)) u.E1++; else u.E2++;
  u.primera ||= e.tiempo; u.ultima = e.tiempo; u.dias.add(e.tiempo.slice(0, 10));
}

const filas = [];
for (const p of P.filter((p) => /no tiene expediente/.test(p["Acciones propuestas"])).sort((a, b) => b["Aperturas 14-sep a hoy"] - a["Aperturas 14-sep a hoy"])) {
  const t = String(p["TAG principal"]);
  const u = uso.get(t) ?? { E1: 0, E2: 0, primera: "", ultima: "", dias: new Set(), rechazos: 0 };
  const h = hoja.filter((r) => r.tarjeta === t).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).at(-1);
  const z = zk.get(t);
  const otros = T.filter((x) => x.Persona === p.Persona && String(x.TAG) !== t);
  const baja = satag.filter((s) => s.tarjeta === t || s.tags_anteriores.includes(t));
  const viaja = E.filter((e) => (String(e["TAG A"]) === t || String(e["TAG B"]) === t) && /coche|placa/.test(e.Liga)).map((e) => {
    const o = String(e["TAG A"]) === t ? e["TAG B"] : e["TAG A"];
    const x = T.find((r) => String(r.TAG) === String(o));
    return `${o} ${x?.Nombre ?? ""} (${e.Liga}, ${e.Detalle})`;
  });
  let porque;
  if (!h && !z?.nombre) porque = "Credencial sin nombre en ZK y sin fila en la hoja: no hay de donde sacar quien es";
  else if (!h) porque = "No esta en la hoja: la migracion del 1-oct solo trajo de ZK a quien tenia nombre y uso; esta no entro";
  else if (baja.length) porque = `Tuvo expediente y esta de baja: ${baja.map((s) => `${s.folio} (${s.estado})`).join(", ")}`;
  else porque = "Esta en la hoja pero no se migro (la depuracion del 1-oct lo dejo fuera)";
  let propuesta;
  if (/sin nombre/i.test(porque) && viaja.length) propuesta = `Identificar: viaja con ${viaja[0]}. Probable segundo TAG de esa persona`;
  else if (/sin nombre/i.test(porque)) propuesta = "Preguntar a quien lo traiga";
  else if (p.Categoria === "No localizado en GES") propuesta = "Alta + preguntar al presentarse (no esta en GES)";
  else if (/BAJAS/.test(p["Depto ZK hoy"])) propuesta = "Alta + regresarlo de BAJAS a Padres en ZK";
  else propuesta = h ? "Alta con los datos de la hoja" : "Alta con los datos de ZK (falta coche y placa)";
  filas.push({
    "#": filas.length + 1,
    TAG: t,
    Nombre: p.Nombre || "(sin nombre en ZK)",
    Categoria: p.Categoria,
    "Familia o puesto en GES": p["Familia GES"] || p["Puesto GES"],
    "Depto ZK": p["Depto ZK hoy"],
    "Plumas que abre": T.find((x) => String(x.TAG) === t)?.Plumas || "ninguna",
    "Aperturas E1": u.E1,
    "Aperturas E2": u.E2,
    "Dias distintos": u.dias.size,
    Rechazos: u.rechazos,
    "Primera apertura": u.primera,
    "Ultima apertura": u.ultima,
    "Hoja: fila y fecha": h ? `fila ${h.fila} · ${h.adquisicion}` : "no esta",
    "Hoja: coche": h ? `${h.marca} ${h.modelo} ${h.color}`.trim() : "",
    "Hoja: placa": h?.placa ?? "",
    "Hoja: tipo": h?.tipo ?? "",
    "Hoja: gestionante": h?.gestionante ?? "",
    "Hoja: observaciones": h?.observaciones ?? "",
    "Placa en ZK": z?.placa || z?.celular || "",
    "Otros TAGs de la persona": otros.map((x) => `${x.TAG} (${x["Depto ZK"]}, ${x.Aperturas} ap${x["Folio SATAG"] ? ", " + x["Folio SATAG"] : ""})`).join("; "),
    "Viaja con": viaja.join("; "),
    "Por que no tiene expediente": porque,
    Propuesta: propuesta,
    "Decision (vacio = de acuerdo)": "",
  });
}
const salida = path.join(F.DATOS, `altas-${dia}.xlsx`);
escribirXlsx(salida, { "Sin expediente": filas });
console.log(`${filas.length} personas · escrito ${path.relative(process.cwd(), salida)}`);
for (const f of filas) console.log([f["#"], f.TAG, f.Nombre, f.Categoria, f["Familia o puesto en GES"].slice(0, 60), f["Depto ZK"], f["Plumas que abre"], `E1 ${f["Aperturas E1"]} / E2 ${f["Aperturas E2"]} en ${f["Dias distintos"]} dias`, `${String(f["Primera apertura"]).slice(5, 10)}→${String(f["Ultima apertura"]).slice(5, 10)}`, f["Hoja: fila y fecha"], f["Hoja: coche"], f["Hoja: placa"], f["Hoja: observaciones"].slice(0, 50), f["Otros TAGs de la persona"].slice(0, 70), f["Por que no tiene expediente"].slice(0, 45), f.Propuesta].join(" | "));
