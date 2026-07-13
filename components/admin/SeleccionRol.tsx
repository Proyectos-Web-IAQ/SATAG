"use client";
import { useState } from "react";
import type { RolPanel } from "@/lib/supabase/auth";

// Pantalla donde el usuario elige su rol la primera vez (o al cambiarlo). La
// eleccion se guarda en user_metadata (ver lib/supabase/auth.ts -> elegirRol).
// Nota: el rol auto-seleccionado NO es un control de acceso, solo separa la vista.

const OPCIONES: { rol: RolPanel; titulo: string; desc: string }[] = [
  { rol: "admin", titulo: "Administración", desc: "Asignar estacionamiento y registrar pagos." },
  { rol: "ti", titulo: "TI", desc: "Instalar y reponer TAG, dar de baja." },
  { rol: "consulta", titulo: "Consulta", desc: "Ver el padrón sin ejecutar acciones." },
];

export default function SeleccionRol({
  adminEmail,
  onElegir,
  onSignOut,
  onCancelar,
}: {
  adminEmail: string;
  onElegir: (rol: RolPanel) => Promise<void>;
  onSignOut: () => void;
  onCancelar?: () => void; // presente solo cuando ya tenía rol (modo "cambiar")
}) {
  const [busy, setBusy] = useState<RolPanel | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function elegir(rol: RolPanel) {
    setBusy(rol);
    setError(null);
    try {
      await onElegir(rol);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el rol.");
      setBusy(null);
    }
  }

  return (
    <main className="page-shell">
      <section className="survey-panel login-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo" src="/logo-asuncion.jpg" alt="Instituto Asunción de Querétaro" />
        <header className="survey-header">
          <h1>Elige tu área</h1>
          <p>Selecciona el área en la que trabajas para adaptar el panel a lo que necesitas.</p>
        </header>

        <div style={{ display: "grid", gap: 12 }}>
          {OPCIONES.map((o) => (
            <button
              key={o.rol}
              type="button"
              className="ghost-action"
              disabled={busy !== null}
              onClick={() => elegir(o.rol)}
              style={{ textAlign: "left", display: "grid", gap: 4, padding: "14px 16px" }}
            >
              <strong>{busy === o.rol ? "Guardando…" : o.titulo}</strong>
              <span style={{ color: "var(--muted)", fontWeight: 400 }}>{o.desc}</span>
            </button>
          ))}
        </div>

        {error && <p className="submit-error" role="alert" style={{ marginTop: 12 }}>{error}</p>}

        <p style={{ marginTop: 16, textAlign: "right" }}>
          {onCancelar ? (
            <button type="button" className="link-action" onClick={onCancelar}>← Volver</button>
          ) : (
            <span className="admin-whoami">{adminEmail} · <button className="link-action" onClick={onSignOut}>Salir</button></span>
          )}
        </p>
      </section>
    </main>
  );
}
