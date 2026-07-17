-- =====================================================================
-- 37_nota_tramite_solicitado.sql
-- SC-003 v2: la nota del buzon ahora DECLARA que tramite pide el cliente
-- (instalacion | actualizacion | baja), no solo texto libre.
--
-- Es lo que el cliente PIDE, no lo que TI decide: TI lo ve al recibir la nota y
-- lo corrobora. Puede aplicar otro tramite si el que pidio el cliente no
-- corresponde a su caso (p.ej. pidio "actualizar" pero procede una baja). Por eso
-- vive en su propia columna y NO se convierte en una solicitud del tipo pedido.
--
-- 'instalacion' es un valor nuevo que NO existe en sol_tipo_valido (instalar no
-- genera una solicitud): por eso el tramite pedido va en columna aparte, con su
-- propio catalogo, sin tocar solicitudes.tipo.
--
-- OJO al aplicar:
--   1) Cambia la FIRMA de crear_nota_solicitud (nuevo parametro): drop de la
--      firma vieja (6 args) + notify pgrst (trampa PostgREST).
--   2) La constraint nueva valida las notas ya existentes: si quedan notas de
--      pruebas con tramite_solicitado NULL, la creacion de
--      sol_nota_tramite_obligatorio fallara. Verifica y limpia/backfillea antes:
--        select count(*) from solicitudes where tipo='nota' and tramite_solicitado is null;
--        -- borrar:   delete from solicitudes where tipo='nota' and tramite_solicitado is null;
--        -- o backfill: update solicitudes set tramite_solicitado='actualizacion'
--        --             where tipo='nota' and tramite_solicitado is null;
--
-- Depende de: 34_buzon_notas_sin_folio.sql, 35_notas_generalizar_solicitante.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Esquema: que tramite pide el cliente.
-- ---------------------------------------------------------------------
alter table solicitudes
    add column if not exists tramite_solicitado text;

comment on column solicitudes.tramite_solicitado is
    'Que tramite PIDE el cliente en una nota del buzon (SC-003): instalacion|actualizacion|baja. Es lo que pide, no lo que TI decide (TI lo corrobora). NULL fuera de las notas.';

alter table solicitudes drop constraint if exists sol_tramite_valido;
alter table solicitudes add constraint sol_tramite_valido check (
    tramite_solicitado is null
    or tramite_solicitado in ('instalacion','actualizacion','baja')
);

-- ---------------------------------------------------------------------
-- 2) Coherencia: el tramite pedido solo vive en las notas (se recrea
--    sol_campos_nota sumando la columna nueva), y ahi es obligatorio.
-- ---------------------------------------------------------------------
alter table solicitudes drop constraint if exists sol_campos_nota;
alter table solicitudes add constraint sol_campos_nota check (
    tipo = 'nota'
    or (solicitante_nombre is null and solicitante_rol is null
        and alumno_nombre is null and alumno_grado is null
        and vehiculo_desc is null and tramite_solicitado is null)
);

alter table solicitudes drop constraint if exists sol_nota_tramite_obligatorio;
alter table solicitudes add constraint sol_nota_tramite_obligatorio check (
    tipo <> 'nota' or tramite_solicitado is not null
);

-- ---------------------------------------------------------------------
-- 3) RPC publico: nueva firma con p_tramite_solicitado.
--    La firma vieja (6 args) DEBE eliminarse: create or replace no reemplaza
--    una firma distinta, dejaria dos sobrecargas ambiguas ante PostgREST.
-- ---------------------------------------------------------------------
drop function if exists crear_nota_solicitud(text, text, text, text, text, text);

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
    if v_tramite not in ('instalacion','actualizacion','baja') then
        raise exception 'Indique que necesita: instalar TAG, actualizar datos o dar de baja';
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

revoke all on function crear_nota_solicitud(text, text, text, text, text, text, text) from public;
grant execute on function crear_nota_solicitud(text, text, text, text, text, text, text) to anon, authenticated;

-- Hace visible la firma nueva de inmediato para PostgREST/Supabase API.
notify pgrst, 'reload schema';

-- Auditoria esperada:
-- - nota sin tramite -> rechazada (RPC y constraint sol_nota_tramite_obligatorio).
-- - tramite fuera del catalogo -> rechazado (RPC y sol_tramite_valido).
-- - filas actualizacion/baja: tramite_solicitado NULL (sol_campos_nota las obliga).
-- - la firma vieja de 6 args ya no existe (un cliente viejo recibe "function not found").
