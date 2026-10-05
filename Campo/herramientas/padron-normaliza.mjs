// Normalizador del padron del estacionamiento (la hoja de calculo historica).
//
// POR QUE EXISTE. La pregunta de fondo —por que esta saturado el estacionamiento—
// no se responde leyendo una columna: hay que limpiar la hoja primero. Se llena a
// mano desde 2018, tiene filas vacias que el export convierte en hileras de comas,
// fechas en dos idiomas, reposiciones anotadas en prosa y la misma persona escrita
// de tres formas. Si cada analisis parsea por su cuenta, cada uno da un numero
// distinto y ninguno es defendible ante Contabilidad.
//
// Este archivo produce UNA normalizacion y todos los analisis leen de ahi.
//
// NO IMPRIME DATOS PERSONALES. A consola salen conteos. El JSON normalizado —que
// si lleva nombres y placas— se escribe en Campo/datos/padron/, fuera de git.
//
//   node Campo/herramientas/padron-normaliza.mjs
import fs from "node:fs";
import path from "node:path";

const DATOS = path.join(process.cwd(), "Campo", "datos");
const SALIDA = path.join(DATOS, "padron");

function leer(ruta) {
  const b = fs.readFileSync(ruta);
  if (b[0] === 0xff && b[1] === 0xfe) return b.toString("utf16le");
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.slice(3).toString("utf8");
  return b.toString("utf8");
}

// Partidor que respeta comillas y saltos de linea DENTRO de un campo: varias
// observaciones traen comas y alguna trae un salto. Partir por linea antes de
// partir por coma rompe esas filas y descuadra todo lo que venga despues.
function registros(texto, sep) {
  const filas = [];
  let fila = [], campo = "", comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') {
      if (comillas && texto[i + 1] === '"') { campo += '"'; i++; }
      else comillas = !comillas;
    } else if (c === sep && !comillas) { fila.push(campo); campo = ""; }
    else if ((c === "\n" || c === "\r") && !comillas) {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo); filas.push(fila); fila = []; campo = "";
    } else campo += c;
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

// Se puede apuntar a otro export sin tocar el codigo, porque la hoja se re-exporta
// seguido y hace falta comparar una version contra la anterior antes de rehacer un
// analisis entero:
//   node Campo/herramientas/padron-normaliza.mjs "<archivo.csv>" <salida.json>
const ENTRADA = process.argv[2] ?? "Registros.csv";
const NOMBRE = process.argv[3] ?? "normalizado.json";

const bruto = registros(leer(path.join(DATOS, ENTRADA)), ",");
const cab = bruto[0].map((c) => c.trim());

// Una fila cuyos campos estan TODOS vacios no es un expediente sin TAG: es una
// fila vacia de la hoja que el export escribio como una hilera de comas. Contarlas
// como expedientes fue lo que inflo el padron a 2,098.
const filas = bruto.slice(1)
  .map((f) => Object.fromEntries(cab.map((k, i) => [k, (f[i] ?? "").trim()])))
  .filter((f) => cab.some((k) => f[k] !== ""));

// --- Normalizadores ------------------------------------------------------
const tag = (v) => String(v ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "");
const placaCruda = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// «N/A», «N/A-Formato 2021», «-», «-----» y «POR CONFIRMAR» no son placas.
const NO_PLACA = /^(NA|NAFORMATO\d*|SN|SINPLACAS?|PENDIENTE|PORCONFIRMAR|)$/;
const placa = (v) => { const p = placaCruda(v); return NO_PLACA.test(p) ? "" : p; };

const sinAcentos = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const persona = (v) => sinAcentos(v).toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
};
// La hoja cambio de idioma a mitad de su vida: el export viejo dice «September» y
// el nuevo «septiembre». Y hay fechas sin espacio («19 junio2023»).
function fecha(v) {
  // El «de» opcional exige espacio detras a proposito: con \s* se comia el «de» de
  // «december» y capturaba «cember», que no esta en el diccionario. Resultado: las
  // 52 altas de diciembre del export en ingles quedaban sin fecha, y diciembre
  // aparecia con cero altas en nueve anios, que es imposible.
  const m = sinAcentos(v).toLowerCase().match(/(\d{1,2})\s*(?:de\s+)?([a-z]+)\s*(?:de\s+)?(\d{4})/);
  if (!m) return null;
  const mes = MESES[m[2]];
  if (!mes) return null;
  const dia = Number(m[1]);
  if (dia < 1 || dia > 31) return null;
  return {
    anio: Number(m[3]), mes, dia,
    iso: `${m[3]}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
    ciclo: mes >= 8 ? `${m[3]}-${Number(m[3]) + 1}` : `${Number(m[3]) - 1}-${m[3]}`,
  };
}

// La columna Estacionamientos dice a que plumas abre el TAG.
function estac(v) {
  const s = sinAcentos(v).toUpperCase().replace(/\s+/g, "");
  const e1 = /E1/.test(s), e2 = /E2/.test(s);
  if (e1 && e2) return "AMBOS";
  if (e1) return "E1";
  if (e2) return "E2";
  return "(sin dato)";
}

function rol(v) {
  const s = sinAcentos(v).toLowerCase().trim();
  if (!s) return "(sin dato)";
  if (s.startsWith("padre")) return "Padres";
  if (s.startsWith("maestro")) return "Maestro";
  if (s.startsWith("alumno")) return "Alumno";
  if (s.startsWith("admin")) return "Admin";
  return v;
}

// Las observaciones son prosa libre, y ahi esta escondida la mitad de la verdad
// del padron: que TAG sustituyo a cual, cual es de un fraccionamiento, cual se dio
// de baja. Se clasifican por senales explicitas, no por adivinanza.
const SENAL = {
  reposicion: /se\s*(coloca|cambia|pone|instala)\s*(el\s*)?tag\s*(nuevo|por)|tag\s*nuevo|cambio\s*de\s*tag|nuevos?\s*tags?\s*es|por\s*da(n|ñ)o|se\s*renovara|se\s*cambia\s*(el\s*)?(numero\s*de\s*)?tag|se\s*realiza\s*cambio|se\s*inserta\s*sobre/i,
  fallaLectura: /presenta\s*errores|no\s*lo\s*leyeron|no\s*funciono|no\s*funcion(ó|o)|no\s*(lo\s*)?reconoce|no\s*lee|no\s*alcanzaba\s*a\s*leer|angulo\s*correcto|invertido|parabrisas\s*blindado|dejo\s*de\s*funcionar|no\s*le\s*da\s*acceso|no\s*existe/i,
  externo: /condominio|fraccionamiento|residencial|residencia|tag\s*propio|tag\s*externo|tag\s*personal|su\s*casa|su\s*colonia|de\s*su\s*domicilio|tag\s*de(l)?\s*usuario|tag\s*del\s*propietario|otro\s*colegio|tag\s*de\s*su\s*/i,
  conflicto: /conflicto|choque\s*con|causa\s*choque/i,
  baja: /\bbajas?\b|se\s*da\s*de\s*baja|se\s*dan\s*de\s*baja|dado\s*de\s*baja|se\s*dio\s*de\s*baja|entrego\s*tag|quiere\s*dar\s*de\s*baja|se\s*retiro\s*tag|dar\s*de\s*baja/i,
  enLaMano: /en\s*la\s*mano/i,
  pvc: /\bpvc\b/i,
  sinPlacas: /no\s*tiene\s*placas|sin\s*placas|tramite\s*sus\s*placas|no\s*cuenta\s*con\s*placas|falta\s*(que\s*)?(notifique|confirmar)\s*(sus\s*)?placas|vehiculo\s*nuevo/i,
  disponible: /queda\s*(disponible|reserva|pendiente)|no\s*se\s*instala|tag\s*de\s*reserva/i,
  tercero: /chofer|lo\s*gestiona|hace\s*el\s*tramite|tramito|tramita/i,
  prepa: /prepa|preparatoria|secundaria/i,
  pendienteCaptura: /pendiente\s*capt|dictado/i,
  movible: /movible/i,
};

const filasNorm = filas.map((f, i) => {
  const obs = f["Observaciones"] ?? "";
  const propio = tag(f["No de TAG"]);
  // Numeros de TAG citados dentro de la observacion que NO son el de la fila: es
  // la huella de una reposicion, o de un TAG ajeno conviviendo con el del colegio.
  const citados = [...new Set((obs.match(/\d{6,}/g) ?? []).map(tag).filter((t) => t && t !== propio))];
  const senales = Object.fromEntries(Object.entries(SENAL).map(([k, re]) => [k, re.test(obs)]));
  return {
    n: i + 2,
    tag: propio,
    tagLargo: propio.length,
    nombre: f["Nombre de Usuario"] ?? "",
    personaClave: persona(f["Nombre de Usuario"]),
    gestionante: f["Nombre (Gestionante)"] ?? "",
    gestionanteClave: persona(f["Nombre (Gestionante)"]),
    marca: (f["Vehiculo (Marca)"] ?? "").trim(),
    modelo: (f["Vehiculo (Modelo)"] ?? "").trim(),
    color: (f["Vehiculo (Color)"] ?? "").trim(),
    placa: placa(f["Vehiculo (Placas)"]),
    placaCruda: (f["Vehiculo (Placas)"] ?? "").trim(),
    estacionamiento: estac(f["Estacionamientos"]),
    rol: rol(f["Usuario"]),
    fecha: fecha(f["Fecha (TAG Adquisicion)"]),
    fechaCruda: (f["Fecha (TAG Adquisicion)"] ?? "").trim(),
    obs,
    tagsCitados: citados,
    ...senales,
  };
});

fs.mkdirSync(SALIDA, { recursive: true });
fs.writeFileSync(path.join(SALIDA, NOMBRE), JSON.stringify(filasNorm, null, 1));

// --- Solo conteos a consola ---------------------------------------------
const L = (a, b) => console.log("  " + String(a).padEnd(46) + b);
console.log("\nLIMPIEZA DE LA HOJA\n");
L("lineas que trajo el export (sin cabecera)", bruto.length - 1);
L("de esas, filas completamente vacias", (bruto.length - 1) - filas.length);
L("EXPEDIENTES REALES", filas.length);
L("con numero de TAG", filasNorm.filter((f) => f.tag).length);
L("sin numero de TAG", filasNorm.filter((f) => !f.tag).length);
L("con fecha legible", filasNorm.filter((f) => f.fecha).length);
L("sin fecha legible", filasNorm.filter((f) => !f.fecha).length);
L("con placa utilizable", filasNorm.filter((f) => f.placa).length);
console.log(`\n  ${NOMBRE} escrito en Campo/datos/padron/ (fuera de git)\n`);
