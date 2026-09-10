-- =====================================================================
-- respaldo_padron_piloto.sql  —  SE CORRE ANTES DE limpiar_padron_piloto.sql
--
-- SOLO LEE. No modifica nada. Su unico proposito es que, si algo sale mal
-- despues del borrado, exista una copia de lo que habia.
--
-- !!! EL RESULTADO ES PII !!!  Nombres, placas, correos, telefonos, huellas de
-- firma y el snapshot completo del titular. Guardelo en `Campo/datos/`, que
-- esta en .gitignore, y BORRELO cuando ya no haga falta.
--
-- El PASO 2 es imprescindible por una razon que no es obvia: la ruta de cada
-- PNG de firma vive en `aceptaciones.firma_url`, y esa tabla desaparece con la
-- limpieza. Si no se captura antes, no queda forma de saber que archivos del
-- bucket `firmas` corresponden al piloto.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 1 — RESPALDO COMPLETO EN JSON.
--
-- Devuelve UNA sola celda. Abrala, copie el contenido y guardelo como
--   Campo/datos/respaldo-piloto-2026-09-10.json
--
-- Si la celda resulta demasiado grande para copiarla, use el PASO 1B: es lo
-- mismo sin `firma_trazos`, que es lo unico que abulta de verdad.
-- ---------------------------------------------------------------------
select jsonb_pretty(jsonb_build_object(
    'exportado_en',  now(),
    'nota',          'Respaldo del piloto del 8-sep-2026, tomado antes de limpiar_padron_piloto.sql. CONTIENE DATOS PERSONALES.',
    'registros',                 coalesce((select jsonb_agg(to_jsonb(t) order by t.folio) from registros t), '[]'::jsonb),
    'aceptaciones',              coalesce((select jsonb_agg(to_jsonb(t)) from aceptaciones t), '[]'::jsonb),
    'pagos',                     coalesce((select jsonb_agg(to_jsonb(t)) from pagos t), '[]'::jsonb),
    'cortes_caja',               coalesce((select jsonb_agg(to_jsonb(t)) from cortes_caja t), '[]'::jsonb),
    'registro_estacionamientos', coalesce((select jsonb_agg(to_jsonb(t)) from registro_estacionamientos t), '[]'::jsonb),
    'movimientos',               coalesce((select jsonb_agg(to_jsonb(t)) from movimientos t), '[]'::jsonb),
    'solicitudes',               coalesce((select jsonb_agg(to_jsonb(t)) from solicitudes t), '[]'::jsonb),
    'inventario_tags_asignados', coalesce((select jsonb_agg(to_jsonb(t)) from inventario_tags t where t.asignado_a is not null), '[]'::jsonb)
)) as respaldo;


-- ---------------------------------------------------------------------
-- PASO 1B — Alternativa mas ligera: lo mismo sin los trazos de la firma.
-- Corralo SOLO si el paso 1 no se pudo copiar. Conserva el sha256 de cada
-- imagen, que es lo que permite verificar despues que un PNG es el original.
-- ---------------------------------------------------------------------
-- select jsonb_pretty(jsonb_build_object(
--     'exportado_en',  now(),
--     'nota',          'Respaldo del piloto SIN firma_trazos. CONTIENE DATOS PERSONALES.',
--     'registros',                 coalesce((select jsonb_agg(to_jsonb(t) order by t.folio) from registros t), '[]'::jsonb),
--     'aceptaciones',              coalesce((select jsonb_agg(to_jsonb(t) - 'firma_trazos') from aceptaciones t), '[]'::jsonb),
--     'pagos',                     coalesce((select jsonb_agg(to_jsonb(t)) from pagos t), '[]'::jsonb),
--     'cortes_caja',               coalesce((select jsonb_agg(to_jsonb(t)) from cortes_caja t), '[]'::jsonb),
--     'registro_estacionamientos', coalesce((select jsonb_agg(to_jsonb(t)) from registro_estacionamientos t), '[]'::jsonb),
--     'movimientos',               coalesce((select jsonb_agg(to_jsonb(t)) from movimientos t), '[]'::jsonb),
--     'solicitudes',               coalesce((select jsonb_agg(to_jsonb(t)) from solicitudes t), '[]'::jsonb),
--     'inventario_tags_asignados', coalesce((select jsonb_agg(to_jsonb(t)) from inventario_tags t where t.asignado_a is not null), '[]'::jsonb)
-- )) as respaldo_ligero;


-- ---------------------------------------------------------------------
-- PASO 2 — LA LISTA DE FIRMAS DEL BUCKET.  **NO SE LO SALTE.**
--
-- Estos son los PNG que hay que borrar del bucket `firmas` despues de la
-- limpieza. Guarde tambien esta lista: cuando `aceptaciones` desaparezca, es
-- la unica forma de saber cuales eran.
--
-- OJO: `limpiar-storage.mjs` NO sirve para esto. Ese script solo borra los
-- archivos `pc-<hex>.png` que deja la prueba de carga; las firmas reales se
-- llaman `<uuid>.png` (lib/firma/servicio.ts:36) y no las toca.
-- ---------------------------------------------------------------------
select r.folio,
       a.firmante_nombre,
       a.firma_url,
       -- El SDK de Storage y el Dashboard esperan la ruta SIN el bucket delante.
       regexp_replace(a.firma_url, '^firmas/', '') as archivo_en_el_bucket,
       a.firma_imagen_sha256,
       a.sello_tiempo
  from aceptaciones a
  join registros r on r.id = a.registro_id
 order by r.folio;

-- Cuantos PNG se esperan en el bucket. Si el Dashboard muestra mas archivos que
-- este numero, los de mas son de pruebas viejas: reviselos antes de borrar.
select count(*) as firmas_del_piloto,
       count(*) filter (where firma_imagen_sha256 is null) as sin_sha256
  from aceptaciones;


-- ---------------------------------------------------------------------
-- PASO 3 — LO QUE SE VA A PERDER, EN UNA LINEA POR TABLA.
-- Es el mismo inventario del PASO 1 de limpiar_padron_piloto.sql; se repite
-- aqui para poder comparar antes y despues sin cambiar de archivo.
-- ---------------------------------------------------------------------
select 'registros'                 as tabla, count(*) as filas from registros
union all select 'aceptaciones',              count(*) from aceptaciones
union all select 'pagos',                     count(*) from pagos
union all select 'cortes_caja',               count(*) from cortes_caja
union all select 'solicitudes',               count(*) from solicitudes
union all select 'registro_estacionamientos', count(*) from registro_estacionamientos
union all select 'movimientos',               count(*) from movimientos
order by tabla;

-- Total cobrado que se pierde de la caja, para cotejarlo con lo que se espera.
select coalesce(sum(monto), 0) as total_cobrado,
       count(*)                as cantidad_pagos
  from pagos;
