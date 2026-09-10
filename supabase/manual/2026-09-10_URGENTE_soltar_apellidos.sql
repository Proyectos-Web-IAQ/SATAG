-- =====================================================================
-- URGENTE — suelta la restriccion que esta congelando el sistema.
--
-- Corra ESTO SOLO, ahora. Es una linea y no destruye nada.
--
-- POR QUE: la parte B del bloque 55 agrego un CHECK sobre registros. Se
-- creyo que `not valid` lo dejaba sin efecto sobre las filas que ya
-- existian. Es falso: `not valid` solo se salta la revision retroactiva
-- UNA vez; el CHECK se evalua en CADA insert y en CADA update posterior,
-- sobre la fila completa.
--
-- Como apellidos_familia solo la escribe crear_registro (el alta publica)
-- y ninguna pantalla del panel la captura ni la corrige, todo expediente
-- de tipo 'padres' con la columna vacia quedo muerto: no se puede cobrar,
-- ni instalar, ni dar de baja, ni actualizar. Hay 11 bloques que hacen
-- `update registros`.
--
-- El control NO se pierde: vuelve a entrar en el bloque 58, exigido dentro
-- de crear_registro, que es donde Administracion lo pidio y donde si se
-- puede dar un mensaje en espanol en vez de un error de Postgres en ingles.
-- =====================================================================

alter table registros
    drop constraint if exists reg_apellidos_familia_requeridos;

-- Comprobacion: debe devolver CERO filas.
select conname
  from pg_constraint
 where conrelid = 'registros'::regclass
   and conname = 'reg_apellidos_familia_requeridos';
