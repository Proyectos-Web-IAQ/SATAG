-- =====================================================================
-- 36_fix_descartar_solicitud_notas.sql
-- Fix: descartar_solicitud fallaba con "Solicitud no encontrada" al cerrar o
-- descartar una NOTA sin vincular (SC-003).
--
-- Causa: el RPC (bloque 29, anterior a las notas) detectaba "no encontrada" con
--   select registro_id ... into v_registro_id;
--   if v_registro_id is null then raise 'Solicitud no encontrada';
-- Pero una nota sin vincular tiene registro_id NULL de forma legitima: la fila
-- existe. SELECT ... INTO no distingue "cero filas" de "una fila con NULL", asi
-- que confundia ambos casos.
--
-- Arreglo: usar la variable FOUND de plpgsql (que si distingue "cero filas") en
-- lugar de mirar registro_id, y devolver un id no nulo (el de la solicitud si la
-- nota no estaba vinculada).
--
-- La FIRMA no cambia (uuid, text, text): create or replace reemplaza el cuerpo
-- en sitio. No hay sobrecarga nueva, asi que NO aplica la trampa PostgREST (no
-- hace falta drop function ni notify pgrst).
--
-- Depende de: 29_rpc_panel.sql, 34_buzon_notas_sin_folio.sql.
-- =====================================================================

create or replace function descartar_solicitud(
    p_solicitud_id uuid,
    p_motivo       text,
    p_hecho_por    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_registro_id uuid;
    v_atendida boolean;
begin
    perform panel_exigir_rol(array['ti']);

    if coalesce(btrim(p_motivo), '') = '' then
        raise exception 'Indique por que se descarta la solicitud';
    end if;

    select registro_id, atendida into v_registro_id, v_atendida
      from solicitudes where id = p_solicitud_id;
    -- FOUND distingue "no existe la fila" de "existe con registro_id NULL"
    -- (una nota del buzon aun sin vincular). Antes se miraba v_registro_id.
    if not found then
        raise exception 'Solicitud no encontrada';
    end if;
    if v_atendida then
        raise exception 'La solicitud ya estaba cerrada';
    end if;

    update solicitudes
       set atendida = true,
           atendida_en = now(),
           atendida_por = coalesce(nullif(btrim(coalesce(p_hecho_por,'')), ''), 'TI'),
           resolucion = 'descartada',
           motivo_resolucion = btrim(p_motivo)
     where id = p_solicitud_id;

    -- No se escribe movimiento: no hubo cambio en el registro. La bitacora
    -- del descarte vive en la propia solicitud (resolucion + motivo).
    -- Una nota sin vincular no tiene registro_id: se devuelve el id de la
    -- solicitud para no regresar null.
    return jsonb_build_object('id', coalesce(v_registro_id, p_solicitud_id));
end;
$$;

-- Grants: se conservan los del bloque 29 (create or replace no los altera).
-- La firma es identica, asi que PostgREST no necesita recargar el esquema.

-- Auditoria esperada:
-- - descartar una nota sin vincular (registro_id null): ahora la cierra bien.
-- - descartar un id inexistente: sigue dando 'Solicitud no encontrada' (FOUND).
-- - cerrar una nota ya vinculada o una solicitud normal: sin cambios.
