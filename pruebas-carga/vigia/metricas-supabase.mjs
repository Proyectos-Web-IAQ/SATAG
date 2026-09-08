// Muestrea la CPU, memoria y conexiones REALES del Postgres de Supabase
// mientras corre una prueba de carga. Es lo que convierte "throughput" en
// "costo de CPU por peticion": costo = vCPU x utilizacion / throughput.
//
// Fuente: el endpoint de metricas Prometheus del proyecto
//   GET https://<ref>.supabase.co/customer/v1/privileged/metrics
//   Basic auth  usuario "service_role", contrasena = la llave service_role.
//
// La llave service_role NUNCA se escribe en disco ni en el repo: se pasa por
// variable de entorno solo durante la corrida.
//
//   $env:SUPABASE_SERVICE_ROLE = "<pegar>"   (PowerShell, solo esta ventana)
//   node pruebas-carga/vigia/metricas-supabase.mjs --cada=5 --salida=pruebas-carga/resultados/<fecha>-metricas.csv
//   ... correr k6 en otra ventana ...
//   Ctrl+C aqui al terminar.
//
// Escribe un CSV con una fila por muestra:
//   ts,ncpu,cpu_util,cpu_user,cpu_system,cpu_iowait,mem_total_mb,mem_avail_mb,backends,load1
// y en la primera muestra deja <salida>.familias.txt con las metricas que
// expone el proyecto (para saber que mas se puede leer).
import { writeFileSync, appendFileSync, existsSync } from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const CADA = Number(args.cada || 5) * 1000;
const SALIDA = args.salida || `pruebas-carga/resultados/${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-metricas.csv`;
const URL = process.env.SUPABASE_URL || leerEnvLocal("NEXT_PUBLIC_SUPABASE_URL");
const KEY = process.env.SUPABASE_SERVICE_ROLE;
if (!URL) { console.error("Falta SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL en .env.local)"); process.exit(2); }
if (!KEY) { console.error("Falta SUPABASE_SERVICE_ROLE en el entorno (no se lee de ningun archivo a proposito)"); process.exit(2); }

function leerEnvLocal(nombre) {
  try {
    const txt = require("node:fs").readFileSync(".env.local", "utf8");
    const m = txt.match(new RegExp(`^${nombre}=(.*)$`, "m"));
    return m ? m[1].trim() : undefined;
  } catch { return undefined; }
}

const auth = "Basic " + Buffer.from(`service_role:${KEY}`).toString("base64");

async function muestra() {
  const r = await fetch(`${URL}/customer/v1/privileged/metrics`, { headers: { Authorization: auth } });
  if (!r.ok) throw new Error(`HTTP ${r.status} al leer metricas`);
  return r.text();
}

// Parser minimo de texto Prometheus: nombre{etiquetas} valor
function parsear(txt) {
  const filas = [];
  for (const linea of txt.split("\n")) {
    if (!linea || linea.startsWith("#")) continue;
    const m = linea.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+(-?[0-9.eE+NaInf]+)/);
    if (!m) continue;
    const etiquetas = {};
    if (m[3]) for (const kv of m[3].match(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g) || []) {
      const [, k, v] = kv.match(/^([^=]+)="(.*)"$/); etiquetas[k] = v;
    }
    filas.push({ nombre: m[1], etiquetas, valor: Number(m[4]) });
  }
  return filas;
}

function resumir(filas) {
  const cpu = filas.filter((f) => f.nombre === "node_cpu_seconds_total");
  const porModo = {};
  const cpus = new Set();
  for (const f of cpu) { cpus.add(f.etiquetas.cpu); porModo[f.etiquetas.mode] = (porModo[f.etiquetas.mode] || 0) + f.valor; }
  const total = Object.values(porModo).reduce((a, b) => a + b, 0);
  const uno = (n) => filas.find((f) => f.nombre === n)?.valor;
  const suma = (n) => filas.filter((f) => f.nombre === n).reduce((a, f) => a + f.valor, 0);
  return {
    ncpu: cpus.size,
    total, porModo,
    mem_total: uno("node_memory_MemTotal_bytes"),
    mem_avail: uno("node_memory_MemAvailable_bytes"),
    backends: suma("pg_stat_database_num_backends") || suma("pg_stat_database_numbackends") || suma("pg_stat_activity_count") || undefined,
    load1: uno("node_load1"),
  };
}

let anterior = null;
let primera = true;
if (!existsSync(SALIDA)) writeFileSync(SALIDA, "ts,ncpu,cpu_util,cpu_user,cpu_system,cpu_iowait,mem_total_mb,mem_avail_mb,backends,load1\n");
console.log(`Muestreando cada ${CADA / 1000}s -> ${SALIDA}  (Ctrl+C para terminar)`);

async function tick() {
  try {
    const txt = await muestra();
    const filas = parsear(txt);
    if (primera) {
      const familias = [...new Set(filas.map((f) => f.nombre))].sort();
      writeFileSync(SALIDA.replace(/\.csv$/, "") + ".familias.txt", familias.join("\n") + "\n");
      primera = false;
    }
    const r = resumir(filas);
    if (anterior && r.ncpu > 0) {
      const dt = r.total - anterior.total; // segundos de CPU sumados en todos los nucleos
      const d = (m) => ((r.porModo[m] || 0) - (anterior.porModo[m] || 0)) / (dt || 1);
      const util = 1 - d("idle");
      const fila = [
        new Date().toISOString(), r.ncpu, util.toFixed(4), d("user").toFixed(4), d("system").toFixed(4), d("iowait").toFixed(4),
        r.mem_total ? (r.mem_total / 1048576).toFixed(0) : "", r.mem_avail ? (r.mem_avail / 1048576).toFixed(0) : "",
        r.backends ?? "", r.load1 ?? "",
      ].join(",");
      appendFileSync(SALIDA, fila + "\n");
      console.log(`${fila}`);
    } else {
      console.log(`ncpu=${r.ncpu} mem_total=${r.mem_total ? (r.mem_total / 1048576).toFixed(0) + " MB" : "?"} backends=${r.backends ?? "?"} (primera muestra, sin delta)`);
    }
    anterior = r;
  } catch (e) {
    console.error(`[${new Date().toISOString()}] ${e.message}`);
  }
}
await tick();
setInterval(tick, CADA);
