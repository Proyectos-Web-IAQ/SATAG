"use client";

// El detalle de un caso guardado (bloque 89): lo que se sabe, la evidencia, el
// historial y el formulario para darle seguimiento.
//
// LO USAN DOS PANTALLAS: la pestana Casos y la ficha de persona. Por eso vive aparte:
// un caso se ve y se atiende igual desde donde se le abra.
//
// Quien escribe son ti, contador y admin (y super); todos leen. La base lo vuelve a
// verificar en el RPC: aqui `puedeEditar` solo evita ofrecer un boton que fallaria.
import { useEffect, useId, useState } from "react";
import { anotarCaso, listNotasCaso } from "@/lib/supabase/apiPanel";
import {
  ESTADOS_CASO,
  ETIQUETA_ESTADO_CASO,
  evidenciaLegible,
  numeroCaso,
  problemaDeSeguimiento,
  type CasoGuardado,
  type EstadoCasoGuardado,
  type NotaCaso,
  type TipoCasoCatalogo,
} from "@/lib/casosRegistro";

const ORIGEN_TEXTO: Record<CasoGuardado["origen"], string> = {
  manual: "Registrado a mano",
  regla: "Detectado por una regla",
  migracion: "Pasado del seguimiento anterior",
};

/** «6 oct 2026, 10:32», en hora de Queretaro. */
export function horaCaso(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));
}
/** «6 oct», para las listas. */
export function diaCaso(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));
}

export default function DetalleCaso({ caso, tipo, puedeEditar, email, onCambio }: {
  caso: CasoGuardado;
  tipo: TipoCasoCatalogo | undefined;
  puedeEditar: boolean;
  email: string | null;
  /** Se llama despues de guardar, para que quien lo muestra vuelva a leer el caso. */
  onCambio: () => void;
}) {
  const [notas, setNotas] = useState<NotaCaso[] | null>(null);
  const [errorNotas, setErrorNotas] = useState<string | null>(null);
  const [lectura, setLectura] = useState(0);
  const evidencia = evidenciaLegible(caso.evidencia);

  useEffect(() => {
    let vivo = true;
    setErrorNotas(null);
    listNotasCaso(caso.id)
      .then((n) => vivo && setNotas(n))
      .catch((e: unknown) => {
        if (!vivo) return;
        setNotas([]);
        setErrorNotas(e instanceof Error ? e.message : "No se pudo leer el historial.");
      });
    return () => { vivo = false; };
  }, [caso.id, caso.actualizadoEn, lectura]);

  return (
    <div className="caso">
      <p className="caso__meta">
        {numeroCaso(caso.numero)} · {tipo?.titulo ?? caso.tipo} · {ORIGEN_TEXTO[caso.origen]} por {caso.creadoPor}, {horaCaso(caso.creadoEn)}
        {caso.preguntarAlPresentarse && <> · <strong>Preguntar al presentarse</strong></>}
      </p>
      {caso.detalle.trim() && <p className="caso__detalle">{caso.detalle}</p>}
      {tipo?.queHacer && <p className="ti-hint"><strong>Qué hacer.</strong> {tipo.queHacer}</p>}
      {caso.cierreNota && (
        <p className="caso__cierre">
          <strong>{ETIQUETA_ESTADO_CASO[caso.estado]}</strong> por {caso.cerradoPor ?? "—"}
          {caso.cerradoEn ? `, ${horaCaso(caso.cerradoEn)}` : ""}: {caso.cierreNota}
        </p>
      )}

      {evidencia.length > 0 && (
        <>
          <h4 className="caso__h">Evidencia</h4>
          <dl className="caso__evid">
            {evidencia.map((e) => (
              <div key={e.etiqueta}><dt>{e.etiqueta}</dt><dd>{e.valor}</dd></div>
            ))}
          </dl>
        </>
      )}

      <h4 className="caso__h">Historial</h4>
      {notas === null ? (
        <p className="ficha__vacio">Leyendo el historial…</p>
      ) : (
        <>
          {errorNotas && (
            <p className="submit-error" role="alert">
              {errorNotas}{" "}
              <button type="button" className="link-action" onClick={() => setLectura((n) => n + 1)}>Reintentar</button>
            </p>
          )}
          {notas.length === 0 && !errorNotas && <p className="ficha__vacio">Sin movimientos.</p>}
          <ul className="actividad caso__hist">
            {notas.map((n) => (
              <li key={n.id}>
                <time>{horaCaso(n.hechoEn)}</time>
                <span>
                  {n.clase === "apertura" ? "Se abrió el caso" : n.estadoDespues ? `${n.estadoAntes ? `${ETIQUETA_ESTADO_CASO[n.estadoAntes]} → ` : ""}${ETIQUETA_ESTADO_CASO[n.estadoDespues]}` : "Nota"}
                  {" · "}{n.hechoPor}
                  {n.nota.trim() && <span className="caso__nota">{n.nota}</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {puedeEditar ? (
        <Seguimiento caso={caso} email={email} onGuardado={() => { setLectura((n) => n + 1); onCambio(); }} />
      ) : (
        <p className="ti-hint">Su rol puede leer el caso, no darle seguimiento.</p>
      )}
    </div>
  );
}

/** «Agregar seguimiento»: una nota, un cambio de estado o las dos. Cerrar pide la nota, y se dice antes de enviar. */
function Seguimiento({ caso, email, onGuardado }: { caso: CasoGuardado; email: string | null; onGuardado: () => void }) {
  const id = useId();
  const [nota, setNota] = useState("");
  const [estado, setEstado] = useState<EstadoCasoGuardado | "">("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problema = problemaDeSeguimiento(nota, estado === "" ? null : estado, caso.estado);
  // La nota obligatoria se dice desde que se elige cerrar; el aviso de «escriba algo»
  // espera a que haya un intento, para no regañar un formulario recien abierto.
  const cierra = estado === "resuelto" || estado === "descartado";

  async function guardar() {
    if (problema) return;
    setGuardando(true);
    setError(null);
    try {
      await anotarCaso(caso.id, nota.trim(), estado === "" || estado === caso.estado ? null : estado, email);
      setNota("");
      setEstado("");
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el seguimiento.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="casos__form caso__form" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
      <h4 className="caso__h">Agregar seguimiento</h4>
      <label className="label" htmlFor={`${id}-estado`}>Estado</label>
      <select id={`${id}-estado`} className="select" value={estado} onChange={(e) => setEstado(e.target.value as EstadoCasoGuardado | "")}>
        <option value="">Sin cambiar ({ETIQUETA_ESTADO_CASO[caso.estado].toLowerCase()})</option>
        {ESTADOS_CASO.filter((e) => e !== caso.estado).map((e) => (
          <option key={e} value={e}>{e === "abierto" && (caso.estado === "resuelto" || caso.estado === "descartado") ? "Reabrir" : ETIQUETA_ESTADO_CASO[e]}</option>
        ))}
      </select>
      <label className="label" htmlFor={`${id}-nota`}>
        Nota{cierra ? " (obligatoria: qué se hizo o por qué se cierra)" : ""}
      </label>
      <textarea id={`${id}-nota`} className="textarea" maxLength={2000} value={nota} onChange={(e) => setNota(e.target.value)} />
      {cierra && problema && <p className="ti-hint" role="status">{problema}</p>}
      {error && <p className="submit-error" role="alert">{error}</p>}
      <div className="chip-row">
        <button type="submit" className="primary-action caso__b" disabled={guardando || problema !== null}>
          {guardando ? "Guardando…" : "Guardar seguimiento"}
        </button>
      </div>
    </form>
  );
}
