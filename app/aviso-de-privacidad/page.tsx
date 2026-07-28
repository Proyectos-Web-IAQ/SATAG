"use client";

// Pagina publica del aviso de privacidad integral (CC-09). La BD registra esta
// ruta en aviso_versiones.url_publica, asi que el enlace que se publique en
// avisos impresos o correos debe seguir resolviendo aqui.
import { useEffect, useState } from "react";
import Link from "next/link";
import { getAvisoVigente, type AvisoVigente } from "@/lib/supabase/api";
import Loader from "@/components/Loader";

export default function AvisoDePrivacidad() {
  const [aviso, setAviso] = useState<AvisoVigente | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAvisoVigente()
      .then(setAviso)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "No se pudo cargar el aviso."));
  }, []);

  return (
    <main className="page-shell">
      <section className="survey-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo" src="/logo-asuncion.jpg" alt="Instituto Asunción de Querétaro" />
        <header className="survey-header">
          <h1>Aviso de privacidad</h1>
          <p>
            Tratamiento de datos personales del Sistema de Adquisición de TAG Vehicular (SATAG) del
            Instituto Asunción de Querétaro.
          </p>
        </header>

        {error && <p className="field-error">{error}</p>}

        {!aviso && !error && <Loader />}

        {aviso && (
          <>
            <article className="aviso-publico">
              {aviso.parrafos.map((p, i) => (
                <p key={i} style={{ margin: "0 0 12px" }}>{p}</p>
              ))}
            </article>
            <p className="hint" style={{ marginTop: 16 }}>
              Versión {aviso.version} del aviso, vigente al momento de esta consulta.
            </p>
          </>
        )}

        <p style={{ marginTop: 24 }}>
          <Link href="/" className="link-action">← Volver al inicio</Link>
        </p>
      </section>
    </main>
  );
}
