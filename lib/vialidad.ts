// Vialidad › Seguir: el experimento de noviembre (3-nov-2026).
//
// EL EXPERIMENTO. Tres semanas de linea base (3 al 20-nov), dias testigo —habiles sin
// alumnos: 30-oct (consejo tecnico), 2-nov y 16-nov (asueto)— y dos semanas de piloto
// (23-nov al 4-dic) si Direccion autoriza una medida. Lo que se compara son los mismos
// cinco numeros de la puerta en cada fase, lunes a jueves y viernes por separado,
// porque el viernes no hay talleres y la tarde es otra.
//
// POR QUE NO PASA POR medirEstacionamiento. `clasificarDias` tira el primer y el
// ultimo dia de lo que recibe y excluye los dias con menos de la mitad de los accesos
// del dia tipico: rebanando la bitacora por fase se perderian el 3-nov, el 20-nov, el
// 23-nov y el 4-dic, y los testigos quedarian fuera por tener solo personal. Aqui las
// estancias se emparejan UNA sola vez sobre toda la ventana (`emparejarEstancias` ya
// agrupa por tarjeta, dia y lote, asi que una estancia nunca cruza de dia) y despues
// se agrupan por dia; el calendario decide que dia cuenta y la regla de dia completo
// es propia y explicita.
//
// UNA CIFRA MANDA: minutos dentro por familia. Es la misma regla del buscador de
// combinaciones del 30-oct (analisis_vial/scripts/optimizar.mjs): los papas ligados a
// GES que entran hasta una hora antes de la salida de la seccion del hijo MENOR —por
// quien vienen— y salen en la tarde. Los papas sin familia en GES se cuentan aparte y
// no entran al promedio.
//
// Esta capa es pura: recibe la bitacora y devuelve numeros. Las metas las fija
// Direccion; aqui no hay ninguna.

import { mediana } from "@/lib/duracion";
import {
  MINUTO_CIERRE_POR_DEFECTO,
  accesos,
  confirmadas,
  emparejarEstancias,
  horaCorta,
  type Corte,
  type Estancia,
} from "@/lib/estacionamiento";
import { SALIDA_DESDE, SALIDA_HASTA, SALIDA_PASO, SECCIONES_HIJO, type SeccionHijo } from "@/lib/recogida";
import type { EventoZk, Lote } from "@/lib/zk/eventos";

/* ------------------------------------------------------------------ calendario */

export type FaseId = "antes" | "testigo" | "piloto";
export type TipoDia = "LJ" | "V";

export interface Fase {
  id: Exclude<FaseId, "testigo">;
  desde: string;
  hasta: string;
}

export interface CalendarioVial {
  fases: Fase[];
  /** Dias habiles sin alumnos: solo personal cruza la pluma. */
  testigo: string[];
  /** Dias habiles que no cuentan en ninguna fase (suspensiones, salidas). */
  sinClases: string[];
  /** La medida que Direccion autorizo para el piloto, o null mientras no haya. */
  medidaPiloto: string | null;
  /** Las horas de salida que cambian en el piloto; lo que no este aqui hereda las de antes. */
  salidaPiloto: Partial<Record<SeccionHijo, number>>;
}

export const FASES: FaseId[] = ["antes", "testigo", "piloto"];
export const NOMBRE_FASE: Record<FaseId, string> = { antes: "Antes", testigo: "Testigo", piloto: "Piloto" };
export const TIPOS_DIA: { clave: TipoDia; titulo: string }[] = [
  { clave: "LJ", titulo: "Lunes a jueves" },
  { clave: "V", titulo: "Viernes" },
];

/** A que hora sale cada seccion (horarios que dio la escuela el 27-oct-2026). */
export const SALIDA_SECCION: Record<SeccionHijo, number> = {
  comunidad: 13 * 60 + 15,
  preescolar: 13 * 60 + 25,
  primaria: 14 * 60 + 10,
  secundaria: 14 * 60 + 35,
  preparatoria: 14 * 60 + 35,
};

export const CALENDARIO_VIAL: CalendarioVial = {
  fases: [
    { id: "antes", desde: "2026-11-03", hasta: "2026-11-20" },
    { id: "piloto", desde: "2026-11-23", hasta: "2026-12-04" },
  ],
  testigo: ["2026-10-30", "2026-11-02", "2026-11-16"],
  sinClases: [],
  medidaPiloto: null,
  salidaPiloto: {},
};

const sumarDia = (dia: string): string => new Date(Date.parse(`${dia}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Lunes a jueves, viernes, o null en fin de semana. */
export function tipoDiaDe(dia: string): TipoDia | null {
  const d = new Date(`${dia}T12:00:00`).getDay();
  if (d === 0 || d === 6) return null;
  return d === 5 ? "V" : "LJ";
}

/** En que fase cae un dia. El testigo manda sobre el rango: el 16-nov cae dentro de «antes». */
export function faseDe(dia: string, cal: CalendarioVial = CALENDARIO_VIAL): FaseId | null {
  if (cal.testigo.includes(dia)) return "testigo";
  if (cal.sinClases.includes(dia) || tipoDiaDe(dia) === null) return null;
  const f = cal.fases.find((x) => dia >= x.desde && dia <= x.hasta);
  return f ? f.id : null;
}

/** Los dias habiles de una fase y un tipo de dia, en orden. Son la «m» de «n de m dias». */
export function diasHabilesDe(fase: FaseId, tipo: TipoDia, cal: CalendarioVial = CALENDARIO_VIAL): string[] {
  if (fase === "testigo") return [...cal.testigo].sort().filter((d) => tipoDiaDe(d) === tipo);
  const f = cal.fases.find((x) => x.id === fase);
  if (!f) return [];
  const out: string[] = [];
  for (let d = f.desde; d <= f.hasta; d = sumarDia(d)) if (faseDe(d, cal) === fase && tipoDiaDe(d) === tipo) out.push(d);
  return out;
}

/** A que hora sale una seccion en una fase: el piloto puede moverla; lo demas hereda. */
export function horaSalidaDe(seccion: SeccionHijo, fase: FaseId, cal: CalendarioVial = CALENDARIO_VIAL): number {
  return (fase === "piloto" ? cal.salidaPiloto[seccion] : undefined) ?? SALIDA_SECCION[seccion];
}

/* ------------------------------------------------------------------ los cinco numeros */

export const CAJONES_E2_POR_DEFECTO = 120;
/** Un papa «viene a recoger» si entra hasta esto antes de la salida de su seccion menor. */
export const ANTES_DE_LA_SALIDA_MIN = 60;
/** La franja en que se miden los cajones libres de E2: la salida de secundaria y prepa. */
export const LIBRES_E2 = { desde: 14 * 60 + 35, hasta: 15 * 60 };
/** La tarde que cuenta como recogida: igual que `viajesPorSeccion` (lib/recogida.ts). */
const RECOGIDA = { salenDesde: 13 * 60, salenHasta: 16 * 60, entranAntesDe: 15 * 60 + 40 };
/**
 * Dia completo para Seguir: hay bitacora desde antes de las 9 y hasta despues de las
 * 15:30, con un minimo de accesos para que un archivo casi vacio no cuente. Un dia
 * testigo tiene solo personal y pasa de sobra; un dia cortado por el export, no.
 */
export const DIA_SEGUIR = { desde: 9 * 60, hasta: 15 * 60 + 30, minAccesos: 20 };

export type MetricaPuerta = "minutosFamilia" | "libresE2" | "salenE2" | "lleganE2" | "picoE1";

export const METRICAS_PUERTA: { clave: MetricaPuerta; titulo: string; corto: string; detalle: string; unidad: string; fuente: string }[] = [
  {
    clave: "minutosFamilia",
    titulo: "Minutos dentro por familia",
    corto: "Min. por familia",
    detalle: "papás ligados a GES que entran hasta 60 min antes de la salida de la sección del hijo por quien vienen",
    unidad: "min",
    fuente: "ZK + GES",
  },
  { clave: "libresE2", titulo: "Cajones libres en E2 de 14:35 a 15:00", corto: "Libres E2", detalle: "cupo menos lo más que hay dentro en esa franja; es un techo", unidad: "", fuente: "ZK" },
  { clave: "salenE2", titulo: "Lo más que sale por la pluma de E2 en 5 min", corto: "Salen E2 / 5 min", detalle: "de 12:30 a 16:00", unidad: "autos", fuente: "ZK" },
  { clave: "lleganE2", titulo: "Lo más que llega a E2 en 5 min", corto: "Llegan E2 / 5 min", detalle: "de 12:30 a 16:00", unidad: "autos", fuente: "ZK" },
  { clave: "picoE1", titulo: "E1 en su momento más lleno", corto: "Pico E1", detalle: "en todo el día", unidad: "autos", fuente: "ZK" },
];

export interface DiaSeguir {
  dia: string;
  fase: FaseId;
  tipo: TipoDia;
  completo: boolean;
  /** Por que no cuenta, en palabras; null si cuenta. */
  motivo: string | null;
  accesos: number;
  /** Papas ligados a GES que vinieron a recoger ese dia; los que entran al promedio. */
  familias: number;
  /** Papas sin familia en GES que salieron en la tarde: se dicen, no se reparten. */
  sinFamilia: number;
  valores: Record<MetricaPuerta, number | null>;
}

export interface Celda {
  mediana: number | null;
  min: number | null;
  max: number | null;
  /** Dias con valor. */
  n: number;
  /** Dias habiles de la fase y el tipo. */
  m: number;
}

export interface ResumenFaseTipo {
  fase: FaseId;
  tipo: TipoDia;
  habiles: string[];
  dias: DiaSeguir[];
  /** Dias completos. */
  n: number;
  m: number;
  metricas: Record<MetricaPuerta, Celda>;
}

export interface Seguimiento {
  dias: DiaSeguir[];
  resumen: ResumenFaseTipo[];
  /** false sin GES: «minutos dentro por familia» queda vacio y se dice. */
  conGes: boolean;
  cajonesE2: number;
  calendario: CalendarioVial;
}

export interface OpcionesSeguir {
  corte?: Corte | null;
  inicio?: Corte | null;
  minutoCierre?: number;
  esInstitucional?: (tarjeta: string) => boolean;
  /** Secciones de los hijos (vacio = papa sin ligar), null si no es papa. Sin esto no hay GES. */
  seccionesDeTarjeta?: ((tarjeta: string) => SeccionHijo[] | null) | null;
  cajonesE2?: number;
  calendario?: CalendarioVial;
  minAccesosDia?: number;
}

const diaDe = (e: EventoZk) => e.ocurrioEn.slice(0, 10);
const minutoDe = (e: EventoZk) => Number(e.ocurrioEn.slice(11, 13)) * 60 + Number(e.ocurrioEn.slice(14, 16));

/**
 * Lo mas que hay dentro entre dos minutos, exacto. A igual minuto salen primero y
 * entran despues (la regla del tablero): un relevo a las 14:50 no cuenta dos.
 */
function maxDentroEntre(estancias: Estancia[], desde: number, hasta: number): number {
  const marcas: { minuto: number; delta: number }[] = [];
  for (const s of estancias) marcas.push({ minuto: s.entro, delta: 1 }, { minuto: s.entro + s.dur, delta: -1 });
  marcas.sort((a, b) => a.minuto - b.minuto || a.delta - b.delta);
  // Lo que hay al empezar la franja (todas las marcas hasta `desde`, inclusive) y
  // despues cada cambio dentro de ella. Una estancia que termina justo en `desde` ya
  // no cuenta; una que empieza justo ahi, si.
  let dentro = 0;
  let i = 0;
  for (; i < marcas.length && marcas[i].minuto <= desde; i++) dentro += marcas[i].delta;
  let mejor = dentro;
  for (; i < marcas.length && marcas[i].minuto <= hasta; i++) {
    dentro += marcas[i].delta;
    if (dentro > mejor) mejor = dentro;
  }
  return mejor;
}

/** Lo mas que pasa por una pluma en una celda de `paso` minutos, dentro de la franja. */
function maxPorCelda(pasos: EventoZk[], desde: number, hasta: number, paso: number): number {
  const celdas = new Map<number, number>();
  for (const e of pasos) {
    const m = minutoDe(e);
    if (m < desde || m >= hasta + paso) continue;
    const c = desde + Math.floor((m - desde) / paso) * paso;
    celdas.set(c, (celdas.get(c) ?? 0) + 1);
  }
  let mejor = 0;
  for (const v of celdas.values()) if (v > mejor) mejor = v;
  return mejor;
}

/** Mediana, minimo y maximo de los valores que hay, y cuantos son de cuantos posibles. */
export function resumirCelda(valores: (number | null)[], m: number): Celda {
  const hay = valores.filter((v): v is number => v !== null);
  return {
    mediana: mediana(hay),
    min: hay.length ? Math.min(...hay) : null,
    max: hay.length ? Math.max(...hay) : null,
    n: hay.length,
    m,
  };
}

/**
 * Por que un dia con bitacora no cuenta, o null si cuenta. La misma regla para Seguir y
 * para el flujo: el dia del export no termino, y un archivo que empieza tarde o acaba
 * temprano no describe la tarde.
 */
function motivoDia(ok: EventoZk[], dia: string, corte: Corte | null, minutoCierre: number, minAccesos: number): string | null {
  if (corte !== null && corte.dia === dia && corte.minuto < minutoCierre) return `el archivo termina a las ${horaCorta(corte.minuto)}: el día seguía corriendo`;
  if (ok.length < minAccesos) return `solo ${ok.length} accesos`;
  const minutos = ok.map(minutoDe);
  const primero = Math.min(...minutos);
  const ultimo = Math.max(...minutos);
  if (primero > DIA_SEGUIR.desde) return `la bitácora de ese día empieza a las ${horaCorta(primero)}`;
  if (ultimo < DIA_SEGUIR.hasta) return `la bitácora de ese día termina a las ${horaCorta(ultimo)}`;
  return null;
}

const VACIO: Record<MetricaPuerta, number | null> ={ minutosFamilia: null, libresE2: null, salenE2: null, lleganE2: null, picoE1: null };

/**
 * Los cinco numeros de cada dia habil del experimento y su resumen por fase y tipo de
 * dia. Un dia sin bitacora aparece con su motivo: cuenta en «m», no en «n».
 */
export function medirSeguimiento(eventos: EventoZk[], op: OpcionesSeguir = {}): Seguimiento {
  const cal = op.calendario ?? CALENDARIO_VIAL;
  const corte = op.corte ?? null;
  const minutoCierre = op.minutoCierre ?? MINUTO_CIERRE_POR_DEFECTO;
  const cajonesE2 = op.cajonesE2 ?? CAJONES_E2_POR_DEFECTO;
  const minAccesos = op.minAccesosDia ?? DIA_SEGUIR.minAccesos;
  const seccionesDe = op.seccionesDeTarjeta ?? null;

  const { estancias } = emparejarEstancias(eventos, minutoCierre, corte, op.inicio ?? null, op.esInstitucional ?? (() => false));
  const okPorDia = new Map<string, EventoZk[]>();
  for (const e of accesos(eventos)) {
    const g = okPorDia.get(diaDe(e));
    if (g) g.push(e);
    else okPorDia.set(diaDe(e), [e]);
  }
  const estPorDia = new Map<string, Estancia[]>();
  for (const s of confirmadas(estancias)) {
    const g = estPorDia.get(s.dia);
    if (g) g.push(s);
    else estPorDia.set(s.dia, [s]);
  }

  const medirDia = (dia: string, fase: FaseId, tipo: TipoDia): DiaSeguir => {
    const ok = okPorDia.get(dia) ?? [];
    const base = { dia, fase, tipo, accesos: ok.length, familias: 0, sinFamilia: 0 };
    if (ok.length === 0) return { ...base, completo: false, motivo: "sin bitácora", valores: { ...VACIO } };

    const motivo = motivoDia(ok, dia, corte, minutoCierre, minAccesos);

    const est = estPorDia.get(dia) ?? [];
    const e2 = est.filter((s) => s.lote === "E2");
    const e1 = est.filter((s) => s.lote === "E1");
    const pluma = (lote: Lote, sentido: "entrada" | "salida") => ok.filter((e) => e.lote === lote && e.sentido === sentido);

    // Minutos dentro por familia: la regla del buscador, con la tarde de viajesPorSeccion.
    let familias = 0;
    let sinFamilia = 0;
    let suma = 0;
    if (seccionesDe) {
      for (const s of est) {
        const crudas = seccionesDe(s.tarjeta);
        if (crudas === null) continue;
        const sale = s.entro + s.dur;
        if (sale < RECOGIDA.salenDesde || sale > RECOGIDA.salenHasta || s.entro >= RECOGIDA.entranAntesDe) continue;
        const menor = SECCIONES_HIJO.find((x) => crudas.includes(x));
        if (!menor) {
          sinFamilia += 1;
          continue;
        }
        if (s.entro < horaSalidaDe(menor, fase, cal) - ANTES_DE_LA_SALIDA_MIN) continue;
        familias += 1;
        suma += s.dur;
      }
    }

    return {
      ...base,
      familias,
      sinFamilia,
      completo: motivo === null,
      motivo,
      valores: {
        minutosFamilia: familias > 0 ? suma / familias : null,
        libresE2: cajonesE2 - maxDentroEntre(e2, LIBRES_E2.desde, LIBRES_E2.hasta),
        salenE2: maxPorCelda(pluma("E2", "salida"), SALIDA_DESDE, SALIDA_HASTA, SALIDA_PASO),
        lleganE2: maxPorCelda(pluma("E2", "entrada"), SALIDA_DESDE, SALIDA_HASTA, SALIDA_PASO),
        picoE1: maxDentroEntre(e1, 0, 24 * 60),
      },
    };
  };

  const dias: DiaSeguir[] = [];
  const resumen: ResumenFaseTipo[] = [];
  for (const fase of FASES) {
    for (const { clave: tipo } of TIPOS_DIA) {
      const habiles = diasHabilesDe(fase, tipo, cal);
      const deLaFase = habiles.map((d) => medirDia(d, fase, tipo));
      dias.push(...deLaFase);
      const completos = deLaFase.filter((d) => d.completo);
      const metricas = Object.fromEntries(
        METRICAS_PUERTA.map((m) => [m.clave, resumirCelda(completos.map((d) => d.valores[m.clave]), habiles.length)]),
      ) as Record<MetricaPuerta, Celda>;
      resumen.push({ fase, tipo, habiles, dias: deLaFase, n: completos.length, m: habiles.length, metricas });
    }
  }
  return { dias, resumen, conGes: seccionesDe !== null, cajonesE2, calendario: cal };
}

/* ------------------------------------------------------------------ el flujo de la tarde */

// LA TARDE COMO UNA FILA (6-nov-2026). A la salida llegan autos, se guardan en E2 y E1,
// y se van cuando sale la seccion por la que vinieron. Es un sistema de colas con
// almacenamiento, y se lee con dos figuras de ingenieria de transito:
//
//   - Las CURVAS ACUMULADAS: autos que han entrado a E2 desde las 12:00 (con los que ya
//     estaban) y autos que han salido. La distancia vertical entre las dos son los que
//     estan dentro; la curva «salieron + cupo» es el tope. Cuando la de entradas la toca,
//     E2 esta lleno y el siguiente auto se queda afuera, donde ninguna pluma lo ve.
//   - La CUENTA autos dentro = llegan por minuto × minutos que se queda cada uno (ley de
//     Little). No es una prediccion: es conservacion. Sirve para decir que solo hay tres
//     palancas: que no lleguen juntos, que se queden menos, o mas lugar (el personal a E1).
//
// Se mide con los dias habiles de lunes a jueves con la tarde completa en la ventana que
// bajo la pestana, fuera de los testigos. Las curvas cuentan cada paso por la pluma; lo
// demas, solo estancias con entrada y salida leidas (por eso dan un poco menos).

/** Con que salida se va un auto en la tarde: la seccion del hijo mayor, el personal u otros. */
export type GrupoSalida = "comunidad" | "preescolar" | "primaria" | "secprepa" | "personal" | "otros";
export const GRUPOS_SALIDA: { clave: GrupoSalida; titulo: string; color: string }[] = [
  { clave: "personal", titulo: "personal", color: "#5b6b82" },
  { clave: "secprepa", titulo: "secundaria y prepa", color: "#eb6834" },
  { clave: "primaria", titulo: "primaria", color: "#1baf7a" },
  { clave: "preescolar", titulo: "preescolar", color: "#eda100" },
  { clave: "comunidad", titulo: "comunidad infantil", color: "#e87ba4" },
  { clave: "otros", titulo: "otros y sin ligar", color: "#c9d1dc" },
];
/** De las secciones de los hijos (en cualquier orden) al grupo de su salida: la del mayor. */
export function grupoDeSecciones(secciones: SeccionHijo[]): GrupoSalida {
  const mayor = [...SECCIONES_HIJO].reverse().find((x) => secciones.includes(x));
  if (!mayor) return "otros";
  return mayor === "secundaria" || mayor === "preparatoria" ? "secprepa" : mayor;
}

export const FLUJO = { desde: 12 * 60, hasta: 16 * 60, paso: 5, tablaDesde: 13 * 60 + 30, tablaHasta: 15 * 60 + 30 };
/** La ventana en que llegan los papas a recoger: la cuenta del sistema se hace con ella. */
export const RECOGE = { desde: 13 * 60 + 30, hasta: 14 * 60 + 50 };
const A_LAS_1430 = 14 * 60 + 30;
const A_LAS_1440 = 14 * 60 + 40;

export interface PuntoAcumulado { minuto: number; llegaron: number; salieron: number }
export interface FilaTarde { minuto: number; llegan: number; salen: number; salenPor: Partial<Record<GrupoSalida, number>> }
export interface Flujo {
  /** Los dias con que se midio: lunes a jueves, tarde completa, sin testigos. */
  dias: string[];
  cupoE2: number;
  cupoE1: number;
  acumuladas: PuntoAcumulado[];
  masLleno: { minuto: number; dentro: number; libres: number };
  /** Lo que ven las estancias completas en ese mismo minuto: la diferencia son lecturas incompletas. */
  completasEnMasLleno: number;
  tarde: FilaTarde[];
  picoLlegan: number;
  picoSalen: number;
  /** Quien esta dentro a las 14:40, por grupo, promedio por dia. */
  dentro1440: Record<"E1" | "E2", Partial<Record<GrupoSalida, number>>>;
  /** La cuenta del sistema; null sin GES. */
  sistema: null | {
    /** Papas que entran a E2 a recoger entre RECOGE.desde y RECOGE.hasta, por dia. */
    llegan: number;
    cadaMin: number;
    porMinuto: number;
    minutosDentro: number | null;
    papasA1430: number;
    /** De los autos de papas ligados que recogen, que parte tiene hijos en mas de una seccion. */
    conHermanos: number;
  };
}

export interface OpcionesFlujo {
  corte?: Corte | null;
  inicio?: Corte | null;
  minutoCierre?: number;
  esInstitucional?: (tarjeta: string) => boolean;
  /** Con que salida se va cada tarjeta; sin GES, todo lo que no es personal va a «otros». */
  grupoDe: (tarjeta: string) => GrupoSalida;
  /** Secciones de los hijos (vacio = papa sin ligar), null si no es papa. null = sin GES. */
  seccionesDeTarjeta?: ((tarjeta: string) => SeccionHijo[] | null) | null;
  cupoE2?: number;
  cupoE1?: number;
  calendario?: CalendarioVial;
  minAccesosDia?: number;
}

const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** El flujo de la tarde de un dia tipico de lunes a jueves; null si no hay ningun dia completo. */
export function medirFlujo(eventos: EventoZk[], op: OpcionesFlujo): Flujo | null {
  const cal = op.calendario ?? CALENDARIO_VIAL;
  const corte = op.corte ?? null;
  const minutoCierre = op.minutoCierre ?? MINUTO_CIERRE_POR_DEFECTO;
  const cupoE2 = op.cupoE2 ?? CAJONES_E2_POR_DEFECTO;
  const cupoE1 = op.cupoE1 ?? 80;
  const minAccesos = op.minAccesosDia ?? DIA_SEGUIR.minAccesos;
  const seccionesDe = op.seccionesDeTarjeta ?? null;

  const ok = accesos(eventos);
  const okPorDia = new Map<string, EventoZk[]>();
  for (const e of ok) {
    const g = okPorDia.get(diaDe(e));
    if (g) g.push(e);
    else okPorDia.set(diaDe(e), [e]);
  }
  const dias = [...okPorDia.keys()].sort().filter((d) =>
    tipoDiaDe(d) === "LJ" && !cal.testigo.includes(d) && !cal.sinClases.includes(d) && motivoDia(okPorDia.get(d)!, d, corte, minutoCierre, minAccesos) === null);
  if (dias.length === 0) return null;
  const idx = new Map(dias.map((d, i) => [d, i]));
  const n = dias.length;

  const { estancias } = emparejarEstancias(eventos, minutoCierre, corte, op.inicio ?? null, op.esInstitucional ?? (() => false));
  const todas = estancias.filter((s) => idx.has(s.dia));
  const completas = confirmadas(todas);

  // Las curvas, con los que ya estaban a las 12:00 (toda estancia, aunque le falte un extremo).
  const minutos: number[] = [];
  for (let m = FLUJO.desde; m <= FLUJO.hasta; m += FLUJO.paso) minutos.push(m);
  const celda = (m: number) => FLUJO.desde + Math.floor((m - FLUJO.desde) / FLUJO.paso) * FLUJO.paso;
  const entran = new Map<number, number[]>();
  const salen = new Map<number, number[]>();
  for (const m of minutos) {
    entran.set(m, new Array<number>(n).fill(0));
    salen.set(m, new Array<number>(n).fill(0));
  }
  for (const e of ok) {
    const i = idx.get(diaDe(e));
    if (i === undefined || e.lote !== "E2" || e.sentido === null) continue;
    const m = minutoDe(e);
    if (m < FLUJO.desde || m >= FLUJO.hasta + FLUJO.paso) continue;
    (e.sentido === "entrada" ? entran : salen).get(celda(m))![i] += 1;
  }
  const yaEstaban = new Array<number>(n).fill(0);
  for (const s of todas) if (s.lote === "E2" && s.entro <= FLUJO.desde && s.entro + s.dur > FLUJO.desde) yaEstaban[idx.get(s.dia)!] += 1;
  const acumuladas: PuntoAcumulado[] = [];
  let A = promedio(yaEstaban);
  let D = 0;
  for (const m of minutos) {
    acumuladas.push({ minuto: m, llegaron: A, salieron: D });
    A += promedio(entran.get(m)!);
    D += promedio(salen.get(m)!);
  }
  const top = acumuladas.reduce((a, p) => (p.llegaron - p.salieron > a.llegaron - a.salieron ? p : a));
  const masLleno = { minuto: top.minuto, dentro: top.llegaron - top.salieron, libres: cupoE2 - (top.llegaron - top.salieron) };
  const dentroEn = (lote: Lote, m: number) => completas.filter((s) => s.lote === lote && s.entro <= m && s.entro + s.dur > m);
  const completasEnMasLleno = dentroEn("E2", masLleno.minuto).length / n;

  // La tarde cada 5 minutos: mediana entre dias de lo que pasa por la pluma, y con que salida se van.
  const tarde: FilaTarde[] = [];
  for (const m of minutos.filter((x) => x >= FLUJO.tablaDesde && x <= FLUJO.tablaHasta)) {
    const salenPor: Partial<Record<GrupoSalida, number>> = {};
    for (const s of completas) {
      if (s.lote !== "E2" || celda(s.entro + s.dur) !== m) continue;
      const g = op.grupoDe(s.tarjeta);
      salenPor[g] = (salenPor[g] ?? 0) + 1 / n;
    }
    tarde.push({ minuto: m, llegan: mediana(entran.get(m)!) ?? 0, salen: mediana(salen.get(m)!) ?? 0, salenPor });
  }
  const picoLlegan = tarde.reduce((a, t) => (t.llegan > a.llegan ? t : a)).minuto;
  const picoSalen = tarde.reduce((a, t) => (t.salen > a.salen ? t : a)).minuto;

  const porGrupo = (lote: Lote) => {
    const o: Partial<Record<GrupoSalida, number>> = {};
    for (const s of dentroEn(lote, A_LAS_1440)) {
      const g = op.grupoDe(s.tarjeta);
      o[g] = (o[g] ?? 0) + 1 / n;
    }
    return o;
  };

  let sistema: Flujo["sistema"] = null;
  if (seccionesDe) {
    let llegan = 0, ligados = 0, conHermanos = 0, sumaFam = 0, nFam = 0, papas1430 = 0;
    for (const s of completas) {
      const crudas = seccionesDe(s.tarjeta);
      if (crudas === null || s.lote !== "E2") continue;
      const sale = s.entro + s.dur;
      if (s.entro <= A_LAS_1430 && sale > A_LAS_1430) papas1430 += 1;
      if (sale < RECOGIDA.salenDesde || sale > RECOGIDA.salenHasta) continue;
      if (s.entro >= RECOGE.desde && s.entro < RECOGE.hasta) llegan += 1;
      const menor = SECCIONES_HIJO.find((x) => crudas.includes(x));
      if (!menor) continue;
      ligados += 1;
      if (new Set(crudas).size > 1) conHermanos += 1;
      if (s.entro >= horaSalidaDe(menor, "antes", cal) - ANTES_DE_LA_SALIDA_MIN && s.entro < RECOGIDA.entranAntesDe) {
        sumaFam += s.dur;
        nFam += 1;
      }
    }
    const porDia = llegan / n;
    sistema = {
      llegan: porDia,
      cadaMin: porDia > 0 ? (RECOGE.hasta - RECOGE.desde) / porDia : 0,
      porMinuto: porDia / (RECOGE.hasta - RECOGE.desde),
      minutosDentro: nFam ? sumaFam / nFam : null,
      papasA1430: papas1430 / n,
      conHermanos: ligados ? conHermanos / ligados : 0,
    };
  }

  return {
    dias, cupoE2, cupoE1, acumuladas, masLleno, completasEnMasLleno, tarde, picoLlegan, picoSalen,
    dentro1440: { E2: porGrupo("E2"), E1: porGrupo("E1") }, sistema,
  };
}
