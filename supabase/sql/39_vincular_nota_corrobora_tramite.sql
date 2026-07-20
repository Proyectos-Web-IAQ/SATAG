-- =====================================================================
-- 39_vincular_nota_corrobora_tramite.sql
-- SC-003: al vincular, TI CORROBORA el tramite (Confirmar al vincular).
--
-- Antes, vincular_nota solo seteaba registro_id y el registro caia en la cola
-- del tramite que PIDIO el cliente, a ciegas. Ahora TI confirma en el momento
-- que el tramite pedido procede, o elige otro. Por eso vincular_nota gana un
-- parametro p_tramite (el tramite corroborado):
--   - Setea registro_id (empata la nota con el expediente).
--   - Si p_tramite difiere del tramite_solicitado que traia la nota, lo ACTUALIZA
--     a p_tramite. Esto es lo que hace que el registro caiga en la cola correcta
--     (pidePendiente mira tramite_solicitado) y que el auto-cierre del bloque 38
--     coincida al ejecutar (cierra la nota cuyo tramite = el ejecutado).
--   - Deja rastro en un movimiento; si TI cambio el tramite, lo dice.
--
-- Cambia la FIRMA (nuevo parametro): drop de la firma vieja (3 args) + notify
-- pgrst (trampa PostgREST). Reproduce vincular_nota del bloque 34 + p_tramite.
--
-- Depende de: 34_buzon_notas_sin_folio.sql, 37_nota_tramite_solicitado.sql.
-- =====================================================================

drop function if exists vincular_nota(uuid, uuid, text);

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

    if p_tramite not in ('instalacion','actualizacion','baja') then
        raise exception 'Indique el tramite a realizar: instalar, actualizar o dar de baja';
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
        raise exception 'Ese expediente ya tiene una nota pendiente; cierrala antes de vincular otra';
    end;

    -- Rastro: si TI corrigio el tramite pedido, se anota el cambio.
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

revoke all on function vincular_nota(uuid, uuid, text, text) from public;
grant execute on function vincular_nota(uuid, uuid, text, text) to authenticated;

-- Hace visible la firma nueva de inmediato para PostgREST/Supabase API.
notify pgrst, 'reload schema';

-- Auditoria esperada:
-- - vincular confirmando el tramite pedido: tramite_solicitado no cambia.
-- - vincular eligiendo otro tramite: tramite_solicitado pasa a ese; el registro
--   cae en la cola nueva y el auto-cierre (bloque 38) coincide al ejecutarlo.
-- - p_tramite fuera del catalogo: rechazado.
-- - la firma vieja de 3 args ya no existe (un cliente viejo recibe "function not found").
