-- =====================================================================
-- 09_rls_documentos.sql
-- RLS para documentos versionados sin PII.
-- =====================================================================

alter table reglamento_versiones enable row level security;
alter table aviso_versiones enable row level security;

drop policy if exists reglamento_lectura_vigente_anon on reglamento_versiones;
create policy reglamento_lectura_vigente_anon on reglamento_versiones
    for select to anon using (vigente = true);

drop policy if exists reglamento_lectura_vigente_auth on reglamento_versiones;
create policy reglamento_lectura_vigente_auth on reglamento_versiones
    for select to authenticated using (vigente = true);

drop policy if exists reglamento_admin on reglamento_versiones;
create policy reglamento_admin on reglamento_versiones
    for all to authenticated using (true) with check (true);

drop policy if exists aviso_lectura_vigente_anon on aviso_versiones;
create policy aviso_lectura_vigente_anon on aviso_versiones
    for select to anon using (vigente = true);

drop policy if exists aviso_lectura_vigente_auth on aviso_versiones;
create policy aviso_lectura_vigente_auth on aviso_versiones
    for select to authenticated using (vigente = true);

drop policy if exists aviso_admin on aviso_versiones;
create policy aviso_admin on aviso_versiones
    for all to authenticated using (true) with check (true);

-- Nota de auditoria:
-- Las politicas admin quedan amplias por ahora. Antes de produccion deben
-- cerrarse con roles finos para impedir cambios accidentales al texto legal.

