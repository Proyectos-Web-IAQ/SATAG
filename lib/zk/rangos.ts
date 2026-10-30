// Como se parte la ventana de la bitacora para bajarla por tramos a la vez (paso 2
// de Desarrollo/11, 30-oct). Funciones puras: se prueban sin red.

export interface Rango {
  /** «AAAA-MM-DD HH:MM:SS», la forma de `ocurrio_en` (hora de pared del controlador). */
  desde: string;
  /** Exclusivo. `null` en el ultimo tramo: lo posterior al ultimo archivo tambien entra, como antes. */
  hasta: string | null;
}

const DIA_MS = 86_400_000;
const medianoche = (iso: string): number => Date.parse(iso.slice(0, 10) + "T00:00:00Z");
const forma = (t: number): string => new Date(t).toISOString().slice(0, 10) + " 00:00:00";

/**
 * Parte [desde, hasta] en tramos de `dias` dias, de medianoche a medianoche. El
 * ultimo tramo queda abierto por arriba. Si `hasta` es null o no va despues de
 * `desde`, es un solo tramo abierto. Con 56 dias y tramos de 7 salen 9 peticiones
 * como minimo (8 semanas cerradas y la cola abierta).
 */
export function partirEnTramos(desde: string, hasta: string | null, dias = 7): Rango[] {
  const d0 = medianoche(desde);
  const fin = hasta ? medianoche(hasta) : d0;
  if (Number.isNaN(d0) || dias <= 0) return [{ desde, hasta: null }];
  const tramos: Rango[] = [];
  for (let t = d0; ; t += dias * DIA_MS) {
    const siguiente = t + dias * DIA_MS;
    if (Number.isNaN(fin) || siguiente > fin) {
      tramos.push({ desde: forma(t), hasta: null });
      break;
    }
    tramos.push({ desde: forma(t), hasta: forma(siguiente) });
  }
  return tramos;
}
