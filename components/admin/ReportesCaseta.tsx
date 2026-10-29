"use client";

// Reportes de la caseta, vistos por Sistemas (Gerardo, 21-oct): «ver los casos
// que ha reportado caseta, quien los reporto, de la misma forma que lo ve caseta,
// en una pestaña aparte de la de casos, para ver que reportes no les hemos dado
// seguimiento».
//
// Las tarjetas son las del portero (components/admin/SeguimientoCaseta.tsx) con lo
// que solo le sirve a Sistemas: quien reporto, la nota, que decia la pantalla y el
// salto al caso. Va primero lo que nadie ha tomado, del mas viejo al mas nuevo.
// Leen ti, contador, admin y super (RLS del 97); ligar es de ti (y super).
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RolPanel } from "@/lib/supabase/auth";
import { listReportesCaseta, ligarReporteCaseta, nombreDesdeEmail } from "@/lib/supabase/apiPanel";
import { VEREDICTO, comoSeguimiento, seguimientoDeReporte, type ReporteCaseta, type SeguimientoSistemas } from "@/lib/caseta";
import { numeroCaso } from "@/lib/casosRegistro";
import { pedirCaso } from "@/lib/irACaso";
import { TarjetaReporte } from "@/components/admin/SeguimientoCaseta";
import { DialogoLigar } from "@/components/admin/AperturasCaseta";
import Loader from "@/components/Loader";
import AvisosCasetaSistemas from "@/components/admin/AvisosCasetaSistemas";
import AperturasBotonTi from "@/components/admin/ti/AperturasBotonTi";

const GRUPOS: { id: SeguimientoSistemas; titulo: string; ayuda: string }[] = [
  { id: "sin-seguimiento", titulo: "Sin seguimiento", ayuda: "Su caso sigue en Nuevo: nadie de Sistemas lo ha tomado. Del más viejo al más nuevo." },
  { id: "sin-caso", titulo: "Sin caso", ayuda: "La caseta no identificó el vehículo, o fue una falla sin vehículo: solo están en la bitácora. Una apertura se puede ligar a un expediente." },
  { id: "curso", titulo: "En atención", ayuda: "Alguien de Sistemas ya lo tomó." },
  { id: "espera", titulo: "En espera", ayuda: "Esperando a alguien o algo." },
  { id: "listo", titulo: "Resueltos", ayuda: "Lo que hizo Sistemas es lo que ve el portero." },
];
/** Lo que esta pendiente se lee del mas viejo al mas nuevo: el que mas espera, primero. */
const VIEJO_PRIMERO: SeguimientoSistemas[] = ["sin-seguimiento", "sin-caso"];
const LIGAN: RolPanel[] = ["ti", "super"];
const DIAS = [7, 30, 90] as const;

/**
 * La vista entera, en tres partes de la misma pestaña: las aperturas con el boton
 * que registro ZK contra lo que reporto la caseta (29-oct, la de seguimiento), lo
 * que reporta la caseta y lo que Sistemas le avisa (21-oct).
 */
export default function ReportesCaseta({ rol, email, onIr }: { rol: RolPanel; email: string; onIr: (vista: string) => void }) {
  const [parte, setParte] = useState<"aperturas" | "reportes" | "avisos">("aperturas");
  return (
    <div className="rc">
      <p className="titular__migas"><span>Estacionamiento</span><span>›</span><span>Caseta</span></p>
      <div className="tc-seg rc-partes" role="group" aria-label="Qué ver">
        <button type="button" aria-pressed={parte === "aperturas"} onClick={() => setParte("aperturas")}>Aperturas con botón</button>
        <button type="button" aria-pressed={parte === "reportes"} onClick={() => setParte("reportes")}>Reportes de la caseta</button>
        <button type="button" aria-pressed={parte === "avisos"} onClick={() => setParte("avisos")}>Avisos a la caseta</button>
      </div>
      {parte === "aperturas"
        ? <AperturasBotonTi rol={rol} email={email} onIr={onIr} />
        : parte === "reportes"
          ? <ReportesParte rol={rol} email={email} onIr={onIr} />
          : <AvisosCasetaSistemas rol={rol} email={email} onIr={onIr} />}
    </div>
  );
}

function ReportesParte({ rol, email, onIr }: { rol: RolPanel; email: string; onIr: (vista: string) => void }) {
  const [dias, setDias] = useState(30);
  const [lote, setLote] = useState<"" | "E1" | "E2">("");
  const [portero, setPortero] = useState("");
  const [solo, setSolo] = useState<SeguimientoSistemas | null>(null);
  const [verResueltos, setVerResueltos] = useState(false);
  const [reportes, setReportes] = useState<ReporteCaseta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ligando, setLigando] = useState<ReporteCaseta[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // La hora de la lectura: «lleva N dias» no cambia mientras se mira la lista.
  const [ahora, setAhora] = useState(() => Date.now());

  const leer = useCallback(async () => {
    try {
      setReportes(await listReportesCaseta({ dias }));
      setAhora(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer los reportes de la caseta.");
      setReportes((r) => r ?? []);
    }
  }, [dias]);
  useEffect(() => { leer(); }, [leer]);

  const porteros = useMemo(() => [...new Set((reportes ?? []).map((r) => r.hechoPor))].sort(), [reportes]);
  const grupos = useMemo(() => {
    const visibles = (reportes ?? []).filter((r) => (!lote || r.puerta.startsWith(lote)) && (!portero || r.hechoPor === portero));
    const m = new Map<SeguimientoSistemas, ReporteCaseta[]>(GRUPOS.map((g) => [g.id, []]));
    for (const r of visibles) m.get(seguimientoDeReporte(r))!.push(r);
    for (const [id, lista] of m) {
      lista.sort((a, b) => (VIEJO_PRIMERO.includes(id) ? a.hechoEn.localeCompare(b.hechoEn) : b.hechoEn.localeCompare(a.hechoEn)));
    }
    return { m, total: visibles.length };
  }, [reportes, lote, portero]);

  if (reportes === null) return <Loader label="Leyendo los reportes de la caseta…" />;

  const sinSeguimiento = grupos.m.get("sin-seguimiento")!.length;
  const abrirCaso = (n: number) => { pedirCaso(n); onIr("casos"); };

  return (
    <div className="rc">
      <h2 className="titular">
        {sinSeguimiento === 0 ? "Todos los reportes tienen seguimiento" : `${sinSeguimiento} ${sinSeguimiento === 1 ? "reporte" : "reportes"} sin seguimiento`}
      </h2>
      <p className="titular__sub">
        De {grupos.total} {grupos.total === 1 ? "reporte" : "reportes"} de la caseta en los últimos {dias} días{lote ? ` en ${lote}` : ""}.
        {" "}Cada tarjeta se ve como la ve el portero en «Mis reportes».
      </p>

      <div className="aperturas__herr">
        <select className="select" value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Días">
          {DIAS.map((d) => <option key={d} value={d}>Últimos {d} días</option>)}
        </select>
        <select className="select" value={lote} onChange={(e) => setLote(e.target.value as "" | "E1" | "E2")} aria-label="Estacionamiento">
          <option value="">E1 y E2</option>
          <option value="E1">E1</option>
          <option value="E2">E2</option>
        </select>
        <select className="select" value={portero} onChange={(e) => setPortero(e.target.value)} aria-label="Quién reportó">
          <option value="">Todos los porteros</option>
          {porteros.map((p) => <option key={p} value={p}>{nombreDesdeEmail(p)}</option>)}
        </select>
        <button type="button" className="ghost-action" onClick={() => leer()}>Volver a leer</button>
      </div>

      {error && <p className="submit-error" role="alert">{error}</p>}
      {aviso && <p className="ds-aviso ds-aviso--ok" role="status">{aviso}</p>}

      <div className="rc-cifras" role="group" aria-label="Filtrar por seguimiento">
        {GRUPOS.map((g) => (
          <button key={g.id} type="button" className={`rc-cifra rc-cifra--${g.id}`} aria-pressed={solo === g.id}
            onClick={() => setSolo((x) => (x === g.id ? null : g.id))}>
            <span className="rc-cifra__n">{grupos.m.get(g.id)!.length}</span>
            <span className="rc-cifra__t">{g.titulo}</span>
          </button>
        ))}
      </div>

      {GRUPOS.filter((g) => !solo || g.id === solo).map((g) => {
        const lista = grupos.m.get(g.id)!;
        if (!lista.length && solo !== g.id) return null;
        const plegado = g.id === "listo" && !verResueltos && solo !== "listo";
        return (
          <section key={g.id} className={`rc-grupo rc-grupo--${g.id}`} aria-label={g.titulo}>
            <h3 className="rc-grupo__t">{g.titulo} <span className="rc-grupo__n">{lista.length}</span></h3>
            <p className="ds-nota">{g.ayuda}</p>
            {!lista.length && <p className="cs-vacio">Nada en este grupo.</p>}
            {plegado ? (
              <button type="button" className="link-action rc-plegar" onClick={() => setVerResueltos(true)}>
                {lista.length === 1 ? "Ver el reporte resuelto" : `Ver los ${lista.length} reportes resueltos`}
              </button>
            ) : (
              <ol className="rc-tarjetas">
                {lista.map((r) => {
                  const diasEsperando = Math.floor((ahora - Date.parse(r.hechoEn)) / 86400000);
                  return (
                    <TarjetaReporte key={r.id} m={comoSeguimiento(r)}
                      detalle={<>
                        {" · "}reportó <b>{nombreDesdeEmail(r.hechoPor)}</b>
                        {VIEJO_PRIMERO.includes(g.id) && diasEsperando >= 1 && (
                          <b className="rc-espera"> · lleva {diasEsperando} {diasEsperando === 1 ? "día" : "días"}</b>
                        )}
                      </>}
                      marcas={r.casoUrgente && g.id !== "listo" ? <span className="cs-pill rc-urgente">Urgente</span> : null}>
                      {r.nota && <p className="rc-nota">«{r.nota}»</p>}
                      {r.veredicto && (
                        <p className="ds-nota">La pantalla decía: <b className={`cs-texto--${r.veredicto}`}>{VEREDICTO[r.veredicto].titulo}</b></p>
                      )}
                      <div className="rc-acc">
                        {r.casoNumero ? (
                          <button type="button" className="ghost-action ghost-action--chico" onClick={() => abrirCaso(r.casoNumero!)}>
                            Abrir el caso {numeroCaso(r.casoNumero)}
                          </button>
                        ) : r.clase === "apertura" && !r.registroId && LIGAN.includes(rol) ? (
                          <button type="button" className="ghost-action ghost-action--chico" onClick={() => setLigando([r])}>Ligar a un expediente</button>
                        ) : (
                          <span className="ds-nota">Sin vehículo: solo en la bitácora de la caseta.</span>
                        )}
                      </div>
                    </TarjetaReporte>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}

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
