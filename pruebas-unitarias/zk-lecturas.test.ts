import { describe, expect, it } from "vitest";
import { distanciaSeg, rangoDeBusqueda, ultimoMinuto } from "@/lib/zk/lecturas";

describe("rangoDeBusqueda", () => {
  it("sin hora es el dia completo", () => {
    expect(rangoDeBusqueda("2026-10-08", "", 15)).toEqual({ desde: "2026-10-08 00:00:00", hasta: "2026-10-09 00:00:00" });
  });
  it("con hora es la hora ± el margen, con el minuto pedido completo", () => {
    expect(rangoDeBusqueda("2026-10-08", "14:17", 15)).toEqual({ desde: "2026-10-08 14:02:00", hasta: "2026-10-08 14:33:00" });
    expect(rangoDeBusqueda("2026-10-08", "14:17", 0)).toEqual({ desde: "2026-10-08 14:17:00", hasta: "2026-10-08 14:18:00" });
  });
  it("cruza la medianoche y el fin de mes sin correr la hora", () => {
    expect(rangoDeBusqueda("2026-09-30", "23:55", 10)).toEqual({ desde: "2026-09-30 23:45:00", hasta: "2026-10-01 00:06:00" });
    expect(rangoDeBusqueda("2026-10-01", "0:05", 10)).toEqual({ desde: "2026-09-30 23:55:00", hasta: "2026-10-01 00:16:00" });
  });
  it("rechaza lo que no entiende", () => {
    expect(rangoDeBusqueda("8 oct", "14:17", 15)).toBeNull();
    expect(rangoDeBusqueda("2026-10-08", "25:00", 15)).toBeNull();
    expect(rangoDeBusqueda("2026-10-08", "2pm", 15)).toBeNull();
  });
});

describe("ultimoMinuto", () => {
  it("dice el ultimo minuto que entra, aun cruzando el dia", () => {
    expect(ultimoMinuto("2026-10-08 14:33:00")).toBe("2026-10-08 14:32:00");
    expect(ultimoMinuto("2026-10-09 00:00:00")).toBe("2026-10-08 23:59:00");
  });
});

describe("distanciaSeg", () => {
  it("cuenta los segundos contra la hora buscada", () => {
    expect(distanciaSeg("2026-10-08 14:17:30", "2026-10-08", "14:17")).toBe(30);
    expect(distanciaSeg("2026-10-08T14:10:00", "2026-10-08", "14:17")).toBe(420);
  });
  it("sin hora no hay distancia", () => {
    expect(distanciaSeg("2026-10-08 14:17:30", "2026-10-08", "")).toBe(0);
  });
});
