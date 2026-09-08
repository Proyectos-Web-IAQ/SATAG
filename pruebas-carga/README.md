# pruebas-carga/ — medir cuánto aguanta SATAG

Herramientas para las Fases 2 (costo por petición y capacidad) y 3 (prueba de carga
reproducible) de [CAPACIDAD.md](../CAPACIDAD.md). Regla: **nada se maquilla**; cada número
que salga de aquí se apunta con método y fecha, y lo que no se pudo medir se deja como
pendiente.

## Dónde está el cuello (y por qué se mide lo que se mide)

El front es un export estático (Vercel hoy; cPanel de GoDaddy detrás de Cloudflare como
destino). Servirlo cuesta ≈ 0 CPU nuestra. **Todo lo dinámico vive en Supabase** (PostgREST +
GoTrue + Storage + Postgres), que tiene **cómputo fijo y sin autoscaling**. Por eso:

- «Costo por petición» = **ms de CPU del Postgres de Supabase** por cada consulta o RPC.
- «Capacidad» = `vCPU_Supabase × 0.7 ÷ CPU_por_petición` (Ley de Utilización, Lazowska cap. 3).
- El front solo se vigila (Fase 5): que Cloudflare/GoDaddy sirvan `HIT` y no 5xx.

## Qué hay

| Archivo | Qué hace | Escribe en la base |
|---|---|---|
| `k6/lecturas-publicas.js` | Satura, una ruta a la vez, las 6 lecturas `anon` de `/registro/` y el «visitante completo» (5 GET en paralelo) | **No** (solo GET) |
| `k6/panel-lecturas.js` | Satura el padrón completo con 4 embeds, la vista de incompletos, las notas y la «pestaña TI» (6 GET) con una sesión `aal2` | **No** (solo GET) |
| `vigia/metricas-supabase.mjs` | Muestrea cada 5 s la **CPU, memoria y conexiones reales** del Postgres (endpoint Prometheus del proyecto) | No |
| `analizar.py` | Del CSV de k6 saca la curva VUs → req/s → p95 → tiempo dentro de Supabase, y con el CSV de métricas, **ms de CPU por petición** | No |
| `sql/01-estado-proyecto.sql` | Parámetros, conexiones en reposo, filas y tamaños por tabla | No |
| `sql/02-pgss-snapshot.sql` | `pg_stat_statements`: tiempo medio dentro de Postgres de **cada consulta real** que mandó PostgREST | No (solo el reset del contador) |
| `sql/03-costo-rpc-rollback.sql` | Costo de `crear_registro`, `crear_solicitud` y `crear_nota_solicitud` ejecutados N veces **dentro de una transacción que hace ROLLBACK** | **No persiste nada**; consume N folios de la secuencia (ver nota) |
| `sql/04-costo-padron-rls.sql` | `explain analyze` del padrón completo como lo pide el panel, con la RLS puesta, y el costo de la RLS sola | No |
| `correr.ps1` | Lanzador: lee `.env.local`, corre k6 con CSV, ejecuta `analizar.py` | — |
| `resultados/` | `*.summary.json` y `*.analisis.md` de cada corrida (el `.csv` crudo está en `.gitignore`) | — |

## Cómo correr

### 0. Requisitos

- **k6** (binario suelto, sin instalar): `https://github.com/grafana/k6/releases` → zip
  `windows-amd64` → descomprimir → `$env:K6 = "ruta\k6.exe"`. (Si `winget install GrafanaLabs.k6`
  pide elevación y la cancela, el zip es el camino.)
- Node 24 (ya está) y Python 3 (ya está).
- `.env.local` con las dos variables públicas (ya está).

### 1. Lecturas públicas (seguro; corre contra el proyecto de trabajo)

```powershell
.\pruebas-carga\correr.ps1 lecturas                       # 7 rutas, 40 VUs, ~10 min
.\pruebas-carga\correr.ps1 lecturas -VusMax 100 -Rutas visitante   # solo el visitante, más fuerte
```

### 2. Lecturas del panel (seguro; necesita una sesión MFA fresca)

```powershell
cd "..\SATAG - Evidencia de pruebas\arnes"; node sesion.mjs   # abre Chromium: usuario + TOTP, cierra solo
cd ..\..\SATAG
.\pruebas-carga\correr.ps1 panel                          # 4 escenarios, 10 VUs
```

El script canjea el `refresh_token` de `estado-panel.json` por un token de una hora. Ese
refresh queda rotado: si después quiere usar el arnés, `node sesion.mjs` otra vez.

### 3. CPU real durante la corrida (lo que convierte req/s en ms de CPU)

En **otra** ventana de PowerShell, antes de lanzar k6:

```powershell
$env:SUPABASE_SERVICE_ROLE = "<pegue aquí la service_role del dashboard>"   # solo vive en esta ventana
node pruebas-carga\vigia\metricas-supabase.mjs --cada=5 --salida=pruebas-carga\resultados\<fecha>-metricas.csv
```

La llave **no se escribe en ningún archivo**: el script la lee del entorno y nada más. Al
terminar k6, `Ctrl+C` aquí y cierre la ventana. Luego:

```powershell
python pruebas-carga\analizar.py pruebas-carga\resultados\<fecha>-lecturas.csv --metricas pruebas-carga\resultados\<fecha>-metricas.csv
```

Sin la `service_role` la corrida sigue valiendo: da throughput, latencia y **tiempo dentro de
Supabase** (`upstream_ms`), y el codo de saturación; solo falta la columna de CPU.

### 4. Escrituras (SQL Editor, 5 minutos)

No hay staging todavía y el padrón es real, así que las escrituras **no se bombardean con k6**.
Se miden en el SQL Editor con `sql/03-costo-rpc-rollback.sql`: N llamadas cronometradas y
`ROLLBACK`. Lo único que sobrevive son los `nextval` de `registros_folio_seq` (N folios
saltados; con N=20 son 20 números `SATAG-000xxx` que nunca existirán). Si eso molesta, N=3.

Cuando exista staging (guion en `../supabase/staging/README.md`), la Fase 3 corre el flujo
completo con escrituras ahí.

> **El SQL Editor de Supabase muestra solo el resultado del último statement y no enseña los
> `RAISE NOTICE`.** Por eso cada script devuelve **una sola tabla** al final (los `explain` van
> capturados como filas) y `02` se ejecuta bloque por bloque. Para copiar el resultado: botón
> *Export* → CSV, o seleccionar la tabla y pegar.

### 5. Antes y después de cada corrida (SQL Editor)

1. `sql/01-estado-proyecto.sql` una vez (línea base).
2. `sql/02-pgss-snapshot.sql` bloque **A** antes de k6, bloque **B** después → pegar la tabla
   en CAPACIDAD.md. Esa tabla trae el **texto exacto** de cada consulta que mandó PostgREST y
   su `mean_ms`: es el costo por petición del lado de la base, sin estimar nada.
3. `sql/04-costo-padron-rls.sql` una vez → `Execution Time` del padrón completo y cuánto pesa
   la RLS.

## Fase 3 · `flujo` — la prueba reproducible del flujo completo

`k6/flujo-completo.js` simula un día de convocatoria con dos poblaciones a la vez:

| Población | Qué hace cada usuario virtual | Escribe |
|---|---|---|
| **familia** (N, con rampa) | abre `/registro/` (5 lecturas en paralelo) → piensa → elige marca (modelos) → piensa → **firma y envía** (sube el PNG de 15 KB a Storage + `crear_registro`) → mira el comprobante | sí (`-Escribir si`) |
| **personal** (2–4, constantes) | entra al panel con contraseña **+ TOTP** (aal2, sin navegador) → Administración (padrón completo) → **cobra** un alta de prueba → TI (6 lecturas) → **instala** un TAG → Consulta | sí |
| **vigía** (1) | cada 10 s lee conexiones y CPU reales del Postgres (solo si `$env:SUPABASE_SERVICE_ROLE` está en la ventana) | no |

**Perfil de rampa** (parametrizable): 0 → `Familias` en `RampaMin`, sostener `SostenMin`, bajar
en `BajadaMin`. `Pensar` = segundos que una familia tarda entre pasos (20 por omisión; en la
vida real son 60–120, así que la prueba es más dura que la realidad para el mismo N).

**Umbrales de aprobación** (la corrida sale en rojo si falla alguno):

| Umbral | Valor |
|---|---|
| p95 de las peticiones de familia | **< 1 s** |
| p95 de las peticiones de personal | **< 1 s** |
| errores HTTP en cada población | **< 1 %** |
| conexiones a la base (con vigía) | **< 90 % de `LIMITE_CONEXIONES`** (54 de 60 en Nano) |
| informativos | apertura del formulario p95 < 1.5 s · alta completa (firma + RPC) p95 < 2 s · KB del padrón · CPU % |

**Solo contra staging.** El script se **niega** a escribir en el proyecto de producción
(`nqwbkjiwgjzcpmymcmqh`) salvo `-e VENTANA_PRODUCCION=si`, reservado para una ventana acordada y
anunciada. Contra el proyecto de trabajo `correr.ps1` fuerza solo lecturas.

### Cómo correrla

```powershell
# 1. Una vez: staging armado (supabase/staging/README.md) y sus datos en pruebas-carga\.env.staging
Copy-Item pruebas-carga\.env.staging.example pruebas-carga\.env.staging   # rellenar: URL, KEY, PANEL_*

# 2. (opcional, recomendado) la service_role de STAGING solo en esta ventana → activa el vigía
$env:SUPABASE_SERVICE_ROLE = "<service_role de staging>"

# 3. Corrida de referencia: 300 familias en 10 minutos (rampa 3, sostén 5, bajada 2), 2 de personal
.\pruebas-carga\correr.ps1 flujo -Familias 300 -RampaMin 3 -SostenMin 5 -BajadaMin 2 -Personal 2

# Solo lecturas contra el proyecto de trabajo (sin staging): mide el front + las 5 lecturas
.\pruebas-carga\correr.ps1 flujo -Entorno trabajo -Familias 100 -RampaMin 1 -SostenMin 2 -BajadaMin 1

# 4. Limpiar staging después
#    SQL Editor de staging: pruebas-carga\sql\limpiar-pruebas-carga.sql   (borra los expedientes 'Prueba Carga')
node pruebas-carga\limpiar-storage.mjs --url=https://<ref-staging>.supabase.co --confirmar   # los PNG pc-*.png
```

Salida: `resultados/<fecha>-flujo.md` (tabla de umbrales con ✅/❌ y **la fila lista para
CAPACIDAD.md**) y `resultados/<fecha>-flujo.summary.json` (todas las métricas).

### Sin staging: ventana en el proyecto real, antes de la liberación

La cuenta Free solo permite dos proyectos activos (SATAG y SEVAD). Mientras SATAG no esté
liberado (3 registros, 0 pagos, sin familias), el proyecto real puede servir de staging **en una
ventana anunciada**: es la misma `t4g.nano` que va a operar. Condiciones: avisar a Miguel, que
nadie haga `cortar_caja` entre la corrida y la limpieza, y limpiar de inmediato.

```powershell
cd "..\SATAG - Evidencia de pruebas\arnes"; node sesion.mjs; cd ..\..\SATAG   # sesión aal2 del personal (tu TOTP, sin guardarlo)
$env:SUPABASE_SERVICE_ROLE = "<service_role>"                                    # opcional: vigía
.\pruebas-carga\correr.ps1 flujo -Entorno trabajo -VentanaProduccion -Familias 300 -RampaMin 3 -SostenMin 5 -BajadaMin 2
# Limpieza, en este orden:
#   1. SQL Editor: sql\limpiar-pruebas-carga.sql        (borra los expedientes 'Prueba Carga'; lista los PNG)
node pruebas-carga\limpiar-storage.mjs --url=<URL real> --ventana-produccion --confirmar   # 2. los PNG pc-*.png
#   3. SQL Editor: sql\restablecer-secuencias.sql       (los folios de alta y de recibo vuelven al último real)
```

El personal entra con la **sesión del arnés** (`REFRESH_TOKEN`), no con contraseña ni TOTP en
archivos; el refresh queda rotado y el arnés necesitará `node sesion.mjs` otra vez.

La alternativa permanente —que la Fase 4 va a pedir para probar cambios de RLS antes de
aplicarlos— es una **segunda organización** en Supabase (el tope de 2 proyectos es por
organización) con `satag-staging`; verificar en la cuenta.

### Qué número actualizar en CAPACIDAD.md después de cada corrida

1. Copiar la fila que imprime el `.md` al final («Para CAPACIDAD.md §III.2: …») en la tabla
   **§III.2 Registro de corridas**.
2. Si la corrida **aprobó**, actualizar en **§III.3** la «capacidad verificada»: el mayor N de
   familias que ha pasado todos los umbrales, con fecha y entorno. Es el número que el checklist
   de día de pico (Fase 5) compara contra la demanda esperada.
3. Si **no aprobó**, anotar en §III.2 qué umbral falló y con qué valor, y **no** subir la
   capacidad verificada. Bajar N hasta encontrar el último que aprueba y registrar ese.
4. Con vigía: anotar el máximo de conexiones y la CPU media/máxima de la meseta; con eso se
   recalcula el costo por petición (`ms CPU/req = 1000 × 2 vCPU × util ÷ req/s`) en §II.6.

## Cómo leer el resultado

`resultados/<fecha>-<prueba>.csv.analisis.md` tiene, por escenario, una fila cada 10 s:

| columna | qué es |
|---|---|
| VUs | usuarios virtuales activos (cada uno dispara la siguiente petición en cuanto responde la anterior) |
| req/s | throughput observado en esa ventana |
| p50 / p95 ms | latencia de ida y vuelta vista desde aquí (incluye ~80 ms de red a `us-east-1`) |
| upstream med ms | `x-envoy-upstream-service-time`: lo que tardó **dentro** de Supabase |
| err % | respuestas que no fueron 2xx |
| CPU % / ms CPU por req | solo con `--metricas`: utilización real y `1000 × vCPU × util ÷ req/s` |

**El codo.** Suba VUs y mire dos cosas: cuándo `req/s` deja de crecer, y qué hace `upstream`.

- `req/s` se aplana **y** `upstream` sube → Supabase saturó. El `req/s` de la meseta **es la
  capacidad medida** de esa ruta.
- `req/s` se aplana pero `upstream` sigue plano → el límite está en la red o en la máquina que
  lanza la prueba; la meseta es una **cota inferior**, no la capacidad. Se anota así.
- `err %` > 0 con códigos 429/5xx → apuntar el código: 429 es un límite del gateway, 5xx es el
  pool de conexiones o el Postgres.

**Del número a CAPACIDAD.md.** Por cada ruta: `costo medido (ms CPU o ms upstream) · req/s de
la meseta · usuarios concurrentes estimados = req/s × tiempo de pensar`. Para el formulario, un
«usuario» es una familia que abre `/registro/` (5 GET), cambia de marca 1–3 veces (1 GET cada
una) y envía (1 Storage + 1 RPC) en unos 3–5 minutos.
