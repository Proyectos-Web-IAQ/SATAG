// Servicio de firma manuscrita digital: subir el PNG a un bucket privado,
// calcular su SHA-256, emitir una URL firmada temporal para verlo y comprobar
// que la imagen guardada sigue siendo la que se firmo.
//
// Sin dependencias del dominio de SATAG: el cliente de Supabase y el bucket
// llegan por parametro. Lo que SI es de cada sistema, y por eso no esta aqui,
// es el hash legal del paquete firmado (documento + version + firmante + sello
// de tiempo): lo genera la base de datos del sistema que adopta el modulo
// (en SATAG, crear_registro, bloque 19) para que el cliente no pueda fabricarlo.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OpcionesBucket {
  /** Bucket privado donde viven las imagenes (en SATAG: "firmas"). */
  bucket: string;
}

/** SHA-256 en hex (minusculas). Requiere contexto seguro (HTTPS o localhost). */
export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Sube el PNG (data URL del SignaturePad) al bucket privado con nombre
 * aleatorio y devuelve la ruta CON el bucket adelante ("firmas/<uuid>.png"),
 * que es lo que se guarda como evidencia, y el SHA-256 de la imagen.
 * No hace upsert: una firma nunca se sobreescribe.
 */
export async function subirFirma(
  cliente: SupabaseClient,
  dataUrl: string,
  { bucket }: OpcionesBucket,
): Promise<{ ruta: string; sha256: string }> {
  const blob = await (await fetch(dataUrl)).blob();
  const sha256 = await sha256Hex(await blob.arrayBuffer());
  const nombre = `${crypto.randomUUID()}.png`;
  const { error } = await cliente.storage
    .from(bucket)
    .upload(nombre, blob, { contentType: "image/png", upsert: false });
  if (error) throw new Error(`No se pudo subir la firma: ${error.message}`);
  return { ruta: `${bucket}/${nombre}`, sha256 };
}

/**
 * La ruta guardada lleva el bucket adelante; el SDK de Storage ya recibe el
 * bucket por su cuenta y espera la ruta SIN ese prefijo. Pasarsela completa
 * hace que busque "firmas/firmas/<uuid>.png" y responda "no encontrado".
 */
export function rutaEnBucket(ruta: string, bucket: string): string {
  const limpia = ruta.trim().replace(/^\/+/, "");
  return limpia.startsWith(`${bucket}/`) ? limpia.slice(bucket.length + 1) : limpia;
}

/**
 * URL firmada temporal para mostrar la imagen. Corta a proposito: se pinta de
 * inmediato y el enlace deja de servir enseguida si alguien lo copia.
 * Lanza si Storage no la emite (sin permiso de lectura, ruta inexistente).
 */
export async function urlFirmada(
  cliente: SupabaseClient,
  ruta: string,
  { bucket, segundos }: OpcionesBucket & { segundos: number },
): Promise<string> {
  const { data, error } = await cliente.storage
    .from(bucket)
    .createSignedUrl(rutaEnBucket(ruta, bucket), segundos);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/**
 * Descarga la imagen y compara su SHA-256 con el que se guardo al firmar.
 * Devuelve true si coinciden. Necesita permiso de lectura sobre el bucket
 * (en SATAG: cualquier rol del panel).
 */
export async function verificarImagen(
  cliente: SupabaseClient,
  ruta: string,
  sha256Esperado: string,
  { bucket }: OpcionesBucket,
): Promise<boolean> {
  const { data, error } = await cliente.storage.from(bucket).download(rutaEnBucket(ruta, bucket));
  if (error || !data) throw new Error(error?.message ?? "No se pudo descargar la imagen.");
  const real = await sha256Hex(await data.arrayBuffer());
  return real === sha256Esperado.trim().toLowerCase();
}
