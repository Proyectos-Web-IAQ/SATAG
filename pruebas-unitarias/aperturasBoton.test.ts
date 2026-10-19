import { describe, it, expect } from "vitest";
import { minutoDelDia, pistasDe, porDia, porHora, sinLecturaDelDia, type LecturaPluma } from "@/lib/aperturasBoton";

const boton = { idEvento: 1, ocurrioEn: "2026-10-05 09:28:00", lote: "E2", sentido: "salida" as const };
const r = (ocurrioEn: string, tarjeta: string, o: Partial<LecturaPluma> = {}): LecturaPluma =>
  ({ ocurrioEn, tarjeta, lote: "E2", sentido: "salida", concedido: false, ...o });

describe("pistasDe: el TAG rechazado justo antes", () => {
  it("ventana de 3 min antes a 1 despues, mismo estacionamiento, solo rechazos", () => {
    const p = pistasDe(boton, [
      r("2026-10-05 09:27:20", "A"),                       // 40 s antes: si
      r("2026-10-05 09:24:00", "B"),                       // 4 min antes: no
      r("2026-10-05 09:28:30", "C"),                       // 30 s despues: si
      r("2026-10-05 09:27:50", "D", { lote: "E1" }),       // otro estacionamiento: no
      r("2026-10-05 09:27:55", "E", { concedido: true }),  // abrio: no
    ]);
    expect(p.map((x) => `${x.tarjeta}:${x.segundos}`)).toEqual(["C:30", "A:-40"]);
  });

  it("primero el mismo sentido, un TAG una vez, tope de 3", () => {
    const p = pistasDe(boton, [
      r("2026-10-05 09:27:58", "X", { sentido: "entrada" }),
      r("2026-10-05 09:26:00", "Y"),
      r("2026-10-05 09:27:00", "Y"),
      r("2026-10-05 09:27:10", "Z"),
      r("2026-10-05 09:27:30", "W"),
    ]);
    expect(p.map((x) => x.tarjeta)).toEqual(["W", "Z", "Y"]);
    expect(p[2].segundos).toBe(-60);
  });
});

describe("sinLecturaDelDia: las pistas debiles", () => {
  it("salio sin entrada y entro sin salida, sin contar rafagas", () => {
    const c = (ocurrioEn: string, tarjeta: string, sentido: "entrada" | "salida", o: Partial<LecturaPluma> = {}): LecturaPluma =>
      ({ ocurrioEn, tarjeta, sentido, lote: "E1", concedido: true, ...o });
    const s = sinLecturaDelDia([
      c("2026-10-05 07:10:00", "A", "entrada"), c("2026-10-05 14:00:00", "A", "salida"),  // completo
      c("2026-10-05 13:00:00", "B", "salida"),                                            // entro sin lectura
      c("2026-10-05 07:30:00", "C", "entrada"),                                           // salio sin lectura
      c("2026-10-05 07:31:00", "D", "salida", { repeticion: true }),                      // rafaga: no
      c("2026-10-05 07:32:00", "E", "salida", { concedido: false }),                      // rechazo: no
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].entraronSinLectura.map((x) => x.tarjeta)).toEqual(["B"]);
    expect(s[0].salieronSinLectura.map((x) => x.tarjeta)).toEqual(["C"]);
  });
});

describe("porHora y porDia", () => {
  const items = [
    { ocurrioEn: "2026-10-05 09:10:00", ok: false },
    { ocurrioEn: "2026-10-05 09:50:00", ok: true },
    { ocurrioEn: "2026-10-06 18:05:00", ok: false },
  ];
  it("cuenta por hora y dibuja las horas vacias de 6 a 20", () => {
    const h = porHora(items, (x) => x.ok);
    expect(h[0].hora).toBe(6);
    expect(h[h.length - 1].hora).toBe(20);
    expect(h.find((x) => x.hora === 9)).toEqual({ hora: 9, sin: 1, con: 1 });
    expect(h.find((x) => x.hora === 12)).toEqual({ hora: 12, sin: 0, con: 0 });
  });
  it("cuenta por dia en orden", () => {
    expect(porDia(items, (x) => x.ok)).toEqual([{ dia: "2026-10-05", sin: 1, con: 1 }, { dia: "2026-10-06", sin: 1, con: 0 }]);
  });
  it("minutoDelDia", () => {
    expect(minutoDelDia("2026-10-05 09:28:30")).toBe(568.5);
  });
});
