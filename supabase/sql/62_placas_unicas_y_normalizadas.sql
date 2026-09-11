-- =====================================================================
-- 62_placas_unicas_y_normalizadas.sql
--
-- L2-05 (mitad que faltaba): hoy no hay nada que impida que el mismo
-- vehiculo quede registrado en DOS expedientes. `crear_registro` guarda
-- las placas tal cual las mande el cliente (sin upper()); `actualizar_registro`
-- si normaliza con upper() desde el bloque 29. Dos personas -o la misma
-- persona dos veces- pueden dar de alta "UAB1234" y "uab1234" como si
-- fueran distintas, y nada avisa.
--
-- QUE HACE, EN ORDEN:
--   0. Lectura: confirma que no hay duplicados vivos hoy (si los hubiera,
--      el PASO 3 fallaria al crear el indice y hay que resolverlos a mano
--      antes de seguir).
--   1. `crear_registro`: MISMA FIRMA de 27 parametros del bloque 58 (que
--      ya esta aplicado), sin drop/regrant/notify. Normaliza las placas
--      UNA SOLA VEZ en v_placas y usa esa misma variable en el insert y en
--      el hash_payload (hoy el payload recalcula la expresion aparte; si
--      solo se normaliza el insert, el hash sellado dejaria de coincidir
--      con lo guardado). Antes de gastar un folio de la secuencia, avisa
--      si las placas ya estan en otro expediente vivo.
--   2. `actualizar_registro`: MISMA FIRMA de 9 parametros del bloque 49
--      (aplicada 18-ago), sin drop/regrant/notify. Ya normalizaba con
--      upper(); se le agrega el mismo aviso de duplicado que ya existe
--      tres lineas arriba para el numero de TAG (mismo patron, mismo
--      estilo de mensaje, con el folio del otro expediente porque aqui
--      quien lee es TI, no el publico).
--   3. Indice unico parcial sobre placas, solo para expedientes vivos:
--      permite la reposicion por cambio de vehiculo y la baja seguida de
--      un alta nueva con la misma placa, que un indice unico total
--      rompería.
--   4. Verificacion: el indice quedo creado, las dos funciones siguen
--      teniendo una sola forma cada una (sin sobrecarga = sin trampa
--      PostgREST) y una prueba transaccional (con rollback) confirma que
--      el duplicado se rechaza y que un expediente en baja no estorba.
--
-- POR QUE UN INDICE UNICO Y NO UN CHECK.
--
-- El incidente del 10-sep (CHECK `not valid` que congelo el padron, ver
-- la leccion en CroNoma) fue con una restriccion de FILA COMPLETA que se
-- evalua en cada update, incluidos los que no tocan la columna vigilada.
-- Un indice unico es distinto en dos cosas que importan: (a) no admite
-- `not valid` -siempre escanea los datos existentes al crearse, por eso
-- el PASO 0 confirma que hoy no hay duplicados-, y (b) solo se dispara
-- cuando la sentencia ESCRIBE la columna indexada (placas); un update que
-- cambia el color de un auto no lo toca. No hay riesgo de repetir el
-- incidente.
--
-- DOS CAPAS, NO UNA. El aviso amable (`exists(...)` + raise) evita gastar
-- un folio de `registros_folio_seq` en un alta que de todas formas se
-- va a rechazar -la secuencia no se revierte con el rollback, el mismo
-- problema que ya se documento para el folio de recibo de pagos-. El
-- indice unico es quien de verdad lo impide si dos altas llegan a la vez
-- (la ventana entre el exists() y el insert): ese caso se atrapa con un
-- `exception when unique_violation`, igual que ya hace este mismo archivo
-- para el numero de TAG duplicado.
--
-- DESPLIEGUE: no requiere publicar el sitio. Mismas firmas de siempre:
-- sin drop function, sin grants, sin notify pgrst. Aplicar por PASOS.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 0 - LECTURA. Aborta si hay duplicados vivos (el PASO 3 los
-- encontraria de todas formas al crear el indice, pero aqui sale claro
-- cuales son, con folio, para resolverlos a mano antes de seguir).
-- ---------------------------------------------------------------------
do $paso0$
declare
    v_dup record;
    v_hay boolean := false;
begin
    for v_dup in
        select upper(placas) as placas_norm, array_agg(folio order by folio) as folios
          from registros
         where placas is not null and estado <> 'baja'
         group by upper(placas)
        having count(*) > 1
    loop
        v_hay := true;
        raise notice 'DUPLICADO: % en los expedientes %', v_dup.placas_norm, v_dup.folios;
    end loop;

    if v_hay then
        raise exception 'Hay placas duplicadas entre expedientes vivos (ver los avisos NOTICE de arriba). Resuelvalas a mano -baja de uno de los dos, o corregir la placa- antes de aplicar este bloque.';
    else
        raise notice 'Sin duplicados vivos. Continue con el PASO 1.';
    end if;
end;
$paso0$;


-- ---------------------------------------------------------------------
-- PASO 1 - crear_registro: MISMA FIRMA de 27 parametros del bloque 58.
-- Reproduce integro su cuerpo; el delta son las lineas marcadas con
-- "NUEVO 62" abajo.
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
    p_apellidos_familia            text default null
) returns jsonb
language plpgsql
security definer
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
    v_placas text;                      -- NUEVO 62: normalizada una sola vez
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
    if p_tipo_usuario not in ('maestro','padres','alumno','admin') then
        raise exception 'tipo_usuario invalido: %', p_tipo_usuario;
    end if;
    if coalesce(btrim(p_modelo),'') = '' then
        raise exception 'El modelo del vehiculo es obligatorio';
    end if;
    if (p_placas is null or btrim(p_placas) = '') and not coalesce(p_sin_placas,false) then
        raise exception 'Debe capturar placas o marcar sin_placas';
    end if;

    -- NUEVO 62: normalizada UNA SOLA VEZ. De aqui en adelante, tanto el
    -- insert como el hash_payload usan esta misma variable.
    v_placas := nullif(upper(btrim(coalesce(p_placas,''))), '');

    -- NUEVO 62: aviso temprano, ANTES de gastar un folio de la secuencia
    -- (registros_folio_seq no se revierte con un rollback). El indice
    -- unico del PASO 3 es quien de verdad lo garantiza si dos altas
    -- llegan al mismo tiempo; ver el "exception when unique_violation"
    -- mas abajo, junto al insert.
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
    if p_tipo_usuario = 'padres'
       and coalesce(btrim(coalesce(p_apellidos_familia,'')),'') = '' then
        raise exception 'No se recibieron los apellidos de la familia, que son obligatorios cuando el registro es de un padre, una madre o un tutor. Recargue la pagina e intente de nuevo.';
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

    -- NUEVO 62: el insert usa v_placas (ya en mayusculas) en vez de
    -- recalcular la expresion; y va envuelto para atrapar la carrera que
    -- el aviso de arriba no alcanzo a ver (dos altas casi simultaneas).
    begin
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
            v_placas,
            coalesce(p_sin_placas, false),
            v_apellidos_familia,
            nullif(btrim(coalesce(p_observaciones,'')), ''),
            'pendiente'
        ) returning id into v_registro_id;
    exception when unique_violation then
        raise exception 'Las placas % ya estan registradas en otro expediente. Si el vehiculo cambio de titular, solicite primero la baja del expediente anterior.', v_placas;
    end;

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

    return jsonb_build_object(
        'id', v_registro_id,
        'folio', v_folio,
        'estado', 'pendiente'
    );
end;
$$;

-- Sin drop, sin revoke/grant y sin notify: misma firma de 27 parametros
-- del bloque 58; los grants a anon/authenticated siguen en pie.


-- ---------------------------------------------------------------------
-- PASO 2 - actualizar_registro: MISMA FIRMA de 9 parametros del bloque
-- 49 (aplicado 18-ago). Reproduce integro su cuerpo; el delta son las
-- lineas marcadas con "NUEVO 62".
-- ---------------------------------------------------------------------
create or replace function actualizar_registro(
    p_registro_id    uuid,
    p_no_dispositivo text default null,
    p_placas         text default null,
    p_sin_placas     boolean default null,
    p_marca          text default null,
    p_modelo         text default null,
    p_color          text default null,
    p_motivo         text default null,
    p_hecho_por      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_r registros%rowtype;
    v_quien text;
    v_detalles text[] := '{}';
    v_tag text;
    v_dup_folio text;
    v_sin_placas boolean;
    v_placas text;
    v_hubo_reposicion boolean := false;
begin
    perform panel_exigir_rol(array['ti']);

    select * into v_r from registros where id = p_registro_id;
    if v_r.id is null then
        raise exception 'Registro no encontrado';
    end if;
    if v_r.estado = 'baja' then
        raise exception 'El registro esta dado de baja';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por,'')), ''), 'TI');

    if p_no_dispositivo is not null and btrim(p_no_dispositivo) <> coalesce(v_r.no_dispositivo, '') then
        if v_r.no_dispositivo is null then
            raise exception 'El registro no tiene TAG instalado: use "Instalar TAG"';
        end if;
        v_tag := btrim(p_no_dispositivo);
        if v_tag !~ '^[0-9]{6,11}$' then
            raise exception 'El nuevo No. de TAG debe tener de 6 a 11 digitos';
        end if;
        select folio into v_dup_folio
          from registros
         where id <> p_registro_id and no_dispositivo = v_tag and estado <> 'baja'
         limit 1;
        if v_dup_folio is not null then
            raise exception 'El TAG % ya esta activo en otro registro (%)', v_tag, v_dup_folio;
        end if;

        insert into movimientos (registro_id, tipo, motivo, hecho_por, no_dispositivo_anterior, no_dispositivo_nuevo)
        values (
            p_registro_id, 'reposicion',
            coalesce(nullif(btrim(coalesce(p_motivo,'')), ''), 'Reposicion de TAG'),
            v_quien, v_r.no_dispositivo, v_tag
        );

        begin
            update registros
               set no_dispositivo = v_tag, fecha_instalacion = current_date
             where id = p_registro_id;
        exception when unique_violation then
            raise exception 'El TAG % ya esta activo en otro registro', v_tag;
        end;
        v_hubo_reposicion := true;
    end if;

    -- Placas / sin placas. Ya normalizaba con upper() desde el bloque 29;
    -- lo NUEVO 62 es el aviso de duplicado, con el mismo patron de arriba
    -- (select folio -> raise) que ya usa el numero de TAG.
    if p_sin_placas is not null or p_placas is not null then
        v_sin_placas := coalesce(p_sin_placas, v_r.sin_placas);
        v_placas := case
            when v_sin_placas then null
            else nullif(upper(btrim(coalesce(p_placas, v_r.placas, ''))), '')
        end;
        if not v_sin_placas and v_placas is null then
            raise exception 'Capture las placas o marque "sin placas"';
        end if;
        if v_placas is distinct from v_r.placas or v_sin_placas <> v_r.sin_placas then
            if v_placas is not null then
                select folio into v_dup_folio
                  from registros
                 where id <> p_registro_id and upper(placas) = v_placas and estado <> 'baja'
                 limit 1;
                if v_dup_folio is not null then
                    raise exception 'Las placas % ya estan registradas en el expediente %', v_placas, v_dup_folio;
                end if;
            end if;
            v_detalles := v_detalles ||
                ('placas ' || coalesce(v_r.placas, 'sin placas') || ' -> ' || coalesce(v_placas, 'sin placas'));
            begin
                update registros set placas = v_placas, sin_placas = v_sin_placas where id = p_registro_id;
            exception when unique_violation then
                raise exception 'Las placas % ya estan registradas en otro expediente', v_placas;
            end;
        end if;
    end if;

    if p_marca is not null and btrim(p_marca) <> '' and btrim(p_marca) <> v_r.marca then
        v_detalles := v_detalles || ('marca ' || v_r.marca || ' -> ' || btrim(p_marca));
        update registros set marca = btrim(p_marca) where id = p_registro_id;
    end if;
    if p_modelo is not null and btrim(p_modelo) <> '' and btrim(p_modelo) <> v_r.modelo then
        v_detalles := v_detalles || ('modelo ' || v_r.modelo || ' -> ' || btrim(p_modelo));
        update registros set modelo = btrim(p_modelo) where id = p_registro_id;
    end if;
    if p_color is not null and btrim(p_color) <> '' and btrim(p_color) <> v_r.color then
        v_detalles := v_detalles || ('color ' || v_r.color || ' -> ' || btrim(p_color));
        update registros set color = btrim(p_color) where id = p_registro_id;
    end if;

    if not v_hubo_reposicion and coalesce(array_length(v_detalles, 1), 0) = 0 then
        raise exception 'No hay cambios que guardar';
    end if;

    if coalesce(array_length(v_detalles, 1), 0) > 0 then
        insert into movimientos (registro_id, tipo, motivo, hecho_por)
        values (
            p_registro_id, 'cambio',
            'Actualizacion: ' || array_to_string(v_detalles, '; ')
                || case when coalesce(btrim(coalesce(p_motivo,'')), '') <> ''
                        then ' - ' || btrim(p_motivo) else '' end,
            v_quien
        );
    end if;

    update solicitudes
       set atendida = true, atendida_en = now(), atendida_por = v_quien,
           resolucion = 'ejecutada'
     where registro_id = p_registro_id and tipo = 'actualizacion' and not atendida;

    return jsonb_build_object('id', p_registro_id);
end;
$$;

-- Sin drop, sin revoke/grant y sin notify: misma firma de 9 parametros
-- del bloque 49; los grants a authenticated siguen en pie.


-- ---------------------------------------------------------------------
-- PASO 3 - INDICE. La garantia real contra la carrera entre dos altas
-- casi simultaneas. Sin `concurrently`: la tabla tiene un puñado de
-- filas y el candado breve no afecta nada en produccion a esta hora.
-- ---------------------------------------------------------------------
create unique index if not exists uq_registros_placas_vigentes
    on registros (upper(placas))
    where placas is not null and estado <> 'baja';


-- ---------------------------------------------------------------------
-- PASO 4 - VERIFICACION.
-- ---------------------------------------------------------------------

-- 4a. El indice quedo creado.
select indexname, indexdef
  from pg_indexes
 where indexname = 'uq_registros_placas_vigentes';
-- Esperado: 1 fila.

-- 4b. Ninguna de las dos funciones quedo con una segunda forma (eso
-- delataria una trampa PostgREST: dos firmas distintas conviviendo).
select proname, count(*) as formas
  from pg_proc
 where proname in ('crear_registro','actualizar_registro')
 group by proname;
-- Esperado: 1 en las dos filas.

-- 4c. Prueba transaccional. Usa un expediente de prueba existente (o el
-- primero que encuentre); no deja nada escrito porque todo el bloque
-- corre dentro de un begin/rollback (peguelo y corralo completo, no
-- statement por statement, para que el rollback alcance a las dos pruebas).
begin;
do $prueba$
declare
    v_folio_base text;
    v_placas_base text;
    v_id_otro uuid;
    v_folio_otro text;
begin
    select folio, placas into v_folio_base, v_placas_base
      from registros
     where placas is not null and estado <> 'baja'
     limit 1;

    if v_folio_base is null then
        raise notice 'No hay ningun expediente con placas para probar; PASO 4c omitido.';
        return;
    end if;

    select id, folio into v_id_otro, v_folio_otro
      from registros
     where folio <> v_folio_base
     limit 1;

    if v_id_otro is null then
        raise notice 'Solo hay un expediente en la base; PASO 4c omitido (hace falta un segundo para probar el choque).';
        return;
    end if;

    -- Caso 1, debe FALLAR: un segundo expediente VIVO con la misma placa,
    -- en minusculas (prueba tambien que el indice normaliza con upper()).
    begin
        update registros
           set placas = lower(v_placas_base), estado = 'pendiente'
         where id = v_id_otro;
        raise exception 'FALLO LA PRUEBA: se permitio un duplicado entre % y % (%).', v_folio_base, v_folio_otro, v_placas_base;
    exception when unique_violation then
        raise notice 'OK: el indice rechazo el duplicado de % contra % (%).', v_folio_otro, v_folio_base, v_placas_base;
    end;

    -- Caso 2, debe PASAR: el mismo segundo expediente, pero DADO DE BAJA,
    -- puede compartir la placa con el expediente vivo v_folio_base.
    begin
        update registros
           set placas = v_placas_base, estado = 'baja',
               motivo_baja = 'prueba PASO 4 (bloque 62)', fecha_baja = current_date
         where id = v_id_otro;
        raise notice 'OK: % en baja comparte placas con % (vivo) sin conflicto.', v_folio_otro, v_folio_base;
    exception when unique_violation then
        raise exception 'FALLO LA PRUEBA: el indice bloqueo un caso que debia permitirse (baja).';
    end;

    raise notice 'Prueba completa. El ROLLBACK de abajo descarta los cambios de prueba.';
end;
$prueba$;
rollback;


-- ---------------------------------------------------------------------
-- ROLLBACK del bloque completo (comentado). Devuelve las dos funciones
-- a su cuerpo anterior (bloques 58 y 49) y quita el indice.
-- ---------------------------------------------------------------------
-- drop index if exists uq_registros_placas_vigentes;
-- -- y volver a correr, en este orden: 55_apellidos_familia.sql (PASO 2,
-- -- crear_registro) seguido de 58_apellidos_sin_congelar.sql (PASO 2, que
-- -- lo reemplaza) y 49_versiones_obligatorias_y_usted.sql (PASO 5,
-- -- actualizar_registro).
