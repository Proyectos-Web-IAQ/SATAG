-- =====================================================================
-- BLOQUE 103 — Corregir el nombre de una persona en SATAG y pedir el mismo
-- cambio en ZK, en un solo paso.
--
-- 28/10/2026
--
-- POR QUE
--   Gerardo, 28-oct, sobre un expediente que ya se identifico: «quiero
--   cambiarle el nombre porque ya se identifico y lo tenemos mal en satag y
--   en zk» y «quiero tenerlo listo para estos casos, hay que cambiarlo tanto
--   de satag como de zk, hay que tener ese proceso sistematizado».
--
--   Hasta hoy el nombre no tenia por donde corregirse: «Actualizar datos»
--   cambia vehiculo, TAG, tipo y apellidos de la familia, pero no el nombre
--   de la persona. La mitad de ZK si existe: un caso «Corregir el nombre en
--   ZK» con su accion (bloques 93 y 94) sale en una tanda de Movimientos en
--   ZK, el import la aplica y la carga del padron la comprueba y cierra el
--   caso. Este bloque junta las dos mitades.
--
-- QUE HACE, EN ORDEN
--   0. Guardia: el 103 no esta y lo que usa sigue como se espera.
--   1. RPC NUEVO corregir_nombre(registro, nombres, paterno, materno, motivo).
--      Solo ti (super pasa siempre). Quien corrige sale del JWT. En UNA
--      transaccion:
--        a. SATAG: cambia nombres y apellidos (el nombre completo es una
--           columna GENERATED y se rehace sola) y deja un movimiento
--           'rectificacion' con el nombre de antes, el nuevo y el motivo.
--        b. ZK: si el expediente tiene TAG vigente, el TAG esta vigente en el
--           padron de ZK guardado y ZK dice otro nombre, abre el caso
--           «Corregir el nombre en ZK» —o reusa el que ya este abierto para
--           ese TAG— y le pide la accion con pedir_movimiento_zk (94). De ahi
--           sigue el carril de siempre: tanda, import, verificacion.
--      Si SATAG ya tiene ese nombre y ZK no, solo hace (b): sirve tambien
--      para el nombre que solo esta mal en ZK. Si los dos ya coinciden, no
--      hace nada y lo dice.
--   2. Verificacion de solo lectura: filas con ok = true.
--
-- LAS REGLAS
--   - Nombre(s) y apellido paterno obligatorios; materno opcional. Cada uno
--     de 1 a 50 caracteres, sin espacios de mas. Con 50 por parte el titulo
--     del caso («… debe decir «X»») cabe en sus 200 sin cortar la comilla
--     que lee generar_movimientos_zk.
--   - Motivo de 5 a 500 caracteres: queda en el movimiento y en el caso.
--   - ZK se compara con zk_texto_comparable sobre nombres + apellidos del
--     padron, igual que verificar_movimientos_zk: lo que aqui «coincide»
--     alla da «verificado».
--   - Si el caso de ese TAG ya tiene la accion en una tanda o hecha en ZK,
--     pedir_movimiento_zk lo rechaza y NO se cambia nada (tampoco en SATAG):
--     primero se termina esa tanda.
--
-- QUE NO HACE
--   - No toca la aceptacion firmada: su payload sellado guarda el nombre con
--     el que se firmo, y asi debe quedarse.
--   - No toca el gestionante (null = el mismo usuario) ni los apellidos de la
--     familia (esos se corrigen en «Actualizar datos», bloque 100).
--   - No escribe en ZK: lo hace TI con la tanda.
--
-- ORDEN: este bloque solo AGREGA una funcion. Va ANTES del deploy del
-- cliente que la llama.
-- =====================================================================

begin;

do $guardia$
begin
    if exists (select 1 from pg_proc where proname = 'corregir_nombre') then
        raise exception 'El bloque 103 ya esta aplicado (existe corregir_nombre). No se aplico nada.';
    end if;
    if to_regprocedure('public.panel_exigir_rol(text[])') is null then
        raise exception 'Falta panel_exigir_rol (bloques 29 y 49). No se aplico nada.';
    end if;
    if to_regprocedure('public.pedir_movimiento_zk(uuid,text,text,text,text)') is null
       or (select count(*) from pg_proc where proname = 'pedir_movimiento_zk') <> 1 then
        raise exception 'pedir_movimiento_zk no es la del bloque 94 (o hay mas de una). No se aplico nada.';
    end if;
    if to_regprocedure('public.zk_texto_comparable(text)') is null then
        raise exception 'Falta zk_texto_comparable (bloque 93). No se aplico nada.';
    end if;
    if not exists (select 1 from casos_tipos where tipo = 'nombre-en-zk') then
        raise exception 'No existe el tipo de caso nombre-en-zk. No se aplico nada.';
    end if;
    if (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'zk_padron'
           and column_name in ('nombres', 'apellidos', 'vigente')) <> 3 then
        raise exception 'zk_padron no tiene nombres, apellidos y vigente (bloque 86). No se aplico nada.';
    end if;
    if not exists (select 1 from pg_constraint
                    where conrelid = 'public.movimientos'::regclass
                      and contype = 'c'
                      and pg_get_constraintdef(oid) like '%rectificacion%') then
        raise exception 'movimientos ya no admite el tipo rectificacion. No se aplico nada.';
    end if;
    if not exists (select 1 from pg_constraint
                    where conname = 'casos_estado'
                      and pg_get_constraintdef(oid) like '%''abierto''%') then
        raise exception 'casos ya no admite el estado abierto. No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. LA FUNCION
-- ---------------------------------------------------------------------
create function corregir_nombre(
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
    end if;

    return jsonb_build_object(
        'nombre', v_nuevo, 'antes', v_antes, 'satag', v_satag,
        'zk', v_zk_est, 'zkDice', v_zk_dice, 'caso', v_numero, 'casoNuevo', v_caso_nvo);
end;
$corregir$;

revoke all     on function corregir_nombre(uuid, text, text, text, text) from public, anon;
grant  execute on function corregir_nombre(uuid, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;


-- ---------------------------------------------------------------------
-- 2. VERIFICACION (solo lectura): todas las filas con ok = true
-- ---------------------------------------------------------------------
select 1 as orden, 'una sola corregir_nombre, security definer' as que,
       (select count(*) from pg_proc where proname = 'corregir_nombre') = 1
       and (select prosecdef from pg_proc where proname = 'corregir_nombre') as ok
union all
select 2, 'pide el rol ti, toma a quien corrige del JWT y deja su movimiento',
       (select prosrc like '%panel_exigir_rol(array[''ti''])%'
               and prosrc like '%auth.jwt() ->> ''email''%'
               and prosrc like '%''rectificacion''%Nombre corregido%'
          from pg_proc where proname = 'corregir_nombre')
union all
select 3, 'la accion en ZK va por pedir_movimiento_zk con un caso nombre-en-zk',
       (select prosrc like '%perform pedir_movimiento_zk(v_caso.id, ''nombre''%'
               and prosrc like '%tipo = ''nombre-en-zk''%'
               and prosrc like '%debe decir «%'
          from pg_proc where proname = 'corregir_nombre')
union all
select 4, 'anon no la ejecuta; authenticated si (la guardia decide el rol)',
       not has_function_privilege('anon', 'public.corregir_nombre(uuid, text, text, text, text)', 'execute')
       and has_function_privilege('authenticated', 'public.corregir_nombre(uuid, text, text, text, text)', 'execute')
union all
select 5, 'ningun mensaje tutea',
       (select prosrc !~* '\m(tu|tus|elige|escribe|vuelve|captura tu)\M'
          from pg_proc where proname = 'corregir_nombre')
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado)
-- ---------------------------------------------------------------------
-- El bloque solo agrega la funcion: quitarla basta. Los nombres ya
-- corregidos se quedan, con su movimiento 'rectificacion'; los casos y
-- movimientos en ZK que abrio siguen su carril normal.
--   begin;
--   drop function if exists corregir_nombre(uuid, text, text, text, text);
--   commit;
--   notify pgrst, 'reload schema';
