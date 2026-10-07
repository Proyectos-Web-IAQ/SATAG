// UNA forma de escribir las fechas en todo el panel (DISEÑO.md §8.3).
//
// POR QUE EXISTE. El 7-oct habia siete formateadores: «22/09/2026», «6 oct 2026»,
// «22 sept 2026», «mar 22 sep», «22 de septiembre», «22/09» y el ISO crudo. Ademas
// cada uno trataba distinto la zona horaria.
//
// TRES DATOS QUE NO SE TRATAN IGUAL:
//   - un DIA suelto («2026-09-22»): una fecha de calendario, sin hora ni zona;
//   - un INSTANTE de la base («2026-09-22T13:55:00+00:00»): se pasa a hora de Queretaro;
//   - la HORA DE PARED de ZK («2026-09-22 07:55:00»): ya es local y NO se convierte.
//
// Los nombres de mes y dia son propios: el idioma del navegador escribe «sept» en unos
// equipos y «sep» en otros, y eso no puede depender de quien mira.

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const ZONA = "America/Mexico_City";

interface Partes { a: number; m: number; d: number; h: number | null; min: number | null }

/** «2026-09-22», «2026-09-22 07:55:00» o «2026-09-22T07:55» tal cual vienen (sin zona). */
function partesLocales(v: string): Partes | null {
  const x = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(v.trim());
  if (!x) return null;
  return { a: +x[1], m: +x[2], d: +x[3], h: x[4] ? +x[4] : null, min: x[5] ? +x[5] : null };
}

/** Un instante con zona (o «Z») a sus partes en hora de Queretaro. */
function partesQueretaro(iso: string): Partes | null {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(t)
    .reduce<Record<string, string>>((o, x) => ((o[x.type] = x.value), o), {});
  return { a: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute };
}

const dosDigitos = (n: number) => String(n).padStart(2, "0");
const diaSemanaDe = (p: Partes) => DIAS[new Date(Date.UTC(p.a, p.m - 1, p.d)).getUTCDay()];
const textoFecha = (p: Partes) => `${p.d} ${MESES[p.m - 1]} ${p.a}`;
const textoHora = (p: Partes) => (p.h === null ? "" : `${dosDigitos(p.h)}:${dosDigitos(p.min ?? 0)}`);

/**
 * ¿Trae zona? («Z», «+00:00», «-06») DESPUES de una hora. Sin zona es fecha de
 * calendario u hora de pared. (Sin exigir la hora, «2026-09-22» parecia «-22» de zona.)
 */
const tieneZona = (v: string) => /[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$/.test(v.trim());

/** Partes de cualquiera de los tres datos, sin equivocarse de zona. */
function partes(v: string | null | undefined): Partes | null {
  if (!v) return null;
  return tieneZona(v) ? partesQueretaro(v) : partesLocales(v);
}

/** «22 sep 2026». Para tablas, fichas y datos. */
export function fecha(v: string | null | undefined): string {
  const p = partes(v);
  return p ? textoFecha(p) : v ? v : "—";
}

/** «22 sep 2026, 07:55». Un instante de la base o una hora de pared de ZK. */
export function fechaHora(v: string | null | undefined): string {
  const p = partes(v);
  if (!p) return v ? v : "—";
  const h = textoHora(p);
  return h ? `${textoFecha(p)}, ${h}` : textoFecha(p);
}

/** «mar 22 sep». Para las filas de una semana y los ejes de dias. */
export function diaSemana(v: string | null | undefined): string {
  const p = partes(v);
  return p ? `${diaSemanaDe(p)} ${p.d} ${MESES[p.m - 1]}` : v ? v : "—";
}

/** «22 sep». Para ejes cortos y listas, donde el año sobra. */
export function diaMes(v: string | null | undefined): string {
  const p = partes(v);
  return p ? `${p.d} ${MESES[p.m - 1]}` : v ? v : "—";
}

/** «07:55». La hora de un instante (en Queretaro) o de una hora de pared. */
export function hora(v: string | null | undefined): string {
  const p = partes(v);
  return p && p.h !== null ? textoHora(p) : "—";
}

/** El dia de calendario («2026-09-22») de un instante, en Queretaro. Para comparar o agrupar. */
export function diaDe(v: string | null | undefined): string | null {
  const p = partes(v);
  return p ? `${p.a}-${dosDigitos(p.m)}-${dosDigitos(p.d)}` : null;
}
