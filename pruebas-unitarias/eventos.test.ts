// Lo que fija este archivo: que la bitacora de accesos de ZK se limpie igual
// siempre, porque las cifras del tablero salen de ahi y ya se demostro que el
// archivo en bruto miente por un factor de dos.
import { describe, it, expect } from "vitest";
import {
  DEDUP_MIN,
  MIN_ESTANCIA_CORTA,
  MIN_ESTANCIA_LARGA,
  TOPE_EXPORT_ZK,
  VENTANAS_PARA_BAJA,
  exportadoEnDe,
  huecoEnDias,
  marcarRepeticiones,
  parsearEventosZk,
  type EventoZk,
} from "@/lib/zk/eventos";

const CAB = [
  "ID de Evento", "Tiempo", "Nombre de Dispositivo", "Punto del Evento",
  "Descripción del Evento", "ID", "Nombre", "Apellido", "Tarjeta",
  "Nombre de Departamento", "Nombre de Lector", "Modo de Verificación",
  "Nombre de Área", "Notas",
];

interface Cruda {
  id?: number;
  tiempo?: string;
  dispositivo?: string;
  punto?: string;
  desc?: string;
  tarjeta?: string;
  depto?: string;
}

let n = 0;

// Fabrica con contador de modulo: cada fila nace con un ID de evento distinto sin
// que la prueba tenga que llevarlo, igual que en instalaciones.test.ts.
function cruda(p: Cruda = {}): string {
  n += 1;
  const f = new Array<string>(CAB.length).fill("");
  f[0] = String(p.id ?? 1000 + n);
  f[1] = p.tiempo ?? "2026-09-22 07:15:00";
  f[2] = p.dispositivo ?? "Estacionamiento2";
  f[3] = p.punto ?? "Entrada 2";
  f[4] = p.desc ?? "Apertura con verificación normal";
  f[8] = p.tarjeta ?? "11797300";
  f[9] = p.depto ?? "Padres de familia";
  return f.join("\t");
}

/** Arma el export tal como lo da ZK: linea de titulo, encabezados, datos. */
function archivo(filas: string[], conTitulo = true): string {
  const partes = conTitulo ? ["Todos los Eventos\t\t\t\t"] : [];
  partes.push(CAB.join("\t"), ...filas);
  return partes.join("\r\n");
}

/** Evento ya normalizado, para probar `marcarRepeticiones` sin pasar por el parser. */
function evento(p: Partial<EventoZk> = {}): EventoZk {
  n += 1;
  return {
    idEvento: 2000 + n,
    ocurrioEn: "2026-09-22 07:15:00",
    lote: "E2",
    sentido: "entrada",
    tarjeta: "11797300",
    descripcion: "Apertura con verificación normal",
    concedido: true,
    departamentoEvento: "Padres de familia",
    repeticion: false,
    ...p,
  };
}

describe("parsearEventosZk · encontrar los encabezados en vez de suponerlos", () => {
  it("lee el archivo con la linea de titulo que ZK pone antes de los encabezados", () => {
    const { eventos, resumen } = parsearEventosZk(archivo([cruda({ tarjeta: "12823700" })]));
    expect(resumen.filasArchivo).toBe(1);
    expect(eventos[0].tarjeta).toBe("12823700");
  });

  it("lee el archivo TAMBIEN si no trae la linea de titulo", () => {
    // Suponer que el encabezado es la segunda linea desplaza todas las columnas
    // una posicion sin que nada truene: salen conteos plausibles y equivocados.
    const { eventos } = parsearEventosZk(archivo([cruda({ tarjeta: "12823700" })], false));
    expect(eventos).toHaveLength(1);
    expect(eventos[0].tarjeta).toBe("12823700");
  });

  it("no inventa filas cuando el archivo no es la bitacora de accesos", () => {
    const otro = ["Usuarios\t\t", "ID\tNombre\tTarjeta", "1\tAlguien\t11797300"].join("\r\n");
    const { eventos, resumen } = parsearEventosZk(otro);
    expect(eventos).toHaveLength(0);
    expect(resumen.filasArchivo).toBe(0);
  });
});

describe("parsearEventosZk · el ruido del lector se descarta pero se cuenta", () => {
  it("una fila sin tarjeta no es un acceso: es el lector hablando solo", () => {
    // 29,506 de las 40,000 filas del archivo real son de esta clase. Contarlas
    // como accesos multiplica el trafico por mas de siete.
    const { eventos, resumen } = parsearEventosZk(archivo([
      cruda(),
      cruda({ tarjeta: "", desc: "Intervalo de operación muy corto" }),
      cruda({ tarjeta: "", desc: "Intervalo de operación muy corto" }),
    ]));
    expect(eventos).toHaveLength(1);
    expect(resumen.filasSinTarjeta).toBe(2);
    expect(resumen.filasArchivo).toBe(3);
  });

  it("un rechazo SI se conserva, porque es gente deteniendo el carril", () => {
    const { resumen } = parsearEventosZk(archivo([
      cruda(),
      cruda({ tarjeta: "9999999", desc: "Usuario no registrado" }),
    ]));
    expect(resumen.rechazos).toBe(1);
    expect(resumen.accesos).toBe(1);
  });

  it("el numero de TAG se normaliza sin ceros a la izquierda", () => {
    const { eventos } = parsearEventosZk(archivo([cruda({ tarjeta: " 011797300 " })]));
    expect(eventos[0].tarjeta).toBe("11797300");
  });
});

describe("parsearEventosZk · el lote y el sentido salen del punto de acceso", () => {
  it("toma el estacionamiento del punto y no del nombre del dispositivo", () => {
    // El dispositivo viene escrito de dos formas, «Estacionamiento 1» con espacio y
    // «Estacionamiento2» sin el, y esa inconsistencia ya causo una discrepancia
    // entre dos herramientas de analisis.
    const { eventos } = parsearEventosZk(archivo([
      cruda({ punto: "Entrada 1", dispositivo: "Estacionamiento 1" }),
      cruda({ punto: "Salida 2", dispositivo: "Estacionamiento2" }),
    ]));
    expect(eventos[0].lote).toBe("E1");
    expect(eventos[0].sentido).toBe("entrada");
    expect(eventos[1].lote).toBe("E2");
    expect(eventos[1].sentido).toBe("salida");
  });

  it("un punto que no dice si entra o sale se cuenta, NO se tira", () => {
    const { eventos, resumen } = parsearEventosZk(archivo([
      cruda({ punto: "Monitoreo remoto" }),
    ]));
    expect(eventos[0].sentido).toBeNull();
    expect(resumen.sinSentido).toBe(1);
  });
});

describe("marcarRepeticiones · colapsar la rafaga del lector", () => {
  it("la segunda lectura del mismo sentido en menos de dos minutos es repeticion", () => {
    const [a, b] = marcarRepeticiones([
      evento({ ocurrioEn: "2026-09-22 07:15:00" }),
      evento({ ocurrioEn: "2026-09-22 07:15:04" }),
    ]);
    expect(a.repeticion).toBe(false);
    expect(b.repeticion).toBe(true);
  });

  it("conserva la PRIMERA de la rafaga, que es cuando el coche paso", () => {
    const marcados = marcarRepeticiones([
      evento({ idEvento: 1, ocurrioEn: "2026-09-22 07:15:09" }),
      evento({ idEvento: 2, ocurrioEn: "2026-09-22 07:15:00" }),
    ]);
    // Llegan desordenadas a proposito: el archivo de ZK viene descendente.
    expect(marcados.find((e) => e.idEvento === 2)?.repeticion).toBe(false);
    expect(marcados.find((e) => e.idEvento === 1)?.repeticion).toBe(true);
  });

  it("pasados los dos minutos ya es otro paso, no una repeticion", () => {
    const [, b] = marcarRepeticiones([
      evento({ ocurrioEn: "2026-09-22 07:15:00" }),
      evento({ ocurrioEn: "2026-09-22 07:18:00" }),
    ]);
    expect(b.repeticion).toBe(false);
  });

  it("entrar y salir en el mismo minuto NO es una repeticion", () => {
    const [, b] = marcarRepeticiones([
      evento({ sentido: "entrada", ocurrioEn: "2026-09-22 07:15:00" }),
      evento({ sentido: "salida", ocurrioEn: "2026-09-22 07:15:30" }),
    ]);
    expect(b.repeticion).toBe(false);
  });

  it("la misma tarjeta en los dos estacionamientos NO es una repeticion", () => {
    const [, b] = marcarRepeticiones([
      evento({ lote: "E1", ocurrioEn: "2026-09-22 07:15:00" }),
      evento({ lote: "E2", ocurrioEn: "2026-09-22 07:15:30" }),
    ]);
    expect(b.repeticion).toBe(false);
  });

  it("un rechazo NO se come el acceso que lo sigue diez segundos despues", () => {
    // La persona reintento y paso: son dos hechos distintos. Sin esta regla, el
    // acceso bueno se marcaba como repeticion del rechazo y desaparecia del
    // conteo. Se detecto contrastando contra el archivo real, donde costaba un
    // acceso y una credencial de las 511 activas.
    const marcados = marcarRepeticiones([
      evento({ idEvento: 1, ocurrioEn: "2026-09-22 07:15:00", concedido: false, descripcion: "Usuario no registrado" }),
      evento({ idEvento: 2, ocurrioEn: "2026-09-22 07:15:10", concedido: true }),
    ]);
    expect(marcados.find((e) => e.idEvento === 2)?.repeticion).toBe(false);
  });

  it("dos rechazos seguidos SI son una rafaga", () => {
    const [, b] = marcarRepeticiones([
      evento({ ocurrioEn: "2026-09-22 07:15:00", concedido: false }),
      evento({ ocurrioEn: "2026-09-22 07:15:03", concedido: false }),
    ]);
    expect(b.repeticion).toBe(true);
  });

  it("dos tarjetas distintas a la misma hora NO se estorban", () => {
    const [, b] = marcarRepeticiones([
      evento({ tarjeta: "11111111", ocurrioEn: "2026-09-22 07:15:00" }),
      evento({ tarjeta: "22222222", ocurrioEn: "2026-09-22 07:15:10" }),
    ]);
    expect(b.repeticion).toBe(false);
  });

  it("NO modifica el arreglo que recibe", () => {
    const original = [evento({ ocurrioEn: "2026-09-22 07:15:00" }), evento({ ocurrioEn: "2026-09-22 07:15:05" })];
    marcarRepeticiones(original);
    expect(original.every((e) => e.repeticion === false)).toBe(true);
  });
});

describe("parsearEventosZk · el desbalance es el autodiagnostico de la limpieza", () => {
  it("entradas y salidas cuadran cuando la rafaga se colapsa", () => {
    // Es el caso real en miniatura: un coche entra y sale, y el lector de salida
    // dispara tres veces. En bruto parecen tres salidas contra una entrada.
    const { resumen } = parsearEventosZk(archivo([
      cruda({ punto: "Entrada 2", tiempo: "2026-09-22 07:00:00" }),
      cruda({ punto: "Salida 2", tiempo: "2026-09-22 14:00:00" }),
      cruda({ punto: "Salida 2", tiempo: "2026-09-22 14:00:03" }),
      cruda({ punto: "Salida 2", tiempo: "2026-09-22 14:00:07" }),
    ]));
    expect(resumen.entradas).toBe(1);
    expect(resumen.salidas).toBe(1);
    expect(resumen.repeticiones).toBe(2);
    expect(resumen.desbalance).toBe(0);
  });

  it("sin entradas el desbalance es null y no una division por cero", () => {
    const { resumen } = parsearEventosZk(archivo([cruda({ punto: "Salida 2" })]));
    expect(resumen.desbalance).toBeNull();
  });

  it("cuenta tarjetas distintas sobre los accesos reales, no sobre las filas", () => {
    const { resumen } = parsearEventosZk(archivo([
      cruda({ tarjeta: "11111111", tiempo: "2026-09-22 07:00:00" }),
      cruda({ tarjeta: "11111111", tiempo: "2026-09-22 07:00:05" }),
      cruda({ tarjeta: "22222222", tiempo: "2026-09-22 07:00:00" }),
    ]));
    expect(resumen.tarjetasDistintas).toBe(2);
    expect(resumen.accesos).toBe(2);
  });

  it("la ventana del archivo y los dias con actividad salen de los datos", () => {
    const { resumen } = parsearEventosZk(archivo([
      cruda({ tiempo: "2026-09-29 15:57:01" }),
      cruda({ tiempo: "2026-09-21 12:41:01" }),
      cruda({ tiempo: "2026-09-21 13:00:00" }),
    ]));
    expect(resumen.desde).toBe("2026-09-21 12:41:01");
    expect(resumen.hasta).toBe("2026-09-29 15:57:01");
    expect(resumen.diasConActividad).toBe(2);
  });

  it("un archivo pequeno NO se marca como truncado", () => {
    const { resumen } = parsearEventosZk(archivo([cruda()]));
    expect(resumen.topeAlcanzado).toBe(false);
  });
});

describe("huecoEnDias · lo que decide si el panel de bajas se puede encender", () => {
  it("mide los dias entre el final de una ventana y el inicio de la siguiente", () => {
    expect(huecoEnDias("2026-09-29 12:00:00", "2026-10-01 12:00:00")).toBe(2);
  });

  it("ventanas que se traslapan dan cero, no un numero negativo", () => {
    expect(huecoEnDias("2026-10-01 12:00:00", "2026-09-29 12:00:00")).toBe(0);
  });

  it("sin ventana anterior no hay hueco que medir", () => {
    expect(huecoEnDias(null, "2026-10-01 12:00:00")).toBeNull();
  });

  it("una fecha ilegible no truena ni inventa un numero", () => {
    expect(huecoEnDias("--", "2026-10-01 12:00:00")).toBeNull();
  });
});

describe("las constantes · estan aqui a proposito y con su medicion detras", () => {
  it("la ventana de colapso es de dos minutos", () => {
    // Medido: 3,064 salidas repetidas de la misma tarjeta en menos de dos minutos,
    // y ese ruido explica por si solo el exceso de salidas sobre entradas. Subirlo
    // colapsaria entradas legitimas de quien sale y vuelve a entrar.
    expect(DEDUP_MIN).toBe(2);
  });

  it("el tope de ZK son 40,000 filas", () => {
    // No es una suposicion: el archivo del 29-sep-2026 trajo exactamente 40,000 y
    // por eso cubrio ocho dias en vez del mes que se le pidio.
    expect(TOPE_EXPORT_ZK).toBe(40000);
  });

  it("dejar y recoger es media hora; ocupar el cajon la jornada son cuatro", () => {
    // La mediana de Padres de familia es de 18 minutos y la de Maestros de 8h 14m:
    // son dos poblaciones distintas y estos umbrales son los que las separan.
    expect(MIN_ESTANCIA_CORTA).toBe(30);
    expect(MIN_ESTANCIA_LARGA).toBe(240);
  });

  it("hacen falta tres ventanas antes de proponer una baja", () => {
    // Decision de Gerardo del 1-oct. Tres ventanas son unos 24 dias: absorbe una
    // incapacidad o un viaje sin que nadie salga en la lista por haber faltado.
    expect(VENTANAS_PARA_BAJA).toBe(3);
  });
});

describe("exportadoEnDe · la hora en el nombre del archivo", () => {
  it("lee la marca de tiempo que ZK pone en el nombre, venga en xls o en csv", () => {
    expect(exportadoEnDe("Todos los Eventos_20261002092612.xls")).toBe("2026-10-02 09:26:12");
    expect(exportadoEnDe("Todos los Eventos_20260929165910.csv")).toBe("2026-09-29 16:59:10");
  });
  it("un nombre sin marca da null, no una fecha inventada", () => {
    expect(exportadoEnDe("eventos.csv")).toBeNull();
    expect(exportadoEnDe("Todos los Eventos_2026100.csv")).toBeNull();
  });
  it("una marca imposible tampoco pasa", () => {
    expect(exportadoEnDe("x_20261345996161.csv")).toBeNull();
  });
  it("el parser la deja en el resumen cuando conoce el nombre, y en null cuando no", () => {
    const texto = archivo([cruda()]);
    expect(parsearEventosZk(texto, "Todos los Eventos_20260929165910.csv").resumen.exportadoEn).toBe("2026-09-29 16:59:10");
    expect(parsearEventosZk(texto).resumen.exportadoEn).toBeNull();
  });
});
