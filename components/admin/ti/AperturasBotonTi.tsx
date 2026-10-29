"use client";

// Aperturas con el boton: el seguimiento desde TI (Gerardo, 29-oct-2026).
//
// «Ver claramente cuales reporto caseta y a que hora, para darle seguimiento a esos
// casos; ya habian bajado y volvieron a subir ahora que libere el sistema a Juan».
//
// Una fila por apertura con boton que registro ZK (hora y puerta), con lo que la
// caseta reporto de ella (a que hora, quien, a que vehiculo, por que) y en que va su
// caso. Las que nadie reporto van resaltadas, con el TAG que la pluma rechazo justo
// antes como pista. Dos formas de leerla: el dia, en orden de hora; o solo lo
// pendiente de todo el periodo: sin reporte, sin caso o con caso que nadie ha tomado.
//
// Es trabajo, no lectura: desde aqui se abre el caso y se liga una apertura que el
// portero no identifico. La vista analitica (horas, antes y despues, linea de tiempo)
// sigue en Consulta › Estacionamiento › Aperturas con boton (BotonesZk).
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RolPanel } from "@/lib/supabase/auth";
import {
  ligarReporteCaseta,
  listAperturasBotonZk,
  listPadronEstacionamiento,
  listPadronZkConsulta,
  listRechazosZk,
  listReportesCaseta,
  nombreDesdeEmail,
  type LecturaZk,
} from "@/lib/supabase/apiPanel";
import type { AperturaBotonZk } from "@/lib/zk/eventos";
import {
  SEGUIMIENTO_APERTURA,
  cruzarAperturas,
  estadoSeguimiento,
  paredQueretaro,
  rotuloMotivo,
  seguimientoDeApertura,
  tituloPuerta,
  type ReporteCaseta,
  type SeguimientoApertura,
} from "@/lib/caseta";
import { diaDe, pistasDe, type Pista } from "@/lib/aperturasBoton";
import { numeroCaso } from "@/lib/casosRegistro";
import { pedirCaso } from "@/lib/irACaso";
import { diaSemana, fecha, fechaHora, hora } from "@/lib/formato";
import { textoVehiculo } from "@/lib/vehiculo";
import Loader from "@/components/Loader";
import { DialogoLigar } from "@/components/admin/AperturasCaseta";

/** Quien trae un TAG: su expediente si lo hay; si no, el padron de ZK. */
interface Quien { nombre: string; placa: string | null; vehiculo: string | null; baja: boolean }

interface Item {
  /** La apertura segun ZK; null cuando la caseta reporto un boton que ZK no registro. */
  zk: AperturaBotonZk | null;
  reporte: ReporteCaseta | null;
  pistas: Pista[];
  seg: SeguimientoApertura;
  /** Hora de pared de Queretaro, la de ZK o la del reporte. */
  en: string;
  puerta: string;
  clave: string;
}

const LEEN_EVENTOS: RolPanel[] = ["ti", "contador", "super"];
const LIGAN: RolPanel[] = ["ti", "super"];
const DIAS = [7, 30, 90] as const;
/** Gerardo, 29-oct: la caseta usa el sistema desde el 28-oct. */
const HITO = "2026-10-28";
const PUERTA = (a: { lote: string; sentido: string }) => `${a.lote}-${a.sentido}`;

export default function AperturasBotonTi({ rol, email, onIr }: { rol: RolPanel; email: string; onIr: (vista: string) => void }) {
  const [dias, setDias] = useState<number>(7);
  const [lote, setLote] = useState<"" | "E1" | "E2">("");
  const [modo, setModo] = useState<"dia" | "pendientes">("dia");
  const [zk, setZk] = useState<AperturaBotonZk[] | null>(null);
  const [reportes, setReportes] = useState<ReporteCaseta[] | null>(null);
  const [rechazos, setRechazos] = useState<LecturaZk[]>([]);
  const [quienes, setQuienes] = useState<Map<string, Quien>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [solo, setSolo] = useState<SeguimientoApertura | null>(null);
  const [ligando, setLigando] = useState<ReporteCaseta[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const leeEventos = LEEN_EVENTOS.includes(rol);
  const liga = LIGAN.includes(rol);

  const leer = useCallback(async () => {
    setError(null);
    const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
    try {
      const [a, r] = await Promise.all([listAperturasBotonZk(dias), listReportesCaseta({ dias })]);
      setZk(a);
      setReportes(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer las aperturas.");
      setZk((x) => x ?? []);
      setReportes((x) => x ?? []);
    }
    if (leeEventos) listRechazosZk(desde).then(setRechazos).catch(() => setRechazos([]));
  }, [dias, leeEventos]);
  useEffect(() => { leer(); }, [leer]);

  // Quien es cada TAG, para las pistas: expedientes y padron de ZK.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const m = new Map<string, Quien>();
      for (const p of await listPadronZkConsulta().catch(() => [])) {
        m.set(p.tarjeta, { nombre: p.nombre, placa: p.placa || null, vehiculo: null, baja: /baja/i.test(p.departamento) || !p.vigente });
      }
      for (const e of await listPadronEstacionamiento().catch(() => [])) {
        const ya = m.get(e.noDispositivo);
        m.set(e.noDispositivo, { nombre: e.nombre, placa: e.placas ?? ya?.placa ?? null, vehiculo: e.marca || e.modelo ? textoVehiculo(e) : null, baja: e.estado === "baja" || !!ya?.baja });
      }
      if (vivo) setQuienes(m);
    })();
    return () => { vivo = false; };
  }, []);

  const datos = useMemo(() => {
    if (!zk || !reportes) return null;
    const deZk = zk.filter((a) => !lote || a.lote === lote);
    const deCaseta = reportes.filter((r) => !lote || r.puerta.startsWith(lote));
    const { cruces, sinZk } = cruzarAperturas(deZk, deCaseta);
    const items: Item[] = [
      ...cruces.map((c) => {
        const a = c.zk as AperturaBotonZk;
        return { zk: a, reporte: c.reporte, pistas: c.reporte ? [] : pistasDe(a, rechazos), seg: seguimientoDeApertura(c.reporte), en: a.ocurrioEn, puerta: PUERTA(a), clave: `zk:${a.idEvento}` };
      }),
      // Lo que la caseta reporto como boton y ZK no registro: tambien se sigue.
      ...sinZk.filter((r) => r.clase === "apertura").map((r) => ({
        zk: null, reporte: r, pistas: [], seg: seguimientoDeApertura(r), en: paredQueretaro(r.hechoEn), puerta: r.puerta, clave: `rep:${r.id}`,
      })),
    ].sort((x, y) => x.en.localeCompare(y.en));
    const porSeg = new Map<SeguimientoApertura, number>(SEGUIMIENTO_APERTURA.map((s) => [s.id, 0]));
    for (const it of items) porSeg.set(it.seg, (porSeg.get(it.seg) ?? 0) + 1);
    const porDia = new Map<string, { con: number; sin: number }>();
    for (const it of items) {
      const d = diaDe(it.en);
      const v = porDia.get(d) ?? { con: 0, sin: 0 };
      if (it.reporte) v.con += 1; else v.sin += 1;
      porDia.set(d, v);
    }
    const diasLista = [...porDia].map(([d, v]) => ({ dia: d, ...v })).sort((a, b) => a.dia.localeCompare(b.dia));
    const ultima = deZk.reduce<string | null>((m, a) => (!m || a.ocurrioEn > m ? a.ocurrioEn : m), null);
    return { items, porSeg, dias: diasLista, ultima, pendientes: items.filter((it) => SEGUIMIENTO_APERTURA.find((s) => s.id === it.seg)?.pendiente) };
  }, [zk, reportes, rechazos, lote]);

  // El dia elegido: el ultimo con aperturas si el elegido ya no esta.
  useEffect(() => {
    if (!datos) return;
    if (!dia || !datos.dias.some((d) => d.dia === dia)) setDia(datos.dias.length ? datos.dias[datos.dias.length - 1].dia : null);
  }, [datos, dia]);

  if (error && !datos) return <p className="submit-error" role="alert">{error}</p>;
  if (!datos) return <Loader label="Leyendo las aperturas con botón…" />;

  const abrirCaso = (n: number) => { pedirCaso(n); onIr("casos"); };
  const quien = (t: string) => quienes.get(t);
  const total = datos.items.length;
  const sinReporte = datos.porSeg.get("sin-reporte") ?? 0;
  const lista = modo === "dia"
    ? datos.items.filter((it) => diaDe(it.en) === dia && (!solo || it.seg === solo))
    : [...(solo ? datos.items.filter((it) => it.seg === solo) : datos.pendientes)].reverse();

  return (
    <div className="rc">
      <h2 className="titular">
        {sinReporte === 0 ? "La caseta reportó todas las aperturas con botón" : `${sinReporte} ${sinReporte === 1 ? "apertura con botón sin reporte" : "aperturas con botón sin reporte"} de la caseta`}
      </h2>
      <p className="titular__sub">
        De {total} {total === 1 ? "apertura" : "aperturas"} con el botón en los últimos {dias} días{lote ? ` en ${lote}` : ""}, según ZK
        {datos.ultima ? ` hasta el ${fechaHora(datos.ultima)}` : ""}. La caseta usa el sistema desde el {fecha(HITO)}.
        {" "}Una apertura cuenta como reportada si la caseta reportó en el mismo estacionamiento entre 5 minutos antes y 30 después.
      </p>

      <div className="aperturas__herr">
        <div className="tc-seg" role="group" aria-label="Qué ver">
          <button type="button" aria-pressed={modo === "dia"} onClick={() => setModo("dia")}>Por día</button>
          <button type="button" aria-pressed={modo === "pendientes"} onClick={() => setModo("pendientes")}>Pendientes de seguimiento{datos.pendientes.length ? ` (${datos.pendientes.length})` : ""}</button>
        </div>
        <select className="select" value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Días">
          {DIAS.map((d) => <option key={d} value={d}>Últimos {d} días</option>)}
        </select>
        <select className="select" value={lote} onChange={(e) => setLote(e.target.value as "" | "E1" | "E2")} aria-label="Estacionamiento">
          <option value="">E1 y E2</option>
          <option value="E1">E1</option>
          <option value="E2">E2</option>
        </select>
        <button type="button" className="ghost-action" onClick={() => leer()}>Volver a leer</button>
      </div>

      {error && <p className="submit-error" role="alert">{error}</p>}
      {aviso && <p className="ds-aviso ds-aviso--ok" role="status">{aviso}</p>}

      <div className="rc-cifras rc-cifras--6" role="group" aria-label="Filtrar por seguimiento">
        {SEGUIMIENTO_APERTURA.map((s) => (
          <button key={s.id} type="button" className={`rc-cifra rc-cifra--${s.id}`} aria-pressed={solo === s.id} title={s.ayuda}
            onClick={() => setSolo((x) => (x === s.id ? null : s.id))}>
            <span className="rc-cifra__n">{datos.porSeg.get(s.id) ?? 0}</span>
            <span className="rc-cifra__t">{s.titulo}</span>
          </button>
        ))}
      </div>

      {!zk?.length && !reportes?.length ? (
        <p className="ti-hint">
          Sin aperturas con botón en estos días. Las de ZK se guardan al subir «Todos los Eventos» en Ciclo de ZK › Archivos; las de la caseta, cuando el portero reporta.
        </p>
      ) : (
        <>
          {modo === "dia" && <TiraDias dias={datos.dias} dia={dia} onDia={setDia} />}
          <h3 className="bz-h" style={{ marginTop: 14 }}>
            {modo === "dia" && dia ? diaSemana(dia) : "Pendientes de seguimiento, lo más reciente primero"}
            <span className="ds-nota"> · {lista.length} {lista.length === 1 ? "apertura" : "aperturas"}{solo ? ` · ${SEGUIMIENTO_APERTURA.find((s) => s.id === solo)?.titulo.toLowerCase()}` : ""}</span>
          </h3>
          {lista.length === 0 ? (
            <p className="cs-vacio">{modo === "dia" ? "Nada ese día con estos filtros." : "Nada pendiente: todas las aperturas tienen reporte, caso y alguien que lo tomó."}</p>
          ) : (
            <div className="aperturas__scroll">
              <table className="aperturas__tabla aperturas__tabla--ancha">
                <thead>
                  <tr>
                    <th>Abrió (ZK)</th><th>Puerta</th><th>Reportó la caseta</th><th>Vehículo</th><th>Motivo</th><th>Caso</th><th />

                  </tr>
                </thead>
                <tbody>
                  {lista.map((it) => <FilaApertura key={it.clave} it={it} modo={modo} quien={quien} leeEventos={leeEventos} liga={liga} onCaso={abrirCaso} onLigar={(r) => setLigando([r])} />)}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <p className="ds-nota bz-pie">
        «Probable» es un TAG que la pluma rechazó en esa puerta de 3 minutos antes a 1 después.
        {!leeEventos && " Las pistas salen de la bitácora de ZK, que leen TI y Contabilidad."}
        {" "}El análisis por horas y el antes y después están en Consulta › Estacionamiento › Aperturas con botón.
      </p>

      {ligando && (
        <DialogoLigar
          reportes={ligando}
          onCancelar={() => setLigando(null)}
          onLigar={async (registroId) => {
            let caso: number | null = null;
            for (const r of ligando) caso = await ligarReporteCaseta(r.id, registroId, email);
            setLigando(null);
            const t = `Apertura ligada${caso ? `: caso ${numeroCaso(caso)}` : ""}.`;
            setAviso(t);
            setTimeout(() => setAviso((a) => (a === t ? null : a)), 6000);
            await leer();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ los dias del periodo */

function TiraDias({ dias, dia, onDia }: { dias: { dia: string; con: number; sin: number }[]; dia: string | null; onDia: (d: string) => void }) {
  const max = Math.max(1, ...dias.map((d) => d.con + d.sin));
  const primeroConSistema = dias.find((d) => d.dia >= HITO)?.dia;
  return (
    <figure className="bz-graf" aria-label="Aperturas por día">
      <figcaption className="bz-graf__t">
        Por día <span className="ds-nota">· elija uno para verlo</span>
        <span className="bz-leyenda"><span><i className="bz-seg--sin" /> Sin reporte</span><span><i className="bz-seg--con" /> Con reporte</span></span>
      </figcaption>
      <div className="bz-barras bz-barras--dias">
        {dias.map((d) => (
          <button key={d.dia} type="button" className={`bz-col bz-col--dia${d.dia === primeroConSistema ? " bz-col--hito" : ""}`} aria-pressed={d.dia === dia} onClick={() => onDia(d.dia)}
            title={`${diaSemana(d.dia)} · ${d.con + d.sin} aperturas · ${d.sin} sin reporte`}>
            {d.dia === primeroConSistema && <span className="bz-hito">Caseta con el sistema</span>}
            <span className="bz-col__n">{d.con + d.sin}</span>
            <span className="bz-col__pila" style={{ height: `${((d.con + d.sin) / max) * 100}%` }}>
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

/* ------------------------------------------------------------------ cada apertura */

function FilaApertura({ it, modo, quien, leeEventos, liga, onCaso, onLigar }: {
  it: Item;
  modo: "dia" | "pendientes";
  quien: (t: string) => Quien | undefined;
  leeEventos: boolean;
  liga: boolean;
  onCaso: (n: number) => void;
  onLigar: (r: ReporteCaseta) => void;
}) {
  const r = it.reporte;
  const estado = r ? estadoSeguimiento({ caso: r.casoNumero, estadoCaso: r.casoEstado ?? null }) : null;
  const cuando = (pared: string) => (modo === "dia" ? hora(pared) : fechaHora(pared));
  return (
    <tr className={r ? undefined : "aperturas__fila--alerta"}>
      <td className="mono">{it.zk ? cuando(it.zk.ocurrioEn) : <span className="ds-nota" title="La caseta reportó un botón que ZK no registró">— · ZK no la registró</span>}</td>
      <td>{tituloPuerta(it.puerta)}</td>
      <td>
        {r ? (
          <><span className="bz-etq">✓ {hora(paredQueretaro(r.hechoEn))}</span> <span className="ds-nota">· {nombreDesdeEmail(r.hechoPor)}</span></>
        ) : (
          <b className="bz-etq bz-etq--sin">● Sin reporte</b>
        )}
      </td>
      <td>
        {r ? (
          <>
            <b>{r.nombre ?? r.placas ?? r.placaNorm ?? r.vehiculoTexto ?? "Sin identificar"}</b>
            {r.nombre && (r.placas || r.placaNorm) ? <span className="ds-nota"> · {r.placas ?? r.placaNorm}</span> : null}
            {r.marca || r.modelo ? <span className="ds-nota"> · {textoVehiculo(r)}</span> : null}
            {r.ligadoPor && <span className="ds-nota"> · ligada por {nombreDesdeEmail(r.ligadoPor)}</span>}
          </>
        ) : it.pistas.length > 0 ? (
          it.pistas.map((p) => {
            const q = quien(p.tarjeta);
            return (
              <p key={p.tarjeta} style={{ margin: 0 }}>
                <span className="bz-probable">Probable</span> {q ? <b>{q.nombre}</b> : <b>TAG <span className="mono">{p.tarjeta}</span></b>}
                {q?.placa && <span className="ds-nota"> · {q.placa}</span>}
                <span className="ds-nota"> · rechazado {p.segundos <= 0 ? `${Math.abs(p.segundos)} s antes` : `${p.segundos} s después`}</span>
                {q?.baja && <b className="bz-baja"> · dado de baja</b>}
              </p>
            );
          })
        ) : (
          <span className="ds-nota">{leeEventos ? "Sin pista: ningún TAG fue rechazado en esa pluma." : "—"}</span>
        )}
      </td>
      <td>{r ? <>{rotuloMotivo(r.clase, r.motivo)}{r.nota && <span className="aperturas__nota">{r.nota}</span>}</> : <span className="ds-nota">—</span>}</td>
      <td>
        {r && r.casoNumero && estado ? (
          <><span className="mono">{numeroCaso(r.casoNumero)}</span> <span className={`cs-pill cs-pill--${estado.tono}`}>{estado.texto}</span></>
        ) : r ? (
          <span className="ds-nota">Sin caso</span>
        ) : (
          <span className="ds-nota">—</span>
        )}
      </td>
      <td>
        {r && r.casoNumero ? (
          <button type="button" className="link-action" onClick={() => onCaso(r.casoNumero!)}>Abrir caso</button>
        ) : r && liga && !r.registroId && r.clase === "apertura" ? (
          <button type="button" className="link-action" onClick={() => onLigar(r)}>Ligar…</button>
        ) : null}
      </td>
    </tr>
  );
}
