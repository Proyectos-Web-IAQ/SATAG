"use client";
import { useState } from "react";
import Link from "next/link";
import { crearSolicitud, crearNota } from "@/lib/supabase/api";

// Página pública de solicitudes. Dos caminos, misma idea: la solicitud solo
// encola trabajo para TI; ningún cambio se aplica en línea y jamás se muestran
// datos del registro.
//
//  - CON folio (CC-06): el titular demuestra serlo con folio + placas (o No. de
//    TAG). Ruta rápida, sin cambios respecto a antes.
//  - SIN folio (SC-003): deja una nota con su nombre y quién es (padre/madre/tutor,
//    maestro o administrativo); Sistemas la empata a mano por nombre. Recolectar
//    es público; buscar es privado.
type TipoSolicitud = "actualizacion" | "baja";
type Modo = "elegir" | "folio" | "nota";

// Roles que pueden dejar una nota sin folio. El catálogo reg_tipo_usuario_valido
// tambien incluye 'alumno', pero el buzón público no lo ofrece: los alumnos no
// hacen este trámite. El valor "admin" se muestra como "Administrativo".
type RolSolicitante = "padres" | "maestro" | "admin";
const ROLES: { valor: RolSolicitante; etiqueta: string }[] = [
  { valor: "padres", etiqueta: "Padre/Madre/Tutor" },
  { valor: "maestro", etiqueta: "Maestro" },
  { valor: "admin", etiqueta: "Administrativo" },
];

// Que tramite pide quien deja la nota. Sistemas lo ve y lo corrobora: puede
// aplicar otro si el que se pidio no corresponde al caso.
type TramiteNota = "instalacion" | "actualizacion" | "baja";
const TRAMITES: { valor: TramiteNota; etiqueta: string }[] = [
  { valor: "instalacion", etiqueta: "Instalar TAG" },
  { valor: "actualizacion", etiqueta: "Actualizar datos" },
  { valor: "baja", etiqueta: "Dar de baja" },
];

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
  const [modo, setModo] = useState<Modo>("elegir");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviada, setEnviada] = useState<null | "folio" | "nota">(null);

  // Ruta con folio (CC-06).
  const [tipo, setTipo] = useState<TipoSolicitud | null>(null);
  const [folio, setFolio] = useState("");
  const [placasOTag, setPlacasOTag] = useState("");
  const [detalle, setDetalle] = useState("");

  // Ruta sin folio: nota (SC-003).
  const [solicitante, setSolicitante] = useState("");
  const [solicitanteRol, setSolicitanteRol] = useState<RolSolicitante | null>(null);
  const [tramite, setTramite] = useState<TramiteNota | null>(null);
  const [alumno, setAlumno] = useState("");
  const [grado, setGrado] = useState("");
  const [notaDetalle, setNotaDetalle] = useState("");
  const [vehiculo, setVehiculo] = useState("");

  // Solo a los padres se les pide identificar al alumno y su grado.
  const esPadres = solicitanteRol === "padres";

  const listoFolio = tipo !== null && folio.trim() !== "" && placasOTag.trim() !== "" && detalle.trim() !== "";
  const listoNota =
    solicitanteRol !== null &&
    tramite !== null &&
    solicitante.trim() !== "" &&
    notaDetalle.trim() !== "" &&
    (!esPadres || (alumno.trim() !== "" && grado.trim() !== ""));

  function irA(m: Modo) {
    setModo(m);
    setError(null);
  }

  async function enviarFolio(e: React.FormEvent) {
    e.preventDefault();
    if (!tipo) return;
    setEnviando(true);
    setError(null);
    try {
      await crearSolicitud({ folio: normalizarFolio(folio), placasOTag, tipo, detalle });
      setEnviada("folio");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la solicitud.");
    } finally {
      setEnviando(false);
    }
  }

  async function enviarNota(e: React.FormEvent) {
    e.preventDefault();
    if (!solicitanteRol || !tramite) return;
    setEnviando(true);
    setError(null);
    try {
      await crearNota({
        solicitanteNombre: solicitante,
        solicitanteRol,
        tramiteSolicitado: tramite,
        // Alumno y grado solo aplican a padres; para el resto van vacíos.
        alumnoNombre: esPadres ? alumno : "",
        alumnoGrado: esPadres ? grado : "",
        detalle: notaDetalle,
        vehiculoDesc: vehiculo,
      });
      setEnviada("nota");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la nota.");
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
            <h1>{enviada === "nota" ? "Nota recibida ✓" : "Solicitud recibida ✓"}</h1>
            <p>
              {enviada === "nota"
                ? "Dejó su nota. El área de Sistemas la ubicará por su nombre y la atenderá."
                : `Su solicitud de ${tipo === "actualizacion" ? "actualización de datos" : "baja"} quedó registrada y el área de Sistemas la verá en su bandeja.`}
            </p>
          </header>
          <div className="notice">
            <strong>¿Qué sigue?</strong> Ningún cambio se aplica en línea: pase con el personal de
            Sistemas (TI) del IAQ para completar el trámite en persona{enviada === "folio" ? ". Lleve su comprobante." : "."}
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
          <h1>Actualización o baja de su TAG</h1>
          <p>
            Si necesita actualizar sus datos (placas, vehículo, reposición de TAG) o dar de baja
            su registro, solicítelo aquí. Sistemas lo atenderá en persona.
          </p>
        </header>

        {modo === "elegir" && (
          <div style={{ display: "grid", gap: 16 }}>
            <div className="field">
              <span>¿Tiene su folio de comprobante (SATAG-000123)?</span>
              <div className="chip-row">
                <button type="button" className="select-chip" onClick={() => irA("folio")}>Sí, tengo mi folio</button>
                <button type="button" className="select-chip" onClick={() => irA("nota")}>No tengo folio</button>
              </div>
            </div>
            <div className="notice">
              <strong>Con folio</strong> ubicamos su registro al instante. <strong>Sin folio</strong>,
              deje sus datos y quién es; Sistemas lo ubica por su nombre. En ningún caso se
              muestran datos de su registro (LFPDPPP).
            </div>
          </div>
        )}

        {modo === "folio" && (
          <>
            <p style={{ marginBottom: 12 }}>
              <button type="button" className="link-action" onClick={() => irA("elegir")}>← Cambiar</button>
            </p>
            <form onSubmit={enviarFolio} style={{ display: "grid", gap: 16 }}>
              <div className="field">
                <span>¿Qué necesita?</span>
                <div className="chip-row">
                  <button type="button" className={`select-chip ${tipo === "actualizacion" ? "on" : ""}`}
                    onClick={() => setTipo("actualizacion")}>Actualizar mis datos</button>
                  <button type="button" className={`select-chip ${tipo === "baja" ? "on" : ""}`}
                    onClick={() => setTipo("baja")}>Dar de baja mi registro</button>
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <span>Folio de su comprobante</span>
                  <input className="input" value={folio} onChange={(e) => setFolio(e.target.value)}
                    placeholder="SATAG-000123" autoComplete="off" />
                </div>
                <div className="field">
                  <span>Placas (o No. de TAG si no tiene placas)</span>
                  <input className="input" value={placasOTag}
                    onChange={(e) => setPlacasOTag(e.target.value.toUpperCase())}
                    placeholder="ABC1234" autoComplete="off" />
                </div>
              </div>

              <div className="field">
                <span>Cuéntenos brevemente qué necesita</span>
                <textarea className="input" rows={3} maxLength={500} value={detalle}
                  onChange={(e) => setDetalle(e.target.value)}
                  placeholder={tipo === "baja"
                    ? "Ej. egreso del colegio, venta del vehículo…"
                    : "Ej. placas nuevas, cambio de vehículo, TAG dañado…"} />
                <p className="hint">{detalle.length}/500</p>
              </div>

              <button className="primary-action" type="submit" disabled={enviando || !listoFolio}>
                {enviando ? "Enviando…" : "Enviar solicitud"}
              </button>
              {error && <p className="submit-error" role="alert">{error}</p>}
            </form>
          </>
        )}

        {modo === "nota" && (
          <>
            <p style={{ marginBottom: 12 }}>
              <button type="button" className="link-action" onClick={() => irA("elegir")}>← Cambiar</button>
            </p>
            <form onSubmit={enviarNota} style={{ display: "grid", gap: 16 }}>
              <div className="field">
                <span>¿Quién solicita?</span>
                <div className="chip-row">
                  {ROLES.map((r) => (
                    <button key={r.valor} type="button"
                      className={`select-chip ${solicitanteRol === r.valor ? "on" : ""}`}
                      onClick={() => setSolicitanteRol(r.valor)}>{r.etiqueta}</button>
                  ))}
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <span>Su nombre</span>
                  <input className="input" value={solicitante} onChange={(e) => setSolicitante(e.target.value)}
                    placeholder="Nombre de quien solicita" autoComplete="off" />
                </div>
                <div className="field">
                  <span>Descripción del coche (opcional)</span>
                  <input className="input" value={vehiculo} onChange={(e) => setVehiculo(e.target.value)}
                    placeholder="Ej. Sienna blanca" autoComplete="off" />
                </div>
              </div>

              {esPadres && (
                <div className="grid-2">
                  <div className="field">
                    <span>Nombre del alumno</span>
                    <input className="input" value={alumno} onChange={(e) => setAlumno(e.target.value)}
                      placeholder="Nombre del alumno" autoComplete="off" />
                  </div>
                  <div className="field">
                    <span>Grado y grupo</span>
                    <input className="input" value={grado} onChange={(e) => setGrado(e.target.value)}
                      placeholder="Ej. 2° A" autoComplete="off" />
                  </div>
                </div>
              )}

              <div className="field">
                <span>¿Qué necesita?</span>
                <div className="chip-row">
                  {TRAMITES.map((t) => (
                    <button key={t.valor} type="button"
                      className={`select-chip ${tramite === t.valor ? "on" : ""}`}
                      onClick={() => setTramite(t.valor)}>{t.etiqueta}</button>
                  ))}
                </div>
              </div>

              <div className="field">
                <span>Cuéntenos más (detalles)</span>
                <textarea className="input" rows={3} maxLength={500} value={notaDetalle}
                  onChange={(e) => setNotaDetalle(e.target.value)}
                  placeholder="Ej. TAG dañado, egreso del colegio, cambio de vehículo…" />
                <p className="hint">{notaDetalle.length}/500</p>
              </div>

              <button className="primary-action" type="submit" disabled={enviando || !listoNota}>
                {enviando ? "Enviando…" : "Enviar nota"}
              </button>
              {error && <p className="submit-error" role="alert">{error}</p>}
            </form>
          </>
        )}

        <div className="notice" style={{ marginTop: 16 }}>
          <strong>Privacidad.</strong> Esta página no muestra ningún dato de su registro. Los datos
          que capture se usan solo para ubicarlo y atender su solicitud (LFPDPPP).
        </div>

        <p style={{ marginTop: 16, textAlign: "right" }}>
          <Link href="/" className="link-action">← Volver al inicio</Link>
        </p>
      </section>
    </main>
  );
}
