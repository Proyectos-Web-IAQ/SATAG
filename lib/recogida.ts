// Por quien viene cada auto (28-oct-2026).
//
// EL HUECO QUE CIERRA. La medicion del estacionamiento agrupa por el departamento de
// ZK, y ahi todos los papas caen en «Padres de familia»: dos mil TAGs en una sola
// fila. Pero a la salida lo que importa no es que sean papas sino POR QUIEN VIENEN:
// el de primaria recoge a las 14:15 y se va; el de secundaria espera hasta las
// 14:45; el que tiene hijos en las dos secciones entra temprano y sale con el
// mayor. Esa es la poblacion que forma la fila de la tarde, y hasta hoy SATAG no
// la distinguia.
//
// DE DONDE SALE LA SECCION. De GES, con la regla que ya rige en el panel: quien
// tiene el TAG lo dice ZK, quien es la persona lo dice GES (lib/personas/
// identificar.ts). Los grupos de los hijos (`ges_personas.grupos` del tutor) se
// traducen a seccion con los codigos de GES, confirmados por Gerardo el 28-oct:
//
//   LAC, CIA, CIB     comunidad infantil (lactantes y maternal)
//   K1..K3, PFA..PFC  preescolar (PF = pre-first, el año de ingles antes de primaria)
//   P1..P6            primaria
//   S1..S3            secundaria
//   101..503          preparatoria (numericos)
//
// Esta capa es pura: recibe los padrones y el indice de GES, y devuelve por
// tarjeta una etiqueta («Padres de primaria y secundaria») y un grupo de cinco
// para la grafica. No consulta nada y no guarda datos personales.

import { identificar, type IdentidadDecidida, type IndiceGes } from "@/lib/personas/identificar";
import {
  GRUPO_ADMON,
  GRUPO_EMPLEADO_PPF,
  GRUPO_INSTITUCIONAL,
  SIN_CLASIFICAR,
  grupoDeDepto,
  grupoDeExpediente,
  nombreDepto,
  type PersonaZk,
} from "@/lib/zk/padron";
import {
  MINUTO_CIERRE_POR_DEFECTO,
  accesos,
  clasificarDias,
  confirmadas,
  cuantil,
  emparejarEstancias,
  type Corte,
  type Estancia,
} from "@/lib/estacionamiento";
import type { EventoZk, Lote } from "@/lib/zk/eventos";

/* ------------------------------------------------------------------ secciones */

export type SeccionHijo = "comunidad" | "preescolar" | "primaria" | "secundaria" | "preparatoria";

/** En orden de edad: la ultima de una familia es la que fija su hora de salida. */
export const SECCIONES_HIJO: SeccionHijo[] = ["comunidad", "preescolar", "primaria", "secundaria", "preparatoria"];

export const NOMBRE_SECCION: Record<SeccionHijo, string> = {
  comunidad: "comunidad infantil",
  preescolar: "preescolar",
  primaria: "primaria",
  secundaria: "secundaria",
  preparatoria: "preparatoria",
};

/** La seccion de un codigo de grupo de GES; null si no se reconoce. */
export function seccionDeGrupo(grupo: string): SeccionHijo | null {
  const g = grupo.trim().toUpperCase();
  if (g === "") return null;
  if (/^[0-9]+$/.test(g)) return "preparatoria";
  if (/^(LAC|CI)/.test(g)) return "comunidad";
  if (/^(K[1-3]|PF)/.test(g)) return "preescolar";
  if (/^P[1-6]/.test(g)) return "primaria";
  if (/^S[1-3]/.test(g)) return "secundaria";
  return null;
}

/** Las secciones de una familia, sin repetir y de menor a mayor. */
export function seccionesDe(grupos: string[]): SeccionHijo[] {
  const hay = new Set<SeccionHijo>();
  for (const g of grupos) {
    const s = seccionDeGrupo(g);
    if (s) hay.add(s);
  }
  return SECCIONES_HIJO.filter((s) => hay.has(s));
}

/** «primaria», «preescolar y primaria», «primaria, secundaria y preparatoria». */
export function nombrarSecciones(secciones: SeccionHijo[]): string {
  const n = secciones.map((s) => NOMBRE_SECCION[s]);
  if (n.length <= 1) return n[0] ?? "";
  return `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
}

/* ------------------------------------------------------------------ los cinco grupos */

/**
 * Los grupos de la grafica de la salida. Cinco, porque la paleta declarada en
 * app/globals.css tiene cinco lugares y el quinto es el residuo. Secundaria y
 * preparatoria van juntas: salen a la misma hora y la pregunta de la tarde es
 * «quien espera hasta las 14:45», no cual de las dos.
 */
export type GrupoRecogida = "primaria" | "secprepa" | "hermanos" | "personal" | "otros";

export const GRUPOS_RECOGIDA: { clave: GrupoRecogida; titulo: string; prosa: string; color: 1 | 2 | 3 | 4 | 5 }[] = [
  // El orden es el de apilado y el de la leyenda. Los colores van en este orden
  // porque es el que el validador de la paleta acepta para los pares vecinos
  // (naranja-verde, verde-morado, morado-azul, azul-gris); el verde-morado queda en
  // la banda baja y por eso cada tramo lleva rotulo y la tabla hermana trae la cifra.
  // `prosa` es como se dice dentro de una frase: «32 son papás de primaria y menores».
  { clave: "primaria", titulo: "Padres: primaria y menores", prosa: "papás de primaria y menores", color: 2 },
  { clave: "secprepa", titulo: "Padres: solo secundaria o preparatoria, y alumnos que manejan", prosa: "papás de solo secundaria o preparatoria (y alumnos que manejan)", color: 3 },
  { clave: "hermanos", titulo: "Padres: hijos en varias secciones", prosa: "familias con hijos en varias secciones", color: 4 },
  { clave: "personal", titulo: "Personal", prosa: "del personal", color: 1 },
  { clave: "otros", titulo: "Otros y sin ligar a GES", prosa: "de otros o sin ligar a GES", color: 5 },
];

export interface Recogida {
  /** La fila de «Secciones»: el departamento de ZK para el personal, «Padres de …» para los papas. */
  etiqueta: string;
  grupo: GrupoRecogida;
  /** Las secciones de sus hijos; vacio si no viene por nadie o no se sabe. */
  secciones: SeccionHijo[];
  /** Para la ficha y las lecturas: «primaria y secundaria». null si no aplica. */
  vienePor: string | null;
  /** true para los papas, ligados a GES o no: son la poblacion de «por seccion». */
  esPapa: boolean;
}

export const SIN_FAMILIA = "sin familia en GES";
export const ALUMNOS_QUE_MANEJAN = "Alumnos que manejan";

const PERSONAL = new Set(["Personal docente", "Administración y servicios", GRUPO_ADMON, GRUPO_EMPLEADO_PPF]);

/**
 * Clasifica una tarjeta. `grupoBase` es el grupo de cinco del padron (grupoDeDepto o
 * grupoDeExpediente); `deptoZk`, el nombre del departamento en ZK si esta en el
 * padron; `grupos`, los de la familia de GES si se le encontro una (null si no).
 */
export function clasificarRecogida(p: {
  grupoBase: string;
  deptoZk: string | null;
  grupos: string[] | null;
  esAlumno: boolean;
}): Recogida {
  if (PERSONAL.has(p.grupoBase)) {
    return { etiqueta: p.deptoZk || p.grupoBase, grupo: "personal", secciones: [], vienePor: null, esPapa: false };
  }
  if (p.grupoBase === GRUPO_INSTITUCIONAL) {
    return { etiqueta: GRUPO_INSTITUCIONAL, grupo: "otros", secciones: [], vienePor: null, esPapa: false };
  }
  if (p.esAlumno) {
    return { etiqueta: ALUMNOS_QUE_MANEJAN, grupo: "secprepa", secciones: ["preparatoria"], vienePor: null, esPapa: false };
  }
  if (p.grupos !== null) {
    const secciones = seccionesDe(p.grupos);
    if (secciones.length === 0) {
      return { etiqueta: `Padres de familia · sin grupos en GES`, grupo: "otros", secciones, vienePor: null, esPapa: true };
    }
    const mayor = secciones[secciones.length - 1];
    const grupo: GrupoRecogida =
      mayor === "secundaria" || mayor === "preparatoria" ? (secciones.length === 1 ? "secprepa" : "hermanos") : "primaria";
    const nombre = nombrarSecciones(secciones);
    return { etiqueta: `Padres de ${nombre}`, grupo, secciones, vienePor: nombre, esPapa: true };
  }
  // Sin familia en GES: se queda con el nombre que ya tenia, y se dice que no se ligo.
  const base = p.deptoZk || (p.grupoBase === SIN_CLASIFICAR ? "" : p.grupoBase);
  return {
    etiqueta: base ? `${base} · ${SIN_FAMILIA}` : SIN_CLASIFICAR,
    grupo: "otros",
    secciones: [],
    vienePor: null,
    // Quien esta en un padron como papa pero no se ligo sigue siendo papa: va en «sin ligar».
    esPapa: p.grupoBase !== SIN_CLASIFICAR,
  };
}

export interface ExpedienteParaRecogida {
  nombre: string;
  tipoUsuario: string;
  areaAdmin: string | null;
}

/**
 * Por quien viene cada tarjeta de los dos padrones. La identidad sale de GES con la
 * misma funcion que usa la ficha (`identificar`): la decision de TI manda, y si no
 * la hay, el cruce estricto por nombre con los nombres de SATAG y de ZK.
 */
export function indexarRecogida(p: {
  personas: Map<string, PersonaZk> | null;
  expedientes: Map<string, ExpedienteParaRecogida>;
  indice: IndiceGes;
  decisiones: Map<string, IdentidadDecidida>;
}): Map<string, Recogida> {
  const out = new Map<string, Recogida>();
  const tarjetas = new Set<string>([...(p.personas?.keys() ?? []), ...p.expedientes.keys()]);
  for (const t of tarjetas) {
    const zk = p.personas?.get(t);
    const e = p.expedientes.get(t);
    const grupoBase = zk
      ? grupoDeDepto(zk.departamentoId, zk.departamento)
      : e
        ? (grupoDeExpediente(e.tipoUsuario, e.areaAdmin) ?? SIN_CLASIFICAR)
        : SIN_CLASIFICAR;
    // «Ex alumnos» tambien es grupo Alumnos en el catalogo, pero un exalumno que
    // abre la pluma viene por sus hermanos: se cruza con GES como cualquier papa.
    const esAlumno = (zk ? nombreDepto(zk.departamento) === "ALUMNOS" : false) || e?.tipoUsuario === "alumno";
    let grupos: string[] | null = null;
    if (!PERSONAL.has(grupoBase) && grupoBase !== GRUPO_INSTITUCIONAL && !esAlumno) {
      const i = identificar({ nombres: [zk?.nombre, e?.nombre], tarjetas: [t] }, p.indice, p.decisiones);
      if (i.familia) grupos = i.familia.grupos;
    }
    out.set(t, clasificarRecogida({ grupoBase, deptoZk: zk?.departamento || null, grupos, esAlumno }));
  }
  return out;
}

/* ------------------------------------------------------------------ la salida, por grupo */

/** La ventana de la tarde, en minutos del dia, y el paso de la reja. */
export const SALIDA_DESDE = 12 * 60 + 30;
export const SALIDA_HASTA = 16 * 60;
export const SALIDA_PASO = 5;

export interface Cuartiles {
  p25: number;
  p50: number;
  p75: number;
}

/** Una serie por clave: el grupo de cinco en la grafica apilada, o la etiqueta fina en el detalle. */
export interface SerieRecogida<K extends string = GrupoRecogida> {
  clave: K;
  /** Mediana entre dias de cuantos coches de esta clave habia dentro a cada minuto de la reja. */
  dentro: number[];
  /** Mediana entre dias de cuantos salieron en los `SALIDA_PASO` minutos que empiezan en cada punto. */
  salen: number[];
  /** Lo mismo, de los que entraron. */
  entran: number[];
  /**
   * LA POBLACION DE LA TARDE: las estancias que terminan dentro de la ventana, en
   * los dias comparables. `autosPorDia` es cuantas por dia (promedio); `entra` y
   * `sale` son los cuartiles del minuto en que entraron y salieron, para decir
   * «entran 14:05–14:20, salen 14:15–14:35». null si nadie de esta clave se va en
   * la tarde.
   */
  autosPorDia: number;
  entra: Cuartiles | null;
  sale: Cuartiles | null;
}

/** Un estacionamiento, o los dos juntos. */
export type Alcance = Lote | "ambos";

export interface SalidaPorClave<K extends string = GrupoRecogida> {
  minutos: number[];
  /** Cuantos dias entran en la mediana. */
  dias: number;
  /** E1, E2 y «ambos», cada uno medido sobre sus propias estancias (no es la suma de los otros dos). */
  porLote: { lote: Alcance; series: SerieRecogida<K>[]; maxDentro: number }[];
}

export type SalidaPorGrupo = SalidaPorClave<GrupoRecogida>;

const diaDe = (e: EventoZk) => e.ocurrioEn.slice(0, 10);
const esFinDeSemana = (dia: string) => {
  const d = new Date(`${dia}T12:00:00`).getDay();
  return d === 0 || d === 6;
};

/**
 * Quien esta dentro, quien entra y quien sale a cada minuto de la tarde, por grupo y
 * por estacionamiento, como mediana entre los dias habiles comparables.
 *
 * Es la grafica que convierte «el estacionamiento se llena a las 14:30» en «se llena
 * de papas de primaria, que a las 14:40 ya se fueron; a las 15:00 lo que sale es el
 * personal». Solo estancias con entrada y salida leidas, igual que las curvas del
 * tablero. OJO: la mediana se toma POR GRUPO, asi que la suma de los tramos no es la
 * mediana del total; es «un dia tipico de cada grupo», y asi se rotula.
 */
export interface OpcionesSalida {
  corte?: Corte | null;
  inicio?: Corte | null;
  minutoCierre?: number;
  esInstitucional?: (tarjeta: string) => boolean;
}

/**
 * La tarde por clave. `claves` fija el orden y conserva las vacias (la grafica
 * apilada quiere sus cinco grupos siempre); con null, las claves son las que
 * aparezcan entre quienes se van en la tarde: asi el detalle lista cada seccion y
 * cada combinacion que de verdad existe, sin inventar filas.
 */
export function salidaPorClave<K extends string>(
  eventos: EventoZk[],
  claveDe: (tarjeta: string) => K,
  claves: K[] | null,
  op: OpcionesSalida = {},
): SalidaPorClave<K> {
  const ok = accesos(eventos);
  const dias = [...new Set(ok.map(diaDe))].sort();
  const corte = op.corte ?? null;
  const { estancias } = emparejarEstancias(eventos, op.minutoCierre ?? MINUTO_CIERRE_POR_DEFECTO, corte, op.inicio ?? null, op.esInstitucional ?? (() => false));
  const comparables = clasificarDias(ok, dias, corte).comparables.filter((d) => !esFinDeSemana(d));
  const esComparable = new Set(comparables);
  const minutos: number[] = [];
  for (let m = SALIDA_DESDE; m <= SALIDA_HASTA; m += SALIDA_PASO) minutos.push(m);
  const enLaTarde = (s: Estancia) => s.entro + s.dur >= SALIDA_DESDE && s.entro + s.dur <= SALIDA_HASTA;

  const porLote = (["E1", "E2", "ambos"] as Alcance[]).map((lote) => {
    const delLote = confirmadas(lote === "ambos" ? estancias : estancias.filter((s) => s.lote === lote)).filter((s) => esComparable.has(s.dia));
    const presentes = claves ?? [...new Set(delLote.filter(enLaTarde).map((s) => claveDe(s.tarjeta)))];
    const series = presentes.map((clave) => {
      const propias = delLote.filter((s) => claveDe(s.tarjeta) === clave);
      // Un dia = una fila por minuto; la mediana se toma columna por columna.
      const porDia = comparables.map((d) => curvaDelDia(propias.filter((s) => s.dia === d), minutos));
      const mediana = (campo: "dentro" | "salen" | "entran") =>
        minutos.map((_, i) => Math.round(cuantil(porDia.map((c) => c[campo][i]), 0.5) ?? 0));
      const tarde = propias.filter(enLaTarde);
      return {
        clave,
        dentro: mediana("dentro"),
        salen: mediana("salen"),
        entran: mediana("entran"),
        autosPorDia: comparables.length > 0 ? Math.round((tarde.length / comparables.length) * 10) / 10 : 0,
        entra: cuartilesDe(tarde.map((s) => s.entro)),
        sale: cuartilesDe(tarde.map((s) => s.entro + s.dur)),
      };
    });
    const maxDentro = Math.max(0, ...minutos.map((_, i) => series.reduce((a, s) => a + s.dentro[i], 0)));
    return { lote, series, maxDentro };
  });
  return { minutos, dias: comparables.length, porLote };
}

function cuartilesDe(valores: number[]): Cuartiles | null {
  if (valores.length === 0) return null;
  return {
    p25: Math.round(cuantil(valores, 0.25) ?? 0),
    p50: Math.round(cuantil(valores, 0.5) ?? 0),
    p75: Math.round(cuantil(valores, 0.75) ?? 0),
  };
}

/** Los cinco grupos de la grafica apilada: siempre los cinco y en su orden. */
export function salidaPorGrupo(eventos: EventoZk[], grupoDe: (tarjeta: string) => GrupoRecogida, op: OpcionesSalida = {}): SalidaPorGrupo {
  return salidaPorClave(eventos, grupoDe, GRUPOS_RECOGIDA.map((g) => g.clave), op);
}

/* ------------------------------------------------------------------ viajes por seccion */

/**
 * LA TABLA CENTRAL (29-oct-2026). Para cada seccion, a que hora entran y a que hora
 * salen los papas que vienen por ella, y hasta que hijo se quedan. Es la que Gerardo
 * señalo como la de mayor impacto en el mapa de Analisis Vial, y aqui se calcula igual:
 *
 * - Un papa va con la seccion de SUS hijos: una familia con hijos en preescolar y
 *   secundaria cuenta en las dos secciones.
 * - Dentro de cada seccion, la fila es la seccion MAYOR de la familia. En la tarde es
 *   «hasta que seccion se quedan», porque la mayor fija la salida; en la mañana no hay
 *   salida que esperar y la fila dice «con que hijos vienen».
 * - Solo viajes con entrada y salida leidas, en los dias habiles comparables; cada
 *   viaje pesa 1/dias, asi que todo son «autos al dia».
 * - Tarde = recoger: salen entre 13:00 y 16:00 y entraron antes de 15:40; la entrada
 *   se recorta a las 12:00 para que una jornada completa no estire «entran». Mañana =
 *   dejar: entran entre 06:00 y 09:30; la salida se recorta a las 20:00.
 * - «Dentro» lleva la mitad central ademas de la mediana a proposito: en la mañana los
 *   papas sin ligar marcan 30 min de mediana y 470 de p75, y eso es lo que delata a un
 *   TAG de personal en el departamento de padres.
 */
export type Momento = "tarde" | "manana";

/** La franja que dibuja cada momento. */
export const FRANJA_VIAJE: Record<Momento, { desde: number; hasta: number }> = {
  tarde: { desde: 12 * 60 + 30, hasta: 16 * 60 },
  manana: { desde: 6 * 60, hasta: 10 * 60 },
};

const TARDE = { salenDesde: 13 * 60, salenHasta: 16 * 60, entranAntesDe: 15 * 60 + 40, recorteEntrada: 12 * 60 };
const MANANA = { entranDesde: 6 * 60, entranHasta: 9 * 60 + 30, recorteSalida: 20 * 60 };

export interface FilaViaje {
  /** La seccion mayor de la familia; null en «sin ligar», donde no se sabe. */
  mayor: SeccionHijo | null;
  autosPorDia: number;
  /** Que parte de la seccion es esta fila, de 0 a 1. */
  parte: number;
  entra: Cuartiles;
  sale: Cuartiles;
  /** Minutos dentro: mediana y mitad central. */
  dentro: Cuartiles;
}

export interface ViajesSeccion {
  /** La seccion, o «sin» para los papas sin familia en GES. */
  seccion: SeccionHijo | "sin";
  autosPorDia: number;
  /** Cuantos al dia tienen ademas un hijo en una seccion mayor: se quedan hasta el, o lo traen tambien. */
  conMayor: number;
  filas: FilaViaje[];
}

export interface ViajesPorSeccion {
  momento: Momento;
  dias: number;
  porLote: { lote: Alcance; secciones: ViajesSeccion[] }[];
}

interface ViajeSeccion {
  lote: Lote;
  entra: number;
  sale: number;
  secciones: SeccionHijo[];
}

/**
 * `seccionesDeTarjeta` devuelve las secciones de los hijos (vacio = papa sin ligar a
 * GES) o null si la tarjeta no es de un papa: personal, alumnos e institucionales no
 * entran aqui.
 */
export function viajesPorSeccion(
  eventos: EventoZk[],
  seccionesDeTarjeta: (tarjeta: string) => SeccionHijo[] | null,
  momento: Momento,
  op: OpcionesSalida = {},
): ViajesPorSeccion {
  const ok = accesos(eventos);
  const dias = [...new Set(ok.map(diaDe))].sort();
  const corte = op.corte ?? null;
  const { estancias } = emparejarEstancias(eventos, op.minutoCierre ?? MINUTO_CIERRE_POR_DEFECTO, corte, op.inicio ?? null, op.esInstitucional ?? (() => false));
  const comparables = clasificarDias(ok, dias, corte).comparables.filter((d) => !esFinDeSemana(d));
  const esComparable = new Set(comparables);
  const n = comparables.length;

  const viajes: ViajeSeccion[] = [];
  for (const s of confirmadas(estancias)) {
    if (!esComparable.has(s.dia)) continue;
    const secciones = seccionesDeTarjeta(s.tarjeta);
    if (secciones === null) continue;
    const sale = s.entro + s.dur;
    if (momento === "tarde") {
      if (sale < TARDE.salenDesde || sale > TARDE.salenHasta || s.entro >= TARDE.entranAntesDe) continue;
      viajes.push({ lote: s.lote, entra: Math.max(s.entro, TARDE.recorteEntrada), sale, secciones });
    } else {
      if (s.entro < MANANA.entranDesde || s.entro > MANANA.entranHasta) continue;
      viajes.push({ lote: s.lote, entra: s.entro, sale: Math.min(sale, MANANA.recorteSalida), secciones });
    }
  }
  const mayorDe = (v: ViajeSeccion) => v.secciones[v.secciones.length - 1];

  const porLote = (["E1", "E2", "ambos"] as Alcance[]).map((lote) => {
    const propios = lote === "ambos" ? viajes : viajes.filter((v) => v.lote === lote);
    const secciones: ViajesSeccion[] = [];
    for (const S of SECCIONES_HIJO) {
      const deLaSeccion = propios.filter((v) => v.secciones.includes(S));
      if (deLaSeccion.length === 0) continue;
      const filas = SECCIONES_HIJO.map((mayor) => deLaSeccion.filter((v) => mayorDe(v) === mayor))
        .filter((f) => f.length > 0)
        .map((f) => filaDe(mayorDe(f[0]), f, deLaSeccion.length, n));
      secciones.push({
        seccion: S,
        autosPorDia: porDia(deLaSeccion.length, n),
        conMayor: porDia(deLaSeccion.filter((v) => mayorDe(v) !== S).length, n),
        filas,
      });
    }
    const sin = propios.filter((v) => v.secciones.length === 0);
    if (sin.length > 0) secciones.push({ seccion: "sin", autosPorDia: porDia(sin.length, n), conMayor: 0, filas: [filaDe(null, sin, sin.length, n)] });
    return { lote, secciones };
  });
  return { momento, dias: n, porLote };
}

const porDia = (cuantos: number, dias: number) => (dias > 0 ? Math.round((cuantos / dias) * 10) / 10 : 0);

function filaDe(mayor: SeccionHijo | null, v: { entra: number; sale: number }[], total: number, dias: number): FilaViaje {
  const q = (xs: number[]): Cuartiles => ({
    p25: Math.round(cuantil(xs, 0.25) ?? 0),
    p50: Math.round(cuantil(xs, 0.5) ?? 0),
    p75: Math.round(cuantil(xs, 0.75) ?? 0),
  });
  return {
    mayor,
    autosPorDia: porDia(v.length, dias),
    parte: total > 0 ? v.length / total : 0,
    entra: q(v.map((x) => x.entra)),
    sale: q(v.map((x) => x.sale)),
    dentro: q(v.map((x) => x.sale - x.entra)),
  };
}

function curvaDelDia(estancias: Estancia[], minutos: number[]): { dentro: number[]; salen: number[]; entran: number[] } {
  const dentro = minutos.map(() => 0);
  const salen = minutos.map(() => 0);
  const entran = minutos.map(() => 0);
  const desde = minutos[0];
  const paso = minutos.length > 1 ? minutos[1] - minutos[0] : SALIDA_PASO;
  const celda = (m: number) => (m < desde ? -1 : Math.floor((m - desde) / paso));
  for (const s of estancias) {
    const sale = s.entro + s.dur;
    for (let i = 0; i < minutos.length; i++) {
      const m = minutos[i];
      // Mismo criterio que el barrido del tablero: a igual minuto, primero sale y luego entra.
      if (s.entro <= m && sale > m) dentro[i] += 1;
    }
    const ce = celda(s.entro);
    if (ce >= 0 && ce < minutos.length) entran[ce] += 1;
    const cs = celda(sale);
    if (cs >= 0 && cs < minutos.length) salen[cs] += 1;
  }
  return { dentro, salen, entran };
}
