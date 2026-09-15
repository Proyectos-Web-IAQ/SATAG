// Sección en la que trabaja un maestro (SC-029, L2-09). Decide el
// estacionamiento al que da acceso su TAG: preescolar y primaria entran por
// E2; secundaria y preparatoria por E1 (criterio confirmado el 14-sep).
//
// Un solo lugar para la lista, las etiquetas y el criterio de acceso: el alta
// pública, la ficha del expediente, la instalación y la exportación a ZK leen
// de aquí, para que no se desincronicen como ya pasó con TIPOS_CON_FAMILIA.
import type { TipoUsuario } from "@/lib/mock/types";

export type SeccionMaestro = "preescolar" | "primaria" | "secundaria" | "preparatoria";

export const SECCIONES_MAESTRO: SeccionMaestro[] = ["preescolar", "primaria", "secundaria", "preparatoria"];

export const SECCION_MAESTRO_LABEL: Record<SeccionMaestro, string> = {
  preescolar: "Preescolar",
  primaria: "Primaria",
  secundaria: "Secundaria",
  preparatoria: "Preparatoria",
};

// La base guarda la sección como texto (bloque 70); esto la valida al leerla.
export function esSeccionMaestro(valor: unknown): valor is SeccionMaestro {
  return typeof valor === "string" && (SECCIONES_MAESTRO as string[]).includes(valor);
}

// Estacionamientos que corresponden por tipo y, para maestro, por sección
// (criterio de Campo/01 - Puente SATAG-ZKBioSecurity, 14-sep). Solo SUGIERE:
// TI lo confirma o lo cambia al instalar. null = no hay criterio (maestro sin
// sección capturada).
export function estacionamientosSugeridos(tipo: TipoUsuario, seccion: SeccionMaestro | null): string[] | null {
  switch (tipo) {
    case "padres":
    case "otro":
      return ["E1", "E2"];
    case "alumno":
      return ["E1"];
    case "admin":
      return ["E2"];
    case "maestro":
      if (seccion === "preescolar" || seccion === "primaria") return ["E2"];
      if (seccion === "secundaria" || seccion === "preparatoria") return ["E1"];
      return null;
  }
}
