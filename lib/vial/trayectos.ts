// La calle: los archivos del muestreador de Análisis Vial (trayectos-AAAA-MM-DD.csv) y el
// catálogo de rutas (bloque 107).
//
// El CSV trae una fila por ruta y ranura con lo que tardó con tráfico y sin tráfico, y
// además la polilínea y la velocidad por tramo (JSON entre comillas, con comas adentro).
// Por eso no sirve `tablaZk`, que parte por tabulador: aquí va un lector CSV de verdad.
// A SATAG solo entra lo que mide la calle: ni polilínea, ni tramos, ni muestras con error,
// ni la ruta personal (`ruta_felipe_angeles`), que no está en el catálogo.

import { decodificarExportZk } from "@/lib/zk/texto";

export type TipoRuta = "pluma" | "paso" | "salida" | "control" | "testigo" | "circuito";
export interface RutaVial { id: string; nombre: string; tipo: TipoRuta }

/** Las rutas del experimento (analisis_vial/scripts/config/corredores.json, 27-oct). */
export const RUTAS_VIAL: RutaVial[] = [
  { id: "corredor_1792181305415", nombre: "Cola B. Quintana → entrada del circuito", tipo: "circuito" },
  { id: "rec_ap_bq_se_circ_in", nombre: "Llegada por B. Quintana (sureste)", tipo: "pluma" },
  { id: "rec_ap_bq_no_circ_in", nombre: "Llegada por B. Quintana (noroeste)", tipo: "pluma" },
  { id: "rec_ap_canada_se_circ_in", nombre: "Llegada por Loma de la Cañada (sureste)", tipo: "pluma" },
  { id: "rec_ap_fundadores_or_circ_in", nombre: "Llegada por Av. Fundadores (oriente)", tipo: "pluma" },
  { id: "rec_ap_caballero_po_circ_in", nombre: "Llegada por Juan Caballero y Ocio (poniente)", tipo: "pluma" },
  { id: "rec_ctrl_norte_ini_ctrl_norte_fin", nombre: "Control: B. Quintana hacia el norte, a 3.5 km", tipo: "control" },
  { id: "rec_ap_arcos_so_circ_in", nombre: "Llegada por Calz. de los Arcos (suroeste)", tipo: "paso" },
  { id: "rec_ap_carretas_or_circ_in", nombre: "Llegada por Camino Real de Carretas (oriente)", tipo: "paso" },
  { id: "rec_ctrl_sur_ini_ctrl_sur_fin", nombre: "Control: B. Quintana hacia el sur, a 3.5 km", tipo: "testigo" },
  { id: "sal_circ_out_ap_bq_se", nombre: "Salida del circuito → B. Quintana (sureste)", tipo: "salida" },
  { id: "sal_circ_out_ap_bq_no", nombre: "Salida del circuito → B. Quintana (noroeste)", tipo: "salida" },
  { id: "sal_e2_ap_bq_se", nombre: "Salida de E2 → B. Quintana (sureste)", tipo: "salida" },
  { id: "sal_e2_ap_arcos_so", nombre: "Salida de E2 → Calz. de los Arcos (suroeste)", tipo: "salida" },
];
const RUTA = new Map(RUTAS_VIAL.map((r) => [r.id, r]));

export interface MuestraVial { rutaId: string; fecha: string; ranura: string; duracionS: number; libreS: number }
export interface LecturaTrayectos { archivo: string; muestras: MuestraVial[]; filas: number; conError: number; fuera: number; fechas: string[] }

/** CSV con comillas: campos con comas y comillas dobles («""») adentro, CRLF o LF, BOM. */
export function partirCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  const filas: string[][] = [];
  let campo = "", fila: string[] = [], q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') q = false;
      else campo += c;
    } else if (c === '"') q = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      fila.push(campo); campo = "";
      if (fila.some((x) => x !== "")) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); if (fila.some((x) => x !== "")) filas.push(fila); }
  return filas;
}

const COLUMNAS = ["fecha", "ventana_5min", "trayecto_id", "duracion_s", "duracion_sin_trafico_s", "estado"] as const;

export function parsearTrayectos(texto: string, archivo = "trayectos.csv"): LecturaTrayectos {
  const [cab, ...resto] = partirCsv(texto);
  if (!cab) throw new Error(`«${archivo}» está vacío.`);
  const col = Object.fromEntries(COLUMNAS.map((k) => [k, cab.indexOf(k)])) as Record<(typeof COLUMNAS)[number], number>;
  const faltan = COLUMNAS.filter((k) => col[k] < 0);
  if (faltan.length) throw new Error(`«${archivo}» no parece un archivo del muestreador: le falta ${faltan.join(", ")}.`);
  const muestras: MuestraVial[] = [];
  let conError = 0, fuera = 0;
  for (const f of resto) {
    if (f[col.estado] !== "exitoso") { conError += 1; continue; }
    const rutaId = f[col.trayecto_id];
    if (!RUTA.has(rutaId)) { fuera += 1; continue; }
    const duracionS = Math.round(Number(f[col.duracion_s]));
    const libreS = Math.round(Number(f[col.duracion_sin_trafico_s]));
    const fecha = f[col.fecha], ranura = f[col.ventana_5min];
    if (!(duracionS > 0) || !(libreS > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(ranura)) { conError += 1; continue; }
    muestras.push({ rutaId, fecha, ranura, duracionS, libreS });
  }
  return { archivo, muestras, filas: resto.length, conError, fuera, fechas: [...new Set(muestras.map((m) => m.fecha))].sort() };
}

export async function leerTrayectos(archivo: File): Promise<LecturaTrayectos> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  return parsearTrayectos(decodificarExportZk(bytes), archivo.name);
}

export const tipoDeRuta = (id: string): TipoRuta | null => RUTA.get(id)?.tipo ?? null;
