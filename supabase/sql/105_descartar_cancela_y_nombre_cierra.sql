-- =====================================================================
-- BLOQUE 105 — Descartar un caso retira su accion en ZK, y corregir el
-- nombre cierra el caso con la suya.
--
-- 30/10/2026
--
-- POR QUE
--   Gerardo, 29-oct: la Bandeja de Sistemas decia «Pasar a ZK 2 cambios
--   decididos» y Movimientos en ZK decia «No hay movimientos pendientes».
--   La consulta de solo lectura dio dos movimientos pendientes que ninguna
--   pantalla lista:
--
--   1. Caso 304, DESCARTADO, con una accion «pasarlo a un departamento»
--      pendiente desde el 15-oct. Descartar desde el tablero (mover_casos,
--      90/96) solo cambia el estado del caso; lo unico que cancelaba la
--      accion de un caso descartado era el primer paso de
--      generar_movimientos_zk (93/94), y desde el 9-oct (commit c955760,
--      «solo lo que se decidio al cerrar un caso») nadie la llama: ni el
--      panel ni otro RPC. Esa limpieza no ha corrido desde entonces.
--
--   2. Caso 336, ABIERTO, tipo nombre-en-zk, con la accion «nombre»
--      pendiente desde el 28-oct. Lo creo corregir_nombre (103), que abre el
--      caso en «abierto» y le pide la accion, pero no lo cierra. La regla del
--      9-oct dice que un movimiento solo cuenta cuando su caso se cerro con
--      la accion; el 103 ya decidio por Sistemas y aun asi dejo el caso sin
--      cerrar. Hueco entre el 103 y la regla del 9-oct.
--
--   El cliente, por su lado, contaba en la Bandeja todo movimiento
--   «pendiente» sin mirar su caso (apiBandeja.ts); se corrige a la par con la
--   misma regla que la pantalla (esMovimientoDecidido en lib/zk/movimientos).
--
-- QUE CAMBIA (cuerpos EXTRAIDOS de 96_casos_consultar_cp.sql y de
-- 103_corregir_nombre.sql con delta verificado por diff; mismas firmas:
-- `create or replace`, sin drop ni regrant)
--   1. mover_casos: al pasar un caso a «descartado», sus movimientos en ZK
--      que siguen pendientes o no_coincide se cancelan («El caso se
--      descartó.»), dentro de la misma transaccion. Lo que ya va en una
--      tanda o ya se hizo en ZK no se toca: lo cierra la verificacion (93).
--      Es la regla del 94 («solo un caso DESCARTADO cancela su movimiento»)
--      puesta donde si se ejecuta: en el RPC que descarta.
--   2. corregir_nombre: despues de pedir la accion, cierra el caso con
--      zk_cerrar_caso (93) como lo hace «Cerrar…» con «Accion en ZK»:
--      resuelto, motivo «Decidido; falta hacerlo en ZK», con el movimiento
--      pendiente. Asi la peticion aparece en Movimientos en ZK y entra a la
--      tanda; si ZK no coincide despues, la verificacion reabre el caso.
--   3. Datos, una sola vez:
--      a. Se cancelan los movimientos pendientes o no_coincide cuyo caso esta
--         descartado (hoy: el del caso 304) y se anota en el caso.
--      b. Los casos nombre-en-zk que corregir_nombre dejo abiertos con su
--         accion pendiente (hoy: el 336) se cierran como lo hara la funcion
--         de ahora en adelante. Si Gerardo ya cerro el 336 a mano, no
--         encuentra nada y sigue.
--   4. Verificacion de solo lectura: seis filas con ok = true.
--
-- QUE NO CAMBIA
--   - generar_movimientos_zk sigue existiendo y sin que nadie la llame
--     (decision del 9-oct); pedir_movimiento_zk, la verificacion y las tandas
--     no se tocan.
--   - Reabrir un caso resuelto (boton «Reabrir») conserva su accion
--     pendiente, que deja de listarse hasta que el caso se vuelva a cerrar.
--     La Bandeja lo avisa desde este deploy («acciones en ZK esperan a que se
--     cierre su caso»).
--
-- ORDEN: no agrega ni quita parametros; el cliente publicado llama igual. Se
-- puede aplicar antes o despues del deploy del cliente.
--
-- ANTES DE APLICAR, para ver lo que el panel no dice (solo lectura):
--   select c.numero as caso, c.estado as caso_estado, c.tipo, m.tarjeta, m.que,
--          m.estado, m.actualizado_en
--     from zk_movimientos m join casos c on c.id = m.caso_id
--    where m.estado = 'pendiente' order by c.numero;
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. GUARDIA
-- ---------------------------------------------------------------------
do $guardia$
begin
    if exists (select 1 from pg_proc where proname = 'mover_casos' and prosrc like '%NUEVO 105%') then
        raise exception 'El bloque 105 ya esta aplicado. No se aplico nada.';
    end if;
    if (select count(*) from pg_proc where proname = 'mover_casos') <> 1
       or not exists (select 1 from pg_proc where proname = 'mover_casos' and prosrc like '%NUEVO 96%') then
        raise exception 'mover_casos no es la del bloque 96 o tiene mas de una forma. No se aplico nada: revise que bloque la dejo asi.';
    end if;
    if (select count(*) from pg_proc where proname = 'corregir_nombre') <> 1
       or to_regprocedure('public.corregir_nombre(uuid, text, text, text, text)') is null
       or not exists (select 1 from pg_proc where proname = 'corregir_nombre'
                       and prosrc like '%perform pedir_movimiento_zk(v_caso.id, ''nombre'', null, v_nuevo, v_quien);%') then
        raise exception 'corregir_nombre no es la del bloque 103 o tiene mas de una forma. No se aplico nada: revise que bloque la dejo asi.';
    end if;
    if to_regclass('public.zk_movimientos') is null
       or to_regprocedure('public.zk_cerrar_caso(uuid, text, text, text)') is null then
        raise exception 'Falta el bloque 93 (movimientos en ZK). No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. mover_casos: descartar cancela lo que el caso pidio en ZK
--    (cuerpo del 96, lineas 50-148, con el delta «NUEVO 105»)
-- ---------------------------------------------------------------------
create or replace function mover_casos(
    p_casos         uuid[],
    p_estado        text,
    p_nota          text default '',
    p_motivo        text default null,
    p_espera_motivo text default null,
    p_espera_hasta  date default null,
    p_espera_texto  text default null,
    p_hecho_por     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $mover$
declare
    v_quien   text;
    v_nota    text := btrim(coalesce(p_nota, ''));
    v_motivo  text := nullif(btrim(coalesce(p_motivo, '')), '');
    v_esp     text := nullif(btrim(coalesce(p_espera_motivo, '')), '');
    v_texto   text := nullif(btrim(coalesce(p_espera_texto, '')), '');
    v_cierra  boolean := p_estado in ('resuelto', 'descartado');
    v_linea   text;
    v_caso    record;
    v_movidos int := 0;
begin
    perform panel_exigir_rol(array['ti', 'contador', 'admin']);

    if p_casos is null or cardinality(p_casos) = 0 then
        raise exception 'Elija al menos un caso.';
    end if;
    if cardinality(p_casos) > 500 then
        raise exception 'Son demasiados casos a la vez: mueva menos de 500.';
    end if;
    if p_estado is null or p_estado not in ('abierto', 'consultar', 'esperando', 'resuelto', 'descartado') then
        raise exception 'El caso solo puede pasar a Por atender, Consultar con el CP, Esperando o Cerrado.';
    end if;
    if char_length(v_nota) > 4000 or char_length(coalesce(v_motivo, '')) > 200 or char_length(coalesce(v_texto, '')) > 200 then
        raise exception 'El texto es demasiado largo.';
    end if;
    if p_estado = 'esperando' then
        if v_esp is null or v_esp not in ('persona', 'tercero', 'fecha') then
            raise exception 'Diga que se espera: a la persona, a alguien de fuera o una fecha.';
        end if;
        if v_esp = 'fecha' and (p_espera_hasta is null or p_espera_hasta <= (now() at time zone 'America/Mexico_City')::date) then
            raise exception 'La fecha de espera tiene que ser posterior a hoy.';
        end if;
        if v_esp = 'tercero' and v_texto is null then
            raise exception 'Escriba a quien o que se espera.';
        end if;
    end if;
    -- NUEVO 96: consultar con el CP pide la pregunta, como esperar a un tercero.
    if p_estado = 'consultar' and v_texto is null then
        raise exception 'Escriba qué hay que consultar con el CP.';
    end if;
    if v_cierra and v_motivo is null and v_nota = '' then
        raise exception 'Para cerrar, elija el motivo o escriba que se hizo.';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');
    v_linea := case
        when v_cierra then concat_ws('. ', v_motivo, nullif(v_nota, ''))
        when p_estado = 'consultar' then 'Consultar con el CP: ' || v_texto || coalesce(' — ' || nullif(v_nota, ''), '')
        when p_estado = 'esperando' then concat_ws('. ',
            case v_esp when 'persona' then 'Esperando a que la persona se presente'
                       when 'tercero' then 'Esperando a ' || v_texto
                       else 'Esperando hasta el ' || to_char(p_espera_hasta, 'DD/MM/YYYY') end,
            nullif(v_nota, ''))
        else v_nota
    end;

    for v_caso in select id, estado from casos where id = any (p_casos) order by numero for update loop
        if v_caso.estado = p_estado then
            continue;
        end if;
        update casos
           set estado         = p_estado,
               actualizado_en = now(),
               espera_motivo  = case when p_estado = 'esperando' then v_esp end,
               espera_hasta   = case when p_estado = 'esperando' and v_esp = 'fecha' then p_espera_hasta end,
               espera_texto   = case when p_estado in ('esperando', 'consultar') then v_texto end,
               atorado        = case when p_estado = 'abierto' then atorado else false end,
               cerrado_por    = case when v_cierra then v_quien end,
               cerrado_en     = case when v_cierra then now() end,
               cierre_nota    = case when v_cierra then v_linea end,
               cierre_motivo  = case when v_cierra then v_motivo end
         where id = v_caso.id;
        insert into casos_notas (caso_id, clase, estado_antes, estado_despues, nota, hecho_por)
        values (v_caso.id, 'estado', v_caso.estado, p_estado,
                left(v_linea || case when cardinality(p_casos) > 1 then ' (junto con otros ' || (cardinality(p_casos) - 1) || ')' else '' end, 4000),
                v_quien);
        -- NUEVO 105: descartar retira lo que el caso pidio en ZK y todavia no
        -- se hizo. Lo que ya va en una tanda o ya se hizo sigue su camino: lo
        -- cierra la verificacion con los archivos de ZK (93).
        if p_estado = 'descartado' then
            update zk_movimientos
               set estado = 'cancelado', actualizado_en = now(), detalle = 'El caso se descartó.'
             where caso_id = v_caso.id and estado in ('pendiente', 'no_coincide');
        end if;
        v_movidos := v_movidos + 1;
    end loop;

    if v_movidos = 0 and not exists (select 1 from casos where id = any (p_casos)) then
        raise exception 'Los casos no existen. Vuelva a abrir la pantalla y reintente.';
    end if;
    return jsonb_build_object('movidos', v_movidos, 'estado', p_estado, 'hechoPor', v_quien);
end;
$mover$;
revoke all     on function mover_casos(uuid[], text, text, text, text, date, text, text) from public, anon;
grant  execute on function mover_casos(uuid[], text, text, text, text, date, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 2. corregir_nombre: la correccion ya es la decision; el caso se cierra
--    (cuerpo del 103, lineas 105-240, con el delta «NUEVO 105»)
-- ---------------------------------------------------------------------
create or replace function corregir_nombre(
    p_registro_id      uuid,
    p_nombres          text,
    p_apellido_paterno text,
    p_apellido_materno text,
    p_motivo           text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $corregir$
declare
    v_quien    text;
    v_motivo   text := btrim(coalesce(p_motivo, ''));
    v_nombres  text := regexp_replace(btrim(coalesce(p_nombres, '')), '\s+', ' ', 'g');
    v_paterno  text := regexp_replace(btrim(coalesce(p_apellido_paterno, '')), '\s+', ' ', 'g');
    v_materno  text := nullif(regexp_replace(btrim(coalesce(p_apellido_materno, '')), '\s+', ' ', 'g'), '');
    r          registros%rowtype;
    v_antes    text;
    v_nuevo    text;
    v_satag    boolean;
    v_tarjeta  text;
    v_zk       record;
    v_zk_dice  text;
    v_zk_est   text;
    v_caso     record;
    v_numero   bigint;
    v_caso_nvo boolean := false;
    v_linea    text;
begin
    perform panel_exigir_rol(array['ti']);

    v_quien := nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '');
    if v_quien is null then
        raise exception 'No se pudo identificar a quien corrige desde la sesion. Cierre sesion y vuelva a entrar.';
    end if;

    select * into r from registros where id = p_registro_id for update;
    if r.id is null then
        raise exception 'Registro no encontrado';
    end if;
    if v_nombres = '' or v_paterno = '' then
        raise exception 'Escriba el nombre y el apellido paterno.';
    end if;
    if char_length(v_nombres) > 50 or char_length(v_paterno) > 50 or char_length(coalesce(v_materno, '')) > 50 then
        raise exception 'Cada parte del nombre puede tener hasta 50 caracteres.';
    end if;
    if char_length(v_motivo) < 5 or char_length(v_motivo) > 500 then
        raise exception 'Escriba por que se corrige el nombre (de 5 a 500 caracteres).';
    end if;

    v_antes := r.usuario_nombre_completo;
    v_nuevo := btrim(v_nombres || ' ' || v_paterno || coalesce(' ' || v_materno, ''));
    v_satag := (r.usuario_nombres, r.usuario_apellido_paterno, coalesce(r.usuario_apellido_materno, ''))
               is distinct from (v_nombres, v_paterno, coalesce(v_materno, ''));

    -- Lo que dice ZK de su TAG vigente (el padron guardado, no ZK en vivo).
    v_tarjeta := case when r.estado <> 'baja' then nullif(btrim(coalesce(r.no_dispositivo, '')), '') end;
    if v_tarjeta is not null then
        select p.vigente, concat_ws(' ', nullif(p.nombres, ''), nullif(p.apellidos, '')) as dice
          into v_zk from zk_padron p where p.tarjeta = v_tarjeta;
        v_zk_dice := nullif(btrim(coalesce(v_zk.dice, '')), '');
    end if;
    v_zk_est := case when v_tarjeta is null then 'sin_tag'
                     when v_zk.vigente is not true then 'sin_zk'
                     when zk_texto_comparable(v_zk_dice) = zk_texto_comparable(v_nuevo) then 'coincide'
                     else 'pedido' end;

    if not v_satag and v_zk_est <> 'pedido' then
        raise exception 'El nombre ya es «%» en SATAG%: no hay nada que corregir.', v_nuevo,
            case v_zk_est when 'coincide' then ' y en ZK' else '' end;
    end if;

    -- a. SATAG
    if v_satag then
        update registros
           set usuario_nombres = v_nombres,
               usuario_apellido_paterno = v_paterno,
               usuario_apellido_materno = v_materno
         where id = r.id;

        insert into movimientos (registro_id, tipo, motivo, hecho_por)
        values (r.id, 'rectificacion',
                left('Nombre corregido: «' || v_antes || '» → «' || v_nuevo || '». ' || v_motivo, 600), v_quien);
    end if;

    -- b. ZK: el caso «Corregir el nombre en ZK» con su accion pedida.
    if v_zk_est = 'pedido' then
        v_linea := 'Nombre corregido por Sistemas: SATAG ' ||
                   case when v_satag then 'pasa de «' || v_antes || '» a «' || v_nuevo || '»'
                        else 'ya dice «' || v_nuevo || '»' end ||
                   '; ZK dice «' || coalesce(v_zk_dice, 'sin nombre') || '». Motivo: ' || v_motivo;

        select id, numero into v_caso
          from casos
         where tipo = 'nombre-en-zk' and tarjeta = v_tarjeta
           and estado not in ('resuelto', 'descartado')
         order by creado_en desc
         limit 1
         for update;

        if v_caso.id is not null then
            update casos
               set titulo = 'Nombre en ZK: debe decir «' || v_nuevo || '»',
                   registro_id = coalesce(registro_id, r.id),
                   actualizado_en = now()
             where id = v_caso.id;
            insert into casos_notas (caso_id, clase, nota, hecho_por)
            values (v_caso.id, 'nota', left(v_linea, 4000), v_quien);
            v_numero := v_caso.numero;
        else
            insert into casos (tipo, registro_id, tarjeta, titulo, detalle, evidencia, estado, origen, creado_por)
            values ('nombre-en-zk', r.id, v_tarjeta,
                    'Nombre en ZK: debe decir «' || v_nuevo || '»',
                    left(v_linea, 4000),
                    jsonb_build_object('nombre', jsonb_build_object(
                        'zk', v_zk_dice, 'satag_antes', v_antes, 'satag', v_nuevo, 'motivo', v_motivo)),
                    'abierto', 'manual', v_quien)
            returning id, numero into v_caso;
            insert into casos_notas (caso_id, clase, estado_despues, nota, hecho_por)
            values (v_caso.id, 'apertura', 'abierto', left(v_linea, 4000), v_quien);
            v_numero := v_caso.numero;
            v_caso_nvo := true;
        end if;

        -- La misma funcion que usa «Accion en ZK» en el caso: crea el
        -- movimiento pendiente o le cambia el destino. Si ya va en una tanda
        -- o ya se hizo, lanza y se deshace todo, SATAG incluido.
        perform pedir_movimiento_zk(v_caso.id, 'nombre', null, v_nuevo, v_quien);

        -- NUEVO 105: corregir el nombre ya es la decision. El caso se cierra
        -- como lo hace «Cerrar…» con su accion en ZK (94): resuelto y con el
        -- movimiento pendiente, que es lo unico que lista Movimientos en ZK
        -- (solo lo decidido, 9-oct). Si ZK no coincide tras la tanda, la
        -- verificacion (93) lo reabre.
        perform zk_cerrar_caso(v_caso.id, 'Decidido; falta hacerlo en ZK',
                               'Corregir el nombre en ZK a «' || v_nuevo || '»', v_quien);
    end if;

    return jsonb_build_object(
        'nombre', v_nuevo, 'antes', v_antes, 'satag', v_satag,
        'zk', v_zk_est, 'zkDice', v_zk_dice, 'caso', v_numero, 'casoNuevo', v_caso_nvo);
end;
$corregir$;
revoke all     on function corregir_nombre(uuid, text, text, text, text) from public, anon;
grant  execute on function corregir_nombre(uuid, text, text, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 3. DATOS, una sola vez
-- ---------------------------------------------------------------------
-- 3a. Lo pendiente de casos descartados (lo que generar_movimientos_zk
--     hacia y nadie llama desde el 9-oct). Se anota en cada caso.
with cancelados as (
    update zk_movimientos m
       set estado = 'cancelado', actualizado_en = now(), detalle = 'El caso se descartó.'
      from casos c
     where c.id = m.caso_id
       and c.estado = 'descartado'
       and m.estado in ('pendiente', 'no_coincide')
    returning m.caso_id
)
insert into casos_notas (caso_id, clase, nota, hecho_por)
select caso_id, 'nota', 'Se canceló la acción pedida en ZK: el caso está descartado (bloque 105).', 'bloque-105'
  from cancelados;

-- 3b. Los casos «Nombre en ZK» que corregir_nombre (103) dejo abiertos con su
--     accion pendiente: se cierran como lo hara la funcion de ahora en adelante.
do $cierra$
declare
    r record;
begin
    for r in
        select c.id, m.nombre_destino
          from casos c
          join zk_movimientos m on m.caso_id = c.id
         where c.tipo = 'nombre-en-zk'
           and c.estado not in ('resuelto', 'descartado')
           and m.que = 'nombre' and m.estado = 'pendiente'
           and exists (select 1 from casos_notas n
                        where n.caso_id = c.id and n.nota like 'Nombre corregido por Sistemas:%')
         order by c.numero
    loop
        perform zk_cerrar_caso(r.id, 'Decidido; falta hacerlo en ZK',
                               'Corregir el nombre en ZK a «' || r.nombre_destino || '»', 'bloque-105');
    end loop;
end;
$cierra$;

notify pgrst, 'reload schema';

commit;


-- ---------------------------------------------------------------------
-- 4. VERIFICACION (solo lectura). Seis filas con ok = true.
-- ---------------------------------------------------------------------
select 1 as orden, 'mover_casos es la del 105 (descartar cancela lo pendiente en ZK) y conserva lo del 96; una sola forma, security definer, anon no la ejecuta' as que,
       (select count(*) = 1 from pg_proc where proname = 'mover_casos')
       and (select prosecdef and prosrc like '%NUEVO 105%' and prosrc like '%NUEVO 96%'
              from pg_proc where proname = 'mover_casos')
       and not has_function_privilege('anon', 'mover_casos(uuid[], text, text, text, text, date, text, text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'mover_casos(uuid[], text, text, text, text, date, text, text)', 'EXECUTE') as ok
union all
select 2, 'corregir_nombre es la del 105 (cierra el caso con su accion); una sola forma, security definer, anon no la ejecuta',
       (select count(*) = 1 from pg_proc where proname = 'corregir_nombre')
       and (select prosecdef and prosrc like '%NUEVO 105%' and prosrc like '%perform zk_cerrar_caso(v_caso.id%'
              from pg_proc where proname = 'corregir_nombre')
       and not has_function_privilege('anon', 'corregir_nombre(uuid, text, text, text, text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'corregir_nombre(uuid, text, text, text, text)', 'EXECUTE')
union all
select 3, 'ningun caso descartado tiene una accion pendiente o no_coincide en ZK',
       not exists (select 1 from zk_movimientos m join casos c on c.id = m.caso_id
                    where c.estado = 'descartado' and m.estado in ('pendiente', 'no_coincide'))
union all
select 4, 'ningun caso abierto por corregir_nombre sigue abierto con su accion pendiente',
       not exists (select 1 from casos c join zk_movimientos m on m.caso_id = c.id
                    where c.tipo = 'nombre-en-zk' and c.estado not in ('resuelto', 'descartado')
                      and m.que = 'nombre' and m.estado = 'pendiente'
                      and exists (select 1 from casos_notas n where n.caso_id = c.id and n.nota like 'Nombre corregido por Sistemas:%'))
union all
select 5, 'todo movimiento pendiente en ZK es de un caso resuelto: la Bandeja y Movimientos en ZK dicen lo mismo',
       not exists (select 1 from zk_movimientos m join casos c on c.id = m.caso_id
                    where m.estado = 'pendiente' and c.estado <> 'resuelto')
union all
select 6, 'ningun mensaje tutea',
       (select bool_and(prosrc !~* '\m(tu|tus|elige|escribe|mueve|reintenta)\M')
          from pg_proc where proname in ('mover_casos', 'corregir_nombre'))
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). Lo cancelado y lo cerrado en el paso 3 son datos y
-- se quedan (cada uno lleva su nota «bloque 105» en el caso).
--
--   begin;
--   -- Volver a correr, de 96_casos_consultar_cp.sql, el cuerpo de
--   -- mover_casos (lineas 50-148; ya es «create or replace»), y de
--   -- 103_corregir_nombre.sql el de corregir_nombre (lineas 105-240,
--   -- cambiando «create function» por «create or replace function»).
--   notify pgrst, 'reload schema';
--   commit;
-- ---------------------------------------------------------------------
