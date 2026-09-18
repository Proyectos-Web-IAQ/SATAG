-- =====================================================================
-- CroNoma · SATAG · SC-030 Reprogramacion · ROLLBACK
-- Deshace lo que hizo la carga, a partir del respaldo persistente que
-- ella dejo en pmo_backup.sc030_actividad.
-- Correr completo. Es una sola transaccion.
--
-- Lo que devuelve: las nueve fechas `fecha_fin_plan` a como estaban. La
-- carga no toco nada mas, asi que no hay nada mas que restaurar.
--
-- OJO: esto devuelve las nueve actividades a estar VENCIDAS, que es el
-- estado del que SC-030 las saco. Solo tiene sentido si la solicitud se
-- rechaza o si las fechas del bloque `objetivo` salieron mal.
-- =====================================================================
begin;

do $guardia$
declare
  v_n int;
begin
  if to_regclass('pmo_backup.sc030_actividad') is null then
    raise exception 'No existe pmo_backup.sc030_actividad: la carga no corrio, o su respaldo se borro. Nada que deshacer.';
  end if;

  select count(*) into v_n from pmo_backup.sc030_actividad;
  if v_n <> 9 then
    raise exception 'El respaldo tiene % filas y deberia tener 9. No se restauro nada; revise el respaldo a mano.', v_n;
  end if;
end
$guardia$;

-- 1. Las fechas, de vuelta.
update pmo.actividad a
   set fecha_fin_plan = b.fecha_fin_plan
  from pmo_backup.sc030_actividad b
 where b.id = a.id;

-- 2. Constancia de lo restaurado.
select b.nombre,
       b.fecha_fin_plan as restaurada_a,
       a.fecha_fin_plan as en_la_base_ahora,
       (a.fecha_fin_plan = b.fecha_fin_plan) as ok
  from pmo_backup.sc030_actividad b
  join pmo.actividad a on a.id = b.id
 order by b.nombre;
-- Las nueve filas deben salir con ok = true.

commit;

-- ---------------------------------------------------------------------
-- El respaldo NO se borra aqui, a proposito: es la constancia de que la
-- carga corrio y de cuales eran las fechas originales. Si algun dia hay
-- que volver a correr la carga, primero:
--
--   drop table pmo_backup.sc030_actividad;
--
-- Sin eso, la guardia 3 de la carga aborta, que es lo que se quiere:
-- impide sobrescribir un respaldo bueno con el estado ya modificado.
-- ---------------------------------------------------------------------
