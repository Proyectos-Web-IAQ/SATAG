"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CambiosRegistro, ProcedenciaTag, Registro, Solicitud } from "@/lib/mock/types";
import { getMarcas, getColores } from "@/lib/supabase/api";
import {
  listRegistros,
  getEstacionamientos,
  instalarTagConEstacionamiento,
  actualizarRegistroConEstacionamiento,
  darBaja,
  descartarSolicitud,
  type AccionResultado,
} from "@/lib/supabase/apiPanel";
import Loader from "@/components/Loader";
import ConfirmDialog from "@/components/ConfirmDialog";
import { DetalleRegistro, TarjetaRegistro, scrollAlAviso } from "@/components/admin/RegistroCard";

type Modo = "inicio" | "instalar" | "actualizar" | "baja";
type Accion = "instalar" | "actualizar" | "baja";

type ConfirmCfg = {
  title: string; message: string; confirmLabel: string; danger: boolean;
  action: () => Promise<AccionResultado>; ok: string;
};

// Compara asignaciones de estacionamiento sin importar el orden de los chips.
const mismaAsignacion = (a: string[], b: string[]) =>
  [...a].sort().join("+") === [...b].sort().join("+");

const TAG_RE = /^[0-9]{6,11}$/;
// Semáforo de los contadores: verde (0), amarillo (pocos), rojo (muchos).
const sem = (n: number) => (n === 0 ? "ok" : n <= 4 ? "warn" : "alert");

// Orden del padrón en TI: primero lo que TI puede resolver ya (instalar), luego
// las solicitudes pendientes (baja antes que actualización) y, al final, lo que
// no requiere acción de TI: por cobrar (espera a Admin) y sin pendientes.
const grupoTi = (r: Registro): number => {
  if (r.estado === "pendiente" && !r.noDispositivo && r.pagos.length > 0) return 0; // por instalar
  if (r.estado !== "baja") {
    const solPend = r.solicitudes.filter((s) => !s.atendida);
    if (solPend.some((s) => s.tipo === "baja")) return 1;          // por dar de baja
    if (solPend.some((s) => s.tipo === "actualizacion")) return 2; // por actualizar
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
      const list = await listRegistros();
      setRegistros(list);
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
    () => registros.filter((r) => r.estado === "pendiente" && !r.noDispositivo && r.pagos.length > 0),
    [registros]);
  const solicitanActualizar = useMemo(
    () => registros.filter((r) => r.estado !== "baja" && r.solicitudes.some((s) => !s.atendida && s.tipo === "actualizacion")),
    [registros]);
  const solicitanBaja = useMemo(
    () => registros.filter((r) => r.estado !== "baja" && r.solicitudes.some((s) => !s.atendida && s.tipo === "baja")),
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

  async function run(fn: () => Promise<AccionResultado>, ok: string) {
    if (busy) return;
    setBusy(true); setError(null); setFeedback(null);
    try {
      await fn();
      await refresh();
      setSelId(null); setAccionPadron(null);
      setFeedback(ok);
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
        + " Revisa bien el número. ¿Continuar?",
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
  // Cierra una solicitud improcedente sin tocar el registro (motivo obligatorio).
  function confirmarDescartar(r: Registro, sol: Solicitud, motivo: string) {
    setConfirm({
      title: "Descartar solicitud",
      message: `Se descartará la solicitud de ${sol.tipo === "actualizacion" ? "actualización" : "baja"} de ${r.folio} (${r.usuarioNombre}) sin aplicar ningún cambio. Motivo: ${motivo}. ¿Continuar?`,
      confirmLabel: "Descartar", danger: true,
      action: () => descartarSolicitud(sol.id, motivo, tiNombre),
      ok: `Solicitud descartada (${r.folio}).`,
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
      return <FormActualizar r={r} marcas={marcas} colores={colores} estacionamientos={estacionamientos} busy={busy} tiNombre={tiNombre} onTiNombre={setTiNombre} onSubmit={(c, claves, res, mot) => confirmarActualizar(r, c, claves, res, mot)} />;
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
              <span><span className="ti-action__title">Instalar TAG</span><span className="ti-action__sub">Pagados, en espera de instalación</span></span>
              <span className={`ti-action__count ti-action__count--${sem(porInstalar.length)}`}>{porInstalar.length}</span>
            </button>
            <button type="button" className="ti-action" onClick={() => irA("actualizar")}>
              <span><span className="ti-action__title">Actualizar datos</span><span className="ti-action__sub">Placas, vehículo o reposición de TAG</span></span>
              <span className={`ti-action__count ti-action__count--${sem(solicitanActualizar.length)}`}>{solicitanActualizar.length}</span>
            </button>
            <button type="button" className="ti-action" onClick={() => irA("baja")}>
              <span><span className="ti-action__title">Dar de baja</span><span className="ti-action__sub">Egresos y cancelaciones</span></span>
              <span className={`ti-action__count ti-action__count--${sem(solicitanBaja.length)}`}>{solicitanBaja.length}</span>
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
            <h2>{modo === "instalar" ? "Instalar TAG" : modo === "actualizar" ? "Actualizar datos" : "Dar de baja"}</h2>
          </div>
          {banners}

          {modo === "instalar" && (
            porInstalar.length === 0
              ? <p className="ti-empty">✓ No hay TAGs pendientes de instalar. Todo al día.</p>
              : (
                <div className="ti-cards">
                  {porInstalar.map((r) => (
                    <TarjetaRegistro key={r.id} r={r} abierto={selId === r.id} onToggle={() => toggleSel(r.id)}>
                      <DetalleRegistro r={r} busy={busy} onDescartar={(s, m) => confirmarDescartar(r, s, m)} />
                      {formPara("instalar", r)}
                    </TarjetaRegistro>
                  ))}
                </div>
              )
          )}

          {(modo === "actualizar" || modo === "baja") && (
            <>
              {listaSolicitudes.length > 0 && (
                <>
                  <p className="ti-section-title">Con solicitud pendiente ({listaSolicitudes.length})</p>
                  <div className="ti-cards" style={{ marginBottom: 18 }}>
                    {listaSolicitudes.map((r) => (
                      <TarjetaRegistro key={r.id} r={r} abierto={selId === r.id} onToggle={() => toggleSel(r.id)}>
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
                <p className="ti-hint">Busca el registro de la persona para {modo === "actualizar" ? "actualizar sus datos" : "darla de baja"}.</p>
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
        </>
      )}

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
        {claves.length === 0 && <p className="field-error">Elige al menos un estacionamiento.</p>}
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
      <div className="field"><span>Instalado por</span><input className="input" value={tiNombre} onChange={(e) => onTiNombre(e.target.value)} placeholder="Tu nombre" /></div>
      <button type="button" className="primary-action" disabled={busy || !valido || claves.length === 0 || !apartadoValido} onClick={() => onSubmit(tag, claves, propio, apartadoNo)}>
        {valido ? `Instalar y activar TAG ${tag}` : "Instalar y activar"}
      </button>
    </div>
  );
}

function FormActualizar({ r, marcas, colores, estacionamientos, busy, tiNombre, onTiNombre, onSubmit }: {
  r: Registro; marcas: string[]; colores: string[]; estacionamientos: string[]; busy: boolean;
  tiNombre: string; onTiNombre: (v: string) => void;
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
      </div>
      <div className="field">
        <span>Estacionamiento (acceso del TAG)</span>
        <div className="chip-row">
          {estacionamientos.map((c) => (
            <button key={c} type="button" className={`select-chip ${claves.includes(c) ? "on" : ""}`} onClick={() => toggleEst(c)}>{c}</button>
          ))}
        </div>
      </div>
      <div className="field"><span>Atendido por</span><input className="input" value={tiNombre} onChange={(e) => onTiNombre(e.target.value)} placeholder="Tu nombre" /></div>
      <button type="button" className="primary-action" disabled={busy || !hayCambios || !tagValido || !placasValidas}
        onClick={() => onSubmit(cambios, estCambia ? claves : null, resumen.join("; "), motivo)}>
        Guardar cambios
      </button>
      {!hayCambios && <p className="hint" style={{ marginTop: 8 }}>Modifica algún dato para poder guardar.</p>}
    </div>
  );
}

function FormBaja({ r, busy, tiNombre, onTiNombre, onSubmit }: {
  r: Registro; busy: boolean; tiNombre: string; onTiNombre: (v: string) => void; onSubmit: (motivo: string) => void;
}) {
  // Si hay solicitud de baja pendiente, su detalle prellena el motivo.
  const [motivo, setMotivo] = useState(() => r.solicitudes.find((s) => !s.atendida && s.tipo === "baja")?.detalle ?? "");
  return (
    <div className="ti-form">
      <div className="field"><span>Motivo de baja</span><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. egreso, cambio de vehículo" /></div>
      <div className="field"><span>Atendido por</span><input className="input" value={tiNombre} onChange={(e) => onTiNombre(e.target.value)} placeholder="Tu nombre" /></div>
      <button type="button" className="primary-action btn-danger" disabled={busy || !motivo.trim()} onClick={() => onSubmit(motivo)}>
        Dar de baja
      </button>
    </div>
  );
}
