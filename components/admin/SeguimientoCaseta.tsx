"use client";

// La tarjeta de un reporte de la caseta y en que va su caso. La comparten el
// portero («Mis reportes», VistaCaseta) y Sistemas («Reportes de la caseta»,
// ReportesCaseta): Gerardo, 21-oct, «de la misma forma que lo ve caseta».
import type { ReactNode } from "react";
import { estadoSeguimiento, paredQueretaro, rotuloMotivo, tituloPuerta, type ReporteSeguimiento } from "@/lib/caseta";
import { diaSemana, fecha, hora } from "@/lib/formato";

/** «Hoy 09:12», «Ayer 18:40» o «lun 13 oct, 07:55», en hora de Queretaro; en minuscula a media frase. */
export function cuando(iso: string, enFrase = false): string {
  const d = paredQueretaro(iso).slice(0, 10);
  const hoy = paredQueretaro(new Date().toISOString()).slice(0, 10);
  const ayer = paredQueretaro(new Date(Date.now() - 86400000).toISOString()).slice(0, 10);
  const t = d === hoy ? `Hoy ${hora(iso)}` : d === ayer ? `Ayer ${hora(iso)}` : `${diaSemana(iso)}, ${hora(iso)}`;
  return enFrase ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

const PASOS = ["Recibido", "En atención", "Resuelto"] as const;
const PASO_DE: Record<"nuevo" | "curso" | "espera" | "listo", number> = { nuevo: 0, curso: 1, espera: 1, listo: 2 };

export function TarjetaReporte({ m, detalle, marcas, children }: {
  m: ReporteSeguimiento;
  /** Junto a la hora: « · otro turno», « · reportó Juan». */
  detalle?: ReactNode;
  /** Junto al estado: «Urgente», el numero de caso. */
  marcas?: ReactNode;
  /** Debajo de todo: lo que solo ve Sistemas (nota del portero, acciones). */
  children?: ReactNode;
}) {
  const s = estadoSeguimiento(m);
  const paso = PASO_DE[s.tono];
  return (
    <li className={`cs-rep cs-rep--${s.tono}`}>
      <div className="cs-rep__cab">
        <span className="cs-rep__marcas">
          <span className={`cs-pill cs-pill--${s.tono}`}>{s.tono === "listo" ? "✓ " : ""}{s.texto}</span>
          {marcas}
        </span>
        <span className="ds-nota">{cuando(m.en)}{detalle}</span>
      </div>
      <p className="cs-rep__quien">{m.quien ?? "Sin vehículo identificado"}</p>
      <p className="ds-nota">{m.clase === "apertura" ? "Abrió con el botón" : "Reporte"} · {tituloPuerta(m.puerta)} · {rotuloMotivo(m.clase, m.motivo)}</p>
      {/* Donde va el reporte, en tres pasos. «En espera» es un alto dentro de «En atención». */}
      <ol className="cs-pasos" aria-label={`Estado: ${s.texto}`}>
        {PASOS.map((p, i) => (
          <li key={p} className={i < paso ? "cs-pasos__hecho" : i === paso ? `cs-pasos__ahora cs-pasos__ahora--${s.tono}` : undefined}>
            {i === 1 && s.tono === "espera" ? "En espera" : p}
          </li>
        ))}
      </ol>
      {m.cierreMotivo && (
        <p className="cs-rep__hizo"><b>Lo que hizo Sistemas:</b> {m.cierreMotivo}{m.cerradoEn ? <span className="ds-nota"> · {fecha(m.cerradoEn)}</span> : null}</p>
      )}
      {children}
    </li>
  );
}
