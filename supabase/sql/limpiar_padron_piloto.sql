-- =====================================================================
-- limpiar_padron_piloto.sql  —  DEJA EL PADRON VACIO CONSERVANDO EL INVENTARIO
--
-- !!! ADVERTENCIA !!!  Borra TODOS los expedientes y lo que cuelga de ellos
-- (pagos, cortes de caja, solicitudes y notas, estacionamientos asignados,
-- movimientos y aceptaciones). No se puede deshacer.
--
-- Es la version del piloto de limpiar_datos_prueba.sql: la diferencia es que
-- CONSERVA la tabla inventario_tags (bloque 52) —todos los TAGs vuelven a
-- estar disponibles— y borra con DELETE, porque un `truncate registros
-- cascade` arrastraria el inventario (lo referencia por asignado_a).
--
-- LO QUE **NO** TOCA: inventario_tags (solo libera las reservas), catalogos,
-- documentos legales, cuentas del personal (auth.users, roles, MFA) y los
-- PNG del bucket `firmas` (ver PASO 4 de limpiar_datos_prueba.sql).
--
-- Se corre por PASOS. El destructivo esta blindado con la misma confirmacion.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — INVENTARIO. Solo lee: lo que se va a perder y lo que se conserva.
-- ---------------------------------------------------------------------
select 'SE BORRA'  as bloque, 'registros'                 as tabla, count(*) as filas from registros
union all select 'SE BORRA',  'aceptaciones',              count(*) from aceptaciones
union all select 'SE BORRA',  'pagos',                     count(*) from pagos
union all select 'SE BORRA',  'cortes_caja',               count(*) from cortes_caja
union all select 'SE BORRA',  'solicitudes y notas',       count(*) from solicitudes
union all select 'SE BORRA',  'registro_estacionamientos', count(*) from registro_estacionamientos
union all select 'SE BORRA',  'movimientos',               count(*) from movimientos
union all select 'SE CONSERVA (se liberan reservas)', 'inventario_tags', count(*) from inventario_tags
order by bloque desc, tabla;

select folio, usuario_nombre_completo, estado, no_dispositivo, created_at
  from registros
 order by folio;

-- ---------------------------------------------------------------------
-- PASO 2 — BORRADO. Ejecute primero, sola, esta linea en la misma sesion:
--
--     set satag.confirmo_borrado = 'SI, BORRAR TODO';
--
-- y despues este bloque. Sin la confirmacion aborta sin tocar nada.
-- ---------------------------------------------------------------------
do $$
declare
    v_confirma   text := coalesce(current_setting('satag.confirmo_borrado', true), '');
    v_registros  bigint;
    v_cortes     bigint;
    v_liberados  bigint;
begin
    if v_confirma <> 'SI, BORRAR TODO' then
        raise exception
            'Borrado cancelado: falta la confirmacion. Ejecute primero  set satag.confirmo_borrado = ''SI, BORRAR TODO'';  y vuelva a correr este paso.';
    end if;

    select count(*) into v_registros from registros;
    select count(*) into v_cortes    from cortes_caja;

    -- Libera todas las reservas/asignaciones del inventario: los TAGs quedan
    -- disponibles y registros deja de estar referenciada.
    update inventario_tags
       set asignado_a = null, asignado_en = null, asignado_por = null
     where asignado_a is not null;
    get diagnostics v_liberados = row_count;

    -- pagos y cortes_caja estan blindados por triggers (bloque 42); se bajan
    -- solo mientras dura la limpieza.
    execute 'alter table pagos       disable trigger tg_pagos_no_borrar_sellado';
    execute 'alter table pagos       disable trigger tg_pagos_no_truncar_sellado';
    execute 'alter table pagos       disable trigger tg_pagos_congelar_sellado';
    execute 'alter table cortes_caja disable trigger tg_cortes_inmutables';

    -- DELETE (no truncate): las tablas hijas caen por on delete cascade y el
    -- inventario NO se toca. cortes_caja no cuelga de registros: aparte.
    delete from registros;
    delete from solicitudes;      -- notas del buzon sin expediente (registro_id null)
    delete from cortes_caja;

    execute 'alter table pagos       enable trigger tg_pagos_no_borrar_sellado';
    execute 'alter table pagos       enable trigger tg_pagos_no_truncar_sellado';
    execute 'alter table pagos       enable trigger tg_pagos_congelar_sellado';
    execute 'alter table cortes_caja enable trigger tg_cortes_inmutables';

    -- Folios y recibos vuelven a empezar: el primer expediente del piloto sera
    -- SATAG-000001. Comente estas lineas si prefiere numeracion corrida.
    perform setval('registros_folio_seq',    1, false);
    perform setval('pagos_folio_recibo_seq', 1, false);
    perform setval('cortes_caja_folio_seq',  1, false);

    raise notice 'Padron vacio. Se borraron % expediente(s) y % corte(s) de caja; % TAG(s) del inventario quedaron disponibles.',
        v_registros, v_cortes, v_liberados;
end;
$$;

-- ---------------------------------------------------------------------
-- PASO 3 — VERIFICACION.
-- ---------------------------------------------------------------------
select 'DEBE ESTAR VACIO' as bloque, 'registros'    as tabla, count(*) as filas from registros
union all select 'DEBE ESTAR VACIO', 'aceptaciones',              count(*) from aceptaciones
union all select 'DEBE ESTAR VACIO', 'pagos',                     count(*) from pagos
union all select 'DEBE ESTAR VACIO', 'cortes_caja',               count(*) from cortes_caja
union all select 'DEBE ESTAR VACIO', 'solicitudes',               count(*) from solicitudes
union all select 'DEBE ESTAR VACIO', 'registro_estacionamientos', count(*) from registro_estacionamientos
union all select 'DEBE ESTAR VACIO', 'movimientos',               count(*) from movimientos
union all select 'DEBE SEGUIR AHI',  'inventario_tags (todos disponibles)', count(*) from inventario_tags where asignado_a is null
union all select 'DEBE SEGUIR AHI',  'cat_marcas',                count(*) from cat_marcas
union all select 'DEBE SEGUIR AHI',  'cat_colores',               count(*) from cat_colores
union all select 'DEBE SEGUIR AHI',  'estacionamientos',          count(*) from estacionamientos
union all select 'DEBE SEGUIR AHI',  'aviso_versiones',           count(*) from aviso_versiones
union all select 'DEBE SEGUIR AHI',  'reglamento_versiones',      count(*) from reglamento_versiones
order by bloque desc, tabla;

select u.email, u.raw_app_meta_data ->> 'rol' as rol
  from auth.users u
 order by u.email;

-- PASO 4 — Las imagenes de firma del bucket `firmas` no se borran con SQL:
-- use pruebas-carga/limpiar-storage.mjs o el Dashboard (Storage -> firmas).
