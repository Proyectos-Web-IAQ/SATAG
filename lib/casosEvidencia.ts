// La evidencia de un caso, calculada con los pasos reales de la pluma (bloque 78).
//
// POR QUE EXISTE. Gerardo, 7-oct: la evidencia de un caso no es texto, son graficas
// hechas con los datos —«en que se basa para decir que es asi»—. Al probarlo con los
// casos reales salieron dos decisiones que el texto escondia: un par de «dos TAGs en
// el mismo coche» que nunca se leyo junto, y un «TAG sin uso» que en realidad la
// pluma rechazaba a diario. Aqui no hay React: son las cuentas, y se prueban.
//
// Las reglas son las de lib/estacionamiento.ts: una lectura repetida del lector
// (`repeticion`) no cuenta, y los dias que el archivo corta o que fueron atipicos
// no sirven para concluir.
import type { EventoZk } from "@/lib/zk/eventos";
import { emparejarEstancias, type Estancia } from "@/lib/estacionamiento";

/** Dias en que la pluma estuvo abierta o hubo evento (Gerardo, 6-oct). No cuentan para concluir. */
export const DIAS_ATIPICOS = ["2026-09-25", "2026-09-28"];

export interface Lectura {
  dia: string;
  /** Minutos desde medianoche, con fraccion de segundo. */
  min: number;
  /** Segundos absolutos, para medir cuanto separa a dos lecturas. */
  s: number;
  lote: string;
  sentido: "entrada" | "salida";
  /** true: abrio la pluma; false: la pluma la rechazo. */
  ok: boolean;
}

const diaDe = (e: EventoZk) => e.ocurrioEn.slice(0, 10);
const minDe = (e: EventoZk) =>
  Number(e.ocurrioEn.slice(11, 13)) * 60 + Number(e.ocurrioEn.slice(14, 16)) + Number(e.ocurrioEn.slice(17, 19)) / 60;
const segDe = (e: EventoZk) => Date.parse(e.ocurrioEn.replace(" ", "T") + "Z") / 1000;

/** Las lecturas de un TAG, sin las repeticiones del lector, en orden. */
export function lecturasDe(eventos: EventoZk[], tarjeta: string): Lectura[] {
  return eventos
    .filter((e) => e.tarjeta === tarjeta && !e.repeticion && e.sentido !== null)
    .map((e) => ({ dia: diaDe(e), min: minDe(e), s: segDe(e), lote: e.lote, sentido: e.sentido as "entrada" | "salida", ok: e.concedido }))
    .sort((a, b) => a.s - b.s);
}

/** ¿Este dia sirve para concluir? No si es atipico ni si el archivo lo corta (primero y ultimo). */
export function diaNormal(dia: string, ventana: { desde: string | null; hasta: string | null }): boolean {
  return !DIAS_ATIPICOS.includes(dia) && dia !== ventana.desde?.slice(0, 10) && dia !== ventana.hasta?.slice(0, 10);
}

/**
 * Pares de lecturas de dos TAGs a `seg` segundos o menos, en el mismo lector (mismo
 * lote y sentido). Es la huella de dos TAGs en el mismo parabrisas.
 */
export function leidosJuntos(a: Lectura[], b: Lectura[], seg = 5): { a: Lectura; b: Lectura; dif: number }[] {
  const out: { a: Lectura; b: Lectura; dif: number }[] = [];
  let j = 0;
  for (const x of a) {
    while (j < b.length && b[j].s < x.s - seg) j++;
    for (let k = j; k < b.length && b[k].s <= x.s + seg; k++) {
      if (b[k].lote === x.lote && b[k].sentido === x.sentido) out.push({ a: x, b: b[k], dif: Math.abs(b[k].s - x.s) });
    }
  }
  return out;
}

/**
 * Con que TAGs viaja este: los que se leen a <= 5 s en el mismo lector, en
 * `minDias` dias distintos o mas, del que mas al que menos.
 */
export function acompanantes(eventos: EventoZk[], tarjeta: string, minDias = 2, seg = 5): { tarjeta: string; dias: number }[] {
  const mias = eventos.filter((e) => e.tarjeta === tarjeta && !e.repeticion && e.sentido !== null).map((e) => ({ s: segDe(e), lote: e.lote, sentido: e.sentido, dia: diaDe(e) }));
  if (!mias.length) return [];
  const desde = Math.min(...mias.map((m) => m.s)) - seg, hasta = Math.max(...mias.map((m) => m.s)) + seg;
  const otras = eventos
    .filter((e) => e.tarjeta !== tarjeta && !e.repeticion && e.sentido !== null)
    .map((e) => ({ s: segDe(e), lote: e.lote, sentido: e.sentido, tarjeta: e.tarjeta }))
    .filter((o) => o.s >= desde && o.s <= hasta)
    .sort((a, b) => a.s - b.s);
  const dias = new Map<string, Set<string>>();
  let j = 0;
  for (const m of [...mias].sort((a, b) => a.s - b.s)) {
    while (j < otras.length && otras[j].s < m.s - seg) j++;
    for (let k = j; k < otras.length && otras[k].s <= m.s + seg; k++) {
      const o = otras[k];
      if (o.lote !== m.lote || o.sentido !== m.sentido) continue;
      (dias.get(o.tarjeta) ?? dias.set(o.tarjeta, new Set()).get(o.tarjeta)!).add(m.dia);
    }
  }
  return [...dias]
    .map(([t, d]) => ({ tarjeta: t, dias: d.size }))
    .filter((x) => x.dias >= minDias)
    .sort((a, b) => b.dias - a.dias || a.tarjeta.localeCompare(b.tarjeta));
}

/** Las estancias de un TAG (mismas reglas que la pestana Estacionamiento), solo de dias normales. */
export function estanciasDe(eventos: EventoZk[], tarjeta: string, ventana: { desde: string | null; hasta: string | null }, lote?: string): Estancia[] {
  return emparejarEstancias(eventos.filter((e) => e.tarjeta === tarjeta)).estancias.filter(
    (s) => diaNormal(s.dia, ventana) && (!lote || s.lote === lote),
  );
}

/** Cuantas estancias quedan incompletas (sin entrada o sin salida leida), sobre el total. */
export function incompletas(estancias: Estancia[]): { incompletas: number; total: number } {
  const total = estancias.filter((s) => s.censura !== "corte").length;
  return { incompletas: estancias.filter((s) => s.censura === "derecha" || s.censura === "izquierda").length, total };
}

/** La proporcion de estancias incompletas de TODO un lote, en dias normales. Para comparar un TAG contra su lote. */
export function incompletasDelLote(eventos: EventoZk[], lote: string, ventana: { desde: string | null; hasta: string | null }): { incompletas: number; total: number } {
  const delLote = eventos.filter((e) => e.lote === lote && diaNormal(diaDe(e), ventana));
  return incompletas(emparejarEstancias(delLote).estancias);
}

/** Por dia habil de la ventana: cuantas veces entro y cuantas lo rechazo la pluma. */
export function usoPorDia(lecturas: Lectura[], dias: string[]): { dia: string; entradas: number; rechazos: number }[] {
  return dias.map((d) => {
    const l = lecturas.filter((x) => x.dia === d);
    return { dia: d, entradas: l.filter((x) => x.ok && x.sentido === "entrada").length, rechazos: l.filter((x) => !x.ok).length };
  });
}

/** Los dias habiles (lunes a viernes) de la ventana. */
export function diasHabiles(desde: string, hasta: string): string[] {
  const out: string[] = [];
  const [a, m, d] = desde.slice(0, 10).split("-").map(Number);
  const fin = hasta.slice(0, 10);
  for (let t = new Date(Date.UTC(a, m - 1, d)); ; t.setUTCDate(t.getUTCDate() + 1)) {
    const iso = t.toISOString().slice(0, 10);
    if (iso > fin) break;
    const w = t.getUTCDay();
    if (w > 0 && w < 6) out.push(iso);
  }
  return out;
}

/**
 * A que hora suele llegar: la primera entrada de cada dia normal, en tramos de 15
 * minutos. `tramo` es el de mas dias; `lote` por donde entra mas.
 */
export function llegadaHabitual(lecturas: Lectura[], ventana: { desde: string | null; hasta: string | null }): {
  tramos: { desde: number; dias: number }[];
  tramo: number;
  diasEnTramo: number;
  dias: number;
  lote: string;
  primeras: Lectura[];
} | null {
  const prim = new Map<string, Lectura>();
  for (const l of lecturas) {
    if (!l.ok || l.sentido !== "entrada" || !diaNormal(l.dia, ventana)) continue;
    const ya = prim.get(l.dia);
    if (!ya || l.min < ya.min) prim.set(l.dia, l);
  }
  const primeras = [...prim.values()].sort((a, b) => a.dia.localeCompare(b.dia));
  if (!primeras.length) return null;
  const bins = new Map<number, number>();
  for (const l of primeras) {
    const b = Math.floor(l.min / 15) * 15;
    bins.set(b, (bins.get(b) ?? 0) + 1);
  }
  const tramos = [...bins].map(([desde, dias]) => ({ desde, dias })).sort((a, b) => a.desde - b.desde);
  const top = [...tramos].sort((a, b) => b.dias - a.dias || a.desde - b.desde)[0];
  const porLote = new Map<string, number>();
  for (const l of primeras) porLote.set(l.lote, (porLote.get(l.lote) ?? 0) + 1);
  const lote = [...porLote].sort((a, b) => b[1] - a[1])[0][0];
  return { tramos, tramo: top.desde, diasEnTramo: top.dias, dias: primeras.length, lote, primeras };
}

/** El TAG principal que la evidencia de «dos TAGs en el mismo coche» nombra, si lo nombra. */
export function tagPrincipalDe(evidencia: Record<string, unknown>): string | null {
  const directo = evidencia.tagPrincipal;
  if (typeof directo === "string" && /^[0-9]{4,12}$/.test(directo)) return directo;
  const m = /TAG principal (\d{4,12})/.exec(String(evidencia.fuentes ?? ""));
  return m ? m[1] : null;
}

/** Una credencial que abrio la pluma y no esta en ningun padron: ni SATAG (vigente o anterior) ni ZK. */
export interface SinPadron {
  tarjeta: string;
  aperturas: number;
  rechazos: number;
  /** Dias distintos con alguna lectura. */
  dias: number;
  /** Primera y ultima lectura, como las da ZK («2026-10-02 08:19:24»). */
  primera: string;
  ultima: string;
  plumas: string[];
}

/**
 * Las credenciales sin padron que ABRIERON la pluma. Antes era un letrero rojo arriba
 * del Resumen; desde el 12-oct es un caso (Gerardo: «no quiero que este aviso salga en
 * las analíticas»). Un TAG desconocido que la pluma solo rechaza no entra: que le
 * niegue el paso es lo esperado.
 */
export function credencialesSinPadron(eventos: EventoZk[], conocida: (tarjeta: string) => boolean): SinPadron[] {
  const m = new Map<string, SinPadron & { _dias: Set<string>; _plumas: Set<string> }>();
  for (const e of eventos) {
    if (e.repeticion || !e.tarjeta || conocida(e.tarjeta)) continue;
    let x = m.get(e.tarjeta);
    if (!x) {
      x = { tarjeta: e.tarjeta, aperturas: 0, rechazos: 0, dias: 0, primera: e.ocurrioEn, ultima: e.ocurrioEn, plumas: [], _dias: new Set(), _plumas: new Set() };
      m.set(e.tarjeta, x);
    }
    if (e.concedido) x.aperturas += 1;
    else x.rechazos += 1;
    if (e.ocurrioEn < x.primera) x.primera = e.ocurrioEn;
    if (e.ocurrioEn > x.ultima) x.ultima = e.ocurrioEn;
    x._dias.add(diaDe(e));
    x._plumas.add(e.lote);
  }
  return [...m.values()]
    .filter((x) => x.aperturas > 0)
    .map(({ _dias, _plumas, ...x }) => ({ ...x, dias: _dias.size, plumas: [..._plumas].sort() }))
    .sort((a, b) => (a.ultima < b.ultima ? 1 : a.ultima > b.ultima ? -1 : 0));
}

/** Un TAG que se parece al del caso, y por que. */
export interface TagParecido {
  tarjeta: string;
  /** Mismo largo y un solo digito distinto, o dos digitos vecinos cambiados de lugar: un error de captura. */
  digito: boolean;
  /** Diferencia numerica (otro − el del caso) si es de `cercania` o menos: TAGs del mismo lote de fabrica. */
  distancia: number | null;
  /** Dias en que se leyo a <= 5 s del del caso en el mismo lector: viajan en el mismo coche. */
  juntos: number;
}

const unDigito = (a: string, b: string) => {
  if (a.length !== b.length || a === b) return false;
  const dif: number[] = [];
  for (let i = 0; i < a.length && dif.length <= 2; i++) if (a[i] !== b[i]) dif.push(i);
  if (dif.length === 1) return true;
  return dif.length === 2 && dif[1] === dif[0] + 1 && a[dif[0]] === b[dif[1]] && a[dif[1]] === b[dif[0]];
};

/**
 * Los TAGs conocidos que se parecen al del caso: por el numero (un digito distinto,
 * o del mismo lote de fabrica) o porque se leen junto a el. Es por donde se empieza a
 * averiguar de quien es una credencial que nadie conoce: o se capturo mal el numero en
 * algun padron, o salio de la misma caja que otros, o viaja con un TAG que si tiene dueño.
 */
export function tagsParecidos(
  tarjeta: string,
  universo: Iterable<string>,
  eventos: EventoZk[],
  { max = 8, cercania = 50 }: { max?: number; cercania?: number } = {},
): TagParecido[] {
  const out = new Map<string, TagParecido>();
  const n = /^\d+$/.test(tarjeta) ? Number(tarjeta) : NaN;
  for (const t of universo) {
    if (t === tarjeta || !/^\d+$/.test(t)) continue;
    const digito = unDigito(tarjeta, t);
    const d = Number.isNaN(n) ? Infinity : Number(t) - n;
    const distancia = Math.abs(d) <= cercania ? d : null;
    if (digito || distancia !== null) out.set(t, { tarjeta: t, digito, distancia, juntos: 0 });
  }
  for (const a of acompanantes(eventos, tarjeta, 1)) {
    const ya = out.get(a.tarjeta);
    if (ya) ya.juntos = a.dias;
    else out.set(a.tarjeta, { tarjeta: a.tarjeta, digito: false, distancia: null, juntos: a.dias });
  }
  return [...out.values()]
    .sort(
      (a, b) =>
        b.juntos - a.juntos ||
        Number(b.digito) - Number(a.digito) ||
        Math.abs(a.distancia ?? Infinity) - Math.abs(b.distancia ?? Infinity) ||
        a.tarjeta.localeCompare(b.tarjeta),
    )
    .slice(0, max);
}
