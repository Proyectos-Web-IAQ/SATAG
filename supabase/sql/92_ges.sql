-- =====================================================================
-- BLOQUE 92 — GES en SATAG: quien es la persona y si sigue en el colegio.
--
-- SC-032 · 08/10/2026
--
-- POR QUE
--   La regla acordada (Gerardo, 6 y 7-oct): QUIEN TIENE UN TAG LO DICE ZK;
--   QUIEN ES LA PERSONA, COMO SE LLAMA Y SI SIGUE EN EL COLEGIO LO DICE GES.
--   Hasta hoy GES vivia solo en Campo/datos, en exports con 47 columnas
--   (telefonos, domicilios, CURP, nombres de 1,095 menores) de las que SATAG
--   usa cinco. Aqui entra a la base lo indispensable, y nada mas.
--
-- QUE SE GUARDA, Y QUE NO
--   Por persona de GES: su nombre tal como GES lo escribe, la familia, si es
--   papa o mama, los GRUPOS de los hijos (no sus nombres), y del personal su
--   area, cargo, si esta activo y la fecha de baja. De los alumnos, SOLO los de
--   Preparatoria (grupo numerico: 101, 301, 501...), que son los unicos que
--   pueden tener TAG; la tabla lo exige con un CHECK, no solo el cliente. No se
--   guardan telefonos, correos, domicilios, CURP, fechas de nacimiento ni nada
--   que GES traiga de mas: la pantalla de carga rechaza el archivo que los
--   traiga y muestra la consulta reducida para copiarla.
--
--   El aviso de privacidad v8 cubre este uso: «confirmar que quien la presenta
--   pertenece a la comunidad escolar», «gestionar ... la baja o la inactivacion
--   del dispositivo» y «el control interno del sistema» (SATAG, finalidades);
--   el cotejo «contra la lista de inscritos» (apellidos de la familia) y que
--   el personal «acredita su pertenencia por su propia relacion con el
--   Instituto». No se recaba ninguna categoria nueva: son nombres.
--
-- LAS DECISIONES DE TI
--   `ges_identidades`: una fila por TAG con lo que TI decidio de su dueno
--   (es tal persona de GES, es familiar no tutor de tal familia, no esta en
--   GES, o esta por confirmar), el nombre correcto y la marca «preguntar al
--   presentarse». Manda sobre lo que el cruce por nombre calcule: es lo que
--   hoy vive en decisiones-nombres.csv y decisiones-personas.csv.
--
-- QUE HACE, EN ORDEN
--   0. Guardia: panel_exigir_rol existe y el 92 no esta aplicado.
--   1. Tablas `ges_cargas`, `ges_personas` y `ges_identidades`.
--   2. RLS de lectura para ti, contador, admin y super con MFA (Gerardo,
--      8-oct: Administracion tambien ve la identificacion). Escritura solo por
--      los RPC. anon fuera.
--   3. RPC `cargar_ges(fuente, meta, filas, hecho_por)` (ti): escribe solo lo
--      que cambia y marca como no vigente a quien ya no viene en SU fuente.
--      Con el freno del 84: si dejaria fuera a mas de 20 personas y a mas del
--      20 % de las vigentes de esa fuente, o si el ciclo es anterior al ya
--      cargado, no escribe y pide confirmar (`forzar` en meta).
--   4. RPC `decidir_identidad_ges(...)` (ti): guarda, cambia o quita la
--      decision de un TAG.
--   5. Verificacion de solo lectura: filas con ok = true.
--
-- Este bloque solo AGREGA: va ANTES del deploy del cliente.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. GUARDIA
-- ---------------------------------------------------------------------
do $guardia$
begin
    if to_regprocedure('public.panel_exigir_rol(text[])') is null then
        raise exception 'Falta panel_exigir_rol (bloques 29 y 49). No se aplico nada.';
    end if;
    if to_regclass('public.ges_personas') is not null
       or exists (select 1 from pg_proc where proname in ('cargar_ges', 'decidir_identidad_ges')) then
        raise exception 'El bloque 92 ya esta aplicado (existe ges_personas o sus RPC). No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. LAS TABLAS
-- ---------------------------------------------------------------------
create table ges_cargas (
    id            uuid primary key default gen_random_uuid(),
    -- familias: la consulta de familias activas; personal: la de profesores;
    -- empleados: la de la tabla de empleados sin los docentes (administrativos,
    -- mantenimiento e intendencia).
    fuente        text not null,
    archivo       text not null,
    sha256        text not null unique,
    filas_archivo integer not null,
    personas      integer not null,
    -- El ciclo escolar del export de familias (2026 = 2026-27). Nulo en las demas.
    ciclo         integer,
    cargado_por   text not null,
    cargado_en    timestamptz not null default now(),
    constraint ges_carga_fuente     check (fuente in ('familias', 'personal', 'empleados')),
    constraint ges_carga_archivo    check (btrim(archivo) <> ''),
    constraint ges_carga_sha        check (sha256 ~ '^[0-9a-f]{64}$'),
    constraint ges_carga_ciclo      check (ciclo is null or ciclo between 2020 and 2100)
);

create table ges_personas (
    -- Llave estable entre exports: F-<familia>-padre, F-<familia>-madre,
    -- A-<matricula>, D-<clave de profesor>, E-<numero de empleado>.
    ges_id         text primary key,
    fuente         text not null,
    clase          text not null,
    nombre         text not null,
    familia        text not null default '',
    rol            text not null default '',
    grupos         text[] not null default '{}',
    area           text not null default '',
    cargo          text not null default '',
    -- Lo que GES dice: familias activas del ciclo, personal con estatus A.
    activo         boolean not null,
    fecha_baja     date,
    -- false cuando dejo de venir en la ultima carga de su fuente. No se borra:
    -- las decisiones y los casos viejos siguen apuntando a ella.
    vigente        boolean not null default true,
    carga_id       uuid not null references ges_cargas(id),
    actualizado_en timestamptz not null default now(),
    constraint ges_persona_fuente check (fuente in ('familias', 'personal', 'empleados')),
    constraint ges_persona_clase  check (
        (fuente = 'familias'  and clase in ('tutor', 'alumno'))
        or (fuente = 'personal'  and clase = 'docente')
        or (fuente = 'empleados' and clase = 'empleado')
    ),
    constraint ges_persona_id check (
        (clase = 'tutor'    and ges_id ~ '^F-[0-9A-Za-z]+-(padre|madre)$')
        or (clase = 'alumno'   and ges_id ~ '^A-[0-9A-Za-z._-]+$')
        or (clase = 'docente'  and ges_id ~ '^D-[0-9A-Za-z._-]+$')
        or (clase = 'empleado' and ges_id ~ '^E-[0-9A-Za-z._-]+$')
    ),
    constraint ges_persona_nombre check (btrim(nombre) <> ''),
    constraint ges_persona_rol    check ((clase = 'tutor') = (rol in ('padre', 'madre'))),
    -- De los alumnos, SOLO Preparatoria: un grupo, y numerico. Es lo que el
    -- cliente manda, pero la base no se fia del cliente.
    constraint ges_alumno_solo_prepa check (
        clase <> 'alumno' or (cardinality(grupos) = 1 and grupos[1] ~ '^[0-9]+$')
    )
);

create index ix_ges_personas_vigente on ges_personas (fuente) where vigente;
create index ix_ges_personas_familia on ges_personas (familia) where familia <> '';

create table ges_identidades (
    tarjeta      text primary key,
    -- persona: el TAG es de esa persona de GES. familiar: familiar no tutor
    -- (abuelo, tio) de esa familia. no_localizado: no esta en GES.
    -- por_confirmar: hay pista, falta confirmarlo con la persona.
    veredicto    text not null,
    ges_id       text references ges_personas(ges_id),
    familia      text not null default '',
    nombre       text not null default '',
    preguntar    boolean not null default false,
    nota         text not null default '',
    decidido_por text not null,
    decidido_en  timestamptz not null default now(),
    constraint ges_ident_tarjeta   check (tarjeta ~ '^[0-9]+$'),
    constraint ges_ident_veredicto check (veredicto in ('persona', 'familiar', 'no_localizado', 'por_confirmar')),
    constraint ges_ident_persona   check (veredicto <> 'persona' or ges_id is not null),
    constraint ges_ident_familiar  check (veredicto <> 'familiar' or familia <> ''),
    constraint ges_ident_sin_ges   check (veredicto <> 'no_localizado' or (ges_id is null and familia = ''))
);

comment on table ges_cargas      is 'Un renglon por archivo de GES cargado (bloque 92).';
comment on table ges_personas    is 'Quien es quien segun GES: nombre, familia, grupos, puesto y si sigue. Sin telefonos, domicilios ni CURP; alumnos solo de Prepa. PII: lectura con MFA.';
comment on table ges_identidades is 'Lo que TI decidio del dueno de cada TAG. Manda sobre el cruce por nombre (bloque 92).';


-- ---------------------------------------------------------------------
-- 2. RLS Y PRIVILEGIOS
-- ---------------------------------------------------------------------
alter table ges_cargas      enable row level security;
alter table ges_personas    enable row level security;
alter table ges_identidades enable row level security;

create policy ges_cargas_lectura on ges_cargas for select to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2'
           and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'contador', 'admin', 'super'));
create policy ges_personas_lectura on ges_personas for select to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2'
           and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'contador', 'admin', 'super'));
create policy ges_identidades_lectura on ges_identidades for select to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2'
           and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'contador', 'admin', 'super'));

revoke all on table ges_cargas, ges_personas, ges_identidades from anon, public;
revoke insert, update, delete, truncate, references, trigger on table ges_cargas, ges_personas, ges_identidades from authenticated;
grant  select on table ges_cargas, ges_personas, ges_identidades to authenticated;


-- ---------------------------------------------------------------------
-- 3. LA CARGA
--
-- El cliente lee el archivo, rechaza el que traiga columnas de mas, y manda una
-- fila por PERSONA (el papa con tres hijos llega una vez, con los tres grupos).
-- Aqui se valida, se frena si hace falta y se escribe solo lo que cambia.
-- ---------------------------------------------------------------------
create function cargar_ges(
    p_fuente    text,
    p_meta      jsonb,
    p_filas     jsonb,
    p_hecho_por text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $carga$
declare
    v_quien      text;
    v_sha        text;
    v_forzar     boolean;
    v_ciclo      int;
    v_ult_ciclo  int;
    v_carga      uuid;
    v_vigentes   int;
    v_retiraria  int;
    v_malas      int;
    v_motivos    text[] := array[]::text[];
    v_ins        int := 0;
    v_act        int := 0;
    v_ret        int := 0;
    v_vig        int;
begin
    perform panel_exigir_rol(array['ti']);

    if p_fuente is null or p_fuente not in ('familias', 'personal', 'empleados') then
        raise exception 'No se reconoce el archivo de GES. Elija el de familias, el de personal o el de empleados.';
    end if;
    if p_meta is null or jsonb_typeof(p_meta) <> 'object' then
        raise exception 'Falta la informacion del archivo. Vuelva a elegirlo y reintente.';
    end if;
    if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
        raise exception 'El archivo de GES no trae personas. Verifique que sea el export de la consulta reducida.';
    end if;

    v_sha := lower(btrim(coalesce(p_meta ->> 'sha256', '')));
    if v_sha !~ '^[0-9a-f]{64}$' then
        raise exception 'El archivo no trae una huella valida. Vuelva a elegirlo y reintente.';
    end if;

    v_quien  := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');
    v_forzar := coalesce((p_meta ->> 'forzar')::boolean, false);
    v_ciclo  := nullif(p_meta ->> 'ciclo', '')::int;
    if p_fuente = 'familias' and v_ciclo is null then
        raise exception 'El archivo de familias no dice de que ciclo es. Exporte con la consulta reducida, que trae la columna INICIAL.';
    end if;

    if to_regclass('pg_temp.tmp_ges') is not null then
        drop table pg_temp.tmp_ges;
    end if;
    create temp table tmp_ges (
        ges_id text primary key, clase text, nombre text, familia text, rol text,
        grupos text[], area text, cargo text, activo boolean, fecha_baja date
    ) on commit drop;

    insert into tmp_ges
    select distinct on (ges_id) *
      from (
        select btrim(coalesce(f ->> 'gesId', ''))                    as ges_id,
               btrim(coalesce(f ->> 'clase', ''))                    as clase,
               left(btrim(coalesce(f ->> 'nombre', '')), 200)        as nombre,
               left(btrim(coalesce(f ->> 'familia', '')), 40)        as familia,
               btrim(coalesce(f ->> 'rol', ''))                      as rol,
               coalesce(array(select left(btrim(g), 20) from jsonb_array_elements_text(
                   case when jsonb_typeof(f -> 'grupos') = 'array' then f -> 'grupos' else '[]'::jsonb end) g
                   where btrim(g) <> '' order by 1), '{}')          as grupos,
               left(btrim(coalesce(f ->> 'area', '')), 120)          as area,
               left(btrim(coalesce(f ->> 'cargo', '')), 120)         as cargo,
               coalesce((f ->> 'activo')::boolean, true)             as activo,
               nullif(f ->> 'fechaBaja', '')::date                   as fecha_baja
          from jsonb_array_elements(p_filas) f
      ) x
     where ges_id <> ''
     order by ges_id;

    -- Que cada fila sea de la fuente que dice ser. Lo demas lo vuelven a
    -- revisar los CHECK de la tabla, pero aqui se dice en palabras.
    select count(*) into v_malas
      from tmp_ges t
     where not (
           (p_fuente = 'familias'  and t.clase in ('tutor', 'alumno'))
        or (p_fuente = 'personal'  and t.clase = 'docente')
        or (p_fuente = 'empleados' and t.clase = 'empleado'));
    if v_malas > 0 then
        raise exception 'El archivo trae % filas que no son de %. Verifique que eligio el archivo correcto.', v_malas, p_fuente;
    end if;
    select count(*) into v_malas
      from tmp_ges t
     where t.clase = 'alumno' and not (cardinality(t.grupos) = 1 and t.grupos[1] ~ '^[0-9]+$');
    if v_malas > 0 then
        raise exception 'El archivo trae % alumnos que no son de Preparatoria. SATAG solo guarda a los de Preparatoria: exporte con la consulta reducida.', v_malas;
    end if;

    -- EL FRENO, antes de escribir nada.
    select count(*) into v_vigentes from ges_personas where vigente and fuente = p_fuente;
    select count(*) into v_retiraria
      from ges_personas g
     where g.vigente and g.fuente = p_fuente
       and not exists (select 1 from tmp_ges t where t.ges_id = g.ges_id);
    if v_vigentes > 0 and v_retiraria > 20 and v_retiraria * 5 > v_vigentes then
        v_motivos := array_append(v_motivos, 'retira_muchos');
    end if;
    if p_fuente = 'familias' then
        select max(ciclo) into v_ult_ciclo from ges_cargas where fuente = 'familias';
        if v_ult_ciclo is not null and v_ciclo < v_ult_ciclo then
            v_motivos := array_append(v_motivos, 'ciclo_anterior');
        end if;
    end if;

    if cardinality(v_motivos) > 0 and not v_forzar then
        return jsonb_build_object(
            'requiereConfirmacion', true,
            'motivos',     to_jsonb(v_motivos),
            'retiraria',   v_retiraria,
            'vigentes',    v_vigentes,
            'ciclo',       v_ciclo,
            'ultimoCiclo', v_ult_ciclo
        );
    end if;

    insert into ges_cargas (fuente, archivo, sha256, filas_archivo, personas, ciclo, cargado_por)
    values (
        p_fuente,
        coalesce(nullif(btrim(p_meta ->> 'archivo'), ''), 'sin nombre'),
        v_sha,
        coalesce((p_meta ->> 'filasArchivo')::int, 0),
        (select count(*) from tmp_ges),
        v_ciclo,
        v_quien
    )
    on conflict (sha256) do update
       set cargado_en = now(), cargado_por = excluded.cargado_por, personas = excluded.personas
    returning id into v_carga;

    -- SOLO LO QUE CAMBIA. `xmax = 0` distingue insercion de actualizacion.
    with escritas as (
        insert into ges_personas as g (ges_id, fuente, clase, nombre, familia, rol, grupos, area, cargo,
                                       activo, fecha_baja, vigente, carga_id, actualizado_en)
        select t.ges_id, p_fuente, t.clase, t.nombre, t.familia, t.rol, t.grupos, t.area, t.cargo,
               t.activo, t.fecha_baja, true, v_carga, now()
          from tmp_ges t
        on conflict (ges_id) do update
           set clase = excluded.clase, nombre = excluded.nombre, familia = excluded.familia,
               rol = excluded.rol, grupos = excluded.grupos, area = excluded.area,
               cargo = excluded.cargo, activo = excluded.activo, fecha_baja = excluded.fecha_baja,
               vigente = true, carga_id = excluded.carga_id, actualizado_en = now()
         where (g.clase, g.nombre, g.familia, g.rol, g.grupos, g.area, g.cargo, g.activo, g.fecha_baja, g.vigente)
               is distinct from
               (excluded.clase, excluded.nombre, excluded.familia, excluded.rol, excluded.grupos,
                excluded.area, excluded.cargo, excluded.activo, excluded.fecha_baja, true)
        returning (xmax = 0) as nueva
    )
    select count(*) filter (where nueva), count(*) filter (where not nueva)
      into v_ins, v_act
      from escritas;

    update ges_personas g
       set vigente = false, actualizado_en = now()
     where g.vigente and g.fuente = p_fuente
       and not exists (select 1 from tmp_ges t where t.ges_id = g.ges_id);
    get diagnostics v_ret = row_count;

    select count(*) into v_vig from ges_personas where vigente and fuente = p_fuente;

    return jsonb_build_object(
        'cargaId', v_carga,
        'yaEstaba', (v_ins + v_act + v_ret) = 0,
        'insertadas', v_ins, 'actualizadas', v_act, 'retiradas', v_ret, 'vigentes', v_vig
    );
end;
$carga$;

revoke all     on function cargar_ges(text, jsonb, jsonb, text) from public, anon;
grant  execute on function cargar_ges(text, jsonb, jsonb, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. LA DECISION DE TI SOBRE UN TAG
--
-- `p_veredicto` nulo QUITA la decision: el TAG vuelve a identificarse solo por
-- el cruce de nombres.
-- ---------------------------------------------------------------------
create function decidir_identidad_ges(
    p_tarjeta   text,
    p_veredicto text,
    p_ges_id    text default null,
    p_familia   text default null,
    p_nombre    text default null,
    p_preguntar boolean default false,
    p_nota      text default null,
    p_hecho_por text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $decidir$
declare
    v_quien   text;
    v_tarjeta text := btrim(coalesce(p_tarjeta, ''));
    v_ges_id  text := nullif(btrim(coalesce(p_ges_id, '')), '');
    v_familia text := btrim(coalesce(p_familia, ''));
    v_borradas int;
begin
    perform panel_exigir_rol(array['ti']);
    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    if v_tarjeta !~ '^[0-9]+$' then
        raise exception 'El numero de TAG no es valido.';
    end if;

    if p_veredicto is null then
        delete from ges_identidades where tarjeta = v_tarjeta;
        get diagnostics v_borradas = row_count;
        return jsonb_build_object('tarjeta', v_tarjeta, 'quitada', v_borradas > 0);
    end if;

    if p_veredicto not in ('persona', 'familiar', 'no_localizado', 'por_confirmar') then
        raise exception 'No se reconoce la decision «%».', p_veredicto;
    end if;
    if p_veredicto = 'persona' and v_ges_id is null then
        raise exception 'Para decir de quien es el TAG hay que elegir a la persona de GES.';
    end if;
    if v_ges_id is not null and not exists (select 1 from ges_personas where ges_id = v_ges_id) then
        raise exception 'Esa persona ya no esta en GES. Vuelva a abrir la ficha y elijala de nuevo.';
    end if;
    if p_veredicto = 'familiar' and v_familia = '' then
        raise exception 'Para un familiar hay que indicar la familia de GES.';
    end if;
    if p_veredicto = 'no_localizado' then
        v_ges_id := null;
        v_familia := '';
    end if;

    insert into ges_identidades as i (tarjeta, veredicto, ges_id, familia, nombre, preguntar, nota, decidido_por, decidido_en)
    values (v_tarjeta, p_veredicto, v_ges_id, v_familia,
            left(btrim(coalesce(p_nombre, '')), 200), coalesce(p_preguntar, false),
            left(btrim(coalesce(p_nota, '')), 1000), v_quien, now())
    on conflict (tarjeta) do update
       set veredicto = excluded.veredicto, ges_id = excluded.ges_id, familia = excluded.familia,
           nombre = excluded.nombre, preguntar = excluded.preguntar, nota = excluded.nota,
           decidido_por = excluded.decidido_por, decidido_en = now();

    return jsonb_build_object('tarjeta', v_tarjeta, 'veredicto', p_veredicto);
end;
$decidir$;

revoke all     on function decidir_identidad_ges(text, text, text, text, text, boolean, text, text) from public, anon;
grant  execute on function decidir_identidad_ges(text, text, text, text, text, boolean, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;


-- ---------------------------------------------------------------------
-- 5. VERIFICACION (solo lectura). Ocho filas con ok = true.
-- ---------------------------------------------------------------------
select 1 as orden, 'existen ges_cargas, ges_personas y ges_identidades' as que,
       to_regclass('public.ges_cargas') is not null
       and to_regclass('public.ges_personas') is not null
       and to_regclass('public.ges_identidades') is not null as ok
union all
select 2, 'las tres tienen RLS',
       (select count(*) = 3 and bool_and(relrowsecurity) from pg_class
         where relnamespace = 'public'::regnamespace and relname in ('ges_cargas', 'ges_personas', 'ges_identidades'))
union all
select 3, 'anon no las lee ni las escribe',
       not has_table_privilege('anon', 'ges_personas', 'SELECT')
       and not has_table_privilege('anon', 'ges_personas', 'INSERT')
       and not has_table_privilege('anon', 'ges_cargas', 'SELECT')
       and not has_table_privilege('anon', 'ges_identidades', 'SELECT')
union all
select 4, 'authenticated solo lee (la RLS decide quien)',
       has_table_privilege('authenticated', 'ges_personas', 'SELECT')
       and not has_table_privilege('authenticated', 'ges_personas', 'INSERT')
       and not has_table_privilege('authenticated', 'ges_personas', 'UPDATE')
       and not has_table_privilege('authenticated', 'ges_identidades', 'INSERT')
       and not has_table_privilege('authenticated', 'ges_identidades', 'DELETE')
union all
select 5, 'una politica de lectura por tabla, con admin incluido',
       (select count(*) from pg_policies
         where tablename in ('ges_cargas', 'ges_personas', 'ges_identidades') and cmd = 'SELECT'
           and qual like '%admin%' and qual like '%aal2%') = 3
union all
select 6, 'la tabla no admite alumnos fuera de Preparatoria',
       exists (select 1 from pg_constraint where conname = 'ges_alumno_solo_prepa')
union all
select 7, 'los dos RPC existen, son security definer y anon no los ejecuta',
       (select count(*) from pg_proc where proname in ('cargar_ges', 'decidir_identidad_ges') and prosecdef) = 2
       and not has_function_privilege('anon', 'cargar_ges(text, jsonb, jsonb, text)', 'EXECUTE')
       and not has_function_privilege('anon', 'decidir_identidad_ges(text, text, text, text, text, boolean, text, text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'cargar_ges(text, jsonb, jsonb, text)', 'EXECUTE')
union all
select 8, 'ningun mensaje tutea',
       (select bool_and(prosrc !~* '\m(tu|tus|elige|reintenta|verifica|exporta)\M') from pg_proc
         where proname in ('cargar_ges', 'decidir_identidad_ges'))
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). Deshace el bloque entero. ANTES DE NADA: revierta el
-- deploy del cliente que lee estas tablas. Se pierden las cargas de GES (se
-- vuelven a subir) y las decisiones de TI (salen de su SQL de datos).
--
--   begin;
--   drop function if exists decidir_identidad_ges(text, text, text, text, text, boolean, text, text);
--   drop function if exists cargar_ges(text, jsonb, jsonb, text);
--   drop table if exists ges_identidades;
--   drop table if exists ges_personas;
--   drop table if exists ges_cargas;
--   notify pgrst, 'reload schema';
--   commit;
-- ---------------------------------------------------------------------
