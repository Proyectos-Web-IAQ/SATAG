"use client";

import { duracion, personaCorta } from "@/lib/duracion";
import type { Marcador as DatosMarcador } from "@/lib/instalaciones";
import { diaMes } from "@/lib/formato";

// El marcador de quien instala. Lo ve TI (y super), NO el contador.
//
// POR QUE SON DOS PANTALLAS DISTINTAS SOBRE LOS MISMOS DATOS. Abajo, el tablero
// del contador mide el tramite y dice expresamente que no compara personas: ahi
// un ranking seria evaluacion de desempeno hecha por alguien de fuera del area,
// sobre tres o cuatro casos. Aqui es el equipo mirandose a si mismo, y eso es
// otra cosa: es suyo, lo pidieron ellos, y sirve para que ir a poner un TAG
// tenga algo de juego.
//
// La honestidad no se relaja por ser un juego: la regla de que solo compiten las
// instalaciones de la misma visita va escrita en pantalla, con su denominador.

function Cifra({ etiqueta, valor, pie }: { etiqueta: string; valor: string; pie?: string }) {
  return (
    <div className="metric-card">
      <span className="metric-label">{etiqueta}</span>
      <span className="metric-value">{valor}</span>
      {pie && <span className="metric-label" style={{ fontWeight: 600 }}>{pie}</span>}
    </div>
  );
}

function diaCortoDM(dia: string): string {
  return diaMes(dia);
}

export default function Marcador({ m, email }: { m: DatosMarcador; email: string | null }) {
  const recordEsSuyo = m.record !== null && email !== null && m.record.email === email;
  const superoSuMarca =
    m.hoyMejor !== null && m.miMejor !== null && m.hoyMejor.ms === m.miMejor.ms && m.hoyTags > 0;

  return (
    <div className="panel">
      <p className="panel-title">Su marcador</p>

      <div className="marcador__hero">
        <span className="marcador__etiqueta">Su mejor marca</span>
        <span className="marcador__cifra">{m.miMejor ? duracion(m.miMejor.ms) : "—"}</span>
        <span className="marcador__pie">
          {m.miMejor
            ? `${m.miMejor.folio} · ${diaCortoDM(m.miMejor.dia)}${superoSuMarca ? " · la hizo hoy" : ""}`
            : "Todavía no tiene una instalación que compita"}
        </span>
      </div>

      <div className="metric-cards">
        <Cifra
          etiqueta="Hoy"
          valor={String(m.hoyTags)}
          pie={m.hoyMejor ? `mejor de hoy: ${duracion(m.hoyMejor.ms)}` : "TAGs instalados hoy"}
        />
        <Cifra etiqueta="Sus TAGs" valor={String(m.misTags)} pie="instalados por usted" />
        <Cifra etiqueta="El equipo" valor={String(m.equipoTags)} pie="TAGs instalados en total" />
      </div>

      {m.record && (
        <p className={`marcador__record ${recordEsSuyo ? "marcador__record--suyo" : ""}`}>
          <strong>Récord de la casa: {duracion(m.record.ms)}</strong>
          {recordEsSuyo
            ? " · lo tiene usted"
            : ` · ${personaCorta(m.record.email)}`}
          {` · ${m.record.folio}`}
        </p>
      )}

      <p className="ti-hint">
        Para las marcas solo cuentan las instalaciones de la <strong>misma visita</strong>: menos de
        dos horas desde el cobro. {m.elegibles} de {m.conHora} con hora sellada.{" "}
        Las demás suman en los totales y no compiten, porque en ese tiempo va lo que la familia
        tardó en llegar y eso no es trabajo de quien instala.
      </p>
    </div>
  );
}
