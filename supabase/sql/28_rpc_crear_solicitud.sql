-- =====================================================================
-- 28_rpc_crear_solicitud.sql
-- Solicitud publica (sin sesion) de actualizacion o baja sobre un registro.
-- SECURITY DEFINER: anon no tiene acceso a las tablas; este RPC valida por
-- dentro que el solicitante demuestre ser el titular con un dato compartido:
--   folio (impreso en su comprobante) + placas (o No. de TAG si no hay placas).
--
-- Decisiones cerradas (2026-07):
-- - Respuesta honesta: si los datos no coinciden se dice claramente.
-- - La solicitud es INERTE: solo encola trabajo para TI; el cambio real se
--   ejecuta con la persona presente. Por eso el riesgo de abuso es bajo.
-- - Anti-spam: maximo una solicitud pendiente por tipo por registro
--   (indice unico parcial en 26_solicitudes.sql).
-- - Rate limiting fuerte (captcha/Edge Function): pendiente; anotado.
--
-- MODELO DE AMENAZA (honesto; corregido tras revision 2026-07-15):
-- El folio NO es un secreto fuerte. crear_registro lo genera secuencial
-- ('SATAG-' || lpad(nextval(...), 6, '0') -> SATAG-000001, 000002, ...), asi
-- que el espacio a adivinar no son 10^6 combinaciones: es el tamano del
-- padron (cientos). Y las placas son visibles en el parabrisas de cualquier
-- coche estacionado. Con una placa conocida, iterar folios hasta acertar es
-- barato mientras no haya rate limiting.
--
-- Se acepta el riesgo residual porque el dano acotado es bajo:
-- - El RPC nunca devuelve datos del registro (solo {recibida:true}).
-- - La solicitud no modifica el registro; TI ejecuta con la persona presente.
-- - El indice unico parcial topa el spam a 2 solicitudes por registro.
-- - TI puede limpiar la cola con descartar_solicitud (bloque 29).
-- Lo que SI se filtra: confirmar que una placa dada esta en el padron
-- (oraculo de existencia) y vincular placa <-> folio.
-- Mitigacion pendiente: rate limiting por IP (captcha/Edge Function).
--
-- Depende de: registros, solicitudes.
-- Devuelve: jsonb { recibida: true } (nunca datos del registro).
-- =====================================================================

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
begin
    if p_tipo not in ('actualizacion','baja') then
        raise exception 'Tipo de solicitud invalido';
    end if;
    if coalesce(btrim(p_detalle),'') = '' then
        raise exception 'Describe brevemente que necesitas';
    end if;
    if char_length(btrim(p_detalle)) > 500 then
        raise exception 'El detalle no puede exceder 500 caracteres';
    end if;

    v_folio := upper(btrim(coalesce(p_folio,'')));
    v_dato  := upper(btrim(coalesce(p_placas_o_tag,'')));
    if v_folio = '' or v_dato = '' then
        raise exception 'Captura tu folio y tus placas (o No. de TAG)';
    end if;

    -- Coincidencia exacta de folio + (placas o No. de TAG) sobre registros
    -- vivos. Respuesta binaria a proposito: jamas se devuelven datos del
    -- registro (anon no debe poder leer nada del padron).
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
        raise exception 'Los datos no coinciden con ningun registro vigente';
    end if;

    begin
        insert into solicitudes (registro_id, tipo, detalle, origen)
        values (v_registro_id, p_tipo, btrim(p_detalle), 'publico');
    exception when unique_violation then
        raise exception 'Ya hay una solicitud de este tipo en proceso para tu registro';
    end;

    return jsonb_build_object('recibida', true);
end;
$$;

revoke all on function crear_solicitud(text, text, text, text) from public;
grant execute on function crear_solicitud(text, text, text, text) to anon, authenticated;
