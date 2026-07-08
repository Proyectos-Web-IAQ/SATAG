-- =====================================================================
-- 03_cat_modelos.sql
-- Catalogo de modelos dependientes de marca.
-- PII: no.
-- =====================================================================

create table if not exists cat_modelos (
    id       uuid primary key default gen_random_uuid(),
    marca_id uuid not null references cat_marcas(id),
    nombre   text not null,
    constraint cat_modelos_nombre_no_vacio check (btrim(nombre) <> ''),
    constraint cat_modelos_nombre_sin_espacios check (nombre = btrim(nombre))
);

create unique index if not exists uq_cat_modelos_marca_nombre_normalizado
    on cat_modelos (marca_id, lower(nombre));

create index if not exists ix_cat_modelos_marca on cat_modelos (marca_id);

-- Auditoria esperada:
-- - anon/authenticated podran leer modelos para construir dropdown marca -> modelo.
-- - no se permite borrar una marca si tiene modelos asociados.
-- - solo personal autenticado/admin podra mantener el catalogo.
-- - La opcion "Otro" vive en la UI; no se guarda como modelo del catalogo.
