"use client";

// Avisos a la caseta desde un caso (bloque 98; Gerardo 15-oct).
//
// Sistemas le pide algo a la caseta sobre el vehiculo del caso («si viene y no le
// abre, preguntele quien es»). El portero lo ve al buscar el vehiculo y en su lista
// de avisos, y responde ahi mismo: la respuesta entra como nota del caso y el caso
// regresa a Por atender. El aviso vive hasta que Sistemas lo retira, hasta su fecha
// (si tiene) o hasta que el caso se cierra.
//
// Leen ti, contador, admin y super (RLS del 98); avisar y retirar es de ti (y super).
import { useCallback, useEffect, useState } from "react";
import type { RolPanel } from "@/lib/supabase/auth";
import { avisarCaseta, listAvisosCaso, retirarAvisoCaseta, nombreDesdeEmail, type AvisoDeCaso } from "@/lib/supabase/apiPanel";
import type { Lote } from "@/lib/zk/eventos";
import { fecha, fechaHora } from "@/lib/formato";

const LEEN: RolPanel[] = ["ti", "contador", "admin", "super"];
const AVISAN: RolPanel[] = ["ti", "super"];
/** «2026-10-15» en la hora del equipo (Queretaro), no en UTC: de noche UTC ya es mañana. */
const hoyLocal = () => new Date().toLocaleDateString("en-CA");

export default function AvisosCaseta({ casoId, cerrado, rol, email, lotesSugeridos, onCambio }: {
  casoId: string;
  cerrado: boolean;
  rol: RolPanel;
  email: string | null;
  /** El estacionamiento que se deduce del caso; marca de inicio del formulario. */
  lotesSugeridos: string[];
  /** Avisar y retirar dejan nota en el caso: el historial se vuelve a leer. */
  onCambio: () => void;
}) {
  const [avisos, setAvisos] = useState<AvisoDeCaso[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const avisa = AVISAN.includes(rol) && !cerrado;

  const leer = useCallback(async () => {
    try {
      setAvisos(await listAvisosCaso(casoId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer los avisos a la caseta.");
      setAvisos([]);
    }
  }, [casoId]);
  useEffect(() => { if (LEEN.includes(rol)) leer(); }, [leer, rol]);

  if (!LEEN.includes(rol)) return null;
  // Sin avisos y sin poder avisar, la seccion no aparece.
  if (avisos && avisos.length === 0 && !avisa && !error) return null;

  const hoy = hoyLocal();
  const vivo = (a: AvisoDeCaso) => !a.cerradoEn && !cerrado && (!a.hasta || a.hasta >= hoy);

  async function retirar(a: AvisoDeCaso) {
    try {
      await retirarAvisoCaseta(a.id, email);
      await leer();
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo retirar el aviso.");
    }
  }

  return (
    <section className="tc-avisos" aria-label="Avisos a la caseta">
      <h4 className="tc-h">Avisos a la caseta</h4>
      {error && <p className="submit-error" role="alert">{error}</p>}
      {avisos === null && <p className="ficha__vacio">Leyendo…</p>}
      <ul className="tc-avisos__lista">
        {(avisos ?? []).map((a) => (
          <li key={a.id} className={vivo(a) ? undefined : "tc-avisos__viejo"}>
            <p className="tc-avisos__t">{a.texto}</p>
            <p className="ds-nota">
              {a.lotes.length ? a.lotes.join(" y ") : "E1 y E2"} · {nombreDesdeEmail(a.creadoPor)}, {fechaHora(a.creadoEn)}
              {a.hasta ? ` · hasta el ${fecha(a.hasta)}` : ""}
              {a.cerradoEn ? ` · retirado el ${fecha(a.cerradoEn)}` : !vivo(a) ? " · ya no se muestra" : " · la caseta lo ve"}
            </p>
            {a.respuestas.map((r, i) => (
              <p key={i} className="tc-avisos__resp"><b>{nombreDesdeEmail(r.hechoPor)}</b> <span className="ds-nota">{fechaHora(r.hechoEn)}</span> {r.respuesta}</p>
            ))}
            {AVISAN.includes(rol) && vivo(a) && (
              <button type="button" className="link-action" onClick={() => retirar(a)}>Retirar</button>
            )}
          </li>
        ))}
      </ul>
      {avisa && !form && (
        <button type="button" className="ghost-action ghost-action--chico" onClick={() => setForm(true)}>Avisar a la caseta…</button>
      )}
      {avisa && form && (
        <FormAviso casoId={casoId} email={email} lotesSugeridos={lotesSugeridos}
          onCancelar={() => setForm(false)}
          onListo={async () => { setForm(false); await leer(); onCambio(); }} />
      )}
    </section>
  );
}

function FormAviso({ casoId, email, lotesSugeridos, onCancelar, onListo }: {
  casoId: string;
  email: string | null;
  lotesSugeridos: string[];
  onCancelar: () => void;
  onListo: () => void;
}) {
  const inicial: Lote[] = lotesSugeridos.filter((l): l is Lote => l === "E1" || l === "E2");
  const [texto, setTexto] = useState("");
  const [lotes, setLotes] = useState<Lote[]>(inicial.length === 1 ? inicial : []);
  const [hasta, setHasta] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (texto.trim().length < 5) { setError("Escriba qué debe hacer la caseta (al menos 5 letras)."); return; }
    setOcupado(true);
    setError(null);
    try {
      await avisarCaseta(casoId, texto.trim(), lotes, hasta || null, email);
      onListo();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el aviso.");
      setOcupado(false);
    }
  }

  return (
    <form className="tc-avisos__form" onSubmit={enviar}>
      <label>Qué debe hacer la caseta
        <textarea className="textarea" rows={2} maxLength={300} value={texto} autoFocus
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ej.: Si viene y no le abre, pregúntele quién es y anótelo aquí." />
      </label>
      <p className="ds-nota">El portero lo ve al buscar este vehículo y en sus avisos. Use «usted»: lo lee tal cual.</p>
      <div className="tc-avisos__fila">
        <div className="tc-seg" role="group" aria-label="Estacionamiento">
          <button type="button" aria-pressed={lotes.length === 0} onClick={() => setLotes([])}>E1 y E2</button>
          <button type="button" aria-pressed={lotes.length === 1 && lotes[0] === "E1"} onClick={() => setLotes(["E1"])}>Solo E1</button>
          <button type="button" aria-pressed={lotes.length === 1 && lotes[0] === "E2"} onClick={() => setLotes(["E2"])}>Solo E2</button>
        </div>
        <label className="tc-avisos__hasta">Hasta <span className="ds-nota">(opcional)</span>
          <input className="input" type="date" value={hasta} min={hoyLocal()} onChange={(e) => setHasta(e.target.value)} />
        </label>
      </div>
      {error && <p className="submit-error" role="alert">{error}</p>}
      <div className="ds-acciones">
        <button type="submit" className="primary-action" disabled={ocupado}>{ocupado ? "Guardando…" : "Avisar a la caseta"}</button>
        <button type="button" className="ghost-action" onClick={onCancelar} disabled={ocupado}>Cancelar</button>
      </div>
    </form>
  );
}
