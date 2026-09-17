-- =====================================================================
-- CroNoma · SATAG · SC-030 Reprogramacion tras la salida a produccion
-- PASO 3: CARGA. Correr COMPLETO en el SQL Editor de CroNoma, DESPUES
-- de la lectura y DESPUES de registrar SC-030 con el conector.
--
-- Una sola transaccion: si algo no cuadra, aborta y no toca nada.
-- Respaldo persistente en pmo_backup.sc030_actividad (rollback aparte).
--
-- QUE TOCA: solo `fecha_fin_plan`, y solo de las SEIS actividades que
-- SC-030 reprograma. No toca avances, ni estados, ni ninguna otra
-- actividad, ni las solicitudes, ni los riesgos. Los avances de cierre
-- se reportan con el conector, que deja el corte del dia.
--
-- POR QUE POR SQL Y NO POR EL CONECTOR: el conector reporta avance y
-- escribe bitacora, pero no mueve fechas de plan.
-- =====================================================================
begin;

create schema if not exists pmo_backup;

-- ---------------------------------------------------------------------
-- EL OBJETIVO, en un solo bloque editable. Revise estas seis lineas
-- antes de correr: son el unico dato que la carga escribe.
-- ---------------------------------------------------------------------
create temp table _sc030_objetivo (
  actividad_id   uuid primary key,
  etiqueta       text not null,
  fecha_fin_plan date not null
);

insert into _sc030_objetivo (actividad_id, etiqueta, fecha_fin_plan) values
  ('4f944b4f-0d59-41f6-9208-7c0e17408222', 'L2-02 rol contador',                 '2026-10-02'),
  ('040002f4-4292-4687-9a2e-3125273f0dfe', 'L2-06 catalogo historico',           '2026-10-09'),
  ('59bf87ee-54b1-4451-8d39-ed6bf5224d1b', 'L2-07 manuales largos',              '2026-10-09'),
  ('dfead8ae-3ea7-4032-9283-d5d19ecbd784', 'L2-08 comprobante desde el panel',   '2026-10-09'),
  ('baf41102-5774-49cf-9bab-1ab5e4cbca97', 'Dashboard del contador',             '2026-10-09'),
  ('3d38c0d5-5fe4-4020-81c0-778bd88d96e1', 'Citas en Google Calendar',           '2026-10-09');

do $carga$
declare
  v_email text := 'gerardo.sanchez@asuncionqro.edu.mx';
  v_proj  uuid;
  v_user  uuid;
  v_n     int;
begin
  -- Guardia 1: el proyecto.
  select id into v_proj from pmo.proyecto where codigo = 'SATAG';
  if v_proj is null then
    raise exception 'No existe el proyecto SATAG. No se aplico nada.';
  end if;

  -- Guardia 2: el usuario que firma.
  select id into v_user from pmo.usuario where email ilike v_email;
  if v_user is null then
    raise exception 'No hay usuario con el correo %. No se aplico nada.', v_email;
  end if;

  -- Guardia 3: la carga no se ha corrido ya.
  if to_regclass('pmo_backup.sc030_actividad') is not null then
    raise exception 'El respaldo sc030_actividad ya existe: la carga ya corrio. Use el rollback antes de repetir. No se aplico nada.';
  end if;

  -- Guardia 4: las seis actividades existen y son de este proyecto.
  select count(*) into v_n
    from pmo.actividad a
    join _sc030_objetivo o on o.actividad_id = a.id
   where a.proyecto_id = v_proj;
  if v_n <> 6 then
    raise exception 'Se esperaban 6 actividades del proyecto SATAG y se encontraron %. Un id cambio o pertenece a otro proyecto. No se aplico nada.', v_n;
  end if;

  -- Guardia 5: ninguna revision pendiente.
  --   El trigger fn_aplicar_revision copia pct_reportado DENTRO de la
  --   actividad al aprobar, asi que una revision pendiente con el numero
  --   viejo revierte el avance dias despues. Esta carga no toca avances,
  --   pero si hay revisiones pendientes el tablero esta inconsistente y
  --   no es momento de moverle las fechas.
  select count(*) into v_n
    from pmo.revision_tarea
   where proyecto_id = v_proj and estado = 'PENDIENTE';
  if v_n <> 0 then
    raise exception 'Hay % revision(es) PENDIENTE(S) en SATAG. Resuelvalas antes de reprogramar. No se aplico nada.', v_n;
  end if;

  -- Guardia 6: ninguna de las seis esta ya terminada. Reprogramar algo
  --   terminado moveria la fecha de un entregable ya cumplido, que es
  --   justo lo que SC-020 evito en agosto.
  select count(*) into v_n
    from pmo.actividad a
    join _sc030_objetivo o on o.actividad_id = a.id
   where a.pct_avance >= 100;
  if v_n <> 0 then
    raise exception '% de las seis actividades ya esta(n) al 100 por ciento: no se reprograma lo terminado. Revise el alcance de SC-030. No se aplico nada.', v_n;
  end if;

  -- Respaldo persistente ------------------------------------------------
  create table pmo_backup.sc030_actividad as
    select a.id, a.nombre, a.fecha_fin_plan
      from pmo.actividad a
      join _sc030_objetivo o on o.actividad_id = a.id;

  -- La mutacion ---------------------------------------------------------
  update pmo.actividad a
     set fecha_fin_plan = o.fecha_fin_plan
    from _sc030_objetivo o
   where o.actividad_id = a.id
     and a.proyecto_id  = v_proj;
  get diagnostics v_n = row_count;
  if v_n <> 6 then
    raise exception 'Se esperaba mover 6 fechas y se movieron %. No se aplico nada.', v_n;
  end if;

  raise notice 'SC-030: seis fechas reprogramadas. Respaldo en pmo_backup.sc030_actividad.';
end
$carga$;


-- ---------------------------------------------------------------------
-- CONSTANCIA: antes -> despues. Revisela ANTES de confirmar.
-- ---------------------------------------------------------------------
select o.etiqueta,
       b.fecha_fin_plan as antes,
       a.fecha_fin_plan as despues,
       a.pct_avance,
       a.estado
  from pmo.actividad a
  join _sc030_objetivo o            on o.actividad_id = a.id
  join pmo_backup.sc030_actividad b on b.id = a.id
 order by a.fecha_fin_plan, o.etiqueta;

-- Avance del proyecto, para comparar con el punto 9 de la lectura.
select count(*) as actividades,
       count(*) filter (where pct_avance >= 100) as listas,
       round(avg(pct_avance), 1) as avance_simple,
       count(*) filter (where pct_avance < 100 and fecha_fin_plan < current_date) as vencidas
  from pmo.actividad
 where proyecto_id = (select id from pmo.proyecto where codigo = 'SATAG');
-- `vencidas` es el numero que esta reprogramacion existe para bajar. Si
-- despues de la carga sigue contando las seis, algo no se aplico.

commit;

-- ---------------------------------------------------------------------
-- COMO VERLO EN SECO, SI QUIERE DECIDIR CON LA CONSTANCIA DELANTE
--
-- El SQL Editor corre el archivo entero, asi que el `commit` de arriba se
-- ejecuta junto con todo lo demas: la constancia se imprime, pero ya
-- confirmada. Si prefiere mirarla antes de comprometerse, comente esa
-- linea del `commit` y corra el archivo: vera exactamente la misma tabla
-- de antes->despues y al terminar la sesion PostgreSQL revierte todo,
-- incluidos el respaldo y la tabla temporal. Despues descomente el
-- `commit` y vuelva a correrlo completo; la segunda pasada arranca de
-- cero y las guardias no se quejan, porque el respaldo tampoco quedo.
--
-- Si ya confirmo y la constancia no cuadra, use
-- 2026-09-18_cronoma_sc030_rollback.sql, que restaura las seis fechas
-- desde el respaldo persistente.
-- ---------------------------------------------------------------------
