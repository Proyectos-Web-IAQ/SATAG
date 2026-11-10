// El simulador «¿y si…?» de Vialidad (6-nov-2026).
//
// QUE HACE. Parte de las estancias reales de la tarde de lunes a jueves, juntadas en
// celdas de 5 minutos [estacionamiento, grupo, entra, sale, autos por dia], y solo
// recorre lo que mueve cada palanca:
//   - el personal que pasa de E2 a E1 (con sus mismos horarios);
//   - la salida de cada seccion, ±15 min: se recorre la salida de las familias cuyo hijo
//     MAYOR esta ahi (tambien las que llegaron por un hermano menor, porque salen con el
//     mayor); si «ajustan», las familias cuyo hijo MENOR esta ahi llegan esos minutos
//     despues o antes;
//   - la recogida unica: las familias con hermanos llegan a la hora del mayor, con la
//     espera de quien viene solo por el; el hijo menor espera en la escuela.
// No inventa demanda y no predice la calle: no sabe cuantos esperan afuera.
//
// Es el mismo calculo del mapa de Analisis Vial (scripts/simulador.js) y de sus celdas
// (scripts/secciones.mjs), portado a TypeScript sin cambiar la semantica. Puro: sin
// React y sin Supabase.

import { confirmadas, type Estancia } from "@/lib/estacionamiento";
import { SECCIONES_HIJO, type Recogida, ALUMNOS_QUE_MANEJAN } from "@/lib/recogida";
import { SALIDA_SECCION } from "@/lib/vialidad";
import type { Lote } from "@/lib/zk/eventos";

/* ------------------------------------------------------------------ secciones y series */

/** Las secciones del simulador: secundaria y prepa por separado, en orden de edad. */
export type Seccion = "comunidad" | "preescolar" | "primaria" | "secundaria" | "prepa";
export const SECCIONES: Seccion[] = ["comunidad", "preescolar", "primaria", "secundaria", "prepa"];
export const NOMBRE_SEC: Record<Seccion, string> = {
  comunidad: "comunidad infantil",
  preescolar: "preescolar",
  primaria: "primaria",
  secundaria: "secundaria",
  prepa: "prepa",
};
export const COLOR_SEC: Record<Seccion, string> = {
  comunidad: "#e87ba4",
  preescolar: "#eda100",
  primaria: "#1baf7a",
  secundaria: "#eb6834",
  prepa: "#8e5be8",
};

/**
 * Desde cuando empieza la salida de cada seccion (lib/vialidad.ts, horarios de la
 * escuela). Solo se mueven las estancias que terminan desde 10 min antes: las que
 * salieron antes no venian a esa salida.
 */
export const VENT: Record<Seccion, number> = {
  comunidad: SALIDA_SECCION.comunidad,
  preescolar: SALIDA_SECCION.preescolar,
  primaria: SALIDA_SECCION.primaria,
  secundaria: SALIDA_SECCION.secundaria,
  prepa: SALIDA_SECCION.preparatoria,
};

export interface Serie {
  id: string;
  nombre: string;
  color: string;
  /** 1 lleno; 0.45 los que llegaron antes por un hermano menor. */
  opacidad: number;
  mayor?: Seccion;
  /** Personal, alumnos que manejan y otros: se pueden ocultar para ver solo a los papas. */
  noPapa?: boolean;
}
/** Por cada seccion, los que vienen solo por ella y los que esperan a un hijo de ella; luego personal y otros. */
export const SERIES: Serie[] = [
  ...SECCIONES.flatMap((s): Serie[] => [
    { id: `${s}:solo`, nombre: `salen con ${NOMBRE_SEC[s]}`, color: COLOR_SEC[s], opacidad: 1, mayor: s },
    { id: `${s}:esperan`, nombre: `llegaron antes por un hermano menor y salen con ${NOMBRE_SEC[s]}`, color: COLOR_SEC[s], opacidad: 0.45, mayor: s },
  ]),
  { id: "alumno", nombre: "Alumnos que manejan", color: "#8c9bb0", opacidad: 1, noPapa: true },
  { id: "per", nombre: "Personal", color: "#5b6b82", opacidad: 1, noPapa: true },
  { id: "otro", nombre: "Otros", color: "#c9d1dc", opacidad: 1, noPapa: true },
];
const IDX = Object.fromEntries(SERIES.map((g, i) => [g.id, i])) as Record<string, number>;

/** Autos por pluma en 5 minutos: uno cada 12 s y uno cada 7 s. */
export const PLUMA: [number, number] = [25, 43];
export const CAJONES: Record<Lote, number> = { E1: 80, E2: 120 };
/** La reja de la tarde: de 13:00 a 15:35, cada 5 minutos. */
export const T: number[] = [];
for (let t = 780; t < 940; t += 5) T.push(t);

/* ------------------------------------------------------------------ celdas */

/** [estacionamiento, grupo, minuto de entrada, minuto de salida, autos por dia]. */
export type Celda = [lote: Lote, grupo: string, entra: number, sale: number, peso: number];

const aSim = (s: (typeof SECCIONES_HIJO)[number]): Seccion => (s === "preparatoria" ? "prepa" : s);

/**
 * La clave de grupo de una tarjeta, como la usa el simulador: per:<departamento>,
 * alumno, otro, fam:<secciones de los hijos> o sin (papa sin ligar a GES).
 */
export function claveSim(r: Recogida | undefined): string {
  if (!r) return "otro";
  if (r.grupo === "personal") return `per:${r.etiqueta}`;
  if (r.etiqueta === ALUMNOS_QUE_MANEJAN) return "alumno";
  if (!r.esPapa) return "otro";
  if (r.secciones.length === 0) return "sin";
  const secs = SECCIONES_HIJO.filter((s) => r.secciones.includes(s)).map(aSim);
  return `fam:${secs.join("+")}`;
}

const r5 = (m: number) => Math.floor(m / 5) * 5;

/**
 * Las celdas de la tarde: estancias con entrada y salida leidas de los dias dados que
 * salen desde las 13:00 y entraron antes de las 15:40; la entrada se recorta a las 12:00
 * y la salida a las 16:00, en ranuras de 5 min, y cada auto pesa 1 entre los dias. Los
 * papas sin ligar se reparten con la proporcion de las familias ligadas que salen en su
 * misma ranura (sin:<composicion>), o quedan como sin:otro si en esa ranura no sale
 * ninguna familia ligada. Igual que scripts/secciones.mjs.
 */
export function celdasDeEstancias(estancias: Estancia[], dias: string[], claveDe: (tarjeta: string) => string): Celda[] {
  const n = dias.length;
  if (n === 0) return [];
  const esDia = new Set(dias);
  const pares: { lote: Lote; g: string; e: number; s: number }[] = [];
  for (const x of confirmadas(estancias)) {
    if (!esDia.has(x.dia)) continue;
    const sale = x.entro + x.dur;
    if (sale < 13 * 60 || x.entro >= 15 * 60 + 40) continue;
    pares.push({ lote: x.lote, g: claveDe(x.tarjeta), e: r5(Math.max(x.entro, 12 * 60)), s: r5(Math.min(sale, 16 * 60)) });
  }
  const reparto = new Map<number, Map<string, number>>();
  for (const x of pares) {
    if (!x.g.startsWith("fam:")) continue;
    const r = reparto.get(x.s) ?? new Map<string, number>();
    reparto.set(x.s, r);
    const k = x.g.slice(4);
    r.set(k, (r.get(k) ?? 0) + 1);
  }
  const celdas = new Map<string, Celda>();
  const sumar = (lote: Lote, g: string, e: number, s: number, w: number) => {
    const k = `${lote}|${g}|${e}|${s}`;
    const c = celdas.get(k);
    if (c) c[4] += w;
    else celdas.set(k, [lote, g, e, s, w]);
  };
  for (const x of pares) {
    if (x.g !== "sin") {
      sumar(x.lote, x.g, x.e, x.s, 1 / n);
      continue;
    }
    const r = reparto.get(x.s);
    if (!r) {
      sumar(x.lote, "sin:otro", x.e, x.s, 1 / n);
      continue;
    }
    let tot = 0;
    for (const c of r.values()) tot += c;
    for (const [k, c] of r) sumar(x.lote, `sin:${k}`, x.e, x.s, c / tot / n);
  }
  return [...celdas.values()].filter((c) => c[4] > 0);
}

/* ------------------------------------------------------------------ quien es cada celda */

export interface Quien {
  tipo: "per" | "alumno" | "otro" | "fam" | "sin";
  /** Por quien viene: el hijo menor, cuya salida marca a que hora llega. */
  menor?: Seccion;
  /** Hasta quien se queda: el mayor, cuya salida marca a que hora sale. */
  mayor?: Seccion;
  serie: number;
}

export function quien(g: string): Quien {
  if (g.startsWith("per:")) return { tipo: "per", serie: IDX.per };
  if (g === "alumno") return { tipo: "alumno", menor: "prepa", mayor: "prepa", serie: IDX.alumno };
  if (g === "otro" || g === "sin:otro") return { tipo: "otro", serie: IDX.otro };
  const secs = g.slice(4).split("+").filter((s): s is Seccion => (SECCIONES as string[]).includes(s))
    .sort((a, b) => SECCIONES.indexOf(a) - SECCIONES.indexOf(b));
  if (!secs.length) return { tipo: "otro", serie: IDX.otro };
  const menor = secs[0], mayor = secs[secs.length - 1];
  return { tipo: g.startsWith("sin:") ? "sin" : "fam", menor, mayor, serie: IDX[`${mayor}:${menor === mayor ? "solo" : "esperan"}`] };
}
export const esFamilia = (q: Quien) => q.tipo === "fam" || q.tipo === "sin";

/** Cuantil con pesos: [valor, peso]. */
export function cuantilPeso(xs: [number, number][], q: number): number | null {
  const s = xs.filter((x) => x[1] > 0).sort((a, b) => a[0] - b[0]);
  const tot = s.reduce((t, x) => t + x[1], 0);
  let acc = 0;
  for (const x of s) {
    acc += x[1];
    if (acc >= tot * q) return x[0];
  }
  return s.length ? s[s.length - 1][0] : null;
}

/** Autos del personal en E2 a las 14:30, todos los departamentos juntos. */
export const perE2En1430 = (celdas: Celda[]) =>
  celdas.filter((x) => x[0] === "E2" && x[1].startsWith("per:") && x[2] < 870 && x[3] >= 870).reduce((a, x) => a + x[4], 0);

/**
 * Lo mismo, por departamento de ZK (9-nov-2026): cuantos autos de cada uno hay en E2 a
 * las 14:30, de mas a menos. Es con lo que se arman las combinaciones que se pasan a E1
 * completas, en vez de una parte pareja de todo el personal.
 */
export function perE2PorDepto(celdas: Celda[]): { depto: string; autos: number }[] {
  const m = new Map<string, number>();
  for (const x of celdas) {
    if (x[0] !== "E2" || !x[1].startsWith("per:") || !(x[2] < 870 && x[3] >= 870)) continue;
    const d = x[1].slice(4);
    m.set(d, (m.get(d) ?? 0) + x[4]);
  }
  return [...m].map(([depto, autos]) => ({ depto, autos })).sort((a, b) => b.autos - a.autos || a.depto.localeCompare(b.depto));
}

/**
 * Las combinaciones de departamentos COMPLETOS que suman cerca de `meta` autos en E2 a las
 * 14:30. Solo entran los departamentos con al menos un auto: con uno de medio auto salian
 * copias de cada combinacion. Primero las de menos departamentos, y entre ellas la mas cercana.
 */
export function combinacionesPersonal(
  lista: { depto: string; autos: number }[],
  meta: number,
  holgura = 5,
  max = 6,
): { deptos: string[]; autos: number }[] {
  const c = lista.filter((x) => x.autos >= 1).slice(0, 14);
  const out: { deptos: string[]; autos: number }[] = [];
  for (let m = 1; m < 1 << c.length; m++) {
    const sel = c.filter((_, i) => m & (1 << i));
    const autos = sel.reduce((a, x) => a + x.autos, 0);
    if (Math.abs(autos - meta) <= holgura) out.push({ deptos: sel.map((x) => x.depto), autos });
  }
  return out
    .sort((a, b) => a.deptos.length - b.deptos.length || Math.abs(a.autos - meta) - Math.abs(b.autos - meta))
    .slice(0, max);
}

/**
 * Minutos adentro (mediana, hoy) de quien viene solo por cada seccion: lo que esperaria
 * una familia con hermanos si llegara a la hora del mayor.
 */
export function estanciaSolo(celdas: Celda[]): Record<Seccion, number | null> {
  const por: Partial<Record<Seccion, [number, number][]>> = {};
  for (const [, g, e, s, w] of celdas) {
    const q = quien(g);
    if (esFamilia(q) && q.menor === q.mayor && q.mayor && s >= VENT[q.mayor] - 10) (por[q.mayor] ??= []).push([s - e, w]);
  }
  const o = {} as Record<Seccion, number | null>;
  for (const s of SECCIONES) o[s] = por[s] ? cuantilPeso(por[s]!, 0.5) : null;
  return o;
}

/* ------------------------------------------------------------------ simular */

export interface Palancas {
  /**
   * Departamentos de ZK cuyo personal pasa COMPLETO de E2 a E1 (9-nov). Es la unica forma
   * de mover al personal desde el 10-nov: la parte pareja de todos se quito porque nadie
   * puede pedirla, y movia gente con el horario promedio en vez del suyo.
   */
  deptos?: string[];
  /** Minutos que se mueve la salida de cada seccion. */
  d: Record<Seccion, number>;
  /** Los papas llegan segun la salida del hijo por el que vienen. */
  ajusta: boolean;
  /** Recogida unica: las familias con hermanos llegan a la hora del mayor. */
  unica: boolean;
}
export const SIN_CAMBIOS = (): Record<Seccion, number> => ({ comunidad: 0, preescolar: 0, primaria: 0, secundaria: 0, prepa: 0 });
export const HOY: Palancas = { deptos: [], d: SIN_CAMBIOS(), ajusta: true, unica: false };

/** Una celda despues de las palancas. eAj: la entrada sin recogida unica (para la espera del hijo menor). */
export interface Fila { lote: Lote; serie: number; e: number; s: number; w: number; q: Quien; eAj: number }
export interface Resultado {
  /** Por estacionamiento, por minuto de T, por serie. */
  dentro: Record<Lote, number[][]>;
  salen: Record<Lote, number[][]>;
  entran: Record<Lote, number[][]>;
  filas: Fila[];
}

export function simular(celdas: Celda[], p: Palancas): Resultado {
  const d = p.d;
  const completos = new Set(p.deptos ?? []);
  const solo = p.unica ? estanciaSolo(celdas) : null;
  const filas: Fila[] = [];
  for (const [lote, g, e0, s0, w] of celdas) {
    const q = quien(g);
    let e = e0, s = s0, eAj = e0;
    if (q.mayor && q.menor && s0 >= VENT[q.mayor] - 10) {
      if (d[q.mayor]) s = s0 + d[q.mayor];
      // Llega segun la salida del hijo por el que viene: si esa salida se mueve, llega despues o antes.
      if (p.ajusta && d[q.menor] && e0 >= VENT[q.menor] - 40) e = e0 + d[q.menor];
      eAj = Math.min(e, s - 5);
      // Recogida unica: la familia con hermanos llega a la hora del mayor, con la espera de quien viene solo por el.
      const sm = solo?.[q.mayor];
      if (solo && q.menor !== q.mayor && sm != null) e = Math.max(e, s - sm);
      if (e > s - 5) e = s - 5;
    }
    if (q.tipo === "per" && lote === "E2" && completos.has(g.slice(4))) {
      filas.push({ lote: "E1", serie: q.serie, e, s, w, q, eAj });
    } else filas.push({ lote, serie: q.serie, e, s, w, q, eAj });
  }
  const r: Resultado = { dentro: { E1: [], E2: [] }, salen: { E1: [], E2: [] }, entran: { E1: [], E2: [] }, filas };
  for (const lote of ["E1", "E2"] as Lote[]) {
    for (const t of T) {
      const dd = SERIES.map(() => 0), sa = SERIES.map(() => 0), en = SERIES.map(() => 0);
      for (const x of filas) {
        if (x.lote !== lote) continue;
        if (x.e < t && x.s >= t) dd[x.serie] += x.w;
        if (x.s === t) sa[x.serie] += x.w;
        if (x.e === t) en[x.serie] += x.w;
      }
      r.dentro[lote].push(dd);
      r.salen[lote].push(sa);
      r.entran[lote].push(en);
    }
  }
  return r;
}

export const suma = (v: number[]) => v.reduce((a, b) => a + b, 0);
/** Lo mas que suma una serie entre dos minutos de la reja. */
export const maxEn = (serie: number[][], a: number, b: number) => Math.max(...T.map((t, i) => (t >= a && t <= b ? suma(serie[i]) : 0)));

/* ------------------------------------------------------------------ las cifras */

export interface Kpis {
  /** Cajones libres en E2 de 14:35 a 15:00. */
  libresE2: number;
  /** E1 en su momento mas lleno. */
  maxE1: number;
  /** Lo mas que sale por la pluma de E2 en 5 min. */
  pluma: number;
  /** Papas que esperan a secundaria o prepa a las 14:50, en E1 y E2. */
  secDentro: number;
  /** Minutos adentro por familia: las que llegan hasta una hora antes de la salida por la que vienen. */
  esperaFam: number;
  /** Lo que espera el hijo menor en la escuela con recogida unica. */
  esperaHijo: number;
}

export function kpis(res: Resultado, cajones: Record<Lote, number> = CAJONES): Kpis {
  const i50 = T.indexOf(890);
  // Solo la recogida: las estancias largas de la mañana o de juntas no son espera y jalarian el promedio.
  const fam = res.filas.filter((x) => esFamilia(x.q) && x.q.menor && x.e >= VENT[x.q.menor] - 60);
  const peso = fam.reduce((t, x) => t + x.w, 0);
  const herm = fam.filter((x) => x.q.menor !== x.q.mayor);
  const pesoH = herm.reduce((t, x) => t + x.w, 0);
  return {
    libresE2: cajones.E2 - maxEn(res.dentro.E2, 875, 900),
    maxE1: maxEn(res.dentro.E1, 780, 935),
    pluma: maxEn(res.salen.E2, 780, 935),
    secDentro: SERIES.reduce((t, g, k) => t + (g.mayor === "secundaria" || g.mayor === "prepa" ? res.dentro.E2[i50][k] + res.dentro.E1[i50][k] : 0), 0),
    esperaFam: peso ? fam.reduce((t, x) => t + (x.s - x.e) * x.w, 0) / peso : 0,
    esperaHijo: pesoH ? herm.reduce((t, x) => t + Math.max(0, x.e - x.eAj) * x.w, 0) / pesoH : 0,
  };
}

/** Por «viene por X y se queda hasta Y» (y los alumnos que manejan): peso y entradas, salidas y estancias con su peso. */
export interface Grupo { w: number; es: [number, number][]; ss: [number, number][]; ds: [number, number][] }
export function grupos(res: Resultado): Map<string, Grupo> {
  const m = new Map<string, Grupo>();
  for (const x of res.filas) {
    if (!esFamilia(x.q) && x.q.tipo !== "alumno") continue;
    const k = x.q.tipo === "alumno" ? "alumno" : `${x.q.menor}|${x.q.mayor}`;
    const o = m.get(k) ?? { w: 0, es: [], ss: [], ds: [] };
    m.set(k, o);
    o.w += x.w;
    o.es.push([x.e, x.w]);
    o.ss.push([x.s, x.w]);
    o.ds.push([x.s - x.e, x.w]);
  }
  return m;
}

/* ------------------------------------------------------------------ escenarios */

/**
 * Un escenario. `personal` es una meta en autos (10-nov): la pantalla la convierte en
 * departamentos completos con `deptosParaMeta`, para que nada mueva personal sin nombre.
 */
export interface Escenario { nombre: string; palancas: Partial<Omit<Palancas, "d">> & { d?: Partial<Record<Seccion, number>>; personal?: number }; detalle?: string }
/** Las dos propuestas del buscador de combinaciones (Analisis Vial, 30-oct). */
export const PROPUESTAS: Escenario[] = [
  { nombre: "Propuesta 1: horarios y personal a E1", palancas: { personal: 30, d: { preescolar: 15, secundaria: -15 } }, detalle: "preescolar 15 min después, secundaria 15 min antes y unos 30 autos del personal a E1, por departamento completo" },
  { nombre: "Propuesta 2: con recogida única", palancas: { personal: 30, d: { preescolar: 15, prepa: -15 }, unica: true }, detalle: "preescolar 15 min después, prepa 15 min antes, unos 30 del personal a E1 por departamento completo y recogida única" },
];
/** La combinacion de departamentos completos mas cercana a la meta, con los menos departamentos. */
export const deptosParaMeta = (celdas: Celda[], meta: number): string[] =>
  combinacionesPersonal(perE2PorDepto(celdas), meta)[0]?.deptos ?? [];
/**
 * Completa un escenario con lo de hoy. Si el escenario trae una meta de personal y no
 * nombra departamentos, toma `deptosMeta` (los que la pantalla resolvio para esa meta).
 */
export function palancasDe(e: Escenario["palancas"], deptosMeta: string[] = []): Palancas {
  const deptos = e.deptos ?? (e.personal ? deptosMeta : []);
  return { deptos, d: { ...SIN_CAMBIOS(), ...(e.d ?? {}) }, ajusta: e.ajusta ?? true, unica: e.unica ?? false };
}
export const hayCambio = (p: Palancas) => (p.deptos?.length ?? 0) > 0 || p.unica || SECCIONES.some((s) => p.d[s] !== 0);
