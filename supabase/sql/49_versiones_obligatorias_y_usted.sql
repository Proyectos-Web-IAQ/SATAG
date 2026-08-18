-- =====================================================================
-- 49_versiones_obligatorias_y_usted.sql
-- Dos arreglos que viven en los RPC y cierran defectos abiertos:
--
-- (1) D-01, mitad de servidor: crear_registro YA NO resuelve las versiones
--     del aviso y el reglamento cuando el cliente las manda nulas. Antes las
--     resolvia solo (19_rpc_crear_registro.sql:81-89 y :100-108) y firmaba
--     la aceptacion con hash valido de un documento que en pantalla pudo no
--     haberse pintado nunca (asi nacio SATAG-000302). Ahora ambos ids son
--     obligatorios: la evidencia registra LO QUE SE MOSTRO, o no hay alta.
--     Se registra la version que el cliente declara haber mostrado (con
--     comprobacion de que existe); no se exige que sea la vigente, porque
--     si una version nueva se publica a media sesion, lo juridicamente
--     cierto es lo que la persona leyo.
--
-- (2) D-07 / CC-07, las cadenas de la base: tuteaban 10 mensajes vivos
--     alcanzables desde pantalla (inventario del 18-ago contra pg_proc,
--     no contra el repo: 3 del buzon publico en crear_solicitud, 1 en
--     panel_exigir_rol, 1 en dar_baja, 1 en instalar_tag_con_estacionamiento,
--     1 en vincular_nota, y 3 en las obreras internas instalar_tag y
--     actualizar_registro, que SI llegan a pantalla porque las envolventes
--     _con_estacionamiento las llaman por dentro). Todos quedan de usted.
--
-- ORDEN DE DESPLIEGUE (importa): este bloque se aplica DESPUES de publicar
-- el cliente que manda p_aviso_version_id y p_reglamento_version_id (el
-- cliente de hoy no los manda: los ids viajan a partir del commit que
-- acompana a este bloque). Al reves, el formulario publico rechazaria
-- todas las altas.
--
-- Tecnica: create or replace con LAS MISMAS FIRMAS en las 8 funciones.
-- Sin drop function (los grants se conservan) y sin cambio de firma para
-- PostgREST; el notify del final refresca los cuerpos por higiene.
--
-- Depende de: bloques 19, 28, 29, 38 y 41 aplicados.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) crear_registro (bloque 19): versiones obligatorias. Cuerpo identico
--    salvo la resolucion de versiones (el arreglo de D-01) y nada mas.
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
    p_aviso_version_id             uuid default null
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
        nullif(btrim(coalesce(p_observaciones,'')), ''),
        'pendiente'
    ) returning id into v_registro_id;

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
-- 2) crear_solicitud (bloque 28): las 3 cadenas del buzon publico, de usted.
-- ---------------------------------------------------------------------
create or replace function crear_solicitud(
    p_folio        text,
    p_placas_o_tag text,
    p_tipo         text,
    p_detalle      text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_registro_id uuid;
    v_folio text;
    v_dato text;
begin
    if p_tipo not in ('actualizacion','baja') then
        raise exception 'Tipo de solicitud invalido';
    end if;
    if coalesce(btrim(p_detalle),'') = '' then
        raise exception 'Describa brevemente que necesita';
    end if;
    if char_length(btrim(p_detalle)) > 500 then
        raise exception 'El detalle no puede exceder 500 caracteres';
    end if;

    v_folio := upper(btrim(coalesce(p_folio,'')));
    v_dato  := upper(btrim(coalesce(p_placas_o_tag,'')));
    if v_folio = '' or v_dato = '' then
        raise exception 'Capture su folio y sus placas (o No. de TAG)';
    end if;

    -- Coincidencia exacta de folio + (placas o No. de TAG) sobre registros
    -- vivos. Respuesta binaria a proposito: jamas se devuelven datos del
    -- registro (anon no debe poder leer nada del padron).
    select r.id
      into v_registro_id
      from registros r
     where r.folio = v_folio
       and r.estado <> 'baja'
       and (
            upper(coalesce(r.placas,'')) = v_dato
            or coalesce(r.no_dispositivo,'') = v_dato
       )
     limit 1;

    if v_registro_id is null then
        raise exception 'Los datos no coinciden con ningun registro vigente';
    end if;

    begin
        insert into solicitudes (registro_id, tipo, detalle, origen)
        values (v_registro_id, p_tipo, btrim(p_detalle), 'publico');
    exception when unique_violation then
        raise exception 'Ya hay una solicitud de este tipo en proceso para su registro';
    end;

    return jsonb_build_object('recibida', true);
end;
$$;


-- ---------------------------------------------------------------------
-- 3) panel_exigir_rol (bloque 29): el guardian de los RPC del panel.
-- ---------------------------------------------------------------------
create or replace function panel_exigir_rol(p_roles text[]) returns void
language plpgsql
stable
as $$
declare
    v_rol text;
begin
    if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
        raise exception 'Se requiere sesion con segundo factor (MFA)';
    end if;
    v_rol := coalesce(auth.jwt() -> 'app_metadata' ->> 'rol', '');
    if v_rol = 'super' then
        return;
    end if;
    if not (v_rol = any (p_roles)) then
        raise exception 'Su usuario no tiene el rol requerido (%)', array_to_string(p_roles, ' / ');
    end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 4) instalar_tag (bloque 29): obrera interna de
--    instalar_tag_con_estacionamiento; su mensaje SI llega a pantalla.
--    El mensaje ahora nombra la accion del panel («Actualizar datos») y no
--    el nombre tecnico de la funcion.
-- ---------------------------------------------------------------------
create or replace function instalar_tag(
    p_registro_id    uuid,
    p_no_dispositivo text,
    p_instalado_por  text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_estado text;
    v_tag_actual text;
    v_tag text;
    v_dup_folio text;
begin
    perform panel_exigir_rol(array['ti']);

    select estado, no_dispositivo into v_estado, v_tag_actual
      from registros where id = p_registro_id;
    if v_estado is null then
        raise exception 'Registro no encontrado';
    end if;
    -- El orden de estas tres guardas importa: 'baja' va primero para no
    -- mandar a TI a actualizar_registro, que tambien rechaza los de baja.
    if v_estado = 'baja' then
        raise exception 'El registro esta dado de baja';
    end if;
    if v_tag_actual is not null then
        raise exception 'El registro ya tiene el TAG % instalado: use "Actualizar datos" para reponerlo', v_tag_actual;
    end if;
    if v_estado <> 'pendiente' then
        raise exception 'Solo se instala TAG en registros pendientes (este esta en %)', v_estado;
    end if;

    v_tag := btrim(coalesce(p_no_dispositivo,''));
    if v_tag !~ '^[0-9]{6,11}$' then
        raise exception 'El No. de TAG debe tener de 6 a 11 digitos';
    end if;

    if not exists (select 1 from pagos p where p.registro_id = p_registro_id) then
        raise exception 'El registro no tiene pago: el TAG se instala despues del pago';
    end if;

    select folio into v_dup_folio
      from registros
     where id <> p_registro_id and no_dispositivo = v_tag and estado <> 'baja'
     limit 1;
    if v_dup_folio is not null then
        raise exception 'El TAG % ya esta activo en otro registro (%)', v_tag, v_dup_folio;
    end if;

    begin
        update registros
           set no_dispositivo = v_tag,
               estado = 'activo',
               fecha_instalacion = current_date,
               instalado_por = coalesce(nullif(btrim(coalesce(p_instalado_por,'')), ''), 'TI')
         where id = p_registro_id;
    exception when unique_violation then
        -- Carrera contra otra instalacion simultanea del mismo numero.
        raise exception 'El TAG % ya esta activo en otro registro', v_tag;
    end;

    return jsonb_build_object('id', p_registro_id);
end;
$$;


-- ---------------------------------------------------------------------
-- 5) actualizar_registro (bloque 29): obrera interna de
--    actualizar_registro_con_estacionamiento; sus mensajes llegan a pantalla.
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

    -- Cambio de TAG = reposicion (solo sobre un registro que ya tiene TAG).
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

    -- Placas / sin placas.
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
            v_detalles := v_detalles ||
                ('placas ' || coalesce(v_r.placas, 'sin placas') || ' -> ' || coalesce(v_placas, 'sin placas'));
            update registros set placas = v_placas, sin_placas = v_sin_placas where id = p_registro_id;
        end if;
    end if;

    -- Vehiculo (marca/modelo/color). Igual que crear_registro: texto libre
    -- saneado; 'Otro' es opcion valida de UI y no vive en catalogos.
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


-- ---------------------------------------------------------------------
-- 6) dar_baja (bloque 38): cierra la solicitud de baja Y la nota que pidio
--    baja. Solo cambia la cadena del motivo.
-- ---------------------------------------------------------------------
create or replace function dar_baja(
    p_registro_id uuid,
    p_motivo      text,
    p_hecho_por   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_estado text;
    v_quien text;
begin
    perform panel_exigir_rol(array['ti']);

    select estado into v_estado from registros where id = p_registro_id;
    if v_estado is null then
        raise exception 'Registro no encontrado';
    end if;
    if v_estado = 'baja' then
        raise exception 'El registro ya esta dado de baja';
    end if;
    if coalesce(btrim(p_motivo), '') = '' then
        raise exception 'Indique el motivo de la baja';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por,'')), ''), 'TI');

    update registros
       set estado = 'baja', motivo_baja = btrim(p_motivo), fecha_baja = current_date
     where id = p_registro_id;

    insert into movimientos (registro_id, tipo, motivo, hecho_por)
    values (p_registro_id, 'baja', btrim(p_motivo), v_quien);

    -- Cierra las peticiones de baja pendientes: la solicitud de folio (tipo
    -- 'baja') y la nota del buzon (SC-003) que pidio baja. Asi la tarjeta queda
    -- sin pendientes al terminar.
    update solicitudes
       set atendida = true, atendida_en = now(), atendida_por = v_quien,
           resolucion = 'ejecutada'
     where registro_id = p_registro_id and not atendida
       and (tipo = 'baja' or (tipo = 'nota' and tramite_solicitado = 'baja'));

    return jsonb_build_object('id', p_registro_id);
end;
$$;


-- ---------------------------------------------------------------------
-- 7) instalar_tag_con_estacionamiento (bloque 38): la envolvente atomica.
--    Solo cambia la cadena del estacionamiento obligatorio.
-- ---------------------------------------------------------------------
create or replace function instalar_tag_con_estacionamiento(
    p_registro_id     uuid,
    p_no_dispositivo  text,
    p_claves          text[],
    p_instalado_por   text default null,
    p_tag_apartado_no text default null,
    p_procedencia_tag text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_proc_actual   text;
    v_proc_efectiva text;
    v_apartado      text;
    v_quien         text;
begin
    perform panel_exigir_rol(array['ti']);

    select procedencia_tag
      into v_proc_actual
      from registros
     where id = p_registro_id
       for update;
    if not found then
        raise exception 'Registro no encontrado';
    end if;

    if not exists (
        select 1
          from unnest(coalesce(array_remove(p_claves, null), '{}'::text[])) as c(clave)
         where btrim(clave) <> ''
    ) then
        raise exception 'Elija al menos un estacionamiento antes de instalar el TAG';
    end if;

    v_proc_efectiva := coalesce(nullif(btrim(coalesce(p_procedencia_tag, '')), ''), v_proc_actual);
    if v_proc_efectiva not in ('escuela', 'propio') then
        raise exception 'Procedencia de TAG invalida (escuela | propio)';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_instalado_por, '')), ''), 'TI');

    v_apartado := nullif(btrim(coalesce(p_tag_apartado_no, '')), '');
    if v_apartado is not null then
        if v_proc_efectiva <> 'propio' then
            raise exception 'Solo se aparta un TAG cuando la familia usa su propio TAG (procedencia propio)';
        end if;
        if v_apartado !~ '^[0-9]{6,11}$' then
            raise exception 'El No. del TAG apartado debe tener de 6 a 11 digitos';
        end if;
        if v_apartado = btrim(coalesce(p_no_dispositivo, '')) then
            raise exception 'El TAG apartado no puede ser el mismo que el TAG que se instala';
        end if;
        if exists (
            select 1 from registros
             where id <> p_registro_id and estado <> 'baja' and no_dispositivo = v_apartado
        ) then
            raise exception 'El TAG apartado % ya esta activo en otro registro', v_apartado;
        end if;
        if exists (
            select 1 from registros
             where id <> p_registro_id and tag_apartado and tag_apartado_no = v_apartado
        ) then
            raise exception 'El TAG % ya esta apartado en otro registro', v_apartado;
        end if;
    end if;

    if v_proc_efectiva <> v_proc_actual then
        update registros set procedencia_tag = v_proc_efectiva where id = p_registro_id;
        insert into movimientos (registro_id, tipo, motivo, hecho_por)
        values (p_registro_id, 'cambio',
            'Procedencia TAG: ' || v_proc_actual || ' -> ' || v_proc_efectiva, v_quien);
    end if;

    perform asignar_estacionamiento(
        p_registro_id => p_registro_id,
        p_claves      => p_claves,
        p_hecho_por   => p_instalado_por
    );

    perform instalar_tag(
        p_registro_id    => p_registro_id,
        p_no_dispositivo => p_no_dispositivo,
        p_instalado_por  => p_instalado_por
    );

    if v_apartado is not null then
        update registros
           set tag_apartado = true,
               tag_apartado_no = v_apartado
         where id = p_registro_id;
    end if;

    -- Cierra la nota del buzon (SC-003) que pidio instalar, si la hay: al terminar
    -- la instalacion la tarjeta queda sin pendientes.
    update solicitudes
       set atendida = true, atendida_en = now(), atendida_por = v_quien,
           resolucion = 'ejecutada'
     where registro_id = p_registro_id and not atendida
       and tipo = 'nota' and tramite_solicitado = 'instalacion';

    return jsonb_build_object('id', p_registro_id);
end;
$$;


-- ---------------------------------------------------------------------
-- 8) vincular_nota (bloque 41): solo cambia la cadena de la nota duplicada.
-- ---------------------------------------------------------------------
create or replace function vincular_nota(
    p_solicitud_id uuid,
    p_registro_id  uuid,
    p_tramite      text,
    p_hecho_por    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tipo            text;
    v_atendida        boolean;
    v_registro_actual uuid;
    v_tramite_actual  text;
    v_estado          text;
    v_quien           text;
    v_motivo          text;
begin
    perform panel_exigir_rol(array['ti']);

    if p_tramite not in ('actualizacion','baja') then
        raise exception 'Indique el tramite a realizar: actualizar o dar de baja';
    end if;

    select tipo, atendida, registro_id, tramite_solicitado
      into v_tipo, v_atendida, v_registro_actual, v_tramite_actual
      from solicitudes
     where id = p_solicitud_id
       for update;
    if not found then
        raise exception 'Nota no encontrada';
    end if;
    if v_tipo <> 'nota' then
        raise exception 'Esta solicitud no es una nota sin expediente';
    end if;
    if v_atendida then
        raise exception 'La nota ya estaba cerrada';
    end if;
    if v_registro_actual is not null then
        raise exception 'La nota ya esta vinculada a un expediente';
    end if;

    select estado into v_estado from registros where id = p_registro_id;
    if v_estado is null then
        raise exception 'Registro no encontrado';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por,'')), ''), 'TI');

    begin
        update solicitudes
           set registro_id = p_registro_id,
               tramite_solicitado = p_tramite
         where id = p_solicitud_id;
    exception when unique_violation then
        raise exception 'Ese expediente ya tiene una nota pendiente; cierrela antes de vincular otra';
    end;

    v_motivo := case
        when p_tramite is distinct from v_tramite_actual
            then 'Nota del buzon vinculada; TI corroboro el tramite de '
                 || coalesce(v_tramite_actual, '?') || ' a ' || p_tramite
        else 'Nota del buzon vinculada al expediente (tramite ' || p_tramite || ')'
    end;
    insert into movimientos (registro_id, tipo, motivo, hecho_por)
    values (p_registro_id, 'cambio', v_motivo, v_quien);

    return jsonb_build_object('id', p_registro_id);
end;
$$;


-- Refresca los cuerpos nuevos para PostgREST (las firmas no cambiaron).
notify pgrst, 'reload schema';

-- Auditoria esperada tras aplicar:
-- - crear_registro con p_aviso_version_id / p_reglamento_version_id nulos:
--   rechazado con el mensaje de recargar la pagina (D-01 servidor cerrado).
-- - El alta normal desde el cliente actualizado: identica a antes, con los
--   ids de version que el cliente declara haber mostrado.
-- - Los 10 mensajes del inventario del 18-ago responden de usted
--   (re-barrido de F-08 sobre pg_proc: cero tuteos).
