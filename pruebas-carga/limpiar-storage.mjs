// FASE 3 · Borra del bucket `firmas` los PNG que dejo flujo-completo.js
// (nombres `pc-<hex>.png`). Solo contra STAGING.
//
//   $env:SUPABASE_SERVICE_ROLE = "<service_role de STAGING>"
//   node pruebas-carga/limpiar-storage.mjs --url=https://<ref-staging>.supabase.co [--confirmar]
//
// Sin --confirmar solo lista. La service_role no se lee de ningun archivo.
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] || true] : [a, true]; }));
const URL = (args.url || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE;
if (!URL || !KEY) { console.error("Falta --url=... y/o SUPABASE_SERVICE_ROLE en el entorno"); process.exit(2); }
if (URL.includes("nqwbkjiwgjzcpmymcmqh") && !args["ventana-produccion"]) {
  console.error("Ese es el proyecto de PRODUCCION. Este script es para staging (o --ventana-produccion en ventana acordada)."); process.exit(2);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function listar() {
  const todos = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${URL}/storage/v1/object/list/firmas`, { method: "POST", headers: H,
      body: JSON.stringify({ prefix: "", search: "pc-", limit: 1000, offset, sortBy: { column: "name", order: "asc" } }) });
    if (!r.ok) throw new Error(`list: HTTP ${r.status} ${await r.text()}`);
    const lote = (await r.json()).filter((o) => /^pc-[0-9a-f]{32}\.png$/.test(o.name)).map((o) => o.name);
    todos.push(...lote);
    if (lote.length < 1000) break;
  }
  return todos;
}

const nombres = await listar();
console.log(`${nombres.length} PNG de prueba en firmas/ (pc-*.png)`);
if (!args.confirmar) { nombres.slice(0, 10).forEach((n) => console.log("  " + n)); if (nombres.length > 10) console.log("  ..."); console.log("Agregue --confirmar para borrarlos."); process.exit(0); }
let borrados = 0;
for (let i = 0; i < nombres.length; i += 100) {
  const lote = nombres.slice(i, i + 100);
  const r = await fetch(`${URL}/storage/v1/object/firmas`, { method: "DELETE", headers: H, body: JSON.stringify({ prefixes: lote }) });
  if (!r.ok) throw new Error(`delete: HTTP ${r.status} ${await r.text()}`);
  borrados += (await r.json()).length;
}
console.log(`borrados: ${borrados}`);
