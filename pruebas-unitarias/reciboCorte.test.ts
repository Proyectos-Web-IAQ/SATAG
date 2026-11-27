import { describe, it, expect } from "vitest";
import { esc, htmlReciboCorte, mesDelCorte, RECIBO } from "@/lib/reciboCorte";
import type { CorteCaja, PagoReciente } from "@/lib/mock/types";

const corte: CorteCaja = {
  id: "c1",
  folioCorte: "SATAG-CORTE-2026-000001",
  cortadoPor: "Persona de Administración",
  periodoDesde: "2026-09-14T16:00:00+00:00",
  periodoHasta: "2026-11-30T17:00:00+00:00",
  totalEsperado: 200,
  cantidadPagos: 3,
  totalDevuelto: 100,
  cantidadDevoluciones: 1,
  diasDeCobro: 3,
  efectivoContado: 150,
  diferencia: -50,
  observaciones: "Primer corte <arranque>",
  createdAt: "2026-11-30T17:05:00+00:00",
};

const pago = (o: Partial<PagoReciente>): PagoReciente => ({
  folioRecibo: "R-1", monto: 100, fecha: "2026-09-14T16:00:00+00:00", cobradoPor: "Caja",
  registroFolio: "F-1", usuarioNombre: "Titular", cortado: true, devolucion: false, motivo: null, ...o,
});

describe("recibo del corte de caja", () => {
  const html = htmlReciboCorte(corte, [pago({}), pago({ devolucion: true, motivo: "No se instaló" })], "Quien imprime",
    new Date("2026-11-30T18:00:00Z"));

  it("lleva folio, mes, periodo y número de TAG", () => {
    expect(html).toContain("SATAG-CORTE-2026-000001");
    expect(html).toContain(RECIBO.titulo);
    expect(html).toContain("noviembre 2026");
    expect(html).toContain("del 14 sep 2026 al 30 nov 2026");
    expect(html).toContain("Cobrado (3 TAG)");
  });

  it("el cobrado es el esperado más lo devuelto, y la diferencia lleva su signo", () => {
    expect(html).toMatch(/Cobrado \(3 TAG\)<\/td><td class="num">\$300\.00/);
    expect(html).toContain("Faltante de $50.00");
  });

  // Lee el bloque RECIBO: si el CP pide otra firma y se agrega ahi, la prueba
  // sigue en verde sin tocarla.
  it("trae una caja de firma por cada renglon de RECIBO.firmas", () => {
    expect(RECIBO.firmas.length).toBeGreaterThan(0);
    for (const f of RECIBO.firmas) expect(html).toContain(`>${f.rol}<`);
    expect(html.split('class="firma"').length - 1).toBe(RECIBO.firmas.length);
  });

  it("la devolución sale en rojo, con signo y con su motivo", () => {
    expect(html).toContain('class="dev"');
    expect(html).toContain("−$100.00");
    expect(html).toContain("Motivo: No se instaló");
  });

  it("las devoluciones tienen su sección antes de las firmas", () => {
    const sec = html.indexOf("Devoluciones en este corte (1)");
    expect(sec).toBeGreaterThan(-1);
    expect(sec).toBeLessThan(html.indexOf('class="firmas"'));
  });

  it("sin devoluciones no aparece la sección", () => {
    expect(htmlReciboCorte(corte, [pago({})], "x")).not.toContain("Devoluciones en este corte");
  });

  it("escapa lo que viene de la base", () => {
    expect(html).toContain("Primer corte &lt;arranque&gt;");
    expect(html).not.toContain("<arranque>");
    expect(esc(`a"b'c&`)).toBe("a&quot;b&#39;c&amp;");
  });

  it("el mes se toma en hora de Querétaro, no en UTC", () => {
    // 1-dic 03:00 UTC es todavía 30-nov por la noche en Querétaro.
    expect(mesDelCorte("2026-12-01T03:00:00Z")).toBe("noviembre 2026");
  });
});
