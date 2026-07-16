-- =====================================================================
-- 33_apartar_tag.sql
-- CC-01: apartar TAG + procedencia editable por TI.
--
-- Regla de negocio (cerrada 2026-07): cuando la familia usa su PROPIO TAG
-- (procedencia_tag = 'propio'), la escuela reserva ("aparta") el TAG que le
-- tocaria por su pago y activa el TAG propio como el que queda en uso. El TAG
-- apartado queda registrado, sin instalar, para una futura reposicion (se
-- descompone el propio, cambian de coche, etc.).
--
--   no_dispositivo   -> el TAG EN USO (el propio de la familia).
--   tag_apartado     -> true: hay un TAG de la escuela reservado.
--   tag_apartado_no  -> numero de ese TAG reservado (sin instalar).
--
-- Quien lo aparta: TI, al instalar, en el panel (no el titular en el alta).
-- Por eso este bloque NO toca crear_registro: extiende los wrappers de TI.
--
-- Procedencia editable por TI: el titular DECLARA propio/escuela en el alta
-- para agilizar, pero solo TI puede CAMBIARLO despues (en instalar o en
-- actualizar). Ningun padre puede cambiar su propio estatus: no existe RPC
-- publico que edite registros; la via publica (crear_solicitud) es inerte.
--
-- OJO SOBRECARGA PostgREST: instalar_tag_con_estacionamiento y
-- actualizar_registro_con_estacionamiento YA estan aplicados (bloque 31).
-- Agregarles parametros crea una segunda firma y PostgREST falla con
-- "could not choose the best candidate function". Por eso se hace DROP
-- explicito de la firma vieja antes de recrearla + notify pgrst (mismo patron
-- que el bloque 32).
--
-- Depende de: 12_registros.sql, 29_rpc_panel.sql, 31_rpc_flujos_atomicos.sql.
-- Aplicar despues del bloque 32.
--
-- ALCANCE: la CAPTURA del apartado al instalar y la edicion de procedencia.
-- El flujo de "usar el TAG apartado" (reposicion desde el apartado, que ademas
-- limpia tag_apartado) queda para el bloque 34.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Coherencia de columnas: apartado <=> hay numero.
--    Seguro: es un CHECK de tabla (no una funcion, sin sobrecarga PostgREST) y
--    todas las filas actuales lo cumplen (nadie usa aun estas columnas).
-- ---------------------------------------------------------------------
alter table registros drop constraint if exists reg_tag_apartado_coherente;
alter table registros add constraint reg_tag_apartado_coherente check (
    (tag_apartado = false and tag_apartado_no is null)
    or (tag_apartado = true and tag_apartado_no is not null)
);

-- ---------------------------------------------------------------------
-- 2) Unicidad del numero apartado: un mismo TAG no puede quedar reservado por
--    dos expedientes a la vez. (La colision con un TAG ACTIVO se valida ademas
--    en el RPC, para dar un mensaje claro.)
-- ---------------------------------------------------------------------
create unique index if not exists uq_registros_tag_apartado_no
    on registros (tag_apartado_no)
    where tag_apartado;

-- ---------------------------------------------------------------------
-- 3) Wrapper de instalacion: agrega apartado + override de procedencia.
--    p_tag_apartado_no  -> numero reservado (opcional).
--    p_procedencia_tag  -> TI corrige escuela|propio en el momento (opcional).
--    Se elimina la firma anterior (4 args) antes de crear la nueva (6 args).
-- ---------------------------------------------------------------------
drop function if exists instalar_tag_con_estacionamiento(uuid, text, text[], text);

create or replace function instalar_tag_con_estacionamiento(
    p_registro_id     uuid,
    p_no_dispositivo  text,
    p_claves          text[],
    p_instalado_por   text default null,
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

    -- Serializa instalaciones simultaneas y trae la procedencia actual.
    select procedencia_tag
      into v_proc_actual
      from registros
     where id = p_registro_id
       for update;
    if not found then
        raise exception 'Registro no encontrado';
    end if;

    -- La instalacion siempre deja acceso a por lo menos un estacionamiento.
    if not exists (
        select 1
          from unnest(coalesce(array_remove(p_claves, null), '{}'::text[])) as c(clave)
         where btrim(clave) <> ''
    ) then
        raise exception 'Elige al menos un estacionamiento antes de instalar el TAG';
    end if;

    -- Procedencia efectiva: el override de TI o, si no lo hay, la que ya tenia.
    v_proc_efectiva := coalesce(nullif(btrim(coalesce(p_procedencia_tag, '')), ''), v_proc_actual);
    if v_proc_efectiva not in ('escuela', 'propio') then
        raise exception 'Procedencia de TAG invalida (escuela | propio)';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_instalado_por, '')), ''), 'TI');

    -- Validacion del apartado (opcional): solo si TI capturo un numero.
    v_apartado := nullif(btrim(coalesce(p_tag_apartado_no, '')), '');
    if v_apartado is not null then
        -- Solo se aparta cuando la familia usa su propio TAG.
        if v_proc_efectiva <> 'propio' then
            raise exception 'Solo se aparta un TAG cuando la familia usa su propio TAG (procedencia propio)';
        end if;
        if v_apartado !~ '^[0-9]{6,11}$' then
            raise exception 'El No. del TAG apartado debe tener de 6 a 11 digitos';
        end if;
        if v_apartado = btrim(coalesce(p_no_dispositivo, '')) then
            raise exception 'El TAG apartado no puede ser el mismo que el TAG que se instala';
        end if;
        -- No debe estar activo en otro expediente (dispositivo fisico unico).
        if exists (
            select 1 from registros
             where id <> p_registro_id and estado <> 'baja' and no_dispositivo = v_apartado
        ) then
            raise exception 'El TAG apartado % ya esta activo en otro registro', v_apartado;
        end if;
        -- Ni reservado por otro expediente (el indice unico tambien lo topa).
        if exists (
            select 1 from registros
             where id <> p_registro_id and tag_apartado and tag_apartado_no = v_apartado
        ) then
            raise exception 'El TAG % ya esta apartado en otro registro', v_apartado;
        end if;
    end if;

    -- Aplicar cambio de procedencia (si TI lo corrigio) con su movimiento.
    if v_proc_efectiva <> v_proc_actual then
        update registros set procedencia_tag = v_proc_efectiva where id = p_registro_id;
        insert into movimientos (registro_id, tipo, motivo, hecho_por)
        values (p_registro_id, 'cambio',
            'Procedencia TAG: ' || v_proc_actual || ' -> ' || v_proc_efectiva, v_quien);
    end if;

    -- Asignacion + instalacion, en la misma transaccion (identico al bloque 31).
    perform asignar_estacionamiento(
        p_registro_id => p_registro_id,
        p_claves      => p_claves,
        p_hecho_por   => p_instalado_por
    );

    perform instalar_tag(
        p_registro_id    => p_registro_id,
        p_no_dispositivo => p_no_dispositivo,
        p_instalado_por  => p_instalado_por
    );

    -- Registrar el apartado (si lo hubo). tag_apartado se deriva de que haya
    -- numero, en linea con el CHECK de coherencia.
    if v_apartado is not null then
        update registros
           set tag_apartado = true,
               tag_apartado_no = v_apartado
         where id = p_registro_id;
    end if;

    return jsonb_build_object('id', p_registro_id);
end;
$$;

revoke all on function instalar_tag_con_estacionamiento(uuid, text, text[], text, text, text) from public;
grant execute on function instalar_tag_con_estacionamiento(uuid, text, text[], text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4) Wrapper de actualizacion: agrega el override de procedencia (rol ti).
--    El wrapper aplica la procedencia directamente (no toca actualizar_registro
--    interno) para no multiplicar firmas. Un cambio SOLO de procedencia ya
--    cuenta como cambio guardable (antes disparaba "No hay cambios").
--    Se elimina la firma anterior (10 args) antes de crear la nueva (11 args).
-- ---------------------------------------------------------------------
drop function if exists actualizar_registro_con_estacionamiento(
    uuid, text[], text, text, boolean, text, text, text, text, text
);

create or replace function actualizar_registro_con_estacionamiento(
    p_registro_id     uuid,
    p_claves          text[] default null,
    p_no_dispositivo  text default null,
    p_placas          text default null,
    p_sin_placas      boolean default null,
    p_marca           text default null,
    p_modelo          text default null,
    p_color           text default null,
    p_motivo          text default null,
    p_hecho_por       text default null,
    p_procedencia_tag text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_hay_cambios_registro boolean;
    v_proc_actual text;
    v_proc_nueva  text;
    v_quien text;
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

    v_hay_cambios_registro :=
        p_no_dispositivo is not null
        or p_placas is not null
        or p_sin_placas is not null
        or p_marca is not null
        or p_modelo is not null
        or p_color is not null;

    -- Override de procedencia (opcional). Se valida y solo cuenta si cambia.
    v_proc_nueva := nullif(btrim(coalesce(p_procedencia_tag, '')), '');
    if v_proc_nueva is not null and v_proc_nueva not in ('escuela', 'propio') then
        raise exception 'Procedencia de TAG invalida (escuela | propio)';
    end if;
    if v_proc_nueva is not null and v_proc_nueva = v_proc_actual then
        v_proc_nueva := null; -- no cambia nada
    end if;

    if p_claves is null and not v_hay_cambios_registro and v_proc_nueva is null then
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

    -- Cambio de procedencia con su movimiento (lo hace el wrapper porque
    -- actualizar_registro interno no la toca).
    if v_proc_nueva is not null then
        update registros set procedencia_tag = v_proc_nueva where id = p_registro_id;
        insert into movimientos (registro_id, tipo, motivo, hecho_por)
        values (p_registro_id, 'cambio',
            'Procedencia TAG: ' || v_proc_actual || ' -> ' || v_proc_nueva
                || case when coalesce(btrim(coalesce(p_motivo, '')), '') <> ''
                        then ' - ' || btrim(p_motivo) else '' end,
            v_quien);
    end if;

    -- Cierra solicitudes de actualizacion pendientes (igual que el bloque 31).
    update solicitudes
       set atendida = true,
           atendida_en = now(),
           atendida_por = v_quien,
           resolucion = 'ejecutada'
     where registro_id = p_registro_id
       and tipo = 'actualizacion'
       and not atendida;

    return jsonb_build_object('id', p_registro_id);
end;
$$;

revoke all on function actualizar_registro_con_estacionamiento(
    uuid, text[], text, text, boolean, text, text, text, text, text, text
) from public;
grant execute on function actualizar_registro_con_estacionamiento(
    uuid, text[], text, text, boolean, text, text, text, text, text, text
) to authenticated;

-- Hace visibles de inmediato las firmas nuevas para PostgREST/Supabase API.
notify pgrst, 'reload schema';

-- Auditoria esperada:
-- - anon: sin EXECUTE en ninguno de los dos wrappers.
-- - authenticated sin aal2/rol ti: panel_exigir_rol rechaza.
-- - apartar con procedencia efectiva 'escuela': rechazado.
-- - apartar un numero activo o ya apartado en otro registro: rechazado.
-- - instalar sin apartado ni override: identico al bloque 31.
-- - TI corrige procedencia a 'propio' e instala apartando: una sola transaccion.
-- - cambio SOLO de procedencia via actualizar: se guarda (antes: "No hay cambios").
-- - el cliente viejo (4 y 10 args) sigue funcionando: los parametros nuevos
--   tienen default, asi que las llamadas con menos argumentos resuelven aqui.
