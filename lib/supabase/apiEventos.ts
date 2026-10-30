// La bitacora guardada (`zk_eventos`) para medir sin el archivo: paso 2 de
// Desarrollo/11 (30-oct).
//
// Antes (listEventosZk de apiPanel.ts, 2-oct) se bajaba en paginas de 5,000 con
// OFFSET, una tras otra. OFFSET no salta: la base lee y descarta, asi que cada
// pagina costaba mas que la anterior (de la octava en adelante, Seq Scan y orden
// en disco) y quince viajes en serie se sumaban.
//
// Ahora la ventana se parte en semanas (lib/zk/rangos.ts) y cada semana se pide A
// LA VEZ. Dentro de cada semana se avanza por cursor sobre `ocurrio_en`, que tiene
// indice (bloque 78): cada peticion cuesta lo mismo y la carga tarda lo que la
// semana mas lenta, no la suma.
//
// El cursor es «desde la hora del ultimo evento recibido» (gte), no «despues de»:
// dos eventos con la misma hora partidos entre dos paginas no se pierden, y lo
// repetido se descarta por `id_evento`, que es la llave. Se sigue hasta una pagina
// que no aporte nada nuevo, no hasta una «corta»: produccion sirve 5,000 filas por
// peticion y local 1,000, y asi el tope que aplique no cambia el resultado.
import { supabaseAuth } from "./auth";
import type { EventoZk } from "@/lib/zk/eventos";
import { partirEnTramos, type Rango } from "@/lib/zk/rangos";

const PAGINA = 5000;
/** Seguro declarado por tramo, no limite de negocio: si se toca, `truncado` lo dice. */
const TOPE_PAGINAS_POR_TRAMO = 60;
const COLUMNAS = "id_evento, ocurrio_en, lote, sentido, tarjeta, concedido, repeticion, departamento_evento";

interface Fila {
  id_evento: number; ocurrio_en: string; lote: string; sentido: string; tarjeta: string;
  concedido: boolean; repeticion: boolean; departamento_evento: string | null;
}

const aEvento = (r: Fila): EventoZk => ({
  idEvento: Number(r.id_evento),
  // Postgres devuelve el timestamp sin zona como «2026-09-22T07:18:00»; el parser
  // y la medicion trabajan con «2026-09-22 07:18:00».
  ocurrioEn: String(r.ocurrio_en).replace("T", " ").slice(0, 19),
  lote: r.lote as EventoZk["lote"],
  sentido: r.sentido === "salida" ? "salida" : "entrada",
  tarjeta: r.tarjeta,
  descripcion: "",
  concedido: r.concedido,
  departamentoEvento: r.departamento_evento ?? "",
  repeticion: r.repeticion,
});

async function bajarTramo(
  tramo: Rango,
  onNuevos: (n: number) => void,
): Promise<{ eventos: EventoZk[]; truncado: boolean; peticiones: number }> {
  const eventos: EventoZk[] = [];
  const vistos = new Set<number>();
  let cursor = tramo.desde;
  let peticiones = 0;
  for (;;) {
    if (peticiones >= TOPE_PAGINAS_POR_TRAMO) return { eventos, truncado: true, peticiones };
    let q = supabaseAuth
      .from("zk_eventos")
      .select(COLUMNAS)
      .gte("ocurrio_en", cursor)
      .order("ocurrio_en", { ascending: true })
      .order("id_evento", { ascending: true })
      .limit(PAGINA);
    if (tramo.hasta) q = q.lt("ocurrio_en", tramo.hasta);
    const { data, error } = await q;
    peticiones += 1;
    if (error) throw new Error(`No se pudo leer la bitácora guardada (${error.message}).`);
    const filas = (data ?? []) as unknown as Fila[];
    let nuevos = 0;
    for (const f of filas) {
      const id = Number(f.id_evento);
      if (vistos.has(id)) continue;
      vistos.add(id);
      eventos.push(aEvento(f));
      nuevos += 1;
    }
    if (nuevos > 0) onNuevos(nuevos);
    if (filas.length === 0 || nuevos === 0) return { eventos, truncado: false, peticiones };
    cursor = String(filas[filas.length - 1].ocurrio_en);
  }
}

/**
 * Los eventos guardados entre `desde` (hora de pared, inclusive) y lo que haya
 * despues: `hasta` solo sirve para partir en semanas, el ultimo tramo queda abierto
 * como antes. Trae solo lo que la medicion usa; `descripcion` no se guarda y se
 * devuelve vacia. `onAvance` recibe el total bajado hasta ese momento, en el orden
 * en que llegan las paginas de todos los tramos; el orden final lo pone
 * `lecturaDesdeBase`, que ordena y marca repeticiones sobre la union.
 */
export async function listEventosZk(
  rango: { desde: string; hasta: string | null },
  onAvance?: (filas: number) => void,
): Promise<{ eventos: EventoZk[]; truncado: boolean; peticiones: number }> {
  let total = 0;
  const partes = await Promise.all(
    partirEnTramos(rango.desde, rango.hasta).map((tramo) =>
      bajarTramo(tramo, (n) => {
        total += n;
        onAvance?.(total);
      }),
    ),
  );
  return {
    eventos: partes.flatMap((p) => p.eventos),
    truncado: partes.some((p) => p.truncado),
    peticiones: partes.reduce((s, p) => s + p.peticiones, 0),
  };
}
