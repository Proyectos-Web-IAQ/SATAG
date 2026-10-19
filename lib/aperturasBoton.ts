// Las aperturas con el boton vistas desde ZK (bloque 99; Gerardo, 19-oct: «muy
// visual: a que hora se abrio, a quien o a quienes probablemente, cuantas y de
// donde; resaltadas las que no tienen reporte»).
//
// ZK sabe CUANDO y POR QUE puerta se abrio con el boton, pero no a quien. Las pistas
// salen de la misma bitacora:
//   - Fuerte: un TAG que la pluma RECHAZO en esa puerta justo antes (o un momento
//     despues). Es el carro que no abrio y al que se le abrio con el boton. Pasa en
//     una de cada tres aperturas (144 de 439 del 24-sep al 5-oct).
//   - Debil, del dia: carros que salieron sin que se leyera su entrada (entraron con
//     el boton o detras de otro) o que entraron y no se leyo su salida. No traen hora
//     que los empate con una apertura, asi que se listan por dia, no por apertura.
// Funciones puras: se prueban en pruebas-unitarias/aperturasBoton.test.ts.

export type Sentido = "entrada" | "salida";

/** Una apertura con boton registrada por ZK (hora de pared del controlador). */
export interface BotonZk { idEvento: number; ocurrioEn: string; lote: string; sentido: Sentido }

/** Una lectura de la pluma (hora de pared). */
export interface LecturaPluma {
  ocurrioEn: string;
  lote: string;
  sentido: Sentido;
  tarjeta: string;
  concedido: boolean;
  repeticion?: boolean;
  departamento?: string | null;
}

/** Un TAG rechazado cerca de una apertura: el probable. */
export interface Pista {
  tarjeta: string;
  /** Segundos entre el rechazo y la apertura: negativo = antes. */
  segundos: number;
  mismoSentido: boolean;
  departamento: string | null;
}

/** La ventana de la pista fuerte: de 3 minutos antes a 1 despues. */
export const PISTA_ANTES_S = 180;
export const PISTA_DESPUES_S = 60;

const segundosDe = (pared: string) => Date.parse(pared.replace(" ", "T").slice(0, 19) + "Z") / 1000;
export const diaDe = (pared: string) => pared.slice(0, 10);
/** Minutos desde la medianoche de una hora de pared «2026-10-05 09:28:10». */
export const minutoDelDia = (pared: string) => Number(pared.slice(11, 13)) * 60 + Number(pared.slice(14, 16)) + Number(pared.slice(17, 19) || 0) / 60;

/**
 * Los TAGs rechazados en la misma pluma alrededor de una apertura, del mas probable
 * al menos: primero el mismo sentido, luego el mas cercano. Un TAG cuenta una vez
 * (las rafagas del lector repiten el rechazo). Tope de 3: mas ya no es una pista.
 */
export function pistasDe(a: BotonZk, rechazos: LecturaPluma[]): Pista[] {
  const t = segundosDe(a.ocurrioEn);
  const mejor = new Map<string, Pista>();
  for (const r of rechazos) {
    if (r.concedido || r.lote !== a.lote) continue;
    const s = Math.round(segundosDe(r.ocurrioEn) - t);
    if (s < -PISTA_ANTES_S || s > PISTA_DESPUES_S) continue;
    const p: Pista = { tarjeta: r.tarjeta, segundos: s, mismoSentido: r.sentido === a.sentido, departamento: r.departamento ?? null };
    const ya = mejor.get(r.tarjeta);
    if (!ya || rango(p) < rango(ya)) mejor.set(r.tarjeta, p);
  }
  return [...mejor.values()].sort((x, y) => rango(x) - rango(y)).slice(0, 3);
}
const rango = (p: Pista) => (p.mismoSentido ? 0 : 10_000) + Math.abs(p.segundos);

/** Los que pasaron sin lectura un dia, por estacionamiento: las pistas debiles. */
export interface SinLectura {
  lote: string;
  /** Su primera lectura del dia fue una salida: no se leyo como entro. */
  entraronSinLectura: { tarjeta: string; salio: string }[];
  /** Su ultima lectura del dia fue una entrada: no se leyo como salio. */
  salieronSinLectura: { tarjeta: string; entro: string }[];
}

/**
 * Con las lecturas CONCEDIDAS de un dia: quien salio sin haber entrado por la pluma
 * y quien entro sin salir. Las rafagas no cuentan. Ojo: «salio sin lectura» tambien
 * es quien sigue dentro al cierre del archivo o salio por el otro estacionamiento.
 */
export function sinLecturaDelDia(lecturas: LecturaPluma[]): SinLectura[] {
  const porClave = new Map<string, LecturaPluma[]>();
  for (const l of lecturas) {
    if (!l.concedido || l.repeticion) continue;
    const k = `${l.lote}|${l.tarjeta}`;
    const v = porClave.get(k);
    if (v) v.push(l); else porClave.set(k, [l]);
  }
  const lotes = new Map<string, SinLectura>();
  const de = (lote: string) => {
    let x = lotes.get(lote);
    if (!x) { x = { lote, entraronSinLectura: [], salieronSinLectura: [] }; lotes.set(lote, x); }
    return x;
  };
  for (const ls of porClave.values()) {
    ls.sort((a, b) => a.ocurrioEn.localeCompare(b.ocurrioEn));
    const primera = ls[0];
    const ultima = ls[ls.length - 1];
    if (primera.sentido === "salida") de(primera.lote).entraronSinLectura.push({ tarjeta: primera.tarjeta, salio: primera.ocurrioEn });
    if (ultima.sentido === "entrada") de(ultima.lote).salieronSinLectura.push({ tarjeta: ultima.tarjeta, entro: ultima.ocurrioEn });
  }
  return [...lotes.values()]
    .map((x) => ({
      ...x,
      entraronSinLectura: x.entraronSinLectura.sort((a, b) => a.salio.localeCompare(b.salio)),
      salieronSinLectura: x.salieronSinLectura.sort((a, b) => a.entro.localeCompare(b.entro)),
    }))
    .sort((a, b) => a.lote.localeCompare(b.lote));
}

/** Cuantas por hora del dia (de pared), separadas en sin reporte y con reporte. */
export function porHora<T extends { ocurrioEn: string }>(items: T[], conReporte: (x: T) => boolean): { hora: number; sin: number; con: number }[] {
  const h = new Map<number, { hora: number; sin: number; con: number }>();
  for (const x of items) {
    const hora = Number(x.ocurrioEn.slice(11, 13));
    const v = h.get(hora) ?? { hora, sin: 0, con: 0 };
    if (conReporte(x)) v.con++; else v.sin++;
    h.set(hora, v);
  }
  if (h.size === 0) return [];
  // Las horas sin aperturas tambien se dibujan: el hueco es informacion.
  const min = Math.min(6, ...h.keys());
  const max = Math.max(20, ...h.keys());
  const out: { hora: number; sin: number; con: number }[] = [];
  for (let i = min; i <= max; i++) out.push(h.get(i) ?? { hora: i, sin: 0, con: 0 });
  return out;
}

/** Cuantas por dia, en orden de tiempo. */
export function porDia<T extends { ocurrioEn: string }>(items: T[], conReporte: (x: T) => boolean): { dia: string; sin: number; con: number }[] {
  const d = new Map<string, { dia: string; sin: number; con: number }>();
  for (const x of items) {
    const dia = diaDe(x.ocurrioEn);
    const v = d.get(dia) ?? { dia, sin: 0, con: 0 };
    if (conReporte(x)) v.con++; else v.sin++;
    d.set(dia, v);
  }
  return [...d.values()].sort((a, b) => a.dia.localeCompare(b.dia));
}

/* ------------------------------------------------------------------ antes y despues de un corte */

// Gerardo, 19-oct: demostrar que bajaron las aperturas con boton desde que empezo el
// canal Sistemas <-> caseta. Para que no dependa de cuanta gente vino, se compara
// por dia habil Y por cada 100 entradas, y cada dia contra el mismo dia de la
// semana de antes. El ultimo dia, si el archivo no llega al final de la tarde, se
// compara contra los mismos dias A LA MISMA HORA y no entra en los promedios.
// Sabados y domingos van aparte: son eventos, no la operacion del dia.

export const diaDeLaSemana = (dia: string) => new Date(dia + "T12:00:00Z").getUTCDay();
const esHabil = (dia: string) => { const d = diaDeLaSemana(dia); return d >= 1 && d <= 5; };

export interface BloqueComparado {
  dias: number;
  botones: number;
  /** null: el rol no lee la bitacora y no hay entradas con que comparar. */
  entradas: number | null;
  porDia: number;
  /** Aperturas por cada 100 entradas. */
  tasa: number | null;
}

export interface DiaDespues {
  dia: string;
  botones: number;
  entradas: number | null;
  tasa: number | null;
  /** «08:13» si el dia esta incompleto: la comparacion es hasta esa hora. */
  parcialHasta: string | null;
  /** El mismo dia de la semana antes del corte (hasta la misma hora si es parcial). */
  antes: { dias: number; botones: number; tasa: number | null } | null;
}

export interface AntesDespues {
  antes: BloqueComparado;
  despues: BloqueComparado;
  /** -0.78 = bajo 78 %. null si no hay con que comparar. */
  cambioPorDia: number | null;
  cambioTasa: number | null;
  dias: DiaDespues[];
  finDeSemana: { dias: number; botones: number };
}

/** Hasta que hora del dia se considera completo un dia de lecturas. */
export const DIA_COMPLETO = "20:00";

/**
 * @param botones   la hora de pared de cada apertura con boton (ya filtradas por lote/puerta)
 * @param entradas  entradas concedidas por dia completo, o null si el rol no las lee
 * @param entradasHasta  entradas por dia hasta la hora del dia parcial (solo esos dias)
 * @param hito      primer dia del «despues» (AAAA-MM-DD)
 * @param hasta     la ultima lectura de ZK (hora de pared): define el dia parcial
 */
export function antesDespues(
  botones: string[],
  entradas: Map<string, number> | null,
  entradasHasta: Map<string, number> | null,
  hito: string,
  hasta: string | null,
): AntesDespues {
  const diaHasta = hasta ? hasta.slice(0, 10) : null;
  const horaHasta = hasta ? hasta.slice(11, 16) : null;
  const parcial = diaHasta && horaHasta && horaHasta < DIA_COMPLETO ? diaHasta : null;

  const porDia = new Map<string, number>();
  const porDiaHastaHora = new Map<string, number>();
  for (const b of botones) {
    const d = b.slice(0, 10);
    porDia.set(d, (porDia.get(d) ?? 0) + 1);
    if (horaHasta && b.slice(11, 16) <= horaHasta) porDiaHastaHora.set(d, (porDiaHastaHora.get(d) ?? 0) + 1);
  }
  const todos = [...new Set([...porDia.keys(), ...(entradas ? entradas.keys() : [])])].sort();
  const habiles = todos.filter(esHabil);

  const bloque = (dias: string[]): BloqueComparado => {
    const b = dias.reduce((s, d) => s + (porDia.get(d) ?? 0), 0);
    const e = entradas ? dias.reduce((s, d) => s + (entradas.get(d) ?? 0), 0) : null;
    return { dias: dias.length, botones: b, entradas: e, porDia: dias.length ? b / dias.length : 0, tasa: e ? (100 * b) / e : null };
  };
  const diasAntes = habiles.filter((d) => d < hito);
  const diasDespues = habiles.filter((d) => d >= hito && d !== parcial);
  const antes = bloque(diasAntes);
  const despues = bloque(diasDespues);

  const dias: DiaDespues[] = habiles.filter((d) => d >= hito).map((d) => {
    const esParcial = d === parcial;
    const mismos = diasAntes.filter((x) => diaDeLaSemana(x) === diaDeLaSemana(d));
    const cuenta = (x: string) => (esParcial ? porDiaHastaHora.get(x) ?? 0 : porDia.get(x) ?? 0);
    const ent = (x: string) => (esParcial ? entradasHasta?.get(x) : entradas?.get(x)) ?? null;
    const sumB = mismos.reduce((s, x) => s + cuenta(x), 0);
    const sumE = mismos.reduce<number | null>((s, x) => (s === null || ent(x) === null ? null : s + (ent(x) as number)), entradas ? 0 : null);
    const e = ent(d);
    return {
      dia: d,
      botones: cuenta(d),
      entradas: e,
      tasa: e ? (100 * cuenta(d)) / e : null,
      parcialHasta: esParcial ? horaHasta : null,
      antes: mismos.length ? { dias: mismos.length, botones: sumB / mismos.length, tasa: sumE ? (100 * sumB) / sumE : null } : null,
    };
  });

  const finde = todos.filter((d) => d >= hito && !esHabil(d));
  const cambio = (a: number | null, b: number | null) => (a && b !== null && a > 0 ? b / a - 1 : null);
  return {
    antes,
    despues,
    cambioPorDia: despues.dias ? cambio(antes.porDia, despues.porDia) : null,
    cambioTasa: despues.dias ? cambio(antes.tasa, despues.tasa) : null,
    dias,
    finDeSemana: { dias: finde.length, botones: finde.reduce((s, d) => s + (porDia.get(d) ?? 0), 0) },
  };
}
