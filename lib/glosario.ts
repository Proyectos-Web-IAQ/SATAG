// El vocabulario de la pantalla: UNA palabra por concepto, y la palabra es la que la
// persona ya usa, no la que usa el codigo.
//
// POR QUE EXISTE. En tres dias la misma metrica se llamo «cajon ocupado», «tiempo con
// lugar ocupado» y «cajones a la vez»; el archivo que ZK llama «Todos los Eventos» se
// pidio en pantalla como «bitacora de accesos», y quien tenia el menu de ZK enfrente
// no supo cual era. Cada rotulo que se escribe suelto en un componente es una
// oportunidad de nombrar el concepto en vez de la cosa que la persona ve. Aqui se
// nombra una vez; los componentes importan.
//
//   ui      lo que se imprime, con los nombres EXACTOS que usa el otro sistema
//   ruta    donde la persona lo encuentra en ZKBioSecurity, menu por menu
//   que     la explicacion de una linea, para el titulo o el pie
//   detalle una segunda linea, cuando la primera no alcanza

import type { EstadoRegistro, TipoUsuario } from "@/lib/mock/types";

export interface Termino {
  ui: string;
  que: string;
  ruta?: string;
  detalle?: string;
}

export const GLOSARIO = {
  todosLosEventos: {
    ui: "Todos los Eventos",
    ruta: "Acceso → Reportes → Todos los Eventos → Exportar",
    que: "la bitácora de accesos",
    detalle: "cada vez que una credencial abrió, o intentó abrir, una pluma",
  },
  personasZk: {
    ui: "Personas",
    ruta: "Personal → Persona → Exportar",
    que: "el padrón de credenciales del control de acceso, con el departamento de cada una",
  },
  cajonesALaVez: {
    ui: "Cajones a la vez",
    que: "cuántos coches hay dentro en el mismo instante; es la única medida que se compara con cuántos cajones hay",
  },
  peorMomento: {
    ui: "Peor momento",
    que: "el instante con más coches dentro en toda la ventana; siempre se dice qué día y a qué hora",
  },
  corte: {
    ui: "Corte",
    que: "hasta dónde sabe el archivo: el último evento que ZK había recogido al exportar",
  },
  aunDentro: {
    ui: "Seguían dentro",
    que: "coches que habían entrado y no habían salido cuando el archivo termina; no son «sin salida», es el día corriendo",
  },
  permanencia: {
    ui: "Permanencia",
    que: "cuánto se queda un coche, de que entra a que sale; se da la mediana y no el promedio, porque unas pocas estancias larguísimas arrastran el promedio",
  },
} as const satisfies Record<string, Termino>;

/* ------------------------------------------------------------------ rotulos de persona */

// DISEÑO.md §8.3: los rotulos de persona —estado del expediente, tipo, plumas, placa,
// departamento— se escriben igual en todas las pestanas. El inventario del 7-oct
// encontro tres juegos para el estado («Pendiente», «Pendiente de cobro», «pendiente
// de cobro»), cuatro para el tipo y tres formas de unir las plumas. Aqui se escriben
// una vez, con mayuscula inicial; cuando el rotulo va a media frase se deriva con
// `enFrase`, nunca con un segundo mapa en minusculas.

/** El estado del expediente en SATAG. */
export const ESTADO_EXPEDIENTE: Record<EstadoRegistro, string> = {
  pendiente: "Pendiente de cobro",
  activo: "Activo",
  bloqueado: "Bloqueado",
  baja: "Dado de baja",
};

/** Quien conduce: el tipo que se declara en el alta y que Administracion confirma al cobrar. */
export const TIPO_PERSONA: Record<TipoUsuario, string> = {
  padres: "Padre / madre / tutor",
  maestro: "Maestro",
  alumno: "Alumno",
  admin: "Administrativo",
  otro: "Otro familiar",
};

/**
 * Rotulos sueltos de la persona. «Placa» cuando no hay ambiguedad; «Placa en SATAG» y
 * «Placa en ZK» cuando las dos conviven en la misma vista.
 */
export const ROTULO = {
  departamentoZk: "Departamento en ZK",
  placa: "Placa",
  placaSatag: "Placa en SATAG",
  placaZk: "Placa en ZK",
  sinPlacas: "Sin placas",
  plumas: "Plumas",
  ninguna: "Ninguna",
} as const;

/** Las plumas de una persona: «E1», «E1 y E2», «E1, E2 y E3»; sin plumas, «Ninguna». */
export function textoPlumas(claves: string[]): string {
  if (claves.length === 0) return ROTULO.ninguna;
  if (claves.length === 1) return claves[0];
  return `${claves.slice(0, -1).join(", ")} y ${claves[claves.length - 1]}`;
}

/**
 * Un rotulo dentro de una frase: baja la mayuscula inicial de una palabra comun
 * («Dado de baja» → «dado de baja», «Ninguna» → «ninguna») y deja intactas las
 * claves y siglas («E1 y E2», «TAG»), que no empiezan con mayuscula y minuscula.
 */
export function enFrase(rotulo: string): string {
  return rotulo.replace(/^(\p{Lu})(?=\p{Ll})/u, (m) => m.toLowerCase());
}
