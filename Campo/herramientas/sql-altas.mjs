// Genera el SQL de altas de quienes abren la pluma sin expediente (decision de
// Gerardo, 6-oct: «hay que meterlo todo»). Lee altas-<dia>.xlsx (detalle-sin-expediente.mjs)
// y las fotos del dia; escribe Campo/datos/<dia>/altas-<dia>.sql (fuera de git: nombres
// y placas).
//
// QUE HACE EL SQL, en una sola transaccion:
//   1. Guardia: aborta sin tocar nada si alguna tarjeta ya tiene expediente (vivo o
//      migrado) o si no existen los expedientes que se anotan.
//   2. Altas por `migrar_expedientes` (bloque 79), el mismo camino del 86: con la
//      hoja si esta ahi (coche, placa, fecha) y si no, con ZK. Rol `ti` por
//      `set local request.jwt.claims`, como las cargas del 1-oct.
//   3. Credenciales SIN NOMBRE que viajan con alguien: no se dan de alta (no hay a
//      nombre de quien); se anotan en las observaciones de ese expediente.
//   4. Verificacion dentro de la transaccion: si no cuadra, aborta.
// Las credenciales sin nombre y sin pista no van: esperan al bloque 89.
//
//   node Campo/herramientas/sql-altas.mjs --datos Campo/datos/2026-10-06
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { abrir, ges, RAIZ } from "./fuentes.mjs";
import { comparar, DECISION_POR_CLASE, palabras, separarNota, titulo } from "./nombres.mjs";

const i = process.argv.indexOf("--datos");
const dir = process.argv[i + 1];
const dia = path.basename(dir);
const F = abrir(dir);
const X = createRequire(path.join(RAIZ, "package.json"))("xlsx");
const filas = X.utils.sheet_to_json(X.readFile(path.join(F.DATOS, `altas-${dia}.xlsx`)).Sheets["Sin expediente"], { defval: "" });
const zk = new Map(F.zkPersonas().map((r) => [r.tarjeta, r]));
const hoja = F.hoja();
const satag = F.satag();
const MARCA = `[depuracion ${dia}]`;

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const fechaIso = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "");
const placaOk = (v) => {
  const p = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return p.length >= 5 && p.length <= 8 && /[A-Z]/.test(p) && /\d/.test(p) && !/FORMATO|^NA/.test(p) ? p : "";
};
// GES escribe «APELLIDOS NOMBRES»: dice cuantas palabras son nombre sin adivinar.
const tutoresGes = [...new Set(ges(dir).familias().flatMap((f) => [f.padre, f.madre]).filter(Boolean))];

// Parte el nombre en nombres y apellidos. Primero GES: las palabras del FINAL de su
// nombre que coinciden con las del PRINCIPIO del nuestro son los nombres («VARGAS
// ZUBIA LUIS ARTURO» -> 2). Si no esta en GES, cuantas trae ZK en «Nombre»; sin ZK,
// las dos ultimas son apellidos.
function partir(completo, z) {
  const w = String(completo).trim().split(/\s+/);
  let n = z?.nombre ? z.nombre.trim().split(/\s+/).length : Math.max(1, w.length - 2);
  const g = tutoresGes.find((t) => DECISION_POR_CLASE[comparar(completo, t)] === "misma");
  if (g) {
    const gw = palabras(g), cw = palabras(completo);
    for (let k = cw.length - 1; k >= 1; k--) {
      if (gw.slice(gw.length - k).join(" ") !== cw.slice(0, k).join(" ")) continue;
      // k cuenta palabras SIN particulas; se traduce a palabras del nombre original
      // («Nataly del Carmen» son 2 para comparar y 3 para cortar).
      let vistas = 0;
      n = w.findIndex((x) => palabras(x).length && ++vistas === k) + 1;
      break;
    }
  }
  n = Math.min(Math.max(1, n), w.length - 1);
  return { nombres: w.slice(0, n).join(" "), apellidos: w.slice(n).join(" ") };
}

const lote = [], tarjetas = [], anotar = [], pendientes = [];
for (const f of filas) {
  const t = String(f.TAG);
  const z = zk.get(t);
  if (/sin nombre/i.test(f.Nombre)) {
    const m = /^Identificar: viaja con (\d+) /.exec(f.Propuesta);
    const s = m && satag.find((r) => r.tarjeta === m[1] && r.estado !== "baja");
    if (s) anotar.push({ folio: s.folio, nota: `${MARCA} Viaja con la credencial ${t}, que en ZK no tiene nombre (${f["Depto ZK"]}): se leen juntas en la pluma (${f["Viaja con"].replace(/^.*\((.*)\)$/, "$1")}). La credencial abrio ${Number(f["Aperturas E1"]) + Number(f["Aperturas E2"])} veces del ${String(f["Primera apertura"]).slice(0, 10)} al ${String(f["Ultima apertura"]).slice(0, 10)}. Probable segundo TAG (condominio o externo) en el mismo coche: confirmar.` });
    else pendientes.push(t);
    continue;
  }
  const h = hoja.filter((r) => r.tarjeta === t).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).at(-1);
  const nom = partir(f.Nombre, z);
  const ap = partir(f.Nombre, z).apellidos.split(/\s+/);
  let gest = null;
  if (h?.gestionante && palabras(h.gestionante).length >= 2) {
    // Si en la hoja el gestionante es el mismo usuario (comparado con el nombre DE LA
    // HOJA, con sus erratas), se usa el nombre ya corregido.
    gest = DECISION_POR_CLASE[comparar(h.gestionante, h.nombre, { mismaLlave: true })] === "misma" ? nom : partir(titulo(h.gestionante), null);
  }
  const tipo = /Familiar/.test(f.Categoria) ? "otro" : f.Categoria === "Empleado" ? "admin" : "padres";
  const plumas = f["Plumas que abre"] && f["Plumas que abre"] !== "ninguna" ? f["Plumas que abre"].split("+") : ["E1", "E2"];
  const placa = placaOk(h?.placa) || placaOk(z?.placa) || placaOk(z?.celular);
  const preguntar = /preguntar al presentarse/i.test(f.Propuesta);
  const notas = [
    `${MARCA} Alta: abria la pluma sin expediente (${Number(f["Aperturas E1"]) + Number(f["Aperturas E2"])} aperturas en ${f["Dias distintos"]} dias, del ${String(f["Primera apertura"]).slice(0, 10)} al ${String(f["Ultima apertura"]).slice(0, 10)}).`,
    f["Familia o puesto en GES"] ? `GES: ${f["Familia o puesto en GES"]}.` : "No aparece en GES.",
    `Departamento en ZK: ${f["Depto ZK"]}.`,
    h ? `Datos de la hoja, fila ${h.fila}.` : "No esta en la hoja: falta capturar el vehiculo.",
    h?.observaciones && h.observaciones !== "--" ? `Nota de la hoja: ${h.observaciones}` : "",
    f["Otros TAGs de la persona"] ? `Otros TAGs de la persona: ${f["Otros TAGs de la persona"]}.` : "",
    preguntar || tipo === "otro" ? "PREGUNTAR AL PRESENTARSE: confirmar quien es, su parentesco y su relacion con el colegio." : "",
    /BAJAS/.test(f["Depto ZK"]) ? "En ZK esta en BAJAS: TI debe regresarla a Padres de familia." : "",
  ].filter(Boolean).join(" ");
  lote.push({
    noDispositivo: t,
    nombres: nom.nombres,
    apellidoPaterno: ap.join(" "),
    apellidoMaterno: "",
    ...(gest ? { gestionanteNombres: gest.nombres, gestionanteApellidoPaterno: gest.apellidos } : {}),
    tipoUsuario: tipo,
    marca: h?.marca ?? "",
    modelo: h?.modelo ?? "",
    color: h?.color ?? "",
    placas: placa,
    sinPlacas: false,
    procedenciaTag: /TAG de Condominio/i.test(h?.observaciones ?? "") ? "propio" : "escuela",
    estado: "activo",
    fechaAdquisicion: fechaIso(h?.fecha ?? ""),
    estacionamientos: plumas,
    origen: h ? "migracion_hoja" : "migracion_zk",
    evidencia: h ? "fisica" : "no_localizada",
    observaciones: notas,
    // El parentesco no se sabe (Gerardo, 6-oct: no hay forma de verificar quien es abuelo
    // de quien): se deja «Por confirmar» y el expediente pide preguntar al presentarse.
    _parentesco: tipo === "otro" ? "Por confirmar" : "",
  });
  tarjetas.push(t);
}

const json = JSON.stringify(lote.map(({ _parentesco, ...r }) => r));
const otros = lote.filter((r) => r._parentesco);
const sql = `-- =====================================================================
-- ALTAS DE LA DEPURACION DEL ${dia}: quienes abren la pluma sin expediente
-- Generado por Campo/herramientas/sql-altas.mjs. Decision de Gerardo (${dia}).
--
-- ${lote.length} altas por migrar_expedientes (bloque 79), ${anotar.length} anotaciones en expedientes
-- existentes (credenciales sin nombre que viajan con alguien). Sin altas para
-- ${pendientes.length} credenciales sin nombre y sin pista (${pendientes.join(", ")}): esperan al bloque 89.
--
-- UNA SOLA TRANSACCION: si la guardia o la verificacion fallan, no se aplica nada.
-- Se pega COMPLETO en el SQL Editor (consulta nueva y vacia) y se corre una vez.
-- Lo ultimo que sale es la tabla de verificacion: todas las filas en ok = true.
-- =====================================================================
begin;

set local request.jwt.claims = '{"aal":"aal2","app_metadata":{"rol":"ti"},"email":"depuracion-${dia}@satag"}';

-- 1. GUARDIA ------------------------------------------------------------
do $guardia$
declare v text;
begin
    select string_agg(no_dispositivo || ' (' || folio || ', ' || estado || ', ' || origen_expediente || ')', '; ')
      into v
      from registros
     where no_dispositivo in (${tarjetas.map(lit).join(", ")})
       and (estado <> 'baja' or origen_expediente <> 'satag');
    if v is not null then
        raise exception 'Estas tarjetas ya tienen expediente (migrar_expedientes las saltaria): %. No se aplico nada.', v;
    end if;
    if (select count(*) from registros where folio in (${anotar.map((a) => lit(a.folio)).join(", ") || "''"}) and estado <> 'baja') <> ${anotar.length} then
        raise exception 'No estan vivos todos los expedientes a anotar (${anotar.map((a) => a.folio).join(", ")}). No se aplico nada.';
    end if;
    if exists (select 1 from registros where observaciones like '%${MARCA}%') then
        raise exception 'Este SQL ya se aplico (hay expedientes con la marca ${MARCA}). No se aplico nada.';
    end if;
end
$guardia$;

-- 2. ALTAS ---------------------------------------------------------------
select migrar_expedientes(${lit(json)}::jsonb, 'depuracion-${dia}');

${otros.map((r) => `update registros set parentesco_otro = ${lit(r._parentesco)} where no_dispositivo = ${lit(r.noDispositivo)} and estado <> 'baja' and tipo_usuario = 'otro';`).join("\n")}

-- 3. ANOTACIONES ---------------------------------------------------------
${anotar.map((a) => `update registros set observaciones = coalesce(observaciones || ' ', '') || ${lit(a.nota)} where folio = ${lit(a.folio)};`).join("\n")}

-- 4. VERIFICACION (dentro de la transaccion: si falla, aborta) ------------
do $verif$
begin
    if (select count(*) from registros where observaciones like '${MARCA} Alta:%' and estado = 'activo') <> ${lote.length} then
        raise exception 'Se esperaban ${lote.length} altas y no cuadra. No se aplico nada.';
    end if;
    if exists (select no_dispositivo from registros where no_dispositivo in (${tarjetas.map(lit).join(", ")}) and estado <> 'baja' group by no_dispositivo having count(*) <> 1) then
        raise exception 'Alguna tarjeta quedo con mas de un expediente vivo. No se aplico nada.';
    end if;
end
$verif$;

commit;

-- Tabla de verificacion (solo lectura): todas en ok = true.
select 1 as orden, 'altas con la marca del dia' as que, count(*) as valor, count(*) = ${lote.length} as ok
  from registros where observaciones like '${MARCA} Alta:%' and estado = 'activo'
union all
select 2, 'cada tarjeta con exactamente un expediente vivo', count(*), count(*) = ${lote.length}
  from (select no_dispositivo from registros where no_dispositivo in (${tarjetas.map(lit).join(", ")}) and estado <> 'baja' group by 1 having count(*) = 1) x
union all
select 3, 'todas con su pluma', count(distinct re.registro_id), count(distinct re.registro_id) = ${lote.length}
  from registro_estacionamientos re join registros r on r.id = re.registro_id where r.observaciones like '${MARCA} Alta:%'
union all
select 4, 'todas con su movimiento de alta', count(distinct m.registro_id), count(distinct m.registro_id) = ${lote.length}
  from movimientos m join registros r on r.id = m.registro_id where m.tipo = 'alta' and r.observaciones like '${MARCA} Alta:%'
union all
select 5, 'expedientes anotados (credencial sin nombre)', count(*), count(*) = ${anotar.length}
  from registros where folio in (${anotar.map((a) => lit(a.folio)).join(", ") || "''"}) and observaciones like '%${MARCA} Viaja con%'
union all
select 6, 'parentesco de los tipo otro', count(*), count(*) = ${otros.length}
  from registros where observaciones like '${MARCA} Alta:%' and tipo_usuario = 'otro' and parentesco_otro is not null
order by 1;

-- =====================================================================
-- ROLLBACK (comentado). Deshace las altas y las anotaciones de este archivo. La
-- secuencia de folios NO regresa: los numeros quedan usados.
-- =====================================================================
-- begin;
-- delete from registro_estacionamientos where registro_id in (select id from registros where observaciones like '${MARCA} Alta:%');
-- delete from movimientos where registro_id in (select id from registros where observaciones like '${MARCA} Alta:%');
-- delete from registros where observaciones like '${MARCA} Alta:%';
-- update registros set observaciones = nullif(btrim(regexp_replace(observaciones, ' ?\\${MARCA.replace(/[\]]/g, "\\]")} Viaja con.*$', '')), '')
--  where folio in (${anotar.map((a) => lit(a.folio)).join(", ")});
-- commit;
`;
const salida = path.join(F.DATOS, `altas-${dia}.sql`);
fs.writeFileSync(salida, sql);
console.log(`altas: ${lote.length} (hoja ${lote.filter((r) => r.origen === "migracion_hoja").length}, ZK ${lote.filter((r) => r.origen === "migracion_zk").length}) · tipo: ${JSON.stringify(lote.reduce((m, r) => ((m[r.tipoUsuario] = (m[r.tipoUsuario] ?? 0) + 1), m), {}))}`);
console.log(`sin placa: ${lote.filter((r) => !r.placas).length} · sin coche: ${lote.filter((r) => !r.marca).length} · con gestionante distinto: ${lote.filter((r) => r.gestionanteNombres && r.gestionanteNombres !== r.nombres).length}`);
console.log(`anotaciones: ${anotar.map((a) => a.folio).join(", ")} · pendientes sin nombre: ${pendientes.join(", ")}`);
console.log(`escrito: ${path.relative(process.cwd(), salida)} (${(sql.length / 1024).toFixed(1)} KB, ${sql.split("\n").length} lineas)`);
