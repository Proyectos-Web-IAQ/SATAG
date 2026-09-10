-- =====================================================================
-- CroNoma · SATAG · Limpieza de cierre del 10-sep-2026 · PASO 1: LECTURA
-- Solo lee. Correr en el SQL Editor de CroNoma (esquema pmo) ANTES de la
-- carga. Muestra con datos lo que la carga va a tocar y detecta lo que la
-- haria abortar.
--
-- Contexto: auditoria del 10-sep contra el codigo. Tres tareas estan
-- terminadas y figuran a medias; siete solicitudes de cambio estan
-- implementadas desde julio; una tarea figura en cero y su reunion ya
-- ocurrio. Nada de esto es trabajo pendiente: es registro sin cerrar.
-- =====================================================================

-- 1. Usuario que firma las decisiones -----------------------------------
select id, email, nombre_completo, rol_sistema
  from pmo.usuario
 where email ilike 'gerardo.sanchez@asuncionqro.edu.mx';
-- Debe salir EXACTAMENTE una fila.

-- 2. Las tareas que la carga va a mover ----------------------------------
select a.nombre, a.pct_avance as pct_actual, a.estado, a.fecha_fin_plan,
       case a.nombre
         when 'SC-018 · Lote F — Regresiones detectadas por la revisión adversaria del lote C'
              then '100 · los siete grupos G1-G7 tienen commit del 17-ago y reejecucion con sondas de red'
         when 'Cobro: «Cobrado por» sale de la sesión, no se teclea'
              then '100 · bloque 50 aplicado el 25-ago; VistaAdmin ya no tiene campo editable (c88cbca)'
         when 'CC-08 · Firma como módulo reutilizable (desacoplado, portable)'
              then '100 · lib/firma no importa nada de SATAG; el cliente y el bucket llegan por parametro (6ecf4cd)'
         when 'Reunión de requerimientos con Administración + paquete de demo'
              then '100 · la reunion ocurrio el 9-sep; de ahi salio SC-028'
         when 'SC-023 · Límite de intentos en el buzón público (bloque 51)'
              then '85 · bloque 51 aplicado el 25-ago; falta reejecutar P-11 y conciliar tres documentos'
         when 'Infraestructura (subdominio + Cloudflare + FTP + repo + Action)'
              then '85 · deploy.yml y runbook listos; el acceso a cPanel se consiguio hoy'
         when 'Deploy a producción (subdominio)'
              then '60 · depende de Infraestructura; en ejecucion hoy'
         when 'Definición legal y privacidad (aviso SATAG + firma + menores + ARCO)'
              then '92 · entran los documentos legales del 9 y 10-sep (commit ac4bd66)'
         else 'sin cambio'
       end as accion_propuesta
  from pmo.actividad a
 where a.proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
   and a.pct_avance < 100
 order by a.pct_avance desc, a.nombre;

-- 3. Las solicitudes de cambio abiertas y su veredicto -------------------
select folio, estado, titulo,
       case folio
         when 'SC-007' then 'IMPLEMENTADO 28-jul · pagina del aviso y enlaces (340dc8c)'
         when 'SC-008' then 'IMPLEMENTADO 29-jul · bloques 47 y 48, EvidenciaFirma.tsx (ded0799)'
         when 'SC-009' then 'IMPLEMENTADO 28-jul · bloque 43, probado con los cuatro roles (28ed156)'
         when 'SC-010' then 'IMPLEMENTADO 28-jul · Pruebas/00, 01 y 02 poblados'
         when 'SC-013' then 'IMPLEMENTADO 28-jul · concilio cinco documentos de gestion (00a916f)'
         when 'SC-014' then 'IMPLEMENTADO 28-jul · los dos archivos ya no existen (00a916f)'
         when 'CC-15'  then 'IMPLEMENTADO 07-jul · existian en el commit inicial (6dbc4de)'
         when 'SC-011' then 'SIGUE ABIERTO · bloqueado por Direccion y Legal, no por Sistemas'
         when 'SC-012' then 'SIGUE ABIERTO · se ejecuta hoy via L1-06'
         when 'SC-018' then 'SIGUE ABIERTO · reducido a D-12 y D-13, repartidos en L1-02 y L1-04'
         else 'sin cambio'
       end as accion_propuesta
  from pmo.solicitud_cambio
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
   and estado in ('PENDIENTE','EN_REVISION')
 order by folio;

-- 4. Revisiones pendientes: deben ser CERO tras la limpieza del 9-sep ----
select count(*) as revisiones_pendientes
  from pmo.revision_tarea
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
   and estado = 'PENDIENTE';

-- 5. Riesgos vivos: cuales se mitigaron con lo hecho ---------------------
select id, nivel, estado, left(descripcion, 120) as descripcion
  from pmo.riesgo
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
   and estado in ('ABIERTO','MATERIALIZADO')
 order by nivel, descripcion;

-- 6. Hitos ----------------------------------------------------------------
select nombre, fecha_objetivo, fecha_real, cumplido, ponderacion
  from pmo.hito
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
 order by fecha_objetivo nulls last;

-- 7. Avance actual, para comparar despues --------------------------------
select count(*) as actividades,
       count(*) filter (where pct_avance >= 100) as listas,
       round(avg(pct_avance), 1) as avance_simple
  from pmo.actividad
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG');

-- 8. Que la carga no se haya corrido ya -----------------------------------
select to_regclass('pmo_backup.cierre_20260910_actividad') as respaldo_actividad,
       to_regclass('pmo_backup.cierre_20260910_cambio')    as respaldo_cambio;
-- Ambas deben salir en null. Si no, la carga ya corrio: usa el rollback.
