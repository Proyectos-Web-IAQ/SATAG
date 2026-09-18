-- =====================================================================
-- CroNoma · SATAG · SC-030 Reprogramacion tras la salida a produccion
-- PASO 1: LECTURA. Solo lee. Correr en el SQL Editor de CroNoma
-- (esquema pmo) ANTES de la carga.
--
-- REDACTADO EL 17-SEP-2026 PARA CORRERSE EL VIERNES 18. No escribe nada.
--
-- ---------------------------------------------------------------------
-- QUE HACE EL CONECTOR Y QUE HACE ESTE SCRIPT
--
-- La solicitud SC-030 en si se registra con el conector de CroNoma
-- (`registrar_cambio`), no por SQL: no hay precedente de insertar en
-- pmo.solicitud_cambio a mano y no conviene estrenarlo en el cierre. Lo
-- que el conector NO puede hacer es mover fechas de plan, y eso es lo que
-- hacen estos tres archivos.
--
-- Orden del viernes: (1) este script, (2) registrar SC-030 con el
-- conector, (3) la carga, (4) reportar los avances de cierre.
--
-- ---------------------------------------------------------------------
-- TEXTO DE SC-030, para pegarlo en el conector
--
-- Titulo: Reprogramacion tras la salida a produccion: lo que pasa a
--         mejora continua
--
-- Justificacion: SATAG salio a produccion el 14-sep con el alcance que
-- la escuela usa todos los lunes: alta publica, cobro, instalacion,
-- buzon, inventario, exportacion a ZK y evidencia de firma. Al cierre del
-- 19-sep quedan seis trabajos que NO bloquean esa operacion y que se
-- programaron con una cadencia que ya no existe: del 21 al 22 de
-- septiembre el responsable esta fuera (laboratorio de IA en educacion) y
-- el equipo instala solo. Dejarlos con fecha de cierre los volveria
-- tareas vencidas sin justificacion, que es un dato falso en el tablero.
-- Se reprograman a la ventana del 28-sep al 9-oct.
--
-- Alcance (seis actividades, ninguna en uso diario):
--   - L2-02 rol «contador»: el semaforo de caja SI se hizo el 17-sep; lo
--     que queda es el rol, las siete politicas de lectura, los dos
--     candados del corte y la cuenta del CP con MFA.
--   - L2-06 catalogo de vehiculos con el historico de la hoja de calculo.
--   - L2-07 conciliar los manuales largos con el panel de hoy. Las guias
--     rapidas SI quedaron conciliadas el 17-sep.
--   - L2-08 recuperar el comprobante de cualquier expediente desde el
--     panel.
--   - Dashboard del contador (tiempo de instalacion por persona de TI):
--     depende de que exista el rol contador y de datos que apenas
--     empiezan a acumularse — `instalado_en` existe desde el 15-sep.
--   - Citas de instalacion en Google Calendar: ya vence el 9-oct, se
--     confirma dentro de esta ventana.
--
-- SEGUNDO GRUPO, agregado el 18-sep: dos actividades de CIERRE que se
-- mueven al MIERCOLES 23, no a mejora continua. El 18-sep el equipo no se
-- pudo juntar, asi que ni la capacitacion ni la verificacion final con
-- cuentas reales pudieron hacerse, y las dos exigen al personal presente:
--   - 1.8 Pruebas (93 %): el Flujo 6 (F-40 a F-47) esta escrito y con sus
--     renglones en blanco en la bitacora, pero se ejecuta con las cuentas
--     reales de Administracion y TI; con perfil super no prueba nada.
--   - 1.9 Manual + capacitacion breve (95 %): el material esta hecho (la
--     hoja de una pagina y la chuleta de los videos), falta darla.
-- Van al 23 y no al 28 porque son del cierre, no mejoras: Gerardo vuelve el
-- miercoles del laboratorio de Google y es lo primero que se hace.
--
-- SUPUESTOS, escritos aqui porque no son decisiones de Sistemas:
--   1. El corte de caja sera MENSUAL y lo hara el contador. Hoy lo hace
--      admin y no hay fecha fija del mes.
--   2. `super` tambien corta. No es una concesion: `panel_exigir_rol`
--      deja pasar a super SIEMPRE, sin mirar la lista de roles, asi que
--      «solo el contador cierra el corte» NUNCA sera literal mientras
--      existan cuentas super. Conviene decirlo asi y no prometer
--      exclusividad.
--   3. El semaforo avisa a los 30 dias y alarma a los 35 dias naturales
--      desde el primer cobro sin cortar. Es un supuesto de trabajo
--      mientras el CP no fije el dia del mes; vive escrito en
--      components/admin/VistaFinanzas.tsx.
--   4. DECIDIDO POR GERARDO EL 17-SEP: Administracion SI pierde
--      `cortar_caja`. El corte lo hace unicamente el rol contador. Con
--      el supuesto 2 delante, la frase exacta es «lo cortan el contador
--      y las cuentas super», no «solo el contador»: la guardia deja
--      pasar a super siempre y quitarselo exigiria cambiar
--      `panel_exigir_rol`, que es otro alcance. Consecuencia operativa
--      que hay que decir en voz alta: cuando el semaforo se ponga
--      amarillo, Administracion ya no podra resolverlo sola; tendra que
--      avisar. Por eso el semaforo avisa a los 30 y no a los 35.
--   5. La cuenta del CP necesita MFA ANTES del rol: sin `aal2` no pasa
--      ninguna politica del panel, asi que el rol contador sin MFA lo
--      deja fuera.
--
-- PENDIENTES QUE SE REGISTRAN CON LA SOLICITUD (no son alcance de nadie
-- hoy, pero tienen que constar):
--   - Exigir `seccion_maestro` al maestro en la base. El bloque 70 la
--     recaba y la sella, pero NO la exige; el bloque que la exige lleva
--     candado de sesion y va despues de verificar el formulario.
--   - Un expediente corregido a «maestro» en la caja queda SIN seccion y
--     ninguna pantalla la captura. Ya puede ocurrir en produccion desde
--     el 17-sep. No rompe nada: TI elige el estacionamiento a mano.
--   - «Atendido por» y «Dado de alta por» siguen siendo texto que TI
--     teclea; si lo deja vacio, la bitacora dice literalmente «TI».
--   - `actualizar_registro` escribe `current_date` (UTC) al reponer un
--     TAG: despues de las 18:00 fecha la reposicion al dia siguiente.
--   - A-01 (acceso ARCO) y A-06 (supresion) no tienen camino
--     implementado; ya constan en SC-011.
-- =====================================================================


-- 1. Usuario que firma las decisiones -----------------------------------
select id, email, nombre_completo, rol_sistema
  from pmo.usuario
 where email ilike 'gerardo.sanchez@asuncionqro.edu.mx';
-- Debe salir EXACTAMENTE una fila.


-- 2. Las columnas de pmo.actividad, para confirmar que la carga apunta a
--    la correcta. La carga solo toca `fecha_fin_plan`.
select column_name, data_type
  from information_schema.columns
 where table_schema = 'pmo' and table_name = 'actividad'
 order by ordinal_position;
-- Debe aparecer `fecha_fin_plan`. Si no existe o se llama de otro modo,
-- NO corra la carga: avise y se corrige el nombre.


-- 3. Las OCHO actividades que la carga va a mover, por id -------------
--    (las seis de mejora continua y las dos de cierre del segundo grupo)
--    Se identifican por ID y no por nombre a proposito: los nombres
--    llevan acentos y empatarlos por texto ya costo abortos antes.
select a.id, a.nombre, a.pct_avance, a.estado, a.fecha_fin_plan,
       case a.id::text
         when '4f944b4f-0d59-41f6-9208-7c0e17408222' then '2026-10-02  (L2-02 rol contador)'
         when '040002f4-4292-4687-9a2e-3125273f0dfe' then '2026-10-09  (L2-06 catalogo historico)'
         when '59bf87ee-54b1-4451-8d39-ed6bf5224d1b' then '2026-10-09  (L2-07 manuales largos)'
         when 'dfead8ae-3ea7-4032-9283-d5d19ecbd784' then '2026-10-09  (L2-08 comprobante desde el panel)'
         when 'baf41102-5774-49cf-9bab-1ab5e4cbca97' then '2026-10-09  (dashboard del contador)'
         when '3d38c0d5-5fe4-4020-81c0-778bd88d96e1' then '2026-10-09  (citas en Calendar; ya la tiene)'
         when '1ae7c890-7ee9-4308-951c-09ebc73b1a3b' then '2026-09-23  (1.8 Pruebas: el Flujo 6 con cuentas reales)'
         when '83d20110-e468-4d76-ad1c-3e6288bec094' then '2026-09-23  (1.9 capacitacion con el equipo)'
         else 'sin cambio'
       end as fecha_propuesta
  from pmo.actividad a
 where a.id in (
        '4f944b4f-0d59-41f6-9208-7c0e17408222',
        '040002f4-4292-4687-9a2e-3125273f0dfe',
        '59bf87ee-54b1-4451-8d39-ed6bf5224d1b',
        'dfead8ae-3ea7-4032-9283-d5d19ecbd784',
        'baf41102-5774-49cf-9bab-1ab5e4cbca97',
        '3d38c0d5-5fe4-4020-81c0-778bd88d96e1',
        '1ae7c890-7ee9-4308-951c-09ebc73b1a3b',
        '83d20110-e468-4d76-ad1c-3e6288bec094'
       )
 order by a.fecha_fin_plan, a.nombre;
-- Deben salir OCHO filas. Si sale menos, un id cambio: pare.


-- 4. Las que NO se mueven, para que quede claro que no se tocan ----------
select a.nombre, a.pct_avance, a.estado, a.fecha_fin_plan
  from pmo.actividad a
 where a.proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
   and a.pct_avance < 100
   and a.id not in (
        '4f944b4f-0d59-41f6-9208-7c0e17408222',
        '040002f4-4292-4687-9a2e-3125273f0dfe',
        '59bf87ee-54b1-4451-8d39-ed6bf5224d1b',
        'dfead8ae-3ea7-4032-9283-d5d19ecbd784',
        'baf41102-5774-49cf-9bab-1ab5e4cbca97',
        '3d38c0d5-5fe4-4020-81c0-778bd88d96e1',
        '1ae7c890-7ee9-4308-951c-09ebc73b1a3b',
        '83d20110-e468-4d76-ad1c-3e6288bec094'
       )
 order by a.fecha_fin_plan nulls last, a.nombre;
-- Estas son las que SI se cierran el 19-sep. «Aceptacion + acta de
-- cierre» tiene que estar aqui: NO se reprograma, se cumple.


-- 5. Revisiones pendientes: la carga ABORTA si hay alguna ----------------
--    Una revision PENDIENTE con el numero viejo revierte el avance dias
--    despues, cuando el auditor la aprueba (trigger fn_aplicar_revision).
select count(*) as revisiones_pendientes
  from pmo.revision_tarea
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
   and estado = 'PENDIENTE';
-- Debe ser 0. Si no, resuelvalas antes de la carga.


-- 6. SC-029, que sigue pendiente de aprobacion de Miguel -----------------
select folio, estado, titulo
  from pmo.solicitud_cambio
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
   and estado in ('PENDIENTE','EN_REVISION')
 order by folio;
-- SC-029 deberia seguir PENDIENTE: sus cuatro entregables (L2-09 a L2-12)
-- estan publicados y la aprobacion es de Miguel. Y SC-030 NO debe
-- aparecer todavia: se registra con el conector despues de este script.


-- 7. Que el folio SC-030 este libre ---------------------------------------
select max(folio) as ultimo_folio_sc
  from pmo.solicitud_cambio
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
   and folio like 'SC-%';
-- Debe decir SC-029. Si dice SC-030 o mas, el folio ya se uso: ajuste el
-- numero antes de registrar la solicitud.


-- 8. Riesgos vivos cuyo texto ya quedo superado --------------------------
select id, nivel, estado, left(descripcion, 140) as descripcion
  from pmo.riesgo
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
   and estado in ('ABIERTO','MATERIALIZADO')
 order by nivel, descripcion;
-- DECISION DE GERARDO, no de este script: al menos dos riesgos ALTOS
-- siguen abiertos con texto ya superado — el de `fecha_instalacion` en
-- UTC con el instalador tecleado (lo resolvio el bloque 68 el 15-sep) y
-- el de «sistema en produccion sin pruebas ejecutadas» (redactado el
-- 28-jul). Si no se cierran o se reescriben, el acta de cierre sale con
-- riesgos altos vivos que ya no existen. Se hace con el conector
-- (`registrar_riesgo`), no aqui.


-- 9. Avance actual, para comparar despues --------------------------------
select count(*) as actividades,
       count(*) filter (where pct_avance >= 100) as listas,
       round(avg(pct_avance), 1) as avance_simple
  from pmo.actividad
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG');


-- 10. Que la carga no se haya corrido ya ---------------------------------
select to_regclass('pmo_backup.sc030_actividad') as respaldo_actividad;
-- Debe salir en null. Si no, la carga ya corrio: use el rollback.
