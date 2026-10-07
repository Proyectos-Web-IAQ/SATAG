// SQL de DATOS de los casos (despues del bloque 90 y de publicar el tablero).
//
// Lo que hace el SQL que genera, en una transaccion, con respaldo y verificacion:
//   A. Liga cada «TAG sin uso» al expediente vivo del TAG que la persona SI usa
//      (la carga del 6-oct los guardo solo con el numero de TAG, y el tablero no
//      los agrupaba con la persona: caso de Miguel Angel, 7-oct).
//   B. Pasa los «TAG sin uso» abiertos a Esperando con fecha POR TAG (Gerardo,
//      7-oct): su ultimo paso conocido —el de la depuracion o el de la bitacora
//      guardada, el mas reciente— o el 7-jul si nunca paso, mas 6 meses.
//   C. Pasa los «preguntar al presentarse» abiertos a Esperando a la persona.
//   D. Marca urgentes los casos cuya prioridad dice «1 URGENTE», salvo los TAGs
//      que se pasen en --no-urgente (pista sin confirmar).
//   E. Quita de los textos de los casos el nombre de quien «aplica» o «da el
//      visto bueno» (no se asume responsable; Gerardo, 7-oct).
//   F. Carga los casos «La salida no lee el TAG» de salida-no-lee-<dia>.json, en Nuevo.
//   G. Corrige nombres de expedientes de correcciones-nombre.csv (dictados por
//      Gerardo), con su movimiento de rectificacion.
//
//   node Campo/herramientas/sql-datos-casos.mjs --datos Campo/datos/2026-10-07 --salida Campo/datos/2026-10-06/salida-no-lee-2026-10-06.json [--no-urgente 9727324]
//
// Escribe <datos>/datos-casos-<dia>.sql. A la consola solo salen conteos.
import fs from "node:fs";
import path from "node:path";

const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };
const dir = arg("--datos");
const salida = arg("--salida");
if (!dir || !salida) throw new Error("Uso: node Campo/herramientas/sql-datos-casos.mjs --datos <dir> --salida <salida-no-lee.json> [--no-urgente TAG,TAG]");
const dia = path.basename(dir);
const noUrgente = (arg("--no-urgente") ?? "").split(",").filter((t) => /^\d{4,12}$/.test(t));
const QUIEN = `datos-${dia}`;
const sqlTxt = (s) => `'${String(s).replace(/'/g, "''")}'`;

// F. Los casos de «la salida no lee».
const snl = JSON.parse(fs.readFileSync(salida, "utf8"));
const casosSnl = snl.tarjetas.map((t) => ({
  tarjeta: t.tarjeta,
  clave: `salida-no-lee:${t.tarjeta}:${t.lote}`,
  titulo: `${t.lector} no lee este TAG: ${t.proporcion} % de sus estancias quedan incompletas`,
  detalle: `Detectado con Campo/herramientas/salida-no-lee.mjs sobre la bitacora ${snl.ventana} (sin los dias ${snl.excluidos.join(", ")}). Revisar la colocacion del TAG o la antena de ese lector.`,
  evidencia: { ventana: snl.ventana, lote: t.lote, lector: t.lector, estancias: t.estancias, sinSalida: t.sinSalida, sinEntrada: t.sinEntrada, diasConFalla: t.diasConFalla, ultimoPaso: t.ultimoPaso },
}));

// G. Correcciones de nombre dictadas: folio,nombres,paterno,materno,antes_paterno,antes_materno,nota
const csv = path.join(dir, "correcciones-nombre.csv");
const nombres = fs.existsSync(csv)
  ? fs.readFileSync(csv, "utf8").split(/\r?\n/).slice(1).filter(Boolean).map((l) => {
      const [folio, n, p, m, ap, am, nota] = l.split(",");
      return { folio, n, p, m, ap, am: am ?? "", nota: nota ?? "" };
    })
  : [];

const sql = `-- =====================================================================
-- DATOS DE CASOS del ${dia} (despues del bloque 90 y del tablero publicado).
-- Generado por Campo/herramientas/sql-datos-casos.mjs. NO es un bloque: son
-- datos, con respaldo propio. Una sola transaccion: si algo falla, no queda nada.
--
--   A. «TAG sin uso» ligados al expediente del TAG que si usan.
--   B. «TAG sin uso» abiertos -> Esperando, fecha POR TAG (ultimo paso o 7-jul, + 6 meses).
--   C. «Preguntar al presentarse» abiertos -> Esperando a la persona.
--   D. Urgentes los de prioridad «1 URGENTE»${noUrgente.length ? ` (salvo ${noUrgente.length} TAG sin confirmar)` : ""}.
--   E. Textos sin el nombre de quien aplica o da el visto bueno.
--   F. ${casosSnl.length} casos «La salida no lee el TAG», en Nuevo.
--   G. ${nombres.length} nombre(s) de expediente corregido(s), con movimiento de rectificacion.
-- Al final, la verificacion: todas las filas con ok = true. Rollback comentado al pie.
-- =====================================================================
begin;

set local request.jwt.claims = '{"aal":"aal2","app_metadata":{"rol":"ti"},"email":"${QUIEN}"}';

do $guardia$
begin
    if to_regclass('public.casos_familias') is null then
        raise exception 'Falta el bloque 90. No se aplico nada.';
    end if;
    if to_regclass('public._respaldo_casos_${dia.replace(/-/g, "")}') is not null then
        raise exception 'Este SQL ya se aplico (existe su respaldo). No se aplico nada.';
    end if;
end;
$guardia$;

-- Respaldo de lo que se toca (rollback). Fuera de la API: RLS y sin privilegios.
create table _respaldo_casos_${dia.replace(/-/g, "")} as
    select id, estado, espera_motivo, espera_hasta, espera_texto, urgente, registro_id, titulo, detalle
      from casos;
create table _respaldo_nombres_${dia.replace(/-/g, "")} as
    select id, folio, usuario_nombres, usuario_apellido_paterno, usuario_apellido_materno
      from registros where folio in (${nombres.map((x) => sqlTxt(x.folio)).join(", ") || "''"});
alter table _respaldo_casos_${dia.replace(/-/g, "")} enable row level security;
alter table _respaldo_nombres_${dia.replace(/-/g, "")} enable row level security;
revoke all on table _respaldo_casos_${dia.replace(/-/g, "")}, _respaldo_nombres_${dia.replace(/-/g, "")} from anon, authenticated, public;

-- A. Ligar «TAG sin uso» al expediente vivo del TAG que si usa.
with liga as (
    select distinct on (c.id) c.id, r.id as registro, r.folio
      from casos c
      join registros r on r.no_dispositivo = c.evidencia ->> 'tagQueSiUsa' and r.estado <> 'baja'
     where c.tipo = 'tag-sin-uso' and c.registro_id is null
     order by c.id, r.created_at desc
), hecho as (
    update casos c set registro_id = l.registro, actualizado_en = now() from liga l where c.id = l.id returning c.id, l.folio
)
insert into casos_notas (caso_id, clase, estado_antes, estado_despues, nota, hecho_por)
select h.id, 'nota', c.estado, c.estado, 'Ligado al expediente ' || h.folio || ' (el del TAG que la persona si usa).', '${QUIEN}'
  from hecho h join casos c on c.id = h.id;

-- B. «TAG sin uso» abiertos -> Esperando, fecha por TAG.
with ult as (
    select c.id, c.estado,
           greatest(
               date '2026-07-07',
               case when c.evidencia ->> 'ultimoPaso' ~ '^\\d{4}-\\d{2}-\\d{2}' then (c.evidencia ->> 'ultimoPaso')::date end,
               (select max(e.ocurrio_en)::date from zk_eventos e where e.tarjeta = c.tarjeta and e.concedido and not e.repeticion)
           ) as ultimo
      from casos c
     where c.tipo = 'tag-sin-uso' and c.estado = 'abierto'
), hecho as (
    update casos c
       set estado = 'esperando', espera_motivo = 'fecha', espera_hasta = (u.ultimo + interval '6 months')::date,
           espera_texto = null, atorado = false, actualizado_en = now()
      from ult u
     where c.id = u.id and (u.ultimo + interval '6 months')::date > (now() at time zone 'America/Mexico_City')::date
    returning c.id, u.ultimo, c.espera_hasta
)
insert into casos_notas (caso_id, clase, estado_antes, estado_despues, nota, hecho_por)
select id, 'estado', 'abierto', 'esperando',
       'Esperando hasta el ' || to_char(espera_hasta, 'DD/MM/YYYY') || ': 6 meses desde su ultimo paso conocido (' ||
       case when ultimo = date '2026-07-07' then 'ninguno desde el 7-jul, inicio de la historia de ZK' else to_char(ultimo, 'DD/MM/YYYY') end ||
       '). Si vuelve a abrir antes, el caso se cierra; si no, queda listo para baja.', '${QUIEN}'
  from hecho;

-- C. «Preguntar al presentarse» abiertos -> Esperando a la persona.
with hecho as (
    update casos set estado = 'esperando', espera_motivo = 'persona', espera_hasta = null, espera_texto = null,
                     atorado = false, actualizado_en = now()
     where estado = 'abierto' and (tipo = 'preguntar' or preguntar_al_presentarse)
    returning id
)
insert into casos_notas (caso_id, clase, estado_antes, estado_despues, nota, hecho_por)
select id, 'estado', 'abierto', 'esperando', 'Esperando a que la persona se presente.', '${QUIEN}' from hecho;

-- D. Urgentes.
with hecho as (
    update casos set urgente = true, actualizado_en = now()
     where evidencia ->> 'prioridad' like '1 URGENTE%' and not urgente
       and estado not in ('resuelto', 'descartado')
       and tarjeta not in (${noUrgente.map(sqlTxt).join(", ") || "''"})
    returning id, estado
)
insert into casos_notas (caso_id, clase, estado_antes, estado_despues, nota, hecho_por)
select id, 'marca', estado, estado, 'Marcado urgente (la depuracion del 6-oct lo dejo con prioridad «1 URGENTE»).', '${QUIEN}' from hecho;

-- E. Textos sin nombres de quien aplica o da el visto bueno.
update casos
   set detalle = replace(replace(detalle, ' Lo aplica Gerardo con el visto bueno de Lidia; cerrar el caso al aplicarlo', ' Se aplica en ZK; cerrar el caso al aplicarlo'), 'TI (Lidia)', 'TI'),
       titulo  = replace(titulo, 'TI (Lidia)', 'TI')
 where detalle like '%visto bueno de Lidia%' or detalle like '%TI (Lidia)%' or titulo like '%TI (Lidia)%';

-- F. «La salida no lee el TAG», en Nuevo. Con clave: repetir no duplica.
do $salida$
declare
    c jsonb;
    v jsonb;
    v_reg uuid;
begin
    for c in select value from jsonb_array_elements(${sqlTxt(JSON.stringify(casosSnl))}::jsonb) loop
        select id into v_reg from registros where no_dispositivo = c ->> 'tarjeta' and estado <> 'baja' order by created_at desc limit 1;
        v := abrir_caso('salida-no-lee', c ->> 'titulo', c ->> 'detalle', v_reg, c ->> 'tarjeta', c -> 'evidencia',
                        false, c ->> 'clave', 'regla', 'salida-no-lee.mjs@${dia}', '${QUIEN}');
        if not (v ->> 'yaExistia')::boolean then
            update casos set estado = 'nuevo' where id = (v ->> 'id')::uuid;
            update casos_notas set estado_despues = 'nuevo' where caso_id = (v ->> 'id')::uuid and clase = 'apertura';
        end if;
    end loop;
end;
$salida$;

-- G. Nombres corregidos (solo si el expediente sigue como estaba).
${nombres.map((x) => `with hecho as (
    update registros set usuario_nombres = ${sqlTxt(x.n)}, usuario_apellido_paterno = ${sqlTxt(x.p)}, usuario_apellido_materno = ${sqlTxt(x.m)}
     where folio = ${sqlTxt(x.folio)} and usuario_apellido_paterno = ${sqlTxt(x.ap)} and coalesce(usuario_apellido_materno, '') = ${sqlTxt(x.am)}
    returning id
)
insert into movimientos (registro_id, tipo, motivo, hecho_por)
select id, 'rectificacion', ${sqlTxt(`Nombre corregido: ${x.ap}${x.am ? " " + x.am : ""} -> ${x.p} ${x.m}. ${x.nota}`)}, '${QUIEN}' from hecho;`).join("\n")}

commit;

-- ---------------------------------------------------------------------
-- VERIFICACION (solo lectura). Todas las filas con ok = true.
-- ---------------------------------------------------------------------
select 1 as orden, 'ningun «TAG sin uso» abierto queda sin decidir' as que,
       (select count(*) from casos where tipo = 'tag-sin-uso' and estado = 'abierto') = 0 as ok
union all
select 2, '«TAG sin uso» esperando con fecha posterior al 6-ene-2027 (7-jul + 6 meses)',
       not exists (select 1 from casos where tipo = 'tag-sin-uso' and estado = 'esperando' and (espera_motivo <> 'fecha' or espera_hasta < date '2027-01-07'))
union all
select 3, '«TAG sin uso» ligados a expediente (los que tienen TAG que si usa con expediente vivo)',
       not exists (select 1 from casos c join registros r on r.no_dispositivo = c.evidencia ->> 'tagQueSiUsa' and r.estado <> 'baja'
                    where c.tipo = 'tag-sin-uso' and c.registro_id is null)
union all
select 4, 'ningun «preguntar» abierto: todos esperan a la persona',
       not exists (select 1 from casos where estado = 'abierto' and (tipo = 'preguntar' or preguntar_al_presentarse))
union all
select 5, 'urgentes marcados${noUrgente.length ? " (salvo el TAG sin confirmar)" : ""}',
       not exists (select 1 from casos where evidencia ->> 'prioridad' like '1 URGENTE%' and not urgente
                    and estado not in ('resuelto', 'descartado') and tarjeta not in (${noUrgente.map(sqlTxt).join(", ") || "''"}))
union all
select 6, 'ningun texto de caso nombra a quien aplica o da el visto bueno',
       not exists (select 1 from casos where detalle like '%visto bueno de Lidia%' or detalle like '%TI (Lidia)%' or titulo like '%TI (Lidia)%')
union all
select 7, '${casosSnl.length} casos «La salida no lee el TAG»',
       (select count(*) from casos where tipo = 'salida-no-lee' and clave like 'salida-no-lee:%') = ${casosSnl.length}
union all
select 8, 'nombres corregidos con su rectificacion',
       (select count(*) from movimientos where hecho_por = '${QUIEN}' and tipo = 'rectificacion') = ${nombres.length}
union all
select 9, 'respaldos fuera de la API',
       not has_table_privilege('anon', '_respaldo_casos_${dia.replace(/-/g, "")}', 'SELECT')
       and not has_table_privilege('authenticated', '_respaldo_casos_${dia.replace(/-/g, "")}', 'SELECT')
order by orden;

-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). Deja los casos y los nombres como estaban antes.
--
--   begin;
--   delete from casos where tipo = 'salida-no-lee' and creado_por = '${QUIEN}';
--   update casos c set estado = r.estado, espera_motivo = r.espera_motivo, espera_hasta = r.espera_hasta,
--                      espera_texto = r.espera_texto, urgente = r.urgente, registro_id = r.registro_id,
--                      titulo = r.titulo, detalle = r.detalle
--     from _respaldo_casos_${dia.replace(/-/g, "")} r where r.id = c.id;
--   delete from casos_notas where hecho_por = '${QUIEN}';
--   update registros g set usuario_nombres = r.usuario_nombres, usuario_apellido_paterno = r.usuario_apellido_paterno,
--                          usuario_apellido_materno = r.usuario_apellido_materno
--     from _respaldo_nombres_${dia.replace(/-/g, "")} r where r.id = g.id;
--   delete from movimientos where hecho_por = '${QUIEN}' and tipo = 'rectificacion';
--   drop table _respaldo_casos_${dia.replace(/-/g, "")};
--   drop table _respaldo_nombres_${dia.replace(/-/g, "")};
--   commit;
`;

const out = path.join(dir, `datos-casos-${dia}.sql`);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(out, sql.replace(/\r?\n/g, "\r\n"));
console.log(`Casos «salida no lee»: ${casosSnl.length}; nombres a corregir: ${nombres.length}; TAGs sin urgente: ${noUrgente.length}.`);
console.log(`Escrito: ${out}`);
