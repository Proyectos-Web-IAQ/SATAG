-- =====================================================================
-- 51_limite_intentos_publicos.sql
-- Rate limiting del buzon publico, sin servicios externos.
--
-- EL RIESGO QUE CIERRA (aceptado por escrito en el bloque 28 y en P-11):
-- crear_solicitud es un oraculo de existencia: con una placa vista en un
-- parabrisas se pueden iterar folios (secuenciales, cientos) hasta acertar.
-- P-11 demostro que un script mete 20 envios en ~3 segundos. La condicion
-- de caducidad del riesgo era «cuando entren familias reales»: el padron es
-- real desde el 18-ago.
--
-- COMO: una tabla de intentos por IP (la IP llega en request.headers, como
-- ya la lee crear_registro) y dos limites distintos porque las amenazas son
-- distintas:
--   - crear_solicitud (con folio): lo peligroso son los FALLOS de coincidencia
--     (cada fallo es un folio probado). Limite: 10 fallos por IP en 15 min.
--     Un pada que se equivoca de placa no llega a 10.
--   - crear_nota_solicitud (sin folio): no hay oraculo, hay spam. Limite: 10
--     notas por IP por hora. Una familia manda una; diez en una hora es un
--     script.
--
-- LA TRAMPA TECNICA que obliga a cambiar el contrato de crear_solicitud:
-- un `raise exception` revierte TODA la transaccion, incluido el registro
-- del intento fallido. No se puede anotar un fallo y despues lanzar. Por
-- eso el caso «no coincide» y el caso «limite alcanzado» ya NO lanzan:
-- devuelven { recibida: false, mensaje } con HTTP 200, el intento queda
-- escrito, y el cliente convierte recibida=false en el mismo error de
-- pantalla de siempre. Los errores de validacion (campos vacios) siguen
-- lanzando: no revelan nada y no cuentan como intento.
--
-- ORDEN DE DESPLIEGUE: primero el cliente que entiende las dos formas
-- (excepcion vieja y recibida=false nueva), despues este bloque. Al reves,
-- el buzon mostraria «recibida» ante un fallo.
--
-- Depende de: 28/49 (crear_solicitud), 41 (crear_nota_solicitud), 19
-- (patron de lectura de request.headers).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) La tabla de intentos. Solo la escriben las funciones (security
--    definer); ningun rol la lee ni escribe directo. Se poda sola.
-- ---------------------------------------------------------------------
create table if not exists intentos_publicos (
    id        bigserial primary key,
    ip        inet,
    funcion   text        not null,
    exito     boolean     not null,
    creado_en timestamptz not null default now()
);
create index if not exists ix_intentos_publicos_ip_fn_fecha
    on intentos_publicos (ip, funcion, creado_en desc);

alter table intentos_publicos enable row level security;
revoke all on table intentos_publicos from public, anon, authenticated;
-- Sin politicas a proposito: nadie la alcanza desde la API.

-- ---------------------------------------------------------------------
-- 2) Helpers. La IP sale de x-forwarded-for (primer salto) igual que en
--    crear_registro; si el header viene malformado, la IP queda nula y el
--    limite NO aplica (mejor un hueco raro que bloquear a todos por error).
-- ---------------------------------------------------------------------
create or replace function fn_ip_peticion() returns inet
language plpgsql
stable
as $$
declare
    v_headers json;
    v_xff     text;
begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
    v_xff := btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1));
    begin
        return nullif(v_xff, '')::inet;
    exception when others then
        return null;
    end;
end;
$$;
revoke all on function fn_ip_peticion() from public;

-- Cuenta intentos recientes de una IP para una funcion. Con p_solo_fallos
-- cuenta unicamente los fallidos.
create or replace function fn_intentos_recientes(
    p_ip inet, p_funcion text, p_ventana interval, p_solo_fallos boolean
) returns integer
language sql
stable
as $$
    select count(*)::integer
      from intentos_publicos
     where ip = p_ip
       and funcion = p_funcion
       and creado_en > now() - p_ventana
       and (not p_solo_fallos or not exito);
$$;
revoke all on function fn_intentos_recientes(inet, text, interval, boolean) from public;

-- Anota un intento y poda lo mas viejo de vez en cuando (1 de cada ~50
-- llamadas), para que la tabla no crezca sin fin sin necesitar cron.
create or replace function fn_anotar_intento(p_ip inet, p_funcion text, p_exito boolean)
returns void
language plpgsql
as $$
begin
    insert into intentos_publicos (ip, funcion, exito) values (p_ip, p_funcion, p_exito);
    if random() < 0.02 then
        delete from intentos_publicos where creado_en < now() - interval '2 days';
    end if;
end;
$$;
revoke all on function fn_anotar_intento(inet, text, boolean) from public;

-- ---------------------------------------------------------------------
-- 3) crear_solicitud (cuerpo vivo del bloque 49) + limite de fallos.
--    Contrato: { recibida: true } | { recibida: false, mensaje: text }.
-- ---------------------------------------------------------------------
create or replace function crear_solicitud(
    p_folio        text,
    p_placas_o_tag text,
    p_tipo         text,
    p_detalle      text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_registro_id uuid;
    v_folio text;
    v_dato text;
    v_ip inet := fn_ip_peticion();
begin
    if p_tipo not in ('actualizacion','baja') then
        raise exception 'Tipo de solicitud invalido';
    end if;
    if coalesce(btrim(p_detalle),'') = '' then
        raise exception 'Describa brevemente que necesita';
    end if;
    if char_length(btrim(p_detalle)) > 500 then
        raise exception 'El detalle no puede exceder 500 caracteres';
    end if;

    v_folio := upper(btrim(coalesce(p_folio,'')));
    v_dato  := upper(btrim(coalesce(p_placas_o_tag,'')));
    if v_folio = '' or v_dato = '' then
        raise exception 'Capture su folio y sus placas (o No. de TAG)';
    end if;

    -- Limite: 10 fallos de coincidencia por IP en 15 minutos. Se responde con
    -- el MISMO mensaje que un fallo normal, para no regalar la senal de que
    -- el limite existe ni cuando se dispara.
    if v_ip is not null
       and fn_intentos_recientes(v_ip, 'crear_solicitud', interval '15 minutes', true) >= 10 then
        perform fn_anotar_intento(v_ip, 'crear_solicitud', false);
        return jsonb_build_object('recibida', false,
            'mensaje', 'Los datos no coinciden con ningun registro vigente');
    end if;

    select r.id
      into v_registro_id
      from registros r
     where r.folio = v_folio
       and r.estado <> 'baja'
       and (
            upper(coalesce(r.placas,'')) = v_dato
            or coalesce(r.no_dispositivo,'') = v_dato
       )
     limit 1;

    if v_registro_id is null then
        -- El fallo queda escrito porque NO se lanza excepcion.
        perform fn_anotar_intento(v_ip, 'crear_solicitud', false);
        return jsonb_build_object('recibida', false,
            'mensaje', 'Los datos no coinciden con ningun registro vigente');
    end if;

    begin
        insert into solicitudes (registro_id, tipo, detalle, origen)
        values (v_registro_id, p_tipo, btrim(p_detalle), 'publico');
    exception when unique_violation then
        raise exception 'Ya hay una solicitud de este tipo en proceso para su registro';
    end;

    perform fn_anotar_intento(v_ip, 'crear_solicitud', true);
    return jsonb_build_object('recibida', true);
end;
$$;

-- ---------------------------------------------------------------------
-- 4) crear_nota_solicitud (cuerpo vivo del bloque 41) + limite de volumen.
--    Aqui el limite SI lanza: no hay oraculo que proteger y el intento
--    exitoso ya quedo escrito en las llamadas anteriores.
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
    v_ip      inet := fn_ip_peticion();
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

    -- Limite: 10 notas por IP por hora.
    if v_ip is not null
       and fn_intentos_recientes(v_ip, 'crear_nota_solicitud', interval '1 hour', false) >= 10 then
        raise exception 'Se recibieron demasiadas notas desde esta conexion. Espere una hora o acuda a Sistemas.';
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

    perform fn_anotar_intento(v_ip, 'crear_nota_solicitud', true);
    return jsonb_build_object('recibida', true);
end;
$$;

-- Mismas firmas que 49 y 41: los grants se conservan.
notify pgrst, 'reload schema';

-- =====================================================================
-- Auditoria esperada tras aplicar (con el cliente nuevo ya publicado):
-- - P-12 se reejecuta: folio real + placa equivocada y folio inexistente dan
--   el mismo mensaje, ahora con HTTP 200 y recibida=false (el cliente lo
--   muestra igual). Sigue sin revelar nada del registro.
-- - P-11 se reejecuta con arnes/p11.mjs: de 20 notas entran 10 y las otras
--   10 se rechazan con «Se recibieron demasiadas notas...». Limpieza igual.
-- - Un fallo de coincidencia deja fila en intentos_publicos (exito=false);
--   una solicitud recibida deja fila con exito=true. Nadie puede leer la
--   tabla desde la API: select sobre ella con anon/authenticated -> 42501.
-- - Prueba del oraculo: 11 intentos fallidos seguidos desde la misma IP; el
--   11.o responde igual que los demas pero sin consultar registros (el
--   limite actua antes del select).
-- =====================================================================
