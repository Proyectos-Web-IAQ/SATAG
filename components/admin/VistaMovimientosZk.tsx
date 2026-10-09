"use client";

// Datos › Movimientos en ZK (bloque 93): lo que hay que hacer en ZK por cada caso,
// en tandas, y si ZK ya lo refleja.
//
// EL FLUJO (probado en ZK el 9-oct, Campo/01 - Puente SATAG-ZKBioSecurity.md):
//   1. Los casos abiertos que piden algo en ZK se vuelven movimientos («Buscar en
//      los casos»). El destino se puede cambiar: la nota del caso puede decir otra
//      cosa que su titulo.
//   2. Se eligen y se arma una TANDA: SATAG descarga UN archivo para el importador
//      de ZK (cambia departamento y nombre, conserva el ID) y dice que pasos dar
//      en ZK por cada departamento destino.
//   3. TI palomea los pasos. Con el ultimo, sus casos se cierran «Hecho en ZK».
//   4. Al subir Usuarios y los cuatro «Personal de Apertura» en Archivos de ZK,
//      SATAG comprueba cada movimiento; lo que no coincide reabre su caso.

import { useEffect, useMemo, useState } from "react";
import Loader from "@/components/Loader";
import { numeroCaso } from "@/lib/casosRegistro";
import { fecha, fechaHora } from "@/lib/formato";
import { filasDeTanda, nombreNivel, ROTULO_MOVIMIENTO, type RenglonTanda } from "@/lib/zk/movimientos";
import { descargarArchivo, fechaArchivo, generarXlsxZk } from "@/lib/zk/plantillaZk";
import {
  ajustarMovimientoZk,
  cancelarTandaZk,
  crearTandaZk,
  generarMovimientosZk,
  guardarDepartamentoZk,
  listDepartamentosZk,
  listMovimientosDeCaso,
  listMovimientosZk,
  listPadronDeTarjetas,
  listTandasZk,
  marcarPasoTandaZk,
  pedirMovimientoZk,
  type DepartamentoZk,
  type MovimientoZk,
  type TandaZk,
} from "@/lib/supabase/apiPanel";

const n = (x: number) => x.toLocaleString("es-MX");
const PENDIENTE = new Set(["pendiente", "no_coincide"]);

/** El paso que toca en ZK a un departamento destino, en una frase corta. */
function pasoDe(d: DepartamentoZk | undefined): string {
  if (!d) return "";
  return d.niveles.length === 0
    ? "Sin niveles: en ZK se le agregan todos y se le quitan, de corrido."
    : `Con ${d.niveles.map(nombreNivel).join(" y ")}: en ZK se quitan y se vuelven a poner.`;
}

async function descargarTanda(numero: number, renglones: RenglonTanda[]) {
  const blob = await generarXlsxZk(filasDeTanda(renglones));
  descargarArchivo(blob, `zk-tanda-${numero}-${fechaArchivo()}.xlsx`);
}

/**
 * En el detalle de un caso: en que va lo que pidio hacer en ZK y, para TI, pedir o
 * cambiar esa accion (bloque 94), tambien con el caso ya cerrado. Sin movimientos y
 * sin poder pedir, no se muestra nada.
 */
export function EnZkDelCaso({ casoId, conTag, puedePedir, email }: { casoId: string; conTag: boolean; puedePedir: boolean; email: string | null }) {
  const [movs, setMovs] = useState<Awaited<ReturnType<typeof listMovimientosDeCaso>>>([]);
  const [deptos, setDeptos] = useState<DepartamentoZk[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [accion, setAccion] = useState<{ que: "departamento" | "nombre"; depto: string; nombre: string }>({ que: "departamento", depto: "", nombre: "" });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const leer = () => listMovimientosDeCaso(casoId).then(setMovs).catch(() => setMovs([]));
  useEffect(() => {
    leer();
    setAbierto(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casoId]);
  useEffect(() => {
    if (abierto && deptos.length === 0) listDepartamentosZk().then(setDeptos).catch(() => setDeptos([]));
  }, [abierto, deptos.length]);

  const pide = puedePedir && conTag;
  if (movs.length === 0 && !pide) return null;

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await pedirMovimientoZk(casoId, accion.que === "departamento" ? { que: "departamento", deptoDestino: accion.depto } : { que: "nombre", nombreDestino: accion.nombre }, email);
      setAbierto(false);
      await leer();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo pedir la acción en ZK.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="tc-qh">
      <b>En ZK</b>
      {movs.length === 0 && <div>Este caso no pide nada en ZK.</div>}
      {movs.map((m) => (
        <div key={m.id}>
          {m.que === "nombre" ? `Corregir el nombre a «${m.nombreDestino}»` : `Pasarlo a ${m.deptoNombre ?? "su departamento"}`}: {ROTULO_MOVIMIENTO[m.estado]}
          {m.detalle ? `. ${m.detalle}` : ""}
        </div>
      ))}
      {pide && !abierto && (
        <button type="button" className="link-action" onClick={() => setAbierto(true)}>Pedir acción en ZK…</button>
      )}
      {pide && abierto && (
        <div className="chip-row" style={{ alignItems: "center", marginTop: 6 }}>
          <select className="input" style={{ width: "auto" }} aria-label="Qué hacer en ZK" value={accion.que}
            onChange={(e) => setAccion((a) => ({ ...a, que: e.target.value as "departamento" | "nombre" }))}>
            <option value="departamento">Pasarlo a</option>
            <option value="nombre">Corregir el nombre a</option>
          </select>
          {accion.que === "departamento" ? (
            <select className="input" style={{ width: "auto" }} aria-label="Departamento de ZK" value={accion.depto}
              onChange={(e) => setAccion((a) => ({ ...a, depto: e.target.value }))}>
              <option value="">—</option>
              {deptos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          ) : (
            <input className="input" style={{ width: "14rem" }} aria-label="Nombre como debe quedar en ZK" value={accion.nombre}
              onChange={(e) => setAccion((a) => ({ ...a, nombre: e.target.value }))} />
          )}
          <button type="button" className="ghost-action ghost-action--chico"
            disabled={guardando || (accion.que === "departamento" ? !accion.depto : !accion.nombre.trim())} onClick={guardar}>
            Guardar
          </button>
          <button type="button" className="link-action" onClick={() => setAbierto(false)}>Cancelar</button>
        </div>
      )}
      {error && <div className="submit-error" role="alert">{error}</div>}
    </div>
  );
}

export default function VistaMovimientosZk({ email }: { email: string | null }) {
  const [movs, setMovs] = useState<MovimientoZk[] | null>(null);
  const [tandas, setTandas] = useState<TandaZk[]>([]);
  const [deptos, setDeptos] = useState<DepartamentoZk[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [nuevoDepto, setNuevoDepto] = useState<DepartamentoZk>({ id: "", nombre: "", niveles: [] });

  async function cargar() {
    try {
      const [m, t, d] = await Promise.all([listMovimientosZk(), listTandasZk(), listDepartamentosZk()]);
      setMovs(m);
      setTandas(t);
      setDeptos(d);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron leer los movimientos en ZK.");
      setMovs((x) => x ?? []);
    }
  }
  useEffect(() => {
    cargar();
  }, []);

  async function hacer(que: string, fn: () => Promise<void>) {
    setOcupado(que);
    setError(null);
    try {
      await fn();
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar.");
    } finally {
      setOcupado(null);
    }
  }

  const porId = useMemo(() => new Map(deptos.map((d) => [d.id, d])), [deptos]);
  const abierta = tandas.find((t) => t.estado === "abierta") ?? null;
  const pendientes = (movs ?? []).filter((m) => PENDIENTE.has(m.estado));
  const recientes = (movs ?? []).filter((m) => !PENDIENTE.has(m.estado)).slice(0, 200);
  const grupos = useMemo(() => {
    const g = new Map<string, MovimientoZk[]>();
    for (const m of pendientes) {
      const k = m.que === "nombre" ? "nombre" : m.deptoDestino ?? "?";
      (g.get(k) ?? g.set(k, []).get(k)!).push(m);
    }
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [pendientes]);
  const destino = (m: MovimientoZk) => (m.que === "nombre" ? `nombre «${m.nombreDestino}»` : porId.get(m.deptoDestino ?? "")?.nombre ?? m.deptoDestino ?? "—");

  if (movs === null) return <Loader label="Leyendo los movimientos en ZK…" />;

  const armar = () =>
    hacer("armar", async () => {
      const t = await crearTandaZk([...elegidos], email);
      await descargarTanda(t.numero, t.renglones);
      setElegidos(new Set());
      setAviso(`Tanda ${t.numero} abierta con ${n(t.renglones.length)} ${t.renglones.length === 1 ? "TAG" : "TAGs"}: el archivo ya se descargó. Siga los pasos de la tanda y palomee cada uno.`);
    });

  const volverADescargar = (t: TandaZk) =>
    hacer("descargar", async () => {
      const suyos = (movs ?? []).filter((m) => m.tandaId === t.id);
      const base = await listPadronDeTarjetas([...new Set(suyos.map((m) => m.tarjeta))]);
      const renglones: RenglonTanda[] = [...base.values()].map((b) => {
        const d = suyos.find((m) => m.tarjeta === b.tarjeta && m.que === "departamento");
        const nm = suyos.find((m) => m.tarjeta === b.tarjeta && m.que === "nombre");
        const dd = d ? porId.get(d.deptoDestino ?? "") : undefined;
        return { ...b, deptoId: dd?.id ?? b.deptoId, deptoNombre: dd?.nombre ?? b.deptoNombre, nombreDestino: nm?.nombreDestino ?? null };
      });
      await descargarTanda(t.numero, renglones);
    });

  return (
    <>
      <p className="titular__migas"><span>Datos</span><span>›</span><span>Movimientos en ZK</span></p>
      <h2 className="titular">
        {abierta
          ? `Tanda ${abierta.numero} abierta: ${abierta.pasos.filter((p) => !p.hecho).length} de ${abierta.pasos.length} pasos por hacer en ZK.`
          : pendientes.length
            ? `${n(pendientes.length)} ${pendientes.length === 1 ? "movimiento pendiente" : "movimientos pendientes"} en ZK.`
            : "No hay movimientos pendientes en ZK."}
      </h2>
      <p className="titular__sub">
        Lo que los casos piden hacer en ZK. Se arma una tanda, SATAG descarga un solo archivo para importarlo en ZK y dice qué
        pasos dar después; al palomear el último, los casos se cierran. Al subir Usuarios y los cuatro «Personal de Apertura»
        en Archivos de ZK, SATAG comprueba cada movimiento y reabre el caso que no coincida.
      </p>
      <div className="chip-row" style={{ marginBottom: 12 }}>
        <button type="button" className="ghost-action ghost-action--chico" disabled={ocupado !== null}
          onClick={() => hacer("buscar", async () => {
            const r = await generarMovimientosZk(email);
            setAviso(
              `${r.nuevos ? `${n(r.nuevos)} ${r.nuevos === 1 ? "movimiento nuevo" : "movimientos nuevos"}` : "Ningún movimiento nuevo"}${r.cancelados ? `; ${n(r.cancelados)} cancelados porque su caso ya se cerró` : ""}.` +
                (r.casosSinDestino.length
                  ? ` ${r.casosSinDestino.length === 1 ? "El caso" : "Los casos"} ${r.casosSinDestino.map((x) => numeroCaso(Number(x))).join(", ")} ${r.casosSinDestino.length === 1 ? "pide" : "piden"} un departamento que no está en el catálogo (por ejemplo Empleado_PPF): regístrelo abajo cuando exista en ZK y vuelva a buscar.`
                  : ""),
            );
          })}>
          Buscar movimientos en los casos
        </button>
      </div>
      {ocupado && <p className="hint" role="status">Trabajando…</p>}
      {error && <p className="submit-error" role="alert">{error}</p>}
      {aviso && <p className="notice" role="status" style={{ margin: "0 0 12px", padding: "10px 12px" }}>{aviso}</p>}

      {abierta && (
        <section className="ficha__bloque" aria-labelledby="tanda-t">
          <h3 id="tanda-t">Tanda {abierta.numero} · {fechaHora(abierta.creadaEn)} · {abierta.creadaPor}</h3>
          <ul className="actividad">
            {abierta.pasos.map((p) => (
              <li key={p.clave} style={{ gridTemplateColumns: "auto minmax(0, 1fr)" }}>
                <input type="checkbox" checked={p.hecho} disabled={ocupado !== null} aria-label={p.texto}
                  onChange={(e) => {
                    const hecho = e.target.checked;
                    // Se marca al instante; si la base no lo acepta, la recarga lo regresa.
                    setTandas((ts) => ts.map((t) => (t.id === abierta.id ? { ...t, pasos: t.pasos.map((x) => (x.clave === p.clave ? { ...x, hecho } : x)) } : t)));
                    hacer("paso", async () => {
                      const r = await marcarPasoTandaZk(abierta.id, p.clave, hecho, email);
                      if (r.hecha) setAviso(`Tanda ${abierta.numero} hecha: sus casos se cerraron con «Hecho en ZK». Para comprobarla, exporte de ZK Usuarios y los cuatro «Personal de Apertura» y súbalos en Archivos de ZK.`);
                    });
                  }} />
                <span>
                  {p.texto}
                  {p.hecho && p.hechoEn && <span className="hint"> · hecho {fechaHora(p.hechoEn)}{p.hechoPor ? ` por ${p.hechoPor}` : ""}</span>}
                </span>
              </li>
            ))}
          </ul>
          <div className="chip-row" style={{ marginTop: 10 }}>
            <button type="button" className="ghost-action ghost-action--chico" disabled={ocupado !== null} onClick={() => volverADescargar(abierta)}>
              Descargar otra vez el archivo
            </button>
            <button type="button" className="link-action" disabled={ocupado !== null}
              onClick={() => hacer("cancelar", async () => {
                await cancelarTandaZk(abierta.id, email);
                setAviso(`Tanda ${abierta.numero} cancelada: sus movimientos volvieron a pendientes. Si ya importó el archivo en ZK, no pasa nada: la siguiente tanda lo vuelve a mandar igual.`);
              })}>
              Cancelar la tanda
            </button>
          </div>
        </section>
      )}

      {grupos.length > 0 && (
        <section className="ficha__bloque">
          <h3>Pendientes{abierta ? " (se pueden elegir cuando termine la tanda abierta)" : ""}</h3>
          {grupos.map(([clave, lista]) => {
            const d = porId.get(clave);
            const elegibles = lista.filter((m) => m.enZk?.idZk);
            const todos = elegibles.length > 0 && elegibles.every((m) => elegidos.has(m.id));
            return (
              <div key={clave} style={{ marginBottom: 18 }}>
                <p style={{ margin: "10px 0 4px" }}>
                  <label>
                    {!abierta && (
                      <input type="checkbox" checked={todos} disabled={!elegibles.length || ocupado !== null}
                        onChange={() => setElegidos((s) => {
                          const x = new Set(s);
                          for (const m of elegibles) {
                            if (todos) x.delete(m.id);
                            else x.add(m.id);
                          }
                          return x;
                        })} />
                    )}{" "}
                    <strong>{clave === "nombre" ? "Corregir el nombre" : `A ${d?.nombre ?? clave}`}</strong> · {n(lista.length)}
                  </label>{" "}
                  <span className="hint">{clave === "nombre" ? "Va en el mismo archivo de importación." : pasoDe(d)}</span>
                </p>
                <div className="table-wrap">
                  <table className="tabla-tipo">
                    <thead><tr><th /><th>TAG</th><th>Hoy en ZK</th><th>Destino</th><th>Caso</th><th>Última nota</th><th /></tr></thead>
                    <tbody>
                      {lista.map((m) => (
                        <tr key={m.id}>
                          <td>
                            {!abierta && (
                              <input type="checkbox" checked={elegidos.has(m.id)} disabled={!m.enZk?.idZk || ocupado !== null}
                                title={m.enZk?.idZk ? undefined : "SATAG no conoce su ID de ZK: suba el export de Usuarios en Archivos de ZK."}
                                aria-label={`Elegir el TAG ${m.tarjeta}`}
                                onChange={() => setElegidos((s) => { const x = new Set(s); if (x.has(m.id)) x.delete(m.id); else x.add(m.id); return x; })} />
                            )}
                          </td>
                          <td className="mono">{m.tarjeta}</td>
                          <td>{m.enZk ? `${m.enZk.departamento} · ${m.enZk.nombre}` : "No está en el padrón de ZK"}</td>
                          <td>
                            {m.que === "departamento" ? (
                              <select className="input" value={m.deptoDestino ?? ""} disabled={ocupado !== null || !!abierta}
                                aria-label={`Destino del TAG ${m.tarjeta}`}
                                onChange={(e) => hacer("ajustar", () => ajustarMovimientoZk(m.id, { deptoDestino: e.target.value }, email))}>
                                {deptos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                              </select>
                            ) : `«${m.nombreDestino}»`}
                            {m.estado === "no_coincide" && <div className="aviso-ficha" style={{ marginTop: 6 }}>{m.detalle}</div>}
                          </td>
                          <td>
                            {numeroCaso(m.casoNumero)} · {m.casoTitulo}
                            {(m.casoEstado === "resuelto" || m.casoEstado === "descartado") && (
                              <div className="hint">Cerrado{m.casoCierre ? `: ${m.casoCierre}` : ""}</div>
                            )}
                          </td>
                          <td title={m.ultimaNota ? `${m.ultimaNota.por}, ${fechaHora(m.ultimaNota.en)}` : undefined}>
                            {m.ultimaNota ? m.ultimaNota.texto : "—"}
                          </td>
                          <td>
                            {!abierta && (
                              <button type="button" className="link-action" disabled={ocupado !== null}
                                onClick={() => hacer("quitar", () => ajustarMovimientoZk(m.id, { cancelar: true }, email))}>
                                Quitar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {!abierta && (
            <button type="button" className="primary-action" disabled={elegidos.size === 0 || ocupado !== null} onClick={armar}>
              Armar tanda y descargar el archivo para ZK ({n(elegidos.size)})
            </button>
          )}
        </section>
      )}

      {recientes.length > 0 && (
        <section className="ficha__bloque">
          <h3>En tanda, hechos y verificados</h3>
          <div className="table-wrap">
            <table className="tabla-tipo">
              <thead><tr><th>TAG</th><th>Destino</th><th>Estado</th><th>Detalle</th><th>Caso</th></tr></thead>
              <tbody>
                {recientes.map((m) => (
                  <tr key={m.id}>
                    <td className="mono">{m.tarjeta}</td>
                    <td>{destino(m)}</td>
                    <td>{ROTULO_MOVIMIENTO[m.estado]}</td>
                    <td>{m.detalle || "—"}</td>
                    <td>{numeroCaso(m.casoNumero)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <details className="ficha__bloque">
        <summary>Departamentos de ZK ({n(deptos.length)})</summary>
        <p className="hint">
          De aquí sale qué paso le toca a cada destino. Sin niveles (como BAJAS): agregarle todos y quitárselos. Con niveles:
          quitar y volver a poner. Registre un departamento nuevo (por ejemplo Empleado_PPF) cuando ya exista en ZK, con el
          mismo número que ZK le dio.
        </p>
        <div className="table-wrap">
          <table className="tabla-tipo">
            <thead><tr><th>Número</th><th>Nombre</th><th>Niveles</th></tr></thead>
            <tbody>
              {deptos.map((d) => (
                <tr key={d.id}><td className="mono">{d.id}</td><td>{d.nombre}</td><td>{d.niveles.length ? d.niveles.map(nombreNivel).join(", ") : "Sin niveles"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="chip-row" style={{ marginTop: 10, alignItems: "center" }}
          onSubmit={(e) => {
            e.preventDefault();
            hacer("depto", async () => {
              await guardarDepartamentoZk(nuevoDepto, email);
              setAviso(`Departamento ${nuevoDepto.nombre} (${nuevoDepto.id}) guardado. Pulse «Buscar movimientos en los casos» para generar los que lo pedían.`);
              setNuevoDepto({ id: "", nombre: "", niveles: [] });
            });
          }}>
          <input className="input" style={{ width: "6rem" }} placeholder="Número" aria-label="Número del departamento en ZK" value={nuevoDepto.id}
            onChange={(e) => setNuevoDepto((d) => ({ ...d, id: e.target.value.replace(/\D/g, "") }))} />
          <input className="input" style={{ width: "14rem" }} placeholder="Nombre como en ZK" aria-label="Nombre del departamento en ZK" value={nuevoDepto.nombre}
            onChange={(e) => setNuevoDepto((d) => ({ ...d, nombre: e.target.value }))} />
          {["E1", "E2"].map((nv) => (
            <label key={nv}>
              <input type="checkbox" checked={nuevoDepto.niveles.includes(nv)}
                onChange={() => setNuevoDepto((d) => ({ ...d, niveles: d.niveles.includes(nv) ? d.niveles.filter((x) => x !== nv) : [...d.niveles, nv] }))} />{" "}
              {nombreNivel(nv)}
            </label>
          ))}
          <button type="submit" className="ghost-action ghost-action--chico" disabled={!nuevoDepto.id || !nuevoDepto.nombre.trim() || ocupado !== null}>
            Guardar departamento
          </button>
        </form>
      </details>

      {tandas.filter((t) => t.estado !== "abierta").length > 0 && (
        <p className="hint" style={{ marginTop: 16 }}>
          Tandas anteriores:{" "}
          {tandas.filter((t) => t.estado !== "abierta").map((t) => `${t.numero} (${t.estado === "hecha" ? `hecha ${fecha(t.hechaEn)}` : "cancelada"})`).join(", ")}.
        </p>
      )}
    </>
  );
}
