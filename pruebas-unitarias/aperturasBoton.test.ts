import { describe, it, expect } from "vitest";
import { antesDespues, minutoDelDia, pistasDe, porDia, porHora, sinLecturaDelDia, type LecturaPluma } from "@/lib/aperturasBoton";

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

describe("antesDespues: la baja desde el corte", () => {
  // jue 8 y vie 9 antes; jue 15 y vie 16 despues; sab 17 aparte; lun 19 parcial a las 08:13.
  const b = (dia: string, n: number, hora = "09:00:00") => Array.from({ length: n }, () => `${dia} ${hora}`);
  const botones = [
    ...b("2026-10-08", 80), ...b("2026-10-09", 60), ...b("2026-10-12", 40), ...b("2026-10-12", 2, "07:00:00"),
    ...b("2026-10-15", 20), ...b("2026-10-16", 10), ...b("2026-10-17", 48), ...b("2026-10-19", 3, "07:30:00"),
  ];
  const entradas = new Map([["2026-10-08", 400], ["2026-10-09", 300], ["2026-10-12", 350], ["2026-10-15", 400], ["2026-10-16", 360], ["2026-10-19", 150]]);
  const hasta = new Map([["2026-10-12", 140], ["2026-10-19", 150]]);
  const r = antesDespues(botones, entradas, hasta, "2026-10-15", "2026-10-19 08:13:43");

  it("promedios por dia habil y por cada 100 entradas; el parcial y el sabado no entran", () => {
    expect(r.antes).toMatchObject({ dias: 3, botones: 182, entradas: 1050 });
    expect(r.despues).toMatchObject({ dias: 2, botones: 30, entradas: 760 });
    expect(r.despues.porDia).toBe(15);
    expect(r.cambioPorDia).toBeCloseTo(15 / (182 / 3) - 1);
    expect(r.finDeSemana).toEqual({ dias: 1, botones: 48 });
  });

  it("cada dia contra el mismo dia de la semana; el parcial, a la misma hora", () => {
    expect(r.dias.map((d) => d.dia)).toEqual(["2026-10-15", "2026-10-16", "2026-10-19"]);
    expect(r.dias[0].antes).toEqual({ dias: 1, botones: 80, tasa: 20 });
    const lunes = r.dias[2];
    expect(lunes.parcialHasta).toBe("08:13");
    expect(lunes.botones).toBe(3);
    expect(lunes.antes).toEqual({ dias: 1, botones: 2, tasa: (100 * 2) / 140 });
  });

  it("sin entradas (rol que no lee la bitacora) compara solo por dia", () => {
    const s = antesDespues(botones, null, null, "2026-10-15", "2026-10-19 08:13:43");
    expect(s.antes.tasa).toBeNull();
    expect(s.cambioTasa).toBeNull();
    expect(s.cambioPorDia).not.toBeNull();
  });
});
