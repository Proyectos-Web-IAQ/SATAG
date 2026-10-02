-- =====================================================================
-- 84_padron_zk_frenos.sql — cargar_padron_zk sin atajo por sha y con freno
-- SC-031 · 02/10/2026
--
-- POR QUE. La revision adversaria del bloque 83 lo reprodujo en Postgres: el RPC
-- regresaba «ya estaba» en cuanto el sha256 del archivo existia, sin mirar lo
-- vigente. Un export equivocado (filtrado por departamento, por ejemplo) retiraba
-- a casi todo el padron, y volver a subir el archivo bueno —que es lo primero que
-- hace cualquiera— no arreglaba nada, porque su sha ya estaba. El atajo suponia
-- que la tabla siempre refleja el ultimo archivo de cada sha, y eso no se cumple:
-- el padron es una foto que se sobreescribe, no una bitacora que solo crece.
--
-- QUE CAMBIA (misma firma: `create or replace`, sin drop ni notify):
--   1. Sin atajo. El upsert diferencial y el retiro corren SIEMPRE; como solo
--      escriben lo que cambia, repetir un archivo cuesta una lectura. `yaEstaba`
--      pasa a significar «no habia nada que cambiar», que es lo que la pantalla
--      dice. Si el sha ya existia, su carga se actualiza (cargado_en, personas) y
--      vuelve a ser la mas reciente.
--   2. Freno al retiro masivo. Antes de escribir se cuenta a cuantas personas
--      vigentes dejaria fuera el archivo. Si son mas de 20 y mas del 20 % de las
--      vigentes, el RPC NO escribe y devuelve `requiereConfirmacion` con las
--      cifras; la pantalla pregunta y, si se confirma, vuelve a llamar con
--      `forzar: true` en p_meta. El primer padron (tabla vacia) nunca frena.
--   3. Aviso de export anterior. Si el archivo trae una hora de exportacion mas
--      vieja que la del ultimo cargado, tambien pide confirmacion: puede ser el
--      archivo correcto para deshacer un error, o un archivo viejo elegido por
--      equivocacion. Lo decide la persona, no el RPC.
--
-- Va DESPUES del 83 (aplicado 02/10). Verificacion de solo lectura: tres filas.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. GUARDIA
-- ---------------------------------------------------------------------
do $guardia$
begin
    if to_regclass('public.zk_padron') is null or to_regclass('public.zk_padron_cargas') is null then
        raise exception 'Falta el bloque 83 (zk_padron). No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. EL RPC, de nuevo
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

    -- Las tarjetas validas del archivo, una sola vez cada una.
    if to_regclass('pg_temp.tmp_padron_zk') is not null then
        drop table pg_temp.tmp_padron_zk;
    end if;
    create temp table tmp_padron_zk (
        tarjeta text primary key, nombre text, departamento_id text, departamento text
    ) on commit drop;
    insert into tmp_padron_zk (tarjeta, nombre, departamento_id, departamento)
    select distinct on (tarjeta) tarjeta, nombre, departamento_id, departamento
      from (
        select btrim(coalesce(f ->> 'tarjeta', ''))                  as tarjeta,
               left(btrim(coalesce(f ->> 'nombre', '')), 200)        as nombre,
               left(btrim(coalesce(f ->> 'departamentoId', '')), 20) as departamento_id,
               left(btrim(coalesce(f ->> 'departamento', '')), 120)  as departamento
          from jsonb_array_elements(p_filas) f
      ) x
     where tarjeta ~ '^[0-9]+$';

    if (select count(*) from tmp_padron_zk) = 0 then
        raise exception 'Ninguna fila trae un numero de tarjeta valido. Verifique que sea el archivo «Personas» de ZK.';
    end if;

    -- 2. EL FRENO, antes de escribir nada.
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

    -- 3. LA CARGA. Si el sha ya estaba, su renglon vuelve a ser el mas reciente.
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

    -- 4. SOLO LO QUE CAMBIA. `xmax = 0` distingue insercion de actualizacion.
    with escritas as (
        insert into zk_padron as z (tarjeta, nombre, departamento_id, departamento, vigente, carga_id, actualizado_en)
        select t.tarjeta, t.nombre, t.departamento_id, t.departamento, true, v_carga, now()
          from tmp_padron_zk t
        on conflict (tarjeta) do update
           set nombre = excluded.nombre,
               departamento_id = excluded.departamento_id,
               departamento = excluded.departamento,
               vigente = true,
               carga_id = excluded.carga_id,
               actualizado_en = now()
         where (z.nombre, z.departamento_id, z.departamento, z.vigente)
               is distinct from (excluded.nombre, excluded.departamento_id, excluded.departamento, true)
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

-- Misma firma que en el 83: los grants se conservan. Se repiten por si el 83
-- se aplico desde una copia vieja.
revoke all    on function cargar_padron_zk(jsonb, jsonb, text) from public, anon;
grant  execute on function cargar_padron_zk(jsonb, jsonb, text) to authenticated;


-- ---------------------------------------------------------------------
-- 5. VERIFICACION (solo lectura). Tres filas con ok = true.
-- ---------------------------------------------------------------------
select 1 as orden, 'el RPC existe, es security definer y anon no lo ejecuta' as que,
       exists (select 1 from pg_proc where proname = 'cargar_padron_zk' and prosecdef)
       and not has_function_privilege('anon', 'cargar_padron_zk(jsonb, jsonb, text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'cargar_padron_zk(jsonb, jsonb, text)', 'EXECUTE') as ok
union all
select 2, 'el cuerpo nuevo tiene el freno y ya no corta por sha',
       (select prosrc like '%requiereConfirmacion%' and prosrc not like '%v_nueva%' from pg_proc where proname = 'cargar_padron_zk')
union all
select 3, 'ningun mensaje tutea',
       (select prosrc !~* '\m(tu|tus|elige|reintenta|verifica)\M' from pg_proc where proname = 'cargar_padron_zk')
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado): volver a correr la seccion 3 del bloque 83, que deja
-- la version anterior del RPC con la misma firma.
-- ---------------------------------------------------------------------
