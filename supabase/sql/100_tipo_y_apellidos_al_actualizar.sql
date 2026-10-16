-- =====================================================================
-- BLOQUE 100 — «Actualizar datos» corrige el tipo de un familiar y los
-- apellidos de la familia.
--
-- 16/10/2026
--
-- POR QUE
--   Gerardo, 16-oct: «en la pestaña de actualizar datos falta poder
--   actualizar los apellidos de la familia, el tipo de usuario (en este caso
--   es otro familiar y es padre de familia)».
--
--   Hoy el tipo solo se corrige en la caja (registrar_pago), y la caja solo
--   cobra una vez: pasado el cobro, un «otro familiar» que en realidad es
--   el padre se queda asi para siempre. Los apellidos de la familia se
--   escriben en un solo sitio, el alta (crear_registro); el bloque 58 dejo
--   anotado que su captura desde el panel quedaba pendiente.
--
-- QUE HACE, EN ORDEN
--   0. Guardia: la funcion vigente es la del bloque 52 (11 parametros, una
--      sola sobrecarga, con su reclamo del inventario) y el 100 no esta.
--   1. actualizar_registro_con_estacionamiento pasa de 11 a 14 parametros:
--      p_tipo_usuario, p_apellidos_familia y p_parentesco_otro AL FINAL y
--      con default null. CAMBIA LA FIRMA: drop + create + revoke/grant +
--      notify (la trampa de PostgREST). El cuerpo es el del bloque 52
--      EXTRAIDO, con el delta marcado «NUEVO 100».
--   2. Verificacion de solo lectura: filas con ok = true.
--
-- LAS REGLAS DEL DELTA
--   - El tipo solo cambia ENTRE LOS FAMILIARES: padres, alumno y otro, los
--     tres que llevan apellidos de familia. Ni desde ni hacia maestro o
--     administrativo (decision de Gerardo, 16-oct): esos arrastran seccion,
--     area y plumas, y se resuelven aparte.
--   - El menor de edad solo puede ser alumno (la misma regla de la caja).
--   - Al cambiar el tipo, los apellidos de la familia tienen que quedar
--     llenos (los que ya trae o los que se mandan). Si el tipo NO cambia,
--     no se le exigen: un expediente sin apellidos sigue actualizandose
--     como hoy (la leccion del bloque 58: no congelar por un dato faltante).
--   - Pasar a 'otro' exige parentesco. Dejar 'otro' borra el parentesco:
--     la columna describe al familiar de tipo otro (criterio del bloque 63)
--     y su valor queda dicho en movimientos.
--   - Un dato vacio no es un cambio: no borra lo capturado (como la marca).
--   - Cada cambio deja su movimiento 'cambio' en la bitacora.
--   - La aceptacion NO se toca: su payload sellado conserva lo que el
--     titular declaro al firmar, y el movimiento documenta la correccion
--     (mismo criterio que registrar_pago).
--   - tipo_validado NO se reinicia: el cobro ya ocurrio y no se repite, asi
--     que un «sin validar» quedaria para siempre. La correccion de TI queda
--     en movimientos con quien la hizo.
--
-- QUE NO HACE
--   - No toca actualizar_registro (la interna de vehiculo y TAG).
--   - No cambia plumas por el tipo: TI las ajusta en el mismo formulario.
--
-- ORDEN: este bloque solo AGREGA parametros, con default null. Va ANTES del
-- deploy del cliente que los manda. El cliente publicado llama por nombre y
-- sin los parametros nuevos: sigue funcionando igual.
-- Pegue el bloque COMPLETO de un tiron: entre el drop y el create la funcion
-- no existe (va dentro de begin/commit para que nadie vea el hueco).
-- =====================================================================

begin;

do $guardia$
declare
    v_n int;
begin
    if exists (select 1 from pg_proc
                where proname = 'actualizar_registro_con_estacionamiento' and pronargs = 14) then
        raise exception 'El bloque 100 ya esta aplicado (existe la firma de 14 parametros). No se aplico nada.';
    end if;
    select count(*) into v_n from pg_proc where proname = 'actualizar_registro_con_estacionamiento';
    if v_n <> 1 then
        raise exception 'Se esperaba UNA actualizar_registro_con_estacionamiento y hay %. No se aplico nada.', v_n;
    end if;
    if not exists (select 1 from pg_proc
                    where proname = 'actualizar_registro_con_estacionamiento'
                      and pronargs = 11
                      and prosrc like '%inv_reclamar_tag%'
                      and prosrc like '%Procedencia TAG: %') then
        raise exception 'La funcion vigente no es la del bloque 52 (11 parametros con inv_reclamar_tag). No se aplico nada.';
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'registros' and column_name = 'parentesco_otro')
       or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'registros' and column_name = 'apellidos_familia') then
        raise exception 'Faltan las columnas de los bloques 55 o 63. No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. LA FUNCION
-- ---------------------------------------------------------------------
drop function actualizar_registro_con_estacionamiento(
    uuid, text[], text, text, boolean, text, text, text, text, text, text);

create function actualizar_registro_con_estacionamiento(
    p_registro_id       uuid,
    p_claves            text[] default null,
    p_no_dispositivo    text default null,
    p_placas            text default null,
    p_sin_placas        boolean default null,
    p_marca             text default null,
    p_modelo            text default null,
    p_color             text default null,
    p_motivo            text default null,
    p_hecho_por         text default null,
    p_procedencia_tag   text default null,
    -- NUEVO 100: AL FINAL y con default null.
    p_tipo_usuario      text default null,
    p_apellidos_familia text default null,
    p_parentesco_otro   text default null
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
    -- NUEVO 100
    v_estado          text;
    v_es_menor        boolean;
    v_tipo_actual     text;
    v_tipo_nuevo      text;
    v_tipo_final      text;
    v_ap_actual       text;
    v_ap_nuevo        text;
    v_par_actual      text;
    v_par_nuevo       text;
    v_par_borrar      boolean := false;
    v_sufijo          text;
begin
    perform panel_exigir_rol(array['ti']);

    select procedencia_tag, tag_apartado,
           estado, usuario_es_menor, tipo_usuario, apellidos_familia, parentesco_otro   -- NUEVO 100
      into v_proc_actual, v_tag_apartado,
           v_estado, v_es_menor, v_tipo_actual, v_ap_actual, v_par_actual               -- NUEVO 100
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

    -- NUEVO 100: tipo, apellidos y parentesco. Vacio o igual = no cambia.
    v_tipo_nuevo := nullif(btrim(coalesce(p_tipo_usuario, '')), '');
    if v_tipo_nuevo is not null and v_tipo_nuevo = v_tipo_actual then
        v_tipo_nuevo := null;
    end if;
    v_ap_nuevo := nullif(btrim(coalesce(p_apellidos_familia, '')), '');
    if v_ap_nuevo is not null and v_ap_nuevo = coalesce(btrim(v_ap_actual), '') then
        v_ap_nuevo := null;
    end if;
    v_par_nuevo := nullif(btrim(coalesce(p_parentesco_otro, '')), '');

    if (v_tipo_nuevo is not null or v_ap_nuevo is not null or v_par_nuevo is not null)
       and v_estado = 'baja' then
        raise exception 'El registro esta dado de baja';
    end if;

    if v_tipo_nuevo is not null then
        if v_tipo_nuevo not in ('padres', 'alumno', 'otro') or v_tipo_actual not in ('padres', 'alumno', 'otro') then
            raise exception 'Desde «Actualizar datos» el tipo solo cambia entre padre o madre, alumno y otro familiar.';
        end if;
        if coalesce(v_es_menor, false) and v_tipo_nuevo <> 'alumno' then
            raise exception 'El titular es menor de edad: su tipo debe ser alumno';
        end if;
        if coalesce(v_ap_nuevo, nullif(btrim(coalesce(v_ap_actual, '')), '')) is null then
            raise exception 'Capture los apellidos de la familia: son obligatorios para padres, alumnos y otros familiares.';
        end if;
    end if;
    v_tipo_final := coalesce(v_tipo_nuevo, v_tipo_actual);

    if v_tipo_final = 'otro' then
        if v_par_nuevo is not null and v_par_nuevo = coalesce(btrim(v_par_actual), '') then
            v_par_nuevo := null;
        end if;
        if v_tipo_nuevo = 'otro'
           and coalesce(v_par_nuevo, nullif(btrim(coalesce(v_par_actual, '')), '')) is null then
            raise exception 'Capture el parentesco del titular con la familia (tio, abuelo, etcetera): es obligatorio cuando el tipo de usuario es otro.';
        end if;
    else
        -- Fuera de 'otro' el parentesco no se guarda (criterio del bloque 63);
        -- si deja de ser 'otro', el que traia se borra y queda en movimientos.
        v_par_nuevo := null;
        v_par_borrar := v_tipo_nuevo is not null and v_tipo_actual = 'otro'
                        and nullif(btrim(coalesce(v_par_actual, '')), '') is not null;
    end if;

    if p_claves is null and not v_hay_cambios_registro and v_proc_nueva is null
       and v_tipo_nuevo is null and v_ap_nuevo is null and v_par_nuevo is null then   -- NUEVO 100
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

    -- SC-025: si el tramite puso un No. de TAG nuevo y ese numero estaba
    -- disponible en el inventario, queda asignado a este expediente.
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

    -- NUEVO 100: tipo, apellidos y parentesco, cada uno con su movimiento.
    v_sufijo := ' (corregido en Actualizar datos)'
        || case when coalesce(btrim(coalesce(p_motivo, '')), '') <> ''
                then ' - ' || btrim(p_motivo) else '' end;

    if v_tipo_nuevo is not null then
        update registros set tipo_usuario = v_tipo_nuevo where id = p_registro_id;
        insert into movimientos (registro_id, tipo, motivo, hecho_por)
        values (p_registro_id, 'cambio',
            'Tipo de usuario: ' || v_tipo_actual || ' -> ' || v_tipo_nuevo || v_sufijo,
            v_quien);
    end if;

    if v_ap_nuevo is not null then
        update registros set apellidos_familia = v_ap_nuevo where id = p_registro_id;
        insert into movimientos (registro_id, tipo, motivo, hecho_por)
        values (p_registro_id, 'cambio',
            'Apellidos de familia: ' || coalesce(nullif(btrim(v_ap_actual), ''), '(sin dato)') || ' -> ' || v_ap_nuevo || v_sufijo,
            v_quien);
    end if;

    if v_par_nuevo is not null then
        update registros set parentesco_otro = v_par_nuevo where id = p_registro_id;
        insert into movimientos (registro_id, tipo, motivo, hecho_por)
        values (p_registro_id, 'cambio',
            'Parentesco: ' || coalesce(nullif(btrim(v_par_actual), ''), '(sin dato)') || ' -> ' || v_par_nuevo || v_sufijo,
            v_quien);
    elsif v_par_borrar then
        update registros set parentesco_otro = null where id = p_registro_id;
        insert into movimientos (registro_id, tipo, motivo, hecho_por)
        values (p_registro_id, 'cambio',
            'Parentesco: ' || btrim(v_par_actual) || ' -> (ya no es otro familiar)' || v_sufijo,
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
    uuid, text[], text, text, boolean, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function actualizar_registro_con_estacionamiento(
    uuid, text[], text, text, boolean, text, text, text, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;


-- ---------------------------------------------------------------------
-- 2. VERIFICACION (solo lectura): todas las filas con ok = true
-- ---------------------------------------------------------------------
select 1 as orden, 'una sola actualizar_registro_con_estacionamiento, de 14 parametros' as que,
       (select count(*) from pg_proc where proname = 'actualizar_registro_con_estacionamiento') = 1
       and (select pronargs from pg_proc where proname = 'actualizar_registro_con_estacionamiento') = 14 as ok
union all
select 2, 'security definer y conserva el reclamo del inventario',
       (select prosecdef and prosrc like '%inv_reclamar_tag%' and prosrc like '%Procedencia TAG: %'
          from pg_proc where proname = 'actualizar_registro_con_estacionamiento')
union all
select 3, 'trae las reglas nuevas (solo familiares, apellidos al cambiar el tipo)',
       (select prosrc like '%NUEVO 100%' and prosrc like '%Apellidos de familia: %'
               and prosrc like '%(''padres'', ''alumno'', ''otro'')%'
          from pg_proc where proname = 'actualizar_registro_con_estacionamiento')
union all
select 4, 'anon no la ejecuta; authenticated si (la guardia decide el rol)',
       not has_function_privilege('anon',
           'public.actualizar_registro_con_estacionamiento(uuid, text[], text, text, boolean, text, text, text, text, text, text, text, text, text)', 'execute')
       and has_function_privilege('authenticated',
           'public.actualizar_registro_con_estacionamiento(uuid, text[], text, text, boolean, text, text, text, text, text, text, text, text, text)', 'execute')
union all
select 5, 'ningun mensaje tutea',
       (select prosrc !~* '\m(tu|tus|elige|escribe|vuelve|captura tu)\M'
          from pg_proc where proname = 'actualizar_registro_con_estacionamiento')
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado)
-- ---------------------------------------------------------------------
-- Quita la firma de 14 y recrea la de 11 con el cuerpo del bloque 52.
--   begin;
--   drop function if exists actualizar_registro_con_estacionamiento(
--       uuid, text[], text, text, boolean, text, text, text, text, text, text, text, text, text);
--   -- Pegue aqui, tal cual, las lineas 421-534 de supabase/sql/52_inventario_tags.sql
--   -- (create or replace function actualizar_registro_con_estacionamiento ... $$;).
--   revoke all on function actualizar_registro_con_estacionamiento(
--       uuid, text[], text, text, boolean, text, text, text, text, text, text) from public, anon;
--   grant execute on function actualizar_registro_con_estacionamiento(
--       uuid, text[], text, text, boolean, text, text, text, text, text, text) to authenticated;
--   commit;
--   notify pgrst, 'reload schema';
--   Lo ya corregido con el 100 (tipo, apellidos, parentesco) se queda: el
--   rollback solo quita la posibilidad de corregirlo desde la pantalla.
