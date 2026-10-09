// Lo que fija este archivo: que la comparacion de nombres de lib/personas/nombres.ts
// diga lo mismo que Campo/herramientas/nombres.mjs, con la que se depuro el padron el
// 6 y 7-oct. Son sus mismos casos. Nombres inventados.
import { describe, it, expect } from "vitest";
import { CLASES, canonico, comparar, decidir, palabras, separarNota, titulo } from "@/lib/personas/nombres";

const CASOS: [string, string, string, { mismaLlave?: boolean }?][] = [
  ["ANA SOFIA PEREZ LUNA", "Ana Sofía Pérez Luna", CLASES.IDENTICO],
  ["PEREZ LUNA ANA SOFIA", "Ana Sofia Perez Luna", CLASES.ORDEN],
  ["ANA SOFIA DE LA PAZ PEREZ LUNA", "Ana Perez Luna", CLASES.CONTIENE],
  ["ANA SOFIA (ALUMNA DE PREPA) PEREZ LUNA", "Ana Sofia Perez Luna", CLASES.IDENTICO],
  ["ANA SOFIA 12345678 PEREZ LUNA", "Ana Sofia Perez Luna", CLASES.IDENTICO],
  ["ANA SOFIA PEREZ GONZALES", "Ana Sofía Pérez González", CLASES.ERRATA],
  ["LUIS VILLAREAL CORDOVA", "Luis Villarreal Cordoba", CLASES.ERRATA],
  ["ANA MCKENZIE ROJO", "Ana MacKenzie Rojo", CLASES.IDENTICO],
  ["MA. TERESA ROJO", "Maria Teresa Rojo", CLASES.IDENTICO],
  ["LUIS LUIS PEREZ ROJO", "Luis Perez Rojo", CLASES.IDENTICO],
  ["JUAN DAVID ROJO LUNA", "Juan Domingo Rojo Luna", CLASES.REVISAR],
  ["JUAN ROJO LUNA", "Pedro Sosa Luna", CLASES.UNA],
  ["JUAN ROJO LUNA", "Pedro Sosa Paz", CLASES.NADA],
  ["", "Pedro Sosa Paz", CLASES.VACIO],
  ["LUIS ANTONIO CARD ROJO", "Luis Antonio Cardenas Rojo", CLASES.ERRATA],
  ["TERESITA BAEZ LUNA", "Tere Baez Luna", CLASES.ERRATA],
  ["ALMA TERESA ROJOGÓMEZ", "Alma Teresa Rojo Gomez", CLASES.ERRATA],
  ["MARIA JOSE DELVAL", "Maria Jose del Val", CLASES.ERRATA],
  ["ANA MAC DONALD RUIZ", "Ana MacDonald Ruiz", CLASES.ERRATA],
  ["ANA LOPEZ JURAEZ", "Ana Lopez Juarez", CLASES.ERRATA],
  ["ULF MARTIN SANDBAG", "Ulf Martin Sandberg", CLASES.ERRATA],
  ["OSCAR LIMON", "Oscar Lima", CLASES.REVISAR],
  ["Se da tarjeta de PVC por que el tag no lee", "Ana Rojo", CLASES.VACIO],
  ["PAULO ROJO ALCOCER", "Manuel Rojo Alcocer", CLASES.REVISAR],
  ["Monica Rojo", "MONICA ISABEL ROJO PAZ", CLASES.REVISAR],
  ["Monica Rojo", "Rojo Monica", CLASES.ORDEN],
  ["Monica Rojo", "MONICA ISABEL ROJO PAZ", CLASES.CONTIENE, { mismaLlave: true }],
  // 6-oct: MARIA no abrevia a MARIANA, y Julio/Julia o Daniel/Daniela son otra persona.
  ["Mariana Rojo Luna", "Maria del Pilar Rojo Luna", CLASES.REVISAR],
  ["Mariana Rojo Luna", "Maria Dolores Luna Rojo", CLASES.REVISAR],
  ["Julio Rojo Luna", "Julia Rojo Luna", CLASES.REVISAR],
  ["Daniel Rojo Luna", "Daniela Rojo Luna", CLASES.REVISAR],
];

describe("comparar nombres, como en la depuracion del 6-oct", () => {
  for (const [a, b, esperada, op] of CASOS) {
    it(`«${a}» vs «${b}»${op?.mismaLlave ? " (misma llave)" : ""}`, () => {
      expect(comparar(a, b, op)).toBe(esperada);
    });
  }

  it("GES escribe APELLIDOS NOMBRE y sigue siendo la misma persona", () => {
    expect(decidir("PEREZ LUNA ANA SOFIA", "Ana Sofía Pérez Luna")).toBe("misma");
  });
});

describe("separar la nota del nombre", () => {
  it("la nota de ZK delata que el TAG es del alumno", () => {
    const n = separarNota("VALERIA (ALUMNA DE PREPA) ROJO");
    expect(n.rol).toBe("alumno");
    expect(n.nombre).toBe("VALERIA ROJO");
  });
  it("la prosa entera es nota", () => {
    expect(separarNota("Se da tarjeta de PVC por que el tag no lee").nombre).toBe("");
  });
});

describe("palabras, titulo y canonico", () => {
  it("sin particulas ni acentos, con las abreviaturas resueltas", () => {
    expect(palabras("Ma. del Pilar McGregor")).toEqual(["MARIA", "PILAR", "MACGREGOR"]);
  });
  it("las particulas en minuscula al mostrar", () => {
    expect(titulo("MARIA DEL PILAR ROJO")).toBe("Maria del Pilar Rojo");
  });
  it("gana la forma mas completa y conserva los acentos de quien los trae", () => {
    const k = canonico([
      { nombre: "ANA PEREZ LUNA", fuente: "zk", prioridad: 2 },
      { nombre: "Ana Sofía Pérez Luna", fuente: "hoja", prioridad: 3 },
    ]);
    expect(k?.nombre).toBe("Ana Sofía Pérez Luna");
  });
});
