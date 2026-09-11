-- =====================================================================
-- 65_apellidos_alumno.sql   (junta 9-sep: el cotejo tambien para alumnos)
--
-- #####################################################################
-- ##                                                                 ##
-- ##   APLIQUELO UNICAMENTE DESPUES DE QUE EL CLIENTE NUEVO ESTE      ##
-- ##   PUBLICADO EN satag.asuncionqro.edu.mx Y VERIFICADO.            ##
-- ##                                                                 ##
-- ##   ANTES DE ESO, ESTE BLOQUE TUMBA TODAS LAS ALTAS DE ALUMNO      ##
-- ##   DEL SITIO EN VIVO.                                             ##
-- ##                                                                 ##
-- #####################################################################
--
-- POR QUE. Este bloque vuelve obligatorios los apellidos de la familia
-- tambien para el tipo 'alumno' (el 63 los exigio a 'padres' y a 'otro').
-- El formulario que estaba publicado antes de este cambio manda
-- apellidos_familia = null en TODA alta que no sea de 'padres', y fuerza
-- el tipo a 'alumno' en cuanto se marca "El conductor es menor de edad".
-- Con ese formulario en linea, cada alta de alumno —el caso mas comun—
-- choca contra la exigencia de este bloque y se rechaza, y el titular no
-- tiene forma de corregirlo porque su formulario ni siquiera muestra el
-- campo. Por eso el 63 dejo fuera a 'alumno' y la exigencia vive aqui,
-- aparte, para aplicarse al final.
--
-- ORDEN DE APLICACION DEL CAMBIO COMPLETO:
--   1. Bloque 63 (tipo 'otro', parentesco, registrar_pago de 5 parametros).
--   2. Bloque 64 (aviso de privacidad v6, que ya dice que los apellidos
--      se piden tambien a los alumnos).
--   3. Deploy del cliente nuevo.
--   4. ESTE bloque.
--
-- ANTES DE PEGARLO, COMPRUEBE A MANO (el SQL no puede ver el sitio):
--   - Que el deploy del cliente nuevo termino y esta en linea.
--   - En una ventana privada, en /registro/: marque "El conductor es
--     menor de edad" (el tipo pasa a alumno) y confirme que el formulario
--     PIDE los apellidos de la familia y no deja avanzar sin ellos.
--   - Igual con el tipo alumno elegido a mano, sin marcar la casilla.
--
-- LO QUE SIGUE PASANDO DESPUES DEL DEPLOY, y es aceptable: quien tenia el
-- formulario viejo abierto antes de publicar y envia un alta de alumno
-- recibe "No se recibieron los apellidos de la familia... Recargue la
-- pagina e intente de nuevo". Ese mensaje se escribio justo para ese caso:
-- al recargar le llega el formulario nuevo, que si tiene el campo.
--
-- HISTORIA. El 11-sep, hacia las 12:50, se aplico antes del deploy (en su
-- version sin candado) y rechazo las altas de alumno mientras el sitio
-- siguio sirviendo el formulario viejo; la ventana se cerro sola cuando el
-- formulario nuevo quedo en linea (a mas tardar 13:26), porque desde
-- entonces el formulario manda el dato que la base exige. No hizo falta
-- el script urgente. Se volvio a aplicar, ya con candado, despues de
-- comprobar /registro/ a mano. Por eso arranca con un candado de sesion
-- que el SQL no puede saltarse solo (paso 0).
--
-- QUE HACE, EN ORDEN:
--   0. Candado: aborta si no se declaro, en la misma sesion, que el
--      formulario publicado ya pide los apellidos a un alumno.
--   1. Guardia: aborta si el bloque 63 no esta aplicado (no hay
--      crear_registro de 28 parametros, o hay mas de una forma) o si el
--      aviso vigente no es el del bloque 64. Sin la primera condicion, el
--      `create or replace` de abajo crearia una SEGUNDA sobrecarga junto
--      a la de 27 parametros: la trampa PostgREST. Sin la segunda, se
--      pediria a los alumnos un dato que el aviso firmado dice que a ellos
--      no se les pide.
--   2. `crear_registro`: agrega 'alumno' a la lista que exige apellidos.
--      MISMA firma de 28 parametros del 63: `create or replace` en sitio,
--      sin drop, sin regrant y sin notify (los grants del 63 se
--      conservan). Reproduce integro el cuerpo del PASO 3b del 63; el
--      unico delta va marcado con "NUEVO 65".
--   3. Verificacion de solo lectura, y la lista por folio de los
--      expedientes 'alumno' sin apellidos de familia — se muestran, no se
--      reparan, con el mismo criterio del bloque 58.
--
-- Idempotente: se puede reejecutar completo sin dano.
--
-- Depende de: 63 (firma de 28 parametros) y 64 (aviso v6 vigente).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. CANDADO. Pegue esta linea como PRIMERA linea del editor, arriba del
--    archivo completo, y corralo todo EN UNA SOLA EJECUCION (en dos
--    ejecuciones separadas el editor puede usar otra conexion y la frase
--    no llega). Hagalo SOLO despues de la comprobacion a mano del
--    encabezado (en /registro/, el formulario PUBLICADO le pide los
--    apellidos de la familia a un alumno):
--
--     set satag.cliente_nuevo_verificado = 'SI, EL SITIO YA PIDE APELLIDOS A ALUMNO';
--
--    Existe porque la exigencia de apellidos a alumno se aplico DOS VECES
--    antes del deploy el 11-sep (primero dentro de una version previa del
--    63, despues con este mismo bloque), y las dos veces rechazo el alta de
--    alumno en produccion: su guardia comprobaba la base (firma del 63,
--    aviso del 64), y la base estaba lista; lo que no estaba era el sitio,
--    y eso el SQL no lo puede ver. Sin la frase, el bloque aborta sin tocar nada. Mismo patron que
--    `satag.confirmo_borrado` de limpiar_padron_piloto.sql.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 1. GUARDIA. Va primero: si aborta, no se aplico nada.
-- ---------------------------------------------------------------------
do $guardia$
declare
    v_formas   int;
    v_aviso_ok boolean;
begin
    if coalesce(current_setting('satag.cliente_nuevo_verificado', true), '')
       <> 'SI, EL SITIO YA PIDE APELLIDOS A ALUMNO' then
        raise exception 'Bloque 65 cancelado: falta confirmar que el formulario publicado ya pide los apellidos de la familia a un alumno. Verifiquelo en /registro/ y pegue  set satag.cliente_nuevo_verificado = ''SI, EL SITIO YA PIDE APELLIDOS A ALUMNO'';  como primera linea, arriba de este bloque, en la misma ejecucion. No se aplico nada.';
    end if;

    if to_regprocedure('public.crear_registro(text,text,text,text,text,text,text,boolean,text,text,text,text,text,text,text,boolean,text,jsonb,text,inet,text,jsonb,text,text,uuid,uuid,text,text)') is null then
        raise exception 'No existe crear_registro con 28 parametros: aplique primero el bloque 63. No se aplico nada.';
    end if;

    select count(*)
      into v_formas
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'crear_registro';
    if v_formas <> 1 then
        raise exception 'crear_registro tiene % formas y deberia tener 1: resuelva primero la verificacion 6c del bloque 63. No se aplico nada.', v_formas;
    end if;

    -- La frase la introduce la v6 (bloque 64) en el apartado de los
    -- apellidos; ninguna version anterior la trae.
    select position('a los alumnos y a cualquier otro familiar' in contenido) > 0
      into v_aviso_ok
      from aviso_versiones
     where vigente;
    if not coalesce(v_aviso_ok, false) then
        raise exception 'El aviso de privacidad vigente todavia no informa que los apellidos de la familia se piden tambien a los alumnos: aplique primero el bloque 64. No se aplico nada.';
    end if;
end
$guardia$;


-- ---------------------------------------------------------------------
-- 2. crear_registro: 'alumno' tambien exige los apellidos de la familia.
--
-- MISMA firma de 28 parametros: `create or replace` en sitio. El cuerpo
-- es el del PASO 3b del bloque 63, integro; el delta va marcado con
-- "NUEVO 65".
-- ---------------------------------------------------------------------
create or replace function crear_registro(
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
    p_parentesco_otro              text default null
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
            nullif(btrim(coalesce(p_observaciones,'')), ''),
            'pendiente'
        ) returning id into v_registro_id;
    exception when unique_violation then
        raise exception 'Las placas % ya estan registradas en otro expediente. Si el vehiculo cambio de titular, solicite primero la baja del expediente anterior.', v_placas;
    end;

    -- NUEVO 63: el payload sube a v2 porque gana un campo (parentesco_otro).
    -- Ver el encabezado: una etiqueta no puede significar dos conjuntos de
    -- campos distintos segun la fecha. Las aceptaciones ya firmadas
    -- conservan su v1 y siguen verificando igual.
    -- `apellidos_familia` sigue FUERA a proposito (bloques 55 y 58): es
    -- cotejo administrativo de la escuela, no una declaracion del titular.
    v_hash_payload := jsonb_build_object(
        'schema', 'satag.acceptance.v2',
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


-- ---------------------------------------------------------------------
-- 3. VERIFICACION. Todo de solo lectura.
-- ---------------------------------------------------------------------

-- 3a. Sigue habiendo UNA sola forma, la de 28 parametros.
select p.oid::regprocedure as firma
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'crear_registro';
-- Esperado: exactamente 1 fila, con 28 tipos. Si salen 2, algo aplico un
-- create or replace con otra firma: resuelvalo como indica el 6c del 63.

-- 3b. El cambio entro y los grants del 63 siguen ahi.
select position($$in ('padres','alumno','otro')$$ in p.prosrc) > 0     as exige_a_alumno,
       has_function_privilege('anon', p.oid, 'execute')              as anon_ejecuta,
       has_function_privilege('authenticated', p.oid, 'execute')     as authenticated_ejecuta
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'crear_registro';
-- Esperado: true, true y true. Si anon_ejecuta sale false, el formulario
-- publico responde "permission denied": vuelva a emitir el grant del
-- PASO 3c del bloque 63.

-- 3c. LECTURA, no reparacion. Los expedientes de alumno que no tienen
--     apellidos de familia: nacieron antes de que el alta se los pidiera
--     (hasta este bloque solo se exigian a 'padres' y, desde el 63, a
--     'otro'), y se les suman los que Administracion corrija a 'alumno' en
--     la caja, porque registrar_pago no captura ese dato.
--
--     NO se rellenan solos, por el mismo motivo que la consulta hermana
--     del bloque 58: poner apellidos adivinados en el campo que sirve
--     justamente para negarle la instalacion a un externo es peor que
--     dejarlo vacio. Se completan de uno en uno, ya cotejados contra la
--     lista de inscritos. Si devuelve cero filas, no hay nada que hacer.
select r.folio,
       r.tipo_usuario,
       r.estado,
       r.no_dispositivo,
       r.created_at::date                                         as dado_de_alta,
       exists (select 1 from pagos p where p.registro_id = r.id)  as ya_pago
  from registros r
 where r.tipo_usuario = 'alumno'
   and coalesce(btrim(r.apellidos_familia), '') = ''
 order by r.folio;

-- Para completar UNO a mano, ya cotejado (uno por uno, nunca en lote):
--
-- update registros
--    set apellidos_familia = 'Apellido Apellido'
--  where folio = 'SATAG-000000';


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado).
--
-- Volver a correr, tal cual, el PASO 3b del bloque 63 cambiando su
-- `create function` por `create or replace function`: misma firma, sin
-- drop, sin regrant y sin notify. NO corra el PASO 3 completo del 63: su
-- drop se llevaria los grants y el formulario quedaria sin permiso hasta
-- el 3c.
--
-- Hace falta, por ejemplo, si hubo que revertir el deploy del cliente:
-- con el formulario viejo de vuelta en linea, este bloque rechaza todas
-- las altas de alumno. El rollback va ANTES de revertir el deploy, o en
-- el mismo momento.
-- ---------------------------------------------------------------------
