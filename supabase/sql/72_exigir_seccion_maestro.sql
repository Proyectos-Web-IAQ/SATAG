-- =====================================================================
-- 72_exigir_seccion_maestro.sql   (SC-030, mejora continua de L2-09)
--
-- REDACTADO EL 17-SEP-2026. **NO SE APLICA TODAVIA.** Va en la ventana de
-- mejora continua, a partir de la semana del 28-sep, y solo despues de
-- comprobar a mano que el formulario publicado NO deja enviar un alta de
-- maestro sin seccion. Hoy el formulario ya la pide y no avanza sin ella,
-- pero eso se comprueba el dia que se aplique, no el dia que se escribe:
-- un bundle puede haber cambiado en medio.
--
-- POR QUE. El bloque 70 recaba la seccion del maestro y la sella en la
-- firma, pero NO la exige: si viene, la valida; si no viene, guarda null.
-- Se dejo asi a proposito, porque el 70 se aplico ANTES del deploy y el
-- formulario viejo no la mandaba. Ya publicado y verificado el formulario,
-- este bloque cierra la mitad que faltaba. Es exactamente la relacion que
-- tuvieron el 63 y el 65 con los apellidos de la familia.
--
-- QUE PASA SI NO SE APLICA. Un maestro puede quedar sin seccion, y
-- entonces TI no recibe los estacionamientos sugeridos al instalar y el
-- aviso de descarga a ZK no puede listarlo por estacionamiento. No se
-- rompe nada: se trabaja a mano y se pierde la ayuda.
--
-- *** EL CANDADO DE SESION, Y POR QUE ***
-- La base no puede ver si el sitio ya se publico. El 11-sep este mismo
-- descuido tumbo el alta de alumno en vivo: se aplico la exigencia de los
-- apellidos mientras el sitio seguia sirviendo el formulario viejo, y toda
-- alta de ese tipo se rechazo hasta que el bundle nuevo llego a cada
-- navegador. Por eso este bloque aborta sin la frase, y la frase dice lo
-- que hay que haber comprobado:
--
--     set satag.seccion_obligatoria = 'SI, EL FORMULARIO YA EXIGE LA SECCION';
--
-- Como PRIMERA linea y en la MISMA ejecucion: en dos ejecuciones separadas
-- el SQL Editor puede cambiar de conexion y la frase no llega.
--
-- COMO COMPROBARLO ANTES, a mano, en /registro/ del sitio publicado:
--   1. Elija conductor «Maestro». Debe aparecer el selector de seccion.
--   2. Intente continuar sin elegirla. NO debe avanzar.
-- Y que el chunk publicado mande el parametro, con el bucle de curl que
-- documenta el bloque 70.
--
-- MISMA FIRMA DE 29 PARAMETROS DEL 70: `create or replace` en sitio, SIN
-- drop, SIN regrant y SIN notify; los grants del 70 se conservan. El
-- cuerpo es el vigente del 70, INTEGRO, con un solo delta marcado
-- "NUEVO 72". Se genero extrayendolo del archivo del 70 y no
-- transcribiendolo a mano, para que no haya diferencia de una coma.
--
-- LO QUE ESTE BLOQUE NO ARREGLA, a proposito: el expediente corregido a
-- «maestro» en la caja sigue quedando sin seccion, porque registrar_pago
-- no la toca y ninguna pantalla la captura. Eso es el bloque 73.
--
-- Depende de: 70 (crear_registro de 29 parametros) y 69 (aviso v7).
-- Sin backfill: los maestros sin seccion que ya existan se LISTAN al final
-- y no se reparan, mismo criterio de los bloques 58 y 65. Rellenar a
-- ciegas el dato del que depende un permiso de acceso seria peor que
-- dejarlo vacio.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. GUARDIA. Va primero: si aborta, no se aplico nada.
-- ---------------------------------------------------------------------
do $guardia$
declare
    v_candado text := coalesce(current_setting('satag.seccion_obligatoria', true), '');
    v_formas  int;
    v_aviso   boolean;
begin
    if v_candado <> 'SI, EL FORMULARIO YA EXIGE LA SECCION' then
        raise exception 'Bloque 72 cancelado: falta el candado. Compruebe en /registro/ del sitio PUBLICADO que un alta de maestro no avanza sin elegir la seccion, y pegue  set satag.seccion_obligatoria = ''SI, EL FORMULARIO YA EXIGE LA SECCION'';  como primera linea, en la misma ejecucion. No se aplico nada.';
    end if;

    select count(*) into v_formas
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'crear_registro';
    if v_formas <> 1 then
        raise exception 'Bloque 72 cancelado: crear_registro tiene % formas y deberia tener 1. Un create or replace sobre la firma equivocada dejaria dos sobrecargas vivas: la trampa PostgREST. No se aplico nada.', v_formas;
    end if;

    if to_regprocedure('public.crear_registro(text,text,text,text,text,text,text,boolean,text,text,text,text,text,text,text,boolean,text,jsonb,text,inet,text,jsonb,text,text,uuid,uuid,text,text,text)') is null then
        raise exception 'Bloque 72 cancelado: no existe la firma de 29 parametros. Aplique primero el bloque 70. No se aplico nada.';
    end if;

    select position('se le pide la sección en la que trabaja' in contenido) > 0
      into v_aviso
      from aviso_versiones where vigente;
    if not coalesce(v_aviso, false) then
        raise exception 'Bloque 72 cancelado: el aviso de privacidad vigente no informa la seccion del maestro. Aplique primero el bloque 69. No se aplico nada.';
    end if;
end
$guardia$;


-- ---------------------------------------------------------------------
-- 1. crear_registro, misma firma, con la seccion obligatoria.
--    Cuerpo vigente del bloque 70, integro, mas el delta "NUEVO 72".
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
    p_parentesco_otro              text default null,
    -- NUEVO 70: parametro 29, AL FINAL y con default null. El formulario
    -- publicado antes de este bloque no lo manda y sigue funcionando.
    p_seccion_maestro              text default null
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
    -- NUEVO 72: ahora SI se exige. Es el unico delta respecto al bloque 70,
    -- y va antes del nextval, asi que un rechazo aqui no gasta folio.
    elsif v_seccion_maestro is null then
        raise exception 'Indique la seccion en la que trabaja: preescolar, primaria, secundaria o preparatoria. Es obligatoria para el personal docente, porque de ella depende el estacionamiento al que da acceso su TAG. Recargue la pagina e intente de nuevo.';
    elsif v_seccion_maestro not in ('preescolar','primaria','secundaria','preparatoria') then
        raise exception 'La seccion del maestro debe ser preescolar, primaria, secundaria o preparatoria. Recargue la pagina e intente de nuevo.';
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
        'schema', 'satag.acceptance.v3',
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

-- Sin drop, sin revoke/grant y sin notify: la firma no cambia y los grants
-- del bloque 70 a anon y authenticated se conservan intactos.


-- ---------------------------------------------------------------------
-- 2. VERIFICACION (solo lectura). `ok` en true en las cuatro filas.
-- ---------------------------------------------------------------------
select 1 as orden, 'crear_registro: una sola forma, de 29 parametros' as que,
       (select string_agg(p.oid::regprocedure::text, ' | ')
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'crear_registro') as valor,
       (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'crear_registro')
       and to_regprocedure('public.crear_registro(text,text,text,text,text,text,text,boolean,text,text,text,text,text,text,text,boolean,text,jsonb,text,inet,text,jsonb,text,text,uuid,uuid,text,text,text)') is not null as ok
union all
select 2, 'exige la seccion al maestro', null,
       (select position('Es obligatoria para el personal docente' in p.prosrc) > 0
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'crear_registro')
union all
select 3, 'grants de anon y authenticated intactos', null,
       has_function_privilege('anon', 'public.crear_registro(text,text,text,text,text,text,text,boolean,text,text,text,text,text,text,text,boolean,text,jsonb,text,inet,text,jsonb,text,text,uuid,uuid,text,text,text)', 'execute')
       and has_function_privilege('authenticated', 'public.crear_registro(text,text,text,text,text,text,text,boolean,text,text,text,text,text,text,text,boolean,text,jsonb,text,inet,text,jsonb,text,text,uuid,uuid,text,text,text)', 'execute')
union all
select 4, 'sigue sellando satag.acceptance.v3', null,
       (select position('satag.acceptance.v3' in p.prosrc) > 0
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'crear_registro')
order by orden;


-- ---------------------------------------------------------------------
-- 3. LOS QUE YA EXISTEN SIN SECCION. Se MUESTRAN, no se reparan.
--    Si sale alguno, TI le asigna el estacionamiento a mano al instalar;
--    la seccion se le puede poner cuando exista la pantalla (bloque 73 o
--    la correccion desde TI).
-- ---------------------------------------------------------------------
select folio,
       estado,
       to_char(created_at at time zone 'America/Mexico_City', 'DD-Mon HH24:MI') as alta
  from registros
 where tipo_usuario = 'maestro'
   and seccion_maestro is null
   and estado <> 'baja'
 order by created_at;
-- Cero filas es lo esperado si el formulario lleva dias pidiendola.


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). La firma no cambia, asi que basta con volver a
-- poner el cuerpo del bloque 70 con `create or replace`:
--
--   Corra el PASO 2b de 70_crear_registro_seccion_maestro.sql cambiando
--   `create function` por `create or replace function`.
--
-- NO hace falta revertir ningun deploy: el formulario publicado manda la
-- seccion de todos modos, y con el cuerpo del 70 simplemente deja de ser
-- obligatoria. Sin drop, sin regrant, sin notify.
-- ---------------------------------------------------------------------
