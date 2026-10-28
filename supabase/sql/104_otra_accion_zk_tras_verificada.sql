-- =====================================================================
-- BLOQUE 104 — Otra accion en ZK para un caso cuya accion anterior ya se
-- verifico.
--
-- 28/10/2026
--
-- POR QUE
--   Gerardo, 28-oct, sobre el caso C-000018 (TAG en BAJAS en ZK y de baja en
--   SATAG): «lo que quiero es quitarlo de bajas y pasarlo a padres de
--   familia, pero cuando quiero pasarlo a cerrados con la indicacion de
--   ponerlo en padres de familia para armar la tanda de ZK» el panel
--   contesta «El caso 18 ya tiene esa accion verificada: no se cambia lo que
--   ya va o ya se hizo en ZK».
--
--   La causa viene del 93 y el 94: el indice «un movimiento vivo por caso y
--   por clase» cuenta como vivo todo lo que no se cancelo, verificado
--   incluido; y pedir_movimiento_zk trata lo verificado como si siguiera en
--   camino. Pero un movimiento verificado ya es historia (ZK lo hizo y la
--   carga del padron lo comprobo), y un caso puede necesitar OTRA accion
--   despues: el mismo TAG va a BAJAS y, cuando la persona se presenta,
--   vuelve a Padres de familia. Hoy ese caso queda atorado para siempre.
--
-- QUE CAMBIA (cuerpos EXTRAIDOS de 94_accion_zk_al_cerrar.sql con delta
-- verificado por diff; mismas firmas: `create or replace`, sin drop ni regrant)
--   1. Indice ux_zk_movimientos_vivo: vivo es pendiente, en_tanda, hecho o
--      no_coincide. Verificado y cancelado son movimientos terminados y ya no
--      estorban a uno nuevo. Es mas estrecho que el de antes: ninguna fila de
--      hoy lo viola.
--   2. pedir_movimiento_zk: busca solo el movimiento VIVO de esa clase. Si lo
--      hay y esta en la tanda abierta o hecho en ZK, sigue rechazando (y dice
--      que al verificarse se podra pedir otra); si esta pendiente o
--      no_coincide, le cambia el destino como antes; si no hay vivo —porque
--      nunca lo hubo o porque el anterior ya se verifico— crea uno nuevo. Si
--      hubo uno verificado, la nota del caso empieza con «Otra accion en ZK
--      (la anterior ya se verifico)», para que se lea el cambio de rumbo.
--   3. generar_movimientos_zk: conserva la regla «el movimiento automatico
--      del titulo se da UNA sola vez por caso y clase»; lo verificado tambien
--      cuenta. Antes eso lo hacia el indice por conflicto; con el indice nuevo
--      hay que decirlo. Asi un caso que se reabre no recibe otra vez el
--      movimiento de su titulo (que la verificacion cerraria de inmediato con
--      «ZK ya lo refleja»): la segunda accion solo se pide a mano con
--      «Cerrar…». El `on conflict` apunta al predicado nuevo del indice.
--   4. Verificacion de solo lectura: filas con ok = true.
--
-- QUE NO CAMBIA
--   - verificar_movimientos_zk, zk_cerrar_caso y ajustar/armar/cerrar tanda no
--     se tocan: la verificacion ya recorre solo pendiente, hecho y no_coincide.
--   - Lo que ya esta en una tanda o hecho en ZK sigue sin poder cambiarse.
--
-- ORDEN: no agrega ni quita parametros; el cliente publicado llama igual. Se
-- puede aplicar en cualquier momento. En cuanto se aplique, «Cerrar…» con
-- accion en ZK vuelve a funcionar para el caso 18 con el cliente de hoy.
--
-- ANTES DE APLICAR, para ver lo que el panel no dice (solo lectura):
--   select c.numero, c.estado as caso, m.que, m.estado, d.nombre as destino,
--          t.numero as tanda, m.verificado_en, m.detalle
--     from casos c join zk_movimientos m on m.caso_id = c.id
--     left join zk_departamentos d on d.id = m.depto_destino
--     left join zk_tandas t on t.id = m.tanda_id
--    where c.numero = 18 order by m.creado_en;
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. GUARDIA
-- ---------------------------------------------------------------------
do $guardia$
begin
    if exists (select 1 from pg_proc where proname = 'pedir_movimiento_zk' and prosrc like '%NUEVO 104%') then
        raise exception 'El bloque 104 ya esta aplicado. No se aplico nada.';
    end if;
    if to_regprocedure('public.pedir_movimiento_zk(uuid, text, text, text, text)') is null
       or not exists (select 1 from pg_proc where proname = 'generar_movimientos_zk' and prosrc like '%NUEVO 94%') then
        raise exception 'Falta el bloque 94 (accion en ZK al cerrar). No se aplico nada.';
    end if;
    if (select count(*) from pg_proc where proname in ('pedir_movimiento_zk', 'generar_movimientos_zk')) <> 2 then
        raise exception 'pedir_movimiento_zk o generar_movimientos_zk tienen mas de una forma. No se aplico nada: revise que bloque las dejo asi.';
    end if;
    if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'ux_zk_movimientos_vivo'
                    and indexdef like '%(estado <> ''cancelado''::text)%') then
        raise exception 'ux_zk_movimientos_vivo no es el del bloque 93. No se aplico nada: revise que bloque lo dejo asi.';
    end if;
    if not exists (select 1 from pg_proc where proname = 'generar_movimientos_zk'
                    and prosrc like '%on conflict (caso_id, que) where estado <> ''cancelado'' do nothing%') then
        raise exception 'generar_movimientos_zk no es la del bloque 94. No se aplico nada: revise que bloque la dejo asi.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. EL INDICE: vivo es lo que todavia puede cambiar en ZK
-- ---------------------------------------------------------------------
drop index ux_zk_movimientos_vivo;
create unique index ux_zk_movimientos_vivo on zk_movimientos (caso_id, que)
    where estado in ('pendiente', 'en_tanda', 'hecho', 'no_coincide');
comment on index ux_zk_movimientos_vivo is
    'Un movimiento vivo (pendiente, en tanda, hecho o no_coincide) por caso y por clase; lo verificado y lo cancelado ya terminaron (bloque 104).';


-- ---------------------------------------------------------------------
-- 2. PEDIR LA ACCION EN ZK DE UN CASO (cuerpo del 94, con su delta)
-- ---------------------------------------------------------------------
create or replace function pedir_movimiento_zk(
    p_caso           uuid,
    p_que            text,
    p_depto_destino  text default null,
    p_nombre_destino text default null,
    p_hecho_por      text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $pedir$
declare
    v_quien   text;
    v_caso    record;
    v_m       record;
    v_depto   text;
    v_nombre  text := nullif(left(btrim(coalesce(p_nombre_destino, '')), 200), '');
    v_texto   text;
    v_id      uuid;
begin
    perform panel_exigir_rol(array['ti']);
    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    select id, numero, tarjeta, estado into v_caso from casos where id = p_caso;
    if v_caso.id is null then
        raise exception 'Ese caso ya no existe. Vuelva a abrir la pantalla.';
    end if;
    if v_caso.tarjeta is null then
        raise exception 'El caso % no tiene TAG: no hay a quien mover en ZK.', v_caso.numero;
    end if;
    if v_caso.estado = 'descartado' then
        raise exception 'El caso % está descartado: no pide nada en ZK.', v_caso.numero;
    end if;
    if p_que = 'departamento' then
        select id into v_depto from zk_departamentos where id = btrim(coalesce(p_depto_destino, ''));
        if v_depto is null then
            raise exception 'Elija un departamento de ZK de la lista.';
        end if;
        select 'Acción en ZK: pasarlo a ' || nombre into v_texto from zk_departamentos where id = v_depto;
    elsif p_que = 'nombre' then
        if v_nombre is null then
            raise exception 'Escriba el nombre como debe quedar en ZK.';
        end if;
        v_texto := 'Acción en ZK: corregir el nombre a «' || v_nombre || '»';
    else
        raise exception 'La acción en ZK es pasarlo a un departamento o corregir su nombre.';
    end if;

    -- NUEVO 104: solo cuenta el movimiento VIVO de esa clase. Lo verificado es
    -- historia: no estorba, pero se dice en la nota que esta es otra accion.
    select * into v_m from zk_movimientos where caso_id = p_caso and que = p_que
       and estado in ('pendiente', 'en_tanda', 'hecho', 'no_coincide') for update;
    if v_m.id is not null and v_m.estado in ('en_tanda', 'hecho') then
        raise exception 'El caso % ya tiene esa acción %: no se cambia lo que ya va o ya se hizo en ZK. En cuanto la carga del padrón la verifique, se puede pedir otra.',
            v_caso.numero, case v_m.estado when 'en_tanda' then 'en la tanda abierta' else 'hecha en ZK' end;
    end if;
    if exists (select 1 from zk_movimientos where caso_id = p_caso and que = p_que and estado = 'verificado') then
        v_texto := replace(v_texto, 'Acción en ZK:', 'Otra acción en ZK (la anterior ya se verificó):');
    end if;
    if v_m.id is not null then
        update zk_movimientos set depto_destino = v_depto, nombre_destino = v_nombre, actualizado_en = now()
         where id = v_m.id;
        v_id := v_m.id;
    else
        insert into zk_movimientos (caso_id, tarjeta, que, depto_destino, nombre_destino, creado_por)
        values (p_caso, v_caso.tarjeta, p_que, v_depto, v_nombre, v_quien)
        returning id into v_id;
    end if;
    insert into casos_notas (caso_id, clase, nota, hecho_por) values (p_caso, 'nota', v_texto || '.', v_quien);

    return jsonb_build_object('movimiento', v_id, 'caso', v_caso.numero, 'estado', coalesce(v_m.estado, 'pendiente'));
end;
$pedir$;


-- ---------------------------------------------------------------------
-- 3. GENERAR LOS MOVIMIENTOS DESDE LOS CASOS (cuerpo del 94, con su delta)
-- ---------------------------------------------------------------------
create or replace function generar_movimientos_zk(p_hecho_por text default null) returns jsonb
language plpgsql security definer set search_path = public
as $generar$
declare
    v_quien   text;
    v_nuevos  int := 0;
    v_cancel  int;
    v_sin     text[] := array[]::text[];
    r         record;
    v_destino text;
    v_depto   text;
begin
    perform panel_exigir_rol(array['ti']);
    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    -- NUEVO 94: cerrar un caso es decidir que hacer; su movimiento sigue
    -- pendiente. Solo un caso DESCARTADO cancela su movimiento.
    update zk_movimientos m
       set estado = 'cancelado', actualizado_en = now(), detalle = 'El caso se descartó.'
     where m.estado = 'pendiente'
       and exists (select 1 from casos c where c.id = m.caso_id and c.estado = 'descartado');
    get diagnostics v_cancel = row_count;

    for r in
        select c.id, c.numero, c.tipo, c.titulo, c.tarjeta
          from casos c
         where c.estado in ('nuevo', 'abierto', 'esperando', 'seguimiento')
           and c.tarjeta is not null
           and c.tipo in ('departamento-distinto', 'exempleado-tag-vivo', 'nombre-en-zk')
         order by c.numero
    loop
        -- NUEVO 104: el movimiento del titulo se da UNA sola vez por caso y
        -- clase; lo verificado tambien cuenta (antes lo hacia el indice).
        if exists (select 1 from zk_movimientos m where m.caso_id = r.id and m.estado <> 'cancelado'
                      and m.que = case when r.tipo = 'nombre-en-zk' then 'nombre' else 'departamento' end) then
            continue;
        end if;
        if r.tipo = 'nombre-en-zk' then
            v_destino := btrim(substring(r.titulo from 'debe decir «([^»]+)»'));
            if coalesce(v_destino, '') = '' then
                v_sin := array_append(v_sin, r.numero::text);
                continue;
            end if;
            insert into zk_movimientos (caso_id, tarjeta, que, nombre_destino, creado_por)
            values (r.id, r.tarjeta, 'nombre', v_destino, v_quien)
            on conflict (caso_id, que) where estado in ('pendiente', 'en_tanda', 'hecho', 'no_coincide') do nothing;
        else
            v_destino := case when r.tipo = 'exempleado-tag-vivo' then 'BAJAS'
                              else btrim(substring(r.titulo from 'le toca «([^»]+)»')) end;
            v_depto := null;
            select d.id into v_depto from zk_departamentos d
             where zk_texto_comparable(d.nombre) = zk_texto_comparable(v_destino);
            if v_depto is null then
                v_sin := array_append(v_sin, r.numero::text);
                continue;
            end if;
            insert into zk_movimientos (caso_id, tarjeta, que, depto_destino, creado_por)
            values (r.id, r.tarjeta, 'departamento', v_depto, v_quien)
            on conflict (caso_id, que) where estado in ('pendiente', 'en_tanda', 'hecho', 'no_coincide') do nothing;
        end if;
        if found then
            v_nuevos := v_nuevos + 1;
        end if;
    end loop;

    return jsonb_build_object('nuevos', v_nuevos, 'cancelados', v_cancel, 'casosSinDestino', to_jsonb(v_sin));
end;
$generar$;

notify pgrst, 'reload schema';

commit;


-- ---------------------------------------------------------------------
-- 4. VERIFICACION (solo lectura). Cinco filas con ok = true.
-- ---------------------------------------------------------------------
select 1 as orden, 'el indice vivo es unico y deja fuera lo verificado y lo cancelado' as que,
       exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'ux_zk_movimientos_vivo'
                and indexdef like '%UNIQUE%' and indexdef like '%no_coincide%'
                and indexdef not like '%<> ''cancelado''%') as ok
union all
select 2, 'pedir_movimiento_zk es la del 104, una sola forma, security definer y anon no la ejecuta',
       (select count(*) = 1 from pg_proc where proname = 'pedir_movimiento_zk')
       and (select prosecdef and prosrc like '%NUEVO 104%' and prosrc not like '%else ''verificada''%'
              from pg_proc where proname = 'pedir_movimiento_zk')
       and not has_function_privilege('anon', 'pedir_movimiento_zk(uuid, text, text, text, text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'pedir_movimiento_zk(uuid, text, text, text, text)', 'EXECUTE')
union all
select 3, 'generar_movimientos_zk es la del 104 (salta al caso que ya tuvo movimiento de esa clase) y conserva lo del 94',
       (select count(*) = 1 from pg_proc where proname = 'generar_movimientos_zk')
       and (select prosrc like '%NUEVO 104%' and prosrc like '%NUEVO 94%'
                   and prosrc not like '%where estado <> ''cancelado'' do nothing%'
              from pg_proc where proname = 'generar_movimientos_zk')
union all
select 4, 'ningun caso tiene dos movimientos vivos de la misma clase',
       not exists (select 1 from zk_movimientos
                    where estado in ('pendiente', 'en_tanda', 'hecho', 'no_coincide')
                    group by caso_id, que having count(*) > 1)
union all
select 5, 'ningun mensaje tutea',
       (select bool_and(prosrc !~* '\m(tu|tus|elige|escribe|reintenta|verifica)\M') from pg_proc
         where proname in ('pedir_movimiento_zk', 'generar_movimientos_zk'))
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). Los movimientos pedidos se quedan (son datos).
--
--   begin;
--   drop index ux_zk_movimientos_vivo;
--   -- Falla si algun caso ya tiene un movimiento nuevo ademas del verificado:
--   -- antes hay que cancelar el nuevo (ajustar_movimiento_zk con p_cancelar).
--   create unique index ux_zk_movimientos_vivo on zk_movimientos (caso_id, que) where estado <> 'cancelado';
--   -- Y volver a correr, de 94_accion_zk_al_cerrar.sql, los cuerpos de
--   -- pedir_movimiento_zk (cambiando «create function» por «create or replace
--   -- function») y generar_movimientos_zk (ya es «create or replace»).
--   notify pgrst, 'reload schema';
--   commit;
-- ---------------------------------------------------------------------
