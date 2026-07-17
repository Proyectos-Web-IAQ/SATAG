-- =====================================================================
-- 35_notas_generalizar_solicitante.sql
-- SC-003 (continuacion): la nota publica ya no es solo para padres.
--
-- El bloque 34 exigia alumno + grado en TODA nota (modelo parent-centric).
-- Pero quien deja la nota tambien puede ser maestro, administrativo o alumno.
-- Aqui se agrega "quien solicita" (solicitante_rol, alineado con el catalogo
-- reg_tipo_usuario_valido: maestro/padres/alumno/admin) y se relaja la regla:
-- alumno + grado solo son obligatorios cuando el rol es 'padres'; para el resto
-- quedan opcionales. Lo unico obligatorio en toda nota: nombre + rol + detalle.
--
-- OJO al aplicar:
--   1) Cambia la FIRMA de crear_nota_solicitud (nuevo parametro): se hace
--      DROP FUNCTION explicito de la firma vieja + notify pgrst para no dejar
--      dos sobrecargas ambiguas ante PostgREST.
--   2) Si ya existen notas del bloque 34 (solicitante_rol NULL), la nueva
--      constraint sol_nota_requiere_datos fallara al validarlas. Verifica antes:
--        select count(*) from solicitudes where tipo = 'nota';
--      y borralas o haz backfill de solicitante_rol.
--
-- Depende de: 34_buzon_notas_sin_folio.sql. Aplicar despues del bloque 34.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Esquema: quien solicita.
-- ---------------------------------------------------------------------
alter table solicitudes
    add column if not exists solicitante_rol text;

comment on column solicitudes.solicitante_rol is
    'Quien deja la nota (SC-003): padres|maestro|alumno|admin. Alineado con reg_tipo_usuario_valido. NULL fuera de las notas.';

-- El rol solo admite los valores del catalogo de registros (o NULL fuera de notas).
alter table solicitudes drop constraint if exists sol_solicitante_rol_valido;
alter table solicitudes add constraint sol_solicitante_rol_valido check (
    solicitante_rol is null
    or solicitante_rol in ('maestro','padres','alumno','admin')
);

-- ---------------------------------------------------------------------
-- 2) Coherencia: los campos de la nota (incluido el rol) solo viven en notas.
--    Se recrea sol_campos_nota del bloque 34 sumando solicitante_rol.
-- ---------------------------------------------------------------------
alter table solicitudes drop constraint if exists sol_campos_nota;
alter table solicitudes add constraint sol_campos_nota check (
    tipo = 'nota'
    or (solicitante_nombre is null and solicitante_rol is null
        and alumno_nombre is null and alumno_grado is null
        and vehiculo_desc is null)
);

-- ---------------------------------------------------------------------
-- 3) La regla relajada: toda nota exige nombre + rol; alumno + grado solo
--    cuando el rol es 'padres'. (El "que necesita" va en detalle, ya
--    obligatorio por sol_detalle_no_vacio.)
-- ---------------------------------------------------------------------
alter table solicitudes drop constraint if exists sol_nota_requiere_datos;
alter table solicitudes add constraint sol_nota_requiere_datos check (
    tipo <> 'nota'
    or (
        btrim(coalesce(solicitante_nombre,'')) <> ''
        and solicitante_rol is not null
        and (
            solicitante_rol <> 'padres'
            or (btrim(coalesce(alumno_nombre,'')) <> ''
                and btrim(coalesce(alumno_grado,'')) <> '')
        )
    )
);

-- ---------------------------------------------------------------------
-- 4) RPC publico: nueva firma con p_solicitante_rol.
--    La firma vieja (5 args) DEBE eliminarse explicitamente: create or replace
--    no reemplaza una firma distinta, dejaria dos sobrecargas ambiguas.
-- ---------------------------------------------------------------------
drop function if exists crear_nota_solicitud(text, text, text, text, text);

create or replace function crear_nota_solicitud(
    p_solicitante_nombre text,
    p_solicitante_rol    text,
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
    v_rol text;
begin
    v_rol := lower(btrim(coalesce(p_solicitante_rol,'')));

    if btrim(coalesce(p_solicitante_nombre,'')) = '' then
        raise exception 'Falta tu nombre';
    end if;
    if v_rol not in ('maestro','padres','alumno','admin') then
        raise exception 'Indica quien solicita (padres, maestro, administrativo o alumno)';
    end if;
    -- Solo a los padres se les pide identificar al alumno y su grado.
    if v_rol = 'padres'
       and (btrim(coalesce(p_alumno_nombre,'')) = ''
            or btrim(coalesce(p_alumno_grado,'')) = '') then
        raise exception 'Como padre o madre, indica el nombre del alumno y su grado';
    end if;
    if btrim(coalesce(p_detalle,'')) = '' then
        raise exception 'Cuentanos brevemente que necesitas';
    end if;
    if char_length(btrim(p_detalle)) > 500 then
        raise exception 'El detalle no puede exceder 500 caracteres';
    end if;

    insert into solicitudes (
        registro_id, tipo, detalle, origen,
        solicitante_nombre, solicitante_rol,
        alumno_nombre, alumno_grado, vehiculo_desc
    ) values (
        null, 'nota', btrim(p_detalle), 'publico',
        btrim(p_solicitante_nombre), v_rol,
        nullif(btrim(coalesce(p_alumno_nombre,'')), ''),
        nullif(btrim(coalesce(p_alumno_grado,'')), ''),
        nullif(btrim(coalesce(p_vehiculo_desc,'')), '')
    );

    return jsonb_build_object('recibida', true);
end;
$$;

revoke all on function crear_nota_solicitud(text, text, text, text, text, text) from public;
grant execute on function crear_nota_solicitud(text, text, text, text, text, text) to anon, authenticated;

-- Hace visible la firma nueva de inmediato para PostgREST/Supabase API.
notify pgrst, 'reload schema';

-- Auditoria esperada:
-- - anon: solo EXECUTE de la nueva firma (6 args); la firma vieja de 5 args ya
--   no existe (probar que un cliente viejo con 5 args recibe "function not found").
-- - crear_nota_solicitud sigue sin devolver datos del padron (solo {recibida:true}).
-- - nota de padres sin alumno/grado -> rechazada; nota de maestro sin ellos -> OK.
-- - solicitante_rol fuera del catalogo -> rechazado (RPC y constraint).
-- - filas actualizacion/baja: solicitante_rol NULL (sol_campos_nota las obliga a NULL).