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

-- Escritura del texto legal: solo con la sesion en aal2 (segundo factor). La
-- lectura de la version vigente no cambia. Ver Desarrollo/07 - MFA.
drop policy if exists reglamento_admin on reglamento_versiones;
create policy reglamento_admin on reglamento_versiones
    for all to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2')
    with check ((auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists aviso_lectura_vigente_anon on aviso_versiones;
create policy aviso_lectura_vigente_anon on aviso_versiones
    for select to anon using (vigente = true);

drop policy if exists aviso_lectura_vigente_auth on aviso_versiones;
create policy aviso_lectura_vigente_auth on aviso_versiones
    for select to authenticated using (vigente = true);

drop policy if exists aviso_admin on aviso_versiones;
create policy aviso_admin on aviso_versiones
    for all to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2')
    with check ((auth.jwt() ->> 'aal') = 'aal2');

-- Nota de auditoria:
-- Las politicas admin quedan amplias por ahora. Antes de produccion deben
-- cerrarse con roles finos para impedir cambios accidentales al texto legal.

