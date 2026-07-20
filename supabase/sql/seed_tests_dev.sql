-- =====================================================================
-- seed_tests_dev.sql  —  BANCO DE PRUEBAS (SOLO DESARROLLO / QA)
--
-- !!! ADVERTENCIA !!!  Este script BORRA TODOS LOS DATOS (registros, pagos,
-- solicitudes, notas, estacionamientos asignados, movimientos, aceptaciones) y
-- los reemplaza por datos de prueba. NO ejecutar en produccion con datos reales.
-- No es una migracion: no lleva numero de bloque y no debe aplicarse en el flujo
-- normal. Se corre a mano cuando se quiere un padron limpio para probar.
--
-- Cubre ~4 casos de cada situacion que el panel distingue. Los folios y nombres
-- son descriptivos para ubicarlos: p.ej. SATAG-000191..194 = "instalar sin pago".
--
-- Mapa de casos (folio -> que debe verse en el panel):
--   101-104  Pendiente SIN pago      -> Admin "por cobrar"; TI padron (grupo cobrar)
--   111-114  Pendiente CON pago      -> TI "Instalar TAG" (listos)
--   121-124  Activo instalado        -> sin pendientes
--   131-134  Baja                    -> historico
--   141-144  Activo + sol. folio ACTUALIZAR -> TI "Actualizar datos"
--   151-154  Activo + sol. folio BAJA       -> TI "Dar de baja"
--   (sin folio) 6 NOTAS SIN VINCULAR -> TI "Notas sin expediente".
--            Cada una tiene su registro "gemelo" 201-206 (mismo nombre) para
--            probar la vinculacion: TI busca el nombre y lo encuentra.
--              Paula Nieto  -> SATAG-000201 (activo, pide actualizar)
--              Raul Ochoa   -> SATAG-000202 (activo, pide baja)
--              Sara Quiroz  -> SATAG-000203 (activo, pide actualizar)
--              Tomas Rivas  -> SATAG-000204 (activo, pide actualizar)
--              Ursula Sena  -> SATAG-000205 (activo, pide baja)
--              Victor Tello -> SATAG-000206 (activo, pide baja)
--   161-164  Activo + nota vinculada pide BAJA       -> TI "Dar de baja"
--   171-174  Activo + nota vinculada pide ACTUALIZAR -> TI "Actualizar datos"
--   181-184  Pendiente CON pago (flujo de alta) -> TI "Instalar TAG" (listos)
--   191-194  Pendiente SIN pago (flujo de alta) -> TI "Instalar TAG" (Esperando pago, gris)
--   201-206  Registros "gemelos" de las 6 notas sin vincular (para vincular)
--   211-214  Activo con TAG propio + TAG apartado + solicitud de reinstalacion
--            (CC-01) -> TI "Actualizar datos", boton "Usar el TAG apartado"
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Limpieza total. truncate ... cascade vacia registros y todas las tablas
--    que lo referencian (pagos, solicitudes, registro_estacionamientos,
--    movimientos, aceptaciones). Incluye las notas sin vincular.
-- ---------------------------------------------------------------------
truncate table registros cascade;

-- Folios de recibo desde 1 otra vez.
select setval('pagos_folio_recibo_seq', 1, false);

-- ---------------------------------------------------------------------
-- 1) Registros. usuario_nombre_completo es GENERATED (no se inserta).
-- ---------------------------------------------------------------------
insert into registros
    (folio, usuario_nombres, usuario_apellido_paterno, usuario_apellido_materno,
     tipo_usuario, marca, modelo, color, placas, sin_placas,
     no_dispositivo, procedencia_tag, estado,
     motivo_baja, fecha_baja, fecha_adquisicion, fecha_instalacion, instalado_por)
values
-- 101-104  Pendiente SIN pago (por cobrar)
('SATAG-000101','Ana','Perez','Lopez','padres','Toyota','Corolla','Blanco','ABC1201',false,null,'escuela','pendiente',null,null,null,null,null),
('SATAG-000102','Bruno','Gomez',null,'maestro','Nissan','Versa','Gris','ABC1202',false,null,'escuela','pendiente',null,null,null,null,null),
('SATAG-000103','Carla','Ramirez','Diaz','admin','Honda','Civic','Negro',null,true,null,'escuela','pendiente',null,null,null,null,null),
('SATAG-000104','Diego','Santos','Cruz','padres','Mazda','3','Rojo','ABC1204',false,null,'propio','pendiente',null,null,null,null,null),
-- 111-114  Pendiente CON pago, sin TAG (listos para instalar)
('SATAG-000111','Elena','Torres','Vega','padres','Volkswagen','Jetta','Azul','ABC1211',false,null,'escuela','pendiente',null,null,current_date,null,null),
('SATAG-000112','Fabian','Luna',null,'maestro','Kia','Rio','Plata','ABC1212',false,null,'escuela','pendiente',null,null,current_date,null,null),
('SATAG-000113','Gabriela','Mora','Rios','padres','Chevrolet','Aveo','Blanco','ABC1213',false,null,'escuela','pendiente',null,null,current_date,null,null),
('SATAG-000114','Hector','Nava','Soto','admin','Hyundai','Elantra','Gris',null,true,null,'propio','pendiente',null,null,current_date,null,null),
-- 121-124  Activo instalado (sin pendientes)
('SATAG-000121','Irene','Castro','Pena','padres','Toyota','Yaris','Blanco','ABC1221',false,'7000121','escuela','activo',null,null,current_date - 30,current_date - 25,'TI Prueba'),
('SATAG-000122','Jorge','Flores',null,'maestro','Nissan','Sentra','Negro','ABC1222',false,'7000122','escuela','activo',null,null,current_date - 28,current_date - 24,'TI Prueba'),
('SATAG-000123','Karina','Reyes','Gil','admin','Honda','City','Rojo','ABC1223',false,'7000123','propio','activo',null,null,current_date - 26,current_date - 20,'TI Prueba'),
('SATAG-000124','Luis','Ortiz','Mena','alumno','Mazda','2','Azul',null,true,'7000124','escuela','activo',null,null,current_date - 24,current_date - 18,'TI Prueba'),
-- 131-134  Baja
('SATAG-000131','Marta','Silva','Rico','padres','Toyota','Hilux','Blanco','ABC1231',false,null,'escuela','baja','Egreso del alumno',current_date - 10,current_date - 60,current_date - 55,'TI Prueba'),
('SATAG-000132','Noe','Vargas',null,'maestro','Nissan','Frontier','Gris','ABC1232',false,null,'escuela','baja','Cambio de trabajo',current_date - 8,current_date - 58,current_date - 50,'TI Prueba'),
('SATAG-000133','Olga','Campos','Leon','padres','Ford','Focus','Negro','ABC1233',false,null,'escuela','baja','Venta del vehiculo',current_date - 6,current_date - 56,null,null),
('SATAG-000134','Pablo','Ibarra','Rua','admin','Kia','Forte','Plata',null,true,null,'escuela','baja','Duplicado',current_date - 4,current_date - 54,null,null),
-- 141-144  Activo + solicitud de folio: ACTUALIZAR
('SATAG-000141','Rosa','Mendez','Paz','padres','Toyota','Avanza','Blanco','ABC1241',false,'7000141','escuela','activo',null,null,current_date - 40,current_date - 35,'TI Prueba'),
('SATAG-000142','Saul','Bravo',null,'maestro','Nissan','Kicks','Gris','ABC1242',false,'7000142','escuela','activo',null,null,current_date - 38,current_date - 33,'TI Prueba'),
('SATAG-000143','Tania','Guerra','Sol','padres','Honda','HRV','Rojo','ABC1243',false,'7000143','propio','activo',null,null,current_date - 36,current_date - 31,'TI Prueba'),
('SATAG-000144','Ulises','Marin','Rey','admin','Mazda','CX3','Negro',null,true,'7000144','escuela','activo',null,null,current_date - 34,current_date - 29,'TI Prueba'),
-- 151-154  Activo + solicitud de folio: BAJA
('SATAG-000151','Vera','Nunez','Mar','padres','Toyota','RAV4','Blanco','ABC1251',false,'7000151','escuela','activo',null,null,current_date - 45,current_date - 40,'TI Prueba'),
('SATAG-000152','Wilmer','Rojas',null,'maestro','Nissan','Xtrail','Gris','ABC1252',false,'7000152','escuela','activo',null,null,current_date - 43,current_date - 38,'TI Prueba'),
('SATAG-000153','Ximena','Duarte','Coy','padres','Honda','CRV','Azul','ABC1253',false,'7000153','propio','activo',null,null,current_date - 41,current_date - 36,'TI Prueba'),
('SATAG-000154','Yair','Salas','Rey','admin','Kia','Sportage','Plata',null,true,'7000154','escuela','activo',null,null,current_date - 39,current_date - 34,'TI Prueba'),
-- 161-164  Activo + nota vinculada pide BAJA
('SATAG-000161','Zaira','Cano','Vela','padres','Toyota','Prius','Blanco','ABC1261',false,'7000161','escuela','activo',null,null,current_date - 50,current_date - 45,'TI Prueba'),
('SATAG-000162','Aldo','Pineda',null,'maestro','Nissan','March','Gris','ABC1262',false,'7000162','escuela','activo',null,null,current_date - 48,current_date - 43,'TI Prueba'),
('SATAG-000163','Berta','Rangel','Sol','padres','Honda','Fit','Rojo','ABC1263',false,'7000163','propio','activo',null,null,current_date - 46,current_date - 41,'TI Prueba'),
('SATAG-000164','Ciro','Valdez','Mota','admin','Mazda','CX5','Negro',null,true,'7000164','escuela','activo',null,null,current_date - 44,current_date - 39,'TI Prueba'),
-- 171-174  Activo + nota vinculada pide ACTUALIZAR
('SATAG-000171','Delia','Fuentes','Paz','padres','Toyota','Camry','Blanco','ABC1271',false,'7000171','escuela','activo',null,null,current_date - 52,current_date - 47,'TI Prueba'),
('SATAG-000172','Efren','Cordova',null,'maestro','Nissan','Altima','Gris','ABC1272',false,'7000172','escuela','activo',null,null,current_date - 50,current_date - 45,'TI Prueba'),
('SATAG-000173','Frida','Solis','Rua','padres','Honda','Accord','Azul','ABC1273',false,'7000173','propio','activo',null,null,current_date - 48,current_date - 43,'TI Prueba'),
('SATAG-000174','Gael','Mejia','Lop','alumno','Mazda','6','Rojo',null,true,'7000174','escuela','activo',null,null,current_date - 46,current_date - 41,'TI Prueba'),
-- 181-184  Pendiente CON pago + nota vinculada pide INSTALAR (listos)
('SATAG-000181','Hilda','Rincon','Paz','padres','Toyota','Corolla','Gris','ABC1281',false,null,'escuela','pendiente',null,null,current_date,null,null),
('SATAG-000182','Ivan','Guzman',null,'maestro','Nissan','Versa','Blanco','ABC1282',false,null,'escuela','pendiente',null,null,current_date,null,null),
('SATAG-000183','Julia','Peralta','Sol','padres','Honda','Civic','Negro','ABC1283',false,null,'propio','pendiente',null,null,current_date,null,null),
('SATAG-000184','Kevin','Andrade','Rio','admin','Kia','Rio','Rojo',null,true,null,'escuela','pendiente',null,null,current_date,null,null),
-- 191-194  Pendiente SIN pago + nota vinculada pide INSTALAR (Esperando pago)
('SATAG-000191','Lucia','Cabrera','Paz','padres','Toyota','Yaris','Azul','ABC1291',false,null,'escuela','pendiente',null,null,null,null,null),
('SATAG-000192','Mario','Escobar',null,'maestro','Nissan','Sentra','Gris','ABC1292',false,null,'escuela','pendiente',null,null,null,null,null),
('SATAG-000193','Nadia','Trejo','Sol','padres','Honda','City','Blanco','ABC1293',false,null,'propio','pendiente',null,null,null,null,null),
('SATAG-000194','Omar','Barrera','Rey','admin','Mazda','2','Negro',null,true,null,'escuela','pendiente',null,null,null,null,null),
-- 201-206  Registros "gemelos" de las 6 NOTAS SIN VINCULAR: mismo nombre que el
--          solicitante de la nota, para que TI busque por nombre y los encuentre
--          al vincular. Estado segun el tramite que pide la nota.
('SATAG-000201','Paula','Nieto','Cruz','padres','Nissan','Versa','Blanco','ABC1301',false,'7000201','escuela','activo',null,null,current_date - 30,current_date - 25,'TI Prueba'),
('SATAG-000202','Raul','Ochoa',null,'maestro','Nissan','Sentra','Gris','ABC1302',false,'7000202','escuela','activo',null,null,current_date - 28,current_date - 24,'TI Prueba'),
('SATAG-000203','Sara','Quiroz','Lara','padres','Volkswagen','Jetta','Azul','ABC1303',false,'7000203','escuela','activo',null,null,current_date - 30,current_date - 25,'TI Prueba'),
('SATAG-000204','Tomas','Rivas',null,'admin','Mazda','CX-5','Negro','ABC1304',false,'7000204','escuela','activo',null,null,current_date - 28,current_date - 24,'TI Prueba'),
('SATAG-000205','Ursula','Sena','Paz','padres','Toyota','RAV4','Rojo','ABC1305',false,'7000205','propio','activo',null,null,current_date - 26,current_date - 22,'TI Prueba'),
('SATAG-000206','Victor','Tello',null,'maestro','Nissan','March','Gris','ABC1306',false,'7000206','escuela','activo',null,null,current_date - 24,current_date - 20,'TI Prueba'),
-- 211-214  Activo con TAG PROPIO en uso + TAG de la escuela APARTADO (CC-01).
--          El apartado se agrega en el paso 1b (columnas tag_apartado_*).
('SATAG-000211','Rodrigo','Fierro','Paz','padres','Toyota','Corolla','Blanco','ABC1311',false,'7000211','propio','activo',null,null,current_date - 35,current_date - 30,'TI Prueba'),
('SATAG-000212','Sonia','Gallardo',null,'maestro','Nissan','Versa','Gris','ABC1312',false,'7000212','propio','activo',null,null,current_date - 33,current_date - 28,'TI Prueba'),
('SATAG-000213','Tulio','Herrera','Sol','padres','Honda','Civic','Negro','ABC1313',false,'7000213','propio','activo',null,null,current_date - 31,current_date - 26,'TI Prueba'),
('SATAG-000214','Ulises','Ibarra','Rey','admin','Mazda','CX-5','Rojo',null,true,'7000214','propio','activo',null,null,current_date - 29,current_date - 24,'TI Prueba');

-- ---------------------------------------------------------------------
-- 1b) Apartado (CC-01): 211-214 usan su TAG propio y la escuela les reservo un
--     TAG (tag_apartado_no), sin instalar, para probar "usar el TAG apartado".
-- ---------------------------------------------------------------------
update registros set tag_apartado = true, tag_apartado_no = v.apartado
  from (values
    ('SATAG-000211','9426781'),
    ('SATAG-000212','9426782'),
    ('SATAG-000213','9426783'),
    ('SATAG-000214','9426784')
  ) as v(folio, apartado)
 where registros.folio = v.folio;

-- ---------------------------------------------------------------------
-- 2) Pagos ($100): todos los ACTIVOS (se instalaron tras pagar) y los
--    PENDIENTES que ya pagaron (111-114, 181-184 y el gemelo 201).
--    Quedan SIN pago: 101-104, 191-194 y el gemelo 202 (para "esperando pago").
-- ---------------------------------------------------------------------
insert into pagos (registro_id, monto)
select id, 100
  from registros
 where estado = 'activo'
    or folio in ('SATAG-000111','SATAG-000112','SATAG-000113','SATAG-000114',
                 'SATAG-000181','SATAG-000182','SATAG-000183','SATAG-000184',
                 'SATAG-000201');

-- ---------------------------------------------------------------------
-- 3) Estacionamientos de los activos (E1; algunos con E1+E2).
-- ---------------------------------------------------------------------
insert into registro_estacionamientos (registro_id, estacionamiento_clave)
select id, 'E1'
  from registros
 where estado = 'activo';
insert into registro_estacionamientos (registro_id, estacionamiento_clave)
select id, 'E2'
  from registros
 where estado = 'activo' and right(folio, 1) in ('1','3');

-- ---------------------------------------------------------------------
-- 4) Solicitudes de folio (CC-06): actualizacion (141-144) y baja (151-154).
-- ---------------------------------------------------------------------
insert into solicitudes (registro_id, tipo, detalle, origen)
select id, 'actualizacion', 'Cambio de placas y de color del vehiculo', 'publico'
  from registros where folio ~ '^SATAG-00014[1-4]$';
insert into solicitudes (registro_id, tipo, detalle, origen)
select id, 'baja', 'Egreso del alumno al terminar el ciclo', 'publico'
  from registros where folio ~ '^SATAG-00015[1-4]$';
-- Reinstalacion (CC-01): 211-214 piden actualizar porque su TAG propio se dano;
-- asi aparecen en "Actualizar datos" y TI los atiende con el TAG apartado.
insert into solicitudes (registro_id, tipo, detalle, origen)
select id, 'actualizacion', 'Mi TAG se dano, solicito la reinstalacion', 'publico'
  from registros where folio ~ '^SATAG-00021[1-4]$';

-- ---------------------------------------------------------------------
-- 5) Notas SIN vincular (buzon, registro_id null). Roles variados; para
--    'padres' se incluye alumno + grado (obligatorio). tramite variado.
-- ---------------------------------------------------------------------
insert into solicitudes
    (registro_id, tipo, detalle, origen,
     solicitante_nombre, solicitante_rol, tramite_solicitado,
     alumno_nombre, alumno_grado, vehiculo_desc)
values
(null,'nota','Cambie de coche, hay que actualizar mis datos','publico','Paula Nieto','padres','actualizacion','Sofia Nieto','2A','Versa blanco'),
(null,'nota','Mi hijo egresa, solicito la baja','publico','Raul Ochoa','maestro','baja',null,null,'Sentra gris'),
(null,'nota','Cambie de coche, hay que actualizar mis datos','publico','Sara Quiroz','padres','actualizacion','Mateo Quiroz','5B','Jetta azul'),
(null,'nota','Actualizar placas nuevas','publico','Tomas Rivas','admin','actualizacion',null,null,'CX5 negro'),
(null,'nota','Dar de baja, mi hijo egresa este ano','publico','Ursula Sena','padres','baja','Iker Sena','6A','RAV4 roja'),
(null,'nota','Ya no trabajo en la escuela, dar de baja','publico','Victor Tello','maestro','baja',null,null,'March gris');

-- ---------------------------------------------------------------------
-- 6) Notas VINCULADAS a un expediente (registro_id NOT NULL), pendientes.
--    Es lo que TI ya empato: deben caer en la cola de su tramite.
-- ---------------------------------------------------------------------
-- Piden BAJA (161-164)
insert into solicitudes
    (registro_id, tipo, detalle, origen, solicitante_nombre, solicitante_rol,
     tramite_solicitado, alumno_nombre, alumno_grado)
select r.id, 'nota', v.detalle, 'publico', v.nombre, v.rol, 'baja', v.alumno, v.grado
  from (values
    ('SATAG-000161','Zaira Cano','padres','Egreso del alumno','Leo Cano','3A'),
    ('SATAG-000162','Aldo Pineda','maestro','Cambio de trabajo',null,null),
    ('SATAG-000163','Berta Rangel','padres','Venta del vehiculo','Ana Rangel','4B'),
    ('SATAG-000164','Ciro Valdez','admin','Ya no requiere acceso',null,null)
  ) as v(folio, nombre, rol, detalle, alumno, grado)
  join registros r on r.folio = v.folio;
-- Piden ACTUALIZAR (171-174)
insert into solicitudes
    (registro_id, tipo, detalle, origen, solicitante_nombre, solicitante_rol,
     tramite_solicitado, alumno_nombre, alumno_grado)
select r.id, 'nota', v.detalle, 'publico', v.nombre, v.rol, 'actualizacion', v.alumno, v.grado
  from (values
    ('SATAG-000171','Delia Fuentes','padres','Cambio de vehiculo','Sofi Fuentes','1A'),
    ('SATAG-000172','Efren Cordova','maestro','Placas nuevas',null,null),
    ('SATAG-000173','Frida Solis','padres','Reposicion de TAG danado','Beto Solis','2B'),
    ('SATAG-000174','Gael Mejia','alumno','Actualizar mis datos',null,null)
  ) as v(folio, nombre, rol, detalle, alumno, grado)
  join registros r on r.folio = v.folio;
-- (181-184 pendientes CON pago y 191-194 pendientes SIN pago NO llevan nota: son
--  el flujo de instalacion por ALTA. 181-184 salen en "Instalar TAG" (listos) y
--  191-194 en "Esperando pago". Instalar ya no es un tramite de solicitud.)

-- ---------------------------------------------------------------------
-- 7) Deja la secuencia de folios por encima del seed (que llega a 206), para
--    que las altas reales del RPC crear_registro sigan en SATAG-000301 y no
--    choquen con ningun folio sembrado.
-- ---------------------------------------------------------------------
select setval('registros_folio_seq', 300, true);

-- Resumen rapido tras aplicar (opcional):
--   select estado, count(*) from registros group by estado;
--   select tramite_solicitado, count(*) from solicitudes where tipo='nota' group by tramite_solicitado;
