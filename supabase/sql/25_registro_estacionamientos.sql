-- =====================================================================
-- 25_registro_estacionamientos.sql
-- Asignacion de estacionamientos (E1/E2) por registro.
-- PII: no (la relacion con registros es por uuid).
-- Depende de: registros, estacionamientos.
--
-- La FK va contra estacionamientos.clave (unique) porque el contrato de la
-- app habla en claves ('E1','E2'); on update cascade por si una clave cambia.
-- =====================================================================

create table if not exists registro_estacionamientos (
    registro_id           uuid not null references registros(id) on delete cascade,
    estacionamiento_clave text not null references estacionamientos(clave) on update cascade,
    created_at            timestamptz not null default now(),
    primary key (registro_id, estacionamiento_clave)
);

create index if not exists ix_regest_clave on registro_estacionamientos (estacionamiento_clave);

-- Auditoria esperada:
-- - anon: sin acceso. authenticated: SOLO lectura (roles admin/ti/consulta, aal2).
-- - La escritura ocurre unicamente via RPC asignar_estacionamiento (SECURITY
--   DEFINER, rol ti por SC-002), que reemplaza la asignacion completa del
--   registro.
