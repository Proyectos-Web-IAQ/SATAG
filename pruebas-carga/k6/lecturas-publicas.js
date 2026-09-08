// FASE 2 - Costo por peticion de las LECTURAS PUBLICAS (rol anon).
//
// Satura, una ruta a la vez, las consultas que hace /registro/ al abrirse
// (cat_marcas, cat_colores, reglamento vigente, aviso vigente, aviso corto,
// cat_modelos por marca) y ademas el "visitante completo": las 5 lecturas
// en paralelo como las dispara el formulario real (http.batch).
//
// Solo GET: no escribe nada. Se puede correr contra el proyecto de trabajo.
//
// Parametros (variables -e de k6):
//   SUPABASE_URL, SUPABASE_KEY   obligatorias (las de .env.local)
//   VUS_MAX     tope de usuarios virtuales por escenario   (40)
//   RAMPA       segundos subiendo de 0 a VUS_MAX           (45)
//   SOSTEN      segundos sosteniendo VUS_MAX               (60)
//   BAJADA      segundos bajando a 0                       (15)
//   RUTAS       lista separada por comas para correr solo algunas
//               (marcas,colores,reglamento,aviso,aviso_corto,modelos,visitante)
//
// Lo que registra ademas de lo estandar de k6:
//   upstream_ms  el header x-envoy-upstream-service-time de Supabase: cuanto
//                tardo PostgREST+Postgres SIN la red. Si al saturar sube
//                upstream_ms, el cuello esta en Supabase; si solo sube
//                http_req_duration, el cuello esta en la red o en esta maquina.
import http from "k6/http";
import { check } from "k6";
import { Trend, Counter } from "k6/metrics";

const URL = __ENV.SUPABASE_URL;
const KEY = __ENV.SUPABASE_KEY;
if (!URL || !KEY) throw new Error("Faltan SUPABASE_URL / SUPABASE_KEY (-e)");

const VUS_MAX = Number(__ENV.VUS_MAX || 40);
const RAMPA = Number(__ENV.RAMPA || 45);
const SOSTEN = Number(__ENV.SOSTEN || 60);
const BAJADA = Number(__ENV.BAJADA || 15);
const DURACION = RAMPA + SOSTEN + BAJADA;
const PAUSA = 10; // segundos de silencio entre escenarios, para que el pool se vacie

const upstream = new Trend("upstream_ms", true);
const errores = new Counter("errores_http");

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// Las mismas consultas que lib/supabase/api.ts, tal cual las manda supabase-js.
const RUTAS = {
  marcas: `${URL}/rest/v1/cat_marcas?select=nombre&order=nombre.asc`,
  colores: `${URL}/rest/v1/cat_colores?select=nombre&order=nombre.asc`,
  reglamento: `${URL}/rest/v1/reglamento_versiones?select=id,version,contenido&vigente=eq.true&limit=1`,
  aviso: `${URL}/rest/v1/aviso_versiones?select=id,version,contenido,url_publica&vigente=eq.true&limit=1`,
  aviso_corto: `${URL}/rest/v1/aviso_versiones?select=contenido_simplificado&vigente=eq.true&limit=1`,
  modelos: `${URL}/rest/v1/cat_modelos?select=nombre,cat_marcas!inner(nombre)&cat_marcas.nombre=eq.Nissan&order=nombre.asc`,
};

const ORDEN = ["marcas", "colores", "reglamento", "aviso", "aviso_corto", "modelos", "visitante"];
const elegidas = (__ENV.RUTAS ? __ENV.RUTAS.split(",") : ORDEN).map((s) => s.trim()).filter((s) => ORDEN.includes(s));

const scenarios = {};
const thresholds = {};
elegidas.forEach((ruta, i) => {
  scenarios[ruta] = {
    executor: "ramping-vus",
    startTime: `${i * (DURACION + PAUSA)}s`,
    startVUs: 0,
    stages: [
      { duration: `${RAMPA}s`, target: VUS_MAX },
      { duration: `${SOSTEN}s`, target: VUS_MAX },
      { duration: `${BAJADA}s`, target: 0 },
    ],
    gracefulRampDown: "5s",
    exec: ruta === "visitante" ? "visitante" : "lectura",
    env: { RUTA: ruta },
    tags: { ruta },
  };
  // Umbrales solo informativos (no abortan): sirven para que el resumen de k6
  // desglose cada ruta por separado.
  thresholds[`http_req_duration{ruta:${ruta}}`] = ["p(95)<5000"];
  thresholds[`http_reqs{ruta:${ruta}}`] = ["count>0"];
  thresholds[`upstream_ms{ruta:${ruta}}`] = ["p(95)<5000"];
});

export const options = {
  scenarios,
  thresholds,
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
  discardResponseBodies: true,
  userAgent: "satag-pruebas-carga/k6",
};

function anotar(r, ruta) {
  const ok = check(r, { "HTTP 200": (x) => x.status === 200 });
  if (!ok) errores.add(1, { ruta, status: String(r.status) });
  const up = r.headers["X-Envoy-Upstream-Service-Time"] || r.headers["x-envoy-upstream-service-time"];
  if (up !== undefined) upstream.add(Number(up), { ruta });
}

export function lectura() {
  const ruta = __ENV.RUTA;
  const r = http.get(RUTAS[ruta], { headers: H, tags: { ruta } });
  anotar(r, ruta);
}

// Un visitante real de /registro/: las 5 lecturas en paralelo (Promise.all en
// app/registro/page.tsx). Cuenta como 5 peticiones y una "visita".
export function visitante() {
  const rs = http.batch(
    ["marcas", "colores", "reglamento", "aviso", "aviso_corto"].map((k) => ({
      method: "GET", url: RUTAS[k], params: { headers: H, tags: { ruta: "visitante", consulta: k } },
    })),
  );
  rs.forEach((r) => anotar(r, "visitante"));
}

export function handleSummary(data) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const nombre = __ENV.SALIDA || `pruebas-carga/resultados/${ts}-lecturas-publicas`;
  return {
    stdout: textoResumen(data),
    [`${nombre}.summary.json`]: JSON.stringify({
      corrida: { fecha: new Date().toISOString(), VUS_MAX, RAMPA, SOSTEN, BAJADA, rutas: elegidas, proyecto: URL.replace(/^https:\/\//, "").split(".")[0] },
      metrics: data.metrics,
    }, null, 2),
  };
}

function textoResumen(data) {
  const m = data.metrics;
  const f = (v) => (v === undefined ? "—" : v.toFixed(1));
  let out = `\nResumen por ruta (VUS_MAX=${VUS_MAX}, ${RAMPA}s+${SOSTEN}s+${BAJADA}s por escenario)\n`;
  out += "ruta          reqs   fallos  dur.med  dur.p95  upstream.med  upstream.p95\n";
  for (const ruta of elegidas) {
    const reqs = m[`http_reqs{ruta:${ruta}}`]?.values.count ?? 0;
    const d = m[`http_req_duration{ruta:${ruta}}`]?.values ?? {};
    const u = m[`upstream_ms{ruta:${ruta}}`]?.values ?? {};
    const fallos = m.errores_http?.values.count ?? 0;
    out += `${ruta.padEnd(12)} ${String(reqs).padStart(6)}  ${String(fallos).padStart(6)}  ${f(d.med).padStart(7)}  ${f(d["p(95)"]).padStart(7)}  ${f(u.med).padStart(12)}  ${f(u["p(95)"]).padStart(12)}\n`;
  }
  out += "\n(el throughput por escenario y la curva de saturacion los calcula analizar.py sobre el CSV)\n";
  return out;
}
