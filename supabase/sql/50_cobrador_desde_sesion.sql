-- =====================================================================
-- 50_cobrador_desde_sesion.sql
-- Quien cobra es quien esta firmado en el panel. Punto.
--
-- Hasta el bloque 46, registrar_pago aceptaba un nombre TECLEADO
-- (p_cobrado_por) y lo guardaba tal cual en pagos.cobrado_por y en el sello
-- de validacion del tipo; el correo del JWT solo servia de respaldo si el
-- texto venia vacio. Es decir: la identidad del cobrador era un texto libre
-- que cualquiera podia escribir a nombre de otro, y la que no se puede
-- falsear (la del JWT) iba de segunda.
--
-- Pedido por el responsable el 24-ago tras operar el cobro: el campo se
-- prestaba a confusiones (nombres a medias, homonimos, cobrar a nombre de
-- otro). Mismo criterio que ya aplica cortar_caja (bloque 42): la identidad
-- se toma de la sesion, no del cliente.
--
-- Que cambia, y nada mas que esto:
--   - cobrado_por, tipo_validado_por y hecho_por del movimiento se sellan con
--     el correo del JWT. p_cobrado_por se conserva en la firma (misma firma:
--     sin drop, sin segunda funcion en PostgREST) pero YA NO SE USA.
--   - Si por alguna razon el JWT no trae correo, se rechaza el cobro en vez
--     de guardar un cobrador anonimo: un pago sin cobrador identificable no
--     debe existir en un sistema con corte de caja.
--
-- ORDEN DE DESPLIEGUE: el panel ya manda el nombre de la sesion (no
-- editable) desde el commit que acompana a este bloque, y sigue mandando
-- p_cobrado_por, asi que aplicar este bloque antes o despues del deploy es
-- indistinto: la firma no cambia y el parametro se ignora.
--
-- Depende de: 46 (cuerpo que reproduce), 42 (columnas cobrado_por_uid /
-- cobrado_por_email), 29 (panel_exigir_rol).
-- =====================================================================

create or replace function registrar_pago(
    p_registro_id  uuid,
    p_monto        numeric,
    p_cobrado_por  text default null,   -- conservado por compatibilidad; se ignora
    p_tipo_usuario text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_estado      text;
    v_tipo_actual text;
    v_es_menor    boolean;
    v_tipo        text;
    v_quien       text;
    v_folio       text;
    v_corregido   boolean := false;
begin
    perform panel_exigir_rol(array['admin']);

    -- La identidad del cobrador es la de la sesion. No hay respaldo tecleado:
    -- si el JWT no trae correo, no hay cobro.
    v_quien := nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '');
    if v_quien is null then
        raise exception 'No se pudo identificar al cobrador desde la sesion. Cierre sesion y vuelva a entrar.';
    end if;

    -- Serializa dos intentos simultaneos sobre el mismo expediente.
    select estado, tipo_usuario, usuario_es_menor
      into v_estado, v_tipo_actual, v_es_menor
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
        raise exception 'Confirme el tipo de usuario antes de cobrar (maestro, padres, alumno o admin)';
    end if;
    if v_tipo not in ('maestro', 'padres', 'alumno', 'admin') then
        raise exception 'Tipo de usuario invalido: % (maestro, padres, alumno o admin)', v_tipo;
    end if;
    if v_es_menor and v_tipo <> 'alumno' then
        raise exception 'El titular es menor de edad: su tipo debe ser alumno';
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

-- Misma firma que el 46: los grants se conservan. El notify es por higiene.
notify pgrst, 'reload schema';

-- =====================================================================
-- Auditoria esperada tras aplicar:
-- - Un cobro desde el panel deja pagos.cobrado_por = pagos.cobrado_por_email
--   = correo de la sesion, aunque el cliente mande otra cosa en p_cobrado_por.
-- - Sigue existiendo UNA sola firma de registrar_pago (uuid, numeric, text,
--   text): select p.oid::regprocedure from pg_proc p join pg_namespace n on
--   n.oid = p.pronamespace where n.nspname='public' and p.proname='registrar_pago';
-- - Los pagos anteriores conservan el nombre tecleado que tenian; no se
--   reescriben (la evidencia historica no se retoca).
-- =====================================================================
