-- =====================================================================
-- CroNoma · Adelantar L2-05 y L2-06 antes del lunes 14-sep · 10-sep-2026
--
-- Pedido de Gerardo el 10-sep por la tarde: las dos tareas que corrigen
-- el vehiculo desde la cola de instalacion y cargan el historico de
-- vehiculos deben quedar ANTES de la salida a produccion, no despues.
--
-- Estaban planeadas 2026-09-17 -> 2026-09-18, es decir, tres y cuatro dias
-- DESPUES del lunes en que empiezan las pruebas reales. Pasan a
-- 2026-09-11 -> 2026-09-13, que es el viernes y el fin de semana previos.
--
-- Este script SOLO mueve fechas. No toca avance, ni estado, ni el resto
-- del cronograma. Es idempotente: si ya se corrio, el PASO 2 no encuentra
-- nada que cambiar y avisa.
--
-- NO SUSTITUYE a 2026-09-10_cronoma_cierre_carga.sql, que sigue sin
-- correrse. Ese va primero.
--
-- Se corre por PASOS en el editor SQL de CroNoma.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — LECTURA. Como estan hoy. No cambia nada.
-- ---------------------------------------------------------------------
select a.nombre,
       a.fecha_inicio_plan,
       a.fecha_fin_plan,
       a.pct_avance,
       a.estado
  from pmo.actividad a
  join pmo.proyecto  p on p.id = a.proyecto_id
 where p.codigo = 'SATAG'
   and (a.nombre like 'SC-028 · L2-05%' or a.nombre like 'SC-028 · L2-06%')
 order by a.nombre;

-- ---------------------------------------------------------------------
-- PASO 2 — MOVER. Una transaccion. Aborta si no encuentra las dos.
-- ---------------------------------------------------------------------
do $$
declare
    v_proj   uuid;
    v_movidas int;
    v_ya      int;
begin
    select id into v_proj from pmo.proyecto where codigo = 'SATAG';
    if v_proj is null then
        raise exception 'No existe el proyecto SATAG.';
    end if;

    -- Cuantas estan ya en las fechas nuevas (para poder correr esto dos
    -- veces sin que parezca que fallo).
    select count(*) into v_ya
      from pmo.actividad
     where proyecto_id = v_proj
       and (nombre like 'SC-028 · L2-05%' or nombre like 'SC-028 · L2-06%')
       and fecha_inicio_plan = date '2026-09-11'
       and fecha_fin_plan    = date '2026-09-13';

    update pmo.actividad
       set fecha_inicio_plan = date '2026-09-11',
           fecha_fin_plan    = date '2026-09-13'
     where proyecto_id = v_proj
       and (nombre like 'SC-028 · L2-05%' or nombre like 'SC-028 · L2-06%')
       and (fecha_inicio_plan <> date '2026-09-11'
         or fecha_fin_plan    <> date '2026-09-13');
    get diagnostics v_movidas = row_count;

    if v_movidas = 0 and v_ya = 2 then
        raise notice 'Nada que hacer: L2-05 y L2-06 ya estaban en 2026-09-11 -> 2026-09-13.';
    elsif v_movidas + v_ya <> 2 then
        raise exception
            'Se esperaban 2 tareas (L2-05 y L2-06) y se encontraron %. Revise los nombres en el PASO 1 antes de insistir.',
            v_movidas + v_ya;
    else
        raise notice 'Movidas % tarea(s) a 2026-09-11 -> 2026-09-13. Quedan antes del lunes 14.', v_movidas;
    end if;
end;
$$;

-- ---------------------------------------------------------------------
-- PASO 3 — VERIFICACION. Las dos deben terminar el 13, no el 18.
-- ---------------------------------------------------------------------
select a.nombre,
       a.fecha_inicio_plan,
       a.fecha_fin_plan,
       case when a.fecha_fin_plan < date '2026-09-14'
            then 'OK: antes del lunes'
            else 'REVISAR: sigue despues del lunes'
       end as veredicto
  from pmo.actividad a
  join pmo.proyecto  p on p.id = a.proyecto_id
 where p.codigo = 'SATAG'
   and (a.nombre like 'SC-028 · L2-05%' or a.nombre like 'SC-028 · L2-06%')
 order by a.nombre;

-- ---------------------------------------------------------------------
-- ROLLBACK — devuelve las dos a su fecha original.
-- ---------------------------------------------------------------------
-- update pmo.actividad a
--    set fecha_inicio_plan = date '2026-09-17',
--        fecha_fin_plan    = date '2026-09-18'
--   from pmo.proyecto p
--  where p.id = a.proyecto_id
--    and p.codigo = 'SATAG'
--    and (a.nombre like 'SC-028 · L2-05%' or a.nombre like 'SC-028 · L2-06%');
