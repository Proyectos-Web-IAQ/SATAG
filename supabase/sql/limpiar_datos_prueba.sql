-- =====================================================================
-- limpiar_datos_prueba.sql  —  DEJA EL PADRON VACIO (SOLO DESARROLLO / QA)
--
-- !!! ADVERTENCIA !!!  Este script BORRA TODOS LOS EXPEDIENTES y todo lo que
-- cuelga de ellos: pagos, cortes de caja, solicitudes, notas del buzon,
-- estacionamientos asignados, movimientos y aceptaciones (la evidencia de
-- firma). No se puede deshacer.
--
-- Es el inverso de `seed_tests_dev.sql`: aquel LLENA la base con el banco de
-- QA; este la DEJA VACIA, para arrancar una prueba de campo con datos reales
-- sin que se mezclen con los ficticios. No es una migracion: no lleva numero
-- de bloque y no entra en el flujo normal de la carpeta.
--
-- LO QUE **NO** TOCA (a proposito, porque sin esto el alta no funciona):
--   - Catalogos: cat_marcas, cat_modelos, cat_colores, estacionamientos
--   - Documentos legales: aviso_versiones, reglamento_versiones
--   - Cuentas del personal: auth.users, roles y factores de MFA
--   - Los archivos PNG del bucket `firmas` (Storage). Ver el PASO 4.
--
-- Se corre por PASOS, de arriba hacia abajo. El paso destructivo esta blindado
-- y no se ejecuta si no se declara la intencion de forma explicita.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 1 — INVENTARIO. Solo lee. Corralo primero y mire lo que va a perder.
-- ---------------------------------------------------------------------
select 'registros'                as tabla, count(*) as filas from registros
union all select 'aceptaciones (evidencia de firma)', count(*) from aceptaciones
union all select 'pagos',                             count(*) from pagos
union all select 'cortes_caja',                       count(*) from cortes_caja
union all select 'solicitudes y notas',               count(*) from solicitudes
union all select 'registro_estacionamientos',         count(*) from registro_estacionamientos
union all select 'movimientos',                       count(*) from movimientos
order by tabla;

-- Desglose por folio, para reconocer si hay algo que NO sea del banco de QA.
-- Los folios del seed son SATAG-000101..000226. Cualquier otro folio salio de
-- un alta hecha a mano por el formulario y puede ser evidencia de una prueba.
select folio, usuario_nombre_completo, estado, created_at,
       case when folio between 'SATAG-000101' and 'SATAG-000226'
            then 'banco de QA (seed)'
            else '*** NO ES DEL SEED: revise antes de borrar ***'
       end as procedencia
  from registros
 order by folio;


-- ---------------------------------------------------------------------
-- PASO 2 — RESCATE DE EVIDENCIA. Solo lee.
--
-- Hay altas hechas a mano durante la ejecucion de pruebas que documentan un
-- defecto y valen como evidencia de auditoria (el caso conocido es el folio
-- SATAG-000302, que quedo como prueba de D-01: se envio con las versiones de
-- consentimiento en null). Si borra sin exportar, esa evidencia se pierde.
--
-- Copie el resultado de esta consulta y guardelo en la carpeta de evidencia
-- antes de continuar.
-- ---------------------------------------------------------------------
select jsonb_pretty(jsonb_agg(fila)) as evidencia_a_conservar
  from (
    select to_jsonb(r) - 'id' || jsonb_build_object(
             'aceptacion', (select to_jsonb(a) - 'id' - 'registro_id'
                              from aceptaciones a where a.registro_id = r.id),
             'pagos',      (select coalesce(jsonb_agg(to_jsonb(p) - 'id' - 'registro_id'), '[]'::jsonb)
                              from pagos p where p.registro_id = r.id)
           ) as fila
      from registros r
     where r.folio not between 'SATAG-000101' and 'SATAG-000226'
  ) s;


-- ---------------------------------------------------------------------
-- PASO 3 — BORRADO. Este es el que no se puede deshacer.
--
-- Para que corra hay que declarar la intencion en la MISMA sesion del editor,
-- ejecutando primero esta linea sola:
--
--     set satag.confirmo_borrado = 'SI, BORRAR TODO';
--
-- Sin eso el script aborta sin tocar nada. El candado existe porque este
-- archivo vive junto a los bloques de migracion y un "Run all" distraido
-- vaciaria el padron.
-- ---------------------------------------------------------------------
do $$
declare
    v_confirma   text := coalesce(current_setting('satag.confirmo_borrado', true), '');
    v_registros  bigint;
    v_cortes     bigint;
begin
    if v_confirma <> 'SI, BORRAR TODO' then
        raise exception
            'Borrado cancelado: falta la confirmacion. Ejecute primero  set satag.confirmo_borrado = ''SI, BORRAR TODO'';  y vuelva a correr este paso.';
    end if;

    select count(*) into v_registros from registros;
    select count(*) into v_cortes    from cortes_caja;

    -- Desde el bloque 42, `pagos` y `cortes_caja` estan BLINDADOS: hay triggers
    -- que prohiben borrar, truncar o reescribir un cobro ya cortado. Ese
    -- blindaje es justo lo que impide que este script destruya una base donde
    -- Administracion ya corto caja de verdad. Se baja solo mientras dura la
    -- limpieza. Si esa idea le incomoda, hagale caso: es la senal de que este
    -- script no debe correrse aqui.
    if to_regclass('public.cortes_caja') is not null then
        execute 'alter table pagos       disable trigger tg_pagos_no_borrar_sellado';
        execute 'alter table pagos       disable trigger tg_pagos_no_truncar_sellado';
        execute 'alter table pagos       disable trigger tg_pagos_congelar_sellado';
        execute 'alter table cortes_caja disable trigger tg_cortes_inmutables';

        -- cascade vacia todo lo que referencia a registros: aceptaciones,
        -- movimientos, pagos, registro_estacionamientos y solicitudes (incluidas
        -- las notas del buzon que nunca se vincularon a un expediente).
        execute 'truncate table registros cascade';
        -- cortes_caja no cuelga de registros: es pagos quien la referencia, asi
        -- que el cascade no la alcanza y se vacia aparte.
        execute 'truncate table cortes_caja cascade';

        execute 'alter table pagos       enable trigger tg_pagos_no_borrar_sellado';
        execute 'alter table pagos       enable trigger tg_pagos_no_truncar_sellado';
        execute 'alter table pagos       enable trigger tg_pagos_congelar_sellado';
        execute 'alter table cortes_caja enable trigger tg_cortes_inmutables';
    else
        -- Base anterior al bloque 42.
        execute 'truncate table registros cascade';
    end if;

    -- Los contadores vuelven a empezar, para que la primera alta real sea
    -- SATAG-000001 y el primer recibo el 1. Si prefiere conservar la numeracion
    -- corrida (por ejemplo para que ningun folio se repita nunca en la vida del
    -- sistema), comente estas tres lineas.
    perform setval('registros_folio_seq',    1, false);
    perform setval('pagos_folio_recibo_seq', 1, false);
    if to_regclass('public.cortes_caja') is not null then
        perform setval('cortes_caja_folio_seq', 1, false);
    end if;

    raise notice 'Padron vacio. Se borraron % expediente(s) y % corte(s) de caja.', v_registros, v_cortes;
    raise notice 'Los catalogos, los documentos legales y las cuentas del personal quedaron intactos.';
end;
$$;


-- ---------------------------------------------------------------------
-- PASO 4 — STORAGE (las imagenes de firma). Aparte, y a mano.
--
-- SQL vacio las tablas, pero los PNG de las firmas viven en el bucket privado
-- `firmas` de Storage y NO se borran con un truncate: quedan huerfanos,
-- ocupando espacio y conservando la imagen de una firma manuscrita, que es
-- justo el dato mas sensible del sistema.
--
-- Primero vea que hay:
-- ---------------------------------------------------------------------
select name, created_at, round((metadata->>'size')::numeric / 1024, 1) as kb
  from storage.objects
 where bucket_id = 'firmas'
 order by created_at;

-- Para borrarlos, la via BUENA es el Dashboard (Storage -> firmas -> seleccionar
-- -> Delete) o el CLI, porque ademas del renglon eliminan el archivo fisico.
--
-- Si prefiere hacerlo desde aqui, descomente la linea de abajo. Ojo: borra el
-- renglon de metadatos y el objeto asociado, pero si su proyecto tiene el
-- recolector de basura de Storage en pausa, el archivo puede tardar en irse.
-- Deje fuera `qa-firma-demo.png` si quiere conservar la imagen de demostracion
-- que el seed usa para que se vea algo en el panel.
--
-- delete from storage.objects
--  where bucket_id = 'firmas' and name <> 'qa-firma-demo.png';


-- ---------------------------------------------------------------------
-- PASO 5 — VERIFICACION. Debe salir todo en cero arriba, y con filas abajo.
-- ---------------------------------------------------------------------
select 'DEBE ESTAR VACIO' as bloque, 'registros'    as tabla, count(*) as filas from registros
union all select 'DEBE ESTAR VACIO', 'aceptaciones',              count(*) from aceptaciones
union all select 'DEBE ESTAR VACIO', 'pagos',                     count(*) from pagos
union all select 'DEBE ESTAR VACIO', 'cortes_caja',               count(*) from cortes_caja
union all select 'DEBE ESTAR VACIO', 'solicitudes',               count(*) from solicitudes
union all select 'DEBE ESTAR VACIO', 'registro_estacionamientos', count(*) from registro_estacionamientos
union all select 'DEBE ESTAR VACIO', 'movimientos',               count(*) from movimientos
union all select 'DEBE SEGUIR AHI',  'cat_marcas',                count(*) from cat_marcas
union all select 'DEBE SEGUIR AHI',  'cat_modelos',               count(*) from cat_modelos
union all select 'DEBE SEGUIR AHI',  'cat_colores',               count(*) from cat_colores
union all select 'DEBE SEGUIR AHI',  'estacionamientos',          count(*) from estacionamientos
union all select 'DEBE SEGUIR AHI',  'aviso_versiones',           count(*) from aviso_versiones
union all select 'DEBE SEGUIR AHI',  'reglamento_versiones',      count(*) from reglamento_versiones
order by bloque desc, tabla;

-- El aviso y el reglamento vigentes tienen que seguir en pie, o el formulario
-- publico no deja pasar del paso del consentimiento (es el cerrojo de D-01).
select 'aviso'      as documento, version, vigente from aviso_versiones      where vigente
union all
select 'reglamento', version, vigente             from reglamento_versiones where vigente;

-- Y el personal con su rol, para que el panel siga siendo alcanzable.
select u.email,
       u.raw_app_meta_data ->> 'rol'                as rol,
       u.confirmed_at is not null                   as cuenta_activada,
       (select count(*) from auth.mfa_factors f
         where f.user_id = u.id and f.status = 'verified') > 0 as tiene_mfa
  from auth.users u
 order by u.email;
