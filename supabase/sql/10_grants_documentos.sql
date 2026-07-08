-- =====================================================================
-- 10_grants_documentos.sql
-- Permisos SQL para documentos versionados.
-- =====================================================================

grant select on
    reglamento_versiones,
    aviso_versiones
to anon, authenticated;

grant select, insert, update, delete on
    reglamento_versiones,
    aviso_versiones
to authenticated;

