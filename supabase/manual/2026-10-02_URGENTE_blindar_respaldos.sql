-- =====================================================================
-- URGENTE — blinda las tablas de respaldo que quedaron abiertas a la API.
--
-- Corra ESTO en el SQL Editor de produccion, completo, de un tiron.
-- No borra ni cambia datos: solo quita permisos y prende la RLS.
--
-- POR QUE. En produccion, toda tabla nueva en `public` nace con
-- `GRANT ALL ... TO anon, authenticated` (privilegios por omision del
-- proyecto: migrations/20260929120000_esquema_produccion.sql:3667-3668) y
-- PostgREST la publica sola («Automatically expose new tables» esta
-- encendido, supabase/README.md). Una tabla hecha con `create table ... as`
-- nace ademas SIN RLS. Resultado: los respaldos que dejan los bloques de
-- datos de Campo/datos —por ejemplo `_respaldo_reposiciones_02oct`, con
-- placas, observaciones y TAGs— quedan legibles, y hasta borrables, con la
-- llave publicable que va dentro del sitio publico.
--
-- QUE HACE. A cada tabla de `public` cuyo nombre empiece con `_respaldo`:
--   1. le prende la RLS (sin politicas: nadie de la API ve una fila);
--   2. le revoca todo a anon, authenticated y public (segunda barrera).
-- postgres y service_role conservan acceso, asi que el ROLLBACK comentado
-- de cada bloque de datos sigue funcionando desde el SQL Editor.
--
-- ES IDEMPOTENTE Y GENERICO. Corralo ahora, y otra vez justo despues de
-- cualquier bloque de datos que deje un respaldo (el de plumas por
-- departamento crea `_respaldo_plumas_depto_02oct`). Si no hay ningun
-- respaldo, no hace nada y lo dice.
--
-- QUE NO PUEDE DECIR. Si alguien ya leyo esos respaldos antes de hoy. Eso
-- esta en los logs de la API: Supabase -> Logs -> API, buscar
-- `/rest/v1/_respaldo`. Si hay lecturas que no son suyas, es un incidente
-- de datos personales (LFPDPPP) y se avisa a Direccion.
--
-- SIN ROLLBACK, A PROPOSITO: deshacerlo es volver a exponer los datos.
-- Para quitar un respaldo cuando ya no sirva: `drop table public.<nombre>;`
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. EL CAMBIO
-- ---------------------------------------------------------------------
do $blindar$
declare
    t record;
begin
    for t in
        select c.oid::regclass as tabla
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relkind in ('r', 'p')
           and left(c.relname, 9) = '_respaldo'
    loop
        execute format('alter table %s enable row level security', t.tabla);
        execute format('revoke all on table %s from anon, authenticated, public', t.tabla);
        raise notice 'Blindada: %', t.tabla;
    end loop;
end;
$blindar$;

-- Que PostgREST deje de anunciarlas de inmediato.
notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- 2. VERIFICACION (solo lectura). Todas las filas deben salir ok = true.
--    Incluye zk_eventos y zk_importaciones (bloque 78): esas no son
--    respaldos y aqui NO se tocan; solo se comprueba que su RLS este
--    prendida, que es lo que hoy las protege de anon.
-- ---------------------------------------------------------------------
with objetivo as (
    select c.oid, c.relname, c.relrowsecurity,
           left(c.relname, 9) = '_respaldo' as es_respaldo
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and (left(c.relname, 9) = '_respaldo' or c.relname in ('zk_eventos', 'zk_importaciones'))
), fila as (
    select relname as tabla,
           es_respaldo,
           relrowsecurity as rls,
           has_table_privilege('anon', oid, 'SELECT') as anon_lee,
           has_table_privilege('anon', oid, 'DELETE') as anon_borra,
           has_table_privilege('authenticated', oid, 'SELECT') as panel_lee
      from objetivo
)
select 0 as orden,
       'tablas _respaldo en public' as tabla,
       (select count(*) from fila where es_respaldo)::text
         || case when (select count(*) from fila where es_respaldo) = 0
                 then ' (no hay ninguna: nada que blindar)' else '' end as detalle,
       not exists (select 1 from fila where es_respaldo and (not rls or anon_lee or anon_borra or panel_lee)) as ok
union all
select 1,
       tabla,
       case when es_respaldo
            then 'respaldo · rls ' || rls || ' · anon lee ' || anon_lee || ' · anon borra ' || anon_borra
                 || ' · panel lee ' || panel_lee
            else 'no se toca · rls ' || rls || ' (las politicas son solo del panel)' end,
       case when es_respaldo then rls and not anon_lee and not anon_borra and not panel_lee
            else rls end
  from fila
order by orden, ok, tabla;
