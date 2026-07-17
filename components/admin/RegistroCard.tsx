"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Registro, Solicitud, TipoUsuario } from "@/lib/mock/types";
import EstadoChip from "@/components/admin/EstadoChip";

// Rol de quien deja una nota del buzon (SC-003), en texto legible.
export const ROL_LABEL: Record<TipoUsuario, string> = {
  padres: "padre/madre/tutor",
  maestro: "maestro",
  admin: "administrativo",
  alumno: "alumno",
};

// Linea que resume una solicitud pendiente en la tarjeta. Una nota (SC-003) dice
// de quien viene; una actualizacion/baja dice que pide.
export function textoSolicitud(s: Solicitud): string {
  if (s.tipo === "nota") {
    const rol = s.solicitanteRol ? ` (${ROL_LABEL[s.solicitanteRol]})` : "";
    const quien = s.solicitanteNombre ? `Nota de ${s.solicitanteNombre}${rol}` : "Nota";
    return `${quien} (${s.fecha}): ${s.detalle}`;
  }
  return `Solicita ${s.tipo === "actualizacion" ? "actualización" : "baja"} (${s.fecha}): ${s.detalle}`;
}

// Scroll suave salvo que el sistema pida movimiento reducido.
export const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

// Lleva el aviso (exito o error) a la vista despues de una accion.
// Un scrollTo(0) no basta: en el padron de TI el banner vive debajo de las
// tarjetas de accion, y en un celular chico queda justo bajo el pliegue, asi
// que el operador subia al tope sin llegar a ver el aviso. scroll-margin-top
// en .ti-banners compensa el header fijo (mismo patron que .ti-card).
export function scrollAlAviso(el: HTMLElement | null) {
  if (el) el.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  else window.scrollTo({ top: 0, behavior: scrollBehavior() });
}

// Tarjeta compartida por Administracion y TI. En celular, toda la cabecera es
// tactil y al abrirse lleva el expediente al inicio visible de la pantalla.
export function TarjetaRegistro({ r, abierto, onToggle, children, chip }: {
  r: Registro;
  abierto: boolean;
  onToggle: () => void;
  children?: ReactNode;
  // Chip opcional a la derecha de las placas. Por defecto se muestra el estado
  // real del registro; Administración lo sustituye por un chip de cobro para
  // que su única señal sea el pago (TI y Consulta conservan el estado).
  chip?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (abierto) ref.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }, [abierto]);

  const solicitudes = r.solicitudes.filter((s) => !s.atendida);
  // Señal operativa: un vehículo sin placas (permiso/nuevo) se resalta en
  // amarillo para que TI/Admin lo detecten de un vistazo en el padrón.
  return (
    <div ref={ref} className={`ti-card ${abierto ? "is-open" : ""} ${r.sinPlacas ? "ti-card--sin-placas" : ""}`}>
      <button type="button" className="ti-card__head" onClick={onToggle} aria-expanded={abierto}>
        <span className="ti-card__row">
          <span className="ti-card__placas">{r.placas ?? (r.sinPlacas ? "SIN PLACAS" : "—")}</span>
          {chip ?? <EstadoChip estado={r.estado} />}
        </span>
        <span className="ti-card__veh">{r.marca} {r.modelo} · {r.color}</span>
        <span className="ti-card__sub">{r.usuarioNombre} · <span style={{ textTransform: "capitalize" }}>{r.tipoUsuario}</span></span>
        <span className="ti-card__meta">
          {r.folio}
          {r.estacionamientos.length > 0 ? ` · ${r.estacionamientos.join(" + ")}` : ""}
          {r.noDispositivo ? ` · TAG ${r.noDispositivo}` : " · sin TAG"}
        </span>
        {solicitudes.map((s) => (
          <span key={s.id} className="ti-card__solicitud">{textoSolicitud(s)}</span>
        ))}
      </button>
      {abierto && <div className="ti-card__body">{children}</div>}
    </div>
  );
}

export function DetalleRegistro({ r, busy = false, onDescartar }: {
  r: Registro;
  busy?: boolean;
  // Solo TI recibe esta accion; Administracion usa el mismo detalle sin poder
  // cerrar solicitudes que no le corresponden.
  onDescartar?: (s: Solicitud, motivo: string) => void;
}) {
  const pendientes = r.solicitudes.filter((s) => !s.atendida);
  return (
    <>
      <div className="detail-grid" style={{ marginBottom: 12 }}>
        <div><div className="k">Gestionante (paga y firma)</div><div className="v">{r.gestionanteNombre ?? "El mismo conductor"}</div></div>
        <div><div className="k">Procedencia TAG</div><div className="v" style={{ textTransform: "capitalize" }}>{r.procedenciaTag}</div></div>
        {r.tagApartado && <div><div className="k">TAG apartado</div><div className="v">{r.tagApartadoNo}</div></div>}
        <div><div className="k">Pagos</div><div className="v">{r.pagos.length ? `$${r.pagos.reduce((a, p) => a + p.monto, 0)} (${r.pagos.length})` : "Sin pago"}</div></div>
        <div><div className="k">Estacionamiento</div><div className="v">{r.estacionamientos.join(" + ") || "Sin asignar"}</div></div>
        {r.fechaInstalacion && <div><div className="k">Instalado</div><div className="v">{r.fechaInstalacion}{r.instaladoPor ? ` · ${r.instaladoPor}` : ""}</div></div>}
        {r.observaciones && <div style={{ gridColumn: "1 / -1" }}><div className="k">Observaciones</div><div className="v">{r.observaciones}</div></div>}
      </div>
      {onDescartar && pendientes.map((s) => (
        <SolicitudPendiente key={s.id} s={s} busy={busy} onDescartar={onDescartar} />
      ))}
    </>
  );
}

// Solicitud pendiente con su valvula de escape: TI puede descartarla con un
// motivo sin inventar un cambio sobre el expediente.
function SolicitudPendiente({ s, busy, onDescartar }: {
  s: Solicitud;
  busy: boolean;
  onDescartar: (s: Solicitud, motivo: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const esNota = s.tipo === "nota";
  return (
    <div className="ti-form" style={{ marginBottom: 12 }}>
      <p className="ti-hint" style={{ marginBottom: 8 }}>{textoSolicitud(s)}</p>
      {!abierto ? (
        <button type="button" className="link-action" disabled={busy} onClick={() => setAbierto(true)}>
          {esNota ? "Cerrar esta nota…" : "Descartar esta solicitud sin aplicar cambios…"}
        </button>
      ) : (
        <>
          <div className="field">
            <span>{esNota ? "¿Por qué se cierra?" : "¿Por qué se descarta?"}</span>
            <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder={esNota ? "Ej. ya se atendió, no procede, dato incorrecto" : "Ej. ya estaba aplicado, duplicada, no procede"} />
          </div>
          <div className="ti-chips">
            <button type="button" className="select-chip" disabled={busy || !motivo.trim()}
              onClick={() => onDescartar(s, motivo.trim())}>{esNota ? "Cerrar nota" : "Descartar solicitud"}</button>
            <button type="button" className="link-action" disabled={busy}
              onClick={() => { setAbierto(false); setMotivo(""); }}>Cancelar</button>
          </div>
        </>
      )}
    </div>
  );
}
