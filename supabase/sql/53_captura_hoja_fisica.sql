-- =====================================================================
-- 53_captura_hoja_fisica.sql
-- SC-026: captura en sitio desde la hoja fisica, con TAG reservado.
--
-- Motivo (piloto 8-sep-2026): las instalaciones que ya se hicieron con el
-- proceso de papel traen una hoja firmada. Para regularizarlas —y para el dia
-- de instalacion en el estacionamiento— TI necesita capturar el expediente
-- desde el celular o la laptop en el orden de la hoja (titular -> vehiculo
-- -> color -> placas), eligiendo el TAG del inventario con un toque. El TAG
-- queda RESERVADO para ese expediente (inventario_tags.asignado_a) y se
-- instala despues del cobro, ya sin teclearlo.
--
-- QUE cambia:
--   - RPC NUEVO capturar_expediente_ti (rol ti): crea el expediente en
--     'pendiente' con movimiento 'alta' atribuido a TI, asigna estacionamientos
--     y, si se indica, reserva un TAG DISPONIBLE del inventario. No registra
--     pago (eso es de Administracion) ni aceptacion digital: la firma vive en
--     la hoja fisica, y el expediente lo dice en observaciones.
--   - instalar_tag_con_estacionamiento se recrea con la MISMA firma (cuerpo
--     vigente del bloque 52) sumando la liberacion de reservas de este
--     expediente que no correspondan al TAG instalado ni al apartado: si TI
--     instala un numero distinto al reservado, el reservado vuelve a estar
--     disponible en vez de quedar "asignado" a un expediente que no lo usa.
-- QUE NO cambia: crear_registro (alta publica), pagos, RLS.
--
-- Orden de despliegue: aplicar ANTES de publicar el cliente con la pantalla
-- "Capturar hoja fisica".
--
-- Depende de: 12, 19/49 (crear_registro como referencia de validaciones),
-- 25, 29, 31, 52.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) capturar_expediente_ti (rol ti)
-- ---------------------------------------------------------------------
create or replace function capturar_expediente_ti(
    p_usuario_nombres              text,
    p_usuario_apellido_paterno     text,
    p_marca                        text,
    p_modelo                       text,
    p_color                        text,
    p_usuario_apellido_materno     text default null,
    p_tipo_usuario                 text default 'padres',
    p_placas                       text default null,
    p_sin_placas                   boolean default false,
    p_claves                       text[] default null,
    p_no_dispositivo               text default null,
    p_gestionante_nombres          text default null,
    p_gestionante_apellido_paterno text default null,
    p_gestionante_apellido_materno text default null,
    p_gestionante_relacion         text default null,
    p_fecha_hoja                   date default null,
    p_observaciones                text default null,
    p_hecho_por                    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    if p_tipo_usuario not in ('maestro', 'padres', 'alumno', 'admin') then
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
$$;

revoke all on function capturar_expediente_ti(
    text, text, text, text, text, text, text, text, boolean, text[], text,
    text, text, text, text, date, text, text
) from public;
grant execute on function capturar_expediente_ti(
    text, text, text, text, text, text, text, text, boolean, text[], text,
    text, text, text, text, date, text, text
) to authenticated;

-- ---------------------------------------------------------------------
-- 2) instalar_tag_con_estacionamiento: MISMO cuerpo vigente (bloque 52) +
--    liberacion de las reservas de este expediente que no se usaron.
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
$$;

-- Hace visible el RPC nuevo (capturar_expediente_ti) de inmediato.
notify pgrst, 'reload schema';

-- Auditoria esperada:
-- - capturar_expediente_ti sin nombre/apellido/marca/modelo/color: rechazado.
-- - sin placas y sin marcar sin_placas: rechazado.
-- - con TAG que no esta en inventario, o ya reservado/en uso: rechazado.
-- - ok: registro 'pendiente' con folio nuevo, observaciones "Capturado por TI
--   desde la hoja fisica...", movimiento 'alta' con hecho_por = TI,
--   estacionamientos asignados y el TAG reservado (asignado_a = registro).
--   Sin pago (Administracion) y sin aceptacion digital (la firma esta en papel).
-- - instalar con el TAG reservado: la reserva se conserva como asignacion.
-- - instalar con OTRO numero: el reservado vuelve a disponible y el instalado
--   queda asignado (si estaba en inventario).
-- - anon / sin rol / sin MFA: rechazado por panel_exigir_rol.
