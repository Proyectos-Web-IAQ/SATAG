// Los casos del estacionamiento: lo que no cuadra entre la pluma, ZK y SATAG y que
// una persona tiene que mirar.
//
// POR QUE EXISTE ESTE ARCHIVO. Hasta el 5-oct-2026 cada pantalla calculaba su parte
// por su lado (el letrero de «ningun padron», el aviso de BAJAS en Personas, «Lo que
// no cuadra» en la ficha) y nada decia que se habia hecho con cada cosa. Aqui se
// calculan TODOS, con una clave estable cada uno, para que la base guarde lo que una
// persona decidio (bloque 87, `casos_seguimiento`) y la pantalla lo junte.
//
// LOS CASOS NO SE GUARDAN: se recalculan con lo que haya en la bitacora. Uno que deja
// de ocurrir desaparece solo; uno resuelto que vuelve a pasar se marca como tal.
//
// Es una funcion pura: recibe la bitacora, los expedientes y el padron de ZK, y no
// sabe de React ni de Supabase. Asi se prueba con datos del tamaño de una prueba.
import type { EventoZk } from "@/lib/zk/eventos";
import { nombreDepto } from "@/lib/zk/padron";

export type TipoCaso =
  | "rechazo-diario"
  | "vivo-en-bajas"
  | "baja-que-abre"
  | "tag-anterior-abre"
  | "abre-sin-expediente"
  | "sin-padron"
  | "sin-uso";

/** Lo que el calculo necesita de un expediente. */
export interface ExpedienteCaso {
  folio: string;
  noDispositivo: string;
  estado: string;
  estacionamientos: string[];
  tagsAnteriores: string[];
  /** Desde cuando el expediente puede abrir: instalacion o, si no consta, alta («2026-09-14»). */
  desde?: string | null;
}

/** Lo que el calculo necesita de una persona de ZK. */
export interface PersonaCaso {
  nombre: string;
  departamento: string;
}

export interface Caso {
  /** tipo:tarjeta[:lote]. La llave de `casos_seguimiento`; no cambia mientras el caso sea el mismo. */
  clave: string;
  tipo: TipoCaso;
  tarjeta: string;
  lote: string | null;
  /** El expediente al que toca, si tiene. */
  folio: string | null;
  /** Lo que se vio, en una frase. */
  detalle: string;
  /** Primera y ultima vez que paso, como las da ZK («2026-10-02 08:19:24»). */
  desde: string;
  ultima: string;
  /** En cuantos dias distintos paso. */
  dias: number;
  /** Cuantas veces: rechazos o aperturas, segun el tipo. */
  veces: number;
  /** Solo «sin-uso»: el semaforo. Rojo, 14 dias o mas sin abrir; amarillo, de 7 a 13. */
  nivel?: "rojo" | "amarillo";
}

/** El orden en que se presentan: primero lo que afecta a alguien todos los dias. */
export const TIPOS_CASO: { tipo: TipoCaso; titulo: string; queHacer: string }[] = [
  {
    tipo: "rechazo-diario",
    titulo: "La pluma le niega el paso",
    queHacer: "Tiene expediente vivo y la pluma lo rechaza en días distintos. Decidir si se le da ese estacionamiento en ZK o se le avisa que use el suyo.",
  },
  {
    tipo: "vivo-en-bajas",
    titulo: "Expediente vivo que en ZK está en BAJAS",
    queHacer: "SATAG lo tiene activo y ZK lo dio de baja. Confirmar cuál de los dos tiene razón y corregir el otro.",
  },
  {
    tipo: "baja-que-abre",
    titulo: "Dado de baja en SATAG y su TAG sigue abriendo",
    queHacer: "El expediente está de baja pero la pluma le abre. Quitarle el acceso en ZK o reactivar el expediente.",
  },
  {
    tipo: "tag-anterior-abre",
    titulo: "Un TAG que ya se cambió sigue abriendo",
    queHacer: "Es el TAG anterior de un expediente. Si ya no debe abrir, darlo de baja en ZK.",
  },
  {
    tipo: "abre-sin-expediente",
    titulo: "Abre la pluma y no tiene expediente",
    queHacer: "Está en ZK pero no entró solo a SATAG (BAJAS, STOCK o sin nombre). Revisar en ZK de quién es.",
  },
  {
    tipo: "sin-padron",
    titulo: "Credencial que no está en ningún padrón",
    queHacer: "Ni SATAG ni ZK saben de quién es. Si se averigua, registrarla en el expediente de su dueño.",
  },
  {
    tipo: "sin-uso",
    titulo: "Expediente vivo que no abre la pluma: candidatos a baja",
    queHacer: "Rojo: 14 días o más sin abrir la pluma, o nunca desde el 22-sep. Amarillo: de 7 a 13 días. Solo son candidatos: confirmar con la persona o con Administración antes de dar de baja.",
  },
];

// Un rechazo pegado a la apertura de OTRA tarjeta en el mismo lote es casi siempre un
// coche con dos TAG: el lector leyo el que no tiene derecho y luego el que si, y el
// coche paso. En la conciliacion del 5-oct fueron 366 de 808 rechazos. No es un
// rechazo que le haya pasado a una persona, y contarlo llenaria la lista de ruido.
const PEGADO_SEG = 15;
// Un solo dia de rechazo puede ser un error del lector; dos dias distintos ya es un patron.
const DIAS_MINIMOS_RECHAZO = 2;

// El primer dia valido de la bitacora (Gerardo, 5-oct): lo anterior al 22-sep no
// cuenta como uso. Y el semaforo de «sin uso», en dias.
export const PRIMER_DIA_VALIDO = "2026-09-22";
const AMARILLO_DIAS = 7;
const ROJO_DIAS = 14;

const dia = (t: string) => t.slice(0, 10);
const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(`${b.slice(0, 10)}T12:00:00`) - Date.parse(`${a.slice(0, 10)}T12:00:00`)) / 86400000);
const segundos = (t: string) => Date.parse(t.replace(" ", "T")) / 1000;

interface Uso {
  primera: string;
  ultima: string;
  dias: Set<string>;
  veces: number;
}

function acumular(m: Map<string, Uso>, clave: string, t: string) {
  const u = m.get(clave);
  if (!u) {
    m.set(clave, { primera: t, ultima: t, dias: new Set([dia(t)]), veces: 1 });
    return;
  }
  if (t < u.primera) u.primera = t;
  if (t > u.ultima) u.ultima = t;
  u.dias.add(dia(t));
  u.veces += 1;
}

const fechaLarga = (t: string) => {
  const [a, m, d] = t.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d, 12).toLocaleDateString("es-MX", { day: "numeric", month: "long" });
};

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-MX")} ${n === 1 ? uno : varios}`;

export function detectarCasos(
  eventos: EventoZk[],
  expedientes: ExpedienteCaso[],
  personas: Map<string, PersonaCaso> | null,
): Caso[] {
  const vivos = new Map<string, ExpedienteCaso>();
  const bajas = new Map<string, ExpedienteCaso>();
  for (const x of expedientes) {
    if (!x.noDispositivo) continue;
    if (x.estado === "baja") bajas.set(x.noDispositivo, x);
    else vivos.set(x.noDispositivo, x);
  }
  const anteriores = new Map<string, ExpedienteCaso>();
  for (const x of expedientes) {
    for (const t of x.tagsAnteriores) if (!vivos.has(t) && !anteriores.has(t)) anteriores.set(t, x);
  }

  // Aperturas por tarjeta, y por lote los segundos de cada apertura (de cualquier
  // tarjeta) para saber si un rechazo quedo pegado a una.
  const aperturas = new Map<string, Uso>();
  const abrioEn = new Map<string, number[]>();
  for (const e of eventos) {
    if (!e.concedido || e.repeticion) continue;
    acumular(aperturas, e.tarjeta, e.ocurrioEn);
    const l = abrioEn.get(e.lote) ?? [];
    l.push(segundos(e.ocurrioEn));
    abrioEn.set(e.lote, l);
  }
  for (const l of abrioEn.values()) l.sort((a, b) => a - b);
  const pegado = (lote: string, t: string) => {
    const l = abrioEn.get(lote);
    if (!l || l.length === 0) return false;
    const s = segundos(t);
    let lo = 0;
    let hi = l.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (l[mid] < s - PEGADO_SEG) lo = mid + 1;
      else hi = mid;
    }
    return lo < l.length && l[lo] <= s + PEGADO_SEG;
  };

  const casos: Caso[] = [];
  const caso = (tipo: TipoCaso, tarjeta: string, lote: string | null, folio: string | null, u: Uso, detalle: string) =>
    casos.push({
      clave: `${tipo}:${tarjeta}${lote ? `:${lote}` : ""}`,
      tipo,
      tarjeta,
      lote,
      folio,
      detalle,
      desde: u.primera,
      ultima: u.ultima,
      dias: u.dias.size,
      veces: u.veces,
    });

  // 1. RECHAZOS. Solo de expedientes vivos: a quien no tiene expediente lo cubren los
  // casos de abajo, y que la pluma le niegue el paso es lo esperado.
  const rechazos = new Map<string, Uso>();
  for (const e of eventos) {
    if (e.concedido || e.repeticion || !vivos.has(e.tarjeta)) continue;
    if (pegado(e.lote, e.ocurrioEn)) continue;
    acumular(rechazos, `${e.tarjeta}|${e.lote}`, e.ocurrioEn);
  }
  for (const [k, u] of rechazos) {
    if (u.dias.size < DIAS_MINIMOS_RECHAZO) continue;
    const [tarjeta, lote] = k.split("|");
    const x = vivos.get(tarjeta)!;
    const sinDerecho = !x.estacionamientos.includes(lote);
    caso(
      "rechazo-diario",
      tarjeta,
      lote,
      x.folio,
      u,
      `La pluma del ${lote} le negó el paso ${plural(u.veces, "vez", "veces")} en ${plural(u.dias.size, "día", "días")}${sinDerecho ? `; SATAG tampoco le da el ${lote}` : `; SATAG sí le da el ${lote}, así que el error está en ZK`}.`,
    );
  }

  // 2 a 6. LAS APERTURAS, segun de quien es la tarjeta.
  for (const [tarjeta, u] of aperturas) {
    const p = personas?.get(tarjeta);
    const vivo = vivos.get(tarjeta);
    if (vivo) {
      if (p && nombreDepto(p.departamento) === "BAJAS") {
        caso("vivo-en-bajas", tarjeta, null, vivo.folio, u, `En ZK está en BAJAS y abrió la pluma ${plural(u.veces, "vez", "veces")}.`);
      }
      continue;
    }
    const baja = bajas.get(tarjeta);
    if (baja) {
      caso("baja-que-abre", tarjeta, null, baja.folio, u, `Expediente de baja; su TAG abrió la pluma ${plural(u.veces, "vez", "veces")}.`);
      continue;
    }
    const dueno = anteriores.get(tarjeta);
    if (dueno) {
      caso(
        "tag-anterior-abre",
        tarjeta,
        null,
        dueno.folio,
        u,
        `Es un TAG anterior de ${dueno.folio}, que hoy usa el ${dueno.noDispositivo || "—"}; abrió ${plural(u.veces, "vez", "veces")}.`,
      );
      continue;
    }
    if (p) {
      caso(
        "abre-sin-expediente",
        tarjeta,
        null,
        null,
        u,
        `En ZK: ${p.nombre || "sin nombre"}, ${p.departamento || "sin departamento"}. Abrió ${plural(u.veces, "vez", "veces")}.`,
      );
      continue;
    }
    caso(
      personas ? "sin-padron" : "abre-sin-expediente",
      tarjeta,
      null,
      null,
      u,
      personas
        ? `Ni SATAG ni ZK la conocen; abrió ${plural(u.veces, "vez", "veces")}.`
        : `Sin expediente en SATAG; abrió ${plural(u.veces, "vez", "veces")}. Falta el padrón de ZK para saber de quién es.`,
    );
  }

  // 7. SIN USO. El expediente vivo cuyo TAG (vigente o anterior) no abre la pluma.
  // Se mide contra el ultimo dia que tiene la bitacora, no contra hoy: si falta
  // subir una semana de ZK, nadie debe salir en rojo por eso.
  const hasta = eventos.reduce((m, e) => (e.ocurrioEn > m ? e.ocurrioEn : m), "");
  if (hasta) {
    const rechazosPorTarjeta = new Map<string, number>();
    for (const e of eventos) {
      if (e.concedido || e.repeticion || e.ocurrioEn < PRIMER_DIA_VALIDO) continue;
      rechazosPorTarjeta.set(e.tarjeta, (rechazosPorTarjeta.get(e.tarjeta) ?? 0) + 1);
    }
    const ultimaDe = (x: ExpedienteCaso) =>
      [x.noDispositivo, ...x.tagsAnteriores]
        .map((t) => aperturas.get(t)?.ultima ?? "")
        .filter((t) => t >= PRIMER_DIA_VALIDO)
        .sort()
        .pop() ?? null;
    for (const x of vivos.values()) {
      const ultima = ultimaDe(x);
      const base = ultima ?? [PRIMER_DIA_VALIDO, (x.desde ?? "").slice(0, 10)].sort().pop()!;
      const sinAbrir = diasEntre(base, hasta);
      if (sinAbrir < AMARILLO_DIAS) continue;
      const rechazosDe = rechazosPorTarjeta.get(x.noDispositivo) ?? 0;
      casos.push({
        clave: `sin-uso:${x.noDispositivo}`,
        tipo: "sin-uso",
        tarjeta: x.noDispositivo,
        lote: null,
        folio: x.folio,
        detalle:
          (ultima
            ? `No abre la pluma desde el ${fechaLarga(ultima)}: ${plural(sinAbrir, "día", "días")}.`
            : `No ha abierto la pluma ni una vez desde el ${fechaLarga(base)}: ${plural(sinAbrir, "día", "días")}.`) +
          (rechazosDe > 0 ? ` La pluma lo rechazó ${plural(rechazosDe, "vez", "veces")}.` : ""),
        desde: base,
        ultima: ultima ?? "",
        dias: sinAbrir,
        veces: rechazosDe,
        nivel: sinAbrir >= ROJO_DIAS ? "rojo" : "amarillo",
      });
    }
  }

  const orden = new Map(TIPOS_CASO.map((t, i) => [t.tipo, i]));
  return casos.sort(
    (a, b) =>
      orden.get(a.tipo)! - orden.get(b.tipo)! ||
      // En «sin uso», primero el que lleva mas dias sin abrir.
      (a.tipo === "sin-uso" ? b.dias - a.dias : 0) ||
      (a.ultima < b.ultima ? 1 : a.ultima > b.ultima ? -1 : 0),
  );
}

export type EstadoCaso = "pendiente" | "revision" | "resuelto";

export interface SeguimientoCaso {
  clave: string;
  estado: EstadoCaso;
  nota: string;
  actualizadoPor: string;
  actualizadoEn: string;
}

/**
 * El estado que se muestra. Un caso resuelto que volvio a pasar DESPUES de que se
 * dio por resuelto regresa a pendiente: la nota se conserva para saber que se hizo.
 *
 * La hora de ZK es hora de pared de Queretaro sin zona; la del seguimiento es
 * timestamptz. Se comparan las dos en hora de Queretaro, con el mismo formato.
 */
// «sv-SE» escribe «2026-10-05 11:38:06»: el mismo formato que la hora de ZK.
const HORA_QRO = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Mexico_City",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hour12: false,
});

export function estadoVisible(c: Caso, s: SeguimientoCaso | undefined): { estado: EstadoCaso; volvio: boolean } {
  if (!s) return { estado: "pendiente", volvio: false };
  if (s.estado !== "resuelto") return { estado: s.estado, volvio: false };
  const resueltoLocal = HORA_QRO.format(new Date(s.actualizadoEn));
  return c.ultima > resueltoLocal ? { estado: "pendiente", volvio: true } : { estado: "resuelto", volvio: false };
}
