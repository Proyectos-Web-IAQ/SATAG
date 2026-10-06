// Lectura de las fotos de un dia: ZK (Personas, Privilegios por Puerta, Eventos,
// Ultima Posicion), la hoja historica y el extracto de SATAG.
//
// POR QUE UN MODULO APARTE. Cada analisis de septiembre leia las fuentes a su modo y
// cada uno tropezo con algo distinto: el encabezado de la hoja trae espacios al inicio
// («  No de TAG»), los .xls de ZK traen el titulo en la fila 1, los eventos vienen en
// varios archivos que se traslapan. Aqui se resuelve una vez y todos leen igual.
//
// Solo lee. No imprime datos personales.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const requerir = createRequire(path.join(RAIZ, "package.json"));
const X = requerir("xlsx");

// La misma regla que lib/zk/texto.ts: solo digitos y sin ceros a la izquierda.
export const tag = (v) => String(v ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "");

function decodificar(b) {
  if (b[0] === 0xff && b[1] === 0xfe) return b.toString("utf16le").slice(1);
  return b.toString("utf8").replace(/^﻿/, "");
}

// Filas crudas de cualquier archivo: Excel celda por celda, texto por tabulador o coma.
function filas(ruta, hoja) {
  const b = fs.readFileSync(ruta);
  const libro = /\.(xls|xlsx)$/i.test(ruta)
    ? X.read(b, { type: "buffer" })
    : X.read(decodificar(b), { type: "string" });
  const nombre = hoja ?? libro.SheetNames[0];
  if (!libro.Sheets[nombre]) throw new Error(`${path.basename(ruta)}: no tiene la pestana «${nombre}»`);
  return X.utils
    .sheet_to_json(libro.Sheets[nombre], { header: 1, raw: false, defval: "" })
    .map((f) => f.map((v) => String(v ?? "").trim()))
    .filter((f) => f.some(Boolean));
}

// Busca el encabezado en las cinco primeras filas: el que trae todas las columnas pedidas.
function tabla(ruta, columnas, hoja) {
  const F = filas(ruta, hoja);
  for (let i = 0; i < Math.min(5, F.length); i++) {
    const cab = F[i].map((c) => c.trim());
    if (columnas.every((c) => cab.includes(c))) {
      return F.slice(i + 1).map((f, j) => ({
        _fila: i + j + 2, // renglon en el archivo, contando desde 1 y con el encabezado
        ...Object.fromEntries(cab.map((k, n) => [k, f[n] ?? ""])),
      }));
    }
  }
  throw new Error(`${path.basename(ruta)}: no trae las columnas ${columnas.join(", ")}`);
}

// «12 September 2022» (como la exporta Sheets) o «12/09/2022» -> «2022-09-12»; vacio si no se entiende.
const MESES = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
export function fechaHoja(v) {
  const s = String(v ?? "").trim().toLowerCase();
  let m = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/.exec(s);
  if (m && MESES[m[2]]) return `${m[3]}-${String(MESES[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

const marca = (n) => (/_(\d{14})\.[A-Za-z0-9]+$/.exec(n) ?? [])[1] ?? "";

export function abrir(dir) {
  const DATOS = path.resolve(RAIZ, dir);
  // En disco el nombre puede venir en NFD («Última»): se busca en NFC.
  const enDisco = new Map(fs.readdirSync(DATOS).map((n) => [n.normalize("NFC"), n]));
  const ruta = (n) => path.join(DATOS, enDisco.get(n) ?? n);
  const todos = (re) => [...enDisco.keys()].filter((n) => re.test(n)).sort((a, b) => marca(a).localeCompare(marca(b)));
  const ultimo = (re, que) => {
    const t = todos(re);
    if (!t.length) throw new Error(`Falta ${que} en ${dir}`);
    return t[t.length - 1];
  };

  return {
    DATOS,
    archivos: () => [...enDisco.keys()],

    zkPersonas() {
      const n = ultimo(/^Usuarios_\d{14}\.(csv|xls|xlsx)$/i, "el export de Personas (Usuarios) de ZK");
      return tabla(ruta(n), ["ID", "Tarjeta", "Nombre de Departamento"]).map((r) => ({
        idZk: r.ID,
        tarjeta: tag(r.Tarjeta),
        nombre: r.Nombre,
        apellido: r.Apellido,
        deptoId: r["ID de Departamento"],
        depto: r["Nombre de Departamento"],
        placa: r["Placa Vehicular"],
        celular: r.Celular,
      }));
    },

    // Un archivo por puerta, por ID de persona y sin tarjeta.
    zkPrivilegios() {
      const puertas = [
        ["Entrada 1", "E1"], ["Salida 1", "E1"], ["Entrada 2", "E2"], ["Salida 2", "E2"],
      ];
      return puertas.map(([puerta, lote]) => {
        const n = ultimo(new RegExp(`^${puerta}\\(\\d\\) Personal de Apertura_\\d{14}\\.(csv|xls|xlsx)$`, "i"), `Privilegios de ${puerta}`);
        return { puerta, lote, ids: new Set(tabla(ruta(n), ["ID", "Departamento"]).map((r) => r.ID)) };
      });
    },

    // La union de todos los archivos de eventos, sin repetir (por ID de Evento).
    zkEventos() {
      const vistos = new Map();
      for (const n of todos(/^Todos los Eventos_\d{14}\.(csv|xls|xlsx)$/i)) {
        for (const r of tabla(ruta(n), ["ID de Evento", "Tiempo", "Descripción del Evento"])) {
          if (vistos.has(r["ID de Evento"])) continue;
          vistos.set(r["ID de Evento"], {
            id: r["ID de Evento"],
            tiempo: r.Tiempo,
            tarjeta: tag(r.Tarjeta),
            idZk: r.ID,
            punto: r["Punto del Evento"],
            lector: r["Nombre de Lector"],
            evento: r["Descripción del Evento"],
          });
        }
      }
      return [...vistos.values()].sort((a, b) => a.tiempo.localeCompare(b.tiempo));
    },

    zkUltimaPosicion() {
      const n = ultimo(/^Última Posición Registrada_\d{14}\.(csv|xls|xlsx)$/i, "Última Posición Registrada");
      return tabla(ruta(n), ["ID", "Tarjeta", "Tiempo"]).map((r) => ({
        idZk: r.ID, tarjeta: tag(r.Tarjeta), tiempo: r.Tiempo, punto: r["Punto del Evento"], evento: r["Descripción del Evento"],
      }));
    },

    // Solo la pestana «Registros». «Registros Reutilizados» se ignora (decision del 6-oct:
    // nadie sabe que es y no trae TAG).
    hoja() {
      const n = ultimo(/^Acceso a estacionamiento.*\.xlsx$/i, "la hoja «Acceso a estacionamiento» en .xlsx");
      return tabla(ruta(n), ["No de TAG", "Nombre de Usuario"], "Registros").map((r) => ({
        fila: r._fila,
        tarjeta: tag(r["No de TAG"]),
        nombre: r["Nombre de Usuario"],
        gestionante: r["Nombre (Gestionante)"],
        tipo: r.Usuario,
        marca: r["Vehiculo (Marca)"],
        modelo: r["Vehiculo (Modelo)"],
        color: r["Vehiculo (Color)"],
        placa: r["Vehiculo (Placas)"],
        lotes: r.Estacionamientos,
        adquisicion: r["Fecha (TAG Adquisicion)"],
        fecha: fechaHoja(r["Fecha (TAG Adquisicion)"]),
        observaciones: r.Observaciones,
      }));
    },

    // El CSV del extracto se reconoce por su encabezado, no por su nombre.
    satag() {
      const csv = [...enDisco.keys()]
        .filter((n) => /\.csv$/i.test(n))
        .filter((n) => decodificar(fs.readFileSync(ruta(n)).subarray(0, 200)).startsWith("folio,tarjeta,estado"));
      if (!csv.length) throw new Error(`Falta el extracto de SATAG en ${dir}`);
      if (csv.length > 1) throw new Error(`Hay ${csv.length} extractos de SATAG en ${dir}; deje uno.`);
      const R = tabla(ruta(csv[0]), ["folio", "tarjeta", "estado"]);
      const total = Number(R[0]?.total_filas ?? 0);
      if (total && total !== R.length) throw new Error(`El extracto de SATAG trae ${R.length} de ${total} filas: la descarga se corto.`);
      const nulo = (v) => (v === "null" ? "" : v);
      return R.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, nulo(v)]))).map((r) => ({
        ...r,
        tarjeta: tag(r.tarjeta),
        tags_anteriores: (r.tags_anteriores || "").split("+").map(tag).filter(Boolean),
      }));
    },
  };
}

// GES, el sistema escolar: la unica fuente que sabe quien sigue en el colegio.
// Se lee de los archivos que se sacan con ges-familias.sql y ges-personal.sql.
export function ges(dir) {
  const DATOS = path.resolve(RAIZ, dir);
  const leer = (n) => {
    const ruta = path.join(DATOS, n);
    if (!fs.existsSync(ruta)) throw new Error(`Falta ${n} en ${dir}`);
    const libro = X.read(fs.readFileSync(ruta), { type: "buffer" });
    return X.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { defval: "", raw: false });
  };
  return {
    // Una fila por alumno activo, con papa y mama de su familia («APELLIDOS NOMBRE»).
    familias() {
      return leer("ges-familias.xls").map((r) => ({
        familia: String(r.ID_FAMILIA).trim(),
        alumno: `${r.NOMBRE} ${r.PATERNO} ${r.MATERNO}`.replace(/\s+/g, " ").trim(),
        grupo: String(r.CODIGO_GRUPO).trim(),
        padre: String(r.PADRE ?? "").trim(),
        madre: String(r.MADRE ?? "").trim(),
      }));
    },
    // Empleados (administracion, mantenimiento, intendencia): la parte SIN «Clave» del
    // listado de personal de GES. El listado no trae estatus: «Activo» sale de exportarlo
    // dos veces, completo y con «ocultar bajas» (6-oct), y ver quien desaparece.
    empleados() {
      if (!fs.existsSync(path.join(DATOS, "ges-empleados-min.xlsx"))) return [];
      return leer("ges-empleados-min.xlsx").map((r) => ({
        nombre: String(r.Nombre).trim(),
        area: String(r.Departamento).trim(),
        cargo: String(r.Puesto).trim(),
        activo: String(r.Activo).trim() !== "no",
      }));
    },
    // Profesores (y el personal que da clase). A = activo, B = baja.
    personal() {
      return leer("ges-personal-min.xlsx").map((r) => ({
        nombre: String(r.NOMBREPROFESOR).trim(),
        activo: String(r.STATUSACTUAL).trim() === "A",
        area: String(r.DEPARTAMENTO).trim(),
        cargo: String(r.CARGO).trim(),
        baja: String(r.FECHA_BAJA).trim(),
      }));
    },
  };
}

// Escribe un .xlsx con una pestana por tabla: { "Nombre": [ {col: valor} ] }.
export function escribirXlsx(ruta, pestanas) {
  const libro = X.utils.book_new();
  for (const [nombre, R] of Object.entries(pestanas)) {
    const hoja = X.utils.json_to_sheet(R.length ? R : [{ "(vacio)": "" }]);
    const cols = Object.keys(R[0] ?? {});
    hoja["!cols"] = cols.map((c) => ({ wch: Math.min(45, Math.max(c.length, ...R.slice(0, 300).map((r) => String(r[c] ?? "").length)) + 2) }));
    hoja["!autofilter"] = { ref: hoja["!ref"] };
    X.utils.book_append_sheet(libro, hoja, nombre.slice(0, 31));
  }
  X.writeFile(libro, ruta);
}
