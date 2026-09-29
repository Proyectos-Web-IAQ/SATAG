import { describe, it, expect } from "vitest";
import { chipsDisponibles, TOPE_CHIPS } from "@/lib/inventario";

// 20 TAGs, mas que el tope: es el caso que se reporto desde el campo.
const VEINTE = Array.from({ length: 20 }, (_, i) => String(9426780 + i));

describe("chipsDisponibles · el tope", () => {
  it("el tope son 12, que es lo que cabe sin tapar el formulario", () => {
    expect(TOPE_CHIPS).toBe(12);
  });

  it("con mas del tope muestra 12 y DICE cuantos faltan", () => {
    // Antes esto era un callejon sin salida: 12 botones y nada mas.
    const r = chipsDisponibles(VEINTE, "", false);
    expect(r.visibles).toHaveLength(12);
    expect(r.ocultos).toBe(8);
  });

  it("«ver todos» los muestra todos y deja de ocultar", () => {
    const r = chipsDisponibles(VEINTE, "", true);
    expect(r.visibles).toHaveLength(20);
    expect(r.ocultos).toBe(0);
  });

  it("con pocos no anuncia ocultos que no existen", () => {
    const r = chipsDisponibles(VEINTE.slice(0, 5), "", false);
    expect(r.visibles).toHaveLength(5);
    expect(r.ocultos).toBe(0);
  });
});

describe("chipsDisponibles · buscar el que se tiene en la mano", () => {
  it("filtra por coincidencia parcial, no solo por el principio", () => {
    // Quien mira la etiqueta teclea los ultimos digitos: son los que cambian.
    const r = chipsDisponibles(VEINTE, "795", false);
    expect(r.visibles).toEqual(["9426795"]);
    expect(r.sinCoincidencias).toBe(false);
  });

  it("el filtro tambien respeta el tope, para no tapar la pantalla", () => {
    // "942" coincide con los 20; siguen mostrandose 12 y avisando de 8.
    const r = chipsDisponibles(VEINTE, "942", false);
    expect(r.visibles).toHaveLength(12);
    expect(r.ocultos).toBe(8);
  });

  it("un numero que no esta en el inventario se avisa SIN bloquear", () => {
    // Puede ser el TAG propio de una familia o uno anterior al inventario. La
    // captura a mano sigue siendo valida: el aviso informa, no impide.
    const r = chipsDisponibles(VEINTE, "1234567", false);
    expect(r.visibles).toEqual([]);
    expect(r.sinCoincidencias).toBe(true);
  });

  it("sin inventario no se acusa de falta de coincidencias a quien teclea", () => {
    // Con el inventario vacio no hay nada contra que comparar: decir «no
    // coincide» seria culpar a TI de que nadie dio de alta TAGs.
    const r = chipsDisponibles([], "1234567", false);
    expect(r.sinCoincidencias).toBe(false);
  });

  it("los espacios sobrantes no cuentan como busqueda", () => {
    const r = chipsDisponibles(VEINTE, "   ", false);
    expect(r.visibles).toHaveLength(12);
    expect(r.sinCoincidencias).toBe(false);
  });
});
