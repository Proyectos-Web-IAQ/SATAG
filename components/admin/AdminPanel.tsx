"use client";

import { useEffect, useMemo, useState } from "react";
import type { Registro } from "@/lib/mock/types";
import { listRegistros, nombreDesdeEmail } from "@/lib/supabase/apiPanel";
import type { RolPanel } from "@/lib/supabase/auth";
import Loader from "@/components/Loader";
import VistaAdmin from "@/components/admin/VistaAdmin";
import VistaTi from "@/components/admin/VistaTi";
import { DetalleRegistro, TarjetaRegistro } from "@/components/admin/RegistroCard";

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

// Consulta comparte el patrón de tarjetas expandibles de Administración y TI,
// en modo solo lectura: sin acciones ni formularios. Al abrir una tarjeta se ve
// el expediente y, cuando existe, la bitácora completa del registro.
function VistaConsulta() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [query, setQuery] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
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

  const q = query.trim().toLowerCase();
  const filtrados = useMemo(() => {
    if (!q) return registros;
    return registros.filter((r) =>
      [r.usuarioNombre, r.gestionanteNombre ?? "", r.placas ?? "", r.noDispositivo ?? "", r.folio, r.marca, r.modelo]
        .join(" ").toLowerCase().includes(q));
  }, [q, registros]);

  const metrics = useMemo(() => ({
    total: registros.length,
    pendientes: registros.filter((r) => r.estado === "pendiente").length,
    activos: registros.filter((r) => r.estado === "activo").length,
  }), [registros]);

  const toggleSel = (id: string) => setSelId((cur) => (cur === id ? null : id));

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

      <div className="panel">
        <p className="panel-title">Padrón completo ({filtrados.length})</p>
        <input className="input search" type="search" placeholder="Buscar por nombre, placa, No. de TAG o folio…"
          value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 12 }} />
        <p className="ti-hint">Vista de solo consulta: las acciones se ejecutan desde Administración o TI, según corresponda.</p>
        {loadError && (
          <p className="submit-error" role="alert">
            {loadError}{" "}
            <button type="button" className="link-action" onClick={() => refresh()}>Reintentar</button>
          </p>
        )}
        <div className="ti-cards">
          {filtrados.map((r) => (
            <TarjetaRegistro key={r.id} r={r} abierto={selId === r.id} onToggle={() => toggleSel(r.id)}>
              <DetalleRegistro r={r} />
              <BitacoraConsulta r={r} />
            </TarjetaRegistro>
          ))}
          {filtrados.length === 0 && (
            <p className="ti-hint">{q ? `Sin resultados para «${query}».` : "Aún no hay registros en el padrón."}</p>
          )}
        </div>
      </div>
    </>
  );
}

// Bitácora del registro dentro de la tarjeta de Consulta. Es el dato extra que
// Consulta sí muestra y las pantallas de acción (Admin/TI) no necesitan: aquí
// se investiga el historial, allá se opera.
function BitacoraConsulta({ r }: { r: Registro }) {
  if (r.movimientos.length === 0) return null;
  return (
    <div className="consulta-bitacora">
      <p className="ti-section-title">Bitácora</p>
      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Por</th></tr></thead>
          <tbody>
            {r.movimientos.map((m, i) => (
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
  );
}
