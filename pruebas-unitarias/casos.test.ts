// Lo que fija este archivo: que casos ve la pestaña Casos y con que clave. La clave
// es la llave de `casos_seguimiento` (bloque 87): si cambiara para el mismo caso,
// el estado y la nota que alguien escribio se perderian sin que nada fallara.
import { describe, it, expect } from "vitest";
import { detectarCasos, estadoVisible, type ExpedienteCaso, type PersonaCaso } from "@/lib/casos";
import type { EventoZk } from "@/lib/zk/eventos";

let id = 0;
const ev = (tarjeta: string, ocurrioEn: string, lote: "E1" | "E2", concedido = true): EventoZk => ({
  idEvento: ++id,
  ocurrioEn,
  lote,
  sentido: "entrada",
  tarjeta,
  descripcion: concedido ? "Apertura con verificación normal" : "Usuario no registrado",
  concedido,
  departamentoEvento: "",
  repeticion: false,
});
const exp = (folio: string, noDispositivo: string, estacionamientos: string[], extra: Partial<ExpedienteCaso> = {}): ExpedienteCaso => ({
  folio,
  noDispositivo,
  estado: "activo",
  estacionamientos,
  tagsAnteriores: [],
  ...extra,
});

describe("detectarCasos", () => {
  it("el docente que la pluma rechaza en dias distintos, sin contar el rechazo pegado a otra apertura", () => {
    const eventos = [
      ev("1585823", "2026-10-02 07:01:00", "E1", false),
      ev("1585823", "2026-10-05 07:02:41", "E1", false),
      // Pegado a la apertura de otra tarjeta: un coche con dos TAG. No cuenta.
      ev("9999999", "2026-10-03 07:00:00", "E1"),
      ev("1585823", "2026-10-03 07:00:05", "E1", false),
    ];
    const casos = detectarCasos(eventos, [exp("SATAG-001204", "1585823", ["E2"]), exp("SATAG-000001", "9999999", ["E1"])], null)
      .filter((c) => c.tipo === "rechazo-diario");
    expect(casos).toHaveLength(1);
    expect(casos[0]).toMatchObject({
      clave: "rechazo-diario:1585823:E1",
      folio: "SATAG-001204",
      dias: 2,
      veces: 2,
      desde: "2026-10-02 07:01:00",
      ultima: "2026-10-05 07:02:41",
    });
    expect(casos[0].detalle).toContain("SATAG tampoco le da el E1");
  });

  it("un solo dia de rechazo no es caso", () => {
    const eventos = [ev("1585823", "2026-10-02 07:01:00", "E1", false), ev("1585823", "2026-10-02 07:05:00", "E1", false)];
    expect(detectarCasos(eventos, [exp("SATAG-001204", "1585823", ["E2"])], null).filter((c) => c.tipo === "rechazo-diario")).toHaveLength(0);
  });

  it("separa vivo en BAJAS, baja que abre, TAG anterior, sin expediente y sin padron", () => {
    const personas = new Map<string, PersonaCaso>([
      ["111111", { nombre: "A", departamento: "BAJAS" }],
      ["555555", { nombre: "E", departamento: "STOCK SATAG" }],
    ]);
    const eventos = ["111111", "222222", "14273782", "555555", "666666"].map((t) => ev(t, "2026-09-29 07:11:30", "E2"));
    const casos = detectarCasos(
      eventos,
      [
        exp("SATAG-000010", "111111", ["E2"]),
        exp("SATAG-000020", "222222", ["E2"], { estado: "baja" }),
        exp("SATAG-001428", "9323381", ["E1", "E2"], { tagsAnteriores: ["14273782"] }),
      ],
      personas,
    );
    expect(casos.map((c) => c.clave)).toEqual([
      "vivo-en-bajas:111111",
      "baja-que-abre:222222",
      "tag-anterior-abre:14273782",
      "abre-sin-expediente:555555",
      "sin-padron:666666",
    ]);
    expect(casos.find((c) => c.tarjeta === "14273782")?.folio).toBe("SATAG-001428");
  });

  it("un expediente vivo y en orden no es caso", () => {
    const eventos = [ev("123456", "2026-10-01 07:00:00", "E2")];
    const personas = new Map<string, PersonaCaso>([["123456", { nombre: "B", departamento: "Padres de familia" }]]);
    expect(detectarCasos(eventos, [exp("SATAG-000002", "123456", ["E2"])], personas)).toHaveLength(0);
  });
});

describe("semaforo de expedientes vivos que no abren la pluma", () => {
  // La bitacora llega al 5-oct; todo se mide contra ese dia, no contra hoy.
  const fin = ev("000000", "2026-10-05 08:00:00", "E2");

  it("el 21-sep no cuenta: quien solo abrio ese dia se mide desde el 22-sep", () => {
    const casos = detectarCasos([ev("10399926", "2026-09-21 14:37:22", "E2"), fin], [exp("SATAG-000105", "10399926", ["E1", "E2"])], null)
      .filter((c) => c.tipo === "sin-uso");
    expect(casos).toHaveLength(1);
    expect(casos[0]).toMatchObject({ clave: "sin-uso:10399926", nivel: "amarillo", dias: 13, folio: "SATAG-000105", ultima: "" });
  });

  it("amarillo de 7 a 13 dias; rojo desde 14", () => {
    const amarillo = detectarCasos([ev("11111111", "2026-09-27 08:00:00", "E2"), fin], [exp("SATAG-000010", "11111111", ["E2"])], null).filter((c) => c.tipo === "sin-uso");
    expect(amarillo[0]).toMatchObject({ nivel: "amarillo", dias: 8 });
    const rojo = detectarCasos([ev("11111111", "2026-09-22 08:00:00", "E2"), ev("000000", "2026-10-06 08:00:00", "E2")], [exp("SATAG-000010", "11111111", ["E2"])], null).filter((c) => c.tipo === "sin-uso");
    expect(rojo[0]).toMatchObject({ nivel: "rojo", dias: 14 });
  });

  it("el instalado hace menos de una semana no es candidato; el que abrio hace poco tampoco", () => {
    const casos = detectarCasos(
      [ev("22222222", "2026-10-04 08:00:00", "E1"), fin],
      [exp("SATAG-002870", "13078085", ["E1", "E2"], { desde: "2026-10-05" }), exp("SATAG-000011", "22222222", ["E1"])],
      null,
    ).filter((c) => c.tipo === "sin-uso");
    expect(casos).toHaveLength(0);
  });

  it("cuenta la apertura de un TAG anterior del mismo expediente", () => {
    const casos = detectarCasos(
      [ev("14273782", "2026-10-03 07:00:00", "E2"), fin],
      [exp("SATAG-001428", "9323381", ["E1", "E2"], { tagsAnteriores: ["14273782"] })],
      new Map(),
    ).filter((c) => c.tipo === "sin-uso");
    expect(casos).toHaveLength(0);
  });
});

describe("SATAG y ZK no coinciden en el tipo", () => {
  const personas = new Map<string, PersonaCaso>([
    ["13077994", { nombre: "MARTIN ANGELES PEREZ", departamento: "Padres de familia" }],
    ["13078001", { nombre: "X", departamento: "Admon" }],
    ["13078002", { nombre: "Y", departamento: "General" }],
  ]);
  const casos = detectarCasos(
    [ev("13077994", "2026-10-05 08:00:00", "E2"), ev("13078001", "2026-10-05 08:00:00", "E2"), ev("13078002", "2026-10-05 08:00:00", "E2")],
    [
      exp("SATAG-000968", "13077994", ["E1", "E2"], { tipoUsuario: "admin", areaAdmin: "administracion" }),
      exp("SATAG-000970", "13078001", ["E2"], { tipoUsuario: "admin", areaAdmin: "admon" }),
      exp("SATAG-000971", "13078002", ["E2"], { tipoUsuario: "padres" }),
    ],
    personas,
  ).filter((c) => c.tipo === "tipo-distinto");

  it("el administrativo que ZK tiene en Padres de familia es caso", () => {
    expect(casos.map((c) => c.clave)).toEqual(["tipo-distinto:13077994"]);
    expect(casos[0].detalle).toContain("Padres de familia");
  });

  it("Admon con area admon cuadra; General no dice nada y no es caso", () => {
    expect(casos.some((c) => c.tarjeta === "13078001" || c.tarjeta === "13078002")).toBe(false);
  });
});

describe("patrones para resolver en grupo", () => {
  it("quien ya sale como rechazado no se repite en «sin uso», y cada caso trae su patron", () => {
    const casos = detectarCasos(
      [
        ev("3", "2026-10-01 08:00:00", "E2", false),
        ev("3", "2026-10-03 08:00:00", "E2", false),
        ev("1", "2026-09-21 08:00:00", "E2"),
        ev("2", "2026-09-26 08:00:00", "E2"),
        ev("9", "2026-10-06 08:00:00", "E2"),
      ],
      [exp("SATAG-1", "1", ["E2"]), exp("SATAG-2", "2", ["E2"]), exp("SATAG-3", "3", ["E1"])],
      new Map(),
    );
    expect(casos.filter((c) => c.tarjeta === "3").map((c) => c.tipo)).toEqual(["rechazo-diario"]);
    expect(casos.find((c) => c.tarjeta === "3")?.grupo).toBe("Intenta entrar por el E2, que no le corresponde");
    expect(casos.find((c) => c.tarjeta === "1")).toMatchObject({ nivel: "rojo", grupo: "No ha venido ni una vez desde el 22-sep" });
    expect(casos.find((c) => c.tarjeta === "2")).toMatchObject({ nivel: "amarillo", grupo: "De 7 a 13 días sin venir" });
  });
});

describe("estadoVisible", () => {
  const caso = detectarCasos([ev("666666", "2026-10-05 08:00:00", "E2")], [], new Map())[0];

  it("sin seguimiento, pendiente", () => {
    expect(estadoVisible(caso, undefined)).toEqual({ estado: "pendiente", volvio: false });
  });

  it("resuelto despues de la ultima vez se queda resuelto; si vuelve a pasar, regresa a pendiente", () => {
    const s = { clave: caso.clave, estado: "resuelto" as const, nota: "x", actualizadoPor: "ti", actualizadoEn: "" };
    // 09:00 en Queretaro = 15:00 UTC: despues de las 08:00 de ZK.
    expect(estadoVisible(caso, { ...s, actualizadoEn: "2026-10-05T15:00:00Z" })).toEqual({ estado: "resuelto", volvio: false });
    // 07:00 en Queretaro: antes de la ultima apertura.
    expect(estadoVisible(caso, { ...s, actualizadoEn: "2026-10-05T13:00:00Z" })).toEqual({ estado: "pendiente", volvio: true });
  });
});
