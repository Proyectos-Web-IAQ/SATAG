import type { EstadoRegistro } from "@/lib/mock/types";
import { ESTADO_EXPEDIENTE } from "@/lib/glosario";

export default function EstadoChip({ estado }: { estado: EstadoRegistro }) {
  return <span className={`status-chip status-chip--${estado}`}>{ESTADO_EXPEDIENTE[estado]}</span>;
}
