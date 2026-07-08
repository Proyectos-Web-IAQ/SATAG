-- =====================================================================
-- 01_estacionamientos.sql
-- Catalogo de estacionamientos disponibles para asignacion.
-- PII: no.
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

-- Auditoria esperada:
-- - anon/authenticated podran leer solo filas activas cuando se aplique RLS.
-- - solo personal autenticado/admin podra crear, editar o desactivar filas.
