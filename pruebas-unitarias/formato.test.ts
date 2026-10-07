// Lo que fija este archivo: una sola forma de escribir fechas (DISEÑO.md §8.3), y que
// cada uno de los tres datos se trate con su zona: un instante de la base se pasa a
// hora de Queretaro; un dia suelto y la hora de pared de ZK no se mueven.
import { describe, it, expect } from "vitest";
import { diaDe, diaMes, diaSemana, fecha, fechaHora, hora } from "@/lib/formato";

describe("un dia suelto", () => {
  it("se escribe «22 sep 2026», sin depender del idioma del navegador", () => {
    expect(fecha("2026-09-22")).toBe("22 sep 2026");
    expect(fecha("2027-04-06")).toBe("6 abr 2027");
  });
  it("dia de la semana y dia-mes", () => {
    expect(diaSemana("2026-09-22")).toBe("mar 22 sep");
    expect(diaSemana("2026-09-23")).toBe("mié 23 sep");
    expect(diaMes("2026-10-05")).toBe("5 oct");
  });
});

describe("un instante de la base (con zona)", () => {
  it("se pasa a hora de Queretaro: las 01:30 UTC del 23 son las 19:30 del 22", () => {
    expect(fechaHora("2026-09-23T01:30:00+00:00")).toBe("22 sep 2026, 19:30");
    expect(fecha("2026-09-23T01:30:00Z")).toBe("22 sep 2026");
    expect(diaDe("2026-09-23T01:30:00Z")).toBe("2026-09-22");
    expect(hora("2026-09-23T01:30:00Z")).toBe("19:30");
  });
});

describe("la hora de pared de ZK (sin zona)", () => {
  it("NO se convierte: ya es la hora local del controlador", () => {
    expect(fechaHora("2026-10-02 09:29:57")).toBe("2 oct 2026, 09:29");
    expect(hora("2026-10-02 07:05:00")).toBe("07:05");
    expect(diaDe("2026-10-02 23:59:00")).toBe("2026-10-02");
  });
});

describe("sin dato", () => {
  it("vacio es «—»; lo que no es fecha se deja tal cual", () => {
    expect(fecha(null)).toBe("—");
    expect(fechaHora(undefined)).toBe("—");
    expect(fecha("ninguno desde el 7-jul")).toBe("ninguno desde el 7-jul");
    expect(hora("2026-09-22")).toBe("—");
  });
});
