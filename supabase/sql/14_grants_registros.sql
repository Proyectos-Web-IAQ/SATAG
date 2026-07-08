-- =====================================================================
-- 14_grants_registros.sql
-- Grants del expediente central.
-- anon: sin acceso directo (solo RPC). authenticated: mantenimiento.
-- =====================================================================

grant select, insert, update, delete on registros to authenticated;

-- anon queda intencionalmente SIN GRANT sobre registros.
-- El alta publica pasa por crear_registro (SECURITY DEFINER), que no
-- depende de estos grants porque corre como owner.
