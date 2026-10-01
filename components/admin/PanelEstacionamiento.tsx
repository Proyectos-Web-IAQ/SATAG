"use client";

// La pestana Estacionamiento: uso REAL del estacionamiento, leido de la bitacora de
// accesos de los dos controladores.
//
// EL ORDEN DE LAS VISTAS ES EL ARGUMENTO, y esta puesto en
// Situacion-Complicacion-Resolucion. La Situacion es lo que todos en la sala ya
// aceptan: el estacionamiento se llena. La Complicacion —la ranura donde vive el
// hallazgo— es que NO se llena todo el dia: se llena un cuarto de hora, y la oleada
// que lo llena entra casi toda por la misma pluma. Lo demas es el detalle que
// sostiene eso, cada vez con mas grano: estacionamiento, departamento, persona.
//
// POR QUE LA PERMANENCIA DEL PERSONAL NO ES EL TITULAR. Porque no es una anomalia:
// quien trabaja ocho horas ocupa un cajon ocho horas, y presentarlo como hallazgo se
// lee como un reproche a quien vino a trabajar. Los numeros lo confirman: los coches
// del personal apenas se mueven entre la media manana y el pico. Son carga base.
//
// ES PRESENTACIONAL A PROPOSITO. Recibe las cifras ya medidas y no consulta nada. NI
// UNA MEDIANA SE CALCULA AQUI: la version anterior sacaba la mediana global
// promediando las medianas por grupo y publicaba 4 h 10 m donde la real era 31 min.
// Lo unico que esta pantalla decide es que mostrar y en que orden.
//
// OCUPACION NO ES SATURACION. Mientras `cupo_lugares` siga vacio, esta pantalla puede
// decir cuantos coches hay dentro pero NO si sobran lugares: la saturacion es un
// cociente y le falta el denominador. Eso se dice en pantalla y no en una nota al
// pie, porque es la pregunta que Direccion va a hacer.

import { useState } from "react";
import { diaCorto } from "@/lib/caja";
import { duracion } from "@/lib/duracion";
import {
  horaCorta,
  MINUTO_MESETA,
  UMBRAL_SHOUP,
  type Eleccion,
  type EstanciasRol,
  type Medicion,
  type UsoCredencial,
} from "@/lib/estacionamiento";
import type { ResumenEventos } from "@/lib/zk/eventos";
import { esHuerfana, type Fuentes, type PersonaZk } from "@/lib/zk/padron";
import { EstanciasPorRol, HistogramaEstancias, OcupacionDelDia } from "@/components/admin/GraficasEstacionamiento";
import { Kpi, Kpis, Seccion, Segmentado, TablaPro, Vistas, type Columna } from "@/components/admin/UiEstacionamiento";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const dur = (min: number | null | undefined) => duracion((min ?? 0) * 60_000);

/** Departamentos de ZK que, si aparecen en la bitácora, son el hallazgo. */
const DEPTO_BAJAS = "10";
const DEPTO_STOCK = "3";

interface Señal {
  clave: string;
  texto: string;
  /**
   * Si cuenta para «por revisar».
   *
   * NO TODA SEÑAL ES UN PENDIENTE, y confundirlo rompe el unico canal que avisa.
   * Mientras la migracion no corra, «sin expediente en SATAG» le toca a casi todas
   * las credenciales: contarlas hacia que la pestana dijera «511 por revisar», que
   * cada seccion dijera su propio total y que los 511 renglones salieran resaltados.
   * Un resaltado que distingue a todos no distingue a ninguno, y lo que de verdad
   * hay que resolver —una huerfana, dos bajas, dieciocho fuera de norma— quedaba
   * enterrado debajo de la misma insignia repetida quinientas veces.
   *
   * Las dos que informan y no piden accion: «sin expediente» (lo resuelve la
   * migracion, de una vez y para todas) y «stock SATAG» (que la propia pantalla
   * declara normal).
   */
  pendiente: boolean;
  /**
   * El tono de `.status-chip`.
   *
   * El rojo (`bloqueado`) está reservado para UNA sola señal: la credencial que no
   * aparece en ningún padrón. Todo lo demás es «conviene mirarlo», que no es una
   * alerta. Si el rojo se gasta en lo que solo hay que revisar, deja de significar
   * «hay que resolverlo hoy» y la pantalla entera pierde un canal.
   */
  tono: "pendiente" | "baja" | "activo" | "bloqueado";
  porque: string;
}

const SEÑAL: Record<string, Señal> = {
  fueraDeNorma: {
    clave: "fueraDeNorma",
    pendiente: true,
    texto: "se queda de más",
    tono: "pendiente",
    porque:
      "Su permanencia mediana es al menos el triple de la de su propio grupo y pasa de cuatro horas. No está prohibido: conviene saber si la credencial corresponde a quien la usa.",
  },
  deBaja: {
    clave: "deBaja",
    pendiente: true,
    texto: "dada de baja",
    tono: "pendiente",
    porque:
      "Está en el departamento BAJAS del control de acceso y aun así abrió la pluma. Una baja que abre es una baja que no se aplicó.",
  },
  stock: {
    clave: "stock",
    pendiente: false,
    texto: "stock SATAG",
    tono: "activo",
    porque:
      "Cruzó con el departamento de stock: es una instalación del día, porque el TAG pasa la pluma antes de que se suba el padrón a ZK, que se sube al cierre.",
  },
  sinPadron: {
    clave: "sinPadron",
    pendiente: true,
    texto: "sin padrón",
    tono: "baja",
    porque:
      "El control de acceso le abrió, pero el export de personas no la conoce. O el padrón está desactualizado, o es una credencial que nadie administra.",
  },
  sinExpediente: {
    clave: "sinExpediente",
    pendiente: false,
    texto: "sin expediente en SATAG",
    tono: "pendiente",
    porque:
      "Aparece en ZK o en la hoja histórica, pero todavía no tiene expediente en SATAG. Es lo que la migración resuelve.",
  },
  huerfana: {
    clave: "huerfana",
    pendiente: true,
    texto: "NO ESTÁ EN NINGÚN PADRÓN",
    tono: "bloqueado",
    porque:
      "Abrió la pluma y no aparece ni en SATAG, ni en la hoja de cálculo, ni en ZK. Es un vehículo con acceso del que no se sabe nada.",
  },
};

interface FilaPersona {
  uso: UsoCredencial;
  persona: PersonaZk | null;
  señales: Señal[];
}

interface Agrupado {
  nombre: string;
  filas: FilaPersona[];
  credenciales: number;
  entradas: number;
  minutos: number;
  marcadas: number;
  mediana: number | null;
  /** Cuantos cajones ocupa a la vez, en su propio peor momento. */
  cajones: number;
  /** Cuantos ocupaba en el peor momento del estacionamiento. Suma al pico total. */
  enPico: number;
}

export interface DatosEstacionamiento {
  m: Medicion;
  eleccion: Eleccion;
  resumen: ResumenEventos;
  /** Cajones por estacionamiento. `null` mientras nadie los haya contado. */
  cupos: Record<string, number | null>;
  /**
   * Quién es cada tarjeta. `null` mientras no se cargue el padrón de personas.
   *
   * Sin él la pantalla funciona igual y todo cae en «sin padrón»: una pantalla que
   * exige dos archivos para dibujar algo es una pantalla que no dibuja nada el día
   * que uno de los dos se exportó mal.
   */
  padron: Map<string, PersonaZk> | null;
  /**
   * En qué padrones aparece cada credencial: SATAG, la hoja histórica y ZK.
   *
   * Es lo que hace verificable la regla de que ni un TAG ni un nombre salga en esta
   * pantalla sin expediente en SATAG. Las que no están en ninguna se señalan en
   * grande y en rojo, porque es lo único de aquí que hay que resolver hoy.
   */
  fuentes: Map<string, Fuentes> | null;
  /**
   * Si esta sesión puede ver nombres. Lo decide el ROL, no el componente.
   *
   * La RLS de Postgres es por fila y no por columna, así que esta puerta es del
   * cliente: una cortesía de la pantalla, no una garantía de la base.
   */
  verIdentidad: boolean;
  /** Ventanas de ocho días ya cargadas, para saber si la serie alcanza. */
  ventanas: number;
  /** Días que faltan entre esta ventana y la anterior. Un hueco invalida la serie. */
  huecoDias: number | null;
}

/**
 * La tabla de personas de una seccion.
 *
 * VIVE FUERA DEL COMPONENTE A PROPOSITO. Definida dentro del render, React la trata
 * como un tipo nuevo en cada pintada, la desmonta y la vuelve a montar: el buscador
 * se vaciaria solo y el orden por columna se perderia al tocar cualquier otra cosa
 * de la pantalla. Es un defecto de verdad, no una queja del linter.
 */
function TablaPersonas({
  filas,
  cols,
  verIdentidad,
  conPadron,
}: {
  filas: FilaPersona[];
  cols: (tope: number) => Columna<FilaPersona>[];
  verIdentidad: boolean;
  conPadron: boolean;
}) {
  if (!verIdentidad) {
    return <p className="ti-hint">El detalle por persona lo ve el personal autorizado para operar el padrón.</p>;
  }
  const tope = Math.max(...filas.map((f) => f.uso.medianaMin ?? 0), 1);
  return (
    <TablaPro
      filas={filas}
      cols={cols(tope)}
      claveFila={(f) => f.uso.tarjeta}
      ordenInicial="mediana"
      buscar={conPadron ? (f) => `${f.persona?.nombre ?? ""} ${f.uso.tarjeta}` : undefined}
      etiquetaBusqueda="Buscar por nombre o credencial"
      marcada={(f) => f.señales.some((x) => x.pendiente)}
      scroll
    />
  );
}

/**
 * La lista de secciones a un lado y la gente de la elegida al otro.
 *
 * Sustituye a un acordeon: con catorce secciones y trescientas credenciales en una
 * de ellas, desplegar hacia abajo hacia que la pagina creciera sin control y que
 * comparar dos secciones obligara a recordar lo que ya no se veia. Aqui la lista
 * siempre esta a la vista y solo cambia el panel de al lado.
 */
function VistaMaestroDetalle({
  grupos,
  elegida,
  onElegir,
  cols,
  verIdentidad,
  conPadron,
}: {
  grupos: Agrupado[];
  elegida: string | null;
  onElegir: (nombre: string) => void;
  cols: (tope: number) => Columna<FilaPersona>[];
  verIdentidad: boolean;
  conPadron: boolean;
}) {
  const topeGrupo = Math.max(...grupos.map((g) => g.cajones), 1);
  const sel = grupos.find((g) => g.nombre === elegida) ?? grupos[0];
  if (!sel) return <p className="ti-empty">No hay credenciales que mostrar.</p>;

  return (
    <div className="md">
      <div className="md__lista" role="list" aria-label="Secciones">
        {grupos.map((s) => (
          <button
            key={s.nombre}
            type="button"
            role="listitem"
            className="md__item"
            aria-current={s.nombre === sel.nombre}
            onClick={() => onElegir(s.nombre)}
          >
            <span className="md__n">
              <span className="md__nombre">{s.nombre}</span>
              <span className="md__v">{s.cajones} {s.cajones === 1 ? "cajón" : "cajones"}</span>
            </span>
            <span className="barra-celda" aria-hidden="true">
              <i style={{ width: `${Math.round((s.cajones / topeGrupo) * 100)}%` }} />
            </span>
            <span className="md__sub">
              {s.credenciales} credenciales · {s.entradas} entradas · mediana{" "}
              {duracion((s.mediana ?? 0) * 60_000)}
              {s.marcadas > 0 && (
                <>
                  {" · "}
                  <span className="status-chip status-chip--pendiente">{s.marcadas} por revisar</span>
                </>
              )}
            </span>
          </button>
        ))}
      </div>

      <div className="md__panel">
        <Kpis>
          <Kpi
            rotulo="Cajones que ocupa a la vez"
            valor={sel.cajones}
            pie={<>en su propio peor momento · {sel.enPico} de ellos seguían ahí en el peor momento del estacionamiento</>}
            marcada
          />
          <Kpi rotulo="Credenciales" valor={sel.credenciales} pie={`${sel.entradas} entradas en la ventana`} />
          <Kpi
            rotulo="Permanencia mediana"
            valor={duracion((sel.mediana ?? 0) * 60_000)}
            pie="de sus estancias medidas"
          />
        </Kpis>
        <TablaPersonas filas={sel.filas} cols={cols} verIdentidad={verIdentidad} conPadron={conPadron} />
      </div>
    </div>
  );
}

export default function PanelEstacionamiento({ d }: { d: DatosEstacionamiento }) {
  const { m, eleccion, resumen, cupos, padron, fuentes, verIdentidad } = d;
  const [vista, setVista] = useState("resumen");
  const [lote, setLote] = useState<string>(m.ocupacion.find((o) => o.pico.dentro > 0)?.lote ?? "E2");
  // Que seccion esta elegida en cada maestro-detalle. Van por separado para que
  // cambiar de pestana no pierda lo que se estaba mirando en la otra.
  const [sel, setSel] = useState<Record<string, string>>({});

  const totalEstancias = m.estancias.reduce((a, r) => a + r.estancias, 0);
  const largas = m.estancias.reduce((a, r) => a + r.largas, 0);
  const cortas = m.estancias.reduce((a, r) => a + r.cortas, 0);
  const censuradas = m.estancias.reduce((a, r) => a + r.censuradas, 0);
  const enPicoTotal = m.enElPico.reduce((a, r) => a + r.coches, 0);
  const enMesetaTotal = m.enLaMeseta.reduce((a, r) => a + r.coches, 0);
  const sinCupos = Object.values(cupos).every((c) => c === null);

  const esPersonal = (rol: string) => rol === "Personal docente" || rol === "Administración y servicios";
  const suma = (filas: { rol: string; coches: number }[]) =>
    filas.filter((r) => esPersonal(r.rol)).reduce((a, r) => a + r.coches, 0);
  const personalPico = suma(m.enElPico);
  const personalMeseta = suma(m.enLaMeseta);

  const oleadaE2 = m.oleada.porLote.find((x) => x.lote === "E2")?.coches ?? 0;
  const oleadaE1 = m.oleada.porLote.find((x) => x.lote === "E1")?.coches ?? 0;

  // Las señales de catálogo son BÚSQUEDAS en el padrón, no aritmética: por eso viven
  // aquí y no en lib/. La estadística —quién se sale de la norma de su grupo— sí
  // viene medida, en `m.fueraDeNorma`.
  const normaRota = new Set(m.fueraDeNorma.map((u) => u.tarjeta));
  const filaDe = (u: UsoCredencial): FilaPersona => {
    const p = padron?.get(u.tarjeta) ?? null;
    const señales: Señal[] = [];
    const fu = fuentes?.get(u.tarjeta);
    if (fuentes !== null && esHuerfana(fu)) señales.push(SEÑAL.huerfana);
    else if (fuentes !== null && !fu!.satag) señales.push(SEÑAL.sinExpediente);
    if (padron !== null && p === null && !(fuentes !== null && esHuerfana(fu))) señales.push(SEÑAL.sinPadron);
    if (p?.departamentoId === DEPTO_BAJAS) señales.push(SEÑAL.deBaja);
    if (p?.departamentoId === DEPTO_STOCK) señales.push(SEÑAL.stock);
    if (normaRota.has(u.tarjeta)) señales.push(SEÑAL.fueraDeNorma);
    return { uso: u, persona: p, señales };
  };

  /** Agrupa credenciales por departamento, de mayor a menor uso de cajón. */
  const agrupar = (usos: UsoCredencial[], medianas: EstanciasRol[]): Agrupado[] => {
    const g = new Map<string, FilaPersona[]>();
    for (const u of usos) {
      const f = filaDe(u);
      const clave = padron === null ? "Todas las credenciales" : f.persona?.departamento || "No está en el padrón";
      const a = g.get(clave);
      if (a) a.push(f);
      else g.set(clave, [f]);
    }
    return [...g.entries()]
      .map(([nombre, filas]) => ({
        nombre,
        filas: [...filas].sort((a, b) => b.uso.totalMin - a.uso.totalMin),
        credenciales: filas.length,
        entradas: filas.reduce((a, f) => a + f.uso.estancias + f.uso.censuradas, 0),
        minutos: filas.reduce((a, f) => a + f.uso.totalMin, 0),
        marcadas: filas.filter((f) => f.señales.some((x) => x.pendiente)).length,
        mediana: medianas.find((r) => r.rol === nombre)?.medianaMin ?? null,
        cajones: medianas.find((r) => r.rol === nombre)?.cajonesAlaVez ?? 0,
        enPico: medianas.find((r) => r.rol === nombre)?.cajonesEnElPico ?? 0,
      }))
      .sort((a, b) => b.cajones - a.cajones || b.minutos - a.minutos);
  };

  const secciones = agrupar(m.porCredencial, m.porDepartamento);
  const huerfanas = fuentes === null ? [] : m.porCredencial.filter((u) => esHuerfana(fuentes.get(u.tarjeta)));
  const sinExpediente = fuentes === null ? [] : m.porCredencial.filter((u) => {
    const f = fuentes.get(u.tarjeta);
    return f !== undefined && !f.satag && (f.hoja || f.zk);
  });
  const totalMarcadas = secciones.reduce((a, s) => a + s.marcadas, 0);
  const oActivo = m.ocupacion.find((o) => o.lote === lote) ?? m.ocupacion[0];
  const seccionesDelLote = oActivo ? agrupar(oActivo.porCredencial, oActivo.porDepartamento) : [];

  const MIN_PARA_COMPARAR = 5;
  const dep1 = m.ocupacion.find((o) => o.lote === "E1")?.porDepartamento ?? [];
  const dep2 = m.ocupacion.find((o) => o.lote === "E2")?.porDepartamento ?? [];
  const comparativa = [...new Set([...dep1, ...dep2].map((r) => r.rol))]
    .map((depto) => ({
      depto,
      e1: dep1.find((r) => r.rol === depto) ?? null,
      e2: dep2.find((r) => r.rol === depto) ?? null,
    }))
    .filter((c) => (c.e1?.estancias ?? 0) >= MIN_PARA_COMPARAR && (c.e2?.estancias ?? 0) >= MIN_PARA_COMPARAR)
    .sort((a, b) => b.e1!.estancias + b.e2!.estancias - (a.e1!.estancias + a.e2!.estancias));

  /* ----------------------------------------------------- la tabla de personas */

  const columnasPersona = (tope: number): Columna<FilaPersona>[] => {
    const cols: Columna<FilaPersona>[] = [];
    if (padron) {
      cols.push({
        clave: "persona",
        titulo: "Persona",
        pie: "según el padrón de ZK",
        celda: (f) => f.persona?.nombre || <span className="ti-hint">no está en el padrón</span>,
        orden: (f) => f.persona?.nombre ?? "zzz",
      });
    }
    cols.push(
      { clave: "tarjeta", titulo: "Credencial", pie: "número de TAG", celda: (f) => f.uso.tarjeta, orden: (f) => f.uso.tarjeta },
      {
        // Para una persona, «uso» es cuantas veces vino. El tiempo acumulado se
        // quito a proposito: era «veces x cuanto se queda» colapsado en una cifra, y
        // al colapsarlas perdia la distincion que importa —quien viene mucho un rato
        // y quien viene poco y se queda— que es justo lo que separan las dos columnas
        // siguientes.
        clave: "entradas",
        titulo: "Entradas",
        pie: "veces que cruzó la pluma",
        num: true,
        celda: (f) => f.uso.estancias + f.uso.censuradas,
        orden: (f) => f.uso.estancias + f.uso.censuradas,
      },
      { clave: "dias", titulo: "Días", pie: "en cuántos días distintos vino", num: true, celda: (f) => f.uso.dias, orden: (f) => f.uso.dias },
      {
        // El orden por omision. «Cuanto se queda cada vez» es la pregunta que
        // separa a quien deja y arranca de quien ocupa el cajon la jornada, y es
        // la que distingue a una persona de otra dentro de su propio grupo.
        // Contar visitas ordenaba por frecuencia, que es otra cosa.
        clave: "mediana",
        titulo: "Tiempo por visita",
        pie: "la mediana de sus estancias",
        num: true,
        celda: (f) => dur(f.uso.medianaMin),
        orden: (f) => f.uso.medianaMin ?? -1,
        barra: (f) => (tope > 0 ? (f.uso.medianaMin ?? 0) / tope : 0),
      },
      {
        clave: "max",
        titulo: "La más larga",
        pie: "su mayor estancia de la ventana",
        num: true,
        celda: (f) => dur(f.uso.maxMin),
        orden: (f) => f.uso.maxMin ?? -1,
      },
      {
        clave: "critica",
        titulo: "En la franja crítica",
        pie: "llegadas en el peor rato del día",
        num: true,
        celda: (f) => f.uso.enOleada,
        orden: (f) => f.uso.enOleada,
      },
      {
        clave: "señales",
        titulo: "Señales",
        pie: "lo que conviene mirar",
        celda: (f) =>
          f.señales.map((x) => (
            <span key={x.clave} className={`status-chip status-chip--${x.tono}`} title={x.porque}
              style={{ marginRight: 4 }}>
              {x.texto}
            </span>
          )),
      },
    );
    return cols;
  };

  /* ----------------------------------------------------------------- vistas */

  const VISTAS = [
    { clave: "resumen", titulo: "Resumen" },
    { clave: "lotes", titulo: "Estacionamientos" },
    { clave: "secciones", titulo: "Secciones", cuenta: totalMarcadas },
    { clave: "permanencia", titulo: "Permanencia" },
    { clave: "calidad", titulo: "Qué tan firme es esto" },
  ];

  return (
    <>
      {d.huecoDias !== null && d.huecoDias > 0 && (
        <p className="submit-error" role="alert">
          Entre esta ventana y la anterior falta <strong>{duracion(d.huecoDias * 86_400_000)}</strong> de
          bitácora. Las cifras de tráfico son válidas, pero el uso por credencial no: una credencial
          que sí pasó en ese hueco aparece aquí como si no se hubiera usado.
        </p>
      )}

      {huerfanas.length > 0 && (
        <div className="alerta-huerfanas" role="alert">
          <p className="alerta-huerfanas__t">
            {huerfanas.length === 1
              ? "Hay 1 credencial que no está en ningún padrón"
              : `Hay ${huerfanas.length} credenciales que no están en ningún padrón`}
          </p>
          <p className="alerta-huerfanas__p">
            Ni en SATAG, ni en la hoja de cálculo, ni en ZKBioSecurity. Abrieron la pluma{" "}
            {huerfanas.reduce((a, u) => a + u.estancias + u.censuradas, 0)} veces y no se sabe de quién
            son. Mientras existan, esta pantalla menciona credenciales sin expediente.
          </p>
          <ul className="alerta-huerfanas__l">
            {huerfanas.map((u) => (
              <li key={u.tarjeta}>
                <strong>{u.tarjeta}</strong> · {u.estancias + u.censuradas} entradas ·{" "}
                {u.dias} {u.dias === 1 ? "día" : "días"} · la más larga {dur(u.maxMin)} · vista por última vez
                el {u.ultimoDia ? diaCorto(u.ultimoDia) : "—"}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Vistas vistas={VISTAS} activa={vista} onCambio={setVista} />

      {/* =============================================== RESUMEN =============== */}
      {vista === "resumen" && (
        <>
          <Kpis>
            <Kpi
              rotulo="Su peor momento dura"
              valor={m.ventana.minutos}
              unidad="min, el día más lleno"
              pie={
                <>
                  {m.ventana.minutos} minutos en total entre las {horaCorta(m.ventana.desde)} y las{" "}
                  {horaCorta(m.ventana.hasta)} —no de corrido— con {m.ventana.umbral} coches o más dentro:
                  el 95% de su máximo de {m.picoTotal.dentro}.
                </>
              }
              marcada
            />
            <Kpi
              rotulo="En el peor momento"
              valor={
                <>
                  {m.picoTotal.dentro}
                  {m.picoTotal.hasta > m.picoTotal.dentro && <span className="kpi__u">–{m.picoTotal.hasta}</span>}
                </>
              }
              unidad="coches"
              pie={<>el {m.picoTotal.dia ? diaCorto(m.picoTotal.dia) : "—"} a las {horaCorta(m.picoTotal.minuto)}</>}
            />
            <Kpi
              rotulo="La oleada que lo produce"
              valor={m.oleada.coches}
              unidad="coches"
              pie={<>entre {horaCorta(m.oleada.desde)} y {horaCorta(m.oleada.hasta)}; se van en {dur(m.oleada.medianaMin)}</>}
            />
            <Kpi
              rotulo="Ventana medida"
              valor={m.dias.length}
              unidad="días"
              pie={<>{m.diasComparables.length} comparables · {d.ventanas === 1 ? "primera exportación" : `${d.ventanas} exportaciones`}</>}
            />
          </Kpis>

          <Seccion
            rotulo="La forma del día"
            titulo={`El ${m.picoTotal.dia ? diaCorto(m.picoTotal.dia) : "día más lleno"}, el estacionamiento estuvo en su peor momento ${m.ventana.minutos} minutos, no toda la jornada`}
            nota={
              <>
                Entre las {horaCorta(m.ventana.desde)} y las {horaCorta(m.ventana.hasta)} hubo{" "}
                {m.ventana.umbral} coches o más dentro durante {m.ventana.minutos} de esos{" "}
                {Math.round((m.ventana.hasta ?? 0) - (m.ventana.desde ?? 0))} minutos: el lleno va y viene.
                El resto del día la ocupación es una meseta plana. La curva es la mediana de los{" "}
                {m.diasComparables.length} días comparables y la banda son sus cuartiles: si la banda es
                estrecha, el día típico existe de verdad.
              </>
            }
          >
            {m.ocupacion.map((o) => (
              <div key={o.lote} style={{ marginTop: 14 }}>
                <h4 className="ti-section-title">
                  Estacionamiento {o.lote.slice(1)} · lo más lleno que se le vio fueron {o.pico.dentro} coches,
                  el {o.pico.dia ? diaCorto(o.pico.dia) : "—"} a las {horaCorta(o.pico.minuto)}
                </h4>
                <OcupacionDelDia o={o} cupo={cupos[o.lote] ?? null} />
              </div>
            ))}
            {/* Sumar los dos maximos da mas que el titular, y la razon no es un error:
                cada estacionamiento llego a su tope en un dia distinto. Decirlo aqui
                cuesta una linea; no decirlo deja a quien sume con la impresion de que
                la pantalla se contradice, que es el defecto que ya costo una vez. */}
            {m.ocupacion.filter((o) => o.pico.dia).length > 1 &&
              new Set(m.ocupacion.map((o) => o.pico.dia).filter(Boolean)).size > 1 && (
                <p className="ti-hint" style={{ marginTop: 10 }}>
                  Los dos máximos suman{" "}
                  {m.ocupacion.reduce((a, o) => a + o.pico.dentro, 0)}, más que los{" "}
                  {m.picoTotal.dentro} del momento más lleno de arriba, y no es una contradicción:{" "}
                  {m.ocupacion
                    .filter((o) => o.pico.dia)
                    .map((o) => `el ${o.lote.slice(1)} llegó a su tope el ${diaCorto(o.pico.dia as string)}`)
                    .join(" y ")}
                  . Cada uno se llenó su propio día, así que nunca estuvieron los dos en su máximo a la vez.
                </p>
              )}
            {sinCupos && (
              <p className="notice" style={{ margin: "14px 0 0", padding: "10px 12px" }}>
                <strong>Estas curvas dicen cuántos coches entraron, no si hubo lugar.</strong> Falta el dato
                más barato de todos: cuántos cajones tiene cada estacionamiento.
              </p>
            )}
          </Seccion>

          <Seccion
            rotulo="Por dónde entra"
            titulo={`De los ${m.oleada.coches} coches de la oleada, ${oleadaE2} entraron por el mismo estacionamiento`}
            nota={
              <>
                {m.oleada.cortas} de los {m.oleada.coches} ({pct(m.oleada.cortas, m.oleada.coches)}) se van en
                media hora o menos: es una oleada de paso, no de estancia. Y no es por falta de derecho —
                de {eleccion.conDerechoAmbos} credenciales que pueden entrar a los dos, {eleccion.siempreE2} entraron
                siempre por el 2.
              </>
            }
          >
            <Kpis>
              <Kpi rotulo="Entraron por el 2" valor={oleadaE2} pie={`${pct(oleadaE2, m.oleada.coches)} de la oleada`} marcada />
              <Kpi rotulo="Entraron por el 1" valor={oleadaE1} pie={`${pct(oleadaE1, m.oleada.coches)} de la oleada`} />
              <Kpi rotulo="Se quedan" valor={dur(m.oleada.medianaMin)} pie="mediana de la oleada" />
              <Kpi
                rotulo="Con derecho a los dos"
                valor={eleccion.conDerechoAmbos}
                pie={
                  eleccion.conUnaSolaEntrada > 0
                    ? `${eleccion.conUnaSolaEntrada} de ellas entraron una sola vez: su «siempre» es una observación`
                    : "y que además usaron el estacionamiento"
                }
              />
            </Kpis>
          </Seccion>

          <Seccion
            rotulo="De dónde sale el pico"
            titulo={`De los ${enPicoTotal - enMesetaTotal} coches que aparecen entre media mañana y el peor momento, la mayoría son de padres de familia`}
            nota={
              <>
                Las dos columnas son el mismo día, {m.picoTotal.dia ? diaCorto(m.picoTotal.dia) : "—"}: una a
                las {horaCorta(MINUTO_MESETA)} y otra en el pico de las {horaCorta(m.picoTotal.minuto)}. Las
                cifras son coches, no proporciones: los dos momentos tienen totales distintos
                ({enMesetaTotal} contra {enPicoTotal}), así que un porcentaje compararía peras con
                manzanas. El personal
                pasa de {personalMeseta} a {personalPico} coches — prácticamente no se mueve, porque es una
                jornada de trabajo y no una elección de horario. Lo que aparece en el pico es otra población.
              </>
            }
          >
            <TablaPro
              filas={m.enElPico.map((r) => ({
                rol: r.rol,
                pico: r.coches,
                meseta: m.enLaMeseta.find((x) => x.rol === r.rol)?.coches ?? 0,
              }))}
              claveFila={(f) => f.rol}
              ordenInicial="pico"
              cols={[
                { clave: "rol", titulo: "Grupo", pie: "resuelto contra el padrón", celda: (f) => f.rol, orden: (f) => f.rol },
                {
                  clave: "meseta", titulo: "A media mañana",
                  pie: `coches dentro a las ${horaCorta(MINUTO_MESETA)} (${enMesetaTotal} en total)`, num: true,
                  celda: (f) => f.meseta,
                  orden: (f) => f.meseta,
                },
                {
                  clave: "pico", titulo: "En el peor momento",
                  pie: `coches dentro a las ${horaCorta(m.picoTotal.minuto)} (${enPicoTotal} en total)`, num: true,
                  celda: (f) => f.pico,
                  orden: (f) => f.pico,
                  barra: (f) => f.pico / Math.max(enPicoTotal, 1),
                },
                {
                  clave: "dif", titulo: "Diferencia", pie: "cuánto creció de una a otra", num: true,
                  celda: (f) => (f.pico - f.meseta >= 0 ? `+${f.pico - f.meseta}` : `${f.pico - f.meseta}`),
                  orden: (f) => f.pico - f.meseta,
                },
              ]}
            />
            <p className="ti-hint" style={{ marginTop: 10 }}>
              Los {enPicoTotal} del peor momento son los coches con entrada y salida leídas, y es la misma
              cifra del titular: esta tabla y el pico salen del mismo cálculo, así que no pueden discrepar.
              {m.picoTotal.hasta > m.picoTotal.dentro && (
                <> Además había hasta {m.picoTotal.hasta}: la diferencia son {m.picoTotal.hasta - m.picoTotal.dentro} coches
                que entraron y cuya salida el lector nunca registró.</>
              )}
            </p>
          </Seccion>
        </>
      )}

      {/* =========================================== ESTACIONAMIENTOS =========== */}
      {vista === "lotes" && oActivo && (
        <>
          <Segmentado
            etiqueta="Estacionamiento"
            activa={lote}
            onCambio={setLote}
            opciones={m.ocupacion.map((o) => ({
              clave: o.lote,
              titulo: `Estacionamiento ${o.lote.slice(1)} · hasta ${o.pico.dentro} coches`,
            }))}
          />

          <Kpis>
            <Kpi
              rotulo="Lo más lleno que se le vio"
              valor={oActivo.pico.dentro}
              unidad="coches"
              pie={
                <>
                  el {oActivo.pico.dia ? diaCorto(oActivo.pico.dia) : "—"} a las {horaCorta(oActivo.pico.minuto)}
                  {oActivo.pico.hasta > oActivo.pico.dentro && ` · hasta ${oActivo.pico.hasta} con las salidas no leídas`}
                </>
              }
              marcada
            />
            <Kpi
              rotulo="Coches de la oleada que entraron por aquí"
              valor={m.oleada.porLote.find((x) => x.lote === oActivo.lote)?.coches ?? 0}
              unidad="coches"
              pie={<>de los {m.oleada.coches} de la oleada, entre {horaCorta(m.oleada.desde)} y {horaCorta(m.oleada.hasta)}</>}
            />
            <Kpi
              rotulo="Credenciales distintas"
              valor={oActivo.tarjetas}
              pie={`${oActivo.entradas} entradas y ${oActivo.salidas} salidas`}
            />
            <Kpi
              rotulo={cupos[oActivo.lote] != null ? "Ocupación en su peor momento" : "Se saturaría con"}
              valor={
                cupos[oActivo.lote] != null
                  ? pct(oActivo.pico.dentro, cupos[oActivo.lote] as number)
                  : Math.floor(oActivo.pico.dentro / UMBRAL_SHOUP)
              }
              unidad={cupos[oActivo.lote] != null ? undefined : "cajones o menos"}
              pie={
                cupos[oActivo.lote] != null
                  ? `sobre ${cupos[oActivo.lote]} cajones contados`
                  : `al ${Math.round(UMBRAL_SHOUP * 100)}% ya se da vueltas buscando lugar`
              }
            />
          </Kpis>

          <Seccion
            rotulo={`Estacionamiento ${oActivo.lote.slice(1)}`}
            titulo="Quién lo usa, de mayor a menor ocupación"
            nota={
              <>
                Ordenado por <strong>cuántos cajones ocupa cada sección a la vez</strong>, que es la única
                medida comparable contra la capacidad: «primaria llega a ocupar 24 lugares» se contrasta con
                cuántos hay. Contar entradas mediría tráfico, y lo que escasea no es tráfico, son lugares.
                Elija una sección para ver a su gente.
              </>
            }
          >
            <VistaMaestroDetalle
              grupos={seccionesDelLote}
              elegida={sel[`lote-${lote}`] ?? null}
              onElegir={(nombre) => setSel((v) => ({ ...v, [`lote-${lote}`]: nombre }))}
              cols={columnasPersona}
              verIdentidad={verIdentidad}
              conPadron={padron !== null}
            />
          </Seccion>

          {comparativa.length > 0 && (
            <Seccion
              rotulo="Los dos lado a lado"
              titulo="El mismo departamento se comporta casi igual en los dos"
              nota={
                <>
                  Esta tabla impide publicar una conclusión falsa. Comparar la mediana del 1 contra la del 2
                  sin abrir por departamento daría a entender que son estacionamientos de naturaleza distinta,
                  y no lo son: los padres de familia se quedan prácticamente lo mismo en uno que en otro. La
                  diferencia agregada entre los dos es <strong>quién entra a cada uno</strong>, no cómo se
                  comporta. Si alguno diverge mucho, lo que delata no es el estacionamiento sino la etiqueta:
                  bajo ese nombre hay gente de tipos distintos.
                </>
              }
            >
              <TablaPro
                filas={comparativa}
                claveFila={(c) => c.depto}
                ordenInicial="total"
                cols={[
                  { clave: "depto", titulo: "Departamento", pie: "con 5 estancias o más en los dos", celda: (c) => c.depto, orden: (c) => c.depto },
                  { clave: "m1", titulo: "Mediana en el 1", num: true, celda: (c) => dur(c.e1?.medianaMin), orden: (c) => c.e1?.medianaMin ?? 0 },
                  { clave: "e1", titulo: "Estancias en el 1", num: true, celda: (c) => c.e1?.estancias ?? 0, orden: (c) => c.e1?.estancias ?? 0 },
                  { clave: "m2", titulo: "Mediana en el 2", num: true, celda: (c) => dur(c.e2?.medianaMin), orden: (c) => c.e2?.medianaMin ?? 0 },
                  { clave: "e2", titulo: "Estancias en el 2", num: true, celda: (c) => c.e2?.estancias ?? 0, orden: (c) => c.e2?.estancias ?? 0 },
                  { clave: "total", titulo: "Total", num: true, celda: (c) => (c.e1?.estancias ?? 0) + (c.e2?.estancias ?? 0), orden: (c) => (c.e1?.estancias ?? 0) + (c.e2?.estancias ?? 0) },
                ]}
              />
            </Seccion>
          )}
        </>
      )}

      {/* =============================================== SECCIONES ============== */}
      {vista === "secciones" && (
        <Seccion
          rotulo="Los dos estacionamientos juntos"
          titulo="Por sección: quién usa el estacionamiento, y qué conviene mirar"
          nota={
            <>
              Las secciones salen del catálogo del control de acceso, no de una clasificación nuestra, y van
              ordenadas por <strong>cuántos lugares ocupan a la vez</strong>. Elija una para ver a su gente.
              {totalMarcadas > 0 && (
                <> Hay <strong>{totalMarcadas} credenciales por revisar</strong>; las secciones que las
                tienen vienen abiertas.</>
              )}
              {sinExpediente.length > 0 && (
                <>
                  {" "}Aparte, <strong>{sinExpediente.length} de las {m.porCredencial.length} credenciales
                  que abrieron la pluma todavía no tienen expediente en SATAG</strong>. Eso lo resuelve la
                  migración de una vez, no credencial por credencial, así que no cuenta como pendiente.
                </>
              )}
            </>
          }
        >
          {totalMarcadas > 0 && (
            <ul className="detail-grid" style={{ marginBottom: 14 }}>
              {Object.values(SEÑAL)
                .filter((x) => secciones.some((s) => s.filas.some((f) => f.señales.some((y) => y.clave === x.clave))))
                .map((x) => (
                  <li key={x.clave}>
                    <span className={`status-chip status-chip--${x.tono}`}>{x.texto}</span>{" "}
                    <span className="ti-hint">{x.porque}</span>
                  </li>
                ))}
            </ul>
          )}
          <VistaMaestroDetalle
            grupos={secciones}
            elegida={sel.secciones ?? null}
            onElegir={(nombre) => setSel((v) => ({ ...v, secciones: nombre }))}
            cols={columnasPersona}
            verIdentidad={verIdentidad}
            conPadron={padron !== null}
          />
          <p className="ti-hint" style={{ marginTop: 12 }}>
            <strong>«Cajones a la vez» es el máximo de coches de esa sección dentro al mismo tiempo</strong>,
            que es lo que de verdad le cuesta al estacionamiento. Ojo al sumarlos: cada sección llega a su
            máximo a una hora distinta, así que no suman el pico total — para eso está la segunda cifra, la
            de cuántos seguían ahí en el peor momento, que sí suma. Las medianas salen solo de las entradas
            con salida leída, así que en las secciones de jornada larga son cotas inferiores.
          </p>
        </Seccion>
      )}

      {/* ============================================= PERMANENCIA ============== */}
      {vista === "permanencia" && (
        <Seccion
          rotulo="La distribución"
          titulo="Hay dos poblaciones, y se ven separadas"
          nota={
            <>
              No es una distribución con una media: son dos montones. El de la izquierda deja y arranca; el
              de la derecha ocupa el cajón la jornada. El valle no es ruido — es donde termina una población
              y empieza la otra. La escala es lineal, así que la desproporción que se ve es la real.
            </>
          }
        >
          <HistogramaEstancias grupos={m.histogramaPorRol} />

          <h4 className="ti-section-title" style={{ marginTop: 18 }}>Quién compone cada barra</h4>
          <div className="table-wrap">
            <table className="admin-table tabla-pro">
              <thead>
                <tr>
                  <th><span style={{ display: "inline-block", padding: "10px 12px" }}>Permanencia</span></th>
                  {m.histogramaPorRol.map((g) => (
                    <th key={g.rol} className="num">
                      <span style={{ display: "inline-block", padding: "10px 12px" }}>{g.rol}</span>
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
                    {m.histogramaPorRol.map((g) => (
                      <td key={g.rol} className="num">
                        {g.cubetas[i].cuantas}{" "}
                        <span className="ti-hint">({pct(g.cubetas[i].cuantas, c.cuantas)})</span>
                      </td>
                    ))}
                    <td className="num"><strong>{c.cuantas}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 className="ti-section-title" style={{ marginTop: 18 }}>La mediana de cada grupo</h4>
          <EstanciasPorRol filas={m.estancias} />
          <TablaPro
            filas={m.estancias}
            claveFila={(r) => r.rol}
            ordenInicial="cajon"
            cols={[
              { clave: "rol", titulo: "Grupo", celda: (r) => r.rol, orden: (r) => r.rol },
              { clave: "cajon", titulo: "Cajones a la vez", pie: "máximo simultáneo del grupo", num: true, celda: (r) => r.cajonesAlaVez, orden: (r) => r.cajonesAlaVez, barra: (r) => r.cajonesAlaVez / Math.max(...m.estancias.map((x) => x.cajonesAlaVez), 1) },
              { clave: "enpico", titulo: "En el peor momento", pie: "de esos, cuántos seguían ahí", num: true, celda: (r) => r.cajonesEnElPico, orden: (r) => r.cajonesEnElPico },
              { clave: "est", titulo: "Estancias", pie: "entradas con salida leída", num: true, celda: (r) => r.estancias, orden: (r) => r.estancias },
              { clave: "cred", titulo: "Credenciales", pie: "personas distintas", num: true, celda: (r) => r.credenciales, orden: (r) => r.credenciales },
              { clave: "med", titulo: "Mediana", pie: "lo que se queda la mitad", num: true, celda: (r) => dur(r.medianaMin), orden: (r) => r.medianaMin ?? 0 },
              { clave: "iqr", titulo: "Mitad central", pie: "entre el 25% y el 75%", celda: (r) => <span className="ti-hint">{dur(r.p25Min)} – {dur(r.p75Min)}</span> },
              { clave: "cortas", titulo: "De 30 min o menos", pie: "dejar y arrancar", num: true, celda: (r) => <>{r.cortas} <span className="ti-hint">({pct(r.cortas, r.estancias)})</span></>, orden: (r) => r.cortas },
              { clave: "cens", titulo: "Sin salida leída", pie: "no se pudieron medir", num: true, celda: (r) => <>{r.censuradas} <span className="ti-hint">({pct(r.censuradas, r.estancias + r.censuradas)})</span></>, orden: (r) => r.censuradas },
            ]}
          />
          <p className="ti-hint" style={{ marginTop: 10 }}>
            <strong>Las medianas de los grupos de jornada larga son cotas inferiores.</strong> La última
            columna explica por qué: cuando el lector no registra la salida, la estancia no se puede medir —
            y eso pasa más en los grupos que se quedan más. Las que se pierden son justo las largas, así que
            el contraste real entre los grupos es mayor que el que esta tabla muestra, nunca menor.
            En total {totalEstancias.toLocaleString("es-MX")} estancias medidas, {largas} de cuatro horas o
            más ({pct(largas, totalEstancias)}) y {cortas} de media hora o menos ({pct(cortas, totalEstancias)});
            la mediana de todas es {dur(m.medianaGlobalMin)}.
          </p>
        </Seccion>
      )}

      {/* =============================================== CALIDAD =============== */}
      {vista === "calidad" && (
        <Seccion
          rotulo="Los límites"
          titulo="Qué falta para saber si falta espacio"
          nota="Todo tablero tiene un borde. Estos son los de este, con su tamaño y su dirección: un error acotado y con signo es un error controlado."
        >
          {resumen.topeAlcanzado && (
            <p className="notice" style={{ margin: "0 0 14px", padding: "10px 12px" }}>
              El archivo llegó a las <strong>40,000 filas</strong>, que es donde ZKBioSecurity corta. La
              exportación quedó truncada y solo cubre <strong>{resumen.diasConActividad} días</strong>. Para
              cubrir un mes hacen falta varias exportaciones por rango de fechas.
            </p>
          )}
          <ul className="detail-grid">
            {sinCupos && (
              <li>
                <strong>Cuántos cajones tiene cada estacionamiento.</strong> Es el único dato que falta para
                pasar de «entraron tantos coches» a «faltó lugar», y es un conteo en sitio de una mañana.
                Mientras tanto se puede dar la vuelta al revés: por la práctica de referencia un
                estacionamiento empieza a operar mal arriba del {Math.round(UMBRAL_SHOUP * 100)}%, así que{" "}
                {m.ocupacion
                  .filter((o) => o.pico.dentro > 0)
                  .map((o) => `el ${o.lote.slice(1)} estaría saturado si tiene ${Math.floor(o.pico.dentro / UMBRAL_SHOUP)} cajones o menos`)
                  .join(", y ")}.
              </li>
            )}
            <li>
              <strong>{m.diasComparables.length} de los {m.dias.length} días describen un día normal.</strong>{" "}
              Los otros quedan fuera de la curva con su motivo:{" "}
              {m.diasExcluidos.map((x) => `${diaCorto(x.dia)} (${x.motivo})`).join("; ")}. El peor momento, en
              cambio, se busca en todos: un día incompleto no describe la rutina, pero si trajo el momento más
              lleno, ese momento ocurrió.
            </li>
            <li>
              <strong>
                El archivo traía {resumen.filasArchivo.toLocaleString("es-MX")} filas y solo{" "}
                {resumen.accesos.toLocaleString("es-MX")} son accesos.
              </strong>{" "}
              {resumen.filasSinTarjeta.toLocaleString("es-MX")} ({pct(resumen.filasSinTarjeta, resumen.filasArchivo)})
              son filas sin tarjeta —estado de los equipos, sensores de puerta y aperturas con el botón de
              salida— y otras {resumen.repeticiones.toLocaleString("es-MX")} son el mismo lector disparando
              varias veces por un solo coche. Las aperturas con botón son un límite real: un coche que entra
              sin pasar credencial no aparece en ninguna de estas cifras.
            </li>
            <li>
              <strong>
                {resumen.entradas.toLocaleString("es-MX")} entradas contra {resumen.salidas.toLocaleString("es-MX")} salidas
              </strong>
              {resumen.desbalance !== null && (
                <>
                  {" "}({(Math.abs(resumen.desbalance) * 100).toFixed(1)}% de diferencia). Sobran{" "}
                  {resumen.entradas >= resumen.salidas ? "entradas" : "salidas"}, así que el conteo de coches
                  dentro está{" "}
                  {resumen.entradas >= resumen.salidas
                    ? "acotado por arriba: por eso el peor momento se da como un rango y no como un número"
                    : "acotado por abajo: hay coches que ya estaban dentro cuando arranca el archivo"}
                  .
                </>
              )}{" "}
              De los dos lados: {m.entradasSinSalida} entradas no cerraron y {m.salidasSinEntrada} salidas no
              tenían entrada en el archivo. En total {censuradas} estancias quedaron sin medir.
            </li>
            <li>
              <strong>{resumen.rechazos.toLocaleString("es-MX")} intentos fueron rechazados</strong>{" "}
              («Usuario no registrado»), de credenciales que ZK no reconoce. Cada uno detiene el carril, y en
              los {m.ventana.minutos} minutos que importan eso se nota.
            </li>
            <li>
              <strong>Esto es uso, no antigüedad.</strong> Una credencial que no aparece aquí no está
              abandonada: pudo no venir esta semana. Con una sola ventana no se puede afirmar que una
              credencial no se use — solo acotar cada cuánto — y el panel de bajas sigue apagado hasta que
              haya serie suficiente.
            </li>
          </ul>
        </Seccion>
      )}
    </>
  );
}
