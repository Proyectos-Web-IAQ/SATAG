// FASE 2 - Costo por peticion de las LECTURAS DEL PANEL (authenticated + aal2).
//
// Es la ruta mas pesada del sistema: el padron COMPLETO con cuatro tablas
// embebidas (lib/supabase/apiPanel.ts, SELECT_REGISTRO), que se pide al abrir
// cada pestana y despues de cada cobro/instalacion. Tambien la vista de
// incompletos y la "pestana TI" completa (6 lecturas en paralelo).
//
// Solo GET: no escribe nada.
//
// Necesita una sesion aal2 con rol del panel. NO se piden credenciales: se
// reutiliza el refresh_token que guarda el arnes (estado-panel.json, generado
// por `node sesion.mjs` con la persona delante del TOTP). El setup() lo canjea
// por un access_token de una hora. Consecuencia: ese refresh_token queda
// rotado y el arnes tendra que generar sesion de nuevo; es un archivo de
// pruebas, no una cuenta.
//
// Parametros (-e):
//   SUPABASE_URL, SUPABASE_KEY   obligatorias
//   REFRESH_TOKEN                obligatoria (la extrae correr.ps1 del arnes)
//   VUS_MAX (10) RAMPA (30) SOSTEN (60) BAJADA (10)
//   RUTAS  padron,incompletos,notas,pestana_ti   (por omision todas)
//
// El tope por omision es bajo a proposito (10): en la vida real el panel lo
// usan <=5 personas. Lo que interesa aqui es el COSTO de cada padron completo,
// no cuantos caben.
import http from "k6/http";
import encoding from "k6/encoding";
import { check } from "k6";
import { Trend, Counter } from "k6/metrics";

const URL = __ENV.SUPABASE_URL;
const KEY = __ENV.SUPABASE_KEY;
const REFRESH = __ENV.REFRESH_TOKEN;
if (!URL || !KEY) throw new Error("Faltan SUPABASE_URL / SUPABASE_KEY (-e)");
if (!REFRESH) throw new Error("Falta REFRESH_TOKEN (-e): corra `node sesion.mjs` en el arnes y vuelva a intentar");

const VUS_MAX = Number(__ENV.VUS_MAX || 10);
const RAMPA = Number(__ENV.RAMPA || 30);
const SOSTEN = Number(__ENV.SOSTEN || 60);
const BAJADA = Number(__ENV.BAJADA || 10);
const DURACION = RAMPA + SOSTEN + BAJADA;
const PAUSA = 10;

const upstream = new Trend("upstream_ms", true);
const bytes = new Trend("bytes_respuesta", false);
const errores = new Counter("errores_http");

// Copia literal de SELECT_REGISTRO (lib/supabase/apiPanel.ts) sin saltos.
const SELECT_REGISTRO = [
  "id,folio,usuario_nombre_completo,gestionante_nombre_completo,tipo_usuario",
  "tipo_validado,tipo_validado_por,tipo_validado_en,usuario_es_menor",
  "marca,modelo,color,placas,sin_placas,no_dispositivo,procedencia_tag",
  "tag_apartado,tag_apartado_no,estado",
  "motivo_baja,fecha_baja,fecha_adquisicion,fecha_instalacion,instalado_por",
  "observaciones,created_at",
  "pagos(monto,metodo,cobrado_por,folio_recibo,fecha,created_at)",
  "registro_estacionamientos(estacionamiento_clave)",
  "solicitudes(id,tipo,detalle,atendida,created_at,solicitante_nombre,solicitante_rol,tramite_solicitado,alumno_nombre,alumno_grado,vehiculo_desc)",
  "movimientos(tipo,fecha,motivo,hecho_por,no_dispositivo_anterior,no_dispositivo_nuevo,created_at)",
].join(",");

const SELECT_INCOMPLETO = "id,folio,usuario_nombre_completo,gestionante_nombre_completo,tipo_usuario,marca,modelo,color,placas,sin_placas,no_dispositivo,procedencia_tag,estado,folio_recibo,created_at,dias_desde_alta,dias_desde_pago,motivos";
const SELECT_NOTA = "id,tipo,detalle,atendida,created_at,solicitante_nombre,solicitante_rol,tramite_solicitado,alumno_nombre,alumno_grado,vehiculo_desc";

const RUTAS = {
  padron: `${URL}/rest/v1/registros?select=${SELECT_REGISTRO}&order=created_at.desc`,
  incompletos: `${URL}/rest/v1/v_registros_incompletos?select=${SELECT_INCOMPLETO}&order=total_motivos.desc,dias_desde_alta.desc`,
  notas: `${URL}/rest/v1/solicitudes?select=${SELECT_NOTA}&tipo=eq.nota&registro_id=is.null&atendida=eq.false&order=created_at.asc`,
  estacionamientos: `${URL}/rest/v1/estacionamientos?select=clave,descripcion,activo&activo=eq.true&order=clave.asc`,
  marcas: `${URL}/rest/v1/cat_marcas?select=nombre&order=nombre.asc`,
  colores: `${URL}/rest/v1/cat_colores?select=nombre&order=nombre.asc`,
};

const ORDEN = ["padron", "incompletos", "notas", "pestana_ti"];
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
    exec: ruta === "pestana_ti" ? "pestanaTi" : "lectura",
    env: { RUTA: ruta },
    tags: { ruta },
  };
  thresholds[`http_req_duration{ruta:${ruta}}`] = ["p(95)<10000"];
  thresholds[`http_reqs{ruta:${ruta}}`] = ["count>0"];
  thresholds[`upstream_ms{ruta:${ruta}}`] = ["p(95)<10000"];
  thresholds[`bytes_respuesta{ruta:${ruta}}`] = ["avg>0"];
});

export const options = {
  scenarios,
  thresholds,
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
  userAgent: "satag-pruebas-carga/k6",
};

// Canjea el refresh_token por un access_token (aal2 se conserva al refrescar).
export function setup() {
  const r = http.post(`${URL}/auth/v1/token?grant_type=refresh_token`,
    JSON.stringify({ refresh_token: REFRESH }),
    { headers: { apikey: KEY, "Content-Type": "application/json" } });
  if (r.status !== 200) throw new Error(`No se pudo refrescar la sesion del arnes (HTTP ${r.status}): ${r.body}`);
  const j = r.json();
  const claims = JSON.parse(encoding.b64decode(j.access_token.split(".")[1], "rawurl", "s"));
  if (claims.aal !== "aal2") throw new Error(`La sesion no esta en aal2 (aal=${claims.aal}); el panel no dejaria leer nada`);
  console.log(`Sesion: rol=${claims.app_metadata && claims.app_metadata.rol} aal=${claims.aal} expira=${new Date(claims.exp * 1000).toISOString()}`);
  return { token: j.access_token };
}

function headers(token) {
  return { apikey: KEY, Authorization: `Bearer ${token}`, "Accept-Profile": "public" };
}

function anotar(r, ruta) {
  const ok = check(r, { "HTTP 200": (x) => x.status === 200 });
  if (!ok) errores.add(1, { ruta, status: String(r.status) });
  const up = r.headers["X-Envoy-Upstream-Service-Time"] || r.headers["x-envoy-upstream-service-time"];
  if (up !== undefined) upstream.add(Number(up), { ruta });
  bytes.add(r.body ? r.body.length : 0, { ruta });
}

export function lectura(data) {
  const ruta = __ENV.RUTA;
  const r = http.get(RUTAS[ruta], { headers: headers(data.token), tags: { ruta } });
  anotar(r, ruta);
}

// VistaTi al montarse: padron + notas + incompletos + estacionamientos + marcas + colores.
export function pestanaTi(data) {
  const rs = http.batch(
    ["padron", "notas", "incompletos", "estacionamientos", "marcas", "colores"].map((k) => ({
      method: "GET", url: RUTAS[k], params: { headers: headers(data.token), tags: { ruta: "pestana_ti", consulta: k } },
    })),
  );
  rs.forEach((r) => anotar(r, "pestana_ti"));
}

export function handleSummary(data) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const nombre = __ENV.SALIDA || `pruebas-carga/resultados/${ts}-panel-lecturas`;
  const m = data.metrics;
  const f = (v) => (v === undefined ? "—" : v.toFixed(1));
  let out = `\nResumen por ruta (VUS_MAX=${VUS_MAX})\n`;
  out += "ruta          reqs   dur.med  dur.p95  upstream.med  upstream.p95   KB.resp\n";
  for (const ruta of elegidas) {
    const reqs = m[`http_reqs{ruta:${ruta}}`]?.values.count ?? 0;
    const d = m[`http_req_duration{ruta:${ruta}}`]?.values ?? {};
    const u = m[`upstream_ms{ruta:${ruta}}`]?.values ?? {};
    const b = m[`bytes_respuesta{ruta:${ruta}}`]?.values ?? {};
    out += `${ruta.padEnd(12)} ${String(reqs).padStart(6)}  ${f(d.med).padStart(7)}  ${f(d["p(95)"]).padStart(7)}  ${f(u.med).padStart(12)}  ${f(u["p(95)"]).padStart(12)}  ${f((b.avg ?? 0) / 1024).padStart(8)}\n`;
  }
  return {
    stdout: out,
    [`${nombre}.summary.json`]: JSON.stringify({
      corrida: { fecha: new Date().toISOString(), VUS_MAX, RAMPA, SOSTEN, BAJADA, rutas: elegidas },
      metrics: data.metrics,
    }, null, 2),
  };
}
