-- =====================================================================
-- 13_rls_registros.sql
-- RLS del expediente central. registros contiene PII.
-- =====================================================================

alter table registros enable row level security;

-- anon NO tiene politicas sobre registros: no puede leer ni escribir
-- directamente. El alta publica ocurre solo via RPC crear_registro
-- (SECURITY DEFINER), que corre con privilegios del owner.

-- MFA obligatorio: el personal interno solo accede al expediente con la sesion
-- en aal2 (contrasena + segundo factor TOTP). El nivel viaja en el JWT (claim
-- aal). Ver Desarrollo/07 - MFA (Autenticacion Multifactor).md.
drop policy if exists registros_admin on registros;
create policy registros_admin on registros
    for all to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2')
    with check ((auth.jwt() ->> 'aal') = 'aal2');

-- Nota de auditoria:
-- "authenticated" = personal interno por ahora. Antes de produccion,
-- separar roles finos Admin/TI y limitar lectura/escritura de PII.
-- El alta publica NO se ve afectada: crear_registro es SECURITY DEFINER y omite RLS.
--
-- El panel usa un rol (admin/ti/consulta) que HOY elige el propio usuario y se
-- guarda en user_metadata.rol. CUIDADO: RLS NO debe confiar en user_metadata,
-- porque el usuario lo edita con updateUser() (se pondria admin a si mismo).
-- Para politicas por rol usar una fuente confiable: app_metadata.rol (solo lo fija
-- un admin con service_role) o una tabla de perfiles protegida. Ejemplo con el
-- candado de admin, que viaja en el JWT y se lee sin join:
--   using ( (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','ti') )
-- Pendiente hasta que la capa real (lib/supabase/api.ts) reemplace al mock.
-- Ver: Desarrollo/04 - Seguridad, RLS y Privacidad.md
