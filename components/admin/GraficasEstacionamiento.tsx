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

import { FRANJA_DESDE, FRANJA_HASTA, horaCorta, type CubetaEstancia, type EstanciasRol, type OcupacionLote } from "@/lib/estacionamiento";
import { duracion } from "@/lib/duracion";

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
 * La curva es la mediana entre los dias de la ventana; el pico que se rotula es el
 * mayor de un dia real, no el de la curva suavizada, porque un pico suavizado ya no
 * es un pico.
 */
export function OcupacionDelDia({ o, cupo }: { o: OcupacionLote; cupo: number | null }) {
  const izq = 46, der = 14, arriba = 26, alto = 168, abajo = 28;
  const H = arriba + alto + abajo;
  const ancho = W - izq - der;

  // EL TECHO NO ES EL PICO. Si lo fuera, la curva tocaria el borde del marco y se
  // leeria como «al 100%» justo cuando NO hay con que medir la saturacion, porque
  // falta el aforo. Una grafica que llena su marco dice «lleno» aunque el texto de
  // al lado diga lo contrario, y gana la forma. Con el aforo contado, el techo lo
  // fija el aforo y la lectura vuelve a ser honesta.
  const HOLGURA = 1.2;
  const techo = cupo !== null ? Math.max(cupo, o.pico.hasta) : Math.max(Math.ceil(o.pico.hasta * HOLGURA), 10);
  const x = (m: number) => r(izq + ((m - FRANJA_DESDE) / (FRANJA_HASTA - FRANJA_DESDE)) * ancho);
  const y = (n: number) => r(arriba + alto - (n / techo) * alto);

  const linea = o.franjas.map((f, i) => `${i === 0 ? "M" : "L"} ${x(f.minuto)} ${y(f.p50)}`).join(" ");

  // La banda entre cuartiles sustituye al area bajo la curva. El area decia «esto
  // paso»; la banda dice «esto pasa en la mitad de los dias», que es lo unico que
  // una mediana entre dias puede sostener. Mismo color a baja opacidad: no es una
  // segunda serie.
  const banda =
    o.franjas.map((f, i) => `${i === 0 ? "M" : "L"} ${x(f.minuto)} ${y(f.p75)}`).join(" ") +
    " " +
    [...o.franjas].reverse().map((f) => `L ${x(f.minuto)} ${y(f.p25)}`).join(" ") +
    " Z";

  const marcas = [0, Math.round(techo / 2), techo];
  const horas = etiquetaHoras(FRANJA_DESDE, FRANJA_HASTA);

  // La serie completa en texto: quien use lector de pantalla recibe el dato, no
  // la noticia de que hay una grafica.
  const serie = o.franjas
    .filter((_, i) => i % 4 === 0)
    .map((f) => `${horaCorta(f.minuto)} ${f.p50}`)
    .join("; ");

  return (
    <div className="viz">
      <div className="viz-scroll">
        <svg className="viz-svg" viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Coches dentro del estacionamiento ${o.lote} a lo largo del día, mediana de los días comparables con su banda de cuartiles. Momento más lleno: ${o.pico.dentro} a las ${horaCorta(o.pico.minuto)}${o.pico.hasta > o.pico.dentro ? `, hasta ${o.pico.hasta} contando las entradas que no cerraron` : ""}. Serie cada hora: ${serie}.`}>

          {marcas.map((n) => (
            <g key={n}>
              <line className="viz-reja" x1={izq} x2={W - der} y1={y(n)} y2={y(n)} />
              <text className="viz-marca" x={izq - 8} y={y(n) + 4} textAnchor="end">{n}</text>
            </g>
          ))}

          {cupo !== null && (
            <g>
              <line className="viz-aforo" x1={izq} x2={W - der} y1={y(cupo)} y2={y(cupo)} />
              <text className="viz-anotacion" x={W - der} y={y(cupo) - 6} textAnchor="end">{cupo} cajones</text>
            </g>
          )}

          <path className="viz-area" d={banda} />
          <path className="viz-linea" d={linea} />

          {o.pico.minuto !== null && (
            <g>
              <circle className="viz-punto" cx={x(o.pico.minuto)} cy={y(o.pico.dentro)} r={4} />
              <text className="viz-valor" x={x(o.pico.minuto)} y={y(o.pico.dentro) - 10} textAnchor="middle">
                {o.pico.dentro}
                {o.pico.hasta > o.pico.dentro ? `–${o.pico.hasta}` : ""} a las {horaCorta(o.pico.minuto)}
              </text>
            </g>
          )}

          {horas.map((m) => (
            <text key={m} className="viz-marca" x={x(m)} y={arriba + alto + 18} textAnchor="middle">{horaCorta(m)}</text>
          ))}

          {/* Blanco por hora: mas grande que cualquier marca, y el foco por teclado
              entrega el mismo dato que el puntero. */}
          {horas.map((m) => {
            const f = o.franjas.reduce((mejor, c) => (Math.abs(c.minuto - m) < Math.abs(mejor.minuto - m) ? c : mejor), o.franjas[0]);
            return (
              <rect key={`b${m}`} className="viz-blanco" x={x(m) - 30} y={arriba} width={60} height={alto}
                fill="transparent" tabIndex={0} role="img"
                aria-label={`A las ${horaCorta(m)}, ${f.p50} coches dentro de ${o.lote} en la mitad de los días, entre ${f.p25} y ${f.p75}`}>
                <title>{`${horaCorta(m)} · ${f.p50} coches (${f.p25}–${f.p75})`}</title>
              </rect>
            );
          })}
        </svg>
      </div>
    </div>
  );
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
