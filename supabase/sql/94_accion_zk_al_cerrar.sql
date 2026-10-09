-- =====================================================================
-- BLOQUE 94 — La accion en ZK sale de los casos que se cierran con su decision.
--
-- SC-032 · 09/10/2026
--
-- POR QUE
--   Gerardo, 9-oct: Miguel revisa los casos y escribe que hacer; el caso pasa
--   a Cerrado CON LA ACCION A TOMAR, y Movimientos en ZK toma de ahi que hacer.
--   El 93 hacia lo contrario: solo tomaba casos abiertos y CANCELABA el
--   movimiento de un caso que se cerraba. Ahora cerrar es decidir; hacerlo en
--   ZK es la tanda; comprobarlo, la verificacion.
--
-- QUE CAMBIA (cuerpos EXTRAIDOS de 93_movimientos_zk.sql con delta verificado
-- por diff; mismas firmas: `create or replace`, sin drop ni regrant):
--   1. zk_cerrar_caso (interna): si el caso ya esta cerrado, le agrega una nota
--      («Hecho en ZK. Tanda N…», «Verificado con…») en vez de no hacer nada.
--   2. generar_movimientos_zk: solo un caso DESCARTADO cancela su movimiento
--      pendiente; uno resuelto lo conserva.
--   3. verificar_movimientos_zk: deja de escribir su propia nota al verificar
--      (ya la deja zk_cerrar_caso); asi no salen dos.
--   4. RPC NUEVO pedir_movimiento_zk(caso, que, depto, nombre, hecho_por) (ti):
--      pide o cambia la accion en ZK de un caso, abierto o cerrado. Es lo que
--      usa «Cerrar…» con «Accion en ZK» y el detalle del caso.
--   5. Verificacion de solo lectura: filas con ok = true.
--
-- Este bloque solo AGREGA una funcion y cambia cuerpos sin cambiar firmas: va
-- ANTES del deploy del cliente. Con el cliente de hoy no cambia nada visible,
-- salvo que cerrar un caso ya no cancela su movimiento.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. GUARDIA
-- ---------------------------------------------------------------------
do $guardia$
begin
    if exists (select 1 from pg_proc where proname = 'pedir_movimiento_zk') then
        raise exception 'El bloque 94 ya esta aplicado. No se aplico nada.';
    end if;
    if to_regclass('public.zk_movimientos') is null
       or to_regprocedure('public.zk_cerrar_caso(uuid, text, text, text)') is null then
        raise exception 'Falta el bloque 93 (movimientos en ZK). No se aplico nada.';
    end if;
    if not exists (select 1 from pg_proc where proname = 'generar_movimientos_zk'
                    and prosrc like '%c.estado in (''resuelto'', ''descartado'')%') then
        raise exception 'generar_movimientos_zk no es la del bloque 93. No se aplico nada: revise que bloque la dejo asi.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1 a 3. LOS TRES CUERPOS, con su delta
-- ---------------------------------------------------------------------
create or replace function zk_cerrar_caso(p_caso uuid, p_motivo text, p_nota text, p_quien text) returns void
language plpgsql security definer set search_path = public
as $$
declare v_antes text;
begin
    select estado into v_antes from casos where id = p_caso for update;
    if v_antes is null then
        return;
    end if;
    -- NUEVO 94: un caso ya cerrado (con la decision de que hacer) no se vuelve a
    -- cerrar: se le agrega la nota de lo que paso en ZK.
    if v_antes in ('resuelto', 'descartado') then
        insert into casos_notas (caso_id, clase, nota, hecho_por)
        values (p_caso, 'nota', left(concat_ws('. ', p_motivo, nullif(p_nota, '')), 4000), p_quien);
        return;
    end if;
    update casos
       set estado = 'resuelto', actualizado_en = now(),
           espera_motivo = null, espera_hasta = null, espera_texto = null, atorado = false,
           cerrado_por = p_quien, cerrado_en = now(),
           cierre_nota = left(concat_ws('. ', p_motivo, nullif(p_nota, '')), 4000), cierre_motivo = p_motivo
     where id = p_caso;
    insert into casos_notas (caso_id, clase, estado_antes, estado_despues, nota, hecho_por)
    values (p_caso, 'estado', v_antes, 'resuelto', left(concat_ws('. ', p_motivo, nullif(p_nota, '')), 4000), p_quien);
end;
$$;

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
        if r.tipo = 'nombre-en-zk' then
            v_destino := btrim(substring(r.titulo from 'debe decir «([^»]+)»'));
            if coalesce(v_destino, '') = '' then
                v_sin := array_append(v_sin, r.numero::text);
                continue;
            end if;
            insert into zk_movimientos (caso_id, tarjeta, que, nombre_destino, creado_por)
            values (r.id, r.tarjeta, 'nombre', v_destino, v_quien)
            on conflict (caso_id, que) where estado <> 'cancelado' do nothing;
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
            on conflict (caso_id, que) where estado <> 'cancelado' do nothing;
        end if;
        if found then
            v_nuevos := v_nuevos + 1;
        end if;
    end loop;

    return jsonb_build_object('nuevos', v_nuevos, 'cancelados', v_cancel, 'casosSinDestino', to_jsonb(v_sin));
end;
$generar$;

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
               zk_texto_comparable(concat_ws(' ', nullif(p.nombres, ''), nullif(p.apellidos, ''))) as p_nombre
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


-- ---------------------------------------------------------------------
-- 4. PEDIR LA ACCION EN ZK DE UN CASO (abierto o cerrado)
--
-- Si el caso ya tiene un movimiento vivo de esa clase y aun no esta en una
-- tanda, se le cambia el destino; si no tiene, se crea pendiente. Si esta en
-- una tanda o ya se hizo, no se toca: lo que se hizo en ZK manda.
-- ---------------------------------------------------------------------
create function pedir_movimiento_zk(
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

    select * into v_m from zk_movimientos where caso_id = p_caso and que = p_que and estado <> 'cancelado' for update;
    if v_m.id is not null and v_m.estado in ('en_tanda', 'hecho', 'verificado') then
        raise exception 'El caso % ya tiene esa acción %: no se cambia lo que ya va o ya se hizo en ZK.',
            v_caso.numero, case v_m.estado when 'en_tanda' then 'en la tanda abierta' when 'hecho' then 'hecha en ZK' else 'verificada' end;
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

revoke all     on function pedir_movimiento_zk(uuid, text, text, text, text) from public, anon;
grant  execute on function pedir_movimiento_zk(uuid, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;


-- ---------------------------------------------------------------------
-- 5. VERIFICACION (solo lectura). Cinco filas con ok = true.
-- ---------------------------------------------------------------------
select 1 as orden, 'pedir_movimiento_zk existe, es security definer y anon no la ejecuta' as que,
       exists (select 1 from pg_proc where proname = 'pedir_movimiento_zk' and prosecdef)
       and not has_function_privilege('anon', 'pedir_movimiento_zk(uuid, text, text, text, text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'pedir_movimiento_zk(uuid, text, text, text, text)', 'EXECUTE') as ok
union all
select 2, 'cerrar un caso ya no cancela su movimiento (solo descartarlo)',
       (select prosrc like '%c.estado = ''descartado''%' and prosrc not like '%c.estado in (''resuelto'', ''descartado'')%'
          from pg_proc where proname = 'generar_movimientos_zk')
union all
select 3, 'un caso ya cerrado recibe la nota de lo que paso en ZK',
       (select prosrc like '%NUEVO 94%' and prosrc like '%''nota''%' from pg_proc where proname = 'zk_cerrar_caso')
union all
select 4, 'la verificacion no escribe una segunda nota, y cada funcion tiene una sola forma',
       (select prosrc not like '%Verificado en ZK con%' from pg_proc where proname = 'verificar_movimientos_zk')
       and (select count(*) from pg_proc where proname in ('zk_cerrar_caso', 'generar_movimientos_zk', 'verificar_movimientos_zk', 'pedir_movimiento_zk')) = 4
       and not has_function_privilege('authenticated', 'zk_cerrar_caso(uuid, text, text, text)', 'EXECUTE')
union all
select 5, 'ningun mensaje tutea',
       (select bool_and(prosrc !~* '\m(tu|tus|elige|escribe|reintenta|verifica)\M') from pg_proc
         where proname in ('pedir_movimiento_zk', 'generar_movimientos_zk', 'zk_cerrar_caso'))
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). ANTES DE NADA: revierta el deploy del cliente que usa
-- pedir_movimiento_zk. Los movimientos pedidos se quedan (son datos).
--
--   drop function if exists pedir_movimiento_zk(uuid, text, text, text, text);
--   -- Y volver a correr, de 93_movimientos_zk.sql, los tres cuerpos como estaban
--   -- (zk_cerrar_caso, generar_movimientos_zk y verificar_movimientos_zk),
--   -- cambiando «create function» por «create or replace function».
--   notify pgrst, 'reload schema';
-- ---------------------------------------------------------------------
