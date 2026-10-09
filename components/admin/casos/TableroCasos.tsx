"use client";

// El tablero de casos (bloque 90; boceto A5 aprobado por Gerardo el 7-oct).
//
// POR QUE ASI. Con la lista agrupada por tipo, los 191 «TAG sin uso» que esperan
// hasta abril enterraban a los ~50 que piden trabajo hoy. Aqui las columnas dicen
// EN QUE PASO va cada caso —Nuevo, Por atender, Esperando, Cerrado— y el tipo es
// una etiqueta de color que TI edita «a conveniencia». Se mueve arrastrando o con
// botones, uno o varios a la vez; cerrar pide motivo; esperar dice a que.
//
// La evidencia de cada caso son graficas hechas con la bitacora de ZK que la
// pestana ya tiene en memoria: no hay consultas nuevas. Quien no lee la bitacora
// (Administracion) ve el caso sin graficas, y se le dice.
//
// Escriben ti, contador y admin (y super); los tipos, solo ti. La base lo vuelve a
// verificar en cada RPC: aqui solo se evita ofrecer un boton que fallaria.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RolPanel } from "@/lib/supabase/auth";
import type { EventoZk } from "@/lib/zk/eventos";
import type { PersonaZk } from "@/lib/zk/padron";
import {
  COLUMNAS_CASO,
  MOTIVOS_DESCARTAR,
  MOTIVOS_RESOLVER,
  MOTIVO_DECIDIDO_ZK,
  clavePersonaCaso,
  coincideBusqueda,
  columnaDe,
  diasDesde,
  evidenciaLegible,
  fechaLarga,
  numeroCaso,
  textoEspera,
  type CasoGuardado,
  type ColumnaCaso,
  type FamiliaCaso,
  type MotivoEspera,
  type NotaCaso,
  type TipoCasoCatalogo,
  ordenarGruposCaso,
  tiposEnOrden,
} from "@/lib/casosRegistro";
import { accionSugerida, type AccionZk } from "@/lib/zk/movimientos";
import {
  listDepartamentosZk,
  pedirMovimientoZk,
  type DepartamentoZk,
  anotarCaso,
  borrarTipoCaso,
  guardarTipoCaso,
  listCasos,
  listFamiliasCaso,
  listPadronEstacionamiento,
  listNotasCaso,
  listTiposCaso,
  marcarCasos,
  moverCasos,
  ordenarTiposCaso,
  reportarCaso,
  type MovimientoCaso,
  type PadronEstacionamiento,
} from "@/lib/supabase/apiPanel";
import SelectorTipo, { Etiqueta, type ModoSelector } from "@/components/admin/casos/SelectorTipo";
import { textoVehiculo } from "@/lib/vehiculo";
import { buscarCandidatos, construirCandidatos, type CandidatoCaso } from "@/lib/buscarPersona";
import { EntradasSalidas, EvidenciaGraficas, LosTags, type ExpedienteTag, type Ventana } from "@/components/admin/casos/GraficasCaso";
import { fechaHora } from "@/lib/formato";
import { ROTULO } from "@/lib/glosario";
import IdentificacionGes from "@/components/admin/IdentificacionGes";
import { EnZkDelCaso } from "@/components/admin/VistaMovimientosZk";

const ESCRIBEN: RolPanel[] = ["ti", "contador", "admin", "super"];
const EDITAN_TIPOS: RolPanel[] = ["ti", "super"];
// El orden de familias y tipos, para todos (bloque 91; Gerardo, 8-oct).
const ORDENAN_TIPOS: RolPanel[] = ["ti", "contador", "super"];
const POR_COLUMNA = 12;

// En observacion: esperan su fecha y son muchos (191 al 7-oct, y creceran). Mientras
// esperan no van en las columnas sino en su propia vista; cuando su fecha llega y
// regresan a Por atender, vuelven al tablero (Gerardo, 7-oct).
const EN_OBSERVACION = ["tag-sin-uso"];
const enObservacion = (c: CasoGuardado) => EN_OBSERVACION.includes(c.tipo) && columnaDe(c.estado) === "esperando";

interface Vista { id: string; titulo: string; tipos: string[]; urgente: boolean; base?: boolean }
const VISTAS_BASE: Vista[] = [
  { id: "todos", titulo: "Todos", tipos: [], urgente: false, base: true },
  { id: "urgentes", titulo: "Urgentes", tipos: [], urgente: true, base: true },
];
const CLAVE_VISTAS = "satag.casos.vistas";
const CLAVE_ANCHO = "satag.casos.anchoDetalle";

// Las vistas propias viven en este navegador: son una comodidad, no un dato.
function leerVistas(): Vista[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_VISTAS) ?? "null");
    if (Array.isArray(v)) return v.filter((x) => x && typeof x.id === "string" && Array.isArray(x.tipos));
  } catch { /* sin almacenamiento: solo las vistas base */ }
  return [
    { id: "v-preguntar", titulo: "Preguntar al presentarse", tipos: ["preguntar"], urgente: false },
    { id: "v-departamento", titulo: "Departamento en ZK", tipos: ["departamento-distinto"], urgente: false },
    { id: "v-exempleados", titulo: "Exempleados", tipos: ["exempleado-tag-vivo"], urgente: false },
  ];
}
function guardarVistas(v: Vista[]) {
  try { localStorage.setItem(CLAVE_VISTAS, JSON.stringify(v)); } catch { /* nada */ }
}

const pasa = (c: CasoGuardado, f: { tipos: string[]; urgente: boolean }) =>
  (!f.tipos.length || f.tipos.includes(c.tipo)) && (!f.urgente || (c.urgente && columnaDe(c.estado) !== "cerrado"));

export default function TableroCasos({ rol, email, eventos, ventana, personas, expedientes = null, padron = null }: {
  rol: RolPanel;
  email: string | null;
  /** La bitacora de ZK ya leida por la pestana; null = este rol no la lee. */
  eventos: EventoZk[] | null;
  ventana: Ventana;
  /** El padron de ZK (nombres y departamento), para quien puede ver identidades. */
  personas: Map<string, PersonaZk> | null;
  /** El expediente de SATAG de cada TAG (vigente o anterior), para el cuadro de TAGs. */
  expedientes?: Map<string, ExpedienteTag> | null;
  /** El padron de SATAG ya leido por la pestana; si no llega (Administracion), se pide al reportar. */
  padron?: PadronEstacionamiento[] | null;
}) {
  const [padronPropio, setPadronPropio] = useState<PadronEstacionamiento[] | null>(null);
  const [casos, setCasos] = useState<CasoGuardado[] | null>(null);
  const [tipos, setTipos] = useState<TipoCasoCatalogo[]>([]);
  const [familias, setFamilias] = useState<FamiliaCaso[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [vistas, setVistas] = useState<Vista[]>([]);
  const [vistaId, setVistaId] = useState("todos");
  const [filtro, setFiltro] = useState<{ tipos: string[]; urgente: boolean }>({ tipos: [], urgente: false });
  const [agrupar, setAgrupar] = useState<"nada" | "familia" | "tipo">("nada");
  const [activo, setActivo] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [verTodo, setVerTodo] = useState<Set<string>>(new Set());
  const [colMovil, setColMovil] = useState<ColumnaCaso>("atender");
  const [selector, setSelector] = useState<{ modo: ModoSelector; ancla: DOMRect; ids: string[] } | null>(null);
  const [dialogo, setDialogo] = useState<{ que: "esperar" | "consultar" | "cerrar" | "reportar"; ids: string[] } | null>(null);
  const [arrastra, setArrastra] = useState<string[] | null>(null);
  const [sobre, setSobre] = useState<ColumnaCaso | null>(null);
  const escribe = ESCRIBEN.includes(rol);
  // Bloque 94: quien puede pedir la accion en ZK al cerrar (ti; super pasa siempre).
  const [deptosZk, setDeptosZk] = useState<DepartamentoZk[] | null>(null);
  useEffect(() => {
    if (rol !== "ti" && rol !== "super") return;
    listDepartamentosZk().then(setDeptosZk).catch(() => setDeptosZk(null));
  }, [rol]);
  const editaTipos = EDITAN_TIPOS.includes(rol);
  const ordenaTipos = ORDENAN_TIPOS.includes(rol);

  useEffect(() => { setVistas([...VISTAS_BASE, ...leerVistas()]); }, []);

  const leer = useCallback(async () => {
    setError(null);
    try {
      const [c, t, f] = await Promise.all([listCasos(), listTiposCaso(), listFamiliasCaso()]);
      setCasos(c);
      setTipos(t);
      setFamilias(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer los casos.");
      setCasos((p) => p ?? []);
    }
  }, []);
  useEffect(() => { leer(); }, [leer]);

  const decir = (t: string) => { setAviso(t); window.setTimeout(() => setAviso((a) => (a === t ? null : a)), 5000); };
  const nombreDe = useCallback((t: string) => personas?.get(t)?.nombre, [personas]);
  const tipoDe = useMemo(() => new Map(tipos.map((t) => [t.tipo, t])), [tipos]);
  const ordenTipos = useMemo(() => tiposEnOrden(familias, tipos).map((t) => t.tipo), [familias, tipos]);
  const cuentas = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of casos ?? []) m.set(c.tipo, (m.get(c.tipo) ?? 0) + 1);
    return m;
  }, [casos]);

  // Lo cerrado hace mas de 30 dias se archiva: no se ve en el tablero, pero se busca.
  const visibles = useMemo(
    () => (casos ?? []).filter((c) => pasa(c, filtro) && coincideBusqueda(c, q) && !enObservacion(c) && !(columnaDe(c.estado) === "cerrado" && !q && c.cerradoEn && diasDesde(c.cerradoEn) > 30)),
    [casos, filtro, q],
  );
  const observados = useMemo(() => (casos ?? []).filter((c) => enObservacion(c) && coincideBusqueda(c, q)), [casos, q]);
  const [verObservacion, setVerObservacion] = useState(false);
  const porColumna = useMemo(() => {
    const m = new Map<ColumnaCaso, CasoGuardado[]>(COLUMNAS_CASO.map((c) => [c.id, []]));
    for (const c of visibles) m.get(columnaDe(c.estado))!.push(c);
    return m;
  }, [visibles]);
  const vista = vistas.find((v) => v.id === vistaId);
  const filtroCambio = !vista || vista.urgente !== filtro.urgente || vista.tipos.join() !== filtro.tipos.join();
  const caso = activo ? (casos ?? []).find((c) => c.id === activo) ?? null : null;

  /* -------------------------------------------------------------- acciones */

  async function hacer(fn: () => Promise<unknown>, ok: string) {
    setError(null);
    try {
      await fn();
      await leer();
      decir(ok);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }
  const mover = (ids: string[], m: MovimientoCaso, texto: string) =>
    hacer(async () => { await moverCasos(ids, m, email); setMarcados(new Set()); }, `${ids.length} caso${ids.length === 1 ? "" : "s"} → ${texto}`);

  function aColumna(ids: string[], col: ColumnaCaso) {
    const quedan = ids.filter((id) => columnaDe((casos ?? []).find((c) => c.id === id)?.estado ?? "nuevo") !== col);
    if (!quedan.length) return;
    if (col === "nuevo") return decir("«Nuevo» es solo para lo que nadie ha revisado.");
    if (col === "atender") return mover(quedan, { estado: "abierto" }, "Por atender");
    setDialogo({ que: col === "esperando" ? "esperar" : col === "consultar" ? "consultar" : "cerrar", ids: quedan });
  }

  /* -------------------------------------------------------------- vistas */

  function elegirVista(v: Vista) {
    setVistaId(v.id);
    setFiltro({ tipos: [...v.tipos], urgente: v.urgente });
  }
  function guardarVista() {
    const sugerido = filtro.tipos.map((t) => tipoDe.get(t)?.titulo ?? t).join(" + ") || (filtro.urgente ? "Urgentes" : "Mi vista");
    const titulo = window.prompt("Nombre de la vista", sugerido)?.trim();
    if (!titulo) return;
    const v: Vista = { id: `v-${Date.now()}`, titulo, tipos: [...filtro.tipos], urgente: filtro.urgente };
    const nuevas = [...vistas, v];
    setVistas(nuevas);
    guardarVistas(nuevas.filter((x) => !x.base));
    setVistaId(v.id);
  }
  function opcionesVista(v: Vista) {
    const r = window.prompt(`Vista «${v.titulo}»: escriba un nombre nuevo, o BORRAR para quitarla.`, v.titulo);
    if (r === null) return;
    const nuevas = r.trim().toUpperCase() === "BORRAR" ? vistas.filter((x) => x.id !== v.id) : vistas.map((x) => (x.id === v.id && r.trim() ? { ...x, titulo: r.trim() } : x));
    setVistas(nuevas);
    guardarVistas(nuevas.filter((x) => !x.base));
    if (!nuevas.some((x) => x.id === vistaId)) elegirVista(VISTAS_BASE[0]);
  }

  /* -------------------------------------------------------------- render */

  const marcar = (ids: string[]) => setMarcados((m) => {
    const n = new Set(m);
    const todos = ids.every((id) => n.has(id));
    ids.forEach((id) => (todos ? n.delete(id) : n.add(id)));
    return n;
  });

  function tarjetas(col: ColumnaCaso, l: CasoGuardado[], clave: string): ReactNode {
    const g = new Map<string, CasoGuardado[]>();
    for (const c of l) {
      const k = `${clavePersonaCaso(c)}|${c.tipo}`;
      g.set(k, [...(g.get(k) ?? []), c]);
    }
    const grupos = ordenarGruposCaso([...g.values()], ordenTipos);
    const todos = verTodo.has(clave);
    const m = todos ? grupos : grupos.slice(0, POR_COLUMNA);
    return (
      <>
        {m.map((gr) => tarjetaDe(gr))}
        {grupos.length > m.length && <button type="button" className="tc-mas" onClick={() => setVerTodo((s) => new Set(s).add(clave))}>Ver {grupos.length - m.length} más</button>}
      </>
    );
  }

  function tarjetaDe(grupo: CasoGuardado[]) {
    const c = grupo[0];
    const ids = grupo.map((x) => x.id);
    const marc = ids.every((id) => marcados.has(id));
    const nombre = c.nombre ?? (c.tarjeta ? nombreDe(c.tarjeta) : null) ?? (c.tarjeta ? `TAG ${c.tarjeta}` : "Sin persona");
    const urg = c.urgente && columnaDe(c.estado) !== "cerrado";
    return (
      <article
        key={c.id}
        className={`tc-tj${marc ? " tc-tj--marcada" : ""}${urg ? " tc-tj--urg" : ""}${ids.includes(activo ?? "") ? " tc-tj--activa" : ""}`}
        draggable={escribe}
        onDragStart={(e) => { const v = marc && marcados.size > ids.length ? [...marcados] : ids; setArrastra(v); e.dataTransfer.setData("text/plain", v.join(",")); }}
        onDragEnd={() => { setArrastra(null); setSobre(null); }}
      >
        <div className="tc-tj__cab">
          {agrupar !== "tipo" && (
            <Etiqueta tipo={c.tipo} tipos={tipos} familias={familias}
              onClick={escribe ? (e) => setSelector({ modo: "asignar", ancla: e.currentTarget.getBoundingClientRect(), ids }) : undefined} />
          )}
          {urg && <span className="tc-urg">URGENTE</span>}
          {escribe && (
            <button type="button" className={`tc-av${marc ? " tc-av--si" : ""}`} onClick={() => marcar(ids)} aria-pressed={marc} aria-label={marc ? "Desmarcar" : "Marcar"}>
              {marc ? "✓" : nombre.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
            </button>
          )}
        </div>
        <button type="button" className="tc-tj__cuerpo" onClick={() => setActivo(c.id)}>
          <span className="tc-tj__n">{nombre}</span>
          <span className="tc-tj__d">{grupo.length > 1 ? `${grupo.length} casos · ${c.titulo}` : c.titulo}</span>
          <span className="tc-tj__pie">
            <span>{grupo.length > 1 ? <b>{grupo.length} TAGs</b> : numeroCaso(c.numero)}</span>
            <span>hace {diasDesde(c.creadoEn)} d</span>
            {c.estado === "esperando" && <span className="tc-espera">⏳ {c.esperaMotivo === "persona" ? "a la persona" : c.esperaMotivo === "tercero" ? "a un tercero" : c.esperaHasta ? fechaLarga(c.esperaHasta) : ""}</span>}
            {c.estado === "consultar" && <span className="tc-consulta" title={c.esperaTexto ?? undefined}>❓ {c.esperaTexto ?? "con el CP"}</span>}
            {c.atorado && <span className="tc-atorado">⚑ atorado</span>}
            {c.veces > 1 && <span>volvió ×{c.veces}</span>}
          </span>
        </button>
      </article>
    );
  }

  function cuerpoColumna(col: ColumnaCaso, l: CasoGuardado[]) {
    if (!l.length) return <div className="tc-vacia">{escribe ? "Suelte aquí" : "—"}</div>;
    if (agrupar === "nada") return tarjetas(col, l, col);
    const llave = (c: CasoGuardado) => (agrupar === "familia" ? tipoDe.get(c.tipo)?.familia ?? "otro" : c.tipo);
    const g = new Map<string, CasoGuardado[]>();
    for (const c of l) g.set(llave(c), [...(g.get(llave(c)) ?? []), c]);
    const orden = agrupar === "familia" ? familias.map((f) => f.id) : ordenTipos;
    return [...g.entries()].sort((a, b) => orden.indexOf(a[0]) - orden.indexOf(b[0])).map(([k, xs]) => (
      <div className="tc-subg" key={k}>
        <div className="tc-subg__cab">
          {agrupar === "familia" ? <span className="tc-subg__t">{familias.find((f) => f.id === k)?.titulo ?? k}</span> : <Etiqueta tipo={k} tipos={tipos} familias={familias} />}
          <span>{xs.length}</span>
        </div>
        {tarjetas(col, xs, `${col}|${k}`)}
      </div>
    ));
  }

  // El buscador de «Reportar caso»: expedientes de SATAG y padron de ZK, por TAG.
  const padronUsado = padron ?? padronPropio;
  useEffect(() => {
    if ((dialogo?.que !== "reportar" && !activo) || padron || padronPropio) return;
    listPadronEstacionamiento().then(setPadronPropio).catch(() => setPadronPropio([]));
  }, [dialogo, activo, padron, padronPropio]);
  // Administracion no recibe el mapa de expedientes de la pestana: se arma del padron que si lee.
  const expedientesDelPadron = useMemo(() => {
    if (expedientes || !padronUsado) return null;
    const m = new Map<string, ExpedienteTag>();
    for (const p of padronUsado) {
      const ya = m.get(p.noDispositivo);
      if (p.noDispositivo && (!ya || (ya.estado === "baja" && p.estado !== "baja"))) {
        m.set(p.noDispositivo, { folio: p.folio, estado: p.estado, anterior: false, placas: p.placas, vehiculo: textoVehiculo(p) });
      }
    }
    return m;
  }, [expedientes, padronUsado]);
  const candidatos = useMemo(() => (dialogo?.que === "reportar" ? construirCandidatos(padronUsado ?? [], personas) : []), [dialogo, padronUsado, personas]);

  const nVivos = (casos ?? []).filter((c) => columnaDe(c.estado) !== "cerrado").length;

  return (
    <div className="tc">
      <p className="titular__migas"><span>Estacionamiento</span><span>›</span><span>Casos</span></p>
      <h2 className="titular">
        {casos === null ? "Leyendo los casos…" : `${(casos ?? []).filter((c) => c.estado === "abierto").length} casos por atender`}
      </h2>
      <p className="titular__sub">
        {casos === null ? "" : `${(casos ?? []).filter((c) => c.estado === "nuevo").length} nuevos · ${(casos ?? []).filter((c) => c.estado === "consultar").length} por consultar con el CP · ${(casos ?? []).filter((c) => columnaDe(c.estado) === "esperando").length} esperando · ${(casos ?? []).filter((c) => c.urgente && columnaDe(c.estado) !== "cerrado").length} urgentes · ${nVivos} vivos en total.`}
      </p>

      <div className="tc-herr">
        <input className="input search tc-buscar" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar persona, TAG, folio o caso" />
        <div className="tc-seg" role="group" aria-label="Agrupar">
          {(["nada", "familia", "tipo"] as const).map((a) => (
            <button key={a} type="button" aria-pressed={agrupar === a} onClick={() => setAgrupar(a)}>{a === "nada" ? "Sin agrupar" : a === "familia" ? "Por familia" : "Por tipo"}</button>
          ))}
        </div>
        <button type="button" className="ghost-action" onClick={(e) => setSelector({ modo: "editar", ancla: e.currentTarget.getBoundingClientRect(), ids: [] })}>Tipos ▾</button>
        {escribe && <button type="button" className="primary-action tc-reportar" onClick={() => setDialogo({ que: "reportar", ids: [] })}>+ Reportar caso</button>}
      </div>

      <div className="tc-vistas" role="tablist" aria-label="Vistas">
        {vistas.map((v) => (
          <div key={v.id} className={`tc-vista${v.id === vistaId ? " tc-vista--act" : ""}`}>
            <button type="button" role="tab" aria-selected={v.id === vistaId} onClick={() => elegirVista(v)}>
              {v.titulo} <b>{(casos ?? []).filter((c) => columnaDe(c.estado) !== "cerrado" && pasa(c, v)).length}</b>
            </button>
            {!v.base && <button type="button" className="tc-vista__mas" onClick={() => opcionesVista(v)} aria-label={`Opciones de ${v.titulo}`}>⋯</button>}
          </div>
        ))}
        {filtroCambio && <button type="button" className="tc-guardar-v" onClick={guardarVista}>+ Guardar vista</button>}
        <div className={`tc-vista tc-vista--obs${verObservacion ? " tc-vista--act" : ""}`}>
          <button type="button" role="tab" aria-selected={verObservacion} onClick={() => setVerObservacion((v) => !v)} title="Esperan su fecha: no están en las columnas">
            TAGs sin uso en observación <b>{observados.length}</b>
          </button>
        </div>
      </div>

      <div className="tc-chips">
        {filtro.tipos.map((t) => (
          <span key={t} className="tc-fchip">
            <Etiqueta tipo={t} tipos={tipos} familias={familias} />
            <button type="button" onClick={() => setFiltro((f) => ({ ...f, tipos: f.tipos.filter((x) => x !== t) }))} aria-label="Quitar">✕</button>
          </span>
        ))}
        {filtro.urgente && <span className="tc-fchip"><span className="tc-etq tc-etq--urg">Urgente</span><button type="button" onClick={() => setFiltro((f) => ({ ...f, urgente: false }))} aria-label="Quitar">✕</button></span>}
        <button type="button" className="tc-fchip-add" onClick={(e) => setSelector({ modo: "filtrar", ancla: e.currentTarget.getBoundingClientRect(), ids: [] })}>+ Tipo</button>
        {!filtro.urgente && <button type="button" className="tc-fchip-add" onClick={() => setFiltro((f) => ({ ...f, urgente: true }))}>+ Urgente</button>}
        {(filtro.tipos.length > 0 || filtro.urgente) && <button type="button" className="link-action" onClick={() => setFiltro({ tipos: [], urgente: false })}>Limpiar</button>}
      </div>

      {error && <p className="submit-error" role="alert">{error} <button type="button" className="link-action" onClick={() => leer()}>Volver a leer</button></p>}

      <div className="tc-movil" role="tablist" aria-label="Columna">
        {COLUMNAS_CASO.map((c) => <button key={c.id} type="button" aria-pressed={colMovil === c.id} onClick={() => setColMovil(c.id)}>{c.titulo} {porColumna.get(c.id)!.length}</button>)}
      </div>

      <Zona abierto={caso !== null}
        tablero={verObservacion ? (
          <TablaObservacion casos={observados} eventos={eventos} nombreDe={nombreDe} activo={activo} onAbrir={setActivo} onVolver={() => setVerObservacion(false)} />
        ) : (
          <div className="tc-tablero">
            {COLUMNAS_CASO.map((col) => {
              const l = porColumna.get(col.id)!;
              return (
                <section
                  key={col.id}
                  className={`tc-col${sobre === col.id ? " tc-col--sobre" : ""}${colMovil === col.id ? " tc-col--vis" : ""}`}
                  onDragOver={(e) => { if (arrastra) { e.preventDefault(); if (sobre !== col.id) setSobre(col.id); } }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre(null); }}
                  onDrop={(e) => { e.preventDefault(); const ids = arrastra; setArrastra(null); setSobre(null); if (ids) aColumna(ids, col.id); }}
                  aria-label={col.titulo}
                >
                  <header className="tc-col__cab"><h3>{col.titulo}</h3><span>{l.length}</span></header>
                  {/* 9-oct: con busqueda o filtro, marcar de un clic lo que se ve (p. ej. los 18 de Empleado_PPF). */}
                  {escribe && l.length > 1 && (q.trim() || filtro.tipos.length > 0 || filtro.urgente) && (
                    <button type="button" className="link-action tc-col__todos" onClick={() => marcar(l.map((c) => c.id))}>
                      {l.every((c) => marcados.has(c.id)) ? "Desmarcar todos" : `Marcar los ${l.length}`}
                    </button>
                  )}
                  <p className="tc-col__ayuda">{col.ayuda}</p>
                  <div className="tc-col__tarjetas">{cuerpoColumna(col.id, l)}</div>
                </section>
              );
            })}
          </div>
        )}
        panel={caso && (
          <PanelCaso
            key={caso.id}
            caso={caso}
            casos={casos ?? []}
            tipos={tipos}
            familias={familias}
            escribe={escribe}
            rol={rol}
            email={email}
            eventos={eventos}
            ventana={ventana}
            nombreDe={nombreDe}
            persona={caso.tarjeta ? personas?.get(caso.tarjeta) ?? null : null}
            zkDe={(t) => personas?.get(t)}
            expedienteDe={(t) => (expedientes ?? expedientesDelPadron)?.get(t)}
            padron={padronUsado}
            onCerrarPanel={() => setActivo(null)}
            onAbrir={setActivo}
            onCambiarTipo={(ancla) => setSelector({ modo: "asignar", ancla, ids: [caso.id] })}
            onMover={(m, texto) => mover([caso.id], m, texto)}
            onPedir={(que) => setDialogo({ que, ids: [caso.id] })}
            onMarcar={(m, texto) => hacer(() => marcarCasos([caso.id], m, email), texto)}
            onNota={(nota) => hacer(() => anotarCaso(caso.id, nota, null, email), "Nota guardada")}
          />
        )}
      />

      {marcados.size > 0 && escribe && (
        <div className="tc-seleccion" role="region" aria-label="Casos marcados">
          <span>{marcados.size} marcado{marcados.size === 1 ? "" : "s"}</span>
          <button type="button" onClick={(e) => setSelector({ modo: "asignar", ancla: e.currentTarget.getBoundingClientRect(), ids: [...marcados] })}>Tipo…</button>
          <button type="button" onClick={() => mover([...marcados], { estado: "abierto" }, "Por atender")}>Por atender</button>
          <button type="button" onClick={() => setDialogo({ que: "consultar", ids: [...marcados] })}>Consultar con el CP…</button>
          <button type="button" onClick={() => setDialogo({ que: "esperar", ids: [...marcados] })}>Esperar…</button>
          <button type="button" onClick={() => setDialogo({ que: "cerrar", ids: [...marcados] })}>Cerrar…</button>
          <button type="button" onClick={() => setMarcados(new Set())} aria-label="Desmarcar todo">✕</button>
        </div>
      )}
      {aviso && <div className="tc-aviso" role="status">{aviso}</div>}

      {selector && (
        <SelectorTipo
          modo={selector.modo}
          ancla={selector.ancla}
          tipos={tipos}
          familias={familias}
          cuentas={cuentas}
          puedeEditar={editaTipos}
          puedeOrdenar={ordenaTipos}
          seleccion={selector.modo === "filtrar" ? filtro.tipos : [...new Set(selector.ids.map((id) => (casos ?? []).find((c) => c.id === id)?.tipo ?? ""))]}
          onCerrar={() => setSelector(null)}
          onElegir={(t) => {
            if (selector.modo === "filtrar") return setFiltro((f) => ({ ...f, tipos: f.tipos.includes(t) ? f.tipos.filter((x) => x !== t) : [...f.tipos, t] }));
            if (selector.modo === "asignar") {
              const ids = selector.ids;
              setSelector(null);
              hacer(async () => { await marcarCasos(ids, { tipo: t }, email); setMarcados(new Set()); }, `Tipo cambiado a «${tipoDe.get(t)?.titulo ?? t}»`);
            }
          }}
          onGuardar={async (t) => { const id = await guardarTipoCaso(t, email); setTipos(await listTiposCaso()); return id; }}
          onBorrar={async (t) => { await borrarTipoCaso(t); setTipos(await listTiposCaso()); }}
          onOrdenar={async (fams, ts) => {
            await ordenarTiposCaso(fams, ts, email);
            const [t, f] = await Promise.all([listTiposCaso(), listFamiliasCaso()]);
            setTipos(t);
            setFamilias(f);
          }}
        />
      )}

      {dialogo?.que === "esperar" && (
        <DialogoEsperar n={dialogo.ids.length} onCancelar={() => setDialogo(null)}
          onListo={(m) => { const ids = dialogo.ids; setDialogo(null); mover(ids, m, "Esperando"); }} />
      )}
      {dialogo?.que === "consultar" && (
        <DialogoConsultar n={dialogo.ids.length} onCancelar={() => setDialogo(null)}
          onListo={(m) => { const ids = dialogo.ids; setDialogo(null); mover(ids, m, "Consultar con el CP"); }} />
      )}
      {dialogo?.que === "cerrar" && (
        <DialogoCerrar ids={dialogo.ids} casos={casos ?? []} tipoDe={tipoDe} deptosZk={deptosZk} onCancelar={() => setDialogo(null)}
          onListo={(m, accion) => {
            const ids = dialogo.ids;
            setDialogo(null);
            if (!accion) return mover(ids, m, m.estado === "resuelto" ? "Resuelto" : "Descartado");
            // Bloque 94: se cierra con la decision y la accion queda pendiente en Movimientos en ZK.
            hacer(async () => {
              await moverCasos(ids, m, email);
              for (const id of ids) await pedirMovimientoZk(id, accion, email);
              setMarcados(new Set());
            }, `${ids.length} caso${ids.length === 1 ? "" : "s"} → Resuelto, con su acción en Movimientos en ZK`);
          }} />
      )}
      {dialogo?.que === "reportar" && (
        <DialogoReportar tipos={tipos} familias={familias} casos={casos ?? []} candidatos={candidatos} cargando={padronUsado === null} onCancelar={() => setDialogo(null)}
          onListo={(e) => {
            setDialogo(null);
            hacer(async () => { const r = await reportarCaso(e, email); await leer(); setActivo(r.id); }, "Caso reportado en «Nuevo»");
          }} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ tablero + detalle, con divisor */

function Zona({ abierto, tablero, panel }: { abierto: boolean; tablero: ReactNode; panel: ReactNode }) {
  const zona = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState<number | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  useEffect(() => {
    try { const g = Number(localStorage.getItem(CLAVE_ANCHO)); if (g > 0) setAncho(g); } catch { /* nada */ }
  }, []);
  const poner = (px: number) => {
    const total = zona.current?.clientWidth ?? 1200;
    const w = Math.round(Math.min(Math.max(320, total - 280), Math.max(320, px)));
    setAncho(w);
    try { localStorage.setItem(CLAVE_ANCHO, String(w)); } catch { /* nada */ }
  };
  return (
    <div ref={zona} className={`tc-zona${arrastrando ? " tc-zona--arr" : ""}${abierto ? " tc-zona--con" : ""}`}>
      <div className="tc-zona__tablero">{tablero}</div>
      {abierto && (
        <>
          <div
            className="tc-divisor"
            role="separator"
            aria-orientation="vertical"
            aria-label="Ajustar el ancho del detalle"
            tabIndex={0}
            title="Arrastre para ajustar · doble clic: angosto / ancho"
            onPointerDown={(e) => {
              e.preventDefault();
              const el = e.currentTarget;
              el.setPointerCapture(e.pointerId);
              setArrastrando(true);
              const derecha = zona.current!.getBoundingClientRect().right;
              const mover = (ev: PointerEvent) => poner(derecha - ev.clientX);
              const soltar = () => { setArrastrando(false); el.removeEventListener("pointermove", mover); el.removeEventListener("pointerup", soltar); };
              el.addEventListener("pointermove", mover);
              el.addEventListener("pointerup", soltar);
            }}
            onDoubleClick={() => { const z = zona.current?.clientWidth ?? 1200; poner((ancho ?? 540) < z * 0.5 ? z * 0.65 : z * 0.4); }}
            onKeyDown={(e) => {
              const paso = e.shiftKey ? 80 : 24;
              if (e.key === "ArrowLeft") { e.preventDefault(); poner((ancho ?? 540) + paso); }
              if (e.key === "ArrowRight") { e.preventDefault(); poner((ancho ?? 540) - paso); }
            }}
          />
          <aside className="tc-panel" style={ancho ? { width: ancho } : undefined} aria-label="Detalle del caso">{panel}</aside>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ el detalle */

function PanelCaso({ caso, casos, tipos, familias, escribe, rol, email, eventos, ventana, nombreDe, persona, zkDe, expedienteDe, padron, onCerrarPanel, onAbrir, onCambiarTipo, onMover, onPedir, onMarcar, onNota }: {
  caso: CasoGuardado;
  rol: RolPanel;
  email: string | null;
  casos: CasoGuardado[];
  tipos: TipoCasoCatalogo[];
  familias: FamiliaCaso[];
  escribe: boolean;
  eventos: EventoZk[] | null;
  ventana: Ventana;
  nombreDe: (t: string) => string | undefined;
  persona: PersonaZk | null;
  zkDe: (t: string) => PersonaZk | undefined;
  expedienteDe: (t: string) => ExpedienteTag | undefined;
  padron: PadronEstacionamiento[] | null;
  onCerrarPanel: () => void;
  onAbrir: (id: string) => void;
  onCambiarTipo: (ancla: DOMRect) => void;
  onMover: (m: MovimientoCaso, texto: string) => void;
  onPedir: (que: "esperar" | "consultar" | "cerrar") => void;
  onMarcar: (m: { urgente?: boolean; atorado?: boolean }, texto: string) => void;
  onNota: (nota: string) => Promise<unknown>;
}) {
  const [pestana, setPestana] = useState<"caso" | "pasos" | "persona" | "identificacion">("caso");
  const [notas, setNotas] = useState<NotaCaso[] | null>(null);
  const [nota, setNota] = useState("");
  const t = tipos.find((x) => x.tipo === caso.tipo);
  const col = columnaDe(caso.estado);
  const clave = clavePersonaCaso(caso);
  const otros = casos.filter((c) => clavePersonaCaso(c) === clave || (caso.tarjeta && c.tarjeta === caso.tarjeta));
  const tarjetas = [...new Set([caso.tarjeta, typeof caso.evidencia?.tagQueSiUsa === "string" ? caso.evidencia.tagQueSiUsa : null].filter((x): x is string => !!x))];
  const nombre = caso.nombre ?? (caso.tarjeta ? nombreDe(caso.tarjeta) : null) ?? "Sin nombre en SATAG ni en ZK";
  const evidencia = evidenciaLegible(caso.evidencia);
  // El vehiculo con que se registro: el del expediente ligado; si el caso solo tiene TAG, el del padron.
  const expTag = caso.tarjeta ? expedienteDe(caso.tarjeta) : undefined;
  const placa = caso.vehiculo?.placas ?? expTag?.placas ?? null;
  const vehiculo = caso.vehiculo ? textoVehiculo(caso.vehiculo) : expTag?.vehiculo ?? null;
  const folio = caso.folio ?? expTag?.folio ?? null;

  useEffect(() => {
    let vivo = true;
    listNotasCaso(caso.id).then((n) => vivo && setNotas(n)).catch(() => vivo && setNotas([]));
    return () => { vivo = false; };
  }, [caso.id, caso.actualizadoEn]);

  const ultimoPaso = eventos && caso.tarjeta ? eventos.filter((e) => e.tarjeta === caso.tarjeta && e.concedido).map((e) => e.ocurrioEn).sort().pop() : null;

  return (
    <div className="tc-det">
      <div className="tc-det__cab">
        <div className="tc-det__linea">
          <span className="mono">{numeroCaso(caso.numero)}</span>
          <Etiqueta tipo={caso.tipo} tipos={tipos} familias={familias} onClick={escribe ? (e) => onCambiarTipo(e.currentTarget.getBoundingClientRect()) : undefined} />
          <span>· {COLUMNAS_CASO.find((c) => c.id === col)?.titulo}</span>
          {caso.urgente && col !== "cerrado" && <span className="tc-urg">· URGENTE</span>}
          <button type="button" className="ghost-action ghost-action--chico tc-det__x" onClick={onCerrarPanel} aria-label="Cerrar el detalle">✕</button>
        </div>
        <h3 className="tc-det__t">{caso.titulo}</h3>
        {escribe && (
          <div className="tc-det__acc">
            {col === "nuevo" && <button type="button" className="primary-action" onClick={() => onMover({ estado: "abierto" }, "Por atender")}>Tomarlo → Por atender</button>}
            {(col === "esperando") && <button type="button" className="ghost-action" onClick={() => onMover({ estado: "abierto" }, "Por atender")}>Volver a atender</button>}
            {col === "consultar" && <button type="button" className="primary-action" onClick={() => onMover({ estado: "abierto", nota: "Ya se consultó con el CP" }, "Por atender")}>Ya se consultó → Por atender</button>}
            {col !== "cerrado" && col !== "consultar" && <button type="button" className="ghost-action" onClick={() => onPedir("consultar")}>Consultar con el CP…</button>}
            {col !== "cerrado" && col !== "esperando" && <button type="button" className="ghost-action" onClick={() => onPedir("esperar")}>Esperar…</button>}
            {col !== "cerrado" && <button type="button" className={col === "atender" ? "primary-action" : "ghost-action"} onClick={() => onPedir("cerrar")}>Cerrar…</button>}
            {col === "cerrado" && <button type="button" className="ghost-action" onClick={() => onMover({ estado: "abierto", nota: "Reabierto" }, "Por atender")}>Reabrir</button>}
            {col === "atender" && <button type="button" className="ghost-action" aria-pressed={caso.atorado} onClick={() => onMarcar({ atorado: !caso.atorado }, caso.atorado ? "Ya no está atorado" : "Marcado atorado")}>⚑ {caso.atorado ? "Atorado" : "Marcar atorado"}</button>}
            {col !== "cerrado" && <button type="button" className={`ghost-action${caso.urgente ? " tc-btn-urg" : ""}`} onClick={() => onMarcar({ urgente: !caso.urgente }, caso.urgente ? "Ya no es urgente" : "Marcado urgente")}>{caso.urgente ? "Quitar urgente" : "Urgente"}</button>}
          </div>
        )}
        {col === "esperando" && <div className="tc-det__espera">Esperando {textoEspera(caso)}.</div>}
        {col === "consultar" && <div className="tc-det__espera">Por consultar con el CP: {caso.esperaTexto ?? "sin pregunta escrita"}</div>}
        {col === "cerrado" && <div className="tc-det__cerrado">{caso.estado === "resuelto" ? "Resuelto" : "Descartado"}{caso.cerradoPor ? ` por ${caso.cerradoPor}` : ""}: {caso.cierreNota ?? caso.cierreMotivo ?? ""}</div>}
      </div>
      <div className="tc-det__pest" role="tablist">
        {([["caso", "Caso"], ["pasos", "Entradas y salidas"], ["persona", `Persona · ${otros.length} caso${otros.length === 1 ? "" : "s"}`], ["identificacion", "Identificación"]] as const).map(([id, x]) => (
          <button key={id} type="button" role="tab" aria-selected={pestana === id} onClick={() => setPestana(id)}>{x}</button>
        ))}
      </div>
      <div className="tc-det__cuerpo">
        {pestana === "caso" && (
          <>
            {t?.queHacer && <div className="tc-qh"><b>Qué hacer</b>{t.queHacer}</div>}
            {/* Bloque 93: lo leen quienes leen el padron de ZK. */}
            {(rol === "ti" || rol === "contador" || rol === "super") && (
              <EnZkDelCaso casoId={caso.id} conTag={!!caso.tarjeta} puedePedir={rol === "ti" || rol === "super"} email={email} />
            )}
            <div className="tc-r6">
              <div>Persona<b>{nombre}</b></div>
              <div>Folio<b className="mono">{folio ?? "—"}</b></div>
              <div>TAG<b className="mono">{caso.tarjeta ?? "—"}</b></div>
              <div>{ROTULO.placa}<b className="mono">{placa ?? "—"}</b></div>
              <div>Vehículo<b>{vehiculo ?? "—"}</b></div>
              <div>{ROTULO.departamentoZk}<b>{persona?.departamento ?? String(caso.evidencia?.departamentoZk ?? "—")}</b></div>
              <div>Último paso<b>{ultimoPaso ? ultimoPaso.slice(0, 16) : String(caso.evidencia?.ultimoPaso ?? "—")}</b></div>
              <div>Casos vivos<b>{otros.filter((c) => columnaDe(c.estado) !== "cerrado").length}</b></div>
            </div>
            {caso.detalle.trim() && <p className="tc-det__detalle">{caso.detalle}</p>}
            {eventos ? (
              <EvidenciaGraficas caso={caso} eventos={eventos} ventana={ventana} nombreDe={nombreDe} zkDe={zkDe} expedienteDe={expedienteDe} />
            ) : (
              <p className="g-vacio">Las gráficas de los pasos por la pluma las ven TI y Contabilidad (leen la bitácora de ZK).</p>
            )}
            {evidencia.length > 0 && (
              <details className="tc-pleg">
                <summary>Lo que registró quien abrió el caso</summary>
                <dl className="caso__evid">{evidencia.map((e) => <div key={e.etiqueta}><dt>{e.etiqueta}</dt><dd>{e.valor}</dd></div>)}</dl>
              </details>
            )}
            <h4 className="tc-h">Historial</h4>
            {notas === null ? <p className="ficha__vacio">Leyendo…</p> : (
              <ul className="tc-hist">
                {notas.map((n) => (
                  <li key={n.id} className={n.clase === "nota" ? "tc-hist__nota" : ""}>
                    <time>{fechaHora(n.hechoEn)} · {n.hechoPor}</time>
                    {n.clase === "apertura" ? <span>Se abrió el caso</span> : n.clase === "nota" ? <div className="tc-hist__tarj">{n.nota}</div> : <span>{n.nota || (n.estadoDespues ? `→ ${n.estadoDespues}` : "")}</span>}
                  </li>
                ))}
              </ul>
            )}
            {escribe && (
              <form className="tc-comp" onSubmit={async (e) => { e.preventDefault(); if (!nota.trim()) return; await onNota(nota.trim()); setNota(""); }}>
                <textarea className="textarea" maxLength={4000} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Agregar una nota al historial…" aria-label="Nota" />
                <button type="submit" className="ghost-action" disabled={!nota.trim()}>Guardar nota</button>
              </form>
            )}
          </>
        )}
        {pestana === "pasos" && (eventos ? <EntradasSalidas tarjetas={tarjetas} eventos={eventos} ventana={ventana} nombreDe={nombreDe} /> : <p className="g-vacio">Los pasos por la pluma los ven TI y Contabilidad.</p>)}
        {pestana === "persona" && (
          <>
            <div className="tc-r6">
              <div>Persona<b>{nombre}</b></div>
              <div>Folio<b className="mono">{folio ?? "—"}</b></div>
              <div>TAG<b className="mono">{caso.tarjeta ?? "—"}</b></div>
              <div>{ROTULO.placaSatag}<b className="mono">{placa ?? "—"}</b></div>
              <div>Vehículo<b>{vehiculo ?? "—"}</b></div>
              <div>{ROTULO.departamentoZk}<b>{persona?.departamento ?? "—"}</b></div>
              <div>{ROTULO.placaZk}<b className="mono">{persona?.placa || "—"}</b></div>
              <div>Nombre en ZK<b>{persona?.nombre ?? "—"}</b></div>
            </div>
            <LosTags
              titulo="Todos los TAGs de esta persona"
              tags={tagsDeLaPersona(caso, otros, padron)}
              eventos={eventos ?? []}
              ventana={eventos ? ventana : { desde: null, hasta: null }}
              zkDe={zkDe}
              expedienteDe={expedienteDe}
              nombreDe={nombreDe}
              leeZk={eventos !== null}
            />
            <h4 className="tc-h">Casos de esta persona</h4>
            <ul className="tc-otros">
              {otros.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => onAbrir(o.id)} aria-current={o.id === caso.id}>
                    <span className="mono">{numeroCaso(o.numero)}</span> <Etiqueta tipo={o.tipo} tipos={tipos} familias={familias} /> {o.titulo}
                    <span className="tc-otros__e">{COLUMNAS_CASO.find((c) => c.id === columnaDe(o.estado))?.titulo}{o.id === caso.id ? " · el que está viendo" : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="ti-hint">La ficha completa (expediente, pagos, firma) está en Consulta → Personas, buscando el folio.</p>
          </>
        )}
        {pestana === "identificacion" && (
          <IdentificacionGes
            titulo="Quién es según GES"
            conTitulo={false}
            nombres={[caso.nombre, persona?.nombre, ...tarjetas.map((x) => nombreDe(x))]}
            tarjetas={tarjetas}
            rol={rol}
            email={email}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ dialogos */

function Modal({ titulo, children, onCancelar }: { titulo: string; children: ReactNode; onCancelar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  return (
    <dialog ref={ref} className="tc-modal" onCancel={(e) => { e.preventDefault(); onCancelar(); }} aria-label={titulo}>
      <h3>{titulo}</h3>
      {children}
    </dialog>
  );
}

function hoyMasDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(d);
}

function DialogoEsperar({ n, onCancelar, onListo }: { n: number; onCancelar: () => void; onListo: (m: MovimientoCaso) => void }) {
  const [motivo, setMotivo] = useState<MotivoEspera>("persona");
  const [texto, setTexto] = useState("");
  const [hasta, setHasta] = useState(hoyMasDias(30));
  const [nota, setNota] = useState("");
  const falta = motivo === "tercero" && !texto.trim() ? "Escriba a quién o qué se espera." : motivo === "fecha" && !(hasta > hoyMasDias(0)) ? "La fecha tiene que ser posterior a hoy." : null;
  return (
    <Modal titulo={`Esperar${n > 1 ? ` ${n} casos` : ""}`} onCancelar={onCancelar}>
      <p className="ti-hint">El caso sale de «Por atender» y vuelve cuando se cumpla lo que espera.</p>
      <div className="tc-motivos">
        <label><input type="radio" name="esp" checked={motivo === "persona"} onChange={() => setMotivo("persona")} /> A que la persona se presente</label>
        <label><input type="radio" name="esp" checked={motivo === "tercero"} onChange={() => setMotivo("tercero")} /> A alguien de fuera (RH, el proveedor de ZK…)</label>
        <label><input type="radio" name="esp" checked={motivo === "fecha"} onChange={() => setMotivo("fecha")} /> Hasta una fecha</label>
      </div>
      {motivo === "tercero" && <label className="label">¿A quién o qué se espera?<input className="input" value={texto} maxLength={200} onChange={(e) => setTexto(e.target.value)} /></label>}
      {motivo === "fecha" && <label className="label">Hasta el<input className="input" type="date" value={hasta} min={hoyMasDias(1)} onChange={(e) => setHasta(e.target.value)} /></label>}
      <label className="label">Nota (opcional)<textarea className="textarea" maxLength={4000} value={nota} onChange={(e) => setNota(e.target.value)} /></label>
      {falta && <p className="ti-hint" role="status">{falta}</p>}
      <div className="tc-modal__pie">
        <button type="button" className="ghost-action" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="primary-action" disabled={falta !== null} onClick={() => onListo({ estado: "esperando", nota: nota.trim(), espera: { motivo, texto: texto.trim() || null, hasta: motivo === "fecha" ? hasta : null } })}>Esperar</button>
      </div>
    </Modal>
  );
}

/** Bloque 96: llevar el caso a «Consultar con el CP», con la pregunta. */
function DialogoConsultar({ n, onCancelar, onListo }: { n: number; onCancelar: () => void; onListo: (m: MovimientoCaso) => void }) {
  const [pregunta, setPregunta] = useState("");
  const [nota, setNota] = useState("");
  return (
    <Modal titulo={`Consultar con el CP${n > 1 ? ` · ${n} casos` : ""}`} onCancelar={onCancelar}>
      <p className="ti-hint">El caso espera en esta columna hasta que se toque base con Gerencia Administrativa. Con su respuesta, vuelve a «Por atender» o se cierra.</p>
      <label className="label">¿Qué hay que consultar?<input className="input" value={pregunta} maxLength={200} autoFocus placeholder="Ej.: ¿pasa a Padres de familia?" onChange={(e) => setPregunta(e.target.value)} /></label>
      <label className="label">Nota (opcional)<textarea className="textarea" maxLength={4000} value={nota} onChange={(e) => setNota(e.target.value)} /></label>
      {!pregunta.trim() && <p className="ti-hint" role="status">Escriba qué hay que consultar.</p>}
      <div className="tc-modal__pie">
        <button type="button" className="ghost-action" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="primary-action" disabled={!pregunta.trim()} onClick={() => onListo({ estado: "consultar", nota: nota.trim(), pregunta: pregunta.trim() })}>Llevar a Consultar con el CP</button>
      </div>
    </Modal>
  );
}

function DialogoCerrar({ ids, casos, tipoDe, deptosZk, onCancelar, onListo }: {
  ids: string[];
  casos: CasoGuardado[];
  tipoDe: Map<string, TipoCasoCatalogo>;
  /** Departamentos de ZK si quien cierra puede pedir la accion en ZK (bloque 94); null si no. */
  deptosZk: DepartamentoZk[] | null;
  onCancelar: () => void;
  onListo: (m: MovimientoCaso, accion: AccionZk | null) => void;
}) {
  const tiposDe = [...new Set(ids.map((id) => casos.find((c) => c.id === id)?.tipo ?? ""))];
  const propios = tiposDe.length === 1 ? tipoDe.get(tiposDe[0])?.motivosCierre ?? [] : [];
  // La accion en ZK: se sugiere por el tipo y el titulo, y quien cierra la confirma o la cambia.
  const elegidos = ids.map((id) => casos.find((c) => c.id === id)).filter((c): c is CasoGuardado => !!c);
  const conTag = elegidos.length > 0 && elegidos.every((c) => c.tarjeta);
  const sugerida = deptosZk && conTag ? accionSugerida(elegidos, deptosZk) : null;
  const [accion, setAccion] = useState<AccionZk | null>(sugerida);
  // Con accion en ZK, el motivo que dice la verdad es «decidido, falta hacerlo»: «Pasado a
  // BAJAS…» afirmaria algo que todavia no pasa en ZK.
  const resolver = [...new Set([...(deptosZk && conTag ? [MOTIVO_DECIDIDO_ZK] : []), ...propios, ...MOTIVOS_RESOLVER])];
  const [eleccion, setEleccion] = useState(`R|${sugerida ? MOTIVO_DECIDIDO_ZK : propios[0] ?? resolver[0]}`);
  const [nota, setNota] = useState("");
  const [como, motivo] = eleccion.split("|");
  const falta = !motivo && !nota.trim() ? "Escriba qué se hizo o por qué se descarta." : accion?.que === "nombre" && !accion.nombreDestino.trim() ? "Escriba el nombre como debe quedar en ZK." : null;
  return (
    <Modal titulo={`Cerrar ${ids.length > 1 ? `${ids.length} casos` : "el caso"}`} onCancelar={onCancelar}>
      <p className="ti-hint">El motivo queda en el historial{ids.length > 1 ? " de cada uno" : ""}.</p>
      <div className="tc-motivos">
        {resolver.map((m) => <label key={m}><input type="radio" name="cierre" checked={eleccion === `R|${m}`} onChange={() => setEleccion(`R|${m}`)} /> {m}</label>)}
        {MOTIVOS_DESCARTAR.map((m) => <label key={m}><input type="radio" name="cierre" checked={eleccion === `D|${m}`} onChange={() => setEleccion(`D|${m}`)} /> <span className="tc-ed__nota">Descartar:</span> {m}</label>)}
        <label><input type="radio" name="cierre" checked={eleccion === "R|"} onChange={() => setEleccion("R|")} /> Otro (escríbalo abajo)</label>
      </div>
      <label className="label">Nota{motivo ? " (opcional)" : ""}<textarea className="textarea" maxLength={4000} value={nota} onChange={(e) => setNota(e.target.value)} /></label>
      {deptosZk && conTag && como !== "D" && (
        <fieldset className="tc-motivos" style={{ border: 0, padding: 0, margin: "12px 0 0" }}>
          <legend className="label">Acción en ZK</legend>
          <p className="ti-hint" style={{ margin: "0 0 6px" }}>Si se elige, el caso queda cerrado con su decisión y el movimiento pasa a Movimientos en ZK para hacerlo en una tanda.</p>
          <label><input type="radio" name="acc-zk" checked={accion === null} onChange={() => setAccion(null)} /> Ninguna</label>
          <label>
            <input type="radio" name="acc-zk" checked={accion?.que === "departamento"}
              onChange={() => setAccion({ que: "departamento", deptoDestino: accion?.que === "departamento" ? accion.deptoDestino : deptosZk[0]?.id ?? "" })} />{" "}
            Pasarlo a{" "}
            <select className="input" style={{ display: "inline-block", width: "auto" }} aria-label="Departamento de ZK"
              value={accion?.que === "departamento" ? accion.deptoDestino : ""}
              onChange={(e) => setAccion({ que: "departamento", deptoDestino: e.target.value })}>
              {accion?.que !== "departamento" && <option value="">—</option>}
              {deptosZk.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </label>
          {elegidos.length === 1 && (
            <label>
              <input type="radio" name="acc-zk" checked={accion?.que === "nombre"}
                onChange={() => setAccion({ que: "nombre", nombreDestino: accion?.que === "nombre" ? accion.nombreDestino : "" })} />{" "}
              Corregir el nombre a{" "}
              <input className="input" style={{ display: "inline-block", width: "16rem" }} aria-label="Nombre como debe quedar en ZK"
                value={accion?.que === "nombre" ? accion.nombreDestino : ""}
                onChange={(e) => setAccion({ que: "nombre", nombreDestino: e.target.value })} />
            </label>
          )}
        </fieldset>
      )}
      {falta && <p className="ti-hint" role="status">{falta}</p>}
      <div className="tc-modal__pie">
        <button type="button" className="ghost-action" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="primary-action" disabled={falta !== null}
          onClick={() => onListo(
            { estado: como === "D" ? "descartado" : "resuelto", motivo: motivo || null, nota: nota.trim() },
            como !== "D" && deptosZk && conTag && accion && (accion.que === "nombre" || accion.deptoDestino) ? accion : null,
          )}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}

function DialogoReportar({ tipos, familias, casos, candidatos, cargando, onCancelar, onListo }: {
  tipos: TipoCasoCatalogo[];
  familias: FamiliaCaso[];
  casos: CasoGuardado[];
  /** Expedientes de SATAG y padron de ZK, por TAG (lib/buscarPersona). */
  candidatos: CandidatoCaso[];
  cargando: boolean;
  onCancelar: () => void;
  onListo: (e: { tipo: string; titulo: string; detalle: string; tarjeta: string; registroId: string | null; urgente: boolean }) => void;
}) {
  const activos = tipos.filter((t) => t.activo);
  const [tipo, setTipo] = useState(activos.find((t) => !t.automatico)?.tipo ?? activos[0]?.tipo ?? "otro");
  const [busqueda, setBusqueda] = useState("");
  const [elegido, setElegido] = useState<CandidatoCaso | null>(null);
  const [foco, setFoco] = useState(0);
  const [titulo, setTitulo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [urgente, setUrgente] = useState(false);
  const resultados = useMemo(() => (elegido ? [] : buscarCandidatos(candidatos, busqueda)), [candidatos, busqueda, elegido]);
  // Un TAG tecleado que no esta en ningun padron tambien se puede reportar.
  const soloDigitos = busqueda.replace(/\D/g, "");
  const tagSuelto = !elegido && /^\d{4,12}$/.test(busqueda.trim()) && !resultados.some((r) => r.tarjeta === soloDigitos) ? soloDigitos : null;
  const tag = elegido?.tarjeta ?? tagSuelto ?? "";
  const vivos = tag ? casos.filter((c) => (c.tarjeta === tag || (elegido?.registroId && c.registroId === elegido.registroId)) && columnaDe(c.estado) !== "cerrado") : [];
  const falta = !tag ? "Busque y elija a la persona (o escriba el número de TAG)." : titulo.trim().length < 3 ? "Escriba en pocas palabras qué pasó." : null;
  const qh = tipos.find((t) => t.tipo === tipo)?.queHacer;
  const elegir = (c: CandidatoCaso) => { setElegido(c); setBusqueda(""); };

  return (
    <Modal titulo="Reportar caso" onCancelar={onCancelar}>
      <label className="label">¿Qué pasó?
        <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {familias.map((f) => (
            <optgroup key={f.id} label={f.titulo}>
              {activos.filter((t) => t.familia === f.id).map((t) => <option key={t.tipo} value={t.tipo}>{t.titulo}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      {qh && <p className="ti-hint">{qh}</p>}

      <div className="label">¿De quién?</div>
      {elegido ? (
        <div className="tc-elegido">
          <div>
            <b>{elegido.nombre || "Sin nombre"}</b>
            <span className="tc-cand__m">
              TAG <span className="mono">{elegido.tarjeta}</span>
              {elegido.folio && <> · <span className="mono">{elegido.folio}</span>{elegido.estado === "baja" ? " (dado de baja)" : ""}</>}
              {elegido.placas && <> · <span className="mono">{elegido.placas}</span></>}
              {elegido.vehiculo && <> · {elegido.vehiculo}</>}
              {!elegido.folio && " · sin expediente en SATAG"}
            </span>
          </div>
          <button type="button" className="link-action" onClick={() => setElegido(null)}>Cambiar</button>
        </div>
      ) : (
        <div className="tc-busca">
          <input
            className="input"
            autoFocus
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setFoco(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setFoco((f) => Math.min(f + 1, resultados.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setFoco((f) => Math.max(f - 1, 0)); }
              if (e.key === "Enter" && resultados[foco]) { e.preventDefault(); elegir(resultados[foco]); }
            }}
            placeholder="Nombre, TAG, placa, folio o modelo del coche"
            aria-label="Buscar a la persona"
            role="combobox"
            aria-expanded={resultados.length > 0}
            aria-controls="tc-resultados"
          />
          {cargando && <p className="ti-hint">Leyendo el padrón…</p>}
          {resultados.length > 0 && (
            <ul className="tc-cands" id="tc-resultados" role="listbox">
              {resultados.map((c, i) => (
                <li key={c.tarjeta} role="option" aria-selected={i === foco}>
                  <button type="button" className={`tc-cand${i === foco ? " tc-cand--foco" : ""}`} onMouseEnter={() => setFoco(i)} onClick={() => elegir(c)}>
                    <b>{c.nombre || "Sin nombre"}</b>
                    <span className="tc-cand__m">
                      TAG <span className="mono">{c.tarjeta}</span>
                      {c.folio ? <> · <span className="mono">{c.folio}</span>{c.estado === "baja" ? " (baja)" : ""}</> : " · solo en ZK"}
                      {c.placas && <> · <span className="mono">{c.placas}</span></>}
                      {c.vehiculo && <> · {c.vehiculo}</>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {busqueda.trim().length >= 2 && !resultados.length && !cargando && !tagSuelto && <p className="ti-hint">Nadie coincide. Si tiene el número de TAG, escríbalo completo.</p>}
          {tagSuelto && <p className="ti-hint">El TAG <span className="mono">{tagSuelto}</span> no está en SATAG ni en el padrón de ZK; se reportará solo con el número.</p>}
        </div>
      )}
      {vivos.length > 0 && (
        <p className="tc-dup">Ya tiene {vivos.length} caso{vivos.length === 1 ? "" : "s"} vivo{vivos.length === 1 ? "" : "s"}: {vivos.slice(0, 3).map((c) => `${numeroCaso(c.numero)} ${c.titulo}`).join("; ")}. Si es lo mismo, agregue una nota ahí en vez de reportar otro.</p>
      )}
      <label className="label">En pocas palabras<input className="input" maxLength={200} value={titulo} onChange={(e) => setTitulo(e.target.value)} /></label>
      <label className="label">Detalle (opcional)<textarea className="textarea" maxLength={4000} value={detalle} onChange={(e) => setDetalle(e.target.value)} /></label>
      <label className="tc-check"><input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} /> Urgente: frena la pluma hoy o es de seguridad</label>
      {falta && <p className="ti-hint" role="status">{falta}</p>}
      <div className="tc-modal__pie">
        <button type="button" className="ghost-action" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="primary-action" disabled={falta !== null}
          onClick={() => onListo({ tipo, titulo: titulo.trim(), detalle: detalle.trim(), tarjeta: tag, registroId: elegido?.registroId ?? null, urgente })}>
          Reportar
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ los TAGs sin uso, aparte */

/**
 * Los que esperan su fecha (hoy, los «TAG sin uso»): una tabla, no tarjetas, porque
 * son muchos y crecen. Cada uno con su fecha POR TAG (Gerardo, 7-oct): su ultimo
 * paso conocido, o el 7-jul si nunca paso, mas 6 meses.
 */
function TablaObservacion({ casos, eventos, nombreDe, activo, onAbrir, onVolver }: {
  casos: CasoGuardado[];
  eventos: EventoZk[] | null;
  nombreDe: (t: string) => string | undefined;
  activo: string | null;
  onAbrir: (id: string) => void;
  onVolver: () => void;
}) {
  // El ultimo paso que abrio, por TAG: de la bitacora cargada si la hay; si no, el de la evidencia.
  const ultimoPorTag = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of eventos ?? []) {
      if (!e.concedido || e.repeticion) continue;
      const ya = m.get(e.tarjeta);
      if (!ya || e.ocurrioEn > ya) m.set(e.tarjeta, e.ocurrioEn);
    }
    return m;
  }, [eventos]);
  const filas = casos
    .map((c) => {
      const ev = typeof c.evidencia?.ultimoPaso === "string" ? c.evidencia.ultimoPaso : "";
      const deEv = /^\d{4}-\d{2}-\d{2}/.test(ev) ? ev.slice(0, 10) : null;
      const deBit = c.tarjeta ? ultimoPorTag.get(c.tarjeta)?.slice(0, 10) ?? null : null;
      const ultimo = [deEv, deBit].filter((x): x is string => !!x).sort().pop() ?? null;
      const desde = ultimo ?? "2026-07-07";
      const sin = diasDesde(desde + "T12:00:00");
      return { c, ultimo, sin, avance: Math.min(1, sin / 182) };
    })
    .sort((a, b) => (a.c.esperaHasta ?? "").localeCompare(b.c.esperaHasta ?? "") || b.sin - a.sin);
  return (
    <div className="tc-obs">
      <p className="ti-hint">
        Esperan su fecha: 6 meses desde su último paso conocido (o desde el 7-jul, inicio de la historia de ZK, si nunca pasó).
        Si un TAG vuelve a abrir, su caso se cierra; si llega la fecha sin uso, regresa a «Por atender» como listo para baja.{" "}
        <button type="button" className="link-action" onClick={onVolver}>Volver al tablero</button>
      </p>
      <div className="tc-obs__tabla">
        <table>
          <thead>
            <tr><th>Persona</th><th>TAG sin uso</th><th>TAG que sí usa</th><th>Último paso</th><th>Sin entrar</th><th>Lista para baja</th></tr>
          </thead>
          <tbody>
            {filas.map(({ c, ultimo, sin, avance }) => {
              const usa = typeof c.evidencia?.tagQueSiUsa === "string" ? c.evidencia.tagQueSiUsa : null;
              return (
                <tr key={c.id} className={c.id === activo ? "tc-obs--act" : ""} onClick={() => onAbrir(c.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onAbrir(c.id); }}>
                  <td><b>{c.nombre ?? (c.tarjeta ? nombreDe(c.tarjeta) : null) ?? "Sin nombre"}</b>{c.folio && <span className="tc-obs__m mono">{c.folio}</span>}</td>
                  <td className="mono">{c.tarjeta}</td>
                  <td className="mono">{usa ?? "—"}</td>
                  <td>{ultimo ? fechaLarga(ultimo) : <span className="tc-obs__m">ninguno desde el 7-jul</span>}</td>
                  <td>
                    <span className="tc-obs__barra" aria-hidden="true"><i style={{ width: `${Math.round(avance * 100)}%` }} /></span>
                    {sin} días
                  </td>
                  <td>{c.esperaHasta ? fechaLarga(c.esperaHasta) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filas.length === 0 && <p className="g-vacio">No hay TAGs en observación.</p>}
      </div>
    </div>
  );
}

/**
 * Todos los TAGs que SATAG liga a una persona (Gerardo, 7-oct: la ficha mostraba uno
 * aunque el sistema supiera de dos). Del expediente: el vigente y los anteriores; de
 * sus casos: el TAG de cada caso y el TAG que «si usa». Un TAG sin expediente lo dice.
 */
function tagsDeLaPersona(caso: CasoGuardado, otros: CasoGuardado[], padron: PadronEstacionamiento[] | null): { tarjeta: string; papel: string }[] {
  const out = new Map<string, string>();
  const exp = caso.registroId ? padron?.find((p) => p.id === caso.registroId) : undefined;
  if (exp?.noDispositivo) out.set(exp.noDispositivo, `TAG del expediente ${exp.folio}`);
  for (const t of exp?.tagsAnteriores ?? []) if (!out.has(t)) out.set(t, `TAG anterior del expediente ${exp?.folio ?? ""}`.trim());
  for (const o of otros) {
    const usa = typeof o.evidencia?.tagQueSiUsa === "string" ? o.evidencia.tagQueSiUsa : null;
    if (usa && !out.has(usa)) out.set(usa, "El que sí usa");
    if (o.tarjeta && !out.has(o.tarjeta)) out.set(o.tarjeta, `Sin expediente · lo liga el caso ${numeroCaso(o.numero)}`);
  }
  if (caso.tarjeta && !out.has(caso.tarjeta)) out.set(caso.tarjeta, "El del caso");
  return [...out].map(([tarjeta, papel]) => ({ tarjeta, papel }));
}
