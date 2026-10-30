// Lecturas de la Bandeja de Sistemas (rediseño de TI, fase 1; 21-oct).
//
// Junta lo que ya leen las demás pantallas (expedientes, inventario, casos,
// caseta, archivos y movimientos de ZK) y lo convierte en la entrada de
// lib/bandeja.ts. No escribe nada. Cada fuente se lee aparte: si una falla (por
// rol o por red), la Bandeja sigue con las demás y lo dice.
import { supabaseAuth } from "./auth";
import { esMovimientoDecidido, esPendienteSinDecidir } from "@/lib/zk/movimientos";
import {
  getUltimaCargaPadronZk,
  listAvisosCaseta,
  listCasos,
  listImportacionesZk,
  listMovimientosZk,
  listNotasSinExpediente,
  listPadronZk,
  listRegistros,
  listReportesCaseta,
  listTagsInventario,
  listTandasZk,
  listUltimasCargasPuertas,
  nombreDesdeEmail,
} from "./apiPanel";
import { avisoVivo, estadoAviso, seguimientoDeReporte } from "@/lib/caseta";
import { diasDesde, tagsPorLunes, vivosEnBajasZk, type EntradaBandeja, type HechoHoy } from "@/lib/bandeja";
import { fechaHora } from "@/lib/formato";
import { textoVehiculo } from "@/lib/vehiculo";
import type { Registro } from "@/lib/mock/types";

/** Una familia que pagó y espera su TAG: la franja de Instalar. */
export interface EsperaTag { id: string; nombre: string; placa: string | null; vehiculo: string; pagoEn: string | null }

export interface LecturaBandeja {
  entrada: EntradaBandeja;
  porInstalar: EsperaTag[];
  /** Fuentes que no se pudieron leer: la Bandeja lo dice en vez de callar. */
  fallas: string[];
}

const hoyLocal = () => new Date().toLocaleDateString("en-CA");

/** Lo mismo que la fila de «Instalar TAG»: pendiente, sin TAG y con pago (VistaTi). */
export function enEsperaDeTag(registros: Registro[]): EsperaTag[] {
  return registros
    .filter((r) => r.estado === "pendiente" && !r.noDispositivo && r.pagos.length > 0)
    .map((r) => ({
      id: r.id,
      nombre: r.usuarioNombre,
      placa: r.placas,
      vehiculo: textoVehiculo(r),
      pagoEn: r.pagos.map((p) => p.fecha).filter((f): f is string => !!f).sort()[0] ?? null,
    }))
    .sort((a, b) => (a.pagoEn ?? "").localeCompare(b.pagoEn ?? ""));
}

/** El valor de una lectura que salió bien; si falló, anota su nombre y usa `vacio`. */
function valor<T>(r: PromiseSettledResult<T>, nombre: string, fallas: string[], vacio: T): T {
  if (r.status === "fulfilled") return r.value;
  fallas.push(nombre);
  return vacio;
}

export async function leerBandeja(): Promise<LecturaBandeja> {
  const fallas: string[] = [];
  const ahora = Date.now();
  // Cada fuente aparte: si una falla (por rol o por red), las demás siguen y la
  // Bandeja dice cuál no se leyó, en vez de mostrarla como vacía.
  const r = await Promise.allSettled([
    listRegistros(), listTagsInventario(), listCasos(), listReportesCaseta({ dias: 30 }), listAvisosCaseta(30),
    listImportacionesZk(), getUltimaCargaPadronZk(), listUltimasCargasPuertas(), listMovimientosZk(), listTandasZk(),
    listNotasSinExpediente(), listPadronZk(),
  ] as const);
  const registros = valor(r[0], "expedientes", fallas, []);
  const inventario = valor(r[1], "inventario", fallas, []);
  const casos = valor(r[2], "casos", fallas, []);
  const reportes = valor(r[3], "reportes de la caseta", fallas, []);
  const avisos = valor(r[4], "avisos a la caseta", fallas, []);
  const importaciones = valor(r[5], "archivos de eventos", fallas, []);
  const padron = valor(r[6], "archivo de Personas", fallas, null);
  const puertas = valor(r[7], "archivos de puertas", fallas, {});
  const movs = valor(r[8], "movimientos de ZK", fallas, []);
  const tandas = valor(r[9], "tandas de ZK", fallas, []);
  const notas = valor(r[10], "buzón", fallas, []);
  const padronZk = valor(r[11], "padrón de ZK", fallas, []);

  const nuevos = casos.filter((c) => c.estado === "nuevo");
  const sinAcceso = reportes.filter((r) => r.clase === "apertura" && r.veredicto === "no-abre" && seguimientoDeReporte(r) === "sin-seguimiento");
  const hoy = hoyLocal();
  const vivosSinResp = avisos.filter((a) => avisoVivo(estadoAviso(a, hoy)) && a.respuestas.length === 0);
  const cargasPuertas = Object.values(puertas);
  const tandaAbierta = tandas.find((t) => t.estado === "abierta") ?? null;

  const entrada: EntradaBandeja = {
    casetaSinAcceso: sinAcceso.map((r) => ({
      quien: r.nombre ?? r.placas ?? r.placaNorm ?? "un vehículo sin identificar",
      cuando: `${fechaHora(r.hechoEn)} · reportó ${nombreDesdeEmail(r.hechoPor)}`,
      dias: diasDesde(r.hechoEn, ahora) ?? 0,
    })),
    casetaSinCaso: reportes.filter((r) => r.clase === "apertura" && seguimientoDeReporte(r) === "sin-caso" && !r.registroId).length,
    avisosSinRespuesta: { n: vivosSinResp.length, masViejoDias: Math.max(0, ...vivosSinResp.map((a) => diasDesde(a.creadoEn, ahora) ?? 0)) },
    casosNuevos: {
      n: nuevos.length,
      masViejoDias: Math.max(0, ...nuevos.map((c) => diasDesde(c.creadoEn, ahora) ?? 0)),
      urgentes: nuevos.filter((c) => c.urgente).length,
    },
    inventario: {
      disponibles: inventario.filter((t) => t.asignadoA === null).length,
      lunes: tagsPorLunes(registros.map((r) => r.fechaInstalacion), hoy),
    },
    archivos: {
      eventos: diasDesde(importaciones[0]?.importadoEn ?? null, ahora),
      personas: diasDesde(padron?.cargadoEn ?? null, ahora),
      // Las 4 puertas van juntas: cuenta la más vieja, y si falta una, nunca.
      puertas: cargasPuertas.length < 4 ? null : Math.max(...cargasPuertas.map((c) => diasDesde(c!.cargadoEn, ahora) ?? 0)),
    },
    zk: {
      // La misma regla que Movimientos en ZK (29-oct): solo lo decidido cuenta.
      pendientes: movs.filter((m) => m.estado === "pendiente" && esMovimientoDecidido(m)).length,
      sinDecidir: movs.filter(esPendienteSinDecidir).length,
      noCoincide: movs.filter((m) => m.estado === "no_coincide").length,
      porVerificar: movs.filter((m) => m.estado === "hecho").length,
      tandaAbierta: tandaAbierta ? { numero: tandaAbierta.numero, faltan: tandaAbierta.pasos.filter((p) => !p.hecho).length } : null,
    },
    notasBuzon: notas.length,
    enBajasZk: vivosEnBajasZk(registros, padronZk).length,
  };
  return { entrada, porInstalar: enEsperaDeTag(registros), fallas };
}

/** Los expedientes vivos en SATAG que ZK ya tiene en BAJAS, para darlos de baja aquí también. */
export async function leerVivosEnBajasZk(): Promise<{ registros: Registro[]; padronAl: string | null }> {
  const [registros, padron, carga] = await Promise.all([listRegistros(), listPadronZk(), getUltimaCargaPadronZk()]);
  return { registros: vivosEnBajasZk(registros, padron), padronAl: carga?.cargadoEn ?? null };
}

/**
 * Lo que Sistemas hizo hoy (desde la medianoche de Querétaro), por quién. Sale de
 * los rastros que ya deja cada proceso: no hay un registro aparte.
 */
export async function listHechoHoy(): Promise<HechoHoy[]> {
  const desde = new Date(`${hoyLocal()}T00:00:00-06:00`).toISOString();
  const quien = (v: string | null | undefined) => (!v ? "Sistemas" : v.includes("@") ? nombreDesdeEmail(v) : v);
  const leer = async <T,>(q: PromiseLike<{ data: T[] | null; error: unknown }>) => { const r = await q; return r.error ? [] : r.data ?? []; };
  const [inst, movs, notas, imps, padron, puertas, tandas, avisos] = await Promise.all([
    leer(supabaseAuth.from("registros").select("instalado_en, instalado_por_email, instalado_por, placas").gte("instalado_en", desde)),
    leer(supabaseAuth.from("movimientos").select("tipo, hecho_por, created_at").gte("created_at", desde).in("tipo", ["cambio", "baja", "reposicion", "rectificacion"])),
    leer(supabaseAuth.from("casos_notas").select("clase, estado_despues, hecho_por, hecho_en").gte("hecho_en", desde).in("clase", ["estado", "nota"])),
    leer(supabaseAuth.from("zk_importaciones").select("importado_por, importado_en").gte("importado_en", desde)),
    leer(supabaseAuth.from("zk_padron_cargas").select("cargado_por, cargado_en").gte("cargado_en", desde)),
    leer(supabaseAuth.from("zk_puertas_cargas").select("cargado_por, cargado_en").gte("cargado_en", desde)),
    leer(supabaseAuth.from("zk_tandas").select("numero, hecha_por, hecha_en").gte("hecha_en", desde)),
    leer(supabaseAuth.from("caseta_avisos").select("creado_por, creado_en").gte("creado_en", desde)),
  ]);
  type R = Record<string, string | null>;
  const MOV: Record<string, string> = { cambio: "Actualizó datos", baja: "Dio de baja", reposicion: "Repuso un TAG", rectificacion: "Corrigió un expediente" };
  const EST: Record<string, string> = { abierto: "Tomó un caso", esperando: "Puso un caso en espera", consultar: "Pasó un caso al CP", resuelto: "Cerró un caso", descartado: "Descartó un caso" };
  return [
    ...(inst as R[]).map((r) => ({ en: r.instalado_en!, quien: quien(r.instalado_por_email ?? r.instalado_por), que: `Instaló un TAG${r.placas ? ` (${r.placas})` : ""}` })),
    ...(movs as R[]).map((r) => ({ en: r.created_at!, quien: quien(r.hecho_por), que: MOV[r.tipo!] ?? "Movió un expediente" })),
    ...(notas as R[]).map((r) => ({ en: r.hecho_en!, quien: quien(r.hecho_por), que: r.clase === "nota" ? "Anotó en un caso" : EST[r.estado_despues ?? ""] ?? "Movió un caso" })),
    ...(imps as R[]).map((r) => ({ en: r.importado_en!, quien: quien(r.importado_por), que: "Subió Todos los Eventos de ZK" })),
    ...(padron as R[]).map((r) => ({ en: r.cargado_en!, quien: quien(r.cargado_por), que: "Subió Personas de ZK" })),
    ...(puertas as R[]).map((r) => ({ en: r.cargado_en!, quien: quien(r.cargado_por), que: "Subió una puerta de ZK" })),
    ...(tandas as R[]).map((r) => ({ en: r.hecha_en!, quien: quien(r.hecha_por), que: `Terminó la tanda ${r.numero} en ZK` })),
    ...(avisos as R[]).map((r) => ({ en: r.creado_en!, quien: quien(r.creado_por), que: "Avisó a la caseta" })),
  ].filter((x) => !!x.en);
}
