import { describe, it, expect } from "vitest";
import { medir } from "@/lib/instalaciones";
import type { InstalacionMedida } from "@/lib/mock/types";

// Estas pruebas no comprueban solo que la aritmetica salga: fijan las
// DECISIONES del tablero. Si alguien las cambia, la prueba que falle dice por
// que estaban asi.

let n = 0;
function fila(p: Partial<InstalacionMedida> = {}): InstalacionMedida {
  n += 1;
  return {
    folio: `SATAG-${String(n).padStart(6, "0")}`,
    fechaInstalacion: "2026-09-21",
    altaEn: "2026-09-14T15:00:00Z",
    cobradoEn: "2026-09-21T16:00:00Z",
    instaladoEn: "2026-09-21T16:10:00Z",
    instaladoPorEmail: "angel.martinez@asuncionqro.edu.mx",
    ...p,
  };
}

const MIN = 60_000;

describe("medir · el denominador honesto", () => {
  it("sin instalaciones no inventa ceros", () => {
    const m = medir([]);
    expect(m.total).toBe(0);
    expect(m.medCobroInst).toBeNull();
    expect(m.masRapida).toBeNull();
    expect(m.porPersona).toEqual([]);
    expect(m.porDia).toEqual([]);
  });

  it("cuenta en el total las instalaciones sin hora, y las excluye de los tiempos", () => {
    // Las anteriores al bloque 68 (15-sep-2026) guardan fecha pero no hora. El
    // tablero las cuenta en «TAGs instalados» y NO en la mediana: esconderlas
    // diria que la escuela instalo menos TAGs de los que instalo.
    const m = medir([
      fila({ instaladoEn: null, instaladoPorEmail: null }),
      fila({ instaladoEn: null, instaladoPorEmail: null }),
      fila(),
    ]);
    expect(m.total).toBe(3);
    expect(m.conHora).toBe(1);
    expect(m.medibles).toBe(1);
  });

  it("una instalacion con hora pero sin cobro cuenta con hora y no es medible", () => {
    const m = medir([fila({ cobradoEn: null })]);
    expect(m.conHora).toBe(1);
    expect(m.medibles).toBe(0);
    expect(m.medCobroInst).toBeNull();
  });
});

describe("medir · el tramite fuera de orden", () => {
  it("una instalacion sellada ANTES de su cobro no entra en la mediana", () => {
    // La resta saldria negativa y una mediana negativa no significa nada.
    const m = medir([
      fila({ cobradoEn: "2026-09-21T16:00:00Z", instaladoEn: "2026-09-21T15:00:00Z" }),
      fila({ cobradoEn: "2026-09-21T16:00:00Z", instaladoEn: "2026-09-21T16:10:00Z" }),
    ]);
    expect(m.fueraDeOrden).toBe(1);
    expect(m.medibles).toBe(1);
    expect(m.medCobroInst).toBe(10 * MIN);
  });

  it("pero si cuenta como instalada con hora: paso de verdad", () => {
    const m = medir([
      fila({ cobradoEn: "2026-09-21T16:00:00Z", instaladoEn: "2026-09-21T15:00:00Z" }),
    ]);
    expect(m.total).toBe(1);
    expect(m.conHora).toBe(1);
    expect(m.medibles).toBe(0);
  });
});

describe("medir · por persona", () => {
  const angel = "angel.martinez@asuncionqro.edu.mx";
  const miguel = "miguel.gonzalez@asuncionqro.edu.mx";

  it("ordena por CANTIDAD, no por rapidez: no es un ranking de personas", () => {
    // Miguel instala menos y mas rapido. Si el orden fuera por velocidad
    // quedaria primero, y el tablero afirma en pantalla que no compara
    // personas. Con tres casos de un solo dia, un ranking seria injusto.
    const m = medir([
      fila({ instaladoPorEmail: angel, cobradoEn: "2026-09-21T16:00:00Z", instaladoEn: "2026-09-21T16:30:00Z" }),
      fila({ instaladoPorEmail: angel, cobradoEn: "2026-09-21T16:00:00Z", instaladoEn: "2026-09-21T16:40:00Z" }),
      fila({ instaladoPorEmail: miguel, cobradoEn: "2026-09-21T16:00:00Z", instaladoEn: "2026-09-21T16:05:00Z" }),
    ]);
    expect(m.porPersona.map((p) => p.email)).toEqual([angel, miguel]);
    expect(m.porPersona[0].tags).toBe(2);
  });

  it("con el mismo volumen desempata por nombre, para no bailar entre cargas", () => {
    const m = medir([
      fila({ instaladoPorEmail: miguel }),
      fila({ instaladoPorEmail: angel }),
    ]);
    expect(m.porPersona.map((p) => p.email)).toEqual([angel, miguel]);
  });

  it("agrupa las anteriores al bloque 68 bajo una clave vacia, sin perderlas", () => {
    const m = medir([
      fila({ instaladoEn: null, instaladoPorEmail: null }),
      fila({ instaladoEn: null, instaladoPorEmail: null }),
    ]);
    expect(m.porPersona).toHaveLength(1);
    expect(m.porPersona[0].clave).toBe("");
    expect(m.porPersona[0].email).toBeNull();
    expect(m.porPersona[0].tags).toBe(2);
    expect(m.porPersona[0].medibles).toBe(0);
    expect(m.porPersona[0].mediana).toBeNull();
  });

  it("entrega los tiempos de cada quien ordenados, que es como los dibuja la grafica", () => {
    const m = medir([
      fila({ cobradoEn: "2026-09-21T16:00:00Z", instaladoEn: "2026-09-21T16:40:00Z" }),
      fila({ cobradoEn: "2026-09-21T16:00:00Z", instaladoEn: "2026-09-21T16:05:00Z" }),
      fila({ cobradoEn: "2026-09-21T16:00:00Z", instaladoEn: "2026-09-21T16:20:00Z" }),
    ]);
    expect(m.porPersona[0].deltas.map((d) => d.ms)).toEqual([5 * MIN, 20 * MIN, 40 * MIN]);
    expect(m.porPersona[0].masRapida).toBe(5 * MIN);
    expect(m.porPersona[0].masTardada).toBe(40 * MIN);
  });
});

describe("medir · por dia", () => {
  it("agrupa por fecha de instalacion y pone el dia mas reciente primero", () => {
    const m = medir([
      fila({ fechaInstalacion: "2026-09-14" }),
      fila({ fechaInstalacion: "2026-09-21" }),
      fila({ fechaInstalacion: "2026-09-21" }),
    ]);
    expect(m.porDia.map((d) => d.dia)).toEqual(["2026-09-21", "2026-09-14"]);
    expect(m.porDia[0].tags).toBe(2);
  });

  it("cuenta por dia los medibles aparte del total del dia", () => {
    const m = medir([
      fila({ fechaInstalacion: "2026-09-21" }),
      fila({ fechaInstalacion: "2026-09-21", instaladoEn: null, instaladoPorEmail: null }),
    ]);
    expect(m.porDia[0].tags).toBe(2);
    expect(m.porDia[0].medibles).toBe(1);
  });
});

describe("medir · las puntas", () => {
  it("la mas rapida y la mas tardada son del conjunto, no de una persona", () => {
    const m = medir([
      fila({ instaladoPorEmail: "a@x.mx", cobradoEn: "2026-09-21T16:00:00Z", instaladoEn: "2026-09-21T16:03:00Z" }),
      fila({ instaladoPorEmail: "b@x.mx", cobradoEn: "2026-09-21T16:00:00Z", instaladoEn: "2026-09-21T17:00:00Z" }),
    ]);
    expect(m.masRapida).toBe(3 * MIN);
    expect(m.masTardada).toBe(60 * MIN);
  });

  it("una fecha ilegible no tumba la medicion ni ensucia los tiempos", () => {
    // Date.parse devuelve NaN: la fila se cuenta como instalada pero no medible.
    const m = medir([fila({ instaladoEn: "no-es-fecha" })]);
    expect(m.total).toBe(1);
    expect(m.conHora).toBe(1);
    expect(m.medibles).toBe(0);
    expect(m.fueraDeOrden).toBe(0);
    expect(m.medCobroInst).toBeNull();
  });
});
