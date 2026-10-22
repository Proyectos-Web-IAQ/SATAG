-- =====================================================================
-- BLOQUE 102 — Crear en SATAG, a pedido, el expediente de alguien que
-- solo esta en ZK.
--
-- 22/10/2026
--
-- POR QUE
--   Gerardo, 22-oct: «tengo por ejemplo este caso 12823807 que no tiene
--   registro activo en satag porque no habia pasado por la pluma pero en zk
--   si esta activo lo que quiero ahora es generarle su registro en satag para
--   tambien poder irle llenando datos».
--
--   altas_desde_zk (bloques 86 y 88) da de alta sola a la credencial que ABRIO
--   la pluma: la bitacora dice quien abrio y el padron de ZK quien es. Quien
--   esta vigente en ZK y no ha pasado se queda «Solo en ZK» en la ficha, sin
--   expediente al que capturarle datos. Este bloque es la misma alta, para
--   UNA tarjeta, cuando Sistemas la pide.
--
-- QUE HACE, EN ORDEN
--   0. Guardia: el 102 no esta y lo que usa sigue como se espera
--      (migrar_expedientes del 79, zk_padron con nombres/apellidos/placa del
--      86 y area_admin del 88).
--   1. RPC NUEVO alta_desde_zk_tarjeta(p_tarjeta). Solo ti (super pasa
--      siempre). Quien da de alta sale del JWT.
--   2. Verificacion de solo lectura: filas con ok = true.
--
-- LAS REGLAS (las de altas_desde_zk, menos «abrio la pluma»)
--   - La tarjeta tiene que estar VIGENTE en el padron de ZK guardado, con
--     nombre, y fuera de BAJAS y de STOCK SATAG.
--   - Si la tarjeta ya es de un expediente —vigente, dado de baja o apartada—
--     no se crea otro: se dice cual. Al dado de baja se le reactiva (101).
--   - Entra como las altas automaticas: origen migracion_zk, evidencia
--     no_localizada (no paso por caja ni firmo en SATAG; Finanzas ya excluye
--     ese origen), tipo y seccion por el departamento de ZK, placa la de ZK
--     (si otro vigente la tiene, migrar_expedientes la suelta y lo anota),
--     vehiculo «Sin registrar».
--   - Plumas: los lotes donde haya abierto alguna vez. Si nunca abrio, ninguna:
--     se eligen al corregirle los datos, y la observacion lo dice.
--   - Administrativo: el area sale de su departamento de ZK (bloque 88).
--
-- QUE NO HACE
--   - No toca ZK, casos ni altas_desde_zk.
--
-- ORDEN: este bloque solo AGREGA una funcion. Va ANTES del deploy del
-- cliente que la llama.
-- =====================================================================

begin;

do $guardia$
begin
    if exists (select 1 from pg_proc where proname = 'alta_desde_zk_tarjeta') then
        raise exception 'El bloque 102 ya esta aplicado (existe alta_desde_zk_tarjeta). No se aplico nada.';
    end if;
    if to_regprocedure('public.migrar_expedientes(jsonb,text)') is null
       or (select count(*) from pg_proc where proname = 'migrar_expedientes') <> 1
       or not exists (select 1 from pg_proc where proname = 'migrar_expedientes'
                       and prosrc like '%origen_expediente <> ''satag''%'
                       and prosrc like '%placasSueltas%') then
        raise exception 'migrar_expedientes no es la del bloque 79 (o hay mas de una). No se aplico nada.';
    end if;
    if (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'zk_padron'
           and column_name in ('nombres', 'apellidos', 'placa', 'departamento_id', 'vigente')) <> 5 then
        raise exception 'zk_padron no tiene las columnas de los bloques 83 y 86. No se aplico nada.';
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'registros' and column_name = 'area_admin')
       or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'registros' and column_name = 'seccion_maestro') then
        raise exception 'Faltan registros.area_admin (88) o registros.seccion_maestro (70). No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. LA FUNCION
-- ---------------------------------------------------------------------
create function alta_desde_zk_tarjeta(p_tarjeta text) returns jsonb
language plpgsql
security definer
set search_path = public
as $alta$
declare
    v_quien  text;
    v_tag    text := btrim(coalesce(p_tarjeta, ''));
    z        zk_padron%rowtype;
    v_depto  text;
    v_folio  text;
    v_estado text;
    v_lotes  text[];
    v_tipo   text;
    v_res    jsonb;
    v_id     uuid;
begin
    perform panel_exigir_rol(array['ti']);

    v_quien := nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '');
    if v_quien is null then
        raise exception 'No se pudo identificar a quien da de alta desde la sesion. Cierre sesion y vuelva a entrar.';
    end if;

    if v_tag !~ '^[0-9]{6,11}$' then
        raise exception 'El No. de TAG debe tener de 6 a 11 digitos.';
    end if;

    select folio, estado into v_folio, v_estado from registros
     where no_dispositivo = v_tag or (tag_apartado and tag_apartado_no = v_tag)
     order by (estado <> 'baja') desc
     limit 1;
    if v_folio is not null then
        if v_estado = 'baja' then
            raise exception 'El TAG % ya fue del expediente %, que esta dado de baja: reactivelo desde su ficha en vez de crear otro.', v_tag, v_folio;
        end if;
        raise exception 'El TAG % ya tiene expediente en SATAG (%).', v_tag, v_folio;
    end if;

    select * into z from zk_padron where tarjeta = v_tag;
    if z.tarjeta is null or not z.vigente or btrim(z.nombre) = '' then
        raise exception 'El TAG % no esta vigente en el padron de ZK guardado. Si ZK si lo tiene, suba el padron en Archivos de ZK y vuelva a intentar.', v_tag;
    end if;
    v_depto := upper(translate(z.departamento, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'));
    if v_depto in ('BAJAS', 'STOCK SATAG') then
        raise exception 'En ZK el TAG % esta en %: no es una persona activa. Revise su caso antes de darlo de alta.', v_tag, z.departamento;
    end if;

    select array_agg(distinct e.lote order by e.lote) into v_lotes
      from zk_eventos e
     where e.tarjeta = v_tag and e.concedido and not e.repeticion;

    v_tipo := case
        when v_depto like '%PADRES%' then 'padres'
        when v_depto like '%DOCENTE%' then 'maestro'
        when v_depto = 'ALUMNOS' then 'alumno'
        when v_depto in ('ADMON', 'ADMINISTRACION') then 'admin'
        else 'otro' end;

    v_res := migrar_expedientes(jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'noDispositivo',   v_tag,
        'nombres',         coalesce(nullif(z.nombres, ''), z.nombre),
        'apellidoPaterno', nullif(z.apellidos, ''),
        'tipoUsuario',     v_tipo,
        'placas',          nullif(z.placa, ''),
        'sinPlacas',       false,
        'procedenciaTag',  'escuela',
        'estado',          'activo',
        'estacionamientos', to_jsonb(coalesce(v_lotes, array[]::text[])),
        'origen',          'migracion_zk',
        'evidencia',       'no_localizada',
        'observaciones',
            'Alta a pedido desde ZK (' || v_quien || '): vigente en ZK y sin expediente. Departamento en ZK: ' ||
            z.departamento || '. ' ||
            case when v_lotes is null then 'Nunca habia abierto la pluma: faltan sus plumas. '
                 else 'Plumas: donde abrio. ' end ||
            'Falta capturar el vehiculo.'
    ))), v_quien);

    if coalesce((v_res ->> 'altas')::int, 0) <> 1 then
        raise exception 'No se creo el expediente del TAG %. Vuelva a abrir la ficha y reintente.', v_tag;
    end if;

    select id, folio into v_id, v_folio from registros
     where no_dispositivo = v_tag and estado <> 'baja';

    -- La seccion del maestro y el area del administrativo, de su departamento en
    -- ZK (bloques 70 y 88), como en altas_desde_zk.
    if v_tipo = 'maestro' and z.departamento ~* '(PREESCOLAR|PRIMARIA|SECUNDARIA|PREPARATORIA)' then
        update registros
           set seccion_maestro = case
                   when z.departamento ilike '%PREESCOLAR%'   then 'preescolar'
                   when z.departamento ilike '%PRIMARIA%'     then 'primaria'
                   when z.departamento ilike '%SECUNDARIA%'   then 'secundaria'
                   else 'preparatoria' end
         where id = v_id;
    end if;
    if v_tipo = 'admin' then
        update registros
           set area_admin = case when z.departamento_id = '17' or upper(btrim(z.departamento)) = 'ADMON'
                                 then 'admon' else 'administracion' end
         where id = v_id;
    end if;

    -- El que entro sin placa queda marcado, como en las altas automaticas.
    update registros
       set sin_placas = true,
           observaciones = coalesce(observaciones || ' ', '') ||
               'Sin placa en el origen: queda marcado sin placa hasta que alguien la capture.'
     where id = v_id and (placas is null or btrim(placas) = '') and not sin_placas;

    return jsonb_build_object('id', v_id, 'folio', v_folio, 'tipo', v_tipo,
                              'plumas', to_jsonb(coalesce(v_lotes, array[]::text[])),
                              'placaSuelta', coalesce((v_res ->> 'placasSueltas')::int, 0) > 0);
end;
$alta$;

revoke all     on function alta_desde_zk_tarjeta(text) from public, anon;
grant  execute on function alta_desde_zk_tarjeta(text) to authenticated;

notify pgrst, 'reload schema';

commit;


-- ---------------------------------------------------------------------
-- 2. VERIFICACION (solo lectura): todas las filas con ok = true
-- ---------------------------------------------------------------------
select 1 as orden, 'una sola alta_desde_zk_tarjeta, security definer' as que,
       (select count(*) from pg_proc where proname = 'alta_desde_zk_tarjeta') = 1
       and (select prosecdef from pg_proc where proname = 'alta_desde_zk_tarjeta') as ok
union all
select 2, 'pide el rol ti, toma a quien da de alta del JWT y pasa por migrar_expedientes',
       (select prosrc like '%panel_exigir_rol(array[''ti''])%'
               and prosrc like '%auth.jwt() ->> ''email''%'
               and prosrc like '%migrar_expedientes(jsonb_build_array(%'
          from pg_proc where proname = 'alta_desde_zk_tarjeta')
union all
select 3, 'no duplica: revisa expedientes con ese TAG (vigentes, de baja o apartados) y BAJAS/STOCK',
       (select prosrc like '%where no_dispositivo = v_tag or (tag_apartado and tag_apartado_no = v_tag)%'
               and prosrc like '%(''BAJAS'', ''STOCK SATAG'')%'
          from pg_proc where proname = 'alta_desde_zk_tarjeta')
union all
select 4, 'anon no la ejecuta; authenticated si (la guardia decide el rol)',
       not has_function_privilege('anon', 'public.alta_desde_zk_tarjeta(text)', 'execute')
       and has_function_privilege('authenticated', 'public.alta_desde_zk_tarjeta(text)', 'execute')
union all
select 5, 'altas_desde_zk y migrar_expedientes siguen intactas (una de cada una)',
       (select count(*) from pg_proc where proname = 'altas_desde_zk') = 1
       and (select count(*) from pg_proc where proname = 'migrar_expedientes') = 1
union all
select 6, 'ningun mensaje tutea',
       (select prosrc !~* '\m(tu|tus|elige|escribe|vuelve|captura tu)\M'
          from pg_proc where proname = 'alta_desde_zk_tarjeta')
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado)
-- ---------------------------------------------------------------------
-- El bloque solo agrega la funcion: quitarla basta. Los expedientes ya
-- creados se quedan: son migracion_zk con la observacion «Alta a pedido
-- desde ZK».
--   begin;
--   drop function if exists alta_desde_zk_tarjeta(text);
--   commit;
--   notify pgrst, 'reload schema';
