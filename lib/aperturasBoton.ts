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
