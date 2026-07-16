"use client";

import { useEffect, useMemo, useState } from "react";
import type { Registro } from "@/lib/mock/types";
import { listRegistros, nombreDesdeEmail } from "@/lib/supabase/apiPanel";
import type { RolPanel } from "@/lib/supabase/auth";
import Loader from "@/components/Loader";
import EstadoChip from "@/components/admin/EstadoChip";
import VistaAdmin from "@/components/admin/VistaAdmin";
import VistaTi from "@/components/admin/VistaTi";

type Vista = "admin" | "ti" | "consulta";

// La primera pestaña es la vista inicial de cada rol. Super conserva las tres
// para poder recorrer todo el flujo con una misma sesión de pruebas.
const TABS_POR_ROL: Record<RolPanel, Vista[]> = {
  admin: ["admin", "consulta"],
  ti: ["ti"],
  consulta: ["consulta"],
  super: ["admin", "ti", "consulta"],
};

const ETIQUETA_VISTA: Record<Vista, string> = {
  admin: "Administración",
  ti: "TI",
  consulta: "Consulta",
};

const ETIQUETA_ROL: Record<RolPanel, string> = {
  admin: "Administración",
  ti: "TI",
  consulta: "Consulta",
  super: "Super",
};

export default function AdminPanel({ adminEmail, rol, onSignOut }: {
  adminEmail: string;
  rol: RolPanel;
  onSignOut: () => void;
}) {
  const vistasPermitidas = TABS_POR_ROL[rol];
  const [vista, setVista] = useState<Vista>(vistasPermitidas[0]);
  const nombreSesion = nombreDesdeEmail(adminEmail);

  useEffect(() => {
    if (!vistasPermitidas.includes(vista)) setVista(vistasPermitidas[0]);
    // vistasPermitidas se deriva de rol; incluir el arreglo recreado haría que
    // este efecto corriera en cada render sin aportar una validación distinta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rol, vista]);

  return (
    <main className="admin-shell">
      <div className="admin-panel">
        <div className="admin-header">
          <div>
            <h1>Panel de gestión de TAG</h1>
            <div className="admin-sub">Administración y TI · IAQ</div>
          </div>
          <div className="admin-header-actions">
            {vistasPermitidas.length > 1 && (
              <div className="admin-tabs" aria-label="Vistas del panel">
                {vistasPermitidas.map((v) => (
                  <button key={v} type="button"
                    className={`admin-tab ${vista === v ? "admin-tab--active" : ""}`}
                    aria-pressed={vista === v} onClick={() => setVista(v)}>
                    {ETIQUETA_VISTA[v]}
                  </button>
                ))}
              </div>
            )}
            <span className="admin-whoami">
              {adminEmail} · {ETIQUETA_ROL[rol]} ·{" "}
              <button type="button" className="link-action" onClick={onSignOut}>Salir</button>
            </span>
          </div>
        </div>

        {vista === "admin" && <VistaAdmin nombreSesion={nombreSesion} />}
        {vista === "ti" && <VistaTi nombreSesion={nombreSesion} />}
        {vista === "consulta" && <VistaConsulta />}
      </div>
    </main>
  );
}

// Consulta mantiene la tabla densa de escritorio: aquí no hay acciones de
// campo, y comparar muchos expedientes a la vez sí aporta valor.
function VistaConsulta() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return registros;
    return registros.filter((r) =>
      [r.usuarioNombre, r.gestionanteNombre ?? "", r.placas ?? "", r.noDispositivo ?? "", r.folio, r.marca, r.modelo]
        .join(" ").toLowerCase().includes(q));
  }, [query, registros]);

  const selected = useMemo(
    () => registros.find((r) => r.id === selectedId) ?? null,
    [registros, selectedId],
  );

  const metrics = useMemo(() => ({
    total: registros.length,
    pendientes: registros.filter((r) => r.estado === "pendiente").length,
    activos: registros.filter((r) => r.estado === "activo").length,
  }), [registros]);

  if (loading && registros.length === 0) return <Loader label="Cargando registros…" />;

  if (loadError && registros.length === 0) {
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
        <div className={`metric-card metric-card--${metrics.pendientes === 0 ? "ok" : metrics.pendientes <= 4 ? "warn" : "alert"}`}>
          <span className="metric-label">Pendientes</span>
          <span className="metric-value">{metrics.pendientes}</span>
        </div>
        <div className="metric-card"><span className="metric-label">Registros</span><span className="metric-value">{metrics.total}</span></div>
        <div className="metric-card"><span className="metric-label">Activos</span><span className="metric-value">{metrics.activos}</span></div>
      </div>

      <div className="toolbar">
        <input className="input search" type="search" placeholder="Buscar por nombre, placa, No. de TAG o folio…"
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="panel">
        <p className="panel-title">{query.trim() ? "Resultados de búsqueda" : "Todos los registros"} ({filtrados.length})</p>
        {loadError && (
          <p className="submit-error" role="alert">
            {loadError}{" "}
            <button type="button" className="link-action" onClick={() => refresh()}>Reintentar</button>
          </p>
        )}
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Folio</th><th>Conductor</th><th>Placas</th><th>Tipo</th><th>Estac.</th><th>No. TAG</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {filtrados.map((r) => (
                <tr key={r.id} className={`selectable ${r.id === selectedId ? "is-selected" : ""} ${r.sinPlacas ? "sin-placas" : ""}`}
                  onClick={() => setSelectedId((actual) => actual === r.id ? null : r.id)}>
                  <td>{r.folio}</td>
                  <td>{r.usuarioNombre}</td>
                  <td>{r.placas ?? (r.sinPlacas ? "— sin placas" : "—")}</td>
                  <td style={{ textTransform: "capitalize" }}>{r.tipoUsuario}</td>
                  <td>{r.estacionamientos.join(" + ") || "—"}</td>
                  <td>{r.noDispositivo ?? "—"}</td>
                  <td><EstadoChip estado={r.estado} /></td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr><td colSpan={7} style={{ color: "var(--muted)" }}>Sin registros en esta vista.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="panel">
          <p className="panel-title">Expediente · {selected.folio}</p>
          <div className="detail-grid" style={{ marginBottom: 16 }}>
            <div><div className="k">Conductor (usa el vehículo)</div><div className="v">{selected.usuarioNombre}</div></div>
            <div><div className="k">Gestionante (paga y firma)</div><div className="v">{selected.gestionanteNombre ?? "El mismo conductor"}</div></div>
            <div><div className="k">Tipo</div><div className="v" style={{ textTransform: "capitalize" }}>{selected.tipoUsuario}</div></div>
            <div><div className="k">Vehículo</div><div className="v">{selected.marca} {selected.modelo} · {selected.color}</div></div>
            <div><div className="k">Placas</div><div className="v">{selected.placas ?? (selected.sinPlacas ? "Sin placas (permiso/nuevo)" : "—")}</div></div>
            <div><div className="k">Procedencia TAG</div><div className="v" style={{ textTransform: "capitalize" }}>{selected.procedenciaTag}</div></div>
            <div><div className="k">Estacionamiento</div><div className="v">{selected.estacionamientos.join(" + ") || "Sin asignar"}</div></div>
            <div><div className="k">No. de TAG</div><div className="v">{selected.noDispositivo ?? "Sin instalar"}</div></div>
            <div><div className="k">Estado</div><div className="v"><EstadoChip estado={selected.estado} /></div></div>
            <div><div className="k">Pagos</div><div className="v">{selected.pagos.length ? `$${selected.pagos.reduce((a, p) => a + p.monto, 0)} (${selected.pagos.length})` : "Sin pago"}</div></div>
          </div>

          <p className="notice">Vista de solo consulta. Las acciones se ejecutan desde Administración o TI, según corresponda.</p>

          {selected.movimientos.length > 0 && (
            <div className="panel" style={{ marginBottom: 0 }}>
              <p className="panel-title">Bitácora</p>
              <div className="table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Por</th></tr></thead>
                  <tbody>
                    {selected.movimientos.map((m, i) => (
                      <tr key={`${m.fecha}-${m.tipo}-${i}`}>
                        <td>{m.fecha}</td>
                        <td style={{ textTransform: "capitalize" }}>{m.tipo}</td>
                        <td>{m.motivo ?? "—"}</td>
                        <td>{m.hechoPor ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
