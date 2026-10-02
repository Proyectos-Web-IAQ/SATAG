"use client";

// El plantel como esquema, con la ocupacion de cada estacionamiento encima.
//
// ES UN DIBUJO PROPIO, NO UNA FOTO (DISEÑO.md §3.6). Se trazo sobre capturas del
// satelite el 2-oct-2026 y las capturas no se publican: lo que queda es el esquema,
// que no esta a escala. Los edificios van en gris, las calles mas claras con su
// nombre, y los dos estacionamientos llevan el unico dato en color: que tan llenos
// estan a la hora elegida, segun la mediana entre dias.
//
// LO QUE SE SABE DEL PLANTEL, dicho por Gerardo:
//   - A los dos se entra por Cerrada de la Asuncion.
//   - El E1 es una franja de un solo ancho que arranca en la calle; al frente estan
//     la puerta y la parte techada, y atras sigue el resto de los cajones. El techo
//     grande de al lado son las canchas techadas del Instituto, no estacionamiento
//     (el 2-oct primero se dijo «auditorio de secundaria»; Gerardo lo corrigio).
//   - El E2 esta debajo de las canchas; su puerta da a la Cerrada frente a la
//     2a. Privada de la Asuncion.
//   - Cada estacionamiento tiene UNA puerta, con la entrada de un lado y la salida
//     del otro. Por eso se dibuja una sola.
//
// La hora se elige con un deslizador y no con una animacion: proyectado en una
// junta, lo que se quiere es detenerse en las 7:30 y dejarlo ahi.

import { useId, useState } from "react";
import { horaCorta, medianaEn, type OcupacionLote } from "@/lib/estacionamiento";

type Pt = [number, number];

// Coordenadas en pixeles de la captura con la que se calco, llevadas al lienzo.
const P = (x: number, y: number): Pt => [x + 36, y - 92];
const pol = (pts: Pt[]) => pts.map(([x, y]) => P(x, y).map((n) => n.toFixed(1)).join(",")).join(" ");
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// La franja del E1: un eje de A a B y medio ancho N a cada lado.
const A: Pt = [24, 422];
const B: Pt = [353, 790];
const N: Pt = [25.8, -23.7];
const lado = (q: Pt, k: number): Pt => [q[0] + N[0] * k, q[1] + N[1] * k];
const ANGULO_E1 = 48.2;

/** Un rotulo girado sobre su propio punto. */
function Rotulo({ en, texto, angulo = 0, className = "plano__calle", anchor = "middle" }: {
  en: Pt; texto: string; angulo?: number; className?: string; anchor?: "start" | "middle" | "end";
}) {
  const [x, y] = P(...en);
  return (
    <text className={className} x={x.toFixed(1)} y={y.toFixed(1)} textAnchor={anchor}
      transform={angulo ? `rotate(${angulo} ${x.toFixed(1)} ${y.toFixed(1)})` : undefined}>{texto}</text>
  );
}

export default function PlanoPlantel({
  ocupacion,
  cupos,
  minutoInicial,
  encabezado = false,
}: {
  ocupacion: OcupacionLote[];
  cupos: Record<string, number | null>;
  /** Donde arranca el deslizador: la hora del pico, que es lo que todos quieren ver. */
  minutoInicial: number | null;
  /** Como vista propia: la frase es el titular de la pagina y no un pie del plano. */
  encabezado?: boolean;
}) {
  const [minuto, setMinuto] = useState(() => Math.min(20 * 60, Math.max(6 * 60, Math.round((minutoInicial ?? 7 * 60 + 30) / 15) * 15)));
  const id = useId();

  const lee = (lote: string) => {
    const o = ocupacion.find((x) => x.lote === lote);
    const dentro = o ? medianaEn(o.franjas, minuto) : 0;
    const cupo = cupos[lote] ?? null;
    return { dentro, cupo, razon: cupo ? dentro / cupo : null };
  };
  const e1 = lee("E1");
  const e2 = lee("E2");
  // Del 8% al 90% de opacidad del navy: vacio se ve apenas, lleno se ve lleno. Sin
  // cupo se escala contra el pico, que es lo unico que hay.
  const tono = (l: ReturnType<typeof lee>, lote: string) => {
    const o = ocupacion.find((x) => x.lote === lote);
    const base = l.razon ?? (o && o.pico.dentro > 0 ? l.dentro / o.pico.dentro : 0);
    return (0.08 + 0.82 * Math.min(1, base)).toFixed(2);
  };
  const claro = (l: ReturnType<typeof lee>, lote: string) => Number(tono(l, lote)) > 0.5;
  const cifra = (l: ReturnType<typeof lee>) =>
    l.cupo ? `${l.dentro} de ${l.cupo} · ${Math.round((l.dentro / l.cupo) * 100)} %` : `${l.dentro} coches`;

  const frase = `A las ${horaCorta(minuto)} de un día típico el E2 tiene ${
    e2.cupo ? `${e2.dentro} de sus ${e2.cupo} cajones ocupados` : `${e2.dentro} coches dentro`
  } y el E1 ${e1.cupo ? `${e1.dentro} de ${e1.cupo}` : `${e1.dentro}`}.`;

  const Mt = lerp(A, B, 0.38);
  const d1 = lerp([150, 335], [330, 218], 0.17);
  const d2 = lerp([150, 335], [330, 218], 0.31);
  const g1 = lado(lerp(A, B, 0.015), 1.15);
  const g2 = lado(lerp(A, B, 0.015), -1.15);
  const puertaE2 = P(...lerp(d1, d2, 0.5));
  const puertaE1 = P(...lerp(g1, g2, 0.5));
  const c2 = P(290, 392);
  const [sx, sy] = P(332, 500);

  return (
    <div className="plano">
      {encabezado ? (
        <>
          <h2 className="titular" aria-live="polite">{frase}</h2>
          <p className="titular__sub">
            Mueva la hora y vea cómo cambia cada estacionamiento sobre el mismo plano. Más oscuro es más
            lleno, según la mediana entre los días comparables. Cada puerta tiene la entrada de un lado y
            la salida del otro.
          </p>
        </>
      ) : (
        <p className="plano__frase" aria-live="polite">{frase}</p>
      )}
      <div className="plano__hora">
        <label htmlFor={`${id}-hora`}>Hora</label>
        <input id={`${id}-hora`} type="range" min={6 * 60} max={20 * 60} step={15} value={minuto}
          onChange={(e) => setMinuto(Number(e.target.value))} />
        <output htmlFor={`${id}-hora`}>{horaCorta(minuto)}</output>
      </div>
      <div className="plano__lienzo">
        <svg viewBox="0 0 600 730" role="img" aria-label={frase}>
          {/* calles */}
          <polyline className="plano__via" points={pol([[-20, 155], [270, -10]])} strokeWidth={24} />
          <polyline className="plano__via" points={pol([[85, 115], [192, 282]])} strokeWidth={14} />
          <polyline className="plano__via" points={pol([[250, 95], [345, 210], [470, 380], [540, 470]])} strokeWidth={14} />
          <polyline className="plano__via" points={pol([[-20, 438], [360, 190]])} strokeWidth={18} />
          <polyline className="plano__via" points={pol([[-80, 660], [160, 860]])} strokeWidth={34} />
          <Rotulo en={[95, 128]} texto="Calz. de los Arcos" angulo={-30} />
          <Rotulo en={[130, 190]} texto="2a. Priv. Asunción" angulo={57} />
          <Rotulo en={[410, 290]} texto="1a. Priv. Asunción" angulo={54} />
          <Rotulo en={[100, 352]} texto="Cda. de la Asunción" angulo={-33} />
          <Rotulo en={[62, 770]} texto="Prol. Bernardo Quintana" angulo={40} />

          {/* referencias, en gris */}
          <polygon className="plano__edificio" points={pol([[0, 466], [0, 700], [130, 800], [282, 800]])} />
          <Rotulo en={[70, 640]} texto="Locales" angulo={47} className="plano__ref" />
          <polygon className="plano__edificio" points={pol([[405, 175], [525, 105], [525, 335], [470, 335]])} />
          <Rotulo en={[478, 240]} texto="Instituto" className="plano__ref" />
          <polygon className="plano__contorno" points={pol([[105, 425], [160, 395], [197, 478], [142, 507]])} />
          <Rotulo en={[151, 455]} texto="Básquet" className="plano__ref" />
          <polygon className="plano__edificio plano__edificio--borde" points={pol([[205, 553], [263, 515], [408, 690], [348, 738]])} />
          <Rotulo en={[306, 627]} texto="Canchas techadas" angulo={51} className="plano__ref" />
          <path className="plano__edificio plano__edificio--borde" d={`M${sx - 18},${sy} A18,18 0 0 1 ${sx + 18},${sy} Z`} />

          {/* E2, bajo las canchas */}
          <polygon className="plano__lote plano__lote--e2" points={pol([[150, 335], [330, 218], [432, 345], [258, 492]])} fillOpacity={tono(e2, "E2")} />
          <polygon className="plano__edificio plano__edificio--borde" points={pol([[222, 292], [265, 262], [302, 318], [258, 346]])} />
          <text className={`plano__nombre${claro(e2, "E2") ? " plano__txt--claro" : ""}`} x={c2[0]} y={c2[1]} textAnchor="middle">E2</text>
          <text className={`plano__cifra${claro(e2, "E2") ? " plano__txt--claro" : ""}`} x={c2[0]} y={c2[1] + 20} textAnchor="middle">{cifra(e2)}</text>
          <text className={`plano__ref${claro(e2, "E2") ? " plano__txt--claro" : ""}`} x={c2[0]} y={c2[1] - 26} textAnchor="middle">bajo las canchas</text>
          <polyline className="plano__puerta" points={pol([d1, d2])} />
          <text className="plano__puerta-t" x={puertaE2[0] - 2} y={puertaE2[1] - 16} textAnchor="middle"
            transform={`rotate(-33 ${puertaE2[0] - 2} ${puertaE2[1] - 16})`}>puerta</text>

          {/* E1: una franja; al frente la puerta y lo techado */}
          <polygon className="plano__lote" points={pol([lado(A, 1), lado(B, 1), lado(B, -1), lado(A, -1)])} fillOpacity={tono(e1, "E1")} />
          <polygon className={`plano__techado${claro(e1, "E1") ? " plano__txt--claro" : ""}`} points={pol([lado(A, 1), lado(Mt, 1), lado(Mt, -1), lado(A, -1)])} />
          <Rotulo en={lerp(A, B, 0.2)} texto="techado" angulo={ANGULO_E1} className={`plano__ref${claro(e1, "E1") ? " plano__txt--claro" : ""}`} />
          <Rotulo en={lerp(A, B, 0.56)} texto="E1" angulo={ANGULO_E1} className={`plano__nombre${claro(e1, "E1") ? " plano__txt--claro" : ""}`} />
          <Rotulo en={lerp(A, B, 0.78)} texto={cifra(e1)} angulo={ANGULO_E1} className={`plano__cifra plano__cifra--chica${claro(e1, "E1") ? " plano__txt--claro" : ""}`} />
          <polyline className="plano__puerta" points={pol([g1, g2])} />
          <text className="plano__puerta-t" x={puertaE1[0] - 4} y={puertaE1[1] - 18} textAnchor="middle"
            transform={`rotate(-33 ${puertaE1[0] - 4} ${puertaE1[1] - 18})`}>puerta</text>

          <text className="plano__ref" x={592} y={722} textAnchor="end">N ↑ · esquema, no a escala</text>
        </svg>
      </div>
      {!encabezado && (
        <p className="ti-hint">
          Cada puerta tiene la entrada de un lado y la salida del otro. Más oscuro es más lleno, según la
          mediana entre los días comparables.
        </p>
      )}
    </div>
  );
}
