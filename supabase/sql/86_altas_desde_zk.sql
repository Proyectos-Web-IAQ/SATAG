-- =====================================================================
-- BLOQUE 86 — Quien abre la pluma sin expediente entra solo a SATAG.
--
-- SC-031 · 05/10/2026
--
-- POR QUE
--   La regla de Gerardo del 5-oct: en SATAG estan TODAS las credenciales que
--   abren la pluma, y cada que TI da de alta a alguien en ZK debe pasar lo
--   mismo sin que nadie corra un SQL. Hasta hoy eso se hacia a mano (1-oct, la
--   migracion; 5-oct, las 70 que faltaban), con un archivo en la maquina de
--   alguien. Ahora lo hace la base con lo que ya tiene: la bitacora
--   (`zk_eventos`, bloque 78) dice QUIEN abrio y el padron de ZK
--   (`zk_padron`, bloque 83) dice QUIEN ES.
--
-- QUE HACE, EN ORDEN
--   1. Guardia: bloques 78, 79, 83 y 84 aplicados.
--   2. `zk_padron` gana `nombres`, `apellidos` y `placa`. El padron ya traia
--      el nombre junto; la placa se habia dejado fuera a proposito (bloque 83)
--      para guardar menos datos personales. Gerardo decidio guardarla el 5-oct:
--      es lo unico que ZK sabe del vehiculo, y sin ella el alta automatica nace
--      sin placa. Queda con la misma RLS que `registros`.
--   3. `cargar_padron_zk` escribe esas tres columnas. Misma firma, mismo freno
--      del 84: solo cambia lo que guarda.
--   4. `altas_desde_zk` (rol ti): da de alta, por `migrar_expedientes`, cada
--      credencial que abrio la pluma desde `p_desde` y no tiene expediente.
--
-- QUIEN ENTRA Y QUIEN NO, Y POR QUE
--   Entra la tarjeta que:
--     - abrio la pluma (acceso concedido, sin rafagas) desde `p_desde`;
--     - NO aparece en ningun expediente: ni como TAG vigente, ni dado de baja,
--       ni como TAG anterior o nuevo de un movimiento, ni apartado. Un TAG que
--       ya fue de alguien y vuelve a abrir no es una persona nueva: es un caso
--       que una persona tiene que mirar, y lo senala la pestana Casos;
--     - esta VIGENTE en el padron de ZK y con nombre. Sin persona no hay
--       expediente: esa sale en Casos como credencial sin padron;
--     - NO esta en BAJAS ni en STOCK SATAG. Una credencial en BAJAS que abre es
--       un error de ZK, no un alta; una de STOCK que abre es un TAG instalado
--       sin expediente. Las dos van a Casos.
--   Como entra:
--     - origen `migracion_zk`, evidencia `no_localizada`: no paso por caja ni
--       firmo en SATAG, y Finanzas ya excluye ese origen.
--     - tipo y seccion por el departamento de ZK; plumas: los lotes donde
--       abrio; placa la de ZK (si otro expediente vivo ya la tiene,
--       migrar_expedientes la deja fuera y lo anota).
--     - vehiculo «Sin registrar»: ZK no lo sabe. La observacion lo dice.
--
-- POR QUE NO VA DENTRO DE LOS RPC DE CARGA
--   La carga de eventos va por lotes y la del padron puede frenar; meter altas
--   en medio de cualquiera de las dos mezclaria dos decisiones en una llamada.
--   La pantalla llama a `altas_desde_zk` despues de cada carga que termina bien.
--
-- SE PUEDE REPETIR SIN MIEDO: solo da de alta lo que falta.
--
-- Este bloque solo AGREGA: va ANTES del deploy del cliente que lo usa.
-- Depende de: 78 (zk_eventos), 79 (migrar_expedientes), 83 y 84 (zk_padron),
--             70 (seccion_maestro), 29 (panel_exigir_rol).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. GUARDIA. Va primero: si aborta, no se aplico nada.
-- ---------------------------------------------------------------------
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
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. LAS COLUMNAS NUEVAS DEL PADRON
-- ---------------------------------------------------------------------
alter table zk_padron
    add column if not exists nombres   text not null default '',
    add column if not exists apellidos text not null default '',
    add column if not exists placa     text not null default '';

comment on column zk_padron.nombres   is 'Columna «Nombre» del export de ZK (bloque 86). `nombre` sigue siendo los dos juntos.';
comment on column zk_padron.apellidos is 'Columna «Apellido» del export de ZK (bloque 86).';
comment on column zk_padron.placa     is 'Placa segun ZK («Placa Vehicular» o, si viene vacia, «Celular»). Bloque 86, decision del 5-oct. PII: misma RLS que registros.';


-- ---------------------------------------------------------------------
-- 2. LA CARGA DEL PADRON, con las tres columnas. Igual al 84 en todo lo demas.
-- ---------------------------------------------------------------------
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
               -- Un cliente de antes del 86 no las manda: quedan vacias, no fallan.
               left(btrim(coalesce(f ->> 'nombres', '')), 120)       as nombres,
               left(btrim(coalesce(f ->> 'apellidos', '')), 120)     as apellidos,
               left(upper(regexp_replace(coalesce(f ->> 'placa', ''), '\s', '', 'g')), 20) as placa
          from jsonb_array_elements(p_filas) f
      ) x
     where tarjeta ~ '^[0-9]+$';

    if (select count(*) from tmp_padron_zk) = 0 then
        raise exception 'Ninguna fila trae un numero de tarjeta valido. Verifique que sea el archivo «Personas» de ZK.';
    end if;

    -- EL FRENO, antes de escribir nada (bloque 84).
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

    -- SOLO LO QUE CAMBIA. `xmax = 0` distingue insercion de actualizacion.
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
end;
$carga$;

revoke all    on function cargar_padron_zk(jsonb, jsonb, text) from public, anon;
grant  execute on function cargar_padron_zk(jsonb, jsonb, text) to authenticated;


-- ---------------------------------------------------------------------
-- 3. LAS ALTAS DESDE ZK
-- ---------------------------------------------------------------------
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
               -- Sin las columnas partidas (padron cargado antes del 86) el nombre
               -- completo va en nombres y el apellido queda «Sin registrar».
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

    -- La seccion del maestro sale de su departamento docente (bloque 70); sin ella
    -- el puente a ZK no lo puede exportar.
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

    -- El que entro sin placa queda marcado, como en las migraciones.
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
end;
$altas$;

revoke all    on function altas_desde_zk(date, text) from public, anon;
grant  execute on function altas_desde_zk(date, text) to authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- 4. VERIFICACION (solo lectura). Cinco filas con ok = true.
-- ---------------------------------------------------------------------
select 1 as orden, 'zk_padron tiene nombres, apellidos y placa' as que,
       (select count(*) = 3 from information_schema.columns
         where table_schema = 'public' and table_name = 'zk_padron'
           and column_name in ('nombres', 'apellidos', 'placa')) as ok
union all
select 2, 'zk_padron sigue cerrado: RLS y anon fuera',
       (select relrowsecurity from pg_class where oid = 'public.zk_padron'::regclass)
       and not has_table_privilege('anon', 'zk_padron', 'SELECT')
       and not has_table_privilege('authenticated', 'zk_padron', 'UPDATE')
union all
select 3, 'cargar_padron_zk guarda la placa y conserva el freno',
       (select prosrc like '%requiereConfirmacion%' and prosrc like '%excluded.placa%'
          from pg_proc where proname = 'cargar_padron_zk')
union all
select 4, 'altas_desde_zk: security definer, anon no la ejecuta, authenticated si',
       exists (select 1 from pg_proc where proname = 'altas_desde_zk' and prosecdef)
       and not has_function_privilege('anon', 'altas_desde_zk(date, text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'altas_desde_zk(date, text)', 'EXECUTE')
union all
select 5, 'ningun mensaje tutea',
       (select bool_and(prosrc !~* '\m(tu|tus|elige|reintenta|verifica)\M')
          from pg_proc where proname in ('cargar_padron_zk', 'altas_desde_zk'))
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). Primero revertir el deploy del cliente que llama a
-- altas_desde_zk. Las altas que ya hizo NO se deshacen aqui: son expedientes
-- `migracion_zk` con la observacion «Alta automatica desde ZK».
--
--   drop function if exists altas_desde_zk(date, text);
--   -- y volver a correr la seccion 1 del bloque 84 (cargar_padron_zk sin placa).
--   alter table zk_padron drop column if exists placa,
--                         drop column if exists apellidos,
--                         drop column if exists nombres;
--   notify pgrst, 'reload schema';
-- ---------------------------------------------------------------------
