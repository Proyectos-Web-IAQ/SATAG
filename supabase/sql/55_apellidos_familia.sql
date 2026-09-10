-- =====================================================================
-- 55_apellidos_familia.sql   (junta 9-sep: control de externos)
--
-- Administracion pidio poder distinguir a una familia de la escuela de
-- quien no lo es ANTES de instalar el TAG. Hoy el expediente no lo
-- permite: guarda los nombres de quien conduce, que muy seguido no
-- coinciden con los apellidos del alumno (madre con apellido de soltera,
-- abuelo, tio, chofer). Con los apellidos de la familia capturados en el
-- alta, TI y Administracion pueden cotejar contra la lista de inscritos y
-- negar la instalacion a un externo sin tener que preguntar por telefono.
--
-- POR QUE ESTE BLOQUE VA EN DOS PARTES Y NO EN UN SOLO "Run all"
--
-- La parte A es compatible hacia atras A PROPOSITO. La columna nace
-- nullable y el parametro nuevo entra AL FINAL de la firma y con
-- `default null`: el cliente que HOY esta publicado manda sus 26
-- argumentos por nombre, no conoce el apellido de familia, y despues de
-- la parte A sigue dando de alta exactamente igual. Por eso la parte A se
-- puede correr cuando se quiera, incluso con el sitio en vivo y con gente
-- registrandose, sin esperar al deploy.
--
-- La parte B es la que si rompe. El CHECK vuelve obligatorio el campo
-- cuando el tipo es 'padres'; el cliente viejo manda ese campo nulo, asi
-- que si la parte B entrara junto con la A habria una ventana —desde el
-- momento de correr el SQL hasta que el deploy nuevo quede publicado— en
-- la que el sitio en vivo rechazaria TODA alta de padres, con un error de
-- base de datos que el papa o la mama no pueden resolver desde el
-- navegador. Esa ventana no se acorta "corriendo rapido": el deploy tarda
-- lo que tarda. Se elimina separando las dos partes, y ese es el unico
-- motivo por el que este archivo esta partido.
--
-- ORDEN: parte A -> deploy del cliente que captura el campo -> comprobar
-- un alta real de padres en el sitio -> parte B.
--
-- QUE cambia:
--   - columna nueva `registros.apellidos_familia` (PII);
--   - `crear_registro` pasa de 26 a 27 parametros. CAMBIA LA FIRMA, asi
--     que lleva la receta completa de la trampa PostgREST documentada en
--     los bloques 41, 49 y 50: drop function con la lista de tipos vieja,
--     create, VOLVER a emitir revoke/grant (los grants NO sobreviven al
--     drop) y notify pgrst al final. Con `create or replace` a secas
--     quedarian dos sobrecargas vivas y PostgREST serviria la equivocada.
--
-- QUE NO cambia:
--   - La evidencia de firma. El payload sellado sigue siendo
--     'satag.acceptance.v1' con los mismos campos: el apellido de familia
--     es un control administrativo de la escuela, no algo que el titular
--     declare o acepte, y meterlo al hash cambiaria el documento que se
--     firma para todos los expedientes nuevos sin subir la version del
--     esquema. Costo asumido: el apellido de familia NO queda cubierto
--     por el hash; si algun dia tiene que ser probatorio, toca una v2 del
--     payload, no un parche aqui.
--   - `crear_registro` NO valida el campo nuevo. [CORREGIDO EL 10-SEP: SI
--     lo valida, desde el bloque 58. Cuando se escribio esto, la
--     obligatoriedad vivia en la restriccion de la parte B, que resulto
--     ser el instrumento equivocado y quedo revocada.]
--
-- SIN BACKFILL: el padron se vacia antes del lunes 14-sep
-- (`limpiar_padron_piloto.sql`), asi que no hay expedientes viejos que
-- rellenar. [CORREGIDO EL 10-SEP: aqui decia que si la parte B se
-- corriera con padron cargado, el `not valid` dejaria en paz a los
-- expedientes viejos. ES FALSO y costo un incidente en produccion:
-- `not valid` solo se salta la revision retroactiva una vez, y despues
-- el CHECK se evalua en cada update. Ver el banner de la parte B.]
--
-- Depende de: bloques 12 y 49 aplicados. La version vigente de
-- crear_registro es la del bloque 49 (D-01: versiones obligatorias), y es
-- la que se reproduce integra aqui.
-- =====================================================================


-- #####################################################################
-- PARTE A - SE PUEDE APLICAR CUANDO SEA, INCLUSO CON EL SITIO EN VIVO
-- #####################################################################


-- ---------------------------------------------------------------------
-- A.1) La columna. Nullable a proposito: la obligatoriedad es de la
--      parte B. `if not exists` para poder recorrer el bloque dos veces
--      sin que truene a la mitad.
-- ---------------------------------------------------------------------
alter table registros add column if not exists apellidos_familia text;

comment on column registros.apellidos_familia is 'PII (LFPDPPP). Apellidos de la familia del alumno, para cotejar contra la lista de inscritos; obligatorio cuando tipo_usuario = padres (bloque 55, parte B)';


-- ---------------------------------------------------------------------
-- A.2) Fuera la firma vieja de 26 tipos. Va con la lista COMPLETA porque
--      `drop function crear_registro` a secas no sabe cual sobrecarga
--      quitar. Los grants se van con ella: se vuelven a emitir en A.4.
-- ---------------------------------------------------------------------
drop function if exists crear_registro(
    text, text, text, text, text, text, text, boolean, text,
    text, text, text, text, text, text, boolean, text, jsonb, text, inet, text, jsonb, text, text, uuid, uuid
);


-- ---------------------------------------------------------------------
-- A.3) La funcion nueva. Cuerpo IDENTICO al del bloque 49 (folio,
--      versiones obligatorias de D-01, aceptacion con su hash, movimiento
--      de alta) salvo dos lineas: la normalizacion del apellido de
--      familia y su guardado en el insert.
-- ---------------------------------------------------------------------
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
    -- El parametro 27 va AL FINAL y con default null para no mover de
    -- lugar a los 26 que el cliente ya publicado sigue mandando.
    p_apellidos_familia            text default null
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
    v_sello_tiempo timestamptz := clock_timestamp();
    v_hash_payload jsonb;
    v_hash_documento text;
    v_headers json;
    v_xff text;
    v_ip_origen inet;
    v_user_agent text;
begin
    -- D-01 (servidor): las versiones son obligatorias. El cliente corregido
    -- bloquea el envio si los documentos no cargaron, asi que llegar aqui
    -- sin ids solo puede ser un cliente viejo o una llamada directa: se
    -- rechaza en lugar de resolver por cuenta propia.
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
    if p_tipo_usuario not in ('maestro','padres','alumno','admin') then
        raise exception 'tipo_usuario invalido: %', p_tipo_usuario;
    end if;
    if coalesce(btrim(p_modelo),'') = '' then
        raise exception 'El modelo del vehiculo es obligatorio';
    end if;
    if (p_placas is null or btrim(p_placas) = '') and not coalesce(p_sin_placas,false) then
        raise exception 'Debe capturar placas o marcar sin_placas';
    end if;
    if coalesce(btrim(p_firma_url),'') = '' then
        raise exception 'Falta la firma (firma_url)';
    end if;
    if p_firma_imagen_sha256 is not null and p_firma_imagen_sha256 !~ '^[0-9a-f]{64}$' then
        raise exception 'firma_imagen_sha256 debe ser SHA-256 en hexadecimal';
    end if;
    -- Gestionante presente si viene el nombre; en ese caso exige apellido paterno.
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
    -- Aqui NO se valida el apellido de familia: lo exige la restriccion de
    -- la parte B. Mientras el cliente viejo siga en vivo, exigirlo desde
    -- la funcion tumbaria todas las altas de padres (ver el encabezado).

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

    -- Mismo saneo que el resto del expediente: se van los espacios de
    -- sobra y la cadena vacia se guarda como NULL, para que "vacio" tenga
    -- una sola representacion y la restriccion de la parte B no se pueda
    -- burlar mandando "   ".
    v_apellidos_familia := nullif(btrim(coalesce(p_apellidos_familia,'')), '');

    -- Captura confiable de IP y user-agent desde los headers de la peticion (server-side).
    -- Supabase/PostgREST exponen los headers en el setting request.headers.
    v_headers := nullif(current_setting('request.headers', true), '')::json;
    v_user_agent := coalesce(
        nullif(btrim(coalesce(v_headers ->> 'user-agent', '')), ''),
        nullif(btrim(coalesce(p_user_agent, '')), '')
    );
    v_xff := btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1));
    begin
        v_ip_origen := nullif(v_xff, '')::inet;   -- primer IP del x-forwarded-for
    exception when others then
        v_ip_origen := null;                      -- header malformado: no rompe el alta
    end;
    v_ip_origen := coalesce(v_ip_origen, p_ip_origen);

    -- Folio publico humano. Se asigna aqui (no como DEFAULT de la tabla).
    v_folio := 'SATAG-' || lpad(nextval('registros_folio_seq')::text, 6, '0');

    insert into registros (
        folio,
        usuario_nombres, usuario_apellido_paterno, usuario_apellido_materno,
        gestionante_nombres, gestionante_apellido_paterno, gestionante_apellido_materno,
        gestionante_relacion, usuario_es_menor,
        tipo_usuario, procedencia_tag, marca, modelo, color, placas, sin_placas,
        apellidos_familia,
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
        nullif(btrim(coalesce(p_placas,'')), ''),
        coalesce(p_sin_placas, false),
        v_apellidos_familia,
        nullif(btrim(coalesce(p_observaciones,'')), ''),
        'pendiente'
    ) returning id into v_registro_id;

    -- El payload NO cambia (sigue siendo satag.acceptance.v1): el apellido
    -- de familia es control administrativo de la escuela, no parte de lo
    -- que el titular acepto. Ver el encabezado.
    v_hash_payload := jsonb_build_object(
        'schema', 'satag.acceptance.v1',
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
            'marca', btrim(p_marca),
            'modelo', btrim(p_modelo),
            'color', btrim(p_color),
            'placas', nullif(btrim(coalesce(p_placas,'')), ''),
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
-- A.4) Los permisos, otra vez. El drop de A.2 se llevo los del bloque 19,
--      y una funcion recien creada solo la puede ejecutar su dueno: sin
--      esto el formulario publico responde "permission denied". La lista
--      es la NUEVA, de 27 tipos.
-- ---------------------------------------------------------------------
revoke all on function crear_registro(
    text, text, text, text, text, text, text, boolean, text,
    text, text, text, text, text, text, boolean, text, jsonb, text, inet, text, jsonb, text, text, uuid, uuid, text
) from public;
grant execute on function crear_registro(
    text, text, text, text, text, text, text, boolean, text,
    text, text, text, text, text, text, boolean, text, jsonb, text, inet, text, jsonb, text, text, uuid, uuid, text
) to anon, authenticated;


-- ---------------------------------------------------------------------
-- A.5) PostgREST cachea las firmas: sin esto sigue anunciando la de 26
--      parametros y rechaza el argumento nuevo como desconocido.
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';


-- #####################################################################
-- #####################################################################
-- ##                                                                 ##
-- ##   PARTE B - REVOCADA EL 10-SEP-2026. NO LA CORRA.               ##
-- ##                                                                 ##
-- ##   Se aplico, rompio el sistema en produccion, y el bloque 58    ##
-- ##   la solto. Queda aqui comentada como testimonio de lo que se   ##
-- ##   aplico, no como instruccion.                                  ##
-- ##                                                                 ##
-- ##   QUE PASO. Esta parte decia que `not valid` dejaba en paz a    ##
-- ##   los expedientes que ya existian. ES FALSO, y es el error que  ##
-- ##   costo el incidente: `not valid` solo se salta la revision     ##
-- ##   retroactiva UNA vez; despues el CHECK se evalua en CADA       ##
-- ##   insert y en CADA update, sobre la fila nueva completa.        ##
-- ##                                                                 ##
-- ##   Como `apellidos_familia` la escribe UN SOLO sitio en todo el  ##
-- ##   sistema (crear_registro, el alta publica) y ninguna pantalla  ##
-- ##   del panel la captura ni la corrige, todo expediente de tipo   ##
-- ##   'padres' con la columna vacia quedo CONGELADO: no se podia    ##
-- ##   cobrar, ni instalar, ni dar de baja, ni actualizar. Hay 11    ##
-- ##   bloques que hacen `update registros`. Y `registrar_pago`      ##
-- ##   CAMBIA el tipo a 'padres' al validarlo en caja, asi que el    ##
-- ##   empleado que tambien es papa reventaba el cobro entero.       ##
-- ##                                                                 ##
-- ##   DONDE VIVE AHORA EL CONTROL: en `crear_registro`, exigido en  ##
-- ##   el alta con un mensaje en espanol (bloque 58). Es donde        ##
-- ##   Administracion lo pidio y el unico sitio que escribe el dato. ##
-- ##                                                                 ##
-- #####################################################################
-- #####################################################################

-- COMENTADA A PROPOSITO. Descomentarla vuelve a congelar el padron.
-- alter table registros add constraint reg_apellidos_familia_requeridos
--     check (tipo_usuario <> 'padres' or (apellidos_familia is not null and btrim(apellidos_familia) <> ''))
--     not valid;

-- Aqui habia una linea para `validate constraint`. Tampoco corre: la
-- restriccion ya no existe, la solto el bloque 58. Se retira para que no
-- quede ni una sola instruccion ejecutable en esta parte del archivo.


-- Auditoria esperada:
--
-- Despues de la PARTE A (con el cliente viejo todavia en vivo):
-- - `select count(*) from pg_proc where proname = 'crear_registro';` -> 1.
--   Si sale 2, el drop de A.2 no empato la lista de tipos y quedaron dos
--   sobrecargas: PostgREST serviria la que se le antoje.
-- - `select pg_get_function_identity_arguments(oid) from pg_proc where proname = 'crear_registro';`
--   -> 27 parametros, el ultimo `p_apellidos_familia text`.
-- - `select has_function_privilege('anon', 'crear_registro(text,text,text,text,text,text,text,boolean,text,text,text,text,text,text,text,boolean,text,jsonb,text,inet,text,jsonb,text,text,uuid,uuid,text)', 'execute');`
--   -> true, y lo mismo para 'authenticated'. Si sale false, se salto A.4.
-- - Un alta de padres desde el sitio publicado (que NO manda el campo)
--   sigue funcionando y devuelve folio; la columna queda NULL. Esta es LA
--   prueba de que la parte A no rompio nada.
-- - Un alta que si manda `p_apellidos_familia`: la columna guarda el texto
--   sin espacios de sobra, y mandarlo como "   " lo deja en NULL.
-- - La aceptacion de esa alta conserva su hash verificable y el payload
--   sigue diciendo 'satag.acceptance.v1', sin apellidos de familia dentro.
--
-- Despues del deploy y de la PARTE B:
-- - Alta de padres CON apellidos de familia: pasa.
-- - Alta de padres SIN el campo (por API o SQL directo): la base la
--   rechaza por `reg_apellidos_familia_requeridos`. Confirmar que en
--   pantalla ese error no sale crudo: el formulario debe pedir el dato
--   antes de enviar.
-- - Alta de maestro / alumno / admin sin el campo: pasa. La restriccion
--   solo alcanza a 'padres'.
-- - Update de un expediente de padres dejando el campo vacio: rechazado
--   (la restriccion vigila tambien los updates, no solo el alta).
-- - `select convalidated from pg_constraint where conname = 'reg_apellidos_familia_requeridos';`
--   -> false mientras no se corra la linea comentada del final. Eso es lo
--   esperado, no un pendiente urgente.
