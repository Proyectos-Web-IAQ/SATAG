-- =====================================================================
-- 05_rls_catalogos.sql
-- RLS para catalogos sin PII.
-- =====================================================================

alter table estacionamientos enable row level security;
alter table cat_marcas enable row level security;
alter table cat_modelos enable row level security;
alter table cat_colores enable row level security;

drop policy if exists est_lectura_publica on estacionamientos;
create policy est_lectura_publica on estacionamientos
    for select to anon, authenticated using (activo);

-- Escritura/gestion admin: solo con la sesion en aal2 (segundo factor). La
-- lectura publica de arriba no cambia. Ver Desarrollo/07 - MFA.
drop policy if exists est_admin on estacionamientos;
create policy est_admin on estacionamientos
    for all to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2')
    with check ((auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists marcas_lectura_publica on cat_marcas;
create policy marcas_lectura_publica on cat_marcas
    for select to anon, authenticated using (true);

drop policy if exists marcas_admin on cat_marcas;
create policy marcas_admin on cat_marcas
    for all to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2')
    with check ((auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists modelos_lectura_publica on cat_modelos;
create policy modelos_lectura_publica on cat_modelos
    for select to anon, authenticated using (true);

drop policy if exists modelos_admin on cat_modelos;
create policy modelos_admin on cat_modelos
    for all to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2')
    with check ((auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists colores_lectura_publica on cat_colores;
create policy colores_lectura_publica on cat_colores
    for select to anon, authenticated using (true);

drop policy if exists colores_admin on cat_colores;
create policy colores_admin on cat_colores
    for all to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2')
    with check ((auth.jwt() ->> 'aal') = 'aal2');

-- Nota de auditoria:
-- Estas politicas son equivalentes al corte actual de schema.sql.
-- Pendiente antes de produccion: reemplazar "authenticated puede mantener catalogos"
-- por roles finos de Administracion/TI cuando se defina el esquema de perfiles.

