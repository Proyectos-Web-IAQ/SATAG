"use client";

// Las piezas de interfaz de la pestana Estacionamiento.
//
// POR QUE VIVEN APARTE. El panel tenia setecientas lineas mezclando tres cosas:
// decidir que mostrar, componer el relato y resolver como se ve una tabla ordenable.
// Separar lo tercero deja las otras dos legibles, y de paso estas piezas se prueban
// y se reusan sin arrastrar el panel entero.
//
// NADA DE ESTO NECESITA UNA DEPENDENCIA. Son cinco componentes de interfaz; traer una
// biblioteca de tablas para ordenar por una columna costaria mas de lo que da, igual
// que con las graficas.

import { useId, useMemo, useState, type ReactNode } from "react";

/* ------------------------------------------------------------------ navegacion */

export interface Vista {
  clave: string;
  titulo: string;
  /** Un numero al lado del nombre: cuantas cosas hay que mirar en esa vista. */
  cuenta?: number;
}

/**
 * Las vistas del tablero, como pestanas.
 *
 * Es `role="tablist"` de verdad, con flechas del teclado, porque siete paneles
 * apilados obligan a recorrer la pagina para encontrar uno y porque un tablero que
 * solo se navega con el raton deja fuera a quien no lo usa.
 */
export function Vistas({
  vistas,
  activa,
  onCambio,
}: {
  vistas: Vista[];
  activa: string;
  onCambio: (clave: string) => void;
}) {
  const id = useId();
  const mover = (e: React.KeyboardEvent, i: number) => {
    const salto = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (salto === 0) return;
    e.preventDefault();
    onCambio(vistas[(i + salto + vistas.length) % vistas.length].clave);
  };

  return (
    <div className="vistas" role="tablist" aria-label="Vistas del estacionamiento">
      {vistas.map((v, i) => (
        <button
          key={v.clave}
          type="button"
          role="tab"
          id={`${id}-${v.clave}`}
          className="vistas__b"
          aria-selected={v.clave === activa}
          tabIndex={v.clave === activa ? 0 : -1}
          onClick={() => onCambio(v.clave)}
          onKeyDown={(e) => mover(e, i)}
        >
          {v.titulo}
          {v.cuenta !== undefined && v.cuenta > 0 && <span className="vistas__n">{v.cuenta}</span>}
        </button>
      ))}
    </div>
  );
}

/** Dos o tres opciones excluyentes, todas a la vista. */
export function Segmentado({
  opciones,
  activa,
  onCambio,
  etiqueta,
}: {
  opciones: { clave: string; titulo: string }[];
  activa: string;
  onCambio: (clave: string) => void;
  etiqueta: string;
}) {
  return (
    <div className="segmentado" role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button
          key={o.clave}
          type="button"
          className="segmentado__b"
          aria-pressed={o.clave === activa}
          onClick={() => onCambio(o.clave)}
        >
          {o.titulo}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ encabezados */

/**
 * Rotulo, titulo y nota de una seccion.
 *
 * El TITULO lleva el hallazgo, no el tema. La investigacion sobre titulos de
 * visualizaciones es consistente en esto: el sesgo del titulo determina el mensaje
 * que la audiencia recuerda, y los lectores siguen juzgando la grafica neutral. Un
 * titulo que solo nombra el tema hace que cada quien derive su propia conclusion.
 * Por eso la NOTA va debajo y dice como se midio: el poder del titulo obliga a poner
 * al lado la cifra en que se apoya.
 */
export function Seccion({
  rotulo,
  titulo,
  nota,
  children,
}: {
  rotulo: string;
  titulo: ReactNode;
  nota?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <p className="sec__rotulo">{rotulo}</p>
      <h3 className="sec__titulo">{titulo}</h3>
      {nota && <p className="sec__nota">{nota}</p>}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ cifras */

export function Kpis({ children }: { children: ReactNode }) {
  return <div className="kpis">{children}</div>;
}

export function Kpi({
  rotulo,
  valor,
  unidad,
  pie,
  marcada,
}: {
  rotulo: string;
  valor: ReactNode;
  unidad?: string;
  pie?: ReactNode;
  marcada?: boolean;
}) {
  return (
    <div className={`kpi${marcada ? " kpi--marca" : ""}`}>
      <p className="kpi__r">{rotulo}</p>
      <p className="kpi__v">
        {valor}
        {unidad && <span className="kpi__u">{unidad}</span>}
      </p>
      {pie && <p className="kpi__p">{pie}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ tabla */

export interface Columna<T> {
  clave: string;
  titulo: string;
  /**
   * Que significa esta columna, en tres o cuatro palabras, debajo del titulo.
   *
   * NO ES OPCIONAL POR PEREZA: un encabezado como «Entradas» o «En la franja critica»
   * obliga a cada quien a adivinar que se esta contando, y adivinar mal una columna
   * es peor que no tenerla. Va visible y no en un globo de ayuda, porque lo que hay
   * que buscar no se lee.
   */
  pie?: string;
  /** Numerica: se alinea a la derecha y usa cifras tabulares. */
  num?: boolean;
  /** Lo que se pinta en la celda. */
  celda: (f: T) => ReactNode;
  /** Por que se ordena. Si falta, la columna no se puede ordenar. */
  orden?: (f: T) => number | string;
  /** De 0 a 1: pinta una barra fina debajo del numero para comparar de un vistazo. */
  barra?: (f: T) => number;
}

/**
 * Una tabla que se ordena por cualquier columna y se busca por texto.
 *
 * EL ENCABEZADO ES UN BOTON, no un `th` con `onClick`: asi llega el foco por teclado
 * y el lector de pantalla anuncia que se puede activar. `aria-sort` va en el boton y
 * dice en que sentido esta ordenada, que es lo que un `th` resaltado no comunica.
 *
 * El orden inicial lo decide quien la usa, y por omision es DESCENDENTE: en este
 * tablero casi todas las preguntas son «quien mas», no «quien menos».
 */
export function TablaPro<T>({
  filas,
  cols,
  claveFila,
  ordenInicial,
  buscar,
  etiquetaBusqueda = "Buscar",
  marcada,
  vacio = "No hay nada que mostrar.",
  scroll,
}: {
  filas: T[];
  cols: Columna<T>[];
  claveFila: (f: T) => string;
  ordenInicial?: string;
  /** Si se pasa, aparece el buscador y filtra por el texto que devuelva. */
  buscar?: (f: T) => string;
  etiquetaBusqueda?: string;
  marcada?: (f: T) => boolean;
  vacio?: ReactNode;
  /** La tabla se desplaza dentro de su propia caja en vez de estirar la pagina. */
  scroll?: boolean;
}) {
  const [orden, setOrden] = useState<string | null>(ordenInicial ?? null);
  const [asc, setAsc] = useState(false);
  const [texto, setTexto] = useState("");
  const idBusqueda = useId();

  const visibles = useMemo(() => {
    const t = texto.trim().toLowerCase();
    let out = buscar && t ? filas.filter((f) => buscar(f).toLowerCase().includes(t)) : [...filas];
    const col = cols.find((c) => c.clave === orden);
    if (col?.orden) {
      const k = col.orden;
      out = [...out].sort((a, b) => {
        const x = k(a), y = k(b);
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es");
        return asc ? c : -c;
      });
    }
    return out;
  }, [filas, cols, orden, asc, texto, buscar]);

  const pulsar = (c: Columna<T>) => {
    if (!c.orden) return;
    if (orden === c.clave) setAsc((v) => !v);
    else {
      setOrden(c.clave);
      setAsc(false);
    }
  };

  return (
    <>
      {buscar && (
        <div className="buscador">
          <label className="sr-only" htmlFor={idBusqueda}>{etiquetaBusqueda}</label>
          <input
            id={idBusqueda}
            type="search"
            placeholder={etiquetaBusqueda}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <span className="buscador__n" role="status">
            {visibles.length === filas.length
              ? `${filas.length} ${filas.length === 1 ? "renglón" : "renglones"}`
              : `${visibles.length} de ${filas.length}`}
          </span>
        </div>
      )}

      {visibles.length === 0 ? (
        <p className="ti-empty">{vacio}</p>
      ) : (
        <div className={scroll ? "tabla-scroll" : "table-wrap"}>
          <table className="admin-table tabla-pro">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th
                    key={c.clave}
                    className={c.num ? "num" : undefined}
                    // `aria-sort` es de la CELDA de encabezado, no del boton: el rol
                    // button no lo admite y un lector de pantalla lo ignoraria ahi.
                    aria-sort={orden === c.clave ? (asc ? "ascending" : "descending") : undefined}
                  >
                    {c.orden ? (
                      <button
                        type="button"
                        className="orden"
                        onClick={() => pulsar(c)}
                      >
                        {c.titulo}
                        {orden === c.clave && <i aria-hidden="true">{asc ? "▲" : "▼"}</i>}
                        {c.pie && <span className="sub">{c.pie}</span>}
                      </button>
                    ) : (
                      <span style={{ display: "inline-block", padding: "10px 12px" }}>
                        {c.titulo}
                        {c.pie && <span className="sub">{c.pie}</span>}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={claveFila(f)} className={marcada?.(f) ? "fila-marcada" : undefined}>
                  {cols.map((c) => {
                    const p = c.barra?.(f);
                    return (
                      <td key={c.clave} className={c.num ? "num" : undefined}>
                        {c.celda(f)}
                        {p !== undefined && p > 0 && (
                          <span className="barra-celda" aria-hidden="true">
                            <i style={{ width: `${Math.min(100, Math.round(p * 100))}%` }} />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
