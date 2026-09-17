// Comprueba que el sitio PUBLICADO trae los cambios que deberia traer.
//
// POR QUE EXISTE. Cada deploy se verificaba a mano con un bucle de curl que
// bajaba la pagina, sacaba los chunks de JavaScript y buscaba una cadena
// dentro. Se corrio cinco veces el 17-sep y siempre igual. El riesgo de
// hacerlo a mano no es el tiempo: es que un dia se dé por bueno un deploy que
// no llego, y en este proyecto hay cambios de base que DEPENDEN de que el
// cliente ya este publicado (la leccion del 10 y 11-sep).
//
//   npm run publicado              contra el dominio institucional
//   npm run publicado -- --local   contra http://localhost:3000
//   npm run publicado -- <url>     contra otro origen
//
// Sale con codigo 1 si falta alguna marca, para que sirva en un hook o en CI.
//
// MANTENIMIENTO: cuando un cambio de cliente tenga que ser verificable desde
// fuera, se le agrega su marca aqui. Una marca buena es una cadena que solo
// exista si ese cambio esta publicado, y que no vaya a cambiar por un cambio
// de redaccion menor.

const DOMINIO = "https://satag.asuncionqro.edu.mx";

const RUTAS = [
  {
    ruta: "/registro/",
    marcas: [
      { texto: "p_seccion_maestro", que: "el alta manda la seccion del maestro (bloque 70)" },
      { texto: "El conductor del veh", que: "la etiqueta del conductor (L2-12)" },
    ],
  },
  {
    ruta: "/admin/",
    marcas: [
      { texto: "seccion_maestro", que: "el panel consulta la seccion (L2-09)" },
      { texto: "las consulta Sistemas", que: "la firma solo la abren TI y super (L2-03)" },
      { texto: "dados de alta desde", que: "el stock a ZK va filtrado por fecha de alta" },
      { texto: "Contabilidad", que: "el rol contador existe en el cliente (inerte hasta el bloque 74)" },
    ],
  },
];

const arg = process.argv.slice(2).find((a) => !a.startsWith("-"));
const local = process.argv.includes("--local");
const origen = (arg || (local ? "http://localhost:3000" : DOMINIO)).replace(/\/$/, "");

// Sin cache: el objetivo es ver lo que hay publicado AHORA, no lo que un
// intermediario recuerda.
const SIN_CACHE = { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } };

async function baja(url) {
  const r = await fetch(url, SIN_CACHE);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

console.log(`Comprobando ${origen}\n`);

let faltan = 0;
let revisadas = 0;

for (const { ruta, marcas } of RUTAS) {
  let html;
  try {
    html = await baja(origen + ruta);
  } catch (e) {
    console.log(`  ${ruta}  NO RESPONDE: ${e.message}`);
    faltan += marcas.length;
    continue;
  }

  // Los chunks de Next llevan nombre con huella, asi que se leen de la pagina
  // en vez de adivinarse.
  const chunks = [...new Set(html.match(/\/_next\/static\/chunks\/[^"']+?\.js/g) || [])];
  if (chunks.length === 0) {
    console.log(`  ${ruta}  sin chunks en el HTML: ¿pagina de error?`);
    faltan += marcas.length;
    continue;
  }

  const cuerpos = await Promise.all(
    chunks.map((c) => baja(origen + c).catch(() => "")),
  );
  const todo = html + cuerpos.join("");

  console.log(`  ${ruta}  (${chunks.length} chunks)`);
  for (const { texto, que } of marcas) {
    revisadas++;
    const esta = todo.includes(texto);
    if (!esta) faltan++;
    console.log(`    ${esta ? "OK   " : "FALTA"}  ${que}`);
  }
  console.log();
}

if (faltan === 0) {
  console.log(`Publicado: las ${revisadas} marcas estan en el sitio.`);
} else {
  console.log(`Publicado: faltan ${faltan} de ${revisadas} marcas.`);
  console.log("Si acaba de hacer push, Actions tarda cerca de un minuto: vuelva a correrlo.");
  console.log("Si insiste, mire la pestana Actions del repositorio antes de aplicar cualquier bloque que dependa de este cliente.");
  process.exit(1);
}
