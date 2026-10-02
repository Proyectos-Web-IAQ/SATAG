"use client";

// El contenedor de la pestana Estacionamiento: consigue las cifras y se las pasa al
// panel, que solo dibuja.
//
// DE DONDE SALE CADA COSA
//   - La BITACORA la trae TI en un archivo. Se lee en el navegador, se mide ahi
//     mismo y ademas se manda a la base para que haya serie. No se sube a Storage:
//     del archivo solo viaja su SHA-256, que es lo que impide procesarlo dos veces.
//   - El PADRON sale de `registros`, que desde el 1-oct ya tiene los expedientes
//     migrados. Es lo que resuelve de quien es cada tarjeta y que derecho de pluma
//     tiene.
//   - El DEPARTAMENTO fino —PRIMARIA DOCENTE, SECUNDARIA, MANTENIMIENTO— vive solo
//     en ZK: SATAG no lo modela, y modelarlo seria duplicar un catalogo que otro
//     sistema mantiene. Por eso el export de personas es un SEGUNDO archivo y es
//     OPCIONAL: sin el la pantalla funciona igual, agrupando por los cinco grupos
//     del padron, y con el aparece el desglose por departamento.
//
// POR QUE SE MIDE AQUI Y NO EN LA BASE. Porque lo que se mide es el archivo que se
// acaba de subir, que ya esta en memoria: bajarlo otra vez de la base para medirlo
// seria pedir ~9,600 filas que el navegador acaba de tener. La medicion de la SERIE
// —varias ventanas juntas— si baja a la base, y para eso estan `zk_eventos` y la
// vista de estancias; eso llega cuando haya mas de una ventana que comparar.

import { useEffect, useRef, useState } from "react";
import Loader from "@/components/Loader";
import PanelEstacionamiento, { type DatosEstacionamiento } from "@/components/admin/PanelEstacionamiento";
import {
  cargarEventosZk,
  listImportacionesZk,
  listPadronEstacionamiento,
  type ImportacionZk,
  type PadronEstacionamiento,
} from "@/lib/supabase/apiPanel";
import { medirEleccion, medirEstacionamiento } from "@/lib/estacionamiento";
import { huecoEnDias, leerEventosZk, type LecturaEventos } from "@/lib/zk/eventos";
import { GRUPO_POR_TIPO, SIN_CLASIFICAR, indexarPadron, leerPadronZk, type Fuentes, type PersonaZk } from "@/lib/zk/padron";
import type { RolPanel } from "@/lib/supabase/auth";

/** Quien puede ver el detalle con nombres. Direccion mira agregados. */
const VEN_IDENTIDAD: RolPanel[] = ["ti", "contador", "super"];

/** El SHA-256 del archivo, que es lo que impide procesarlo dos veces. */
async function huella(bytes: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function VistaEstacionamiento({ rol, email }: { rol: RolPanel; email: string | null }) {
  const [padron, setPadron] = useState<PadronEstacionamiento[] | null>(null);
  const [importaciones, setImportaciones] = useState<ImportacionZk[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const [lectura, setLectura] = useState<LecturaEventos | null>(null);
  const [personas, setPersonas] = useState<Map<string, PersonaZk> | null>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  /** Avance de la carga: `null` mientras no se sepa cuanto falta. */
  const [avance, setAvance] = useState<{ hechas: number; total: number } | null>(null);
  const [avisoCarga, setAvisoCarga] = useState<string | null>(null);
  const bytesRef = useRef<ArrayBuffer | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const [p, i] = await Promise.all([listPadronEstacionamiento(), listImportacionesZk()]);
      setPadron(p);
      setImportaciones(i);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el padrón.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar: el
    // padrón no cambia mientras se mira la pantalla, y recargarlo en cada render
    // bajaría ~2,900 filas por nada.
  }, []);

  async function elegirBitacora(f: File | null) {
    if (!f) return;
    setProcesando("Leyendo la bitácora…");
    setError(null);
    setAvisoCarga(null);
    try {
      bytesRef.current = await f.arrayBuffer();
      const l = await leerEventosZk(f);
      setLectura(l);
      setArchivo(f.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer la bitácora.");
    } finally {
      setProcesando(null);
    }
  }

  async function elegirPadronZk(f: File | null) {
    if (!f) return;
    setProcesando("Leyendo el padrón de personas…");
    setError(null);
    try {
      const l = await leerPadronZk(f);
      setPersonas(indexarPadron(l.personas));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el padrón de personas.");
    } finally {
      setProcesando(null);
    }
  }

  /** Manda la ventana a la base. Es lo que hace que mañana haya serie. */
  async function guardar() {
    if (!lectura || !bytesRef.current) return;
    setProcesando("Guardando la bitácora en SATAG…");
    setError(null);
    try {
      const sha = await huella(bytesRef.current);
      const anterior = importaciones[0]?.hasta ?? null;
      const meta = {
        archivo: archivo ?? "sin nombre",
        sha256: sha,
        filasArchivo: lectura.resumen.filasArchivo,
        filasConTarjeta: lectura.resumen.filasConTarjeta,
        topeAlcanzado: lectura.resumen.topeAlcanzado,
        desde: lectura.resumen.desde,
        hasta: lectura.resumen.hasta,
        huecoDias: huecoEnDias(anterior, lectura.resumen.desde),
      };
      const filas = lectura.eventos
        .filter((e) => e.sentido !== null)
        .map((e) => ({
          idEvento: String(e.idEvento),
          ocurrioEn: e.ocurrioEn,
          lote: e.lote,
          sentido: e.sentido,
          tarjeta: e.tarjeta,
          concedido: e.concedido,
          repeticion: e.repeticion,
          departamentoEvento: e.departamentoEvento,
        }));
      setAvance({ hechas: 0, total: filas.length });
      const r = await cargarEventosZk(meta, filas, email, (hechas, total) =>
        setAvance({ hechas, total }),
      );
      setAvisoCarga(
        r.insertados === 0
          ? `Esta ventana ya estaba guardada: ${r.yaEstaban.toLocaleString("es-MX")} eventos ya existían y no se duplicó ninguno.`
          : `Se guardaron ${r.insertados.toLocaleString("es-MX")} eventos nuevos${r.yaEstaban > 0 ? ` y ${r.yaEstaban.toLocaleString("es-MX")} ya estaban` : ""}.`,
      );
      setImportaciones(await listImportacionesZk());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la bitácora.");
    } finally {
      setProcesando(null);
      setAvance(null);
    }
  }

  if (cargando && padron === null) return <Loader label="Leyendo el padrón…" />;

  if (error && padron === null) {
    return (
      <p className="submit-error" role="alert">
        {error}{" "}
        <button type="button" className="link-action" onClick={() => cargar()}>Reintentar</button>
      </p>
    );
  }

  const porTag = new Map((padron ?? []).map((p) => [p.noDispositivo, p]));

  // LA REGLA QUE NO SE PUEDE OMITIR: el dueño se resuelve contra el padrón, NUNCA
  // contra el departamento que trae el evento. Las instalaciones del día cruzan la
  // pluma antes de que se suba el padrón a ZK —que se sube al cierre— así que
  // aparecen como STOCK SATAG; agrupar por ese texto las clasificaría mal todas.
  const rolDe = (tarjeta: string) => {
    const r = porTag.get(tarjeta);
    if (r) return GRUPO_POR_TIPO[r.tipoUsuario] ?? SIN_CLASIFICAR;
    const p = personas?.get(tarjeta);
    return p ? (GRUPO_POR_TIPO[p.departamentoId] ?? SIN_CLASIFICAR) : SIN_CLASIFICAR;
  };
  const deptoDe = personas
    ? (tarjeta: string) => personas.get(tarjeta)?.departamento || "No está en el padrón de ZK"
    : undefined;
  const tieneAmbos = (tarjeta: string) => (porTag.get(tarjeta)?.estacionamientos.length ?? 0) >= 2;

  const datos: DatosEstacionamiento | null = lectura
    ? (() => {
        const m = medirEstacionamiento(lectura.eventos, rolDe, { deptoDe });
        const fuentes = new Map<string, Fuentes>();
        for (const u of m.porCredencial) {
          const r = porTag.get(u.tarjeta);
          fuentes.set(u.tarjeta, {
            satag: r !== undefined,
            hoja: r?.origenExpediente === "migracion_hoja",
            zk: personas ? personas.has(u.tarjeta) : r?.origenExpediente === "migracion_zk",
          });
        }
        return {
          m,
          eleccion: medirEleccion(lectura.eventos, tieneAmbos),
          resumen: lectura.resumen,
          cupos: { E1: null, E2: null },
          padron: personas,
          fuentes,
          verIdentidad: VEN_IDENTIDAD.includes(rol),
          ventanas: importaciones.length,
          huecoDias: huecoEnDias(importaciones[0]?.hasta ?? null, lectura.resumen.desde),
        };
      })()
    : null;

  return (
    <>
      <div className="panel">
        <p className="panel-title">La bitácora de accesos</p>
        <p className="ti-hint">
          En ZKBioSecurity: <strong>Acceso → Reportes → Todos los Eventos → Exportar</strong>, en formato
          CSV. El archivo se lee en este navegador y no se sube a ningún lado: de él solo viaja su huella
          digital, que es lo que impide procesarlo dos veces.
        </p>

        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor="arch-eventos">Bitácora de accesos</label>
            <input
              id="arch-eventos"
              className="input"
              type="file"
              accept=".csv,.txt"
              disabled={procesando !== null}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                elegirBitacora(f);
              }}
            />
            {archivo && (
              <p className="hint">
                {archivo} · {lectura?.resumen.filasArchivo.toLocaleString("es-MX")} filas ·{" "}
                {lectura?.resumen.diasConActividad} días
              </p>
            )}
          </div>

          <div className="field">
            <label className="label" htmlFor="arch-personas">Padrón de personas de ZK (opcional)</label>
            <input
              id="arch-personas"
              className="input"
              type="file"
              accept=".csv,.txt"
              disabled={procesando !== null}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                elegirPadronZk(f);
              }}
            />
            <p className="hint">
              {personas
                ? `${personas.size.toLocaleString("es-MX")} personas · ya se puede ver el desglose por departamento`
                : "Sin él la pantalla funciona igual; con él aparece el desglose por departamento de ZK."}
            </p>
          </div>
        </div>

        {procesando && (
          <div className="carga">
            <p className="carga__t">
              <span role="status">{procesando}</span>
              {avance && (
                <span className="carga__n">
                  {avance.hechas.toLocaleString("es-MX")} de {avance.total.toLocaleString("es-MX")} eventos
                </span>
              )}
            </p>
            <div
              className={`carga__b${avance ? "" : " carga__b--vaga"}`}
              role="progressbar"
              aria-label={procesando}
              aria-valuemin={avance ? 0 : undefined}
              aria-valuemax={avance ? avance.total : undefined}
              aria-valuenow={avance ? avance.hechas : undefined}
            >
              <i style={avance ? { width: `${Math.round((avance.hechas / Math.max(avance.total, 1)) * 100)}%` } : undefined} />
            </div>
          </div>
        )}
        {error && <p className="submit-error" role="alert">{error}</p>}
        {avisoCarga && <p className="notice" style={{ margin: "10px 0 0", padding: "10px 12px" }}>{avisoCarga}</p>}

        {lectura && (
          <div className="chip-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn" disabled={procesando !== null} onClick={() => guardar()}>
              Guardar esta ventana en SATAG
            </button>
            <span className="ti-hint" style={{ alignSelf: "center" }}>
              {importaciones.length === 0
                ? "Todavía no hay ninguna ventana guardada."
                : `${importaciones.length} ${importaciones.length === 1 ? "ventana guardada" : "ventanas guardadas"} · la última llega al ${importaciones[0]?.hasta?.slice(0, 10) ?? "—"}`}
            </span>
          </div>
        )}
      </div>

      {datos ? (
        <PanelEstacionamiento d={datos} />
      ) : (
        <div className="panel">
          <p className="ti-empty">
            Para ver la medición hace falta la bitácora de accesos. Es el archivo que ZKBioSecurity exporta
            desde Acceso → Reportes → Todos los Eventos.
          </p>
        </div>
      )}
    </>
  );
}
