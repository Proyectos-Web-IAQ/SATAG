"use client";

// Vialidad alrededor del plantel. BETA, y la ultima vista a proposito.
//
// POR QUE EXISTE. SATAG administra el TAG, pero el porque de medir el estacionamiento
// es la calle: la fila que se forma afuera a la hora de entrada. La bitacora de las
// plumas dice cuantos autos entran y a que ritmo; lo que pasa en la calle no lo ve
// ningun lector del plantel. Esta vista junta las dos mitades:
//
//   1. LA DEMANDA DE LA PUERTA, de la bitacora: cuantos autos entran en la oleada y
//      cada cuantos segundos. Si la pluma tarda mas que eso por auto, hay fila. Esto
//      es aritmetica sobre lo que ya se mide, y por eso NO es beta.
//   2. EL TRAFICO TIPICO DE LA CALLE, de Google Maps: cuanto tarda un trayecto fijo
//      por Bernardo Quintana a distintas horas de un dia de clases, contra la hora
//      sin colegio. Google lo publica como «trafico tipico» al pedir una ruta con
//      hora de salida; se captura a mano y se guarda EN ESTE NAVEGADOR, porque
//      es un ensayo y no un dato del sistema. Si el ensayo sirve, pasa a la base
//      con su bloque y deja de ser beta.
//
// Lo que esta vista NO hace: no llama a ninguna API de Google (una llave en un sitio
// estatico es publica), no afirma nada que no salga de las dos fuentes, y no
// sustituye a las vistas de arriba.

import { useEffect, useId, useState } from "react";
import { horaCorta, type Medicion } from "@/lib/estacionamiento";

const CLAVE = "satag.vialidad.beta.v1";

/** Las horas que se capturan: la entrada, la referencia sin colegio y la salida. */
const HORAS = [6 * 60 + 30, 7 * 60, 7 * 60 + 15, 7 * 60 + 30, 7 * 60 + 45, 8 * 60, 10 * 60, 14 * 60 + 15, 14 * 60 + 30, 14 * 60 + 45];
const REFERENCIA = 10 * 60;

interface Captura {
  ruta: string;
  /** Minutos del trayecto por hora del dia, segun Google. */
  minutos: Record<string, number | null>;
  /** Cuando se capturo, para que no se tome por actual lo que es de hace un mes. */
  capturadoEl: string | null;
}

const VACIA: Captura = { ruta: "Prol. Bernardo Quintana, de Calz. de los Arcos a la glorieta", minutos: {}, capturadoEl: null };

function leer(): Captura {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return VACIA;
    const c = JSON.parse(raw) as Partial<Captura>;
    return { ruta: c.ruta ?? VACIA.ruta, minutos: c.minutos ?? {}, capturadoEl: c.capturadoEl ?? null };
  } catch {
    return VACIA;
  }
}

export default function VialidadBeta({ m }: { m: Medicion }) {
  const [c, setC] = useState<Captura>(VACIA);
  const [listo, setListo] = useState(false);
  const id = useId();

  useEffect(() => {
    setC(leer());
    setListo(true);
  }, []);

  const guardar = (nuevo: Captura) => {
    const conFecha = { ...nuevo, capturadoEl: new Date().toISOString().slice(0, 10) };
    setC(conFecha);
    try {
      localStorage.setItem(CLAVE, JSON.stringify(conFecha));
    } catch {
      /* sin almacenamiento, la captura vive solo en esta visita */
    }
  };

  // 1. La demanda de la puerta: lo que ya se sabe.
  const o = m.oleada;
  const duracion = Math.max(1, o.hasta - o.desde);
  const cadaSeg = o.coches > 0 ? Math.round((duracion * 60) / o.coches) : null;
  const porLote = o.porLote.filter((x) => x.coches > 0);
  const mayor = [...porLote].sort((a, b) => b.coches - a.coches)[0];
  const cadaSegMayor = mayor ? Math.round((duracion * 60) / mayor.coches) : null;

  // 2. La calle: lo capturado.
  const ref = c.minutos[String(REFERENCIA)] ?? null;
  const filas = HORAS.map((h) => {
    const v = c.minutos[String(h)] ?? null;
    return { h, v, veces: v !== null && ref !== null && ref > 0 ? v / ref : null };
  });
  const peor = filas.filter((f) => f.veces !== null).sort((a, b) => (b.veces ?? 0) - (a.veces ?? 0))[0];
  const hayCaptura = filas.some((f) => f.v !== null);
  const tope = Math.max(...filas.map((f) => f.v ?? 0), 1);

  return (
    <>
      <p className="titular__migas">
        <span>Vialidad</span>
        <span className="beta">beta</span>
      </p>
      <h2 className="titular">
        {cadaSeg !== null
          ? `En la oleada entra un auto cada ${cadaSeg} segundos${mayor ? `, y por el E${mayor.lote.slice(1)} uno cada ${cadaSegMayor}` : ""}.`
          : "Todavía no hay una oleada medida."}
      </h2>
      <p className="titular__sub">
        {o.coches} autos entre {horaCorta(o.desde)} y {horaCorta(o.hasta)}. Si la pluma tarda más que eso en
        leer, abrir y cerrar por cada auto, la fila crece hacia la calle. Lo que la calle hace con esa fila
        es lo que Google Maps sí ve y los lectores del plantel no.
      </p>

      <section className="seccion-plana">
        <h3>{hayCaptura && peor && peor.veces !== null && ref !== null
          ? `A las ${horaCorta(peor.h)} el trayecto tarda ${peor.veces.toFixed(1).replace(".", ",")} veces lo que a las 10:00.`
          : "La calle, según el tráfico típico de Google Maps"}</h3>
        <p className="sub">
          {c.ruta}. Minutos de trayecto a cada hora de un día de clases, contra las 10:00 como referencia sin
          colegio. {c.capturadoEl ? `Capturado el ${c.capturadoEl.split("-").reverse().join("/")}.` : "Sin capturar todavía."}
        </p>

        {hayCaptura && (
          <div className="barras" style={{ maxWidth: 560 }}>
            {filas.filter((f) => f.v !== null).map((f) => (
              <div className="barra" key={f.h}>
                <span>{horaCorta(f.h)}{f.h === REFERENCIA ? " · referencia" : ""}</span>
                <span className="barra__t"><i style={{ width: `${Math.round(((f.v ?? 0) / tope) * 100)}%`, background: f.h === REFERENCIA ? "#8a94a6" : undefined }} /></span>
                <span className="barra__v">{f.v} min</span>
              </div>
            ))}
          </div>
        )}

        <details className="beta-captura" open={!hayCaptura}>
          <summary>{hayCaptura ? "Volver a capturar" : "Cómo capturarlo"}</summary>
          <ol>
            <li>En Google Maps, en computadora, pida la ruta del trayecto de abajo en coche.</li>
            <li>Toque «Salir a las» y elija un martes o miércoles de clases y cada una de estas horas.</li>
            <li>Anote los minutos que Google da para cada hora. Es su tráfico típico, no el de hoy.</li>
          </ol>
          <label className="beta-captura__ruta">
            <span>Trayecto</span>
            <input id={`${id}-ruta`} type="text" value={c.ruta} onChange={(e) => setC({ ...c, ruta: e.target.value })} />
          </label>
          <div className="beta-captura__horas">
            {HORAS.map((h) => (
              <label key={h}>
                <span>{horaCorta(h)}{h === REFERENCIA ? " (ref.)" : ""}</span>
                <input id={`${id}-${h}`} type="number" min={0} max={180} inputMode="numeric" placeholder="min"
                  value={c.minutos[String(h)] ?? ""}
                  onChange={(e) => setC({ ...c, minutos: { ...c.minutos, [String(h)]: e.target.value === "" ? null : Number(e.target.value) } })} />
              </label>
            ))}
          </div>
          <button type="button" className="primary-action" onClick={() => guardar(c)} disabled={!listo}>Guardar en este navegador</button>
        </details>
      </section>

      <div className="firme">
        <div><strong>Qué es esto y qué no.</strong> Es un ensayo: los minutos de la calle se capturan a mano y se guardan en este navegador, no en SATAG. Si resulta útil, pasa a la base con su propio bloque y deja de ser beta.</div>
        <div>La bitácora no ve a las familias que dejan al alumno en la banqueta sin entrar: para la calle pueden ser la mayor parte. Un conteo a pie de calle dos mañanas lo diría.</div>
      </div>
    </>
  );
}
