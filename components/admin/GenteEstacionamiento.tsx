"use client";

// La gente del estacionamiento, en dos vistas de Consulta que comparten la misma
// lista y la misma ficha de Personas (Gerardo, 2-oct):
//
//   Estacionamientos  «todo lo que se ve en Personas», recortado a quien tiene o usa
//                     uno, el otro o los dos, con filtro por seccion y buscador.
//   Secciones         el reporte global por seccion con la forma del Resumen —una
//                     frase, las secciones como filas que se abren, una grafica por
//                     idea— y, dentro de cada seccion abierta, su gente con la misma
//                     ficha: «los mismos datos de las personas que veo en Personas».
//
// QUE ES «SECCION». El departamento del control de acceso (PRIMARIA DOCENTE, Padres
// de familia…) cuando el padron de personas de ZK esta cargado, porque es el catalogo
// que la escuela ya mantiene; sin el, los cinco grupos del padron de SATAG. Es la
// MISMA clave con la que la medicion agrupa (`deptoDe` / `rolDe` en VistaEstacionamiento),
// para que una fila de Secciones y su gente cuenten lo mismo.
//
// LAS SEÑALES viajan a la ficha como frases de «Lo que no cuadra», una por hallazgo,
// en vez de una leyenda de insignias: la insignia obligaba a buscar que significaba
// y la leyenda salia salteada segun lo que hubiera; la frase lo dice junto a la
// persona. Lo que no tiene expediente en ningun padron no puede ser una ficha, asi
// que se dice arriba, en rojo, como siempre.
//
// SON PRESENTACIONALES: reciben la medicion, el padron de SATAG y el de ZK, y no
// consultan nada. Los pasos de cada ficha los lee FichaPersona, igual que en Personas.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Registro } from "@/lib/mock/types";
import type { RolPanel } from "@/lib/supabase/auth";
import { duracion } from "@/lib/duracion";
import type { EstanciasRol, Medicion, UsoCredencial } from "@/lib/estacionamiento";
import { esHuerfana, GRUPO_POR_TIPO, nombreDepto, SIN_CLASIFICAR, type Fuentes, type PersonaZk } from "@/lib/zk/padron";
import FichaPersona from "@/components/admin/FichaPersona";
import { HistogramaEstancias } from "@/components/admin/GraficasEstacionamiento";
import { Segmentado } from "@/components/admin/UiEstacionamiento";

/** Departamentos de ZK que, si aparecen en la bitacora, son el hallazgo. */
// Por nombre y no por numero: ZK renumero sus departamentos el 2-5 oct-2026 y el
// numero del stock paso del 3 al 18.
const DEPTO_BAJAS = "BAJAS";
const DEPTO_STOCK = "STOCK SATAG";
const TODAS = "";
/** La misma etiqueta que usa la medicion para una tarjeta que ZK no conoce (VistaEstacionamiento, `deptoDe`). */
export const SIN_ZK = "No está en el padrón de ZK";

// Lo elegido sobrevive a cambiar de vista y volver.
let ultimoLote = "ambos";
let ultimaSeccion = TODAS;
let ultimaAbierta: string | null = null;
let ultimoOrdenGente: OrdenGente = "entradas";
let ultimoDescGente = true;
let ultimoOrdenSeccion: OrdenSeccion = "cajones";
let ultimoDescSeccion = true;

const dur = (min: number | null | undefined) => duracion((min ?? 0) * 60_000);

/**
 * Como se ordena la gente. Se elige y SE DICE: una lista ordenada sin decir por que
 * obliga a adivinar que significa estar arriba (Gerardo, 2-oct).
 */
type OrdenGente = "entradas" | "visita" | "ultima" | "nombre";
const ORDENES_GENTE: { clave: OrdenGente; titulo: string; dicho: string }[] = [
  { clave: "entradas", titulo: "Veces que entró", dicho: "por veces que entró" },
  { clave: "visita", titulo: "Tiempo por visita", dicho: "por tiempo por visita" },
  { clave: "ultima", titulo: "Última vez que vino", dicho: "por la última vez que vino" },
  { clave: "nombre", titulo: "Nombre", dicho: "por nombre" },
];
type OrdenSeccion = "cajones" | "mediana" | "credenciales" | "estancias";
const ORDENES_SECCION: { clave: OrdenSeccion; titulo: string; dicho: string }[] = [
  { clave: "cajones", titulo: "Cajones que ocupa a la vez", dicho: "por cajones que ocupa a la vez" },
  { clave: "mediana", titulo: "Cuánto se queda (mediana)", dicho: "por cuánto se queda" },
  { clave: "credenciales", titulo: "Personas distintas", dicho: "por personas distintas" },
  { clave: "estancias", titulo: "Estancias medidas", dicho: "por estancias medidas" },
];

/** El selector de orden con su sentido: lo que la lista dice que es. */
function Orden<T extends string>({ opciones, valor, desc, onValor, onDesc }: {
  opciones: { clave: T; titulo: string }[]; valor: T; desc: boolean; onValor: (v: T) => void; onDesc: () => void;
}) {
  return (
    <label className="gente__seccion">
      <span>Ordenar por</span>
      <select className="select" value={valor} onChange={(e) => onValor(e.target.value as T)}>
        {opciones.map((o) => <option key={o.clave} value={o.clave}>{o.titulo}</option>)}
      </select>
      <button type="button" className="link-action" onClick={onDesc} aria-label={desc ? "De más a menos; cambiar a de menos a más" : "De menos a más; cambiar a de más a menos"}>
        {desc ? "de más a menos ↓" : "de menos a más ↑"}
      </button>
    </label>
  );
}
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "—");
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const nombreLote = (l: string) => `E${l.slice(1)}`;

/* ------------------------------------------------------------ lo compartido */

interface Gente {
  todos: Map<string, UsoCredencial>;
  porLote: Map<string, Map<string, UsoCredencial>>;
  huerfanas: UsoCredencial[];
  usoDe: (r: Registro, lote: string) => UsoCredencial | undefined;
  seccionDe: (r: Registro) => string;
  /** Si el expediente es gente de ese estacionamiento: tiene la pluma, o entro por ahi. */
  esDelLote: (r: Registro, lote: string) => boolean;
  entradasDe: (r: Registro, lote: string) => number;
  linea: (lote: string) => (r: Registro) => ReactNode;
  avisosExtra: (r: Registro) => string[];
}

/** Lo que las dos vistas saben de cada persona a partir de la medicion y los padrones. */
function prepararGente(m: Medicion, personas: Map<string, PersonaZk> | null, fuentes: Map<string, Fuentes> | null): Gente {
  const todos = new Map(m.porCredencial.map((u) => [u.tarjeta, u]));
  const porLote = new Map(m.ocupacion.map((o) => [o.lote as string, new Map(o.porCredencial.map((u) => [u.tarjeta, u]))]));
  const normaRota = new Set(m.fueraDeNorma.map((u) => u.tarjeta));
  const huerfanas = fuentes === null ? [] : m.porCredencial.filter((u) => esHuerfana(fuentes.get(u.tarjeta)));

  const usoDe = (r: Registro, lote: string) => {
    if (!r.noDispositivo) return undefined;
    return lote === "ambos" ? todos.get(r.noDispositivo) : porLote.get(lote)?.get(r.noDispositivo);
  };
  const seccionDe = (r: Registro) =>
    personas
      ? (r.noDispositivo ? personas.get(r.noDispositivo)?.departamento : undefined) || SIN_ZK
      : GRUPO_POR_TIPO[r.tipoUsuario] ?? SIN_CLASIFICAR;
  const esDelLote = (r: Registro, lote: string) => {
    if (!r.noDispositivo) return false;
    const u = usoDe(r, lote);
    if (lote === "ambos") return r.estacionamientos.length > 0 || u !== undefined;
    return r.estacionamientos.includes(lote) || u !== undefined;
  };
  const entradasDe = (r: Registro, lote: string) => {
    const u = usoDe(r, lote);
    return u ? u.estancias + u.censuradas : 0;
  };
  const linea = (lote: string) => (r: Registro): ReactNode => {
    const u = usoDe(r, lote);
    const sec = seccionDe(r);
    return u
      ? `${sec} · ${plural(u.estancias + u.censuradas, "entrada", "entradas")} en ${plural(u.dias, "día", "días")} · ${dur(u.medianaMin)} por visita`
      : `${sec} · sin pasos en los días cargados`;
  };
  // Lo que la bitacora y ZK saben de la persona y el expediente no. Cada aviso es una
  // frase completa: se lee en «Lo que no cuadra», junto a los del expediente.
  const avisosExtra = (r: Registro): string[] => {
    const out: string[] = [];
    const t = r.noDispositivo;
    if (!t) return out;
    const p = personas?.get(t);
    const u = todos.get(t);
    if (personas && !p) out.push("El padrón de personas de ZK no conoce este TAG: o el padrón está desactualizado, o la credencial no se administra ahí.");
    if (p && nombreDepto(p.departamento) === DEPTO_BAJAS) out.push("En ZK está en el departamento BAJAS y aun así abre la pluma: una baja que abre es una baja que no se aplicó.");
    if (p && nombreDepto(p.departamento) === DEPTO_STOCK) out.push("En ZK cruza con el departamento de stock: es una instalación del día, porque el TAG pasa la pluma antes de que se suba el padrón.");
    if (u?.rol === SIN_CLASIFICAR) out.push("Ni SATAG ni ZK dicen a qué grupo pertenece: en ZK está en «General». Clasificarla en ZK y volver a exportar el padrón la acomoda.");
    if (normaRota.has(t) && u) {
      out.push(
        `Se queda de más: su permanencia mediana es ${dur(u.medianaMin)} en ${plural(u.estancias, "estancia medida", "estancias medidas")}, al menos el triple de la de su grupo y más de cuatro horas. No está prohibido; conviene saber si la credencial corresponde a quien la usa.`,
      );
    }
    return out;
  };
  return { todos, porLote, huerfanas, usoDe, seccionDe, esDelLote, entradasDe, linea, avisosExtra };
}

const coincide = (r: Registro, texto: string) =>
  !texto ||
  [r.usuarioNombre, r.gestionanteNombre ?? "", r.apellidosFamilia ?? "", r.placas ?? "", r.noDispositivo ?? "", r.folio]
    .join(" ")
    .toLowerCase()
    .includes(texto);

function Huerfanas({ huerfanas }: { huerfanas: UsoCredencial[] }) {
  if (huerfanas.length === 0) return null;
  return (
    <div className="alerta-huerfanas" role="alert">
      <p className="alerta-huerfanas__t">
        {huerfanas.length === 1
          ? "Hay 1 credencial que no está en ningún padrón"
          : `Hay ${huerfanas.length} credenciales que no están en ningún padrón`}
      </p>
      <p className="alerta-huerfanas__p">
        Ni en SATAG, ni en la hoja de cálculo, ni en ZKBioSecurity. Abrieron la pluma{" "}
        {huerfanas.reduce((a, u) => a + u.estancias + u.censuradas, 0)} veces y no se sabe de quién son, así que no pueden
        tener ficha: aquí solo se listan.
      </p>
      <ul className="alerta-huerfanas__l">
        {huerfanas.map((u) => (
          <li key={u.tarjeta}>
            <strong>{u.tarjeta}</strong> · {u.estancias + u.censuradas} entradas · {plural(u.dias, "día", "días")} · la más larga{" "}
            {dur(u.maxMin)} · por el {u.lotes.map((l) => nombreLote(l)).join(" y el ")}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface PropsComunes {
  m: Medicion;
  /** El padron completo de SATAG; se recorta aqui. Vacio mientras carga. */
  registros: Registro[];
  cargando: boolean;
  error: string | null;
  /** El padron de personas de ZK, si esta cargado: da la seccion fina. */
  personas: Map<string, PersonaZk> | null;
  fuentes: Map<string, Fuentes> | null;
  rol: RolPanel;
  onReintentar: () => void;
}

const textoVacio = (cargando: boolean, registros: Registro[], filtrando: boolean) =>
  cargando
    ? "Leyendo el padrón…"
    : registros.length === 0
      ? "No se pudo leer el padrón."
      : filtrando
        ? "Nadie coincide con esa búsqueda."
        : "Nadie tiene pluma ni entró por aquí en los días cargados.";

/* ------------------------------------------------------------ Estacionamientos */

export default function GenteEstacionamiento({ m, registros, cargando, error, personas, fuentes, rol, onReintentar }: PropsComunes) {
  const [lote, setLote] = useState(ultimoLote);
  const [seccion, setSeccion] = useState(ultimaSeccion);
  const [q, setQ] = useState("");
  const [orden, setOrden] = useState<OrdenGente>(ultimoOrdenGente);
  const [desc, setDesc] = useState(ultimoDescGente);
  // La memoria del modulo se escribe en un efecto, no en el manejador: es lo que el
  // compilador de React acepta como escritura fuera del render.
  useEffect(() => {
    ultimoLote = lote;
    ultimaSeccion = seccion;
    ultimoOrdenGente = orden;
    ultimoDescGente = desc;
  }, [lote, seccion, orden, desc]);
  const g = useMemo(() => prepararGente(m, personas, fuentes), [m, personas, fuentes]);

  const delLote = registros.filter((r) => g.esDelLote(r, lote));
  const conteo = new Map<string, number>();
  for (const r of delLote) conteo.set(g.seccionDe(r), (conteo.get(g.seccionDe(r)) ?? 0) + 1);
  const secciones = [...conteo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
  const seccionActiva = secciones.some(([s]) => s === seccion) ? seccion : TODAS;

  const texto = q.trim().toLowerCase();
  const filtrados = delLote
    .filter((r) => seccionActiva === TODAS || g.seccionDe(r) === seccionActiva)
    .filter((r) => coincide(r, texto))
    .sort((a, b) => {
      const ua = g.usoDe(a, lote), ub = g.usoDe(b, lote);
      const nombre = a.usuarioNombre.localeCompare(b.usuarioNombre, "es");
      let d = 0;
      if (orden === "entradas") d = g.entradasDe(a, lote) - g.entradasDe(b, lote);
      else if (orden === "visita") d = (ua?.medianaMin ?? -1) - (ub?.medianaMin ?? -1);
      else if (orden === "ultima") d = (ua?.ultimoDia ?? "").localeCompare(ub?.ultimoDia ?? "");
      else d = -nombre;
      if (desc) d = -d;
      return d || nombre;
    });
  const ordenDicho = `${ORDENES_GENTE.find((o) => o.clave === orden)?.dicho ?? ""}, ${orden === "nombre" ? (desc ? "de la Z a la A" : "de la A a la Z") : desc ? "de más a menos" : "de menos a más"}`;

  const dias = m.dias.length;
  const usaron = delLote.filter((r) => g.usoDe(r, lote) !== undefined).length;
  const sinPasos = delLote.length - usaron;
  let titular: string;
  let bajada: string;
  if (lote === "ambos") {
    const e1 = g.porLote.get("E1") ?? new Map<string, UsoCredencial>();
    const e2 = g.porLote.get("E2") ?? new Map<string, UsoCredencial>();
    const ambos = [...e1.keys()].filter((t) => e2.has(t)).length;
    titular = `${plural(g.todos.size, "credencial abrió", "credenciales abrieron")} la pluma en estos ${dias} días: ${e2.size - ambos} solo en el E2, ${e1.size - ambos} solo en el E1 y ${ambos} en los dos.`;
    bajada = `${plural(delLote.length, "expediente tiene", "expedientes tienen")} pluma o entraron${sinPasos > 0 ? `; ${sinPasos} con derecho no entraron ni una vez` : ""}. Elija a alguien para ver su ficha completa: sus pasos por la pluma, sus TAGs, su vehículo y lo que no cuadra. Puede cambiar por qué se ordena la lista.`;
  } else {
    const cred = g.porLote.get(lote)?.size ?? 0;
    const top = secciones[0] ?? null;
    titular = `Por el ${nombreLote(lote)} entraron ${plural(cred, "credencial", "credenciales")} en estos ${dias} días${top ? `; ${top[0]} es la sección más numerosa, con ${top[1]}` : ""}.`;
    bajada = `${plural(delLote.length, "expediente tiene", "expedientes tienen")} esa pluma o entraron por ahí${sinPasos > 0 ? `; ${sinPasos} con derecho no la usaron ni una vez` : ""}. Puede cambiar por qué se ordena la lista.`;
  }

  return (
    <>
      <Huerfanas huerfanas={lote === "ambos" ? g.huerfanas : g.huerfanas.filter((u) => u.lotes.includes(lote as UsoCredencial["lotes"][number]))} />

      <p className="titular__migas">
        <span>Estacionamiento</span>
        <span>›</span>
        <span>Estacionamientos</span>
      </p>
      <h2 className="titular">{titular}</h2>
      <p className="titular__sub">{bajada}</p>

      <div className="gente__filtros">
        <Segmentado
          etiqueta="Estacionamiento"
          activa={lote}
          onCambio={setLote}
          opciones={[...m.ocupacion.map((o) => ({ clave: o.lote, titulo: nombreLote(o.lote) })), { clave: "ambos", titulo: "Los dos" }]}
        />
        <label className="gente__seccion">
          <span>{personas ? "Sección" : "Grupo"}</span>
          <select className="select" value={seccionActiva} onChange={(e) => setSeccion(e.target.value)}>
            <option value={TODAS}>{personas ? "Todas las secciones" : "Todos los grupos"} ({delLote.length})</option>
            {secciones.map(([s, n]) => (
              <option key={s} value={s}>{s} ({n})</option>
            ))}
          </select>
        </label>
        <input
          className="input search gente__buscar"
          type="search"
          placeholder="Buscar por nombre, placa, No. de TAG o folio…"
          aria-label="Buscar por nombre, placa, No. de TAG o folio"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Orden opciones={ORDENES_GENTE} valor={orden} desc={desc} onValor={setOrden} onDesc={() => setDesc((v) => !v)} />
      </div>

      {error && (
        <p className="submit-error" role="alert">
          {error}{" "}
          <button type="button" className="link-action" onClick={onReintentar}>Reintentar</button>
        </p>
      )}

      <FichaPersona
        registros={filtrados}
        todos={registros}
        rol={rol}
        vacio={textoVacio(cargando, registros, texto !== "" || seccionActiva !== TODAS)}
        linea={g.linea(lote)}
        avisosExtra={g.avisosExtra}
        orden={ordenDicho}
      />
    </>
  );
}

/* ------------------------------------------------------------ Secciones */

/** Con cuantas estancias en cada estacionamiento vale la pena comparar una seccion. */
const MIN_PARA_COMPARAR = 5;
/** Una seccion de jornada larga: la mitad de su gente se queda media jornada o mas. */
const JORNADA_LARGA_MIN = 240;

export function SeccionesEstacionamiento({
  m,
  cupos,
  registros,
  cargando,
  error,
  personas,
  fuentes,
  rol,
  onReintentar,
}: PropsComunes & { cupos: Record<string, number | null> }) {
  const [abierta, setAbierta] = useState<string | null>(ultimaAbierta);
  const [verComposicion, setVerComposicion] = useState(false);
  const [orden, setOrden] = useState<OrdenSeccion>(ultimoOrdenSeccion);
  const [desc, setDesc] = useState(ultimoDescSeccion);
  useEffect(() => {
    ultimaAbierta = abierta;
    ultimoOrdenSeccion = orden;
    ultimoDescSeccion = desc;
  }, [abierta, orden, desc]);
  const abrir = (s: string) => setAbierta((v) => (v === s ? null : s));
  const g = useMemo(() => prepararGente(m, personas, fuentes), [m, personas, fuentes]);

  const porSeccion = m.porDepartamento.length > 0;
  const valorDe = (x: EstanciasRol) =>
    orden === "cajones" ? x.cajonesAlaVez : orden === "mediana" ? (x.medianaMin ?? 0) : orden === "credenciales" ? x.credenciales : x.estancias;
  const secs: EstanciasRol[] = [...(porSeccion ? m.porDepartamento : m.estancias)]
    .filter((x) => x.estancias > 0)
    .sort((a, b) => (desc ? valorDe(b) - valorDe(a) : valorDe(a) - valorDe(b)) || b.cajonesAlaVez - a.cajonesAlaVez);
  // El titular habla de la que mas lugares ocupa, se ordene como se ordene.
  const top = [...secs].sort((a, b) => b.cajonesAlaVez - a.cajonesAlaVez)[0] ?? null;
  const ordenDicho = `${ORDENES_SECCION.find((o) => o.clave === orden)?.dicho ?? ""}, ${desc ? "de más a menos" : "de menos a más"}`;
  const cupoTotal = m.ocupacion.every((o) => (cupos[o.lote] ?? null) !== null)
    ? m.ocupacion.reduce((a, o) => a + (cupos[o.lote] ?? 0), 0)
    : null;
  const credTotal = m.porCredencial.length;
  const largasSecs = secs.filter((x) => (x.medianaMin ?? 0) >= JORNADA_LARGA_MIN);
  const credLargas = largasSecs.reduce((a, x) => a + x.credenciales, 0);
  const enPicoLargas = largasSecs.reduce((a, x) => a + x.cajonesEnElPico, 0);
  const topeCajones = Math.max(...secs.map((x) => x.cajonesAlaVez), 1);
  const totalEstancias = m.estancias.reduce((a, r) => a + r.estancias, 0);
  const largas = m.estancias.reduce((a, r) => a + r.largas, 0);
  const cortas = m.estancias.reduce((a, r) => a + r.cortas, 0);

  // La misma seccion en el E1 y en el E2, cuando hay con que comparar.
  const dep1 = m.ocupacion.find((o) => o.lote === "E1")?.porDepartamento ?? [];
  const dep2 = m.ocupacion.find((o) => o.lote === "E2")?.porDepartamento ?? [];
  const comparada = (depto: string) => {
    const e1 = dep1.find((r) => r.rol === depto) ?? null;
    const e2 = dep2.find((r) => r.rol === depto) ?? null;
    return e1 && e2 && e1.estancias >= MIN_PARA_COMPARAR && e2.estancias >= MIN_PARA_COMPARAR ? { e1, e2 } : null;
  };

  const unidad = porSeccion ? "sección" : "grupo";
  const unidades = porSeccion ? "las secciones" : "los grupos";
  const titular = top === null
    ? "Todavía no hay estancias medidas por sección."
    : `${top.rol} es ${porSeccion ? "la sección" : "el grupo"} que más lugares ocupa a la vez: ${top.cajonesAlaVez}${cupoTotal !== null ? ` de ${cupoTotal} cajones` : ""}.`;
  const bajada = largasSecs.length > 0
    ? `${porSeccion ? "Las secciones" : "Los grupos"} de jornada larga —${largasSecs.slice(0, 3).map((x) => x.rol).join(", ")}${largasSecs.length > 3 ? " y más" : ""}— son ${pct(credLargas, credTotal)} de las credenciales y en el peor momento seguían dentro ${enPicoLargas} de sus coches: son la carga base del día. Lo que cuesta un lugar es cuánto tiempo se queda ocupado, no cuántas veces se usa. Abra una ${unidad} para ver a su gente.`
    : `Lo que cuesta un lugar es cuánto tiempo se queda ocupado, no cuántas veces se usa. Abra una ${unidad} para ver a su gente.`;
  const cajon = (n: number) => `${n} ${n === 1 ? "cajón" : "cajones"}`;

  return (
    <>
      <Huerfanas huerfanas={g.huerfanas} />

      <p className="titular__migas">
        <span>Estacionamiento</span>
        <span>›</span>
        <span>Secciones</span>
        {!porSeccion && <span>› por grupo, sin el padrón de ZK</span>}
      </p>
      <h2 className="titular">{titular}</h2>
      <p className="titular__sub">{bajada}</p>

      {error && (
        <p className="submit-error" role="alert">
          {error}{" "}
          <button type="button" className="link-action" onClick={onReintentar}>Reintentar</button>
        </p>
      )}

      <div className="gente__filtros">
        <Orden opciones={ORDENES_SECCION} valor={orden} desc={desc} onValor={setOrden} onDesc={() => setDesc((v) => !v)} />
        <span className="ti-hint">{secs.length} {porSeccion ? "secciones" : "grupos"} {ordenDicho}; la barra es «cajones a la vez».</span>
      </div>

      <div className="filas">
        {secs.map((x) => {
          const esta = abierta === x.rol;
          const c = esta ? comparada(x.rol) : null;
          const gente = esta
            ? registros
                .filter((r) => g.seccionDe(r) === x.rol && g.esDelLote(r, "ambos"))
                .sort((a, b) => g.entradasDe(b, "ambos") - g.entradasDe(a, "ambos") || a.usuarioNombre.localeCompare(b.usuarioNombre, "es"))
            : [];
          const conExpediente = esta ? gente.filter((r) => g.usoDe(r, "ambos") !== undefined).length : 0;
          return (
            <div className="fila" key={x.rol} data-abierta={esta}>
              <button type="button" className="fila__b" aria-expanded={esta} onClick={() => abrir(x.rol)}>
                <span className="fila__q">
                  {x.rol}
                  <span className="fila__track" aria-hidden="true"><i style={{ width: `${Math.round((x.cajonesAlaVez / topeCajones) * 100)}%` }} /></span>
                </span>
                <span className="fila__a">{cajon(x.cajonesAlaVez)} · {dur(x.medianaMin)}</span>
                <span className="fila__flecha" aria-hidden="true">›</span>
              </button>
              {esta && (
                <div className="fila__det fila__det--ancho">
                  <p>
                    {plural(x.credenciales, "credencial", "credenciales")} y {x.estancias} estancias medidas en estos {m.dias.length} días. Llega a
                    ocupar {cajon(x.cajonesAlaVez)} a la vez en su propio peor momento; en el peor momento del estacionamiento seguían
                    dentro {x.cajonesEnElPico}.
                  </p>
                  <p>
                    La mitad de su gente se queda entre {dur(x.p25Min)} y {dur(x.p75Min)}. {x.cortas} ({pct(x.cortas, x.estancias)}) son de
                    media hora o menos y {x.largas} ({pct(x.largas, x.estancias)}) de cuatro horas o más.
                    {x.censuradas > 0 ? ` ${x.censuradas} entradas quedaron sin salida leída y no se midieron.` : ""}
                    {c && (
                      <>
                        {" "}En el E1 su mediana es {dur(c.e1.medianaMin)} en {c.e1.estancias} estancias; en el E2, {dur(c.e2.medianaMin)} en{" "}
                        {c.e2.estancias}.{" "}
                        {Math.abs((c.e1.medianaMin ?? 0) - (c.e2.medianaMin ?? 0)) <= 15
                          ? "Se comporta igual en los dos: la diferencia entre estacionamientos es quién entra a cada uno, no cómo se queda."
                          : "Diverge entre los dos: bajo ese nombre hay gente de tipos distintos."}
                      </>
                    )}
                  </p>
                  {!cargando && registros.length > 0 && x.credenciales > conExpediente && (
                    <p className="ti-hint">
                      {plural(x.credenciales - conExpediente, "credencial de esta sección no tiene", "credenciales de esta sección no tienen")} expediente en SATAG
                      y por eso no aparecen abajo. Eso lo resuelve la migración.
                    </p>
                  )}
                  <FichaPersona
                    registros={gente}
                    todos={registros}
                    rol={rol}
                    vacio={textoVacio(cargando, registros, false)}
                    linea={g.linea("ambos")}
                    avisosExtra={g.avisosExtra}
                    orden="por veces que entró, de más a menos"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <section className="seccion-plana">
        <h3>Hay dos poblaciones, y se ven separadas</h3>
        <p className="sub">
          No es una distribución con una media: son dos montones. El de la izquierda deja y arranca; el de la derecha
          ocupa el cajón la jornada. El valle no es ruido: es donde termina una población y empieza la otra. En total{" "}
          {totalEstancias.toLocaleString("es-MX")} estancias medidas, {cortas} de media hora o menos ({pct(cortas, totalEstancias)}) y{" "}
          {largas} de cuatro horas o más ({pct(largas, totalEstancias)}); la mediana de todas es {dur(m.medianaGlobalMin)}.
        </p>
        <HistogramaEstancias grupos={m.histogramaPorRol} />
        <div className="filas" style={{ marginTop: 14 }}>
          <div className="fila" data-abierta={verComposicion}>
            <button type="button" className="fila__b" aria-expanded={verComposicion} onClick={() => setVerComposicion((v) => !v)}>
              <span className="fila__q">Quién compone cada barra</span>
              <span className="fila__a">{m.histogramaPorRol.length} grupos</span>
              <span className="fila__flecha" aria-hidden="true">›</span>
            </button>
            {verComposicion && (
              <div className="fila__det fila__det--ancho">
                <div className="table-wrap">
                  <table className="admin-table tabla-pro">
                    <thead>
                      <tr>
                        <th><span style={{ display: "inline-block", padding: "10px 12px" }}>Permanencia</span></th>
                        {m.histogramaPorRol.map((gr) => (
                          <th key={gr.rol} className="num">
                            <span style={{ display: "inline-block", padding: "10px 12px" }}>{gr.rol}</span>
                          </th>
                        ))}
                        <th className="num"><span style={{ display: "inline-block", padding: "10px 12px" }}>Total</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.histograma.map((c, i) => (
                        <tr key={c.desde}>
                          <td>
                            {c.hasta === null
                              ? `${dur(c.desde)} o más`
                              : `${c.desde === 0 ? "menos de " : `${dur(c.desde)} a `}${dur(c.hasta)}`}
                          </td>
                          {m.histogramaPorRol.map((gr) => (
                            <td key={gr.rol} className="num">
                              {gr.cubetas[i].cuantas}{" "}
                              <span className="ti-hint">({pct(gr.cubetas[i].cuantas, c.cuantas)})</span>
                            </td>
                          ))}
                          <td className="num"><strong>{c.cuantas}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="firme">
        <div>
          <strong>Las medianas de {unidades} de jornada larga son cotas inferiores.</strong> Cuando el lector no registra la
          salida, la estancia no se puede medir, y eso pasa más en {unidades} que se quedan más. Las que se pierden son
          justo las largas, así que el contraste real es mayor que el que se ve aquí, nunca menor.
        </div>
        <div>
          {porSeccion
            ? "Las secciones son los departamentos del control de acceso, no una clasificación nuestra."
            : "Sin el padrón de personas de ZK, se agrupa por los cinco grupos del padrón de SATAG."}{" "}
          «Cajones a la vez» es el máximo de coches de {porSeccion ? "esa sección" : "ese grupo"} dentro al mismo tiempo; cada{" "}
          {unidad} llega al suyo a una hora distinta, así que no suman el pico total.
        </div>
      </div>
    </>
  );
}
