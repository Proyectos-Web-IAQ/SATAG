-- FASE 3 · Limpieza de lo que deja flujo-completo.js en STAGING.
--
-- Borra los expedientes de prueba (usuario 'Prueba Carga' + observaciones
-- 'PRUEBA DE CARGA'); por cascada caen aceptaciones, pagos, movimientos,
-- registro_estacionamientos y solicitudes. Devuelve UNA tabla con lo borrado
-- y la lista de PNG que quedaron en Storage: esos se borran con
--   node pruebas-carga/limpiar-storage.mjs   (service_role en el entorno)
-- porque un disparador de Supabase impide borrar storage.objects por SQL.
--
-- Si registrar_pago corrio y despues alguien hizo cortar_caja en staging, los
-- pagos sellados bloquean el borrado (tg_pagos_no_borrar_sellado) y este
-- script falla entero: es el comportamiento contable esperado; en ese caso
-- reconstruir staging.
--
-- Pegar entero en el SQL Editor de STAGING (verificar el ref antes).

create temp table limpieza (orden serial, etiqueta text, valor text) on commit drop;

do $$
declare
    n_reg int; n_png int;
begin
    insert into limpieza (etiqueta, valor)
    select 'png en storage (borrar con limpiar-storage.mjs)', a.firma_url
      from aceptaciones a join registros r on r.id = a.registro_id
     where r.observaciones = 'PRUEBA DE CARGA' and r.usuario_nombres = 'Prueba Carga';
    get diagnostics n_png = row_count;

    delete from registros
     where observaciones = 'PRUEBA DE CARGA' and usuario_nombres = 'Prueba Carga';
    get diagnostics n_reg = row_count;

    insert into limpieza (etiqueta, valor) values
        ('registros borrados (con cascada)', n_reg::text),
        ('png listados', n_png::text),
        ('registros que quedan', (select count(*)::text from registros)),
        ('pagos que quedan', (select count(*)::text from pagos));
end $$;

select orden, etiqueta, valor from limpieza order by orden;
