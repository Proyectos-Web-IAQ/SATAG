-- =====================================================================
-- CroNoma · SATAG · Limpieza del tablero del 9-sep-2026 · ROLLBACK
-- Deshace TODO lo que hizo la carga, a partir del respaldo persistente
-- que la carga dejó en el esquema pmo_backup (limpieza_20260909_*).
-- Correr completo en el SQL Editor. Es una sola transacción.
-- =====================================================================
begin;

-- 1. Revisiones: volver al estado, revisor, comentario y fecha de antes
update pmo.revision_tarea r
   set estado = b.estado,
       revisor_id = b.revisor_id,
       comentario_revision = b.comentario_revision,
       fecha_decision = b.fecha_decision
  from pmo_backup.limpieza_20260909_revision b
 where b.id = r.id;
-- El trigger de aprobación NO revierte pct_avance al pasar de APROBADA a
-- PENDIENTE, pero las aprobadas eran no-op (mismo porcentaje), así que el
-- avance de las actividades no cambió. Se restaura igual por seguridad:
update pmo.actividad a
   set pct_avance = b.pct_avance, estado = b.estado
  from pmo_backup.limpieza_20260909_actividad b
 where b.id = a.id;

-- 2. Cambios: estado y decisión de antes
update pmo.solicitud_cambio c
   set estado = b.estado,
       decidido_por_usuario_id = b.decidido_por_usuario_id,
       fecha_decision = b.fecha_decision
  from pmo_backup.limpieza_20260909_cambio b
 where b.id = c.id;

-- 3. Dudas: reabrir tal como estaban
update pmo.pregunta_proyecto p
   set estado = b.estado, respuesta = b.respuesta, respondido_por = b.respondido_por
  from pmo_backup.limpieza_20260909_pregunta b
 where b.id = p.id;

-- 4. Hito nuevo
delete from pmo.hito
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
   and nombre = 'Salida a producción con pruebas reales';

-- 5. Tareas L1 (y su liga al cambio, si la carga la creó)
delete from pmo.actividad
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
   and nombre like 'SC-028 · L1-%';

-- 6. Proyectos nuevos (todo lo suyo cae en cascada: WBS, actividades, riesgos,
--    hitos, interesados, acta)
delete from pmo.proyecto where codigo in ('FIRMAS','NUBE','MINUTAS');

-- 7. Constancia
select 'revisiones restauradas' as que, count(*) from pmo_backup.limpieza_20260909_revision
union all select 'cambios restaurados', count(*) from pmo_backup.limpieza_20260909_cambio
union all select 'dudas restauradas',   count(*) from pmo_backup.limpieza_20260909_pregunta
union all select 'proyectos nuevos que quedan', count(*) from pmo.proyecto where codigo in ('FIRMAS','NUBE','MINUTAS')
union all select 'tareas L1 que quedan', count(*) from pmo.actividad where nombre like 'SC-028 · L1-%';

commit;
-- Los respaldos pmo_backup.limpieza_20260909_* se conservan a propósito.
