-- =====================================================================
-- CroNoma · SATAG · Limpieza del tablero del 9-sep-2026 · PASO 1: LECTURA
-- Solo lee. Correr en el SQL Editor de CroNoma (esquema pmo) ANTES de la carga.
-- Objetivo: ver con datos lo que la carga va a tocar, y detectar lo que la
-- carga aborta (paquete CC ausente, usuario ambiguo, folios ya movidos).
-- =====================================================================

-- 1. Proyecto y usuario que firmará las decisiones -------------------
select id, codigo, nombre, estado from pmo.proyecto where codigo = 'SATAG';

-- Debe salir EXACTAMENTE una fila. Si salen varias, la carga aborta y hay
-- que fijar el correo a mano en el bloque "objetivo" de la carga.
select id, email, nombre_completo, rol_sistema
  from pmo.usuario
 where email ilike '%@asuncionqro.edu.mx'
 order by email;

-- 2. Paquetes WBS de SATAG (la carga cuelga las tareas nuevas de 'CC') --
select codigo_wbs, nombre, es_hoja, nivel, orden
  from pmo.paquete_trabajo
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
 order by codigo_wbs;

-- 3. Revisiones pendientes: cuáles son no-op y cuáles pisarían el avance --
select r.id, a.nombre as actividad, r.pct_reportado, a.pct_avance as pct_actual,
       case when r.pct_reportado = a.pct_avance then 'APROBAR (no cambia nada)'
            when r.pct_reportado <  a.pct_avance then 'RECHAZAR (superada: pisaría el avance)'
            else 'REVISAR A MANO (reporta MÁS que el avance actual)' end as accion_propuesta,
       r.nota, r.created_at::date as reportada
  from pmo.revision_tarea r
  join pmo.actividad a on a.id = r.actividad_id
 where r.proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
   and r.estado = 'PENDIENTE'
 order by a.nombre, r.created_at;

-- 4. Cambios abiertos y el estado que la carga les pone -----------------
select folio, estado, titulo,
       case folio
         when 'SC-021' then 'APROBADO (aplicado el 17-ago; reprogramación vigente)'
         when 'SC-015' then 'RECHAZADO (superada por SC-021)'
         when 'SC-019' then 'RECHAZADO (superada por SC-021)'
         when 'SC-020' then 'RECHAZADO (superada por SC-021)'
         when 'SC-023' then 'IMPLEMENTADO (bloque 51 aplicado el 25-ago; cliente publicado)'
         when 'CC-14'  then 'APROBADO (NOM-151 confirmada como fase 2 el 9-sep)'
         when 'SC-007' then 'IMPLEMENTADO (opcional: /aviso-de-privacidad existe desde el 28-jul)'
         when 'SC-010' then 'IMPLEMENTADO (opcional: Pruebas/01 matriz de casos existe)'
         else 'sin cambio' end as accion_propuesta
  from pmo.solicitud_cambio
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
   and estado in ('PENDIENTE','EN_REVISION')
 order by folio;

-- 5. Dudas abiertas (las 12 del 9-sep se cierran con las respuestas de Gerardo)
select id, estado, created_at::date as fecha, left(texto, 110) as texto
  from pmo.pregunta_proyecto
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
   and estado = 'ABIERTA'
 order by created_at;

-- 6. Hitos actuales -------------------------------------------------------
select nombre, fecha_objetivo, fecha_real, cumplido, ponderacion
  from pmo.hito
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
 order by fecha_objetivo;

-- 7. ¿Ya existen las tareas L1 o los proyectos nuevos? (la carga es idempotente
--    por nombre/código: si ya están, los salta) -----------------------------
select nombre from pmo.actividad
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG')
   and nombre like 'SC-028 · L1-%'
 order by nombre;

select codigo, nombre, estado from pmo.proyecto where codigo in ('FIRMAS','NUBE','MINUTAS');

-- 8. Organizaciones que edita el usuario (fn_crear_proyecto exige una sola o
--    que se indique) ---------------------------------------------------------
select o.id, o.slug, o.nombre from pmo.organizacion o order by o.slug;
