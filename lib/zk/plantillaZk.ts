// Puente SATAG -> ZKBioSecurity, en el navegador (SC-025).
//
// Genera el archivo de importacion de personal de ZK a partir de su plantilla
// oficial (public/zk/plantilla-importacion-personal.xls). La plantilla trae en
// los encabezados unas "anotaciones" (comentarios de celda) con el nombre
// interno de cada campo; el importador de ZK las lee para mapear columnas y
// rechaza cualquier archivo que no las traiga. Se escribe .xlsx porque SheetJS
// conserva los comentarios en xlsx y los pierde en xls (probado el 8-sep-2026).
//
// Reglas del IAQ (Campo/01 - Puente SATAG-ZKBioSecurity.md):
//   - ID (pin): el No. de TAG, o el ID que ya tiene ZK si se carga su export,
//     para que el import ACTUALICE a la persona en vez de duplicarla.
//   - Tarjeta = No. de TAG. Codigo de Auto Gestion = 123456.
//   - La PLACA va en Celular: "Placa Vehicular" de ZK valida formato y rechaza
//     placas mexicanas (la fila entera falla).
// La misma logica vive en Campo/herramientas/generar-import-zk*.cjs para la
// linea de comandos.
import type { Registro, TipoUsuario } from "@/lib/mock/types";

export const COLUMNAS_ZK = [
  "ID", "Nombre", "Apellido", "ID de Departamento", "Nombre de Departamento",
  "Género", "Cumpleaños", "Contraseña", "Tipo de Documento", "No. de Documento",
  "Tarjeta", "Placa Vehicular", "Email", "Código de Auto Gestión", "Celular",
  "Tipo de Usuario", "Contratación", "Puesto", "Calle", "Lugar de Nacimiento",
  "País", "Teléfono de Casa", "Dirección de Casa", "Teléfono de Oficina", "Dirección de Oficina",
] as const;

export const DEPTOS_ZK: Record<TipoUsuario, { id: string; nombre: string }> = {
  padres: { id: "7", nombre: "Padres de familia" },
  maestro: { id: "6", nombre: "Maestros" },
  alumno: { id: "5", nombre: "Alumnos" },
  admin: { id: "2", nombre: "Administración" },
};

export const CODIGO_AUTOGESTION = "123456";
const RUTA_PLANTILLA = "/zk/plantilla-importacion-personal.xls";
const COL_ID = 0, COL_NOMBRE = 1, COL_APELLIDO = 2, COL_DEPTO_ID = 3, COL_DEPTO_NOMBRE = 4,
  COL_TARJETA = 10, COL_CODIGO = 13, COL_CELULAR = 14;

export interface FilaZk {
  id: string;
  nombre: string;
  apellido: string;
  deptoId: string;
  deptoNombre: string;
  tarjeta: string;
  celular: string;
}

// Pre-alta: la tarjeta existe en ZK con un nombre que grita que esta libre.
export function filaStock(tag: string): FilaZk {
  return {
    id: tag, nombre: "DISPONIBLE", apellido: "STOCK SATAG",
    deptoId: DEPTOS_ZK.padres.id, deptoNombre: DEPTOS_ZK.padres.nombre,
    tarjeta: tag, celular: "",
  };
}

// Padron instalado: actualiza la misma tarjeta con la persona real.
export function filaPadron(r: Registro, idZk?: string): FilaZk | null {
  if (!r.noDispositivo) return null;
  const { nombre, apellido } = separarNombre(r.usuarioNombre);
  const depto = DEPTOS_ZK[r.tipoUsuario] ?? DEPTOS_ZK.padres;
  return {
    id: idZk ?? r.noDispositivo,
    nombre: nombre.toUpperCase(),
    apellido: apellido.toUpperCase(),
    deptoId: depto.id, deptoNombre: depto.nombre,
    tarjeta: r.noDispositivo,
    celular: (r.placas ?? "").toUpperCase(),
  };
}

// Colapsa particulas (de/del/la/los/las/y) con el token siguiente para que
// "Alfonso Fuentes de los Santos" parta como Alfonso | Fuentes de los Santos.
export function separarNombre(completo: string): { nombre: string; apellido: string } {
  const PART = new Set(["de", "del", "la", "las", "los", "y"]);
  const raw = completo.trim().replace(/\s+/g, " ").split(" ");
  const p: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    let t = raw[i];
    while (PART.has(t.split(" ").pop()!.toLowerCase()) && i + 1 < raw.length) { i++; t += " " + raw[i]; }
    p.push(t);
  }
  if (p.length <= 1) return { nombre: completo.trim(), apellido: "" };
  if (p.length === 2) return { nombre: p[0], apellido: p[1] };
  return { nombre: p.slice(0, -2).join(" "), apellido: p.slice(-2).join(" ") };
}

// Export de ZK (Usuarios_*.csv: UTF-16LE con tabuladores, titulo + encabezados
// + datos). Devuelve tarjeta -> ID de ZK, para conservar el ID al actualizar.
export function parsearExportZk(texto: string): Map<string, string> {
  const mapa = new Map<string, string>();
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  for (const l of lineas.slice(2)) {
    const c = l.split("\t").map((x) => x.trim());
    if (c[COL_TARJETA] && c[COL_ID]) mapa.set(c[COL_TARJETA], c[COL_ID]);
  }
  return mapa;
}

export async function leerExportZk(archivo: File): Promise<Map<string, string>> {
  const bytes = await archivo.arrayBuffer();
  return parsearExportZk(new TextDecoder("utf-16le").decode(bytes));
}

function aArreglo(f: FilaZk): string[] {
  const fila = new Array<string>(COLUMNAS_ZK.length).fill("");
  fila[COL_ID] = f.id; fila[COL_NOMBRE] = f.nombre; fila[COL_APELLIDO] = f.apellido;
  fila[COL_DEPTO_ID] = f.deptoId; fila[COL_DEPTO_NOMBRE] = f.deptoNombre;
  fila[COL_TARJETA] = f.tarjeta; fila[COL_CODIGO] = CODIGO_AUTOGESTION; fila[COL_CELULAR] = f.celular;
  return fila;
}

// .xlsx sobre la plantilla oficial: filas 1 y 2 intactas (con anotaciones),
// datos desde la fila 3, todo como texto. En ZK: Fila de Inicio = 2,
// "Actualizar el ID de usuario existente" = Si.
export async function generarXlsxZk(filas: FilaZk[]): Promise<Blob> {
  if (filas.length === 0) throw new Error("No hay filas que exportar.");
  const XLSX = await import("xlsx");
  const resp = await fetch(RUTA_PLANTILLA);
  if (!resp.ok) throw new Error("No se pudo cargar la plantilla de ZK del sitio. Recargue la pagina e intente de nuevo.");
  const wb = XLSX.read(await resp.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const datos = filas.map(aArreglo);
  XLSX.utils.sheet_add_aoa(ws, datos, { origin: "A3" });
  for (let r = 0; r < datos.length; r++) {
    for (let c = 0; c < COLUMNAS_ZK.length; c++) {
      const celda = ws[XLSX.utils.encode_cell({ r: 2 + r, c })];
      if (celda) celda.t = "s";
    }
  }
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 1 + datos.length, c: COLUMNAS_ZK.length - 1 } });
  const salida = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([salida], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// Respaldo: el mismo contenido en el formato del export de ZK (UTF-16LE con
// tabuladores), para convertirlo con Campo/herramientas/convertir-zk-a-xls.ps1
// si el importador no aceptara el .xlsx.
export function generarCsvZk(filas: FilaZk[]): Blob {
  const contenido = "Usuarios" + "\t".repeat(COLUMNAS_ZK.length - 1) + "\r\n"
    + COLUMNAS_ZK.join("\t") + "\r\n"
    + filas.map((f) => aArreglo(f).join("\t")).join("\r\n") + "\r\n";
  const bytes = new Uint8Array(2 + contenido.length * 2);
  bytes[0] = 0xff; bytes[1] = 0xfe;
  for (let i = 0; i < contenido.length; i++) {
    const code = contenido.charCodeAt(i);
    bytes[2 + i * 2] = code & 0xff;
    bytes[3 + i * 2] = code >> 8;
  }
  return new Blob([bytes], { type: "text/csv" });
}

export function descargarArchivo(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fechaArchivo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
