// Los casos GUARDADOS del estacionamiento (bloque 89): tipos y helpers puros.
//
// POR QUE ES OTRO ARCHIVO QUE lib/casos.ts. `lib/casos.ts` CALCULA, con la bitacora,
// lo que no cuadra; este archivo habla de lo que ya EXISTE en la base: un caso con
// numero, estado, historial y evidencia. Aqui no hay React ni Supabase: asi se
// prueba con datos del tamaño de una prueba.

import { normalizarBusqueda } from "@/lib/buscarPersona";
import { fecha } from "@/lib/formato";
import { ROTULO } from "@/lib/glosario";

// Bloque 90: `nuevo` (nadie lo ha revisado) y `esperando` (a la persona, a un
// tercero o a una fecha). `abierto` es «Por atender»; `seguimiento` queda del 89 y
// se pinta en Esperando.

export type EstadoCasoGuardado = "nuevo" | "abierto" | "esperando" | "seguimiento" | "resuelto" | "descartado";
export type OrigenCaso = "manual" | "regla" | "migracion";
export type MotivoEspera = "persona" | "tercero" | "fecha";

export interface TipoCasoCatalogo {
  tipo: string;
  titulo: string;
  categoria: string;
  /** La ayuda que se muestra al elegir el tipo y al abrir el caso. */
  queHacer: string;
  /** true: lo abre una regla; no se ofrece en «Registrar caso» a mano. */
  automatico: boolean;
  orden: number;
  /** Bloque 90: la familia da el grupo y el color de la etiqueta. */
  familia: string;
  /** false = retirado: ya no se ofrece al reportar; sus casos lo conservan. */
  activo: boolean;
  motivosCierre: string[];
}

/** Bloque 90: los grupos de tipos, con el color de su etiqueta. */
export interface FamiliaCaso {
  id: string;
  titulo: string;
  orden: number;
  fondo: string;
  tinta: string;
}

/**
 * Los tipos en el orden que el equipo guardo (bloque 91): primero por el orden de
 * su familia, luego por el suyo. Asi «Por tipo» y «Por familia» dicen lo mismo.
 */
export function tiposEnOrden(familias: FamiliaCaso[], tipos: TipoCasoCatalogo[]): TipoCasoCatalogo[] {
  const posFamilia = new Map(familias.map((f) => [f.id, f.orden]));
  const pos = (t: TipoCasoCatalogo) => posFamilia.get(t.familia) ?? Number.MAX_SAFE_INTEGER;
  return [...tipos].sort((a, b) => pos(a) - pos(b) || a.orden - b.orden || a.titulo.localeCompare(b.titulo, "es"));
}

/**
 * Mueve `mover` a donde esta `sobre`: si baja queda despues de el y si sube,
 * antes (como al arrastrar en una lista). Sin cambios si alguno no esta.
 */
export function reordenar<T>(lista: T[], mover: T, sobre: T): T[] {
  const de = lista.indexOf(mover);
  const a = lista.indexOf(sobre);
  if (de < 0 || a < 0 || de === a) return lista;
  const sin = lista.filter((x) => x !== mover);
  sin.splice(sin.indexOf(sobre) + (de < a ? 1 : 0), 0, mover);
  return sin;
}

/**
 * El orden de las tarjetas en cada columna (Gerardo, 8-oct): primero los urgentes;
 * luego por el orden de familias y tipos que guardo el equipo (bloque 91); y dentro
 * de cada tipo, por llegada (el mas antiguo arriba). Cada grupo son los casos de una
 * persona con el mismo tipo: es urgente si alguno lo es, y llego con el primero.
 */
export function ordenarGruposCaso<C extends Pick<CasoGuardado, "tipo" | "urgente" | "creadoEn">>(grupos: C[][], ordenTipos: string[]): C[][] {
  const pos = new Map(ordenTipos.map((t, i) => [t, i]));
  const llave = (g: C[]) => ({
    urgente: g.some((c) => c.urgente),
    tipo: pos.get(g[0]?.tipo ?? "") ?? Number.MAX_SAFE_INTEGER,
    llego: g.map((c) => c.creadoEn).sort()[0] ?? "",
  });
  return grupos
    .map((g) => ({ g, k: llave(g) }))
    .sort((a, b) => Number(b.k.urgente) - Number(a.k.urgente) || a.k.tipo - b.k.tipo || a.k.llego.localeCompare(b.k.llego))
    .map((x) => x.g);
}

export interface CasoGuardado {
  id: string;
  numero: number;
  tipo: string;
  registroId: string | null;
  tarjeta: string | null;
  titulo: string;
  detalle: string;
  evidencia: Record<string, unknown>;
  estado: EstadoCasoGuardado;
  origen: OrigenCaso;
  regla: string | null;
  clave: string | null;
  preguntarAlPresentarse: boolean;
  creadoPor: string;
  creadoEn: string;
  actualizadoEn: string;
  cerradoPor: string | null;
  cerradoEn: string | null;
  cierreNota: string | null;
  /** Bloque 90. */
  urgente: boolean;
  atorado: boolean;
  esperaMotivo: MotivoEspera | null;
  esperaHasta: string | null;
  esperaTexto: string | null;
  cierreMotivo: string | null;
  veces: number;
  /** El vehiculo con que se registro el expediente ligado, si lo tiene. */
  vehiculo: { placas: string | null; marca: string | null; modelo: string | null; color: string | null } | null;
  estadoExpediente: string | null;
  /** El expediente ligado, si lo tiene. */
  folio: string | null;
  nombre: string | null;
}

export interface NotaCaso {
  id: string;
  casoId: string;
  clase: "apertura" | "nota" | "estado" | "marca" | "tipo";
  estadoAntes: EstadoCasoGuardado | null;
  estadoDespues: EstadoCasoGuardado | null;
  nota: string;
  hechoPor: string;
  hechoEn: string;
}

export const ESTADOS_CASO: EstadoCasoGuardado[] = ["nuevo", "abierto", "esperando", "seguimiento", "resuelto", "descartado"];

export const ETIQUETA_ESTADO_CASO: Record<EstadoCasoGuardado, string> = {
  nuevo: "Nuevo",
  abierto: "Por atender",
  esperando: "Esperando",
  seguimiento: "En seguimiento",
  resuelto: "Resuelto",
  descartado: "Descartado",
};

/** Resuelto y descartado cierran el caso: piden una nota que diga por que. */
export const esCierre = (e: EstadoCasoGuardado): boolean => e === "resuelto" || e === "descartado";
/** Lo que sigue pidiendo atencion. */
export const estaVivo = (e: EstadoCasoGuardado): boolean => !esCierre(e);

/* ------------------------------------------------------------------ el tablero (bloque 90) */

export type ColumnaCaso = "nuevo" | "atender" | "esperando" | "cerrado";

/** Las cuatro columnas del tablero: en que paso va el caso. */
export const COLUMNAS_CASO: { id: ColumnaCaso; titulo: string; ayuda: string }[] = [
  { id: "nuevo", titulo: "Nuevo", ayuda: "Lo abrió una regla o lo reportó alguien; nadie lo ha revisado." },
  { id: "atender", titulo: "Por atender", ayuda: "Alguien tiene que hacer algo." },
  { id: "esperando", titulo: "Esperando", ayuda: "A la persona, a alguien de fuera o a una fecha." },
  { id: "cerrado", titulo: "Cerrado", ayuda: "Con motivo. Se puede reabrir." },
];

/** La columna de un estado. `seguimiento` (89) se pinta en Esperando. */
export function columnaDe(e: EstadoCasoGuardado): ColumnaCaso {
  if (e === "nuevo") return "nuevo";
  if (e === "abierto") return "atender";
  if (e === "esperando" || e === "seguimiento") return "esperando";
  return "cerrado";
}

/** Lo que espera un caso, en una frase. */
export function textoEspera(c: Pick<CasoGuardado, "esperaMotivo" | "esperaHasta" | "esperaTexto" | "estado">): string {
  if (c.esperaMotivo === "persona") return "a que la persona se presente";
  if (c.esperaMotivo === "tercero") return `a ${c.esperaTexto ?? "alguien de fuera"}`;
  if (c.esperaMotivo === "fecha" && c.esperaHasta) return `hasta el ${fechaLarga(c.esperaHasta)}`;
  return c.estado === "seguimiento" ? "en seguimiento (sin motivo de espera)" : "";
}

/** «2027-04-06» a «6 abr 2027». */
export function fechaLarga(dia: string): string {
  return fecha(dia);
}

/** Los motivos generales de cierre, ademas de los del tipo. */
export const MOTIVOS_RESOLVER = ["Se corrigió en ZK", "Se habló con la persona", "Se confirmó en GES o con RH"];
export const MOTIVOS_DESCARTAR = ["No era problema", "Duplicado de otro caso", "Ya no aplica"];

/** De quien es un caso, para agrupar tarjetas: el expediente, o el TAG. */
export function clavePersonaCaso(c: Pick<CasoGuardado, "registroId" | "tarjeta" | "numero">): string {
  return c.registroId ? `r:${c.registroId}` : c.tarjeta ? `t:${c.tarjeta}` : `c:${c.numero}`;
}

/** «Hace 3 días», contado en dias de calendario de Queretaro. */
export function diasDesde(iso: string, hoy: Date = new Date()): number {
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(d);
  const a = Date.parse(fmt(new Date(iso)) + "T00:00:00Z"), b = Date.parse(fmt(hoy) + "T00:00:00Z");
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** «C-000123». */
export function numeroCaso(n: number): string {
  return `C-${String(Math.trunc(n)).padStart(6, "0")}`;
}

/**
 * Lo que alguien teclea en el buscador a un numero de caso: «C-123», «c123», «123».
 * Devuelve el numero o null si no parece uno.
 */
export function numeroDeBusqueda(q: string): number | null {
  const m = /^c?-?\s*(\d{1,9})$/i.exec(q.trim());
  return m ? Number(m[1]) : null;
}

/** Los abiertos y en seguimiento arriba, luego lo cerrado; dentro de cada grupo, lo mas reciente primero. */
export function ordenarCasos<T extends Pick<CasoGuardado, "estado" | "actualizadoEn" | "numero">>(casos: T[]): T[] {
  return [...casos].sort(
    (a, b) =>
      Number(esCierre(a.estado)) - Number(esCierre(b.estado)) ||
      (a.actualizadoEn < b.actualizadoEn ? 1 : a.actualizadoEn > b.actualizadoEn ? -1 : 0) ||
      b.numero - a.numero,
  );
}

export function contarPorEstado(casos: Pick<CasoGuardado, "estado">[]): Record<EstadoCasoGuardado, number> {
  const c: Record<EstadoCasoGuardado, number> = { nuevo: 0, abierto: 0, esperando: 0, seguimiento: 0, resuelto: 0, descartado: 0 };
  for (const x of casos) c[x.estado] += 1;
  return c;
}

/**
 * Si el seguimiento que se va a enviar se puede enviar, y si no, que decirle.
 * Cerrar exige nota (lo mismo que el RPC): se avisa antes de enviar, no despues.
 */
export function problemaDeSeguimiento(nota: string, estado: EstadoCasoGuardado | null, estadoActual: EstadoCasoGuardado): string | null {
  const hayNota = nota.trim().length > 0;
  const cambia = estado !== null && estado !== estadoActual;
  if (!hayNota && !cambia) return "Escriba una nota o elija un estado distinto.";
  if (estado !== null && esCierre(estado) && !hayNota) {
    return `Para dejar el caso como «${ETIQUETA_ESTADO_CASO[estado].toLowerCase()}» escriba una nota: qué se hizo o por qué se cierra.`;
  }
  return null;
}

/** ¿El caso es de esta persona? Por su expediente o por cualquiera de sus TAGs. */
export function esDeLaPersona(c: Pick<CasoGuardado, "registroId" | "tarjeta">, registroId: string, tags: string[]): boolean {
  return c.registroId === registroId || (c.tarjeta !== null && tags.includes(c.tarjeta));
}

/** A quien toca, en una frase corta: «Nombre · SATAG-001234» o «TAG 1234567». */
export function personaDelCaso(c: Pick<CasoGuardado, "nombre" | "folio" | "tarjeta">): string {
  if (c.folio) return c.nombre ? `${c.nombre} · ${c.folio}` : c.folio;
  return c.tarjeta ? `TAG ${c.tarjeta}` : "Sin persona ligada";
}

/** Lo que se busca en un caso: numero, TAG, folio, nombre y titulo. */
export function coincideBusqueda(c: CasoGuardado, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const n = numeroDeBusqueda(t);
  if (n !== null && c.numero === n) return true;
  // Sin acentos y en cualquier orden: «martinez gonzalez» encuentra «Martínez González».
  const indice = normalizarBusqueda([numeroCaso(c.numero), c.tarjeta ?? "", c.folio ?? "", c.nombre ?? "", c.titulo, c.vehiculo?.placas ?? ""].join(" "));
  return normalizarBusqueda(t).split(" ").every((p) => indice.includes(p));
}

/* ------------------------------------------------------------------ evidencia */

const ETIQUETAS_EVIDENCIA: Record<string, string> = {
  ventana: "Ventana de la bitácora",
  aperturasVentana: "Aperturas en la ventana",
  aperturasDelQueUsa: "Aperturas del TAG que sí usa",
  ultimoPaso: "Último paso por la pluma",
  departamentoZk: ROTULO.departamentoZk,
  plumas: ROTULO.plumas,
  categoria: "Categoría",
  prioridad: "Prioridad",
  motivo: "Motivo",
  ges: "Lo que dice GES",
  fuentes: "Fuentes",
  clasificacion: "Clasificación",
  familiaGes: "Familia en GES",
  tagQueSiUsa: "TAG que sí usa",
  tagPrincipal: "TAG principal",
  viajaCon: "Viaja con",
  placas: "Placas",
  folio: "Folio",
  dias: "Días",
  veces: "Veces",
  desde: "Desde",
  ultima: "Última vez",
  nivel: "Semáforo",
  patron: "Patrón",
};

/** «aperturasVentana» a «Aperturas ventana»: para lo que no tiene etiqueta propia. */
export function humanizarClave(k: string): string {
  const t = k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function valorLegible(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return v.toLocaleString("es-MX");
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.map(valorLegible).filter(Boolean).join("; ");
  if (typeof v === "object") {
    // «TAG 9426782 · mismo coche (se leen juntos) · SATAG-002540 (activo) · Nombre · 5 dias»
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => {
        const s = valorLegible(x);
        return s ? (k === "tag" ? `TAG ${s}` : s) : "";
      })
      .filter(Boolean)
      .join(" · ");
  }
  return String(v);
}

/**
 * La evidencia (jsonb libre) como renglones «etiqueta: valor», en un orden estable:
 * primero lo que tiene etiqueta conocida, en el orden de arriba, y luego el resto
 * por nombre. Lo vacio se omite. Los datos de cada regla cambian, asi que esto no
 * supone ninguna llave.
 */
export function evidenciaLegible(ev: Record<string, unknown> | null | undefined): { etiqueta: string; valor: string }[] {
  if (!ev || typeof ev !== "object") return [];
  const conocidas = Object.keys(ETIQUETAS_EVIDENCIA);
  const llaves = Object.keys(ev).sort((a, b) => {
    const ia = conocidas.indexOf(a), ib = conocidas.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b, "es");
  });
  const out: { etiqueta: string; valor: string }[] = [];
  for (const k of llaves) {
    const valor = valorLegible(ev[k]);
    if (valor) out.push({ etiqueta: ETIQUETAS_EVIDENCIA[k] ?? humanizarClave(k), valor });
  }
  return out;
}
