-- =====================================================================
-- SATAG · ¿Esta todo listo para la junta del contador? (lun 28-sep, 13:00)
-- SOLO LECTURA. No aplica nada, no crea nada. Correr completo.
--
-- Contesta las cinco cosas que hay que saber ANTES de la junta:
--   1. Si el bloque 74 ya esta aplicado (sin el, el rol contador no existe).
--   2. Que cuentas del panel hay y cual tiene MFA.
--   3. Que hay en la caja ahora mismo, que es lo que el CP vera en pantalla.
--   4. Cuantos expedientes estan dados de alta SIN cobrar (la pregunta que
--      un contador hace en el primer minuto y que el panel hoy no responde).
--   5. Cuantas instalaciones tienen hora sellada, que es el denominador que
--      el tablero va a mostrar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ¿ESTA APLICADO EL BLOQUE 74?
--    Si las cuatro primeras filas salen en false, el rol contador esta
--    NOMBRADO pero INERTE: la cuenta del CP entraria al panel y no leeria
--    nada. Es la unica cosa que tiene que pasar antes de la junta.
-- ---------------------------------------------------------------------
select 'B74 · estado_caja admite contador' as que,
       exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'estado_caja'
            and pg_get_functiondef(p.oid) ilike '%array[''admin'',''contador'']%'
       ) as ok
union all
select 'B74 · cortar_caja exige contador',
       exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'cortar_caja'
            and pg_get_functiondef(p.oid) ilike '%array[''contador'']%'
       )
union all
select 'B74 · cortar_caja tiene UNA sola forma (trampa PostgREST)',
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'cortar_caja') = 1
union all
select 'B74 · las 6 politicas de lectura nombran contador',
       (select count(*) from pg_policies
         where schemaname = 'public'
           and policyname in ('registros_lectura_panel','movimientos_lectura_panel',
                              'pagos_lectura_panel','regest_lectura_panel',
                              'solicitudes_lectura_panel','cortes_lectura_admin')
           and coalesce(qual, '') ilike '%contador%') = 6
union all
-- OJO, aqui se cayo esta consulta la primera vez que se corrio: NO se filtra
-- por schemaname. La politica aceptaciones_lectura_panel vive en public, pero
-- firmas_lectura_panel esta sobre storage.objects, asi que un filtro por
-- 'public' encuentra una sola de las dos y la fila sale en false con el bloque
-- 71 correctamente aplicado.
select 'B71 · la firma ya lo nombra (aplicado el 17-sep, debe salir true)',
       (select count(*) from pg_policies
         where policyname in ('aceptaciones_lectura_panel','firmas_lectura_panel')
           and coalesce(qual, '') ilike '%contador%') = 2
union all
select 'Ya existe alguna cuenta con rol contador',
       exists (select 1 from auth.users where raw_app_meta_data->>'rol' = 'contador');

-- ---------------------------------------------------------------------
-- 2. LAS CUENTAS DEL PANEL Y SU SEGUNDO FACTOR
--    Sin MFA verificado no se pasa ni una politica: el panel exige aal2.
--    Si el CP aparece aqui con mfa_verificado = 0, la junta empieza por el
--    codigo QR y necesita su telefono con una app de autenticacion.
-- ---------------------------------------------------------------------
select u.email,
       u.raw_app_meta_data->>'rol' as rol,
       (select count(*) from auth.mfa_factors f
         where f.user_id = u.id and f.status = 'verified') as mfa_verificado,
       (u.last_sign_in_at at time zone 'America/Mexico_City')::timestamp(0) as ultimo_ingreso_qro,
       u.email_confirmed_at is not null as correo_confirmado
  from auth.users u
 where u.raw_app_meta_data->>'rol' is not null
 order by u.raw_app_meta_data->>'rol', u.email;

-- ---------------------------------------------------------------------
-- 3. LA CAJA AHORA MISMO
--    Es literalmente lo que la tarjeta "En caja ahora" va a decir a la 1.
--    `dias_naturales` es el numero que pinta el semaforo: amarillo a los 30,
--    rojo a los 35.
-- ---------------------------------------------------------------------
select count(*) as cobros_sin_cortar,
       coalesce(sum(monto), 0) as total_en_caja,
       count(distinct (created_at at time zone 'America/Mexico_City')::date) as dias_de_cobro,
       (min(created_at) at time zone 'America/Mexico_City')::date as primer_cobro_qro,
       (max(created_at) at time zone 'America/Mexico_City')::date as ultimo_cobro_qro,
       (current_date - (min(created_at) at time zone 'America/Mexico_City')::date) as dias_naturales
  from pagos
 where corte_id is null;

-- Cortes ya cerrados. Si sale 0, el corte NUNCA se ha ejecutado en
-- produccion y el primero que se haga sera el primero de la historia del
-- sistema: no se puede deshacer.
select count(*) as cortes_cerrados,
       max((created_at at time zone 'America/Mexico_City')::date) as ultimo_corte_qro
  from cortes_caja;

-- ---------------------------------------------------------------------
-- 4. LO QUE ESTA DADO DE ALTA Y NO SE HA COBRADO
--    El panel de Finanzas hoy NO muestra esto. Si el numero es grande,
--    es la primera pregunta que va a hacer el CP.
-- ---------------------------------------------------------------------
select r.estado,
       count(*) as expedientes_sin_cobro,
       min(r.created_at::date) as el_mas_viejo,
       max(r.created_at::date) as el_mas_nuevo
  from registros r
 where r.estado <> 'baja'
   and not exists (select 1 from pagos p where p.registro_id = r.id)
 group by r.estado
 order by 2 desc;

-- ---------------------------------------------------------------------
-- 5. EL DENOMINADOR DEL TABLERO
--    Las dos cifras que la pantalla enseña juntas a proposito.
-- ---------------------------------------------------------------------
select count(*) as tags_instalados,
       count(instalado_en) as con_hora_sellada,
       count(*) - count(instalado_en) as sin_hora_anteriores_al_b68
  from registros
 where fecha_instalacion is not null;
