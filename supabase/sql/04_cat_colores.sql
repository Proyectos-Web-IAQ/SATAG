-- =====================================================================
-- 04_cat_colores.sql
-- Catalogo de colores vehiculares.
-- PII: no.
-- =====================================================================

create table if not exists cat_colores (
    id     uuid primary key default gen_random_uuid(),
    nombre text not null,
    constraint cat_colores_nombre_no_vacio check (btrim(nombre) <> ''),
    constraint cat_colores_nombre_sin_espacios check (nombre = btrim(nombre))
);

create unique index if not exists uq_cat_colores_nombre_normalizado
    on cat_colores (lower(nombre));

-- Auditoria esperada:
-- - anon/authenticated podran leer el catalogo.
-- - solo personal autenticado/admin podra mantener el catalogo.
-- - La opcion "Otro" vive en la UI; no se guarda como color del catalogo.
