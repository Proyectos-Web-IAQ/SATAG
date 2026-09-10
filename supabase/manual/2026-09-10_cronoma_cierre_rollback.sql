-- =====================================================================
-- CroNoma · SATAG · Limpieza de cierre del 10-sep-2026 · ROLLBACK
-- Deshace TODO lo que hizo la carga, a partir del respaldo persistente
-- que ella dejo en pmo_backup.cierre_20260910_*.
-- Correr completo. Es una sola transaccion.
-- =====================================================================
begin;

-- 1. Actividades: avance, estado y fecha de fin real
update pmo.actividad a
   set pct_avance     = b.pct_avance,
       estado         = b.estado,
       fecha_fin_real = b.fecha_fin_real
  from pmo_backup.cierre_20260910_actividad b
 where b.id = a.id;

-- 2. Solicitudes de cambio: estado, decisor, fecha y descripcion
--    (la descripcion se restaura entera, con lo que borra las notas que
--     la carga anexo a SC-011, SC-012 y SC-018)
update pmo.solicitud_cambio c
   set estado                  = b.estado,
       decidido_por_usuario_id = b.decidido_por_usuario_id,
       fecha_decision          = b.fecha_decision,
       descripcion             = b.descripcion
  from pmo_backup.cierre_20260910_cambio b
 where b.id = c.id;

-- 3. Riesgos: estado y plan de respuesta
update pmo.riesgo r
   set estado         = b.estado,
       plan_respuesta = b.plan_respuesta
  from pmo_backup.cierre_20260910_riesgo b
 where b.id = r.id;

-- 4. Constancia
select 'actividades restauradas' as que, count(*)::text as valor
  from pmo_backup.cierre_20260910_actividad
union all
select 'cambios restaurados', count(*)::text
  from pmo_backup.cierre_20260910_cambio
union all
select 'riesgos restaurados', count(*)::text
  from pmo_backup.cierre_20260910_riesgo
union all
select 'cambios abiertos ahora', count(*)::text
  from pmo.solicitud_cambio
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
   and estado in ('PENDIENTE','EN_REVISION');

commit;

-- Los respaldos pmo_backup.cierre_20260910_* se conservan a proposito:
-- son la constancia de como estaba el tablero antes de la limpieza.
-- Para volver a correr la carga hay que borrarlos primero, porque ella
-- aborta si ya existen.
