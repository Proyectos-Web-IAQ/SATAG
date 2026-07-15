-- =====================================================================
-- 29_rpc_panel.sql
-- Acciones del panel (Administracion y TI) como RPCs transaccionales.
-- SECURITY DEFINER + verificacion interna de sesion: aal2 (MFA) y rol del
-- panel en app_metadata.rol. Las tablas no tienen policies de escritura
-- para authenticated: TODO write del panel pasa por aqui.
--
-- Reparto por rol (espejo de la UI):
--   admin: registrar_pago
--   ti:    asignar_estacionamiento, instalar_tag, actualizar_registro,
--          dar_baja, descartar_solicitud
--
-- SC-002 movio asignar_estacionamiento de admin a ti (ver nota en la propia
-- funcion). Admin se queda con el cobro; TI hace todo lo que ocurre con la
-- persona presente, siempre despues del pago.
--
-- Cada RPC agrupa registro + movimiento + solicitud atendida en UNA
-- transaccion (una funcion plpgsql corre atomicamente).
--
-- Depende de: registros, movimientos, pagos, registro_estacionamientos,
--             solicitudes, estacionamientos.
-- Devuelven: jsonb { id } (el panel refresca la lista despues de actuar).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Guardia comun: exige sesion aal2 y uno de los roles indicados.
-- Solo la llaman los RPCs de este bloque (revocada para todos los roles).
--
-- El rol 'super' pasa CUALQUIER guardia. Es un rol de soporte y pruebas, no
-- operativo: existe para que una sola cuenta pueda recorrer el flujo completo
-- (Admin cobra -> TI instala) sin cambiar de sesion. Los roles finos siguen
-- siendo estrictos; 'super' es la unica excepcion y es explicita.
--
-- Cuidado (1.8 Pruebas): un usuario 'super' NO sirve para probar que la RLS
-- separa roles. Esas pruebas necesitan cuentas con admin / ti / consulta, y
-- una sin rol. 'super' se asigna a mano, a poca gente, y siempre con MFA.
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
        raise exception 'Tu usuario no tiene el rol requerido (%)', array_to_string(p_roles, ' / ');
    end if;
end;
$$;

revoke all on function panel_exigir_rol(text[]) from public;

-- ---------------------------------------------------------------------
-- asignar_estacionamiento (rol ti): reemplaza la asignacion completa.
--
-- SC-002 (2026-07-15): la definicion del estacionamiento se movio de
-- Administracion a TI. Supersede el alcance de la tarea 1.5, que la ponia
-- en Admin. Razon: TI define el estacionamiento en el mismo momento en que
-- instala el TAG, con la persona presente, y eso encaja con la regla ya
-- cerrada de que TI trabaja despues del pago. Admin conserva registrar_pago.
-- ---------------------------------------------------------------------
create or replace function asignar_estacionamiento(
    p_registro_id uuid,
    p_claves      text[],
    p_hecho_por   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function asignar_estacionamiento(uuid, text[], text) from public;
grant execute on function asignar_estacionamiento(uuid, text[], text) to authenticated;

-- ---------------------------------------------------------------------
-- registrar_pago (rol admin): agrega un pago al historial y fija
-- fecha_adquisicion la primera vez.
-- ---------------------------------------------------------------------
create or replace function registrar_pago(
    p_registro_id  uuid,
    p_monto        numeric,
    p_cobrado_por  text default null,
    p_folio_recibo text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_estado text;
begin
    perform panel_exigir_rol(array['admin']);

    select estado into v_estado from registros where id = p_registro_id;
    if v_estado is null then
        raise exception 'Registro no encontrado';
    end if;
    if v_estado = 'baja' then
        raise exception 'El registro esta dado de baja';
    end if;
    if p_monto is null or p_monto <= 0 then
        raise exception 'El monto debe ser mayor a cero';
    end if;

    begin
        insert into pagos (registro_id, monto, cobrado_por, folio_recibo)
        values (
            p_registro_id,
            p_monto,
            nullif(btrim(coalesce(p_cobrado_por,'')), ''),
            nullif(btrim(coalesce(p_folio_recibo,'')), '')
        );
    exception when unique_violation then
        -- Choco uq_pagos_folio_recibo: doble clic o reintento tras error de red.
        raise exception 'Ya hay un pago registrado con el folio de recibo %', btrim(p_folio_recibo);
    end;

    update registros
       set fecha_adquisicion = coalesce(fecha_adquisicion, current_date)
     where id = p_registro_id;

    return jsonb_build_object('id', p_registro_id);
end;
$$;

revoke all on function registrar_pago(uuid, numeric, text, text) from public;
grant execute on function registrar_pago(uuid, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- instalar_tag (rol ti): captura el numero, activa el registro.
-- Regla de negocio: solo con pago previo (TI trabaja despues del pago).
--
-- Esta funcion es SOLO para la primera instalacion. Exige estado
-- 'pendiente' y sin TAG previo, por dos razones:
--  - Sin el candado de no_dispositivo, reinstalar sobre un registro activo
--    pisaba el TAG anterior sin dejar movimiento de reposicion (se perdia
--    la bitacora). Reponer un TAG es actualizar_registro.
--  - Sin el candado de estado, un registro 'bloqueado' pasaba a 'activo':
--    se desbloqueaba instalando un TAG, dejando bloqueado_en/bloqueo_motivo
--    sucios.
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
        raise exception 'El registro ya tiene el TAG % instalado: usa actualizar_registro para reponerlo', v_tag_actual;
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

revoke all on function instalar_tag(uuid, text, text) from public;
grant execute on function instalar_tag(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- actualizar_registro (rol ti): "editar la fila del Excel".
-- Cambio de numero de TAG = reposicion (movimiento con anterior/nuevo);
-- cambios de placas/vehiculo = movimiento 'cambio' con el detalle.
-- Marca como atendidas las solicitudes pendientes de actualizacion.
-- Parametros null = sin cambio.
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
            raise exception 'El registro no tiene TAG instalado: usa instalar_tag';
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
            raise exception 'Captura las placas o marca sin placas';
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

revoke all on function actualizar_registro(uuid, text, text, boolean, text, text, text, text, text) from public;
grant execute on function actualizar_registro(uuid, text, text, boolean, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- dar_baja (rol ti): baja del registro + movimiento + solicitud atendida.
-- El TAG queda inactivo (el indice unico parcial ignora estado 'baja').
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

    update solicitudes
       set atendida = true, atendida_en = now(), atendida_por = v_quien,
           resolucion = 'ejecutada'
     where registro_id = p_registro_id and tipo = 'baja' and not atendida;

    return jsonb_build_object('id', p_registro_id);
end;
$$;

revoke all on function dar_baja(uuid, text, text) from public;
grant execute on function dar_baja(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- descartar_solicitud (rol ti): cierra una solicitud SIN tocar el registro.
-- Es la valvula de escape de la cola de TI: sin ella, una solicitud
-- improcedente (ya aplicada, duplicada o spam) se queda pendiente para
-- siempre y el contador de la pantalla TI nunca baja.
-- El motivo es obligatorio: distingue "ya estaba aplicada" de "spam".
-- ---------------------------------------------------------------------
create or replace function descartar_solicitud(
    p_solicitud_id uuid,
    p_motivo       text,
    p_hecho_por    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_registro_id uuid;
    v_atendida boolean;
begin
    perform panel_exigir_rol(array['ti']);

    if coalesce(btrim(p_motivo), '') = '' then
        raise exception 'Indica por que se descarta la solicitud';
    end if;

    select registro_id, atendida into v_registro_id, v_atendida
      from solicitudes where id = p_solicitud_id;
    if v_registro_id is null then
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
    return jsonb_build_object('id', v_registro_id);
end;
$$;

revoke all on function descartar_solicitud(uuid, text, text) from public;
grant execute on function descartar_solicitud(uuid, text, text) to authenticated;

-- Auditoria esperada:
-- - anon no puede ejecutar ninguno (sin grant); authenticated puede llamar,
--   pero panel_exigir_rol corta sin aal2 o sin el rol correcto en
--   app_metadata (que solo fija un admin con service_role).
-- - Decision abierta: si algun dia Admin debe cubrir acciones de TI (o al
--   reves), ampliar el array de roles del RPC correspondiente.
