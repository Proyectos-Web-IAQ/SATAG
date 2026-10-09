"use client";

// Datos › Archivos de ZK: los cuatro «Personal de Apertura» (bloque 93).
//
// Uno por puerta (Entrada 1, Salida 1, Entrada 2, Salida 2). Se pueden elegir los
// cuatro de una vez. Cada uno reemplaza la foto de su puerta; con el freno del
// padron, uno que dejaria sin acceso a mucha gente de golpe pregunta antes. Al
// terminar, SATAG compara los movimientos en ZK con lo cargado.

import { useEffect, useState } from "react";
import { leerPuertaZk, NOMBRE_PUERTA, type LecturaPuerta, type PuertaZk } from "@/lib/zk/puertas";
import { huella } from "@/lib/huella";
import { fechaHora } from "@/lib/formato";
import { GLOSARIO } from "@/lib/glosario";
import {
  cargarPuertasZk,
  listUltimasCargasPuertas,
  verificarMovimientosZk,
  type CargaPuertaZk,
  type MetaPuertaZk,
  type RespuestaCargaPuertaZk,
  type ResultadoVerificacionZk,
} from "@/lib/supabase/apiPanel";

const n = (x: number) => x.toLocaleString("es-MX");

/** La verificacion dicha en una frase; vacia si no hubo nada que decir. */
export function textoVerificacion(r: ResultadoVerificacionZk): string {
  const partes: string[] = [];
  if (r.verificados) partes.push(`${n(r.verificados)} ${r.verificados === 1 ? "movimiento quedó verificado" : "movimientos quedaron verificados"} en ZK`);
  if (r.yaReflejados) partes.push(`${n(r.yaReflejados)} ${r.yaReflejados === 1 ? "caso se cerró porque ZK ya lo reflejaba" : "casos se cerraron porque ZK ya los reflejaba"}`);
  if (r.noCoinciden) partes.push(`${n(r.noCoinciden)} ${r.noCoinciden === 1 ? "caso se reabrió porque ZK no coincide" : "casos se reabrieron porque ZK no coincide"}`);
  if (r.porComprobar) partes.push(`${n(r.porComprobar)} ${r.porComprobar === 1 ? "sigue" : "siguen"} por comprobar${r.puertasCargadas < 4 ? ": faltan los «Personal de Apertura»" : " con archivos más nuevos"}`);
  return partes.length ? `${partes.join("; ")}. El detalle está en Datos › Movimientos en ZK.` : "";
}

const ORDEN: PuertaZk[] = ["E1-entrada", "E1-salida", "E2-entrada", "E2-salida"];

export default function CargaPuertasZk({ email, onAviso }: { email: string | null; onAviso: (texto: string) => void }) {
  const [cargas, setCargas] = useState<Partial<Record<PuertaZk, CargaPuertaZk>> | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<{
    lectura: LecturaPuerta;
    meta: MetaPuertaZk;
    respuesta: Extract<RespuestaCargaPuertaZk, { requiereConfirmacion: true }>;
    resto: File[];
  } | null>(null);

  const leerCargas = () => listUltimasCargasPuertas().then(setCargas).catch(() => setCargas({}));
  useEffect(() => {
    leerCargas();
  }, []);

  async function procesar(archivos: File[], forzado?: { lectura: LecturaPuerta; meta: MetaPuertaZk }) {
    setProcesando(true);
    setError(null);
    const hechas: string[] = [];
    try {
      const cola: { lectura: LecturaPuerta; meta: MetaPuertaZk }[] = forzado ? [forzado] : [];
      for (const f of archivos) {
        const lectura = await leerPuertaZk(f);
        cola.push({ lectura, meta: { archivo: f.name, sha256: await huella(await f.arrayBuffer()), filasArchivo: lectura.filasArchivo, exportadoEn: lectura.exportadoEn } });
      }
      for (let i = 0; i < cola.length; i++) {
        const { lectura, meta } = cola[i];
        const r = await cargarPuertasZk(lectura.puerta, meta, lectura.ids, email);
        if (r.requiereConfirmacion) {
          // Se pregunta por esta; las que siguen esperan a la respuesta.
          setPendiente({ lectura, meta, respuesta: r, resto: archivos.slice(forzado ? i : i + 1) });
          if (hechas.length) onAviso(`Guardado: ${hechas.join("; ")}.`);
          return;
        }
        hechas.push(`${NOMBRE_PUERTA[lectura.puerta]} con ${n(r.personas)} personas${r.yaEstaba ? " (sin cambios)" : ` (${n(r.agregadas)} con acceso nuevo, ${n(r.quitadas)} sin acceso ya)`}`);
      }
      setPendiente(null);
      const v = await verificarMovimientosZk(email);
      onAviso(`Guardado: ${hechas.join("; ")}. ${textoVerificacion(v)}`.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el «Personal de Apertura».");
      if (hechas.length) onAviso(`Guardado antes del error: ${hechas.join("; ")}.`);
    } finally {
      setProcesando(false);
      leerCargas();
    }
  }

  return (
    <div className="field">
      <label className="label" htmlFor="arch-puertas">Archivos «Personal de Apertura» de ZK (las 4 puertas)</label>
      <input
        id="arch-puertas"
        className="input"
        type="file"
        multiple
        accept=".csv,.txt,.xls,.xlsx"
        disabled={procesando}
        onChange={(e) => {
          const fs = [...(e.target.files ?? [])];
          e.target.value = "";
          if (fs.length) procesar(fs);
        }}
      />
      <p className="hint">
        Uno por puerta: Entrada 1, Salida 1, Entrada 2 y Salida 2. Se exportan en ZK desde {GLOSARIO.puertasZk.ruta}, y se
        pueden elegir los cuatro de una vez. Dicen quién tiene acceso hoy; con ellos SATAG comprueba que los movimientos en ZK
        quedaron bien.{" "}
        {cargas &&
          (ORDEN.every((p) => cargas[p])
            ? `Guardados: ${ORDEN.map((p) => `${NOMBRE_PUERTA[p]} ${n(cargas[p]!.personas)} (${fechaHora(cargas[p]!.exportadoEn ?? cargas[p]!.cargadoEn)})`).join(", ")}.`
            : `Faltan: ${ORDEN.filter((p) => !cargas[p]).map((p) => NOMBRE_PUERTA[p]).join(", ")}.`)}
      </p>
      {procesando && <p className="hint" role="status">Guardando las puertas…</p>}
      {error && <p className="submit-error" role="alert">{error}</p>}
      {pendiente && (
        <div className="notice" role="group" aria-labelledby="puerta-pregunta" style={{ margin: "10px 0 0", padding: "12px 14px" }}>
          <p id="puerta-pregunta" style={{ margin: 0 }}>
            <strong>No se guardó {NOMBRE_PUERTA[pendiente.lectura.puerta]} todavía.</strong>{" "}
            {pendiente.respuesta.motivos.includes("retira_muchos") &&
              `El archivo dejaría sin esa puerta a ${n(pendiente.respuesta.retiraria)} de las ${n(pendiente.respuesta.vigentes)} personas que la tienen. Suele pasar con un reporte filtrado o de otra puerta. `}
            {pendiente.respuesta.motivos.includes("export_anterior") &&
              `El archivo se exportó de ZK el ${fechaHora(pendiente.respuesta.exportadoEn)}, antes que el último guardado (${fechaHora(pendiente.respuesta.ultimoExportadoEn)}). `}
            Si es el archivo correcto, aplíquelo; si no, cancele y vuelva a exportarlo.
          </p>
          <div className="chip-row" style={{ marginTop: 10 }}>
            <button type="button" className="btn" disabled={procesando}
              onClick={() => procesar(pendiente.resto, { lectura: pendiente.lectura, meta: { ...pendiente.meta, forzar: true } })}>
              Aplicar de todos modos
            </button>
            <button type="button" className="link-action" disabled={procesando} onClick={() => setPendiente(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
