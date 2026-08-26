// Tipos del modulo de firma. FirmaTrazos vive junto al SignaturePad porque es
// lo que el componente emite; aqui se reexporta para que el modulo tenga una
// sola puerta.
export type { FirmaTrazos } from "./SignaturePad";
import type { FirmaTrazos } from "./SignaturePad";

/**
 * Lo que un sistema conserva de una firma. La imagen se guarda como ruta en
 * un bucket privado (nunca una URL publica); el hash legal lo genera la base
 * sobre el paquete canonico (documento + version + firmante + sello).
 */
export interface Firma {
  /** Ruta en Storage con el bucket adelante: "firmas/<uuid>.png". */
  imagenRuta: string;
  /** SHA-256 del PNG tal como se subio. */
  imagenSha256: string;
  /** Vector del trazo (puntos con tiempo y presion), si se conservo. */
  trazos?: FirmaTrazos | null;
  /** Hash del paquete firmado, generado por la base. */
  hashDocumento: string;
  /** Algoritmo del hash anterior (en SATAG: "sha256"). */
  hashAlgoritmo: string;
  /** ISO 8601, puesto por la base al firmar. */
  selloTiempo: string;
  firmanteNombre: string;
  /** Contexto del dispositivo (zona horaria, pantalla, app...). Opcional. */
  metadata?: Record<string, unknown>;
}
