-- El bucket de firmas y sus dos politicas.
--
-- POR QUE VA APARTE DEL VOLCADO. `supabase db dump --schema public` no trae
-- nada de `storage`: el bucket y sus politicas viven en otro esquema. Sin este
-- archivo, la base local diria que la firma manuscrita es visible para
-- cualquiera, y las pruebas de RLS darian un falso verde justo en el dato mas
-- sensible que guarda el sistema.
--
-- DE DONDE SALIO. Las dos politicas se copiaron de un volcado de PRODUCCION
-- (`--schema storage`), no de leer los bloques 20, 43, 48 y 71 en orden. Y menos
-- mal: esos bloques definen en algun momento `firmas_admin` y
-- `firmas_gestion_admin`, y produccion YA NO TIENE NINGUNA DE LAS DOS. Haberlas
-- reconstruido a mano habria dado permisos de escritura sobre las firmas que
-- produccion retiro.
--
-- El bucket si sale del bloque 20, que no ha cambiado: privado, 2 MB, PNG/JPEG.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('firmas', 'firmas', false, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

-- anon: SOLO subir. El titular sube su firma y no puede leerla de vuelta, que es
-- justo lo que se quiere: no la necesita y es un dato personal sensible.
drop policy if exists "firmas_subida_anon" on "storage"."objects";
CREATE POLICY "firmas_subida_anon" ON "storage"."objects" FOR INSERT TO "anon" WITH CHECK (("bucket_id" = 'firmas'::"text"));

-- Leerla: solo ti, contador y super, y solo con el segundo factor puesto. Es el
-- reparto que dejo el bloque 71 el 17-sep: Administracion ve el texto que dice
-- que la firma la consulta Sistemas, no el boton.
drop policy if exists "firmas_lectura_panel" on "storage"."objects";
CREATE POLICY "firmas_lectura_panel" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'firmas'::"text") AND (("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['ti'::"text", 'contador'::"text", 'super'::"text"]))));
