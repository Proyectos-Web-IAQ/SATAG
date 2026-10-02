-- =====================================================================
-- 83_padron_zk.sql — El padron de personas de ZK se guarda en SATAG
-- SC-031 · 02/10/2026
--
-- POR QUE. La pestana Estacionamiento resuelve de quien es cada tarjeta contra
-- `registros`; cuando el expediente no dice el grupo (los que ZK tenia en
-- «General») o cuando hace falta el departamento fino —PRIMARIA DOCENTE,
-- SECUNDARIA, MANTENIMIENTO—, consulta el export «Personas» de ZK. Hasta hoy ese
-- export vivia solo en el navegador de quien lo subia: al cambiar de pestana se
-- perdia y nadie mas lo veia. Aqui se guarda, como ya se guarda la bitacora (78).
--
-- QUE SE GUARDA, Y QUE NO. Por tarjeta: nombre, id y nombre de departamento, y si
-- sigue vigente en ZK. NO se guardan placa, correo ni telefono: la placa ya vive
-- en `registros` y lo demas nadie lo mira. El nombre si: es lo que permite, a
-- quien opera el padron, saber de quien es una credencial que abrio la pluma y
-- no tiene expediente. Lo leen los mismos roles que leen `registros` y la
-- bitacora (ti, contador, super, con MFA), y lo escribe solo TI por el RPC. El
-- aviso de privacidad v8 cubre el uso: operar el control de acceso vehicular y
-- la trazabilidad, con comunicacion limitada al personal autorizado.
--
-- SIN GASTAR DE MAS. Un export son ~2,900 personas y cambia poco de una semana a
-- otra: el RPC solo escribe las filas que CAMBIAN (nombre o departamento) o que
-- son nuevas, marca como no vigentes las que ya no vienen, y si el mismo archivo
-- se vuelve a subir no toca nada (su sha256 ya esta). Una carga son una
-- peticion y unas decenas de filas escritas, no 2,900.
--
-- QUE HACE, en orden:
--   0. Guardia: existen panel_exigir_rol (29/49) y zk_eventos (78).
--   1. Tablas `zk_padron_cargas` (una fila por archivo) y `zk_padron` (una por
--      tarjeta).
--   2. RLS de lectura para ti/contador/super con aal2, y privilegios revocados
--      a anon y a la escritura directa (leccion del 02/10 con los respaldos: el
--      proyecto da `grant all` a anon por omision a toda tabla nueva).
--   3. RPC `cargar_padron_zk` (rol ti). Funcion nueva -> solo notify, sin drop.
--   4. Verificacion de solo lectura: seis filas con ok = true.
--
-- Se pega COMPLETO en el SQL Editor. Es AGREGA: el orden con el cliente no
-- importa (sin la tabla, la pestana sigue funcionando con el archivo en memoria).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. GUARDIA
-- ---------------------------------------------------------------------
do $guardia$
begin
    if to_regprocedure('panel_exigir_rol(text[])') is null then
        raise exception 'Falta panel_exigir_rol (bloques 29 y 49). No se aplico nada.';
    end if;
    if to_regclass('public.zk_eventos') is null then
        raise exception 'Falta zk_eventos (bloque 78). No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. LAS TABLAS
-- ---------------------------------------------------------------------
create table if not exists zk_padron_cargas (
    id            uuid primary key default gen_random_uuid(),
    archivo       text not null,
    -- El mismo archivo no se procesa dos veces, igual que en zk_importaciones.
    sha256        text not null unique,
    filas_archivo integer not null,
    personas      integer not null,
    -- Cuando ZK exporto el archivo, leido de su nombre («Usuarios_AAAAMMDDHHMMSS»).
    exportado_en  timestamp,
    cargado_por   text not null,
    cargado_en    timestamptz not null default now(),
    constraint zkp_carga_archivo_no_vacio check (btrim(archivo) <> ''),
    constraint zkp_carga_sha_formato      check (sha256 ~ '^[0-9a-f]{64}$')
);

create table if not exists zk_padron (
    tarjeta         text primary key,
    nombre          text not null default '',
    departamento_id text not null default '',
    departamento    text not null default '',
    -- false cuando la tarjeta dejo de venir en el export: ZK la borro o la dio
    -- de baja. Se conserva para que la bitacora vieja siga teniendo dueno.
    vigente         boolean not null default true,
    carga_id        uuid not null references zk_padron_cargas(id),
    actualizado_en  timestamptz not null default now(),
    constraint zkp_tarjeta_formato check (tarjeta ~ '^[0-9]+$')
);

create index if not exists ix_zk_padron_vigente on zk_padron (tarjeta) where vigente;

comment on table  zk_padron_cargas is 'Un renglon por export «Personas» de ZK procesado (SC-031, bloque 83).';
comment on table  zk_padron is 'Quien es cada tarjeta segun ZK: nombre y departamento. Sin placa, correo ni telefono. PII: misma RLS que registros.';
comment on column zk_padron.vigente is 'false si la tarjeta ya no vino en el ultimo export. No se borra: la bitacora vieja la necesita.';


-- ---------------------------------------------------------------------
-- 2. RLS Y PRIVILEGIOS. Lectura para quien opera y quien concilia; escritura
--    solo por el RPC. Y anon fuera, aunque el proyecto se lo haya dado solo.
-- ---------------------------------------------------------------------
alter table zk_padron_cargas enable row level security;
alter table zk_padron        enable row level security;

drop policy if exists zk_padron_cargas_lectura_panel on zk_padron_cargas;
create policy zk_padron_cargas_lectura_panel on zk_padron_cargas
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti','contador','super')
    );

drop policy if exists zk_padron_lectura_panel on zk_padron;
create policy zk_padron_lectura_panel on zk_padron
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti','contador','super')
    );

revoke all on table zk_padron_cargas, zk_padron from anon, public;
revoke insert, update, delete, truncate, references, trigger on table zk_padron_cargas, zk_padron from authenticated;
grant  select on table zk_padron_cargas, zk_padron to authenticated;


-- ---------------------------------------------------------------------
-- 3. EL RPC DE CARGA
--
-- Recibe el archivo entero en una llamada (~2,900 filas chicas). Escribe solo
-- lo que cambia; marca como no vigente lo que ya no viene; y si el sha256 ya
-- estaba, no toca nada y lo dice.
-- ---------------------------------------------------------------------
create or replace function cargar_padron_zk(
    p_meta      jsonb,
    p_filas     jsonb,
    p_hecho_por text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $carga$
declare
    v_quien  text;
    v_sha    text;
    v_carga  uuid;
    v_nueva  int;
    v_ins    int := 0;
    v_act    int := 0;
    v_ret    int := 0;
    v_vig    int;
begin
    perform panel_exigir_rol(array['ti']);

    if p_meta is null or jsonb_typeof(p_meta) <> 'object' then
        raise exception 'Falta la informacion del archivo. Vuelva a elegirlo y reintente.';
    end if;
    if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
        raise exception 'El padron no trae personas. Verifique que sea el archivo «Personas» de ZK.';
    end if;

    v_sha := lower(btrim(coalesce(p_meta ->> 'sha256', '')));
    if v_sha !~ '^[0-9a-f]{64}$' then
        raise exception 'El archivo no trae una huella valida. Vuelva a elegirlo y reintente.';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    insert into zk_padron_cargas (archivo, sha256, filas_archivo, personas, exportado_en, cargado_por)
    values (
        coalesce(nullif(btrim(p_meta ->> 'archivo'), ''), 'sin nombre'),
        v_sha,
        coalesce((p_meta ->> 'filasArchivo')::int, 0),
        jsonb_array_length(p_filas),
        nullif(p_meta ->> 'exportadoEn', '')::timestamp,
        v_quien
    )
    on conflict (sha256) do nothing;
    get diagnostics v_nueva = row_count;

    select id into v_carga from zk_padron_cargas where sha256 = v_sha;

    if v_nueva = 0 then
        select count(*) into v_vig from zk_padron where vigente;
        return jsonb_build_object(
            'cargaId', v_carga, 'yaEstaba', true,
            'insertadas', 0, 'actualizadas', 0, 'retiradas', 0, 'vigentes', v_vig
        );
    end if;

    -- Solo las filas que cambian. `xmax = 0` distingue una insercion de una
    -- actualizacion en el mismo RETURNING; las que no cambian no se escriben.
    with datos as (
        select distinct on (tarjeta) tarjeta, nombre, departamento_id, departamento
          from (
            select btrim(coalesce(f ->> 'tarjeta', ''))                         as tarjeta,
                   left(btrim(coalesce(f ->> 'nombre', '')), 200)               as nombre,
                   left(btrim(coalesce(f ->> 'departamentoId', '')), 20)        as departamento_id,
                   left(btrim(coalesce(f ->> 'departamento', '')), 120)         as departamento
              from jsonb_array_elements(p_filas) f
          ) x
         where tarjeta ~ '^[0-9]+$'
    ), escritas as (
        insert into zk_padron as z (tarjeta, nombre, departamento_id, departamento, vigente, carga_id, actualizado_en)
        select d.tarjeta, d.nombre, d.departamento_id, d.departamento, true, v_carga, now()
          from datos d
        on conflict (tarjeta) do update
           set nombre = excluded.nombre,
               departamento_id = excluded.departamento_id,
               departamento = excluded.departamento,
               vigente = true,
               carga_id = excluded.carga_id,
               actualizado_en = now()
         where (z.nombre, z.departamento_id, z.departamento, z.vigente)
               is distinct from (excluded.nombre, excluded.departamento_id, excluded.departamento, true)
        returning (xmax = 0) as nueva
    )
    select count(*) filter (where nueva), count(*) filter (where not nueva)
      into v_ins, v_act
      from escritas;

    -- Lo que ya no viene deja de estar vigente. No se borra: la bitacora vieja
    -- sigue necesitando saber de quien era.
    with datos as (
        select btrim(coalesce(f ->> 'tarjeta', '')) as tarjeta
          from jsonb_array_elements(p_filas) f
    )
    update zk_padron z
       set vigente = false, actualizado_en = now()
     where z.vigente
       and not exists (select 1 from datos d where d.tarjeta = z.tarjeta);
    get diagnostics v_ret = row_count;

    select count(*) into v_vig from zk_padron where vigente;

    return jsonb_build_object(
        'cargaId', v_carga, 'yaEstaba', false,
        'insertadas', v_ins, 'actualizadas', v_act, 'retiradas', v_ret, 'vigentes', v_vig
    );
end;
$carga$;

revoke all    on function cargar_padron_zk(jsonb, jsonb, text) from public, anon;
grant  execute on function cargar_padron_zk(jsonb, jsonb, text) to authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- 4. VERIFICACION (solo lectura). Seis filas con ok = true.
-- ---------------------------------------------------------------------
select 1 as orden, 'existen zk_padron_cargas y zk_padron' as que,
       to_regclass('public.zk_padron_cargas') is not null and to_regclass('public.zk_padron') is not null as ok
union all
select 2, 'las dos tienen RLS',
       (select bool_and(relrowsecurity) from pg_class where relname in ('zk_padron_cargas','zk_padron'))
union all
select 3, 'anon no las lee ni las escribe',
       not has_table_privilege('anon', 'zk_padron', 'SELECT')
       and not has_table_privilege('anon', 'zk_padron', 'INSERT')
       and not has_table_privilege('anon', 'zk_padron_cargas', 'SELECT')
union all
select 4, 'authenticated solo lee (la RLS decide quien)',
       has_table_privilege('authenticated', 'zk_padron', 'SELECT')
       and not has_table_privilege('authenticated', 'zk_padron', 'INSERT')
       and not has_table_privilege('authenticated', 'zk_padron', 'UPDATE')
       and not has_table_privilege('authenticated', 'zk_padron', 'DELETE')
union all
select 5, 'una politica de lectura por tabla, para ti/contador/super',
       (select count(*) from pg_policies where tablename in ('zk_padron','zk_padron_cargas') and cmd = 'SELECT') = 2
union all
select 6, 'el RPC existe, es security definer y anon no lo ejecuta',
       exists (select 1 from pg_proc where proname = 'cargar_padron_zk' and prosecdef)
       and not has_function_privilege('anon', 'cargar_padron_zk(jsonb, jsonb, text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'cargar_padron_zk(jsonb, jsonb, text)', 'EXECUTE')
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). Deshace el bloque entero; el padron guardado se pierde,
-- pero se vuelve a cargar subiendo el export otra vez.
--
--   drop function if exists cargar_padron_zk(jsonb, jsonb, text);
--   drop table if exists zk_padron;
--   drop table if exists zk_padron_cargas;
--   notify pgrst, 'reload schema';
-- ---------------------------------------------------------------------
