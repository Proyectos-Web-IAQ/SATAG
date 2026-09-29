import { describe, it, expect } from "vitest";
import { marcador, LIMITE_MISMA_VISITA_MS } from "@/lib/instalaciones";
import type { InstalacionMedida } from "@/lib/mock/types";

const ANGEL = "angel.martinez@asuncionqro.edu.mx";
const LIDIA = "lidia.segundo@asuncionqro.edu.mx";
const HOY = "2026-09-29";

let n = 0;
// `min` son los minutos del tramite: del cobro a la instalacion.
function fila(min: number | null, p: Partial<InstalacionMedida> = {}): InstalacionMedida {
  n += 1;
  const cobro = Date.parse("2026-09-29T16:00:00Z");
  return {
    folio: `SATAG-${String(n).padStart(6, "0")}`,
    fechaInstalacion: HOY,
    altaEn: "2026-09-20T15:00:00Z",
    cobradoEn: new Date(cobro).toISOString(),
    instaladoEn: min === null ? null : new Date(cobro + min * 60_000).toISOString(),
    instaladoPorEmail: ANGEL,
    ...p,
  };
}

describe("marcador · lo que hace justo el juego", () => {
  it("una instalacion de otra visita NO compite, pero si cuenta en los totales", () => {
    // La familia pago y volvio al dia siguiente. El tiempo es enorme y no es
    // culpa de quien instalo: premiar o castigar eso seria premiar la suerte.
    const m = marcador([fila(8), fila(26 * 60)], ANGEL, HOY);
    expect(m.misTags).toBe(2);       // las dos son suyas
    expect(m.elegibles).toBe(1);     // solo una compite
    expect(m.miMejor?.ms).toBe(8 * 60_000);
  });

  it("el limite de la misma visita son 2 horas, y esta aqui a proposito", () => {
    expect(LIMITE_MISMA_VISITA_MS).toBe(2 * 3_600_000);
    // Justo en el limite si compite; un minuto despues ya no.
    expect(marcador([fila(120)], ANGEL, HOY).elegibles).toBe(1);
    expect(marcador([fila(121)], ANGEL, HOY).elegibles).toBe(0);
  });

  it("una instalacion sellada antes de su cobro no compite", () => {
    const rota = fila(0, { instaladoEn: "2026-09-29T15:00:00Z" }); // antes del cobro
    expect(marcador([rota], ANGEL, HOY).elegibles).toBe(0);
  });

  it("las anteriores al bloque 68 no compiten: no tienen hora", () => {
    const m = marcador([fila(null, { instaladoPorEmail: null })], ANGEL, HOY);
    expect(m.conHora).toBe(0);
    expect(m.elegibles).toBe(0);
    expect(m.record).toBeNull();
  });
});

describe("marcador · lo suyo y lo del equipo", () => {
  it("separa sus TAGs de los del equipo", () => {
    const m = marcador([fila(5), fila(7, { instaladoPorEmail: LIDIA })], ANGEL, HOY);
    expect(m.misTags).toBe(1);
    expect(m.equipoTags).toBe(2);
  });

  it("su mejor marca es la suya, aunque alguien mas tenga una mejor", () => {
    const m = marcador([fila(9), fila(3, { instaladoPorEmail: LIDIA })], ANGEL, HOY);
    expect(m.miMejor?.ms).toBe(9 * 60_000);
    expect(m.record?.ms).toBe(3 * 60_000);
    expect(m.record?.email).toBe(LIDIA);
  });

  it("el record de la casa trae quien y con que folio, para poder presumirlo", () => {
    const m = marcador([fila(4, { folio: "SATAG-000042" })], ANGEL, HOY);
    expect(m.record).toMatchObject({ folio: "SATAG-000042", email: ANGEL, dia: HOY });
  });
});

describe("marcador · hoy", () => {
  it("lo de hoy es solo de hoy y solo suyo", () => {
    const m = marcador([
      fila(6),                                            // suya, hoy
      fila(4, { fechaInstalacion: "2026-09-21" }),        // suya, otro dia
      fila(3, { instaladoPorEmail: LIDIA }),              // de Lidia, hoy
    ], ANGEL, HOY);
    expect(m.hoyTags).toBe(1);
    expect(m.hoyMejor?.ms).toBe(6 * 60_000);
    expect(m.miMejor?.ms).toBe(4 * 60_000); // su mejor de siempre si es la de otro dia
  });

  it("un dia sin instalar no inventa una marca", () => {
    const m = marcador([fila(6, { fechaInstalacion: "2026-09-21" })], ANGEL, HOY);
    expect(m.hoyTags).toBe(0);
    expect(m.hoyMejor).toBeNull();
  });
});

describe("marcador · casos vacios", () => {
  it("sin instalaciones no hay marcas ni ceros inventados", () => {
    const m = marcador([], ANGEL, HOY);
    expect(m).toMatchObject({
      misTags: 0, hoyTags: 0, equipoTags: 0, elegibles: 0, conHora: 0,
      miMejor: null, hoyMejor: null, record: null,
    });
  });

  it("sin correo de sesion no se le atribuye nada a nadie", () => {
    // Las filas anteriores al bloque 68 tienen instaladoPorEmail en null;
    // compararlas contra un email nulo las haria «suyas» por accidente.
    const m = marcador([fila(5, { instaladoPorEmail: null })], null, HOY);
    expect(m.misTags).toBe(0);
    expect(m.miMejor).toBeNull();
    expect(m.equipoTags).toBe(1);
  });
});
