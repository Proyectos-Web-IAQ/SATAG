// Lo que fija este archivo: a que departamento de ZK manda SATAG a cada persona, y
// como agrupa la pantalla los departamentos que lee de ZK. Entre el 2 y el 5-oct-2026
// TI renumero los departamentos (Padres de familia 7 -> 19, Alumnos 5 -> 20, STOCK
// SATAG 3 -> 18) y el puente siguio mandando a los numeros viejos sin que nada fallara:
// el archivo se generaba bien y ZK lo importaba a departamentos vacios.
import { describe, it, expect } from "vitest";
import type { Registro } from "@/lib/mock/types";
import { DEPTO_STOCK_ZK, deptoZkDe, filaPadron, filaStock } from "@/lib/zk/plantillaZk";
import { grupoDeDepto, nombreDepto, SIN_CLASIFICAR } from "@/lib/zk/padron";

const expediente = (tipo: Registro["tipoUsuario"], seccion: string | null = null): Registro =>
  ({
    noDispositivo: "13078150",
    usuarioNombre: "Ana María de la Fuente López",
    tipoUsuario: tipo,
    seccionMaestro: seccion,
    placas: "abc123d",
  }) as unknown as Registro;

describe("departamento de ZK al exportar", () => {
  it("manda cada tipo al departamento que ZK tiene desde el 5-oct", () => {
    expect(deptoZkDe(expediente("padres"))?.id).toBe("19");
    expect(deptoZkDe(expediente("otro"))?.id).toBe("19");
    expect(deptoZkDe(expediente("alumno"))?.id).toBe("20");
    expect(deptoZkDe(expediente("admin"))?.id).toBe("17");
  });

  it("al maestro lo manda al departamento de su seccion", () => {
    expect(deptoZkDe(expediente("maestro", "preescolar"))?.id).toBe("9");
    expect(deptoZkDe(expediente("maestro", "primaria"))?.id).toBe("4");
    expect(deptoZkDe(expediente("maestro", "secundaria"))?.id).toBe("11");
    expect(deptoZkDe(expediente("maestro", "preparatoria"))?.id).toBe("12");
  });

  it("un maestro sin seccion no va en el archivo: no se adivina su departamento", () => {
    expect(deptoZkDe(expediente("maestro"))).toBeNull();
    expect(deptoZkDe(expediente("maestro", "otra cosa"))).toBeNull();
    expect(filaPadron(expediente("maestro"))).toBeNull();
  });

  it("la fila del padron lleva el numero y el nombre del departamento juntos", () => {
    const fila = filaPadron(expediente("padres"));
    expect(fila?.deptoId).toBe("19");
    expect(fila?.deptoNombre).toBe("Padres de familia");
    expect(fila?.tarjeta).toBe("13078150");
    expect(fila?.celular).toBe("ABC123D");
  });

  it("el stock va al 18", () => {
    expect(DEPTO_STOCK_ZK.id).toBe("18");
    expect(filaStock("13078150").deptoId).toBe("18");
  });
});

describe("grupo de un departamento de ZK en la pantalla", () => {
  it("reconoce los departamentos nuevos", () => {
    expect(grupoDeDepto("19", "Padres de familia")).toBe("Padres de familia");
    expect(grupoDeDepto("17", "Admon")).toBe("Administración y servicios");
    expect(grupoDeDepto("16", "Administracion")).toBe("Administración y servicios");
    expect(grupoDeDepto("20", "Alumnos")).toBe("Alumnos");
    expect(grupoDeDepto("21", "Ex alumnos")).toBe("Alumnos");
  });

  it("manda el nombre: un numero nuevo con un nombre conocido se agrupa bien", () => {
    expect(grupoDeDepto("99", "PRIMARIA DOCENTE")).toBe("Personal docente");
    expect(grupoDeDepto("98", "Administración")).toBe("Administración y servicios");
  });

  it("sin nombre conocido cae al numero, y si tampoco, a «Sin clasificar»", () => {
    expect(grupoDeDepto("7", "")).toBe("Padres de familia");
    expect(grupoDeDepto("18", "STOCK SATAG")).toBe(SIN_CLASIFICAR);
    expect(grupoDeDepto("10", "BAJAS")).toBe(SIN_CLASIFICAR);
    expect(grupoDeDepto("22", "Falta de información")).toBe(SIN_CLASIFICAR);
    expect(grupoDeDepto("23", "Otros")).toBe(SIN_CLASIFICAR);
    expect(grupoDeDepto("1", "General")).toBe(SIN_CLASIFICAR);
  });

  it("compara nombres sin acentos ni mayusculas", () => {
    expect(nombreDepto(" Falta de  información ")).toBe("FALTA DE INFORMACION");
    expect(nombreDepto("Administración")).toBe(nombreDepto("ADMINISTRACION"));
  });
});
