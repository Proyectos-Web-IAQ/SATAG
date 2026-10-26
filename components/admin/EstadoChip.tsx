import type { EstadoRegistro } from "@/lib/mock/types";
import { rotuloExpediente } from "@/lib/glosario";

// El color sigue al estado de la base; el texto, al estado Y al pago (lib/glosario.ts):
// un pendiente ya cobrado dice «Pagado, por instalar», no «Pendiente de cobro».
export default function EstadoChip({ estado, conPago, deSatag = true }: {
  estado: EstadoRegistro;
  /** Si el expediente tiene un pago vigente. Solo cambia el texto de `pendiente`. */
  conPago: boolean;
  /** false para un expediente migrado del padron historico, que nunca paso por caja. */
  deSatag?: boolean;
}) {
  return <span className={`status-chip status-chip--${estado}`}>{rotuloExpediente(estado, conPago, deSatag)}</span>;
}
