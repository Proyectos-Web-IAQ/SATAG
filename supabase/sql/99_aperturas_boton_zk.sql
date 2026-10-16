-- =====================================================================
-- BLOQUE 99 — Las aperturas con el boton que registra ZK.
--
-- SC-032 · 15/10/2026
--
-- POR QUE
--   Gerardo, 15-oct: «lo de la apertura con boton en ZK si se registran, llega
--   en el reporte de todos los eventos». Es cierto: «Todos los Eventos» trae
--   «Apertura con boton de salida», con hora y puerta, y sin tarjeta (no sabe a
--   quien). Del 24-sep al 5-oct fueron 439, unas 45 por dia habil, con picos a
--   las 9 y a las 18 h. El bloque 78 las descartaba junto con el ruido del
--   controlador porque no traen tarjeta.
--
--   ZK sabe CUANDO y POR DONDE se abrio con el boton; el reporte de la caseta
--   (bloque 97) sabe A QUIEN y POR QUE. Guardando las de ZK, Sistemas cruza las
--   dos cosas y ve cuantas aperturas con boton no se reportaron.
--
-- QUE HACE, EN ORDEN
--   0. Guardia: el 97 aplicado (caseta_reportes) y el 99 no.
--   1. `zk_aperturas_boton`: una fila por apertura con boton, con su ID de
--      evento de ZK como llave (reimportar una ventana traslapada no duplica).
--      RLS: leen ti, contador, admin y super con MFA (como la bitacora y la
--      caseta). Sin escritura directa.
--   2. RPC `cargar_aperturas_boton_zk(filas, hecho_por)`: los mismos que cargan
--      la bitacora (ti; super pasa siempre). Lo llama el cliente al guardar
--      «Todos los Eventos», despues de cargar_eventos_zk.
--   3. Verificacion de solo lectura: filas con ok = true.
--
-- QUE NO HACE
--   - No toca cargar_eventos_zk ni zk_eventos: las aperturas con boton van en
--     su propia tabla porque no tienen tarjeta (zk_eventos la exige).
--   - Las ventanas ya guardadas no traen sus aperturas: se recuperan volviendo
--     a subir esos archivos (lo ya guardado no se duplica).
--
-- Este bloque solo AGREGA: va ANTES del deploy del cliente que lo usa.
-- =====================================================================

begin;

do $guardia$
begin
    if to_regclass('public.zk_aperturas_boton') is not null then
        raise exception 'El bloque 99 ya esta aplicado (existe zk_aperturas_boton). No se aplico nada.';
    end if;
    if to_regclass('public.caseta_reportes') is null or to_regclass('public.zk_eventos') is null then
        raise exception 'Faltan el bloque 97 (caseta_reportes) o el 78 (zk_eventos). No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. LA TABLA
-- ---------------------------------------------------------------------
create table zk_aperturas_boton (
    id_evento   bigint primary key,
    -- Hora de PARED del controlador, sin zona (igual que zk_eventos.ocurrio_en).
    ocurrio_en  timestamp not null,
    lote        text not null,
    sentido     text not null,
    cargado_por text not null,
    cargado_en  timestamptz not null default now(),
    constraint zkab_lote    check (lote ~ '^E[0-9]+$'),
    constraint zkab_sentido check (sentido in ('entrada', 'salida'))
);
create index ix_zk_aperturas_boton_en on zk_aperturas_boton (ocurrio_en);

comment on table zk_aperturas_boton is 'Bloque 99. «Apertura con boton de salida» de ZK: cuando y por que puerta, sin persona. Se cruza con caseta_reportes (quien y por que).';

alter table zk_aperturas_boton enable row level security;
create policy zk_aperturas_boton_lectura on zk_aperturas_boton for select to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2'
           and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'contador', 'admin', 'super'));
revoke all on table zk_aperturas_boton from anon, public;
revoke insert, update, delete, truncate, references, trigger on table zk_aperturas_boton from authenticated;
grant  select on table zk_aperturas_boton to authenticated;


-- ---------------------------------------------------------------------
-- 2. LA CARGA
-- ---------------------------------------------------------------------
-- p_filas: [{idEvento, ocurrioEn, lote, sentido}]. Lo que ya estaba no se toca.
create function cargar_aperturas_boton_zk(p_filas jsonb, p_hecho_por text default null) returns jsonb
language plpgsql
security definer
set search_path = public
as $cargar$
declare
    v_quien      text;
    v_total      int;
    v_insertadas int;
begin
    perform panel_exigir_rol(array['ti']);
    if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
        raise exception 'Las aperturas con botón no tienen el formato esperado.';
    end if;
    v_total := jsonb_array_length(p_filas);
    if v_total > 20000 then
        raise exception 'Son demasiadas aperturas a la vez: mande menos de 20,000.';
    end if;
    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    with nuevas as (
        insert into zk_aperturas_boton (id_evento, ocurrio_en, lote, sentido, cargado_por)
        select (f ->> 'idEvento')::bigint, (f ->> 'ocurrioEn')::timestamp, f ->> 'lote', f ->> 'sentido', v_quien
          from jsonb_array_elements(p_filas) f
         where (f ->> 'idEvento') ~ '^[0-9]+$'
           and (f ->> 'lote') ~ '^E[0-9]+$'
           and (f ->> 'sentido') in ('entrada', 'salida')
        on conflict (id_evento) do nothing
        returning 1
    )
    select count(*) into v_insertadas from nuevas;

    return jsonb_build_object('insertadas', v_insertadas, 'yaEstaban', v_total - v_insertadas);
end;
$cargar$;

revoke all on function cargar_aperturas_boton_zk(jsonb, text) from public, anon;
grant execute on function cargar_aperturas_boton_zk(jsonb, text) to authenticated;

notify pgrst, 'reload schema';

commit;


-- ---------------------------------------------------------------------
-- 3. VERIFICACION (solo lectura): todas las filas con ok = true
-- ---------------------------------------------------------------------
select 1 as orden, 'zk_aperturas_boton existe con RLS' as que,
       (select relrowsecurity from pg_class where oid = 'public.zk_aperturas_boton'::regclass) as ok
union all
select 2, 'anon no lee y authenticated no escribe la tabla',
       not has_table_privilege('anon', 'public.zk_aperturas_boton', 'select')
       and not has_table_privilege('authenticated', 'public.zk_aperturas_boton', 'insert')
union all
select 3, 'una sola cargar_aperturas_boton_zk, security definer',
       (select count(*) from pg_proc where proname = 'cargar_aperturas_boton_zk') = 1
       and (select prosecdef from pg_proc where proname = 'cargar_aperturas_boton_zk')
union all
select 4, 'anon no la ejecuta; authenticated si (la guardia decide el rol)',
       not has_function_privilege('anon', 'public.cargar_aperturas_boton_zk(jsonb, text)', 'execute')
       and has_function_privilege('authenticated', 'public.cargar_aperturas_boton_zk(jsonb, text)', 'execute')
union all
select 5, 'ningun mensaje tutea',
       (select prosrc !~* '\m(tu|tus|elige|escribe|vuelve|mande tu)\M' from pg_proc where proname = 'cargar_aperturas_boton_zk')
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado)
-- ---------------------------------------------------------------------
--   begin;
--   drop function if exists cargar_aperturas_boton_zk(jsonb, text);
--   drop table if exists zk_aperturas_boton;
--   commit;
--   notify pgrst, 'reload schema';
