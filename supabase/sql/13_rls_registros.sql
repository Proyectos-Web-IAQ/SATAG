-- =====================================================================
-- 13_rls_registros.sql
-- RLS del expediente central. registros contiene PII.
-- =====================================================================

alter table registros enable row level security;

-- anon NO tiene politicas sobre registros: no puede leer ni escribir
-- directamente. El alta publica ocurre solo via RPC crear_registro
-- (SECURITY DEFINER), que corre con privilegios del owner.

drop policy if exists registros_admin on registros;
create policy registros_admin on registros
    for all to authenticated using (true) with check (true);

-- Nota de auditoria:
-- "authenticated" = personal interno por ahora. Antes de produccion,
-- separar roles finos Admin/TI y limitar lectura/escritura de PII.
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
