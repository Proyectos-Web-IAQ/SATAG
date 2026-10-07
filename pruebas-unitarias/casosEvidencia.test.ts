// Lo que fija este archivo: que la evidencia en graficas de un caso cuente lo que de
// verdad paso por la pluma. Un rechazo no es un uso; dos TAGs solo «viajan juntos»
// si se leen a <= 5 s en el MISMO lector; y los dias atipicos o cortados por el
// archivo no sirven para concluir.
import { describe, it, expect } from "vitest";
import {
  acompanantes,
  diaNormal,
  diasHabiles,
  incompletas,
  estanciasDe,
  lecturasDe,
  leidosJuntos,
  llegadaHabitual,
  tagPrincipalDe,
  usoPorDia,
} from "@/lib/casosEvidencia";
import { columnaDe, textoEspera } from "@/lib/casosRegistro";
import type { EventoZk } from "@/lib/zk/eventos";

let n = 0;
function ev(p: Partial<EventoZk> & { t: string }): EventoZk {
  n += 1;
  const { t, ...resto } = p;
  return {
    idEvento: 9000 + n, ocurrioEn: t, lote: "E2", sentido: "entrada", tarjeta: "1111111",
    descripcion: "Apertura con verificación normal", concedido: true, departamentoEvento: "Padres de familia", repeticion: false, ...resto,
  };
}
const ventana = { desde: "2026-09-14 14:38:00", hasta: "2026-10-06 08:13:00" };

describe("lecturas y rechazos", () => {
  it("un rechazo es una lectura con ok = false, y la repeticion del lector no cuenta", () => {
    const l = lecturasDe([
      ev({ t: "2026-09-22 07:00:00", concedido: false }),
      ev({ t: "2026-09-22 07:00:01", concedido: false, repeticion: true }),
      ev({ t: "2026-09-22 07:01:00" }),
    ], "1111111");
    expect(l.map((x) => x.ok)).toEqual([false, true]);
  });
  it("usoPorDia cuenta entradas que abrieron y rechazos aparte", () => {
    const l = lecturasDe([ev({ t: "2026-09-22 07:00:00", concedido: false }), ev({ t: "2026-09-22 07:01:00" }), ev({ t: "2026-09-22 14:00:00", sentido: "salida" })], "1111111");
    expect(usoPorDia(l, ["2026-09-22", "2026-09-23"])).toEqual([
      { dia: "2026-09-22", entradas: 1, rechazos: 1 },
      { dia: "2026-09-23", entradas: 0, rechazos: 0 },
    ]);
  });
});

describe("dos TAGs en el mismo coche", () => {
  const a = lecturasDe([ev({ t: "2026-09-22 07:00:00" }), ev({ t: "2026-09-23 07:10:00" })], "1111111");
  it("juntos: a <= 5 s en el mismo lector", () => {
    const b = lecturasDe([ev({ t: "2026-09-22 07:00:03", tarjeta: "2222222" })], "2222222");
    expect(leidosJuntos(a, b)).toHaveLength(1);
    expect(leidosJuntos(a, b)[0].dif).toBe(3);
  });
  it("no juntos: a 6 s, o en el otro sentido", () => {
    const b = lecturasDe([ev({ t: "2026-09-22 07:00:06", tarjeta: "2222222" }), ev({ t: "2026-09-23 07:10:01", tarjeta: "2222222", sentido: "salida" })], "2222222");
    expect(leidosJuntos(a, b)).toHaveLength(0);
  });
  it("acompanantes: solo cuenta si viajan juntos en 2 dias o mas", () => {
    const eventos = [
      ev({ t: "2026-09-22 07:00:00" }), ev({ t: "2026-09-22 07:00:02", tarjeta: "2222222" }),
      ev({ t: "2026-09-23 07:10:00" }), ev({ t: "2026-09-23 07:10:04", tarjeta: "2222222" }),
      ev({ t: "2026-09-23 07:10:01", tarjeta: "3333333" }),
    ];
    expect(acompanantes(eventos, "1111111")).toEqual([{ tarjeta: "2222222", dias: 2 }]);
  });
  it("el TAG principal sale de la evidencia del 6-oct", () => {
    expect(tagPrincipalDe({ fuentes: "Placas: A (expediente). TAG principal 11797422" })).toBe("11797422");
    expect(tagPrincipalDe({ tagPrincipal: "12345678" })).toBe("12345678");
    expect(tagPrincipalDe({})).toBeNull();
  });
});

describe("dias que no sirven para concluir", () => {
  it("el primero y el ultimo de la ventana, y los atipicos", () => {
    expect(diaNormal("2026-09-14", ventana)).toBe(false);
    expect(diaNormal("2026-10-06", ventana)).toBe(false);
    expect(diaNormal("2026-09-25", ventana)).toBe(false);
    expect(diaNormal("2026-09-22", ventana)).toBe(true);
  });
  it("las estancias del primer dia no cuentan como incompletas del TAG", () => {
    const eventos = [ev({ t: "2026-09-14 16:00:00", sentido: "salida" }), ev({ t: "2026-09-22 07:00:00" }), ev({ t: "2026-09-22 14:00:00", sentido: "salida" }), ev({ t: "2026-09-23 07:00:00" })];
    const es = estanciasDe(eventos, "1111111", ventana);
    expect(incompletas(es)).toEqual({ incompletas: 1, total: 2 });
  });
  it("dias habiles: sin sabado ni domingo", () => {
    expect(diasHabiles("2026-09-25", "2026-09-29")).toEqual(["2026-09-25", "2026-09-28", "2026-09-29"]);
  });
});

describe("a que hora suele llegar", () => {
  it("la primera entrada de cada dia normal, en tramos de 15 min", () => {
    const l = lecturasDe([
      ev({ t: "2026-09-22 07:05:00" }), ev({ t: "2026-09-22 13:00:00" }),
      ev({ t: "2026-09-23 07:12:00" }), ev({ t: "2026-09-24 07:40:00" }),
      ev({ t: "2026-09-25 06:00:00" }), // atipico: no cuenta
    ], "1111111");
    const r = llegadaHabitual(l, ventana)!;
    expect(r.dias).toBe(3);
    expect(r.tramo).toBe(7 * 60);
    expect(r.diasEnTramo).toBe(2);
    expect(r.lote).toBe("E2");
  });
  it("sin entradas no hay hora habitual", () => {
    expect(llegadaHabitual([], ventana)).toBeNull();
  });
});

describe("el tablero", () => {
  it("cada estado cae en su columna; seguimiento (89) en Esperando", () => {
    expect(columnaDe("nuevo")).toBe("nuevo");
    expect(columnaDe("abierto")).toBe("atender");
    expect(columnaDe("seguimiento")).toBe("esperando");
    expect(columnaDe("descartado")).toBe("cerrado");
  });
  it("la espera se dice en una frase", () => {
    expect(textoEspera({ estado: "esperando", esperaMotivo: "fecha", esperaHasta: "2027-04-06", esperaTexto: null })).toMatch(/hasta el 6 abr/);
    expect(textoEspera({ estado: "esperando", esperaMotivo: "tercero", esperaHasta: null, esperaTexto: "RH" })).toBe("a RH");
  });
});
