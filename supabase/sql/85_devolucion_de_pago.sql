-- =====================================================================
-- 85_devolucion_de_pago.sql — Administracion devuelve un cobro antes de instalar
-- Pedido de Administracion · 05/10/2026
--
-- POR QUE. Hoy un cobro no tiene vuelta atras. Si alguien se equivoco de
-- expediente o de monto, o la familia se arrepintio antes de que TI instalara,
-- no hay forma de registrar en SATAG que el dinero se devolvio. La indicacion
-- (5-oct): Administracion devuelve lo que haga falta, con un solo filtro —que
-- el TAG no se haya instalado— y despues se revisa con el contador si hay que
-- cambiar algo.
--
-- LA REGLA DE FONDO: UN COBRO NO SE BORRA, SE DEVUELVE. El pago conserva su
-- folio de recibo y gana una marca de devolucion: cuando, quien y por que. Un
-- pago ya cortado esta sellado y asi se queda; su devolucion es dinero que sale
-- HOY y entra al corte SIGUIENTE como salida. Borrar el pago dejaria un corte
-- cerrado sin su respaldo y un folio de recibo huerfano.
--
-- QUE CAMBIA
--   1. pagos: seis columnas de devolucion, un CHECK de coherencia y la llave a
--      cortes_caja (diferida, igual que corte_id).
--   2. uq_pagos_registro pasa a contar solo pagos VIGENTES: un expediente con
--      su pago devuelto se puede volver a cobrar.
--   3. cortes_caja: total_devuelto y cantidad_devoluciones. total_esperado pasa
--      a ser el NETO (cobrado menos devuelto), que es el efectivo que debe
--      haber. En los cortes viejos no cambia nada: su devuelto es cero.
--   4. movimientos: el tipo 'devolucion'.
--   5. Los que preguntaban «tiene pago» ahora preguntan «tiene pago VIGENTE»:
--      registrar_pago, instalar_tag, los dos avisos a Chat y la vista
--      v_registros_incompletos. Sin esto, un pago devuelto seguiria mandando a
--      TI a instalar. instalar_tag ademas toma candado sobre el expediente.
--   6. La caja: estado_caja y cortar_caja cuentan las devoluciones.
--   7. pagos_congelar_sellado: una devolucion no se deshace ni se reescribe.
--   8. RPC nueva devolver_pago(registro, motivo, recibo), rol admin (y super,
--      que panel_exigir_rol deja pasar siempre: 29_rpc_panel.sql:49-51). El
--      recibo es el que la pantalla mostro y la cajera confirmo: si entre que
--      cargo la pantalla y el clic alguien devolvio y volvio a cobrar, el pago
--      vigente ya es otro y la base no lo devuelve.
--
-- DEPENDE DE ESTE BLOQUE el 73 (sin aplicar): recrea registrar_pago desde el
-- cuerpo del 63, sin el filtro de pago vigente. Aplicado DESPUES del 85, un
-- expediente con pago devuelto ya no se podria volver a cobrar. Antes de
-- aplicarlo hay que extraer su cuerpo de este bloque.
--
-- LOS CUERPOS NO SE TRANSCRIBIERON. Las siete funciones se extrajeron del
-- volcado de produccion del 29-sep (supabase/migrations/20260929120000) y la
-- vista, del bloque 81; a cada una se le aplico un delta exacto y cada cambio
-- va marcado «NUEVO 85». La guardia compara la huella de cada cuerpo vivo con
-- la del volcado: si alguien los toco despues, aborta sin aplicar nada.
--
-- ORDEN CON EL CLIENTE: AGREGA. Va ANTES del deploy del panel. Con el panel
-- publicado hoy nadie puede devolver, asi que todo se comporta igual: ningun
-- pago tiene devuelto_en y «vigente» es todo pago. Al reves —panel nuevo contra
-- base vieja— el panel pediria columnas que no existen y se caeria la lista de
-- expedientes.
--
-- Todo lo que ya existia conserva su firma (`create or replace`, sin drop): no
-- hay trampa de PostgREST. devolver_pago es nueva y lleva grants y notify.
--
-- VA EN UNA SOLA TRANSACCION: se pega completo, de un tiron. Si la guardia o
-- cualquier paso falla, no queda nada a medias.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. GUARDIA
-- ---------------------------------------------------------------------
do $guardia$
declare
    -- Huella de cada cuerpo tal como esta en el volcado del 29-sep. Se calcula
    -- sin retornos de carro, para que no dependa de como se pego el archivo.
    v_esperadas constant jsonb := '{
        "registrar_pago": "ba537d3235e555baab7f3a33fc65d9ef",
        "instalar_tag": "7e505c44a70f81cd7d4b446c9775c65b",
        "cortar_caja": "b013ff00a87a34ae1d7b560dc9558be4",
        "estado_caja": "a7b9579b695861c9146cbfaefa7f6925",
        "tg_pagos_avisar_chat_ti": "cd5f17354528b340040e28596b2f9ede",
        "recordar_chat_ti": "eb82629717992517865afe6bb359b40a",
        "pagos_congelar_sellado": "b0882aaafaf4f07a232dd22b4e79d2e7"
    }';
    v_nombre text;
    v_huella text;
    v_n      int;
    v_malas  text[] := array[]::text[];
begin
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'pagos' and column_name = 'devuelto_en') then
        raise exception 'Bloque 85 cancelado: pagos ya tiene devuelto_en, parece aplicado. No se aplico nada.';
    end if;
    if to_regprocedure('public.devolver_pago(uuid,text,text)') is not null
       or to_regprocedure('public.devolver_pago(uuid,text)') is not null then
        raise exception 'Bloque 85 cancelado: devolver_pago ya existe. No se aplico nada.';
    end if;
    -- El CHECK de movimientos se reescribe a partir de la lista del 76.
    if not exists (select 1 from pg_constraint
                    where conname = 'mov_tipo_valido'
                      and pg_get_constraintdef(oid) like '%validacion%'
                      and pg_get_constraintdef(oid) not like '%devolucion%') then
        raise exception 'Bloque 85 cancelado: mov_tipo_valido no es el que dejo el bloque 76. No se aplico nada.';
    end if;
    if not exists (select 1 from pg_indexes
                    where schemaname = 'public' and indexname = 'uq_pagos_registro'
                      and indexdef = 'CREATE UNIQUE INDEX uq_pagos_registro ON public.pagos USING btree (registro_id)') then
        raise exception 'Bloque 85 cancelado: uq_pagos_registro no es el indice unico de siempre. No se aplico nada.';
    end if;
    if (select count(*) from pg_constraint
         where conrelid = 'public.cortes_caja'::regclass
           and conname in ('corte_con_pagos', 'corte_total_no_negativo')) <> 2 then
        raise exception 'Bloque 85 cancelado: cortes_caja no tiene los dos CHECK que este bloque reemplaza. No se aplico nada.';
    end if;
    if pg_get_viewdef('public.v_registros_incompletos'::regclass) not like '%origen_expediente%'
       or pg_get_viewdef('public.v_registros_incompletos'::regclass) like '%devuelto_en%' then
        raise exception 'Bloque 85 cancelado: v_registros_incompletos no es la del bloque 81. No se aplico nada.';
    end if;

    for v_nombre, v_huella in select key, value from jsonb_each_text(v_esperadas) loop
        select count(*) into v_n
          from pg_proc p join pg_namespace s on s.oid = p.pronamespace
         where s.nspname = 'public' and p.proname = v_nombre;
        if v_n <> 1 then
            v_malas := v_malas || (v_nombre || ' tiene ' || v_n || ' versiones');
            continue;
        end if;
        if (select md5(replace(p.prosrc, chr(13), ''))
              from pg_proc p join pg_namespace s on s.oid = p.pronamespace
             where s.nspname = 'public' and p.proname = v_nombre) <> v_huella then
            v_malas := v_malas || (v_nombre || ' no es la del volcado del 29-sep');
        end if;
    end loop;
    if cardinality(v_malas) > 0 then
        raise exception 'Bloque 85 cancelado, no se aplico nada: %', array_to_string(v_malas, '; ');
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. PAGOS: la devolucion vive en el mismo renglon que el cobro
-- ---------------------------------------------------------------------
alter table pagos
    add column devuelto_en         timestamptz,
    add column devuelto_por        text,
    add column devuelto_por_uid    uuid,
    add column devuelto_por_email  text,
    add column devolucion_motivo   text,
    add column devolucion_corte_id uuid;

-- O no hay devolucion, o la hay completa: cuando, quien y por que.
alter table pagos add constraint pagos_devolucion_coherente check (
    (devuelto_en is null and devuelto_por is null and devuelto_por_uid is null
     and devuelto_por_email is null and devolucion_motivo is null and devolucion_corte_id is null)
    or
    (devuelto_en is not null
     and btrim(coalesce(devuelto_por, '')) <> ''
     and btrim(coalesce(devolucion_motivo, '')) <> '')
);

-- Diferida como pagos_corte_fk: cortar_caja sella antes de insertar el corte.
alter table pagos add constraint pagos_devolucion_corte_fk
    foreign key (devolucion_corte_id) references cortes_caja(id) deferrable initially deferred;

create index ix_pagos_devoluciones_en_caja on pagos (devuelto_en)
    where devuelto_en is not null and devolucion_corte_id is null;

comment on column pagos.devuelto_en is
    'Cuando Administracion devolvio este cobro (bloque 85). Null: el pago esta vigente.';
comment on column pagos.devuelto_por is 'PII indirecta: correo de quien devolvio, tomado de la sesion';
comment on column pagos.devolucion_motivo is 'Por que se devolvio. Obligatorio: es lo que lee el contador.';
comment on column pagos.devolucion_corte_id is
    'El corte que registro la SALIDA de este dinero. Puede ser distinto de corte_id: el cobro entro en un corte y la devolucion en otro posterior.';


-- ---------------------------------------------------------------------
-- 2. UN SOLO PAGO VIGENTE por expediente (antes: un solo pago, punto)
-- ---------------------------------------------------------------------
drop index uq_pagos_registro;
create unique index uq_pagos_registro on pagos (registro_id) where devuelto_en is null;


-- ---------------------------------------------------------------------
-- 3. CORTES: la salida de dinero tambien se corta
-- ---------------------------------------------------------------------
alter table cortes_caja
    add column total_devuelto        numeric(12,2) not null default 0,
    add column cantidad_devoluciones integer       not null default 0;

-- Un corte puede no traer cobros si lo unico que paso fue una devolucion.
alter table cortes_caja drop constraint corte_con_pagos;
alter table cortes_caja add constraint corte_con_movimientos
    check (cantidad_pagos + cantidad_devoluciones > 0);

-- Lo esperado puede quedar en negativo: devolver mas de lo que se cobro en el
-- periodo significa que el dinero salio de un efectivo ya entregado. No se
-- prohibe —la devolucion ya ocurrio— pero la diferencia contra lo contado
-- obliga a escribir observaciones (corte_diferencia_explicada), y eso es lo
-- que el contador necesita leer.
alter table cortes_caja drop constraint corte_total_no_negativo;
alter table cortes_caja add constraint corte_devuelto_no_negativo
    check (total_devuelto >= 0 and cantidad_devoluciones >= 0);

comment on column cortes_caja.total_esperado is
    'Efectivo que debe haber: lo cobrado menos lo devuelto en el periodo (bloque 85). Antes del 85 era solo lo cobrado, y como entonces no habia devoluciones es la misma cifra.';
comment on column cortes_caja.total_devuelto is 'Suma de las devoluciones selladas por este corte (bloque 85).';


-- ---------------------------------------------------------------------
-- 4. MOVIMIENTOS: el tipo 'devolucion' (la lista es la del bloque 76)
-- ---------------------------------------------------------------------
alter table movimientos drop constraint mov_tipo_valido;
alter table movimientos add constraint mov_tipo_valido
    check (tipo = any (array['alta', 'baja', 'reposicion', 'cambio',
                             'prueba', 'bloqueo', 'rectificacion', 'validacion',
                             'devolucion']));


-- ---------------------------------------------------------------------
-- 5. «TIENE PAGO» PASA A SER «TIENE PAGO VIGENTE»
--    Extraidas del volcado del 29-sep, con su delta marcado NUEVO 85.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."registrar_pago"("p_registro_id" "uuid", "p_monto" numeric, "p_cobrado_por" "text" DEFAULT NULL::"text", "p_tipo_usuario" "text" DEFAULT NULL::"text", "p_parentesco_otro" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
begin
    perform panel_exigir_rol(array['admin']);

    -- La identidad del cobrador es la de la sesion. No hay respaldo tecleado:
    -- si el JWT no trae correo, no hay cobro.
    v_quien := nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '');
    if v_quien is null then
        raise exception 'No se pudo identificar al cobrador desde la sesion. Cierre sesion y vuelva a entrar.';
    end if;

    -- Serializa dos intentos simultaneos sobre el mismo expediente.
    select estado, tipo_usuario, usuario_es_menor, parentesco_otro   -- NUEVO 63: parentesco_otro
      into v_estado, v_tipo_actual, v_es_menor, v_parentesco_actual
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

    -- NUEVO 85: solo el pago VIGENTE impide cobrar. Uno devuelto ya no cuenta,
    -- y por eso el expediente se puede volver a cobrar.
    select folio_recibo
      into v_folio
      from pagos
     where registro_id = p_registro_id
       and devuelto_en is null;

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

CREATE OR REPLACE FUNCTION "public"."instalar_tag"("p_registro_id" "uuid", "p_no_dispositivo" "text", "p_instalado_por" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
    v_estado text;
    v_tag_actual text;
    v_tag text;
    v_dup_folio text;
    v_quien text;   -- NUEVO 68
begin
    perform panel_exigir_rol(array['ti']);

    -- NUEVO 68: quien instala es quien tiene la sesion. No hay respaldo
    -- tecleado: si el JWT no trae correo, no hay instalacion.
    v_quien := nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '');
    if v_quien is null then
        raise exception 'No se pudo identificar a quien instala desde la sesion. Cierre sesion y vuelva a entrar.';
    end if;

    -- NUEVO 85: con candado. devolver_pago toma el mismo, asi que una
    -- devolucion y una instalacion simultaneas del mismo expediente se forman
    -- en fila y la segunda ve lo que dejo la primera.
    select estado, no_dispositivo into v_estado, v_tag_actual
      from registros where id = p_registro_id
       for update;
    if v_estado is null then
        raise exception 'Registro no encontrado';
    end if;
    -- El orden de estas tres guardas importa: 'baja' va primero para no
    -- mandar a TI a actualizar_registro, que tambien rechaza los de baja.
    if v_estado = 'baja' then
        raise exception 'El registro esta dado de baja';
    end if;
    if v_tag_actual is not null then
        raise exception 'El registro ya tiene el TAG % instalado: use "Actualizar datos" para reponerlo', v_tag_actual;
    end if;
    if v_estado <> 'pendiente' then
        raise exception 'Solo se instala TAG en registros pendientes (este esta en %)', v_estado;
    end if;

    v_tag := btrim(coalesce(p_no_dispositivo,''));
    if v_tag !~ '^[0-9]{6,11}$' then
        raise exception 'El No. de TAG debe tener de 6 a 11 digitos';
    end if;

    -- NUEVO 85: un pago devuelto no cuenta como pago.
    if not exists (select 1 from pagos p where p.registro_id = p_registro_id and p.devuelto_en is null) then
        raise exception 'El registro no tiene un pago vigente: el TAG se instala despues del pago';
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
               -- NUEVO 68: la fecha en hora de Queretaro (current_date va en
               -- UTC), la hora real y la identidad de la sesion.
               fecha_instalacion   = (now() at time zone 'America/Mexico_City')::date,
               instalado_en        = now(),
               instalado_por       = v_quien,
               instalado_por_uid   = auth.uid(),
               instalado_por_email = v_quien
         where id = p_registro_id;
    exception when unique_violation then
        -- Carrera contra otra instalacion simultanea del mismo numero.
        raise exception 'El TAG % ya esta activo en otro registro', v_tag;
    end;

    return jsonb_build_object('id', p_registro_id);
end;
$_$;

CREATE OR REPLACE FUNCTION "public"."tg_pagos_avisar_chat_ti"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
    v_estado text;
    v_tag    text;
    v_total  int;
    v_error  text;
begin
    begin
        select r.estado, r.no_dispositivo
          into v_estado, v_tag
          from public.registros r
         where r.id = new.registro_id;

        -- Un pago de un registro que no queda en la cola de TI (ya tiene TAG
        -- o no esta pendiente) no cambia nada de lo que TI tiene que hacer.
        if v_estado is distinct from 'pendiente' or v_tag is not null then
            return new;
        end if;

        select count(*)
          into v_total
          from public.registros r
         where r.estado = 'pendiente'
           and r.no_dispositivo is null
           -- NUEVO 85: un pago devuelto no deja nada por instalar.
           and exists (select 1 from public.pagos p where p.registro_id = r.id and p.devuelto_en is null);

        if v_total > 0 then
            -- Cada mensaje del webhook abre su propio hilo en el espacio: quien
            -- vaya a instalar lo reclama respondiendo en ese hilo (pedido de
            -- Gerardo, 15-sep). Un webhook no puede crear tareas del espacio
            -- ni botones que anoten quien va; eso exigiria una app de Chat.
            perform public.avisar_chat_ti(
                '*SATAG:* se registró un pago. Hay ' || v_total
                || case when v_total = 1 then ' TAG por instalar.' else ' TAGs por instalar.' end
                || ' Quien vaya a instalar, responda *Voy yo* en este hilo.'
                || ' <https://satag.asuncionqro.edu.mx/admin/|Abra el panel>'
            );
        end if;
    exception when others then
        v_error := left(sqlstate || ' ' || sqlerrm, 300);
        raise warning 'SATAG aviso a Chat: fallo el disparador (%). El cobro no se afecta.', v_error;
        begin
            insert into public.parametros (clave, valor, actualizado_en)
            values ('aviso_chat_ti_ultimo_error', 'disparador: ' || v_error, now())
            on conflict (clave) do update
               set valor = excluded.valor, actualizado_en = excluded.actualizado_en;
        exception when others then
            null;
        end;
    end;
    return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."recordar_chat_ti"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
    v_disponibles int;
    v_pendientes  int;
    v_error       text;
begin
    begin
        select count(*)
          into v_disponibles
          from public.inventario_tags i
         where i.asignado_a is null;

        select count(*)
          into v_pendientes
          from public.registros r
         where r.estado = 'pendiente'
           and r.no_dispositivo is null
           -- NUEVO 85: un pago devuelto no deja nada por instalar.
           and exists (select 1 from public.pagos p where p.registro_id = r.id and p.devuelto_en is null);

        perform public.avisar_chat_ti(
            '*SATAG · lunes de instalación:*'
            || chr(10) || 'TAGs disponibles para instalar: ' || v_disponibles
            || chr(10) || 'Cobrados y por instalar: ' || v_pendientes
            || case when v_disponibles = 0
                    then chr(10) || 'No hay TAGs disponibles: dé de alta TAGs en el inventario antes de instalar.'
                    else '' end
            || chr(10) || '<https://satag.asuncionqro.edu.mx/admin/|Abra el panel>'
        );
    exception when others then
        -- Mismo criterio del 66: el error queda a la vista en parametros.
        v_error := left(sqlstate || ' ' || sqlerrm, 300);
        raise warning 'SATAG recordatorio a Chat: fallo (%).', v_error;
        begin
            insert into public.parametros (clave, valor, actualizado_en)
            values ('aviso_chat_ti_ultimo_error', 'recordatorio: ' || v_error, now())
            on conflict (clave) do update
               set valor = excluded.valor, actualizado_en = excluded.actualizado_en;
        exception when others then
            null;
        end;
    end;
end;
$$;

-- La vista, extraida del bloque 81: el cruce con pagos solo toma el vigente.
-- Sin el filtro, un expediente devuelto y vuelto a cobrar saldria dos veces.
create or replace view v_registros_incompletos
with (security_invoker = true) as
WITH base AS (
         SELECT r.id,
            r.folio,
            r.usuario_nombre_completo,
            r.gestionante_nombre_completo,
            r.tipo_usuario,
            r.marca,
            r.modelo,
            r.color,
            r.placas,
            r.sin_placas,
            r.no_dispositivo,
            r.procedencia_tag,
            r.estado,
            r.origen_expediente,
            r.created_at,
            p.folio_recibo,
            p.created_at AS pago_created_at,
            (now() AT TIME ZONE 'America/Mexico_City'::text)::date - (r.created_at AT TIME ZONE 'America/Mexico_City'::text)::date AS dias_desde_alta,
            (now() AT TIME ZONE 'America/Mexico_City'::text)::date - (p.created_at AT TIME ZONE 'America/Mexico_City'::text)::date AS dias_desde_pago,
            (EXISTS ( SELECT 1
                   FROM registro_estacionamientos re
                  WHERE re.registro_id = r.id)) AS tiene_estacionamiento
           FROM registros r
             LEFT JOIN pagos p ON p.registro_id = r.id AND p.devuelto_en IS NULL
          WHERE r.estado <> 'baja'::text::text
        ), evaluado AS (
         SELECT b.id,
            b.folio,
            b.usuario_nombre_completo,
            b.gestionante_nombre_completo,
            b.tipo_usuario,
            b.marca,
            b.modelo,
            b.color,
            b.placas,
            b.sin_placas,
            b.no_dispositivo,
            b.procedencia_tag,
            b.estado,
            b.origen_expediente,
            b.created_at,
            b.folio_recibo,
            b.pago_created_at,
            b.dias_desde_alta,
            b.dias_desde_pago,
            b.tiene_estacionamiento,
            array_remove(ARRAY[
                CASE
                    WHEN b.origen_expediente = 'satag' AND b.no_dispositivo IS NOT NULL AND b.pago_created_at IS NULL THEN 'tag_sin_pago'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN b.estado = 'activo'::text AND b.no_dispositivo IS NULL THEN 'activo_sin_tag'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN b.no_dispositivo IS NOT NULL AND NOT b.tiene_estacionamiento THEN 'tag_sin_estacionamiento'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN btrim(COALESCE(b.marca, ''::text)) = ''::text OR btrim(COALESCE(b.color, ''::text)) = ''::text THEN 'vehiculo_incompleto'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN b.no_dispositivo IS NOT NULL AND b.sin_placas THEN 'sin_placas'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN b.origen_expediente = 'satag' AND b.pago_created_at IS NULL AND b.dias_desde_alta >= 7 THEN 'sin_pago'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN b.origen_expediente = 'satag' AND b.pago_created_at IS NOT NULL AND b.no_dispositivo IS NULL AND b.dias_desde_pago >= 7 THEN 'sin_instalar'::text
                    ELSE NULL::text
                END], NULL::text) AS motivos
           FROM base b
        )
 SELECT id,
    folio,
    usuario_nombre_completo,
    gestionante_nombre_completo,
    tipo_usuario,
    marca,
    modelo,
    color,
    placas,
    sin_placas,
    no_dispositivo,
    procedencia_tag,
    estado,
    folio_recibo,
    created_at,
    dias_desde_alta,
    dias_desde_pago,
    motivos,
    cardinality(motivos) AS total_motivos
   FROM evaluado e
  WHERE cardinality(motivos) > 0;


-- ---------------------------------------------------------------------
-- 6. LA CAJA CUENTA LO QUE SALE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."estado_caja"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    v_zona          text := 'America/Mexico_City';
    v_total         numeric(12,2);
    v_cantidad      integer;
    v_dias          integer;
    v_primero       timestamptz;
    v_desglose      jsonb;
    v_ultimo_corte  timestamptz;
    v_mes           numeric(12,2);
    v_historico     numeric(12,2);
    v_devuelto      numeric(12,2);  -- NUEVO 85
    v_devoluciones  integer;        -- NUEVO 85
begin
    -- NUEVO 74: el contador tambien LEE el estado de la caja. Administracion
    -- lo conserva: necesita saber cuanto efectivo deberia haber para
    -- conciliar, y la guia del personal se lo indica expresamente.
    perform panel_exigir_rol(array['admin','contador']);

    select coalesce(sum(monto), 0),
           count(*)
      into v_total, v_cantidad
      from pagos
     where corte_id is null;

    -- NUEVO 85: lo devuelto que aun no entra a un corte salio de esta caja.
    select coalesce(sum(monto), 0),
           count(*)
      into v_devuelto, v_devoluciones
      from pagos
     where devuelto_en is not null
       and devolucion_corte_id is null;

    -- NUEVO 85: los dias y el primer movimiento cuentan cobros Y devoluciones,
    -- igual que cortar_caja: los dos salen de la misma caja.
    select count(distinct (t at time zone v_zona)::date),
           min(t)
      into v_dias, v_primero
      from (
          select created_at as t from pagos where corte_id is null
          union all
          select devuelto_en from pagos where devuelto_en is not null and devolucion_corte_id is null
      ) m;

    -- Desglose por dia local: deja ver de golpe que parte del efectivo es de
    -- dias anteriores ya entregados, que es de donde salen los faltantes falsos.
    -- NUEVO 85: cada dia trae sus cobros y sus devoluciones. Las llaves de
    -- siempre (dia, cantidad, subtotal) siguen siendo solo de cobros, asi que el
    -- panel publicado las sigue leyendo igual.
    select jsonb_agg(d order by d ->> 'dia')
      into v_desglose
      from (
          select jsonb_build_object(
                     'dia',          m.dia,
                     'cantidad',     count(*) filter (where m.clase = 'cobro'),
                     'subtotal',     coalesce(sum(m.monto) filter (where m.clase = 'cobro'), 0),
                     'devoluciones', count(*) filter (where m.clase = 'devolucion'),
                     'devuelto',     coalesce(sum(m.monto) filter (where m.clase = 'devolucion'), 0)
                 ) as d
            from (
                select 'cobro' as clase, (created_at at time zone v_zona)::date as dia, monto
                  from pagos
                 where corte_id is null
                union all
                select 'devolucion', (devuelto_en at time zone v_zona)::date, monto
                  from pagos
                 where devuelto_en is not null
                   and devolucion_corte_id is null
            ) m
           group by m.dia
      ) s;

    select max(created_at) into v_ultimo_corte from cortes_caja;

    -- NUEVO 85: lo vendido no incluye lo devuelto: una venta devuelta no fue venta.
    select coalesce(sum(monto), 0)
      into v_mes
      from pagos
     where (created_at at time zone v_zona) >= date_trunc('month', now() at time zone v_zona)
       and devuelto_en is null;

    select coalesce(sum(monto), 0) into v_historico from pagos where devuelto_en is null;

    return jsonb_build_object(
        -- NUEVO 85: totalEnCaja es el efectivo que debe haber, cobrado menos
        -- devuelto. Las otras tres llaves dan el desglose.
        'totalEnCaja',     v_total - v_devuelto,
        'cobradoEnCaja',   v_total,
        'devueltoEnCaja',  v_devuelto,
        'devolucionesEnCaja', v_devoluciones,
        'pagosEnCaja',     v_cantidad,
        'diasDeCobro',     coalesce(v_dias, 0),
        'primerCobro',     v_primero,
        'desglosePorDia',  coalesce(v_desglose, '[]'::jsonb),
        'ultimoCorte',     v_ultimo_corte,
        'vendidoMes',      v_mes,
        'vendidoHistorico', v_historico
    );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."cortar_caja"("p_efectivo_contado" numeric, "p_cortado_por" "text" DEFAULT NULL::"text", "p_observaciones" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
    v_zona       text := 'America/Mexico_City';
    v_corte_id   uuid := gen_random_uuid();
    v_total      numeric(12,2);
    v_cantidad   integer;
    v_dias       integer;
    v_desde      timestamptz;
    v_hasta      timestamptz := now();
    v_desglose   jsonb;
    v_diferencia numeric(12,2);
    v_nombre     text;
    v_folio      text;
    v_cobrado      numeric(12,2);  -- NUEVO 85
    v_devuelto     numeric(12,2);  -- NUEVO 85
    v_devoluciones integer;        -- NUEVO 85
begin
    -- NUEVO 74: cortar es SOLO del contador. Decision de Gerardo del
    -- 17-sep-2026: Administracion pierde cortar_caja.
    --
    -- PRECISION QUE HAY QUE DECIR EN VOZ ALTA, y que el codigo obliga:
    -- panel_exigir_rol hace `return` en seco cuando el rol es 'super', SIN
    -- mirar esta lista (29_rpc_panel.sql:49-51). Asi que lo cortan el
    -- contador Y LAS CUENTAS SUPER. «Solo el contador cierra el corte» no
    -- sera literal mientras existan cuentas super, y prometerlo seria
    -- falso; quitarselo a super exige cambiar panel_exigir_rol, que es otro
    -- alcance y afecta a TODOS los RPC del panel.
    perform panel_exigir_rol(array['contador']);

    -- Serializa dos cortes simultaneos: se forman en fila en vez de competir.
    perform pg_advisory_xact_lock(hashtext('satag:corte_caja'));

    if p_efectivo_contado is null or p_efectivo_contado < 0 then
        raise exception 'El efectivo contado debe ser mayor o igual a cero';
    end if;

    v_nombre := nullif(btrim(coalesce(p_cortado_por, '')), '');
    if v_nombre is null then
        raise exception 'Indique quien realiza el corte';
    end if;

    -- Pre-chequeo: evita quemar un folio de la serie cuando no hay nada que cortar.
    -- NUEVO 85: tambien hay que cortar cuando lo unico pendiente es una devolucion.
    perform 1 from pagos
     where corte_id is null
        or (devuelto_en is not null and devolucion_corte_id is null)
     limit 1;
    if not found then
        raise exception 'No hay cobros ni devoluciones pendientes de cortar: la caja esta en ceros';
    end if;

    -- Fotografia del periodo, antes de sellar.
    -- NUEVO 85: el periodo y sus dias cuentan cobros Y devoluciones.
    select min(t),
           count(distinct (t at time zone v_zona)::date)
      into v_desde, v_dias
      from (
          select created_at as t from pagos where corte_id is null
          union all
          select devuelto_en from pagos where devuelto_en is not null and devolucion_corte_id is null
      ) m;

    -- NUEVO 85: cada dia trae sus cobros y sus devoluciones. Las llaves de
    -- siempre (dia, cantidad, subtotal) siguen siendo solo de cobros, asi que el
    -- panel publicado las sigue leyendo igual.
    select jsonb_agg(d order by d ->> 'dia')
      into v_desglose
      from (
          select jsonb_build_object(
                     'dia',          m.dia,
                     'cantidad',     count(*) filter (where m.clase = 'cobro'),
                     'subtotal',     coalesce(sum(m.monto) filter (where m.clase = 'cobro'), 0),
                     'devoluciones', count(*) filter (where m.clase = 'devolucion'),
                     'devuelto',     coalesce(sum(m.monto) filter (where m.clase = 'devolucion'), 0)
                 ) as d
            from (
                select 'cobro' as clase, (created_at at time zone v_zona)::date as dia, monto
                  from pagos
                 where corte_id is null
                union all
                select 'devolucion', (devuelto_en at time zone v_zona)::date, monto
                  from pagos
                 where devuelto_en is not null
                   and devolucion_corte_id is null
            ) m
           group by m.dia
      ) s;

    -- El sello define el conjunto. La FK diferida permite hacerlo antes de
    -- que exista la fila del corte; se valida al confirmar la transaccion.
    with sellados as (
        update pagos
           set corte_id = v_corte_id
         where corte_id is null
        returning monto
    )
    select coalesce(sum(monto), 0), count(*)
      into v_cobrado, v_cantidad
      from sellados;

    -- NUEVO 85: las devoluciones pendientes se sellan en el MISMO corte. Un pago
    -- cobrado y devuelto dentro del mismo periodo queda en los dos conjuntos y
    -- suma cero, que es lo que paso con el efectivo.
    with devueltos as (
        update pagos
           set devolucion_corte_id = v_corte_id
         where devuelto_en is not null
           and devolucion_corte_id is null
        returning monto
    )
    select coalesce(sum(monto), 0), count(*)
      into v_devuelto, v_devoluciones
      from devueltos;

    -- NUEVO 85: lo esperado es el efectivo que debe haber: cobrado menos devuelto.
    v_total := v_cobrado - v_devuelto;

    -- Respaldo real ante concurrencia: si otro corte se adelanto, aqui se
    -- sellaron 0 filas. Sin esto quedaria un corte fantasma en cero cuyo
    -- efectivo contado se registraria como sobrante inexistente.
    if v_cantidad + v_devoluciones = 0 then  -- NUEVO 85
        raise exception 'No hay cobros ni devoluciones pendientes de cortar: la caja esta en ceros';
    end if;

    v_diferencia := p_efectivo_contado - v_total;

    -- Una diferencia sin explicar es un documento contable inutil: dentro de
    -- un mes nadie recordara por que no cuadro.
    if v_diferencia <> 0 and btrim(coalesce(p_observaciones, '')) = '' then
        raise exception 'Explique la diferencia de $% antes de cerrar el corte',
            to_char(abs(v_diferencia), 'FM999999990.00');
    end if;

    -- Un corte que arrastra varios dias de cobro suele mezclar efectivo ya
    -- entregado: se exige dejarlo por escrito mientras se recuerda.
    if v_dias > 1 and btrim(coalesce(p_observaciones, '')) = '' then
        raise exception 'Este corte abarca cobros de % dias: explique en observaciones si ya entrego efectivo de dias anteriores', v_dias;
    end if;

    insert into cortes_caja (
        id, cortado_por, cortado_por_uid, cortado_por_email,
        periodo_desde, periodo_hasta,
        total_esperado, cantidad_pagos, dias_de_cobro, desglose_por_dia,
        efectivo_contado, observaciones,
        total_devuelto, cantidad_devoluciones           -- NUEVO 85
    )
    values (
        v_corte_id, v_nombre, auth.uid(), auth.jwt() ->> 'email',
        v_desde, v_hasta,
        v_total, v_cantidad, coalesce(v_dias, 1), v_desglose,
        p_efectivo_contado, nullif(btrim(coalesce(p_observaciones, '')), ''),
        v_devuelto, v_devoluciones                      -- NUEVO 85
    )
    returning folio_corte into v_folio;

    return jsonb_build_object(
        'id', v_corte_id,
        'folioCorte', v_folio,
        'totalEsperado', v_total,
        'efectivoContado', p_efectivo_contado,
        'diferencia', v_diferencia,
        'pagosCortados', v_cantidad,
        'totalCobrado', v_cobrado,                -- NUEVO 85
        'totalDevuelto', v_devuelto,              -- NUEVO 85
        'devolucionesCortadas', v_devoluciones,   -- NUEVO 85
        'diasDeCobro', coalesce(v_dias, 1)
    );
end;
$_$;

CREATE OR REPLACE FUNCTION "public"."pagos_congelar_sellado"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    if old.corte_id is not null and (
           new.monto        is distinct from old.monto
        or new.cobrado_por  is distinct from old.cobrado_por
        or new.folio_recibo is distinct from old.folio_recibo
        or new.corte_id     is distinct from old.corte_id
    ) then
        raise exception 'El pago % ya fue cortado y no admite cambios', coalesce(old.folio_recibo, old.id::text);
    end if;
    -- NUEVO 85: una devolucion registrada no se deshace ni se reescribe, este
    -- cortada o no. Y una devolucion cortada no cambia de corte.
    if old.devuelto_en is not null and (
           new.monto              is distinct from old.monto
        or new.devuelto_en        is distinct from old.devuelto_en
        or new.devuelto_por       is distinct from old.devuelto_por
        or new.devuelto_por_uid   is distinct from old.devuelto_por_uid
        or new.devuelto_por_email is distinct from old.devuelto_por_email
        or new.devolucion_motivo  is distinct from old.devolucion_motivo
    ) then
        raise exception 'La devolucion del pago % ya esta registrada y no admite cambios', coalesce(old.folio_recibo, old.id::text);
    end if;
    if old.devolucion_corte_id is not null
       and new.devolucion_corte_id is distinct from old.devolucion_corte_id then
        raise exception 'La devolucion del pago % ya fue cortada y no admite cambios', coalesce(old.folio_recibo, old.id::text);
    end if;
    return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 7. LA DEVOLUCION
-- ---------------------------------------------------------------------
create function devolver_pago(
    p_registro_id  uuid,
    p_motivo       text,
    p_folio_recibo text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $devolver$
declare
    v_quien   text;
    v_motivo  text;
    v_folio   text;
    v_estado  text;
    v_tag     text;
    v_inst    timestamptz;
    v_pago    uuid;
    v_recibo  text;
    v_monto   numeric(8,2);
    v_cortado boolean;
    v_cola    int;
    v_error   text;
begin
    perform panel_exigir_rol(array['admin']);

    -- Quien devuelve es quien tiene la sesion, igual que quien cobra (bloque 50).
    v_quien := nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '');
    if v_quien is null then
        raise exception 'No se pudo identificar a quien devuelve desde la sesion. Cierre sesion y vuelva a entrar.';
    end if;

    -- El motivo es lo unico que se pide, y es lo que leera el contador.
    v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
    if v_motivo is null then
        raise exception 'Escriba el motivo de la devolucion: queda en el expediente y en el corte.';
    end if;
    if length(v_motivo) > 500 then
        raise exception 'El motivo es demasiado largo (maximo 500 caracteres).';
    end if;

    -- Contra un corte en curso: la devolucion espera a que el corte termine, o
    -- el corte a que termine ella. Sin esto, un corte podria sellarla con un
    -- desglose calculado antes de que existiera.
    perform pg_advisory_xact_lock(hashtext('satag:corte_caja'));

    -- El mismo candado que instalar_tag (NUEVO 85 en las dos).
    select folio, estado, no_dispositivo, instalado_en
      into v_folio, v_estado, v_tag, v_inst
      from registros
     where id = p_registro_id
       for update;
    if not found then
        raise exception 'Registro no encontrado';
    end if;

    -- EL UNICO FILTRO: que el TAG no se haya instalado. Instalado, el dinero ya
    -- compro algo que esta en el coche, y eso es otra conversacion.
    if v_tag is not null or v_inst is not null then
        raise exception 'El expediente % ya tiene TAG instalado: la devolucion solo procede antes de instalar.', v_folio;
    end if;

    select id, folio_recibo, monto, corte_id is not null
      into v_pago, v_recibo, v_monto, v_cortado
      from pagos
     where registro_id = p_registro_id
       and devuelto_en is null
       for update;
    if not found then
        raise exception 'El expediente % no tiene un pago vigente que devolver.', v_folio;
    end if;

    -- Se devuelve el recibo que la cajera vio y confirmo, no «el pago vigente
    -- de ahora». Si mientras tanto otra sesion devolvio y volvio a cobrar, el
    -- vigente es otro: devolverlo seria sacar dinero de un cobro que nadie vio,
    -- y una devolucion no se deshace.
    if v_recibo is distinct from nullif(btrim(coalesce(p_folio_recibo, '')), '') then
        raise exception 'El pago vigente de % ya no es el recibo %: actualice la pantalla y revise antes de devolver.',
            v_folio, coalesce(nullif(btrim(p_folio_recibo), ''), '(sin recibo)');
    end if;

    update pagos
       set devuelto_en        = now(),
           devuelto_por       = v_quien,
           devuelto_por_uid   = auth.uid(),
           devuelto_por_email = v_quien,
           devolucion_motivo  = v_motivo
     where id = v_pago;

    -- La fecha de adquisicion la puso el cobro (registrar_pago); sin cobro
    -- vigente no hay adquisicion. Si se vuelve a cobrar, se pone la nueva.
    update registros
       set fecha_adquisicion = null
     where id = p_registro_id;

    -- La fecha, en hora de Queretaro: current_date va en UTC y despues de las
    -- 18:00 pondria el dia siguiente (lo mismo que corrigio el bloque 68).
    insert into movimientos (registro_id, tipo, motivo, hecho_por, fecha)
    values (
        p_registro_id, 'devolucion',
        'Devolucion del pago ' || v_recibo || ' por $' || to_char(v_monto, 'FM999990.00')
            || case when v_cortado then ' (ya estaba cortado: sale en el corte siguiente)' else '' end
            || '. Motivo: ' || v_motivo,
        v_quien,
        (now() at time zone 'America/Mexico_City')::date
    );

    -- Aviso a TI, solo si el expediente estaba en su cola. Mismo criterio que
    -- el disparador del 66: el aviso nunca tumba la devolucion.
    if v_estado = 'pendiente' then
        begin
            select count(*)
              into v_cola
              from registros r
             where r.estado = 'pendiente'
               and r.no_dispositivo is null
               and exists (select 1 from pagos p where p.registro_id = r.id and p.devuelto_en is null);
            perform avisar_chat_ti(
                '*SATAG:* Administración devolvió el pago del expediente ' || v_folio
                || '. Ya no se instala hasta que vuelva a pagar. Quedan ' || v_cola
                || case when v_cola = 1 then ' TAG por instalar.' else ' TAGs por instalar.' end
                || ' <https://satag.asuncionqro.edu.mx/admin/|Abra el panel>'
            );
        exception when others then
            v_error := left(sqlstate || ' ' || sqlerrm, 300);
            raise warning 'SATAG aviso a Chat: fallo el aviso de la devolucion (%). La devolucion no se afecta.', v_error;
            begin
                insert into parametros (clave, valor, actualizado_en)
                values ('aviso_chat_ti_ultimo_error', 'devolucion: ' || v_error, now())
                on conflict (clave) do update
                   set valor = excluded.valor, actualizado_en = excluded.actualizado_en;
            exception when others then
                null;
            end;
        end;
    end if;

    return jsonb_build_object(
        'id',          p_registro_id,
        'folio',       v_folio,
        'folioRecibo', v_recibo,
        'monto',       v_monto,
        'yaCortado',   v_cortado
    );
end;
$devolver$;

revoke all     on function devolver_pago(uuid, text, text) from public, anon;
grant  execute on function devolver_pago(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;


-- ---------------------------------------------------------------------
-- 8. VERIFICACION (solo lectura). Once filas con ok = true.
-- ---------------------------------------------------------------------
select 1 as orden, 'pagos tiene las seis columnas de devolucion' as que,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'pagos'
           and column_name in ('devuelto_en', 'devuelto_por', 'devuelto_por_uid',
                               'devuelto_por_email', 'devolucion_motivo', 'devolucion_corte_id')) = 6 as ok
union all
select 2, 'uq_pagos_registro solo cuenta pagos vigentes',
       exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'uq_pagos_registro'
                  and indexdef like '%WHERE (devuelto_en IS NULL)%')
union all
select 3, 'devolver_pago: security definer, anon no la ejecuta, authenticated si',
       exists (select 1 from pg_proc where proname = 'devolver_pago' and prosecdef)
       and not has_function_privilege('anon', 'devolver_pago(uuid, text, text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'devolver_pago(uuid, text, text)', 'EXECUTE')
union all
select 4, 'una sola version de cada funcion tocada, y estan las ocho',
       (select bool_and(n = 1) and count(*) = 8 from (
            select p.proname, count(*) as n
              from pg_proc p join pg_namespace s on s.oid = p.pronamespace
             where s.nspname = 'public'
               and p.proname in ('registrar_pago', 'instalar_tag', 'cortar_caja', 'estado_caja',
                                 'tg_pagos_avisar_chat_ti', 'recordar_chat_ti', 'pagos_congelar_sellado', 'devolver_pago')
             group by p.proname) x)
union all
select 5, 'cobro, instalacion y avisos ya ignoran los pagos devueltos',
       (select bool_and(prosrc like '%devuelto_en is null%') from pg_proc
         where proname in ('registrar_pago', 'instalar_tag', 'tg_pagos_avisar_chat_ti', 'recordar_chat_ti'))
union all
select 6, 'estado_caja y cortar_caja cuentan las devoluciones',
       (select bool_and(prosrc like '%devolucion_corte_id is null%') from pg_proc
         where proname in ('estado_caja', 'cortar_caja'))
union all
select 7, 'la vista de incompletos solo cruza el pago vigente',
       pg_get_viewdef('public.v_registros_incompletos'::regclass) like '%devuelto_en IS NULL%'
union all
select 8, 'movimientos admite devolucion y conserva validacion',
       (select pg_get_constraintdef(oid) like '%devolucion%' and pg_get_constraintdef(oid) like '%validacion%'
          from pg_constraint where conname = 'mov_tipo_valido')
union all
select 9, 'cortes_caja: columnas nuevas y el CHECK que admite cortes de solo devoluciones',
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'cortes_caja'
           and column_name in ('total_devuelto', 'cantidad_devoluciones')) = 2
       and exists (select 1 from pg_constraint where conname = 'corte_con_movimientos')
       and not exists (select 1 from pg_constraint where conname in ('corte_con_pagos', 'corte_total_no_negativo'))
union all
select 10, 'ningun mensaje nuevo tutea',
       (select prosrc !~* '\m(tu|tus|elige|escribe|reintenta|verifica)\M' from pg_proc where proname = 'devolver_pago')
union all
select 11, 'no se toco ningun dato: cero pagos devueltos',
       not exists (select 1 from pagos where devuelto_en is not null)
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). SOLO si no se ha registrado ninguna devolucion: con
-- una registrada, deshacer el bloque borraria el rastro de dinero que salio.
--
-- ANTES DE NADA: si el panel nuevo ya esta publicado, revierta primero el
-- deploy y confirme con `npm run publicado` que la marca p_folio_recibo YA NO
-- esta. Ese panel pide devuelto_en, total_devuelto y devolver_pago: sin ellos
-- la lista de expedientes (todos los roles) y Finanzas responden 400.
-- Las definiciones de abajo son las del volcado del 29-sep y la vista del 81,
-- tal cual se extrajeron.
-- ---------------------------------------------------------------------
-- begin;
-- do $r$ begin
--     if exists (select 1 from pagos where devuelto_en is not null) then
--         raise exception 'Hay devoluciones registradas: el rollback borraria su rastro. No se deshizo nada.';
--     end if;
-- end $r$;
-- drop function devolver_pago(uuid, text, text);
-- create or replace view v_registros_incompletos
-- with (security_invoker = true) as
-- WITH base AS (
--          SELECT r.id,
--             r.folio,
--             r.usuario_nombre_completo,
--             r.gestionante_nombre_completo,
--             r.tipo_usuario,
--             r.marca,
--             r.modelo,
--             r.color,
--             r.placas,
--             r.sin_placas,
--             r.no_dispositivo,
--             r.procedencia_tag,
--             r.estado,
--             r.origen_expediente,
--             r.created_at,
--             p.folio_recibo,
--             p.created_at AS pago_created_at,
--             (now() AT TIME ZONE 'America/Mexico_City'::text)::date - (r.created_at AT TIME ZONE 'America/Mexico_City'::text)::date AS dias_desde_alta,
--             (now() AT TIME ZONE 'America/Mexico_City'::text)::date - (p.created_at AT TIME ZONE 'America/Mexico_City'::text)::date AS dias_desde_pago,
--             (EXISTS ( SELECT 1
--                    FROM registro_estacionamientos re
--                   WHERE re.registro_id = r.id)) AS tiene_estacionamiento
--            FROM registros r
--              LEFT JOIN pagos p ON p.registro_id = r.id
--           WHERE r.estado <> 'baja'::text::text
--         ), evaluado AS (
--          SELECT b.id,
--             b.folio,
--             b.usuario_nombre_completo,
--             b.gestionante_nombre_completo,
--             b.tipo_usuario,
--             b.marca,
--             b.modelo,
--             b.color,
--             b.placas,
--             b.sin_placas,
--             b.no_dispositivo,
--             b.procedencia_tag,
--             b.estado,
--             b.origen_expediente,
--             b.created_at,
--             b.folio_recibo,
--             b.pago_created_at,
--             b.dias_desde_alta,
--             b.dias_desde_pago,
--             b.tiene_estacionamiento,
--             array_remove(ARRAY[
--                 CASE
--                     WHEN b.origen_expediente = 'satag' AND b.no_dispositivo IS NOT NULL AND b.pago_created_at IS NULL THEN 'tag_sin_pago'::text
--                     ELSE NULL::text
--                 END,
--                 CASE
--                     WHEN b.estado = 'activo'::text AND b.no_dispositivo IS NULL THEN 'activo_sin_tag'::text
--                     ELSE NULL::text
--                 END,
--                 CASE
--                     WHEN b.no_dispositivo IS NOT NULL AND NOT b.tiene_estacionamiento THEN 'tag_sin_estacionamiento'::text
--                     ELSE NULL::text
--                 END,
--                 CASE
--                     WHEN btrim(COALESCE(b.marca, ''::text)) = ''::text OR btrim(COALESCE(b.color, ''::text)) = ''::text THEN 'vehiculo_incompleto'::text
--                     ELSE NULL::text
--                 END,
--                 CASE
--                     WHEN b.no_dispositivo IS NOT NULL AND b.sin_placas THEN 'sin_placas'::text
--                     ELSE NULL::text
--                 END,
--                 CASE
--                     WHEN b.origen_expediente = 'satag' AND b.pago_created_at IS NULL AND b.dias_desde_alta >= 7 THEN 'sin_pago'::text
--                     ELSE NULL::text
--                 END,
--                 CASE
--                     WHEN b.origen_expediente = 'satag' AND b.pago_created_at IS NOT NULL AND b.no_dispositivo IS NULL AND b.dias_desde_pago >= 7 THEN 'sin_instalar'::text
--                     ELSE NULL::text
--                 END], NULL::text) AS motivos
--            FROM base b
--         )
--  SELECT id,
--     folio,
--     usuario_nombre_completo,
--     gestionante_nombre_completo,
--     tipo_usuario,
--     marca,
--     modelo,
--     color,
--     placas,
--     sin_placas,
--     no_dispositivo,
--     procedencia_tag,
--     estado,
--     folio_recibo,
--     created_at,
--     dias_desde_alta,
--     dias_desde_pago,
--     motivos,
--     cardinality(motivos) AS total_motivos
--    FROM evaluado e
--   WHERE cardinality(motivos) > 0;
--
-- CREATE OR REPLACE FUNCTION "public"."registrar_pago"("p_registro_id" "uuid", "p_monto" numeric, "p_cobrado_por" "text" DEFAULT NULL::"text", "p_tipo_usuario" "text" DEFAULT NULL::"text", "p_parentesco_otro" "text" DEFAULT NULL::"text") RETURNS "jsonb"
--     LANGUAGE "plpgsql" SECURITY DEFINER
--     SET "search_path" TO 'public'
--     AS $$
-- declare
--     v_estado            text;
--     v_tipo_actual       text;
--     v_es_menor          boolean;
--     v_tipo              text;
--     v_quien             text;
--     v_folio             text;
--     v_corregido         boolean := false;
--     v_parentesco_actual text;               -- NUEVO 63
--     v_parentesco        text;               -- NUEVO 63
-- begin
--     perform panel_exigir_rol(array['admin']);
--
--     -- La identidad del cobrador es la de la sesion. No hay respaldo tecleado:
--     -- si el JWT no trae correo, no hay cobro.
--     v_quien := nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '');
--     if v_quien is null then
--         raise exception 'No se pudo identificar al cobrador desde la sesion. Cierre sesion y vuelva a entrar.';
--     end if;
--
--     -- Serializa dos intentos simultaneos sobre el mismo expediente.
--     select estado, tipo_usuario, usuario_es_menor, parentesco_otro   -- NUEVO 63: parentesco_otro
--       into v_estado, v_tipo_actual, v_es_menor, v_parentesco_actual
--       from registros
--      where id = p_registro_id
--        for update;
--
--     if not found then
--         raise exception 'Registro no encontrado';
--     end if;
--     if v_estado = 'baja' then
--         raise exception 'El registro esta dado de baja';
--     end if;
--     if p_monto is null or p_monto <= 0 then
--         raise exception 'El monto debe ser mayor a cero';
--     end if;
--
--     -- ---- Validacion del tipo de usuario (CC-05) ----
--     v_tipo := nullif(btrim(coalesce(p_tipo_usuario, '')), '');
--     if v_tipo is null then
--         raise exception 'Confirme el tipo de usuario antes de cobrar (maestro, padres, alumno, admin u otro)';
--     end if;
--     -- NUEVO 63: quinto tipo, aqui y en los dos mensajes.
--     if v_tipo not in ('maestro', 'padres', 'alumno', 'admin', 'otro') then
--         raise exception 'Tipo de usuario invalido: % (maestro, padres, alumno, admin u otro)', v_tipo;
--     end if;
--     if v_es_menor and v_tipo <> 'alumno' then
--         raise exception 'El titular es menor de edad: su tipo debe ser alumno';
--     end if;
--
--     -- NUEVO 63: antes del insert en pagos, no despues. Un rechazo posterior
--     -- revertiria el pago pero quemaria el numero de la secuencia del recibo,
--     -- que no se revierte (el mismo dano que describe el bloque 58).
--     v_parentesco := nullif(btrim(coalesce(p_parentesco_otro, '')), '');
--     if v_tipo = 'otro'
--        and coalesce(v_parentesco, nullif(btrim(coalesce(v_parentesco_actual, '')), '')) is null then
--         raise exception 'Capture el parentesco del titular con la familia (tio, abuelo, etcetera) antes de cobrar: es obligatorio cuando el tipo de usuario es otro';
--     end if;
--
--     select folio_recibo
--       into v_folio
--       from pagos
--      where registro_id = p_registro_id;
--
--     if found then
--         raise exception 'El registro ya tiene el pago % registrado', v_folio;
--     end if;
--
--     insert into pagos (registro_id, monto, cobrado_por, cobrado_por_uid, cobrado_por_email)
--     values (
--         p_registro_id,
--         p_monto,
--         v_quien,
--         auth.uid(),
--         v_quien
--     )
--     returning folio_recibo into v_folio;
--
--     if v_tipo is distinct from v_tipo_actual then
--         update registros set tipo_usuario = v_tipo where id = p_registro_id;
--         insert into movimientos (registro_id, tipo, motivo, hecho_por)
--         values (
--             p_registro_id, 'cambio',
--             'Tipo de usuario: ' || v_tipo_actual || ' -> ' || v_tipo
--                 || ' (validado al cobrar)',
--             v_quien
--         );
--         v_corregido := true;
--     end if;
--
--     -- NUEVO 63: el parentesco solo se escribe cuando el tipo confirmado es
--     -- 'otro'. Si llega con cualquier otro tipo se ignora: la columna
--     -- describe al familiar de tipo 'otro', y guardarla en un maestro o en
--     -- un padre dejaria un dato que ninguna regla sostiene.
--     -- La aceptacion NO se toca: su payload sellado conserva lo que el
--     -- titular declaro al firmar, y este movimiento es el que documenta que
--     -- la escuela lo corrigio despues.
--     if v_tipo = 'otro'
--        and v_parentesco is not null
--        and v_parentesco is distinct from v_parentesco_actual then
--         update registros set parentesco_otro = v_parentesco where id = p_registro_id;
--         insert into movimientos (registro_id, tipo, motivo, hecho_por)
--         values (
--             p_registro_id, 'cambio',
--             'Parentesco: ' || coalesce(v_parentesco_actual, '(sin dato)') || ' -> ' || v_parentesco
--                 || ' (validado al cobrar)',
--             v_quien
--         );
--     end if;
--
--     update registros
--        set fecha_adquisicion = coalesce(fecha_adquisicion, current_date),
--            tipo_validado     = true,
--            tipo_validado_por = v_quien,
--            tipo_validado_en  = now()
--      where id = p_registro_id;
--
--     return jsonb_build_object(
--         'id', p_registro_id,
--         'folioRecibo', v_folio,
--         'tipoUsuario', v_tipo,
--         'tipoCorregido', v_corregido,
--         'tipoAnterior', case when v_corregido then v_tipo_actual else null end
--     );
-- end;
-- $$;
--
-- CREATE OR REPLACE FUNCTION "public"."instalar_tag"("p_registro_id" "uuid", "p_no_dispositivo" "text", "p_instalado_por" "text" DEFAULT NULL::"text") RETURNS "jsonb"
--     LANGUAGE "plpgsql" SECURITY DEFINER
--     SET "search_path" TO 'public'
--     AS $_$
-- declare
--     v_estado text;
--     v_tag_actual text;
--     v_tag text;
--     v_dup_folio text;
--     v_quien text;   -- NUEVO 68
-- begin
--     perform panel_exigir_rol(array['ti']);
--
--     -- NUEVO 68: quien instala es quien tiene la sesion. No hay respaldo
--     -- tecleado: si el JWT no trae correo, no hay instalacion.
--     v_quien := nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '');
--     if v_quien is null then
--         raise exception 'No se pudo identificar a quien instala desde la sesion. Cierre sesion y vuelva a entrar.';
--     end if;
--
--     select estado, no_dispositivo into v_estado, v_tag_actual
--       from registros where id = p_registro_id;
--     if v_estado is null then
--         raise exception 'Registro no encontrado';
--     end if;
--     -- El orden de estas tres guardas importa: 'baja' va primero para no
--     -- mandar a TI a actualizar_registro, que tambien rechaza los de baja.
--     if v_estado = 'baja' then
--         raise exception 'El registro esta dado de baja';
--     end if;
--     if v_tag_actual is not null then
--         raise exception 'El registro ya tiene el TAG % instalado: use "Actualizar datos" para reponerlo', v_tag_actual;
--     end if;
--     if v_estado <> 'pendiente' then
--         raise exception 'Solo se instala TAG en registros pendientes (este esta en %)', v_estado;
--     end if;
--
--     v_tag := btrim(coalesce(p_no_dispositivo,''));
--     if v_tag !~ '^[0-9]{6,11}$' then
--         raise exception 'El No. de TAG debe tener de 6 a 11 digitos';
--     end if;
--
--     if not exists (select 1 from pagos p where p.registro_id = p_registro_id) then
--         raise exception 'El registro no tiene pago: el TAG se instala despues del pago';
--     end if;
--
--     select folio into v_dup_folio
--       from registros
--      where id <> p_registro_id and no_dispositivo = v_tag and estado <> 'baja'
--      limit 1;
--     if v_dup_folio is not null then
--         raise exception 'El TAG % ya esta activo en otro registro (%)', v_tag, v_dup_folio;
--     end if;
--
--     begin
--         update registros
--            set no_dispositivo = v_tag,
--                estado = 'activo',
--                -- NUEVO 68: la fecha en hora de Queretaro (current_date va en
--                -- UTC), la hora real y la identidad de la sesion.
--                fecha_instalacion   = (now() at time zone 'America/Mexico_City')::date,
--                instalado_en        = now(),
--                instalado_por       = v_quien,
--                instalado_por_uid   = auth.uid(),
--                instalado_por_email = v_quien
--          where id = p_registro_id;
--     exception when unique_violation then
--         -- Carrera contra otra instalacion simultanea del mismo numero.
--         raise exception 'El TAG % ya esta activo en otro registro', v_tag;
--     end;
--
--     return jsonb_build_object('id', p_registro_id);
-- end;
-- $_$;
--
-- CREATE OR REPLACE FUNCTION "public"."cortar_caja"("p_efectivo_contado" numeric, "p_cortado_por" "text" DEFAULT NULL::"text", "p_observaciones" "text" DEFAULT NULL::"text") RETURNS "jsonb"
--     LANGUAGE "plpgsql" SECURITY DEFINER
--     SET "search_path" TO 'public'
--     AS $_$
-- declare
--     v_zona       text := 'America/Mexico_City';
--     v_corte_id   uuid := gen_random_uuid();
--     v_total      numeric(12,2);
--     v_cantidad   integer;
--     v_dias       integer;
--     v_desde      timestamptz;
--     v_hasta      timestamptz := now();
--     v_desglose   jsonb;
--     v_diferencia numeric(12,2);
--     v_nombre     text;
--     v_folio      text;
-- begin
--     -- NUEVO 74: cortar es SOLO del contador. Decision de Gerardo del
--     -- 17-sep-2026: Administracion pierde cortar_caja.
--     --
--     -- PRECISION QUE HAY QUE DECIR EN VOZ ALTA, y que el codigo obliga:
--     -- panel_exigir_rol hace `return` en seco cuando el rol es 'super', SIN
--     -- mirar esta lista (29_rpc_panel.sql:49-51). Asi que lo cortan el
--     -- contador Y LAS CUENTAS SUPER. «Solo el contador cierra el corte» no
--     -- sera literal mientras existan cuentas super, y prometerlo seria
--     -- falso; quitarselo a super exige cambiar panel_exigir_rol, que es otro
--     -- alcance y afecta a TODOS los RPC del panel.
--     perform panel_exigir_rol(array['contador']);
--
--     -- Serializa dos cortes simultaneos: se forman en fila en vez de competir.
--     perform pg_advisory_xact_lock(hashtext('satag:corte_caja'));
--
--     if p_efectivo_contado is null or p_efectivo_contado < 0 then
--         raise exception 'El efectivo contado debe ser mayor o igual a cero';
--     end if;
--
--     v_nombre := nullif(btrim(coalesce(p_cortado_por, '')), '');
--     if v_nombre is null then
--         raise exception 'Indique quien realiza el corte';
--     end if;
--
--     -- Pre-chequeo: evita quemar un folio de la serie cuando no hay nada que cortar.
--     perform 1 from pagos where corte_id is null limit 1;
--     if not found then
--         raise exception 'No hay cobros pendientes de cortar: la caja esta en ceros';
--     end if;
--
--     -- Fotografia del periodo, antes de sellar.
--     select min(created_at),
--            count(distinct (created_at at time zone v_zona)::date)
--       into v_desde, v_dias
--       from pagos
--      where corte_id is null;
--
--     select jsonb_agg(d order by d ->> 'dia')
--       into v_desglose
--       from (
--           select jsonb_build_object(
--                      'dia',      (created_at at time zone v_zona)::date,
--                      'cantidad', count(*),
--                      'subtotal', sum(monto)
--                  ) as d
--             from pagos
--            where corte_id is null
--            group by (created_at at time zone v_zona)::date
--       ) s;
--
--     -- El sello define el conjunto. La FK diferida permite hacerlo antes de
--     -- que exista la fila del corte; se valida al confirmar la transaccion.
--     with sellados as (
--         update pagos
--            set corte_id = v_corte_id
--          where corte_id is null
--         returning monto
--     )
--     select coalesce(sum(monto), 0), count(*)
--       into v_total, v_cantidad
--       from sellados;
--
--     -- Respaldo real ante concurrencia: si otro corte se adelanto, aqui se
--     -- sellaron 0 filas. Sin esto quedaria un corte fantasma en cero cuyo
--     -- efectivo contado se registraria como sobrante inexistente.
--     if v_cantidad = 0 then
--         raise exception 'No hay cobros pendientes de cortar: la caja esta en ceros';
--     end if;
--
--     v_diferencia := p_efectivo_contado - v_total;
--
--     -- Una diferencia sin explicar es un documento contable inutil: dentro de
--     -- un mes nadie recordara por que no cuadro.
--     if v_diferencia <> 0 and btrim(coalesce(p_observaciones, '')) = '' then
--         raise exception 'Explique la diferencia de $% antes de cerrar el corte',
--             to_char(abs(v_diferencia), 'FM999999990.00');
--     end if;
--
--     -- Un corte que arrastra varios dias de cobro suele mezclar efectivo ya
--     -- entregado: se exige dejarlo por escrito mientras se recuerda.
--     if v_dias > 1 and btrim(coalesce(p_observaciones, '')) = '' then
--         raise exception 'Este corte abarca cobros de % dias: explique en observaciones si ya entrego efectivo de dias anteriores', v_dias;
--     end if;
--
--     insert into cortes_caja (
--         id, cortado_por, cortado_por_uid, cortado_por_email,
--         periodo_desde, periodo_hasta,
--         total_esperado, cantidad_pagos, dias_de_cobro, desglose_por_dia,
--         efectivo_contado, observaciones
--     )
--     values (
--         v_corte_id, v_nombre, auth.uid(), auth.jwt() ->> 'email',
--         v_desde, v_hasta,
--         v_total, v_cantidad, coalesce(v_dias, 1), v_desglose,
--         p_efectivo_contado, nullif(btrim(coalesce(p_observaciones, '')), '')
--     )
--     returning folio_corte into v_folio;
--
--     return jsonb_build_object(
--         'id', v_corte_id,
--         'folioCorte', v_folio,
--         'totalEsperado', v_total,
--         'efectivoContado', p_efectivo_contado,
--         'diferencia', v_diferencia,
--         'pagosCortados', v_cantidad,
--         'diasDeCobro', coalesce(v_dias, 1)
--     );
-- end;
-- $_$;
--
-- CREATE OR REPLACE FUNCTION "public"."estado_caja"() RETURNS "jsonb"
--     LANGUAGE "plpgsql" SECURITY DEFINER
--     SET "search_path" TO 'public'
--     AS $$
-- declare
--     v_zona          text := 'America/Mexico_City';
--     v_total         numeric(12,2);
--     v_cantidad      integer;
--     v_dias          integer;
--     v_primero       timestamptz;
--     v_desglose      jsonb;
--     v_ultimo_corte  timestamptz;
--     v_mes           numeric(12,2);
--     v_historico     numeric(12,2);
-- begin
--     -- NUEVO 74: el contador tambien LEE el estado de la caja. Administracion
--     -- lo conserva: necesita saber cuanto efectivo deberia haber para
--     -- conciliar, y la guia del personal se lo indica expresamente.
--     perform panel_exigir_rol(array['admin','contador']);
--
--     select coalesce(sum(monto), 0),
--            count(*),
--            count(distinct (created_at at time zone v_zona)::date),
--            min(created_at)
--       into v_total, v_cantidad, v_dias, v_primero
--       from pagos
--      where corte_id is null;
--
--     -- Desglose por dia local: deja ver de golpe que parte del efectivo es de
--     -- dias anteriores ya entregados, que es de donde salen los faltantes falsos.
--     select jsonb_agg(d order by d ->> 'dia')
--       into v_desglose
--       from (
--           select jsonb_build_object(
--                      'dia',      (created_at at time zone v_zona)::date,
--                      'cantidad', count(*),
--                      'subtotal', sum(monto)
--                  ) as d
--             from pagos
--            where corte_id is null
--            group by (created_at at time zone v_zona)::date
--       ) s;
--
--     select max(created_at) into v_ultimo_corte from cortes_caja;
--
--     select coalesce(sum(monto), 0)
--       into v_mes
--       from pagos
--      where (created_at at time zone v_zona) >= date_trunc('month', now() at time zone v_zona);
--
--     select coalesce(sum(monto), 0) into v_historico from pagos;
--
--     return jsonb_build_object(
--         'totalEnCaja',     v_total,
--         'pagosEnCaja',     v_cantidad,
--         'diasDeCobro',     coalesce(v_dias, 0),
--         'primerCobro',     v_primero,
--         'desglosePorDia',  coalesce(v_desglose, '[]'::jsonb),
--         'ultimoCorte',     v_ultimo_corte,
--         'vendidoMes',      v_mes,
--         'vendidoHistorico', v_historico
--     );
-- end;
-- $$;
--
-- CREATE OR REPLACE FUNCTION "public"."tg_pagos_avisar_chat_ti"() RETURNS "trigger"
--     LANGUAGE "plpgsql" SECURITY DEFINER
--     SET "search_path" TO ''
--     AS $$
-- declare
--     v_estado text;
--     v_tag    text;
--     v_total  int;
--     v_error  text;
-- begin
--     begin
--         select r.estado, r.no_dispositivo
--           into v_estado, v_tag
--           from public.registros r
--          where r.id = new.registro_id;
--
--         -- Un pago de un registro que no queda en la cola de TI (ya tiene TAG
--         -- o no esta pendiente) no cambia nada de lo que TI tiene que hacer.
--         if v_estado is distinct from 'pendiente' or v_tag is not null then
--             return new;
--         end if;
--
--         select count(*)
--           into v_total
--           from public.registros r
--          where r.estado = 'pendiente'
--            and r.no_dispositivo is null
--            and exists (select 1 from public.pagos p where p.registro_id = r.id);
--
--         if v_total > 0 then
--             -- Cada mensaje del webhook abre su propio hilo en el espacio: quien
--             -- vaya a instalar lo reclama respondiendo en ese hilo (pedido de
--             -- Gerardo, 15-sep). Un webhook no puede crear tareas del espacio
--             -- ni botones que anoten quien va; eso exigiria una app de Chat.
--             perform public.avisar_chat_ti(
--                 '*SATAG:* se registró un pago. Hay ' || v_total
--                 || case when v_total = 1 then ' TAG por instalar.' else ' TAGs por instalar.' end
--                 || ' Quien vaya a instalar, responda *Voy yo* en este hilo.'
--                 || ' <https://satag.asuncionqro.edu.mx/admin/|Abra el panel>'
--             );
--         end if;
--     exception when others then
--         v_error := left(sqlstate || ' ' || sqlerrm, 300);
--         raise warning 'SATAG aviso a Chat: fallo el disparador (%). El cobro no se afecta.', v_error;
--         begin
--             insert into public.parametros (clave, valor, actualizado_en)
--             values ('aviso_chat_ti_ultimo_error', 'disparador: ' || v_error, now())
--             on conflict (clave) do update
--                set valor = excluded.valor, actualizado_en = excluded.actualizado_en;
--         exception when others then
--             null;
--         end;
--     end;
--     return new;
-- end;
-- $$;
--
-- CREATE OR REPLACE FUNCTION "public"."recordar_chat_ti"() RETURNS "void"
--     LANGUAGE "plpgsql" SECURITY DEFINER
--     SET "search_path" TO ''
--     AS $$
-- declare
--     v_disponibles int;
--     v_pendientes  int;
--     v_error       text;
-- begin
--     begin
--         select count(*)
--           into v_disponibles
--           from public.inventario_tags i
--          where i.asignado_a is null;
--
--         select count(*)
--           into v_pendientes
--           from public.registros r
--          where r.estado = 'pendiente'
--            and r.no_dispositivo is null
--            and exists (select 1 from public.pagos p where p.registro_id = r.id);
--
--         perform public.avisar_chat_ti(
--             '*SATAG · lunes de instalación:*'
--             || chr(10) || 'TAGs disponibles para instalar: ' || v_disponibles
--             || chr(10) || 'Cobrados y por instalar: ' || v_pendientes
--             || case when v_disponibles = 0
--                     then chr(10) || 'No hay TAGs disponibles: dé de alta TAGs en el inventario antes de instalar.'
--                     else '' end
--             || chr(10) || '<https://satag.asuncionqro.edu.mx/admin/|Abra el panel>'
--         );
--     exception when others then
--         -- Mismo criterio del 66: el error queda a la vista en parametros.
--         v_error := left(sqlstate || ' ' || sqlerrm, 300);
--         raise warning 'SATAG recordatorio a Chat: fallo (%).', v_error;
--         begin
--             insert into public.parametros (clave, valor, actualizado_en)
--             values ('aviso_chat_ti_ultimo_error', 'recordatorio: ' || v_error, now())
--             on conflict (clave) do update
--                set valor = excluded.valor, actualizado_en = excluded.actualizado_en;
--         exception when others then
--             null;
--         end;
--     end;
-- end;
-- $$;
--
-- CREATE OR REPLACE FUNCTION "public"."pagos_congelar_sellado"() RETURNS "trigger"
--     LANGUAGE "plpgsql"
--     AS $$
-- begin
--     if old.corte_id is not null and (
--            new.monto        is distinct from old.monto
--         or new.cobrado_por  is distinct from old.cobrado_por
--         or new.folio_recibo is distinct from old.folio_recibo
--         or new.corte_id     is distinct from old.corte_id
--     ) then
--         raise exception 'El pago % ya fue cortado y no admite cambios', coalesce(old.folio_recibo, old.id::text);
--     end if;
--     return new;
-- end;
-- $$;
--
-- alter table movimientos drop constraint mov_tipo_valido;
-- alter table movimientos add constraint mov_tipo_valido
--     check (tipo = any (array['alta', 'baja', 'reposicion', 'cambio',
--                              'prueba', 'bloqueo', 'rectificacion', 'validacion']));
-- alter table cortes_caja drop constraint corte_devuelto_no_negativo;
-- alter table cortes_caja drop constraint corte_con_movimientos;
-- alter table cortes_caja add constraint corte_total_no_negativo check (total_esperado >= 0::numeric);
-- alter table cortes_caja add constraint corte_con_pagos check (cantidad_pagos > 0);
-- alter table cortes_caja drop column cantidad_devoluciones, drop column total_devuelto;
-- drop index uq_pagos_registro;
-- create unique index uq_pagos_registro on pagos (registro_id);
-- drop index ix_pagos_devoluciones_en_caja;
-- alter table pagos drop constraint pagos_devolucion_corte_fk;
-- alter table pagos drop constraint pagos_devolucion_coherente;
-- alter table pagos
--     drop column devolucion_corte_id, drop column devolucion_motivo, drop column devuelto_por_email,
--     drop column devuelto_por_uid, drop column devuelto_por, drop column devuelto_en;
-- notify pgrst, 'reload schema';
-- commit;
