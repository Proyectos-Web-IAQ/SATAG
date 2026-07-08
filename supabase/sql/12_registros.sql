-- =====================================================================
-- 12_registros.sql
-- Expediente central: usuario, gestionante, vehiculo, TAG, ciclo de vida.
-- PII: SI (LFPDPPP). Ver comentarios de columna y E6.
--
-- Datos personales separados:
--   usuario_nombres / usuario_apellido_paterno / usuario_apellido_materno
--   + usuario_nombre_completo GENERATED STORED para busqueda/visualizacion.
--   Igual para gestionante (NULL en nombres = mismo que el usuario).
--
-- Folio: identificador humano SATAG-###### que asigna el RPC crear_registro
--   (no es DEFAULT). La secuencia vive aqui para que exista antes del RPC.
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
    -- Gestionante coherente: o no hay gestionante (nombres NULL) o viene
    -- al menos nombres + apellido paterno.
    constraint reg_gestionante_completo
        check (
            gestionante_nombres is null
            or (
                btrim(gestionante_nombres) <> ''
                and gestionante_apellido_paterno is not null
                and btrim(gestionante_apellido_paterno) <> ''
            )
        ),
    -- Menor requiere gestionante padre/madre/tutor con nombre y apellido paterno.
    constraint reg_menor_requiere_gestionante
        check (
            usuario_es_menor = false
            or (
                gestionante_nombres is not null and btrim(gestionante_nombres) <> ''
                and gestionante_apellido_paterno is not null and btrim(gestionante_apellido_paterno) <> ''
                and gestionante_relacion in ('padre','madre','tutor')
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

-- Auditoria esperada:
-- - anon NO lee ni escribe directamente; el alta publica entra solo por
--   RPC crear_registro (SECURITY DEFINER), en el bloque de aceptaciones.
-- - authenticated (personal interno) administra por ahora; cerrar con roles
--   finos Admin/TI antes de produccion.
-- - usuario_nombre_completo / gestionante_nombre_completo son GENERATED STORED:
--   no se insertan ni se editan; se derivan de las partes.
-- - folio es NOT NULL sin DEFAULT: lo asigna crear_registro (SATAG-######).
--   Un insert directo (admin/pruebas) debe proporcionar folio.
