// Lo que fija este archivo: que «por quien viene» salga de los grupos de GES con la
// regla confirmada el 28-oct-2026, que los papas se partan por la seccion de sus
// hijos y no caigan todos en «Padres de familia», y que la curva de la tarde cuente
// a cada grupo con el mismo criterio que el barrido del tablero.
import { describe, it, expect } from "vitest";
import {
  ALUMNOS_QUE_MANEJAN,
  SALIDA_DESDE,
  SALIDA_PASO,
  SIN_FAMILIA,
  clasificarRecogida,
  indexarRecogida,
  nombrarSecciones,
  salidaPorClave,
  salidaPorGrupo,
  seccionDeGrupo,
  seccionesDe,
  viajesPorSeccion,
  type GrupoRecogida,
  type SeccionHijo,
} from "@/lib/recogida";
import { indexarGes, type IdentidadDecidida, type PersonaGesGuardada } from "@/lib/personas/identificar";
import type { PersonaZk } from "@/lib/zk/padron";
import type { EventoZk } from "@/lib/zk/eventos";

describe("seccionDeGrupo · los codigos de GES", () => {
  it("reconoce las cinco secciones", () => {
    expect(seccionDeGrupo("LAC")).toBe("comunidad");
    expect(seccionDeGrupo("CIB")).toBe("comunidad");
    expect(seccionDeGrupo("K2A")).toBe("preescolar");
    expect(seccionDeGrupo("PFC")).toBe("preescolar");
    expect(seccionDeGrupo("P1B")).toBe("primaria");
    expect(seccionDeGrupo("P6")).toBe("primaria");
    expect(seccionDeGrupo("S3A")).toBe("secundaria");
    expect(seccionDeGrupo("101")).toBe("preparatoria");
    expect(seccionDeGrupo("503")).toBe("preparatoria");
  });
  it("lo que no es un grupo no es una seccion", () => {
    expect(seccionDeGrupo("")).toBeNull();
    expect(seccionDeGrupo("X9")).toBeNull();
    expect(seccionDeGrupo("PERSONAL")).toBeNull();
  });
  it("una familia se ordena de menor a mayor y no repite", () => {
    expect(seccionesDe(["S1A", "P3B", "P1A", "S1A"])).toEqual(["primaria", "secundaria"]);
    expect(nombrarSecciones(["primaria", "secundaria"])).toBe("primaria y secundaria");
    expect(nombrarSecciones(["preescolar", "primaria", "preparatoria"])).toBe("preescolar, primaria y preparatoria");
    expect(nombrarSecciones(["primaria"])).toBe("primaria");
  });
});

describe("clasificarRecogida · por quien viene", () => {
  const papa = (grupos: string[] | null, deptoZk: string | null = "Padres de familia") =>
    clasificarRecogida({ grupoBase: "Padres de familia", deptoZk, grupos, esAlumno: false });

  it("el personal se queda con su departamento de ZK", () => {
    const r = clasificarRecogida({ grupoBase: "Personal docente", deptoZk: "PRIMARIA DOCENTE", grupos: null, esAlumno: false });
    expect(r).toMatchObject({ etiqueta: "PRIMARIA DOCENTE", grupo: "personal", vienePor: null });
  });
  it("solo primaria y menores es el grupo que se va a tiempo", () => {
    expect(papa(["P2A"])).toMatchObject({ etiqueta: "Padres de primaria", grupo: "primaria", vienePor: "primaria" });
    expect(papa(["K1A", "P4B"])).toMatchObject({ etiqueta: "Padres de preescolar y primaria", grupo: "primaria" });
  });
  it("solo secundaria o prepa espera hasta las 14:45; con hermanos menores, son los que se quedan", () => {
    expect(papa(["S2A"])).toMatchObject({ etiqueta: "Padres de secundaria", grupo: "secprepa" });
    expect(papa(["302"])).toMatchObject({ etiqueta: "Padres de preparatoria", grupo: "secprepa" });
    expect(papa(["P5A", "S1B"])).toMatchObject({ etiqueta: "Padres de primaria y secundaria", grupo: "hermanos", vienePor: "primaria y secundaria" });
    expect(papa(["S3A", "201"])).toMatchObject({ grupo: "hermanos" });
  });
  it("sin familia en GES no se inventa: se dice, y queda en el residuo", () => {
    expect(papa(null)).toMatchObject({ etiqueta: `Padres de familia · ${SIN_FAMILIA}`, grupo: "otros", vienePor: null, esPapa: true });
    expect(papa(null, "Ex alumnos")).toMatchObject({ etiqueta: `Ex alumnos · ${SIN_FAMILIA}` });
    expect(clasificarRecogida({ grupoBase: "Sin clasificar", deptoZk: null, grupos: null, esAlumno: false }).etiqueta).toBe("Sin clasificar");
  });
  it("una familia con grupos que no se reconocen tampoco se inventa", () => {
    expect(papa(["ZZ"])).toMatchObject({ grupo: "otros", vienePor: null });
  });
  it("el alumno que maneja va con los de prepa", () => {
    expect(clasificarRecogida({ grupoBase: "Alumnos", deptoZk: "Alumnos", grupos: null, esAlumno: true })).toMatchObject({ etiqueta: ALUMNOS_QUE_MANEJAN, grupo: "secprepa" });
  });
  it("papa es papa, ligado o no; el personal, los alumnos y lo institucional no", () => {
    expect(papa(["P2A"]).esPapa).toBe(true);
    expect(papa(null).esPapa).toBe(true);
    expect(clasificarRecogida({ grupoBase: "Personal docente", deptoZk: "PRIMARIA DOCENTE", grupos: null, esAlumno: false }).esPapa).toBe(false);
    expect(clasificarRecogida({ grupoBase: "Alumnos", deptoZk: "Alumnos", grupos: null, esAlumno: true }).esPapa).toBe(false);
    expect(clasificarRecogida({ grupoBase: "Sin clasificar", deptoZk: null, grupos: null, esAlumno: false }).esPapa).toBe(false);
  });
});

describe("indexarRecogida · la identidad sale de GES como en la ficha", () => {
  const tutor = (gesId: string, nombre: string, familia: string, grupos: string[]): PersonaGesGuardada =>
    ({ gesId, clase: "tutor", nombre, familia, rol: "madre", grupos, area: "", cargo: "", activo: true, fechaBaja: null, vigente: true });
  const indice = indexarGes([
    tutor("t1", "LOPEZ GARCIA MARIA", "F1", ["P2A"]),
    tutor("t2", "LOPEZ GARCIA JUAN", "F1", ["S1A"]),
    tutor("t3", "PEREZ SOTO ANA", "F2", ["301"]),
  ]);
  const zk = (tarjeta: string, nombre: string, departamentoId: string, departamento: string): [string, PersonaZk] =>
    [tarjeta, { tarjeta, nombre, nombres: "", apellidos: "", departamentoId, departamento, placa: "" }];
  const personas = new Map<string, PersonaZk>([
    zk("1001", "MARIA LOPEZ GARCIA", "19", "Padres de familia"),
    zk("1002", "ROBERTO NADIE", "19", "Padres de familia"),
    zk("1003", "LUIS DOCENTE", "4", "PRIMARIA DOCENTE"),
    zk("1004", "ALUMNO QUE MANEJA", "20", "Alumnos"),
  ]);

  it("por nombre: la familia da las secciones de los dos hijos", () => {
    const r = indexarRecogida({ personas, expedientes: new Map(), indice, decisiones: new Map() });
    expect(r.get("1001")).toMatchObject({ etiqueta: "Padres de primaria y secundaria", grupo: "hermanos" });
    expect(r.get("1002")).toMatchObject({ grupo: "otros", vienePor: null });
    expect(r.get("1003")).toMatchObject({ etiqueta: "PRIMARIA DOCENTE", grupo: "personal" });
    expect(r.get("1004")).toMatchObject({ etiqueta: ALUMNOS_QUE_MANEJAN });
  });
  it("la decision de TI manda sobre el nombre", () => {
    const d: IdentidadDecidida = { tarjeta: "1002", veredicto: "familiar", gesId: null, familia: "F2", nombre: "", preguntar: false, nota: "", decididoPor: "ti", decididoEn: "" };
    const r = indexarRecogida({ personas, expedientes: new Map(), indice, decisiones: new Map([["1002", d]]) });
    expect(r.get("1002")).toMatchObject({ etiqueta: "Padres de preparatoria", grupo: "secprepa" });
  });
  it("sin ZK, el expediente de SATAG pone el nombre y el tipo", () => {
    const expedientes = new Map([["2001", { nombre: "Ana Pérez Soto", tipoUsuario: "padres", areaAdmin: null }]]);
    const r = indexarRecogida({ personas: null, expedientes, indice, decisiones: new Map() });
    expect(r.get("2001")).toMatchObject({ etiqueta: "Padres de preparatoria" });
  });
});

describe("salidaPorGrupo · la tarde, por grupo y por estacionamiento", () => {
  let n = 0;
  const paso = (tarjeta: string, dia: string, hora: string, sentido: "entrada" | "salida", lote: "E1" | "E2" = "E2"): EventoZk => ({
    idEvento: 9000 + ++n, ocurrioEn: `${dia} ${hora}:00`, lote, sentido, tarjeta,
    descripcion: "Apertura con verificación normal", concedido: true, departamentoEvento: "", repeticion: false,
  });
  const estancia = (t: string, dia: string, entra: string, sale: string, lote: "E1" | "E2" = "E2") =>
    [paso(t, dia, entra, "entrada", lote), paso(t, dia, sale, "salida", lote)];
  // Cinco dias habiles iguales (lun 19 a vie 23-oct-2026): un papa de primaria de
  // 14:10 a 14:25, un papa de secundaria de 14:30 a 14:50, y un docente de 07:00 a
  // 15:05, todos en E2; nadie en E1. El primero y el ultimo los corta la ventana
  // (clasificarDias), asi que comparables son tres.
  const dias = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];
  const eventos = dias.flatMap((d) => [
    ...estancia("P", d, "14:10", "14:25"),
    ...estancia("S", d, "14:30", "14:50"),
    ...estancia("D", d, "07:00", "15:05"),
  ]);
  const grupoDe = (t: string): GrupoRecogida => (t === "P" ? "primaria" : t === "S" ? "secprepa" : "personal");
  const r = salidaPorGrupo(eventos, grupoDe);
  const i = (hhmm: string) => (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) - SALIDA_DESDE) / SALIDA_PASO;
  const e2 = r.porLote.find((l) => l.lote === "E2")!;
  const serie = (g: string) => e2.series.find((s) => s.clave === g)!;

  it("cuenta los tres dias y arranca a las 12:30 cada cinco minutos", () => {
    expect(r.dias).toBe(3);
    expect(r.minutos[0]).toBe(SALIDA_DESDE);
    expect(r.minutos[1] - r.minutos[0]).toBe(SALIDA_PASO);
  });
  it("a las 14:15 esta el de primaria y el docente; a las 14:35, el de secundaria y el docente", () => {
    expect(serie("primaria").dentro[i("14:15")]).toBe(1);
    expect(serie("secprepa").dentro[i("14:15")]).toBe(0);
    expect(serie("personal").dentro[i("14:15")]).toBe(1);
    expect(serie("primaria").dentro[i("14:35")]).toBe(0);
    expect(serie("secprepa").dentro[i("14:35")]).toBe(1);
    expect(e2.maxDentro).toBe(2);
  });
  it("a igual minuto primero sale y luego entra: a las 14:25 el de primaria ya no esta", () => {
    expect(serie("primaria").dentro[i("14:25")]).toBe(0);
    expect(serie("primaria").dentro[i("14:10")]).toBe(1);
  });
  it("las salidas caen en la celda de cinco minutos que las contiene", () => {
    expect(serie("primaria").salen[i("14:25")]).toBe(1);
    expect(serie("secprepa").salen[i("14:50")]).toBe(1);
    expect(serie("personal").salen[i("15:05")]).toBe(1);
    expect(serie("primaria").entran[i("14:10")]).toBe(1);
    expect(serie("secprepa").entran[i("14:30")]).toBe(1);
  });
  it("el E1 queda en cero y los grupos sin gente tambien", () => {
    const e1 = r.porLote.find((l) => l.lote === "E1")!;
    expect(e1.maxDentro).toBe(0);
    expect(serie("hermanos").dentro.every((v) => v === 0)).toBe(true);
  });
  it("la poblacion de la tarde: cuantos por dia y cuando entran y salen", () => {
    expect(serie("primaria")).toMatchObject({ autosPorDia: 1, entra: { p50: 14 * 60 + 10 }, sale: { p50: 14 * 60 + 25 } });
    expect(serie("personal")).toMatchObject({ autosPorDia: 1, entra: { p50: 7 * 60 }, sale: { p50: 15 * 60 + 5 } });
    expect(serie("hermanos")).toMatchObject({ autosPorDia: 0, entra: null, sale: null });
    const ambos = r.porLote.find((l) => l.lote === "ambos")!;
    expect(ambos.series.find((s) => s.clave === "primaria")!.dentro[i("14:15")]).toBe(1);
    expect(ambos.maxDentro).toBe(2);
  });
  it("sin claves fijas, el detalle lista solo las secciones y combinaciones que se van en la tarde", () => {
    const d = salidaPorClave(eventos, (t) => (t === "P" ? "Padres de primaria" : t === "S" ? "Padres de secundaria" : "PRIMARIA DOCENTE"), null);
    const e2d = d.porLote.find((l) => l.lote === "E2")!;
    expect(e2d.series.map((s) => s.clave).sort()).toEqual(["PRIMARIA DOCENTE", "Padres de primaria", "Padres de secundaria"]);
    expect(d.porLote.find((l) => l.lote === "E1")!.series).toEqual([]);
  });
});

describe("viajesPorSeccion · por seccion, a que hora entran y salen los papas", () => {
  let n = 0;
  const paso = (tarjeta: string, dia: string, hora: string, sentido: "entrada" | "salida", lote: "E1" | "E2" = "E2"): EventoZk => ({
    idEvento: 7000 + ++n, ocurrioEn: `${dia} ${hora}:00`, lote, sentido, tarjeta,
    descripcion: "Apertura con verificación normal", concedido: true, departamentoEvento: "", repeticion: false,
  });
  const viaje = (t: string, dia: string, entra: string, sale: string, lote: "E1" | "E2" = "E2") =>
    [paso(t, dia, entra, "entrada", lote), paso(t, dia, sale, "salida", lote)];
  // Cinco dias iguales (tres comparables). K: solo kinder. KS: kinder y secundaria,
  // que en la tarde espera al mayor. S: solo secundaria. N: papa sin ligar. D: docente.
  const dias = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];
  const eventos = dias.flatMap((d) => [
    ...viaje("K", d, "07:40", "07:55"), ...viaje("K", d, "13:20", "13:45"),
    ...viaje("KS", d, "06:55", "07:10"), ...viaje("KS", d, "13:30", "14:45"),
    ...viaje("S", d, "14:30", "14:50", "E1"),
    ...viaje("N", d, "14:00", "14:40"),
    ...viaje("D", d, "07:00", "15:05"),
  ]);
  // KS viene al reves a proposito: el orden de edad lo pone la funcion, no quien la llama.
  const secciones: Record<string, SeccionHijo[] | null> = { K: ["preescolar"], KS: ["secundaria", "preescolar"], S: ["secundaria"], N: [], D: null };
  const m = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  const tarde = viajesPorSeccion(eventos, (t) => secciones[t] ?? null, "tarde");
  const manana = viajesPorSeccion(eventos, (t) => secciones[t] ?? null, "manana");
  const de = (v: typeof tarde, lote: string, s: string) => v.porLote.find((l) => l.lote === lote)!.secciones.find((x) => x.seccion === s);

  it("en la tarde, kinder tiene dos autos al dia y la mitad se queda hasta secundaria", () => {
    expect(tarde.dias).toBe(3);
    const k = de(tarde, "ambos", "preescolar")!;
    expect(k).toMatchObject({ autosPorDia: 2, conMayor: 1 });
    expect(k.filas.map((f) => f.mayor)).toEqual(["preescolar", "secundaria"]);
    expect(k.filas[0]).toMatchObject({ autosPorDia: 1, parte: 0.5, entra: { p50: m("13:20") }, sale: { p50: m("13:45") }, dentro: { p50: 25 } });
    expect(k.filas[1]).toMatchObject({ sale: { p50: m("14:45") }, dentro: { p50: 75 } });
  });
  it("una familia cuenta en cada seccion de sus hijos, y la seccion mayor no tiene a nadie que esperar", () => {
    const s = de(tarde, "ambos", "secundaria")!;
    expect(s).toMatchObject({ autosPorDia: 2, conMayor: 0 });
    expect(s.filas).toHaveLength(1);
    expect(s.filas[0]).toMatchObject({ mayor: "secundaria", autosPorDia: 2, parte: 1 });
  });
  it("el papa sin ligar va aparte y el docente no entra", () => {
    const sin = de(tarde, "ambos", "sin")!;
    expect(sin).toMatchObject({ autosPorDia: 1, conMayor: 0 });
    expect(sin.filas[0]).toMatchObject({ mayor: null, sale: { p50: m("14:40") } });
    const todas = tarde.porLote.find((l) => l.lote === "ambos")!.secciones.map((x) => x.seccion);
    expect(todas).toEqual(["preescolar", "secundaria", "sin"]);
  });
  it("por estacionamiento: el de solo secundaria esta en E1 y no en E2", () => {
    expect(de(tarde, "E1", "secundaria")).toMatchObject({ autosPorDia: 1 });
    expect(de(tarde, "E2", "secundaria")).toMatchObject({ autosPorDia: 1, filas: [{ mayor: "secundaria", dentro: { p50: 75 } }] });
    expect(de(tarde, "E1", "preescolar")).toBeUndefined();
  });
  it("en la mañana se cuentan las entradas de 06:00 a 09:30, y la fila dice con que hijos vienen", () => {
    const k = de(manana, "ambos", "preescolar")!;
    expect(k).toMatchObject({ autosPorDia: 2, conMayor: 1 });
    expect(k.filas[0]).toMatchObject({ mayor: "preescolar", entra: { p50: m("07:40") }, sale: { p50: m("07:55") }, dentro: { p50: 15 } });
    expect(k.filas[1]).toMatchObject({ mayor: "secundaria", entra: { p50: m("06:55") } });
    expect(de(manana, "ambos", "sin")).toBeUndefined();
  });
});
