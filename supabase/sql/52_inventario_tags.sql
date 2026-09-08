-- =====================================================================
-- 52_inventario_tags.sql
-- SC-025: inventario de TAGs de la escuela (alta anticipada).
--
-- Motivo (medido en campo, 8-sep-2026): los TAGs se dan de alta por adelantado
-- solo en ZKBioSecurity, y el dia de instalacion TI no tiene en el celular la
-- lista de cuales hay. Con este bloque, TI puede dar de alta un lote de TAGs
-- cualquier dia ("el viernes cargo 20") y en la instalacion el sistema le
-- ofrece los disponibles; al instalar, el TAG queda asignado al expediente y
-- sale de la lista.
--
-- QUE cambia:
--   - Tabla nueva inventario_tags (numero unico, quien/cuando lo dio de alta,
--     y a que expediente quedo asignado). Disponible = asignado_a IS NULL.
--   - RPCs NUEVOS alta_inventario_tags (lote) y retirar_tag_inventario
--     (solo disponibles), rol ti. -> solo notify, sin drop.
--   - instalar_tag_con_estacionamiento, usar_tag_apartado y
--     actualizar_registro_con_estacionamiento se recrean con la MISMA firma
--     (cuerpos vigentes de 49, 40 y 40) sumando el reclamo del inventario:
--     si el numero instalado/apartado existe en inventario y esta disponible,
--     queda asignado al expediente. -> create or replace en sitio, sin trampa
--     PostgREST.
-- QUE NO cambia: firmas de RPCs, tabla registros, el flujo de instalacion
--   (el numero tecleado a mano sigue valiendo: TAG propio o fuera de
--   inventario simplemente no reclama nada).
--
-- Orden de despliegue: aplicar este bloque ANTES de publicar el cliente que
-- usa el inventario (el cliente viejo no llama a los RPC nuevos y las firmas
-- existentes no cambian).
--
-- Depende de: 12_registros.sql, 29, 31, 33, 38, 40, 49.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabla del inventario. Cada fila es un TAG fisico de la escuela.
--    asignado_a IS NULL  -> disponible para instalar.
--    asignado_a NOT NULL -> en uso o apartado por ese expediente.
-- ---------------------------------------------------------------------
create table if not exists inventario_tags (
    no_dispositivo   text primary key,
    dado_de_alta_por text not null,
    dado_de_alta_en  timestamptz not null default now(),
    asignado_a       uuid references registros(id),
    asignado_en      timestamptz,
    asignado_por     text,
    constraint inv_tag_formato check (no_dispositivo ~ '^[0-9]{6,11}$'),
    constraint inv_asignacion_coherente check (
        (asignado_a is null and asignado_en is null and asignado_por is null)
        or (asignado_a is not null and asignado_en is not null)
    )
);

alter table inventario_tags enable row level security;

-- Lectura desde el panel (la lista de disponibles se consulta con .from()).
drop policy if exists inventario_tags_lectura_panel on inventario_tags;
create policy inventario_tags_lectura_panel on inventario_tags
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti','super')
    );

revoke insert, update, delete on inventario_tags from authenticated;

-- ---------------------------------------------------------------------
-- 2) alta_inventario_tags (rol ti): alta de un lote de numeros.
--    Todo o nada: si algun numero es invalido o ya existe en alguna parte
--    (inventario, padron activo, apartado vivo), se rechaza el lote completo
--    con la lista exacta, para que TI corrija y reintente.
-- ---------------------------------------------------------------------
create or replace function alta_inventario_tags(
    p_numeros   text[],
    p_hecho_por text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_numeros text[];
    v_malos   text[];
    v_dup     text[];
    v_quien   text;
    v_n       integer;
begin
    perform panel_exigir_rol(array['ti']);

    -- Normaliza: recorta, quita vacios y duplicados del propio lote.
    select array_agg(distinct n)
      into v_numeros
      from (select btrim(x) as n from unnest(coalesce(p_numeros, '{}'::text[])) as x) t
     where n <> '';
    if v_numeros is null or array_length(v_numeros, 1) is null then
        raise exception 'Capture al menos un numero de TAG';
    end if;

    select array_agg(n order by n) into v_malos
      from unnest(v_numeros) as n
     where n !~ '^[0-9]{6,11}$';
    if v_malos is not null then
        raise exception 'Estos numeros no son validos (deben ser de 6 a 11 digitos): %',
            array_to_string(v_malos, ', ');
    end if;

    select array_agg(n order by n) into v_dup
      from unnest(v_numeros) as n
     where exists (select 1 from inventario_tags i where i.no_dispositivo = n);
    if v_dup is not null then
        raise exception 'Estos TAGs ya estan en el inventario: %',
            array_to_string(v_dup, ', ');
    end if;

    select array_agg(n order by n) into v_dup
      from unnest(v_numeros) as n
     where exists (
        select 1 from registros r
         where r.no_dispositivo = n and r.estado <> 'baja'
     );
    if v_dup is not null then
        raise exception 'Estos TAGs ya estan instalados en el padron: %',
            array_to_string(v_dup, ', ');
    end if;

    select array_agg(n order by n) into v_dup
      from unnest(v_numeros) as n
     where exists (
        select 1 from registros r
         where r.tag_apartado and r.tag_apartado_no = n
     );
    if v_dup is not null then
        raise exception 'Estos TAGs ya estan apartados en un expediente: %',
            array_to_string(v_dup, ', ');
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), 'TI');

    insert into inventario_tags (no_dispositivo, dado_de_alta_por)
    select n, v_quien from unnest(v_numeros) as n;

    get diagnostics v_n = row_count;
    return jsonb_build_object('agregados', v_n);
end;
$$;

revoke all on function alta_inventario_tags(text[], text) from public;
grant execute on function alta_inventario_tags(text[], text) to authenticated;

-- ---------------------------------------------------------------------
-- 3) retirar_tag_inventario (rol ti): saca del inventario un TAG que sigue
--    disponible (se capturo por error, se daño, se devolvio al proveedor).
--    Un TAG ya asignado no se retira: su historia vive en el expediente.
-- ---------------------------------------------------------------------
create or replace function retirar_tag_inventario(
    p_no_dispositivo text,
    p_hecho_por      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_num   text;
    v_asig  uuid;
    v_folio text;
begin
    perform panel_exigir_rol(array['ti']);

    v_num := btrim(coalesce(p_no_dispositivo, ''));
    select asignado_a into v_asig
      from inventario_tags
     where no_dispositivo = v_num
       for update;
    if not found then
        raise exception 'Ese TAG no esta en el inventario';
    end if;
    if v_asig is not null then
        select folio into v_folio from registros where id = v_asig;
        raise exception 'Ese TAG ya esta asignado al expediente % y no se puede retirar',
            coalesce(v_folio, v_asig::text);
    end if;

    delete from inventario_tags where no_dispositivo = v_num;
    return jsonb_build_object('retirado', v_num);
end;
$$;

revoke all on function retirar_tag_inventario(text, text) from public;
grant execute on function retirar_tag_inventario(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4) Helper interno: reclama un numero del inventario para un expediente,
--    si existe y esta disponible. No lanza: un TAG fuera del inventario
--    (propio de la familia, o historico) simplemente no reclama nada.
--    Sin grant: solo lo llaman los RPC del panel.
-- ---------------------------------------------------------------------
create or replace function inv_reclamar_tag(
    p_no_dispositivo text,
    p_registro_id    uuid,
    p_quien          text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update inventario_tags
       set asignado_a  = p_registro_id,
           asignado_en = now(),
           asignado_por = p_quien
     where no_dispositivo = btrim(coalesce(p_no_dispositivo, ''))
       and asignado_a is null;
end;
$$;

revoke all on function inv_reclamar_tag(text, uuid, text) from public;

-- ---------------------------------------------------------------------
-- 5) instalar_tag_con_estacionamiento: MISMO cuerpo vigente (bloque 49) +
--    reclamo del inventario para el TAG instalado y, si lo hay, el apartado.
-- ---------------------------------------------------------------------
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

    v_quien := coalesce(nullif(btrim(coalesce(p_instalado_por, '')), ''), 'TI');

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
        p_hecho_por   => p_instalado_por
    );

    perform instalar_tag(
        p_registro_id    => p_registro_id,
        p_no_dispositivo => p_no_dispositivo,
        p_instalado_por  => p_instalado_por
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
-- 6) usar_tag_apartado: MISMO cuerpo vigente (bloque 40) + reclamo del
--    inventario para el numero que entra en uso (por si la reserva se hizo
--    antes de que existiera el inventario).
-- ---------------------------------------------------------------------
create or replace function usar_tag_apartado(
    p_registro_id uuid,
    p_hecho_por   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_estado      text;
    v_apartado    boolean;
    v_apartado_no text;
    v_actual      text;
    v_quien       text;
begin
    perform panel_exigir_rol(array['ti']);

    select estado, tag_apartado, tag_apartado_no, no_dispositivo
      into v_estado, v_apartado, v_apartado_no, v_actual
      from registros
     where id = p_registro_id
       for update;
    if not found then
        raise exception 'Registro no encontrado';
    end if;
    if v_estado = 'baja' then
        raise exception 'El registro esta dado de baja';
    end if;
    if not coalesce(v_apartado, false) or v_apartado_no is null then
        raise exception 'Este registro no tiene un TAG apartado';
    end if;

    -- El dispositivo fisico es unico: el apartado no debe estar activo en otro
    -- expediente. (El indice uq_registros_no_dispositivo_activo tambien lo topa.)
    if exists (
        select 1 from registros
         where id <> p_registro_id and estado <> 'baja' and no_dispositivo = v_apartado_no
    ) then
        raise exception 'El TAG apartado % ya esta activo en otro registro', v_apartado_no;
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por,'')), ''), 'TI');

    begin
        update registros
           set no_dispositivo  = v_apartado_no,
               procedencia_tag = 'escuela',
               tag_apartado    = false,
               tag_apartado_no = null
         where id = p_registro_id;
    exception when unique_violation then
        raise exception 'El TAG apartado % ya esta activo en otro registro', v_apartado_no;
    end;

    insert into movimientos (registro_id, tipo, motivo, hecho_por,
                             no_dispositivo_anterior, no_dispositivo_nuevo)
    values (p_registro_id, 'reposicion',
            'Se activo el TAG apartado; la procedencia paso a escuela',
            v_quien, v_actual, v_apartado_no);

    -- SC-025: el numero que entra en uso queda asignado en el inventario.
    perform inv_reclamar_tag(v_apartado_no, p_registro_id, v_quien);

    -- Usar el apartado es la reinstalacion pedida: cierra las peticiones de
    -- actualizacion pendientes (solicitud de folio y nota del buzon que pidio
    -- actualizar), para que el registro salga de la cola.
    update solicitudes
       set atendida = true, atendida_en = now(), atendida_por = v_quien,
           resolucion = 'ejecutada'
     where registro_id = p_registro_id and not atendida
       and (tipo = 'actualizacion' or (tipo = 'nota' and tramite_solicitado = 'actualizacion'));

    return jsonb_build_object('id', p_registro_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 7) actualizar_registro_con_estacionamiento: MISMO cuerpo vigente (bloque 40)
--    + reclamo del inventario cuando el tramite cambia el No. de TAG.
-- ---------------------------------------------------------------------
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
    v_tag_apartado boolean;
    v_quien text;
begin
    perform panel_exigir_rol(array['ti']);

    select procedencia_tag, tag_apartado
      into v_proc_actual, v_tag_apartado
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

    v_proc_nueva := nullif(btrim(coalesce(p_procedencia_tag, '')), '');
    if v_proc_nueva is not null and v_proc_nueva not in ('escuela', 'propio') then
        raise exception 'Procedencia de TAG invalida (escuela | propio)';
    end if;
    if v_proc_nueva is not null and v_proc_nueva = v_proc_actual then
        v_proc_nueva := null; -- no cambia nada
    end if;

    -- Caso borde (CC-01): no se cambia a 'escuela' con un apartado vivo. TI debe
    -- usar el TAG apartado (o quitar la reserva) primero.
    if v_proc_nueva = 'escuela' and coalesce(v_tag_apartado, false) then
        raise exception 'Este registro tiene un TAG apartado; use "Usar el TAG apartado" o quite la reserva antes de cambiar la procedencia a escuela';
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

    -- SC-025: si el tramite puso un No. de TAG nuevo y ese numero estaba
    -- disponible en el inventario, queda asignado a este expediente.
    if p_no_dispositivo is not null then
        perform inv_reclamar_tag(p_no_dispositivo, p_registro_id, v_quien);
    end if;

    if v_proc_nueva is not null then
        update registros set procedencia_tag = v_proc_nueva where id = p_registro_id;
        insert into movimientos (registro_id, tipo, motivo, hecho_por)
        values (p_registro_id, 'cambio',
            'Procedencia TAG: ' || v_proc_actual || ' -> ' || v_proc_nueva
                || case when coalesce(btrim(coalesce(p_motivo, '')), '') <> ''
                        then ' - ' || btrim(p_motivo) else '' end,
            v_quien);
    end if;

    -- Cierra las peticiones de actualizacion pendientes: la solicitud de folio
    -- (tipo 'actualizacion') y la nota del buzon (SC-003) que pidio actualizar.
    update solicitudes
       set atendida = true,
           atendida_en = now(),
           atendida_por = v_quien,
           resolucion = 'ejecutada'
     where registro_id = p_registro_id and not atendida
       and (tipo = 'actualizacion' or (tipo = 'nota' and tramite_solicitado = 'actualizacion'));

    return jsonb_build_object('id', p_registro_id);
end;
$$;

-- Hace visibles los RPC nuevos (alta_inventario_tags, retirar_tag_inventario)
-- de inmediato para PostgREST.
notify pgrst, 'reload schema';

-- Auditoria esperada:
-- - alta_inventario_tags con numeros invalidos, ya en inventario, ya activos
--   en el padron o ya apartados: rechaza el lote completo listando cuales.
-- - alta_inventario_tags ok: inserta el lote, responde {agregados: n}.
-- - retirar_tag_inventario de un TAG asignado: rechazado con el folio.
-- - retirar_tag_inventario de un disponible: la fila desaparece.
-- - instalar con un TAG del inventario: la fila queda asignada al expediente
--   (asignado_a/asignado_en/asignado_por) y deja de aparecer como disponible.
-- - instalar con un TAG fuera del inventario (propio o historico): identico
--   al bloque 49, el inventario no se toca.
-- - apartar un TAG del inventario al instalar (procedencia propio): el numero
--   apartado tambien queda asignado.
-- - usar_tag_apartado / actualizar con No. nuevo: reclaman el numero si estaba
--   disponible; el resto del comportamiento es identico a los bloques 40.
-- - Un TAG asignado cuyo numero se corrige despues en el expediente NO se
--   libera solo: se retira/rea-alta a mano si procede (decision de alcance).
-- - anon o authenticated sin rol/MFA: no leen inventario_tags (RLS) ni pueden
--   ejecutar los RPC (panel_exigir_rol).
