# Integración SATAG ↔ ZKBioSecurity — Investigación

> **Estado:** investigación cerrada · **bloqueada por licencia**, a la espera de una decisión de Dirección.
> **Objetivo:** eliminar la doble captura del No. de TAG. Que el registro capturado una sola vez en
> SATAG se propague automáticamente al sistema de control de acceso/estacionamiento del colegio
> (**ZKBioSecurity**, de ZKTeco), sin reescribir nada a mano.
> **Fecha:** 2026-07-08 · **Actualizado 2026-07-29** con la verificación en el sistema del colegio (§1.2).

> ## ⛔ Conclusión ejecutiva (2026-07-29)
>
> **La API de ZKBioSecurity NO está activada en el sistema del colegio.** Se verificó directamente en el
> software y quedó confirmado por tres vías independientes (§1.2). La API no es una función que venga
> incluida: es una **licencia que se compra por separado**, número de parte **`ZKBS-API-S1`**.
>
> **Consecuencia:** la integración **no es un problema de programación, sino de compra**. Todo el diseño
> técnico de este documento sigue siendo válido y ejecutable, pero no puede iniciarse hasta que la
> licencia se autorice y se active.
>
> **Lo que procede:** cotizar la licencia con el distribuidor (**SMARTHAUS**, que aparece como empresa
> autorizada en el propio software) y llevar la decisión a Dirección junto con el cierre del proyecto.
> Si no se autoriza, queda el **plan B de exportación/importación por archivo** (§7), que es soportado
> por el fabricante pero manual.
>
> **Esto no afecta el cierre de SATAG:** la integración con hardware de acceso está **fuera del alcance
> del MVP** (`Plan de Direccion/02`, §2.1 Exclusiones).

---

## 1. Resumen ejecutivo

- **¿Se puede?** Técnicamente sí. ZKBioSecurity trae una **API REST de terceros ("3rd Party API")**
  diseñada exactamente para que sistemas externos como SATAG lean y escriban personas y tarjetas.
  **Pero en el sistema del colegio esa API no está licenciada** (§1.2), así que hoy la respuesta
  práctica es *no, hasta que se compre la licencia*.
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

> **Dato que faltaba en esa captura:** el "Acerca de" no mostraba una línea de licencia de **API**. Se
> verificó el **2026-07-29** y el resultado está en §1.2: **la API no está activada**.

---

### 1.2 Verificación de la licencia de API (2026-07-29) — RESULTADO: NO ACTIVADA

Se entró al software del colegio (`http://192.168.1.7:8088`, usuario `admin`) para resolver el
bloqueante principal. **Confirmado por tres vías independientes:**

**1. La tabla de licencias lo dice de forma explícita.**
En *Acerca de → Detalles*, el renglón **API** aparece con estado **"No Activado"** y una **✗ roja** en la
columna Disponibles/Total. El manual (§12.2.4) confirma que ahí es exactamente donde se refleja: *"La API
se muestra en los detalles de la licencia"*.

**2. El menú de Autorización de API no existe.**
Según el manual, la ruta es *Sistema → Privilegios → **Autorización API***, y el menú aparece entre
"Grupos de Privilegios" y "Registro de Clientes". En el sistema del colegio, *Privilegios* contiene
únicamente **Usuarios, Privilegios, Grupos de Privilegios y Registro de Clientes**: falta justo ese
elemento, en la posición donde debería estar. El manual es categórico:

> *"el menú de autorización API se muestra en la administración del sistema sólo cuando la API está
> activada"* — Manual de usuario ZKBioSecurity, §12.2.4.

**3. "Registro de Clientes" no es la vía alterna.**
Se revisó por descarte. Su campo *Tipo de Cliente* solo ofrece periféricos: Cliente App, OCR (Personal /
Visitantes / Hotel), Lector ID (Personal / Visitantes / Hotel) e Impresión de Credenciales. **No existe
un tipo "API" ni "Tercero".** Esa pantalla sirve para dar de alta accesorios, no para habilitar la API.

#### La licencia se vende por separado

| Dato | Valor |
|---|---|
| Número de parte | **`ZKBS-API-S1`** — "Licencia de integración API para ZKBioSecurity" |
| Variantes vistas en el mercado | `ZKBSAPI` (mismo producto), `ZKBS-API-P1` (conexión a software del propio ZKTeco) |
| Qué habilita | *"una interfaz web de API dentro del software"* |
| Distribuidor del colegio | **SMARTHAUS** (aparece como "Empresa autorizada" en el propio software) |
| Distribuidores que la listan | SYSCOM, TVC, Relematic, PC Redcom, Store Smarthouse |
| Costo | **Por cotizar** |

#### Nota sobre el alcance de la licencia actual

En *Acerca de → Detalles* **todos** los módulos opcionales aparecen como "No Activado" (Acceso Avanzado,
Directorio Activo, LED, ARTECO, C2P, APP, Personal, Departamentos, Área, Tablero de Personal). La lectura
más probable es que el colegio adquirió ZKBioSecurity en su configuración base —con la puerta de Control
de Acceso que sí opera— y ningún módulo adicional. **Conviene pedir al distribuidor que confirme por
escrito el alcance vigente de la licencia**, para saber con qué se cuenta antes de proponer nada.

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

### 3.3 Detalles confirmados en el manual (§12.2.4) — aplicables cuando se active la licencia

**Dirección base de la API.** El explorador del manual muestra `http://127.0.0.1:8088/api/api-docs` con
`BASE URL: /api`. Es decir, **la API vive en el mismo puerto que la interfaz web**, no en uno aparte.
Para el servidor del colegio la base sería:

```
http://192.168.1.7:8088/api/
Explorador de endpoints:  http://192.168.1.7:8088/api/api-docs
```

*(El manual también muestra un ejemplo con puerto `6066`; corresponde a otra instalación, no es un
puerto especial de la API.)*

**Alta del cliente de API.** Una vez activada la licencia: *Sistema → Privilegios → Autorización API →
Nuevo*, y se capturan **ID de Cliente** y **Clave de Cliente**. El manual advierte que **sin ese par la
API no responde con normalidad**. Desde esa misma pantalla, el botón **"Examinar API"** abre el
explorador de endpoints.

> 💡 **Ese explorador vale más que cualquier PDF:** lista los endpoints reales de *esa* instalación y
> versión. Cuando la licencia se active, mapear los endpoints desde ahí y no desde el manual.

**Módulos que expone la API en esta versión:**
`AccLevel` · `AdMedia` · `AttAreaPerson` · `Card` · `Department` · `Device` · `Door` · `Person` ·
`Reader` · `Third` · `Transaction`

Dos consecuencias para el diseño:

- **No hay módulo de estacionamiento/parking en la lista.** Ni siquiera con la licencia activa existiría
  esa vía en esta versión. Confirma —por segunda razón, independiente de que el módulo LPR esté apagado—
  que el camino correcto es **`Person` → `Card` → `AccLevel`**.
- **`Transaction` existe**, así que la lectura de entradas/salidas hacia SATAG es posible a futuro. No es
  del alcance actual, pero la puerta queda abierta.

**⚠️ El `access_token` viaja en la URL, no en un encabezado.** Ejemplo del manual:

```
http://127.0.0.1:8088/api/accLevel/getById/632107210199985?access_token=<token>
```

Esto tiene una implicación de seguridad que el conector debe considerar: **los tokens en la URL quedan
registrados** en bitácoras del servidor, historiales de navegador y cualquier proxy intermedio. Es un
argumento adicional para que el conector opere **solo dentro de la red local**, para que el servidor de
ZKBio **nunca se exponga a internet**, y para rotar la clave de cliente si se sospecha filtración. Nótese
además que la comunicación con el servidor es **HTTP sin TLS** (el navegador marca "No seguro").

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

1. ✅ **Versión — RESUELTO (08-jul):** ZKBioSecurity V5000 **3.1.5.0_R**.
2. ⛔ **Licencia de API — RESUELTO (29-jul): NO ESTÁ ACTIVADA.** Verificado en el software por tres vías
   (§1.2). **Este es el bloqueante que detiene todo.** Requiere comprar la licencia `ZKBS-API-S1` o ir al
   plan B (§7). **Es una decisión de Dirección, no técnica.**
3. ✅ **Cómo entran los tags — ACLARADO (08-jul):** con Estacionamiento/LPR apagado, los TAG operan como
   **tarjeta en Control de Acceso**. Reforzado el 29-jul: la API de esta versión **tampoco expone módulo de
   parking** (§3.3). Queda por confirmar el **tipo de lectora** (UHF de largo alcance vs. proximidad), pero
   eso solo afecta el hardware, **no el modelo de datos**: en ambos casos `no_dispositivo` es el número de
   tarjeta.
4. **Host del conector — PENDIENTE:** ¿hay una PC/servidor en la red del colegio que alcance al servidor de
   ZKBio (`192.168.1.7:8088`) y además salga a internet (Supabase)? Ahí corre el conector. *Pista del
   29-jul: la bitácora de operaciones del sistema registra accesos desde `127.0.0.1`, o sea que alguien
   trabaja directamente sobre la máquina servidor; si esa máquina tiene salida a internet, es la candidata
   natural.*
5. **Sincronización de bajas — PENDIENTE de definir:** qué debe ocurrir en ZKBio cuando un TAG se da de
   baja o se bloquea en SATAG (desactivar tarjeta, retirar nivel de acceso, o ambas).

---

## 10. Siguientes pasos

> **Actualización 29-jul:** los pasos 1 y 3 ya se hicieron. El proyecto queda **detenido en el paso 2**,
> que no depende del desarrollo sino de una autorización de compra.

### Bloque administrativo (lo que sigue ahora)

1. ✅ **[TI colegio]** Confirmar versión y licencia — **hecho el 29-jul** (§1.2).
2. ⏳ **[TI colegio → Dirección]** **Cotizar la licencia `ZKBS-API-S1` con SMARTHAUS.** Solicitar por
   escrito: costo, tiempo de entrega, confirmación de que es la parte correcta para la versión 3.1.5.0_R,
   si la activación requiere intervención del distribuidor en el servidor, y **el alcance vigente de la
   licencia actual del colegio** (§1.2).
3. ⏳ **[Dirección]** Decidir entre **comprar la licencia** (integración automática) o **plan B por archivo**
   (§7, soportado pero manual). Conviene plantearlo junto con el acta de cierre de SATAG.
4. ⏳ **[TI colegio]** Identificar el host del conector (§9, punto 4).

### Bloque técnico (solo si se autoriza la licencia)

5. **[TI colegio]** Activar la licencia y crear el cliente de API: *Sistema → Privilegios → Autorización
   API → Nuevo* (ID de Cliente + Clave de Cliente, §3.3).
6. **[Desarrollo]** Mapear los endpoints exactos desde el **explorador integrado**
   (`http://192.168.1.7:8088/api/api-docs`), que refleja la instalación real, en lugar del PDF genérico.
4. **[Desarrollo]** Definir el cambio de esquema para el rastro de sincronización (tabla
   `sincronizaciones_zk` o columna en `registros`).
5. **[Desarrollo]** Construir el conector (Node/TS): auth → mapeo → push, con reintentos y logging.
6. **[Desarrollo]** Probar en modo **botón manual** con 2–3 registros reales; validar que abre la pluma.
7. **[Desarrollo]** Migración inicial (los ya registrados) — vía conector por lotes o CSV.
8. **[Desarrollo]** Automatizar por cambio de estado y monitorear.

---

## 10.1 Anexo — Solicitud de cotización al distribuidor

Borrador listo para enviar a **SMARTHAUS**. Lleva los datos que el distribuidor necesita para cotizar sin
tener que preguntar de vuelta.

> **Asunto:** Cotización licencia ZKBS-API-S1 — ZKBioSecurity V5000, licencia 19307
>
> Buen día. Del Instituto Asunción de Querétaro. Requerimos habilitar la **API de terceros** de nuestro
> ZKBioSecurity para integrarlo con un sistema interno de control de acceso vehicular.
>
> Datos de la instalación:
>
> - Producto: ZKBioSecurity V5000, versión **3.1.5.0_R**
> - Licencia ID: **19307**
> - Módulos activos: Control de Acceso (1 de 5 puertas). Estacionamiento/LPR no activado.
>
> Ya verificamos en *Acerca de → Detalles* que la línea **API** aparece como "No Activado", y que en
> *Sistema → Privilegios* no existe la opción de Autorización de API. Entendemos que corresponde a la
> licencia **ZKBS-API-S1**. Les agradecería:
>
> 1. Cotización de esa licencia y tiempo de entrega.
> 2. Confirmar que es la parte correcta para nuestra versión 3.1.5.0_R.
> 3. El manual de la API que aplica a nuestra versión.
> 4. Si el proceso de activación requiere que ustedes intervengan en el servidor.
> 5. Confirmación por escrito del **alcance vigente** de nuestra licencia actual (qué módulos cubre).
>
> Quedo atento. Gracias.

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
- Manual de usuario ZKBioSecurity en español, **§12.2.4 "Autorización de la API"** — es la fuente de los
  datos de §3.3 y de la regla de que el menú solo aparece con la licencia activa.

**Licencia de API (consultado 2026-07-29)**
- [ZKBSAPI — TVC](https://tvc.mx/products/27206/) · [ZKBS-API-S1 — SYSCOM](https://www.syscom.mx/producto/ZKBS-API-S1-ZKTECO-168421.html) · [ZKBS-API-S1 — Store Smarthouse](https://store-smarthouse.com/products/zkbs-api-s1) · [ZKBS-API-S1 — Relematic](https://www.relematic.mx/producto/zkbs-api-s1-zkteco-705517.html)

**Seguridad (referencia)**
- [CVE-2024-35430 — investigación pública sobre ZKBio CVSecurity](https://github.com/mrojz/ZKT-Bio-CVSecurity/blob/main/CVE-2024-35430.md)

**Documentos SATAG relacionados**
- [`Desarrollo/01 - Modelo de Datos y Base de Datos.md`](../Desarrollo/01%20-%20Modelo%20de%20Datos%20y%20Base%20de%20Datos.md)
- [`Desarrollo/04 - Seguridad, RLS y Privacidad.md`](../Desarrollo/04%20-%20Seguridad%2C%20RLS%20y%20Privacidad.md)
- [`Desarrollo/05 - Flujos del Sistema.md`](../Desarrollo/05%20-%20Flujos%20del%20Sistema.md)
