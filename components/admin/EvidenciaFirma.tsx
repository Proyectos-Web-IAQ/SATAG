"use client";

import { useState } from "react";
import type { EvidenciaFirma as Evidencia, FirmanteRol } from "@/lib/mock/types";
import { obtenerEvidenciaFirma } from "@/lib/supabase/apiPanel";

// SC-008 · Ver la firma desde el panel, con URL firmada temporal.
//
// La evidencia NO se carga sola al abrir un expediente: hay que pedirla. Son
// datos biométricos (LFPDPPP) y la mayoría de las veces que se abre una tarjeta
// es para cobrar o instalar, no para cotejar una firma. Pedirla deja además la
// intención explícita de quien la consulta.
//
// El bucket `firmas` es privado y sigue siéndolo: la imagen se abre con una URL
// firmada de vida corta que emite Supabase para esta sesión. Nada se publica.
//
// Lo ven los cuatro roles del panel: admin, ti, consulta y super (bloque 48).
// `consulta` gana sólo lectura — sigue sin poder escribir ni borrar objetos del
// bucket, y sin pasar la guardia de ningún RPC.

const ROL_FIRMANTE: Record<FirmanteRol, string> = {
  usuario: "el propio titular",
  padre: "el padre",
  madre: "la madre",
  tutor: "el tutor",
  otro: "otra persona autorizada",
};

// La operación ocurre en Querétaro; el sello viaja en UTC desde Postgres.
const FORMATO_SELLO = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  dateStyle: "long",
  timeStyle: "medium",
});

function selloLegible(iso: string): string {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? iso : FORMATO_SELLO.format(fecha);
}

// Hash completo en el title (para copiarlo del tooltip) y recortado en pantalla:
// 64 caracteres desbordan la tarjeta en celular.
function hashCorto(hash: string): string {
  return hash.length <= 24 ? hash : `${hash.slice(0, 12)}…${hash.slice(-8)}`;
}

export default function EvidenciaFirmaPanel({ registroId }: { registroId: string }) {
  const [evidencia, setEvidencia] = useState<Evidencia | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinEvidencia, setSinEvidencia] = useState(false);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const datos = await obtenerEvidenciaFirma(registroId);
      setEvidencia(datos);
      setSinEvidencia(datos === null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la evidencia de la firma.");
    } finally {
      setCargando(false);
    }
  }

  if (!evidencia && !sinEvidencia && !error) {
    return (
      <div className="evidencia">
        <p className="ti-section-title" style={{ margin: "0 0 6px" }}>Evidencia de aceptación</p>
        <p className="ti-hint">
          Firma manuscrita, versiones aceptadas y sello de tiempo. Se consulta bajo demanda:
          el enlace de la imagen es temporal y el archivo nunca es público.
        </p>
        <button type="button" className="select-chip" disabled={cargando} onClick={cargar}>
          {cargando ? "Abriendo…" : "Ver la firma"}
        </button>
      </div>
    );
  }

  return (
    <div className="evidencia">
      <p className="ti-section-title" style={{ margin: "0 0 6px" }}>Evidencia de aceptación</p>

      {error && (
        <p className="submit-error" role="alert" style={{ margin: "0 0 10px" }}>
          {error}{" "}
          <button type="button" className="link-action" onClick={cargar}>Reintentar</button>
        </p>
      )}

      {sinEvidencia && !error && (
        <p className="ti-hint">
          Este expediente no tiene evidencia de firma registrada. Los expedientes dados de alta
          por el formulario siempre la tienen; si falta, el registro se capturó por otra vía.
        </p>
      )}

      {evidencia && (
        <>
          {evidencia.firmaUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal
               de Storage: el optimizador de imágenes de Next no aplica en un sitio
               estático y reescribiría un enlace que caduca en segundos. */
            <img className="evidencia__img" src={evidencia.firmaUrl}
              alt={`Firma de ${evidencia.firmanteNombre}`} />
          ) : (
            <p className="submit-error" style={{ margin: "0 0 10px" }}>
              No se pudo abrir la imagen de la firma
              {evidencia.firmaError ? `: ${evidencia.firmaError}` : "."}{" "}
              Los datos de abajo conservan su valor probatorio.
            </p>
          )}

          <div className="detail-grid" style={{ marginTop: 12 }}>
            <div>
              <div className="k">Firmó</div>
              <div className="v">{evidencia.firmanteNombre} ({ROL_FIRMANTE[evidencia.firmanteRol]})</div>
            </div>
            <div>
              <div className="k">Sello de tiempo</div>
              <div className="v">{selloLegible(evidencia.selloTiempo)}</div>
            </div>
            <div>
              <div className="k">Reglamento aceptado</div>
              <div className="v">
                {evidencia.reglamentoVersion !== null ? `Versión ${evidencia.reglamentoVersion}` : "No consta"}
              </div>
            </div>
            <div>
              <div className="k">Aviso de privacidad aceptado</div>
              <div className="v">
                {evidencia.avisoVersion !== null ? `Versión ${evidencia.avisoVersion}` : "No consta"}
              </div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div className="k">Hash del paquete firmado ({evidencia.hashAlgoritmo.toUpperCase()})</div>
              <div className="v evidencia__hash" title={evidencia.hashDocumento}>
                {hashCorto(evidencia.hashDocumento)}
              </div>
            </div>
            {evidencia.firmaImagenSha256 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <div className="k">Hash de la imagen (SHA-256)</div>
                <div className="v evidencia__hash" title={evidencia.firmaImagenSha256}>
                  {hashCorto(evidencia.firmaImagenSha256)}
                </div>
              </div>
            )}
            <div style={{ gridColumn: "1 / -1" }}>
              <div className="k">Trazos vectoriales</div>
              <div className="v">
                {evidencia.tieneTrazos
                  ? "Conservados junto con la imagen"
                  : "No se conservaron para esta firma"}
              </div>
            </div>
          </div>

          <p className="ti-hint" style={{ marginTop: 10 }}>
            El enlace de la imagen caduca a los {evidencia.expiraEnSegundos} segundos.{" "}
            <button type="button" className="link-action" disabled={cargando} onClick={cargar}>
              {cargando ? "Abriendo…" : "Volver a abrirla"}
            </button>
          </p>
        </>
      )}
    </div>
  );
}
