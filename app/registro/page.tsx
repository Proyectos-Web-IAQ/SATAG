"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SignaturePad, type FirmaTrazos } from "@/lib/firma";
import {
  getMarcas, getModelos, getColores, getReglamentoVigente, getAvisoVigente, getAvisoSimplificado, crearRegistro,
} from "@/lib/supabase/api";
import type { AvisoVigente } from "@/lib/supabase/api";
import type { TipoUsuario, GestionanteRelacion, CrearRegistroResultado, NombrePersona, ProcedenciaTag, ReglamentoVersion } from "@/lib/mock/types";

const STEPS = ["Datos", "Vehículo", "Aviso", "Reglamento", "Firma", "Listo"];

// Tipos de usuario que pertenecen a una familia de la comunidad escolar y a los
// que, por eso, se les piden los apellidos de la familia: es el dato con el que
// Administración los coteja contra GES antes de instalar el TAG. Un maestro o
// un administrativo no tienen «apellidos de familia» en la escuela, así que a
// ellos el campo ni se les muestra.
const TIPOS_CON_FAMILIA: TipoUsuario[] = ["padres", "alumno", "otro"];

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
  // "Todavia no llega" no es lo mismo que "no cargo". Al cerrar D-01 se quito el
  // placeholder "Cargando..." y el null paso a significar las dos cosas, asi que
  // una peticion en vuelo se acusaba como fallo de conexion. Estas banderas
  // separan los dos casos.
  const [avisoPendiente, setAvisoPendiente] = useState(true);
  const [reglamentoPendiente, setReglamentoPendiente] = useState(true);
  // D-04: si el aviso simplificado no CARGA, el recuadro ya no desaparece en
  // silencio — se declara el fallo. (null en avisoCorto = no hay publicado.)
  const [avisoCortoFallo, setAvisoCortoFallo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<CrearRegistroResultado | null>(null);
  // Fecha de envío para la copia del titular. Es la del dispositivo, no el sello
  // del servidor (ese vive en `aceptaciones.sello_tiempo`); por eso se rotula
  // como «fecha de envío» y no como sello oficial.
  const [enviadoEn, setEnviadoEn] = useState<string | null>(null);

  // ---- Formulario ----
  const [conductorNombre, setConductorNombre] = useState("");
  const [conductorApellidoPaterno, setConductorApellidoPaterno] = useState("");
  const [conductorApellidoMaterno, setConductorApellidoMaterno] = useState("");
  // Un solo apellido SOLO para extranjeros. Al resto se le exigen los dos: el
  // expediente es la base de un trámite con firma, y un apellido de menos
  // vuelve ambigua a la persona que firmó. Quien viene de un país donde se usa
  // un solo apellido no puede inventarse el segundo, así que se le da la
  // salida — pero declarando el motivo, no como una casilla libre que
  // cualquiera marca para teclear menos.
  // No viaja a la base: el materno ya es nullable y crear_registro no lo exige.
  const [conductorExtranjero, setConductorExtranjero] = useState(false);
  const [gestionanteDistinto, setGestionanteDistinto] = useState(false);
  const [gestionanteNombre, setGestionanteNombre] = useState("");
  const [gestionanteApellidoPaterno, setGestionanteApellidoPaterno] = useState("");
  const [gestionanteApellidoMaterno, setGestionanteApellidoMaterno] = useState("");
  const [gestionanteExtranjero, setGestionanteExtranjero] = useState(false);
  const [gestionanteRelacion, setGestionanteRelacion] = useState<GestionanteRelacion | "">("");
  const [esMenor, setEsMenor] = useState(false);
  const [tipoUsuario, setTipoUsuario] = useState<TipoUsuario>("padres");
  // Apellidos con los que la escuela identifica a la familia. Se piden a los
  // tipos de TIPOS_CON_FAMILIA: es el dato que Administración coteja contra el
  // padrón escolar antes de instalar el TAG.
  const [apellidosFamilia, setApellidosFamilia] = useState("");
  // Parentesco en texto libre del tipo 'otro'. Se captura sin catálogo a
  // propósito: nadie sabe todavía qué casos llegan, y una lista cerrada mal
  // adivinada obliga a la familia a elegir una opción falsa.
  const [parentescoOtro, setParentescoOtro] = useState("");
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
  // La burbuja del aviso simplificado se cierra con la equis. A propósito NO
  // se recuerda cerrada entre visitas: al recargar vuelve a aparecer, porque
  // lo que la ley exige es informar antes de recabar, y cada captura empieza
  // con una carga de esta página.
  const [avisoCortoCerrado, setAvisoCortoCerrado] = useState(false);

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
  // Ctrl+P también debe llevarse la copia completa: los <details> cerrados no
  // se imprimen y el CSS no puede abrirlos.
  useEffect(() => {
    const abrir = () => document.querySelectorAll(".copia-doc").forEach((d) => d.setAttribute("open", ""));
    window.addEventListener("beforeprint", abrir);
    return () => window.removeEventListener("beforeprint", abrir);
  }, []);

  useEffect(() => {
    getMarcas().then(setMarcas).catch(() => setMarcas([]));
    getColores().then(setColores).catch(() => setColores([]));
    getReglamentoVigente().then(setReglamento).catch(() => setReglamento(null))
      .finally(() => setReglamentoPendiente(false));
    getAvisoVigente().then(setAviso).catch(() => setAviso(null))
      .finally(() => setAvisoPendiente(false));
    getAvisoSimplificado().then(setAvisoCorto).catch(() => { setAvisoCorto(null); setAvisoCortoFallo(true); });
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

  // Los apellidos de la familia cuelgan del tipo de usuario igual que el modelo
  // libre cuelga de la marca: si el tipo cambia a uno que no los lleva, lo
  // capturado ya no corresponde y se limpia. Sin esto, quien empieza como padre
  // de familia y se corrige a maestro mandaria un apellido que el expediente no
  // debe llevar.
  //
  // Entre los tipos de TIPOS_CON_FAMILIA el dato significa lo mismo (los
  // apellidos con que GES identifica a la familia), asi que ahi se conserva:
  // borrarlo seria hacerle teclear de nuevo lo que ya escribio. Eso resuelve
  // tambien el rebote de la casilla «menor de edad», que fuerza el tipo a
  // 'alumno' y al desmarcarse devuelve el anterior: como 'alumno' lleva
  // apellidos, el viaje de ida y vuelta no los borra y no hay nada que guardar
  // aparte para restituirlo. El parentesco, en cambio, solo le corresponde a
  // 'otro' y se limpia al salir de ese tipo.
  useEffect(() => {
    if (tipoUsuario !== "otro") setParentescoOtro("");
    if (!TIPOS_CON_FAMILIA.includes(tipoUsuario)) setApellidosFamilia("");
  }, [tipoUsuario]);

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
      if (!conductorApellidoPaterno.trim()) e.conductorApellidoPaterno = conductorExtranjero ? "Escriba el apellido." : "Escriba el apellido paterno.";
      // Los dos apellidos son obligatorios salvo que se declare extranjero: el
      // expediente sustenta un trámite con firma, y un apellido de menos vuelve
      // ambigua a la persona que firmó frente a un homónimo.
      if (!conductorExtranjero && !conductorApellidoMaterno.trim()) {
        e.conductorApellidoMaterno = "Escriba el apellido materno. Si su identificación oficial trae un solo apellido, marque la casilla de extranjero.";
      }
      if (!conductorNombre.trim()) e.conductorNombre = "Escriba el nombre o nombres.";
      if (hayGestionante) {
        if (!gestionanteApellidoPaterno.trim()) e.gestionanteApellidoPaterno = gestionanteExtranjero ? "Escriba el apellido." : "Escriba el apellido paterno.";
        if (!gestionanteExtranjero && !gestionanteApellidoMaterno.trim()) {
          e.gestionanteApellidoMaterno = "Escriba el apellido materno. Si su identificación oficial trae un solo apellido, marque la casilla de extranjero.";
        }
        if (!gestionanteNombre.trim()) e.gestionanteNombre = "Escriba el nombre o nombres.";
        if (!gestionanteRelacion) {
          e.gestionanteRelacion = esMenor
            ? "Indique si es padre, madre o tutor del menor."
            : "Indique la relación del gestionante.";
        }
      }
      // Obligatorio en los tipos que se cotejan contra el padrón escolar. Sin
      // este dato no hay forma de saber si quien se registra pertenece a la
      // comunidad, que es justo lo que el cotejo impide que se cuele.
      if (TIPOS_CON_FAMILIA.includes(tipoUsuario) && !apellidosFamilia.trim()) {
        e.apellidosFamilia = "Escriba los apellidos de la familia.";
      }
      if (tipoUsuario === "otro" && !parentescoOtro.trim()) {
        e.parentescoOtro = "Escriba su parentesco con la familia.";
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
      if (avisoPendiente) e.aceptaPrivacidad = "Espere un momento: el aviso de privacidad todavía se está cargando.";
      else if (!avisoValido) e.aceptaPrivacidad = "No se puede continuar porque el aviso de privacidad no se ha cargado correctamente.";
      else if (!aceptaPrivacidad) e.aceptaPrivacidad = "Debe aceptar el aviso de privacidad para continuar.";
    }
    if (s === 3) {
      if (reglamentoPendiente) e.acepta = "Espere un momento: el reglamento todavía se está cargando.";
      else if (!reglamentoValido) e.acepta = "No se puede continuar porque el reglamento no se ha cargado correctamente.";
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
    // Ultimo cerrojo de D-01: el alta no sale con avisoVersion o
    // reglamentoVersion en null. La navegacion ya lo impide paso a paso, pero
    // el envio es el unico punto donde la firma se vuelve evidencia, asi que
    // se vuelve a comprobar aqui y se devuelve a la persona al paso que fallo.
    if (!aviso || !reglamento || !avisoValido || !reglamentoValido) {
      setError("No se puede enviar el registro porque el aviso de privacidad o el reglamento no se cargaron. Recargue la página e inténtelo de nuevo.");
      setMostrarErrores(true);
      setStep(avisoValido ? 3 : 2);
      return;
    }
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
        // El estado ya se limpia al cambiar de tipo; el candado se repite aquí
        // porque este es el punto donde el dato deja de ser editable.
        apellidosFamilia: TIPOS_CON_FAMILIA.includes(tipoUsuario) ? apellidosFamilia.trim() : null,
        parentescoOtro: tipoUsuario === "otro" ? parentescoOtro.trim() : null,
        marca: marcaFinal, modelo: modeloFinal, color: colorFinal,
        placas: sinPlacas ? null : placas, sinPlacas,
        procedenciaTag, observaciones: null,
        firmaDataUrl: firma,
        firmaTrazos: trazos,
        firmanteNombre: hayGestionante ? gestionanteNombreCompleto : conductorNombreCompleto,
        aceptaReglamento: acepta,
        reglamentoVersionId: reglamento.id,
        avisoVersionId: aviso.id,
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
      setEnviadoEn(new Date().toLocaleString("es-MX", {
        dateStyle: "long", timeStyle: "short",
      }));
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
            {/* Con un solo apellido el campo va a lo ancho, no en media columna
                con un hueco al lado: el hueco se lee como «aquí falta algo». */}
            {/* Con un solo apellido el campo va a lo ancho, no en media columna
                con un hueco al lado: el hueco se lee como «aquí falta algo». */}
            <div className={conductorExtranjero ? undefined : "grid-2"}>
              <div className="field">
                <span>{conductorExtranjero ? "Apellido del conductor" : "Apellido paterno del conductor"}</span>
                <input className={`input ${errores.conductorApellidoPaterno ? "invalid" : ""}`} value={conductorApellidoPaterno}
                  onChange={(e) => setConductorApellidoPaterno(e.target.value)} placeholder="Ej. Pérez" />
                {errores.conductorApellidoPaterno && <p className="field-error">{errores.conductorApellidoPaterno}</p>}
              </div>
              {!conductorExtranjero && (
                <div className="field">
                  <span>Apellido materno del conductor</span>
                  <input className={`input ${errores.conductorApellidoMaterno ? "invalid" : ""}`} value={conductorApellidoMaterno}
                    onChange={(e) => setConductorApellidoMaterno(e.target.value)} placeholder="Ej. López" />
                  {errores.conductorApellidoMaterno && <p className="field-error">{errores.conductorApellidoMaterno}</p>}
                </div>
              )}
            </div>
            <label className="check" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={conductorExtranjero}
                onChange={(e) => {
                  setConductorExtranjero(e.target.checked);
                  // Se limpia al marcar: un materno escrito antes de marcar la
                  // casilla ya no se ve, y no debe viajar escondido al expediente.
                  if (e.target.checked) setConductorApellidoMaterno("");
                }} />
              <span>El conductor es <strong>extranjero</strong> y su identificación oficial trae un solo apellido.</span>
            </label>
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
                <div className={gestionanteExtranjero ? undefined : "grid-2"}>
                  <div className="field">
                    <span>{gestionanteExtranjero ? "Apellido del gestionante" : "Apellido paterno del gestionante"}</span>
                    <input className={`input ${errores.gestionanteApellidoPaterno ? "invalid" : ""}`} value={gestionanteApellidoPaterno}
                      onChange={(e) => setGestionanteApellidoPaterno(e.target.value)} placeholder="Ej. López" />
                    {errores.gestionanteApellidoPaterno && <p className="field-error">{errores.gestionanteApellidoPaterno}</p>}
                  </div>
                  {!gestionanteExtranjero && (
                    <div className="field">
                      <span>Apellido materno del gestionante</span>
                      <input className={`input ${errores.gestionanteApellidoMaterno ? "invalid" : ""}`} value={gestionanteApellidoMaterno}
                        onChange={(e) => setGestionanteApellidoMaterno(e.target.value)} placeholder="Ej. Ruiz" />
                      {errores.gestionanteApellidoMaterno && <p className="field-error">{errores.gestionanteApellidoMaterno}</p>}
                    </div>
                  )}
                </div>
                <label className="check" style={{ marginBottom: 12 }}>
                  <input type="checkbox" checked={gestionanteExtranjero}
                    onChange={(e) => {
                      setGestionanteExtranjero(e.target.checked);
                      if (e.target.checked) setGestionanteApellidoMaterno("");
                    }} />
                  <span>El gestionante es <strong>extranjero</strong> y su identificación oficial trae un solo apellido.</span>
                </label>
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
                <option value="otro">Otro familiar (tío, abuelo…)</option>
              </select>
              {esMenor && <p className="hint" style={{ margin: "6px 0 0" }}>Un conductor menor de edad se registra como alumno.</p>}
            </div>
            {tipoUsuario === "otro" && (
              <div className="field">
                <span>Parentesco con la familia</span>
                <input className={`input ${errores.parentescoOtro ? "invalid" : ""}`} value={parentescoOtro}
                  onChange={(e) => setParentescoOtro(e.target.value)} placeholder="Ej. tío del alumno" />
                <p className="hint" style={{ margin: 0 }}>
                  Escríbalo con sus palabras (tío del alumno, abuela, primo).
                  Sirve, junto con los apellidos, para confirmar que el TAG se instala a una
                  familia de la comunidad.
                </p>
                {errores.parentescoOtro && <p className="field-error">{errores.parentescoOtro}</p>}
              </div>
            )}
            {/* Solo a quien pertenece a una familia de la comunidad: es el dato
                con el que la escuela la tiene identificada y el que
                Administración coteja antes de instalar. Pedírselo a un maestro
                o a un administrativo no significa nada, por eso el campo
                aparece y desaparece con el tipo de usuario. */}
            {TIPOS_CON_FAMILIA.includes(tipoUsuario) && (
              <div className="field">
                <span>Apellidos de la familia</span>
                <input className={`input ${errores.apellidosFamilia ? "invalid" : ""}`} value={apellidosFamilia}
                  onChange={(e) => setApellidosFamilia(e.target.value)} placeholder="Ej. Pérez López" />
                <p className="hint" style={{ margin: 0 }}>
                  Los apellidos con los que la escuela identifica a la familia —
                  normalmente los del alumno o los alumnos. Sirven para confirmar que el
                  TAG se instala a una familia de la comunidad.
                </p>
                {errores.apellidosFamilia && <p className="field-error">{errores.apellidosFamilia}</p>}
              </div>
            )}
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
                  <input className="input" value={marcaOtro} onChange={(e) => setMarcaOtro(e.target.value)} placeholder="Especifique la marca" />
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
                      <input className="input" value={modeloOtro} onChange={(e) => setModeloOtro(e.target.value)} placeholder="Especifique el modelo" />
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
                  <input className="input" value={colorOtro} onChange={(e) => setColorOtro(e.target.value)} placeholder="Especifique el color" />
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
            <div className="field" style={{ marginTop: 18 }}>
              <span>TAG</span>
              <div className="chip-row">
                <button type="button" className={`select-chip ${procedenciaTag === "escuela" ? "on" : ""}`}
                  onClick={() => setProcedenciaTag("escuela")}>Lo compro a la escuela</button>
                <button type="button" className={`select-chip ${procedenciaTag === "propio" ? "on" : ""}`}
                  onClick={() => setProcedenciaTag("propio")}>Ya tengo TAG propio</button>
              </div>
              {procedenciaTag === "escuela" ? (
                <p className="hint">
                  El TAG cuesta <strong>$100</strong> y se paga en efectivo en Administración,
                  después de enviar este registro.
                </p>
              ) : (
                <p className="hint">
                  El registro y la activación tienen el mismo costo (<strong>$100</strong>). Lleve su TAG
                  el día de la instalación: para funcionar debe quedar <strong>pegado al parabrisas</strong>.
                  Sistemas valorará si ese modelo puede darse de alta; si no es compatible, se le
                  instalará uno de la escuela.
                </p>
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
              ) : avisoPendiente ? (
                <p className="hint" style={{ margin: 0 }}>Cargando el aviso de privacidad…</p>
              ) : (
                <p className="field-error" style={{ margin: 0 }}>
                  No se pudo cargar el aviso de privacidad. Recargue la página; si el mensaje vuelve
                  a aparecer, avise al personal de la escuela: puede que la versión publicada esté vacía.
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
              ) : reglamentoPendiente ? (
                <p className="hint" style={{ margin: 0 }}>Cargando el reglamento de acceso…</p>
              ) : (
                <p className="field-error" style={{ margin: 0 }}>
                  No se pudo cargar el reglamento de acceso. Recargue la página; si el mensaje vuelve
                  a aparecer, avise al personal de la escuela: puede que la versión publicada esté vacía.
                </p>
              )}
            </div>
            {!reglamentoLeido && reglamentoValido && <p className="hint" style={{ marginTop: 8 }}>Desplácese hasta la cláusula 22 para poder aceptar.</p>}
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
            <p className="hint" style={{ marginBottom: 8 }}>
              Firme sobre la línea, como lo haría en papel: con el dedo (táctil) o con el mouse.
            </p>
            <SignaturePad onChange={setFirma} onTrazos={setTrazos} trazosIniciales={trazos} />
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
              Preséntese en Administración para <strong>asignación de estacionamiento</strong> y el
              <strong> pago del TAG ($100, efectivo)</strong>. Sistemas instalará y activará su TAG.
            </p>
            {/* ----- Copia para el titular -----
                En el trámite de papel se llenan dos ejemplares y la familia se lleva
                uno, con el reglamento completo, para leerlo con calma después de
                firmar. Esta sección es su equivalente digital: queda plegada en
                pantalla para no sepultar el folio, y al imprimir o guardar como PDF
                sale completa. Sin ella, quien firma no conserva copia de lo que
                aceptó, que es una regresión frente al proceso en papel. */}
            <div className="copia-titular">
              <p className="panel-title">Su copia del trámite</p>
              <p className="hint">
                Guarde este comprobante: incluye los datos que registró y el texto completo del
                reglamento y del aviso de privacidad que aceptó. Con «Imprimir / Descargar» puede
                conservarlo en papel o como PDF.
              </p>

              <dl className="copia-datos">
                <div><dt>Folio</dt><dd>{resultado.folio}</dd></div>
                <div><dt>Fecha de envío</dt><dd>{enviadoEn ?? "—"}</dd></div>
                <div><dt>Conductor</dt><dd>{conductorNombreCompleto}</dd></div>
                {/* La copia dice traer «los datos que registró»: si se capturaron
                    los apellidos de la familia, aquí van también. */}
                {apellidosFamilia.trim() !== "" && (
                  <div><dt>Apellidos de la familia</dt><dd>{apellidosFamilia.trim()}</dd></div>
                )}
                {parentescoOtro.trim() !== "" && (
                  <div><dt>Parentesco</dt><dd>{parentescoOtro.trim()}</dd></div>
                )}
                {hayGestionante && (
                  <div>
                    <dt>Firmó</dt>
                    <dd>{gestionanteNombreCompleto}{gestionanteRelacion ? ` (${gestionanteRelacion})` : ""}</dd>
                  </div>
                )}
                <div><dt>Vehículo</dt><dd>{marcaFinal} {modeloFinal} · {colorFinal}</dd></div>
                <div><dt>Placas</dt><dd>{sinPlacas ? "Sin placas (vehículo nuevo o con permiso)" : placas}</dd></div>
                <div><dt>TAG</dt><dd>{procedenciaTag === "escuela" ? "Se compra a la escuela" : "Propio (lo trae la familia)"}</dd></div>
              </dl>

              <details className="copia-doc">
                <summary>Reglamento de acceso vehicular (v{reglamento?.version ?? "—"}) — el que aceptó</summary>
                <ol>{(reglamento?.clausulas ?? []).map((c, i) => <li key={i}>{c}</li>)}</ol>
              </details>

              <details className="copia-doc">
                <summary>Aviso de privacidad (v{aviso?.version ?? "—"})</summary>
                {(aviso?.parrafos ?? []).map((t, i) => <p key={i}>{t}</p>)}
              </details>

              <p className="copia-constancia">
                Al enviar este registro, <strong>{hayGestionante ? gestionanteNombreCompleto : conductorNombreCompleto}</strong>{" "}
                aceptó el reglamento (v{reglamento?.version ?? "—"}) y el aviso de privacidad
                (v{aviso?.version ?? "—"}) y firmó de manera electrónica. La firma y su sello de
                tiempo quedaron resguardados por el Instituto Asunción de Querétaro.
              </p>
            </div>

            <div className="btn-row no-print" style={{ justifyContent: "center", gap: 12, marginTop: 16 }}>
              <button type="button" className="ghost-action" onClick={() => {
                document.querySelectorAll(".copia-doc").forEach((d) => d.setAttribute("open", ""));
                window.print();
              }}>Imprimir / Descargar</button>
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
              <button type="button" className="primary-action" onClick={enviarValidado} disabled={enviando || !firma}
                title={!firma ? "Falta la firma" : undefined}>
                {enviando ? "Enviando…" : "Enviar registro"}
              </button>
            )}
          </div>
        )}
      </section>

      {/* Aviso simplificado (CC-09) como burbuja al pie.
          La ley pide informar al momento de recabar los datos, no después
          (art. 16 fr. II): aquí deben constar el responsable, las finalidades
          y el mecanismo para conocer el integral. El primer párrafo trae el
          responsable y las finalidades, y el enlace es el mecanismo: ninguno
          de los dos se pliega ni se esconde detrás de un clic. Lo que se
          repliega es el detalle de los datos recabados y el canal ARCO, que
          viven completos en el integral.

          Va al pie y no arriba porque el contador leyó este recuadro y el
          aviso integral del paso 3 como el mismo texto dos veces. No lo son
          —este informa, aquél se acepta y queda sellado— y ninguno se puede
          quitar, pero encabezando el formulario tenía una jerarquía visual
          que no le toca. Aparece solo, se puede cerrar con la equis, y NO se
          recuerda cerrado: al recargar vuelve, para que toda captura de datos
          nazca con el aviso a la vista.

          Desaparece al llegar al paso 2, donde empieza el integral. */}
      {step < 2 && !avisoCortoCerrado && (avisoCortoFallo || avisoCortoParrafos.length > 0) && (
        <aside className="aviso-burbuja" role="region" aria-label="Aviso de privacidad simplificado">
          <button type="button" className="aviso-burbuja__cerrar" onClick={() => setAvisoCortoCerrado(true)}
            aria-label="Ocultar el aviso de privacidad">
            <span aria-hidden>×</span>
          </button>
          <p className="aviso-burbuja__titulo">Aviso de privacidad</p>
          {avisoCortoFallo ? (
            <p className="field-error" style={{ margin: "0 0 6px" }}>
              No se pudo cargar el aviso de privacidad simplificado. Recargue la página;
              si el mensaje vuelve a aparecer, avise al personal de la escuela. El aviso
              integral sigue disponible en el enlace de abajo.
            </p>
          ) : (
            <>
              <p className="aviso-burbuja__texto">{avisoCortoParrafos[0]}</p>
              {avisoCortoAbierto && avisoCortoParrafos.slice(1).map((p, i) => (
                <p key={i} className="aviso-burbuja__texto">{p}</p>
              ))}
            </>
          )}
          <div className="aviso-burbuja__acciones">
            {!avisoCortoFallo && avisoCortoParrafos.length > 1 && (
              <button type="button" className="link-action" aria-expanded={avisoCortoAbierto}
                onClick={() => setAvisoCortoAbierto((v) => !v)}>
                {avisoCortoAbierto ? "Ver menos" : "Ver más"}
              </button>
            )}
            <a href="/aviso-de-privacidad/" target="_blank" rel="noreferrer">
              Aviso integral
            </a>
          </div>
        </aside>
      )}
    </main>
  );
}
