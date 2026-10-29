"use client";

// La salida de la tarde, por quien viene (28-oct-2026).
//
// Es la grafica que el contador vio en el mapa de Analisis Vial y que ahora vive en
// SATAG con los datos de todos los dias: a cada minuto de la tarde, cuantos coches
// hay dentro de cada estacionamiento y de quien son —papas de primaria, papas de
// secundaria, familias con hijos en varias secciones, personal— y por donde salen.
// Lo que cambia la conversacion es que la oleada de las 15:00 no son papas: es el
// personal; y que quien se queda hasta las 14:50 es quien tiene un hijo en
// secundaria, aunque tenga otro en primaria.
//
// DOS NIVELES. Arriba, la apilada por CINCO grupos, con la paleta declarada en
// app/globals.css (Okabe-Ito con el gris para el residuo): es la vista de conjunto.
// Abajo, el detalle «tal cual»: UNA FILA POR SECCION Y POR COMBINACION de secciones
// («Padres de primaria y secundaria», «PRIMARIA DOCENTE»…), con cuantos son, a que
// hora entran, a que hora salen y su curva de dentro. Son muchas filas, asi que no
// llevan color: una serie por fila, en el color unico de serie, como manda la regla
// de la hoja de estilos. El color nunca es el unico canal: cada columna lleva su
// rotulo al puntero y al teclado, y las tablas traen las mismas cifras en texto.
//
// ES MEDIANA POR GRUPO, no la mediana del total: cada tramo es «un dia tipico de ese
// grupo», y la suma de los tramos puede no coincidir con la curva de ocupacion del
// tablero. Se dice al pie.

import { horaCorta } from "@/lib/estacionamiento";
import {
  FRANJA_VIAJE,
  GRUPOS_RECOGIDA,
  NOMBRE_SECCION,
  SALIDA_DESDE,
  SALIDA_HASTA,
  type Cuartiles,
  type FilaViaje,
  type SalidaPorClave,
  type SalidaPorGrupo,
  type SerieRecogida,
  type ViajesPorSeccion,
} from "@/lib/recogida";

const W = 720;
const r = (n: number) => Math.round(n * 10) / 10;
const nombreLote = (l: string) => `E${l.slice(1)}`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const rangoDe = (c: Cuartiles) => `${horaCorta(c.p25)}–${horaCorta(c.p75)}`;
const esMx = (n: number) => n.toLocaleString("es-MX");

/** Los dos momentos del dia en que un papa pasa por la pluma: recoger y dejar. */
export interface ViajesTardeManana {
  tarde: ViajesPorSeccion;
  manana: ViajesPorSeccion;
}

/** Las medias horas de la tabla: de 13:30 a 16:00. */
const MEDIAS_HORAS = [13 * 60 + 30, 14 * 60, 14 * 60 + 30, 15 * 60, 15 * 60 + 30];
const LAS_1430 = 14 * 60 + 30;
/** Por debajo de esto, una seccion o combinacion no lleva fila: se lista al pie con su cifra. */
const MIN_AUTOS_POR_DIA = 0.5;

interface Capa {
  grupo: (typeof GRUPOS_RECOGIDA)[number];
  dentro: number[];
  salen: number[];
}

/** Las series de un alcance en el orden de apilado, sin los grupos vacios. */
function capasDe(series: SerieRecogida[]): Capa[] {
  return GRUPOS_RECOGIDA.map((grupo) => {
    const s = series.find((x) => x.clave === grupo.clave);
    return { grupo, dentro: s?.dentro ?? [], salen: s?.salen ?? [] };
  }).filter((c) => c.dentro.some((v) => v > 0) || c.salen.some((v) => v > 0));
}

export default function SalidaPorSeccion({
  salida,
  detalle,
  viajes,
  lote,
  cupos,
}: {
  salida: SalidaPorGrupo;
  /** Lo mismo, por etiqueta fina: cada seccion y cada combinacion. */
  detalle: SalidaPorClave<string> | null;
  /** La tabla central: por seccion, a que hora entran y salen los papas, al recoger y al dejar. */
  viajes: ViajesTardeManana | null;
  lote: string;
  cupos: Record<string, number | null>;
}) {
  const alcance = salida.porLote.find((l) => l.lote === lote);
  const lotes = salida.porLote.filter((l) => l.lote !== "ambos" && (lote === "ambos" || l.lote === lote));
  if (salida.dias === 0 || !alcance) return null;
  const capas = capasDe(alcance.series);
  if (capas.length === 0) return null;
  const i1430 = salida.minutos.indexOf(LAS_1430);
  const totalDentro = (i: number) => sum(capas.map((c) => c.dentro[i]));

  // La media hora en que mas sale cada grupo: es la oleada, dicha en palabras.
  const salenEn = (c: Capa, desde: number) => sum(c.salen.filter((_, i) => salida.minutos[i] >= desde && salida.minutos[i] < desde + 30));
  const oleadaDe = (c: Capa) => {
    const mejor = MEDIAS_HORAS.map((h) => ({ h, n: salenEn(c, h) })).sort((a, b) => b.n - a.n)[0];
    return mejor && mejor.n > 0 ? mejor : null;
  };
  const donde = lote === "ambos" ? "los dos estacionamientos" : `el ${nombreLote(lote)}`;
  const frases = capas
    .filter((c) => c.grupo.clave !== "otros")
    .map((c) => ({ c, o: oleadaDe(c) }))
    .filter((x): x is { c: Capa; o: { h: number; n: number } } => x.o !== null)
    .sort((a, b) => a.o.h - b.o.h)
    .map(({ c, o }) => `${c.grupo.prosa}, entre ${horaCorta(o.h)} y ${horaCorta(o.h + 30)} (${o.n})`);
  const dentro1430 = i1430 >= 0 ? totalDentro(i1430) : 0;
  const mayor1430 = i1430 >= 0 ? [...capas].sort((a, b) => b.dentro[i1430] - a.dentro[i1430])[0] : null;

  return (
    <section className="seccion-plana">
      {viajes && <ViajesPorSeccionVista viajes={viajes} lote={lote} />}
      <h3>La salida: quién está dentro, por quién viene</h3>
      <p className="sub">
        {i1430 >= 0 && mayor1430 && dentro1430 > 0
          ? `A las 14:30, en ${donde} hay ${dentro1430} coches dentro en un día típico, y ${mayor1430.dentro[i1430]} son ${mayor1430.grupo.prosa}. `
          : ""}
        {frases.length > 0 ? `Las oleadas de salida, en orden: ${frases.join("; ")}.` : ""}{" "}
        Mediana de {salida.dias} días hábiles comparables, por grupo, solo estancias con entrada y salida leídas.
      </p>
      <ul className="viz-leyenda">
        {capas.map((c) => (
          <li key={c.grupo.clave}>
            <i className={`viz-g${c.grupo.color}`} style={{ background: `var(--viz-g${c.grupo.color})` }} />
            {c.grupo.titulo}
          </li>
        ))}
      </ul>
      {lotes.map((l) => (
        <PanelDentro key={l.lote} titulo={`Dentro del ${nombreLote(l.lote)}`} capas={capasDe(l.series)} minutos={salida.minutos} cupo={cupos[l.lote] ?? null} />
      ))}
      <PanelSalen titulo={`Salen por la pluma${lote === "ambos" ? ", los dos estacionamientos" : ` del ${nombreLote(lote)}`}`} capas={capas} minutos={salida.minutos} />
      <TablaSalida capas={capas} minutos={salida.minutos} />
      {detalle && <DetallePorSeccion detalle={detalle} lote={lote} />}
      <p className="ti-hint" style={{ margin: "6px 0 0" }}>
        Cada tramo es la mediana de SU grupo entre los días comparables, así que la suma de los tramos no es la mediana del total que
        dibuja «Ocupación». Quien no se pudo ligar a una familia de GES va en «Otros», con su cifra: no se reparte.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ por seccion: entran y salen */

/**
 * La tabla que Gerardo señalo como la de mayor impacto (29-oct): por seccion, a que
 * hora entran y a que hora salen los papas, con filas por la seccion mayor de la
 * familia. Una serie por fila, en el color unico de serie: claro cuando entran, oscuro
 * cuando salen; la identidad la da el rotulo de la fila, no el color.
 */
function ViajesPorSeccionVista({ viajes, lote }: { viajes: ViajesTardeManana; lote: string }) {
  const donde = lote === "ambos" ? "los dos estacionamientos" : `el ${nombreLote(lote)}`;
  return (
    <div style={{ marginBottom: 22 }}>
      <h3>Por sección: a qué hora entran y a qué hora salen los papás</h3>
      <p className="sub">
        Cada viaje con entrada y salida leídas, en {donde}, como autos al día de {viajes.tarde.dias} días hábiles comparables. Un papá va con la
        sección de sus hijos; en la tarde, «hasta qué sección se quedan» es la del hijo mayor, que es la que fija la hora de salida; en la mañana la
        fila dice con qué hijos vienen. «Entran» y «salen» son la mitad central con la mediana en negritas; «dentro», la mediana y la mitad central:
        si es ancha, una parte se queda mucho más. En la barra, lo claro es cuándo entran y lo oscuro cuándo salen.
      </p>
      <BloqueMomento v={viajes.tarde} lote={lote} titulo="Al recoger (tarde)" />
      <BloqueMomento v={viajes.manana} lote={lote} titulo="Al dejar (mañana)" />
    </div>
  );
}

/** Por debajo de esto, una seccion no lleva bloque y una fila no se lista. */
const MIN_SECCION_POR_DIA = 1;

function BloqueMomento({ v, lote, titulo }: { v: ViajesPorSeccion; lote: string; titulo: string }) {
  const alcance = v.porLote.find((l) => l.lote === lote);
  const secciones = (alcance?.secciones ?? []).filter((s) => s.autosPorDia >= MIN_SECCION_POR_DIA);
  if (secciones.length === 0) return null;
  const manana = v.momento === "manana";
  const franja = FRANJA_VIAJE[v.momento];
  const nombreDe = (s: (typeof secciones)[number]) => (s.seccion === "sin" ? "Papás sin ligar a GES" : `Papás de ${NOMBRE_SECCION[s.seccion]}`);
  const filaDe = (s: (typeof secciones)[number], f: FilaViaje) =>
    f.mayor === null ? "no se sabe por quién vienen" : f.mayor === s.seccion ? `solo ${NOMBRE_SECCION[f.mayor]}` : `${manana ? "y" : "hasta"} ${NOMBRE_SECCION[f.mayor]}`;
  return (
    <div style={{ marginTop: 12 }}>
      <p className="viz-titulo" style={{ fontSize: "1rem" }}><strong>{titulo}</strong></p>
      {secciones.map((s) => (
        <div key={s.seccion} style={{ marginTop: 10 }}>
          <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{nombreDe(s)} · {esMx(s.autosPorDia)} autos al día</p>
          {s.conMayor > 0 && (
            <p className="ti-hint" style={{ margin: "0 0 2px" }}>
              {Math.round((100 * s.conMayor) / s.autosPorDia)} % ({esMx(s.conMayor)} al día){" "}
              {manana ? "traen también a un hijo de una sección mayor." : "se quedan hasta la salida de un hijo mayor."}
            </p>
          )}
          <div className="table-wrap">
            <table className="admin-table tabla-pro tabla-fija">
              <thead>
                <tr>
                  <th>{manana ? "Con qué hijos vienen" : "Hasta qué sección se quedan"}</th>
                  {/* Las cifras son angostas («2.4») y el encabezado no: sin ancho minimo se encima con «Entran». */}
                  <th className="num" style={{ minWidth: 96 }}>Autos al día</th>
                  <th style={{ minWidth: 150 }}>Entran</th>
                  <th style={{ minWidth: 150 }}>Salen</th>
                  <th style={{ minWidth: 110 }}>Dentro</th>
                  <th>{horaCorta(franja.desde)} a {horaCorta(franja.hasta)}</th>
                </tr>
              </thead>
              <tbody>
                {s.filas.filter((f) => f.autosPorDia >= MIN_AUTOS_POR_DIA || s.filas.length === 1).map((f) => (
                  <tr key={f.mayor ?? "sin"}>
                    <td>{filaDe(s, f)}</td>
                    <td className="num">{esMx(f.autosPorDia)}<br /><span className="ti-hint">{Math.round(100 * f.parte)} %</span></td>
                    <td>{rangoDe(f.entra)} · <strong>{horaCorta(f.entra.p50)}</strong></td>
                    <td>{rangoDe(f.sale)} · <strong>{horaCorta(f.sale.p50)}</strong></td>
                    <td><strong>{f.dentro.p50} min</strong> <span className="ti-hint">{f.dentro.p25} a {f.dentro.p75}</span></td>
                    <td><BarraViaje f={f} franja={franja} nombre={`${nombreDe(s)}, ${filaDe(s, f)}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Entran (claro), salen (oscuro) y la linea entre las dos medianas, sobre la franja del momento. */
function BarraViaje({ f, franja, nombre }: { f: FilaViaje; franja: { desde: number; hasta: number }; nombre: string }) {
  const w = 240, h = 20;
  const x = (m: number) => r(Math.max(0, Math.min(w, ((m - franja.desde) / (franja.hasta - franja.desde)) * w)));
  const texto = `${nombre}: entran ${rangoDe(f.entra)}, salen ${rangoDe(f.sale)}, ${f.dentro.p50} minutos dentro`;
  const horas: number[] = [];
  for (let m = franja.desde; m <= franja.hasta; m += 30) horas.push(m);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={texto} style={{ display: "block" }}>
      <title>{texto}</title>
      {horas.map((m) => (
        <line key={m} className="viz-reja" x1={x(m)} x2={x(m)} y1={2} y2={h - 2} style={m % 60 === 0 ? { stroke: "var(--line)" } : undefined} />
      ))}
      <line className="viz-linea" x1={x(f.entra.p50)} x2={x(f.sale.p50)} y1={h / 2} y2={h / 2} style={{ strokeWidth: 2 }} />
      <rect x={x(f.entra.p25)} y={5} width={Math.max(2, r(x(f.entra.p75 + 5) - x(f.entra.p25)))} height={h - 10} rx={3} fill="var(--viz-serie-1)" opacity={0.35} />
      <rect x={x(f.sale.p25)} y={5} width={Math.max(2, r(x(f.sale.p75 + 5) - x(f.sale.p25)))} height={h - 10} rx={3} fill="var(--viz-serie-1)" />
    </svg>
  );
}

/* ------------------------------------------------------------------ dentro, apilado */

function PanelDentro({ titulo, capas, minutos, cupo }: { titulo: string; capas: Capa[]; minutos: number[]; cupo: number | null }) {
  const izq = 40, der = 14, arriba = 24, alto = 150, abajo = 26;
  const H = arriba + alto + abajo;
  const ancho = W - izq - der;
  const n = minutos.length;
  const total = (i: number) => sum(capas.map((c) => c.dentro[i]));
  const max = Math.max(0, ...minutos.map((_, i) => total(i)));
  const techo = cupo !== null ? Math.max(cupo, max) * 1.08 : Math.max(Math.ceil(max * 1.2), 10);
  const x = (m: number) => r(izq + ((m - SALIDA_DESDE) / (SALIDA_HASTA - SALIDA_DESDE)) * ancho);
  const y = (v: number) => r(arriba + alto - (v / techo) * alto);
  const dx = n > 1 ? x(minutos[1]) - x(minutos[0]) : 10;

  // El apilado: cada capa va de la suma de las de abajo a esa suma mas la suya.
  const ceros = minutos.map(() => 0);
  const topes = capas.reduce<number[][]>((acc, c) => {
    const abajo = acc.length > 0 ? acc[acc.length - 1] : ceros;
    acc.push(abajo.map((b, i) => b + c.dentro[i]));
    return acc;
  }, []);
  const areas = capas.map((c, k) => {
    const base = k === 0 ? ceros : topes[k - 1];
    const tope = topes[k];
    const arribaD = minutos.map((m, i) => `${i === 0 ? "M" : "L"} ${x(m)} ${y(tope[i])}`).join(" ");
    const abajoD = minutos.map((m, i) => `L ${x(m)} ${y(base[i])}`).reverse().join(" ");
    return { c, d: `${arribaD} ${abajoD} Z` };
  });
  const horas: number[] = [];
  for (let m = SALIDA_DESDE; m <= SALIDA_HASTA; m += 30) horas.push(m);
  const iMax = minutos.findIndex((_, i) => total(i) === max);

  return (
    <div className="viz">
      <p className="viz-titulo"><strong>{titulo}</strong>{cupo !== null ? ` · ${cupo} cajones` : ""}{max > 0 && iMax >= 0 ? ` · lo más lleno: ${max} a las ${horaCorta(minutos[iMax])}` : ""}</p>
      <div className="viz-scroll">
        <svg className="viz-svg" viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`${titulo}: coches dentro a cada cinco minutos de ${horaCorta(SALIDA_DESDE)} a ${horaCorta(SALIDA_HASTA)}, apilados por quién viene. Lo más lleno: ${max} a las ${iMax >= 0 ? horaCorta(minutos[iMax]) : "—"}.`}>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line className="viz-reja" x1={izq} x2={W - der} y1={y(techo * f)} y2={y(techo * f)} />
              <text className="viz-marca" x={izq - 6} y={y(techo * f) + 4} textAnchor="end">{Math.round(techo * f)}</text>
            </g>
          ))}
          {areas.map(({ c, d }) => (
            <path key={c.grupo.clave} className={`viz-g${c.grupo.color}`} d={d} stroke="var(--panel)" strokeWidth={1.5} strokeLinejoin="round" />
          ))}
          {cupo !== null && (
            <g>
              <line className="viz-aforo" x1={izq} x2={W - der} y1={y(cupo)} y2={y(cupo)} />
              <text className="viz-marca" x={W - der} y={y(cupo) - 5} textAnchor="end">lleno: {cupo}</text>
            </g>
          )}
          <line className="viz-eje" x1={izq} x2={W - der} y1={y(0)} y2={y(0)} />
          {horas.map((m) => (
            <text key={m} className="viz-marca" x={x(m)} y={arriba + alto + 18} textAnchor="middle">{horaCorta(m)}</text>
          ))}
          {/* Un blanco sensible por columna: el grupo y la cifra, al puntero y al teclado. */}
          {minutos.map((m, i) => {
            const t = total(i);
            const texto = `${horaCorta(m)} · ${t} dentro: ${capas.map((c) => `${c.grupo.titulo} ${c.dentro[i]}`).join(", ")}`;
            return (
              <rect key={m} className="viz-blanco" x={r(x(m) - dx / 2)} y={arriba} width={r(dx)} height={alto} fill="transparent"
                tabIndex={i % 3 === 0 ? 0 : -1} role="img" aria-label={texto}>
                <title>{texto}</title>
              </rect>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ salen, por cinco minutos */

function PanelSalen({ titulo, capas, minutos }: { titulo: string; capas: Capa[]; minutos: number[] }) {
  const izq = 40, der = 14, arriba = 24, alto = 120, abajo = 26;
  const H = arriba + alto + abajo;
  const ancho = W - izq - der;
  const n = minutos.length;
  const total = (i: number) => sum(capas.map((c) => c.salen[i]));
  const max = Math.max(0, ...minutos.map((_, i) => total(i)));
  const techo = Math.max(Math.ceil(max * 1.2), 5);
  const x = (m: number) => r(izq + ((m - SALIDA_DESDE) / (SALIDA_HASTA - SALIDA_DESDE)) * ancho);
  const y = (v: number) => r(arriba + alto - (v / techo) * alto);
  const dx = n > 1 ? x(minutos[1]) - x(minutos[0]) : 10;
  const w = Math.max(dx * 0.72, 3);
  const horas: number[] = [];
  for (let m = SALIDA_DESDE; m <= SALIDA_HASTA; m += 30) horas.push(m);
  const iMax = minutos.findIndex((_, i) => total(i) === max);

  return (
    <div className="viz">
      <p className="viz-titulo"><strong>{titulo}</strong> · cada cinco minutos{max > 0 && iMax >= 0 ? ` · la peor: ${max} entre ${horaCorta(minutos[iMax])} y ${horaCorta(minutos[iMax] + 5)}` : ""}</p>
      <div className="viz-scroll">
        <svg className="viz-svg" viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`${titulo}: cuántos coches salen en cada cinco minutos de la tarde, apilados por quién viene. El tramo de más salidas: ${max} entre ${iMax >= 0 ? horaCorta(minutos[iMax]) : "—"} y ${iMax >= 0 ? horaCorta(minutos[iMax] + 5) : "—"}.`}>
          {[0.5, 1].map((f) => (
            <g key={f}>
              <line className="viz-reja" x1={izq} x2={W - der} y1={y(techo * f)} y2={y(techo * f)} />
              <text className="viz-marca" x={izq - 6} y={y(techo * f) + 4} textAnchor="end">{Math.round(techo * f)}</text>
            </g>
          ))}
          {minutos.map((m, i) => {
            let acum = 0;
            const t = total(i);
            const texto = `${horaCorta(m)} a ${horaCorta(m + 5)} · salen ${t}: ${capas.map((c) => `${c.grupo.titulo} ${c.salen[i]}`).join(", ")}`;
            return (
              <g key={m}>
                {capas.map((c) => {
                  const v = c.salen[i];
                  const b = acum;
                  acum += v;
                  if (v === 0) return null;
                  const yA = y(b + v);
                  return <rect key={c.grupo.clave} className={`viz-g${c.grupo.color}`} x={r(x(m) - w / 2)} y={yA} width={r(w)} height={Math.max(r(y(b) - yA), 1)} stroke="var(--panel)" strokeWidth={1} />;
                })}
                {i === iMax && t > 0 && <text className="viz-valor" x={x(m)} y={y(t) - 6} textAnchor="middle">{t}</text>}
                <rect className="viz-blanco" x={r(x(m) - dx / 2)} y={arriba} width={r(dx)} height={alto} fill="transparent"
                  tabIndex={i % 3 === 0 ? 0 : -1} role="img" aria-label={texto}>
                  <title>{texto}</title>
                </rect>
              </g>
            );
          })}
          <line className="viz-eje" x1={izq} x2={W - der} y1={y(0)} y2={y(0)} />
          {horas.map((m) => (
            <text key={m} className="viz-marca" x={x(m)} y={arriba + alto + 18} textAnchor="middle">{horaCorta(m)}</text>
          ))}
        </svg>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ la tabla hermana (cinco grupos) */

function TablaSalida({ capas, minutos }: { capas: Capa[]; minutos: number[] }) {
  const i1430 = minutos.indexOf(LAS_1430);
  const enMediaHora = (c: Capa, desde: number) => sum(c.salen.filter((_, i) => minutos[i] >= desde && minutos[i] < desde + 30));
  const maxDe = (c: Capa) => {
    const v = Math.max(0, ...c.dentro);
    const i = c.dentro.indexOf(v);
    return v > 0 && i >= 0 ? `${v} (${horaCorta(minutos[i])})` : "—";
  };
  return (
    <div className="table-wrap" style={{ marginTop: 10 }}>
      <table className="admin-table tabla-pro tabla-fija">
        <thead>
          <tr>
            <th>Por quién viene</th>
            <th className="num">Dentro a las 14:30</th>
            <th className="num">Lo más que hay dentro</th>
            {MEDIAS_HORAS.map((h) => (
              <th key={h} className="num">Salen {horaCorta(h)}–{horaCorta(h + 30)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {capas.map((c) => (
            <tr key={c.grupo.clave}>
              <td>
                <i className={`viz-g${c.grupo.color}`} style={{ background: `var(--viz-g${c.grupo.color})`, borderRadius: 3, display: "inline-block", height: 10, marginRight: 6, width: 10 }} />
                {c.grupo.titulo}
              </td>
              <td className="num">{i1430 >= 0 ? c.dentro[i1430] : "—"}</td>
              <td className="num">{maxDe(c)}</td>
              {MEDIAS_HORAS.map((h) => (
                <td key={h} className="num">{enMediaHora(c, h)}</td>
              ))}
            </tr>
          ))}
          <tr>
            <td><strong>Total</strong></td>
            <td className="num"><strong>{i1430 >= 0 ? sum(capas.map((c) => c.dentro[i1430])) : "—"}</strong></td>
            <td className="num">—</td>
            {MEDIAS_HORAS.map((h) => (
              <td key={h} className="num"><strong>{sum(capas.map((c) => enMediaHora(c, h)))}</strong></td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ el detalle: cada seccion y cada combinacion */

/**
 * Una fila por seccion o combinacion de secciones (los papas) y por departamento de
 * ZK (el personal), en el orden en que salen. Es lo que Gerardo pidio ver «tal cual»:
 * no cinco grupos, sino quien viene por quien, con su hora de entrada y de salida.
 */
function DetallePorSeccion({ detalle, lote }: { detalle: SalidaPorClave<string>; lote: string }) {
  const alcance = detalle.porLote.find((l) => l.lote === lote);
  if (!alcance) return null;
  const conSalida = alcance.series.filter((s): s is SerieRecogida<string> & { sale: Cuartiles } => s.sale !== null);
  const filas = conSalida
    .filter((s) => s.autosPorDia >= MIN_AUTOS_POR_DIA)
    .sort((a, b) => a.sale.p50 - b.sale.p50 || b.autosPorDia - a.autosPorDia);
  const pocas = conSalida.filter((s) => s.autosPorDia < MIN_AUTOS_POR_DIA).sort((a, b) => b.autosPorDia - a.autosPorDia);
  if (filas.length === 0) return null;
  const rango = (c: Cuartiles) => `${horaCorta(c.p25)}–${horaCorta(c.p75)}`;
  const donde = lote === "ambos" ? "los dos estacionamientos" : `el ${nombreLote(lote)}`;

  return (
    <div style={{ marginTop: 18 }}>
      <p className="viz-titulo"><strong>Cada sección y cada combinación: cuándo entran y cuándo salen</strong> · {donde}</p>
      <p className="ti-hint" style={{ margin: "0 0 8px" }}>
        Una fila por sección o combinación de secciones de los hijos (los papás) y por departamento de ZK (el personal), en el orden en
        que salen. «Entran» y «salen» son la mitad central de quienes se van entre {horaCorta(SALIDA_DESDE)} y {horaCorta(SALIDA_HASTA)}, con la
        mediana en negritas; «autos al día» es cuántos de ellos hay en un día. La curva es cuántos hay dentro en un día típico, cada una a su
        propia escala, con una marca abajo en su franja de salida.
      </p>
      <div className="table-wrap">
        <table className="admin-table tabla-pro tabla-fija">
          <thead>
            <tr>
              <th>Sección o combinación</th>
              <th className="num">Autos al día</th>
              <th>Entran</th>
              <th>Salen</th>
              <th className="num">Máx. dentro</th>
              <th>Dentro, {horaCorta(SALIDA_DESDE)}–{horaCorta(SALIDA_HASTA)}</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((s) => {
              const max = Math.max(0, ...s.dentro);
              const iMax = s.dentro.indexOf(max);
              return (
                <tr key={s.clave}>
                  <td>{s.clave}</td>
                  <td className="num">{s.autosPorDia.toLocaleString("es-MX")}</td>
                  <td>{s.entra ? <>{rango(s.entra)} · <strong>{horaCorta(s.entra.p50)}</strong></> : "—"}</td>
                  <td>{rango(s.sale)} · <strong>{horaCorta(s.sale.p50)}</strong></td>
                  <td className="num">{max > 0 && iMax >= 0 ? `${max} (${horaCorta(detalle.minutos[iMax])})` : "—"}</td>
                  <td><MiniDentro minutos={detalle.minutos} dentro={s.dentro} sale={s.sale} clave={s.clave} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pocas.length > 0 && (
        <p className="ti-hint" style={{ margin: "6px 0 0" }}>
          Con menos de un auto cada dos días, sin fila: {pocas.map((s) => `${s.clave} (${s.autosPorDia.toLocaleString("es-MX")})`).join("; ")}.
        </p>
      )}
    </div>
  );
}

/** La curva de dentro de una fila, chica y a su propia escala, con la franja de salida marcada abajo. */
function MiniDentro({ minutos, dentro, sale, clave }: { minutos: number[]; dentro: number[]; sale: Cuartiles; clave: string }) {
  const w = 240, h = 44, pad = 2;
  const max = Math.max(1, ...dentro);
  const x = (m: number) => r(pad + ((m - SALIDA_DESDE) / (SALIDA_HASTA - SALIDA_DESDE)) * (w - 2 * pad));
  const y = (v: number) => r(h - 9 - (v / max) * (h - 14));
  const linea = minutos.map((m, i) => `${i === 0 ? "M" : "L"} ${x(m)} ${y(dentro[i])}`).join(" ");
  const area = `${linea} L ${x(minutos[minutos.length - 1])} ${y(0)} L ${x(minutos[0])} ${y(0)} Z`;
  const texto = `${clave}: dentro de ${horaCorta(SALIDA_DESDE)} a ${horaCorta(SALIDA_HASTA)}, lo más ${max}; salen entre ${horaCorta(sale.p25)} y ${horaCorta(sale.p75)}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={texto} style={{ display: "block" }}>
      <title>{texto}</title>
      {[13 * 60, 14 * 60, 15 * 60].map((m) => (
        <line key={m} className="viz-reja" x1={x(m)} x2={x(m)} y1={2} y2={y(0)} />
      ))}
      <path className="viz-area" d={area} />
      <path className="viz-linea" d={linea} style={{ strokeWidth: 1.5 }} />
      <line className="viz-eje" x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} />
      <rect x={x(sale.p25)} y={h - 5} width={Math.max(r(x(sale.p75) - x(sale.p25)), 2)} height={3} rx={1} fill="var(--ink)" />
    </svg>
  );
}
