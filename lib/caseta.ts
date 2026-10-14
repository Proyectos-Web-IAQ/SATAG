// La caseta del estacionamiento (bloque 97, Gerardo 14-oct).
//
// El portero, antes de abrir con el boton, busca el vehiculo y ve si tiene acceso
// y por que no le abrio; si abre con el boton, lo reporta. Sistemas sigue esas
// aperturas por vehiculo. Aqui solo hay funciones puras: rotulos, motivos y los
// calculos de la vista de Sistemas. El veredicto lo calcula la base
// (caseta_evaluar), nunca el cliente.
//
// Las claves de los motivos son las del CASE de `caseta_rotulo_motivo` en
// supabase/sql/97_caseta.sql; una prueba unitaria compara las dos listas.
import { diaDe } from "@/lib/formato";

export type Lote = "E1" | "E2";
export type Puerta = "E1-entrada" | "E1-salida" | "E2-entrada" | "E2-salida";
/** Dos colores (Gerardo, 14-oct): la antena solo rechaza un TAG dado de baja o de otro estacionamiento. */
export type Veredicto = "abre" | "no-abre";
export type ClaseReporte = "apertura" | "reporte";

export const PUERTAS: { id: Puerta; lote: Lote; titulo: string }[] = [
  { id: "E1-entrada", lote: "E1", titulo: "E1 · Entrada" },
  { id: "E1-salida", lote: "E1", titulo: "E1 · Salida" },
  { id: "E2-entrada", lote: "E2", titulo: "E2 · Entrada" },
  { id: "E2-salida", lote: "E2", titulo: "E2 · Salida" },
];

export const tituloPuerta = (p: string): string => PUERTAS.find((x) => x.id === p)?.titulo ?? p;

/**
 * Lo que cubre una caseta (Gerardo, 14-oct): un estacionamiento completo, entrada
 * y salida, o los dos. Entrada o salida se elige al reportar, no aqui.
 */
export type Caseta = "E1" | "E2" | "E1-E2";
export const CASETAS: { id: Caseta; titulo: string; lotes: Lote[] }[] = [
  { id: "E1", titulo: "Estacionamiento 1", lotes: ["E1"] },
  { id: "E2", titulo: "Estacionamiento 2", lotes: ["E2"] },
  { id: "E1-E2", titulo: "Los dos", lotes: ["E1", "E2"] },
];
export const esCaseta = (v: unknown): v is Caseta => CASETAS.some((c) => c.id === v);
export const lotesDeCaseta = (c: Caseta): Lote[] => CASETAS.find((x) => x.id === c)?.lotes ?? ["E1"];
/** Las puertas donde puede reportar una caseta: entrada y salida de cada estacionamiento que cubre. */
export const puertasDeCaseta = (c: Caseta): { id: Puerta; lote: Lote; titulo: string }[] =>
  PUERTAS.filter((p) => lotesDeCaseta(c).includes(p.lote));

/** Lo que la pantalla le dice al portero, en grande. */
export const VEREDICTO: Record<Veredicto, { titulo: string; ayuda: string }> = {
  abre: {
    titulo: "Tiene acceso",
    ayuda: "Si la pluma no abrió, el TAG no se leyó. Abra con el botón y repórtelo.",
  },
  "no-abre": {
    titulo: "No tiene acceso",
    ayuda: "No abra la pluma. Niegue el acceso.",
  },
};

/** Lo que se le dice a quien pregunta por un TAG dado de baja (Gerardo, 14-oct). */
export const PROCESO_BAJA = "Para volver a entrar, el proceso es comprar un TAG nuevo.";

export interface Motivo {
  id: string;
  titulo: string;
  /** La nota es obligatoria: «por que» no cabe en el rotulo. */
  pideNota?: boolean;
  /** Sin vehiculo identificado no exige placa (falla, emergencia). */
  sinPlaca?: boolean;
}

export const MOTIVOS_APERTURA: Motivo[] = [
  { id: "no-leyo", titulo: "Tiene acceso y el TAG no se leyó" },
  { id: "sin-tag", titulo: "Viene sin TAG o con el TAG despegado" },
  { id: "no-aparece", titulo: "No aparece en SATAG" },
  { id: "sin-acceso", titulo: "No tiene acceso y se le abrió", pideNota: true },
  { id: "visita", titulo: "Visita o proveedor" },
  { id: "emergencia", titulo: "Emergencia o servicio", sinPlaca: true },
  { id: "falla", titulo: "Falla de la pluma o del lector", sinPlaca: true },
  { id: "otro", titulo: "Otro motivo", pideNota: true },
];

export const MOTIVOS_REPORTE: Motivo[] = [
  { id: "falla", titulo: "La pluma o el lector fallan" },
  { id: "tag-danado", titulo: "TAG dañado o despegado" },
  { id: "conducta", titulo: "Conducta en el estacionamiento" },
  { id: "dato", titulo: "Un dato está mal (placa, vehículo o nombre)" },
  { id: "otro", titulo: "Otro", pideNota: true },
];

export const motivosDe = (c: ClaseReporte): Motivo[] => (c === "apertura" ? MOTIVOS_APERTURA : MOTIVOS_REPORTE);

export function rotuloMotivo(clase: string, motivo: string): string {
  return motivosDe(clase === "reporte" ? "reporte" : "apertura").find((m) => m.id === motivo)?.titulo ?? motivo;
}

/** La placa como la guarda la base: mayusculas, sin espacios ni guiones. */
export function placaNormalizada(v: string | null | undefined): string {
  return (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/* ------------------------------------------------------------------ lo que devuelve la base */

export interface MotivoVeredicto {
  /** baja, otro-lote, sin-tag o acceso (el unico que abre). */
  clave: "baja" | "otro-lote" | "sin-tag" | "acceso";
  veredicto: Veredicto;
  texto: string;
}

export interface EvaluacionCaseta {
  veredicto: Veredicto;
  motivos: MotivoVeredicto[];
  /** Solo si esta dado de baja: el motivo y la fecha (null si no se registro). */
  baja: { motivo: string | null; fecha: string | null; caso?: number } | null;
  tarjeta: string | null;
  departamentoZk: string | null;
  placaZk: string | null;
  nombreZk: string | null;
  ultimoPaso: { en: string; puerta: string; concedido: boolean } | null;
}

export interface ResultadoCaseta {
  registroId: string | null;
  nombre: string | null;
  tipo: string | null;
  estado: string | null;
  marca: string | null;
  modelo: string | null;
  color: string | null;
  placa: string | null;
  plumas: string[];
  /** Un veredicto por cada estacionamiento que cubre la caseta, medido en su entrada. */
  evaluaciones: Partial<Record<Lote, EvaluacionCaseta>>;
  /** Sus ultimas lecturas en la pluma, de la mas vieja a la mas nueva (hora de pared de ZK). */
  pasos: PasoPluma[];
}

export interface PasoPluma { en: string; lote: string; sentido: "entrada" | "salida"; concedido: boolean }

/**
 * Una fila del contexto del portero (Gerardo, 14-oct: «cuál sí pasó, cuál no, cuál
 * fue rechazo»): una estancia (entró y/o salió) o un rechazo de la pluma.
 */
export type FilaPasos =
  | { tipo: "estancia"; lote: string; entrada: string | null; salida: string | null }
  | { tipo: "rechazo"; lote: string; sentido: "entrada" | "salida"; en: string };

const mismoDia = (a: string, b: string) => a.slice(0, 10) === b.slice(0, 10);

/**
 * Las ultimas `max` estancias y rechazos, de la mas nueva a la mas vieja. Una entrada
 * abre la estancia de su estacionamiento y la salida del mismo dia la cierra; una
 * salida sin entrada (o una entrada sin salida) queda con el otro extremo vacio:
 * el lector no la leyo o la persona sigue dentro.
 */
export function estanciasDe(pasos: PasoPluma[], max = 5): FilaPasos[] {
  const filas: (FilaPasos & { orden: string })[] = [];
  const abiertas = new Map<string, { entrada: string }>();
  for (const p of [...pasos].sort((a, b) => a.en.localeCompare(b.en))) {
    if (!p.concedido) {
      filas.push({ tipo: "rechazo", lote: p.lote, sentido: p.sentido, en: p.en, orden: p.en });
      continue;
    }
    const abierta = abiertas.get(p.lote);
    if (p.sentido === "entrada") {
      if (abierta) filas.push({ tipo: "estancia", lote: p.lote, entrada: abierta.entrada, salida: null, orden: abierta.entrada });
      abiertas.set(p.lote, { entrada: p.en });
    } else if (abierta && mismoDia(abierta.entrada, p.en)) {
      filas.push({ tipo: "estancia", lote: p.lote, entrada: abierta.entrada, salida: p.en, orden: abierta.entrada });
      abiertas.delete(p.lote);
    } else {
      if (abierta) {
        filas.push({ tipo: "estancia", lote: p.lote, entrada: abierta.entrada, salida: null, orden: abierta.entrada });
        abiertas.delete(p.lote);
      }
      filas.push({ tipo: "estancia", lote: p.lote, entrada: null, salida: p.en, orden: p.en });
    }
  }
  for (const [lote, a] of abiertas) filas.push({ tipo: "estancia", lote, entrada: a.entrada, salida: null, orden: a.entrada });
  return filas
    .sort((a, b) => b.orden.localeCompare(a.orden))
    .slice(0, max)
    .map((f) => { const { orden, ...resto } = f; void orden; return resto as FilaPasos; });
}

/** Las evaluaciones en el orden de la caseta (E1 antes que E2). */
export function evaluacionesDe(r: ResultadoCaseta): { lote: Lote; ev: EvaluacionCaseta }[] {
  return (["E1", "E2"] as Lote[]).flatMap((lote) => (r.evaluaciones[lote] ? [{ lote, ev: r.evaluaciones[lote]! }] : []));
}

/** Lo que no cambia entre estacionamientos (TAG, ZK, ultimo paso, baja): de la primera. */
export const datosComunes = (r: ResultadoCaseta): EvaluacionCaseta | null => evaluacionesDe(r)[0]?.ev ?? null;

/**
 * Lo que Sistemas cambio y le importa a la pluma (Gerardo, 14-oct), de los ultimos
 * 30 dias: un TAG dado de baja (de quien sigue viniendo), un cambio de acceso o un
 * TAG nuevo instalado.
 */
export type ClaseCambio = "baja" | "acceso" | "instalado";
export interface CambioSistemas {
  clase: ClaseCambio;
  tarjeta: string;
  en: string;
  nombre: string | null;
  marca: string | null;
  modelo: string | null;
  color: string | null;
  placa: string | null;
  /** Solo en las bajas: el motivo (null si no se registro). */
  motivo: string | null;
  /** Por donde entra (acceso, instalado) o por donde entraba (baja). */
  lotes: string[];
}

export const CLASE_CAMBIO: Record<ClaseCambio, { titulo: string; plural: string }> = {
  baja: { titulo: "Baja de TAG", plural: "Bajas" },
  acceso: { titulo: "Cambio de acceso", plural: "Cambios de acceso" },
  instalado: { titulo: "TAG nuevo", plural: "TAGs nuevos" },
};

/** Lo que el portero lee de un cambio, en una linea. */
export function textoCambio(c: CambioSistemas): string {
  if (c.clase === "baja") return c.motivo ?? "Sin motivo registrado en SATAG.";
  const por = c.lotes.length ? `por ${c.lotes.join(" y ")}` : "";
  return c.clase === "acceso" ? `Ahora entra ${por}.`.replace("  ", " ") : `Se le instaló un TAG nuevo; entra ${por}.`.replace("  ", " ");
}

/** Un reporte de la caseta y en que va su caso. */
export interface ReporteSeguimiento {
  en: string;
  clase: ClaseReporte;
  puerta: string;
  motivo: string;
  veredicto: Veredicto | null;
  quien: string | null;
  /** Lo reporto quien esta en sesion. */
  mio: boolean;
  /** Sistemas lo ligo despues a un expediente. */
  ligado: boolean;
  caso: number | null;
  estadoCaso: string | null;
  cierreMotivo: string | null;
  cerradoEn: string | null;
}

/**
 * El paso del caso en palabras de la caseta. Sin caso (no se identifico el
 * vehiculo) queda en la bitacora, y Sistemas lo ve ahi.
 */
export function estadoSeguimiento(r: Pick<ReporteSeguimiento, "caso" | "estadoCaso">): { texto: string; tono: "nuevo" | "curso" | "espera" | "listo" } {
  if (!r.caso || !r.estadoCaso) return { texto: "En la bitácora de Sistemas", tono: "nuevo" };
  switch (r.estadoCaso) {
    case "nuevo": return { texto: "Recibido", tono: "nuevo" };
    case "abierto":
    case "consultar": return { texto: "En atención", tono: "curso" };
    case "esperando":
    case "seguimiento": return { texto: "En espera", tono: "espera" };
    case "resuelto": return { texto: "Resuelto", tono: "listo" };
    case "descartado": return { texto: "Cerrado sin cambios", tono: "listo" };
    default: return { texto: "En atención", tono: "curso" };
  }
}

export interface InicioCaseta {
  cambios: CambioSistemas[];
  reportes: ReporteSeguimiento[];
  /** Hasta donde llegan las lecturas de la pluma: el ultimo archivo de ZK que subio Sistemas. */
  eventosHasta: string | null;
  padronZkAl: string | null;
  puertasZkAl: string | null;
}

/** Lo de los estacionamientos de la caseta; lo que no se sabe de cual, en todos. */
export function delLote<T extends { lotes: string[] }>(lista: T[], lotes: Lote[] | null): T[] {
  if (!lotes) return lista;
  return lista.filter((a) => a.lotes.length === 0 || a.lotes.some((l) => lotes.includes(l as Lote)));
}

/* ------------------------------------------------------------------ la vista de Sistemas */

export interface ReporteCaseta {
  id: string;
  clase: ClaseReporte;
  puerta: string;
  motivo: string;
  registroId: string | null;
  tarjeta: string | null;
  placaNorm: string | null;
  vehiculoTexto: string | null;
  nota: string;
  veredicto: Veredicto | null;
  casoNumero: number | null;
  hechoPor: string;
  hechoEn: string;
  ligadoPor: string | null;
  ligadoEn: string | null;
  /** Del expediente ligado (RLS de registros: ti, contador, admin, super). */
  nombre: string | null;
  placas: string | null;
  marca: string | null;
  modelo: string | null;
  color: string | null;
}

/**
 * A que vehiculo se le abrio: el expediente si lo hay, si no el TAG, si no la placa
 * escrita. Sin nada de eso, el reporte va solo (falla, emergencia).
 */
export function claveVehiculo(r: Pick<ReporteCaseta, "id" | "registroId" | "tarjeta" | "placaNorm">): string {
  if (r.registroId) return `exp:${r.registroId}`;
  if (r.tarjeta) return `tag:${r.tarjeta}`;
  if (r.placaNorm) return `placa:${r.placaNorm}`;
  return `solo:${r.id}`;
}

export interface VehiculoAperturas {
  clave: string;
  /** Lo que se muestra: nombre, o la placa escrita, o la descripcion. */
  titulo: string;
  identificado: boolean;
  aperturas: number;
  reportes: number;
  ultima: string;
  puertas: string[];
  /** Motivo → veces, del mas frecuente al menos. */
  motivos: { motivo: string; clase: ClaseReporte; n: number }[];
  /** Cuantas se abrieron cuando la pantalla decia que no tenia acceso. */
  sinAcceso: number;
  items: ReporteCaseta[];
}

export function agruparPorVehiculo(reportes: ReporteCaseta[]): VehiculoAperturas[] {
  const g = new Map<string, ReporteCaseta[]>();
  for (const r of reportes) {
    const k = claveVehiculo(r);
    g.set(k, [...(g.get(k) ?? []), r]);
  }
  const out: VehiculoAperturas[] = [];
  for (const [clave, items] of g) {
    const orden = [...items].sort((a, b) => b.hechoEn.localeCompare(a.hechoEn));
    const con = orden.find((x) => x.nombre) ?? orden[0];
    const titulo = con.nombre ?? con.placas ?? con.placaNorm ?? con.vehiculoTexto ?? (con.tarjeta ? `TAG ${con.tarjeta}` : "Sin vehículo");
    const cuenta = new Map<string, { motivo: string; clase: ClaseReporte; n: number }>();
    for (const x of items) {
      const k = `${x.clase}:${x.motivo}`;
      const v = cuenta.get(k) ?? { motivo: x.motivo, clase: x.clase, n: 0 };
      v.n += 1;
      cuenta.set(k, v);
    }
    out.push({
      clave,
      titulo,
      identificado: !clave.startsWith("placa:") && !clave.startsWith("solo:"),
      aperturas: items.filter((x) => x.clase === "apertura").length,
      reportes: items.filter((x) => x.clase === "reporte").length,
      ultima: orden[0].hechoEn,
      puertas: [...new Set(items.map((x) => x.puerta))].sort(),
      motivos: [...cuenta.values()].sort((a, b) => b.n - a.n || a.motivo.localeCompare(b.motivo)),
      sinAcceso: items.filter((x) => x.clase === "apertura" && x.veredicto === "no-abre").length,
      items: orden,
    });
  }
  return out.sort((a, b) => b.aperturas - a.aperturas || b.ultima.localeCompare(a.ultima));
}

export interface ResumenAperturas {
  total: number;
  /** Tenia acceso y no abrio: el problema es el TAG o el lector. */
  tagOLector: number;
  /** Se abrio cuando no tenia acceso (por veredicto o por motivo). */
  sinAcceso: number;
  sinIdentificar: number;
  porDia: { dia: string; n: number }[];
  porPuerta: { puerta: string; n: number }[];
}

export function resumenAperturas(reportes: ReporteCaseta[]): ResumenAperturas {
  const ap = reportes.filter((r) => r.clase === "apertura");
  const dias = new Map<string, number>();
  const puertas = new Map<string, number>();
  for (const r of ap) {
    const d = diaDe(r.hechoEn) ?? r.hechoEn.slice(0, 10);
    dias.set(d, (dias.get(d) ?? 0) + 1);
    puertas.set(r.puerta, (puertas.get(r.puerta) ?? 0) + 1);
  }
  return {
    total: ap.length,
    tagOLector: ap.filter((r) => r.motivo === "no-leyo" || r.motivo === "falla" || (r.veredicto === "abre" && r.motivo !== "sin-acceso")).length,
    sinAcceso: ap.filter((r) => r.veredicto === "no-abre" || r.motivo === "sin-acceso").length,
    sinIdentificar: ap.filter((r) => !r.registroId && !r.tarjeta).length,
    porDia: [...dias.entries()].map(([dia, n]) => ({ dia, n })).sort((a, b) => a.dia.localeCompare(b.dia)),
    porPuerta: PUERTAS.map((p) => ({ puerta: p.id as string, n: puertas.get(p.id) ?? 0 })),
  };
}

/** La bitacora en CSV (separado por comas, con comillas), para compartir. */
export function csvAperturas(reportes: ReporteCaseta[], fechaHora: (v: string) => string): string {
  const q = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cab = ["Fecha y hora", "Puerta", "Tipo", "Motivo", "Persona", "Placa", "Vehículo", "TAG", "Pantalla decía", "Nota", "Reportó", "Caso", "Ligada por"];
  const filas = reportes.map((r) => [
    fechaHora(r.hechoEn),
    tituloPuerta(r.puerta),
    r.clase === "apertura" ? "Apertura con botón" : "Reporte",
    rotuloMotivo(r.clase, r.motivo),
    r.nombre ?? "",
    r.placas ?? r.placaNorm ?? "",
    [r.marca, r.modelo, r.color].filter(Boolean).join(" ") || r.vehiculoTexto || "",
    r.tarjeta ?? "",
    r.veredicto ? VEREDICTO[r.veredicto].titulo : "",
    r.nota,
    r.hechoPor,
    r.casoNumero ? `C-${String(r.casoNumero).padStart(6, "0")}` : "",
    r.ligadoPor ?? "",
  ]);
  return [cab, ...filas].map((f) => f.map(q).join(",")).join("\r\n");
}

/* ------------------------------------------------------------------ el estacionamiento de un caso */

/**
 * Los estacionamientos de un caso, en el cliente: las plumas de su expediente, el
 * lote de su clave (casos de regla, tipo:tarjeta:lote) y la puerta del reporte de
 * caseta. Vacio = no se sabe; el filtro lo muestra en los dos.
 */
export function lotesDeCaso(
  caso: { registroId: string | null; clave: string | null; evidencia: Record<string, unknown> | null },
  plumasDe: (registroId: string) => string[] | undefined,
): string[] {
  const l = new Set<string>();
  if (caso.registroId) for (const p of plumasDe(caso.registroId) ?? []) l.add(p);
  const k = caso.clave ? /:(E\d+)$/.exec(caso.clave) : null;
  if (k) l.add(k[1]);
  const caseta = caso.evidencia?.caseta as { puerta?: unknown } | undefined;
  if (typeof caseta?.puerta === "string" && /^E\d+-/.test(caseta.puerta)) l.add(caseta.puerta.split("-")[0]);
  return [...l].filter((x) => /^E\d+$/.test(x)).sort();
}
