-- =====================================================================
-- 71_firma_solo_ti.sql   (SC-028, L2-03: la firma manuscrita solo la ve TI)
--
-- POR QUE. La junta del 9-sep acordo que la firma manuscrita del titular la
-- consulten Sistemas y el contador, y nadie mas. Hoy la ven los cuatro roles
-- del panel: el bloque 48 se la abrio a `consulta` el 29-jul por decision de
-- la Direccion de TI, y `admin` la tenia desde antes. Este bloque revierte
-- esa apertura en la base.
--
-- A PARTIR DE AQUI:
--     ti / contador / super  ->  LEEN la evidencia y abren el PNG.
--     admin / consulta       ->  no leen ni la tabla ni el bucket.
--     anon                   ->  sigue con insert-only (el alta sube su PNG
--                                y no puede leerlo de vuelta). Sin cambios.
--
-- POR QUE SE QUEDA `super`. Las politicas de abajo son listas literales de
-- roles: no pasan por `panel_exigir_rol` ni por ninguna funcion. Sin `super`
-- no quedaria ninguna via de soporte dentro del panel, y la unica forma de
-- cotejar una firma seria el dashboard de Supabase, que trabaja con la llave
-- de servicio y se salta la RLS entera. La junta dijo "admin no"; admin y
-- consulta son los que salen. Si se quiere ser literal con "solo ti y
-- contador", se quita la palabra 'super' de las dos listas de este archivo y
-- el valor "super" de ROLES_VEN_FIRMA en components/admin/EvidenciaFirma.tsx.
--
-- POR QUE `contador` VA NOMBRADO DESDE HOY. El rol todavia no existe: el CP
-- es `admin` y un JWT con rol = 'contador' ni entra al panel (auth.ts) ni lee
-- `registros` (bloque 30). Queda NOMBRADO E INERTE a proposito, para que el
-- dia que L2-02 cree el rol la firma le funcione sin volver a tocar la RLS.
-- Nombrar un rol que no existe no concede nada: ningun JWT lo trae.
--
-- POR QUE SE TIRA `firmas_gestion_admin`. Esa politica del bloque 43 es
-- `for all`, y `all` INCLUYE select: dejarla viva le devolveria a `admin` la
-- lectura del bucket por la puerta de atras y este bloque no serviria de
-- nada. Se puede tirar sin perder nada porque NADIE escribe ni borra objetos
-- del bucket desde el panel: lib/firma/servicio.ts solo usa `upload` (que es
-- del alta publica y va por `firmas_subida_anon`), `createSignedUrl` y
-- `download`. La limpieza de firmas huerfanas se hace por el dashboard, que
-- usa la llave de servicio y no mira la RLS.
--
-- LO QUE NO SE ROMPE. `v_evidencia_firma` (bloque 47) es
-- `security_invoker = true`: hereda esta RLS, asi que la restriccion llega al
-- panel por la vista sin tocarla. Ningun RPC lee `aceptaciones` — las
-- guardias del aviso corren como dueno y `crear_registro` inserta como dueno,
-- asi que el alta publica no se entera. La verificacion comprueba lo del
-- security_invoker, que es la pieza de la que depende todo lo demas.
--
-- ORDEN. Este bloque RESTRINGE, asi que va DESPUES del cliente publicado y
-- verificado. Con el cliente viejo en linea, Administracion veria el boton
-- "Ver la firma", lo pulsaria y recibiria "no hay evidencia de firma", que es
-- falso y es justo el mensaje enganoso que L2-03 vino a quitar. Por eso el
-- CANDADO DE SESION de abajo: la base no puede ver si el sitio ya se publico,
-- y quien lo aplica declara que lo comprobo (leccion del 11-sep).
--
-- Solo politicas RLS: sin funciones, sin grants, sin notify, sin redeploy.
-- Idempotente: se puede reejecutar.
-- Depende de: 15_aceptaciones.sql, 20_storage_firmas.sql, 43, 47, 48.
-- =====================================================================


-- CANDADO. Pegue esta linea como PRIMERA, en la MISMA ejecucion, despues de
-- comprobar en el panel publicado que con una cuenta de Administracion la
-- tarjeta dice "La firma manuscrita y su evidencia las consulta Sistemas" y
-- ya NO aparece el boton "Ver la firma":
--
--     set satag.firma_solo_ti = 'SI, EL PANEL PUBLICADO YA OCULTA LA FIRMA';
--
-- Sin ella el bloque aborta y no cambia nada.


-- ---------------------------------------------------------------------
-- 0. GUARDIA. Va primero: si aborta, no se aplico nada.
-- ---------------------------------------------------------------------
do $guardia$
declare
    v_candado text := coalesce(current_setting('satag.firma_solo_ti', true), '');
    v_n       int;
begin
    if v_candado <> 'SI, EL PANEL PUBLICADO YA OCULTA LA FIRMA' then
        raise exception 'Bloque 71 cancelado: falta el candado. Compruebe en el panel PUBLICADO que una cuenta de Administracion ya no ve el boton "Ver la firma" y pegue  set satag.firma_solo_ti = ''SI, EL PANEL PUBLICADO YA OCULTA LA FIRMA'';  como primera linea, en la misma ejecucion. No se aplico nada.';
    end if;

    -- Punto de partida esperado: la policy del bloque 48 sobre aceptaciones.
    -- Si no esta, alguien cambio la RLS por otro camino y hay que mirarlo
    -- antes de recrearla a ciegas.
    select count(*) into v_n
      from pg_policies
     where schemaname = 'public'
       and tablename  = 'aceptaciones';
    if v_n <> 1 then
        raise exception 'Bloque 71 cancelado: aceptaciones tiene % politicas y deberia tener exactamente 1 (aceptaciones_lectura_panel, bloque 48). Revise que paso antes de recrearla. No se aplico nada.', v_n;
    end if;

    -- La vista del panel tiene que seguir heredando la RLS; si alguien la
    -- hubiera recreado sin security_invoker, este bloque no cerraria nada, y
    -- lo peor es que lo pareceria.
    if not exists (
        select 1
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname = 'v_evidencia_firma'
           and array_to_string(c.reloptions, ',') like '%security_invoker=true%'
    ) then
        raise exception 'Bloque 71 cancelado: v_evidencia_firma no existe o dejo de ser security_invoker, asi que restringir aceptaciones no cerraria el panel. No se aplico nada.';
    end if;
end
$guardia$;


-- ---------------------------------------------------------------------
-- 1. La tabla de evidencia. Sustituye la policy del bloque 48
--    (que era admin / ti / consulta / super).
-- ---------------------------------------------------------------------
drop policy if exists aceptaciones_lectura_panel on aceptaciones;
create policy aceptaciones_lectura_panel on aceptaciones
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'contador', 'super')
    );

-- aceptaciones sigue SIN policy de insert/update/delete: la evidencia es
-- inmutable y solo la escribe crear_registro, como dueno.


-- ---------------------------------------------------------------------
-- 2. El bucket, alineado con la tabla. De nada sirve cerrar la ruta del
--    PNG de un lado y dejarla abierta del otro.
--    Sustituye firmas_lectura_panel del bloque 48.
-- ---------------------------------------------------------------------
drop policy if exists firmas_lectura_panel on storage.objects;
create policy firmas_lectura_panel on storage.objects
    for select to authenticated
    using (
        bucket_id = 'firmas'
        and (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'contador', 'super')
    );


-- ---------------------------------------------------------------------
-- 3. Fuera la gestion de admin sobre el bucket (bloque 43). `for all`
--    incluye SELECT: viva, le devolveria la lectura a admin.
--    `firmas_subida_anon` (bloque 20) NO se toca: el alta publica sigue
--    subiendo su PNG sin poder leer nada de vuelta.
-- ---------------------------------------------------------------------
drop policy if exists firmas_gestion_admin on storage.objects;
-- Del bloque 43; la tiro el propio 43. Se repite por si acaso: es un no-op.
drop policy if exists firmas_admin on storage.objects;


-- ---------------------------------------------------------------------
-- 4. VERIFICACION (solo lectura). `ok` en true en las tres filas.
-- ---------------------------------------------------------------------
select 1 as orden,
       'aceptaciones: una sola policy, SELECT, ti/contador/super' as que,
       (select string_agg(policyname || ' (' || cmd || ')', ' | ' order by policyname)
          from pg_policies
         where schemaname = 'public' and tablename = 'aceptaciones')      as valor,
       (select count(*) = 1 from pg_policies
         where schemaname = 'public' and tablename = 'aceptaciones')
       and exists (
           select 1 from pg_policies
            where schemaname = 'public' and tablename = 'aceptaciones'
              and policyname = 'aceptaciones_lectura_panel'
              and cmd  = 'SELECT'
              and qual like '%''ti''%' and qual like '%''contador''%' and qual like '%''super''%'
              and qual not like '%''admin''%' and qual not like '%''consulta''%'
       )                                                                  as ok
union all
select 2,
       'bucket firmas: lectura ti/contador/super, alta anon, sin gestion admin',
       (select string_agg(policyname || ' (' || cmd || ')', ' | ' order by policyname)
          from pg_policies
         where schemaname = 'storage' and tablename = 'objects'),
       not exists (
           select 1 from pg_policies
            where schemaname = 'storage' and tablename = 'objects'
              and policyname in ('firmas_gestion_admin', 'firmas_admin')
       )
       and exists (
           select 1 from pg_policies
            where schemaname = 'storage' and tablename = 'objects'
              and policyname = 'firmas_lectura_panel'
              and cmd  = 'SELECT'
              and qual like '%''ti''%' and qual like '%''contador''%' and qual like '%''super''%'
              and qual not like '%''admin''%' and qual not like '%''consulta''%'
       )
       and exists (
           select 1 from pg_policies
            where schemaname = 'storage' and tablename = 'objects'
              and policyname = 'firmas_subida_anon'
       )
union all
select 3,
       'v_evidencia_firma sigue heredando la RLS (security_invoker)',
       (select array_to_string(c.reloptions, ', ')
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = 'v_evidencia_firma'),
       exists (
           select 1
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'v_evidencia_firma'
              and array_to_string(c.reloptions, ',') like '%security_invoker=true%'
       )
order by orden;


-- ---------------------------------------------------------------------
-- EN PANTALLA, que es la prueba que de verdad importa (la RLS viaja en el
-- JWT y el SQL Editor corre como dueno, asi que aqui no se puede ver):
--   - Zairet (admin): abre un expediente y la tarjeta de evidencia dice que
--     la firma la consulta Sistemas. No hay boton.
--   - Lidia o Angel (ti): el boton "Ver la firma" abre la imagen.
-- Si alguna cuenta quedo con la sesion vieja, basta con recargar: el rol y
-- el aal viajan en el token, no en la politica.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). Devuelve el reparto del bloque 48 y la gestion del
-- 43. No hace falta revertir el cliente: el panel publicado solo OCULTA el
-- boton a admin y consulta, y ocultarlo con la RLS abierta no rompe nada.
--
--   drop policy if exists aceptaciones_lectura_panel on aceptaciones;
--   create policy aceptaciones_lectura_panel on aceptaciones
--       for select to authenticated
--       using (
--           (auth.jwt() ->> 'aal') = 'aal2'
--           and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin', 'ti', 'consulta', 'super')
--       );
--
--   drop policy if exists firmas_lectura_panel on storage.objects;
--   create policy firmas_lectura_panel on storage.objects
--       for select to authenticated
--       using (
--           bucket_id = 'firmas'
--           and (auth.jwt() ->> 'aal') = 'aal2'
--           and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin', 'ti', 'consulta', 'super')
--       );
--
--   drop policy if exists firmas_gestion_admin on storage.objects;
--   create policy firmas_gestion_admin on storage.objects
--       for all to authenticated
--       using (
--           bucket_id = 'firmas'
--           and (auth.jwt() ->> 'aal') = 'aal2'
--           and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','super')
--       )
--       with check (
--           bucket_id = 'firmas'
--           and (auth.jwt() ->> 'aal') = 'aal2'
--           and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','super')
--       );
--
-- Revertir esto reabre la firma a Administracion y a Consulta: es una
-- decision de la junta, no un detalle tecnico. No se revierte sin acuerdo.
-- ---------------------------------------------------------------------
