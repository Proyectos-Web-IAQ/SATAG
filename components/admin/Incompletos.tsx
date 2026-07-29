"use client";

import type { MotivoIncompleto, RegistroIncompleto } from "@/lib/mock/types";
import EstadoChip from "@/components/admin/EstadoChip";

// CC-02 · Reporte de expedientes incompletos.
//
// Es de sólo lectura a propósito: aquí se ve QUÉ falta y QUIÉN lo resuelve, no
// se arregla. Cada faltante se corrige en la pantalla donde vive su acción
// (Administración cobra; TI instala, asigna estacionamiento y actualiza datos),
// que es donde están las confirmaciones y la bitácora.

// Etiqueta de cada motivo. Los códigos los emite `v_registros_incompletos`
// (bloque 45); si allá se agrega uno nuevo, agréguelo también aquí.
export const MOTIVO_LABEL: Record<MotivoIncompleto, string> = {
  tag_sin_pago: "TAG instalado sin pago",
  activo_sin_tag: "Activo sin No. de TAG",
  tag_sin_estacionamiento: "TAG sin estacionamiento",
  vehiculo_incompleto: "Datos del vehículo incompletos",
  sin_placas: "Sin placas capturadas",
  sin_pago: "Sin pago desde el alta",
  sin_instalar: "Pagado y sin instalar",
};

// Quién lo resuelve. Es lo que convierte la lista en trabajo repartible.
export const MOTIVO_RESPONSABLE: Record<MotivoIncompleto, "Administración" | "TI"> = {
  tag_sin_pago: "Administración",
  activo_sin_tag: "TI",
  tag_sin_estacionamiento: "TI",
  vehiculo_incompleto: "TI",
  sin_placas: "TI",
  sin_pago: "Administración",
  sin_instalar: "TI",
};

// Tono del chip:
//   alert = el expediente está roto (los RPC no pueden producir ese estado;
//           si aparece, algo se escribió por fuera del panel).
//   warn  = falta información o alguien tiene que dar seguimiento.
const MOTIVO_TONO: Record<MotivoIncompleto, "alert" | "warn"> = {
  tag_sin_pago: "alert",
  activo_sin_tag: "alert",
  tag_sin_estacionamiento: "alert",
  vehiculo_incompleto: "alert",
  sin_placas: "warn",
  sin_pago: "warn",
  sin_instalar: "warn",
};

// Explicación de cada motivo, para que quien lo lea sepa qué hacer sin manual.
export const MOTIVO_AYUDA: Record<MotivoIncompleto, string> = {
  tag_sin_pago: "El TAG ya está instalado pero no hay ningún pago registrado. Verifíquelo con Administración.",
  activo_sin_tag: "El expediente está activo pero no tiene número de dispositivo. Capture el TAG o corrija el estado.",
  tag_sin_estacionamiento: "El TAG está instalado sin acceso a ningún estacionamiento: no abre la pluma. Asigne el estacionamiento desde «Actualizar datos».",
  vehiculo_incompleto: "Falta la marca o el color del vehículo. Complételos desde «Actualizar datos».",
  sin_placas: "El vehículo entró con permiso o recién comprado y sigue sin placas. Pídalas cuando la familia ya las tenga.",
  sin_pago: "El alta lleva más de una semana sin que nadie cobre el TAG. Confirme si la familia sigue interesada.",
  sin_instalar: "Se cobró hace más de una semana y el TAG nunca se instaló. Busque a la persona para citarla.",
};

const ORDEN_MOTIVOS: MotivoIncompleto[] = [
  "tag_sin_pago",
  "activo_sin_tag",
  "tag_sin_estacionamiento",
  "vehiculo_incompleto",
  "sin_placas",
  "sin_pago",
  "sin_instalar",
];

// Los motivos de integridad primero: son los que indican que algo se escribió
// por fuera del panel y merecen mirarse antes que un seguimiento normal.
function ordenar(motivos: MotivoIncompleto[]): MotivoIncompleto[] {
  return [...motivos].sort((a, b) => ORDEN_MOTIVOS.indexOf(a) - ORDEN_MOTIVOS.indexOf(b));
}

const dias = (n: number) => (n === 0 ? "hoy" : n === 1 ? "hace 1 día" : `hace ${n} días`);

// Chips de los faltantes de un expediente.
export function ChipsMotivo({ motivos }: { motivos: MotivoIncompleto[] }) {
  return (
    <div className="incompleto__motivos">
      {ordenar(motivos).map((m) => (
        <span key={m} className={`motivo-chip motivo-chip--${MOTIVO_TONO[m]}`} title={MOTIVO_AYUDA[m]}>
          {MOTIVO_LABEL[m] ?? m}
        </span>
      ))}
    </div>
  );
}

// "Administración", "TI" o ambos, según los faltantes que traiga el expediente.
function responsables(motivos: MotivoIncompleto[]): string {
  const quienes = [...new Set(motivos.map((m) => MOTIVO_RESPONSABLE[m]).filter(Boolean))];
  if (quienes.length === 0) return "—";
  if (quienes.length === 1) return quienes[0];
  return "Administración y TI";
}

// Lista del reporte. La comparten Consulta y TI: el mismo criterio, la misma
// presentación y un solo lugar donde mantenerla.
export default function ListaIncompletos({ items, vacio }: {
  items: RegistroIncompleto[];
  vacio: string;
}) {
  if (items.length === 0) return <p className="ti-empty">✓ {vacio}</p>;

  return (
    <div className="ti-cards">
      {items.map((r) => (
        <div key={r.id} className={`ti-card ${r.sinPlacas ? "ti-card--sin-placas" : ""}`}>
          <div className="incompleto">
            <span className="ti-card__row">
              <span className="ti-card__placas">{r.placas ?? (r.sinPlacas ? "SIN PLACAS" : "—")}</span>
              <EstadoChip estado={r.estado} />
            </span>
            <span className="ti-card__veh">
              {r.marca.trim() || "Marca sin capturar"} {r.modelo} · {r.color.trim() || "color sin capturar"}
            </span>
            <span className="ti-card__sub">{r.usuarioNombre}</span>
            <span className="ti-card__meta">
              {r.folio}
              {r.noDispositivo ? ` · TAG ${r.noDispositivo}` : " · sin TAG"}
              {` · alta ${dias(r.diasDesdeAlta)}`}
              {r.diasDesdePago !== null ? ` · pagado ${dias(r.diasDesdePago)}` : " · sin pago"}
            </span>
            <ChipsMotivo motivos={r.motivos} />
            <span className="ti-card__meta">Lo resuelve: {responsables(r.motivos)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
