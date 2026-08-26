# Módulo de firma manuscrita digital

Captura una firma en pantalla, la guarda en un bucket privado y la vuelve a mostrar con un enlace
temporal. Nació en SATAG (CC-08, decisión de Dirección del 03-jul-2026) para reutilizarse en otros
sistemas del IAQ: **no importa nada del dominio de SATAG** y se copia tal cual.

## Qué incluye

| Archivo | Qué hace |
|---|---|
| `SignaturePad.tsx` | Componente React: lienzo táctil/mouse → PNG (`onChange`) y trazos vectoriales con tiempo y presión (`onTrazos`). `trazosIniciales` repinta una firma ya capturada si el componente se vuelve a montar. Sin dependencias. |
| `servicio.ts` | `subirFirma(cliente, dataUrl, { bucket })` → `{ ruta, sha256 }`; `urlFirmada(cliente, ruta, { bucket, segundos })`; `verificarImagen(cliente, ruta, sha256, { bucket })`; `sha256Hex`; `rutaEnBucket`. |
| `tipos.ts` | `Firma` (lo que un sistema conserva) y `FirmaTrazos` (el vector). |
| `index.ts` | Única puerta: `import { SignaturePad, subirFirma, urlFirmada } from "@/lib/firma"`. |

## Qué NO incluye (y por qué)

- **El hash legal del paquete firmado** (documento + versión + firmante + sello de tiempo). Lo genera
  la base de datos del sistema que adopta el módulo, para que el cliente no pueda fabricarlo. En SATAG
  lo hace `crear_registro` (`supabase/sql/19_rpc_crear_registro.sql`): recibe `ruta`, `sha256` y
  `trazos`, arma el paquete canónico y lo sella. Copie ese patrón, no el RPC.
- **La tabla de evidencia y su RLS.** En SATAG es `aceptaciones` (bloque 15) y la vista
  `v_evidencia_firma` (bloque 47). Cada sistema decide qué guarda y quién lo lee.
- **El visor.** `components/admin/EvidenciaFirma.tsx` es de SATAG (lee su vista); para otro sistema
  basta `urlFirmada` y pintar un `<img>`.

## Cómo llevarlo a otro sistema

1. Copie la carpeta `lib/firma/` completa. Requiere React y `@supabase/supabase-js`.
2. Cree un bucket **privado** (en SATAG: `firmas`, bloque 20) con estas políticas mínimas: el rol que
   firma solo **inserta** (`anon` en SATAG), sin listar ni leer; los roles que revisan **leen**;
   límite de tamaño y `image/png`.
3. En el formulario: `<SignaturePad onChange={setPng} onTrazos={setTrazos} trazosIniciales={trazos} />`.
4. Al enviar: `const { ruta, sha256 } = await subirFirma(cliente, png, { bucket: "firmas" });` y pase
   `ruta`, `sha256` y `trazos` al RPC que crea la evidencia y calcula el hash legal.
5. Para mostrarla: `const url = await urlFirmada(cliente, ruta, { bucket: "firmas", segundos: 60 });`.
6. Para auditar que la imagen no cambió: `await verificarImagen(cliente, ruta, sha256, { bucket })`.

## Lo que la firma prueba y lo que no

Es **evidencia de aceptación** (art. 89 y ss. del Código de Comercio: mensaje de datos con firma
electrónica simple), no una firma electrónica avanzada: prueba que alguien trazó a mano una firma sobre
un texto concreto, en un momento concreto, y que ni la imagen ni el paquete cambiaron después. No
verifica la identidad del firmante. El análisis completo está en
`Desarrollo/06 - Firma Electronica (mecanica y valor legal).md`.
