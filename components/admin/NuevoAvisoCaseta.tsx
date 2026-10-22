"use client";

// Crear un aviso a la caseta sin entrar al caso (Gerardo, 21-oct). El aviso vive
// en un caso (bloque 98: el caso da la persona, el TAG y el seguimiento), asi que
// el dialogo pide, en orden:
//   1. a quien: expediente de SATAG o TAG de ZK, con el buscador de «Reportar caso»,
//      y en que caso de cada uno: uno de sus casos abiertos o uno nuevo (reportar_caso,
//      en Nuevo);
//   2. el aviso: que debe hacer la caseta, en que caseta y hasta cuando.
// Avisar es de ti (super pasa siempre); abrir el caso nuevo, de ti/contador/admin.
//
// 22-oct: el mismo aviso a varios a la vez, y la barra de los casos cerrados esta
// semana para arrastrarlos (o tocarlos, en el celular). El caso del ejemplo: los que
// se dieron de baja porque no se sabe su nombre en GES; si vuelven, la caseta les
// explica y les pide el apellido de la familia. avisar_caseta rechaza los casos
// cerrados, asi que el cerrado se REABRE en Esperando (a que la persona se presente):
// cuando la caseta responde, caseta_responder_aviso lo regresa a Por atender.
import { useEffect, useMemo, useState, type DragEvent } from "react";
import {
  avisarCaseta,
  listCasos,
  listPadronEstacionamiento,
  listPadronZkConsulta,
  listTiposCaso,
  moverCasos,
  reportarCaso,
} from "@/lib/supabase/apiPanel";
import { buscarCandidatos, construirCandidatos, normalizarBusqueda, type CandidatoCaso } from "@/lib/buscarPersona";
import { columnaDe, numeroCaso, type CasoGuardado, type TipoCasoCatalogo } from "@/lib/casosRegistro";
import type { Lote } from "@/lib/zk/eventos";

/** «2026-10-21» en la hora del equipo (Queretaro), no en UTC. */
const hoyLocal = () => new Date().toLocaleDateString("en-CA");
/** Las 0:00 del lunes de esta semana, en la hora del equipo. */
function lunesLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
const NUEVO = "nuevo-caso";
const MIME = "application/x-satag-caso";

/** El texto del ejemplo de Gerardo (22-oct), listo para usarse. */
const TEXTO_SIN_GES =
  "Se le dio de baja porque no tenemos su nombre en GES. Explíqueselo, pídale el apellido de la familia y su relación con el alumno, anótelo aquí y ábrale la pluma.";

/** A quien va el aviso: un caso cerrado que se reabre, o una persona buscada. */
type Destino =
  | { clave: string; de: "cerrado"; caso: CasoGuardado }
  | { clave: string; de: "persona"; quien: CandidatoCaso; casos: CasoGuardado[] | null; eleccion: string };

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { weekday: "short", day: "numeric" });

export default function NuevoAvisoCaseta({ email, onCancelar, onListo }: {
  email: string;
  onCancelar: () => void;
  onListo: (texto: string) => void;
}) {
  const [candidatos, setCandidatos] = useState<CandidatoCaso[] | null>(null);
  const [todosTipos, setTodosTipos] = useState<TipoCasoCatalogo[]>([]);
  const [cerrados, setCerrados] = useState<CasoGuardado[] | null>(null);
  const [fTipo, setFTipo] = useState("");
  const [fTexto, setFTexto] = useState("");
  const [q, setQ] = useState("");
  const [destinos, setDestinos] = useState<Destino[]>([]);
  const [sobre, setSobre] = useState(false);
  const [tipo, setTipo] = useState("otro");
  const [texto, setTexto] = useState("");
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [hasta, setHasta] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El padron de SATAG y el de ZK (quien tiene TAG sin expediente tambien recibe avisos),
  // y los casos, de donde salen los cerrados de esta semana.
  useEffect(() => {
    let vivo = true;
    Promise.all([
      listPadronEstacionamiento(),
      listPadronZkConsulta().catch(() => []),
      listTiposCaso().catch(() => []),
    ]).then(([padron, zk, ts]) => {
      if (!vivo) return;
      const mapaZk = new Map(zk.filter((p) => p.vigente).map((p) => [p.tarjeta, { nombre: p.nombre, departamento: p.departamento, placa: p.placa }]));
      setCandidatos(construirCandidatos(padron, mapaZk));
      setTodosTipos(ts);
      const activos = ts.filter((t) => t.activo && !t.automatico);
      if (!activos.some((t) => t.tipo === "otro") && activos[0]) setTipo(activos[0].tipo);
    }).catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : "No se pudo leer el padrón."); setCandidatos([]); } });
    const desde = lunesLocal().getTime();
    listCasos()
      .then((cs) => { if (vivo) setCerrados(cs.filter((c) => columnaDe(c.estado) === "cerrado" && c.cerradoEn && new Date(c.cerradoEn).getTime() >= desde)); })
      .catch(() => { if (vivo) setCerrados([]); });
    return () => { vivo = false; };
  }, []);

  const tiposNuevos = useMemo(() => todosTipos.filter((t) => t.activo && !t.automatico), [todosTipos]);
  const tituloTipo = (t: string) => todosTipos.find((x) => x.tipo === t)?.titulo ?? t;
  const encontrados = useMemo(() => (candidatos ? buscarCandidatos(candidatos, q, 8) : []), [candidatos, q]);
  const claves = useMemo(() => new Set(destinos.map((d) => d.clave)), [destinos]);

  // La barra: los cerrados de esta semana que aun no estan en la lista, por tipo y texto.
  const tiposCerrados = useMemo(() => {
    const n = new Map<string, number>();
    for (const c of cerrados ?? []) n.set(c.tipo, (n.get(c.tipo) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]);
  }, [cerrados]);
  const enBarra = useMemo(() => {
    const t = normalizarBusqueda(fTexto);
    return (cerrados ?? []).filter((c) => !claves.has(`caso:${c.id}`) && (!fTipo || c.tipo === fTipo)
      && (!t || normalizarBusqueda([c.nombre, c.titulo, c.cierreNota, c.tarjeta, c.folio, c.vehiculo?.placas, numeroCaso(c.numero)].filter(Boolean).join(" ")).includes(t)));
  }, [cerrados, claves, fTipo, fTexto]);

  function agregarCerrados(ids: string[]) {
    const nuevos = (cerrados ?? []).filter((c) => ids.includes(c.id) && !claves.has(`caso:${c.id}`));
    if (nuevos.length) setDestinos((ds) => [...ds, ...nuevos.map((c): Destino => ({ clave: `caso:${c.id}`, de: "cerrado", caso: c }))]);
  }

  function agregarPersona(quien: CandidatoCaso) {
    const clave = `tag:${quien.tarjeta}`;
    setQ("");
    if (claves.has(clave)) return;
    setDestinos((ds) => [...ds, { clave, de: "persona", quien, casos: null, eleccion: NUEVO }]);
    // Sus casos abiertos: el aviso puede ir en uno de ellos.
    const poner = (casos: CasoGuardado[]) => setDestinos((ds) => ds.map((d) =>
      d.clave === clave && d.de === "persona" ? { ...d, casos, eleccion: casos[0]?.id ?? NUEVO } : d));
    listCasos({ registroId: quien.registroId ?? undefined, tarjetas: [quien.tarjeta] })
      .then((cs) => poner(cs.filter((c) => columnaDe(c.estado) !== "cerrado")))
      .catch(() => poner([]));
  }

  const quitar = (clave: string) => setDestinos((ds) => ds.filter((d) => d.clave !== clave));

  function soltar(e: DragEvent) {
    e.preventDefault();
    setSobre(false);
    const ids = e.dataTransfer.getData(MIME);
    if (ids) agregarCerrados(ids.split(","));
  }

  const reabre = destinos.filter((d) => d.de === "cerrado").length;
  const abreNuevos = destinos.filter((d) => d.de === "persona" && d.eleccion === NUEVO).length;

  async function guardar() {
    if (!destinos.length) { setError("Elija a quién es el aviso: búsquelo o arrastre un caso cerrado."); return; }
    if (destinos.some((d) => d.de === "persona" && d.casos === null)) { setError("Espere a que se lean los casos de cada persona."); return; }
    const t = texto.trim();
    if (t.length < 5 || t.length > 300) { setError("Escriba qué debe hacer la caseta (de 5 a 300 caracteres)."); return; }
    setOcupado(true);
    setError(null);
    const enviados = new Set<string>();
    let creados = 0;
    try {
      // Los cerrados se reabren todos de una vez; si ya estaban en Esperando, mover_casos los salta.
      const ids = destinos.flatMap((d) => (d.de === "cerrado" ? [d.caso.id] : []));
      if (ids.length) await moverCasos(ids, { estado: "esperando", espera: { motivo: "persona" }, nota: "Se reabre para avisar a la caseta" }, email);
      for (const d of destinos) {
        let casoId: string;
        if (d.de === "cerrado") casoId = d.caso.id;
        else if (d.eleccion !== NUEVO) casoId = d.eleccion;
        else {
          const nuevo = await reportarCaso({
            tipo,
            titulo: `Aviso a la caseta: ${t.length > 80 ? `${t.slice(0, 79)}…` : t}`,
            detalle: t,
            registroId: d.quien.registroId,
            tarjeta: d.quien.tarjeta,
          }, email);
          creados++;
          casoId = nuevo.id;
          // Si el aviso falla despues, el reintento usa este caso y no abre otro.
          setDestinos((ds) => ds.map((x) => (x.clave === d.clave && x.de === "persona"
            ? { ...x, casos: [...(x.casos ?? []), { id: nuevo.id, numero: nuevo.numero, titulo: "Caso nuevo del aviso", estado: "nuevo" } as CasoGuardado], eleccion: nuevo.id }
            : x)));
        }
        await avisarCaseta(casoId, t, lotes, hasta || null, email);
        enviados.add(d.clave);
      }
      const n = destinos.length;
      onListo(`Aviso enviado a ${lotes.length === 1 ? `la caseta ${lotes[0]}` : "las dos casetas"} para ${n === 1 ? "una persona" : `${n} personas`}.`
        + (reabre ? ` ${reabre === 1 ? "Un caso cerrado se reabrió" : `${reabre} casos cerrados se reabrieron`} en Esperando.` : "")
        + (creados ? ` ${creados === 1 ? "Un caso nuevo" : `${creados} casos nuevos`} en Nuevo.` : ""));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo enviar el aviso.";
      setDestinos((ds) => ds.filter((d) => !enviados.has(d.clave)));
      setError(enviados.size ? `${msg} Ya se avisó a ${enviados.size}; en la lista quedan los que faltan.` : msg);
      setOcupado(false);
    }
  }

  const arrastrar = (e: DragEvent, ids: string[]) => {
    e.dataTransfer.setData(MIME, ids.join(","));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="ds-velo" role="dialog" aria-modal="true" aria-label="Nuevo aviso a la caseta" onKeyDown={(e) => { if (e.key === "Escape" && !ocupado) onCancelar(); }}>
      <div className="ds-form panel na na--con-barra">
        <p className="panel-title">Nuevo aviso a la caseta</p>

        <div className="na-cuerpo">
          <aside className="na-barra" aria-label="Casos cerrados esta semana">
            <h3 className="ds-rotulo">Cerrados esta semana {cerrados && <span className="ds-nota">{cerrados.length}</span>}</h3>
            <p className="ds-nota">Arrástrelos a «A quién» o tóquelos. Se reabren en Esperando.</p>
            {cerrados === null ? <p className="ti-hint">Leyendo los casos…</p> : cerrados.length === 0 ? <p className="ti-hint">No se ha cerrado ningún caso esta semana.</p> : (
              <>
                <select className="select" value={fTipo} onChange={(e) => setFTipo(e.target.value)} aria-label="Tipo de caso">
                  <option value="">Todos los tipos</option>
                  {tiposCerrados.map(([t, n]) => <option key={t} value={t}>{tituloTipo(t)} ({n})</option>)}
                </select>
                <input className="input search" type="search" value={fTexto} onChange={(e) => setFTexto(e.target.value)}
                  placeholder="Nombre, nota de cierre, TAG…" aria-label="Filtrar los cerrados" />
                {enBarra.length > 1 && (
                  <button type="button" className="ghost-action na-todos" draggable
                    onDragStart={(e) => arrastrar(e, enBarra.map((c) => c.id))} onClick={() => agregarCerrados(enBarra.map((c) => c.id))}>
                    Agregar los {enBarra.length}
                  </button>
                )}
                <ul className="na-cerrados">
                  {enBarra.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="na-cerrado" draggable onDragStart={(e) => arrastrar(e, [c.id])} onClick={() => agregarCerrados([c.id])}
                        title={c.cierreNota ?? c.titulo}>
                        <span className="na-cerrado__t"><b>{c.nombre ?? c.titulo}</b> <span className="na-mas" aria-hidden="true">＋</span></span>
                        <span className="ds-nota">{[numeroCaso(c.numero), tituloTipo(c.tipo), c.cerradoEn ? fechaCorta(c.cerradoEn) : null].filter(Boolean).join(" · ")}</span>
                        {c.cierreNota && <span className="ds-nota na-cerrado__nota">{c.cierreNota}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
                {enBarra.length === 0 && <p className="ti-hint">{fTipo || fTexto ? "Ninguno con ese filtro." : "Ya están todos en la lista."}</p>}
              </>
            )}
          </aside>

          <div className="na-form">
            <section className={`na-paso na-destino${sobre ? " na-destino--sobre" : ""}`}
              onDragOver={(e) => { if (e.dataTransfer.types.includes(MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setSobre(true); } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(false); }}
              onDrop={soltar}>
              <h3 className="ds-rotulo">1 · A quién {destinos.length > 0 && <span className="ds-nota">{destinos.length}</span>}</h3>
              {destinos.length === 0 && <p className="na-suelte">Suelte aquí los casos cerrados, o busque a la persona.</p>}
              {destinos.length > 0 && (
                <ul className="na-lista">
                  {destinos.map((d) => (
                    <li key={d.clave} className="na-elegido">
                      {d.de === "cerrado" ? (
                        <>
                          <p><b>{d.caso.nombre ?? d.caso.titulo}</b>{d.caso.vehiculo?.placas && <span className="cs-placa mono na-placa">{d.caso.vehiculo.placas}</span>}</p>
                          <p className="ds-nota">{[numeroCaso(d.caso.numero), tituloTipo(d.caso.tipo), d.caso.tarjeta ? `TAG ${d.caso.tarjeta}` : null, "se reabre en Esperando"].filter(Boolean).join(" · ")}</p>
                        </>
                      ) : (
                        <>
                          <p><b>{d.quien.nombre}</b>{d.quien.placas && <span className="cs-placa mono na-placa">{d.quien.placas}</span>}</p>
                          <p className="ds-nota">
                            {[d.quien.vehiculo, `TAG ${d.quien.tarjeta}`, d.quien.folio, d.quien.estado === "baja" ? "dado de baja" : null, !d.quien.registroId ? "solo en ZK" : null]
                              .filter(Boolean).join(" · ")}
                          </p>
                          {d.casos === null ? <p className="ti-hint">Leyendo sus casos…</p> : (
                            <label className="na-encaso">En el caso
                              <select className="select" value={d.eleccion}
                                onChange={(e) => setDestinos((ds) => ds.map((x) => (x.clave === d.clave && x.de === "persona" ? { ...x, eleccion: e.target.value } : x)))}>
                                {d.casos.map((c) => <option key={c.id} value={c.id}>{numeroCaso(c.numero)} {c.titulo}</option>)}
                                <option value={NUEVO}>Abrir un caso nuevo (entra en Nuevo)</option>
                              </select>
                            </label>
                          )}
                        </>
                      )}
                      <button type="button" className="link-action na-quitar" onClick={() => quitar(d.clave)} disabled={ocupado} aria-label={`Quitar de la lista`}>Quitar</button>
                    </li>
                  ))}
                </ul>
              )}
              <input className="input search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar: nombre, placa, modelo, folio o TAG" aria-label="Buscar a la persona o el vehículo" />
              {candidatos === null && q.trim().length >= 2 && <p className="ti-hint">Leyendo el padrón…</p>}
              {q.trim().length >= 2 && (
                <ul className="aperturas__candidatos">
                  {encontrados.map((c) => (
                    <li key={c.tarjeta}>
                      <button type="button" className="na-candidato" onClick={() => agregarPersona(c)}>
                        <b>{c.nombre}</b>{" "}
                        <span className="ds-nota">{[c.placas, c.vehiculo, `TAG ${c.tarjeta}`, c.estado === "baja" ? "dado de baja" : null, !c.registroId ? "solo en ZK" : null].filter(Boolean).join(" · ")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {q.trim().length >= 2 && candidatos && !encontrados.length && <p className="ti-hint">Nadie en SATAG ni en ZK con eso.</p>}
              {abreNuevos > 0 && tiposNuevos.length > 0 && (
                <label className="na-encaso">Tipo {abreNuevos === 1 ? "del caso nuevo" : `de los ${abreNuevos} casos nuevos`}
                  <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                    {tiposNuevos.map((t) => <option key={t.tipo} value={t.tipo}>{t.titulo}</option>)}
                  </select>
                </label>
              )}
            </section>

            <section className="na-paso">
              <h3 className="ds-rotulo">2 · El aviso</h3>
              <label className="na-campo">Qué debe hacer la caseta
                <textarea className="textarea" rows={3} maxLength={300} value={texto} onChange={(e) => setTexto(e.target.value)}
                  placeholder="Ej.: Si viene y no le abre, pregúntele quién es y anótelo aquí." />
              </label>
              <p className="ds-nota">
                El portero lo lee tal cual: escríbalo de usted. {destinos.length > 1 && "Cada persona recibe el mismo aviso. "}
                {texto.trim() !== TEXTO_SIN_GES && <button type="button" className="link-action" onClick={() => setTexto(TEXTO_SIN_GES)}>Usar el texto de bajas sin nombre en GES</button>}
              </p>
              <div className="tc-avisos__fila">
                <div className="tc-seg" role="group" aria-label="Caseta">
                  <button type="button" aria-pressed={lotes.length === 0} onClick={() => setLotes([])}>Las dos casetas</button>
                  <button type="button" aria-pressed={lotes.length === 1 && lotes[0] === "E1"} onClick={() => setLotes(["E1"])}>Solo E1</button>
                  <button type="button" aria-pressed={lotes.length === 1 && lotes[0] === "E2"} onClick={() => setLotes(["E2"])}>Solo E2</button>
                </div>
                <label className="tc-avisos__hasta">Hasta <span className="ds-nota">(opcional)</span>
                  <input className="input" type="date" value={hasta} min={hoyLocal()} onChange={(e) => setHasta(e.target.value)} />
                </label>
              </div>
            </section>
          </div>
        </div>

        {error && <p className="submit-error" role="alert">{error}</p>}
        <div className="ds-acciones">
          <button type="button" className="primary-action" disabled={!destinos.length || ocupado} onClick={guardar}>
            {ocupado ? "Enviando…" : destinos.length > 1 ? `Enviar el aviso a ${destinos.length}` : "Enviar el aviso"}
          </button>
          <button type="button" className="ghost-action" onClick={onCancelar} disabled={ocupado}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
