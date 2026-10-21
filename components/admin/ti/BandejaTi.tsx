"use client";

// La Bandeja de Sistemas (fase 1; prototipo v2 aprobado el 21-oct).
//   - Al frente, la franja de Instalar: lo más usado, por todos, los lunes.
//   - Luego, lo que toca: Ahora / Hoy / Esta semana, cada cosa con su verbo y su
//     antigüedad. Tocarla lleva a la sección donde se resuelve.
//   - Al pie, «Hecho hoy, por quién»: todos ven lo mismo.
import { useEffect, useState } from "react";
import { listHechoHoy, type LecturaBandeja } from "@/lib/supabase/apiBandeja";
import { hechoPorPersona, umbralInventario, type Destino, type HechoHoy, type Tarea } from "@/lib/bandeja";
import { hora } from "@/lib/formato";
import Loader from "@/components/Loader";

const GRUPOS: [Tarea["grupo"], string][] = [
  ["ahora", "Ahora · afecta quién abre la pluma o que se pueda instalar"],
  ["hoy", "Hoy"],
  ["semana", "Esta semana"],
];

export default function BandejaTi({ lectura, error, tareas, onIr, onLeer }: {
  lectura: LecturaBandeja | null;
  error: string | null;
  tareas: Tarea[];
  onIr: (d: Destino) => void;
  onLeer: () => void;
}) {
  const [hecho, setHecho] = useState<HechoHoy[] | null>(null);
  useEffect(() => { listHechoHoy().then(setHecho).catch(() => setHecho([])); }, [lectura]);

  if (!lectura && !error) return <Loader label="Leyendo lo que le toca hoy a Sistemas…" />;
  if (!lectura) return <p className="submit-error" role="alert">{error} <button type="button" className="link-action" onClick={onLeer}>Reintentar</button></p>;

  const espera = lectura.porInstalar;
  const inv = lectura.entrada.inventario;
  const bajo = inv.disponibles < umbralInventario(inv.lunes);
  const personas = hecho ? hechoPorPersona(hecho) : [];
  const hoy = new Date().toLocaleDateString("en-CA");

  return (
    <div className="ti2-bandeja">
      <div className="ti2-cab">
        <div>
          <p className="ds-rotulo">Bandeja de Sistemas · la ven todos</p>
          <h2 className="titular">Lo que le toca hoy a Sistemas</h2>
        </div>
        <button type="button" className="ghost-action ghost-action--chico" onClick={onLeer}>Volver a leer</button>
      </div>
      {lectura.fallas.length > 0 && (
        <p className="ds-aviso ds-aviso--error" role="alert">No se pudo leer: {lectura.fallas.join(", ")}. Lo demás sí está al día.</p>
      )}

      {/* La franja de Instalar: lo más usado, por todos, los lunes (Gerardo, 21-oct). */}
      {espera.length > 0 ? (
        <section className="ti2-hero" aria-label="Instalar TAG">
          <div>
            <p className="ds-rotulo">Instalar TAG</p>
            <h3>{espera.length} {espera.length === 1 ? "familia pagó y espera" : "familias pagaron y esperan"} su TAG</h3>
            <p className="ds-nota">Por orden de pago · {inv.disponibles} TAGs de la escuela en inventario{bajo && <b className="ti2-rojo"> · inventario bajo</b>}</p>
          </div>
          <button type="button" className="primary-action ti2-hero__b" onClick={() => onIr({ seccion: "instalar" })}>Instalar</button>
          <ul className="ti2-hero__quienes">
            {espera.slice(0, 8).map((x) => (
              <li key={x.id}>{x.placa && <span className="cs-placa mono ti2-placa">{x.placa}</span>}<span>{x.nombre}</span>{x.pagoEn && <span className="ds-nota">· pagó {x.pagoEn.slice(0, 10) === hoy ? "hoy" : x.pagoEn.slice(5, 10).split("-").reverse().join("/")}</span>}</li>
            ))}
            {espera.length > 8 && <li className="ds-nota">y {espera.length - 8} más</li>}
          </ul>
        </section>
      ) : (
        <section className="ti2-hero ti2-hero--ok"><p><b className="ti2-verde">✓ Nadie espera su TAG.</b> <span className="ds-nota">{inv.disponibles} TAGs en inventario.</span></p></section>
      )}

      {tareas.length === 0 && <div className="ti2-cero"><b>✓ Bandeja en cero</b><span className="ds-nota">Todo lo que le toca hoy a Sistemas está al día.</span></div>}
      {GRUPOS.map(([g, titulo]) => {
        const xs = tareas.filter((t) => t.grupo === g);
        if (!xs.length) return null;
        return (
          <section key={g} className={`ti2-grupo ti2-grupo--${g}`} aria-label={titulo}>
            <h3 className="ti2-grupo__t">{titulo} <span className="ti2-grupo__n">{xs.length}</span></h3>
            <ul className="ti2-tareas">
              {xs.map((t) => (
                <li key={t.id}>
                  <button type="button" className={`ti2-tarea ti2-tarea--${g}`} onClick={() => onIr(t.ir)}>
                    <span className="ti2-tarea__txt"><b>{t.titulo}</b><span className="ds-nota">{t.detalle}</span></span>
                    {t.edad && <span className={`ti2-edad ${t.vieja ? "ti2-edad--vieja" : ""}`}>{t.edad}</span>}
                    <span className="ti2-tarea__ir" aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="ti2-hecho" aria-label="Hecho hoy">
        <h3 className="ti2-grupo__t">Hecho hoy, por quién {hecho && <span className="ti2-grupo__n">{hecho.length}</span>}</h3>
        {hecho === null ? <p className="ds-nota">Leyendo…</p>
          : hecho.length === 0 ? <p className="ds-nota">Todavía nada hoy.</p>
          : (
            <ul className="ti2-hecho__l">
              {personas.map((p) => (
                <li key={p.quien}>
                  <b>{p.quien}</b> <span className="ds-nota">· {p.n}</span>
                  <span className="ti2-hecho__q">{p.ultimos.slice(0, 4).map((x) => `${hora(x.en)} ${x.que.toLowerCase()}`).join(" · ")}{p.n > 4 ? " · …" : ""}</span>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}
