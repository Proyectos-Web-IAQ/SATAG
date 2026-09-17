-- =====================================================================
-- 73_seccion_al_cobrar.sql   (SC-030, mejora continua de L2-09)
--
-- REDACTADO EL 17-SEP-2026. **NO SE APLICA TODAVIA.** Va en la ventana de
-- mejora continua, a partir de la semana del 28-sep, y **ANTES** del
-- deploy del panel que manda el dato.
--
-- POR QUE. Es el hueco que el propio bloque 70 dejo anotado. Cuando
-- Administracion corrige el tipo en la caja y lo cambia A 'maestro' —el
-- caso concreto que la junta del 9-sep puso sobre la mesa—, el expediente
-- se queda con `seccion_maestro` en null y **ninguna pantalla la captura**.
-- Su TAG queda sin criterio de estacionamiento: TI no recibe los chips
-- sugeridos y el aviso de descarga a ZK no puede listarlo por
-- estacionamiento. Ya puede ocurrir en produccion desde el 17-sep.
--
-- El bloque 72 no lo arregla: ese exige la seccion en el ALTA, y este caso
-- nace en la CAJA, despues del alta. La caja es donde se confirma el tipo,
-- asi que es donde tiene que poder declararse la seccion.
--
-- QUE HACE. `registrar_pago` pasa de 5 a **6 parametros**
-- (`p_seccion_maestro text default null`, AL FINAL) y gana tres cosas,
-- calcadas del trato que el bloque 63 le dio al parentesco de 'otro':
--   1. Si el tipo confirmado es 'maestro' y no hay seccion —ni la que
--      manda la caja ni la que ya traia el expediente— **no deja cobrar**.
--   2. Si la caja manda una seccion distinta de la guardada, la corrige y
--      deja un movimiento 'cambio' que lo documenta.
--   3. La respuesta devuelve `seccionMaestro`, para que el panel confirme
--      en pantalla lo que quedo.
-- Con cualquier tipo distinto de 'maestro' el parametro se ignora.
--
-- *** CAMBIA LA FIRMA: la trampa PostgREST ***
-- `create or replace` NO sirve: dejaria viva la de 5 junto a la nueva y la
-- API quedaria ambigua. Receta completa, la del 63: drop de la de 5 y de
-- la de 6, create, revoke/grant a `authenticated` (el mismo rol que le dio
-- el bloque 46) y notify pgrst.
--
-- ORDEN: este bloque **ANTES** del deploy del panel. El panel publicado
-- llama por argumentos nombrados y no manda el parametro 6, asi que con la
-- firma nueva sigue cobrando igual; al reves —panel nuevo contra la firma
-- de 5— PostgREST no encuentra la funcion y **se cae todo cobro**. Es la
-- misma leccion del 10 y 11-sep.
--
-- POR QUE NO LLEVA CANDADO DE SESION. Los bloques 65 y 72 lo llevan porque
-- exigen un dato que solo el sitio publicado puede mandar, y la base no
-- puede ver si ya se publico. Aqui la condicion que importa **si la puede
-- ver la base**: el unico expediente que se atoraria es un maestro sin
-- seccion y sin pago, porque el cobro empezaria a exigirsela y ninguna
-- pantalla la manda todavia. La guardia lo comprueba directamente y aborta
-- con la lista, que es mejor que una frase que alguien puede pegar sin
-- haber comprobado nada.
--
-- El cuerpo es el vigente del bloque 63, INTEGRO, con seis deltas marcados
-- "NUEVO 73". Se genero extrayendolo del archivo del 63 y no
-- transcribiendolo a mano.
--
-- Depende de: 63 (registrar_pago de 5 parametros) y 70 (la columna
-- seccion_maestro). El 72 es independiente: uno cierra el alta y el otro
-- la caja.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. GUARDIA. Va primero: si aborta, no se aplico nada.
-- ---------------------------------------------------------------------
do $guardia$
declare
    v_formas int;
    v_stuck  int;
    v_lista  text;
begin
    select count(*) into v_formas
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'registrar_pago';
    if v_formas <> 1 then
        raise exception 'Bloque 73 cancelado: registrar_pago tiene % formas y deberia tener 1. No se aplico nada.', v_formas;
    end if;

    if to_regprocedure('public.registrar_pago(uuid,numeric,text,text,text)') is null
       and to_regprocedure('public.registrar_pago(uuid,numeric,text,text,text,text)') is null then
        raise exception 'Bloque 73 cancelado: registrar_pago no tiene ni 5 ni 6 parametros; aplique primero el bloque 63. No se aplico nada.';
    end if;

    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'registros'
                      and column_name = 'seccion_maestro') then
        raise exception 'Bloque 73 cancelado: falta la columna registros.seccion_maestro; aplique primero el bloque 70. No se aplico nada.';
    end if;

    -- La condicion que de verdad importa, y que la base SI puede ver: un
    -- maestro sin seccion y sin pago. A partir de este bloque su cobro
    -- exigiria la seccion, y el panel publicado todavia no la manda: ese
    -- expediente se quedaria sin poder cobrarse hasta el deploy.
    select count(*),
           string_agg(folio, ', ' order by folio)
      into v_stuck, v_lista
      from registros r
     where r.tipo_usuario    = 'maestro'
       and r.seccion_maestro is null
       and r.estado <> 'baja'
       and not exists (select 1 from pagos p where p.registro_id = r.id);
    if v_stuck > 0 then
        raise exception 'Bloque 73 cancelado: hay % expediente(s) de maestro sin seccion y sin pago (%). Con este bloque su cobro exigiria la seccion y el panel publicado todavia no la manda: quedarian atorados. Resuelvalos primero —desde TI, o dandoles la seccion— o publique antes el panel que la pide. No se aplico nada.', v_stuck, v_lista;
    end if;
end
$guardia$;


-- ---------------------------------------------------------------------
-- 1. Fuera las firmas de 5 y de 6 (la de 6 por si una corrida anterior
--    de este mismo bloque la dejo), con las listas COMPLETAS de tipos.
-- ---------------------------------------------------------------------
drop function if exists registrar_pago(uuid, numeric, text, text, text);
drop function if exists registrar_pago(uuid, numeric, text, text, text, text);


-- ---------------------------------------------------------------------
-- 2. La funcion nueva: cuerpo vigente del bloque 63 + deltas NUEVO 73.
-- ---------------------------------------------------------------------
create function registrar_pago(
    p_registro_id     uuid,
    p_monto           numeric,
    p_cobrado_por     text default null,   -- conservado por compatibilidad; se ignora
    p_tipo_usuario    text default null,
    -- NUEVO 63: AL FINAL y con default null, para que el panel publicado,
    -- que no lo manda, siga cobrando igual.
    p_parentesco_otro text default null,
    -- NUEVO 73: parametro 6, AL FINAL y con default null, para que el panel
    -- publicado antes de este bloque siga cobrando igual (llama por nombre).
    p_seccion_maestro text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    v_seccion_actual    text;               -- NUEVO 73
    v_seccion           text;               -- NUEVO 73
begin
    perform panel_exigir_rol(array['admin']);

    -- La identidad del cobrador es la de la sesion. No hay respaldo tecleado:
    -- si el JWT no trae correo, no hay cobro.
    v_quien := nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '');
    if v_quien is null then
        raise exception 'No se pudo identificar al cobrador desde la sesion. Cierre sesion y vuelva a entrar.';
    end if;

    -- Serializa dos intentos simultaneos sobre el mismo expediente.
    select estado, tipo_usuario, usuario_es_menor, parentesco_otro,  -- NUEVO 63: parentesco_otro
           seccion_maestro                                           -- NUEVO 73
      into v_estado, v_tipo_actual, v_es_menor, v_parentesco_actual,
           v_seccion_actual
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

    -- NUEVO 73: la seccion del maestro, con el mismo trato y en el mismo
    -- sitio que el parentesco, y por la misma razon: un rechazo despues del
    -- insert revertiria el pago pero quemaria el numero de la secuencia del
    -- recibo, que no se revierte.
    --
    -- ESTE ES EL HUECO QUE EL BLOQUE 70 DEJO ANOTADO: un expediente de
    -- 'padres' corregido a 'maestro' en la caja se quedaba con
    -- seccion_maestro en null y NINGUNA pantalla la capturaba, asi que su
    -- TAG quedaba sin criterio de estacionamiento. La caja es donde se
    -- confirma el tipo, asi que es donde tiene que poder declararse.
    v_seccion := lower(nullif(btrim(coalesce(p_seccion_maestro, '')), ''));
    if v_seccion is not null
       and v_seccion not in ('preescolar','primaria','secundaria','preparatoria') then
        raise exception 'La seccion del maestro debe ser preescolar, primaria, secundaria o preparatoria';
    end if;
    if v_tipo = 'maestro'
       and coalesce(v_seccion, nullif(btrim(coalesce(v_seccion_actual, '')), '')) is null then
        raise exception 'Indique la seccion en la que trabaja el maestro (preescolar, primaria, secundaria o preparatoria) antes de cobrar: de ella depende el estacionamiento al que da acceso su TAG';
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

    -- NUEVO 73: la seccion solo se escribe cuando el tipo confirmado es
    -- 'maestro'. Con cualquier otro tipo se ignora, igual que el parentesco:
    -- la columna describe un dato laboral del docente y guardarla en un
    -- padre dejaria un dato que ninguna regla sostiene.
    -- Si el tipo se corrige DE maestro a otro, la seccion guardada se queda:
    -- no estorba, porque ficha, instalacion y exportacion solo la leen
    -- cuando el tipo es maestro (criterio del bloque 70).
    -- La aceptacion NO se toca: su payload sellado conserva lo que el
    -- titular declaro al firmar, y el movimiento documenta la correccion.
    if v_tipo = 'maestro'
       and v_seccion is not null
       and v_seccion is distinct from v_seccion_actual then
        update registros set seccion_maestro = v_seccion where id = p_registro_id;
        insert into movimientos (registro_id, tipo, motivo, hecho_por)
        values (
            p_registro_id, 'cambio',
            'Seccion del maestro: ' || coalesce(v_seccion_actual, '(sin dato)') || ' -> ' || v_seccion
                || ' (validada al cobrar)',
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
        'tipoAnterior', case when v_corregido then v_tipo_actual else null end,
        'seccionMaestro', case when v_tipo = 'maestro'
                               then coalesce(v_seccion, v_seccion_actual) else null end   -- NUEVO 73
    );
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Los grants se fueron con el drop: se emiten otra vez para la firma
--    NUEVA de 6 tipos, al mismo rol que le dio el bloque 46.
-- ---------------------------------------------------------------------
revoke all on function registrar_pago(uuid, numeric, text, text, text, text) from public;
grant execute on function registrar_pago(uuid, numeric, text, text, text, text) to authenticated;

-- PostgREST cachea las firmas: sin esto sigue anunciando la de 5 y rechaza
-- el argumento nuevo como desconocido.
notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- 4. VERIFICACION (solo lectura). `ok` en true en las cinco filas.
-- ---------------------------------------------------------------------
select 1 as orden, 'registrar_pago: una sola forma, de 6 parametros' as que,
       (select string_agg(p.oid::regprocedure::text, ' | ')
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'registrar_pago') as valor,
       (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'registrar_pago')
       and to_regprocedure('public.registrar_pago(uuid,numeric,text,text,text,text)') is not null as ok
union all
select 2, 'authenticated ejecuta registrar_pago', null,
       has_function_privilege('authenticated', 'public.registrar_pago(uuid,numeric,text,text,text,text)', 'execute')
union all
select 3, 'anon NO la ejecuta (el cobro es del panel)', null,
       not has_function_privilege('anon', 'public.registrar_pago(uuid,numeric,text,text,text,text)', 'execute')
union all
select 4, 'exige la seccion cuando el tipo confirmado es maestro', null,
       (select position('Indique la seccion en la que trabaja el maestro' in p.prosrc) > 0
           and position('Seccion del maestro: ' in p.prosrc) > 0
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'registrar_pago')
union all
select 5, 'crear_registro y capturar_expediente_ti siguen con una sola forma',
       (select string_agg(proname || ':' || n, ', ') from (
            select p.proname, count(*)::text as n
              from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
             where ns.nspname = 'public'
               and p.proname in ('crear_registro','capturar_expediente_ti')
             group by p.proname) x),
       (select bool_and(n = 1) from (
            select count(*) as n
              from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
             where ns.nspname = 'public'
               and p.proname in ('crear_registro','capturar_expediente_ti')
             group by p.proname) x)
order by orden;


-- ---------------------------------------------------------------------
-- 5. DESPUES DEL DEPLOY, la prueba que de verdad cierra el hueco: cobre un
--    expediente de 'padres' corrigiendo el tipo a 'maestro' y eligiendo su
--    seccion. Debe quedar la seccion guardada y el movimiento que la
--    documenta.
--
--   select r.folio, r.tipo_usuario, r.seccion_maestro,
--          m.motivo, m.hecho_por,
--          to_char(m.created_at at time zone 'America/Mexico_City', 'DD-Mon HH24:MI') as cuando
--     from registros r
--     join movimientos m on m.registro_id = r.id
--    where m.motivo like 'Seccion del maestro:%'
--    order by m.created_at desc
--    limit 5;
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado).
--
-- ANTES DE NADA: si el panel nuevo ya esta publicado, revierta primero el
-- deploy. Ese panel manda p_seccion_maestro y contra la firma de 5
-- PostgREST no encuentra la funcion: se caeria TODO cobro.
--
--   drop function if exists registrar_pago(uuid, numeric, text, text, text, text);
--   -- Corra el PASO 4 de 63_tipo_otro_y_apellidos_alumno.sql (lineas
--   -- 598-736) tal cual, que crea la firma de 5, y despues:
--   revoke all on function registrar_pago(uuid, numeric, text, text, text) from public;
--   grant execute on function registrar_pago(uuid, numeric, text, text, text) to authenticated;
--   notify pgrst, 'reload schema';
--
-- La columna seccion_maestro se queda: es del bloque 70, nada la exige a
-- nivel de tabla y el panel la consulta.
-- ---------------------------------------------------------------------
