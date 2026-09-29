


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."actualizar_registro"("p_registro_id" "uuid", "p_no_dispositivo" "text" DEFAULT NULL::"text", "p_placas" "text" DEFAULT NULL::"text", "p_sin_placas" boolean DEFAULT NULL::boolean, "p_marca" "text" DEFAULT NULL::"text", "p_modelo" "text" DEFAULT NULL::"text", "p_color" "text" DEFAULT NULL::"text", "p_motivo" "text" DEFAULT NULL::"text", "p_hecho_por" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."actualizar_registro"("p_registro_id" "uuid", "p_no_dispositivo" "text", "p_placas" "text", "p_sin_placas" boolean, "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_motivo" "text", "p_hecho_por" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."actualizar_registro_con_estacionamiento"("p_registro_id" "uuid", "p_claves" "text"[] DEFAULT NULL::"text"[], "p_no_dispositivo" "text" DEFAULT NULL::"text", "p_placas" "text" DEFAULT NULL::"text", "p_sin_placas" boolean DEFAULT NULL::boolean, "p_marca" "text" DEFAULT NULL::"text", "p_modelo" "text" DEFAULT NULL::"text", "p_color" "text" DEFAULT NULL::"text", "p_motivo" "text" DEFAULT NULL::"text", "p_hecho_por" "text" DEFAULT NULL::"text", "p_procedencia_tag" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_hay_cambios_registro boolean;
    v_proc_actual text;
    v_proc_nueva  text;
    v_tag_apartado boolean;
    v_quien text;
begin
    perform panel_exigir_rol(array['ti']);

    select procedencia_tag, tag_apartado
      into v_proc_actual, v_tag_apartado
      from registros
     where id = p_registro_id
       for update;
    if not found then
        raise exception 'Registro no encontrado';
    end if;

    v_hay_cambios_registro :=
        p_no_dispositivo is not null
        or p_placas is not null
        or p_sin_placas is not null
        or p_marca is not null
        or p_modelo is not null
        or p_color is not null;

    v_proc_nueva := nullif(btrim(coalesce(p_procedencia_tag, '')), '');
    if v_proc_nueva is not null and v_proc_nueva not in ('escuela', 'propio') then
        raise exception 'Procedencia de TAG invalida (escuela | propio)';
    end if;
    if v_proc_nueva is not null and v_proc_nueva = v_proc_actual then
        v_proc_nueva := null;
    end if;

    if v_proc_nueva = 'escuela' and coalesce(v_tag_apartado, false) then
        raise exception 'Este registro tiene un TAG apartado; use "Usar el TAG apartado" o quite la reserva antes de cambiar la procedencia a escuela';
    end if;

    if p_claves is null and not v_hay_cambios_registro and v_proc_nueva is null then
        raise exception 'No hay cambios que guardar';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), 'TI');

    if p_claves is not null then
        perform asignar_estacionamiento(
            p_registro_id => p_registro_id,
            p_claves      => p_claves,
            p_hecho_por   => p_hecho_por
        );
    end if;

    if v_hay_cambios_registro then
        perform actualizar_registro(
            p_registro_id    => p_registro_id,
            p_no_dispositivo => p_no_dispositivo,
            p_placas         => p_placas,
            p_sin_placas     => p_sin_placas,
            p_marca          => p_marca,
            p_modelo         => p_modelo,
            p_color          => p_color,
            p_motivo         => p_motivo,
            p_hecho_por      => p_hecho_por
        );
    end if;

    if p_no_dispositivo is not null then
        perform inv_reclamar_tag(p_no_dispositivo, p_registro_id, v_quien);
    end if;

    if v_proc_nueva is not null then
        update registros set procedencia_tag = v_proc_nueva where id = p_registro_id;
        insert into movimientos (registro_id, tipo, motivo, hecho_por)
        values (p_registro_id, 'cambio',
            'Procedencia TAG: ' || v_proc_actual || ' -> ' || v_proc_nueva
                || case when coalesce(btrim(coalesce(p_motivo, '')), '') <> ''
                        then ' - ' || btrim(p_motivo) else '' end,
            v_quien);
    end if;

    update solicitudes
       set atendida = true,
           atendida_en = now(),
           atendida_por = v_quien,
           resolucion = 'ejecutada'
     where registro_id = p_registro_id and not atendida
       and (tipo = 'actualizacion' or (tipo = 'nota' and tramite_solicitado = 'actualizacion'));

    return jsonb_build_object('id', p_registro_id);
end;
$$;


ALTER FUNCTION "public"."actualizar_registro_con_estacionamiento"("p_registro_id" "uuid", "p_claves" "text"[], "p_no_dispositivo" "text", "p_placas" "text", "p_sin_placas" boolean, "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_motivo" "text", "p_hecho_por" "text", "p_procedencia_tag" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."alta_inventario_tags"("p_numeros" "text"[], "p_hecho_por" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
    v_numeros text[];
    v_malos   text[];
    v_dup     text[];
    v_quien   text;
    v_n       integer;
begin
    perform panel_exigir_rol(array['ti']);

    select array_agg(distinct n)
      into v_numeros
      from (select btrim(x) as n from unnest(coalesce(p_numeros, '{}'::text[])) as x) t
     where n <> '';
    if v_numeros is null or array_length(v_numeros, 1) is null then
        raise exception 'Capture al menos un numero de TAG';
    end if;

    select array_agg(n order by n) into v_malos
      from unnest(v_numeros) as n
     where n !~ '^[0-9]{6,11}$';
    if v_malos is not null then
        raise exception 'Estos numeros no son validos (deben ser de 6 a 11 digitos): %',
            array_to_string(v_malos, ', ');
    end if;

    select array_agg(n order by n) into v_dup
      from unnest(v_numeros) as n
     where exists (select 1 from inventario_tags i where i.no_dispositivo = n);
    if v_dup is not null then
        raise exception 'Estos TAGs ya estan en el inventario: %',
            array_to_string(v_dup, ', ');
    end if;

    select array_agg(n order by n) into v_dup
      from unnest(v_numeros) as n
     where exists (
        select 1 from registros r
         where r.no_dispositivo = n and r.estado <> 'baja'
     );
    if v_dup is not null then
        raise exception 'Estos TAGs ya estan instalados en el padron: %',
            array_to_string(v_dup, ', ');
    end if;

    select array_agg(n order by n) into v_dup
      from unnest(v_numeros) as n
     where exists (
        select 1 from registros r
         where r.tag_apartado and r.tag_apartado_no = n
     );
    if v_dup is not null then
        raise exception 'Estos TAGs ya estan apartados en un expediente: %',
            array_to_string(v_dup, ', ');
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), 'TI');

    insert into inventario_tags (no_dispositivo, dado_de_alta_por)
    select n, v_quien from unnest(v_numeros) as n;

    get diagnostics v_n = row_count;
    return jsonb_build_object('agregados', v_n);
end;
$_$;


ALTER FUNCTION "public"."alta_inventario_tags"("p_numeros" "text"[], "p_hecho_por" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."asignar_estacionamiento"("p_registro_id" "uuid", "p_claves" "text"[], "p_hecho_por" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_estado text;
    v_invalidas text;
    v_claves text[];
    v_antes text;
    v_despues text;
    v_quien text;
begin
    perform panel_exigir_rol(array['ti']);

    select estado into v_estado from registros where id = p_registro_id;
    if v_estado is null then
        raise exception 'Registro no encontrado';
    end if;
    if v_estado = 'baja' then
        raise exception 'El registro esta dado de baja';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por,'')), ''), 'TI');

    -- Normalizar la entrada antes de validar. array_remove saca los NULL: sin
    -- esto una clave NULL pasaba la validacion de abajo (string_agg ignora los
    -- NULL, asi que v_invalidas quedaba NULL y no se levantaba la excepcion) y
    -- reventaba mas adelante contra el not null de la tabla.
    select coalesce(array_agg(upper(btrim(c))), '{}')
      into v_claves
      from unnest(coalesce(array_remove(p_claves, null), '{}')) as c
     where btrim(c) <> '';

    select string_agg(c, ', ') into v_invalidas
      from unnest(v_claves) as c
     where not exists (select 1 from estacionamientos e where e.clave = c and e.activo);
    if v_invalidas is not null then
        raise exception 'Estacionamiento invalido o inactivo: %', v_invalidas;
    end if;

    select string_agg(estacionamiento_clave, ' + ' order by estacionamiento_clave)
      into v_antes
      from registro_estacionamientos where registro_id = p_registro_id;

    delete from registro_estacionamientos
     where registro_id = p_registro_id
       and not (estacionamiento_clave = any (v_claves));

    insert into registro_estacionamientos (registro_id, estacionamiento_clave)
    select p_registro_id, c from unnest(v_claves) as c
    on conflict do nothing;

    select string_agg(estacionamiento_clave, ' + ' order by estacionamiento_clave)
      into v_despues
      from registro_estacionamientos where registro_id = p_registro_id;

    -- Traza solo si de verdad cambio: reasignar lo mismo no ensucia la bitacora.
    -- Se usa tipo 'cambio' (no se agrega un tipo nuevo al enum de movimientos).
    if coalesce(v_antes, '') is distinct from coalesce(v_despues, '') then
        insert into movimientos (registro_id, tipo, motivo, hecho_por)
        values (
            p_registro_id, 'cambio',
            'Estacionamiento: ' || coalesce(v_antes, 'sin asignar')
                || ' -> ' || coalesce(v_despues, 'sin asignar'),
            v_quien
        );
    end if;

    return jsonb_build_object('id', p_registro_id);
end;
$$;


ALTER FUNCTION "public"."asignar_estacionamiento"("p_registro_id" "uuid", "p_claves" "text"[], "p_hecho_por" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."avisar_chat_ti"("p_texto" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
    v_estado text;
    v_url    text;
    v_error  text;
begin
    begin
        if coalesce(btrim(p_texto), '') = '' then
            return;
        end if;

        select valor
          into v_estado
          from public.parametros
         where clave = 'aviso_chat_ti';
        if coalesce(v_estado, '') <> 'activo' then
            return;
        end if;

        select decrypted_secret
          into v_url
          from vault.decrypted_secrets
         where name = 'chat_webhook_satag_ti'
         order by created_at desc
         limit 1;
        if v_url is null or v_url not like 'https://chat.googleapis.com/v1/spaces/%' then
            raise exception 'falta el secreto chat_webhook_satag_ti en Vault o no es un webhook de Google Chat';
        end if;

        -- Content-Type EXACTO 'application/json': net.http_post rechaza
        -- cualquier otro valor, incluido 'application/json; charset=UTF-8'
        -- (ver HISTORIA en el encabezado). JSON ya viaja en UTF-8.
        perform net.http_post(
            url                  := v_url,
            body                 := jsonb_build_object('text', p_texto),
            headers              := jsonb_build_object('Content-Type', 'application/json'),
            timeout_milliseconds := 5000
        );
    exception when others then
        v_error := left(sqlstate || ' ' || sqlerrm, 300);
        raise warning 'SATAG aviso a Chat: no se pudo encolar el aviso (%).', v_error;
        -- A la vista (ver encabezado). Si hasta esto falla, se calla: el aviso
        -- nunca tumba un cobro.
        begin
            insert into public.parametros (clave, valor, actualizado_en)
            values ('aviso_chat_ti_ultimo_error', v_error, now())
            on conflict (clave) do update
               set valor = excluded.valor, actualizado_en = excluded.actualizado_en;
        exception when others then
            null;
        end;
    end;
end;
$$;


ALTER FUNCTION "public"."avisar_chat_ti"("p_texto" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."avisar_chat_ti"("p_texto" "text") IS 'Bloque 66. Manda un texto SIN datos personales al espacio de Google Chat de TI por pg_net. Lee el webhook de Vault (chat_webhook_satag_ti) y respeta el interruptor parametros.aviso_chat_ti. Nunca lanza.';



CREATE OR REPLACE FUNCTION "public"."capturar_expediente_ti"("p_usuario_nombres" "text", "p_usuario_apellido_paterno" "text", "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_usuario_apellido_materno" "text" DEFAULT NULL::"text", "p_tipo_usuario" "text" DEFAULT 'padres'::"text", "p_placas" "text" DEFAULT NULL::"text", "p_sin_placas" boolean DEFAULT false, "p_claves" "text"[] DEFAULT NULL::"text"[], "p_no_dispositivo" "text" DEFAULT NULL::"text", "p_gestionante_nombres" "text" DEFAULT NULL::"text", "p_gestionante_apellido_paterno" "text" DEFAULT NULL::"text", "p_gestionante_apellido_materno" "text" DEFAULT NULL::"text", "p_gestionante_relacion" "text" DEFAULT NULL::"text", "p_fecha_hoja" "date" DEFAULT NULL::"date", "p_observaciones" "text" DEFAULT NULL::"text", "p_hecho_por" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
    v_registro_id uuid;
    v_folio       text;
    v_quien       text;
    v_tag         text;
    v_obs         text;
begin
    perform panel_exigir_rol(array['ti']);

    if coalesce(btrim(p_usuario_nombres), '') = '' then
        raise exception 'Capture el nombre del titular';
    end if;
    if coalesce(btrim(p_usuario_apellido_paterno), '') = '' then
        raise exception 'Capture el apellido paterno del titular';
    end if;
    -- NUEVO 63: quinto tipo, el mismo que admite la tabla.
    if p_tipo_usuario not in ('maestro', 'padres', 'alumno', 'admin', 'otro') then
        raise exception 'Tipo de usuario invalido: %', p_tipo_usuario;
    end if;
    if coalesce(btrim(p_marca), '') = '' then
        raise exception 'Capture la marca del vehiculo';
    end if;
    if coalesce(btrim(p_modelo), '') = '' then
        raise exception 'Capture el modelo del vehiculo';
    end if;
    if coalesce(btrim(p_color), '') = '' then
        raise exception 'Capture el color del vehiculo';
    end if;
    if (p_placas is null or btrim(p_placas) = '') and not coalesce(p_sin_placas, false) then
        raise exception 'Capture las placas o marque "Sin placas"';
    end if;
    if coalesce(btrim(p_gestionante_nombres), '') <> ''
       and coalesce(btrim(p_gestionante_apellido_paterno), '') = '' then
        raise exception 'Quien gestiona requiere apellido paterno';
    end if;
    if nullif(btrim(coalesce(p_gestionante_relacion, '')), '') is not null
       and p_gestionante_relacion not in ('padre', 'madre', 'tutor', 'otro') then
        raise exception 'Relacion de quien gestiona invalida (padre | madre | tutor | otro)';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), 'TI');

    -- El TAG reservado (si viene) tiene que estar DISPONIBLE en el inventario.
    v_tag := nullif(btrim(coalesce(p_no_dispositivo, '')), '');
    if v_tag is not null then
        if v_tag !~ '^[0-9]{6,11}$' then
            raise exception 'El No. de TAG debe tener de 6 a 11 digitos';
        end if;
        perform 1 from inventario_tags
          where no_dispositivo = v_tag
            for update;
        if not found then
            raise exception 'El TAG % no esta en el inventario; dele de alta en "TAGs de la escuela" o capture el expediente sin TAG', v_tag;
        end if;
        if exists (select 1 from inventario_tags where no_dispositivo = v_tag and asignado_a is not null) then
            raise exception 'El TAG % ya esta reservado o en uso por otro expediente', v_tag;
        end if;
    end if;

    v_obs := 'Capturado por TI desde la hoja fisica firmada'
             || coalesce(' del ' || to_char(p_fecha_hoja, 'DD/MM/YYYY'), '')
             || coalesce('. ' || nullif(btrim(coalesce(p_observaciones, '')), ''), '');

    v_folio := 'SATAG-' || lpad(nextval('registros_folio_seq')::text, 6, '0');

    insert into registros (
        folio,
        usuario_nombres, usuario_apellido_paterno, usuario_apellido_materno,
        gestionante_nombres, gestionante_apellido_paterno, gestionante_apellido_materno,
        gestionante_relacion, usuario_es_menor,
        tipo_usuario, procedencia_tag, marca, modelo, color, placas, sin_placas,
        fecha_adquisicion, observaciones, estado
    ) values (
        v_folio,
        btrim(p_usuario_nombres),
        btrim(p_usuario_apellido_paterno),
        nullif(btrim(coalesce(p_usuario_apellido_materno, '')), ''),
        nullif(btrim(coalesce(p_gestionante_nombres, '')), ''),
        nullif(btrim(coalesce(p_gestionante_apellido_paterno, '')), ''),
        nullif(btrim(coalesce(p_gestionante_apellido_materno, '')), ''),
        nullif(btrim(coalesce(p_gestionante_relacion, '')), ''),
        false,
        p_tipo_usuario,
        'escuela',
        btrim(p_marca),
        btrim(p_modelo),
        btrim(p_color),
        case when coalesce(p_sin_placas, false) then null
             else nullif(upper(regexp_replace(coalesce(p_placas, ''), '[^A-Za-z0-9]', '', 'g')), '') end,
        coalesce(p_sin_placas, false),
        p_fecha_hoja,
        v_obs,
        'pendiente'
    ) returning id into v_registro_id;

    insert into movimientos (registro_id, tipo, motivo, hecho_por)
    values (v_registro_id, 'alta', 'Alta capturada por TI desde la hoja fisica firmada', v_quien);

    if p_claves is not null and exists (
        select 1 from unnest(coalesce(array_remove(p_claves, null), '{}'::text[])) as c(clave)
         where btrim(clave) <> ''
    ) then
        perform asignar_estacionamiento(
            p_registro_id => v_registro_id,
            p_claves      => p_claves,
            p_hecho_por   => p_hecho_por
        );
    end if;

    if v_tag is not null then
        update inventario_tags
           set asignado_a = v_registro_id, asignado_en = now(), asignado_por = v_quien
         where no_dispositivo = v_tag and asignado_a is null;
    end if;

    return jsonb_build_object('id', v_registro_id, 'folio', v_folio, 'estado', 'pendiente');
end;
$_$;


ALTER FUNCTION "public"."capturar_expediente_ti"("p_usuario_nombres" "text", "p_usuario_apellido_paterno" "text", "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_usuario_apellido_materno" "text", "p_tipo_usuario" "text", "p_placas" "text", "p_sin_placas" boolean, "p_claves" "text"[], "p_no_dispositivo" "text", "p_gestionante_nombres" "text", "p_gestionante_apellido_paterno" "text", "p_gestionante_apellido_materno" "text", "p_gestionante_relacion" "text", "p_fecha_hoja" "date", "p_observaciones" "text", "p_hecho_por" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cargar_mapa_zk"("p_filas" "jsonb", "p_hecho_por" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_quien text;
    v_n     integer;
begin
    perform panel_exigir_rol(array['ti']);

    if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
        raise exception 'El mapa de ZK no tiene el formato esperado';
    end if;
    if not exists (
        select 1 from jsonb_array_elements(p_filas) f
         where coalesce(btrim(f ->> 'tarjeta'), '') <> ''
           and coalesce(btrim(f ->> 'id'), '') <> ''
    ) then
        raise exception 'El archivo no trae tarjetas con ID; verifique que sea el export de ZK (Usuarios_....csv)';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), 'TI');

    delete from zk_tarjetas where no_dispositivo is not null;

    insert into zk_tarjetas (no_dispositivo, zk_id, cargado_en, cargado_por)
    select distinct on (btrim(f ->> 'tarjeta'))
           btrim(f ->> 'tarjeta'), btrim(f ->> 'id'), now(), v_quien
      from jsonb_array_elements(p_filas) f
     where coalesce(btrim(f ->> 'tarjeta'), '') <> ''
       and coalesce(btrim(f ->> 'id'), '') <> '';

    get diagnostics v_n = row_count;
    return jsonb_build_object('total', v_n);
end;
$$;


ALTER FUNCTION "public"."cargar_mapa_zk"("p_filas" "jsonb", "p_hecho_por" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cortar_caja"("p_efectivo_contado" numeric, "p_cortado_por" "text" DEFAULT NULL::"text", "p_observaciones" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
    v_zona       text := 'America/Mexico_City';
    v_corte_id   uuid := gen_random_uuid();
    v_total      numeric(12,2);
    v_cantidad   integer;
    v_dias       integer;
    v_desde      timestamptz;
    v_hasta      timestamptz := now();
    v_desglose   jsonb;
    v_diferencia numeric(12,2);
    v_nombre     text;
    v_folio      text;
begin
    -- NUEVO 74: cortar es SOLO del contador. Decision de Gerardo del
    -- 17-sep-2026: Administracion pierde cortar_caja.
    --
    -- PRECISION QUE HAY QUE DECIR EN VOZ ALTA, y que el codigo obliga:
    -- panel_exigir_rol hace `return` en seco cuando el rol es 'super', SIN
    -- mirar esta lista (29_rpc_panel.sql:49-51). Asi que lo cortan el
    -- contador Y LAS CUENTAS SUPER. «Solo el contador cierra el corte» no
    -- sera literal mientras existan cuentas super, y prometerlo seria
    -- falso; quitarselo a super exige cambiar panel_exigir_rol, que es otro
    -- alcance y afecta a TODOS los RPC del panel.
    perform panel_exigir_rol(array['contador']);

    -- Serializa dos cortes simultaneos: se forman en fila en vez de competir.
    perform pg_advisory_xact_lock(hashtext('satag:corte_caja'));

    if p_efectivo_contado is null or p_efectivo_contado < 0 then
        raise exception 'El efectivo contado debe ser mayor o igual a cero';
    end if;

    v_nombre := nullif(btrim(coalesce(p_cortado_por, '')), '');
    if v_nombre is null then
        raise exception 'Indique quien realiza el corte';
    end if;

    -- Pre-chequeo: evita quemar un folio de la serie cuando no hay nada que cortar.
    perform 1 from pagos where corte_id is null limit 1;
    if not found then
        raise exception 'No hay cobros pendientes de cortar: la caja esta en ceros';
    end if;

    -- Fotografia del periodo, antes de sellar.
    select min(created_at),
           count(distinct (created_at at time zone v_zona)::date)
      into v_desde, v_dias
      from pagos
     where corte_id is null;

    select jsonb_agg(d order by d ->> 'dia')
      into v_desglose
      from (
          select jsonb_build_object(
                     'dia',      (created_at at time zone v_zona)::date,
                     'cantidad', count(*),
                     'subtotal', sum(monto)
                 ) as d
            from pagos
           where corte_id is null
           group by (created_at at time zone v_zona)::date
      ) s;

    -- El sello define el conjunto. La FK diferida permite hacerlo antes de
    -- que exista la fila del corte; se valida al confirmar la transaccion.
    with sellados as (
        update pagos
           set corte_id = v_corte_id
         where corte_id is null
        returning monto
    )
    select coalesce(sum(monto), 0), count(*)
      into v_total, v_cantidad
      from sellados;

    -- Respaldo real ante concurrencia: si otro corte se adelanto, aqui se
    -- sellaron 0 filas. Sin esto quedaria un corte fantasma en cero cuyo
    -- efectivo contado se registraria como sobrante inexistente.
    if v_cantidad = 0 then
        raise exception 'No hay cobros pendientes de cortar: la caja esta en ceros';
    end if;

    v_diferencia := p_efectivo_contado - v_total;

    -- Una diferencia sin explicar es un documento contable inutil: dentro de
    -- un mes nadie recordara por que no cuadro.
    if v_diferencia <> 0 and btrim(coalesce(p_observaciones, '')) = '' then
        raise exception 'Explique la diferencia de $% antes de cerrar el corte',
            to_char(abs(v_diferencia), 'FM999999990.00');
    end if;

    -- Un corte que arrastra varios dias de cobro suele mezclar efectivo ya
    -- entregado: se exige dejarlo por escrito mientras se recuerda.
    if v_dias > 1 and btrim(coalesce(p_observaciones, '')) = '' then
        raise exception 'Este corte abarca cobros de % dias: explique en observaciones si ya entrego efectivo de dias anteriores', v_dias;
    end if;

    insert into cortes_caja (
        id, cortado_por, cortado_por_uid, cortado_por_email,
        periodo_desde, periodo_hasta,
        total_esperado, cantidad_pagos, dias_de_cobro, desglose_por_dia,
        efectivo_contado, observaciones
    )
    values (
        v_corte_id, v_nombre, auth.uid(), auth.jwt() ->> 'email',
        v_desde, v_hasta,
        v_total, v_cantidad, coalesce(v_dias, 1), v_desglose,
        p_efectivo_contado, nullif(btrim(coalesce(p_observaciones, '')), '')
    )
    returning folio_corte into v_folio;

    return jsonb_build_object(
        'id', v_corte_id,
        'folioCorte', v_folio,
        'totalEsperado', v_total,
        'efectivoContado', p_efectivo_contado,
        'diferencia', v_diferencia,
        'pagosCortados', v_cantidad,
        'diasDeCobro', coalesce(v_dias, 1)
    );
end;
$_$;


ALTER FUNCTION "public"."cortar_caja"("p_efectivo_contado" numeric, "p_cortado_por" "text", "p_observaciones" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cortes_caja_inmutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    raise exception 'Un corte de caja cerrado no se puede modificar ni borrar (folio %)', coalesce(old.folio_corte, old.id::text)
        using hint = 'Si el corte quedo mal, deje constancia en las observaciones del corte siguiente.';
end;
$$;


ALTER FUNCTION "public"."cortes_caja_inmutable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_nota_solicitud"("p_solicitante_nombre" "text", "p_solicitante_rol" "text", "p_tramite_solicitado" "text", "p_alumno_nombre" "text", "p_alumno_grado" "text", "p_detalle" "text", "p_vehiculo_desc" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_rol     text;
    v_tramite text;
    v_ip      inet := fn_ip_peticion();
begin
    v_rol     := lower(btrim(coalesce(p_solicitante_rol,'')));
    v_tramite := lower(btrim(coalesce(p_tramite_solicitado,'')));

    if btrim(coalesce(p_solicitante_nombre,'')) = '' then
        raise exception 'Falta su nombre';
    end if;
    if v_rol not in ('maestro','padres','alumno','admin') then
        raise exception 'Indique quien solicita (padres, maestro, administrativo o alumno)';
    end if;
    if v_tramite not in ('actualizacion','baja') then
        raise exception 'Indique que necesita: actualizar datos o dar de baja';
    end if;
    if v_rol = 'padres'
       and (btrim(coalesce(p_alumno_nombre,'')) = ''
            or btrim(coalesce(p_alumno_grado,'')) = '') then
        raise exception 'Como padre, madre o tutor, indique el nombre del alumno y su grado';
    end if;
    if btrim(coalesce(p_detalle,'')) = '' then
        raise exception 'Cuentenos brevemente que necesita';
    end if;
    if char_length(btrim(p_detalle)) > 500 then
        raise exception 'El detalle no puede exceder 500 caracteres';
    end if;

    -- Limite: 10 notas por IP por hora.
    if v_ip is not null
       and fn_intentos_recientes(v_ip, 'crear_nota_solicitud', interval '1 hour', false) >= 10 then
        raise exception 'Se recibieron demasiadas notas desde esta conexion. Espere una hora o acuda a Sistemas.';
    end if;

    insert into solicitudes (
        registro_id, tipo, detalle, origen,
        solicitante_nombre, solicitante_rol, tramite_solicitado,
        alumno_nombre, alumno_grado, vehiculo_desc
    ) values (
        null, 'nota', btrim(p_detalle), 'publico',
        btrim(p_solicitante_nombre), v_rol, v_tramite,
        nullif(btrim(coalesce(p_alumno_nombre,'')), ''),
        nullif(btrim(coalesce(p_alumno_grado,'')), ''),
        nullif(btrim(coalesce(p_vehiculo_desc,'')), '')
    );

    perform fn_anotar_intento(v_ip, 'crear_nota_solicitud', true);
    return jsonb_build_object('recibida', true);
end;
$$;


ALTER FUNCTION "public"."crear_nota_solicitud"("p_solicitante_nombre" "text", "p_solicitante_rol" "text", "p_tramite_solicitado" "text", "p_alumno_nombre" "text", "p_alumno_grado" "text", "p_detalle" "text", "p_vehiculo_desc" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_registro"("p_usuario_nombres" "text", "p_usuario_apellido_paterno" "text", "p_tipo_usuario" "text", "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_placas" "text", "p_sin_placas" boolean, "p_firma_url" "text", "p_usuario_apellido_materno" "text" DEFAULT NULL::"text", "p_firmante_nombre" "text" DEFAULT NULL::"text", "p_gestionante_nombres" "text" DEFAULT NULL::"text", "p_gestionante_apellido_paterno" "text" DEFAULT NULL::"text", "p_gestionante_apellido_materno" "text" DEFAULT NULL::"text", "p_gestionante_relacion" "text" DEFAULT NULL::"text", "p_usuario_es_menor" boolean DEFAULT false, "p_firmante_rol" "text" DEFAULT 'usuario'::"text", "p_firma_trazos" "jsonb" DEFAULT NULL::"jsonb", "p_firma_imagen_sha256" "text" DEFAULT NULL::"text", "p_ip_origen" "inet" DEFAULT NULL::"inet", "p_user_agent" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_procedencia_tag" "text" DEFAULT 'escuela'::"text", "p_observaciones" "text" DEFAULT NULL::"text", "p_reglamento_version_id" "uuid" DEFAULT NULL::"uuid", "p_aviso_version_id" "uuid" DEFAULT NULL::"uuid", "p_apellidos_familia" "text" DEFAULT NULL::"text", "p_parentesco_otro" "text" DEFAULT NULL::"text", "p_seccion_maestro" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $_$
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
    elsif v_seccion_maestro is not null
          and v_seccion_maestro not in ('preescolar','primaria','secundaria','preparatoria') then
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
$_$;


ALTER FUNCTION "public"."crear_registro"("p_usuario_nombres" "text", "p_usuario_apellido_paterno" "text", "p_tipo_usuario" "text", "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_placas" "text", "p_sin_placas" boolean, "p_firma_url" "text", "p_usuario_apellido_materno" "text", "p_firmante_nombre" "text", "p_gestionante_nombres" "text", "p_gestionante_apellido_paterno" "text", "p_gestionante_apellido_materno" "text", "p_gestionante_relacion" "text", "p_usuario_es_menor" boolean, "p_firmante_rol" "text", "p_firma_trazos" "jsonb", "p_firma_imagen_sha256" "text", "p_ip_origen" "inet", "p_user_agent" "text", "p_metadata" "jsonb", "p_procedencia_tag" "text", "p_observaciones" "text", "p_reglamento_version_id" "uuid", "p_aviso_version_id" "uuid", "p_apellidos_familia" "text", "p_parentesco_otro" "text", "p_seccion_maestro" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_solicitud"("p_folio" "text", "p_placas_o_tag" "text", "p_tipo" "text", "p_detalle" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_registro_id uuid;
    v_folio text;
    v_dato text;
    v_ip inet := fn_ip_peticion();
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

    -- Limite: 10 fallos de coincidencia por IP en 15 minutos. Se responde con
    -- el MISMO mensaje que un fallo normal, para no regalar la senal de que
    -- el limite existe ni cuando se dispara.
    if v_ip is not null
       and fn_intentos_recientes(v_ip, 'crear_solicitud', interval '15 minutes', true) >= 10 then
        perform fn_anotar_intento(v_ip, 'crear_solicitud', false);
        return jsonb_build_object('recibida', false,
            'mensaje', 'Los datos no coinciden con ningun registro vigente');
    end if;

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
        -- El fallo queda escrito porque NO se lanza excepcion.
        perform fn_anotar_intento(v_ip, 'crear_solicitud', false);
        return jsonb_build_object('recibida', false,
            'mensaje', 'Los datos no coinciden con ningun registro vigente');
    end if;

    begin
        insert into solicitudes (registro_id, tipo, detalle, origen)
        values (v_registro_id, p_tipo, btrim(p_detalle), 'publico');
    exception when unique_violation then
        raise exception 'Ya hay una solicitud de este tipo en proceso para su registro';
    end;

    perform fn_anotar_intento(v_ip, 'crear_solicitud', true);
    return jsonb_build_object('recibida', true);
end;
$$;


ALTER FUNCTION "public"."crear_solicitud"("p_folio" "text", "p_placas_o_tag" "text", "p_tipo" "text", "p_detalle" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dar_baja"("p_registro_id" "uuid", "p_motivo" "text", "p_hecho_por" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."dar_baja"("p_registro_id" "uuid", "p_motivo" "text", "p_hecho_por" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."descartar_solicitud"("p_solicitud_id" "uuid", "p_motivo" "text", "p_hecho_por" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_registro_id uuid;
    v_atendida boolean;
begin
    perform panel_exigir_rol(array['ti']);

    if coalesce(btrim(p_motivo), '') = '' then
        raise exception 'Indique por que se descarta la solicitud';
    end if;

    select registro_id, atendida into v_registro_id, v_atendida
      from solicitudes where id = p_solicitud_id;
    -- FOUND distingue "no existe la fila" de "existe con registro_id NULL"
    -- (una nota del buzon aun sin vincular). Antes se miraba v_registro_id.
    if not found then
        raise exception 'Solicitud no encontrada';
    end if;
    if v_atendida then
        raise exception 'La solicitud ya estaba cerrada';
    end if;

    update solicitudes
       set atendida = true,
           atendida_en = now(),
           atendida_por = coalesce(nullif(btrim(coalesce(p_hecho_por,'')), ''), 'TI'),
           resolucion = 'descartada',
           motivo_resolucion = btrim(p_motivo)
     where id = p_solicitud_id;

    -- No se escribe movimiento: no hubo cambio en el registro. La bitacora
    -- del descarte vive en la propia solicitud (resolucion + motivo).
    -- Una nota sin vincular no tiene registro_id: se devuelve el id de la
    -- solicitud para no regresar null.
    return jsonb_build_object('id', coalesce(v_registro_id, p_solicitud_id));
end;
$$;


ALTER FUNCTION "public"."descartar_solicitud"("p_solicitud_id" "uuid", "p_motivo" "text", "p_hecho_por" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."estado_caja"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_zona          text := 'America/Mexico_City';
    v_total         numeric(12,2);
    v_cantidad      integer;
    v_dias          integer;
    v_primero       timestamptz;
    v_desglose      jsonb;
    v_ultimo_corte  timestamptz;
    v_mes           numeric(12,2);
    v_historico     numeric(12,2);
begin
    -- NUEVO 74: el contador tambien LEE el estado de la caja. Administracion
    -- lo conserva: necesita saber cuanto efectivo deberia haber para
    -- conciliar, y la guia del personal se lo indica expresamente.
    perform panel_exigir_rol(array['admin','contador']);

    select coalesce(sum(monto), 0),
           count(*),
           count(distinct (created_at at time zone v_zona)::date),
           min(created_at)
      into v_total, v_cantidad, v_dias, v_primero
      from pagos
     where corte_id is null;

    -- Desglose por dia local: deja ver de golpe que parte del efectivo es de
    -- dias anteriores ya entregados, que es de donde salen los faltantes falsos.
    select jsonb_agg(d order by d ->> 'dia')
      into v_desglose
      from (
          select jsonb_build_object(
                     'dia',      (created_at at time zone v_zona)::date,
                     'cantidad', count(*),
                     'subtotal', sum(monto)
                 ) as d
            from pagos
           where corte_id is null
           group by (created_at at time zone v_zona)::date
      ) s;

    select max(created_at) into v_ultimo_corte from cortes_caja;

    select coalesce(sum(monto), 0)
      into v_mes
      from pagos
     where (created_at at time zone v_zona) >= date_trunc('month', now() at time zone v_zona);

    select coalesce(sum(monto), 0) into v_historico from pagos;

    return jsonb_build_object(
        'totalEnCaja',     v_total,
        'pagosEnCaja',     v_cantidad,
        'diasDeCobro',     coalesce(v_dias, 0),
        'primerCobro',     v_primero,
        'desglosePorDia',  coalesce(v_desglose, '[]'::jsonb),
        'ultimoCorte',     v_ultimo_corte,
        'vendidoMes',      v_mes,
        'vendidoHistorico', v_historico
    );
end;
$$;


ALTER FUNCTION "public"."estado_caja"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_anotar_intento"("p_ip" "inet", "p_funcion" "text", "p_exito" boolean) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
    insert into intentos_publicos (ip, funcion, exito) values (p_ip, p_funcion, p_exito);
    if random() < 0.02 then
        delete from intentos_publicos where creado_en < now() - interval '2 days';
    end if;
end;
$$;


ALTER FUNCTION "public"."fn_anotar_intento"("p_ip" "inet", "p_funcion" "text", "p_exito" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_intentos_recientes"("p_ip" "inet", "p_funcion" "text", "p_ventana" interval, "p_solo_fallos" boolean) RETURNS integer
    LANGUAGE "sql" STABLE
    AS $$
    select count(*)::integer
      from intentos_publicos
     where ip = p_ip
       and funcion = p_funcion
       and creado_en > now() - p_ventana
       and (not p_solo_fallos or not exito);
$$;


ALTER FUNCTION "public"."fn_intentos_recientes"("p_ip" "inet", "p_funcion" "text", "p_ventana" interval, "p_solo_fallos" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_ip_peticion"() RETURNS "inet"
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
    v_headers json;
    v_xff     text;
begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
    v_xff := btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1));
    begin
        return nullif(v_xff, '')::inet;
    exception when others then
        return null;
    end;
end;
$$;


ALTER FUNCTION "public"."fn_ip_peticion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."instalar_tag"("p_registro_id" "uuid", "p_no_dispositivo" "text", "p_instalado_por" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
    v_estado text;
    v_tag_actual text;
    v_tag text;
    v_dup_folio text;
    v_quien text;   -- NUEVO 68
begin
    perform panel_exigir_rol(array['ti']);

    -- NUEVO 68: quien instala es quien tiene la sesion. No hay respaldo
    -- tecleado: si el JWT no trae correo, no hay instalacion.
    v_quien := nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '');
    if v_quien is null then
        raise exception 'No se pudo identificar a quien instala desde la sesion. Cierre sesion y vuelva a entrar.';
    end if;

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
               -- NUEVO 68: la fecha en hora de Queretaro (current_date va en
               -- UTC), la hora real y la identidad de la sesion.
               fecha_instalacion   = (now() at time zone 'America/Mexico_City')::date,
               instalado_en        = now(),
               instalado_por       = v_quien,
               instalado_por_uid   = auth.uid(),
               instalado_por_email = v_quien
         where id = p_registro_id;
    exception when unique_violation then
        -- Carrera contra otra instalacion simultanea del mismo numero.
        raise exception 'El TAG % ya esta activo en otro registro', v_tag;
    end;

    return jsonb_build_object('id', p_registro_id);
end;
$_$;


ALTER FUNCTION "public"."instalar_tag"("p_registro_id" "uuid", "p_no_dispositivo" "text", "p_instalado_por" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."instalar_tag_con_estacionamiento"("p_registro_id" "uuid", "p_no_dispositivo" "text", "p_claves" "text"[], "p_instalado_por" "text" DEFAULT NULL::"text", "p_tag_apartado_no" "text" DEFAULT NULL::"text", "p_procedencia_tag" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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

    -- NUEVO 68: la identidad sale de la sesion, no del parametro.
    v_quien := nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '');
    if v_quien is null then
        raise exception 'No se pudo identificar a quien instala desde la sesion. Cierre sesion y vuelva a entrar.';
    end if;

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
        p_hecho_por   => v_quien   -- NUEVO 68 (antes p_instalado_por)
    );

    perform instalar_tag(
        p_registro_id    => p_registro_id,
        p_no_dispositivo => p_no_dispositivo,
        p_instalado_por  => v_quien   -- se ignora: instalar_tag lee el JWT
    );

    if v_apartado is not null then
        update registros
           set tag_apartado = true,
               tag_apartado_no = v_apartado
         where id = p_registro_id;
    end if;

    -- SC-025: si el TAG instalado (y el apartado, si lo hay) estaba disponible
    -- en el inventario, queda asignado a este expediente.
    perform inv_reclamar_tag(p_no_dispositivo, p_registro_id, v_quien);
    if v_apartado is not null then
        perform inv_reclamar_tag(v_apartado, p_registro_id, v_quien);
    end if;

    -- SC-026: una reserva de este expediente que NO es el TAG instalado ni el
    -- apartado vuelve a estar disponible (TI instalo otro numero).
    update inventario_tags
       set asignado_a = null, asignado_en = null, asignado_por = null
     where asignado_a = p_registro_id
       and no_dispositivo <> btrim(coalesce(p_no_dispositivo, ''))
       and (v_apartado is null or no_dispositivo <> v_apartado);

    -- Cierra la nota del buzon (SC-003) que pidio instalar, si la hay: al terminar
    -- la instalacion la tarjeta queda sin pendientes.
    update solicitudes
       set atendida = true, atendida_en = now(), atendida_por = v_quien,
           resolucion = 'ejecutada'
     where registro_id = p_registro_id and not atendida
       and tipo = 'nota' and tramite_solicitado = 'instalacion';

    return jsonb_build_object('id', p_registro_id);
end;
$_$;


ALTER FUNCTION "public"."instalar_tag_con_estacionamiento"("p_registro_id" "uuid", "p_no_dispositivo" "text", "p_claves" "text"[], "p_instalado_por" "text", "p_tag_apartado_no" "text", "p_procedencia_tag" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inv_reclamar_tag"("p_no_dispositivo" "text", "p_registro_id" "uuid", "p_quien" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
    update inventario_tags
       set asignado_a  = p_registro_id,
           asignado_en = now(),
           asignado_por = p_quien
     where no_dispositivo = btrim(coalesce(p_no_dispositivo, ''))
       and asignado_a is null;
end;
$$;


ALTER FUNCTION "public"."inv_reclamar_tag"("p_no_dispositivo" "text", "p_registro_id" "uuid", "p_quien" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pagos_bloquear_borrado_sellado"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    if old.corte_id is not null then
        raise exception 'El pago % pertenece a un corte de caja cerrado y no se puede borrar', coalesce(old.folio_recibo, old.id::text)
            using hint = 'Un corte cerrado es un documento contable. Decida primero que pasa con el corte.';
    end if;
    return old;
end;
$$;


ALTER FUNCTION "public"."pagos_bloquear_borrado_sellado"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pagos_bloquear_truncate_sellado"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    if exists (select 1 from pagos where corte_id is not null) then
        raise exception 'Hay pagos sellados por cortes de caja: truncate esta prohibido en esta base'
            using hint = 'seed_tests_dev.sql es solo para desarrollo. Si ve este error, esta apuntando a una base con cortes reales.';
    end if;
    return null;
end;
$$;


ALTER FUNCTION "public"."pagos_bloquear_truncate_sellado"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pagos_congelar_sellado"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    if old.corte_id is not null and (
           new.monto        is distinct from old.monto
        or new.cobrado_por  is distinct from old.cobrado_por
        or new.folio_recibo is distinct from old.folio_recibo
        or new.corte_id     is distinct from old.corte_id
    ) then
        raise exception 'El pago % ya fue cortado y no admite cambios', coalesce(old.folio_recibo, old.id::text);
    end if;
    return new;
end;
$$;


ALTER FUNCTION "public"."pagos_congelar_sellado"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."panel_exigir_rol"("p_roles" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" STABLE
    AS $$
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


ALTER FUNCTION "public"."panel_exigir_rol"("p_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recordar_chat_ti"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
    v_disponibles int;
    v_pendientes  int;
    v_error       text;
begin
    begin
        select count(*)
          into v_disponibles
          from public.inventario_tags i
         where i.asignado_a is null;

        select count(*)
          into v_pendientes
          from public.registros r
         where r.estado = 'pendiente'
           and r.no_dispositivo is null
           and exists (select 1 from public.pagos p where p.registro_id = r.id);

        perform public.avisar_chat_ti(
            '*SATAG · lunes de instalación:*'
            || chr(10) || 'TAGs disponibles para instalar: ' || v_disponibles
            || chr(10) || 'Cobrados y por instalar: ' || v_pendientes
            || case when v_disponibles = 0
                    then chr(10) || 'No hay TAGs disponibles: dé de alta TAGs en el inventario antes de instalar.'
                    else '' end
            || chr(10) || '<https://satag.asuncionqro.edu.mx/admin/|Abra el panel>'
        );
    exception when others then
        -- Mismo criterio del 66: el error queda a la vista en parametros.
        v_error := left(sqlstate || ' ' || sqlerrm, 300);
        raise warning 'SATAG recordatorio a Chat: fallo (%).', v_error;
        begin
            insert into public.parametros (clave, valor, actualizado_en)
            values ('aviso_chat_ti_ultimo_error', 'recordatorio: ' || v_error, now())
            on conflict (clave) do update
               set valor = excluded.valor, actualizado_en = excluded.actualizado_en;
        exception when others then
            null;
        end;
    end;
end;
$$;


ALTER FUNCTION "public"."recordar_chat_ti"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."registrar_pago"("p_registro_id" "uuid", "p_monto" numeric, "p_cobrado_por" "text" DEFAULT NULL::"text", "p_tipo_usuario" "text" DEFAULT NULL::"text", "p_parentesco_otro" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_estado            text;
    v_tipo_actual       text;
    v_es_menor          boolean;
    v_tipo              text;
    v_quien             text;
    v_folio             text;
    v_corregido         boolean := false;
    v_parentesco_actual text;               -- NUEVO 63
    v_parentesco        text;               -- NUEVO 63
begin
    perform panel_exigir_rol(array['admin']);

    -- La identidad del cobrador es la de la sesion. No hay respaldo tecleado:
    -- si el JWT no trae correo, no hay cobro.
    v_quien := nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '');
    if v_quien is null then
        raise exception 'No se pudo identificar al cobrador desde la sesion. Cierre sesion y vuelva a entrar.';
    end if;

    -- Serializa dos intentos simultaneos sobre el mismo expediente.
    select estado, tipo_usuario, usuario_es_menor, parentesco_otro   -- NUEVO 63: parentesco_otro
      into v_estado, v_tipo_actual, v_es_menor, v_parentesco_actual
      from registros
     where id = p_registro_id
       for update;

    if not found then
        raise exception 'Registro no encontrado';
    end if;
    if v_estado = 'baja' then
        raise exception 'El registro esta dado de baja';
    end if;
    if p_monto is null or p_monto <= 0 then
        raise exception 'El monto debe ser mayor a cero';
    end if;

    -- ---- Validacion del tipo de usuario (CC-05) ----
    v_tipo := nullif(btrim(coalesce(p_tipo_usuario, '')), '');
    if v_tipo is null then
        raise exception 'Confirme el tipo de usuario antes de cobrar (maestro, padres, alumno, admin u otro)';
    end if;
    -- NUEVO 63: quinto tipo, aqui y en los dos mensajes.
    if v_tipo not in ('maestro', 'padres', 'alumno', 'admin', 'otro') then
        raise exception 'Tipo de usuario invalido: % (maestro, padres, alumno, admin u otro)', v_tipo;
    end if;
    if v_es_menor and v_tipo <> 'alumno' then
        raise exception 'El titular es menor de edad: su tipo debe ser alumno';
    end if;

    -- NUEVO 63: antes del insert en pagos, no despues. Un rechazo posterior
    -- revertiria el pago pero quemaria el numero de la secuencia del recibo,
    -- que no se revierte (el mismo dano que describe el bloque 58).
    v_parentesco := nullif(btrim(coalesce(p_parentesco_otro, '')), '');
    if v_tipo = 'otro'
       and coalesce(v_parentesco, nullif(btrim(coalesce(v_parentesco_actual, '')), '')) is null then
        raise exception 'Capture el parentesco del titular con la familia (tio, abuelo, etcetera) antes de cobrar: es obligatorio cuando el tipo de usuario es otro';
    end if;

    select folio_recibo
      into v_folio
      from pagos
     where registro_id = p_registro_id;

    if found then
        raise exception 'El registro ya tiene el pago % registrado', v_folio;
    end if;

    insert into pagos (registro_id, monto, cobrado_por, cobrado_por_uid, cobrado_por_email)
    values (
        p_registro_id,
        p_monto,
        v_quien,
        auth.uid(),
        v_quien
    )
    returning folio_recibo into v_folio;

    if v_tipo is distinct from v_tipo_actual then
        update registros set tipo_usuario = v_tipo where id = p_registro_id;
        insert into movimientos (registro_id, tipo, motivo, hecho_por)
        values (
            p_registro_id, 'cambio',
            'Tipo de usuario: ' || v_tipo_actual || ' -> ' || v_tipo
                || ' (validado al cobrar)',
            v_quien
        );
        v_corregido := true;
    end if;

    -- NUEVO 63: el parentesco solo se escribe cuando el tipo confirmado es
    -- 'otro'. Si llega con cualquier otro tipo se ignora: la columna
    -- describe al familiar de tipo 'otro', y guardarla en un maestro o en
    -- un padre dejaria un dato que ninguna regla sostiene.
    -- La aceptacion NO se toca: su payload sellado conserva lo que el
    -- titular declaro al firmar, y este movimiento es el que documenta que
    -- la escuela lo corrigio despues.
    if v_tipo = 'otro'
       and v_parentesco is not null
       and v_parentesco is distinct from v_parentesco_actual then
        update registros set parentesco_otro = v_parentesco where id = p_registro_id;
        insert into movimientos (registro_id, tipo, motivo, hecho_por)
        values (
            p_registro_id, 'cambio',
            'Parentesco: ' || coalesce(v_parentesco_actual, '(sin dato)') || ' -> ' || v_parentesco
                || ' (validado al cobrar)',
            v_quien
        );
    end if;

    update registros
       set fecha_adquisicion = coalesce(fecha_adquisicion, current_date),
           tipo_validado     = true,
           tipo_validado_por = v_quien,
           tipo_validado_en  = now()
     where id = p_registro_id;

    return jsonb_build_object(
        'id', p_registro_id,
        'folioRecibo', v_folio,
        'tipoUsuario', v_tipo,
        'tipoCorregido', v_corregido,
        'tipoAnterior', case when v_corregido then v_tipo_actual else null end
    );
end;
$$;


ALTER FUNCTION "public"."registrar_pago"("p_registro_id" "uuid", "p_monto" numeric, "p_cobrado_por" "text", "p_tipo_usuario" "text", "p_parentesco_otro" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."retirar_tag_inventario"("p_no_dispositivo" "text", "p_hecho_por" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_num   text;
    v_asig  uuid;
    v_folio text;
begin
    perform panel_exigir_rol(array['ti']);

    v_num := btrim(coalesce(p_no_dispositivo, ''));
    select asignado_a into v_asig
      from inventario_tags
     where no_dispositivo = v_num
       for update;
    if not found then
        raise exception 'Ese TAG no esta en el inventario';
    end if;
    if v_asig is not null then
        select folio into v_folio from registros where id = v_asig;
        raise exception 'Ese TAG ya esta asignado al expediente % y no se puede retirar',
            coalesce(v_folio, v_asig::text);
    end if;

    delete from inventario_tags where no_dispositivo = v_num;
    return jsonb_build_object('retirado', v_num);
end;
$$;


ALTER FUNCTION "public"."retirar_tag_inventario"("p_no_dispositivo" "text", "p_hecho_por" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_pagos_avisar_chat_ti"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
    v_estado text;
    v_tag    text;
    v_total  int;
    v_error  text;
begin
    begin
        select r.estado, r.no_dispositivo
          into v_estado, v_tag
          from public.registros r
         where r.id = new.registro_id;

        -- Un pago de un registro que no queda en la cola de TI (ya tiene TAG
        -- o no esta pendiente) no cambia nada de lo que TI tiene que hacer.
        if v_estado is distinct from 'pendiente' or v_tag is not null then
            return new;
        end if;

        select count(*)
          into v_total
          from public.registros r
         where r.estado = 'pendiente'
           and r.no_dispositivo is null
           and exists (select 1 from public.pagos p where p.registro_id = r.id);

        if v_total > 0 then
            -- Cada mensaje del webhook abre su propio hilo en el espacio: quien
            -- vaya a instalar lo reclama respondiendo en ese hilo (pedido de
            -- Gerardo, 15-sep). Un webhook no puede crear tareas del espacio
            -- ni botones que anoten quien va; eso exigiria una app de Chat.
            perform public.avisar_chat_ti(
                '*SATAG:* se registró un pago. Hay ' || v_total
                || case when v_total = 1 then ' TAG por instalar.' else ' TAGs por instalar.' end
                || ' Quien vaya a instalar, responda *Voy yo* en este hilo.'
                || ' <https://satag.asuncionqro.edu.mx/admin/|Abra el panel>'
            );
        end if;
    exception when others then
        v_error := left(sqlstate || ' ' || sqlerrm, 300);
        raise warning 'SATAG aviso a Chat: fallo el disparador (%). El cobro no se afecta.', v_error;
        begin
            insert into public.parametros (clave, valor, actualizado_en)
            values ('aviso_chat_ti_ultimo_error', 'disparador: ' || v_error, now())
            on conflict (clave) do update
               set valor = excluded.valor, actualizado_en = excluded.actualizado_en;
        exception when others then
            null;
        end;
    end;
    return new;
end;
$$;


ALTER FUNCTION "public"."tg_pagos_avisar_chat_ti"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."usar_tag_apartado"("p_registro_id" "uuid", "p_hecho_por" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_estado      text;
    v_apartado    boolean;
    v_apartado_no text;
    v_actual      text;
    v_quien       text;
begin
    perform panel_exigir_rol(array['ti']);

    select estado, tag_apartado, tag_apartado_no, no_dispositivo
      into v_estado, v_apartado, v_apartado_no, v_actual
      from registros
     where id = p_registro_id
       for update;
    if not found then
        raise exception 'Registro no encontrado';
    end if;
    if v_estado = 'baja' then
        raise exception 'El registro esta dado de baja';
    end if;
    if not coalesce(v_apartado, false) or v_apartado_no is null then
        raise exception 'Este registro no tiene un TAG apartado';
    end if;

    if exists (
        select 1 from registros
         where id <> p_registro_id and estado <> 'baja' and no_dispositivo = v_apartado_no
    ) then
        raise exception 'El TAG apartado % ya esta activo en otro registro', v_apartado_no;
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por,'')), ''), 'TI');

    begin
        update registros
           set no_dispositivo  = v_apartado_no,
               procedencia_tag = 'escuela',
               tag_apartado    = false,
               tag_apartado_no = null
         where id = p_registro_id;
    exception when unique_violation then
        raise exception 'El TAG apartado % ya esta activo en otro registro', v_apartado_no;
    end;

    insert into movimientos (registro_id, tipo, motivo, hecho_por,
                             no_dispositivo_anterior, no_dispositivo_nuevo)
    values (p_registro_id, 'reposicion',
            'Se activo el TAG apartado; la procedencia paso a escuela',
            v_quien, v_actual, v_apartado_no);

    perform inv_reclamar_tag(v_apartado_no, p_registro_id, v_quien);

    update solicitudes
       set atendida = true, atendida_en = now(), atendida_por = v_quien,
           resolucion = 'ejecutada'
     where registro_id = p_registro_id and not atendida
       and (tipo = 'actualizacion' or (tipo = 'nota' and tramite_solicitado = 'actualizacion'));

    return jsonb_build_object('id', p_registro_id);
end;
$$;


ALTER FUNCTION "public"."usar_tag_apartado"("p_registro_id" "uuid", "p_hecho_por" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vincular_nota"("p_solicitud_id" "uuid", "p_registro_id" "uuid", "p_tramite" "text", "p_hecho_por" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."vincular_nota"("p_solicitud_id" "uuid", "p_registro_id" "uuid", "p_tramite" "text", "p_hecho_por" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."aceptaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "registro_id" "uuid" NOT NULL,
    "reglamento_version_id" "uuid" NOT NULL,
    "aviso_version_id" "uuid" NOT NULL,
    "firma_url" "text" NOT NULL,
    "firma_imagen_sha256" "text",
    "firma_trazos" "jsonb",
    "firmante_nombre" "text" NOT NULL,
    "firmante_rol" "text" DEFAULT 'usuario'::"text" NOT NULL,
    "acepto_reglamento" boolean DEFAULT true NOT NULL,
    "acepto_privacidad" boolean DEFAULT true NOT NULL,
    "ip_origen" "inet",
    "user_agent" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "hash_algoritmo" "text" DEFAULT 'sha256'::"text" NOT NULL,
    "hash_documento" "text" NOT NULL,
    "hash_payload" "jsonb" NOT NULL,
    "sello_tiempo" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "aceptaciones_consentimiento_explicito" CHECK (("acepto_reglamento" AND "acepto_privacidad")),
    CONSTRAINT "aceptaciones_firma_imagen_sha256" CHECK ((("firma_imagen_sha256" IS NULL) OR ("firma_imagen_sha256" ~ '^[0-9a-f]{64}$'::"text"))),
    CONSTRAINT "aceptaciones_firmante_rol_valido" CHECK (("firmante_rol" = ANY (ARRAY['usuario'::"text", 'padre'::"text", 'madre'::"text", 'tutor'::"text", 'otro'::"text"]))),
    CONSTRAINT "aceptaciones_hash_algoritmo_valido" CHECK (("hash_algoritmo" = 'sha256'::"text")),
    CONSTRAINT "aceptaciones_hash_sha256" CHECK (("hash_documento" ~ '^[0-9a-f]{64}$'::"text"))
);


ALTER TABLE "public"."aceptaciones" OWNER TO "postgres";


COMMENT ON COLUMN "public"."aceptaciones"."firma_url" IS 'PII (LFPDPPP). Ruta en Storage privado, NO publica';



COMMENT ON COLUMN "public"."aceptaciones"."firma_imagen_sha256" IS 'SHA-256 opcional del PNG de firma subido a Storage';



COMMENT ON COLUMN "public"."aceptaciones"."firma_trazos" IS 'PII. Trazos usados solo como evidencia de firma';



COMMENT ON COLUMN "public"."aceptaciones"."firmante_nombre" IS 'PII. Snapshot inmutable del firmante';



COMMENT ON COLUMN "public"."aceptaciones"."ip_origen" IS 'PII posible. Capturar solo si el flujo lo obtiene de forma confiable';



COMMENT ON COLUMN "public"."aceptaciones"."user_agent" IS 'Metadato tecnico de aceptacion';



COMMENT ON COLUMN "public"."aceptaciones"."hash_payload" IS 'Paquete canonico firmado y usado para calcular hash_documento. Contiene snapshot de PII';



CREATE TABLE IF NOT EXISTS "public"."aviso_versiones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version" integer NOT NULL,
    "contenido" "text" NOT NULL,
    "url_publica" "text",
    "vigente" boolean DEFAULT false NOT NULL,
    "publicado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "contenido_simplificado" "text",
    CONSTRAINT "aviso_contenido_no_vacio" CHECK (("btrim"("contenido") <> ''::"text")),
    CONSTRAINT "aviso_url_publica_no_vacia" CHECK ((("url_publica" IS NULL) OR ("btrim"("url_publica") <> ''::"text"))),
    CONSTRAINT "aviso_version_positiva" CHECK (("version" > 0)),
    CONSTRAINT "aviso_vigente_exige_simplificado" CHECK (((NOT "vigente") OR (("contenido_simplificado" IS NOT NULL) AND ("btrim"("contenido_simplificado") <> ''::"text"))))
);


ALTER TABLE "public"."aviso_versiones" OWNER TO "postgres";


COMMENT ON COLUMN "public"."aviso_versiones"."contenido_simplificado" IS 'Aviso simplificado que se muestra al momento de recabar los datos, con el enlace al integral. El integral vive en contenido. Obligatorio en la version vigente (constraint aviso_vigente_exige_simplificado).';



COMMENT ON CONSTRAINT "aviso_vigente_exige_simplificado" ON "public"."aviso_versiones" IS 'Una version vigente debe traer su aviso simplificado: sin el, el formulario recaba datos sin el aviso corto que la ley pide a la vista.';



CREATE TABLE IF NOT EXISTS "public"."cat_colores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    CONSTRAINT "cat_colores_nombre_no_vacio" CHECK (("btrim"("nombre") <> ''::"text")),
    CONSTRAINT "cat_colores_nombre_sin_espacios" CHECK (("nombre" = "btrim"("nombre")))
);


ALTER TABLE "public"."cat_colores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cat_marcas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    CONSTRAINT "cat_marcas_nombre_no_vacio" CHECK (("btrim"("nombre") <> ''::"text")),
    CONSTRAINT "cat_marcas_nombre_sin_espacios" CHECK (("nombre" = "btrim"("nombre")))
);


ALTER TABLE "public"."cat_marcas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cat_modelos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "marca_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    CONSTRAINT "cat_modelos_nombre_no_vacio" CHECK (("btrim"("nombre") <> ''::"text")),
    CONSTRAINT "cat_modelos_nombre_sin_espacios" CHECK (("nombre" = "btrim"("nombre")))
);


ALTER TABLE "public"."cat_modelos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cortes_caja" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "folio_corte" "text" NOT NULL,
    "cortado_por" "text" NOT NULL,
    "cortado_por_uid" "uuid",
    "cortado_por_email" "text",
    "periodo_desde" timestamp with time zone,
    "periodo_hasta" timestamp with time zone DEFAULT "now"() NOT NULL,
    "total_esperado" numeric(12,2) NOT NULL,
    "cantidad_pagos" integer NOT NULL,
    "dias_de_cobro" integer DEFAULT 1 NOT NULL,
    "desglose_por_dia" "jsonb",
    "efectivo_contado" numeric(12,2) NOT NULL,
    "diferencia" numeric(12,2) GENERATED ALWAYS AS (("efectivo_contado" - "total_esperado")) STORED,
    "observaciones" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "corte_con_pagos" CHECK (("cantidad_pagos" > 0)),
    CONSTRAINT "corte_contado_no_negativo" CHECK (("efectivo_contado" >= (0)::numeric)),
    CONSTRAINT "corte_cortado_por_no_vacio" CHECK (("btrim"("cortado_por") <> ''::"text")),
    CONSTRAINT "corte_diferencia_explicada" CHECK ((("efectivo_contado" = "total_esperado") OR ("btrim"(COALESCE("observaciones", ''::"text")) <> ''::"text"))),
    CONSTRAINT "corte_total_no_negativo" CHECK (("total_esperado" >= (0)::numeric))
);


ALTER TABLE "public"."cortes_caja" OWNER TO "postgres";


COMMENT ON TABLE "public"."cortes_caja" IS 'Cortes de caja de Administracion. Documento contable inmutable.';



COMMENT ON COLUMN "public"."cortes_caja"."cortado_por" IS 'PII indirecta: nombre del personal que cerro el corte';



COMMENT ON COLUMN "public"."cortes_caja"."cortado_por_uid" IS 'Identidad verificable (auth.uid) de quien corto; hace el faltante atribuible';



COMMENT ON COLUMN "public"."cortes_caja"."desglose_por_dia" IS 'Subtotales por dia local, congelados al cortar: permite auditar sin recalcular';



COMMENT ON COLUMN "public"."cortes_caja"."diferencia" IS 'Positivo = sobrante, negativo = faltante. Calculada por la base, el cliente no la manda';



CREATE SEQUENCE IF NOT EXISTS "public"."cortes_caja_folio_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."cortes_caja_folio_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."cortes_caja_folio_seq" OWNED BY "public"."cortes_caja"."folio_corte";



CREATE TABLE IF NOT EXISTS "public"."estacionamientos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clave" "text" NOT NULL,
    "descripcion" "text",
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "estacionamientos_clave_formato" CHECK (("clave" ~ '^E[0-9]+$'::"text")),
    CONSTRAINT "estacionamientos_clave_no_vacia" CHECK (("btrim"("clave") <> ''::"text"))
);


ALTER TABLE "public"."estacionamientos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."intentos_publicos" (
    "id" bigint NOT NULL,
    "ip" "inet",
    "funcion" "text" NOT NULL,
    "exito" boolean NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."intentos_publicos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."intentos_publicos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."intentos_publicos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."intentos_publicos_id_seq" OWNED BY "public"."intentos_publicos"."id";



CREATE TABLE IF NOT EXISTS "public"."inventario_tags" (
    "no_dispositivo" "text" NOT NULL,
    "dado_de_alta_por" "text" NOT NULL,
    "dado_de_alta_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "asignado_a" "uuid",
    "asignado_en" timestamp with time zone,
    "asignado_por" "text",
    CONSTRAINT "inv_asignacion_coherente" CHECK (((("asignado_a" IS NULL) AND ("asignado_en" IS NULL) AND ("asignado_por" IS NULL)) OR (("asignado_a" IS NOT NULL) AND ("asignado_en" IS NOT NULL)))),
    CONSTRAINT "inv_tag_formato" CHECK (("no_dispositivo" ~ '^[0-9]{6,11}$'::"text"))
);


ALTER TABLE "public"."inventario_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."movimientos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "registro_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "fecha" "date" DEFAULT CURRENT_DATE NOT NULL,
    "no_dispositivo_anterior" "text",
    "no_dispositivo_nuevo" "text",
    "motivo" "text",
    "hecho_por" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mov_tipo_valido" CHECK (("tipo" = ANY (ARRAY['alta'::"text", 'baja'::"text", 'reposicion'::"text", 'cambio'::"text", 'prueba'::"text", 'bloqueo'::"text", 'rectificacion'::"text"])))
);


ALTER TABLE "public"."movimientos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pagos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "registro_id" "uuid" NOT NULL,
    "monto" numeric(8,2) NOT NULL,
    "metodo" "text" DEFAULT 'efectivo'::"text" NOT NULL,
    "cobrado_por" "text",
    "folio_recibo" "text" NOT NULL,
    "fecha" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "corte_id" "uuid",
    "cobrado_por_uid" "uuid",
    "cobrado_por_email" "text",
    CONSTRAINT "pagos_cobrado_por_no_vacio" CHECK ((("cobrado_por" IS NULL) OR ("btrim"("cobrado_por") <> ''::"text"))),
    CONSTRAINT "pagos_folio_recibo_no_vacio" CHECK ((("folio_recibo" IS NULL) OR ("btrim"("folio_recibo") <> ''::"text"))),
    CONSTRAINT "pagos_metodo_valido" CHECK (("metodo" = 'efectivo'::"text")),
    CONSTRAINT "pagos_monto_positivo" CHECK (("monto" > (0)::numeric))
);


ALTER TABLE "public"."pagos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."pagos"."cobrado_por" IS 'PII indirecta: nombre del personal que cobro';



COMMENT ON COLUMN "public"."pagos"."folio_recibo" IS 'Folio automatico e inmutable: SATAG-AAAA-secuencia global';



COMMENT ON COLUMN "public"."pagos"."corte_id" IS 'Corte que sello este cobro. NULL = el dinero sigue en la caja';



COMMENT ON COLUMN "public"."pagos"."cobrado_por_uid" IS 'Identidad verificable (auth.uid) de quien cobro';



CREATE SEQUENCE IF NOT EXISTS "public"."pagos_folio_recibo_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pagos_folio_recibo_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pagos_folio_recibo_seq" OWNED BY "public"."pagos"."folio_recibo";



CREATE TABLE IF NOT EXISTS "public"."parametros" (
    "clave" "text" NOT NULL,
    "valor" "text" NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."parametros" OWNER TO "postgres";


COMMENT ON TABLE "public"."parametros" IS 'Interruptores de operacion que leen funciones SECURITY DEFINER (bloque 66). Sin politicas: no se alcanza desde la API. Se cambian desde el SQL Editor.';



CREATE TABLE IF NOT EXISTS "public"."registro_estacionamientos" (
    "registro_id" "uuid" NOT NULL,
    "estacionamiento_clave" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."registro_estacionamientos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."registros" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "folio" "text" NOT NULL,
    "usuario_nombres" "text" NOT NULL,
    "usuario_apellido_paterno" "text" NOT NULL,
    "usuario_apellido_materno" "text",
    "usuario_nombre_completo" "text" GENERATED ALWAYS AS ("btrim"(((("usuario_nombres" || ' '::"text") || "usuario_apellido_paterno") || COALESCE((' '::"text" || "usuario_apellido_materno"), ''::"text")))) STORED,
    "gestionante_nombres" "text",
    "gestionante_apellido_paterno" "text",
    "gestionante_apellido_materno" "text",
    "gestionante_nombre_completo" "text" GENERATED ALWAYS AS (
CASE
    WHEN ("gestionante_nombres" IS NULL) THEN NULL::"text"
    ELSE "btrim"(((("gestionante_nombres" || ' '::"text") || COALESCE("gestionante_apellido_paterno", ''::"text")) || COALESCE((' '::"text" || "gestionante_apellido_materno"), ''::"text")))
END) STORED,
    "gestionante_relacion" "text",
    "usuario_es_menor" boolean DEFAULT false NOT NULL,
    "tipo_usuario" "text" DEFAULT 'padres'::"text" NOT NULL,
    "tipo_validado" boolean DEFAULT false NOT NULL,
    "tipo_validado_por" "text",
    "tipo_validado_en" timestamp with time zone,
    "marca" "text" NOT NULL,
    "modelo" "text" NOT NULL,
    "color" "text" NOT NULL,
    "placas" "text",
    "sin_placas" boolean DEFAULT false NOT NULL,
    "no_dispositivo" "text",
    "procedencia_tag" "text" DEFAULT 'escuela'::"text" NOT NULL,
    "tag_apartado" boolean DEFAULT false NOT NULL,
    "tag_apartado_no" "text",
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "motivo_baja" "text",
    "fecha_baja" "date",
    "bloqueado_en" timestamp with time zone,
    "bloqueo_motivo" "text",
    "suprimir_despues_de" "date",
    "fecha_adquisicion" "date",
    "fecha_instalacion" "date",
    "instalado_por" "text",
    "observaciones" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "apellidos_familia" "text",
    "parentesco_otro" "text",
    "instalado_en" timestamp with time zone,
    "instalado_por_uid" "uuid",
    "instalado_por_email" "text",
    "seccion_maestro" "text",
    CONSTRAINT "reg_baja_coherente" CHECK ((("estado" <> 'baja'::"text") OR (("motivo_baja" IS NOT NULL) AND ("fecha_baja" IS NOT NULL)))),
    CONSTRAINT "reg_bloqueo_coherente" CHECK ((("estado" <> 'bloqueado'::"text") OR (("bloqueado_en" IS NOT NULL) AND ("bloqueo_motivo" IS NOT NULL)))),
    CONSTRAINT "reg_estado_valido" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'activo'::"text", 'baja'::"text", 'bloqueado'::"text"]))),
    CONSTRAINT "reg_folio_formato" CHECK (("folio" ~ '^SATAG-[0-9]{6,}$'::"text")),
    CONSTRAINT "reg_gestionante_apellido_materno_no_vacio" CHECK ((("gestionante_apellido_materno" IS NULL) OR ("btrim"("gestionante_apellido_materno") <> ''::"text"))),
    CONSTRAINT "reg_gestionante_completo" CHECK ((("gestionante_nombres" IS NULL) OR (("btrim"("gestionante_nombres") <> ''::"text") AND ("gestionante_apellido_paterno" IS NOT NULL) AND ("btrim"("gestionante_apellido_paterno") <> ''::"text")))),
    CONSTRAINT "reg_gestionante_relacion_valida" CHECK ((("gestionante_relacion" IS NULL) OR ("gestionante_relacion" = ANY (ARRAY['padre'::"text", 'madre'::"text", 'tutor'::"text", 'otro'::"text"])))),
    CONSTRAINT "reg_menor_requiere_gestionante" CHECK ((("usuario_es_menor" = false) OR (("gestionante_nombres" IS NOT NULL) AND ("btrim"("gestionante_nombres") <> ''::"text") AND ("gestionante_apellido_paterno" IS NOT NULL) AND ("btrim"("gestionante_apellido_paterno") <> ''::"text") AND ("gestionante_relacion" = ANY (ARRAY['padre'::"text", 'madre'::"text", 'tutor'::"text"]))))),
    CONSTRAINT "reg_modelo_no_vacio" CHECK (("btrim"("modelo") <> ''::"text")),
    CONSTRAINT "reg_no_dispositivo_formato" CHECK ((("no_dispositivo" IS NULL) OR ("no_dispositivo" ~ '^[0-9]{6,11}$'::"text"))),
    CONSTRAINT "reg_placas_requeridas" CHECK (((("placas" IS NOT NULL) AND ("btrim"("placas") <> ''::"text")) OR "sin_placas")),
    CONSTRAINT "reg_procedencia_valida" CHECK (("procedencia_tag" = ANY (ARRAY['escuela'::"text", 'propio'::"text"]))),
    CONSTRAINT "reg_tag_apartado_coherente" CHECK (((("tag_apartado" = false) AND ("tag_apartado_no" IS NULL)) OR (("tag_apartado" = true) AND ("tag_apartado_no" IS NOT NULL)))),
    CONSTRAINT "reg_tag_apartado_no_formato" CHECK ((("tag_apartado_no" IS NULL) OR ("tag_apartado_no" ~ '^[0-9]{6,11}$'::"text"))),
    CONSTRAINT "reg_tipo_usuario_valido" CHECK (("tipo_usuario" = ANY (ARRAY['maestro'::"text", 'padres'::"text", 'alumno'::"text", 'admin'::"text", 'otro'::"text"]))),
    CONSTRAINT "reg_usuario_apellido_materno_no_vacio" CHECK ((("usuario_apellido_materno" IS NULL) OR ("btrim"("usuario_apellido_materno") <> ''::"text"))),
    CONSTRAINT "reg_usuario_apellido_paterno_no_vacio" CHECK (("btrim"("usuario_apellido_paterno") <> ''::"text")),
    CONSTRAINT "reg_usuario_nombres_no_vacio" CHECK (("btrim"("usuario_nombres") <> ''::"text"))
);


ALTER TABLE "public"."registros" OWNER TO "postgres";


COMMENT ON COLUMN "public"."registros"."usuario_nombres" IS 'PII (LFPDPPP)';



COMMENT ON COLUMN "public"."registros"."usuario_apellido_paterno" IS 'PII (LFPDPPP)';



COMMENT ON COLUMN "public"."registros"."usuario_apellido_materno" IS 'PII (LFPDPPP). Opcional (titular con un solo apellido)';



COMMENT ON COLUMN "public"."registros"."usuario_nombre_completo" IS 'PII (LFPDPPP). Columna GENERATED STORED para busqueda/visualizacion';



COMMENT ON COLUMN "public"."registros"."gestionante_nombres" IS 'PII (LFPDPPP). NULL = mismo que el usuario';



COMMENT ON COLUMN "public"."registros"."gestionante_apellido_paterno" IS 'PII (LFPDPPP)';



COMMENT ON COLUMN "public"."registros"."gestionante_apellido_materno" IS 'PII (LFPDPPP). Opcional';



COMMENT ON COLUMN "public"."registros"."gestionante_nombre_completo" IS 'PII (LFPDPPP). GENERATED STORED; NULL = mismo que el usuario';



COMMENT ON COLUMN "public"."registros"."placas" IS 'PII (LFPDPPP)';



COMMENT ON COLUMN "public"."registros"."observaciones" IS 'PII posible (LFPDPPP)';



COMMENT ON COLUMN "public"."registros"."apellidos_familia" IS 'PII (LFPDPPP). Apellidos de la familia del alumno, para cotejar contra la lista de inscritos; obligatorio EN EL ALTA cuando tipo_usuario = padres, exigido dentro de crear_registro (bloque 58; la restriccion de tabla del bloque 55 parte B quedo revocada porque congelaba el expediente en cada update)';



COMMENT ON COLUMN "public"."registros"."parentesco_otro" IS 'PII (LFPDPPP). Parentesco declarado con la familia del alumno cuando tipo_usuario = otro (tio, abuelo, chofer...). TEXTO LIBRE A PROPOSITO (decision del 11-sep, bloque 63): aun no se sabe que parentescos aparecen de verdad y un catalogo inventado obligaria a un bloque nuevo en cuanto llegue uno fuera de la lista; se cataloga cuando el uso real muestre el patron. Obligatorio EN EL ALTA, exigido dentro de crear_registro, y AL COBRAR cuando la caja confirma el tipo otro, exigido dentro de registrar_pago (que tambien lo corrige y lo anota en movimientos)';



COMMENT ON COLUMN "public"."registros"."instalado_en" IS 'Hora real de la instalacion (bloque 68). Lo instalado antes del 68 solo tiene fecha_instalacion.';



COMMENT ON COLUMN "public"."registros"."instalado_por_uid" IS 'Identidad verificable (auth.uid) de quien instalo, tomada del JWT (bloque 68).';



COMMENT ON COLUMN "public"."registros"."instalado_por_email" IS 'PII indirecta: correo de la sesion de quien instalo, tomado del JWT (bloque 68).';



COMMENT ON COLUMN "public"."registros"."seccion_maestro" IS 'Dato laboral del maestro que solicita el TAG: preescolar, primaria, secundaria o preparatoria (bloque 70). Solo tipo maestro. Decide el estacionamiento. Sin CHECK: la regla vive en crear_registro.';



CREATE SEQUENCE IF NOT EXISTS "public"."registros_folio_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."registros_folio_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reglamento_versiones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version" integer NOT NULL,
    "contenido" "text" NOT NULL,
    "vigente" boolean DEFAULT false NOT NULL,
    "publicado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reglamento_contenido_no_vacio" CHECK (("btrim"("contenido") <> ''::"text")),
    CONSTRAINT "reglamento_version_positiva" CHECK (("version" > 0))
);


ALTER TABLE "public"."reglamento_versiones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."solicitudes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "registro_id" "uuid",
    "tipo" "text" NOT NULL,
    "detalle" "text" NOT NULL,
    "origen" "text" DEFAULT 'publico'::"text" NOT NULL,
    "atendida" boolean DEFAULT false NOT NULL,
    "atendida_en" timestamp with time zone,
    "atendida_por" "text",
    "resolucion" "text",
    "motivo_resolucion" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "solicitante_nombre" "text",
    "alumno_nombre" "text",
    "alumno_grado" "text",
    "vehiculo_desc" "text",
    "solicitante_rol" "text",
    "tramite_solicitado" "text",
    CONSTRAINT "sol_atendida_coherente" CHECK ((((NOT "atendida") AND ("atendida_en" IS NULL) AND ("atendida_por" IS NULL)) OR ("atendida" AND ("atendida_en" IS NOT NULL)))),
    CONSTRAINT "sol_campos_nota" CHECK ((("tipo" = 'nota'::"text") OR (("solicitante_nombre" IS NULL) AND ("solicitante_rol" IS NULL) AND ("alumno_nombre" IS NULL) AND ("alumno_grado" IS NULL) AND ("vehiculo_desc" IS NULL) AND ("tramite_solicitado" IS NULL)))),
    CONSTRAINT "sol_detalle_max" CHECK (("char_length"("detalle") <= 500)),
    CONSTRAINT "sol_detalle_no_vacio" CHECK (("btrim"("detalle") <> ''::"text")),
    CONSTRAINT "sol_motivo_resolucion_no_vacio" CHECK ((("motivo_resolucion" IS NULL) OR ("btrim"("motivo_resolucion") <> ''::"text"))),
    CONSTRAINT "sol_nota_requiere_datos" CHECK ((("tipo" <> 'nota'::"text") OR (("btrim"(COALESCE("solicitante_nombre", ''::"text")) <> ''::"text") AND ("solicitante_rol" IS NOT NULL) AND (("solicitante_rol" <> 'padres'::"text") OR (("btrim"(COALESCE("alumno_nombre", ''::"text")) <> ''::"text") AND ("btrim"(COALESCE("alumno_grado", ''::"text")) <> ''::"text")))))),
    CONSTRAINT "sol_nota_tramite_obligatorio" CHECK ((("tipo" <> 'nota'::"text") OR ("tramite_solicitado" IS NOT NULL))),
    CONSTRAINT "sol_origen_valido" CHECK (("origen" = ANY (ARRAY['publico'::"text", 'interno'::"text"]))),
    CONSTRAINT "sol_registro_por_tipo" CHECK ((("tipo" = 'nota'::"text") OR ("registro_id" IS NOT NULL))),
    CONSTRAINT "sol_resolucion_coherente" CHECK ((((NOT "atendida") AND ("resolucion" IS NULL) AND ("motivo_resolucion" IS NULL)) OR ("atendida" AND ("resolucion" = ANY (ARRAY['ejecutada'::"text", 'descartada'::"text"]))))),
    CONSTRAINT "sol_solicitante_rol_valido" CHECK ((("solicitante_rol" IS NULL) OR ("solicitante_rol" = ANY (ARRAY['maestro'::"text", 'padres'::"text", 'alumno'::"text", 'admin'::"text"])))),
    CONSTRAINT "sol_tipo_valido" CHECK (("tipo" = ANY (ARRAY['actualizacion'::"text", 'baja'::"text", 'nota'::"text"]))),
    CONSTRAINT "sol_tramite_valido" CHECK ((("tramite_solicitado" IS NULL) OR ("tramite_solicitado" = ANY (ARRAY['actualizacion'::"text", 'baja'::"text"]))))
);


ALTER TABLE "public"."solicitudes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."solicitudes"."detalle" IS 'PII posible (texto libre capturado por el publico)';



COMMENT ON COLUMN "public"."solicitudes"."atendida_por" IS 'PII indirecta: nombre del personal que atendio';



COMMENT ON COLUMN "public"."solicitudes"."resolucion" IS 'Como se cerro: ejecutada | descartada. NULL mientras esta pendiente';



COMMENT ON COLUMN "public"."solicitudes"."motivo_resolucion" IS 'Por que se descarto (obligatorio en descartar_solicitud)';



COMMENT ON COLUMN "public"."solicitudes"."solicitante_nombre" IS 'PII (LFPDPPP): nombre de quien deja la nota publica (SC-003)';



COMMENT ON COLUMN "public"."solicitudes"."alumno_nombre" IS 'PII (LFPDPPP): nombre del alumno referido en la nota (SC-003)';



COMMENT ON COLUMN "public"."solicitudes"."alumno_grado" IS 'Grado/grupo del alumno, para que TI empate la nota';



COMMENT ON COLUMN "public"."solicitudes"."vehiculo_desc" IS 'PII posible: descripcion libre del coche (opcional)';



COMMENT ON COLUMN "public"."solicitudes"."solicitante_rol" IS 'Quien deja la nota (SC-003): padres|maestro|alumno|admin. Alineado con reg_tipo_usuario_valido. NULL fuera de las notas.';



COMMENT ON COLUMN "public"."solicitudes"."tramite_solicitado" IS 'Que tramite PIDE el cliente en una nota del buzon (SC-003): instalacion|actualizacion|baja. Es lo que pide, no lo que TI decide (TI lo corrobora). NULL fuera de las notas.';



CREATE OR REPLACE VIEW "public"."v_evidencia_firma" WITH ("security_invoker"='true') AS
 SELECT "registro_id",
    "firma_url",
    "firma_imagen_sha256",
    "firmante_nombre",
    "firmante_rol",
    "hash_algoritmo",
    "hash_documento",
    "sello_tiempo",
        CASE
            WHEN ((("hash_payload" -> 'reglamento'::"text") ->> 'version'::"text") ~ '^[0-9]+$'::"text") THEN ((("hash_payload" -> 'reglamento'::"text") ->> 'version'::"text"))::integer
            ELSE NULL::integer
        END AS "reglamento_version",
        CASE
            WHEN ((("hash_payload" -> 'aviso_privacidad'::"text") ->> 'version'::"text") ~ '^[0-9]+$'::"text") THEN ((("hash_payload" -> 'aviso_privacidad'::"text") ->> 'version'::"text"))::integer
            ELSE NULL::integer
        END AS "aviso_version",
    ("firma_trazos" IS NOT NULL) AS "tiene_trazos",
    "created_at"
   FROM "public"."aceptaciones" "a";


ALTER VIEW "public"."v_evidencia_firma" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_evidencia_firma" IS 'SC-008: porcion probatoria de la aceptacion para el panel (version de reglamento y aviso, sello de tiempo, hash y ruta del PNG). Sin hash_payload, trazos, IP ni user-agent. security_invoker: hereda la RLS de aceptaciones (admin/ti/super).';



CREATE OR REPLACE VIEW "public"."v_registros_incompletos" WITH ("security_invoker"='true') AS
 WITH "base" AS (
         SELECT "r"."id",
            "r"."folio",
            "r"."usuario_nombre_completo",
            "r"."gestionante_nombre_completo",
            "r"."tipo_usuario",
            "r"."marca",
            "r"."modelo",
            "r"."color",
            "r"."placas",
            "r"."sin_placas",
            "r"."no_dispositivo",
            "r"."procedencia_tag",
            "r"."estado",
            "r"."created_at",
            "p"."folio_recibo",
            "p"."created_at" AS "pago_created_at",
            ((("now"() AT TIME ZONE 'America/Mexico_City'::"text"))::"date" - (("r"."created_at" AT TIME ZONE 'America/Mexico_City'::"text"))::"date") AS "dias_desde_alta",
            ((("now"() AT TIME ZONE 'America/Mexico_City'::"text"))::"date" - (("p"."created_at" AT TIME ZONE 'America/Mexico_City'::"text"))::"date") AS "dias_desde_pago",
            (EXISTS ( SELECT 1
                   FROM "public"."registro_estacionamientos" "re"
                  WHERE ("re"."registro_id" = "r"."id"))) AS "tiene_estacionamiento"
           FROM ("public"."registros" "r"
             LEFT JOIN "public"."pagos" "p" ON (("p"."registro_id" = "r"."id")))
          WHERE ("r"."estado" <> 'baja'::"text")
        ), "evaluado" AS (
         SELECT "b"."id",
            "b"."folio",
            "b"."usuario_nombre_completo",
            "b"."gestionante_nombre_completo",
            "b"."tipo_usuario",
            "b"."marca",
            "b"."modelo",
            "b"."color",
            "b"."placas",
            "b"."sin_placas",
            "b"."no_dispositivo",
            "b"."procedencia_tag",
            "b"."estado",
            "b"."created_at",
            "b"."folio_recibo",
            "b"."pago_created_at",
            "b"."dias_desde_alta",
            "b"."dias_desde_pago",
            "b"."tiene_estacionamiento",
            "array_remove"(ARRAY[
                CASE
                    WHEN (("b"."no_dispositivo" IS NOT NULL) AND ("b"."pago_created_at" IS NULL)) THEN 'tag_sin_pago'::"text"
                    ELSE NULL::"text"
                END,
                CASE
                    WHEN (("b"."estado" = 'activo'::"text") AND ("b"."no_dispositivo" IS NULL)) THEN 'activo_sin_tag'::"text"
                    ELSE NULL::"text"
                END,
                CASE
                    WHEN (("b"."no_dispositivo" IS NOT NULL) AND (NOT "b"."tiene_estacionamiento")) THEN 'tag_sin_estacionamiento'::"text"
                    ELSE NULL::"text"
                END,
                CASE
                    WHEN (("btrim"(COALESCE("b"."marca", ''::"text")) = ''::"text") OR ("btrim"(COALESCE("b"."color", ''::"text")) = ''::"text")) THEN 'vehiculo_incompleto'::"text"
                    ELSE NULL::"text"
                END,
                CASE
                    WHEN (("b"."no_dispositivo" IS NOT NULL) AND "b"."sin_placas") THEN 'sin_placas'::"text"
                    ELSE NULL::"text"
                END,
                CASE
                    WHEN (("b"."pago_created_at" IS NULL) AND ("b"."dias_desde_alta" >= 7)) THEN 'sin_pago'::"text"
                    ELSE NULL::"text"
                END,
                CASE
                    WHEN (("b"."pago_created_at" IS NOT NULL) AND ("b"."no_dispositivo" IS NULL) AND ("b"."dias_desde_pago" >= 7)) THEN 'sin_instalar'::"text"
                    ELSE NULL::"text"
                END], NULL::"text") AS "motivos"
           FROM "base" "b"
        )
 SELECT "id",
    "folio",
    "usuario_nombre_completo",
    "gestionante_nombre_completo",
    "tipo_usuario",
    "marca",
    "modelo",
    "color",
    "placas",
    "sin_placas",
    "no_dispositivo",
    "procedencia_tag",
    "estado",
    "folio_recibo",
    "created_at",
    "dias_desde_alta",
    "dias_desde_pago",
    "motivos",
    "cardinality"("motivos") AS "total_motivos"
   FROM "evaluado" "e"
  WHERE ("cardinality"("motivos") > 0);


ALTER VIEW "public"."v_registros_incompletos" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_registros_incompletos" IS 'CC-02: expedientes con algo faltante para operar, con el motivo. Una fila por expediente; motivos[] trae los codigos. Excluye estado=baja. security_invoker: hereda la RLS del panel.';



CREATE TABLE IF NOT EXISTS "public"."zk_tarjetas" (
    "no_dispositivo" "text" NOT NULL,
    "zk_id" "text" NOT NULL,
    "cargado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cargado_por" "text" NOT NULL
);


ALTER TABLE "public"."zk_tarjetas" OWNER TO "postgres";


ALTER TABLE ONLY "public"."cortes_caja" ALTER COLUMN "folio_corte" SET DEFAULT ((('SATAG-CORTE-'::"text" || "to_char"(("now"() AT TIME ZONE 'America/Mexico_City'::"text"), 'YYYY'::"text")) || '-'::"text") || "lpad"(("nextval"('"public"."cortes_caja_folio_seq"'::"regclass"))::"text", 6, '0'::"text"));



ALTER TABLE ONLY "public"."intentos_publicos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."intentos_publicos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."pagos" ALTER COLUMN "folio_recibo" SET DEFAULT ((('SATAG-'::"text" || "to_char"((CURRENT_DATE)::timestamp with time zone, 'YYYY'::"text")) || '-'::"text") || "lpad"(("nextval"('"public"."pagos_folio_recibo_seq"'::"regclass"))::"text", 6, '0'::"text"));



ALTER TABLE ONLY "public"."aceptaciones"
    ADD CONSTRAINT "aceptaciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aceptaciones"
    ADD CONSTRAINT "aceptaciones_registro_id_key" UNIQUE ("registro_id");



ALTER TABLE ONLY "public"."aviso_versiones"
    ADD CONSTRAINT "aviso_versiones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aviso_versiones"
    ADD CONSTRAINT "aviso_versiones_version_key" UNIQUE ("version");



ALTER TABLE ONLY "public"."cat_colores"
    ADD CONSTRAINT "cat_colores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cat_marcas"
    ADD CONSTRAINT "cat_marcas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cat_modelos"
    ADD CONSTRAINT "cat_modelos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cortes_caja"
    ADD CONSTRAINT "cortes_caja_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."estacionamientos"
    ADD CONSTRAINT "estacionamientos_clave_key" UNIQUE ("clave");



ALTER TABLE ONLY "public"."estacionamientos"
    ADD CONSTRAINT "estacionamientos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."intentos_publicos"
    ADD CONSTRAINT "intentos_publicos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventario_tags"
    ADD CONSTRAINT "inventario_tags_pkey" PRIMARY KEY ("no_dispositivo");



ALTER TABLE ONLY "public"."movimientos"
    ADD CONSTRAINT "movimientos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pagos"
    ADD CONSTRAINT "pagos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parametros"
    ADD CONSTRAINT "parametros_pkey" PRIMARY KEY ("clave");



ALTER TABLE ONLY "public"."registro_estacionamientos"
    ADD CONSTRAINT "registro_estacionamientos_pkey" PRIMARY KEY ("registro_id", "estacionamiento_clave");



ALTER TABLE ONLY "public"."registros"
    ADD CONSTRAINT "registros_folio_key" UNIQUE ("folio");



ALTER TABLE ONLY "public"."registros"
    ADD CONSTRAINT "registros_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reglamento_versiones"
    ADD CONSTRAINT "reglamento_versiones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reglamento_versiones"
    ADD CONSTRAINT "reglamento_versiones_version_key" UNIQUE ("version");



ALTER TABLE ONLY "public"."solicitudes"
    ADD CONSTRAINT "solicitudes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zk_tarjetas"
    ADD CONSTRAINT "zk_tarjetas_pkey" PRIMARY KEY ("no_dispositivo");



CREATE INDEX "ix_cat_modelos_marca" ON "public"."cat_modelos" USING "btree" ("marca_id");



CREATE INDEX "ix_cortes_created" ON "public"."cortes_caja" USING "btree" ("created_at" DESC);



CREATE INDEX "ix_intentos_publicos_ip_fn_fecha" ON "public"."intentos_publicos" USING "btree" ("ip", "funcion", "creado_en" DESC);



CREATE INDEX "ix_movimientos_registro" ON "public"."movimientos" USING "btree" ("registro_id");



CREATE INDEX "ix_pagos_en_caja" ON "public"."pagos" USING "btree" ("corte_id") WHERE ("corte_id" IS NULL);



CREATE INDEX "ix_pagos_registro" ON "public"."pagos" USING "btree" ("registro_id");



CREATE INDEX "ix_regest_clave" ON "public"."registro_estacionamientos" USING "btree" ("estacionamiento_clave");



CREATE INDEX "ix_registros_estado" ON "public"."registros" USING "btree" ("estado");



CREATE INDEX "ix_registros_no_dispositivo" ON "public"."registros" USING "btree" ("no_dispositivo");



CREATE INDEX "ix_registros_placas" ON "public"."registros" USING "btree" ("upper"("placas"));



CREATE INDEX "ix_registros_suprimir_despues" ON "public"."registros" USING "btree" ("suprimir_despues_de");



CREATE INDEX "ix_registros_usuario_lower" ON "public"."registros" USING "btree" ("lower"("usuario_nombre_completo"));



CREATE INDEX "ix_solicitudes_registro" ON "public"."solicitudes" USING "btree" ("registro_id");



CREATE UNIQUE INDEX "uq_aviso_una_vigente" ON "public"."aviso_versiones" USING "btree" ("vigente") WHERE "vigente";



CREATE UNIQUE INDEX "uq_cat_colores_nombre_normalizado" ON "public"."cat_colores" USING "btree" ("lower"("nombre"));



CREATE UNIQUE INDEX "uq_cat_marcas_nombre_normalizado" ON "public"."cat_marcas" USING "btree" ("lower"("nombre"));



CREATE UNIQUE INDEX "uq_cat_modelos_marca_nombre_normalizado" ON "public"."cat_modelos" USING "btree" ("marca_id", "lower"("nombre"));



CREATE UNIQUE INDEX "uq_cortes_folio" ON "public"."cortes_caja" USING "btree" ("folio_corte");



CREATE UNIQUE INDEX "uq_pagos_folio_recibo" ON "public"."pagos" USING "btree" ("folio_recibo");



CREATE UNIQUE INDEX "uq_pagos_registro" ON "public"."pagos" USING "btree" ("registro_id");



CREATE UNIQUE INDEX "uq_registros_no_dispositivo_activo" ON "public"."registros" USING "btree" ("no_dispositivo") WHERE (("no_dispositivo" IS NOT NULL) AND ("estado" <> 'baja'::"text"));



CREATE UNIQUE INDEX "uq_registros_placas_vigentes" ON "public"."registros" USING "btree" ("upper"("placas")) WHERE (("placas" IS NOT NULL) AND ("estado" <> 'baja'::"text"));



CREATE UNIQUE INDEX "uq_registros_tag_apartado_no" ON "public"."registros" USING "btree" ("tag_apartado_no") WHERE "tag_apartado";



CREATE UNIQUE INDEX "uq_reglamento_una_vigente" ON "public"."reglamento_versiones" USING "btree" ("vigente") WHERE "vigente";



CREATE UNIQUE INDEX "uq_solicitudes_pendiente_por_tipo" ON "public"."solicitudes" USING "btree" ("registro_id", "tipo") WHERE (NOT "atendida");



CREATE OR REPLACE TRIGGER "pagos_avisar_chat_ti" AFTER INSERT ON "public"."pagos" FOR EACH ROW EXECUTE FUNCTION "public"."tg_pagos_avisar_chat_ti"();



CREATE OR REPLACE TRIGGER "tg_cortes_inmutables" BEFORE DELETE OR UPDATE ON "public"."cortes_caja" FOR EACH ROW EXECUTE FUNCTION "public"."cortes_caja_inmutable"();



CREATE OR REPLACE TRIGGER "tg_pagos_congelar_sellado" BEFORE UPDATE ON "public"."pagos" FOR EACH ROW EXECUTE FUNCTION "public"."pagos_congelar_sellado"();



CREATE OR REPLACE TRIGGER "tg_pagos_no_borrar_sellado" BEFORE DELETE ON "public"."pagos" FOR EACH ROW EXECUTE FUNCTION "public"."pagos_bloquear_borrado_sellado"();



CREATE OR REPLACE TRIGGER "tg_pagos_no_truncar_sellado" BEFORE TRUNCATE ON "public"."pagos" FOR EACH STATEMENT EXECUTE FUNCTION "public"."pagos_bloquear_truncate_sellado"();



ALTER TABLE ONLY "public"."aceptaciones"
    ADD CONSTRAINT "aceptaciones_aviso_version_id_fkey" FOREIGN KEY ("aviso_version_id") REFERENCES "public"."aviso_versiones"("id");



ALTER TABLE ONLY "public"."aceptaciones"
    ADD CONSTRAINT "aceptaciones_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "public"."registros"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."aceptaciones"
    ADD CONSTRAINT "aceptaciones_reglamento_version_id_fkey" FOREIGN KEY ("reglamento_version_id") REFERENCES "public"."reglamento_versiones"("id");



ALTER TABLE ONLY "public"."cat_modelos"
    ADD CONSTRAINT "cat_modelos_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "public"."cat_marcas"("id");



ALTER TABLE ONLY "public"."inventario_tags"
    ADD CONSTRAINT "inventario_tags_asignado_a_fkey" FOREIGN KEY ("asignado_a") REFERENCES "public"."registros"("id");



ALTER TABLE ONLY "public"."movimientos"
    ADD CONSTRAINT "movimientos_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "public"."registros"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pagos"
    ADD CONSTRAINT "pagos_corte_fk" FOREIGN KEY ("corte_id") REFERENCES "public"."cortes_caja"("id") DEFERRABLE INITIALLY DEFERRED;



ALTER TABLE ONLY "public"."pagos"
    ADD CONSTRAINT "pagos_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "public"."registros"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."registro_estacionamientos"
    ADD CONSTRAINT "registro_estacionamientos_estacionamiento_clave_fkey" FOREIGN KEY ("estacionamiento_clave") REFERENCES "public"."estacionamientos"("clave") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."registro_estacionamientos"
    ADD CONSTRAINT "registro_estacionamientos_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "public"."registros"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."solicitudes"
    ADD CONSTRAINT "solicitudes_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "public"."registros"("id") ON DELETE CASCADE;



ALTER TABLE "public"."aceptaciones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "aceptaciones_lectura_panel" ON "public"."aceptaciones" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['ti'::"text", 'contador'::"text", 'super'::"text"]))));



CREATE POLICY "aviso_admin" ON "public"."aviso_versiones" TO "authenticated" USING (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['admin'::"text", 'super'::"text"])))) WITH CHECK (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['admin'::"text", 'super'::"text"]))));



CREATE POLICY "aviso_lectura_vigente_anon" ON "public"."aviso_versiones" FOR SELECT TO "anon" USING (("vigente" = true));



CREATE POLICY "aviso_lectura_vigente_auth" ON "public"."aviso_versiones" FOR SELECT TO "authenticated" USING (("vigente" = true));



ALTER TABLE "public"."aviso_versiones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cat_colores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cat_marcas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cat_modelos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "colores_admin" ON "public"."cat_colores" TO "authenticated" USING (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['admin'::"text", 'super'::"text"])))) WITH CHECK (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['admin'::"text", 'super'::"text"]))));



CREATE POLICY "colores_lectura_publica" ON "public"."cat_colores" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."cortes_caja" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cortes_lectura_admin" ON "public"."cortes_caja" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['admin'::"text", 'contador'::"text", 'super'::"text"]))));



CREATE POLICY "est_admin" ON "public"."estacionamientos" TO "authenticated" USING (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['admin'::"text", 'super'::"text"])))) WITH CHECK (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['admin'::"text", 'super'::"text"]))));



CREATE POLICY "est_lectura_publica" ON "public"."estacionamientos" FOR SELECT TO "authenticated", "anon" USING ("activo");



ALTER TABLE "public"."estacionamientos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."intentos_publicos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventario_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventario_tags_lectura_panel" ON "public"."inventario_tags" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['ti'::"text", 'super'::"text"]))));



CREATE POLICY "marcas_admin" ON "public"."cat_marcas" TO "authenticated" USING (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['admin'::"text", 'super'::"text"])))) WITH CHECK (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['admin'::"text", 'super'::"text"]))));



CREATE POLICY "marcas_lectura_publica" ON "public"."cat_marcas" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "modelos_admin" ON "public"."cat_modelos" TO "authenticated" USING (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['admin'::"text", 'super'::"text"])))) WITH CHECK (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['admin'::"text", 'super'::"text"]))));



CREATE POLICY "modelos_lectura_publica" ON "public"."cat_modelos" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."movimientos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "movimientos_lectura_panel" ON "public"."movimientos" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['admin'::"text", 'ti'::"text", 'consulta'::"text", 'contador'::"text", 'super'::"text"]))));



ALTER TABLE "public"."pagos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pagos_lectura_panel" ON "public"."pagos" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['admin'::"text", 'ti'::"text", 'consulta'::"text", 'contador'::"text", 'super'::"text"]))));



ALTER TABLE "public"."parametros" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "regest_lectura_panel" ON "public"."registro_estacionamientos" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['admin'::"text", 'ti'::"text", 'consulta'::"text", 'contador'::"text", 'super'::"text"]))));



ALTER TABLE "public"."registro_estacionamientos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."registros" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "registros_lectura_panel" ON "public"."registros" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['admin'::"text", 'ti'::"text", 'consulta'::"text", 'contador'::"text", 'super'::"text"]))));



CREATE POLICY "reglamento_admin" ON "public"."reglamento_versiones" TO "authenticated" USING (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['admin'::"text", 'super'::"text"])))) WITH CHECK (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['admin'::"text", 'super'::"text"]))));



CREATE POLICY "reglamento_lectura_vigente_anon" ON "public"."reglamento_versiones" FOR SELECT TO "anon" USING (("vigente" = true));



CREATE POLICY "reglamento_lectura_vigente_auth" ON "public"."reglamento_versiones" FOR SELECT TO "authenticated" USING (("vigente" = true));



ALTER TABLE "public"."reglamento_versiones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."solicitudes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "solicitudes_lectura_panel" ON "public"."solicitudes" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['admin'::"text", 'ti'::"text", 'consulta'::"text", 'contador'::"text", 'super'::"text"]))));



ALTER TABLE "public"."zk_tarjetas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zk_tarjetas_lectura_panel" ON "public"."zk_tarjetas" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text") AND ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['ti'::"text", 'super'::"text"]))));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."actualizar_registro"("p_registro_id" "uuid", "p_no_dispositivo" "text", "p_placas" "text", "p_sin_placas" boolean, "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_motivo" "text", "p_hecho_por" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."actualizar_registro"("p_registro_id" "uuid", "p_no_dispositivo" "text", "p_placas" "text", "p_sin_placas" boolean, "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_motivo" "text", "p_hecho_por" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_registro"("p_registro_id" "uuid", "p_no_dispositivo" "text", "p_placas" "text", "p_sin_placas" boolean, "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_motivo" "text", "p_hecho_por" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."actualizar_registro_con_estacionamiento"("p_registro_id" "uuid", "p_claves" "text"[], "p_no_dispositivo" "text", "p_placas" "text", "p_sin_placas" boolean, "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_motivo" "text", "p_hecho_por" "text", "p_procedencia_tag" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."actualizar_registro_con_estacionamiento"("p_registro_id" "uuid", "p_claves" "text"[], "p_no_dispositivo" "text", "p_placas" "text", "p_sin_placas" boolean, "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_motivo" "text", "p_hecho_por" "text", "p_procedencia_tag" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_registro_con_estacionamiento"("p_registro_id" "uuid", "p_claves" "text"[], "p_no_dispositivo" "text", "p_placas" "text", "p_sin_placas" boolean, "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_motivo" "text", "p_hecho_por" "text", "p_procedencia_tag" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_registro_con_estacionamiento"("p_registro_id" "uuid", "p_claves" "text"[], "p_no_dispositivo" "text", "p_placas" "text", "p_sin_placas" boolean, "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_motivo" "text", "p_hecho_por" "text", "p_procedencia_tag" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."alta_inventario_tags"("p_numeros" "text"[], "p_hecho_por" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."alta_inventario_tags"("p_numeros" "text"[], "p_hecho_por" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."alta_inventario_tags"("p_numeros" "text"[], "p_hecho_por" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."alta_inventario_tags"("p_numeros" "text"[], "p_hecho_por" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."asignar_estacionamiento"("p_registro_id" "uuid", "p_claves" "text"[], "p_hecho_por" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."asignar_estacionamiento"("p_registro_id" "uuid", "p_claves" "text"[], "p_hecho_por" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."asignar_estacionamiento"("p_registro_id" "uuid", "p_claves" "text"[], "p_hecho_por" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."avisar_chat_ti"("p_texto" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."avisar_chat_ti"("p_texto" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."capturar_expediente_ti"("p_usuario_nombres" "text", "p_usuario_apellido_paterno" "text", "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_usuario_apellido_materno" "text", "p_tipo_usuario" "text", "p_placas" "text", "p_sin_placas" boolean, "p_claves" "text"[], "p_no_dispositivo" "text", "p_gestionante_nombres" "text", "p_gestionante_apellido_paterno" "text", "p_gestionante_apellido_materno" "text", "p_gestionante_relacion" "text", "p_fecha_hoja" "date", "p_observaciones" "text", "p_hecho_por" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."capturar_expediente_ti"("p_usuario_nombres" "text", "p_usuario_apellido_paterno" "text", "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_usuario_apellido_materno" "text", "p_tipo_usuario" "text", "p_placas" "text", "p_sin_placas" boolean, "p_claves" "text"[], "p_no_dispositivo" "text", "p_gestionante_nombres" "text", "p_gestionante_apellido_paterno" "text", "p_gestionante_apellido_materno" "text", "p_gestionante_relacion" "text", "p_fecha_hoja" "date", "p_observaciones" "text", "p_hecho_por" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."capturar_expediente_ti"("p_usuario_nombres" "text", "p_usuario_apellido_paterno" "text", "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_usuario_apellido_materno" "text", "p_tipo_usuario" "text", "p_placas" "text", "p_sin_placas" boolean, "p_claves" "text"[], "p_no_dispositivo" "text", "p_gestionante_nombres" "text", "p_gestionante_apellido_paterno" "text", "p_gestionante_apellido_materno" "text", "p_gestionante_relacion" "text", "p_fecha_hoja" "date", "p_observaciones" "text", "p_hecho_por" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."capturar_expediente_ti"("p_usuario_nombres" "text", "p_usuario_apellido_paterno" "text", "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_usuario_apellido_materno" "text", "p_tipo_usuario" "text", "p_placas" "text", "p_sin_placas" boolean, "p_claves" "text"[], "p_no_dispositivo" "text", "p_gestionante_nombres" "text", "p_gestionante_apellido_paterno" "text", "p_gestionante_apellido_materno" "text", "p_gestionante_relacion" "text", "p_fecha_hoja" "date", "p_observaciones" "text", "p_hecho_por" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cargar_mapa_zk"("p_filas" "jsonb", "p_hecho_por" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cargar_mapa_zk"("p_filas" "jsonb", "p_hecho_por" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cargar_mapa_zk"("p_filas" "jsonb", "p_hecho_por" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cargar_mapa_zk"("p_filas" "jsonb", "p_hecho_por" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cortar_caja"("p_efectivo_contado" numeric, "p_cortado_por" "text", "p_observaciones" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cortar_caja"("p_efectivo_contado" numeric, "p_cortado_por" "text", "p_observaciones" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cortar_caja"("p_efectivo_contado" numeric, "p_cortado_por" "text", "p_observaciones" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cortar_caja"("p_efectivo_contado" numeric, "p_cortado_por" "text", "p_observaciones" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cortes_caja_inmutable"() TO "anon";
GRANT ALL ON FUNCTION "public"."cortes_caja_inmutable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cortes_caja_inmutable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."crear_nota_solicitud"("p_solicitante_nombre" "text", "p_solicitante_rol" "text", "p_tramite_solicitado" "text", "p_alumno_nombre" "text", "p_alumno_grado" "text", "p_detalle" "text", "p_vehiculo_desc" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crear_nota_solicitud"("p_solicitante_nombre" "text", "p_solicitante_rol" "text", "p_tramite_solicitado" "text", "p_alumno_nombre" "text", "p_alumno_grado" "text", "p_detalle" "text", "p_vehiculo_desc" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."crear_nota_solicitud"("p_solicitante_nombre" "text", "p_solicitante_rol" "text", "p_tramite_solicitado" "text", "p_alumno_nombre" "text", "p_alumno_grado" "text", "p_detalle" "text", "p_vehiculo_desc" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_nota_solicitud"("p_solicitante_nombre" "text", "p_solicitante_rol" "text", "p_tramite_solicitado" "text", "p_alumno_nombre" "text", "p_alumno_grado" "text", "p_detalle" "text", "p_vehiculo_desc" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."crear_registro"("p_usuario_nombres" "text", "p_usuario_apellido_paterno" "text", "p_tipo_usuario" "text", "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_placas" "text", "p_sin_placas" boolean, "p_firma_url" "text", "p_usuario_apellido_materno" "text", "p_firmante_nombre" "text", "p_gestionante_nombres" "text", "p_gestionante_apellido_paterno" "text", "p_gestionante_apellido_materno" "text", "p_gestionante_relacion" "text", "p_usuario_es_menor" boolean, "p_firmante_rol" "text", "p_firma_trazos" "jsonb", "p_firma_imagen_sha256" "text", "p_ip_origen" "inet", "p_user_agent" "text", "p_metadata" "jsonb", "p_procedencia_tag" "text", "p_observaciones" "text", "p_reglamento_version_id" "uuid", "p_aviso_version_id" "uuid", "p_apellidos_familia" "text", "p_parentesco_otro" "text", "p_seccion_maestro" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crear_registro"("p_usuario_nombres" "text", "p_usuario_apellido_paterno" "text", "p_tipo_usuario" "text", "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_placas" "text", "p_sin_placas" boolean, "p_firma_url" "text", "p_usuario_apellido_materno" "text", "p_firmante_nombre" "text", "p_gestionante_nombres" "text", "p_gestionante_apellido_paterno" "text", "p_gestionante_apellido_materno" "text", "p_gestionante_relacion" "text", "p_usuario_es_menor" boolean, "p_firmante_rol" "text", "p_firma_trazos" "jsonb", "p_firma_imagen_sha256" "text", "p_ip_origen" "inet", "p_user_agent" "text", "p_metadata" "jsonb", "p_procedencia_tag" "text", "p_observaciones" "text", "p_reglamento_version_id" "uuid", "p_aviso_version_id" "uuid", "p_apellidos_familia" "text", "p_parentesco_otro" "text", "p_seccion_maestro" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."crear_registro"("p_usuario_nombres" "text", "p_usuario_apellido_paterno" "text", "p_tipo_usuario" "text", "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_placas" "text", "p_sin_placas" boolean, "p_firma_url" "text", "p_usuario_apellido_materno" "text", "p_firmante_nombre" "text", "p_gestionante_nombres" "text", "p_gestionante_apellido_paterno" "text", "p_gestionante_apellido_materno" "text", "p_gestionante_relacion" "text", "p_usuario_es_menor" boolean, "p_firmante_rol" "text", "p_firma_trazos" "jsonb", "p_firma_imagen_sha256" "text", "p_ip_origen" "inet", "p_user_agent" "text", "p_metadata" "jsonb", "p_procedencia_tag" "text", "p_observaciones" "text", "p_reglamento_version_id" "uuid", "p_aviso_version_id" "uuid", "p_apellidos_familia" "text", "p_parentesco_otro" "text", "p_seccion_maestro" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_registro"("p_usuario_nombres" "text", "p_usuario_apellido_paterno" "text", "p_tipo_usuario" "text", "p_marca" "text", "p_modelo" "text", "p_color" "text", "p_placas" "text", "p_sin_placas" boolean, "p_firma_url" "text", "p_usuario_apellido_materno" "text", "p_firmante_nombre" "text", "p_gestionante_nombres" "text", "p_gestionante_apellido_paterno" "text", "p_gestionante_apellido_materno" "text", "p_gestionante_relacion" "text", "p_usuario_es_menor" boolean, "p_firmante_rol" "text", "p_firma_trazos" "jsonb", "p_firma_imagen_sha256" "text", "p_ip_origen" "inet", "p_user_agent" "text", "p_metadata" "jsonb", "p_procedencia_tag" "text", "p_observaciones" "text", "p_reglamento_version_id" "uuid", "p_aviso_version_id" "uuid", "p_apellidos_familia" "text", "p_parentesco_otro" "text", "p_seccion_maestro" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."crear_solicitud"("p_folio" "text", "p_placas_o_tag" "text", "p_tipo" "text", "p_detalle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crear_solicitud"("p_folio" "text", "p_placas_o_tag" "text", "p_tipo" "text", "p_detalle" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."crear_solicitud"("p_folio" "text", "p_placas_o_tag" "text", "p_tipo" "text", "p_detalle" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_solicitud"("p_folio" "text", "p_placas_o_tag" "text", "p_tipo" "text", "p_detalle" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."dar_baja"("p_registro_id" "uuid", "p_motivo" "text", "p_hecho_por" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dar_baja"("p_registro_id" "uuid", "p_motivo" "text", "p_hecho_por" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dar_baja"("p_registro_id" "uuid", "p_motivo" "text", "p_hecho_por" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dar_baja"("p_registro_id" "uuid", "p_motivo" "text", "p_hecho_por" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."descartar_solicitud"("p_solicitud_id" "uuid", "p_motivo" "text", "p_hecho_por" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."descartar_solicitud"("p_solicitud_id" "uuid", "p_motivo" "text", "p_hecho_por" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."descartar_solicitud"("p_solicitud_id" "uuid", "p_motivo" "text", "p_hecho_por" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."descartar_solicitud"("p_solicitud_id" "uuid", "p_motivo" "text", "p_hecho_por" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."estado_caja"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."estado_caja"() TO "anon";
GRANT ALL ON FUNCTION "public"."estado_caja"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."estado_caja"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_anotar_intento"("p_ip" "inet", "p_funcion" "text", "p_exito" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_anotar_intento"("p_ip" "inet", "p_funcion" "text", "p_exito" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_anotar_intento"("p_ip" "inet", "p_funcion" "text", "p_exito" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_anotar_intento"("p_ip" "inet", "p_funcion" "text", "p_exito" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_intentos_recientes"("p_ip" "inet", "p_funcion" "text", "p_ventana" interval, "p_solo_fallos" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_intentos_recientes"("p_ip" "inet", "p_funcion" "text", "p_ventana" interval, "p_solo_fallos" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_intentos_recientes"("p_ip" "inet", "p_funcion" "text", "p_ventana" interval, "p_solo_fallos" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_intentos_recientes"("p_ip" "inet", "p_funcion" "text", "p_ventana" interval, "p_solo_fallos" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_ip_peticion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_ip_peticion"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_ip_peticion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_ip_peticion"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."instalar_tag"("p_registro_id" "uuid", "p_no_dispositivo" "text", "p_instalado_por" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."instalar_tag"("p_registro_id" "uuid", "p_no_dispositivo" "text", "p_instalado_por" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."instalar_tag"("p_registro_id" "uuid", "p_no_dispositivo" "text", "p_instalado_por" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."instalar_tag_con_estacionamiento"("p_registro_id" "uuid", "p_no_dispositivo" "text", "p_claves" "text"[], "p_instalado_por" "text", "p_tag_apartado_no" "text", "p_procedencia_tag" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."instalar_tag_con_estacionamiento"("p_registro_id" "uuid", "p_no_dispositivo" "text", "p_claves" "text"[], "p_instalado_por" "text", "p_tag_apartado_no" "text", "p_procedencia_tag" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."instalar_tag_con_estacionamiento"("p_registro_id" "uuid", "p_no_dispositivo" "text", "p_claves" "text"[], "p_instalado_por" "text", "p_tag_apartado_no" "text", "p_procedencia_tag" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."instalar_tag_con_estacionamiento"("p_registro_id" "uuid", "p_no_dispositivo" "text", "p_claves" "text"[], "p_instalado_por" "text", "p_tag_apartado_no" "text", "p_procedencia_tag" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."inv_reclamar_tag"("p_no_dispositivo" "text", "p_registro_id" "uuid", "p_quien" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inv_reclamar_tag"("p_no_dispositivo" "text", "p_registro_id" "uuid", "p_quien" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."inv_reclamar_tag"("p_no_dispositivo" "text", "p_registro_id" "uuid", "p_quien" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inv_reclamar_tag"("p_no_dispositivo" "text", "p_registro_id" "uuid", "p_quien" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pagos_bloquear_borrado_sellado"() TO "anon";
GRANT ALL ON FUNCTION "public"."pagos_bloquear_borrado_sellado"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pagos_bloquear_borrado_sellado"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pagos_bloquear_truncate_sellado"() TO "anon";
GRANT ALL ON FUNCTION "public"."pagos_bloquear_truncate_sellado"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pagos_bloquear_truncate_sellado"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pagos_congelar_sellado"() TO "anon";
GRANT ALL ON FUNCTION "public"."pagos_congelar_sellado"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pagos_congelar_sellado"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."panel_exigir_rol"("p_roles" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."panel_exigir_rol"("p_roles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."panel_exigir_rol"("p_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."panel_exigir_rol"("p_roles" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."recordar_chat_ti"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recordar_chat_ti"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."registrar_pago"("p_registro_id" "uuid", "p_monto" numeric, "p_cobrado_por" "text", "p_tipo_usuario" "text", "p_parentesco_otro" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registrar_pago"("p_registro_id" "uuid", "p_monto" numeric, "p_cobrado_por" "text", "p_tipo_usuario" "text", "p_parentesco_otro" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."registrar_pago"("p_registro_id" "uuid", "p_monto" numeric, "p_cobrado_por" "text", "p_tipo_usuario" "text", "p_parentesco_otro" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."registrar_pago"("p_registro_id" "uuid", "p_monto" numeric, "p_cobrado_por" "text", "p_tipo_usuario" "text", "p_parentesco_otro" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."retirar_tag_inventario"("p_no_dispositivo" "text", "p_hecho_por" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."retirar_tag_inventario"("p_no_dispositivo" "text", "p_hecho_por" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."retirar_tag_inventario"("p_no_dispositivo" "text", "p_hecho_por" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."retirar_tag_inventario"("p_no_dispositivo" "text", "p_hecho_por" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."tg_pagos_avisar_chat_ti"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tg_pagos_avisar_chat_ti"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."usar_tag_apartado"("p_registro_id" "uuid", "p_hecho_por" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."usar_tag_apartado"("p_registro_id" "uuid", "p_hecho_por" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."usar_tag_apartado"("p_registro_id" "uuid", "p_hecho_por" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."usar_tag_apartado"("p_registro_id" "uuid", "p_hecho_por" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."vincular_nota"("p_solicitud_id" "uuid", "p_registro_id" "uuid", "p_tramite" "text", "p_hecho_por" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."vincular_nota"("p_solicitud_id" "uuid", "p_registro_id" "uuid", "p_tramite" "text", "p_hecho_por" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."vincular_nota"("p_solicitud_id" "uuid", "p_registro_id" "uuid", "p_tramite" "text", "p_hecho_por" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vincular_nota"("p_solicitud_id" "uuid", "p_registro_id" "uuid", "p_tramite" "text", "p_hecho_por" "text") TO "service_role";



GRANT ALL ON TABLE "public"."aceptaciones" TO "anon";
GRANT ALL ON TABLE "public"."aceptaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."aceptaciones" TO "service_role";



GRANT ALL ON TABLE "public"."aviso_versiones" TO "anon";
GRANT ALL ON TABLE "public"."aviso_versiones" TO "authenticated";
GRANT ALL ON TABLE "public"."aviso_versiones" TO "service_role";



GRANT ALL ON TABLE "public"."cat_colores" TO "anon";
GRANT ALL ON TABLE "public"."cat_colores" TO "authenticated";
GRANT ALL ON TABLE "public"."cat_colores" TO "service_role";



GRANT ALL ON TABLE "public"."cat_marcas" TO "anon";
GRANT ALL ON TABLE "public"."cat_marcas" TO "authenticated";
GRANT ALL ON TABLE "public"."cat_marcas" TO "service_role";



GRANT ALL ON TABLE "public"."cat_modelos" TO "anon";
GRANT ALL ON TABLE "public"."cat_modelos" TO "authenticated";
GRANT ALL ON TABLE "public"."cat_modelos" TO "service_role";



GRANT ALL ON TABLE "public"."cortes_caja" TO "anon";
GRANT ALL ON TABLE "public"."cortes_caja" TO "authenticated";
GRANT ALL ON TABLE "public"."cortes_caja" TO "service_role";



GRANT ALL ON SEQUENCE "public"."cortes_caja_folio_seq" TO "service_role";



GRANT ALL ON TABLE "public"."estacionamientos" TO "anon";
GRANT ALL ON TABLE "public"."estacionamientos" TO "authenticated";
GRANT ALL ON TABLE "public"."estacionamientos" TO "service_role";



GRANT ALL ON TABLE "public"."intentos_publicos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."intentos_publicos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."intentos_publicos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."intentos_publicos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."inventario_tags" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."inventario_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."inventario_tags" TO "service_role";



GRANT ALL ON TABLE "public"."movimientos" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."movimientos" TO "authenticated";
GRANT ALL ON TABLE "public"."movimientos" TO "service_role";



GRANT ALL ON TABLE "public"."pagos" TO "anon";
GRANT ALL ON TABLE "public"."pagos" TO "authenticated";
GRANT ALL ON TABLE "public"."pagos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pagos_folio_recibo_seq" TO "service_role";



GRANT ALL ON TABLE "public"."parametros" TO "service_role";



GRANT ALL ON TABLE "public"."registro_estacionamientos" TO "anon";
GRANT ALL ON TABLE "public"."registro_estacionamientos" TO "authenticated";
GRANT ALL ON TABLE "public"."registro_estacionamientos" TO "service_role";



GRANT ALL ON TABLE "public"."registros" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."registros" TO "authenticated";
GRANT ALL ON TABLE "public"."registros" TO "service_role";



GRANT ALL ON SEQUENCE "public"."registros_folio_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."registros_folio_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."registros_folio_seq" TO "service_role";



GRANT ALL ON TABLE "public"."reglamento_versiones" TO "anon";
GRANT ALL ON TABLE "public"."reglamento_versiones" TO "authenticated";
GRANT ALL ON TABLE "public"."reglamento_versiones" TO "service_role";



GRANT ALL ON TABLE "public"."solicitudes" TO "anon";
GRANT ALL ON TABLE "public"."solicitudes" TO "authenticated";
GRANT ALL ON TABLE "public"."solicitudes" TO "service_role";



GRANT ALL ON TABLE "public"."v_evidencia_firma" TO "authenticated";
GRANT ALL ON TABLE "public"."v_evidencia_firma" TO "service_role";



GRANT ALL ON TABLE "public"."v_registros_incompletos" TO "authenticated";
GRANT ALL ON TABLE "public"."v_registros_incompletos" TO "service_role";



GRANT ALL ON TABLE "public"."zk_tarjetas" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."zk_tarjetas" TO "authenticated";
GRANT ALL ON TABLE "public"."zk_tarjetas" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







