-- =====================================================================
-- EXTRACTO DE SATAG PARA CONCILIAR CONTRA ZK — solo lectura
--
-- Se corre en el SQL Editor el MISMO DIA que se exportan Personas, Privilegios
-- por Puerta y Todos los Eventos de ZK, para que las fotos sean del mismo
-- momento. Resultado: «Download CSV» y guardarlo en Campo/datos/AAAA-MM-DD/
-- (esta en .gitignore: trae nombres y placas).
--
-- Un renglon por expediente vivo o dado de baja. Las columnas hasta `motivo_baja`
-- son las de la primera version y conservan su nombre; lo que sigue es para ligar
-- por PERSONA y no solo por TAG (6-oct): el nombre partido, el apellido de familia,
-- el vehiculo y todos los TAGs que el expediente tuvo alguna vez.
--
-- `total_filas` repite en cada renglon cuantos expedientes hay: si el CSV trae
-- menos renglones que ese numero, la descarga se corto.
-- No escribe nada. Requiere los bloques 79 (origen) y 85 (devoluciones).
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
       -- Neto de devoluciones (bloque 85): un cobro devuelto no cuenta.
       exists (select 1 from pagos p
                where p.registro_id = r.id and p.devuelto_en is null) as tiene_pago,
       r.fecha_instalacion,
       (r.created_at at time zone 'America/Mexico_City')::date as alta,
       r.fecha_baja,
       r.motivo_baja,
       -- Desde aqui, nuevo del 6-oct.
       r.usuario_nombres,
       r.usuario_apellido_paterno,
       r.usuario_apellido_materno,
       r.apellidos_familia,
       r.gestionante_nombre_completo                      as gestionante,
       r.gestionante_relacion,
       r.parentesco_otro,
       r.seccion_maestro,
       r.tipo_validado,
       r.marca,
       r.modelo,
       r.color,
       r.tag_apartado,
       r.evidencia_aceptacion,
       -- Todo TAG que el expediente tuvo, salvo el vigente: reposiciones, cambios y
       -- el TAG externo que se anoto como anterior (SATAG-001428).
       (select string_agg(distinct t, '+' order by t)
          from movimientos m
          cross join lateral (values (m.no_dispositivo_anterior), (m.no_dispositivo_nuevo)) v(t)
         where m.registro_id = r.id
           and nullif(btrim(t), '') is not null
           and t is distinct from r.no_dispositivo)        as tags_anteriores,
       (select count(*) from movimientos m where m.registro_id = r.id) as movimientos,
       r.observaciones,
       count(*) over ()                                   as total_filas
  from registros r
 order by r.folio;
