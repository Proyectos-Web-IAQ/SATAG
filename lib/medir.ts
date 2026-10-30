// Tiempos por estacion (paso 0 de Desarrollo/11, 30-oct): la misma vara antes y
// despues de cada cambio, en produccion y sin herramientas extra.
//
// Cada tiempo se anota dos veces: como `performance.measure`, que DevTools ›
// Performance dibuja en su carril «Timings», y en la consola con un prefijo fijo
// para filtrar («satag · tiempos»). Si «medir el estacionamiento» aparece cada vez
// que se escribe una letra, la memorizacion no esta sirviendo; si aparece una vez
// por carga, si.

const PREFIJO = "satag · tiempos";

/** Anota cuanto tardo algo que ya termino. `ms` sale de `performance.now()`. */
export function anotarTiempo(que: string, ms: number, detalle = ""): void {
  try {
    performance.measure(`${PREFIJO} · ${que}`, { start: performance.now() - ms, duration: ms });
  } catch {
    // Un navegador viejo sin measure con opciones: la consola basta.
  }
  console.info(`[${PREFIJO}] ${que}: ${Math.round(ms).toLocaleString("es-MX")} ms${detalle ? ` · ${detalle}` : ""}`);
}
