"use client";

// Los avisos a la caseta, vistos y administrados por Sistemas (Gerardo, 21-oct):
// «ver y administrar facil los avisos que le mando a cada caseta, y poder
// retirarlos». Los avisos se crean desde su caso (bloque 98, «Avisar a la
// caseta…»); aqui se ven todos juntos, por estacionamiento, con lo que respondio
// el portero, y se retiran. Las tarjetas son las de la caseta (.cs-aviso).
// Leen ti, contador, admin y super (RLS del 98); retirar es de ti (y super).
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RolPanel } from "@/lib/supabase/auth";
import { listAvisosCaseta, nombreDesdeEmail, retirarAvisoCaseta, type AvisoSistemas } from "@/lib/supabase/apiPanel";
import { avisoVivo, estadoAviso, type EstadoAviso } from "@/lib/caseta";
import { numeroCaso } from "@/lib/casosRegistro";
import { pedirCaso } from "@/lib/irACaso";
import { fecha } from "@/lib/formato";
import { cuando } from "@/components/admin/SeguimientoCaseta";
import Loader from "@/components/Loader";

const RETIRAN: RolPanel[] = ["ti", "super"];
const DIAS = [7, 30, 90] as const;
/** «2026-10-21» en la hora del equipo (Queretaro), no en UTC. */
const hoyLocal = () => new Date().toLocaleDateString("en-CA");

const ESTADO: Record<EstadoAviso, { texto: string; tono: "espera" | "listo" | "nuevo" }> = {
  esperando: { texto: "Esperando respuesta", tono: "espera" },
  respondido: { texto: "✓ Respondido", tono: "listo" },
  retirado: { texto: "Retirado", tono: "nuevo" },
  vencido: { texto: "Venció", tono: "nuevo" },
  "caso-cerrado": { texto: "Caso cerrado", tono: "nuevo" },
};

export default function AvisosCasetaSistemas({ rol, email, onIr }: { rol: RolPanel; email: string; onIr: (vista: string) => void }) {
  const [dias, setDias] = useState(30);
  const [lote, setLote] = useState<"" | "E1" | "E2">("");
  const [avisos, setAvisos] = useState<AvisoSistemas[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [verViejos, setVerViejos] = useState(false);
  const [hoy] = useState(hoyLocal);
  const retira = RETIRAN.includes(rol);

  const leer = useCallback(async () => {
    try {
      setAvisos(await listAvisosCaseta(dias));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer los avisos a la caseta.");
      setAvisos((a) => a ?? []);
    }
  }, [dias]);
  useEffect(() => { leer(); }, [leer]);

  // La caseta de un estacionamiento ve los avisos de ese estacionamiento y los de los dos.
  const grupos = useMemo(() => {
    const deLote = (avisos ?? []).filter((a) => !lote || a.lotes.length === 0 || a.lotes.includes(lote));
    const conEstado = deLote.map((a) => ({ a, e: estadoAviso(a, hoy) }));
    return {
      esperando: conEstado.filter((x) => x.e === "esperando"),
      respondidos: conEstado.filter((x) => x.e === "respondido"),
      viejos: conEstado.filter((x) => !avisoVivo(x.e)),
    };
  }, [avisos, lote, hoy]);

  async function retirar(a: AvisoSistemas) {
    try {
      await retirarAvisoCaseta(a.id, email);
      const t = `Aviso retirado: la caseta ya no lo ve${a.casoNumero ? ` (queda la nota en el caso ${numeroCaso(a.casoNumero)})` : ""}.`;
      setAviso(t);
      setTimeout(() => setAviso((x) => (x === t ? null : x)), 6000);
      await leer();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo retirar el aviso.");
    }
  }

  if (avisos === null) return <Loader label="Leyendo los avisos a la caseta…" />;
  const vivos = grupos.esperando.length + grupos.respondidos.length;
  const abrirCaso = (n: number) => { pedirCaso(n); onIr("casos"); };
  const tarjeta = ({ a, e }: { a: AvisoSistemas; e: EstadoAviso }) => (
    <TarjetaAvisoSistemas key={a.id} a={a} e={e} retira={retira && avisoVivo(e)} onRetirar={() => retirar(a)} onAbrirCaso={abrirCaso} />
  );

  return (
    <div className="rc">
      <h2 className="titular">
        {vivos === 0 ? "La caseta no tiene avisos vigentes" : `${vivos} ${vivos === 1 ? "aviso vigente" : "avisos vigentes"}`}
        {grupos.esperando.length > 0 && <span className="rc-titular__sin"> · {grupos.esperando.length} {grupos.esperando.length === 1 ? "espera" : "esperan"} respuesta</span>}
      </h2>
      <p className="titular__sub">
        Lo que la caseta ve hoy en «Avisos de Sistemas» y al buscar cada vehículo. Los avisos se crean desde su caso, con «Avisar a la caseta…».
      </p>

      <div className="aperturas__herr">
        <div className="tc-seg" role="group" aria-label="Caseta">
          {(["", "E1", "E2"] as const).map((l) => (
            <button key={l || "todas"} type="button" aria-pressed={lote === l} onClick={() => setLote(l)}>{l ? `Caseta ${l}` : "Las dos casetas"}</button>
          ))}
        </div>
        <select className="select" value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Días">
          {DIAS.map((d) => <option key={d} value={d}>Retirados de los últimos {d} días</option>)}
        </select>
        <button type="button" className="ghost-action" onClick={() => leer()}>Volver a leer</button>
      </div>

      {error && <p className="submit-error" role="alert">{error}</p>}
      {aviso && <p className="ds-aviso ds-aviso--ok" role="status">{aviso}</p>}

      <section className="rc-grupo rc-grupo--sin-seguimiento" aria-label="Esperan respuesta">
        <h3 className="rc-grupo__t">Esperan respuesta <span className="rc-grupo__n">{grupos.esperando.length}</span></h3>
        <p className="ds-nota">La caseta los ve y nadie ha contestado. Del más reciente al más viejo.</p>
        {grupos.esperando.length === 0 ? <p className="cs-vacio">Nada esperando respuesta.</p> : <ul className="rc-tarjetas">{grupos.esperando.map(tarjeta)}</ul>}
      </section>

      <section className="rc-grupo" aria-label="Respondidos">
        <h3 className="rc-grupo__t">Respondidos, siguen vigentes <span className="rc-grupo__n">{grupos.respondidos.length}</span></h3>
        <p className="ds-nota">La caseta ya contestó y los sigue viendo. Si ya no hacen falta, retírelos o cierre su caso.</p>
        {grupos.respondidos.length === 0 ? <p className="cs-vacio">Ninguno.</p> : <ul className="rc-tarjetas">{grupos.respondidos.map(tarjeta)}</ul>}
      </section>

      {grupos.viejos.length > 0 && (
        <section className="rc-grupo" aria-label="Ya no se muestran">
          <h3 className="rc-grupo__t">Ya no se muestran <span className="rc-grupo__n">{grupos.viejos.length}</span></h3>
          <p className="ds-nota">Retirados, vencidos o con su caso cerrado.</p>
          {verViejos ? (
            <ul className="rc-tarjetas">{grupos.viejos.map(tarjeta)}</ul>
          ) : (
            <button type="button" className="link-action rc-plegar" onClick={() => setVerViejos(true)}>
              {grupos.viejos.length === 1 ? "Ver el aviso" : `Ver los ${grupos.viejos.length} avisos`}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function TarjetaAvisoSistemas({ a, e, retira, onRetirar, onAbrirCaso }: {
  a: AvisoSistemas;
  e: EstadoAviso;
  retira: boolean;
  onRetirar: () => Promise<void>;
  onAbrirCaso: (n: number) => void;
}) {
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const est = ESTADO[e];
  const auto = [[a.marca, a.modelo].filter(Boolean).join(" "), a.color].filter(Boolean).join(" · ");
  return (
    <li className={`cs-aviso${e === "respondido" ? " cs-aviso--resp" : ""}${!avisoVivo(e) ? " cs-aviso--viejo" : ""}`}>
      <div className="cs-aviso__veh">
        <span className="cs-placa mono">{a.placa ?? "Sin placa"}</span>
        <span className="cs-aviso__auto">{auto || "Vehículo sin registrar"}</span>
        <span className={`cs-pill cs-pill--${est.tono} rc-aviso__estado`}>{est.texto}</span>
      </div>
      <p className="cs-aviso__quien">
        {a.nombre ?? (a.tarjeta ? `TAG ${a.tarjeta}` : "Sin nombre")}
        <span className="ds-nota"> · {a.lotes.length === 1 ? `solo la caseta ${a.lotes[0]}` : "las dos casetas"}</span>
      </p>
      <p className="cs-aviso__pide"><span className="cs-aviso__rot">Sistemas pide</span> {a.texto}</p>
      {a.respuestas.map((r, i) => (
        <p key={i} className="cs-aviso__resp">✓ {nombreDesdeEmail(r.hechoPor)} · {cuando(r.hechoEn, true)}: {r.respuesta}</p>
      ))}
      <p className="ds-nota">
        Avisó {nombreDesdeEmail(a.creadoPor)} · {cuando(a.creadoEn, true)}
        {a.hasta ? ` · hasta el ${fecha(a.hasta)}` : ""}
        {a.cerradoEn ? ` · lo retiró ${nombreDesdeEmail(a.cerradoPor ?? "")} ${cuando(a.cerradoEn, true)}` : ""}
      </p>
      {confirmar ? (
        <div className="rc-confirma" role="group" aria-label="Confirmar">
          <span>¿Retirar este aviso? La caseta deja de verlo.</span>
          <button type="button" className="primary-action" disabled={ocupado}
            onClick={async () => { setOcupado(true); await onRetirar(); setOcupado(false); setConfirmar(false); }}>
            {ocupado ? "Retirando…" : "Sí, retirar"}
          </button>
          <button type="button" className="ghost-action ghost-action--chico" onClick={() => setConfirmar(false)} disabled={ocupado}>Cancelar</button>
        </div>
      ) : (
        <div className="cs-aviso__acc">
          {retira && <button type="button" className="ghost-action ghost-action--chico rc-retirar" onClick={() => setConfirmar(true)}>Retirar</button>}
          {a.casoNumero && (
            <button type="button" className="ghost-action ghost-action--chico" onClick={() => onAbrirCaso(a.casoNumero!)}>Abrir el caso {numeroCaso(a.casoNumero)}</button>
          )}
        </div>
      )}
    </li>
  );
}
