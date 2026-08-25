# Staging de SATAG: guion para armar el segundo proyecto de Supabase

Guion paso a paso para dejar un proyecto **nuevo** de Supabase idéntico a producción en esquema, con el banco de pruebas de QA cargado, y un preview de Vercel apuntando a él. Está escrito para hacerse **una sola vez**, con el SQL Editor y el dashboard de Supabase y el de Vercel; no hace falta CLI.

> **Por qué existe.** SATAG corre en producción sobre un solo proyecto de Supabase, con padrón real desde el 18-ago-2026, y se publica en Vercel desde `main`. No hay dónde probar un bloque SQL nuevo ni un cambio del panel sin tocar datos reales. Staging es ese lugar: se rompe ahí primero.

## Qué hay en esta carpeta

| Archivo | Qué es |
|---|---|
| `README.md` | Este guion. |
| `armar-tandas.ps1` | Concatena los bloques de `../sql/` en **tandas** (`salida/tanda-N.sql`) para pegar enteras en el SQL Editor, y copia el seed de QA como `salida/seed.sql` con advertencia. Los cortes se editan en la lista `$Cortes` al inicio del script. |
| `catalogos_base.sql` | Semillas de `estacionamientos`, `cat_colores` y `cat_marcas`. **Ningún bloque numerado las llena** (en producción entraron con el `seed.sql` monolítico, en julio). El script las intercala en la tanda 1 después del bloque 04. Sin ellas el bloque 21 inserta cero modelos y el seed de QA falla por la FK a `E1`/`E2`. |
| `salida/` | Lo que genera el script. Ignorada por git (`.gitignore` de la raíz). |

## Estado real que se va a replicar (a 25-ago-2026)

- Producción tiene aplicados los bloques **00 → 51** (los bloques 50 y 51 se aplicaron la mañana del 25-ago; la verificación de `pg_proc` y la reejecución de P-11/P-12 están en la bitácora de pruebas). Staging se arma con exactamente los mismos **00 → 51**, así que al terminar la comparación del paso 6 **no debe mostrar diferencias**; si las muestra, gana producción y se anota.
- El cliente publicado en `main` (commits `4245076` y `0b0c913`) ya manda los ids de versión que exige el bloque 49 y entiende el `recibida:false` del bloque 51, así que el preview de staging (que se construye desde ese mismo código) es compatible con la base completa.
- Cuando exista el bloque **52**, staging es el primer lugar donde se pega (ver 7.6).

## Antes de empezar (10 minutos)

Necesita: acceso a la organización de Supabase donde vive producción, acceso al proyecto `satag` en Vercel, una app de autenticación TOTP en el teléfono (la misma que usa para producción sirve) y el gestor de contraseñas. Tiempo total estimado: 45 a 60 minutos, casi todo pegar y verificar.

Anote de **producción**, para copiar los mismos ajustes (no los valores, los ajustes):

- Settings → General: la **región** del proyecto.
- Settings → API: **Max rows** (en producción está en **5000** desde el 17-ago) y el estado de **Automatically expose new tables**.
- Authentication → Sign In / Providers → Email: **Allow new users to sign up** (en producción está en OFF).
- Authentication → Multi-Factor: TOTP habilitado.

## Paso 1. Crear el proyecto

1. Supabase → **New project**, en la **misma organización** que producción.
   - Nombre: `satag-staging` (que no se pueda confundir con `satag`).
   - Región: **la misma que producción**.
   - Contraseña de la base: genere una larga con el gestor y guárdela ahí. **Nunca en el repo ni en un `.md`.** No la va a necesitar para este guion (todo va por el SQL Editor), pero sin ella no hay acceso directo a Postgres después.
   - Plan: el Free sirve. Ojo: un proyecto Free se **pausa tras 7 días sin actividad**; se reanuda desde el dashboard sin perder datos, pero el preview de Vercel fallará mientras esté pausado.
2. Espere a que termine de aprovisionar (1 a 2 minutos).
3. Settings → **API** (o **API Keys** según la versión del dashboard). Copie al gestor de contraseñas, etiquetados como *staging*:
   - **Project URL** (`https://<ref>.supabase.co`).
   - **Publishable key** (`sb_publishable_...`). Es pública por diseño (viaja al navegador), pero identifica a staging: no la pegue en documentos ni en el repo.
4. Settings → API: ponga **Max rows = 5000** y deje **Automatically expose new tables** igual que en producción.

## Paso 2. Auth (antes de cualquier SQL)

Todo esto vive en el dashboard, no en SQL, y se pierde si nadie lo anota.

1. Authentication → Sign In / Providers → **Email**: habilitado. **Allow new users to sign up = OFF** (la app nunca llama a `signUp`; es defensa en profundidad, igual que producción).
2. Authentication → **Multi-Factor**: confirme que **TOTP** está habilitado. El panel `/admin` no funciona sin él: `components/admin/GateMfa.tsx` obliga a enrolar y verificar un factor, y la RLS de los bloques 27/30 exige `aal = 'aal2'` para leer cualquier tabla del padrón.
3. Authentication → **URL Configuration**: por ahora deje `Site URL = http://localhost:3000` y agregue a **Redirect URLs** `http://localhost:3000/admin/reset-password/`. La URL del preview se agrega en el paso 7, cuando exista.
4. **Correo.** El SMTP integrado de Supabase solo entrega a correos de los miembros del proyecto y con tope bajo. Con cuentas ficticias (abajo) **no se pueden probar** invitaciones ni recuperación de contraseña por correo; para eso use una cuenta con un correo real de un miembro del proyecto. No configure SMTP propio en staging.

## Paso 3. Cuentas del personal de prueba y PASO 0 (rol)

Sin correos reales de personas: cuentas ficticias con dominio reservado `example.com`. Una por rol, más una **sin rol** (sirve para probar que el panel niega el acceso).

| Correo (ficticio) | `app_metadata.rol` | Para qué |
|---|---|---|
| `satag.admin@example.com` | `admin` | Cobro, corte de caja, pestaña Administración. |
| `satag.ti@example.com` | `ti` | Instalar, actualizar, baja, buzón de notas. |
| `satag.consulta@example.com` | `consulta` | Solo lectura. |
| `satag.super@example.com` | `super` | Recorrido integral en una sola sesión. |
| `satag.sinrol@example.com` | *(ninguno)* | Debe ver "Sin rol asignado" y no leer nada. |

1. Authentication → Users → **Add user → Create new user**. Correo de la tabla, contraseña larga del gestor, **Auto Confirm User** marcado. Repita para las cinco.
2. SQL Editor → New query → pegue y ejecute (**esto es el PASO 0** del runbook de `../sql/README.md`; sin él, desde el bloque 27 la RLS deja fuera al personal):

```sql
update auth.users u
   set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
                           || jsonb_build_object('rol', v.rol)
  from (values
        ('satag.admin@example.com',    'admin'),
        ('satag.ti@example.com',       'ti'),
        ('satag.consulta@example.com', 'consulta'),
        ('satag.super@example.com',    'super')
       ) as v(email, rol)
 where u.email = v.email;

-- Debe devolver 5 filas: cuatro con rol y satag.sinrol con NULL.
select email, raw_app_meta_data ->> 'rol' as rol
  from auth.users
 order by email;
```

3. Nadie ha iniciado sesión todavía, así que no hace falta el "cerrar sesión y volver a entrar" del runbook: el primer JWT ya traerá el rol.
4. Cada cuenta enrola su factor TOTP la **primera vez** que entra al panel (el gate muestra el QR). Guarde el secreto de respaldo de cada una en el gestor, junto a su contraseña. Enrole solo las que vaya a usar.

## Paso 4. Generar las tandas y aplicarlas

### 4.1 Generar

Desde la raíz del repo, en PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File supabase\staging\armar-tandas.ps1
```

Deja en `supabase/staging/salida/` cuatro archivos `tanda-N.sql` y un `seed.sql`. El script falla si falta un número en la secuencia `00..51` o si un corte no corresponde a un bloque. Cada tanda empieza con un comentario que dice qué contiene y qué debe estar hecho antes de pegarla.

### 4.2 Los cortes y por qué

| Tanda | Bloques | Antes de pegarla | Por qué se corta aquí |
|---|---|---|---|
| 1 | `00` → `23` (+ `catalogos_base.sql` tras el 04) | Proyecto creado. | Esquema base, RLS ancha, alta pública, bucket `firmas` (bloque 20, crea el bucket por SQL), catálogos y textos legales v2. No depende de Auth ni del cliente. Termina donde empieza la capa del panel. |
| 2 | `24` → `30` | **PASO 0** hecho (paso 3 de este guion). | Desde el 27 la RLS exige `app_metadata.rol`; el runbook manda hacer el PASO 0 antes de 24-30. El corte permite verificar `auth.users` justo antes. |
| 3 | `31` → `45` | Primer inicio de sesión en el panel con una cuenta de prueba, leyendo el padrón vacío sin error. | Es el único punto donde se puede comprobar barato que el PASO 0 y el MFA quedaron bien; después vienen 21 bloques de RPCs encima. Los backfills que piden 35/37/41 no aplican: en base nueva no hay notas. |
| 4 | `46` → `51` | Preview de Vercel de la rama `staging` publicado con el código actual de `main`. | Estos bloques van **acoplados al cliente**: 46 cambia la firma de `registrar_pago` (panel viejo no cobra), 49 exige que el formulario mande los ids de versión, 51 exige que el buzón entienda `recibida:false`. Con el preview construido desde `main` de hoy, los tres se cumplen. |

Los cortes viven en `$Cortes = @(0, 24, 31, 46)` dentro del script; si mueve uno, actualice también `$PasoPrevio`.

### 4.3 Cómo pegar cada tanda

1. SQL Editor → **New query**. Abra `salida/tanda-N.sql` en un editor de texto, seleccione todo, pegue, **Run**.
2. Si termina sin error, corra las verificaciones de esa tanda (abajo) y pase a la siguiente.
3. Si falla: **no siga**. El mensaje dice en qué sentencia; búsquela en el archivo por el separador `-- >>> NN_nombre.sql` para saber en qué bloque. Casi todo es idempotente (`create table if not exists`, `drop ... if exists`, `create or replace`, `on conflict do nothing`), así que lo normal es corregir la causa y **volver a pegar la tanda completa**. Las dos excepciones con preflight (32: pagos duplicados; 42: `pagos.corte_id` con datos) pasan siempre en una base vacía.

### 4.4 Verificaciones después de cada tanda

**Tanda 1** (esquema base + catálogos + bucket):

```sql
select (select count(*) from estacionamientos) as estacionamientos,   -- 2
       (select count(*) from cat_marcas)       as marcas,             -- 24
       (select count(*) from cat_colores)      as colores,            -- 16
       (select count(*) from cat_modelos)      as modelos;            -- > 0 (compare con produccion)
select 'reglamento' as doc, version, vigente from reglamento_versiones
union all
select 'aviso', version, vigente from aviso_versiones
order by 1, 2;   -- v1 false, v2 true en ambos
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'firmas';  -- 1 fila, public = false
```

Y en el dashboard: Storage → debe aparecer el bucket `firmas` como privado.

**Tanda 2** (capa del panel): `select email, raw_app_meta_data ->> 'rol' from auth.users order by 1;` sigue devolviendo los roles, y existen `pagos`, `registro_estacionamientos`, `solicitudes` y las funciones `panel_exigir_rol`, `registrar_pago`, `crear_solicitud`.

**Antes de la tanda 3** (paso manual): levante el sitio contra staging (la forma más rápida es local, ver 7.5) o espere al preview, entre a `/admin/` con `satag.super@example.com`, enrole el TOTP, y confirme que el panel carga con padrón vacío y sin error rojo. Con `satag.sinrol@example.com` debe aparecer "Sin rol asignado".

**Tanda 3**: `select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';` debe subir a **19** (antes de la tanda 4). Y `select * from v_registros_incompletos;` devuelve cero filas sin error.

**Tanda 4**: la consulta de conteos del paso 6 completa.

## Paso 5. Banco de QA (seed) y la imagen de firma

### 5.1 Dónde va el seed y por qué ahí

`seed_tests_dev.sql` se corre **una sola vez, después de la tanda 4** (es decir, con los 52 bloques `00..51` aplicados). Razones, verificadas contra los archivos:

- El último bloque que **altera una tabla que el seed toca** es el **42** (`pagos.corte_id`, `cortes_caja` y sus cuatro triggers). El seed ya los conoce: desactiva por nombre `tg_pagos_no_borrar_sellado`, `tg_pagos_no_truncar_sellado`, `tg_pagos_congelar_sellado` y `tg_cortes_inmutables` solo durante su limpieza, y reinicia `cortes_caja_folio_seq`. Los bloques 43-51 solo agregan políticas, vistas, cuerpos de funciones, una columna en `aviso_versiones` (44) y la tabla `intentos_publicos` (51), que el seed no toca y no tiene FK a `registros`.
- Las constraints de `solicitudes` que los bloques 35/37/41 validan sobre datos existentes **las cumple el seed actual**: toda nota lleva `solicitante_rol` y `tramite_solicitado`; las de rol `padres` llevan alumno y grado; y ningún `tramite_solicitado` vale `'instalacion'` (solo `actualizacion` | `baja`). Por eso la recomendación del runbook de "re-aplicar el seed antes de 35/37/41" **no aplica** en un staging desde cero: esa nota existe para bases que ya traían notas viejas.
- El paso 1b del seed (`tag_apartado = true` + `tag_apartado_no`) cumple el CHECK `reg_tag_apartado_coherente` del bloque 33 y el índice único del número apartado.
- Las columnas `tipo_validado*` (bloque 46) y `cobrado_por_uid/email` (42) quedan en NULL: el seed inserta pagos directo, no por `registrar_pago`. Es el comportamiento documentado (el bloque 45 excluye "tipo sin validar" por esa razón).

No hay que correrlo más de una vez. Si algún día se vuelve a correr, vacía y vuelve a sembrar; no hace falta tocar Storage.

### 5.2 Correrlo

1. SQL Editor → New query → pegue `salida/seed.sql` entero → Run. La primera línea es una advertencia; déjela, es un comentario.
2. Resumen esperado:

```sql
select estado, count(*) from registros group by estado order by 1;
-- activo 37, baja 4, pendiente 20  (61 expedientes: 55 del banco + 221..226)
select (select count(*) from registros) as registros, (select count(*) from aceptaciones) as aceptaciones;  -- 61 y 60 (el 225 sin evidencia, a proposito)
select tramite_solicitado, count(*) from solicitudes where tipo = 'nota' group by 1;  -- actualizacion 7, baja 7
select m as motivo, count(*) from v_registros_incompletos, unnest(motivos) as m group by m order by 2 desc;  -- 7 motivos, uno por folio 221..226 (el 226 trae dos)
```

### 5.3 Subir la imagen de firma de prueba (a mano, una vez)

El seed siembra la **evidencia** (hash, versiones, sello), no la **imagen**: SQL no escribe bytes en Storage. Sin este paso el panel muestra la evidencia y avisa que no pudo abrir la imagen; con él, se ve el PNG.

Supabase → Storage → bucket `firmas` → **Upload file** → `supabase/qa-firma-demo.png` (está en el repo), **sin cambiarle el nombre**: la ruta sembrada es `firmas/qa-firma-demo.png`. Lleva "FIRMA DE PRUEBA" impreso sobre el trazo a propósito.

## Paso 6. Verificación final: la misma consulta en los dos proyectos

Corra **exactamente esta consulta** en el SQL Editor de staging y en el de producción y compare los renglones. Es de solo lectura.

```sql
select 'tablas en public' as objeto, count(*)::text as valor
  from pg_tables where schemaname = 'public'
union all select 'tablas con RLS activa', count(*)::text
  from pg_tables where schemaname = 'public' and rowsecurity
union all select 'vistas en public', count(*)::text
  from pg_views where schemaname = 'public'
union all select 'funciones en public', count(*)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
union all select 'politicas RLS en public', count(*)::text
  from pg_policies where schemaname = 'public'
union all select 'politicas RLS en storage.objects', count(*)::text
  from pg_policies where schemaname = 'storage' and tablename = 'objects'
union all select 'triggers de usuario en public', count(*)::text
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and not t.tgisinternal
union all select 'secuencias en public', count(*)::text
  from pg_sequences where schemaname = 'public'
union all select 'pgcrypto (schema)', coalesce((select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto'), 'NO EXISTE')
union all select 'bucket firmas (public?)', coalesce((select public::text from storage.buckets where id = 'firmas'), 'NO EXISTE')
union all select 'reglamento vigente (version)', (select version::text from reglamento_versiones where vigente)
union all select 'aviso vigente (version)', (select version::text from aviso_versiones where vigente)
union all select 'aviso vigente trae simplificado', (select (contenido_simplificado is not null)::text from aviso_versiones where vigente)
union all select 'estacionamientos', count(*)::text from estacionamientos
union all select 'cat_marcas', count(*)::text from cat_marcas
union all select 'cat_colores', count(*)::text from cat_colores
union all select 'cat_modelos', count(*)::text from cat_modelos
order by 1;
```

Lo que **sale de los archivos del repo** con `00..51` (simulando los `drop`/`create` en orden): 14 tablas, 2 vistas, 23 funciones, 21 políticas en `public` + 3 en `storage.objects`, 4 triggers, 3 secuencias, `pgcrypto` en `extensions`, bucket `firmas` con `public = false`, reglamento y aviso vigentes en versión 2, aviso con simplificado. **Producción es la referencia**, no esta lista: si producción difiere de estos números por algo hecho a mano, es producción la que manda y conviene anotarlo.

Con producción y staging en `00..51`, **no se espera ninguna diferencia** en esa tabla salvo `cat_modelos` (ver dudas al final).

Para ver **cuál** función difiere (y no solo cuántas), esta segunda consulta da una huella por función; compare línea a línea:

```sql
select p.proname as funcion,
       pg_get_function_identity_arguments(p.oid) as argumentos,
       md5(pg_get_functiondef(p.oid)) as huella
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
 order by 1, 2;
```

Y para las políticas por tabla:

```sql
select schemaname, tablename, policyname, cmd, roles
  from pg_policies
 where schemaname in ('public', 'storage')
 order by 1, 2, 3;
```

## Paso 7. Vercel: un preview conectado a staging sin tocar producción

Cómo lee el cliente la configuración (para que quede claro qué hay que apuntar a dónde): `lib/supabase/client.ts` (formulario público) y `lib/supabase/auth.ts` (panel) leen **solo dos variables** en tiempo de compilación, `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, y abortan si faltan. El sitio es export estático (`next.config.mjs`: `output: "export"`), así que los valores quedan **incrustados en el build**: cambiar una variable en Vercel exige **redeploy**. No hay `vercel.json`; Vercel usa la configuración del proyecto en su dashboard. Los workflows de `.github/workflows/` no intervienen: `deploy.yml` está inerte (`DEPLOY_GODADDY` no existe) y `verificacion.yml` compila con valores de relleno.

### 7.1 La rama `staging`

Una rama que **no lleva código propio**: es solo un puntero para que Vercel sepa qué construir contra staging. Se crea desde `main` y se avanza por *fast-forward*.

```powershell
git switch main
git pull
git switch -c staging
git push -u origin staging
```

Vercel construye un preview de cada rama que se empuja (Settings → Git: confirme que **Production Branch = `main`** y que no hay *Ignored Build Step*). La URL del preview de rama es estable: `https://satag-git-staging-<cuenta>.vercel.app` (Vercel la muestra en el deployment).

### 7.2 Variables de entorno por rama

Vercel → proyecto `satag` → Settings → **Environment Variables**:

1. Antes de agregar nada, revise las dos variables que ya existen (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`): anote a qué entornos aplican. Lo normal es *Production* (y quizá *Preview* para todas las ramas). **No las toque**: `main` sigue apuntando a producción con ellas.
2. **Add New** → Key `NEXT_PUBLIC_SUPABASE_URL`, Value = Project URL de staging. En *Environments* desmarque Production y Development, deje **solo Preview**, y en el selector de rama de Preview elija **`staging`** (no "todas las ramas"). Guarde.
3. Repita con `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = publishable key de staging, también Preview + rama `staging`.
4. Un valor asignado a una rama concreta **tiene prioridad** sobre el mismo nombre definido para todos los previews, así que el preview de `staging` toma los de staging y los demás previews siguen como estaban.
5. Deployments → el último de `staging` → **Redeploy** (sin caché de build). Confirme en el preview que el sitio carga y que el panel `/admin/` pide MFA a `satag.super@example.com`: si acepta una cuenta de producción, el preview sigue apuntando a producción.

Opcional pero cómodo: Settings → **Domains** → agregar `satag-staging.vercel.app` (si está libre) asignado a la rama `staging`; así la URL no depende del nombre de cuenta.

### 7.3 Auth de staging con esa URL

De vuelta en Supabase **staging** → Authentication → URL Configuration:

- **Site URL**: el origen del preview, sin ruta (`https://satag-git-staging-<cuenta>.vercel.app` o el dominio del punto anterior).
- **Redirect URLs**: `<origen>/admin/reset-password/`, `<origen>/admin/invite/` y los de `localhost` del paso 2. Con `/` final, porque `trailingSlash: true`.

### 7.4 Protección del preview

Los previews de Vercel pueden estar detrás de **Vercel Authentication** (Settings → Deployment Protection). Si está activa, solo quien tenga sesión en Vercel abre el preview; para dar acceso a alguien de la escuela hay que apagarla para previews o usar un *bypass* de automatización. Decisión de Gerardo (ver dudas al final).

### 7.5 Probar localmente contra staging sin tocar `.env.local`

Las variables del proceso ganan sobre `.env.local` en Next.js, así que basta con exportarlas en la misma sesión de PowerShell antes de levantar el sitio:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = '<Project URL de staging>'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = '<publishable key de staging>'
npm run dev
```

Al cerrar esa ventana, las variables desaparecen y `.env.local` (producción) vuelve a mandar.

### 7.6 Mantener staging al día

- **Código**: cada vez que `main` avance y quiera verlo contra staging: `git switch staging; git merge --ff-only main; git push` (y de regreso a `main`). Vercel redeploya el preview solo.
- **Esquema**: cuando se redacte el bloque `52`, se pega **suelto** en el SQL Editor de staging (no hace falta regenerar tandas), se prueba con el preview, y solo entonces se aplica en producción. La consulta del paso 6 dice si quedaron iguales.
- **Datos**: si el banco de QA se ensucia, vuelva a correr `salida/seed.sql`; deja todo como el primer día. El PNG de Storage no hay que volver a subirlo.
- `verificacion.yml` solo corre en `main` y en PRs hacia `main`; los pushes a `staging` no pasan por CI. Es aceptable mientras `staging` sea solo un espejo de `main`.

## Paso 8. Arnés de pruebas (pendiente, no se toca ahora)

El arnés de Playwright vive **fuera del repo** en `../SATAG - Evidencia de pruebas/arnes/` y hoy está atado a producción de dos formas: varios guiones (`panel.mjs`, `sesion.mjs`, `sondas-red.mjs`, `tanda-f-ti.mjs`, `tanda-p-pantalla.mjs`) traen `https://satag.vercel.app` escrito, y otros (`p11.mjs`, `tanda-p-anon.mjs`, `tanda-p-pantalla.mjs`) leen `NEXT_PUBLIC_SUPABASE_URL` y la publishable key del `.env.local` del repo. Solo `capturar.mjs` acepta `--base`.

**Pendiente anotado, sin tocar el arnés:** darle una forma de apuntar a otra URL y otra clave (por ejemplo variables `SATAG_BASE` y un archivo de entorno alternativo) para poder correr las tandas P y F contra staging. Mientras tanto, el arnés sigue corriendo contra producción, como hasta hoy.

## Qué NO hacer

- **Nunca** correr `seed_tests_dev.sql` (ni `salida/seed.sql`) ni `limpiar_datos_prueba.sql` en producción. El primero hace `truncate ... cascade` del padrón; el segundo lo vacía. El bloque 42 hace que el seed aborte si hay cortes de caja reales, pero eso es un fusible, no un permiso.
- **Nunca** copiar datos reales del padrón a staging (ni por `pg_dump`, ni por CSV, ni "solo unos cuantos para probar"). Son datos personales de la comunidad escolar y staging no tiene el mismo control de acceso ni el mismo aviso de privacidad. El banco de QA existe para eso.
- **No** pegar las tandas en producción. Allí los bloques se aplican uno por uno, como siempre.
- **No** compartir la publishable key ni la URL de staging en documentos, chats o capturas. Son públicas para el navegador, no para el archivo.
- **No** guardar la contraseña de la base ni los secretos TOTP en el repo ni en esta carpeta. Gestor de contraseñas.
- **No** usar correos reales de personas para las cuentas de prueba.
- **No** apuntar `main` a staging "un ratito". Si hace falta probar algo en `main`, se prueba en el preview de `staging` después de hacer `merge --ff-only`.

## Dudas que decide Gerardo

1. **`catalogos_base.sql`**: ¿se queda como archivo de staging o se promueve a bloque numerado `52_catalogos_base.sql` (idempotente, inofensivo en producción) para que el runbook de `../sql/` sea completo por sí solo? Hoy, quien instale solo con `sql/` obtiene catálogos vacíos.
2. **`cat_modelos`**: el conteo puede diferir entre staging y producción si en producción quedaron modelos del `seed.sql` monolítico que el bloque 21 no trae, o si alguien agregó desde el panel. La consulta del paso 6 lo muestra; decidir si importa.
3. **Deployment Protection** del preview (7.4): apagarla para previews facilita que Administración pruebe desde su navegador; dejarla encendida protege la URL. Elegir.
4. **Free vs Pro** para staging: Free se pausa a los 7 días sin uso. Si el preview va a estar disponible para pruebas de la escuela sin aviso, conviene Pro o acordarse de reanudarlo.
5. **Región y DPA** siguen pendientes de confirmar para producción (`../README.md`, abiertos); staging hereda la misma decisión.
