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

const VACIO: Record<MetricaPuerta, number | null> = { minutosFamilia: null, libresE2: null, salenE2: null, lleganE2: null, picoE1: null };

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

    const minutos = ok.map(minutoDe);
    const primero = Math.min(...minutos);
    const ultimo = Math.max(...minutos);
    let motivo: string | null = null;
    if (corte !== null && corte.dia === dia && corte.minuto < minutoCierre) motivo = `el archivo termina a las ${horaCorta(corte.minuto)}: el día seguía corriendo`;
    else if (ok.length < minAccesos) motivo = `solo ${ok.length} accesos`;
    else if (primero > DIA_SEGUIR.desde) motivo = `la bitácora de ese día empieza a las ${horaCorta(primero)}`;
    else if (ultimo < DIA_SEGUIR.hasta) motivo = `la bitácora de ese día termina a las ${horaCorta(ultimo)}`;

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
