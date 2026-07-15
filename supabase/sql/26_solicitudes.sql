-- =====================================================================
-- 26_solicitudes.sql
-- Solicitudes del titular sobre un registro existente: actualizacion de
-- datos o baja. Alimentan los contadores de la pantalla TI.
-- PII: posible (detalle es texto libre del publico; atendida_por indirecta).
-- Depende de: registros.
--
-- IMPORTANTE: una solicitud es INERTE. No cambia el registro por si misma;
-- solo entra a la cola de TI. La baja/actualizacion real la ejecuta TI con
-- la persona presente (RPCs dar_baja / actualizar_registro, bloque 29), que
-- ademas marcan la solicitud como atendida (resolucion 'ejecutada').
--
-- Toda solicitud necesita una salida, o el contador de TI se queda pegado:
-- si resulta improcedente (ya aplicada, duplicada, spam), TI la cierra con
-- descartar_solicitud (bloque 29) -> resolucion 'descartada' + motivo.
--
-- Alta publica sin sesion: via RPC crear_solicitud (bloque 28), que exige
-- folio + placas (o No. de TAG) coincidentes. origen 'interno' queda
-- reservado para captura desde el panel (pendiente de UI).
-- =====================================================================

create table if not exists solicitudes (
    id                uuid primary key default gen_random_uuid(),
    registro_id       uuid not null references registros(id) on delete cascade,
    tipo              text not null,
    detalle           text not null,
    origen            text not null default 'publico',
    atendida          boolean not null default false,
    atendida_en       timestamptz,
    atendida_por      text,
    -- Como se cerro: 'ejecutada' (TI hizo el cambio) o 'descartada' (TI la
    -- cerro sin cambio: improcedente, duplicada, ya aplicada o spam).
    -- Sin esto, una solicitud atendida no dice si el cambio ocurrio o no.
    resolucion        text,
    motivo_resolucion text,
    created_at        timestamptz not null default now(),
    constraint sol_tipo_valido check (tipo in ('actualizacion','baja')),
    constraint sol_origen_valido check (origen in ('publico','interno')),
    constraint sol_detalle_no_vacio check (btrim(detalle) <> ''),
    constraint sol_detalle_max check (char_length(detalle) <= 500),
    constraint sol_atendida_coherente check (
        (not atendida and atendida_en is null and atendida_por is null)
        or (atendida and atendida_en is not null)
    ),
    constraint sol_resolucion_coherente check (
        (not atendida and resolucion is null and motivo_resolucion is null)
        or (atendida and resolucion in ('ejecutada','descartada'))
    ),
    constraint sol_motivo_resolucion_no_vacio
        check (motivo_resolucion is null or btrim(motivo_resolucion) <> '')
);

comment on column solicitudes.detalle is 'PII posible (texto libre capturado por el publico)';
comment on column solicitudes.atendida_por is 'PII indirecta: nombre del personal que atendio';
comment on column solicitudes.resolucion is 'Como se cerro: ejecutada | descartada. NULL mientras esta pendiente';
comment on column solicitudes.motivo_resolucion is 'Por que se descarto (obligatorio en descartar_solicitud)';

create index if not exists ix_solicitudes_registro on solicitudes (registro_id);

-- Anti-spam y contadores sanos: maximo UNA solicitud pendiente por tipo
-- por registro (el RPC traduce la violacion a un mensaje amable).
create unique index if not exists uq_solicitudes_pendiente_por_tipo
    on solicitudes (registro_id, tipo)
    where not atendida;

-- Auditoria esperada:
-- - anon: sin acceso directo; solo inserta via RPC crear_solicitud.
-- - authenticated: SOLO lectura (roles admin/ti/consulta, aal2). Atender ocurre
--   dentro de los RPCs de TI; no hay update directo desde la app.
