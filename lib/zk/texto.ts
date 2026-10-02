// Leer los archivos que exporta ZKBioSecurity: la parte que no depende de QUE
// export sea.
//
// POR QUE EXISTE ESTE ARCHIVO. ZK exporta en UTF-16LE con tabuladores y una linea
// de titulo antes de los encabezados, y esa forma es identica en todos sus
// reportes: usuarios, departamentos, dispositivos, eventos. La deteccion de
// codificacion vivia dentro de `plantillaZk.ts` sin exportarse, y en las
// herramientas de `Campo/` esta copiada siete veces. Dos copias de un decodificador
// se separan: una gana una correccion y la otra no, y el sintoma es un archivo que
// se lee bien en un lado y sale con un caracter nulo entre cada letra en el otro.
//
// Lo que NO se movio aqui a proposito: el cuerpo de `parsearExportZk`, que valida
// tarjeta e ID con sus propias expresiones. Esa funcion esta en produccion y
// refactorizarla mientras se agrega una capacidad nueva es cambiar dos cosas a la
// vez; cuando algo falle no se sabria cual de las dos fue.

// ZK corta sus exports en 40,000 filas sin avisar. No es una suposicion: el
// archivo del 29-sep-2026 trajo exactamente 40,000 y por eso solo cubrio ocho dias
// en vez del mes que se le pidio. Un archivo que llega al tope esta truncado, y
// tratarlo como completo es lo que hace que una credencial activa parezca muerta.
export const TOPE_EXPORT_ZK = 40000;

// ZK exporta el CSV en UTF-16LE con BOM; por si cambiara, se detecta la
// codificacion en vez de suponerla. Sin BOM se cuenta cuantos bytes cero hay en
// posiciones impares: en UTF-16LE el texto latino deja un cero despues de casi cada
// caracter, y en UTF-8 no deja ninguno.
export function decodificarExportZk(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes);
  let ceros = 0;
  const n = Math.min(bytes.length, 4000);
  for (let i = 1; i < n; i += 2) if (bytes[i] === 0) ceros++;
  return new TextDecoder(ceros > n / 8 ? "utf-16le" : "utf-8").decode(bytes);
}

// Un .xls/.xlsx no es el export de texto. Se reconoce por su firma de bytes y se
// rechaza ANTES de intentar decodificarlo, porque decodificar un binario como
// UTF-16 no falla: produce basura y el error aparece mucho despues, disfrazado de
// «el archivo no trae datos».
export function esArchivoBinario(bytes: Uint8Array): boolean {
  const esZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const esOle = bytes[0] === 0xd0 && bytes[1] === 0xcf;
  return esZip || esOle;
}

/**
 * El texto del export, venga como ZK lo propone por defecto (Excel binario) o como
 * CSV/TXT.
 *
 * ZK ofrece Excel en el dialogo de exportar y la gente acepta lo que se le ofrece:
 * los tres archivos que llegaron entre el 1 y el 2 de octubre son .xls. Rechazarlos
 * para ahorrarse una dependencia era pedirle a la persona que repitiera el export por
 * una razon tecnica nuestra. SheetJS ya viaja en el panel —lo usa el puente a ZK—
 * asi que leerlos no cuesta un byte mas; se importa en diferido para que el camino
 * del CSV siga sin cargarlo.
 *
 * Probado con el archivo real del 2-oct: 40,000 filas en 0.8 s, y la columna Tiempo
 * sale como texto «2026-10-02 08:19:24», igual que en el CSV, porque ZK la escribe
 * como texto y no como fecha de Excel.
 */
export async function textoDeExportZk(bytes: Uint8Array): Promise<string> {
  if (!esArchivoBinario(bytes)) return decodificarExportZk(bytes);
  let texto: string | null = null;
  try {
    const XLSX = await import("xlsx");
    const libro = XLSX.read(bytes, { type: "array" });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    if (hoja) texto = XLSX.utils.sheet_to_csv(hoja, { FS: "\t" });
  } catch {
    texto = null;
  }
  if (texto === null) {
    throw new Error(
      "No se pudo leer el archivo como Excel. Vuelva a exportarlo desde ZKBioSecurity, en Excel o en CSV, y elija ese archivo.",
    );
  }
  return texto;
}

export interface TablaZk {
  cab: string[];
  filas: Record<string, string>[];
  /** Cuantas filas de datos trajo el archivo, antes de cualquier filtro. */
  total: number;
  /** El archivo llego al tope de ZK: faltan dias y hay que decirlo. */
  topeAlcanzado: boolean;
}

/**
 * Parte un export de ZK en encabezados y filas.
 *
 * Busca la fila de encabezados en las primeras cinco lineas exigiendo que
 * aparezcan todos los `rotulos` que se le pasen, en vez de suponer que es la
 * segunda. ZK pone una linea de titulo antes —«Todos los Eventos» seguido de
 * tabuladores— pero esa linea no siempre esta, y suponerla desplaza TODAS las
 * columnas una posicion sin que nada falle: el resultado son conteos plausibles y
 * equivocados, que es el peor error posible.
 */
export function tablaZk(texto: string, rotulos: string[]): TablaZk {
  const lineas = texto
    .replace(/﻿/g, "")
    .replace(/ /g, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");

  let inicio = -1;
  let cab: string[] = [];
  for (let i = 0; i < Math.min(lineas.length, 5); i++) {
    const c = lineas[i].split("\t").map((x) => x.trim());
    if (rotulos.every((r) => c.includes(r))) {
      cab = c;
      inicio = i + 1;
      break;
    }
  }
  if (inicio < 0) return { cab: [], filas: [], total: 0, topeAlcanzado: false };

  const filas = lineas.slice(inicio).map((l) => {
    const c = l.split("\t");
    return Object.fromEntries(cab.map((k, i) => [k, (c[i] ?? "").trim()]));
  });

  return { cab, filas, total: filas.length, topeAlcanzado: filas.length >= TOPE_EXPORT_ZK };
}

// El numero de TAG es la unica llave que comparten la hoja de calculo, ZK y SATAG.
// Se compara sin espacios ni ceros a la izquierda porque la hoja se llena a mano y
// ZK exporta lo que le cargaron, asi que el mismo dispositivo aparece como
// «13078010» y como « 013078010 » segun quien lo escribio.
export function normalizarTag(valor: string | null | undefined): string {
  return String(valor ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "");
}
