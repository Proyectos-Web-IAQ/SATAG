"use client";
import { useState } from "react";
import Link from "next/link";
import { crearSolicitud } from "@/lib/supabase/api";

// Página pública de solicitudes (CC-06): el titular pide una actualización de
// datos o la baja de su registro SIN iniciar sesión, demostrando que es él con
// un dato compartido: el folio de su comprobante + sus placas (o su No. de TAG
// si el vehículo no tiene placas). La solicitud solo encola trabajo para TI;
// ningún cambio se aplica hasta que la persona pasa con Sistemas. Por eso esta
// página jamás muestra datos del registro: solo confirma que se recibió.
type TipoSolicitud = "actualizacion" | "baja";

// El folio impreso es SATAG-000123; la gente a veces teclea solo los dígitos.
// Se normaliza aquí para que "123" o "satag-123" encuentren su registro.
function normalizarFolio(v: string): string {
  const limpio = v.trim().toUpperCase();
  if (limpio === "") return "";
  const digitos = limpio.replace(/^SATAG-?/, "");
  if (!/^[0-9]+$/.test(digitos)) return limpio;
  return `SATAG-${digitos.padStart(6, "0")}`;
}

export default function SolicitudesPage() {
  const [tipo, setTipo] = useState<TipoSolicitud | null>(null);
  const [folio, setFolio] = useState("");
  const [placasOTag, setPlacasOTag] = useState("");
  const [detalle, setDetalle] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviada, setEnviada] = useState(false);

  const listo = tipo !== null && folio.trim() !== "" && placasOTag.trim() !== "" && detalle.trim() !== "";

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!tipo) return;
    setEnviando(true);
    setError(null);
    try {
      await crearSolicitud({
        folio: normalizarFolio(folio),
        placasOTag,
        tipo,
        detalle,
      });
      setEnviada(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la solicitud.");
    } finally {
      setEnviando(false);
    }
  }

  if (enviada) {
    return (
      <main className="page-shell">
        <section className="survey-panel">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-logo" src="/logo-asuncion.jpg" alt="Instituto Asunción de Querétaro" />
          <header className="survey-header">
            <h1>Solicitud recibida ✓</h1>
            <p>
              Tu solicitud de {tipo === "actualizacion" ? "actualización de datos" : "baja"} quedó
              registrada y el área de Sistemas la verá en su bandeja.
            </p>
          </header>
          <div className="notice">
            <strong>¿Qué sigue?</strong> Ningún cambio se aplica en línea: pasa con el personal de
            Sistemas (TI) del IAQ para completar el trámite en persona. Lleva tu comprobante.
          </div>
          <p style={{ marginTop: 16, textAlign: "right" }}>
            <Link href="/" className="link-action">← Volver al inicio</Link>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="survey-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo" src="/logo-asuncion.jpg" alt="Instituto Asunción de Querétaro" />
        <header className="survey-header">
          <h1>Actualización o baja de tu TAG</h1>
          <p>
            Si ya tienes un registro y necesitas actualizar tus datos (placas, vehículo, reposición
            de TAG) o darlo de baja, solicítalo aquí. Sistemas atenderá tu solicitud en persona.
          </p>
        </header>

        <form onSubmit={enviar} style={{ display: "grid", gap: 16 }}>
          <div className="field">
            <span>¿Qué necesitas?</span>
            <div className="chip-row">
              <button type="button" className={`select-chip ${tipo === "actualizacion" ? "on" : ""}`}
                onClick={() => setTipo("actualizacion")}>Actualizar mis datos</button>
              <button type="button" className={`select-chip ${tipo === "baja" ? "on" : ""}`}
                onClick={() => setTipo("baja")}>Dar de baja mi registro</button>
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <span>Folio de tu comprobante</span>
              <input className="input" value={folio} onChange={(e) => setFolio(e.target.value)}
                placeholder="SATAG-000123" autoComplete="off" />
            </div>
            <div className="field">
              <span>Placas (o No. de TAG si no tienes placas)</span>
              <input className="input" value={placasOTag}
                onChange={(e) => setPlacasOTag(e.target.value.toUpperCase())}
                placeholder="ABC1234" autoComplete="off" />
            </div>
          </div>

          <div className="field">
            <span>Cuéntanos brevemente qué necesitas</span>
            <textarea className="input" rows={3} maxLength={500} value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              placeholder={tipo === "baja"
                ? "Ej. egreso del colegio, venta del vehículo…"
                : "Ej. placas nuevas, cambio de vehículo, TAG dañado…"} />
            <p className="hint">{detalle.length}/500</p>
          </div>

          <button className="primary-action" type="submit" disabled={enviando || !listo}>
            {enviando ? "Enviando…" : "Enviar solicitud"}
          </button>
          {error && <p className="submit-error" role="alert">{error}</p>}
        </form>

        <div className="notice" style={{ marginTop: 16 }}>
          <strong>Privacidad.</strong> Esta página no muestra ningún dato de tu registro. Los datos
          que captures se usan solo para ubicarlo y atender tu solicitud (LFPDPPP).
        </div>

        <p style={{ marginTop: 16, textAlign: "right" }}>
          <Link href="/" className="link-action">← Volver al inicio</Link>
        </p>
      </section>
    </main>
  );
}
