"use client";
import { useEffect, useRef, useState } from "react";
import Loader from "@/components/Loader";
import {
  nivelMfa,
  factoresTotp,
  inscribirTotp,
  verificarTotp,
  desinscribirFactor,
  type InscripcionTotp,
} from "@/lib/supabase/auth";

// Gate de segundo factor (TOTP). Se muestra tras el login cuando la sesion aun
// no es aal2. Decide solo su modo leyendo el AAL:
//   - sin factor verificado  -> ALTA (QR + secreto de respaldo) y primer codigo.
//   - con factor, falta hoy   -> CODIGO (reto de la sesion).
// Al verificar, la sesion sube a aal2 y se avisa al panel (onVerificado).
// Ver Desarrollo/07 - MFA (Autenticacion Multifactor).md.

type Modo = "cargando" | "alta" | "codigo" | "error";

export default function GateMfa({
  adminEmail,
  onVerificado,
  onSignOut,
}: {
  adminEmail: string;
  onVerificado: () => void;
  onSignOut: () => void;
}) {
  const [modo, setModo] = useState<Modo>("cargando");
  const [inscripcion, setInscripcion] = useState<InscripcionTotp | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  // Evita doble inicializacion (StrictMode monta dos veces en desarrollo).
  const iniciado = useRef(false);

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;

    (async () => {
      try {
        const nivel = await nivelMfa();
        if (nivel.actual === "aal2") { onVerificado(); return; }

        if (nivel.siguiente === "aal2") {
          // Ya tiene un factor verificado: solo falta el reto de esta sesion.
          const factores = await factoresTotp();
          const verificado = factores.find((f) => f.status === "verified");
          if (!verificado) throw new Error("No se encontro el factor verificado.");
          setFactorId(verificado.id);
          setModo("codigo");
          return;
        }

        // Sin factor verificado: limpiar altas abandonadas (no verificadas) e inscribir.
        const factores = await factoresTotp();
        await Promise.all(
          factores.filter((f) => f.status !== "verified").map((f) => desinscribirFactor(f.id)),
        );
        const alta = await inscribirTotp();
        setInscripcion(alta);
        setFactorId(alta.factorId);
        setModo("alta");
      } catch (e) {
        setInitError(e instanceof Error ? e.message : "No se pudo iniciar la verificacion.");
        setModo("error");
      }
    })();
  }, [onVerificado]);

  async function verificar(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setVerificando(true);
    setError(null);
    try {
      await verificarTotp(factorId, codigo);
      onVerificado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo verificar el codigo.");
      setCodigo("");
    } finally {
      setVerificando(false);
    }
  }

  const pie = (
    <p style={{ marginTop: 16, textAlign: "right" }}>
      <span className="admin-whoami">
        {adminEmail} · <button className="link-action" onClick={onSignOut}>Salir</button>
      </span>
    </p>
  );

  if (modo === "cargando") {
    return (
      <main className="page-shell">
        <section className="survey-panel login-panel">
          <Loader label="Preparando la verificación…" />
        </section>
      </main>
    );
  }

  if (modo === "error") {
    return (
      <main className="page-shell">
        <section className="survey-panel login-panel">
          <header className="survey-header"><h1>No se pudo iniciar la verificación</h1></header>
          <p className="submit-error" role="alert">{initError}</p>
          {pie}
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="survey-panel login-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo" src="/logo-asuncion.jpg" alt="Instituto Asunción de Querétaro" />

        {modo === "alta" ? (
          <>
            <header className="survey-header">
              <h1>Configura tu segundo factor</h1>
              <p>
                Escanea este código con tu app de autenticación (Google Authenticator, Microsoft
                Authenticator, etc.) y escribe el código de 6 dígitos para confirmar.
              </p>
            </header>

            {inscripcion && (
              <div style={{ display: "grid", gap: 12, justifyItems: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={inscripcion.qrSvg} alt="Código QR para configurar el segundo factor"
                  style={{ width: 200, height: 200 }} />
                <div className="field" style={{ width: "100%" }}>
                  <span>¿No puedes escanear? Escribe esta clave en tu app</span>
                  <input className="input" readOnly value={inscripcion.secret}
                    onFocus={(e) => e.currentTarget.select()} />
                  <p className="hint" style={{ margin: "4px 0 0" }}>
                    Guárdala también en tu <strong>gestor de contraseñas</strong>: es tu respaldo si
                    pierdes el teléfono.
                  </p>
                </div>
              </div>
            )}
          </>
        ) : (
          <header className="survey-header">
            <h1>Verificación en dos pasos</h1>
            <p>Escribe el código de 6 dígitos que muestra tu app de autenticación.</p>
          </header>
        )}

        <form onSubmit={verificar} style={{ display: "grid", gap: 16, marginTop: 8 }}>
          <label className="field">
            <span>Código de verificación</span>
            <input
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              autoFocus
            />
          </label>
          <button className="primary-action" type="submit" disabled={verificando || codigo.length !== 6}>
            {verificando ? "Verificando…" : "Verificar"}
          </button>
          {error && <p className="submit-error" role="alert">{error}</p>}
        </form>

        {pie}
      </section>
    </main>
  );
}
