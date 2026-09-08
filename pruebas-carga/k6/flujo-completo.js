// FASE 3 - Prueba de carga REPRODUCIBLE del flujo real de SATAG.
//
// Dos poblaciones a la vez, como en un dia de convocatoria:
//
//   familia   (muchas)  abre /registro/ (5 lecturas en paralelo) -> piensa ->
//                       elige marca (modelos) -> piensa -> firma y envia
//                       (sube el PNG a Storage + RPC crear_registro).
//   personal  (2-4)     entra al panel (contrasena + TOTP = aal2) -> pestana
//                       Administracion (padron completo) -> cobra un alta de
//                       prueba (registrar_pago) -> pestana TI (6 lecturas) ->
//                       instala un TAG (instalar_tag_con_estacionamiento) ->
//                       pestana Consulta.
//   vigia     (1)       si hay SUPABASE_SERVICE_ROLE en el entorno, lee cada
//                       10 s las metricas reales del Postgres (conexiones y
//                       CPU) para el umbral de conexiones y el costo por peticion.
//
// SOLO CONTRA STAGING. El script se niega a escribir en el proyecto de
// produccion salvo que se pase VENTANA_PRODUCCION=si (ventana acordada y
// anunciada). Las lecturas si pueden correr contra cualquier entorno.
//
// Todo lo que escribe queda marcado para poder limpiarlo:
//   registros:  usuario_nombres = 'Prueba Carga', observaciones = 'PRUEBA DE CARGA'
//   storage:    firmas/pc-<hex>.png
//   -> sql/limpiar-pruebas-carga.sql y limpiar-storage.mjs
//
// Parametros (-e; correr.ps1 los toma de pruebas-carga/.env.staging y de la linea):
//   SUPABASE_URL, SUPABASE_KEY      obligatorias
//   FRONT_URL                       opcional: si viene, cada familia pide tambien
//                                   el HTML de /registro/ (mide Cloudflare/GoDaddy/Vercel)
//   FAMILIAS        usuarios concurrentes en la meseta                (50)
//   RAMPA_MIN       minutos subiendo de 0 a FAMILIAS                  (2)
//   SOSTEN_MIN      minutos sosteniendo FAMILIAS                      (5)
//   BAJADA_MIN      minutos bajando a 0                               (1)
//   PENSAR          segundos que una familia "piensa" entre pasos    (20; real: 60-120)
//   ESCRIBIR        si|no  altas y cobros reales                      (si fuera de produccion, no en produccion)
//   PERSONAL        VUs de personal (0 = sin panel)                   (2 si ESCRIBIR, 0 si no)
//   PANEL_EMAIL, PANEL_PASSWORD, PANEL_TOTP_SECRET  cuenta de STAGING con rol super
//   REFRESH_TOKEN   alternativa: sesion aal2 del arnes (estado-panel.json), para la
//                   ventana en el proyecto real sin escribir secretos en disco
//   SUPABASE_SERVICE_ROLE   opcional, solo en el entorno: activa el vigia
//   LIMITE_CONEXIONES       limite de conexiones directas del proyecto (60)
//   SALIDA                  prefijo de los archivos de resultado
//
// Umbrales de aprobacion (la corrida FALLA si no se cumplen):
//   p95 de http_req_duration < 1 s en familia y en personal
//   errores HTTP < 1 % en familia y en personal
//   conexiones a la base < 90 % de LIMITE_CONEXIONES (solo con vigia)
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";
import crypto from "k6/crypto";
import encoding from "k6/encoding";
import { totp } from "./lib/totp.js";

// ---------------------------------------------------------------- parametros
const URL = (__ENV.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = __ENV.SUPABASE_KEY;
const FRONT = (__ENV.FRONT_URL || "").replace(/\/$/, "");
if (!URL || !KEY) throw new Error("Faltan SUPABASE_URL / SUPABASE_KEY");

const PRODUCCION_REF = "nqwbkjiwgjzcpmymcmqh";
const ES_PRODUCCION = URL.includes(PRODUCCION_REF);
const ESCRIBIR = (__ENV.ESCRIBIR || (ES_PRODUCCION ? "no" : "si")) === "si";
if (ES_PRODUCCION && ESCRIBIR && __ENV.VENTANA_PRODUCCION !== "si") {
  throw new Error("Este es el proyecto de PRODUCCION. Escribir ahi solo en ventana acordada: -e VENTANA_PRODUCCION=si. Para solo lecturas: -e ESCRIBIR=no");
}

const FAMILIAS = Number(__ENV.FAMILIAS || 50);
const RAMPA_MIN = Number(__ENV.RAMPA_MIN || 2);
const SOSTEN_MIN = Number(__ENV.SOSTEN_MIN || 5);
const BAJADA_MIN = Number(__ENV.BAJADA_MIN || 1);
const PENSAR = Number(__ENV.PENSAR || 20);
const PERSONAL = __ENV.PERSONAL !== undefined && __ENV.PERSONAL !== "" ? Number(__ENV.PERSONAL) : (ESCRIBIR ? 2 : 0);
const SERVICE_ROLE = __ENV.SUPABASE_SERVICE_ROLE || "";
const LIMITE_CONEXIONES = Number(__ENV.LIMITE_CONEXIONES || 60);
const RAMPA_S = Math.round(RAMPA_MIN * 60), SOSTEN_S = Math.round(SOSTEN_MIN * 60), BAJADA_S = Math.round(BAJADA_MIN * 60);
const TOTAL_S = RAMPA_S + SOSTEN_S + BAJADA_S;

// Dos formas de entrar al panel:
//   (a) PANEL_EMAIL + PANEL_PASSWORD + PANEL_TOTP_SECRET: cada VU hace login + TOTP (staging).
//   (b) REFRESH_TOKEN: la sesion aal2 que guardo el arnes (`node sesion.mjs`, con la
//       persona delante del TOTP). setup() la canjea UNA vez por un access_token de una
//       hora que comparten los VUs. No hay que escribir ningun secreto en disco: es la
//       forma para la ventana en el proyecto real.
const PANEL = { email: __ENV.PANEL_EMAIL, password: __ENV.PANEL_PASSWORD, totp: __ENV.PANEL_TOTP_SECRET, refresh: __ENV.REFRESH_TOKEN };
if (PERSONAL > 0 && !PANEL.refresh && (!PANEL.email || !PANEL.password || !PANEL.totp)) {
  throw new Error("PERSONAL>0 necesita PANEL_EMAIL + PANEL_PASSWORD + PANEL_TOTP_SECRET (staging) o REFRESH_TOKEN (sesion del arnes)");
}

const PNG = open("../fixtures/firma-prueba.png", "b");
const PNG_SHA256 = crypto.sha256(PNG, "hex");

// ---------------------------------------------------------------- metricas
const upstream = new Trend("upstream_ms", true);
const altaTotal = new Trend("alta_ms", true);          // subir firma + crear_registro
const aperturaTotal = new Trend("apertura_ms", true);  // las 5 lecturas de /registro/
const padronKB = new Trend("padron_kb", false);
const altasOk = new Counter("altas_ok");
const altasOmitidas = new Counter("altas_omitidas");
const cobrosOk = new Counter("cobros_ok");
const instalacionesOk = new Counter("instalaciones_ok");
const dbConexiones = new Trend("db_conexiones", false);
const dbCpu = new Trend("db_cpu_pct", false);
const dbMemLibreMB = new Trend("db_mem_libre_mb", false);

// ---------------------------------------------------------------- escenarios
const scenarios = {
  familia: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: `${RAMPA_S}s`, target: FAMILIAS },
      { duration: `${SOSTEN_S}s`, target: FAMILIAS },
      { duration: `${BAJADA_S}s`, target: 0 },
    ],
    gracefulRampDown: "30s",
    exec: "familia",
    tags: { flujo: "familia" },
  },
};
if (PERSONAL > 0) {
  scenarios.personal = {
    executor: "constant-vus", vus: PERSONAL, duration: `${TOTAL_S}s`, startTime: "15s",
    exec: "personal", tags: { flujo: "personal" },
  };
}
if (SERVICE_ROLE) {
  scenarios.vigia = { executor: "constant-vus", vus: 1, duration: `${TOTAL_S + 20}s`, exec: "vigia", tags: { flujo: "vigia" } };
}

const thresholds = {
  "http_req_duration{flujo:familia}": ["p(95)<1000"],
  "http_req_failed{flujo:familia}": ["rate<0.01"],
  "apertura_ms": ["p(95)<1500"],
  "http_reqs{flujo:familia}": ["count>0"],
};
if (PERSONAL > 0) {
  thresholds["http_req_duration{flujo:personal}"] = ["p(95)<1000"];
  thresholds["http_req_failed{flujo:personal}"] = ["rate<0.01"];
  thresholds["http_reqs{flujo:personal}"] = ["count>0"];
  thresholds["padron_kb"] = ["avg>0"];
}
if (ESCRIBIR) {
  thresholds["altas_ok"] = ["count>0"];
  thresholds["alta_ms"] = ["p(95)<2000"];
}
if (SERVICE_ROLE) {
  thresholds["db_conexiones"] = [`max<${Math.floor(LIMITE_CONEXIONES * 0.9)}`];
  thresholds["db_cpu_pct"] = ["max<=100"]; // informativo: solo para que aparezca en el resumen
}

export const options = {
  scenarios,
  thresholds,
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
  userAgent: "satag-pruebas-carga/k6 flujo-completo",
};

// ---------------------------------------------------------------- utilidades
const H_ANON = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const pensar = () => sleep(PENSAR * (0.5 + Math.random()));
const hex = (n) => Array.from(new Uint8Array(crypto.randomBytes(n))).map((b) => b.toString(16).padStart(2, "0")).join("");

function anotar(r, flujo, paso) {
  const up = r.headers["X-Envoy-Upstream-Service-Time"] || r.headers["x-envoy-upstream-service-time"];
  if (up !== undefined) upstream.add(Number(up), { flujo, paso });
}
function json(r) { try { return r.json(); } catch { return null; } }

// ---------------------------------------------------------------- FAMILIA
const Q = {
  marcas: `${URL}/rest/v1/cat_marcas?select=nombre&order=nombre.asc`,
  colores: `${URL}/rest/v1/cat_colores?select=nombre&order=nombre.asc`,
  reglamento: `${URL}/rest/v1/reglamento_versiones?select=id,version,contenido&vigente=eq.true&limit=1`,
  aviso: `${URL}/rest/v1/aviso_versiones?select=id,version,contenido,url_publica&vigente=eq.true&limit=1`,
  aviso_corto: `${URL}/rest/v1/aviso_versiones?select=contenido_simplificado&vigente=eq.true&limit=1`,
  modelos: (marca) => `${URL}/rest/v1/cat_modelos?select=nombre,cat_marcas!inner(nombre)&cat_marcas.nombre=eq.${encodeURIComponent(marca)}&order=nombre.asc`,
};

export function familia() {
  const t = { flujo: "familia" };

  // 0) el HTML (solo si se pidio medir el front)
  if (FRONT) {
    const h = http.get(`${FRONT}/registro/`, { tags: { ...t, paso: "html" } });
    check(h, { "html 200": (x) => x.status === 200 });
  }

  // 1) abrir /registro/: 5 lecturas en paralelo (app/registro/page.tsx)
  const t0 = Date.now();
  const rs = http.batch(["marcas", "colores", "reglamento", "aviso", "aviso_corto"].map((k) => ({
    method: "GET", url: Q[k], params: { headers: H_ANON, tags: { ...t, paso: "abrir", consulta: k } },
  })));
  aperturaTotal.add(Date.now() - t0);
  rs.forEach((r) => anotar(r, "familia", "abrir"));
  const ok = check(rs, {
    "abrir: 5x200": (xs) => xs.every((r) => r.status === 200),
  });
  if (!ok) { pensar(); return; }
  const marcas = (json(rs[0]) || []).map((m) => m.nombre);
  const colores = (json(rs[1]) || []).map((c) => c.nombre);
  const reglamento = (json(rs[2]) || [])[0];
  const aviso = (json(rs[3]) || [])[0];
  if (!reglamento || !aviso) { check(null, { "documentos vigentes": () => false }); pensar(); return; }
  pensar();

  // 2) elegir marca -> modelos
  const marca = marcas.length ? marcas[Math.floor(Math.random() * marcas.length)] : "Nissan";
  const rm = http.get(Q.modelos(marca), { headers: H_ANON, tags: { ...t, paso: "modelos" } });
  anotar(rm, "familia", "modelos");
  check(rm, { "modelos 200": (x) => x.status === 200 });
  const modelos = (json(rm) || []).map((m) => m.nombre);
  const modelo = modelos.length ? modelos[Math.floor(Math.random() * modelos.length)] : "Otro";
  const color = colores.length ? colores[Math.floor(Math.random() * colores.length)] : "Blanco";
  pensar();

  // 3) firmar y enviar
  if (!ESCRIBIR) { altasOmitidas.add(1); sleep(PENSAR * 0.3); return; }
  const t1 = Date.now();
  const nombrePng = `pc-${hex(16)}.png`;
  const up = http.post(`${URL}/storage/v1/object/firmas/${nombrePng}`, PNG, {
    headers: { ...H_ANON, "Content-Type": "image/png", "x-upsert": "false", "cache-control": "max-age=3600" },
    tags: { ...t, paso: "subir_firma" },
  });
  anotar(up, "familia", "subir_firma");
  if (!check(up, { "firma subida 200": (x) => x.status === 200 })) { pensar(); return; }

  const cuerpo = {
    p_usuario_nombres: "Prueba Carga",
    p_usuario_apellido_paterno: `VU${__VU}`,
    p_usuario_apellido_materno: `I${__ITER}`,
    p_tipo_usuario: "padres",
    p_marca: marca, p_modelo: modelo, p_color: color,
    p_placas: `PC${String(__VU).padStart(3, "0")}${String(__ITER % 1000).padStart(3, "0")}`,
    p_sin_placas: false,
    p_firma_url: `firmas/${nombrePng}`,
    p_firma_imagen_sha256: PNG_SHA256,
    p_firma_trazos: { width: 600, height: 200, trazos: [[[10, 100, 0], [200, 120, 300], [400, 90, 600]]] },
    p_metadata: { app: "satag-pruebas-carga", vu: __VU, iter: __ITER, capturadoEn: new Date().toISOString() },
    p_firmante_nombre: `Prueba Carga VU${__VU} I${__ITER}`,
    p_firmante_rol: "usuario",
    p_gestionante_nombres: null, p_gestionante_apellido_paterno: null, p_gestionante_apellido_materno: null,
    p_gestionante_relacion: null,
    p_usuario_es_menor: false,
    p_procedencia_tag: "escuela",
    p_observaciones: "PRUEBA DE CARGA",
    p_reglamento_version_id: reglamento.id,
    p_aviso_version_id: aviso.id,
  };
  const rc = http.post(`${URL}/rest/v1/rpc/crear_registro`, JSON.stringify(cuerpo), {
    headers: { ...H_ANON, "Content-Type": "application/json" }, tags: { ...t, paso: "crear_registro" },
  });
  anotar(rc, "familia", "crear_registro");
  const j = json(rc);
  if (check(rc, { "crear_registro 200 + folio": (x) => x.status === 200 && j && j.folio })) altasOk.add(1);
  altaTotal.add(Date.now() - t1);
  sleep(PENSAR * 0.3); // mira el comprobante y se va
}

// ---------------------------------------------------------------- PERSONAL
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
const P = {
  padron: `${URL}/rest/v1/registros?select=${SELECT_REGISTRO}&order=created_at.desc`,
  incompletos: `${URL}/rest/v1/v_registros_incompletos?select=id,folio,usuario_nombre_completo,gestionante_nombre_completo,tipo_usuario,marca,modelo,color,placas,sin_placas,no_dispositivo,procedencia_tag,estado,folio_recibo,created_at,dias_desde_alta,dias_desde_pago,motivos&order=total_motivos.desc,dias_desde_alta.desc`,
  notas: `${URL}/rest/v1/solicitudes?select=id,tipo,detalle,atendida,created_at,solicitante_nombre,solicitante_rol,tramite_solicitado,alumno_nombre,alumno_grado,vehiculo_desc&tipo=eq.nota&registro_id=is.null&atendida=eq.false&order=created_at.asc`,
  estacionamientos: `${URL}/rest/v1/estacionamientos?select=clave,descripcion,activo&activo=eq.true&order=clave.asc`,
  marcas: Q.marcas, colores: Q.colores,
};

// Sesion por VU (el modulo se instancia una vez por VU).
let sesion = null; // { token, exp }

// Forma (b): canje unico del refresh_token del arnes. aal2 se conserva al refrescar.
export function setup() {
  if (PERSONAL <= 0 || !PANEL.refresh) return {};
  const r = http.post(`${URL}/auth/v1/token?grant_type=refresh_token`, JSON.stringify({ refresh_token: PANEL.refresh }),
    { headers: { apikey: KEY, "Content-Type": "application/json" }, tags: { flujo: "personal", paso: "login" } });
  if (r.status !== 200) throw new Error(`No se pudo refrescar la sesion del arnes (HTTP ${r.status}): ${r.body}. Corra node sesion.mjs y reintente.`);
  const tok = r.json().access_token;
  const claims = JSON.parse(encoding.b64decode(tok.split(".")[1], "rawurl", "s"));
  if (claims.aal !== "aal2") throw new Error(`la sesion del arnes esta en ${claims.aal}, no en aal2`);
  console.log(`personal: sesion del arnes rol=${claims.app_metadata && claims.app_metadata.rol} expira=${new Date(claims.exp * 1000).toISOString()}`);
  return { token: tok, exp: claims.exp };
}

function login() {
  const t = { flujo: "personal", paso: "login" };
  const hj = { apikey: KEY, "Content-Type": "application/json" };
  const r1 = http.post(`${URL}/auth/v1/token?grant_type=password`, JSON.stringify({ email: PANEL.email, password: PANEL.password }), { headers: hj, tags: t });
  if (!check(r1, { "login 200": (x) => x.status === 200 })) throw new Error(`login: HTTP ${r1.status} ${r1.body}`);
  let tok = r1.json().access_token;
  const hb = { ...hj, Authorization: `Bearer ${tok}` };
  const ru = http.get(`${URL}/auth/v1/user`, { headers: hb, tags: { ...t, paso: "factores" } });
  const factor = ((json(ru) || {}).factors || []).find((f) => f.factor_type === "totp" && f.status === "verified");
  if (!factor) throw new Error("la cuenta del panel no tiene un factor TOTP verificado");
  const rch = http.post(`${URL}/auth/v1/factors/${factor.id}/challenge`, "{}", { headers: hb, tags: { ...t, paso: "mfa" } });
  const rv = http.post(`${URL}/auth/v1/factors/${factor.id}/verify`,
    JSON.stringify({ challenge_id: rch.json().id, code: totp(PANEL.totp) }), { headers: hb, tags: { ...t, paso: "mfa" } });
  if (!check(rv, { "mfa 200 (aal2)": (x) => x.status === 200 })) throw new Error(`mfa: HTTP ${rv.status} ${rv.body}`);
  tok = rv.json().access_token;
  const claims = JSON.parse(encoding.b64decode(tok.split(".")[1], "rawurl", "s"));
  if (claims.aal !== "aal2") throw new Error(`la sesion quedo en ${claims.aal}, no en aal2`);
  return { token: tok, exp: claims.exp, rol: claims.app_metadata && claims.app_metadata.rol };
}

function hPanel() { return { apikey: KEY, Authorization: `Bearer ${sesion.token}`, "Content-Type": "application/json" }; }

function rpcPanel(fn, args, paso) {
  const r = http.post(`${URL}/rest/v1/rpc/${fn}`, JSON.stringify(args), { headers: hPanel(), tags: { flujo: "personal", paso } });
  anotar(r, "personal", paso);
  return r;
}

function cargarPadron(paso) {
  const r = http.get(P.padron, { headers: hPanel(), tags: { flujo: "personal", paso } });
  anotar(r, "personal", paso);
  check(r, { [`${paso} 200`]: (x) => x.status === 200 });
  padronKB.add((r.body ? r.body.length : 0) / 1024, { paso });
  return json(r) || [];
}

const esDePrueba = (reg) => (reg.usuario_nombre_completo || "").startsWith("Prueba Carga");

export function personal(data) {
  if (data && data.token) sesion = { token: data.token, exp: data.exp };
  else if (!sesion || sesion.exp - Date.now() / 1000 < 120) sesion = login();
  const nombre = "Prueba Carga (panel)";

  // Administracion: padron completo -> cobrar un alta de prueba pendiente
  let padron = cargarPadron("admin_padron");
  pensar();
  if (ESCRIBIR) {
    const porCobrar = padron.find((r) => esDePrueba(r) && r.estado === "pendiente" && (!r.pagos || r.pagos.length === 0));
    if (porCobrar) {
      const r = rpcPanel("registrar_pago", { p_registro_id: porCobrar.id, p_monto: 100, p_cobrado_por: nombre, p_tipo_usuario: "padres" }, "registrar_pago");
      if (check(r, { "registrar_pago 200": (x) => x.status === 200 })) cobrosOk.add(1);
      padron = cargarPadron("admin_padron_recarga"); // la pantalla recarga tras cobrar
    }
  }
  pensar();

  // TI: seis lecturas en paralelo -> instalar un TAG en un alta de prueba ya cobrada
  const rs = http.batch(["padron", "notas", "incompletos", "estacionamientos", "marcas", "colores"].map((k) => ({
    method: "GET", url: P[k], params: { headers: hPanel(), tags: { flujo: "personal", paso: "ti_pestana", consulta: k } },
  })));
  rs.forEach((r) => anotar(r, "personal", "ti_pestana"));
  check(rs, { "ti: 6x200": (xs) => xs.every((r) => r.status === 200) });
  padronKB.add((rs[0].body ? rs[0].body.length : 0) / 1024, { paso: "ti_pestana" });
  const claves = (json(rs[3]) || []).map((e) => e.clave);
  pensar();
  if (ESCRIBIR && claves.length) {
    const porInstalar = (json(rs[0]) || []).find((r) => esDePrueba(r) && r.estado === "pendiente" && r.pagos && r.pagos.length > 0 && !r.no_dispositivo);
    if (porInstalar) {
      const noDisp = String(Date.now() % 100000000).padStart(8, "0") + String(__VU % 100).padStart(2, "0"); // 10 digitos, unico en la practica
      const r = rpcPanel("instalar_tag_con_estacionamiento",
        { p_registro_id: porInstalar.id, p_no_dispositivo: noDisp, p_claves: [claves[0]], p_instalado_por: nombre, p_tag_apartado_no: null, p_procedencia_tag: null },
        "instalar_tag");
      if (check(r, { "instalar_tag 200": (x) => x.status === 200 })) instalacionesOk.add(1);
      cargarPadron("ti_padron_recarga");
    }
  }
  pensar();

  // Consulta: padron + incompletos
  const rc = http.batch([
    { method: "GET", url: P.padron, params: { headers: hPanel(), tags: { flujo: "personal", paso: "consulta", consulta: "padron" } } },
    { method: "GET", url: P.incompletos, params: { headers: hPanel(), tags: { flujo: "personal", paso: "consulta", consulta: "incompletos" } } },
  ]);
  rc.forEach((r) => anotar(r, "personal", "consulta"));
  check(rc, { "consulta: 2x200": (xs) => xs.every((r) => r.status === 200) });
  pensar();
}

// ---------------------------------------------------------------- VIGIA
let anterior = null;
export function vigia() {
  const r = http.get(`${URL}/customer/v1/privileged/metrics`, {
    headers: { Authorization: "Basic " + encoding.b64encode(`service_role:${SERVICE_ROLE}`) },
    tags: { flujo: "vigia", paso: "metricas" },
  });
  if (r.status === 200) {
    const porModo = {}; const cpus = new Set(); let backends = 0, memTotal, memAvail;
    for (const linea of r.body.split("\n")) {
      if (!linea || linea[0] === "#") continue;
      let m;
      if ((m = linea.match(/^node_cpu_seconds_total\{[^}]*cpu="([^"]+)"[^}]*mode="([^"]+)"[^}]*\}\s+(\S+)/))) {
        cpus.add(m[1]); porModo[m[2]] = (porModo[m[2]] || 0) + Number(m[3]);
      } else if ((m = linea.match(/^pg_stat_database_num_?backends\{[^}]*\}\s+(\S+)/)) || (m = linea.match(/^pg_stat_activity_count\{[^}]*\}\s+(\S+)/))) {
        backends += Number(m[1]);
      } else if ((m = linea.match(/^node_memory_MemTotal_bytes\s+(\S+)/))) memTotal = Number(m[1]);
      else if ((m = linea.match(/^node_memory_MemAvailable_bytes\s+(\S+)/))) memAvail = Number(m[1]);
    }
    if (backends) dbConexiones.add(backends);
    if (memAvail) dbMemLibreMB.add(memAvail / 1048576);
    const total = Object.values(porModo).reduce((a, b) => a + b, 0);
    if (anterior && cpus.size) {
      const dt = total - anterior.total;
      if (dt > 0) dbCpu.add(100 * (1 - ((porModo.idle || 0) - (anterior.idle || 0)) / dt));
    }
    anterior = { total, idle: porModo.idle || 0, ncpu: cpus.size };
  }
  sleep(10);
}

// ---------------------------------------------------------------- resumen
export function handleSummary(data) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const nombre = __ENV.SALIDA || `pruebas-carga/resultados/${ts}-flujo`;
  const m = data.metrics;
  const v = (k, s) => (m[k] && m[k].values && m[k].values[s] !== undefined ? m[k].values[s] : null);
  const f = (x, d = 0) => (x === null || x === undefined || Number.isNaN(x) ? "—" : Number(x).toFixed(d));
  const pasa = (k) => (m[k] && m[k].thresholds ? Object.values(m[k].thresholds).every((t) => t.ok) : null);
  const marca = (b) => (b === null ? "—" : b ? "✅" : "❌");

  const filas = [
    ["familia · p95 http < 1 s", f(v("http_req_duration{flujo:familia}", "p(95)")) + " ms", marca(pasa("http_req_duration{flujo:familia}"))],
    ["familia · errores < 1 %", f(100 * (v("http_req_failed{flujo:familia}", "rate") || 0), 2) + " %", marca(pasa("http_req_failed{flujo:familia}"))],
    ["familia · apertura (5 lecturas) p95", f(v("apertura_ms", "p(95)")) + " ms", marca(pasa("apertura_ms"))],
  ];
  if (PERSONAL > 0) filas.push(
    ["personal · p95 http < 1 s", f(v("http_req_duration{flujo:personal}", "p(95)")) + " ms", marca(pasa("http_req_duration{flujo:personal}"))],
    ["personal · errores < 1 %", f(100 * (v("http_req_failed{flujo:personal}", "rate") || 0), 2) + " %", marca(pasa("http_req_failed{flujo:personal}"))],
    ["personal · padrón por carga", f(v("padron_kb", "avg")) + " KB", ""],
  );
  if (ESCRIBIR) filas.push(
    ["altas completas (firma + RPC)", f(v("altas_ok", "count")) + " · p95 " + f(v("alta_ms", "p(95)")) + " ms", marca(pasa("altas_ok"))],
    ["cobros / instalaciones", f(v("cobros_ok", "count")) + " / " + f(v("instalaciones_ok", "count")), ""],
  );
  if (SERVICE_ROLE) filas.push(
    [`conexiones BD < ${Math.floor(LIMITE_CONEXIONES * 0.9)}`, "máx " + f(v("db_conexiones", "max")) + " · med " + f(v("db_conexiones", "med")), marca(pasa("db_conexiones"))],
    ["CPU del Postgres", "med " + f(v("db_cpu_pct", "med"), 1) + " % · máx " + f(v("db_cpu_pct", "max"), 1) + " %", ""],
    ["memoria libre", "mín " + f(v("db_mem_libre_mb", "min")) + " MB", ""],
  );
  const reqs = v("http_reqs", "count") || 0;
  const dur = TOTAL_S;
  const aprobada = Object.values(m).every((x) => !x.thresholds || Object.values(x.thresholds).every((t) => t.ok));

  // Si setup() lanzo (sesion del arnes vencida, etc.) k6 llega aqui sin haber
  // corrido ningun VU: no es una corrida, es un aborto, y no se registra.
  if (reqs < 20) {
    const aviso = `\nCORRIDA ABORTADA antes de arrancar (${reqs} peticiones). Revise el error de arriba; no hay nada que registrar en CAPACIDAD.md.\n`;
    return { stdout: aviso, [`${nombre}.ABORTADA.txt`]: aviso };
  }

  let md = `# Corrida ${ts} · flujo completo\n\n`;
  md += `| Parámetro | Valor |\n|---|---|\n`;
  md += `| Entorno | ${URL.replace(/^https:\/\//, "").split(".")[0]}${ES_PRODUCCION ? " (**PRODUCCIÓN**)" : ""} |\n`;
  md += `| Familias (meseta) · rampa / sostén / bajada | **${FAMILIAS}** · ${RAMPA_MIN} / ${SOSTEN_MIN} / ${BAJADA_MIN} min |\n`;
  md += `| Personal · pensar | ${PERSONAL} VUs · ${PENSAR} s |\n`;
  md += `| Escrituras | ${ESCRIBIR ? "sí" : "no (solo lecturas)"} |\n`;
  md += `| Peticiones totales · promedio | ${reqs} · ${(reqs / dur).toFixed(1)} req/s |\n\n`;
  md += `| Umbral / medida | Resultado | Pasa |\n|---|---|---|\n`;
  for (const [a, b, c] of filas) md += `| ${a} | ${b} | ${c} |\n`;
  md += `\n**Resultado: ${aprobada ? "APROBADA ✅" : "NO APROBADA ❌"}**\n\n`;
  md += `Para CAPACIDAD.md §III.2: fila «${ts.slice(0, 10)} · ${URL.replace(/^https:\/\//, "").split(".")[0]} · ${FAMILIAS} familias · p95 familia ${f(v("http_req_duration{flujo:familia}", "p(95)"))} ms · err ${f(100 * (v("http_req_failed{flujo:familia}", "rate") || 0), 2)} % · conexiones máx ${f(v("db_conexiones", "max"))} · ${aprobada ? "aprobada" : "NO aprobada"}».\n`;

  return {
    stdout: "\n" + md,
    [`${nombre}.md`]: md,
    [`${nombre}.summary.json`]: JSON.stringify({ corrida: { fecha: new Date().toISOString(), URL: URL.replace(/^https:\/\//, "").split(".")[0], FAMILIAS, RAMPA_MIN, SOSTEN_MIN, BAJADA_MIN, PENSAR, PERSONAL, ESCRIBIR, vigia: !!SERVICE_ROLE, aprobada }, metrics: m }, null, 2),
  };
}
