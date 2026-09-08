# CAPACIDAD — SATAG

Auditoría de capacidad y preparación para picos de uso. Regla del ejercicio: **nada se
maquilla**. Cada número lleva método y fecha; lo que no se pudo medir se anota como
pendiente, no se estima en silencio.

Origen: incidente real en otro sistema de la escuela (día de apertura anunciada, la app
saturó CPU con poca carga porque cada petición costaba 1.5–2 s de CPU —sesiones en BD, sin
cachés, sin instrumentación— y el proveedor no conservaba logs para diagnosticarlo).

| Fase | Estado |
|---|---|
| 1 · Inventario | ✅ 28-ago-2026 (esta sección) |
| 2 · Costo por petición y capacidad | 🔄 en curso 28-ago-2026 (ver §II) |
| 3 · Prueba de carga reproducible (`pruebas-carga/`) | 🔄 script listo 28-ago-2026; primera corrida completa pendiente de staging (ver §III) |
| 4 · Defensas pendientes | ⏳ |
| 5 · Vigía y checklist de día de pico | ⏳ |

---

## Inventario (28-ago-2026)

> **Cómo se levantó.** Solo lectura: código y configuración del repo (commit `a66fe40` + árbol de
> trabajo), `npm ls`, y sondas `GET`/`HEAD` contra el sitio publicado y el proyecto de Supabase con
> la llave pública (la misma que viaja al navegador). **No se abrió el dashboard de Supabase ni el de
> Vercel**: todo lo que solo se ve ahí está en §I.12 como pendiente, con la ruta exacta para
> confirmarlo.

### I.0 — Lo primero que cambia el análisis

El checklist de este ejercicio está pensado para una app con servidor propio (sesiones en BD,
opcache, colas). **SATAG no tiene servidor propio.** Es un sitio 100 % estático
(`next.config.mjs`: `output: "export"`) servido desde un CDN; el navegador habla **directo**
con Supabase (PostgREST → Postgres, GoTrue para auth, Storage para las firmas). No hay
Server Components con datos, ni Route Handlers, ni middleware, ni un solo `console.*` en
producción.

Consecuencias:

1. **El patrón del incidente (CPU de la app por petición) no puede reproducirse en el front.**
   Servir HTML/JS estático desde Vercel cuesta ~0 CPU nuestra y escala solo.
2. **Todo el riesgo de saturación vive en Supabase**: CPU del Postgres, el número de conexiones
   que PostgREST/GoTrue/Storage pueden abrir, y el tier de cómputo contratado. La Ley de
   Utilización de la Fase 2 se aplica a **la vCPU de Postgres**, no a una app.
3. La segunda lección del incidente («el proveedor no conservaba logs») **sí aplica tal cual**:
   la retención de logs de Supabase depende del plan (ver §I.5).

### I.1 — Stack y versiones (medido con `npm ls`, 28-ago-2026)

| Capa | Versión instalada | Nota |
|---|---|---|
| Node (build y CI) | 24.16.0 local · `node-version: '24'` en los tres workflows | Solo para compilar; no corre en producción |
| Next.js | 16.2.10 (`^16.0.0`) | App Router, `output: "export"`, `trailingSlash: true`, `images.unoptimized` |
| React / React DOM | 19.2.7 | |
| TypeScript | 5.8 (`^5.8.0`) | `strict: true` |
| @supabase/supabase-js | 2.110.1 | Dos clientes: `lib/supabase/client.ts` (anon, sin sesión) y `lib/supabase/auth.ts` (panel, sesión persistente en `localStorage`, `storageKey: "satag-admin-auth"`) |
| Supabase (backend) | Proyecto `nqwbkjiwgjzcpmymcmqh` (`sb-gateway-version: 1`) | Postgres con RLS + RPC `SECURITY DEFINER`, Auth con MFA TOTP, Storage (bucket privado `firmas`) |
| Dependencias de runtime | **4** (`next`, `react`, `react-dom`, `@supabase/supabase-js`) | Sin librerías de PDF, correo, gráficas ni telemetría |

### I.2 — Dónde corre producción

**Estado real a la fecha: no hay producción liberada.** El sitio publicado es el *entorno de
trabajo* (README §Estado). Se inventarían los dos destinos porque el pico de uso ocurrirá en uno
de ellos.

| | Front (hoy, interino) | Front (destino definitivo) | Backend (único, para ambos) |
|---|---|---|---|
| Dónde | **Vercel** — `https://satag.vercel.app` | **GoDaddy cPanel** — `satag.asuncionqro.edu.mx` detrás de Cloudflare (proxy) | **Supabase** — `https://nqwbkjiwgjzcpmymcmqh.supabase.co` |
| Cómo se publica | Cada push a `main` (integración Vercel↔GitHub) | `.github/workflows/deploy.yml`: FTPS de `out/` — **INERTE** hasta `vars.DEPLOY_GODADDY == 'true'` | Bloques SQL `00`→`51` aplicados a mano en el SQL Editor (no hay migraciones automáticas) |
| Instancias / vCPU / RAM | **No aplica**: estáticos en CDN, sin cómputo propio | **No aplica**: Apache sirviendo archivos (`public/.htaccess` solo fija cache de HTML) | **Confirmado 28-ago (P1):** plan **Free**, cómputo **`t4g.nano`** — 2 vCPU compartidas/burstables, 0.5 GB RAM (55–62 % en reposo), 60 conexiones. Detalle en §II.1 |
| Autoscaling (mín/máx) | El CDN escala sin configurar nada | Sin autoscaling (hosting compartido) | **No existe autoscaling en Supabase**: el tamaño de cómputo es fijo y se sube a mano (add-on). Mín = máx = el tier contratado |
| Región | Edge global (respuestas vistas desde `sfo1`/`cle1`) | Cloudflare edge; origen GoDaddy (ubicación no verificada) | **Confirmado 28-ago (P3): `us-east-1` (N. Virginia)**; ~83 ms de ida y vuelta desde Querétaro |
| Estado de la sonda (28-ago) | `GET /` → 200, `X-Vercel-Cache: HIT`, `Age: 175309` (≈2 días en edge) | `nslookup satag.asuncionqro.edu.mx` → **NXDOMAIN** (el subdominio no existe todavía) | `GET /auth/v1/health` → 200 en 0.71 s (primer toque); `HEAD /rest/v1/cat_marcas` → 200, `content-range: 0-23/24` |

### I.3 — «SESSION_DRIVER», «CACHE_STORE», «QUEUE_CONNECTION» reales

| Concepto Laravel | Equivalente en SATAG | Costo por petición |
|---|---|---|
| **Sesiones** | **No hay sesiones de servidor.** Público (`/registro/`, `/solicitudes/`): cliente `anon`, `persistSession: false` — cero estado. Panel: JWT de Supabase Auth guardado en `localStorage` del navegador, `autoRefreshToken: true`, flujo `implicit`. | La API valida el JWT por firma (sin tocar `auth.sessions`). GoTrue sí toca su BD al **refrescar** el token (~1 vez/hora por sesión) y al login/MFA. Con ≤5 cuentas de panel, es despreciable. |
| **Caché** | **Ninguna.** No hay capa de caché de aplicación ni de HTTP: PostgREST responde `CF-Cache-Status: DYNAMIC` (el Cloudflare de Supabase no cachea). Los catálogos (`cat_marcas`, `cat_colores`, `cat_modelos`) y los documentos vigentes (`reglamento_versiones`, `aviso_versiones`) se leen de Postgres **en cada carga del formulario** (5 consultas, ver §I.9). | Cada visitante del formulario = 5 consultas a Postgres antes de escribir nada. Son consultas chicas (3–39 ms upstream medidos), pero se multiplican por visitante y por recarga. |
| **Colas** | **Ninguna, y no hay trabajo que encolar** (ver §I.8). | — |

### I.4 — «opcache» y caches de config/rutas/vistas

**No aplica** (no hay PHP ni servidor de aplicación). El equivalente es el **build estático
precompilado** en `out/`: rutas, HTML y JS ya resueltos en tiempo de compilación.

Verificado en Vercel el 28-ago:

| Recurso | `Cache-Control` medido | Lectura |
|---|---|---|
| `/` y `/registro/` (HTML) | `public, max-age=0, must-revalidate` | El navegador revalida siempre; el edge de Vercel sirve `HIT` (no llega al origen). Correcto para que un deploy se vea de inmediato. |
| `/_next/static/chunks/3z5q_p4msz2ha.js` | `public, max-age=31536000, immutable` | Assets con huella, 1 año inmutables. Correcto. |
| `public/.htaccess` (para GoDaddy) | `no-cache, must-revalidate` solo para `*.html` | No fija nada para `/_next/static/`; Apache dará su default (sin `Expires`). **Se revisará en Fase 4.** |

### I.5 — Logs: dónde escriben y cuánto duran

| Componente | Dónde | Retención | ¿Sobrevive a un deploy? |
|---|---|---|---|
| Front (navegador) | **En ningún lado.** Búsqueda de `console.error` / `console.warn` / `console.log` en `app/`, `lib/`, `components/` = 0 resultados. Los errores se muestran en pantalla y se pierden. | 0 | — |
| Vercel (estáticos) | Logs de acceso del CDN en el dashboard de Vercel | Plan Hobby: solo tiempo real, no consultables después; **PENDIENTE** confirmar plan (P8) | Sí (no dependen del deploy), pero no sirven para reconstruir un incidente |
| **Supabase — API (PostgREST), Postgres, Auth, Storage** | Logs Explorer del dashboard (Logs → API / Postgres / Auth / Storage) | **Depende del plan** (valores publicados por Supabase): **Free = 1 día, Pro = 7 días**, Team = 28 días. Log Drains (exportar a otro sitio) solo desde Team. **Plan Free confirmado el 28-ago (P1) → retención de 1 día según lo publicado** (P4: falta ver el rango real en Logs → API). Un incidente de ayer **ya no se puede diagnosticar hoy**: es exactamente la falla del proveedor del incidente original. | Sí: un deploy del front no toca Supabase. Un cambio de cómputo (resize) reinicia Postgres pero los logs siguen en el explorador. |
| Postgres — consultas lentas | `pg_stat_statements` viene habilitado en Supabase (Reports → Query Performance / Advisors). `log_min_duration_statement` (slow query log clásico): **-1, apagado** (confirmado 28-ago con `sql/01`, P5) | Los acumulados de `pg_stat_statements` persisten hasta reinicio/reset | Sí |
| Rate limiting propio (bloque 51) | Tabla `intentos_publicos` (IP, función, éxito, fecha). Es la **única traza de tráfico público que nosotros controlamos**. | Se poda sola a **2 días** (`fn_anotar_intento`, 2 % de las llamadas) | Sí |

### I.6 — Rastreo de errores (Sentry o similar)

**No hay ninguno.** Búsqueda de `sentry` en todo el código = 0. No hay dependencia de telemetría,
ni `window.onerror`, ni reporte a Supabase de errores del cliente. Si el formulario falla en el
teléfono de una familia, **nadie se entera** salvo que la persona lo reporte.

Lo único parecido: el arnés de Playwright (repo aparte, `SATAG - Evidencia de pruebas/arnes/`)
que corre `--solo=fallos` contra el sitio publicado tras cada deploy (`post-deploy.yml`,
**inerte** hasta `vars.ARNES_POST_DEPLOY == 'true'`). Detecta regresiones, no incidentes en vivo.

### I.7 — Health check

**No existe un health check propio.** Lo que hay:

| Endpoint | ¿Toca la BD? | Costo | Medido 28-ago |
|---|---|---|---|
| `GET https://satag.vercel.app/` | No | Estático, `HIT` en edge | 200 |
| `GET <supabase>/auth/v1/health` (con `apikey`) | No (responde GoTrue) | Barato | 200 en 0.71 s |
| `HEAD <supabase>/rest/v1/cat_marcas?select=id` (con `apikey`, `Prefer: count=exact`) | **Sí** (consulta real) | Una consulta chica | 200, `x-envoy-upstream-service-time: 499 ms` en el primer toque, 4–39 ms después |

Para el vigía de la Fase 5 conviene **uno de cada tipo**: el estático (¿el front está arriba?) y
uno que sí toque la BD (¿Postgres responde?), porque la falla del incidente original habría
pasado un health check que no dependiera de la BD.

### I.8 — PDFs, correos y trabajo pesado

| Tarea | Dónde se ejecuta | ¿Cola? |
|---|---|---|
| **Comprobante del alta** («Imprimir / Descargar») | `window.print()` en el navegador (`app/registro/page.tsx:670`). **No hay generación de PDF en servidor.** | No hace falta |
| **Correos** | Solo los de **Supabase Auth**: invitación (`/admin/invite/`) y recuperación (`/admin/reset-password/`). Los envía GoTrue. Destinatarios = personal del panel (≤5 cuentas), nunca familias. | Los manda GoTrue, fuera de nuestra petición. **PENDIENTE (P6):** si no hay SMTP propio configurado, Supabase limita a **muy pocos correos por hora** (valor publicado: 2–4/h) y solo a miembros del equipo |
| **Firma** | El PNG se genera en canvas en el navegador; se sube a Storage (`subirFirma`, ~15 KB medido en el caso E-02) y el SHA-256 se calcula en el navegador (`crypto.subtle`). | No hace falta |
| **Hash legal del paquete** | Dentro de `crear_registro` (bloque 19): 2 `digest(sha256)` sobre el reglamento y el aviso completos + 1 sobre el payload JSON, **por cada alta**. | Corre en la transacción de la alta. Es CPU de Postgres pequeña pero real; se medirá en Fase 2. |
| Cron / jobs | Ninguno. La única «tarea periódica» es la poda probabilística de `intentos_publicos`. | — |

### I.9 — Peticiones por pantalla (lo que la Fase 2 va a medir)

Levantado del código (`lib/supabase/api.ts`, `lib/supabase/apiPanel.ts`, `app/**`,
`components/admin/**`). Cada fila es **una petición HTTP a Supabase**.

**Público (rol `anon`, sin sesión) — es donde ocurre el pico de una apertura anunciada:**

| Momento | Peticiones | Detalle |
|---|---|---|
| Abrir `/registro/` | **5 GET** en paralelo | `cat_marcas`, `cat_colores`, `reglamento_versiones (vigente)`, `aviso_versiones (vigente)`, `aviso_versiones (contenido_simplificado)` — las dos últimas leen **la misma fila** dos veces |
| Elegir marca | **1 GET** por cambio | `cat_modelos` con `cat_marcas!inner` (join) |
| Enviar el alta | **1 POST Storage + 1 POST RPC** | `storage/v1/object/firmas/<uuid>.png` (~15 KB) y `rpc/crear_registro` (2 selects, `nextval`, 3 inserts, 3 sha256) |
| `/solicitudes/` con folio | **1 POST RPC** | `crear_solicitud`: count sobre `intentos_publicos` (índice), 1 select `registros`, insert `solicitudes`, insert intento |
| `/solicitudes/` sin folio (nota) | **1 POST RPC** | `crear_nota_solicitud`: count intentos, insert nota, insert intento |

**Panel (rol `authenticated` + `aal2`, ≤5 personas):**

| Momento | Peticiones | Detalle |
|---|---|---|
| Entrar | 3–4 a GoTrue | `signInWithPassword`, `getAuthenticatorAssuranceLevel`, `challengeAndVerify` (+ `getSession` al recargar) |
| Pestaña **Administración** | **1 GET** | `registros?select=<26 columnas> + pagos(*) + registro_estacionamientos(*) + solicitudes(*) + movimientos(*)`, **sin `limit` ni `range`**: trae el padrón COMPLETO con 4 tablas embebidas. La paginación «25 por página» (SC-024) es **en memoria**. **Se repite completo después de cada cobro.** |
| Pestaña **TI** | **6 GET** en paralelo | El mismo `registros` completo + `solicitudes` (notas sueltas) + `v_registros_incompletos` (vista con `left join pagos` y subconsultas) + `estacionamientos` + `cat_marcas` + `cat_colores`. Se repite tras cada instalación/actualización/baja. |
| Pestaña **Consulta** | **2 GET** | `registros` completo + `v_registros_incompletos` |
| Pestaña **Finanzas** | **1 RPC + 1 GET** (+1 GET por corte expandido, `limit 1000`) | `estado_caja`, `cortes_caja`, `pagos(corte)` |
| Abrir la evidencia de una firma | **1 GET + 1 POST** | `v_evidencia_firma` + `storage/.../sign` (URL de 60 s) — bajo demanda, por tarjeta |
| Acción (cobrar, instalar…) | **1 RPC** + la recarga completa de arriba | Los RPC toman `for update` sobre la fila del registro; `cortar_caja` toma un `pg_advisory_xact_lock` |

**Cómo está escrita la RLS (importa para el costo):** las 7 políticas de lectura del panel usan
`auth.jwt() ->> 'aal'` y `auth.jwt() -> 'app_metadata' ->> 'rol'` **directamente** (bloques 13,
27, 30, 42, 47, 48), no envueltas en `(select auth.jwt())`. Postgres puede evaluarlas **por fila**
en vez de una vez por consulta. Con ~60 registros no se nota; con 1,660 × 4 embeds es una hipótesis
concreta para la Fase 2 (medir con `explain analyze`, no suponer).

**Índices existentes** (26; búsqueda de `create index` en `supabase/sql/`): cubren
`registros(estado)`, `(no_dispositivo)`, `(upper(placas))`, `(lower(usuario_nombre_completo))`,
las FK de `pagos`, `movimientos`, `solicitudes`, `registro_estacionamientos` hacia `registros`, y
`intentos_publicos(ip, funcion, creado_en)`. **No hay índice en `registros(created_at)`**, que
es el `order by` del padrón completo (con N chico Postgres ordena en memoria; medir).

### I.10 — Latencia observada (NO es costo de CPU; eso es la Fase 2)

Sonda del 28-ago-2026 desde la red de la escuela, 5 repeticiones seguidas por consulta, valor de
`x-envoy-upstream-service-time` (ms que tardó PostgREST+Postgres, sin la red):

| Consulta (rol anon) | Rep 1 | Rep 2–5 |
|---|---|---|
| `cat_marcas` (24 filas) | 39 | 8 · 7 · 5 · 4 |
| `cat_colores` | 11 | 4 · 14 · 5 · 3 |
| `reglamento_versiones` vigente | 34 | 6 · 14 · 17 · 4 |
| `aviso_versiones` vigente | 15 | 21 · 4 · 23 · 26 |
| `cat_modelos` (join, marca Nissan) | 20 | 4 · 3 · 3 · 3 |
| `HEAD cat_marcas` con `count=exact` (primer toque del día) | **499** | — |

Lectura honesta: en vacío, cada lectura pública cuesta **unidades de ms** en el backend; el primer
toque del día cuesta **medio segundo** (calentamiento del pool/plan, o el proyecto despertando).
Ninguno de estos números dice cuánta CPU consume ni cuántas caben por segundo: eso exige saturar
con concurrencia (Fase 2).

**Arranque en frío, observado dos veces el 28-ago:** el primer toque del día costó 499 ms
(§I.7) y, tras ~20 min sin tráfico, la primera ráfaga de una prueba de humo dio **p95 2,554 ms
con solo 2 familias** (máximos de 560–627 ms por petición en `cat_marcas`/`cat_modelos`); la
repetición inmediata dio 355 ms con 2–4 ms dentro de Supabase. No se midió la causa
(calentamiento de pool/plan/gateway); la consecuencia práctica va al checklist de día de pico:
**calentar el proyecto antes de la hora**.

Dato previo útil (bitácora P-11, 17-ago-2026): un script metió **20 notas al buzón en ~3 s**,
cada una entre 90 y 300 ms de ida y vuelta, sin fallos. Es la única prueba de concurrencia que
existe hoy, y no midió CPU.

### I.11 — Herramientas de debug en producción

**Ninguna.** No hay equivalente a Telescope/Debugbar. `package.json` no trae dependencias de
debug; Next.js no genera source maps de producción por defecto (`productionBrowserSourceMaps`
no está activado); el overlay de errores existe solo en `next dev`. `.env.local` solo contiene
las dos variables públicas por diseño; no hay `service_role` en el repo ni en el front. Lo único
extra en `.github/` es `guardian:mapa` (informativo, en CI, no en el sitio).

### I.12 — Pendientes: lo que solo se ve en los dashboards (NO estimado)

| # | Dato | Dónde confirmarlo | Por qué importa |
|---|---|---|---|
| P1 | ~~Plan y tier de cómputo~~ **RESUELTO 28-ago 11:45** (captura de Settings → Infrastructure): plan **FREE**, cómputo **NANO = `t4g.nano`** («Shared CPU», «Up to 0.5 GB memory»). En reposo: RAM **55 %**, CPU 2 %, disco 14 % (BD 26.7 MB · WAL 80 MB · sistema 168 MB de 2 GB). El disco autoescala; **el cómputo no** (cambiarlo exige Pro). | — | Es el numerador de la Ley de Utilización → ver Fase 2 §II.1. Sigue vigente el riesgo de **pausa a los 7 días sin uso** del plan Free |
| P2 | ~~Límite de conexiones~~ **RESUELTO 28-ago**: **17 / 60 conexiones** directas en reposo (los servicios de Supabase ya ocupan 17; quedan ~43 para PostgREST/GoTrue/Storage bajo carga). Pooler Supavisor (captura de Settings → Database, 28-ago ~12:00): **pool size 15** hacia Postgres por usuario+BD, **200 clientes máx.** (fijo en Nano). **Matiz:** SATAG no pasa por Supavisor —el navegador habla con PostgREST, que lleva su **propio pool interno** hacia Postgres (no visible en el dashboard, pequeño en Nano). Ese pool es el sospechoso del codo de §II.2 (≈800 req/s con CPU ≈ 25 %) | — | Umbral de la Fase 3: **conexiones directas < 60**; el pooler de 200 solo aplicaría a un cliente externo (no hay ninguno) |
| P3 | ~~Región~~ **RESUELTO 28-ago**: **East US (North Virginia), `us-east-1`** | — | ~80 ms de ida y vuelta desde Querétaro (medido en la prueba de humo de k6: 81–85 ms de mediana con 2–3 ms dentro de Supabase) |
| P4 | **Retención de logs** efectiva | Logs → API → rango de fechas disponible | Si es 1 día, la lección del incidente («no conservaba logs») está sin resolver |
| P5 | ~~Slow query log~~ **RESUELTO 28-ago** (`sql/01`): **`log_min_duration_statement = -1` (apagado)**; `pg_stat_statements` instalado (track=top); `statement_timeout` `anon` 3 s / `authenticated` 8 s | — | Fase 4: proponer umbral |
| P6 | **SMTP propio** para Auth y **rate limits** de Auth | Authentication → SMTP Settings · Authentication → Rate Limits | Invitaciones/recuperaciones el día de arranque; límites de login por IP si todo el personal entra desde la misma IP de la escuela |
| P7 | ~~Tamaño y registros~~ **RESUELTO 28-ago** (`sql/01`): base **12 MB**; padrón real **3 registros** (todos pendientes). Por eso el panel se midió con **1,660 sintéticos en una transacción deshecha** (§II.5) | — | — |
| P8 | **Plan de Vercel** (Hobby / Pro) | Vercel → Settings → Billing | Solo afecta a la retención de logs del front y a límites de ancho de banda (100 GB/mes en Hobby) |
| P9 | Uso de CPU/RAM del proyecto en el último mes | Reports → Infrastructure | Línea base de utilización en vacío (para restar del cálculo de la Fase 2) |

### I.13 — Demanda esperada (de los documentos, no medida)

- Padrón histórico en papel: **~1,660 registros + ~300/año** (Desarrollo 06). Diseño del padrón
  paginado «pensando en **300 familias**» (Plan 06 · reunión 4-sep).
- Personal del panel: **4 cuentas con rol** (admin/ti/super/consulta).
- El escenario de pico realista es **una convocatoria anunciada de alta** (familias llenando
  `/registro/` en una ventana corta): N familias × (5 GET + 1–3 GET de modelos + 1 Storage + 1 RPC).
  El personal cobrando/instalando en paralelo agrega el padrón completo por acción.
- La Fase 2 tomará **300 familias en 1 hora** como referencia de demanda salvo que Dirección fije
  otra; se documentará como supuesto.

### I.14 — Resumen ejecutivo del inventario

| Punto del checklist | Estado |
|---|---|
| Sesiones fuera de la BD | ✅ No hay sesiones de servidor (JWT en navegador) |
| Caché de aplicación | ❌ Ninguna; el formulario público hace 5 lecturas a Postgres por visita |
| opcache / config / route / view cache | ✅ No aplica; build estático + assets inmutables verificados |
| Tareas pesadas en cola | ✅ No hay tareas pesadas (PDF en navegador, correos solo de Auth) |
| Slow query log | ❌ Confirmado 28-ago: `log_min_duration_statement = -1` (apagado); `pg_stat_statements` sí |
| Logs con retención | ❌/❓ Front: cero instrumentación. Supabase: 1 día si el plan es Free (P1/P4) |
| Errores en Sentry o similar | ❌ Ninguno |
| Health check barato sin BD | ⚠️ Existen endpoints usables (`/` de Vercel, `/auth/v1/health`) pero nadie los vigila |
| Estáticos cacheados | ✅ Vercel verificado · ⚠️ `.htaccess` de GoDaddy no cubre `/_next/static/` |
| Sin herramientas de debug | ✅ |
| Límite de conexiones conocido | ✅ 60 directas (17 en reposo según dashboard; 12 en `pg_stat_activity`); pooler 15/200 fuera de la ruta |
| Deploy sin romper assets/sesiones | ✅ Assets con huella + HTML revalidado; sesiones en navegador (un deploy no las toca). Vercel es atómico; el FTPS a GoDaddy **no** lo es (se revisará en Fase 4) |
| Tier de cómputo y autoscaling | ✅ Confirmado 28-ago: Free · `t4g.nano` · sin autoscaling de cómputo (solo disco) |

---

## Fase 2 — Costo por petición y capacidad (28-ago-2026, en curso)

> Método completo y herramientas en [`pruebas-carga/README.md`](pruebas-carga/README.md).
> Regla: los números de esta sección son **medidos**; donde diga *pendiente* es que aún no se
> midió.

### II.1 — La máquina que hay que llenar

Confirmado en el dashboard (Settings → Infrastructure, 28-ago 11:45):

| Recurso | Valor | Fuente / nota |
|---|---|---|
| Instancia | **`t4g.nano`** (Supabase «Nano», plan Free) | Captura del dashboard |
| vCPU | **2 vCPU compartidas** (AWS Graviton2, familia burstable T4g) | Especificación publicada de AWS para `t4g.nano`. Supabase la etiqueta «Shared CPU» |
| Ráfaga / créditos | `t4g.nano` es **burstable**: línea base publicada por AWS de **5 % por vCPU** (10 % de la instancia); por encima consume créditos de CPU y, agotados, se estrangula a la línea base. **No se puede observar el saldo de créditos desde Supabase** (es una métrica de CloudWatch de AWS). | Riesgo específico de día de pico: una carga sostenida alta durante horas puede agotar créditos y dejar la BD a ~10 % de CPU. **Pendiente** medir cuánto dura una ráfaga (Fase 3) |
| RAM | **0.5 GB**, **55–62 % ocupada en reposo** | Captura: «RAM 55 %», gráfica MEMORY 62 % |
| Conexiones directas | **60**, **17 en uso en reposo** | Captura: «17/60 conns» |
| Pooler (Supavisor) | 15 al Postgres · 200 clientes (fijo en Nano) · **no está en la ruta de SATAG** (el navegador va por PostgREST, que tiene pool propio) | Captura de Settings → Database |
| Disco | 2 GB, 14 % usado (BD 26.7 MB + WAL 80 MB + sistema 168 MB); IO 1 % | Captura. La base entera cabe en memoria: el disco no es cuello |
| Región | `us-east-1` | Captura |
| Autoscaling | **No** para cómputo (exige plan Pro para siquiera cambiar el tamaño); sí para disco | Captura de Settings → Compute and Disk |

**Ley de Utilización con estos datos** (Lazowska et al., cap. 3):

```
capacidad (req/s) = vCPU_prod × 0.7 ÷ CPU_por_petición
                  = 2 × 0.7 ÷ CPU_por_petición  (segundos de CPU por petición)
                  = 1.4 ÷ CPU_por_petición
```

con la salvedad de que las 2 vCPU son compartidas/burstables: el 0.7 de margen se aplica sobre
lo que la instancia entrega **mientras tiene créditos**. Para la planeación se usará la cifra
de la meseta medida, no la teórica.

Durante la primera corrida de k6 (11:39–11:50) la gráfica del dashboard marcó **CPU ≈ 25 %** y
«Compute» ≈ 75 % (pico visible el 28-ago en la captura), con **RAM 62 %**.

### II.2 — Lecturas públicas (rol `anon`): medidas el 28-ago-2026

**Método.** k6 v2.2.0 desde una laptop en la red de la escuela (Querétaro → `us-east-1`,
~83 ms de ida y vuelta en vacío), contra el proyecto real, **solo GET** con la llave pública.
Cada ruta se saturó por separado con un perfil rampa → sostén → bajada; `analizar.py` agrupa
en ventanas de 10 s. Dos corridas:

| Corrida | Escenarios | Perfil | Archivo |
|---|---|---|---|
| `2026-08-28T11-39-06-lecturas` | las 6 consultas sueltas + «visitante» (5 GET en paralelo) | 0→40 VUs en 30 s, 40 s sostén, 10 s bajada | `pruebas-carga/resultados/…-lecturas.csv.analisis.md` |
| `2026-08-28T11-50-16-lecturas-100vus` | «visitante» y `reglamento` | 0→100 VUs en 30 s, 30 s sostén, 10 s bajada | `…-lecturas-100vus.csv.analisis.md` |

**Cómo se lee el codo.** `upstream` es `x-envoy-upstream-service-time`: el tiempo **dentro** de
Supabase. Mientras se queda plano, el límite es la máquina que dispara (40 VUs ÷ 0.085 s = 470
req/s exactos); cuando sube junto con la latencia y el throughput se aplana, es Supabase.

| Ruta | VUs | req/s meseta | p50 / p95 ms (ida y vuelta) | upstream med ms | err | Lectura |
|---|---|---|---|---|---|---|
| `cat_marcas` | 40 | 461 | 83 / 124 | **2** | 0 | no saturó Supabase (cota inferior) |
| `cat_colores` | 40 | 457 | 83 / 125 | **2** | 0 | ídem |
| `reglamento_versiones` | 40 | 470 | 84 / 102 | **2** | 0 | ídem |
| `aviso_versiones` | 40 | 457 | 86 / 107 | **3** | 0 | ídem |
| `aviso_versiones` (corto) | 40 | 452 | 84 / 126 | **2** | 0 | ídem |
| `cat_modelos` (join) | 40 | 444 | 86 / 123 | **3** | 0 | ídem |
| **`reglamento_versiones`** | **100** | **708–731** | 139 / 162–185 | **60** (de 2 → 33 → 61 al llegar al tope) | 0 | **codo de Supabase** |
| **«visitante»** (5 GET paralelos) | 26–40 | **787–831** | 222 / 268–294 | **133** (3 → 15 → 82 → 133) | 0 | **codo de Supabase** |
| «visitante» | 100 | 655–751 | 641–661 / **732–1131** | **559–578** | 0 | sobrecarga: menos throughput que a 40 VUs y latencia ×5; sin errores |

**Resultado.** La capacidad de lectura pública del `t4g.nano` es **≈ 730–830 peticiones/s**
(dos rutas distintas, dos corridas, mismo tope). En términos de formulario: **~150–165 aperturas
de `/registro/` por segundo**. Pasado el codo el sistema **no falla**: encola (0 errores en
~330,000 peticiones), pero cada apertura del formulario sube de 0.2 s a 0.7–1.1 s.

**Costo por petición (lo que se puede afirmar y lo que no):**

- Si el cuello fuera la CPU al 100 %, el costo sería `2 vCPU ÷ 830 req/s = 2.4 ms de CPU por
  lectura` — es una **cota superior**.
- La gráfica del dashboard durante la corrida 1 marcó **CPU ≈ 25 %** (captura de las 11:45).
  Con 25 % de 2 vCPU a 830 req/s el costo sería ≈ 0.6 ms/req, y el cuello **no sería la CPU
  sino la cola de PostgREST hacia Postgres** (su pool de conexiones, pequeño en Nano). Es una
  lectura de gráfica, no una medición simultánea: queda como **hipótesis** hasta correr el
  muestreador (`vigia/metricas-supabase.mjs`, necesita la `service_role` en el entorno).
- Lo que sí es medido: **2–3 ms dentro de Supabase por lectura en vacío**, y **60–133 ms** en el
  codo.

**Capacidad vs. demanda (lecturas).** Una familia que se da de alta hace ≈ 5 GET al abrir + 1–3
GET de modelos + 1 subida + 1 RPC ≈ **9 peticiones en ~4 minutos** (0.04 req/s por familia
activa). Con el margen 0.7 sobre la meseta baja (730 × 0.7 ≈ 510 req/s) caben del orden de
**12,000 familias activas a la vez** solo en lecturas. La referencia de demanda (§I.13, 300
familias en 1 hora, ≈ 0.75 req/s en promedio) está **tres órdenes de magnitud** por debajo. **Las
lecturas públicas no son el riesgo**; los candidatos reales son las escrituras (Storage +
`crear_registro`), el padrón completo del panel y los créditos de ráfaga del `t4g.nano` —
todos **pendientes** en §II.3.

**Ruta en rojo por >300 ms de CPU:** ninguna de las lecturas públicas (2–3 ms en vacío). Se
revisará al medir el panel y las escrituras.

### II.3 — Línea base de Postgres (`sql/01-estado-proyecto.sql`, 28-ago-2026 ~12:10)

| Dato | Valor medido | Lectura |
|---|---|---|
| Versión | PostgreSQL 17.6, aarch64 | Graviton |
| `max_connections` | **60** | Coincide con el dashboard |
| `shared_buffers` / `effective_cache_size` / `work_mem` | 224 MB / 384 MB / 2,184 kB | La base (12 MB) cabe ~18 veces en `shared_buffers`: **todo se sirve desde memoria** (en todos los planes de abajo, `shared hit` sin un solo `read`) |
| **`log_min_duration_statement`** | **-1 (apagado)** | **No hay slow query log.** `pg_stat_statements` sí está (track=top) → Fase 4 |
| `statement_timeout` | **`anon` 3 s · `authenticated` 8 s** · editor 2 min | Defensa ya presente: una consulta pública que pase de 3 s se corta sola. También es un **precipicio**: el padrón completo se corta a los 8 s |
| Conexiones en reposo (`pg_stat_activity`) | **12**: 5 sistema · 3 `supabase_admin` · **2 `authenticator` idle (PostgREST)** · 2 `postgres` (el editor) | El dashboard marca 17/60 (cuenta también lo que no pasa por `pg_stat_activity` de esta BD) |
| Tamaño de la base | **12 MB** | BD 26.7 MB en el dashboard (incluye WAL/sistema) |
| Padrón real | **3 registros** (todos `pendiente`) · 2 aceptaciones · 20 solicitudes · 22 intentos_publicos | Las estadísticas `n_live_tup` marcan 0 en catálogos: autovacuum no las ha analizado (tablas diminutas); el conteo real de `cat_marcas` es 24 |
| Documentos que se hashean en cada alta | reglamento v2 **3,946** caracteres · aviso v2 **6,303** (simplificado 893) | Costo de los `digest(sha256)` incluido en §II.4 |

### II.4 — Escrituras públicas (`sql/03-costo-rpc-rollback.sql`, transacción con ROLLBACK, 28-ago-2026)

Método: N llamadas seguidas cronometradas con `clock_timestamp()` **dentro de Postgres**, como
`postgres` con los mismos `request.headers` que manda PostgREST; todo deshecho al final
(comprobado: 0 registros, 0 solicitudes, 0 intentos con la IP de medición). Único rastro: 20
`nextval` de `registros_folio_seq` (20 folios `SATAG-000xxx` saltados).

| RPC | N | Promedio | Mejor | Peor | Primera llamada (frío) | Qué hace |
|---|---|---|---|---|---|---|
| **`crear_registro`** (alta completa) | 20 | **0.87 ms** | 0.68 | 1.84 | **18.9 ms** (`explain analyze`: 379 buffers hit, 17 dirtied) | 2 selects de documentos, `nextval`, 3 inserts, 3 `sha256` (3,946 + 6,303 caracteres + payload) |
| **`crear_solicitud`** (folio inexistente = camino del atacante) | 20 | **0.32 ms** | 0.06 | 2.65 (1.ª) | llamada 1: 2.65 · llamada 10: 0.08 · **llamada 11 (límite del bloque 51 activo): 0.16** · llamada 20: 0.06 | count de intentos (índice) + select `registros` + insert intento; desde la 11.ª, sin el select |
| **`crear_nota_solicitud`** (buzón) | 9 | **0.50 ms** | 0.23 | 2.00 | — | count de intentos + insert nota + insert intento |

**Lectura.** Ninguna escritura pública pasa de **2 ms** en Postgres; la alta completa cuesta
**menos que una lectura de catálogo vista desde fuera**. El «frío» de 19 ms es el plan de la
función plpgsql en una conexión nueva; PostgREST reutiliza conexiones, así que en producción
se paga pocas veces. Capacidad teórica de `crear_registro` por CPU: `1.4 ÷ 0.00087 ≈ 1,600
altas/s` — **no medida bajo concurrencia** (exige staging; §II.7). Lo que sí falta medir del
alta es la **subida del PNG a Storage** (~15 KB), que no pasa por Postgres.

### II.5 — Panel al volumen objetivo (`sql/04-costo-padron-rls.sql`, 1,663 registros sintéticos, ROLLBACK, 28-ago-2026)

Método: dentro de una transacción se fabricaron **1,660 expedientes** (registro + pago + 2
movimientos + estacionamiento + 1 solicitud cada 10; 1,328 pagos y 2,988 movimientos, 270 ms
de carga) encima de los 3 reales, sin tocar secuencias; se fijó `request.jwt.claims` con
`aal2` + rol `super`, `set local role authenticated`, se midió y se deshizo. La consulta es la
réplica de `registros?select=…,pagos(*),registro_estacionamientos(*),solicitudes(*),movimientos(*)&order=created_at.desc`
(LATERAL + `json_agg`, como la arma PostgREST).

| Consulta | Filas | Tiempo en Postgres (3 corridas) | `explain analyze` | Tamaño |
|---|---|---|---|---|
| **Padrón completo con 4 embeds** (Administración, TI, Consulta; se repite tras cada acción) | 1,663 | **127 · 124 · 123.7 ms** | 97.7 ms · 17,496 buffers (todo memoria) · sort 3 ms | **2,678 KB de JSON por carga** |
| `v_registros_incompletos` (TI, Consulta) | 324 | **38.9 · 33.1 · 32.8 ms** | 33.6 ms · 8,681 buffers | — |
| `count(*) registros` **con RLS** (`authenticated`) | 1,663 | — | **8.87 ms** | — |
| `count(*) registros` **sin RLS** (`postgres`) | 1,663 | — | **0.34 ms** | — |

**Dónde se va el tiempo del padrón (del plan, `loops=1663`):** seq scan de `registros` con el
filtro RLS 9.7 ms · pagos 18 ms · estacionamientos 15 ms · solicitudes 5 ms · **movimientos 42
ms** (bitmap scan + filtro RLS sobre 2,988 filas) · sort 3 ms.

**La RLS por fila, confirmada con número.** El `Filter: ((COALESCE(NULLIF(current_setting('request.jwt.claim'…))::jsonb ->> 'aal') = 'aal2' AND … 'rol' = ANY(…))`
aparece en **los seis nodos** del plan (registros, pagos, estacionamientos, solicitudes,
movimientos y en la vista). Medido en limpio: **8.5 ms por 1,663 filas ≈ 5 µs por fila** (26× el
costo del scan sin RLS). En el padrón el filtro se evalúa ~7,500 veces (1,663 + 1,328 + 1,328
+ 166 + 2,988 filas): **del orden de 35–40 ms de los 98 ms son RLS** — cálculo a partir de los
`loops` del plan, no medición separada. La forma `(select auth.jwt())` que Postgres evalúa una
vez por consulta es la corrección candidata (Fase 4, proponer).

**Capacidad del panel a 1,660.** `1.4 ÷ 0.125 ≈ 11 padrones/s` por CPU de Postgres (sin contar
la serialización de 2.6 MB en PostgREST, no medida). Con 4 personas que recargan como mucho
una vez cada 30 s (0.13/s) la utilización es **~1 %**. **No es un problema de capacidad; es un
problema de tamaño**: 2.6 MB por clic sobre la red de la escuela, y `Max rows = 5000` en la
API (Settings → API, fijado el 17-ago) hace que el padrón **se trunque en silencio** cuando pase
de 5,000 filas (≈ año 11 al ritmo de 300/año). Ambas cosas van a la Fase 4.

**Ruta en rojo (>300 ms de CPU): ninguna.** La más pesada, el padrón a 1,660, queda en
**ámbar (125 ms)**; hipótesis ya verificadas en el plan: (a) padrón completo sin paginación en
servidor → O(N); (b) RLS evaluada por fila en 5 tablas; (c) 4 embeds = 5 recorridos de índice
por registro. Descartada: el `order by created_at` sin índice cuesta 3 ms.

### II.6 — Tabla consolidada: ruta → costo medido → req/s → usuarios

| Ruta | Uso | Costo medido | Método / fecha | req/s soportadas | Usuarios concurrentes estimados |
|---|---|---|---|---|---|
| `cat_marcas`, `cat_colores`, `reglamento`, `aviso` ×2, `cat_modelos` (anon) | 5–6 por apertura de `/registro/` | **2–3 ms dentro de Supabase** (vacío); 60 ms en el codo | k6 28-ago, `x-envoy-upstream-service-time` | **730–830 medidas** (codo de Supabase, 0 errores) | ≈ 12,000–13,000 familias activas (9 req por familia en ~4 min, margen 0.7) |
| «Visitante» = las 5 lecturas en paralelo | 1 por apertura | 133 ms dentro de Supabase en el codo | k6 28-ago | **≈ 165 aperturas/s** | ídem |
| `crear_registro` (anon, alta) | 1 por familia | **0.87 ms** en Postgres (18.9 frío) | SQL rollback 28-ago | 1,600/s teórico por CPU · **pendiente medir bajo concurrencia** (staging) | — |
| `crear_solicitud` / `crear_nota_solicitud` | esporádico | **0.32 / 0.50 ms** | SQL rollback 28-ago | limitado por diseño a 10/IP/15 min y 10/IP/hora (bloque 51) | — |
| Subida del PNG de la firma (Storage) + `crear_registro` = **alta completa** | 1 por familia, 15 KB | **med 289 ms · p95 889 ms · p99 1,697 ms** de ida y vuelta (2 peticiones seguidas) | k6 flujo completo, 28-ago, 300 familias, 2,982 altas | **4.7 altas/s medidas** con CPU 46 % (no se buscó el tope); ≈ 7.5/s extrapolado al 70 % | 300 familias verificadas (§III.3) |
| Login + MFA del panel (GoTrue) | ≤5 personas/día | **pendiente** (no crítico) | — | — | — |
| **Padrón completo con 4 embeds** (panel) | 1 por pestaña y por acción | **125 ms** en Postgres a 1,663 filas + **2.6 MB** | SQL rollback 28-ago | **≈ 11/s** por CPU (teórico) · PostgREST no medido | ≈ 330 usuarios de panel a 1 recarga/30 s; reales: 4 |
| `v_registros_incompletos` (panel) | 1 por pestaña TI/Consulta | **35 ms** a 1,663 | SQL rollback 28-ago | ≈ 40/s teórico | — |
| Evidencia de firma (vista + URL firmada) | bajo demanda | **pendiente** | — | — | — |

### II.7 — Pendientes de la Fase 2 (medir, no estimar)

| # | Qué falta | Cómo | Bloqueado por |
|---|---|---|---|
| F2-1 | **PostgREST serializando el padrón de 2.6 MB** y su margen frente al `statement_timeout` de 8 s | `correr.ps1 panel` (hoy contra 3 registros solo mide el vacío; el número útil sale de staging con volumen) | Sesión MFA fresca del arnés + staging |
| F2-2 | **CPU real** durante la carga → ms de CPU por petición y si el codo de 800 req/s es CPU o cola de PostgREST | `vigia/metricas-supabase.mjs` + repetir «visitante» | `service_role` en variable de entorno (solo durante la corrida) |
| F2-4 | **Costo exacto por consulta** (`mean_exec_time`) de lo que manda PostgREST | `sql/02` bloque A → k6 → bloque B | Manos del administrador |
| F2-8 | ~~Subida de la firma a Storage bajo concurrencia~~ **MEDIDA 28-ago** en la ventana (§III.2): 2,982 subidas de 15 KB + RPC, alta completa p95 889 ms, 0 errores, CPU 46 % | — | Falta el tope (no se buscó) |
| F2-9 | Duración de la **ráfaga** del `t4g.nano` antes de agotar créditos | Carga sostenida larga contra staging con muestreador | Staging + `service_role` |

Resueltos el 28-ago: F2-3 (escrituras, §II.4), F2-5 (RLS, §II.5), F2-6 (línea base, §II.3), F2-7 (pooler, P2).

### II.8 — Aterrizado: cuántos a la vez y cómo lo viven

Una familia que se da de alta genera ~9 peticiones a Supabase en ~4 minutos (5 al abrir, 1–3 al
elegir marca, 2 al enviar); el resto del tiempo lee y llena, sin costo.

| Familias en `/registro/` | Base medida | Experiencia |
|---|---|---|
| **Hasta ~150 abriendo el formulario en el mismo segundo** (miles llenándolo a la vez) | 165 aperturas/s con 2–3 ms dentro de Supabase | Normal: página en ~0.3 s, desplegables inmediatos, «Enviar» < 0.5 s |
| **~150–300 en el mismo segundo** | 500 peticiones en vuelo: p95 0.7–1.1 s, 0 errores en 330 k | Lento pero sin errores: desplegables y «Enviar» en ~1 s; el sistema encola |
| **> ~500 en el mismo instante, sostenido** | **No medido**; extrapolación hacia el `statement_timeout` de 3 s de `anon` | Aparecerían «no se pudo cargar… reintentar» (la pantalla ya lo contempla: no abre el consentimiento sin documento) |

Escala de la escuela: las **1,660 familias del padrón entrando en el mismo minuto** serían ~140
req/s, **una quinta parte del codo**; la convocatoria de referencia (300 en una hora) es el 0.1 %.
**El formulario no se cae por cantidad de padres.**

**Personal del panel (4 personas):** la capacidad sobra; lo que sentirán es el **peso**: cada
cobro/instalación recarga el padrón completo (2.6 MB y 125 ms a 1,660 registros) → un
«Cargando…» de **1–4 s según el internet de la oficina** (20 Mbps ≈ 1 s; 5 Mbps ≈ 4 s). Hoy, con 3
registros, es instantáneo. Va a la Fase 4 junto con el truncado en 5,000 filas.

**No medido todavía (no se promete):** la subida del PNG de la firma a Storage bajo
concurrencia, y la ráfaga del `t4g.nano` (a cargas reales la CPU va casi en vacío).

**Dos trampas de experiencia que no son de capacidad:**
1. **Pausa por inactividad** (plan Free, 7 días sin uso): el día del evento todo el mundo vería
   error hasta reanudar a mano desde el dashboard → checklist de día de pico (Fase 5).
2. **Una sola IP** (WiFi de la escuela con NAT): el bloque 51 limita el buzón a **10 notas por IP
   por hora** y 10 fallos de folio por IP cada 15 min; la familia n.º 11 en el campus vería
   «demasiadas notas desde esta conexión». El alta (`crear_registro`) **no** tiene límite por IP:
   la campaña de inscripción no se afecta, el buzón sí → Fase 4.

---

## Fase 3 — Prueba de carga reproducible (script listo 28-ago-2026)

### III.1 — Qué es y cómo se corre

`pruebas-carga/k6/flujo-completo.js` (lanzador `correr.ps1 flujo`, guía completa en
[`pruebas-carga/README.md`](pruebas-carga/README.md) §Fase 3). Simula un día de convocatoria con
**familias** (abren `/registro/`, eligen marca, firman y envían: PNG de 15 KB a Storage +
`crear_registro`) y **personal** (login + TOTP → padrón → cobro → TI → instalación → Consulta),
con perfil **rampa → sostén → bajada** parametrizable y, si se pasa la `service_role` por el
entorno, un **vigía** que lee conexiones y CPU reales del Postgres cada 10 s.

**Umbrales de aprobación:** p95 < 1 s (familia y personal) · errores < 1 % · conexiones a la
BD < 54 (90 % de 60). **Solo contra staging**: el script se niega a escribir en producción
salvo `VENTANA_PRODUCCION=si`. Los datos de prueba quedan marcados (`Prueba Carga` /
`PRUEBA DE CARGA` / `pc-*.png`) y se limpian con `sql/limpiar-pruebas-carga.sql` +
`limpiar-storage.mjs`.

**Estado:** el flujo de lecturas está verificado contra el proyecto de trabajo (humo del
28-ago); el flujo **con escrituras y el panel no ha corrido todavía porque no existe staging**
(`supabase/staging/README.md`) — la cuenta Free solo admite dos proyectos activos y ya son
SATAG y SEVAD. **Camino acordado el 28-ago:** mientras SATAG no esté liberado (3 registros, 0
pagos), el proyecto real sirve de staging en una **ventana anunciada** (`correr.ps1 flujo
-Entorno trabajo -VentanaProduccion`), con el personal entrando con la sesión del arnés y
limpieza inmediata en tres pasos (`limpiar-pruebas-carga.sql` → `limpiar-storage.mjs` →
`restablecer-secuencias.sql`, que devuelve los folios de alta y recibo al último real). Un
staging permanente exigirá una segunda organización de Supabase (tope por organización; a
verificar) — la Fase 4 lo va a pedir.

### III.2 — Registro de corridas

Una fila por corrida, copiada del `.md` que genera el script. Nada se redondea hacia arriba.

| Fecha | Entorno | Familias · rampa/sostén/bajada · pensar | Personal | p95 familia | err familia | p95 personal | Conexiones máx | CPU med/máx | Resultado |
|---|---|---|---|---|---|---|---|---|---|
| 2026-08-28 | trabajo (solo lecturas, humo) | 3 · 0.1/0.2/0.05 min · 1 s | 0 | ver `resultados/humo-flujo.md` | — | — | — | — | humo: valida el script, no la capacidad |
| **2026-08-28 15:02** | **proyecto real como staging (ventana)** · escrituras sí · HTML de Vercel incluido | **300 · 3/5/2 min · 20 s** | 0 | **239 ms** (med 94 · p99 671 · máx 2,943) | **0.00 %** (0 de 27,384) | — | — (sin vigía; dashboard no capturó la tarjeta) | **46 %** en la meseta (captura del dashboard, un punto) · RAM 63 % · IO 1 % | **APROBADA** · 2,982 altas completas (4.7/s) · apertura p95 318 ms · alta completa med 289 / p95 889 / p99 1,697 ms · `resultados/2026-08-28T15-02-25-flujo-ventana-300.md` |
| *pendiente* | proyecto real (ventana) | 300 · 3/5/2 min · 20 s | 2 + vigía | | | | | | segunda corrida: personal cobrando/instalando + conexiones y CPU muestreadas |

### III.3 — Capacidad verificada

**Mayor N de familias concurrentes que ha aprobado todos los umbrales: 300** (28-ago-2026,
flujo de familias completo con escrituras, pensar 20 s, sin personal en paralelo). En 10 minutos
eso fueron **2,982 altas completas** —diez veces la convocatoria de referencia de 300/hora— con
p95 239 ms y 0 errores. **No se buscó el límite**: 300 es lo que se probó, no lo máximo que
aguanta.

**Lo que ese número no cubre todavía:** el personal cobrando e instalando al mismo tiempo (la
segunda corrida), las conexiones a la BD bajo carga (sin vigía) y la ráfaga sostenida más de 10
minutos.

**Costo con escrituras (lectura de un punto de la gráfica, no muestreo):** CPU **46 %** de la
instancia con 45.6 req/s de los cuales 4.7 altas/s con subida de PNG. Restando el 2 % de reposo:
≈ 0.88 vCPU ÷ 45.6 req/s ≈ **19 ms de CPU por petición de la mezcla**, o, cargándolo todo a las
altas, ≈ **190 ms de CPU por alta completa** (Storage + GoTrue + PostgREST + Postgres comparten
la misma `t4g.nano`; el Postgres solo pone 0.87 ms de eso, §II.4). Extrapolación lineal al 70 %:
≈ **7.5 altas/s ≈ 450/min** — 90 veces la demanda de referencia. Es extrapolación, no medida:
la segunda corrida con vigía la sustituye.

**Ráfaga (no medida, F2-9):** 10 minutos al 46 % en una `t4g.nano` consumen créditos de CPU
por encima de la línea base publicada (10 %). Si la contabilidad de AWS aplica tal cual,
una carga así se sostendría del orden de 2–3 horas antes del estrangulamiento; la demanda real
(300/hora) queda muy por debajo de la línea base y no consume créditos.

Este es el número que el checklist de día de pico (Fase 5) compara contra la demanda esperada.
