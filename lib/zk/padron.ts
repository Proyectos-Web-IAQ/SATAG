// El padron de personas de ZKBioSecurity: quien es cada tarjeta.
//
// POR QUE EXISTE ESTE ARCHIVO. La bitacora de accesos solo trae numeros de tarjeta y
// el texto del departamento EN EL INSTANTE del evento, que es historia y no estado
// (ver el encabezado de lib/estacionamiento.ts). Para decir de quien es un coche hace
// falta el padron, y mientras los expedientes no esten migrados a SATAG el unico
// padron completo que existe es el export de personas de ZK.
//
// LA PRECEDENCIA, cuando los dos existan: primero `registros` de SATAG, que es la
// fuente autoritativa y la que el Instituto mantiene; despues este export; y si una
// tarjeta no esta en ninguno, «Sin clasificar», visible y contada. Nunca el
// departamento que trae el evento.
//
// ESTE ARCHIVO TOCA DATOS PERSONALES. El export trae nombre, apellido, placa, correo
// y telefono. Este modulo se queda SOLO con lo que la pantalla necesita —nombre,
// apellido, departamento, placa y el ID de ZK (bloque 93: liga los reportes de
// puertas y el import)— y descarta el resto en el parseo, para que no viaje
// ni se quede en memoria lo que nadie va a mirar. El aviso de privacidad v8 cubre
// este uso: «operar el control de acceso vehicular del inmueble» y «mantener la
// seguridad, la trazabilidad, la auditoria y el control interno», con la comunicacion
// limitada a «personal del Instituto expresamente autorizado».

import { normalizarTag, tablaZk, textoDeExportZk } from "@/lib/zk/texto";

/**
 * En que padrones aparece una credencial.
 *
 * LA REGLA QUE ESTO HACE VERIFICABLE: ni un solo TAG ni un solo nombre debe aparecer
 * en el tablero sin tener su expediente en SATAG. Una credencial que abrio la pluma y
 * no esta en NINGUNA de las tres fuentes es un vehiculo con acceso del que nadie sabe
 * nada, y eso no es una nota al pie: es lo unico de esta pantalla que merece el rojo
 * de alerta, porque es lo unico que hay que resolver hoy y no interpretar.
 *
 * `satag` manda sobre las otras dos: es el padron que el Instituto mantiene. Las otras
 * dos son de donde se migra.
 */
export interface Fuentes {
  satag: boolean;
  hoja: boolean;
  zk: boolean;
}

/** Sin expediente en ninguna parte: cruzo la pluma y nadie sabe de quien es. */
export const esHuerfana = (f: Fuentes | undefined): boolean =>
  f === undefined || (!f.satag && !f.hoja && !f.zk);

/** Lo unico que esta pantalla necesita de una persona. El resto no se guarda. */
export interface PersonaZk {
  tarjeta: string;
  nombre: string;
  /** Las dos columnas tal como ZK las trae; el alta automatica las necesita separadas (bloque 86). */
  nombres: string;
  apellidos: string;
  departamentoId: string;
  departamento: string;
  placa: string;
  /** El ID de la persona en ZK (columna «ID»). Lo usan los «Personal de Apertura» y el import (bloque 93). */
  idZk?: string;
}

export interface LecturaPadron {
  personas: PersonaZk[];
  filasArchivo: number;
  filasConTarjeta: number;
  /** Tarjetas repetidas en el archivo: se queda la primera y se cuentan las demas. */
  tarjetasDuplicadas: number;
}

const ROTULOS = ["Tarjeta", "ID de Departamento"];

/**
 * Los departamentos de ZK, agrupados como los lee Direccion.
 *
 * NO SE INVENTA NINGUNO: son los departamentos del catalogo real de ZK. Manda el
 * NOMBRE: entre el 2 y el 5-oct-2026 TI renumero los departamentos (Padres de
 * familia 7 -> 19, Alumnos 5 -> 20...) y un mapa por numero dejo de reconocer a
 * mil personas de un dia para otro. Los numeros quedan como respaldo para archivos
 * cuyo nombre no se reconozca. Esta tabla solo dice a que grupo pertenece cada uno.
 *
 * Tres decisiones que conviene no deshacer sin pensarlo:
 *
 * - STOCK SATAG cae en «Sin clasificar» y NO en un grupo propio. Una instalacion
 *   del dia cruza la pluma antes de que se suba el padron a ZK, asi que aparece con
 *   ese departamento aunque el coche sea de un padre. Es historia, no estado.
 * - BAJAS tambien: una tarjeta ahi no deberia abrir nada, y si aparece en la
 *   bitacora eso es el hallazgo, no su grupo. Igual «Falta de información».
 * - General, «Otros» y `hotel` mezclan gente de todo tipo. Darles un grupo propio
 *   seria inventar.
 */
/** Admon, el equipo del contador: ZK 17 y el area «admon» de SATAG (bloque 88). */
export const GRUPO_ADMON = "Admon";
/**
 * Empleado_PPF (ZK 25, creado el 6-oct-2026): personal que ademas es padre de familia.
 * Abre las dos plumas; por politica se estaciona en el lote de su departamento y usa
 * el otro solo para recoger a sus hijos. SATAG todavia no lo exporta: solo lo agrupa.
 */
export const GRUPO_EMPLEADO_PPF = "Personal que es padre de familia";

export const GRUPO_POR_NOMBRE_DEPTO: Record<string, string> = {
  "PADRES DE FAMILIA": "Padres de familia",
  MAESTROS: "Personal docente",
  "PRIMARIA DOCENTE": "Personal docente",
  "PREESCOLAR DOCENTES": "Personal docente",
  "SECUNDARIA DOCENTES": "Personal docente",
  "PREPARATORIA DOCENTES": "Personal docente",
  "DEPORTES EXTRAESCOLARES": "Personal docente",
  "TEX DOCENTES": "Personal docente",
  ADMINISTRACION: "Administración y servicios",
  // Bloque 88: Admon (el equipo del contador) se ve aparte de Administración.
  ADMON: GRUPO_ADMON,
  EMPLEADO_PPF: GRUPO_EMPLEADO_PPF,
  "EMPLEADO PPF": GRUPO_EMPLEADO_PPF,
  MANTENIMIENTO: "Administración y servicios",
  ALUMNOS: "Alumnos",
  "EX ALUMNOS": "Alumnos",
};
export const GRUPO_POR_DEPTO: Record<string, string> = {
  // Desde el 5-oct-2026.
  "19": "Padres de familia",
  "16": "Administración y servicios",
  "17": GRUPO_ADMON,
  "25": GRUPO_EMPLEADO_PPF,
  "20": "Alumnos",
  "21": "Alumnos",
  // Sin cambio.
  "4": "Personal docente",
  "9": "Personal docente",
  "11": "Personal docente",
  "12": "Personal docente",
  "13": "Personal docente",
  "14": "Personal docente",
  "15": "Administración y servicios",
  // Hasta el 2-oct-2026: solo para archivos viejos.
  "7": "Padres de familia",
  "6": "Personal docente",
  "2": "Administración y servicios",
  "5": "Alumnos",
  "8": "Alumnos",
};

/** El nombre de un departamento de ZK, comparable: sin acentos, en mayusculas. */
export const nombreDepto = (s: string | null | undefined): string =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

/** `registros.tipo_usuario` de SATAG a los mismos grupos. Es la fuente de arriba. */
/**
 * El grupo de un expediente de SATAG. El administrativo se parte por su area
 * (bloque 88): Admon aparte, todo lo demas en «Administración y servicios».
 */
export const grupoDeExpediente = (tipo: string, areaAdmin?: string | null): string | undefined =>
  tipo === "admin" && areaAdmin === "admon" ? GRUPO_ADMON : GRUPO_POR_TIPO[tipo];

export const GRUPO_POR_TIPO: Record<string, string> = {
  padres: "Padres de familia",
  maestro: "Personal docente",
  admin: "Administración y servicios",
  alumno: "Alumnos",
};

export const SIN_CLASIFICAR = "Sin clasificar";

/** A que grupo pertenece un departamento de ZK: por su nombre y, si no se reconoce, por su numero. */
export const grupoDeDepto = (id: string, nombre?: string): string =>
  GRUPO_POR_NOMBRE_DEPTO[nombreDepto(nombre)] ?? GRUPO_POR_DEPTO[id] ?? SIN_CLASIFICAR;

/**
 * Lee el export de personas de ZK.
 *
 * Reusa `tablaZk`, que busca la fila de encabezados en las cinco primeras lineas en
 * vez de suponer que es la segunda: el export trae una linea de titulo antes, y
 * suponerlo fue lo que rompio los parsers de `Campo/herramientas/`.
 */
export function parsearPadronZk(texto: string): LecturaPadron {
  const t = tablaZk(texto, ROTULOS);
  if (t.cab.length === 0) {
    throw new Error(
      "El archivo no trae las columnas de un export de personas de ZK. Verifique que sea el archivo «Usuarios».",
    );
  }

  const personas: PersonaZk[] = [];
  const vistas = new Set<string>();
  let filasConTarjeta = 0;
  let tarjetasDuplicadas = 0;

  for (const f of t.filas) {
    const tarjeta = normalizarTag(f["Tarjeta"]);
    if (!tarjeta) continue;
    filasConTarjeta += 1;
    if (vistas.has(tarjeta)) {
      tarjetasDuplicadas += 1;
      continue;
    }
    vistas.add(tarjeta);

    // El nombre viene partido en dos columnas y a veces una esta vacia.
    const nombres = (f["Nombre"] ?? "").trim();
    const apellidos = (f["Apellido"] ?? "").trim();
    const nombre = [nombres, apellidos].filter(Boolean).join(" ");
    personas.push({
      tarjeta,
      nombre,
      nombres,
      apellidos,
      idZk: (f["ID"] ?? "").trim(),
      departamentoId: (f["ID de Departamento"] ?? "").trim(),
      departamento: (f["Nombre de Departamento"] ?? "").trim(),
      // La placa viaja en «Placa Vehicular», pero el importador de ZK la escribe en
      // «Celular» (es la columna que su plantilla acepta), asi que hay padrones con
      // la placa en una y no en la otra. Se toma la que tenga algo.
      placa: ((f["Placa Vehicular"] ?? "").trim() || (f["Celular"] ?? "").trim()).toUpperCase(),
    });
  }

  return { personas, filasArchivo: t.total, filasConTarjeta, tarjetasDuplicadas };
}

/** El padron indexado por tarjeta, que es como lo consulta la pantalla. */
export function indexarPadron(personas: PersonaZk[]): Map<string, PersonaZk> {
  const m = new Map<string, PersonaZk>();
  for (const p of personas) if (!m.has(p.tarjeta)) m.set(p.tarjeta, p);
  return m;
}

/** Lee el archivo tal como lo entrega el navegador, con los mismos rechazos. */
export async function leerPadronZk(archivo: File): Promise<LecturaPadron> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  // Venga en Excel —que es lo que ZK propone por defecto— o en CSV.
  return parsearPadronZk(await textoDeExportZk(bytes));
}
