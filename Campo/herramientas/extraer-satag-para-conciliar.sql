-- =====================================================================
-- EXTRACTO DE SATAG PARA CONCILIAR CONTRA ZK — solo lectura
--
-- Se corre en el SQL Editor el MISMO DIA que se exportan Personas, Derechos de
-- Acceso por Persona y Todos los Eventos de ZK, para que las cuatro fotos sean
-- del mismo momento. Resultado: «Download CSV» y guardarlo en Campo/datos/
-- (esta en .gitignore: trae nombres y placas).
--
-- Un renglon por expediente vivo o dado de baja, con lo que ZK tambien sabe
-- (tarjeta, nombre, departamento implicito en el tipo) y lo que solo SATAG sabe
-- (origen, plumas, si ya pago, si esta instalado).
-- No escribe nada. No depende del bloque 85.
-- =====================================================================
select r.folio,
       r.no_dispositivo                                   as tarjeta,
       r.estado,
       r.tipo_usuario,
       r.origen_expediente,
       r.usuario_nombre_completo                          as nombre,
       r.placas,
       r.sin_placas,
       r.procedencia_tag,
       r.tag_apartado_no,
       (select string_agg(re.estacionamiento_clave, '+' order by re.estacionamiento_clave)
          from registro_estacionamientos re
         where re.registro_id = r.id)                     as plumas,
       exists (select 1 from pagos p where p.registro_id = r.id) as tiene_pago,
       r.fecha_instalacion,
       (r.created_at at time zone 'America/Mexico_City')::date as alta,
       r.fecha_baja,
       r.motivo_baja
  from registros r
 order by r.folio;
