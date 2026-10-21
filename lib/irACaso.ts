// Un caso que otra vista pidio abrir en el tablero de Casos (21-oct: «Abrir el
// caso» desde Reportes de la caseta). Vive en memoria, como la ultima vista de
// Consulta: el tablero lo toma una sola vez al montarse.
let pedido: number | null = null;

export function pedirCaso(numero: number): void {
  pedido = numero;
}

export function tomarCasoPedido(): number | null {
  const n = pedido;
  pedido = null;
  return n;
}
