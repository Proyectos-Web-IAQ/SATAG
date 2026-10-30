// Los tramos en que se parte la bitacora para bajarla a la vez (lib/zk/rangos.ts).
import { describe, it, expect } from "vitest";
import { partirEnTramos } from "@/lib/zk/rangos";

describe("partirEnTramos", () => {
  it("56 días en semanas: ocho cerradas y la cola abierta, sin huecos ni traslapes", () => {
    const t = partirEnTramos("2026-09-03 00:00:00", "2026-10-29T15:12:00");
    expect(t).toHaveLength(9);
    expect(t[0]).toEqual({ desde: "2026-09-03 00:00:00", hasta: "2026-09-10 00:00:00" });
    expect(t[7]).toEqual({ desde: "2026-10-22 00:00:00", hasta: "2026-10-29 00:00:00" });
    expect(t[8]).toEqual({ desde: "2026-10-29 00:00:00", hasta: null });
    for (let i = 1; i < t.length; i += 1) expect(t[i].desde).toBe(t[i - 1].hasta);
  });
  it("una ventana corta es un solo tramo abierto", () => {
    expect(partirEnTramos("2026-10-27 00:00:00", "2026-10-29T08:00:00")).toEqual([{ desde: "2026-10-27 00:00:00", hasta: null }]);
    expect(partirEnTramos("2026-10-27 00:00:00", null)).toEqual([{ desde: "2026-10-27 00:00:00", hasta: null }]);
    expect(partirEnTramos("2026-10-27 00:00:00", "2026-10-01")).toEqual([{ desde: "2026-10-27 00:00:00", hasta: null }]);
  });
  it("el tamaño del tramo se puede cambiar", () => {
    const t = partirEnTramos("2026-10-01", "2026-10-29", 14);
    expect(t.map((x) => x.desde.slice(0, 10))).toEqual(["2026-10-01", "2026-10-15", "2026-10-29"]);
    expect(t[2].hasta).toBeNull();
  });
  it("con una fecha que no se entiende, no se parte nada", () => {
    expect(partirEnTramos("ayer", "2026-10-29")).toEqual([{ desde: "ayer", hasta: null }]);
  });
});
