-- =====================================================================
-- BLOQUE 78 — La bitacora de accesos del estacionamiento, persistida.
--
-- SC-031. Primer bloque de la pestana Estacionamiento.
--
-- POR QUE
--   Hoy la pestana mide el archivo que se acaba de subir y nada mas: cierra
--   el navegador y la medicion se va. Eso alcanza para una junta pero no para
--   decidir una baja ni para dimensionar el aforo, que piden serie. Y hay una
--   razon con fecha: el controlador guarda 100,000 transacciones y al llenarse
--   borra las 10,000 mas viejas. A ~40,000 filas por ventana son unos veinte
--   dias de capacidad. Lo que no se persista a tiempo se pierde del aparato.
--
-- LA DECISION QUE SOSTIENE TODO: `id_evento` ES LA LLAVE PRIMARIA
--   El export de ZK trae «ID de Evento», un entero creciente que el propio
--   controlador asigna. Usarlo de llave primaria hace que reimportar sea
--   inofensivo: lo que ya entro no entra dos veces. Y eso es lo que permite
--   que no haya un calendario que cumplir —se puede subir el export diario,
--   cada ocho dias, o dos veces el mismo archivo por equivocacion, y el
--   resultado es el mismo—. Sin esa llave habria que elegir una cadencia y
--   obedecerla, que es justo lo que no va a pasar en una escuela.
--
-- QUE SE GUARDA Y QUE NO
--   SOLO las filas con tarjeta: de 40,000 filas, ~9,600. Las otras 30,400 son
--   sondeo de estado de los equipos, sensores de puerta y aperturas con el
--   boton de salida; serian 1.4 M de renglones al ano en una instancia
--   `t4g.nano` para cero valor analitico. Lo que si se guarda de ellas es el
--   CONTEO, en `zk_importaciones`: una tasa de ruido que sube es una antena
--   que empieza a fallar.
--
--   `repeticion` se MARCA, no se filtra. El colapso de rafagas del lector usa
--   una ventana de dos minutos que algun dia habra que reajustar, y marcarla
--   permite rehacer el calculo sin volver a importar.
--
--   `departamento_evento` se guarda como HISTORIA y NUNCA se agrupa por el.
--   Es el departamento que la tarjeta tenia en ese instante: las instalaciones
--   del dia cruzan la pluma antes de que se suba el padron a ZK —que se sube
--   al cierre— asi que aparecen como STOCK SATAG aunque el coche sea de un
--   padre. El dueno se resuelve contra `registros` al momento de analizar.
--
-- POR QUE `ocurrio_en` NO LLEVA ZONA
--   Es la hora de pared del CONTROLADOR, no un instante universal: el propio
--   manual de ZK la describe como «record device trigger time». Guardarla como
--   `timestamptz` obligaria a suponer en que zona corre cada aparato —y son
--   dos, con horario de verano configurable por separado— para despues
--   volverla a convertir a hora local en cada consulta. Dos conversiones para
--   volver al mismo numero, con una suposicion en medio. Se guarda tal cual
--   llega y se dice que es hora local.
--
-- QUE NO CAMBIA
--   Ninguna tabla existente. Ninguna funcion existente. Este bloque solo
--   AGREGA, asi que va ANTES del deploy del cliente que lo usa.
--
-- QUE HACE, EN ORDEN
--   1. Guardia: aborta si alguna de las dos tablas ya existe con otra forma.
--   2. Crea `zk_importaciones` y `zk_eventos` con su RLS.
--   3. Crea `cargar_eventos_zk` (rol ti), que recibe la ventana y un lote de
--      filas. Funcion nueva -> solo notify, sin drop.
--   4. Verificacion de solo lectura: seis filas con ok = true.
--
-- Depende de: 00 (pgcrypto para gen_random_uuid), 29 (panel_exigir_rol).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. GUARDIA. Va primero: si aborta, no se aplico nada.
-- ---------------------------------------------------------------------
do $guardia$
declare
    v_n int;
begin
    -- Si las tablas ya existen, tienen que ser las de este bloque. Una tabla
    -- con el mismo nombre y otra forma significa que alguien aplico una
    -- version anterior, y seguir adelante dejaria columnas a medias.
    select count(*) into v_n
      from information_schema.tables
     where table_schema = 'public' and table_name = 'zk_eventos';

    if v_n > 0 then
        select count(*) into v_n
          from information_schema.columns
         where table_schema = 'public' and table_name = 'zk_eventos'
           and column_name in ('id_evento','importacion_id','ocurrio_en','lote','sentido',
                               'tarjeta','concedido','repeticion','departamento_evento');
        if v_n <> 9 then
            raise exception
                'zk_eventos ya existe pero no tiene las nueve columnas esperadas (tiene %). Revise que version se aplico. No se aplico nada.', v_n;
        end if;
    end if;

    select count(*) into v_n
      from information_schema.tables
     where table_schema = 'public' and table_name = 'zk_importaciones';

    if v_n > 0 then
        select count(*) into v_n
          from information_schema.columns
         where table_schema = 'public' and table_name = 'zk_importaciones'
           and column_name = 'sha256';
        if v_n <> 1 then
            raise exception
                'zk_importaciones ya existe sin la columna sha256, que es la que impide procesar dos veces el mismo archivo. No se aplico nada.';
        end if;
    end if;

    -- panel_exigir_rol tiene que existir: es la guardia de todos los RPC.
    select count(*) into v_n from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'panel_exigir_rol';
    if v_n = 0 then
        raise exception 'Falta panel_exigir_rol: aplique antes el bloque 29. No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. LAS TABLAS
-- ---------------------------------------------------------------------

-- Una fila por archivo procesado.
create table if not exists zk_importaciones (
    id                uuid primary key default gen_random_uuid(),
    archivo           text not null,
    -- El mismo archivo no se procesa dos veces. No es solo eficiencia: sin
    -- esto, `ventanas` contaria cuantas veces alguien subio algo en vez de
    -- cuantas ventanas distintas hay medidas, y esa cifra decide si el panel
    -- de bajas se puede encender.
    sha256            text not null unique,
    filas_archivo     integer not null,
    filas_con_tarjeta integer not null,
    -- 40,000 exactas significa que ZK corto: la ventana esta truncada y no se
    -- sabe cuanto falta. Se declara, no se adivina.
    tope_alcanzado    boolean not null default false,
    desde             timestamp,
    hasta             timestamp,
    -- Dias entre el ultimo evento de la importacion anterior y el primero de
    -- esta. Un hueco invalida toda afirmacion sobre uso por credencial.
    hueco_dias        numeric(7,2),
    importado_por     text not null,
    importado_en      timestamptz not null default now(),
    constraint zk_imp_archivo_no_vacio check (btrim(archivo) <> ''),
    constraint zk_imp_sha_formato      check (sha256 ~ '^[0-9a-f]{64}$'),
    constraint zk_imp_filas_coherentes check (filas_con_tarjeta <= filas_archivo),
    constraint zk_imp_ventana_coherente check (desde is null or hasta is null or desde <= hasta)
);

comment on table  zk_importaciones is 'Un renglon por export de eventos de ZK procesado (SC-031, bloque 78).';
comment on column zk_importaciones.sha256 is 'SHA-256 del archivo. UNIQUE: el mismo archivo no se procesa dos veces.';
comment on column zk_importaciones.tope_alcanzado is 'true si el archivo traia 40,000 filas exactas: ZK corto y la ventana esta truncada.';

-- Solo las filas con tarjeta. El ruido se cuenta arriba, no se guarda.
create table if not exists zk_eventos (
    id_evento           bigint primary key,
    importacion_id      uuid not null references zk_importaciones(id) on delete cascade,
    ocurrio_en          timestamp not null,
    lote                text not null,
    sentido             text not null,
    tarjeta             text not null,
    concedido           boolean not null,
    repeticion          boolean not null default false,
    departamento_evento text,
    constraint zk_ev_lote_formato   check (lote ~ '^E[0-9]+$'),
    constraint zk_ev_sentido_valido check (sentido in ('entrada','salida')),
    constraint zk_ev_tarjeta_formato check (tarjeta ~ '^[0-9]+$')
);

comment on table  zk_eventos is 'Accesos del estacionamiento con tarjeta (SC-031, bloque 78). PII indirecta: la tarjeta liga a una persona por registros.no_dispositivo.';
comment on column zk_eventos.id_evento is 'El «ID de Evento» del propio controlador. Llave primaria: reimportar una ventana traslapada es inofensivo.';
comment on column zk_eventos.ocurrio_en is 'Hora de PARED del controlador, sin zona. Ver el encabezado del bloque 78.';
comment on column zk_eventos.repeticion is 'Rafaga del lector: se marca, no se filtra, para poder reajustar la ventana de colapso sin reimportar.';
comment on column zk_eventos.departamento_evento is 'HISTORIA: el departamento de la tarjeta en ESE instante. NUNCA agrupar por el; el dueno se resuelve contra registros.';

create index if not exists ix_zk_eventos_ocurrio    on zk_eventos (ocurrio_en);
create index if not exists ix_zk_eventos_tarjeta    on zk_eventos (tarjeta);
create index if not exists ix_zk_eventos_importacion on zk_eventos (importacion_id);


-- ---------------------------------------------------------------------
-- 2. RLS. Lectura para quien opera y quien concilia; escritura solo por RPC.
-- ---------------------------------------------------------------------
alter table zk_importaciones enable row level security;
alter table zk_eventos       enable row level security;

drop policy if exists zk_importaciones_lectura_panel on zk_importaciones;
create policy zk_importaciones_lectura_panel on zk_importaciones
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti','contador','super')
    );

drop policy if exists zk_eventos_lectura_panel on zk_eventos;
create policy zk_eventos_lectura_panel on zk_eventos
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti','contador','super')
    );

-- Sin politica de escritura Y ademas sin el privilegio: todo write pasa por
-- el RPC `security definer`, que es el contrato del bloque 29.
revoke insert, update, delete on zk_importaciones from authenticated;
revoke insert, update, delete on zk_eventos       from authenticated;


-- ---------------------------------------------------------------------
-- 3. EL RPC DE CARGA
--
-- Recibe la ventana una vez y las filas por lotes. La primera llamada crea
-- el renglon de `zk_importaciones`; las siguientes lo encuentran por su
-- sha256 y cuelgan sus filas del mismo id. Asi una carga interrumpida queda
-- identificable y se puede reanudar, en vez de dejar media ventana sin dueno.
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
        desde, hasta, hueco_dias, importado_por
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
        v_quien
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
-- 4. VERIFICACION (solo lectura). `ok` en true en las seis filas.
-- ---------------------------------------------------------------------
select 1 as orden,
       'las dos tablas existen' as que,
       (select string_agg(table_name, ', ' order by table_name)
          from information_schema.tables
         where table_schema = 'public' and table_name in ('zk_importaciones','zk_eventos')) as valor,
       (select count(*) = 2
          from information_schema.tables
         where table_schema = 'public' and table_name in ('zk_importaciones','zk_eventos')) as ok
union all
select 2, 'id_evento es la llave primaria de zk_eventos',
       (select string_agg(a.attname, ', ')
          from pg_constraint c
          join pg_class t on t.oid = c.conrelid
          join pg_namespace n on n.oid = t.relnamespace
          join pg_attribute a on a.attrelid = t.oid and a.attnum = any (c.conkey)
         where n.nspname = 'public' and t.relname = 'zk_eventos' and c.contype = 'p'),
       (select count(*) = 1
          from pg_constraint c
          join pg_class t on t.oid = c.conrelid
          join pg_namespace n on n.oid = t.relnamespace
          join pg_attribute a on a.attrelid = t.oid and a.attnum = any (c.conkey)
         where n.nspname = 'public' and t.relname = 'zk_eventos'
           and c.contype = 'p' and a.attname = 'id_evento')
union all
select 3, 'el sha256 del archivo es unico',
       null,
       (select count(*) = 1
          from pg_constraint c
          join pg_class t on t.oid = c.conrelid
          join pg_namespace n on n.oid = t.relnamespace
          join pg_attribute a on a.attrelid = t.oid and a.attnum = any (c.conkey)
         where n.nspname = 'public' and t.relname = 'zk_importaciones'
           and c.contype = 'u' and a.attname = 'sha256')
union all
select 4, 'las dos tablas tienen RLS y una sola politica de lectura',
       (select string_agg(tablename || ':' || policyname, ', ' order by tablename)
          from pg_policies
         where schemaname = 'public' and tablename in ('zk_importaciones','zk_eventos')),
       (select count(*) = 2
          from pg_policies
         where schemaname = 'public' and tablename in ('zk_importaciones','zk_eventos')
           and cmd = 'SELECT')
       and (select bool_and(relrowsecurity)
              from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname in ('zk_importaciones','zk_eventos'))
union all
select 5, 'authenticated no puede escribir en ninguna de las dos',
       null,
       not exists (
           select 1 from information_schema.role_table_grants
            where table_schema = 'public'
              and table_name in ('zk_importaciones','zk_eventos')
              and grantee = 'authenticated'
              and privilege_type in ('INSERT','UPDATE','DELETE'))
union all
select 6, 'hay una sola forma de cargar_eventos_zk y es security definer',
       (select count(*)::text from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'cargar_eventos_zk'),
       (select count(*) = 1 and bool_and(p.prosecdef)
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'cargar_eventos_zk')
order by orden;


-- ---------------------------------------------------------------------
-- EN PANTALLA (no es opcional)
--   Con la cuenta de TI (rol ti, NO super: `panel_exigir_rol` hace return en
--   seco para super y no probaria nada), subir el export de eventos y
--   comprobar que:
--     1. La primera carga reporta `insertados` > 0.
--     2. Volver a subir EL MISMO archivo reporta `insertados` = 0 y no
--        duplica ningun renglon. Esa es la prueba del `id_evento`.
--     3. Con la cuenta de Consulta, la pestana no alcanza los eventos.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). En este orden: la funcion, luego las tablas.
--
--   drop function if exists cargar_eventos_zk(jsonb, jsonb, text);
--   drop table    if exists zk_eventos;        -- borra los eventos cargados
--   drop table    if exists zk_importaciones;
--   notify pgrst, 'reload schema';
--
-- PRECONDICION: comprobar primero cuanto se perderia, porque el controlador
-- ya pudo haber borrado esos eventos de su buffer circular y entonces el
-- rollback los pierde para siempre:
--
--   select count(*) as eventos, count(distinct importacion_id) as ventanas,
--          min(ocurrio_en) as desde, max(ocurrio_en) as hasta
--     from zk_eventos;
-- ---------------------------------------------------------------------
