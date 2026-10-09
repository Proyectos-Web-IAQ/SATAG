// Leer los exports de GES (el sistema escolar) para guardarlos en SATAG (bloque 92).
//
// TRES ARCHIVOS, UNA LISTA BLANCA CADA UNO. GES solo se exporta a mano: familias,
// personal docente y empleados (administracion, mantenimiento, intendencia) salen de
// «Consulta Libre» con las consultas de lib/ges/consultas.ts. De los empleados se
// acepta tambien el listado reducido del 6-oct, armado a mano.
// El archivo se reconoce por sus columnas, y si trae CUALQUIER columna fuera de su
// lista se rechaza entero: el machote viejo de familias traia 47 columnas con
// telefonos, domicilios y CURP, y lo que no se pide no debe ni pasar por SATAG.
//
// DE LOS ALUMNOS, SOLO PREPARATORIA. Sus grupos son numericos (101, 301...). Un archivo
// que traiga el nombre o la matricula de un alumno de otro nivel tambien se rechaza:
// quiere decir que se exporto sin la consulta reducida. La base lo vuelve a exigir con
// un CHECK (ges_alumno_solo_prepa); aqui se dice antes y en palabras.
//
// UNA FILA POR PERSONA. GES trae una fila por alumno, con papa y mama repetidos en cada
// hermano. Aqui cada papa y cada mama salen una vez, con los grupos de todos sus hijos.

import { palabras } from "@/lib/personas/nombres";

export type FuenteGes = "familias" | "personal" | "empleados";
export type ClaseGes = "tutor" | "alumno" | "docente" | "empleado";

/** Lo que viaja al RPC `cargar_ges`, una fila por persona. */
export interface PersonaGes {
  /** F-<familia>-padre, F-<familia>-madre, A-<matricula>, D-<clave>, E-<numero>. */
  gesId: string;
  clase: ClaseGes;
  /** Como lo escribe GES: los tutores y el personal vienen «APELLIDOS NOMBRE». */
  nombre: string;
  familia: string;
  rol: "" | "padre" | "madre";
  grupos: string[];
  area: string;
  cargo: string;
  activo: boolean;
  /** AAAA-MM-DD, o null. */
  fechaBaja: string | null;
}

export interface LecturaGes {
  fuente: FuenteGes;
  personas: PersonaGes[];
  filasArchivo: number;
  /** Solo familias: 2026 = ciclo 2026-2027. */
  ciclo: number | null;
  /** Filas que no se pudieron usar, contadas y explicadas. Nunca con datos de la persona. */
  avisos: string[];
}

/**
 * Los formatos que se aceptan, en el orden en que se reconocen: por su columna llave.
 * Las columnas se comparan en mayusculas y sin acentos. Fuera de `requeridas` y
 * `opcionales`, cualquier columna rechaza el archivo.
 */
const FORMATOS: { fuente: FuenteGes; llave: string; requeridas: string[]; opcionales?: string[] }[] = [
  {
    fuente: "familias",
    llave: "ID_FAMILIA",
    requeridas: ["INICIAL", "ID_FAMILIA", "CODIGO_GRUPO", "PADRE", "MADRE", "MATRICULA", "PATERNO", "MATERNO", "NOMBRE"],
  },
  {
    fuente: "personal",
    llave: "CLAVEPROFESOR",
    requeridas: ["CLAVEPROFESOR", "NOMBREPROFESOR", "DEPARTAMENTO", "CARGO", "STATUSACTUAL", "FECHA_BAJA"],
  },
  // La consulta de la tabla `empleados` (9-oct). La llave es el nombre y no el numero:
  // el export viejo de profesores tambien traia NUMEMPLEADO.
  {
    fuente: "empleados",
    llave: "NOMBREEMPLEADO",
    requeridas: ["NUMEMPLEADO", "NOMBREEMPLEADO", "DEPARTAMENTO", "CARGO", "STATUSACTUAL", "FECHA_BAJA"],
  },
  // El listado reducido del 6-oct, armado a mano. Se sigue aceptando mientras se usa la consulta.
  {
    fuente: "empleados",
    llave: "NUM. EMPLEADO",
    requeridas: ["NUM. EMPLEADO", "NOMBRE", "PUESTO", "DEPARTAMENTO", "ACTIVO"],
    opcionales: ["CONTRATO", "NIVEL"],
  },
];

const columna = (s: string): string =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const limpio = (s: string | undefined): string => String(s ?? "").replace(/\s+/g, " ").trim();
const LLAVE_VALIDA = /^[0-9A-Za-z._-]+$/;

/** «31/07/2025» -> «2025-07-31». Lo que no se entienda, null. */
export function fechaGes(v: string | undefined): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(limpio(v));
  if (!m) return null;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mes < 1 || mes > 12 || d < 1 || d > 31 || a < 1900) return null;
  return `${a}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Un nombre que sirve: al menos dos palabras de verdad («.» o «NA» no lo son). */
const nombreUtil = (n: string): boolean => palabras(n).length >= 2;

/** Grupo de Preparatoria: numerico. */
export const esGrupoPrepa = (g: string): boolean => /^[0-9]+$/.test(g);

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-MX")} ${n === 1 ? uno : varios}`;

/**
 * Lee la tabla ya partida en filas (la primera con encabezados entre las cinco
 * primeras). Lanza un Error con un mensaje para la persona si el archivo no sirve.
 */
export function leerTablaGes(filas: string[][]): LecturaGes {
  // El encabezado: la primera fila (de las cinco primeras) que trae la llave de algun formato.
  let inicio = -1;
  let formato: (typeof FORMATOS)[number] | null = null;
  let cab: string[] = [];
  for (let i = 0; i < Math.min(5, filas.length) && inicio < 0; i++) {
    const c = filas[i].map(columna);
    const f = FORMATOS.find((x) => c.includes(x.llave));
    if (f) {
      formato = f;
      cab = c;
      inicio = i + 1;
    }
  }
  if (!formato) {
    throw new Error(
      "No se reconoce el archivo. Exporte desde GES con una de las consultas reducidas de esta pantalla (familias, personal docente o empleados).",
    );
  }
  const fuente = formato.fuente;

  const permitidas = new Set([...formato.requeridas, ...(formato.opcionales ?? [])]);
  const deMas = cab.filter((c) => c !== "" && !permitidas.has(c));
  if (deMas.length > 0) {
    const lista = deMas.length > 8 ? `${deMas.slice(0, 8).join(", ")} y ${deMas.length - 8} más` : deMas.join(", ");
    throw new Error(
      `El archivo trae columnas que SATAG no guarda (${lista}). No se cargó nada: vuelva a exportar con la consulta reducida que aparece en esta pantalla y borre el archivo anterior.`,
    );
  }
  const faltan = formato.requeridas.filter((c) => !cab.includes(c));
  if (faltan.length > 0) {
    throw new Error(`Al archivo le faltan columnas (${faltan.join(", ")}). Vuelva a exportar con la consulta reducida que aparece en esta pantalla.`);
  }

  const datos = filas
    .slice(inicio)
    .filter((f) => f.some((v) => limpio(v) !== ""))
    .map((f) => Object.fromEntries(cab.map((k, i) => [k, limpio(f[i])])) as Record<string, string>);

  if (fuente === "familias") return leerFamilias(datos);
  if (fuente === "personal") return leerPersonal(datos);
  return leerEmpleados(datos);
}

function leerFamilias(datos: Record<string, string>[]): LecturaGes {
  const ciclos = new Set(datos.map((r) => r.INICIAL).filter(Boolean));
  if (ciclos.size !== 1 || !/^\d{4}$/.test([...ciclos][0])) {
    throw new Error(
      ciclos.size > 1
        ? "El archivo mezcla alumnos de varios ciclos. Exporte con la consulta reducida, que trae un solo ciclo."
        : "El archivo no dice de qué ciclo es (columna INICIAL). Exporte con la consulta reducida.",
    );
  }
  const ciclo = Number([...ciclos][0]);

  // Antes de nada: ¿trae nombres de alumnos que no son de Preparatoria?
  const deMas = datos.filter((r) => !esGrupoPrepa(r.CODIGO_GRUPO) && (r.MATRICULA || r.NOMBRE || r.PATERNO || r.MATERNO)).length;
  if (deMas > 0) {
    throw new Error(
      `El archivo trae el nombre o la matrícula de ${plural(deMas, "alumno que no es", "alumnos que no son")} de Preparatoria. No se cargó nada: SATAG solo guarda a los de Preparatoria. Vuelva a exportar con la consulta reducida y borre el archivo anterior.`,
    );
  }

  const tutores = new Map<string, PersonaGes>();
  const alumnos = new Map<string, PersonaGes>();
  const familias = new Set<string>();
  let sinFamilia = 0, alumnoSinMatricula = 0, alumnoRepetido = 0;

  for (const r of datos) {
    const familia = r.ID_FAMILIA;
    const grupo = r.CODIGO_GRUPO.toUpperCase();
    if (!LLAVE_VALIDA.test(familia)) { sinFamilia++; continue; }
    familias.add(familia);

    for (const rol of ["padre", "madre"] as const) {
      const nombre = rol === "padre" ? r.PADRE : r.MADRE;
      if (!nombreUtil(nombre)) continue;
      const gesId = `F-${familia}-${rol}`;
      const t = tutores.get(gesId);
      if (t) {
        if (grupo && !t.grupos.includes(grupo)) t.grupos.push(grupo);
      } else {
        tutores.set(gesId, { gesId, clase: "tutor", nombre, familia, rol, grupos: grupo ? [grupo] : [], area: "", cargo: "", activo: true, fechaBaja: null });
      }
    }

    if (esGrupoPrepa(grupo)) {
      const nombre = [r.NOMBRE, r.PATERNO, r.MATERNO].filter(Boolean).join(" ");
      if (!LLAVE_VALIDA.test(r.MATRICULA) || !nombreUtil(nombre)) { alumnoSinMatricula++; continue; }
      const gesId = `A-${r.MATRICULA}`;
      if (alumnos.has(gesId)) { alumnoRepetido++; continue; }
      alumnos.set(gesId, { gesId, clase: "alumno", nombre, familia, rol: "", grupos: [grupo], area: "", cargo: "", activo: true, fechaBaja: null });
    }
  }

  // Se cuentan familias, no renglones: papa y mama se repiten en cada hermano.
  const unTutor = [...familias].filter((f) => !tutores.has(`F-${f}-padre`) || !tutores.has(`F-${f}-madre`)).length;
  const avisos: string[] = [];
  if (sinFamilia) avisos.push(`${plural(sinFamilia, "fila no trae", "filas no traen")} número de familia y no se usaron.`);
  if (unTutor) avisos.push(`${plural(unTutor, "familia tiene", "familias tienen")} un solo tutor registrado en GES (o ninguno).`);
  if (alumnoSinMatricula) avisos.push(`${plural(alumnoSinMatricula, "alumno de Preparatoria no trae", "alumnos de Preparatoria no traen")} matrícula o nombre y no se usaron.`);
  if (alumnoRepetido) avisos.push(`${plural(alumnoRepetido, "alumno aparece", "alumnos aparecen")} dos veces; se tomó la primera.`);

  for (const t of tutores.values()) t.grupos.sort();
  return { fuente: "familias", personas: [...tutores.values(), ...alumnos.values()], filasArchivo: datos.length, ciclo, avisos };
}

function leerPersonal(datos: Record<string, string>[]): LecturaGes {
  const personas = new Map<string, PersonaGes>();
  let sinClave = 0, repetidos = 0;
  for (const r of datos) {
    if (!LLAVE_VALIDA.test(r.CLAVEPROFESOR) || !nombreUtil(r.NOMBREPROFESOR)) { sinClave++; continue; }
    const gesId = `D-${r.CLAVEPROFESOR}`;
    if (personas.has(gesId)) { repetidos++; continue; }
    personas.set(gesId, {
      gesId, clase: "docente", nombre: r.NOMBREPROFESOR, familia: "", rol: "", grupos: [],
      area: r.DEPARTAMENTO, cargo: r.CARGO,
      activo: r.STATUSACTUAL.toUpperCase() === "A",
      fechaBaja: fechaGes(r.FECHA_BAJA),
    });
  }
  const avisos: string[] = [];
  if (sinClave) avisos.push(`${plural(sinClave, "fila no trae", "filas no traen")} clave o nombre y no se usaron.`);
  if (repetidos) avisos.push(`${plural(repetidos, "clave aparece", "claves aparecen")} dos veces; se tomó la primera.`);
  return { fuente: "personal", personas: [...personas.values()], filasArchivo: datos.length, ciclo: null, avisos };
}

function leerEmpleados(datos: Record<string, string>[]): LecturaGes {
  const personas = new Map<string, PersonaGes>();
  let sinNumero = 0, repetidos = 0;
  for (const r of datos) {
    // Dos formatos: la consulta de la tabla `empleados` y el listado reducido del 6-oct.
    const deConsulta = "NUMEMPLEADO" in r;
    const num = deConsulta ? r.NUMEMPLEADO : r["NUM. EMPLEADO"];
    const nombre = deConsulta ? r.NOMBREEMPLEADO : r.NOMBRE;
    if (!LLAVE_VALIDA.test(num) || !nombreUtil(nombre)) { sinNumero++; continue; }
    const gesId = `E-${num}`;
    if (personas.has(gesId)) { repetidos++; continue; }
    personas.set(gesId, {
      gesId, clase: "empleado", nombre, familia: "", rol: "", grupos: [],
      area: r.DEPARTAMENTO, cargo: deConsulta ? r.CARGO : r.PUESTO,
      // La consulta trae el estatus de GES (A = activo). El listado no lo trae: su
      // «Activo» sale de exportarlo dos veces (completo y con «ocultar bajas»).
      activo: deConsulta ? r.STATUSACTUAL.toUpperCase() === "A" : !["NO", "N", "0", "FALSE", "B"].includes(columna(r.ACTIVO)),
      fechaBaja: deConsulta ? fechaGes(r.FECHA_BAJA) : null,
    });
  }
  const avisos: string[] = [];
  if (sinNumero) avisos.push(`${plural(sinNumero, "fila no trae", "filas no traen")} número de empleado o nombre y no se usaron.`);
  if (repetidos) avisos.push(`${plural(repetidos, "número aparece", "números aparecen")} dos veces; se tomó la primera.`);
  return { fuente: "empleados", personas: [...personas.values()], filasArchivo: datos.length, ciclo: null, avisos };
}

/**
 * Lee el archivo tal como lo entrega el navegador: .xls de Consulta Libre (celdas de
 * texto), .xlsx del listado reducido o CSV. SheetJS se importa en diferido, como en
 * lib/zk/texto.ts, y se toma la hoja con mas filas.
 */
export async function leerArchivoGes(archivo: File): Promise<LecturaGes> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  let filas: string[][];
  try {
    const XLSX = await import("xlsx");
    const libro = XLSX.read(bytes, { type: "array", raw: true });
    const hoja = libro.SheetNames.map((n) => libro.Sheets[n])
      .filter(Boolean)
      .map((h) => ({ h, n: h["!ref"] ? XLSX.utils.decode_range(h["!ref"]).e.r + 1 : 0 }))
      .sort((a, b) => b.n - a.n)[0];
    filas = hoja ? XLSX.utils.sheet_to_json<string[]>(hoja.h, { header: 1, raw: false, defval: "" }).map((f) => f.map((v) => String(v ?? ""))) : [];
  } catch {
    throw new Error("No se pudo leer el archivo. Exporte desde GES en formato Excel y elija ese archivo.");
  }
  if (filas.length === 0) throw new Error("El archivo está vacío.");
  return leerTablaGes(filas);
}
