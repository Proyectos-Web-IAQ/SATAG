"use client";

// Las dos formas que el tablero del estacionamiento necesita y que las graficas
// del tablero de instalacion no cubren: una curva de ocupacion a lo largo del dia,
// y barras de estancia por rol.
//
// SVG a mano, igual que GraficasInstalacion.tsx: el sitio es un export estatico y
// meterle una dependencia de graficas para dibujar una curva y seis barras costaria
// mas de lo que da.
//
// LAS CINCO REGLAS DE app/globals.css SE RESPETAN, y una obliga al diseno:
// solo existe `--viz-serie-1`. No hay segundo color de serie, asi que E1 contra E2
// NO son dos series en una grafica — son dos graficas pequenas, cada una con su
// pico rotulado. Comparar dos numeros grandes lado a lado se lee igual de bien y no
// pide un color que significaria «la otra cosa», que es justo lo que la regla evita.

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  FRANJA_DESDE,
  FRANJA_HASTA,
  horaCorta,
  lecturaOcupacion,
  medianaEn,
  pasoTeclado,
  rangoPico,
  type CubetaEstancia,
  type EstanciasRol,
  type LecturaOcupacion,
  type OcupacionLote,
} from "@/lib/estacionamiento";
import { duracion } from "@/lib/duracion";
import { GloboDatos, type Globo } from "@/components/admin/GraficasInstalacion";

const W = 720;

// Una decima de pixel basta y sobra. Sin esto el SVG sale con coordenadas de
// diecisiete digitos que no cambian nada en pantalla y engordan el DOM.
const r = (n: number) => Math.round(n * 10) / 10;

function etiquetaHoras(desde: number, hasta: number, paso = 120): number[] {
  const out: number[] = [];
  for (let m = Math.ceil(desde / paso) * paso; m <= hasta; m += paso) out.push(m);
  return out;
}

/**
 * Cuantos coches hay dentro a lo largo del dia, en un estacionamiento.
 *
 * DOS CAPAS, UN COLOR, Y CADA UNA DE UNA SOLA POBLACION:
 *
 *   - El dia mas lleno, como escalera exacta del barrido (linea continua). Es lo
 *     OBSERVADO, y es la capa sobre la que va el punto del pico: salen del mismo
 *     acumulado, asi que el punto cae sobre la linea por construccion.
 *   - La mitad de los dias comparables: la mediana entre dias (linea punteada) con
 *     su banda entre cuartiles. Es un CALCULO, no un dia que haya ocurrido, y el
 *     punteado lo dice sin pedir un segundo color.
 *
 * Antes el punto del pico se dibujaba sobre la mediana, y quedaba flotando a once
 * coches de la linea que decia explicar: el maximo de UN dia encima de la mediana de
 * seis. Un rotulo que contradice a su propia curva destruye la confianza en todo lo
 * demas, y la regla que lo evita es esta: una poblacion por capa, y la leyenda nombra
 * las capas.
 */
export function OcupacionDelDia({
  o,
  cupo,
  comparables,
  resalte = null,
  anotaciones = [],
}: {
  o: OcupacionLote;
  cupo: number | null;
  /** Cuantos dias entran en la mediana. Va en la leyenda: una mediana sin su n es una cifra sin poblacion. */
  comparables: number;
  /**
   * Un rango de minutos que se pinta de fondo: es lo que la fila elegida debajo de
   * la grafica esta explicando (DISEÑO.md §3.3). La fila y la franja son la misma
   * cosa vista dos veces, por eso se resalta aqui y no en un globo.
   */
  resalte?: [number, number] | null;
  /** Rotulos sobre el dato —«Entrada», «Salida escolar»— en vez de una leyenda. */
  anotaciones?: { minuto: number; texto: string }[];
}) {
  const izq = 46, der = 14, arriba = 26, alto = 168, abajo = 28;
  const H = arriba + alto + abajo;
  const ancho = W - izq - der;

  // La lectura del minuto apuntado y su globo. El globo se coloca en pixeles de
  // .viz, que es su ancla y NO desliza (ver posDeMarca en GraficasInstalacion).
  const cont = useRef<HTMLDivElement>(null);
  const lienzo = useRef<SVGSVGElement>(null);
  const [lectura, setLectura] = useState<{ l: LecturaOcupacion; globo: Globo } | null>(null);

  // EL TECHO NO ES EL PICO. Si lo fuera, la curva tocaria el borde del marco y se
  // leeria como «al 100%» justo cuando NO hay con que medir la saturacion, porque
  // falta el aforo. Una grafica que llena su marco dice «lleno» aunque el texto de
  // al lado diga lo contrario, y gana la forma. Con el aforo contado, el techo lo
  // fija el aforo y la lectura vuelve a ser honesta.
  // Con cupo, un 8% de aire arriba de la linea de lleno: pegada al borde del marco
  // no se ve como linea sino como marco, y su rotulo no cabe.
  const HOLGURA = 1.2;
  const techo = cupo !== null ? Math.max(cupo, o.pico.hasta) * 1.08 : Math.max(Math.ceil(o.pico.hasta * HOLGURA), 10);
  const x = (m: number) => r(izq + ((m - FRANJA_DESDE) / (FRANJA_HASTA - FRANJA_DESDE)) * ancho);
  const y = (n: number) => r(arriba + alto - (n / techo) * alto);

  const mediana = o.franjas.map((f, i) => `${i === 0 ? "M" : "L"} ${x(f.minuto)} ${y(f.p50)}`).join(" ");

  // La capa del dia es escalera, no curva: entre un cambio y el siguiente el numero
  // de coches dentro es constante, y dibujarlo como pendiente inventaria coches a
  // medias. Termina donde termina el dia, o donde termina el archivo.
  const escalera = o.diaPico
    .map((p, i) => (i === 0 ? `M ${x(p.minuto)} ${y(p.dentro)}` : `H ${x(p.minuto)} V ${y(p.dentro)}`))
    .join(" ");
  const finDia = o.diaPico.length > 0 ? o.diaPico[o.diaPico.length - 1].minuto : FRANJA_HASTA;
  const enElDia = (m: number): number => {
    let v = 0;
    for (const p of o.diaPico) {
      if (p.minuto > m) break;
      v = p.dentro;
    }
    return v;
  };

  // La banda entre cuartiles sustituye al area bajo la curva. El area decia «esto
  // paso»; la banda dice «esto pasa en la mitad de los dias», que es lo unico que
  // una mediana entre dias puede sostener. Mismo color a baja opacidad: no es una
  // segunda serie.
  const banda =
    o.franjas.map((f, i) => `${i === 0 ? "M" : "L"} ${x(f.minuto)} ${y(f.p75)}`).join(" ") +
    " " +
    [...o.franjas].reverse().map((f) => `L ${x(f.minuto)} ${y(f.p25)}`).join(" ") +
    " Z";

  const marcas = cupo !== null ? [0, Math.round(cupo / 2), cupo] : [0, Math.round(techo / 2), Math.round(techo)];
  const horas = etiquetaHoras(FRANJA_DESDE, FRANJA_HASTA);
  const diaRotulo = o.pico.dia ? diaLegible(o.pico.dia) : "el día más lleno";

  // La serie completa en texto: quien use lector de pantalla recibe el dato, no
  // la noticia de que hay una grafica.
  const serie = o.franjas
    .filter((_, i) => i % 4 === 0)
    .map((f) => `${horaCorta(f.minuto)} ${f.p50}`)
    .join("; ");

  // RECORRER LA GRAFICA. Una sola zona sensible del ancho del trazo, y la lectura
  // es la del minuto apuntado (lecturaOcupacion). Con el teclado es un deslizador:
  // flechas de cinco en cinco minutos, Mayus de hora en hora, Inicio y Fin; al
  // entrar con Tab arranca en el pico, que es lo que la grafica viene a decir.
  const leer = (minuto: number, iman: boolean) => {
    const svg = lienzo.current, c = cont.current;
    if (!svg || !c) return;
    const l = lecturaOcupacion(o, minuto, diaRotulo, comparables, iman);
    const s = svg.getBoundingClientRect(), k = c.getBoundingClientRect();
    setLectura({
      l,
      globo: {
        left: s.left - k.left + (x(l.minuto) * s.width) / W,
        top: s.top - k.top + (y(l.valor) * s.height) / H,
        ancho: k.width,
        titulo: l.titulo,
        lineas: l.lineas,
      },
    });
  };
  const alMover = (e: PointerEvent<SVGRectElement>) => {
    const s = lienzo.current?.getBoundingClientRect();
    if (!s) return;
    const vx = ((e.clientX - s.left) / s.width) * W;
    leer(FRANJA_DESDE + ((vx - izq) / ancho) * (FRANJA_HASTA - FRANJA_DESDE), true);
  };
  const alTeclear = (e: KeyboardEvent<SVGRectElement>) => {
    if (e.key === "Escape") { setLectura(null); return; }
    const desde = lectura?.l.minuto ?? o.pico.minuto ?? FRANJA_DESDE;
    const paso = e.shiftKey ? 60 : 5;
    const a =
      e.key === "ArrowRight" ? pasoTeclado(desde, paso, o.pico.minuto)
      : e.key === "ArrowLeft" ? pasoTeclado(desde, -paso, o.pico.minuto)
      : e.key === "Home" ? FRANJA_DESDE
      : e.key === "End" ? FRANJA_HASTA
      : null;
    if (a === null) return;
    e.preventDefault();
    leer(a, false);
  };

  return (
    <div className="viz" ref={cont}>
      {/* La leyenda es HTML y no SVG: un lector de pantalla la lee como lista. Y
          nombra las POBLACIONES, no los trazos: «el día más lleno» y «la mitad de
          los días» son dos cosas distintas aunque compartan color. */}
      <ul className="viz-leyenda" aria-label="Qué dibuja cada línea">
        <li><i className="viz-sw viz-sw--dia" aria-hidden="true" />El día más lleno, {diaRotulo}</li>
        <li><i className="viz-sw viz-sw--tipico" aria-hidden="true" />La mitad de los {comparables} días comparables</li>
        <li><i className="viz-sw viz-sw--banda" aria-hidden="true" />Entre su cuartil bajo y el alto</li>
      </ul>
      <div className="viz-scroll">
        {/* «group» y no «img»: adentro hay un deslizador, y un img vuelve
            decorativo todo lo que contiene. */}
        <svg ref={lienzo} className="viz-svg" viewBox={`0 0 ${W} ${H}`} role="group"
          aria-label={`Coches dentro del estacionamiento ${o.lote} a lo largo del día. Línea continua: el día más lleno, ${diaRotulo}, con su momento más lleno de ${o.pico.dentro} coches a las ${horaCorta(o.pico.minuto)}${o.pico.hasta > o.pico.dentro ? `, hasta ${o.pico.hasta} contando las entradas que no cerraron` : ""}. Línea punteada: la mediana de los ${comparables} días comparables, con su banda de cuartiles. Serie de la mediana cada hora: ${serie}.`}>

          {marcas.map((n) => (
            <g key={n}>
              <line className="viz-reja" x1={izq} x2={W - der} y1={y(n)} y2={y(n)} />
              <text className="viz-marca" x={izq - 8} y={y(n) + 4} textAnchor="end">{n}</text>
            </g>
          ))}

          {resalte !== null && (
            <rect className="viz-resalte" x={x(resalte[0])} y={arriba - 6}
              width={Math.max(3, x(resalte[1]) - x(resalte[0]))} height={alto + 6} />
          )}

          {cupo !== null && (
            <g>
              <line className="viz-aforo" x1={izq} x2={W - der} y1={y(cupo)} y2={y(cupo)} />
              <text className="viz-anotacion" x={W - der} y={y(cupo) - 6} textAnchor="end">Lleno · {cupo} cajones</text>
            </g>
          )}

          {anotaciones.map((a) => {
            const v = Math.max(enElDia(a.minuto), medianaEn(o.franjas, a.minuto));
            const izquierda = a.minuto < (FRANJA_DESDE + FRANJA_HASTA) / 2;
            return (
              <g key={a.minuto}>
                {/* Pegada al dato y no al marco, asi nunca se encima con la linea de
                    lleno. Por la manana el texto va a la IZQUIERDA de la guia, donde el
                    dia todavia no empieza; por la tarde va encima, donde no hay nada. */}
                <line className="viz-guia" x1={x(a.minuto)} x2={x(a.minuto)} y1={y(v) - (izquierda ? 4 : 26)} y2={y(v) + (izquierda ? 12 : -6)} />
                <text className="viz-marca" x={izquierda ? x(a.minuto) - 6 : x(a.minuto)} y={izquierda ? y(v) + 4 : y(v) - 30}
                  textAnchor={izquierda ? "end" : "middle"}>{a.texto}</text>
              </g>
            );
          })}

          <path className="viz-area" d={banda} />
          <path className="viz-linea-tipica" d={mediana} />
          {o.diaPico.length > 0 && <path className="viz-linea" d={escalera} />}

          {o.pico.minuto !== null && (
            <g>
              <circle className="viz-punto" cx={x(o.pico.minuto)} cy={y(o.pico.dentro)} r={4} />
              <text className="viz-valor" x={x(o.pico.minuto)} y={y(o.pico.dentro) - 10} textAnchor="middle">
                {rangoPico(o.pico)} a las {horaCorta(o.pico.minuto)}
              </text>
            </g>
          )}

          {horas.map((m) => (
            <text key={m} className="viz-marca" x={x(m)} y={arriba + alto + 18} textAnchor="middle">{horaCorta(m)}</text>
          ))}

          {/* La guia y el punto del minuto apuntado. Van ANTES de la zona sensible
              para no robarle el puntero. */}
          {lectura && (
            <g aria-hidden="true">
              <line className="viz-guia" x1={x(lectura.l.minuto)} x2={x(lectura.l.minuto)} y1={arriba} y2={arriba + alto} />
              <circle className="viz-punto" cx={x(lectura.l.minuto)} cy={y(lectura.l.valor)} r={4} />
            </g>
          )}

          {/* Una sola zona sensible, del ancho del trazo. Antes eran blancos de 60px
              cada dos horas, y el globo daba la hora en punto y no el minuto apuntado:
              sobre el pico de las 14:17 decia lo de las 14:00. */}
          <rect className="viz-blanco viz-recorrido" x={izq} y={arriba} width={ancho} height={alto}
            fill="transparent" tabIndex={0} role="slider"
            aria-label={`Recorrer el día en ${o.lote}`}
            aria-valuemin={FRANJA_DESDE} aria-valuemax={FRANJA_HASTA}
            aria-valuenow={lectura?.l.minuto ?? o.pico.minuto ?? FRANJA_DESDE}
            aria-valuetext={lectura ? [lectura.l.titulo, ...lectura.l.lineas].join(". ") : "Use las flechas para recorrer el día"}
            onPointerEnter={alMover} onPointerMove={alMover} onPointerLeave={() => setLectura(null)}
            onFocus={() => leer(o.pico.minuto ?? FRANJA_DESDE, false)} onBlur={() => setLectura(null)}
            onKeyDown={alTeclear} />
        </svg>
      </div>
      {lectura && <GloboDatos g={lectura.globo} />}
      {o.pico.minuto !== null && o.pico.hasta > o.pico.dentro && (
        // POR QUE EL PICO ES UN RANGO, dicho en la pantalla y no solo en el codigo:
        // al revisarla el 5-oct-2026 el rango sin explicacion se leyo como imprecision.
        <p className="ti-hint" style={{ margin: "6px 0 0" }}>
          ¿Por qué {rangoPico(o.pico)}? {o.pico.dentro} son los coches a los que se les leyó la entrada y la
          salida. A esa misma hora había {o.pico.hasta - o.pico.dentro} más con la entrada leída y la salida
          no: estaban dentro, pero el lector no registró cuándo salieron. El número real está entre los dos.
        </p>
      )}
      {finDia < FRANJA_HASTA && (
        <p className="ti-hint" style={{ margin: "6px 0 0" }}>
          La línea del día termina a las {horaCorta(finDia)} porque ahí termina el archivo: el día seguía
          corriendo.
        </p>
      )}
    </div>
  );
}

/** «mar, 22 sep», construida en hora local: ZK da hora local y aqui se respeta. */
function diaLegible(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a, m - 1, d, 12).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
}

/** Un rotulo de eje corto para una duracion en minutos: «15m», «4h». */
function corta(min: number): string {
  if (min < 60) return `${min}m`;
  return `${min / 60}h`;
}

/**
 * La distribucion de las duraciones de estancia, en cubetas.
 *
 * POR QUE ESTA GRAFICA EXISTE. El panel afirmaba «son dos poblaciones» y lo apoyaba
 * en una mediana por grupo, que es un resumen y pide fe. Un histograma lo MUESTRA:
 * dos montones separados por un valle. Y de paso blinda contra el error que ya se
 * cometio una vez, porque hace imposible publicar una mediana que contradiga su
 * propia distribucion — si la mitad de las barras estan a la izquierda del valle, la
 * mediana no puede caer a la derecha.
 *
 * Columnas y no curva: la variable es categorica (cubetas), no continua.
 */
export function HistogramaEstancias({
  grupos,
}: {
  grupos: { rol: string; total: number; cubetas: CubetaEstancia[] }[];
}) {
  const conDatos = grupos.filter((g) => g.total > 0);
  if (conDatos.length === 0) return null;

  const cubetas = conDatos[0].cubetas;
  const totalPorCubeta = cubetas.map((_, i) => conDatos.reduce((a, g) => a + g.cubetas[i].cuantas, 0));
  const total = totalPorCubeta.reduce((a, b) => a + b, 0);

  const izq = 10, der = 10, arriba = 26, alto = 150, abajo = 30;
  const H = arriba + alto + abajo;
  const ancho = W - izq - der;
  const banda = ancho / cubetas.length;

  const techo = Math.max(...totalPorCubeta, 1);
  const y = (n: number) => r(arriba + alto - (n / techo) * alto);

  const rango = (c: CubetaEstancia) =>
    c.hasta === null ? `${corta(c.desde)} o más` : `de ${corta(c.desde)} a ${corta(c.hasta)}`;
  const rotulo = (c: CubetaEstancia) =>
    c.hasta === null ? `${corta(c.desde)}+` : `${c.desde === 0 ? "0" : corta(c.desde)}–${corta(c.hasta)}`;

  const serie = cubetas
    .map((c, i) => `${rango(c)}: ${totalPorCubeta[i]} en total, ${conDatos.map((g) => `${g.rol} ${g.cubetas[i].cuantas}`).join(", ")}`)
    .join(". ");

  return (
    <div className="viz">
      {/* La leyenda es HTML y no SVG: asi la lee un lector de pantalla como lista y
          no como un monton de rectangulos sueltos. */}
      <ul className="viz-leyenda">
        {conDatos.map((g, gi) => (
          <li key={g.rol}>
            <i className={`viz-g${Math.min(gi + 1, 5)}`} style={{ background: `var(--viz-g${Math.min(gi + 1, 5)})` }} />
            {g.rol}
          </li>
        ))}
      </ul>
      <div className="viz-scroll">
        <svg className="viz-svg" viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Cuántas estancias duran cuánto, en ${cubetas.length} rangos, y de qué grupo son. ${serie}.`}>

          <line className="viz-reja" x1={izq} x2={W - der} y1={y(0)} y2={y(0)} />

          {cubetas.map((c, i) => {
            const cx = izq + i * banda + banda / 2;
            const w = Math.min(52, banda * 0.66);
            let acum = 0;
            return (
              <g key={c.desde}>
                {conDatos.map((g, gi) => {
                  const n = g.cubetas[i].cuantas;
                  const base = acum;
                  acum += n;
                  if (n === 0) return null;
                  const yArriba = y(base + n);
                  const h = Math.max(r(y(base) - yArriba), 1);
                  return (
                    <g key={g.rol}>
                      <rect className={`viz-g${Math.min(gi + 1, 5)}`} x={r(cx - w / 2)} y={yArriba}
                        width={r(w)} height={h} />
                      {/* Un blanco sensible POR TRAMO: el color no es el unico canal.
                          Quien no distinga dos tonos obtiene el grupo y la cifra con el
                          puntero o con el teclado, y la tabla de abajo los trae en texto. */}
                      <rect className="viz-blanco" x={r(cx - w / 2)} y={yArriba} width={r(w)} height={h}
                        fill="transparent" tabIndex={0} role="img"
                        aria-label={`${g.rol}, ${rango(c)}: ${n} estancias, ${Math.round((n / Math.max(totalPorCubeta[i], 1)) * 100)} por ciento de esa barra`}>
                        <title>{`${g.rol} · ${n} estancias · ${Math.round((n / Math.max(totalPorCubeta[i], 1)) * 100)}% de la barra`}</title>
                      </rect>
                    </g>
                  );
                })}
                <text className="viz-valor" x={r(cx)} y={y(totalPorCubeta[i]) - 7} textAnchor="middle">
                  {totalPorCubeta[i]}
                </text>
                <text className="viz-marca" x={r(cx)} y={arriba + alto + 18} textAnchor="middle">{rotulo(c)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="ti-hint" style={{ margin: "6px 0 0" }}>
        {total.toLocaleString("es-MX")} estancias con entrada y salida leídas.
      </p>
    </div>
  );
}

/**
 * Cuanto se queda cada grupo, en barras horizontales.
 *
 * La escala es lineal a proposito, aunque deje a Padres de familia como una astilla
 * al lado de Maestros: esa desproporcion —18 minutos contra mas de ocho horas— ES
 * el hallazgo. Una escala logaritmica la haria comoda de ver y mentiria.
 */
export function EstanciasPorRol({ filas }: { filas: EstanciasRol[] }) {
  if (filas.length === 0) return null;

  const izq = 150, der = 92, arriba = 16, abajo = 26;
  const altoFila = 30;
  const alto = filas.length * altoFila;
  const H = arriba + alto + abajo;
  const ancho = W - izq - der;

  const techo = Math.max(...filas.map((f) => f.medianaMin ?? 0), 60);
  const x = (m: number) => r((m / techo) * ancho);

  const serie = filas.map((f) => `${f.rol}: mediana ${duracion((f.medianaMin ?? 0) * 60_000)}, ${f.estancias} estancias`).join("; ");

  return (
    <div className="viz">
      <div className="viz-scroll">
        <svg className="viz-svg" viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Mediana de permanencia por grupo. ${serie}.`}>

          {[0, Math.round(techo / 2), techo].map((m) => (
            <g key={m}>
              <line className="viz-reja" x1={izq + x(m)} x2={izq + x(m)} y1={arriba} y2={arriba + alto} />
              <text className="viz-eje" x={izq + x(m)} y={arriba + alto + 18} textAnchor="middle">
                {duracion(m * 60_000)}
              </text>
            </g>
          ))}

          {filas.map((f, i) => {
            const cy = arriba + i * altoFila + altoFila / 2;
            const w = x(f.medianaMin ?? 0);
            return (
              <g key={f.rol}>
                <text className="viz-fila" x={izq - 10} y={cy + 4} textAnchor="end">{f.rol}</text>
                <rect className="viz-columna" x={izq} y={cy - 8} width={Math.max(w, 1.5)} height={16} rx={2} />
                <text className="viz-valor" x={izq + Math.max(w, 1.5) + 8} y={cy + 4}>
                  {duracion((f.medianaMin ?? 0) * 60_000)}
                </text>
                <rect className="viz-blanco" x={izq} y={cy - altoFila / 2} width={ancho} height={altoFila}
                  fill="transparent" tabIndex={0} role="img"
                  aria-label={`${f.rol}: mediana ${duracion((f.medianaMin ?? 0) * 60_000)}, ${f.estancias} estancias, ${f.largas} de cuatro horas o más`}>
                  <title>{`${f.estancias} estancias · ${f.largas} de 4 h o más`}</title>
                </rect>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/**
 * El dia tipico de UN estacionamiento, chico, para poner los dos lado a lado.
 *
 * Misma escala en los dos a proposito: la comparacion que importa es la forma —una
 * oleada corta contra una meseta— y la altura contra su propia linea de lleno. Sin
 * eje vertical: lleva su cupo rotulado y eso basta para leerla.
 */
export function MiniDia({ o, cupo, techo }: { o: OcupacionLote; cupo: number | null; techo: number }) {
  const w = 340, ht = 128, izq = 4, der = 4, arriba = 22, abajo = 18;
  const alto = ht - arriba - abajo;
  const x = (m: number) => r(izq + ((m - FRANJA_DESDE) / (FRANJA_HASTA - FRANJA_DESDE)) * (w - izq - der));
  const y = (n: number) => r(arriba + alto - (n / Math.max(techo, 1)) * alto);
  const linea = o.franjas.map((f, i) => `${i === 0 ? "M" : "L"} ${x(f.minuto)} ${y(f.p50)}`).join(" ");
  const area = `${linea} L ${x(FRANJA_HASTA)} ${y(0)} L ${x(FRANJA_DESDE)} ${y(0)} Z`;
  const pico = o.franjas.reduce((a, b) => (b.p50 > a.p50 ? b : a), o.franjas[0]);
  return (
    <svg className="mini-dia" viewBox={`0 0 ${w} ${ht}`} role="img"
      aria-label={`Día típico del estacionamiento ${o.lote}: hasta ${pico?.p50 ?? 0} coches a las ${horaCorta(pico?.minuto ?? null)}${cupo !== null ? ` de ${cupo} cajones` : ""}.`}>
      <line className="viz-eje" x1={izq} x2={w - der} y1={y(0)} y2={y(0)} />
      {cupo !== null && (
        <g>
          <line className="viz-aforo" x1={izq} x2={w - der} y1={y(cupo)} y2={y(cupo)} />
          <text className="viz-marca" x={w - der} y={y(cupo) - 4} textAnchor="end">{cupo} cajones</text>
        </g>
      )}
      <path className="viz-area" d={area} />
      <path className="viz-linea-tipica" d={linea} />
      {pico && pico.p50 > 0 && (() => {
        // Si el pico roza la linea de lleno, el rotulo va debajo del punto para no
        // encimarse con el de los cajones.
        const pegado = cupo !== null && y(pico.p50) - y(cupo) < 16;
        return (
          <text className="viz-anotacion" x={x(pico.minuto) + (pico.minuto < 13 * 60 ? 6 : -6)}
            y={pegado ? y(pico.p50) + 16 : y(pico.p50) - 6}
            textAnchor={pico.minuto < 13 * 60 ? "start" : "end"}>{pico.p50} a las {horaCorta(pico.minuto)}</text>
        );
      })()}
      {[7 * 60, 12 * 60, 17 * 60].map((m) => (
        <text key={m} className="viz-marca" x={x(m)} y={ht - 4} textAnchor="middle">{horaCorta(m)}</text>
      ))}
    </svg>
  );
}
