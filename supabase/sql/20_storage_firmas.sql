-- =====================================================================
-- 20_storage_firmas.sql
-- Bucket privado para las firmas del alta. Usa el schema `storage` de Supabase.
--
-- Flujo: el formulario sube el PNG de la firma a este bucket y pasa la RUTA
-- al RPC crear_registro (aceptaciones.firma_url). La imagen NO va en la BD.
--
-- Nota: requiere Supabase (schema storage). No corre en un Postgres local pelon.
-- =====================================================================

-- Bucket privado + limites (anon puede subir: acotamos tamano y tipo).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('firmas', 'firmas', false, 2097152, array['image/png','image/jpeg'])
on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

-- anon: SOLO subir (insert) al bucket firmas. No lee, no lista, no borra.
drop policy if exists firmas_subida_anon on storage.objects;
create policy firmas_subida_anon on storage.objects
    for insert to anon with check (bucket_id = 'firmas');

-- authenticated (Admin/TI): acceso completo al bucket firmas (ver evidencia),
-- pero SOLO con la sesion en aal2 (segundo factor). La firma es PII.
-- Ver Desarrollo/07 - MFA (Autenticacion Multifactor).md.
drop policy if exists firmas_admin on storage.objects;
create policy firmas_admin on storage.objects
    for all to authenticated
    using (bucket_id = 'firmas' and (auth.jwt() ->> 'aal') = 'aal2')
    with check (bucket_id = 'firmas' and (auth.jwt() ->> 'aal') = 'aal2');

-- Auditoria esperada:
-- - Bucket privado: sin lectura por URL publica.
-- - anon insert-only: sube su firma pero no puede leerla de vuelta (no la necesita).
-- - authenticated: lee/gestiona firmas como evidencia.
-- - Limites: 2 MB y solo image/png|image/jpeg.
