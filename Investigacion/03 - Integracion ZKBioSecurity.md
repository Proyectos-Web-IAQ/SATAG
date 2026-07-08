# Integración SATAG ↔ ZKBioSecurity — Investigación

> **Estado:** investigación / propuesta técnica. Versión del sistema del colegio **confirmada 2026-07-08**
> (ver §1); pendientes menores en §9.
> **Objetivo:** eliminar la doble captura del No. de TAG. Que el registro capturado una sola vez en
> SATAG se propague automáticamente al sistema de control de acceso/estacionamiento del colegio
> (**ZKBioSecurity**, de ZKTeco), sin reescribir nada a mano.
> **Fecha:** 2026-07-08.

---

## 1. Resumen ejecutivo

- **¿Se puede?** Sí. ZKBioSecurity trae una **API REST de terceros ("3rd Party API")** diseñada
  exactamente para que sistemas externos como SATAG lean y escriban personas, tarjetas, placas y
  **autorizaciones de estacionamiento**.
- **El obstáculo real** no es la API, es la **topología de red**: SATAG vive en la **nube (Supabase)** y
  ZKBioSecurity es un servidor **local (LAN del colegio)** que no debe exponerse a internet. Por eso la
  integración no es "nube llama a nube", sino que requiere un **conector que corra dentro de la red del
  colegio**.

> ### ✅ Recomendación exacta
>
> Construir un **conector unidireccional SATAG → ZKBioSecurity**, así:
>
> 1. **SATAG es la única fuente de verdad.** TI captura el No. de TAG **una sola vez**, en su flujo actual
>    de instalación/activación.
> 2. Un **servicio conector** (Node/TypeScript, pequeño) corre en **una PC/servidor dentro de la red del
>    colegio** que alcanza tanto a Supabase (internet) como al servidor de ZKBioSecurity (LAN).
> 3. Cuando un registro pasa a `estado='activo'` con `no_dispositivo`, el conector lo **empuja por la API
>    de ZKBioSecurity**: crea/actualiza la **persona**, le asigna la **tarjeta** (`no_dispositivo`) y la
>    **autorización de estacionamiento** correspondiente.
> 4. SATAG guarda un **rastro de sincronización** (idempotencia) para no duplicar ni reintentar de más.
> 5. **Arranque por botón manual "Sincronizar a ZKBio"** en el panel de TI; una vez estable, se automatiza
>    por cambio de estado.
>
> Se empuja **solo el mínimo necesario** para abrir la pluma (persona + tarjeta + placa + zona). El
> expediente completo con PII **se queda en SATAG** (coherente con LFPDPPP y con
> [`04 - Seguridad, RLS y Privacidad`](../Desarrollo/04%20-%20Seguridad%2C%20RLS%20y%20Privacidad.md)).

### 1.1 Datos confirmados del sistema del colegio (2026-07-08)

De la pantalla "Acerca de" del ZKBioSecurity del colegio:

| Dato | Valor | Implicación |
|---|---|---|
| Versión | **3.1.5.0_R** (ZKBioSecurity V5000, línea 3.x) | Usar el manual **3rd Party API de la V5000 3.x** (V1.4), no el de CVSecurity 6.x. |
| Licencia ID | 19307 | — |
| **Acceso** | **Activada** — 1/5 puertas (válida ~perpetua) | Los TAG operan por **Control de Acceso**; la pluma es 1 de las 5 "puertas". |
| **Estacionamiento (LPR)** | **NO activado** (0/0 puntos) | ❗ No hay módulo de parking/placas. La integración va por **tarjeta + nivel de acceso**, no por parking. |
| Resto (Asistencia, Elevador, Hotel, Visitante, Rondas, Video) | No activado | No aplican. |

**Consecuencia para el diseño:** cada TAG es una **tarjeta (`no_dispositivo`) asignada a una persona**, con
un **nivel de acceso** que abre la pluma. El conector debe crear/actualizar **persona → tarjeta → nivel de
acceso**. La **placa se queda solo en SATAG** (el módulo LPR está apagado; ZKBio no la usa).

> **Único dato que falta en la captura:** el "Acerca de" no muestra una línea de licencia de **API**. En la
> V5000 3.x el API de terceros se habilita en **Sistema → Gestión de Autoridad → Autorización de API**. Hay
> que entrar al software y confirmar que ese menú existe/está disponible (ver §9).

---

## 2. Qué se puede hacer (capacidades confirmadas de la API)

La documentación oficial de ZKTeco (manuales "3rd Party API" de ZKBioSecurity V5000 y de ZKBio CVSecurity)
confirma que la API cubre, sobre HTTP/HTTPS y validada por `access_token`:

- **Personnel (personas):** alta y edición de personas (`pin`, nombre, departamento).
- **Cards (tarjetas):** asignar un número de tarjeta a una persona → aquí encaja el `no_dispositivo`.
- **Access control / niveles de acceso / doors / devices:** grupos, **niveles de acceso** (zona horaria +
  grupo de puertas), puertas y dispositivos → **esta es la vía para este colegio** (abrir la pluma).
- **Parking authorization:** autorizar un vehículo/placa a una zona de estacionamiento. *(⚠️ En este
  colegio el módulo Estacionamiento/LPR está **apagado**; no se usa esta vía — ver §1.1.)*
- **Transactions:** consulta de eventos (`transaction/person/{pin}`, `transaction/device/{deviceSn}`) →
  útil si algún día se quiere registrar **de vuelta** las entradas/salidas en SATAG.

El `no_dispositivo` de SATAG tiene formato `^[0-9]{6,11}$` (numérico, 6–11 dígitos), que es exactamente el
formato de un **número de tarjeta Wiegand** estándar en ZKBioSecurity. Encajan directo.

---

## 3. Cómo se puede hacer (mecánica de la API)

### 3.1 Requisitos previos (los habilita TI/instalador en el servidor ZKBio)

1. **Licencia de API activada.** El menú *API Authorization* solo aparece cuando la licencia de la API
   está activa. **Sin esta licencia no hay API** (habría que comprarla o usar el plan B de CSV, §5).
2. **Registrar un cliente de API** en el software (System → Authority Management → **API Authorization**):
   genera un **Client ID / Client Secret** (o usuario/clave de API).
3. **Usuario con permisos** de gestión de personas, acceso y dispositivos.

### 3.2 Flujo de llamadas (patrón general)

```
1) Obtener token
   POST  {baseUrl}/api-token            (ZKBioSecurity V5000 3.x)
         { "username": "...", "password": "..." }
   ->    { "access_token": "xxxxxxxx" }

2) En cada petición se envía el access_token (header o parámetro, según versión).

3) Alta/edición de persona     ->  endpoint de personnel      (pin, nombre, deptCode)
4) Asignar tarjeta a persona   ->  endpoint de card           (cardNo = no_dispositivo)
5) Asignar nivel de acceso     ->  endpoint de access level   (persona -> puerta/pluma)
6) (opcional) Baja/bloqueo     ->  desactivar tarjeta/persona cuando estado='baja'/'bloqueado'
```

> ✅ **Versión confirmada: ZKBioSecurity V5000 3.1.5.0_R** (línea 3.x). El manual aplicable es el
> **"ZKBioSecurity V5000 3.0.0 — 3rd Party API User Manual V1.4"** (ver §11), **no** el de ZKBio
> CVSecurity 6.x (que cambia el login/token y algunas rutas). Al mapear los endpoints exactos, usar ese
> manual. Los strings precisos de cada ruta se toman de ahí; el patrón de arriba es el flujo general.

---

## 4. El reto de arquitectura: nube (Supabase) vs. red local (ZKBio)

Este es el punto que define el diseño:

- **SATAG** → Supabase, en la **nube**.
- **ZKBioSecurity** → servidor **on-premise** en la LAN del colegio, **sin exponer a internet** (es control
  de acceso físico; exponerlo sería un riesgo grave — ver los CVE públicos de ZKTeco en §10).

Conclusión: **Supabase no puede llamar directo a ZKBio.** La pieza que falta es un **conector dentro de la
red del colegio** que sí ve ambos lados.

```
   NUBE                                        RED LAN DEL COLEGIO
 ┌───────────────────────┐                   ┌──────────────────────────────┐
 │  SATAG / Supabase      │                   │                              │
 │  registros             │◄──── lee ─────────┤   CONECTOR (Node/TS)         │
 │  no_dispositivo        │   (Realtime o     │   - detecta activos          │
 │  estado='activo'       │    polling +      │   - mapea datos              │
 │                        │    marca rastro)  │   - reintentos/errores       │
 │        ▲               ├──── escribe ─────►│                              │
 │        │ (opcional)    │   rastro sync     └──────────────┬───────────────┘
 │        │ entradas/     │                                  │ empuja por API
 │        │ salidas       │                                  ▼
 └────────┴───────────────┘                   ┌──────────────────────────────┐
                                              │  ZKBioSecurity (on-prem)      │
                                              │  persona + tarjeta + parking  │
                                              └──────────────────────────────┘
```

**Dónde vive el conector (opciones):**
- Un servicio en la **PC/servidor del colegio** que ya aloja o alcanza a ZKBio (lo más simple y seguro).
- Un contenedor/servicio en un mini-PC dentro de la LAN.
- (Evitar) Exponer ZKBio a internet con VPN/port-forward: solo si hay razón fuerte y con VPN, nunca puerto
  abierto directo.

---

## 5. Mapeo de datos SATAG → ZKBioSecurity

Solo se propaga lo mínimo para operar la pluma:

| ZKBioSecurity            | Campo SATAG                          | Nota |
|--------------------------|--------------------------------------|------|
| `pin` (ID de persona)    | `folio` o `id`                       | ZKBio suele querer PIN numérico; sirve el número del folio `SATAG-000123`. |
| Nombre                   | `usuario_nombre_completo`            | Ya existe como columna generada. |
| Departamento / grupo     | `tipo_usuario` (maestro/padres/alumno) | Para agrupar y reportar en ZKBio. |
| **Número de tarjeta**    | **`no_dispositivo`**                 | ✅ Formato `^[0-9]{6,11}$` = tarjeta Wiegand. Encaja directo. |
| **Nivel de acceso / grupo de puertas** | `registro_estacionamientos` (E1, E2…) | Mapear cada estacionamiento SATAG → **nivel de acceso** (puerta/pluma) en ZKBio. |
| Placa del vehículo       | `placas`                             | 🔒 **Se queda en SATAG.** El módulo LPR está apagado; ZKBio no la usa (dato informativo). |
| Baja/bloqueo de tarjeta  | `estado='baja'` / `'bloqueado'`      | Propagar la desactivación también a ZKBio. |

---

## 6. Diseño del conector

**Dirección:** SATAG → ZKBio (una vía). Opcional futuro: ZKBio → SATAG (bitácora de accesos).

**Disparo (de más simple a más automático):**
- **A) Botón "Sincronizar a ZKBio"** en el panel de TI, dentro del *Flujo de TI: instalación, captura de
  No. de TAG y activación* ([`05 - Flujos del Sistema`](../Desarrollo/05%20-%20Flujos%20del%20Sistema.md)).
  Control total, cero magia. **Recomendado para arrancar.**
- **B) Automático por cambio de estado:** al poner `estado='activo'` con `no_dispositivo`, se encola la
  sincronización, vía **Supabase Realtime** (el conector escucha cambios) o **polling** cada N minutos con
  una consulta tipo `estado='activo' AND no_dispositivo IS NOT NULL AND aún no sincronizado`.

**Idempotencia (no duplicar en ZKBio):** agregar en SATAG un rastro de sincronización. Dos opciones:
- **Tabla dedicada** (recomendada):
  `sincronizaciones_zk (registro_id, no_dispositivo, zk_pin, estado, sincronizado_en, error, intentos)`.
- **Mínima:** una columna `sincronizado_zk timestamptz` en `registros`.

Encaja con el patrón existente de `movimientos` (se puede registrar un movimiento `alta`/`baja` cuando la
propagación a ZKBio ocurre). Ver [`01 - Modelo de Datos`](../Desarrollo/01%20-%20Modelo%20de%20Datos%20y%20Base%20de%20Datos.md).

**Manejo de errores:** el conector debe reintentar con backoff, registrar fallos en `error_logs` (ya
existe en el esquema) o en el rastro de sync, y no bloquear el flujo de SATAG si ZKBio está caído.

---

## 7. Alternativas evaluadas

| Opción | Cómo | Veredicto |
|---|---|---|
| **API REST 3rd Party** (conector) | Mecanismo oficial; conector en la LAN empuja por API. | ✅ **Recomendada.** Tiempo real, oficial, soportada, bidireccional si se quiere. |
| **Importación CSV/Excel** en ZKBio | Exportar de SATAG → importar manual en ZKBio por lotes. | 🟡 **Plan B / carga inicial.** Semi-manual, pero sirve para la migración del día 1 o si no hay licencia de API. |
| **Escribir directo a la BD de ZKBio** (SQL Server/Postgres interno) | Insertar en las tablas internas del sistema. | ❌ **No.** Rompe soporte/garantía, sin validaciones, se rompe en cada actualización, puede corromper el control de acceso. |
| **Integración por SDK de dispositivo** (Push/Pull SDK ZKTeco) | Hablar directo con las lectoras, no con el software. | ❌ **No para este caso.** Salta la lógica de ZKBioSecurity; más complejo y frágil que la API del software. |

---

## 8. Riesgos y consideraciones

- **Licencia de API:** si no está incluida/activada, hay costo. Es el primer *bloqueante* a confirmar.
- **Versión de ZKBio:** define rutas y flujo de token. No escribir código antes de confirmarla.
- **Red:** el conector necesita un host en la LAN con acceso a ZKBio **y** salida a internet. Si no existe,
  hay que aprovisionarlo.
- **Privacidad (LFPDPPP):** minimizar los datos que salen de SATAG hacia ZKBio (solo lo operativo). El
  expediente, firma y PII sensible se quedan en SATAG. Alinear con
  [`04 - Seguridad, RLS y Privacidad`](../Desarrollo/04%20-%20Seguridad%2C%20RLS%20y%20Privacidad.md).
- **Seguridad del propio ZKBio:** ZKTeco tiene CVE públicos (p. ej. CVE-2024-35430). Mantener el servidor
  parcheado y **nunca** exponerlo directo a internet.
- **Sincronización de bajas:** definir qué pasa en ZKBio cuando un TAG se da de baja/bloquea en SATAG (debe
  desactivarse la tarjeta, no solo dejar de crearla).

---

## 9. Qué falta confirmar (bloqueantes, antes de codificar)

1. ✅ **Versión — RESUELTO:** ZKBioSecurity V5000 **3.1.5.0_R**. **Pendiente:** entrar al software y
   confirmar que existe el menú **Sistema → Gestión de Autoridad → Autorización de API** (el "Acerca de" no
   muestra una línea de licencia de API). Si no aparece, hay que habilitar/licenciar la API con el
   distribuidor, o ir al plan B (CSV, §7).
2. ✅ **Cómo entran los tags — ACLARADO:** con Estacionamiento/LPR apagado, los TAG operan como **tarjeta
   en Control de Acceso**. Queda por confirmar el **tipo de lectora** (UHF de largo alcance vs. proximidad),
   pero eso solo afecta el hardware, **no el modelo de datos**: en ambos casos `no_dispositivo` es el número
   de tarjeta.
3. **Host del conector:** ¿hay una PC/servidor en la red del colegio que alcance al servidor de ZKBio y
   además salga a internet (Supabase)? Ahí corre el conector.

---

## 10. Siguientes pasos

1. **[TI colegio]** Confirmar los 3 puntos del §9 (versión, licencia, tipo de tag, host).
2. **[TI colegio]** Activar licencia de API (si aplica) y crear el cliente de API (Client ID/Secret).
3. **[Desarrollo]** Descargar el manual de la API de la **versión correcta** y mapear los endpoints exactos
   (token, personnel, card, parking).
4. **[Desarrollo]** Definir el cambio de esquema para el rastro de sincronización (tabla
   `sincronizaciones_zk` o columna en `registros`).
5. **[Desarrollo]** Construir el conector (Node/TS): auth → mapeo → push, con reintentos y logging.
6. **[Desarrollo]** Probar en modo **botón manual** con 2–3 registros reales; validar que abre la pluma.
7. **[Desarrollo]** Migración inicial (los ya registrados) — vía conector por lotes o CSV.
8. **[Desarrollo]** Automatizar por cambio de estado y monitorear.

---

## 11. Referencias

**Documentación oficial ZKTeco**
- [ZKBio CVSecurity API — página oficial](https://www.zkteco.com/en/ZKBio_CVSecurity_API/ZKBioCVSecurity_API)
- [Manual 3rd Party API v1.1 (mayo 2024, PDF)](https://s3.ap-southeast-1.amazonaws.com/zkteco.co.th/files/20240807/ZKBio_CVSecurity_3rd_Party_API_User_Manual_V1.1_20240521.pdf)
- [Manual 3rd Party API v1.0 (dic 2022, PDF)](https://s3.ap-southeast-1.amazonaws.com/zkteco.co.th/files/20230917/ZKBio%20CVSecurity%20_3rd%20Party%20API%20User%20Manual_20221226_v1.0.pdf)
- [Manual 3rd Party API v1.3 (sept 2025, PDF)](https://d1agmp9y4cki1i.cloudfront.net/files/20251125/ZKBio%20CVSecurity%20_3rd%20Party%20API_User%20Manual_2025.pdf)
- [Manual 3rd Party API ZKBioSecurity V5000 3.0.0 (Scribd)](https://www.scribd.com/document/625614269/ZKBioSecurity-V5000-3-0-0-3rd-Party-API-User-Manual-V1-4-20200810)

**Guías en español**
- [Tecnosinergia — "¿Cómo usar las APIs de ZKBio CVSecurity correctamente?"](https://tecnosinergia.zendesk.com/hc/es/articles/46093344529051--C%C3%B3mo-usar-las-APIS-de-ZKBio-CVSecurity-Correctamente)

**Seguridad (referencia)**
- [CVE-2024-35430 — investigación pública sobre ZKBio CVSecurity](https://github.com/mrojz/ZKT-Bio-CVSecurity/blob/main/CVE-2024-35430.md)

**Documentos SATAG relacionados**
- [`Desarrollo/01 - Modelo de Datos y Base de Datos.md`](../Desarrollo/01%20-%20Modelo%20de%20Datos%20y%20Base%20de%20Datos.md)
- [`Desarrollo/04 - Seguridad, RLS y Privacidad.md`](../Desarrollo/04%20-%20Seguridad%2C%20RLS%20y%20Privacidad.md)
- [`Desarrollo/05 - Flujos del Sistema.md`](../Desarrollo/05%20-%20Flujos%20del%20Sistema.md)
