// Conciliacion SATAG <-> ZKBioSecurity: que dice cada fuente de cada TAG, y donde no cuadran.
//
// POR QUE EXISTE. SATAG nacio de una migracion (hoja historica + ZK, 1-oct-2026) que ligo
// por numero de TAG y tomo como «en uso» toda tarjeta con algun evento, rechazos incluidos.
// Desde entonces TI depura ZK —bajas, cambios de departamento— y SATAG no se entera: entre
// los dos sistemas no hay conexion. Esta herramienta pone lado a lado, por TAG, lo que dice
// cada fuente y lista lo que no cuadra, cada caso con la accion que propone y quien la hace.
// No corrige nada: las correcciones a SATAG se redactan aparte y las decide Gerardo.
//
// LAS FUENTES, TODAS DEL MISMO DIA, en Campo/datos/ (fuera de git):
//   - Extracto de SATAG: Campo/herramientas/extraer-satag-para-conciliar.sql -> «Download CSV».
//   - ZK «Usuarios»: quien existe, con que tarjeta y en que departamento.
//   - ZK «Personal de Apertura» de cada puerta (Entrada 1, Salida 1, Entrada 2, Salida 2):
//     quien PUEDE abrir, incluidos los niveles puestos a mano a una sola persona. Es el
//     derecho de pluma real, no el que se supone por departamento.
//   - ZK «Todos los Eventos»: quien abrio de verdad. Se unen TODOS los archivos que haya,
//     porque cada uno trae a lo mas 40,000 filas (unos ocho dias).
//   - ZK «Última Posición Registrada»: el ultimo paso de cada persona desde que el servidor
//     guarda historia (julio de 2026). Responde «nunca abre» mas alla de la ventana.
//   - El export de Usuarios anterior, si lo hay: que cambio en ZK entre los dos.
//
// QUE CUENTA COMO USO. Solo «Apertura con verificación normal», con las rafagas del lector
// colapsadas igual que en lib/zk/eventos.ts. Un «Usuario no registrado» es lo contrario de
// uso: la pluma NO abrio. Contar rechazos como uso fue el error de la depuracion del 1-oct.
//
// UN RECHAZO NO SIEMPRE ES ALGUIEN DETENIDO. Si a 5 s o menos, en el mismo lector, otra
// tarjeta abrio, el coche paso: el rechazado es un TAG de mas en ese parabrisas (uno viejo
// del IAQ, uno de caseta, el de otro colegio). Aqui esos rechazos se separan de los de
// alguien que se presento solo y se quedo afuera.
//
// LA HORA DEL NOMBRE DEL ARCHIVO VA UNA HORA ADELANTE. ZK estampa el nombre con el reloj de
// su servidor, que el 29-sep, el 2-oct y el 5-oct marco exactamente +1:00 contra la hora
// en que el archivo se guardo. Los eventos traen la hora local. Aqui la marca solo sirve
// para ordenar archivos, nunca para medir.
//
// NO IMPRIME UN SOLO DATO PERSONAL. A consola salen conteos. Los listados —con folio, TAG,
// ID de ZK y, donde hace falta para trabajar, nombre y placa— se escriben en
// Campo/datos/conciliacion-AAAA-MM-DD/, que esta en .gitignore.
//
//   node Campo/herramientas/conciliar.mjs [--datos Campo/datos/AAAA-MM-DD] [--satag archivo.csv] [--seguir TAG,TAG,...]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const RAIZ = process.cwd();
// `--datos Campo/datos/2026-10-06` lee las fotos de una carpeta por dia (6-oct);
// sin el, la carpeta de siempre.
const DATOS = (() => {
  const i = process.argv.indexOf("--datos");
  return i >= 0 ? path.resolve(RAIZ, process.argv[i + 1]) : path.join(RAIZ, "Campo", "datos");
})();
const requerir = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Normalizacion
// ---------------------------------------------------------------------------
// La misma regla que lib/zk/texto.ts: solo digitos y sin ceros a la izquierda.
function tag(v) {
  return String(v ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "");
}
const sinAcentos = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const normDepto = (s) => sinAcentos(s).toUpperCase().replace(/\s+/g, " ").trim();
const PARTICULAS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y", "VDA", "E"]);
function tokensNombre(s) {
  return sinAcentos(s)
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !PARTICULAS.has(t));
}
// Fraccion del nombre MAS CORTO que aparece en el otro. ZK guarda nombre y apellido
// en dos columnas y SATAG en una sola; los segundos nombres y apellidos faltan seguido
// de un lado, asi que medir contra el mas largo marcaria como distinto a casi todos.
function parecidoNombre(a, b) {
  const A = new Set(tokensNombre(a));
  const B = new Set(tokensNombre(b));
  if (A.size === 0 || B.size === 0) return null;
  let comunes = 0;
  for (const t of A) if (B.has(t)) comunes++;
  return comunes / Math.min(A.size, B.size);
}
// Una placa mexicana: 5 a 8 caracteres con letras y numeros. Asi se distingue en ZK la
// placa (que por convencion viaja en «Celular», ver Campo/01) de un telefono o una nota.
function placaDe(v) {
  const t = sinAcentos(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return t.length >= 5 && t.length <= 8 && /[A-Z]/.test(t) && /[0-9]/.test(t) ? t : "";
}
const vacio = (v) => v === undefined || v === null || v === "" || v === "null";
const lotes = (a) => (a && a.length ? [...a].sort().join("+") : "");

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------
const ARGS = (() => {
  const a = process.argv.slice(2);
  const valor = (k) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return { satag: valor("--satag"), seguir: (valor("--seguir") ?? "").split(",").map((t) => tag(t)).filter(Boolean) };
})();

// ---------------------------------------------------------------------------
// Lectura de archivos
// ---------------------------------------------------------------------------
function esBinario(b) {
  return (b[0] === 0xd0 && b[1] === 0xcf) || (b[0] === 0x50 && b[1] === 0x4b);
}
function decodificar(b) {
  if (b[0] === 0xff && b[1] === 0xfe) return b.toString("utf16le").replace(/^﻿/, "");
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.subarray(3).toString("utf8");
  return b.toString("utf8");
}
// Texto delimitado, respetando comillas SOLO al principio de un campo: el export de
// personas trae dos placas con un tabulador dentro, entre comillas, y partir a ciegas
// recorre las columnas de esa fila. Una comilla a media palabra es texto.
function partir(texto, sep) {
  const filas = [];
  let fila = [];
  let campo = "";
  let comillas = false;
  let inicio = true;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else comillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"' && inicio) {
      comillas = true;
      inicio = false;
    } else if (c === sep) {
      fila.push(campo);
      campo = "";
      inicio = true;
    } else if (c === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
      inicio = true;
    } else if (c !== "\r") {
      campo += c;
      inicio = false;
    }
  }
  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((c) => c.trim() !== ""));
}
// Filas crudas de un export de ZK: el texto es UTF-16 con tabuladores; el Excel se lee
// celda por celda (sin pasar por CSV, que entrecomilla «ID»).
function filasZk(ruta) {
  const b = fs.readFileSync(ruta);
  if (esBinario(b)) {
    const X = requerir(path.join(RAIZ, "node_modules", "xlsx"));
    const libro = X.read(b, { type: "buffer" });
    return X.utils
      .sheet_to_json(libro.Sheets[libro.SheetNames[0]], { header: 1, raw: false, defval: "" })
      .map((f) => f.map((v) => String(v ?? "")))
      .filter((f) => f.some((c) => c.trim() !== ""));
  }
  return partir(decodificar(b), "\t");
}
// Busca la fila de encabezados en las cinco primeras en vez de suponer que es la segunda.
function tablaZk(ruta, rotulos) {
  const filas = filasZk(ruta);
  for (let i = 0; i < Math.min(5, filas.length); i++) {
    const cab = filas[i].map((c) => c.trim());
    if (rotulos.every((r) => cab.includes(r))) {
      return filas.slice(i + 1).map((f) => Object.fromEntries(cab.map((k, j) => [k, String(f[j] ?? "").trim()])));
    }
  }
  throw new Error(`${path.basename(ruta)}: no trae las columnas ${rotulos.join(", ")}`);
}
function tablaCsv(ruta) {
  const filas = partir(decodificar(fs.readFileSync(ruta)), ",");
  const cab = filas.shift().map((c) => c.trim());
  return filas.map((f) => Object.fromEntries(cab.map((k, j) => [k, (f[j] ?? "").trim()])));
}

// ---------------------------------------------------------------------------
// Que archivos usar
// ---------------------------------------------------------------------------
const marcaDe = (n) => (/_(\d{14})\.[A-Za-z0-9]+$/.exec(n) ?? [])[1] ?? "";
const legible = (m) => (m ? `${m.slice(0, 4)}-${m.slice(4, 6)}-${m.slice(6, 8)} ${m.slice(8, 10)}:${m.slice(10, 12)}` : "?");
const porMarca = (a, b) => (marcaDe(a) < marcaDe(b) ? -1 : marcaDe(a) > marcaDe(b) ? 1 : 0);
// En disco el nombre puede venir en NFD («Última» con el acento aparte): se busca en NFC
// y se lee con el nombre tal como esta.
const enDisco = new Map(fs.readdirSync(DATOS).map((n) => [n.normalize("NFC"), n]));
const nombres = [...enDisco.keys()];
const ruta = (n) => path.join(DATOS, enDisco.get(n) ?? n);

const usuarios = nombres.filter((n) => /^Usuarios_\d{14}\.(csv|xls|xlsx)$/i.test(n)).sort(porMarca);
if (usuarios.length === 0) throw new Error("Falta el export de Usuarios de ZK en Campo/datos/.");
const ARCH_PERSONAS = usuarios[usuarios.length - 1];
const ARCH_ANTERIOR = usuarios.length > 1 ? usuarios[usuarios.length - 2] : null;

const PUERTAS = [
  { puerta: "Entrada 1", lote: "E1", sentido: "entrada" },
  { puerta: "Salida 1", lote: "E1", sentido: "salida" },
  { puerta: "Entrada 2", lote: "E2", sentido: "entrada" },
  { puerta: "Salida 2", lote: "E2", sentido: "salida" },
];
for (const p of PUERTAS) {
  const re = new RegExp(`^${p.puerta}\\(\\d\\) Personal de Apertura_\\d{14}\\.(csv|xls|xlsx)$`, "i");
  const hallados = nombres.filter((n) => re.test(n)).sort(porMarca);
  p.archivo = hallados.length ? hallados[hallados.length - 1] : null;
}
const ARCH_EVENTOS = nombres.filter((n) => /^Todos los Eventos_\d{14}\.(csv|xls|xlsx)$/i.test(n)).sort(porMarca);
const ultimas = nombres.filter((n) => /^Última Posición Registrada_\d{14}\.(csv|xls|xlsx)$/i.test(n)).sort(porMarca);
const ARCH_ULTIMA = ultimas.length ? ultimas[ultimas.length - 1] : null;

function buscarSatag() {
  if (ARGS.satag) return path.basename(ARGS.satag).normalize("NFC");
  const candidatos = nombres
    .filter((n) => /\.csv$/i.test(n))
    .filter((n) => decodificar(fs.readFileSync(ruta(n)).subarray(0, 200)).startsWith("folio,tarjeta,estado"))
    .map((n) => ({ n, t: fs.statSync(ruta(n)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!candidatos.length) throw new Error("Falta el extracto de SATAG (extraer-satag-para-conciliar.sql) en Campo/datos/.");
  return candidatos[0].n;
}
const ARCH_SATAG = buscarSatag();
// El dia de las fotos: el del guardado del extracto de SATAG (hora local de la PC).
const DIA_FOTO = (() => {
  const d = new Date(fs.statSync(ruta(ARCH_SATAG)).mtimeMs);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

// ---------------------------------------------------------------------------
// ZK: personas y derecho de pluma
// ---------------------------------------------------------------------------
function personasDe(archivo) {
  return tablaZk(ruta(archivo), ["ID", "Tarjeta"]).map((f) => ({
    id: f["ID"],
    tarjeta: tag(f["Tarjeta"]),
    nombre: `${f["Nombre"] ?? ""} ${f["Apellido"] ?? ""}`.replace(/\s+/g, " ").trim(),
    deptoId: f["ID de Departamento"] ?? "",
    depto: f["Nombre de Departamento"] ?? "",
    placas: [...new Set([placaDe(f["Placa Vehicular"]), placaDe(f["Celular"])].filter(Boolean))],
  }));
}
const PERSONAS = personasDe(ARCH_PERSONAS);
const ANTERIOR = ARCH_ANTERIOR ? personasDe(ARCH_ANTERIOR) : [];
const zkPorTarjeta = new Map();
const tarjetasRepetidasZk = new Set();
for (const p of PERSONAS) {
  if (!p.tarjeta) continue;
  if (zkPorTarjeta.has(p.tarjeta)) tarjetasRepetidasZk.add(p.tarjeta);
  else zkPorTarjeta.set(p.tarjeta, p);
}
const zkPorId = new Map(PERSONAS.map((p) => [p.id, p]));
const anteriorPorId = new Map(ANTERIOR.map((p) => [p.id, p]));

const puedeAbrir = { E1: { entrada: new Set(), salida: new Set() }, E2: { entrada: new Set(), salida: new Set() } };
const hayDerechos = PUERTAS.every((p) => p.archivo);
for (const p of PUERTAS) {
  if (!p.archivo) continue;
  for (const f of tablaZk(ruta(p.archivo), ["ID", "Departamento"])) puedeAbrir[p.lote][p.sentido].add(f["ID"]);
}
const idsConDerechoSinPersona = new Set(
  ["E1", "E2"].flatMap((l) => [...puedeAbrir[l].entrada, ...puedeAbrir[l].salida]).filter((id) => !zkPorId.has(id)),
);
// El derecho a un lote es poder ENTRAR y SALIR. Quien solo puede una de las dos se
// lista aparte: queda atrapado, o no puede volver a entrar.
function derechoDe(id) {
  if (!hayDerechos || !id) return null;
  return ["E1", "E2"].filter((l) => puedeAbrir[l].entrada.has(id) && puedeAbrir[l].salida.has(id));
}
function derechoAMedias(id) {
  if (!hayDerechos || !id) return [];
  return ["E1", "E2"].filter((l) => puedeAbrir[l].entrada.has(id) !== puedeAbrir[l].salida.has(id));
}

// ---------------------------------------------------------------------------
// ZK: eventos (union de todos los archivos) y ultima posicion
// ---------------------------------------------------------------------------
const DEDUP_MIN = 2; // lib/zk/eventos.ts
const loteDe = (punto, disp) =>
  /1\s*$/.test(punto) ? "E1" : /2\s*$/.test(punto) ? "E2" : /Estacionamiento\s*1/i.test(disp) ? "E1" : "E2";
const sentidoDe = (punto) => (/entrada/i.test(punto) ? "entrada" : /salida/i.test(punto) ? "salida" : null);
const fueConcedido = (d) => /normal|concedid|valid/i.test(d);
const ms = (t) => Date.parse(t.replace(" ", "T") + "Z");

// El ID de Evento es un contador POR CONTROLADOR: la llave es lote + ID + hora.
const eventosPorLlave = new Map();
const ventanasArchivo = [];
for (const archivo of ARCH_EVENTOS) {
  const filas = tablaZk(ruta(archivo), ["ID de Evento", "Tiempo", "Tarjeta"]);
  const tiempos = filas.map((f) => f["Tiempo"]).filter(Boolean).sort();
  ventanasArchivo.push({ archivo, filas: filas.length, desde: tiempos[0], hasta: tiempos[tiempos.length - 1] });
  for (const f of filas) {
    const lote = loteDe(f["Punto del Evento"] ?? "", f["Nombre de Dispositivo"] ?? "");
    const llave = `${lote}|${f["ID de Evento"]}|${f["Tiempo"]}`;
    if (eventosPorLlave.has(llave)) continue;
    eventosPorLlave.set(llave, {
      id: Number(String(f["ID de Evento"]).replace(/[^0-9]/g, "")),
      tiempo: f["Tiempo"],
      lote,
      sentido: sentidoDe(f["Punto del Evento"] ?? ""),
      tarjeta: tag(f["Tarjeta"]),
      descripcion: f["Descripción del Evento"] ?? "",
    });
  }
}
const EVENTOS = [...eventosPorLlave.values()].filter((e) => e.tiempo);
const tiemposUnion = EVENTOS.map((e) => e.tiempo).sort();
const VENTANA = { desde: tiemposUnion[0] ?? null, hasta: tiemposUnion[tiemposUnion.length - 1] ?? null };
const DIAS_CON_ACTIVIDAD = [...new Set(EVENTOS.map((e) => e.tiempo.slice(0, 10)))].sort();
// Huecos entre archivos: con un hueco, «no abrio» puede ser «no lo vimos».
const huecos = [];
{
  const v = [...ventanasArchivo].sort((a, b) => (a.desde < b.desde ? -1 : 1));
  let cubierto = null;
  for (const w of v) {
    if (cubierto && w.desde > cubierto) huecos.push(`${cubierto} -> ${w.desde}`);
    if (!cubierto || w.hasta > cubierto) cubierto = w.hasta;
  }
}

// Rafagas: misma tarjeta, mismo dia, mismo sentido, mismo lote, mismo resultado, a 2 min
// de la ultima lectura que SI conto (igual que marcarRepeticiones en lib/zk/eventos.ts).
const conTarjeta = EVENTOS.filter((e) => e.tarjeta).sort((a, b) =>
  a.tiempo < b.tiempo ? -1 : a.tiempo > b.tiempo ? 1 : a.id - b.id,
);
{
  const ultimo = new Map();
  for (const e of conTarjeta) {
    e.concedido = fueConcedido(e.descripcion);
    const llave = `${e.tarjeta}|${e.lote}|${e.sentido}|${e.concedido}`;
    const u = ultimo.get(llave);
    e.repeticion = !!u && u.tiempo.slice(0, 10) === e.tiempo.slice(0, 10) && (ms(e.tiempo) - ms(u.tiempo)) / 60000 <= DEDUP_MIN;
    if (!e.repeticion) ultimo.set(llave, e);
  }
}
const PASADAS = conTarjeta.filter((e) => !e.repeticion);

// Por lector (lote + sentido), en orden: sirve para ver quien iba junto a quien.
const porLector = new Map();
for (const e of PASADAS) {
  const k = `${e.lote}|${e.sentido}`;
  if (!porLector.has(k)) porLector.set(k, []);
  porLector.get(k).push(e);
}
for (const l of porLector.values()) for (const e of l) e.t = ms(e.tiempo);
const JUNTOS_S = 5;
// Un rechazo esta «acompanado» si otra tarjeta abrio en el mismo lector a 5 s o menos:
// ese coche paso y el rechazado es un TAG de mas.
for (const lista of porLector.values()) {
  let i0 = 0;
  for (let i = 0; i < lista.length; i++) {
    const e = lista[i];
    if (e.concedido) continue;
    while (lista[i0].t < e.t - JUNTOS_S * 1000) i0++;
    for (let j = i0; j < lista.length && lista[j].t <= e.t + JUNTOS_S * 1000; j++) {
      if (lista[j].concedido && lista[j].tarjeta !== e.tarjeta) {
        e.acompanado = true;
        break;
      }
    }
  }
}

const usoVacio = () => ({
  aperturas: 0,
  rechazos: 0,
  rechazosSolos: 0,
  dias: new Set(),
  lotes: new Set(),
  lotesRechazoSolo: new Map(),
  ultima: null,
  ultimoRechazo: null,
  rechazosSolosTrasUltima: 0,
});
const uso = new Map();
for (const e of PASADAS) {
  if (!uso.has(e.tarjeta)) uso.set(e.tarjeta, usoVacio());
  const u = uso.get(e.tarjeta);
  if (e.concedido) {
    u.aperturas++;
    u.dias.add(e.tiempo.slice(0, 10));
    u.lotes.add(e.lote);
    if (!u.ultima || e.tiempo > u.ultima) u.ultima = e.tiempo;
  } else {
    u.rechazos++;
    if (!e.acompanado) {
      u.rechazosSolos++;
      u.lotesRechazoSolo.set(e.lote, (u.lotesRechazoSolo.get(e.lote) ?? 0) + 1);
    }
    if (!u.ultimoRechazo || e.tiempo > u.ultimoRechazo) u.ultimoRechazo = e.tiempo;
  }
}
for (const e of PASADAS) {
  const u = uso.get(e.tarjeta);
  if (!e.concedido && !e.acompanado && u.ultima && e.tiempo > u.ultima) u.rechazosSolosTrasUltima++;
}
const usoDe = (t) => uso.get(t) ?? usoVacio();

// Ultima posicion: por tarjeta, el paso mas reciente que el servidor recuerda.
const ULTIMA = new Map();
if (ARCH_ULTIMA) {
  for (const f of tablaZk(ruta(ARCH_ULTIMA), ["ID", "Tarjeta", "Tiempo"])) {
    const t = tag(f["Tarjeta"]);
    if (!t) continue;
    const previo = ULTIMA.get(t);
    if (!previo || f["Tiempo"] > previo.tiempo) ULTIMA.set(t, { tiempo: f["Tiempo"], apertura: fueConcedido(f["Descripción del Evento"] ?? "") });
  }
}
const historiaDesde = [...ULTIMA.values()].map((u) => u.tiempo).sort()[0] ?? null;
const ultimoPaso = (t) => {
  const u = ULTIMA.get(t);
  return u ? `${u.tiempo}${u.apertura ? "" : " (rechazo)"}` : `ninguno desde ${historiaDesde?.slice(0, 10) ?? "?"}`;
};

// ---------------------------------------------------------------------------
// SATAG
// ---------------------------------------------------------------------------
const SATAG = tablaCsv(ruta(ARCH_SATAG)).map((r) => ({
  folio: r.folio,
  tarjeta: tag(r.tarjeta),
  estado: r.estado,
  tipo: r.tipo_usuario,
  origen: r.origen_expediente,
  nombre: vacio(r.nombre) ? "" : r.nombre,
  placa: placaDe(r.placas),
  plumas: vacio(r.plumas) ? [] : r.plumas.split("+").map((x) => x.trim()).filter(Boolean).sort(),
  tienePago: r.tiene_pago === "true",
  instalado: vacio(r.fecha_instalacion) ? "" : r.fecha_instalacion.slice(0, 10),
  alta: vacio(r.alta) ? "" : r.alta.slice(0, 10),
}));
const satagPorTarjeta = new Map();
const tarjetasRepetidasSatag = new Set();
for (const s of SATAG) {
  if (!s.tarjeta) continue;
  if (satagPorTarjeta.has(s.tarjeta)) tarjetasRepetidasSatag.add(s.tarjeta);
  else satagPorTarjeta.set(s.tarjeta, s);
}
const VIVO = new Set(["activo", "pendiente", "bloqueado"]);
const esIaq = (t) => satagPorTarjeta.has(t) || zkPorTarjeta.has(t);

// ---------------------------------------------------------------------------
// Dos tarjetas en el mismo coche. Pareja = dos tarjetas distintas en el mismo lector a 5 s
// o menos. Fuerza = en que fraccion de las pasadas de la MENOS vista aparecen juntas. Se
// mide tambien una linea base con lecturas a 26-60 s, que no son el mismo coche: lo que
// salga ahi es lo que da el puro trafico, y dice cuanto creerle a cada clase.
// ---------------------------------------------------------------------------
const pasadasDe = new Map();
for (const e of PASADAS) pasadasDe.set(e.tarjeta, (pasadasDe.get(e.tarjeta) ?? 0) + 1);
function parejas(minS, maxS) {
  const m = new Map();
  for (const lista of porLector.values()) {
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const dt = (lista[j].t - lista[i].t) / 1000;
        if (dt > maxS) break;
        if (dt < minS) continue;
        const a = lista[i].tarjeta;
        const b = lista[j].tarjeta;
        if (a === b) continue;
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (!m.has(k)) m.set(k, { veces: 0, dias: new Set(), brechas: [] });
        const p = m.get(k);
        p.veces++;
        p.dias.add(lista[i].tiempo.slice(0, 10));
        p.brechas.push(dt);
      }
    }
  }
  const fuertes = [];
  for (const [k, p] of m) {
    const [a, b] = k.split("|");
    const fuerza = p.veces / Math.min(pasadasDe.get(a), pasadasDe.get(b));
    if (p.veces >= 2 && fuerza >= 0.5 && (p.dias.size >= 2 || p.veces >= 3)) fuertes.push({ a, b, ...p, fuerza });
  }
  return fuertes;
}
const PAREJAS = parejas(0, JUNTOS_S);
const PAREJAS_AZAR = parejas(26, 60);
const clasePareja = (p) => {
  const abreA = usoDe(p.a).aperturas > 0;
  const abreB = usoDe(p.b).aperturas > 0;
  if (abreA && abreB) return "ambos-abren";
  if (!abreA && !abreB) return "ninguno-abre";
  const otro = abreA ? p.b : p.a;
  return esIaq(otro) ? "iaq-que-no-abre" : "externo";
};
const azarPorClase = new Map();
for (const p of PAREJAS_AZAR) azarPorClase.set(clasePareja(p), (azarPorClase.get(clasePareja(p)) ?? 0) + 1);
const companeros = new Map(); // tarjeta -> [{otra, clase, fuerza}]
for (const p of PAREJAS) {
  p.clase = clasePareja(p);
  for (const [x, y] of [
    [p.a, p.b],
    [p.b, p.a],
  ]) {
    if (!companeros.has(x)) companeros.set(x, []);
    companeros.get(x).push({ otra: y, clase: p.clase, fuerza: p.fuerza });
  }
}
const companerosTexto = (t) =>
  (companeros.get(t) ?? [])
    .map((c) => `${c.otra} (${c.clase}, ${Math.round(c.fuerza * 100)}%)`)
    .join("; ");
// La tarjeta que abre y con la que viaja un TAG que no abre.
const abreJuntoA = (t) => (companeros.get(t) ?? []).filter((c) => usoDe(c.otra).aperturas > 0).map((c) => c.otra);

// ---------------------------------------------------------------------------
// Reglas por departamento. Por NOMBRE normalizado: entre el 2 y el 5-oct ZK renumero sus
// departamentos (Padres de familia 7 -> 19, Alumnos 5 -> 20, STOCK SATAG 3 -> 18...).
// ---------------------------------------------------------------------------
const SIN_REGLA = new Set(["GENERAL", "BAJAS", "STOCK SATAG", "EX ALUMNOS", "FALTA DE INFORMACION"]);
const TIPO_POR_DEPTO = {
  "PADRES DE FAMILIA": ["padres", "otro"],
  OTROS: ["otro", "padres"],
  ALUMNOS: ["alumno"],
  "PRIMARIA DOCENTE": ["maestro"],
  "PREESCOLAR DOCENTES": ["maestro"],
  "SECUNDARIA DOCENTES": ["maestro"],
  "PREPARATORIA DOCENTES": ["maestro"],
  "TEX DOCENTES": ["maestro"],
  "DEPORTES EXTRAESCOLARES": ["maestro"],
  ADMON: ["admin"],
  ADMINISTRACION: ["admin"],
  MANTENIMIENTO: ["admin"],
};

// ---------------------------------------------------------------------------
// Categorias: que significa cada una, quien actua y que se propone.
// ---------------------------------------------------------------------------
const CATEGORIAS = [
  // Vigencia: el expediente vive en SATAG y ZK dice otra cosa.
  { id: "V1", clave: "activo-en-bajas-zk", que: "Expediente vivo en SATAG cuya tarjeta esta en BAJAS en ZK", quien: "Decision de Gerardo; luego SQL de datos, o TI en ZK", propuesta: "Si la baja de ZK es buena, baja en SATAG; si la persona sigue, sacarla de BAJAS en ZK." },
  { id: "V2", clave: "activo-sin-persona-zk", que: "Expediente vivo en SATAG cuya tarjeta no existe en ZK (sin contar las instalaciones del dia)", quien: "TI (revisar en ZK) y Gerardo", propuesta: "Si el TAG se borro de ZK a proposito, baja en SATAG; si no, darlo de alta en ZK." },
  { id: "V3", clave: "activo-sin-derecho-zk", que: "Expediente vivo en SATAG; en ZK existe fuera de BAJAS pero no puede abrir ninguna pluma", quien: "TI en ZK, o Gerardo si la baja es buena", propuesta: "Darle su derecho en ZK, o baja en SATAG si ya no debe entrar." },
  { id: "V4", clave: "instalado-sin-subir-a-zk", que: "Alta de SATAG cuyo TAG sigue en STOCK SATAG o no esta en ZK", quien: "TI en ZK", propuesta: "Subir a ZK el padron del dia (ojo: el archivo de SATAG usa los numeros de departamento viejos)." },
  { id: "V5", clave: "activo-tag-de-mas", que: "Expediente vivo que nunca abrio y viaja pegado a otra tarjeta que si abre (TAG viejo en el mismo coche)", quien: "Decision de Gerardo; luego SQL de datos", propuesta: "Baja del TAG viejo en SATAG (o quitarlo, si es migrado) y despegarlo del parabrisas." },
  { id: "V6", clave: "activo-rechazado", que: "Expediente vivo que fue rechazado en la ventana, NUNCA le abrio y no tiene un companero fijo que abra", quien: "Decision de Gerardo con TI", propuesta: "Si la persona sigue, darle su derecho en ZK; si no, baja (los migrados salen de SATAG, como el 1-oct)." },
  { id: "V7", clave: "activo-sin-uso", que: "Expediente vivo sin una sola lectura en la ventana", quien: "Decision de Gerardo", propuesta: "Ver la ultima posicion: sin un paso desde julio es un TAG muerto; si es alta de SATAG, preguntar a la familia si el TAG lee." },
  { id: "V8", clave: "baja-en-satag-que-abre", que: "Expediente dado de baja en SATAG cuya tarjeta sigue abriendo o con derecho en ZK", quien: "TI en ZK", propuesta: "Mover a BAJAS y quitar niveles en ZK." },
  // Rechazos de gente que ZK conoce.
  { id: "R1", clave: "abria-y-perdio-el-derecho", que: "Abrio en la ventana y hoy no tiene derecho en ninguna pluma (BAJAS, Falta de informacion, Ex alumnos...)", quien: "TI (Lidia) y Gerardo", propuesta: "Confirmar que la baja o el cambio de departamento fue a proposito; si no, devolverle el derecho." },
  { id: "R2", clave: "rechazado-en-lote-sin-derecho", que: "Se presenta solo en un estacionamiento que su derecho de hoy no incluye (2 veces o mas)", quien: "Lidia y Gerardo (politica de lote por seccion)", propuesta: "Decidir si ese lote se le da (nivel individual en ZK) o se le avisa que use el suyo." },
  // Plumas: SATAG contra el derecho real en ZK.
  { id: "P1", clave: "plumas-vacias-en-satag", que: "Expediente vivo sin pluma en SATAG; en ZK si tiene derecho", quien: "SQL de datos (Gerardo lo pega)", propuesta: "Completar las plumas de SATAG con el derecho de ZK." },
  { id: "P2", clave: "plumas-distintas", que: "Expediente vivo con plumas en SATAG distintas del derecho en ZK", quien: "Decision de Gerardo; luego SQL de datos, o TI en ZK", propuesta: "Si manda ZK (lo que la pluma hace hoy), igualar SATAG a ZK; si no, corregir ZK." },
  { id: "P3", clave: "usa-lote-sin-pluma-satag", que: "Abrio en un estacionamiento que SATAG no le da", quien: "Se resuelve con P1/P2", propuesta: "Igualar plumas a ZK; si ZK tampoco le da ese lote, el derecho cambio dentro de la ventana." },
  // Tipo de usuario contra departamento.
  { id: "T1", clave: "tipo-no-cuadra-con-depto", que: "El tipo de SATAG no corresponde al departamento de ZK", quien: "Decision de Gerardo (cual de los dos esta mal)", propuesta: "Corregir el tipo en SATAG o el departamento en ZK." },
  // Identidad.
  { id: "I1", clave: "nombre-distinto", que: "La misma tarjeta tiene en SATAG y en ZK nombres sin una palabra en comun", quien: "Administracion o TI (revisar a mano)", propuesta: "Revisar: TAG reasignado, error de captura o titular distinto (padre o madre)." },
  { id: "I2", clave: "placa-falta-en-satag", que: "SATAG no tiene placa y ZK si (en Placa Vehicular o Celular)", quien: "SQL de datos (Gerardo lo pega)", propuesta: "Completar la placa de SATAG con la de ZK, si ningun otro expediente vivo la tiene." },
  { id: "I3", clave: "placa-distinta", que: "SATAG y ZK tienen placas distintas para la misma tarjeta", quien: "Administracion o TI (revisar a mano)", propuesta: "Revisar cual es la vigente: una letra cambiada es error de captura; otra placa, cambio de coche." },
  // ZK sin expediente en SATAG.
  { id: "Z1", clave: "abre-sin-expediente", que: "Credencial que abrio en la ventana y no tiene expediente en SATAG", quien: "SQL de datos (migrar, como preve la depuracion del 1-oct)", propuesta: "Migrarla a SATAG con los datos de ZK." },
  { id: "Z2", clave: "stock-que-abre", que: "TAG de STOCK SATAG que abrio la pluma y no tiene expediente", quien: "TI y Administracion", propuesta: "Averiguar a quien se le pego: falta su expediente, o fue una prueba." },
  { id: "Z3", clave: "derecho-sin-uso-sin-expediente", que: "Persona con derecho en ZK, sin expediente en SATAG y sin un paso en la ventana", quien: "TI en ZK", propuesta: "Candidata a baja en ZK; las que no tienen un paso desde julio van primero." },
  { id: "Z4", clave: "bajas-con-derecho-zk", que: "Persona en BAJAS en ZK que todavia tiene derecho de pluma", quien: "TI en ZK", propuesta: "Quitarle los niveles de acceso." },
  { id: "Z5", clave: "derecho-a-medias", que: "Puede entrar y no salir de un lote, o al reves", quien: "TI en ZK", propuesta: "Igualar entrada y salida." },
  { id: "Z6", clave: "abrio-y-ya-no-esta-en-zk", que: "Tarjeta que abrio en la ventana y ya no existe en ZK ni en SATAG", quien: "TI", propuesta: "Persona borrada de ZK despues de abrir: confirmar que fue a proposito." },
  // Dos tarjetas en el mismo coche.
  { id: "D1", clave: "tag-viejo-en-el-coche", que: "Un TAG del IAQ que no abre viaja pegado a otro que si abre", quien: "TI y Administracion", propuesta: "Despegar el viejo y, si tiene expediente vivo, darle de baja." },
  { id: "D2", clave: "dos-tags-que-abren", que: "Dos tarjetas que abren y el lector casi siempre lee juntas", quien: "TI (revisar en sitio)", propuesta: "Si es el mismo coche, dejar una: cada pasada cuenta doble." },
  { id: "D3", clave: "tag-externo-en-el-coche", que: "Un TAG que no es del IAQ (caseta, otro colegio) viaja junto a uno del IAQ", quien: "Informativo", propuesta: "Nada que corregir: explica rechazos que no son personas detenidas." },
  { id: "D4", clave: "misma-placa-varias-tarjetas", que: "La misma placa en mas de una tarjeta viva de SATAG, o con derecho en ZK", quien: "Administracion y TI", propuesta: "Revisar si es una reposicion sin baja del TAG viejo." },
  // Cambios de ZK desde el export anterior.
  { id: "C1", clave: "cambio-depto-zk", que: "Tarjeta con expediente vivo que cambio de departamento en ZK desde el export anterior", quien: "Informativo", propuesta: "Revisar que el tipo y las plumas de SATAG sigan el cambio." },
];
const porClave = new Map(CATEGORIAS.map((c) => [c.clave, { ...c, filas: [] }]));
const marcar = (clave, fila, extra = {}) => {
  const { categorias, ...limpia } = fila;
  porClave.get(clave).filas.push({ ...limpia, ...extra });
};

// Dias en que la ventana vio actividad a partir de una fecha: una alta de ayer no se
// puede juzgar por no haber abierto.
const diasObservadosDesde = (fecha) => DIAS_CON_ACTIVIDAD.filter((d) => !fecha || d >= fecha).length;
const MIN_DIAS_PARA_JUZGAR = 3;

function filaBase(t, s, z) {
  const u = usoDe(t);
  const der = z ? derechoDe(z.id) : null;
  const ant = z ? anteriorPorId.get(z.id) : null;
  return {
    tarjeta: t,
    folio: s?.folio ?? "",
    estado_satag: s?.estado ?? "",
    tipo_satag: s?.tipo ?? "",
    origen_satag: s?.origen ?? "",
    alta_satag: s?.alta ?? "",
    instalado_satag: s?.instalado ?? "",
    pago_satag: s ? (s.tienePago ? "si" : "no") : "",
    plumas_satag: s ? lotes(s.plumas) : "",
    id_zk: z?.id ?? "",
    depto_zk: z ? z.depto : "(no esta en ZK)",
    depto_zk_anterior: ant ? ant.depto : z ? "" : anteriorPorTarjeta.get(t)?.depto ?? "",
    derecho_zk: der === null ? "" : lotes(der) || "ninguno",
    aperturas: u.aperturas,
    dias_con_apertura: u.dias.size,
    lotes_usados: lotes([...u.lotes]),
    ultima_apertura: u.ultima ?? "",
    rechazos: u.rechazos,
    rechazos_solos: u.rechazosSolos,
    ultimo_rechazo: u.ultimoRechazo ?? "",
    ultima_posicion: ULTIMA.has(t) ? ultimoPaso(t) : "",
    viaja_con: companerosTexto(t),
    nombre_satag: s?.nombre ?? "",
    nombre_zk: z?.nombre ?? "",
    parecido_nombre: s && z ? (parecidoNombre(s.nombre, z.nombre)?.toFixed(2) ?? "") : "",
    placa_satag: s?.placa ?? "",
    placas_zk: z ? z.placas.join(" ") : "",
  };
}
const anteriorPorTarjeta = new Map(ANTERIOR.map((p) => [p.tarjeta, p]));

const TABLA = [];
const universo = new Set([...satagPorTarjeta.keys(), ...zkPorTarjeta.keys(), ...uso.keys()]);
for (const t of [...universo].sort((a, b) => a.localeCompare(b, "en", { numeric: true }))) {
  const s = satagPorTarjeta.get(t);
  const z = zkPorTarjeta.get(t);
  const f = filaBase(t, s, z);
  f.categorias = [];
  const u = usoDe(t);
  const nd = z ? normDepto(z.depto) : "";
  const der = z ? derechoDe(z.id) : null;
  const cat = (clave, extra) => {
    f.categorias.push(porClave.get(clave).id);
    marcar(clave, f, extra);
  };

  if (s && VIVO.has(s.estado)) {
    // La instalacion del dia todavia no esta en ZK: el padron se sube al cierre.
    const delDia = s.origen === "satag" && (s.instalado || s.alta) >= DIA_FOTO;
    if (s.origen === "satag" && (!z || nd === "STOCK SATAG"))
      cat("instalado-sin-subir-a-zk", { nota: delDia ? "instalado hoy: normal hasta que se suba el padron del dia" : "NO es de hoy: ZK no se entero" });
    else if (!z) cat("activo-sin-persona-zk");
    else if (nd === "BAJAS") cat("activo-en-bajas-zk");
    else if (der !== null && der.length === 0 && nd !== "STOCK SATAG") cat("activo-sin-derecho-zk");

    // Desde cuando se puede juzgar el uso: un migrado ya tenia su TAG antes de la
    // ventana; una alta de SATAG, desde que se instalo (o desde el alta).
    const desde = s.origen === "satag" ? s.instalado || s.alta : null;
    if (u.aperturas === 0 && diasObservadosDesde(desde) >= MIN_DIAS_PARA_JUZGAR) {
      // Con un companero fijo que abre, es un TAG de mas en ese coche aunque alguna vez
      // se haya leido solo (el controlador tapa la segunda lectura a ~2 s).
      const extra = { ultimo_paso_conocido: ultimoPaso(t) };
      const conQuien = abreJuntoA(t);
      if (u.rechazos > 0 && conQuien.length) cat("activo-tag-de-mas", { ...extra, abre_con: conQuien.join(" ") });
      else if (u.rechazos > 0) cat("activo-rechazado", { ...extra, nota: `${u.rechazosSolos} de ${u.rechazos} rechazos sin otra tarjeta que abriera junto` });
      else cat("activo-sin-uso", extra);
    }

    if (z && der !== null && der.length > 0 && nd !== "STOCK SATAG") {
      const usaFuera = [...u.lotes].filter((l) => !der.includes(l));
      const extra = { propuesta_plumas: lotes(der), uso_fuera_del_derecho: lotes(usaFuera) };
      if (s.plumas.length === 0) cat("plumas-vacias-en-satag", extra);
      else if (lotes(s.plumas) !== lotes(der)) cat("plumas-distintas", extra);
    }
    const fuera = [...u.lotes].filter((l) => s.plumas.length > 0 && !s.plumas.includes(l));
    if (fuera.length) cat("usa-lote-sin-pluma-satag", { lotes_fuera: lotes(fuera) });

    if (z && !SIN_REGLA.has(nd)) {
      const esperados = TIPO_POR_DEPTO[nd];
      if (esperados && !esperados.includes(s.tipo)) cat("tipo-no-cuadra-con-depto", { tipo_esperado: esperados.join(" o ") });
    }
    if (z && nd !== "STOCK SATAG") {
      const p = parecidoNombre(s.nombre, z.nombre);
      if (p === 0) cat("nombre-distinto");
      if (!s.placa && z.placas.length) cat("placa-falta-en-satag", { propuesta_placa: z.placas[0] });
      else if (s.placa && z.placas.length && !z.placas.includes(s.placa)) cat("placa-distinta");
    }
    if (z && ARCH_ANTERIOR) {
      const ant = anteriorPorId.get(z.id);
      if (ant && normDepto(ant.depto) !== nd) cat("cambio-depto-zk");
    }
  } else if (s && s.estado === "baja") {
    if ((der && der.length) || u.aperturas > 0) cat("baja-en-satag-que-abre");
  } else if (!s) {
    if (z && nd === "STOCK SATAG") {
      if (u.aperturas > 0) cat("stock-que-abre");
    } else if (z && der && der.length && u.aperturas > 0) cat("abre-sin-expediente", { abre_con: abreJuntoA(t).join(" ") });
    else if (z && der && der.length && u.aperturas === 0) cat("derecho-sin-uso-sin-expediente", { ultimo_paso_conocido: ultimoPaso(t) });
    else if (!z && u.aperturas > 0) cat("abrio-y-ya-no-esta-en-zk");
  }

  // Rechazos de gente que ZK conoce: perdio el derecho, o pide un lote que no tiene.
  if (z && der !== null && u.aperturas > 0 && der.length === 0 && nd !== "STOCK SATAG")
    cat("abria-y-perdio-el-derecho", {
      rechazos_solos_despues: u.rechazosSolosTrasUltima,
      ultimo_paso_conocido: ultimoPaso(t),
      nota: !z.nombre && s?.nombre ? "ZK no tiene su nombre y SATAG si" : !z.nombre ? "sin nombre en ZK" : "",
    });
  if (z && der && der.length > 0) {
    const pide = [...u.lotesRechazoSolo.entries()].filter(([l, n]) => !der.includes(l) && n >= 2);
    if (pide.length) cat("rechazado-en-lote-sin-derecho", { lote_pedido: pide.map(([l, n]) => `${l} (${n})`).join(" ") });
  }
  if (z && nd === "BAJAS" && der && der.length) cat("bajas-con-derecho-zk");
  if (z && derechoAMedias(z.id).length) cat("derecho-a-medias", { lotes_a_medias: derechoAMedias(z.id).join("+") });
  TABLA.push(f);
}

// Parejas de tarjetas, por clase.
const descr = (t) => {
  const s = satagPorTarjeta.get(t);
  const z = zkPorTarjeta.get(t);
  const u = usoDe(t);
  return `${s ? `${s.folio} ${s.estado}` : "sin expediente"}; ${z ? z.depto : "no esta en ZK"}; ${u.aperturas} aperturas, ${u.rechazos} rechazos`;
};
for (const p of PAREJAS) {
  const abreA = usoDe(p.a).aperturas > 0;
  const [abre, otra] = abreA ? [p.a, p.b] : [p.b, p.a];
  const brechas = [...p.brechas].sort((x, y) => x - y);
  const fila = {
    tarjeta: abre,
    folio: satagPorTarjeta.get(abre)?.folio ?? "",
    detalle: descr(abre),
    tarjeta_2: otra,
    folio_2: satagPorTarjeta.get(otra)?.folio ?? "",
    detalle_2: descr(otra),
    veces_juntas: p.veces,
    dias_juntas: p.dias.size,
    fuerza: `${Math.round(p.fuerza * 100)}%`,
    brecha_mediana_s: brechas[Math.floor(brechas.length / 2)],
  };
  if (p.clase === "iaq-que-no-abre") marcar("tag-viejo-en-el-coche", fila);
  else if (p.clase === "ambos-abren") marcar("dos-tags-que-abren", fila);
  else marcar("tag-externo-en-el-coche", { ...fila, nota: p.clase === "ninguno-abre" ? "ninguna de las dos abre" : "" });
}
// Misma placa en varias tarjetas: vivas en SATAG, o con derecho en ZK.
{
  const porPlaca = new Map();
  const poner = (placa, t, donde) => {
    if (!porPlaca.has(placa)) porPlaca.set(placa, new Map());
    const m = porPlaca.get(placa);
    m.set(t, [...new Set([...(m.get(t) ?? []), donde])]);
  };
  for (const s of SATAG) if (s.placa && s.tarjeta && VIVO.has(s.estado)) poner(s.placa, s.tarjeta, "SATAG");
  for (const p of PERSONAS) {
    const d = derechoDe(p.id);
    if (d && d.length && normDepto(p.depto) !== "BAJAS") for (const pl of p.placas) poner(pl, p.tarjeta, "ZK");
  }
  for (const [placa, m] of porPlaca) {
    if (m.size < 2) continue;
    const todas = [...m.keys()];
    for (const [t, donde] of m)
      marcar("misma-placa-varias-tarjetas", {
        tarjeta: t,
        folio: satagPorTarjeta.get(t)?.folio ?? "",
        placa,
        donde: donde.join("+"),
        tarjetas_con_esa_placa: todas.join(" "),
        aperturas: usoDe(t).aperturas,
        depto_zk: zkPorTarjeta.get(t)?.depto ?? "",
      });
  }
}

// ---------------------------------------------------------------------------
// El puente SATAG -> ZK nombra departamentos por numero. ¿Siguen existiendo?
// ---------------------------------------------------------------------------
const deptosZk = new Map();
for (const p of PERSONAS) {
  if (!deptosZk.has(p.deptoId)) deptosZk.set(p.deptoId, { nombre: p.depto, personas: 0 });
  deptosZk.get(p.deptoId).personas++;
}
const puente = [];
for (const archivo of ["lib/zk/plantillaZk.ts", "lib/zk/padron.ts", "components/admin/GenteEstacionamiento.tsx"]) {
  const r = path.join(RAIZ, archivo);
  if (!fs.existsSync(r)) continue;
  const src = fs.readFileSync(r, "utf8");
  for (const m of src.matchAll(/(\w+):\s*\{\s*id:\s*"(\d+)",\s*nombre:\s*"([^"]+)"/g)) puente.push({ archivo, id: m[2], nombre: `${m[1]} -> ${m[3]}` });
  for (const m of src.matchAll(/const (DEPTO_\w+)(?:_ZK)?\s*=\s*\{\s*id:\s*"(\d+)",\s*nombre:\s*"([^"]+)"/g)) puente.push({ archivo, id: m[2], nombre: `${m[1]} -> ${m[3]}` });
  for (const m of src.matchAll(/^\s*"(\d+)":\s*"([^"]+)",?\s*$/gm)) puente.push({ archivo, id: m[1], nombre: m[2] });
  for (const m of src.matchAll(/const (DEPTO_\w+) = "(\d+)";/g)) puente.push({ archivo, id: m[2], nombre: m[1] });
}
const puenteRoto = puente.filter((p) => !deptosZk.has(p.id));
const sinGrupo = [...deptosZk.entries()].filter(([id]) => !puente.some((p) => p.archivo === "lib/zk/padron.ts" && p.id === id));

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------
const SALIDA = path.join(DATOS, `conciliacion-${DIA_FOTO}`);
fs.mkdirSync(SALIDA, { recursive: true });
function escribirCsv(nombre, filas) {
  const cols = [];
  for (const f of filas) for (const k of Object.keys(f)) if (!cols.includes(k)) cols.push(k);
  const esc = (v) => {
    const s = Array.isArray(v) ? v.join(" ") : String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const texto = [cols.join(","), ...filas.map((f) => cols.map((c) => esc(f[c])).join(","))].join("\r\n");
  // Con BOM: Excel abre los acentos bien.
  fs.writeFileSync(path.join(SALIDA, nombre), "﻿" + texto + "\r\n", "utf8");
}
for (const n of fs.readdirSync(SALIDA)) if (/\.csv$/.test(n)) fs.unlinkSync(path.join(SALIDA, n));
escribirCsv("tabla.csv", TABLA);
for (const c of porClave.values()) if (c.filas.length) escribirCsv(`${c.id}-${c.clave}.csv`, c.filas);
// Lo que cambio en ZK desde el export anterior, completo. «renumerado» = mismo
// departamento con otro numero; no cambia nada para la persona, pero si para el puente.
const cambios = [];
for (const p of PERSONAS) {
  const a = anteriorPorId.get(p.id);
  const conExp = satagPorTarjeta.has(p.tarjeta) ? "si" : "no";
  const fila = (cambio) => ({ id_zk: p.id, tarjeta: p.tarjeta, cambio, depto_antes: a ? `${a.deptoId} ${a.depto}` : "", depto_ahora: `${p.deptoId} ${p.depto}`, con_expediente: conExp });
  if (ARCH_ANTERIOR && !a) cambios.push(fila("alta"));
  else if (a && a.tarjeta !== p.tarjeta) cambios.push(fila(`tarjeta (antes ${a.tarjeta})`));
  else if (a && normDepto(a.depto) !== normDepto(p.depto)) cambios.push(fila("departamento"));
  else if (a && a.deptoId !== p.deptoId) cambios.push(fila("renumerado"));
}
for (const a of ANTERIOR) {
  if (!zkPorId.has(a.id))
    cambios.push({ id_zk: a.id, tarjeta: a.tarjeta, cambio: "borrada", depto_antes: `${a.deptoId} ${a.depto}`, depto_ahora: "", con_expediente: satagPorTarjeta.has(a.tarjeta) ? "si" : "no" });
}
if (ARCH_ANTERIOR) escribirCsv("cambios-en-zk.csv", cambios);
if (ARGS.seguir.length) {
  escribirCsv(
    "seguimiento.csv",
    ARGS.seguir.map((t) => TABLA.find((f) => f.tarjeta === t) ?? { tarjeta: t, depto_zk: "no aparece en ninguna fuente" }),
  );
}

// Resumen: solo conteos.
const L = [];
const cuenta = (arr, fn) => {
  const m = new Map();
  for (const x of arr) m.set(fn(x), (m.get(fn(x)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
L.push(`CONCILIACION SATAG <-> ZK · fotos del ${DIA_FOTO}`);
L.push("");
L.push("FUENTES");
L.push(`  SATAG:        ${ARCH_SATAG} (${SATAG.length} expedientes)`);
L.push(`  ZK personas:  ${ARCH_PERSONAS} (${PERSONAS.length})${ARCH_ANTERIOR ? `; anterior ${ARCH_ANTERIOR} (${ANTERIOR.length})` : ""}`);
L.push(
  `  ZK derechos:  ${hayDerechos ? PUERTAS.map((p) => `${p.puerta} ${puedeAbrir[p.lote][p.sentido].size}`).join(", ") : "FALTAN los cuatro «Personal de Apertura»: no se comparan plumas"}${idsConDerechoSinPersona.size ? `; ${idsConDerechoSinPersona.size} IDs con derecho que no estan en Personas` : ""}`,
);
L.push(
  `  ZK eventos:   ${ARCH_EVENTOS.length} archivos, ${EVENTOS.length} filas sin repetir; ventana ${VENTANA.desde} -> ${VENTANA.hasta}; ${DIAS_CON_ACTIVIDAD.length} dias con actividad; ${huecos.length ? `HUECOS: ${huecos.join(", ")}` : "sin huecos entre archivos"}`,
);
for (const v of ventanasArchivo) L.push(`                ${v.archivo}: ${v.filas} filas, ${v.desde} -> ${v.hasta}${v.filas >= 40000 ? " (tope de 40,000)" : ""}`);
L.push(`  ZK ultima posicion: ${ARCH_ULTIMA ?? "no hay"} (${ULTIMA.size} tarjetas; historia desde ${historiaDesde ?? "?"})`);
L.push("");
L.push("SATAG");
L.push(`  por estado: ${cuenta(SATAG, (s) => s.estado).map(([k, v]) => `${k} ${v}`).join(", ")}`);
L.push(`  por origen: ${cuenta(SATAG, (s) => s.origen).map(([k, v]) => `${k} ${v}`).join(", ")}`);
L.push(`  tarjetas repetidas en SATAG: ${tarjetasRepetidasSatag.size}; en ZK: ${tarjetasRepetidasZk.size}`);
L.push("");
L.push("USO EN LA VENTANA (pasadas: aperturas y rechazos sin rafagas)");
const vivos = SATAG.filter((s) => s.tarjeta && VIVO.has(s.estado));
L.push(
  `  expedientes vivos con tarjeta: ${vivos.length}; abrieron ${vivos.filter((s) => usoDe(s.tarjeta).aperturas > 0).length}; no abrieron ${vivos.filter((s) => usoDe(s.tarjeta).aperturas === 0).length}`,
);
const usos = [...uso.values()];
L.push(`  credenciales que abrieron: ${usos.filter((u) => u.aperturas > 0).length}; que solo fueron rechazadas: ${usos.filter((u) => u.aperturas === 0 && u.rechazos > 0).length}`);
const rech = PASADAS.filter((e) => !e.concedido);
L.push(`  rechazos: ${rech.length}; de ellos pegados a la apertura de otra tarjeta (el coche paso): ${rech.filter((e) => e.acompanado).length}`);
L.push(
  `  parejas en el mismo coche: ${PAREJAS.length} (${cuenta(PAREJAS, (p) => p.clase).map(([k, v]) => `${k} ${v}`).join(", ")}); por azar, con el mismo criterio a 26-60 s: ${PAREJAS_AZAR.length} (${[...azarPorClase.entries()].map(([k, v]) => `${k} ${v}`).join(", ") || "ninguna"})`,
);
L.push("");
if (ARCH_ANTERIOR) {
  L.push(`CAMBIOS EN ZK desde el export anterior (${ARCH_ANTERIOR})`);
  L.push(`  ${cambios.length} personas: ${cuenta(cambios, (c) => c.cambio.split(" ")[0]).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  for (const [k, v] of cuenta(cambios, (c) => `${c.cambio.split(" ")[0]}: ${c.depto_antes || "(nueva)"} -> ${c.depto_ahora || "(borrada)"}`)) L.push(`    ${String(v).padStart(4)}  ${k}`);
  L.push(`  de ellas con expediente en SATAG: ${cambios.filter((c) => c.con_expediente === "si").length} (sin contar renumeradas: ${cambios.filter((c) => c.con_expediente === "si" && c.cambio !== "renumerado").length})`);
  L.push("");
}
L.push("DEPARTAMENTOS DE ZK HOY (id, nombre, personas, derecho de pluma)");
for (const [id, d] of [...deptosZk.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
  const der = cuenta(PERSONAS.filter((p) => p.deptoId === id), (p) => lotes(derechoDe(p.id) ?? []) || "ninguno")
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
  L.push(`    ${id.padStart(3)}  ${d.nombre} (${d.personas}): ${der}`);
}
L.push("");
L.push("EL PUENTE SATAG -> ZK (departamentos que el codigo nombra por numero)");
if (!puenteRoto.length) L.push("  Todos existen en ZK.");
for (const p of puenteRoto) L.push(`  YA NO TIENE A NADIE en ZK: ${p.archivo} usa ${p.id} (${p.nombre})`);
if (sinGrupo.length) L.push(`  Departamentos de ZK sin grupo en lib/zk/padron.ts (salen «Sin clasificar»): ${sinGrupo.map(([id, d]) => `${id} ${d.nombre}`).join(", ")}`);
L.push("");
L.push("LO QUE NO CUADRA");
for (const c of porClave.values()) {
  L.push(`  ${c.id}  ${String(c.filas.length).padStart(4)}  ${c.que}`);
  if (c.filas.length) L.push(`              Quien: ${c.quien}. Propuesta: ${c.propuesta}`);
}
const z3 = porClave.get("derecho-sin-uso-sin-expediente").filas;
if (z3.length) {
  L.push(
    `  Z3 por ultimo paso: ${cuenta(z3, (r) => (r.ultimo_paso_conocido.startsWith("ninguno") ? "ninguno desde julio" : r.ultimo_paso_conocido.slice(0, 7))).map(([k, v]) => `${k} ${v}`).join(", ")}`,
  );
  L.push(`  Z3 por departamento: ${cuenta(z3, (r) => r.depto_zk).map(([k, v]) => `${k} ${v}`).join(", ")}`);
}
L.push("");
L.push(`Listados en ${path.relative(RAIZ, SALIDA)}${path.sep} (traen nombres y placas: no salen de Campo/datos).`);
const resumen = L.join("\n");
fs.writeFileSync(path.join(SALIDA, "resumen.txt"), resumen + "\n", "utf8");
console.log(resumen);
