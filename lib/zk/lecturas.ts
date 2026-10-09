// «Lecturas por hora» (9-oct-2026): que TAG leyo cada pluma en un rango de hora.
//
// Sirve para encontrar casos: alguien reporta «a las 14:17 entró un coche que no
// conozco» y la bitacora guardada dice que TAG fue. Aqui no hay React ni Supabase,
// solo el calculo del rango, para probarlo con datos del tamano de una prueba.
//
// LA HORA ES LA DE PARED. `zk_eventos.ocurrio_en` es la hora del controlador sin
// zona (bloque 78), que es la hora local: se compara texto con texto y no se pasa
// por `Date` con zona, que la correria seis horas.

const dos = (n: number) => String(n).padStart(2, "0");

/** «2026-10-08» + minutos desde la medianoche → «2026-10-08 14:17:00», cruzando de dia si hace falta. */
function aTexto(dia: string, minutos: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  // UTC solo como calculadora de calendario: no se lee ninguna zona.
  const t = new Date(Date.UTC(a, m - 1, d, 0, 0, 0) + minutos * 60_000);
  return `${t.getUTCFullYear()}-${dos(t.getUTCMonth() + 1)}-${dos(t.getUTCDate())} ${dos(t.getUTCHours())}:${dos(t.getUTCMinutes())}:00`;
}

/**
 * El rango a buscar: el dia completo si no hay hora; si la hay, la hora menos y
 * mas el margen. `hasta` es exclusivo. `null` si el dia o la hora no se entienden.
 */
export function rangoDeBusqueda(dia: string, hora: string, margenMin: number): { desde: string; hasta: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const h = hora.trim();
  if (!h) return { desde: aTexto(dia, 0), hasta: aTexto(dia, 24 * 60) };
  const r = /^(\d{1,2}):(\d{2})$/.exec(h);
  if (!r || Number(r[1]) > 23 || Number(r[2]) > 59) return null;
  const centro = Number(r[1]) * 60 + Number(r[2]);
  const margen = Math.max(0, Math.round(margenMin));
  // El minuto pedido completo: 14:17 ± 0 son de 14:17:00 a 14:18:00.
  return { desde: aTexto(dia, centro - margen), hasta: aTexto(dia, centro + margen + 1) };
}

/** El ultimo minuto que SI entra en un rango con `hasta` exclusivo: «14:33:00» → «14:32:00». Para decirlo en pantalla. */
export function ultimoMinuto(hasta: string): string {
  const p = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(hasta);
  return p ? aTexto(`${p[1]}-${p[2]}-${p[3]}`, Number(p[4]) * 60 + Number(p[5]) - 1) : hasta;
}

/** Los segundos de distancia entre una lectura y la hora buscada; sin hora, 0. */
export function distanciaSeg(ocurrioEn: string, dia: string, hora: string): number {
  const r = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!r) return 0;
  const [a, m, d] = dia.split("-").map(Number);
  const objetivo = Date.UTC(a, m - 1, d, Number(r[1]), Number(r[2]), 0);
  const p = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(ocurrioEn);
  if (!p) return Number.POSITIVE_INFINITY;
  const t = Date.UTC(Number(p[1]), Number(p[2]) - 1, Number(p[3]), Number(p[4]), Number(p[5]), Number(p[6]));
  return Math.abs(t - objetivo) / 1000;
}
