-- =====================================================================
-- 75_permiso_menor.sql   (permiso de conducir del conductor menor de edad)
--
-- POR QUE. Lo pidio Contabilidad en la junta del 22-sep y quedo en la minuta
-- del 28: cuando el conductor del vehiculo es un alumno menor de edad, el
-- Instituto recaba la fotografia de su permiso para conducir y Administracion
-- la acepta al cobrar. Es el segundo de los dos puntos sobre menores que
-- quedaron abiertos desde la junta del 9-sep; el primero —que el gestionante
-- acepte expresamente la responsabilidad— entra en el texto del aviso.
--
-- *** ESTE BLOQUE SOLO AGREGA. VA **ANTES** DEL DEPLOY DEL CLIENTE. ***
-- Los dos parametros nuevos de crear_registro llevan `default null`, asi que el
-- formulario ya publicado sigue funcionando sin mandarlos. EXIGIRLOS es el
-- bloque 76, y ese va DESPUES de que el cliente este publicado y verificado.
-- Invertir ese orden tumbo el alta de alumno dos veces el 11-sep.
--
-- EL AVISO VA PRIMERO, Y ES DELIBERADO. Un dato que se recaba sin estar en el
-- aviso firmado es un dato recabado sin informar. Por eso la v8 se publica en
-- este mismo bloque, antes de que el formulario pida nada: es el mismo criterio
-- con el que el bloque 69 publico la v7 antes de que el 70 recabara la seccion.
--
-- COMO SE CONSTRUYE LA V8. No se pega una copia del aviso: sale del texto de la
-- v7 que YA esta en la base, aplicandole los tres reemplazos declarados abajo.
-- Asi el aviso institucional queda identico POR CONSTRUCCION, y la verificacion
-- lo comprueba de todos modos. Texto aceptado por Gerardo el 29-sep-2026.
--
-- PLAZO DE CONSERVACION: mientras el expediente del TAG este vigente,
-- alineado con el resto de los sistemas. Indicacion de Direccion, 29-sep-2026.
--
-- QUE HACE, EN ORDEN:
--   1. Aviso de privacidad v8.
--   2. Bucket `permisos` y sus dos politicas.
--   3. Columnas en registros: el archivo, su huella y el trio de validacion.
--   4. crear_registro pasa de 29 a 31 parametros (drop + create + grants +
--      notify: la trampa de PostgREST).
--   5. RPC para que Administracion acepte el permiso al cobrar.
--   6. Verificacion de solo lectura.
--
-- QUE **NO** HACE:
--   - No exige el permiso. Eso es el bloque 76.
--   - No toca registrar_pago. La aceptacion es un RPC aparte para no cambiarle
--     la firma a la funcion del cobro, que es la mas usada del sistema.
--
-- Depende de: 19, 20, 52, 69, 70, 71.
-- =====================================================================


-- ---------------------------------------------------------------------
-- LOS TRES CAMBIOS DEL AVISO. Reviselos antes de correr: es el unico texto
-- que las familias van a leer y que queda sellado dentro de cada firma.
-- ---------------------------------------------------------------------
create temp table _aviso_v8_cambios (
    orden int primary key,
    campo text not null check (campo in ('contenido', 'simplificado')),
    de    text not null,
    a     text not null
);

insert into _aviso_v8_cambios (orden, campo, de, a) values
-- 1) La lista de datos identificativos del anexo. El anclaje lo escribio el
--    bloque 69, asi que existe exactamente una vez en la v7.
(1, 'contenido',
 'dato del que depende el estacionamiento al que da acceso su dispositivo; el nombre de quien gestiona el trámite',
 'dato del que depende el estacionamiento al que da acceso su dispositivo; la fotografía del permiso para conducir expedido por la autoridad competente, únicamente cuando el conductor del vehículo es menor de edad; el nombre de quien gestiona el trámite'),
-- 2) El parrafo que ya explica quien firma por un menor. El permiso se explica
--    justo ahi, con su finalidad, su resguardo y su plazo, y con la aceptacion
--    expresa de responsabilidad que se pidio el 9-sep.
(2, 'contenido',
 'pero la aceptación proviene de quien ejerce la patria potestad o la tutela.',
 'pero la aceptación proviene de quien ejerce la patria potestad o la tutela. En ese caso el Instituto solicita además la fotografía del permiso para conducir vigente, expedido por la autoridad competente a nombre del alumno, con la finalidad de comprobar que está autorizado para conducir; quien gestiona el trámite acepta expresamente la responsabilidad de solicitar el TAG para un menor de edad. Esa imagen se resguarda con el mismo cuidado que la firma —almacenamiento privado, acceso limitado al personal expresamente autorizado y enlaces temporales para consultarla—, se conserva mientras el expediente del TAG esté vigente y no se utiliza para ninguna otra finalidad.'),
-- 3) El simplificado, que enumera lo que se recaba.
(3, 'simplificado',
 'la sección en la que trabaja cuando quien lo solicita es maestro, los datos del vehículo',
 'la sección en la que trabaja cuando quien lo solicita es maestro, el permiso para conducir cuando el conductor es menor de edad, los datos del vehículo');


-- ---------------------------------------------------------------------
-- 1. AVISO v8. Misma mecanica del bloque 69: se construye desde la v7 y se
--    aborta si algun anclaje no aparece exactamente una vez.
-- ---------------------------------------------------------------------
do $publicar$
declare
    v7        record;
    c         record;
    v_base    text;
    v_n       int;
    v_txt     text;
    v_simp    text;
    v8_id     uuid;
    v8_md5    text;
    v8_md5_s  text;
    v_firmas  int;
begin
    select id, contenido, contenido_simplificado, url_publica
      into v7
      from aviso_versiones
     where version = 7;
    if v7.id is null then
        raise exception 'Bloque 75 cancelado: no existe la version 7 del aviso (bloque 69). No se aplico nada.';
    end if;
    if exists (select 1 from aviso_versiones where version > 8) then
        raise exception 'Bloque 75 cancelado: ya existe una version del aviso posterior a la 8. No se aplico nada.';
    end if;

    v_txt  := v7.contenido;
    v_simp := v7.contenido_simplificado;

    for c in select * from _aviso_v8_cambios order by orden loop
        v_base := case when c.campo = 'contenido' then v7.contenido else v7.contenido_simplificado end;
        v_n := (length(v_base) - length(replace(v_base, c.de, ''))) / length(c.de);
        if v_n <> 1 then
            raise exception 'Bloque 75 cancelado: el cambio % (%) debe encontrar su frase exactamente una vez en la v7 y la encontro % veces. No se aplico nada.', c.orden, c.campo, v_n;
        end if;
        if c.campo = 'contenido' then
            v_txt := replace(v_txt, c.de, c.a);
        else
            v_simp := replace(v_simp, c.de, c.a);
        end if;
    end loop;

    select id, md5(contenido), md5(contenido_simplificado)
      into v8_id, v8_md5, v8_md5_s
      from aviso_versiones
     where version = 8;

    if v8_id is not null then
        if v8_md5 = md5(v_txt) and v8_md5_s = md5(v_simp) then
            raise notice 'La version 8 ya existe con este mismo texto; solo se asegura que sea la vigente.';
        else
            select count(*) into v_firmas from aceptaciones where aviso_version_id = v8_id;
            if v_firmas > 0 then
                raise exception 'Ya existe una version 8 con OTRO texto y % aceptacion(es) firmadas contra ella; sobrescribirla romperia esa evidencia. Publique este texto como version 9. No se aplico nada.', v_firmas;
            end if;
            raise notice 'Habia una version 8 con otro texto y sin firmas; se sustituye.';
        end if;
    end if;

    update aviso_versiones set vigente = false where vigente and version <> 8;

    insert into aviso_versiones (version, contenido, contenido_simplificado, url_publica, vigente)
    values (8, v_txt, v_simp, v7.url_publica, true)
    on conflict (version) do update
        set contenido              = excluded.contenido,
            contenido_simplificado = excluded.contenido_simplificado,
            url_publica            = excluded.url_publica,
            vigente                = true;
end
$publicar$;


-- ---------------------------------------------------------------------
-- 2. EL BUCKET. Privado, 5 MB, SOLO IMAGENES.
--
--    Solo imagenes y no PDF a proposito: el aviso que la familia firma dice
--    «la fotografia del permiso», y el formulario no puede aceptar algo
--    distinto de lo que el aviso promete. Si algun dia se admite PDF, se
--    cambian las dos cosas en el mismo bloque.
--
--    5 MB y no 2 como las firmas: una foto de camara de telefono pesa mucho
--    mas que un trazo en PNG, y rechazarsela a una familia en el ultimo paso
--    del formulario seria el peor momento posible.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('permisos', 'permisos', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

-- anon: SOLO subir, igual que las firmas. Quien registra sube la foto y no
-- puede leerla de vuelta ni listar el bucket.
drop policy if exists "permisos_subida_anon" on "storage"."objects";
create policy "permisos_subida_anon" on "storage"."objects"
    for insert to anon with check (bucket_id = 'permisos');

-- Leerla: SOLO admin y super, y solo con aal2.
--
--   POR QUE NO TI. TI instala, y la regla operativa es que sin permiso aceptado
--   no se instala; para eso le basta el ESTADO, no la imagen. Es un documento
--   oficial de un menor: cuantos menos ojos, mejor.
--   POR QUE NO CONTADOR. Lo pidio el, pero quien valida es Administracion al
--   cobrar. Si despues se decide que el contador tambien lo revisa, se agrega
--   aqui y en la politica de lectura de registros.
drop policy if exists "permisos_lectura_panel" on "storage"."objects";
create policy "permisos_lectura_panel" on "storage"."objects"
    for select to authenticated
    using (
        bucket_id = 'permisos'
        and (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin', 'super')
    );


-- ---------------------------------------------------------------------
-- 3. LAS COLUMNAS. El trio de validacion imita a tipo_validado (CC-05), que
--    ya existe en esta misma tabla: mismo patron, mismas preguntas.
-- ---------------------------------------------------------------------
alter table registros add column if not exists permiso_url           text;
alter table registros add column if not exists permiso_sha256        text;
alter table registros add column if not exists permiso_validado      boolean not null default false;
alter table registros add column if not exists permiso_validado_por  text;
alter table registros add column if not exists permiso_validado_en   timestamptz;

comment on column registros.permiso_url is
    'Ruta del permiso para conducir del conductor menor de edad, con el bucket adelante ("permisos/<uuid>.jpg"). Bloque 75. Solo cuando usuario_es_menor.';
comment on column registros.permiso_sha256 is
    'SHA-256 de la imagen del permiso, sellado tambien dentro del payload firmado (satag.acceptance.v4). Bloque 75.';
comment on column registros.permiso_validado is
    'Administracion vio la foto y la acepto al cobrar. Bloque 75. Mismo patron que tipo_validado (CC-05).';


-- ---------------------------------------------------------------------
-- 4. crear_registro DE 31 PARAMETROS.
--
--    4a) Fuera la firma de 29 y, si una corrida anterior de este bloque ya la
--        creo, tambien la de 31. Con las listas COMPLETAS de tipos.
-- ---------------------------------------------------------------------
drop function if exists crear_registro(
    text, text, text, text, text, text, text, boolean, text,
    text, text, text, text, text, text, boolean, text, jsonb, text, inet, text, jsonb, text, text, uuid, uuid, text, text, text
);
drop function if exists crear_registro(
    text, text, text, text, text, text, text, boolean, text,
    text, text, text, text, text, text, boolean, text, jsonb, text, inet, text, jsonb, text, text, uuid, uuid, text, text, text,
    text, text
);

-- 4b) La funcion nueva: cuerpo vigente del bloque 70, INTEGRO, con los deltas
--     marcados "NUEVO 75". Se genero extrayendolo del archivo del 70 y
--     aplicandole los deltas con un diff de por medio, no transcribiendolo.
create function crear_registro(
    p_usuario_nombres              text,
    p_usuario_apellido_paterno     text,
    p_tipo_usuario                 text,
    p_marca                        text,
    p_modelo                       text,
    p_color                        text,
    p_placas                       text,
    p_sin_placas                   boolean,
    p_firma_url                    text,
    p_usuario_apellido_materno     text default null,
    p_firmante_nombre              text default null,
    p_gestionante_nombres          text default null,
    p_gestionante_apellido_paterno text default null,
    p_gestionante_apellido_materno text default null,
    p_gestionante_relacion         text default null,
    p_usuario_es_menor             boolean default false,
    p_firmante_rol                 text default 'usuario',
    p_firma_trazos                 jsonb default null,
    p_firma_imagen_sha256          text default null,
    p_ip_origen                    inet default null,
    p_user_agent                   text default null,
    p_metadata                     jsonb default '{}'::jsonb,
    p_procedencia_tag              text default 'escuela',
    p_observaciones                text default null,
    p_reglamento_version_id        uuid default null,
    p_aviso_version_id             uuid default null,
    p_apellidos_familia            text default null,
    -- NUEVO 63: parametro 28, AL FINAL y con default null, igual que el 27
    -- en el bloque 55.
    p_parentesco_otro              text default null,
    -- NUEVO 70: parametro 29, AL FINAL y con default null. El formulario
    -- publicado antes de este bloque no lo manda y sigue funcionando.
    p_seccion_maestro              text default null,
    -- NUEVO 75: parametros 30 y 31, AL FINAL y con default null. El
    -- formulario publicado antes de este bloque no los manda y sigue
    -- funcionando; exigirlos es el bloque 76, despues del cliente.
    p_permiso_url                  text default null,
    p_permiso_sha256               text default null
) returns jsonb
language plpgsql
security definer
-- extensions: en Supabase pgcrypto (digest) vive en el schema extensions.
set search_path = public, extensions
as $$
declare
    v_registro_id uuid;
    v_folio text;
    v_reglamento_version_id uuid;
    v_reglamento_version int;
    v_reglamento_contenido text;
    v_aviso_version_id uuid;
    v_aviso_version int;
    v_aviso_contenido text;
    v_usuario_nombre_completo text;
    v_gestionante_nombre_completo text;
    v_firmante_nombre text;
    v_firmante_rol text;
    v_apellidos_familia text;
    v_parentesco_otro text;             -- NUEVO 63
    v_seccion_maestro text;             -- NUEVO 70
    v_permiso_url text;                 -- NUEVO 75
    v_permiso_sha256 text;              -- NUEVO 75
    v_placas text;                      -- 62: normalizada una sola vez
    v_sello_tiempo timestamptz := clock_timestamp();
    v_hash_payload jsonb;
    v_hash_documento text;
    v_headers json;
    v_xff text;
    v_ip_origen inet;
    v_user_agent text;
begin
    if p_reglamento_version_id is null then
        raise exception 'No se recibio la version del reglamento mostrada en pantalla. Recargue la pagina e intente de nuevo.';
    end if;
    select id, version, contenido
      into v_reglamento_version_id, v_reglamento_version, v_reglamento_contenido
      from reglamento_versiones
     where id = p_reglamento_version_id;
    if v_reglamento_version_id is null then
        raise exception 'La version de reglamento indicada no existe';
    end if;

    if p_aviso_version_id is null then
        raise exception 'No se recibio la version del aviso de privacidad mostrada en pantalla. Recargue la pagina e intente de nuevo.';
    end if;
    select id, version, contenido
      into v_aviso_version_id, v_aviso_version, v_aviso_contenido
      from aviso_versiones
     where id = p_aviso_version_id;
    if v_aviso_version_id is null then
        raise exception 'La version de aviso de privacidad indicada no existe';
    end if;

    if coalesce(btrim(p_usuario_nombres),'') = '' then
        raise exception 'El nombre (usuario_nombres) es obligatorio';
    end if;
    if coalesce(btrim(p_usuario_apellido_paterno),'') = '' then
        raise exception 'El apellido paterno del usuario es obligatorio';
    end if;
    -- NUEVO 63: quinto tipo. El CHECK del PASO 2 ya lo admite en la tabla.
    if p_tipo_usuario not in ('maestro','padres','alumno','admin','otro') then
        raise exception 'tipo_usuario invalido: %', p_tipo_usuario;
    end if;
    if coalesce(btrim(p_modelo),'') = '' then
        raise exception 'El modelo del vehiculo es obligatorio';
    end if;
    if (p_placas is null or btrim(p_placas) = '') and not coalesce(p_sin_placas,false) then
        raise exception 'Debe capturar placas o marcar sin_placas';
    end if;

    -- 62: normalizada UNA SOLA VEZ. De aqui en adelante, tanto el insert
    -- como el hash_payload usan esta misma variable.
    v_placas := nullif(upper(btrim(coalesce(p_placas,''))), '');

    -- 62: aviso temprano, ANTES de gastar un folio de la secuencia
    -- (registros_folio_seq no se revierte con un rollback). El indice
    -- unico uq_registros_placas_vigentes es quien de verdad lo garantiza
    -- si dos altas llegan al mismo tiempo; ver el "exception when
    -- unique_violation" mas abajo, junto al insert.
    if v_placas is not null and exists (
        select 1 from registros where upper(placas) = v_placas and estado <> 'baja'
    ) then
        raise exception 'Las placas % ya estan registradas en otro expediente. Si el vehiculo cambio de titular, solicite primero la baja del expediente anterior.', v_placas;
    end if;

    if coalesce(btrim(p_firma_url),'') = '' then
        raise exception 'Falta la firma (firma_url)';
    end if;
    if p_firma_imagen_sha256 is not null and p_firma_imagen_sha256 !~ '^[0-9a-f]{64}$' then
        raise exception 'firma_imagen_sha256 debe ser SHA-256 en hexadecimal';
    end if;
    if coalesce(btrim(p_gestionante_nombres),'') <> ''
       and coalesce(btrim(p_gestionante_apellido_paterno),'') = '' then
        raise exception 'El gestionante requiere apellido paterno';
    end if;
    if coalesce(p_usuario_es_menor,false) and (
        coalesce(btrim(p_gestionante_nombres),'') = '' or
        coalesce(btrim(p_gestionante_apellido_paterno),'') = '' or
        p_gestionante_relacion not in ('padre','madre','tutor')
    ) then
        raise exception 'Un usuario menor requiere gestionante padre, madre o tutor con nombre y apellido paterno';
    end if;
    -- NUEVO 63: el cotejo contra la lista de inscritos ya no es solo de
    -- 'padres'. Un alumno y un familiar son justo los casos donde el
    -- apellido del conductor NO coincide con el de la familia, que es el
    -- motivo por el que Administracion pidio el dato (junta del 9-sep).
    -- NUEVO 65: 'alumno' entra a la lista. El 63 lo dejo fuera porque el
    -- formulario de entonces mandaba null a todo alumno; este bloque solo
    -- se aplica con el formulario nuevo ya publicado (ver el encabezado).
    if p_tipo_usuario in ('padres','alumno','otro')
       and coalesce(btrim(coalesce(p_apellidos_familia,'')),'') = '' then
        -- «Recargue la pagina», no «complete el dato»: el unico modo de que
        -- este mensaje llegue a una pantalla es que el navegador haya servido
        -- una version vieja del formulario, y esa version NO tiene el campo.
        raise exception 'No se recibieron los apellidos de la familia, que son obligatorios cuando el registro es de un padre o una madre, de un alumno o de otro familiar. Recargue la pagina e intente de nuevo.';
    end if;
    -- NUEVO 63: 'otro' sin parentesco no sirve de nada. El tipo existe
    -- justamente para saber quien es esa persona; sin el texto, el
    -- expediente quedaria peor que si hubiera elegido 'padres'.
    if p_tipo_usuario = 'otro'
       and coalesce(btrim(coalesce(p_parentesco_otro,'')),'') = '' then
        raise exception 'Indique su parentesco con la familia (tio, abuelo, etcetera): es obligatorio cuando el registro no es de un padre o una madre, de un alumno, de un maestro ni del personal.';
    end if;
    -- NUEVO 70: la seccion solo le corresponde al maestro; a cualquier otro
    -- tipo se le ignora (el formulario ni la muestra). Si viene, tiene que ser
    -- una de las cuatro. NO se exige todavia (ver el encabezado). Va ANTES del
    -- nextval: un rechazo aqui no gasta folio.
    v_seccion_maestro := lower(nullif(btrim(coalesce(p_seccion_maestro,'')), ''));
    if p_tipo_usuario <> 'maestro' then
        v_seccion_maestro := null;
    elsif v_seccion_maestro is not null
          and v_seccion_maestro not in ('preescolar','primaria','secundaria','preparatoria') then
        raise exception 'La seccion del maestro debe ser preescolar, primaria, secundaria o preparatoria. Recargue la pagina e intente de nuevo.';
    end if;

    -- NUEVO 75: el permiso de conducir solo le corresponde al conductor MENOR
    -- de edad; a cualquier otro se le ignora, igual que la seccion con quien
    -- no es maestro. Aqui NO se exige: exigirlo es el bloque 76 y va DESPUES
    -- de que el cliente que lo manda este publicado y verificado. Tambien va
    -- antes del nextval, para que un rechazo no gaste folio.
    v_permiso_url    := nullif(btrim(coalesce(p_permiso_url,'')), '');
    v_permiso_sha256 := lower(nullif(btrim(coalesce(p_permiso_sha256,'')), ''));
    if not coalesce(p_usuario_es_menor, false) then
        v_permiso_url    := null;
        v_permiso_sha256 := null;
    else
        -- La ruta se guarda con el bucket adelante, igual que firma_url. Si
        -- no empieza por el bucket correcto, alguien mando otra cosa.
        if v_permiso_url is not null and v_permiso_url not like 'permisos/%' then
            raise exception 'La ruta del permiso no corresponde al almacen de permisos. Recargue la pagina e intente de nuevo.';
        end if;
        if v_permiso_sha256 is not null and v_permiso_sha256 !~ '^[0-9a-f]{64}$' then
            raise exception 'La huella del permiso no tiene el formato esperado. Recargue la pagina e intente de nuevo.';
        end if;
        -- Una sin la otra no sirve: la huella sin archivo no verifica nada, y
        -- el archivo sin huella no se puede cotejar despues.
        if (v_permiso_url is null) <> (v_permiso_sha256 is null) then
            raise exception 'El permiso debe llegar con su archivo y su huella. Recargue la pagina e intente de nuevo.';
        end if;
    end if;

    v_usuario_nombre_completo := btrim(
        btrim(p_usuario_nombres) || ' ' || btrim(p_usuario_apellido_paterno) ||
        coalesce(' ' || nullif(btrim(coalesce(p_usuario_apellido_materno,'')), ''), '')
    );
    if coalesce(btrim(p_gestionante_nombres),'') = '' then
        v_gestionante_nombre_completo := null;
    else
        v_gestionante_nombre_completo := btrim(
            btrim(p_gestionante_nombres) ||
            coalesce(' ' || nullif(btrim(coalesce(p_gestionante_apellido_paterno,'')), ''), '') ||
            coalesce(' ' || nullif(btrim(coalesce(p_gestionante_apellido_materno,'')), ''), '')
        );
    end if;

    v_firmante_nombre := coalesce(nullif(btrim(coalesce(p_firmante_nombre,'')), ''), v_usuario_nombre_completo);
    v_firmante_rol := coalesce(p_firmante_rol, 'usuario');
    v_apellidos_familia := nullif(btrim(coalesce(p_apellidos_familia,'')), '');
    -- NUEVO 63: mismo saneo que el resto del expediente, para que "vacio"
    -- tenga una sola representacion y mandar "   " no burle la validacion
    -- de arriba, que usa el mismo btrim.
    v_parentesco_otro := nullif(btrim(coalesce(p_parentesco_otro,'')), '');

    v_headers := nullif(current_setting('request.headers', true), '')::json;
    v_user_agent := coalesce(
        nullif(btrim(coalesce(v_headers ->> 'user-agent', '')), ''),
        nullif(btrim(coalesce(p_user_agent, '')), '')
    );
    v_xff := btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1));
    begin
        v_ip_origen := nullif(v_xff, '')::inet;
    exception when others then
        v_ip_origen := null;
    end;
    v_ip_origen := coalesce(v_ip_origen, p_ip_origen);

    v_folio := 'SATAG-' || lpad(nextval('registros_folio_seq')::text, 6, '0');

    begin
        insert into registros (
            folio,
            usuario_nombres, usuario_apellido_paterno, usuario_apellido_materno,
            gestionante_nombres, gestionante_apellido_paterno, gestionante_apellido_materno,
            gestionante_relacion, usuario_es_menor,
            tipo_usuario, procedencia_tag, marca, modelo, color, placas, sin_placas,
            apellidos_familia,
            parentesco_otro,
            seccion_maestro,
            permiso_url, permiso_sha256,
            observaciones, estado
        ) values (
            v_folio,
            btrim(p_usuario_nombres),
            btrim(p_usuario_apellido_paterno),
            nullif(btrim(coalesce(p_usuario_apellido_materno,'')), ''),
            nullif(btrim(coalesce(p_gestionante_nombres,'')), ''),
            nullif(btrim(coalesce(p_gestionante_apellido_paterno,'')), ''),
            nullif(btrim(coalesce(p_gestionante_apellido_materno,'')), ''),
            nullif(btrim(coalesce(p_gestionante_relacion,'')), ''),
            coalesce(p_usuario_es_menor, false),
            p_tipo_usuario,
            coalesce(p_procedencia_tag,'escuela'),
            btrim(p_marca),
            btrim(p_modelo),
            btrim(p_color),
            v_placas,
            coalesce(p_sin_placas, false),
            v_apellidos_familia,
            v_parentesco_otro,          -- NUEVO 63
            v_seccion_maestro,          -- NUEVO 70
            v_permiso_url, v_permiso_sha256,   -- NUEVO 75
            nullif(btrim(coalesce(p_observaciones,'')), ''),
            'pendiente'
        ) returning id into v_registro_id;
    exception when unique_violation then
        raise exception 'Las placas % ya estan registradas en otro expediente. Si el vehiculo cambio de titular, solicite primero la baja del expediente anterior.', v_placas;
    end;

    -- NUEVO 70: el payload sube a v3 porque gana un campo (seccion_maestro),
    -- con el mismo criterio con el que el 63 subio a v2 por el parentesco:
    -- una etiqueta no puede significar dos conjuntos de campos distintos
    -- segun la fecha. Las aceptaciones v1 y v2 conservan su etiqueta y siguen
    -- verificando igual.
    -- `apellidos_familia` sigue FUERA a proposito (bloques 55 y 58): es
    -- cotejo administrativo de la escuela, no una declaracion del titular.
    v_hash_payload := jsonb_build_object(
        'schema', 'satag.acceptance.v4',
        'sello_tiempo', v_sello_tiempo,
        'reglamento', jsonb_build_object(
            'id', v_reglamento_version_id,
            'version', v_reglamento_version,
            'contenido_sha256', encode(digest(v_reglamento_contenido, 'sha256'), 'hex')
        ),
        'aviso_privacidad', jsonb_build_object(
            'id', v_aviso_version_id,
            'version', v_aviso_version,
            'contenido_sha256', encode(digest(v_aviso_contenido, 'sha256'), 'hex')
        ),
        'registro', jsonb_build_object(
            'id', v_registro_id,
            'folio', v_folio,
            'usuario_nombres', btrim(p_usuario_nombres),
            'usuario_apellido_paterno', btrim(p_usuario_apellido_paterno),
            'usuario_apellido_materno', nullif(btrim(coalesce(p_usuario_apellido_materno,'')), ''),
            'usuario_nombre_completo', v_usuario_nombre_completo,
            'gestionante_nombres', nullif(btrim(coalesce(p_gestionante_nombres,'')), ''),
            'gestionante_apellido_paterno', nullif(btrim(coalesce(p_gestionante_apellido_paterno,'')), ''),
            'gestionante_apellido_materno', nullif(btrim(coalesce(p_gestionante_apellido_materno,'')), ''),
            'gestionante_nombre_completo', v_gestionante_nombre_completo,
            'gestionante_relacion', nullif(btrim(coalesce(p_gestionante_relacion,'')), ''),
            'usuario_es_menor', coalesce(p_usuario_es_menor, false),
            'tipo_usuario', p_tipo_usuario,
            -- Con la variable ya saneada, no recalculando la expresion: es el
            -- mismo criterio por el que el 62 metio v_placas. Lo sellado y lo
            -- guardado tienen que ser el mismo texto, byte por byte.
            'parentesco_otro', v_parentesco_otro,
            'seccion_maestro', v_seccion_maestro,       -- NUEVO 70
            'permiso_sha256', v_permiso_sha256,         -- NUEVO 75
            'marca', btrim(p_marca),
            'modelo', btrim(p_modelo),
            'color', btrim(p_color),
            'placas', v_placas,
            'sin_placas', coalesce(p_sin_placas, false),
            'procedencia_tag', coalesce(p_procedencia_tag,'escuela')
        ),
        'firmante', jsonb_build_object(
            'nombre', v_firmante_nombre,
            'rol', v_firmante_rol
        ),
        'aceptacion', jsonb_build_object(
            'acepto_reglamento', true,
            'acepto_privacidad', true,
            'ip_origen', v_ip_origen,
            'user_agent', v_user_agent,
            'metadata', coalesce(p_metadata, '{}'::jsonb)
        ),
        'firma', jsonb_build_object(
            'ruta_storage', btrim(p_firma_url),
            'imagen_sha256', p_firma_imagen_sha256,
            'trazos', p_firma_trazos
        )
    );

    v_hash_documento := encode(digest(convert_to(v_hash_payload::text, 'UTF8'), 'sha256'), 'hex');

    insert into aceptaciones (
        registro_id, reglamento_version_id, aviso_version_id,
        firma_url, firma_imagen_sha256, firma_trazos,
        firmante_nombre, firmante_rol,
        acepto_reglamento, acepto_privacidad, ip_origen, user_agent, metadata,
        hash_algoritmo, hash_documento, hash_payload, sello_tiempo
    ) values (
        v_registro_id, v_reglamento_version_id, v_aviso_version_id,
        btrim(p_firma_url), p_firma_imagen_sha256, p_firma_trazos,
        v_firmante_nombre, v_firmante_rol,
        true, true, v_ip_origen, v_user_agent,
        coalesce(p_metadata, '{}'::jsonb),
        'sha256', v_hash_documento, v_hash_payload, v_sello_tiempo
    );

    insert into movimientos (registro_id, tipo, motivo, hecho_por)
    values (v_registro_id, 'alta', 'Alta por autoservicio', 'autoservicio');

    -- anon no puede leer registros (RLS): el RPC devuelve id + folio + estado.
    return jsonb_build_object(
        'id', v_registro_id,
        'folio', v_folio,
        'estado', 'pendiente'
    );
end;
$$;

-- 4c) Los grants se fueron con el drop: se emiten otra vez para la firma NUEVA
--     de 31 tipos, a los mismos roles de siempre.
revoke all on function crear_registro(
    text, text, text, text, text, text, text, boolean, text,
    text, text, text, text, text, text, boolean, text, jsonb, text, inet, text, jsonb, text, text, uuid, uuid, text, text, text,
    text, text
) from public;
grant execute on function crear_registro(
    text, text, text, text, text, text, text, boolean, text,
    text, text, text, text, text, text, boolean, text, jsonb, text, inet, text, jsonb, text, text, uuid, uuid, text, text, text,
    text, text
) to anon, authenticated;

-- 4d) PostgREST cachea las firmas: sin esto sigue anunciando la de 29 y
--     rechaza los argumentos nuevos como desconocidos.
notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- 5. ACEPTAR EL PERMISO. Lo llama Administracion desde la pantalla del cobro.
--
--    Va como RPC aparte y NO dentro de registrar_pago: cambiarle la firma a la
--    funcion del cobro —la mas usada del sistema— por algo que se puede
--    resolver con una funcion nueva seria comprar la trampa de PostgREST sin
--    necesidad.
-- ---------------------------------------------------------------------
create or replace function validar_permiso_menor(
    p_registro_id uuid,
    p_hecho_por   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $validar$
declare
    v_reg   registros%rowtype;
    v_quien text;
begin
    perform panel_exigir_rol(array['admin']);

    select * into v_reg from registros where id = p_registro_id;
    if not found then
        raise exception 'No existe el expediente.';
    end if;
    if not v_reg.usuario_es_menor then
        raise exception 'Este expediente no es de un conductor menor de edad: no hay permiso que aceptar.';
    end if;
    if v_reg.permiso_url is null then
        raise exception 'El expediente no tiene permiso cargado. Pida a la familia que lo suba antes de aceptarlo.';
    end if;
    if v_reg.permiso_validado then
        raise exception 'El permiso ya fue aceptado por % el %.', coalesce(v_reg.permiso_validado_por, 'alguien'),
            to_char(v_reg.permiso_validado_en at time zone 'America/Mexico_City', 'DD-Mon-YYYY HH24:MI');
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email');

    update registros
       set permiso_validado     = true,
           permiso_validado_por = v_quien,
           permiso_validado_en  = now()
     where id = p_registro_id;

    insert into movimientos (registro_id, tipo, fecha, motivo, hecho_por)
    values (p_registro_id, 'actualizacion', (now() at time zone 'America/Mexico_City')::date,
            'Permiso para conducir del menor aceptado por Administracion', v_quien);

    return jsonb_build_object('id', p_registro_id, 'validadoPor', v_quien);
end;
$validar$;

revoke all on function validar_permiso_menor(uuid, text) from public;
grant execute on function validar_permiso_menor(uuid, text) to authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- 6. VERIFICACION (solo lectura). `ok` en true en las ocho filas.
-- ---------------------------------------------------------------------
select 1 as orden, 'el aviso vigente es la v8' as que,
       (select version::text from aviso_versiones where vigente) as valor,
       (select count(*) = 1 from aviso_versiones where vigente and version = 8) as ok
union all
select 2, 'el texto institucional quedo intacto: la v8 solo agrega',
       null,
       (select length(v8.contenido) > length(v7.contenido)
           and replace(v8.contenido, 'la fotografía del permiso para conducir expedido por la autoridad competente, únicamente cuando el conductor del vehículo es menor de edad; ', '') like '%' || left(v7.contenido, 400) || '%'
          from aviso_versiones v7, aviso_versiones v8
         where v7.version = 7 and v8.version = 8)
union all
select 3, 'la v8 menciona el permiso en los dos textos', null,
       (select contenido like '%permiso para conducir%' and contenido_simplificado like '%permiso para conducir%'
          from aviso_versiones where version = 8)
union all
select 4, 'bucket permisos: privado, 5 MB, solo imagenes',
       (select file_size_limit::text || ' bytes' from storage.buckets where id = 'permisos'),
       (select not public and file_size_limit = 5242880
           and allowed_mime_types @> array['image/jpeg']
           and not (allowed_mime_types @> array['application/pdf'])
          from storage.buckets where id = 'permisos')
union all
select 5, 'las dos politicas del bucket, y la lectura es de admin y super',
       (select string_agg(policyname, ', ' order by policyname) from pg_policies
         where schemaname = 'storage' and policyname like 'permisos%'),
       (select count(*) = 2 from pg_policies
         where schemaname = 'storage' and policyname like 'permisos%')
       and (select qual like '%admin%' and qual like '%super%' and qual not like '%consulta%'
              from pg_policies where policyname = 'permisos_lectura_panel')
union all
select 6, 'las cinco columnas del permiso', null,
       (select count(*) = 5 from information_schema.columns
         where table_schema = 'public' and table_name = 'registros'
           and column_name in ('permiso_url','permiso_sha256','permiso_validado','permiso_validado_por','permiso_validado_en'))
union all
select 7, 'crear_registro: UNA sola forma, de 31 parametros, y sella v4',
       (select count(*)::text || ' forma(s), ' || max(pronargs)::text || ' parametros'
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'crear_registro'),
       (select count(*) = 1 and max(pronargs) = 31 and bool_and(prosrc like '%satag.acceptance.v4%')
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'crear_registro')
union all
select 8, 'validar_permiso_menor existe y es de admin', null,
       (select prosrc like '%array[''admin'']%'
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'validar_permiso_menor')
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). Devuelve la base a como estaba antes de este bloque.
--
--   -- 1. El aviso vuelve a la v7. Solo si NINGUNA firma se hizo contra la v8:
--   --    si las hay, revertir romperia esa evidencia y hay que publicar una v9.
--   --    select count(*) from aceptaciones a join aviso_versiones v
--   --      on v.id = a.aviso_version_id where v.version = 8;   -- debe ser 0
--   update aviso_versiones set vigente = (version = 7) where version in (7, 8);
--   delete from aviso_versiones where version = 8;
--
--   -- 2. crear_registro vuelve a 29 parametros: corra el bloque 70 COMPLETO,
--   --    que hace su propio drop de la firma de 29 y de la de 30+. Despues
--   --    agregue a mano el drop de la de 31:
--   --    drop function if exists crear_registro(<los 31 tipos de arriba>);
--
--   -- 3. El RPC nuevo y el bucket:
--   drop function if exists validar_permiso_menor(uuid, text);
--   drop policy if exists "permisos_lectura_panel" on "storage"."objects";
--   drop policy if exists "permisos_subida_anon"  on "storage"."objects";
--   -- El bucket NO se borra si ya tiene archivos dentro: son documentos
--   -- oficiales de menores y borrarlos es irreversible. Vaciarlo es una
--   -- decision aparte, y se hace desde el dashboard mirando lo que hay.
--   -- delete from storage.buckets where id = 'permisos';
--
--   -- 4. Las columnas se quedan. Quitarlas borraria la ruta y la huella de
--   --    los permisos ya cargados, y el archivo seguiria en el bucket sin
--   --    nada que lo relacione con su expediente: exactamente el huerfano que
--   --    el 15-sep costo una revision de privacidad.
--   -- alter table registros drop column permiso_url;  -- NO sin vaciar antes
-- ---------------------------------------------------------------------
