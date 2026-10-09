/**
 * El SHA-256 de un archivo, en hexadecimal. Es lo unico del archivo que viaja tal
 * cual a la base, y lo que impide procesar dos veces el mismo export (ZK y GES).
 */
export async function huella(bytes: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
