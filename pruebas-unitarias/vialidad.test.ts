// Lo que fija este archivo: que Seguir cuente los dias por el calendario del
// experimento y no por la regla del tablero. `clasificarDias` tira el primer y el
// ultimo dia de lo que recibe y excluye los dias con pocos accesos; aqui el 3-nov
// cuenta aunque sea el primer dia de su fase, un testigo con solo personal cuenta, y
// un dia cortado por el export o sin bitacora se dice con su motivo y suma en «m»,
// no en «n».
import { describe, it, expect } from "vitest";
import type { Corte } from "@/lib/estacionamiento";
import type { EventoZk } from "@/lib/zk/eventos";
import type { SeccionHijo } from "@/lib/recogida";
import {
  CALENDARIO_VIAL,
  SALIDA_SECCION,
  diasHabilesDe,
  faseDe,
  horaSalidaDe,
  medirSeguimiento,
  medirFlujo,
  grupoDeSecciones,
  type GrupoSalida,
  resumirCelda,
  tipoDiaDe,
  type CalendarioVial,
} from "@/lib/vialidad";

let n = 0;

function paso(p: Partial<EventoZk> & { hora: string; dia: string }): EventoZk {
  n += 1;
  const { hora, dia, ...resto } = p;
  return {
    idEvento: 7000 + n,
    ocurrioEn: `${dia} ${hora}`,
    lote: "E2",
    sentido: "entrada",
    tarjeta: "11797300",
    descripcion: "Apertura con verificación normal",
    concedido: true,
    departamentoEvento: "Padres de familia",
    repeticion: false,
    ...resto,
  };
}

function estancia(tarjeta: string, entra: string, sale: string, dia: string, lote: "E1" | "E2" = "E2"): EventoZk[] {
  return [paso({ tarjeta, hora: entra, dia, lote }), paso({ tarjeta, hora: sale, dia, lote, sentido: "salida" })];
}

const corteA = (dia: string, minuto: number): Corte => ({ dia, minuto, exportadoEn: null, retrasoMin: null });

describe("calendario del experimento", () => {
  it("fase de cada dia: testigo manda sobre el rango, fin de semana no cuenta", () => {
    expect(faseDe("2026-11-03")).toBe("antes");
    expect(faseDe("2026-11-20")).toBe("antes");
    expect(faseDe("2026-11-16")).toBe("testigo");
    expect(faseDe("2026-11-02")).toBe("testigo");
    expect(faseDe("2026-10-30")).toBe("testigo");
    expect(faseDe("2026-11-14")).toBeNull();
    expect(faseDe("2026-11-21")).toBeNull();
    expect(faseDe("2026-11-23")).toBe("piloto");
    expect(faseDe("2026-12-04")).toBe("piloto");
    expect(faseDe("2026-12-07")).toBeNull();
    expect(faseDe("2026-10-29")).toBeNull();
  });
  it("tipo de dia: lunes a jueves, viernes, o nada", () => {
    expect(tipoDiaDe("2026-11-03")).toBe("LJ");
    expect(tipoDiaDe("2026-11-06")).toBe("V");
    expect(tipoDiaDe("2026-11-07")).toBeNull();
    expect(tipoDiaDe("2026-11-08")).toBeNull();
  });
  it("los dias habiles de cada fase y tipo, sin el testigo que cae adentro", () => {
    expect(diasHabilesDe("antes", "LJ")).toEqual([
      "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-17", "2026-11-18", "2026-11-19",
    ]);
    expect(diasHabilesDe("antes", "V")).toEqual(["2026-11-06", "2026-11-13", "2026-11-20"]);
    expect(diasHabilesDe("piloto", "LJ")).toEqual([
      "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03",
    ]);
    expect(diasHabilesDe("piloto", "V")).toEqual(["2026-11-27", "2026-12-04"]);
    expect(diasHabilesDe("testigo", "LJ")).toEqual(["2026-11-02", "2026-11-16"]);
    expect(diasHabilesDe("testigo", "V")).toEqual(["2026-10-30"]);
  });
  it("un dia sin clases sale de su fase", () => {
    const cal: CalendarioVial = { ...CALENDARIO_VIAL, sinClases: ["2026-11-04"] };
    expect(faseDe("2026-11-04", cal)).toBeNull();
    expect(diasHabilesDe("antes", "LJ", cal)).toHaveLength(9);
  });
  it("la hora de salida del piloto hereda la de antes salvo que se mueva", () => {
    expect(horaSalidaDe("primaria", "piloto")).toBe(SALIDA_SECCION.primaria);
    const cal: CalendarioVial = { ...CALENDARIO_VIAL, salidaPiloto: { preescolar: 13 * 60 + 40 } };
    expect(horaSalidaDe("preescolar", "piloto", cal)).toBe(13 * 60 + 40);
    expect(horaSalidaDe("preescolar", "antes", cal)).toBe(SALIDA_SECCION.preescolar);
  });
  it("resumirCelda: mediana, min y max de lo que hay, y cuantos de cuantos", () => {
    expect(resumirCelda([null, 3, 1], 5)).toEqual({ mediana: 2, min: 1, max: 3, n: 2, m: 5 });
    expect(resumirCelda([null], 2)).toEqual({ mediana: null, min: null, max: null, n: 0, m: 2 });
  });
});

/**
 * Un dia habil con alumnos, en E2: el personal D todo el dia; P (primaria) y S
 * (secundaria) vienen a recoger; X (primaria) entra a las 12:30, demasiado antes;
 * Y es un papa sin familia en GES. En E1, dos del personal.
 */
function diaConClases(dia: string): EventoZk[] {
  return [
    ...estancia("D", "07:00:00", "15:05:00", dia),
    ...estancia("P", "13:36:00", "14:20:00", dia),
    ...estancia("S", "13:38:00", "14:50:00", dia),
    ...estancia("X", "12:30:00", "14:22:00", dia),
    ...estancia("Y", "14:50:00", "15:30:00", dia),
    ...estancia("D1", "06:50:00", "15:00:00", dia, "E1"),
    ...estancia("D2", "07:10:00", "14:00:00", dia, "E1"),
  ];
}
/** Un dia testigo: solo personal. */
function diaTestigo(dia: string): EventoZk[] {
  return [...estancia("D", "07:00:00", "15:05:00", dia), ...estancia("D1", "06:50:00", "15:35:00", dia, "E1")];
}
const SECCIONES: Record<string, SeccionHijo[] | null> = { D: null, D1: null, D2: null, P: ["primaria"], S: ["secundaria"], X: ["primaria"], Y: [] };
const seccionesDe = (t: string) => SECCIONES[t] ?? null;

const serie = [
  ...diaTestigo("2026-10-30"),
  ...diaTestigo("2026-11-02"),
  ...diaConClases("2026-11-03"),
  ...diaConClases("2026-11-04"),
  ...diaConClases("2026-11-05"),
  ...diaConClases("2026-11-23"),
  ...diaConClases("2026-11-24"),
  // El dia del corte: la jornada seguia corriendo cuando se exporto.
  paso({ tarjeta: "D1", hora: "06:50:00", dia: "2026-11-25", lote: "E1" }),
  paso({ tarjeta: "D", hora: "07:00:00", dia: "2026-11-25" }),
];
const op = { corte: corteA("2026-11-25", 10 * 60), seccionesDeTarjeta: seccionesDe, minAccesosDia: 4 };

describe("medirSeguimiento · los cinco numeros por dia", () => {
  const r = medirSeguimiento(serie, op);
  const dia = (d: string) => r.dias.find((x) => x.dia === d)!;

  it("el primer dia de la fase cuenta: no lo tira ninguna regla de ventana", () => {
    expect(dia("2026-11-03").completo).toBe(true);
    expect(dia("2026-11-03").motivo).toBeNull();
    expect(dia("2026-11-03").accesos).toBe(14);
  });
  it("minutos dentro por familia: solo quien viene a recoger, por la salida del hijo menor", () => {
    const d = dia("2026-11-03");
    // P: 44 min, S: 72 min. X entro a las 12:30 (antes de las 13:10) y no cuenta; Y no tiene familia.
    expect(d.familias).toBe(2);
    expect(d.sinFamilia).toBe(1);
    expect(d.valores.minutosFamilia).toBe(58);
  });
  it("cajones libres en E2 de 14:35 a 15:00: el relevo de las 14:50 no cuenta dos", () => {
    // Dentro a las 14:35: D y S. A las 14:50 sale S y entra Y: siguen siendo 2.
    expect(dia("2026-11-03").valores.libresE2).toBe(118);
  });
  it("lo mas que sale y lo mas que llega a E2 en 5 min, y el pico de E1", () => {
    const d = dia("2026-11-03");
    expect(d.valores.salenE2).toBe(2); // P a las 14:20 y X a las 14:22
    expect(d.valores.lleganE2).toBe(2); // P a las 13:36 y S a las 13:38
    expect(d.valores.picoE1).toBe(2);
  });
  it("un dia testigo con solo personal cuenta, y su cifra de familias queda vacia", () => {
    const d = dia("2026-11-02");
    expect(d.fase).toBe("testigo");
    expect(d.completo).toBe(true);
    expect(d.familias).toBe(0);
    expect(d.valores.minutosFamilia).toBeNull();
    expect(d.valores.libresE2).toBe(119);
    expect(d.valores.lleganE2).toBe(0);
  });
  it("un dia sin bitacora se dice y no cuenta; el dia del corte tampoco", () => {
    expect(dia("2026-11-16").completo).toBe(false);
    expect(dia("2026-11-16").motivo).toBe("sin bitácora");
    expect(dia("2026-11-25").completo).toBe(false);
    expect(dia("2026-11-25").motivo).toContain("termina a las 10:00");
  });
  it("un dia con pocos accesos o cortado por la tarde se dice con su motivo", () => {
    const corto = medirSeguimiento([...diaConClases("2026-11-03").slice(0, 6), ...estancia("Z", "07:00:00", "14:00:00", "2026-11-04")], { seccionesDeTarjeta: seccionesDe, minAccesosDia: 4 });
    const d3 = corto.dias.find((x) => x.dia === "2026-11-03")!;
    expect(d3.completo).toBe(false);
    // Quedan D, P y S: el ultimo acceso es la salida de D a las 15:05.
    expect(d3.motivo).toBe("la bitácora de ese día termina a las 15:05");
    const d4 = corto.dias.find((x) => x.dia === "2026-11-04")!;
    expect(d4.motivo).toBe("solo 2 accesos");
  });
});

describe("medirSeguimiento · el resumen por fase y tipo de dia", () => {
  const r = medirSeguimiento(serie, op);
  const celda = (fase: string, tipo: string) => r.resumen.find((x) => x.fase === fase && x.tipo === tipo)!;

  it("antes, lunes a jueves: 3 dias con bitacora de 10 habiles", () => {
    const c = celda("antes", "LJ");
    expect(c.m).toBe(10);
    expect(c.n).toBe(3);
    expect(c.metricas.minutosFamilia).toEqual({ mediana: 58, min: 58, max: 58, n: 3, m: 10 });
    expect(c.metricas.libresE2.mediana).toBe(118);
  });
  it("los viernes de antes todavia no tienen dias", () => {
    expect(celda("antes", "V")).toMatchObject({ n: 0, m: 3 });
    expect(celda("antes", "V").metricas.libresE2.mediana).toBeNull();
  });
  it("el piloto cuenta 2 de 8: el dia del corte queda fuera", () => {
    expect(celda("piloto", "LJ")).toMatchObject({ n: 2, m: 8 });
    expect(celda("piloto", "V")).toMatchObject({ n: 0, m: 2 });
  });
  it("los testigos: 1 de 2 entre semana (el 16-nov sin bitacora) y el viernes 30-oct", () => {
    expect(celda("testigo", "LJ")).toMatchObject({ n: 1, m: 2 });
    expect(celda("testigo", "V")).toMatchObject({ n: 1, m: 1 });
    expect(celda("testigo", "LJ").metricas.minutosFamilia.n).toBe(0);
  });
  it("sin GES no hay familias, y se dice", () => {
    const sinGes = medirSeguimiento(serie, { corte: op.corte, minAccesosDia: 4 });
    expect(sinGes.conGes).toBe(false);
    expect(sinGes.resumen.find((x) => x.fase === "antes" && x.tipo === "LJ")!.metricas.minutosFamilia.n).toBe(0);
    expect(sinGes.resumen.find((x) => x.fase === "antes" && x.tipo === "LJ")!.metricas.libresE2.n).toBe(3);
  });
  it("el cupo de E2 es parametro: con 100 cajones, 98 libres", () => {
    const r100 = medirSeguimiento(serie, { ...op, cajonesE2: 100 });
    expect(r100.cajonesE2).toBe(100);
    expect(r100.dias.find((x) => x.dia === "2026-11-03")!.valores.libresE2).toBe(98);
  });
});

describe("medirFlujo · la tarde como una fila", () => {
  const GRUPO: Record<string, GrupoSalida> = { D: "personal", D1: "personal", D2: "personal", P: "primaria", X: "primaria", S: "secprepa", Y: "otros" };
  const serieFlujo = [
    ...diaConClases("2026-10-20"),
    ...diaConClases("2026-10-21"),
    // Fuera del dia tipico: un viernes y un testigo.
    ...diaConClases("2026-10-23"),
    ...diaTestigo("2026-11-02"),
  ];
  const f = medirFlujo(serieFlujo, { grupoDe: (t) => GRUPO[t] ?? "otros", seccionesDeTarjeta: seccionesDe, minAccesosDia: 4 })!;

  it("solo cuenta lunes a jueves con la tarde completa, sin testigos ni viernes", () => {
    expect(f.dias).toEqual(["2026-10-20", "2026-10-21"]);
  });
  it("las curvas acumuladas empiezan con los que ya estaban y cierran con todo lo que paso", () => {
    expect(f.acumuladas[0]).toEqual({ minuto: 12 * 60, llegaron: 1, salieron: 0 });
    const fin = f.acumuladas[f.acumuladas.length - 1];
    expect(fin.minuto).toBe(16 * 60);
    expect(fin.llegaron).toBe(5); // D ya estaba; entran X, P, S y Y
    expect(fin.salieron).toBe(5);
  });
  it("lo mas lleno: la mayor distancia entre las dos curvas, y lo que ven las estancias completas", () => {
    expect(f.masLleno).toEqual({ minuto: 13 * 60 + 40, dentro: 4, libres: 116 });
    expect(f.completasEnMasLleno).toBe(4);
  });
  it("la tarde cada 5 minutos: picos y con que salida se van", () => {
    expect(f.picoLlegan).toBe(13 * 60 + 35);
    expect(f.picoSalen).toBe(14 * 60 + 20);
    expect(f.tarde.find((t) => t.minuto === 14 * 60 + 20)!.salenPor).toEqual({ primaria: 2 });
  });
  it("quien esta dentro a las 14:40, promedio por dia", () => {
    expect(f.dentro1440.E2).toEqual({ personal: 1, secprepa: 1 });
    expect(f.dentro1440.E1).toEqual({ personal: 1 });
  });
  it("la cuenta del sistema: llegan, minutos por familia y papas a las 14:30", () => {
    expect(f.sistema).toMatchObject({ llegan: 2, cadaMin: 40, papasA1430: 1, conHermanos: 0, minutosDentro: 58 });
  });
  it("sin GES no hay cuenta del sistema, y sin dias completos no hay flujo", () => {
    expect(medirFlujo(serieFlujo, { grupoDe: () => "otros", minAccesosDia: 4 })!.sistema).toBeNull();
    expect(medirFlujo(diaTestigo("2026-11-02"), { grupoDe: () => "otros", minAccesosDia: 4 })).toBeNull();
  });
  it("el grupo de salida es el del hijo mayor; secundaria y prepa van juntas", () => {
    expect(grupoDeSecciones(["primaria", "preescolar"])).toBe("primaria");
    expect(grupoDeSecciones(["preparatoria", "primaria"])).toBe("secprepa");
    expect(grupoDeSecciones([])).toBe("otros");
  });
});
