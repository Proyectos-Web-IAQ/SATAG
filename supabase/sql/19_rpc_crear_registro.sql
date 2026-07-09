-- =====================================================================
-- 19_rpc_crear_registro.sql
-- Alta publica atomica: registros + aceptaciones + movimientos.
-- SECURITY DEFINER: corre como owner; por eso anon puede dar de alta sin
-- grants directos sobre las tablas con PII.
--
-- Depende de: registros, aceptaciones, movimientos, reglamento_versiones,
--             aviso_versiones, registros_folio_seq, pgcrypto (digest).
-- Devuelve: jsonb { id, folio, estado }.
-- =====================================================================

-- Firmas previas (limpieza para re-ejecucion sobre una BD existente).
drop function if exists crear_registro(
    text, text, text, text, text, text, boolean, text, text, text,
    text, text, boolean, text, jsonb, text, text, uuid, uuid
);
drop function if exists crear_registro(
    text, text, text, text, text, text, boolean, text, text,
    text, text, boolean, text, jsonb, text, text, text, uuid, uuid
);
-- Firma previa a la separacion de nombres (usuario_nombre / gestionante_nombre).
drop function if exists crear_registro(
    text, text, text, text, text, text, boolean, text, text,
    text, text, boolean, text, jsonb, text, inet, text, jsonb, text, text, uuid, uuid
);

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
    if p_reglamento_version_id is null then
        select id, version, contenido
          into v_reglamento_version_id, v_reglamento_version, v_reglamento_contenido
          from reglamento_versiones
         where vigente
         limit 1;
        if v_reglamento_version_id is null then
            raise exception 'No hay version de reglamento vigente';
        end if;
    else
        select id, version, contenido
          into v_reglamento_version_id, v_reglamento_version, v_reglamento_contenido
          from reglamento_versiones
         where id = p_reglamento_version_id;
        if v_reglamento_version_id is null then
            raise exception 'La version de reglamento indicada no existe';
        end if;
    end if;

    if p_aviso_version_id is null then
        select id, version, contenido
          into v_aviso_version_id, v_aviso_version, v_aviso_contenido
          from aviso_versiones
         where vigente
         limit 1;
        if v_aviso_version_id is null then
            raise exception 'No hay version de aviso de privacidad vigente';
        end if;
    else
        select id, version, contenido
          into v_aviso_version_id, v_aviso_version, v_aviso_contenido
          from aviso_versiones
         where id = p_aviso_version_id;
        if v_aviso_version_id is null then
            raise exception 'La version de aviso de privacidad indicada no existe';
        end if;
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

revoke all on function crear_registro(
    text, text, text, text, text, text, text, boolean, text,
    text, text, text, text, text, text, boolean, text, jsonb, text, inet, text, jsonb, text, text, uuid, uuid
) from public;
grant execute on function crear_registro(
    text, text, text, text, text, text, text, boolean, text,
    text, text, text, text, text, text, boolean, text, jsonb, text, inet, text, jsonb, text, text, uuid, uuid
) to anon, authenticated;
