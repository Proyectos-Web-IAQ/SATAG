"use client";

// Estacionamiento › Lecturas por hora (9-oct-2026, Gerardo): que TAG leyo cada
// pluma en un rango de hora, con la persona de cada uno y sus casos vivos. Para
// encontrar casos: «el jueves a las 14:17 abrió alguien que no conocemos».
//
// Lee la bitacora GUARDADA en SATAG (zk_eventos, bloque 78), no la que la
// pestana ya bajo: esa solo trae las ultimas semanas y aqui se busca cualquier dia.
// La RLS la deja leer a ti, contador y super, los mismos que ven Estacionamiento.

import { useMemo, useState } from "react";
import type { ExpedienteTag } from "@/components/admin/casos/GraficasCaso";
import { estaVivo, numeroCaso, type CasoGuardado } from "@/lib/casosRegistro";
import { diaDe, fechaHora } from "@/lib/formato";
import { ESTADO_EXPEDIENTE, GLOSARIO } from "@/lib/glosario";
import { listCasos, listLecturasZk, type LecturaZk } from "@/lib/supabase/apiPanel";
import type { PersonaZk } from "@/lib/zk/padron";
import { distanciaSeg, rangoDeBusqueda, ultimoMinuto } from "@/lib/zk/lecturas";

const MARGENES = [0, 5, 15, 30, 60];

export default function LecturasZk({ personas, expedientes, ultimaHasta }: {
  personas: Map<string, PersonaZk> | null;
  expedientes: Map<string, ExpedienteTag>;
  /** Hasta donde llega la bitacora guardada (hora de pared). */
  ultimaHasta: string | null;
}) {
  const ultimoDia = diaDe(ultimaHasta);
  const [dia, setDia] = useState(ultimoDia ?? "");
  const [hora, setHora] = useState("");
  const [margen, setMargen] = useState(15);
  const [lote, setLote] = useState("");
  const [soloRechazos, setSoloRechazos] = useState(false);
  const [conRepeticiones, setConRepeticiones] = useState(false);
  const [resultado, setResultado] = useState<{ lecturas: LecturaZk[]; truncado: boolean; dia: string; hora: string; desde: string; hasta: string } | null>(null);
  const [casos, setCasos] = useState<CasoGuardado[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rango = rangoDeBusqueda(dia, hora, margen);

  async function buscar() {
    if (!rango) return;
    setBuscando(true);
    setError(null);
    try {
      const [r, c] = await Promise.all([
        listLecturasZk(rango.desde, rango.hasta, lote || null),
        casos ? Promise.resolve(casos) : listCasos().catch(() => [] as CasoGuardado[]),
      ]);
      setCasos(c);
      setResultado({ ...r, dia, hora, ...rango });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la bitácora guardada.");
    } finally {
      setBuscando(false);
    }
  }

  // Los casos vivos de cada TAG, para que la lista diga de una vez si ya hay caso.
  const casosPorTag = useMemo(() => {
    const m = new Map<string, CasoGuardado[]>();
    for (const c of casos ?? []) if (c.tarjeta && estaVivo(c.estado)) m.set(c.tarjeta, [...(m.get(c.tarjeta) ?? []), c]);
    return m;
  }, [casos]);

  const visibles = useMemo(() => {
    const l = (resultado?.lecturas ?? []).filter((x) => (conRepeticiones || !x.repeticion) && (!soloRechazos || !x.concedido));
    return l;
  }, [resultado, conRepeticiones, soloRechazos]);

  // La lectura mas cercana a la hora buscada: la que casi siempre se esta buscando.
  const cercana = useMemo(() => {
    if (!resultado?.hora || !visibles.length) return null;
    return visibles.reduce((a, b) => (distanciaSeg(b.ocurrioEn, resultado.dia, resultado.hora) < distanciaSeg(a.ocurrioEn, resultado.dia, resultado.hora) ? b : a)).idEvento;
  }, [visibles, resultado]);

  const tags = new Set(visibles.map((x) => x.tarjeta)).size;

  return (
    <>
      <p className="titular__migas"><span>Estacionamiento</span><span>›</span><span>Lecturas por hora</span></p>
      <h2 className="titular">
        {resultado
          ? `${visibles.length.toLocaleString("es-MX")} ${visibles.length === 1 ? "lectura" : "lecturas"} de ${tags.toLocaleString("es-MX")} ${tags === 1 ? "TAG" : "TAGs"}.`
          : "¿Qué TAG pasó a cierta hora?"}
      </h2>
      <p className="titular__sub">
        Ponga el día y la hora en que pasó algo y SATAG le dice qué TAG leyó cada pluma, de quién es y si ya tiene un caso
        abierto. Es la hora del reloj de las plumas, la misma que la bitácora de ZK.
        {ultimaHasta && <> La bitácora guardada llega hasta el <strong>{fechaHora(ultimaHasta)}</strong>: lo que pasó después aparece cuando TI suba el siguiente «{GLOSARIO.todosLosEventos.ui}».</>}
      </p>

      <form className="lecturas__forma" onSubmit={(e) => { e.preventDefault(); buscar(); }}>
        <label className="label">Día<input className="input" type="date" value={dia} onChange={(e) => setDia(e.target.value)} /></label>
        <label className="label">Hora (opcional)<input className="input" type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></label>
        <label className="label">Margen
          <select className="input" value={margen} disabled={!hora} onChange={(e) => setMargen(Number(e.target.value))}>
            {MARGENES.map((m) => <option key={m} value={m}>{m === 0 ? "Solo ese minuto" : `± ${m} min`}</option>)}
          </select>
        </label>
        <label className="label">Pluma
          <select className="input" value={lote} onChange={(e) => setLote(e.target.value)}>
            <option value="">Las dos</option>
            <option value="E1">E1</option>
            <option value="E2">E2</option>
          </select>
        </label>
        <button type="submit" className="primary-action" disabled={!rango || buscando}>{buscando ? "Buscando…" : "Buscar"}</button>
      </form>
      {!rango && dia && <p className="ti-hint" role="status">Escriba la hora como 14:17, o déjela vacía para ver el día completo.</p>}
      {error && <p className="submit-error" role="alert">{error}</p>}

      {resultado && (
        <section className="ficha__bloque" aria-label="Lecturas">
          <p className="lecturas__filtros">
            <span>Del {fechaHora(resultado.desde)} al {fechaHora(ultimoMinuto(resultado.hasta))}{lote ? ` · solo ${lote}` : ""}.</span>
            <label><input type="checkbox" checked={soloRechazos} onChange={(e) => setSoloRechazos(e.target.checked)} /> Solo rechazos</label>
            <label><input type="checkbox" checked={conRepeticiones} onChange={(e) => setConRepeticiones(e.target.checked)} /> Con lecturas repetidas del lector</label>
          </p>
          {resultado.truncado && <p className="ti-hint" role="status">Son demasiadas lecturas: se muestran las primeras 2,000. Ponga una hora o elija una pluma para acotar.</p>}
          {visibles.length === 0 ? (
            <p className="ti-empty">
              Ninguna pluma leyó un TAG en ese rango{soloRechazos ? " con rechazo" : ""}.
              {ultimaHasta && rango && resultado.desde > ultimaHasta ? " La bitácora guardada todavía no llega a esa hora." : ""}
            </p>
          ) : (
            <div className="table-wrap">
              <table className="tabla-tipo lecturas__tabla">
                <thead><tr><th>Hora</th><th>Pluma</th><th>Resultado</th><th>TAG</th><th>En ZK</th><th>Departamento ese día</th><th>En SATAG</th><th>Casos vivos</th></tr></thead>
                <tbody>
                  {visibles.map((x) => {
                    const zk = personas?.get(x.tarjeta);
                    const exp = expedientes.get(x.tarjeta);
                    const cs = casosPorTag.get(x.tarjeta) ?? [];
                    return (
                      <tr key={x.idEvento} className={`${x.idEvento === cercana ? "lecturas__cerca" : ""}${x.repeticion ? " lecturas__rep" : ""}`}>
                        <td className="mono">{x.ocurrioEn.slice(11, 19)}{x.idEvento === cercana && <span className="lecturas__marca"> ← la más cercana</span>}</td>
                        <td className="lecturas__pluma">{x.lote} · {x.sentido}</td>
                        <td className={x.concedido ? undefined : "lecturas__rechazo"}>{x.repeticion ? "Lectura repetida" : x.concedido ? "Abrió" : "La rechazó"}</td>
                        <td className="mono">{x.tarjeta}</td>
                        <td>{zk ? (zk.nombre || <em>Sin nombre en ZK</em>) : <em>No está en el padrón de ZK</em>}</td>
                        <td>{x.departamentoEvento || "—"}</td>
                        <td>
                          {exp ? (
                            <>
                              {exp.folio} · {(ESTADO_EXPEDIENTE as Record<string, string>)[exp.estado] ?? exp.estado}
                              {exp.anterior && " · era su TAG anterior"}
                              {(exp.vehiculo || exp.placas) && <span className="hint"><br />{[exp.vehiculo, exp.placas].filter(Boolean).join(" · ")}</span>}
                            </>
                          ) : <em>Sin expediente</em>}
                        </td>
                        <td>{cs.length ? cs.map((c) => numeroCaso(c.numero)).join(", ") : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
