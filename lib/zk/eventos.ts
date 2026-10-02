// La bitacora de accesos de los dos controladores inBio260, leida y limpiada.
//
// POR QUE HACE FALTA LIMPIARLA ANTES DE CONTAR NADA. El archivo del 29-sep-2026
// trajo 40,000 filas y solo 3,952 eran accesos: 29,506 (73.8%) son avisos del lector
// sin tarjeta asociada, y de los 8,508 «accesos concedidos» que quedaban, 4,556
// (53.5%) eran el mismo lector disparando varias veces por un solo coche. En bruto
// el archivo afirma 5,015 salidas contra 3,493 entradas: un exceso de 1,522 coches
// que salieron sin entrar, fisicamente imposible.
//
// LA PRUEBA DE QUE LA LIMPIEZA QUEDO BIEN ES ARITMETICA, y por eso el resumen la
// trae: entradas y salidas tienen que cuadrar. Colapsadas las rafagas, E2 queda en
// 1,714 contra 1,684 (2%) y E1 en 286 contra 268 (6%). Si el desbalance se dispara,
// el parser esta mal o cambio el comportamiento del lector; no es un dato nuevo.
//
// LA HORA ES LOCAL DE QUERETARO, no UTC. ZK escribe «2026-09-29 15:57:01» sin zona,
// en la hora del controlador. Tratar eso como UTC corre el dia seis horas y mueve
// el pico de las 14:00 a las 20:00, que es la misma clase de error que ya esta en la
// matriz de riesgos por `registros.fecha_instalacion`. Aqui se manda la cadena tal
// como vino y la conversion se hace en un solo lugar, al insertar.
import { normalizarTag, tablaZk, textoDeExportZk, TOPE_EXPORT_ZK } from "@/lib/zk/texto";

export { TOPE_EXPORT_ZK };

/**
 * Ventana para considerar dos lecturas del mismo sentido como un solo coche.
 *
 * Dos minutos, medido: hay 3,064 salidas repetidas de la misma tarjeta en menos de
 * ese plazo, y ese ruido explica por si solo el exceso de salidas sobre entradas.
 * Subirlo colapsaria entradas legitimas de quien sale y vuelve a entrar; bajarlo
 * deja pasar rafagas del lector.
 */
export const DEDUP_MIN = 2;

/** Hasta aqui es dejar y recoger, no estacionarse. 49% de las estancias. */
export const MIN_ESTANCIA_CORTA = 30;

/** Desde aqui el coche ocupa el cajon la jornada. 32% de las estancias. */
export const MIN_ESTANCIA_LARGA = 240;

/** Ventanas de ocho dias que hacen falta antes de proponer una baja. */
export const VENTANAS_PARA_BAJA = 3;

export type Sentido = "entrada" | "salida";
export type Lote = "E1" | "E2";

export interface EventoZk {
  idEvento: number;
  /** La cadena de ZK, sin tocar: hora local del controlador. */
  ocurrioEn: string;
  lote: Lote;
  /** `null` cuando el punto de acceso no dice si entra o sale. Se cuenta, no se tira. */
  sentido: Sentido | null;
  tarjeta: string;
  descripcion: string;
  concedido: boolean;
  /**
   * El departamento que la tarjeta tenia EN ESE INSTANTE. Es historia, no estado:
   * las instalaciones del dia cruzan la pluma antes de que se suba el padron a ZK
   * —que se sube al cierre— asi que salen como STOCK SATAG. Se guarda para poder
   * auditar y NUNCA se agrupa por el: el dueno se resuelve contra el padron.
   */
  departamentoEvento: string;
  /** Lectura repetida del lector. Se marca, no se descarta, para poder reajustar. */
  repeticion: boolean;
}

export interface ResumenEventos {
  filasArchivo: number;
  filasSinTarjeta: number;
  filasConTarjeta: number;
  /** Accesos concedidos ya descontadas las repeticiones: el trafico real. */
  accesos: number;
  repeticiones: number;
  /**
   * Tarjeta presente pero acceso negado («Usuario no registrado»), ya descontadas
   * las repeticiones del lector. Se mide igual que `accesos` a proposito: el conteo
   * en bruto de rechazos esta inflado por las mismas rafagas, y presentar uno
   * colapsado junto a otro sin colapsar invita a compararlos y a equivocarse.
   */
  rechazos: number;
  /** Rechazos sin colapsar, para poder ver cuanto del ruido es de la pluma. */
  rechazosBrutos: number;
  tarjetasDistintas: number;
  sinSentido: number;
  entradas: number;
  salidas: number;
  /** |entradas - salidas| / entradas. Si se dispara, la limpieza fallo. */
  desbalance: number | null;
  desde: string | null;
  hasta: string | null;
  /**
   * Cuando ZK exporto el archivo, leido de su nombre («Todos los Eventos_20261002092612»).
   * NO es hasta donde llega el archivo —eso es `hasta`— sino cuando se pidio: la
   * diferencia entre los dos es lo que ZK iba atrasado al recoger los pasos.
   */
  exportadoEn: string | null;
  diasConActividad: number;
  topeAlcanzado: boolean;
}

export interface LecturaEventos {
  eventos: EventoZk[];
  resumen: ResumenEventos;
}

const ROTULOS = ["ID de Evento", "Tiempo", "Tarjeta"];

// El punto de acceso es «Entrada 1», «Salida 1», «Entrada 2» o «Salida 2», asi que
// da el sentido y el estacionamiento de un solo campo. Se prefiere al nombre del
// dispositivo porque ese viene escrito de dos formas —«Estacionamiento 1» con
// espacio y «Estacionamiento2» sin el— y una de ellas ya causo una discrepancia
// entre dos de las herramientas de analisis.
function loteDe(punto: string, dispositivo: string): Lote {
  if (/1\s*$/.test(punto)) return "E1";
  if (/2\s*$/.test(punto)) return "E2";
  if (/1\s*$/.test(dispositivo) || /Estacionamiento\s*1/i.test(dispositivo)) return "E1";
  return "E2";
}

function sentidoDe(punto: string): Sentido | null {
  if (/entrada/i.test(punto)) return "entrada";
  if (/salida/i.test(punto)) return "salida";
  return null;
}

// «Apertura con verificacion normal» es el acceso concedido. Lo que trae tarjeta y
// no concuerda son los rechazos, sobre todo «Usuario no registrado»: 1,103 en ocho
// dias, de 156 tarjetas distintas, que es gente deteniendo el carril en hora pico.
function fueConcedido(descripcion: string): boolean {
  return /normal|concedid|valid/i.test(descripcion);
}

const dia = (ocurrioEn: string) => ocurrioEn.slice(0, 10);
const minutoDelDia = (ocurrioEn: string) =>
  Number(ocurrioEn.slice(11, 13)) * 60 + Number(ocurrioEn.slice(14, 16)) + Number(ocurrioEn.slice(17, 19)) / 60;

/**
 * Marca como repeticion la segunda y siguientes lecturas de una rafaga: mismo
 * numero de tarjeta, mismo dia, mismo sentido, mismo estacionamiento, dentro de
 * `minutos`. Conserva la primera, que es el momento en que el coche paso.
 *
 * Es pura: devuelve un arreglo nuevo y no toca el que recibe.
 */
export function marcarRepeticiones(eventos: EventoZk[], minutos: number = DEDUP_MIN): EventoZk[] {
  const porTarjeta = new Map<string, EventoZk[]>();
  for (const e of eventos) {
    const g = porTarjeta.get(e.tarjeta);
    if (g) g.push(e);
    else porTarjeta.set(e.tarjeta, [e]);
  }

  const marca = new Map<number, boolean>();
  for (const grupo of porTarjeta.values()) {
    const orden = [...grupo].sort((a, b) =>
      a.ocurrioEn < b.ocurrioEn ? -1 : a.ocurrioEn > b.ocurrioEn ? 1 : a.idEvento - b.idEvento,
    );
    let ultimo: EventoZk | null = null;
    for (const e of orden) {
      const esRafaga =
        ultimo !== null &&
        dia(ultimo.ocurrioEn) === dia(e.ocurrioEn) &&
        ultimo.sentido === e.sentido &&
        ultimo.lote === e.lote &&
        // El resultado forma parte de la identidad de la rafaga. Sin esta
        // condicion, una tarjeta rechazada y diez segundos despues admitida
        // hace que el acceso BUENO se marque como repeticion del rechazo y se
        // pierda: son dos hechos distintos, la persona reintento y paso. Se
        // detecto contrastando contra el archivo real, donde costaba un acceso
        // y una credencial del conteo de activas.
        ultimo.concedido === e.concedido &&
        minutoDelDia(e.ocurrioEn) - minutoDelDia(ultimo.ocurrioEn) <= minutos;
      marca.set(e.idEvento, esRafaga);
      if (!esRafaga) ultimo = e;
    }
  }

  return eventos.map((e) => ({ ...e, repeticion: marca.get(e.idEvento) ?? false }));
}

/**
 * Lee un export «Todos los Eventos» de ZK y devuelve solo las filas con tarjeta,
 * con las repeticiones marcadas, mas el resumen que la pantalla de importacion
 * necesita para decir si el archivo esta completo.
 *
 * Las filas sin tarjeta no se devuelven —son el lector hablando solo— pero si se
 * cuentan: una tasa de ruido que sube es una antena que empieza a fallar, y eso es
 * mantenimiento preventivo que hoy nadie ve.
 */
export function parsearEventosZk(texto: string, nombreArchivo: string | null = null): LecturaEventos {
  const tabla = tablaZk(texto, ROTULOS);

  const conTarjeta: EventoZk[] = [];
  // La ventana se mide sobre TODAS las filas del archivo, incluidas las que no
  // traen tarjeta. Esa es la cobertura real que ZK entrego, y es la que decide si
  // hay hueco contra la importacion anterior; medirla solo sobre los accesos la
  // acorta unos minutos y acabaria declarando huecos que no existen.
  const tiemposArchivo: string[] = [];
  let filasSinTarjeta = 0;

  for (const f of tabla.filas) {
    const tarjeta = normalizarTag(f["Tarjeta"]);
    const ocurrioEn = f["Tiempo"] ?? "";
    if (ocurrioEn) tiemposArchivo.push(ocurrioEn);
    const idEvento = Number(String(f["ID de Evento"] ?? "").replace(/[^0-9]/g, ""));
    if (!tarjeta || !ocurrioEn || !Number.isFinite(idEvento) || idEvento <= 0) {
      filasSinTarjeta += 1;
      continue;
    }
    const punto = f["Punto del Evento"] ?? "";
    const descripcion = f["Descripción del Evento"] ?? "";
    conTarjeta.push({
      idEvento,
      ocurrioEn,
      lote: loteDe(punto, f["Nombre de Dispositivo"] ?? ""),
      sentido: sentidoDe(punto),
      tarjeta,
      descripcion,
      concedido: fueConcedido(descripcion),
      departamentoEvento: f["Nombre de Departamento"] ?? "",
      repeticion: false,
    });
  }

  const eventos = marcarRepeticiones(conTarjeta);
  const tiempos = [...tiemposArchivo].sort();

  return {
    eventos,
    resumen: {
      ...resumirEventos(eventos),
      filasArchivo: tabla.total,
      filasSinTarjeta,
      filasConTarjeta: eventos.length,
      desde: tiempos[0] ?? null,
      hasta: tiempos[tiempos.length - 1] ?? null,
      exportadoEn: nombreArchivo === null ? null : exportadoEnDe(nombreArchivo),
      diasConActividad: new Set(tiemposArchivo.map(dia)).size,
      topeAlcanzado: tabla.topeAlcanzado,
    },
  };
}

/**
 * Las cifras del resumen que salen de los eventos mismos, vengan de un archivo o de
 * la base. Es UNA funcion para las dos fuentes a proposito: si el archivo y la base
 * contaran los rechazos de forma distinta, la pantalla diria dos cosas del mismo dia.
 */
export function resumirEventos(eventos: EventoZk[]) {
  const utiles = eventos.filter((e) => e.concedido && !e.repeticion);
  const entradas = utiles.filter((e) => e.sentido === "entrada").length;
  const salidas = utiles.filter((e) => e.sentido === "salida").length;
  return {
    accesos: utiles.length,
    repeticiones: eventos.filter((e) => e.repeticion).length,
    rechazos: eventos.filter((e) => !e.concedido && !e.repeticion).length,
    rechazosBrutos: eventos.filter((e) => !e.concedido).length,
    tarjetasDistintas: new Set(utiles.map((e) => e.tarjeta)).size,
    sinSentido: eventos.filter((e) => e.sentido === null).length,
    entradas,
    salidas,
    desbalance: entradas > 0 ? Math.abs(entradas - salidas) / entradas : null,
  };
}

/** Lo que `zk_importaciones` sabe de cada ventana guardada y el resumen necesita. */
export interface VentanaGuardada {
  /** El nombre del archivo: de ahi sale la hora de exportacion mientras la base no la guarde (bloque 82). */
  archivo?: string;
  filasArchivo: number;
  filasConTarjeta: number;
  topeAlcanzado: boolean;
  desde: string | null;
  hasta: string | null;
  exportadoEn?: string | null;
}

/** Fecha de PostgREST («2026-09-22T06:00:00») o del parser, a la forma del parser. */
const formaParser = (v: string | null | undefined): string | null => (v ? v.replace("T", " ").slice(0, 19) : null);

/**
 * El mayor hueco entre ventanas CONSECUTIVAS, ordenadas por donde empiezan.
 *
 * No sirve el `hueco_dias` guardado: se calculo al subir, contra la ventana mas
 * reciente de ese momento, asi que una ventana subida fuera de orden lo deja mal
 * para siempre y una ventana vieja que cierra el hueco no lo apaga. Aqui se
 * recalcula con lo que la base si sabe de todas: `desde` y `hasta`. Devuelve
 * tambien entre que dos ventanas esta, para poder decirlo en pantalla.
 */
export function huecoMayor(ventanas: VentanaGuardada[]): { dias: number; hastaAnterior: string; desdeSiguiente: string } | null {
  const conFechas = ventanas
    .map((v) => ({ desde: formaParser(v.desde), hasta: formaParser(v.hasta) }))
    .filter((v): v is { desde: string; hasta: string } => v.desde !== null && v.hasta !== null)
    .sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0));
  let peor: { dias: number; hastaAnterior: string; desdeSiguiente: string } | null = null;
  let hastaCubierto: string | null = null;
  for (const v of conFechas) {
    if (hastaCubierto !== null) {
      const d = huecoEnDias(hastaCubierto, v.desde) ?? 0;
      if (d > 0 && (peor === null || d > peor.dias)) peor = { dias: d, hastaAnterior: hastaCubierto, desdeSiguiente: v.desde };
    }
    // Lo cubierto crece con la ventana que llega mas lejos, no con la ultima en
    // empezar: una ventana corta dentro de otra larga no abre un hueco.
    if (hastaCubierto === null || v.hasta > hastaCubierto) hastaCubierto = v.hasta;
  }
  return peor;
}

/**
 * Una lectura reconstruida DESDE LA BASE: los eventos guardados de varias ventanas
 * mas lo que `zk_importaciones` dice de cada archivo.
 *
 * Es lo que hace que la pestana no dependa del archivo que alguien subio en su
 * navegador: quien abra la pestana manana ve lo mismo. Lo que la base no guarda
 * —las filas sin tarjeta— se reconstruye por diferencia con lo que el archivo traia,
 * que si quedo contado en la importacion. `desde` y `hasta` son los de las ventanas,
 * no los de los eventos: la cobertura real es la del archivo, igual que al parsear.
 */
export function lecturaDesdeBase(eventos: EventoZk[], ventanas: VentanaGuardada[]): LecturaEventos {
  // Las repeticiones se vuelven a marcar sobre la UNION, no se toma la marca
  // guardada: cada archivo las marco por su cuenta, y una rafaga partida entre el
  // final de uno y el principio del siguiente dejaria dos «primeras lecturas». La
  // funcion es pura y la base trae concedidos y rechazados completos, asi que el
  // resultado es el mismo que si todo hubiera venido en un solo archivo.
  const ordenados = marcarRepeticiones(eventos).sort((a, b) =>
    a.ocurrioEn < b.ocurrioEn ? -1 : a.ocurrioEn > b.ocurrioEn ? 1 : a.idEvento - b.idEvento,
  );
  // Sumas de archivos, no de eventos: con ventanas traslapadas son cotas superiores
  // (la fila del traslape esta en dos archivos y una vez en la base). La pantalla
  // lo dice como «los archivos sumaban», no como «habia».
  const filasArchivo = ventanas.reduce((s, v) => s + v.filasArchivo, 0);
  const filasConTarjeta = ventanas.reduce((s, v) => s + v.filasConTarjeta, 0);
  const desdes = ventanas.map((v) => formaParser(v.desde)).filter((x): x is string => x !== null).sort();
  const hastas = ventanas.map((v) => formaParser(v.hasta)).filter((x): x is string => x !== null).sort();
  const ultima = [...ventanas].sort((a, b) => ((formaParser(a.hasta) ?? "") < (formaParser(b.hasta) ?? "") ? 1 : -1))[0];
  return {
    eventos: ordenados,
    resumen: {
      ...resumirEventos(ordenados),
      filasArchivo,
      filasSinTarjeta: Math.max(0, filasArchivo - filasConTarjeta),
      filasConTarjeta: ordenados.length,
      desde: desdes[0] ?? null,
      hasta: hastas[hastas.length - 1] ?? null,
      // La hora de exportacion sale del nombre del archivo mientras la base no la
      // guarde (bloque 82, sin aplicar): asi no hay orden de despliegue que cuidar.
      exportadoEn: ultima ? (ultima.exportadoEn ?? (ultima.archivo ? exportadoEnDe(ultima.archivo) : null)) : null,
      diasConActividad: new Set(ordenados.map((e) => dia(e.ocurrioEn))).size,
      // Solo la ULTIMA ventana: es la unica cuyo tope no esta ya contado como hueco
      // por la siguiente. Cuantas se truncaron en total lo dice la pantalla aparte.
      topeAlcanzado: ultima?.topeAlcanzado ?? false,
    },
  };
}

/**
 * Dias entre el final de la ventana anterior y el principio de la nueva.
 *
 * Es el numero que decide si el panel de bajas se puede encender: un hueco
 * convierte una credencial activa en una aparentemente muerta, y con el tope de
 * 40,000 filas los huecos ocurren en cuanto la importacion se retrasa. Devuelve 0
 * si las ventanas se tocan o se traslapan, y `null` si no hay ventana anterior.
 */
export function huecoEnDias(hastaAnterior: string | null, desdeNuevo: string | null): number | null {
  if (!hastaAnterior || !desdeNuevo) return null;
  const a = Date.parse(hastaAnterior.replace(" ", "T") + "Z");
  const b = Date.parse(desdeNuevo.replace(" ", "T") + "Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, (b - a) / 86_400_000);
}

/**
 * La marca de tiempo que ZK pone en el nombre de todo lo que exporta:
 * «Todos los Eventos_20261002092612.xls» es el 2 de octubre de 2026 a las 09:26:12.
 * Se devuelve con la misma forma que `ocurrioEn` para poder compararla con `hasta`.
 * Un nombre sin marca, o con una marca imposible, da `null`: no se inventa una fecha.
 */
export function exportadoEnDe(nombre: string): string | null {
  const m = /_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.[A-Za-z0-9]+$/.exec(nombre.trim());
  if (!m) return null;
  const [, a, mes, d, h, mi, s] = m;
  const fuera =
    Number(mes) < 1 || Number(mes) > 12 || Number(d) < 1 || Number(d) > 31 ||
    Number(h) > 23 || Number(mi) > 59 || Number(s) > 59;
  return fuera ? null : `${a}-${mes}-${d} ${h}:${mi}:${s}`;
}

/**
 * Lee el archivo que el usuario eligio, venga en Excel —que es lo que ZK propone por
 * defecto— o en CSV/TXT. La deteccion vive en `textoDeExportZk`.
 */
export async function leerEventosZk(archivo: File): Promise<LecturaEventos> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const lectura = parsearEventosZk(await textoDeExportZk(bytes), archivo.name);
  if (lectura.resumen.filasArchivo === 0) {
    throw new Error(
      "El archivo no trae «Todos los Eventos» de ZK (columnas ID de Evento, Tiempo y Tarjeta). Revise que haya exportado ese reporte, en Excel o en CSV.",
    );
  }
  return lectura;
}
