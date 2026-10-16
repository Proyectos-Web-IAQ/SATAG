"use client";

// Aperturas con el boton (bloque 97, Gerardo 14-oct): «desde Sistemas tener el
// reporte de las aperturas con boton y poder trakear a que carro se le abrio».
//
// Tres modos sobre la misma bitacora de la caseta:
//   - Bitacora: cada apertura y cada reporte, con quien lo hizo y que decia la pantalla.
//   - Por vehiculo: a que carro se le abre con el boton y cuantas veces. Los que el
//     portero no identifico se juntan por la placa que escribio; TI los liga a un
//     expediente cuando sabe de quien son.
//   - Resumen: cuantas fueron del TAG o del lector y cuantas sin acceso.
//   - Según ZK (bloque 99, 15-oct): las aperturas con boton que registro ZK, cruzadas
//     con los reportes. ZK sabe cuando y por que puerta; la caseta, a quien y por que.
// Leen ti, contador, admin y super (RLS del 97 y 99); ligar es solo de ti (y super).
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RolPanel } from "@/lib/supabase/auth";
import { listAperturasBotonZk, listPadronEstacionamiento, listReportesCaseta, ligarReporteCaseta, nombreDesdeEmail, type PadronEstacionamiento } from "@/lib/supabase/apiPanel";
import type { AperturaBotonZk } from "@/lib/zk/eventos";
import {
  MOTIVOS_APERTURA,
  MOTIVOS_REPORTE,
  VEREDICTO,
  agruparPorVehiculo,
  cruzarAperturas,
  csvAperturas,
  paredQueretaro,
  placaNormalizada,
  resumenAperturas,
  rotuloMotivo,
  tituloPuerta,
  type ReporteCaseta,
  type VehiculoAperturas,
} from "@/lib/caseta";
import { numeroCaso } from "@/lib/casosRegistro";
import { diaSemana, fechaHora } from "@/lib/formato";
import { normalizarBusqueda } from "@/lib/buscarPersona";
import { textoVehiculo } from "@/lib/vehiculo";
import Loader from "@/components/Loader";

type Modo = "bitacora" | "vehiculo" | "resumen" | "zk";
const LIGAN: RolPanel[] = ["ti", "super"];
const DIAS = [7, 30, 90] as const;

export default function AperturasCaseta({ rol, email }: { rol: RolPanel; email: string }) {
  const [dias, setDias] = useState<number>(30);
  const [reportes, setReportes] = useState<ReporteCaseta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>("vehiculo");
  const [lote, setLote] = useState<"" | "E1" | "E2">("");
  const [clase, setClase] = useState<"" | "apertura" | "reporte">("apertura");
  const [motivo, setMotivo] = useState("");
  const [portero, setPortero] = useState("");
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [ligando, setLigando] = useState<ReporteCaseta[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [zk, setZk] = useState<AperturaBotonZk[] | null>(null);
  const [errorZk, setErrorZk] = useState<string | null>(null);
  const liga = LIGAN.includes(rol);

  // Lo de ZK se lee solo al abrir ese modo.
  useEffect(() => {
    if (modo !== "zk") return;
    let vivo = true;
    setZk(null);
    listAperturasBotonZk(dias)
      .then((r) => { if (vivo) { setZk(r); setErrorZk(null); } })
      .catch((e) => { if (vivo) { setErrorZk(e instanceof Error ? e.message : "No se pudieron leer las aperturas de ZK."); setZk([]); } });
    return () => { vivo = false; };
  }, [modo, dias]);

  const leer = useCallback(async () => {
    setError(null);
    try {
      setReportes(await listReportesCaseta({ dias }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la bitácora de la caseta.");
      setReportes((r) => r ?? []);
    }
  }, [dias]);
  useEffect(() => { leer(); }, [leer]);

  const porteros = useMemo(() => [...new Set((reportes ?? []).map((r) => r.hechoPor))].sort(), [reportes]);
  const visibles = useMemo(() => {
    const t = normalizarBusqueda(q);
    const tp = placaNormalizada(q);
    return (reportes ?? []).filter((r) =>
      (!lote || r.puerta.startsWith(lote)) &&
      (!clase || r.clase === clase) &&
      (!motivo || r.motivo === motivo) &&
      (!portero || r.hechoPor === portero) &&
      (!t || normalizarBusqueda([r.nombre, r.placas, r.placaNorm, r.vehiculoTexto, r.marca, r.modelo, r.tarjeta, r.nota].filter(Boolean).join(" ")).includes(t) ||
        (tp.length >= 3 && placaNormalizada(r.placas ?? r.placaNorm).includes(tp))));
  }, [reportes, lote, clase, motivo, portero, q]);
  const vehiculos = useMemo(() => agruparPorVehiculo(visibles), [visibles]);
  const resumen = useMemo(() => resumenAperturas(visibles), [visibles]);

  function descargar() {
    const csv = "﻿" + csvAperturas(visibles, fechaHora);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `aperturas-con-boton-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (reportes === null) return <Loader label="Leyendo la bitácora de la caseta…" />;

  const motivosLista = clase === "reporte" ? MOTIVOS_REPORTE : clase === "apertura" ? MOTIVOS_APERTURA : [...MOTIVOS_APERTURA, ...MOTIVOS_REPORTE.filter((m) => !MOTIVOS_APERTURA.some((a) => a.id === m.id))];

  return (
    <div className="aperturas">
      <p className="titular__migas"><span>Estacionamiento</span><span>›</span><span>Aperturas con botón</span></p>
      <h2 className="titular">{resumen.total} {resumen.total === 1 ? "apertura" : "aperturas"} con el botón</h2>
      <p className="titular__sub">
        En los últimos {dias} días{lote ? ` en ${lote}` : ""}: {resumen.tagOLector} del TAG o del lector, {resumen.sinAcceso} sin acceso y {resumen.sinIdentificar} sin identificar.
        {" "}Las reporta la caseta; en «Según ZK» se cruzan con las que registró ZK.
      </p>

      <div className="aperturas__herr">
        <div className="tc-seg" role="group" aria-label="Modo">
          {(["vehiculo", "bitacora", "resumen", "zk"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={modo === m} onClick={() => setModo(m)}>
              {m === "vehiculo" ? "Por vehículo" : m === "bitacora" ? "Bitácora" : m === "resumen" ? "Resumen" : "Según ZK"}
            </button>
          ))}
        </div>
        {modo !== "zk" && <input className="input search aperturas__buscar" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Placa, nombre, vehículo o TAG" />}
        <select className="select" value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Días">
          {DIAS.map((d) => <option key={d} value={d}>Últimos {d} días</option>)}
        </select>
        <select className="select" value={lote} onChange={(e) => setLote(e.target.value as "" | "E1" | "E2")} aria-label="Estacionamiento">
          <option value="">E1 y E2</option>
          <option value="E1">E1</option>
          <option value="E2">E2</option>
        </select>
        {/* ZK no sabe a quien ni por que: en «Según ZK» solo valen los dias y el estacionamiento. */}
        {modo !== "zk" && (
          <>
            <select className="select" value={clase} onChange={(e) => { setClase(e.target.value as "" | "apertura" | "reporte"); setMotivo(""); }} aria-label="Tipo">
              <option value="apertura">Aperturas con botón</option>
              <option value="reporte">Otros reportes</option>
              <option value="">Todo</option>
            </select>
            <select className="select" value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo">
              <option value="">Todos los motivos</option>
              {motivosLista.map((m) => <option key={m.id} value={m.id}>{m.titulo}</option>)}
            </select>
            <select className="select" value={portero} onChange={(e) => setPortero(e.target.value)} aria-label="Quién reportó">
              <option value="">Todos los porteros</option>
              {porteros.map((p) => <option key={p} value={p}>{nombreDesdeEmail(p)}</option>)}
            </select>
            <button type="button" className="ghost-action" onClick={descargar} disabled={!visibles.length}>Descargar CSV</button>
          </>
        )}
      </div>

      {error && <p className="submit-error" role="alert">{error} <button type="button" className="link-action" onClick={() => leer()}>Volver a leer</button></p>}
      {aviso && <p className="ds-aviso ds-aviso--ok" role="status">{aviso}</p>}
      {modo !== "zk" && !visibles.length && <p className="ti-hint">Sin reportes de la caseta con estos filtros.</p>}

      {modo === "zk" && (
        zk === null ? <Loader label="Leyendo las aperturas de ZK…" />
        : <SegunZk zk={zk} reportes={reportes} lote={lote} error={errorZk} />
      )}

      {modo === "vehiculo" && visibles.length > 0 && (
        <ul className="aperturas__vehiculos">
          {vehiculos.map((v) => (
            <FilaVehiculo key={v.clave} v={v} abierto={abierto === v.clave} onAbrir={() => setAbierto((a) => (a === v.clave ? null : v.clave))}
              liga={liga} onLigar={(rs) => setLigando(rs)} />
          ))}
        </ul>
      )}

      {modo === "bitacora" && visibles.length > 0 && (
        <TablaBitacora items={visibles} liga={liga} onLigar={(r) => setLigando([r])} />
      )}

      {modo === "resumen" && visibles.length > 0 && (
        <div className="aperturas__resumen">
          <table className="aperturas__tabla">
            <caption>Aperturas por puerta</caption>
            <thead><tr><th>Puerta</th><th>Aperturas</th></tr></thead>
            <tbody>{resumen.porPuerta.map((p) => <tr key={p.puerta}><td>{tituloPuerta(p.puerta)}</td><td className="num">{p.n}</td></tr>)}</tbody>
          </table>
          <table className="aperturas__tabla">
            <caption>Aperturas por día</caption>
            <thead><tr><th>Día</th><th>Aperturas</th></tr></thead>
            <tbody>{[...resumen.porDia].reverse().map((d) => <tr key={d.dia}><td>{diaSemana(d.dia)}</td><td className="num">{d.n}</td></tr>)}</tbody>
          </table>
          <table className="aperturas__tabla">
            <caption>Por motivo</caption>
            <thead><tr><th>Motivo</th><th>Veces</th></tr></thead>
            <tbody>
              {MOTIVOS_APERTURA.map((m) => ({ m, n: visibles.filter((r) => r.clase === "apertura" && r.motivo === m.id).length }))
                .filter((x) => x.n > 0).sort((a, b) => b.n - a.n)
                .map((x) => <tr key={x.m.id}><td>{x.m.titulo}</td><td className="num">{x.n}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}

      {ligando && (
        <DialogoLigar
          reportes={ligando}
          onCancelar={() => setLigando(null)}
          onLigar={async (registroId) => {
            let caso: number | null = null;
            for (const r of ligando) caso = await ligarReporteCaseta(r.id, registroId, email);
            setLigando(null);
            const t = `${ligando.length === 1 ? "Apertura ligada" : `${ligando.length} aperturas ligadas`}${caso ? `: caso ${numeroCaso(caso)}` : ""}.`;
            setAviso(t);
            setTimeout(() => setAviso((a) => (a === t ? null : a)), 6000);
            await leer();
          }}
        />
      )}
    </div>
  );
}

/**
 * Las aperturas con boton de ZK contra los reportes de la caseta. Lo que ZK registro
 * y nadie reporto es lo que hay que preguntar en la caseta. Lo que la caseta reporto
 * despues del ultimo archivo de ZK todavia no se puede cruzar, y no se cuenta como
 * faltante.
 */
function SegunZk({ zk, reportes, lote, error }: {
  zk: AperturaBotonZk[];
  reportes: ReporteCaseta[];
  lote: "" | "E1" | "E2";
  error: string | null;
}) {
  const [todas, setTodas] = useState(false);
  const datos = useMemo(() => {
    const deZk = zk.filter((a) => !lote || a.lote === lote);
    const hasta = deZk.reduce<string | null>((m, a) => (!m || a.ocurrioEn > m ? a.ocurrioEn : m), null);
    const deCaseta = reportes.filter((r) => (!lote || r.puerta.startsWith(lote)) && (!hasta || paredQueretaro(r.hechoEn) <= hasta));
    const { cruces, sinZk } = cruzarAperturas(deZk, deCaseta);
    const dias = new Map<string, { dia: string; zk: number; reportadas: number }>();
    for (const c of cruces) {
      const d = c.zk.ocurrioEn.slice(0, 10);
      const x = dias.get(d) ?? { dia: d, zk: 0, reportadas: 0 };
      x.zk++;
      if (c.reporte) x.reportadas++;
      dias.set(d, x);
    }
    const sinReporte = cruces.filter((c) => !c.reporte).sort((a, b) => b.zk.ocurrioEn.localeCompare(a.zk.ocurrioEn));
    return { total: cruces.length, reportadas: cruces.length - sinReporte.length, sinReporte, sinZk, hasta, dias: [...dias.values()].sort((a, b) => b.dia.localeCompare(a.dia)) };
  }, [zk, reportes, lote]);

  if (error) return <p className="submit-error" role="alert">{error}</p>;
  if (!datos.total) {
    return (
      <p className="ti-hint">
        ZK no tiene aperturas con botón guardadas en estos días. Se guardan al subir «Todos los Eventos» en
        Estacionamiento; los archivos subidos antes del 15-oct hay que volver a subirlos (lo ya guardado no se duplica).
      </p>
    );
  }
  const pct = Math.round((datos.reportadas / datos.total) * 100);
  const lista = todas ? datos.sinReporte : datos.sinReporte.slice(0, 30);
  return (
    <div className="aperturas__resumen aperturas__resumen--zk">
      <div>
        <p>
          ZK registró <b>{datos.total}</b> aperturas con botón{lote ? ` en ${lote}` : ""}; la caseta reportó <b>{datos.reportadas}</b> ({pct}%).
          {" "}<b>{datos.sinReporte.length}</b> sin reporte.
        </p>
        <p className="ds-nota">
          Lecturas de ZK hasta el {datos.hasta ? fechaHora(datos.hasta) : "—"}. Una apertura cuenta como reportada si la caseta
          reportó en el mismo estacionamiento entre 5 minutos antes y 30 después.
          {datos.sinZk.length > 0 && ` La caseta reportó ${datos.sinZk.length} que ZK no registró como botón (pudo abrirse por otro medio).`}
        </p>
      </div>
      <table className="aperturas__tabla">
        <caption>Por día</caption>
        <thead><tr><th>Día</th><th>ZK</th><th>Reportadas</th><th>Sin reporte</th></tr></thead>
        <tbody>
          {datos.dias.map((d) => (
            <tr key={d.dia}>
              <td>{diaSemana(d.dia)}</td>
              <td className="num">{d.zk}</td>
              <td className="num">{d.reportadas}</td>
              <td className="num">{d.zk - d.reportadas}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {datos.sinReporte.length > 0 && (
        <table className="aperturas__tabla">
          <caption>Sin reporte de la caseta</caption>
          <thead><tr><th>Cuándo</th><th>Puerta</th></tr></thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.zk.idEvento}><td>{fechaHora(c.zk.ocurrioEn)}</td><td>{tituloPuerta(`${c.zk.lote}-${c.zk.sentido}`)}</td></tr>
            ))}
          </tbody>
          {datos.sinReporte.length > 30 && (
            <tfoot><tr><td colSpan={2}>
              <button type="button" className="link-action" onClick={() => setTodas((v) => !v)}>{todas ? "Ver menos" : `Ver las ${datos.sinReporte.length}`}</button>
            </td></tr></tfoot>
          )}
        </table>
      )}
    </div>
  );
}

function ChipVeredicto({ v }: { v: ReporteCaseta["veredicto"] }) {
  if (!v) return <span className="ds-nota">—</span>;
  return <span className={`aperturas__ver aperturas__ver--${v}`}>{VEREDICTO[v].titulo}</span>;
}

const vehiculoDe = (r: ReporteCaseta) =>
  r.nombre
    ? [r.placas, r.marca || r.modelo ? textoVehiculo(r) : null].filter(Boolean).join(" · ")
    : [r.placaNorm, r.vehiculoTexto].filter(Boolean).join(" · ") || (r.tarjeta ? `TAG ${r.tarjeta}` : "Sin vehículo");

function FilaVehiculo({ v, abierto, onAbrir, liga, onLigar }: {
  v: VehiculoAperturas;
  abierto: boolean;
  onAbrir: () => void;
  liga: boolean;
  onLigar: (rs: ReporteCaseta[]) => void;
}) {
  const sinLigar = v.items.filter((r) => !r.registroId && !r.tarjeta);
  const r0 = v.items[0];
  return (
    <li className={`aperturas__veh${abierto ? " aperturas__veh--abierto" : ""}`}>
      <button type="button" className="aperturas__veh-cab" onClick={onAbrir} aria-expanded={abierto}>
        <span className="aperturas__veh-n">{v.aperturas}</span>
        <span className="aperturas__veh-txt">
          <b>{v.titulo}</b>
          {!v.identificado && <span className="tc-etq"> sin identificar</span>}
          <span className="ds-nota"> {vehiculoDe(r0)}</span>
          <span className="aperturas__veh-meta">
            Última: {fechaHora(v.ultima)} · {v.puertas.map(tituloPuerta).join(", ")}
            {" · "}{v.motivos.slice(0, 2).map((m) => `${rotuloMotivo(m.clase, m.motivo)} (${m.n})`).join(", ")}
            {v.sinAcceso > 0 && <b className="aperturas__alerta"> · {v.sinAcceso} sin acceso</b>}
          </span>
        </span>
      </button>
      {abierto && (
        <div className="aperturas__veh-det">
          {liga && sinLigar.length > 0 && (
            <button type="button" className="ghost-action ghost-action--chico" onClick={() => onLigar(sinLigar)}>
              Ligar {sinLigar.length === 1 ? "esta apertura" : `las ${sinLigar.length}`} a un expediente…
            </button>
          )}
          <TablaBitacora items={v.items} liga={false} onLigar={() => {}} />
        </div>
      )}
    </li>
  );
}

function TablaBitacora({ items, liga, onLigar }: { items: ReporteCaseta[]; liga: boolean; onLigar: (r: ReporteCaseta) => void }) {
  return (
    <div className="aperturas__scroll">
      <table className="aperturas__tabla aperturas__tabla--ancha">
        <thead>
          <tr><th>Fecha y hora</th><th>Puerta</th><th>Vehículo</th><th>Motivo</th><th>La pantalla decía</th><th>Reportó</th><th>Caso</th>{liga && <th />}</tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id} className={r.clase === "apertura" && r.veredicto === "no-abre" ? "aperturas__fila--alerta" : undefined}>
              <td>{fechaHora(r.hechoEn)}</td>
              <td>{tituloPuerta(r.puerta)}</td>
              <td>
                {r.nombre ? <b>{r.nombre}</b> : null} <span className="ds-nota">{vehiculoDe(r)}</span>
                {r.ligadoPor && <span className="ds-nota"> · ligada por {nombreDesdeEmail(r.ligadoPor)}</span>}
              </td>
              <td>
                {r.clase === "reporte" ? "Reporte: " : ""}{rotuloMotivo(r.clase, r.motivo)}
                {r.nota && <span className="aperturas__nota">{r.nota}</span>}
              </td>
              <td><ChipVeredicto v={r.veredicto} /></td>
              <td>{nombreDesdeEmail(r.hechoPor)}</td>
              <td className="mono">{r.casoNumero ? numeroCaso(r.casoNumero) : "—"}</td>
              {liga && (
                <td>{!r.registroId && !r.tarjeta && r.clase === "apertura" && (
                  <button type="button" className="link-action" onClick={() => onLigar(r)}>Ligar…</button>
                )}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Ligar aperturas sin identificar a un expediente. Busca en el padron de SATAG
 * (tambien a quien aun no tiene TAG: justo ese suele ser el que llega sin que la
 * pluma le abra) y sugiere el que tenga la misma placa que escribio el portero.
 */
function DialogoLigar({ reportes, onCancelar, onLigar }: {
  reportes: ReporteCaseta[];
  onCancelar: () => void;
  onLigar: (registroId: string) => Promise<void>;
}) {
  const [padron, setPadron] = useState<PadronEstacionamiento[] | null>(null);
  const [q, setQ] = useState("");
  const [elegido, setElegido] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    listPadronEstacionamiento().then(setPadron).catch((e) => { setError(e instanceof Error ? e.message : "No se pudo leer el padrón."); setPadron([]); });
  }, []);
  const placas = useMemo(() => [...new Set(reportes.map((r) => r.placaNorm).filter((p): p is string => !!p))], [reportes]);
  const sugeridos = useMemo(
    () => (padron ?? []).filter((p) => p.estado !== "baja" && placas.includes(placaNormalizada(p.placas))),
    [padron, placas],
  );
  const encontrados = useMemo(() => {
    const t = normalizarBusqueda(q);
    if (t.length < 3) return [];
    const palabras = t.split(" ");
    return (padron ?? [])
      .filter((p) => {
        const i = normalizarBusqueda([p.nombre, p.placas, p.marca, p.modelo, p.color, p.folio, p.noDispositivo].filter(Boolean).join(" ")) + " " + placaNormalizada(p.placas).toLowerCase();
        return palabras.every((w) => i.includes(w));
      })
      .sort((a, b) => Number(b.estado !== "baja") - Number(a.estado !== "baja") || a.nombre.localeCompare(b.nombre, "es"))
      .slice(0, 10);
  }, [padron, q]);
  const lista = q.trim() ? encontrados : sugeridos;

  async function confirmar() {
    if (!elegido) return;
    setOcupado(true);
    setError(null);
    try {
      await onLigar(elegido);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo ligar.");
      setOcupado(false);
    }
  }

  return (
    <div className="ds-velo" role="dialog" aria-modal="true" aria-label="Ligar a un expediente" onKeyDown={(e) => { if (e.key === "Escape") onCancelar(); }}>
      <div className="ds-form panel">
        <p className="panel-title">Ligar {reportes.length === 1 ? "la apertura" : `${reportes.length} aperturas`} a un expediente</p>
        <p className="ti-hint">
          La caseta escribió: {[...placas, ...reportes.map((r) => r.vehiculoTexto).filter(Boolean)].join(" · ") || "sin placa"}.
          Al ligarla cuenta en el vehículo de esa persona y abre o suma a su caso «Abierta con el botón».
        </p>
        <input className="input search" type="search" autoFocus value={q} onChange={(e) => { setQ(e.target.value); setElegido(null); }} placeholder="Nombre, placa, modelo, folio o TAG" />
        {padron === null && <p className="ti-hint">Leyendo el padrón…</p>}
        {!q.trim() && sugeridos.length > 0 && <p className="ds-rotulo">Con la misma placa</p>}
        <ul className="aperturas__candidatos">
          {lista.map((p) => (
            <li key={p.id}>
              <label className={elegido === p.id ? "on" : undefined}>
                <input type="radio" name="ligar" checked={elegido === p.id} onChange={() => setElegido(p.id)} />
                <b>{p.nombre}</b> <span className="ds-nota">{[p.placas, textoVehiculo(p), p.folio, p.estado === "baja" ? "dado de baja" : null].filter(Boolean).join(" · ")}</span>
              </label>
            </li>
          ))}
        </ul>
        {q.trim().length >= 3 && padron && !encontrados.length && <p className="ti-hint">Nadie en el padrón con eso.</p>}
        {error && <p className="submit-error" role="alert">{error}</p>}
        <div className="ds-acciones">
          <button type="button" className="primary-action" disabled={!elegido || ocupado} onClick={confirmar}>{ocupado ? "Ligando…" : "Ligar"}</button>
          <button type="button" className="ghost-action" onClick={onCancelar} disabled={ocupado}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

/**
 * En la ficha de la persona: las veces que la caseta le abrio con el boton (por su
 * expediente o cualquiera de sus TAGs). Si nunca, la seccion no aparece.
 */
export function AperturasDePersona({ registroId, tarjetas }: { registroId: string; tarjetas: string[] }) {
  const [items, setItems] = useState<ReporteCaseta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clave = tarjetas.join(",");
  useEffect(() => {
    let vivo = true;
    setItems(null);
    listReportesCaseta({ registroId, tarjetas: clave ? clave.split(",") : [] })
      .then((r) => { if (vivo) { setItems(r); setError(null); } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : "No se pudo leer la bitácora de la caseta."); setItems([]); } });
    return () => { vivo = false; };
  }, [registroId, clave]);
  if (error) return <section className="ficha__bloque"><h3>Aperturas con botón</h3><p className="submit-error" role="alert">{error}</p></section>;
  if (!items || items.length === 0) return null;
  const aperturas = items.filter((r) => r.clase === "apertura").length;
  return (
    <section className="ficha__bloque">
      <h3>Aperturas con botón <span className="ds-nota">({aperturas})</span></h3>
      <TablaBitacora items={items.slice(0, 20)} liga={false} onLigar={() => {}} />
      {items.length > 20 && <p className="ti-hint">Y {items.length - 20} más en Estacionamiento › Aperturas con botón.</p>}
    </section>
  );
}
