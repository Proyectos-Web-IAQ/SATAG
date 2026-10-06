// Los movimientos planeados para ZK, sacados de la tabla por persona. Lidia (TI) da el
// visto bueno y Gerardo los aplica (6-oct): por eso no lleva columna de «hecho».
//
// SOLO movimientos de departamento. Los TAGs sin uso de quien usa otro NO van: Gerardo
// decidio (6-oct) documentarlos en SATAG, no quitarles niveles. Los dormidos tampoco:
// esperan seis meses.
//
// Una fila por TAG, con el numero de departamento destino de ZK (los del 5-oct, mas
// Empleado_PPF = 25 del 6-oct) y el motivo con su evidencia. Primero lo urgente: quien
// usa la pluma y hoy esta en un departamento que lo rechaza.
//
//   node Campo/herramientas/movimientos-zk.mjs --datos Campo/datos/2026-10-06
import path from "node:path";
import { createRequire } from "node:module";
import fsMod from "node:fs";
const require_fs = () => fsMod;
import { abrir, escribirXlsx, RAIZ } from "./fuentes.mjs";

const i = process.argv.indexOf("--datos");
const dir = process.argv[i + 1];
const dia = path.basename(dir);
const F = abrir(dir);
const X = createRequire(path.join(RAIZ, "package.json"))("xlsx");
const libro = X.readFile(path.join(F.DATOS, `personas-${dia}.xlsx`));
const P = X.utils.sheet_to_json(libro.Sheets.Personas, { defval: "" });
const T = X.utils.sheet_to_json(libro.Sheets.TAGs, { defval: "" });
const zk = new Map(F.zkPersonas().map((r) => [r.tarjeta, r]));

const DEPTO = {
  "Padres de familia": "19", BAJAS: "10", Empleado_PPF: "25", Alumnos: "20",
  PREESCOLAR: "9", PRIMARIA: "4", SECUNDARIA: "11", PREPARATORIA: "12", DEPORTES: "13",
  TALLERES: "14", MANTENIMIENTO: "15", ADMINISTRACION: "16",
};
const NOMBRE_DEPTO = { "19": "Padres de familia", "10": "BAJAS", "25": "Empleado_PPF", "20": "Alumnos", "9": "PREESCOLAR DOCENTES", "4": "PRIMARIA DOCENTE", "11": "SECUNDARIA DOCENTES", "12": "PREPARATORIA DOCENTES", "13": "DEPORTES EXTRAESCOLARES", "14": "TEX DOCENTES", "15": "MANTENIMIENTO", "16": "Administracion" };

// «su depto de personal (GES: PRIMARIA)» -> 4. Lo que no tenga equivalente se deja a TI.
function destino(texto) {
  if (DEPTO[texto]) return DEPTO[texto];
  const m = /GES: ([^)]+)\)/.exec(texto);
  if (!m) return "";
  const area = m[1].normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const k = Object.keys(DEPTO).find((d) => area.startsWith(d));
  return k ? DEPTO[k] : "";
}

// Decisiones por TAG (decisiones-personas.csv): «destino ZK» fija el departamento y
// «no mover» saca el TAG de la lista.
const decisiones = new Map();
{
  const ruta = path.join(F.DATOS, "decisiones-personas.csv");
  if (require_fs().existsSync(ruta))
    for (const r of X.utils.sheet_to_json(X.read(require_fs().readFileSync(ruta, "utf8"), { type: "string", raw: true }).Sheets.Sheet1, { defval: "", raw: false })) decisiones.set(String(r.TAG), r);
}
const filas = [];
for (const p of P) {
  for (const a of p["Acciones propuestas"].split(" · ").filter((x) => x.startsWith("ZK: TAG"))) {
    if (/sin uso \(usa el/.test(a)) continue; // decision: solo documentar
    const tag = /TAG (\d+)/.exec(a)[1];
    const t = T.find((x) => String(x.TAG) === tag);
    let a_ = "";
    if (/a BAJAS y quitar niveles|a BAJAS SOLO SI/.test(a)) a_ = "BAJAS";
    else if (/ya esta en BAJAS pero conserva niveles/.test(a)) a_ = "BAJAS";
    else a_ = (/ a «([^»]+)»$/.exec(a) ?? /a (su depto de personal \(GES: [^)]+\))/.exec(a) ?? [])[1] ?? "";
    const dec = decisiones.get(tag);
    if (dec?.clasificacion === "no mover") continue;
    const id = dec?.clasificacion === "destino ZK" ? String(dec.tipo) : destino(a_);
    // BAJAS en ZK puede ser una baja DEL TAG (despegado, danado), no de la persona
    // (Gerardo, 6-oct: un TAG dado de baja por mal uso): nada sale de BAJAS sin preguntarle a TI por que esta ahi.
    const enBajas = /^BAJAS$/i.test(t?.["Depto ZK"] ?? "") && id !== "10";
    const urgente = /BAJAS|Falta de informaci|Alumnos|Ex alumnos/i.test(t?.["Depto ZK"] ?? "") && Number(t?.Aperturas ?? 0) > 0 && id !== "10";
    filas.push({
      Prioridad: /SOLO SI se confirma/.test(a) ? "4 CONFIRMAR antes de BAJAS (baja sin fecha o cargo directivo)" : enBajas ? "1 VERIFICAR con TI: esta en BAJAS (¿baja del TAG o de la persona?)" : urgente ? "1 URGENTE: usa la pluma y su departamento lo frena" : id === "10" ? "3 a BAJAS" : "2 cambio de departamento",
      TAG: tag,
      "ID en ZK": zk.get(tag)?.idZk ?? "",
      Nombre: p.Nombre,
      "Departamento hoy": t?.["Depto ZK"] ?? "",
      "Plumas hoy": t?.Plumas || "ninguna",
      "Pasar a (ID)": id || "(definir)",
      "Pasar a (nombre)": NOMBRE_DEPTO[id] ?? a_,
      "Quitar niveles": id === "10" ? "si" : "",
      Motivo: p.Categoria,
      "Evidencia GES": p["Familia GES"] || p["Puesto GES"],
      "Aperturas 14-sep a hoy": Number(t?.Aperturas ?? 0),
      "Ultimo paso": t?.["Ultimo paso"] ?? "",
    });
  }
}
// Excepciones de acceso decididas por TI (casos-por-registrar.csv): niveles a mano.
{
  const ruta = path.join(F.DATOS, "casos-por-registrar.csv");
  if (require_fs().existsSync(ruta)) {
    const R = X.utils.sheet_to_json(X.read(require_fs().readFileSync(ruta, "utf8"), { type: "string" }).Sheets.Sheet1, { defval: "", raw: false });
    for (const c of R.filter((c) => c.tipo === "excepcion de acceso" && c.estado !== "resuelto")) {
      const t = T.find((x) => String(x.TAG) === String(c.tag));
      filas.push({
        Prioridad: "2 excepcion de acceso (nivel a mano)", TAG: String(c.tag), "ID en ZK": zk.get(String(c.tag))?.idZk ?? "", Nombre: c.persona,
        "Departamento hoy": t?.["Depto ZK"] ?? "", "Plumas hoy": t?.Plumas || "ninguna", "Pasar a (ID)": "(no cambia)", "Pasar a (nombre)": "(no cambia)",
        "Quitar niveles": "", Motivo: c.regla_o_accion, "Evidencia GES": c.evidencia, "Aperturas 14-sep a hoy": Number(t?.Aperturas ?? 0), "Ultimo paso": t?.["Ultimo paso"] ?? "",
      });
    }
  }
}
filas.sort((a, b) => a.Prioridad.localeCompare(b.Prioridad) || b["Aperturas 14-sep a hoy"] - a["Aperturas 14-sep a hoy"]);
const salida = path.join(F.DATOS, `movimientos-planeados-zk-${dia}.xlsx`);
escribirXlsx(salida, {
  "Movimientos planeados": filas,
  Leyenda: [
    { Que: "Origen", Detalle: `Tabla por persona del ${dia} (ZK, eventos 14-sep a ${dia}, GES familias/profesores/empleados, SATAG y la hoja).` },
    { Que: "Empleado_PPF (25)", Detalle: "Personal que tambien es padre de familia: abre las dos plumas; se estaciona en el lote de su departamento y usa el otro solo para recoger a sus hijos." },
    { Que: "Ojo", Detalle: "Mientras SATAG no guarde la marca Empleado_PPF (bloque 89), una importacion del archivo de SATAG puede regresar a alguien del 25 a su departamento anterior. Revisar el aviso al importar." },
    { Que: "No incluye", Detalle: "TAGs sin uso de personas que usan otro (se documentan en SATAG) ni dormidos (observacion 6 meses)." },
  ],
});
const c = filas.reduce((m, f) => ((m[f.Prioridad] = (m[f.Prioridad] ?? 0) + 1), m), {});
console.log(`${filas.length} cambios · ${JSON.stringify(c)} · sin destino definido: ${filas.filter((f) => f["Pasar a (ID)"] === "(definir)").length}`);
for (const f of filas) console.log([f.Prioridad.slice(0, 1), f.TAG, f.Nombre, f["Departamento hoy"], "->", f["Pasar a (ID)"], f["Pasar a (nombre)"], `ap ${f["Aperturas 14-sep a hoy"]}`, f.Motivo, String(f["Evidencia GES"]).slice(0, 50)].join(" | "));
