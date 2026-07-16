-- =====================================================================
-- 34_buzon_notas_sin_folio.sql
-- SC-003: buzon publico de notas SIN folio ni placa.
-- Principio: recolectar es publico, buscar es privado.
--
-- Una NOTA es una solicitud (tipo 'nota') que el publico deja sin demostrar ser
-- titular: el RPC NO consulta la base y no revela nada. Captura a quien escribe
-- y a que alumno se refiere para que TI la empate A MANO con un expediente
-- (buscando por nombre en el panel).
--
-- Se conserva intacta la ruta CC-06 (folio + placa -> crear_solicitud) para
-- quien trae comprobante.
--
-- Ciclo de una nota:
--   publico deja nota (registro_id NULL, tipo 'nota')
--     -> TI la ve en "Notas sin expediente"
--     -> TI la vincula a un expediente (vincular_nota: set registro_id)
--     -> TI atiende (actualizar/baja) y cierra la nota (descartar_solicitud),
--        o la descarta directo si es spam/no procede.
--
-- Depende de: 26_solicitudes.sql, 29_rpc_panel.sql.
-- Aplicar despues del bloque 33.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Esquema: registro_id opcional + columnas de la nota + coherencia.
-- ---------------------------------------------------------------------
alter table solicitudes alter column registro_id drop not null;

alter table solicitudes
    add column if not exists solicitante_nombre text,
    add column if not exists alumno_nombre      text,
    add column if not exists alumno_grado        text,
    add column if not exists vehiculo_desc       text;

comment on column solicitudes.solicitante_nombre is 'PII (LFPDPPP): nombre de quien deja la nota publica (SC-003)';
comment on column solicitudes.alumno_nombre      is 'PII (LFPDPPP): nombre del alumno referido en la nota (SC-003)';
comment on column solicitudes.alumno_grado       is 'Grado/grupo del alumno, para que TI empate la nota';
comment on column solicitudes.vehiculo_desc      is 'PII posible: descripcion libre del coche (opcional)';

-- tipo ahora admite 'nota'.
alter table solicitudes drop constraint if exists sol_tipo_valido;
alter table solicitudes add constraint sol_tipo_valido
    check (tipo in ('actualizacion','baja','nota'));

-- Una solicitud de folio (actualizacion|baja) SIEMPRE trae registro_id; una nota
-- puede quedar sin vincular (registro_id NULL) hasta que TI la empate.
alter table solicitudes drop constraint if exists sol_registro_por_tipo;
alter table solicitudes add constraint sol_registro_por_tipo
    check (tipo = 'nota' or registro_id is not null);

-- Los campos de la nota solo viven en las notas.
alter table solicitudes drop constraint if exists sol_campos_nota;
alter table solicitudes add constraint sol_campos_nota check (
    tipo = 'nota'
    or (solicitante_nombre is null and alumno_nombre is null
        and alumno_grado is null and vehiculo_desc is null)
);

-- Una nota exige quien escribe + alumno + grado: son los datos con que TI la
-- empata. (El "que necesita" va en detalle, ya obligatorio por sol_detalle_no_vacio.)
alter table solicitudes drop constraint if exists sol_nota_requiere_datos;
alter table solicitudes add constraint sol_nota_requiere_datos check (
    tipo <> 'nota'
    or (btrim(coalesce(solicitante_nombre,'')) <> ''
        and btrim(coalesce(alumno_nombre,'')) <> ''
        and btrim(coalesce(alumno_grado,'')) <> '')
);

-- Nota: el indice uq_solicitudes_pendiente_por_tipo (registro_id, tipo) ignora
-- las notas sin vincular (registro_id NULL son distintos entre si en un indice
-- unico). Una vez vinculada, topa a 1 nota pendiente por expediente (ver el
-- manejo de unique_violation en vincular_nota).

-- ---------------------------------------------------------------------
-- 2) RPC publico: dejar una nota. NO consulta la base, no revela nada.
--    Devuelve { recibida: true }. Mismo contrato honesto que crear_solicitud.
--    Anti-spam fuerte (rate limiting / captcha) PENDIENTE, igual que CC-06.
-- ---------------------------------------------------------------------
create or replace function crear_nota_solicitud(
    p_solicitante_nombre text,
    p_alumno_nombre      text,
    p_alumno_grado       text,
    p_detalle            text,
    p_vehiculo_desc      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    if btrim(coalesce(p_solicitante_nombre,'')) = ''
       or btrim(coalesce(p_alumno_nombre,'')) = ''
       or btrim(coalesce(p_alumno_grado,'')) = '' then
        raise exception 'Faltan datos: tu nombre, el del alumno y su grado';
    end if;
    if btrim(coalesce(p_detalle,'')) = '' then
        raise exception 'Cuentanos brevemente que necesitas';
    end if;
    if char_length(btrim(p_detalle)) > 500 then
        raise exception 'El detalle no puede exceder 500 caracteres';
    end if;

    insert into solicitudes (
        registro_id, tipo, detalle, origen,
        solicitante_nombre, alumno_nombre, alumno_grado, vehiculo_desc
    ) values (
        null, 'nota', btrim(p_detalle), 'publico',
        btrim(p_solicitante_nombre), btrim(p_alumno_nombre), btrim(p_alumno_grado),
        nullif(btrim(coalesce(p_vehiculo_desc,'')), '')
    );

    return jsonb_build_object('recibida', true);
end;
$$;

revoke all on function crear_nota_solicitud(text, text, text, text, text) from public;
grant execute on function crear_nota_solicitud(text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) RPC de vinculacion (rol ti): empata una nota con un expediente.
--    Solo setea registro_id + deja movimiento. La nota queda pendiente bajo el
--    expediente; TI la atiende y la cierra con el flujo normal / descartar.
-- ---------------------------------------------------------------------
create or replace function vincular_nota(
    p_solicitud_id uuid,
    p_registro_id  uuid,
    p_hecho_por    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tipo text;
    v_atendida boolean;
    v_registro_actual uuid;
    v_estado text;
    v_quien text;
begin
    perform panel_exigir_rol(array['ti']);

    select tipo, atendida, registro_id
      into v_tipo, v_atendida, v_registro_actual
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
        update solicitudes set registro_id = p_registro_id where id = p_solicitud_id;
    exception when unique_violation then
        raise exception 'Ese expediente ya tiene una nota pendiente; cierrala antes de vincular otra';
    end;

    insert into movimientos (registro_id, tipo, motivo, hecho_por)
    values (p_registro_id, 'cambio', 'Nota del buzon vinculada al expediente', v_quien);

    return jsonb_build_object('id', p_registro_id);
end;
$$;

revoke all on function vincular_nota(uuid, uuid, text) from public;
grant execute on function vincular_nota(uuid, uuid, text) to authenticated;

-- Hace visibles de inmediato los RPC nuevos para PostgREST/Supabase API.
notify pgrst, 'reload schema';

-- Auditoria esperada:
-- - anon: solo EXECUTE de crear_nota_solicitud; nada mas.
-- - crear_nota_solicitud nunca devuelve datos del padron (solo {recibida:true}).
-- - authenticated sin aal2/rol ti: vincular_nota rechaza.
-- - vincular una no-nota / ya vinculada / ya cerrada: rechazado.
-- - descartar_solicitud ya cierra notas (incluidas las sin vincular): sirve para spam.
-- - la ruta CC-06 (crear_solicitud folio+placa) queda intacta.
