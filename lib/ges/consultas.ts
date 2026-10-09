// Las consultas reducidas de GES, tal como se pegan en «Consulta Libre».
//
// POR QUE VIVEN AQUI Y NO EN Campo/. GES solo se exporta a mano, asi que quien carga
// tiene que tener la consulta a la mano en la misma pantalla donde sube el archivo,
// lista para copiar (Gerardo, 8-oct). Y la pantalla de carga rechaza cualquier archivo
// que traiga columnas de mas (lib/ges/leer.ts): la consulta y la lista blanca son el
// mismo contrato, por eso estan juntas en lib/ges/.
//
// LO QUE PIDEN, Y LO QUE NO. Solo lo que SATAG necesita para saber quien es la persona
// y si sigue en el colegio (bloque 92). Nada de telefonos, correos, domicilios, CURP ni
// fechas de nacimiento. De los alumnos, nombre y matricula SOLO de Preparatoria: en GES
// sus grupos son numericos (101, 301, 501...) y los de los demas niveles empiezan con
// letra, asi que `codigo_grupo < 'A'` los separa en cualquier motor de base de datos.

/**
 * El ciclo escolar vigente, como lo escribe GES en `alumnos_grupos.inicial`: 2026 es el
 * ciclo 2026-2027. Cambia en agosto, que es cuando arranca el ciclo.
 */
export function cicloEscolar(hoy: Date = new Date()): number {
  return hoy.getMonth() >= 7 ? hoy.getFullYear() : hoy.getFullYear() - 1;
}

/** «2026» -> «2026-2027». */
export const nombreCiclo = (ciclo: number): string => `${ciclo}-${ciclo + 1}`;

/**
 * Los grupos que no son grupos escolares regulares (criterio del jefe de TI, machote
 * del 6-oct-2026).
 */
const GRUPOS_EXCLUIDOS = ["VTM", "STM", "PTM", "PBA", "CMTM", "CMBA", "SBA", "PRU"];

/** Familias activas del ciclo: una fila por alumno, con papa y mama. */
export function consultaFamilias(ciclo: number): string {
  const si = "case when alumnos_grupos.codigo_grupo < 'A' then";
  return `-- SATAG · GES reducido: familias activas del ciclo ${nombreCiclo(ciclo)}
-- Solo de los alumnos de Preparatoria salen su nombre y matricula: son los
-- unicos que pueden tener TAG. De los demas, solo el grupo.
select
    alumnos_grupos.inicial,
    alumnos.id_familia,
    alumnos_grupos.codigo_grupo,
    familias_mst.padre,
    familias_mst.madre,
    ${si} alumnos.matricula else null end as matricula,
    ${si} alumnos.paterno   else null end as paterno,
    ${si} alumnos.materno   else null end as materno,
    ${si} alumnos.nombre    else null end as nombre
from alumnos
   inner join alumnos_grupos on (alumnos.numeroalumno = alumnos_grupos.numeroalumno)
   inner join familias_mst  on (alumnos.id_familia = familias_mst.id_familia)
where alumnos_grupos.inicial = ${ciclo}
  and alumnos_grupos.codigo_grupo not in (${GRUPOS_EXCLUIDOS.map((g) => `'${g}'`).join(", ")})
  and alumnos.status = 'A'
order by alumnos.id_familia`;
}

/**
 * Los empleados que NO dan clase: administracion, mantenimiento, intendencia (tabla
 * `empleados`, la de nomina; 9-oct-2026). Esa tabla trae 65 columnas —sueldo, NSS, RFC,
 * CURP, banco, CLABE, huellas, fotografia, pension alimenticia— y aqui se piden seis.
 * Quien esta en `profesores` se excluye: ya sale en la consulta del personal docente,
 * y si saliera en las dos, SATAG lo veria como dos personas con el mismo nombre.
 */
export const CONSULTA_EMPLEADOS = `-- SATAG · GES reducido: empleados que no dan clase
-- (administracion, mantenimiento, intendencia). Los docentes salen de la
-- consulta de personal docente. statusactual: A = activo, B = baja.
select
    empleados.numempleado,
    empleados.nombreempleado,
    empleados.departamento,
    empleados.cargo,
    empleados.statusactual,
    empleados.fecha_baja
from empleados
where not exists (
    select 1 from profesores
    where profesores.numempleado = empleados.numempleado
)
order by empleados.numempleado`;

/** El personal que da clase (tabla `profesores`), activo y de baja. */
export const CONSULTA_PERSONAL = `-- SATAG · GES reducido: personal docente
-- statusactual: A = activo, B = baja.
select
    profesores.claveprofesor,
    profesores.nombreprofesor,
    profesores.departamento,
    profesores.cargo,
    profesores.statusactual,
    profesores.fecha_baja
from profesores
order by profesores.claveprofesor`;
