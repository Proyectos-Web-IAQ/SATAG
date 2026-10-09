// Lo que fija este archivo: que el lector de «Personal de Apertura» reconozca la
// puerta y solo saque IDs, y que las filas de una tanda conserven el ID de ZK (sin
// el, el import crearia a otra persona) y cambien solo lo que la tanda pide.
// Datos inventados.
import { describe, it, expect } from "vitest";
import { parsearPuertaZk, puertaDe } from "@/lib/zk/puertas";
import { accionSugerida, filasDeTanda, nombreNivel } from "@/lib/zk/movimientos";

describe("la accion en ZK que se sugiere al cerrar (bloque 94)", () => {
  const deptos = [{ id: "10", nombre: "BAJAS" }, { id: "19", nombre: "Padres de familia" }, { id: "25", nombre: "Empleado_PPF" }];
  it("exempleados, uno o varios: a BAJAS", () => {
    expect(accionSugerida([{ tipo: "exempleado-tag-vivo", titulo: "x" }, { tipo: "exempleado-tag-vivo", titulo: "y" }], deptos)).toEqual({ que: "departamento", deptoDestino: "10" });
  });
  it("departamento distinto: el destino del titulo, sin importar mayusculas ni guion bajo", () => {
    expect(accionSugerida([{ tipo: "departamento-distinto", titulo: "En ZK esta en «BAJAS» y le toca «Padres de familia»" }], deptos)).toEqual({ que: "departamento", deptoDestino: "19" });
    expect(accionSugerida([{ tipo: "departamento-distinto", titulo: "En ZK esta en «X» y le toca «EMPLEADO PPF»" }], deptos)).toEqual({ que: "departamento", deptoDestino: "25" });
  });
  it("varios departamento distinto: el destino si todos dicen el mismo; si no, ninguna", () => {
    const ppf = (de: string) => ({ tipo: "departamento-distinto", titulo: `En ZK esta en «${de}» y le toca «Empleado_PPF»` });
    expect(accionSugerida([ppf("PRIMARIA DOCENTE"), ppf("Admon"), ppf("Padres de familia")], deptos)).toEqual({ que: "departamento", deptoDestino: "25" });
    expect(accionSugerida([ppf("Admon"), { tipo: "departamento-distinto", titulo: "En ZK esta en «X» y le toca «Padres de familia»" }], deptos)).toBeNull();
    expect(accionSugerida([ppf("Admon"), ppf("X")], [{ id: "10", nombre: "BAJAS" }])).toBeNull();
  });
  it("nombre en ZK: el nombre del titulo, solo con un caso", () => {
    expect(accionSugerida([{ tipo: "nombre-en-zk", titulo: "En ZK dice «Ana»: debe decir «Ana Rojo Paz»" }], deptos)).toEqual({ que: "nombre", nombreDestino: "Ana Rojo Paz" });
  });
  it("si no se puede saber, ninguna", () => {
    expect(accionSugerida([{ tipo: "conducta", titulo: "Entro en sentido contrario" }], deptos)).toBeNull();
    expect(accionSugerida([{ tipo: "departamento-distinto", titulo: "le toca «Otro que no existe»" }], deptos)).toBeNull();
    expect(accionSugerida([{ tipo: "exempleado-tag-vivo", titulo: "x" }, { tipo: "conducta", titulo: "y" }], deptos)).toBeNull();
  });
});

const reporte = (titulo: string, filas: string[][]) =>
  [titulo, ["ID", "Nombre", "Apellido", "Departamento"].join("\t"), ...filas.map((f) => f.join("\t"))].join("\n");

describe("Personal de Apertura", () => {
  it("la puerta sale del titulo que escribe ZK", () => {
    const l = parsearPuertaZk(
      reporte("Salida 2(2) Personal de Apertura", [["601", "ANA", "ROJO", "Padres de familia"], ["602", "LUIS", "PAZ", "BAJAS"], ["601", "ANA", "ROJO", "Padres de familia"]]),
      "renombrado.xls",
    );
    expect(l.puerta).toBe("E2-salida");
    expect(l.ids).toEqual(["601", "602"]);
    expect(l.filasArchivo).toBe(3);
    expect(l.exportadoEn).toBeNull();
  });

  it("si el archivo no trae titulo, la puerta y la hora salen de su nombre", () => {
    const l = parsearPuertaZk(reporte("", [["7", "A", "B", "X"]]), "Entrada 1(1) Personal de Apertura_20261009112018.xls");
    expect(l.puerta).toBe("E1-entrada");
    expect(l.exportadoEn).toBe("2026-10-09 11:20:18");
  });

  it("un archivo que no es de una puerta se rechaza", () => {
    expect(() => parsearPuertaZk(reporte("Usuarios", [["7", "A", "B", "X"]]), "Usuarios_20261009111949.xls")).toThrow(/puerta/);
  });

  it("un Excel pasado a texto trae «\"ID\"» entre comillas, y se lee igual (9-oct)", () => {
    const texto = ["Salida 2(2) Personal de Apertura\t\t\t\t", '"ID"\tNombre\tApellido\tDepartamento\t', "1002\tANA\tROJO\tAdmon\t"].join("\n");
    expect(parsearPuertaZk(texto, "x.xls").ids).toEqual(["1002"]);
  });

  it("reconoce las cuatro puertas", () => {
    expect(["Entrada 1(1)", "Salida 1(2)", "Entrada 2(1)", "Salida 2(2)"].map(puertaDe)).toEqual(["E1-entrada", "E1-salida", "E2-entrada", "E2-salida"]);
  });
});

describe("las filas de una tanda", () => {
  const base = { tarjeta: "12345678", idZk: "600123", nombres: "ANA SOFIA", apellidos: "ROJO PAZ", placa: "ABC123A", deptoId: "10", deptoNombre: "BAJAS", nombreDestino: null };

  it("un cambio de departamento conserva el ID, el nombre y la placa", () => {
    expect(filasDeTanda([base])).toEqual([
      { id: "600123", nombre: "ANA SOFIA", apellido: "ROJO PAZ", deptoId: "10", deptoNombre: "BAJAS", tarjeta: "12345678", celular: "ABC123A" },
    ]);
  });

  it("una correccion de nombre lo parte en nombre y apellidos, en mayusculas", () => {
    const [f] = filasDeTanda([{ ...base, deptoId: "19", deptoNombre: "Padres de familia", nombreDestino: "Ana Sofía de la Rojo Paz" }]);
    expect([f.nombre, f.apellido, f.deptoId]).toEqual(["ANA SOFÍA", "DE LA ROJO PAZ", "19"]);
  });

  it("sin el ID de ZK no hay archivo", () => {
    expect(() => filasDeTanda([{ ...base, idZk: "" }])).toThrow(/IDs de ZK/);
  });

  it("los niveles con su nombre de ZK", () => {
    expect(nombreNivel("E2")).toBe("ESTACIONAMIENTO 2");
  });
});
