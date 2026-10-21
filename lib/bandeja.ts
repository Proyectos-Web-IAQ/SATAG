// La Bandeja de Sistemas (rediseño de TI, fase 1; Gerardo, 21-oct).
//
// Lo que le toca hoy a Sistemas, calculado del estado: no se captura nada. Si algo
// se resuelve por cualquier camino (otra pantalla, otra persona), deja de salir.
// La ven todos los de TI: «el día que yo falte, todo el sistema debe seguir
// funcionando». Prioridad, de Desarrollo/09 §7.2 y §9:
//   - Ahora: afecta quien abre la pluma o que se pueda instalar.
//   - Hoy: lo diario medido (casos, ciclo de ZK, caseta).
//   - Esta semana: lo que puede esperar unos días.
// Funciones puras: se prueban en pruebas-unitarias/bandeja.test.ts.

/** Un archivo de ZK se considera atrasado a partir de estos días (Gerardo, 21-oct). */
export const ARCHIVO_ATRASADO_DIAS = 7;
/** Un aviso a la caseta sin respuesta pide revisarse a partir de estos días. */
export const AVISO_VIEJO_DIAS = 3;
/** Un caso nuevo sin tomar se marca viejo a partir de estos días. */
export const CASO_VIEJO_DIAS = 7;

export type SeccionTi = "bandeja" | "zk" | "casos" | "instalar" | "caseta" | "personas" | "config";
export type GrupoTarea = "ahora" | "hoy" | "semana";

export interface Destino { seccion: SeccionTi; sub?: string }

export interface Tarea {
  id: string;
  grupo: GrupoTarea;
  /** Un verbo: lo que hay que hacer. */
  titulo: string;
  detalle: string;
  /** «14 días», «hoy»: la antigüedad a la vista. */
  edad: string | null;
  vieja: boolean;
  ir: Destino;
}

export interface EntradaBandeja {
  /** Reportes de la caseta: abrió con botón cuando la pantalla decía «No tiene acceso» y nadie lo ha tomado. */
  casetaSinAcceso: { quien: string; cuando: string; dias: number }[];
  /** Aperturas que la caseta no identificó (sin caso). */
  casetaSinCaso: number;
  avisosSinRespuesta: { n: number; masViejoDias: number };
  casosNuevos: { n: number; masViejoDias: number; urgentes: number };
  inventario: { disponibles: number; lunes: number[] };
  /** Días desde la última carga de cada archivo de ZK; null = nunca. */
  archivos: { eventos: number | null; personas: number | null; puertas: number | null };
  zk: { pendientes: number; noCoincide: number; porVerificar: number; tandaAbierta: { numero: number; faltan: number } | null };
  notasBuzon: number;
}

/** Cuándo avisar que se acaban los TAGs: lo de un lunes y medio, nunca menos de 8. */
export function umbralInventario(lunes: number[]): number {
  if (!lunes.length) return 8;
  const prom = lunes.reduce((a, b) => a + b, 0) / lunes.length;
  return Math.max(8, Math.ceil(1.5 * prom));
}

/** El lunes de la semana de una fecha «AAAA-MM-DD». */
export function lunesDe(fecha: string): string {
  const d = new Date(fecha + "T12:00:00Z");
  const w = (d.getUTCDay() + 6) % 7; // lunes = 0
  return new Date(d.getTime() - w * 86400000).toISOString().slice(0, 10);
}

/**
 * TAGs instalados por semana en las últimas `n` semanas CON instalaciones antes de
 * `hoy` (las vacaciones no cuentan como semanas en cero), de la más vieja a la más
 * nueva. La semana en curso no entra: todavía no termina.
 */
export function tagsPorLunes(fechasInstalacion: (string | null)[], hoy: string, n = 4): number[] {
  const actual = lunesDe(hoy);
  const porSemana = new Map<string, number>();
  for (const f of fechasInstalacion) {
    if (!f) continue;
    const l = lunesDe(f.slice(0, 10));
    if (l >= actual) continue;
    porSemana.set(l, (porSemana.get(l) ?? 0) + 1);
  }
  return [...porSemana.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-n).map(([, c]) => c);
}

/** Días completos entre una fecha y hoy (null si no hay fecha). */
export function diasDesde(iso: string | null, ahora: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((ahora - t) / 86400000));
}

const edad = (d: number) => (d <= 0 ? "hoy" : d === 1 ? "1 día" : `${d} días`);
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

export function tareasBandeja(e: EntradaBandeja): Tarea[] {
  const t: Tarea[] = [];

  // ---- Ahora
  e.casetaSinAcceso.forEach((r, i) => t.push({
    id: `caseta-sin-acceso-${i}`, grupo: "ahora",
    titulo: `La caseta abrió con el botón a ${r.quien} y la pantalla decía «No tiene acceso»`,
    detalle: `${r.cuando} · si nadie lo revisa, puede seguir entrando sin acceso`,
    edad: edad(r.dias), vieja: r.dias >= 1, ir: { seccion: "caseta" },
  }));
  if (e.zk.noCoincide) t.push({
    id: "zk-no-coincide", grupo: "ahora",
    titulo: `${e.zk.noCoincide} ${plural(e.zk.noCoincide, "cambio no quedó", "cambios no quedaron")} en ZK como se pidió`,
    detalle: "La verificación con el último archivo de ZK no coincide: revisar y volver a pedir",
    edad: null, vieja: true, ir: { seccion: "zk", sub: "movimientos" },
  });
  const umbral = umbralInventario(e.inventario.lunes);
  if (e.inventario.disponibles < umbral) {
    const prom = e.inventario.lunes.length ? e.inventario.lunes.reduce((a, b) => a + b, 0) / e.inventario.lunes.length : null;
    t.push({
      id: "inventario", grupo: "ahora",
      titulo: `Quedan ${e.inventario.disponibles} TAGs en el inventario: dar de alta un lote`,
      detalle: prom === null
        ? `Avisa con menos de ${umbral}`
        : `Las últimas semanas se instalaron ${e.inventario.lunes.join(", ")} (promedio ${prom.toFixed(1)}) · avisa con menos de ${umbral}, lo de un lunes y medio`,
      edad: null, vieja: e.inventario.disponibles === 0, ir: { seccion: "config", sub: "tags" },
    });
  }

  // ---- Hoy
  const atrasados = ([["eventos", "Todos los Eventos"], ["personas", "Personas"], ["puertas", "Personal de Apertura"]] as const)
    .filter(([k]) => e.archivos[k] === null || (e.archivos[k] as number) >= ARCHIVO_ATRASADO_DIAS);
  if (atrasados.length) {
    const peor = Math.max(...atrasados.map(([k]) => e.archivos[k] ?? 999));
    t.push({
      id: "archivos-zk", grupo: "hoy",
      titulo: "Subir los archivos de ZK",
      detalle: `${atrasados.map(([k, n]) => `${n}: ${e.archivos[k] === null ? "nunca" : `hace ${e.archivos[k]} días`}`).join(" · ")}. Sin ellos SATAG no sabe quién abre hoy`,
      edad: peor >= 999 ? "nunca" : edad(peor), vieja: true, ir: { seccion: "zk", sub: "archivos" },
    });
  }
  if (e.zk.tandaAbierta) t.push({
    id: "zk-tanda", grupo: "hoy",
    titulo: `Terminar la tanda ${e.zk.tandaAbierta.numero} en ZK`,
    detalle: `Faltan ${e.zk.tandaAbierta.faltan} ${plural(e.zk.tandaAbierta.faltan, "paso", "pasos")} por palomear (importar, niveles por departamento)`,
    edad: null, vieja: false, ir: { seccion: "zk", sub: "movimientos" },
  });
  else if (e.zk.pendientes) t.push({
    id: "zk-pendientes", grupo: "hoy",
    titulo: `Pasar a ZK ${e.zk.pendientes} ${plural(e.zk.pendientes, "cambio decidido", "cambios decididos")}`,
    detalle: "Armar la tanda, descargar el archivo y hacerla en ZK",
    edad: null, vieja: false, ir: { seccion: "zk", sub: "movimientos" },
  });
  if (e.casosNuevos.n) t.push({
    id: "casos-nuevos", grupo: "hoy",
    titulo: `Tomar ${e.casosNuevos.n} ${plural(e.casosNuevos.n, "caso nuevo que nadie ha visto", "casos nuevos que nadie ha visto")}`,
    detalle: `${e.casosNuevos.urgentes ? `${e.casosNuevos.urgentes} ${plural(e.casosNuevos.urgentes, "urgente", "urgentes")} · ` : ""}el más viejo lleva ${edad(e.casosNuevos.masViejoDias)}`,
    edad: edad(e.casosNuevos.masViejoDias), vieja: e.casosNuevos.masViejoDias >= CASO_VIEJO_DIAS, ir: { seccion: "casos" },
  });
  if (e.casetaSinCaso) t.push({
    id: "caseta-sin-caso", grupo: "hoy",
    titulo: `${e.casetaSinCaso} ${plural(e.casetaSinCaso, "apertura con botón que la caseta no identificó", "aperturas con botón que la caseta no identificó")}`,
    detalle: "Ligarlas a una persona o dejarlas como visita",
    edad: null, vieja: false, ir: { seccion: "caseta" },
  });

  // ---- Esta semana
  if (e.zk.porVerificar) t.push({
    id: "zk-verificar", grupo: "semana",
    titulo: `Comprobar ${e.zk.porVerificar} ${plural(e.zk.porVerificar, "cambio hecho", "cambios hechos")} en ZK`,
    detalle: "Subir Personas y Personal de Apertura: SATAG compara y cierra lo que ya coincide",
    edad: null, vieja: false, ir: { seccion: "zk", sub: "archivos" },
  });
  if (e.avisosSinRespuesta.n && e.avisosSinRespuesta.masViejoDias >= AVISO_VIEJO_DIAS) t.push({
    id: "avisos", grupo: "semana",
    titulo: `${e.avisosSinRespuesta.n} ${plural(e.avisosSinRespuesta.n, "aviso a la caseta sigue", "avisos a la caseta siguen")} sin respuesta`,
    detalle: "Quizá esos vehículos no han llegado. Revise si siguen haciendo falta",
    edad: edad(e.avisosSinRespuesta.masViejoDias), vieja: false, ir: { seccion: "caseta", sub: "avisos" },
  });
  if (e.notasBuzon) t.push({
    id: "buzon", grupo: "semana",
    titulo: `${e.notasBuzon} ${plural(e.notasBuzon, "nota del buzón sin expediente", "notas del buzón sin expediente")}`,
    detalle: "Vincularlas a una persona o descartarlas",
    edad: null, vieja: false, ir: { seccion: "personas", sub: "notas" },
  });
  return t;
}

/** Lo que alguien de Sistemas hizo hoy, para «Hecho hoy, por quién». */
export interface HechoHoy { en: string; quien: string; que: string }

/** Agrupa lo hecho hoy por persona, de quien más hizo a quien menos. */
export function hechoPorPersona(xs: HechoHoy[]): { quien: string; n: number; ultimos: HechoHoy[] }[] {
  const m = new Map<string, HechoHoy[]>();
  for (const x of xs) { const v = m.get(x.quien); if (v) v.push(x); else m.set(x.quien, [x]); }
  return [...m.entries()]
    .map(([quien, v]) => ({ quien, n: v.length, ultimos: v.sort((a, b) => b.en.localeCompare(a.en)) }))
    .sort((a, b) => b.n - a.n || a.quien.localeCompare(b.quien, "es"));
}
