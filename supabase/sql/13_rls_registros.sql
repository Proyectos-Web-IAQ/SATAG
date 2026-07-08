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
-- Ver: Desarrollo/04 - Seguridad, RLS y Privacidad.md
