-- =====================================================================
-- 47_evidencia_firma_panel.sql
-- SC-008: ver la firma desde el panel, con URL firmada temporal.
--
-- Es lo unico que le faltaba a CC-12. Hasta hoy la evidencia de aceptacion
-- existia pero era INAUDITABLE desde la aplicacion: el bucket `firmas` es
-- privado, nadie emitia URLs firmadas y el panel ni siquiera consultaba la
-- tabla aceptaciones. Para cotejar una firma habia que entrar a Supabase.
--
-- ESTE BLOQUE HACE DOS COSAS
--
-- 1) Amplia la lectura de `aceptaciones` al rol `ti`. Es la decision que el
--    bloque 30 dejo anotada como abierta: "ampliar a 'ti' si su pantalla
--    llegara a mostrar la firma; hoy el panel no la consulta". Hoy si la
--    consulta. Queda igual que el bucket en el bloque 43:
--
--      admin / ti / super  ->  LEEN la evidencia (cotejo presencial).
--      consulta            ->  NO. La firma es evidencia legal con PII
--                              sensible, no es parte del ciclo de vida del TAG.
--
--    El reparto de la tabla y el del bucket quedan asi identicos: si un rol ve
--    la ruta del PNG, puede abrirlo; si no la ve, tampoco.
--
-- 2) Crea `v_evidencia_firma`: la porcion PROBATORIA de la aceptacion, sin la
--    PII que el panel no necesita. Expone version de reglamento y de aviso
--    aceptados, sello de tiempo, hash y ruta del PNG. Deja FUERA hash_payload
--    (que trae un snapshot completo del titular), firma_trazos, ip_origen,
--    user_agent y metadata: son evidencia archivada, no algo que deba viajar
--    al navegador cada vez que alguien abre un expediente.
--
--    Las versiones se leen de hash_payload, NO por FK a reglamento_versiones /
--    aviso_versiones. Dos razones:
--      - Es lo correcto: hash_payload es lo que se firmo y se hasheo. La
--        version que ahi consta es la que tiene valor probatorio.
--      - Es lo que funciona: la RLS del bloque 09 solo deja leer la version
--        VIGENTE a ti/consulta. En cuanto se publique un reglamento v3, un
--        embed por FK devolveria NULL para toda aceptacion anterior.
--
-- SOBRE LA URL FIRMADA
--
-- No se emite aqui: la crea el navegador con el SDK de Storage
-- (createSignedUrl), que ya exige la policy `firmas_lectura_panel` del bloque
-- 43. El bucket sigue privado y no se publica nada.
--
-- TRAMPA AL CONSUMIRLA: aceptaciones.firma_url guarda la ruta CON el nombre del
-- bucket adelante ('firmas/<uuid>.png', ver lib/supabase/api.ts). El SDK ya
-- recibe el bucket por su cuenta y espera la ruta SIN ese prefijo. Hay que
-- quitarlo o el archivo "no existe".
--
-- security_invoker = true: la vista hereda la RLS de aceptaciones que se fija
-- aqui arriba. No abre una segunda puerta. Requiere PostgreSQL 15+.
--
-- Idempotente: se puede reejecutar.
-- Depende de: 15_aceptaciones.sql, 17_rls_alta.sql, 18_grants_alta.sql,
--             30_roles_finos.sql, 43_endurecer_catalogos_documentos_storage.sql.
-- Aplicar despues del bloque 46.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Lectura de la evidencia: admin / ti / super (espejo del bucket).
--    Se limpian los dos nombres anteriores (bloques 17 y 30) y se deja uno
--    solo, con el mismo nombre que su gemelo de storage en el bloque 43.
-- ---------------------------------------------------------------------
drop policy if exists aceptaciones_lectura_auth  on aceptaciones;
drop policy if exists aceptaciones_lectura_admin on aceptaciones;

drop policy if exists aceptaciones_lectura_panel on aceptaciones;
create policy aceptaciones_lectura_panel on aceptaciones
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin', 'ti', 'super')
    );

-- aceptaciones sigue SIN policy de insert/update/delete: la evidencia es
-- inmutable y solo la escribe crear_registro (SECURITY DEFINER, como owner).
-- El grant de SELECT a authenticated ya viene del bloque 18.

-- ---------------------------------------------------------------------
-- 2) La porcion probatoria, sin la PII que el panel no necesita.
-- ---------------------------------------------------------------------
drop view if exists v_evidencia_firma;

create view v_evidencia_firma
with (security_invoker = true)
as
select
    a.registro_id,
    -- Ruta en el bucket privado, tal como se guardo ('firmas/<uuid>.png').
    -- Quien la consuma debe quitarle el prefijo del bucket (ver encabezado).
    a.firma_url,
    a.firma_imagen_sha256,
    a.firmante_nombre,
    a.firmante_rol,
    a.hash_algoritmo,
    a.hash_documento,
    a.sello_tiempo,
    -- Versiones congeladas en el paquete firmado. El guard del regex evita que
    -- un payload historico o manipulado tumbe la consulta entera con un error
    -- de cast: si no es un entero, la version llega NULL y el panel lo dice.
    case when a.hash_payload -> 'reglamento' ->> 'version' ~ '^[0-9]+$'
         then (a.hash_payload -> 'reglamento' ->> 'version')::int end
        as reglamento_version,
    case when a.hash_payload -> 'aviso_privacidad' ->> 'version' ~ '^[0-9]+$'
         then (a.hash_payload -> 'aviso_privacidad' ->> 'version')::int end
        as aviso_version,
    -- Los trazos vectoriales NO se exponen; solo si existen, para poder decir
    -- en el panel que la evidencia esta completa.
    (a.firma_trazos is not null) as tiene_trazos,
    a.created_at
from aceptaciones a;

comment on view v_evidencia_firma is
    'SC-008: porcion probatoria de la aceptacion para el panel (version de reglamento y aviso, sello de tiempo, hash y ruta del PNG). Sin hash_payload, trazos, IP ni user-agent. security_invoker: hereda la RLS de aceptaciones (admin/ti/super).';

revoke all on v_evidencia_firma from public;
revoke all on v_evidencia_firma from anon;
grant select on v_evidencia_firma to authenticated;

-- Hace visible la vista de inmediato para PostgREST/Supabase API.
notify pgrst, 'reload schema';

-- =====================================================================
-- Auditoria esperada (casos E-07..E-09 y P-13 de
-- Pruebas/01 - Matriz de Casos.md):
--
-- - anon: sin grant y sin policy, ni sobre aceptaciones ni sobre la vista.
-- - Rol consulta: cero filas en v_evidencia_firma, y el bucket ya se lo negaba
--   el bloque 43. No puede ver la firma por ninguna via.
-- - Rol ti: lee la evidencia y obtiene la URL firmada (cotejo presencial).
-- - Rol admin / super: igual que ti.
-- - authenticated sin aal2: cero filas.
-- - La URL firmada caduca; pasado el plazo devuelve error, no la imagen.
-- - hash_payload, firma_trazos, ip_origen, user_agent y metadata NO viajan al
--   navegador por esta vista.
--
-- Comprobacion rapida (SQL Editor, como owner):
--   select policyname, cmd from pg_policies
--    where tablename = 'aceptaciones';
--   -- debe quedar SOLO aceptaciones_lectura_panel (select)
--
--   select registro_id, reglamento_version, aviso_version, sello_tiempo,
--          left(hash_documento, 12) || '...' as hash, tiene_trazos
--     from v_evidencia_firma limit 5;
-- =====================================================================
