"use client";

// La caseta del estacionamiento (bloques 97 y 98; Gerardo 14 y 15-oct).
//
// Cuando la pluma no le abre a un carro, el portero lo busca aqui ANTES de abrir
// con el boton: la pantalla le dice si tiene acceso y, si no, por que. Si abre con
// el boton, lo reporta, firmado con su cuenta. Sistemas le deja AVISOS sobre
// vehiculos concretos («si viene, preguntele quien es») y el portero responde ahi
// mismo; la respuesta llega al caso.
//
// Diseño «Mostrador» (elegido entre tres bocetos el 14-oct) con el sistema de
// diseño nuevo (15-oct, primera pantalla): UNA columna centrada, el buscador es lo
// unico grande, el veredicto es una franja de color solido que se lee a distancia,
// y lo demas son filas con filete, sin cajas ni pastillas. Teclado primero (es una
// Chromebook): el buscador tiene el foco; ↑ ↓ eligen, Enter abre y Esc limpia.
//
// Lo que ve el portero lo decide la base (caseta_buscar, caseta_inicio): nombre,
// vehiculo, placa, plumas, sus ultimas lecturas y, si es una baja, su motivo; nunca
// folio, pagos, firma, casos ni notas.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CASETAS,
  VEREDICTO,
  PROCESO_BAJA,
  datosComunes,
  delLote,
  esCaseta,
  estanciasDe,
  estadoSeguimiento,
  evaluacionesDe,
  lotesDeCaseta,
  motivosDe,
  placaNormalizada,
  puertasDeCaseta,
  type AvisoCaseta,
  type AvisoDeVehiculo,
  type Caseta,
  type ClaseReporte,
  type InicioCaseta,
  type PasoPluma,
  type Puerta,
  type ReporteSeguimiento,
  type ResultadoCaseta,
} from "@/lib/caseta";
import { casetaBuscar, casetaInicio, casetaReportar, casetaResponderAviso } from "@/lib/supabase/apiPanel";
import { numeroCaso } from "@/lib/casosRegistro";
import { diaSemana, fecha, fechaHora, hora } from "@/lib/formato";
import { ROTULO, TIPO_PERSONA, textoPlumas } from "@/lib/glosario";
import { textoVehiculo } from "@/lib/vehiculo";
import { TarjetaReporte, cuando } from "@/components/admin/SeguimientoCaseta";
import type { TipoUsuario } from "@/lib/mock/types";

const CLAVE_CASETA = "satag.caseta.lotes";

function leerCaseta(): Caseta | null {
  try {
    const v = localStorage.getItem(CLAVE_CASETA);
    return esCaseta(v) ? v : null;
  } catch {
    return null;
  }
}

const tipoPersona = (t: string | null) => (t && t in TIPO_PERSONA ? TIPO_PERSONA[t as TipoUsuario] : null);
const nombreDe = (r: ResultadoCaseta) => r.nombre ?? datosComunes(r)?.nombreZk ?? "Sin nombre";
const vehiculoCorto = (v: { placa?: string | null; marca: string | null; modelo: string | null; color: string | null }) =>
  [v.placa, v.marca || v.modelo ? textoVehiculo(v) : null].filter(Boolean).join(" · ");

/** Lo que se va a reportar: con el vehiculo identificado o sin el. */
interface Borrador {
  clase: ClaseReporte;
  resultado: ResultadoCaseta | null;
}

export default function VistaCaseta({ nombreSesion, onCambiarTurno }: {
  nombreSesion: string;
  /** Solo el portero: su pantalla no tiene el encabezado del panel. */
  onCambiarTurno?: () => void;
}) {
  const [caseta, setCaseta] = useState<Caseta | null>(null);
  const [inicio, setInicio] = useState<InicioCaseta | null>(null);
  const [errorInicio, setErrorInicio] = useState<string | null>(null);
  const [deTodos, setDeTodos] = useState(false);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ResultadoCaseta[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const [abierto, setAbierto] = useState<ResultadoCaseta | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const folio = useRef(0);

  useEffect(() => { setCaseta(leerCaseta()); }, []);
  const elegirCaseta = (c: Caseta) => {
    setCaseta(c);
    setResultados(null);
    setAbierto(null);
    try { localStorage.setItem(CLAVE_CASETA, c); } catch { /* sin almacenamiento: se pide en cada sesion */ }
    setTimeout(() => buscador.current?.focus(), 0);
  };
  const lotes = useMemo(() => (caseta ? lotesDeCaseta(caseta) : []), [caseta]);

  const leerInicio = useCallback(async () => {
    try {
      setInicio(await casetaInicio(deTodos));
      setErrorInicio(null);
    } catch (e) {
      setErrorInicio(e instanceof Error ? e.message : "No se pudieron leer los avisos de Sistemas.");
    }
  }, [deTodos]);
  useEffect(() => { leerInicio(); }, [leerInicio]);
  // La caseta pasa horas abierta: lo de Sistemas se vuelve a leer cada 5 minutos.
  useEffect(() => {
    const t = setInterval(() => { leerInicio(); }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [leerInicio]);

  const buscar = useCallback(async (texto: string) => {
    if (!lotes.length) return;
    const t = texto.trim();
    const n = ++folio.current;
    if (t.replace(/[^0-9A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "").length < 3) {
      setResultados(null);
      setError(null);
      return;
    }
    setBuscando(true);
    try {
      const r = await casetaBuscar(t, lotes);
      if (n !== folio.current) return;
      setResultados(r);
      setSel(0);
      setError(null);
      // Un solo resultado: se abre solo, que es lo que el portero iba a hacer.
      setAbierto(r.length === 1 ? r[0] : null);
    } catch (e) {
      if (n === folio.current) setError(e instanceof Error ? e.message : "No se pudo buscar.");
    } finally {
      if (n === folio.current) setBuscando(false);
    }
  }, [lotes]);

  // Busca al dejar de escribir; Enter busca de inmediato.
  useEffect(() => {
    const t = setTimeout(() => buscar(q), 400);
    return () => clearTimeout(t);
  }, [q, buscar]);

  function limpiar() {
    folio.current++;
    setQ("");
    setResultados(null);
    setAbierto(null);
    setError(null);
    buscador.current?.focus();
  }

  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    const n = resultados?.length ?? 0;
    if (e.key === "ArrowDown" && n) { e.preventDefault(); setSel((s) => Math.min(n - 1, s + 1)); }
    else if (e.key === "ArrowUp" && n) { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (n && resultados) setAbierto(resultados[Math.min(sel, n - 1)]);
      else buscar(q);
    } else if (e.key === "Escape") { e.preventDefault(); limpiar(); }
  }

  function avisar(texto: string) {
    setAviso(texto);
    setTimeout(() => setAviso((a) => (a === texto ? null : a)), 8000);
  }

  function listo(texto: string) {
    setBorrador(null);
    avisar(texto);
    leerInicio();
    limpiar();
  }

  // Al responder un aviso desde el veredicto, se vuelve a buscar para que el aviso
  // muestre la respuesta, y se refresca la lista de avisos.
  async function respondido() {
    avisar("Respuesta enviada a Sistemas.");
    leerInicio();
    if (q.trim()) await buscar(q);
  }

  const avisos = useMemo(() => delLote(inicio?.avisos ?? [], lotes.length ? lotes : null), [inicio, lotes]);
  const sinResultados = !!resultados && !buscando && resultados.length === 0;

  return (
    <div className="cs">
      {/* El portero no tiene el encabezado del panel: quien esta en turno se ve
          siempre, y salir se llama «Cambiar de turno» (la sesion no se cierra sola). */}
      {onCambiarTurno && (
        <header className="cs-cab">
          <div>
            <h1 className="cs-titulo">Caseta del estacionamiento</h1>
            <p className="ds-nota">Sesión de <b>{nombreSesion}</b></p>
          </div>
          <button type="button" className="ghost-action" onClick={onCambiarTurno}>Cambiar de turno</button>
        </header>
      )}

      {!caseta ? (
        <section className="cs-sec" aria-label="Elegir estacionamiento">
          <p className="cs-pregunta">¿Qué estacionamiento cubre esta caseta?</p>
          <p className="ds-nota">Entrada y salida. Se recuerda en este equipo y puede cambiarse en cualquier momento.</p>
          <div className="cs-seg cs-seg--grande" role="group" aria-label="Estacionamiento que cubre la caseta">
            {CASETAS.map((c) => (
              <button key={c.id} type="button" onClick={() => elegirCaseta(c.id)}>{c.id === "E1-E2" ? "E1 y E2" : c.id}</button>
            ))}
          </div>
        </section>
      ) : (
        <>
          <div className="cs-mostrador">
          <div className="cs-barra">
            <div className="cs-seg" role="group" aria-label="Estacionamiento que cubre la caseta">
              {CASETAS.map((c) => (
                <button key={c.id} type="button" aria-pressed={caseta === c.id} onClick={() => elegirCaseta(c.id)}>
                  {c.id === "E1-E2" ? "E1 y E2" : c.id}
                </button>
              ))}
            </div>
            {inicio?.eventosHasta && <span className="ds-nota">Lecturas de ZK hasta el {fechaHora(inicio.eventosHasta)}</span>}
          </div>

          {aviso && <p className="ds-aviso ds-aviso--ok" role="status">{aviso}</p>}

          <label className="sr-only" htmlFor="caseta-buscar">Buscar el vehículo</label>
          <input
            id="caseta-buscar"
            ref={buscador}
            className="cs-buscar"
            type="search"
            autoFocus
            autoComplete="off"
            placeholder="Placa, nombre, modelo o TAG"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={teclas}
          />
          <p className="ds-nota cs-ayuda">Escriba al menos 3 letras o números · ↑ ↓ para elegir · Enter para ver · Esc para limpiar</p>
          {error && <p className="ds-aviso ds-aviso--error" role="alert">{error}</p>}
          {buscando && <p className="ds-nota">Buscando…</p>}

          {sinResultados && (
            <div className="cs-sec">
              <p><b>No aparece en SATAG ni en ZK.</b> Pruebe con otra parte de la placa, el modelo o el apellido.</p>
              <div className="ds-acciones">
                <button type="button" className="ghost-action" onClick={() => setBorrador({ clase: "apertura", resultado: null })}>Abrí con el botón a este vehículo</button>
              </div>
            </div>
          )}

          {/* Con varios resultados, la lista queda arriba del veredicto para cambiar de uno a otro. */}
          {resultados && resultados.length > 1 && (
            <ul className="cs-lista" role="listbox" aria-label="Resultados">
              {resultados.map((r, i) => {
                const evs = evaluacionesDe(r);
                const iguales = evs.every((x) => x.ev.veredicto === evs[0]?.ev.veredicto);
                return (
                  <li key={`${r.registroId ?? ""}-${datosComunes(r)?.tarjeta ?? i}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === sel}
                      aria-current={abierto === r ? "true" : undefined}
                      className="cs-fila"
                      onMouseEnter={() => setSel(i)}
                      onClick={() => setAbierto(r)}
                    >
                      <span className="cs-fila__txt">
                        <b>{nombreDe(r)}</b>
                        <span className="ds-nota">{vehiculoCorto({ ...r, placa: r.placa ?? datosComunes(r)?.placaZk })}</span>
                      </span>
                      <span className="cs-fila__ver">
                        {r.avisos.length > 0 && <span className="cs-marca-aviso">Aviso</span>}
                        {iguales
                          ? <span className={`cs-texto--${evs[0].ev.veredicto}`}>{VEREDICTO[evs[0].ev.veredicto].titulo}</span>
                          : evs.map((x) => (
                            <span key={x.lote} className={`cs-texto--${x.ev.veredicto}`}>{x.lote} {x.ev.veredicto === "abre" ? "✓" : "✕"}</span>
                          ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {abierto ? (
            <Veredicto r={abierto} eventosHasta={inicio?.eventosHasta ?? null}
              onCerrar={() => { setAbierto(null); buscador.current?.focus(); }}
              onReportar={(clase) => setBorrador({ clase, resultado: abierto })}
              onRespondido={respondido} />
          ) : !sinResultados && (
            <div className="ds-acciones cs-otras">
              <button type="button" className="ghost-action" onClick={() => setBorrador({ clase: "apertura", resultado: null })}>Abrí con el botón sin buscar</button>
              <button type="button" className="ghost-action" onClick={() => setBorrador({ clase: "reporte", resultado: null })}>Reportar algo a Sistemas</button>
            </div>
          )}
          </div>

          {!abierto && (
            <>
              {errorInicio && <p className="ds-aviso ds-aviso--error" role="alert">{errorInicio} <button type="button" className="link-action" onClick={leerInicio}>Reintentar</button></p>}
              {inicio === null && !errorInicio && <p className="ds-nota">Leyendo…</p>}
              {inicio && (
                <div className="cs-tablero">
                  <Avisos avisos={avisos} onRespondido={() => { avisar("Respuesta enviada a Sistemas."); leerInicio(); }}
                    onVer={(texto) => { setQ(texto); buscar(texto); window.scrollTo({ top: 0, behavior: "smooth" }); buscador.current?.focus(); }} />
                  <Reportes reportes={inicio.reportes} deTodos={deTodos} onDeTodos={setDeTodos} />
                </div>
              )}
            </>
          )}
        </>
      )}

      {borrador && caseta && (
        <FormReporte
          borrador={borrador}
          caseta={caseta}
          nombreSesion={nombreSesion}
          onCancelar={() => { setBorrador(null); buscador.current?.focus(); }}
          onListo={(r) => listo(
            r.caso
              ? `Reporte guardado. Sistemas lo ve en el caso ${numeroCaso(r.caso)}${r.casoNuevo ? "" : " (ya estaba abierto: se sumó una vez)"}.`
              : "Reporte guardado. Sistemas lo ve en la bitácora de la caseta.",
          )}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ el veredicto */

function Veredicto({ r, eventosHasta, onCerrar, onReportar, onRespondido }: {
  r: ResultadoCaseta;
  eventosHasta: string | null;
  onCerrar: () => void;
  onReportar: (clase: ClaseReporte) => void;
  onRespondido: () => void;
}) {
  const evs = evaluacionesDe(r);
  const comun = datosComunes(r);
  const baja = evs.find((x) => x.ev.baja)?.ev.baja ?? null;
  const placaZkDistinta = comun?.placaZk && placaNormalizada(comun.placaZk) !== placaNormalizada(r.placa);
  const algunoAbre = evs.some((x) => x.ev.veredicto === "abre");
  const partidas = evs.length > 1 && evs.some((x) => x.ev.veredicto !== evs[0].ev.veredicto);
  // El foco va a la accion que corresponde al veredicto: si no tiene acceso, a
  // «Volver», nunca a «Abrí con el botón» (un Enter no debe abrir un reporte).
  const primero = useRef<HTMLButtonElement>(null);
  useEffect(() => { primero.current?.focus({ preventScroll: true }); }, [r]);

  const motivos = evs.flatMap(({ lote, ev }) => ev.motivos
      // «Tiene acceso» junto a un rojo confunde: si ese estacionamiento sale en rojo,
      // no se dice.
      .filter((m) => !(m.clave === "acceso" && ev.veredicto === "no-abre"))
      .map((m) => ({ lote, m })))
    // Un motivo que vale para los dos (una baja) se dice una vez.
    .filter((x, i, l) => l.findIndex((y) => y.m.texto === x.m.texto) === i);

  return (
    <article className="cs-veredicto" aria-label={`Veredicto de ${nombreDe(r)}`}>
      <div className={`cs-franjas${partidas ? " cs-franjas--dos" : ""}`}>
        {(partidas ? evs : evs.slice(0, 1)).map(({ lote, ev }) => (
          <div key={lote} className={`cs-franja cs-franja--${ev.veredicto}`}>
            {partidas && <span className="cs-franja__lote">{lote}</span>}
            <span className="cs-franja__t">{VEREDICTO[ev.veredicto].titulo}</span>
            <span className="cs-franja__a">{VEREDICTO[ev.veredicto].ayuda}</span>
          </div>
        ))}
      </div>

      {r.avisos.map((a) => <AvisoEnVeredicto key={a.id} a={a} onRespondido={onRespondido} />)}

      <div className="cs-persona">
        <h2>{nombreDe(r)}</h2>
        {tipoPersona(r.tipo) && <span className="ds-nota">{tipoPersona(r.tipo)}</span>}
      </div>
      <dl className="cs-pares">
        <dt>Vehículo</dt><dd>{r.marca || r.modelo ? textoVehiculo(r) : "Sin registrar"}</dd>
        <dt>{ROTULO.placa}</dt><dd className="mono">{r.placa ?? comun?.placaZk ?? "—"}{placaZkDistinta && r.placa ? <span className="ds-nota"> ({ROTULO.placaZk}: {comun?.placaZk})</span> : null}</dd>
        <dt>{ROTULO.plumas}</dt><dd>{textoPlumas(r.plumas)}</dd>
        <dt>TAG</dt><dd className="mono">{comun?.tarjeta ?? "Sin TAG"}</dd>
        {comun?.departamentoZk && <><dt>{ROTULO.departamentoZk}</dt><dd>{comun.departamentoZk}</dd></>}
      </dl>

      <h3 className="ds-rotulo">Por qué</h3>
      <ul className="cs-motivos">
        {motivos.map(({ lote, m }) => (
          <li key={`${lote}-${m.texto}`}>
            <span className={`cs-texto--${m.veredicto}`} aria-hidden="true">{m.veredicto === "abre" ? "✓" : "✕"}</span>
            {/* El estacionamiento se dice solo cuando el veredicto cambia entre los dos. */}
            <span>{partidas && m.clave !== "baja" && m.clave !== "sin-tag" ? <b>{lote}: </b> : null}{m.texto}</span>
          </li>
        ))}
      </ul>

      {/* Gerardo, 14-oct: si preguntan por que se dio de baja, el portero tiene la
          respuesta y el proceso. A donde remitir una queja aun no se decide. */}
      {baja && (
        <div className="cs-baja">
          <h3 className="ds-rotulo">Si pregunta por qué</h3>
          <p><b>Motivo de la baja:</b> {baja.motivo ?? "Sin motivo registrado en SATAG."}{baja.fecha ? <span className="ds-nota"> · {fecha(baja.fecha)}</span> : null}</p>
          <p>{PROCESO_BAJA}</p>
        </div>
      )}

      <UltimasVeces pasos={r.pasos} hasta={eventosHasta} />

      <div className="ds-acciones">
        {algunoAbre ? (
          <>
            <button ref={primero} type="button" className="primary-action" onClick={() => onReportar("apertura")}>Abrí con el botón</button>
            <button type="button" className="ghost-action" onClick={() => onReportar("reporte")}>Reportar algo a Sistemas</button>
            <button type="button" className="ghost-action" onClick={onCerrar}>Volver</button>
          </>
        ) : (
          <>
            <button ref={primero} type="button" className="ghost-action" onClick={onCerrar}>Volver</button>
            <button type="button" className="ghost-action" onClick={() => onReportar("reporte")}>Reportar algo a Sistemas</button>
            <button type="button" className="link-action cs-quieto" onClick={() => onReportar("apertura")}>Se abrió con el botón de todos modos</button>
          </>
        )}
      </div>
    </article>
  );
}

/** El aviso de Sistemas dentro del veredicto: lo que pide y donde responderlo. */
function AvisoEnVeredicto({ a, onRespondido }: { a: AvisoDeVehiculo; onRespondido: () => void }) {
  return (
    <section className="cs-pide" aria-label="Aviso de Sistemas">
      <h3 className="ds-rotulo">Sistemas pide</h3>
      <p className="cs-pide__t">{a.texto}</p>
      {a.respuestas.map((s, i) => (
        <p key={i} className="ds-nota">Respondió {s.mia ? "usted" : "otro turno"} el {fechaHora(s.en)}: {s.respuesta}</p>
      ))}
      {/* Ya respondido, el campo se pliega: se puede agregar algo, pero no estorba. */}
      <Responder key={a.respuestas.length} avisoId={a.id} onRespondido={onRespondido} plegado={a.respuestas.length > 0} />
    </section>
  );
}

/** Responder un aviso: una linea, se manda como nota del caso. */
function Responder({ avisoId, onRespondido, plegado = false, etiqueta = "Responder" }: {
  avisoId: string;
  onRespondido: () => void;
  plegado?: boolean;
  etiqueta?: string;
}) {
  const [abierto, setAbierto] = useState(!plegado);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!abierto) {
    return <button type="button" className="ghost-action ghost-action--chico" onClick={() => setAbierto(true)}>{etiqueta}</button>;
  }
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (texto.trim().length < 2) { setError("Escriba la respuesta."); return; }
    setOcupado(true);
    setError(null);
    try {
      await casetaResponderAviso(avisoId, texto.trim());
      setTexto("");
      onRespondido();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la respuesta.");
    } finally {
      setOcupado(false);
    }
  }
  return (
    <form className="cs-responder" onSubmit={enviar}>
      <label className="sr-only" htmlFor={`resp-${avisoId}`}>Respuesta para Sistemas</label>
      <input id={`resp-${avisoId}`} className="input" value={texto} maxLength={500} autoFocus={plegado} placeholder="Qué dijo o qué pasó" onChange={(e) => setTexto(e.target.value)} />
      <button type="submit" className="ghost-action" disabled={ocupado}>{ocupado ? "Enviando…" : "Enviar"}</button>
      {error && <p className="ds-aviso ds-aviso--error" role="alert">{error}</p>}
    </form>
  );
}

/* ------------------------------------------------------------------ las ultimas veces en la pluma */

// Contexto para decidir (Gerardo, 14-oct: «cuál sí pasó, cuál no, cuál fue
// rechazo»). No es tiempo real: llega hasta el ultimo archivo de ZK que subio
// Sistemas, y se dice.
function UltimasVeces({ pasos, hasta }: { pasos: PasoPluma[]; hasta: string | null }) {
  const filas = estanciasDe(pasos, 5);
  return (
    <section className="cs-sec" aria-label="Últimas veces en la pluma">
      <h3 className="ds-rotulo">Últimas veces en la pluma</h3>
      {hasta && <p className="ds-nota">Lecturas de ZK hasta el {fechaHora(hasta)}: se actualizan cuando Sistemas sube el archivo.</p>}
      {filas.length === 0 && <p className="ds-nota">Sin lecturas en la pluma.</p>}
      <ul className="cs-ult">
        {filas.map((x, i) =>
          x.tipo === "rechazo" ? (
            <li key={i}>
              <span className="ds-nota">{diaSemana(x.en)}</span>
              <span className="cs-ult__l">{x.lote}</span>
              <span className="cs-texto--no-abre">✕ Rechazado en la {x.sentido} a las {hora(x.en)}</span>
            </li>
          ) : (
            <li key={i}>
              <span className="ds-nota">{diaSemana(x.entrada ?? x.salida)}</span>
              <span className="cs-ult__l">{x.lote}</span>
              <span>
                {x.entrada ? <>Entró {hora(x.entrada)}</> : <span className="ds-nota">Entrada sin leer</span>}
                {" → "}
                {x.salida ? <>salió {hora(x.salida)}</> : <span className="ds-nota">salida sin leer</span>}
              </span>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ los avisos de Sistemas */

// Gerardo, 19-oct: que el portero vea mas facil lo que le pasa Sistemas y lo que el
// ya reporto. Dos paneles lado a lado debajo del mostrador; el vehiculo se reconoce
// por la placa (grande), lo que falta por atender va primero y lo atendido se pliega.

function Avisos({ avisos, onRespondido, onVer }: {
  avisos: AvisoCaseta[];
  onRespondido: () => void;
  /** Busca el vehiculo del aviso para ver su veredicto. */
  onVer: (texto: string) => void;
}) {
  const [verAtendidos, setVerAtendidos] = useState(false);
  const pendientes = avisos.filter((a) => a.respuestas.length === 0);
  const atendidos = avisos.filter((a) => a.respuestas.length > 0);
  return (
    <section className="cs-panel" aria-label="Avisos de Sistemas">
      <header className="cs-panel__cab">
        <h2 className="cs-panel__t">Avisos de Sistemas</h2>
        {pendientes.length > 0
          ? <span className="cs-cuenta cs-cuenta--warn">{pendientes.length} por atender</span>
          : avisos.length > 0 && <span className="cs-cuenta cs-cuenta--ok">✓ Todos respondidos</span>}
      </header>
      {avisos.length === 0 ? (
        <p className="cs-vacio">Sistemas no tiene avisos para esta caseta.</p>
      ) : (
        <p className="ds-nota">Si llega uno de estos vehículos, haga lo que pide Sistemas y responda aquí.</p>
      )}
      <ul className="cs-tarjetas">
        {pendientes.map((a) => <TarjetaAviso key={a.id} a={a} onRespondido={onRespondido} onVer={onVer} />)}
      </ul>
      {atendidos.length > 0 && (
        <>
          <button type="button" className="link-action cs-plegar" aria-expanded={verAtendidos} onClick={() => setVerAtendidos((v) => !v)}>
            {verAtendidos ? "Ocultar" : "Ver"} {atendidos.length === 1 ? "el aviso ya respondido" : `los ${atendidos.length} avisos ya respondidos`}
          </button>
          {verAtendidos && (
            <ul className="cs-tarjetas">
              {atendidos.map((a) => <TarjetaAviso key={a.id} a={a} onRespondido={onRespondido} onVer={onVer} />)}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function TarjetaAviso({ a, onRespondido, onVer }: { a: AvisoCaseta; onRespondido: () => void; onVer: (texto: string) => void }) {
  const respondido = a.respuestas.length > 0;
  // La hora de cuando se dibujo la tarjeta: la lista se vuelve a leer cada 5 minutos.
  const [ahora] = useState(() => Date.now());
  const nuevo = !respondido && ahora - Date.parse(a.desde) < 86400000;
  const auto = [a.marca, a.modelo].filter(Boolean).join(" ");
  const buscarCon = a.placa ?? a.tarjeta ?? a.nombre;
  return (
    <li className={`cs-aviso${respondido ? " cs-aviso--resp" : ""}`}>
      <div className="cs-aviso__veh">
        <span className="cs-placa mono">{a.placa ?? "Sin placa"}</span>
        <span className="cs-aviso__auto">{[auto, a.color].filter(Boolean).join(" · ") || "Vehículo sin registrar"}</span>
        {nuevo && <span className="cs-nuevo">Nuevo</span>}
      </div>
      <p className="cs-aviso__quien">
        {a.nombre ?? (a.tarjeta ? `TAG ${a.tarjeta}` : "Sin nombre")}
        {a.lotes.length === 1 && <span className="ds-nota"> · solo en {a.lotes[0]}</span>}
      </p>
      <p className="cs-aviso__pide"><span className="cs-aviso__rot">Sistemas pide</span> {a.texto}</p>
      {a.respuestas.map((s, i) => (
        <p key={i} className="cs-aviso__resp">✓ Respondió {s.mia ? "usted" : "otro turno"} · {cuando(s.en, true)}: {s.respuesta}</p>
      ))}
      <div className="cs-aviso__acc">
        <Responder key={a.respuestas.length} avisoId={a.id} onRespondido={onRespondido} plegado
          etiqueta={respondido ? "Agregar algo" : "Responder"} />
        {buscarCon && <button type="button" className="ghost-action ghost-action--chico" onClick={() => onVer(buscarCon)}>Ver si tiene acceso</button>}
      </div>
      <p className="ds-nota">Desde {cuando(a.desde, true)}{a.hasta ? ` · hasta el ${fecha(a.hasta)}` : ""}</p>
    </li>
  );
}

/* ------------------------------------------------------------------ el seguimiento de los reportes */

function Reportes({ reportes, deTodos, onDeTodos }: {
  reportes: ReporteSeguimiento[];
  deTodos: boolean;
  onDeTodos: (v: boolean) => void;
}) {
  const [verResueltos, setVerResueltos] = useState(false);
  const enCurso = reportes.filter((m) => estadoSeguimiento(m).tono !== "listo");
  const resueltos = reportes.filter((m) => estadoSeguimiento(m).tono === "listo");
  return (
    <section className="cs-panel" aria-label="Reportes de la caseta">
      <header className="cs-panel__cab">
        <h2 className="cs-panel__t">{deTodos ? "Reportes de la caseta" : "Mis reportes"}</h2>
        {enCurso.length > 0 && <span className="cs-cuenta">{enCurso.length} en curso</span>}
        <label className="cs-casilla cs-panel__fin">
          <input type="checkbox" checked={deTodos} onChange={(e) => onDeTodos(e.target.checked)} /> De toda la caseta
        </label>
      </header>
      {reportes.length === 0 && (
        <p className="cs-vacio">{deTodos ? "La caseta no ha reportado nada este mes." : "Usted no ha reportado nada este mes."}</p>
      )}
      {reportes.length > 0 && enCurso.length === 0 && <p className="ds-nota">Sistemas ya atendió todo lo reportado.</p>}
      <ol className="cs-tarjetas">
        {enCurso.map((m, i) => <TarjetaReporte key={`c${i}`} m={m} detalle={deTodos && !m.mio ? " · otro turno" : null} />)}
      </ol>
      {resueltos.length > 0 && (
        <>
          <button type="button" className="link-action cs-plegar" aria-expanded={verResueltos} onClick={() => setVerResueltos((v) => !v)}>
            {verResueltos ? "Ocultar" : "Ver"} {resueltos.length === 1 ? "el reporte resuelto" : `los ${resueltos.length} reportes resueltos`}
          </button>
          {verResueltos && (
            <ol className="cs-tarjetas">
              {resueltos.map((m, i) => <TarjetaReporte key={`r${i}`} m={m} detalle={deTodos && !m.mio ? " · otro turno" : null} />)}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ el reporte */

function FormReporte({ borrador, caseta, nombreSesion, onCancelar, onListo }: {
  borrador: Borrador;
  caseta: Caseta;
  nombreSesion: string;
  onCancelar: () => void;
  onListo: (r: { caso: number | null; casoNuevo: boolean }) => void;
}) {
  const puertas = puertasDeCaseta(caseta);
  const dialogo = useRef<HTMLDialogElement>(null);
  const [clase, setClase] = useState<ClaseReporte>(borrador.clase);
  // Con un solo estacionamiento, la entrada va marcada (es lo comun); con los dos, se elige.
  const [puerta, setPuerta] = useState<Puerta | null>(puertas.length === 2 ? puertas[0].id : null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [placa, setPlaca] = useState("");
  const [sinPlacas, setSinPlacas] = useState(false);
  const [vehiculo, setVehiculo] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = borrador.resultado;
  const motivos = motivosDe(clase);
  const m = motivos.find((x) => x.id === motivo) ?? null;
  const identificado = !!r;
  const pidePlaca = !identificado && clase === "apertura" && !m?.sinPlaca;

  // <dialog> nativo: atrapa el foco y Esc lo cierra.
  useEffect(() => {
    const d = dialogo.current;
    if (d && !d.open) d.showModal();
    const cerrar = () => onCancelar();
    d?.addEventListener("cancel", cerrar);
    return () => d?.removeEventListener("cancel", cerrar);
  }, [onCancelar]);

  const falta =
    !puerta ? "Elija en qué puerta fue."
    : !m ? "Elija el motivo."
    : m.pideNota && nota.trim().length < 3 ? "Escriba en pocas palabras por qué."
    : pidePlaca && !sinPlacas && placaNormalizada(placa).length < 3 ? "Escriba la placa del vehículo."
    : pidePlaca && sinPlacas && vehiculo.trim().length < 5 ? "Escriba cómo es el vehículo (marca, modelo, color)."
    : !identificado && clase === "reporte" && nota.trim().length < 3 ? "Escriba en pocas palabras qué pasó."
    : null;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (falta || !m || !puerta) { setError(falta); return; }
    setOcupado(true);
    setError(null);
    try {
      const res = await casetaReportar({
        clase,
        puerta,
        motivo: m.id,
        registroId: r?.registroId ?? null,
        tarjeta: r ? datosComunes(r)?.tarjeta ?? null : null,
        placa: identificado || sinPlacas ? null : placa,
        vehiculo: identificado ? null : vehiculo || null,
        nota,
      });
      onListo(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el reporte.");
      setOcupado(false);
    }
  }

  return (
    <dialog ref={dialogo} className="ds-dialogo" aria-label="Reporte de la caseta">
      <form className="cs-form" onSubmit={enviar}>
        <div className="cs-seg cs-seg--ancho" role="group" aria-label="Qué reporta">
          <button type="button" aria-pressed={clase === "apertura"} onClick={() => { setClase("apertura"); setMotivo(null); }}>Abrí con el botón</button>
          <button type="button" aria-pressed={clase === "reporte"} onClick={() => { setClase("reporte"); setMotivo(null); }}>Otro reporte</button>
        </div>

        {r && <p><b>{nombreDe(r)}</b> <span className="ds-nota">· {r.placa ?? datosComunes(r)?.placaZk ?? "sin placa"}</span></p>}

        <fieldset className="cs-campo">
          <legend>Puerta</legend>
          <div className="cs-opciones">
            {puertas.map((p) => (
              <button key={p.id} type="button" className={`select-chip${puerta === p.id ? " on" : ""}`} aria-pressed={puerta === p.id} onClick={() => setPuerta(p.id)}>
                {p.titulo}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="cs-campo">
          <legend>Motivo</legend>
          <div className="cs-opciones">
            {motivos.map((x) => (
              <button key={x.id} type="button" className={`select-chip${motivo === x.id ? " on" : ""}`} aria-pressed={motivo === x.id} onClick={() => setMotivo(x.id)}>
                {x.titulo}
              </button>
            ))}
          </div>
        </fieldset>

        {pidePlaca && (
          <div className="cs-campo">
            {!sinPlacas && (
              <label>Placa
                <input className="input mono" value={placa} maxLength={12} autoComplete="off" onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="ABC-123-D" />
              </label>
            )}
            <label className="cs-casilla">
              <input type="checkbox" checked={sinPlacas} onChange={(e) => setSinPlacas(e.target.checked)} /> No tiene placas
            </label>
            {sinPlacas && (
              <label>Cómo es el vehículo
                <input className="input" value={vehiculo} maxLength={120} onChange={(e) => setVehiculo(e.target.value)} placeholder="Marca, modelo y color" />
              </label>
            )}
          </div>
        )}
        {!identificado && !pidePlaca && clase === "apertura" && (
          <label className="cs-campo"><span>Placa <span className="ds-nota">(si se alcanzó a ver)</span></span>
            <input className="input mono" value={placa} maxLength={12} onChange={(e) => setPlaca(e.target.value.toUpperCase())} />
          </label>
        )}

        <label className="cs-campo">
          <span>Nota {m?.pideNota || (!identificado && clase === "reporte") ? null : <span className="ds-nota">(opcional)</span>}</span>
          <textarea className="textarea cs-nota" rows={2} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} />
        </label>

        <p className="ds-nota">Reporta <b>{nombreSesion}</b>. Si no es usted, use «Cambiar de turno» antes de reportar.</p>
        {error && <p className="ds-aviso ds-aviso--error" role="alert">{error}</p>}
        <div className="ds-acciones">
          <button type="submit" className="primary-action" disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar reporte"}</button>
          <button type="button" className="ghost-action" onClick={onCancelar} disabled={ocupado}>Cancelar</button>
        </div>
      </form>
    </dialog>
  );
}
