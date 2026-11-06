"use client";

// Datos › Archivos de ZK: la calle (bloque 107). Los trayectos-AAAA-MM-DD.csv del
// muestreador de Análisis Vial, uno o varios a la vez. Recargar un día no duplica nada.

import { useState } from "react";
import { leerTrayectos } from "@/lib/vial/trayectos";
import { cargarMuestrasVial } from "@/lib/supabase/apiVial";

const n = (x: number) => x.toLocaleString("es-MX");

export default function CargaVial({ email, onAviso }: { email: string | null; onAviso: (texto: string) => void }) {
  const [procesando, setProcesando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function procesar(archivos: File[]) {
    setError(null);
    const hechas: string[] = [];
    try {
      for (const a of archivos) {
        setProcesando(`Leyendo ${a.name}…`);
        const l = await leerTrayectos(a);
        const r = await cargarMuestrasVial(l.muestras, email, (h, t) => setProcesando(`${a.name}: ${n(h)} de ${n(t)} muestras`));
        hechas.push(`${a.name}: ${n(r.insertadas)} muestras nuevas${r.yaEstaban ? `, ${n(r.yaEstaban)} ya estaban` : ""}${l.conError ? ` (${n(l.conError)} con error, no entran)` : ""}`);
      }
      onAviso(`La calle quedó guardada. ${hechas.join("; ")}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (hechas.length) onAviso(`Se guardó: ${hechas.join("; ")}.`);
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div className="field">
      <label htmlFor="carga-vial">La calle: archivos del muestreador de Análisis Vial</label>
      <input
        id="carga-vial"
        type="file"
        accept=".csv"
        multiple
        disabled={procesando !== null}
        onChange={(ev) => {
          const fs = [...(ev.target.files ?? [])];
          ev.target.value = "";
          if (fs.length) procesar(fs);
        }}
      />
      <p className="ti-hint" style={{ margin: "4px 0 0" }}>
        Elija los «trayectos-AAAA-MM-DD.csv» de la carpeta «datos» de Análisis Vial, de los días que falten. Volver a subir un día no duplica nada.
      </p>
      {procesando && <p className="ti-hint">{procesando}</p>}
      {error && <p className="submit-error" role="alert">{error}</p>}
    </div>
  );
}
