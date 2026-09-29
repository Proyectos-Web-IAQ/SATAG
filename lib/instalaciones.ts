// La medicion del tablero de instalacion: de expedientes crudos a las cifras
// que se pintan.
//
// POR QUE VIVE AQUI Y NO DENTRO DE LA PANTALLA. Estaba dentro de
// PanelInstalacion.tsx, que es un componente "use client" y arrastra React y el
// cliente de Supabase; ese cliente se construye al cargar su modulo y aborta si
// faltan las variables de entorno, asi que la logica no se podia probar sin
// levantar media aplicacion. Aqui es una funcion pura sobre datos: entra un
// arreglo, sale un objeto, y las pruebas de pruebas-unitarias/ la ejercitan
// sola. La pantalla la llama y la dibuja; la aritmetica no es suya.
//
// Tambien viven aqui los tipos de las filas, y NO en el archivo de las
// graficas: la grafica depende del dominio, no al reves.
import type { InstalacionMedida } from "@/lib/mock/types";
import { mediana, personaCorta } from "@/lib/duracion";

export interface FilaDia {
  dia: string; // AAAA-MM-DD, ya en fecha de Queretaro
  tags: number;
  medibles: number;
  mediana: number | null;
}

export interface FilaPersona {
  clave: string;
  email: string | null;
  tags: number;
  medibles: number;
  mediana: number | null;
  masRapida: number | null;
  masTardada: number | null;
  // Cada duracion medible, una por instalacion. Es lo que dibuja la grafica de
  // dispersion: con seis datos, ensenar los seis es mas honesto que resumirlos.
  deltas: { folio: string; ms: number }[];
}

export interface Medicion {
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

export function medir(filas: InstalacionMedida[]): Medicion {
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
