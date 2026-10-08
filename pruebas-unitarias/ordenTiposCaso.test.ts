// Lo que fija este archivo (bloque 91): el orden de los tipos sigue al de su familia,
// y arrastrar un elemento lo deja donde se solto, bajando o subiendo.
import { describe, it, expect } from "vitest";
import { reordenar, tiposEnOrden, type FamiliaCaso, type TipoCasoCatalogo } from "@/lib/casosRegistro";

const fam = (id: string, orden: number): FamiliaCaso => ({ id, titulo: id, orden, fondo: "#000000", tinta: "#ffffff" });
const tipo = (t: string, familia: string, orden: number): TipoCasoCatalogo => ({
  tipo: t, titulo: t, categoria: "", queHacer: "", automatico: false, orden, familia, activo: true, motivosCierre: [],
});

describe("tiposEnOrden", () => {
  it("ordena primero por la familia y luego por el tipo", () => {
    const familias = [fam("vinculo", 10), fam("acceso", 20)];
    const tipos = [tipo("departamento-distinto", "acceso", 5), tipo("exempleado-tag-vivo", "vinculo", 900), tipo("excepcion-acceso", "acceso", 1)];
    expect(tiposEnOrden(familias, tipos).map((t) => t.tipo)).toEqual(["exempleado-tag-vivo", "excepcion-acceso", "departamento-distinto"]);
  });
  it("deja al final los tipos de una familia desconocida", () => {
    expect(tiposEnOrden([fam("tag", 10)], [tipo("x", "nueva", 1), tipo("y", "tag", 50)]).map((t) => t.tipo)).toEqual(["y", "x"]);
  });
});

describe("reordenar", () => {
  const l = ["a", "b", "c", "d"];
  it("al bajar queda despues del destino", () => expect(reordenar(l, "a", "c")).toEqual(["b", "c", "a", "d"]));
  it("al subir queda antes del destino", () => expect(reordenar(l, "d", "b")).toEqual(["a", "d", "b", "c"]));
  it("al ultimo lugar", () => expect(reordenar(l, "a", "d")).toEqual(["b", "c", "d", "a"]));
  it("sin cambios si no esta o es el mismo", () => {
    expect(reordenar(l, "z", "a")).toBe(l);
    expect(reordenar(l, "b", "b")).toBe(l);
  });
});
