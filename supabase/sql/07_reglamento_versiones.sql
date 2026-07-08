-- =====================================================================
-- 07_reglamento_versiones.sql
-- Versiones del reglamento de acceso vehicular.
-- PII: no.
-- =====================================================================

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

-- Auditoria esperada:
-- - anon solo puede leer la version vigente.
-- - authenticated puede mantener versiones por ahora.
-- - Las aceptaciones futuras deben guardar reglamento_version_id como snapshot legal.

