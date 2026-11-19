// Lo que fija este archivo: el numero de caso (C-000123), que cerrar un caso sin nota
// se avise ANTES de enviar, el orden (lo vivo arriba) y que la evidencia libre de
// cada regla se lea como frases y no como JSON.
import { describe, it, expect } from "vitest";
import {
  COLUMNAS_CASO,
  columnaDe,
  contarPorEstado,
  coincideBusqueda,
  esDeLaPersona,
  evidenciaLegible,
  humanizarClave,
  numeroCaso,
  numeroDeBusqueda,
  ordenarCasos,
  personaDelCaso,
  problemaDeSeguimiento,
  type CasoGuardado,
} from "@/lib/casosRegistro";

const caso = (o: Partial<CasoGuardado>): CasoGuardado => ({
  id: "x", numero: 1, tipo: "otro", registroId: null, tarjeta: "1234567", titulo: "Un caso", detalle: "", evidencia: {},
  estado: "abierto", origen: "manual", regla: null, clave: null, preguntarAlPresentarse: false, creadoPor: "ti",
  creadoEn: "2026-10-06T10:00:00Z", actualizadoEn: "2026-10-06T10:00:00Z", cerradoPor: null, cerradoEn: null, cierreNota: null,
  urgente: false, atorado: false, esperaMotivo: null, esperaHasta: null, esperaTexto: null, cierreMotivo: null, veces: 1, vehiculo: null, estadoExpediente: null,
  folio: null, nombre: null, ...o,
});

describe("numeroCaso y numeroDeBusqueda", () => {
  it("rellena a seis digitos", () => {
    expect(numeroCaso(123)).toBe("C-000123");
    expect(numeroCaso(1)).toBe("C-000001");
  });
  it("entiende C-123, c123 y 123, y no un TAG de siete digitos como caso", () => {
    expect(numeroDeBusqueda("C-000123")).toBe(123);
    expect(numeroDeBusqueda("c123")).toBe(123);
    expect(numeroDeBusqueda("123")).toBe(123);
    expect(numeroDeBusqueda("Maria")).toBeNull();
  });
});

describe("buscar una lista pegada de numeros", () => {
  const a = caso({ numero: 75, tarjeta: "12823809" }), b = caso({ numero: 77, tarjeta: "9425959" }), c = caso({ numero: 78, tarjeta: "13856219" });
  it("con comas, espacios, renglones o C-: encuentra cada caso de la lista y ninguno mas", () => {
    for (const q of ["75, 77", "75 77", "75\n77", "C-000075; c77"]) {
      expect([a, b, c].filter((x) => coincideBusqueda(x, q)).map((x) => x.numero)).toEqual([75, 77]);
    }
  });
  it("tambien sirve con numeros de TAG", () => {
    expect([a, b, c].filter((x) => coincideBusqueda(x, "13856219, 9425959")).map((x) => x.numero)).toEqual([77, 78]);
  });
  it("un solo numero sigue buscando como antes (caso o TAG)", () => {
    expect(coincideBusqueda(a, "75")).toBe(true);
    expect(coincideBusqueda(a, "12823809")).toBe(true);
    expect(coincideBusqueda(b, "75")).toBe(false);
  });
  it("si algo de la lista no es numero, es una busqueda normal por palabras", () => {
    expect(coincideBusqueda(caso({ numero: 5, nombre: "Maria Perez" }), "maria perez")).toBe(true);
    expect(coincideBusqueda(a, "75 maria")).toBe(false);
  });
});

describe("problemaDeSeguimiento", () => {
  it("pide algo que enviar", () => {
    expect(problemaDeSeguimiento("  ", null, "abierto")).not.toBeNull();
    expect(problemaDeSeguimiento("", "abierto", "abierto")).not.toBeNull();
  });
  it("cerrar sin nota se avisa, con nota se deja", () => {
    expect(problemaDeSeguimiento("", "resuelto", "abierto")).toMatch(/nota/);
    expect(problemaDeSeguimiento("  ", "descartado", "seguimiento")).toMatch(/descartado/);
    expect(problemaDeSeguimiento("Se habló con la persona", "resuelto", "abierto")).toBeNull();
  });
  it("una nota sola, o un cambio a seguimiento solo, se puede enviar", () => {
    expect(problemaDeSeguimiento("Se llamó", null, "abierto")).toBeNull();
    expect(problemaDeSeguimiento("", "seguimiento", "abierto")).toBeNull();
  });
  it("reabrir un caso cerrado no pide nota", () => {
    expect(problemaDeSeguimiento("", "abierto", "resuelto")).toBeNull();
  });
});

describe("orden y cuentas", () => {
  it("lo vivo primero, y dentro de cada grupo lo mas reciente", () => {
    const l = ordenarCasos([
      caso({ numero: 1, estado: "resuelto", actualizadoEn: "2026-10-06T12:00:00Z" }),
      caso({ numero: 2, estado: "abierto", actualizadoEn: "2026-10-05T12:00:00Z" }),
      caso({ numero: 3, estado: "seguimiento", actualizadoEn: "2026-10-06T08:00:00Z" }),
    ]);
    expect(l.map((c) => c.numero)).toEqual([3, 2, 1]);
  });
  it("cuenta por estado", () => {
    expect(contarPorEstado([caso({}), caso({ estado: "resuelto" }), caso({ estado: "resuelto" })])).toEqual({
      nuevo: 0, abierto: 1, consultar: 0, esperando: 0, seguimiento: 0, resuelto: 2, descartado: 0,
    });
  });
  it("«Consultar con el CP» es su propia columna, entre Por atender y Esperando (bloque 96)", () => {
    expect(columnaDe("consultar")).toBe("consultar");
    expect(COLUMNAS_CASO.map((c) => c.id)).toEqual(["nuevo", "atender", "consultar", "esperando", "cerrado"]);
  });
});

describe("persona y busqueda", () => {
  it("es de la persona por expediente o por cualquiera de sus TAGs", () => {
    expect(esDeLaPersona(caso({ registroId: "r1", tarjeta: null }), "r1", [])).toBe(true);
    expect(esDeLaPersona(caso({ tarjeta: "999" }), "r1", ["111", "999"])).toBe(true);
    expect(esDeLaPersona(caso({ tarjeta: "555" }), "r1", ["111"])).toBe(false);
  });
  it("dice a quien toca", () => {
    expect(personaDelCaso(caso({ folio: "SATAG-000001", nombre: "Ana" }))).toBe("Ana · SATAG-000001");
    expect(personaDelCaso(caso({ tarjeta: "1234567" }))).toBe("TAG 1234567");
  });
  it("busca por numero, TAG, folio y nombre", () => {
    const c = caso({ numero: 42, tarjeta: "7654321", folio: "SATAG-000009", nombre: "Lucía Pérez" });
    expect(coincideBusqueda(c, "C-000042")).toBe(true);
    expect(coincideBusqueda(c, "42")).toBe(true);
    expect(coincideBusqueda(c, "7654")).toBe(true);
    expect(coincideBusqueda(c, "satag-000009")).toBe(true);
    expect(coincideBusqueda(c, "lucía")).toBe(true);
    expect(coincideBusqueda(c, "otra")).toBe(false);
  });
});

describe("evidenciaLegible", () => {
  it("lo conocido con su etiqueta y en orden; lo vacio no sale", () => {
    const r = evidenciaLegible({ aperturasVentana: 37, ventana: "14-sep a 2026-10-06", plumas: "", ultimoPaso: "2026-10-01 18:26:16" });
    expect(r.map((x) => x.etiqueta)).toEqual(["Ventana de la bitácora", "Aperturas en la ventana", "Último paso por la pluma"]);
    expect(r[1].valor).toBe("37");
  });
  it("una lista de objetos se lee como frase", () => {
    const r = evidenciaLegible({ viajaCon: [{ tag: "9426782", liga: "mismo coche", folio: "SATAG-002540 (activo)", detalle: "5 dias" }] });
    expect(r[0]).toEqual({ etiqueta: "Viaja con", valor: "TAG 9426782 · mismo coche · SATAG-002540 (activo) · 5 dias" });
  });
  it("una llave desconocida se humaniza y no truena con datos raros", () => {
    expect(humanizarClave("cuantasVeces")).toBe("Cuantas veces");
    expect(evidenciaLegible({ cuantasVeces: 3, raro: null, vacio: [] })).toEqual([{ etiqueta: "Cuantas veces", valor: "3" }]);
    expect(evidenciaLegible(null)).toEqual([]);
  });
});
