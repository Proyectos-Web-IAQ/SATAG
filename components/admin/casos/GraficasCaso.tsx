"use client";

// La evidencia de un caso en GRAFICAS hechas con los pasos reales de la pluma
// (Gerardo, 7-oct: «en que se basa para decir que es asi, pero no con texto»).
// Cada bloque abre con una frase calculada de los mismos datos y trae su tabla
// («Ver los datos»), que es la vista accesible y la que se puede copiar.
//
// Colores: el TAG del caso va en el azul de SATAG y el que se compara en naranja
// (Okabe-Ito, validado contra daltonismo). El naranja no da 3:1 contra el fondo, por
// eso cada serie lleva rotulo y tabla. Entrada, salida y rechazo se distinguen por
// FORMA (circulo, cuadro, circulo hueco con cruz), no solo por color.
import { useMemo, type ReactNode } from "react";
import type { EventoZk } from "@/lib/zk/eventos";
import type { CasoGuardado } from "@/lib/casosRegistro";
import {
  DIAS_ATIPICOS,
  acompanantes,
  diaNormal,
  diasHabiles,
  estanciasDe,
  incompletas,
  incompletasDelLote,
  lecturasDe,
  leidosJuntos,
  llegadaHabitual,
  tagPrincipalDe,
  usoPorDia,
  type Lectura,
} from "@/lib/casosEvidencia";
import { PasosSemana } from "@/components/admin/FichaPersona";
import type { PersonaZk } from "@/lib/zk/padron";
import { diaMes, diaSemana } from "@/lib/formato";

/** El expediente de SATAG de un TAG: el vigente, o uno que lo tuvo antes. */
export interface ExpedienteTag { folio: string; estado: string; anterior: boolean; placas?: string | null; vehiculo?: string | null }

/** El estado del expediente con las palabras del resto del panel (FichaPersona ESTADO_LABEL). */
const estadoLegible = (e: string) => ({ pendiente: "pendiente de cobro", activo: "activo", bloqueado: "bloqueado", baja: "dado de baja" } as Record<string, string>)[e] ?? e;

/** Placas comparables: sin espacios ni guiones, en mayusculas. */
const placaNorm = (p: string | null | undefined) => (p ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();

export const SERIE = ["#1F5FA8", "#E69F00"];
const LOTE: Record<string, string> = { E2: "#1F5FA8", E1: "#1E8A5A" };
const DESDE = 5 * 60, HASTA = 21 * 60;

export interface Ventana { desde: string | null; hasta: string | null }

const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(Math.floor(m % 60)).padStart(2, "0")}`;
const diaCorto = (d: string) => diaSemana(d);
const diaMin = (d: string) => diaMes(d);

/* ------------------------------------------------------------------ piezas */

function Bloque({ titulo, sub, children }: { titulo: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <section className="g-bloque">
      <div className="g-tit">{titulo}</div>
      {sub && <div className="g-sub">{sub}</div>}
      {children}
    </section>
  );
}

function Tabla({ cab, filas }: { cab: string[]; filas: ReactNode[][] }) {
  if (!filas.length) return null;
  return (
    <details className="g-datos">
      <summary>Ver los datos ({filas.length})</summary>
      <div className="g-tabla">
        <table>
          <thead><tr>{cab.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{filas.map((f, i) => <tr key={i}>{f.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

function Marca({ l, x, y, color }: { l: Lectura; x: number; y: number; color: string }) {
  const tip = <title>{`${diaCorto(l.dia)} ${hhmm(l.min)} · ${l.sentido} ${l.lote}${l.ok ? "" : " · RECHAZADO"}`}</title>;
  if (!l.ok) {
    return (
      <g>
        {tip}
        <circle cx={x} cy={y} r={4.5} fill="#fff" stroke={color} strokeWidth={1.6} />
        <path d={`M${x - 2.2} ${y - 2.2}l4.4 4.4M${x + 2.2} ${y - 2.2}l-4.4 4.4`} stroke={color} strokeWidth={1.3} />
      </g>
    );
  }
  return l.sentido === "entrada"
    ? <circle cx={x} cy={y} r={4.5} fill={color} stroke="#fff" strokeWidth={1.5}>{tip}</circle>
    : <rect x={x - 4.5} y={y - 4.5} width={9} height={9} rx={1.5} fill={color} stroke="#fff" strokeWidth={1.5}>{tip}</rect>;
}

function LeyendaFormas({ series }: { series: { etiqueta: string; color: string }[] }) {
  return (
    <div className="g-ley">
      {series.map((s) => <span key={s.etiqueta}><i style={{ background: s.color }} />{s.etiqueta}</span>)}
      <span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="#657080" /></svg> entrada</span>
      <span><svg width="12" height="12" aria-hidden="true"><rect x="2" y="2" width="8" height="8" rx="1" fill="#657080" /></svg> salida</span>
      <span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="#fff" stroke="#657080" strokeWidth="1.5" /><path d="M4 4l4 4M8 4l-4 4" stroke="#657080" strokeWidth="1.3" /></svg> la pluma lo rechazó</span>
    </div>
  );
}

/** Tira por dia y hora de uno o dos TAGs; con dos, une las lecturas a <= 5 s en el mismo lector. */
export function TiraPasos({ series, maxDias = 14 }: { series: { etiqueta: string; lecturas: Lectura[] }[]; maxDias?: number }) {
  let dias = [...new Set(series.flatMap((s) => s.lecturas.map((l) => l.dia)))].sort();
  if (!dias.length) return <p className="g-vacio">Sin pasos por la pluma en la bitácora cargada.</p>;
  const recortados = Math.max(0, dias.length - maxDias);
  dias = dias.slice(-maxDias);
  const carril = 16, sep = 10, izq = 92, der = 16, w = 660;
  const altoDia = carril * series.length + sep, top = 24, alto = top + dias.length * altoDia + 4;
  const x = (m: number) => izq + ((Math.min(HASTA, Math.max(DESDE, m)) - DESDE) / (HASTA - DESDE)) * (w - izq - der);
  const horas: number[] = [];
  for (let m = 6 * 60; m <= 20 * 60; m += 120) horas.push(m);
  const juntos = series.length === 2 ? leidosJuntos(series[0].lecturas, series[1].lecturas) : [];
  return (
    <>
      <div className="g-svg">
        <svg viewBox={`0 0 ${w} ${alto}`} role="img" aria-label="Pasos por la pluma, por día y hora">
          {horas.map((m) => (
            <g key={m}>
              <line x1={x(m)} x2={x(m)} y1={top} y2={alto} stroke="#e4e9f0" />
              <text x={x(m)} y={top - 6} textAnchor="middle" className="g-eje">{hhmm(m)}</text>
            </g>
          ))}
          {dias.map((d, i) => {
            const y0 = top + i * altoDia;
            return (
              <g key={d}>
                {i % 2 === 0 && <rect x={izq} y={y0 - 2} width={w - izq - der} height={altoDia - sep + 4} fill="#f8fafd" />}
                <text x={0} y={y0 + (carril * series.length) / 2 + 4} className="g-dia">{diaCorto(d)}{DIAS_ATIPICOS.includes(d) ? " *" : ""}</text>
                {juntos.filter((p) => p.a.dia === d).map((p, k) => (
                  <line key={k} x1={x(p.a.min)} x2={x(p.b.min)} y1={y0 + carril / 2} y2={y0 + carril * 1.5} stroke="#657080" strokeWidth={1.5}>
                    <title>{`${p.dif} s entre los dos · ${p.a.sentido} ${p.a.lote}`}</title>
                  </line>
                ))}
                {series.map((s, j) => s.lecturas.filter((l) => l.dia === d).map((l, k) => (
                  <Marca key={`${j}-${k}`} l={l} x={x(l.min)} y={y0 + carril * j + carril / 2} color={SERIE[j]} />
                )))}
              </g>
            );
          })}
        </svg>
      </div>
      <LeyendaFormas series={series.map((s, i) => ({ etiqueta: s.etiqueta, color: SERIE[i] }))} />
      {recortados > 0 && <div className="g-nota">Se muestran los últimos {maxDias} días con pasos; hay {recortados} más en la tabla.</div>}
      {dias.some((d) => DIAS_ATIPICOS.includes(d)) && <div className="g-nota">* Día atípico (pluma abierta o evento): no cuenta para conclusiones.</div>}
      <Tabla
        cab={["Día", "Hora", "TAG", "Lector", "Resultado"]}
        filas={series.flatMap((s) => s.lecturas.map((l) => ({ s, l })))
          .sort((a, b) => a.l.s - b.l.s)
          .map(({ s, l }) => [diaCorto(l.dia), hhmm(l.min), s.etiqueta, `${l.sentido} ${l.lote}`, l.ok ? "abrió" : <b key="r">rechazado</b>])}
      />
    </>
  );
}

/** Un cuadro por dia habil: mas oscuro, mas entradas; × = hubo rechazo. */
export function CalendarioUso({ filas, dias, ventana }: { filas: { etiqueta: string; lecturas: Lectura[] }[]; dias: string[]; ventana: Ventana }) {
  const c = 15, gap = 3, izq = 130, top = 18;
  const w = izq + dias.length * (c + gap) + 8, alto = top + filas.length * (c + 10) + 14;
  const usos = filas.map((f) => usoPorDia(f.lecturas, dias));
  const max = Math.max(1, ...usos.flat().map((u) => u.entradas));
  return (
    <>
      <div className="g-svg">
        <svg viewBox={`0 0 ${w} ${alto}`} style={{ width: Math.round(w * 1.4), minWidth: 0, maxWidth: "none" }} role="img" aria-label="Días con uso">
          {dias.map((d, i) => (new Date(d + "T12:00:00").getDay() === 1 ? <text key={d} x={izq + i * (c + gap)} y={top - 6} className="g-eje">{diaMin(d)}</text> : null))}
          {filas.map((f, j) => {
            const y = top + j * (c + 10);
            return (
              <g key={f.etiqueta}>
                <text x={izq - 8} y={y + c - 3} textAnchor="end" className="g-dia">{f.etiqueta}</text>
                {usos[j].map((u, i) => {
                  const cx = izq + i * (c + gap);
                  const atip = !diaNormal(u.dia, ventana);
                  return (
                    <g key={u.dia}>
                      <title>{`${diaCorto(u.dia)}: ${u.entradas} entrada${u.entradas === 1 ? "" : "s"}${u.rechazos ? `, ${u.rechazos} rechazo${u.rechazos === 1 ? "" : "s"}` : ""}${atip ? " (no cuenta)" : ""}`}</title>
                      <rect x={cx} y={y} width={c} height={c} rx={3} fill={u.entradas ? SERIE[j] : "#fff"} fillOpacity={u.entradas ? 0.25 + 0.75 * (u.entradas / max) : 1} stroke={u.entradas ? "none" : "#dbe1e8"} />
                      {u.rechazos > 0 && <path d={`M${cx + 4} ${y + 4}l7 7M${cx + 11} ${y + 4}l-7 7`} stroke="#2E2A25" strokeWidth={1.6} />}
                      {atip && <circle cx={cx + c / 2} cy={y + c + 5} r={1.6} fill="#657080" />}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="g-ley">
        <span><i style={{ background: SERIE[0], opacity: 0.35 }} />pocas entradas</span>
        <span><i style={{ background: SERIE[0] }} />muchas</span>
        <span><i style={{ background: "#fff", boxShadow: "inset 0 0 0 1px #dbe1e8" }} />no entró</span>
        <span>✕ hubo rechazo</span>
        <span>· día que no cuenta</span>
      </div>
    </>
  );
}

/** Barras horizontales para comparar, con su cifra al lado. */
function Comparar({ filas }: { filas: { etiqueta: string; valor: number; max: number; texto: string; sub?: string; color: string; hueco?: boolean }[] }) {
  return (
    <>
      {filas.map((f) => (
        <div className="g-cmp" key={f.etiqueta}>
          <span title={f.etiqueta}>{f.etiqueta}</span>
          <div className="g-cmp-b">
            <i style={{ width: `${Math.max(f.valor ? 1 : 0, (f.valor / Math.max(1, f.max)) * 100)}%`, background: f.hueco ? "#fff" : f.color, boxShadow: f.hueco ? "inset 0 0 0 1.5px #2E2A25" : undefined }} />
          </div>
          <b>{f.texto}</b>
          <span className="g-sub">{f.sub ?? ""}</span>
        </div>
      ))}
    </>
  );
}

/** A que hora llega: primera entrada de cada dia normal, en tramos de 15 min. */
function Llegada({ r }: { r: NonNullable<ReturnType<typeof llegadaHabitual>> }) {
  const desde = Math.max(5 * 60, r.tramos[0].desde - 30), hasta = Math.min(21 * 60, r.tramos[r.tramos.length - 1].desde + 45);
  const w = 660, izq = 28, top = 14, h = 100, base = top + h;
  const x = (m: number) => izq + ((m - desde) / Math.max(1, hasta - desde)) * (w - izq - 10);
  const max = Math.max(...r.tramos.map((t) => t.dias));
  const bw = Math.max(4, x(15) - x(0) - 2);
  const horas: number[] = [];
  for (let m = Math.ceil(desde / 60) * 60; m <= hasta; m += 60) horas.push(m);
  return (
    <div className="g-svg">
      <svg viewBox={`0 0 ${w} ${base + 20}`} role="img" aria-label="Hora de llegada por tramo de 15 minutos">
        {horas.map((m) => (
          <g key={m}>
            <line x1={x(m)} x2={x(m)} y1={top} y2={base} stroke="#e4e9f0" />
            <text x={x(m)} y={base + 14} textAnchor="middle" className="g-eje">{hhmm(m)}</text>
          </g>
        ))}
        {r.tramos.map((t) => {
          const y = base - (t.dias / max) * h;
          return (
            <path key={t.desde} d={`M${x(t.desde) + 1} ${base}V${y + 4}q0 -4 4 -4h${Math.max(0, bw - 8)}q4 0 4 4V${base}Z`} fill={SERIE[0]}>
              <title>{`${hhmm(t.desde)}–${hhmm(t.desde + 15)}: ${t.dias} día${t.dias === 1 ? "" : "s"}`}</title>
            </path>
          );
        })}
        <text x={x(r.tramo) + bw / 2} y={base - (r.diasEnTramo / max) * h - 6} textAnchor="middle" className="g-val">{r.diasEnTramo}</text>
        <line x1={izq} x2={w - 10} y1={base} y2={base} stroke="#657080" />
      </svg>
    </div>
  );
}

/**
 * «Los TAGs de este caso»: un renglon por TAG con su color en las graficas, el
 * numero COMPLETO y como esta en cada sistema. Sin esto, la grafica de dos TAGs no
 * decia cual era cual (Gerardo, 7-oct, con el caso de los dos TAGs del mismo coche).
 */
export function LosTags({ tags, eventos, ventana, zkDe, expedienteDe, nombreDe, titulo, leeZk = true }: {
  tags: { tarjeta: string; papel: string }[];
  eventos: EventoZk[];
  ventana: Ventana;
  zkDe?: (t: string) => PersonaZk | undefined;
  expedienteDe?: (t: string) => ExpedienteTag | undefined;
  nombreDe: (t: string) => string | undefined;
  titulo?: string;
  /** false: este rol no lee el padron ni la bitacora de ZK (Administracion). Se dice, no se pinta en cero. */
  leeZk?: boolean;
}) {
  const hayBitacora = leeZk && !!ventana.desde;
  return (
    <section className="g-bloque">
      <div className="g-tit">{titulo ?? (tags.length > 1 ? "Los TAGs de este caso" : "El TAG de este caso")}</div>
      <div className="g-tags">
        {tags.map(({ tarjeta, papel }, i) => {
          const z = zkDe?.(tarjeta);
          const x = expedienteDe?.(tarjeta);
          const l = lecturasDe(eventos, tarjeta);
          const abrio = l.filter((y) => y.ok).length, rech = l.length - abrio;
          const ult = l.filter((y) => y.ok).pop();
          return (
            <div className="g-tagc" key={tarjeta} style={{ borderTopColor: SERIE[i] ?? "#657080" }}>
              <div className="g-tag"><i style={{ background: SERIE[i] ?? "#657080" }} aria-hidden="true" /><b className="mono">{tarjeta}</b></div>
              <div className="g-papel">{papel}</div>
              <dl className="g-tagc__pares">
                {leeZk ? (
                  <>
                    <dt>En ZK</dt><dd>{z?.nombre || nombreDe(tarjeta) || <span className="g-falta-dato">no está en el padrón de ZK</span>}</dd>
                    <dt>Departamento</dt><dd>{z?.departamento || "—"}</dd>
                    <dt>Placa en ZK</dt><dd className="mono">{z?.placa || "—"}</dd>
                  </>
                ) : (
                  <><dt>En ZK</dt><dd className="g-falta-dato">lo ven TI y Contabilidad</dd></>
                )}
                <dt>Placa en SATAG</dt>
                <dd>
                  <span className="mono">{x?.placas || "—"}</span>
                  {x?.placas && z?.placa && placaNorm(x.placas) !== placaNorm(z.placa) && <span className="g-difiere"> · no coincide con ZK</span>}
                </dd>
                <dt>Vehículo</dt><dd>{x?.vehiculo || "—"}</dd>
                <dt>En SATAG</dt><dd>{x ? <><span className="mono">{x.folio}</span> · {x.anterior ? `TAG anterior (${estadoLegible(x.estado)})` : estadoLegible(x.estado)}</> : <span className="g-falta-dato">sin expediente</span>}</dd>
                {hayBitacora ? (
                  <>
                    <dt>Pluma</dt><dd>abrió <b>{abrio}</b>{rech ? <> · rechazó <b>{rech}</b></> : " · sin rechazos"}</dd>
                    <dt>Último paso</dt><dd>{ult ? `${diaCorto(ult.dia)} ${hhmm(ult.min)}` : "—"}</dd>
                  </>
                ) : (
                  <><dt>Pluma</dt><dd className="g-falta-dato">{leeZk ? "sin bitácora cargada" : "la ven TI y Contabilidad"}</dd></>
                )}
              </dl>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ por tipo */

interface Props {
  caso: CasoGuardado;
  eventos: EventoZk[];
  ventana: Ventana;
  nombreDe: (tarjeta: string) => string | undefined;
  zkDe?: (tarjeta: string) => PersonaZk | undefined;
  expedienteDe?: (tarjeta: string) => ExpedienteTag | undefined;
}

/** La evidencia en graficas segun el tipo del caso. */
export function EvidenciaGraficas({ caso, eventos, ventana, nombreDe, zkDe, expedienteDe }: Props) {
  const t = caso.tarjeta ?? "";
  const ev = caso.evidencia ?? {};
  // En las graficas el TAG va COMPLETO: es lo que se busca en ZK (Gerardo, 7-oct).
  const etiqueta = (x: string) => x;
  const cuadro = (tags: { tarjeta: string; papel: string }[]) => (
    <LosTags tags={tags} eventos={eventos} ventana={ventana} zkDe={zkDe} expedienteDe={expedienteDe} nombreDe={nombreDe} />
  );
  const dias = useMemo(() => (ventana.desde && ventana.hasta ? diasHabiles(ventana.desde, ventana.hasta) : []), [ventana.desde, ventana.hasta]);
  const mias = useMemo(() => (t ? lecturasDe(eventos, t) : []), [eventos, t]);

  if (!t) return null;
  if (!eventos.length) return <p className="g-vacio">No hay bitácora de ZK cargada: abra «Archivos de ZK» o «Resumen» para leerla.</p>;

  switch (caso.tipo) {
    case "dos-tags-mismo-coche": {
      const otro = tagPrincipalDe(ev) ?? acompanantes(eventos, t)[0]?.tarjeta ?? null;
      if (!otro) break;
      const delOtro = lecturasDe(eventos, otro);
      const juntos = mias.filter((l) => delOtro.some((o) => o.lote === l.lote && o.sentido === l.sentido && Math.abs(o.s - l.s) <= 5)).length;
      const rech = mias.filter((l) => !l.ok).length;
      return (
        <>
        {cuadro([{ tarjeta: t, papel: "El del caso" }, { tarjeta: otro, papel: tagPrincipalDe(ev) === otro ? "El principal (según la depuración)" : "El que viaja con él" }])}
        <Bloque
          titulo={juntos ? <>Los dos TAGs pasan juntos en <b>{juntos} de {mias.length}</b> lecturas del TAG del caso</> : <>En la bitácora, los dos TAGs <b>no se leyeron juntos</b> (0 de {mias.length} lecturas)</>}
          sub={juntos ? <>Cada línea gris une dos lecturas a 5 s o menos en el mismo lector.{rech ? ` La pluma rechazó ${rech} veces el TAG del caso: es el TAG de más.` : ""}</> : "Lo de «mismo coche» no lo confirma la pluma: revise la placa con la persona antes de dar de baja un TAG."}
        >
          <TiraPasos series={[{ etiqueta: etiqueta(t), lecturas: mias }, { etiqueta: etiqueta(otro), lecturas: delOtro }]} />
        </Bloque>
        </>
      );
    }
    case "credencial-sin-nombre": {
      const comp = acompanantes(eventos, t);
      const otro = comp[0]?.tarjeta;
      return (
        <>
          {cuadro(otro ? [{ tarjeta: t, papel: "El del caso" }, { tarjeta: otro, papel: "El que viaja con él" }] : [{ tarjeta: t, papel: "El del caso" }])}
          <Bloque titulo={otro ? <>Viaja con <b>{nombreDe(otro) ?? `TAG ${otro}`}</b></> : "No viaja con ningún TAG conocido"} sub="TAGs que se leen a ≤ 5 s en el mismo lector, por número de días.">
            {comp.length > 0 && <Comparar filas={comp.slice(0, 4).map((c) => ({ etiqueta: nombreDe(c.tarjeta) ?? `TAG ${c.tarjeta}`, valor: c.dias, max: comp[0].dias, texto: String(c.dias), sub: "días juntos", color: SERIE[1] }))} />}
          </Bloque>
          <Bloque titulo="Sus pasos, junto a los de su acompañante">
            <TiraPasos series={otro ? [{ etiqueta: etiqueta(t), lecturas: mias }, { etiqueta: etiqueta(otro), lecturas: lecturasDe(eventos, otro) }] : [{ etiqueta: etiqueta(t), lecturas: mias }]} />
          </Bloque>
        </>
      );
    }
    case "salida-no-lee": {
      const lote = typeof ev.lote === "string" ? ev.lote : undefined;
      const es = estanciasDe(eventos, t, ventana, lote);
      const r = incompletas(es);
      const L = lote ? incompletasDelLote(eventos, lote, ventana) : null;
      const filas = [{ etiqueta: "Este TAG", valor: r.incompletas, max: r.total, texto: `${Math.round((r.incompletas / Math.max(1, r.total)) * 100)} %`, sub: `${r.incompletas} de ${r.total}`, color: SERIE[0] }];
      if (L) filas.push({ etiqueta: `Todo ${lote}`, valor: L.incompletas, max: L.total, texto: `${Math.round((L.incompletas / Math.max(1, L.total)) * 100)} %`, sub: `${L.incompletas} de ${L.total}`, color: "#a9b3c1" });
      return (
        <>
          {cuadro([{ tarjeta: t, papel: "El del caso" }])}
          <Bloque titulo={<>{lote ? `En ${lote}, ` : ""}<b>{r.incompletas} de {r.total}</b> de sus estancias quedan incompletas</>} sub={lote ? `Compare con todo ${lote}: si este TAG falla mucho más, el problema es el TAG o su colocación.` : undefined}>
            <Comparar filas={filas} />
          </Bloque>
          <Bloque titulo="Sus estancias por día" sub="Lo punteado es la lectura que faltó. Si casi siempre falta la misma, es el TAG o la antena de ese lector.">
            <PasosSemana estancias={es} />
          </Bloque>
        </>
      );
    }
    case "tag-sin-uso": {
      const usa = typeof ev.tagQueSiUsa === "string" ? ev.tagQueSiUsa : null;
      const suyas = usa ? lecturasDe(eventos, usa) : [];
      const dentro = (ls: Lectura[]) => dias.filter((d) => ls.some((l) => l.dia === d && l.ok)).length;
      const diasRech = new Set(mias.filter((l) => !l.ok).map((l) => l.dia)).size;
      return (
        <>
        {cuadro(usa ? [{ tarjeta: t, papel: "El que no usa" }, { tarjeta: usa, papel: "El que sí usa" }] : [{ tarjeta: t, papel: "El del caso" }])}
        <Bloque
          titulo={<>El TAG del caso entró <b>{dentro(mias)} de {dias.length}</b> días hábiles{diasRech ? <> y la pluma lo rechazó <b>{diasRech}</b> días</> : null}{usa ? <>; el que usa entró <b>{dentro(suyas)}</b></> : null}</>}
          sub={diasRech ? "Si lo rechaza a diario, el TAG viaja en el coche aunque no sirva: es un TAG de más." : "Un cuadro por día hábil de la bitácora."}
        >
          <CalendarioUso filas={usa ? [{ etiqueta: etiqueta(t), lecturas: mias }, { etiqueta: etiqueta(usa), lecturas: suyas }] : [{ etiqueta: etiqueta(t), lecturas: mias }]} dias={dias} ventana={ventana} />
        </Bloque>
        </>
      );
    }
    case "departamento-distinto":
    case "rechazo-diario":
    case "excepcion-acceso":
    case "mal-uso-tag":
    case "vivo-en-bajas":
    case "baja-que-abre": {
      const porLote = ["E1", "E2"].map((L) => ({ L, a: mias.filter((l) => l.lote === L && l.ok).length, r: mias.filter((l) => l.lote === L && !l.ok).length })).filter((z) => z.a || z.r);
      const max = Math.max(1, ...porLote.flatMap((z) => [z.a, z.r]));
      return (
        <>
          {cuadro([{ tarjeta: t, papel: "El del caso" }])}
          <Bloque
            titulo={porLote.length ? porLote.map((z, i) => <span key={z.L}>{i ? " · " : ""}{z.L}: <b>{z.a}</b> veces abrió, <b>{z.r}</b> la rechazó</span>) : "Sin pasos en la bitácora"}
            sub={`Departamento en ZK: ${String(ev.departamentoZk ?? "—")} · plumas: ${String(ev.plumas ?? "—")}`}
          >
            <Comparar filas={porLote.flatMap((z) => [
              { etiqueta: `${z.L} abrió`, valor: z.a, max, texto: String(z.a), color: LOTE[z.L] },
              { etiqueta: `${z.L} rechazó`, valor: z.r, max, texto: String(z.r), color: "#fff", hueco: true },
            ])} />
          </Bloque>
          <Bloque titulo="Qué días viene" sub="✕ = ese día la pluma lo rechazó al menos una vez.">
            <CalendarioUso filas={[{ etiqueta: etiqueta(t), lecturas: mias }]} dias={dias} ventana={ventana} />
          </Bloque>
          <Bloque titulo="A qué hora y por dónde">
            <TiraPasos series={[{ etiqueta: etiqueta(t), lecturas: mias }]} />
          </Bloque>
        </>
      );
    }
  }
  // exempleado, preguntar, abre-sin-expediente, conducta, otro: si viene y cuando encontrarlo.
  const ll = llegadaHabitual(mias, ventana);
  const entro = dias.filter((d) => mias.some((l) => l.dia === d && l.ok)).length;
  return (
    <>
      {cuadro([{ tarjeta: t, papel: "El del caso" }])}
      <Bloque titulo={<>Entró <b>{entro} de {dias.length}</b> días hábiles</>} sub={typeof ev.ges === "string" ? `GES: ${ev.ges}` : undefined}>
        <CalendarioUso filas={[{ etiqueta: etiqueta(t), lecturas: mias }]} dias={dias} ventana={ventana} />
      </Bloque>
      {ll ? (
        <Bloque
          titulo={<>Suele llegar entre las <b>{hhmm(ll.tramo)} y las {hhmm(ll.tramo + 15)}</b> por <b>{ll.lote}</b> ({ll.diasEnTramo} de {ll.dias} días)</>}
          sub={caso.tipo === "preguntar" ? "Para encontrarlo en caja o en la pluma." : undefined}
        >
          <Llegada r={ll} />
          <Tabla cab={["Día", "Primera entrada", "Lote"]} filas={ll.primeras.map((l) => [diaCorto(l.dia), hhmm(l.min), l.lote])} />
        </Bloque>
      ) : null}
    </>
  );
}

/** Pestana «Entradas y salidas»: estancias de la semana y cada lectura, con rechazos. */
export function EntradasSalidas({ tarjetas, eventos, ventana, nombreDe }: { tarjetas: string[]; eventos: EventoZk[]; ventana: Ventana; nombreDe: (t: string) => string | undefined }) {
  if (!eventos.length) return <p className="g-vacio">No hay bitácora de ZK cargada.</p>;
  return (
    <>
      {tarjetas.map((t) => {
        const es = estanciasDe(eventos, t, ventana);
        const r = incompletas(es);
        const l = lecturasDe(eventos, t);
        const rech = l.filter((x) => !x.ok).length;
        return (
          <div key={t}>
            <Bloque titulo={<>TAG <span className="mono">{t}</span>: {r.total} estancias, {r.incompletas} incompletas, {rech} rechazos</>} sub={nombreDe(t)}>
              <PasosSemana estancias={es} />
            </Bloque>
            <Bloque titulo="Cada lectura" sub="Incluye las que la pluma rechazó.">
              <TiraPasos series={[{ etiqueta: t, lecturas: l }]} />
            </Bloque>
          </div>
        );
      })}
    </>
  );
}
