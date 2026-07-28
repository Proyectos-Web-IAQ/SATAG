-- =====================================================================
-- 43_endurecer_catalogos_documentos_storage.sql
--
-- Cierra el pendiente que el bloque 30 dejo anotado: las politicas de
-- ESCRITURA de los bloques 05 (catalogos), 09 (documentos legales) y 20
-- (storage de firmas) aceptaban a CUALQUIER sesion "authenticated + aal2".
-- Es decir: un usuario con rol `ti` o `consulta` podia reescribir el texto
-- del reglamento o del aviso de privacidad, o borrar firmas.
--
-- A partir de aqui la escritura exige, ademas de aal2, un rol explicito en
-- app_metadata.rol (misma fuente de verdad que el bloque 30).
--
-- Reglas que NO cambian:
--   - Lectura publica de catalogos y del documento vigente (el formulario
--     anonimo y la pagina publica del aviso siguen funcionando).
--   - anon conserva insert-only en el bucket `firmas` (el alta sube su PNG).
--   - El owner/service_role sigue pasando por encima de RLS, asi que los
--     bloques 11/21/22/23 (seeds y publicacion de textos) no se ven afectados.
--
-- Idempotente: se puede reejecutar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Catalogos (bloque 05): mantiene el TAG operativo. Escribe admin/super.
-- ---------------------------------------------------------------------
drop policy if exists est_admin on estacionamientos;
create policy est_admin on estacionamientos
    for all to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','super')
    )
    with check (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','super')
    );

drop policy if exists marcas_admin on cat_marcas;
create policy marcas_admin on cat_marcas
    for all to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','super')
    )
    with check (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','super')
    );

drop policy if exists modelos_admin on cat_modelos;
create policy modelos_admin on cat_modelos
    for all to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','super')
    )
    with check (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','super')
    );

drop policy if exists colores_admin on cat_colores;
create policy colores_admin on cat_colores
    for all to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','super')
    )
    with check (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','super')
    );

-- ---------------------------------------------------------------------
-- 2) Documentos legales (bloque 09): reglamento y aviso.
--    El texto que sostiene el consentimiento firmado no debe poder
--    reescribirse desde el panel por un rol operativo.
-- ---------------------------------------------------------------------
drop policy if exists reglamento_admin on reglamento_versiones;
create policy reglamento_admin on reglamento_versiones
    for all to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','super')
    )
    with check (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','super')
    );

drop policy if exists aviso_admin on aviso_versiones;
create policy aviso_admin on aviso_versiones
    for all to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','super')
    )
    with check (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','super')
    );

-- ---------------------------------------------------------------------
-- 3) Storage de firmas (bloque 20). La firma es PII biometrica.
--    Se separa VER de GESTIONAR:
--      - admin / ti / super pueden LEER la evidencia (cotejo presencial).
--      - solo admin / super pueden escribir o borrar objetos del bucket.
--      - consulta (solo lectura del padron) NO accede a firmas.
--      - anon conserva su insert-only del bloque 20 (politica intacta).
-- ---------------------------------------------------------------------
drop policy if exists firmas_admin on storage.objects;

drop policy if exists firmas_lectura_panel on storage.objects;
create policy firmas_lectura_panel on storage.objects
    for select to authenticated
    using (
        bucket_id = 'firmas'
        and (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','ti','super')
    );

drop policy if exists firmas_gestion_admin on storage.objects;
create policy firmas_gestion_admin on storage.objects
    for all to authenticated
    using (
        bucket_id = 'firmas'
        and (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','super')
    )
    with check (
        bucket_id = 'firmas'
        and (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','super')
    );

-- =====================================================================
-- Auditoria esperada despues de aplicar este bloque
-- (casos P-09 y P-10 de Pruebas/01 - Matriz de Casos.md):
--
--   - anon sigue leyendo catalogos y el documento vigente.  -> OK
--   - anon sigue pudiendo subir su firma al alta.           -> OK
--   - anon NO lee firmas.                                   -> OK (sin cambio)
--   - Rol `ti`:      no escribe catalogos ni documentos; SI lee firmas.
--   - Rol `consulta`: no escribe nada; NO lee firmas.
--   - Rol `admin`/`super`: mantiene catalogos, documentos y firmas.
--   - Un authenticated sin rol: nada.
--
-- Comprobacion rapida (SQL Editor, como owner):
--   select tablename, policyname, cmd
--     from pg_policies
--    where tablename in ('estacionamientos','cat_marcas','cat_modelos',
--                        'cat_colores','reglamento_versiones','aviso_versiones')
--    order by tablename, policyname;
--
--   select policyname, cmd from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--    order by policyname;
-- =====================================================================
