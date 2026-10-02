-- =====================================================================
-- BLOQUE 82 — La hora del corte: cuando ZK exporto el archivo.
--
-- SC-031. AGREGA: va ANTES de publicar el cliente que lo manda (o despues, es
-- inofensivo: el RPC ignora una clave que no conoce). Depende de: 78.
--
-- POR QUE
--   El dia en que se exporta la bitacora, la jornada sigue corriendo: quien estaba
--   dentro no es un coche «sin salida», es un coche que todavia no sale. Para
--   decirlo hace falta saber hasta donde sabe el archivo. La tabla guarda `hasta`
--   (el ultimo evento) e `importado_en` (cuando se subio a SATAG), pero no cuando ZK
--   lo exporto, que viene en el nombre: «Todos los Eventos_20261002092612» es el
--   2-oct-2026 a las 09:26:12.
--
--   Y las dos horas NO coinciden: ese archivo, exportado a las 09:26, termina a las
--   08:19. ZK recoge los pasos de los controladores con retraso, y la diferencia es
--   un dato de calidad del archivo que vale la pena conservar. El corte que usa la
--   pantalla es el ultimo evento; `exportado_en` es contexto y medida del retraso.
--
-- QUE CAMBIA
--   1. `zk_importaciones.exportado_en timestamp`, nullable: los exports viejos o con
--      el nombre cambiado no la traen, y no se inventa.
--   2. Las importaciones ya hechas se rellenan desde su propio nombre de archivo.
--   3. `cargar_eventos_zk` la toma del meta (clave `exportadoEn`). El cuerpo se
--      EXTRAJO del bloque 78 y se le aplicaron 2 deltas:
--      1. la columna nueva entra en el insert de la importacion
--      2. y su valor viene en el meta, con la misma forma que desde y hasta
--      Misma firma (jsonb, jsonb, text): create or replace y notify bastan.
--
-- QUE NO CAMBIA
--   Ningun evento, ninguna politica, ninguna otra columna. `hasta` sigue siendo el
--   ultimo evento y sigue siendo el corte.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. GUARDIA. Va primero: si aborta, no se aplico nada.
-- ---------------------------------------------------------------------
do $guardia$
declare
    v_n int;
begin
    if to_regclass('public.zk_importaciones') is null then
        raise exception 'No existe zk_importaciones: aplique antes el bloque 78. No se aplico nada.';
    end if;
    select count(*) into v_n from information_schema.columns
     where table_schema = 'public' and table_name = 'zk_importaciones' and column_name = 'exportado_en';
    if v_n <> 0 then
        raise exception 'zk_importaciones ya tiene exportado_en: este bloque ya se aplico. No se aplico nada.';
    end if;
    if to_regprocedure('cargar_eventos_zk(jsonb, jsonb, text)') is null then
        raise exception 'No existe cargar_eventos_zk(jsonb, jsonb, text): aplique antes el bloque 78. No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. LA COLUMNA
-- ---------------------------------------------------------------------
alter table zk_importaciones add column exportado_en timestamp;

comment on column zk_importaciones.exportado_en is
    'Cuando ZK exporto el archivo, leido de su nombre (Todos los Eventos_AAAAMMDDHHMMSS). NO es el corte: el corte es hasta (el ultimo evento). La diferencia es lo que ZK iba atrasado al recoger los pasos (bloque 82).';


-- ---------------------------------------------------------------------
-- 2. LAS IMPORTACIONES YA HECHAS, desde su propio nombre de archivo.
--    to_timestamp y el cast a timestamp usan la misma zona de sesion, asi que
--    la hora de pared se conserva sea cual sea esa zona.
-- ---------------------------------------------------------------------
update zk_importaciones
   set exportado_en = to_timestamp(substring(archivo from '_(\d{14})\.[A-Za-z0-9]+$'), 'YYYYMMDDHH24MISS')::timestamp
 where exportado_en is null
   and archivo ~ '_\d{14}\.[A-Za-z0-9]+$';


-- ---------------------------------------------------------------------
-- 3. EL RPC, extraido del bloque 78 con 2 deltas. Misma firma.
-- ---------------------------------------------------------------------
create or replace function cargar_eventos_zk(
    p_meta      jsonb,
    p_filas     jsonb,
    p_hecho_por text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $carga$
declare
    v_quien text;
    v_imp   uuid;
    v_sha   text;
    v_n     int;
    v_antes bigint;
begin
    perform panel_exigir_rol(array['ti']);

    if p_meta is null or jsonb_typeof(p_meta) <> 'object' then
        raise exception 'Falta la informacion del archivo. Vuelva a elegirlo y reintente.';
    end if;
    if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
        raise exception 'El lote de eventos no tiene el formato esperado.';
    end if;

    v_sha := lower(btrim(coalesce(p_meta ->> 'sha256', '')));
    if v_sha !~ '^[0-9a-f]{64}$' then
        raise exception 'El archivo no trae una huella valida. Vuelva a elegirlo y reintente.';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    -- Alta idempotente de la importacion: si el archivo ya se habia empezado a
    -- cargar, se reusa su renglon y las filas se cuelgan del mismo id.
    insert into zk_importaciones (
        archivo, sha256, filas_archivo, filas_con_tarjeta, tope_alcanzado,
        desde, hasta, hueco_dias, importado_por, exportado_en
    )
    values (
        coalesce(nullif(btrim(p_meta ->> 'archivo'), ''), 'sin nombre'),
        v_sha,
        coalesce((p_meta ->> 'filasArchivo')::int, 0),
        coalesce((p_meta ->> 'filasConTarjeta')::int, 0),
        coalesce((p_meta ->> 'topeAlcanzado')::boolean, false),
        nullif(p_meta ->> 'desde', '')::timestamp,
        nullif(p_meta ->> 'hasta', '')::timestamp,
        nullif(p_meta ->> 'huecoDias', '')::numeric,
        v_quien,
        nullif(p_meta ->> 'exportadoEn', '')::timestamp
    )
    on conflict (sha256) do nothing;

    select id into v_imp from zk_importaciones where sha256 = v_sha;

    select count(*) into v_antes from zk_eventos where importacion_id = v_imp;

    -- `on conflict do nothing` sobre la llave primaria es lo que hace que
    -- reimportar una ventana traslapada no duplique nada.
    insert into zk_eventos (
        id_evento, importacion_id, ocurrio_en, lote, sentido,
        tarjeta, concedido, repeticion, departamento_evento
    )
    select distinct on ((f ->> 'idEvento')::bigint)
           (f ->> 'idEvento')::bigint,
           v_imp,
           (f ->> 'ocurrioEn')::timestamp,
           f ->> 'lote',
           f ->> 'sentido',
           f ->> 'tarjeta',
           coalesce((f ->> 'concedido')::boolean, false),
           coalesce((f ->> 'repeticion')::boolean, false),
           nullif(btrim(coalesce(f ->> 'departamentoEvento', '')), '')
      from jsonb_array_elements(p_filas) f
     where coalesce(f ->> 'idEvento', '') ~ '^[0-9]+$'
       and coalesce(f ->> 'tarjeta', '')  ~ '^[0-9]+$'
       and coalesce(f ->> 'lote', '')     ~ '^E[0-9]+$'
       and coalesce(f ->> 'sentido', '')  in ('entrada','salida')
    on conflict (id_evento) do nothing;

    get diagnostics v_n = row_count;

    return jsonb_build_object(
        'importacionId', v_imp,
        'insertados',    v_n,
        'yaEstaban',     jsonb_array_length(p_filas) - v_n,
        'enLaVentana',   v_antes + v_n
    );
end;
$carga$;

revoke all    on function cargar_eventos_zk(jsonb, jsonb, text) from public;
grant  execute on function cargar_eventos_zk(jsonb, jsonb, text) to authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- 4. VERIFICACION (solo lectura). ok en true en las cuatro filas.
-- ---------------------------------------------------------------------
select 1 as orden, 'la columna existe' as que, null::text as valor,
       (select count(*) = 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'zk_importaciones' and column_name = 'exportado_en') as ok
union all
select 2, 'el RPC toma exportadoEn del meta', null,
       (select pg_get_functiondef('cargar_eventos_zk(jsonb, jsonb, text)'::regprocedure) like '%exportadoEn%')
union all
select 3, 'toda importacion con fecha en el nombre ya la tiene',
       (select count(*)::text from zk_importaciones where exportado_en is not null),
       (select count(*) = 0 from zk_importaciones
         where exportado_en is null and archivo ~ '_\d{14}\.[A-Za-z0-9]+$')
union all
select 4, 'retraso de ZK al exportar, en minutos, por importacion (informativo)',
       (select coalesce(string_agg(round(extract(epoch from (exportado_en - hasta)) / 60)::text, ', ' order by importado_en), 'sin importaciones')
          from zk_importaciones where exportado_en is not null and hasta is not null),
       true
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). Precondicion verificable: la columna existe.
--
--   alter table zk_importaciones drop column exportado_en;
--   -- y volver a crear el RPC con la seccion 3 del bloque 78 (misma firma),
--   -- seguida de su revoke/grant y de notify pgrst, 'reload schema'.
-- ---------------------------------------------------------------------
