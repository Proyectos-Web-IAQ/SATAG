-- =====================================================================
-- 15_aceptaciones.sql
-- Evidencia de firma y aceptacion (reglamento + aviso + firma reforzada).
-- PII: SI (LFPDPPP). Evidencia inmutable; la escribe el RPC crear_registro.
--
-- Una aceptacion por registro (registro_id UNIQUE).
-- Depende de: registros, reglamento_versiones, aviso_versiones.
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
comment on column aceptaciones.hash_payload is 'Paquete canonico firmado y usado para calcular hash_documento. Contiene snapshot de PII';

-- Auditoria esperada:
-- - Se crea solo desde el RPC crear_registro (SECURITY DEFINER), como owner.
-- - anon: sin acceso (bloque 17/18). authenticated: solo SELECT (evidencia inmutable).
-- - registro_id UNIQUE: exactamente una aceptacion por registro.
-- - hash_documento verificable: encode(digest(convert_to(hash_payload::text,'UTF8'),'sha256'),'hex').
