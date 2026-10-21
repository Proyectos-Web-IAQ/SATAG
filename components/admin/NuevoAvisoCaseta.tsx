"use client";

// Crear un aviso a la caseta sin entrar al caso (Gerardo, 21-oct). El aviso vive
// en un caso (bloque 98: el caso da la persona, el TAG y el seguimiento), asi que
// el dialogo pide, en orden:
//   1. a quien: expediente de SATAG o TAG de ZK, con el buscador de «Reportar caso»;
//   2. en que caso: uno de sus casos abiertos o uno nuevo (reportar_caso, en Nuevo);
//   3. el aviso: que debe hacer la caseta, en que caseta y hasta cuando.
// Avisar es de ti (super pasa siempre); abrir el caso nuevo, de ti/contador/admin.
import { useEffect, useMemo, useState } from "react";
import {
  avisarCaseta,
  listCasos,
  listPadronEstacionamiento,
  listPadronZkConsulta,
  listTiposCaso,
  reportarCaso,
} from "@/lib/supabase/apiPanel";
import { buscarCandidatos, construirCandidatos, type CandidatoCaso } from "@/lib/buscarPersona";
import { COLUMNAS_CASO, columnaDe, numeroCaso, type CasoGuardado, type TipoCasoCatalogo } from "@/lib/casosRegistro";
import type { Lote } from "@/lib/zk/eventos";

/** «2026-10-21» en la hora del equipo (Queretaro), no en UTC. */
const hoyLocal = () => new Date().toLocaleDateString("en-CA");
const NUEVO = "nuevo-caso";

export default function NuevoAvisoCaseta({ email, onCancelar, onListo }: {
  email: string;
  onCancelar: () => void;
  onListo: (texto: string) => void;
}) {
  const [candidatos, setCandidatos] = useState<CandidatoCaso[] | null>(null);
  const [tipos, setTipos] = useState<TipoCasoCatalogo[]>([]);
  const [q, setQ] = useState("");
  const [quien, setQuien] = useState<CandidatoCaso | null>(null);
  const [casos, setCasos] = useState<CasoGuardado[] | null>(null);
  const [caso, setCaso] = useState<string>(NUEVO);
  const [tipo, setTipo] = useState("otro");
  const [texto, setTexto] = useState("");
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [hasta, setHasta] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El padron de SATAG y el de ZK (quien tiene TAG sin expediente tambien recibe avisos).
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
      const activos = ts.filter((t) => t.activo && !t.automatico);
      setTipos(activos);
      if (!activos.some((t) => t.tipo === "otro") && activos[0]) setTipo(activos[0].tipo);
    }).catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : "No se pudo leer el padrón."); setCandidatos([]); } });
    return () => { vivo = false; };
  }, []);

  // Sus casos abiertos: el aviso puede ir en uno de ellos.
  useEffect(() => {
    if (!quien) { setCasos(null); return; }
    let vivo = true;
    setCasos(null);
    listCasos({ registroId: quien.registroId ?? undefined, tarjetas: [quien.tarjeta] })
      .then((cs) => {
        if (!vivo) return;
        const abiertos = cs.filter((c) => columnaDe(c.estado) !== "cerrado");
        setCasos(abiertos);
        setCaso(abiertos[0]?.id ?? NUEVO);
      })
      .catch(() => { if (vivo) { setCasos([]); setCaso(NUEVO); } });
    return () => { vivo = false; };
  }, [quien]);

  const encontrados = useMemo(() => (candidatos ? buscarCandidatos(candidatos, q, 8) : []), [candidatos, q]);

  async function guardar() {
    if (!quien) { setError("Elija a quién es el aviso."); return; }
    const t = texto.trim();
    if (t.length < 5 || t.length > 300) { setError("Escriba qué debe hacer la caseta (de 5 a 300 caracteres)."); return; }
    setOcupado(true);
    setError(null);
    try {
      let casoId = caso;
      let numero: number | null = casos?.find((c) => c.id === caso)?.numero ?? null;
      if (caso === NUEVO) {
        const nuevo = await reportarCaso({
          tipo,
          titulo: `Aviso a la caseta: ${t.length > 80 ? `${t.slice(0, 79)}…` : t}`,
          detalle: t,
          registroId: quien.registroId,
          tarjeta: quien.tarjeta,
        }, email);
        casoId = nuevo.id;
        numero = nuevo.numero;
      }
      await avisarCaseta(casoId, t, lotes, hasta || null, email);
      onListo(`Aviso enviado a ${lotes.length === 1 ? `la caseta ${lotes[0]}` : "las dos casetas"}${numero ? ` (caso ${numeroCaso(numero)}${caso === NUEVO ? ", nuevo" : ""})` : ""}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar el aviso.");
      setOcupado(false);
    }
  }

  return (
    <div className="ds-velo" role="dialog" aria-modal="true" aria-label="Nuevo aviso a la caseta" onKeyDown={(e) => { if (e.key === "Escape" && !ocupado) onCancelar(); }}>
      <div className="ds-form panel na">
        <p className="panel-title">Nuevo aviso a la caseta</p>

        <section className="na-paso">
          <h3 className="ds-rotulo">1 · A quién</h3>
          {quien ? (
            <div className="na-elegido">
              <p><b>{quien.nombre}</b>{quien.placas && <span className="cs-placa mono na-placa">{quien.placas}</span>}</p>
              <p className="ds-nota">
                {[quien.vehiculo, `TAG ${quien.tarjeta}`, quien.folio, quien.estado === "baja" ? "dado de baja" : null, !quien.registroId ? "solo en ZK" : null]
                  .filter(Boolean).join(" · ")}
              </p>
              <button type="button" className="link-action" onClick={() => { setQuien(null); setQ(""); }}>Cambiar</button>
            </div>
          ) : (
            <>
              <input className="input search" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Nombre, placa, modelo, folio o TAG" aria-label="Buscar a la persona o el vehículo" />
              {candidatos === null && <p className="ti-hint">Leyendo el padrón…</p>}
              <ul className="aperturas__candidatos">
                {encontrados.map((c) => (
                  <li key={c.tarjeta}>
                    <button type="button" className="na-candidato" onClick={() => setQuien(c)}>
                      <b>{c.nombre}</b>{" "}
                      <span className="ds-nota">{[c.placas, c.vehiculo, `TAG ${c.tarjeta}`, c.estado === "baja" ? "dado de baja" : null, !c.registroId ? "solo en ZK" : null].filter(Boolean).join(" · ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {q.trim().length >= 2 && candidatos && !encontrados.length && <p className="ti-hint">Nadie en SATAG ni en ZK con eso.</p>}
            </>
          )}
        </section>

        {quien && (
          <section className="na-paso">
            <h3 className="ds-rotulo">2 · En qué caso</h3>
            {casos === null ? <p className="ti-hint">Leyendo sus casos…</p> : (
              <div className="na-casos" role="radiogroup" aria-label="Caso">
                {casos.map((c) => (
                  <label key={c.id} className={caso === c.id ? "on" : undefined}>
                    <input type="radio" name="na-caso" checked={caso === c.id} onChange={() => setCaso(c.id)} />
                    <span><b className="mono">{numeroCaso(c.numero)}</b> {c.titulo} <span className="ds-nota">· {COLUMNAS_CASO.find((x) => x.id === columnaDe(c.estado))?.titulo}</span></span>
                  </label>
                ))}
                <label className={caso === NUEVO ? "on" : undefined}>
                  <input type="radio" name="na-caso" checked={caso === NUEVO} onChange={() => setCaso(NUEVO)} />
                  <span>Abrir un caso nuevo para el aviso <span className="ds-nota">(entra en Nuevo)</span></span>
                </label>
                {caso === NUEVO && tipos.length > 0 && (
                  <label className="na-tipo">Tipo del caso
                    <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                      {tipos.map((t) => <option key={t.tipo} value={t.tipo}>{t.titulo}</option>)}
                    </select>
                  </label>
                )}
              </div>
            )}
          </section>
        )}

        {quien && (
          <section className="na-paso">
            <h3 className="ds-rotulo">3 · El aviso</h3>
            <label className="na-campo">Qué debe hacer la caseta
              <textarea className="textarea" rows={2} maxLength={300} value={texto} onChange={(e) => setTexto(e.target.value)}
                placeholder="Ej.: Si viene y no le abre, pregúntele quién es y anótelo aquí." />
            </label>
            <p className="ds-nota">El portero lo lee tal cual: escríbalo de usted.</p>
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
        )}

        {error && <p className="submit-error" role="alert">{error}</p>}
        <div className="ds-acciones">
          <button type="button" className="primary-action" disabled={!quien || ocupado} onClick={guardar}>{ocupado ? "Enviando…" : "Enviar el aviso"}</button>
          <button type="button" className="ghost-action" onClick={onCancelar} disabled={ocupado}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
