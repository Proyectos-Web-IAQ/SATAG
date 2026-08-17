"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { CorteCaja, EstadoCaja, PagoReciente, ResultadoCorte } from "@/lib/mock/types";
import { obtenerEstadoCaja, cortarCaja, listCortes, listPagosDeCorte } from "@/lib/supabase/apiPanel";
import Loader from "@/components/Loader";
import ConfirmDialog from "@/components/ConfirmDialog";
import { scrollAlAviso } from "@/components/admin/RegistroCard";

const dinero = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const FMT_FECHA_HORA = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

function fechaHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : FMT_FECHA_HORA.format(d);
}

// El desglose trae 'dia' como 'YYYY-MM-DD' ya en hora local: se reordena a
// DD/MM/YYYY sin construir un Date (evita el corrimiento de zona horaria).
function diaCorto(dia: string): string {
  const [y, m, d] = dia.split("-");
  return d && m && y ? `${d}/${m}/${y}` : dia;
}

// UMBRALES del semáforo de la caja (fuente de verdad para soporte / manual).
// El criterio es DIAS DE COBRO DISTINTOS sin cortar, no días transcurridos: un
// corte que mezcla varios días suele arrastrar efectivo ya entregado, y ese es
// el origen de los faltantes falsos. 1 día (o 0 cobros) no tiene ambigüedad.
const semDias = (n: number) => (n <= 1 ? "ok" : n === 2 ? "warn" : "alert");

// Clave especial para el detalle de cobros de la caja actual (aún sin cortar).
const CLAVE_CAJA = "caja";

// Sub-tabla de cobros de una fila expandida (un corte, o la caja actual). Los
// tres estados van separados a propósito: en la pantalla del dinero, una lectura
// que se cayó no puede verse igual que un periodo sin cobros, porque quien
// concilia daría por bueno un corte vacío y firmaría un faltante inexistente.
function DetalleCobros({ cargando, error, lista, onReintentar }: {
  cargando: boolean;
  error: string | null;
  lista: PagoReciente[];
  onReintentar: () => void;
}) {
  if (cargando) return <p className="ti-hint" style={{ margin: 0 }}>Cargando cobros…</p>;
  if (error) {
    return (
      <p className="submit-error" role="alert" style={{ margin: 0 }}>
        No se pudieron cargar los cobros. {error} Esto no quiere decir que el periodo esté
        vacío: el detalle se desconoce. No concilie con esta pantalla hasta que la lista cargue.{" "}
        <button type="button" className="link-action" onClick={onReintentar}>Reintentar</button>
      </p>
    );
  }
  if (lista.length === 0) return <p className="ti-hint" style={{ margin: 0 }}>Sin cobros en este periodo.</p>;
  return (
    <div className="table-wrap">
      <table className="admin-table">
        <thead>
          <tr><th>Fecha</th><th>Recibo</th><th>Expediente</th><th>Monto</th><th>Cobrado por</th></tr>
        </thead>
        <tbody>
          {lista.map((p, i) => (
            <tr key={p.folioRecibo ?? `${p.fecha}-${i}`}>
              <td>{fechaHora(p.fecha)}</td>
              <td>{p.folioRecibo ?? "—"}</td>
              <td>{p.registroFolio ?? "—"}{p.usuarioNombre ? ` · ${p.usuarioNombre}` : ""}</td>
              <td>{dinero.format(p.monto)}</td>
              <td>{p.cobradoPor ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ConfirmCfg = {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  action: () => Promise<ResultadoCorte>;
  ok: (r: ResultadoCorte) => string;
};

// Vista de finanzas de Administración (rol admin/super). Responde las dos
// preguntas del usuario: cuánto debería haber en caja ahora, y cuánto se ha
// vendido. Y permite el corte: contar el efectivo, conciliar y reestablecer la
// caja. El historial de cortes muestra los cobros de cada corte al expandirlo.
// Toda la autoridad vive en la BD (bloque 42); esta pantalla solo la presenta.
export default function VistaFinanzas({ nombreSesion }: { nombreSesion: string }) {
  const [estado, setEstado] = useState<EstadoCaja | null>(null);
  const [cortes, setCortes] = useState<CorteCaja[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [contado, setContado] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmCfg | null>(null);

  // Detalle de cobros expandible: se carga bajo demanda por corte (y por la caja
  // actual con la clave CLAVE_CAJA). expandido = qué fila está abierta.
  const [expandido, setExpandido] = useState<string | null>(null);
  const [pagosPorCorte, setPagosPorCorte] = useState<Record<string, PagoReciente[]>>({});
  const [cargandoDet, setCargandoDet] = useState<string | null>(null);
  // Fallo de lectura por fila. Vive aparte de pagosPorCorte a propósito: mientras
  // está puesto no hay lista que mostrar, ni siquiera una vacía.
  const [errorDet, setErrorDet] = useState<Record<string, string | null>>({});

  // Guardia de frescura del detalle: cada lectura toma un folio creciente y solo
  // la última pedida para esa fila puede escribir. Sin esto, dos lecturas
  // solapadas de la misma fila —cerrar y reabrir mientras carga, o un doble clic
  // en Reintentar— podían terminar con la lista buena en caché Y el error rojo
  // encima, y como DetalleCobros mira el error antes que la lista, la pantalla
  // del dinero quedaba con «no concilie» sobre datos correctos. Peor todavía: la
  // lectura vieja apagaba el indicador de carga mientras la nueva seguía en
  // vuelo, y la fila caía en «Sin cobros en este periodo» — justo el texto
  // engañoso que D-08 vino a eliminar.
  const detalleSeqRef = useRef(0);
  const detalleVigenteRef = useRef<Record<string, number>>({});

  // Candado síncrono: el estado visual tarda un render en deshabilitar el botón;
  // cerrar la caja dos veces por un doble toque es justo lo que esto evita.
  const runningRef = useRef(false);
  const bannersRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [e, cs] = await Promise.all([obtenerEstadoCaja(), listCortes()]);
      setEstado(e);
      setCortes(cs);
      // El corte cambió la pertenencia de los cobros: se limpia el detalle
      // cacheado para que vuelva a cargarse con los datos frescos.
      // ...y se invalidan las lecturas en vuelo: la que empezó antes del corte
      // traería cobros que ya quedaron sellados en él.
      detalleVigenteRef.current = {};
      setPagosPorCorte({});
      setErrorDet({});
      setExpandido(null);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "No se pudo cargar la caja.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  // Lee los cobros de una fila. Se usa al expandirla la primera vez y al
  // reintentar después de un fallo de lectura.
  async function cargarDetalle(clave: string, corteId: string | null) {
    const folio = ++detalleSeqRef.current;
    detalleVigenteRef.current[clave] = folio;
    const vigente = () => detalleVigenteRef.current[clave] === folio;
    setCargandoDet(clave);
    setErrorDet((prev) => ({ ...prev, [clave]: null }));
    try {
      const ps = await listPagosDeCorte(corteId);
      if (!vigente()) return;
      // Se limpia también el error: si quedó uno de una lectura anterior de esta
      // misma fila, taparía con «no concilie» una lista que sí cargó bien.
      setErrorDet((prev) => ({ ...prev, [clave]: null }));
      setPagosPorCorte((prev) => ({ ...prev, [clave]: ps }));
    } catch (err) {
      if (!vigente()) return;
      // NO se guarda una lista vacía: sería idéntica a un periodo sin cobros y
      // esta es la pantalla del dinero. Se marca el fallo por fila y, como en
      // pagosPorCorte no queda nada, reabrir la fila también vuelve a leer.
      setErrorDet((prev) => ({
        ...prev,
        [clave]: err instanceof Error ? err.message : "No se pudo leer el detalle de cobros.",
      }));
    } finally {
      // Solo se apaga el indicador si sigue siendo esta fila Y esta lectura: si
      // el usuario ya abrió otra, o hay una relectura más nueva en vuelo,
      // apagarlo aquí pintaría la fila como vacía mientras todavía carga.
      if (vigente()) setCargandoDet((actual) => (actual === clave ? null : actual));
    }
  }

  // Abre o cierra el detalle de una fila (un corte, o la caja actual). Carga sus
  // cobros la primera vez que se expande.
  function toggleDetalle(clave: string, corteId: string | null) {
    if (expandido === clave) { setExpandido(null); return; }
    setExpandido(clave);
    if (pagosPorCorte[clave]) return;
    cargarDetalle(clave, corteId);
  }

  async function run(fn: () => Promise<ResultadoCorte>, ok: (r: ResultadoCorte) => string) {
    if (runningRef.current) return;
    runningRef.current = true;
    setBusy(true); setError(null); setFeedback(null);
    try {
      const r = await fn();
      await refresh();
      setContado(""); setObservaciones("");
      setFeedback(ok(r));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar el corte.");
    } finally {
      runningRef.current = false;
      setBusy(false);
      scrollAlAviso(bannersRef.current);
    }
  }

  const totalEnCaja = estado?.totalEnCaja ?? 0;
  const pagosEnCaja = estado?.pagosEnCaja ?? 0;
  const dias = estado?.diasDeCobro ?? 0;

  const contadoNum = Number(contado.replace(",", "."));
  const contadoValido = contado !== "" && Number.isFinite(contadoNum) && contadoNum >= 0;
  const diferencia = contadoValido ? Number((contadoNum - totalEnCaja).toFixed(2)) : 0;
  const hayPagos = pagosEnCaja > 0;
  const multidia = dias > 1;
  // El servidor exige explicación si el efectivo no cuadra o si el corte mezcla
  // varios días; la UI lo refleja para no dejar mandar algo que la BD rechazará.
  const requiereObs = contadoValido && (diferencia !== 0 || multidia);
  const obsValida = !requiereObs || observaciones.trim().length > 0;
  const puedeCortar = hayPagos && contadoValido && obsValida && !busy;

  function confirmarCorte() {
    const signo = diferencia === 0
      ? "el efectivo cuadra exacto"
      : diferencia > 0
        ? `SOBRANTE de ${dinero.format(diferencia)}`
        : `FALTANTE de ${dinero.format(Math.abs(diferencia))}`;
    setConfirm({
      title: "Cerrar corte de caja",
      danger: true,
      confirmLabel: "Cerrar corte",
      message: `Se cerrará el corte de ${pagosEnCaja} cobro(s) por ${dinero.format(totalEnCaja)}. Usted contó ${dinero.format(contadoNum)}: ${signo}. La caja quedará en cero y este corte NO se podrá modificar después. ¿Continuar?`,
      action: () => cortarCaja(contadoNum, nombreSesion, observaciones.trim()),
      ok: (r) => `Corte ${r.folioCorte} cerrado · ${dinero.format(r.totalEsperado)} en ${r.pagosCortados} cobro(s)${r.diferencia !== 0 ? ` · diferencia ${dinero.format(r.diferencia)}` : " · cuadró exacto"}.`,
    });
  }

  const banners = (
    <div className="ti-banners" aria-live="polite" ref={bannersRef}>
      {feedback && <p className="catalog-feedback catalog-feedback--ok">{feedback}</p>}
      {error && <p className="submit-error">{error}</p>}
    </div>
  );

  if (loading && estado === null) return <Loader label="Cargando la caja…" />;

  if (loadError && estado === null) {
    return (
      <p className="submit-error" role="alert">
        {loadError}{" "}
        <button type="button" className="link-action" onClick={() => refresh()}>Reintentar</button>
      </p>
    );
  }

  return (
    <>
      <div className="metric-cards">
        <div className={`metric-card metric-card--${semDias(dias)}`}>
          <span className="metric-label">En caja ahora</span>
          <span className="metric-value">{dinero.format(totalEnCaja)}</span>
          <span className="metric-label" style={{ fontWeight: 600 }}>
            {pagosEnCaja} cobro(s){dias > 1 ? ` · ${dias} días sin cortar` : ""}
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Vendido este mes</span>
          <span className="metric-value">{dinero.format(estado?.vendidoMes ?? 0)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Vendido histórico</span>
          <span className="metric-value">{dinero.format(estado?.vendidoHistorico ?? 0)}</span>
        </div>
      </div>

      {banners}

      <div className="panel">
        <p className="panel-title">Caja actual</p>
        {loadError && (
          <p className="submit-error" role="alert">
            {loadError}{" "}
            <button type="button" className="link-action" onClick={() => refresh()}>Reintentar</button>
          </p>
        )}

        {!hayPagos ? (
          <p className="ti-empty">✓ La caja está en ceros. No hay cobros pendientes de cortar.</p>
        ) : (
          <>
            {(estado?.desglosePorDia.length ?? 0) > 1 && (
              <div className="table-wrap" style={{ marginBottom: 14 }}>
                <table className="admin-table">
                  <thead><tr><th>Día de cobro</th><th>Cobros</th><th>Subtotal</th></tr></thead>
                  <tbody>
                    {estado?.desglosePorDia.map((d) => (
                      <tr key={d.dia}>
                        <td>{diaCorto(d.dia)}</td>
                        <td>{d.cantidad}</td>
                        <td>{dinero.format(d.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {multidia && (
              <p className="ti-hint">
                Esta caja mezcla cobros de {dias} días. Cuente solo el efectivo que aún tiene físicamente
                y explique en observaciones si ya entregó dinero de días anteriores.
              </p>
            )}

            <p style={{ margin: "0 0 12px" }}>
              <button type="button" className="link-action" onClick={() => toggleDetalle(CLAVE_CAJA, null)}>
                {expandido === CLAVE_CAJA ? "▾ Ocultar" : "▸ Ver"} los {pagosEnCaja} cobro(s) en caja
              </button>
            </p>
            {expandido === CLAVE_CAJA && (
              <div style={{ marginBottom: 14 }}>
                <DetalleCobros cargando={cargandoDet === CLAVE_CAJA} error={errorDet[CLAVE_CAJA] ?? null}
                  lista={pagosPorCorte[CLAVE_CAJA] ?? []} onReintentar={() => cargarDetalle(CLAVE_CAJA, null)} />
              </div>
            )}

            <div className="ti-form">
              <div className="field">
                <span>Efectivo contado</span>
                <input className={`input ${contado !== "" && !contadoValido ? "invalid" : ""}`} inputMode="decimal"
                  value={contado} onChange={(e) => setContado(e.target.value)}
                  aria-label="Efectivo contado" placeholder="0.00" />
                {contado !== "" && !contadoValido && <p className="field-error">Capture un monto mayor o igual a cero.</p>}
              </div>

              {contadoValido && (
                <p className={`notice ${diferencia === 0 ? "" : "submit-error"}`} style={{ margin: "0 0 12px" }}>
                  <strong>Esperado:</strong> {dinero.format(totalEnCaja)} ·{" "}
                  <strong>Diferencia:</strong>{" "}
                  {diferencia === 0
                    ? "cuadra exacto"
                    : diferencia > 0
                      ? `sobrante ${dinero.format(diferencia)}`
                      : `faltante ${dinero.format(Math.abs(diferencia))}`}
                </p>
              )}

              <div className="field">
                <span>Observaciones{requiereObs ? " (obligatorias)" : " (opcional)"}</span>
                <textarea className={`input ${requiereObs && !obsValida ? "invalid" : ""}`} rows={2}
                  value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
                  placeholder={requiereObs ? "Explique la diferencia o el efectivo ya entregado…" : "Notas del corte (opcional)"} />
                {requiereObs && !obsValida && (
                  <p className="field-error">
                    {diferencia !== 0
                      ? "El efectivo no cuadra: explique la diferencia antes de cerrar."
                      : "El corte abarca varios días: explíquelo antes de cerrar."}
                  </p>
                )}
              </div>

              <p className="ti-hint">Este corte quedará registrado a su nombre: <strong>{nombreSesion}</strong>.</p>

              <button type="button" className="primary-action btn-danger" disabled={!puedeCortar}
                onClick={confirmarCorte}>
                {contadoValido ? `Cerrar corte de ${dinero.format(totalEnCaja)}` : "Cerrar corte de caja"}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <p className="panel-title">Historial de cortes ({cortes.length})</p>
        {cortes.length === 0 ? (
          <p className="ti-hint">Aún no se ha hecho ningún corte de caja.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Folio</th><th>Fecha</th><th>Esperado</th><th>Contado</th>
                  <th>Diferencia</th><th>Cobros</th><th>Por</th><th>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {cortes.map((c) => (
                  <Fragment key={c.id}>
                    <tr className={`selectable ${expandido === c.id ? "is-selected" : ""}`}
                      onClick={() => toggleDetalle(c.id, c.id)}>
                      <td>{expandido === c.id ? "▾" : "▸"} {c.folioCorte}</td>
                      <td>{fechaHora(c.createdAt)}</td>
                      <td>{dinero.format(c.totalEsperado)}</td>
                      <td>{dinero.format(c.efectivoContado)}</td>
                      <td>
                        {c.diferencia === 0
                          ? "—"
                          : c.diferencia > 0
                            ? `+${dinero.format(c.diferencia)}`
                            : `−${dinero.format(Math.abs(c.diferencia))}`}
                      </td>
                      <td>{c.cantidadPagos}</td>
                      <td>{c.cortadoPor}</td>
                      <td>{c.observaciones ?? "—"}</td>
                    </tr>
                    {expandido === c.id && (
                      <tr>
                        <td colSpan={8} style={{ background: "#f7f9fc" }}>
                          <DetalleCobros cargando={cargandoDet === c.id} error={errorDet[c.id] ?? null}
                            lista={pagosPorCorte[c.id] ?? []} onReintentar={() => cargarDetalle(c.id, c.id)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={() => { const c = confirm; setConfirm(null); run(c.action, c.ok); }}
        />
      )}
    </>
  );
}
