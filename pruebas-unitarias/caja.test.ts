import { describe, it, expect } from "vitest";
import { diaCorto, semDias, diasNaturalesDesde, SEM_AMARILLO, SEM_ROJO } from "@/lib/caja";

describe("semDias · los umbrales del semaforo", () => {
  it("los umbrales son 30 y 35, y estan aqui a proposito", () => {
    // Si el CP fija otra fecha de corte, estos dos numeros se mueven y esta
    // prueba es la que avisa de que la regla cambio.
    expect(SEM_AMARILLO).toBe(30);
    expect(SEM_ROJO).toBe(35);
  });

  it("verde por debajo de 30", () => {
    expect(semDias(0)).toBe("ok");
    expect(semDias(29)).toBe("ok");
  });

  it("amarillo justo en 30", () => {
    expect(semDias(30)).toBe("warn");
    expect(semDias(34)).toBe("warn");
  });

  it("rojo justo en 35", () => {
    expect(semDias(35)).toBe("alert");
    expect(semDias(120)).toBe("alert");
  });

  it("una caja vacia esta en verde, no en alarma", () => {
    // null es «no hay primer cobro»: la caja esta en ceros. Pintarla de rojo
    // seria alarmar por no tener dinero pendiente, que es el estado deseable.
    expect(semDias(null)).toBe("ok");
  });
});

describe("diasNaturalesDesde · la trampa de la zona horaria", () => {
  it("un cobro despues de las 18:00 de Queretaro NO cuenta como del dia siguiente", () => {
    // 2026-09-15T01:30Z son las 19:30 del 14-sep en Queretaro (UTC-6). Si la
    // cuenta se hiciera en UTC, el primer cobro se registraria como del dia 15 y
    // el semaforo iria un dia atrasado toda la vida de esa caja.
    const cobro = "2026-09-15T01:30:00Z";           // 14-sep 19:30 en Qro
    const ahora = new Date("2026-09-15T18:00:00Z"); // 15-sep 12:00 en Qro
    expect(diasNaturalesDesde(cobro, ahora)).toBe(1);
  });

  it("el mismo dia son cero dias", () => {
    const cobro = "2026-09-15T16:00:00Z";           // 15-sep 10:00 en Qro
    const ahora = new Date("2026-09-15T23:00:00Z"); // 15-sep 17:00 en Qro
    expect(diasNaturalesDesde(cobro, ahora)).toBe(0);
  });

  it("cuenta dias naturales, no periodos de 24 horas", () => {
    // Del 14-sep 23:00 al 15-sep 07:00 hay 8 horas, pero es un dia natural.
    const cobro = "2026-09-15T05:00:00Z";           // 14-sep 23:00 en Qro
    const ahora = new Date("2026-09-15T13:00:00Z"); // 15-sep 07:00 en Qro
    expect(diasNaturalesDesde(cobro, ahora)).toBe(1);
  });

  it("los 30 dias que encienden el amarillo, contados de verdad", () => {
    const cobro = "2026-09-14T18:00:00Z";           // 14-sep 12:00 en Qro
    const ahora = new Date("2026-10-14T18:00:00Z"); // 14-oct 12:00 en Qro
    const dias = diasNaturalesDesde(cobro, ahora);
    expect(dias).toBe(30);
    expect(semDias(dias)).toBe("warn");
  });

  it("nunca devuelve negativos: un cobro del futuro es cero, no menos uno", () => {
    const cobro = "2026-10-01T18:00:00Z";
    const ahora = new Date("2026-09-15T18:00:00Z");
    expect(diasNaturalesDesde(cobro, ahora)).toBe(0);
  });

  it("sin primer cobro devuelve null, que el semaforo lee como verde", () => {
    expect(diasNaturalesDesde(null)).toBeNull();
  });

  it("una fecha ilegible no truena ni inventa un numero", () => {
    expect(diasNaturalesDesde("no-es-fecha")).toBeNull();
  });
});

describe("diaCorto", () => {
  it("reordena sin construir un Date, para no correr la fecha", () => {
    expect(diaCorto("2026-09-21")).toBe("21/09/2026");
  });

  it("lo que no tenga forma de fecha se devuelve tal cual", () => {
    expect(diaCorto("")).toBe("");
    expect(diaCorto("2026-09")).toBe("2026-09");
  });
});
