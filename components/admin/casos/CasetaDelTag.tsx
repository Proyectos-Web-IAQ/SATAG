"use client";

// En un caso de la caseta («Abierta con el boton…» o «Reporte de caseta»), lo que
// la caseta y la pluma dicen de ESE vehiculo (Gerardo, 29-oct: «ver los datos para
// ver si es recurrente y si hay que tomar accion o fue caso aislado»). Solo datos,
// sin veredicto; los calculos viven en lib/casetaDelTag.ts.
//
// Lee dos cosas al abrir el caso: los reportes de este vehiculo (todos) y los de
// los ultimos DIAS_CONTEXTO dias (para «esa puerta, ese dia»). Lo de la pluma sale
// de la bitacora que el tablero ya tiene cargada: fuera de su ventana no se dice
// nada. Leen ti, contador, admin y super (RLS del 97).
import { useEffect, useMemo, useState } from "react";
import { type CasoGuardado, numeroCaso } from "@/lib/casosRegistro";
import type { EventoZk } from "@/lib/zk/eventos";
import { listReportesCaseta } from "@/lib/supabase/apiPanel";
import { rotuloMotivo, tituloPuerta, VEREDICTO, type ReporteCaseta } from "@/lib/caseta";
import { lecturasDe } from "@/lib/casosEvidencia";
import { diaDe, diaSemana, fechaHora, hora } from "@/lib/formato";
import { Bloque, Tabla, type Ventana } from "@/components/admin/casos/GraficasCaso";
import { diaEnVentana, otrosEnLaPuerta, plumaEseDia, quienDelReporte, reportesDelVehiculo, resumenVehiculo } from "@/lib/casetaDelTag";

const DIAS_CONTEXTO = 60;

const pantalla = (r: ReporteCaseta) => (r.veredicto ? VEREDICTO[r.veredicto].titulo : "—");

export default function CasetaDelTag({ caso, eventos, ventana }: { caso: CasoGuardado; eventos: EventoZk[] | null; ventana: Ventana }) {
  const [mios, setMios] = useState<ReporteCaseta[] | null>(null);
  const [recientes, setRecientes] = useState<ReporteCaseta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const registroId = caso.registroId;
  const tarjeta = caso.tarjeta;

  useEffect(() => {
    if (!registroId && !tarjeta) return;
    let vivo = true;
    setMios(null);
    setError(null);
    Promise.all([
      listReportesCaseta({ registroId: registroId ?? undefined, tarjetas: tarjeta ? [tarjeta] : [] }),
      listReportesCaseta({ dias: DIAS_CONTEXTO }),
    ])
      .then(([m, r]) => { if (vivo) { setMios(m); setRecientes(r); } })
      .catch((e: unknown) => { if (vivo) { setMios([]); setError(e instanceof Error ? e.message : "No se pudo leer la caseta."); } });
    return () => { vivo = false; };
  }, [registroId, tarjeta, caso.actualizadoEn]);

  const propios = useMemo(() => reportesDelVehiculo(mios ?? [], { registroId, tarjeta }), [mios, registroId, tarjeta]);
  const resumen = useMemo(() => resumenVehiculo(propios), [propios]);
  const lecturas = useMemo(() => (eventos && tarjeta ? lecturasDe(eventos, tarjeta) : null), [eventos, tarjeta]);
  const ultimo = propios[0] ?? null;
  const vecinos = useMemo(() => (ultimo ? otrosEnLaPuerta(recientes, ultimo) : null), [recientes, ultimo]);

  if (!registroId && !tarjeta) return null;
  if (mios === null) return <p className="g-vacio">Leyendo lo que la caseta reportó de este vehículo…</p>;
  if (error) return <p className="g-vacio">{error}</p>;
  if (!propios.length) return null;

  // Lo que la pluma leyo de su TAG ese dia. La apertura con el boton no deja lectura:
  // lo que importa es si ese mismo dia el TAG si se leyo en otros pasos.
  const pluma = (r: ReporteCaseta): string => {
    if (!lecturas) return "—";
    const dia = diaDe(r.hechoEn);
    if (!dia || !diaEnVentana(dia, ventana)) return "fuera de la bitácora cargada";
    const p = plumaEseDia(lecturas, dia, r.puerta);
    if (!p.abrio && !p.rechazos) return "ninguna lectura de su TAG";
    return `abrió ${p.abrio}, rechazado ${p.rechazos}, en esa puerta ${p.enEsaPuerta}`;
  };

  const total = resumen.aperturas + resumen.reportes;
  const veces = (n: number) => `${n} ${n === 1 ? "vez" : "veces"}`;
  const rango = resumen.primero && resumen.ultimo && diaDe(resumen.primero) !== diaDe(resumen.ultimo)
    ? ` · del ${diaSemana(resumen.primero)} al ${diaSemana(resumen.ultimo)}`
    : "";

  return (
    <>
      <Bloque
        titulo={total === 1
          ? <>Una sola vez en la caseta: la de este caso</>
          : <>
              La caseta {resumen.aperturas ? <>le abrió con el botón <b>{veces(resumen.aperturas)}</b></> : null}
              {resumen.aperturas && resumen.reportes ? " y " : ""}
              {resumen.reportes ? <>lo reportó <b>{veces(resumen.reportes)}</b></> : null}
              {" "}en <b>{resumen.dias} {resumen.dias === 1 ? "día" : "días"}</b>
            </>}
        sub={`${resumen.motivos.map((m) => `${m.rotulo} ×${m.n}`).join(" · ")} · ${resumen.puertas.map((p) => `${p.titulo} ×${p.n}`).join(" · ")}${rango}`}
      >
        <Tabla
          cab={["Cuándo", "Puerta", "Motivo", "La pantalla decía", "La pluma ese día", "Caso"]}
          filas={propios.map((r) => [
            fechaHora(r.hechoEn), tituloPuerta(r.puerta), rotuloMotivo(r.clase, r.motivo), pantalla(r), pluma(r),
            r.casoNumero ? numeroCaso(r.casoNumero) : "—",
          ])}
        />
      </Bloque>
      {ultimo && vecinos && (
        <Bloque
          titulo={<>
            En {tituloPuerta(ultimo.puerta)} el {diaSemana(ultimo.hechoEn)}, la caseta abrió con el botón a{" "}
            <b>{vecinos.vehiculos === 0 ? "ningún otro vehículo" : `${vecinos.vehiculos} ${vecinos.vehiculos === 1 ? "vehículo más" : "vehículos más"}`}</b>
          </>}
          sub={vecinos.vehiculos ? "Las aperturas con el botón de esa puerta ese día, sin contar este vehículo." : "Ese día, en esa puerta, solo se le abrió con el botón a este vehículo."}
        >
          <Tabla
            cab={["Hora", "Vehículo", "Motivo", "La pantalla decía"]}
            filas={vecinos.otros.map((r) => [hora(r.hechoEn), quienDelReporte(r), rotuloMotivo(r.clase, r.motivo), pantalla(r)])}
          />
        </Bloque>
      )}
    </>
  );
}
