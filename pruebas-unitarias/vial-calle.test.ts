// La calle (bloque 107): el lector de los archivos del muestreador y el cálculo por día.
import { describe, it, expect } from "vitest";
import { parsearTrayectos, partirCsv } from "@/lib/vial/trayectos";
import { medirCalle, claseDeDia } from "@/lib/vialidad";

const CAB = "﻿timestamp_iso,fecha,hora,trayecto,duracion_s,duracion_sin_trafico_s,indice_congestion,distancia_m,estado,error,ventana_5min,trayecto_id,polyline,intervalos_json";
const fila = (fecha: string, ranura: string, id: string, dur: number, libre: number, estado = "exitoso") =>
  `${fecha}T${ranura}:00-06:00,${fecha},${ranura}:00,"Ruta, con coma",${dur},${libre},${(dur / libre).toFixed(2)},1000,${estado},,${ranura},${id},abc,"[{""startPolylinePointIndex"":0,""speed"":""NORMAL""}]"`;

describe("parsearTrayectos", () => {
  it("lee comillas con comas y comillas dobles, y deja fuera errores y rutas que no son del catálogo", () => {
    const texto = [
      CAB,
      fila("2026-11-03", "14:50", "rec_ap_bq_se_circ_in", 300, 150),
      fila("2026-11-03", "14:50", "rec_ap_bq_no_circ_in", 0, 0, "error"),
      fila("2026-11-03", "14:50", "ruta_felipe_angeles", 400, 200),
    ].join("\r\n");
    const l = parsearTrayectos(texto, "trayectos-2026-11-03.csv");
    expect(l.filas).toBe(3);
    expect(l.muestras).toEqual([{ rutaId: "rec_ap_bq_se_circ_in", fecha: "2026-11-03", ranura: "14:50", duracionS: 300, libreS: 150 }]);
    expect(l.conError).toBe(1);
    expect(l.fuera).toBe(1);
    expect(l.fechas).toEqual(["2026-11-03"]);
  });
  it("un archivo que no es del muestreador se dice con lo que le falta", () => {
    expect(() => parsearTrayectos("a,b\n1,2", "otro.csv")).toThrow(/le falta fecha/);
  });
  it("partirCsv respeta las comillas", () => {
    expect(partirCsv('a,"b,c","d""e"\n')).toEqual([["a", "b,c", 'd"e']]);
  });
});

describe("medirCalle", () => {
  // Un martes con 7 ranuras de salida: dos rutas de llegada y el control.
  const ranuras = ["13:50", "14:00", "14:10", "14:20", "14:30", "14:40", "14:50"];
  const dia = (fecha: string, factor: number) => ranuras.flatMap((r, i) => [
    { rutaId: "rec_ap_bq_se_circ_in", fecha, ranura: r, duracionS: Math.round(150 * (1 + factor * i)), libreS: 150 },
    { rutaId: "rec_ap_bq_no_circ_in", fecha, ranura: r, duracionS: 300, libreS: 300 },
    { rutaId: "rec_ctrl_norte_ini_ctrl_norte_fin", fecha, ranura: r, duracionS: 54, libreS: 60 },
    // Tramo corto: no entra al promedio de accesos.
    { rutaId: "corredor_1792181305415", fecha, ranura: r, duracionS: 200, libreS: 60 },
  ]);
  const r = medirCalle([...dia("2026-11-03", 0.5), ...dia("2026-11-02", 0), ...dia("2026-11-07", 0).slice(0, 8)]);

  it("clasifica el día: con clases, testigo o fin de semana", () => {
    expect(claseDeDia("2026-11-03")).toBe("LJ");
    expect(claseDeDia("2026-11-02")).toBe("testigo");
    expect(claseDeDia("2026-11-06")).toBe("V");
    expect(claseDeDia("2026-11-07")).toBe("finde");
  });
  it("pico, hora del pico, minutos de más y control de un día", () => {
    const d = r.porFecha.get("2026-11-03")!;
    // En la última ranura la ruta sureste va a 4.0x y la noroeste a 1.0x: promedio 2.5x.
    expect(d.pico).toBeCloseTo(2.5);
    expect(d.horaPico).toBe(14 * 60 + 50);
    expect(d.extraPico).toBeCloseTo(3.75);
    expect(d.control).toBeCloseTo(0.9);
    expect(d.ranuras).toBe(7);
  });
  it("un día con menos de 7 rondas no cuenta", () => {
    expect(r.porFecha.has("2026-11-07")).toBe(false);
  });
  it("el testigo queda en su clase, con la calle libre", () => {
    const t = r.clases.find((c) => c.clase === "testigo")!;
    expect(t.dias.map((d) => d.fecha)).toEqual(["2026-11-02"]);
    expect(t.medio).toBeCloseTo(1);
  });
});
