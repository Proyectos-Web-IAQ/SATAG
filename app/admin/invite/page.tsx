"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { EmailOtpType } from "@supabase/supabase-js";
import Loader from "@/components/Loader";
import { supabaseAuth, actualizarContrasena } from "@/lib/supabase/auth";

// Landing de la invitacion. El correo apunta aqui con el patron recomendado de
// Supabase para sitios estaticos:
//   /admin/invite/?token_hash=...&type=invite   -> se canjea con verifyOtp()
// Como respaldo tambien acepta el formato por hash del redirect por defecto:
//   /admin/invite/#access_token=...&refresh_token=...&type=invite
// Tras validar, el invitado crea su propia contrasena.
type Estado = "verificando" | "listo" | "sin-token" | "expirado" | "hecho";

const MIN_PASSWORD = 8;

export default function InvitePage() {
  const [estado, setEstado] = useState<Estado>("verificando");
  const [errorLink, setErrorLink] = useState<string | null>(null);
  const [correo, setCorreo] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));

    const errDesc = query.get("error_description") ?? hash.get("error_description");
    if (errDesc) {
      setErrorLink(decodeURIComponent(errDesc.replace(/\+/g, " ")));
      setEstado("expirado");
      return;
    }

    const tokenHash = query.get("token_hash");
    const tipo = (query.get("type") as EmailOtpType | null) ?? "invite";
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");

    function limpiarUrl() {
      window.history.replaceState(null, "", window.location.pathname);
    }

    async function establecer() {
      try {
        // Metodo recomendado: canjear el token_hash del correo.
        if (tokenHash) {
          const { data, error: err } = await supabaseAuth.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
          if (err) throw err;
          setCorreo(data.user?.email ?? null);
          limpiarUrl();
          setEstado("listo");
          return;
        }
        // Respaldo: sesion en el hash (redirect por defecto de Supabase).
        if (accessToken && refreshToken) {
          const { data, error: err } = await supabaseAuth.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (err) throw err;
          setCorreo(data.user?.email ?? null);
          limpiarUrl();
          setEstado("listo");
          return;
        }
        // Sin token: quiza ya hay sesion de invitacion activa; si no, entrada directa.
        const { data } = await supabaseAuth.auth.getSession();
        if (data.session) {
          setCorreo(data.session.user.email ?? null);
          setEstado("listo");
        } else {
          setEstado("sin-token");
        }
      } catch {
        setErrorLink("El enlace de invitación no es válido o ya expiró.");
        setEstado("expirado");
      }
    }

    establecer();
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
      await supabaseAuth.auth.signOut(); // que inicie sesion con su contrasena nueva
      setEstado("hecho");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la contraseña.");
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
          <h1>Activar tu cuenta</h1>
          <p>Panel administrativo · IAQ</p>
        </header>

        {estado === "verificando" && <Loader label="Validando invitación…" />}

        {estado === "listo" && (
          <form className="login-form" onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>
            <p className="notice">
              {correo ? <>Estás activando la cuenta de <strong>{correo}</strong>. </> : null}
              Crea una contraseña para entrar al panel.
            </p>
            <label className="field">
              <span>Contraseña (mínimo {MIN_PASSWORD} caracteres)</span>
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={MIN_PASSWORD} />
            </label>
            <label className="field">
              <span>Confirmar contraseña</span>
              <input type="password" autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} required minLength={MIN_PASSWORD} />
            </label>
            <button className="primary-action" type="submit" disabled={busy}>
              {busy ? "Guardando…" : "Crear contraseña y activar"}
            </button>
            {error && <p className="submit-error" role="alert">{error}</p>}
          </form>
        )}

        {estado === "hecho" && (
          <>
            <p className="catalog-feedback catalog-feedback--ok">
              Tu cuenta quedó activada. Ya puedes iniciar sesión con tu correo y tu nueva contraseña.
            </p>
            <p style={{ marginTop: 16, textAlign: "right" }}>
              <Link href="/admin/" className="primary-action" style={{ display: "inline-block" }}>Ir a iniciar sesión</Link>
            </p>
          </>
        )}

        {estado === "expirado" && (
          <>
            <p className="submit-error" role="alert">
              {errorLink ?? "El enlace de invitación no es válido o ya expiró."} Pide al administrador que te reenvíe la invitación.
            </p>
            <p style={{ marginTop: 16, textAlign: "right" }}>
              <Link href="/admin/" className="link-action">← Ir a iniciar sesión</Link>
            </p>
          </>
        )}

        {estado === "sin-token" && (
          <>
            <p className="notice">
              Esta página se abre desde el enlace de invitación que llega por correo. Si ya activaste tu cuenta,
              entra directamente desde la pantalla de acceso.
            </p>
            <p style={{ marginTop: 16, textAlign: "right" }}>
              <Link href="/admin/" className="link-action">← Ir a iniciar sesión</Link>
            </p>
          </>
        )}
      </section>
    </main>
  );
}
