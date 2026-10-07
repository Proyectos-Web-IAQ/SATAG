"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Registro, TipoUsuario } from "@/lib/mock/types";
import type { RolPanel } from "@/lib/supabase/auth";
import {
  devolverPago,
  listRegistros,
  registrarPago,
  validarPermisoMenor,
  type AccionResultado,
} from "@/lib/supabase/apiPanel";
import PermisoMenor from "@/components/admin/PermisoMenor";
import Loader from "@/components/Loader";
import ConfirmDialog from "@/components/ConfirmDialog";
import EvidenciaFirmaPanel from "@/components/admin/EvidenciaFirma";
import {
  DetalleRegistro, TarjetaRegistro, scrollAlAviso,
  TIPOS_USUARIO, TIPOS_CON_FAMILIA,
} from "@/components/admin/RegistroCard";
import { enFrase, ROTULO, TIPO_PERSONA } from "@/lib/glosario";

type Modo = "inicio" | "pago";

type PagoCapturado = {
  monto: number;
  cobradoPor: string;
  // CC-05: el tipo que Administración CONFIRMA con la persona enfrente. Puede
  // no ser el que el titular declaró en el alta; si difiere, el RPC corrige el
  // expediente y lo anota en la bitácora.
  tipoUsuario: TipoUsuario;
  // Parentesco con la familia, confirmado igual que el tipo. Solo cuando el
  // tipo confirmado es 'otro'; null en los demás.
  parentescoOtro: string | null;
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

// Bloque 85: se devuelve un cobro VIGENTE mientras el TAG no este instalado. Es
// el unico filtro, y la base lo vuelve a comprobar: esto solo decide si el
// boton se ofrece.
const puedeDevolver = (r: Registro) => r.pagos.length > 0 && !r.noDispositivo && !r.fechaInstalacion && !r.instaladoEn;

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
export default function VistaAdmin({ nombreSesion, rol }: { nombreSesion: string; rol: RolPanel }) {
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
    // El cambio de tipo se dice ANTES de cobrar: la corrección queda en la
    // bitácora del expediente aunque el pago se devuelva después (bloque 85).
    const corrige = pago.tipoUsuario !== r.tipoUsuario;
    const parentescoAntes = r.parentescoOtro?.trim() || null;
    const parentesco = pago.parentescoOtro === null ? ""
      : parentescoAntes === null ? ` El parentesco con la familia quedará registrado como «${pago.parentescoOtro}».`
      : parentescoAntes !== pago.parentescoOtro ? ` El parentesco con la familia quedará corregido de «${parentescoAntes}» a «${pago.parentescoOtro}».`
      : ` Parentesco con la familia: «${pago.parentescoOtro}».`;
    setConfirm({
      title: "Registrar pago",
      message: `Se registrará un pago en efectivo de ${dinero.format(pago.monto)} para ${r.folio}, ${r.usuarioNombre} (${r.placas ?? enFrase(ROTULO.sinPlacas)}). El sistema generará el folio del recibo. Cobrado por ${pago.cobradoPor}.`
        + (corrige
          ? ` Quien conduce quedará corregido de ${TIPO_PERSONA[r.tipoUsuario]} a ${TIPO_PERSONA[pago.tipoUsuario]}, y el cambio se anotará en la bitácora.`
          : ` Queda validado como ${TIPO_PERSONA[pago.tipoUsuario]}.`)
        + parentesco
        + " ¿Continuar?",
      confirmLabel: "Registrar pago",
      action: () => registrarPago(r.id, pago),
      ok: (resultado) => `Pago de ${dinero.format(pago.monto)} registrado · recibo ${resultado.folioRecibo ?? "generado"} (${r.folio}).`
        + (resultado.tipoCorregido && resultado.tipoAnterior
          ? ` Quien conduce, corregido: ${TIPO_PERSONA[resultado.tipoAnterior]} → ${TIPO_PERSONA[pago.tipoUsuario]}.`
          : ` Quien conduce, validado: ${TIPO_PERSONA[pago.tipoUsuario]}.`),
    });
  }

  // Aceptar el permiso del menor. Pide confirmacion como el cobro: queda
  // sellado con quien y cuando, y no se puede deshacer desde el panel.
  function aceptarPermiso(r: Registro) {
    setConfirm({
      title: "Aceptar el permiso para conducir",
      message: `Usted declara haber visto el permiso para conducir de ${r.usuarioNombre} (${r.folio}) y que esta a su nombre y vigente. Quedara registrado a nombre de quien acepta, con la fecha y la hora. ¿Continuar?`,
      confirmLabel: "Aceptar el permiso",
      action: () => validarPermisoMenor(r.id, nombreSesion),
      ok: () => `Permiso aceptado para ${r.folio}. Ya se puede cobrar.`,
    });
  }

  // Bloque 85. Se confirma como el cobro: el dinero sale en ese momento y la
  // devolución no se deshace desde el panel.
  function confirmarDevolucion(r: Registro, motivo: string) {
    const pago = r.pagos[r.pagos.length - 1];
    // Un expediente dado de baja sigue en baja: solo sale el dinero.
    const enBaja = r.estado === "baja";
    setConfirm({
      title: "Devolver el pago",
      message: `Se registrará la devolución de ${dinero.format(pago.monto)} del recibo ${pago.folio ?? "sin folio"} de ${r.folio}, ${r.usuarioNombre}. `
        + "Usted entrega el efectivo en este momento y la salida aparecerá en el siguiente corte de caja. "
        + (enBaja
          ? "El expediente sigue dado de baja: solo se registra la salida del dinero. "
          : "El expediente vuelve a «Por cobrar» y TI deja de verlo en su cola. ")
        + `Motivo: «${motivo}». ¿Continuar?`,
      confirmLabel: "Devolver el pago",
      // Viaja el recibo que se confirmo: la base devuelve ESE cobro y ninguno otro.
      action: () => devolverPago(r.id, motivo, pago.folio),
      ok: (resultado) => `Pago devuelto · recibo ${resultado.folioRecibo ?? pago.folio ?? ""} (${r.folio}). `
        + (enBaja ? "El expediente sigue dado de baja." : "El expediente vuelve a «Por cobrar».")
        + (resultado.yaCortado ? " Ese cobro ya estaba en un corte cerrado: la devolución sale en el siguiente." : ""),
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
                    <>
                      <PermisoMenor r={r} busy={busy}
                        onAceptar={() => aceptarPermiso(r)} />
                      <FormPago r={r} busy={busy} cobradoPor={nombreSesion}
                        onSubmit={(pago) => confirmarPago(r, pago)} />
                    </>
                  ) : (
                    <>
                      <EstadoPago r={r} />
                      {puedeDevolver(r) && (
                        <FormDevolucion r={r} busy={busy} onSubmit={(motivo) => confirmarDevolucion(r, motivo)} />
                      )}
                    </>
                  )}
                  {/* SC-008: la evidencia va al final y bajo demanda. Aquí sirve
                      para cotejar quién firmó al confirmar el tipo de usuario. */}
                  <EvidenciaFirmaPanel registroId={r.id} rol={rol} />
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
                  <PermisoMenor r={r} busy={busy} onAceptar={() => aceptarPermiso(r)} />
                  <FormPago r={r} busy={busy} cobradoPor={nombreSesion}
                    onSubmit={(pago) => confirmarPago(r, pago)} />
                  <EvidenciaFirmaPanel registroId={r.id} rol={rol} />
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
  // UN EXPEDIENTE MIGRADO NO ESTA PENDIENTE DE COBRO: nunca hubo un cobro que
  // hacer. Venia del padron historico, donde el TAG se entrego y se firmo en papel,
  // y al migrarlo no se le invento un pago de cero para que «cuadrara». Sin esta
  // linea, los 2,837 expedientes migrados aparecen en ambar como trabajo pendiente
  // de Administracion y entierran los que de verdad hay que cobrar.
  if (r.origenExpediente !== "satag") {
    return (
      <span className="status-chip status-chip--baja" title="Viene del padrón histórico: no pasó por caja y no hay nada que cobrar.">
        Del padrón
      </span>
    );
  }
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
  // Arranca en lo que declaró el titular y no se borra al cambiar de chip: quien
  // toca 'otro' por error y regresa no pierde lo escrito. Solo viaja si el tipo
  // confirmado es 'otro'.
  const [parentesco, setParentesco] = useState(r.parentescoOtro ?? "");
  const pideParentesco = tipoEfectivo === "otro";
  const faltaParentesco = pideParentesco && !parentesco.trim();
  // El cotejo contra GES lo hace Administración al cobrar, no TI al instalar.
  // Va por el tipo confirmado en la caja: un maestro corregido aquí a padres
  // también se coteja, y casi siempre llega sin apellidos de familia.
  const cotejaGes = TIPOS_CON_FAMILIA.includes(tipoEfectivo);
  const apellidosFamilia = r.apellidosFamilia?.trim();

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
        <span>Confirme quién conduce el vehículo</span>
        <p className="ti-hint" style={{ margin: "0 0 6px" }}>
          {tipoFijo
            ? "El titular es menor de edad: su tipo queda fijo en alumno y firma su padre, madre o tutor."
            : <>En el alta se declaró como <strong>{TIPO_PERSONA[r.tipoUsuario]}</strong>. Confírmelo con la persona presente; si no corresponde, elija el correcto.</>}
        </p>
        <div className="chip-row">
          {TIPOS_USUARIO.map((t) => (
            <button key={t} type="button" disabled={tipoFijo && t !== "alumno"}
              className={`select-chip ${tipoEfectivo === t ? "on" : ""}`}
              onClick={() => setTipo(t)}>{TIPO_PERSONA[t]}</button>
          ))}
        </div>
        {corrige && (
          <p className="ti-hint" style={{ marginTop: 6 }}>
            Se corregirá de {TIPO_PERSONA[r.tipoUsuario]} a {TIPO_PERSONA[tipoEfectivo]}; el
            cambio queda en la bitácora del expediente.
          </p>
        )}
      </div>
      {pideParentesco && (
        <div className="field">
          <span>Parentesco con la familia</span>
          <p className="ti-hint" style={{ margin: 0 }}>
            {r.parentescoOtro?.trim()
              ? "Es el que se declaró en el alta. Confírmelo con la persona presente; si no corresponde, corríjalo."
              : "El expediente no lo trae. Pregúntelo a la persona presente y escríbalo con sus palabras."}
          </p>
          <input className={`input ${faltaParentesco ? "invalid" : ""}`} value={parentesco}
            onChange={(e) => setParentesco(e.target.value)} placeholder="Ej. tío del alumno" />
          {faltaParentesco && <p className="field-error">Escriba el parentesco con la familia.</p>}
        </div>
      )}
      <p className="notice admin-auto-receipt"><strong>Folio de recibo:</strong> se generará automáticamente al confirmar.</p>
      <div className="field">
        <span>Cobrado por</span>
        {/* Identidad de la sesion, no texto libre: quien cobra es quien esta
            firmado en el panel, igual que en el corte de caja. El RPC ademas
            la sella desde el JWT (bloque 50). */}
        <p className="monto-fijo">{cobradoPor} <span className="monto-fijo__nota">usuario de esta sesión</span></p>
      </div>
      {cotejaGes && (
        <p className="notice" style={{ margin: "0 0 16px", padding: "10px 12px" }}>
          {apellidosFamilia
            ? <>Antes de cobrar, confirme en GES que la familia <strong>{apellidosFamilia}</strong> tiene alumnos inscritos.</>
            : tipoEfectivo === "alumno"
              ? "Este expediente no trae los apellidos de la familia: busque al titular por su nombre en GES antes de cobrar."
              : "Este expediente no trae los apellidos de la familia: pregunte el nombre del alumno y búsquelo en GES antes de cobrar."}
        </p>
      )}
      <button type="button" className="primary-action" disabled={busy || faltaParentesco}
        onClick={() => onSubmit({
          monto: montoNumero, cobradoPor: cobradoPor.trim(), tipoUsuario: tipoEfectivo,
          parentescoOtro: pideParentesco ? parentesco.trim() : null,
        })}>
        {`Registrar pago de ${dinero.format(montoNumero)}`}
      </button>
    </div>
  );
}

function HistorialPagos({ r }: { r: Registro }) {
  if (r.pagos.length === 0 && r.devoluciones.length === 0) return null;
  return (
    <div className="admin-payment-history">
      <p className="ti-section-title">Pagos registrados</p>
      {r.pagos.map((pago, i) => (
        <div className="admin-payment-row" key={`${pago.fecha ?? "sin-fecha"}-${pago.folio ?? i}`}>
          <strong>{dinero.format(pago.monto)}</strong>
          <span>{pago.fecha ?? "Fecha no disponible"} · {pago.cobradoPor ?? "Sin responsable"}{pago.folio ? ` · ${pago.folio}` : ""}</span>
        </div>
      ))}
      {/* Bloque 85: el cobro devuelto no se borra. Se ve tachado, con quién lo
          devolvió, cuándo y por qué. */}
      {r.devoluciones.map((d, i) => (
        <div className="admin-payment-row admin-payment-row--devuelto" key={`dev-${d.folio ?? i}`}>
          <strong><s>{dinero.format(d.monto)}</s> devuelto</strong>
          <span>
            Recibo {d.folio ?? "sin folio"} · devuelto el {d.devueltoEn} por {d.devueltoPor ?? "sin responsable"}
            {d.motivo ? ` · «${d.motivo}»` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

// Bloque 85: Administración devuelve el cobro mientras el TAG no esté
// instalado. Va cerrado y debajo del estado del pago: es la excepción, no el
// flujo, y no debe competir con lo demás de la tarjeta.
function FormDevolucion({ r, busy, onSubmit }: {
  r: Registro;
  busy: boolean;
  onSubmit: (motivo: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const pago = r.pagos[r.pagos.length - 1];
  if (!abierto) {
    return (
      <button type="button" className="ghost-action" style={{ alignSelf: "flex-start" }} disabled={busy}
        onClick={() => setAbierto(true)}>
        Devolver el pago…
      </button>
    );
  }
  const limpio = motivo.trim();
  return (
    <div className="ti-form admin-payment-form">
      <p className="ti-section-title">Devolver el pago</p>
      <p className="ti-hint" style={{ margin: "0 0 12px" }}>
        Se devuelven {dinero.format(pago.monto)} del recibo {pago.folio ?? "sin folio"}. El cobro no se borra: queda en
        el historial marcado como devuelto, y la salida de dinero aparece en el siguiente corte de caja.
      </p>
      <div className="field">
        <span>Motivo de la devolución</span>
        <textarea className="input" rows={3} maxLength={500} value={motivo}
          placeholder="Ej. se cobró al expediente equivocado"
          onChange={(e) => setMotivo(e.target.value)} />
      </div>
      <div className="chip-row">
        <button type="button" className="primary-action" disabled={busy || !limpio} onClick={() => onSubmit(limpio)}>
          {`Devolver ${dinero.format(pago.monto)}`}
        </button>
        <button type="button" className="ghost-action" disabled={busy}
          onClick={() => { setAbierto(false); setMotivo(""); }}>
          Cancelar
        </button>
      </div>
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
