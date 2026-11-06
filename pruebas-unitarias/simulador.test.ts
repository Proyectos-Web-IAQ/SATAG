// Lo que fija este archivo: que el simulador portado del mapa de Analisis Vial conserve su
// semantica. Las celdas pesan 1 entre los dias y reparten a los papas sin ligar con la
// proporcion de las familias ligadas de su misma ranura; sin palancas, el simulador es
// hoy; cada palanca mueve solo lo que le toca.
import { describe, it, expect } from "vitest";
import type { Estancia } from "@/lib/estacionamiento";
import type { Recogida } from "@/lib/recogida";
import {
  CAJONES,
  HOY,
  PROPUESTAS,
  SERIES,
  T,
  VENT,
  celdasDeEstancias,
  claveSim,
  estanciaSolo,
  kpis,
  palancasDe,
  perE2En1430,
  quien,
  simular,
  suma,
  type Celda,
} from "@/lib/simulador";

const est = (tarjeta: string, dia: string, entro: number, sale: number, lote: "E1" | "E2" = "E2", censura: Estancia["censura"] = null): Estancia =>
  ({ tarjeta, dia, lote, entro, dur: sale - entro, censura });
const h = (hh: number, mm: number) => hh * 60 + mm;

describe("celdasDeEstancias · las celdas de la tarde, como secciones.mjs", () => {
  const CLAVE: Record<string, string> = { A: "fam:primaria", B: "fam:primaria+secundaria", S: "sin", Z: "sin", P: "per:PRIMARIA DOCENTE" };
  const dias = ["2026-10-20", "2026-10-21"];
  const estancias = [
    est("A", "2026-10-20", h(13, 52), h(14, 17)),
    est("A", "2026-10-21", h(13, 54), h(14, 19)),
    est("B", "2026-10-20", h(13, 50), h(14, 47)),
    // Papa sin ligar que sale con A el 20: se reparte como sin:primaria.
    est("S", "2026-10-20", h(14, 0), h(14, 16)),
    // Sin ligar en una ranura sin familias ligadas: sin:otro.
    est("Z", "2026-10-21", h(13, 10), h(13, 31)),
    // Personal con la entrada recortada a las 12:00 y la salida a las 16:00.
    est("P", "2026-10-21", h(7, 0), h(16, 30)),
    // Fuera: le falta un extremo, otro dia, o sale antes de las 13:00.
    est("A", "2026-10-21", h(13, 0), h(14, 0), "E2", "derecha"),
    est("A", "2026-10-22", h(13, 50), h(14, 15)),
    est("B", "2026-10-21", h(11, 0), h(12, 40)),
  ];
  const c = celdasDeEstancias(estancias, dias, (t) => CLAVE[t]);
  const de = (g: string) => c.filter((x) => x[1] === g);

  it("cada auto pesa 1 entre los dias, en ranuras de 5 minutos", () => {
    expect(de("fam:primaria")).toEqual([["E2", "fam:primaria", h(13, 50), h(14, 15), 1]]);
    expect(de("fam:primaria+secundaria")).toEqual([["E2", "fam:primaria+secundaria", h(13, 50), h(14, 45), 0.5]]);
  });
  it("el papa sin ligar toma la composicion de las familias de su ranura, o sin:otro", () => {
    expect(de("sin:primaria")).toEqual([["E2", "sin:primaria", h(14, 0), h(14, 15), 0.5]]);
    expect(de("sin:otro")).toEqual([["E2", "sin:otro", h(13, 10), h(13, 30), 0.5]]);
  });
  it("la entrada se recorta a las 12:00 y la salida a las 16:00", () => {
    expect(de("per:PRIMARIA DOCENTE")).toEqual([["E2", "per:PRIMARIA DOCENTE", h(12, 0), h(16, 0), 0.5]]);
  });
  it("sin dias no hay celdas", () => {
    expect(celdasDeEstancias(estancias, [], (t) => CLAVE[t])).toEqual([]);
  });
});

describe("claveSim · de lo que sabe SATAG a la clave del simulador", () => {
  const r = (x: Partial<Recogida>): Recogida => ({ etiqueta: "", grupo: "otros", secciones: [], vienePor: null, esPapa: false, ...x });
  it("personal, alumnos, familias y sin ligar", () => {
    expect(claveSim(r({ grupo: "personal", etiqueta: "PRIMARIA DOCENTE" }))).toBe("per:PRIMARIA DOCENTE");
    expect(claveSim(r({ etiqueta: "Alumnos que manejan", grupo: "secprepa", secciones: ["preparatoria"] }))).toBe("alumno");
    expect(claveSim(r({ esPapa: true, secciones: ["preparatoria", "primaria"] }))).toBe("fam:primaria+prepa");
    expect(claveSim(r({ esPapa: true }))).toBe("sin");
    expect(claveSim(r({ grupo: "otros" }))).toBe("otro");
    expect(claveSim(undefined)).toBe("otro");
  });
});

describe("quien · por quien viene y hasta quien se queda", () => {
  it("menor y mayor en orden de edad, aunque la clave venga en otro orden", () => {
    expect(quien("fam:prepa+primaria")).toMatchObject({ tipo: "fam", menor: "primaria", mayor: "prepa" });
    expect(SERIES[quien("fam:prepa+primaria").serie].id).toBe("prepa:esperan");
    expect(SERIES[quien("sin:primaria").serie].id).toBe("primaria:solo");
    expect(quien("per:x").tipo).toBe("per");
    expect(quien("sin:otro").tipo).toBe("otro");
  });
});

describe("simular y kpis", () => {
  // Una tarde chica: 10 del personal en E2, 4 papas de primaria, 2 familias con primaria y
  // secundaria (llegan por primaria y esperan a secundaria) y 2 de solo secundaria.
  const celdas: Celda[] = [
    ["E2", "per:DOCENTES", 720, 905, 10],
    ["E2", "fam:primaria", VENT.primaria - 20, VENT.primaria + 5, 4],
    ["E2", "fam:primaria+secundaria", VENT.primaria - 20, VENT.secundaria + 10, 2],
    ["E2", "fam:secundaria", VENT.secundaria - 15, VENT.secundaria + 10, 2],
    ["E1", "per:ADMON", 720, 905, 5],
  ];
  const base = simular(celdas, HOY);
  const k0 = kpis(base);

  it("sin palancas es hoy: cada celda queda donde estaba", () => {
    expect(base.filas.map((f) => [f.lote, f.e, f.s, f.w])).toEqual(celdas.map((c) => [c[0], c[2], c[3], c[4]]));
    const i = T.indexOf(VENT.primaria);
    expect(suma(base.dentro.E2[i])).toBe(10 + 4 + 2);
  });
  it("las cifras de hoy", () => {
    expect(k0.libresE2).toBe(CAJONES.E2 - 14); // a las 14:35–15:00: personal 10, familias 2 + 2
    expect(k0.maxE1).toBe(5);
    // Por familia: primaria 25 min ×4, hermanos de 13:50 a 14:45 = 55 min ×2, secundaria 25 min ×2.
    expect(k0.esperaFam).toBeCloseTo((25 * 4 + 55 * 2 + 25 * 2) / 8, 6);
    expect(k0.esperaHijo).toBe(0);
  });
  it("el personal a E1 pasa esa parte de E2 a E1 con sus horarios", () => {
    expect(perE2En1430(celdas)).toBe(10);
    const k = kpis(simular(celdas, palancasDe({ per: 5 })));
    expect(k.libresE2).toBe(k0.libresE2 + 5);
    expect(k.maxE1).toBe(10);
  });
  it("mover una salida recorre a quien sale con ella y, si ajustan, a quien viene por ella", () => {
    const r = simular(celdas, palancasDe({ d: { secundaria: 10 } }));
    const fila = (g: string) => r.filas[celdas.findIndex((c) => c[1] === g)];
    expect(fila("fam:secundaria").s).toBe(VENT.secundaria + 20);
    expect(fila("fam:secundaria").e).toBe(VENT.secundaria - 5);
    // La familia con hermanos sale con secundaria, pero viene por primaria: llega igual.
    expect(fila("fam:primaria+secundaria").s).toBe(VENT.secundaria + 20);
    expect(fila("fam:primaria+secundaria").e).toBe(VENT.primaria - 20);
    // Sin ajustar, nadie llega despues.
    const sin = simular(celdas, palancasDe({ d: { secundaria: 10 }, ajusta: false }));
    expect(sin.filas[celdas.findIndex((c) => c[1] === "fam:secundaria")].e).toBe(VENT.secundaria - 15);
  });
  it("la recogida unica hace llegar a las familias con hermanos a la hora del mayor", () => {
    expect(estanciaSolo(celdas).secundaria).toBe(25);
    const r = simular(celdas, palancasDe({ unica: true }));
    const f = r.filas[celdas.findIndex((c) => c[1] === "fam:primaria+secundaria")];
    expect(f.e).toBe(VENT.secundaria + 10 - 25);
    const k = kpis(r);
    expect(k.esperaHijo).toBe(f.e - f.eAj);
    expect(k.esperaFam).toBeLessThan(k0.esperaFam);
  });
  it("las propuestas son escenarios completos", () => {
    const p = palancasDe(PROPUESTAS[0].palancas);
    expect(p).toMatchObject({ per: 30, ajusta: true, unica: false });
    expect(p.d).toEqual({ comunidad: 0, preescolar: 15, primaria: 0, secundaria: -15, prepa: 0 });
    expect(palancasDe(PROPUESTAS[1].palancas).unica).toBe(true);
  });
});
