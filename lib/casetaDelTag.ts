// Lo que la caseta y la pluma dicen de UN vehiculo (Gerardo, 29-oct): en un caso
// «Abierta con el boton … el TAG no se leyo», ver los datos para saber si se
// repite o fue una vez. Tres cosas, solo datos y sin veredicto:
//   1. cuantas veces y cuando lo reporto la caseta, por que y por que puerta;
//   2. que leyo la pluma de su TAG cada uno de esos dias (bitacora cargada);
//   3. a cuantos OTROS vehiculos se les abrio con el boton en la misma puerta el
//      mismo dia (muchos: un dato sobre la puerta; ninguno: sobre el vehiculo).
// Los reportes traen `hechoEn` con zona (instante); el dia se toma en Queretaro
// con diaDe, igual que el resto del panel.
import { claveVehiculo, rotuloMotivo, tituloPuerta, type ClaseReporte, type ReporteCaseta } from "@/lib/caseta";
import type { Lectura } from "@/lib/casosEvidencia";
import { diaDe } from "@/lib/formato";

export type ReporteDelTag = Pick<
  ReporteCaseta,
  "id" | "clase" | "puerta" | "motivo" | "veredicto" | "hechoEn" | "registroId" | "tarjeta" | "placaNorm" | "nombre" | "vehiculoTexto" | "casoNumero"
>;

/** Los reportes de ESTE vehiculo (los de su expediente y los de su TAG), del mas reciente al mas viejo. */
export function reportesDelVehiculo<T extends ReporteDelTag>(reportes: T[], de: { registroId: string | null; tarjeta: string | null }): T[] {
  if (!de.registroId && !de.tarjeta) return [];
  const vistos = new Set<string>();
  return reportes
    .filter((r) => (!!de.registroId && r.registroId === de.registroId) || (!!de.tarjeta && r.tarjeta === de.tarjeta))
    .filter((r) => (vistos.has(r.id) ? false : (vistos.add(r.id), true)))
    .sort((a, b) => b.hechoEn.localeCompare(a.hechoEn));
}

export interface ResumenVehiculo {
  aperturas: number;
  reportes: number;
  /** Dias distintos (en Queretaro) con algo en la caseta. */
  dias: number;
  primero: string | null;
  ultimo: string | null;
  /** Por motivo, de mas a menos. */
  motivos: { clase: ClaseReporte; motivo: string; rotulo: string; n: number }[];
  /** Por puerta, de mas a menos. */
  puertas: { puerta: string; titulo: string; n: number }[];
}

const contar = (claves: string[]): [string, number][] => {
  const m = new Map<string, number>();
  for (const k of claves) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

export function resumenVehiculo(mios: ReporteDelTag[]): ResumenVehiculo {
  const orden = [...mios].sort((a, b) => a.hechoEn.localeCompare(b.hechoEn));
  return {
    aperturas: mios.filter((r) => r.clase === "apertura").length,
    reportes: mios.filter((r) => r.clase === "reporte").length,
    dias: new Set(mios.map((r) => diaDe(r.hechoEn))).size,
    primero: orden[0]?.hechoEn ?? null,
    ultimo: orden[orden.length - 1]?.hechoEn ?? null,
    motivos: contar(mios.map((r) => `${r.clase}|${r.motivo}`)).map(([k, n]) => {
      const [clase, motivo] = k.split("|") as [ClaseReporte, string];
      return { clase, motivo, rotulo: rotuloMotivo(clase, motivo), n };
    }),
    puertas: contar(mios.map((r) => r.puerta)).map(([puerta, n]) => ({ puerta, titulo: tituloPuerta(puerta), n })),
  };
}

/**
 * Lo que la pluma leyo de ese TAG un dia, en la bitacora cargada: cuantas veces
 * abrio, cuantas lo rechazo y cuantas de esas lecturas fueron en esa puerta
 * («E2-entrada»: lote E2, sentido entrada). La apertura con el boton NO deja
 * lectura del TAG (ZK la guarda sin persona): lo que cuenta aqui es si ese mismo
 * dia el TAG si se leyo en otros pasos.
 */
export function plumaEseDia(lecturas: Lectura[], dia: string, puerta?: string): { abrio: number; rechazos: number; enEsaPuerta: number } {
  const [lote, sentido] = (puerta ?? "").split("-");
  const del = lecturas.filter((l) => l.dia === dia);
  return {
    abrio: del.filter((l) => l.ok).length,
    rechazos: del.filter((l) => !l.ok).length,
    enEsaPuerta: lote ? del.filter((l) => l.lote === lote && (!sentido || l.sentido === sentido)).length : 0,
  };
}

/** ¿El dia cae dentro de la bitacora cargada? Fuera de ella no se puede decir nada de la pluma. */
export const diaEnVentana = (dia: string, ventana: { desde: string | null; hasta: string | null }): boolean =>
  !!ventana.desde && !!ventana.hasta && dia >= ventana.desde.slice(0, 10) && dia <= ventana.hasta.slice(0, 10);

/**
 * Los OTROS vehiculos a los que la caseta abrio con el boton en la misma puerta y
 * el mismo dia que un reporte dado, en orden de hora. `vehiculos` cuenta
 * distintos (por expediente, TAG o placa, como claveVehiculo).
 */
export function otrosEnLaPuerta<T extends ReporteDelTag>(todos: T[], ref: ReporteDelTag): { otros: T[]; vehiculos: number } {
  const dia = diaDe(ref.hechoEn);
  const mia = claveVehiculo(ref);
  const otros = todos
    .filter((r) => r.clase === "apertura" && r.puerta === ref.puerta && r.id !== ref.id && diaDe(r.hechoEn) === dia && claveVehiculo(r) !== mia)
    .sort((a, b) => a.hechoEn.localeCompare(b.hechoEn));
  return { otros, vehiculos: new Set(otros.map(claveVehiculo)).size };
}

/** Como nombrar un reporte ajeno en la tabla: el nombre del expediente, o la placa, o lo que escribio el portero. */
export const quienDelReporte = (r: ReporteDelTag): string => r.nombre ?? r.placaNorm ?? r.vehiculoTexto ?? "sin identificar";
