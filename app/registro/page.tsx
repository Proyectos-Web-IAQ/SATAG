"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import SignaturePad from "@/components/SignaturePad";
import { getMarcas, getColores, getReglamentoVigente, crearRegistro } from "@/lib/mock/api";
import type { TipoUsuario, CrearRegistroResultado, ReglamentoVersion } from "@/lib/mock/types";

const STEPS = ["Datos", "Vehículo", "Reglamento", "Firma", "Listo"];

export default function RegistroWizard() {
  const [step, setStep] = useState(0);
  const [mostrarErrores, setMostrarErrores] = useState(false);
  const [marcas, setMarcas] = useState<string[]>([]);
  const [colores, setColores] = useState<string[]>([]);
  const [reglamento, setReglamento] = useState<ReglamentoVersion | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<CrearRegistroResultado | null>(null);

  // ---- Formulario ----
  const [conductorNombre, setConductorNombre] = useState("");
  const [gestionanteDistinto, setGestionanteDistinto] = useState(false);
  const [gestionanteNombre, setGestionanteNombre] = useState("");
  const [tipoUsuario, setTipoUsuario] = useState<TipoUsuario>("padres");
  const [marca, setMarca] = useState("");
  const [marcaOtro, setMarcaOtro] = useState("");
  const [modelo, setModelo] = useState("");
  const [color, setColor] = useState("");
  const [colorOtro, setColorOtro] = useState("");
  const [placas, setPlacas] = useState("");
  const [sinPlacas, setSinPlacas] = useState(false);
  const [acepta, setAcepta] = useState(false);
  const [firma, setFirma] = useState("");

  useEffect(() => {
    getMarcas().then(setMarcas);
    getColores().then(setColores);
    getReglamentoVigente().then(setReglamento);
  }, []);

  const marcaFinal = marca === "Otro" ? marcaOtro : marca;
  const colorFinal = color === "Otro" ? colorOtro : color;

  // Validación por paso. Devuelve un mapa campo -> mensaje.
  function validarPaso(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!conductorNombre.trim()) e.conductor = "Escribe el nombre de quien conducirá el vehículo.";
      if (gestionanteDistinto && !gestionanteNombre.trim()) e.gestionante = "Escribe el nombre de quien paga y firma.";
    }
    if (s === 1) {
      if (!marcaFinal.trim()) e.marca = "Selecciona o escribe la marca.";
      if (!colorFinal.trim()) e.color = "Selecciona o escribe el color.";
      if (!sinPlacas) {
        if (!placas.trim()) e.placas = "Captura las placas o marca «sin placas».";
        else if (!/^[A-Z0-9]{5,8}$/.test(placas.trim())) e.placas = "Formato de placa no válido (5–8 letras o números).";
      }
    }
    if (s === 2 && !acepta) e.acepta = "Debes aceptar el reglamento para continuar.";
    if (s === 3 && !firma) e.firma = "Firma en el recuadro para continuar.";
    return e;
  }

  const errores = mostrarErrores ? validarPaso(step) : {};

  function avanzar() {
    const e = validarPaso(step);
    if (Object.keys(e).length) { setMostrarErrores(true); return; }
    setMostrarErrores(false);
    setStep((s) => s + 1);
  }
  function retroceder() {
    setMostrarErrores(false);
    setStep((s) => s - 1);
  }

  async function enviarValidado() {
    const e = validarPaso(3);
    if (Object.keys(e).length) { setMostrarErrores(true); return; }
    setEnviando(true);
    setError(null);
    try {
      const res = await crearRegistro({
        usuarioNombre: conductorNombre,
        gestionanteNombre: gestionanteDistinto ? gestionanteNombre : null,
        tipoUsuario,
        marca: marcaFinal, modelo, color: colorFinal,
        placas: sinPlacas ? null : placas, sinPlacas,
        procedenciaTag: "escuela", observaciones: null,
        firmaDataUrl: firma,
        firmanteNombre: gestionanteDistinto ? gestionanteNombre : conductorNombre,
        aceptaReglamento: acepta,
      });
      setResultado(res);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="survey-panel">
        <div className="top-row">
          <div className="stepper" style={{ flex: 1, marginRight: 12 }} aria-hidden>
            {STEPS.map((_, i) => (
              <div key={i} className={`stepper__item ${i < step ? "done" : ""} ${i === step ? "active" : ""}`} />
            ))}
          </div>
          <span className="step-pill">Paso {Math.min(step + 1, STEPS.length)} de {STEPS.length}</span>
        </div>

        {/* ----- Paso 0: Datos ----- */}
        {step === 0 && (
          <>
            <header className="survey-header"><h1>Datos del solicitante</h1></header>
            <div className="field">
              <span>Nombre de quien conducirá el vehículo</span>
              <input className={`input ${errores.conductor ? "invalid" : ""}`} value={conductorNombre}
                onChange={(e) => setConductorNombre(e.target.value)} placeholder="Ej. Juan Pérez López" />
              <p className="hint" style={{ margin: 0 }}>
                La persona que <strong>manejará el auto</strong> que entra al estacionamiento —
                no necesariamente quien paga o firma.
              </p>
              {errores.conductor && <p className="field-error">{errores.conductor}</p>}
            </div>
            <label className="check" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={gestionanteDistinto} onChange={(e) => setGestionanteDistinto(e.target.checked)} />
              <span>El pago y la firma los hace otra persona (padre/tutor/cónyuge).</span>
            </label>
            {gestionanteDistinto && (
              <div className="field">
                <span>Nombre de quien paga y firma (gestionante)</span>
                <input className={`input ${errores.gestionante ? "invalid" : ""}`} value={gestionanteNombre}
                  onChange={(e) => setGestionanteNombre(e.target.value)} placeholder="Ej. María López Ruiz" />
                {errores.gestionante && <p className="field-error">{errores.gestionante}</p>}
              </div>
            )}
            <div className="field">
              <span>Tipo de usuario</span>
              <select className="select" value={tipoUsuario} onChange={(e) => setTipoUsuario(e.target.value as TipoUsuario)}>
                <option value="padres">Padre / Tutor</option>
                <option value="maestro">Maestro</option>
                <option value="alumno">Alumno</option>
                <option value="admin">Administración</option>
              </select>
            </div>
          </>
        )}

        {/* ----- Paso 1: Vehículo ----- */}
        {step === 1 && (
          <>
            <header className="survey-header"><h1>Datos del vehículo</h1></header>
            <div className="grid-2">
              <div className="field">
                <span>Marca</span>
                <select className={`select ${errores.marca ? "invalid" : ""}`} value={marca} onChange={(e) => setMarca(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                {marca === "Otro" && (
                  <input className="input" value={marcaOtro} onChange={(e) => setMarcaOtro(e.target.value)} placeholder="Especifica la marca" />
                )}
                {errores.marca && <p className="field-error">{errores.marca}</p>}
              </div>
              <div className="field">
                <span>Modelo</span>
                <input className="input" value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Ej. Sienna" />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <span>Color</span>
                <select className={`select ${errores.color ? "invalid" : ""}`} value={color} onChange={(e) => setColor(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {colores.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                {color === "Otro" && (
                  <input className="input" value={colorOtro} onChange={(e) => setColorOtro(e.target.value)} placeholder="Especifica el color" />
                )}
                {errores.color && <p className="field-error">{errores.color}</p>}
              </div>
              <div className="field">
                <span>Placas</span>
                <input className={`input ${errores.placas ? "invalid" : ""}`} value={placas} disabled={sinPlacas}
                  onChange={(e) => setPlacas(e.target.value.toUpperCase())} placeholder="ABC1234" />
                {errores.placas && <p className="field-error">{errores.placas}</p>}
              </div>
            </div>
            <label className="check">
              <input type="checkbox" checked={sinPlacas} onChange={(e) => setSinPlacas(e.target.checked)} />
              <span>El vehículo aún no tiene placas (nuevo o con permiso).</span>
            </label>
          </>
        )}

        {/* ----- Paso 2: Reglamento ----- */}
        {step === 2 && (
          <>
            <header className="survey-header"><h1>Reglamento de acceso</h1></header>
            <p className="lead">Lee el reglamento y acéptalo para continuar.</p>
            <div className="reglamento">
              <ol>{(reglamento?.clausulas ?? ["Cargando…"]).map((c, i) => <li key={i}>{c}</li>)}</ol>
            </div>
            <label className="check" style={{ marginTop: 16 }}>
              <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
              <span>He leído y acepto el reglamento de acceso vehicular (v{reglamento?.version ?? "—"}).</span>
            </label>
            {errores.acepta && <p className="field-error">{errores.acepta}</p>}
          </>
        )}

        {/* ----- Paso 3: Firma ----- */}
        {step === 3 && (
          <>
            <header className="survey-header"><h1>Firma</h1></header>
            <p className="lead">
              Firmará <strong>{gestionanteDistinto ? gestionanteNombre || "el gestionante" : conductorNombre || "el conductor"}</strong>.
            </p>
            <SignaturePad onChange={setFirma} />
            <p className="hint" style={{ marginTop: 8 }}>Puedes firmar con el dedo (táctil) o con el mouse.</p>
            {errores.firma && <p className="field-error">{errores.firma}</p>}
          </>
        )}

        {/* ----- Paso 4: Comprobante ----- */}
        {step === 4 && resultado && (
          <div className="comprobante">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brand-sello" src="/sello-asuncion.png" alt="" />
            <span className="badge">Pendiente</span>
            <header className="survey-header" style={{ marginTop: 12 }}><h1>¡Registro recibido!</h1></header>
            <p className="lead">Tu folio de seguimiento es:</p>
            <div className="folio">{resultado.folio}</div>
            <p style={{ marginTop: 16, color: "var(--ink)" }}>
              Preséntate en administración para <strong>asignación de estacionamiento</strong> y el
              <strong> pago del TAG ($100, efectivo)</strong>. TI instalará y activará tu TAG.
            </p>
            <div className="btn-row no-print" style={{ justifyContent: "center", gap: 12, marginTop: 16 }}>
              <button type="button" className="ghost-action" onClick={() => window.print()}>Imprimir / Descargar</button>
              <Link href="/" className="primary-action" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                Volver al inicio
              </Link>
            </div>
          </div>
        )}

        {error && <p className="submit-error" role="alert">{error}</p>}

        {step < 4 && (
          <div className="btn-row">
            <button type="button" className="ghost-action" onClick={retroceder} disabled={step === 0}>Atrás</button>
            {step < 3 ? (
              <button type="button" className="primary-action" onClick={avanzar}>Siguiente</button>
            ) : (
              <button type="button" className="primary-action" onClick={enviarValidado} disabled={enviando}>
                {enviando ? "Enviando…" : "Enviar registro"}
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
