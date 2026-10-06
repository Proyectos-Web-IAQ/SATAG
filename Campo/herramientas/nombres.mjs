// Normalizacion y comparacion de nombres de persona entre ZK, la hoja y SATAG.
//
// LAS REGLAS SALEN DE LOS DATOS DEL 6-OCT, no de suposiciones. Comparando el nombre de
// un mismo TAG en dos fuentes (1,711 pares ZK-hoja, 598 SATAG-ZK, 493 SATAG-hoja):
//   - 94 % de los pares ZK-hoja son la misma persona escrita distinto: mayusculas,
//     acentos, apellidos primero, la hoja con el nombre corto y ZK con el completo, y
//     erratas de captura (GONZALES/GONZALEZ, VILLAREAL/VILLARREAL, CORDOVA/CORDOBA,
//     MCGREGOR/MACGREGOR).
//   - ZK usa el campo del nombre como libreta: «(ALUMNA DE PREPA)», un numero de TAG,
//     el modelo del coche. Eso se separa a `nota` y no se pierde.
//   - Lo que comparte una sola palabra, o ninguna, no es una errata: es otra persona
//     con el mismo TAG (TAG reasignado o cruzado).
//
// CRITERIOS DE GERARDO (6-oct): «uno contiene al otro» es la misma persona sin
// preguntar; los casos llamativos los valida el en GES. Una nota «(Alumno…)» en ZK
// quiere decir que el TAG es del alumno.
//
// Para COMPARAR todo va en mayusculas y sin acentos; para MOSTRAR se conserva el
// original. `node Campo/herramientas/nombres.mjs` corre las pruebas (nombres inventados).

const sinAcentos = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");

// No cuentan al comparar: «Maria DEL Pilar» y «Maria Pilar» son la misma.
const PARTICULAS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y", "E", "VDA", "VIUDA"]);

// Palabras que en ZK son nota, no nombre. Cuando aparecen fuera de un parentesis
// tambien se apartan: «MARIA DEL SOCORRO8AÑUMNP PREPA) ARMENTA».
const PALABRAS_NOTA = new Set([
  "ALUMNO", "ALUMNA", "ALUMNOS", "ALUMN", "EXALUMNO", "EXALUMNA",
  "PREPA", "PREPARATORIA", "SEC", "SECUNDARIA", "PRIM", "PRIMARIA", "PREESCOLAR", "KINDER",
  "MAESTRO", "MAESTRA", "DOCENTE", "PAPA", "MAMA", "TIA", "TIO", "ABUELO", "ABUELA", "CHOFER",
  "TAG", "BAJA", "STOCK", "TARJETA", "PVC",
]);

// Cuando el campo del nombre trae prosa («Se da tarjeta de PVC por que el tag no lee…»)
// todo es nota: se reconoce por las palabras de enlace que un nombre no lleva.
const PROSA = new Set(["SE", "POR", "QUE", "EL", "NO", "DA", "LEE", "PARA", "CON", "SU", "ES", "UN", "UNA"]);

// Abreviaturas que la gente escribe para el mismo nombre. `null` la saca de la
// comparacion: «MAFER» (Maria Fernanda) no se puede igualar palabra por palabra.
const EQUIVALE = new Map([
  ["MA", "MARIA"], ["MARI", "MARIA"], ["GPE", "GUADALUPE"], ["LUPITA", "GUADALUPE"],
  ["FCO", "FRANCISCO"], ["MAFER", null],
]);

// Lo que se aparta a `nota` y el rol que delata.
export function separarNota(original) {
  const notas = [];
  let s = String(original ?? "");
  const enlaces = sinAcentos(s).toUpperCase().split(/\s+/).filter((p) => PROSA.has(p)).length;
  if (enlaces >= 2) return { nombre: "", nota: s.trim(), rol: "" };
  s = s.replace(/\(([^)]*)\)?/g, (_, dentro) => (notas.push(dentro.trim()), " "));
  s = s.replace(/\)/g, " ");
  const palabras = [];
  for (const p of s.split(/\s+/).filter(Boolean)) {
    const limpia = sinAcentos(p).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (/\d/.test(p) || PALABRAS_NOTA.has(limpia)) notas.push(p);
    else palabras.push(p);
  }
  const nota = notas.join(" ").replace(/\s+/g, " ").trim();
  const N = sinAcentos(nota).toUpperCase();
  const rol = /ALUMN/.test(N) ? "alumno" : /MAESTR|DOCENTE/.test(N) ? "maestro" : "";
  return { nombre: palabras.join(" "), nota, rol };
}

// Palabras para comparar: mayusculas, sin acentos, solo letras, sin particulas,
// abreviaturas resueltas, iniciales fuera y sin la palabra repetida seguida.
export function palabras(s) {
  const out = [];
  for (let p of sinAcentos(s).toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/)) {
    if (!p || PARTICULAS.has(p)) continue;
    if (EQUIVALE.has(p)) p = EQUIVALE.get(p);
    if (!p || p.length < 2) continue;
    if (p.startsWith("MC") && p.length > 3) p = "MAC" + p.slice(2);
    if (out[out.length - 1] !== p) out.push(p);
  }
  return out;
}

// Nombres de pila que son el principio de otro nombre: no se toman como abreviatura.
const NOMBRES_PILA = new Set([
  "MARIA", "MARI", "MARIAN", "MAR", "JOSE", "JUAN", "ANA", "LUIS", "LUZ", "ROSA", "PAULA", "PAUL", "CARLOS", "CARLA",
  "MARIO", "JULIO", "JULIA", "ADRIAN", "DANIEL", "GABRIEL", "MANUEL", "ANGEL", "ANGELA", "LUCIA", "ALEX",
  "FERNANDO", "FER", "SOFIA", "ELENA", "EMILIO", "EMILIA", "MAURO", "PATRICIO", "CRISTIAN", "ANDRES", "IVAN",
  "ALMA", "EVA", "LIA", "INES", "PILAR", "MONICA", "VERONICA", "CLAUDIA", "LORENA", "SANDRA",
]);

// Clave fonetica ligera para las erratas de captura del espanol: Z/S, V/B, H muda,
// letras dobles, Y/I y CE/CI con S.
export function fonetica(p) {
  return p
    .replace(/(?<!C)H/g, "")
    .replace(/Z/g, "S")
    .replace(/V/g, "B")
    .replace(/Y/g, "I")
    .replace(/C([EI])/g, "S$1")
    .replace(/(.)\1+/g, "$1");
}

// Distancia de edicion con transposicion (JURAEZ/JUAREZ cuesta 1, no 2).
export function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

// Dos palabras son «la misma» si son iguales, si suenan igual, si con 5+ letras
// difieren en una, si con 7+ difieren en dos (SANDBAG/SANDBERG), o si una es la
// otra abreviada con 3+ letras (CARD/CARDENAS, TERE/TERESITA).
export function mismaPalabra(a, b) {
  if (a === b) return true;
  const fa = fonetica(a), fb = fonetica(b);
  if (fa === fb) return true;
  const corta = Math.min(a.length, b.length);
  const dist = distancia(fa, fb);
  // Julio/Julia, Mario/Maria, Daniel/Daniela: una letra, pero otra persona (hermanos,
  // pareja). Cambiar o agregar la A/O final NO es errata.
  const raizGenero = (p) => p.replace(/[AO]$/, "");
  if (raizGenero(a) === raizGenero(b)) return false;
  if (corta >= 5 && dist <= 1) return true;
  if (corta >= 7 && dist <= 2) return true;
  const [x, y] = a.length <= b.length ? [a, b] : [b, a];
  // Abreviatura (CARD -> CARDENAS, TERE -> TERESITA), salvo que la corta sea un nombre
  // de pila completo: MARIA no abrevia a MARIANA (6-oct: junto a tres senoras distintas).
  return x.length >= 3 && !NOMBRES_PILA.has(x) && y.startsWith(x);
}

// Casi la misma palabra: dos letras de diferencia en palabras de 4+. No basta para
// decir «misma persona», pero si para no llamarla «otra» (LIMON/LIMA, CAON/CAYAN).
const parecida = (a, b) => Math.min(a.length, b.length) >= 4 && distancia(fonetica(a), fonetica(b)) <= 2;

// Todo junto, con particulas y sin espacios: LOPEZGOMEZ = LOPEZ GOMEZ, DELVAL = DEL VAL,
// MAC DONALD = MACDONALD.
const compacto = (s) => sinAcentos(s).toUpperCase().replace(/[^A-Z]/g, "").replace(/(.)\1+/g, "$1");

// Cuantas palabras de A encuentran pareja en B, cada una de B usada una sola vez.
function parejas(A, B) {
  const libres = [...B];
  let exactas = 0, aproximadas = 0;
  for (const a of A) {
    let i = libres.indexOf(a);
    if (i >= 0) { exactas++; libres.splice(i, 1); continue; }
    i = libres.findIndex((b) => mismaPalabra(a, b));
    if (i >= 0) { aproximadas++; libres.splice(i, 1); }
  }
  return { exactas, aproximadas };
}

// Las clases, de mas a menos parecido. Las cuatro primeras son la misma persona sin
// preguntar; la 5 la decide Gerardo; 6 y 7 son otra persona con el mismo TAG.
export const CLASES = {
  IDENTICO: "1 identico",
  ORDEN: "2 mismas palabras, otro orden",
  CONTIENE: "3 uno contiene al otro",
  ERRATA: "4 errata o abreviatura",
  REVISAR: "5 comparten 2+ palabras, difieren otras",
  UNA: "6 comparten 1 palabra",
  NADA: "7 nada en comun",
  VACIO: "0 uno vacio",
};
export const DECISION_POR_CLASE = {
  [CLASES.IDENTICO]: "misma", [CLASES.ORDEN]: "misma", [CLASES.CONTIENE]: "misma", [CLASES.ERRATA]: "misma",
  [CLASES.REVISAR]: "revisar", [CLASES.UNA]: "otra", [CLASES.NADA]: "otra", [CLASES.VACIO]: "revisar",
};

// `mismaLlave`: los dos registros ya estan unidos por otra llave (el mismo TAG). Entonces
// un nombre corto contenido en uno largo si es la misma persona; buscando SOLO por
// nombre (GES), no.
export function comparar(a, b, { mismaLlave = false } = {}) {
  const na = separarNota(a).nombre, nb = separarNota(b).nombre;
  const A = palabras(na), B = palabras(nb);
  if (!A.length || !B.length) return CLASES.VACIO;
  if (A.join(" ") === B.join(" ")) return CLASES.IDENTICO;
  const ca = compacto(na), cb = compacto(nb);
  if (ca === cb) return CLASES.ERRATA;
  // Solo para palabras pegadas o separadas: si el numero de palabras es el mismo, las
  // diferencias se miden palabra por palabra (Julio/Julia no es «casi igual»).
  if (A.length !== B.length && Math.min(ca.length, cb.length) >= 12 && distancia(ca, cb) <= 2) return CLASES.ERRATA;
  const [corto, largo] = A.length <= B.length ? [A, B] : [B, A];
  const { exactas, aproximadas } = parejas(corto, largo);
  const todas = exactas + aproximadas === corto.length;
  // Un nombre de DOS palabras («Monica Gonzalez») cabe en cualquier homonimo con mas
  // apellidos: contenerlo no prueba nada. Solo cuenta si el corto trae nombre y dos
  // apellidos (6-oct: 40 «exempleados» salieron de nombres asi).
  const debil = !mismaLlave && corto.length < 3 && largo.length > corto.length;
  if (todas && debil) return CLASES.REVISAR;
  if (todas && aproximadas === 0) return corto.length === largo.length ? CLASES.ORDEN : CLASES.CONTIENE;
  if (todas) return CLASES.ERRATA;
  if (exactas + aproximadas >= 2) return CLASES.REVISAR;
  // Con una sola palabra en comun, si las demas son casi iguales es una errata fuerte,
  // no otra persona: va a revision.
  const restoA = A.filter((p) => !B.some((q) => mismaPalabra(p, q)));
  const restoB = B.filter((q) => !A.some((p) => mismaPalabra(p, q)));
  const casi = restoA.filter((p) => restoB.some((q) => parecida(p, q))).length;
  if (exactas + aproximadas === 1 && casi >= Math.min(restoA.length, restoB.length)) return CLASES.REVISAR;
  if (exactas + aproximadas === 1) return CLASES.UNA;
  return CLASES.NADA;
}

// Para mostrar: «MARIA DEL PILAR» -> «Maria del Pilar». Las particulas en minuscula.
export function titulo(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((p, i) => (i > 0 && PARTICULAS.has(sinAcentos(p).toUpperCase()) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

// El nombre que se queda: la forma MAS COMPLETA; a igual numero de palabras, la que
// trae acentos (fue capturada con cuidado) y luego la de la fuente preferida.
// Gerardo, 6-oct: en las erratas el que estaba bien era ZK las tres veces
// (MARTINEZ GONZALEZ y no PALACIOS; AYALA BARRIOS y no RAMOS). Asi que: gana la forma
// con MAS palabras, a igualdad gana la fuente de mayor prioridad (ZK), y solo si otra
// fuente trae EXACTAMENTE las mismas letras se toma su escritura con acentos.
export function canonico(candidatos) {
  const vivos = candidatos.filter((c) => palabras(separarNota(c.nombre).nombre).length);
  if (!vivos.length) return null;
  const pal = (c) => palabras(separarNota(c.nombre).nombre);
  const acentos = (s) => (/[áéíóúñÁÉÍÓÚÑ]/.test(s) ? 1 : 0);
  vivos.sort((x, y) => pal(y).length - pal(x).length || (x.prioridad ?? 9) - (y.prioridad ?? 9));
  const g = vivos[0];
  const igual = vivos.find((c) => acentos(c.nombre) && pal(c).join(" ") === pal(g).join(" "));
  return { nombre: titulo(separarNota((igual ?? g).nombre).nombre), fuente: g.fuente };
}

// ---------------------------------------------------------------------------
// Pruebas: `node Campo/herramientas/nombres.mjs`. Nombres inventados.
// ---------------------------------------------------------------------------
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("/nombres.mjs")) {
  const casos = [
    ["ANA SOFIA PEREZ LUNA", "Ana Sofía Pérez Luna", CLASES.IDENTICO],
    ["PEREZ LUNA ANA SOFIA", "Ana Sofia Perez Luna", CLASES.ORDEN],
    ["ANA SOFIA DE LA PAZ PEREZ LUNA", "Ana Perez Luna", CLASES.CONTIENE],
    ["ANA SOFIA (ALUMNA DE PREPA) PEREZ LUNA", "Ana Sofia Perez Luna", CLASES.IDENTICO],
    ["ANA SOFIA 12345678 PEREZ LUNA", "Ana Sofia Perez Luna", CLASES.IDENTICO],
    ["ANA SOFIA PEREZ GONZALES", "Ana Sofía Pérez González", CLASES.ERRATA],
    ["LUIS VILLAREAL CORDOVA", "Luis Villarreal Cordoba", CLASES.ERRATA],
    ["ANA MCKENZIE ROJO", "Ana MacKenzie Rojo", CLASES.IDENTICO],
    ["MA. TERESA ROJO", "Maria Teresa Rojo", CLASES.IDENTICO],
    ["LUIS LUIS PEREZ ROJO", "Luis Perez Rojo", CLASES.IDENTICO],
    ["JUAN DAVID ROJO LUNA", "Juan Domingo Rojo Luna", CLASES.REVISAR],
    ["JUAN ROJO LUNA", "Pedro Sosa Luna", CLASES.UNA],
    ["JUAN ROJO LUNA", "Pedro Sosa Paz", CLASES.NADA],
    ["", "Pedro Sosa Paz", CLASES.VACIO],
    ["LUIS ANTONIO CARD ROJO", "Luis Antonio Cardenas Rojo", CLASES.ERRATA],
    ["TERESITA BAEZ LUNA", "Tere Baez Luna", CLASES.ERRATA],
    ["ALMA TERESA ROJOGÓMEZ", "Alma Teresa Rojo Gomez", CLASES.ERRATA],
    ["MARIA JOSE DELVAL", "Maria Jose del Val", CLASES.ERRATA],
    ["ANA MAC DONALD RUIZ", "Ana MacDonald Ruiz", CLASES.ERRATA],
    ["ANA LOPEZ JURAEZ", "Ana Lopez Juarez", CLASES.ERRATA],
    ["ULF MARTIN SANDBAG", "Ulf Martin Sandberg", CLASES.ERRATA],
    ["OSCAR LIMON", "Oscar Lima", CLASES.REVISAR],
    ["Se da tarjeta de PVC por que el tag no lee", "Ana Rojo", CLASES.VACIO],
    ["PAULO ROJO ALCOCER", "Manuel Rojo Alcocer", CLASES.REVISAR],
    ["Monica Rojo", "MONICA ISABEL ROJO PAZ", CLASES.REVISAR],
    ["Monica Rojo", "Rojo Monica", CLASES.ORDEN],
    ["Monica Rojo", "MONICA ISABEL ROJO PAZ", CLASES.CONTIENE, { mismaLlave: true }],
    // 6-oct: MARIA no abrevia a MARIANA, y Julio/Julia o Daniel/Daniela son otra persona.
    ["Mariana Rojo Luna", "Maria del Pilar Rojo Luna", CLASES.REVISAR],
    ["Mariana Rojo Luna", "Maria Dolores Luna Rojo", CLASES.REVISAR],
    ["Julio Rojo Luna", "Julia Rojo Luna", CLASES.REVISAR],
    ["Daniel Rojo Luna", "Daniela Rojo Luna", CLASES.REVISAR],
  ];
  let mal = 0;
  for (const [a, b, esperada, op] of casos) {
    const c = comparar(a, b, op);
    if (c !== esperada) { mal++; console.log(`FALLA  «${a}» vs «${b}»: ${c} (esperaba ${esperada})`); }
  }
  const n = separarNota("VALERIA (ALUMNA DE PREPA) ROJO");
  if (n.rol !== "alumno" || n.nombre !== "VALERIA ROJO") { mal++; console.log("FALLA separarNota", n); }
  const k = canonico([{ nombre: "ANA PEREZ LUNA", fuente: "zk", prioridad: 2 }, { nombre: "Ana Sofía Pérez Luna", fuente: "hoja", prioridad: 3 }]);
  if (k.nombre !== "Ana Sofía Pérez Luna") { mal++; console.log("FALLA canonico", k); }
  console.log(mal ? `${mal} pruebas fallaron` : `${casos.length + 2} pruebas en verde`);
  process.exitCode = mal ? 1 : 0;
}
