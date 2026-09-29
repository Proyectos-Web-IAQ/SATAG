// Reglas de la caja que no dependen de React ni de la base: el semaforo y las
// fechas. Viven aparte de la pantalla para poder probarlas solas; son reglas de
// negocio que el contador usa para decidir cuando cortar, no detalles visuales.

// El desglose trae 'dia' como 'YYYY-MM-DD' ya en hora local: se reordena a
// DD/MM/YYYY sin construir un Date (evita el corrimiento de zona horaria).
export function diaCorto(dia: string): string {
  const [y, m, d] = dia.split("-");
  return d && m && y ? `${d}/${m}/${y}` : dia;
}

// UMBRALES del semaforo de la caja (fuente de verdad para soporte / manual).
//
// Hasta el 15-sep el criterio eran los DIAS DE COBRO DISTINTOS sin cortar: con
// tres o mas, rojo. Con el corte MENSUAL que decidio la junta del 9-sep eso dejo
// de avisar de nada, porque una caja normal junta cobros de muchos dias y la
// tarjeta amanecia en rojo todos los dias del mes.
//
// Desde el 17-sep el criterio son los DIAS NATURALES desde el primer cobro que
// sigue en la caja: amarillo a los 30, rojo a los 35. Es un SUPUESTO de trabajo
// mientras el CP no fije la fecha del corte; si el corte se fija en otro dia del
// mes, aqui se mueven los dos numeros.
//
// La mezcla de varios dias sigue vigilada aparte, en `multidia`: eso es lo que
// obliga a explicar el corte y es una regla del servidor, no del color.
export const SEM_AMARILLO = 30;
export const SEM_ROJO = 35;

export type Semaforo = "ok" | "warn" | "alert";

export const semDias = (n: number | null): Semaforo =>
  n === null ? "ok" : n >= SEM_ROJO ? "alert" : n >= SEM_AMARILLO ? "warn" : "ok";

// Dias naturales desde el primer cobro sin cortar, contados en FECHA DE
// QUERETARO. Es la parte delicada: en UTC, un cobro despues de las 18:00 hora
// local ya cae en el dia siguiente, y el semaforo se adelantaria un dia entero.
// 'en-CA' da AAAA-MM-DD, que es justo lo que hace falta para comparar.
const FMT_DIA_QRO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City", dateStyle: "short",
});

// `ahora` es parametro con valor por omision, no una llamada a new Date() por
// dentro: asi la funcion se puede probar con una fecha fija. Una funcion que
// consulta el reloj del sistema por su cuenta no se puede verificar.
export function diasNaturalesDesde(iso: string | null, ahora: Date = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const desde = Date.parse(`${FMT_DIA_QRO.format(d)}T00:00:00Z`);
  const hoy = Date.parse(`${FMT_DIA_QRO.format(ahora)}T00:00:00Z`);
  if (Number.isNaN(desde) || Number.isNaN(hoy)) return null;
  return Math.max(0, Math.round((hoy - desde) / 86400000));
}
