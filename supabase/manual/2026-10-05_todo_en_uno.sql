-- TODO EN UNO 05/10/2026: bloques 86 y 87 (supabase/sql/) mas el TAG externo 14273782 en el historial de SATAG-001428.
-- Sin comentarios a proposito: los bloques comentados estan en supabase/sql/86_* y 87_*.
-- Pegue TODO en una consulta nueva del SQL Editor y oprima Run. Deben salir 11 filas con ok = true.
begin;

do $guardia$
begin
    if to_regclass('public.zk_eventos') is null then
        raise exception 'Falta el bloque 78 (zk_eventos). No se aplico nada.';
    end if;
    if to_regprocedure('public.migrar_expedientes(jsonb,text)') is null then
        raise exception 'Falta el bloque 79 (migrar_expedientes). No se aplico nada.';
    end if;
    if to_regclass('public.zk_padron') is null then
        raise exception 'Falta el bloque 83 (zk_padron). No se aplico nada.';
    end if;
    if not exists (select 1 from pg_proc where proname = 'cargar_padron_zk' and prosrc like '%requiereConfirmacion%') then
        raise exception 'Falta el bloque 84 (freno de cargar_padron_zk). No se aplico nada.';
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'registros' and column_name = 'seccion_maestro') then
        raise exception 'Falta el bloque 70 (registros.seccion_maestro). No se aplico nada.';
    end if;
end; $guardia$;

alter table zk_padron
    add column if not exists nombres   text not null default '',
    add column if not exists apellidos text not null default '',
    add column if not exists placa     text not null default '';

comment on column zk_padron.nombres   is 'Columna «Nombre» del export de ZK (bloque 86). `nombre` sigue siendo los dos juntos.';
comment on column zk_padron.apellidos is 'Columna «Apellido» del export de ZK (bloque 86).';
comment on column zk_padron.placa     is 'Placa segun ZK («Placa Vehicular» o, si viene vacia, «Celular»). Bloque 86, decision del 5-oct. PII: misma RLS que registros.';

create or replace function cargar_padron_zk(
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
    v_exportado  timestamp;
    v_carga      uuid;
    v_vigentes   int;
    v_retiraria  int;
    v_ult_export timestamp;
    v_ult_sha    text;
    v_motivos    text[] := array[]::text[];
    v_ins        int := 0;
    v_act        int := 0;
    v_ret        int := 0;
    v_vig        int;
begin
    perform panel_exigir_rol(array['ti']);

    if p_meta is null or jsonb_typeof(p_meta) <> 'object' then
        raise exception 'Falta la informacion del archivo. Vuelva a elegirlo y reintente.';
    end if;
    if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
        raise exception 'El padron no trae personas. Verifique que sea el archivo «Personas» de ZK.';
    end if;

    v_sha := lower(btrim(coalesce(p_meta ->> 'sha256', '')));
    if v_sha !~ '^[0-9a-f]{64}$' then
        raise exception 'El archivo no trae una huella valida. Vuelva a elegirlo y reintente.';
    end if;

    v_quien     := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');
    v_forzar    := coalesce((p_meta ->> 'forzar')::boolean, false);
    v_exportado := nullif(p_meta ->> 'exportadoEn', '')::timestamp;

    if to_regclass('pg_temp.tmp_padron_zk') is not null then
        drop table pg_temp.tmp_padron_zk;
    end if;
    create temp table tmp_padron_zk (
        tarjeta text primary key, nombre text, departamento_id text, departamento text,
        nombres text, apellidos text, placa text
    ) on commit drop;
    insert into tmp_padron_zk (tarjeta, nombre, departamento_id, departamento, nombres, apellidos, placa)
    select distinct on (tarjeta) tarjeta, nombre, departamento_id, departamento, nombres, apellidos, placa
      from (
        select btrim(coalesce(f ->> 'tarjeta', ''))                  as tarjeta,
               left(btrim(coalesce(f ->> 'nombre', '')), 200)        as nombre,
               left(btrim(coalesce(f ->> 'departamentoId', '')), 20) as departamento_id,
               left(btrim(coalesce(f ->> 'departamento', '')), 120)  as departamento,
               left(btrim(coalesce(f ->> 'nombres', '')), 120)       as nombres,
               left(btrim(coalesce(f ->> 'apellidos', '')), 120)     as apellidos,
               left(upper(regexp_replace(coalesce(f ->> 'placa', ''), '\s', '', 'g')), 20) as placa
          from jsonb_array_elements(p_filas) f
      ) x
     where tarjeta ~ '^[0-9]+$';

    if (select count(*) from tmp_padron_zk) = 0 then
        raise exception 'Ninguna fila trae un numero de tarjeta valido. Verifique que sea el archivo «Personas» de ZK.';
    end if;

    select count(*) into v_vigentes from zk_padron where vigente;
    select count(*) into v_retiraria
      from zk_padron z
     where z.vigente and not exists (select 1 from tmp_padron_zk t where t.tarjeta = z.tarjeta);
    if v_vigentes > 0 and v_retiraria > 20 and v_retiraria * 5 > v_vigentes then
        v_motivos := array_append(v_motivos, 'retira_muchos');
    end if;

    select exportado_en, sha256 into v_ult_export, v_ult_sha
      from zk_padron_cargas order by cargado_en desc limit 1;
    if v_exportado is not null and v_ult_export is not null and v_exportado < v_ult_export and v_sha is distinct from v_ult_sha then
        v_motivos := array_append(v_motivos, 'export_anterior');
    end if;

    if cardinality(v_motivos) > 0 and not v_forzar then
        return jsonb_build_object(
            'requiereConfirmacion', true,
            'motivos',    to_jsonb(v_motivos),
            'retiraria',  v_retiraria,
            'vigentes',   v_vigentes,
            'exportadoEn', v_exportado,
            'ultimoExportadoEn', v_ult_export
        );
    end if;

    insert into zk_padron_cargas (archivo, sha256, filas_archivo, personas, exportado_en, cargado_por)
    values (
        coalesce(nullif(btrim(p_meta ->> 'archivo'), ''), 'sin nombre'),
        v_sha,
        coalesce((p_meta ->> 'filasArchivo')::int, 0),
        (select count(*) from tmp_padron_zk),
        v_exportado,
        v_quien
    )
    on conflict (sha256) do update
       set cargado_en = now(), cargado_por = excluded.cargado_por, personas = excluded.personas
    returning id into v_carga;

    with escritas as (
        insert into zk_padron as z (tarjeta, nombre, departamento_id, departamento, nombres, apellidos, placa,
                                    vigente, carga_id, actualizado_en)
        select t.tarjeta, t.nombre, t.departamento_id, t.departamento, t.nombres, t.apellidos, t.placa,
               true, v_carga, now()
          from tmp_padron_zk t
        on conflict (tarjeta) do update
           set nombre = excluded.nombre,
               departamento_id = excluded.departamento_id,
               departamento = excluded.departamento,
               nombres = excluded.nombres,
               apellidos = excluded.apellidos,
               placa = excluded.placa,
               vigente = true,
               carga_id = excluded.carga_id,
               actualizado_en = now()
         where (z.nombre, z.departamento_id, z.departamento, z.nombres, z.apellidos, z.placa, z.vigente)
               is distinct from (excluded.nombre, excluded.departamento_id, excluded.departamento,
                                 excluded.nombres, excluded.apellidos, excluded.placa, true)
        returning (xmax = 0) as nueva
    )
    select count(*) filter (where nueva), count(*) filter (where not nueva)
      into v_ins, v_act
      from escritas;

    update zk_padron z
       set vigente = false, actualizado_en = now()
     where z.vigente
       and not exists (select 1 from tmp_padron_zk t where t.tarjeta = z.tarjeta);
    get diagnostics v_ret = row_count;

    select count(*) into v_vig from zk_padron where vigente;

    return jsonb_build_object(
        'cargaId', v_carga,
        'yaEstaba', (v_ins + v_act + v_ret) = 0,
        'insertadas', v_ins, 'actualizadas', v_act, 'retiradas', v_ret, 'vigentes', v_vig
    );
end; $carga$;

revoke all    on function cargar_padron_zk(jsonb, jsonb, text) from public, anon;
grant  execute on function cargar_padron_zk(jsonb, jsonb, text) to authenticated;

create or replace function altas_desde_zk(
    p_desde     date default date '2026-09-21',
    p_hecho_por text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $altas$
declare
    v_quien text;
    v_lote  jsonb;
    v_res   jsonb;
    v_tags  text[];
begin
    perform panel_exigir_rol(array['ti']);
    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    with abiertas as (
        select e.tarjeta,
               min(e.ocurrio_en)                       as primera,
               max(e.ocurrio_en)                       as ultima,
               array_agg(distinct e.lote order by e.lote) as lotes
          from zk_eventos e
         where e.concedido and not e.repeticion
           and e.ocurrio_en >= coalesce(p_desde, date '2026-09-21')
         group by e.tarjeta
    ), candidatas as (
        select a.*, z.nombre, z.nombres, z.apellidos, z.placa, z.departamento,
               upper(translate(z.departamento, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) as depto
          from abiertas a
          join zk_padron z on z.tarjeta = a.tarjeta and z.vigente and btrim(z.nombre) <> ''
         where a.tarjeta ~ '^[0-9]{6,11}$'
           and upper(translate(z.departamento, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) not in ('BAJAS', 'STOCK SATAG')
           and not exists (select 1 from registros r
                            where r.no_dispositivo = a.tarjeta
                               or (r.tag_apartado and r.tag_apartado_no = a.tarjeta))
           and not exists (select 1 from movimientos m
                            where m.no_dispositivo_anterior = a.tarjeta or m.no_dispositivo_nuevo = a.tarjeta)
    )
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'noDispositivo', c.tarjeta,
               'nombres',         coalesce(nullif(c.nombres, ''), c.nombre),
               'apellidoPaterno', nullif(c.apellidos, ''),
               'tipoUsuario', case
                    when c.depto like '%PADRES%' then 'padres'
                    when c.depto like '%DOCENTE%' then 'maestro'
                    when c.depto = 'ALUMNOS' then 'alumno'
                    when c.depto in ('ADMON', 'ADMINISTRACION') then 'admin'
                    else 'otro' end,
               'placas', nullif(c.placa, ''),
               'sinPlacas', false,
               'procedenciaTag', 'escuela',
               'estado', 'activo',
               'estacionamientos', to_jsonb(c.lotes),
               'origen', 'migracion_zk',
               'evidencia', 'no_localizada',
               'observaciones',
                   'Alta automatica desde ZK: abrio la pluma el ' || to_char(c.primera, 'DD/MM/YYYY') ||
                   ' y no tenia expediente. Departamento en ZK: ' || c.departamento ||
                   '. Plumas: donde abrio. Falta capturar el vehiculo.'
           )) order by c.tarjeta), '[]'::jsonb),
           coalesce(array_agg(c.tarjeta order by c.tarjeta), array[]::text[])
      into v_lote, v_tags
      from candidatas c;

    if jsonb_array_length(v_lote) = 0 then
        return jsonb_build_object('altas', 0, 'tarjetas', '[]'::jsonb, 'saltados', 0, 'placasSueltas', 0);
    end if;

    v_res := migrar_expedientes(v_lote, v_quien);

    update registros r
       set seccion_maestro = case
               when z.departamento ilike '%PREESCOLAR%'   then 'preescolar'
               when z.departamento ilike '%PRIMARIA%'     then 'primaria'
               when z.departamento ilike '%SECUNDARIA%'   then 'secundaria'
               when z.departamento ilike '%PREPARATORIA%' then 'preparatoria' end
      from zk_padron z
     where z.tarjeta = r.no_dispositivo
       and r.no_dispositivo = any(v_tags)
       and r.origen_expediente = 'migracion_zk' and r.tipo_usuario = 'maestro'
       and r.estado <> 'baja' and r.seccion_maestro is null
       and z.departamento ~* '(PREESCOLAR|PRIMARIA|SECUNDARIA|PREPARATORIA)';

    update registros
       set sin_placas = true,
           observaciones = coalesce(observaciones || ' ', '') ||
               'Sin placa en el origen: queda marcado sin placa hasta que alguien la capture.'
     where no_dispositivo = any(v_tags)
       and origen_expediente = 'migracion_zk' and estado <> 'baja'
       and (placas is null or btrim(placas) = '') and not sin_placas;

    return jsonb_build_object(
        'altas',         coalesce((v_res ->> 'altas')::int, 0),
        'tarjetas',      to_jsonb(v_tags),
        'saltados',      coalesce((v_res ->> 'saltados')::int, 0),
        'placasSueltas', coalesce((v_res ->> 'placasSueltas')::int, 0)
    );
end; $altas$;

revoke all    on function altas_desde_zk(date, text) from public, anon;
grant  execute on function altas_desde_zk(date, text) to authenticated;

notify pgrst, 'reload schema';

do $guardia$
begin
    if to_regprocedure('public.panel_exigir_rol(text[])') is null then
        raise exception 'Falta panel_exigir_rol: aplique antes el bloque 29. No se aplico nada.';
    end if;
end; $guardia$;

create table if not exists casos_seguimiento (
    clave           text primary key,
    estado          text not null default 'pendiente',
    nota            text not null default '',
    actualizado_por text not null,
    actualizado_en  timestamptz not null default now(),
    constraint casos_clave_formato  check (clave ~ '^[a-z-]+:[0-9]+(:E[0-9]+)?$'),
    constraint casos_estado_valido  check (estado in ('pendiente', 'revision', 'resuelto')),
    constraint casos_nota_corta     check (char_length(nota) <= 2000)
);

create table if not exists casos_seguimiento_historial (
    id         bigint generated always as identity primary key,
    clave      text not null,
    estado     text not null,
    nota       text not null,
    hecho_por  text not null,
    hecho_en   timestamptz not null default now()
);

create index if not exists ix_casos_hist_clave on casos_seguimiento_historial (clave, hecho_en desc);

comment on table casos_seguimiento is 'Lo que una persona decidio de cada caso del estacionamiento (bloque 87). El caso se calcula en la pantalla (lib/casos.ts); aqui solo su estado y nota.';
comment on column casos_seguimiento.clave is 'tipo:tarjeta[:lote], la arma lib/casos.ts. Estable mientras el caso sea el mismo.';
comment on table casos_seguimiento_historial is 'Cada cambio de estado o nota de un caso (bloque 87): quien y cuando.';

alter table casos_seguimiento           enable row level security;
alter table casos_seguimiento_historial enable row level security;

drop policy if exists casos_lectura_panel on casos_seguimiento;
create policy casos_lectura_panel on casos_seguimiento
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti','contador','super')
    );

drop policy if exists casos_hist_lectura_panel on casos_seguimiento_historial;
create policy casos_hist_lectura_panel on casos_seguimiento_historial
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti','contador','super')
    );

revoke all on table casos_seguimiento, casos_seguimiento_historial from anon, public;
revoke insert, update, delete, truncate, references, trigger
    on table casos_seguimiento, casos_seguimiento_historial from authenticated;
grant  select on table casos_seguimiento, casos_seguimiento_historial to authenticated;

create or replace function seguir_caso(
    p_clave     text,
    p_estado    text,
    p_nota      text default '',
    p_hecho_por text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $seguir$
declare
    v_quien text;
    v_clave text := btrim(coalesce(p_clave, ''));
    v_est   text := btrim(coalesce(p_estado, ''));
    v_nota  text := btrim(coalesce(p_nota, ''));
    v_en    timestamptz;
begin
    perform panel_exigir_rol(array['ti']);

    if v_clave !~ '^[a-z-]+:[0-9]+(:E[0-9]+)?$' then
        raise exception 'El caso no tiene una clave valida. Vuelva a abrir la pantalla y reintente.';
    end if;
    if v_est not in ('pendiente', 'revision', 'resuelto') then
        raise exception 'El estado del caso tiene que ser pendiente, en revision o resuelto.';
    end if;
    if char_length(v_nota) > 2000 then
        raise exception 'La nota es demasiado larga: use menos de 2,000 caracteres.';
    end if;
    if v_est = 'resuelto' and v_nota = '' then
        raise exception 'Para dar un caso por resuelto, escriba en la nota que se hizo.';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    insert into casos_seguimiento as c (clave, estado, nota, actualizado_por, actualizado_en)
    values (v_clave, v_est, v_nota, v_quien, now())
    on conflict (clave) do update
       set estado = excluded.estado, nota = excluded.nota,
           actualizado_por = excluded.actualizado_por, actualizado_en = now()
    returning actualizado_en into v_en;

    insert into casos_seguimiento_historial (clave, estado, nota, hecho_por)
    values (v_clave, v_est, v_nota, v_quien);

    return jsonb_build_object('clave', v_clave, 'estado', v_est, 'nota', v_nota,
                              'actualizadoPor', v_quien, 'actualizadoEn', v_en);
end; $seguir$;

revoke all    on function seguir_caso(text, text, text, text) from public, anon;
grant  execute on function seguir_caso(text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

do $mariana$
declare v_id uuid;
begin
  select id into v_id from registros
   where folio = 'SATAG-001428' and no_dispositivo = '9323381' and estado <> 'baja';
  if v_id is null then
    raise notice 'SATAG-001428 no esta vivo con el TAG 9323381: no se registro el TAG anterior.';
    return;
  end if;
  if not exists (select 1 from movimientos where registro_id = v_id and no_dispositivo_anterior = '14273782') then
    insert into movimientos (registro_id, tipo, fecha, no_dispositivo_anterior, no_dispositivo_nuevo, motivo, hecho_por)
    values (v_id, 'cambio', date '2026-09-28', '14273782', '9323381',
            'Usaba un TAG externo (14273782); se dio de baja en ZK y desde el 28-sep usa el del IAQ. Lo dice la hoja historica.',
            'TI');
  end if;
end $mariana$;

commit;

select 1 as orden, '86 · zk_padron tiene nombres, apellidos y placa' as que,
       (select count(*) = 3 from information_schema.columns
         where table_schema = 'public' and table_name = 'zk_padron'
           and column_name in ('nombres', 'apellidos', 'placa')) as ok
union all
select 2, '86 · zk_padron sigue cerrado: RLS y anon fuera',
       (select relrowsecurity from pg_class where oid = 'public.zk_padron'::regclass)
       and not has_table_privilege('anon', 'zk_padron', 'SELECT')
       and not has_table_privilege('authenticated', 'zk_padron', 'UPDATE')
union all
select 3, '86 · cargar_padron_zk guarda la placa y conserva el freno',
       (select prosrc like '%requiereConfirmacion%' and prosrc like '%excluded.placa%'
          from pg_proc where proname = 'cargar_padron_zk')
union all
select 4, '86 · altas_desde_zk: security definer, anon no la ejecuta, authenticated si',
       exists (select 1 from pg_proc where proname = 'altas_desde_zk' and prosecdef)
       and not has_function_privilege('anon', 'altas_desde_zk(date, text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'altas_desde_zk(date, text)', 'EXECUTE')
union all
select 5, '87 · existen casos_seguimiento y su historial',
       to_regclass('public.casos_seguimiento') is not null
       and to_regclass('public.casos_seguimiento_historial') is not null
union all
select 6, '87 · las dos tienen RLS',
       (select bool_and(relrowsecurity) from pg_class
         where oid in ('public.casos_seguimiento'::regclass, 'public.casos_seguimiento_historial'::regclass))
union all
select 7, '87 · anon fuera; authenticated solo lee',
       not has_table_privilege('anon', 'casos_seguimiento', 'SELECT')
       and not has_table_privilege('anon', 'casos_seguimiento_historial', 'SELECT')
       and has_table_privilege('authenticated', 'casos_seguimiento', 'SELECT')
       and not has_table_privilege('authenticated', 'casos_seguimiento', 'INSERT')
       and not has_table_privilege('authenticated', 'casos_seguimiento', 'UPDATE')
union all
select 8, '87 · seguir_caso: security definer, anon no la ejecuta, authenticated si',
       exists (select 1 from pg_proc where proname = 'seguir_caso' and prosecdef)
       and not has_function_privilege('anon', 'seguir_caso(text, text, text, text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'seguir_caso(text, text, text, text)', 'EXECUTE')
union all
select 9, 'ningun mensaje nuevo tutea',
       (select bool_and(prosrc !~* '\m(tu|tus|elige|reintenta|verifica|escribe)\M')
          from pg_proc where proname in ('cargar_padron_zk', 'altas_desde_zk', 'seguir_caso'))
union all
select 10, 'SATAG-001428 tiene registrado su TAG externo anterior (14273782)',
       exists (select 1 from movimientos m join registros r on r.id = m.registro_id
                where r.folio = 'SATAG-001428' and m.no_dispositivo_anterior = '14273782')
union all
select 11, 'no se dio de alta a nadie todavia: eso lo hace la pantalla al cargar ZK',
       not exists (select 1 from registros where observaciones like 'Alta automatica desde ZK%')
order by orden;
