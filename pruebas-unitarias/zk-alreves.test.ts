import { describe, expect, it } from "vitest";
import { salidasDelVehiculo } from "@/lib/zk/alReves";
import type { EventoZk } from "@/lib/zk/eventos";

let n = 0;
const ev = (hora: string, sentido: "entrada" | "salida", lote: "E1" | "E2" = "E2", dia = "2026-10-13"): EventoZk => ({
  idEvento: ++n, ocurrioEn: `${dia} ${hora}`, lote, sentido, tarjeta: "12463425", descripcion: "",
  concedido: true, departamentoEvento: "INSTITUCIONALES", repeticion: false,
});

describe("salidasDelVehiculo: los vehiculos del Instituto salen y luego vuelven", () => {
  it("una diligencia es salida -> regreso, aunque vuelva por la otra pluma", () => {
    expect(salidasDelVehiculo([ev("10:11:00", "salida"), ev("15:20:00", "entrada", "E1")])).toEqual([
      { dia: "2026-10-13", salio: { minuto: 611, lote: "E2" }, volvio: { minuto: 920, lote: "E1" } },
    ]);
  });
  it("dos diligencias en el dia", () => {
    const s = salidasDelVehiculo([ev("09:00:00", "salida"), ev("11:00:00", "entrada"), ev("13:00:00", "salida"), ev("15:00:00", "entrada")]);
    expect(s.map((x) => [x.salio?.minuto, x.volvio?.minuto])).toEqual([[540, 660], [780, 900]]);
  });
  it("lo que falta se dice: salio y no se leyo el regreso, o volvio sin salida leida", () => {
    const s = salidasDelVehiculo([ev("07:00:00", "entrada"), ev("16:00:00", "salida")]);
    expect(s).toEqual([
      { dia: "2026-10-13", salio: null, volvio: { minuto: 420, lote: "E2" } },
      { dia: "2026-10-13", salio: { minuto: 960, lote: "E2" }, volvio: null },
    ]);
  });
  it("ignora rechazos y la misma lectura repetida", () => {
    const rechazo = { ...ev("09:30:00", "entrada"), concedido: false };
    const s = salidasDelVehiculo([ev("09:00:00", "salida"), ev("09:04:00", "salida"), rechazo, ev("12:00:00", "entrada")]);
    expect(s.map((x) => [x.salio?.minuto, x.volvio?.minuto])).toEqual([[540, 720]]);
  });
});
