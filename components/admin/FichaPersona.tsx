"use client";

// La ficha de persona: todo lo de un expediente en una pagina (DISEÑO.md §3.4).
//
// POR QUE EXISTE. Hasta octubre de 2026 lo que se sabia de una persona estaba
// repartido: su expediente en Consulta, su TAG y sus plumas en TI, y sus pasos por la
// pluma en la pestana Estacionamiento, sin nombre. Aqui se junta, con una anatomia
// fija: arriba la identidad, al lado los datos y lo que no cuadra, abajo lo
// relacionado —TAGs, vehiculo, pasos de la semana, actividad— en tablas sin cajas.
//
// LOS PASOS SON LA NOVEDAD. Salen de `zk_eventos` (bloque 78), emparejados con la
// misma funcion que usa la pestana Estacionamiento, asi que una estancia aqui y una
// estancia alla son la misma cosa. Solo los lee quien lee esa tabla: ti, contador y
// super. A Consulta se le dice, no se le dibuja una semana vacia.
//
// UN EXPEDIENTE ES UN VEHICULO CON UN TAG. Por eso la ficha es de un expediente y no
// de una familia: lo que si se enlaza son los expedientes con los mismos apellidos de
// familia, en «Datos», para ir de uno a otro.

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import type { AreaAdmin, Registro } from "@/lib/mock/types";
import type { RolPanel } from "@/lib/supabase/auth";
import { asignarAreaAdmin, listPasosDeTarjetas, type PasoZk } from "@/lib/supabase/apiPanel";
import { emparejarEstancias, horaCorta, type Estancia } from "@/lib/estacionamiento";
import type { EventoZk } from "@/lib/zk/eventos";
import { DetalleRegistro, ROL_LABEL } from "@/components/admin/RegistroCard";
import EvidenciaFirmaPanel from "@/components/admin/EvidenciaFirma";

/** Quien lee `zk_eventos` segun la RLS del bloque 78. */
const VEN_PASOS: RolPanel[] = ["ti", "contador", "super"];

const ORIGEN_LABEL: Record<Registro["origenExpediente"], string> = {
  satag: "Alta en SATAG",
  migracion_hoja: "Migrado de la hoja histórica",
  migracion_zk: "Migrado del control de acceso",
};

const ESTADO_LABEL: Record<Registro["estado"], string> = {
  pendiente: "Pendiente de cobro",
  activo: "Activo",
  bloqueado: "Bloqueado",
  baja: "Dado de baja",
};

/** «2026-09-22» o una fecha ISO con hora a «22/09/2026». Lo que no sea fecha, tal cual. */
function fechaCorta(v: string | null | undefined): string {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

/** «mar 22 sep», en hora local, para las filas de la semana. */
function diaLegible(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a, m - 1, d, 12).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
}

/** Los TAGs que ha tenido el expediente: el vigente primero y los anteriores despues. */
function tagsDe(r: Registro): { numero: string; estado: string; desde: string; vigente: boolean }[] {
  const out: { numero: string; estado: string; desde: string; vigente: boolean }[] = [];
  if (r.noDispositivo) {
    out.push({
      numero: r.noDispositivo,
      estado: r.estado === "baja" ? `Dado de baja${r.fechaBaja ? ` el ${fechaCorta(r.fechaBaja)}` : ""}` : "Vigente",
      desde: fechaCorta(r.fechaInstalacion ?? r.createdAt),
      vigente: r.estado !== "baja",
    });
  }
  if (r.tagApartado && r.tagApartadoNo) {
    out.push({ numero: r.tagApartadoNo, estado: "Apartado por la escuela", desde: "—", vigente: false });
  }
  for (const m of r.movimientos) {
    if (m.noDispositivoAnterior && m.noDispositivoAnterior !== r.noDispositivo && !out.some((t) => t.numero === m.noDispositivoAnterior)) {
      out.push({
        numero: m.noDispositivoAnterior,
        estado: `${m.tipo === "reposicion" ? "Repuesto" : "Cambiado"} el ${fechaCorta(m.fecha)}`,
        desde: "—",
        vigente: false,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ los pasos */

const DESDE = 6 * 60, HASTA = 20 * 60;

/**
 * Entradas y salidas de los ultimos dias, una fila por dia, cada estancia como una
 * barra de la entrada a la salida. Es la forma de Priestley: se ve de un vistazo
 * quien deja y arranca y quien se queda la jornada, sin leer una tabla de eventos.
 */
export function PasosSemana({ estancias }: { estancias: Estancia[] }) {
  const dias = [...new Set(estancias.map((e) => e.dia))].sort().slice(-7);
  if (dias.length === 0) return <p className="ficha__vacio">Sin pasos registrados en las ventanas cargadas.</p>;
  const w = 640, filaH = 30, arriba = 22, izq = 66, der = 26;
  const alto = arriba + dias.length * filaH + 8;
  const x = (m: number) => izq + ((Math.min(HASTA, Math.max(DESDE, m)) - DESDE) / (HASTA - DESDE)) * (w - izq - der);
  const horas: number[] = [];
  for (let m = DESDE; m <= HASTA; m += 120) horas.push(m);
  const texto = dias
    .map((d) => `${diaLegible(d)}: ${estancias.filter((e) => e.dia === d).map((e) => `${e.lote} de ${horaCorta(e.entro)} a ${horaCorta(e.entro + e.dur)}`).join(", ") || "no entró"}`)
    .join(". ");
  return (
    <div className="pasos">
      <div className="viz-scroll">
        <svg viewBox={`0 0 ${w} ${alto}`} role="img" aria-label={`Entradas y salidas por día. ${texto}.`}>
          {horas.map((m) => (
            <g key={m}>
              <line className="viz-reja" x1={x(m)} x2={x(m)} y1={arriba - 6} y2={alto - 6} />
              <text className="viz-marca" x={x(m)} y={12} textAnchor="middle">{horaCorta(m)}</text>
            </g>
          ))}
          {dias.map((d, i) => {
            const y = arriba + i * filaH;
            const del = estancias.filter((e) => e.dia === d).sort((a, b) => a.entro - b.entro);
            return (
              <g key={d}>
                <text className="viz-fila" x={0} y={y + 14}>{diaLegible(d)}</text>
                {del.length === 0 && <text className="viz-marca" x={izq} y={y + 14}>No entró</text>}
                {del.map((e, j) => {
                  const x1 = x(e.entro), x2 = Math.max(x(e.entro + e.dur), x1 + 3);
                  const fin = e.censura === null ? horaCorta(e.entro + e.dur) : "sin salida leída";
                  // El rotulo va a la derecha de la barra si cabe antes de la siguiente
                  // y antes del borde; si no, queda en el title.
                  const sig = del[j + 1];
                  const cabe = x2 + 100 < (sig ? x(sig.entro) : w - der + 100) && x2 + 96 < w;
                  return (
                    <g key={j}>
                      <rect className={`pasos__barra${e.lote === "E1" ? " pasos__barra--e1" : ""}${e.censura !== null ? " pasos__barra--abierta" : ""}`}
                        x={x1.toFixed(1)} y={y + 4} width={(x2 - x1).toFixed(1)} height={12} rx={2}>
                        <title>{`${e.lote} · entró ${horaCorta(e.entro)} · ${fin}`}</title>
                      </rect>
                      {cabe && (
                        <text className="viz-marca" x={x2 + 5} y={y + 14}>{e.lote} {horaCorta(e.entro)}–{e.censura === null ? horaCorta(e.entro + e.dur) : "?"}</text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="pasos__nota">Azul: E2. Gris: E1. Cada barra va de la entrada a la salida; la que termina en «?» no tiene salida leída.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ la ficha */

function Ficha({ r, rol, familia, onIr, extras = [] }: {
  r: Registro;
  rol: RolPanel;
  familia: Registro[];
  onIr: (id: string) => void;
  /** Avisos que trae quien usa la ficha y que el expediente solo no sabe: los de la bitacora y los de ZK. */
  extras?: string[];
}) {
  const [pasos, setPasos] = useState<{ para: string; estancias: Estancia[]; error: string | null; cargando: boolean }>({
    para: "", estancias: [], error: null, cargando: false,
  });
  const tags = useMemo(() => tagsDe(r), [r]);
  const puedeVerPasos = VEN_PASOS.includes(rol);

  useEffect(() => {
    if (!puedeVerPasos) return;
    const numeros = tags.map((t) => t.numero);
    if (numeros.length === 0) {
      setPasos({ para: r.id, estancias: [], error: null, cargando: false });
      return;
    }
    let vivo = true;
    setPasos({ para: r.id, estancias: [], error: null, cargando: true });
    listPasosDeTarjetas(numeros)
      .then((p) => {
        if (!vivo) return;
        const eventos: EventoZk[] = p.map((e: PasoZk) => ({
          idEvento: e.idEvento,
          ocurrioEn: e.ocurrioEn.replace("T", " ").slice(0, 19),
          lote: e.lote as EventoZk["lote"],
          sentido: e.sentido,
          tarjeta: e.tarjeta,
          descripcion: "",
          concedido: true,
          departamentoEvento: "",
          repeticion: false,
        }));
        setPasos({ para: r.id, estancias: emparejarEstancias(eventos).estancias, error: null, cargando: false });
      })
      .catch((err: unknown) => {
        if (!vivo) return;
        setPasos({ para: r.id, estancias: [], error: err instanceof Error ? err.message : "No se pudieron leer los pasos.", cargando: false });
      });
    return () => { vivo = false; };
  }, [r.id, tags, puedeVerPasos]);

  const estancias = pasos.para === r.id ? pasos.estancias : [];
  const visitas = estancias.length;
  const diasConPaso = new Set(estancias.map((e) => e.dia)).size;
  const lotesUsados = [...new Set(estancias.map((e) => e.lote))];

  // Lo que no cuadra: cada aviso es una frase, y solo aparece si aplica.
  const avisos: string[] = [];
  if (r.noDispositivo && !r.placas && !r.sinPlacas) avisos.push("Tiene TAG pero ninguna placa registrada.");
  if (r.estado === "activo" && r.estacionamientos.length === 0) avisos.push("Está activo y no tiene derecho de pluma asignado.");
  const pendientes = r.solicitudes.filter((s) => !s.atendida).length;
  if (pendientes > 0) avisos.push(pendientes === 1 ? "Tiene una solicitud sin atender." : `Tiene ${pendientes} solicitudes sin atender.`);
  if (r.estado === "pendiente" && r.origenExpediente === "satag" && r.pagos.length === 0) {
    // Bloque 85: no es lo mismo no haber pagado que haber pagado y que se le devolviera.
    avisos.push(r.devoluciones.length > 0 ? "Su pago se devolvió y está por cobrar de nuevo." : "Todavía no pasa por caja.");
  }
  for (const l of lotesUsados) {
    if (!r.estacionamientos.includes(l)) avisos.push(`Entró por el ${l} y no tiene esa pluma en SATAG.`);
  }
  if (r.estado === "baja" && visitas > 0) avisos.push("Está dado de baja y su TAG sigue abriendo la pluma.");
  for (const a of extras) if (!avisos.includes(a)) avisos.push(a);

  const rolTexto = ROL_LABEL[r.tipoUsuario];
  const seccion = r.seccionMaestro ?? (r.apellidosFamilia ? `familia ${r.apellidosFamilia}` : null);

  return (
    <article className="ficha" aria-live="polite">
      <div className="ficha__ident">
        <h2>{r.usuarioNombre}</h2>
        <span className="ficha__rol">{rolTexto}{seccion ? ` · ${seccion}` : ""}</span>
      </div>
      <div className="ficha__cifras">
        <span>TAG {r.estado === "baja" ? "" : "vigente "}<b><code>{r.noDispositivo ?? "sin TAG"}</code></b></span>
        <span>Plumas <b>{r.estacionamientos.length ? r.estacionamientos.join(" y ") : "ninguna"}</b></span>
        {puedeVerPasos && pasos.para === r.id && !pasos.cargando && pasos.error === null && (
          <span>Últimos días <b>{visitas} {visitas === 1 ? "visita" : "visitas"}</b>{diasConPaso > 0 ? ` en ${diasConPaso} ${diasConPaso === 1 ? "día" : "días"}` : ""}</span>
        )}
        <span>Folio <b><code>{r.folio}</code></b></span>
      </div>

      <div className="ficha__cuerpo">
        <div>
          <section className="ficha__bloque">
            <h3>Entradas y salidas</h3>
            {!puedeVerPasos ? (
              <p className="ficha__vacio">Los pasos por la pluma los ve el personal que opera el padrón.</p>
            ) : pasos.cargando || pasos.para !== r.id ? (
              <p className="ficha__vacio">Leyendo la bitácora…</p>
            ) : pasos.error ? (
              <p className="submit-error" role="alert">{pasos.error}</p>
            ) : tags.length === 0 ? (
              <p className="ficha__vacio">Sin TAG, no hay pasos que buscar.</p>
            ) : (
              <PasosSemana estancias={estancias} />
            )}
          </section>

          <section className="ficha__bloque">
            <h3>TAGs</h3>
            {tags.length === 0 ? (
              <p className="ficha__vacio">Todavía no tiene TAG instalado.</p>
            ) : (
              <div className="table-wrap">
                <table className="tabla-tipo">
                  <thead><tr><th>Número</th><th>Estado</th><th>Desde</th></tr></thead>
                  <tbody>
                    {tags.map((t) => (
                      <tr key={t.numero} className={t.vigente ? undefined : "baja"}>
                        <td className="mono">{t.numero}</td>
                        <td>{t.estado}</td>
                        <td>{t.desde}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="ficha__bloque">
            <h3>Vehículo</h3>
            <div className="table-wrap">
              <table className="tabla-tipo">
                <thead><tr><th>Placa</th><th>Vehículo</th><th>Estado</th></tr></thead>
                <tbody>
                  <tr className={r.estado === "baja" ? "baja" : undefined}>
                    <td className="mono">{r.placas ?? (r.sinPlacas ? "Sin placas" : "—")}</td>
                    <td>{[r.marca, r.modelo, r.color].filter((v) => v && v !== "Sin registrar").join(", ") || "Sin registrar"}</td>
                    <td>{ESTADO_LABEL[r.estado]}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="ficha__bloque">
            <h3>Actividad</h3>
            {r.movimientos.length === 0 && r.pagos.length === 0 && r.devoluciones.length === 0 ? (
              <p className="ficha__vacio">Sin movimientos registrados.</p>
            ) : (
              <ul className="actividad">
                {[...r.movimientos]
                  // La devolucion (bloque 85) ya trae su frase completa en el motivo.
                  .map((m) => ({ fecha: m.fecha, texto: m.tipo === "devolucion"
                    ? `${m.motivo ?? "Devolución del pago"}${m.hechoPor ? ` · ${m.hechoPor}` : ""}`
                    : `${m.tipo.charAt(0).toUpperCase()}${m.tipo.slice(1)}${m.motivo ? `: ${m.motivo}` : ""}${m.hechoPor ? ` · ${m.hechoPor}` : ""}` }))
                  .concat(r.pagos.map((p) => ({ fecha: p.fecha ?? "", texto: `Cobro de $${p.monto}${p.cobradoPor ? ` · ${p.cobradoPor}` : ""}` })))
                  // El cobro devuelto sigue siendo algo que paso: se lista, marcado.
                  .concat(r.devoluciones.map((p) => ({ fecha: p.fecha ?? "", texto: `Cobro de $${p.monto} (devuelto después)${p.cobradoPor ? ` · ${p.cobradoPor}` : ""}` })))
                  .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
                  .map((a, i) => (
                    <li key={i}><time>{fechaCorta(a.fecha)}</time><span>{a.texto}</span></li>
                  ))}
              </ul>
            )}
          </section>

          <section className="ficha__bloque">
            <h3>Expediente</h3>
            <DetalleRegistro r={r} />
            <EvidenciaFirmaPanel registroId={r.id} rol={rol} />
          </section>
        </div>

        <aside>
          <h3>Datos</h3>
          <dl className="props">
            <div><dt>Tipo</dt><dd>{rolTexto}</dd></div>
            {r.seccionMaestro && <div><dt>Sección</dt><dd>{r.seccionMaestro}</dd></div>}
            {r.tipoUsuario === "admin" && <AreaAdministrativa r={r} rol={rol} />}
            {r.apellidosFamilia && <div><dt>Familia</dt><dd>{r.apellidosFamilia}</dd></div>}
            <div><dt>Plumas</dt><dd>{r.estacionamientos.length ? r.estacionamientos.join(", ") : "Ninguna"}</dd></div>
            <div><dt>Estado</dt><dd>{ESTADO_LABEL[r.estado]}</dd></div>
            <div><dt>Origen</dt><dd>{ORIGEN_LABEL[r.origenExpediente]}</dd></div>
            <div><dt>Folio</dt><dd><code>{r.folio}</code></dd></div>
          </dl>
          {familia.length > 0 && (
            <>
              <h3 style={{ marginTop: 26 }}>Misma familia</h3>
              <ul className="actividad">
                {familia.map((f) => (
                  <li key={f.id} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
                    <button type="button" className="link-action" onClick={() => onIr(f.id)}>
                      {f.usuarioNombre} · {ROL_LABEL[f.tipoUsuario]}{f.noDispositivo ? ` · TAG ${f.noDispositivo}` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {avisos.length > 0 && (
            <>
              <h3 style={{ marginTop: 26 }}>Lo que no cuadra</h3>
              {avisos.map((a) => <p className="aviso-ficha" key={a}>{a}</p>)}
            </>
          )}
        </aside>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ lista y ficha */

// Bloque 88: el administrativo es de Administración (ZK 16) o de Admon (ZK 17, el
// equipo del contador). La diferencia solo existe en el panel, nunca en el registro
// público. SATAG y ZK van a la par: esta área es el departamento al que exporta el
// puente, y al cargar el padrón de ZK se alinea con el que ZK tenga.
const AREA_LABEL: Record<AreaAdmin, string> = { administracion: "Administración", admon: "Admon" };
const CAMBIAN_AREA: RolPanel[] = ["admin", "ti", "super"];

function AreaAdministrativa({ r, rol }: { r: Registro; rol: RolPanel }) {
  const [area, setArea] = useState<AreaAdmin>(r.areaAdmin ?? "administracion");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const otra: AreaAdmin = area === "admon" ? "administracion" : "admon";
  async function cambiar() {
    setGuardando(true);
    setError(null);
    try {
      await asignarAreaAdmin(r.id, otra, null);
      setArea(otra);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el área.");
    } finally {
      setGuardando(false);
    }
  }
  return (
    <div>
      <dt>Área</dt>
      <dd>
        {AREA_LABEL[area]}
        {CAMBIAN_AREA.includes(rol) && (
          <>
            {" · "}
            <button type="button" className="link-action" disabled={guardando} onClick={cambiar}>
              {guardando ? "Guardando…" : `Pasar a ${AREA_LABEL[otra]}`}
            </button>
          </>
        )}
        {error && <span className="field-error" role="alert"> {error}</span>}
      </dd>
    </div>
  );
}

export default function FichaPersona({ registros, todos, rol, vacio, linea, avisosExtra, orden }: {
  /** Los expedientes que pasan el buscador y los filtros de Consulta. */
  registros: Registro[];
  /** El padrón completo, para enlazar a la misma familia aunque el filtro la deje fuera. */
  todos: Registro[];
  rol: RolPanel;
  vacio: string;
  /** Una linea mas en cada renglon de la lista: lo que quien usa la ficha sabe de esa persona (su uso del estacionamiento). */
  linea?: (r: Registro) => ReactNode;
  /** Avisos que el expediente solo no sabe, para «Lo que no cuadra»; tambien encienden el punto de la lista. */
  avisosExtra?: (r: Registro) => string[];
  /** Como viene ordenada la lista, dicho junto a la cuenta: «por entradas, de más a menos». */
  orden?: string;
}) {
  const [elegido, setElegido] = useState<string | null>(null);
  const id = useId();
  const actual = registros.find((r) => r.id === elegido) ?? registros[0] ?? null;

  const señalada = (r: Registro) =>
    (r.noDispositivo !== null && !r.placas && !r.sinPlacas) ||
    r.solicitudes.some((s) => !s.atendida) ||
    (r.estado === "activo" && r.estacionamientos.length === 0) ||
    (avisosExtra !== undefined && avisosExtra(r).length > 0);

  const familia = actual && actual.apellidosFamilia
    ? todos.filter((f) => f.id !== actual.id && f.apellidosFamilia && f.apellidosFamilia.toLowerCase() === actual.apellidosFamilia!.toLowerCase())
    : [];

  return (
    <div className="ficha-app">
      <div className="ficha-lista">
        <p className="ficha-lista__n" id={`${id}-n`}>
          {registros.length === 0 ? vacio : `${registros.length.toLocaleString("es-MX")} ${registros.length === 1 ? "expediente" : "expedientes"}${orden ? ` · ${orden}` : ""}`}
        </p>
        <ul aria-labelledby={`${id}-n`}>
          {registros.slice(0, 300).map((r) => (
            <li key={r.id}>
              <button type="button" className="persona" aria-current={actual?.id === r.id} onClick={() => setElegido(r.id)}>
                <span className="persona__nm">
                  <span>{r.usuarioNombre}</span>
                  {señalada(r) && <span className="persona__punto" title="Hay algo que no cuadra" />}
                </span>
                <span className="persona__mt">
                  {ROL_LABEL[r.tipoUsuario]} · {r.noDispositivo ? <>TAG <code>{r.noDispositivo}</code></> : "sin TAG"}
                  {r.placas ? <> · <code>{r.placas}</code></> : ""}
                </span>
                {linea && <span className="persona__mt persona__uso">{linea(r)}</span>}
              </button>
            </li>
          ))}
          {registros.length > 300 && (
            <li className="ficha-lista__n" style={{ padding: "8px 10px" }}>Se muestran 300. Afine la búsqueda para ver el resto.</li>
          )}
        </ul>
      </div>
      {actual ? (
        <Ficha key={actual.id} r={actual} rol={rol} familia={familia} onIr={setElegido} extras={avisosExtra ? avisosExtra(actual) : []} />
      ) : (
        <div className="ficha"><p className="ficha__vacio">{vacio}</p></div>
      )}
    </div>
  );
}
