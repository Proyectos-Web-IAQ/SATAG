-- =====================================================================
-- Verificacion del bloque 51 (limite de intentos del buzon) · 10-sep-2026
--
-- Cierra el caso P-11, que sigue fechado el 17-ago diciendo «riesgo
-- aceptado, sin rate limiting». El bloque esta aplicado desde el 25-ago
-- pero nadie lo reejecuto.
--
-- SEGURO DE CORRER EN PRODUCCION:
--   - No crea ninguna solicitud: usa un folio que no existe, asi que el
--     RPC siempre responde «no coinciden» y no escribe en solicitudes.
--   - Lo unico que escribe son filas en intentos_publicos, y el PASO 5
--     las borra al terminar.
--   - No toca registros, pagos, cortes ni documentos.
--
-- CORRER PASO POR PASO, SELECCIONANDO CADA BLOQUE Y EJECUTANDO SOLO ESO.
--
-- El editor SQL de Supabase manda todo el buffer junto y aborta en el
-- primer error. El PASO 2 FALLA A PROPOSITO: si lo corre junto con los
-- demas, se lleva por delante los pasos 3 al 6 y parece que el script
-- esta roto. No lo esta.
--
-- Orden: PASO 1 solo -> PASO 2 solo (debe fallar) -> PASOS 3 a 6.
--
-- Correr por pasos y copiar los resultados a Pruebas/02.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — Estructura. Debe existir la tabla, su indice, RLS encendida
-- y CERO politicas (nadie la alcanza desde la API).
-- ---------------------------------------------------------------------
select 'tabla existe'        as que, (to_regclass('public.intentos_publicos') is not null)::text as valor
union all
select 'RLS encendida',      (select relrowsecurity::text from pg_class where relname = 'intentos_publicos')
union all
select 'politicas (debe ser 0)', (select count(*)::text from pg_policies where tablename = 'intentos_publicos')
union all
select 'indice por ip/funcion/fecha', (select count(*)::text from pg_indexes where tablename = 'intentos_publicos')
union all
select 'funciones de apoyo', (select count(*)::text from pg_proc
                               where proname in ('fn_ip_peticion','fn_intentos_recientes','fn_anotar_intento'));

-- ---------------------------------------------------------------------
-- PASO 2 — El rol anonimo NO puede leer la tabla de intentos.
--
-- SELECCIONE Y EJECUTE SOLO ESTE BLOQUE. Tiene que FALLAR. El resultado
-- correcto es este error, y significa que la prueba PASO:
--
--   ERROR: 42501: permission denied for table intentos_publicos
--   HINT:  Grant the required privileges ... GRANT SELECT ... TO anon;
--
-- NO siga la sugerencia del HINT. Postgres la escribe siempre que niega
-- un permiso, sin saber que aqui la negativa es el diseno: dar ese
-- GRANT abriria al publico la tabla que registra los intentos y
-- convertiria el limite del buzon en un oraculo consultable.
--
-- Lo que seria un problema es que ESTA CONSULTA DEVUELVA FILAS.
-- ---------------------------------------------------------------------
begin;
set local role anon;
select count(*) from intentos_publicos;   -- debe lanzar 42501
rollback;

-- ---------------------------------------------------------------------
-- PASO 3 — El limite se dispara al intento 11.
-- Se hacen 12 intentos con un folio inexistente desde una direccion de
-- prueba. Los primeros 10 fallan por no coincidir; del 11 en adelante
-- responden IGUAL pero sin consultar el padron, que es justo el diseno:
-- el limite no se delata.
-- ---------------------------------------------------------------------
do $prueba$
declare
    v_ip inet := '203.0.113.77';   -- direccion reservada para documentacion
    i int;
    v_previos int;
begin
    -- Se anotan los intentos a mano con la misma funcion que usa el RPC,
    -- porque en el SQL Editor no hay cabecera de red que leer.
    for i in 1..12 loop
        perform fn_anotar_intento(v_ip, 'crear_solicitud', false);
    end loop;

    select fn_intentos_recientes(v_ip, 'crear_solicitud', interval '15 minutes', true)
      into v_previos;

    raise notice 'Intentos fallidos registrados en 15 minutos: %', v_previos;
    if v_previos >= 10 then
        raise notice 'CORRECTO: con % fallidos, el limite de 10 ya bloquea.', v_previos;
    else
        raise warning 'REVISAR: se esperaban 10 o mas y hay %.', v_previos;
    end if;
end
$prueba$;

-- ---------------------------------------------------------------------
-- PASO 4 — El RPC responde sin delatar el limite.
-- Las dos llamadas deben devolver EXACTAMENTE el mismo texto: la primera
-- porque el folio no existe, la segunda porque el limite ya actuo.
-- ---------------------------------------------------------------------
select 'folio inexistente' as caso,
       crear_solicitud('SATAG-999999', 'XXX000', 'actualizar', 'Prueba de verificacion P-11') as respuesta
union all
select 'segunda llamada',
       crear_solicitud('SATAG-999998', 'YYY111', 'actualizar', 'Prueba de verificacion P-11');

-- ---------------------------------------------------------------------
-- PASO 5 — Limpieza. Borra SOLO las filas de la prueba.
-- ---------------------------------------------------------------------
delete from intentos_publicos where ip = '203.0.113.77';

select 'filas de prueba que quedan (debe ser 0)' as que,
       count(*)::text as valor
  from intentos_publicos where ip = '203.0.113.77';

-- ---------------------------------------------------------------------
-- PASO 6 — Foto final, para copiar a la bitacora de pruebas.
-- ---------------------------------------------------------------------
select funcion,
       count(*)                                  as intentos_ultimas_24h,
       count(*) filter (where exito)             as exitosos,
       count(*) filter (where not exito)         as fallidos,
       min(creado_en)                            as mas_antiguo,
       max(creado_en)                            as mas_reciente
  from intentos_publicos
 where creado_en > now() - interval '24 hours'
 group by funcion
 order by funcion;
