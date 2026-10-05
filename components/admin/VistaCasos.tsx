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

type Lista = "resolver" | "observacion" | "resueltos";

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
  const [lista, setLista] = useState<Lista>("resolver");

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
  // TRES LISTAS, no cuatro estados. Lo amarillo (de 7 a 13 dias sin venir) no pide
  // nada hoy: es observacion. Mezclarlo con lo que si pide una accion es lo que hacia
  // que 104 casos se sintieran como 104 pendientes (Gerardo, 5-oct).
  const listaDe = (x: (typeof conEstado)[number]): Lista =>
    x.estado === "resuelto" ? "resueltos" : x.c.nivel === "amarillo" ? "observacion" : "resolver";
  const cuenta = (l: Lista) => conEstado.filter((x) => listaDe(x) === l).length;
  const visibles = conEstado.filter((x) => listaDe(x) === lista);
  const porResolver = cuenta("resolver");
  const patrones = new Set(conEstado.filter((x) => listaDe(x) === "resolver").map((x) => `${x.c.tipo}|${x.c.grupo}`)).size;
  const guardado = (nuevo: SeguimientoCaso) => setSeguimiento((m) => new Map(m ?? []).set(nuevo.clave, nuevo));

  return (
    <>
      <p className="titular__migas">
        <span>Estacionamiento</span>
        <span>›</span>
        <span>Casos</span>
      </p>
      <h2 className="titular">
        {porResolver === 0
          ? "No hay casos por resolver: lo que pasa por la pluma cuadra con SATAG y ZK."
          : `${porResolver} ${porResolver === 1 ? "caso por resolver" : "casos por resolver"}, en ${patrones} ${patrones === 1 ? "patrón" : "patrones"}.`}
      </h2>
      <p className="titular__sub">
        Los casos con el mismo patrón se resuelven con la misma decisión: abra el grupo y dele seguimiento a todos de una
        vez. Se calculan con la bitácora guardada; uno que deja de pasar desaparece solo, y uno resuelto que vuelve a
        pasar regresa con su nota.
      </p>
      {errorLectura && (
        <p className="submit-error" role="alert">
          {errorLectura}{" "}
          <button type="button" className="link-action" onClick={() => leer()}>Reintentar</button>
        </p>
      )}

      <div className="gente__filtros">
        <Segmentado
          etiqueta="Lista"
          activa={lista}
          onCambio={(v) => setLista(v as Lista)}
          opciones={[
            { clave: "resolver", titulo: `Por resolver (${porResolver})` },
            { clave: "observacion", titulo: `En observación (${cuenta("observacion")})` },
            { clave: "resueltos", titulo: `Resueltos (${cuenta("resueltos")})` },
          ]}
        />
      </div>
      {lista === "observacion" && (
        <p className="ti-hint">
          De 7 a 13 días sin abrir la pluma. No piden nada todavía: si llegan a 14 días pasan solos a «Por resolver».
        </p>
      )}

      {visibles.length === 0 && <p className="ti-empty">No hay casos en esta lista.</p>}

      {TIPOS_CASO.map((t) => {
        const deTipo = visibles.filter((x) => x.c.tipo === t.tipo);
        if (deTipo.length === 0) return null;
        const grupos = new Map<string, typeof deTipo>();
        for (const x of deTipo) grupos.set(x.c.grupo, [...(grupos.get(x.c.grupo) ?? []), x]);
        const ordenados = [...grupos.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "es"));
        return (
          <section key={t.tipo} className="casos__grupo" aria-labelledby={`casos-${t.tipo}`}>
            <h3 id={`casos-${t.tipo}`} className="casos__t">
              {t.titulo} <span className="casos__n">{deTipo.length}</span>
            </h3>
            <p className="ti-hint">{t.queHacer}</p>
            {ordenados.map(([grupo, xs]) => (
              <details key={grupo} className="casos__patron" open={ordenados.length === 1 && xs.length <= 5}>
                <summary>
                  <span className="casos__patron-t">{grupo}</span> <span className="casos__n">{xs.length}</span>
                </summary>
                {puedeEditar && lista !== "resueltos" && xs.length > 1 && (
                  <SeguimientoEnLote claves={xs.map((x) => x.c.clave)} email={email} onGuardado={guardado} />
                )}
                <ul className="casos__l">
                  {xs.map(({ c, s, estado, volvio }) => (
                    <FilaCaso
                      key={c.clave}
                      caso={c}
                      seguimiento={s}
                      estado={estado}
                      volvio={volvio}
                      nombre={nombreDe?.(c.tarjeta)}
                      puedeEditar={puedeEditar}
                      email={email}
                      onGuardado={guardado}
                    />
                  ))}
                </ul>
              </details>
            ))}
          </section>
        );
      })}
    </>
  );
}

/**
 * Una decision para todo un patron: el mismo estado y la misma nota en cada caso.
 * Va uno por uno contra el mismo RPC que la fila (bloque 87): cada caso queda en el
 * historial con su propio renglon, y si uno falla se sabe cual.
 */
function SeguimientoEnLote({
  claves,
  email,
  onGuardado,
}: {
  claves: string[];
  email: string | null;
  onGuardado: (s: SeguimientoCaso) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [estado, setEstado] = useState<EstadoCaso>("revision");
  const [nota, setNota] = useState("");
  const [hechos, setHechos] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    setHechos(0);
    let i = 0;
    for (const clave of claves) {
      try {
        onGuardado(await seguirCaso(clave, estado, nota, email));
        i += 1;
        setHechos(i);
      } catch (err) {
        setError(`Se guardaron ${i} de ${claves.length}. ${err instanceof Error ? err.message : "No se pudo guardar el caso."}`);
        setHechos(null);
        return;
      }
    }
    setHechos(null);
    setAbierta(false);
    setNota("");
  }

  if (!abierta) {
    return (
      <button type="button" className="link-action casos__lote-b" onClick={() => setAbierta(true)}>
        Dar seguimiento a los {claves.length} de este grupo
      </button>
    );
  }
  const guardando = hechos !== null;
  return (
    <div className="casos__form casos__form--lote">
      <Segmentado
        etiqueta="Estado de todo el grupo"
        activa={estado}
        onCambio={(v) => setEstado(v as EstadoCaso)}
        opciones={(Object.keys(ETIQUETA_ESTADO) as EstadoCaso[]).map((e) => ({ clave: e, titulo: ETIQUETA_ESTADO[e] }))}
      />
      <label className="label" htmlFor={`lote-${claves[0]}`}>
        Nota para los {claves.length}{estado === "resuelto" ? " (qué se hizo)" : ""}
      </label>
      <textarea id={`lote-${claves[0]}`} className="input textarea" maxLength={2000} value={nota} onChange={(e) => setNota(e.target.value)} />
      {error && <p className="submit-error" role="alert">{error}</p>}
      <div className="chip-row">
        <button type="button" className="btn" disabled={guardando || (estado === "resuelto" && !nota.trim())} onClick={guardar}>
          {guardando ? `Guardando ${hechos} de ${claves.length}…` : `Guardar los ${claves.length}`}
        </button>
        <button type="button" className="link-action" disabled={guardando} onClick={() => setAbierta(false)}>
          Cancelar
        </button>
      </div>
    </div>
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
