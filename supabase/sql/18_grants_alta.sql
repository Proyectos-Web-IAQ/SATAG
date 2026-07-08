-- =====================================================================
-- 18_grants_alta.sql
-- Grants de las tablas del alta con PII.
-- anon: sin acceso. authenticated: lectura de evidencia + admin de bitacora.
-- =====================================================================

-- aceptaciones: evidencia inmutable -> authenticated solo lectura.
grant select on aceptaciones to authenticated;

-- movimientos: bitacora operativa -> authenticated administra.
grant select, insert, update, delete on movimientos to authenticated;

-- anon queda intencionalmente SIN GRANT en ambas.
-- El alta publica pasa por crear_registro (SECURITY DEFINER), que corre como owner.
