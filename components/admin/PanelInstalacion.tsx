"use client";

import { useEffect, useState } from "react";
import type { InstalacionMedida } from "@/lib/mock/types";
import { listInstalaciones } from "@/lib/supabase/apiPanel";
import { duracion, mediana, personaCorta } from "@/lib/duracion";
import Loader from "@/components/Loader";
import {
  ColumnasPorDia,
  DispersionTiempos,
  type FilaDia,
  type FilaPersona,
} from "@/components/admin/GraficasInstalacion";

// Pestana TABLERO: cuantos TAGs se han instalado, cuanto tarda el tramite y
// quien los instalo. La pidio Contabilidad y es la segunda pantalla del rol
// contador; el corte de caja vive aparte, en Finanzas, para que el dinero y la
// operacion no compartan pantalla.
//
// NO LLEVA BLOQUE SQL A PROPOSITO. La RLS de `registros` y de `pagos` ya deja
// leer a los roles del panel —contador incluido desde el bloque 74— y las
// medianas se calculan aqui sobre unas decenas de filas. Un RPC nuevo seria una
// funcion mas que mantener para no ganar nada.

function diaCorto(dia: string): string {
  const [y, m, d] = dia.split("-");
  return d && m && y ? `${d}/${m}/${y}` : dia;
}

interface Medicion {
  total: number;
  conHora: number;
  medibles: number;
  // Cobro posterior a la instalacion. No deberia pasar (se cobra antes de
  // instalar), pero si pasa la resta sale negativa y una mediana negativa no
  // significa nada: se sacan del calculo y se dicen aparte.
  fueraDeOrden: number;
  medCobroInst: number | null;
  masRapida: number | null;
  masTardada: number | null;
  porPersona: FilaPersona[];
  porDia: FilaDia[];
}

function medir(filas: InstalacionMedida[]): Medicion {
  const cobroInst: number[] = [];
  const porPersona = new Map<string, {
    email: string | null; tags: number; deltas: { folio: string; ms: number }[];
  }>();
  const porDia = new Map<string, { tags: number; deltas: number[] }>();
  let conHora = 0;
  let fueraDeOrden = 0;

  for (const f of filas) {
    // El delta del tramite existe solo si hay las dos horas y van en orden.
    let delta: number | null = null;
    if (f.instaladoEn) {
      conHora += 1;
      if (f.cobradoEn) {
        const d = Date.parse(f.instaladoEn) - Date.parse(f.cobradoEn);
        if (Number.isFinite(d)) {
          if (d >= 0) { delta = d; cobroInst.push(d); } else fueraDeOrden += 1;
        }
      }
    }

    const clave = f.instaladoPorEmail ?? "";
    const persona = porPersona.get(clave) ?? { email: f.instaladoPorEmail, tags: 0, deltas: [] };
    persona.tags += 1;
    if (delta !== null) persona.deltas.push({ folio: f.folio, ms: delta });
    porPersona.set(clave, persona);

    const dia = porDia.get(f.fechaInstalacion) ?? { tags: 0, deltas: [] };
    dia.tags += 1;
    if (delta !== null) dia.deltas.push(delta);
    porDia.set(f.fechaInstalacion, dia);
  }

  // Por volumen, NO por velocidad: ordenar por tiempos seria un ranking de
  // personas sobre tres o cuatro casos de un solo dia, y eso no es justo ni dice
  // nada. El desempate por nombre mantiene el orden estable entre cargas.
  const personas: FilaPersona[] = [...porPersona.entries()]
    .map(([clave, p]) => {
      const ms = p.deltas.map((d) => d.ms);
      return {
        clave,
        email: p.email,
        tags: p.tags,
        medibles: ms.length,
        mediana: mediana(ms),
        masRapida: ms.length > 0 ? Math.min(...ms) : null,
        masTardada: ms.length > 0 ? Math.max(...ms) : null,
        // Ordenados para que la grafica dibuje los puntos de izquierda a derecha.
        deltas: [...p.deltas].sort((a, b) => a.ms - b.ms),
      };
    })
    .sort((a, b) => b.tags - a.tags || personaCorta(a.email).localeCompare(personaCorta(b.email)));

  const dias: FilaDia[] = [...porDia.entries()]
    .map(([dia, d]) => ({ dia, tags: d.tags, medibles: d.deltas.length, mediana: mediana(d.deltas) }))
    .sort((a, b) => b.dia.localeCompare(a.dia));

  return {
    total: filas.length,
    conHora,
    medibles: cobroInst.length,
    fueraDeOrden,
    medCobroInst: mediana(cobroInst),
    masRapida: cobroInst.length > 0 ? Math.min(...cobroInst) : null,
    masTardada: cobroInst.length > 0 ? Math.max(...cobroInst) : null,
    porPersona: personas,
    porDia: dias,
  };
}

export default function PanelInstalacion() {
  const [filas, setFilas] = useState<InstalacionMedida[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setFilas(await listInstalaciones());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron leer las instalaciones.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  if (cargando && filas === null) return <Loader label="Midiendo las instalaciones…" />;

  if (error && filas === null) {
    return (
      <p className="submit-error" role="alert">
        {error}{" "}
        <button type="button" className="link-action" onClick={() => cargar()}>Reintentar</button>
      </p>
    );
  }

  const m = medir(filas ?? []);

  if (m.total === 0) {
    return (
      <div className="panel">
        <p className="panel-title">Instalación de TAGs</p>
        <p className="ti-empty">Todavía no hay ningún TAG instalado.</p>
      </div>
    );
  }

  const diaPico = m.porDia.length === 0
    ? null
    : [...m.porDia].sort((a, b) => b.tags - a.tags || b.dia.localeCompare(a.dia))[0];

  return (
    <>
      <div className="metric-cards metric-cards--4">
        <div className="metric-card">
          <span className="metric-label">TAGs instalados</span>
          <span className="metric-value">{m.total}</span>
          <span className="metric-label" style={{ fontWeight: 600 }}>
            {m.conHora} con hora sellada
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Mediana del trámite</span>
          <span className="metric-value">{duracion(m.medCobroInst)}</span>
          <span className="metric-label" style={{ fontWeight: 600 }}>
            de {m.medibles} instalación(es)
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-label">La más rápida</span>
          <span className="metric-value">{duracion(m.masRapida)}</span>
          <span className="metric-label" style={{ fontWeight: 600 }}>del cobro a la instalación</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">La más tardada</span>
          <span className="metric-value">{duracion(m.masTardada)}</span>
          <span className="metric-label" style={{ fontWeight: 600 }}>
            {diaPico ? `día más movido: ${diaPico.tags} el ${diaCorto(diaPico.dia)}` : "—"}
          </span>
        </div>
      </div>

      <div className="panel">
        <p className="panel-title">Qué miden estas cifras</p>
        <p className="ti-hint">
          Miden el <strong>tiempo del trámite</strong>, no el trabajo de instalar: cuentan desde que
          se cobró hasta que el TAG quedó puesto, así que incluyen lo que la familia tardó en
          presentarse y la fila del día. Se usa la mediana y no el promedio porque con pocos casos un
          solo atípico movería el número entero.
        </p>
        {m.conHora < m.total && (
          <p className="ti-hint">
            De {m.total} instalaciones, {m.conHora} tiene(n) hora sellada. Las anteriores al
            15-sep-2026 guardan la fecha pero no la hora, así que se cuentan en el total y no entran
            en los tiempos. No están escondidas: simplemente no se pueden medir.
          </p>
        )}
        {m.fueraDeOrden > 0 && (
          <p className="ti-hint">
            {m.fueraDeOrden} instalación(es) quedó(aron) registrada(s) antes de su cobro. No entra(n)
            en los tiempos —la resta saldría en negativo— y conviene revisarla(s) en el expediente.
          </p>
        )}
      </div>

      <div className="panel">
        <p className="panel-title">Instalaciones por día <span className="ti-hint" style={{ fontWeight: 600 }}>· solo los días con actividad</span></p>
        {m.porDia.length < 2 ? (
          <p className="ti-hint">
            Toda la actividad está en un solo día ({diaCorto(m.porDia[0].dia)}), así que una gráfica
            no diría nada que no digan las tarjetas de arriba.
          </p>
        ) : (
          <ColumnasPorDia dias={m.porDia} />
        )}
      </div>

      <div className="panel">
        <p className="panel-title">El tiempo de cada instalación</p>
        {m.medibles === 0 ? (
          <p className="ti-hint">
            Ninguna instalación tiene todavía las dos horas (cobro e instalación) necesarias para
            medir el trámite.
          </p>
        ) : (
          <>
            <p className="ti-hint">
              Cada punto es una instalación. Se dibujan todos, uno por uno, en vez de una barra de
              promedio: con {m.medibles} datos lo que importa es ver qué tan dispersos están.
            </p>
            <DispersionTiempos personas={m.porPersona} medianaGlobal={m.medCobroInst} />
            <p className="ti-hint">
              Los renglones están ordenados por cantidad, no por rapidez: <strong>no es una
              comparación entre personas</strong>. Cada quien atiende a la familia que le toca y el
              reloj corre mientras ella llega, así que un tiempo más largo no significa un trabajo
              más lento.
            </p>
          </>
        )}
      </div>

      <div className="panel">
        <p className="panel-title">Los números</p>
        <details>
          <summary className="link-action" style={{ cursor: "pointer", marginBottom: 10 }}>
            Ver las tablas completas
          </summary>

          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Quién instaló</th><th>TAGs</th><th>Con hora</th>
                  <th>Mediana del trámite</th><th>La más rápida</th><th>La más tardada</th>
                </tr>
              </thead>
              <tbody>
                {m.porPersona.map((p) => (
                  <tr key={p.clave || "sin-identificar"}>
                    <td title={p.email ?? "Instalación anterior al bloque 68"}>{personaCorta(p.email)}</td>
                    <td>{p.tags}</td>
                    <td>{p.medibles}</td>
                    <td>{duracion(p.mediana)}</td>
                    <td>{duracion(p.masRapida)}</td>
                    <td>{duracion(p.masTardada)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Día</th><th>TAGs instalados</th><th>Con hora</th><th>Mediana del trámite</th></tr>
              </thead>
              <tbody>
                {m.porDia.map((d) => (
                  <tr key={d.dia}>
                    <td>{diaCorto(d.dia)}</td>
                    <td>{d.tags}</td>
                    <td>{d.medibles}</td>
                    <td>{duracion(d.mediana)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </>
  );
}
