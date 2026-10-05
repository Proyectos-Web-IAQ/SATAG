-- =====================================================================
-- AUDITORIA 2 DE 2 — Los expedientes vivos que la bitacora no respalda, uno por uno.
-- SOLO LECTURA: no cambia nada.
--
-- Una fila por expediente vivo con TAG que no abrio la pluma desde el
-- 22-sep-2026 (filas 4 y 6 de la auditoria 1). Para cada uno: quien es,
-- de donde vino, su departamento hoy en ZK, cuando abrio por ultima vez
-- (aunque sea antes del 22-sep) y si la pluma lo rechazo en la ventana.
-- Con esto se decide caso por caso; nada se da de baja solo.
-- =====================================================================
with abrieron as (
    select distinct tarjeta from zk_eventos
     where concedido and not repeticion and ocurrio_en >= timestamp '2026-09-22'
), tags as (
    select r.id, r.no_dispositivo as tag from registros r where r.no_dispositivo is not null
    union
    select m.registro_id, m.no_dispositivo_anterior from movimientos m where m.no_dispositivo_anterior is not null
)
select r.folio,
       r.usuario_nombre_completo as nombre,
       r.tipo_usuario as tipo,
       r.origen_expediente as origen,
       r.no_dispositivo as tag,
       coalesce(r.fecha_instalacion, r.created_at::date) as instalado_o_creado,
       coalesce(z.departamento, '(no esta en el padron de ZK)') as depto_zk,
       (select max(e.ocurrio_en) from zk_eventos e join tags t on t.tag = e.tarjeta
         where t.id = r.id and e.concedido) as ultima_apertura,
       (select count(*) from zk_eventos e join tags t on t.tag = e.tarjeta
         where t.id = r.id and not e.concedido and e.ocurrio_en >= timestamp '2026-09-22') as rechazos_en_ventana,
       (select string_agg(estacionamiento_clave, '+' order by estacionamiento_clave)
          from registro_estacionamientos x where x.registro_id = r.id) as plumas_satag
  from registros r
  left join zk_padron z on z.tarjeta = r.no_dispositivo and z.vigente
 where r.estado <> 'baja'
   and r.no_dispositivo is not null
   and not exists (select 1 from tags t join abrieron a on a.tarjeta = t.tag where t.id = r.id)
 order by r.origen_expediente, rechazos_en_ventana desc, r.folio;
