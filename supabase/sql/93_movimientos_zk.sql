-- =====================================================================
-- BLOQUE 93 — Movimientos en ZK: SATAG guia lo que TI hace en ZK y lo comprueba.
--
-- SC-032 · 09/10/2026
--
-- POR QUE
--   Los casos que piden una accion en ZK (pasar a BAJAS, cambiar de
--   departamento, corregir un nombre) se resolvian a mano y nadie comprobaba
--   que ZK quedara como debia: la accion esperada vivia solo en el titulo del
--   caso. Gerardo, 9-oct: «que SATAG te diga de que departamentos debes hacer
--   ese proceso y que lo marques cuando ya este», y que SATAG pueda comprobar
--   que los movimientos se hicieron.
--
-- LO PROBADO EN ZK EL 9-OCT (Campo/01 - Puente SATAG-ZKBioSecurity.md)
--   - El import cambia el departamento (y el nombre) y NO toca los niveles.
--   - BAJAS no tiene niveles: se le quitan a todos sus miembros agregandole
--     todos los niveles al departamento y quitandoselos. Los departamentos con
--     niveles los aplican con «quitar y volver a poner».
--   - Los cuatro reportes «Personal de Apertura» (una puerta cada uno) dicen
--     quien tiene acceso, por ID de ZK y sin tarjeta.
--   - «Borrar Personal» en Por Niveles BORRA a la persona: ningun paso lo usa.
--
-- QUE HACE, EN ORDEN
--   0. Guardia: 86, 89 y 90 aplicados, cargar_padron_zk como la dejo el 86, y
--      el 93 sin aplicar.
--   1. `zk_departamentos`: el catalogo de ZK con los niveles de cada uno,
--      sembrado con lo que dijeron los exports del 9-oct (Usuarios y las
--      cuatro puertas). BAJAS, Ex alumnos y Falta de informacion: sin niveles.
--   2. `zk_padron.id_zk` y `cargar_padron_zk` que lo guarda. Misma firma: el
--      cuerpo es el del 86 con un delta (diff en la cabecera de la seccion).
--   3. `zk_puertas_cargas` y `zk_puertas`: quien tiene cada puerta, segun el
--      ultimo «Personal de Apertura» de esa puerta. RPC `cargar_puertas_zk`
--      con el freno del 84.
--   4. `zk_tandas` y `zk_movimientos`: lo que hay que hacer en ZK por caso, y
--      las tandas con los pasos para palomear.
--   5. RPC (solo ti): generar_movimientos_zk, ajustar_movimiento_zk,
--      guardar_departamento_zk, crear_tanda_zk, marcar_paso_tanda_zk,
--      cancelar_tanda_zk y verificar_movimientos_zk.
--   6. RLS de lectura para ti, contador y super con MFA (como zk_padron).
--   7. Verificacion de solo lectura: filas con ok = true.
--
-- EL RELOJ DE ZK VA UNA HORA ADELANTADO (9-oct: los archivos dicen 11:19 y se
-- guardaron a las 10:19). Un «si coincide» no depende de la hora. Un «no
-- coincide» solo se da con archivos exportados al menos una hora (de ZK)
-- despues de que la tanda quedo hecha: si ZK corrige su reloj, el error es
-- esperar un poco mas, nunca reabrir un caso por un archivo viejo.
--
-- Este bloque solo AGREGA (cargar_padron_zk conserva su firma y acepta al
-- cliente de hoy): va ANTES del deploy del cliente.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. GUARDIA
-- ---------------------------------------------------------------------
do $guardia$
begin
    if to_regprocedure('public.panel_exigir_rol(text[])') is null then
        raise exception 'Falta panel_exigir_rol (bloques 29 y 49). No se aplico nada.';
    end if;
    if to_regclass('public.casos') is null or to_regclass('public.casos_familias') is null then
        raise exception 'Faltan los bloques 89 y 90 (casos y su tablero). No se aplico nada.';
    end if;
    if not exists (select 1 from pg_proc where proname = 'cargar_padron_zk'
                    and prosrc like '%nombres = excluded.nombres%' and prosrc like '%requiereConfirmacion%') then
        raise exception 'cargar_padron_zk no es la del bloque 86. No se aplico nada: revise que bloque la dejo asi.';
    end if;
    if to_regclass('public.zk_movimientos') is not null
       or exists (select 1 from pg_proc where proname in ('crear_tanda_zk', 'verificar_movimientos_zk'))
       or exists (select 1 from information_schema.columns where table_name = 'zk_padron' and column_name = 'id_zk') then
        raise exception 'El bloque 93 ya esta aplicado. No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. LOS DEPARTAMENTOS DE ZK Y SUS NIVELES
--
-- Sembrado del export de Usuarios del 9-oct-2026 (10:42) cruzado con los cuatro
-- «Personal de Apertura» (10:45): que puertas tienen los miembros de cada uno.
-- NO se siembran: Empleado_PPF (no aparece en ningun export de ZK: ni en el
-- catalogo del 6-oct ni con miembros el 9-oct; mandar gente ahi seria mandarla a
-- un departamento que quiza no existe), «General» y «hotel» (sin miembros y sin
-- niveles conocidos). TI los registra con `guardar_departamento_zk` cuando
-- existan en ZK; mientras, sus casos salen «sin destino».
-- ---------------------------------------------------------------------
create table zk_departamentos (
    id             text primary key,
    nombre         text not null,
    -- E1 = ESTACIONAMIENTO 1, E2 = ESTACIONAMIENTO 2. Vacio = sin niveles (BAJAS).
    niveles        text[] not null default '{}',
    actualizado_en timestamptz not null default now(),
    constraint zkd_id      check (id ~ '^[0-9]+$'),
    constraint zkd_nombre  check (btrim(nombre) <> ''),
    constraint zkd_niveles check (niveles <@ array['E1', 'E2'])
);

insert into zk_departamentos (id, nombre, niveles) values
    ('4',  'PRIMARIA DOCENTE',        '{E2}'),
    ('9',  'PREESCOLAR DOCENTES',     '{E2}'),
    ('10', 'BAJAS',                   '{}'),
    ('11', 'SECUNDARIA DOCENTES',     '{E1}'),
    ('12', 'PREPARATORIA DOCENTES',   '{E1}'),
    ('13', 'DEPORTES EXTRAESCOLARES', '{E2}'),
    ('14', 'TEX DOCENTES',            '{E2}'),
    ('15', 'MANTENIMIENTO',           '{E2}'),
    ('16', 'Administracion',          '{E2}'),
    ('17', 'Admon',                   '{E2}'),
    ('18', 'STOCK SATAG',             '{E1,E2}'),
    ('19', 'Padres de familia',       '{E1,E2}'),
    ('20', 'Alumnos',                 '{E1}'),
    ('21', 'Ex alumnos',              '{}'),
    ('22', 'Falta de información',    '{}'),
    ('23', 'Otros',                   '{E1,E2}');

comment on table zk_departamentos is 'Departamentos de ZK y los niveles (puertas) que dan (bloque 93). De aqui sale que paso le toca a cada destino.';

-- Para comparar nombres de departamento y de persona: mayusculas, sin acentos,
-- guion bajo como espacio, espacios sencillos. «Empleado_PPF» = «EMPLEADO PPF».
create function zk_texto_comparable(p text) returns text
language sql immutable
as $$
    select btrim(regexp_replace(upper(translate(coalesce(p, ''), 'áéíóúüñÁÉÍÓÚÜÑ_', 'aeiouunAEIOUUN ')), '\s+', ' ', 'g'))
$$;


-- ---------------------------------------------------------------------
-- 2. EL ID DE ZK EN EL PADRON
--
-- Los «Personal de Apertura» solo traen el ID de la persona; el padron lo
-- liga a la tarjeta. Y el archivo de importacion lo necesita: sin el ID
-- correcto, ZK crearia a otra persona con la misma tarjeta.
--
-- `cargar_padron_zk`: cuerpo EXTRAIDO de 86_altas_desde_zk.sql:101-252 con este
-- delta (verificado con diff, todo lo demas identico):
--   - tmp_padron_zk y su insert ganan `id_zk`, leido de `idZk`;
--   - el upsert escribe id_zk, y si la fila no lo trae conserva el anterior
--     (un cliente de antes del 93 no borra los IDs que ya estaban);
--   - la comparacion de «que cambio» incluye id_zk.
-- ---------------------------------------------------------------------
alter table zk_padron add column id_zk text not null default '';
create index ix_zk_padron_id_zk on zk_padron (id_zk) where id_zk <> '';
comment on column zk_padron.id_zk is 'El ID de la persona en ZK (columna «ID» del export de Usuarios). Bloque 93.';

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
    v_quien      text;
    v_sha        text;
    v_forzar     boolean;
    v_exportado  timestamp;
    v_carga      uuid;
    v_vigentes   int;
    v_retiraria  int;
    v_ult_export timestamp;
    v_ult_sha    text;
    v_motivos    text[] := array[]::text[];
    v_ins        int := 0;
    v_act        int := 0;
    v_ret        int := 0;
    v_vig        int;
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

    v_quien     := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');
    v_forzar    := coalesce((p_meta ->> 'forzar')::boolean, false);
    v_exportado := nullif(p_meta ->> 'exportadoEn', '')::timestamp;

    if to_regclass('pg_temp.tmp_padron_zk') is not null then
        drop table pg_temp.tmp_padron_zk;
    end if;
    create temp table tmp_padron_zk (
        tarjeta text primary key, nombre text, departamento_id text, departamento text,
        nombres text, apellidos text, placa text, id_zk text
    ) on commit drop;
    insert into tmp_padron_zk (tarjeta, nombre, departamento_id, departamento, nombres, apellidos, placa, id_zk)
    select distinct on (tarjeta) tarjeta, nombre, departamento_id, departamento, nombres, apellidos, placa, id_zk
      from (
        select btrim(coalesce(f ->> 'tarjeta', ''))                  as tarjeta,
               left(btrim(coalesce(f ->> 'nombre', '')), 200)        as nombre,
               left(btrim(coalesce(f ->> 'departamentoId', '')), 20) as departamento_id,
               left(btrim(coalesce(f ->> 'departamento', '')), 120)  as departamento,
               -- Un cliente de antes del 86 no las manda: quedan vacias, no fallan.
               left(btrim(coalesce(f ->> 'nombres', '')), 120)       as nombres,
               left(btrim(coalesce(f ->> 'apellidos', '')), 120)     as apellidos,
               left(upper(regexp_replace(coalesce(f ->> 'placa', ''), '\s', '', 'g')), 20) as placa,
               -- NUEVO 93: el ID de la persona en ZK. Un cliente de antes no lo manda.
               left(btrim(coalesce(f ->> 'idZk', '')), 20)           as id_zk
          from jsonb_array_elements(p_filas) f
      ) x
     where tarjeta ~ '^[0-9]+$';

    if (select count(*) from tmp_padron_zk) = 0 then
        raise exception 'Ninguna fila trae un numero de tarjeta valido. Verifique que sea el archivo «Personas» de ZK.';
    end if;

    -- EL FRENO, antes de escribir nada (bloque 84).
    select count(*) into v_vigentes from zk_padron where vigente;
    select count(*) into v_retiraria
      from zk_padron z
     where z.vigente and not exists (select 1 from tmp_padron_zk t where t.tarjeta = z.tarjeta);
    if v_vigentes > 0 and v_retiraria > 20 and v_retiraria * 5 > v_vigentes then
        v_motivos := array_append(v_motivos, 'retira_muchos');
    end if;

    select exportado_en, sha256 into v_ult_export, v_ult_sha
      from zk_padron_cargas order by cargado_en desc limit 1;
    if v_exportado is not null and v_ult_export is not null and v_exportado < v_ult_export and v_sha is distinct from v_ult_sha then
        v_motivos := array_append(v_motivos, 'export_anterior');
    end if;

    if cardinality(v_motivos) > 0 and not v_forzar then
        return jsonb_build_object(
            'requiereConfirmacion', true,
            'motivos',    to_jsonb(v_motivos),
            'retiraria',  v_retiraria,
            'vigentes',   v_vigentes,
            'exportadoEn', v_exportado,
            'ultimoExportadoEn', v_ult_export
        );
    end if;

    insert into zk_padron_cargas (archivo, sha256, filas_archivo, personas, exportado_en, cargado_por)
    values (
        coalesce(nullif(btrim(p_meta ->> 'archivo'), ''), 'sin nombre'),
        v_sha,
        coalesce((p_meta ->> 'filasArchivo')::int, 0),
        (select count(*) from tmp_padron_zk),
        v_exportado,
        v_quien
    )
    on conflict (sha256) do update
       set cargado_en = now(), cargado_por = excluded.cargado_por, personas = excluded.personas
    returning id into v_carga;

    -- SOLO LO QUE CAMBIA. `xmax = 0` distingue insercion de actualizacion.
    with escritas as (
        insert into zk_padron as z (tarjeta, nombre, departamento_id, departamento, nombres, apellidos, placa,
                                    id_zk, vigente, carga_id, actualizado_en)
        select t.tarjeta, t.nombre, t.departamento_id, t.departamento, t.nombres, t.apellidos, t.placa,
               t.id_zk, true, v_carga, now()
          from tmp_padron_zk t
        on conflict (tarjeta) do update
           set nombre = excluded.nombre,
               departamento_id = excluded.departamento_id,
               departamento = excluded.departamento,
               nombres = excluded.nombres,
               apellidos = excluded.apellidos,
               placa = excluded.placa,
               -- NUEVO 93: un cliente que no manda el ID no borra el que ya estaba.
               id_zk = coalesce(nullif(excluded.id_zk, ''), z.id_zk),
               vigente = true,
               carga_id = excluded.carga_id,
               actualizado_en = now()
         where (z.nombre, z.departamento_id, z.departamento, z.nombres, z.apellidos, z.placa, z.id_zk, z.vigente)
               is distinct from (excluded.nombre, excluded.departamento_id, excluded.departamento,
                                 excluded.nombres, excluded.apellidos, excluded.placa,
                                 coalesce(nullif(excluded.id_zk, ''), z.id_zk), true)
        returning (xmax = 0) as nueva
    )
    select count(*) filter (where nueva), count(*) filter (where not nueva)
      into v_ins, v_act
      from escritas;

    update zk_padron z
       set vigente = false, actualizado_en = now()
     where z.vigente
       and not exists (select 1 from tmp_padron_zk t where t.tarjeta = z.tarjeta);
    get diagnostics v_ret = row_count;

    select count(*) into v_vig from zk_padron where vigente;

    return jsonb_build_object(
        'cargaId', v_carga,
        'yaEstaba', (v_ins + v_act + v_ret) = 0,
        'insertadas', v_ins, 'actualizadas', v_act, 'retiradas', v_ret, 'vigentes', v_vig
    );
end;
$carga$;

revoke all    on function cargar_padron_zk(jsonb, jsonb, text) from public, anon;
grant  execute on function cargar_padron_zk(jsonb, jsonb, text) to authenticated;


-- ---------------------------------------------------------------------
-- 3. LAS PUERTAS: quien tiene acceso a cada una
--
-- Un reporte «Personal de Apertura» por puerta. Cada carga REEMPLAZA la foto de
-- su puerta (es estado, no historia). Del archivo solo viajan los IDs.
-- ---------------------------------------------------------------------
create table zk_puertas_cargas (
    id            uuid primary key default gen_random_uuid(),
    puerta        text not null,
    archivo       text not null,
    sha256        text not null unique,
    filas_archivo integer not null,
    personas      integer not null,
    -- Del nombre del archivo («…_AAAAMMDDHHMMSS»): hora del reloj de ZK.
    exportado_en  timestamp,
    cargado_por   text not null,
    cargado_en    timestamptz not null default now(),
    constraint zkpc_puerta check (puerta in ('E1-entrada', 'E1-salida', 'E2-entrada', 'E2-salida')),
    constraint zkpc_sha    check (sha256 ~ '^[0-9a-f]{64}$')
);

create table zk_puertas (
    puerta   text not null,
    id_zk    text not null,
    carga_id uuid not null references zk_puertas_cargas(id),
    primary key (puerta, id_zk),
    constraint zkp_puerta check (puerta in ('E1-entrada', 'E1-salida', 'E2-entrada', 'E2-salida')),
    constraint zkp_id     check (id_zk ~ '^[0-9A-Za-z]+$')
);
create index ix_zk_puertas_id on zk_puertas (id_zk);

comment on table zk_puertas is 'Quien tiene acceso a cada puerta segun el ultimo «Personal de Apertura» de esa puerta (bloque 93). Por ID de ZK.';


-- ---------------------------------------------------------------------
-- 4. LAS TANDAS Y LOS MOVIMIENTOS
-- ---------------------------------------------------------------------
create table zk_tandas (
    id         uuid primary key default gen_random_uuid(),
    numero     integer generated always as identity unique,
    estado     text not null default 'abierta',
    -- [{clave, texto, hecho, hechoPor, hechoEn}]: lo que TI palomea.
    pasos      jsonb not null,
    creada_por text not null,
    creada_en  timestamptz not null default now(),
    hecha_por  text,
    hecha_en   timestamptz,
    constraint zkt_estado check (estado in ('abierta', 'hecha', 'cancelada')),
    constraint zkt_pasos  check (jsonb_typeof(pasos) = 'array'),
    constraint zkt_hecha  check ((estado = 'hecha') = (hecha_en is not null))
);
-- Una sola tanda abierta a la vez: lo que se importa en ZK es un solo archivo.
create unique index ux_zk_tandas_abierta on zk_tandas ((true)) where estado = 'abierta';

create table zk_movimientos (
    id               uuid primary key default gen_random_uuid(),
    caso_id          uuid not null references casos(id),
    tarjeta          text not null,
    -- departamento: moverlo a `depto_destino`. nombre: que ZK diga `nombre_destino`.
    que              text not null,
    depto_destino    text references zk_departamentos(id),
    nombre_destino   text,
    -- pendiente -> en_tanda -> hecho -> verificado; o no_coincide (vuelve a
    -- poder ir en otra tanda); o cancelado (el caso se cerro por otro lado).
    estado           text not null default 'pendiente',
    tanda_id         uuid references zk_tandas(id),
    -- Lo ultimo que dijo la verificacion, en palabras.
    detalle          text not null default '',
    creado_por       text not null,
    creado_en        timestamptz not null default now(),
    actualizado_en   timestamptz not null default now(),
    verificado_en    timestamptz,
    constraint zkm_que     check (que in ('departamento', 'nombre')),
    constraint zkm_destino check ((que = 'departamento') = (depto_destino is not null)
                                  and (que = 'nombre') = (coalesce(btrim(nombre_destino), '') <> '')),
    constraint zkm_estado  check (estado in ('pendiente', 'en_tanda', 'hecho', 'verificado', 'no_coincide', 'cancelado')),
    constraint zkm_tanda   check (estado not in ('en_tanda', 'hecho') or tanda_id is not null),
    constraint zkm_tarjeta check (tarjeta ~ '^[0-9]{4,12}$')
);
-- Un movimiento vivo por caso y por clase.
create unique index ux_zk_movimientos_vivo on zk_movimientos (caso_id, que) where estado <> 'cancelado';
create index ix_zk_movimientos_estado on zk_movimientos (estado);

comment on table zk_movimientos is 'Lo que hay que hacer en ZK por cada caso, y en que va (bloque 93).';
comment on table zk_tandas is 'Cada archivo que se importa en ZK, con los pasos que TI palomea (bloque 93).';


-- ---------------------------------------------------------------------
-- 5. LAS FUNCIONES
-- ---------------------------------------------------------------------

-- Internas (no se exponen): cerrar y reabrir un caso como lo hace mover_casos (90).
create function zk_cerrar_caso(p_caso uuid, p_motivo text, p_nota text, p_quien text) returns void
language plpgsql security definer set search_path = public
as $$
declare v_antes text;
begin
    select estado into v_antes from casos where id = p_caso for update;
    if v_antes is null or v_antes in ('resuelto', 'descartado') then
        return;
    end if;
    update casos
       set estado = 'resuelto', actualizado_en = now(),
           espera_motivo = null, espera_hasta = null, espera_texto = null, atorado = false,
           cerrado_por = p_quien, cerrado_en = now(),
           cierre_nota = left(concat_ws('. ', p_motivo, nullif(p_nota, '')), 4000), cierre_motivo = p_motivo
     where id = p_caso;
    insert into casos_notas (caso_id, clase, estado_antes, estado_despues, nota, hecho_por)
    values (p_caso, 'estado', v_antes, 'resuelto', left(concat_ws('. ', p_motivo, nullif(p_nota, '')), 4000), p_quien);
end;
$$;

create function zk_reabrir_caso(p_caso uuid, p_nota text, p_quien text) returns void
language plpgsql security definer set search_path = public
as $$
declare v_antes text;
begin
    select estado into v_antes from casos where id = p_caso for update;
    if v_antes is null or v_antes not in ('resuelto', 'descartado') then
        insert into casos_notas (caso_id, clase, nota, hecho_por) values (p_caso, 'nota', left(p_nota, 4000), p_quien);
        return;
    end if;
    update casos
       set estado = 'abierto', actualizado_en = now(),
           cerrado_por = null, cerrado_en = null, cierre_nota = null, cierre_motivo = null
     where id = p_caso;
    insert into casos_notas (caso_id, clase, estado_antes, estado_despues, nota, hecho_por)
    values (p_caso, 'estado', v_antes, 'abierto', left(p_nota, 4000), p_quien);
end;
$$;

revoke all on function zk_cerrar_caso(uuid, text, text, text) from public, anon, authenticated;
revoke all on function zk_reabrir_caso(uuid, text, text) from public, anon, authenticated;
revoke all on function zk_texto_comparable(text) from public, anon;


-- 5.1 Cargar una puerta (rol ti). p_ids: los IDs de ZK del reporte.
create function cargar_puertas_zk(
    p_puerta    text,
    p_meta      jsonb,
    p_ids       jsonb,
    p_hecho_por text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $puertas$
declare
    v_quien      text;
    v_sha        text;
    v_forzar     boolean;
    v_exportado  timestamp;
    v_carga      uuid;
    v_antes      int;
    v_retiraria  int;
    v_ult_export timestamp;
    v_ult_sha    text;
    v_motivos    text[] := array[]::text[];
    v_agr        int;
    v_quit       int;
    v_total      int;
begin
    perform panel_exigir_rol(array['ti']);

    if p_puerta is null or p_puerta not in ('E1-entrada', 'E1-salida', 'E2-entrada', 'E2-salida') then
        raise exception 'No se reconoce la puerta. Elija los reportes «Personal de Apertura» de Entrada 1, Salida 1, Entrada 2 o Salida 2.';
    end if;
    if p_meta is null or jsonb_typeof(p_meta) <> 'object' then
        raise exception 'Falta la informacion del archivo. Vuelva a elegirlo y reintente.';
    end if;
    if p_ids is null or jsonb_typeof(p_ids) <> 'array' then
        raise exception 'El reporte no trae personas. Verifique que sea un «Personal de Apertura» de ZK.';
    end if;
    v_sha := lower(btrim(coalesce(p_meta ->> 'sha256', '')));
    if v_sha !~ '^[0-9a-f]{64}$' then
        raise exception 'El archivo no trae una huella valida. Vuelva a elegirlo y reintente.';
    end if;

    v_quien     := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');
    v_forzar    := coalesce((p_meta ->> 'forzar')::boolean, false);
    v_exportado := nullif(p_meta ->> 'exportadoEn', '')::timestamp;

    if to_regclass('pg_temp.tmp_puerta') is not null then
        drop table pg_temp.tmp_puerta;
    end if;
    create temp table tmp_puerta (id_zk text primary key) on commit drop;
    insert into tmp_puerta
    select distinct btrim(x) from jsonb_array_elements_text(p_ids) x where btrim(x) ~ '^[0-9A-Za-z]+$';

    -- EL FRENO (como el 84): dejar sin puerta a muchos de golpe, o un archivo
    -- mas viejo que el ultimo, se pregunta antes.
    select count(*) into v_antes from zk_puertas where puerta = p_puerta;
    select count(*) into v_retiraria from zk_puertas z
     where z.puerta = p_puerta and not exists (select 1 from tmp_puerta t where t.id_zk = z.id_zk);
    if v_antes > 0 and v_retiraria > 20 and v_retiraria * 5 > v_antes then
        v_motivos := array_append(v_motivos, 'retira_muchos');
    end if;
    select exportado_en, sha256 into v_ult_export, v_ult_sha
      from zk_puertas_cargas where puerta = p_puerta order by cargado_en desc limit 1;
    if v_exportado is not null and v_ult_export is not null and v_exportado < v_ult_export and v_sha is distinct from v_ult_sha then
        v_motivos := array_append(v_motivos, 'export_anterior');
    end if;
    if cardinality(v_motivos) > 0 and not v_forzar then
        return jsonb_build_object('requiereConfirmacion', true, 'motivos', to_jsonb(v_motivos),
            'retiraria', v_retiraria, 'vigentes', v_antes, 'exportadoEn', v_exportado, 'ultimoExportadoEn', v_ult_export);
    end if;

    insert into zk_puertas_cargas (puerta, archivo, sha256, filas_archivo, personas, exportado_en, cargado_por)
    values (p_puerta, coalesce(nullif(btrim(p_meta ->> 'archivo'), ''), 'sin nombre'), v_sha,
            coalesce((p_meta ->> 'filasArchivo')::int, 0), (select count(*) from tmp_puerta), v_exportado, v_quien)
    on conflict (sha256) do update set cargado_en = now(), cargado_por = excluded.cargado_por
    returning id into v_carga;

    delete from zk_puertas z where z.puerta = p_puerta and not exists (select 1 from tmp_puerta t where t.id_zk = z.id_zk);
    get diagnostics v_quit = row_count;
    insert into zk_puertas (puerta, id_zk, carga_id)
    select p_puerta, t.id_zk, v_carga from tmp_puerta t
    on conflict (puerta, id_zk) do nothing;
    get diagnostics v_agr = row_count;
    update zk_puertas set carga_id = v_carga where puerta = p_puerta;
    select count(*) into v_total from zk_puertas where puerta = p_puerta;

    return jsonb_build_object('puerta', p_puerta, 'agregadas', v_agr, 'quitadas', v_quit, 'personas', v_total,
                              'yaEstaba', (v_agr + v_quit) = 0);
end;
$puertas$;


-- 5.2 Los movimientos que piden los casos abiertos. Se puede repetir: solo
-- agrega lo que falta y cancela lo pendiente de casos que ya se cerraron.
--   departamento-distinto: «… y le toca «X»» -> mover a X.
--   exempleado-tag-vivo:   -> mover a BAJAS.
--   nombre-en-zk:          «… debe decir «Y»» -> que ZK diga Y.
create function generar_movimientos_zk(p_hecho_por text default null) returns jsonb
language plpgsql security definer set search_path = public
as $generar$
declare
    v_quien   text;
    v_nuevos  int := 0;
    v_cancel  int;
    v_sin     text[] := array[]::text[];
    r         record;
    v_destino text;
    v_depto   text;
begin
    perform panel_exigir_rol(array['ti']);
    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    update zk_movimientos m
       set estado = 'cancelado', actualizado_en = now(), detalle = 'El caso se cerro sin pasar por una tanda.'
     where m.estado = 'pendiente'
       and exists (select 1 from casos c where c.id = m.caso_id and c.estado in ('resuelto', 'descartado'));
    get diagnostics v_cancel = row_count;

    for r in
        select c.id, c.numero, c.tipo, c.titulo, c.tarjeta
          from casos c
         where c.estado in ('nuevo', 'abierto', 'esperando', 'seguimiento')
           and c.tarjeta is not null
           and c.tipo in ('departamento-distinto', 'exempleado-tag-vivo', 'nombre-en-zk')
         order by c.numero
    loop
        if r.tipo = 'nombre-en-zk' then
            v_destino := btrim(substring(r.titulo from 'debe decir «([^»]+)»'));
            if coalesce(v_destino, '') = '' then
                v_sin := array_append(v_sin, r.numero::text);
                continue;
            end if;
            insert into zk_movimientos (caso_id, tarjeta, que, nombre_destino, creado_por)
            values (r.id, r.tarjeta, 'nombre', v_destino, v_quien)
            on conflict (caso_id, que) where estado <> 'cancelado' do nothing;
        else
            v_destino := case when r.tipo = 'exempleado-tag-vivo' then 'BAJAS'
                              else btrim(substring(r.titulo from 'le toca «([^»]+)»')) end;
            v_depto := null;
            select d.id into v_depto from zk_departamentos d
             where zk_texto_comparable(d.nombre) = zk_texto_comparable(v_destino);
            if v_depto is null then
                v_sin := array_append(v_sin, r.numero::text);
                continue;
            end if;
            insert into zk_movimientos (caso_id, tarjeta, que, depto_destino, creado_por)
            values (r.id, r.tarjeta, 'departamento', v_depto, v_quien)
            on conflict (caso_id, que) where estado <> 'cancelado' do nothing;
        end if;
        if found then
            v_nuevos := v_nuevos + 1;
        end if;
    end loop;

    return jsonb_build_object('nuevos', v_nuevos, 'cancelados', v_cancel, 'casosSinDestino', to_jsonb(v_sin));
end;
$generar$;


-- 5.3 Cambiar el destino de un movimiento pendiente, o cancelarlo (la nota de
-- Miguel puede decir otra cosa que el titulo del caso).
create function ajustar_movimiento_zk(
    p_movimiento     uuid,
    p_depto_destino  text default null,
    p_nombre_destino text default null,
    p_cancelar       boolean default false,
    p_hecho_por      text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $ajustar$
declare
    v_m record;
begin
    perform panel_exigir_rol(array['ti']);
    select * into v_m from zk_movimientos where id = p_movimiento for update;
    if v_m.id is null then
        raise exception 'Ese movimiento ya no existe. Vuelva a abrir la pantalla.';
    end if;
    if v_m.estado not in ('pendiente', 'no_coincide') then
        raise exception 'Solo se ajusta un movimiento que no esta en una tanda.';
    end if;
    if coalesce(p_cancelar, false) then
        update zk_movimientos set estado = 'cancelado', actualizado_en = now(),
               detalle = 'Cancelado por ' || coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI')
         where id = p_movimiento;
        return jsonb_build_object('id', p_movimiento, 'estado', 'cancelado');
    end if;
    if v_m.que = 'departamento' then
        if not exists (select 1 from zk_departamentos where id = p_depto_destino) then
            raise exception 'Elija un departamento de ZK de la lista.';
        end if;
        update zk_movimientos set depto_destino = p_depto_destino, actualizado_en = now() where id = p_movimiento;
    else
        if coalesce(btrim(p_nombre_destino), '') = '' then
            raise exception 'Escriba el nombre como debe quedar en ZK.';
        end if;
        update zk_movimientos set nombre_destino = left(btrim(p_nombre_destino), 200), actualizado_en = now() where id = p_movimiento;
    end if;
    return jsonb_build_object('id', p_movimiento, 'estado', v_m.estado);
end;
$ajustar$;


-- 5.3b Registrar o corregir un departamento de ZK (Empleado_PPF cuando exista,
-- un renumerado). El numero es el «ID de Departamento» de ZK.
create function guardar_departamento_zk(p_id text, p_nombre text, p_niveles text[], p_hecho_por text default null) returns jsonb
language plpgsql security definer set search_path = public
as $depto$
begin
    perform panel_exigir_rol(array['ti']);
    if coalesce(btrim(p_id), '') !~ '^[0-9]+$' then
        raise exception 'El numero de departamento es el «ID de Departamento» de ZK: solo digitos.';
    end if;
    if coalesce(btrim(p_nombre), '') = '' then
        raise exception 'Escriba el nombre del departamento como aparece en ZK.';
    end if;
    if p_niveles is null or not (p_niveles <@ array['E1', 'E2']) then
        raise exception 'Los niveles solo pueden ser E1 (ESTACIONAMIENTO 1) y E2 (ESTACIONAMIENTO 2).';
    end if;
    insert into zk_departamentos (id, nombre, niveles)
    values (btrim(p_id), btrim(p_nombre), array(select distinct x from unnest(p_niveles) x order by 1))
    on conflict (id) do update set nombre = excluded.nombre, niveles = excluded.niveles, actualizado_en = now();
    return jsonb_build_object('id', btrim(p_id), 'nombre', btrim(p_nombre));
end;
$depto$;


-- 5.4 Abrir una tanda con los movimientos elegidos. Devuelve los pasos y los
-- renglones para el archivo de importacion (el cliente lo arma).
create function crear_tanda_zk(p_movimientos uuid[], p_hecho_por text default null) returns jsonb
language plpgsql security definer set search_path = public
as $tanda$
declare
    v_quien   text;
    v_n       int;
    v_sin_id  text[];
    v_pasos   jsonb;
    v_tanda   uuid;
    v_numero  int;
    v_abierta int;
begin
    perform panel_exigir_rol(array['ti']);
    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    if p_movimientos is null or cardinality(p_movimientos) = 0 then
        raise exception 'Elija al menos un movimiento.';
    end if;
    select numero into v_abierta from zk_tandas where estado = 'abierta';
    if v_abierta is not null then
        raise exception 'La tanda % sigue abierta: terminela o cancelela antes de armar otra.', v_abierta;
    end if;
    select count(*) into v_n from zk_movimientos
     where id = any (p_movimientos) and estado in ('pendiente', 'no_coincide');
    if v_n <> cardinality(p_movimientos) then
        raise exception 'Alguno de los movimientos ya no esta pendiente. Vuelva a abrir la pantalla.';
    end if;
    -- Un TAG con dos destinos (dos casos que piden cosas distintas) lo decide TI.
    select array_agg(distinct tarjeta) into v_sin_id from (
        select tarjeta from zk_movimientos where id = any (p_movimientos) group by tarjeta, que having count(*) > 1) x;
    if v_sin_id is not null then
        raise exception 'El TAG % tiene dos movimientos de la misma clase en la seleccion. Deje uno (ajuste o cancele el otro).',
            array_to_string(v_sin_id, ', ');
    end if;
    -- Sin el ID de ZK el import crearia a otra persona con la misma tarjeta.
    select array_agg(m.tarjeta order by m.tarjeta) into v_sin_id
      from zk_movimientos m
      left join zk_padron p on p.tarjeta = m.tarjeta and p.vigente
     where m.id = any (p_movimientos) and coalesce(p.id_zk, '') = '';
    if v_sin_id is not null then
        raise exception 'SATAG no conoce el ID de ZK de % TAG(s) (%). Suba primero el export de Usuarios de ZK en Archivos de ZK.',
            cardinality(v_sin_id), array_to_string(v_sin_id[1:5], ', ');
    end if;

    -- Los pasos: importar, y uno por cada departamento destino segun tenga niveles o no.
    select jsonb_build_array(jsonb_build_object(
               'clave', 'importar', 'hecho', false,
               'texto', 'Importar el archivo de esta tanda en ZK: Personal › Usuarios › Importar, «Fila de inicio» 2 y «Actualizar el ID de usuario existente» Sí. Debe decir Correctos ' || cardinality(p_movimientos)::text || ' o menos (un renglón por TAG) y Fallidos 0.'))
           || coalesce(jsonb_agg(jsonb_build_object(
               'clave', 'niveles:' || d.id, 'hecho', false,
               'texto', case when cardinality(d.niveles) = 0 then
                   d.nombre || ': en Acceso › Por Departamento, agregarle todos los niveles (ESTACIONAMIENTO 1 y 2), guardar, y quitárselos, guardar. De corrido y fuera de las horas de entrada y salida: mientras tanto, todos los de ' || d.nombre || ' abren.'
                 else
                   d.nombre || ': en Acceso › Por Departamento, quitar y volver a poner sus niveles (' ||
                   array_to_string(array(select 'ESTACIONAMIENTO ' || substr(x, 2) from unnest(d.niveles) x order by 1), ' y ') ||
                   '). Ojo: también se los devuelve a quien se los hubieran quitado a mano en ese departamento.'
                 end) order by d.nombre), '[]'::jsonb)
      into v_pasos
      from zk_departamentos d
     where d.id in (select depto_destino from zk_movimientos where id = any (p_movimientos) and que = 'departamento');

    insert into zk_tandas (pasos, creada_por) values (v_pasos, v_quien) returning id, numero into v_tanda, v_numero;
    update zk_movimientos set estado = 'en_tanda', tanda_id = v_tanda, actualizado_en = now(), detalle = ''
     where id = any (p_movimientos);

    return jsonb_build_object(
        'tanda', v_tanda, 'numero', v_numero, 'pasos', v_pasos,
        'renglones', (
            select coalesce(jsonb_agg(jsonb_build_object(
                       'tarjeta', p.tarjeta, 'idZk', p.id_zk, 'nombres', p.nombres, 'apellidos', p.apellidos,
                       'placa', p.placa,
                       'deptoId', coalesce(d.id, p.departamento_id), 'deptoNombre', coalesce(d.nombre, p.departamento),
                       'nombreDestino', n.nombre_destino) order by p.tarjeta), '[]'::jsonb)
              from (select distinct tarjeta from zk_movimientos where id = any (p_movimientos)) t
              join zk_padron p on p.tarjeta = t.tarjeta and p.vigente
              left join zk_movimientos md on md.id = any (p_movimientos) and md.tarjeta = t.tarjeta and md.que = 'departamento'
              left join zk_departamentos d on d.id = md.depto_destino
              left join zk_movimientos n on n.id = any (p_movimientos) and n.tarjeta = t.tarjeta and n.que = 'nombre'));
end;
$tanda$;


-- 5.5 Palomear (o despalomear) un paso. Con el ultimo, la tanda queda hecha y
-- sus casos se cierran con «Hecho en ZK».
create function marcar_paso_tanda_zk(p_tanda uuid, p_clave text, p_hecho boolean, p_hecho_por text default null) returns jsonb
language plpgsql security definer set search_path = public
as $paso$
declare
    v_quien  text;
    v_t      record;
    v_pasos  jsonb;
    v_todos  boolean;
    r        record;
begin
    perform panel_exigir_rol(array['ti']);
    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');
    select * into v_t from zk_tandas where id = p_tanda for update;
    if v_t.id is null or v_t.estado <> 'abierta' then
        raise exception 'Esa tanda ya no esta abierta. Vuelva a abrir la pantalla.';
    end if;
    if not exists (select 1 from jsonb_array_elements(v_t.pasos) e where e ->> 'clave' = p_clave) then
        raise exception 'Ese paso no es de esta tanda.';
    end if;

    select jsonb_agg(case when e ->> 'clave' = p_clave
                          then e || jsonb_build_object('hecho', coalesce(p_hecho, false),
                                                       'hechoPor', case when p_hecho then v_quien end,
                                                       'hechoEn', case when p_hecho then now() end)
                          else e end order by i)
      into v_pasos
      from jsonb_array_elements(v_t.pasos) with ordinality as x(e, i);
    select bool_and(coalesce((e ->> 'hecho')::boolean, false)) into v_todos from jsonb_array_elements(v_pasos) e;

    if not v_todos then
        update zk_tandas set pasos = v_pasos where id = p_tanda;
        return jsonb_build_object('tanda', p_tanda, 'hecha', false);
    end if;

    update zk_tandas set pasos = v_pasos, estado = 'hecha', hecha_por = v_quien, hecha_en = now() where id = p_tanda;
    update zk_movimientos set estado = 'hecho', actualizado_en = now(),
           detalle = 'Hecho en ZK (tanda ' || v_t.numero || '); falta que los archivos de ZK lo confirmen.'
     where tanda_id = p_tanda and estado = 'en_tanda';
    for r in
        select m.caso_id,
               string_agg(case when m.que = 'departamento' then 'movido a ' || d.nombre
                               else 'nombre corregido a «' || m.nombre_destino || '»' end, ' y ' order by m.que) as que
          from zk_movimientos m left join zk_departamentos d on d.id = m.depto_destino
         where m.tanda_id = p_tanda
         group by m.caso_id
    loop
        perform zk_cerrar_caso(r.caso_id, 'Hecho en ZK', 'Tanda ' || v_t.numero || ': ' || r.que, v_quien);
    end loop;
    return jsonb_build_object('tanda', p_tanda, 'hecha', true);
end;
$paso$;


-- 5.6 Cancelar una tanda abierta: sus movimientos vuelven a pendientes.
create function cancelar_tanda_zk(p_tanda uuid, p_hecho_por text default null) returns jsonb
language plpgsql security definer set search_path = public
as $cancelar$
declare v_n int;
begin
    perform panel_exigir_rol(array['ti']);
    update zk_tandas set estado = 'cancelada' where id = p_tanda and estado = 'abierta';
    if not found then
        raise exception 'Esa tanda ya no esta abierta. Vuelva a abrir la pantalla.';
    end if;
    update zk_movimientos set estado = 'pendiente', tanda_id = null, actualizado_en = now(), detalle = ''
     where tanda_id = p_tanda and estado = 'en_tanda';
    get diagnostics v_n = row_count;
    return jsonb_build_object('tanda', p_tanda, 'regresados', v_n);
end;
$cancelar$;


-- 5.7 Comprobar contra lo ultimo que se cargo de ZK. Se llama despues de cada
-- carga de Usuarios o de puertas; se puede repetir.
--   Un movimiento de departamento cuadra si la persona esta en el destino y sus
--   puertas son las del destino (sin niveles: ninguna; con niveles: al menos
--   esas). Uno de nombre cuadra si ZK ya dice ese nombre.
--   Si cuadra: verificado, y su caso se cierra (o se queda cerrado).
--   Si no cuadra y los archivos son posteriores a la tanda: no_coincide, y su
--   caso se reabre con el motivo. Lo pendiente que ya cuadra: «ZK ya lo refleja».
create function verificar_movimientos_zk(p_hecho_por text default null) returns jsonb
language plpgsql security definer set search_path = public
as $verificar$
declare
    v_quien     text;
    v_pad       record;
    v_pue_exp   timestamp;
    v_pue_n     int;
    v_cuando    text;
    r           record;
    v_lotes     text[];
    v_ok_depto  boolean;
    v_ok_puerta boolean;
    v_ok        boolean;
    v_fresco    boolean;
    -- Que archivo hace falta que sea nuevo para decir «no coincide»: el padron
    -- si falla el departamento o el nombre; las puertas si fallan las puertas.
    v_por_puerta boolean;
    v_motivo    text;
    v_ver       int := 0;
    v_ya        int := 0;
    v_no        int := 0;
    v_espera    int := 0;
begin
    perform panel_exigir_rol(array['ti']);
    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    select exportado_en, cargado_en into v_pad from zk_padron_cargas order by cargado_en desc limit 1;
    -- Las cuatro puertas: la hora del export mas viejo de los cuatro ultimos.
    select count(*), min(exp) into v_pue_n, v_pue_exp
      from (select distinct on (puerta) puerta, exportado_en as exp
              from zk_puertas_cargas order by puerta, cargado_en desc) u;
    v_cuando := 'Usuarios del ' || coalesce(to_char(v_pad.exportado_en, 'DD/MM HH24:MI'), '—')
             || case when v_pue_n = 4 then ' y Personal de Apertura del ' || coalesce(to_char(v_pue_exp, 'DD/MM HH24:MI'), '—') else '' end;

    for r in
        select m.*, t.hecha_en, t.numero as tanda_numero, d.nombre as depto_nombre, d.niveles,
               p.departamento_id as p_depto, p.departamento as p_depto_nombre, p.id_zk, p.vigente as p_vigente,
               zk_texto_comparable(concat_ws(' ', nullif(p.nombres, ''), nullif(p.apellidos, ''))) as p_nombre
          from zk_movimientos m
          left join zk_tandas t on t.id = m.tanda_id
          left join zk_departamentos d on d.id = m.depto_destino
          left join zk_padron p on p.tarjeta = m.tarjeta
         where m.estado in ('pendiente', 'hecho', 'no_coincide')
         for update of m
    loop
        v_ok_puerta := null;
        v_por_puerta := false;
        if r.p_vigente is not true then
            v_ok := false;
            v_motivo := 'El TAG ' || r.tarjeta || ' ya no esta en el padron de ZK';
        elsif r.que = 'nombre' then
            v_ok := r.p_nombre = zk_texto_comparable(r.nombre_destino);
            v_motivo := 'ZK todavia dice «' || coalesce(nullif(r.p_nombre, ''), 'sin nombre') || '»';
        else
            v_ok_depto := r.p_depto = r.depto_destino;
            if v_pue_n = 4 and r.id_zk <> '' then
                select coalesce(array_agg(l order by l), '{}') into v_lotes
                  from (select substr(puerta, 1, 2) l from zk_puertas where id_zk = r.id_zk
                         group by 1 having count(*) = 2) x;
                v_ok_puerta := case when cardinality(r.niveles) = 0 then cardinality(v_lotes) = 0
                                    else r.niveles <@ v_lotes end;
            end if;
            v_ok := v_ok_depto and coalesce(v_ok_puerta, false);
            v_por_puerta := v_ok_depto and v_ok_puerta is false;
            v_motivo := case
                when not v_ok_depto then 'ZK todavia lo tiene en «' || coalesce(r.p_depto_nombre, '?') || '»'
                when v_ok_puerta is null then null
                when cardinality(r.niveles) = 0 then 'Esta en ' || r.depto_nombre || ' pero todavia tiene puerta (' || array_to_string(v_lotes, ', ') || ')'
                else 'Esta en ' || r.depto_nombre || ' pero no tiene las puertas de ese departamento (' || array_to_string(r.niveles, ', ') || ')'
            end;
            -- Sin las cuatro puertas cargadas no se puede decir si quedo bien.
            if v_ok_depto and v_ok_puerta is null then
                if r.estado <> 'pendiente' then
                    update zk_movimientos set detalle = 'Ya esta en ' || r.depto_nombre || '; faltan los cuatro «Personal de Apertura» para comprobar las puertas.', actualizado_en = now()
                     where id = r.id;
                end if;
                v_espera := v_espera + 1;
                continue;
            end if;
        end if;

        if v_ok then
            update zk_movimientos set estado = 'verificado', verificado_en = now(), actualizado_en = now(),
                   detalle = case when r.estado = 'pendiente' then 'ZK ya lo refleja' else 'Verificado' end || ' con ' || v_cuando || '.'
             where id = r.id;
            if r.estado = 'pendiente' then
                perform zk_cerrar_caso(r.caso_id, 'ZK ya lo refleja', 'Comprobado con ' || v_cuando, v_quien);
                v_ya := v_ya + 1;
            else
                perform zk_cerrar_caso(r.caso_id, 'Hecho en ZK', 'Verificado con ' || v_cuando, v_quien);
                insert into casos_notas (caso_id, clase, nota, hecho_por)
                values (r.caso_id, 'nota', 'Verificado en ZK con ' || v_cuando || '.', v_quien);
                v_ver := v_ver + 1;
            end if;
            continue;
        end if;

        -- No cuadra. Solo cuenta si los archivos son de DESPUES de la tanda (con
        -- la hora de mas del reloj de ZK); lo pendiente simplemente sigue pendiente.
        if r.estado = 'pendiente' or v_motivo is null then
            continue;
        end if;
        v_fresco := case when v_por_puerta
            then v_pue_exp is not null and v_pue_exp - interval '1 hour' > (r.hecha_en at time zone 'America/Mexico_City')
            else v_pad.exportado_en is not null and v_pad.exportado_en - interval '1 hour' > (r.hecha_en at time zone 'America/Mexico_City')
        end;
        if not v_fresco then
            v_espera := v_espera + 1;
            continue;
        end if;
        if r.estado = 'hecho' then
            perform zk_reabrir_caso(r.caso_id, 'ZK no coincide con lo que se hizo en la tanda ' || r.tanda_numero || ': ' || v_motivo || ' (' || v_cuando || ').', v_quien);
            v_no := v_no + 1;
        end if;
        update zk_movimientos set estado = 'no_coincide', actualizado_en = now(),
               detalle = v_motivo || ' (' || v_cuando || ').'
         where id = r.id;
    end loop;

    return jsonb_build_object('verificados', v_ver, 'yaReflejados', v_ya, 'noCoinciden', v_no, 'porComprobar', v_espera,
                              'puertasCargadas', v_pue_n);
end;
$verificar$;

revoke all on function cargar_puertas_zk(text, jsonb, jsonb, text) from public, anon;
revoke all on function generar_movimientos_zk(text) from public, anon;
revoke all on function ajustar_movimiento_zk(uuid, text, text, boolean, text) from public, anon;
revoke all on function guardar_departamento_zk(text, text, text[], text) from public, anon;
revoke all on function crear_tanda_zk(uuid[], text) from public, anon;
revoke all on function marcar_paso_tanda_zk(uuid, text, boolean, text) from public, anon;
revoke all on function cancelar_tanda_zk(uuid, text) from public, anon;
revoke all on function verificar_movimientos_zk(text) from public, anon;
grant execute on function cargar_puertas_zk(text, jsonb, jsonb, text) to authenticated;
grant execute on function generar_movimientos_zk(text) to authenticated;
grant execute on function ajustar_movimiento_zk(uuid, text, text, boolean, text) to authenticated;
grant execute on function guardar_departamento_zk(text, text, text[], text) to authenticated;
grant execute on function crear_tanda_zk(uuid[], text) to authenticated;
grant execute on function marcar_paso_tanda_zk(uuid, text, boolean, text) to authenticated;
grant execute on function cancelar_tanda_zk(uuid, text) to authenticated;
grant execute on function verificar_movimientos_zk(text) to authenticated;


-- ---------------------------------------------------------------------
-- 6. RLS: leen ti, contador y super con MFA (como zk_padron); nadie escribe directo
-- ---------------------------------------------------------------------
alter table zk_departamentos  enable row level security;
alter table zk_puertas_cargas enable row level security;
alter table zk_puertas        enable row level security;
alter table zk_tandas         enable row level security;
alter table zk_movimientos    enable row level security;

create policy zk_departamentos_lectura on zk_departamentos for select to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2' and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'contador', 'super'));
create policy zk_puertas_cargas_lectura on zk_puertas_cargas for select to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2' and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'contador', 'super'));
create policy zk_puertas_lectura on zk_puertas for select to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2' and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'contador', 'super'));
create policy zk_tandas_lectura on zk_tandas for select to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2' and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'contador', 'super'));
create policy zk_movimientos_lectura on zk_movimientos for select to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2' and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'contador', 'super'));

revoke all on table zk_departamentos, zk_puertas_cargas, zk_puertas, zk_tandas, zk_movimientos from anon, public;
revoke insert, update, delete, truncate, references, trigger
    on table zk_departamentos, zk_puertas_cargas, zk_puertas, zk_tandas, zk_movimientos from authenticated;
grant select on table zk_departamentos, zk_puertas_cargas, zk_puertas, zk_tandas, zk_movimientos to authenticated;

notify pgrst, 'reload schema';

commit;


-- ---------------------------------------------------------------------
-- 7. VERIFICACION (solo lectura). Diez filas con ok = true.
-- ---------------------------------------------------------------------
select 1 as orden, 'existen las cinco tablas nuevas' as que,
       (select count(*) from pg_class where relnamespace = 'public'::regnamespace
         and relname in ('zk_departamentos', 'zk_puertas_cargas', 'zk_puertas', 'zk_tandas', 'zk_movimientos')) = 5 as ok
union all
select 2, 'las cinco tienen RLS y una politica de lectura con aal2',
       (select bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace
         and relname in ('zk_departamentos', 'zk_puertas_cargas', 'zk_puertas', 'zk_tandas', 'zk_movimientos'))
       and (select count(*) from pg_policies where tablename in ('zk_departamentos', 'zk_puertas_cargas', 'zk_puertas', 'zk_tandas', 'zk_movimientos')
             and cmd = 'SELECT' and qual like '%aal2%') = 5
union all
select 3, 'anon no las lee; authenticated solo lee',
       not has_table_privilege('anon', 'zk_movimientos', 'SELECT')
       and not has_table_privilege('anon', 'zk_puertas', 'SELECT')
       and has_table_privilege('authenticated', 'zk_movimientos', 'SELECT')
       and not has_table_privilege('authenticated', 'zk_movimientos', 'INSERT')
       and not has_table_privilege('authenticated', 'zk_puertas', 'DELETE')
union all
select 4, 'departamentos sembrados: 16, BAJAS sin niveles, Padres con E1 y E2, sin Empleado_PPF',
       (select count(*) from zk_departamentos) = 16
       and not exists (select 1 from zk_departamentos where id = '25')
       and (select niveles = '{}' from zk_departamentos where id = '10')
       and (select niveles = '{E1,E2}' from zk_departamentos where id = '19')
union all
select 5, 'zk_padron tiene id_zk',
       exists (select 1 from information_schema.columns where table_name = 'zk_padron' and column_name = 'id_zk')
union all
select 6, 'cargar_padron_zk guarda id_zk y conserva el freno, con una sola forma',
       (select count(*) from pg_proc where proname = 'cargar_padron_zk') = 1
       and (select prosrc like '%id_zk%' and prosrc like '%requiereConfirmacion%' and prosrc like '%nombres = excluded.nombres%'
              from pg_proc where proname = 'cargar_padron_zk')
union all
select 7, 'los ocho RPC existen, son security definer y anon no los ejecuta',
       (select count(*) from pg_proc where prosecdef and proname in ('cargar_puertas_zk', 'generar_movimientos_zk', 'ajustar_movimiento_zk',
             'guardar_departamento_zk', 'crear_tanda_zk', 'marcar_paso_tanda_zk', 'cancelar_tanda_zk', 'verificar_movimientos_zk')) = 8
       and not has_function_privilege('anon', 'crear_tanda_zk(uuid[], text)', 'EXECUTE')
       and not has_function_privilege('anon', 'verificar_movimientos_zk(text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'verificar_movimientos_zk(text)', 'EXECUTE')
union all
select 8, 'cerrar y reabrir casos no se exponen por la API',
       not has_function_privilege('authenticated', 'zk_cerrar_caso(uuid, text, text, text)', 'EXECUTE')
       and not has_function_privilege('authenticated', 'zk_reabrir_caso(uuid, text, text)', 'EXECUTE')
union all
select 9, 'una sola tanda abierta a la vez',
       exists (select 1 from pg_indexes where indexname = 'ux_zk_tandas_abierta')
union all
select 10, 'ningun mensaje tutea',
       (select bool_and(prosrc !~* '\m(tu|tus|elige|reintenta|verifica|sube|termina|cancela|escribe)\M') from pg_proc
         where proname in ('cargar_puertas_zk', 'generar_movimientos_zk', 'ajustar_movimiento_zk', 'guardar_departamento_zk', 'crear_tanda_zk',
                           'marcar_paso_tanda_zk', 'cancelar_tanda_zk', 'verificar_movimientos_zk'))
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). ANTES DE NADA: revierta el deploy del cliente que usa
-- estas tablas. Se pierden las tandas, los movimientos y las puertas cargadas
-- (los casos cerrados por una tanda se quedan cerrados, con su nota).
--
--   begin;
--   drop function if exists verificar_movimientos_zk(text);
--   drop function if exists cancelar_tanda_zk(uuid, text);
--   drop function if exists marcar_paso_tanda_zk(uuid, text, boolean, text);
--   drop function if exists crear_tanda_zk(uuid[], text);
--   drop function if exists ajustar_movimiento_zk(uuid, text, text, boolean, text);
--   drop function if exists guardar_departamento_zk(text, text, text[], text);
--   drop function if exists generar_movimientos_zk(text);
--   drop function if exists cargar_puertas_zk(text, jsonb, jsonb, text);
--   drop function if exists zk_reabrir_caso(uuid, text, text);
--   drop function if exists zk_cerrar_caso(uuid, text, text, text);
--   drop table if exists zk_movimientos;
--   drop table if exists zk_tandas;
--   drop table if exists zk_puertas;
--   drop table if exists zk_puertas_cargas;
--   -- cargar_padron_zk: volver a correr la seccion 2 de 86_altas_desde_zk.sql
--   -- (lineas 101-252), que la deja sin id_zk con la misma firma. Despues:
--   alter table zk_padron drop column if exists id_zk;
--   drop function if exists zk_texto_comparable(text);
--   drop table if exists zk_departamentos;
--   notify pgrst, 'reload schema';
--   commit;
-- ---------------------------------------------------------------------
