-- =====================================================================
-- 08_aviso_versiones.sql
-- Versiones del aviso de privacidad SATAG.
-- PII: no guarda titulares; puede contener texto institucional.
-- =====================================================================

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

-- Auditoria esperada:
-- - anon solo puede leer la version vigente.
-- - authenticated puede mantener versiones por ahora.
-- - Las aceptaciones futuras deben guardar aviso_version_id como snapshot legal.
-- - El contenido definitivo queda pendiente de aprobacion Direccion/Legal.

