// Movimientos en ZK (bloque 93): de los renglones de una tanda al archivo que se
// importa en ZK, y los rotulos de cada estado.
//
// El archivo es el mismo que arma el puente (lib/zk/plantillaZk.ts): la plantilla
// oficial con sus anotaciones, «Fila de inicio» 2 y «Actualizar ID: Si». Cada
// renglon lleva el ID de ZK de la persona, para que el import la ACTUALICE: con
// otro ID, ZK crearia a una persona nueva con la misma tarjeta. Lo probado el
// 9-oct: el import cambia departamento y nombre, y no toca los niveles.

import { separarNombre, type FilaZk } from "@/lib/zk/plantillaZk";

/** Lo que devuelve `crear_tanda_zk` por cada TAG de la tanda. */
export interface RenglonTanda {
  tarjeta: string;
  idZk: string;
  nombres: string;
  apellidos: string;
  placa: string;
  /** El destino si el TAG cambia de departamento; si no, el que ya tiene. */
  deptoId: string;
  deptoNombre: string;
  /** El nombre como debe quedar, si la tanda lo corrige; si no, null. */
  nombreDestino: string | null;
}

/**
 * Una fila del import por TAG. Lo que no cambia se manda igual que lo tiene ZK
 * (el import escribe todas las columnas de la fila). La placa va en Celular, como
 * en todo el puente; ZK la tiene ahi o en «Placa Vehicular».
 */
export function filasDeTanda(renglones: RenglonTanda[]): FilaZk[] {
  const sinId = renglones.filter((r) => !r.idZk);
  if (sinId.length > 0) {
    throw new Error(`Faltan los IDs de ZK de ${sinId.map((r) => r.tarjeta).join(", ")}. Suba el export de Usuarios de ZK y vuelva a armar la tanda.`);
  }
  return renglones.map((r) => {
    const nuevo = r.nombreDestino ? separarNombre(r.nombreDestino) : null;
    return {
      id: r.idZk,
      nombre: nuevo ? nuevo.nombre.toUpperCase() : r.nombres,
      apellido: nuevo ? nuevo.apellido.toUpperCase() : r.apellidos,
      deptoId: r.deptoId,
      deptoNombre: r.deptoNombre,
      tarjeta: r.tarjeta,
      celular: r.placa,
    };
  });
}

export type EstadoMovimiento = "pendiente" | "en_tanda" | "hecho" | "verificado" | "no_coincide" | "cancelado";

export const ROTULO_MOVIMIENTO: Record<EstadoMovimiento, string> = {
  pendiente: "Pendiente",
  en_tanda: "En la tanda abierta",
  hecho: "Hecho en ZK, por comprobar",
  verificado: "Verificado en ZK",
  no_coincide: "ZK no coincide",
  cancelado: "Cancelado",
};

/** «E1» -> «ESTACIONAMIENTO 1»: como se llaman los niveles en ZK. */
export const nombreNivel = (n: string): string => `ESTACIONAMIENTO ${n.replace(/^E/, "")}`;
