// Los vehiculos del Instituto (ZK «INSTITUCIONALES», 13-oct-2026) operan al reves:
// duermen dentro, SALEN a una diligencia y REGRESAN. Para ellos lo que se dibuja no
// es la estancia (entrada -> salida) sino la salida (salida -> regreso): «salió
// 10:11, volvió 15:20». Aqui no hay React ni Supabase, para probarlo con datos del
// tamano de una prueba.

import { REPETICION_ESTANCIA_MIN } from "@/lib/estacionamiento";
import type { EventoZk } from "@/lib/zk/eventos";

/** Una salida del vehiculo: por donde salio y cuando, y por donde y cuando volvio. `null` = esa lectura falta. */
export interface SalidaVehiculo {
  dia: string;
  salio: { minuto: number; lote: string } | null;
  volvio: { minuto: number; lote: string } | null;
}

const minutoDe = (e: EventoZk) =>
  Number(e.ocurrioEn.slice(11, 13)) * 60 + Number(e.ocurrioEn.slice(14, 16)) + Number(e.ocurrioEn.slice(17, 19)) / 60;

/**
 * Empareja cada salida con el siguiente regreso del mismo dia, por la pluma que sea
 * (sale por E2 y vuelve por E1 es una sola diligencia). La misma lectura otra vez a
 * menos de `REPETICION_ESTANCIA_MIN` se ignora, como en `emparejarEstancias`.
 */
export function salidasDelVehiculo(eventos: EventoZk[]): SalidaVehiculo[] {
  const porDia = new Map<string, EventoZk[]>();
  for (const e of eventos) {
    if (!e.concedido || e.repeticion || (e.sentido !== "entrada" && e.sentido !== "salida")) continue;
    const d = e.ocurrioEn.slice(0, 10);
    porDia.set(d, [...(porDia.get(d) ?? []), e]);
  }
  const out: SalidaVehiculo[] = [];
  for (const [dia, l] of [...porDia.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const orden = [...l].sort((a, b) => minutoDe(a) - minutoDe(b));
    let abierta: SalidaVehiculo | null = null;
    let previo: EventoZk | null = null;
    for (const e of orden) {
      if (previo && previo.sentido === e.sentido && minutoDe(e) - minutoDe(previo) <= REPETICION_ESTANCIA_MIN) continue;
      previo = e;
      const paso = { minuto: minutoDe(e), lote: e.lote };
      if (e.sentido === "salida") {
        // Dos salidas seguidas: no se leyo el regreso de la primera.
        if (abierta) out.push(abierta);
        abierta = { dia, salio: paso, volvio: null };
      } else if (abierta) {
        abierta.volvio = paso;
        out.push(abierta);
        abierta = null;
      } else {
        // Volvio sin que se leyera su salida (salio otro dia, o no se leyo).
        out.push({ dia, salio: null, volvio: paso });
      }
    }
    if (abierta) out.push(abierta);
  }
  return out;
}
