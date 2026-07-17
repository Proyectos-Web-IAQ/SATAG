"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { EmailOtpType } from "@supabase/supabase-js";
import Loader from "@/components/Loader";
import {
  supabaseAuth,
  actualizarContrasena,
  nivelMfa,
  factoresTotp,
  verificarTotp,
} from "@/lib/supabase/auth";

// Landing del enlace de recuperacion (/admin/reset-password). Supabase redirige aqui
// con el token en el hash (#access_token=...&type=recovery) o, para sitios
// estaticos, en el query (?token_hash=...&type=recovery). Se procesa a mano
// (detectSessionInUrl: false) para evitar condiciones de carrera.
//
// El enlace deja una sesion aal1. Si la cuenta tiene MFA, updateUser({password})
// exige aal2, asi que primero se pide el codigo TOTP (estado "mfa") para subir el
// nivel; recien entonces se muestra el formulario de nueva contrasena.
type Estado = "verificando" | "mfa" | "listo" | "sin-token" | "expirado" | "hecho";

const MIN_PASSWORD = 8;

export default function ResetPage() {
  const [estado, setEstado] = useState<Estado>("verificando");
  const [errorLink, setErrorLink] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Paso MFA (si la cuenta tiene segundo factor): subir la sesion a aal2.
  const [factorId, setFactorId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");

  useEffect(() => {
    // El correo puede llegar de dos formas: el patron recomendado para sitios
    // estaticos usa ?token_hash=...&type=recovery en el QUERY (se canjea con
    // verifyOtp); el redirect por defecto usa #access_token=... en el HASH
    // (se establece con setSession). Se soportan ambos, como en /admin/invite.
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));

    const errDesc = query.get("error_description") ?? hash.get("error_description");
    if (errDesc) {
      setErrorLink(decodeURIComponent(errDesc.replace(/\+/g, " ")));
      setEstado("expirado");
      return;
    }

    const tokenHash = query.get("token_hash");
    const tipo = (query.get("type") as EmailOtpType | null) ?? "recovery";
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");

    function limpiarUrl() {
      // Quita el token de la barra de direcciones y del historial.
      window.history.replaceState(null, "", window.location.pathname);
    }

    // Con sesion de recuperacion establecida (aal1): si la cuenta tiene un factor
    // MFA verificado, hay que subir a aal2 (pedir el codigo) antes de cambiar la
    // contrasena; si no, se pasa directo al formulario.
    async function decidirGate() {
      const nivel = await nivelMfa();
      if (nivel.actual === "aal2") { setEstado("listo"); return; }
      if (nivel.siguiente === "aal2") {
        const verificado = (await factoresTotp()).find((f) => f.status === "verified");
        if (verificado) { setFactorId(verificado.id); setEstado("mfa"); return; }
      }
      setEstado("listo");
    }

    async function establecer() {
      try {
        // Metodo recomendado: canjear el token_hash del correo.
        if (tokenHash) {
          const { error: err } = await supabaseAuth.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
          if (err) throw err;
          limpiarUrl();
          await decidirGate();
          return;
        }
        // Respaldo: sesion en el hash (redirect por defecto de Supabase).
        if (accessToken && refreshToken) {
          const { error: err } = await supabaseAuth.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (err) throw err;
          limpiarUrl();
          await decidirGate();
          return;
        }
        // Sin token: quiza ya habia una sesion de recuperacion; si no, entrada directa.
        const { data } = await supabaseAuth.auth.getSession();
        if (data.session) { await decidirGate(); } else { setEstado("sin-token"); }
      } catch {
        setErrorLink("El enlace no es válido o ya expiró.");
        setEstado("expirado");
      }
    }

    establecer();
  }, []);

  async function verificarMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    try {
      await verificarTotp(factorId, codigo);
      setEstado("listo");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo verificar el código.");
      setCodigo("");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (password !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      await actualizarContrasena(password);
      // Cierra la sesion de recuperacion: que inicie sesion con la contrasena nueva.
      await supabaseAuth.auth.signOut();
      setEstado("hecho");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="survey-panel login-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo" src="/logo-asuncion.jpg" alt="Instituto Asunción de Querétaro" />
        <header className="survey-header">
          <h1>Restablecer contraseña</h1>
          <p>Panel administrativo · IAQ</p>
        </header>

        {estado === "verificando" && <Loader label="Validando enlace…" />}

        {estado === "mfa" && (
          <>
            <p className="notice">
              Tu cuenta tiene verificación en dos pasos. Escribe el código de tu app de autenticación
              para continuar con el cambio de contraseña.
            </p>
            <form onSubmit={verificarMfa} style={{ display: "grid", gap: 16, marginTop: 8 }}>
              <label className="field">
                <span>Código de verificación</span>
                <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                  placeholder="000000" value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} autoFocus />
              </label>
              <button className="primary-action" type="submit" disabled={busy || codigo.length !== 6}>
                {busy ? "Verificando…" : "Verificar"}
              </button>
              {error && <p className="submit-error" role="alert">{error}</p>}
            </form>
          </>
        )}

        {estado === "listo" && (
          <form className="login-form" onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>
            <label className="field">
              <span>Nueva contraseña (mínimo {MIN_PASSWORD} caracteres)</span>
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={MIN_PASSWORD} />
            </label>
            <label className="field">
              <span>Confirmar contraseña</span>
              <input type="password" autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} required minLength={MIN_PASSWORD} />
            </label>
            <button className="primary-action" type="submit" disabled={busy}>
              {busy ? "Guardando…" : "Guardar contraseña"}
            </button>
            {error && <p className="submit-error" role="alert">{error}</p>}
          </form>
        )}

        {estado === "hecho" && (
          <>
            <p className="catalog-feedback catalog-feedback--ok">
              Tu contraseña se actualizó correctamente. Ya puedes iniciar sesión con ella.
            </p>
            <p style={{ marginTop: 16, textAlign: "right" }}>
              <Link href="/admin/" className="primary-action" style={{ display: "inline-block" }}>Ir a iniciar sesión</Link>
            </p>
          </>
        )}

        {estado === "expirado" && (
          <>
            <p className="submit-error" role="alert">
              {errorLink ?? "El enlace no es válido o ya expiró."} Solicita uno nuevo desde la pantalla de acceso.
            </p>
            <p style={{ marginTop: 16, textAlign: "right" }}>
              <Link href="/admin/" className="link-action">← Volver a iniciar sesión</Link>
            </p>
          </>
        )}

        {estado === "sin-token" && (
          <>
            <p className="notice">
              Esta página se abre desde el enlace del correo de recuperación. Si llegaste aquí por error,
              vuelve a la pantalla de acceso y usa <strong>¿Olvidaste tu contraseña?</strong>
            </p>
            <p style={{ marginTop: 16, textAlign: "right" }}>
              <Link href="/admin/" className="link-action">← Volver a iniciar sesión</Link>
            </p>
          </>
        )}
      </section>
    </main>
  );
}
