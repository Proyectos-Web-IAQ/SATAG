-- FASE 2 · pg_stat_statements: cuanto tiempo de Postgres cuesta CADA consulta
-- real (las que manda PostgREST, con el texto exacto). Es la medida mas directa
-- del costo por peticion del lado de la base: mean_exec_time.
--
-- USO (el editor solo muestra el ultimo resultado: pegar UN bloque a la vez):
--   (a) ANTES de una corrida de k6: ejecutar SOLO el bloque A (reset).
--       Hecho el 28-ago-2026 18:09:33 UTC.
--   (b) DESPUES de la corrida: ejecutar SOLO el bloque B y pegar la salida en
--       CAPACIDAD.md (Fase 2, tabla de costo).
--
-- Lo que significa cada columna:
--   calls            veces que corrio (debe parecerse al http_reqs de k6)
--   mean_ms          tiempo medio DENTRO de Postgres por ejecucion. Para
--                    consultas que caben en memoria (todo SATAG cabe) es
--                    esencialmente CPU de Postgres. NO incluye PostgREST ni red.
--   total_s          tiempo total; util para ver que se llevo la CPU.
--   rows_por_call    filas devueltas por ejecucion (el padron completo se ve aqui)
--   shared_hit_pct   % de bloques servidos desde memoria (100 = no toco disco)

-- ===== A) reset (antes de la corrida) =====
select pg_stat_statements_reset();

-- ===== B) lectura (despues de la corrida) =====
select
    round(mean_exec_time::numeric, 2)                        as mean_ms,
    round((max_exec_time)::numeric, 1)                       as max_ms,
    calls,
    round((total_exec_time / 1000)::numeric, 2)              as total_s,
    round((rows::numeric / greatest(calls, 1)), 1)           as rows_por_call,
    round(100.0 * shared_blks_hit / greatest(shared_blks_hit + shared_blks_read, 1), 1) as shared_hit_pct,
    left(regexp_replace(query, '\s+', ' ', 'g'), 160)        as consulta
from pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
  and query not ilike '%pg_stat_statements%'
  and query not ilike '%pg_stat_activity%'
  and (query ilike '%"public"%' or query ilike '%crear_%' or query ilike '%registrar_%' or query ilike '%from registros%' or query ilike '%cat_%' or query ilike '%_versiones%')
order by total_exec_time desc
limit 40;
