-- =====================================================================
-- 46_validar_tipo_al_cobrar.sql
-- CC-05 (B5): validar el tipo de usuario al cobrar.
--
-- Las columnas tipo_validado / tipo_validado_por / tipo_validado_en existen en
-- 12_registros.sql desde el primer dia y NADA las escribia ni las leia
-- (confirmado en la auditoria del 28-jul). Este bloque las conecta.
--
-- LA REGLA DE NEGOCIO
--
-- El tipo de usuario (maestro | padres | alumno | admin) lo DECLARA el titular
-- en el alta, sin que nadie lo verifique: es un formulario publico. La primera
-- vez que el expediente pasa por una persona del instituto es en el cobro, con
-- el titular enfrente. Ese es el momento de confirmarlo, y de eso dependia el
-- trato del TAG.
--
-- Por eso cobrar y validar son EL MISMO ACTO, en una sola transaccion:
--   - p_tipo_usuario es OBLIGATORIO. Sin el, no hay cobro.
--   - Si difiere de lo declarado, se corrige el expediente y queda movimiento
--     en la bitacora (no se pisa el dato en silencio).
--   - El sello (quien valido y cuando) se guarda siempre.
--
-- OJO SOBRECARGA PostgREST: registrar_pago YA existe con la firma de 3
-- argumentos (bloques 32 -> 42). Agregarle un cuarto parametro crea una
-- SEGUNDA firma y PostgREST falla con "could not choose the best candidate
-- function". Por eso hay drop explicito de la firma vieja antes de recrearla,
-- + notify pgrst (mismo patron que los bloques 32, 33, 35, 37 y 39).
--
-- AL APLICAR: este bloque y el despliegue del panel van JUNTOS. Entre aplicar
-- el bloque y publicar el front, un panel viejo (que manda 3 argumentos) recibe
-- "Confirme el tipo de usuario antes de cobrar" y no puede cobrar.
--
-- Reproduce integro el cuerpo del bloque 42 (identidad del JWT en el cobro) y
-- le suma la validacion del tipo.
--
-- Depende de: 12_registros.sql, 16_movimientos.sql, 24_pagos.sql,
--             29_rpc_panel.sql (panel_exigir_rol), 32, 42.
-- Aplicar despues del bloque 45.
-- =====================================================================

-- Se elimina la firma de 3 argumentos: PostgREST debe exponer una sola.
drop function if exists registrar_pago(uuid, numeric, text);

create or replace function registrar_pago(
    p_registro_id  uuid,
    p_monto        numeric,
    p_cobrado_por  text default null,
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
    -- Obligatoria: el cobro es el unico momento del flujo en que alguien del
    -- instituto tiene al titular enfrente.
    v_tipo := nullif(btrim(coalesce(p_tipo_usuario, '')), '');
    if v_tipo is null then
        raise exception 'Confirme el tipo de usuario antes de cobrar (maestro, padres, alumno o admin)';
    end if;
    if v_tipo not in ('maestro', 'padres', 'alumno', 'admin') then
        raise exception 'Tipo de usuario invalido: % (maestro, padres, alumno o admin)', v_tipo;
    end if;
    -- Coherencia con el alta: un menor de edad se registra como alumno y firma
    -- su gestionante (CC-11). Cambiarle el tipo aqui dejaria el expediente
    -- contradiciendo su propia evidencia de firma.
    if v_es_menor and v_tipo <> 'alumno' then
        raise exception 'El titular es menor de edad: su tipo debe ser alumno';
    end if;

    -- Quien valida es quien cobra. El nombre tecleado puede venir vacio; el
    -- correo del JWT no se puede falsear desde el navegador y sirve de respaldo.
    v_quien := coalesce(
        nullif(btrim(coalesce(p_cobrado_por, '')), ''),
        auth.jwt() ->> 'email',
        'Administracion'
    );

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
        nullif(btrim(coalesce(p_cobrado_por, '')), ''),
        auth.uid(),
        auth.jwt() ->> 'email'
    )
    returning folio_recibo into v_folio;

    -- El tipo declarado no coincidia: se corrige y queda en la bitacora. Nunca
    -- en silencio; el tipo es el dato del que dependia el trato del TAG.
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

revoke all on function registrar_pago(uuid, numeric, text, text) from public;
grant execute on function registrar_pago(uuid, numeric, text, text) to authenticated;

-- Hace visible de inmediato la firma nueva para PostgREST/Supabase API.
notify pgrst, 'reload schema';

-- =====================================================================
-- Auditoria esperada (casos F-34..F-37 de Pruebas/01 - Matriz de Casos.md):
--
-- - Cobrar sin mandar el tipo: falla con "Confirme el tipo de usuario...".
--   Ningun pago queda registrado (la excepcion revierte la transaccion).
-- - Cobrar con un tipo fuera del catalogo: falla.
-- - Cobrar confirmando el mismo tipo declarado: se registra el pago,
--   tipo_validado queda en true con nombre y fecha, y NO se escribe movimiento
--   (no hubo correccion que registrar).
-- - Cobrar corrigiendo el tipo: ademas queda un movimiento 'cambio' con
--   "Tipo de usuario: X -> Y (validado al cobrar)".
-- - Menor de edad con tipo distinto de alumno: rechazado.
-- - Rol ti / consulta: panel_exigir_rol rechaza (sin cambios respecto al 29).
-- - Solo existe UNA firma de registrar_pago en PostgREST:
--     select p.oid::regprocedure
--       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public' and p.proname = 'registrar_pago';
--   Debe devolver exactamente un renglon (uuid, numeric, text, text).
--
-- Decision abierta: los pagos anteriores a este bloque quedan con
-- tipo_validado = false. No se hace backfill a proposito: nadie los valido de
-- verdad, y marcarlos como validados falsearia la evidencia. El panel los
-- muestra como "sin validar".
-- =====================================================================
