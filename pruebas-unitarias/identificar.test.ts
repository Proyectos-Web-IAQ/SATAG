// Lo que fija este archivo: como se identifica a una persona contra GES
// (lib/personas/identificar.ts). La decision de TI manda; el nombre solo cuenta con la
// regla estricta; los homonimos no se eligen al azar. Personas inventadas.
import { describe, it, expect } from "vitest";
import { identificar, indexarGes, type IdentidadDecidida, type PersonaGesGuardada } from "@/lib/personas/identificar";

const p = (x: Partial<PersonaGesGuardada> & Pick<PersonaGesGuardada, "gesId" | "clase" | "nombre">): PersonaGesGuardada => ({
  familia: "", rol: "", grupos: [], area: "", cargo: "", activo: true, fechaBaja: null, vigente: true, ...x,
});

const GES = indexarGes([
  p({ gesId: "F-100-padre", clase: "tutor", nombre: "ROJO PAZ LUIS ALBERTO", familia: "100", rol: "padre", grupos: ["P3A", "S1B"] }),
  p({ gesId: "F-100-madre", clase: "tutor", nombre: "LUNA SOSA ANA MARIA", familia: "100", rol: "madre", grupos: ["P3A", "S1B"] }),
  p({ gesId: "F-200-madre", clase: "tutor", nombre: "MAR RUIZ ALMA", familia: "200", rol: "madre", grupos: ["K2"], vigente: false }),
  p({ gesId: "A-170001", clase: "alumno", nombre: "EVA ROJO LUNA", familia: "100", grupos: ["301"] }),
  p({ gesId: "D-PF1", clase: "docente", nombre: "LUNA SOSA ANA MARIA", area: "PRIMARIA", cargo: "DOCENTE" }),
  p({ gesId: "D-PF2", clase: "docente", nombre: "SOSA PAZ PEDRO", cargo: "PREFECTO", activo: false, fechaBaja: "2025-07-31" }),
  // Homonimos: dos mamas con el mismo nombre en familias distintas.
  p({ gesId: "F-300-madre", clase: "tutor", nombre: "PEREZ GOMEZ MARIA JOSE", familia: "300", rol: "madre", grupos: ["P1A"] }),
  p({ gesId: "F-400-madre", clase: "tutor", nombre: "PEREZ GOMEZ MARIA JOSE", familia: "400", rol: "madre", grupos: ["S2C"] }),
]);
const SIN = new Map<string, IdentidadDecidida>();
const decision = (x: Partial<IdentidadDecidida> & Pick<IdentidadDecidida, "tarjeta" | "veredicto">): Map<string, IdentidadDecidida> =>
  new Map([[x.tarjeta, { gesId: null, familia: "", nombre: "", preguntar: false, nota: "", decididoPor: "ti", decididoEn: "2026-10-08", ...x }]]);

describe("por nombre", () => {
  it("papá vigente, aunque ZK lo escriba en otro orden y con una nota", () => {
    const i = identificar({ nombres: ["LUIS ALBERTO (PAPA) ROJO PAZ"], tarjetas: ["1"] }, GES, SIN);
    expect(i.fuente).toBe("nombre");
    expect(i.tutor?.gesId).toBe("F-100-padre");
    expect(i.familia).toEqual({ id: "100", grupos: ["P3A", "S1B"], vigente: true });
    expect(i.sigue).toBe("si");
    expect(i.categoria).toBe("Papá de familia vigente");
  });

  it("personal que además es mamá de familia", () => {
    const i = identificar({ nombres: ["Ana María Luna Sosa"], tarjetas: ["2"] }, GES, SIN);
    expect(i.tutor?.gesId).toBe("F-100-madre");
    expect(i.personal?.gesId).toBe("D-PF1");
    expect(i.categoria).toBe("Personal (DOCENTE) y mamá de familia vigente");
  });

  it("la familia ya no aparece en GES", () => {
    const i = identificar({ nombres: ["Alma Mar Ruiz"], tarjetas: ["3"] }, GES, SIN);
    expect(i.sigue).toBe("no");
    expect(i.categoria).toBe("Su familia ya no aparece en GES");
  });

  it("exempleado con su fecha de baja", () => {
    const i = identificar({ nombres: ["PEDRO SOSA PAZ"], tarjetas: ["4"] }, GES, SIN);
    expect(i.sigue).toBe("no");
    expect(i.categoria).toBe("Exempleado (baja 31/07/2025)");
  });

  it("alumno de Prepa", () => {
    const i = identificar({ nombres: ["EVA (ALUMNA DE PREPA) ROJO LUNA"], tarjetas: ["5"] }, GES, SIN);
    expect(i.alumno?.gesId).toBe("A-170001");
    expect(i.categoria).toBe("Alumno de Preparatoria (301)");
  });

  it("dos homónimos: no elige, los manda a revisar", () => {
    const i = identificar({ nombres: ["María José Pérez Gómez"], tarjetas: ["6"] }, GES, SIN);
    expect(i.tutor).toBeNull();
    expect(i.porRevisar.map((x) => x.gesId).sort()).toEqual(["F-300-madre", "F-400-madre"]);
    expect(i.sigue).toBe("no se sabe");
  });

  it("un nombre de dos palabras no basta: queda para revisar, no como hecho", () => {
    const i = identificar({ nombres: ["Luis Rojo"], tarjetas: ["7"] }, GES, SIN);
    expect(i.tutor).toBeNull();
    expect(i.porRevisar.map((x) => x.gesId)).toContain("F-100-padre");
    expect(i.categoria).toBe("Hay personas parecidas en GES: falta decidir");
  });

  it("nadie", () => {
    const i = identificar({ nombres: ["Julio Cesar Nadie Tal", "", null], tarjetas: ["8"] }, GES, SIN);
    expect(i.fuente).toBe("ninguna");
    expect(i.categoria).toBe("No localizado en GES");
  });
});

describe("la decisión de TI manda", () => {
  it("es tal persona, aunque el nombre diga otra cosa", () => {
    const i = identificar({ nombres: ["María José Pérez Gómez"], tarjetas: ["9", "10"] }, GES, decision({ tarjeta: "10", veredicto: "persona", gesId: "F-400-madre" }));
    expect(i.fuente).toBe("decision");
    expect(i.tutor?.gesId).toBe("F-400-madre");
    expect(i.familia?.grupos).toEqual(["S2C"]);
    expect(i.porRevisar).toEqual([]);
  });

  it("confirmar a la mamá no borra que también es personal", () => {
    const i = identificar({ nombres: ["Ana María Luna Sosa"], tarjetas: ["14"] }, GES, decision({ tarjeta: "14", veredicto: "persona", gesId: "F-100-madre" }));
    expect(i.fuente).toBe("decision");
    expect(i.tutor?.gesId).toBe("F-100-madre");
    expect(i.personal?.gesId).toBe("D-PF1");
    expect(i.categoria).toBe("Personal (DOCENTE) y mamá de familia vigente");
  });

  it("familiar no tutor, con la marca de preguntar", () => {
    const i = identificar({ nombres: ["Abuela Inventada Rojo"], tarjetas: ["11"] }, GES, decision({ tarjeta: "11", veredicto: "familiar", familia: "100", preguntar: true }));
    expect(i.categoria).toBe("Familiar autorizado (no es tutor en GES)");
    expect(i.familia?.id).toBe("100");
    expect(i.sigue).toBe("si");
    expect(i.preguntar).toBe(true);
  });

  it("no localizado y por confirmar", () => {
    expect(identificar({ nombres: ["Luis Alberto Rojo Paz"], tarjetas: ["12"] }, GES, decision({ tarjeta: "12", veredicto: "no_localizado" })).categoria)
      .toBe("No está en GES (decisión de TI)");
    expect(identificar({ nombres: [], tarjetas: ["13"] }, GES, decision({ tarjeta: "13", veredicto: "por_confirmar" })).sigue).toBe("no se sabe");
  });
});
