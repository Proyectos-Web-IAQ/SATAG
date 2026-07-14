"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CambiosRegistro, Registro } from "@/lib/mock/types";
import { listRegistros, getMarcas, getColores, instalarTag, actualizarRegistro, darBaja } from "@/lib/mock/api";
import Loader from "@/components/Loader";
import ConfirmDialog from "@/components/ConfirmDialog";
import EstadoChip from "@/components/admin/EstadoChip";

type Modo = "inicio" | "instalar" | "actualizar" | "baja";
type Accion = "instalar" | "actualizar" | "baja";

type ConfirmCfg = {
  title: string; message: string; confirmLabel: string; danger: boolean;
  action: () => Promise<Registro>; ok: string;
};

const TAG_RE = /^[0-9]{6,11}$/;
// Semáforo de los contadores: verde (0), amarillo (pocos), rojo (muchos).
const sem = (n: number) => (n === 0 ? "ok" : n <= 4 ? "warn" : "alert");

// Scroll suave salvo que el sistema pida movimiento reducido.
const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

// Pantalla completa del rol TI, pensada para usarse desde el celular en el
// estacionamiento: tres tarjetas de acción (instalar / actualizar / dar de baja)
// que abren un flujo enfocado, y abajo el padrón completo con las mismas acciones.
// Carga sus propios datos; al conectar Supabase solo cambia la capa lib/mock/api.
export default function VistaTi() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [marcas, setMarcas] = useState<string[]>([]);
  const [colores, setColores] = useState<string[]>([]);

  const [modo, setModo] = useState<Modo>("inicio");
  const [query, setQuery] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [accionPadron, setAccionPadron] = useState<Accion | null>(null);

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmCfg | null>(null);

  // Nombre de quien atiende: se conserva entre registros y visitas (localStorage).
  // Con Supabase real se prellenará desde el usuario autenticado.
  const [tiNombre, setTiNombreState] = useState(() =>
    typeof window === "undefined" ? "" : window.localStorage.getItem("satag.tiNombre") ?? "");
  function setTiNombre(v: string) {
    setTiNombreState(v);
    try { window.localStorage.setItem("satag.tiNombre", v); } catch { /* storage bloqueado: no es crítico */ }
  }

  async function refresh() {
    const list = await listRegistros();
    setRegistros(list);
    setLoading(false);
  }
  useEffect(() => { refresh(); getMarcas().then(setMarcas); getColores().then(setColores); }, []);

  const porInstalar = useMemo(
    () => registros.filter((r) => r.estado !== "baja" && !r.noDispositivo && r.pagos.length > 0),
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
  const padron = q ? registros.filter(coincide) : registros;
  // Búsqueda dentro de "Actualizar datos" / "Dar de baja" para atender a quien
  // llega sin solicitud previa (el caso normal: se atiende en el momento).
  const listaSolicitudes = modo === "actualizar" ? solicitanActualizar : modo === "baja" ? solicitanBaja : [];
  const resultadosAccion = (modo === "actualizar" || modo === "baja") && q
    ? registros.filter((r) => r.estado !== "baja" && !listaSolicitudes.includes(r) && coincide(r))
    : [];

  async function run(fn: () => Promise<Registro>, ok: string) {
    setBusy(true); setError(null); setFeedback(null);
    try {
      await fn();
      await refresh();
      setSelId(null); setAccionPadron(null);
      setFeedback(ok);
      // Sube al inicio para que el aviso de éxito quede a la vista.
      window.scrollTo({ top: 0, behavior: scrollBehavior() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
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
  // así que las tres acciones repiten el dato clave antes de ejecutar.
  function confirmarInstalar(r: Registro, tag: string) {
    setConfirm({
      title: "Instalar y activar TAG",
      message: `Se instalará el TAG ${tag} en el ${r.marca} ${r.modelo} ${r.color} (${r.placas ?? "sin placas"}) de ${r.usuarioNombre} y el registro quedará activo. Revisa bien el número. ¿Continuar?`,
      confirmLabel: "Instalar", danger: false,
      action: () => instalarTag(r.id, tag, tiNombre),
      ok: `TAG ${tag} instalado y activado (${r.folio}).`,
    });
  }
  function confirmarActualizar(r: Registro, cambios: CambiosRegistro, resumen: string, motivo: string) {
    setConfirm({
      title: "Actualizar registro",
      message: `Cambios en ${r.folio} (${r.usuarioNombre}): ${resumen}. ¿Guardar?`,
      confirmLabel: "Guardar cambios", danger: false,
      action: () => actualizarRegistro(r.id, cambios, motivo, tiNombre),
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

  const banners = (
    <div className="ti-banners" aria-live="polite">
      {feedback && <p className="catalog-feedback catalog-feedback--ok">{feedback}</p>}
      {error && <p className="submit-error">{error}</p>}
    </div>
  );

  function formPara(accion: Accion, r: Registro) {
    if (accion === "instalar")
      return <FormInstalar busy={busy} tiNombre={tiNombre} onTiNombre={setTiNombre} onSubmit={(tag) => confirmarInstalar(r, tag)} />;
    if (accion === "actualizar")
      return <FormActualizar r={r} marcas={marcas} colores={colores} busy={busy} tiNombre={tiNombre} onTiNombre={setTiNombre} onSubmit={(c, res, mot) => confirmarActualizar(r, c, res, mot)} />;
    return <FormBaja r={r} busy={busy} tiNombre={tiNombre} onTiNombre={setTiNombre} onSubmit={(m) => confirmarBaja(r, m)} />;
  }

  if (loading && registros.length === 0) return <Loader label="Cargando registros…" />;

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
                  <DetalleRegistro r={r} />
                  {r.estado === "baja" ? (
                    <p className="ti-hint">Registro dado de baja{r.fechaBaja ? ` el ${r.fechaBaja}` : ""}{r.motivoBaja ? ` — ${r.motivoBaja}` : ""}.</p>
                  ) : (
                    <>
                      <div className="ti-chips">
                        {!r.noDispositivo && r.pagos.length > 0 && (
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
              {padron.length === 0 && <p className="ti-hint">Sin resultados para «{query}».</p>}
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
                      <DetalleRegistro r={r} />
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
                        <DetalleRegistro r={r} />
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
                      <DetalleRegistro r={r} />
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

// ---- Tarjeta de registro (área táctil completa, info para ubicar el vehículo) ----
function TarjetaRegistro({ r, abierto, onToggle, children }: {
  r: Registro; abierto: boolean; onToggle: () => void; children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Al abrir, lleva la tarjeta al inicio de la pantalla (respetando el header
  // fijo via scroll-margin-top) para que el formulario quede a la vista.
  useEffect(() => {
    if (abierto) ref.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }, [abierto]);
  const solicitudes = r.solicitudes.filter((s) => !s.atendida);
  return (
    <div ref={ref} className={`ti-card ${abierto ? "is-open" : ""}`}>
      <button type="button" className="ti-card__head" onClick={onToggle} aria-expanded={abierto}>
        <span className="ti-card__row">
          <span className="ti-card__placas">{r.placas ?? (r.sinPlacas ? "SIN PLACAS" : "—")}</span>
          <EstadoChip estado={r.estado} />
        </span>
        <span className="ti-card__veh">{r.marca} {r.modelo} · {r.color}</span>
        <span className="ti-card__sub">{r.usuarioNombre} · <span style={{ textTransform: "capitalize" }}>{r.tipoUsuario}</span></span>
        <span className="ti-card__meta">
          {r.folio}
          {r.estacionamientos.length > 0 ? ` · ${r.estacionamientos.join(" + ")}` : ""}
          {r.noDispositivo ? ` · TAG ${r.noDispositivo}` : " · sin TAG"}
        </span>
        {solicitudes.map((s, i) => (
          <span key={i} className="ti-card__solicitud">
            Solicita {s.tipo === "actualizacion" ? "actualización" : "baja"} ({s.fecha}): {s.detalle}
          </span>
        ))}
      </button>
      {abierto && <div className="ti-card__body">{children}</div>}
    </div>
  );
}

function DetalleRegistro({ r }: { r: Registro }) {
  return (
    <div className="detail-grid" style={{ marginBottom: 12 }}>
      <div><div className="k">Gestionante (paga y firma)</div><div className="v">{r.gestionanteNombre ?? "El mismo conductor"}</div></div>
      <div><div className="k">Procedencia TAG</div><div className="v" style={{ textTransform: "capitalize" }}>{r.procedenciaTag}</div></div>
      <div><div className="k">Pagos</div><div className="v">{r.pagos.length ? `$${r.pagos.reduce((a, p) => a + p.monto, 0)} (${r.pagos.length})` : "Sin pago"}</div></div>
      <div><div className="k">Estacionamiento</div><div className="v">{r.estacionamientos.join(" + ") || "Sin asignar"}</div></div>
      {r.fechaInstalacion && <div><div className="k">Instalado</div><div className="v">{r.fechaInstalacion}{r.instaladoPor ? ` · ${r.instaladoPor}` : ""}</div></div>}
      {r.observaciones && <div style={{ gridColumn: "1 / -1" }}><div className="k">Observaciones</div><div className="v">{r.observaciones}</div></div>}
    </div>
  );
}

// ---- Formularios de acción ----
function FormInstalar({ busy, tiNombre, onTiNombre, onSubmit }: {
  busy: boolean; tiNombre: string; onTiNombre: (v: string) => void; onSubmit: (tag: string) => void;
}) {
  const [tag, setTag] = useState("");
  const valido = TAG_RE.test(tag);
  return (
    <div className="ti-form">
      <div className="field">
        <span>No. de TAG (6–11 dígitos)</span>
        <input className={`input ${tag !== "" && !valido ? "invalid" : ""}`} inputMode="numeric" autoComplete="off"
          maxLength={11} placeholder="Ej. 9426780" value={tag}
          onChange={(e) => setTag(e.target.value.replace(/[^0-9]/g, ""))} />
        {tag !== "" && !valido && <p className="field-error">Lleva {tag.length} dígito{tag.length === 1 ? "" : "s"}; deben ser de 6 a 11.</p>}
      </div>
      <div className="field"><span>Instalado por</span><input className="input" value={tiNombre} onChange={(e) => onTiNombre(e.target.value)} placeholder="Tu nombre" /></div>
      <button type="button" className="primary-action" disabled={busy || !valido} onClick={() => onSubmit(tag)}>
        {valido ? `Instalar y activar TAG ${tag}` : "Instalar y activar"}
      </button>
    </div>
  );
}

function FormActualizar({ r, marcas, colores, busy, tiNombre, onTiNombre, onSubmit }: {
  r: Registro; marcas: string[]; colores: string[]; busy: boolean;
  tiNombre: string; onTiNombre: (v: string) => void;
  onSubmit: (cambios: CambiosRegistro, resumen: string, motivo: string) => void;
}) {
  const [tag, setTag] = useState(r.noDispositivo ?? "");
  const [sinPlacas, setSinPlacas] = useState(r.sinPlacas);
  const [placas, setPlacas] = useState(r.placas ?? "");
  const [marca, setMarca] = useState(r.marca);
  const [modelo, setModelo] = useState(r.modelo);
  const [color, setColor] = useState(r.color);
  const [motivo, setMotivo] = useState("");

  const tieneTag = r.noDispositivo !== null;
  const tagCambia = tieneTag && tag !== r.noDispositivo;
  const tagValido = !tieneTag || TAG_RE.test(tag);
  const placasFinal = sinPlacas ? null : (placas.trim().toUpperCase() || null);
  const placasValidas = sinPlacas || placasFinal !== null;

  const cambios: CambiosRegistro = {};
  const resumen: string[] = [];
  if (tagCambia && tagValido) { cambios.noDispositivo = tag; resumen.push(`TAG ${r.noDispositivo} → ${tag} (reposición; el anterior queda inactivo)`); }
  if (placasFinal !== r.placas || sinPlacas !== r.sinPlacas) { cambios.placas = placasFinal; cambios.sinPlacas = sinPlacas; resumen.push(`placas ${r.placas ?? "sin placas"} → ${placasFinal ?? "sin placas"}`); }
  if (marca !== r.marca) { cambios.marca = marca; resumen.push(`marca ${r.marca} → ${marca}`); }
  if (modelo.trim() && modelo.trim() !== r.modelo) { cambios.modelo = modelo.trim(); resumen.push(`modelo ${r.modelo} → ${modelo.trim()}`); }
  if (color !== r.color) { cambios.color = color; resumen.push(`color ${r.color} → ${color}`); }
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
      <div className="field"><span>Atendido por</span><input className="input" value={tiNombre} onChange={(e) => onTiNombre(e.target.value)} placeholder="Tu nombre" /></div>
      <button type="button" className="primary-action" disabled={busy || !hayCambios || !tagValido || !placasValidas}
        onClick={() => onSubmit(cambios, resumen.join("; "), motivo)}>
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
