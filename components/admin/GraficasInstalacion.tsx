"use client";

import { useRef, useState } from "react";
import { duracion, personaCorta } from "@/lib/duracion";

// Las dos graficas del tablero de instalacion. SVG en linea, sin libreria: el
// sitio es un export estatico y meterle una dependencia de graficas para dibujar
// seis puntos y cinco columnas costaria mas de lo que da.
//
// PALETA. Sale de la institucional (Pantone) que ya vive en globals.css, no de
// una inventada. El azul #002E6C es demasiado oscuro para una marca de datos
// (queda fuera de la banda de luminosidad), asi que las marcas usan un paso mas
// claro del mismo azul, --viz-serie-1; el rojo es el Pantone 185 C tal cual. El
// par se valido: separacion para daltonismo DeltaE 19.7 y contraste sobre blanco
// por encima de 3:1 los dos.
//
// El TEXTO nunca lleva color de serie: los rotulos y los ejes van en los tonos de
// tinta del sitio y la identidad la carga el punto de color que va al lado.

export interface FilaDia {
  dia: string; // AAAA-MM-DD, ya en fecha de Queretaro
  tags: number;
  medibles: number;
  mediana: number | null;
}

export interface FilaPersona {
  clave: string;
  email: string | null;
  tags: number;
  medibles: number;
  mediana: number | null;
  masRapida: number | null;
  masTardada: number | null;
  // Cada duracion medible, una por instalacion. Es lo que dibuja la grafica de
  // dispersion: con seis datos, ensenar los seis es mas honesto que resumirlos.
  deltas: { folio: string; ms: number }[];
}

function diaCorto(dia: string): string {
  const [y, m, d] = dia.split("-");
  return d && m && y ? `${d}/${m}` : dia;
}

// ---- Globo de datos, compartido por las dos graficas ----

interface Globo { left: number; top: number; titulo: string; lineas: string[] }

// Se posiciona desde el rectangulo de la MARCA, no desde el puntero: asi el globo
// sale igual con el raton y con el teclado (Tab), que es justo lo que se pide
// —que el foco muestre lo mismo que el hover— y no depende de coordenadas del
// viewBox, que escalan con el ancho de la pantalla.
function posDeMarca(destino: Element, contenedor: HTMLDivElement | null) {
  if (!contenedor) return { left: 0, top: 0 };
  const m = destino.getBoundingClientRect();
  const c = contenedor.getBoundingClientRect();
  // El tope de 44 evita que el globo se salga por arriba del contenedor: ahi lo
  // recortaria el scroll horizontal y la marca de la primera fila se quedaria
  // sin poder leerse.
  return { left: m.left - c.left + m.width / 2, top: Math.max(m.top - c.top, 44) };
}

function GloboDatos({ g }: { g: Globo }) {
  return (
    <div className="viz-globo" style={{ left: g.left, top: g.top }} role="tooltip">
      <span className="viz-globo__valor">{g.titulo}</span>
      {g.lineas.map((l) => (
        <span className="viz-globo__linea" key={l}>{l}</span>
      ))}
    </div>
  );
}

// =====================================================================
// 1. INSTALACIONES POR DIA — columnas
//
// Una sola serie, asi que no lleva leyenda: el titulo ya dice que se grafica.
// Cada columna trae su valor en la tapa, y por eso NO hay eje vertical: los
// numeros ya estan y un eje ademas seria tinta repetida.
// =====================================================================
export function ColumnasPorDia({ dias }: { dias: FilaDia[] }) {
  const cont = useRef<HTMLDivElement>(null);
  const [globo, setGlobo] = useState<Globo | null>(null);

  // Una sola columna no es una grafica: es un dato. Cuando solo hay un dia con
  // actividad, la cifra ya vive en las tarjetas de arriba.
  if (dias.length < 2) return null;

  // Cronologico de izquierda a derecha (la lista llega de mas nuevo a mas viejo).
  const orden = [...dias].sort((a, b) => a.dia.localeCompare(b.dia));
  const W = 720, izq = 8, der = 8, arriba = 24, alto = 118, abajo = 30;
  const H = arriba + alto + abajo;
  const anchoUtil = W - izq - der;
  const banda = anchoUtil / orden.length;
  const ancho = Math.min(24, banda * 0.6);
  const max = Math.max(...orden.map((d) => d.tags), 1);
  const yDe = (v: number) => arriba + alto - (v / max) * alto;
  const base = arriba + alto;

  return (
    <div className="viz" ref={cont}>
      <svg viewBox={`0 0 ${W} ${H}`} className="viz-svg" role="img"
        aria-label={`Instalaciones por día: ${orden.map((d) => `${diaCorto(d.dia)}, ${d.tags}`).join("; ")}`}>
        {/* Linea base: hairline solida, un tono sobre la superficie. */}
        <line x1={izq} y1={base} x2={W - der} y2={base} className="viz-eje" />
        {orden.map((d, i) => {
          const cx = izq + banda * i + banda / 2;
          const x = cx - ancho / 2;
          const yTapa = yDe(d.tags);
          const r = Math.min(4, base - yTapa);
          return (
            <g key={d.dia} className="viz-col-g">
              {/* Tapa redondeada de 4px, base cuadrada, desde la linea base. */}
              <path className="viz-columna"
                d={`M ${x} ${base} L ${x} ${yTapa + r} Q ${x} ${yTapa} ${x + r} ${yTapa} L ${x + ancho - r} ${yTapa} Q ${x + ancho} ${yTapa} ${x + ancho} ${yTapa + r} L ${x + ancho} ${base} Z`} />
              <text x={cx} y={yTapa - 7} className="viz-valor" textAnchor="middle">{d.tags}</text>
              <text x={cx} y={base + 19} className="viz-marca" textAnchor="middle">{diaCorto(d.dia)}</text>
              {/* El area sensible es la banda entera, no la columna: 24px de
                  ancho es un blanco al que nadie le atina. */}
              <rect x={izq + banda * i} y={arriba} width={banda} height={alto + abajo}
                fill="transparent" tabIndex={0} className="viz-blanco"
                aria-label={`${diaCorto(d.dia)}: ${d.tags} instalaciones`}
                onPointerEnter={(e) => setGlobo({
                  ...posDeMarca(e.currentTarget, cont.current),
                  titulo: `${d.tags} TAG(s)`,
                  lineas: [
                    diaCorto(d.dia),
                    d.medibles > 0
                      ? `mediana del trámite ${duracion(d.mediana)} · ${d.medibles} con hora`
                      : "sin hora sellada ese día",
                  ],
                })}
                onFocus={(e) => setGlobo({
                  ...posDeMarca(e.currentTarget, cont.current),
                  titulo: `${d.tags} TAG(s)`,
                  lineas: [diaCorto(d.dia)],
                })}
                onPointerLeave={() => setGlobo(null)}
                onBlur={() => setGlobo(null)} />
            </g>
          );
        })}
      </svg>
      {globo && <GloboDatos g={globo} />}
    </div>
  );
}

// =====================================================================
// 2. EL TIEMPO DE CADA INSTALACION — dispersion, un renglon por persona
//
// POR QUE DISPERSION Y NO BARRAS DE MEDIANA: con tres datos por persona, una
// barra esconde lo unico que de verdad importa —que tan dispersos estan— e
// invita a comparar personas con un numero que no lo aguanta. Aqui se ven TODOS
// los puntos, y quien mire entiende de un golpe que son pocos.
//
// Los renglones van por CANTIDAD, no por rapidez. No es un ranking.
// =====================================================================
export function DispersionTiempos({ personas, medianaGlobal }: {
  personas: FilaPersona[];
  medianaGlobal: number | null;
}) {
  const cont = useRef<HTMLDivElement>(null);
  const [globo, setGlobo] = useState<Globo | null>(null);

  const conDatos = personas.filter((p) => p.deltas.length > 0);
  if (conDatos.length === 0) return null;

  const W = 720, izq = 124, der = 18, arriba = 30, altoFila = 34, abajo = 28;
  const H = arriba + conDatos.length * altoFila + abajo;
  const anchoUtil = W - izq - der;
  const maxReal = Math.max(...conDatos.flatMap((p) => p.deltas.map((d) => d.ms)));
  const max = maxReal > 0 ? maxReal * 1.06 : 1;
  const xDe = (ms: number) => izq + (ms / max) * anchoUtil;
  const fondo = arriba + conDatos.length * altoFila;

  // Marcas del eje en numeros limpios, en la unidad que le queda al rango.
  const MIN = 60000, HORA = 3600000, DIA = 86400000;
  const unidad = max < 90 * MIN ? MIN : max < 48 * HORA ? HORA : DIA;
  const crudo = max / 4 / unidad;
  const paso = ([1, 2, 3, 5, 6, 12, 24].find((p) => p >= crudo) ?? Math.ceil(crudo)) * unidad;
  const marcas: number[] = [];
  for (let v = 0; v <= max; v += paso) marcas.push(v);
  const sufijo = unidad === MIN ? " min" : unidad === HORA ? " h" : " d";
  const etiquetaEje = (v: number) => (v === 0 ? "0" : `${Math.round(v / unidad)}${sufijo}`);

  const serieDe = (i: number) => (i === 0 ? "viz-punto--s1" : "viz-punto--s2");

  return (
    <>
      {/* Dos series o mas: la leyenda va siempre. La identidad no puede depender
          solo del color. */}
      {conDatos.length > 1 && (
        <div className="viz-leyenda">
          {conDatos.map((p, i) => (
            <span className="viz-leyenda__item" key={p.clave}>
              <span className={`viz-leyenda__punto ${serieDe(i)}`} aria-hidden="true" />
              {personaCorta(p.email)}
            </span>
          ))}
        </div>
      )}
      <div className="viz" ref={cont}>
        <svg viewBox={`0 0 ${W} ${H}`} className="viz-svg" role="img"
          aria-label={`Tiempo del trámite por instalación. ${conDatos.map((p) => `${personaCorta(p.email)}: ${p.deltas.map((d) => duracion(d.ms)).join(", ")}`).join("; ")}`}>
          {marcas.map((v) => (
            <g key={v}>
              <line x1={xDe(v)} y1={arriba - 6} x2={xDe(v)} y2={fondo} className="viz-reja" />
              <text x={xDe(v)} y={H - 10} className="viz-marca" textAnchor="middle">
                {etiquetaEje(v)}
              </text>
            </g>
          ))}

          {/* La mediana, rotulada una sola vez. */}
          {medianaGlobal !== null && (() => {
            const xm = xDe(medianaGlobal);
            const ancla = xm > W - 110 ? "end" : xm < izq + 70 ? "start" : "middle";
            return (
              <g>
                <line x1={xm} y1={arriba - 16} x2={xm} y2={fondo} className="viz-mediana" />
                <text x={xm} y={arriba - 20} className="viz-anotacion" textAnchor={ancla}>
                  mediana {duracion(medianaGlobal)}
                </text>
              </g>
            );
          })()}

          {conDatos.map((p, i) => {
            const cy = arriba + i * altoFila + altoFila / 2;
            return (
              <g key={p.clave}>
                <text x={izq - 12} y={cy + 4} className="viz-fila" textAnchor="end">
                  {personaCorta(p.email)}
                </text>
                {p.deltas.map((d) => (
                  <g key={d.folio} className="viz-punto-g">
                    {/* Anillo de 2px del color de la superficie: los puntos siguen
                        legibles donde se traslapan. */}
                    <circle cx={xDe(d.ms)} cy={cy} r={5.5} className={`viz-punto ${serieDe(i)}`} />
                    {/* Blanco de 24px: un punto de 11px es un alfiler. */}
                    <rect x={xDe(d.ms) - 12} y={cy - 12} width={24} height={24}
                      fill="transparent" tabIndex={0} className="viz-blanco"
                      aria-label={`${d.folio}, ${personaCorta(p.email)}, ${duracion(d.ms)}`}
                      onPointerEnter={(e) => setGlobo({
                        ...posDeMarca(e.currentTarget, cont.current),
                        titulo: duracion(d.ms),
                        lineas: [d.folio, personaCorta(p.email)],
                      })}
                      onFocus={(e) => setGlobo({
                        ...posDeMarca(e.currentTarget, cont.current),
                        titulo: duracion(d.ms),
                        lineas: [d.folio, personaCorta(p.email)],
                      })}
                      onPointerLeave={() => setGlobo(null)}
                      onBlur={() => setGlobo(null)} />
                  </g>
                ))}
              </g>
            );
          })}
        </svg>
        {globo && <GloboDatos g={globo} />}
      </div>
    </>
  );
}
