// El alta automatica desde ZK (bloque 86) necesita el nombre partido como ZK lo
// trae y la placa. El export real (5-oct-2026) trae una linea de titulo, columnas
// separadas por tabulador, y hay padrones con la placa en «Celular» en vez de
// «Placa Vehicular» porque es la columna que acepta la plantilla de importacion.
import { describe, it, expect } from "vitest";
import { parsearPadronZk } from "@/lib/zk/padron";

const CAB = ["ID", "Nombre", "Apellido", "ID de Departamento", "Nombre de Departamento", "Tarjeta", "Placa Vehicular", "Celular"];
const fila = (...c: string[]) => c.join("\t");
const texto = [
  "Usuarios\t\t\t",
  CAB.join("\t"),
  fila("1", "Alma Rosa ", "Gonzáles Cano", "19", "Padres de familia", "13475439", "", "rap522b"),
  fila("2", "CLAUDIA", "CAMARGO ROMERO", "12", "PREPARATORIA DOCENTES", "9275061", "UKY074G", "UKY074G"),
  fila("3", "SOLO", "", "23", "Otros", "0012345678", "", ""),
].join("\n");

describe("padron de ZK: lo que necesita el alta automatica", () => {
  const { personas } = parsearPadronZk(texto);

  it("conserva el nombre y el apellido por separado, y el nombre completo", () => {
    expect(personas[0]).toMatchObject({ nombres: "Alma Rosa", apellidos: "Gonzáles Cano", nombre: "Alma Rosa Gonzáles Cano" });
    expect(personas[2]).toMatchObject({ nombres: "SOLO", apellidos: "", nombre: "SOLO", tarjeta: "12345678" });
  });

  it("toma la placa de «Placa Vehicular» o, si viene vacia, de «Celular»", () => {
    expect(personas[0].placa).toBe("RAP522B");
    expect(personas[1].placa).toBe("UKY074G");
    expect(personas[2].placa).toBe("");
  });
});
