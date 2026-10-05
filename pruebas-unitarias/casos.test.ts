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
    const casos = detectarCasos(eventos, [exp("SATAG-001204", "1585823", ["E2"]), exp("SATAG-000001", "9999999", ["E1"])], null);
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
    expect(detectarCasos(eventos, [exp("SATAG-001204", "1585823", ["E2"])], null)).toHaveLength(0);
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
