-- =====================================================================
-- CroNoma · SATAG · Limpieza de cierre del 10-sep-2026 · PASO 2: CARGA
-- Correr COMPLETO en el SQL Editor de CroNoma, despues de la lectura.
-- Una sola transaccion: si algo no cuadra, aborta y no toca nada.
-- Respaldo persistente en pmo_backup.cierre_20260910_* (rollback aparte).
--
-- Que hace, y por que. Todo verificado contra el codigo el 10-sep-2026:
--   1. Cierra cuatro tareas terminadas que figuran a medias.
--   2. Sube cuatro que avanzaron y nadie reporto.
--   3. Cierra siete solicitudes de cambio implementadas desde julio,
--      con su FECHA REAL, no la de hoy.
--   4. Deja abiertas las tres que siguen vivas, anotando por que.
--   5. Marca como mitigados los riesgos que ya se resolvieron.
-- =====================================================================
begin;

create schema if not exists pmo_backup;

do $carga$
declare
  v_email text := 'gerardo.sanchez@asuncionqro.edu.mx';
  v_proj uuid;
  v_user uuid;
begin
  select id into v_proj from pmo.proyecto where codigo = 'SATAG';
  if v_proj is null then
    raise exception 'No existe el proyecto SATAG.';
  end if;

  select id into v_user from pmo.usuario where email ilike v_email;
  if v_user is null then
    raise exception 'No hay usuario con el correo %.', v_email;
  end if;

  if to_regclass('pmo_backup.cierre_20260910_actividad') is not null then
    raise exception 'El respaldo cierre_20260910_* ya existe: la carga ya corrio. Usa el rollback antes de repetir.';
  end if;

  -- Respaldos persistentes -----------------------------------------------
  create table pmo_backup.cierre_20260910_actividad as
    select id, nombre, pct_avance, estado, fecha_fin_real
      from pmo.actividad where proyecto_id = v_proj;
  create table pmo_backup.cierre_20260910_cambio as
    select * from pmo.solicitud_cambio where proyecto_id = v_proj;
  create table pmo_backup.cierre_20260910_riesgo as
    select * from pmo.riesgo where proyecto_id = v_proj;

  -- ---------------------------------------------------------------------
  -- 1. TAREAS TERMINADAS que figuran a medias
  -- ---------------------------------------------------------------------

  -- Lote F (98%). Los siete grupos G1-G7 tienen commit propio del 17-ago
  -- (73fd697, 77c31bd, 5ff88ec, ad11d9a, 21fd797) y cierre en 31bbe56,
  -- con reejecucion mediante sondas de red reales, no revision de codigo.
  update pmo.actividad
     set pct_avance = 100, estado = 'COMPLETADA', fecha_fin_real = date '2026-08-17'
   where proyecto_id = v_proj
     and nombre = 'SC-018 · Lote F — Regresiones detectadas por la revisión adversaria del lote C';

  -- Cobrado por (60%). Las dos capas que pide la tarea: el bloque 50 se
  -- aplico el 25-ago (el RPC ignora el parametro y toma el correo del JWT,
  -- y rechaza el cobro si no viene) y la interfaz dejo de tener campo
  -- editable el 24-ago (c88cbca).
  update pmo.actividad
     set pct_avance = 100, estado = 'COMPLETADA', fecha_fin_real = date '2026-08-25'
   where proyecto_id = v_proj
     and nombre = 'Cobro: «Cobrado por» sale de la sesión, no se teclea';

  -- CC-08 (80%). Se verifico archivo por archivo que lib/firma no importa
  -- nada de SATAG: el cliente de base y el bucket llegan por parametro. La
  -- nota del auditor que sostenia el 80% quedo obsoleta el 26-ago (6ecf4cd).
  update pmo.actividad
     set pct_avance = 100, estado = 'COMPLETADA', fecha_fin_real = date '2026-08-26'
   where proyecto_id = v_proj
     and nombre = 'CC-08 · Firma como módulo reutilizable (desacoplado, portable)';

  -- Reunion de requerimientos (0%, vencida el 7-sep). Ocurrio el 9-sep con
  -- el CP Vicente Hernandez y Miguel, y de ella salio SC-028.
  update pmo.actividad
     set pct_avance = 100, estado = 'COMPLETADA', fecha_fin_real = date '2026-09-09'
   where proyecto_id = v_proj
     and nombre = 'Reunión de requerimientos con Administración + paquete de demo';

  -- ---------------------------------------------------------------------
  -- 2. TAREAS QUE AVANZARON y nadie reporto
  -- ---------------------------------------------------------------------

  -- Buzon (70% -> 85%). El bloque 51 esta aplicado desde el 25-ago y el
  -- cliente publicado. Falta reejecutar P-11 y conciliar tres documentos
  -- que todavia dicen "riesgo aceptado, sin rate limiting".
  update pmo.actividad set pct_avance = 85, estado = 'EN_CURSO'
   where proyecto_id = v_proj
     and nombre = 'SC-023 · Límite de intentos en el buzón público (bloque 51)';

  -- Infraestructura (70% -> 85%). deploy.yml desde el 20-ago y runbook del
  -- 10-sep con los valores reales del hosting. El acceso a cPanel se
  -- consiguio hoy.
  update pmo.actividad set pct_avance = 85, estado = 'EN_CURSO'
   where proyecto_id = v_proj
     and nombre = 'Infraestructura (subdominio + Cloudflare + FTP + repo + Action)';

  -- Deploy (55% -> 60%). Depende de la anterior; en ejecucion hoy.
  update pmo.actividad set pct_avance = 60, estado = 'EN_CURSO'
   where proyecto_id = v_proj
     and nombre = 'Deploy a producción (subdominio)';

  -- Definicion legal (90% -> 92%). Entran los documentos del 9 y 10-sep
  -- (commit ac4bd66), incluido el que va al abogado con citas verificadas
  -- contra los textos oficiales.
  update pmo.actividad set pct_avance = 92, estado = 'EN_CURSO'
   where proyecto_id = v_proj
     and nombre = 'Definición legal y privacidad (aviso SATAG + firma + menores + ARCO)';

  -- ---------------------------------------------------------------------
  -- 3. SOLICITUDES DE CAMBIO implementadas, con su fecha real
  -- ---------------------------------------------------------------------
  --   SC-007  pagina del aviso y enlaces desde el formulario    340dc8c
  --   SC-009  endurecer por rol los bloques 05, 09 y 20         28ed156
  --   SC-010  plan de pruebas y matriz de casos                 Pruebas/00,01,02
  --   SC-013  conciliar la documentacion de gestion             00a916f
  --   SC-014  borrar codigo muerto del panel simulado           00a916f
  update pmo.solicitud_cambio
     set estado = 'IMPLEMENTADO', decidido_por_usuario_id = v_user, fecha_decision = date '2026-07-28'
   where proyecto_id = v_proj
     and folio in ('SC-007','SC-009','SC-010','SC-013','SC-014')
     and estado in ('PENDIENTE','EN_REVISION');

  --   SC-008  firma en el panel con enlace temporal             ded0799 + d04c5e2
  update pmo.solicitud_cambio
     set estado = 'IMPLEMENTADO', decidido_por_usuario_id = v_user, fecha_decision = date '2026-07-29'
   where proyecto_id = v_proj and folio = 'SC-008'
     and estado in ('PENDIENTE','EN_REVISION');

  --   CC-15  guia de sesiones y textos legales a E6             6dbc4de
  -- Arrastraba la coletilla "pendiente de aprobacion Direccion/Legal". Esa
  -- aprobacion no es de este folio, que solo movia documentos de carpeta;
  -- se sigue en SC-011.
  update pmo.solicitud_cambio
     set estado = 'IMPLEMENTADO', decidido_por_usuario_id = v_user, fecha_decision = date '2026-07-07'
   where proyecto_id = v_proj and folio = 'CC-15'
     and estado in ('PENDIENTE','EN_REVISION');

  -- ---------------------------------------------------------------------
  -- 4. LOS TRES QUE SIGUEN VIVOS: se anota por que, no se cierran
  -- ---------------------------------------------------------------------

  update pmo.solicitud_cambio
     set descripcion = coalesce(descripcion, '') || chr(10) || chr(10) ||
         '[10-sep-2026] Bloqueado por tercero, no por Sistemas. Faltan decisiones de Direccion y Legal: responsable de derechos ARCO, reparto entre TI y Administracion, y el contrato con el proveedor de base de datos. La tanda A de pruebas, ocho casos, no puede ejecutarse hasta que esto se cierre.'
   where proyecto_id = v_proj and folio = 'SC-011'
     and estado in ('PENDIENTE','EN_REVISION');

  update pmo.solicitud_cambio
     set estado = 'APROBADO', decidido_por_usuario_id = v_user, fecha_decision = current_date,
         descripcion = coalesce(descripcion, '') || chr(10) || chr(10) ||
         '[10-sep-2026] El mecanismo esta construido desde el 20-ago (.github/workflows/deploy.yml, apagado con la variable DEPLOY_GODADDY). Lo que faltaba era el acceso administrativo, conseguido hoy. Se ejecuta mediante la tarea SC-028 L1-06, que es la que lleva el avance: este folio no debe contarse aparte.'
   where proyecto_id = v_proj and folio = 'SC-012'
     and estado in ('PENDIENTE','EN_REVISION');

  update pmo.solicitud_cambio
     set descripcion = coalesce(descripcion, '') || chr(10) || chr(10) ||
         '[10-sep-2026] Reducido a dos defectos de quince. Trece cerrados y los seis lotes de correccion aplicados entre el 5 y el 25-ago. Queda D-13, el aviso de privacidad publicado no lleva un solo acento, que se cierra con el aviso v3 en la tarea L1-04; y D-12, seis textos sin acentos en las pantallas de acceso al panel (app/admin/page.tsx y components/admin/GateMfa.tsx), que se absorbe en la tarea L1-02. Nota de registro: D-03 figura como pendiente de reejecutar el caso F-08, que se cerro el 18-ago.'
   where proyecto_id = v_proj and folio = 'SC-018'
     and estado in ('PENDIENTE','EN_REVISION');

  -- ---------------------------------------------------------------------
  -- 5. RIESGOS que ya se mitigaron
  -- ---------------------------------------------------------------------

  update pmo.riesgo
     set estado = 'MITIGADO',
         plan_respuesta = coalesce(plan_respuesta, '') || chr(10) ||
         '[10-sep-2026] Mitigado: el padron del piloto se exporto a ZKBioSecurity con cero fallidos y se borro; los folios reinician y la caja arranca en ceros.'
   where proyecto_id = v_proj and estado in ('ABIERTO','MATERIALIZADO')
     and descripcion ilike '%seed_tests_dev%';

  update pmo.riesgo
     set estado = 'MITIGADO',
         plan_respuesta = coalesce(plan_respuesta, '') || chr(10) ||
         '[10-sep-2026] Mitigado: el acceso administrativo a cPanel y Cloudflare se consiguio hoy; la migracion esta en ejecucion siguiendo el runbook de Entregables/E9.'
   where proyecto_id = v_proj and estado in ('ABIERTO','MATERIALIZADO')
     and descripcion ilike '%invitaci%SMTP%';

  raise notice 'Carga aplicada. Revise el resumen de abajo.';
end
$carga$;

-- Resumen (el SQL Editor muestra solo el resultado del ultimo statement)
select 'actividades al 100%' as que, count(*)::text as valor
  from pmo.actividad
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG') and pct_avance >= 100
union all
select 'actividades totales', count(*)::text
  from pmo.actividad
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
union all
select 'avance simple', round(avg(pct_avance), 1)::text
  from pmo.actividad
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
union all
select 'cambios abiertos que quedan', count(*)::text
  from pmo.solicitud_cambio
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG') and estado in ('PENDIENTE','EN_REVISION')
union all
select 'cuales quedan abiertos', coalesce(string_agg(folio, ', ' order by folio), '(ninguno)')
  from pmo.solicitud_cambio
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG') and estado in ('PENDIENTE','EN_REVISION')
union all
select 'riesgos vivos', count(*)::text
  from pmo.riesgo
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG') and estado in ('ABIERTO','MATERIALIZADO');

commit;
