"use client";

// Las aperturas con el boton, vistas desde ZK (bloque 99; Gerardo, 19-oct).
//
// «Muy visual: a que hora se abrio el boton, a quien se le abrio o a quienes
// probablemente, y tener siempre presente cuantas fueron y de donde, sin priorizar
// las que tienen reporte: que salgan resaltadas las que no lo tienen.»
//
//   - Arriba, fijo al bajar: cuantas fueron, cuantas sin reporte, y por puerta.
//   - A que hora: barras por hora del periodo (los picos de las 9 y las 18).
//   - Por dia: una tira de dias; el elegido se dibuja en una linea de tiempo con
//     una pista por puerta y, debajo, la lista en orden de hora (no por reporte).
//   - A quien: lo que reporto la caseta; si no reporto, el TAG que la pluma
//     rechazo en esa puerta justo antes (lib/aperturasBoton.ts); y, por dia, los
//     carros que pasaron sin lectura.
//
// Sin reporte = rojo de alerta con su texto; con reporte = gris. Nunca solo color.
import { useEffect, useMemo, useRef, useState } from "react";
import type { RolPanel } from "@/lib/supabase/auth";
import {
  contarEntradasZk,
  listAperturasBotonZk,
  listImportacionesZk,
  listLecturasZk,
  listPadronEstacionamiento,
  listPadronZkConsulta,
  listRechazosZk,
  nombreDesdeEmail,
  type LecturaZk,
} from "@/lib/supabase/apiPanel";
import type { AperturaBotonZk } from "@/lib/zk/eventos";
import { PUERTAS, cruzarAperturas, paredQueretaro, rotuloMotivo, tituloPuerta, type ReporteCaseta } from "@/lib/caseta";
import { DIA_COMPLETO, antesDespues, diaDe, diaDeLaSemana, minutoDelDia, pistasDe, porDia, porHora, sinLecturaDelDia, type Pista } from "@/lib/aperturasBoton";
import { diaSemana, fecha, fechaHora, hora } from "@/lib/formato";
import { textoVehiculo } from "@/lib/vehiculo";
import Loader from "@/components/Loader";

/** Quien trae un TAG: su expediente si lo hay; si no, el padron de ZK. */
interface Quien { nombre: string; placa: string | null; vehiculo: string | null; departamento: string | null; baja: boolean }

interface Item {
  a: AperturaBotonZk;
  reporte: ReporteCaseta | null;
  pistas: Pista[];
}

const PUERTA = (a: { lote: string; sentido: string }) => `${a.lote}-${a.sentido}`;
const LEEN_EVENTOS: RolPanel[] = ["ti", "contador", "super"];
/** Gerardo, 19-oct: el canal Sistemas <-> caseta empezo el jueves 15-oct. Se puede cambiar en pantalla. */
const HITO_INICIAL = "2026-10-15";
const CLAVE_HITO = "satag.botones.hito";
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export default function BotonesZk({ rol, dias, lote, reportes }: {
  rol: RolPanel;
  dias: number;
  lote: "" | "E1" | "E2";
  reportes: ReporteCaseta[];
}) {
  const [zk, setZk] = useState<AperturaBotonZk[] | null>(null);
  const [rechazos, setRechazos] = useState<LecturaZk[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quienes, setQuienes] = useState<Map<string, Quien>>(new Map());
  const [puerta, setPuerta] = useState("");
  const [dia, setDia] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [lecturasDia, setLecturasDia] = useState<LecturaZk[] | null>(null);
  // La ultima lectura de ZK guardada: el corte real del dia de hoy (la ultima
  // apertura puede ser anterior). Si el rol no lee las importaciones, la ultima apertura.
  const [ultimaLectura, setUltimaLectura] = useState<string | null>(null);
  const leeEventos = LEEN_EVENTOS.includes(rol);
  const [hito, setHito] = useState(HITO_INICIAL);
  useEffect(() => {
    try { const v = localStorage.getItem(CLAVE_HITO); if (v && ES_FECHA.test(v)) setHito(v); } catch { /* sin almacenamiento */ }
  }, []);
  const cambiarHito = (v: string) => {
    if (!ES_FECHA.test(v)) return;
    setHito(v);
    try { localStorage.setItem(CLAVE_HITO, v); } catch { /* sin almacenamiento */ }
  };

  // Las aperturas y los rechazos del periodo.
  useEffect(() => {
    let vivo = true;
    setZk(null);
    const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
    listAperturasBotonZk(dias)
      .then((r) => { if (vivo) { setZk(r); setError(null); } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : "No se pudieron leer las aperturas de ZK."); setZk([]); } });
    if (leeEventos) {
      listImportacionesZk()
        .then((imps) => { if (vivo) setUltimaLectura(imps[0]?.hasta ? String(imps[0].hasta).replace("T", " ").slice(0, 19) : null); })
        .catch(() => { /* se queda con la ultima apertura */ });
      listRechazosZk(desde)
        .then((r) => { if (vivo) setRechazos(r); })
        .catch(() => { if (vivo) setRechazos([]); });
    }
    return () => { vivo = false; };
  }, [dias, leeEventos]);

  // Quien es cada TAG: expedientes y padron de ZK (si el rol lo lee).
  useEffect(() => {
    let vivo = true;
    (async () => {
      const m = new Map<string, Quien>();
      const zkP = await listPadronZkConsulta().catch(() => []);
      for (const p of zkP) {
        m.set(p.tarjeta, { nombre: p.nombre, placa: p.placa || null, vehiculo: null, departamento: p.departamento, baja: /baja/i.test(p.departamento) || !p.vigente });
      }
      const exps = await listPadronEstacionamiento().catch(() => []);
      for (const e of exps) {
        const ya = m.get(e.noDispositivo);
        const q: Quien = {
          nombre: e.nombre,
          placa: e.placas ?? ya?.placa ?? null,
          vehiculo: e.marca || e.modelo ? textoVehiculo(e) : null,
          departamento: ya?.departamento ?? null,
          baja: e.estado === "baja" || !!ya?.baja,
        };
        m.set(e.noDispositivo, q);
        for (const t of e.tagsAnteriores) if (!m.has(t)) m.set(t, { ...q, baja: true });
      }
      if (vivo) setQuienes(m);
    })();
    return () => { vivo = false; };
  }, []);

  const datos = useMemo(() => {
    if (!zk) return null;
    const deZk = zk.filter((a) => !lote || a.lote === lote);
    const ultimaApertura = deZk.reduce<string | null>((m, a) => (!m || a.ocurrioEn > m ? a.ocurrioEn : m), null);
    const hasta = ultimaLectura && (!ultimaApertura || ultimaLectura > ultimaApertura) ? ultimaLectura : ultimaApertura;
    const cruzables = reportes.filter((r) => (!lote || r.puerta.startsWith(lote)) && (!hasta || paredQueretaro(r.hechoEn) <= hasta));
    const { cruces, sinZk } = cruzarAperturas(deZk, cruzables);
    const todos: Item[] = cruces.map((c) => ({ a: c.zk as AperturaBotonZk, reporte: c.reporte, pistas: rechazos ? pistasDe(c.zk as AperturaBotonZk, rechazos) : [] }));
    const puertas = PUERTAS.filter((p) => !lote || p.lote === lote).map((p) => {
      const de = todos.filter((x) => PUERTA(x.a) === p.id);
      return { ...p, total: de.length, sin: de.filter((x) => !x.reporte).length };
    });
    const items = todos.filter((x) => !puerta || PUERTA(x.a) === puerta);
    return {
      hasta,
      sinZk: sinZk.filter((r) => r.clase === "apertura").length,
      total: items.length,
      sin: items.filter((x) => !x.reporte).length,
      puertas,
      items,
      horas: porHora(items.map((x) => ({ ocurrioEn: x.a.ocurrioEn, con: !!x.reporte })), (x) => x.con),
      dias: porDia(items.map((x) => ({ ocurrioEn: x.a.ocurrioEn, con: !!x.reporte })), (x) => x.con),
    };
  }, [zk, reportes, lote, puerta, rechazos, ultimaLectura]);

  // El dia elegido: el ultimo con aperturas, si el elegido ya no esta.
  useEffect(() => {
    if (!datos) return;
    if (!dia || !datos.dias.some((d) => d.dia === dia)) setDia(datos.dias.length ? datos.dias[datos.dias.length - 1].dia : null);
  }, [datos, dia]);

  // Las lecturas del dia elegido, para los que pasaron sin lectura.
  useEffect(() => {
    if (!dia || !leeEventos) { setLecturasDia(null); return; }
    let vivo = true;
    setLecturasDia(null);
    const siguiente = new Date(Date.parse(dia + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
    listLecturasZk(`${dia} 00:00:00`, `${siguiente} 00:00:00`, lote || null, 5000)
      .then((r) => { if (vivo) setLecturasDia(r.lecturas); })
      .catch(() => { if (vivo) setLecturasDia([]); });
    return () => { vivo = false; };
  }, [dia, lote, leeEventos]);

  if (error) return <p className="submit-error" role="alert">{error}</p>;
  if (!datos) return <Loader label="Leyendo las aperturas de ZK…" />;
  if (!zk?.length) {
    return (
      <p className="ti-hint">
        ZK no tiene aperturas con botón guardadas en estos días. Se guardan al subir «Todos los Eventos» en Datos › Archivos de ZK;
        los archivos subidos antes del 16-oct hay que volver a subirlos (lo ya guardado no se duplica).
      </p>
    );
  }

  const delDia = datos.items.filter((x) => diaDe(x.a.ocurrioEn) === dia).sort((x, y) => x.a.ocurrioEn.localeCompare(y.a.ocurrioEn));
  const quien = (t: string) => quienes.get(t);

  return (
    <div className="bz">
      {/* Siempre a la vista: cuantas, cuantas sin reporte y de que puerta. */}
      <div className="bz-resumen">
        <div className="bz-cifras">
          <p className="bz-total"><b>{datos.total}</b> {datos.total === 1 ? "apertura" : "aperturas"} con el botón</p>
          <p className="bz-sin"><b>{datos.sin}</b> sin reporte de la caseta</p>
          <p className="ds-nota">Últimos {dias} días{lote ? ` · ${lote}` : ""} · lecturas de ZK hasta el {datos.hasta ? fechaHora(datos.hasta) : "—"}</p>
        </div>
        <div className="bz-puertas" role="group" aria-label="Filtrar por puerta">
          {datos.puertas.map((p) => (
            <button key={p.id} type="button" className="bz-puerta" aria-pressed={puerta === p.id}
              onClick={() => setPuerta((x) => (x === p.id ? "" : p.id))}>
              <span className="bz-puerta__t">{p.titulo}</span>
              <span className="bz-puerta__n">{p.total}</span>
              <span className="bz-puerta__s">{p.sin > 0 ? `${p.sin} sin reporte` : "todas reportadas"}</span>
            </button>
          ))}
        </div>
      </div>

      <AntesYDespues items={datos.items} hasta={datos.hasta} lote={lote} hito={hito} onHito={cambiarHito} leeEventos={leeEventos} />

      <div className="bz-graficas">
        <Horas horas={datos.horas} />
        <Dias dias={datos.dias} dia={dia} hito={hito} onDia={(d) => { setDia(d); setSel(null); }} />
      </div>

      {dia && (
        <section className="bz-dia" aria-label={`Aperturas del ${diaSemana(dia)}`}>
          <h3 className="bz-h">
            {diaSemana(dia)} <span className="ds-nota">· {delDia.length} {delDia.length === 1 ? "apertura" : "aperturas"}</span>
            {delDia.some((x) => !x.reporte) && <span className="bz-h__sin"> · {delDia.filter((x) => !x.reporte).length} sin reporte</span>}
          </h3>
          <LineaDeTiempo items={delDia} puertas={datos.puertas.filter((p) => !puerta || p.id === puerta)} sel={sel} quien={quien}
            onSel={(id) => { setSel(id); document.getElementById(`bz-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }} />
          <ol className="bz-lista">
            {delDia.map((x) => (
              <Fila key={x.a.idEvento} x={x} sel={sel === x.a.idEvento} quien={quien} leeEventos={leeEventos}
                onSel={() => setSel((s) => (s === x.a.idEvento ? null : x.a.idEvento))} />
            ))}
          </ol>
          {leeEventos && <SinLecturaDia lecturas={lecturasDia} quien={quien} dia={dia} />}
        </section>
      )}

      <p className="ds-nota bz-pie">
        Una apertura cuenta como reportada si la caseta reportó en el mismo estacionamiento entre 5 minutos antes y 30 después.
        «Probable» es un TAG que la pluma rechazó en esa puerta de 3 minutos antes a 1 después.
        {datos.sinZk > 0 && ` La caseta reportó ${datos.sinZk} ${datos.sinZk === 1 ? "apertura" : "aperturas"} que ZK no registró como botón.`}
        {!leeEventos && " Las pistas de quién fue salen de la bitácora de ZK, que leen TI y Contabilidad."}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ a que hora */

function Horas({ horas }: { horas: { hora: number; sin: number; con: number }[] }) {
  const max = Math.max(1, ...horas.map((h) => h.sin + h.con));
  return (
    <figure className="bz-graf" aria-label="Aperturas por hora del día">
      <figcaption className="bz-graf__t">A qué hora <Leyenda /></figcaption>
      <div className="bz-barras">
        {horas.map((h) => (
          <div key={h.hora} className="bz-col" title={`${h.hora}:00 a ${h.hora}:59 · ${h.sin + h.con} aperturas · ${h.sin} sin reporte`}>
            <span className="bz-col__n">{h.sin + h.con || ""}</span>
            <div className="bz-col__pila" style={{ height: `${((h.sin + h.con) / max) * 100}%` }}>
              {h.con > 0 && <span className="bz-seg bz-seg--con" style={{ flexGrow: h.con }} />}
              {h.sin > 0 && <span className="bz-seg bz-seg--sin" style={{ flexGrow: h.sin }} />}
            </div>
            <span className="bz-col__x">{h.hora}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

function Dias({ dias, dia, hito, onDia }: { dias: { dia: string; sin: number; con: number }[]; dia: string | null; hito: string; onDia: (d: string) => void }) {
  const max = Math.max(1, ...dias.map((d) => d.sin + d.con));
  const primeroDespues = dias.find((d) => d.dia >= hito)?.dia;
  return (
    <figure className="bz-graf" aria-label="Aperturas por día">
      <figcaption className="bz-graf__t">Por día <span className="ds-nota">· elija uno para verlo</span></figcaption>
      <div className="bz-barras bz-barras--dias">
        {dias.map((d) => (
          <button key={d.dia} type="button" className={`bz-col bz-col--dia${d.dia === primeroDespues ? " bz-col--hito" : ""}`} aria-pressed={d.dia === dia} onClick={() => onDia(d.dia)}
            title={`${diaSemana(d.dia)} · ${d.sin + d.con} aperturas · ${d.sin} sin reporte`}>
            {d.dia === primeroDespues && <span className="bz-hito">Canal con la caseta</span>}
            <span className="bz-col__n">{d.sin + d.con}</span>
            <span className="bz-col__pila" style={{ height: `${((d.sin + d.con) / max) * 100}%` }}>
              {d.con > 0 && <span className="bz-seg bz-seg--con" style={{ flexGrow: d.con }} />}
              {d.sin > 0 && <span className="bz-seg bz-seg--sin" style={{ flexGrow: d.sin }} />}
            </span>
            <span className="bz-col__x">{diaSemana(d.dia).replace(/ \w+$/, "")}</span>
          </button>
        ))}
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------------ antes y despues del canal */

const pct = (c: number | null) => (c === null ? "—" : `${c < 0 ? "−" : "+"}${Math.abs(Math.round(c * 100))} %`);
const uno = (n: number | null) => (n === null ? "—" : n.toLocaleString("es-MX", { maximumFractionDigits: 1 }));

/**
 * Gerardo, 19-oct: demostrar que bajaron las aperturas con boton desde que empezo el
 * canal con la caseta. Por dia habil y por cada 100 entradas (el trafico del dia),
 * y cada dia contra el mismo dia de la semana de antes (lib/aperturasBoton.ts).
 */
function AntesYDespues({ items, hasta, lote, hito, onHito, leeEventos }: {
  items: Item[];
  hasta: string | null;
  lote: "" | "E1" | "E2";
  hito: string;
  onHito: (v: string) => void;
  leeEventos: boolean;
}) {
  const [entradas, setEntradas] = useState<Map<string, number> | null>(null);
  const [entradasHasta, setEntradasHasta] = useState<Map<string, number> | null>(null);
  const horaHasta = hasta ? hasta.slice(11, 16) : null;
  const diaHasta = hasta ? hasta.slice(0, 10) : null;

  // Los dias habiles del periodo, del primero con aperturas al de la ultima lectura.
  const habiles = useMemo(() => {
    if (!items.length || !diaHasta) return [];
    const ini = items.reduce((m, x) => (x.a.ocurrioEn < m ? x.a.ocurrioEn : m), items[0].a.ocurrioEn).slice(0, 10);
    const out: string[] = [];
    for (let t = Date.parse(ini + "T12:00:00Z"); t <= Date.parse(diaHasta + "T12:00:00Z"); t += 86400000) {
      const d = new Date(t).toISOString().slice(0, 10);
      const w = diaDeLaSemana(d);
      if (w >= 1 && w <= 5) out.push(d);
    }
    return out;
  }, [items, diaHasta]);

  // Las entradas de cada dia, contadas en la base (solo cuenta, no baja filas).
  useEffect(() => {
    if (!leeEventos || !habiles.length) { setEntradas(null); setEntradasHasta(null); return; }
    let vivo = true;
    setEntradas(null);
    setEntradasHasta(null);
    const siguiente = (d: string) => new Date(Date.parse(d + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
    const parcial = diaHasta && horaHasta && horaHasta < DIA_COMPLETO ? diaHasta : null;
    const mismos = parcial ? habiles.filter((d) => diaDeLaSemana(d) === diaDeLaSemana(parcial)) : [];
    (async () => {
      const m = new Map<string, number>();
      const mh = new Map<string, number>();
      const tareas: (() => Promise<void>)[] = [
        ...habiles.map((d) => async () => { m.set(d, await contarEntradasZk(`${d} 00:00:00`, `${siguiente(d)} 00:00:00`, lote || null)); }),
        ...mismos.map((d) => async () => { mh.set(d, await contarEntradasZk(`${d} 00:00:00`, `${d} ${horaHasta}:59`, lote || null)); }),
      ];
      // De 6 en 6, para no saturar la base.
      for (let i = 0; i < tareas.length; i += 6) await Promise.all(tareas.slice(i, i + 6).map((f) => f()));
      if (vivo) { setEntradas(m); setEntradasHasta(mh); }
    })().catch(() => { if (vivo) { setEntradas(null); setEntradasHasta(null); } });
    return () => { vivo = false; };
  }, [habiles, lote, leeEventos, diaHasta, horaHasta]);

  const r = useMemo(
    () => antesDespues(items.map((x) => x.a.ocurrioEn), entradas, entradasHasta, hito, hasta),
    [items, entradas, entradasHasta, hito, hasta],
  );
  const signo = (c: number | null) => (c === null ? "" : c < 0 ? " bz-ad__cambio--baja" : " bz-ad__cambio--sube");

  return (
    <section className="bz-ad" aria-label="Antes y después del canal con la caseta">
      <div className="bz-ad__cab">
        <h3 className="bz-h">Antes y después del canal con la caseta</h3>
        <label className="bz-ad__hito">Desde el
          <input className="input" type="date" value={hito} onChange={(e) => onHito(e.target.value)} />
        </label>
      </div>
      {!r.antes.dias ? (
        <p className="ds-nota">No hay días hábiles antes del {fecha(hito)} en este periodo: amplíe los días.</p>
      ) : (
        <>
          <div className="bz-ad__cifras">
            <div className="bz-ad__col">
              <span className="ds-rotulo">Antes · {r.antes.dias} días hábiles</span>
              <p><b className="bz-ad__n">{uno(r.antes.porDia)}</b> por día</p>
              <p className="ds-nota">{r.antes.tasa === null ? (leeEventos ? "Contando entradas…" : "") : `${uno(r.antes.tasa)} de cada 100 entradas`}</p>
            </div>
            <div className="bz-ad__col bz-ad__col--despues">
              <span className="ds-rotulo">Desde el {fecha(hito)} · {r.despues.dias} {r.despues.dias === 1 ? "día hábil completo" : "días hábiles completos"}</span>
              <p><b className="bz-ad__n">{r.despues.dias ? uno(r.despues.porDia) : "—"}</b> por día</p>
              <p className="ds-nota">{r.despues.tasa === null ? (leeEventos && r.despues.dias ? "Contando entradas…" : "") : `${uno(r.despues.tasa)} de cada 100 entradas`}</p>
            </div>
            <div className="bz-ad__col">
              <span className="ds-rotulo">Cambio</span>
              <p><b className={`bz-ad__n${signo(r.cambioPorDia)}`}>{pct(r.cambioPorDia)}</b> por día</p>
              {r.cambioTasa !== null && <p><b className={signo(r.cambioTasa).trim()}>{pct(r.cambioTasa)}</b> <span className="ds-nota">por cada 100 entradas</span></p>}
            </div>
          </div>

          {r.dias.length > 0 && (
            <table className="aperturas__tabla bz-ad__tabla">
              <caption>Cada día contra el mismo día de la semana antes del corte</caption>
              <thead>
                <tr>
                  <th>Día</th><th className="num">Aperturas</th><th className="num">Promedio antes (días)</th><th className="num">Cambio</th>
                  {leeEventos && <><th className="num">Por 100 entradas</th><th className="num">Antes</th></>}
                </tr>
              </thead>
              <tbody>
                {r.dias.map((d) => {
                  const c = d.antes && d.antes.botones > 0 ? d.botones / d.antes.botones - 1 : null;
                  return (
                    <tr key={d.dia}>
                      <td>{diaSemana(d.dia)}{d.parcialHasta && <span className="ds-nota"> · hasta las {d.parcialHasta}</span>}</td>
                      <td className="num"><b>{d.botones}</b></td>
                      <td className="num">{d.antes ? `${uno(d.antes.botones)} (${d.antes.dias})` : "—"}</td>
                      <td className={`num${signo(c)}`}>{pct(c)}</td>
                      {leeEventos && <><td className="num">{uno(d.tasa)}</td><td className="num">{uno(d.antes?.tasa ?? null)}</td></>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="ds-nota">
            Se cuentan días hábiles. Un día que el archivo no cubre hasta las {DIA_COMPLETO} se compara contra los mismos días hasta la
            misma hora y no entra en los promedios.
            {r.finDeSemana.dias > 0 && ` Los fines de semana van aparte: desde el corte, ${r.finDeSemana.botones} aperturas en ${r.finDeSemana.dias} ${r.finDeSemana.dias === 1 ? "día" : "días"}.`}
            {leeEventos && " «Entradas» son las lecturas de entrada concedidas, sin ráfagas: el tráfico de ese día."}
          </p>
        </>
      )}
    </section>
  );
}

function Leyenda() {
  return (
    <span className="bz-leyenda">
      <span><i className="bz-seg--sin" /> Sin reporte</span>
      <span><i className="bz-seg--con" /> Con reporte</span>
    </span>
  );
}

/* ------------------------------------------------------------------ el dia en una linea de tiempo */

function LineaDeTiempo({ items, puertas, sel, quien, onSel }: {
  items: Item[];
  puertas: { id: string; titulo: string }[];
  sel: number | null;
  quien: (t: string) => Quien | undefined;
  onSel: (id: number) => void;
}) {
  const mins = items.map((x) => minutoDelDia(x.a.ocurrioEn));
  const ini = Math.min(6 * 60, ...mins.map((m) => Math.floor(m / 60) * 60));
  const fin = Math.max(21 * 60, ...mins.map((m) => Math.ceil(m / 60) * 60));
  const x = (m: number) => `${((m - ini) / (fin - ini)) * 100}%`;
  const marcas: number[] = [];
  for (let h = Math.ceil(ini / 60); h * 60 <= fin; h += 2) marcas.push(h);
  return (
    <div className="bz-tiempo">
      {puertas.map((p) => (
        <div key={p.id} className="bz-carril">
          <span className="bz-carril__t">{p.titulo}</span>
          <div className="bz-carril__pista">
            {marcas.map((h) => <span key={h} className="bz-guia" style={{ left: x(h * 60) }} />)}
            {items.filter((it) => PUERTA(it.a) === p.id).map((it) => {
              const q = it.reporte ? null : it.pistas[0] ? quien(it.pistas[0].tarjeta) : null;
              const titulo = `${hora(it.a.ocurrioEn)} · ${tituloPuerta(PUERTA(it.a))} · ${it.reporte ? "reportada" : "SIN REPORTE"}`
                + (it.reporte ? ` · ${it.reporte.nombre ?? it.reporte.placaNorm ?? "sin identificar"}` : q ? ` · probable: ${q.nombre}` : "");
              return (
                <button key={it.a.idEvento} type="button" title={titulo} aria-label={titulo}
                  className={`bz-punto ${it.reporte ? "bz-punto--con" : "bz-punto--sin"}${sel === it.a.idEvento ? " bz-punto--sel" : ""}`}
                  style={{ left: x(minutoDelDia(it.a.ocurrioEn)) }} onClick={() => onSel(it.a.idEvento)} />
              );
            })}
          </div>
        </div>
      ))}
      <div className="bz-carril bz-carril--eje" aria-hidden="true">
        <span className="bz-carril__t" />
        <div className="bz-carril__pista">
          {marcas.map((h) => <span key={h} className="bz-eje" style={{ left: x(h * 60) }}>{h}:00</span>)}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ cada apertura */

function Fila({ x, sel, quien, leeEventos, onSel }: {
  x: Item;
  sel: boolean;
  quien: (t: string) => Quien | undefined;
  leeEventos: boolean;
  onSel: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const r = x.reporte;
  return (
    <li id={`bz-${x.a.idEvento}`} ref={ref} className={`bz-fila${r ? "" : " bz-fila--sin"}${sel ? " bz-fila--sel" : ""}`} onClick={onSel}>
      <span className="bz-fila__hora mono">{hora(x.a.ocurrioEn)}</span>
      <span className="bz-fila__puerta">{tituloPuerta(PUERTA(x.a))}</span>
      <span className="bz-fila__estado">{r ? <span className="bz-etq">✓ Reportada</span> : <b className="bz-etq bz-etq--sin">● Sin reporte</b>}</span>
      <div className="bz-fila__quien">
        {r ? (
          <>
            <p><b>{r.nombre ?? r.placas ?? r.placaNorm ?? r.vehiculoTexto ?? "Sin identificar"}</b>
              {r.nombre && (r.placas || r.placaNorm) ? <span className="ds-nota"> · {r.placas ?? r.placaNorm}</span> : null}
              {r.marca || r.modelo ? <span className="ds-nota"> · {textoVehiculo(r)}</span> : null}</p>
            <p className="ds-nota">{rotuloMotivo(r.clase, r.motivo)} · reportó {nombreDesdeEmail(r.hechoPor)} a las {hora(paredQueretaro(r.hechoEn))}{r.nota ? ` · «${r.nota}»` : ""}</p>
          </>
        ) : x.pistas.length > 0 ? (
          x.pistas.map((p) => <PistaFila key={p.tarjeta} p={p} q={quien(p.tarjeta)} sentido={x.a.sentido} />)
        ) : (
          <p className="ds-nota">{leeEventos ? "Sin pista en ZK: ningún TAG fue rechazado en esa pluma. Puede ser un vehículo sin TAG o un TAG que no se leyó." : "Sin reporte de la caseta."}</p>
        )}
      </div>
    </li>
  );
}

function PistaFila({ p, q, sentido }: { p: Pista; q: Quien | undefined; sentido: string }) {
  const cuando = p.segundos <= 0 ? `${Math.abs(p.segundos)} s antes` : `${p.segundos} s después`;
  return (
    <p>
      <span className="bz-probable">Probable</span>{" "}
      {q ? <b>{q.nombre}</b> : <b>TAG <span className="mono">{p.tarjeta}</span></b>}
      {q?.placa && <span className="ds-nota"> · {q.placa}</span>}
      {q?.vehiculo && <span className="ds-nota"> · {q.vehiculo}</span>}
      <span className="ds-nota"> · {q ? <>TAG <span className="mono">{p.tarjeta}</span> rechazado</> : "rechazado"} {cuando}{p.mismoSentido ? "" : ` en la ${sentido === "entrada" ? "salida" : "entrada"}`}</span>
      {!q && <span className="ds-nota"> · no está en SATAG ni en el padrón de ZK</span>}
      {q?.baja && <b className="bz-baja"> · dado de baja</b>}
      {q?.departamento && !q.baja && <span className="ds-nota"> · {q.departamento}</span>}
    </p>
  );
}

/* ------------------------------------------------------------------ los que pasaron sin lectura */

function SinLecturaDia({ lecturas, quien, dia }: { lecturas: LecturaZk[] | null; quien: (t: string) => Quien | undefined; dia: string }) {
  const grupos = useMemo(() => (lecturas ? sinLecturaDelDia(lecturas) : null), [lecturas]);
  if (!grupos) return <p className="ds-nota">Leyendo quién pasó sin lectura ese día…</p>;
  const n = grupos.reduce((s, g) => s + g.entraronSinLectura.length + g.salieronSinLectura.length, 0);
  if (n === 0) return null;
  const nombre = (t: string) => {
    const q = quien(t);
    return q ? `${q.nombre}${q.placa ? ` · ${q.placa}` : ""}` : `TAG ${t}`;
  };
  return (
    <details className="bz-posibles">
      <summary>
        También posibles: <b>{n}</b> {n === 1 ? "vehículo pasó" : "vehículos pasaron"} sin que la pluma lo leyera el {diaSemana(dia)}
      </summary>
      <p className="ds-nota">No traen hora que los empate con una apertura: son candidatos del día, no de una apertura en particular.</p>
      <div className="bz-posibles__cols">
        {grupos.map((g) => (
          <div key={g.lote}>
            {g.entraronSinLectura.length > 0 && (
              <>
                <h4 className="ds-rotulo">{g.lote} · entraron sin lectura ({g.entraronSinLectura.length})</h4>
                <ul>{g.entraronSinLectura.map((x) => <li key={x.tarjeta}>{nombre(x.tarjeta)} <span className="ds-nota">· salió {hora(x.salio)}</span></li>)}</ul>
              </>
            )}
            {g.salieronSinLectura.length > 0 && (
              <>
                <h4 className="ds-rotulo">{g.lote} · salieron sin lectura ({g.salieronSinLectura.length})</h4>
                <ul>{g.salieronSinLectura.map((x) => <li key={x.tarjeta}>{nombre(x.tarjeta)} <span className="ds-nota">· entró {hora(x.entro)}</span></li>)}</ul>
              </>
            )}
          </div>
        ))}
      </div>
      <p className="ds-nota">«Salieron sin lectura» incluye a quien seguía dentro al cierre del archivo o salió por el otro estacionamiento.</p>
    </details>
  );
}
