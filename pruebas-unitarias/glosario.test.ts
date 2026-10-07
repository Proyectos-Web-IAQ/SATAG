// Lo que fija este archivo: los rotulos de persona se escriben de una sola forma en
// todas las pestanas (DISEÑO.md §8.3). Estado del expediente y tipo de persona
// cubren todos los valores que existen; las plumas se unen con « y »; sin plumas es
// «Ninguna»; y a media frase el rotulo se deriva del mismo mapa con `enFrase`.
import { describe, it, expect } from "vitest";
import type { EstadoRegistro, TipoUsuario } from "@/lib/mock/types";
import { ESTADO_EXPEDIENTE, ROTULO, TIPO_PERSONA, enFrase, textoPlumas } from "@/lib/glosario";

// Si se agrega un estado o un tipo en lib/mock/types.ts, el compilador obliga a
// sumarlo al mapa; estas listas obligan a sumarlo tambien a la prueba.
const ESTADOS: EstadoRegistro[] = ["pendiente", "activo", "bloqueado", "baja"];
const TIPOS: TipoUsuario[] = ["padres", "maestro", "alumno", "admin", "otro"];

describe("textoPlumas", () => {
  it("sin plumas dice «Ninguna»", () => {
    expect(textoPlumas([])).toBe("Ninguna");
    expect(textoPlumas([])).toBe(ROTULO.ninguna);
  });
  it("una pluma va sola", () => {
    expect(textoPlumas(["E1"])).toBe("E1");
  });
  it("dos plumas se unen con « y »", () => {
    expect(textoPlumas(["E1", "E2"])).toBe("E1 y E2");
  });
  it("tres o mas: comas y « y » al final", () => {
    expect(textoPlumas(["E1", "E2", "E3"])).toBe("E1, E2 y E3");
  });
  it("respeta el orden que trae el expediente", () => {
    expect(textoPlumas(["E2", "E1"])).toBe("E2 y E1");
  });
  it("no toca el arreglo que recibe", () => {
    const claves = ["E1", "E2"];
    textoPlumas(claves);
    expect(claves).toEqual(["E1", "E2"]);
  });
});

describe("ESTADO_EXPEDIENTE", () => {
  it("cubre todos los estados, sin sobrantes", () => {
    expect(Object.keys(ESTADO_EXPEDIENTE).sort()).toEqual([...ESTADOS].sort());
  });
  it("con las palabras canonicas y mayuscula inicial", () => {
    expect(ESTADO_EXPEDIENTE).toEqual({
      pendiente: "Pendiente de cobro",
      activo: "Activo",
      bloqueado: "Bloqueado",
      baja: "Dado de baja",
    });
  });
});

describe("TIPO_PERSONA", () => {
  it("cubre todos los tipos, sin sobrantes", () => {
    expect(Object.keys(TIPO_PERSONA).sort()).toEqual([...TIPOS].sort());
  });
  it("cada tipo tiene rotulo con mayuscula inicial", () => {
    for (const t of TIPOS) {
      const r = TIPO_PERSONA[t];
      expect(r.trim()).not.toBe("");
      expect(r.charAt(0)).toBe(r.charAt(0).toUpperCase());
    }
  });
});

describe("ROTULO", () => {
  it("los rotulos de persona", () => {
    expect(ROTULO.departamentoZk).toBe("Departamento en ZK");
    expect(ROTULO.placa).toBe("Placa");
    expect(ROTULO.placaSatag).toBe("Placa en SATAG");
    expect(ROTULO.placaZk).toBe("Placa en ZK");
    expect(ROTULO.sinPlacas).toBe("Sin placas");
    expect(ROTULO.plumas).toBe("Plumas");
  });
});

describe("enFrase", () => {
  it("baja la mayuscula inicial de una palabra comun", () => {
    expect(enFrase(ESTADO_EXPEDIENTE.baja)).toBe("dado de baja");
    expect(enFrase(ESTADO_EXPEDIENTE.pendiente)).toBe("pendiente de cobro");
    expect(enFrase(TIPO_PERSONA.padres)).toBe("padre / madre / tutor");
    expect(enFrase(ROTULO.sinPlacas)).toBe("sin placas");
    expect(enFrase(textoPlumas([]))).toBe("ninguna");
  });
  it("deja intactas las claves y siglas", () => {
    expect(enFrase(textoPlumas(["E1", "E2"]))).toBe("E1 y E2");
    expect(enFrase("TAG")).toBe("TAG");
    expect(enFrase("ZK")).toBe("ZK");
  });
  it("acentos: tambien baja la «Á» inicial", () => {
    expect(enFrase("Área")).toBe("área");
  });
});
