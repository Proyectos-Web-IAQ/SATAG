"use client";

// La pestaña Casos: lo que no cuadra entre la pluma, ZK y SATAG, con su seguimiento.
//
// Los casos los calcula lib/casos.ts con la bitacora guardada; aqui solo se muestran
// y se guarda lo que TI decide de cada uno (bloque 87). Contabilidad los ve sin
// poder cambiarlos: es lectura para conciliar, no trabajo suyo.
import { useEffect, useMemo, useState } from "react";
import { TIPOS_CASO, estadoVisible, type Caso, type EstadoCaso, type SeguimientoCaso } from "@/lib/casos";
import { listSeguimientoCasos, seguirCaso } from "@/lib/supabase/apiPanel";
import { Segmentado } from "@/components/admin/UiEstacionamiento";

const ETIQUETA_ESTADO: Record<EstadoCaso, string> = {
  pendiente: "Pendiente",
  revision: "En revisión",
  resuelto: "Resuelto",
};

const fecha = (t: string) => {
  const [a, m, d] = t.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d, 12).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
};
const hora = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));

export default function VistaCasos({
  casos,
  nombreDe,
  puedeEditar,
  email,
}: {
  casos: Caso[];
  /** El nombre segun ZK, solo para quien puede ver identidades. */
  nombreDe: ((tarjeta: string) => string | undefined) | null;
  puedeEditar: boolean;
  email: string | null;
}) {
  const [seguimiento, setSeguimiento] = useState<Map<string, SeguimientoCaso> | null>(null);
  const [errorLectura, setErrorLectura] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<EstadoCaso | "abiertos">("abiertos");

  async function leer() {
    setErrorLectura(null);
    try {
      setSeguimiento(new Map((await listSeguimientoCasos()).map((s) => [s.clave, s])));
    } catch (err) {
      setErrorLectura(err instanceof Error ? err.message : "No se pudo leer el seguimiento de los casos.");
      setSeguimiento(new Map());
    }
  }
  useEffect(() => {
    leer();
  }, []);

  const conEstado = useMemo(
    () => casos.map((c) => ({ c, s: seguimiento?.get(c.clave), ...estadoVisible(c, seguimiento?.get(c.clave)) })),
    [casos, seguimiento],
  );
  const cuenta = (e: EstadoCaso) => conEstado.filter((x) => x.estado === e).length;
  const abiertos = cuenta("pendiente") + cuenta("revision");
  const visibles = conEstado.filter((x) => (filtro === "abiertos" ? x.estado !== "resuelto" : x.estado === filtro));

  return (
    <>
      <p className="titular__migas">
        <span>Estacionamiento</span>
        <span>›</span>
        <span>Casos</span>
      </p>
      <h2 className="titular">
        {abiertos === 0
          ? "No hay casos abiertos: todo lo que pasa por la pluma cuadra con SATAG y ZK."
          : `${abiertos} ${abiertos === 1 ? "caso abierto" : "casos abiertos"} entre la pluma, ZK y SATAG.`}
      </h2>
      <p className="titular__sub">
        Se calculan con la bitácora guardada cada vez que se abre esta pantalla: un caso que deja de pasar desaparece
        solo, y uno resuelto que vuelve a pasar regresa a pendientes con su nota.
      </p>
      {errorLectura && (
        <p className="submit-error" role="alert">
          {errorLectura}{" "}
          <button type="button" className="link-action" onClick={() => leer()}>Reintentar</button>
        </p>
      )}

      <div className="gente__filtros">
        <Segmentado
          etiqueta="Estado"
          activa={filtro}
          onCambio={(v) => setFiltro(v as EstadoCaso | "abiertos")}
          opciones={[
            { clave: "abiertos", titulo: `Abiertos (${abiertos})` },
            { clave: "pendiente", titulo: `Pendientes (${cuenta("pendiente")})` },
            { clave: "revision", titulo: `En revisión (${cuenta("revision")})` },
            { clave: "resuelto", titulo: `Resueltos (${cuenta("resuelto")})` },
          ]}
        />
      </div>

      {visibles.length === 0 && <p className="ti-empty">No hay casos en esta lista.</p>}

      {TIPOS_CASO.map((t) => {
        const deTipo = visibles.filter((x) => x.c.tipo === t.tipo);
        if (deTipo.length === 0) return null;
        return (
          <section key={t.tipo} className="casos__grupo" aria-labelledby={`casos-${t.tipo}`}>
            <h3 id={`casos-${t.tipo}`} className="casos__t">
              {t.titulo} <span className="casos__n">{deTipo.length}</span>
            </h3>
            <p className="ti-hint">{t.queHacer}</p>
            <ul className="casos__l">
              {deTipo.map(({ c, s, estado, volvio }) => (
                <FilaCaso
                  key={c.clave}
                  caso={c}
                  seguimiento={s}
                  estado={estado}
                  volvio={volvio}
                  nombre={nombreDe?.(c.tarjeta)}
                  puedeEditar={puedeEditar}
                  email={email}
                  onGuardado={(nuevo) => setSeguimiento((m) => new Map(m ?? []).set(nuevo.clave, nuevo))}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function FilaCaso({
  caso: c,
  seguimiento: s,
  estado,
  volvio,
  nombre,
  puedeEditar,
  email,
  onGuardado,
}: {
  caso: Caso;
  seguimiento: SeguimientoCaso | undefined;
  estado: EstadoCaso;
  volvio: boolean;
  nombre: string | undefined;
  puedeEditar: boolean;
  email: string | null;
  onGuardado: (s: SeguimientoCaso) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState<EstadoCaso>(estado);
  const [nota, setNota] = useState(s?.nota ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      onGuardado(await seguirCaso(c.clave, nuevoEstado, nota, email));
      setAbierta(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el caso.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <li className="casos__fila">
      <div className="casos__cab">
        {c.nivel && (
          <span
            className={`casos__semaforo casos__semaforo--${c.nivel}`}
            role="img"
            aria-label={c.nivel === "rojo" ? "Rojo: 14 días o más sin abrir" : "Amarillo: de 7 a 13 días sin abrir"}
          />
        )}
        <strong>{c.tarjeta}</strong>
        {c.folio && <span> · {c.folio}</span>}
        {nombre && <span> · {nombre}</span>}
        <span className={`casos__estado casos__estado--${estado}`}>{volvio ? "Volvió a pasar" : ETIQUETA_ESTADO[estado]}</span>
      </div>
      <p className="casos__d">{c.detalle}</p>
      <p className="casos__f">
        {c.tipo === "sin-uso"
          ? c.nivel === "rojo" ? "Candidato a baja" : "En observación"
          : c.dias === 1 ? `El ${fecha(c.ultima)}` : `Del ${fecha(c.desde)} al ${fecha(c.ultima)}, ${c.dias} días`}
        {s && (
          <>
            {" · "}
            {s.nota ? <>«{s.nota}»</> : "sin nota"} — {s.actualizadoPor}, {hora(s.actualizadoEn)}
          </>
        )}
      </p>
      {puedeEditar && !abierta && (
        <button
          type="button"
          className="link-action"
          onClick={() => {
            setNuevoEstado(estado === "pendiente" ? "revision" : estado);
            setNota(s?.nota ?? "");
            setAbierta(true);
          }}
        >
          {s ? "Actualizar seguimiento" : "Dar seguimiento"}
        </button>
      )}
      {puedeEditar && abierta && (
        <div className="casos__form">
          <Segmentado
            etiqueta={`Estado del caso ${c.tarjeta}`}
            activa={nuevoEstado}
            onCambio={(v) => setNuevoEstado(v as EstadoCaso)}
            opciones={(Object.keys(ETIQUETA_ESTADO) as EstadoCaso[]).map((e) => ({ clave: e, titulo: ETIQUETA_ESTADO[e] }))}
          />
          <label className="label" htmlFor={`nota-${c.clave}`}>
            Nota{nuevoEstado === "resuelto" ? " (qué se hizo)" : ""}
          </label>
          <textarea
            id={`nota-${c.clave}`}
            className="input textarea"
            maxLength={2000}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
          {error && <p className="submit-error" role="alert">{error}</p>}
          <div className="chip-row">
            <button type="button" className="btn" disabled={guardando || (nuevoEstado === "resuelto" && !nota.trim())} onClick={guardar}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" className="link-action" disabled={guardando} onClick={() => setAbierta(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
