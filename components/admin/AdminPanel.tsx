"use client";

import { useEffect, useMemo, useState } from "react";
import type { EstadoRegistro, Registro } from "@/lib/mock/types";
import { listRegistros, nombreDesdeEmail } from "@/lib/supabase/apiPanel";
import type { RolPanel } from "@/lib/supabase/auth";
import Loader from "@/components/Loader";
import VistaAdmin from "@/components/admin/VistaAdmin";
import VistaTi from "@/components/admin/VistaTi";
import VistaFinanzas from "@/components/admin/VistaFinanzas";
import { DetalleRegistro, TarjetaRegistro } from "@/components/admin/RegistroCard";

type Vista = "admin" | "ti" | "finanzas" | "consulta";

// La primera pestaña es la vista inicial de cada rol. Super conserva todas para
// poder recorrer el flujo con una misma sesión de pruebas. Finanzas es de
// Administración: solo admin y super la ven, igual que la RLS de cortes_caja.
const TABS_POR_ROL: Record<RolPanel, Vista[]> = {
  admin: ["admin", "finanzas", "consulta"],
  ti: ["ti"],
  consulta: ["consulta"],
  super: ["admin", "ti", "finanzas", "consulta"],
};

const ETIQUETA_VISTA: Record<Vista, string> = {
  admin: "Administración",
  ti: "TI",
  finanzas: "Finanzas",
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
        {vista === "finanzas" && <VistaFinanzas nombreSesion={nombreSesion} />}
        {vista === "consulta" && <VistaConsulta />}
      </div>
    </main>
  );
}

// Etiqueta y orden de presentación de los estados en el filtro de Consulta.
const ETIQUETA_ESTADO: Record<EstadoRegistro, string> = {
  pendiente: "Pendiente", activo: "Activo", bloqueado: "Bloqueado", baja: "Baja",
};
const ORDEN_ESTADO: EstadoRegistro[] = ["pendiente", "activo", "bloqueado", "baja"];

// Alterna un valor dentro de una lista (chips de filtro que se combinan).
function alternar<T>(lista: T[], valor: T): T[] {
  return lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor];
}

// Embudo para el botón "Filtros".
function IconoFiltro() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5h18l-7 8v6l-4-2v-4z" />
    </svg>
  );
}

// Consulta comparte el patrón de tarjetas expandibles de Administración y TI,
// en modo solo lectura: sin acciones ni formularios. Al abrir una tarjeta se ve
// el expediente y, cuando existe, la bitácora completa del registro. Arriba,
// filtros rápidos (estado, TAG, estacionamiento, sin placas) que se combinan
// entre sí y con el buscador de texto.
function VistaConsulta() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [query, setQuery] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Filtros rápidos: cada dimensión acota (AND entre dimensiones); dentro de
  // estado y estacionamiento, varias selecciones suman (OR).
  const [estados, setEstados] = useState<EstadoRegistro[]>([]);
  const [tagFiltro, setTagFiltro] = useState<"con" | "sin" | null>(null);
  const [estacs, setEstacs] = useState<string[]>([]);
  const [soloSinPlacas, setSoloSinPlacas] = useState(false);
  // La barra de filtros arranca colapsada: pantalla limpia para leer, y los
  // filtros activos quedan visibles como resumen aunque esté cerrada.
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

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
  const filtrados = useMemo(() => registros.filter((r) => {
    if (estados.length && !estados.includes(r.estado)) return false;
    if (soloSinPlacas && !r.sinPlacas) return false;
    if (tagFiltro === "con" && !r.noDispositivo) return false;
    if (tagFiltro === "sin" && r.noDispositivo) return false;
    if (estacs.length && !r.estacionamientos.some((e) => estacs.includes(e))) return false;
    if (q && ![r.usuarioNombre, r.gestionanteNombre ?? "", r.placas ?? "", r.noDispositivo ?? "", r.folio, r.marca, r.modelo]
      .join(" ").toLowerCase().includes(q)) return false;
    return true;
  }), [registros, estados, soloSinPlacas, tagFiltro, estacs, q]);

  // Opciones que se muestran: solo estados y estacionamientos presentes en el
  // padrón, para no ofrecer filtros que no devolverían nada.
  const estadosDisponibles = useMemo(() => {
    const presentes = new Set(registros.map((r) => r.estado));
    return ORDEN_ESTADO.filter((e) => presentes.has(e));
  }, [registros]);
  const estacDisponibles = useMemo(
    () => [...new Set(registros.flatMap((r) => r.estacionamientos))].sort(),
    [registros]);

  const hayFiltros = estados.length > 0 || soloSinPlacas || tagFiltro !== null || estacs.length > 0;
  const limpiar = () => { setEstados([]); setSoloSinPlacas(false); setTagFiltro(null); setEstacs([]); };

  // Resumen de filtros activos: cada píldora se quita por su cuenta cuando la
  // barra está colapsada. El contador del botón "Filtros" es su longitud.
  const activos: { label: string; quitar: () => void }[] = [
    ...estados.map((e) => ({ label: ETIQUETA_ESTADO[e], quitar: () => setEstados((s) => s.filter((x) => x !== e)) })),
    ...(tagFiltro ? [{ label: tagFiltro === "con" ? "Con TAG" : "Sin TAG", quitar: () => setTagFiltro(null) }] : []),
    ...estacs.map((c) => ({ label: c, quitar: () => setEstacs((s) => s.filter((x) => x !== c)) })),
    ...(soloSinPlacas ? [{ label: "Sin placas", quitar: () => setSoloSinPlacas(false) }] : []),
  ];

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

        <div className="consulta-filtros">
          <div className="filtros-toolbar">
            <button type="button" className="filtros-toggle" aria-expanded={filtrosAbiertos}
              onClick={() => setFiltrosAbiertos((v) => !v)}>
              <IconoFiltro />
              Filtros
              {activos.length > 0 && <span className="filtros-badge">{activos.length}</span>}
              <span aria-hidden="true">{filtrosAbiertos ? "▴" : "▾"}</span>
            </button>
            {!filtrosAbiertos && activos.map((f, i) => (
              <span key={i} className="filtro-activo">
                {f.label}
                <button type="button" aria-label={`Quitar filtro ${f.label}`} onClick={f.quitar}>×</button>
              </span>
            ))}
            {hayFiltros && (
              <button type="button" className="link-action" onClick={limpiar}>Limpiar</button>
            )}
          </div>

          {filtrosAbiertos && (
            <div className="filtros-bar">
              {estadosDisponibles.length > 0 && (
                <div className="filtro-grupo">
                  <span className="filtro-label">Estado</span>
                  <div className="chip-row">
                    {estadosDisponibles.map((e) => (
                      <button key={e} type="button" className={`select-chip ${estados.includes(e) ? "on" : ""}`}
                        onClick={() => setEstados((s) => alternar(s, e))}>{ETIQUETA_ESTADO[e]}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="filtro-grupo">
                <span className="filtro-label">TAG</span>
                <div className="chip-row">
                  <button type="button" className={`select-chip ${tagFiltro === "con" ? "on" : ""}`}
                    onClick={() => setTagFiltro((t) => (t === "con" ? null : "con"))}>Con TAG</button>
                  <button type="button" className={`select-chip ${tagFiltro === "sin" ? "on" : ""}`}
                    onClick={() => setTagFiltro((t) => (t === "sin" ? null : "sin"))}>Sin TAG</button>
                </div>
              </div>
              {estacDisponibles.length > 0 && (
                <div className="filtro-grupo">
                  <span className="filtro-label">Estacionamiento</span>
                  <div className="chip-row">
                    {estacDisponibles.map((c) => (
                      <button key={c} type="button" className={`select-chip ${estacs.includes(c) ? "on" : ""}`}
                        onClick={() => setEstacs((s) => alternar(s, c))}>{c}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="filtro-grupo">
                <span className="filtro-label">Vehículo</span>
                <div className="chip-row">
                  <button type="button" className={`select-chip ${soloSinPlacas ? "on" : ""}`}
                    onClick={() => setSoloSinPlacas((v) => !v)}>Sin placas</button>
                </div>
              </div>
            </div>
          )}
        </div>

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
            <p className="ti-hint">
              {q || hayFiltros ? "Sin resultados con los filtros actuales." : "Aún no hay registros en el padrón."}
            </p>
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
