-- FASE 2 · Paso 0: estado del proyecto ANTES de medir. Solo lectura.
--
-- El SQL Editor de Supabase muestra SOLO el resultado del ultimo statement,
-- asi que todo va en UNA consulta: una fila por dato. Pegar entero, ejecutar,
-- y copiar la tabla (boton "Export" o seleccionar todo) a CAPACIDAD.md.

with
parametros as (
    select 1 as orden, 'parametro' as seccion, 'version' as dato, version() as valor
    union all select 2, 'parametro', 'max_connections', current_setting('max_connections')
    union all select 3, 'parametro', 'shared_buffers', current_setting('shared_buffers')
    union all select 4, 'parametro', 'work_mem', current_setting('work_mem')
    union all select 5, 'parametro', 'effective_cache_size', current_setting('effective_cache_size')
    union all select 6, 'parametro', 'log_min_duration_statement', current_setting('log_min_duration_statement')
    union all select 7, 'parametro', 'statement_timeout (esta sesion)', current_setting('statement_timeout')
    union all select 8, 'parametro', 'statement_timeout rol anon', coalesce((select rolconfig::text from pg_roles where rolname = 'anon'), '(sin override)')
    union all select 9, 'parametro', 'statement_timeout rol authenticated', coalesce((select rolconfig::text from pg_roles where rolname = 'authenticated'), '(sin override)')
    union all select 10, 'parametro', 'pg_stat_statements instalado', (select count(*)::text from pg_extension where extname = 'pg_stat_statements')
    union all select 11, 'parametro', 'pg_stat_statements.track', coalesce(current_setting('pg_stat_statements.track', true), 'n/a')
),
conexiones as (
    select 20 + row_number() over (order by count(*) desc) as orden,
           'conexiones en reposo' as seccion,
           coalesce(usename, '(sistema)') || ' / ' || coalesce(state, '(sin estado)') as dato,
           count(*)::text as valor
      from pg_stat_activity
     group by usename, state
),
conexiones_total as (
    select 19 as orden, 'conexiones en reposo' as seccion, 'TOTAL (todas las bases)' as dato, count(*)::text as valor from pg_stat_activity
),
tablas as (
    select 40 + row_number() over (order by n_live_tup desc) as orden,
           'tabla' as seccion,
           relname as dato,
           n_live_tup::text || ' filas · ' || pg_size_pretty(pg_total_relation_size(relid)) as valor
      from pg_stat_user_tables
     where schemaname = 'public'
),
base as (
    select 39 as orden, 'tabla' as seccion, 'TAMANO DE LA BASE' as dato, pg_size_pretty(pg_database_size(current_database())) as valor
),
padron as (
    select 60 + row_number() over (order by count(*) desc) as orden, 'padron por estado' as seccion, estado as dato, count(*)::text as valor
      from registros group by estado
),
documentos as (
    select 70 as orden, 'documento' as seccion, 'reglamento vigente v' || version::text as dato, length(contenido)::text || ' caracteres' as valor from reglamento_versiones where vigente
    union all
    select 71, 'documento', 'aviso vigente v' || version::text, length(contenido)::text || ' caracteres (simplificado: ' || coalesce(length(contenido_simplificado), 0)::text || ')' from aviso_versiones where vigente
),
indices as (
    select 80 + row_number() over (order by indexname) as orden, 'indice registros' as seccion, indexname as dato, indexdef as valor
      from pg_indexes where schemaname = 'public' and tablename = 'registros'
)
select orden, seccion, dato, valor from parametros
union all select * from conexiones_total
union all select * from conexiones
union all select * from base
union all select * from tablas
union all select * from padron
union all select * from documentos
union all select * from indices
order by orden;
