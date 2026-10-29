// Lo que fija este archivo: que los motivos del cliente sean los mismos que acepta la
// base (bloque 97), que las aperturas se sigan por vehiculo aunque el portero no lo
// haya identificado (por la placa escrita), y de que estacionamiento es un caso.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  MOTIVOS_APERTURA,
  MOTIVOS_REPORTE,
  agruparPorVehiculo,
  delLote,
  claveVehiculo,
  comoSeguimiento,
  estadoAviso,
  seguimientoDeReporte,
  seguimientoDeApertura,
  SEGUIMIENTO_APERTURA,
  cruzarAperturas,
  csvAperturas,
  paredQueretaro,
  datosComunes,
  estanciasDe,
  evaluacionesDe,
  lotesDeCaseta,
  casetaFijaDe,
  puertasDeCaseta,
  type ResultadoCaseta,
  lotesDeCaso,
  placaNormalizada,
  resumenAperturas,
  type ReporteCaseta,
} from "@/lib/caseta";

const sql = readFileSync(fileURLToPath(new URL("../supabase/sql/97_caseta.sql", import.meta.url)), "utf8");

/** Las claves de un bloque `when p_clase = '<clase>' then case p_motivo ... end` del 97. */
function clavesSql(clase: string): string[] {
  const ini = sql.indexOf(`when p_clase = '${clase}' then case p_motivo`);
  const fin = sql.indexOf("end", ini);
  return [...sql.slice(ini, fin).matchAll(/when '([a-z-]+)'/g)].map((m) => m[1]);
}

describe("los motivos son los de la base", () => {
  it("aperturas", () => {
    expect(clavesSql("apertura").sort()).toEqual(MOTIVOS_APERTURA.map((m) => m.id).sort());
  });
  it("reportes", () => {
    expect(clavesSql("reporte").sort()).toEqual(MOTIVOS_REPORTE.map((m) => m.id).sort());
  });
});

describe("placaNormalizada", () => {
  it("mayusculas, sin espacios ni guiones", () => {
    expect(placaNormalizada(" abc-12 3 ")).toBe("ABC123");
    expect(placaNormalizada(null)).toBe("");
  });
});

const rep = (o: Partial<ReporteCaseta>): ReporteCaseta => ({
  id: "r", clase: "apertura", puerta: "E1-entrada", motivo: "no-leyo", registroId: null, tarjeta: null, placaNorm: null,
  vehiculoTexto: null, nota: "", veredicto: null, casoNumero: null, hechoPor: "portero@x", hechoEn: "2026-10-14T13:00:00Z",
  ligadoPor: null, ligadoEn: null, nombre: null, placas: null, marca: null, modelo: null, color: null, ...o,
});

describe("claveVehiculo y agruparPorVehiculo", () => {
  it("expediente, luego TAG, luego placa escrita", () => {
    expect(claveVehiculo(rep({ registroId: "a", tarjeta: "1", placaNorm: "X" }))).toBe("exp:a");
    expect(claveVehiculo(rep({ tarjeta: "1234567", placaNorm: "X" }))).toBe("tag:1234567");
    expect(claveVehiculo(rep({ placaNorm: "ABC123" }))).toBe("placa:ABC123");
    expect(claveVehiculo(rep({ id: "z" }))).toBe("solo:z");
  });

  it("junta las aperturas sin identificar de la misma placa y ordena por cuantas", () => {
    const g = agruparPorVehiculo([
      rep({ id: "1", placaNorm: "ABC123", vehiculoTexto: "Nissan rojo", motivo: "visita", hechoEn: "2026-10-13T13:00:00Z" }),
      rep({ id: "2", placaNorm: "ABC123", motivo: "visita", hechoEn: "2026-10-14T13:00:00Z", puerta: "E2-entrada" }),
      rep({ id: "3", registroId: "p", nombre: "Persona Uno", veredicto: "no-abre", motivo: "sin-acceso" }),
    ]);
    expect(g.map((v) => v.clave)).toEqual(["placa:ABC123", "exp:p"]);
    expect(g[0].aperturas).toBe(2);
    expect(g[0].identificado).toBe(false);
    expect(g[0].titulo).toBe("ABC123");
    expect(g[0].puertas).toEqual(["E1-entrada", "E2-entrada"]);
    expect(g[0].ultima).toBe("2026-10-14T13:00:00Z");
    expect(g[1].identificado).toBe(true);
    expect(g[1].sinAcceso).toBe(1);
  });
});

describe("resumenAperturas", () => {
  it("separa TAG o lector de las que no tenian acceso, por dia de Queretaro", () => {
    const r = resumenAperturas([
      rep({ id: "1", veredicto: "abre", motivo: "no-leyo", tarjeta: "1" }),
      rep({ id: "2", veredicto: "no-abre", motivo: "sin-acceso", tarjeta: "2" }),
      rep({ id: "3", motivo: "visita", placaNorm: "X", hechoEn: "2026-10-15T03:00:00Z" }),
      rep({ id: "4", clase: "reporte", motivo: "falla" }),
    ]);
    expect(r.total).toBe(3);
    expect(r.tagOLector).toBe(1);
    expect(r.sinAcceso).toBe(1);
    expect(r.sinIdentificar).toBe(1);
    // 03:00 UTC del 15 es el 14 en Queretaro.
    expect(r.porDia).toEqual([{ dia: "2026-10-14", n: 3 }]);
    expect(r.porPuerta.find((p) => p.puerta === "E1-entrada")?.n).toBe(3);
  });
});

describe("csvAperturas", () => {
  it("escapa comillas y lleva encabezado", () => {
    const csv = csvAperturas([rep({ nota: 'dijo "ya voy"' })], (v) => v);
    const [cab, fila] = csv.split("\r\n");
    expect(cab.startsWith('"Fecha y hora"')).toBe(true);
    expect(fila).toContain('"dijo ""ya voy"""');
  });
});

describe("lotesDeCaso y delLote", () => {
  it("plumas del expediente, lote de la clave y puerta de la caseta", () => {
    const plumas = (id: string) => (id === "p" ? ["E2"] : undefined);
    expect(lotesDeCaso({ registroId: "p", clave: "rechazo-diario:123:E1", evidencia: {} }, plumas)).toEqual(["E1", "E2"]);
    expect(lotesDeCaso({ registroId: null, clave: null, evidencia: { caseta: { puerta: "E2-salida" } } }, plumas)).toEqual(["E2"]);
    expect(lotesDeCaso({ registroId: null, clave: "sin-padron:123", evidencia: {} }, plumas)).toEqual([]);
  });

  it("lo que no se sabe de que estacionamiento es sale en los dos", () => {
    const a = (lotes: string[]) => ({ lotes });
    const lista = [a(["E1"]), a(["E2"]), a([])];
    expect(delLote(lista, ["E1"]).map((x) => x.lotes)).toEqual([["E1"], []]);
    expect(delLote(lista, ["E1", "E2"])).toHaveLength(3);
    expect(delLote(lista, null)).toHaveLength(3);
  });
});

describe("estanciasDe: las ultimas veces en la pluma", () => {
  const p = (en: string, sentido: "entrada" | "salida", concedido = true, lote = "E2") => ({ en, lote, sentido, concedido });

  it("junta entrada y salida del mismo dia, de la mas nueva a la mas vieja", () => {
    const f = estanciasDe([p("2026-10-01T07:46:00", "entrada"), p("2026-10-01T16:18:00", "salida"), p("2026-10-02T07:54:00", "entrada"), p("2026-10-02T16:14:00", "salida")]);
    expect(f).toEqual([
      { tipo: "estancia", lote: "E2", entrada: "2026-10-02T07:54:00", salida: "2026-10-02T16:14:00" },
      { tipo: "estancia", lote: "E2", entrada: "2026-10-01T07:46:00", salida: "2026-10-01T16:18:00" },
    ]);
  });

  it("un rechazo es su propia fila; la entrada sin salida queda abierta (como el caso real de una baja)", () => {
    const f = estanciasDe([
      p("2026-09-28T08:52:00", "entrada"),
      p("2026-09-28T09:43:00", "salida", false),
      p("2026-09-30T19:47:00", "entrada", false),
      p("2026-10-02T07:41:00", "entrada", false),
    ]);
    expect(f.map((x) => x.tipo)).toEqual(["rechazo", "rechazo", "rechazo", "estancia"]);
    expect(f[3]).toEqual({ tipo: "estancia", lote: "E2", entrada: "2026-09-28T08:52:00", salida: null });
  });

  it("una salida sin entrada y el tope de filas", () => {
    const f = estanciasDe([p("2026-09-30T16:05:00", "salida"), ...Array.from({ length: 6 }, (_, i) => p(`2026-10-0${i + 1}T08:00:00`, "entrada"))], 5);
    expect(f).toHaveLength(5);
    expect(estanciasDe([p("2026-09-30T16:05:00", "salida")])[0]).toEqual({ tipo: "estancia", lote: "E2", entrada: null, salida: "2026-09-30T16:05:00" });
  });
});

describe("la caseta cubre estacionamientos, no puertas", () => {
  it("un estacionamiento da su entrada y su salida; los dos, las cuatro", () => {
    expect(lotesDeCaseta("E1-E2")).toEqual(["E1", "E2"]);
    expect(puertasDeCaseta("E2").map((p) => p.id)).toEqual(["E2-entrada", "E2-salida"]);
    expect(puertasDeCaseta("E1-E2")).toHaveLength(4);
  });

  it("evaluacionesDe ordena E1 antes que E2 y datosComunes toma la primera", () => {
    const ev = (v: "abre" | "no-abre", tarjeta: string) => ({
      veredicto: v, motivos: [], baja: null, tarjeta, departamentoZk: null, placaZk: null, nombreZk: null, ultimoPaso: null,
    });
    const r = { evaluaciones: { E2: ev("no-abre", "2"), E1: ev("abre", "1") } } as unknown as ResultadoCaseta;
    expect(evaluacionesDe(r).map((x) => `${x.lote}:${x.ev.veredicto}`)).toEqual(["E1:abre", "E2:no-abre"]);
    expect(datosComunes(r)?.tarjeta).toBe("1");
  });
});

describe("ZK contra la caseta (bloque 99)", () => {
  it("paredQueretaro pasa un instante a la hora de pared de Queretaro", () => {
    expect(paredQueretaro("2026-10-14T13:00:00Z")).toBe("2026-10-14 07:00:00");
    expect(paredQueretaro("2026-10-15T05:30:00+00:00")).toBe("2026-10-14 23:30:00");
  });

  const zk = (id: number, ocurrioEn: string, lote = "E1", sentido = "salida") => ({ idEvento: id, ocurrioEn, lote, sentido });

  it("empareja por estacionamiento y ventana de -5 a +30 minutos, una vez cada reporte", () => {
    // 07:00 de pared = 13:00Z. El portero reporto a las 07:04 en E1 salida.
    const r1 = rep({ id: "a", puerta: "E1-salida", hechoEn: "2026-10-14T13:04:00Z" });
    const { cruces, sinZk } = cruzarAperturas([zk(1, "2026-10-14 07:00:00"), zk(2, "2026-10-14 07:01:00")], [r1]);
    expect(cruces.map((c) => c.reporte?.id ?? null)).toEqual(["a", null]);
    expect(sinZk).toEqual([]);
  });

  it("otro estacionamiento o fuera de la ventana no cuenta; los otros reportes no se cruzan", () => {
    const enE2 = rep({ id: "e2", puerta: "E2-salida", hechoEn: "2026-10-14T13:02:00Z" });
    const tarde = rep({ id: "tarde", puerta: "E1-salida", hechoEn: "2026-10-14T13:45:00Z" });
    const antes = rep({ id: "antes", puerta: "E1-salida", hechoEn: "2026-10-14T12:50:00Z" });
    const otro = rep({ id: "otro", clase: "reporte", puerta: "E1-salida", hechoEn: "2026-10-14T13:01:00Z" });
    const { cruces, sinZk } = cruzarAperturas([zk(1, "2026-10-14 07:00:00")], [enE2, tarde, antes, otro]);
    expect(cruces[0].reporte).toBeNull();
    expect(sinZk.map((r) => r.id).sort()).toEqual(["antes", "e2", "tarde"]);
  });

  it("prefiere el mismo sentido aunque el otro este mas cerca", () => {
    const entrada = rep({ id: "ent", puerta: "E1-entrada", hechoEn: "2026-10-14T13:00:30Z" });
    const salida = rep({ id: "sal", puerta: "E1-salida", hechoEn: "2026-10-14T13:10:00Z" });
    const { cruces } = cruzarAperturas([zk(1, "2026-10-14 07:00:00", "E1", "salida")], [entrada, salida]);
    expect(cruces[0].reporte?.id).toBe("sal");
  });
});

describe("los reportes vistos por Sistemas (21-oct)", () => {
  it("sin caso, sin seguimiento (Nuevo), en curso, en espera y cerrado", () => {
    expect(seguimientoDeReporte({ casoNumero: null, casoEstado: null })).toBe("sin-caso");
    expect(seguimientoDeReporte({ casoNumero: 630, casoEstado: "nuevo" })).toBe("sin-seguimiento");
    expect(seguimientoDeReporte({ casoNumero: 630, casoEstado: "abierto" })).toBe("curso");
    expect(seguimientoDeReporte({ casoNumero: 630, casoEstado: "consultar" })).toBe("curso");
    expect(seguimientoDeReporte({ casoNumero: 630, casoEstado: "esperando" })).toBe("espera");
    expect(seguimientoDeReporte({ casoNumero: 630, casoEstado: "descartado" })).toBe("listo");
  });
  it("se dibuja como el portero: quien es el expediente, la placa o lo que escribio", () => {
    const m = comoSeguimiento(rep({ casoNumero: 7, casoEstado: "resuelto", casoCierre: "Se cambio el TAG", placaNorm: "ABC123" }));
    expect(m).toMatchObject({ caso: 7, estadoCaso: "resuelto", cierreMotivo: "Se cambio el TAG", quien: "ABC123", mio: false });
  });
});

describe("estadoAviso: lo que la caseta ve hoy", () => {
  const a = { cerradoEn: null, casoEstado: "abierto", hasta: null, respuestas: [] as unknown[] };
  it("vivo sin respuesta, vivo respondido, retirado, vencido y caso cerrado", () => {
    expect(estadoAviso(a, "2026-10-21")).toBe("esperando");
    expect(estadoAviso({ ...a, respuestas: [1] }, "2026-10-21")).toBe("respondido");
    expect(estadoAviso({ ...a, cerradoEn: "2026-10-20T10:00:00Z" }, "2026-10-21")).toBe("retirado");
    expect(estadoAviso({ ...a, hasta: "2026-10-20" }, "2026-10-21")).toBe("vencido");
    expect(estadoAviso({ ...a, hasta: "2026-10-21" }, "2026-10-21")).toBe("esperando");
    expect(estadoAviso({ ...a, casoEstado: "resuelto" }, "2026-10-21")).toBe("caso-cerrado");
  });
});

describe("estacionamiento fijo en la cuenta del portero", () => {
  it("solo vale E1, E2 o los dos; lo demás no fija nada", () => {
    expect(casetaFijaDe({ rol: "portero", caseta: "E2" })).toBe("E2");
    expect(casetaFijaDe({ caseta: "E1-E2" })).toBe("E1-E2");
    expect(casetaFijaDe({ caseta: "e2" })).toBeNull();
    expect(casetaFijaDe({ rol: "portero" })).toBeNull();
    expect(casetaFijaDe(undefined)).toBeNull();
  });
});

describe("seguimientoDeApertura · el seguimiento desde TI (29-oct)", () => {
  it("sin reporte de la caseta es lo primero; con reporte, el seguimiento del caso", () => {
    expect(seguimientoDeApertura(null)).toBe("sin-reporte");
    expect(seguimientoDeApertura({ casoNumero: null, casoEstado: null })).toBe("sin-caso");
    expect(seguimientoDeApertura({ casoNumero: 7, casoEstado: "nuevo" })).toBe("sin-seguimiento");
    expect(seguimientoDeApertura({ casoNumero: 7, casoEstado: "abierto" })).toBe("curso");
    expect(seguimientoDeApertura({ casoNumero: 7, casoEstado: "resuelto" })).toBe("listo");
  });
  it("lo pendiente son los tres primeros, en ese orden", () => {
    expect(SEGUIMIENTO_APERTURA.filter((s) => s.pendiente).map((s) => s.id)).toEqual(["sin-reporte", "sin-caso", "sin-seguimiento"]);
  });
});
