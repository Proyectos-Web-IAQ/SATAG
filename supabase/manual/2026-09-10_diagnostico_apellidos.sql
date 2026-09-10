-- =====================================================================
-- 2026-09-10_diagnostico_apellidos.sql
--
-- SOLO LECTURA. No cambia nada. Corralo completo y mande el resultado.
--
-- PARA QUE: el bloque 55 dejo una restriccion (reg_apellidos_familia_requeridos)
-- que NO se comporta como decia su comentario. Un CHECK marcado `not valid`
-- se salta la revision retroactiva UNA vez, pero se evalua en CADA update
-- posterior de la fila. Como apellidos_familia solo la escribe crear_registro
-- (el alta publica), todo expediente de tipo 'padres' que la tenga vacia
-- queda CONGELADO: no se puede instalar, ni cobrar, ni dar de baja, ni
-- actualizar. Hay 11 bloques que hacen `update registros`.
--
-- Esto averigua si eso ya esta pasando en la base, y cuanto alcanza.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La restriccion, ¿existe? ¿esta validada?
--    Si devuelve 0 filas: la PARTE B no se aplico y no hay nada congelado.
--    Si devuelve 1 fila: la PARTE B si se aplico.
-- ---------------------------------------------------------------------
select conname                                   as restriccion,
       convalidated                              as ya_validada,
       pg_get_constraintdef(oid)                 as definicion
  from pg_constraint
 where conrelid = 'registros'::regclass
   and conname = 'reg_apellidos_familia_requeridos';

-- ---------------------------------------------------------------------
-- 2. ¿Cuantos expedientes quedarian congelados?
--    Son los de tipo 'padres' sin apellidos de familia.
--    Si el paso 1 devolvio 1 fila y este devuelve mas de 0, esos
--    expedientes YA no se pueden tocar por ningun RPC.
-- ---------------------------------------------------------------------
select count(*) filter (where tipo_usuario = 'padres'
                          and coalesce(btrim(apellidos_familia), '') = '')   as padres_sin_apellidos,
       count(*) filter (where tipo_usuario = 'padres')                       as padres_en_total,
       count(*)                                                              as expedientes_en_total
  from registros;

-- ---------------------------------------------------------------------
-- 3. Cuales son, por folio. Esta es la lista que habria que rellenar
--    (o que desaparece sola al limpiar el padron).
-- ---------------------------------------------------------------------
select folio,
       tipo_usuario,
       estado,
       no_dispositivo,
       created_at::date as dado_de_alta
  from registros
 where tipo_usuario = 'padres'
   and coalesce(btrim(apellidos_familia), '') = ''
 order by folio;

-- ---------------------------------------------------------------------
-- 4. ¿Alguien ya acepto el aviso v3?
--    Importa porque al aviso v3 le falta enumerar los apellidos de la
--    familia entre los datos que se recaban, y hay que corregirlo. Si
--    NADIE lo ha aceptado todavia, el texto se puede corregir en su sitio
--    sin tocar evidencia de nadie. Si alguien ya lo acepto, hay que
--    publicar una v4 y dejar la v3 intacta.
-- ---------------------------------------------------------------------
select v.version,
       v.vigente,
       count(a.id) as aceptaciones_selladas
  from aviso_versiones v
  left join aceptaciones a on a.aviso_version_id = v.id
 group by v.version, v.vigente
 order by v.version;
