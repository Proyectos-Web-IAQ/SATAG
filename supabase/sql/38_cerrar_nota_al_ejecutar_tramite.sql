-- =====================================================================
-- 38_cerrar_nota_al_ejecutar_tramite.sql
-- SC-003: al ejecutar el tramite, la nota vinculada se cierra sola.
--
-- Antes, TI vinculaba la nota y la nota quedaba pendiente aun despues de aplicar
-- el tramite: la tarjeta seguia mostrando algo que hacer. Ahora cada RPC de flujo
-- cierra la nota del buzon (tipo 'nota') cuyo tramite_solicitado COINCIDE con el
-- tramite que TI ejecuta:
--   - dar_baja                              -> cierra la nota que pidio 'baja'
--   - actualizar_registro_con_estacionamiento -> la que pidio 'actualizacion'
--   - instalar_tag_con_estacionamiento      -> la que pidio 'instalacion'
--
-- Se cierra por COINCIDENCIA, no cualquier nota: si TI corrobora y aplica OTRO
-- tramite (el pedido no procedia), la nota NO se cierra sola; TI la cierra a mano
-- (boton "Cerrar esta nota"). Asi un tramite no relacionado no borra en silencio
-- una peticion distinta.
--
-- Solo cambian los CUERPOS (no las firmas): create or replace reemplaza en sitio,
-- sin drop ni trampa PostgREST. Se reproducen las definiciones vigentes:
--   - dar_baja: bloque 29.
--   - instalar_tag_con_estacionamiento / actualizar_registro_con_estacionamiento:
--     bloque 33 (ultima version, con apartado + procedencia).
--
-- Depende de: 29_rpc_panel.sql, 31, 33, 34, 35, 37.
-- =====================================================================

-- ---------------------------------------------------------------------
-- dar_baja: cierra la solicitud de baja Y la nota que pidio baja.
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
        raise exception 'Indica el motivo de la baja';
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

revoke all on function dar_baja(uuid, text, text) from public;
grant execute on function dar_baja(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- instalar_tag_con_estacionamiento: al terminar la instalacion cierra la nota
-- que pidio instalar. (Reproduce el bloque 33; solo se agrega el cierre.)
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
        raise exception 'Elige al menos un estacionamiento antes de instalar el TAG';
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

revoke all on function instalar_tag_con_estacionamiento(uuid, text, text[], text, text, text) from public;
grant execute on function instalar_tag_con_estacionamiento(uuid, text, text[], text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- actualizar_registro_con_estacionamiento: cierra la solicitud de actualizacion
-- Y la nota que pidio actualizar. (Reproduce el bloque 33; solo cambia el WHERE
-- del cierre de solicitudes.)
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
    v_quien text;
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

-- Las firmas no cambian (solo el cuerpo), asi que PostgREST no necesita recargar.

-- Auditoria esperada:
-- - nota que pidio baja: al dar de baja el registro, queda atendida ('ejecutada').
-- - nota que pidio actualizar: al actualizar, queda atendida.
-- - nota que pidio instalar: al instalar el TAG, queda atendida.
-- - TI aplica un tramite DISTINTO al pedido: la nota sigue pendiente (se cierra a
--   mano con descartar_solicitud / "Cerrar esta nota").
-- - una solicitud de folio (actualizacion/baja) se cierra igual que antes.
