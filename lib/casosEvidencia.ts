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
