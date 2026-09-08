-- FASE 3 · Despues de limpiar-pruebas-carga.sql en el PROYECTO REAL (ventana
-- antes de la liberacion): devuelve las secuencias de folio al ultimo folio
-- que de verdad existe, para que la prueba no deje huecos en la numeracion
-- de altas (SATAG-000xxx) ni de recibos (SATAG-AAAA-xxxxxx).
--
-- SOLO tiene sentido mientras no haya operacion real en medio: si entre la
-- prueba y esta limpieza entro un alta o un cobro de verdad, la secuencia se
-- restablece igual al maximo real, que ya incluye ese folio (no se pierde nada;
-- solo se rellenan los huecos que dejo la prueba).
--
-- Devuelve UNA tabla con el antes/despues. Pegar entero en el SQL Editor.

create temp table secuencias (orden serial, etiqueta text, valor text) on commit drop;

do $$
declare
    v_max_reg bigint; v_max_pago bigint; v_antes_reg bigint; v_antes_pago bigint;
begin
    select last_value into v_antes_reg from registros_folio_seq;
    select last_value into v_antes_pago from pagos_folio_recibo_seq;

    select max(substring(folio from '^SATAG-([0-9]+)$')::bigint) into v_max_reg from registros;
    select max(substring(folio_recibo from '^SATAG-[0-9]{4}-([0-9]+)$')::bigint) into v_max_pago
      from pagos where folio_recibo ~ '^SATAG-[0-9]{4}-[0-9]+$';

    if v_max_reg is null then perform setval('registros_folio_seq', 1, false);
    else perform setval('registros_folio_seq', v_max_reg, true); end if;

    if v_max_pago is null then perform setval('pagos_folio_recibo_seq', 1, false);
    else perform setval('pagos_folio_recibo_seq', v_max_pago, true); end if;

    insert into secuencias (etiqueta, valor) values
        ('registros_folio_seq antes', v_antes_reg::text),
        ('folio real maximo en registros', coalesce(v_max_reg::text, '(ninguno)')),
        ('registros_folio_seq ahora (siguiente = +1)', (select last_value::text from registros_folio_seq)),
        ('pagos_folio_recibo_seq antes', v_antes_pago::text),
        ('recibo real maximo en pagos', coalesce(v_max_pago::text, '(ninguno)')),
        ('pagos_folio_recibo_seq ahora (siguiente = +1)', (select last_value::text from pagos_folio_recibo_seq)),
        ('expedientes de prueba que quedan (debe ser 0)', (select count(*)::text from registros where observaciones = 'PRUEBA DE CARGA'));
end $$;

select orden, etiqueta, valor from secuencias order by orden;
