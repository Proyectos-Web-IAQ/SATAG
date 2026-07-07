"use client";
import { useState } from "react";
import Link from "next/link";
import AdminPanel from "@/components/admin/AdminPanel";

// Login MOCK para el prototipo (sin Supabase). En producción se reemplaza por
// Supabase Auth (ver patrón de SEVAD). Cualquier correo/contraseña entra.
export default function AdminPage() {
  const [session, setSession] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) { setError("Captura correo y contraseña."); return; }
    setSession(email.trim());
  }

  if (session) return <AdminPanel adminEmail={session} onSignOut={() => setSession(null)} />;

  return (
    <main className="page-shell">
      <section className="survey-panel login-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo" src="/logo-asuncion.jpg" alt="Instituto Asunción de Querétaro" />
        <header className="survey-header">
          <h1>Panel administrativo</h1>
          <p>Acceso para personal de administración y TI del IAQ.</p>
        </header>
        <form className="login-form" onSubmit={signIn} style={{ display: "grid", gap: 16 }}>
          <label className="field">
            <span>Correo</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span>Contraseña</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button className="primary-action" type="submit">Iniciar sesión</button>
          {error && <p className="submit-error" role="alert">{error}</p>}
        </form>
        <p className="notice" style={{ marginTop: 16 }}>
          <strong>Demo:</strong> cualquier correo y contraseña entran (aún sin Supabase Auth).
        </p>
        <p style={{ marginTop: 12, textAlign: "right" }}>
          <Link href="/" className="link-action">← Volver al inicio</Link>
        </p>
      </section>
    </main>
  );
}
