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
// DESDE OCTUBRE DE 2026 EL RESUMEN SIGUE DISEÑO.md: una frase que afirma el hallazgo,
// la grafica que la respalda con su linea de lleno, y debajo las cifras como FILAS que
// al tocarse resaltan su rango en la grafica y abren su detalle. Nada de tarjetas de
// cifra. Las vistas de detalle (Secciones, Permanencia, limites) siguen debajo.
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
  dentroEn,
  FRANJA_DESDE,
  FRANJA_HASTA,
  horaCorta,
  medianaEn,
  MINUTO_MESETA,
  minutosPorEncima,
  minutosTipicosPorEncima,
  picoDeLaMediana,
  SHARE_SATURACION,
  UMBRAL_SHOUP,
  type Eleccion,
  type EstanciasRol,
  type Medicion,
  type OcupacionLote,
  type UsoCredencial,
} from "@/lib/estacionamiento";
import type { ResumenEventos } from "@/lib/zk/eventos";
import { esHuerfana, type Fuentes, type PersonaZk } from "@/lib/zk/padron";
import { EstanciasPorRol, HistogramaEstancias, MiniDia, OcupacionDelDia } from "@/components/admin/GraficasEstacionamiento";
import PlanoPlantel from "@/components/admin/PlanoPlantel";
import VialidadBeta from "@/components/admin/VialidadBeta";
import { Kpi, Kpis, Seccion, Segmentado, TablaPro, Vistas, type Columna } from "@/components/admin/UiEstacionamiento";

// Con espacio fino antes del signo, como se escribe en español; y el mismo en toda la pantalla.
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}\u202f%` : "—");
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
  sinDepartamento: {
    clave: "sinDepartamento",
    pendiente: true,
    texto: "falta su departamento",
    tono: "pendiente",
    porque:
      "Ni SATAG ni el control de acceso dicen a qué departamento pertenece: en ZK está en «General», que no es un departamento sino el cajón de sastre de la configuración vieja. Clasificarla en ZK y volver a exportar el padrón la acomoda sola.",
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
  /** Días que faltan entre dos ventanas consecutivas. Un hueco invalida el uso por credencial. */
  huecoDias: number | null;
  /** Entre qué dos ventanas está ese hueco, para decirlo con fechas. */
  huecoEntre?: { hastaAnterior: string; desdeSiguiente: string } | null;
  /**
   * La serie leída de la base: cuántas ventanas entraron y cuántas se truncaron en
   * las 40,000 filas de ZK. `null` cuando se mide un archivo recién elegido, que
   * es una sola ventana y se describe como tal.
   */
  serie?: { ventanas: number; truncadas: number } | null;
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
  // Se abre en el estacionamiento MAS LLENO contra su cupo —o contra si mismo, sin
  // cupo—, porque ese es el que trae la noticia. El otro queda a un toque.
  const [lote, setLote] = useState<string>(() => {
    const razon = (o: OcupacionLote) => {
      const c = cupos[o.lote];
      return c ? o.pico.dentro / c : o.pico.dentro / 1000;
    };
    return [...m.ocupacion].sort((a, b) => razon(b) - razon(a))[0]?.lote ?? "E2";
  });
  // Que seccion esta elegida en cada maestro-detalle. Van por separado para que
  // cambiar de pestana no pierda lo que se estaba mirando en la otra.
  const [sel, setSel] = useState<Record<string, string>>({});
  // La fila abierta del resumen. Es la que se resalta en la grafica: cambiar de
  // estacionamiento la devuelve al pico, que es por donde se empieza a leer.
  const [fila, setFila] = useState<string | null>("pico");
  const elegirLote = (l: string) => {
    setLote(l);
    setFila("pico");
  };

  const totalEstancias = m.estancias.reduce((a, r) => a + r.estancias, 0);
  const largas = m.estancias.reduce((a, r) => a + r.largas, 0);
  const cortas = m.estancias.reduce((a, r) => a + r.cortas, 0);
  const censuradas = m.estancias.reduce((a, r) => a + r.censuradas, 0);
  const sinCupos = Object.values(cupos).every((c) => c === null);

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
    // «Sin clasificar» no es un grupo: es que nadie sabe de que departamento es.
    // Va como pendiente porque se resuelve —clasificar en ZK y reexportar— y
    // mientras no se resuelva, toda proporcion por grupo que la pantalla imprima
    // lleva esta gente dentro de un cajon que no significa nada.
    if (u.rol === "Sin clasificar") señales.push(SEÑAL.sinDepartamento);
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
    // La ultima y en beta a proposito: es el porque de todo esto —la calle—, pero
    // la mitad de sus datos se capturan a mano y viven en el navegador.
    { clave: "vialidad", titulo: "Vialidad · beta" },
  ];

  return (
    <>
      {d.huecoDias !== null && d.huecoDias > 0 && (
        <p className="submit-error" role="alert">
          {d.huecoEntre
            ? <>Entre la ventana que termina el {diaCorto(d.huecoEntre.hastaAnterior.slice(0, 10))} y la que empieza el{" "}
              {diaCorto(d.huecoEntre.desdeSiguiente.slice(0, 10))} falta <strong>{duracion(d.huecoDias * 86_400_000)}</strong> de bitácora.</>
            : <>Entre esta ventana y la anterior falta <strong>{duracion(d.huecoDias * 86_400_000)}</strong> de bitácora.</>}
          {" "}Las cifras de tráfico son válidas, pero el uso por credencial no: una credencial
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

      {/* Hasta donde sabe el archivo. Va arriba de todas las vistas porque toda cifra
          de la pantalla se lee «al corte de…»: el dia de la exportacion la jornada
          seguia corriendo, y quien estaba dentro no es un defecto del archivo. */}
      {m.corte && (
        <p className="corte" role="status">
          <strong>
            Corte: {diaCorto(m.corte.dia)} a las {horaCorta(m.corte.minuto)}.
          </strong>{" "}
          {m.corte.aunDentro > 0
            ? `${m.corte.aunDentro} coches seguían dentro a esa hora: no cuentan como «sin salida» ni entran en ninguna mediana.`
            : d.serie ? "Ahí termina lo que la bitácora guardada sabe." : "Ahí termina lo que el archivo sabe."}
          {m.corte.retrasoMin !== null && m.corte.retrasoMin >= 5 && (
            <>
              {" "}{d.serie ? "La última ventana" : "El archivo"} se exportó {duracion(m.corte.retrasoMin * 60_000)} después del último evento: ZK iba
              atrasado al recoger los pasos de los controladores.
            </>
          )}
        </p>
      )}

      {/* =============================================== RESUMEN =============== */}
      {vista === "resumen" && oActivo && (() => {
        /* Todo lo de aqui es LECTURA de la medicion para un estacionamiento: que
           frase lo describe y que filas lo sostienen. No hay una mediana nueva. */
        const o = oActivo;
        const cupo = cupos[o.lote] ?? null;
        const picoMin = o.pico.minuto;
        const pctPico = cupo !== null && cupo > 0 ? Math.round((o.pico.dentro / cupo) * 100) : null;
        const umbral = cupo !== null ? Math.round(cupo * 0.9) : Math.round(o.pico.dentro * SHARE_SATURACION);
        // Los escalones traen segundos; en pantalla van minutos enteros, redondeados
        // hacia arriba: 26 minutos y 43 segundos por encima son 27 minutos, no 26.
        const minDiaMax = Math.ceil(minutosPorEncima(o.diaPico, umbral));
        const minTipico = minutosTipicosPorEncima(o.franjas, umbral);
        const minSinLugar = cupo !== null ? Math.ceil(minutosPorEncima(o.diaPico, cupo - 1)) : 0;
        const mesetaTipica = medianaEn(o.franjas, MINUTO_MESETA);
        const salida = picoDeLaMediana(o.franjas, 12 * 60, FRANJA_HASTA);
        const oleadaLote = m.oleada.porLote.find((x) => x.lote === o.lote)?.coches ?? 0;
        const enPico = [...o.porRol].sort((a, b) => b.cajonesEnElPico - a.cajonesEnElPico);
        const enPicoTotalLote = enPico.reduce((a, r) => a + r.cajonesEnElPico, 0);
        const porEstancias = [...o.porRol].filter((r) => r.medianaMin !== null).sort((a, b) => b.estancias - a.estancias);
        const topeMediana = Math.max(...porEstancias.map((r) => r.medianaMin ?? 0), 1);
        const nombre = `E${o.lote.slice(1)}`;
        const diaPico = o.pico.dia ? diaCorto(o.pico.dia) : "el día más lleno";

        // Donde empieza y termina el rato por encima del umbral, para resaltarlo.
        let desdeUmbral: number | null = null;
        let hastaUmbral: number | null = null;
        for (let k = 0; k + 1 < o.diaPico.length; k += 1) {
          if (o.diaPico[k].dentro > umbral) {
            if (desdeUmbral === null) desdeUmbral = o.diaPico[k].minuto;
            hastaUmbral = o.diaPico[k + 1].minuto;
          }
        }

        const seLlena = cupo !== null && o.pico.dentro > umbral;
        const titular =
          cupo === null
            ? `El ${nombre} estuvo en su peor momento ${minDiaMax} minutos, no toda la jornada.`
            : seLlena
              ? `El ${nombre} se llena ${minDiaMax} ${minDiaMax === 1 ? "minuto" : "minutos"} al día, no todo el día.`
              : `El ${nombre} no se llena: en su peor momento llegó al ${pctPico} %.`;
        const bajada =
          cupo === null
            ? `El ${diaPico} a las ${horaCorta(picoMin)} había ${o.pico.dentro} coches dentro. Falta contar sus cajones para decir si sobró lugar.`
            : `El ${diaPico} a las ${horaCorta(picoMin)} había ${o.pico.dentro} coches en ${cupo} cajones, el ${pctPico} %. Pasada la oleada, un día típico baja a ${mesetaTipica} a media mañana.`;

        interface Fila { k: string; q: string; a: string; rango: [number, number] | null; det: React.ReactNode }
        const filas: Fila[] = [];
        if (picoMin !== null) {
          filas.push({
            k: "pico",
            q: "A qué hora llega a su máximo",
            a: pctPico !== null ? `${horaCorta(picoMin)} · ${pctPico} %` : `${horaCorta(picoMin)} · ${o.pico.dentro} coches`,
            rango: [Math.max(FRANJA_DESDE, picoMin - 10), Math.min(FRANJA_HASTA, picoMin + 10)],
            det: (
              <>
                <p>
                  El {diaPico} a las {horaCorta(picoMin)} había {o.pico.dentro} coches dentro
                  {cupo !== null ? ` de ${cupo} cajones` : ""}. Quince minutos antes eran{" "}
                  {dentroEn(o.diaPico, picoMin - 15)} y quince minutos después, {dentroEn(o.diaPico, picoMin + 15)}.
                </p>
                {o.pico.hasta > o.pico.dentro && (
                  <p>Pudieron ser hasta {o.pico.hasta}: la diferencia son coches cuya salida el lector no registró.</p>
                )}
              </>
            ),
          });
        }
        filas.push({
          k: "dura",
          q: cupo !== null ? "Cuánto pasa por encima del 90 %" : "Cuánto dura su peor momento",
          a: `${minDiaMax} min`,
          rango: desdeUmbral !== null && hastaUmbral !== null ? [desdeUmbral, hastaUmbral] : null,
          det: (
            <p>
              El {diaPico} pasó {minDiaMax} minutos con más de {umbral} coches dentro
              {cupo !== null && minSinLugar > 0 ? `, y ${minSinLugar} de ellos sin un solo cajón libre` : ""}.
              Un día típico pasa {minTipico}. {cupo === null ? "El umbral es el 95 % de su propio máximo, porque no hay cajones contados." : ""}
            </p>
          ),
        });
        filas.push({
          k: "entrada",
          q: "Por dónde entra la oleada",
          a: `${oleadaLote} de ${m.oleada.coches}`,
          rango: [m.oleada.desde, m.oleada.hasta],
          det: (
            <>
              <p>
                De los {m.oleada.coches} coches que entran entre {horaCorta(m.oleada.desde)} y {horaCorta(m.oleada.hasta)},
                {" "}{oleadaLote} lo hacen por el {nombre}. Cada estacionamiento tiene una sola puerta, con la entrada de un
                lado y la salida del otro: los que entran y los que ya dejaron a alguien se cruzan ahí.
              </p>
              <p>
                {m.oleada.cortas} de los {m.oleada.coches} ({pct(m.oleada.cortas, m.oleada.coches)}) se van en media hora o
                menos. De {eleccion.conDerechoAmbos} credenciales con derecho a los dos, {eleccion.siempreE2} entraron siempre
                por el E2.
              </p>
            </>
          ),
        });
        if (enPicoTotalLote > 0) {
          filas.push({
            k: "quien",
            q: "Quién está dentro en el pico",
            a: `${enPico[0].rol} ${pct(enPico[0].cajonesEnElPico, enPicoTotalLote)}`,
            rango: picoMin !== null ? [Math.max(FRANJA_DESDE, picoMin - 10), Math.min(FRANJA_HASTA, picoMin + 10)] : null,
            det: (
              <>
                <p>En su peor momento, por grupo:</p>
                <div className="barras">
                  {enPico.filter((r) => r.cajonesEnElPico > 0).map((r) => (
                    <div className="barra" key={r.rol}>
                      <span>{r.rol}</span>
                      <span className="barra__t"><i style={{ width: `${Math.round((r.cajonesEnElPico / enPicoTotalLote) * 100)}%` }} /></span>
                      <span className="barra__v">{r.cajonesEnElPico}</span>
                    </div>
                  ))}
                </div>
                <p>Suman {enPicoTotalLote}: salen del mismo barrido que el pico, así que no pueden discrepar.</p>
              </>
            ),
          });
        }
        if (porEstancias.length > 0) {
          filas.push({
            k: "estancia",
            q: "Cuánto se queda cada grupo, mediana",
            a: `${porEstancias[0].rol} ${dur(porEstancias[0].medianaMin)}`,
            rango: null,
            det: (
              <>
                <div className="barras">
                  {porEstancias.map((r) => (
                    <div className="barra" key={r.rol}>
                      <span>{r.rol}</span>
                      <span className="barra__t"><i style={{ width: `${Math.round(((r.medianaMin ?? 0) / topeMediana) * 100)}%` }} /></span>
                      <span className="barra__v">{dur(r.medianaMin)}</span>
                    </div>
                  ))}
                </div>
                <p>
                  No hay una mediana del estacionamiento a propósito: mezclar a quien deja a un niño con quien
                  trabaja ocho horas da una cifra que no describe a nadie. Se usa la mediana y no el promedio
                  por la misma razón.
                </p>
              </>
            ),
          });
        }
        if (salida !== null && picoMin !== null && salida.minuto > picoMin + 90) {
          filas.push({
            k: "salida",
            q: "La salida escolar",
            a: cupo !== null ? `${horaCorta(salida.minuto)} · ${Math.round((salida.p50 / cupo) * 100)} %` : `${horaCorta(salida.minuto)} · ${salida.p50} coches`,
            rango: [salida.minuto - 25, Math.min(FRANJA_HASTA, salida.minuto + 25)],
            det: (
              <p>
                La salida produce una segunda oleada: en un día típico hay {salida.p50} coches dentro a las{" "}
                {horaCorta(salida.minuto)}{cupo !== null ? `, el ${Math.round((salida.p50 / cupo) * 100)} % de los cajones` : ""}.
                Es más ancha y más baja que la de la mañana porque las salidas por sección se escalonan.
              </p>
            ),
          });
        }
        const abierta = filas.find((f) => f.k === fila) ?? null;
        const anotaciones = [{ minuto: 7 * 60, texto: "Entrada" }].concat(
          salida !== null && picoMin !== null && salida.minuto > picoMin + 90 ? [{ minuto: salida.minuto, texto: "Salida escolar" }] : [],
        );
        const techoPar = Math.max(...m.ocupacion.map((x) => Math.max(cupos[x.lote] ?? 0, x.pico.hasta, ...x.franjas.map((f) => f.p75))), 10);

        return (
          <>
            <p className="titular__migas">
              <span>Estacionamiento</span>
              <span>›</span>
              <span>{m.dias.length === 1 ? diaCorto(m.dias[0]) : `del ${diaCorto(m.dias[0])} al ${diaCorto(m.dias[m.dias.length - 1])}`}</span>
            </p>
            <h2 className="titular">{titular}</h2>
            <p className="titular__sub">{bajada}</p>

            {m.ocupacion.length > 1 && (
              <Segmentado
                etiqueta="Estacionamiento"
                activa={lote}
                onCambio={elegirLote}
                opciones={m.ocupacion.map((x) => ({ clave: x.lote, titulo: `E${x.lote.slice(1)}` }))}
              />
            )}

            <OcupacionDelDia
              o={o}
              cupo={cupo}
              comparables={m.diasComparables.length}
              resalte={abierta?.rango ?? null}
              anotaciones={anotaciones}
            />

            <div className="filas">
              {filas.map((f) => (
                <div className="fila" key={f.k} data-abierta={f.k === fila}>
                  <button type="button" className="fila__b" aria-expanded={f.k === fila}
                    onClick={() => setFila((v) => (v === f.k ? null : f.k))}>
                    <span className="fila__q">{f.q}</span>
                    <span className="fila__a">{f.a}</span>
                    <span className="fila__flecha" aria-hidden="true">›</span>
                  </button>
                  {f.k === fila && <div className="fila__det">{f.det}</div>}
                </div>
              ))}
            </div>

            {m.ocupacion.length > 1 && (
              <section className="seccion-plana">
                <h3>Los dos estacionamientos, lado a lado</h3>
                <p className="sub">Misma escala y mismo día típico. La diferencia está en la hora y la forma, no solo en la altura.</p>
                <div className="par">
                  {m.ocupacion.map((x) => {
                    const c = cupos[x.lote] ?? null;
                    const p = picoDeLaMediana(x.franjas, FRANJA_DESDE, FRANJA_HASTA);
                    return (
                      <div key={x.lote}>
                        <h4>E{x.lote.slice(1)}</h4>
                        <p>
                          {p ? `Un día típico llega a ${p.p50} a las ${horaCorta(p.minuto)}` : "Sin día típico"}
                          {c !== null && p ? `, el ${Math.round((p.p50 / c) * 100)} % de sus ${c} cajones.` : "."}
                        </p>
                        <MiniDia o={x} cupo={c} techo={techoPar} />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="seccion-plana">
              <h3>El plantel a lo largo del día</h3>
              <p className="sub">Mueva la hora y vea cómo cambia cada estacionamiento sobre el mismo plano.</p>
              <PlanoPlantel ocupacion={m.ocupacion} cupos={cupos} minutoInicial={m.picoTotal.minuto} />
            </section>

            <div className="firme">
              <div>
                <strong>Qué tan firme es esto.</strong> {m.diasComparables.length} de {m.dias.length} días describen un día
                normal{m.corte ? `, y el archivo corta el ${diaCorto(m.corte.dia)} a las ${horaCorta(m.corte.minuto)}` : ""}.
                El detalle está en «Qué tan firme es esto».
              </div>
              <div>
                {sinCupos
                  ? "Estas curvas dicen cuántos coches hay dentro, no si sobró lugar: falta contar los cajones de cada estacionamiento."
                  : `Los cajones son los contados por el Instituto: ${m.ocupacion.map((x) => `${cupos[x.lote] ?? "sin contar"} en el E${x.lote.slice(1)}`).join(" y ")}.`}
              </div>
            </div>
          </>
        );
      })()}

      {/* =========================================== ESTACIONAMIENTOS =========== */}
      {vista === "lotes" && oActivo && (
        <>
          <Segmentado
            etiqueta="Estacionamiento"
            activa={lote}
            onCambio={elegirLote}
            opciones={m.ocupacion.map((o) => ({
              clave: o.lote,
              titulo: `Estacionamiento ${o.lote.slice(1)} · hasta ${o.pico.dentro} coches`,
            }))}
          />

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

      {/* =============================================== VIALIDAD (beta) ======= */}
      {vista === "vialidad" && <VialidadBeta m={m} />}

      {/* =============================================== CALIDAD =============== */}
      {vista === "calidad" && (
        <Seccion
          rotulo="Los límites"
          titulo="Qué falta para saber si falta espacio"
          nota="Todo tablero tiene un borde. Estos son los de este, con su tamaño y su dirección: un error acotado y con signo es un error controlado."
        >
          {resumen.topeAlcanzado && !d.serie && (
            <p className="notice" style={{ margin: "0 0 14px", padding: "10px 12px" }}>
              El archivo llegó a las <strong>40,000 filas</strong>, que es donde ZKBioSecurity corta. La
              exportación quedó truncada y solo cubre <strong>{resumen.diasConActividad} días</strong>. Para
              cubrir un mes hacen falta varias exportaciones por rango de fechas.
            </p>
          )}
          {d.serie && (resumen.topeAlcanzado || d.serie.truncadas > 0) && (
            <p className="notice" style={{ margin: "0 0 14px", padding: "10px 12px" }}>
              {resumen.topeAlcanzado
                ? <>La última ventana llegó a las <strong>40,000 filas</strong>, que es donde ZKBioSecurity corta: lo
                  que pasó después de su último evento todavía no está en SATAG.</>
                : <>{d.serie.truncadas} de las {d.serie.ventanas} ventanas guardadas llegaron a las <strong>40,000 filas</strong> de
                  ZKBioSecurity y quedaron truncadas.</>}
              {" "}Si entre dos ventanas faltan días, el aviso de arriba lo dice con fechas.
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
                {d.serie
                  ? `${d.serie.ventanas === 1 ? "El archivo guardado traía" : `Los ${d.serie.ventanas} archivos guardados sumaban`} ${resumen.filasArchivo.toLocaleString("es-MX")} filas y solo`
                  : `El archivo traía ${resumen.filasArchivo.toLocaleString("es-MX")} filas y solo`}{" "}
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
              tenían entrada en {d.serie ? "la bitácora" : "el archivo"}
              {m.corte && m.corte.aunDentro > 0
                ? `, y ${m.corte.aunDentro} coches seguían dentro cuando ${d.serie ? "la bitácora" : "el archivo"} termina, el ${diaCorto(m.corte.dia)} a las ${horaCorta(m.corte.minuto)}: esos no son un defecto, son el día corriendo`
                : ""}
              . En total {censuradas} estancias quedaron sin medir.
            </li>
            <li>
              <strong>{resumen.rechazos.toLocaleString("es-MX")} intentos fueron rechazados</strong>{" "}
              («Usuario no registrado»), de credenciales que ZK no reconoce. Cada uno detiene el carril, y en
              los {m.ventana.minutos} minutos que importan eso se nota.
            </li>
            <li>
              <strong>Esto es uso, no antigüedad.</strong> Una credencial que no aparece aquí no está
              abandonada: pudo no venir esta semana.{" "}
              {d.ventanas <= 1
                ? "Con una sola ventana no se puede afirmar que una credencial no se use, solo acotar cada cuánto, y el panel de bajas sigue apagado hasta que haya serie suficiente."
                : `Hay ${d.ventanas} ventanas guardadas; el panel de bajas sigue apagado hasta que la serie sea continua y suficiente.`}
            </li>
          </ul>
        </Seccion>
      )}
    </>
  );
}
