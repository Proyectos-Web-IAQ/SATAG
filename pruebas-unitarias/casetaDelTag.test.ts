// Lo que la caseta y la pluma dicen de un vehiculo (lib/casetaDelTag.ts, 29-oct).
import { describe, it, expect } from "vitest";
import { diaEnVentana, otrosEnLaPuerta, plumaEseDia, reportesDelVehiculo, resumenVehiculo, type ReporteDelTag } from "@/lib/casetaDelTag";
import type { Lectura } from "@/lib/casosEvidencia";

const rep = (p: Partial<ReporteDelTag> & { id: string; hechoEn: string }): ReporteDelTag => ({
  clase: "apertura", puerta: "E2-entrada", motivo: "no-leyo", veredicto: "abre",
  registroId: null, tarjeta: null, placaNorm: null, nombre: null, vehiculoTexto: null, casoNumero: null, ...p,
});

// Instantes en UTC: las 14:31 y 14:53 de Queretaro del 29-oct son las 20:31 y 20:53 Z.
const mio1 = rep({ id: "a", hechoEn: "2026-10-29T20:31:00Z", registroId: "exp-1", tarjeta: "10250130", casoNumero: 343 });
const mio2 = rep({ id: "b", hechoEn: "2026-10-15T19:00:00Z", registroId: null, tarjeta: "10250130", puerta: "E1-entrada" });
const mioRep = rep({ id: "c", hechoEn: "2026-10-20T15:00:00Z", registroId: "exp-1", clase: "reporte", motivo: "tag-danado", veredicto: null });
const otro = rep({ id: "d", hechoEn: "2026-10-29T20:53:00Z", registroId: "exp-2", nombre: "Otra persona" });
const otroMismo = rep({ id: "e", hechoEn: "2026-10-29T22:10:00Z", registroId: "exp-2" });
const otraPuerta = rep({ id: "f", hechoEn: "2026-10-29T20:40:00Z", registroId: "exp-3", puerta: "E2-salida" });
// Las 21:00 de Queretaro del 29-oct son las 03:00 Z del 30: sigue siendo el mismo dia local.
const otroTarde = rep({ id: "g", hechoEn: "2026-10-30T03:00:00Z", placaNorm: "ABC123" });
const otroDia = rep({ id: "h", hechoEn: "2026-10-28T20:31:00Z", registroId: "exp-4" });

describe("reportesDelVehiculo", () => {
  it("junta los del expediente y los del TAG, sin repetir, del más reciente al más viejo", () => {
    const r = reportesDelVehiculo([mio2, otro, mio1, mioRep, mio1], { registroId: "exp-1", tarjeta: "10250130" });
    expect(r.map((x) => x.id)).toEqual(["a", "c", "b"]);
  });
  it("sin expediente ni TAG no hay con qué buscar", () => {
    expect(reportesDelVehiculo([mio1], { registroId: null, tarjeta: null })).toEqual([]);
  });
});

describe("resumenVehiculo", () => {
  it("cuenta aperturas, reportes, días distintos, motivos y puertas", () => {
    const r = resumenVehiculo([mio1, mio2, mioRep]);
    expect([r.aperturas, r.reportes, r.dias]).toEqual([2, 1, 3]);
    expect(r.primero).toBe(mio2.hechoEn);
    expect(r.ultimo).toBe(mio1.hechoEn);
    expect(r.motivos.map((m) => `${m.rotulo}:${m.n}`)).toEqual(["Tiene acceso y el TAG no se leyó:2", "TAG dañado o despegado:1"]);
    // El reporte de TAG dañado también fue en E2 · Entrada: dos ahí, una en E1.
    expect(r.puertas.map((p) => `${p.titulo}:${p.n}`)).toEqual(["E2 · Entrada:2", "E1 · Entrada:1"]);
  });
  it("con nada, todo en cero", () => {
    expect(resumenVehiculo([]).dias).toBe(0);
    expect(resumenVehiculo([]).primero).toBeNull();
  });
});

describe("otrosEnLaPuerta", () => {
  it("solo las aperturas de la misma puerta el mismo día local, de otros vehículos, por hora", () => {
    const { otros, vehiculos } = otrosEnLaPuerta([mio1, otro, otroMismo, otraPuerta, otroTarde, otroDia, mioRep], mio1);
    expect(otros.map((x) => x.id)).toEqual(["d", "e", "g"]);
    // exp-2 abrió dos veces: cuenta como un vehículo; la placa suelta es otro.
    expect(vehiculos).toBe(2);
  });
  it("el mismo vehículo por TAG no cuenta como otro", () => {
    const porTag = rep({ id: "z", hechoEn: "2026-10-29T21:00:00Z", tarjeta: "10250130" });
    expect(otrosEnLaPuerta([porTag], rep({ id: "y", hechoEn: "2026-10-29T20:31:00Z", tarjeta: "10250130" })).vehiculos).toBe(0);
  });
});

describe("plumaEseDia", () => {
  const l = (dia: string, lote: string, sentido: "entrada" | "salida", ok: boolean): Lectura => ({ dia, min: 0, s: 0, lote, sentido, ok });
  const lecturas = [l("2026-10-29", "E2", "entrada", true), l("2026-10-29", "E2", "salida", true), l("2026-10-29", "E1", "entrada", false), l("2026-10-28", "E2", "entrada", true)];
  it("cuenta lo de ese día: abrió, rechazos y lo de esa puerta", () => {
    expect(plumaEseDia(lecturas, "2026-10-29", "E2-entrada")).toEqual({ abrio: 2, rechazos: 1, enEsaPuerta: 1 });
    expect(plumaEseDia(lecturas, "2026-10-29")).toEqual({ abrio: 2, rechazos: 1, enEsaPuerta: 0 });
    expect(plumaEseDia(lecturas, "2026-10-27", "E2-entrada")).toEqual({ abrio: 0, rechazos: 0, enEsaPuerta: 0 });
  });
});

describe("diaEnVentana", () => {
  it("dentro de la bitácora cargada, con o sin hora en los extremos", () => {
    expect(diaEnVentana("2026-10-29", { desde: "2026-10-01 06:00:00", hasta: "2026-10-30 18:00:00" })).toBe(true);
    expect(diaEnVentana("2026-09-30", { desde: "2026-10-01", hasta: "2026-10-30" })).toBe(false);
    expect(diaEnVentana("2026-10-29", { desde: null, hasta: null })).toBe(false);
  });
});
