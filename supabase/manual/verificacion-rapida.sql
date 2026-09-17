-- =====================================================================
-- SATAG · VERIFICACION RAPIDA DEL ESTADO DE PRODUCCION
--
-- SOLO LEE. Nada de lo que hay aqui escribe, borra ni cambia nada.
-- Pegar completo en el SQL Editor y correr. Devuelve UNA tabla: si todo
-- esta como debe estar, la columna `ok` sale en **true en todos los
-- renglones** y no hace falta leer nada mas.
--
-- PARA QUE. Hasta hoy, comprobar el estado del sistema eran cinco o seis
-- consultas suministradas a mano, distintas cada vez. Este archivo las
-- junta: es lo que se corre el viernes en la verificacion final, cada
-- lunes antes de instalar, y cada vez que algo se sienta raro.
--
-- Escrito el 17-sep-2026, con el estado de ese dia como referencia
-- (bloques 00 a 71 aplicados). **CUANDO SE APLIQUE UN BLOQUE NUEVO HAY
-- QUE ACTUALIZAR EL RENGLON QUE LE TOQUE**, o este archivo empezara a
-- mentir tranquilizando. Los renglones que cambian con los bloques 72,
-- 73 y 74 vienen marcados.
-- =====================================================================

with esperado as (select 29 as tipos_crear_registro, 7 as aviso_vigente)

-- 1. EL AVISO DE PRIVACIDAD ------------------------------------------
select 1 as n,
       'aviso de privacidad: una sola version vigente, y es la 7' as que,
       (select string_agg(version::text, ', ' order by version)
          from aviso_versiones where vigente)                       as valor,
       (select count(*) = 1 from aviso_versiones where vigente)
       and (select version from aviso_versiones where vigente)
           = (select aviso_vigente from esperado)                   as ok

-- 2. EL ALTA PUBLICA -------------------------------------------------
union all
select 2, 'crear_registro: UNA sola forma (sin trampa PostgREST)',
       (select string_agg(p.oid::regprocedure::text, ' | ')
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'crear_registro'),
       (select count(*) = 1
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'crear_registro')

union all
select 3, 'crear_registro: 29 parametros (cambia con el bloque 72: sigue en 29)',
       (select pronargs::text
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'crear_registro'),
       (select pronargs = (select tipos_crear_registro from esperado)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'crear_registro')

union all
select 4, 'crear_registro: anon y authenticated la ejecutan',
       null,
       (select bool_and(has_function_privilege(r, p.oid, 'execute'))
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace,
               unnest(array['anon','authenticated']) as r
         where n.nspname = 'public' and p.proname = 'crear_registro')

union all
select 5, 'el alta sella la firma con satag.acceptance.v3',
       null,
       (select position('satag.acceptance.v3' in p.prosrc) > 0
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'crear_registro')

-- 3. EL COBRO Y LA INSTALACION ---------------------------------------
union all
select 6, 'registrar_pago: una sola forma (5 parametros hoy; 6 con el bloque 73)',
       (select string_agg(pronargs::text, ', ')
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'registrar_pago'),
       (select count(*) = 1
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'registrar_pago')

union all
select 7, 'el cobro y la instalacion toman la identidad de la sesion (JWT)',
       (select string_agg(p.proname, ', ' order by p.proname)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('registrar_pago','instalar_tag','instalar_tag_con_estacionamiento')
           and position('auth.jwt()' in p.prosrc) > 0),
       (select count(*) = 3
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('registrar_pago','instalar_tag','instalar_tag_con_estacionamiento')
           and position('auth.jwt()' in p.prosrc) > 0)

union all
select 8, 'instalar_tag NO es ejecutable por el cliente (solo su envolvente)',
       null,
       (select bool_and(not has_function_privilege('authenticated', p.oid, 'execute'))
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'instalar_tag')

-- 4. LA FIRMA MANUSCRITA (bloque 71) ---------------------------------
union all
select 9, 'la firma: aceptaciones con UNA policy, para ti/contador/super',
       (select string_agg(policyname || ' (' || cmd || ')', ' | ' order by policyname)
          from pg_policies where schemaname = 'public' and tablename = 'aceptaciones'),
       (select count(*) = 1 from pg_policies
         where schemaname = 'public' and tablename = 'aceptaciones')
       and exists (select 1 from pg_policies
                    where schemaname = 'public' and tablename = 'aceptaciones'
                      and qual like '%''contador''%'
                      and qual not like '%''admin''%'
                      and qual not like '%''consulta''%')

union all
select 10, 'el bucket firmas: sin firmas_gestion_admin, con la subida anon',
       (select string_agg(policyname || ' (' || cmd || ')', ' | ' order by policyname)
          from pg_policies where schemaname = 'storage' and tablename = 'objects'),
       not exists (select 1 from pg_policies
                    where schemaname = 'storage' and tablename = 'objects'
                      and policyname in ('firmas_gestion_admin','firmas_admin'))
       and exists (select 1 from pg_policies
                    where schemaname = 'storage' and tablename = 'objects'
                      and policyname = 'firmas_subida_anon')

union all
select 11, 'v_evidencia_firma hereda la RLS (security_invoker): si deja de serlo, el candado de la firma no cierra y lo parece',
       (select array_to_string(c.reloptions, ', ')
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = 'v_evidencia_firma'),
       exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relname = 'v_evidencia_firma'
                  and array_to_string(c.reloptions, ',') like '%security_invoker=true%')

-- 5. LOS AVISOS A GOOGLE CHAT (bloques 66 y 67) ----------------------
union all
select 12, 'el aviso a Chat en cada cobro esta encendido',
       (select valor from parametros where clave = 'aviso_chat_ti'),
       (select valor = 'activo' from parametros where clave = 'aviso_chat_ti')

union all
select 13, 'el ultimo error atrapado del aviso a Chat (vacio = ninguno)',
       coalesce((select valor from parametros where clave = 'aviso_chat_ti_ultimo_error'), '(ninguno)'),
       coalesce((select valor from parametros where clave = 'aviso_chat_ti_ultimo_error'), '') = ''

union all
select 14, 'el recordatorio de los lunes 07:30 esta programado y activo',
       (select jobname || ' · ' || schedule || ' · activo=' || active::text
          from cron.job where jobname = 'satag-recordatorio-ti'),
       exists (select 1 from cron.job
                where jobname = 'satag-recordatorio-ti'
                  and schedule = '30 13 * * 1' and active)

-- 6. HIGIENE DEL PADRON ----------------------------------------------
union all
select 15, 'ninguna imagen de firma sin expediente (se excluye el marcador de carpeta de Storage)',
       (select count(*)::text from storage.objects o
         where o.bucket_id = 'firmas'
           and o.name not like '%.emptyFolderPlaceholder'
           and not exists (select 1 from aceptaciones a
                            where regexp_replace(a.firma_url, '^.*/', '')
                                = regexp_replace(o.name, '^.*/', ''))),
       (select count(*) = 0 from storage.objects o
         where o.bucket_id = 'firmas'
           and o.name not like '%.emptyFolderPlaceholder'
           and not exists (select 1 from aceptaciones a
                            where regexp_replace(a.firma_url, '^.*/', '')
                                = regexp_replace(o.name, '^.*/', '')))

union all
select 16, 'ningun expediente de PRUEBA vivo en el padron',
       (select coalesce(string_agg(folio, ', ' order by folio), '(ninguno)')
          from registros
         where estado <> 'baja'
           and lower(usuario_nombres || ' ' || usuario_apellido_paterno
                     || ' ' || coalesce(usuario_apellido_materno,'')) like '%prueba%'),
       (select count(*) = 0 from registros
         where estado <> 'baja'
           and lower(usuario_nombres || ' ' || usuario_apellido_paterno
                     || ' ' || coalesce(usuario_apellido_materno,'')) like '%prueba%')

union all
select 17, 'las secuencias de folio y recibo van al parejo del padron',
       'folios: ' || (select last_value::text from registros_folio_seq)
       || ' · expedientes: ' || (select count(*)::text from registros)
       || ' · recibos: ' || (select last_value::text from pagos_folio_recibo_seq)
       || ' · pagos: ' || (select count(*)::text from pagos),
       (select last_value from registros_folio_seq) = (select count(*) from registros)
       and (select last_value from pagos_folio_recibo_seq) = (select count(*) from pagos)

union all
select 18, 'maestros sin seccion: TI les elige el estacionamiento a mano (no es falla; con el bloque 72 dejan de poder entrar nuevos)',
       (select coalesce(string_agg(folio, ', ' order by folio), '(ninguno)')
          from registros
         where tipo_usuario = 'maestro' and seccion_maestro is null and estado <> 'baja'),
       true

union all
select 19, 'expedientes atorados (sin pago o sin instalar a los 7 dias)',
       (select count(*)::text from v_registros_incompletos),
       (select count(*) = 0 from v_registros_incompletos)

union all
select 20, 'efectivo en caja sin cortar, y desde cuando',
       (select count(*)::text || ' cobro(s) · $' || coalesce(sum(monto), 0)::text
               || ' · el mas viejo: '
               || coalesce(to_char(min(created_at) at time zone 'America/Mexico_City', 'DD-Mon'), 'n/a')
          from pagos where corte_id is null),
       true

order by n;

-- ---------------------------------------------------------------------
-- COMO LEERLO
--
-- Los renglones 18 y 20 tienen `ok` en true SIEMPRE: son informativos, no
-- comprobaciones. El 18 dice a que maestros hay que elegirles el
-- estacionamiento a mano y el 20 cuanto efectivo deberia haber en caja.
--
-- Si el 17 sale en false, NO cunda el panico: la secuencia y el conteo se
-- separan legitimamente cuando se borra un expediente de prueba con el
-- script con candado (que devuelve la secuencia) o cuando una alta se
-- revierte a medias. Mirar la diferencia: uno o dos, normal; muchos,
-- revisar.
--
-- Si el 14 sale en false un lunes por la manana, el equipo no va a
-- recibir el recordatorio: avisar a mano en el espacio de Chat.
--
-- Si el 11 sale en false, la firma esta abierta a quien no debe aunque el
-- renglon 9 diga que no. Es el unico renglon de esta lista cuyo fallo es
-- silencioso y grave a la vez.
-- ---------------------------------------------------------------------
