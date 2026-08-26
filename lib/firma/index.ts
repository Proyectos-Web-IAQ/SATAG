// Modulo de firma manuscrita digital (CC-08). Unica puerta de entrada: lo que
// otro sistema del IAQ necesita se importa de "@/lib/firma" y la carpeta se
// copia tal cual. Ver README.md de esta carpeta.
export { default as SignaturePad } from "./SignaturePad";
export type { FirmaTrazos } from "./SignaturePad";
export type { Firma } from "./tipos";
export { sha256Hex, subirFirma, rutaEnBucket, urlFirmada, verificarImagen } from "./servicio";
export type { OpcionesBucket } from "./servicio";
