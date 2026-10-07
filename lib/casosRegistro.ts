// Los casos GUARDADOS del estacionamiento (bloque 89): tipos y helpers puros.
//
// POR QUE ES OTRO ARCHIVO QUE lib/casos.ts. `lib/casos.ts` CALCULA, con la bitacora,
// lo que no cuadra; este archivo habla de lo que ya EXISTE en la base: un caso con
// numero, estado, historial y evidencia. Aqui no hay React ni Supabase: asi se
// prueba con datos del tamaño de una prueba.

export type EstadoCasoGuardado = "abierto" | "seguimiento" | "resuelto" | "descartado";
export type OrigenCaso = "manual" | "regla" | "migracion";

export interface TipoCasoCatalogo {
  tipo: string;
  titulo: string;
  categoria: string;
  /** La ayuda que se muestra al elegir el tipo y al abrir el caso. */
  queHacer: string;
  /** true: lo abre una regla; no se ofrece en «Registrar caso» a mano. */
  automatico: boolean;
  orden: number;
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
  /** El expediente ligado, si lo tiene. */
  folio: string | null;
  nombre: string | null;
}

export interface NotaCaso {
  id: string;
  casoId: string;
  clase: "apertura" | "nota" | "estado";
  estadoAntes: EstadoCasoGuardado | null;
  estadoDespues: EstadoCasoGuardado | null;
  nota: string;
  hechoPor: string;
  hechoEn: string;
}

export const ESTADOS_CASO: EstadoCasoGuardado[] = ["abierto", "seguimiento", "resuelto", "descartado"];

export const ETIQUETA_ESTADO_CASO: Record<EstadoCasoGuardado, string> = {
  abierto: "Abierto",
  seguimiento: "En seguimiento",
  resuelto: "Resuelto",
  descartado: "Descartado",
};

/** Resuelto y descartado cierran el caso: piden una nota que diga por que. */
export const esCierre = (e: EstadoCasoGuardado): boolean => e === "resuelto" || e === "descartado";
/** Lo que sigue pidiendo atencion. */
export const estaVivo = (e: EstadoCasoGuardado): boolean => !esCierre(e);

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
  const c: Record<EstadoCasoGuardado, number> = { abierto: 0, seguimiento: 0, resuelto: 0, descartado: 0 };
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
  return [numeroCaso(c.numero), c.tarjeta ?? "", c.folio ?? "", c.nombre ?? "", c.titulo].join(" ").toLowerCase().includes(t);
}

/* ------------------------------------------------------------------ evidencia */

const ETIQUETAS_EVIDENCIA: Record<string, string> = {
  ventana: "Ventana de la bitácora",
  aperturasVentana: "Aperturas en la ventana",
  aperturasDelQueUsa: "Aperturas del TAG que sí usa",
  ultimoPaso: "Último paso por la pluma",
  departamentoZk: "Departamento en ZK",
  plumas: "Plumas",
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
