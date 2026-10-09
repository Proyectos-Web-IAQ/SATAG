"use client";

// Datos › Archivos de GES: donde TI copia las consultas reducidas y sube lo que GES
// exporto (bloque 92).
//
// GES solo se exporta a mano, por «Consulta Libre». Por eso la consulta vive aqui, lista
// para copiar (Gerardo, 8-oct): quien carga no tiene que buscarla en ningun otro lado, y
// la consulta y el lector (lib/ges/leer.ts) son el mismo contrato. Un archivo con
// columnas de mas se rechaza entero, antes de mandar nada.
//
// Lo que se guarda es lo que la base acepte despues del freno (igual que el padron de
// ZK): si el archivo dejaria fuera a muchas personas o es de un ciclo anterior, no se
// escribe nada y se pregunta.

import { useEffect, useState } from "react";
import { CONSULTA_EMPLEADOS, CONSULTA_PERSONAL, cicloEscolar, consultaFamilias, nombreCiclo } from "@/lib/ges/consultas";
import { leerArchivoGes, type FuenteGes, type LecturaGes } from "@/lib/ges/leer";
import { huella } from "@/lib/huella";
import { olvidarGes } from "@/components/admin/IdentificacionGes";
import { fecha } from "@/lib/formato";
import {
  cargarGes,
  listUltimasCargasGes,
  type CargaGes,
  type MetaGes,
  type RespuestaCargaGes,
} from "@/lib/supabase/apiPanel";

const NOMBRE_FUENTE: Record<FuenteGes, string> = {
  familias: "Familias",
  personal: "Personal docente",
  empleados: "Empleados (administración, mantenimiento, intendencia)",
};

const n = (x: number) => x.toLocaleString("es-MX");

function BloqueConsulta({ id, titulo, sql, nota }: { id: string; titulo: string; sql: string; nota?: React.ReactNode }) {
  const [copiado, setCopiado] = useState<"si" | "no" | null>(null);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(sql);
      setCopiado("si");
    } catch {
      setCopiado("no");
    }
    setTimeout(() => setCopiado(null), 2500);
  }
  return (
    <div className="field">
      <div className="chip-row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <span className="label" id={`${id}-t`}>{titulo}</span>
        <button type="button" className="ghost-action ghost-action--chico" onClick={copiar} aria-describedby={`${id}-t`}>
          {copiado === "si" ? "Copiada" : "Copiar consulta"}
        </button>
      </div>
      {nota}
      <pre className="consulta-sql" aria-labelledby={`${id}-t`}>{sql}</pre>
      {copiado === "no" && (
        <p className="hint" role="status">El navegador no dejó copiar: seleccione el texto de la consulta y cópielo a mano.</p>
      )}
    </div>
  );
}

export default function VistaGes({ email }: { email: string | null }) {
  const [cargas, setCargas] = useState<Partial<Record<FuenteGes, CargaGes>> | null>(null);
  const [ciclo, setCiclo] = useState<number>(cicloEscolar());
  const [procesando, setProcesando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<{
    lectura: LecturaGes;
    meta: MetaGes;
    respuesta: Extract<RespuestaCargaGes, { requiereConfirmacion: true }>;
  } | null>(null);

  async function leerCargas() {
    try {
      setCargas(await listUltimasCargasGes());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer lo guardado de GES.");
    }
  }

  useEffect(() => {
    leerCargas();
  }, []);

  async function elegir(f: File | null) {
    if (!f) return;
    setError(null);
    setAviso(null);
    setPendiente(null);
    setProcesando("Leyendo el archivo de GES…");
    try {
      const lectura = await leerArchivoGes(f);
      const meta: MetaGes = { archivo: f.name, sha256: await huella(await f.arrayBuffer()), filasArchivo: lectura.filasArchivo, ciclo: lectura.ciclo };
      await enviar(lectura, meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo de GES.");
    } finally {
      setProcesando(null);
    }
  }

  async function enviar(lectura: LecturaGes, meta: MetaGes) {
    setProcesando(`Guardando ${NOMBRE_FUENTE[lectura.fuente].toLowerCase()} en SATAG…`);
    setError(null);
    try {
      const r = await cargarGes(lectura.fuente, meta, lectura.personas, email);
      if (r.requiereConfirmacion) {
        setPendiente({ lectura, meta, respuesta: r });
        return;
      }
      setPendiente(null);
      const que = NOMBRE_FUENTE[lectura.fuente] + (lectura.ciclo ? ` del ciclo ${nombreCiclo(lectura.ciclo)}` : "");
      setAviso(
        (r.yaEstaba
          ? `${que}: ya estaba guardado tal cual, ${n(r.vigentes)} personas vigentes.`
          : `${que} guardado: ${n(r.insertadas)} personas nuevas, ${n(r.actualizadas)} con cambios y ${n(r.retiradas)} que ya no vienen en GES. ${n(r.vigentes)} vigentes.`) +
          (lectura.avisos.length ? ` ${lectura.avisos.join(" ")}` : "") +
          " Ya puede borrar el archivo de su equipo: lo que vale es lo guardado en SATAG.",
      );
      olvidarGes();
      await leerCargas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el archivo de GES.");
    } finally {
      setProcesando(null);
    }
  }

  const fam = cargas?.familias;
  return (
    <>
      <p className="titular__migas">
        <span>Datos</span>
        <span>›</span>
        <span>Archivos de GES</span>
      </p>
      <h2 className="titular">
        {cargas === null
          ? "Leyendo lo guardado de GES…"
          : fam
            ? `${n(fam.personas)} personas de familias del ciclo ${fam.ciclo ? nombreCiclo(fam.ciclo) : "—"}, cargadas el ${fecha(fam.cargadoEn)}.`
            : "Todavía no hay nada de GES guardado."}
      </h2>
      <p className="titular__sub">
        GES dice quién es cada persona y si sigue en el colegio. SATAG guarda solo lo indispensable para eso:
        nombre, familia, grupos de los hijos y, del personal, área, puesto y si sigue activo. De los alumnos, solo los de
        Preparatoria. Copie la consulta, córrala en <strong>GES › Exportar Información › Consulta Libre</strong> en formato
        Microsoft Excel y elija aquí el archivo. Si el archivo trae cualquier otro dato, SATAG lo rechaza sin guardar nada.
      </p>

      <BloqueConsulta
        id="q-familias"
        titulo={`1. Familias activas del ciclo ${nombreCiclo(ciclo)}`}
        sql={consultaFamilias(ciclo)}
        nota={
          <p className="hint">
            El ciclo cambia en agosto.{" "}
            <label>
              Ciclo que empieza en{" "}
              <input
                className="input"
                type="number"
                min={2020}
                max={2100}
                value={ciclo}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isInteger(v) && v >= 2020 && v <= 2100) setCiclo(v);
                }}
                style={{ display: "inline-block", width: "6.5rem", minHeight: 0, padding: "2px 8px" }}
              />
            </label>
          </p>
        }
      />
      <BloqueConsulta id="q-personal" titulo="2. Personal docente" sql={CONSULTA_PERSONAL} />
      <BloqueConsulta
        id="q-empleados"
        titulo="3. Empleados (administración, mantenimiento, intendencia)"
        sql={CONSULTA_EMPLEADOS}
        nota={<p className="hint">Sin los docentes: ellos ya salen en la consulta 2.</p>}
      />

      <div className="field" style={{ marginTop: 16 }}>
        <label className="label" htmlFor="arch-ges">Archivo exportado de GES</label>
        <input
          id="arch-ges"
          className="input"
          type="file"
          accept=".xls,.xlsx,.csv"
          disabled={procesando !== null}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            e.target.value = "";
            elegir(f);
          }}
        />
        <p className="hint">SATAG reconoce solo si es de familias, de personal o de empleados. Del archivo solo viaja su huella digital y las personas ya reducidas.</p>
      </div>

      {procesando && (
        <div className="carga">
          <p className="carga__t"><span role="status">{procesando}</span></p>
          <div className="carga__b carga__b--vaga" role="progressbar" aria-label={procesando}><i /></div>
        </div>
      )}
      {error && <p className="submit-error" role="alert">{error}</p>}
      {aviso && <p className="notice" role="status" style={{ margin: "10px 0 0", padding: "10px 12px" }}>{aviso}</p>}
      {pendiente && (
        <div className="notice" role="group" aria-labelledby="ges-pregunta" style={{ margin: "10px 0 0", padding: "12px 14px" }}>
          <p id="ges-pregunta" style={{ margin: 0 }}>
            <strong>No se guardó nada todavía.</strong>{" "}
            {pendiente.respuesta.motivos.includes("retira_muchos") &&
              `El archivo ${pendiente.meta.archivo} dejaría fuera a ${n(pendiente.respuesta.retiraria)} de las ${n(pendiente.respuesta.vigentes)} personas vigentes de ${NOMBRE_FUENTE[pendiente.lectura.fuente].toLowerCase()}. Suele pasar cuando la consulta se corrió con un filtro o de otro ciclo. `}
            {pendiente.respuesta.motivos.includes("ciclo_anterior") &&
              `El archivo es del ciclo ${pendiente.respuesta.ciclo ? nombreCiclo(pendiente.respuesta.ciclo) : "—"}, anterior al ya guardado (${pendiente.respuesta.ultimoCiclo ? nombreCiclo(pendiente.respuesta.ultimoCiclo) : "—"}). `}
            Si es el archivo correcto, aplíquelo; si no, cancele y vuelva a exportar.
          </p>
          <div className="chip-row" style={{ marginTop: 10 }}>
            <button type="button" className="btn" disabled={procesando !== null}
              onClick={() => enviar(pendiente.lectura, { ...pendiente.meta, forzar: true })}>
              Aplicar de todos modos
            </button>
            <button type="button" className="link-action" disabled={procesando !== null} onClick={() => setPendiente(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {cargas && (
        <div className="firme">
          <div><strong>Lo guardado.</strong></div>
          {(Object.keys(NOMBRE_FUENTE) as FuenteGes[]).map((f) => {
            const c = cargas[f];
            return (
              <div key={f}>
                {NOMBRE_FUENTE[f]}:{" "}
                {c
                  ? `${n(c.personas)} personas${c.ciclo ? `, ciclo ${nombreCiclo(c.ciclo)}` : ""}, del archivo ${c.archivo} cargado el ${fecha(c.cargadoEn)}.`
                  : "todavía no se ha cargado."}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
