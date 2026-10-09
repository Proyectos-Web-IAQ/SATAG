-- =====================================================================
-- BLOQUE 95 — El paso «Importar» de la tanda dice la ruta real de ZK.
--
-- SC-032 · 09/10/2026
--
-- POR QUE
--   El primer paso de cada tanda (crear_tanda_zk, bloque 93) decia «Personal ›
--   Usuarios › Importar». Gerardo confirmo el 9-oct que en ZK es «Personal ›
--   Importar › Información del Personal». Es la instruccion que sigue el equipo:
--   tiene que decir lo que ve en pantalla.
--
-- QUE CAMBIA
--   crear_tanda_zk: cuerpo EXTRAIDO de 93_movimientos_zk.sql (el 94 no lo toco)
--   con UNA linea cambiada, verificado por diff. Misma firma: `create or
--   replace`, sin drop ni regrant. Las tandas ya creadas conservan su texto.
--
-- Solo cambia un texto: el orden con el cliente no importa.
-- =====================================================================

begin;

do $guardia$
begin
    if exists (select 1 from pg_proc where proname = 'crear_tanda_zk' and prosrc like '%Información del Personal%') then
        raise exception 'El bloque 95 ya esta aplicado. No se aplico nada.';
    end if;
    if not exists (select 1 from pg_proc where proname = 'crear_tanda_zk' and prosrc like '%Personal › Usuarios › Importar%') then
        raise exception 'crear_tanda_zk no es la del bloque 93. No se aplico nada: revise que bloque la dejo asi.';
    end if;
end;
$guardia$;

create or replace function crear_tanda_zk(p_movimientos uuid[], p_hecho_por text default null) returns jsonb
language plpgsql security definer set search_path = public
as $tanda$
declare
    v_quien   text;
    v_n       int;
    v_sin_id  text[];
    v_pasos   jsonb;
    v_tanda   uuid;
    v_numero  int;
    v_abierta int;
begin
    perform panel_exigir_rol(array['ti']);
    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    if p_movimientos is null or cardinality(p_movimientos) = 0 then
        raise exception 'Elija al menos un movimiento.';
    end if;
    select numero into v_abierta from zk_tandas where estado = 'abierta';
    if v_abierta is not null then
        raise exception 'La tanda % sigue abierta: terminela o cancelela antes de armar otra.', v_abierta;
    end if;
    select count(*) into v_n from zk_movimientos
     where id = any (p_movimientos) and estado in ('pendiente', 'no_coincide');
    if v_n <> cardinality(p_movimientos) then
        raise exception 'Alguno de los movimientos ya no esta pendiente. Vuelva a abrir la pantalla.';
    end if;
    -- Un TAG con dos destinos (dos casos que piden cosas distintas) lo decide TI.
    select array_agg(distinct tarjeta) into v_sin_id from (
        select tarjeta from zk_movimientos where id = any (p_movimientos) group by tarjeta, que having count(*) > 1) x;
    if v_sin_id is not null then
        raise exception 'El TAG % tiene dos movimientos de la misma clase en la seleccion. Deje uno (ajuste o cancele el otro).',
            array_to_string(v_sin_id, ', ');
    end if;
    -- Sin el ID de ZK el import crearia a otra persona con la misma tarjeta.
    select array_agg(m.tarjeta order by m.tarjeta) into v_sin_id
      from zk_movimientos m
      left join zk_padron p on p.tarjeta = m.tarjeta and p.vigente
     where m.id = any (p_movimientos) and coalesce(p.id_zk, '') = '';
    if v_sin_id is not null then
        raise exception 'SATAG no conoce el ID de ZK de % TAG(s) (%). Suba primero el export de Usuarios de ZK en Archivos de ZK.',
            cardinality(v_sin_id), array_to_string(v_sin_id[1:5], ', ');
    end if;

    -- Los pasos: importar, y uno por cada departamento destino segun tenga niveles o no.
    select jsonb_build_array(jsonb_build_object(
               'clave', 'importar', 'hecho', false,
               'texto', 'Importar el archivo de esta tanda en ZK: Personal › Importar › Información del Personal, «Fila de inicio» 2 y «Actualizar el ID de usuario existente» Sí. Debe decir Correctos ' || cardinality(p_movimientos)::text || ' o menos (un renglón por TAG) y Fallidos 0.'))
           || coalesce(jsonb_agg(jsonb_build_object(
               'clave', 'niveles:' || d.id, 'hecho', false,
               'texto', case when cardinality(d.niveles) = 0 then
                   d.nombre || ': en Acceso › Por Departamento, agregarle todos los niveles (ESTACIONAMIENTO 1 y 2), guardar, y quitárselos, guardar. De corrido y fuera de las horas de entrada y salida: mientras tanto, todos los de ' || d.nombre || ' abren.'
                 else
                   d.nombre || ': en Acceso › Por Departamento, quitar y volver a poner sus niveles (' ||
                   array_to_string(array(select 'ESTACIONAMIENTO ' || substr(x, 2) from unnest(d.niveles) x order by 1), ' y ') ||
                   '). Ojo: también se los devuelve a quien se los hubieran quitado a mano en ese departamento.'
                 end) order by d.nombre), '[]'::jsonb)
      into v_pasos
      from zk_departamentos d
     where d.id in (select depto_destino from zk_movimientos where id = any (p_movimientos) and que = 'departamento');

    insert into zk_tandas (pasos, creada_por) values (v_pasos, v_quien) returning id, numero into v_tanda, v_numero;
    update zk_movimientos set estado = 'en_tanda', tanda_id = v_tanda, actualizado_en = now(), detalle = ''
     where id = any (p_movimientos);

    return jsonb_build_object(
        'tanda', v_tanda, 'numero', v_numero, 'pasos', v_pasos,
        'renglones', (
            select coalesce(jsonb_agg(jsonb_build_object(
                       'tarjeta', p.tarjeta, 'idZk', p.id_zk, 'nombres', p.nombres, 'apellidos', p.apellidos,
                       'placa', p.placa,
                       'deptoId', coalesce(d.id, p.departamento_id), 'deptoNombre', coalesce(d.nombre, p.departamento),
                       'nombreDestino', n.nombre_destino) order by p.tarjeta), '[]'::jsonb)
              from (select distinct tarjeta from zk_movimientos where id = any (p_movimientos)) t
              join zk_padron p on p.tarjeta = t.tarjeta and p.vigente
              left join zk_movimientos md on md.id = any (p_movimientos) and md.tarjeta = t.tarjeta and md.que = 'departamento'
              left join zk_departamentos d on d.id = md.depto_destino
              left join zk_movimientos n on n.id = any (p_movimientos) and n.tarjeta = t.tarjeta and n.que = 'nombre'));
end;
$tanda$;

-- La firma no cambia: los permisos se conservan. Se repiten por si acaso.
revoke all     on function crear_tanda_zk(uuid[], text) from public, anon;
grant  execute on function crear_tanda_zk(uuid[], text) to authenticated;

commit;


-- VERIFICACION (solo lectura). Tres filas con ok = true.
select 1 as orden, 'el paso Importar dice la ruta real de ZK' as que,
       (select prosrc like '%Personal › Importar › Información del Personal%' and prosrc not like '%Personal › Usuarios › Importar%'
          from pg_proc where proname = 'crear_tanda_zk') as ok
union all
select 2, 'una sola forma, security definer y anon no la ejecuta',
       (select count(*) from pg_proc where proname = 'crear_tanda_zk') = 1
       and exists (select 1 from pg_proc where proname = 'crear_tanda_zk' and prosecdef)
       and not has_function_privilege('anon', 'crear_tanda_zk(uuid[], text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'crear_tanda_zk(uuid[], text)', 'EXECUTE')
union all
select 3, 'ningun mensaje tutea',
       (select prosrc !~* '\m(tu|tus|elige|termina|cancela)\M' from pg_proc where proname = 'crear_tanda_zk')
order by orden;


-- ROLLBACK (comentado): volver a correr el cuerpo de crear_tanda_zk de
-- 93_movimientos_zk.sql (seccion 5.4) con «create or replace function».
