-- =====================================================================
-- 40_usar_tag_apartado.sql
-- CC-01 (cierre): usar el TAG apartado.
--
-- Cuando la familia usa su PROPIO TAG, la escuela le reserva ("aparta") el TAG
-- que le tocaba (tag_apartado_no, sin instalar). Cuando el propio deja de servir
-- (se descompone, lo pierden, cambian de coche), TI activa el apartado:
--   - no_dispositivo    <- tag_apartado_no (el reservado entra en uso)
--   - procedencia_tag   <- 'escuela' (ahora usan el TAG de la escuela)
--   - tag_apartado      <- false / tag_apartado_no <- null (se consumio la reserva)
--   - movimiento 'reposicion' (el TAG propio anterior queda inactivo)
--
-- Ademas se cierra el caso borde: cambiar procedencia a 'escuela' por "Actualizar"
-- con un apartado vivo queda PROHIBIDO (decision del usuario): TI debe usar el
-- apartado o quitarlo explicito primero. Se valida dentro de
-- actualizar_registro_con_estacionamiento.
--
-- usar_tag_apartado es NUEVO (solo notify, sin drop). actualizar_registro_con_
-- estacionamiento se recrea con la MISMA firma (reproduce el bloque 38 + la
-- validacion) -> create or replace en sitio, sin trampa PostgREST.
--
-- Depende de: 12_registros.sql (columnas de apartado), 29, 31, 33, 38.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) usar_tag_apartado (rol ti): reposicion desde el TAG apartado.
-- ---------------------------------------------------------------------
create or replace function usar_tag_apartado(
    p_registro_id uuid,
    p_hecho_por   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

    -- El dispositivo fisico es unico: el apartado no debe estar activo en otro
    -- expediente. (El indice uq_registros_no_dispositivo_activo tambien lo topa.)
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

    -- Usar el apartado es la reinstalacion pedida: cierra las peticiones de
    -- actualizacion pendientes (solicitud de folio y nota del buzon que pidio
    -- actualizar), para que el registro salga de la cola.
    update solicitudes
       set atendida = true, atendida_en = now(), atendida_por = v_quien,
           resolucion = 'ejecutada'
     where registro_id = p_registro_id and not atendida
       and (tipo = 'actualizacion' or (tipo = 'nota' and tramite_solicitado = 'actualizacion'));

    return jsonb_build_object('id', p_registro_id);
end;
$$;

revoke all on function usar_tag_apartado(uuid, text) from public;
grant execute on function usar_tag_apartado(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2) actualizar_registro_con_estacionamiento: bloquea cambiar procedencia a
--    'escuela' si hay un TAG apartado vivo. Reproduce el bloque 38 y suma la
--    validacion (misma firma; se lee tambien tag_apartado).
-- ---------------------------------------------------------------------
create or replace function actualizar_registro_con_estacionamiento(
    p_registro_id     uuid,
    p_claves          text[] default null,
    p_no_dispositivo  text default null,
    p_placas          text default null,
    p_sin_placas      boolean default null,
    p_marca           text default null,
    p_modelo          text default null,
    p_color           text default null,
    p_motivo          text default null,
    p_hecho_por       text default null,
    p_procedencia_tag text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
        v_proc_nueva := null; -- no cambia nada
    end if;

    -- Caso borde (CC-01): no se cambia a 'escuela' con un apartado vivo. TI debe
    -- usar el TAG apartado (o quitar la reserva) primero.
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

    if v_proc_nueva is not null then
        update registros set procedencia_tag = v_proc_nueva where id = p_registro_id;
        insert into movimientos (registro_id, tipo, motivo, hecho_por)
        values (p_registro_id, 'cambio',
            'Procedencia TAG: ' || v_proc_actual || ' -> ' || v_proc_nueva
                || case when coalesce(btrim(coalesce(p_motivo, '')), '') <> ''
                        then ' - ' || btrim(p_motivo) else '' end,
            v_quien);
    end if;

    -- Cierra las peticiones de actualizacion pendientes: la solicitud de folio
    -- (tipo 'actualizacion') y la nota del buzon (SC-003) que pidio actualizar.
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

revoke all on function actualizar_registro_con_estacionamiento(
    uuid, text[], text, text, boolean, text, text, text, text, text, text
) from public;
grant execute on function actualizar_registro_con_estacionamiento(
    uuid, text[], text, text, boolean, text, text, text, text, text, text
) to authenticated;

-- Hace visible el RPC nuevo (usar_tag_apartado) de inmediato para PostgREST.
notify pgrst, 'reload schema';

-- Auditoria esperada:
-- - usar_tag_apartado sin apartado vivo: rechazado.
-- - usar_tag_apartado con el numero ya activo en otro registro: rechazado.
-- - usar_tag_apartado ok: no_dispositivo pasa al apartado, procedencia 'escuela',
--   apartado limpio, movimiento 'reposicion' con anterior/nuevo, y la solicitud
--   de actualizacion pendiente (la reinstalacion pedida) queda atendida.
-- - actualizar a procedencia 'escuela' con apartado vivo: rechazado con mensaje.
-- - actualizar sin tocar apartado: identico al bloque 38.
