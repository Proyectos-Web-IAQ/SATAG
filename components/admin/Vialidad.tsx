"use client";

// Consulta › Estacionamiento › Vialidad (6-nov-2026): el experimento como herramienta.
//
// SIETE PANTALLAS, UNA POR PREGUNTA de quien decide, en este orden: el sistema (con que
// modelo se lee todo), que pasa, por que, cuanto es nuestro, que pasa si, si sirvio, y
// que falta autorizar. Nace de la pagina que Gerardo aprobo el 6-nov en Analisis Vial
// (scripts/resultados.mjs) y vive aqui porque SATAG es donde estan la bitacora, GES y
// los roles.
//
// LO QUE TODAVIA NO HAY. La calle de Google entra con un bloque SQL propio (pantalla 4 y
// la columna de la calle) y el simulador se reescribe para el panel (pantalla 5). Las dos
// pantallas se muestran con su hueco a la vista, no se esconden: es la cobertura.
//
// No escribe nada: Consulta mide. La medicion vive en lib/vialidad.ts.

import { useEffect, useState } from "react";
import VialidadSeguir from "@/components/admin/VialidadSeguir";
import SimuladorVialidad from "@/components/admin/SimuladorVialidad";
import type { Celda } from "@/lib/simulador";
import { horaCorta } from "@/lib/estacionamiento";
import { GRUPOS_SALIDA, RECOGE, type ClaseDia, type Flujo, type GrupoSalida, type ResumenCalle, type Seguimiento } from "@/lib/vialidad";

const PANTALLAS = [
  { n: 1, titulo: "El sistema" },
  { n: 2, titulo: "Qué pasa" },
  { n: 3, titulo: "Por qué" },
  { n: 4, titulo: "Cuánto es nuestro" },
  { n: 5, titulo: "Qué pasa si" },
  { n: 6, titulo: "Cómo sabremos si sirvió" },
  { n: 7, titulo: "Qué falta autorizar" },
];

/** La pantalla elegida sobrevive al cambio de pestaña, como el tipo de día en Seguir. */
let ultima = 1;

const n0 = (v: number | null | undefined) => (v === null || v === undefined ? "—" : Math.round(v).toLocaleString("es-MX"));
const n1 = (v: number) => v.toLocaleString("es-MX", { maximumFractionDigits: 1 });
const libresTxt = (v: number) => {
  const k = Math.max(0, Math.round(v));
  return k === 0 ? "ningún cajón libre" : k === 1 ? "1 cajón libre" : `${k} cajones libres`;
};
const COLOR = Object.fromEntries(GRUPOS_SALIDA.map((g) => [g.clave, g.color])) as Record<GrupoSalida, string>;
const NOMBRE = Object.fromEntries(GRUPOS_SALIDA.map((g) => [g.clave, g.titulo])) as Record<GrupoSalida, string>;
/** Las salidas de cada sección (horarios de la escuela, 27-oct). */
const SALIDAS = [
  { m: 13 * 60 + 15, nombre: "comunidad infantil", color: COLOR.comunidad },
  { m: 13 * 60 + 25, nombre: "preescolar", color: COLOR.preescolar },
  { m: 14 * 60 + 10, nombre: "primaria", color: COLOR.primaria },
  { m: 14 * 60 + 35, nombre: "secundaria y prepa", color: COLOR.secprepa },
];

function Encabezado({ n, pregunta, children }: { n: number; pregunta: string; children: React.ReactNode }) {
  return (
    <>
      <h2 className="titular" style={{ marginBottom: 4 }}>{n}. {PANTALLAS[n - 1].titulo}</h2>
      <p className="sub" style={{ marginTop: 0 }}><strong>{pregunta}</strong> {children}</p>
    </>
  );
}

function Caja({ titulo, cifra, children, tono }: { titulo: string; cifra?: string; children: React.ReactNode; tono?: "rojo" | "gris" }) {
  const fondo = tono === "rojo" ? "#fdf5f5" : "var(--field-bg, #f4f7fc)";
  const borde = tono === "rojo" ? "#f0c4c6" : "var(--line)";
  return (
    <div style={{ background: fondo, border: `1px solid ${borde}`, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
      <strong style={{ display: "block", color: tono === "rojo" ? "#c2383d" : tono === "gris" ? "var(--muted)" : "var(--primary)" }}>{titulo}</strong>
      {cifra && <span style={{ display: "block", fontWeight: 800, fontSize: "1.9rem", color: "var(--primary)", margin: "2px 0" }}>{cifra}</span>}
      <span>{children}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ 1 · el sistema */
function Sistema({ f }: { f: Flujo }) {
  const s = f.sistema;
  const personal = f.dentro1440.E2.personal ?? 0;
  return (
    <>
      <Encabezado n={1} pregunta="Lo que llamamos «tráfico» es una fila de recogida.">Esta pantalla fija el modelo con el que se lee todo lo demás.</Encabezado>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 32px 1fr 32px 1fr", gap: 8, alignItems: "stretch", margin: "10px 0 8px" }}>
        <Caja titulo="Llegan" cifra={s ? n0(s.llegan) : "—"}>
          papás a E2 entre {horaCorta(RECOGE.desde)} y {horaCorta(RECOGE.hasta)}
          {s && s.llegan > 0 && <><br /><span className="ti-hint">uno cada {n1(s.cadaMin)} minutos</span></>}
        </Caja>
        <div style={{ display: "grid", placeItems: "center", fontSize: "1.8rem", color: "var(--muted)" }}>→</div>
        <Caja titulo="Se guardan" cifra={`${f.cupoE2} + ${f.cupoE1}`}>
          cajones en E2 y E1<br /><span className="ti-hint">a las 14:40, {n0(personal)} de E2 son del personal</span>
        </Caja>
        <div style={{ display: "grid", placeItems: "center", fontSize: "1.8rem", color: "var(--muted)" }}>→</div>
        <Caja titulo="Salen" cifra={s?.minutosDentro ? `${n0(s.minutosDentro)} min` : "—"}>
          después, en promedio por familia<br /><span className="ti-hint">con la salida de su hijo mayor</span>
        </Caja>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Caja titulo="Si no caben: la fila afuera" tono="rojo">en el circuito y en la calle. Es la causa, y <u>nadie la mide todavía</u>.</Caja>
        <Caja titulo="Alrededor: la calle" tono="gris">el síntoma. Google la mide cada 5 minutos; no explica, compara antes y después.</Caja>
      </div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, flexWrap: "wrap", fontWeight: 700, fontSize: "1.2rem", color: "var(--primary)", background: "#f7faf8", border: "1px solid #cfe6d6", borderRadius: 10, padding: 12 }}>
        <span>Autos dentro</span><span style={{ color: "#009844" }}>=</span><span>los que llegan por minuto</span><span style={{ color: "#009844" }}>×</span><span>los minutos que se queda cada uno</span>
      </div>
      <p className="ti-hint" style={{ textAlign: "center", margin: "4px 0 10px" }}>
        Es una cuenta de promedios (en ingeniería, ley de Little){s?.minutosDentro ? `: unos ${n0(s.porMinuto * s.minutosDentro)} autos a lo largo de la ventana; cuando ya se acumularon son más (a las 14:30 se cuentan ${n0(s.papasA1430)} papás en E2)` : ""}. Por eso solo hay tres formas de bajar la saturación.
      </p>
      <div className="table-wrap">
        <table className="admin-table tabla-pro">
          <thead><tr><th>Palanca</th><th>Qué cambia en la cuenta</th><th>Con estos datos</th></tr></thead>
          <tbody>
            <tr>
              <td><strong>Que no lleguen todos juntos</strong><br /><span className="ti-hint">escalonar salidas</span></td>
              <td>los que llegan por minuto</td>
              <td>Solo sirve si las familias ajustan su llegada; si llegan a la hora de siempre, la fila se mueve, no se achica.</td>
            </tr>
            <tr>
              <td><strong>Que se queden menos</strong><br /><span className="ti-hint">llegar cuando sale el hijo, recogida única</span></td>
              <td>los minutos que se queda cada uno</td>
              <td>{s ? <>Llegan {n1(s.porMinuto)} papás por minuto: cada 5 minutos menos de espera por familia son unos {n0(s.porMinuto * 5)} autos menos dentro.</> : "Necesita GES para saber por quién viene cada auto."}</td>
            </tr>
            <tr>
              <td><strong>Más lugar para los papás</strong><br /><span className="ti-hint">el personal a E1</span></td>
              <td>no toca la cuenta: sube el tope</td>
              <td>A las 14:40 el personal ocupa {n0(personal)} de los {f.cupoE2} cajones de E2. No le pide nada a las familias.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ 2 · qué pasa */
function Acumuladas({ f }: { f: Flujo }) {
  const W = 760, H = 380, L = 54, R = 150, T = 16, B = 34;
  const a = f.acumuladas;
  const desde = a[0].minuto, hasta = a[a.length - 1].minuto;
  const ymax = Math.ceil(Math.max(...a.map((p) => Math.max(p.llegaron, p.salieron + f.cupoE2))) / 50) * 50;
  const x = (m: number) => L + ((m - desde) / (hasta - desde)) * (W - L - R);
  const y = (v: number) => T + (1 - v / ymax) * (H - T - B);
  const linea = (val: (p: (typeof a)[number]) => number) => a.map((p, i) => `${i ? "L" : "M"}${x(p.minuto).toFixed(1)} ${y(val(p)).toFixed(1)}`).join("");
  const area = linea((p) => p.llegaron) + [...a].reverse().map((p) => `L${x(p.minuto).toFixed(1)} ${y(p.salieron).toFixed(1)}`).join("") + "Z";
  const ml = a.find((p) => p.minuto === f.masLleno.minuto)!;
  const fin = a[a.length - 1];
  const rejilla: number[] = [];
  for (let v = 0; v <= ymax; v += 50) rejilla.push(v);
  const horas: number[] = [];
  for (let m = desde; m <= hasta; m += 30) horas.push(m);
  const texto = `Autos acumulados que entran y salen de E2, lunes a jueves. Lo más lleno: ${n0(f.masLleno.dentro)} dentro a las ${horaCorta(f.masLleno.minuto)}.`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={texto} style={{ display: "block", maxWidth: 900 }}>
      <title>{texto}</title>
      {rejilla.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#eef1f5" />
          <text x={L - 6} y={y(v) + 4} fontSize={11} textAnchor="end" fill="#6b7689">{v}</text>
        </g>
      ))}
      {horas.map((m) => <text key={m} x={x(m)} y={H - 12} fontSize={11} textAnchor="middle" fill="#6b7689">{horaCorta(m)}</text>)}
      {SALIDAS.map((s, i) => (
        <g key={s.nombre}>
          <line x1={x(s.m)} x2={x(s.m)} y1={T + 4} y2={H - B} stroke={s.color} strokeDasharray="4 4" />
          <text x={x(s.m) + 3} y={T + 6 + i * 12} fontSize={10} fill={s.color}>sale {s.nombre} {horaCorta(s.m)}</text>
        </g>
      ))}
      <path d={area} fill="#2f6fd0" opacity={0.12} />
      <path d={linea((p) => p.salieron + f.cupoE2)} fill="none" stroke="#c2383d" strokeWidth={2} strokeDasharray="6 4" />
      <path d={linea((p) => p.salieron)} fill="none" stroke="#182947" strokeWidth={2.5} />
      <path d={linea((p) => p.llegaron)} fill="none" stroke="#2f6fd0" strokeWidth={2.5} />
      <text x={x(fin.minuto) + 6} y={y(fin.llegaron) + 4} fontSize={12} fill="#2f6fd0" fontWeight={700}>llegaron</text>
      <text x={x(fin.minuto) + 6} y={y(fin.salieron) + 4} fontSize={12} fill="#182947" fontWeight={700}>salieron</text>
      <text x={x(fin.minuto) + 6} y={y(fin.salieron + f.cupoE2) + 4} fontSize={12} fill="#c2383d" fontWeight={700}>tope: salieron + {f.cupoE2}</text>
      <line x1={x(ml.minuto)} x2={x(ml.minuto)} y1={y(ml.llegaron)} y2={y(ml.salieron)} stroke="#1d2533" strokeWidth={1.5} />
      <text x={x(ml.minuto) - 6} y={(y(ml.llegaron) + y(ml.salieron)) / 2} fontSize={12} textAnchor="end" fill="#1d2533">
        <tspan fontWeight={700}>{n0(f.masLleno.dentro)} dentro</tspan>
        <tspan x={x(ml.minuto) - 6} dy={14}>a las {horaCorta(ml.minuto)}</tspan>
      </text>
      <line x1={x(ml.minuto)} x2={x(ml.minuto)} y1={y(ml.salieron + f.cupoE2)} y2={y(ml.llegaron)} stroke="#c2383d" strokeWidth={1.5} />
      <text x={x(ml.minuto) + 6} y={(y(ml.salieron + f.cupoE2) + y(ml.llegaron)) / 2 + 4} fontSize={12} fill="#c2383d" fontWeight={700}>{libresTxt(f.masLleno.libres)}</text>
    </svg>
  );
}

function Chips({ o }: { o: Partial<Record<GrupoSalida, number>> }) {
  const xs = (Object.entries(o) as [GrupoSalida, number][]).filter(([, w]) => w >= 1.5).sort((p, q) => q[1] - p[1]).slice(0, 2);
  if (xs.length === 0) return <span className="ti-hint">casi nadie</span>;
  return (
    <>
      {xs.map(([k, w]) => (
        <span key={k} style={{ display: "inline-block", border: `1px solid ${COLOR[k]}`, borderRadius: 12, padding: "0 7px 0 5px", fontSize: "0.8rem", marginRight: 4, whiteSpace: "nowrap" }}>
          <i style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: COLOR[k], marginRight: 4 }} />
          {NOMBRE[k]} {n1(w)}
        </span>
      ))}
    </>
  );
}

/** «2.03x» con su barra: verde hasta 1.4x, ámbar hasta 1.75x, rojo después. */
function IndiceCalle({ v }: { v: number | undefined | null }) {
  if (v === undefined || v === null) return <span className="ti-hint">—</span>;
  const color = v >= 1.75 ? "#c2383d" : v >= 1.4 ? "#e5a13a" : "#3fa463";
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      <i style={{ display: "inline-block", height: 9, borderRadius: 2, width: Math.max(2, Math.round((Math.min(v - 1, 1.2) / 1.2) * 56)), background: color, verticalAlign: "middle", marginRight: 4 }} />
      <strong>{v.toFixed(2)}x</strong>
    </span>
  );
}

function QuePasa({ f, calle }: { f: Flujo; calle: ResumenCalle | null }) {
  const barra = (v: number, max: number, color: string) => <i style={{ display: "inline-block", height: 9, borderRadius: 2, width: Math.max(2, Math.round((Math.min(v, max) / max) * 56)), background: color, verticalAlign: "middle", marginRight: 4 }} />;
  const picoCalle = calle && calle.porRanuraLJ.size ? [...calle.porRanuraLJ].reduce((a, b) => (b[1] > a[1] ? b : a)) : null;
  return (
    <>
      <Encabezado n={2} pregunta="¿Qué pasa?">Cuándo se llena E2, cuándo se vacía y con qué salida se van.</Encabezado>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,7fr) minmax(0,5fr)", gap: 18, alignItems: "start" }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--primary)", margin: "4px 0 8px" }}>
            E2 se llena desde antes de las salidas sin que salga casi nadie: a las {horaCorta(f.masLleno.minuto)} queda {libresTxt(f.masLleno.libres)}.
            El pico de llegadas es a las {horaCorta(f.picoLlegan)} y el de salidas a las {horaCorta(f.picoSalen)}
            {picoCalle ? <>; la calle pica a las {horaCorta(picoCalle[0])} ({picoCalle[1].toFixed(2)}x), entre los dos.</> : "."}
          </p>
          <Acumuladas f={f} />
          <p className="ti-hint">
            Cómo se lee: la línea azul son los autos que han entrado a E2 desde las 12:00 (con los que ya estaban); la oscura, los que han salido.
            La distancia vertical entre las dos son los que están dentro. La roja es el tope: lo que ha salido más {f.cupoE2} cajones.
            Cuando la azul toca la roja, E2 está lleno y el siguiente auto se queda afuera, donde nadie lo cuenta.
          </p>
          <p className="ti-hint">
            La curva cuenta cada paso por la pluma. Lo demás de esta vista cuenta solo autos con entrada y salida leídas: a las {horaCorta(f.masLleno.minuto)} ve {n0(f.completasEnMasLleno)} en lugar de {n0(f.masLleno.dentro)}.
            La diferencia son lecturas incompletas de la pluma.
            {f.masLleno.libres < 0 && <> Por lo mismo la curva pasa del tope ({n0(f.masLleno.dentro)} contra {f.cupoE2} cajones): son salidas que la pluma no leyó, no autos de más.</>}
          </p>
        </div>
        <div className="table-wrap">
          <p className="ti-hint" style={{ margin: "0 0 4px" }}><strong>La tarde cada 5 minutos, por la pluma de E2</strong></p>
          <table className="admin-table tabla-pro">
            <thead><tr><th>Hora</th>{calle && <th>Calle</th>}<th className="num">Llegan</th><th className="num">Salen</th><th>Quién sale</th></tr></thead>
            <tbody>
              {f.tarde.map((t) => (
                <tr key={t.minuto} style={picoCalle && picoCalle[0] === t.minuto ? { background: "#fff7f7" } : undefined}>
                  <td>{horaCorta(t.minuto)}</td>
                  {calle && <td><IndiceCalle v={calle.porRanuraLJ.get(t.minuto)} /></td>}
                  <td className="num">{barra(t.llegan, 20, "#2f6fd0")}{n0(t.llegan)}</td>
                  <td className="num">{barra(t.salen, 20, "#182947")}{n0(t.salen)}</td>
                  <td><Chips o={t.salenPor} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ti-hint">
            {calle
              ? `Calle: mediana de ${calle.clases.find((c) => c.clase === "LJ")?.dias.length ?? 0} días de lunes a jueves del promedio de las rutas de llegada (Google); «x» = veces lo que tarda con la calle libre.`
              : "La columna de la calle (Google) aparece al cargar en Datos los archivos del muestreador."}
          </p>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ 3 · por qué */
function Cupo({ f, lote }: { f: Flujo; lote: "E1" | "E2" }) {
  const o = f.dentro1440[lote];
  const cupo = lote === "E2" ? f.cupoE2 : f.cupoE1;
  const grupos = GRUPOS_SALIDA.filter((g) => (o[g.clave] ?? 0) >= 0.5);
  const total = grupos.reduce((a, g) => a + (o[g.clave] ?? 0), 0);
  const libres = Math.max(0, cupo - total);
  return (
    <div style={{ margin: "10px 0" }}>
      <p style={{ margin: "0 0 4px" }}><strong>{lote}</strong> · {n0(total)} de {cupo} cajones a las 14:40</p>
      <div style={{ display: "flex", height: 22, borderRadius: 6, overflow: "hidden", border: "1px solid var(--line)" }} role="img" aria-label={`${lote}: ${grupos.map((g) => `${g.titulo} ${n0(o[g.clave])}`).join(", ")}, libres ${n0(libres)}`}>
        {grupos.map((g) => <i key={g.clave} title={`${g.titulo} ${n0(o[g.clave])}`} style={{ width: `${((o[g.clave] ?? 0) / cupo) * 100}%`, background: g.color }} />)}
        <i title={`libres ${n0(libres)}`} style={{ width: `${(libres / cupo) * 100}%`, background: "#eef1f5" }} />
      </div>
      <p className="ti-hint" style={{ margin: "6px 0 0" }}>
        {grupos.map((g) => `${g.titulo} ${n0(o[g.clave])}`).join(" · ")} · libres {n0(libres)}
      </p>
    </div>
  );
}

function PorQue({ f }: { f: Flujo }) {
  return (
    <>
      <Encabezado n={3} pregunta="¿Por qué?">Quién ocupa el lugar y hasta qué hijo se queda.</Encabezado>
      {f.sistema && (
        <p style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--primary)" }}>
          {Math.round(100 * f.sistema.conHermanos)} % de los autos de papás ligados que recogen tienen hijos en más de una sección, y salen con el mayor.
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Cupo f={f} lote="E2" />
        <Cupo f={f} lote="E1" />
      </div>
      <p className="ti-hint">
        El color dice con qué salida se va el auto: la de su hijo mayor. Quien tiene un hijo en secundaria o prepa se queda hasta las 14:45 aunque tenga otro en primaria.
        El detalle por sección (a qué hora entran y salen, y hasta qué hijo se quedan) está en Estacionamiento › Secciones.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ 4 · cuánto es nuestro */
const NOMBRE_CLASE: Record<ClaseDia, string> = {
  LJ: "Lunes a jueves con clases",
  V: "Viernes con clases",
  testigo: "Testigo: día hábil sin alumnos",
  finde: "Fin de semana",
};
const diaMes = (f: string) => `${Number(f.slice(8))}/${f.slice(5, 7)}`;

function CuantoEsNuestro({ calle }: { calle: ResumenCalle }) {
  const lj = calle.clases.find((c) => c.clase === "LJ");
  const tes = calle.clases.find((c) => c.clase === "testigo");
  // 9-nov: el viernes 6 subió el control; la frase sale de los datos, no se afirma de memoria.
  const controlAlto = calle.dias.filter((d) => d.control !== null && d.control >= 1.1);
  return (
    <>
      <Encabezado n={4} pregunta="¿Cuánto es nuestro?">Qué parte de la calle es del Instituto y qué parte es de la zona.</Encabezado>
      <div className="table-wrap">
        <table className="admin-table tabla-pro">
          <thead><tr><th>Tipo de día</th><th className="num">Días</th><th>Calle, promedio de 13:50 a 15:30</th><th>Pico</th><th className="num">Control a 3.5 km</th></tr></thead>
          <tbody>
            {calle.clases.map((c) => (
              <tr key={c.clase}>
                <td>
                  <strong>{NOMBRE_CLASE[c.clase]}</strong>
                  <br />
                  <span className="ti-hint">{c.dias.map((d) => `${diaMes(d.fecha)} ${d.medio.toFixed(2)}x`).join(" · ") || "sin días completos"}</span>
                </td>
                <td className="num">{c.dias.length}</td>
                <td><IndiceCalle v={c.medio} /></td>
                <td><IndiceCalle v={c.pico} /></td>
                <td className="num">{c.control === null ? "—" : `${c.control.toFixed(2)}x`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontWeight: 700, color: "var(--primary)", marginTop: 10 }}>
        El control, la misma avenida a 3.5 km, se queda en {lj?.control ? `${lj.control.toFixed(2)}x` : "su nivel normal"} mientras los accesos suben: la congestión es local.
        {controlAlto.length > 0 && ` Excepción: ${controlAlto.map((d) => `${diaMes(d.fecha)} (${(d.control as number).toFixed(2)}x)`).join(", ")}, cuando el control también subió.`}
        {lj?.medio && tes?.medio ? ` Sin alumnos la calle baja de ${lj.medio.toFixed(2)}x a ${tes.medio.toFixed(2)}x en promedio, pero los testigos todavía no coinciden entre sí: el 16 de noviembre, asueto general, lo decide.` : ""}
      </p>
      <p className="ti-hint">
        Google, ventana de la salida. Un día cuenta con 7 rondas o más. «x» = cuántas veces más tarda llegar por los accesos que con la calle libre; exagera en tramos cortos y no ve el circuito.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ 5 y 7 */
function Pendiente({ n, pregunta, sub, falta }: { n: number; pregunta: string; sub: string; falta: React.ReactNode }) {
  return (
    <>
      <Encabezado n={n} pregunta={pregunta}>{sub}</Encabezado>
      <div style={{ border: "1px dashed var(--line)", borderRadius: 10, padding: "16px 18px", maxWidth: "70ch" }}>
        <p style={{ margin: 0 }}><strong>Esta pantalla todavía no tiene datos en SATAG.</strong></p>
        <p style={{ margin: "6px 0 0" }}>{falta}</p>
      </div>
    </>
  );
}

function QueFalta() {
  const filas = [
    ["La fila afuera: cuántos autos esperan antes de la pluma y a qué hora", "Validar afuera cualquier medida: personal a E1, horarios, recogida", "Botón «fila hasta…» del portero en la caseta, o tres tardes de video fijo"],
    ["Un testigo limpio", "Cuánto del tráfico es del Instituto", "Lunes 16 de noviembre, asueto general: ya está programado"],
    ["El circuito y la salida de secundaria por E1", "La mañana y el escalonamiento de horarios", "Ninguna pluma lo ve: cámaras con conteo local, o aforo manual"],
    ["La calle de cada semana", "Que «Cuánto es nuestro» y Seguir incluyan los días nuevos", "Cargar en Datos los archivos del muestreador junto con los de ZK, cada semana"],
    ["La medida del piloto", "El piloto entero", "Dirección, antes del 23 de noviembre"],
  ];
  return (
    <>
      <Encabezado n={7} pregunta="¿Qué falta?">Lo que hoy nadie mide y qué decisión frena cada hueco.</Encabezado>
      <div className="table-wrap">
        <table className="admin-table tabla-pro">
          <thead><tr><th>Falta</th><th>Qué decisión frena</th><th>Cómo se consigue</th></tr></thead>
          <tbody>{filas.map((r) => <tr key={r[0]}><td><strong>{r[0]}</strong></td><td>{r[1]}</td><td>{r[2]}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="ti-hint">Lo que falta no es análisis: es un dato que hoy nadie recoge.</p>
    </>
  );
}

/* ------------------------------------------------------------------ el contenedor */
export default function Vialidad({ flujo, seguir, calle = null, calleSinBloque = false, celdas = null, inicial }: {
  flujo: Flujo | null;
  /** Las celdas del simulador (lib/simulador.ts); null sin GES. */
  celdas?: Celda[] | null;
  seguir: Seguimiento | null;
  calle?: ResumenCalle | null;
  /** true si la tabla de la calle todavía no existe (bloque 107 sin aplicar). */
  calleSinBloque?: boolean;
  inicial?: number;
}) {
  const [n, setN] = useState(inicial ?? ultima);
  useEffect(() => {
    ultima = n;
  }, [n]);
  return (
    <section className="seccion-plana">
      <p className="ti-hint" style={{ margin: 0 }}>Estacionamiento › Vialidad</p>
      <nav aria-label="Pantallas de Vialidad" style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0 14px" }}>
        {PANTALLAS.map((p) => (
          <button
            key={p.n}
            type="button"
            aria-pressed={p.n === n}
            onClick={() => setN(p.n)}
            style={{
              border: "1px solid var(--line)", borderRadius: 8, padding: "5px 10px", cursor: "pointer", font: "inherit", fontSize: "0.9rem",
              background: p.n === n ? "var(--primary)" : "#fff", color: p.n === n ? "#fff" : "var(--ink)", fontWeight: p.n === n ? 700 : 400,
            }}
          >
            {p.n}. {p.titulo}
          </button>
        ))}
      </nav>

      {n === 6 ? (
        <VialidadSeguir seguir={seguir} calle={calle} />
      ) : n === 7 ? (
        <QueFalta />
      ) : n === 4 ? (
        calle ? <CuantoEsNuestro calle={calle} /> : (
          <Pendiente n={4} pregunta="¿Cuánto es nuestro?" sub="Qué parte de la calle es del Instituto y qué parte es de la zona."
            falta={calleSinBloque
              ? <>Se responde con la calle de Google, que SATAG todavía no puede guardar: falta aplicar el bloque 107 en la base.</>
              : <>Se responde con la calle de Google. Cargue en Datos › Archivos de ZK los «trayectos-AAAA-MM-DD.csv» del muestreador de Análisis Vial.</>} />
        )
      ) : n === 5 ? (
        celdas && flujo ? (
          <>
            <Encabezado n={5} pregunta="¿Qué pasa si?">
              Las palancas sobre los viajes reales. Recomendación: la <strong>Propuesta 1</strong> como piloto; la recogida única es una pregunta para Dirección, porque su costo lo paga el hijo menor.
            </Encabezado>
            <SimuladorVialidad celdas={celdas} dias={flujo.dias.length} />
          </>
        ) : (
          <Pendiente n={5} pregunta="¿Qué pasa si?" sub="Las palancas sobre los viajes reales."
            falta={<>El simulador necesita saber por quién viene cada auto, y eso sale de GES. Abra Vialidad con una cuenta que lea GES (ti, contador o super), con la bitácora de al menos un día de lunes a jueves completo.</>} />
        )
      ) : !flujo ? (
        <p className="ti-empty">Todavía no hay un día de lunes a jueves con la tarde completa en la bitácora guardada.</p>
      ) : n === 1 ? (
        <Sistema f={flujo} />
      ) : n === 2 ? (
        <QuePasa f={flujo} calle={calle} />
      ) : (
        <PorQue f={flujo} />
      )}

      {flujo && n <= 3 && (
        <div className="firme">
          <p>
            <strong>Las metas las fija Dirección.</strong> Medido con {flujo.dias.length} días de lunes a jueves con la tarde completa en la bitácora guardada
            {flujo.dias.length ? ` (del ${flujo.dias[0].slice(8)}/${flujo.dias[0].slice(5, 7)} al ${flujo.dias[flujo.dias.length - 1].slice(8)}/${flujo.dias[flujo.dias.length - 1].slice(5, 7)})` : ""}, sin días testigo.
            {flujo.sistema ? "" : " Sin GES en esta sesión: no se sabe por quién viene cada auto y los papás van en «otros»."}
          </p>
        </div>
      )}
    </section>
  );
}
