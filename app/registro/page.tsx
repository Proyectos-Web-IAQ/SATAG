"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import SignaturePad, { type FirmaTrazos } from "@/components/SignaturePad";
import {
  getMarcas, getModelos, getColores, getReglamentoVigente, getAvisoVigente, crearRegistro,
} from "@/lib/supabase/api";
import type { AvisoVigente } from "@/lib/supabase/api";
import type { TipoUsuario, CrearRegistroResultado, NombrePersona, ReglamentoVersion } from "@/lib/mock/types";

const STEPS = ["Datos", "Vehículo", "Aviso", "Reglamento", "Firma", "Listo"];

function nombreCompleto(partes: NombrePersona): string {
  return [partes.nombre, partes.apellidoPaterno, partes.apellidoMaterno]
    .map((v) => v.trim())
    .filter(Boolean)
    .join(" ");
}

// ¿El contenedor esta al final (o no necesita scroll)?
function alFinal(el: HTMLElement): boolean {
  return el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
}

export default function RegistroWizard() {
  const [step, setStep] = useState(0);
  const [mostrarErrores, setMostrarErrores] = useState(false);
  const [marcas, setMarcas] = useState<string[]>([]);
  const [colores, setColores] = useState<string[]>([]);
  const [reglamento, setReglamento] = useState<ReglamentoVersion | null>(null);
  const [aviso, setAviso] = useState<AvisoVigente | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<CrearRegistroResultado | null>(null);

  // ---- Formulario ----
  const [conductorNombre, setConductorNombre] = useState("");
  const [conductorApellidoPaterno, setConductorApellidoPaterno] = useState("");
  const [conductorApellidoMaterno, setConductorApellidoMaterno] = useState("");
  const [gestionanteDistinto, setGestionanteDistinto] = useState(false);
  const [gestionanteNombre, setGestionanteNombre] = useState("");
  const [gestionanteApellidoPaterno, setGestionanteApellidoPaterno] = useState("");
  const [gestionanteApellidoMaterno, setGestionanteApellidoMaterno] = useState("");
  const [tipoUsuario, setTipoUsuario] = useState<TipoUsuario>("padres");
  const [marca, setMarca] = useState("");
  const [marcaOtro, setMarcaOtro] = useState("");
  const [modelos, setModelos] = useState<string[]>([]);
  const [modelo, setModelo] = useState("");
  const [modeloOtro, setModeloOtro] = useState("");
  const [color, setColor] = useState("");
  const [colorOtro, setColorOtro] = useState("");
  const [placas, setPlacas] = useState("");
  const [sinPlacas, setSinPlacas] = useState(false);
  const [aceptaPrivacidad, setAceptaPrivacidad] = useState(false);
  const [avisoLeido, setAvisoLeido] = useState(false);
  const [acepta, setAcepta] = useState(false);
  const [reglamentoLeido, setReglamentoLeido] = useState(false);
  const [firma, setFirma] = useState("");
  const [trazos, setTrazos] = useState<FirmaTrazos | null>(null);

  const avisoRef = useRef<HTMLDivElement>(null);
  const reglamentoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMarcas().then(setMarcas);
    getColores().then(setColores);
    getReglamentoVigente().then(setReglamento);
    getAvisoVigente().then(setAviso);
  }, []);

  // Modelo depende de la marca. Al cambiar marca, se recargan los modelos y se
  // limpia la seleccion previa. Si la marca es "Otro" (o no hay catalogo), el
  // modelo se captura como texto libre.
  useEffect(() => {
    setModeloOtro("");
    if (!marca) { setModelos([]); setModelo(""); return; }
    if (marca === "Otro") { setModelos([]); setModelo("Otro"); return; }
    setModelo("");
    getModelos(marca).then(setModelos).catch(() => setModelos([]));
  }, [marca]);

  // Si el aviso/reglamento caben sin scroll, se consideran "leidos" al entrar.
  useEffect(() => {
    const el = avisoRef.current;
    if (step === 2 && el && el.scrollHeight <= el.clientHeight + 8) setAvisoLeido(true);
  }, [step, aviso]);
  useEffect(() => {
    const el = reglamentoRef.current;
    if (step === 3 && el && el.scrollHeight <= el.clientHeight + 8) setReglamentoLeido(true);
  }, [step, reglamento]);

  const marcaFinal = marca === "Otro" ? marcaOtro : marca;
  const modeloFinal = modelo === "Otro" ? modeloOtro : modelo;
  const colorFinal = color === "Otro" ? colorOtro : color;
  const conductorNombrePartes: NombrePersona = {
    nombre: conductorNombre,
    apellidoPaterno: conductorApellidoPaterno,
    apellidoMaterno: conductorApellidoMaterno,
  };
  const gestionanteNombrePartes: NombrePersona = {
    nombre: gestionanteNombre,
    apellidoPaterno: gestionanteApellidoPaterno,
    apellidoMaterno: gestionanteApellidoMaterno,
  };
  const conductorNombreCompleto = nombreCompleto(conductorNombrePartes);
  const gestionanteNombreCompleto = nombreCompleto(gestionanteNombrePartes);

  // Validación por paso. Devuelve un mapa campo -> mensaje.
  function validarPaso(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!conductorApellidoPaterno.trim()) e.conductorApellidoPaterno = "Escribe el apellido paterno.";
      if (!conductorApellidoMaterno.trim()) e.conductorApellidoMaterno = "Escribe el apellido materno.";
      if (!conductorNombre.trim()) e.conductorNombre = "Escribe el nombre o nombres.";
      if (gestionanteDistinto) {
        if (!gestionanteApellidoPaterno.trim()) e.gestionanteApellidoPaterno = "Escribe el apellido paterno.";
        if (!gestionanteApellidoMaterno.trim()) e.gestionanteApellidoMaterno = "Escribe el apellido materno.";
        if (!gestionanteNombre.trim()) e.gestionanteNombre = "Escribe el nombre o nombres.";
      }
    }
    if (s === 1) {
      if (!marcaFinal.trim()) e.marca = "Selecciona o escribe la marca.";
      if (!modeloFinal.trim()) e.modelo = "Selecciona o escribe el modelo.";
      if (!colorFinal.trim()) e.color = "Selecciona o escribe el color.";
      if (!sinPlacas) {
        if (!placas.trim()) e.placas = "Captura las placas o marca «sin placas».";
        else if (!/^[A-Z0-9]{5,8}$/.test(placas.trim())) e.placas = "Formato de placa no válido (5–8 letras o números).";
      }
    }
    if (s === 2 && !aceptaPrivacidad) e.aceptaPrivacidad = "Debes aceptar el aviso de privacidad para continuar.";
    if (s === 3 && !acepta) e.acepta = "Debes aceptar el reglamento para continuar.";
    if (s === 4 && !firma) e.firma = "Firma en el recuadro para continuar.";
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
    const e = validarPaso(4);
    if (Object.keys(e).length) { setMostrarErrores(true); return; }
    setEnviando(true);
    setError(null);
    try {
      const res = await crearRegistro({
        usuarioNombrePartes: conductorNombrePartes,
        gestionanteNombrePartes: gestionanteDistinto ? gestionanteNombrePartes : null,
        tipoUsuario,
        marca: marcaFinal, modelo: modeloFinal, color: colorFinal,
        placas: sinPlacas ? null : placas, sinPlacas,
        procedenciaTag: "escuela", observaciones: null,
        firmaDataUrl: firma,
        firmaTrazos: trazos,
        firmanteNombre: gestionanteDistinto ? gestionanteNombreCompleto : conductorNombreCompleto,
        aceptaReglamento: acepta,
      });
      setResultado(res);
      setStep(5);
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
              <span>Nombre(s) del conductor</span>
              <input className={`input ${errores.conductorNombre ? "invalid" : ""}`} value={conductorNombre}
                onChange={(e) => setConductorNombre(e.target.value)} placeholder="Ej. Juan Carlos" />
              <p className="hint" style={{ margin: 0 }}>
                La persona que <strong>manejará el auto</strong> que entra al estacionamiento —
                no necesariamente quien paga o firma.
              </p>
              {errores.conductorNombre && <p className="field-error">{errores.conductorNombre}</p>}
            </div>
            <div className="grid-2">
              <div className="field">
                <span>Apellido paterno del conductor</span>
                <input className={`input ${errores.conductorApellidoPaterno ? "invalid" : ""}`} value={conductorApellidoPaterno}
                  onChange={(e) => setConductorApellidoPaterno(e.target.value)} placeholder="Ej. Pérez" />
                {errores.conductorApellidoPaterno && <p className="field-error">{errores.conductorApellidoPaterno}</p>}
              </div>
              <div className="field">
                <span>Apellido materno del conductor</span>
                <input className={`input ${errores.conductorApellidoMaterno ? "invalid" : ""}`} value={conductorApellidoMaterno}
                  onChange={(e) => setConductorApellidoMaterno(e.target.value)} placeholder="Ej. López" />
                {errores.conductorApellidoMaterno && <p className="field-error">{errores.conductorApellidoMaterno}</p>}
              </div>
            </div>
            <label className="check" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={gestionanteDistinto} onChange={(e) => setGestionanteDistinto(e.target.checked)} />
              <span>El pago y la firma los hace otra persona (padre/tutor/cónyuge).</span>
            </label>
            {gestionanteDistinto && (
              <>
                <div className="field">
                  <span>Nombre(s) del gestionante</span>
                  <input className={`input ${errores.gestionanteNombre ? "invalid" : ""}`} value={gestionanteNombre}
                    onChange={(e) => setGestionanteNombre(e.target.value)} placeholder="Ej. María Fernanda" />
                  {errores.gestionanteNombre && <p className="field-error">{errores.gestionanteNombre}</p>}
                </div>
                <div className="grid-2">
                  <div className="field">
                    <span>Apellido paterno del gestionante</span>
                    <input className={`input ${errores.gestionanteApellidoPaterno ? "invalid" : ""}`} value={gestionanteApellidoPaterno}
                      onChange={(e) => setGestionanteApellidoPaterno(e.target.value)} placeholder="Ej. López" />
                    {errores.gestionanteApellidoPaterno && <p className="field-error">{errores.gestionanteApellidoPaterno}</p>}
                  </div>
                  <div className="field">
                    <span>Apellido materno del gestionante</span>
                    <input className={`input ${errores.gestionanteApellidoMaterno ? "invalid" : ""}`} value={gestionanteApellidoMaterno}
                      onChange={(e) => setGestionanteApellidoMaterno(e.target.value)} placeholder="Ej. Ruiz" />
                    {errores.gestionanteApellidoMaterno && <p className="field-error">{errores.gestionanteApellidoMaterno}</p>}
                  </div>
                </div>
              </>
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
                {marca === "Otro" ? (
                  <input className={`input ${errores.modelo ? "invalid" : ""}`} value={modeloOtro}
                    onChange={(e) => setModeloOtro(e.target.value)} placeholder="Escribe el modelo" />
                ) : (
                  <>
                    <select className={`select ${errores.modelo ? "invalid" : ""}`} value={modelo}
                      onChange={(e) => setModelo(e.target.value)} disabled={!marca}>
                      <option value="">{marca ? "Selecciona…" : "Elige la marca primero"}</option>
                      {modelos.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    {modelo === "Otro" && (
                      <input className="input" value={modeloOtro} onChange={(e) => setModeloOtro(e.target.value)} placeholder="Especifica el modelo" />
                    )}
                  </>
                )}
                {errores.modelo && <p className="field-error">{errores.modelo}</p>}
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

        {/* ----- Paso 2: Aviso de privacidad ----- */}
        {step === 2 && (
          <>
            <header className="survey-header"><h1>Aviso de privacidad</h1></header>
            <p className="lead">Lee el aviso completo. La casilla se habilita al llegar al final.</p>
            <div
              className="reglamento"
              ref={avisoRef}
              onScroll={(e) => { if (alFinal(e.currentTarget)) setAvisoLeido(true); }}
            >
              {(aviso?.parrafos ?? ["Cargando…"]).map((p, i) => (
                <p key={i} style={{ margin: "0 0 10px" }}>{p}</p>
              ))}
            </div>
            {!avisoLeido && <p className="hint" style={{ marginTop: 8 }}>Desplázate hasta el final para poder aceptar.</p>}
            <label className="check" style={{ marginTop: 16 }}>
              <input type="checkbox" checked={aceptaPrivacidad} disabled={!avisoLeido}
                onChange={(e) => setAceptaPrivacidad(e.target.checked)} />
              <span>He leído el aviso de privacidad de SATAG y acepto el tratamiento de mis datos personales para las finalidades indicadas.</span>
            </label>
            {errores.aceptaPrivacidad && <p className="field-error">{errores.aceptaPrivacidad}</p>}
          </>
        )}

        {/* ----- Paso 3: Reglamento ----- */}
        {step === 3 && (
          <>
            <header className="survey-header"><h1>Reglamento de acceso</h1></header>
            <p className="lead">Lee el reglamento completo. La casilla se habilita al llegar a la cláusula final.</p>
            <div
              className="reglamento"
              ref={reglamentoRef}
              onScroll={(e) => { if (alFinal(e.currentTarget)) setReglamentoLeido(true); }}
            >
              <ol>{(reglamento?.clausulas ?? ["Cargando…"]).map((c, i) => <li key={i}>{c}</li>)}</ol>
            </div>
            {!reglamentoLeido && <p className="hint" style={{ marginTop: 8 }}>Desplázate hasta la cláusula 22 para poder aceptar.</p>}
            <label className="check" style={{ marginTop: 16 }}>
              <input type="checkbox" checked={acepta} disabled={!reglamentoLeido}
                onChange={(e) => setAcepta(e.target.checked)} />
              <span>He leído y acepto el reglamento de acceso vehicular (v{reglamento?.version ?? "—"}).</span>
            </label>
            {errores.acepta && <p className="field-error">{errores.acepta}</p>}
          </>
        )}

        {/* ----- Paso 4: Firma ----- */}
        {step === 4 && (
          <>
            <header className="survey-header"><h1>Firma</h1></header>
            <p className="lead">
              Firmará <strong>{gestionanteDistinto ? gestionanteNombreCompleto || "el gestionante" : conductorNombreCompleto || "el conductor"}</strong>.
            </p>
            <SignaturePad onChange={setFirma} onTrazos={setTrazos} />
            <p className="hint" style={{ marginTop: 8 }}>Puedes firmar con el dedo (táctil) o con el mouse.</p>
            {errores.firma && <p className="field-error">{errores.firma}</p>}
          </>
        )}

        {/* ----- Paso 5: Comprobante ----- */}
        {step === 5 && resultado && (
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

        {step < 5 && (
          <div className="btn-row">
            <button type="button" className="ghost-action" onClick={retroceder} disabled={step === 0}>Atrás</button>
            {step < 4 ? (
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
