-- =====================================================================
-- Prueba de punta a punta de L2-09 · 17-sep-2026
-- La seccion del maestro en el alta, en el expediente y en la firma.
--
-- CUANDO. Despues del alta de prueba y ANTES de borrarla con
-- supabase/manual/2026-09-15_borrar_demo_chat.sql.
--
-- EL ALTA DE PRUEBA, en el sitio publicado (/registro/):
--   - titular con "Prueba" en el nombre (lo exige la guardia del borrado),
--   - conductor = Maestro, con una seccion elegida,
--   - sin placas,
--   - SIN cobro: un cobro dispararia el aviso a Chat del bloque 66 y
--     ademas metaria un recibo en la caja.
--
-- QUE TIENE QUE SALIR: la prueba arriba, con ok = true. Eso significa que
-- la seccion se guardo en el expediente Y quedo sellada en el paquete de
-- la firma con la etiqueta satag.acceptance.v3 (bloque 70).
--
-- Solo lee. No modifica nada.
-- =====================================================================

select r.folio,
       r.tipo_usuario,
       r.seccion_maestro                                   as seccion_guardada,
       a.hash_payload ->> 'schema'                          as esquema_del_paquete,
       a.hash_payload -> 'registro' ->> 'seccion_maestro'   as seccion_sellada,
       (    r.seccion_maestro is not null
        and a.hash_payload ->> 'schema' = 'satag.acceptance.v3'
        and a.hash_payload -> 'registro' ->> 'seccion_maestro' = r.seccion_maestro
       )                                                    as ok,
       to_char(r.created_at at time zone 'America/Mexico_City', 'DD-Mon HH24:MI') as alta
  from public.registros r
  join public.aceptaciones a on a.registro_id = r.id
 order by r.created_at desc
 limit 3;
