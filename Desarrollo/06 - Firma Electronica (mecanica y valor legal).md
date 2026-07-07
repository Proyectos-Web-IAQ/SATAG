# Firma Electrónica — Mecánica y Valor Legal (SATAV)

> **Desarrollo · Fase 1 (Diseño)** · Apoyo a WBS 1.2.3 (Definición legal: aviso de privacidad +
> **mecánica de la firma**). Documento **de decisión**: sirve para acordar CON el IAQ qué nivel de
> firma se usará. **No es asesoría jurídica** — el criterio final lo da el área legal del IAQ.

| Proyecto | **SATAV** — Sistema de Adquisición de TAG Vehicular |
|---|---|
| Cliente | Instituto Asunción de Querétaro AC (IAQ) — interno |
| Responsable / Desarrollador | Gerardo Sánchez — Soporte TI Jr. |
| Fecha | 03-jul-2026 · Versión **v0.2** (borrador) |

**Historial:** v0.1 (mecánica + valor legal + opciones) · **v0.2** (nueva §9: la firma se diseña como
**módulo reutilizable** para otros sistemas del IAQ — decisión con Dirección, `CC-08`).

---

## 1. Qué usa SATAV hoy

El formulario captura la firma en un **lienzo (`<canvas>` de HTML5 + eventos de puntero)**: la persona
firma con el dedo o el mouse y se genera una **imagen PNG**. Sin librerías externas.

En términos legales, esto es una **firma electrónica *simple*** (firma manuscrita **digitalizada**).
**No** es una firma digital criptográfica (PKI) ni la **e.firma / Firma Electrónica Avanzada (FEA)** del
SAT.

---

## 2. Marco legal aplicable (México) — resumen

- **Código de Comercio, Título II "Comercio Electrónico" (arts. 89–114):**
  - *Art. 89 / 89 bis:* a un mensaje de datos y a una firma **no se le niegan efectos jurídicos solo por
    ser electrónicos**.
  - *Art. 97:* condiciones para que una firma se considere **"fiable"** (atribuible al firmante, bajo su
    control, y que permita detectar alteraciones).
  - Distingue **Firma Electrónica** (simple) de **Firma Electrónica Avanzada o Fiable** (mayor presunción).
- **NOM-151-SCFI-2016:** conservación de mensajes de datos; una **constancia de conservación** emitida por
  un **PSC** (Prestador de Servicios de Certificación) da prueba fuerte de integridad y fecha en el tiempo.
- **LFPDPPP:** la firma (imagen + nombre) es **dato personal** → debe guardarse en **almacenamiento
  privado** y estar en el aviso de privacidad. *(Ya contemplado: bucket privado + RLS.)*

**Idea clave:** la firma simple **sí puede tener valor probatorio**, pero **más débil** que la avanzada.
Quien la invoca debe **poder demostrar** dos cosas: **atribución** (quién firmó) e **integridad** (que el
documento no se alteró).

---

## 3. Qué le da fuerza probatoria a una firma electrónica

| Requisito | Cómo lo cubrimos / cubriríamos |
|---|---|
| **Atribución** (quién) | Nombre del firmante + aceptación explícita; opcional: identificación (INE) |
| **Integridad** (no se alteró) | **Hash** del documento firmado + **versión exacta** del reglamento firmada |
| **Sello de tiempo** (cuándo) | `sello_tiempo`; opcional: sello de tiempo confiable de un tercero |
| **No repudio** | Bitácora de aceptación (casilla, fecha, dispositivo/IP) |
| **Conservación** | Almacenamiento inmutable; opcional: constancia **NOM-151** |

---

## 4. Opciones (para decidir con el IAQ)

| Opción | Qué es | Valor probatorio | Fricción para el usuario | Costo | Esfuerzo dev |
|---|---|---|---|---|---|
| **A. Firma simple** (lo actual) | Canvas → PNG + nombre | Bajo-medio | Ninguna | $0 | Ya hecho |
| **B. Firma simple REFORZADA** ⭐ | A + trazos vectoriales + **hash del documento** + sello de tiempo + versión del reglamento + bitácora de aceptación | **Medio-alto (defendible)** | Ninguna | **$0** (Supabase) | Bajo-medio |
| **C. Firma Electrónica Avanzada (e.firma SAT / PKI)** | Certificado + llave privada por firmante | Alto (presunción legal) | **Muy alta** (cada padre necesita e.firma) | $0–medio | Alto | 
| **D. Proveedor certificado** (Mifiel, DocuSign, Weetrust) + NOM-151 | Firma gestionada por un PSC | **Muy alto** | Baja-media | **$ por firma / suscripción** | Medio |

---

## 5. Recomendación técnica

**Opción B (firma simple reforzada).** Es **proporcional** al caso: SATAV digitaliza un **reglamento
interno de acceso vehicular**, no un contrato litigioso. B eleva mucho la defendibilidad **sin costo y sin
fricción** para los papás, guardando junto a la firma: la **versión exacta** del reglamento, el **sello de
tiempo**, la **casilla de aceptación** y un **hash** que prueba que nada se alteró.

- **C (e.firma)** se descarta: es inviable pedir e.firma del SAT a cada padre/alumno.
- **D (proveedor)** solo si el IAQ decide que necesita fuerza de nivel contractual (implica costo recurrente).

---

## 6. Almacenamiento y costo (¿hace falta plan premium de Supabase?)

**No hace falta plan de pago para SATAV.** Cabe cómodo en el **plan gratuito**:

- **Tamaño de una firma:** un PNG de canvas pesa ~**10–40 KB**; los **trazos vectoriales** (JSON) son ~2–10 KB.
- **Volumen SATAV:** ~1,660 registros + ~300/año. Aun con **2,500 firmas × 40 KB ≈ 100 MB**.
- **Plan gratuito de Supabase (aprox., confirmar vigente):** ~**1 GB de Storage** + ~**500 MB de base** +
  límite de subida por archivo de ~50 MB. → **100 MB de firmas entra de sobra en 1 GB.**
- La imagen va a **Storage** (bucket privado `firmas`); los vectores/hash/metadatos van en **Postgres**
  (`aceptaciones`) — ambos dentro del tier gratuito.
- Lo único que podría crecer es el **egress** (ancho de banda) si se **descargaran** muchas firmas, pero
  admin las abre rara vez → consumo mínimo.

**Conclusión:** con la base actual (gratuita) se guarda sin problema. Solo revisar los límites vigentes de
Supabase antes de producción.

---

## 7. Preguntas para el jefe (para decidir el nivel)

1. **¿Qué tan probable es que el IAQ necesite *oponer* esta firma en un conflicto real?** (Define si basta
   B o se requiere D.)
2. **¿Basta *evidencia de aceptación* del reglamento, o se requiere firma con plena certeza jurídica de la
   identidad?**
3. **¿Se debe *verificar la identidad* del firmante** (INE/credencial), o basta nombre + aceptación en línea?
4. **¿Hay presupuesto** para un proveedor certificado (opción D), o se prefiere solución propia sin costo (B)?
5. **¿Cuánto tiempo** debe conservarse la evidencia? ¿Se requiere **constancia NOM-151**?
6. **¿El área legal del IAQ** ya tiene criterio/plantilla del **aviso de privacidad** y del texto de aceptación?

---

## 8. Referencias

- Código de Comercio (México), Título II — Comercio Electrónico, arts. 89–114.
- NOM-151-SCFI-2016 (conservación de mensajes de datos).
- LFPDPPP (tratamiento de datos personales).
- [`01 - Modelo de Datos y Base de Datos.md`](01%20-%20Modelo%20de%20Datos%20y%20Base%20de%20Datos.md) — tabla `aceptaciones`.
- [`04 - Seguridad, RLS y Privacidad.md`](04%20-%20Seguridad%2C%20RLS%20y%20Privacidad.md) — aviso de privacidad y RLS.

---

## 9. Diseño como módulo reutilizable (firma portátil)

*(Decisión con Dirección: la captura de firma es un módulo que se reutilizará en otros sistemas del IAQ,
así que se diseña **desacoplado de SATAV** y pensado para copiarse/portarse — `CC-08` / B8.)*

**Idea.** La firma manuscrita digital no depende de "reglamento" ni de "registro de TAG": es una
capacidad genérica (capturar → guardar → verificar una firma sobre *cualquier* documento). Se separa en
**capas**, de la más reutilizable a la más específica:

| Capa | Pieza | Reutilizable | Responsabilidad |
|---|---|---|---|
| UI | `SignaturePad` (componente) | ✅ total | Captura en canvas → PNG (+ trazos vectoriales opcionales); sin lógica de negocio |
| Dominio | **`Firma`** (clase/módulo) | ✅ total | Imagen + trazos + `hashDocumento` + `selloTiempo` + firmante + metadata; `verificarIntegridad()`, `esValida()` |
| Servicio | **`FirmaService`** | ✅ total | Subir la imagen a Storage privado, calcular hash del PNG si aplica, solicitar a la base el hash legal, recuperar y verificar |
| Patrón (opcional) | **`AceptacionDocumento`** | ✅ genérico | "Firmar/aceptar un documento versionado": `documento` + `version` + `Firma` + firmante |
| App (SATAV) | `AceptacionReglamento` | ❌ específico | Compone una `Firma` con `ReglamentoVersion` + `RegistroTag` |

**Frontera del módulo.** El módulo reutilizable = **`SignaturePad` + `Firma` + `FirmaService`** (y,
opcional, el patrón `AceptacionDocumento`). **No** conoce `registros`, `reglamento_versiones` ni la RLS
de SATAV. Se configura por parámetros: bucket de Storage, si guarda trazos vectoriales, si exige hash del
documento y formato de metadata.

**Interfaz sugerida (portátil):**

```ts
// Módulo reutilizable — sin dependencias de SATAV
interface Firma {
  imagenRuta: string;          // ruta en Storage privado (no URL pública)
  trazos?: Trazo[];            // vectores opcionales (mayor evidencia)
  hashDocumento: string;       // SHA-256 del paquete firmado, generado por la base
  hashPayload?: Record<string, unknown>; // paquete canonico usado para el hash legal
  selloTiempo: string;         // ISO 8601
  firmanteNombre: string;
  metadata?: Record<string, unknown>; // dispositivo / IP / versión de app (opcional)
}

interface FirmaService {
  capturarYGuardar(png: string, opts: FirmaOpts): Promise<Firma>;
  verificarIntegridad(firma: Firma, documento: string): boolean;
}
```

**Empaquetado.** En código vive como paquete/carpeta propia (p. ej. `lib/firma/` o `packages/firma/`),
sin importar nada del dominio de SATAV, para poder **copiarse tal cual** a otro sistema. La estructura y
la frontera se detallan en [`03 - Arquitectura Técnica`](03%20-%20Arquitectura%20Tecnica.md).

**Persistencia (SATAV).** `aceptaciones` guarda la firma (`firma_url`, `firma_imagen_sha256`,
`firma_trazos`, `firmante_nombre`, `sello_tiempo`) + la version del reglamento, la version del aviso,
`hash_payload` y `hash_documento` generado por la base. *(Opcional a futuro: una tabla generica
`firmas` que `aceptaciones` referencie, si otro sistema comparte la misma base.)*

**Nivel de firma.** Este módulo implementa la **Opción B (firma simple reforzada)** de §4–§5: por eso
`Firma` ya incluye `hashDocumento`, `selloTiempo` y trazos — la evidencia viaja **dentro del módulo**,
lista para reutilizarse con el mismo valor probatorio en otros sistemas.

**Decisión menor abierta:** ¿el módulo incluye desde el inicio el patrón genérico `AceptacionDocumento`
(firmar cualquier documento versionado), o arranca solo con `Firma`/`FirmaService` y ese patrón se
agrega cuando un segundo sistema lo pida? *(Recomendado: arrancar con `Firma`/`FirmaService`; el patrón
se extrae cuando exista el segundo caso real.)*
