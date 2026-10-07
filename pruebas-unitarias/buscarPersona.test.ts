// Lo que fija este archivo: que «Reportar caso» encuentre a la persona por nombre,
// TAG, placa, folio o modelo del coche, sin importar acentos, y que una persona que
// solo esta en ZK tambien aparezca.
import { describe, it, expect } from "vitest";
import { buscarCandidatos, construirCandidatos, normalizarBusqueda } from "@/lib/buscarPersona";

const padron = [
  { id: "r1", folio: "SATAG-000471", noDispositivo: "11797422", estado: "activo", nombre: "Alejandro Betancourt Banda", placas: "UKL661F", marca: "Nissan", modelo: "Tsuru", color: "Azul" },
  { id: "r2", folio: "SATAG-002987", noDispositivo: "12463304", estado: "baja", nombre: "Alejandro Betancourt Banda", placas: "", marca: "Sin registrar", modelo: "Sin registrar", color: "Sin registrar" },
  { id: "r3", folio: "SATAG-001500", noDispositivo: "13000001", estado: "activo", nombre: "María Peña Núñez", placas: "ABC-12-34", marca: "Kia", modelo: "Rio", color: "Rojo" },
];
const zk = new Map([
  ["11797422", { nombre: "ALEJANDRO BETANCOUR BANDA", departamento: "DEPORTES", placa: "UHL651F" }],
  ["9444850", { nombre: "", departamento: "BAJAS", placa: "" }],
  ["9999999", { nombre: "JUAN SOLO EN ZK", departamento: "Padres de familia", placa: "XYZ123" }],
]);
const lista = construirCandidatos(padron, zk);

describe("buscar a quien reportar", () => {
  it("normaliza acentos y signos", () => {
    expect(normalizarBusqueda("Peña-Núñez")).toBe("pena nunez");
  });
  it("por nombre, sin acentos y en cualquier orden", () => {
    expect(buscarCandidatos(lista, "nunez maria").map((c) => c.tarjeta)).toEqual(["13000001"]);
  });
  it("por TAG, y el vivo antes que el dado de baja", () => {
    const r = buscarCandidatos(lista, "betancourt");
    expect(r.map((c) => c.tarjeta)).toEqual(["11797422", "12463304"]);
    expect(buscarCandidatos(lista, "12463304")[0].folio).toBe("SATAG-002987");
  });
  it("por placa, con o sin guiones, y tambien por la placa de ZK", () => {
    expect(buscarCandidatos(lista, "abc1234")[0].tarjeta).toBe("13000001");
    expect(buscarCandidatos(lista, "UHL651F")[0].tarjeta).toBe("11797422");
  });
  it("por el nombre de ZK aunque el expediente lo escriba distinto", () => {
    const l = construirCandidatos([{ ...padron[0], nombre: "Alejandro Betancour Banda" }], new Map([["11797422", { nombre: "ALEJANDRO BETANCOURT BANDA", departamento: "", placa: "" }]]));
    expect(buscarCandidatos(l, "betancourt").map((c) => c.tarjeta)).toEqual(["11797422"]);
  });
  it("por modelo del coche", () => {
    expect(buscarCandidatos(lista, "tsuru").map((c) => c.tarjeta)).toEqual(["11797422"]);
  });
  it("por folio", () => {
    expect(buscarCandidatos(lista, "SATAG-001500")[0].registroId).toBe("r3");
  });
  it("quien solo esta en ZK tambien aparece, sin expediente", () => {
    const r = buscarCandidatos(lista, "juan solo");
    expect(r[0]).toMatchObject({ tarjeta: "9999999", registroId: null, departamentoZk: "Padres de familia" });
  });
  it("«Sin registrar» no cuenta como vehiculo", () => {
    expect(lista.find((c) => c.tarjeta === "12463304")?.vehiculo).toBe("");
  });
  it("con menos de dos letras no busca", () => {
    expect(buscarCandidatos(lista, "a")).toEqual([]);
  });
});
