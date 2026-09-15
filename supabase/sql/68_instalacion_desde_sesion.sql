-- =====================================================================
-- 68_instalacion_desde_sesion.sql   (L2-04, SC-028: hora e identidad de
--                                    quien instala, desde la sesion)
--
-- POR QUE. El contador pidio el 9-sep medir el tiempo de instalacion por
-- persona de TI, y hoy no se puede:
--   - registros.fecha_instalacion es DATE (sin hora) y se toma con
--     current_date, que va en UTC: despues de las 18:00 de Queretaro la
--     instalacion se registra con la fecha del dia siguiente;
--   - el instalador se TECLEA en un campo editable, a diferencia del cobro,
--     que desde el bloque 50 sella al cobrador desde la sesion.
-- El primer lunes en produccion (14-sep) la hora de cada instalacion solo
-- pudo aproximarse. La metrica solo se calcula hacia adelante: cada
-- instalacion sin este bloque es un dato que ya no se recupera.
--
-- QUE HACE, EN ORDEN:
--   0. Guardia: una sola forma de instalar_tag y de
--      instalar_tag_con_estacionamiento, con la firma que se recrea.
--   1. Columnas nuevas en registros: instalado_en (hora real),
--      instalado_por_uid e instalado_por_email (identidad de la sesion).
--   2. instalar_tag: cuerpo vigente del bloque 49, integro, con los deltas
--      marcados "NUEVO 68". La identidad sale del correo del JWT y, sin
--      correo, no hay instalacion; escribe la hora real y la fecha en hora
--      de Queretaro. p_instalado_por se conserva en la firma y se ignora
--      (patron del bloque 50).
--   3. instalar_tag_con_estacionamiento: cuerpo vigente del bloque 53,
--      integro, con los deltas "NUEVO 68": la misma identidad del JWT firma
--      el movimiento de procedencia, la asignacion de estacionamiento, el
--      inventario y la nota del buzon que se cierra.
--   4. Verificacion de solo lectura, y rollback comentado.
--
-- MISMAS FIRMAS: `create or replace` en sitio, sin drop, sin regrant y sin
-- notify. El revoke de instalar_tag a authenticated (bloque 31) se
-- conserva: solo se llama por dentro del envolvente.
--
-- ORDEN CON EL DEPLOY: PRIMERO ESTE BLOQUE, DESPUES EL PANEL NUEVO.
--   - El panel publicado hoy funciona igual con o sin el bloque: sigue
--     mandando p_instalado_por, que ahora se ignora.
--   - El panel nuevo pide la columna instalado_en en su consulta del
--     padron. Publicado ANTES de este bloque, el padron no cargaria
--     ("column registros.instalado_en does not exist").
--
-- CONSECUENCIA OPERATIVA, a proposito (igual que en el cobro): queda
-- registrado quien tiene la sesion abierta. En un equipo compartido cada
-- persona entra con su propia cuenta antes de instalar; ya no se "corrige
-- el nombre" en pantalla.
--
-- NO TOCA: actualizar_registro (bloque 62) sigue escribiendo current_date
-- en una reposicion. Queda para despues.
--
-- Idempotente. Depende de: 49 (instalar_tag), 53
-- (instalar_tag_con_estacionamiento), 52 (inv_reclamar_tag) y 25/29
-- (asignar_estacionamiento).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. GUARDIA. Si aborta, no se aplico nada.
-- ---------------------------------------------------------------------
do $guardia$
declare
    v_formas int;
begin
    select count(*)
      into v_formas
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'instalar_tag';
    if v_formas <> 1 or to_regprocedure('public.instalar_tag(uuid,text,text)') is null then
        raise exception 'Bloque 68 cancelado: instalar_tag deberia tener una sola forma (uuid, text, text) y tiene %. No se aplico nada.', v_formas;
    end if;

    select count(*)
      into v_formas
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'instalar_tag_con_estacionamiento';
    if v_formas <> 1
       or to_regprocedure('public.instalar_tag_con_estacionamiento(uuid,text,text[],text,text,text)') is null then
        raise exception 'Bloque 68 cancelado: instalar_tag_con_estacionamiento deberia tener una sola forma (uuid, text, text[], text, text, text) y tiene %. No se aplico nada.', v_formas;
    end if;
end
$guardia$;


-- ---------------------------------------------------------------------
-- 1. Columnas nuevas. Nulas en todo lo instalado antes de este bloque.
-- ---------------------------------------------------------------------
alter table registros
    add column if not exists instalado_en        timestamptz,
    add column if not exists instalado_por_uid   uuid,
    add column if not exists instalado_por_email text;

comment on column registros.instalado_en is
    'Hora real de la instalacion (bloque 68). Lo instalado antes del 68 solo tiene fecha_instalacion.';
comment on column registros.instalado_por_uid is
    'Identidad verificable (auth.uid) de quien instalo, tomada del JWT (bloque 68).';
comment on column registros.instalado_por_email is
    'PII indirecta: correo de la sesion de quien instalo, tomado del JWT (bloque 68).';


-- ---------------------------------------------------------------------
-- 2. instalar_tag (cuerpo vigente del bloque 49 + deltas NUEVO 68).
-- ---------------------------------------------------------------------
create or replace function instalar_tag(
    p_registro_id    uuid,
    p_no_dispositivo text,
    p_instalado_por  text default null   -- conservado por compatibilidad; se ignora (bloque 68)
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

    select estado, no_dispositivo into v_estado, v_tag_actual
      from registros where id = p_registro_id;
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

    if not exists (select 1 from pagos p where p.registro_id = p_registro_id) then
        raise exception 'El registro no tiene pago: el TAG se instala despues del pago';
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
$$;


-- ---------------------------------------------------------------------
-- 3. instalar_tag_con_estacionamiento (cuerpo vigente del bloque 53 +
--    deltas NUEVO 68).
-- ---------------------------------------------------------------------
create or replace function instalar_tag_con_estacionamiento(
    p_registro_id     uuid,
    p_no_dispositivo  text,
    p_claves          text[],
    p_instalado_por   text default null,   -- conservado por compatibilidad; se ignora (bloque 68)
    p_tag_apartado_no text default null,
    p_procedencia_tag text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_proc_actual   text;
    v_proc_efectiva text;
    v_apartado      text;
    v_quien         text;
begin
    perform panel_exigir_rol(array['ti']);

    select procedencia_tag
      into v_proc_actual
      from registros
     where id = p_registro_id
       for update;
    if not found then
        raise exception 'Registro no encontrado';
    end if;

    if not exists (
        select 1
          from unnest(coalesce(array_remove(p_claves, null), '{}'::text[])) as c(clave)
         where btrim(clave) <> ''
    ) then
        raise exception 'Elija al menos un estacionamiento antes de instalar el TAG';
    end if;

    v_proc_efectiva := coalesce(nullif(btrim(coalesce(p_procedencia_tag, '')), ''), v_proc_actual);
    if v_proc_efectiva not in ('escuela', 'propio') then
        raise exception 'Procedencia de TAG invalida (escuela | propio)';
    end if;

    -- NUEVO 68: la identidad sale de la sesion, no del parametro.
    v_quien := nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '');
    if v_quien is null then
        raise exception 'No se pudo identificar a quien instala desde la sesion. Cierre sesion y vuelva a entrar.';
    end if;

    v_apartado := nullif(btrim(coalesce(p_tag_apartado_no, '')), '');
    if v_apartado is not null then
        if v_proc_efectiva <> 'propio' then
            raise exception 'Solo se aparta un TAG cuando la familia usa su propio TAG (procedencia propio)';
        end if;
        if v_apartado !~ '^[0-9]{6,11}$' then
            raise exception 'El No. del TAG apartado debe tener de 6 a 11 digitos';
        end if;
        if v_apartado = btrim(coalesce(p_no_dispositivo, '')) then
            raise exception 'El TAG apartado no puede ser el mismo que el TAG que se instala';
        end if;
        if exists (
            select 1 from registros
             where id <> p_registro_id and estado <> 'baja' and no_dispositivo = v_apartado
        ) then
            raise exception 'El TAG apartado % ya esta activo en otro registro', v_apartado;
        end if;
        if exists (
            select 1 from registros
             where id <> p_registro_id and tag_apartado and tag_apartado_no = v_apartado
        ) then
            raise exception 'El TAG % ya esta apartado en otro registro', v_apartado;
        end if;
    end if;

    if v_proc_efectiva <> v_proc_actual then
        update registros set procedencia_tag = v_proc_efectiva where id = p_registro_id;
        insert into movimientos (registro_id, tipo, motivo, hecho_por)
        values (p_registro_id, 'cambio',
            'Procedencia TAG: ' || v_proc_actual || ' -> ' || v_proc_efectiva, v_quien);
    end if;

    perform asignar_estacionamiento(
        p_registro_id => p_registro_id,
        p_claves      => p_claves,
        p_hecho_por   => v_quien   -- NUEVO 68 (antes p_instalado_por)
    );

    perform instalar_tag(
        p_registro_id    => p_registro_id,
        p_no_dispositivo => p_no_dispositivo,
        p_instalado_por  => v_quien   -- se ignora: instalar_tag lee el JWT
    );

    if v_apartado is not null then
        update registros
           set tag_apartado = true,
               tag_apartado_no = v_apartado
         where id = p_registro_id;
    end if;

    -- SC-025: si el TAG instalado (y el apartado, si lo hay) estaba disponible
    -- en el inventario, queda asignado a este expediente.
    perform inv_reclamar_tag(p_no_dispositivo, p_registro_id, v_quien);
    if v_apartado is not null then
        perform inv_reclamar_tag(v_apartado, p_registro_id, v_quien);
    end if;

    -- SC-026: una reserva de este expediente que NO es el TAG instalado ni el
    -- apartado vuelve a estar disponible (TI instalo otro numero).
    update inventario_tags
       set asignado_a = null, asignado_en = null, asignado_por = null
     where asignado_a = p_registro_id
       and no_dispositivo <> btrim(coalesce(p_no_dispositivo, ''))
       and (v_apartado is null or no_dispositivo <> v_apartado);

    -- Cierra la nota del buzon (SC-003) que pidio instalar, si la hay: al terminar
    -- la instalacion la tarjeta queda sin pendientes.
    update solicitudes
       set atendida = true, atendida_en = now(), atendida_por = v_quien,
           resolucion = 'ejecutada'
     where registro_id = p_registro_id and not atendida
       and tipo = 'nota' and tramite_solicitado = 'instalacion';

    return jsonb_build_object('id', p_registro_id);
end;
$$;


-- ---------------------------------------------------------------------
-- 4. VERIFICACION (solo lectura). La columna `ok` debe salir true en las
--    cinco filas.
-- ---------------------------------------------------------------------
select 1 as orden, 'columnas nuevas en registros (deben ser 3)' as que,
       (select count(*)::text from information_schema.columns
         where table_schema = 'public' and table_name = 'registros'
           and column_name in ('instalado_en', 'instalado_por_uid', 'instalado_por_email')) as valor,
       (select count(*) = 3 from information_schema.columns
         where table_schema = 'public' and table_name = 'registros'
           and column_name in ('instalado_en', 'instalado_por_uid', 'instalado_por_email')) as ok
union all
select 2, 'instalar_tag: una sola forma y lee el JWT',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'instalar_tag'),
       (select count(*) = 1 and bool_and(position('auth.jwt()' in p.prosrc) > 0)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'instalar_tag')
union all
select 3, 'instalar_tag_con_estacionamiento: una sola forma y lee el JWT',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'instalar_tag_con_estacionamiento'),
       (select count(*) = 1 and bool_and(position('auth.jwt()' in p.prosrc) > 0)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'instalar_tag_con_estacionamiento')
union all
select 4, 'authenticated NO ejecuta instalar_tag directo (bloque 31)', null,
       not has_function_privilege('authenticated', 'public.instalar_tag(uuid,text,text)', 'execute')
union all
select 5, 'authenticated SI ejecuta instalar_tag_con_estacionamiento', null,
       has_function_privilege('authenticated', 'public.instalar_tag_con_estacionamiento(uuid,text,text[],text,text,text)', 'execute')
order by orden;

-- Despues de la primera instalacion real con el bloque aplicado (debe traer
-- hora local y el correo de quien instalo):
--
--   select folio, fecha_instalacion,
--          to_char(instalado_en at time zone 'America/Mexico_City', 'DD-Mon HH24:MI') as hora_local,
--          instalado_por_email
--     from registros
--    where instalado_en is not null
--    order by instalado_en desc
--    limit 3;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). Volver a correr como `create or replace`:
--   - instalar_tag: supabase/sql/49_versiones_obligatorias_y_usted.sql,
--     lineas 395-460;
--   - instalar_tag_con_estacionamiento: supabase/sql/53_captura_hoja_fisica.sql,
--     lineas 191-311.
-- Las columnas nuevas NO se quitan: el panel nuevo las consulta y, sin
-- ellas, el padron no carga. Con el cuerpo anterior simplemente quedan
-- nulas en las instalaciones siguientes.
-- ---------------------------------------------------------------------
