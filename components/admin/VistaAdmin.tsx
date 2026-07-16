"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Registro } from "@/lib/mock/types";
import {
  listRegistros,
  registrarPago,
  type AccionResultado,
} from "@/lib/supabase/apiPanel";
import Loader from "@/components/Loader";
import ConfirmDialog from "@/components/ConfirmDialog";
import { DetalleRegistro, TarjetaRegistro, scrollAlAviso } from "@/components/admin/RegistroCard";

type Modo = "inicio" | "pago";

type PagoCapturado = {
  monto: number;
  cobradoPor: string;
};

type ConfirmCfg = {
  title: string;
  message: string;
  confirmLabel: string;
  action: () => Promise<AccionResultado>;
  ok: (resultado: AccionResultado) => string;
};

const sem = (n: number) => (n === 0 ? "ok" : n <= 4 ? "warn" : "alert");
const dinero = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const porCobrar = (r: Registro) => r.estado === "pendiente" && r.pagos.length === 0;

// Orden del padrón en Admin: primero lo que Admin debe cobrar; luego lo que
// sigue en proceso (pagado esperando que TI instale, o con solicitud abierta);
// al final lo que ya no requiere movimiento (activo al día o dado de baja).
const grupoAdmin = (r: Registro): number => {
  if (porCobrar(r)) return 0;
  if (r.estado === "baja") return 2;
  const solAbiertas = r.solicitudes.some((s) => !s.atendida);
  if (r.estado === "pendiente" || r.estado === "bloqueado" || solAbiertas) return 1;
  return 2;
};

// Pantalla de Administracion alineada con la experiencia de TI: una cola de
// trabajo enfocada y, debajo, el padron completo en tarjetas tactiles.
export default function VistaAdmin({ nombreSesion }: { nombreSesion: string }) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useState<Modo>("inicio");
  const [query, setQuery] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmCfg | null>(null);
  const [cobradoPor, setCobradoPor] = useState(nombreSesion);
  // El estado visual tarda un render en deshabilitar botones. Este candado
  // sincrono evita dos RPCs si se toca dos veces la confirmacion muy rapido.
  const runningRef = useRef(false);
  const bannersRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    setLoading(true);
    try {
      const list = await listRegistros();
      setRegistros(list);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudieron cargar los registros.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const pendientesPago = useMemo(() => registros.filter(porCobrar), [registros]);
  const q = query.trim().toLowerCase();
  const padron = useMemo(() => {
    const base = !q ? registros : registros.filter((r) =>
      [r.usuarioNombre, r.gestionanteNombre ?? "", r.placas ?? "", r.noDispositivo ?? "", r.folio, r.marca, r.modelo]
        .join(" ").toLowerCase().includes(q));
    // sort() es estable: dentro de cada grupo se conserva el orden que ya trae
    // listRegistros (nuevos primero).
    return [...base].sort((a, b) => grupoAdmin(a) - grupoAdmin(b));
  }, [q, registros]);

  async function run(fn: () => Promise<AccionResultado>, ok: (resultado: AccionResultado) => string) {
    if (runningRef.current) return;
    runningRef.current = true;
    setBusy(true); setError(null); setFeedback(null);
    try {
      const resultado = await fn();
      await refresh();
      setSelId(null);
      setFeedback(ok(resultado));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el pago.");
    } finally {
      runningRef.current = false;
      setBusy(false);
      // Éxito o error, el aviso queda a la vista (ver scrollAlAviso).
      scrollAlAviso(bannersRef.current);
    }
  }

  function irA(m: Modo) {
    setModo(m); setSelId(null); setQuery("");
    setFeedback(null); setError(null);
  }

  function toggleSel(id: string) {
    setSelId((actual) => actual === id ? null : id);
    setError(null);
  }

  function confirmarPago(r: Registro, pago: PagoCapturado) {
    setConfirm({
      title: "Registrar pago",
      message: `Se registrará un pago en efectivo de ${dinero.format(pago.monto)} para ${r.folio}, ${r.usuarioNombre} (${r.placas ?? "sin placas"}). El sistema generará el folio del recibo. Cobrado por ${pago.cobradoPor}. ¿Continuar?`,
      confirmLabel: "Registrar pago",
      action: () => registrarPago(r.id, pago),
      ok: (resultado) => `Pago de ${dinero.format(pago.monto)} registrado · recibo ${resultado.folioRecibo ?? "generado"} (${r.folio}).`,
    });
  }

  const banners = (
    <div className="ti-banners" aria-live="polite" ref={bannersRef}>
      {feedback && <p className="catalog-feedback catalog-feedback--ok">{feedback}</p>}
      {error && <p className="submit-error">{error}</p>}
      {loadError && (
        <p className="submit-error" role="alert">
          {loadError}{" "}
          <button type="button" className="link-action" onClick={() => refresh()}>Reintentar</button>
        </p>
      )}
    </div>
  );

  if (loading && registros.length === 0) return <Loader label="Cargando registros…" />;

  if (loadError && registros.length === 0) {
    return (
      <div className="ti-banners">
        <p className="submit-error" role="alert">
          {loadError}{" "}
          <button type="button" className="link-action" onClick={() => refresh()}>Reintentar</button>
        </p>
      </div>
    );
  }

  return (
    <>
      {modo === "inicio" ? (
        <>
          <div className="ti-actions admin-actions">
            <button type="button" className="ti-action" onClick={() => irA("pago")}>
              <span>
                <span className="ti-action__title">Registrar pago</span>
                <span className="ti-action__sub">Solicitudes nuevas pendientes de cobro</span>
              </span>
              <span className={`ti-action__count ti-action__count--${sem(pendientesPago.length)}`}>{pendientesPago.length}</span>
            </button>
          </div>

          <div className="panel">
            <p className="panel-title">Padrón completo ({padron.length})</p>
            <input className="input search" type="search" placeholder="Buscar por nombre, placa, No. de TAG o folio…"
              value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 12 }} />
            {banners}
            <div className="ti-cards">
              {padron.map((r) => (
                <TarjetaRegistro key={r.id} r={r} abierto={selId === r.id} onToggle={() => toggleSel(r.id)} chip={<ChipCobro r={r} />}>
                  <DetalleRegistro r={r} />
                  <HistorialPagos r={r} />
                  {porCobrar(r) ? (
                    <FormPago r={r} busy={busy} cobradoPor={cobradoPor} onCobradoPor={setCobradoPor}
                      onSubmit={(pago) => confirmarPago(r, pago)} />
                  ) : (
                    <EstadoPago r={r} />
                  )}
                </TarjetaRegistro>
              ))}
              {padron.length === 0 && (
                <p className="ti-hint">{q ? `Sin resultados para «${query}».` : "Aún no hay registros en el padrón."}</p>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="ti-topbar">
            <button type="button" className="ti-back" onClick={() => irA("inicio")}>← Inicio</button>
            <h2>Registrar pago</h2>
          </div>
          {banners}
          {pendientesPago.length === 0 ? (
            <p className="ti-empty">✓ No hay pagos pendientes. Todo al día.</p>
          ) : (
            <div className="ti-cards">
              {pendientesPago.map((r) => (
                <TarjetaRegistro key={r.id} r={r} abierto={selId === r.id} onToggle={() => toggleSel(r.id)} chip={<ChipCobro r={r} />}>
                  <DetalleRegistro r={r} />
                  <FormPago r={r} busy={busy} cobradoPor={cobradoPor} onCobradoPor={setCobradoPor}
                    onSubmit={(pago) => confirmarPago(r, pago)} />
                </TarjetaRegistro>
              ))}
            </div>
          )}
        </>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onCancel={() => setConfirm(null)}
          onConfirm={() => { const c = confirm; setConfirm(null); run(c.action, c.ok); }}
        />
      )}
    </>
  );
}

// Chip de cobro para Admin: la señal es el pago, no el ciclo de vida. Un
// registro pagado pero sin instalar sigue 'pendiente' en la base (lo instala
// TI), pero para Admin ya está "Pagado". Reusa las clases de status-chip
// (ámbar/verde/gris) sin estilos nuevos.
function ChipCobro({ r }: { r: Registro }) {
  if (r.estado === "baja") return <span className="status-chip status-chip--baja">Baja</span>;
  if (r.pagos.length === 0) return <span className="status-chip status-chip--pendiente">Por cobrar</span>;
  return <span className="status-chip status-chip--activo">Pagado</span>;
}

function FormPago({ r, busy, cobradoPor, onCobradoPor, onSubmit }: {
  r: Registro;
  busy: boolean;
  cobradoPor: string;
  onCobradoPor: (v: string) => void;
  onSubmit: (pago: PagoCapturado) => void;
}) {
  const [monto, setMonto] = useState("100");
  const montoNumero = Number(monto.replace(",", "."));
  const montoValido = Number.isFinite(montoNumero) && montoNumero > 0;
  const nombreValido = cobradoPor.trim().length > 0;

  return (
    <div className="ti-form admin-payment-form">
      <p className="ti-hint">El estacionamiento y el TAG los asigna TI después de confirmar este pago.</p>
      <div className="field">
        <span>Monto en efectivo</span>
        <input className={`input ${monto !== "" && !montoValido ? "invalid" : ""}`} inputMode="decimal"
          value={monto} onChange={(e) => setMonto(e.target.value)} aria-label={`Monto para ${r.folio}`} />
        {monto !== "" && !montoValido && <p className="field-error">Captura un monto mayor a cero.</p>}
      </div>
      <p className="notice admin-auto-receipt"><strong>Folio de recibo:</strong> se generará automáticamente al confirmar.</p>
      <div className="field">
        <span>Cobrado por</span>
        <input className={`input ${!nombreValido ? "invalid" : ""}`} value={cobradoPor}
          onChange={(e) => onCobradoPor(e.target.value)} placeholder="Nombre del cajero" />
        {!nombreValido && <p className="field-error">Indica quién recibió el pago.</p>}
      </div>
      <button type="button" className="primary-action" disabled={busy || !montoValido || !nombreValido}
        onClick={() => onSubmit({ monto: montoNumero, cobradoPor: cobradoPor.trim() })}>
        {montoValido ? `Registrar pago de ${dinero.format(montoNumero)}` : "Registrar pago"}
      </button>
    </div>
  );
}

function HistorialPagos({ r }: { r: Registro }) {
  if (r.pagos.length === 0) return null;
  return (
    <div className="admin-payment-history">
      <p className="ti-section-title">Pagos registrados</p>
      {r.pagos.map((pago, i) => (
        <div className="admin-payment-row" key={`${pago.fecha ?? "sin-fecha"}-${pago.folio ?? i}`}>
          <strong>{dinero.format(pago.monto)}</strong>
          <span>{pago.fecha ?? "Fecha no disponible"} · {pago.cobradoPor ?? "Sin responsable"}{pago.folio ? ` · ${pago.folio}` : ""}</span>
        </div>
      ))}
    </div>
  );
}

function EstadoPago({ r }: { r: Registro }) {
  if (r.pagos.length > 0) {
    return <p className="ti-hint admin-paid-hint">✓ Pago registrado. El expediente ya no está en la cola de cobro.</p>;
  }
  if (r.estado === "baja") {
    return <p className="ti-hint">Registro dado de baja; no admite cobro desde esta pantalla.</p>;
  }
  if (r.estado === "bloqueado") {
    return <p className="ti-hint">Registro bloqueado; debe resolverse el bloqueo antes de continuar.</p>;
  }
  return null;
}
