"use client";
import { useEffect, useMemo, useState } from "react";
import type { EstadoRegistro, Registro } from "@/lib/mock/types";
import {
  listRegistros, asignarEstacionamiento, registrarPago,
  instalarTag, darBaja, reponerTag,
} from "@/lib/mock/api";
import Loader from "@/components/Loader";
import ConfirmDialog from "@/components/ConfirmDialog";

type Vista = "admin" | "ti" | "consulta";

function EstadoChip({ estado }: { estado: EstadoRegistro }) {
  const txt = { pendiente: "Pendiente", activo: "Activo", baja: "Baja" }[estado];
  return <span className={`status-chip status-chip--${estado}`}>{txt}</span>;
}

export default function AdminPanel({ adminEmail, onSignOut }: { adminEmail: string; onSignOut: () => void }) {
  const [vista, setVista] = useState<Vista>("admin");
  const [query, setQuery] = useState("");
  const [alcance, setAlcance] = useState<"pendientes" | "todos">("pendientes");
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<
    { title: string; message: string; confirmLabel: string; danger: boolean; action: () => Promise<Registro>; ok: string } | null
  >(null);

  // Formularios de acciones
  const [estSel, setEstSel] = useState<string[]>([]);
  const [cobradoPor, setCobradoPor] = useState("");
  const [pagoFolio, setPagoFolio] = useState("");
  const [monto, setMonto] = useState("100");
  const [tagNum, setTagNum] = useState("");
  const [tiNombre, setTiNombre] = useState("");
  const [bajaMotivo, setBajaMotivo] = useState("");
  const [repoNum, setRepoNum] = useState("");
  const [repoMotivo, setRepoMotivo] = useState("");

  async function refresh() {
    setLoading(true);
    const list = await listRegistros(query);
    setRegistros(list);
    setLoading(false);
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [query]);

  // Al cambiar de pestaña, cierra el expediente/apartado extensible que esté abierto.
  useEffect(() => { setSelectedId(null); }, [vista]);

  const selected = useMemo(() => registros.find((r) => r.id === selectedId) ?? null, [registros, selectedId]);

  // Sincroniza los formularios al cambiar de registro seleccionado
  useEffect(() => {
    setEstSel(selected?.estacionamientos ?? []);
    setTagNum(""); setBajaMotivo(""); setRepoNum(""); setRepoMotivo("");
    setCobradoPor(""); setPagoFolio(""); setMonto("100");
    setFeedback(null); setError(null);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const buscando = query.trim() !== "";
  const filtrados = useMemo(() => {
    // Al buscar se ve TODO el padrón (TI/Admin pueden encontrar cualquier activo).
    if (buscando) return registros;
    // "Todos" o la vista de consulta muestran el padrón completo (p. ej. para dar de
    // baja o cambiar un TAG ya activo).
    if (vista === "consulta" || alcance === "todos") return registros;
    // Con alcance "pendientes", cada vista muestra su cola de trabajo prioritaria.
    if (vista === "admin") return registros.filter((r) => r.estado === "pendiente" && (r.estacionamientos.length === 0 || r.pagos.length === 0));
    if (vista === "ti") return registros.filter((r) => r.estado !== "baja" && !r.noDispositivo);
    return registros;
  }, [registros, vista, buscando, alcance]);

  const metrics = useMemo(() => {
    // "Pendientes" según la vista: por gestionar (Admin), por instalar (TI), o total (Consulta).
    const pendientesVista =
      vista === "admin"
        ? registros.filter((r) => r.estado === "pendiente" && (r.estacionamientos.length === 0 || r.pagos.length === 0)).length
        : vista === "ti"
          ? registros.filter((r) => r.estado !== "baja" && !r.noDispositivo).length
          : registros.filter((r) => r.estado === "pendiente").length;
    return {
      total: registros.length,
      pendientes: pendientesVista,
      activos: registros.filter((r) => r.estado === "activo").length,
    };
  }, [registros, vista]);

  async function run(fn: () => Promise<Registro>, ok: string) {
    setBusy(true); setError(null); setFeedback(null);
    try {
      const upd = await fn();
      await refresh();
      setSelectedId(upd.id);
      setFeedback(ok);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  }

  function toggleEst(clave: string) {
    setEstSel((s) => (s.includes(clave) ? s.filter((c) => c !== clave) : [...s, clave]));
  }

  return (
    <main className="admin-shell">
      <div className="admin-panel">
        <div className="admin-header">
          <div>
            <h1>Panel de gestión de TAG</h1>
            <div className="admin-sub">Administración y TI · IAQ</div>
          </div>
          <div className="admin-header-actions">
            <div className="admin-tabs">
              <button className={`admin-tab ${vista === "admin" ? "admin-tab--active" : ""}`} onClick={() => setVista("admin")}>Administración</button>
              <button className={`admin-tab ${vista === "ti" ? "admin-tab--active" : ""}`} onClick={() => setVista("ti")}>TI</button>
              <button className={`admin-tab ${vista === "consulta" ? "admin-tab--active" : ""}`} onClick={() => setVista("consulta")}>Consulta</button>
            </div>
            <span className="admin-whoami">{adminEmail} · <button className="link-action" onClick={onSignOut}>Salir</button></span>
          </div>
        </div>

        <div className="metric-cards">
          <div
            className={`metric-card metric-card--${metrics.pendientes === 0 ? "ok" : metrics.pendientes <= 4 ? "warn" : "alert"}`}
            style={{ cursor: "pointer" }}
            title="Ver la cola de pendientes"
            onClick={() => { setAlcance("pendientes"); setQuery(""); }}
          >
            <span className="metric-label">{vista === "ti" ? "Pendientes por instalar" : vista === "admin" ? "Pendientes por gestionar" : "Pendientes"}</span>
            <span className="metric-value">{metrics.pendientes}</span>
          </div>
          <div className="metric-card"><span className="metric-label">Registros</span><span className="metric-value">{metrics.total}</span></div>
          <div className="metric-card"><span className="metric-label">Activos</span><span className="metric-value">{metrics.activos}</span></div>
        </div>

        <div className="toolbar">
          <input className="input search" placeholder="Buscar por nombre, placa, No. de TAG o folio…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {vista !== "consulta" && !buscando && (
            <div className="chip-row">
              <button className={`select-chip ${alcance === "pendientes" ? "on" : ""}`} onClick={() => setAlcance("pendientes")}>Pendientes</button>
              <button className={`select-chip ${alcance === "todos" ? "on" : ""}`} onClick={() => setAlcance("todos")}>Todos</button>
            </div>
          )}
        </div>

        {/* Lista */}
        <div className="panel">
          <p className="panel-title">
            {buscando ? "Resultados de búsqueda"
              : vista === "consulta" || alcance === "todos" ? "Todos los registros"
              : vista === "admin" ? "Pendientes de estacionamiento / pago"
              : "Pendientes de instalación"}
            {" "}({filtrados.length})
          </p>
          {loading && registros.length === 0 && <Loader label="Cargando registros…" />}
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Folio</th><th>Conductor</th><th>Placas</th><th>Tipo</th><th>Estac.</th><th>No. TAG</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {filtrados.map((r) => (
                  <tr key={r.id} className={`selectable ${r.id === selectedId ? "is-selected" : ""}`} onClick={() => setSelectedId((cur) => (cur === r.id ? null : r.id))}>
                    <td>{r.folio}</td>
                    <td>{r.usuarioNombre}</td>
                    <td>{r.placas ?? (r.sinPlacas ? "— sin placas" : "—")}</td>
                    <td style={{ textTransform: "capitalize" }}>{r.tipoUsuario}</td>
                    <td>{r.estacionamientos.join(" + ") || "—"}</td>
                    <td>{r.noDispositivo ?? "—"}</td>
                    <td><EstadoChip estado={r.estado} /></td>
                  </tr>
                ))}
                {!loading && filtrados.length === 0 && (
                  <tr><td colSpan={7} style={{ color: "var(--muted)" }}>Sin registros en esta vista.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Expediente + acciones */}
        {selected && (
          <div className="panel">
            <p className="panel-title">Expediente · {selected.folio}</p>

            {feedback && <p className="catalog-feedback catalog-feedback--ok">{feedback}</p>}
            {error && <p className="submit-error">{error}</p>}

            <div className="detail-grid" style={{ marginBottom: 16 }}>
              <div><div className="k">Conductor (usa el vehículo)</div><div className="v">{selected.usuarioNombre}</div></div>
              <div><div className="k">Gestionante (paga y firma)</div><div className="v">{selected.gestionanteNombre ?? "el mismo conductor"}</div></div>
              <div><div className="k">Tipo</div><div className="v" style={{ textTransform: "capitalize" }}>{selected.tipoUsuario}</div></div>
              <div><div className="k">Vehículo</div><div className="v">{selected.marca} {selected.modelo} · {selected.color}</div></div>
              <div><div className="k">Placas</div><div className="v">{selected.placas ?? (selected.sinPlacas ? "Sin placas (permiso/nuevo)" : "—")}</div></div>
              <div><div className="k">Procedencia TAG</div><div className="v" style={{ textTransform: "capitalize" }}>{selected.procedenciaTag}</div></div>
              <div><div className="k">Estacionamiento</div><div className="v">{selected.estacionamientos.join(" + ") || "Sin asignar"}</div></div>
              <div><div className="k">No. de TAG</div><div className="v">{selected.noDispositivo ?? "Sin instalar"}</div></div>
              <div><div className="k">Estado</div><div className="v"><EstadoChip estado={selected.estado} /></div></div>
              <div><div className="k">Pagos</div><div className="v">{selected.pagos.length ? `$${selected.pagos.reduce((a, p) => a + p.monto, 0)} (${selected.pagos.length})` : "Sin pago"}</div></div>
            </div>

            {/* ---- Acciones de ADMINISTRACIÓN ---- */}
            {vista === "admin" && (
              <>
                <div className="panel">
                  <p className="panel-title">Asignar estacionamiento</p>
                  <div className="chip-row" style={{ marginBottom: 12 }}>
                    {["E1", "E2"].map((c) => (
                      <button key={c} className={`select-chip ${estSel.includes(c) ? "on" : ""}`} onClick={() => toggleEst(c)}>{c}</button>
                    ))}
                  </div>
                  <button className="primary-action" disabled={busy} onClick={() => run(() => asignarEstacionamiento(selected.id, estSel), "Estacionamiento asignado.")}>
                    Guardar acceso
                  </button>
                </div>
                <div className="panel">
                  <p className="panel-title">Registrar pago ($100, efectivo)</p>
                  <div className="grid-2">
                    <div className="field"><span>Monto</span><input className="input" value={monto} onChange={(e) => setMonto(e.target.value)} /></div>
                    <div className="field"><span>Cobrado por</span><input className="input" value={cobradoPor} onChange={(e) => setCobradoPor(e.target.value)} placeholder="Nombre del cajero" /></div>
                  </div>
                  <div className="field"><span>Folio de recibo (opcional)</span><input className="input" value={pagoFolio} onChange={(e) => setPagoFolio(e.target.value)} /></div>
                  <button className="primary-action" disabled={busy} onClick={() => run(() => registrarPago(selected.id, { monto: Number(monto) || 0, cobradoPor, folio: pagoFolio }), "Pago registrado.")}>
                    Registrar pago
                  </button>
                </div>
              </>
            )}

            {/* ---- Acciones de TI ---- */}
            {vista === "ti" && (
              <>
                <div className="panel">
                  <p className="panel-title">Instalar y activar TAG</p>
                  <div className="grid-2">
                    <div className="field"><span>No. de TAG (6–11 dígitos)</span><input className="input" value={tagNum} onChange={(e) => setTagNum(e.target.value)} placeholder="Ej. 9426780" /></div>
                    <div className="field"><span>Instalado por</span><input className="input" value={tiNombre} onChange={(e) => setTiNombre(e.target.value)} placeholder="Nombre de TI" /></div>
                  </div>
                  <button className="primary-action" disabled={busy} onClick={() => run(() => instalarTag(selected.id, tagNum, tiNombre), "TAG instalado y activado.")}>
                    Instalar y activar
                  </button>
                </div>
                <div className="panel">
                  <p className="panel-title">Reposición de TAG</p>
                  <div className="grid-2">
                    <div className="field"><span>Nuevo No. de TAG</span><input className="input" value={repoNum} onChange={(e) => setRepoNum(e.target.value)} /></div>
                    <div className="field"><span>Motivo</span><input className="input" value={repoMotivo} onChange={(e) => setRepoMotivo(e.target.value)} placeholder="Ej. daño, pérdida" /></div>
                  </div>
                  <button className="ghost-action" disabled={busy || !selected.noDispositivo} onClick={() => setConfirm({
                    title: "Reposición de TAG",
                    message: `Se reemplazará el TAG actual (${selected.noDispositivo}) por ${repoNum || "el nuevo número"} y el anterior quedará inactivo. ¿Continuar?`,
                    confirmLabel: "Reponer", danger: true,
                    action: () => reponerTag(selected.id, repoNum, repoMotivo, tiNombre),
                    ok: "Reposición registrada (inactiva el anterior).",
                  })}>
                    Reponer (inactiva el anterior)
                  </button>
                </div>
                <div className="panel">
                  <p className="panel-title">Dar de baja</p>
                  <div className="field"><span>Motivo de baja</span><input className="input" value={bajaMotivo} onChange={(e) => setBajaMotivo(e.target.value)} placeholder="Ej. egreso, cambio de vehículo" /></div>
                  <button className="ghost-action" disabled={busy || selected.estado === "baja"} onClick={() => setConfirm({
                    title: "Dar de baja",
                    message: `Se dará de baja el registro ${selected.folio} y su TAG quedará inactivo. ¿Continuar?`,
                    confirmLabel: "Dar de baja", danger: true,
                    action: () => darBaja(selected.id, bajaMotivo, tiNombre),
                    ok: "Registro dado de baja.",
                  })}>
                    Dar de baja
                  </button>
                </div>
              </>
            )}

            {vista === "consulta" && <p className="notice">Vista de solo consulta. Cambia a <strong>Administración</strong> o <strong>TI</strong> para ejecutar acciones.</p>}

            {/* Bitácora */}
            {selected.movimientos.length > 0 && (
              <div className="panel" style={{ marginBottom: 0 }}>
                <p className="panel-title">Bitácora</p>
                <div className="table-wrap">
                  <table className="admin-table">
                    <thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Por</th></tr></thead>
                    <tbody>
                      {selected.movimientos.map((m, i) => (
                        <tr key={i}><td>{m.fecha}</td><td style={{ textTransform: "capitalize" }}>{m.tipo}</td><td>{m.motivo ?? "—"}</td><td>{m.hechoPor ?? "—"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
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
      </div>
    </main>
  );
}
