// La calle guardada en SATAG (bloque 107): cargar las muestras del muestreador y leerlas.
import { supabaseAuth } from "./auth";
import { RUTAS_VIAL, type MuestraVial } from "@/lib/vial/trayectos";

const LOTE = 1000;
const PAGINA = 1000;

/** Carga por lotes. Idempotente: lo que ya estaba se cuenta en `yaEstaban` y no se toca. */
export async function cargarMuestrasVial(
  muestras: MuestraVial[],
  hechoPor: string | null,
  onAvance?: (hechas: number, total: number) => void,
): Promise<{ insertadas: number; yaEstaban: number }> {
  let insertadas = 0;
  let yaEstaban = 0;
  for (let i = 0; i < muestras.length; i += LOTE) {
    const { data, error } = await supabaseAuth.rpc("cargar_muestras_vial", {
      p_rutas: RUTAS_VIAL,
      p_filas: muestras.slice(i, i + LOTE),
      p_hecho_por: hechoPor,
    });
    if (error) throw new Error(`No se pudo guardar la calle (${error.message}).`);
    const r = data as { insertadas?: number; yaEstaban?: number };
    insertadas += r?.insertadas ?? 0;
    yaEstaban += r?.yaEstaban ?? 0;
    onAvance?.(Math.min(i + LOTE, muestras.length), muestras.length);
  }
  return { insertadas, yaEstaban };
}

/** Las muestras guardadas desde una fecha. null si la tabla todavía no existe (bloque 107 sin aplicar). */
export async function listMuestrasVial(desde: string): Promise<MuestraVial[] | null> {
  const out: MuestraVial[] = [];
  for (let p = 0; p < 200; p++) {
    const { data, error } = await supabaseAuth
      .from("vial_muestras")
      .select("ruta_id, fecha, ranura, duracion_s, libre_s")
      .gte("fecha", desde)
      .order("fecha", { ascending: true })
      .order("ranura", { ascending: true })
      .order("ruta_id", { ascending: true })
      .range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) {
      if (/vial_muestras|does not exist|schema cache/i.test(error.message)) return null;
      throw new Error(`No se pudo leer la calle guardada (${error.message}).`);
    }
    const filas = (data ?? []) as { ruta_id: string; fecha: string; ranura: string; duracion_s: number; libre_s: number }[];
    for (const f of filas) out.push({ rutaId: f.ruta_id, fecha: String(f.fecha).slice(0, 10), ranura: f.ranura, duracionS: f.duracion_s, libreS: f.libre_s });
    if (filas.length < PAGINA) break;
  }
  return out;
}
