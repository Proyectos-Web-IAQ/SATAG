import type { EstadoRegistro } from "@/lib/mock/types";

export default function EstadoChip({ estado }: { estado: EstadoRegistro }) {
  const txt = { pendiente: "Pendiente", activo: "Activo", baja: "Baja", bloqueado: "Bloqueado" }[estado];
  return <span className={`status-chip status-chip--${estado}`}>{txt}</span>;
}
