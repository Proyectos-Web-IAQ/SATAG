import { describe, it, expect } from "vitest";
import { textoVehiculo } from "@/lib/vehiculo";

describe("textoVehiculo", () => {
  it("marca, modelo y color en una frase", () => {
    expect(textoVehiculo({ marca: "Nissan", modelo: "Versa", color: "Gris" })).toBe("Nissan Versa · Gris");
  });
  it("si todo es «Sin registrar» o vacio, una sola frase", () => {
    expect(textoVehiculo({ marca: "Sin registrar", modelo: "Sin registrar", color: "Sin registrar" })).toBe("Vehículo sin registrar");
    expect(textoVehiculo({ marca: "", modelo: " ", color: null })).toBe("Vehículo sin registrar");
  });
  it("lo que falta se omite, no se rellena", () => {
    expect(textoVehiculo({ marca: "Nissan", modelo: "Sin registrar", color: "Sin registrar" })).toBe("Nissan");
    expect(textoVehiculo({ marca: "Sin registrar", modelo: "Sin registrar", color: "Rojo" })).toBe("Rojo");
  });
});
