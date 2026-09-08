-- FASE 2 · Costo del PADRON COMPLETO tal como lo pide el panel, con la RLS
-- puesta, AL VOLUMEN OBJETIVO, y cuanto de ese costo es la RLS.
--
-- El padron real tiene 3 registros (28-ago-2026): medir contra eso no dice nada
-- de los ~1,660 + 300/ano del papel. Este script FABRICA n expedientes completos
-- (registro + pago + 2 movimientos + estacionamiento + 1 solicitud cada 10)
-- DENTRO de una transaccion, mide, y hace ROLLBACK. No consume ninguna
-- secuencia: los folios y los recibos van explicitos (SATAG-9xxxxx / MED-...).
-- No queda nada.
--
-- Simula lo que hace PostgREST cuando llega un JWT aal2 con rol super
-- (request.jwt.claims + set role authenticated) para que las politicas de los
-- bloques 27/30 se evaluen de verdad.
--
-- Devuelve UNA tabla (el editor solo muestra el ultimo resultado) con:
--   - tiempo y tamano del padron completo (4 embeds) con RLS, a n registros
--   - el plan (explain analyze) de esa consulta: buscar "Filter: ((auth.jwt()"
--     en los nodos de tabla = RLS evaluandose POR FILA
--   - lo mismo para v_registros_incompletos
--   - la RLS sola: count(*) como authenticated vs como dueno
--
-- Pegar ENTERO en el SQL Editor (como postgres). Tarda unos segundos.

begin;

create temp table mediciones (orden serial, etiqueta text, valor text) on commit drop;
-- Parte del bloque corre como `authenticated`; sin esto no podria anotar sus mediciones.
grant insert on mediciones to authenticated;
grant usage, select on sequence mediciones_orden_seq to authenticated;

do $$
declare
    n         int := 1660;   -- <- volumen objetivo del padron
    clave_est text;
    r         record;
    t0        timestamptz;
    ms        numeric;
    bytes     bigint;
    filas     bigint;
    sql_padron text;
    sql_vista  text;
begin
    insert into mediciones (etiqueta, valor) values ('contexto', 'registros reales antes: ' || (select count(*) from registros));
    select clave into clave_est from estacionamientos where activo order by clave limit 1;

    -- ---- volumen sintetico (se deshace con el rollback) ----
    t0 := clock_timestamp();
    insert into registros (id, folio, usuario_nombres, usuario_apellido_paterno, usuario_apellido_materno,
                           tipo_usuario, marca, modelo, color, placas, sin_placas, no_dispositivo,
                           procedencia_tag, estado, fecha_adquisicion, fecha_instalacion, instalado_por, created_at)
    select gen_random_uuid(), 'SATAG-9' || lpad(i::text, 5, '0'),
           'Medicion ' || i, 'Apellido', case when i % 3 = 0 then null else 'Materno' end,
           (array['padres','maestro','alumno','admin'])[1 + i % 4],
           'Nissan', 'Versa', 'Blanco', 'MED-' || lpad(i::text, 4, '0'), false,
           case when i % 5 = 0 then null else lpad((90000000 + i)::text, 8, '0') end,
           'escuela',
           case when i % 5 = 0 then 'pendiente' else 'activo' end,
           current_date - (i % 400), case when i % 5 = 0 then null else current_date - (i % 400) end,
           case when i % 5 = 0 then null else 'TI' end,
           now() - ((i % 400) || ' days')::interval
      from generate_series(1, n) i;

    insert into pagos (registro_id, monto, cobrado_por, folio_recibo, fecha)
    select id, 100, 'Administracion', 'MED-' || folio, fecha_adquisicion
      from registros where folio like 'SATAG-9%' and estado = 'activo';

    insert into movimientos (registro_id, tipo, motivo, hecho_por)
    select id, 'alta', 'Alta por autoservicio', 'autoservicio' from registros where folio like 'SATAG-9%'
    union all
    select id, 'cambio', 'Medicion', 'TI' from registros where folio like 'SATAG-9%' and estado = 'activo';

    if clave_est is not null then
        insert into registro_estacionamientos (registro_id, estacionamiento_clave)
        select id, clave_est from registros where folio like 'SATAG-9%' and estado = 'activo';
    end if;

    insert into solicitudes (registro_id, tipo, detalle, origen)
    select id, 'actualizacion', 'Medicion', 'publico'
      from registros where folio like 'SATAG-9%' and (substring(folio from 8)::int % 10) = 0;

    analyze registros; analyze pagos; analyze movimientos; analyze registro_estacionamientos; analyze solicitudes;
    insert into mediciones (etiqueta, valor) values ('contexto',
        'fabricados ' || n || ' registros + ' || (select count(*) from pagos where folio_recibo like 'MED-%') || ' pagos + ' ||
        (select count(*) from movimientos where motivo in ('Alta por autoservicio','Medicion') and registro_id in (select id from registros where folio like 'SATAG-9%')) || ' movimientos en ' ||
        round(extract(epoch from clock_timestamp() - t0) * 1000) || ' ms · registros ahora: ' || (select count(*) from registros));

    -- ---- como PostgREST: claims aal2 + rol super, rol authenticated ----
    perform set_config('request.jwt.claims',
        '{"role":"authenticated","aal":"aal2","sub":"00000000-0000-0000-0000-000000000000","email":"medicion@example.com","app_metadata":{"rol":"super","provider":"email"}}',
        true);
    execute 'set local role authenticated';

    -- Aproximacion fiel de registros?select=*,pagos(...),registro_estacionamientos(...),solicitudes(...),movimientos(...)&order=created_at.desc
    -- (PostgREST usa LATERAL + json_agg por embed; esto es equivalente).
    sql_padron := $q$
        select r.*, p.j as pagos, e.j as registro_estacionamientos, s.j as solicitudes, m.j as movimientos
          from registros r
          left join lateral (select coalesce(json_agg(json_build_object('monto', monto, 'metodo', metodo, 'cobrado_por', cobrado_por, 'folio_recibo', folio_recibo, 'fecha', fecha, 'created_at', created_at)), '[]') j
                               from pagos where registro_id = r.id) p on true
          left join lateral (select coalesce(json_agg(json_build_object('estacionamiento_clave', estacionamiento_clave)), '[]') j
                               from registro_estacionamientos where registro_id = r.id) e on true
          left join lateral (select coalesce(json_agg(json_build_object('id', id, 'tipo', tipo, 'detalle', detalle, 'atendida', atendida, 'created_at', created_at, 'solicitante_nombre', solicitante_nombre, 'solicitante_rol', solicitante_rol, 'tramite_solicitado', tramite_solicitado, 'alumno_nombre', alumno_nombre, 'alumno_grado', alumno_grado, 'vehiculo_desc', vehiculo_desc)), '[]') j
                               from solicitudes where registro_id = r.id) s on true
          left join lateral (select coalesce(json_agg(json_build_object('tipo', tipo, 'fecha', fecha, 'motivo', motivo, 'hecho_por', hecho_por, 'no_dispositivo_anterior', no_dispositivo_anterior, 'no_dispositivo_nuevo', no_dispositivo_nuevo, 'created_at', created_at)), '[]') j
                               from movimientos where registro_id = r.id) m on true
         order by r.created_at desc$q$;

    -- tiempo de reloj + tamano del JSON que viajaria al navegador (3 repeticiones)
    for k in 1..3 loop
        t0 := clock_timestamp();
        execute 'select count(*), sum(length(row_to_json(t)::text)) from (' || sql_padron || ') t' into filas, bytes;
        ms := round(extract(epoch from clock_timestamp() - t0) * 1000, 1);
        insert into mediciones (etiqueta, valor) values ('padron completo con RLS · corrida ' || k,
            ms || ' ms · ' || filas || ' filas · ' || round(bytes / 1024.0) || ' KB de JSON');
    end loop;
    for r in execute 'explain (analyze, buffers, timing, summary) ' || sql_padron loop
        insert into mediciones (etiqueta, valor) values ('padron completo con RLS · explain', r."QUERY PLAN");
    end loop;

    -- la vista de incompletos (pestanas TI y Consulta)
    sql_vista := 'select * from v_registros_incompletos order by total_motivos desc, dias_desde_alta desc';
    for k in 1..3 loop
        t0 := clock_timestamp();
        execute 'select count(*) from (' || sql_vista || ') t' into filas;
        ms := round(extract(epoch from clock_timestamp() - t0) * 1000, 1);
        insert into mediciones (etiqueta, valor) values ('v_registros_incompletos con RLS · corrida ' || k, ms || ' ms · ' || filas || ' filas');
    end loop;
    for r in execute 'explain (analyze, buffers, timing, summary) ' || sql_vista loop
        insert into mediciones (etiqueta, valor) values ('v_registros_incompletos · explain', r."QUERY PLAN");
    end loop;

    -- la RLS sola: count(*) con politicas (authenticated) ...
    for r in execute 'explain (analyze, timing, summary) select count(*) from registros' loop
        insert into mediciones (etiqueta, valor) values ('count(*) registros como authenticated (RLS) · explain', r."QUERY PLAN");
    end loop;
    -- ... y sin ellas (dueno)
    execute 'reset role';
    for r in execute 'explain (analyze, timing, summary) select count(*) from registros' loop
        insert into mediciones (etiqueta, valor) values ('count(*) registros como postgres (sin RLS) · explain', r."QUERY PLAN");
    end loop;
end $$;

-- Ultimo resultado = lo que muestra el editor. El rollback de abajo lo deshace todo.
select orden, etiqueta, valor from mediciones order by orden;

rollback;
