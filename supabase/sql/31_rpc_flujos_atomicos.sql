-- =====================================================================
-- 31_rpc_flujos_atomicos.sql
-- Corrige las acciones compuestas de TI que el cliente ejecutaba como dos
-- RPCs independientes. A partir de este bloque:
--
--   estacionamiento + instalar TAG
--   estacionamiento + actualizar registro + atender solicitud
--
-- ocurren dentro de UNA llamada y, por tanto, de UNA transaccion PostgreSQL.
-- Si cualquier validacion falla, no queda una asignacion parcial aplicada.
--
-- Depende de: 29_rpc_panel.sql.
-- Aplicar despues de haber ejecutado los bloques 24-30.
-- =====================================================================

-- ---------------------------------------------------------------------
-- instalar_tag_con_estacionamiento (rol ti)
--
-- El wrapper toma un lock del registro para serializar instalaciones
-- concurrentes, exige al menos un estacionamiento y reutiliza los RPCs del
-- bloque 29. Las funciones llamadas comparten la transaccion del wrapper:
-- si instalar_tag falla (TAG duplicado, estado incorrecto, etc.), tambien se
-- revierte asignar_estacionamiento y su movimiento de bitacora.
-- ---------------------------------------------------------------------
create or replace function instalar_tag_con_estacionamiento(
    p_registro_id    uuid,
    p_no_dispositivo text,
    p_claves         text[],
    p_instalado_por  text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    perform panel_exigir_rol(array['ti']);

    -- Serializa dos instalaciones simultaneas sobre el mismo expediente.
    perform 1 from registros where id = p_registro_id for update;
    if not found then
        raise exception 'Registro no encontrado';
    end if;

    -- La instalacion siempre debe dejar acceso a por lo menos un
    -- estacionamiento. asignar_estacionamiento permite vacio porque tambien
    -- se usa para correcciones; aqui la regla es mas estricta.
    if not exists (
        select 1
          from unnest(coalesce(array_remove(p_claves, null), '{}'::text[])) as c(clave)
         where btrim(clave) <> ''
    ) then
        raise exception 'Elige al menos un estacionamiento antes de instalar el TAG';
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

    return jsonb_build_object('id', p_registro_id);
end;
$$;

revoke all on function instalar_tag_con_estacionamiento(uuid, text, text[], text) from public;
grant execute on function instalar_tag_con_estacionamiento(uuid, text, text[], text) to authenticated;

-- ---------------------------------------------------------------------
-- actualizar_registro_con_estacionamiento (rol ti)
--
-- p_claves NULL  = el estacionamiento no cambio.
-- p_claves ARRAY = reemplazar la asignacion completa (ARRAY[] la elimina).
--
-- Cuando el unico cambio es el estacionamiento, actualizar_registro no puede
-- llamarse porque correctamente responderia "No hay cambios que guardar".
-- El wrapper atiende igualmente las solicitudes de actualizacion como
-- "ejecutadas", evitando que la cola y el indice anti-duplicados se queden
-- atorados despues de aplicar el cambio solicitado.
-- ---------------------------------------------------------------------
create or replace function actualizar_registro_con_estacionamiento(
    p_registro_id    uuid,
    p_claves         text[] default null,
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
    v_hay_cambios_registro boolean;
    v_quien text;
begin
    perform panel_exigir_rol(array['ti']);

    perform 1 from registros where id = p_registro_id for update;
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

    if p_claves is null and not v_hay_cambios_registro then
        raise exception 'No hay cambios que guardar';
    end if;

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

    -- actualizar_registro ya hace este cierre cuando hubo cambios en la fila;
    -- repetirlo con "not atendida" es inocuo. Este bloque es el que resuelve
    -- el caso especial donde SOLO cambio el estacionamiento.
    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por,'')), ''), 'TI');
    update solicitudes
       set atendida = true,
           atendida_en = now(),
           atendida_por = v_quien,
           resolucion = 'ejecutada'
     where registro_id = p_registro_id
       and tipo = 'actualizacion'
       and not atendida;

    return jsonb_build_object('id', p_registro_id);
end;
$$;

revoke all on function actualizar_registro_con_estacionamiento(
    uuid, text[], text, text, boolean, text, text, text, text, text
) from public;
grant execute on function actualizar_registro_con_estacionamiento(
    uuid, text[], text, text, boolean, text, text, text, text, text
) to authenticated;

-- El navegador ya no debe poder saltarse los wrappers y reconstruir el flujo
-- no atomico con llamadas separadas. El owner conserva EXECUTE, por lo que los
-- wrappers SECURITY DEFINER pueden reutilizar estas funciones internas.
revoke execute on function asignar_estacionamiento(uuid, text[], text) from authenticated;
revoke execute on function instalar_tag(uuid, text, text) from authenticated;
revoke execute on function actualizar_registro(
    uuid, text, text, boolean, text, text, text, text, text
) from authenticated;

-- Auditoria esperada:
-- - anon: sin EXECUTE.
-- - authenticated sin aal2/rol ti: panel_exigir_rol rechaza.
-- - fallo de instalar_tag/actualizar_registro: no persiste estacionamiento ni
--   movimiento parcial, porque toda la llamada se revierte.
-- - actualizacion solo de estacionamiento: la solicitud queda ejecutada.

-- Hace visibles de inmediato los RPC nuevos para PostgREST/Supabase API.
notify pgrst, 'reload schema';
