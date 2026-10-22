-- =====================================================================
-- BLOQUE 101 — Reactivar un expediente dado de baja.
--
-- 22/10/2026
--
-- POR QUE
--   Gerardo, 22-oct: «ayer dimos de baja muchos perfiles de satag pero eso
--   bloquea el reactivarlos, modificarles datos etc. justo estoy con el caso
--   del tag 9426038 que ya aparecio la señora y ya la identificamos».
--
--   dar_baja (bloque 49) no tiene camino de regreso: deja el expediente en
--   'baja' y, desde ahi, actualizar_registro_con_estacionamiento (100),
--   instalar_tag (68) y registrar_pago (73) lo rechazan con «El registro
--   esta dado de baja». Las bajas del 21-oct (quien ZK ya tenia en BAJAS y
--   quien no tiene nombre en GES) se hicieron sabiendo que algunas personas
--   volverian a presentarse; la caseta ya les dice que pidan hablar con
--   Sistemas para que se evalue su caso.
--
-- QUE HACE, EN ORDEN
--   0. Guardia: el 101 no esta, dar_baja es la del 49 y las reglas de las
--      que depende (estados del expediente, tipos de movimiento y los dos
--      indices de vigentes) siguen como se esperan.
--   1. RPC NUEVO reactivar_expediente(p_registro_id, p_motivo). Solo ti
--      (super pasa siempre). Quien reactiva sale del JWT, como al instalar
--      (bloque 68): sin correo en la sesion no hay reactivacion.
--   2. Verificacion de solo lectura: filas con ok = true.
--
-- LAS REGLAS
--   - Solo se reactiva un expediente en 'baja', con motivo escrito.
--   - Regresa a 'activo' si conserva su TAG (dar_baja no lo borra) y a
--     'pendiente' si nunca tuvo uno. Son los dos estados que la baja pudo
--     interrumpir; 'bloqueado' no se reconstruye.
--   - El TAG y las placas no pueden quedar repetidos entre vigentes (los
--     indices uq_registros_no_dispositivo_activo y uq_registros_placas_vigentes
--     solo miran a los que no estan de baja): si otro expediente vigente ya los
--     tiene, se dice cual y no se reactiva nada.
--   - motivo_baja y fecha_baja se limpian; la baja sigue en movimientos.
--   - Deja un movimiento 'rectificacion' («Reactivado: <motivo>»): el tipo ya
--     existe en el CHECK de movimientos (bloque 16) y la Bandeja lo cuenta
--     como «Corrigio un expediente». Sin tocar constraints.
--
-- QUE NO HACE
--   - No toca ZK. Si la persona esta en BAJAS en ZK, el regreso a su
--     departamento se pide desde su caso («Accion en ZK», bloque 94) y va en
--     una tanda de Movimientos en ZK.
--   - No toca casos, pagos, estacionamientos ni el inventario de TAGs: la
--     baja tampoco los toco.
--
-- ORDEN: este bloque solo AGREGA una funcion. Va ANTES del deploy del
-- cliente que la llama. Sin cliente, la funcion no hace nada por si sola.
-- =====================================================================

begin;

do $guardia$
begin
    if exists (select 1 from pg_proc where proname = 'reactivar_expediente') then
        raise exception 'El bloque 101 ya esta aplicado (existe reactivar_expediente). No se aplico nada.';
    end if;
    if (select count(*) from pg_proc where proname = 'dar_baja') <> 1
       or not exists (select 1 from pg_proc
                       where proname = 'dar_baja'
                         and prosrc like '%set estado = ''baja'', motivo_baja = btrim(p_motivo), fecha_baja = current_date%') then
        raise exception 'dar_baja no es la del bloque 49 (o hay mas de una). No se aplico nada: revise que bloque la dejo asi.';
    end if;
    if not exists (select 1 from pg_constraint
                    where conname = 'reg_estado_valido'
                      and pg_get_constraintdef(oid) ~ 'pendiente.*activo.*baja.*bloqueado') then
        raise exception 'Los estados del expediente no son los del bloque 12. No se aplico nada.';
    end if;
    if not exists (select 1 from pg_constraint
                    where conrelid = 'public.movimientos'::regclass
                      and contype = 'c'
                      and pg_get_constraintdef(oid) like '%rectificacion%') then
        raise exception 'movimientos ya no admite el tipo rectificacion. No se aplico nada.';
    end if;
    if not exists (select 1 from pg_indexes where indexname = 'uq_registros_no_dispositivo_activo')
       or not exists (select 1 from pg_indexes where indexname = 'uq_registros_placas_vigentes') then
        raise exception 'Faltan los indices de TAG o placas vigentes (bloques 12 y 62). No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. LA FUNCION
-- ---------------------------------------------------------------------
create function reactivar_expediente(
    p_registro_id uuid,
    p_motivo      text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $reactivar$
declare
    v_quien  text;
    v_motivo text := btrim(coalesce(p_motivo, ''));
    r        registros%rowtype;
    v_otro   text;
    v_nuevo  text;
begin
    perform panel_exigir_rol(array['ti']);

    v_quien := nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '');
    if v_quien is null then
        raise exception 'No se pudo identificar a quien reactiva desde la sesion. Cierre sesion y vuelva a entrar.';
    end if;

    select * into r from registros where id = p_registro_id for update;
    if r.id is null then
        raise exception 'Registro no encontrado';
    end if;
    if r.estado <> 'baja' then
        raise exception 'El expediente no esta dado de baja: no hay nada que reactivar.';
    end if;
    if char_length(v_motivo) < 5 or char_length(v_motivo) > 500 then
        raise exception 'Escriba por que se reactiva (de 5 a 500 caracteres).';
    end if;

    if r.no_dispositivo is not null then
        select folio into v_otro from registros
         where id <> r.id and no_dispositivo = r.no_dispositivo and estado <> 'baja'
         limit 1;
        if v_otro is not null then
            raise exception 'El TAG % ya esta en otro expediente vigente (%). Resuelva ese primero; no se reactivo nada.', r.no_dispositivo, v_otro;
        end if;
    end if;
    if r.placas is not null then
        select folio into v_otro from registros
         where id <> r.id and upper(placas) = upper(r.placas) and estado <> 'baja'
         limit 1;
        if v_otro is not null then
            raise exception 'Las placas % ya estan en otro expediente vigente (%). Resuelva ese primero; no se reactivo nada.', r.placas, v_otro;
        end if;
    end if;

    v_nuevo := case when r.no_dispositivo is not null then 'activo' else 'pendiente' end;

    update registros
       set estado = v_nuevo, motivo_baja = null, fecha_baja = null
     where id = r.id;

    insert into movimientos (registro_id, tipo, motivo, hecho_por)
    values (r.id, 'rectificacion', left('Reactivado: ' || v_motivo, 600), v_quien);

    return jsonb_build_object('id', r.id, 'estado', v_nuevo, 'tag', r.no_dispositivo);
end;
$reactivar$;

revoke all     on function reactivar_expediente(uuid, text) from public, anon;
grant  execute on function reactivar_expediente(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;


-- ---------------------------------------------------------------------
-- 2. VERIFICACION (solo lectura): todas las filas con ok = true
-- ---------------------------------------------------------------------
select 1 as orden, 'una sola reactivar_expediente, security definer' as que,
       (select count(*) from pg_proc where proname = 'reactivar_expediente') = 1
       and (select prosecdef from pg_proc where proname = 'reactivar_expediente') as ok
union all
select 2, 'pide el rol ti, toma a quien reactiva del JWT y deja su movimiento',
       (select prosrc like '%panel_exigir_rol(array[''ti''])%'
               and prosrc like '%auth.jwt() ->> ''email''%'
               and prosrc like '%''rectificacion'', left(''Reactivado: ''%'
          from pg_proc where proname = 'reactivar_expediente')
union all
select 3, 'revisa TAG y placas contra los vigentes antes de reactivar',
       (select prosrc like '%no_dispositivo = r.no_dispositivo and estado <> ''baja''%'
               and prosrc like '%upper(placas) = upper(r.placas) and estado <> ''baja''%'
          from pg_proc where proname = 'reactivar_expediente')
union all
select 4, 'anon no la ejecuta; authenticated si (la guardia decide el rol)',
       not has_function_privilege('anon', 'public.reactivar_expediente(uuid, text)', 'execute')
       and has_function_privilege('authenticated', 'public.reactivar_expediente(uuid, text)', 'execute')
union all
select 5, 'ningun mensaje tutea',
       (select prosrc !~* '\m(tu|tus|elige|escribe|vuelve|captura tu)\M'
          from pg_proc where proname = 'reactivar_expediente')
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado)
-- ---------------------------------------------------------------------
-- El bloque solo agrega la funcion: quitarla basta. Los expedientes ya
-- reactivados se quedan como estan, con su movimiento 'rectificacion'.
--   begin;
--   drop function if exists reactivar_expediente(uuid, text);
--   commit;
--   notify pgrst, 'reload schema';
