"use client";

// La caseta del estacionamiento (bloque 97, Gerardo 14-oct).
//
// Cuando la pluma no le abre a un carro, el portero lo busca aqui ANTES de abrir
// con el boton: la pantalla le dice en grande si tiene acceso y, si no, por que.
// Si abre con el boton, lo reporta, y queda firmado con su cuenta.
//
// La caseta cubre un estacionamiento completo (entrada y salida) o los dos: se
// elige una vez y se recuerda en el equipo. Con los dos, el veredicto sale para
// cada uno. Entrada o salida se elige al reportar.
//
// Se usa en una Chromebook compartida por turnos: pantalla de laptop y teclado.
// El buscador tiene el foco; ↑ ↓ recorren los resultados, Enter abre el veredicto
// y Esc limpia. Lo que el portero ve lo decide la base (caseta_buscar,
// caseta_inicio): nombre, vehiculo, placa, plumas y, si es una baja, su motivo;
// nunca folio, pagos, firma, casos ni notas.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CASETAS,
  VEREDICTO,
  PROCESO_BAJA,
  datosComunes,
  estanciasDe,
  delLote,
  esCaseta,
  evaluacionesDe,
  lotesDeCaseta,
  motivosDe,
  placaNormalizada,
  puertasDeCaseta,
  rotuloMotivo,
  tituloPuerta,
  CLASE_CAMBIO,
  estadoSeguimiento,
  textoCambio,
  type CambioSistemas,
  type ClaseCambio,
  type ReporteSeguimiento,
  type Caseta,
  type ClaseReporte,
  type InicioCaseta,
  type Lote,
  type PasoPluma,
  type Puerta,
  type ResultadoCaseta,
} from "@/lib/caseta";
import { casetaBuscar, casetaInicio, casetaReportar } from "@/lib/supabase/apiPanel";
import { numeroCaso } from "@/lib/casosRegistro";
import { diaSemana, fecha, fechaHora, hora } from "@/lib/formato";
import { TIPO_PERSONA, textoPlumas } from "@/lib/glosario";
import { textoVehiculo } from "@/lib/vehiculo";
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

/** Lo que se va a reportar: con el vehiculo identificado o sin el. */
interface Borrador {
  clase: ClaseReporte;
  resultado: ResultadoCaseta | null;
}

export default function VistaCaseta({ nombreSesion }: { nombreSesion: string }) {
  const [caseta, setCaseta] = useState<Caseta | null>(null);
  const [inicio, setInicio] = useState<InicioCaseta | null>(null);
  const [errorInicio, setErrorInicio] = useState<string | null>(null);
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

  // El seguimiento: los reportes propios o los de toda la caseta.
  const [deTodos, setDeTodos] = useState(false);
  const leerInicio = useCallback(async () => {
    try {
      setInicio(await casetaInicio(deTodos));
      setErrorInicio(null);
    } catch (e) {
      setErrorInicio(e instanceof Error ? e.message : "No se pudieron leer los cambios de Sistemas.");
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

  function listo(texto: string) {
    setBorrador(null);
    setAviso(texto);
    setTimeout(() => setAviso((a) => (a === texto ? null : a)), 8000);
    leerInicio();
    limpiar();
  }

  const cambios = useMemo(() => delLote(inicio?.cambios ?? [], lotes.length ? lotes : null), [inicio, lotes]);

  if (!caseta) {
    return (
      <div className="caseta">
        <div className="panel caseta__puerta-inicial">
          <p className="panel-title">¿Qué estacionamiento cubre esta caseta?</p>
          <p className="ti-hint">Entrada y salida. Se recuerda en este equipo y puede cambiarlo en cualquier momento.</p>
          <div className="caseta__puertas">
            {CASETAS.map((c) => (
              <button key={c.id} type="button" className="select-chip caseta__puerta" onClick={() => elegirCaseta(c.id)}>
                {c.id === "E1-E2" ? "E1 y E2" : c.id} <span className="caseta__nota">· {c.titulo}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="caseta">
      <div className="caseta__barra">
        <div className="caseta__puertas" role="group" aria-label="Estacionamiento que cubre la caseta">
          {CASETAS.map((c) => (
            <button key={c.id} type="button" className={`select-chip${caseta === c.id ? " on" : ""}`} aria-pressed={caseta === c.id} onClick={() => elegirCaseta(c.id)}>
              {c.id === "E1-E2" ? "E1 y E2" : c.id}
            </button>
          ))}
        </div>
        <span className="caseta__fresco">
          {inicio?.padronZkAl ? <>Datos de ZK al {fecha(inicio.padronZkAl)}</> : null}
        </span>
      </div>

      {aviso && <p className="caseta__aviso" role="status">{aviso}</p>}

      {/* Diseño «Mostrador» (Gerardo, 14-oct): una sola columna al centro. Arriba el
          buscador; debajo, el veredicto del vehículo o, si no hay ninguno abierto,
          los cambios de Sistemas y el seguimiento de los reportes. */}
      <div className="caseta__centro">
        <section aria-label="Buscar vehículo">
          <label className="sr-only" htmlFor="caseta-buscar">Buscar el vehículo</label>
          <input
            id="caseta-buscar"
            ref={buscador}
            className="input caseta__buscar"
            type="search"
            autoFocus
            autoComplete="off"
            placeholder="Placa, nombre, modelo o número de TAG"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={teclas}
          />
          <p className="caseta__ayuda">Escriba al menos 3 letras o números · ↑ ↓ para elegir · Enter para ver · Esc para limpiar</p>
          {error && <p className="submit-error" role="alert">{error}</p>}
          {buscando && <p className="ti-hint">Buscando…</p>}
          {resultados && !buscando && resultados.length === 0 && (
            <div className="caseta__nada">
              <p><b>No aparece en SATAG ni en ZK.</b> Pruebe con otra parte de la placa, el modelo o el apellido.</p>
              <button type="button" className="ghost-action" onClick={() => setBorrador({ clase: "apertura", resultado: null })}>
                Abrí con el botón a un vehículo que no aparece
              </button>
            </div>
          )}
          {/* Con un solo resultado se abre directo; con varios, la lista queda arriba
              del veredicto para cambiar de uno a otro. */}
          {resultados && resultados.length > 1 && (
            <ul className="caseta__lista" role="listbox" aria-label="Resultados">
              {resultados.map((r, i) => {
                const evs = evaluacionesDe(r);
                const comun = datosComunes(r);
                const todos = evs.every((x) => x.ev.veredicto === evs[0]?.ev.veredicto);
                return (
                  <li key={`${r.registroId ?? ""}-${comun?.tarjeta ?? i}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === sel}
                      className={`caseta__res caseta__res--${todos ? evs[0]?.ev.veredicto : "mixto"}${i === sel ? " caseta__res--sel" : ""}${abierto === r ? " caseta__res--abierto" : ""}`}
                      onMouseEnter={() => setSel(i)}
                      onClick={() => setAbierto(r)}
                    >
                      <span className="caseta__punto" aria-hidden="true" />
                      <span className="caseta__res-txt">
                        <b>{nombreDe(r)}</b>
                        <span>{[r.placa ?? comun?.placaZk, r.marca || r.modelo ? textoVehiculo(r) : null].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="caseta__res-ver">
                        {evs.length === 1 || todos
                          ? VEREDICTO[evs[0].ev.veredicto].titulo
                          : evs.map((x) => (
                            <span key={x.lote} className={`caseta__res-lote caseta__res-lote--${x.ev.veredicto}`}>{x.lote} {x.ev.veredicto === "abre" ? "✓" : "✕"}</span>
                          ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!abierto && (
            <div className="caseta__otras">
              <button type="button" className="link-action" onClick={() => setBorrador({ clase: "apertura", resultado: null })}>Abrí con el botón sin buscar (visita, emergencia, falla)</button>
              <button type="button" className="link-action" onClick={() => setBorrador({ clase: "reporte", resultado: null })}>Reportar algo a Sistemas</button>
            </div>
          )}
        </section>

        {abierto ? (
          <Veredicto r={abierto} eventosHasta={inicio?.eventosHasta ?? null}
            onCerrar={() => { setAbierto(null); buscador.current?.focus(); }}
            onReportar={(clase) => setBorrador({ clase, resultado: abierto })} />
        ) : (
          <>
            {errorInicio && <p className="submit-error" role="alert">{errorInicio} <button type="button" className="link-action" onClick={leerInicio}>Reintentar</button></p>}
            {inicio === null && !errorInicio && <p className="ti-hint">Leyendo…</p>}
            {inicio && (
              <div className="caseta__tira">
                <section aria-label="Cambios de Sistemas">
                  <h2 className="caseta__h">Cambios de Sistemas <span className="caseta__nota">{cambios.length}</span></h2>
                  <Cambios cambios={cambios} lotes={lotes} />
                </section>
                <section aria-label="Mis reportes">
                  <h2 className="caseta__h">{deTodos ? "Reportes de la caseta" : "Mis reportes"} <span className="caseta__nota">{inicio.reportes.length}</span></h2>
                  <Reportes reportes={inicio.reportes} deTodos={deTodos} onDeTodos={setDeTodos} />
                </section>
              </div>
            )}
          </>
        )}
      </div>

      {borrador && (
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

function Veredicto({ r, eventosHasta, onCerrar, onReportar }: {
  r: ResultadoCaseta;
  eventosHasta: string | null;
  onCerrar: () => void;
  onReportar: (clase: ClaseReporte) => void;
}) {
  const evs = evaluacionesDe(r);
  const comun = datosComunes(r);
  const baja = evs.find((x) => x.ev.baja)?.ev.baja ?? null;
  const placaZkDistinta = comun?.placaZk && placaNormalizada(comun.placaZk) !== placaNormalizada(r.placa);
  const algunoAbre = evs.some((x) => x.ev.veredicto === "abre");
  const partidas = evs.length > 1 && evs.some((x) => x.ev.veredicto !== evs[0].ev.veredicto);
  const abrir = useRef<HTMLButtonElement>(null);
  useEffect(() => { abrir.current?.focus({ preventScroll: true }); }, [r]);
  return (
    <div className="caseta__ver">
      {/* Una banda por estacionamiento que cubre la caseta; si los dos dicen lo
          mismo, una sola, grande. */}
      <div className={`caseta__bandas${partidas ? " caseta__bandas--dos" : ""}`}>
        {(partidas ? evs : evs.slice(0, 1)).map(({ lote, ev }) => (
          <div key={lote} className={`caseta__banda caseta__banda--${ev.veredicto}`}>
            {partidas && <span className="caseta__banda-lote">{lote}</span>}
            <span className="caseta__banda-t">{VEREDICTO[ev.veredicto].titulo}</span>
            <span className="caseta__banda-a">{VEREDICTO[ev.veredicto].ayuda}</span>
          </div>
        ))}
      </div>
      <div className="caseta__ver-cuerpo">
        <div className="caseta__persona">
          <h2>{nombreDe(r)}</h2>
          <span className="caseta__nota">{tipoPersona(r.tipo) ?? ""}</span>
        </div>
        <dl className="caseta__datos">
          <dt>Vehículo</dt><dd>{r.marca || r.modelo ? textoVehiculo(r) : "Sin registrar"}</dd>
          <dt>Placa</dt><dd>{r.placa ?? comun?.placaZk ?? "—"}{placaZkDistinta && r.placa ? <span className="caseta__nota"> (en ZK: {comun?.placaZk})</span> : null}</dd>
          <dt>Plumas</dt><dd>{textoPlumas(r.plumas)}</dd>
          <dt>TAG</dt><dd className="mono">{comun?.tarjeta ?? "Sin TAG"}</dd>
          {comun?.departamentoZk && <><dt>En ZK</dt><dd>{comun.departamentoZk}</dd></>}
        </dl>

        <p className="caseta__sub">Por qué</p>
        <ul className="caseta__motivos">
          {evs.flatMap(({ lote, ev }) => ev.motivos
              // «Tiene acceso» junto a un rojo confunde: si ese estacionamiento sale en
              // rojo (p. ej. expediente de baja con ZK todavia abierto), no se dice.
              .filter((m) => !(m.clave === "acceso" && ev.veredicto === "no-abre"))
              .map((m, i) => ({ lote, m, i })))
            // Un motivo que vale para los dos (una baja) se dice una vez.
            .filter((x, i, l) => l.findIndex((y) => y.m.texto === x.m.texto) === i)
            .map(({ lote, m }) => (
              <li key={`${lote}-${m.texto}`} className={`caseta__motivo caseta__motivo--${m.veredicto}`}>
                <span className="caseta__punto" aria-hidden="true" />
                <span>{evs.length > 1 && m.clave !== "baja" && m.clave !== "sin-tag" ? <b>{lote}: </b> : null}{m.texto}</span>
              </li>
            ))}
        </ul>

        <UltimasVeces pasos={r.pasos} hasta={eventosHasta} />

        {/* Gerardo, 14-oct: si preguntan por que se dio de baja, el portero tiene la
            respuesta y el proceso. A donde remitir una queja aun no se decide. */}
        {baja && (
          <div className="caseta__baja">
            <p className="caseta__sub" style={{ marginTop: 0 }}>Si pregunta por qué</p>
            <p>
              <b>Motivo de la baja:</b>{" "}
              {baja.motivo ?? "Sin motivo registrado en SATAG."}
              {baja.fecha ? <span className="caseta__nota"> · {fecha(baja.fecha)}</span> : null}
            </p>
            <p><b>{PROCESO_BAJA}</b></p>
          </div>
        )}

        <div className="caseta__acciones">
          <button ref={abrir} type="button" className={algunoAbre ? "primary-action" : "ghost-action"} onClick={() => onReportar("apertura")}>
            Abrí con el botón
          </button>
          <button type="button" className="ghost-action" onClick={() => onReportar("reporte")}>Reportar algo a Sistemas</button>
          <button type="button" className="link-action" onClick={onCerrar}>Volver</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ las ultimas veces en la pluma */

// Contexto para decidir (Gerardo, 14-oct: «cuál sí pasó, cuál no, cuál fue
// rechazo»). No es tiempo real: llega hasta el ultimo archivo de ZK que subio
// Sistemas, y se dice.
function UltimasVeces({ pasos, hasta }: { pasos: PasoPluma[]; hasta: string | null }) {
  const filas = estanciasDe(pasos, 5);
  const hr = (s: string) => hora(s);
  return (
    <div className="caseta__ult">
      <div className="caseta__ult-cab">
        <b>Últimas veces en la pluma</b>
        {hasta && <span className="caseta__nota">Lecturas hasta el {fechaHora(hasta)} · se actualizan cuando Sistemas sube el archivo de ZK</span>}
      </div>
      {filas.length === 0 && <p className="caseta__nota" style={{ margin: "6px 0 0" }}>Sin lecturas en la pluma.</p>}
      {filas.map((x, i) =>
        x.tipo === "rechazo" ? (
          <div key={i} className="caseta__ult-f caseta__ult-f--no">
            <span className="caseta__ult-d">{diaSemana(x.en)}</span>
            <span className="caseta__ult-l">{x.lote}</span>
            <span><b>✕ Rechazado</b> en la {x.sentido} a las {hr(x.en)}</span>
          </div>
        ) : (
          <div key={i} className="caseta__ult-f">
            <span className="caseta__ult-d">{diaSemana(x.entrada ?? x.salida)}</span>
            <span className="caseta__ult-l">{x.lote}</span>
            <span>
              {x.entrada ? <><b className="caseta__ok">✓</b> Entró {hr(x.entrada)}</> : <span className="caseta__nota">Entrada sin leer</span>}
              {" → "}
              {x.salida ? <><b className="caseta__ok">✓</b> Salió {hr(x.salida)}</> : <span className="caseta__nota">salida sin leer</span>}
            </span>
          </div>
        ),
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ los cambios de Sistemas */

function Cambios({ cambios, lotes }: { cambios: CambioSistemas[]; lotes: Lote[] }) {
  const [clase, setClase] = useState<ClaseCambio | null>(null);
  const lista = clase ? cambios.filter((c) => c.clase === clase) : cambios;
  const cuenta = (k: ClaseCambio) => cambios.filter((c) => c.clase === k).length;
  return (
    <div className="caseta__avisos">
      <p className="ti-hint">
        Lo que Sistemas cambió este mes y afecta a {lotes.join(" y ")}. Una baja: la pluma ya no le abre; no abra y niegue el acceso.
      </p>
      <div className="chip-row" style={{ marginBottom: 8 }}>
        <button type="button" className={`select-chip${clase === null ? " on" : ""}`} onClick={() => setClase(null)}>Todos</button>
        {(Object.keys(CLASE_CAMBIO) as ClaseCambio[]).map((k) => (
          <button key={k} type="button" className={`select-chip${clase === k ? " on" : ""}`} onClick={() => setClase(k)}>
            {CLASE_CAMBIO[k].plural} {cuenta(k)}
          </button>
        ))}
      </div>
      {lista.length === 0 && <p className="caseta__vacio">Sin cambios de Sistemas este mes. Si un carro no abre, búsquelo a la izquierda.</p>}
      <ul className="caseta__lista-avisos">
        {lista.map((c) => (
          <li key={`${c.clase}-${c.tarjeta}`} className={`caseta__aviso-i caseta__aviso-i--${c.clase === "baja" ? "no-abre" : "abre"}`}>
            <span className="caseta__punto" aria-hidden="true" />
            <span className="caseta__aviso-txt">
              <span className="caseta__cambio">{CLASE_CAMBIO[c.clase].titulo}</span>{" "}
              <b>{c.nombre ?? `TAG ${c.tarjeta}`}</b>
              <span className="caseta__nota">
                {" "}{[c.placa, c.marca || c.modelo ? textoVehiculo(c) : null].filter(Boolean).join(" · ")}
              </span>
              <span className="caseta__aviso-ind">{textoCambio(c)}</span>
            </span>
            <span className="caseta__hora">{fecha(c.en)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ el seguimiento de los reportes */

function Reportes({ reportes, deTodos, onDeTodos }: {
  reportes: ReporteSeguimiento[];
  deTodos: boolean;
  onDeTodos: (v: boolean) => void;
}) {
  return (
    <div className="caseta__avisos">
      <div className="caseta__avisos-cab">
        <p className="ti-hint" style={{ margin: 0 }}>En qué va lo que se reportó este mes: Sistemas lo atiende y aquí se ve cuando lo cierra.</p>
        <label className="caseta__dos">
          <input type="checkbox" checked={deTodos} onChange={(e) => onDeTodos(e.target.checked)} /> De toda la caseta
        </label>
      </div>
      {reportes.length === 0 && <p className="caseta__vacio">{deTodos ? "La caseta no ha reportado nada este mes." : "Usted no ha reportado nada este mes."}</p>}
      <ul className="caseta__lista-avisos">
        {reportes.map((m, i) => {
          const s = estadoSeguimiento(m);
          return (
            <li key={i} className="caseta__rep">
              <span className={`caseta__estado caseta__estado--${s.tono}`}>{s.texto}</span>
              <span className="caseta__aviso-txt">
                <b>{m.quien ?? "Sin vehículo"}</b>
                <span className="caseta__nota"> · {m.clase === "apertura" ? "abrió con el botón" : "reporte"} en {tituloPuerta(m.puerta)}</span>
                <span className="caseta__aviso-ind">
                  {rotuloMotivo(m.clase, m.motivo)}
                  {m.caso ? <> · {numeroCaso(m.caso)}</> : null}
                  {m.ligado ? " · Sistemas identificó el vehículo" : ""}
                </span>
                {m.cierreMotivo && (
                  <span className="caseta__aviso-ind"><b>Lo que hizo Sistemas:</b> {m.cierreMotivo}{m.cerradoEn ? ` (${fecha(m.cerradoEn)})` : ""}</span>
                )}
                {deTodos && !m.mio && <span className="caseta__nota">Lo reportó otro turno.</span>}
              </span>
              <span className="caseta__hora">{fechaHora(m.en)}</span>
            </li>
          );
        })}
      </ul>
    </div>
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
    <div className="caseta__velo" role="dialog" aria-modal="true" aria-label="Reporte de la caseta"
      onKeyDown={(e) => { if (e.key === "Escape") onCancelar(); }}>
      <form className="caseta__form panel" onSubmit={enviar}>
        <div className="caseta__seg" role="group" aria-label="Qué reporta">
          <button type="button" aria-pressed={clase === "apertura"} onClick={() => { setClase("apertura"); setMotivo(null); }}>Abrí con el botón</button>
          <button type="button" aria-pressed={clase === "reporte"} onClick={() => { setClase("reporte"); setMotivo(null); }}>Otro reporte</button>
        </div>

        {r && (
          <p className="caseta__quien">
            <b>{nombreDe(r)}</b> · {r.placa ?? datosComunes(r)?.placaZk ?? "sin placa"}
          </p>
        )}

        <fieldset className="caseta__motivos-f">
          <legend>Puerta</legend>
          <div className="chip-row">
            {puertas.map((p) => (
              <button key={p.id} type="button" className={`select-chip${puerta === p.id ? " on" : ""}`} aria-pressed={puerta === p.id} onClick={() => setPuerta(p.id)}>
                {p.titulo}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="caseta__motivos-f">
          <legend>Motivo</legend>
          <div className="chip-row">
            {motivos.map((x, i) => (
              <button key={x.id} type="button" autoFocus={i === 0} className={`select-chip${motivo === x.id ? " on" : ""}`} aria-pressed={motivo === x.id} onClick={() => setMotivo(x.id)}>
                {x.titulo}
              </button>
            ))}
          </div>
        </fieldset>

        {pidePlaca && (
          <div className="caseta__placa">
            {!sinPlacas && (
              <label>Placa
                <input className="input" value={placa} maxLength={12} autoComplete="off" onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="ABC-123-D" />
              </label>
            )}
            <label className="caseta__dos">
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
          <label>Placa <span className="caseta__nota">(si se alcanzó a ver)</span>
            <input className="input" value={placa} maxLength={12} onChange={(e) => setPlaca(e.target.value.toUpperCase())} />
          </label>
        )}

        <label>
          Nota {m?.pideNota || (!identificado && clase === "reporte") ? "" : <span className="caseta__nota">(opcional)</span>}
          <textarea className="textarea" rows={2} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} />
        </label>

        <p className="caseta__firma">Reporta: <b>{nombreSesion}</b>. Si no es usted, use «Cambiar de turno» antes de reportar.</p>
        {error && <p className="submit-error" role="alert">{error}</p>}
        <div className="caseta__acciones">
          <button type="submit" className="primary-action" disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar reporte"}</button>
          <button type="button" className="ghost-action" onClick={onCancelar} disabled={ocupado}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
