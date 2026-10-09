"use client";

// «En GES»: quien es la persona segun el sistema escolar y si sigue en el colegio
// (bloque 92). Lo usan la ficha de persona y el detalle del caso, con la misma regla
// (lib/personas/identificar.ts).
//
// GES SE BAJA UNA VEZ POR SESION. Son ~2,600 filas chicas; se guardan en la memoria
// del modulo y todas las fichas y casos las comparten. Una decision de TI vuelve a leer
// solo las decisiones.
//
// QUIEN VE Y QUIEN DECIDE. Lo leen ti, contador, admin y super (RLS del 92). Decide
// solo TI (super pasa siempre): «Es esta persona», «No está en GES» y quitar la decision.
// La decision se guarda por TAG, porque en SATAG la identidad se ancla en el TAG.

import { useEffect, useMemo, useState } from "react";
import type { RolPanel } from "@/lib/supabase/auth";
import { decidirIdentidadGes, listIdentidadesGes, listPersonasGes } from "@/lib/supabase/apiPanel";
import {
  identificar,
  indexarGes,
  nombreGes,
  type IdentidadDecidida,
  type IndiceGes,
  type PersonaGesGuardada,
} from "@/lib/personas/identificar";
import { fecha } from "@/lib/formato";

const LEEN: RolPanel[] = ["ti", "contador", "admin", "super"];
const DECIDEN: RolPanel[] = ["ti", "super"];

/* ------------------------------------------------------------------ los datos */

interface DatosGes {
  indice: IndiceGes;
  decisiones: Map<string, IdentidadDecidida>;
  /** Personas guardadas: 0 = todavia no se ha cargado GES. */
  total: number;
}

let memoria: Promise<DatosGes> | null = null;
const oyentes = new Set<() => void>();

function cargar(soloDecisiones = false): Promise<DatosGes> {
  const anterior = memoria;
  memoria = (async () => {
    const previo = soloDecisiones && anterior ? await anterior.catch(() => null) : null;
    if (previo) return { ...previo, decisiones: await listIdentidadesGes() };
    const [personas, decisiones] = await Promise.all([listPersonasGes(), listIdentidadesGes()]);
    return { indice: indexarGes(personas), decisiones, total: personas.length };
  })();
  // Si falla, que el siguiente intento vuelva a pedir todo.
  memoria.catch(() => { memoria = null; });
  return memoria;
}

/** Despues de cargar un archivo de GES: la siguiente ficha que se abra lo vuelve a leer. */
export function olvidarGes() {
  memoria = null;
}

function useGes(activo: boolean) {
  const [estado, setEstado] = useState<{ datos: DatosGes | null; error: string | null }>({ datos: null, error: null });
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    const avisar = () => setVuelta((v) => v + 1);
    oyentes.add(avisar);
    return () => { oyentes.delete(avisar); };
  }, []);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    (memoria ?? cargar())
      .then((d) => vivo && setEstado({ datos: d, error: null }))
      .catch((e: unknown) => vivo && setEstado({ datos: null, error: e instanceof Error ? e.message : "No se pudo leer GES." }));
    return () => { vivo = false; };
  }, [activo, vuelta]);
  return estado;
}

async function decidirYRecargar(d: Parameters<typeof decidirIdentidadGes>[0], email: string | null) {
  await decidirIdentidadGes(d, email);
  await cargar(true);
  for (const o of oyentes) o();
}

/* ------------------------------------------------------------------ la vista */

const QUE_ES: Record<PersonaGesGuardada["clase"], string> = {
  tutor: "Tutor",
  alumno: "Alumno de Preparatoria",
  docente: "Docente",
  empleado: "Empleado",
};
const queEs = (p: PersonaGesGuardada) => (p.clase === "tutor" ? (p.rol === "madre" ? "Mamá" : "Papá") : QUE_ES[p.clase]);

function linea(p: PersonaGesGuardada): string {
  const partes = [nombreGes(p)];
  if (p.clase === "tutor" || p.clase === "alumno") partes.push(`familia ${p.familia}`, p.grupos.join(", "));
  else partes.push([p.cargo, p.area].filter(Boolean).join(", "), p.activo ? "activo" : `baja${p.fechaBaja ? ` ${fecha(p.fechaBaja)}` : ""}`);
  if (!p.vigente) partes.push("ya no viene en GES");
  return partes.filter(Boolean).join(" · ");
}

export default function IdentificacionGes({ nombres, tarjetas, rol, email, titulo = "En GES", conTitulo = true }: {
  /** Los nombres con que la conocen SATAG y ZK. */
  nombres: (string | null | undefined)[];
  /** Todos sus TAGs; el primero es donde se guarda una decision. */
  tarjetas: string[];
  rol: RolPanel;
  email: string | null;
  titulo?: string;
  /** En una pestaña que ya se llama «Identificación», el encabezado sobra. */
  conTitulo?: boolean;
}) {
  const lee = LEEN.includes(rol);
  const decide = DECIDEN.includes(rol) && tarjetas.length > 0;
  const { datos, error } = useGes(lee);
  const [guardando, setGuardando] = useState(false);
  const [errorDecision, setErrorDecision] = useState<string | null>(null);

  const claveNombres = nombres.join("|");
  const claveTarjetas = tarjetas.join("|");
  const id = useMemo(
    () => (datos ? identificar({ nombres, tarjetas }, datos.indice, datos.decisiones) : null),
    // Las listas llegan nuevas en cada render; lo que importa es su contenido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos, claveNombres, claveTarjetas],
  );

  if (!lee) return null;

  async function decidir(d: Omit<Parameters<typeof decidirIdentidadGes>[0], "tarjeta">) {
    setGuardando(true);
    setErrorDecision(null);
    try {
      await decidirYRecargar({ tarjeta: tarjetas[0], ...d }, email);
    } catch (e) {
      setErrorDecision(e instanceof Error ? e.message : "No se pudo guardar la decisión.");
    } finally {
      setGuardando(false);
    }
  }

  const cuerpo = (() => {
    if (error) return <p className="submit-error" role="alert">{error}</p>;
    if (!datos || !id) return <p className="ficha__vacio">Leyendo GES…</p>;
    if (datos.total === 0) return <p className="ficha__vacio">Todavía no se ha cargado GES. TI lo carga en Datos › Archivos de GES.</p>;
    const principal = id.tutor ?? id.personal ?? id.alumno;
    return (
      <>
        <p style={{ margin: "0 0 10px" }}><b>{id.categoria}</b></p>
        <dl className="props">
          <div><dt>Sigue</dt><dd>{id.sigue === "si" ? "Sí, según GES" : id.sigue === "no" ? "No, según GES" : "No se sabe"}</dd></div>
          {id.tutor && <div><dt>{queEs(id.tutor)}</dt><dd>{linea(id.tutor)}</dd></div>}
          {id.personal && <div><dt>{queEs(id.personal)}</dt><dd>{linea(id.personal)}</dd></div>}
          {id.alumno && <div><dt>{queEs(id.alumno)}</dt><dd>{linea(id.alumno)}</dd></div>}
          {!id.tutor && !id.alumno && id.familia && (
            <div><dt>Familia</dt><dd>{id.familia.id}{id.familia.grupos.length ? ` · ${id.familia.grupos.join(", ")}` : ""}{id.familia.vigente ? "" : " · ya no viene en GES"}</dd></div>
          )}
          <div>
            <dt>Según</dt>
            <dd>{id.decision ? `decisión de TI (${id.decision.decididoPor}, ${fecha(id.decision.decididoEn)})` : id.fuente === "nombre" ? "el nombre" : "—"}</dd>
          </div>
        </dl>
        {id.preguntar && <p className="aviso-ficha" style={{ marginTop: 10 }}>Preguntar al presentarse.</p>}
        {id.decision?.nota && <p className="ti-hint">{id.decision.nota}</p>}

        {id.porRevisar.length > 0 && (
          <>
            <p className="ti-hint" style={{ marginTop: 12 }}>
              {id.porRevisar.length === 1 ? "Una persona de GES se parece" : `${id.porRevisar.length} personas de GES se parecen`}; el nombre solo no basta para decir que es ella.
            </p>
            <ul className="actividad">
              {id.porRevisar.slice(0, 8).map((p) => (
                <li key={p.gesId} style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                  <span>{queEs(p)}: {linea(p)}</span>
                  {decide && (
                    <button type="button" className="link-action" disabled={guardando} onClick={() => decidir({ veredicto: "persona", gesId: p.gesId })}>
                      Es esta persona
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {decide && (
          <div className="chip-row" style={{ marginTop: 10 }}>
            {id.decision ? (
              <button type="button" className="link-action" disabled={guardando} onClick={() => decidir({ veredicto: null })}>
                Quitar la decisión de TI
              </button>
            ) : (
              <>
                {principal && id.fuente === "nombre" && (
                  <button type="button" className="link-action" disabled={guardando} onClick={() => decidir({ veredicto: "persona", gesId: principal.gesId })}>
                    Confirmar que es {nombreGes(principal)}
                  </button>
                )}
                <button type="button" className="link-action" disabled={guardando} onClick={() => decidir({ veredicto: "no_localizado" })}>
                  No está en GES
                </button>
              </>
            )}
          </div>
        )}
        {decide && <p className="hint">La decisión se guarda para el TAG {tarjetas[0]} y manda sobre el nombre.</p>}
        {errorDecision && <p className="submit-error" role="alert">{errorDecision}</p>}
      </>
    );
  })();

  return (
    <section aria-label={titulo}>
      {conTitulo && <h3 style={{ marginTop: 26 }}>{titulo}</h3>}
      {cuerpo}
    </section>
  );
}
