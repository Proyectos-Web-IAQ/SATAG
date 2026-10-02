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
// cifra. Cierra con cuantos dias de datos hay: es lo que confirma, semana a semana,
// que cada archivo que se sube se esta sumando.
//
// CINCO VISTAS, cada una con un trabajo (Gerardo, 2-oct). La vista la elige la barra
// lateral de Consulta —el esqueleto que aprobo— y llega como prop; aqui no hay
// pestanas:
//   Resumen           la noticia; cierra con que tan firme es y cuantos dias hay.
//   Estacionamientos  la gente: la lista y la ficha de Personas recortadas a uno, el
//                     otro o los dos, con filtro por seccion. No vive aqui sino en
//                     GenteEstacionamiento, porque necesita el padron completo.
//   Secciones         el reporte global por seccion con la misma forma que el
//                     Resumen y, dentro de cada seccion, su gente con la misma ficha.
//                     Tampoco vive aqui: esta junto a Estacionamientos.
//   Plano del plantel el esquema con la ocupacion a la hora que se elija. Es vista
//                     propia porque al final de un informe largo nadie llegaba a verlo.
//   Vialidad · beta   la calle.
// «Permanencia» y «Que tan firme es esto» dejaron de ser pestanas: lo primero vive en
// Secciones, y de los limites quedan los que cambian una decision (dias comparables,
// el corte, los cajones, el tope de ZK), en el pie del Resumen. El resto de aquel
// inventario de bordes era para quien construye la medicion, no para quien la
// consulta.
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
  type Eleccion,
  type Medicion,
  type OcupacionLote,
} from "@/lib/estacionamiento";
import type { ResumenEventos } from "@/lib/zk/eventos";
import { esHuerfana, type Fuentes, type PersonaZk } from "@/lib/zk/padron";
import { MiniDia, OcupacionDelDia } from "@/components/admin/GraficasEstacionamiento";
import PlanoPlantel from "@/components/admin/PlanoPlantel";
import VialidadBeta from "@/components/admin/VialidadBeta";
import { Segmentado } from "@/components/admin/UiEstacionamiento";

// Con espacio fino antes del signo, como se escribe en español; y el mismo en toda la pantalla.
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}\u202f%` : "—");
const dur = (min: number | null | undefined) => duracion((min ?? 0) * 60_000);

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
  serie?: { ventanas: number; truncadas: number; ultimaDesde?: string | null } | null;
}

/** Las vistas del panel. Las elige la barra lateral de Consulta y llegan como prop. */
export type VistaPanel = "resumen" | "plano" | "vialidad";

/**
 * Que dias tienen datos, como una rejilla de semanas: una columna por semana, de
 * lunes a domingo. Lleno es un dia que describe la rutina; con borde y vacio, un dia
 * que entro pero no cuenta para la curva (incompleto o atipico); sin cuadro, un dia
 * sin bitacora: fin de semana, vacaciones o un hueco entre archivos. Es la grafica
 * que crece cada vez que TI sube un archivo, y por eso vive en el Resumen.
 */
export function CoberturaDias({ dias, comparables, excluidos }: { dias: string[]; comparables: string[]; excluidos: Medicion["diasExcluidos"] }) {
  if (dias.length === 0) return null;
  const DIA = 86_400_000;
  const t0 = Date.parse(`${dias[0]}T00:00:00Z`);
  const t1 = Date.parse(`${dias[dias.length - 1]}T00:00:00Z`);
  const lunes = t0 - ((new Date(t0).getUTCDay() + 6) % 7) * DIA;
  const semanas = Math.floor((t1 - lunes) / (7 * DIA)) + 1;
  const normal = new Set(comparables);
  const porque = new Map(excluidos.map((x) => [x.dia, x.motivo]));
  const con = new Set(dias);
  const C = 13, G = 3, IZQ = 16, ARR = 2;
  const w = IZQ + semanas * (C + G);
  const h = ARR + 7 * (C + G);
  const celdas: React.ReactNode[] = [];
  for (let s = 0; s < semanas; s += 1) {
    for (let d = 0; d < 7; d += 1) {
      const t = lunes + (s * 7 + d) * DIA;
      if (t < t0 || t > t1) continue;
      const iso = new Date(t).toISOString().slice(0, 10);
      if (!con.has(iso)) continue;
      const estado = normal.has(iso) ? "normal" : "parcial";
      celdas.push(
        <rect key={iso} className={`cobertura__dia cobertura__dia--${estado}`}
          x={IZQ + s * (C + G)} y={ARR + d * (C + G)} width={C} height={C} rx={2}>
          <title>{`${diaCorto(iso)}: ${estado === "normal" ? "día normal" : (porque.get(iso) ?? "no cuenta para la curva")}`}</title>
        </rect>,
      );
    }
  }
  return (
    <svg className="cobertura" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img"
      aria-label={`${dias.length} días con datos, del ${diaCorto(dias[0])} al ${diaCorto(dias[dias.length - 1])}`}>
      {["L", "M", "M", "J", "V", "S", "D"].map((l, i) => (
        <text key={i} className="cobertura__rotulo" x={0} y={ARR + i * (C + G) + C - 3}>{l}</text>
      ))}
      {celdas}
    </svg>
  );
}

export default function PanelEstacionamiento({ d, vista }: { d: DatosEstacionamiento; vista: VistaPanel }) {
  const { m, eleccion, resumen, cupos, fuentes } = d;
  // Se abre en el estacionamiento MAS LLENO contra su cupo —o contra si mismo, sin
  // cupo—, porque ese es el que trae la noticia. El otro queda a un toque.
  const [lote, setLote] = useState<string>(() => {
    const razon = (o: OcupacionLote) => {
      const c = cupos[o.lote];
      return c ? o.pico.dentro / c : o.pico.dentro / 1000;
    };
    return [...m.ocupacion].sort((a, b) => razon(b) - razon(a))[0]?.lote ?? "E2";
  });
  // La fila abierta del resumen. Es la que se resalta en la grafica: cambiar de
  // estacionamiento la devuelve al pico, que es por donde se empieza a leer.
  const [fila, setFila] = useState<string | null>("pico");
  const elegirLote = (l: string) => {
    setLote(l);
    setFila("pico");
  };

  const sinCupos = Object.values(cupos).every((c) => c === null);

  // Las credenciales que no estan en ningun padron: lo unico de aqui que hay que
  // resolver hoy, y por eso va en rojo arriba del Resumen.
  const huerfanas = fuentes === null ? [] : m.porCredencial.filter((u) => esHuerfana(fuentes.get(u.tarjeta)));
  const oActivo = m.ocupacion.find((o) => o.lote === lote) ?? m.ocupacion[0];

  /* ----------------------------------------------------------------- vistas */

  return (
    <>
      {/* Los dos avisos de arriba solo donde importan: el hueco invalida el uso por
          credencial y las huerfanas son gente, asi que van en el Resumen (las vistas
          de gente traen los suyos). En el plano y en la calle solo estorbarian. */}
      {d.huecoDias !== null && d.huecoDias > 0 && vista !== "plano" && vista !== "vialidad" && (
        <p className="submit-error" role="alert">
          {d.huecoEntre
            ? <>Entre la ventana que termina el {diaCorto(d.huecoEntre.hastaAnterior.slice(0, 10))} y la que empieza el{" "}
              {diaCorto(d.huecoEntre.desdeSiguiente.slice(0, 10))} falta <strong>{duracion(d.huecoDias * 86_400_000)}</strong> de bitácora.</>
            : <>Entre esta ventana y la anterior falta <strong>{duracion(d.huecoDias * 86_400_000)}</strong> de bitácora.</>}
          {" "}Las cifras de tráfico son válidas, pero el uso por credencial no: una credencial
          que sí pasó en ese hueco aparece aquí como si no se hubiera usado.
        </p>
      )}

      {huerfanas.length > 0 && vista === "resumen" && (
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
              <span>›</span>
              <span>{m.dias.length} {m.dias.length === 1 ? "día" : "días"} con datos</span>
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

            {/* Que tan firme es esto (DISEÑO.md): el pie con lo que sostiene las cifras.
                Lleva el contador de dias con datos, que crece con cada archivo que TI
                sube: es lo que confirma, semana a semana, que la serie se esta formando. */}
            <div className="firme">
              <div>
                <strong>Qué tan firme es esto.</strong>{" "}
                {m.dias.length} {m.dias.length === 1 ? "día" : "días"} con datos{d.serie ? " guardados en SATAG" : ""}, del{" "}
                {diaCorto(m.dias[0])} al {diaCorto(m.dias[m.dias.length - 1])}
                {d.serie ? `, en ${d.serie.ventanas} ${d.serie.ventanas === 1 ? "archivo" : "archivos"}` : ""}.{" "}
                {m.diasComparables.length === m.dias.length
                  ? "Todos describen un día normal."
                  : `${m.diasComparables.length} describen un día normal; los demás entraron, pero no cuentan para la curva.`}
                {m.corte
                  ? ` El corte es el ${diaCorto(m.corte.dia)} a las ${horaCorta(m.corte.minuto)}${m.corte.aunDentro > 0 ? `, con ${m.corte.aunDentro} coches todavía dentro` : ""}.`
                  : ""}
              </div>
              <div className="cobertura__fila">
                <CoberturaDias dias={m.dias} comparables={m.diasComparables} excluidos={m.diasExcluidos} />
                <span className="cobertura__leyenda">
                  <span><i className="cobertura__muestra cobertura__muestra--normal" aria-hidden="true" /> día normal</span>
                  <span><i className="cobertura__muestra cobertura__muestra--parcial" aria-hidden="true" /> no cuenta para la curva; el cursor encima dice por qué</span>
                  <span>sin cuadro: sin bitácora</span>
                </span>
              </div>
              {(resumen.topeAlcanzado || (d.serie !== null && d.serie !== undefined && d.serie.truncadas > 0)) && (
                <div>
                  {/* ZK se queda con las 40,000 filas MAS RECIENTES: a una ventana truncada
                      le falta su arranque, no su final. Decirlo al reves mandaba a exportar
                      despues de la ultima fecha, y eso nunca cierra el hueco. */}
                  {d.serie
                    ? resumen.topeAlcanzado
                      ? <>La última ventana llegó a las <strong>40,000 filas</strong> donde ZKBioSecurity corta, y ZK se queda
                        con las más recientes: falta lo anterior a su primer evento
                        {d.serie.ultimaDesde ? `, el ${diaCorto(d.serie.ultimaDesde.slice(0, 10))}` : ""}. Para cubrirlo, exporte por
                        rango de fechas hasta ese día.</>
                      : <>{d.serie.truncadas} de las {d.serie.ventanas} ventanas guardadas llegaron a las <strong>40,000 filas</strong> de
                        ZKBioSecurity: a cada una le falta su arranque, no su final.</>
                    : <>El archivo llegó a las <strong>40,000 filas</strong> donde ZKBioSecurity corta y solo cubre{" "}
                      {resumen.diasConActividad} días. Para cubrir más, exporte por rango de fechas.</>}
                </div>
              )}
              <div>
                {sinCupos
                  ? "Estas curvas dicen cuántos coches hay dentro, no si sobró lugar: falta contar los cajones de cada estacionamiento."
                  : `Los cajones son los contados por el Instituto: ${m.ocupacion.map((x) => `${cupos[x.lote] ?? "sin contar"} en el E${x.lote.slice(1)}`).join(" y ")}.`}
              </div>
            </div>
          </>
        );
      })()}

      {/* =============================================== PLANO ================= */}
      {vista === "plano" && (
        <>
          <p className="titular__migas">
            <span>Estacionamiento</span>
            <span>›</span>
            <span>Plano del plantel</span>
          </p>
          <PlanoPlantel ocupacion={m.ocupacion} cupos={cupos} minutoInicial={m.picoTotal.minuto} encabezado />
          <div className="firme">
            <div>
              <strong>Es un esquema, no una foto.</strong> Se trazó sobre capturas del satélite y no está a escala. A
              los dos estacionamientos se entra por Cerrada de la Asunción; el E1 es una franja con la puerta y la
              parte techada al frente, y la puerta del E2 da a la Cerrada frente a la 2a. Privada. El techo grande
              junto al E1 son las canchas techadas del Instituto.
            </div>
            <div>
              La ocupación a cada hora es la mediana entre los {m.diasComparables.length} días comparables
              {sinCupos ? ", contra el propio máximo de cada estacionamiento porque faltan sus cajones" : ""}.
            </div>
          </div>
        </>
      )}

      {/* =============================================== VIALIDAD (beta) ======= */}
      {vista === "vialidad" && <VialidadBeta m={m} />}
    </>
  );
}
