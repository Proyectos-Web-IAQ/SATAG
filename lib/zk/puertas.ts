// Los reportes «Personal de Apertura» de ZK: quien tiene acceso a cada puerta (bloque 93).
//
// ZK los exporta uno por puerta (Acceso › Reportes; en ZK 3.1.5 «Privilegios por
// Puerta»): Entrada 1, Salida 1, Entrada 2 y Salida 2. Traen el ID de la persona,
// su nombre y su departamento, SIN la tarjeta; el padron guardado liga el ID con
// la tarjeta. De aqui solo viajan los IDs: el nombre ya esta en el padron.
//
// La puerta se toma del titulo que ZK escribe en la primera fila («Salida 2(2)
// Personal de Apertura») y, si no viene, del nombre del archivo: asi un archivo
// renombrado sigue sirviendo y uno equivocado se rechaza.

import { tablaZk, textoDeExportZk } from "@/lib/zk/texto";
import { exportadoEnDe } from "@/lib/zk/eventos";

export type PuertaZk = "E1-entrada" | "E1-salida" | "E2-entrada" | "E2-salida";

export const NOMBRE_PUERTA: Record<PuertaZk, string> = {
  "E1-entrada": "Entrada 1",
  "E1-salida": "Salida 1",
  "E2-entrada": "Entrada 2",
  "E2-salida": "Salida 2",
};

export interface LecturaPuerta {
  puerta: PuertaZk;
  /** Los IDs de ZK con acceso a esa puerta, sin repetir. */
  ids: string[];
  filasArchivo: number;
  exportadoEn: string | null;
}

/** «Salida 2(2) Personal de Apertura…» -> E2-salida. */
export function puertaDe(texto: string): PuertaZk | null {
  const m = /\b(entrada|salida)\s*([12])\s*\(/i.exec(texto.normalize("NFC"));
  if (!m) return null;
  return `E${m[2]}-${m[1].toLowerCase()}` as PuertaZk;
}

/** Lee el texto del reporte (ya decodificado). `nombre` es el del archivo, de respaldo. */
export function parsearPuertaZk(texto: string, nombre: string): LecturaPuerta {
  const primeras = texto.split(/\r?\n/).slice(0, 3).join(" ");
  const puerta = /personal de apertura/i.test(primeras) ? puertaDe(primeras) ?? puertaDe(nombre) : puertaDe(nombre);
  if (!puerta) {
    throw new Error(
      "No se reconoce de que puerta es el reporte. Exporte desde ZK el «Personal de Apertura» de Entrada 1, Salida 1, Entrada 2 o Salida 2.",
    );
  }
  const t = tablaZk(texto, ["ID", "Departamento"]);
  if (t.cab.length === 0) {
    throw new Error("El archivo no trae las columnas de un «Personal de Apertura» de ZK (ID y Departamento).");
  }
  const ids = [...new Set(t.filas.map((f) => (f["ID"] ?? "").trim()).filter((id) => /^[0-9A-Za-z]+$/.test(id)))];
  return { puerta, ids, filasArchivo: t.total, exportadoEn: exportadoEnDe(nombre) };
}

/** Lee el archivo tal como lo entrega el navegador (Excel o CSV de ZK). */
export async function leerPuertaZk(archivo: File): Promise<LecturaPuerta> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  return parsearPuertaZk(await textoDeExportZk(bytes), archivo.name);
}
