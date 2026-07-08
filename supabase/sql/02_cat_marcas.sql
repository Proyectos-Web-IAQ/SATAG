-- =====================================================================
-- 02_cat_marcas.sql
-- Catalogo de marcas vehiculares.
-- PII: no.
-- =====================================================================

create table if not exists cat_marcas (
    id     uuid primary key default gen_random_uuid(),
    nombre text not null,
    constraint cat_marcas_nombre_no_vacio check (btrim(nombre) <> ''),
    constraint cat_marcas_nombre_sin_espacios check (nombre = btrim(nombre))
);

create unique index if not exists uq_cat_marcas_nombre_normalizado
    on cat_marcas (lower(nombre));

-- Auditoria esperada:
-- - anon/authenticated podran leer el catalogo.
-- - solo personal autenticado/admin podra mantener el catalogo.
-- - La opcion "Otro" vive en la UI; no se guarda como marca del catalogo.
