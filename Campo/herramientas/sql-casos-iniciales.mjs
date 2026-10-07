// Genera el SQL de la carga inicial de casos (bloque 89) con lo que dejo la
// depuracion de un dia. Lee de Campo/datos/<dia>/: personas-<dia>.xlsx,
// movimientos-planeados-zk-<dia>.xlsx (la version que Gerardo reviso),
// decisiones-personas.csv y casos-por-registrar.csv. Escribe
// casos-iniciales-<dia>.sql (fuera de git: trae nombres en la evidencia).
//
// Cada caso entra por `abrir_caso` con una `clave` estable (tipo:tarjeta), asi
// que repetir la carga no duplica nada. Todos quedan con creado_por
// «depuracion-<dia>», que es lo que usa el rollback.
//
//   node Campo/herramientas/sql-casos-iniciales.mjs --datos Campo/datos/2026-10-06
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { abrir, RAIZ } from "./fuentes.mjs";

const i = process.argv.indexOf("--datos");
const dir = process.argv[i + 1];
const dia = path.basename(dir);
const F = abrir(dir);
const X = createRequire(path.join(RAIZ, "package.json"))("xlsx");
const hoja = (n, s) => X.utils.sheet_to_json(X.readFile(path.join(F.DATOS, n)).Sheets[s], { defval: "" });
const csv = (n) => X.utils.sheet_to_json(X.read(fs.readFileSync(path.join(F.DATOS, n), "utf8"), { type: "string", raw: true }).Sheets.Sheet1, { defval: "", raw: false });

const P = hoja(`personas-${dia}.xlsx`, "Personas");
const T = hoja(`personas-${dia}.xlsx`, "TAGs");
const E = hoja(`personas-${dia}.xlsx`, "Evidencia");
const M = hoja(`movimientos-planeados-zk-${dia}.xlsx`, "Movimientos planeados");
const decisiones = csv("decisiones-personas.csv");
const porRegistrar = csv("casos-por-registrar.csv");
const ultima = new Map(F.zkUltimaPosicion().map((r) => [r.tarjeta, r]));
const tagFila = (t) => T.find((x) => String(x.TAG) === String(t));
const persona = (t) => P.find((p) => p.Persona === tagFila(t)?.Persona);
const REGLA = `personas.mjs@${dia}`;
const QUIEN = `depuracion-${dia}`;

const casos = [];
const agregar = (c) => {
  const clave = `${c.tipo}:${c.tarjeta}`;
  if (casos.some((x) => x.clave === clave)) return;
  casos.push({ ...c, clave, origen: c.origen ?? "regla", regla: c.origen === "manual" ? null : REGLA });
};
const usoDe = (t) => {
  const f = tagFila(t), u = ultima.get(String(t));
  return {
    aperturasVentana: Number(f?.Aperturas ?? 0),
    ventana: `14-sep a ${dia}`,
    ultimoPaso: f?.["Ultimo paso"] || (u ? `${u.tiempo} (${u.evento})` : "ninguno desde el 7-jul"),
    departamentoZk: f?.["Depto ZK"] ?? "",
    plumas: f?.Plumas || "ninguna",
  };
};

// 1. Lo que se registro a mano en la conversacion (casos-por-registrar.csv).
const TIPO = { "excepcion de acceso": "excepcion-acceso", conducta: "conducta", "mal uso de TAG": "mal-uso-tag", "exempleado que sigue usando la pluma": "exempleado-tag-vivo", "reposicion de TAG": "reposicion-tag", "dos TAGs en el mismo coche": "dos-tags-mismo-coche" };
for (const c of porRegistrar) {
  agregar({
    tipo: TIPO[c.tipo] ?? "otro", tarjeta: String(c.tag), origen: "manual",
    titulo: c.que_pasa.slice(0, 200), detalle: `${c.regla_o_accion}\nRegistro: ${c.registro}.`,
    estado: c.estado === "en seguimiento" ? "seguimiento" : "abierto",
    evidencia: { fuentes: c.evidencia, ...usoDe(c.tag) },
  });
}

// 2. Preguntar al presentarse (decisiones de Gerardo).
for (const d of decisiones.filter((d) => d.preguntar_al_presentarse === "si")) {
  const p = persona(d.TAG);
  // «No localizado» que GES ya encontro (despues llego la lista de empleados): no hay
  // nada que preguntarle.
  if (d.clasificacion === "no localizado en GES" && p && !/No localizado/.test(p.Categoria)) { console.log(`  sin caso «preguntar»: ${d.TAG} ya esta en GES como ${p.Categoria}`); continue; }
  agregar({
    tipo: "preguntar", tarjeta: String(d.TAG), origen: "manual", preguntar: true,
    titulo: d.clasificacion === "familiar no tutor" ? "Confirmar su parentesco con la familia" : d.clasificacion === "por confirmar" ? "Confirmar quien es (las fuentes no coinciden)" : "Confirmar quien es: no aparece en GES",
    detalle: d.nota,
    evidencia: { clasificacion: d.clasificacion, familiaGes: d.familia_ges || null, categoria: p?.Categoria ?? null, ...usoDe(d.TAG) },
  });
}

// 3. Credenciales sin nombre que abren la pluma.
for (const p of P.filter((p) => !p.Nombre && Number(p["Aperturas 14-sep a hoy"]) > 0)) {
  const t = String(p["TAG principal"]);
  const viaja = E.filter((e) => (String(e["TAG A"]) === t || String(e["TAG B"]) === t) && /coche|placa/.test(e.Liga)).map((e) => {
    const o = String(e["TAG A"]) === t ? e["TAG B"] : e["TAG A"];
    return { tag: String(o), nombre: tagFila(o)?.Nombre ?? "", folio: tagFila(o)?.["Folio SATAG"] ?? "", liga: e.Liga, detalle: e.Detalle };
  });
  agregar({
    tipo: "credencial-sin-nombre", tarjeta: t,
    titulo: viaja.length ? `Credencial sin nombre que viaja con ${viaja[0].nombre}` : "Credencial sin nombre que abre la pluma",
    detalle: viaja.length ? "Probable segundo TAG (condominio o externo) en el mismo coche: confirmar con la persona." : "Sin pista de quien la trae: preguntar a quien la traiga.",
    evidencia: { viajaCon: viaja, ...usoDe(t) },
  });
}

// 4. Movimientos planeados en ZK (los que Gerardo reviso). Exempleados -> su tipo.
for (const m of M) {
  const t = String(m.TAG);
  const p = persona(t);
  if (/excepcion de acceso/.test(m.Prioridad)) continue; // ya entro en (1)
  const aBajas = String(m["Pasar a (ID)"]) === "10";
  agregar({
    tipo: aBajas ? "exempleado-tag-vivo" : "departamento-distinto", tarjeta: t,
    titulo: aBajas
      ? (/CONFIRMAR/.test(m.Prioridad) ? "Exempleado con TAG vivo: confirmar la baja antes de moverlo" : "Exempleado con TAG vivo: pasar a BAJAS y quitar niveles")
      : `En ZK esta en «${m["Departamento hoy"]}» y le toca «${m["Pasar a (nombre)"]}»`,
    detalle: `Movimiento planeado en ZK (${m.Prioridad}): ${m["Departamento hoy"]} -> ${m["Pasar a (nombre)"]} (${m["Pasar a (ID)"]})${m["Quitar niveles"] === "si" ? ", quitar niveles" : ""}. Lo aplica Gerardo con el visto bueno de Lidia; cerrar el caso al aplicarlo.`,
    evidencia: { motivo: m.Motivo, ges: m["Evidencia GES"], categoria: p?.Categoria ?? null, prioridad: m.Prioridad, ...usoDe(t) },
  });
}

// 5. TAGs sin uso de personas que usan otro (se documentan; Gerardo, 6-oct).
for (const p of P) {
  for (const a of p["Acciones propuestas"].split(" · ").filter((a) => /sin uso \(usa el/.test(a))) {
    const [, t, otro] = /TAG (\d+) sin uso \(usa el (\d+)\)/.exec(a);
    agregar({
      tipo: "tag-sin-uso", tarjeta: t,
      titulo: `TAG sin uso: la persona usa el ${otro}`,
      detalle: "Se documenta; no se le quitan niveles sin decision (Gerardo, 6-oct).",
      evidencia: { tagQueSiUsa: otro, aperturasDelQueUsa: Number(tagFila(otro)?.Aperturas ?? 0), categoria: p.Categoria, ...usoDe(t) },
    });
  }
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const lote = casos.map((c) => ({ tipo: c.tipo, tarjeta: c.tarjeta, titulo: c.titulo, detalle: c.detalle, evidencia: c.evidencia, preguntar: !!c.preguntar, clave: c.clave, origen: c.origen, regla: c.regla, estado: c.estado ?? "abierto" }));
const porTipo = lote.reduce((m, c) => ((m[c.tipo] = (m[c.tipo] ?? 0) + 1), m), {});
const sql = `-- =====================================================================
-- CARGA INICIAL DE CASOS (bloque 89): la depuracion del ${dia}
-- Generado por Campo/herramientas/sql-casos-iniciales.mjs. ${lote.length} casos:
-- ${Object.entries(porTipo).map(([k, v]) => `${k} ${v}`).join(", ")}.
-- Una sola transaccion; repetirla no duplica (clave tipo:tarjeta). Al final,
-- la tabla de verificacion: todas las filas en ok = true.
-- =====================================================================
begin;

set local request.jwt.claims = '{"aal":"aal2","app_metadata":{"rol":"ti"},"email":"${QUIEN}"}';

do $guardia$
begin
    if to_regprocedure('public.abrir_caso(text, text, text, uuid, text, jsonb, boolean, text, text, text, text)') is null then
        raise exception 'Falta el bloque 89 (abrir_caso). No se aplico nada.';
    end if;
end
$guardia$;

do $carga$
declare
    c jsonb;
    v_reg uuid;
    v jsonb;
begin
    for c in select value from jsonb_array_elements(${lit(JSON.stringify(lote))}::jsonb)
    loop
        -- El expediente vivo de ese TAG, si lo hay.
        select id into v_reg from registros where no_dispositivo = c ->> 'tarjeta' and estado <> 'baja' order by created_at desc limit 1;
        v := abrir_caso(c ->> 'tipo', c ->> 'titulo', c ->> 'detalle', v_reg, c ->> 'tarjeta', c -> 'evidencia',
                        (c ->> 'preguntar')::boolean, c ->> 'clave', c ->> 'origen', c ->> 'regla', '${QUIEN}');
        if c ->> 'estado' = 'seguimiento' and not (v ->> 'yaExistia')::boolean then
            perform anotar_caso((v ->> 'id')::uuid, 'Aplicado en ZK el ${dia}; queda en seguimiento de su uso.', 'seguimiento', '${QUIEN}');
        end if;
    end loop;
end
$carga$;

do $verif$
begin
    if (select count(*) from casos where creado_por = '${QUIEN}') <> ${lote.length} then
        raise exception 'Se esperaban ${lote.length} casos de la carga y no cuadra. No se aplico nada.';
    end if;
end
$verif$;

commit;

select 1 as orden, 'casos de la carga' as que, count(*) as valor, count(*) = ${lote.length} as ok from casos where creado_por = '${QUIEN}'
${Object.entries(porTipo).map(([k, v], n) => `union all select ${n + 2}, ${lit(`tipo ${k}`)}, count(*), count(*) = ${v} from casos where creado_por = '${QUIEN}' and tipo = ${lit(k)}`).join("\n")}
union all select 90, 'todos con su nota de apertura', count(*), count(*) = 0 from casos c where creado_por = '${QUIEN}' and not exists (select 1 from casos_notas n where n.caso_id = c.id and n.clase = 'apertura')
union all select 91, 'preguntar al presentarse marcados', count(*), count(*) = ${lote.filter((c) => c.preguntar).length} from casos where creado_por = '${QUIEN}' and preguntar_al_presentarse
order by 1;

-- ROLLBACK (comentado): borra solo los casos de esta carga (sus notas se van en cascada).
-- begin;
-- delete from casos where creado_por = '${QUIEN}';
-- commit;
`;
const salida = path.join(F.DATOS, `casos-iniciales-${dia}.sql`);
fs.writeFileSync(salida, sql);
console.log(`${lote.length} casos · ${JSON.stringify(porTipo)} · ligados a expediente: se resuelve en la base · escrito ${path.relative(process.cwd(), salida)} (${(sql.length / 1024).toFixed(0)} KB, ${sql.split("\n").length} lineas)`);
