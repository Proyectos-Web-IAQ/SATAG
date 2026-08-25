"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Registro, TipoUsuario } from "@/lib/mock/types";
import {
  listRegistros,
  registrarPago,
  type AccionResultado,
} from "@/lib/supabase/apiPanel";
import Loader from "@/components/Loader";
import ConfirmDialog from "@/components/ConfirmDialog";
import EvidenciaFirmaPanel from "@/components/admin/EvidenciaFirma";
import {
  DetalleRegistro, TarjetaRegistro, scrollAlAviso,
  TIPOS_USUARIO, TIPO_USUARIO_LABEL,
} from "@/components/admin/RegistroCard";

type Modo = "inicio" | "pago";

type PagoCapturado = {
  monto: number;
  cobradoPor: string;
  // CC-05: el tipo que Administración CONFIRMA con la persona enfrente. Puede
  // no ser el que el titular declaró en el alta; si difiere, el RPC corrige el
  // expediente y lo anota en la bitácora.
  tipoUsuario: TipoUsuario;
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

const PAGINA = 25;
type FiltroAdmin = "todos" | "por-cobrar" | "pagado" | "baja";
const FILTROS_ADMIN: [FiltroAdmin, string][] = [
  ["todos", "Todos"], ["por-cobrar", "Por cobrar"], ["pagado", "Pagados"], ["baja", "Baja"],
];

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
  // Padrón real: se pagina y se filtra. Con el banco de QA (59) la página ya
  // medía 8 820 px; con 300 familias sería scroll infinito para la cajera.
  const [filtro, setFiltro] = useState<FiltroAdmin>("todos");
  const [mostrar, setMostrar] = useState(PAGINA);
  const [selId, setSelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmCfg | null>(null);
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

  // Por urgencia: el que lleva mas tiempo esperando su cobro (desde el alta)
  // primero, igual que las colas de TI.
  const pendientesPago = useMemo(
    () => registros.filter(porCobrar).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [registros]);
  const q = query.trim().toLowerCase();
  const padron = useMemo(() => {
    const base = !q ? registros : registros.filter((r) =>
      [r.usuarioNombre, r.gestionanteNombre ?? "", r.placas ?? "", r.noDispositivo ?? "", r.folio, r.marca, r.modelo]
        .join(" ").toLowerCase().includes(q));
    // sort() es estable: dentro de cada grupo se conserva el orden que ya trae
    // listRegistros (nuevos primero).
    const conFiltro = base.filter((r) =>
      filtro === "todos" ? true
      : filtro === "por-cobrar" ? porCobrar(r)
      : filtro === "pagado" ? r.estado !== "baja" && r.pagos.length > 0
      : r.estado === "baja");
    return [...conFiltro].sort((a, b) => grupoAdmin(a) - grupoAdmin(b));
  }, [q, registros, filtro]);

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
    setModo(m); setSelId(null); setQuery(""); setMostrar(PAGINA);
    setFeedback(null); setError(null);
  }

  function toggleSel(id: string) {
    setSelId((actual) => actual === id ? null : id);
    setError(null);
  }

  function confirmarPago(r: Registro, pago: PagoCapturado) {
    // El cambio de tipo se dice ANTES de cobrar: el pago no se puede deshacer y
    // la corrección queda en la bitácora del expediente.
    const corrige = pago.tipoUsuario !== r.tipoUsuario;
    setConfirm({
      title: "Registrar pago",
      message: `Se registrará un pago en efectivo de ${dinero.format(pago.monto)} para ${r.folio}, ${r.usuarioNombre} (${r.placas ?? "sin placas"}). El sistema generará el folio del recibo. Cobrado por ${pago.cobradoPor}.`
        + (corrige
          ? ` El tipo de usuario quedará corregido de ${TIPO_USUARIO_LABEL[r.tipoUsuario]} a ${TIPO_USUARIO_LABEL[pago.tipoUsuario]}, y el cambio se anotará en la bitácora.`
          : ` Queda validado como ${TIPO_USUARIO_LABEL[pago.tipoUsuario]}.`)
        + " ¿Continuar?",
      confirmLabel: "Registrar pago",
      action: () => registrarPago(r.id, pago),
      ok: (resultado) => `Pago de ${dinero.format(pago.monto)} registrado · recibo ${resultado.folioRecibo ?? "generado"} (${r.folio}).`
        + (resultado.tipoCorregido && resultado.tipoAnterior
          ? ` Tipo de usuario corregido: ${TIPO_USUARIO_LABEL[resultado.tipoAnterior]} → ${TIPO_USUARIO_LABEL[pago.tipoUsuario]}.`
          : ` Tipo de usuario validado: ${TIPO_USUARIO_LABEL[pago.tipoUsuario]}.`),
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
              value={query} onChange={(e) => { setQuery(e.target.value); setMostrar(PAGINA); }} style={{ marginBottom: 10 }} />
            <div className="chip-row" style={{ marginBottom: 12 }}>
              {FILTROS_ADMIN.map(([k, label]) => (
                <button key={k} type="button" className={`select-chip ${filtro === k ? "on" : ""}`}
                  onClick={() => { setFiltro(k); setMostrar(PAGINA); }}>{label}</button>
              ))}
            </div>
            {banners}
            <div className="ti-cards">
              {padron.slice(0, mostrar).map((r) => (
                <TarjetaRegistro key={r.id} r={r} abierto={selId === r.id} onToggle={() => toggleSel(r.id)} chip={<ChipCobro r={r} />}
                  espera={porCobrar(r) ? r.createdAt.slice(0, 10) : undefined}>
                  <DetalleRegistro r={r} />
                  <HistorialPagos r={r} />
                  {porCobrar(r) ? (
                    <FormPago r={r} busy={busy} cobradoPor={nombreSesion}
                      onSubmit={(pago) => confirmarPago(r, pago)} />
                  ) : (
                    <EstadoPago r={r} />
                  )}
                  {/* SC-008: la evidencia va al final y bajo demanda. Aquí sirve
                      para cotejar quién firmó al confirmar el tipo de usuario. */}
                  <EvidenciaFirmaPanel registroId={r.id} />
                </TarjetaRegistro>
              ))}
              {padron.length === 0 && (
                <p className="ti-hint">{q || filtro !== "todos" ? "Sin resultados con esa búsqueda o filtro." : "Aún no hay registros en el padrón."}</p>
              )}
              {padron.length > mostrar && (
                <button type="button" className="ghost-action" style={{ alignSelf: "center" }}
                  onClick={() => setMostrar((m) => m + PAGINA)}>
                  Mostrar {Math.min(PAGINA, padron.length - mostrar)} más (quedan {padron.length - mostrar})
                </button>
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
                <TarjetaRegistro key={r.id} r={r} abierto={selId === r.id} onToggle={() => toggleSel(r.id)} chip={<ChipCobro r={r} />}
                  espera={r.createdAt.slice(0, 10)}>
                  <DetalleRegistro r={r} />
                  <FormPago r={r} busy={busy} cobradoPor={nombreSesion}
                    onSubmit={(pago) => confirmarPago(r, pago)} />
                  <EvidenciaFirmaPanel registroId={r.id} />
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

function FormPago({ r, busy, cobradoPor, onSubmit }: {
  r: Registro;
  busy: boolean;
  cobradoPor: string;
  onSubmit: (pago: PagoCapturado) => void;
}) {
  // Precio del TAG confirmado en minuta (24-ago-2026, junta con Gerencia
  // Administrativa): $100 fijo, en efectivo. No es capturable: un campo
  // editable en caja invita al error de dedo. Si el precio cambia, se
  // actualiza AQUI, en un solo lugar.
  const PRECIO_TAG = 100;
  // CC-05: arranca en lo que el titular declaró en el alta. Casi siempre es
  // correcto; lo que importa es que alguien lo confirme mirándolo.
  const [tipo, setTipo] = useState<TipoUsuario>(r.tipoUsuario);
  const montoNumero = PRECIO_TAG;
  // Un menor de edad se registra como alumno y firma su gestionante (CC-11).
  // Cambiarle el tipo aquí dejaría el expediente contradiciendo su evidencia de
  // firma, así que el RPC lo rechaza; la pantalla ni siquiera lo ofrece.
  const tipoFijo = r.usuarioEsMenor;
  const tipoEfectivo: TipoUsuario = tipoFijo ? "alumno" : tipo;
  const corrige = tipoEfectivo !== r.tipoUsuario;

  return (
    <div className="ti-form admin-payment-form">
      <p className="ti-hint">El estacionamiento y el TAG los asigna TI después de confirmar este pago.</p>
      <div className="field">
        <span>Monto en efectivo</span>
        <p className="monto-fijo" aria-label={`Monto para ${r.folio}`}>
          {dinero.format(PRECIO_TAG)} <span className="monto-fijo__nota">precio único del TAG</span>
        </p>
      </div>
      <div className="field">
        <span>Confirme el tipo de usuario</span>
        <p className="ti-hint" style={{ margin: "0 0 6px" }}>
          {tipoFijo
            ? "El titular es menor de edad: su tipo queda fijo en alumno y firma su padre, madre o tutor."
            : <>En el alta se declaró como <strong>{TIPO_USUARIO_LABEL[r.tipoUsuario]}</strong>. Confírmelo con la persona presente; si no corresponde, elija el correcto.</>}
        </p>
        <div className="chip-row">
          {TIPOS_USUARIO.map((t) => (
            <button key={t} type="button" disabled={tipoFijo && t !== "alumno"}
              className={`select-chip ${tipoEfectivo === t ? "on" : ""}`}
              onClick={() => setTipo(t)}>{TIPO_USUARIO_LABEL[t]}</button>
          ))}
        </div>
        {corrige && (
          <p className="ti-hint" style={{ marginTop: 6 }}>
            Se corregirá de {TIPO_USUARIO_LABEL[r.tipoUsuario]} a {TIPO_USUARIO_LABEL[tipoEfectivo]}; el
            cambio queda en la bitácora del expediente.
          </p>
        )}
      </div>
      <p className="notice admin-auto-receipt"><strong>Folio de recibo:</strong> se generará automáticamente al confirmar.</p>
      <div className="field">
        <span>Cobrado por</span>
        {/* Identidad de la sesion, no texto libre: quien cobra es quien esta
            firmado en el panel, igual que en el corte de caja. El RPC ademas
            la sella desde el JWT (bloque 50). */}
        <p className="monto-fijo">{cobradoPor} <span className="monto-fijo__nota">usuario de esta sesión</span></p>
      </div>
      <button type="button" className="primary-action" disabled={busy}
        onClick={() => onSubmit({ monto: montoNumero, cobradoPor: cobradoPor.trim(), tipoUsuario: tipoEfectivo })}>
        {`Registrar pago de ${dinero.format(montoNumero)}`}
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
