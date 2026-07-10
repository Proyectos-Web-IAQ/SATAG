"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Loader from "@/components/Loader";
import { supabaseAuth, actualizarContrasena } from "@/lib/supabase/auth";

// Landing del enlace de recuperacion. Supabase redirige aqui con el token en el
// hash: #access_token=...&refresh_token=...&type=recovery  (o #error=...&error_description=...).
// Se procesa a mano (detectSessionInUrl: false) para evitar condiciones de carrera.
type Estado = "verificando" | "listo" | "sin-token" | "expirado" | "hecho";

const MIN_PASSWORD = 8;

export default function ResetPage() {
  const [estado, setEstado] = useState<Estado>("verificando");
  const [errorLink, setErrorLink] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));

    const errDesc = params.get("error_description");
    if (errDesc) {
      setErrorLink(decodeURIComponent(errDesc.replace(/\+/g, " ")));
      setEstado("expirado");
      return;
    }

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (accessToken && refreshToken) {
      supabaseAuth.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error: err }) => {
          if (err) {
            setErrorLink("El enlace no es válido o ya expiró.");
            setEstado("expirado");
          } else {
            // Quita el token de la barra de direcciones y del historial.
            window.history.replaceState(null, "", window.location.pathname);
            setEstado("listo");
          }
        });
      return;
    }

    // Sin token en el hash: quiza ya habia una sesion de recuperacion; si no,
    // se entro directo a la ruta sin venir del correo.
    supabaseAuth.auth.getSession().then(({ data }) => {
      setEstado(data.session ? "listo" : "sin-token");
    });
  }, []);

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
