"use client";

// La ficha de persona: todo lo de un expediente en una pagina (DISEÑO.md §3.4).
//
// POR QUE EXISTE. Hasta octubre de 2026 lo que se sabia de una persona estaba
// repartido: su expediente en Consulta, su TAG y sus plumas en TI, y sus pasos por la
// pluma en la pestana Estacionamiento, sin nombre. Aqui se junta, con una anatomia
// fija: arriba la identidad, al lado los datos y lo que no cuadra, abajo lo
// relacionado —TAGs, vehiculo, pasos de la semana, actividad— en tablas sin cajas.
//
// LOS PASOS SON LA NOVEDAD. Salen de `zk_eventos` (bloque 78), emparejados con la
// misma funcion que usa la pestana Estacionamiento, asi que una estancia aqui y una
// estancia alla son la misma cosa. Solo los lee quien lee esa tabla: ti, contador y
// super. A Consulta se le dice, no se le dibuja una semana vacia.
//
// UN EXPEDIENTE ES UN VEHICULO CON UN TAG. Por eso la ficha es de un expediente y no
// de una familia: lo que si se enlaza son los expedientes con los mismos apellidos de
// familia, en «Datos», para ir de uno a otro.

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import type { AreaAdmin, NombrePersona, Registro } from "@/lib/mock/types";
import type { RolPanel } from "@/lib/supabase/auth";
import {
  altaDesdeZkTarjeta,
  asignarAreaAdmin,
  corregirNombre,
  deptosZkDeTarjetas,
  leerNombreParaCorregir,
  listLecturasDeTarjetas,
  listPasosDeTarjetas,
  reactivarExpediente,
  type LecturaDeTag,
  type NombreCorregido,
  type PasoZk,
  type PersonaZkConsulta,
} from "@/lib/supabase/apiPanel";
import { numeroCaso } from "@/lib/casosRegistro";
import { emparejarEstancias, horaCorta, type Estancia } from "@/lib/estacionamiento";
import type { EventoZk } from "@/lib/zk/eventos";
import { salidasDelVehiculo, type SalidaVehiculo } from "@/lib/zk/alReves";
import { GRUPO_INSTITUCIONAL, grupoDeDepto, nombreDepto } from "@/lib/zk/padron";
import { DetalleRegistro } from "@/components/admin/RegistroCard";
import { ESTADO_EXPEDIENTE, ROTULO, rotuloExpediente, TIPO_PERSONA, textoPlumas } from "@/lib/glosario";
import { textoVehiculo } from "@/lib/vehiculo";
import EvidenciaFirmaPanel from "@/components/admin/EvidenciaFirma";
import { AvisoPreguntar, SeccionCasos, VEN_CASOS, useCasosDePersona } from "@/components/admin/CasosDePersona";
import { AperturasDePersona } from "@/components/admin/AperturasCaseta";
import IdentificacionGes from "@/components/admin/IdentificacionGes";
import VistaTi from "@/components/admin/VistaTi";
import { diaSemana, fecha } from "@/lib/formato";

/** Quien lee `zk_eventos` segun la RLS del bloque 78. */
const VEN_PASOS: RolPanel[] = ["ti", "contador", "super"];

const ORIGEN_LABEL: Record<Registro["origenExpediente"], string> = {
  satag: "Alta en SATAG",
  migracion_hoja: "Migrado de la hoja histórica",
  migracion_zk: "Migrado del control de acceso",
};

/** «2026-09-22» o una fecha ISO con hora a «22/09/2026». Lo que no sea fecha, tal cual. */
function fechaCorta(v: string | null | undefined): string {
  return fecha(v);
}

/** «mar 22 sep», en hora local, para las filas de la semana. */
function diaLegible(dia: string): string {
  return diaSemana(dia);
}

/** Los TAGs que ha tenido el expediente: el vigente primero y los anteriores despues. */
function tagsDe(r: Registro): { numero: string; estado: string; desde: string; vigente: boolean }[] {
  const out: { numero: string; estado: string; desde: string; vigente: boolean }[] = [];
  if (r.noDispositivo) {
    out.push({
      numero: r.noDispositivo,
      estado: r.estado === "baja" ? `${ESTADO_EXPEDIENTE.baja}${r.fechaBaja ? ` el ${fechaCorta(r.fechaBaja)}` : ""}` : "Vigente",
      desde: fechaCorta(r.fechaInstalacion ?? r.createdAt),
      vigente: r.estado !== "baja",
    });
  }
  if (r.tagApartado && r.tagApartadoNo) {
    out.push({ numero: r.tagApartadoNo, estado: "Apartado por la escuela", desde: "—", vigente: false });
  }
  for (const m of r.movimientos) {
    if (m.noDispositivoAnterior && m.noDispositivoAnterior !== r.noDispositivo && !out.some((t) => t.numero === m.noDispositivoAnterior)) {
      out.push({
        numero: m.noDispositivoAnterior,
        estado: `${m.tipo === "reposicion" ? "Repuesto" : "Cambiado"} el ${fechaCorta(m.fecha)}`,
        desde: "—",
        vigente: false,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ los pasos */

const DESDE = 6 * 60, HASTA = 20 * 60;

/**
 * Entradas y salidas de los ultimos dias, una fila por dia, cada estancia como una
 * barra de la entrada a la salida. Es la forma de Priestley: se ve de un vistazo
 * quien deja y arranca y quien se queda la jornada, sin leer una tabla de eventos.
 */
export function PasosSemana({ estancias }: { estancias: Estancia[] }) {
  const dias = [...new Set(estancias.map((e) => e.dia))].sort().slice(-7);
  if (dias.length === 0) return <p className="ficha__vacio">Sin pasos registrados en las ventanas cargadas.</p>;
  const w = 640, filaH = 30, arriba = 22, izq = 66, der = 26;
  const alto = arriba + dias.length * filaH + 8;
  const x = (m: number) => izq + ((Math.min(HASTA, Math.max(DESDE, m)) - DESDE) / (HASTA - DESDE)) * (w - izq - der);
  const horas: number[] = [];
  for (let m = DESDE; m <= HASTA; m += 120) horas.push(m);
  const texto = dias
    .map((d) => `${diaLegible(d)}: ${estancias.filter((e) => e.dia === d).map((e) => `${e.lote} de ${horaCorta(e.entro)} a ${horaCorta(e.entro + e.dur)}`).join(", ") || "no entró"}`)
    .join(". ");
  return (
    <div className="pasos">
      <div className="viz-scroll">
        <svg viewBox={`0 0 ${w} ${alto}`} role="img" aria-label={`Entradas y salidas por día. ${texto}.`}>
          {horas.map((m) => (
            <g key={m}>
              <line className="viz-reja" x1={x(m)} x2={x(m)} y1={arriba - 6} y2={alto - 6} />
              <text className="viz-marca" x={x(m)} y={12} textAnchor="middle">{horaCorta(m)}</text>
            </g>
          ))}
          {dias.map((d, i) => {
            const y = arriba + i * filaH;
            const del = estancias.filter((e) => e.dia === d).sort((a, b) => a.entro - b.entro);
            return (
              <g key={d}>
                <text className="viz-fila" x={0} y={y + 14}>{diaLegible(d)}</text>
                {del.length === 0 && <text className="viz-marca" x={izq} y={y + 14}>No entró</text>}
                {del.map((e, j) => {
                  const x1 = x(e.entro), x2 = Math.max(x(e.entro + e.dur), x1 + 3);
                  // «izquierda»: se leyo la SALIDA y no la entrada; el inicio de la barra
                  // es supuesto (arranque de la franja) y lo desconocido es la entrada.
                  const sinEntrada = e.censura === "izquierda";
                  const desde = sinEntrada ? "?" : horaCorta(e.entro);
                  const hasta = e.censura === null || sinEntrada ? horaCorta(e.entro + e.dur) : "?";
                  const fin = e.censura === null ? `salió ${hasta}` : sinEntrada ? `salió ${hasta} · entrada no leída` : "sin salida leída";
                  // El rotulo va a la derecha de la barra si cabe antes de la siguiente
                  // y antes del borde; si no, queda en el title.
                  const sig = del[j + 1];
                  const cabe = x2 + 100 < (sig ? x(sig.entro) : w - der + 100) && x2 + 96 < w;
                  return (
                    <g key={j}>
                      <rect className={`pasos__barra${e.lote === "E1" ? " pasos__barra--e1" : ""}${e.censura !== null ? " pasos__barra--abierta" : ""}`}
                        x={x1.toFixed(1)} y={y + 4} width={(x2 - x1).toFixed(1)} height={12} rx={2}>
                        <title>{sinEntrada ? `${e.lote} · ${fin}` : `${e.lote} · entró ${desde} · ${fin}`}</title>
                      </rect>
                      {cabe && (
                        <text className="viz-marca" x={x2 + 5} y={y + 14}>{e.lote} {desde}–{hasta}</text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="pasos__nota">Azul: E2. Verde: E1. Cada barra va de la entrada a la salida; la punteada tiene un extremo sin leer: «?» al final es una entrada sin salida leída, y «?» al principio es una salida sin entrada leída (la barra arranca a la izquierda solo para dibujarla).</p>
    </div>
  );
}

/**
 * Para los vehiculos del Instituto (13-oct): una barra por SALIDA, de que salio a
 * que volvio. Lo demas del dia estuvo dentro. Misma reja que `PasosSemana`.
 */
export function SalidasSemana({ salidas }: { salidas: SalidaVehiculo[] }) {
  const dias = [...new Set(salidas.map((s) => s.dia))].sort().slice(-7);
  if (dias.length === 0) return <p className="ficha__vacio">Sin salidas registradas en las ventanas cargadas.</p>;
  const w = 640, filaH = 30, arriba = 22, izq = 66, der = 26;
  const alto = arriba + dias.length * filaH + 8;
  const x = (m: number) => izq + ((Math.min(HASTA, Math.max(DESDE, m)) - DESDE) / (HASTA - DESDE)) * (w - izq - der);
  const horas: number[] = [];
  for (let m = DESDE; m <= HASTA; m += 120) horas.push(m);
  const rotulo = (s: SalidaVehiculo) =>
    `${s.salio ? `salió ${horaCorta(s.salio.minuto)} por ${s.salio.lote}` : "salida no leída"} · ${s.volvio ? `volvió ${horaCorta(s.volvio.minuto)} por ${s.volvio.lote}` : "regreso no leído"}`;
  const texto = dias.map((d) => `${diaLegible(d)}: ${salidas.filter((s) => s.dia === d).map(rotulo).join("; ")}`).join(". ");
  return (
    <div className="pasos">
      <div className="viz-scroll">
        <svg viewBox={`0 0 ${w} ${alto}`} role="img" aria-label={`Salidas del vehículo por día. ${texto}.`}>
          {horas.map((m) => (
            <g key={m}>
              <line className="viz-reja" x1={x(m)} x2={x(m)} y1={arriba - 6} y2={alto - 6} />
              <text className="viz-marca" x={x(m)} y={12} textAnchor="middle">{horaCorta(m)}</text>
            </g>
          ))}
          {dias.map((d, i) => {
            const y = arriba + i * filaH;
            const del = salidas.filter((s) => s.dia === d);
            return (
              <g key={d}>
                <text className="viz-fila" x={0} y={y + 14}>{diaLegible(d)}</text>
                {del.map((s, j) => {
                  const x1 = x(s.salio?.minuto ?? DESDE), x2 = Math.max(x(s.volvio?.minuto ?? HASTA), x1 + 3);
                  const lote = s.salio?.lote ?? s.volvio?.lote;
                  const sig = del[j + 1];
                  const cabe = x2 + 70 < (sig ? x(sig.salio?.minuto ?? DESDE) : w - der + 70) && x2 + 66 < w;
                  return (
                    <g key={j}>
                      <rect className={`pasos__barra${lote === "E1" ? " pasos__barra--e1" : ""}${!s.salio || !s.volvio ? " pasos__barra--abierta" : ""}`}
                        x={x1.toFixed(1)} y={y + 4} width={(x2 - x1).toFixed(1)} height={12} rx={2}>
                        <title>{rotulo(s)}</title>
                      </rect>
                      {cabe && (
                        <text className="viz-marca" x={x2 + 5} y={y + 14}>
                          {s.salio ? horaCorta(s.salio.minuto) : "?"}–{s.volvio ? horaCorta(s.volvio.minuto) : "?"}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="pasos__nota">Vehículo del Instituto: duerme dentro, sale y regresa. Cada barra es una salida, de que salió a que volvió; lo demás del día estuvo dentro. Azul: salió por E2. Verde: por E1. La punteada tiene un extremo sin leer («?»).</p>
    </div>
  );
}

/* ------------------------------------------------------------------ las lecturas */

/** «jue 16 oct 08:10:41»: los rechazos se cruzan al segundo con el boton y la caseta. */
const momento = (pared: string) => `${diaSemana(pared)} ${pared.slice(11, 19)}`;

/**
 * Lo que leyo la pluma de sus TAGs, abriera o no (Gerardo, 16-oct: «a que hora la
 * rechaza la pluma»). Las barras de arriba solo dibujan lo que abrio; aqui el
 * rechazo se ve con su hora y su puerta.
 */
function LecturasDeTags({ tarjetas, rol }: { tarjetas: string[]; rol: RolPanel }) {
  const puede = VEN_PASOS.includes(rol);
  const clave = tarjetas.join(",");
  const [estado, setEstado] = useState<{ para: string; lecturas: LecturaDeTag[]; error: string | null }>({ para: "", lecturas: [], error: null });
  useEffect(() => {
    if (!puede || !clave) return;
    let vivo = true;
    listLecturasDeTarjetas(clave.split(","))
      .then((l) => vivo && setEstado({ para: clave, lecturas: l, error: null }))
      .catch((e: unknown) => vivo && setEstado({ para: clave, lecturas: [], error: e instanceof Error ? e.message : "No se pudo leer la bitácora." }));
    return () => { vivo = false; };
  }, [clave, puede]);
  if (!puede || !clave) return null;
  const listo = estado.para === clave;
  const rechazos = listo ? estado.lecturas.filter((l) => !l.concedido).length : 0;
  const varios = tarjetas.length > 1;
  return (
    <section className="ficha__bloque">
      <h3>Lecturas de la pluma{listo && estado.lecturas.length > 0 ? <span className="ds-nota"> ({rechazos} {rechazos === 1 ? "rechazo" : "rechazos"} en las últimas {estado.lecturas.length})</span> : null}</h3>
      {!listo ? (
        <p className="ficha__vacio">Leyendo la bitácora…</p>
      ) : estado.error ? (
        <p className="submit-error" role="alert">{estado.error}</p>
      ) : estado.lecturas.length === 0 ? (
        <p className="ficha__vacio">La pluma no ha leído {varios ? "estos TAGs" : "este TAG"} en las ventanas cargadas.</p>
      ) : (
        <div className="table-wrap">
          <table className="tabla-tipo">
            <thead><tr><th>Cuándo</th><th>Puerta</th><th>Pluma</th>{varios && <th>TAG</th>}</tr></thead>
            <tbody>
              {estado.lecturas.slice(0, 30).map((l, i) => (
                <tr key={i}>
                  <td className="mono">{momento(l.ocurrioEn)}</td>
                  <td>{l.lote} · {l.sentido}</td>
                  <td>{l.concedido ? "Abrió" : <b>Rechazó</b>}</td>
                  {varios && <td className="mono">{l.tarjeta}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {listo && estado.lecturas.length > 30 && <p className="ti-hint">Se muestran las 30 más recientes. El resto, en Estacionamiento › Lecturas por hora.</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ los pasos de unos TAGs */

type EstadoPasos = { para: string; estancias: Estancia[]; error: string | null; cargando: boolean; salidas?: SalidaVehiculo[] };

/**
 * Las estancias de unos TAGs, o sus salidas si ZK los tiene como vehiculo del
 * Instituto. `para` es la llave de la ficha: lo que llega tarde de otra no se pinta.
 */
function usePasos(para: string, numeros: string[], puede: boolean): EstadoPasos {
  const [pasos, setPasos] = useState<EstadoPasos>({ para: "", estancias: [], error: null, cargando: false });
  const clave = numeros.join(",");
  useEffect(() => {
    if (!puede) return;
    const numeros = clave ? clave.split(",") : [];
    if (numeros.length === 0) {
      setPasos({ para, estancias: [], error: null, cargando: false });
      return;
    }
    let vivo = true;
    setPasos({ para, estancias: [], error: null, cargando: true });
    // 13-oct: si ZK lo tiene en INSTITUCIONALES, se dibujan sus salidas y no sus estancias.
    Promise.all([listPasosDeTarjetas(numeros), deptosZkDeTarjetas(numeros).catch(() => new Map<string, { departamentoId: string; departamento: string }>())])
      .then(([p, deptos]) => {
        const alReves = numeros.some((t) => {
          const d = deptos.get(t);
          return d !== undefined && grupoDeDepto(d.departamentoId, d.departamento) === GRUPO_INSTITUCIONAL;
        });
        if (!vivo) return;
        const eventos: EventoZk[] = p.map((e: PasoZk) => ({
          idEvento: e.idEvento,
          ocurrioEn: e.ocurrioEn.replace("T", " ").slice(0, 19),
          lote: e.lote as EventoZk["lote"],
          sentido: e.sentido,
          tarjeta: e.tarjeta,
          descripcion: "",
          concedido: true,
          departamentoEvento: "",
          repeticion: false,
        }));
        setPasos({
          para,
          estancias: emparejarEstancias(eventos, undefined, null, null, () => alReves).estancias,
          error: null,
          cargando: false,
          salidas: alReves ? salidasDelVehiculo(eventos) : undefined,
        });
      })
      .catch((err: unknown) => {
        if (!vivo) return;
        setPasos({ para, estancias: [], error: err instanceof Error ? err.message : "No se pudieron leer los pasos.", cargando: false });
      });
    return () => { vivo = false; };
  }, [para, clave, puede]);
  return pasos;
}

/** Entradas y salidas, o salidas y regresos: la misma seccion en las dos fichas. */
function SeccionPasos({ pasos, para, puede, hayTags }: { pasos: EstadoPasos; para: string; puede: boolean; hayTags: boolean }) {
  const salidas = pasos.para === para ? pasos.salidas : undefined;
  return (
    <section className="ficha__bloque">
      <h3>{salidas ? "Salidas y regresos" : "Entradas y salidas"}</h3>
      {!puede ? (
        <p className="ficha__vacio">Los pasos por la pluma los ve el personal que opera el padrón.</p>
      ) : pasos.cargando || pasos.para !== para ? (
        <p className="ficha__vacio">Leyendo la bitácora…</p>
      ) : pasos.error ? (
        <p className="submit-error" role="alert">{pasos.error}</p>
      ) : !hayTags ? (
        <p className="ficha__vacio">Sin TAG, no hay pasos que buscar.</p>
      ) : salidas ? (
        <SalidasSemana salidas={salidas} />
      ) : (
        <PasosSemana estancias={pasos.estancias} />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ la ficha */

function Ficha({ r, rol, familia, onIr, extras = [], onCambio, nombreSesion, editarAlAbrir = false }: {
  r: Registro;
  rol: RolPanel;
  familia: Registro[];
  onIr: (id: string) => void;
  /** Avisos que trae quien usa la ficha y que el expediente solo no sabe: los de la bitacora y los de ZK. */
  extras?: string[];
  onCambio?: () => void;
  nombreSesion?: string;
  /** Abre con «Modificar datos» a la vista (el expediente recien creado desde ZK). */
  editarAlAbrir?: boolean;
}) {
  const [editando, setEditando] = useState(editarAlAbrir);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const tags = useMemo(() => tagsDe(r), [r]);
  const puedeVerPasos = VEN_PASOS.includes(rol);
  // Los casos del expediente y de cualquiera de sus TAGs (bloque 89).
  const numerosTag = useMemo(() => tags.map((t) => t.numero), [tags]);
  const casos = useCasosDePersona(r.id, numerosTag, rol);
  const pasos = usePasos(r.id, numerosTag, puedeVerPasos);

  const estancias = pasos.para === r.id ? pasos.estancias : [];
  const visitas = estancias.length;
  const diasConPaso = new Set(estancias.map((e) => e.dia)).size;
  const lotesUsados = [...new Set(estancias.map((e) => e.lote))];

  // Lo que no cuadra: cada aviso es una frase, y solo aparece si aplica.
  const avisos: string[] = [];
  if (r.noDispositivo && !r.placas && !r.sinPlacas) avisos.push("Tiene TAG pero ninguna placa registrada.");
  if (r.estado === "activo" && r.estacionamientos.length === 0) avisos.push("Está activo y no tiene derecho de pluma asignado.");
  const pendientes = r.solicitudes.filter((s) => !s.atendida).length;
  if (pendientes > 0) avisos.push(pendientes === 1 ? "Tiene una solicitud sin atender." : `Tiene ${pendientes} solicitudes sin atender.`);
  if (r.estado === "pendiente" && r.origenExpediente === "satag" && r.pagos.length === 0) {
    // Bloque 85: no es lo mismo no haber pagado que haber pagado y que se le devolviera.
    avisos.push(r.devoluciones.length > 0 ? "Su pago se devolvió y está por cobrar de nuevo." : "Todavía no pasa por caja.");
  }
  for (const l of lotesUsados) {
    if (!r.estacionamientos.includes(l)) avisos.push(`Entró por el ${l} y no tiene esa pluma en SATAG.`);
  }
  if (r.estado === "baja" && visitas > 0) avisos.push("Está dado de baja y su TAG sigue abriendo la pluma.");
  for (const a of extras) if (!avisos.includes(a)) avisos.push(a);

  const salidas = pasos.para === r.id ? pasos.salidas : undefined;
  const rolTexto = salidas ? `Vehículo del Instituto · en SATAG: ${TIPO_PERSONA[r.tipoUsuario]}` : TIPO_PERSONA[r.tipoUsuario];
  const seccion = r.seccionMaestro ?? (r.apellidosFamilia ? `familia ${r.apellidosFamilia}` : null);

  return (
    <article className="ficha" aria-live="polite">
      <AvisoPreguntar casos={casos.porPreguntar} />
      <div className="ficha__ident">
        <h2>{r.usuarioNombre}</h2>
        <span className="ficha__rol">{rolTexto}{seccion ? ` · ${seccion}` : ""}</span>
        {REACTIVAN.includes(rol) && !corrigiendo && (
          <button type="button" className="link-action" onClick={() => setCorrigiendo(true)}>Corregir nombre</button>
        )}
      </div>
      <div className="ficha__cifras">
        <span>TAG {r.estado === "baja" ? "" : "vigente "}<b><code>{r.noDispositivo ?? "sin TAG"}</code></b></span>
        <span>{ROTULO.plumas} <b>{textoPlumas(r.estacionamientos)}</b></span>
        {puedeVerPasos && pasos.para === r.id && !pasos.cargando && pasos.error === null && (
          salidas ? (
            <span>Últimos días <b>{salidas.length} {salidas.length === 1 ? "salida" : "salidas"}</b>{diasConPaso > 0 ? ` en ${diasConPaso} ${diasConPaso === 1 ? "día" : "días"}` : ""}</span>
          ) : (
            <span>Últimos días <b>{visitas} {visitas === 1 ? "visita" : "visitas"}</b>{diasConPaso > 0 ? ` en ${diasConPaso} ${diasConPaso === 1 ? "día" : "días"}` : ""}</span>
          )
        )}
        <span>Folio <b><code>{r.folio}</code></b></span>
      </div>

      {REACTIVAN.includes(rol) && corrigiendo && (
        <CorregirNombre r={r} onCerrar={() => setCorrigiendo(false)} onCambio={onCambio} onCasos={casos.recargar} />
      )}
      {REACTIVAN.includes(rol) && <ReactivarExpediente r={r} onCambio={onCambio} onReactivado={() => setEditando(true)} />}
      {/* Gerardo, 22-oct: el proceso completo en una pantalla —buscar, reactivar y
          corregir datos—; es el mismo formulario de «Actualizar datos». */}
      {REACTIVAN.includes(rol) && r.estado !== "baja" && (
        editando ? (
          <section className="ficha__editar" aria-label="Modificar datos">
            <div className="ficha__editar-cab">
              <h3 className="ds-rotulo">Modificar datos</h3>
              <button type="button" className="link-action" onClick={() => setEditando(false)}>Cerrar</button>
            </div>
            <VistaTi rol={rol} nombreSesion={nombreSesion} modoInicial="actualizar" sinInicio registroFijo={r.id} onHecho={onCambio} />
          </section>
        ) : (
          <button type="button" className="ghost-action ghost-action--chico ficha__editar-abrir" onClick={() => setEditando(true)}>Modificar datos…</button>
        )
      )}

      <div className="ficha__cuerpo">
        <div>
          {casos.puede && (
            <SeccionCasos
              registroId={r.id}
              casos={casos.casos}
              tipos={casos.tipos}
              cargando={casos.cargando}
              error={casos.error}
              recargar={casos.recargar}
              rol={rol}
              email={null}
            />
          )}

          <SeccionPasos pasos={pasos} para={r.id} puede={puedeVerPasos} hayTags={tags.length > 0} />

          <LecturasDeTags tarjetas={numerosTag} rol={rol} />

          {VEN_CASOS.includes(rol) && <AperturasDePersona registroId={r.id} tarjetas={numerosTag} />}

          <section className="ficha__bloque">
            <h3>TAGs</h3>
            {tags.length === 0 ? (
              <p className="ficha__vacio">Todavía no tiene TAG instalado.</p>
            ) : (
              <div className="table-wrap">
                <table className="tabla-tipo">
                  <thead><tr><th>Número</th><th>Estado</th><th>Desde</th></tr></thead>
                  <tbody>
                    {tags.map((t) => (
                      <tr key={t.numero} className={t.vigente ? undefined : "baja"}>
                        <td className="mono">{t.numero}</td>
                        <td>{t.estado}</td>
                        <td>{t.desde}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="ficha__bloque">
            <h3>Vehículo</h3>
            <div className="table-wrap">
              <table className="tabla-tipo">
                <thead><tr><th>{ROTULO.placa}</th><th>Vehículo</th><th>Estado</th></tr></thead>
                <tbody>
                  <tr className={r.estado === "baja" ? "baja" : undefined}>
                    <td className="mono">{r.placas ?? (r.sinPlacas ? ROTULO.sinPlacas : "—")}</td>
                    <td>{textoVehiculo(r)}</td>
                    <td>{rotuloExpediente(r.estado, r.pagos.length > 0, r.origenExpediente === "satag")}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="ficha__bloque">
            <h3>Actividad</h3>
            {r.movimientos.length === 0 && r.pagos.length === 0 && r.devoluciones.length === 0 ? (
              <p className="ficha__vacio">Sin movimientos registrados.</p>
            ) : (
              <ul className="actividad">
                {[...r.movimientos]
                  // La devolucion (bloque 85) ya trae su frase completa en el motivo.
                  .map((m) => ({ fecha: m.fecha, texto: m.tipo === "devolucion"
                    ? `${m.motivo ?? "Devolución del pago"}${m.hechoPor ? ` · ${m.hechoPor}` : ""}`
                    : `${m.tipo.charAt(0).toUpperCase()}${m.tipo.slice(1)}${m.motivo ? `: ${m.motivo}` : ""}${m.hechoPor ? ` · ${m.hechoPor}` : ""}` }))
                  .concat(r.pagos.map((p) => ({ fecha: p.fecha ?? "", texto: `Cobro de $${p.monto}${p.cobradoPor ? ` · ${p.cobradoPor}` : ""}` })))
                  // El cobro devuelto sigue siendo algo que paso: se lista, marcado.
                  .concat(r.devoluciones.map((p) => ({ fecha: p.fecha ?? "", texto: `Cobro de $${p.monto} (devuelto después)${p.cobradoPor ? ` · ${p.cobradoPor}` : ""}` })))
                  .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
                  .map((a, i) => (
                    <li key={i}><time>{fechaCorta(a.fecha)}</time><span>{a.texto}</span></li>
                  ))}
              </ul>
            )}
          </section>

          <section className="ficha__bloque">
            <h3>Expediente</h3>
            <DetalleRegistro r={r} />
            <EvidenciaFirmaPanel registroId={r.id} rol={rol} />
          </section>
        </div>

        <aside>
          <h3>Datos</h3>
          <dl className="props">
            <div><dt>Tipo</dt><dd>{rolTexto}</dd></div>
            {r.seccionMaestro && <div><dt>Sección</dt><dd>{r.seccionMaestro}</dd></div>}
            {r.tipoUsuario === "admin" && <AreaAdministrativa r={r} rol={rol} />}
            {r.apellidosFamilia && <div><dt>Familia</dt><dd>{r.apellidosFamilia}</dd></div>}
            <div><dt>{ROTULO.plumas}</dt><dd>{textoPlumas(r.estacionamientos)}</dd></div>
            <div><dt>Estado</dt><dd>{rotuloExpediente(r.estado, r.pagos.length > 0, r.origenExpediente === "satag")}</dd></div>
            <div><dt>Origen</dt><dd>{ORIGEN_LABEL[r.origenExpediente]}</dd></div>
            <div><dt>Folio</dt><dd><code>{r.folio}</code></dd></div>
          </dl>
          <IdentificacionGes nombres={[r.usuarioNombre]} tarjetas={numerosTag} rol={rol} email={null} />
          {familia.length > 0 && (
            <>
              <h3 style={{ marginTop: 26 }}>Misma familia</h3>
              <ul className="actividad">
                {familia.map((f) => (
                  <li key={f.id} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
                    <button type="button" className="link-action" onClick={() => onIr(f.id)}>
                      {f.usuarioNombre} · {TIPO_PERSONA[f.tipoUsuario]}{f.noDispositivo ? ` · TAG ${f.noDispositivo}` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {avisos.length > 0 && (
            <>
              <h3 style={{ marginTop: 26 }}>Lo que no cuadra</h3>
              {avisos.map((a) => <p className="aviso-ficha" key={a}>{a}</p>)}
            </>
          )}
        </aside>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ sin expediente */

/**
 * Quien tiene TAG en ZK y no tiene expediente en SATAG, o un TAG que solo aparece en
 * la bitacora (Gerardo, 16-oct: «quiero ver el contexto entero via personas»). Se
 * lista junto a los expedientes; no es un expediente y no se puede operar desde aqui.
 */
export interface SinExpediente {
  tarjeta: string;
  /** null: el TAG no esta en el padron de ZK, solo se busco por su numero. */
  zk: PersonaZkConsulta | null;
}

const claveSinExpediente = (s: SinExpediente) => `zk:${s.tarjeta}`;
const nombreSinExpediente = (s: SinExpediente) => s.zk?.nombre.trim() || `TAG ${s.tarjeta}`;

// Bloque 102 (22-oct): quien esta vigente en ZK y nunca paso por la pluma no entra
// solo a SATAG (altas_desde_zk pide que haya abierto). Sistemas le crea el expediente
// aqui, a pedido, para irle llenando los datos.
function CrearExpedienteZk({ tarjeta, nombre, onCreado }: { tarjeta: string; nombre: string; onCreado?: (id: string) => void }) {
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function crear() {
    if (!window.confirm(`¿Crear en SATAG el expediente de ${nombre} (TAG ${tarjeta}) con lo que dice ZK? Después se le capturan los datos que falten.`)) return;
    setCreando(true);
    setError(null);
    try {
      const r = await altaDesdeZkTarjeta(tarjeta);
      onCreado?.(r.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el expediente.");
      setCreando(false);
    }
  }
  return (
    <div className="ficha__baja">
      <p>No tiene expediente en SATAG. Se crea con su nombre, departamento y placa de ZK; el vehículo y lo demás se capturan después.</p>
      <button type="button" className="ghost-action ghost-action--chico" disabled={creando} onClick={crear}>
        {creando ? "Creando…" : "Crear su expediente en SATAG"}
      </button>
      {error && <p className="submit-error" role="alert">{error}</p>}
    </div>
  );
}

function FichaSinExpediente({ s, rol, onCreado }: { s: SinExpediente; rol: RolPanel; onCreado?: (id: string) => void }) {
  const para = claveSinExpediente(s);
  const tarjetas = useMemo(() => [s.tarjeta], [s.tarjeta]);
  const puedeVerPasos = VEN_PASOS.includes(rol);
  // Sin expediente, los casos y la caseta se buscan solo por el TAG.
  const casos = useCasosDePersona("", tarjetas, rol);
  const pasos = usePasos(para, tarjetas, puedeVerPasos);
  const listos = puedeVerPasos && pasos.para === para && !pasos.cargando && pasos.error === null;
  const visitas = listos ? (pasos.salidas?.length ?? pasos.estancias.length) : 0;
  const z = s.zk;
  const depto = nombreDepto(z?.departamento);
  const enBajas = depto === "BAJAS";
  const enStock = depto.includes("STOCK");

  const avisos: string[] = [];
  if (!z) avisos.push("Este TAG no está en el padrón de ZK ni tiene expediente en SATAG.");
  else avisos.push("Tiene TAG en ZK y no tiene expediente en SATAG.");
  if (z && !z.vigente) avisos.push("Ya no viene en el último export de ZK: lo borraron allá.");
  if (enBajas) avisos.push(visitas > 0 ? "Está en BAJAS de ZK y aun así abrió la pluma." : "Está en BAJAS de ZK: la pluma lo rechaza.");
  if (enStock && visitas > 0) avisos.push("Es un TAG de stock y abrió la pluma: alguien lo trae puesto.");
  if (z && !z.placa) avisos.push("ZK no tiene su placa: no aparece al buscarlo por placa.");

  return (
    <article className="ficha" aria-live="polite">
      <AvisoPreguntar casos={casos.porPreguntar} />
      <div className="ficha__ident">
        <h2>{nombreSinExpediente(s)}</h2>
        <span className="ficha__rol">{z ? `Solo en ZK · ${z.departamento || "sin departamento"}` : "Solo en la bitácora de la pluma"}</span>
      </div>
      <div className="ficha__cifras">
        <span>TAG <b><code>{s.tarjeta}</code></b></span>
        {z && <span>Placa en ZK <b>{z.placa ? <code>{z.placa}</code> : "sin placa"}</b></span>}
        {listos && <span>Últimos días <b>{visitas} {pasos.salidas ? (visitas === 1 ? "salida" : "salidas") : (visitas === 1 ? "visita" : "visitas")}</b></span>}
        <span>Expediente <b>no tiene</b></span>
      </div>

      {REACTIVAN.includes(rol) && z && z.vigente && !enBajas && !enStock && (
        <CrearExpedienteZk tarjeta={s.tarjeta} nombre={nombreSinExpediente(s)} onCreado={onCreado} />
      )}

      <div className="ficha__cuerpo">
        <div>
          {casos.puede && (
            <SeccionCasos
              registroId=""
              tarjeta={s.tarjeta}
              casos={casos.casos}
              tipos={casos.tipos}
              cargando={casos.cargando}
              error={casos.error}
              recargar={casos.recargar}
              rol={rol}
              email={null}
            />
          )}
          <SeccionPasos pasos={pasos} para={para} puede={puedeVerPasos} hayTags />
          <LecturasDeTags tarjetas={tarjetas} rol={rol} />
          {VEN_CASOS.includes(rol) && <AperturasDePersona registroId="" tarjetas={tarjetas} />}
        </div>

        <aside>
          <h3>Datos</h3>
          <dl className="props">
            <div><dt>En ZK</dt><dd>{z ? (z.vigente ? "Sí" : "Ya no viene en el export") : "No"}</dd></div>
            {z && <div><dt>Departamento</dt><dd>{z.departamento || "—"}</dd></div>}
            {z && <div><dt>Placa en ZK</dt><dd>{z.placa || "—"}</dd></div>}
            <div><dt>En SATAG</dt><dd>Sin expediente</dd></div>
          </dl>
          <IdentificacionGes nombres={[z?.nombre]} tarjetas={tarjetas} rol={rol} email={null} />
          <h3 style={{ marginTop: 26 }}>Lo que no cuadra</h3>
          {avisos.map((a) => <p className="aviso-ficha" key={a}>{a}</p>)}
        </aside>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ lista y ficha */

// Bloque 88: el administrativo es de Administración (ZK 16) o de Admon (ZK 17, el
// equipo del contador). La diferencia solo existe en el panel, nunca en el registro
// público. SATAG y ZK van a la par: esta área es el departamento al que exporta el
// puente, y al cargar el padrón de ZK se alinea con el que ZK tenga.
const AREA_LABEL: Record<AreaAdmin, string> = { administracion: "Administración", admon: "Admon" };
const CAMBIAN_AREA: RolPanel[] = ["admin", "ti", "super"];

function AreaAdministrativa({ r, rol }: { r: Registro; rol: RolPanel }) {
  const [area, setArea] = useState<AreaAdmin>(r.areaAdmin ?? "administracion");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const otra: AreaAdmin = area === "admon" ? "administracion" : "admon";
  async function cambiar() {
    // Escribe en el expediente y en el puente a ZK: se confirma antes.
    if (!window.confirm(`¿Pasar a ${r.usuarioNombre} del área ${AREA_LABEL[area]} a ${AREA_LABEL[otra]}? Este cambio se refleja en el departamento al que exporta el puente a ZK.`)) return;
    setGuardando(true);
    setError(null);
    try {
      await asignarAreaAdmin(r.id, otra, null);
      setArea(otra);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el área.");
    } finally {
      setGuardando(false);
    }
  }
  return (
    <div>
      <dt>Área</dt>
      <dd>
        {AREA_LABEL[area]}
        {CAMBIAN_AREA.includes(rol) && (
          <>
            <button type="button" className="ghost-action ghost-action--chico" style={{ display: "block", marginTop: 6 }} disabled={guardando} onClick={cambiar}>
              {guardando ? "Guardando…" : `Pasar a ${AREA_LABEL[otra]}`}
            </button>
          </>
        )}
        {error && <span className="field-error" role="alert"> {error}</span>}
      </dd>
    </div>
  );
}

// Bloque 101 (22-oct): la baja ya tiene regreso. Lo decide Sistemas (rol ti; super
// pasa siempre), con motivo, y el expediente vuelve a «activo» si conserva su TAG o a
// «pendiente» si nunca tuvo. Lo de ZK va aparte, desde su caso.
const REACTIVAN: RolPanel[] = ["ti", "super"];

function ReactivarExpediente({ r, onCambio, onReactivado }: { r: Registro; onCambio?: () => void; onReactivado?: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ estado: string; tag: string | null } | null>(null);

  if (hecho) {
    return (
      <div className="ds-aviso ds-aviso--ok ficha__baja" role="status">
        <b>Expediente reactivado.</b>{" "}
        {hecho.estado === "activo" ? `Queda activo con su TAG ${hecho.tag}.` : "Queda pendiente: no tenía TAG instalado."}{" "}
        Corríjale los datos aquí abajo. Si está en BAJAS en ZK, pida desde su caso la acción en ZK para regresarlo a su departamento.
      </div>
    );
  }
  if (r.estado !== "baja") return null;

  async function reactivar() {
    if (motivo.trim().length < 5) { setError("Escriba por qué se reactiva."); return; }
    setGuardando(true);
    setError(null);
    try {
      setHecho(await reactivarExpediente(r.id, motivo.trim()));
      onCambio?.();
      onReactivado?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reactivar el expediente.");
      setGuardando(false);
    }
  }

  return (
    <div className="ficha__baja">
      <p>
        <b>Dado de baja{r.fechaBaja ? ` el ${fechaCorta(r.fechaBaja)}` : ""}.</b>{" "}
        {r.motivoBaja ? `Motivo: ${r.motivoBaja}` : "Sin motivo registrado."}
      </p>
      {abierto ? (
        <>
          <label className="na-campo">Por qué se reactiva
            <textarea className="textarea" rows={2} maxLength={500} value={motivo} autoFocus onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej.: Se presentó en la caseta y se identificó: es la mamá de un alumno de primaria." />
          </label>
          <div className="ds-acciones">
            <button type="button" className="primary-action" disabled={guardando} onClick={reactivar}>{guardando ? "Reactivando…" : "Reactivar"}</button>
            <button type="button" className="ghost-action" disabled={guardando} onClick={() => { setAbierto(false); setError(null); }}>Cancelar</button>
          </div>
        </>
      ) : (
        <button type="button" className="ghost-action ghost-action--chico" onClick={() => setAbierto(true)}>Reactivar expediente…</button>
      )}
      {error && <p className="submit-error" role="alert">{error}</p>}
    </div>
  );
}

// Bloque 103 (28-oct): el nombre se corrige aqui, en SATAG y en ZK de una vez
// (Gerardo: «hay que cambiarlo tanto de satag como de zk, hay que tener ese proceso
// sistematizado»). SATAG cambia en el acto; ZK, con el caso «Corregir el nombre en
// ZK», que sale en la siguiente tanda de Movimientos en ZK y se cierra cuando el
// padron de ZK lo confirma.
function textoNombreCorregido(h: NombreCorregido): string {
  const satag = h.satag ? `En SATAG ya dice «${h.nombre}».` : `SATAG ya decía «${h.nombre}».`;
  const zk = {
    pedido: `En ZK quedó pedido: el caso ${h.caso ? numeroCaso(h.caso) : ""} queda cerrado con su acción y sale en la siguiente tanda de Datos › Movimientos en ZK. Si el padrón de ZK no lo confirma, el caso se reabre.`,
    coincide: "ZK ya lo tiene así: no hay nada que hacer allá.",
    sin_tag: "No tiene TAG vigente: no hay nada que cambiar en ZK.",
    sin_zk: "Su TAG no está vigente en el padrón de ZK guardado: no hay nada que cambiar allá.",
  }[h.zk];
  return `${satag} ${zk}`;
}

function CorregirNombre({ r, onCerrar, onCambio, onCasos }: { r: Registro; onCerrar: () => void; onCambio?: () => void; onCasos?: () => void }) {
  const id = useId();
  const tarjeta = r.estado !== "baja" ? r.noDispositivo : null;
  const [partes, setPartes] = useState<NombrePersona | null>(null);
  const [zkDice, setZkDice] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<NombreCorregido | null>(null);

  useEffect(() => {
    let vivo = true;
    leerNombreParaCorregir(r.id, tarjeta)
      .then((d) => { if (vivo) { setPartes(d.partes); setZkDice(d.zkDice); } })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : "No se pudo leer el nombre."); });
    return () => { vivo = false; };
  }, [r.id, tarjeta]);

  const nuevo = partes ? [partes.nombre, partes.apellidoPaterno, partes.apellidoMaterno].map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean).join(" ") : "";
  const cambiar = (campo: keyof NombrePersona) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPartes((p) => (p ? { ...p, [campo]: e.target.value } : p));

  async function corregir() {
    if (!partes) return;
    if (!partes.nombre.trim() || !partes.apellidoPaterno.trim()) { setError("Escriba el nombre y el apellido paterno."); return; }
    if (motivo.trim().length < 5) { setError("Escriba por qué se corrige el nombre."); return; }
    setGuardando(true);
    setError(null);
    try {
      setHecho(await corregirNombre(r.id, partes, motivo.trim()));
      onCambio?.();
      onCasos?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo corregir el nombre.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="ficha__editar" aria-label="Corregir nombre">
      <div className="ficha__editar-cab">
        <h3 className="ds-rotulo">Corregir nombre</h3>
        <button type="button" className="link-action" onClick={onCerrar}>Cerrar</button>
      </div>
      {hecho ? (
        <p className="ds-aviso ds-aviso--ok" role="status"><b>Nombre corregido.</b> {textoNombreCorregido(hecho)}</p>
      ) : (
        <div className="ficha__nombre">
          <p className="ds-nota">
            Se corrige en SATAG en este momento y, si ZK lo tiene distinto, queda pedido en ZK en un caso.{" "}
            {tarjeta ? (zkDice ? <>En ZK dice: <b>«{zkDice}»</b>.</> : "Su TAG no está vigente en el padrón de ZK guardado.") : "No tiene TAG vigente: solo cambia en SATAG."}
          </p>
          {partes && (
            <>
              <div className="ficha__nombre-partes">
                <label className="na-campo" htmlFor={`${id}-n`}>Nombre(s)
                  <input id={`${id}-n`} className="input" maxLength={50} value={partes.nombre} autoFocus onChange={cambiar("nombre")} />
                </label>
                <label className="na-campo" htmlFor={`${id}-p`}>Apellido paterno
                  <input id={`${id}-p`} className="input" maxLength={50} value={partes.apellidoPaterno} onChange={cambiar("apellidoPaterno")} />
                </label>
                <label className="na-campo" htmlFor={`${id}-m`}>Apellido materno (opcional)
                  <input id={`${id}-m`} className="input" maxLength={50} value={partes.apellidoMaterno} onChange={cambiar("apellidoMaterno")} />
                </label>
              </div>
              <p className="ds-nota">Así quedará: <b>{nuevo || "—"}</b></p>
              <label className="na-campo" htmlFor={`${id}-mo`}>Por qué se corrige
                <textarea id={`${id}-mo`} className="textarea" rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej.: Se identificó en la caseta con su credencial." />
              </label>
              <div className="ds-acciones">
                <button type="button" className="primary-action" disabled={guardando} onClick={corregir}>{guardando ? "Corrigiendo…" : "Corregir nombre"}</button>
                <button type="button" className="ghost-action" disabled={guardando} onClick={onCerrar}>Cancelar</button>
              </div>
            </>
          )}
          {!partes && !error && <p className="ds-nota">Leyendo el nombre…</p>}
        </div>
      )}
      {error && <p className="submit-error" role="alert">{error}</p>}
    </section>
  );
}

export default function FichaPersona({ registros, sinExpediente = [], todos, rol, vacio, linea, avisosExtra, orden, onCambio, nombreSesion }: {
  /** Los expedientes que pasan el buscador y los filtros de Consulta. */
  registros: Registro[];
  /** Quien solo esta en ZK o en la bitacora; va despues de los expedientes. */
  sinExpediente?: SinExpediente[];
  /** El padrón completo, para enlazar a la misma familia aunque el filtro la deje fuera. */
  todos: Registro[];
  rol: RolPanel;
  vacio: string;
  /** Una linea mas en cada renglon de la lista: lo que quien usa la ficha sabe de esa persona (su uso del estacionamiento). */
  linea?: (r: Registro) => ReactNode;
  /** Avisos que el expediente solo no sabe, para «Lo que no cuadra»; tambien encienden el punto de la lista. */
  avisosExtra?: (r: Registro) => string[];
  /** Como viene ordenada la lista, dicho junto a la cuenta: «por entradas, de más a menos». */
  orden?: string;
  /** Para volver a leer el padrón cuando la ficha cambia un expediente (reactivarlo, corregir datos). */
  onCambio?: () => void;
  /** Quien tiene la sesión: firma «Actualizar datos» dentro de la ficha. */
  nombreSesion?: string;
}) {
  const [elegido, setElegido] = useState<string | null>(null);
  // El expediente recien creado desde ZK abre con «Modificar datos» a la vista.
  const [editarAlAbrir, setEditarAlAbrir] = useState<string | null>(null);
  const id = useId();
  const sinExpElegido = elegido?.startsWith("zk:") ? sinExpediente.find((s) => claveSinExpediente(s) === elegido) ?? null : null;
  const actual = sinExpElegido ? null : registros.find((r) => r.id === elegido) ?? registros[0] ?? null;
  // Sin expedientes que mostrar, la primera persona sin expediente.
  const sinExpActual = sinExpElegido ?? (actual ? null : sinExpediente[0] ?? null);
  const total = registros.length + sinExpediente.length;
  // Los 300 de la lista: primero expedientes; lo que sobre, para los que no tienen.
  const sinExpVisibles = sinExpediente.slice(0, Math.max(0, 300 - registros.length));

  const señalada = (r: Registro) =>
    (r.noDispositivo !== null && !r.placas && !r.sinPlacas) ||
    r.solicitudes.some((s) => !s.atendida) ||
    (r.estado === "activo" && r.estacionamientos.length === 0) ||
    (avisosExtra !== undefined && avisosExtra(r).length > 0);

  const familia = actual && actual.apellidosFamilia
    ? todos.filter((f) => f.id !== actual.id && f.apellidosFamilia && f.apellidosFamilia.toLowerCase() === actual.apellidosFamilia!.toLowerCase())
    : [];

  return (
    <div className="ficha-app">
      <div className="ficha-lista">
        <p className="ficha-lista__n" id={`${id}-n`}>
          {total === 0 ? vacio : `${registros.length.toLocaleString("es-MX")} ${registros.length === 1 ? "expediente" : "expedientes"}${
            sinExpediente.length > 0 ? ` · ${sinExpediente.length.toLocaleString("es-MX")} sin expediente` : ""}${orden ? ` · ${orden}` : ""}`}
        </p>
        <ul aria-labelledby={`${id}-n`}>
          {registros.slice(0, 300).map((r) => (
            <li key={r.id}>
              <button type="button" className="persona" aria-current={actual?.id === r.id && !sinExpActual} onClick={() => setElegido(r.id)}>
                <span className="persona__nm">
                  <span>{r.usuarioNombre}</span>
                  {señalada(r) && <span className="persona__punto" title="Hay algo que no cuadra" />}
                </span>
                <span className="persona__mt">
                  {TIPO_PERSONA[r.tipoUsuario]} · {r.noDispositivo ? <>TAG <code>{r.noDispositivo}</code></> : "sin TAG"}
                  {r.placas ? <> · <code>{r.placas}</code></> : ""}
                </span>
                {linea && <span className="persona__mt persona__uso">{linea(r)}</span>}
              </button>
            </li>
          ))}
          {sinExpVisibles.map((s) => (
            <li key={claveSinExpediente(s)}>
              <button type="button" className="persona" aria-current={sinExpActual?.tarjeta === s.tarjeta} onClick={() => setElegido(claveSinExpediente(s))}>
                <span className="persona__nm">
                  <span>{nombreSinExpediente(s)}</span>
                  <span className="persona__punto" title="Sin expediente en SATAG" />
                </span>
                <span className="persona__mt">
                  {s.zk ? `Solo en ZK · ${s.zk.departamento || "sin departamento"}` : "Solo en la bitácora"} · TAG <code>{s.tarjeta}</code>
                  {s.zk?.placa ? <> · <code>{s.zk.placa}</code></> : ""}
                </span>
              </button>
            </li>
          ))}
          {total > 300 && (
            <li className="ficha-lista__n" style={{ padding: "8px 10px" }}>Se muestran 300. Afine la búsqueda para ver el resto.</li>
          )}
        </ul>
      </div>
      {sinExpActual ? (
        <FichaSinExpediente key={claveSinExpediente(sinExpActual)} s={sinExpActual} rol={rol}
          onCreado={(nuevo) => { setElegido(nuevo); setEditarAlAbrir(nuevo); onCambio?.(); }} />
      ) : actual ? (
        <Ficha key={actual.id} r={actual} rol={rol} familia={familia} onIr={setElegido} extras={avisosExtra ? avisosExtra(actual) : []} onCambio={onCambio} nombreSesion={nombreSesion} editarAlAbrir={editarAlAbrir === actual.id} />
      ) : (
        <div className="ficha"><p className="ficha__vacio">{vacio}</p></div>
      )}
    </div>
  );
}
