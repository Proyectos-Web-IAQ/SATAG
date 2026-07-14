-- =====================================================================
-- 17_rls_alta.sql
-- RLS de las tablas del alta con PII: aceptaciones y movimientos.
-- =====================================================================

alter table aceptaciones enable row level security;
alter table movimientos  enable row level security;

-- MFA obligatorio en ambas: acceso solo con la sesion en aal2 (segundo factor).
-- El nivel viaja en el JWT (claim aal). Ver Desarrollo/07 - MFA.

-- aceptaciones: evidencia legal inmutable.
-- anon: sin policy (sin acceso). authenticated: SOLO lectura, y solo en aal2.
-- La escritura ocurre unicamente desde el RPC crear_registro (owner, omite RLS).
drop policy if exists aceptaciones_lectura_auth on aceptaciones;
create policy aceptaciones_lectura_auth on aceptaciones
    for select to authenticated using ((auth.jwt() ->> 'aal') = 'aal2');

-- movimientos: bitacora operativa.
-- anon: sin policy (sin acceso). authenticated: lectura + escritura (TI/Admin), solo en aal2.
drop policy if exists movimientos_admin on movimientos;
create policy movimientos_admin on movimientos
    for all to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2')
    with check ((auth.jwt() ->> 'aal') = 'aal2');

-- Nota de auditoria:
-- - anon no tiene policy en ninguna de las dos: no lee ni escribe.
-- - aceptaciones es solo SELECT para authenticated (inmutable); sin update/delete.
-- - Antes de produccion: separar roles finos Admin/TI.
--   Ver: Desarrollo/04 - Seguridad, RLS y Privacidad.md
