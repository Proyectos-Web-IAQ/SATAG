-- =====================================================================
-- 16_movimientos.sql
-- Bitacora del ciclo de vida del TAG por registro.
-- PII: posible/indirecta (hecho_por, motivo). Depende de: registros.
--
-- El RPC crear_registro escribe el movimiento 'alta'.
-- =====================================================================

create table if not exists movimientos (
    id                      uuid primary key default gen_random_uuid(),
    registro_id             uuid not null references registros(id) on delete cascade,
    tipo                    text not null,
    fecha                   date not null default current_date,
    no_dispositivo_anterior text,
    no_dispositivo_nuevo    text,
    motivo                  text,
    hecho_por               text,
    created_at              timestamptz not null default now(),
    constraint mov_tipo_valido
        check (tipo in ('alta','baja','reposicion','cambio','prueba','bloqueo','rectificacion'))
);

create index if not exists ix_movimientos_registro on movimientos (registro_id);

-- Auditoria esperada:
-- - anon: sin acceso (bloque 17/18). authenticated: administra (insert/select).
-- - El 'alta' lo escribe el RPC crear_registro; baja/reposicion/etc. las agrega TI/Admin.
-- - No se sobreescribe; cada evento es una fila nueva (historial).
