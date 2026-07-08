-- =====================================================================
-- 17_rls_alta.sql
-- RLS de las tablas del alta con PII: aceptaciones y movimientos.
-- =====================================================================

alter table aceptaciones enable row level security;
alter table movimientos  enable row level security;

-- aceptaciones: evidencia legal inmutable.
-- anon: sin policy (sin acceso). authenticated: SOLO lectura.
-- La escritura ocurre unicamente desde el RPC crear_registro (owner).
drop policy if exists aceptaciones_lectura_auth on aceptaciones;
create policy aceptaciones_lectura_auth on aceptaciones
    for select to authenticated using (true);

-- movimientos: bitacora operativa.
-- anon: sin policy (sin acceso). authenticated: lectura + escritura (TI/Admin).
drop policy if exists movimientos_admin on movimientos;
create policy movimientos_admin on movimientos
    for all to authenticated using (true) with check (true);

-- Nota de auditoria:
-- - anon no tiene policy en ninguna de las dos: no lee ni escribe.
-- - aceptaciones es solo SELECT para authenticated (inmutable); sin update/delete.
-- - Antes de produccion: separar roles finos Admin/TI.
--   Ver: Desarrollo/04 - Seguridad, RLS y Privacidad.md
