-- =====================================================================
-- BLOQUE 107 — La calle en SATAG: las muestras de Google Routes del
-- experimento de vialidad.
--
-- 06/11/2026
--
-- POR QUE
--   Gerardo, 6-nov: «lo quiero directamente ahí». Vialidad en SATAG ya mide
--   la puerta (zk_eventos, bloque 78); la calle vive en archivos del
--   muestreador de Análisis Vial (trayectos-AAAA-MM-DD.csv), fuera de la
--   base. Sin ella, la pantalla «Cuánto es nuestro» y la columna de la calle
--   están vacías. Este bloque guarda las muestras para que TI las cargue
--   cada semana desde Datos, igual que los exports de ZK.
--
-- QUE GUARDA Y QUE NO
--   - vial_rutas: el catálogo de rutas (id del muestreador, nombre, tipo).
--   - vial_muestras: por ruta, día y ranura de 5 min, cuánto tardó con
--     tráfico y cuánto sin tráfico. El índice (uno entre otro) se calcula
--     al leer. La llave es la misma del muestreador (ruta, fecha, ranura):
--     recargar un archivo no duplica nada.
--   - NO guarda la polilínea ni la velocidad por tramo, ni las muestras con
--     error, ni la ruta personal de Gerardo (el cliente no la manda y el CHECK
--     de tipo no la admite).
--   - Hora de pared de Querétaro, como zk_eventos.
--
-- QUIEN
--   Leen ti, contador y super con MFA (la misma regla que zk_eventos).
--   Escribe solo el RPC, con panel_exigir_rol(array['ti']).
--
-- ORDEN: solo AGREGA. Va ANTES del deploy del cliente que lo llama. El cliente
-- publicado no lo usa.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. GUARDIA
-- ---------------------------------------------------------------------
do $guardia$
begin
    if to_regclass('public.vial_muestras') is not null or to_regclass('public.vial_rutas') is not null then
        raise exception 'El bloque 107 ya esta aplicado (existen las tablas de la calle). No se aplico nada.';
    end if;
    if exists (select 1 from pg_proc where proname = 'cargar_muestras_vial') then
        raise exception 'Ya existe cargar_muestras_vial. No se aplico nada: revise que bloque la creo.';
    end if;
    if not exists (select 1 from pg_proc where proname = 'panel_exigir_rol') then
        raise exception 'Falta panel_exigir_rol (bloque 29). No se aplico nada.';
    end if;
    if to_regclass('public.zk_eventos') is null then
        raise exception 'Falta zk_eventos (bloque 78). No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------
create table vial_rutas (
    id      text primary key check (id ~ '^[a-z0-9_]{3,80}$'),
    nombre  text not null check (btrim(nombre) <> ''),
    tipo    text not null check (tipo in ('pluma', 'paso', 'salida', 'control', 'testigo', 'circuito'))
);
comment on table vial_rutas is
    'Rutas del muestreador de Analisis Vial (scripts/config/corredores.json). pluma = llegada al plantel; control/testigo = la misma avenida a 3.5 km (bloque 107).';

create table vial_muestras (
    ruta_id     text not null references vial_rutas (id),
    fecha       date not null,
    ranura      text not null check (ranura ~ '^[0-2][0-9]:[0-5][0-9]$'),
    duracion_s  int  not null check (duracion_s > 0),
    libre_s     int  not null check (libre_s > 0),
    cargado_por text,
    cargado_en  timestamptz not null default now(),
    primary key (ruta_id, fecha, ranura)
);
create index ix_vial_muestras_fecha on vial_muestras (fecha);
comment on table vial_muestras is
    'Google Routes cada 5 o 10 min: segundos con trafico (duracion_s) y sin trafico (libre_s). Indice = duracion_s / libre_s (bloque 107).';


-- ---------------------------------------------------------------------
-- 2. RLS: lectura para quien mide; escritura solo por el RPC
-- ---------------------------------------------------------------------
alter table vial_rutas    enable row level security;
alter table vial_muestras enable row level security;

create policy vial_rutas_lectura_panel on vial_rutas
    for select to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2'
           and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'contador', 'super'));
create policy vial_muestras_lectura_panel on vial_muestras
    for select to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2'
           and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'contador', 'super'));

revoke all on vial_rutas, vial_muestras from anon, public;
revoke insert, update, delete, truncate, references, trigger on vial_rutas, vial_muestras from authenticated;
grant select on vial_rutas, vial_muestras to authenticated;


-- ---------------------------------------------------------------------
-- 3. cargar_muestras_vial (NUEVO)
--    p_rutas: [{id, nombre, tipo}] — se dan de alta o se actualizan.
--    p_filas: [{rutaId, fecha, ranura, duracionS, libreS}] — por lotes.
--    Idempotente: lo que ya estaba no se toca.
-- ---------------------------------------------------------------------
create function cargar_muestras_vial(
    p_rutas     jsonb,
    p_filas     jsonb,
    p_hecho_por text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $vial$
declare
    v_quien text;
    v_n     int;
    v_desc  int;
begin
    perform panel_exigir_rol(array['ti']);
    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    if p_rutas is null or jsonb_typeof(p_rutas) <> 'array' or p_filas is null or jsonb_typeof(p_filas) <> 'array' then
        raise exception 'El archivo de la calle no trae el formato esperado. Vuelva a elegirlo.';
    end if;

    insert into vial_rutas (id, nombre, tipo)
    select r ->> 'id', btrim(r ->> 'nombre'), r ->> 'tipo'
      from jsonb_array_elements(p_rutas) r
     where coalesce(r ->> 'id', '') ~ '^[a-z0-9_]{3,80}$'
       and coalesce(btrim(r ->> 'nombre'), '') <> ''
       and coalesce(r ->> 'tipo', '') in ('pluma', 'paso', 'salida', 'control', 'testigo', 'circuito')
    on conflict (id) do update set nombre = excluded.nombre, tipo = excluded.tipo;

    -- Filas de rutas que no estan en el catalogo: se cuentan y no entran.
    select count(*) into v_desc
      from jsonb_array_elements(p_filas) f
     where not exists (select 1 from vial_rutas r where r.id = f ->> 'rutaId');

    insert into vial_muestras (ruta_id, fecha, ranura, duracion_s, libre_s, cargado_por)
    select distinct on (f ->> 'rutaId', f ->> 'fecha', f ->> 'ranura')
           f ->> 'rutaId', (f ->> 'fecha')::date, f ->> 'ranura',
           (f ->> 'duracionS')::int, (f ->> 'libreS')::int, v_quien
      from jsonb_array_elements(p_filas) f
      join vial_rutas r on r.id = f ->> 'rutaId'
     where coalesce(f ->> 'fecha', '') ~ '^\d{4}-\d{2}-\d{2}$'
       and coalesce(f ->> 'ranura', '') ~ '^[0-2][0-9]:[0-5][0-9]$'
       and coalesce(f ->> 'duracionS', '') ~ '^[0-9]+$' and (f ->> 'duracionS')::int > 0
       and coalesce(f ->> 'libreS', '') ~ '^[0-9]+$' and (f ->> 'libreS')::int > 0
    on conflict (ruta_id, fecha, ranura) do nothing;
    get diagnostics v_n = row_count;

    return jsonb_build_object('insertadas', v_n, 'yaEstaban', jsonb_array_length(p_filas) - v_n - v_desc, 'rutasDesconocidas', v_desc);
end;
$vial$;
revoke all     on function cargar_muestras_vial(jsonb, jsonb, text) from public, anon;
grant  execute on function cargar_muestras_vial(jsonb, jsonb, text) to authenticated;

notify pgrst, 'reload schema';

commit;


-- ---------------------------------------------------------------------
-- 4. VERIFICACION (solo lectura). Seis filas con ok = true.
-- ---------------------------------------------------------------------
select 1 as orden, 'existen las dos tablas, con RLS' as que,
       to_regclass('public.vial_rutas') is not null and to_regclass('public.vial_muestras') is not null
       and (select bool_and(relrowsecurity) from pg_class where relname in ('vial_rutas', 'vial_muestras')) as ok
union all
select 2, 'la llave de las muestras es (ruta, fecha, ranura): recargar no duplica',
       (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.vial_muestras'::regclass and contype = 'p')
       = 'PRIMARY KEY (ruta_id, fecha, ranura)'
union all
select 3, 'leen ti, contador y super con MFA; nadie mas',
       (select count(*) = 2 from pg_policies where tablename in ('vial_rutas', 'vial_muestras') and cmd = 'SELECT'
         and qual like '%aal2%' and qual like '%contador%')
       and not has_table_privilege('anon', 'public.vial_muestras', 'SELECT')
union all
select 4, 'el panel no escribe directo en las tablas',
       not has_table_privilege('authenticated', 'public.vial_muestras', 'INSERT')
       and not has_table_privilege('authenticated', 'public.vial_rutas', 'INSERT')
       and not has_table_privilege('authenticated', 'public.vial_muestras', 'DELETE')
union all
select 5, 'cargar_muestras_vial: una sola forma, security definer, anon no la ejecuta',
       (select count(*) = 1 from pg_proc where proname = 'cargar_muestras_vial')
       and (select prosecdef from pg_proc where proname = 'cargar_muestras_vial')
       and not has_function_privilege('anon', 'cargar_muestras_vial(jsonb, jsonb, text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'cargar_muestras_vial(jsonb, jsonb, text)', 'EXECUTE')
union all
select 6, 'ningun mensaje tutea',
       (select prosrc !~* '\m(tu|tus|elige|escribe|reintenta|verifica)\M' from pg_proc where proname = 'cargar_muestras_vial')
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). Borra la calle cargada: se vuelve a cargar con los
-- mismos archivos del muestreador.
--
--   begin;
--   drop function if exists cargar_muestras_vial(jsonb, jsonb, text);
--   drop table if exists vial_muestras;
--   drop table if exists vial_rutas;
--   notify pgrst, 'reload schema';
--   commit;
-- ---------------------------------------------------------------------
