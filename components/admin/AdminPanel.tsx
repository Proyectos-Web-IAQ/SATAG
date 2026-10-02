"use client";

import { useEffect, useMemo, useState } from "react";
import type { EstadoRegistro, Registro, RegistroIncompleto } from "@/lib/mock/types";
import { listRegistros, listRegistrosIncompletos, nombreDesdeEmail } from "@/lib/supabase/apiPanel";
import type { RolPanel } from "@/lib/supabase/auth";
import Loader from "@/components/Loader";
import VistaAdmin from "@/components/admin/VistaAdmin";
import VistaTi from "@/components/admin/VistaTi";
import VistaFinanzas from "@/components/admin/VistaFinanzas";
import ListaIncompletos from "@/components/admin/Incompletos";
import PanelInstalacion from "@/components/admin/PanelInstalacion";
import VistaEstacionamiento, { type VistaEstac } from "@/components/admin/VistaEstacionamiento";
import FichaPersona from "@/components/admin/FichaPersona";
import LadoVistas, { type GrupoLado } from "@/components/admin/LadoVistas";

type Vista = "admin" | "ti" | "finanzas" | "consulta";

// Las pestañas son las de TRABAJO (Administración cobra, TI instala, Finanzas
// corta) más UNA de consulta. Desde el 2-oct Consulta reúne lo que antes eran
// tres pestañas —el padrón con la ficha de cada persona, el Estacionamiento y el
// Tablero de instalación— porque las tres son lectura para decidir, no para
// operar, y seis pestañas arriba eran demasiadas para encontrar una. Dentro, cada
// rol ve las secciones que su RLS le deja leer.
//
// La primera pestaña es la vista inicial de cada rol. Super conserva todas para
// poder recorrer el flujo con una misma sesión de pruebas. Finanzas la ven
// Administración, el contador y super, igual que la RLS de cortes_caja desde el
// bloque 74; el contador es además el único que puede cerrar el corte.
const TABS_POR_ROL: Record<RolPanel, Vista[]> = {
  admin: ["admin", "finanzas", "consulta"],
  // TI entra por su pestaña de trabajo; en Consulta ve el Estacionamiento y el
  // Tablero (29-sep: son quienes instalan y quienes salen medidos ahí) y, desde el
  // 2-oct, la ficha de cada persona con sus pasos por la pluma.
  ti: ["ti", "consulta"],
  consulta: ["consulta"],
  // L2-02: el contador entra por el dinero. Finanzas primero, porque es su
  // trabajo —es el unico que cierra el corte desde el bloque 74— y Consulta
  // porque un corte se concilia contra expedientes: sin el padron, un cobro es
  // un monto sin dueno. NO lleva la pestana de Administracion: no cobra.
  contador: ["finanzas", "consulta"],
  super: ["admin", "ti", "finanzas", "consulta"],
};

const ETIQUETA_VISTA: Record<Vista, string> = {
  admin: "Administración",
  ti: "TI",
  finanzas: "Finanzas",
  consulta: "Consulta",
};

/**
 * Las vistas de Consulta, agrupadas como en la barra lateral del esqueleto que
 * Gerardo aprobó (DISEÑO.md): Consulta, Estacionamiento y Datos. Cada rol ve las
 * suyas: todos la ficha de personas; quienes miden (TI, Contabilidad, super) el
 * estacionamiento y el tablero; y solo quienes cargan (TI, super) los archivos de
 * ZK, que son trabajo y no lectura.
 */
function gruposDe(rol: RolPanel): GrupoLado[] {
  const mide = rol === "ti" || rol === "contador" || rol === "super";
  const carga = rol === "ti" || rol === "super";
  const grupos: GrupoLado[] = [
    {
      titulo: "Consulta",
      vistas: [
        { clave: "personas", titulo: "Personas" },
        ...(mide ? [{ clave: "tablero", titulo: "Tablero de instalación" }] : []),
      ],
    },
  ];
  if (mide) {
    grupos.push({
      titulo: "Estacionamiento",
      vistas: [
        { clave: "resumen", titulo: "Resumen" },
        { clave: "lotes", titulo: "Estacionamientos" },
        { clave: "secciones", titulo: "Secciones" },
        { clave: "plano", titulo: "Plano del plantel" },
        { clave: "vialidad", titulo: "Vialidad", nota: "beta" },
      ],
    });
  }
  if (carga) grupos.push({ titulo: "Datos", vistas: [{ clave: "archivos", titulo: "Archivos de ZK" }] });
  return grupos;
}
// La vista elegida sobrevive a salir y volver a la pestaña.
let ultimaVistaConsulta: string | null = null;

const ETIQUETA_ROL: Record<RolPanel, string> = {
  admin: "Administración",
  ti: "TI",
  consulta: "Consulta",
  contador: "Contabilidad",
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

        {vista === "admin" && <VistaAdmin nombreSesion={nombreSesion} rol={rol} />}
        {vista === "ti" && <VistaTi nombreSesion={nombreSesion} rol={rol} />}
        {vista === "finanzas" && <VistaFinanzas nombreSesion={nombreSesion} />}
        {vista === "consulta" && <Consulta rol={rol} email={adminEmail} />}
      </div>
    </main>
  );
}

/**
 * La pestaña de consulta: la barra lateral de vistas a la izquierda y, al lado, la
 * vista elegida en una columna de lectura. Es el esqueleto que Gerardo aprobó el
 * 2-oct (estilo Things): UNA lista de vistas en vez de tres niveles de pestañas
 * (las del panel, el segmentado de Consulta y las del Estacionamiento). Quien solo
 * tiene una vista no ve barra. Las vistas del estacionamiento comparten el mismo
 * contenedor, así que cambiar entre ellas no vuelve a bajar la bitácora.
 */
function Consulta({ rol, email }: { rol: RolPanel; email: string }) {
  const grupos = useMemo(() => gruposDe(rol), [rol]);
  const claves = grupos.flatMap((g) => g.vistas.map((v) => v.clave));
  // Se abre en el Resumen del estacionamiento, que es la noticia (Gerardo, 2-oct);
  // quien no lo ve abre en la primera vista que tenga. Al volver, en la última.
  const inicial = claves.includes("resumen") ? "resumen" : claves[0];
  const [vista, setVista] = useState<string>(
    ultimaVistaConsulta !== null && claves.includes(ultimaVistaConsulta) ? ultimaVistaConsulta : inicial,
  );
  const elegir = (v: string) => {
    ultimaVistaConsulta = v;
    setVista(v);
  };
  const contenido =
    vista === "personas" ? <VistaConsulta rol={rol} />
    : vista === "tablero" ? <PanelInstalacion rol={rol} email={email} />
    : <VistaEstacionamiento rol={rol} email={email} vista={vista as VistaEstac} />;
  if (claves.length === 1) return contenido;
  return (
    <div className="consulta">
      <LadoVistas
        grupos={grupos}
        activa={vista}
        onCambio={elegir}
        nota="Vista de solo consulta: las acciones se ejecutan desde Administración o TI, según corresponda."
      />
      <div className="consulta__col">{contenido}</div>
    </div>
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

// Consulta es la lista del padrón que se abre a la ficha de una persona
// (DISEÑO.md §3.4): buscador y filtros rápidos arriba, la lista a un lado y la
// ficha al otro, en modo solo lectura. Desde octubre de 2026 la ficha junta lo
// que antes estaba repartido —expediente, TAGs, vehículo, bitácora y los pasos
// por la pluma— y lo que no cuadra lo dice en una columna aparte.
function VistaConsulta({ rol }: { rol: RolPanel }) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  // CC-02: el reporte de incompletos vive aquí porque Consulta es la vista de
  // investigación del padrón. TI lo tiene también en su propia pantalla: es
  // quien resuelve cinco de los siete motivos y no ve esta pestaña.
  const [incompletos, setIncompletos] = useState<RegistroIncompleto[]>([]);
  const [verIncompletos, setVerIncompletos] = useState(false);
  const [query, setQuery] = useState("");
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
      const [list, incompletosList] = await Promise.all([
        listRegistros(),
        listRegistrosIncompletos(),
      ]);
      setRegistros(list);
      setIncompletos(incompletosList);
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
      {/* Las cifras del padrón en una línea, no en tarjetas: son contexto, no el
          hallazgo. Lo que pide acción está en el reporte de incompletos de abajo. */}
      <p className="ficha__cifras" style={{ margin: "0 0 14px" }}>
        <span>Expedientes <b>{metrics.total.toLocaleString("es-MX")}</b></span>
        <span>Activos <b>{metrics.activos.toLocaleString("es-MX")}</b></span>
        <span>Pendientes de cobro <b>{metrics.pendientes}</b></span>
        <span>Incompletos <b>{incompletos.length}</b></span>
      </p>

      {/* CC-02: arranca colapsado. El reporte se consulta cuando se busca, no
          es lo primero que hay que leer al abrir Consulta. */}
      <div className="panel">
        <div className="filtros-toolbar" style={{ justifyContent: "space-between" }}>
          <p className="panel-title" style={{ margin: 0 }}>Expedientes incompletos ({incompletos.length})</p>
          <button type="button" className="filtros-toggle" aria-expanded={verIncompletos}
            onClick={() => setVerIncompletos((v) => !v)}>
            {verIncompletos ? "Ocultar" : "Ver el reporte"}
            <span aria-hidden="true">{verIncompletos ? "▴" : "▾"}</span>
          </button>
        </div>
        {verIncompletos && (
          <>
            <p className="ti-hint">
              Expedientes a los que les falta algo para operar, con el motivo y quién lo resuelve.
              Es un reporte de sólo lectura: la corrección se hace desde Administración o TI,
              según corresponda.
            </p>
            <ListaIncompletos items={incompletos}
              vacio="No hay expedientes incompletos. El padrón está completo." />
          </>
        )}
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
        <FichaPersona
          registros={filtrados}
          todos={registros}
          rol={rol}
          vacio={q || hayFiltros ? "Sin resultados con los filtros actuales." : "Aún no hay registros en el padrón."}
        />
      </div>
    </>
  );
}
