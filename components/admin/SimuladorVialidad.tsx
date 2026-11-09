"use client";

// Vialidad › Qué pasa si (6-nov-2026): el simulador «¿y si…?» dentro del panel.
//
// Las palancas a la izquierda y las cifras con las gráficas a la derecha, en una sola
// pantalla de computadora. Se empieza por los botones de las propuestas; los deslizadores
// son para las preguntas que salgan en la junta. La tabla por grupo y «Cómo funciona» van
// plegadas. Todo se calcula en el navegador con lib/simulador.ts sobre las celdas de la
// tarde; nada se guarda.

import { useMemo, useState } from "react";
import { horaCorta } from "@/lib/estacionamiento";
import {
  CAJONES,
  COLOR_SEC,
  HOY,
  NOMBRE_SEC,
  PLUMA,
  PROPUESTAS,
  SECCIONES,
  SERIES,
  T,
  VENT,
  combinacionesPersonal,
  cuantilPeso,
  grupos,
  hayCambio,
  kpis,
  maxEn,
  palancasDe,
  perE2En1430,
  perE2PorDepto,
  simular,
  suma,
  type Celda,
  type Escenario,
  type Palancas,
  type Resultado,
  type Seccion,
} from "@/lib/simulador";
import { CRITERIO_ESTACIONAMIENTO_MAESTRO } from "@/lib/secciones";

/** Cuantos autos del personal busca mover la Propuesta 1: la meta de las combinaciones por departamento. */
const META_PERSONAL = PROPUESTAS[0].palancas.per ?? 30;

const textoD = (v: number) => (v ? (v > 0 ? `${v} min después` : `${-v} min antes`) : "a la hora de hoy");
const signoMin = (v: number) => `${v > 0 ? "+" : ""}${v} min`;
const r0 = (v: number) => Math.round(v);

/** Las franjas de salida de la escuela (27-oct). Secundaria y prepa salen juntas. */
const FRANJAS: { clave: "comunidad" | "preescolar" | "primaria" | "secprepa"; nombre: string; desde: number; hasta: number; color: string }[] = [
  { clave: "comunidad", nombre: "Salida de comunidad infantil", desde: VENT.comunidad, hasta: VENT.comunidad + 10, color: COLOR_SEC.comunidad },
  { clave: "preescolar", nombre: "Salida de preescolar", desde: VENT.preescolar, hasta: 14 * 60, color: COLOR_SEC.preescolar },
  { clave: "primaria", nombre: "Salida de primaria", desde: VENT.primaria, hasta: 14 * 60 + 30, color: COLOR_SEC.primaria },
  { clave: "secprepa", nombre: "Salida de secundaria y prepa", desde: VENT.secundaria, hasta: 15 * 60, color: COLOR_SEC.secundaria },
];

/* ------------------------------------------------------------------ las gráficas */
function Graficas({ r, base, p, verPersonal }: { r: Resultado; base: Resultado; p: Palancas; verPersonal: boolean }) {
  const W = 800, L = 200, R = 16, a = T[0], z = T[T.length - 1] + 5, bw = (W - L - R) / T.length;
  const x = (m: number) => L + ((m - a) / (z - a)) * (W - L - R);
  const dm = (c: (typeof FRANJAS)[number]["clave"]) => (c === "secprepa" ? p.d.secundaria : p.d[c]);
  const etq = (c: (typeof FRANJAS)[number]["clave"]) => {
    if (c === "secprepa" && p.d.secundaria !== p.d.prepa) return ` (sec ${signoMin(p.d.secundaria)}, prepa ${signoMin(p.d.prepa)})`;
    const v = dm(c);
    return v ? ` (${signoMin(v)})` : "";
  };
  const franjas = FRANJAS.map((f) => ({ ...f, a: f.desde + dm(f.clave), b: f.hasta + dm(f.clave) }));
  const oculto = (k: number) => !verPersonal && !!SERIES[k].noPapa;
  const sumaV = (v: number[]) => v.reduce((t, q, k) => t + (oculto(k) ? 0 : q), 0);
  const cambio = hayCambio(p);
  const sub = verPersonal ? "" : " · solo papás";
  const rowH = 15;
  const paneles = [
    { tit: "Dentro de E2", serie: r.dentro.E2, base: base.dentro.E2, tope: CAJONES.E2, h: 150 },
    { tit: "Dentro de E1", serie: r.dentro.E1, base: base.dentro.E1, tope: CAJONES.E1, h: 110 },
    { tit: "Llegan y salen por la pluma de E2", serie: r.salen.E2, base: base.salen.E2, llegan: r.entran.E2, bllegan: base.entran.E2, banda: PLUMA, h: 130 },
  ];
  const yTop = 4 + franjas.length * rowH + 8 + 18;
  let y0 = 4 + franjas.length * rowH + 8;
  const piezas: React.ReactNode[] = [];
  franjas.forEach((m, j) => {
    const yy = 4 + j * rowH;
    piezas.push(
      <g key={`f${m.clave}`}>
        <text x={0} y={yy + 11} fontSize={11.5} fill="#1d2533">{m.nombre}{etq(m.clave)}</text>
        <rect x={x(Math.max(a, m.a))} y={yy + 2} width={Math.max(3, x(Math.min(z, m.b)) - x(Math.max(a, m.a)))} height={rowH - 5} rx={3} fill={m.color} />
      </g>,
    );
  });
  paneles.forEach((pn, pi) => {
    const top = y0 + 18;
    const tots = pn.serie.map(sumaV), btots = pn.base.map(sumaV);
    const lleg = pn.llegan ? pn.llegan.map(sumaV) : [], blleg = pn.bllegan ? pn.bllegan.map(sumaV) : [];
    const todos = pn.banda ? pn.serie.map(suma) : [];
    const techo = !verPersonal ? 0 : pn.tope ? pn.tope * 1.1 : (pn.banda?.[1] ?? 0) * 1.08;
    const ymax = Math.max(techo, 1, ...tots, ...btots, ...lleg, ...blleg) * (techo ? 1 : 1.12);
    const y = (q: number) => top + pn.h - (pn.h * q) / ymax;
    const linea = (serie: number[], color: string, dash: string, ancho: number, k: string) => (
      <path key={k} d={serie.map((q, i) => `${i ? "L" : "M"}${(x(T[i]) + bw / 2).toFixed(1)} ${y(q).toFixed(1)}`).join("")} fill="none" stroke={color} strokeWidth={ancho} strokeDasharray={dash || undefined} />
    );
    piezas.push(
      <g key={`p${pi}`}>
        <text x={0} y={top + 12} fontSize={13} fontWeight={700} fill="#1d2533">{pn.tit}</text>
        <text x={0} y={top + 28} fontSize={10.5} fill="#6b7689">autos{pn.banda ? " cada 5 min" : ", a cada hora"}{sub}</text>
        {pn.banda && (
          <>
            {todos.map((q, i) => (q >= pn.banda![0] ? <rect key={`s${i}`} x={x(T[i])} y={top} width={bw} height={pn.h} fill="#e5484d" opacity={0.26} /> : null))}
            {verPersonal && <rect x={L} y={y(pn.banda[1])} width={W - L - R} height={y(pn.banda[0]) - y(pn.banda[1])} fill="#e5484d" opacity={0.09} />}
            <text x={W - R - 4} y={top + 12} fontSize={10.5} textAnchor="end" fill="#c2383d">rojo: la pluma se satura (más de {pn.banda[0]} autos en 5 min)</text>
            <text x={L + 6} y={top + 12} fontSize={10.5} fill="#2f6fd0">línea: llegan</text>
            <text x={L + 80} y={top + 12} fontSize={10.5} fill="#1d2533">barras: salen, por quién vienen</text>
          </>
        )}
        {pn.tope && verPersonal && (
          <>
            <line x1={L} x2={W - R} y1={y(pn.tope)} y2={y(pn.tope)} stroke="#e5484d" strokeWidth={1.5} />
            <text x={L - 6} y={y(pn.tope) + 4} fontSize={10.5} textAnchor="end" fill="#c2383d">{pn.tope} cajones</text>
          </>
        )}
        {T.map((t, i) => {
          let acc = 0;
          const barras: React.ReactNode[] = [];
          pn.serie[i].forEach((q, k) => {
            if (q > 0.05 && !oculto(k)) {
              const ya = y(acc), yb = y(acc + q);
              if (ya - yb > 1.5) barras.push(<rect key={k} x={x(t) + 1} y={yb} width={bw - 2} height={ya - yb - 1} fill={SERIES[k].color} fillOpacity={SERIES[k].opacidad} />);
              acc += q;
            }
          });
          const cuantos = (q: number) => (q >= 1 ? q.toFixed(1) : "menos de 1");
          const titulo = `${pn.tit} · ${horaCorta(t)}, promedio por día: ${pn.banda ? "salen " : ""}${tots[i].toFixed(0)} autos (hoy ${btots[i].toFixed(0)})`
            + (pn.banda ? ` · llegan ${lleg[i].toFixed(0)} (hoy ${blleg[i].toFixed(0)})` : "")
            + " · " + SERIES.map((gr, k) => (pn.serie[i][k] > 0.05 && !oculto(k) ? `${gr.nombre}: ${cuantos(pn.serie[i][k])}` : "")).filter(Boolean).join(" · ");
          return (
            <g key={`b${t}`}>
              {barras}
              <rect x={x(t)} y={top} width={bw} height={pn.h} fill="transparent"><title>{titulo}</title></rect>
            </g>
          );
        })}
        {linea(btots, "#1d2533", "4 3", 1.5, "hoy")}
        {pn.banda && cambio && linea(blleg, "#2f6fd0", "4 3", 1.5, "lleghoy")}
        {pn.banda && linea(lleg, "#2f6fd0", "", 2, "lleg")}
      </g>,
    );
    y0 = top + pn.h + 6;
  });
  return (
    <svg viewBox={`0 0 ${W} ${y0 + 16}`} width="100%" style={{ display: "block" }} role="img" aria-label="Dentro de E2, dentro de E1, y llegan y salen por la pluma de E2, cada 5 minutos">
      {piezas}
      {franjas.map((m) => (m.a >= a && m.a <= z ? <line key={`g${m.clave}`} x1={x(m.a)} x2={x(m.a)} y1={yTop} y2={y0} stroke={m.color} strokeWidth={1.3} strokeDasharray="3 3" opacity={0.85} /> : null))}
      {T.map((t) => (t % 15 === 0 ? <text key={`h${t}`} x={x(t) + bw / 2} y={y0 + 10} fontSize={10} textAnchor="middle" fill="#6b7689">{horaCorta(t)}</text> : null))}
    </svg>
  );
}

/* ------------------------------------------------------------------ la tabla por grupo */
const rango = (xs: [number, number][]) => ({ m: cuantilPeso(xs, 0.5) ?? 0, a: cuantilPeso(xs, 0.25) ?? 0, b: cuantilPeso(xs, 0.75) ?? 0 });
const minTxt = (v: number) => `${v} min`;

/** Mediana y p25 a p75 de hoy, y debajo el escenario si cambia. */
function CeldaRango({ b, s, fmt }: { b: [number, number][]; s: [number, number][]; fmt: (v: number) => string }) {
  const vb = rango(b), vs = rango(s);
  const igual = fmt(vb.m) === fmt(vs.m) && fmt(vb.a) === fmt(vs.a) && fmt(vb.b) === fmt(vs.b);
  return (
    <td className="num">
      <strong>{fmt(vb.m)}</strong><br /><span className="ti-hint">{fmt(vb.a)} a {fmt(vb.b)}</span>
      {!igual && <><br /><span className="ti-hint" style={{ color: "var(--primary)", fontWeight: 700 }}>escenario {fmt(vs.m)} ({fmt(vs.a)} a {fmt(vs.b)})</span></>}
    </td>
  );
}

function TablaGrupos({ base, r }: { base: Resultado; r: Resultado }) {
  const B = grupos(base), Rg = grupos(r);
  const filas: React.ReactNode[] = [];
  for (const menor of SECCIONES) {
    const mayores = SECCIONES.filter((my) => SECCIONES.indexOf(my) >= SECCIONES.indexOf(menor) && (B.get(`${menor}|${my}`)?.w ?? 0) >= 0.5);
    if (!mayores.length) continue;
    const tot = mayores.reduce((t, my) => t + B.get(`${menor}|${my}`)!.w, 0);
    filas.push(
      <tr key={menor}>
        <td colSpan={5} style={{ background: "#f5f7fa", fontWeight: 700 }}>
          <i style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: COLOR_SEC[menor], marginRight: 5 }} />
          Vienen por {NOMBRE_SEC[menor]} · {tot.toFixed(1)} autos al día
        </td>
      </tr>,
    );
    for (const my of mayores) {
      const k = `${menor}|${my}`, b = B.get(k)!, s = Rg.get(k) ?? b;
      filas.push(
        <tr key={k}>
          <td>{my === menor ? "es el mayor: salen a su hora" : `se quedan hasta ${NOMBRE_SEC[my]} (${Math.round((100 * b.w) / tot)} %)`}</td>
          <td className="num">{b.w.toFixed(1)}</td>
          <CeldaRango b={b.es} s={s.es} fmt={horaCorta} />
          <CeldaRango b={b.ss} s={s.ss} fmt={horaCorta} />
          <CeldaRango b={b.ds} s={s.ds} fmt={minTxt} />
        </tr>,
      );
    }
  }
  return (
    <>
      <div className="table-wrap">
        <table className="admin-table tabla-pro">
          <thead><tr><th>Por quién vienen y hasta quién se quedan</th><th className="num">Autos al día</th><th className="num">Entran</th><th className="num">Salen</th><th className="num">Dentro</th></tr></thead>
          <tbody>{filas}</tbody>
        </table>
      </div>
      <p className="ti-hint">
        Mediana y, en chico, de p25 a p75, por auto y en promedio por día. Preescolar tiene dos salidas de lunes a jueves, la normal (13:25 a 14:00) y la de talleres (14:25 a 15:00): por eso sus horas se abren.
        Los papás sin ligar a GES van repartidos con la proporción de las familias ligadas que salen a su misma hora.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ la pantalla */
const ESCENARIOS = (cabe: number): Escenario[] => [
  { nombre: "Hoy", palancas: {} },
  { nombre: "Personal a E1 (lo que cabe)", palancas: { per: cabe } },
  { nombre: "Secundaria y prepa 5 min después", palancas: { d: { secundaria: 5, prepa: 5 } } },
  { nombre: "Secundaria y prepa 5 min antes", palancas: { d: { secundaria: -5, prepa: -5 } } },
  { nombre: "Primaria 10 min antes", palancas: { d: { primaria: -10 } } },
  { nombre: "Recogida única", palancas: { unica: true } },
  { nombre: "Personal a E1 y secundaria 5 después", palancas: { per: cabe, d: { secundaria: 5, prepa: 5 } } },
];

const boton: React.CSSProperties = { font: "inherit", color: "var(--primary)", border: "1px solid var(--line)", fontSize: 12, padding: "3px 9px", margin: "4px 6px 0 0", background: "#fff", borderRadius: 6, cursor: "pointer" };

function Cifra({ titulo, v, vb, nota, mal, mejorBajo, cambio }: { titulo: string; v: number; vb: number; nota: string; mal: boolean; mejorBajo: boolean; cambio: boolean }) {
  const d = r0(v) - r0(vb);
  return (
    <div style={{ border: `1px solid ${mal ? "#e5484d" : "var(--line)"}`, borderRadius: 10, padding: "6px 10px", background: mal ? "#fdf5f5" : "#fff" }}>
      <span style={{ display: "block", fontSize: 11, color: "var(--muted)", minHeight: 26 }}>{titulo}</span>
      <strong style={{ fontSize: 22, color: mal ? "#c2383d" : "var(--primary)" }}>{r0(v)}</strong>
      {cambio && (d === 0
        ? <small style={{ marginLeft: 6, color: "var(--muted)", fontWeight: 700 }}>(igual)</small>
        : <small style={{ marginLeft: 6, fontWeight: 700, color: (d < 0) === mejorBajo ? "#1a7f4b" : "#c2383d" }}>({d > 0 ? "+" : ""}{d})</small>)}
      {cambio && <small style={{ marginLeft: 6, color: "var(--muted)" }}>hoy {r0(vb)}</small>}
      <span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>{nota}</span>
    </div>
  );
}

export default function SimuladorVialidad({ celdas, dias }: { celdas: Celda[]; dias: number }) {
  const [p, setP] = useState<Palancas>(HOY);
  const [verPersonal, setVerPersonal] = useState(true);
  const base = useMemo(() => simular(celdas, HOY), [celdas]);
  const r = useMemo(() => simular(celdas, p), [celdas, p]);
  const maxPer = useMemo(() => Math.round(perE2En1430(celdas)), [celdas]);
  const cabeE1 = useMemo(() => Math.max(0, Math.round(CAJONES.E1 - maxEn(base.dentro.E1, 860, 900))), [base]);
  // El personal de E2 por departamento y las combinaciones completas que suman cerca de la meta (9-nov).
  const porDepto = useMemo(() => perE2PorDepto(celdas), [celdas]);
  const combinaciones = useMemo(() => combinacionesPersonal(porDepto, META_PERSONAL), [porDepto]);
  if (celdas.length === 0) return <p className="ti-empty">No hay estancias de la tarde con las que simular.</p>;

  const b = kpis(base), s = kpis(r), cambio = hayCambio(p);
  const poner = (e: Escenario) => setP(palancasDe(e.palancas));
  // Las dos formas de mover al personal no se suman: elegir departamentos apaga el deslizador y al reves.
  const elegidos = p.deptos ?? [];
  const autosElegidos = porDepto.filter((x) => elegidos.includes(x.depto)).reduce((t, x) => t + x.autos, 0);
  const ponerDeptos = (deptos: string[]) => setP({ ...p, per: 0, deptos });
  const alternar = (depto: string) => ponerDeptos(elegidos.includes(depto) ? elegidos.filter((x) => x !== depto) : [...elegidos, depto]);
  const mismos = (a: string[]) => a.length === elegidos.length && a.every((x) => elegidos.includes(x));
  const autosTxt = (v: number) => (v >= 1 ? `${r0(v)}` : "menos de 1");

  // Lo que dice el escenario, en frases.
  const frases: React.ReactNode[] = [];
  if (p.per || elegidos.length) frases.push(<>{p.per ? <>Pasar {p.per} autos del personal a E1</> : <>Pasar a E1 al personal de <strong>{elegidos.join(", ")}</strong> ({r0(autosElegidos)} autos en E2 a las 14:30)</>} deja <strong>{r0(Math.max(0, s.libresE2))} cajones libres en E2</strong> durante la espera de secundaria y prepa (hoy {r0(Math.max(0, b.libresE2))}).{s.maxE1 > CAJONES.E1 ? <> Pero <strong>E1 se pasa de sus {CAJONES.E1} cajones</strong> ({r0(s.maxE1)}): no caben todos.</> : ` E1 llega a ${r0(s.maxE1)} de ${CAJONES.E1}: caben.`}</>);
  const porDelta = new Map<number, string[]>();
  for (const x of SECCIONES) if (p.d[x]) porDelta.set(p.d[x], [...(porDelta.get(p.d[x]) ?? []), NOMBRE_SEC[x]]);
  for (const [v, noms] of porDelta) frases.push(<>Con la salida de <strong>{noms.join(" y ")} {v > 0 ? `${v} min después` : `${-v} min antes`}</strong> se mueven las familias cuyo hijo mayor está ahí, también las que llegaron por un hermano menor{p.ajusta ? `, y llegan según esa salida las que vienen por un hijo de ${noms.length > 1 ? "esas secciones" : "esa sección"}.` : "."}</>);
  if (p.unica) frases.push(<>Con <strong>recogida única</strong>, las familias con hermanos llegan a la hora del mayor, con la espera de quien viene solo por él. El hijo menor espera en la escuela <strong>{r0(s.esperaHijo)} minutos</strong> en promedio.</>);
  if (cambio) {
    const B = grupos(base), Rg = grupos(r);
    const efectos: { w: number; d: number; nom: string; de: number; a: number }[] = [];
    for (const [k, bb] of B) {
      const rr = Rg.get(k);
      if (!rr || k === "alumno") continue;
      const de = cuantilPeso(bb.ds, 0.5) ?? 0, a = cuantilPeso(rr.ds, 0.5) ?? 0;
      if (Math.abs(a - de) >= 3) {
        const [m, my] = k.split("|") as [Seccion, Seccion];
        efectos.push({ w: bb.w, d: a - de, de, a, nom: `los ${bb.w.toFixed(0)} que vienen por ${NOMBRE_SEC[m]}${m === my ? "" : ` y se quedan hasta ${NOMBRE_SEC[my]}`}` });
      }
    }
    efectos.sort((x1, x2) => Math.abs(x2.d) * x2.w - Math.abs(x1.d) * x1.w);
    if (efectos.length) frases.push(<>{efectos.slice(0, 4).map((x1, i) => <span key={i}>{i ? "; " : ""}{x1.nom} pasan de {x1.de} a <strong>{x1.a} min adentro</strong></span>)}.</>);
    frases.push(<>Minutos adentro por familia: <strong>{r0(s.esperaFam)}</strong> (hoy {r0(b.esperaFam)}). Por la pluma de E2 salen como máximo <strong>{r0(s.pluma)} autos en 5 minutos</strong> (hoy {r0(b.pluma)}){s.pluma >= PLUMA[0] ? ": en el rango en que se satura." : ": la pluma no se satura."}</>);
  }
  if (!frases.length) frases.push(<>Así es hoy, de lunes a jueves. Elija una propuesta o mueva las palancas para ver un escenario.</>);

  const leyendaCuadro = (color: string, op = 1) => <i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: color, opacity: op, marginRight: 4, verticalAlign: "middle" }} />;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "290px minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        {/* ---------------- las palancas */}
        <div style={{ display: "grid", gap: 8, background: "#f5f7fa", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", fontSize: 12.5 }}>
          <div>
            <strong>Propuestas del buscador</strong>
            <div>{PROPUESTAS.map((e) => <button key={e.nombre} type="button" style={boton} title={e.detalle} onClick={() => poner(e)}>{e.nombre}</button>)}</div>
          </div>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Personal que pasa de E2 a E1, parejo entre todos: <strong>{p.per}</strong> autos <span className="ti-hint">(hoy hay unos {maxPer} en E2 a las 14:30; en E1 caben unos {cabeE1})</span></span>
            <input type="range" min={0} max={maxPer} step={1} value={p.per} onChange={(ev) => setP({ ...p, per: +ev.target.value, deptos: [] })} style={{ width: "100%", accentColor: "var(--primary)" }} />
          </label>
          {porDepto.length > 0 && (
            <div style={{ display: "grid", gap: 4, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
              <span><strong>O por departamento completo</strong> <span className="ti-hint">(autos de cada uno en E2 a las 14:30, promedio por día)</span></span>
              {combinaciones.length > 0 && (
                <div>
                  <span className="ti-hint">Combinaciones de unos {META_PERSONAL} autos:</span>
                  <div>
                    {combinaciones.map((c) => (
                      <button key={c.deptos.join("|")} type="button"
                        style={{ ...boton, ...(mismos(c.deptos) ? { background: "var(--primary)", color: "#fff" } : {}) }}
                        onClick={() => ponerDeptos(c.deptos)}>
                        {c.deptos.join(" + ")} · {r0(c.autos)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {porDepto.map((x) => (
                <label key={x.depto} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                  <input type="checkbox" checked={elegidos.includes(x.depto)} onChange={() => alternar(x.depto)} />
                  <span style={{ flex: 1 }}>{x.depto}</span>
                  <strong>{autosTxt(x.autos)}</strong>
                </label>
              ))}
              <span>Elegidos: <strong>{r0(autosElegidos)} autos</strong>{elegidos.length > 0 && <> · <button type="button" style={{ ...boton, margin: 0 }} onClick={() => ponerDeptos([])}>quitar todos</button></>}</span>
              <span className="ti-hint">
                Regla vigente para maestros: {CRITERIO_ESTACIONAMIENTO_MAESTRO}.
                {porDepto.some((x) => x.depto.toUpperCase().replace(/\s+/g, "_") === "EMPLEADO_PPF") && " Empleado_PPF es personal que también es papá: por política se estaciona en el lote de su departamento y usa el otro solo para recoger a sus hijos."}
              </span>
            </div>
          )}
          {SECCIONES.map((sec) => (
            <label key={sec} style={{ display: "grid", gap: 2 }}>
              <span>Salida de {NOMBRE_SEC[sec]}: <strong>{textoD(p.d[sec])}</strong></span>
              <input type="range" min={-15} max={15} step={5} value={p.d[sec]} onChange={(ev) => setP({ ...p, d: { ...p.d, [sec]: +ev.target.value } })} style={{ width: "100%", accentColor: "var(--primary)" }} />
            </label>
          ))}
          <label><input type="checkbox" checked={p.ajusta} onChange={(ev) => setP({ ...p, ajusta: ev.target.checked })} /> Los papás llegan según la salida del hijo por el que vienen: si esa salida se mueve, llegan después o antes</label>
          <label><input type="checkbox" checked={p.unica} onChange={(ev) => setP({ ...p, unica: ev.target.checked })} /> Recogida única: las familias con hermanos llegan a la hora de la salida del mayor</label>
          <label><input type="checkbox" checked={verPersonal} onChange={(ev) => setVerPersonal(ev.target.checked)} /> Mostrar al personal, a los alumnos que manejan y a otros en las gráficas <span className="ti-hint">(quítelo para ver solo a los papás; las cifras siguen contando a todos)</span></label>
          <div>
            <strong>Escenarios</strong>
            <div>{ESCENARIOS(cabeE1).map((e) => <button key={e.nombre} type="button" style={boton} onClick={() => poner(e)}>{e.nombre}</button>)}</div>
          </div>
        </div>

        {/* ---------------- las cifras y las gráficas */}
        <div style={{ maxWidth: 980 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 8, marginBottom: 6 }}>
            <Cifra titulo="Minutos adentro por familia" v={s.esperaFam} vb={b.esperaFam} nota="promedio de las que llegan a recoger" mal={s.esperaFam > b.esperaFam + 1} mejorBajo cambio={cambio} />
            <Cifra titulo="Cajones libres en E2, de 14:35 a 15:00" v={Math.max(0, s.libresE2)} vb={Math.max(0, b.libresE2)} nota="el lugar para esperar adentro" mal={s.libresE2 < 5} mejorBajo={false} cambio={cambio} />
            <Cifra titulo="E1 en su momento más lleno" v={s.maxE1} vb={b.maxE1} nota={`de ${CAJONES.E1} cajones`} mal={s.maxE1 > CAJONES.E1} mejorBajo cambio={cambio} />
            <Cifra titulo="Lo más que sale por la pluma de E2 en 5 min" v={s.pluma} vb={b.pluma} nota={`se satura entre ${PLUMA[0]} y ${PLUMA[1]}`} mal={s.pluma >= PLUMA[0]} mejorBajo cambio={cambio} />
            <Cifra titulo="Papás que esperan a secundaria o prepa, a las 14:50" v={s.secDentro} vb={b.secDentro} nota="dentro de E1 o E2" mal={false} mejorBajo cambio={cambio} />
          </div>
          <p style={{ fontSize: 11, color: "var(--muted)", display: "flex", flexWrap: "wrap", gap: "4px 12px", margin: "4px 0" }}>
            <span style={{ color: "var(--ink)" }}>El color dice con qué salida se va el auto:</span>
            {SECCIONES.map((x) => <span key={x}>{leyendaCuadro(COLOR_SEC[x])}salen con {NOMBRE_SEC[x]}</span>)}
            <span>{leyendaCuadro("#1d2533", 0.35)}tono claro: llegaron antes, por un hermano menor</span>
            <span>{leyendaCuadro("#8c9bb0")}Alumnos que manejan</span>
            <span>{leyendaCuadro("#5b6b82")}Personal</span>
            <span>{leyendaCuadro("#c9d1dc")}Otros</span>
            <span><i style={{ display: "inline-block", width: 14, borderTop: "2px dashed #1d2533", verticalAlign: "middle", marginRight: 4 }} />hoy (sin cambios)</span>
          </p>
          <Graficas r={r} base={base} p={p} verPersonal={verPersonal} />
          <div style={{ borderLeft: "5px solid #009844", padding: "8px 14px", margin: "8px 0 0", background: "#f7faf8", borderRadius: "0 8px 8px 0", fontSize: 13 }}>
            <strong style={{ display: "block", color: "var(--primary)", marginBottom: 3 }}>Lo que dice este escenario</strong>
            {frases.map((f, i) => <div key={i}>{f}</div>)}
          </div>
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: "pointer", color: "var(--primary)", fontWeight: 700 }}>Cuándo llega y cuándo sale cada grupo, hoy y en este escenario</summary>
            <TablaGrupos base={base} r={r} />
          </details>
        </div>
      </div>
      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: "pointer", color: "var(--primary)", fontWeight: 700 }}>Cómo funciona, y lo que no puede decir</summary>
        <p className="ti-hint">
          Parte de lo que pasa hoy (las entradas y salidas reales de {dias} días de lunes a jueves) y solo recorre lo que mueve cada palanca. La línea punteada es hoy.
          Cada auto va con el color de la salida con la que se va, la de su hijo mayor; en tono claro si llegó antes, por un hermano menor, y esperó.
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          <li>Cada auto con TAG entra y sale a la hora en que lo hizo, en promedio por día. Nada se inventa: lo que no mueve una palanca queda igual que hoy. De cada familia se sabe por quién viene (el hijo menor) y hasta quién se queda (el mayor), con las secciones de GES.</li>
          <li><strong>Personal a E1:</strong> esa parte de los autos del personal que hoy usan E2 se estaciona en E1, con sus mismos horarios. Con el deslizador se mueve una parte pareja de todo el personal; por departamento, se mueven completos los departamentos marcados, con la cifra de cada uno en E2 a las 14:30.</li>
          <li><strong>Salida de una sección:</strong> se recorre la salida de las familias cuyo hijo mayor está en esa sección, también las que llegaron por un hermano menor. Si los papás «llegan según la salida del hijo por el que vienen», las familias cuyo hijo menor está en esa sección llegan esos minutos después o antes. La parte proporcional de los papás sin ligar a GES se mueve igual.</li>
          <li><strong>Recogida única:</strong> las familias con hermanos llegan a la hora del mayor, con la espera de quien viene solo por esa sección. El hijo menor espera en la escuela ese tiempo.</li>
        </ul>
        <p style={{ borderLeft: "5px solid #e2b93b", background: "#fcf9ee", padding: "8px 14px", borderRadius: "0 8px 8px 0", fontSize: 13 }}>
          <strong>Lo que el simulador no puede decir: la calle.</strong> No sabe cuántos autos esperan afuera, en el circuito y sobre B. Quintana, porque ni las plumas ni Google los ven.
          Es la fila que hay que medir: cuántos llegan, qué tan antes y cuánto tarda en vaciarse.
        </p>
      </details>
    </div>
  );
}
