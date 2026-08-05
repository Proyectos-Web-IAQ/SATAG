"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import SignaturePad, { type FirmaTrazos } from "@/components/SignaturePad";
import {
  getMarcas, getModelos, getColores, getReglamentoVigente, getAvisoVigente, getAvisoSimplificado, crearRegistro,
} from "@/lib/supabase/api";
import type { AvisoVigente } from "@/lib/supabase/api";
import type { TipoUsuario, GestionanteRelacion, CrearRegistroResultado, NombrePersona, ProcedenciaTag, ReglamentoVersion } from "@/lib/mock/types";

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
  const [avisoCorto, setAvisoCorto] = useState<string | null>(null);
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
  const [gestionanteRelacion, setGestionanteRelacion] = useState<GestionanteRelacion | "">("");
  const [esMenor, setEsMenor] = useState(false);
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
  // CC-01: el TAG puede ser de la escuela o propio (traido por el titular).
  // En ambos casos el tramite se cobra igual; la procedencia queda registrada.
  const [procedenciaTag, setProcedenciaTag] = useState<ProcedenciaTag>("escuela");
  const [aceptaPrivacidad, setAceptaPrivacidad] = useState(false);
  const [avisoLeido, setAvisoLeido] = useState(false);
  const [acepta, setAcepta] = useState(false);
  const [reglamentoLeido, setReglamentoLeido] = useState(false);
  const [firma, setFirma] = useState("");
  const [trazos, setTrazos] = useState<FirmaTrazos | null>(null);
  const [avisoCortoAbierto, setAvisoCortoAbierto] = useState(false);

  const avisoRef = useRef<HTMLDivElement>(null);
  const reglamentoRef = useRef<HTMLDivElement>(null);
  // Tipo de usuario que habia antes de marcar "menor de edad", para devolverlo
  // si la casilla se desmarca (D-02). Forzar "alumno" MIENTRAS esta marcada es
  // deliberado; que se quede pegado despues, no.
  const tipoAntesDeMenor = useRef<TipoUsuario | null>(null);

  const avisoValido = Boolean(aviso?.parrafos && aviso.parrafos.length > 0);
  const reglamentoValido = Boolean(reglamento?.clausulas && reglamento.clausulas.length > 0);

  // Cada carga lleva su .catch: sin el, un fallo de red deja una promesa
  // rechazada sin atender y el estado en null "por accidente". Dejarlo
  // explicito es lo que permite distinguir "no cargo" de "cargo vacio", que es
  // de lo que depende que las puertas del consentimiento no se abran solas.
  useEffect(() => {
    getMarcas().then(setMarcas).catch(() => setMarcas([]));
    getColores().then(setColores).catch(() => setColores([]));
    getReglamentoVigente().then(setReglamento).catch(() => setReglamento(null));
    getAvisoVigente().then(setAviso).catch(() => setAviso(null));
    getAvisoSimplificado().then(setAvisoCorto).catch(() => setAvisoCorto(null));
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

  // Si el aviso/reglamento caben sin scroll, se consideran "leidos" al entrar (solo si el contenido cargo correctamente).
  useEffect(() => {
    const el = avisoRef.current;
    if (step === 2 && avisoValido && el && el.scrollHeight <= el.clientHeight + 8) setAvisoLeido(true);
  }, [step, aviso, avisoValido]);

  useEffect(() => {
    const el = reglamentoRef.current;
    if (step === 3 && reglamentoValido && el && el.scrollHeight <= el.clientHeight + 8) setReglamentoLeido(true);
  }, [step, reglamento, reglamentoValido]);

  // El aviso simplificado viene como un solo texto con saltos de línea. El
  // primer párrafo es el que la ley exige a la vista al recabar los datos
  // (responsable + finalidades); el resto se despliega bajo demanda para no
  // empujar el formulario media pantalla hacia abajo.
  const avisoCortoParrafos = (avisoCorto ?? "")
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);

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

  // Un menor de edad SIEMPRE requiere gestionante (su representante firma). CC-11.
  const hayGestionante = gestionanteDistinto || esMenor;
  // Relaciones validas del gestionante segun el caso (el menor exige padre/madre/tutor).
  const relacionesGestionante: GestionanteRelacion[] = esMenor
    ? ["padre", "madre", "tutor"]
    : ["padre", "madre", "tutor", "otro"];

  // Validación por paso. Devuelve un mapa campo -> mensaje.
  function validarPaso(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!conductorApellidoPaterno.trim()) e.conductorApellidoPaterno = "Escriba el apellido paterno.";
      if (!conductorApellidoMaterno.trim()) e.conductorApellidoMaterno = "Escriba el apellido materno.";
      if (!conductorNombre.trim()) e.conductorNombre = "Escriba el nombre o nombres.";
      if (hayGestionante) {
        if (!gestionanteApellidoPaterno.trim()) e.gestionanteApellidoPaterno = "Escriba el apellido paterno.";
        if (!gestionanteApellidoMaterno.trim()) e.gestionanteApellidoMaterno = "Escriba el apellido materno.";
        if (!gestionanteNombre.trim()) e.gestionanteNombre = "Escriba el nombre o nombres.";
        if (!gestionanteRelacion) {
          e.gestionanteRelacion = esMenor
            ? "Indique si es padre, madre o tutor del menor."
            : "Indique la relación del gestionante.";
        }
      }
    }
    if (s === 1) {
      if (!marcaFinal.trim()) e.marca = "Seleccione o escriba la marca.";
      if (!modeloFinal.trim()) e.modelo = "Seleccione o escriba el modelo.";
      if (!colorFinal.trim()) e.color = "Seleccione o escriba el color.";
      if (!sinPlacas) {
        if (!placas.trim()) e.placas = "Capture las placas o marque «sin placas».";
        else if (!/^[A-Z0-9]{5,8}$/.test(placas.trim())) e.placas = "Formato de placa no válido (5–8 letras o números).";
      }
    }
    if (s === 2) {
      if (!avisoValido) e.aceptaPrivacidad = "No se puede continuar porque el aviso de privacidad no se ha cargado correctamente.";
      else if (!aceptaPrivacidad) e.aceptaPrivacidad = "Debe aceptar el aviso de privacidad para continuar.";
    }
    if (s === 3) {
      if (!reglamentoValido) e.acepta = "No se puede continuar porque el reglamento no se ha cargado correctamente.";
      else if (!acepta) e.acepta = "Debe aceptar el reglamento para continuar.";
    }
    if (s === 4 && !firma) e.firma = "Firme en el recuadro para continuar.";
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
        gestionanteNombrePartes: hayGestionante ? gestionanteNombrePartes : null,
        gestionanteRelacion: hayGestionante ? (gestionanteRelacion || null) : null,
        usuarioEsMenor: esMenor,
        firmanteRol: hayGestionante ? (gestionanteRelacion || "otro") : "usuario",
        tipoUsuario,
        marca: marcaFinal, modelo: modeloFinal, color: colorFinal,
        placas: sinPlacas ? null : placas, sinPlacas,
        procedenciaTag, observaciones: null,
        firmaDataUrl: firma,
        firmaTrazos: trazos,
        firmanteNombre: hayGestionante ? gestionanteNombreCompleto : conductorNombreCompleto,
        aceptaReglamento: acepta,
        metadata: {
          consentimiento: {
            aceptaReglamento: acepta,
            aceptaPrivacidad,
            reglamentoLeido,
            avisoLeido,
            reglamentoVersion: reglamento?.version ?? null,
            avisoVersion: aviso?.version ?? null,
          },
        },
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
            {/* Aviso simplificado (CC-09): la ley pide informar al momento de
                recabar los datos, no después. El aviso integral se acepta con
                firma en el paso 2.

                Va plegado salvo el primer párrafo. El art. 16 fr. II pide que
                aquí consten el responsable, las finalidades y el mecanismo para
                conocer el integral: lo primero y lo segundo están en ese
                párrafo, y el mecanismo es el enlace, que NUNCA se pliega. Lo
                que se oculta es el detalle de los datos recabados y el canal
                ARCO, que además viven completos en el aviso integral. */}
            {avisoCortoParrafos.length > 0 && (
              <div className="aviso-corto">
                <p className="panel-title" style={{ marginTop: 0 }}>Aviso de privacidad</p>
                <p style={{ margin: "0 0 8px" }}>{avisoCortoParrafos[0]}</p>
                {avisoCortoAbierto && avisoCortoParrafos.slice(1).map((p, i) => (
                  <p key={i} style={{ margin: "0 0 8px" }}>{p}</p>
                ))}
                <div className="aviso-corto__acciones">
                  {avisoCortoParrafos.length > 1 && (
                    <button type="button" className="link-action" aria-expanded={avisoCortoAbierto}
                      onClick={() => setAvisoCortoAbierto((v) => !v)}>
                      {avisoCortoAbierto ? "Ocultar el aviso" : "Leer el aviso completo"}
                    </button>
                  )}
                  <a href="/aviso-de-privacidad/" target="_blank" rel="noreferrer">
                    Consultar el aviso de privacidad integral SATAG
                  </a>
                </div>
              </div>
            )}
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
              <input type="checkbox" checked={esMenor}
                onChange={(e) => {
                  const marcado = e.target.checked;
                  setEsMenor(marcado);
                  // El menor no puede firmar: si la relación previa era "otro", se limpia.
                  if (marcado && gestionanteRelacion === "otro") setGestionanteRelacion("");
                  if (marcado) {
                    // Un conductor menor es, por definición, alumno. Se recuerda el
                    // tipo anterior para no perderlo si la casilla se desmarca.
                    tipoAntesDeMenor.current = tipoUsuario;
                    setTipoUsuario("alumno");
                  } else if (tipoAntesDeMenor.current !== null) {
                    setTipoUsuario(tipoAntesDeMenor.current);
                    tipoAntesDeMenor.current = null;
                  }
                }} />
              <span>El conductor es <strong>menor de edad</strong>.</span>
            </label>
            {esMenor && (
              <p className="hint" style={{ marginTop: -4, marginBottom: 12 }}>
                El menor puede ser usuario del beneficio vehicular, pero el aviso de privacidad y el
                reglamento debe aceptarlos y firmarlos su <strong>padre, madre o tutor</strong> como representante.
              </p>
            )}
            <label className="check" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={hayGestionante} disabled={esMenor}
                onChange={(e) => setGestionanteDistinto(e.target.checked)} />
              <span>El pago y la firma los hace otra persona (padre/madre/tutor/cónyuge).</span>
            </label>
            {hayGestionante && (
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
                <div className="field">
                  <span>{esMenor ? "Relación con el menor" : "Relación con el conductor"}</span>
                  <select className={`select ${errores.gestionanteRelacion ? "invalid" : ""}`} value={gestionanteRelacion}
                    onChange={(e) => setGestionanteRelacion(e.target.value as GestionanteRelacion | "")}>
                    <option value="">Seleccione…</option>
                    {relacionesGestionante.map((r) => (
                      <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                    ))}
                  </select>
                  {errores.gestionanteRelacion && <p className="field-error">{errores.gestionanteRelacion}</p>}
                </div>
              </>
            )}
            <div className="field">
              <span>Tipo de usuario</span>
              <select className="select" value={tipoUsuario} disabled={esMenor}
                onChange={(e) => setTipoUsuario(e.target.value as TipoUsuario)}>
                <option value="padres">Padre / Madre / Tutor</option>
                <option value="maestro">Maestro</option>
                <option value="alumno">Alumno</option>
                <option value="admin">Administración</option>
              </select>
              {esMenor && <p className="hint" style={{ margin: "6px 0 0" }}>Un conductor menor de edad se registra como alumno.</p>}
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
                  <option value="">Seleccione…</option>
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
                    onChange={(e) => setModeloOtro(e.target.value)} placeholder="Escriba el modelo" />
                ) : (
                  <>
                    <select className={`select ${errores.modelo ? "invalid" : ""}`} value={modelo}
                      onChange={(e) => setModelo(e.target.value)} disabled={!marca}>
                      <option value="">{marca ? "Seleccione…" : "Elija la marca primero"}</option>
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
                  <option value="">Seleccione…</option>
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
            <div className="field">
              <span>TAG</span>
              <div className="chip-row">
                <button type="button" className={`select-chip ${procedenciaTag === "escuela" ? "on" : ""}`}
                  onClick={() => setProcedenciaTag("escuela")}>Lo compro a la escuela</button>
                <button type="button" className={`select-chip ${procedenciaTag === "propio" ? "on" : ""}`}
                  onClick={() => setProcedenciaTag("propio")}>Ya tengo TAG propio</button>
              </div>
              {procedenciaTag === "propio" && (
                <p className="hint">El registro y la activación de un TAG propio tienen el mismo costo ($100); llévelo el día de la instalación.</p>
              )}
            </div>
          </>
        )}

        {/* ----- Paso 2: Aviso de privacidad ----- */}
        {step === 2 && (
          <>
            <header className="survey-header"><h1>Aviso de privacidad</h1></header>
            <p className="lead">Lea el aviso completo. La casilla se habilita al llegar al final.</p>
            <div
              className="reglamento"
              ref={avisoRef}
              onScroll={(e) => { if (avisoValido && alFinal(e.currentTarget)) setAvisoLeido(true); }}
            >
              {avisoValido ? (
                aviso!.parrafos.map((p, i) => (
                  <p key={i} style={{ margin: "0 0 10px" }}>{p}</p>
                ))
              ) : (
                <p className="field-error" style={{ margin: 0 }}>
                  No se pudo cargar el aviso de privacidad. Verifique su conexión o recargue la página.
                </p>
              )}
            </div>
            {!avisoLeido && avisoValido && <p className="hint" style={{ marginTop: 8 }}>Desplácese hasta el final para poder aceptar.</p>}
            {/* Aquí NO va el enlace a la página pública del aviso: el texto
                íntegro está en esta misma pantalla, y ofrecer otra pestaña
                justo cuando hay que desplazarse hasta el final para habilitar
                la casilla solo saca a la persona del flujo. El enlace vive en
                el paso 0 y en la portada, que es donde sí hace falta. */}
            <label className="check" style={{ marginTop: 16 }}>
              <input type="checkbox" checked={aceptaPrivacidad} disabled={!avisoLeido || !avisoValido}
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
            <p className="lead">Lea el reglamento completo. La casilla se habilita al llegar a la cláusula final.</p>
            <div
              className="reglamento"
              ref={reglamentoRef}
              onScroll={(e) => { if (reglamentoValido && alFinal(e.currentTarget)) setReglamentoLeido(true); }}
            >
              {reglamentoValido ? (
                <ol>{reglamento!.clausulas.map((c, i) => <li key={i}>{c}</li>)}</ol>
              ) : (
                <p className="field-error" style={{ margin: 0 }}>
                  No se pudo cargar el reglamento de acceso. Verifique su conexión o recargue la página.
                </p>
              )}
            </div>
            {!reglamentoLeido && reglamentoValido && <p className="hint" style={{ marginTop: 8 }}>Desplázate hasta la cláusula 22 para poder aceptar.</p>}
            <label className="check" style={{ marginTop: 16 }}>
              <input type="checkbox" checked={acepta} disabled={!reglamentoLeido || !reglamentoValido}
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
              Firmará <strong>{hayGestionante ? gestionanteNombreCompleto || "el gestionante" : conductorNombreCompleto || "el conductor"}</strong>.
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
            <p className="lead">Su folio de seguimiento es:</p>
            <div className="folio">{resultado.folio}</div>
            <p style={{ marginTop: 16, color: "var(--ink)" }}>
              Preséntese en administración para <strong>asignación de estacionamiento</strong> y el
              <strong> pago del TAG ($100, efectivo)</strong>. TI instalará y activará su TAG.
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
