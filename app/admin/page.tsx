"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AdminPanel from "@/components/admin/AdminPanel";
import Loader from "@/components/Loader";
import {
  supabaseAuth,
  iniciarSesion,
  cerrarSesion,
  enviarCorreoRecuperacion,
} from "@/lib/supabase/auth";

type Modo = "login" | "recuperar";

export default function AdminPage() {
  const [verificando, setVerificando] = useState(true); // restaurando sesion previa
  const [email, setEmail] = useState<string | null>(null); // sesion activa

  const [modo, setModo] = useState<Modo>("login");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Restaura la sesion guardada y se mantiene en sync (login/logout, refresco de
  // token, o cierre desde otra pestana).
  useEffect(() => {
    let activo = true;
    supabaseAuth.auth.getSession().then(({ data }) => {
      if (!activo) return;
      setEmail(data.session?.user.email ?? null);
      setVerificando(false);
    });
    const { data: sub } = supabaseAuth.auth.onAuthStateChange((_evento, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => {
      activo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  function cambiarModo(nuevo: Modo) {
    setModo(nuevo);
    setError(null);
    setAviso(null);
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setAviso(null);
    try {
      const user = await iniciarSesion(correo, password);
      setEmail(user?.email ?? correo.trim());
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesion.");
    } finally {
      setBusy(false);
    }
  }

  async function onRecuperar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setAviso(null);
    try {
      await enviarCorreoRecuperacion(correo);
      setAviso(
        "Si el correo pertenece a una cuenta registrada, recibiras un enlace para restablecer tu contrasena. Revisa tu bandeja de entrada y la carpeta de spam.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el correo.");
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    try {
      await cerrarSesion();
    } finally {
      setEmail(null);
      cambiarModo("login");
      setCorreo("");
      setPassword("");
    }
  }

  if (verificando) {
    return (
      <main className="page-shell">
        <section className="survey-panel login-panel">
          <Loader label="Verificando sesion…" />
        </section>
      </main>
    );
  }

  if (email) return <AdminPanel adminEmail={email} onSignOut={onSignOut} />;

  return (
    <main className="page-shell">
      <section className="survey-panel login-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo" src="/logo-asuncion.jpg" alt="Instituto Asunción de Querétaro" />
        <header className="survey-header">
          <h1>Panel administrativo</h1>
          <p>
            {modo === "login"
              ? "Acceso para personal de administración y TI del IAQ."
              : "Te enviaremos un enlace para restablecer tu contraseña."}
          </p>
        </header>

        {modo === "login" ? (
          <form className="login-form" onSubmit={onLogin} style={{ display: "grid", gap: 16 }}>
            <label className="field">
              <span>Correo</span>
              <input type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <button className="primary-action" type="submit" disabled={busy}>
              {busy ? "Entrando…" : "Iniciar sesión"}
            </button>
            {error && <p className="submit-error" role="alert">{error}</p>}
            {aviso && <p className="catalog-feedback catalog-feedback--ok">{aviso}</p>}
            <button type="button" className="link-action" style={{ justifySelf: "start" }} onClick={() => cambiarModo("recuperar")}>
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        ) : (
          <form className="login-form" onSubmit={onRecuperar} style={{ display: "grid", gap: 16 }}>
            <label className="field">
              <span>Correo</span>
              <input type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
            </label>
            <button className="primary-action" type="submit" disabled={busy}>
              {busy ? "Enviando…" : "Enviar enlace de recuperación"}
            </button>
            {error && <p className="submit-error" role="alert">{error}</p>}
            {aviso && <p className="catalog-feedback catalog-feedback--ok">{aviso}</p>}
            <button type="button" className="link-action" style={{ justifySelf: "start" }} onClick={() => cambiarModo("login")}>
              ← Volver al inicio de sesión
            </button>
          </form>
        )}

        <p style={{ marginTop: 12, textAlign: "right" }}>
          <Link href="/" className="link-action">← Volver al inicio</Link>
        </p>
      </section>
    </main>
  );
}
