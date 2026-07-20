-- =====================================================================
-- 41_solicitudes_sin_instalacion.sql
-- Regla: el TAG se instala SOLO por el alta (registro). Una solicitud/nota es
-- siempre POSTERIOR a la instalacion, asi que solo puede ser 'actualizacion' o
-- 'baja'. Se elimina 'instalacion' del catalogo de tramites del buzon.
--
-- (La cola "Instalar TAG" del panel de TI NO se toca: esa mira registros pagados
--  pendientes de instalar, del flujo de alta, no solicitudes.)
--
-- ORDEN AL APLICAR: re-aplica antes el seed actualizado (ya sin notas de
-- instalacion). Si quedan notas con tramite_solicitado='instalacion', la nueva
-- constraint sol_tramite_valido fallara. Verifica:
--   select count(*) from solicitudes where tramite_solicitado='instalacion';
--
-- Los RPCs conservan su firma (solo cambia la validacion) -> create or replace
-- en sitio, sin trampa PostgREST.
--
-- Depende de: 37_nota_tramite_solicitado.sql, 39_vincular_nota_corrobora_tramite.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Catalogo reducido: solo actualizacion | baja.
-- ---------------------------------------------------------------------
alter table solicitudes drop constraint if exists sol_tramite_valido;
alter table solicitudes add constraint sol_tramite_valido check (
    tramite_solicitado is null
    or tramite_solicitado in ('actualizacion','baja')
);

-- ---------------------------------------------------------------------
-- 2) crear_nota_solicitud: valida solo actualizacion | baja.
--    (Reproduce el bloque 37; misma firma.)
-- ---------------------------------------------------------------------
create or replace function crear_nota_solicitud(
    p_solicitante_nombre text,
    p_solicitante_rol    text,
    p_tramite_solicitado text,
    p_alumno_nombre      text,
    p_alumno_grado       text,
    p_detalle            text,
    p_vehiculo_desc      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_rol     text;
    v_tramite text;
begin
    v_rol     := lower(btrim(coalesce(p_solicitante_rol,'')));
    v_tramite := lower(btrim(coalesce(p_tramite_solicitado,'')));

    if btrim(coalesce(p_solicitante_nombre,'')) = '' then
        raise exception 'Falta su nombre';
    end if;
    if v_rol not in ('maestro','padres','alumno','admin') then
        raise exception 'Indique quien solicita (padres, maestro, administrativo o alumno)';
    end if;
    if v_tramite not in ('actualizacion','baja') then
        raise exception 'Indique que necesita: actualizar datos o dar de baja';
    end if;
    -- Solo a los padres se les pide identificar al alumno y su grado.
    if v_rol = 'padres'
       and (btrim(coalesce(p_alumno_nombre,'')) = ''
            or btrim(coalesce(p_alumno_grado,'')) = '') then
        raise exception 'Como padre, madre o tutor, indique el nombre del alumno y su grado';
    end if;
    if btrim(coalesce(p_detalle,'')) = '' then
        raise exception 'Cuentenos brevemente que necesita';
    end if;
    if char_length(btrim(p_detalle)) > 500 then
        raise exception 'El detalle no puede exceder 500 caracteres';
    end if;

    insert into solicitudes (
        registro_id, tipo, detalle, origen,
        solicitante_nombre, solicitante_rol, tramite_solicitado,
        alumno_nombre, alumno_grado, vehiculo_desc
    ) values (
        null, 'nota', btrim(p_detalle), 'publico',
        btrim(p_solicitante_nombre), v_rol, v_tramite,
        nullif(btrim(coalesce(p_alumno_nombre,'')), ''),
        nullif(btrim(coalesce(p_alumno_grado,'')), ''),
        nullif(btrim(coalesce(p_vehiculo_desc,'')), '')
    );

    return jsonb_build_object('recibida', true);
end;
$$;

-- ---------------------------------------------------------------------
-- 3) vincular_nota: el tramite corroborado solo puede ser actualizacion | baja.
--    (Reproduce el bloque 39; misma firma.)
-- ---------------------------------------------------------------------
create or replace function vincular_nota(
    p_solicitud_id uuid,
    p_registro_id  uuid,
    p_tramite      text,
    p_hecho_por    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tipo            text;
    v_atendida        boolean;
    v_registro_actual uuid;
    v_tramite_actual  text;
    v_estado          text;
    v_quien           text;
    v_motivo          text;
begin
    perform panel_exigir_rol(array['ti']);

    if p_tramite not in ('actualizacion','baja') then
        raise exception 'Indique el tramite a realizar: actualizar o dar de baja';
    end if;

    select tipo, atendida, registro_id, tramite_solicitado
      into v_tipo, v_atendida, v_registro_actual, v_tramite_actual
      from solicitudes
     where id = p_solicitud_id
       for update;
    if not found then
        raise exception 'Nota no encontrada';
    end if;
    if v_tipo <> 'nota' then
        raise exception 'Esta solicitud no es una nota sin expediente';
    end if;
    if v_atendida then
        raise exception 'La nota ya estaba cerrada';
    end if;
    if v_registro_actual is not null then
        raise exception 'La nota ya esta vinculada a un expediente';
    end if;

    select estado into v_estado from registros where id = p_registro_id;
    if v_estado is null then
        raise exception 'Registro no encontrado';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por,'')), ''), 'TI');

    begin
        update solicitudes
           set registro_id = p_registro_id,
               tramite_solicitado = p_tramite
         where id = p_solicitud_id;
    exception when unique_violation then
        raise exception 'Ese expediente ya tiene una nota pendiente; cierrala antes de vincular otra';
    end;

    v_motivo := case
        when p_tramite is distinct from v_tramite_actual
            then 'Nota del buzon vinculada; TI corroboro el tramite de '
                 || coalesce(v_tramite_actual, '?') || ' a ' || p_tramite
        else 'Nota del buzon vinculada al expediente (tramite ' || p_tramite || ')'
    end;
    insert into movimientos (registro_id, tipo, motivo, hecho_por)
    values (p_registro_id, 'cambio', v_motivo, v_quien);

    return jsonb_build_object('id', p_registro_id);
end;
$$;

-- Refresca los cuerpos nuevos para PostgREST (las firmas no cambiaron).
notify pgrst, 'reload schema';

-- Auditoria esperada:
-- - crear_nota_solicitud / vincular_nota con tramite 'instalacion': rechazado.
-- - constraint sol_tramite_valido rechaza cualquier fila con 'instalacion'.
-- - notas y solicitudes de actualizacion/baja: sin cambios.
