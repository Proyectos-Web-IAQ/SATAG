-- =====================================================================
-- BLOQUE 88 — Administracion y Admon, separados dentro de SATAG.
--
-- SC-031 · 05/10/2026
--
-- POR QUE
--   El 5-oct TI partio en ZK el departamento «Administracion» en dos: 16
--   «Administracion» y 17 «Admon» (el equipo del contador). Gerardo: en SATAG
--   tambien deben estar separados, pero quien se registra NO debe ver esa
--   diferencia. Asi que el formulario publico sigue diciendo «administrativo»
--   y la diferencia vive solo en el panel.
--
-- QUE HACE, EN ORDEN
--   1. Guardia: bloques 86 (altas_desde_zk) y 29 (panel_exigir_rol).
--   2. `registros.area_admin` ('administracion' | 'admon'), solo con sentido
--      para tipo 'admin'. NULL se lee como 'administracion': el alta publica no
--      la llena, y asi se queda hasta que el panel la cambie.
--   3. Relleno: cada administrativo vivo toma el area de su departamento en el
--      padron de ZK guardado (17 «Admon» -> admon; lo demas -> administracion).
--   4. RPC `asignar_area_admin` (roles admin y ti; super pasa siempre): cambia
--      el area y deja el cambio en `movimientos` como rectificacion.
--   5. `altas_desde_zk` de nuevo (misma firma), que corre despues de cada
--      carga de ZK: (a) A LA PAR: cada administrativo vivo toma el area del
--      departamento que ZK le tiene hoy (16 o 17), y el cambio queda en
--      movimientos; (b) el administrativo que entra solo desde ZK toma el area
--      de su departamento. Gerardo, 5-oct: «que SATAG y ZK esten a la par».
--      La otra direccion la hace el puente: SATAG exporta admon -> 17, si no -> 16.
--   6. Verificacion de solo lectura: cinco filas con ok = true.
--
-- QUE NO CAMBIA: `crear_registro` (el formulario publico) ni el catalogo de
-- tipos. La exportacion a ZK la decide el cliente: admon -> 17, si no -> 16.
--
-- Va ANTES del deploy del cliente: el cliente lee `area_admin` en el padron, y
-- sin la columna la lista de expedientes no carga.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. GUARDIA
-- ---------------------------------------------------------------------
do $guardia$
begin
    if to_regprocedure('public.altas_desde_zk(date,text)') is null then
        raise exception 'Falta el bloque 86 (altas_desde_zk). No se aplico nada.';
    end if;
    if to_regprocedure('public.panel_exigir_rol(text[])') is null then
        raise exception 'Falta panel_exigir_rol: aplique antes el bloque 29. No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. LA COLUMNA
-- ---------------------------------------------------------------------
alter table registros add column if not exists area_admin text;

alter table registros drop constraint if exists reg_area_admin_valida;
alter table registros add  constraint reg_area_admin_valida
    check (area_admin is null or area_admin in ('administracion', 'admon'));

comment on column registros.area_admin is
    'Solo para tipo admin (bloque 88): administracion (ZK 16) o admon (ZK 17, equipo del contador). NULL = administracion. No se pide en el registro publico.';


-- ---------------------------------------------------------------------
-- 2. EL RELLENO, desde el padron de ZK guardado. Solo donde falta.
-- ---------------------------------------------------------------------
update registros r
   set area_admin = case when z.departamento_id = '17' or upper(btrim(z.departamento)) = 'ADMON'
                         then 'admon' else 'administracion' end
  from zk_padron z
 where z.tarjeta = r.no_dispositivo
   and z.vigente
   and r.tipo_usuario = 'admin'
   and r.area_admin is null;


-- ---------------------------------------------------------------------
-- 3. EL RPC
-- ---------------------------------------------------------------------
create or replace function asignar_area_admin(
    p_registro_id uuid,
    p_area        text,
    p_hecho_por   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $area$
declare
    v_quien  text;
    v_area   text := btrim(coalesce(p_area, ''));
    v_tipo   text;
    v_antes  text;
begin
    perform panel_exigir_rol(array['admin', 'ti']);

    if v_area not in ('administracion', 'admon') then
        raise exception 'El area tiene que ser Administracion o Admon.';
    end if;

    select tipo_usuario, coalesce(area_admin, 'administracion')
      into v_tipo, v_antes
      from registros where id = p_registro_id
       for update;
    if not found then
        raise exception 'No se encontro el expediente. Vuelva a abrirlo y reintente.';
    end if;
    if v_tipo <> 'admin' then
        raise exception 'Solo un expediente de tipo administrativo tiene area.';
    end if;
    if v_antes = v_area then
        return jsonb_build_object('id', p_registro_id, 'area', v_area, 'cambio', false);
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'Panel');

    update registros set area_admin = v_area where id = p_registro_id;

    insert into movimientos (registro_id, tipo, motivo, hecho_por)
    values (p_registro_id, 'rectificacion',
            'Area administrativa: ' || case v_antes when 'admon' then 'Admon' else 'Administracion' end ||
            ' -> ' || case v_area when 'admon' then 'Admon' else 'Administracion' end || '.',
            v_quien);

    return jsonb_build_object('id', p_registro_id, 'area', v_area, 'cambio', true);
end;
$area$;

revoke all    on function asignar_area_admin(uuid, text, text) from public, anon;
grant  execute on function asignar_area_admin(uuid, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. LAS ALTAS DESDE ZK, con el area. Igual al 86 en todo lo demas.
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
    v_areas int := 0;
begin
    perform panel_exigir_rol(array['ti']);
    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    -- A LA PAR CON ZK (bloque 88). Cada administrativo vivo toma el area del
    -- departamento que ZK le tiene HOY: si TI lo movio entre el 16 y el 17, SATAG
    -- lo sigue. Solo cuando ZK lo tiene en uno de los dos; si esta en otro
    -- departamento (BAJAS, General...) eso es un caso, no un cambio de area.
    with zk as (
        select r.id, coalesce(r.area_admin, 'administracion') as antes,
               case when z.departamento_id = '17' or upper(btrim(z.departamento)) = 'ADMON'
                    then 'admon' else 'administracion' end as ahora
          from registros r
          join zk_padron z on z.tarjeta = r.no_dispositivo and z.vigente
         where r.tipo_usuario = 'admin' and r.estado <> 'baja'
           and (z.departamento_id in ('16', '17')
                or upper(btrim(z.departamento)) in ('ADMON', 'ADMINISTRACION'))
    ), cambiados as (
        update registros r
           set area_admin = zk.ahora
          from zk
         where r.id = zk.id and (r.area_admin is distinct from zk.ahora)
        returning r.id, zk.antes, zk.ahora
    )
    insert into movimientos (registro_id, tipo, motivo, hecho_por)
    select c.id, 'rectificacion',
           'Area administrativa segun ZK: ' || case c.antes when 'admon' then 'Admon' else 'Administracion' end ||
           ' -> ' || case c.ahora when 'admon' then 'Admon' else 'Administracion' end || '.',
           v_quien
      from cambiados c
     where c.antes is distinct from c.ahora;
    get diagnostics v_areas = row_count;

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
        return jsonb_build_object('altas', 0, 'tarjetas', '[]'::jsonb, 'saltados', 0, 'placasSueltas', 0,
                                  'areasAlineadas', v_areas);
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

    -- El administrativo queda en el area de su departamento de ZK (bloque 88):
    -- 17 «Admon» es admon; cualquier otro, administracion.
    update registros r
       set area_admin = case when z.departamento_id = '17' or upper(btrim(z.departamento)) = 'ADMON'
                             then 'admon' else 'administracion' end
      from zk_padron z
     where z.tarjeta = r.no_dispositivo
       and r.no_dispositivo = any(v_tags)
       and r.origen_expediente = 'migracion_zk' and r.tipo_usuario = 'admin'
       and r.estado <> 'baja' and r.area_admin is null;

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
        'placasSueltas', coalesce((v_res ->> 'placasSueltas')::int, 0),
        'areasAlineadas', v_areas
    );
end;
$altas$;


revoke all    on function altas_desde_zk(date, text) from public, anon;
grant  execute on function altas_desde_zk(date, text) to authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- 5. VERIFICACION (solo lectura). Cinco filas con ok = true.
-- ---------------------------------------------------------------------
select 1 as orden, 'registros tiene area_admin con su CHECK' as que,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'registros' and column_name = 'area_admin')
       and exists (select 1 from pg_constraint where conname = 'reg_area_admin_valida') as ok
union all
select 2, 'ningun expediente que no es administrativo tiene area',
       not exists (select 1 from registros where tipo_usuario <> 'admin' and area_admin is not null)
union all
select 3, 'asignar_area_admin: security definer, anon no la ejecuta, authenticated si',
       exists (select 1 from pg_proc where proname = 'asignar_area_admin' and prosecdef)
       and not has_function_privilege('anon', 'asignar_area_admin(uuid, text, text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'asignar_area_admin(uuid, text, text)', 'EXECUTE')
union all
select 4, 'altas_desde_zk pone el area del administrativo',
       (select prosrc like '%area_admin%' from pg_proc where proname = 'altas_desde_zk')
union all
select 5, 'ningun mensaje tutea',
       (select bool_and(prosrc !~* '\m(tu|tus|elige|reintenta|verifica)\M')
          from pg_proc where proname in ('asignar_area_admin', 'altas_desde_zk'))
order by orden;

-- Para ver el reparto (solo lectura, opcional):
--   select coalesce(area_admin, 'administracion') as area, count(*)
--     from registros where tipo_usuario = 'admin' and estado <> 'baja' group by 1;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). Primero revertir el deploy del cliente (lee la columna).
--
--   drop function if exists asignar_area_admin(uuid, text, text);
--   -- y volver a correr la seccion 3 del bloque 86 (altas_desde_zk sin area).
--   alter table registros drop constraint if exists reg_area_admin_valida;
--   alter table registros drop column if exists area_admin;
--   notify pgrst, 'reload schema';
-- ---------------------------------------------------------------------
