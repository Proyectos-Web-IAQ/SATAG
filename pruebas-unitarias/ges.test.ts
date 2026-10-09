// Lo que fija este archivo: que el lector de GES (lib/ges/leer.ts) rechace cualquier
// archivo con columnas de mas o con nombres de alumnos que no son de Preparatoria, y
// que arme una fila por persona. Y que la consulta reducida pida solo lo que el lector
// acepta. Datos inventados.
import { describe, it, expect } from "vitest";
import { esGrupoPrepa, fechaGes, leerTablaGes } from "@/lib/ges/leer";
import { CONSULTA_EMPLEADOS, CONSULTA_PERSONAL, cicloEscolar, consultaFamilias } from "@/lib/ges/consultas";

const CAB_FAM = ["INICIAL", "ID_FAMILIA", "CODIGO_GRUPO", "PADRE", "MADRE", "MATRICULA", "PATERNO", "MATERNO", "NOMBRE"];
const fam = (...filas: string[][]) => [CAB_FAM, ...filas];

describe("familias", () => {
  it("una fila por tutor, con los grupos de todos sus hijos, y solo los alumnos de Prepa", () => {
    const l = leerTablaGes(fam(
      ["2026", "100", "P3A", "ROJO PAZ LUIS", "LUNA SOSA ANA", "", "", "", ""],
      ["2026", "100", "301", "ROJO PAZ LUIS", "LUNA SOSA ANA", "170001", "ROJO", "LUNA", "EVA"],
      ["2026", "200", "K2", "", "MAR RUIZ ALMA", "", "", "", ""],
    ));
    expect(l.fuente).toBe("familias");
    expect(l.ciclo).toBe(2026);
    expect(l.filasArchivo).toBe(3);
    const porId = new Map(l.personas.map((p) => [p.gesId, p]));
    expect(porId.get("F-100-padre")).toMatchObject({ clase: "tutor", rol: "padre", grupos: ["301", "P3A"], familia: "100", activo: true });
    expect(porId.get("F-100-madre")?.grupos).toEqual(["301", "P3A"]);
    expect(porId.get("A-170001")).toMatchObject({ clase: "alumno", nombre: "EVA ROJO LUNA", grupos: ["301"], familia: "100" });
    expect(porId.has("F-200-padre")).toBe(false);
    expect(porId.get("F-200-madre")?.grupos).toEqual(["K2"]);
    expect(l.personas).toHaveLength(4);
    expect(l.avisos.join(" ")).toContain("1 familia tiene un solo tutor");
  });

  it("rechaza el machote viejo con telefonos y domicilios", () => {
    expect(() => leerTablaGes([[...CAB_FAM, "TELEFONO", "DOMICILIO"], ["2026", "1", "P1A", "A B C", "D E F", "", "", "", "", "442", "Calle"]]))
      .toThrow(/TELEFONO, DOMICILIO/);
  });

  it("rechaza el archivo que trae el nombre de un alumno que no es de Prepa", () => {
    expect(() => leerTablaGes(fam(["2026", "1", "P3A", "A B C", "D E F", "", "", "", "NINO"]))).toThrow(/no es de Preparatoria/);
  });

  it("rechaza ciclos mezclados o sin ciclo", () => {
    expect(() => leerTablaGes(fam(["2026", "1", "P3A", "A B C", "", "", "", "", ""], ["2025", "2", "P3A", "A B C", "", "", "", "", ""]))).toThrow(/varios ciclos/);
    expect(() => leerTablaGes(fam(["", "1", "P3A", "A B C", "", "", "", "", ""]))).toThrow(/ciclo/);
  });

  it("encuentra el encabezado despues de una linea de titulo y sin importar mayusculas", () => {
    const l = leerTablaGes([["Consulta"], CAB_FAM.map((c) => c.toLowerCase()), ["2026", "1", "S1A", "PEREZ ROJO JUAN", "", "", "", "", ""]]);
    expect(l.personas.map((p) => p.gesId)).toEqual(["F-1-padre"]);
  });

  it("un «.» no es un nombre", () => {
    const l = leerTablaGes(fam(["2026", "1", "S1A", ".", "ROJO PAZ ANA", "", "", "", ""]));
    expect(l.personas.map((p) => p.gesId)).toEqual(["F-1-madre"]);
  });
});

describe("personal y empleados", () => {
  it("docentes: activo por estatus A y fecha de baja normalizada", () => {
    const l = leerTablaGes([
      ["CLAVEPROFESOR", "NOMBREPROFESOR", "DEPARTAMENTO", "CARGO", "STATUSACTUAL", "FECHA_BAJA"],
      ["PF0001", "SOSA PAZ PEDRO", "PRIMARIA", "DOCENTE", "A", ""],
      ["PF0002", "RUIZ MAR ALMA", "SECUNDARIA", "DIRECTORA", "B", "31/07/2025"],
    ]);
    expect(l.fuente).toBe("personal");
    expect(l.personas[0]).toMatchObject({ gesId: "D-PF0001", clase: "docente", activo: true, fechaBaja: null, area: "PRIMARIA" });
    expect(l.personas[1]).toMatchObject({ gesId: "D-PF0002", activo: false, fechaBaja: "2025-07-31", cargo: "DIRECTORA" });
  });

  it("rechaza el export de personal con columnas de mas", () => {
    expect(() => leerTablaGes([["CLAVEPROFESOR", "NOMBREPROFESOR", "DEPARTAMENTO", "CARGO", "STATUSACTUAL", "FECHA_BAJA", "NUMEMPLEADO", "GENERO"]]))
      .toThrow(/NUMEMPLEADO, GENERO/);
  });

  it("empleados: el listado reducido, con su columna Activo", () => {
    const l = leerTablaGes([
      ["Num. Empleado", "Nombre", "Contrato", "Puesto", "Departamento", "Nivel", "Activo"],
      ["1067", "LUNA ROJO MARIO", "BASE", "INTENDENTE", "MANTENIMIENTO", "", "si"],
      ["1115", "PAZ SOSA EVA", "BASE", "AUXILIAR", "ADMINISTRACION", "", "no"],
    ]);
    expect(l.fuente).toBe("empleados");
    expect(l.personas.map((p) => [p.gesId, p.activo, p.cargo])).toEqual([["E-1067", true, "INTENDENTE"], ["E-1115", false, "AUXILIAR"]]);
  });

  it("empleados: la consulta de la tabla empleados, con estatus y fecha de baja", () => {
    const l = leerTablaGes([
      ["NUMEMPLEADO", "NOMBREEMPLEADO", "DEPARTAMENTO", "CARGO", "STATUSACTUAL", "FECHA_BAJA"],
      ["1067", "LUNA ROJO MARIO", "MANTENIMIENTO", "INTENDENTE", "A", ""],
      ["7072", "PAZ SOSA EVA", "ADMINISTRACION", "AUXILIAR", "B", "16/07/2026"],
    ]);
    expect(l.fuente).toBe("empleados");
    expect(l.personas.map((p) => [p.gesId, p.activo, p.cargo, p.fechaBaja])).toEqual([
      ["E-1067", true, "INTENDENTE", null],
      ["E-7072", false, "AUXILIAR", "2026-07-16"],
    ]);
  });

  it("rechaza la tabla de empleados exportada completa (sueldo, NSS, banco...)", () => {
    expect(() => leerTablaGes([["NUMEMPLEADO", "NOMBREEMPLEADO", "DEPARTAMENTO", "CARGO", "STATUSACTUAL", "FECHA_BAJA", "SUELDO", "NUMERO_SEGURIDADSOCIAL", "BANCO_CLABE"]]))
      .toThrow(/SUELDO, NUMERO_SEGURIDADSOCIAL, BANCO_CLABE/);
  });

  it("el export viejo de profesores (con NUMEMPLEADO) sigue siendo de personal y se rechaza por sus columnas de más", () => {
    expect(() => leerTablaGes([["CLAVEPROFESOR", "NUMEMPLEADO", "NOMBREPROFESOR", "DEPARTAMENTO", "CARGO", "STATUSACTUAL", "FECHA_BAJA"]]))
      .toThrow(/columnas que SATAG no guarda \(NUMEMPLEADO\)/);
  });

  it("un archivo que no es de GES", () => {
    expect(() => leerTablaGes([["Tarjeta", "Nombre"], ["123", "X"]])).toThrow(/No se reconoce/);
  });
});

describe("piezas", () => {
  it("fechas de GES", () => {
    expect(fechaGes("1/7/2025")).toBe("2025-07-01");
    expect(fechaGes("31/13/2025")).toBeNull();
    expect(fechaGes("")).toBeNull();
  });
  it("grupos de Prepa", () => {
    expect(esGrupoPrepa("301")).toBe(true);
    expect(esGrupoPrepa("P3A")).toBe(false);
    expect(esGrupoPrepa("VTM")).toBe(false);
  });
});

describe("las consultas reducidas", () => {
  it("el ciclo cambia en agosto", () => {
    expect(cicloEscolar(new Date(2026, 9, 8))).toBe(2026);
    expect(cicloEscolar(new Date(2027, 6, 31))).toBe(2026);
    expect(cicloEscolar(new Date(2027, 7, 1))).toBe(2027);
  });

  it("la de familias pide exactamente las columnas que el lector acepta, y del ciclo pedido", () => {
    const q = consultaFamilias(2026);
    expect(q).toContain("alumnos_grupos.inicial = 2026");
    const pedidas = [...q.matchAll(/(?:\bend as (\w+)|^\s+\w+\.(\w+),?$)/gm)].map((m) => (m[1] ?? m[2]).toUpperCase());
    expect(new Set(pedidas)).toEqual(new Set(CAB_FAM));
    expect(q).not.toMatch(/telefono|domicilio|email|clave_ciudadana|fecha_nacimiento/i);
  });

  it("la de empleados pide seis columnas, ninguna de nomina, y deja fuera a los docentes", () => {
    expect(CONSULTA_EMPLEADOS).not.toMatch(/sueldo|seguridadsocial|cedula|clave_ciudadana|banco|huella|fotografia|pension|nip|telefono|email|domicilio/i);
    const pedidas = [...CONSULTA_EMPLEADOS.matchAll(/^\s+empleados\.(\w+),?$/gm)].map((m) => m[1].toUpperCase());
    expect(pedidas).toEqual(["NUMEMPLEADO", "NOMBREEMPLEADO", "DEPARTAMENTO", "CARGO", "STATUSACTUAL", "FECHA_BAJA"]);
    expect(CONSULTA_EMPLEADOS).toMatch(/not exists \(\s*select 1 from profesores/);
  });

  it("la de personal no pide nada de mas", () => {
    expect(CONSULTA_PERSONAL).not.toMatch(/sueldo|curp|rfc|nss|banco|foto|genero|fecha_ingreso/i);
    const pedidas = [...CONSULTA_PERSONAL.matchAll(/^\s+profesores\.(\w+),?$/gm)].map((m) => m[1].toUpperCase());
    expect(pedidas).toEqual(["CLAVEPROFESOR", "NOMBREPROFESOR", "DEPARTAMENTO", "CARGO", "STATUSACTUAL", "FECHA_BAJA"]);
  });
});
