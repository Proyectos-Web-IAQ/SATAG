"use client";

import { useEffect, useState } from "react";
import type { InstalacionMedida } from "@/lib/mock/types";
import { listInstalaciones } from "@/lib/supabase/apiPanel";
import Loader from "@/components/Loader";

// Tablero de instalación (lo pidió Contabilidad): cuántos TAGs se han
// instalado, cuánto tarda el trámite y quién los instaló.
//
// NO LLEVA BLOQUE SQL A PROPÓSITO. La RLS de `registros` y de `pagos` ya deja
// leer a los roles del panel —contador incluido desde el bloque 74— y las
// medianas se calculan aquí sobre unas decenas de filas. Un RPC nuevo sería
// una función más que mantener para no ganar nada.
//
// POR QUÉ MEDIANA Y NO PROMEDIO: al 24-sep-2026 hay poco más de una docena de
// expedientes instalados. Con esa cantidad un solo caso atípico —una familia
// que pagó y vino por su TAG tres semanas después— arrastra el promedio y la
// pantalla mentiría. La mediana aguanta ese caso sin esconderlo: el atípico
// sigue a la vista en la columna «la más tardada».

const MS_MIN = 60000;

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 1 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

// Duración en palabras. El rango real va de minutos —la familia ya estaba
// formada— a semanas, así que una sola unidad no sirve para las dos puntas:
// «0.01 días» y «31 680 min» son igual de ilegibles.
function duracion(ms: number | null): string {
  if (ms === null) return "—";
  const min = Math.round(ms / MS_MIN);
  if (min < 90) return `${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 48) {
    const resto = min % 60;
    return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
  }
  const dias = Math.floor(horas / 24);
  const resto = horas % 24;
  return resto === 0 ? `${dias} días` : `${dias} días ${resto} h`;
}

// `fecha_instalacion` ya viene como AAAA-MM-DD en hora de Querétaro (el bloque
// 68 la calcula así en la BD): se reordena sin construir un Date, que le
// restaría un día a todo lo sellado después de las 18:00.
function diaCorto(dia: string): string {
  const [y, m, d] = dia.split("-");
  return d && m && y ? `${d}/${m}/${y}` : dia;
}

// El correo es la identidad que el bloque 68 sella desde el JWT, así que es el
// dato bueno. En la tabla se muestra la parte de antes de la arroba para que la
// columna quepa; el correo completo queda en el title.
function personaCorta(email: string | null): string {
  if (!email) return "Sin identificar";
  const arroba = email.indexOf("@");
  return arroba > 0 ? email.slice(0, arroba) : email;
}

interface FilaPersona {
  clave: string;
  email: string | null;
  tags: number;
  medibles: number;
  mediana: number | null;
  masRapida: number | null;
  masTardada: number | null;
}

interface FilaDia {
  dia: string;
  tags: number;
  medibles: number;
  mediana: number | null;
}

interface Medicion {
  total: number;
  conHora: number;
  medibles: number;
  // Cobro posterior a la instalación. No debería pasar (se cobra antes de
  // instalar), pero si pasa la resta sale negativa y una mediana negativa no
  // significa nada: se sacan del cálculo y se dicen aparte.
  fueraDeOrden: number;
  medCobroInst: number | null;
  medAltaCobro: number | null;
  diaPico: FilaDia | null;
  porPersona: FilaPersona[];
  porDia: FilaDia[];
}

function medir(filas: InstalacionMedida[]): Medicion {
  const cobroInst: number[] = [];
  const altaCobro: number[] = [];
  const porPersona = new Map<string, { email: string | null; tags: number; deltas: number[] }>();
  const porDia = new Map<string, { tags: number; deltas: number[] }>();
  let conHora = 0;
  let fueraDeOrden = 0;

  for (const f of filas) {
    if (f.cobradoEn) {
      const d = Date.parse(f.cobradoEn) - Date.parse(f.altaEn);
      if (Number.isFinite(d) && d >= 0) altaCobro.push(d);
    }

    // El delta del trámite existe solo si hay las dos horas y van en orden.
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
    if (delta !== null) persona.deltas.push(delta);
    porPersona.set(clave, persona);

    const dia = porDia.get(f.fechaInstalacion) ?? { tags: 0, deltas: [] };
    dia.tags += 1;
    if (delta !== null) dia.deltas.push(delta);
    porDia.set(f.fechaInstalacion, dia);
  }

  // Por volumen, NO por velocidad: ordenar por tiempos sería un ranking de
  // personas sobre tres o cuatro casos de un solo día, y eso no es justo ni
  // dice nada. El desempate por nombre mantiene el orden estable entre cargas.
  const personas: FilaPersona[] = [...porPersona.entries()]
    .map(([clave, p]) => ({
      clave,
      email: p.email,
      tags: p.tags,
      medibles: p.deltas.length,
      mediana: mediana(p.deltas),
      masRapida: p.deltas.length > 0 ? Math.min(...p.deltas) : null,
      masTardada: p.deltas.length > 0 ? Math.max(...p.deltas) : null,
    }))
    .sort((a, b) => b.tags - a.tags || personaCorta(a.email).localeCompare(personaCorta(b.email)));

  const dias: FilaDia[] = [...porDia.entries()]
    .map(([dia, d]) => ({ dia, tags: d.tags, medibles: d.deltas.length, mediana: mediana(d.deltas) }))
    .sort((a, b) => b.dia.localeCompare(a.dia));

  const diaPico = dias.length === 0
    ? null
    : [...dias].sort((a, b) => b.tags - a.tags || b.dia.localeCompare(a.dia))[0];

  return {
    total: filas.length,
    conHora,
    medibles: cobroInst.length,
    fueraDeOrden,
    medCobroInst: mediana(cobroInst),
    medAltaCobro: mediana(altaCobro),
    diaPico,
    porPersona: personas,
    porDia: dias,
  };
}

// Tablero de instalación, dentro de la pestaña Finanzas. Carga aparte del
// estado de la caja: si esta lectura se cae, la caja y el corte siguen
// sirviendo, que es lo que la pantalla tiene que garantizar.
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

  if (cargando && filas === null) {
    return (
      <div className="panel">
        <p className="panel-title">Instalación de TAGs</p>
        <Loader label="Midiendo las instalaciones…" />
      </div>
    );
  }

  if (error && filas === null) {
    return (
      <div className="panel">
        <p className="panel-title">Instalación de TAGs</p>
        <p className="submit-error" role="alert">
          {error}{" "}
          <button type="button" className="link-action" onClick={() => cargar()}>Reintentar</button>
        </p>
      </div>
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

  return (
    <>
      <div className="panel">
        <p className="panel-title">Instalación de TAGs</p>

        <p className="ti-hint">
          Estas cifras miden el <strong>tiempo del trámite</strong>, no el trabajo de instalar:
          cuentan desde que se cobró hasta que el TAG quedó puesto, así que incluyen lo que la
          familia tardó en presentarse y la fila del día. Se usa la mediana y no el promedio porque
          con pocos casos un solo atípico movería el número entero.
        </p>

        <div className="metric-cards metric-cards--4">
          <div className="metric-card">
            <span className="metric-label">TAGs instalados</span>
            <span className="metric-value">{m.total}</span>
            <span className="metric-label" style={{ fontWeight: 600 }}>
              {m.conHora} con hora sellada
            </span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Del cobro a la instalación</span>
            <span className="metric-value">{duracion(m.medCobroInst)}</span>
            <span className="metric-label" style={{ fontWeight: 600 }}>
              mediana de {m.medibles} instalación(es)
            </span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Del alta al cobro</span>
            <span className="metric-value">{duracion(m.medAltaCobro)}</span>
            <span className="metric-label" style={{ fontWeight: 600 }}>
              lo que tarda la familia en pagar
            </span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Día más movido</span>
            <span className="metric-value">{m.diaPico ? m.diaPico.tags : "—"}</span>
            <span className="metric-label" style={{ fontWeight: 600 }}>
              {m.diaPico ? `TAGs el ${diaCorto(m.diaPico.dia)}` : "sin datos"}
            </span>
          </div>
        </div>

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

        <div className="table-wrap">
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

        <p className="ti-hint">
          La tabla está ordenada por cantidad, no por rapidez: <strong>no es una comparación entre
          personas</strong>. Cada quien atiende a la familia que le toca y el reloj corre mientras
          ella llega, así que un tiempo más largo no significa un trabajo más lento.
        </p>
      </div>

      <div className="panel">
        <p className="panel-title">Instalación por día ({m.porDia.length} día(s) con actividad)</p>
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
      </div>
    </>
  );
}
