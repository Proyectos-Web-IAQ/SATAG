// Quien es una persona segun GES y si sigue en el colegio (bloque 92).
//
// LA REGLA (Gerardo, 6 y 7-oct): QUIEN TIENE UN TAG LO DICE ZK; QUIEN ES LA PERSONA,
// COMO SE LLAMA Y SI SIGUE EN EL COLEGIO LO DICE GES. Esta capa no decide de quien es
// un TAG: recibe a la persona ya armada (su expediente, sus TAGs, los nombres con que
// la conocen SATAG y ZK) y la busca en GES.
//
// DE DONDE SALE. Es el nucleo de Campo/herramientas/personas.mjs (`enGes` y la
// clasificacion), con lo que se depuro el padron el 6-oct. Lo que alli venia de la
// hoja historica no esta aqui: la hoja es historia, no vive en SATAG.
//
// QUE MANDA SOBRE QUE.
//   1. La decision que TI guardo para alguno de sus TAGs (`ges_identidades`).
//   2. El cruce por nombre con la regla ESTRICTA de lib/personas/nombres.ts: solo
//      cuenta «misma persona» (identico, otro orden, uno contiene al otro de tres
//      palabras o mas, errata). Un nombre de dos palabras que cabe en un homonimo no
//      basta: queda como «parecida» para revisar.
//   3. Si GES tiene a DOS personas distintas de la misma clase con ese nombre (una
//      mama y su hija exalumna, dos homonimos), no se elige: va a revisar.

import { decidir, palabras, separarNota, titulo } from "@/lib/personas/nombres";
import type { ClaseGes, PersonaGes } from "@/lib/ges/leer";

/** Una persona de GES tal como la guarda la base. */
export interface PersonaGesGuardada extends PersonaGes {
  /** false si dejo de venir en la ultima carga de su fuente: la familia salio o la baja ya no aparece. */
  vigente: boolean;
}

export type VeredictoGes = "persona" | "familiar" | "no_localizado" | "por_confirmar";

/** Lo que TI decidio del dueno de un TAG (tabla ges_identidades). */
export interface IdentidadDecidida {
  tarjeta: string;
  veredicto: VeredictoGes;
  gesId: string | null;
  familia: string;
  nombre: string;
  preguntar: boolean;
  nota: string;
  decididoPor: string;
  decididoEn: string;
}

export interface IndiceGes {
  porId: Map<string, PersonaGesGuardada>;
  porPalabra: Map<string, PersonaGesGuardada[]>;
  /** Familia -> sus tutores y sus grupos. */
  familias: Map<string, { tutores: PersonaGesGuardada[]; grupos: string[] }>;
}

export function indexarGes(personas: PersonaGesGuardada[]): IndiceGes {
  const porId = new Map<string, PersonaGesGuardada>();
  const porPalabra = new Map<string, PersonaGesGuardada[]>();
  const familias = new Map<string, { tutores: PersonaGesGuardada[]; grupos: string[] }>();
  for (const p of personas) {
    porId.set(p.gesId, p);
    for (const w of new Set(palabras(p.nombre))) {
      const l = porPalabra.get(w);
      if (l) l.push(p);
      else porPalabra.set(w, [p]);
    }
    if (p.clase === "tutor" && p.familia) {
      const f = familias.get(p.familia) ?? { tutores: [], grupos: [] };
      f.tutores.push(p);
      for (const g of p.grupos) if (!f.grupos.includes(g)) f.grupos.push(g);
      f.grupos.sort();
      familias.set(p.familia, f);
    }
  }
  return { porId, porPalabra, familias };
}

/** Las personas de GES que son la misma que `nombre`, y las que se le parecen. */
export function buscarEnGes(indice: IndiceGes, nombre: string): { mismas: PersonaGesGuardada[]; parecidas: PersonaGesGuardada[] } {
  const limpio = separarNota(nombre).nombre;
  const vistos = new Set<string>();
  const mismas: PersonaGesGuardada[] = [];
  const parecidas: PersonaGesGuardada[] = [];
  for (const w of palabras(limpio)) {
    for (const p of indice.porPalabra.get(w) ?? []) {
      if (vistos.has(p.gesId)) continue;
      vistos.add(p.gesId);
      const d = decidir(limpio, p.nombre);
      if (d === "misma") mismas.push(p);
      else if (d === "revisar") parecidas.push(p);
    }
  }
  return { mismas, parecidas };
}

/** Si la persona sigue en el colegio, segun GES. */
export type SigueEnColegio = "si" | "no" | "no se sabe";

export interface Identificacion {
  /** De donde salio: lo que TI decidio, el cruce por nombre, o nada. */
  fuente: "decision" | "nombre" | "ninguna";
  decision: IdentidadDecidida | null;
  tutor: PersonaGesGuardada | null;
  alumno: PersonaGesGuardada | null;
  /** Docente o empleado. */
  personal: PersonaGesGuardada | null;
  /** La familia de GES con sus grupos: la del tutor, la del alumno o la que TI decidio. */
  familia: { id: string; grupos: string[]; vigente: boolean } | null;
  sigue: SigueEnColegio;
  /** El rotulo de una linea: «Mamá de familia vigente», «Exempleado (baja 31/07/2025)»... */
  categoria: string;
  /** Homonimos o nombres que se parecen: para que TI decida. Vacio si no hay nada que revisar. */
  porRevisar: PersonaGesGuardada[];
  preguntar: boolean;
}

const PERSONAL: ClaseGes[] = ["docente", "empleado"];

/** De varias de la misma clase, la vigente y activa; si hay dos vigentes distintas, ninguna (homonimos). */
function elegir(cands: PersonaGesGuardada[]): { una: PersonaGesGuardada | null; ambigua: PersonaGesGuardada[] } {
  if (cands.length === 0) return { una: null, ambigua: [] };
  const vivas = cands.filter((p) => p.vigente && p.activo);
  const pool = vivas.length ? vivas : cands;
  if (pool.length === 1) return { una: pool[0], ambigua: [] };
  return { una: null, ambigua: pool };
}

const fechaCorta = (iso: string | null): string => (iso ? iso.split("-").reverse().join("/") : "");

function rotulo(i: Omit<Identificacion, "categoria" | "sigue" | "fuente">): { categoria: string; sigue: SigueEnColegio } {
  const d = i.decision;
  if (d?.veredicto === "familiar") return { categoria: "Familiar autorizado (no es tutor en GES)", sigue: i.familia?.vigente ? "si" : i.familia ? "no" : "no se sabe" };
  if (d?.veredicto === "no_localizado") return { categoria: "No está en GES (decisión de TI)", sigue: "no se sabe" };
  if (d?.veredicto === "por_confirmar") return { categoria: "Por confirmar con la persona", sigue: "no se sabe" };

  const t = i.tutor, a = i.alumno, p = i.personal;
  const tutorVivo = !!t && t.vigente;
  const personalActivo = !!p && p.vigente && p.activo;
  const papaMama = t ? (t.rol === "madre" ? "Mamá" : "Papá") : "";
  if (personalActivo && tutorVivo) return { categoria: `Personal (${p.cargo || p.area || "sin puesto en GES"}) y ${papaMama.toLowerCase()} de familia vigente`, sigue: "si" };
  if (personalActivo) return { categoria: `Personal: ${p.cargo || p.area || "sin puesto en GES"}`, sigue: "si" };
  if (p && tutorVivo) return { categoria: `Exempleado, ${papaMama.toLowerCase()} de familia vigente`, sigue: "si" };
  if (tutorVivo) return { categoria: `${papaMama} de familia vigente`, sigue: "si" };
  if (a?.vigente) return { categoria: `Alumno de Preparatoria (${a.grupos[0] ?? ""})`, sigue: "si" };
  if (p) return { categoria: `Exempleado${p.fechaBaja ? ` (baja ${fechaCorta(p.fechaBaja)})` : ""}`, sigue: "no" };
  if (t) return { categoria: "Su familia ya no aparece en GES", sigue: "no" };
  if (a) return { categoria: "Ya no aparece como alumno en GES", sigue: "no" };
  if (i.porRevisar.length) return { categoria: "Hay personas parecidas en GES: falta decidir", sigue: "no se sabe" };
  return { categoria: "No localizado en GES", sigue: "no se sabe" };
}

/**
 * Identifica a una persona. `nombres` son los que tiene en SATAG y en ZK (con notas y
 * todo: se limpian aqui); `tarjetas`, todos sus TAGs, para encontrar la decision de TI.
 */
export function identificar(
  persona: { nombres: (string | null | undefined)[]; tarjetas: string[] },
  indice: IndiceGes,
  decisiones: Map<string, IdentidadDecidida>,
): Identificacion {
  const decision = persona.tarjetas.map((t) => decisiones.get(t)).find((d): d is IdentidadDecidida => !!d) ?? null;
  const base = { decision, tutor: null, alumno: null, personal: null, familia: null, porRevisar: [], preguntar: decision?.preguntar ?? false } as Omit<Identificacion, "categoria" | "sigue" | "fuente">;
  const familiaDe = (id: string) => {
    const f = indice.familias.get(id);
    return f ? { id, grupos: f.grupos, vigente: f.tutores.some((t) => t.vigente) } : { id, grupos: [], vigente: false };
  };

  // Familiar, no localizado o por confirmar: TI ya dijo que no es nadie de GES por su
  // nombre, asi que el cruce no se consulta.
  if (decision && decision.veredicto !== "persona") {
    const i = { ...base };
    if (decision.familia) i.familia = familiaDe(decision.familia);
    return { ...i, fuente: "decision", ...rotulo(i) };
  }

  // Por nombre, con todos los nombres que tiene.
  const mismas = new Map<string, PersonaGesGuardada>();
  const parecidas = new Map<string, PersonaGesGuardada>();
  for (const n of persona.nombres) {
    if (!n || palabras(separarNota(n).nombre).length === 0) continue;
    const r = buscarEnGes(indice, n);
    for (const p of r.mismas) mismas.set(p.gesId, p);
    for (const p of r.parecidas) parecidas.set(p.gesId, p);
  }
  const de = (c: ClaseGes[]) => [...mismas.values()].filter((p) => c.includes(p.clase));
  const t = elegir(de(["tutor"])), a = elegir(de(["alumno"])), p = elegir(de(PERSONAL));
  const i = { ...base };
  i.tutor = t.una;
  i.alumno = a.una;
  i.personal = p.una;
  i.porRevisar = [...t.ambigua, ...a.ambigua, ...p.ambigua, ...[...parecidas.values()].filter((x) => !mismas.has(x.gesId))];

  // «Es esta persona»: la decision fija SU clase; las demas siguen saliendo del nombre
  // (quien es personal y ademas papa: TI confirma una y la otra no se pierde). Lo que
  // TI ya resolvio no vuelve a pedirse.
  const decidida = decision?.gesId ? indice.porId.get(decision.gesId) ?? null : null;
  if (decision) {
    if (decidida?.clase === "tutor") i.tutor = decidida;
    else if (decidida?.clase === "alumno") i.alumno = decidida;
    else if (decidida) i.personal = decidida;
    i.porRevisar = [];
  }
  const fam = i.tutor?.familia || i.alumno?.familia;
  if (fam) i.familia = familiaDe(fam);
  const hallo = !!(i.tutor || i.alumno || i.personal);
  return { ...i, fuente: decision ? "decision" : hallo ? "nombre" : "ninguna", ...rotulo(i) };
}

/** Para mostrar el nombre de GES («APELLIDOS NOMBRE» en mayusculas) con mayusculas de titulo. */
export const nombreGes = (p: PersonaGes): string => titulo(p.nombre);
