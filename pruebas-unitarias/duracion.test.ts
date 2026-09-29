import { describe, it, expect } from "vitest";
import { mediana, duracion, personaCorta } from "@/lib/duracion";

const MIN = 60_000;
const HORA = 3_600_000;
const DIA = 86_400_000;

describe("mediana", () => {
  it("devuelve null con lista vacia, que es distinto de cero", () => {
    // Cero seria una mediana de cero minutos; null es «no se puede medir». El
    // tablero los pinta distinto a proposito.
    expect(mediana([])).toBeNull();
  });

  it("con cantidad impar toma el de en medio", () => {
    expect(mediana([5, 1, 3])).toBe(3);
  });

  it("con cantidad par promedia los dos de en medio", () => {
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
  });

  it("no depende del orden de entrada", () => {
    expect(mediana([9, 1, 5, 3, 7])).toBe(mediana([1, 3, 5, 7, 9]));
  });

  it("NO modifica el arreglo que recibe", () => {
    // Ordena sobre una copia. Si ordenara el original, el tablero pintaria los
    // puntos de la dispersion en un orden distinto del que calculo.
    const original = [3, 1, 2];
    mediana(original);
    expect(original).toEqual([3, 1, 2]);
  });

  it("aguanta el atipico sin moverse, que es la razon de usarla", () => {
    // Cinco instalaciones de ~10 min y una familia que vino tres semanas
    // despues. El promedio saldria en dias; la mediana no se entera.
    const conAtipico = [10 * MIN, 11 * MIN, 9 * MIN, 12 * MIN, 10 * MIN, 21 * DIA];
    expect(mediana(conAtipico)).toBe(10.5 * MIN);
  });
});

describe("duracion", () => {
  it("null es una raya, no cero", () => {
    expect(duracion(null)).toBe("—");
  });

  it("minutos por debajo de hora y media", () => {
    expect(duracion(7 * MIN)).toBe("7 min");
    expect(duracion(89 * MIN)).toBe("89 min");
  });

  it("a los 90 minutos cambia a horas", () => {
    // El limite exacto: 89 es la ultima en minutos, 90 la primera en horas.
    expect(duracion(90 * MIN)).toBe("1 h 30 min");
  });

  it("omite el resto cuando es exacto", () => {
    expect(duracion(2 * HORA)).toBe("2 h");
    expect(duracion(3 * DIA)).toBe("3 días");
  });

  it("a las 48 horas cambia a dias", () => {
    expect(duracion(47 * HORA)).toBe("47 h");
    expect(duracion(48 * HORA)).toBe("2 días");
  });

  it("dias con resto de horas", () => {
    expect(duracion(2 * DIA + 7 * HORA)).toBe("2 días 7 h");
  });

  it("redondea al minuto, no trunca", () => {
    expect(duracion(90_000)).toBe("2 min"); // 1.5 min
    expect(duracion(29_000)).toBe("0 min"); // menos de medio minuto
  });

  it("cero es cero minutos, no una raya", () => {
    // Instalado en el mismo minuto del cobro. Es un dato, no una ausencia.
    expect(duracion(0)).toBe("0 min");
  });
});

describe("personaCorta", () => {
  it("recorta el correo en la arroba", () => {
    expect(personaCorta("angel.martinez@asuncionqro.edu.mx")).toBe("angel.martinez");
  });

  it("null es «Sin identificar»: las instalaciones anteriores al bloque 68", () => {
    expect(personaCorta(null)).toBe("Sin identificar");
  });

  it("un texto sin arroba se devuelve tal cual", () => {
    expect(personaCorta("angel")).toBe("angel");
  });

  it("un correo que empieza con arroba no queda vacio", () => {
    // indexOf daria 0 y un slice(0,0) dejaria la celda en blanco.
    expect(personaCorta("@dominio.mx")).toBe("@dominio.mx");
  });
});
