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
