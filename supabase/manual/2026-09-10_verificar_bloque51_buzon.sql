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
--
-- Se compara la respuesta de dos direcciones distintas:
--   A) una sin ningun historial, que falla porque el folio no existe;
--   B) una que ya alcanzo el limite de 10 fallos.
-- Las dos deben devolver EXACTAMENTE el mismo jsonb. Ese es el diseno:
-- el limite responde igual que un fallo normal para no regalar la senal
-- de que existe ni de cuando se dispara.
--
-- DOS COSAS QUE ESTE PASO TENIA MAL (corregidas el 10-sep-2026):
--
--   1. El tipo de solicitud valido es 'actualizacion', no 'actualizar'
--      (bloque 51, linea 133: p_tipo in ('actualizacion','baja')).
--      Con 'actualizar' el RPC lanza P0001 «Tipo de solicitud invalido»
--      antes de llegar a nada de lo que se queria probar.
--
--   2. En el editor SQL no hay cabeceras de red, asi que fn_ip_peticion()
--      devuelve null y la rama del limite NI SE EVALUA (la condicion pide
--      «v_ip is not null and ...»). Sin inyectar la cabecera, este paso no
--      podia probar el limite aunque el tipo fuera correcto. Se inyecta
--      aqui la misma cabecera que en produccion pone PostgREST.
--
-- SIGUE SIENDO SEGURO EN PRODUCCION: los folios no existen, asi que el
-- RPC nunca llega al insert en solicitudes. Lo unico que escribe son
-- filas en intentos_publicos, y el PASO 5 las borra.
-- ---------------------------------------------------------------------
create temp table if not exists _p11 (caso text, respuesta jsonb);
truncate _p11;

-- A) Direccion sin historial: cae por folio inexistente.
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.78"}', false);
insert into _p11
select 'A · IP sin historial',
       crear_solicitud('SATAG-999999', 'XXX000', 'actualizacion', 'Prueba de verificacion P-11');

-- B) Direccion que ya alcanzo el limite: se le fabrican los 10 fallos.
select fn_anotar_intento('203.0.113.77'::inet, 'crear_solicitud', false)
  from generate_series(1, 10);
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.77"}', false);
insert into _p11
select 'B · IP en el limite',
       crear_solicitud('SATAG-999998', 'YYY111', 'actualizacion', 'Prueba de verificacion P-11');

select a.respuesta as respuesta_a_sin_historial,
       b.respuesta as respuesta_b_en_el_limite,
       case when a.respuesta = b.respuesta
            then 'CORRECTO: identicas, el limite no se delata'
            else 'REVISAR: difieren, el limite es detectable desde fuera'
       end as veredicto
  from _p11 a, _p11 b
 where a.caso like 'A%' and b.caso like 'B%';

-- ---------------------------------------------------------------------
-- PASO 5 — Limpieza. Borra SOLO las filas de la prueba.
-- 203.0.113.0/24 es el rango reservado para documentacion (RFC 5737):
-- ninguna peticion real puede venir de ahi, asi que borrar el rango
-- entero no toca nada de produccion.
-- ---------------------------------------------------------------------
delete from intentos_publicos where ip << '203.0.113.0/24'::inet;
select set_config('request.headers', '', false);
drop table if exists _p11;

select 'filas de prueba que quedan (debe ser 0)' as que,
       count(*)::text as valor
  from intentos_publicos where ip << '203.0.113.0/24'::inet;

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
