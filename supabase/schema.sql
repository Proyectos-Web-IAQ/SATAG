-- =====================================================================
-- !!! ADVERTENCIA: RESPALDO HISTORICO - NO INSTALAR CON ESTE ARCHIVO !!!
--
-- Este monolitico quedo ATRASADO (corte ~9-jul-2026). NO contiene la capa
-- del panel: sin panel_exigir_rol, sin registrar_pago, sin roles finos
-- (app_metadata.rol), sin folios de recibo (bloque 32), sin CC-01
-- (apartar/usar TAG) ni SC-003 (buzon de notas).
--
-- Quien lo ejecute obtiene una base con RLS ancha (authenticated) y SIN los
-- RPCs del panel: insegura e incompleta.
--
-- FUENTE DE VERDAD: los bloques atomicos supabase/sql/00 -> 41, en el orden
-- del runbook supabase/sql/README.md (incluye el PASO 0 de roles).
-- =====================================================================
-- SATAG - schema.sql (E1 alineado con E6)
-- Sistema de Adquisicion de TAG Vehicular - IAQ
-- PostgreSQL / Supabase
--
-- Fuente canonica del modelo: Desarrollo/01 - Modelo de Datos y Base de Datos.md
-- Seguridad/privacidad:       Desarrollo/04 - Seguridad, RLS y Privacidad.md
-- Orden de ejecucion real:    supabase/sql/README.md (bloques 00 -> 41)
--
-- Convenciones: claves uuid, created_at timestamptz, versionado sin borrar,
-- RLS por rol, alta publica solo por RPC atomico, enums como CHECK.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Reset opcional - SOLO para proyecto de pruebas vacio.
-- ---------------------------------------------------------------------
-- drop table if exists solicitudes, movimientos, pagos, aceptaciones,
--   registro_estacionamientos, registros, aviso_versiones,
--   reglamento_versiones, estacionamientos, cat_modelos, cat_marcas,
--   cat_colores, error_logs cascade;
-- drop function if exists crear_registro cascade;
-- drop function if exists crear_solicitud cascade;


-- =====================================================================
-- 1) CATALOGOS Y DOCUMENTOS VERSIONADOS
-- =====================================================================

create table if not exists estacionamientos (
    id          uuid primary key default gen_random_uuid(),
    clave       text not null unique,
    descripcion text,
    activo      boolean not null default true,
    created_at  timestamptz not null default now(),
    constraint estacionamientos_clave_no_vacia check (btrim(clave) <> ''),
    constraint estacionamientos_clave_formato check (clave ~ '^E[0-9]+$')
);

create table if not exists cat_marcas (
    id     uuid primary key default gen_random_uuid(),
    nombre text not null,
    constraint cat_marcas_nombre_no_vacio check (btrim(nombre) <> ''),
    constraint cat_marcas_nombre_sin_espacios check (nombre = btrim(nombre))
);

create unique index if not exists uq_cat_marcas_nombre_normalizado
    on cat_marcas (lower(nombre));

create table if not exists cat_modelos (
    id       uuid primary key default gen_random_uuid(),
    marca_id uuid not null references cat_marcas(id),
    nombre   text not null,
    constraint cat_modelos_nombre_no_vacio check (btrim(nombre) <> ''),
    constraint cat_modelos_nombre_sin_espacios check (nombre = btrim(nombre))
);

create unique index if not exists uq_cat_modelos_marca_nombre_normalizado
    on cat_modelos (marca_id, lower(nombre));

create table if not exists cat_colores (
    id     uuid primary key default gen_random_uuid(),
    nombre text not null,
    constraint cat_colores_nombre_no_vacio check (btrim(nombre) <> ''),
    constraint cat_colores_nombre_sin_espacios check (nombre = btrim(nombre))
);

create unique index if not exists uq_cat_colores_nombre_normalizado
    on cat_colores (lower(nombre));

create table if not exists reglamento_versiones (
    id           uuid primary key default gen_random_uuid(),
    version      int not null unique,
    contenido    text not null,
    vigente      boolean not null default false,
    publicado_en timestamptz not null default now(),
    constraint reglamento_version_positiva check (version > 0),
    constraint reglamento_contenido_no_vacio check (btrim(contenido) <> '')
);

create unique index if not exists uq_reglamento_una_vigente
    on reglamento_versiones (vigente) where vigente;

create table if not exists aviso_versiones (
    id           uuid primary key default gen_random_uuid(),
    version      int not null unique,
    contenido    text not null,
    url_publica  text,
    vigente      boolean not null default false,
    publicado_en timestamptz not null default now(),
    constraint aviso_version_positiva check (version > 0),
    constraint aviso_contenido_no_vacio check (btrim(contenido) <> ''),
    constraint aviso_url_publica_no_vacia check (url_publica is null or btrim(url_publica) <> '')
);

create unique index if not exists uq_aviso_una_vigente
    on aviso_versiones (vigente) where vigente;


-- =====================================================================
-- 2) EXPEDIENTE CENTRAL
-- =====================================================================

-- Secuencia del folio publico. La consume crear_registro con nextval().
create sequence if not exists registros_folio_seq;

create table if not exists registros (
    id                             uuid primary key default gen_random_uuid(),
    folio                          text not null unique,

    -- Persona titular (datos personales separados).
    usuario_nombres                text not null,
    usuario_apellido_paterno       text not null,
    usuario_apellido_materno       text,
    usuario_nombre_completo        text generated always as (
        btrim(
            usuario_nombres || ' ' || usuario_apellido_paterno ||
            coalesce(' ' || usuario_apellido_materno, '')
        )
    ) stored,

    -- Gestionante (NULL en nombres = mismo que el usuario).
    gestionante_nombres            text,
    gestionante_apellido_paterno   text,
    gestionante_apellido_materno   text,
    gestionante_nombre_completo    text generated always as (
        case
            when gestionante_nombres is null then null
            else btrim(
                gestionante_nombres || ' ' ||
                coalesce(gestionante_apellido_paterno, '') ||
                coalesce(' ' || gestionante_apellido_materno, '')
            )
        end
    ) stored,
    gestionante_relacion           text,

    usuario_es_menor      boolean not null default false,
    tipo_usuario          text not null default 'padres',
    tipo_validado         boolean not null default false,
    tipo_validado_por     text,
    tipo_validado_en      timestamptz,

    -- Vehiculo.
    marca                 text not null,
    modelo                text not null,
    color                 text not null,
    placas                text,
    sin_placas            boolean not null default false,

    -- TAG.
    no_dispositivo        text,
    procedencia_tag       text not null default 'escuela',
    tag_apartado          boolean not null default false,
    tag_apartado_no       text,

    -- Ciclo de vida y privacidad.
    estado                text not null default 'pendiente',
    motivo_baja           text,
    fecha_baja            date,
    bloqueado_en          timestamptz,
    bloqueo_motivo        text,
    suprimir_despues_de   date,

    -- Fechas operativas.
    fecha_adquisicion     date,
    fecha_instalacion     date,
    instalado_por         text,

    observaciones         text,
    created_at            timestamptz not null default now(),

    constraint reg_folio_formato
        check (folio ~ '^SATAG-[0-9]{6,}$'),
    constraint reg_usuario_nombres_no_vacio
        check (btrim(usuario_nombres) <> ''),
    constraint reg_usuario_apellido_paterno_no_vacio
        check (btrim(usuario_apellido_paterno) <> ''),
    constraint reg_usuario_apellido_materno_no_vacio
        check (usuario_apellido_materno is null or btrim(usuario_apellido_materno) <> ''),
    constraint reg_gestionante_apellido_materno_no_vacio
        check (gestionante_apellido_materno is null or btrim(gestionante_apellido_materno) <> ''),
    constraint reg_tipo_usuario_valido
        check (tipo_usuario in ('maestro','padres','alumno','admin')),
    constraint reg_gestionante_relacion_valida
        check (gestionante_relacion is null or gestionante_relacion in ('padre','madre','tutor','otro')),
    constraint reg_gestionante_completo
        check (
            gestionante_nombres is null
            or (
                btrim(gestionante_nombres) <> ''
                and gestionante_apellido_paterno is not null
                and btrim(gestionante_apellido_paterno) <> ''
            )
        ),
    constraint reg_menor_requiere_gestionante
        check (
            usuario_es_menor = false or
            (
                gestionante_nombres is not null and btrim(gestionante_nombres) <> '' and
                gestionante_apellido_paterno is not null and btrim(gestionante_apellido_paterno) <> '' and
                gestionante_relacion in ('padre','madre','tutor')
            )
        ),
    constraint reg_procedencia_valida
        check (procedencia_tag in ('escuela','propio')),
    constraint reg_estado_valido
        check (estado in ('pendiente','activo','baja','bloqueado')),
    constraint reg_modelo_no_vacio
        check (btrim(modelo) <> ''),
    constraint reg_no_dispositivo_formato
        check (no_dispositivo is null or no_dispositivo ~ '^[0-9]{6,11}$'),
    constraint reg_tag_apartado_no_formato
        check (tag_apartado_no is null or tag_apartado_no ~ '^[0-9]{6,11}$'),
    constraint reg_placas_requeridas
        check ((placas is not null and btrim(placas) <> '') or sin_placas),
    constraint reg_baja_coherente
        check (estado <> 'baja' or (motivo_baja is not null and fecha_baja is not null)),
    constraint reg_bloqueo_coherente
        check (estado <> 'bloqueado' or (bloqueado_en is not null and bloqueo_motivo is not null))
);

comment on column registros.usuario_nombres is 'PII (LFPDPPP)';
comment on column registros.usuario_apellido_paterno is 'PII (LFPDPPP)';
comment on column registros.usuario_apellido_materno is 'PII (LFPDPPP). Opcional (titular con un solo apellido)';
comment on column registros.usuario_nombre_completo is 'PII (LFPDPPP). Columna GENERATED STORED para busqueda/visualizacion';
comment on column registros.gestionante_nombres is 'PII (LFPDPPP). NULL = mismo que el usuario';
comment on column registros.gestionante_apellido_paterno is 'PII (LFPDPPP)';
comment on column registros.gestionante_apellido_materno is 'PII (LFPDPPP). Opcional';
comment on column registros.gestionante_nombre_completo is 'PII (LFPDPPP). GENERATED STORED; NULL = mismo que el usuario';
comment on column registros.placas is 'PII (LFPDPPP)';
comment on column registros.observaciones is 'PII posible (LFPDPPP)';

create unique index if not exists uq_registros_no_dispositivo_activo
    on registros (no_dispositivo)
    where no_dispositivo is not null and estado <> 'baja';

create index if not exists ix_registros_estado on registros (estado);
create index if not exists ix_registros_no_dispositivo on registros (no_dispositivo);
create index if not exists ix_registros_placas on registros (upper(placas));
create index if not exists ix_registros_usuario_lower on registros (lower(usuario_nombre_completo));
create index if not exists ix_registros_suprimir_despues on registros (suprimir_despues_de);


-- =====================================================================
-- 3) ACCESO A ESTACIONAMIENTOS
-- =====================================================================

create table if not exists registro_estacionamientos (
    registro_id         uuid not null references registros(id) on delete cascade,
    estacionamiento_id  uuid not null references estacionamientos(id),
    created_at          timestamptz not null default now(),
    primary key (registro_id, estacionamiento_id)
);

create index if not exists ix_regest_estacionamiento
    on registro_estacionamientos (estacionamiento_id);


-- =====================================================================
-- 4) ACEPTACION DE REGLAMENTO + AVISO + FIRMA REFORZADA
-- =====================================================================

create table if not exists aceptaciones (
    id                    uuid primary key default gen_random_uuid(),
    registro_id           uuid not null unique references registros(id) on delete cascade,
    reglamento_version_id uuid not null references reglamento_versiones(id),
    aviso_version_id      uuid not null references aviso_versiones(id),
    firma_url             text not null,
    firma_imagen_sha256   text,
    firma_trazos          jsonb,
    firmante_nombre       text not null,
    firmante_rol          text not null default 'usuario',
    acepto_reglamento     boolean not null default true,
    acepto_privacidad     boolean not null default true,
    ip_origen             inet,
    user_agent            text,
    metadata              jsonb not null default '{}'::jsonb,
    hash_algoritmo        text not null default 'sha256',
    hash_documento        text not null,
    hash_payload          jsonb not null,
    sello_tiempo          timestamptz not null default now(),
    created_at            timestamptz not null default now(),
    constraint aceptaciones_firmante_rol_valido
        check (firmante_rol in ('usuario','padre','madre','tutor','otro')),
    constraint aceptaciones_hash_algoritmo_valido
        check (hash_algoritmo = 'sha256'),
    constraint aceptaciones_firma_imagen_sha256
        check (firma_imagen_sha256 is null or firma_imagen_sha256 ~ '^[0-9a-f]{64}$'),
    constraint aceptaciones_consentimiento_explicito
        check (acepto_reglamento and acepto_privacidad),
    constraint aceptaciones_hash_sha256
        check (hash_documento ~ '^[0-9a-f]{64}$')
);

comment on column aceptaciones.firma_url is 'PII (LFPDPPP). Ruta en Storage privado, NO publica';
comment on column aceptaciones.firma_imagen_sha256 is 'SHA-256 opcional del PNG de firma subido a Storage';
comment on column aceptaciones.firma_trazos is 'PII. Trazos usados solo como evidencia de firma';
comment on column aceptaciones.firmante_nombre is 'PII. Snapshot inmutable del firmante';
comment on column aceptaciones.ip_origen is 'PII posible. Capturar solo si el flujo lo obtiene de forma confiable';
comment on column aceptaciones.user_agent is 'Metadato tecnico de aceptacion';
comment on column aceptaciones.hash_payload is 'Paquete canonico firmado y usado para calcular hash_documento';


-- =====================================================================
-- 5) PAGOS
-- =====================================================================

create table if not exists pagos (
    id           uuid primary key default gen_random_uuid(),
    registro_id uuid not null references registros(id) on delete cascade,
    monto        numeric(10,2) not null default 100.00,
    metodo       text not null default 'efectivo',
    cobrado_por  text,
    fecha        date not null default current_date,
    created_at   timestamptz not null default now(),
    constraint pagos_metodo_valido check (metodo in ('efectivo')),
    constraint pagos_monto_no_negativo check (monto >= 0)
);

-- Decision 06-jul: por ahora el cobro no requiere folio, recibo ni corte especifico.


-- =====================================================================
-- 6) MOVIMIENTOS
-- =====================================================================

create table if not exists movimientos (
    id                      uuid primary key default gen_random_uuid(),
    registro_id             uuid not null references registros(id) on delete cascade,
    tipo                    text not null,
    fecha                   date not null default current_date,
    no_dispositivo_anterior text,
    no_dispositivo_nuevo    text,
    motivo                  text,
    hecho_por               text,
    created_at              timestamptz not null default now(),
    constraint mov_tipo_valido
        check (tipo in ('alta','baja','reposicion','cambio','prueba','bloqueo','rectificacion'))
);

create index if not exists ix_movimientos_registro on movimientos (registro_id);


-- =====================================================================
-- 7) SOLICITUDES: CAMBIO, BAJA, ARCO Y REVOCACION
-- =====================================================================

create table if not exists solicitudes (
    id                 uuid primary key default gen_random_uuid(),
    registro_id        uuid references registros(id) on delete set null,
    tipo               text not null,
    solicitante_nombre text not null,
    contacto           text,
    detalle            text,
    estado             text not null default 'pendiente',
    atendido_por       text,
    atendido_en        timestamptz,
    resolucion         text,
    created_at         timestamptz not null default now(),
    constraint solicitudes_tipo_valido
        check (tipo in (
            'cambio','baja',
            'arco_acceso','arco_rectificacion','arco_cancelacion','arco_oposicion',
            'revocacion'
        )),
    constraint solicitudes_estado_valido
        check (estado in ('pendiente','en_revision','atendida','rechazada','cancelada')),
    constraint solicitudes_atencion_coherente
        check (estado not in ('atendida','rechazada') or (atendido_por is not null and atendido_en is not null))
);

create index if not exists ix_solicitudes_registro on solicitudes (registro_id);
create index if not exists ix_solicitudes_estado on solicitudes (estado);

comment on column solicitudes.solicitante_nombre is 'PII (LFPDPPP)';
comment on column solicitudes.contacto is 'PII posible (LFPDPPP)';
comment on column solicitudes.detalle is 'PII posible (LFPDPPP)';


-- =====================================================================
-- 8) ERROR LOGS
-- =====================================================================

create table if not exists error_logs (
    id         uuid primary key default gen_random_uuid(),
    origen     text,
    mensaje    text,
    detalle    jsonb,
    created_at timestamptz not null default now()
);


-- =====================================================================
-- 9) RLS
-- =====================================================================

alter table estacionamientos enable row level security;
alter table cat_marcas enable row level security;
alter table cat_modelos enable row level security;
alter table cat_colores enable row level security;
alter table reglamento_versiones enable row level security;
alter table aviso_versiones enable row level security;
alter table registros enable row level security;
alter table registro_estacionamientos enable row level security;
alter table aceptaciones enable row level security;
alter table pagos enable row level security;
alter table movimientos enable row level security;
alter table solicitudes enable row level security;
alter table error_logs enable row level security;

create policy est_lectura_publica on estacionamientos
    for select to anon, authenticated using (activo);
create policy est_admin on estacionamientos
    for all to authenticated using (true) with check (true);

create policy marcas_lectura_publica on cat_marcas
    for select to anon, authenticated using (true);
create policy marcas_admin on cat_marcas
    for all to authenticated using (true) with check (true);

create policy modelos_lectura_publica on cat_modelos
    for select to anon, authenticated using (true);
create policy modelos_admin on cat_modelos
    for all to authenticated using (true) with check (true);

create policy colores_lectura_publica on cat_colores
    for select to anon, authenticated using (true);
create policy colores_admin on cat_colores
    for all to authenticated using (true) with check (true);

create policy reglamento_lectura_vigente_anon on reglamento_versiones
    for select to anon using (vigente = true);
create policy reglamento_lectura_vigente_auth on reglamento_versiones
    for select to authenticated using (vigente = true);
create policy reglamento_admin on reglamento_versiones
    for all to authenticated using (true) with check (true);

create policy aviso_lectura_vigente_anon on aviso_versiones
    for select to anon using (vigente = true);
create policy aviso_lectura_vigente_auth on aviso_versiones
    for select to authenticated using (vigente = true);
create policy aviso_admin on aviso_versiones
    for all to authenticated using (true) with check (true);

create policy registros_admin on registros
    for all to authenticated using (true) with check (true);
create policy regest_admin on registro_estacionamientos
    for all to authenticated using (true) with check (true);
-- aceptaciones: evidencia inmutable. authenticated solo lectura; la escribe el RPC (owner).
create policy aceptaciones_lectura_auth on aceptaciones
    for select to authenticated using (true);
create policy pagos_admin on pagos
    for all to authenticated using (true) with check (true);
create policy movimientos_admin on movimientos
    for all to authenticated using (true) with check (true);
create policy solicitudes_admin on solicitudes
    for all to authenticated using (true) with check (true);
create policy error_logs_admin on error_logs
    for all to authenticated using (true) with check (true);


-- =====================================================================
-- 10) GRANTS
-- =====================================================================

grant usage on schema public to anon, authenticated;

grant select on
    estacionamientos, cat_marcas, cat_modelos, cat_colores,
    reglamento_versiones, aviso_versiones
    to anon;

grant select, insert, update, delete on
    estacionamientos, cat_marcas, cat_modelos, cat_colores,
    reglamento_versiones, aviso_versiones,
    registros, registro_estacionamientos, pagos,
    movimientos, solicitudes, error_logs
    to authenticated;

grant select on aceptaciones to authenticated;


-- =====================================================================
-- 11) RPC crear_registro
-- =====================================================================

drop function if exists crear_registro(
    text, text, text, text, text, text, boolean, text, text, text,
    text, text, boolean, text, jsonb, text, text, uuid, uuid
);
drop function if exists crear_registro(
    text, text, text, text, text, text, boolean, text, text,
    text, text, boolean, text, jsonb, text, text, text, uuid, uuid
);
-- Firma previa a la separacion de nombres (usuario_nombre / gestionante_nombre).
drop function if exists crear_registro(
    text, text, text, text, text, text, boolean, text, text,
    text, text, boolean, text, jsonb, text, inet, text, jsonb, text, text, uuid, uuid
);

create or replace function crear_registro(
    p_usuario_nombres              text,
    p_usuario_apellido_paterno     text,
    p_tipo_usuario                 text,
    p_marca                        text,
    p_modelo                       text,
    p_color                        text,
    p_placas                       text,
    p_sin_placas                   boolean,
    p_firma_url                    text,
    p_usuario_apellido_materno     text default null,
    p_firmante_nombre              text default null,
    p_gestionante_nombres          text default null,
    p_gestionante_apellido_paterno text default null,
    p_gestionante_apellido_materno text default null,
    p_gestionante_relacion         text default null,
    p_usuario_es_menor             boolean default false,
    p_firmante_rol                 text default 'usuario',
    p_firma_trazos                 jsonb default null,
    p_firma_imagen_sha256          text default null,
    p_ip_origen                    inet default null,
    p_user_agent                   text default null,
    p_metadata                     jsonb default '{}'::jsonb,
    p_procedencia_tag              text default 'escuela',
    p_observaciones                text default null,
    p_reglamento_version_id        uuid default null,
    p_aviso_version_id             uuid default null
) returns jsonb
language plpgsql
security definer
-- extensions: en Supabase pgcrypto (digest) vive en el schema extensions.
set search_path = public, extensions
as $$
declare
    v_registro_id uuid;
    v_folio text;
    v_reglamento_version_id uuid;
    v_reglamento_version int;
    v_reglamento_contenido text;
    v_aviso_version_id uuid;
    v_aviso_version int;
    v_aviso_contenido text;
    v_usuario_nombre_completo text;
    v_gestionante_nombre_completo text;
    v_firmante_nombre text;
    v_firmante_rol text;
    v_sello_tiempo timestamptz := clock_timestamp();
    v_hash_payload jsonb;
    v_hash_documento text;
    v_headers json;
    v_xff text;
    v_ip_origen inet;
    v_user_agent text;
begin
    if p_reglamento_version_id is null then
        select id, version, contenido
          into v_reglamento_version_id, v_reglamento_version, v_reglamento_contenido
          from reglamento_versiones
         where vigente
         limit 1;
        if v_reglamento_version_id is null then
            raise exception 'No hay version de reglamento vigente';
        end if;
    else
        select id, version, contenido
          into v_reglamento_version_id, v_reglamento_version, v_reglamento_contenido
          from reglamento_versiones
         where id = p_reglamento_version_id;
        if v_reglamento_version_id is null then
            raise exception 'La version de reglamento indicada no existe';
        end if;
    end if;

    if p_aviso_version_id is null then
        select id, version, contenido
          into v_aviso_version_id, v_aviso_version, v_aviso_contenido
          from aviso_versiones
         where vigente
         limit 1;
        if v_aviso_version_id is null then
            raise exception 'No hay version de aviso de privacidad vigente';
        end if;
    else
        select id, version, contenido
          into v_aviso_version_id, v_aviso_version, v_aviso_contenido
          from aviso_versiones
         where id = p_aviso_version_id;
        if v_aviso_version_id is null then
            raise exception 'La version de aviso de privacidad indicada no existe';
        end if;
    end if;

    if coalesce(btrim(p_usuario_nombres),'') = '' then
        raise exception 'El nombre (usuario_nombres) es obligatorio';
    end if;
    if coalesce(btrim(p_usuario_apellido_paterno),'') = '' then
        raise exception 'El apellido paterno del usuario es obligatorio';
    end if;
    if p_tipo_usuario not in ('maestro','padres','alumno','admin') then
        raise exception 'tipo_usuario invalido: %', p_tipo_usuario;
    end if;
    if coalesce(btrim(p_modelo),'') = '' then
        raise exception 'El modelo del vehiculo es obligatorio';
    end if;
    if (p_placas is null or btrim(p_placas) = '') and not coalesce(p_sin_placas,false) then
        raise exception 'Debe capturar placas o marcar sin_placas';
    end if;
    if coalesce(btrim(p_firma_url),'') = '' then
        raise exception 'Falta la firma (firma_url)';
    end if;
    if p_firma_imagen_sha256 is not null and p_firma_imagen_sha256 !~ '^[0-9a-f]{64}$' then
        raise exception 'firma_imagen_sha256 debe ser SHA-256 en hexadecimal';
    end if;
    -- Gestionante presente si viene el nombre; en ese caso exige apellido paterno.
    if coalesce(btrim(p_gestionante_nombres),'') <> ''
       and coalesce(btrim(p_gestionante_apellido_paterno),'') = '' then
        raise exception 'El gestionante requiere apellido paterno';
    end if;
    if coalesce(p_usuario_es_menor,false) and (
        coalesce(btrim(p_gestionante_nombres),'') = '' or
        coalesce(btrim(p_gestionante_apellido_paterno),'') = '' or
        p_gestionante_relacion not in ('padre','madre','tutor')
    ) then
        raise exception 'Un usuario menor requiere gestionante padre, madre o tutor con nombre y apellido paterno';
    end if;

    v_usuario_nombre_completo := btrim(
        btrim(p_usuario_nombres) || ' ' || btrim(p_usuario_apellido_paterno) ||
        coalesce(' ' || nullif(btrim(coalesce(p_usuario_apellido_materno,'')), ''), '')
    );
    if coalesce(btrim(p_gestionante_nombres),'') = '' then
        v_gestionante_nombre_completo := null;
    else
        v_gestionante_nombre_completo := btrim(
            btrim(p_gestionante_nombres) ||
            coalesce(' ' || nullif(btrim(coalesce(p_gestionante_apellido_paterno,'')), ''), '') ||
            coalesce(' ' || nullif(btrim(coalesce(p_gestionante_apellido_materno,'')), ''), '')
        );
    end if;

    v_firmante_nombre := coalesce(nullif(btrim(coalesce(p_firmante_nombre,'')), ''), v_usuario_nombre_completo);
    v_firmante_rol := coalesce(p_firmante_rol, 'usuario');

    -- Captura confiable de IP y user-agent desde los headers de la peticion (server-side).
    -- Supabase/PostgREST exponen los headers en el setting request.headers.
    v_headers := nullif(current_setting('request.headers', true), '')::json;
    v_user_agent := coalesce(
        nullif(btrim(coalesce(v_headers ->> 'user-agent', '')), ''),
        nullif(btrim(coalesce(p_user_agent, '')), '')
    );
    v_xff := btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1));
    begin
        v_ip_origen := nullif(v_xff, '')::inet;   -- primer IP del x-forwarded-for
    exception when others then
        v_ip_origen := null;                      -- header malformado: no rompe el alta
    end;
    v_ip_origen := coalesce(v_ip_origen, p_ip_origen);

    -- Folio publico humano. Se asigna aqui (no como DEFAULT de la tabla).
    v_folio := 'SATAG-' || lpad(nextval('registros_folio_seq')::text, 6, '0');

    insert into registros (
        folio,
        usuario_nombres, usuario_apellido_paterno, usuario_apellido_materno,
        gestionante_nombres, gestionante_apellido_paterno, gestionante_apellido_materno,
        gestionante_relacion, usuario_es_menor,
        tipo_usuario, procedencia_tag, marca, modelo, color, placas, sin_placas,
        observaciones, estado
    ) values (
        v_folio,
        btrim(p_usuario_nombres),
        btrim(p_usuario_apellido_paterno),
        nullif(btrim(coalesce(p_usuario_apellido_materno,'')), ''),
        nullif(btrim(coalesce(p_gestionante_nombres,'')), ''),
        nullif(btrim(coalesce(p_gestionante_apellido_paterno,'')), ''),
        nullif(btrim(coalesce(p_gestionante_apellido_materno,'')), ''),
        nullif(btrim(coalesce(p_gestionante_relacion,'')), ''),
        coalesce(p_usuario_es_menor, false),
        p_tipo_usuario,
        coalesce(p_procedencia_tag,'escuela'),
        btrim(p_marca),
        btrim(p_modelo),
        btrim(p_color),
        nullif(btrim(coalesce(p_placas,'')), ''),
        coalesce(p_sin_placas, false),
        nullif(btrim(coalesce(p_observaciones,'')), ''),
        'pendiente'
    ) returning id into v_registro_id;

    v_hash_payload := jsonb_build_object(
        'schema', 'satag.acceptance.v1',
        'sello_tiempo', v_sello_tiempo,
        'reglamento', jsonb_build_object(
            'id', v_reglamento_version_id,
            'version', v_reglamento_version,
            'contenido_sha256', encode(digest(v_reglamento_contenido, 'sha256'), 'hex')
        ),
        'aviso_privacidad', jsonb_build_object(
            'id', v_aviso_version_id,
            'version', v_aviso_version,
            'contenido_sha256', encode(digest(v_aviso_contenido, 'sha256'), 'hex')
        ),
        'registro', jsonb_build_object(
            'id', v_registro_id,
            'folio', v_folio,
            'usuario_nombres', btrim(p_usuario_nombres),
            'usuario_apellido_paterno', btrim(p_usuario_apellido_paterno),
            'usuario_apellido_materno', nullif(btrim(coalesce(p_usuario_apellido_materno,'')), ''),
            'usuario_nombre_completo', v_usuario_nombre_completo,
            'gestionante_nombres', nullif(btrim(coalesce(p_gestionante_nombres,'')), ''),
            'gestionante_apellido_paterno', nullif(btrim(coalesce(p_gestionante_apellido_paterno,'')), ''),
            'gestionante_apellido_materno', nullif(btrim(coalesce(p_gestionante_apellido_materno,'')), ''),
            'gestionante_nombre_completo', v_gestionante_nombre_completo,
            'gestionante_relacion', nullif(btrim(coalesce(p_gestionante_relacion,'')), ''),
            'usuario_es_menor', coalesce(p_usuario_es_menor, false),
            'tipo_usuario', p_tipo_usuario,
            'marca', btrim(p_marca),
            'modelo', btrim(p_modelo),
            'color', btrim(p_color),
            'placas', nullif(btrim(coalesce(p_placas,'')), ''),
            'sin_placas', coalesce(p_sin_placas, false),
            'procedencia_tag', coalesce(p_procedencia_tag,'escuela')
        ),
        'firmante', jsonb_build_object(
            'nombre', v_firmante_nombre,
            'rol', v_firmante_rol
        ),
        'aceptacion', jsonb_build_object(
            'acepto_reglamento', true,
            'acepto_privacidad', true,
            'ip_origen', v_ip_origen,
            'user_agent', v_user_agent,
            'metadata', coalesce(p_metadata, '{}'::jsonb)
        ),
        'firma', jsonb_build_object(
            'ruta_storage', btrim(p_firma_url),
            'imagen_sha256', p_firma_imagen_sha256,
            'trazos', p_firma_trazos
        )
    );

    v_hash_documento := encode(digest(convert_to(v_hash_payload::text, 'UTF8'), 'sha256'), 'hex');

    insert into aceptaciones (
        registro_id, reglamento_version_id, aviso_version_id,
        firma_url, firma_imagen_sha256, firma_trazos,
        firmante_nombre, firmante_rol,
        acepto_reglamento, acepto_privacidad, ip_origen, user_agent, metadata,
        hash_algoritmo, hash_documento, hash_payload, sello_tiempo
    ) values (
        v_registro_id, v_reglamento_version_id, v_aviso_version_id,
        btrim(p_firma_url), p_firma_imagen_sha256, p_firma_trazos,
        v_firmante_nombre, v_firmante_rol,
        true, true, v_ip_origen, v_user_agent,
        coalesce(p_metadata, '{}'::jsonb),
        'sha256', v_hash_documento, v_hash_payload, v_sello_tiempo
    );

    insert into movimientos (registro_id, tipo, motivo, hecho_por)
    values (v_registro_id, 'alta', 'Alta por autoservicio', 'autoservicio');

    -- anon no puede leer registros (RLS): el RPC devuelve id + folio + estado.
    return jsonb_build_object(
        'id', v_registro_id,
        'folio', v_folio,
        'estado', 'pendiente'
    );
end;
$$;

revoke all on function crear_registro(
    text, text, text, text, text, text, text, boolean, text,
    text, text, text, text, text, text, boolean, text, jsonb, text, inet, text, jsonb, text, text, uuid, uuid
) from public;
grant execute on function crear_registro(
    text, text, text, text, text, text, text, boolean, text,
    text, text, text, text, text, text, boolean, text, jsonb, text, inet, text, jsonb, text, text, uuid, uuid
) to anon, authenticated;


-- =====================================================================
-- 12) RPC crear_solicitud
-- =====================================================================

create or replace function crear_solicitud(
    p_tipo               text,
    p_solicitante_nombre text,
    p_contacto           text default null,
    p_detalle            text default null,
    p_registro_id        uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_solicitud_id uuid;
begin
    if p_tipo not in (
        'cambio','baja',
        'arco_acceso','arco_rectificacion','arco_cancelacion','arco_oposicion',
        'revocacion'
    ) then
        raise exception 'tipo de solicitud invalido: %', p_tipo;
    end if;
    if coalesce(btrim(p_solicitante_nombre),'') = '' then
        raise exception 'El nombre del solicitante es obligatorio';
    end if;

    insert into solicitudes (registro_id, tipo, solicitante_nombre, contacto, detalle)
    values (
        p_registro_id,
        p_tipo,
        btrim(p_solicitante_nombre),
        nullif(btrim(coalesce(p_contacto,'')), ''),
        nullif(btrim(coalesce(p_detalle,'')), '')
    )
    returning id into v_solicitud_id;

    return v_solicitud_id;
end;
$$;

revoke all on function crear_solicitud(text, text, text, text, uuid) from public;
grant execute on function crear_solicitud(text, text, text, text, uuid) to anon, authenticated;


-- =====================================================================
-- 13) STORAGE
-- =====================================================================

-- Bucket privado + limites (anon puede subir: acotamos tamano y tipo).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('firmas', 'firmas', false, 2097152, array['image/png','image/jpeg'])
on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists firmas_subida_anon on storage.objects;
create policy firmas_subida_anon on storage.objects
    for insert to anon with check (bucket_id = 'firmas');
drop policy if exists firmas_admin on storage.objects;
create policy firmas_admin on storage.objects
    for all to authenticated using (bucket_id = 'firmas') with check (bucket_id = 'firmas');

-- =====================================================================
-- Fin de schema.sql
-- =====================================================================
