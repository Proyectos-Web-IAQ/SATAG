// Las cifras del tablero del estacionamiento, calculadas a partir de la bitacora
// de accesos ya limpia.
//
// POR QUE ESTA EN lib/ Y NO EN LA PANTALLA. Misma razon que `lib/instalaciones.ts`:
// un componente "use client" no se puede probar porque el cliente de Supabase se
// construye al cargar su modulo y aborta sin variables de entorno. Aqui las
// funciones son puras, reciben la hora por parametro y no consultan el reloj.
//
// QUIEN RESUELVE EL ROL. No el evento. El departamento que trae la bitacora es el
// que la tarjeta tenia EN ESE INSTANTE: las instalaciones del dia cruzan la pluma
// antes de que se suba el padron a ZK —que se sube al cierre— asi que aparecen como
// STOCK SATAG. Por eso estas funciones reciben `rolDe`, que el llamador implementa
// contra el padron de SATAG. Agrupar por el texto del evento mal clasifica todas
// las instalaciones de todos los dias, y el error se concentra en agosto y
// septiembre, cuando entra el 39.6% del padron.
//
// ---------------------------------------------------------------------------
// COMO SE MIDE LA OCUPACION, Y POR QUE ASI
//
// Barrido (sweep line), no muestreo. Se ordenan los instantes y se lleva un
// acumulado: +1 al entrar, -1 al salir. El maximo de ese acumulado es exacto.
//
// La version anterior muestreaba cada 15 minutos y por eso podia no ver un pico
// entero: treinta coches dentro de 14:16 a 14:28 no estan a las 14:15 ni a las
// 14:30, y la pantalla reportaba CERO. El maximo de una funcion escalonada
// muestreada en una reja es siempre menor o igual que el real; aqui era 164 contra
// 166 a las 14:17.
//
// El barrido va sobre las ESTANCIAS EMPAREJADAS, no sobre los eventos sueltos, y
// esa es la decision que hace que la pantalla no se contradiga: el titular («habia
// N coches») y la tabla que lo explica («de quienes eran») salen del MISMO computo,
// asi que su suma cuadra por construccion. Antes el titular contaba eventos netos y
// la composicion contaba estancias, y la resta —150 de 164— habia que explicarla en
// prosa.
//
// Lo que ese cambio deja fuera se declara en vez de recortarse: las entradas que
// nunca cerraron son coches que SI estaban dentro, asi que el pico confirmado es un
// piso y `Pico.hasta` lleva la cota superior. Un error acotado y con direccion es un
// error controlado; el `Math.max(0, ...)` de antes lo escondia.
//
// NOMBRE FORMAL, por si hay que defenderlo: el maximo de intervalos solapados es el
// numero de clique maximo del grafo de intervalos. Por el teorema de Helly equivale
// a «cuantos coches hay dentro en el peor instante», y como los grafos de intervalos
// son perfectos ese numero es tambien el MINIMO DE CAJONES que harian falta para que
// nadie se solape. Esa es la pregunta de Direccion.
import { mediana } from "@/lib/duracion";
import { MIN_ESTANCIA_CORTA, MIN_ESTANCIA_LARGA, type EventoZk, type Lote } from "@/lib/zk/eventos";

/** Cada cuantos minutos se muestrea la curva que se DIBUJA. El pico no sale de aqui. */
export const PASO_FRANJA = 15;

/** De las 5 a las 21: antes y despues no hay trafico que valga la pena dibujar. */
export const FRANJA_DESDE = 5 * 60;
export const FRANJA_HASTA = 21 * 60;

/**
 * Un dia entra en la envolvente si tiene al menos esta parte de los accesos del dia
 * mediano. El sabado del archivo del 29-sep trae DOS eventos: promediarlo con un
 * martes de 360 no describe ningun dia real, y antes aportaba ceros a todas las
 * franjas y jalaba la mediana hacia abajo.
 */
export const SHARE_DIA_COMPARABLE = 0.5;

/**
 * Las cubetas del histograma de permanencia, en minutos.
 *
 * Estan elegidas para que la bimodalidad se vea: el grueso de los padres cae en las
 * dos primeras y el personal en las dos ultimas. No son cuantiles —un histograma de
 * cuantiles tiene todas las barras iguales por definicion y no muestra nada—, son
 * cortes con significado operativo: un cuarto de hora es dejar y arrancar, cuatro
 * horas es media jornada, ocho es la jornada completa.
 */
export const CUBETAS_MIN = [0, 15, 30, 60, 120, 240, 480];

/**
 * Que parte del pico cuenta como «lleno de verdad».
 *
 * El 95% y no el 85% de Shoup a proposito: el umbral de Shoup dice cuando un
 * estacionamiento empieza a operar mal respecto a su AFORO, y aqui no hay aforo. Esto
 * es otra cosa y mas modesta: cuanto tiempo al dia el estacionamiento esta en su
 * propio peor momento. Es la cifra que convierte «se satura» en «se satura quince
 * minutos», que es un problema distinto y con soluciones distintas.
 */
export const SHARE_SATURACION = 0.95;

/**
 * El instante de referencia de la carga base: media manana, con el personal ya
 * dentro y antes de que llegue nadie a recoger.
 *
 * Sirve para mostrar que la ocupacion del personal es PLANA —79 coches a las 9, 91 en
 * el pico— y por tanto no es lo que satura. Sin este contraste, una pantalla que
 * dice «el 60% de los coches del pico son del personal» se lee como un reproche a
 * quien vino a trabajar.
 */
export const MINUTO_MESETA = 11 * 60;

/** La oleada se mide media hora antes del pico y un cuarto despues. */
export const OLEADA_ANTES = 30;
export const OLEADA_DESPUES = 15;

/**
 * Arriba de este porcentaje de ocupacion un estacionamiento empieza a operar mal: los
 * coches que llegan dan vueltas buscando lugar. Es la practica de referencia de la
 * literatura de estacionamientos (Shoup).
 *
 * SIRVE PARA HABLAR HOY, SIN EL AFORO. Invirtiendolo —pico dividido entre 0.85— da
 * cuantos cajones harian que el pico observado ya fuera saturacion. Eso convierte
 * «falta el denominador» en una tarea con criterio de exito: cuente los cajones, y si
 * son ese numero o menos, esta saturado. Una disculpa no se puede accionar; un umbral
 * si.
 */
export const UMBRAL_SHOUP = 0.85;

/**
 * Cuantas veces la mediana de su propio grupo tiene que durar una credencial para
 * que valga la pena mirarla.
 *
 * SE CALIBRA SOLA, y esa es la gracia: no hay una lista escrita a mano de «roles que
 * deberian rotar», que habria que mantener y que seria una opinion. La norma de cada
 * grupo la fija el grupo, y lo que se señala es quien se sale de la suya. Un maestro
 * que se queda ocho horas no aparece; un padre de familia que se queda ocho, si.
 */
export const FACTOR_FUERA_DE_NORMA = 3;

/** Quien resuelve el dueno de una tarjeta. Lo implementa el llamador. */
export type RolDe = (tarjeta: string) => string;

export interface PuntoFranja {
  minuto: number;
  /** Mediana de coches dentro a esa hora, entre los dias comparables. */
  p50: number;
  /** El cuartil de abajo y el de arriba: la banda dice si el dia tipico existe. */
  p25: number;
  p75: number;
}

/**
 * El momento mas lleno que se observo: cuantos coches, a que hora y QUE DIA.
 *
 * El dia no es decorativo: sin el, el pico y su composicion quedan en unidades
 * distintas —el pico es el maximo de UN dia y la composicion se sumaba sobre los
 * ocho de la ventana— y la tabla reportaba casi cinco veces mas coches que el pico
 * que estaba explicando.
 *
 * `dentro` son los coches CONFIRMADOS, con entrada y salida leidas. `hasta` suma, en
 * ese mismo instante, las entradas que nunca cerraron: coches que estaban dentro
 * pero cuya salida el lector no registro. El numero real esta entre los dos, y los
 * dos van a pantalla.
 */
export interface Pico {
  dentro: number;
  hasta: number;
  minuto: number | null;
  dia: string | null;
}

export interface OcupacionLote {
  lote: Lote;
  franjas: PuntoFranja[];
  pico: Pico;
  entradas: number;
  salidas: number;
  tarjetas: number;
  /** Minutos de cajon ocupados en toda la ventana, sumando todas las estancias. */
  minutosOcupados: number;
  /**
   * Quien usa ESTE estacionamiento, por grupo y por departamento.
   *
   * ES LA UNICA FORMA HONESTA DE COMPARAR LOS DOS LOTES, y conviene saber por que.
   * La mediana agregada de E1 es de ocho horas y la de E2 de media hora, lo que
   * invita a concluir «el 1 es el de jornada completa». Es falso: DENTRO de cada
   * grupo los dos lotes son casi identicos —padres 22 contra 18 minutos, docentes
   * 8h33 contra 8h11— y la diferencia agregada es COMPOSICION, no conducta. Es una
   * paradoja de Simpson de manual, y el desglose por departamento es lo que la
   * desactiva: por eso esta aqui y por eso el tipo NO ofrece una mediana por lote.
   */
  porRol: EstanciasRol[];
  porDepartamento: EstanciasRol[];
  /**
   * Una fila por credencial que uso ESTE estacionamiento, sin identidad.
   *
   * Es el tercer nivel del desglose —estacionamiento, departamento, persona— y va
   * aqui y no en la pantalla porque es agregacion: sumar los minutos de una tarjeta
   * dentro de un lote es exactamente lo que un dia va a hacer la base.
   */
  porCredencial: UsoCredencial[];
  /**
   * (entradas - salidas) / entradas, CON SIGNO, porque el signo es el diagnostico:
   * positivo = sobran entradas, faltan salidas, y el pico esta INFLADO (coches que
   * la curva deja dentro para siempre). Negativo = sobran salidas, falta la entrada
   * porque quedo fuera de la ventana, y el pico se queda corto.
   *
   * En valor absoluto los dos casos daban el mismo numero y no habia forma de saber
   * cual de las dos fallas se tenia enfrente.
   */
  desbalance: number | null;
}

export interface EstanciasRol {
  rol: string;
  estancias: number;
  medianaMin: number | null;
  p25Min: number | null;
  p75Min: number | null;
  cortas: number;
  largas: number;
  /**
   * Cuantas credenciales distintas aportaron esas estancias. Va en pantalla porque
   * once estancias de tres credenciales no es una poblacion: es una anecdota con
   * mediana, y sin este numero se lee igual que un grupo de ochocientas.
   */
  credenciales: number;
  /**
   * CUANTOS CAJONES OCUPA ESTE GRUPO A LA VEZ, en su propio peor momento.
   *
   * Es la medida de uso que se puede accionar, y la unica que esta en las mismas
   * unidades que la capacidad del estacionamiento: «primaria llega a ocupar 24
   * lugares» se compara contra cuantos hay, y «primaria acumulo 600 horas-coche» no
   * se compara contra nada.
   *
   * Es el mismo barrido que el pico general, restringido a este grupo: por el teorema
   * de Helly equivale al minimo de cajones que harian falta para que su gente no se
   * estorbe entre si.
   *
   * OJO AL SUMARLOS: los picos propios de los grupos NO suman el pico del
   * estacionamiento, porque cada grupo llega a su maximo a una hora distinta. Para
   * repartir el pico esta `cajonesEnElPico`, que si suma.
   */
  cajonesAlaVez: number;
  /**
   * Cuantos cajones de ESTE grupo estaban ocupados en el peor momento del
   * estacionamiento entero.
   *
   * Esta es la cifra que reparte el pico: la suma de todos los grupos es exactamente
   * el pico total, por construccion, porque sale del mismo barrido sobre las mismas
   * estancias.
   */
  cajonesEnElPico: number;
  /**
   * Horas-coche acumuladas en toda la ventana: la suma de todas sus estancias.
   *
   * Se conserva porque distingue a quien ocupa poco mucho tiempo de quien ocupa mucho
   * un rato, pero NO sirve de titular: son horas sumadas entre coches distintos, asi
   * que en ocho dias puede dar mas horas que las que tiene la ventana y eso desconcierta
   * con razon. Va de apoyo, nunca como medida principal.
   */
  minutosOcupados: number;
  /**
   * Estancias de este grupo que no se pudieron cerrar, y que por eso no entran en la
   * mediana. La tasa NO es aleatoria —9.1% en Padres contra 23.3% en Administracion—
   * asi que la mediana de los grupos de jornada larga es una cota inferior.
   */
  censuradas: number;
}

export interface Eleccion {
  conDerechoAmbos: number;
  siempreE1: number;
  siempreE2: number;
  mixto: number;
  /** Credenciales que solo se vieron UNA vez: su «siempre» es una sola observacion. */
  conUnaSolaEntrada: number;
}

/**
 * Cuanto tiempo al dia el estacionamiento esta en su peor momento.
 *
 * Es la cifra que cambia la conversacion: con los datos del 22-sep son QUINCE
 * MINUTOS por encima del 95% del pico, de 14:10 a 14:34, sobre una meseta plana de
 * seis horas al 65%. «El estacionamiento esta saturado» y «el estacionamiento se
 * satura un cuarto de hora» piden decisiones distintas.
 */
export interface VentanaSaturacion {
  umbral: number;
  desde: number | null;
  hasta: number | null;
  minutos: number;
}

/**
 * La oleada que produce el pico: quienes entran alrededor del momento mas lleno.
 *
 * `porLote` es el dato operativo: si la oleada entra toda por la misma pluma, el
 * problema no es cuanta gente hay sino por donde pasa.
 */
export interface Oleada {
  desde: number;
  hasta: number;
  coches: number;
  medianaMin: number | null;
  /** Cuantos de esos coches se van en `MIN_ESTANCIA_CORTA` o menos. */
  cortas: number;
  porLote: { lote: Lote; coches: number }[];
}

export interface CubetaEstancia {
  desde: number;
  /** null en la ultima: es «y de ahi para arriba». */
  hasta: number | null;
  cuantas: number;
}

export interface DiaExcluido {
  dia: string;
  motivo: string;
}

export interface Medicion {
  dias: string[];
  /** Los que entran en la envolvente. Los demas se dicen con su motivo. */
  diasComparables: string[];
  diasExcluidos: DiaExcluido[];
  ocupacion: OcupacionLote[];
  /** Pico de los dos estacionamientos juntos. */
  picoTotal: Pico;
  estancias: EstanciasRol[];
  /**
   * La mediana de TODAS las estancias, no la mediana de las medianas por rol.
   *
   * La diferencia no es fina: con los datos del 29-sep la mediana de medianas da
   * 4 h 10 m y la real 31 min, porque los padres son la mayoria de las estancias y
   * una mediana sin pesos los cuenta igual que a los once alumnos. Publicar las dos
   * en la misma pantalla era contradecirse: si mas de la mitad de las estancias son
   * de media hora o menos, la mediana NO puede ser de horas.
   */
  medianaGlobalMin: number | null;
  /** Distribucion de duraciones. Muestra la bimodalidad en vez de afirmarla. */
  histograma: CubetaEstancia[];
  /**
   * La misma distribucion, abierta por grupo.
   *
   * Es lo que convierte el valle del histograma de «una barra baja» en «aqui termina
   * una poblacion y empieza la otra»: abajo del valle los padres son el 82-92% de
   * cada barra y arriba los docentes el 55-72%. Y deja a «Sin clasificar» retratado
   * como lo que es —38% de estancias cortisimas y 26% de jornada completa— sin que
   * nadie tenga que afirmarlo.
   */
  histogramaPorRol: { rol: string; total: number; cubetas: CubetaEstancia[] }[];
  /**
   * Lo mismo que `estancias`, pero por departamento real de ZK en vez de por los
   * cinco grupos. Vacio si no se paso `deptoDe`.
   *
   * Los cinco grupos son el grano con el que se habla con Direccion; los dieciseis
   * departamentos —PRIMARIA DOCENTE, SECUNDARIA DOCENTES, MANTENIMIENTO…— son el
   * grano con el que se opera, y es el que permite saber a quien dirigirse.
   */
  porDepartamento: EstanciasRol[];
  /**
   * Una fila por credencial, SIN identidad: solo el numero de tarjeta.
   *
   * La identidad se junta en la pantalla y solo para quien tiene permiso. Asi esta
   * medicion se puede probar, se puede mover a la base y nunca toca un dato personal.
   */
  porCredencial: UsoCredencial[];
  /**
   * Credenciales cuya permanencia se sale de la norma de SU PROPIO grupo.
   *
   * La comparacion es contra la mediana del grupo al que pertenece cada una, no
   * contra un umbral fijo: asi no hace falta decidir a mano quien «deberia» rotar, y
   * la regla sigue valiendo si manana cambia la composicion del padron. Cada fila es
   * una credencial que alguien tiene que mirar, no un error del sistema.
   */
  fueraDeNorma: UsoCredencial[];
  /**
   * De quienes son los coches que estaban dentro EN EL MOMENTO del pico: el dia y
   * la hora de `picoTotal`, no la suma de la ventana.
   *
   * INVARIANTE: su total es exactamente `picoTotal.dentro`. Las dos cifras salen del
   * mismo barrido sobre las mismas estancias, asi que no pueden discrepar. Si algun
   * dia discrepan, el defecto esta aqui y no en los datos.
   */
  enElPico: { rol: string; coches: number }[];
  /** Cuanto dura el peor momento. El dato que convierte «lleno» en «lleno un rato». */
  ventana: VentanaSaturacion;
  /** Quien produce el pico, y por donde entra. */
  oleada: Oleada;
  /**
   * La misma composicion que `enElPico`, pero a media manana: la CARGA BASE.
   *
   * Va en pantalla al lado de la del pico porque las dos juntas dicen lo que ninguna
   * dice sola: la ocupacion del personal apenas se mueve entre las dos, y lo que
   * aparece en el pico es otra poblacion.
   */
  enLaMeseta: { rol: string; coches: number }[];
  /** Entradas que no cerraron: el coche se quedo, o no se leyo su salida. */
  entradasSinSalida: number;
  /**
   * Salidas sin entrada: el coche ya estaba dentro cuando arranca la ventana.
   *
   * Es censura por la IZQUIERDA y pide trato distinto que la de la derecha: cuenta
   * para la ocupacion —si se ignora, el acumulado se va a negativo— pero no para la
   * permanencia, porque no se sabe cuando entro. Antes se descartaban en silencio.
   */
  salidasSinEntrada: number;
}

/**
 * Que lado de la estancia no se pudo leer. Son dos defectos distintos y piden trato
 * distinto, asi que no se mezclan en un booleano.
 *
 * «derecha»: entro y no se leyo su salida. La duracion se corta en la hora de cierre
 * y es una COTA INFERIOR.
 * «izquierda»: salio y no se leyo su entrada, porque el coche ya estaba dentro cuando
 * arranca la ventana del archivo. No se sabe cuando entro.
 */
export type Censura = null | "izquierda" | "derecha";

export interface Estancia {
  tarjeta: string;
  dia: string;
  lote: Lote;
  entro: number;
  dur: number;
  censura: Censura;
}

/**
 * Hasta que hora se supone que un coche que no cerro siguio dentro.
 *
 * Es PARAMETRO con valor por defecto, no constante, porque el dato correcto es la
 * hora de cierre del plantel y la tiene Gerardo, no el codigo. Cortar al final del
 * archivo en vez de al cierre es lo que convertia el tope de 40,000 filas de ZK en
 * una medicion: la referencia de la literatura (Sun et al., PLOS ONE 2025) corta en
 * la hora de cierre del recinto, no en el fin del registro.
 */
export const MINUTO_CIERRE_POR_DEFECTO = 21 * 60;

const dia = (e: EventoZk) => e.ocurrioEn.slice(0, 10);
const minuto = (e: EventoZk) =>
  Number(e.ocurrioEn.slice(11, 13)) * 60 + Number(e.ocurrioEn.slice(14, 16)) + Number(e.ocurrioEn.slice(17, 19)) / 60;

/**
 * El cuantil `q` por interpolacion lineal sobre la posicion (n-1)*q.
 *
 * Coincide EXACTAMENTE con `mediana` de lib/duracion.ts cuando q = 0.5, con n par y
 * con n impar, y hay una prueba que lo fija. Por eso puede convivir con ella sin
 * que la pantalla muestre dos medianas distintas de la misma serie.
 */
export function cuantil(valores: number[], q: number): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  if (orden.length === 1) return orden[0];
  const pos = (orden.length - 1) * q;
  const bajo = Math.floor(pos);
  const alto = Math.ceil(pos);
  if (bajo === alto) return orden[bajo];
  return orden[bajo] + (orden[alto] - orden[bajo]) * (pos - bajo);
}

/** Los accesos que de verdad cuentan: concedidos, sin repeticiones, con sentido. */
export function accesos(eventos: EventoZk[]): EventoZk[] {
  return eventos.filter((e) => e.concedido && !e.repeticion && e.sentido !== null);
}

/**
 * Empareja cada entrada con la siguiente salida de la misma tarjeta, el mismo dia y
 * EN EL MISMO ESTACIONAMIENTO.
 *
 * El lote va en la llave a proposito. Sin el, una entrada por E1 podia cerrarse con
 * una salida por E2 y producir una estancia que no existio, en el lote equivocado.
 * Hoy el archivo real no trae ningun caso cruzado, asi que el defecto estaba inerte
 * —pero inerte no es lo mismo que ausente, y basta una credencial con derecho a los
 * dos para despertarlo.
 *
 * Lo que no cierra se CUENTA en vez de tirarse, y de los dos lados: las entradas sin
 * salida como `aperturas` (siguen dentro) y las salidas sin entrada como
 * `salidasSinEntrada` (ya estaban dentro). Son dos defectos distintos del archivo y
 * se tratan distinto.
 */
export function emparejarEstancias(
  eventos: EventoZk[],
  minutoCierre: number = MINUTO_CIERRE_POR_DEFECTO,
): { estancias: Estancia[]; entradasSinSalida: number; salidasSinEntrada: number } {
  const porTarjetaDiaLote = new Map<string, EventoZk[]>();
  for (const e of accesos(eventos)) {
    const k = `${e.tarjeta}|${dia(e)}|${e.lote}`;
    const g = porTarjetaDiaLote.get(k);
    if (g) g.push(e);
    else porTarjetaDiaLote.set(k, [e]);
  }

  const estancias: Estancia[] = [];
  let entradasSinSalida = 0;
  let salidasSinEntrada = 0;

  // Una entrada que no cerro se corta en la hora de cierre y queda marcada.
  const porDerecha = (e: EventoZk): Estancia => ({
    tarjeta: e.tarjeta,
    dia: dia(e),
    lote: e.lote,
    entro: minuto(e),
    dur: Math.max(0, minutoCierre - minuto(e)),
    censura: "derecha",
  });

  for (const grupo of porTarjetaDiaLote.values()) {
    const orden = [...grupo].sort((a, b) => minuto(a) - minuto(b));
    let abierta: EventoZk | null = null;
    for (const e of orden) {
      if (e.sentido === "entrada") {
        // Dos entradas seguidas: la primera nunca cerro.
        if (abierta !== null) {
          estancias.push(porDerecha(abierta));
          entradasSinSalida += 1;
        }
        abierta = e;
      } else if (abierta !== null) {
        estancias.push({
          tarjeta: e.tarjeta,
          dia: dia(e),
          lote: abierta.lote,
          entro: minuto(abierta),
          dur: minuto(e) - minuto(abierta),
          censura: null,
        });
        abierta = null;
      } else {
        // Salio sin que se leyera su entrada: ya estaba dentro. Se le supone dentro
        // desde el arranque de la franja de dibujo, que es una SUPOSICION declarada
        // y solo afecta a la ocupacion anterior a su salida: estas estancias no
        // entran en ninguna mediana de permanencia, justamente porque su duracion
        // es inventada.
        estancias.push({
          tarjeta: e.tarjeta,
          dia: dia(e),
          lote: e.lote,
          entro: FRANJA_DESDE,
          dur: Math.max(0, minuto(e) - FRANJA_DESDE),
          censura: "izquierda",
        });
        salidasSinEntrada += 1;
      }
    }
    if (abierta !== null) {
      estancias.push(porDerecha(abierta));
      entradasSinSalida += 1;
    }
  }

  return { estancias, entradasSinSalida, salidasSinEntrada };
}

/** Las estancias con los dos extremos leidos: las unicas que miden permanencia. */
export const confirmadas = (estancias: Estancia[]): Estancia[] => estancias.filter((s) => s.censura === null);

/**
 * Agrupa las estancias por lo que devuelva `claveDe` y mide cada grupo igual.
 *
 * Es generico a proposito: el mismo calculo sirve para agrupar por rol (los cinco
 * grupos que mira Direccion) y por departamento de ZK (los dieciseis reales, que son
 * los que sirven para operar). Tenerlo dos veces era garantizar que algun dia dieran
 * numeros distintos.
 *
 * LAS MEDIANAS SALEN SOLO DE LAS CONFIRMADAS y la censura va al lado: meter una
 * estancia cortada en la hora de cierre seria inventar su duracion, y dejarlas fuera
 * sin decirlo seria peor, porque la censura NO es aleatoria —falla mas en los grupos
 * que se quedan mas— y las medianas largas quedan como cota inferior.
 */
export function medirPorClave(
  estancias: Estancia[],
  claveDe: (tarjeta: string) => string,
  picoGlobal?: { dia: string | null; minuto: number | null },
): EstanciasRol[] {
  const grupos = new Map<string, Estancia[]>();
  for (const s of estancias) {
    const k = claveDe(s.tarjeta) || "Sin clasificar";
    const g = grupos.get(k);
    if (g) g.push(s);
    else grupos.set(k, [s]);
  }
  const mP = picoGlobal?.minuto ?? null;
  const dP = picoGlobal?.dia ?? null;
  return [...grupos.entries()]
    .map(([rol, g]) => {
      const ok = confirmadas(g);
      const durs = ok.map((s) => s.dur);
      return {
        rol,
        cajonesAlaVez: picoPorDia(ok).dentro,
        cajonesEnElPico:
          mP === null || dP === null
            ? 0
            : ok.filter((s) => s.dia === dP && s.entro <= mP && s.entro + s.dur > mP).length,
        estancias: ok.length,
        medianaMin: mediana(durs),
        p25Min: cuantil(durs, 0.25),
        p75Min: cuantil(durs, 0.75),
        cortas: ok.filter((s) => s.dur <= MIN_ESTANCIA_CORTA).length,
        largas: ok.filter((s) => s.dur >= MIN_ESTANCIA_LARGA).length,
        credenciales: new Set(g.map((s) => s.tarjeta)).size,
        minutosOcupados: Math.round(durs.reduce((a, b) => a + b, 0)),
        censuradas: g.length - ok.length,
      };
    })
    // De mayor a menor uso, y «uso» es cuantos cajones ocupa a la vez: es lo unico
    // comparable contra la capacidad. Las horas-coche desempatan.
    .sort((a, b) => b.cajonesAlaVez - a.cajonesAlaVez || b.minutosOcupados - a.minutosOcupados);
}

/**
 * El uso de UNA credencial. Sin nombres: solo el numero de tarjeta.
 *
 * La identidad se junta en la pantalla, contra el padron, y solo para quien tiene
 * permiso de verla. Asi esta funcion se puede probar, se puede mover a la base y
 * nunca tiene que tocar un dato personal.
 */
export interface UsoCredencial {
  tarjeta: string;
  /** Estancias confirmadas: con entrada y salida leidas. */
  estancias: number;
  censuradas: number;
  medianaMin: number | null;
  maxMin: number | null;
  /** Minutos que esta credencial tuvo un cajon ocupado en toda la ventana. */
  totalMin: number;
  /** En cuantos dias distintos aparecio. Distingue «viene a diario» de «vino una vez». */
  dias: number;
  lotes: Lote[];
  primerDia: string | null;
  ultimoDia: string | null;
  /** Cuantas de sus entradas cayeron en la franja critica, cualquier dia. */
  enOleada: number;
}

export function medirPorCredencial(
  estancias: Estancia[],
  oleadaDesde: number,
  oleadaHasta: number,
): UsoCredencial[] {
  const porTarjeta = new Map<string, Estancia[]>();
  for (const s of estancias) {
    const g = porTarjeta.get(s.tarjeta);
    if (g) g.push(s);
    else porTarjeta.set(s.tarjeta, [s]);
  }

  return [...porTarjeta.entries()]
    .map(([tarjeta, g]) => {
      const ok = confirmadas(g);
      const durs = ok.map((s) => s.dur);
      const dias = [...new Set(g.map((s) => s.dia))].sort();
      return {
        tarjeta,
        estancias: ok.length,
        censuradas: g.length - ok.length,
        medianaMin: mediana(durs),
        maxMin: durs.length ? Math.max(...durs) : null,
        totalMin: durs.reduce((a, b) => a + b, 0),
        dias: dias.length,
        lotes: [...new Set(g.map((s) => s.lote))].sort() as Lote[],
        primerDia: dias[0] ?? null,
        ultimoDia: dias[dias.length - 1] ?? null,
        // Las censuradas tambien cuentan aqui: una entrada en la franja critica
        // ocurrio, se haya leido su salida o no.
        enOleada: g.filter((s) => s.censura !== "izquierda" && s.entro >= oleadaDesde && s.entro < oleadaHasta).length,
      };
    })
    .sort((a, b) => b.totalMin - a.totalMin);
}

interface Marca {
  minuto: number;
  delta: number;
}

/**
 * Las marcas del barrido: +1 donde entra un coche, -1 donde sale.
 *
 * EL ORDEN A IGUAL MINUTO IMPORTA: primero las salidas y luego las entradas. Si un
 * coche sale a las 14:17 y otro entra a las 14:17, dentro hubo uno, no dos. Sumando
 * las entradas primero el pico sale inflado en uno por cada relevo, y en la hora de
 * entrada hay muchos relevos.
 *
 * Las estancias censuradas se incluyen o no segun lo que se este midiendo: con solo
 * las confirmadas sale el PISO, y con todas la COTA SUPERIOR. Las dos van a pantalla.
 */
function marcasDe(estancias: Estancia[]): Marca[] {
  const out: Marca[] = [];
  for (const s of estancias) {
    out.push({ minuto: s.entro, delta: 1 });
    out.push({ minuto: s.entro + s.dur, delta: -1 });
  }
  out.sort((a, b) => a.minuto - b.minuto || a.delta - b.delta);
  return out;
}

/** El maximo del acumulado y en que minuto ocurre. Exacto: sin reja. */
function picoDeMarcas(marcas: Marca[]): { dentro: number; minuto: number | null } {
  let dentro = 0;
  let mejor = 0;
  let minuto: number | null = null;
  for (const m of marcas) {
    dentro += m.delta;
    if (dentro > mejor) {
      mejor = dentro;
      minuto = m.minuto;
    }
  }
  return { dentro: mejor, minuto };
}

/** Cuantos coches dentro en un instante dado, segun esas marcas. */
function enInstante(marcas: Marca[], min: number): number {
  let dentro = 0;
  for (const m of marcas) {
    if (m.minuto > min) break;
    dentro += m.delta;
  }
  return dentro;
}

/** La curva que se DIBUJA: el acumulado leido cada `PASO_FRANJA` minutos. */
function muestrear(marcas: Marca[]): Map<number, number> {
  const curva = new Map<number, number>();
  let dentro = 0;
  let i = 0;
  for (let m = FRANJA_DESDE; m <= FRANJA_HASTA; m += PASO_FRANJA) {
    while (i < marcas.length && marcas[i].minuto <= m) {
      dentro += marcas[i].delta;
      i += 1;
    }
    curva.set(m, dentro);
  }
  return curva;
}

/**
 * Cual de los dias de la ventana describe un dia normal y cual no.
 *
 * Dos motivos de exclusion, y los dos se dicen en pantalla:
 *
 * 1. EL PRIMERO Y EL ULTIMO DIA de la ventana estan cortados por construccion. El
 *    export de ZK se topa en 40,000 FILAS, no en fechas: el archivo empieza a media
 *    manana de su primer dia y termina a media tarde del ultimo. No son dias flojos,
 *    son dias incompletos, y promediarlos con uno entero miente.
 * 2. LOS DIAS DE ACTIVIDAD MARGINAL, por debajo de `SHARE_DIA_COMPARABLE` del dia
 *    mediano. El sabado del 29-sep trae dos eventos.
 *
 * Con menos de tres dias no se excluye nada: no habria con que comparar, y es mejor
 * una envolvente floja y declarada que una pantalla vacia.
 */
export function clasificarDias(
  ok: EventoZk[],
  dias: string[],
): { comparables: string[]; excluidos: DiaExcluido[] } {
  if (dias.length < 3) return { comparables: [...dias], excluidos: [] };

  const excluidos: DiaExcluido[] = [
    { dia: dias[0], motivo: "la ventana del archivo lo corta por el principio" },
    { dia: dias[dias.length - 1], motivo: "la ventana del archivo lo corta por el final" },
  ];
  const enMedio = dias.slice(1, -1);

  const cuenta = new Map<string, number>();
  for (const e of ok) cuenta.set(dia(e), (cuenta.get(dia(e)) ?? 0) + 1);
  const med = mediana(enMedio.map((d) => cuenta.get(d) ?? 0)) ?? 0;
  const piso = med * SHARE_DIA_COMPARABLE;

  const comparables: string[] = [];
  for (const d of enMedio) {
    const n = cuenta.get(d) ?? 0;
    if (n < piso) excluidos.push({ dia: d, motivo: `solo ${n} accesos, muy por debajo del dia tipico` });
    else comparables.push(d);
  }

  excluidos.sort((a, b) => a.dia.localeCompare(b.dia));
  return { comparables, excluidos };
}

/**
 * El momento mas lleno, buscado dia por dia sobre el barrido exacto.
 *
 * Se busca en TODOS los dias, tambien los no comparables: un dia incompleto no sirve
 * para describir el dia tipico, pero si trajo el momento mas lleno de la ventana, ese
 * momento ocurrio.
 *
 * `dentro` sale de las estancias CONFIRMADAS —es la cifra que se publica, y es un
 * piso— y `hasta` es cuantos habia en ese mismo instante contando tambien las
 * censuradas. No es el maximo de la curva con censuradas, sino su valor EN EL MINUTO
 * del pico confirmado: la banda tiene que estar en el mismo instante para significar
 * algo.
 */
function picoPorDia(estancias: Estancia[]): Pico {
  const dias = [...new Set(estancias.map((s) => s.dia))].sort();
  let pico: Pico = { dentro: 0, hasta: 0, minuto: null, dia: null };
  for (const d of dias) {
    const delDia = estancias.filter((s) => s.dia === d);
    const p = picoDeMarcas(marcasDe(confirmadas(delDia)));
    if (p.dentro > pico.dentro && p.minuto !== null) {
      const cota = enInstante(marcasDe(delDia), p.minuto);
      pico = { dentro: p.dentro, hasta: Math.max(cota, p.dentro), minuto: p.minuto, dia: d };
    }
  }
  return pico;
}

/**
 * Cuanto tiempo el acumulado estuvo en `umbral` o por encima, y entre que horas.
 *
 * Se calcula sobre los tramos entre marcas, donde el nivel es constante, en vez de
 * muestrear minuto a minuto: asi el resultado es exacto y no hereda el defecto que
 * esta pantalla existe para no repetir.
 */
function ventanaDe(estancias: Estancia[], umbral: number): VentanaSaturacion {
  const marcas = marcasDe(estancias);
  let dentro = 0;
  let minutos = 0;
  let desde: number | null = null;
  let hasta: number | null = null;
  for (let i = 0; i < marcas.length; i += 1) {
    dentro += marcas[i].delta;
    const fin = i + 1 < marcas.length ? marcas[i + 1].minuto : marcas[i].minuto;
    if (dentro >= umbral && fin > marcas[i].minuto) {
      minutos += fin - marcas[i].minuto;
      if (desde === null) desde = marcas[i].minuto;
      hasta = fin;
    }
  }
  return { umbral, desde, hasta, minutos: Math.round(minutos) };
}

function ocupacionDe(
  estancias: Estancia[],
  lote: Lote,
  eventosDelLote: EventoZk[],
  comparables: string[],
  rolDe: RolDe,
  deptoDe: RolDe | undefined,
  oleada: { desde: number; hasta: number },
): OcupacionLote {
  const delLote = estancias.filter((s) => s.lote === lote);

  // La envolvente se arma SOLO con los dias comparables. Los cuartiles dicen algo
  // que una mediana sola no puede: si la banda es estrecha, el dia tipico existe; si
  // es ancha, hablar de «el dia» es una licencia.
  // SOLO CONFIRMADAS, igual que el pico que la rotula. Dibujar aqui tambien las
  // censuradas producia dos defectos visibles a la vez:
  //
  // 1. Una caida vertical a cero al final del dia. Las estancias sin salida leida se
  //    cortan todas en la hora de cierre, asi que «cerraban» de golpe a la misma hora
  //    y la curva se desplomaba. Eso no ocurrio: es una suposicion del metodo
  //    dibujada con la misma tinta que un dato.
  // 2. La linea quedaba POR ENCIMA del punto del pico que la explica, porque eran dos
  //    conjuntos distintos en los mismos ejes. Un rotulo que contradice a su propia
  //    curva destruye la confianza en todo lo demas de la pantalla.
  //
  // La cota con censuradas no se pierde: vive en `pico.hasta`, que va en el rotulo.
  const curvas = comparables.map((d) => muestrear(marcasDe(confirmadas(delLote.filter((s) => s.dia === d)))));
  const franjas: PuntoFranja[] = [];
  for (let m = FRANJA_DESDE; m <= FRANJA_HASTA; m += PASO_FRANJA) {
    const v = curvas.map((c) => c.get(m) ?? 0);
    franjas.push({
      minuto: m,
      p50: Math.round(mediana(v) ?? 0),
      p25: Math.round(cuantil(v, 0.25) ?? 0),
      p75: Math.round(cuantil(v, 0.75) ?? 0),
    });
  }

  // El pico NO sale de la envolvente: una mediana suaviza, y un pico suavizado ya no
  // es un pico.
  const pico = picoPorDia(delLote);

  const entradas = eventosDelLote.filter((e) => e.sentido === "entrada").length;
  const salidas = eventosDelLote.filter((e) => e.sentido === "salida").length;
  return {
    lote,
    franjas,
    pico,
    entradas,
    salidas,
    tarjetas: new Set(eventosDelLote.map((e) => e.tarjeta)).size,
    minutosOcupados: Math.round(confirmadas(delLote).reduce((a, s) => a + s.dur, 0)),
    porRol: medirPorClave(delLote, rolDe, pico),
    porDepartamento: deptoDe ? medirPorClave(delLote, deptoDe, pico) : [],
    porCredencial: medirPorCredencial(delLote, oleada.desde, oleada.hasta),
    desbalance: entradas > 0 ? (entradas - salidas) / entradas : null,
  };
}

/**
 * Todo lo que el tablero necesita, de una pasada.
 *
 * `rolDe` resuelve el dueno contra el padron; si devuelve cadena vacia, la tarjeta
 * cae en «Sin clasificar» y se cuenta ahi, visible. Nunca se omite: el denominador
 * tiene que estar en pantalla.
 */
export interface OpcionesMedicion {
  /** Hasta que hora se supone dentro un coche que no cerro. Lo fija el plantel. */
  minutoCierre?: number;
  /**
   * Si se pasa, la medicion incluye el desglose por departamento de ZK.
   *
   * Va aparte de `rolDe` porque son dos granos distintos y los dos hacen falta: los
   * cinco grupos son con lo que se habla con Direccion, y los dieciseis
   * departamentos reales son con lo que se opera.
   */
  deptoDe?: RolDe;
}

export function medirEstacionamiento(eventos: EventoZk[], rolDe: RolDe, op: OpcionesMedicion = {}): Medicion {
  const minutoCierre = op.minutoCierre ?? MINUTO_CIERRE_POR_DEFECTO;
  const ok = accesos(eventos);
  const dias = [...new Set(ok.map(dia))].sort();
  const { estancias, entradasSinSalida, salidasSinEntrada } = emparejarEstancias(eventos, minutoCierre);
  const { comparables, excluidos } = clasificarDias(ok, dias);

  const picoTotal = picoPorDia(estancias);

  // Estancias por rol. El orden lo da el numero de estancias, no el nombre: la
  // pantalla tiene que empezar por quien mas usa el estacionamiento.
  //
  // LAS MEDIANAS SALEN SOLO DE LAS CONFIRMADAS, y la tasa de censura va al lado.
  // Meter una estancia cortada en la hora de cierre en la mediana seria inventar su
  // duracion; dejarlas fuera sin decirlo seria peor, porque la censura NO es
  // aleatoria —falla el 9.1% en Padres contra el 23.3% en Administracion— asi que
  // las que se pierden son justo las largas y la mediana del personal queda como
  // COTA INFERIOR. Eso se dice en pantalla.
  const porRolLista = medirPorClave(estancias, rolDe, picoTotal);
  const porDepartamento = op.deptoDe ? medirPorClave(estancias, op.deptoDe, picoTotal) : [];

  // Quien estaba dentro en el momento del pico. Es el hallazgo que cambia la
  // politica, asi que va calculado y no insinuado.
  //
  // LAS DOS CONDICIONES DE BORDE CALZAN CON EL BARRIDO, y por eso la suma cuadra:
  // una estancia que termina justo en el minuto del pico NO cuenta (el barrido aplica
  // su -1 antes de leer el maximo) y una que empieza justo ahi SI cuenta (su +1 ya
  // esta aplicado). Cambiar un `<=` por un `<` aqui rompe el invariante.
  const mPico = picoTotal.minuto;
  const dPico = picoTotal.dia;
  const enPico = new Map<string, number>();
  if (mPico !== null && dPico !== null) {
    // Solo confirmadas, igual que `picoTotal.dentro`. Mezclar aqui las censuradas
    // rompe el invariante, que es la unica defensa barata contra el error de nivel
    // de agregacion: la suma de la tabla TIENE que ser el titular.
    for (const s of confirmadas(estancias)) {
      if (s.dia === dPico && s.entro <= mPico && s.entro + s.dur > mPico) {
        const r = rolDe(s.tarjeta) || "Sin clasificar";
        enPico.set(r, (enPico.get(r) ?? 0) + 1);
      }
    }
  }

  // La carga base, al mismo corte que el pico pero a media manana y del MISMO dia:
  // comparar el pico de un martes con la meseta de un viernes no compara nada.
  const enMeseta = new Map<string, number>();
  if (dPico !== null) {
    for (const s of confirmadas(estancias)) {
      if (s.dia === dPico && s.entro <= MINUTO_MESETA && s.entro + s.dur > MINUTO_MESETA) {
        const r = rolDe(s.tarjeta) || "Sin clasificar";
        enMeseta.set(r, (enMeseta.get(r) ?? 0) + 1);
      }
    }
  }

  // Cuanto dura el peor momento, y quien lo produce. Las dos sobre el dia del pico.
  const delDiaPico = dPico === null ? [] : confirmadas(estancias).filter((s) => s.dia === dPico);
  const ventana = ventanaDe(delDiaPico, Math.ceil(picoTotal.dentro * SHARE_SATURACION));

  const oDesde = mPico === null ? 0 : mPico - OLEADA_ANTES;
  const oHasta = mPico === null ? 0 : mPico + OLEADA_DESPUES;
  const enOleada = delDiaPico.filter((s) => s.entro >= oDesde && s.entro < oHasta);
  const porLoteOleada = (["E1", "E2"] as Lote[]).map((l) => ({
    lote: l,
    coches: enOleada.filter((s) => s.lote === l).length,
  }));
  // La ocupacion por lote va DESPUES de conocer la franja critica: cada lote reporta
  // cuantas de sus entradas cayeron en ella, y para eso necesita sus minutos.
  const ocupacion: OcupacionLote[] = (["E1", "E2"] as Lote[]).map((l) =>
    ocupacionDe(estancias, l, ok.filter((e) => e.lote === l), comparables, rolDe, op.deptoDe, {
      desde: oDesde,
      hasta: oHasta,
    }),
  );

  const oleada: Oleada = {
    desde: oDesde,
    hasta: oHasta,
    coches: enOleada.length,
    medianaMin: mediana(enOleada.map((s) => s.dur)),
    cortas: enOleada.filter((s) => s.dur <= MIN_ESTANCIA_CORTA).length,
    porLote: porLoteOleada,
  };

  // Quien se sale de la norma de su propio grupo. La norma la fija el grupo, asi que
  // no hay ninguna lista escrita a mano de quien «deberia» rotar.
  const usoPorCredencial = medirPorCredencial(estancias, oDesde, oHasta);
  const medianaDelGrupo = new Map(porRolLista.map((r) => [r.rol, r.medianaMin]));
  const fueraDeNorma = usoPorCredencial
    .filter((u) => {
      if (u.medianaMin === null || u.medianaMin < MIN_ESTANCIA_LARGA) return false;
      const norma = medianaDelGrupo.get(rolDe(u.tarjeta) || "Sin clasificar");
      return norma !== null && norma !== undefined && norma > 0 && u.medianaMin >= norma * FACTOR_FUERA_DE_NORMA;
    })
    .sort((a, b) => (b.medianaMin ?? 0) - (a.medianaMin ?? 0));

  const duraciones = confirmadas(estancias).map((s) => s.dur);
  const cubetasDe = (durs: number[]): CubetaEstancia[] =>
    CUBETAS_MIN.map((desde, i) => {
      const hasta = i + 1 < CUBETAS_MIN.length ? CUBETAS_MIN[i + 1] : null;
      return { desde, hasta, cuantas: durs.filter((d) => d >= desde && (hasta === null || d < hasta)).length };
    });
  const histograma = cubetasDe(duraciones);
  const histogramaPorRol = porRolLista.map((r) => {
    const durs = confirmadas(estancias.filter((s) => (rolDe(s.tarjeta) || "Sin clasificar") === r.rol)).map((s) => s.dur);
    return { rol: r.rol, total: durs.length, cubetas: cubetasDe(durs) };
  });

  return {
    dias,
    diasComparables: comparables,
    diasExcluidos: excluidos,
    ocupacion,
    picoTotal,
    estancias: porRolLista,
    medianaGlobalMin: mediana(duraciones),
    histograma,
    histogramaPorRol,
    porDepartamento,
    porCredencial: usoPorCredencial,
    fueraDeNorma,
    enElPico: [...enPico.entries()].map(([rol, coches]) => ({ rol, coches })).sort((a, b) => b.coches - a.coches),
    ventana,
    oleada,
    enLaMeseta: [...enMeseta.entries()].map(([rol, coches]) => ({ rol, coches })).sort((a, b) => b.coches - a.coches),
    entradasSinSalida,
    salidasSinEntrada,
  };
}

/**
 * De las credenciales que pueden entrar a los dos estacionamientos, por cual
 * entran de hecho.
 *
 * Va aparte de `medirEstacionamiento` porque necesita el derecho declarado en el
 * padron, que es otra fuente: `registro_estacionamientos`. Mezclarlas obligaria a
 * pasar las dos siempre, y la curva de ocupacion no necesita el padron.
 *
 * `conUnaSolaEntrada` existe porque «siempre entra por el 2» dicho sobre una sola
 * observacion no es un habito: es un dato. La conclusion aguanta —el reparto es muy
 * desigual— pero la palabra «siempre» hay que poder acotarla.
 */
export function medirEleccion(eventos: EventoZk[], tieneAmbos: (tarjeta: string) => boolean): Eleccion {
  const entradas = accesos(eventos).filter((e) => e.sentido === "entrada");
  const porTarjeta = new Map<string, { lotes: Set<Lote>; veces: number }>();
  for (const e of entradas) {
    if (!tieneAmbos(e.tarjeta)) continue;
    const s = porTarjeta.get(e.tarjeta);
    if (s) {
      s.lotes.add(e.lote);
      s.veces += 1;
    } else porTarjeta.set(e.tarjeta, { lotes: new Set([e.lote]), veces: 1 });
  }
  let siempreE1 = 0, siempreE2 = 0, mixto = 0, conUnaSolaEntrada = 0;
  for (const { lotes, veces } of porTarjeta.values()) {
    if (veces === 1) conUnaSolaEntrada += 1;
    if (lotes.size > 1) mixto += 1;
    else if (lotes.has("E1")) siempreE1 += 1;
    else siempreE2 += 1;
  }
  return { conDerechoAmbos: porTarjeta.size, siempreE1, siempreE2, mixto, conUnaSolaEntrada };
}

/** `minuto` del dia a «HH:MM», sin construir un Date. */
export function horaCorta(min: number | null): string {
  if (min === null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
