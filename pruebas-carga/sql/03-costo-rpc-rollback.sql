-- FASE 2 · Costo de las ESCRITURAS publicas medido en la base real SIN dejar
-- rastro: todo corre dentro de una transaccion que termina en ROLLBACK.
--
-- Por que asi y no con k6: no existe staging todavia y el padron es real.
-- crear_registro escribe en registros + aceptaciones + movimientos; bombardearlo
-- desde k6 dejaria cientos de expedientes falsos. Aqui se ejecuta N veces, se
-- mide con clock_timestamp() y se deshace todo.
--
-- LO UNICO QUE NO SE DESHACE: nextval('registros_folio_seq'). Cada llamada a
-- crear_registro consume un folio (SATAG-000xxx) y ese numero queda saltado
-- para siempre. Por eso N=20 por omision (bajar a 3 si molesta).
--
-- Que devuelve: UNA tabla (el editor solo muestra el ultimo resultado) con
--   - el plan y el tiempo de UNA llamada a crear_registro (explain analyze)
--   - promedio / mejor / peor de N llamadas a crear_registro
--   - promedio de N llamadas a crear_solicitud (camino "no coincide" y, a
--     partir de la 11.a, el camino "limite alcanzado" del bloque 51)
--   - promedio de 9 llamadas a crear_nota_solicitud
-- Es tiempo DENTRO de Postgres. No incluye PostgREST ni la subida del PNG.
--
-- Pegar ENTERO en el SQL Editor (como postgres).

begin;

create temp table mediciones (orden serial, etiqueta text, valor text) on commit drop;

select set_config('request.headers',
    '{"x-forwarded-for":"203.0.113.10","user-agent":"satag-medicion-fase2"}', true);

do $$
declare
    n        int := 20;   -- <- llamadas a crear_registro (cada una salta un folio)
    n_sol    int := 20;   -- crear_solicitud: 10 fallan por "no coincide", 10 por limite
    n_nota   int := 9;    -- crear_nota_solicitud: el bloque 51 corta en 10 por IP/hora
    reg_id   uuid;
    aviso_id uuid;
    t0       timestamptz;
    dt       interval;
    total    interval := '0';
    peor     interval := '0';
    mejor    interval := '1 hour';
    r        record;
    j        jsonb;
    sql_una  text;
begin
    select id into reg_id from reglamento_versiones where vigente limit 1;
    select id into aviso_id from aviso_versiones where vigente limit 1;

    insert into mediciones (etiqueta, valor) values ('contexto', 'registros antes: ' || (select count(*) from registros));

    -- 1) UNA llamada con plan (explain analyze capturado linea a linea)
    sql_una := format($q$
        select crear_registro(
            p_usuario_nombres => 'Medicion', p_usuario_apellido_paterno => 'Fase Dos',
            p_tipo_usuario => 'padres', p_marca => 'Nissan', p_modelo => 'Versa', p_color => 'Blanco',
            p_placas => 'MED-000', p_sin_placas => false,
            p_firma_url => 'firmas/00000000-0000-0000-0000-000000000000.png',
            p_firma_imagen_sha256 => %L,
            p_firma_trazos => '{"width":600,"height":200,"trazos":[[[1,1,0],[2,2,10],[3,3,20]]]}'::jsonb,
            p_metadata => '{"app":"satag-medicion"}'::jsonb,
            p_firmante_nombre => 'Medicion Fase Dos', p_firmante_rol => 'usuario',
            p_reglamento_version_id => %L, p_aviso_version_id => %L)$q$,
        repeat('0', 64), reg_id, aviso_id);
    for r in execute 'explain (analyze, buffers, timing, summary) ' || sql_una loop
        insert into mediciones (etiqueta, valor) values ('crear_registro · explain (1 llamada)', r."QUERY PLAN");
    end loop;

    -- 2) N llamadas seguidas
    for i in 1..n loop
        t0 := clock_timestamp();
        perform crear_registro(
            p_usuario_nombres => 'Medicion', p_usuario_apellido_paterno => 'Fase Dos',
            p_tipo_usuario => 'padres', p_marca => 'Nissan', p_modelo => 'Versa', p_color => 'Blanco',
            p_placas => 'MED-' || lpad(i::text, 3, '0'), p_sin_placas => false,
            p_firma_url => 'firmas/00000000-0000-0000-0000-000000000000.png',
            p_firma_imagen_sha256 => repeat('0', 64),
            p_firma_trazos => '{"width":600,"height":200,"trazos":[[[1,1,0],[2,2,10],[3,3,20]]]}'::jsonb,
            p_metadata => '{"app":"satag-medicion"}'::jsonb,
            p_firmante_nombre => 'Medicion Fase Dos', p_firmante_rol => 'usuario',
            p_reglamento_version_id => reg_id, p_aviso_version_id => aviso_id);
        dt := clock_timestamp() - t0;
        total := total + dt;
        if dt > peor then peor := dt; end if;
        if dt < mejor then mejor := dt; end if;
        insert into mediciones (etiqueta, valor) values ('crear_registro · llamada ' || i, round(extract(epoch from dt) * 1000, 2)::text || ' ms');
    end loop;
    insert into mediciones (etiqueta, valor) values ('crear_registro · RESUMEN x' || n,
        'promedio ' || round(extract(epoch from total) * 1000 / n, 2) || ' ms · mejor ' ||
        round(extract(epoch from mejor) * 1000, 2) || ' ms · peor ' || round(extract(epoch from peor) * 1000, 2) || ' ms');

    -- 3) crear_solicitud, folio inexistente: las primeras 10 recorren
    --    count(intentos) + select registros + insert intento; de la 11.a en
    --    adelante el bloque 51 responde antes del select.
    total := '0'; peor := '0'; mejor := '1 hour';
    for i in 1..n_sol loop
        t0 := clock_timestamp();
        j := crear_solicitud('SATAG-999999', 'XXX-' || i, 'actualizacion', 'medicion fase 2');
        dt := clock_timestamp() - t0;
        total := total + dt;
        if dt > peor then peor := dt; end if;
        if dt < mejor then mejor := dt; end if;
        if i in (1, 10, 11, n_sol) then
            insert into mediciones (etiqueta, valor) values ('crear_solicitud · llamada ' || i, round(extract(epoch from dt) * 1000, 2) || ' ms · ' || j::text);
        end if;
    end loop;
    insert into mediciones (etiqueta, valor) values ('crear_solicitud (no coincide) · RESUMEN x' || n_sol,
        'promedio ' || round(extract(epoch from total) * 1000 / n_sol, 2) || ' ms · mejor ' ||
        round(extract(epoch from mejor) * 1000, 2) || ' ms · peor ' || round(extract(epoch from peor) * 1000, 2) || ' ms');

    -- 4) crear_nota_solicitud (buzon sin folio)
    total := '0'; peor := '0'; mejor := '1 hour';
    for i in 1..n_nota loop
        t0 := clock_timestamp();
        perform crear_nota_solicitud('Medicion', 'maestro', 'actualizacion', null, null, 'medicion fase 2 ' || i, null);
        dt := clock_timestamp() - t0;
        total := total + dt;
        if dt > peor then peor := dt; end if;
        if dt < mejor then mejor := dt; end if;
    end loop;
    insert into mediciones (etiqueta, valor) values ('crear_nota_solicitud · RESUMEN x' || n_nota,
        'promedio ' || round(extract(epoch from total) * 1000 / n_nota, 2) || ' ms · mejor ' ||
        round(extract(epoch from mejor) * 1000, 2) || ' ms · peor ' || round(extract(epoch from peor) * 1000, 2) || ' ms');

    insert into mediciones (etiqueta, valor) values ('contexto', 'registros dentro de la transaccion (antes del rollback): ' || (select count(*) from registros));
end $$;

-- Ultimo resultado = lo que muestra el editor. El rollback de abajo lo deshace todo.
select orden, etiqueta, valor from mediciones order by orden;

rollback;
