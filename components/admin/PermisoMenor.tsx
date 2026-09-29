"use client";

import { useState } from "react";
import type { Registro } from "@/lib/mock/types";
import { urlPermiso } from "@/lib/supabase/apiPanel";

// El permiso para conducir del conductor menor de edad, en la pantalla del
// cobro (bloque 75).
//
// QUIEN LO VE. Solo Administracion y super: la politica del bucket se lo niega
// a cualquier otro rol, asi que aqui no se decide nada de permisos, solo se
// pide la URL y Storage responde o no. Es un documento oficial de un menor y
// cuantos menos ojos, mejor.
//
// LA IMAGEN NO SE PRECARGA. Se pide con un boton, a proposito: abrir sola la
// foto del permiso de un menor cada vez que alguien despliega un expediente
// seria exponerla a quien pasara por ahi. Y la URL caduca en un minuto.

const FMT = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

export default function PermisoMenor({ r, busy, onAceptar }: {
  r: Registro;
  busy: boolean;
  onAceptar: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Las imagenes de evidencia salen acotadas y se amplian al pulsarlas. Se
  // resuelve con un interruptor y no abriendo la URL en otra pestana porque
  // esa URL caduca en un minuto: el enlace llegaria muerto a la mitad de las
  // veces.
  const [ampliada, setAmpliada] = useState(false);

  if (!r.usuarioEsMenor) return null;

  async function ver() {
    setCargando(true);
    setError(null);
    try {
      setUrl(await urlPermiso(r.permisoUrl as string));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la imagen del permiso.");
    } finally {
      setCargando(false);
    }
  }

  // Sin archivo no hay nada que aceptar. Pasa con los expedientes de menores
  // dados de alta ANTES del bloque 75: el permiso no existia y no se les puede
  // exigir a posteriori.
  if (!r.permisoUrl) {
    return (
      <p className="notice" style={{ margin: "0 0 16px", padding: "10px 12px" }}>
        Este expediente es de un <strong>conductor menor de edad</strong> y no trae el permiso para
        conducir. Si se registró antes de que el sistema lo pidiera, cóbrelo normal y pida el
        documento por fuera. Si es reciente, algo falló al subirlo.
      </p>
    );
  }

  if (r.permisoValidado) {
    return (
      <p className="notice" style={{ margin: "0 0 16px", padding: "10px 12px" }}>
        ✓ Permiso para conducir <strong>aceptado</strong>
        {r.permisoValidadoPor ? ` por ${r.permisoValidadoPor}` : ""}
        {r.permisoValidadoEn ? ` · ${FMT.format(new Date(r.permisoValidadoEn))}` : ""}.
      </p>
    );
  }

  return (
    <div className="notice" style={{ margin: "0 0 16px", padding: "10px 12px" }}>
      <p style={{ margin: "0 0 8px" }}>
        <strong>Conductor menor de edad.</strong> Antes de cobrar, abra el permiso para conducir y
        compruebe que está a nombre del alumno y vigente.
      </p>

      {url ? (
        // Enlace temporal: caduca en un minuto. Si se vence, se vuelve a pedir.
        <img className={`evidencia__img ${ampliada ? "evidencia__img--grande" : ""}`}
          src={url}
          alt="Permiso para conducir del menor"
          title={ampliada ? "Pulse para reducir" : "Pulse para ampliar"}
          tabIndex={0} role="button"
          style={{ marginBottom: 10 }}
          onClick={() => setAmpliada((v) => !v)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAmpliada((v) => !v); } }} />
      ) : (
        // En su propio parrafo: .link-action es en linea, y suelto se le pegaba
        // al boton de aceptar hasta encabalgarse con el.
        <p style={{ margin: "0 0 10px" }}>
          <button type="button" className="link-action" disabled={cargando} onClick={ver}>
            {cargando ? "Abriendo…" : "▸ Ver el permiso"}
          </button>
        </p>
      )}

      {error && <p className="field-error" style={{ margin: "0 0 10px" }}>{error}</p>}

      <button type="button" className="primary-action" disabled={busy || !url} onClick={onAceptar}>
        Aceptar el permiso
      </button>
      {!url && (
        <p className="ti-hint" style={{ margin: "6px 0 0" }}>
          Ábralo primero: no se acepta un documento que no se ha visto.
        </p>
      )}
    </div>
  );
}
