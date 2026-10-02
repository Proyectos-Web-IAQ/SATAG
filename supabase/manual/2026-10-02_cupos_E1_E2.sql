-- =====================================================================
-- CUPOS DE E1 Y E2 — 02/10/2026
--
-- Captura los cajones que contaron: E2 = 120, E1 = 80. Llena la columna
-- `estacionamientos.cupo_lugares` que agrego el bloque 79 y que hasta hoy
-- estaba vacia.
--
-- PARA QUE. Sin este dato la pestana Estacionamiento dice cuantos autos hay
-- dentro pero no si sobran lugares. Con el, la grafica dibuja la linea de
-- cajones y el resumen da el porcentaje de ocupacion en el peor momento.
-- El cliente lo lee desde el commit que acompana este archivo
-- (getEstacionamientos ahora pide cupo_lugares).
--
-- No es dato personal: `estacionamientos` ya tiene lectura publica y el
-- bloque 79 lo dejo dicho.
--
-- Se pega COMPLETO. Si un dia se recuentan, se corre otra vez con los
-- numeros nuevos: el update es idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. GUARDIA
-- ---------------------------------------------------------------------
do $guardia$
begin
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'estacionamientos'
                      and column_name = 'cupo_lugares') then
        raise exception 'Falta estacionamientos.cupo_lugares: primero el bloque 79. No se aplico nada.';
    end if;
    if (select count(*) from estacionamientos where clave in ('E1', 'E2')) <> 2 then
        raise exception 'No estan E1 y E2 en el catalogo de estacionamientos. No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. EL CAMBIO
-- ---------------------------------------------------------------------
update estacionamientos e
   set cupo_lugares = v.cupo
  from (values ('E1', 80), ('E2', 120)) as v(clave, cupo)
 where e.clave = v.clave;


-- ---------------------------------------------------------------------
-- 2. VERIFICACION (solo lectura). Dos filas con ok = true.
-- ---------------------------------------------------------------------
select clave, cupo_lugares,
       cupo_lugares = case clave when 'E1' then 80 when 'E2' then 120 end as ok
  from estacionamientos
 where clave in ('E1', 'E2')
 order by clave;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado): vuelve a «sin contar».
--   update estacionamientos set cupo_lugares = null where clave in ('E1', 'E2');
-- ---------------------------------------------------------------------
