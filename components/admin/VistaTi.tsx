"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CambiosRegistro, ProcedenciaTag, Registro, Solicitud, TramiteSolicitado } from "@/lib/mock/types";
import { getMarcas, getColores } from "@/lib/supabase/api";
import {
  listRegistros,
  listNotasSinExpediente,
  getEstacionamientos,
  instalarTagConEstacionamiento,
  actualizarRegistroConEstacionamiento,
  darBaja,
  descartarSolicitud,
  vincularNota,
  usarTagApartado,
  type AccionResultado,
} from "@/lib/supabase/apiPanel";
import Loader from "@/components/Loader";
import ConfirmDialog from "@/components/ConfirmDialog";
import { DetalleRegistro, TarjetaRegistro, ROL_LABEL, TRAMITE_LABEL, BadgeEspera, scrollAlAviso } from "@/components/admin/RegistroCard";

type Modo = "inicio" | "instalar" | "actualizar" | "baja" | "notas";
type Accion = "instalar" | "actualizar" | "baja";

type ConfirmCfg = {
  title: string; message: string; confirmLabel: string; danger: boolean;
  action: () => Promise<AccionResultado>; ok: string;
  // Se ejecuta tras el refresh exitoso: p.ej. abrir el expediente recien vinculado.
  after?: () => void;
};

// Compara asignaciones de estacionamiento sin importar el orden de los chips.
const mismaAsignacion = (a: string[], b: string[]) =>
  [...a].sort().join("+") === [...b].sort().join("+");

const TAG_RE = /^[0-9]{6,11}$/;
// Tramites que TI puede corroborar al vincular una nota (mismo catalogo que el
// buzon): solo actualizacion o baja; instalar es del alta, no de una solicitud.
const TRAMITES_TI: TramiteSolicitado[] = ["actualizacion", "baja"];
// Semáforo de los contadores: verde (0), amarillo (pocos), rojo (muchos).
const sem = (n: number) => (n === 0 ? "ok" : n <= 4 ? "warn" : "alert");

// ¿El registro tiene una peticion pendiente de este tramite? Cuenta la solicitud
// de folio de ese tipo (actualizacion/baja) Y una nota vinculada (SC-003) cuyo
// tramite pedido coincide: asi una nota que pidio "dar de baja" hace que el
// registro entre a la cola de bajas, no solo al banner del expediente.
const pidePendiente = (r: Registro, tramite: "actualizacion" | "baja") =>
  r.solicitudes.some((s) => !s.atendida &&
    (s.tipo === tramite || (s.tipo === "nota" && s.tramiteSolicitado === tramite)));

// Fecha (YYYY-MM-DD) desde la que la familia espera atencion en una cola. Es la
// peticion pendiente MAS ANTIGUA del tramite (para ordenar por urgencia).
const fechaEsperaTramite = (r: Registro, tramite: "actualizacion" | "baja"): string => {
  const s = r.solicitudes
    .filter((x) => !x.atendida && (x.tipo === tramite || (x.tipo === "nota" && x.tramiteSolicitado === tramite)))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  return s?.fecha ?? r.createdAt.slice(0, 10);
};
// Para la cola "Instalar TAG": la familia espera desde que pago (ahi quedo lista
// la instalacion); si no hay pago, desde el alta.
const fechaEsperaInstalar = (r: Registro): string => {
  const pago = [...r.pagos].filter((p) => p.fecha).sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""))[0];
  return pago?.fecha ?? r.createdAt.slice(0, 10);
};
// Orden por urgencia: la peticion mas antigua primero (la familia que mas espera).
const porUrgencia = (fecha: (r: Registro) => string) =>
  (a: Registro, b: Registro) => fecha(a).localeCompare(fecha(b));

// Orden del padrón en TI: primero lo que TI puede resolver ya (instalar), luego
// las solicitudes pendientes (baja antes que actualización) y, al final, lo que
// no requiere acción de TI: por cobrar (espera a Admin) y sin pendientes.
const grupoTi = (r: Registro): number => {
  if (r.estado === "pendiente" && !r.noDispositivo && r.pagos.length > 0) return 0; // por instalar
  if (r.estado !== "baja") {
    if (pidePendiente(r, "baja")) return 1;          // por dar de baja
    if (pidePendiente(r, "actualizacion")) return 2; // por actualizar
  }
  if (r.estado === "pendiente" && r.pagos.length === 0) return 3;  // por cobrar (Admin)
  return 4;                                                        // sin pendientes
};

// Pantalla completa del rol TI, pensada para usarse desde el celular en el
// estacionamiento: tres tarjetas de acción (instalar / actualizar / dar de baja)
// que abren un flujo enfocado, y abajo el padrón completo con las mismas acciones.
// Lee de Supabase (lib/supabase/apiPanel); TI también define el estacionamiento
// al instalar o actualizar (SC-002).
export default function VistaTi({ nombreSesion }: { nombreSesion?: string }) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [notas, setNotas] = useState<Solicitud[]>([]);
  const [loading, setLoading] = useState(true);
  const [marcas, setMarcas] = useState<string[]>([]);
  const [colores, setColores] = useState<string[]>([]);
  const [estacionamientos, setEstacionamientos] = useState<string[]>([]);

  const [modo, setModo] = useState<Modo>("inicio");
  const [query, setQuery] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [accionPadron, setAccionPadron] = useState<Accion | null>(null);

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmCfg | null>(null);
  const bannersRef = useRef<HTMLDivElement>(null);

  // Nombre de quien atiende: se toma de la sesión autenticada y se conserva
  // mientras esta vista siga montada. No se persiste entre sesiones: los
  // dispositivos de caseta pueden ser compartidos y no debemos atribuirle una
  // acción al usuario que inició sesión anteriormente.
  const [tiNombre, setTiNombre] = useState(nombreSesion ?? "");

  async function refresh() {
    setLoading(true);
    try {
      const [list, notasList] = await Promise.all([listRegistros(), listNotasSinExpediente()]);
      setRegistros(list);
      setNotas(notasList);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudieron cargar los registros.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    // Catálogos: si fallan, los formularios siguen operables con lo que el
    // registro ya trae; la BD valida las claves reales al asignar.
    getMarcas().then(setMarcas).catch(() => {});
    getColores().then(setColores).catch(() => {});
    getEstacionamientos()
      .then((es) => setEstacionamientos(es.map((e) => e.clave)))
      .catch(() => setEstacionamientos(["E1", "E2"]));
  }, []);

  // Alineado con el RPC instalar_tag: solo registros PENDIENTES sin TAG y con
  // pago. (Un bloqueado no entra a la cola; el RPC lo rechazaría igual.)
  const porInstalar = useMemo(
    () => registros.filter((r) => r.estado === "pendiente" && !r.noDispositivo && r.pagos.length > 0)
      .sort(porUrgencia(fechaEsperaInstalar)),
    [registros]);
  // Registros del alta que aun NO pueden instalarse porque falta el pago
  // (Administracion cobra primero). Se muestran atenuados en "Instalar TAG" como
  // "Esperando pago", para que TI sepa que estan en la fila de instalacion.
  const instalarSinPago = useMemo(
    () => registros.filter((r) => r.estado === "pendiente" && !r.noDispositivo && r.pagos.length === 0)
      .sort(porUrgencia(fechaEsperaInstalar)),
    [registros]);
  const solicitanActualizar = useMemo(
    () => registros.filter((r) => r.estado !== "baja" && pidePendiente(r, "actualizacion"))
      .sort(porUrgencia((r) => fechaEsperaTramite(r, "actualizacion"))),
    [registros]);
  const solicitanBaja = useMemo(
    () => registros.filter((r) => r.estado !== "baja" && pidePendiente(r, "baja"))
      .sort(porUrgencia((r) => fechaEsperaTramite(r, "baja"))),
    [registros]);

  const q = query.trim().toLowerCase();
  const coincide = (r: Registro) =>
    [r.usuarioNombre, r.gestionanteNombre ?? "", r.placas ?? "", r.noDispositivo ?? "", r.folio, r.marca, r.modelo]
      .join(" ").toLowerCase().includes(q);
  // sort() es estable: dentro de cada grupo se conserva el orden de listRegistros
  // (nuevos primero).
  const padron = [...(q ? registros.filter(coincide) : registros)].sort((a, b) => grupoTi(a) - grupoTi(b));
  // Búsqueda dentro de "Actualizar datos" / "Dar de baja" para atender a quien
  // llega sin solicitud previa (el caso normal: se atiende en el momento).
  const listaSolicitudes = modo === "actualizar" ? solicitanActualizar : modo === "baja" ? solicitanBaja : [];
  const resultadosAccion = (modo === "actualizar" || modo === "baja") && q
    ? registros.filter((r) => r.estado !== "baja" && !listaSolicitudes.includes(r) && coincide(r))
    : [];

  async function run(fn: () => Promise<AccionResultado>, ok: string, after?: () => void) {
    if (busy) return;
    setBusy(true); setError(null); setFeedback(null);
    try {
      await fn();
      await refresh();
      setSelId(null); setAccionPadron(null);
      setFeedback(ok);
      after?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
      // Éxito o error, el aviso queda a la vista: los formularios pueden estar
      // muy abajo en el padrón móvil y una acción sin reacción visible se
      // siente como que no pasó nada.
      scrollAlAviso(bannersRef.current);
    }
  }

  function irA(m: Modo) {
    setModo(m); setSelId(null); setAccionPadron(null); setQuery("");
    setFeedback(null); setError(null);
  }
  function toggleSel(id: string) {
    setSelId((cur) => (cur === id ? null : id));
    setAccionPadron(null); setError(null);
  }

  // Confirmaciones: en campo, el error caro es activar un número equivocado,
  // así que las acciones repiten el dato clave antes de ejecutar.
  // Instalar define también el estacionamiento (SC-002): el SQL 31 ejecuta
  // asignación + TAG en una sola transacción, con la persona presente.
  function confirmarInstalar(r: Registro, tag: string, claves: string[], propio: boolean, apartadoNo: string) {
    const procedencia: ProcedenciaTag = propio ? "propio" : "escuela";
    const apartado = propio ? (apartadoNo.trim() || null) : null;
    const cambiaProcedencia = procedencia !== r.procedenciaTag;
    setConfirm({
      title: "Instalar y activar TAG",
      message: `Se instalará el TAG ${tag} en el ${r.marca} ${r.modelo} ${r.color} (${r.placas ?? "sin placas"}) de ${r.usuarioNombre}, con acceso a ${claves.join(" + ")}, y el registro quedará activo.`
        + (apartado ? ` Se apartará el TAG ${apartado} de la escuela.` : "")
        + (cambiaProcedencia ? ` El TAG quedará marcado como ${procedencia}.` : "")
        + " Revise bien el número. ¿Continuar?",
      confirmLabel: "Instalar", danger: false,
      action: () => instalarTagConEstacionamiento(r.id, tag, claves, tiNombre, { tagApartadoNo: apartado, procedenciaTag: procedencia }),
      ok: `TAG ${tag} instalado y activado (${r.folio}).` + (apartado ? ` TAG ${apartado} apartado.` : ""),
    });
  }
  // claves null = el estacionamiento no cambió (no se llama a su RPC).
  function confirmarActualizar(r: Registro, cambios: CambiosRegistro, claves: string[] | null, resumen: string, motivo: string) {
    setConfirm({
      title: "Actualizar registro",
      message: `Cambios en ${r.folio} (${r.usuarioNombre}): ${resumen}. ¿Guardar?`,
      confirmLabel: "Guardar cambios", danger: false,
      action: () => actualizarRegistroConEstacionamiento(r.id, cambios, claves, motivo, tiNombre),
      ok: `Registro ${r.folio} actualizado.`,
    });
  }
  function confirmarBaja(r: Registro, motivo: string) {
    setConfirm({
      title: "Dar de baja",
      message: `Se dará de baja el registro ${r.folio} (${r.usuarioNombre}) y su TAG quedará inactivo. ¿Continuar?`,
      confirmLabel: "Dar de baja", danger: true,
      action: () => darBaja(r.id, motivo, tiNombre),
      ok: `Registro ${r.folio} dado de baja.`,
    });
  }
  // CC-01: reposición desde el TAG apartado. Activa el reservado, deja inactivo el
  // actual y pasa la procedencia a escuela; se limpia la reserva.
  function confirmarUsarApartado(r: Registro) {
    setConfirm({
      title: "Usar el TAG apartado",
      message: `Se activará el TAG apartado ${r.tagApartadoNo} en ${r.folio} (${r.usuarioNombre}). El TAG actual ${r.noDispositivo ?? "—"} quedará inactivo y la procedencia pasará a escuela. ¿Continuar?`,
      confirmLabel: "Usar TAG apartado", danger: false,
      action: () => usarTagApartado(r.id, tiNombre),
      ok: `TAG apartado ${r.tagApartadoNo} activado en ${r.folio}. El anterior quedó inactivo.`,
    });
  }
  // Cierra una solicitud improcedente sin tocar el registro (motivo obligatorio).
  // Una nota ya vinculada se "cierra" con el mismo RPC una vez atendida.
  function confirmarDescartar(r: Registro, sol: Solicitud, motivo: string) {
    const esNota = sol.tipo === "nota";
    setConfirm({
      title: esNota ? "Cerrar nota" : "Descartar solicitud",
      message: esNota
        ? `Se cerrará la nota de ${r.folio} (${r.usuarioNombre}). Motivo: ${motivo}. ¿Continuar?`
        : `Se descartará la solicitud de ${sol.tipo === "actualizacion" ? "actualización" : "baja"} de ${r.folio} (${r.usuarioNombre}) sin aplicar ningún cambio. Motivo: ${motivo}. ¿Continuar?`,
      confirmLabel: esNota ? "Cerrar nota" : "Descartar", danger: true,
      action: () => descartarSolicitud(sol.id, motivo, tiNombre),
      ok: esNota ? `Nota cerrada (${r.folio}).` : `Solicitud descartada (${r.folio}).`,
    });
  }

  // SC-003: empata una nota con un expediente usando el tramite que TI CORROBORO
  // (puede ser el pedido u otro). Lleva a TI directo a la cola de ese tramite con
  // el expediente abierto (al ejecutarlo, la nota se cierra sola, bloque 38).
  function confirmarVincular(nota: Solicitud, r: Registro, tramite: TramiteSolicitado) {
    const destino: { modo: Modo; label: string } =
      tramite === "baja"
        ? { modo: "baja", label: "Dar de baja" }
        : { modo: "actualizar", label: "Actualizar datos" };
    const cambio = nota.tramiteSolicitado && nota.tramiteSolicitado !== tramite
      ? ` El cliente había pedido ${TRAMITE_LABEL[nota.tramiteSolicitado]}; se atenderá como ${destino.label}.`
      : "";
    setConfirm({
      title: "Vincular nota al expediente",
      message: `Se vinculará la nota de ${nota.solicitanteNombre ?? "—"} al expediente ${r.folio} (${r.usuarioNombre}) y aparecerá en «${destino.label}».${cambio} ¿Continuar?`,
      confirmLabel: "Vincular", danger: false,
      action: () => vincularNota(nota.id, r.id, tramite, tiNombre),
      ok: `Nota vinculada a ${r.folio}. Aparece en «${destino.label}».`,
      after: () => { setModo(destino.modo); setSelId(r.id); setQuery(""); },
    });
  }
  // Descarta una nota del buzon SIN vincularla (spam / no procede).
  function confirmarDescartarNota(nota: Solicitud, motivo: string) {
    setConfirm({
      title: "Descartar nota",
      message: `Se descartará la nota de ${nota.solicitanteNombre ?? "—"} sin vincularla a ningún expediente. Motivo: ${motivo}. ¿Continuar?`,
      confirmLabel: "Descartar", danger: true,
      action: () => descartarSolicitud(nota.id, motivo, tiNombre),
      ok: "Nota descartada.",
    });
  }

  const banners = (
    <div className="ti-banners" aria-live="polite" ref={bannersRef}>
      {feedback && <p className="catalog-feedback catalog-feedback--ok">{feedback}</p>}
      {error && <p className="submit-error">{error}</p>}
      {loadError && (
        <p className="submit-error">
          {loadError}{" "}
          <button type="button" className="link-action" onClick={() => refresh()}>Reintentar</button>
        </p>
      )}
    </div>
  );

  function formPara(accion: Accion, r: Registro) {
    if (accion === "instalar")
      return <FormInstalar r={r} estacionamientos={estacionamientos} busy={busy} tiNombre={tiNombre} onTiNombre={setTiNombre} onSubmit={(tag, claves, propio, apartadoNo) => confirmarInstalar(r, tag, claves, propio, apartadoNo)} />;
    if (accion === "actualizar")
      return <FormActualizar r={r} marcas={marcas} colores={colores} estacionamientos={estacionamientos} busy={busy} tiNombre={tiNombre} onTiNombre={setTiNombre} onUsarApartado={() => confirmarUsarApartado(r)} onSubmit={(c, claves, res, mot) => confirmarActualizar(r, c, claves, res, mot)} />;
    return <FormBaja r={r} busy={busy} tiNombre={tiNombre} onTiNombre={setTiNombre} onSubmit={(m) => confirmarBaja(r, m)} />;
  }

  if (loading && registros.length === 0) return <Loader label="Cargando registros…" />;

  // Una carga fallida no equivale a una cola vacía. Evita mostrar contadores
  // verdes o "Todo al día" cuando todavía no conocemos el estado de la BD.
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
          <div className="ti-actions">
            <button type="button" className="ti-action" onClick={() => irA("instalar")}>
              <span><span className="ti-action__title">Instalar TAG</span><span className="ti-action__sub">En espera de instalación</span></span>
              <span className={`ti-action__count ti-action__count--${sem(porInstalar.length + instalarSinPago.length)}`}>{porInstalar.length + instalarSinPago.length}</span>
            </button>
            <button type="button" className="ti-action" onClick={() => irA("actualizar")}>
              <span><span className="ti-action__title">Actualizar datos</span><span className="ti-action__sub">Placas, vehículo o reposición de TAG</span></span>
              <span className={`ti-action__count ti-action__count--${sem(solicitanActualizar.length)}`}>{solicitanActualizar.length}</span>
            </button>
            <button type="button" className="ti-action" onClick={() => irA("baja")}>
              <span><span className="ti-action__title">Dar de baja</span><span className="ti-action__sub">Egresos y cancelaciones</span></span>
              <span className={`ti-action__count ti-action__count--${sem(solicitanBaja.length)}`}>{solicitanBaja.length}</span>
            </button>
            <button type="button" className="ti-action" onClick={() => irA("notas")}>
              <span><span className="ti-action__title">Notas sin expediente</span><span className="ti-action__sub">Buzón sin folio: vincular o descartar</span></span>
              <span className={`ti-action__count ti-action__count--${sem(notas.length)}`}>{notas.length}</span>
            </button>
          </div>

          <div className="panel">
            <p className="panel-title">Padrón completo ({padron.length})</p>
            <input className="input search" type="search" placeholder="Buscar por nombre, placa, No. de TAG o folio…"
              value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 12 }} />
            {banners}
            <div className="ti-cards">
              {padron.map((r) => (
                <TarjetaRegistro key={r.id} r={r} abierto={selId === r.id} onToggle={() => toggleSel(r.id)}>
                  <DetalleRegistro r={r} busy={busy} onDescartar={(s, m) => confirmarDescartar(r, s, m)} />
                  {r.estado === "baja" ? (
                    <p className="ti-hint">Registro dado de baja{r.fechaBaja ? ` el ${r.fechaBaja}` : ""}{r.motivoBaja ? ` — ${r.motivoBaja}` : ""}.</p>
                  ) : (
                    <>
                      <div className="ti-chips">
                        {r.estado === "pendiente" && !r.noDispositivo && r.pagos.length > 0 && (
                          <button type="button" className={`select-chip ${accionPadron === "instalar" ? "on" : ""}`}
                            onClick={() => setAccionPadron((a) => (a === "instalar" ? null : "instalar"))}>Instalar TAG</button>
                        )}
                        <button type="button" className={`select-chip ${accionPadron === "actualizar" ? "on" : ""}`}
                          onClick={() => setAccionPadron((a) => (a === "actualizar" ? null : "actualizar"))}>Actualizar datos</button>
                        <button type="button" className={`select-chip ${accionPadron === "baja" ? "on" : ""}`}
                          onClick={() => setAccionPadron((a) => (a === "baja" ? null : "baja"))}>Dar de baja</button>
                      </div>
                      {!r.noDispositivo && r.pagos.length === 0 && (
                        <p className="ti-hint">Sin pago registrado: el TAG se instala después del pago (Administración).</p>
                      )}
                      {accionPadron && formPara(accionPadron, r)}
                    </>
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
            <h2>{modo === "instalar" ? "Instalar TAG" : modo === "actualizar" ? "Actualizar datos" : modo === "notas" ? "Notas sin expediente" : "Dar de baja"}</h2>
          </div>
          {banners}

          {modo === "instalar" && (
            porInstalar.length === 0 && instalarSinPago.length === 0
              ? <p className="ti-empty">✓ No hay TAGs pendientes de instalar. Todo al día.</p>
              : (
                <>
                  {porInstalar.length > 0 && (
                    <div className="ti-cards">
                      {porInstalar.map((r) => (
                        <TarjetaRegistro key={r.id} r={r} abierto={selId === r.id} onToggle={() => toggleSel(r.id)} espera={fechaEsperaInstalar(r)}>
                          <DetalleRegistro r={r} busy={busy} onDescartar={(s, m) => confirmarDescartar(r, s, m)} />
                          {formPara("instalar", r)}
                        </TarjetaRegistro>
                      ))}
                    </div>
                  )}
                  {instalarSinPago.length > 0 && (
                    <>
                      <p className="ti-section-title" style={{ marginTop: porInstalar.length > 0 ? 18 : 0 }}>
                        Esperando pago ({instalarSinPago.length})
                      </p>
                      <div className="ti-cards ti-cards--muted">
                        {instalarSinPago.map((r) => (
                          <TarjetaRegistro key={r.id} r={r} abierto={selId === r.id} onToggle={() => toggleSel(r.id)} espera={fechaEsperaInstalar(r)}>
                            <DetalleRegistro r={r} busy={busy} onDescartar={(s, m) => confirmarDescartar(r, s, m)} />
                            <p className="ti-hint">Falta registrar el pago en Administración; el TAG se instala después del pago.</p>
                          </TarjetaRegistro>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )
          )}

          {(modo === "actualizar" || modo === "baja") && (
            <>
              {listaSolicitudes.length > 0 && (
                <>
                  <p className="ti-section-title">Con solicitud pendiente ({listaSolicitudes.length})</p>
                  <div className="ti-cards" style={{ marginBottom: 18 }}>
                    {listaSolicitudes.map((r) => (
                      <TarjetaRegistro key={r.id} r={r} abierto={selId === r.id} onToggle={() => toggleSel(r.id)}
                        espera={fechaEsperaTramite(r, modo === "actualizar" ? "actualizacion" : "baja")}>
                        <DetalleRegistro r={r} busy={busy} onDescartar={(s, m) => confirmarDescartar(r, s, m)} />
                        {formPara(modo, r)}
                      </TarjetaRegistro>
                    ))}
                  </div>
                </>
              )}
              <p className="ti-section-title">Atender a alguien más</p>
              <input className="input search" type="search" placeholder="Buscar por nombre, placa, No. de TAG o folio…"
                value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 12 }} />
              {q === "" ? (
                <p className="ti-hint">Busque el registro de la persona para {modo === "actualizar" ? "actualizar sus datos" : "darla de baja"}.</p>
              ) : (
                <div className="ti-cards">
                  {resultadosAccion.map((r) => (
                    <TarjetaRegistro key={r.id} r={r} abierto={selId === r.id} onToggle={() => toggleSel(r.id)}>
                      <DetalleRegistro r={r} busy={busy} onDescartar={(s, m) => confirmarDescartar(r, s, m)} />
                      {formPara(modo, r)}
                    </TarjetaRegistro>
                  ))}
                  {resultadosAccion.length === 0 && <p className="ti-hint">Sin resultados para «{query}».</p>}
                </div>
              )}
            </>
          )}

          {modo === "notas" && (
            notas.length === 0
              ? <p className="ti-empty">✓ No hay notas sin expediente. Todo al día.</p>
              : (
                <>
                  <p className="ti-hint" style={{ marginBottom: 12 }}>
                    Notas del buzón público (sin folio). Búsquelas por nombre y vincúlelas al
                    expediente correcto, o descártelas si son spam.
                  </p>
                  <div className="ti-cards">
                    {notas.map((n) => (
                      <TarjetaNota key={n.id} nota={n} registros={registros} busy={busy}
                        onVincular={(r, tramite) => confirmarVincular(n, r, tramite)}
                        onDescartar={(m) => confirmarDescartarNota(n, m)} />
                    ))}
                  </div>
                </>
              )
          )}
        </>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={() => { const c = confirm; setConfirm(null); run(c.action, c.ok, c.after); }}
        />
      )}
    </>
  );
}

// ---- Formularios de acción ----
function FormInstalar({ r, estacionamientos, busy, tiNombre, onTiNombre, onSubmit }: {
  r: Registro; estacionamientos: string[]; busy: boolean; tiNombre: string;
  onTiNombre: (v: string) => void;
  onSubmit: (tag: string, claves: string[], propio: boolean, apartadoNo: string) => void;
}) {
  const [tag, setTag] = useState("");
  // TI define el estacionamiento al instalar (SC-002); al menos uno: un TAG
  // sin acceso a ningún estacionamiento no sirve de nada.
  const [claves, setClaves] = useState<string[]>(r.estacionamientos);
  // CC-01: si la familia trae su propio TAG, el que se instala es el propio y la
  // escuela aparta el suyo. El número apartado es opcional en el momento.
  const [propio, setPropio] = useState(r.procedenciaTag === "propio");
  const [apartadoNo, setApartadoNo] = useState(r.tagApartadoNo ?? "");
  const valido = TAG_RE.test(tag);
  const apartadoLleno = propio && apartadoNo.trim() !== "";
  const apartadoValido = !apartadoLleno || (TAG_RE.test(apartadoNo) && apartadoNo !== tag);
  const toggle = (c: string) =>
    setClaves((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  return (
    <div className="ti-form">
      <div className="field">
        <span>Estacionamiento (acceso del TAG)</span>
        <div className="chip-row">
          {estacionamientos.map((c) => (
            <button key={c} type="button" className={`select-chip ${claves.includes(c) ? "on" : ""}`} onClick={() => toggle(c)}>{c}</button>
          ))}
        </div>
        {claves.length === 0 && <p className="field-error">Elija al menos un estacionamiento.</p>}
      </div>
      <div className="field">
        <span>No. de TAG (6–11 dígitos){propio ? " — el propio de la familia" : ""}</span>
        <input className={`input ${tag !== "" && !valido ? "invalid" : ""}`} inputMode="numeric" autoComplete="off"
          maxLength={11} placeholder="Ej. 9426780" value={tag}
          onChange={(e) => setTag(e.target.value.replace(/[^0-9]/g, ""))} />
        {tag !== "" && !valido && <p className="field-error">Lleva {tag.length} dígito{tag.length === 1 ? "" : "s"}; deben ser de 6 a 11.</p>}
      </div>
      <label className="check">
        <input type="checkbox" checked={propio} onChange={(e) => setPropio(e.target.checked)} />
        <span>La familia trae su propio TAG (se aparta el de la escuela)</span>
      </label>
      {propio && (
        <div className="field">
          <span>No. del TAG apartado (opcional, 6–11 dígitos)</span>
          <input className={`input ${apartadoLleno && !apartadoValido ? "invalid" : ""}`} inputMode="numeric" autoComplete="off"
            maxLength={11} placeholder="TAG de la escuela reservado" value={apartadoNo}
            onChange={(e) => setApartadoNo(e.target.value.replace(/[^0-9]/g, ""))} />
          {apartadoLleno && !TAG_RE.test(apartadoNo) && <p className="field-error">Lleva {apartadoNo.length} dígito{apartadoNo.length === 1 ? "" : "s"}; deben ser de 6 a 11.</p>}
          {apartadoLleno && TAG_RE.test(apartadoNo) && apartadoNo === tag && <p className="field-error">El TAG apartado no puede ser el mismo que el que se instala.</p>}
          <p className="ti-hint">Queda reservado, sin instalar, para una reposición futura.</p>
        </div>
      )}
      <div className="field"><span>Instalado por</span><input className="input" value={tiNombre} onChange={(e) => onTiNombre(e.target.value)} placeholder="Su nombre" /></div>
      <button type="button" className="primary-action" disabled={busy || !valido || claves.length === 0 || !apartadoValido} onClick={() => onSubmit(tag, claves, propio, apartadoNo)}>
        {valido ? `Instalar y activar TAG ${tag}` : "Instalar y activar"}
      </button>
    </div>
  );
}

function FormActualizar({ r, marcas, colores, estacionamientos, busy, tiNombre, onTiNombre, onUsarApartado, onSubmit }: {
  r: Registro; marcas: string[]; colores: string[]; estacionamientos: string[]; busy: boolean;
  tiNombre: string; onTiNombre: (v: string) => void;
  onUsarApartado: () => void;
  onSubmit: (cambios: CambiosRegistro, claves: string[] | null, resumen: string, motivo: string) => void;
}) {
  const [tag, setTag] = useState(r.noDispositivo ?? "");
  const [sinPlacas, setSinPlacas] = useState(r.sinPlacas);
  const [placas, setPlacas] = useState(r.placas ?? "");
  const [marca, setMarca] = useState(r.marca);
  const [modelo, setModelo] = useState(r.modelo);
  const [color, setColor] = useState(r.color);
  // CC-01: TI puede corregir propio/escuela (el titular solo lo declara en el alta).
  const [procedencia, setProcedencia] = useState<ProcedenciaTag>(r.procedenciaTag);
  const [claves, setClaves] = useState<string[]>(r.estacionamientos);
  const [motivo, setMotivo] = useState("");

  const tieneTag = r.noDispositivo !== null;
  const tagCambia = tieneTag && tag !== r.noDispositivo;
  const tagValido = !tieneTag || TAG_RE.test(tag);
  const placasFinal = sinPlacas ? null : (placas.trim().toUpperCase() || null);
  const placasValidas = sinPlacas || placasFinal !== null;
  // Aquí sí se permite dejarlo vacío (corregir una asignación equivocada);
  // al instalar es donde se exige al menos uno.
  const estCambia = !mismaAsignacion(claves, r.estacionamientos);
  const toggleEst = (c: string) =>
    setClaves((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));

  const cambios: CambiosRegistro = {};
  const resumen: string[] = [];
  if (tagCambia && tagValido) { cambios.noDispositivo = tag; resumen.push(`TAG ${r.noDispositivo} → ${tag} (reposición; el anterior queda inactivo)`); }
  if (placasFinal !== r.placas || sinPlacas !== r.sinPlacas) { cambios.placas = placasFinal; cambios.sinPlacas = sinPlacas; resumen.push(`placas ${r.placas ?? "sin placas"} → ${placasFinal ?? "sin placas"}`); }
  if (marca !== r.marca) { cambios.marca = marca; resumen.push(`marca ${r.marca} → ${marca}`); }
  if (modelo.trim() && modelo.trim() !== r.modelo) { cambios.modelo = modelo.trim(); resumen.push(`modelo ${r.modelo} → ${modelo.trim()}`); }
  if (color !== r.color) { cambios.color = color; resumen.push(`color ${r.color} → ${color}`); }
  if (procedencia !== r.procedenciaTag) { cambios.procedenciaTag = procedencia; resumen.push(`procedencia ${r.procedenciaTag} → ${procedencia}`); }
  if (estCambia) resumen.push(`estacionamiento ${r.estacionamientos.join(" + ") || "sin asignar"} → ${claves.join(" + ") || "sin asignar"}`);
  const hayCambios = resumen.length > 0;

  return (
    <div className="ti-form">
      {r.tagApartado && r.tagApartadoNo && (
        <div className="notice" style={{ marginBottom: 4 }}>
          <strong>Reinstalación con el TAG apartado.</strong> Este registro tiene reservado el TAG {r.tagApartadoNo}.
          Si el TAG actual ({r.noDispositivo ?? "—"}) se dañó o se perdió, actívelo: el apartado queda en uso, la
          procedencia pasa a escuela y el TAG anterior queda inactivo.
          <div className="ti-chips" style={{ marginTop: 8 }}>
            <button type="button" className="primary-action" disabled={busy} onClick={onUsarApartado}>
              Usar el TAG apartado {r.tagApartadoNo}
            </button>
          </div>
        </div>
      )}
      {tieneTag ? (
        <div className="field">
          <span>No. de TAG (cambiarlo registra una reposición)</span>
          <input className={`input ${!tagValido ? "invalid" : ""}`} inputMode="numeric" autoComplete="off" maxLength={11}
            value={tag} onChange={(e) => setTag(e.target.value.replace(/[^0-9]/g, ""))} />
          {!tagValido && <p className="field-error">El No. de TAG debe tener de 6 a 11 dígitos.</p>}
          {tagCambia && tagValido && <p className="hint">El TAG {r.noDispositivo} quedará inactivo.</p>}
        </div>
      ) : (
        <p className="ti-hint">Este registro aún no tiene TAG; el número se captura desde «Instalar TAG».</p>
      )}
      <div className="grid-2">
        <div className="field">
          <span>Placas</span>
          <input className={`input ${!placasValidas ? "invalid" : ""}`} value={placas} disabled={sinPlacas}
            onChange={(e) => setPlacas(e.target.value.toUpperCase())} placeholder="Ej. UAB1234" />
        </div>
        <label className="check ti-check-placas">
          <input type="checkbox" checked={sinPlacas} onChange={(e) => setSinPlacas(e.target.checked)} />
          <span>Sin placas (permiso/nuevo)</span>
        </label>
      </div>
      <div className="grid-2">
        <div className="field">
          <span>Marca</span>
          <select className="select" value={marca} onChange={(e) => setMarca(e.target.value)}>
            {[...new Set([r.marca, ...marcas])].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="field"><span>Modelo</span><input className="input" value={modelo} onChange={(e) => setModelo(e.target.value)} /></div>
      </div>
      <div className="grid-2">
        <div className="field">
          <span>Color</span>
          <select className="select" value={color} onChange={(e) => setColor(e.target.value)}>
            {[...new Set([r.color, ...colores])].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field"><span>Motivo (opcional)</span><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. placas nuevas, TAG dañado" /></div>
      </div>
      <div className="field">
        <span>Procedencia del TAG</span>
        <select className="select" value={procedencia} onChange={(e) => setProcedencia(e.target.value as ProcedenciaTag)}>
          <option value="escuela">Escuela</option>
          <option value="propio">Propio (la familia trae su TAG)</option>
        </select>
        {r.tagApartado && procedencia === "escuela" && (
          <p className="field-error">Este registro tiene un TAG apartado ({r.tagApartadoNo}). Para pasar a escuela, use «Usar TAG apartado» desde el expediente.</p>
        )}
      </div>
      <div className="field">
        <span>Estacionamiento (acceso del TAG)</span>
        <div className="chip-row">
          {estacionamientos.map((c) => (
            <button key={c} type="button" className={`select-chip ${claves.includes(c) ? "on" : ""}`} onClick={() => toggleEst(c)}>{c}</button>
          ))}
        </div>
      </div>
      <div className="field"><span>Atendido por</span><input className="input" value={tiNombre} onChange={(e) => onTiNombre(e.target.value)} placeholder="Su nombre" /></div>
      <button type="button" className="primary-action"
        disabled={busy || !hayCambios || !tagValido || !placasValidas || (r.tagApartado && procedencia === "escuela")}
        onClick={() => onSubmit(cambios, estCambia ? claves : null, resumen.join("; "), motivo)}>
        Guardar cambios
      </button>
      {!hayCambios && <p className="hint" style={{ marginTop: 8 }}>Modifique algún dato para poder guardar.</p>}
    </div>
  );
}

function FormBaja({ r, busy, tiNombre, onTiNombre, onSubmit }: {
  r: Registro; busy: boolean; tiNombre: string; onTiNombre: (v: string) => void; onSubmit: (motivo: string) => void;
}) {
  // Si hay una peticion de baja pendiente (solicitud de folio o nota vinculada
  // que pidio baja), su detalle prellena el motivo.
  const [motivo, setMotivo] = useState(() =>
    r.solicitudes.find((s) => !s.atendida &&
      (s.tipo === "baja" || (s.tipo === "nota" && s.tramiteSolicitado === "baja")))?.detalle ?? "");
  return (
    <div className="ti-form">
      <div className="field"><span>Motivo de baja</span><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. egreso, cambio de vehículo" /></div>
      <div className="field"><span>Atendido por</span><input className="input" value={tiNombre} onChange={(e) => onTiNombre(e.target.value)} placeholder="Su nombre" /></div>
      <button type="button" className="primary-action btn-danger" disabled={busy || !motivo.trim()} onClick={() => onSubmit(motivo)}>
        Dar de baja
      </button>
    </div>
  );
}

// SC-003: una nota del buzon sin vincular. Muestra quien la dejo y que necesita,
// y ofrece las dos salidas de TI: vincularla al expediente correcto (buscandolo
// por nombre) o descartarla si es spam. Recolectar es publico; buscar es privado:
// aqui es donde TI hace la busqueda que el publico nunca ve.
function TarjetaNota({ nota, registros, busy, onVincular, onDescartar }: {
  nota: Solicitud;
  registros: Registro[];
  busy: boolean;
  onVincular: (r: Registro, tramite: TramiteSolicitado) => void;
  onDescartar: (motivo: string) => void;
}) {
  const [accion, setAccion] = useState<null | "vincular" | "descartar">(null);
  const [q, setQ] = useState("");
  const [motivo, setMotivo] = useState("");
  // Paso 2 de vincular: expediente elegido + tramite que TI corrobora (arranca en
  // el que pidio el cliente y TI lo confirma o lo cambia).
  const [elegido, setElegido] = useState<Registro | null>(null);
  const [tramite, setTramite] = useState<TramiteSolicitado>(nota.tramiteSolicitado ?? "actualizacion");
  const query = q.trim().toLowerCase();
  // No se puede vincular a un registro dado de baja. Tope de 8 para no volcar
  // el padron entero dentro de la tarjeta.
  const resultados = query
    ? registros.filter((r) => r.estado !== "baja" &&
        [r.usuarioNombre, r.gestionanteNombre ?? "", r.placas ?? "", r.folio, r.marca, r.modelo]
          .join(" ").toLowerCase().includes(query)).slice(0, 8)
    : [];
  function elegir(r: Registro) {
    setElegido(r);
    setTramite(nota.tramiteSolicitado ?? "actualizacion");
  }
  return (
    <div className="ti-card is-open">
      <div className="ti-card__body">
        <div className="detail-grid" style={{ marginBottom: 12 }}>
          <div><div className="k">Solicitante</div><div className="v">{nota.solicitanteNombre ?? "—"}</div></div>
          <div><div className="k">Quién solicita</div><div className="v">{nota.solicitanteRol ? ROL_LABEL[nota.solicitanteRol] : "—"}</div></div>
          <div style={{ gridColumn: "1 / -1" }}><div className="k">Pidió</div><div className="v"><strong>{nota.tramiteSolicitado ? TRAMITE_LABEL[nota.tramiteSolicitado] : "—"}</strong></div></div>
          {nota.alumnoNombre && <div><div className="k">Alumno</div><div className="v">{nota.alumnoNombre}</div></div>}
          {nota.alumnoGrado && <div><div className="k">Grado</div><div className="v">{nota.alumnoGrado}</div></div>}
          {nota.vehiculoDesc && <div><div className="k">Coche</div><div className="v">{nota.vehiculoDesc}</div></div>}
          <div><div className="k">Fecha</div><div className="v">{nota.fecha} <BadgeEspera fecha={nota.fecha} /></div></div>
          <div style={{ gridColumn: "1 / -1" }}><div className="k">Qué necesita</div><div className="v">{nota.detalle}</div></div>
        </div>

        <div className="ti-chips">
          <button type="button" className={`select-chip ${accion === "vincular" ? "on" : ""}`}
            onClick={() => { setAccion((a) => (a === "vincular" ? null : "vincular")); setElegido(null); }}>Vincular a un expediente</button>
          <button type="button" className={`select-chip ${accion === "descartar" ? "on" : ""}`}
            onClick={() => setAccion((a) => (a === "descartar" ? null : "descartar"))}>Descartar</button>
        </div>

        {accion === "vincular" && !elegido && (
          <div className="ti-form" style={{ marginTop: 12 }}>
            <div className="field">
              <span>Busque el expediente por nombre, placa o folio</span>
              <input className="input search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Nombre del alumno o del titular…" />
            </div>
            {query === "" ? (
              <p className="ti-hint">Escriba para buscar el expediente al que corresponde esta nota.</p>
            ) : resultados.length === 0 ? (
              <p className="ti-hint">Sin resultados para «{q}».</p>
            ) : (
              <div className="ti-cards">
                {resultados.map((r) => (
                  <div key={r.id} className="ti-card is-open">
                    <div className="ti-card__body">
                      <span className="ti-card__veh">{r.usuarioNombre}</span>
                      <span className="ti-card__sub">{r.marca} {r.modelo} · {r.color} · {r.placas ?? (r.sinPlacas ? "sin placas" : "—")}</span>
                      <span className="ti-card__meta">{r.folio}{r.noDispositivo ? ` · TAG ${r.noDispositivo}` : " · sin TAG"}</span>
                      <button type="button" className="primary-action" disabled={busy} style={{ marginTop: 10 }}
                        onClick={() => elegir(r)}>Elegir este expediente</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {accion === "vincular" && elegido && (
          <div className="ti-form" style={{ marginTop: 12 }}>
            <p className="ti-hint" style={{ marginBottom: 4 }}>
              Expediente: <strong>{elegido.folio}</strong> — {elegido.usuarioNombre}{" "}
              <button type="button" className="link-action" onClick={() => setElegido(null)}>cambiar</button>
            </p>
            <div className="field">
              <span>El cliente pidió <strong>{nota.tramiteSolicitado ? TRAMITE_LABEL[nota.tramiteSolicitado] : "—"}</strong>. ¿Qué trámite corresponde?</span>
              <div className="chip-row">
                {TRAMITES_TI.map((t) => (
                  <button key={t} type="button" className={`select-chip ${tramite === t ? "on" : ""}`}
                    onClick={() => setTramite(t)}>{TRAMITE_LABEL[t]}</button>
                ))}
              </div>
            </div>
            <button type="button" className="primary-action" disabled={busy}
              onClick={() => onVincular(elegido, tramite)}>Vincular como {TRAMITE_LABEL[tramite]}</button>
          </div>
        )}

        {accion === "descartar" && (
          <div className="ti-form" style={{ marginTop: 12 }}>
            <div className="field">
              <span>¿Por qué se descarta?</span>
              <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. spam, datos falsos, no procede" />
            </div>
            <div className="ti-chips">
              <button type="button" className="select-chip" disabled={busy || !motivo.trim()}
                onClick={() => onDescartar(motivo.trim())}>Descartar nota</button>
              <button type="button" className="link-action" disabled={busy}
                onClick={() => { setAccion(null); setMotivo(""); }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
