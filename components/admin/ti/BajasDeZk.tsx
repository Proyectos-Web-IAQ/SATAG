"use client";

// Personas que ZK ya tiene en BAJAS y SATAG sigue mostrando vivas (Gerardo, 21-oct:
// «hoy dimos varios de baja en ZK… en SATAG me sigue apareciendo como activo y no
// quiero eso»). ZK manda: si ya no abre allá, aquí también es una baja.
//
// Se dan de baja con la misma función de siempre (dar_baja: deja su movimiento,
// su motivo y cierra lo pendiente), una por una, con la lista a la vista para
// quitar a quien no corresponda. Solo TI (y super).
import { useCallback, useEffect, useState } from "react";
import type { RolPanel } from "@/lib/supabase/auth";
import { darBaja } from "@/lib/supabase/apiPanel";
import { leerVivosEnBajasZk } from "@/lib/supabase/apiBandeja";
import { fechaHora } from "@/lib/formato";
import { TIPO_PERSONA } from "@/lib/glosario";
import { textoVehiculo } from "@/lib/vehiculo";
import type { Registro } from "@/lib/mock/types";
import Loader from "@/components/Loader";

const PUEDEN: RolPanel[] = ["ti", "super"];

export default function BajasDeZk({ rol, nombreSesion, onHecho }: { rol: RolPanel; nombreSesion?: string; onHecho?: () => void }) {
  const [lista, setLista] = useState<Registro[] | null>(null);
  const [padronAl, setPadronAl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fuera, setFuera] = useState<Set<string>>(new Set());
  const [motivo, setMotivo] = useState("Dado de baja en ZK (departamento BAJAS).");
  const [avance, setAvance] = useState<{ hechas: number; total: number; fallas: string[] } | null>(null);
  const puede = PUEDEN.includes(rol);

  const leer = useCallback(async () => {
    try {
      const r = await leerVivosEnBajasZk();
      setLista(r.registros);
      setPadronAl(r.padronAl);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo comparar SATAG con el padrón de ZK.");
      setLista((l) => l ?? []);
    }
  }, []);
  useEffect(() => { leer(); }, [leer]);

  async function darDeBaja() {
    if (!lista) return;
    const elegidos = lista.filter((r) => !fuera.has(r.id));
    if (!elegidos.length || motivo.trim().length < 5) return;
    if (!window.confirm(`¿Dar de baja en SATAG a ${elegidos.length} ${elegidos.length === 1 ? "persona" : "personas"}? Quedan como baja con el motivo escrito.`)) return;
    const fallas: string[] = [];
    setAvance({ hechas: 0, total: elegidos.length, fallas });
    for (let i = 0; i < elegidos.length; i++) {
      try { await darBaja(elegidos[i].id, motivo.trim(), nombreSesion ?? ""); }
      catch (e) { fallas.push(`${elegidos[i].folio}: ${e instanceof Error ? e.message : "error"}`); }
      setAvance({ hechas: i + 1, total: elegidos.length, fallas: [...fallas] });
    }
    setFuera(new Set());
    await leer();
    onHecho?.();
  }

  if (lista === null) return <Loader label="Comparando SATAG con el padrón de ZK…" />;

  return (
    <div className="ti2-bajaszk">
      <h2 className="titular">{lista.length ? `${lista.length} ${lista.length === 1 ? "persona está" : "personas están"} en BAJAS en ZK y ${lista.length === 1 ? "sigue activa" : "siguen activas"} en SATAG` : "SATAG y ZK coinciden en las bajas"}</h2>
      <p className="titular__sub">
        Su TAG ya está en el departamento BAJAS de ZK{padronAl ? ` (padrón de ZK subido el ${fechaHora(padronAl)})` : ""}: ya no abre la pluma.
        {" "}Aquí se dan de baja también en SATAG, con la misma «Dar de baja» de siempre. Quite la marca a quien no corresponda.
      </p>
      {error && <p className="submit-error" role="alert">{error}</p>}
      {avance && (
        <p className={`ds-aviso ${avance.fallas.length ? "ds-aviso--error" : "ds-aviso--ok"}`} role="status">
          {avance.hechas < avance.total ? `Dando de baja… ${avance.hechas} de ${avance.total}` : `Listo: ${avance.total - avance.fallas.length} dadas de baja en SATAG.`}
          {avance.fallas.length > 0 && ` No se pudo con: ${avance.fallas.join(" · ")}`}
        </p>
      )}
      {lista.length > 0 && (
        <>
          <ul className="ti2-bajaszk__l">
            {lista.map((r) => (
              <li key={r.id}>
                <label>
                  <input type="checkbox" checked={!fuera.has(r.id)} disabled={!puede}
                    onChange={(e) => setFuera((s) => { const n = new Set(s); if (e.target.checked) n.delete(r.id); else n.add(r.id); return n; })} />
                  <span>
                    <b>{r.usuarioNombre}</b>
                    <span className="ds-nota"> · {TIPO_PERSONA[r.tipoUsuario] ?? r.tipoUsuario} · {r.estado} · {r.folio} · TAG <span className="mono">{r.noDispositivo}</span>{r.placas ? ` · ${r.placas}` : ""}{r.marca ? ` · ${textoVehiculo(r)}` : ""}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {puede ? (
            <div className="ti2-bajaszk__acc">
              <label>Motivo de la baja
                <input className="input" value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} />
              </label>
              <button type="button" className="primary-action" disabled={!!avance && avance.hechas < avance.total || lista.length === fuera.size || motivo.trim().length < 5} onClick={darDeBaja}>
                Dar de baja en SATAG ({lista.length - fuera.size})
              </button>
            </div>
          ) : <p className="ds-nota">Dar de baja es de TI.</p>}
        </>
      )}
    </div>
  );
}
