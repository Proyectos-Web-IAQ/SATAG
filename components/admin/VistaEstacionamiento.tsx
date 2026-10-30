"use client";

// El contenedor de la pestana Estacionamiento: consigue las cifras y se las pasa al
// panel, que solo dibuja.
//
// DE DONDE SALE CADA COSA
//   - La BITACORA la trae TI en un archivo. Se lee en el navegador, se mide ahi
//     mismo y ademas se manda a la base para que haya serie. No se sube a Storage:
//     del archivo solo viaja su SHA-256, que es lo que impide procesarlo dos veces.
//   - El PADRON sale de `registros`, que desde el 1-oct ya tiene los expedientes
//     migrados. Es lo que resuelve de quien es cada tarjeta y que derecho de pluma
//     tiene.
//   - El DEPARTAMENTO fino —PRIMARIA DOCENTE, SECUNDARIA, MANTENIMIENTO— vive solo
//     en ZK: SATAG no lo modela, y modelarlo seria duplicar un catalogo que otro
//     sistema mantiene. Por eso el export de personas es un SEGUNDO archivo y es
//     OPCIONAL: sin el la pantalla funciona igual, agrupando por los cinco grupos
//     del padron, y con el aparece el desglose por departamento.
//
// DESDE EL 2-OCT LA PESTANA SE ABRE CON LO GUARDADO. Al montar, si hay ventanas en
// `zk_importaciones`, baja de `zk_eventos` las ultimas DIAS_SERIE y mide con eso:
// quien abra la pestana manana ve lo mismo que quien subio el archivo. El archivo
// pasa a ser la forma de AGREGAR una ventana: se lee en el navegador, se mide ahi
// mismo para revisarlo, y al guardarlo la pestana vuelve a leer de la base, ya con
// la ventana nueva adentro. La medicion sigue en el navegador —no en la base— por
// la misma razon de siempre: es la misma funcion para las dos fuentes, y una ventana
// son ~9,600 filas que bajan en diez peticiones.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Loader from "@/components/Loader";
import PanelEstacionamiento, { CoberturaDias, type DatosEstacionamiento, type VistaPanel } from "@/components/admin/PanelEstacionamiento";
import GenteEstacionamiento, { SeccionesEstacionamiento } from "@/components/admin/GenteEstacionamiento";
import type { Registro } from "@/lib/mock/types";
import { textoVehiculo } from "@/lib/vehiculo";
import TableroCasos from "@/components/admin/casos/TableroCasos";
import type { ExpedienteTag } from "@/components/admin/casos/GraficasCaso";
import LecturasZk from "@/components/admin/LecturasZk";
import { useGes } from "@/components/admin/IdentificacionGes";
import { indexarRecogida, salidaPorClave, salidaPorGrupo, viajesPorSeccion } from "@/lib/recogida";
import {
  cargarAperturasBotonZk,
  cargarEventosZk,
  altasDesdeZk,
  cargarPadronZk,
  getEstacionamientos,
  getUltimaCargaPadronZk,
  listImportacionesZk,
  listPadronEstacionamiento,
  listRegistros,
  idsEventosGuardados,
  listPadronZk,
  verificarMovimientosZk,
  type CargaPadronZk,
  type FilaPadronZk,
  type ImportacionZk,
  type MetaPadronZk,
  type PadronEstacionamiento,
  type RespuestaCargaPadronZk,
} from "@/lib/supabase/apiPanel";
import { listEventosZk } from "@/lib/supabase/apiEventos";
import { anotarTiempo } from "@/lib/medir";
import { corteDe, inicioDe, medirEleccion, medirEstacionamiento } from "@/lib/estacionamiento";
import { GLOSARIO } from "@/lib/glosario";
import { exportadoEnDe, huecoEnDias, huecoMayor, lecturaDesdeBase, leerEventosZk, type LecturaEventos } from "@/lib/zk/eventos";
import { grupoDeExpediente, GRUPO_INSTITUCIONAL, SIN_CLASIFICAR, grupoDeDepto, indexarPadron, leerPadronZk, type Fuentes, type PersonaZk } from "@/lib/zk/padron";
import type { RolPanel } from "@/lib/supabase/auth";
import { fecha, fechaHora as fechaHoraFmt } from "@/lib/formato";
import { huella } from "@/lib/huella";
import CargaPuertasZk, { textoVerificacion } from "@/components/admin/CargaPuertasZk";

/** Quien puede ver el detalle con nombres. Direccion mira agregados. */
const VEN_IDENTIDAD: RolPanel[] = ["ti", "contador", "super"];
/** Quien puede leer GES (RLS del bloque 92): con eso los papas se parten por la seccion de sus hijos. */
const LEEN_GES: RolPanel[] = ["ti", "contador", "admin", "super"];
/** Quien puede AGREGAR ventanas: los mismos que pasa `panel_exigir_rol` en cargar_eventos_zk (bloque 78). */
const CARGAN: RolPanel[] = ["ti", "super"];

/**
 * Cuantos dias hacia atras se bajan de la base al abrir la pestana.
 *
 * Ocho semanas: bastan para un dia tipico con decenas de dias comparables y para
 * ver si una credencial dejo de usarse, y son del orden de 80,000 filas, que bajan
 * en menos de un minuto. Una temporada entera serian cientos de miles de filas que
 * el dia tipico no necesita. Si hace falta mirar mas atras, es una decision de
 * producto, no una constante que subir a ciegas.
 */
const DIAS_SERIE = 56;

/**
 * LO QUE SE CONSERVA AL CAMBIAR DE PESTANA. El panel desmonta esta vista cuando se
 * va a otra pestana, y sin esto volver significaba bajar otra vez toda la bitacora
 * y perder el padron de personas de ZK y el archivo recien elegido: paso el 2-oct,
 * con los archivos ya subidos. Vive fuera del componente, dura lo que la sesion
 * del navegador, y se vacia sola al volver a leer de la base.
 */
const memoria: {
  padron?: PadronEstacionamiento[];
  importaciones?: ImportacionZk[];
  cupos?: Record<string, number | null>;
  lectura?: LecturaEventos | null;
  origen?: "base" | "archivo";
  serie?: { ventanas: ImportacionZk[]; truncada: boolean; desde: string | null } | null;
  personas?: Map<string, PersonaZk> | null;
  cargaPadron?: CargaPadronZk | null;
  archivo?: string | null;
  bytes?: ArrayBuffer | null;
  /** El padron completo de SATAG, que solo piden las vistas de gente. */
  registros?: Registro[];
} = {};

/** «2026-10-02T18:55:00+00:00» a «02/10/2026». */
const fechaCorta = (iso: string | null | undefined): string => fecha(iso);
/** «2026-10-02T09:29:57» a «02/10/2026 09:29», que es la hora de pared de ZK. */
const fechaHora = (iso: string | null | undefined): string => fechaHoraFmt(iso);

/** «2026-09-22 18:42:00» menos N dias, a medianoche, con la misma forma. */
function restarDias(hasta: string, dias: number): string {
  const t = Date.parse(hasta.slice(0, 10) + "T00:00:00Z") - dias * 86_400_000;
  return new Date(t).toISOString().slice(0, 10) + " 00:00:00";
}

/** El expediente de cada TAG, para el cuadro de TAGs de un caso: el vigente manda sobre uno dado de baja; los anteriores, despues. */
function expedientesPorTag(padron: PadronEstacionamiento[]): Map<string, ExpedienteTag> {
  const m = new Map<string, ExpedienteTag>();
  const de = (p: PadronEstacionamiento, anterior: boolean): ExpedienteTag => ({ folio: p.folio, estado: p.estado, anterior, placas: p.placas, vehiculo: textoVehiculo(p) });
  const vivo = (p: PadronEstacionamiento) => p.estado !== "baja";
  for (const p of padron) {
    const ya = m.get(p.noDispositivo);
    if (p.noDispositivo && (!ya || ya.anterior || (!vivo({ estado: ya.estado } as PadronEstacionamiento) && vivo(p)))) m.set(p.noDispositivo, de(p, false));
  }
  for (const p of padron) for (const t of p.tagsAnteriores) if (t && !m.has(t)) m.set(t, de(p, true));
  return m;
}

/** Las vistas que atiende este contenedor: las del panel, las dos de gente y la de los archivos de ZK. */
export type VistaEstac = VistaPanel | "lotes" | "secciones" | "archivos" | "casos" | "lecturas";

export default function VistaEstacionamiento({ rol, email, vista }: { rol: RolPanel; email: string | null; vista: VistaEstac }) {
  const [padron, setPadron] = useState<PadronEstacionamiento[] | null>(memoria.padron ?? null);
  const [importaciones, setImportaciones] = useState<ImportacionZk[]>(memoria.importaciones ?? []);
  // Cajones contados por estacionamiento (bloque 79). Sin ellos la pantalla dice
  // ocupacion pero no saturacion; un lote sin contar se queda en `null`.
  const [cupos, setCupos] = useState<Record<string, number | null>>(memoria.cupos ?? { E1: null, E2: null });
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(memoria.padron === undefined);

  const [lectura, setLectura] = useState<LecturaEventos | null>(memoria.lectura ?? null);
  // De donde salio lo que se esta midiendo: la base (lo guardado, igual para todos)
  // o un archivo que alguien acaba de elegir y todavia no guarda.
  const [origen, setOrigen] = useState<"base" | "archivo">(memoria.origen ?? "base");
  // Las ventanas que entraron en la lectura de la base y si se corto la serie.
  const [serie, setSerie] = useState<{ ventanas: ImportacionZk[]; truncada: boolean; desde: string | null } | null>(memoria.serie ?? null);
  const [personas, setPersonas] = useState<Map<string, PersonaZk> | null>(memoria.personas ?? null);
  // De que archivo viene el padron de ZK guardado en la base (bloque 83).
  const [cargaPadron, setCargaPadron] = useState<CargaPadronZk | null>(memoria.cargaPadron ?? null);
  const [archivo, setArchivo] = useState<string | null>(memoria.archivo ?? null);
  const [procesando, setProcesando] = useState<string | null>(null);
  /** Avance de la carga: `null` mientras no se sepa cuanto falta. */
  const [avance, setAvance] = useState<{ hechas: number; total: number } | null>(null);
  const [avisoCarga, setAvisoCarga] = useState<string | null>(null);
  // El padron que el RPC freno sin escribir, con la pregunta que hay que contestar.
  // No va a la memoria del modulo a proposito: cambiar de pestana la cancela, y
  // cancelar es lo seguro porque no se escribio nada.
  const [pendiente, setPendiente] = useState<{
    meta: MetaPadronZk;
    filas: FilaPadronZk[];
    respuesta: Extract<RespuestaCargaPadronZk, { requiereConfirmacion: true }>;
  } | null>(null);
  const bytesRef = useRef<ArrayBuffer | null>(memoria.bytes ?? null);
  // El padron completo de SATAG (con TAGs, vehiculo, movimientos): lo piden solo las
  // vistas de gente, y se baja la primera vez que se abre una.
  const [registros, setRegistros] = useState<Registro[] | undefined>(memoria.registros);
  const [cargandoRegistros, setCargandoRegistros] = useState(false);
  const [errorRegistros, setErrorRegistros] = useState<string | null>(null);

  // Cada cambio de estado que cuesta reconstruir se anota en la memoria del modulo.
  useEffect(() => {
    Object.assign(memoria, { padron: padron ?? undefined, importaciones, cupos, lectura, origen, serie, personas, cargaPadron, archivo, registros, bytes: bytesRef.current });
  }, [padron, importaciones, cupos, lectura, origen, serie, personas, cargaPadron, archivo, registros]);

  /**
   * Baja de la base las ventanas de las ultimas DIAS_SERIE y mide con ellas. Es lo
   * que corre al abrir la pestana y despues de guardar un archivo.
   */
  async function leerDeLaBase(imps: ImportacionZk[]) {
    const ultima = imps.map((i) => i.hasta).filter((h): h is string => h !== null).sort().pop() ?? null;
    if (ultima === null) {
      setLectura(null);
      setSerie(null);
      return;
    }
    const desde = restarDias(ultima, DIAS_SERIE);
    // Las ventanas que caen en el rango, para reconstruir el resumen con sus cifras.
    const ventanas = imps.filter((i) => (i.hasta ?? "") >= desde);
    // Sin total: la base no sabe cuantas filas van a venir (los traslapes y las
    // filas sin sentido no estan), y una barra que nunca llega al 100% miente.
    // Y se limpia el error de antes: Reintentar y Descartar llegan aqui directo, y un
    // aviso rojo encima de datos recien leidos contradice lo que se ve.
    setError(null);
    setProcesando("Leyendo la bitácora guardada…");
    setAvance(null);
    try {
      // Paso 2 (lib/supabase/apiEventos.ts): semanas a la vez, por cursor; y paso 0:
      // los tiempos en la consola, la misma vara antes y despues.
      const t0 = performance.now();
      const { eventos, truncado, peticiones } = await listEventosZk({ desde, hasta: ultima }, (n) =>
        setProcesando(`Leyendo la bitácora guardada… ${n.toLocaleString("es-MX")} eventos`),
      );
      const t1 = performance.now();
      anotarTiempo("bajar la bitácora", t1 - t0, `${eventos.length.toLocaleString("es-MX")} eventos en ${peticiones} peticiones`);
      const l = lecturaDesdeBase(eventos, ventanas);
      anotarTiempo("limpiar y ordenar la bitácora", performance.now() - t1);
      setLectura(l);
      setSerie({ ventanas, truncada: truncado, desde });
      setOrigen("base");
      setArchivo(null);
      bytesRef.current = null;
    } catch (err) {
      setError(`No se pudo leer la bitácora guardada. ${err instanceof Error ? err.message : ""}`.trim());
    } finally {
      setProcesando(null);
      setAvance(null);
    }
  }

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      // El padron de ZK (bloque 83) es OPCIONAL y puede no existir todavia en la
      // base: si sus lecturas fallan, la pestana sigue sin el en vez de caerse.
      const [p, i, e, zk, carga] = await Promise.all([
        listPadronEstacionamiento(), listImportacionesZk(), getEstacionamientos(),
        listPadronZk().catch(() => [] as PersonaZk[]),
        getUltimaCargaPadronZk().catch(() => null),
      ]);
      setPadron(p);
      setImportaciones(i);
      setCupos(Object.fromEntries([["E1", null], ["E2", null], ...e.map((x) => [x.clave, x.cupoLugares] as const)]));
      if (zk.length > 0) setPersonas(indexarPadron(zk));
      setCargaPadron(carga);
      setCargando(false);
      await leerDeLaBase(i);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el padrón.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    // Solo al montar, y solo si la memoria del modulo no trae ya lo de esta sesion:
    // volver de otra pestana no vuelve a bajar ~2,900 expedientes y toda la bitacora.
    if (memoria.padron === undefined) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarRegistros() {
    setCargandoRegistros(true);
    setErrorRegistros(null);
    try {
      setRegistros(await listRegistros());
    } catch (err) {
      setErrorRegistros(err instanceof Error ? err.message : "No se pudo leer el padrón.");
    } finally {
      setCargandoRegistros(false);
    }
  }

  useEffect(() => {
    if ((vista === "lotes" || vista === "secciones") && registros === undefined && !cargandoRegistros) cargarRegistros();
    // Solo cuando se entra a una vista de gente sin padron: lo demas es estado propio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista]);

  // POR QUIEN VIENE CADA AUTO (lib/recogida.ts). Con GES, los papas se parten por la
  // seccion de sus hijos y la tarde se dibuja por grupo. Solo para quien puede leer
  // GES (bloque 92); sin GES, todo sigue por departamento de ZK como antes. Son
  // hooks: van aqui, antes de cualquier `return` de la vista.
  const ges = useGes(LEEN_GES.includes(rol) && personas !== null);
  const recogida = useMemo(() => {
    if (!ges.datos || (personas === null && padron === null)) return null;
    const expedientes = new Map(
      (padron ?? []).map((p) => [p.noDispositivo, { nombre: p.nombre, tipoUsuario: p.tipoUsuario, areaAdmin: p.areaAdmin }] as const),
    );
    return indexarRecogida({ personas, expedientes, indice: ges.datos.indice, decisiones: ges.datos.decisiones });
  }, [ges.datos, personas, padron]);
  // La tarde dos veces: por los cinco grupos (la apilada) y por la etiqueta fina
  // (cada seccion y cada combinacion). La etiqueta es la MISMA de `deptoDe`.
  const tarde = useMemo(() => {
    if (!recogida || !lectura) return null;
    const esInstitucional = (t: string) => {
      const p = personas?.get(t);
      return !!p && grupoDeDepto(p.departamentoId, p.departamento) === GRUPO_INSTITUCIONAL;
    };
    const op = { corte: corteDe(lectura.resumen), inicio: inicioDe(lectura.resumen), esInstitucional };
    const etiquetaDe = (t: string) => recogida.get(t)?.etiqueta ?? (personas?.get(t)?.departamento || "No está en el padrón de ZK");
    // Solo los papas entran a «por seccion»: null deja fuera al personal, alumnos e institucionales.
    const seccionesDe = (t: string) => {
      const x = recogida.get(t);
      return x && x.esPapa ? x.secciones : null;
    };
    return {
      salida: salidaPorGrupo(lectura.eventos, (t) => recogida.get(t)?.grupo ?? "otros", op),
      detalle: salidaPorClave(lectura.eventos, etiquetaDe, null, op),
      viajes: {
        tarde: viajesPorSeccion(lectura.eventos, seccionesDe, "tarde", op),
        manana: viajesPorSeccion(lectura.eventos, seccionesDe, "manana", op),
      },
    };
  }, [recogida, lectura, personas]);

  // Paso 1 de Desarrollo/11 (30-oct): todo lo que entra a la medicion es ESTABLE
  // entre renders (useMemo/useCallback), y la medicion misma se memoriza abajo.
  // Antes vivia despues del return temprano del padron y se rehacia en cada render.
  const porTag = useMemo(() => new Map((padron ?? []).map((p) => [p.noDispositivo, p])), [padron]);
  // Un TAG que el expediente YA NO usa sigue siendo suyo en la bitacora: sus pasadas
  // viejas tienen dueno. Sin esto, un TAG cambiado o repuesto salia como credencial
  // «de nadie» (el 14273782, el TAG externo que se cambio por uno del IAQ el 28-sep).
  // El TAG vigente de otro expediente manda: solo se usa si nadie lo tiene hoy.
  const porTagAnterior = useMemo(() => {
    const m = new Map<string, PadronEstacionamiento>();
    for (const p of padron ?? []) {
      for (const t of p.tagsAnteriores) if (!porTag.has(t) && !m.has(t)) m.set(t, p);
    }
    return m;
  }, [padron, porTag]);
  const expedienteDe = useCallback((tarjeta: string) => porTag.get(tarjeta) ?? porTagAnterior.get(tarjeta), [porTag, porTagAnterior]);

  // LA REGLA QUE NO SE PUEDE OMITIR: el dueño se resuelve contra el padrón, NUNCA
  // contra el departamento que trae el evento. Las instalaciones del día cruzan la
  // pluma antes de que se suba el padrón a ZK —que se sube al cierre— así que
  // aparecen como STOCK SATAG; agrupar por ese texto las clasificaría mal todas.
  //
  // SATAG manda, pero «otro» no es una respuesta: es la ausencia de una. Cuando el
  // expediente no dice a que grupo pertenece —son 37, los que ZK tenia en «General»
  // cuando se migraron— se consulta el export de personas, que es estado de hoy. Asi
  // basta volver a exportar «Usuarios» despues de reclasificar a alguien en ZK para
  // que la pantalla lo refleje, sin tocar la base.
  //
  // Antes esta linea usaba GRUPO_POR_TIPO con un id de departamento, y ese mapa
  // traduce 'padres' y 'maestro', no '4' ni '15': el respaldo nunca llego a
  // funcionar. Lo corrige grupoDeDepto, que es el mapa del catalogo de ZK.
  const rolDe = useCallback((tarjeta: string) => {
    // 13-oct: un vehiculo del Instituto no es de una persona aunque tenga expediente.
    // Lo dice su departamento en ZK (INSTITUCIONALES), y ahi manda ZK.
    const zk = personas?.get(tarjeta);
    if (zk && grupoDeDepto(zk.departamentoId, zk.departamento) === GRUPO_INSTITUCIONAL) return GRUPO_INSTITUCIONAL;
    const r = expedienteDe(tarjeta);
    const deSatag = r ? grupoDeExpediente(r.tipoUsuario, r.areaAdmin) : undefined;
    if (deSatag) return deSatag;
    const p = personas?.get(tarjeta);
    return p ? grupoDeDepto(p.departamentoId, p.departamento) : SIN_CLASIFICAR;
  }, [personas, expedienteDe]);
  // Con GES, la clave por departamento es «por quien viene»: el departamento de ZK
  // para el personal y «Padres de primaria…» para los papas (lib/recogida.ts).
  const deptoDe = useMemo(
    () => (personas
      ? (tarjeta: string) => recogida?.get(tarjeta)?.etiqueta ?? (personas.get(tarjeta)?.departamento || "No está en el padrón de ZK")
      : undefined),
    [personas, recogida],
  );
  const tieneAmbos = useCallback((tarjeta: string) => (porTag.get(tarjeta)?.estacionamientos.length ?? 0) >= 2, [porTag]);

  // La medicion, UNA vez por bitacora y no en cada render (paso 1). Si en la consola
  // «medir el estacionamiento» sale con cada letra que se escribe, algo de aqui
  // abajo dejo de ser estable.
  const datos = useMemo<DatosEstacionamiento | null>(() => {
    if (!lectura) return null;
    const t0 = performance.now();
    const m = medirEstacionamiento(lectura.eventos, rolDe, { deptoDe, corte: corteDe(lectura.resumen), inicio: inicioDe(lectura.resumen) });
    anotarTiempo("medir el estacionamiento", performance.now() - t0, `${lectura.eventos.length.toLocaleString("es-MX")} eventos`);
    const fuentes = new Map<string, Fuentes>();
    for (const u of m.porCredencial) {
      const r = expedienteDe(u.tarjeta);
      fuentes.set(u.tarjeta, {
        satag: r !== undefined,
        hoja: r?.origenExpediente === "migracion_hoja",
        zk: personas ? personas.has(u.tarjeta) : r?.origenExpediente === "migracion_zk",
      });
    }
    return {
      m,
      eleccion: medirEleccion(lectura.eventos, tieneAmbos),
      resumen: lectura.resumen,
      cupos,
      padron: personas,
      fuentes,
      verIdentidad: VEN_IDENTIDAD.includes(rol),
      ventanas: origen === "base" ? (serie?.ventanas.length ?? 0) : importaciones.length,
      // Con un archivo, el hueco es contra la ultima ventana guardada. Con la
      // base, es el mayor hueco entre ventanas CONSECUTIVAS, recalculado con sus
      // fechas: el hueco_dias guardado se midio al subir y queda mal si una
      // ventana llego fuera de orden. Uno solo basta para invalidar el uso por
      // credencial, y se dice entre que dos fechas esta.
      ...(() => {
        if (origen === "base") {
          const h = huecoMayor(serie?.ventanas ?? []);
          return { huecoDias: h?.dias ?? null, huecoEntre: h ? { hastaAnterior: h.hastaAnterior, desdeSiguiente: h.desdeSiguiente } : null };
        }
        const ultima = importaciones[0]?.hasta ?? null;
        const d = huecoEnDias(ultima, lectura.resumen.desde);
        return {
          huecoDias: d,
          huecoEntre: d !== null && d > 0 && ultima && lectura.resumen.desde ? { hastaAnterior: ultima, desdeSiguiente: lectura.resumen.desde } : null,
        };
      })(),
      serie:
        origen === "base" && serie
          ? {
              ventanas: serie.ventanas.length,
              truncadas: serie.ventanas.filter((v) => v.topeAlcanzado).length,
              // Donde arranca la ultima ventana: si se trunco, lo que falta es lo
              // anterior a esa fecha, no lo posterior.
              ultimaDesde: [...serie.ventanas].sort((a, b) => ((a.hasta ?? "") < (b.hasta ?? "") ? 1 : -1))[0]?.desde ?? null,
            }
          : null,
    };
  }, [lectura, rolDe, deptoDe, tieneAmbos, expedienteDe, personas, cupos, rol, origen, serie, importaciones]);
  // Lo que se pasa a las hijas, estable mientras no cambie lo que lo forma: el
  // tablero de casos memoriza por `expedientes` y un Map nuevo cada render lo
  // obligaba a barrer la bitacora otra vez.
  const expedientes = useMemo(() => expedientesPorTag(padron ?? []), [padron]);
  const ventana = useMemo(() => ({ desde: lectura?.resumen.desde ?? null, hasta: lectura?.resumen.hasta ?? null }), [lectura]);
  const vienePor = useMemo(() => (recogida ? (t: string) => recogida.get(t)?.vienePor ?? null : undefined), [recogida]);

  async function elegirBitacora(f: File | null) {
    if (!f) return;
    setProcesando("Leyendo la bitácora…");
    setError(null);
    setAvisoCarga(null);
    try {
      bytesRef.current = await f.arrayBuffer();
      const l = await leerEventosZk(f);
      setLectura(l);
      setOrigen("archivo");
      setArchivo(f.name);
      // Se guarda en cuanto se lee: lo que vale es lo que queda en la base para
      // todos, no lo que se ve en este navegador. Si falla, el archivo queda en
      // pantalla con el boton para reintentar.
      if (CARGAN.includes(rol)) await guardar(l, bytesRef.current, f.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer la bitácora.");
    } finally {
      setProcesando(null);
    }
  }

  async function elegirPadronZk(f: File | null) {
    if (!f) return;
    setProcesando("Leyendo el padrón de personas…");
    setError(null);
    setAvisoCarga(null);
    setPendiente(null);
    try {
      const bytes = await f.arrayBuffer();
      const l = await leerPadronZk(f);
      if (!CARGAN.includes(rol)) {
        // Quien no carga lo usa solo en esta sesion, como antes del bloque 83.
        setPersonas(indexarPadron(l.personas));
        return;
      }
      // Quien carga NO ve el archivo: ve lo que quede en la base despues de mandarlo.
      // Si el RPC frena, la pantalla sigue mostrando el padron guardado, que es lo
      // que vale para todos, y pregunta.
      await enviarPadron(
        { archivo: f.name, sha256: await huella(bytes), filasArchivo: l.filasArchivo, exportadoEn: exportadoEnDe(f.name) },
        l.personas.map((p) => ({
          tarjeta: p.tarjeta,
          nombre: p.nombre,
          departamentoId: p.departamentoId,
          departamento: p.departamento,
          idZk: p.idZk ?? "",
          nombres: p.nombres,
          apellidos: p.apellidos,
          placa: p.placa,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el padrón de personas.");
    } finally {
      setProcesando(null);
    }
  }

  /**
   * Despues de cada carga que termina bien: quien abrio la pluma sin expediente entra
   * solo a SATAG (bloque 86). Si falla, la carga ya quedo guardada; se dice aparte y
   * no se presenta como si la carga hubiera fallado.
   */
  async function darDeAltaLasQueAbren(avisoAnterior: string) {
    try {
      const a = await altasDesdeZk(email);
      if (a.altas === 0 && a.areasAlineadas === 0) return;
      const partes: string[] = [];
      if (a.altas > 0) {
        partes.push(
          `${a.altas.toLocaleString("es-MX")} ${a.altas === 1 ? "credencial abrió la pluma sin expediente y se dio de alta" : "credenciales abrieron la pluma sin expediente y se dieron de alta"} desde ZK; falta capturar su vehículo.`,
        );
      }
      if (a.areasAlineadas > 0) {
        partes.push(
          `${a.areasAlineadas.toLocaleString("es-MX")} ${a.areasAlineadas === 1 ? "administrativo cambió" : "administrativos cambiaron"} de área para quedar como en ZK (Administración o Admon).`,
        );
      }
      setAvisoCarga(`${avisoAnterior} ${partes.join(" ")}`);
      setPadron(await listPadronEstacionamiento());
    } catch (err) {
      setAvisoCarga(
        `${avisoAnterior} No se pudieron dar de alta las credenciales que abren sin expediente: ${err instanceof Error ? err.message : "error desconocido"}.`,
      );
    }
  }

  /**
   * Manda el padron entero en una llamada; el RPC escribe solo lo que cambia (bloques
   * 83 y 84). Si el RPC FRENA —el archivo dejaria fuera a muchas personas vigentes,
   * o es mas viejo que el ultimo cargado— no escribio nada y aqui se guarda la
   * pregunta; «Aplicar de todos modos» repite la llamada con `forzar`. Al terminar
   * se relee la base: lo que se muestra es lo guardado, no lo que traia el archivo.
   */
  async function enviarPadron(meta: MetaPadronZk, filas: FilaPadronZk[]) {
    setProcesando("Guardando el padrón de personas en SATAG…");
    setError(null);
    try {
      const r = await cargarPadronZk(meta, filas, email);
      if (r.requiereConfirmacion) {
        setPendiente({ meta, filas, respuesta: r });
        return;
      }
      setPendiente(null);
      const avisoPadron = r.yaEstaba
        ? `Ese padrón ya está guardado tal cual: ${r.vigentes.toLocaleString("es-MX")} personas vigentes, nada que cambiar.`
        : `Padrón guardado: ${r.insertadas.toLocaleString("es-MX")} personas nuevas, ${r.actualizadas.toLocaleString("es-MX")} actualizadas y ${r.retiradas.toLocaleString("es-MX")} que ya no vienen en el export. ${r.vigentes.toLocaleString("es-MX")} vigentes.`;
      setAvisoCarga(avisoPadron);
      await darDeAltaLasQueAbren(avisoPadron);
      // Bloque 93: con el padron nuevo se comprueban los movimientos en ZK.
      try {
        const t = textoVerificacion(await verificarMovimientosZk(email));
        if (t) setAvisoCarga((a) => `${a ?? ""} ${t}`.trim());
      } catch {
        // Sin el 93 aplicado no hay nada que comprobar; la carga ya quedo.
      }
      const [zk, carga] = await Promise.all([listPadronZk(), getUltimaCargaPadronZk()]);
      setPersonas(zk.length > 0 ? indexarPadron(zk) : null);
      setCargaPadron(carga);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el padrón de personas.");
    } finally {
      setProcesando(null);
    }
  }

  /**
   * Manda la ventana a la base. Es lo que hace que mañana haya serie.
   *
   * SOLO LO NUEVO: antes de mandar se pregunta que ids del rango del archivo ya estan
   * guardados y se mandan solo los que faltan. Un archivo que traslapa con la ventana
   * anterior deja de costar diez peticiones para costar una o dos, uno repetido no
   * manda filas, y un export viejo que nunca se guardo entra completo.
   */
  async function guardar(l: LecturaEventos | null = lectura, bytes: ArrayBuffer | null = bytesRef.current, nombre: string | null = archivo) {
    if (!l || !bytes) return;
    setProcesando("Guardando la bitácora en SATAG…");
    setError(null);
    try {
      const sha = await huella(bytes);
      const anterior = importaciones[0]?.hasta ?? null;
      const meta = {
        archivo: nombre ?? "sin nombre",
        sha256: sha,
        filasArchivo: l.resumen.filasArchivo,
        filasConTarjeta: l.resumen.filasConTarjeta,
        topeAlcanzado: l.resumen.topeAlcanzado,
        desde: l.resumen.desde,
        hasta: l.resumen.hasta,
        // La hora del nombre del archivo. El RPC la guarda desde el bloque 82; antes
        // la ignora, asi que mandarla no depende del orden de publicacion.
        exportadoEn: l.resumen.exportadoEn,
        huecoDias: huecoEnDias(anterior, l.resumen.desde),
      };
      const conSentido = l.eventos.filter((e) => e.sentido !== null);
      const yaGuardados =
        conSentido.length > 0
          ? await idsEventosGuardados(Math.min(...conSentido.map((e) => e.idEvento)), Math.max(...conSentido.map((e) => e.idEvento)))
          : new Set<number>();
      const filas = conSentido
        .filter((e) => !yaGuardados.has(e.idEvento))
        .map((e) => ({
          idEvento: String(e.idEvento),
          ocurrioEn: e.ocurrioEn,
          lote: e.lote,
          sentido: e.sentido,
          tarjeta: e.tarjeta,
          concedido: e.concedido,
          repeticion: e.repeticion,
          departamentoEvento: e.departamentoEvento,
        }));
      const omitidos = conSentido.length - filas.length;
      setAvance({ hechas: 0, total: filas.length });
      const r = await cargarEventosZk(meta, filas, email, (hechas, total) =>
        setAvance({ hechas, total }),
      );
      const yaEstaban = r.yaEstaban + omitidos;
      // Bloque 99: las aperturas con boton van aparte (no traen tarjeta). Si fallan,
      // la bitacora ya quedo guardada: se avisa y se puede volver a subir el archivo.
      let avisoBoton = "";
      const botones = l.aperturasBoton ?? [];
      if (botones.length) {
        try {
          const b = await cargarAperturasBotonZk(botones, email);
          avisoBoton = b.insertadas > 0
            ? ` Aperturas con botón: ${b.insertadas.toLocaleString("es-MX")} nuevas.`
            : " Las aperturas con botón ya estaban guardadas.";
        } catch (e) {
          avisoBoton = ` No se guardaron las aperturas con botón (${e instanceof Error ? e.message : "error"}); vuelva a subir el archivo.`;
        }
      }
      const avisoBitacora =
        (r.insertados === 0
          ? `Esta ventana ya estaba guardada: ${yaEstaban.toLocaleString("es-MX")} eventos ya existían y no se mandó ninguno de más.`
          : `Se guardaron ${r.insertados.toLocaleString("es-MX")} eventos nuevos${yaEstaban > 0 ? ` y ${yaEstaban.toLocaleString("es-MX")} ya estaban, así que no se volvieron a mandar` : ""}.`) + avisoBoton;
      setAvisoCarga(avisoBitacora);
      await darDeAltaLasQueAbren(avisoBitacora);
      const imps = await listImportacionesZk();
      setImportaciones(imps);
      // Ya guardada, la ventana se mide junto con las demas: se vuelve a leer de
      // la base para que lo que se ve sea lo mismo que vera cualquiera.
      await leerDeLaBase(imps);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la bitácora.");
    } finally {
      setProcesando(null);
      setAvance(null);
    }
  }

  if (cargando && padron === null) return <Loader label="Leyendo el padrón…" />;

  if (error && padron === null) {
    return (
      <p className="submit-error" role="alert">
        {error}{" "}
        <button type="button" className="link-action" onClick={() => cargar()}>Reintentar</button>
      </p>
    );
  }


  const puedeCargar = CARGAN.includes(rol);
  const rango = lectura?.resumen.desde
    ? `del ${fechaCorta(lectura.resumen.desde)} al ${fechaCorta(lectura.resumen.hasta)}`
    : null;

  // El avance se ve en cualquier vista: leer la base tarda y hay que saber que pasa.
  const progreso = procesando && (
    <div className="carga">
      <p className="carga__t">
        <span role="status">{procesando}</span>
        {avance && (
          <span className="carga__n">
            {avance.hechas.toLocaleString("es-MX")} de {avance.total.toLocaleString("es-MX")} eventos
          </span>
        )}
      </p>
      <div
        className={`carga__b${avance ? "" : " carga__b--vaga"}`}
        role="progressbar"
        aria-label={procesando}
        aria-valuemin={avance ? 0 : undefined}
        aria-valuemax={avance ? avance.total : undefined}
        aria-valuenow={avance ? avance.hechas : undefined}
      >
        <i style={avance ? { width: `${Math.round((avance.hechas / Math.max(avance.total, 1)) * 100)}%` } : undefined} />
      </div>
    </div>
  );

  /* ============================================ ARCHIVOS DE ZK ============= */
  // La vista de carga, aparte de la medicion: es trabajo de TI, no lectura de todos.
  if (vista === "archivos") {
    return (
      <>
        <p className="titular__migas">
          <span>Datos</span>
          <span>›</span>
          <span>Archivos de ZK</span>
        </p>
        <h2 className="titular">
          {serie && origen === "base"
            ? `${serie.ventanas.length} ${serie.ventanas.length === 1 ? "archivo guardado" : "archivos guardados"}${rango ? `, ${rango}` : ""}.`
            : lectura && origen === "archivo"
              ? "Este archivo todavía no está guardado."
              : "Todavía no hay ninguna bitácora guardada."}
        </h2>
        <p className="titular__sub">
          {puedeCargar ? (
            <>
              Lo que mide el Estacionamiento es lo guardado en SATAG, igual para quien lo abra. Para agregar una
              semana, exporte en ZKBioSecurity <strong>{GLOSARIO.todosLosEventos.ruta}</strong> y elija el archivo
              aquí: se lee en este navegador, se guarda y la medición se actualiza sola. Del archivo solo viaja su
              huella digital, que es lo que impide procesarlo dos veces.
            </>
          ) : (
            <>Lo que se mide es lo guardado en SATAG. Las ventanas las carga TI.</>
          )}
          {serie && origen === "base" && (
            <>
              {" "}
              <button type="button" className="link-action" disabled={procesando !== null} onClick={() => cargar()}>
                Volver a leer de la base
              </button>
            </>
          )}
        </p>

        <div className="grid-2">
          {puedeCargar && <div className="field">
            <label className="label" htmlFor="arch-eventos">Archivo «{GLOSARIO.todosLosEventos.ui}» de ZK</label>
            <input
              id="arch-eventos"
              className="input"
              type="file"
              accept=".csv,.txt,.xls,.xlsx"
              disabled={procesando !== null}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                elegirBitacora(f);
              }}
            />
            <p className="hint">
              {archivo
                ? <>{archivo} · {lectura?.resumen.filasArchivo.toLocaleString("es-MX")} filas · {lectura?.resumen.diasConActividad} días</>
                : <>{GLOSARIO.todosLosEventos.que}. Sirve tal como ZK lo entrega, en Excel o en CSV.</>}
            </p>
          </div>}

          {puedeCargar && <div className="field">
            <label className="label" htmlFor="arch-personas">Archivo «{GLOSARIO.personasZk.ui}» de ZK (opcional)</label>
            <input
              id="arch-personas"
              className="input"
              type="file"
              accept=".csv,.txt,.xls,.xlsx"
              disabled={procesando !== null}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                elegirPadronZk(f);
              }}
            />
            <p className="hint">
              {cargaPadron
                ? `Guardado en SATAG: ${(personas?.size ?? cargaPadron.personas).toLocaleString("es-MX")} personas, del archivo ${cargaPadron.archivo} cargado el ${fechaCorta(cargaPadron.cargadoEn)}. Suba el export nuevo para actualizarlo; solo se escribe lo que cambie.`
                : personas
                  ? `${personas.size.toLocaleString("es-MX")} personas, solo en esta sesión.`
                  : `Sin él la pantalla funciona igual; con él aparece el desglose por departamento de ZK. Se exporta desde ${GLOSARIO.personasZk.ruta} y queda guardado para todos.`}
            </p>
          </div>}

          {puedeCargar && <CargaPuertasZk email={email} onAviso={setAvisoCarga} />}
        </div>
        {!puedeCargar && (
          <p className="ti-hint">
            {cargaPadron
              ? `Padrón de personas de ZK: ${(personas?.size ?? cargaPadron.personas).toLocaleString("es-MX")} personas, cargado por TI el ${fechaCorta(cargaPadron.cargadoEn)}.`
              : "Todavía no hay padrón de personas de ZK guardado; lo carga TI. Sin él la pantalla agrupa por los cinco grupos del padrón de SATAG."}
          </p>
        )}

        {progreso}
        {error && <p className="submit-error" role="alert">{error}</p>}
        {avisoCarga && <p className="notice" style={{ margin: "10px 0 0", padding: "10px 12px" }}>{avisoCarga}</p>}
        {pendiente && (
          <div className="notice" role="group" aria-labelledby="padron-pregunta" style={{ margin: "10px 0 0", padding: "12px 14px" }}>
            <p id="padron-pregunta" style={{ margin: 0 }}>
              <strong>No se guardó nada todavía.</strong>{" "}
              {pendiente.respuesta.motivos.includes("retira_muchos") &&
                `El archivo ${pendiente.meta.archivo} dejaría fuera a ${pendiente.respuesta.retiraria.toLocaleString("es-MX")} de las ${pendiente.respuesta.vigentes.toLocaleString("es-MX")} personas vigentes. Suele pasar cuando el export se hizo con un filtro, por ejemplo un solo departamento. `}
              {pendiente.respuesta.motivos.includes("export_anterior") &&
                `El archivo se exportó de ZK el ${fechaHora(pendiente.respuesta.exportadoEn)}, antes que el último guardado (${fechaHora(pendiente.respuesta.ultimoExportadoEn)}). Puede ser el archivo correcto para deshacer una carga equivocada, o uno viejo elegido por error. `}
              Si es el archivo correcto, aplíquelo; si no, cancele y exporte el padrón completo de nuevo.
            </p>
            <div className="chip-row" style={{ marginTop: 10 }}>
              <button type="button" className="btn" disabled={procesando !== null}
                onClick={() => enviarPadron({ ...pendiente.meta, forzar: true }, pendiente.filas)}>
                Aplicar de todos modos
              </button>
              <button type="button" className="link-action" disabled={procesando !== null} onClick={() => setPendiente(null)}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {lectura && origen === "archivo" && (
          <div className="chip-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn" disabled={procesando !== null} onClick={() => guardar()}>
              Reintentar guardar esta ventana en SATAG
            </button>
            {importaciones.length > 0 && (
              <button type="button" className="link-action" disabled={procesando !== null} onClick={() => leerDeLaBase(importaciones)}>
                Descartar y volver a lo guardado
              </button>
            )}
            <span className="ti-hint" style={{ alignSelf: "center" }}>
              {importaciones.length === 0
                ? "Este archivo no se pudo guardar y el Estacionamiento mide solo él. Todavía no hay ninguna ventana guardada."
                : `Este archivo no se pudo guardar y el Estacionamiento mide solo él. Hay ${importaciones.length} ${importaciones.length === 1 ? "ventana guardada" : "ventanas guardadas"}; al guardar se juntan.`}
            </span>
          </div>
        )}

        {datos && (
          <div className="firme">
            <div>
              <strong>Lo que hay.</strong> {datos.m.dias.length} {datos.m.dias.length === 1 ? "día" : "días"} con datos, del{" "}
              {fechaCorta(datos.m.dias[0])} al {fechaCorta(datos.m.dias[datos.m.dias.length - 1])};{" "}
              {datos.m.diasComparables.length} describen un día normal. Cada archivo que se suba se suma aquí.
            </div>
            <div className="cobertura__fila">
              <CoberturaDias dias={datos.m.dias} comparables={datos.m.diasComparables} excluidos={datos.m.diasExcluidos} />
              <span className="cobertura__leyenda">
                <span><i className="cobertura__muestra cobertura__muestra--normal" aria-hidden="true" /> día normal</span>
                <span><i className="cobertura__muestra cobertura__muestra--parcial" aria-hidden="true" /> no cuenta para la curva</span>
                <span>sin cuadro: sin bitácora</span>
              </span>
            </div>
          </div>
        )}
      </>
    );
  }

  /* ============================================ LA MEDICION ================ */
  return (
    <>
      {progreso}
      {error && !datos && (
        <p className="submit-error" role="alert">
          {error}{" "}
          <button type="button" className="link-action" onClick={() => cargar()}>Reintentar</button>
        </p>
      )}
      {datos ? (
        vista === "casos" ? (
          <TableroCasos
            rol={rol}
            email={email}
            eventos={VEN_IDENTIDAD.includes(rol) ? lectura?.eventos ?? [] : null}
            ventana={ventana}
            personas={VEN_IDENTIDAD.includes(rol) ? personas ?? null : null}
            expedientes={expedientes}
            padron={padron}
          />
        ) : vista === "lecturas" ? (
          <LecturasZk
            personas={personas}
            vienePor={vienePor}
            expedientes={expedientes}
            ultimaHasta={importaciones.map((i) => i.hasta).filter((h): h is string => h !== null).sort().pop() ?? null}
          />
        ) : vista === "lotes" || vista === "secciones" ? (
          (() => {
            const comunes = {
              m: datos.m,
              registros: registros ?? [],
              cargando: cargandoRegistros,
              error: errorRegistros,
              personas,
              deptoDe,
              rol,
              onReintentar: cargarRegistros,
            };
            return vista === "lotes" ? <GenteEstacionamiento {...comunes} /> : <SeccionesEstacionamiento {...comunes} cupos={cupos} salida={tarde?.salida ?? null} detalle={tarde?.detalle ?? null} viajes={tarde?.viajes ?? null} />;
          })()
        ) : (
          <PanelEstacionamiento d={datos} vista={vista} />
        )
      ) : procesando ? null : importaciones.length > 0 ? (
        <p className="ti-empty">
          No se pudo leer la bitácora guardada.{" "}
          <button type="button" className="link-action" onClick={() => leerDeLaBase(importaciones)}>Reintentar</button>
        </p>
      ) : (
        <p className="ti-empty">
          {puedeCargar ? (
            <>
              Todavía no hay ninguna bitácora guardada. Elija el archivo «{GLOSARIO.todosLosEventos.ui}» de
              ZKBioSecurity en «Archivos de ZK»: {GLOSARIO.todosLosEventos.ruta}. Sirve en Excel o en CSV, tal como lo
              entrega, y una vez guardado se queda para todos.
            </>
          ) : (
            <>Todavía no hay ninguna bitácora guardada. Las ventanas las carga TI desde el archivo «{GLOSARIO.todosLosEventos.ui}» de ZKBioSecurity.</>
          )}
        </p>
      )}
    </>
  );
}
