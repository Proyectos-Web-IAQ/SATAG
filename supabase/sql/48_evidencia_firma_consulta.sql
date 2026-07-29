-- =====================================================================
-- 48_evidencia_firma_consulta.sql
-- El rol `consulta` pasa a ver tambien la evidencia de firma.
--
-- POR QUE CAMBIA UNA DECISION QUE YA ESTABA TOMADA
--
-- El bloque 30 dejo `aceptaciones` en admin/super con esta razon: "es
-- evidencia legal con PII sensible y no es parte del ciclo de vida del TAG".
-- El bloque 43 le nego el bucket a `consulta` por lo mismo, y el bloque 47
-- amplio ambos a `ti` para el cotejo presencial, pero mantuvo la exclusion.
--
-- Se revierte esa exclusion a peticion de la Direccion de TI (29-jul-2026).
-- El argumento es el que el propio bloque 27 dejo escrito al definir el rol:
--
--     "La separacion real de 'consulta' no es que vea menos, es que no
--      escribe: no tiene policy de insert/update/delete ni pasa la guardia
--      de ningun RPC."
--
-- La firma era la unica excepcion a ese principio. Consulta es la pantalla
-- donde se investiga un expediente, y sin la evidencia esa investigacion
-- tenia un hueco: se podia ver todo el ciclo de vida del TAG menos la prueba
-- de que la persona acepto el reglamento y el aviso.
--
-- A partir de aqui el reparto es:
--
--     admin / ti / consulta / super  ->  LEEN la evidencia y la firma.
--     admin / super                  ->  ademas ESCRIBEN o borran del bucket.
--     anon                           ->  insert-only al bucket (el alta sube
--                                        su PNG y no puede leerlo de vuelta).
--
-- LO QUE ESTO IMPLICA, DICHO SIN ADORNOS
--
-- La RLS de PostgreSQL es por FILA, no por columna. Abrir `aceptaciones` a
-- `consulta` no le entrega solo la porcion probatoria: le entrega la fila
-- completa, y ahi viven `hash_payload` (un retrato completo del titular al
-- momento de firmar), `firma_trazos`, `ip_origen` y `user_agent`.
--
-- La vista `v_evidencia_firma` del bloque 47 sigue sin exponerlos, y es lo que
-- consume el panel, pero una consulta directa a la tabla si los alcanza. Es un
-- costo asumido de forma explicita, no un descuido: quedo registrado aqui,
-- en `Desarrollo/04 - Seguridad, RLS y Privacidad.md` y en el checklist E6.
--
-- Si mas adelante se quiere volver a acotar sin perder la pantalla, el camino
-- es un RPC de lectura con `panel_exigir_rol` (mismo patron que `estado_caja`)
-- que devuelva solo los campos probatorios y anule la ruta del PNG segun el
-- rol. Se evaluo hoy y se descarto a proposito: se prefirio que Consulta vea
-- exactamente lo mismo que Administracion y TI, sin medias tintas que despues
-- nadie recuerde por que estan.
--
-- Idempotente: se puede reejecutar.
-- Depende de: 15_aceptaciones.sql, 20_storage_firmas.sql,
--             43_endurecer_catalogos_documentos_storage.sql,
--             47_evidencia_firma_panel.sql.
-- Aplicar despues del bloque 47.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) La tabla de evidencia: los cuatro roles del panel la leen.
--    Sustituye la policy del bloque 47 (que era admin/ti/super).
-- ---------------------------------------------------------------------
drop policy if exists aceptaciones_lectura_panel on aceptaciones;
create policy aceptaciones_lectura_panel on aceptaciones
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin', 'ti', 'consulta', 'super')
    );

-- aceptaciones sigue SIN policy de insert/update/delete. La evidencia es
-- inmutable y solo la escribe crear_registro (SECURITY DEFINER, como owner).
-- Que `consulta` lea mas NO le da un solo permiso de escritura.

-- ---------------------------------------------------------------------
-- 2) El bucket: misma ampliacion, para que la tabla y el archivo no queden
--    desalineados. De nada sirve ver la ruta del PNG si no se puede abrir.
--    Sustituye firmas_lectura_panel del bloque 43 (que era admin/ti/super).
-- ---------------------------------------------------------------------
drop policy if exists firmas_lectura_panel on storage.objects;
create policy firmas_lectura_panel on storage.objects
    for select to authenticated
    using (
        bucket_id = 'firmas'
        and (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin', 'ti', 'consulta', 'super')
    );

-- firmas_gestion_admin (bloque 43) NO se toca: escribir y borrar objetos del
-- bucket sigue siendo de admin/super. `consulta` lee; no gestiona.
-- firmas_subida_anon (bloque 20) tampoco: el alta publica sigue pudiendo subir
-- su PNG sin poder leer nada de vuelta.

-- Sin cambios de esquema ni de funciones: no hace falta recargar PostgREST.

-- =====================================================================
-- Auditoria esperada (casos P-13 y E-10 de Pruebas/01 - Matriz de Casos.md):
--
-- - Rol consulta CON aal2: lee v_evidencia_firma y obtiene la URL firmada.
--   Ve la misma evidencia que admin y ti.
-- - Rol consulta: sigue SIN poder escribir o borrar en el bucket, y sin pasar
--   la guardia de ningun RPC del panel. Solo gano lectura.
-- - authenticated sin rol, o con rol pero sin aal2: cero filas y sin acceso al
--   bucket. Sin cambios.
-- - anon: sigue con insert-only en el bucket y sin acceso a aceptaciones.
--
-- Comprobacion rapida (SQL Editor, como owner):
--   select policyname, cmd from pg_policies
--    where tablename = 'aceptaciones';
--   -- aceptaciones_lectura_panel (select), y ninguna otra
--
--   select policyname, cmd from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--    order by policyname;
--   -- firmas_lectura_panel (select, 4 roles), firmas_gestion_admin (all,
--   -- admin/super) y firmas_subida_anon (insert, anon)
-- =====================================================================
