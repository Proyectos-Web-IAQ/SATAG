// Lo que fija este archivo: que la medicion del estacionamiento no vuelva a mezclar
// poblaciones —el punto del pico encima de la mediana de OTROS dias— ni a medir el
// dia del corte como si la jornada hubiera terminado. Los dos defectos salieron a
// pantalla el 2-oct-2026 y los dos se corrigen con la misma regla: una poblacion por
// capa, y cada cifra dice de quien es y de cuando.
import { describe, it, expect } from "vitest";
import {
  FRANJA_HASTA,
  MINUTO_CIERRE_POR_DEFECTO,
  clasificarDias,
  corteDe,
  emparejarEstancias,
  medirEstacionamiento,
  type Corte,
} from "@/lib/estacionamiento";
import type { EventoZk } from "@/lib/zk/eventos";

let n = 0;

/** Un acceso concedido, ya normalizado, como sale del parser. */
function paso(p: Partial<EventoZk> & { hora: string; dia?: string }): EventoZk {
  n += 1;
  const { hora, dia = "2026-09-22", ...resto } = p;
  return {
    idEvento: 5000 + n,
    ocurrioEn: `${dia} ${hora}`,
    lote: "E2",
    sentido: "entrada",
    tarjeta: "11797300",
    descripcion: "Apertura con verificación normal",
    concedido: true,
    departamentoEvento: "Padres de familia",
    repeticion: false,
    ...resto,
  };
}

/** Entrada y salida de una tarjeta, el mismo dia y el mismo estacionamiento. */
function estancia(tarjeta: string, entra: string, sale: string, dia = "2026-09-22", lote: "E1" | "E2" = "E2"): EventoZk[] {
  return [paso({ tarjeta, hora: entra, dia, lote }), paso({ tarjeta, hora: sale, dia, lote, sentido: "salida" })];
}

const corteA = (dia: string, minuto: number): Corte => ({ dia, minuto, exportadoEn: null, retrasoMin: null });
const rol = () => "Padres de familia";

describe("emparejarEstancias · el dia del corte no es un dia que termino", () => {
  it("quien no habia salido al corte sigue dentro: NO es una entrada sin salida", () => {
    const r = emparejarEstancias([paso({ hora: "07:30:00" })], MINUTO_CIERRE_POR_DEFECTO, corteA("2026-09-22", 8 * 60 + 19));
    expect(r.aunDentro).toBe(1);
    expect(r.entradasSinSalida).toBe(0);
    expect(r.estancias[0].censura).toBe("corte");
  });
  it("su estancia se corta en el ultimo evento, no en la hora de cierre", () => {
    const r = emparejarEstancias([paso({ hora: "07:30:00" })], MINUTO_CIERRE_POR_DEFECTO, corteA("2026-09-22", 8 * 60 + 19));
    expect(r.estancias[0].dur).toBeCloseTo(49, 5);
  });
  it("otro dia, la misma entrada sin salida SI se corta en la hora de cierre", () => {
    const r = emparejarEstancias([paso({ hora: "07:30:00" })], MINUTO_CIERRE_POR_DEFECTO, corteA("2026-09-23", 8 * 60 + 19));
    expect(r.entradasSinSalida).toBe(1);
    expect(r.aunDentro).toBe(0);
    expect(r.estancias[0].censura).toBe("derecha");
    expect(r.estancias[0].dur).toBeCloseTo(MINUTO_CIERRE_POR_DEFECTO - 450, 5);
  });
  it("un corte despues de la hora de cierre no cambia nada", () => {
    const r = emparejarEstancias([paso({ hora: "07:30:00" })], MINUTO_CIERRE_POR_DEFECTO, corteA("2026-09-22", 22 * 60));
    expect(r.entradasSinSalida).toBe(1);
    expect(r.aunDentro).toBe(0);
  });
  it("sin corte todo sigue igual que antes", () => {
    const r = emparejarEstancias([paso({ hora: "07:30:00" })]);
    expect(r.entradasSinSalida).toBe(1);
    expect(r.aunDentro).toBe(0);
  });
});

describe("corteDe · hasta donde sabe el archivo", () => {
  it("el corte es el ULTIMO EVENTO, no la hora del nombre del archivo", () => {
    const c = corteDe({ hasta: "2026-10-02 08:19:24", exportadoEn: "2026-10-02 09:26:12" });
    expect(c?.dia).toBe("2026-10-02");
    expect(c?.minuto).toBeCloseTo(8 * 60 + 19 + 24 / 60, 5);
  });
  it("y guarda cuanto iba atrasado ZK al exportar", () => {
    const c = corteDe({ hasta: "2026-10-02 08:19:24", exportadoEn: "2026-10-02 09:26:12" });
    expect(c?.retrasoMin).toBe(67);
  });
  it("sin hora de exportacion no hay retraso, pero si hay corte", () => {
    const c = corteDe({ hasta: "2026-10-02 08:19:24", exportadoEn: null });
    expect(c?.retrasoMin).toBeNull();
    expect(c?.minuto).toBeGreaterThan(0);
  });
  it("un nombre con hora anterior al ultimo evento no da un retraso negativo", () => {
    const c = corteDe({ hasta: "2026-10-02 08:19:24", exportadoEn: "2026-10-02 08:00:00" });
    expect(c?.retrasoMin).toBe(0);
  });
  it("sin fechas no hay corte", () => {
    expect(corteDe({ hasta: null, exportadoEn: "2026-10-02 09:26:12" })).toBeNull();
  });
});

describe("clasificarDias · el ultimo dia se explica por su hora", () => {
  const dias = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"];
  const ok = dias.flatMap((d) => estancia("1", "07:00:00", "08:00:00", d));
  it("dice a que hora termina el archivo cuando lo sabe", () => {
    const { excluidos } = clasificarDias(ok, dias, corteA("2026-09-24", 8 * 60 + 19));
    expect(excluidos.find((x) => x.dia === "2026-09-24")?.motivo).toContain("08:19");
  });
  it("sin corte conocido, el motivo es el de siempre", () => {
    const { excluidos } = clasificarDias(ok, dias);
    expect(excluidos.find((x) => x.dia === "2026-09-24")?.motivo).toContain("por el final");
  });
  it("si el archivo termina despues de la franja de dibujo, el ultimo dia esta completo y cuenta", () => {
    const { comparables, excluidos } = clasificarDias(ok, dias, corteA("2026-09-24", FRANJA_HASTA + 30));
    expect(comparables).toContain("2026-09-24");
    expect(excluidos.map((x) => x.dia)).not.toContain("2026-09-24");
  });
});

describe("medirEstacionamiento · el punto del pico va sobre SU dia", () => {
  // Cuatro dias tranquilos y, el 22, treinta coches de 14:16 a 14:28. El pico es el
  // de ese dia; la mediana entre dias ni se le acerca, y el punto tiene que caer
  // sobre la escalera del 22, no sobre la mediana.
  const eventos = [
    ...estancia("a", "07:00:00", "15:00:00", "2026-09-21"),
    ...estancia("b", "07:00:00", "15:00:00", "2026-09-22"),
    ...Array.from({ length: 30 }, (_, i) => estancia(`t${i}`, "14:16:00", "14:28:00", "2026-09-22")).flat(),
    ...estancia("c", "07:00:00", "15:00:00", "2026-09-23"),
    ...estancia("d", "07:00:00", "15:00:00", "2026-09-24"),
  ];
  const m = medirEstacionamiento(eventos, rol);
  const e2 = m.ocupacion.find((o) => o.lote === "E2");
  if (!e2) throw new Error("falta E2");

  it("el maximo de la escalera del dia ES el pico rotulado", () => {
    expect(e2.pico.dentro).toBe(31);
    expect(Math.max(...e2.diaPico.map((p) => p.dentro))).toBe(e2.pico.dentro);
  });
  it("y en el minuto del pico la escalera vale exactamente el pico", () => {
    let v = 0;
    for (const p of e2.diaPico) {
      if (p.minuto > (e2.pico.minuto as number)) break;
      v = p.dentro;
    }
    expect(v).toBe(e2.pico.dentro);
  });
  it("la mediana entre dias NO es el pico: por eso eran dos poblaciones", () => {
    expect(Math.max(...e2.franjas.map((f) => f.p50))).toBeLessThan(e2.pico.dentro);
  });
  it("treinta coches de 14:16 a 14:28 no se pierden entre dos marcas de la reja", () => {
    expect(e2.pico.dentro).toBeGreaterThanOrEqual(30);
  });
  it("sin eventos no hay escalera ni corte", () => {
    const vacio = medirEstacionamiento([], rol);
    expect(vacio.ocupacion.every((o) => o.diaPico.length === 0)).toBe(true);
    expect(vacio.corte).toBeNull();
  });
});

describe("medirEstacionamiento · el corte llega a la medicion", () => {
  it("cuenta cuantos seguian dentro y los deja fuera de las medianas", () => {
    const eventos = [
      ...estancia("a", "07:00:00", "07:30:00", "2026-09-22"),
      ...estancia("b", "07:00:00", "07:30:00", "2026-09-23"),
      paso({ tarjeta: "x", hora: "07:10:00", dia: "2026-09-24" }),
      paso({ tarjeta: "y", hora: "07:20:00", dia: "2026-09-24" }),
    ];
    const m = medirEstacionamiento(eventos, rol, { corte: corteA("2026-09-24", 8 * 60) });
    expect(m.corte?.aunDentro).toBe(2);
    expect(m.entradasSinSalida).toBe(0);
    expect(m.medianaGlobalMin).toBe(30);
  });
  it("la escalera del dia del corte termina en el corte, no a la hora de cierre", () => {
    // El dia del corte es el mas lleno: dos estancias confirmadas que se traslapan,
    // mas dos coches que seguian dentro cuando el archivo termina a las 08:00. El pico
    // publicado cuenta solo las confirmadas (los «aun dentro» van en la cota, como
    // toda censura), y la escalera no puede saber nada despues de las 08:00.
    const eventos = [
      ...estancia("a", "07:00:00", "07:30:00", "2026-09-22"),
      paso({ tarjeta: "x", hora: "07:10:00", dia: "2026-09-24" }),
      paso({ tarjeta: "y", hora: "07:20:00", dia: "2026-09-24" }),
      ...estancia("z", "07:00:00", "07:40:00", "2026-09-24"),
      ...estancia("w", "07:05:00", "07:35:00", "2026-09-24"),
    ];
    const m = medirEstacionamiento(eventos, rol, { corte: corteA("2026-09-24", 8 * 60) });
    const e2 = m.ocupacion.find((o) => o.lote === "E2");
    expect(e2?.pico.dia).toBe("2026-09-24");
    expect(e2?.diaPico[e2.diaPico.length - 1].minuto).toBe(8 * 60);
  });
});

describe("lecturas puntuales para las filas de la pantalla", () => {
  const pasos = [
    { minuto: 300, dentro: 0 },
    { minuto: 420, dentro: 50 },
    { minuto: 440, dentro: 110 },
    { minuto: 457, dentro: 70 },
    { minuto: 1260, dentro: 0 },
  ];
  const franjas = [300, 315, 330].map((minuto, i) => ({ minuto, p50: [10, 40, 20][i], p25: 0, p75: 0 }));

  it("lee la escalera en un minuto: el ultimo escalon que ya empezo", async () => {
    const { dentroEn } = await import("@/lib/estacionamiento");
    expect(dentroEn(pasos, 430)).toBe(50);
    expect(dentroEn(pasos, 440)).toBe(110);
    expect(dentroEn(pasos, 299)).toBe(0);
  });

  it("mide cuanto dura por encima de un umbral, escalon por escalon", async () => {
    const { minutosPorEncima } = await import("@/lib/estacionamiento");
    expect(minutosPorEncima(pasos, 100)).toBe(17);
    expect(minutosPorEncima(pasos, 60)).toBe(17 + 803);
    expect(minutosPorEncima(pasos, 200)).toBe(0);
  });

  it("lee la mediana en la franja mas cercana y encuentra su pico en un rango", async () => {
    const { medianaEn, picoDeLaMediana, minutosTipicosPorEncima } = await import("@/lib/estacionamiento");
    expect(medianaEn(franjas, 318)).toBe(40);
    expect(picoDeLaMediana(franjas, 300, 330)?.minuto).toBe(315);
    expect(picoDeLaMediana(franjas, 320, 330)?.minuto).toBe(330);
    expect(picoDeLaMediana([], 0, 9)).toBeNull();
    expect(minutosTipicosPorEncima(franjas, 15)).toBe(30);
  });
});
