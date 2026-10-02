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
// apellido, departamento, placa— y descarta el resto en el parseo, para que no viaje
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
  departamentoId: string;
  departamento: string;
  placa: string;
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
 * NO SE INVENTA NINGUNO: las claves son los `ID de Departamento` del catalogo real
 * (export «Departamentos»), y los nombres se toman del archivo, no de aqui. Esta
 * tabla solo dice a que grupo pertenece cada uno.
 *
 * Tres decisiones que conviene no deshacer sin pensarlo:
 *
 * - `3 STOCK SATAG` cae en «Sin clasificar» y NO en un grupo propio. Una instalacion
 *   del dia cruza la pluma antes de que se suba el padron a ZK, asi que aparece con
 *   ese departamento aunque el coche sea de un padre. Es historia, no estado.
 * - `10 BAJAS` tambien: una tarjeta ahi no deberia abrir nada, y si aparece en la
 *   bitacora eso es el hallazgo, no su grupo.
 * - `1 General` y `hotel` son residuos de la configuracion vieja del control de
 *   acceso y mezclan gente de todo tipo. Darles un grupo propio seria inventar.
 */
export const GRUPO_POR_DEPTO: Record<string, string> = {
  "7": "Padres de familia",
  "6": "Personal docente",
  "4": "Personal docente",
  "9": "Personal docente",
  "11": "Personal docente",
  "12": "Personal docente",
  "13": "Personal docente",
  "14": "Personal docente",
  "2": "Administración y servicios",
  "15": "Administración y servicios",
  "5": "Alumnos",
  "8": "Alumnos",
};

/** `registros.tipo_usuario` de SATAG a los mismos grupos. Es la fuente de arriba. */
export const GRUPO_POR_TIPO: Record<string, string> = {
  padres: "Padres de familia",
  maestro: "Personal docente",
  admin: "Administración y servicios",
  alumno: "Alumnos",
};

export const SIN_CLASIFICAR = "Sin clasificar";

/** A que grupo pertenece un departamento de ZK. */
export const grupoDeDepto = (id: string): string => GRUPO_POR_DEPTO[id] ?? SIN_CLASIFICAR;

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
    const nombre = [f["Nombre"], f["Apellido"]].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
    personas.push({
      tarjeta,
      nombre,
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
