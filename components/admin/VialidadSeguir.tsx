"use client";

// Vialidad › Seguir (3-nov-2026): el experimento de noviembre.
//
// LO QUE RESPONDE: ¿sirvio? Antes, testigo y piloto, lado a lado, en los cinco
// numeros de la tarde: minutos dentro por familia, cajones libres en E2 a la salida
// de secundaria y prepa, lo mas que sale y lo mas que llega a E2 en cinco minutos, y
// E1 en su momento mas lleno. Lunes a jueves y viernes por separado, porque el
// viernes no hay talleres y la tarde es otra. Cada celda trae la mediana entre dias,
// el menor y el mayor, y cuantos dias hay de cuantos: un numero sin su cobertura
// invita a leer de mas.
//
// LO QUE NO HACE. No concluye: «las metas las fija Direccion», y las frases son de
// fuente y de cobertura, nunca de veredicto (el 26-oct el contador saco del mapa una
// conclusion que los datos no sostenian; la salida es que la lectura sea de ellos).
// No escribe nada: Consulta mide. La calle (Google) y la fila afuera aparecen como
// filas vacias a proposito, para que se vea lo que falta y por donde va a entrar.
//
// La medicion vive en lib/vialidad.ts y llega hecha desde VistaEstacionamiento.

import { useState } from "react";
import { Segmentado } from "@/components/admin/UiEstacionamiento";
import { diaCorto } from "@/lib/caja";
import {
  FASES,
  METRICAS_PUERTA,
  NOMBRE_FASE,
  TIPOS_DIA,
  type Celda,
  type DiaSeguir,
  type FaseId,
  type ResumenFaseTipo,
  type Seguimiento,
  type TipoDia,
} from "@/lib/vialidad";

/** Lo que la calle va a decir cuando entre a la base (bloque 106): filas vacias con su hueco a la vista. */
const CALLE = [
  { titulo: "Índice pico de los accesos en la salida", detalle: "de 13:50 a 15:30: con tráfico entre sin tráfico, promedio de las rutas de llegada" },
  { titulo: "Minutos extra en el peor momento", detalle: "lo que tarda de más la ruta en ese pico" },
  { titulo: "Accesos contra el control", detalle: "la misma avenida a 3.5 km, el mismo día" },
];

/** El tipo de dia elegido sobrevive al cambio de pestana, como el lote en Estacionamientos. */
let ultimoTipo: TipoDia = "LJ";

const esMx = (v: number) => v.toLocaleString("es-MX", { maximumFractionDigits: 0 });
const dias = (n: number, m: number) => `${n} de ${m} día${m === 1 ? "" : "s"} hábil${m === 1 ? "" : "es"}`;
const fechaLarga = (dia: string) => new Date(`${dia}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "long" });
const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function CeldaVista({ c, unidad }: { c: Celda; unidad: string }) {
  if (c.n === 0 || c.mediana === null) {
    return (
      <>
        <span className="ti-hint">—</span>
        <br />
        <span className="ti-hint">{dias(0, c.m)}</span>
      </>
    );
  }
  const rango = c.n > 1 && c.min !== null && c.max !== null && c.min !== c.max ? `${esMx(c.min)} a ${esMx(c.max)} · ` : "";
  return (
    <>
      <strong>{esMx(c.mediana)}{unidad ? ` ${unidad}` : ""}</strong>
      <br />
      <span className="ti-hint">{rango}{dias(c.n, c.m)}</span>
    </>
  );
}

/** Un dia incompleto muestra cuantos accesos trae y por que no cuenta; sus cifras no, porque serian de media jornada. */
function FilaDia({ d }: { d: DiaSeguir }) {
  const v = (x: number | null) => (x === null || !d.completo ? "—" : esMx(x));
  return (
    <tr style={d.completo ? undefined : { color: "var(--muted)" }}>
      <td>
        {diaCorto(d.dia)}
        {d.motivo && (
          <>
            <br />
            <span className="ti-hint">{d.motivo}</span>
          </>
        )}
      </td>
      <td className="num">{d.accesos > 0 ? d.accesos : "—"}</td>
      <td className="num">
        {d.completo ? d.familias : "—"}
        {d.completo && d.sinFamilia > 0 && (
          <>
            <br />
            <span className="ti-hint">+{d.sinFamilia} sin ligar</span>
          </>
        )}
      </td>
      {METRICAS_PUERTA.map((m) => (
        <td key={m.clave} className="num">{d.accesos > 0 ? v(d.valores[m.clave]) : "—"}</td>
      ))}
    </tr>
  );
}

export default function VialidadSeguir({ seguir }: { seguir: Seguimiento | null }) {
  const [tipo, setTipoEstado] = useState<TipoDia>(ultimoTipo);
  const setTipo = (t: string) => {
    ultimoTipo = t as TipoDia;
    setTipoEstado(t as TipoDia);
  };
  if (!seguir) return <p className="ti-empty">Todavía no hay bitácora guardada con la que seguir el experimento.</p>;

  const cal = seguir.calendario;
  const antes = cal.fases.find((f) => f.id === "antes");
  const piloto = cal.fases.find((f) => f.id === "piloto");
  const de = (fase: FaseId): ResumenFaseTipo => seguir.resumen.find((r) => r.fase === fase && r.tipo === tipo)!;
  const hoy = hoyLocal();
  const notaPiloto = piloto
    ? hoy < piloto.desde
      ? ` (empieza el ${fechaLarga(piloto.desde)}${cal.medidaPiloto ? "" : "; sin medida autorizada todavía"})`
      : cal.medidaPiloto
        ? ""
        : " (sin medida autorizada)"
    : "";
  const cobertura = FASES.map((f) => `${NOMBRE_FASE[f]}: ${dias(de(f).n, de(f).m)}${f === "piloto" ? notaPiloto : ""}`).join(" · ");

  return (
    <section className="seccion-plana">
      <p className="ti-hint" style={{ margin: 0 }}>Estacionamiento › Vialidad › Seguir</p>
      <h2 className="titular">Antes, testigo y piloto: los cinco números de la tarde</h2>
      <p className="sub">
        {antes ? `Línea base del ${fechaLarga(antes.desde)} al ${fechaLarga(antes.hasta)}` : "Línea base"}, días testigo sin alumnos y
        {piloto ? ` piloto del ${fechaLarga(piloto.desde)} al ${fechaLarga(piloto.hasta)}` : " piloto"}, de la bitácora de las plumas y de GES.
        Cada celda es la mediana entre días, con el menor y el mayor, y cuántos días hay de cuántos.
      </p>
      <Segmentado opciones={TIPOS_DIA} activa={tipo} onCambio={setTipo} etiqueta="Tipo de día" />
      <p className="ti-hint" style={{ margin: "8px 0 0" }}>{cobertura}</p>

      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table className="admin-table tabla-pro tabla-fija">
          <thead>
            <tr>
              <th>Qué se mide</th>
              {FASES.map((f) => (
                <th key={f} className="num" style={{ minWidth: 150 }}>{NOMBRE_FASE[f]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICAS_PUERTA.map((m) => (
              <tr key={m.clave}>
                <td>
                  <strong>{m.titulo}</strong>
                  <br />
                  <span className="ti-hint">{m.detalle} · {m.fuente}</span>
                </td>
                {FASES.map((f) => (
                  <td key={f} className="num"><CeldaVista c={de(f).metricas[m.clave]} unidad={m.unidad} /></td>
                ))}
              </tr>
            ))}
            <tr>
              <td>
                <strong>La fila afuera</strong>
                <br />
                <span className="ti-hint">autos esperando antes de la pluma · nadie la mide todavía</span>
              </td>
              {FASES.map((f) => (
                <td key={f} className="num"><span className="ti-hint">sin medir</span></td>
              ))}
            </tr>
            {CALLE.map((c) => (
              <tr key={c.titulo}>
                <td>
                  <strong>{c.titulo}</strong>
                  <br />
                  <span className="ti-hint">{c.detalle} · Google</span>
                </td>
                {FASES.map((f) => (
                  <td key={f} className="num"><span className="ti-hint">—</span></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ti-hint" style={{ margin: "6px 0 0" }}>
        La calle (Google) entra a la base con el bloque 106; hasta entonces sus filas quedan vacías.
        {seguir.conGes ? "" : " Sin GES en esta sesión, «minutos dentro por familia» queda vacío."}
      </p>

      <details style={{ marginTop: 16 }}>
        <summary>Día por día</summary>
        {FASES.map((f) => {
          const r = de(f);
          if (r.m === 0) return null;
          // Los dias que todavia no llegan no son «sin bitacora»: se cuentan, no se listan.
          const pasados = r.dias.filter((d) => d.dia <= hoy);
          const faltan = r.m - pasados.length;
          return (
            <div key={f} style={{ marginTop: 10 }}>
              <p style={{ margin: "4px 0 0", fontWeight: 700 }}>
                {NOMBRE_FASE[f]} · {dias(r.n, r.m)}
                {faltan > 0 && <span className="ti-hint" style={{ fontWeight: 400 }}> · {faltan === r.m ? "todavía no empieza" : `faltan ${faltan}`}</span>}
              </p>
              {pasados.length > 0 && (
              <div className="table-wrap">
                <table className="admin-table tabla-pro tabla-fija">
                  <thead>
                    <tr>
                      <th>Día</th>
                      <th className="num">Accesos</th>
                      <th className="num">Familias</th>
                      {METRICAS_PUERTA.map((m) => (
                        <th key={m.clave} className="num">{m.corto}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pasados.map((d) => <FilaDia key={d.dia} d={d} />)}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          );
        })}
      </details>

      <div className="firme">
        <p><strong>Las metas las fija Dirección.</strong> Esta pantalla solo mide.</p>
        <p>
          Fuentes: la bitácora de las plumas de ZK guardada en SATAG y, para saber por quién viene cada auto, los grupos de los hijos en GES.
          Solo cuentan los papás ligados a una familia; los que no se pudieron ligar se dicen aparte y no se reparten.
        </p>
        <p>
          Un día cuenta si su bitácora empieza antes de las 09:00, termina después de las 15:30 y no es el día en que se exportó.
          Las cifras usan solo estancias con entrada y salida leídas; por eso «cajones libres» es un techo y E2 se mide con {seguir.cajonesE2} cajones.
        </p>
        <p>Testigos ({cal.testigo.map(diaCorto).join(", ")}): días hábiles sin alumnos, en los que solo el personal cruza la pluma.</p>
        <p>
          Piloto{piloto ? ` del ${fechaLarga(piloto.desde)} al ${fechaLarga(piloto.hasta)}` : ""}:{" "}
          {cal.medidaPiloto ?? "sin medida autorizada todavía; mientras tanto hereda las horas de salida de antes."}
        </p>
        <p>Lo que falta: la calle entra con el bloque 106 (Google Routes, cargado cada semana) y la fila afuera, con el botón del portero en la caseta.</p>
      </div>
    </section>
  );
}
