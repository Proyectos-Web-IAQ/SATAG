-- =====================================================================
-- export-zk-desde-satag.sql · Saca de SATAG los registros INSTALADOS
-- (estado activo, con No. de TAG) en el formato que espera el convertidor
-- generar-import-zk-desde-satag.cjs.
--
-- Uso: pegar en el SQL Editor, ejecutar, y en la tabla de resultados usar
-- el boton de descarga (Export/Download CSV). Guardar el archivo como:
--     Campo\datos\satag-export.csv
-- Despues: node Campo\herramientas\generar-import-zk-desde-satag.cjs
-- =====================================================================

select r.no_dispositivo as tag,
       r.usuario_nombre_completo as nombre,
       coalesce(r.placas, '') as placa,
       r.tipo_usuario as usuario,
       r.folio,
       to_char(r.created_at, 'YYYY-MM-DD') as alta
  from registros r
 where r.estado = 'activo'
   and r.no_dispositivo is not null
 order by r.created_at;
