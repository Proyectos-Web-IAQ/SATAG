// A quien se le reporta un caso: buscar por nombre, TAG, placa, folio o vehiculo
// (Gerardo, 7-oct: «que sea un buscador por nombre o por tag o por placa e incluso
// por modelo del carro»).
//
// Junta por TAG lo que dicen el expediente de SATAG y el padron de ZK: una persona
// sin expediente (solo en ZK) tambien se puede reportar por su TAG. Sin React ni
// Supabase: se prueba con datos chicos.

export interface CandidatoCaso {
  tarjeta: string;
  /** El expediente de SATAG, si lo tiene: el caso se liga a el. */
  registroId: string | null;
  folio: string | null;
  estado: string | null;
  nombre: string;
  placas: string;
  vehiculo: string;
  departamentoZk: string;
  /** El texto en que se busca, ya normalizado. */
  indice: string;
}

/** Minusculas, sin acentos ni signos: «Peña-Núñez» y «pena nunez» empatan. */
export function normalizarBusqueda(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Placa sin espacios ni guiones, para que «UKL-661-F» encuentre «UKL661F». */
const placaCompacta = (p: string) => p.replace(/[^0-9A-Za-z]/g, "").toLowerCase();

export function construirCandidatos(
  padron: { id?: string | null; folio: string; noDispositivo: string; estado: string; nombre?: string | null; placas?: string | null; marca?: string | null; modelo?: string | null; color?: string | null }[],
  zk: Map<string, { nombre: string; departamento: string; placa: string }> | null,
): CandidatoCaso[] {
  const porTag = new Map<string, CandidatoCaso>();
  const limpio = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    return t.toLowerCase() === "sin registrar" ? "" : t;
  };
  for (const p of padron) {
    if (!p.noDispositivo) continue;
    const ya = porTag.get(p.noDispositivo);
    // Si un TAG tuvo dos expedientes, manda el vivo.
    if (ya && ya.estado !== "baja" && p.estado === "baja") continue;
    porTag.set(p.noDispositivo, {
      tarjeta: p.noDispositivo,
      registroId: p.id ?? null,
      folio: p.folio,
      estado: p.estado,
      nombre: limpio(p.nombre),
      placas: limpio(p.placas).toUpperCase(),
      vehiculo: [limpio(p.marca), limpio(p.modelo), limpio(p.color)].filter(Boolean).join(" "),
      departamentoZk: "",
      indice: "",
    });
  }
  for (const [tarjeta, z] of zk ?? []) {
    const c = porTag.get(tarjeta) ?? {
      tarjeta, registroId: null, folio: null, estado: null, nombre: "", placas: "", vehiculo: "", departamentoZk: "", indice: "",
    };
    c.departamentoZk = z.departamento;
    if (!c.nombre) c.nombre = z.nombre;
    porTag.set(tarjeta, c);
    // El nombre y la placa de ZK tambien se buscan aunque el expediente diga otra
    // cosa: con errores de captura («Betancour» / «Betancourt») se encuentra por los dos.
    if (z.nombre && normalizarBusqueda(z.nombre) !== normalizarBusqueda(c.nombre)) c.indice += ` ${normalizarBusqueda(z.nombre)}`;
    if (z.placa && placaCompacta(z.placa) !== placaCompacta(c.placas)) c.indice += ` ${placaCompacta(z.placa)}`;
  }
  for (const c of porTag.values()) {
    c.indice = normalizarBusqueda(`${c.nombre} ${c.tarjeta} ${c.folio ?? ""} ${c.placas} ${c.vehiculo}`) + ` ${placaCompacta(c.placas)}` + c.indice;
  }
  return [...porTag.values()];
}

/**
 * Los candidatos que empatan con lo que se escribio: TODAS las palabras tienen que
 * aparecer (en cualquier orden). Primero los que empatan TAG, placa o folio exactos,
 * luego los vivos, luego por nombre.
 */
export function buscarCandidatos(lista: CandidatoCaso[], q: string, max = 8): CandidatoCaso[] {
  const t = normalizarBusqueda(q);
  if (t.length < 2) return [];
  const palabras = t.split(" ");
  const exacto = (c: CandidatoCaso) =>
    c.tarjeta === t || placaCompacta(c.placas) === placaCompacta(q) || normalizarBusqueda(c.folio ?? "") === t;
  return lista
    .filter((c) => palabras.every((p) => c.indice.includes(p)))
    .sort((a, b) =>
      Number(exacto(b)) - Number(exacto(a)) ||
      Number(b.estado !== null && b.estado !== "baja") - Number(a.estado !== null && a.estado !== "baja") ||
      a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, max);
}
