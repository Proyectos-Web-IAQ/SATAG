import { describe, it, expect } from "vitest";
import { diasDesde, hechoPorPersona, lunesDe, tagsPorLunes, tareasBandeja, umbralInventario, vivosEnBajasZk, type EntradaBandeja } from "@/lib/bandeja";

const vacia: EntradaBandeja = {
  casetaSinAcceso: [], casetaSinCaso: 0, avisosSinRespuesta: { n: 0, masViejoDias: 0 },
  casosNuevos: { n: 0, masViejoDias: 0, urgentes: 0 }, inventario: { disponibles: 50, lunes: [5, 7, 4, 6] },
  archivos: { eventos: 1, personas: 2, puertas: 3 }, zk: { pendientes: 0, noCoincide: 0, porVerificar: 0, sinDecidir: 0, tandaAbierta: null }, notasBuzon: 0, enBajasZk: 0,
};

describe("inventario: avisar antes de quedarse sin TAGs", () => {
  it("lo de un lunes y medio, nunca menos de 8", () => {
    expect(umbralInventario([5, 7, 4, 6])).toBe(9);
    expect(umbralInventario([2, 2, 3])).toBe(8);
    expect(umbralInventario([])).toBe(8);
  });
  it("cuenta por semana las que tuvieron instalaciones, sin la semana en curso", () => {
    // hoy: mar 21-oct-2026 (semana del lun 19)
    const f = ["2026-09-28", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-12", "2026-10-13", "2026-10-19", null];
    expect(lunesDe("2026-10-21")).toBe("2026-10-19");
    expect(tagsPorLunes(f, "2026-10-21")).toEqual([2, 1, 3]);
    expect(tagsPorLunes(f, "2026-10-21", 2)).toEqual([1, 3]);
  });
});

describe("tareasBandeja", () => {
  it("sin nada pendiente, la bandeja está en cero", () => {
    expect(tareasBandeja(vacia)).toEqual([]);
  });
  it("Ahora: la caseta abrió sin acceso, ZK no coincide, inventario bajo", () => {
    const t = tareasBandeja({ ...vacia, casetaSinAcceso: [{ quien: "Mariana C.", cuando: "lun 19, 09:23", dias: 2 }],
      zk: { ...vacia.zk, noCoincide: 2 }, inventario: { disponibles: 6, lunes: [5, 7, 4, 6] } });
    expect(t.filter((x) => x.grupo === "ahora").map((x) => x.id)).toEqual(["caseta-sin-acceso-0", "zk-no-coincide", "inventario"]);
    expect(t.find((x) => x.id === "inventario")?.titulo).toContain("Quedan 6 TAGs");
  });
  it("Hoy: archivos de ZK con 7 días o más, o nunca subidos", () => {
    const t = tareasBandeja({ ...vacia, archivos: { eventos: 2, personas: 12, puertas: null } });
    const a = t.find((x) => x.id === "archivos-zk")!;
    expect(a.grupo).toBe("hoy");
    expect(a.detalle).toContain("Personas: hace 12 días");
    expect(a.detalle).toContain("Personal de Apertura: nunca");
    expect(a.detalle).not.toContain("Todos los Eventos");
  });
  it("la tanda abierta manda sobre los pendientes; casos nuevos con su antigüedad", () => {
    const t = tareasBandeja({ ...vacia, zk: { pendientes: 5, noCoincide: 0, porVerificar: 0, sinDecidir: 0, tandaAbierta: { numero: 12, faltan: 2 } },
      casosNuevos: { n: 4, masViejoDias: 14, urgentes: 1 } });
    expect(t.map((x) => x.id)).toEqual(["zk-tanda", "casos-nuevos"]);
    expect(t[1].vieja).toBe(true);
  });
  it("Esta semana: avisos viejos sin respuesta (no los recientes) y el buzón", () => {
    expect(tareasBandeja({ ...vacia, avisosSinRespuesta: { n: 2, masViejoDias: 1 } })).toEqual([]);
    const t = tareasBandeja({ ...vacia, avisosSinRespuesta: { n: 2, masViejoDias: 6 }, notasBuzon: 1 });
    expect(t.map((x) => `${x.grupo}:${x.id}`)).toEqual(["semana:avisos", "semana:buzon"]);
  });
  it("Esta semana: lo pedido en ZK cuyo caso se volvió a abrir, sin contarlo como decidido", () => {
    const t = tareasBandeja({ ...vacia, zk: { ...vacia.zk, sinDecidir: 2 } });
    expect(t.map((x) => `${x.grupo}:${x.id}`)).toEqual(["semana:zk-sin-decidir"]);
    expect(t[0].titulo).toBe("2 acciones en ZK esperan a que se cierre su caso");
  });
});

describe("utilidades", () => {
  it("diasDesde", () => {
    const ahora = Date.parse("2026-10-21T15:00:00Z");
    expect(diasDesde("2026-10-09T17:00:00Z", ahora)).toBe(11);
    expect(diasDesde(null, ahora)).toBeNull();
  });
  it("hechoPorPersona agrupa y ordena", () => {
    const g = hechoPorPersona([
      { en: "2026-10-21T09:00:00Z", quien: "Lidia", que: "Instaló un TAG" },
      { en: "2026-10-21T10:00:00Z", quien: "Gerardo", que: "Subió Personas" },
      { en: "2026-10-21T11:00:00Z", quien: "Lidia", que: "Instaló un TAG" },
    ]);
    expect(g.map((x) => `${x.quien}:${x.n}`)).toEqual(["Lidia:2", "Gerardo:1"]);
    expect(g[0].ultimos[0].en).toBe("2026-10-21T11:00:00Z");
  });
});

describe("vivos en SATAG que ZK ya tiene en BAJAS", () => {
  const padron = [
    { tarjeta: "111", departamentoId: "10", departamento: "BAJAS" },
    { tarjeta: "222", departamentoId: "2", departamento: "Padres de familia" },
    { tarjeta: "333", departamentoId: "10", departamento: "BAJAS" },
  ];
  it("solo los vivos, con TAG, cuyo TAG está en BAJAS", () => {
    const r = vivosEnBajasZk([
      { id: "a", estado: "activo", noDispositivo: "111" },
      { id: "b", estado: "activo", noDispositivo: "222" },
      { id: "c", estado: "baja", noDispositivo: "333" },
      { id: "d", estado: "pendiente", noDispositivo: null },
    ], padron);
    expect(r.map((x) => x.id)).toEqual(["a"]);
  });
  it("va en Ahora y lleva a Personas", () => {
    const t = tareasBandeja({ ...vacia, enBajasZk: 3 });
    expect(t[0]).toMatchObject({ id: "bajas-zk", grupo: "ahora", ir: { seccion: "personas", sub: "bajaszk" } });
  });
});
