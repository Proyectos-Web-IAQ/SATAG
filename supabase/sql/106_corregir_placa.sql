-- =====================================================================
-- BLOQUE 106 — Corregir la placa desde el caso: en SATAG y en ZK, en un
-- solo paso.
--
-- 06/11/2026
--
-- POR QUE
--   Gerardo, 6-nov, sobre un «Reporte de caseta: un dato esta mal (placa,
--   vehiculo o nombre)»: «¿cual seria el proceso para cerrarlo?» y «desde
--   casos deberia poder hacer todo, ¿no?».
--
--   «Cerrar…» ya pide dos acciones en ZK (bloque 94): pasarlo a un
--   departamento y corregir el nombre. La placa no tenia por donde: habia que
--   ir a «Actualizar datos» en SATAG y escribirla a mano en ZK (campo
--   Celular). Este bloque le da a la placa el mismo carril que al nombre
--   (bloques 103 y 105): se corrige en SATAG, el cambio sale en una tanda de
--   Movimientos en ZK y la carga del padron lo comprueba.
--
-- QUE HACE, EN ORDEN
--   0. Guardia: el 106 no esta y lo que toca sigue como lo dejaron 93-95.
--   1. zk_movimientos: columna placa_destino y la clase 'placa' en sus
--      CHECK (validados contra las filas de hoy, sin «not valid»).
--   2. zk_placa_comparable(text): mayusculas, solo letras y numeros. Asi se
--      compara la placa de SATAG, la de ZK y la que se escribe.
--   3. RPC NUEVO corregir_placa(caso, placa, hecho_por). Solo ti (super pasa
--      siempre). En UNA transaccion:
--        a. SATAG: si el TAG del caso tiene expediente vigente y su placa es
--           otra, la cambia y deja un movimiento 'rectificacion'.
--        b. ZK: si el TAG esta vigente en el padron de ZK guardado y ZK dice
--           otra placa, pide el movimiento 'placa' (lo crea, o le cambia el
--           destino si sigue pendiente). Si ya va en una tanda o ya se hizo,
--           lanza y no cambia nada, SATAG incluido.
--        c. Una nota en el caso con lo que dijo cada lado.
--      NO cierra el caso: lo cierra «Cerrar…» con el motivo elegido, igual
--      que hoy con pedir_movimiento_zk.
--   4. Cuerpos EXTRAIDOS con su delta «NUEVO 106», verificado por diff:
--        - ajustar_movimiento_zk (93): la placa pedida no se ajusta aqui
--          (se vuelve a corregir desde el caso); cancelar sigue igual.
--        - crear_tanda_zk (95): cada renglon trae 'placaDestino'.
--        - marcar_paso_tanda_zk (93): la nota de cierre dice «placa
--          corregida a «X»».
--        - verificar_movimientos_zk (94): compara la placa del padron con la
--          pedida.
--   5. Verificacion de solo lectura: filas con ok = true.
--
-- QUE NO HACE
--   - generar_movimientos_zk no se toca: ningun tipo de caso automatico pide
--     una placa; la correccion es siempre a mano.
--   - No escribe en ZK: lo hace TI con la tanda.
--   - El padron guarda la placa de «Placa Vehicular» y, si esta vacia, la de
--     «Celular» (lib/zk/padron.ts). La tanda la escribe en Celular. Si ZK
--     conserva la placa vieja en «Placa Vehicular», la verificacion dira
--     «ZK todavia dice la placa X»: es cierto, y se borra a mano en ZK.
--
-- ORDEN: AGREGA una funcion y una clase de movimiento. Va ANTES del deploy
-- del cliente que la llama. El cliente publicado no crea movimientos de
-- placa, y la llave nueva de crear_tanda_zk no le estorba.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. GUARDIA
-- ---------------------------------------------------------------------
do $guardia$
begin
    if to_regprocedure('public.corregir_placa(uuid, text, text)') is not null
       or exists (select 1 from pg_proc where proname = 'corregir_placa') then
        raise exception 'El bloque 106 ya esta aplicado (existe corregir_placa). No se aplico nada.';
    end if;
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'zk_movimientos' and column_name = 'placa_destino') then
        raise exception 'zk_movimientos ya tiene placa_destino. No se aplico nada: revise que bloque la agrego.';
    end if;
    if exists (select 1 from pg_proc where proname = 'zk_placa_comparable') then
        raise exception 'Ya existe zk_placa_comparable. No se aplico nada: revise que bloque la creo.';
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'zk_padron' and column_name = 'placa') then
        raise exception 'zk_padron no tiene la columna placa (bloque 93). No se aplico nada.';
    end if;
    if (select pg_get_constraintdef(oid) from pg_constraint where conname = 'zkm_que')
         not like '%''departamento''%''nombre''%'
       or (select pg_get_constraintdef(oid) from pg_constraint where conname = 'zkm_que') like '%placa%'
       or not exists (select 1 from pg_constraint where conname = 'zkm_destino') then
        raise exception 'Los CHECK de zk_movimientos no son los del bloque 93. No se aplico nada.';
    end if;
    if (select count(*) from pg_proc where proname in
          ('ajustar_movimiento_zk', 'crear_tanda_zk', 'marcar_paso_tanda_zk', 'verificar_movimientos_zk')) <> 4 then
        raise exception 'Alguna funcion de Movimientos en ZK falta o tiene mas de una forma. No se aplico nada.';
    end if;
    if not exists (select 1 from pg_proc where proname = 'crear_tanda_zk'
                    and prosrc like '%Información del Personal%' and prosrc not like '%placaDestino%') then
        raise exception 'crear_tanda_zk no es la del bloque 95. No se aplico nada: revise que bloque la dejo asi.';
    end if;
    if not exists (select 1 from pg_proc where proname = 'verificar_movimientos_zk'
                    and prosrc like '%NUEVO 94%' and prosrc not like '%NUEVO 106%') then
        raise exception 'verificar_movimientos_zk no es la del bloque 94. No se aplico nada: revise que bloque la dejo asi.';
    end if;
    if not exists (select 1 from pg_proc where proname = 'ajustar_movimiento_zk'
                    and prosrc like '%Solo se ajusta un movimiento que no esta en una tanda%' and prosrc not like '%NUEVO 106%') then
        raise exception 'ajustar_movimiento_zk no es la del bloque 93. No se aplico nada: revise que bloque la dejo asi.';
    end if;
    if not exists (select 1 from pg_proc where proname = 'marcar_paso_tanda_zk'
                    and prosrc like '%nombre corregido a%' and prosrc not like '%NUEVO 106%') then
        raise exception 'marcar_paso_tanda_zk no es la del bloque 93. No se aplico nada: revise que bloque la dejo asi.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. LA CLASE 'placa' EN LOS MOVIMIENTOS
-- ---------------------------------------------------------------------
alter table zk_movimientos add column placa_destino text;
alter table zk_movimientos drop constraint zkm_que, drop constraint zkm_destino;
alter table zk_movimientos
    add constraint zkm_que     check (que in ('departamento', 'nombre', 'placa')),
    add constraint zkm_destino check ((que = 'departamento') = (depto_destino is not null)
                                      and (que = 'nombre') = (coalesce(btrim(nombre_destino), '') <> '')
                                      and (que = 'placa') = (coalesce(btrim(placa_destino), '') <> ''));
comment on column zk_movimientos.placa_destino is
    'placa: la placa como debe quedar en ZK (Celular), en mayusculas y sin espacios ni guiones (bloque 106).';


-- ---------------------------------------------------------------------
-- 2. LA PLACA COMPARABLE
-- ---------------------------------------------------------------------
create function zk_placa_comparable(p text) returns text
language sql immutable
as $$ select nullif(regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g'), '') $$;
comment on function zk_placa_comparable(text) is
    'Placa en mayusculas, solo letras y numeros; null si queda vacia. «upp-388 d» -> «UPP388D» (bloque 106).';


-- ---------------------------------------------------------------------
-- 3. corregir_placa (NUEVO)
-- ---------------------------------------------------------------------
create function corregir_placa(
    p_caso      uuid,
    p_placa     text,
    p_hecho_por text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $placa$
declare
    v_quien   text;
    v_placa   text := zk_placa_comparable(p_placa);
    v_caso    record;
    r         registros%rowtype;
    v_antes   text;
    v_satag   boolean := false;
    v_dup     text;
    v_zk      record;
    v_zk_est  text;
    v_m       record;
    v_texto   text;
    v_linea   text;
    v_id      uuid;
begin
    perform panel_exigir_rol(array['ti']);
    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    if v_placa is null or v_placa !~ '^[A-Z0-9]{4,10}$' then
        raise exception 'Escriba la placa como viene en el vehículo: de 4 a 10 letras y números.';
    end if;

    select id, numero, tarjeta, estado into v_caso from casos where id = p_caso for update;
    if v_caso.id is null then
        raise exception 'Ese caso ya no existe. Vuelva a abrir la pantalla.';
    end if;
    if v_caso.tarjeta is null then
        raise exception 'El caso % no tiene TAG: no se sabe de qué vehículo es la placa.', v_caso.numero;
    end if;
    if v_caso.estado = 'descartado' then
        raise exception 'El caso % está descartado: no corrige nada.', v_caso.numero;
    end if;

    -- SATAG: el expediente vigente de ese TAG, si lo hay.
    select * into r from registros
     where no_dispositivo = v_caso.tarjeta and estado <> 'baja'
     limit 1 for update;
    if r.id is not null then
        v_antes := case when r.sin_placas then 'sin placas'
                        else coalesce(nullif(btrim(coalesce(r.placas, '')), ''), 'sin placas') end;
        v_satag := r.sin_placas or zk_placa_comparable(r.placas) is distinct from v_placa;
        -- La placa es unica entre expedientes vivos (indice del bloque 62). Se
        -- compara sin espacios ni guiones, que el indice no ve.
        if v_satag then
            select folio into v_dup from registros
             where id <> r.id and estado <> 'baja' and zk_placa_comparable(placas) = v_placa
             limit 1;
            if v_dup is not null then
                raise exception 'La placa % ya está en otro expediente vigente (%). Revise cuál es el bueno antes de corregirla.', v_placa, v_dup;
            end if;
        end if;
    end if;

    -- ZK: lo que dice el padron guardado (no ZK en vivo).
    select p.vigente, p.placa into v_zk from zk_padron p where p.tarjeta = v_caso.tarjeta;
    v_zk_est := case when v_zk.vigente is not true then 'sin_zk'
                     when zk_placa_comparable(v_zk.placa) = v_placa then 'coincide'
                     else 'pedido' end;

    if r.id is null and v_zk_est = 'sin_zk' then
        raise exception 'El TAG % no tiene expediente en SATAG ni está en el padrón de ZK guardado: no hay dónde corregir la placa.', v_caso.tarjeta;
    end if;
    if not v_satag and v_zk_est <> 'pedido' then
        raise exception 'La placa ya es «%» %: no hay nada que corregir.', v_placa,
            case when r.id is not null and v_zk_est = 'coincide' then 'en SATAG y en ZK'
                 when r.id is not null then 'en SATAG (el TAG no está en el padrón de ZK guardado)'
                 else 'en ZK (el TAG no tiene expediente en SATAG)' end;
    end if;

    -- Antes de escribir nada: lo que ya va en una tanda o ya se hizo no se cambia.
    if v_zk_est = 'pedido' then
        select * into v_m from zk_movimientos
         where caso_id = p_caso and que = 'placa'
           and estado in ('pendiente', 'en_tanda', 'hecho', 'no_coincide')
         for update;
        if v_m.id is not null and v_m.estado in ('en_tanda', 'hecho') then
            raise exception 'El caso % ya tiene una corrección de placa %: no se cambia lo que ya va o ya se hizo en ZK. En cuanto la carga del padrón la verifique, se puede pedir otra.',
                v_caso.numero, case v_m.estado when 'en_tanda' then 'en la tanda abierta' else 'hecha en ZK' end;
        end if;
    end if;

    -- a. SATAG
    if v_satag then
        begin
            update registros set placas = v_placa, sin_placas = false where id = r.id;
        exception when unique_violation then
            raise exception 'La placa % ya está en otro expediente vigente.', v_placa;
        end;
        insert into movimientos (registro_id, tipo, motivo, hecho_por)
        values (r.id, 'rectificacion',
                left('Placa corregida: «' || v_antes || '» → «' || v_placa || '» (caso ' || v_caso.numero || ').', 600),
                v_quien);
    end if;

    -- b. ZK
    if v_zk_est = 'pedido' then
        v_texto := 'Acción en ZK: corregir la placa a «' || v_placa || '»';
        if exists (select 1 from zk_movimientos where caso_id = p_caso and que = 'placa' and estado = 'verificado') then
            v_texto := replace(v_texto, 'Acción en ZK:', 'Otra acción en ZK (la anterior ya se verificó):');
        end if;
        if v_m.id is not null then
            update zk_movimientos set placa_destino = v_placa, actualizado_en = now() where id = v_m.id;
            v_id := v_m.id;
        else
            insert into zk_movimientos (caso_id, tarjeta, que, placa_destino, creado_por)
            values (p_caso, v_caso.tarjeta, 'placa', v_placa, v_quien)
            returning id into v_id;
        end if;
    else
        -- ZK ya la tiene: una correccion pendiente de antes ya no hace falta.
        update zk_movimientos
           set estado = 'cancelado', actualizado_en = now(),
               detalle = 'Ya no hace falta: ZK ya dice «' || v_placa || '».'
         where caso_id = p_caso and que = 'placa' and estado in ('pendiente', 'no_coincide');
    end if;

    -- c. La nota del caso
    v_linea := 'Placa corregida por Sistemas: ' ||
        case when r.id is null then 'el TAG no tiene expediente en SATAG'
             when v_satag then 'SATAG pasa de «' || v_antes || '» a «' || v_placa || '»'
             else 'SATAG ya dice «' || v_placa || '»' end || '; ' ||
        case v_zk_est
             when 'pedido' then v_texto || ' (ZK dice «' || coalesce(nullif(btrim(coalesce(v_zk.placa, '')), ''), 'sin placa') || '»)'
             when 'coincide' then 'ZK ya dice «' || v_placa || '»'
             else 'el TAG no está en el padrón de ZK guardado' end || '.';
    insert into casos_notas (caso_id, clase, nota, hecho_por) values (p_caso, 'nota', left(v_linea, 4000), v_quien);
    if r.id is not null then
        update casos set registro_id = coalesce(registro_id, r.id), actualizado_en = now() where id = p_caso;
    end if;

    return jsonb_build_object(
        'placa', v_placa, 'expediente', r.id is not null, 'satag', v_satag, 'satagAntes', v_antes,
        'zk', v_zk_est, 'zkDice', v_zk.placa, 'caso', v_caso.numero, 'movimiento', v_id);
end;
$placa$;
revoke all     on function corregir_placa(uuid, text, text) from public, anon;
grant  execute on function corregir_placa(uuid, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. CUERPOS EXTRAIDOS CON SU DELTA «NUEVO 106» (mismas firmas)
-- ---------------------------------------------------------------------

-- 4.1 ajustar_movimiento_zk (cuerpo de 93_movimientos_zk.sql, lineas 601-640)
create or replace function ajustar_movimiento_zk(
    p_movimiento     uuid,
    p_depto_destino  text default null,
    p_nombre_destino text default null,
    p_cancelar       boolean default false,
    p_hecho_por      text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $ajustar$
declare
    v_m record;
begin
    perform panel_exigir_rol(array['ti']);
    select * into v_m from zk_movimientos where id = p_movimiento for update;
    if v_m.id is null then
        raise exception 'Ese movimiento ya no existe. Vuelva a abrir la pantalla.';
    end if;
    if v_m.estado not in ('pendiente', 'no_coincide') then
        raise exception 'Solo se ajusta un movimiento que no esta en una tanda.';
    end if;
    if coalesce(p_cancelar, false) then
        update zk_movimientos set estado = 'cancelado', actualizado_en = now(),
               detalle = 'Cancelado por ' || coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI')
         where id = p_movimiento;
        return jsonb_build_object('id', p_movimiento, 'estado', 'cancelado');
    end if;
    -- NUEVO 106: la placa pedida se cambia volviendo a corregirla desde el caso,
    -- que tambien la corrige en SATAG; aqui solo se cancela.
    if v_m.que = 'placa' then
        raise exception 'Para cambiar la placa pedida, vuelva a corregirla desde el caso.';
    end if;
    if v_m.que = 'departamento' then
        if not exists (select 1 from zk_departamentos where id = p_depto_destino) then
            raise exception 'Elija un departamento de ZK de la lista.';
        end if;
        update zk_movimientos set depto_destino = p_depto_destino, actualizado_en = now() where id = p_movimiento;
    else
        if coalesce(btrim(p_nombre_destino), '') = '' then
            raise exception 'Escriba el nombre como debe quedar en ZK.';
        end if;
        update zk_movimientos set nombre_destino = left(btrim(p_nombre_destino), 200), actualizado_en = now() where id = p_movimiento;
    end if;
    return jsonb_build_object('id', p_movimiento, 'estado', v_m.estado);
end;
$ajustar$;


-- 4.2 crear_tanda_zk (cuerpo de 95_ruta_importar_zk.sql, completo)
create or replace function crear_tanda_zk(p_movimientos uuid[], p_hecho_por text default null) returns jsonb
language plpgsql security definer set search_path = public
as $tanda$
declare
    v_quien   text;
    v_n       int;
    v_sin_id  text[];
    v_pasos   jsonb;
    v_tanda   uuid;
    v_numero  int;
    v_abierta int;
begin
    perform panel_exigir_rol(array['ti']);
    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    if p_movimientos is null or cardinality(p_movimientos) = 0 then
        raise exception 'Elija al menos un movimiento.';
    end if;
    select numero into v_abierta from zk_tandas where estado = 'abierta';
    if v_abierta is not null then
        raise exception 'La tanda % sigue abierta: terminela o cancelela antes de armar otra.', v_abierta;
    end if;
    select count(*) into v_n from zk_movimientos
     where id = any (p_movimientos) and estado in ('pendiente', 'no_coincide');
    if v_n <> cardinality(p_movimientos) then
        raise exception 'Alguno de los movimientos ya no esta pendiente. Vuelva a abrir la pantalla.';
    end if;
    -- Un TAG con dos destinos (dos casos que piden cosas distintas) lo decide TI.
    select array_agg(distinct tarjeta) into v_sin_id from (
        select tarjeta from zk_movimientos where id = any (p_movimientos) group by tarjeta, que having count(*) > 1) x;
    if v_sin_id is not null then
        raise exception 'El TAG % tiene dos movimientos de la misma clase en la seleccion. Deje uno (ajuste o cancele el otro).',
            array_to_string(v_sin_id, ', ');
    end if;
    -- Sin el ID de ZK el import crearia a otra persona con la misma tarjeta.
    select array_agg(m.tarjeta order by m.tarjeta) into v_sin_id
      from zk_movimientos m
      left join zk_padron p on p.tarjeta = m.tarjeta and p.vigente
     where m.id = any (p_movimientos) and coalesce(p.id_zk, '') = '';
    if v_sin_id is not null then
        raise exception 'SATAG no conoce el ID de ZK de % TAG(s) (%). Suba primero el export de Usuarios de ZK en Archivos de ZK.',
            cardinality(v_sin_id), array_to_string(v_sin_id[1:5], ', ');
    end if;

    -- Los pasos: importar, y uno por cada departamento destino segun tenga niveles o no.
    select jsonb_build_array(jsonb_build_object(
               'clave', 'importar', 'hecho', false,
               'texto', 'Importar el archivo de esta tanda en ZK: Personal › Importar › Información del Personal, «Fila de inicio» 2 y «Actualizar el ID de usuario existente» Sí. Debe decir Correctos ' || cardinality(p_movimientos)::text || ' o menos (un renglón por TAG) y Fallidos 0.'))
           || coalesce(jsonb_agg(jsonb_build_object(
               'clave', 'niveles:' || d.id, 'hecho', false,
               'texto', case when cardinality(d.niveles) = 0 then
                   d.nombre || ': en Acceso › Por Departamento, agregarle todos los niveles (ESTACIONAMIENTO 1 y 2), guardar, y quitárselos, guardar. De corrido y fuera de las horas de entrada y salida: mientras tanto, todos los de ' || d.nombre || ' abren.'
                 else
                   d.nombre || ': en Acceso › Por Departamento, quitar y volver a poner sus niveles (' ||
                   array_to_string(array(select 'ESTACIONAMIENTO ' || substr(x, 2) from unnest(d.niveles) x order by 1), ' y ') ||
                   '). Ojo: también se los devuelve a quien se los hubieran quitado a mano en ese departamento.'
                 end) order by d.nombre), '[]'::jsonb)
      into v_pasos
      from zk_departamentos d
     where d.id in (select depto_destino from zk_movimientos where id = any (p_movimientos) and que = 'departamento');

    insert into zk_tandas (pasos, creada_por) values (v_pasos, v_quien) returning id, numero into v_tanda, v_numero;
    update zk_movimientos set estado = 'en_tanda', tanda_id = v_tanda, actualizado_en = now(), detalle = ''
     where id = any (p_movimientos);

    return jsonb_build_object(
        'tanda', v_tanda, 'numero', v_numero, 'pasos', v_pasos,
        'renglones', (
            select coalesce(jsonb_agg(jsonb_build_object(
                       'tarjeta', p.tarjeta, 'idZk', p.id_zk, 'nombres', p.nombres, 'apellidos', p.apellidos,
                       'placa', p.placa,
                       'deptoId', coalesce(d.id, p.departamento_id), 'deptoNombre', coalesce(d.nombre, p.departamento),
                       'nombreDestino', n.nombre_destino,
                       -- NUEVO 106: la placa como debe quedar, si la tanda la corrige.
                       'placaDestino', pl.placa_destino) order by p.tarjeta), '[]'::jsonb)
              from (select distinct tarjeta from zk_movimientos where id = any (p_movimientos)) t
              join zk_padron p on p.tarjeta = t.tarjeta and p.vigente
              left join zk_movimientos md on md.id = any (p_movimientos) and md.tarjeta = t.tarjeta and md.que = 'departamento'
              left join zk_departamentos d on d.id = md.depto_destino
              left join zk_movimientos n on n.id = any (p_movimientos) and n.tarjeta = t.tarjeta and n.que = 'nombre'
              left join zk_movimientos pl on pl.id = any (p_movimientos) and pl.tarjeta = t.tarjeta and pl.que = 'placa'));
end;
$tanda$;


-- 4.3 marcar_paso_tanda_zk (cuerpo de 93_movimientos_zk.sql, lineas 753-803)
create or replace function marcar_paso_tanda_zk(p_tanda uuid, p_clave text, p_hecho boolean, p_hecho_por text default null) returns jsonb
language plpgsql security definer set search_path = public
as $paso$
declare
    v_quien  text;
    v_t      record;
    v_pasos  jsonb;
    v_todos  boolean;
    r        record;
begin
    perform panel_exigir_rol(array['ti']);
    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');
    select * into v_t from zk_tandas where id = p_tanda for update;
    if v_t.id is null or v_t.estado <> 'abierta' then
        raise exception 'Esa tanda ya no esta abierta. Vuelva a abrir la pantalla.';
    end if;
    if not exists (select 1 from jsonb_array_elements(v_t.pasos) e where e ->> 'clave' = p_clave) then
        raise exception 'Ese paso no es de esta tanda.';
    end if;

    select jsonb_agg(case when e ->> 'clave' = p_clave
                          then e || jsonb_build_object('hecho', coalesce(p_hecho, false),
                                                       'hechoPor', case when p_hecho then v_quien end,
                                                       'hechoEn', case when p_hecho then now() end)
                          else e end order by i)
      into v_pasos
      from jsonb_array_elements(v_t.pasos) with ordinality as x(e, i);
    select bool_and(coalesce((e ->> 'hecho')::boolean, false)) into v_todos from jsonb_array_elements(v_pasos) e;

    if not v_todos then
        update zk_tandas set pasos = v_pasos where id = p_tanda;
        return jsonb_build_object('tanda', p_tanda, 'hecha', false);
    end if;

    update zk_tandas set pasos = v_pasos, estado = 'hecha', hecha_por = v_quien, hecha_en = now() where id = p_tanda;
    update zk_movimientos set estado = 'hecho', actualizado_en = now(),
           detalle = 'Hecho en ZK (tanda ' || v_t.numero || '); falta que los archivos de ZK lo confirmen.'
     where tanda_id = p_tanda and estado = 'en_tanda';
    for r in
        select m.caso_id,
               string_agg(case when m.que = 'departamento' then 'movido a ' || d.nombre
                               -- NUEVO 106
                               when m.que = 'placa' then 'placa corregida a «' || m.placa_destino || '»'
                               else 'nombre corregido a «' || m.nombre_destino || '»' end, ' y ' order by m.que) as que
          from zk_movimientos m left join zk_departamentos d on d.id = m.depto_destino
         where m.tanda_id = p_tanda
         group by m.caso_id
    loop
        perform zk_cerrar_caso(r.caso_id, 'Hecho en ZK', 'Tanda ' || v_t.numero || ': ' || r.que, v_quien);
    end loop;
    return jsonb_build_object('tanda', p_tanda, 'hecha', true);
end;
$paso$;


-- 4.4 verificar_movimientos_zk (cuerpo de 94_accion_zk_al_cerrar.sql, lineas 146-268)
create or replace function verificar_movimientos_zk(p_hecho_por text default null) returns jsonb
language plpgsql security definer set search_path = public
as $verificar$
declare
    v_quien     text;
    v_pad       record;
    v_pue_exp   timestamp;
    v_pue_n     int;
    v_cuando    text;
    r           record;
    v_lotes     text[];
    v_ok_depto  boolean;
    v_ok_puerta boolean;
    v_ok        boolean;
    v_fresco    boolean;
    -- Que archivo hace falta que sea nuevo para decir «no coincide»: el padron
    -- si falla el departamento o el nombre; las puertas si fallan las puertas.
    v_por_puerta boolean;
    v_motivo    text;
    v_ver       int := 0;
    v_ya        int := 0;
    v_no        int := 0;
    v_espera    int := 0;
begin
    perform panel_exigir_rol(array['ti']);
    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    select exportado_en, cargado_en into v_pad from zk_padron_cargas order by cargado_en desc limit 1;
    -- Las cuatro puertas: la hora del export mas viejo de los cuatro ultimos.
    select count(*), min(exp) into v_pue_n, v_pue_exp
      from (select distinct on (puerta) puerta, exportado_en as exp
              from zk_puertas_cargas order by puerta, cargado_en desc) u;
    v_cuando := 'Usuarios del ' || coalesce(to_char(v_pad.exportado_en, 'DD/MM HH24:MI'), '—')
             || case when v_pue_n = 4 then ' y Personal de Apertura del ' || coalesce(to_char(v_pue_exp, 'DD/MM HH24:MI'), '—') else '' end;

    for r in
        select m.*, t.hecha_en, t.numero as tanda_numero, d.nombre as depto_nombre, d.niveles,
               p.departamento_id as p_depto, p.departamento as p_depto_nombre, p.id_zk, p.vigente as p_vigente,
               zk_texto_comparable(concat_ws(' ', nullif(p.nombres, ''), nullif(p.apellidos, ''))) as p_nombre,
               -- NUEVO 106: la placa de ZK, como la guarda el padron (sin espacios ni guiones).
               p.placa as p_placa, zk_placa_comparable(p.placa) as p_placa_cmp
          from zk_movimientos m
          left join zk_tandas t on t.id = m.tanda_id
          left join zk_departamentos d on d.id = m.depto_destino
          left join zk_padron p on p.tarjeta = m.tarjeta
         where m.estado in ('pendiente', 'hecho', 'no_coincide')
         for update of m
    loop
        v_ok_puerta := null;
        v_por_puerta := false;
        if r.p_vigente is not true then
            v_ok := false;
            v_motivo := 'El TAG ' || r.tarjeta || ' ya no esta en el padron de ZK';
        elsif r.que = 'nombre' then
            v_ok := r.p_nombre = zk_texto_comparable(r.nombre_destino);
            v_motivo := 'ZK todavia dice «' || coalesce(nullif(r.p_nombre, ''), 'sin nombre') || '»';
        -- NUEVO 106
        elsif r.que = 'placa' then
            v_ok := r.p_placa_cmp = r.placa_destino;
            v_motivo := 'ZK todavia dice la placa «' || coalesce(nullif(r.p_placa, ''), 'sin placa') || '»';
        else
            v_ok_depto := r.p_depto = r.depto_destino;
            if v_pue_n = 4 and r.id_zk <> '' then
                select coalesce(array_agg(l order by l), '{}') into v_lotes
                  from (select substr(puerta, 1, 2) l from zk_puertas where id_zk = r.id_zk
                         group by 1 having count(*) = 2) x;
                v_ok_puerta := case when cardinality(r.niveles) = 0 then cardinality(v_lotes) = 0
                                    else r.niveles <@ v_lotes end;
            end if;
            v_ok := v_ok_depto and coalesce(v_ok_puerta, false);
            v_por_puerta := v_ok_depto and v_ok_puerta is false;
            v_motivo := case
                when not v_ok_depto then 'ZK todavia lo tiene en «' || coalesce(r.p_depto_nombre, '?') || '»'
                when v_ok_puerta is null then null
                when cardinality(r.niveles) = 0 then 'Esta en ' || r.depto_nombre || ' pero todavia tiene puerta (' || array_to_string(v_lotes, ', ') || ')'
                else 'Esta en ' || r.depto_nombre || ' pero no tiene las puertas de ese departamento (' || array_to_string(r.niveles, ', ') || ')'
            end;
            -- Sin las cuatro puertas cargadas no se puede decir si quedo bien.
            if v_ok_depto and v_ok_puerta is null then
                if r.estado <> 'pendiente' then
                    update zk_movimientos set detalle = 'Ya esta en ' || r.depto_nombre || '; faltan los cuatro «Personal de Apertura» para comprobar las puertas.', actualizado_en = now()
                     where id = r.id;
                end if;
                v_espera := v_espera + 1;
                continue;
            end if;
        end if;

        if v_ok then
            update zk_movimientos set estado = 'verificado', verificado_en = now(), actualizado_en = now(),
                   detalle = case when r.estado = 'pendiente' then 'ZK ya lo refleja' else 'Verificado' end || ' con ' || v_cuando || '.'
             where id = r.id;
            if r.estado = 'pendiente' then
                perform zk_cerrar_caso(r.caso_id, 'ZK ya lo refleja', 'Comprobado con ' || v_cuando, v_quien);
                v_ya := v_ya + 1;
            else
                -- NUEVO 94: si el caso ya estaba cerrado, zk_cerrar_caso deja la nota.
                perform zk_cerrar_caso(r.caso_id, 'Hecho en ZK', 'Verificado con ' || v_cuando, v_quien);
                v_ver := v_ver + 1;
            end if;
            continue;
        end if;

        -- No cuadra. Solo cuenta si los archivos son de DESPUES de la tanda (con
        -- la hora de mas del reloj de ZK); lo pendiente simplemente sigue pendiente.
        if r.estado = 'pendiente' or v_motivo is null then
            continue;
        end if;
        v_fresco := case when v_por_puerta
            then v_pue_exp is not null and v_pue_exp - interval '1 hour' > (r.hecha_en at time zone 'America/Mexico_City')
            else v_pad.exportado_en is not null and v_pad.exportado_en - interval '1 hour' > (r.hecha_en at time zone 'America/Mexico_City')
        end;
        if not v_fresco then
            v_espera := v_espera + 1;
            continue;
        end if;
        if r.estado = 'hecho' then
            perform zk_reabrir_caso(r.caso_id, 'ZK no coincide con lo que se hizo en la tanda ' || r.tanda_numero || ': ' || v_motivo || ' (' || v_cuando || ').', v_quien);
            v_no := v_no + 1;
        end if;
        update zk_movimientos set estado = 'no_coincide', actualizado_en = now(),
               detalle = v_motivo || ' (' || v_cuando || ').'
         where id = r.id;
    end loop;

    return jsonb_build_object('verificados', v_ver, 'yaReflejados', v_ya, 'noCoinciden', v_no, 'porComprobar', v_espera,
                              'puertasCargadas', v_pue_n);
end;
$verificar$;

notify pgrst, 'reload schema';

commit;


-- ---------------------------------------------------------------------
-- 5. VERIFICACION (solo lectura). Seis filas con ok = true.
-- ---------------------------------------------------------------------
select 1 as orden, 'zk_movimientos acepta la clase placa con su destino' as que,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'zk_movimientos' and column_name = 'placa_destino')
       and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'zkm_que') like '%placa%'
       and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'zkm_destino') like '%placa_destino%'
       and (select bool_and(convalidated) from pg_constraint where conname in ('zkm_que', 'zkm_destino')) as ok
union all
select 2, 'zk_placa_comparable deja solo letras y numeros en mayusculas',
       zk_placa_comparable(' upp-388 d ') = 'UPP388D' and zk_placa_comparable(' - ') is null
union all
select 3, 'corregir_placa: una sola forma, security definer, anon no la ejecuta',
       (select count(*) = 1 from pg_proc where proname = 'corregir_placa')
       and (select prosecdef from pg_proc where proname = 'corregir_placa')
       and not has_function_privilege('anon', 'corregir_placa(uuid, text, text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'corregir_placa(uuid, text, text)', 'EXECUTE')
union all
select 4, 'las cuatro funciones de Movimientos en ZK traen el delta del 106 y conservan lo anterior, una forma cada una',
       (select count(*) = 4 from pg_proc where proname in
          ('ajustar_movimiento_zk', 'crear_tanda_zk', 'marcar_paso_tanda_zk', 'verificar_movimientos_zk'))
       and (select bool_and(prosrc like '%NUEVO 106%') from pg_proc where proname in
          ('ajustar_movimiento_zk', 'crear_tanda_zk', 'marcar_paso_tanda_zk', 'verificar_movimientos_zk'))
       and (select prosrc like '%Información del Personal%' and prosrc like '%placaDestino%' from pg_proc where proname = 'crear_tanda_zk')
       and (select prosrc like '%NUEVO 94%' and prosrc like '%p_placa_cmp%' from pg_proc where proname = 'verificar_movimientos_zk')
union all
select 5, 'ningun caso tiene dos movimientos vivos de la misma clase',
       not exists (select 1 from zk_movimientos
                    where estado in ('pendiente', 'en_tanda', 'hecho', 'no_coincide')
                    group by caso_id, que having count(*) > 1)
union all
select 6, 'ningun mensaje tutea',
       (select bool_and(prosrc !~* '\m(tu|tus|elige|escribe|reintenta|verifica)\M') from pg_proc
         where proname in ('corregir_placa', 'ajustar_movimiento_zk', 'crear_tanda_zk', 'marcar_paso_tanda_zk', 'verificar_movimientos_zk'))
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). Las placas ya corregidas en SATAG se quedan (son
-- datos, con su movimiento 'rectificacion'); los movimientos de placa en ZK
-- se borran, porque la clase deja de existir.
--
--   begin;
--   drop function if exists corregir_placa(uuid, text, text);
--   delete from zk_movimientos where que = 'placa';
--   alter table zk_movimientos drop constraint zkm_que, drop constraint zkm_destino;
--   alter table zk_movimientos
--       add constraint zkm_que     check (que in ('departamento', 'nombre')),
--       add constraint zkm_destino check ((que = 'departamento') = (depto_destino is not null)
--                                         and (que = 'nombre') = (coalesce(btrim(nombre_destino), '') <> ''));
--   alter table zk_movimientos drop column placa_destino;
--   -- Volver a correr los cuerpos de antes, con «create or replace function»:
--   --   ajustar_movimiento_zk   de 93_movimientos_zk.sql, lineas 601-640
--   --   marcar_paso_tanda_zk    de 93_movimientos_zk.sql, lineas 753-803
--   --   crear_tanda_zk          de 95_ruta_importar_zk.sql (completo)
--   --   verificar_movimientos_zk de 94_accion_zk_al_cerrar.sql, lineas 146-268
--   -- y hasta despues de eso:
--   drop function if exists zk_placa_comparable(text);
--   notify pgrst, 'reload schema';
--   commit;
-- ---------------------------------------------------------------------
