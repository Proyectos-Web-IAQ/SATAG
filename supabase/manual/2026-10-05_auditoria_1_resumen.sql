-- =====================================================================
-- AUDITORIA 1 DE 2 — ¿SATAG afirma algo que la bitacora no respalda? (resumen)
-- SOLO LECTURA: no cambia nada. Se puede correr cuantas veces se quiera.
--
-- La regla (Gerardo, 5-oct): en SATAG solo debe haber expedientes vivos de
-- quien de verdad abrio la pluma desde el primer dia valido de la bitacora,
-- el 22-sep-2026. Un expediente vivo cuyo TAG no abrio ni una vez en esa
-- ventana es un expediente «de mas», salvo dos casos que se cuentan aparte:
--   - el que todavia no tiene TAG (alta en proceso: no puede haber abierto);
--   - el alta de SATAG instalada hace poco (puede no haber venido aun).
-- Un TAG cuenta como del expediente si es el vigente o uno anterior
-- (movimientos): la pasada vieja de un TAG cambiado tambien es suya.
--
-- Antes de creerle a la fila 4, mirar la 1: si la bitacora tiene huecos, un
-- expediente puede no tener pasos porque falta el archivo, no porque no vino.
-- El detalle, persona por persona, esta en la auditoria 2.
-- =====================================================================
with ventana as (
    select timestamp '2026-09-22 00:00' as desde,
           (select max(ocurrio_en) from zk_eventos) as hasta
), dias as (
    select distinct ocurrio_en::date as d from zk_eventos, ventana where ocurrio_en >= ventana.desde
), huecos as (
    select d, d - lag(d) over (order by d) as salto from dias
), abrieron as (
    select distinct e.tarjeta from zk_eventos e, ventana v
     where e.concedido and not e.repeticion and e.ocurrio_en >= v.desde
), rechazadas as (
    select distinct e.tarjeta from zk_eventos e, ventana v
     where not e.concedido and e.ocurrio_en >= v.desde
), tags as (
    select r.id, r.no_dispositivo as tag from registros r where r.no_dispositivo is not null
    union
    select m.registro_id, m.no_dispositivo_anterior from movimientos m where m.no_dispositivo_anterior is not null
), vivos as (
    select r.id, r.origen_expediente, r.no_dispositivo,
           coalesce(r.fecha_instalacion, r.created_at::date) as desde_cuando,
           exists (select 1 from tags t join abrieron a on a.tarjeta = t.tag where t.id = r.id) as abrio,
           exists (select 1 from tags t join rechazadas x on x.tarjeta = t.tag where t.id = r.id) as rechazado
      from registros r
     where r.estado <> 'baja'
), sin_expediente as (
    select a.tarjeta from abrieron a
     where not exists (select 1 from tags t join registros r on r.id = t.id where t.tag = a.tarjeta)
)
select 1 as orden,
       'bitacora: dias con datos desde el 22-sep y el hueco mas largo' as que,
       (select count(*) from dias)::text || ' dias, hasta ' || coalesce(to_char((select hasta from ventana), 'DD/MM HH24:MI'), 'sin datos') ||
       '; hueco mas largo ' || coalesce((select max(salto) from huecos)::text, '0') || ' dias' as valor,
       coalesce((select max(salto) from huecos), 0) <= 3 as ok
union all
select 2, 'expedientes vivos con TAG',
       (select count(*) from vivos where no_dispositivo is not null)::text, true
union all
select 3, '... de ellos, abrieron la pluma en la ventana',
       (select count(*) from vivos where no_dispositivo is not null and abrio)::text, true
union all
select 4, 'DE MAS: migrados (hoja o ZK) vivos que no abrieron ni una vez',
       (select count(*) from vivos where no_dispositivo is not null and not abrio and origen_expediente <> 'satag')::text,
       (select count(*) = 0 from vivos where no_dispositivo is not null and not abrio and origen_expediente <> 'satag')
union all
select 5, '... de esos, la pluma solo los rechazo (tienen TAG pero no derecho)',
       (select count(*) from vivos where no_dispositivo is not null and not abrio and rechazado and origen_expediente <> 'satag')::text,
       true
union all
select 6, 'altas de SATAG instaladas antes de la ultima semana que no abrieron',
       (select count(*) from vivos v, ventana w
         where no_dispositivo is not null and not abrio and origen_expediente = 'satag'
           and desde_cuando < w.hasta::date - 7)::text,
       (select count(*) = 0 from vivos v, ventana w
         where no_dispositivo is not null and not abrio and origen_expediente = 'satag'
           and desde_cuando < w.hasta::date - 7)
union all
select 7, 'altas de SATAG de la ultima semana que aun no abren (normal)',
       (select count(*) from vivos v, ventana w
         where no_dispositivo is not null and not abrio and origen_expediente = 'satag'
           and desde_cuando >= w.hasta::date - 7)::text, true
union all
select 8, 'expedientes vivos sin TAG (alta en proceso, no pueden haber abierto)',
       (select count(*) from vivos where no_dispositivo is null)::text, true
union all
select 9, 'AL REVES: credenciales que abrieron y no tienen expediente',
       (select count(*) from sin_expediente)::text,
       (select count(*) = 0 from sin_expediente)
union all
select 10, 'expedientes de baja cuyo TAG abrio en la ventana',
       (select count(*) from registros r join abrieron a on a.tarjeta = r.no_dispositivo
         where r.estado = 'baja'
           and not exists (select 1 from registros v where v.no_dispositivo = r.no_dispositivo and v.estado <> 'baja'))::text,
       (select count(*) = 0 from registros r join abrieron a on a.tarjeta = r.no_dispositivo
         where r.estado = 'baja'
           and not exists (select 1 from registros v where v.no_dispositivo = r.no_dispositivo and v.estado <> 'baja'))
order by orden;
