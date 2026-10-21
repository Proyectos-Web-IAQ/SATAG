"use client";

import { useEffect, useMemo, useState } from "react";
import type { EstadoRegistro, Registro, RegistroIncompleto } from "@/lib/mock/types";
import { listPadronZkConsulta, listRegistros, listRegistrosIncompletos, nombreDesdeEmail, type PersonaZkConsulta } from "@/lib/supabase/apiPanel";
import { normalizarBusqueda } from "@/lib/buscarPersona";
import type { RolPanel } from "@/lib/supabase/auth";
import Loader from "@/components/Loader";
import VistaAdmin from "@/components/admin/VistaAdmin";
import VistaTi from "@/components/admin/VistaTi";
import VistaFinanzas from "@/components/admin/VistaFinanzas";
import ListaIncompletos from "@/components/admin/Incompletos";
import PanelInstalacion from "@/components/admin/PanelInstalacion";
import VistaEstacionamiento, { type VistaEstac } from "@/components/admin/VistaEstacionamiento";
import VistaGes from "@/components/admin/VistaGes";
import VistaMovimientosZk from "@/components/admin/VistaMovimientosZk";
import TableroCasos from "@/components/admin/casos/TableroCasos";
import FichaPersona, { type SinExpediente } from "@/components/admin/FichaPersona";
import LadoVistas, { type GrupoLado } from "@/components/admin/LadoVistas";
import VistaCaseta from "@/components/admin/VistaCaseta";
import AperturasCaseta from "@/components/admin/AperturasCaseta";
import ReportesCaseta from "@/components/admin/ReportesCaseta";
import { ESTADO_EXPEDIENTE, ROTULO } from "@/lib/glosario";

type Vista = "admin" | "ti" | "finanzas" | "consulta" | "caseta";

// Las vistas de Consulta que pinta VistaEstacionamiento. Lista BLANCA: una clave
// que no este aqui no cae al estacionamiento por descarte (14-oct, rol portero).
const VISTAS_ESTAC: VistaEstac[] = ["resumen", "lotes", "secciones", "casos", "lecturas", "plano", "vialidad", "archivos"];

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
  ti: ["ti", "consulta", "caseta"],
  consulta: ["consulta"],
  // L2-02: el contador entra por el dinero. Finanzas primero, porque es su
  // trabajo —es el unico que cierra el corte desde el bloque 74— y Consulta
  // porque un corte se concilia contra expedientes: sin el padron, un cobro es
  // un monto sin dueno. NO lleva la pestana de Administracion: no cobra.
  contador: ["finanzas", "consulta"],
  super: ["admin", "ti", "finanzas", "consulta", "caseta"],
  // Bloque 97 (Gerardo, 14-oct): el portero solo ve la caseta. TI la ve tambien,
  // para saber que le aparece al portero; probarla con ti o super NO prueba los
  // permisos del portero, que entra sin MFA y con otra guardia.
  portero: ["caseta"],
};

const ETIQUETA_VISTA: Record<Vista, string> = {
  admin: "Administración",
  ti: "TI",
  finanzas: "Finanzas",
  consulta: "Consulta",
  caseta: "Caseta",
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
        // Administracion abre y sigue casos (bloque 89, Gerardo 6-oct) pero no lee la
        // bitacora de ZK: ve Casos aqui, sin los detectados, y no el grupo Estacionamiento.
        ...(rol === "admin" ? [{ clave: "casos", titulo: "Casos" }, { clave: "reportes-caseta", titulo: "Caseta: reportes y avisos" }, { clave: "aperturas", titulo: "Aperturas con botón" }] : []),
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
        { clave: "casos", titulo: "Casos" },
        // 21-oct: lo que reporto la caseta y en que va, como lo ve el portero.
        { clave: "reportes-caseta", titulo: "Caseta: reportes y avisos" },
        // Bloque 97: lo que la caseta abrio con el boton, por vehiculo.
        { clave: "aperturas", titulo: "Aperturas con botón" },
        // 9-oct: que TAG leyo cada pluma a cierta hora, para encontrar casos.
        { clave: "lecturas", titulo: "Lecturas por hora" },
        { clave: "plano", titulo: "Plano del plantel" },
        { clave: "vialidad", titulo: "Vialidad", nota: "beta" },
      ],
    });
  }
  if (carga) {
    grupos.push({
      titulo: "Datos",
      vistas: [
        { clave: "archivos", titulo: "Archivos de ZK" },
        // Bloque 92: quien es cada persona y si sigue en el colegio.
        { clave: "ges", titulo: "Archivos de GES" },
        // Bloque 93: lo que los casos piden hacer en ZK, en tandas, y su comprobacion.
        { clave: "movimientos", titulo: "Movimientos en ZK" },
      ],
    });
  }
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
  portero: "Caseta",
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

  // La caseta es una Chromebook compartida por turnos (Gerardo, 14-oct): la sesion
  // no se cierra sola, asi que quien esta en turno se ve siempre arriba y salir se
  // llama «Cambiar de turno».
  if (rol === "portero") {
    return (
      <main className="admin-shell admin-shell--caseta">
        <VistaCaseta nombreSesion={nombreSesion} onCambiarTurno={onSignOut} />
      </main>
    );
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
        {vista === "caseta" && <VistaCaseta nombreSesion={nombreSesion} />}
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
    : vista === "ges" ? <VistaGes email={email} />
    : vista === "movimientos" ? <VistaMovimientosZk email={email} onIr={elegir} />
    : vista === "casos" && rol === "admin" ? <TableroCasos rol={rol} email={email} eventos={null} ventana={{ desde: null, hasta: null }} personas={null} />
    : vista === "aperturas" ? <AperturasCaseta rol={rol} email={email} />
    : vista === "reportes-caseta" ? <ReportesCaseta rol={rol} email={email} onIr={elegir} />
    : (VISTAS_ESTAC as string[]).includes(vista) ? <VistaEstacionamiento rol={rol} email={email} vista={vista as VistaEstac} />
    : null;
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

// Orden de presentación de los estados en el filtro de Consulta; la etiqueta
// es la de lib/glosario.ts (ESTADO_EXPEDIENTE).
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

// Quien lee el padron de ZK y la bitacora (RLS de los bloques 78 y 83).
const LEEN_ZK: RolPanel[] = ["ti", "contador", "super"];

/** Placa sin espacios ni guiones, para que «UKL-661-F» encuentre «UKL661F». */
const placaCompacta = (p: string | null | undefined) => (p ?? "").replace(/[^0-9A-Za-z]/g, "").toLowerCase();

/** Todas las palabras de la busqueda aparecen, sin importar acentos, mayusculas ni orden. */
function coincide(partes: (string | null | undefined)[], placas: (string | null | undefined)[], q: string): boolean {
  const t = normalizarBusqueda(q);
  if (!t) return true;
  const indice = `${normalizarBusqueda(partes.filter(Boolean).join(" "))} ${placas.map(placaCompacta).join(" ")}`;
  return t.split(" ").every((p) => indice.includes(p)) || placas.some((p) => p && placaCompacta(p) === placaCompacta(q));
}

/** Los TAGs que ya tienen dueño en SATAG: el vigente, el apartado y los que tuvo antes. */
function tagsConExpediente(registros: Registro[]): Set<string> {
  const s = new Set<string>();
  for (const r of registros) {
    if (r.noDispositivo) s.add(r.noDispositivo);
    if (r.tagApartadoNo) s.add(r.tagApartadoNo);
    for (const m of r.movimientos) if (m.noDispositivoAnterior) s.add(m.noDispositivoAnterior);
  }
  return s;
}

// Consulta es la lista del padrón que se abre a la ficha de una persona
// (DISEÑO.md §3.4): buscador y filtros rápidos arriba, la lista a un lado y la
// ficha al otro, en modo solo lectura. Desde octubre de 2026 la ficha junta lo
// que antes estaba repartido —expediente, TAGs, vehículo, bitácora y los pasos
// por la pluma— y lo que no cuadra lo dice en una columna aparte.
//
// Desde el 16-oct también lista a quien NO tiene expediente (Gerardo: «quiero
// tener todos los registros aunque estén incompletos»): quien tiene TAG en ZK y
// nada en SATAG, y un TAG buscado por número que solo aparece en la bitácora.
function VistaConsulta({ rol }: { rol: RolPanel }) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [padronZk, setPadronZk] = useState<PersonaZkConsulta[]>([]);
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

  // Sin el padron de ZK, Personas sigue con los expedientes: no es motivo de error.
  useEffect(() => {
    if (!LEEN_ZK.includes(rol)) return;
    let vivo = true;
    listPadronZkConsulta().then((zk) => vivo && setPadronZk(zk)).catch(() => {});
    return () => { vivo = false; };
  }, [rol]);

  const q = query.trim();
  const filtrados = useMemo(() => registros.filter((r) => {
    if (estados.length && !estados.includes(r.estado)) return false;
    if (soloSinPlacas && !r.sinPlacas) return false;
    if (tagFiltro === "con" && !r.noDispositivo) return false;
    if (tagFiltro === "sin" && r.noDispositivo) return false;
    if (estacs.length && !r.estacionamientos.some((e) => estacs.includes(e))) return false;
    if (q && !coincide([r.usuarioNombre, r.gestionanteNombre, r.noDispositivo, r.folio, r.marca, r.modelo, r.color], [r.placas], q)) return false;
    return true;
  }), [registros, estados, soloSinPlacas, tagFiltro, estacs, q]);

  // Quien no tiene expediente no tiene estado, plumas ni placas en SATAG: los
  // filtros de esas cosas lo dejan fuera. «Con TAG» no, porque si lo tiene.
  const conTags = useMemo(() => tagsConExpediente(registros), [registros]);
  const sinExpediente = useMemo<SinExpediente[]>(() => {
    if (estados.length || soloSinPlacas || estacs.length || tagFiltro === "sin") return [];
    const out: SinExpediente[] = padronZk
      .filter((p) => !conTags.has(p.tarjeta))
      .filter((p) => !q || coincide([p.nombre, p.tarjeta, p.departamento], [p.placa], q))
      .sort((a, b) => Number(b.vigente) - Number(a.vigente) || a.nombre.localeCompare(b.nombre, "es"))
      .map((p) => ({ tarjeta: p.tarjeta, zk: p }));
    // Un número de TAG que no es de nadie: su ficha muestra lo que leyó la pluma.
    const tag = q.replace(/\s/g, "");
    if (LEEN_ZK.includes(rol) && /^[0-9]{6,11}$/.test(tag) && !conTags.has(tag) && !padronZk.some((p) => p.tarjeta === tag)) {
      out.push({ tarjeta: tag, zk: null });
    }
    return out;
  }, [padronZk, conTags, q, estados, soloSinPlacas, estacs, tagFiltro, rol]);

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
    ...estados.map((e) => ({ label: ESTADO_EXPEDIENTE[e], quitar: () => setEstados((s) => s.filter((x) => x !== e)) })),
    ...(tagFiltro ? [{ label: tagFiltro === "con" ? "Con TAG" : "Sin TAG", quitar: () => setTagFiltro(null) }] : []),
    ...estacs.map((c) => ({ label: c, quitar: () => setEstacs((s) => s.filter((x) => x !== c)) })),
    ...(soloSinPlacas ? [{ label: ROTULO.sinPlacas, quitar: () => setSoloSinPlacas(false) }] : []),
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
        <p className="panel-title">Padrón completo ({(filtrados.length + sinExpediente.length).toLocaleString("es-MX")})</p>
        <input className="input search" type="search" placeholder="Buscar por nombre, placa, No. de TAG, folio o vehículo…"
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
                        onClick={() => setEstados((s) => alternar(s, e))}>{ESTADO_EXPEDIENTE[e]}</button>
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
                    onClick={() => setSoloSinPlacas((v) => !v)}>{ROTULO.sinPlacas}</button>
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
          sinExpediente={sinExpediente}
          todos={registros}
          rol={rol}
          vacio={q || hayFiltros ? "Sin resultados con los filtros actuales." : "Aún no hay registros en el padrón."}
        />
      </div>
    </>
  );
}
