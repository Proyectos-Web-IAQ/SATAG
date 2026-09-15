-- =====================================================================
-- Verificacion del bloque 66 (aviso en Google Chat a TI) · 15-sep-2026
--
-- SOLO LECTURA, salvo el PASO 2, que manda un mensaje real al espacio
-- "SATAG - TI" (sin datos personales) y deja una fila en la cola de pg_net.
-- No toca registros, pagos, cortes ni documentos.
--
-- CORRER PASO POR PASO, SELECCIONANDO CADA BLOQUE Y EJECUTANDO SOLO ESO:
-- el editor SQL de Supabase muestra solo el resultado de la ultima
-- consulta de lo que se ejecuta.
--
-- Orden: PASO 1 -> PASO 2 -> (esperar unos segundos) -> PASO 3 -> PASO 4.
--
-- Nunca imprime la URL del webhook: solo si existe y si tiene la forma de
-- un webhook de Google Chat.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASO 1 — Estructura y permisos. La columna `ok` debe salir true en
-- todas las filas; `valor` es informativo.
-- ---------------------------------------------------------------------
select 1 as orden, 'extension pg_net instalada' as que,
       coalesce((select extversion from pg_extension where extname = 'pg_net'), '(no)') as valor,
       exists (select 1 from pg_extension where extname = 'pg_net') as ok
union all
select 2, 'secreto chat_webhook_satag_ti en Vault', null,
       exists (select 1 from vault.decrypted_secrets where name = 'chat_webhook_satag_ti')
union all
select 3, 'el secreto tiene forma de webhook de Google Chat', null,
       coalesce((select decrypted_secret like 'https://chat.googleapis.com/v1/spaces/%'
                   from vault.decrypted_secrets
                  where name = 'chat_webhook_satag_ti'
                  order by created_at desc limit 1), false)
union all
select 4, 'tabla parametros existe', null,
       to_regclass('public.parametros') is not null
union all
select 5, 'RLS encendida en parametros', null,
       coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'parametros'), false)
union all
select 6, 'politicas en parametros (debe ser 0)',
       (select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'parametros'),
       (select count(*) = 0 from pg_policies where schemaname = 'public' and tablename = 'parametros')
union all
select 7, 'anon y authenticated NO leen parametros', null,
       not has_table_privilege('anon', 'public.parametros', 'select')
       and not has_table_privilege('authenticated', 'public.parametros', 'select')
union all
select 8, 'interruptor aviso_chat_ti',
       coalesce((select valor from public.parametros where clave = 'aviso_chat_ti'), '(sin fila)'),
       coalesce((select valor = 'activo' from public.parametros where clave = 'aviso_chat_ti'), false)
union all
select 9, 'avisar_chat_ti: SECURITY DEFINER, dueno postgres, search_path vacio',
       (select pg_get_userbyid(p.proowner) || ' · ' || coalesce(array_to_string(p.proconfig, ','), '(sin config)')
          from pg_proc p where p.oid = to_regprocedure('public.avisar_chat_ti(text)')),
       coalesce((select p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
                        and 'search_path=""' = any (p.proconfig)
                   from pg_proc p where p.oid = to_regprocedure('public.avisar_chat_ti(text)')), false)
union all
select 10, 'tg_pagos_avisar_chat_ti: SECURITY DEFINER, dueno postgres, search_path vacio',
       (select pg_get_userbyid(p.proowner) || ' · ' || coalesce(array_to_string(p.proconfig, ','), '(sin config)')
          from pg_proc p where p.oid = to_regprocedure('public.tg_pagos_avisar_chat_ti()')),
       coalesce((select p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
                        and 'search_path=""' = any (p.proconfig)
                   from pg_proc p where p.oid = to_regprocedure('public.tg_pagos_avisar_chat_ti()')), false)
union all
select 11, 'anon y authenticated NO ejecutan avisar_chat_ti', null,
       to_regprocedure('public.avisar_chat_ti(text)') is not null
       and not has_function_privilege('anon', 'public.avisar_chat_ti(text)', 'execute')
       and not has_function_privilege('authenticated', 'public.avisar_chat_ti(text)', 'execute')
union all
select 12, 'disparador pagos_avisar_chat_ti activo (after insert, por fila)',
       (select t.tgenabled::text from pg_trigger t
         where t.tgrelid = 'public.pagos'::regclass and t.tgname = 'pagos_avisar_chat_ti'),
       exists (select 1 from pg_trigger t
                where t.tgrelid = 'public.pagos'::regclass
                  and t.tgname = 'pagos_avisar_chat_ti'
                  and t.tgenabled = 'O')
union all
-- El bloque no cambia firmas: cada RPC del flujo sigue con una sola forma.
select 13, 'registrar_pago sigue con una sola forma (sin trampa PostgREST)',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'registrar_pago'),
       (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'registrar_pago')
union all
select 14, 'crear_registro sigue con una sola forma',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'crear_registro'),
       (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'crear_registro')
union all
-- Informativa (ok siempre true): el ultimo error que atraparon las
-- funciones del aviso, con su fecha. Si es anterior a la ultima prueba que
-- si llego, ya no aplica.
select 15, 'ultimo error del aviso (informativo)',
       coalesce((select valor || ' · ' || to_char(actualizado_en at time zone 'America/Mexico_City', 'DD-Mon HH24:MI')
                   from public.parametros where clave = 'aviso_chat_ti_ultimo_error'), '(ninguno)'),
       true
order by orden;


-- ---------------------------------------------------------------------
-- PASO 2 — Prueba de conexion. MANDA UN MENSAJE REAL al espacio de TI.
-- Con el interruptor apagado no sale nada (y el PASO 3 no mostrara fila
-- nueva): eso tambien es una prueba.
-- ---------------------------------------------------------------------
select public.avisar_chat_ti('Prueba de conexión de SATAG');


-- ---------------------------------------------------------------------
-- PASO 3 — Respuestas de Google (esperar unos segundos tras el PASO 2).
-- Lo correcto es status_code 200. Lo que suele salir si algo falla:
--   400  el cuerpo del mensaje no es valido
--   403 / 404  la URL del webhook ya no sirve (se borro el webhook o el
--        espacio): cree uno nuevo y reemplace el secreto en Vault
--   timed_out = true o error_msg  sin salida a internet desde la base
-- pg_net borra estas respuestas despues de unas horas: si la tabla esta
-- vacia y no se ha mandado nada recientemente, es normal.
-- ---------------------------------------------------------------------
select id, status_code, timed_out, error_msg, created, content
  from net._http_response
 order by id desc
 limit 5;


-- ---------------------------------------------------------------------
-- PASO 4 — Cuantos TAGs hay por instalar ahora (el numero que diria el
-- aviso si hubiera un cobro en este momento). Misma definicion que la
-- cola de TI.
-- ---------------------------------------------------------------------
select count(*) as tags_por_instalar
  from public.registros r
 where r.estado = 'pendiente'
   and r.no_dispositivo is null
   and exists (select 1 from public.pagos p where p.registro_id = r.id);
