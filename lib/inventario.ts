// Que TAGs del inventario se ofrecen como botones al instalar.
//
// EL PROBLEMA QUE RESUELVE (reportado el 29-sep desde el campo). La pantalla
// mostraba los primeros 12 disponibles y nada mas: sin boton para ver el resto y
// sin forma de buscar. Si el TAG que TI tenia fisicamente en la mano no estaba
// entre esos 12, habia que teclear el numero a mano, mirando la etiqueta. Con el
// inventario creciendo, eso pasa cada vez mas seguido.
//
// Teclear a mano no rompe nada —el RPC reclama el TAG del inventario si existe y
// si no instala igual, que es como se instalaba antes del bloque 52— pero es
// friccion diaria en el unico momento del proceso en que TI esta de pie, con el
// TAG en una mano y el telefono en la otra.

export const TOPE_CHIPS = 12;

export interface ListaChips {
  visibles: string[];
  // Cuantos quedaron fuera del tope. Alimenta el boton «ver los N restantes».
  ocultos: number;
  // Se escribio algo y ningun TAG del inventario coincide. NO es un error: puede
  // ser el TAG propio de una familia o uno anterior al inventario. La pantalla
  // lo dice sin bloquear la captura.
  sinCoincidencias: boolean;
}

export function chipsDisponibles(
  disponibles: string[],
  filtro: string,
  verTodos: boolean,
  tope: number = TOPE_CHIPS,
): ListaChips {
  const f = filtro.trim();
  // `includes` y no `startsWith`: quien mira la etiqueta del TAG suele teclear
  // los ultimos digitos, que son los que cambian entre uno y otro.
  const coinciden = f ? disponibles.filter((n) => n.includes(f)) : disponibles;
  const visibles = verTodos ? coinciden : coinciden.slice(0, tope);
  return {
    visibles,
    ocultos: coinciden.length - visibles.length,
    sinCoincidencias: f !== "" && coinciden.length === 0 && disponibles.length > 0,
  };
}
