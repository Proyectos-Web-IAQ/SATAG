"use client";

// La pestaña Casos: los casos GUARDADOS del estacionamiento (bloque 89), con su
// estado, su historial y su evidencia.
//
// QUE CAMBIO. Hasta el 5-oct esta pantalla CALCULABA los casos con la bitacora y solo
// guardaba lo que TI decidia de cada uno (bloque 87). Desde el bloque 89 el caso
// EXISTE por si mismo: se abre a mano o lo abre una regla, tiene numero y dueño.
// Lo que `lib/casos.ts` sigue calculando ya no se muestra como lista de trabajo:
// queda en la seccion plegada «Detectados en la bitácora, sin registrar», y se
// vuelve caso cuando alguien aprieta «Registrar».
//
// Leen ti, contador, admin y super; escriben los mismos (la base lo verifica).
import { useCallback, useEffect, useMemo, useState } from "react";
import { TIPOS_CASO, type Caso } from "@/lib/casos";
import { abrirCaso, listCasos, listTiposCaso } from "@/lib/supabase/apiPanel";
import {
  ESTADOS_CASO,
  ETIQUETA_ESTADO_CASO,
  coincideBusqueda,
  contarPorEstado,
  estaVivo,
  numeroCaso,
  ordenarCasos,
  personaDelCaso,
  type CasoGuardado,
  type EstadoCasoGuardado,
  type TipoCasoCatalogo,
} from "@/lib/casosRegistro";
import DetalleCaso, { diaCaso } from "@/components/admin/DetalleCaso";

type FiltroEstado = "vivos" | "todos" | EstadoCasoGuardado;

const FILAS_POR_GRUPO = 40;

const PLURAL_ESTADO: Record<EstadoCasoGuardado, string> = {
  abierto: "abiertos",
  seguimiento: "en seguimiento",
  resuelto: "resueltos",
  descartado: "descartados",
};

export default function VistaCasos({ detectados, nombreDe, email }: {
  /** Lo que `lib/casos.ts` calcula hoy con la bitacora: se ofrece registrarlo si todavia no es caso. */
  detectados: Caso[];
  /** El nombre segun ZK, solo para quien puede ver identidades. */
  nombreDe: ((tarjeta: string) => string | undefined) | null;
  email: string | null;
}) {
  const [casos, setCasos] = useState<CasoGuardado[] | null>(null);
  const [tipos, setTipos] = useState<TipoCasoCatalogo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<FiltroEstado>("vivos");
  const [tipo, setTipo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);

  const leer = useCallback(async () => {
    setError(null);
    try {
      const [c, t] = await Promise.all([listCasos(), listTiposCaso()]);
      setCasos(c);
      setTipos(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron leer los casos.");
      setCasos((previos) => previos ?? []);
    }
  }, []);
  useEffect(() => {
    leer();
  }, [leer]);

  const tipoDe = useMemo(() => new Map(tipos.map((t) => [t.tipo, t])), [tipos]);
  const cuentas = useMemo(() => contarPorEstado(casos ?? []), [casos]);
  const vivos = cuentas.abierto + cuentas.seguimiento;

  const visibles = useMemo(
    () =>
      ordenarCasos(
        (casos ?? []).filter(
          (c) =>
            (estado === "todos" || (estado === "vivos" ? estaVivo(c.estado) : c.estado === estado)) &&
            (tipo === "" || c.tipo === tipo) &&
            coincideBusqueda(c, busqueda),
        ),
      ),
    [casos, estado, tipo, busqueda],
  );
  // Agrupados por tipo, en el orden del catalogo.
  const grupos = useMemo(() => {
    const m = new Map<string, CasoGuardado[]>();
    for (const c of visibles) m.set(c.tipo, [...(m.get(c.tipo) ?? []), c]);
    return [...m.entries()].sort((a, b) => (tipoDe.get(a[0])?.orden ?? 999) - (tipoDe.get(b[0])?.orden ?? 999));
  }, [visibles, tipoDe]);

  const sinRegistrar = useMemo(() => {
    const claves = new Set((casos ?? []).map((c) => c.clave).filter((c): c is string => c !== null));
    return detectados.filter((d) => !claves.has(d.clave));
  }, [casos, detectados]);

  return (
    <>
      <p className="titular__migas">
        <span>Estacionamiento</span>
        <span>›</span>
        <span>Casos</span>
      </p>
      <h2 className="titular">
        {casos === null
          ? "Leyendo los casos…"
          : vivos === 0
            ? "No hay casos por atender."
            : `${vivos} ${vivos === 1 ? "caso por atender" : "casos por atender"}.`}
      </h2>
      <p className="titular__sub">
        Cada caso tiene número, estado, historial y la evidencia de por qué SATAG lo marca. Se registran a mano desde la
        ficha de la persona, o desde aquí lo que la bitácora detecta.
      </p>
      {error && (
        <p className="submit-error" role="alert">
          {error}{" "}
          <button type="button" className="link-action" onClick={() => leer()}>Reintentar</button>
        </p>
      )}

      <div className="casos__cuentas" role="group" aria-label="Casos por estado">
        {ESTADOS_CASO.map((e) => (
          <button
            key={e}
            type="button"
            className="casos__cuenta"
            aria-pressed={estado === e}
            onClick={() => setEstado(estado === e ? "vivos" : e)}
          >
            <b>{cuentas[e]}</b> {PLURAL_ESTADO[e]}
          </button>
        ))}
      </div>

      <div className="casos__filtros">
        <label className="casos__filtro">
          <span>Estado</span>
          <select className="select" value={estado} onChange={(e) => setEstado(e.target.value as FiltroEstado)}>
            <option value="vivos">Abiertos y en seguimiento</option>
            <option value="todos">Todos</option>
            {ESTADOS_CASO.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO_CASO[e]}</option>)}
          </select>
        </label>
        <label className="casos__filtro">
          <span>Tipo</span>
          <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            {tipos.map((t) => <option key={t.tipo} value={t.tipo}>{t.titulo}</option>)}
          </select>
        </label>
        <label className="casos__filtro casos__filtro--buscar">
          <span>Buscar</span>
          <input
            className="input search"
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Número de caso, TAG, folio o nombre"
          />
        </label>
      </div>

      {casos !== null && visibles.length === 0 && <p className="ti-empty">No hay casos con estos filtros.</p>}

      {grupos.map(([t, lista]) => (
        <GrupoCasos
          key={t}
          tipo={tipoDe.get(t)}
          clave={t}
          casos={lista}
          abierto={abierto}
          onAbrir={(id) => setAbierto(abierto === id ? null : id)}
          tipoDe={tipoDe}
          email={email}
          onCambio={leer}
        />
      ))}

      {casos !== null && sinRegistrar.length > 0 && (
        <SinRegistrar
          detectados={sinRegistrar}
          nombreDe={nombreDe}
          email={email}
          onRegistrado={leer}
        />
      )}
    </>
  );
}

function GrupoCasos({ tipo, clave, casos, abierto, onAbrir, tipoDe, email, onCambio }: {
  tipo: TipoCasoCatalogo | undefined;
  clave: string;
  casos: CasoGuardado[];
  abierto: string | null;
  onAbrir: (id: string) => void;
  tipoDe: Map<string, TipoCasoCatalogo>;
  email: string | null;
  onCambio: () => void;
}) {
  const [todos, setTodos] = useState(false);
  // El caso abierto siempre se ve, aunque quede pasado el corte.
  const idx = casos.findIndex((c) => c.id === abierto);
  const mostrar = todos || casos.length <= FILAS_POR_GRUPO ? casos : casos.slice(0, Math.max(FILAS_POR_GRUPO, idx + 1));
  return (
    <section className="casos__grupo" aria-labelledby={`casos-g-${clave}`}>
      <h3 id={`casos-g-${clave}`} className="casos__t">
        {tipo?.titulo ?? clave} <span className="casos__n">{casos.length}</span>
      </h3>
      {tipo && <p className="ti-hint">{tipo.queHacer}</p>}
      <ul className="casos__l caso-lista">
        {mostrar.map((c) => (
          <li key={c.id} className="casos__fila">
            <button type="button" className="caso-fila" aria-expanded={abierto === c.id} onClick={() => onAbrir(c.id)}>
              <span className="caso-fila__t">
                <span className="caso-fila__n">{numeroCaso(c.numero)}</span> {c.titulo}
              </span>
              <span className="caso-fila__m">{personaDelCaso(c)}{c.folio && c.tarjeta ? ` · TAG ${c.tarjeta}` : ""} · {diaCaso(c.actualizadoEn)}</span>
              <span className={`casos__estado casos__estado--${c.estado}`}>{ETIQUETA_ESTADO_CASO[c.estado]}</span>
            </button>
            {abierto === c.id && (
              <DetalleCaso caso={c} tipo={tipoDe.get(c.tipo)} puedeEditar email={email} onCambio={onCambio} />
            )}
          </li>
        ))}
      </ul>
      {mostrar.length < casos.length && (
        <button type="button" className="link-action" onClick={() => setTodos(true)}>
          Mostrar los {casos.length - mostrar.length} restantes
        </button>
      )}
    </section>
  );
}

const TITULO_TIPO = new Map(TIPOS_CASO.map((t) => [t.tipo, t.titulo]));

/**
 * Lo que la bitacora detecta y todavia no es caso. «Registrar» abre el caso con la
 * MISMA clave que usa el calculo (tipo:tarjeta[:lote]): asi no se duplica aunque se
 * apriete dos veces, y el caso guardado y el detectado son el mismo.
 */
function SinRegistrar({ detectados, nombreDe, email, onRegistrado }: {
  detectados: Caso[];
  nombreDe: ((tarjeta: string) => string | undefined) | null;
  email: string | null;
  onRegistrado: () => void;
}) {
  const [haciendo, setHaciendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function registrar(c: Caso) {
    setHaciendo(c.clave);
    setError(null);
    try {
      await abrirCaso(
        {
          tipo: c.tipo,
          titulo: `${TITULO_TIPO.get(c.tipo) ?? c.tipo}${c.lote ? ` (${c.lote})` : ""}`,
          detalle: c.detalle,
          tarjeta: c.tarjeta,
          clave: c.clave,
          origen: "regla",
          regla: "lib/casos.ts",
          evidencia: {
            folio: c.folio ?? "",
            desde: c.desde,
            ultima: c.ultima,
            dias: c.dias,
            veces: c.veces,
            ...(c.nivel ? { nivel: c.nivel === "rojo" ? "Rojo: 14 días o más sin abrir" : "Amarillo: de 7 a 13 días sin abrir" } : {}),
            patron: c.grupo,
          },
        },
        email,
      );
      onRegistrado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el caso.");
    } finally {
      setHaciendo(null);
    }
  }

  // Sin nada detectado (o sin acceso a la bitacora, como Administracion) no se muestra.
  if (detectados.length === 0) return null;
  return (
    <details className="casos__sinreg">
      <summary>
        Detectados en la bitácora, sin registrar <span className="casos__n">{detectados.length}</span>
      </summary>
      <p className="ti-hint">
        Lo que la bitácora marca hoy y todavía no tiene número de caso. Registre el que vaya a atender: queda con su
        historial y su evidencia. Uno que deja de pasar desaparece de esta lista solo.
      </p>
      {error && <p className="submit-error" role="alert">{error}</p>}
      <ul className="casos__l">
        {detectados.slice(0, 200).map((c) => (
          <li key={c.clave} className="casos__fila casos__fila--sinreg">
            <div>
              <div className="casos__cab">
                <strong>{c.tarjeta}</strong>
                {c.folio && <span> · {c.folio}</span>}
                {nombreDe?.(c.tarjeta) && <span> · {nombreDe(c.tarjeta)}</span>}
              </div>
              <p className="casos__d">{TITULO_TIPO.get(c.tipo) ?? c.tipo}: {c.detalle}</p>
            </div>
            <button type="button" className="ghost-action ghost-action--chico" disabled={haciendo !== null} onClick={() => registrar(c)}>
              {haciendo === c.clave ? "Registrando…" : "Registrar"}
            </button>
          </li>
        ))}
      </ul>
      {detectados.length > 200 && <p className="ti-hint">Se muestran 200 de {detectados.length}. Registre algunos y aparecerán los siguientes.</p>}
    </details>
  );
}
