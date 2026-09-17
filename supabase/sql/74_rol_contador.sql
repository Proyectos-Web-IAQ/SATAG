-- =====================================================================
-- 74_rol_contador.sql   (SC-028 L2-02, mejora continua)
--
-- REDACTADO EL 17-SEP-2026. **NO SE APLICA TODAVIA.** Va en la ventana de
-- mejora continua, a partir de la semana del 28-sep.
--
-- *** ANTES DE APLICARLO HACEN FALTA DOS COSAS QUE NO SON SQL ***
--   1. La cuenta del CP con **MFA activado**. Sin `aal2` no pasa
--      panel_exigir_rol ni una sola politica del panel: darle el rol sin
--      MFA lo deja fuera y parecera que el bloque no funciono.
--   2. Su `app_metadata.rol` puesto en `'contador'`, y **cerrar sesion y
--      volver a entrar**: el rol viaja en el JWT, asi que un token emitido
--      antes no lo trae. Es el mismo PASO 0 que el README exige para los
--      bloques 24 a 30.
--        update auth.users
--           set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb)
--               || jsonb_build_object('rol','contador')
--         where email = '<correo del CP>';
--
-- POR QUE. El bloque 71 dejo a `contador` NOMBRADO E INERTE en las
-- politicas de la firma. Este bloque lo hace existir de verdad: hoy un JWT
-- con rol = 'contador' **no entra al panel** (auth.ts no lo reconoce) y
-- **no lee nada** (todas las politicas listan literalmente admin, ti,
-- consulta y super).
--
-- DECISION DE GERARDO DEL 17-SEP, y es la parte que no es tecnica:
-- **Administracion pierde `cortar_caja`.** El corte lo hace el contador.
--
--   *** PERO NO ES LITERAL, Y CONVIENE NO PROMETERLO ***
--   `panel_exigir_rol` (29_rpc_panel.sql:49-51) hace `return` en seco
--   cuando el rol es 'super', SIN mirar la lista que se le pasa. Asi que
--   el corte lo pueden cerrar el contador **y cualquier cuenta super**
--   (hoy: Gerardo, Miguel, y Vicente como super temporal). Quitarselo a
--   super exige cambiar panel_exigir_rol, que afecta a TODOS los RPC del
--   panel y es otro alcance.
--
-- CONSECUENCIA OPERATIVA que hay que avisarle a Administracion antes, no
-- despues: cuando el semaforo de la caja se ponga amarillo —a los 30 dias
-- naturales desde el primer cobro sin cortar— **ya no podra resolverlo
-- sola**. Tendra que avisar. Por eso el semaforo avisa a los 30 y alarma a
-- los 35, y no al reves.
--
-- QUE HACE, EN ORDEN:
--   0. Guardia: las seis politicas de partida existen, y las dos funciones
--      de la caja tienen una sola forma cada una.
--   1. Seis politicas de LECTURA recreadas con `contador` en la lista.
--   2. `estado_caja` pasa a ('admin','contador') y `cortar_caja` a
--      ('contador'). Mismas firmas: sin drop, sin regrant, sin notify.
--   3. Verificacion de solo lectura.
--
-- QUE **NO** HACE, a proposito:
--   - No toca la firma: el bloque 71 ya la dejo en ('ti','contador','super').
--   - No toca los catalogos ni los documentos legales (bloque 43): son
--     politicas de ESCRITURA de admin/super y el contador no escribe nada.
--   - No toca `inventario_tags`, `zk_tarjetas` ni las notas del buzon: son
--     de TI.
--   - No crea la cuenta ni le pone el rol: eso se hace en el dashboard (ver
--     arriba) y es lo unico que este archivo no puede hacer por si solo.
--
-- EL CLIENTE VA APARTE Y SE PUEDE PUBLICAR ANTES, sin riesgo: agregar
-- `contador` al tipo `RolPanel`, a `ROLES_PANEL`, a `TABS_POR_ROL` y a
-- `ETIQUETA_ROL` es codigo MUERTO mientras ningun JWT traiga ese rol. No
-- hay orden obligado entre el cliente y este bloque, al contrario que en
-- el 73.
--
-- Solo politicas y dos cuerpos de funcion: sin cambios de firma, sin
-- grants, sin notify, sin trampa PostgREST. Idempotente.
-- Depende de: 27, 29, 30, 42 y 71.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. GUARDIA. Va primero: si aborta, no se aplico nada.
-- ---------------------------------------------------------------------
do $guardia$
declare
    v_n int;
begin
    -- Las seis politicas de partida. Si falta alguna, alguien cambio la RLS
    -- por otro camino y hay que mirarlo antes de recrearla a ciegas.
    select count(*) into v_n
      from pg_policies
     where (schemaname = 'public' and policyname in (
              'registros_lectura_panel', 'movimientos_lectura_panel',
              'pagos_lectura_panel', 'regest_lectura_panel',
              'solicitudes_lectura_panel', 'cortes_lectura_admin'));
    if v_n <> 6 then
        raise exception 'Bloque 74 cancelado: se esperaban las 6 politicas de lectura del panel y hay %. Revise que paso antes de recrearlas. No se aplico nada.', v_n;
    end if;

    -- Las dos funciones de la caja, una forma cada una.
    select count(*) into v_n
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('estado_caja', 'cortar_caja');
    if v_n <> 2 then
        raise exception 'Bloque 74 cancelado: se esperaban 2 funciones de caja (estado_caja y cortar_caja) y hay %. No se aplico nada.', v_n;
    end if;

    -- El bloque 71 tiene que estar aplicado: si no, este bloque le daria al
    -- contador el padron y el dinero pero no la firma, y el reparto quedaria
    -- a medias sin que nada lo dijera.
    if not exists (
        select 1 from pg_policies
         where schemaname = 'public' and tablename = 'aceptaciones'
           and policyname = 'aceptaciones_lectura_panel'
           and qual like '%''contador''%'
    ) then
        raise exception 'Bloque 74 cancelado: la politica de la firma no nombra a contador; aplique primero el bloque 71. No se aplico nada.';
    end if;
end
$guardia$;


-- ---------------------------------------------------------------------
-- 1. LAS POLITICAS DE LECTURA. Se conservan los nombres historicos a
--    proposito: renombrarlas haria que una reejecucion de los bloques 27,
--    30 o 42 reviviera la vieja y quedaran dos politicas sobre la misma
--    tabla, cada una con su lista. Mejor una lista corregida con nombre
--    viejo que dos listas con nombres bonitos.
--
--    `cortes_lectura_admin` ya no describe su contenido (ahora no es solo
--    de admin), pero por lo mismo se queda.
-- ---------------------------------------------------------------------

-- Del bloque 30: el padron y su bitacora.
drop policy if exists registros_lectura_panel on registros;
create policy registros_lectura_panel on registros
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','ti','consulta','contador','super')
    );

drop policy if exists movimientos_lectura_panel on movimientos;
create policy movimientos_lectura_panel on movimientos
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','ti','consulta','contador','super')
    );

-- Del bloque 27: los cobros, los estacionamientos asignados y el buzon.
drop policy if exists pagos_lectura_panel on pagos;
create policy pagos_lectura_panel on pagos
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','ti','consulta','contador','super')
    );

drop policy if exists regest_lectura_panel on registro_estacionamientos;
create policy regest_lectura_panel on registro_estacionamientos
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','ti','consulta','contador','super')
    );

drop policy if exists solicitudes_lectura_panel on solicitudes;
create policy solicitudes_lectura_panel on solicitudes
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','ti','consulta','contador','super')
    );

-- Del bloque 42: los cortes ya cerrados. Administracion los CONSERVA: puede
-- consultar lo que ya se corto, aunque desde este bloque no pueda cortar.
drop policy if exists cortes_lectura_admin on cortes_caja;
create policy cortes_lectura_admin on cortes_caja
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','contador','super')
    );

-- La firma NO se toca: el bloque 71 ya dejo ('ti','contador','super') en
-- aceptaciones_lectura_panel y en firmas_lectura_panel. Ese fue justo el
-- motivo de nombrarlo ahi desde el 17-sep.
--
-- Los catalogos, el reglamento y el aviso (bloque 43) TAMPOCO se tocan: son
-- politicas de ESCRITURA de admin/super, y al contador no le toca escribir
-- nada. Lo que necesita es leer dinero y padron.
--
-- Sin grants nuevos: los del bloque 27 y del 30 son `grant ... to
-- authenticated`, por tabla, y el contador entra como authenticated.


-- ---------------------------------------------------------------------
-- 2. LAS DOS GUARDIAS DE LA CAJA. Mismas firmas: `create or replace`, sin
--    drop, sin regrant y sin notify. Cuerpos vigentes del bloque 42,
--    INTEGROS, con un solo delta cada uno, marcado "NUEVO 74"; se
--    generaron extrayendolos del archivo del 42, no transcribiendolos.
-- ---------------------------------------------------------------------
create or replace function estado_caja()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_zona          text := 'America/Mexico_City';
    v_total         numeric(12,2);
    v_cantidad      integer;
    v_dias          integer;
    v_primero       timestamptz;
    v_desglose      jsonb;
    v_ultimo_corte  timestamptz;
    v_mes           numeric(12,2);
    v_historico     numeric(12,2);
begin
    -- NUEVO 74: el contador tambien LEE el estado de la caja. Administracion
    -- lo conserva: necesita saber cuanto efectivo deberia haber para
    -- conciliar, y la guia del personal se lo indica expresamente.
    perform panel_exigir_rol(array['admin','contador']);

    select coalesce(sum(monto), 0),
           count(*),
           count(distinct (created_at at time zone v_zona)::date),
           min(created_at)
      into v_total, v_cantidad, v_dias, v_primero
      from pagos
     where corte_id is null;

    -- Desglose por dia local: deja ver de golpe que parte del efectivo es de
    -- dias anteriores ya entregados, que es de donde salen los faltantes falsos.
    select jsonb_agg(d order by d ->> 'dia')
      into v_desglose
      from (
          select jsonb_build_object(
                     'dia',      (created_at at time zone v_zona)::date,
                     'cantidad', count(*),
                     'subtotal', sum(monto)
                 ) as d
            from pagos
           where corte_id is null
           group by (created_at at time zone v_zona)::date
      ) s;

    select max(created_at) into v_ultimo_corte from cortes_caja;

    select coalesce(sum(monto), 0)
      into v_mes
      from pagos
     where (created_at at time zone v_zona) >= date_trunc('month', now() at time zone v_zona);

    select coalesce(sum(monto), 0) into v_historico from pagos;

    return jsonb_build_object(
        'totalEnCaja',     v_total,
        'pagosEnCaja',     v_cantidad,
        'diasDeCobro',     coalesce(v_dias, 0),
        'primerCobro',     v_primero,
        'desglosePorDia',  coalesce(v_desglose, '[]'::jsonb),
        'ultimoCorte',     v_ultimo_corte,
        'vendidoMes',      v_mes,
        'vendidoHistorico', v_historico
    );
end;
$$;

create or replace function cortar_caja(
    p_efectivo_contado numeric,
    p_cortado_por      text default null,
    p_observaciones    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_zona       text := 'America/Mexico_City';
    v_corte_id   uuid := gen_random_uuid();
    v_total      numeric(12,2);
    v_cantidad   integer;
    v_dias       integer;
    v_desde      timestamptz;
    v_hasta      timestamptz := now();
    v_desglose   jsonb;
    v_diferencia numeric(12,2);
    v_nombre     text;
    v_folio      text;
begin
    -- NUEVO 74: cortar es SOLO del contador. Decision de Gerardo del
    -- 17-sep-2026: Administracion pierde cortar_caja.
    --
    -- PRECISION QUE HAY QUE DECIR EN VOZ ALTA, y que el codigo obliga:
    -- panel_exigir_rol hace `return` en seco cuando el rol es 'super', SIN
    -- mirar esta lista (29_rpc_panel.sql:49-51). Asi que lo cortan el
    -- contador Y LAS CUENTAS SUPER. «Solo el contador cierra el corte» no
    -- sera literal mientras existan cuentas super, y prometerlo seria
    -- falso; quitarselo a super exige cambiar panel_exigir_rol, que es otro
    -- alcance y afecta a TODOS los RPC del panel.
    perform panel_exigir_rol(array['contador']);

    -- Serializa dos cortes simultaneos: se forman en fila en vez de competir.
    perform pg_advisory_xact_lock(hashtext('satag:corte_caja'));

    if p_efectivo_contado is null or p_efectivo_contado < 0 then
        raise exception 'El efectivo contado debe ser mayor o igual a cero';
    end if;

    v_nombre := nullif(btrim(coalesce(p_cortado_por, '')), '');
    if v_nombre is null then
        raise exception 'Indique quien realiza el corte';
    end if;

    -- Pre-chequeo: evita quemar un folio de la serie cuando no hay nada que cortar.
    perform 1 from pagos where corte_id is null limit 1;
    if not found then
        raise exception 'No hay cobros pendientes de cortar: la caja esta en ceros';
    end if;

    -- Fotografia del periodo, antes de sellar.
    select min(created_at),
           count(distinct (created_at at time zone v_zona)::date)
      into v_desde, v_dias
      from pagos
     where corte_id is null;

    select jsonb_agg(d order by d ->> 'dia')
      into v_desglose
      from (
          select jsonb_build_object(
                     'dia',      (created_at at time zone v_zona)::date,
                     'cantidad', count(*),
                     'subtotal', sum(monto)
                 ) as d
            from pagos
           where corte_id is null
           group by (created_at at time zone v_zona)::date
      ) s;

    -- El sello define el conjunto. La FK diferida permite hacerlo antes de
    -- que exista la fila del corte; se valida al confirmar la transaccion.
    with sellados as (
        update pagos
           set corte_id = v_corte_id
         where corte_id is null
        returning monto
    )
    select coalesce(sum(monto), 0), count(*)
      into v_total, v_cantidad
      from sellados;

    -- Respaldo real ante concurrencia: si otro corte se adelanto, aqui se
    -- sellaron 0 filas. Sin esto quedaria un corte fantasma en cero cuyo
    -- efectivo contado se registraria como sobrante inexistente.
    if v_cantidad = 0 then
        raise exception 'No hay cobros pendientes de cortar: la caja esta en ceros';
    end if;

    v_diferencia := p_efectivo_contado - v_total;

    -- Una diferencia sin explicar es un documento contable inutil: dentro de
    -- un mes nadie recordara por que no cuadro.
    if v_diferencia <> 0 and btrim(coalesce(p_observaciones, '')) = '' then
        raise exception 'Explique la diferencia de $% antes de cerrar el corte',
            to_char(abs(v_diferencia), 'FM999999990.00');
    end if;

    -- Un corte que arrastra varios dias de cobro suele mezclar efectivo ya
    -- entregado: se exige dejarlo por escrito mientras se recuerda.
    if v_dias > 1 and btrim(coalesce(p_observaciones, '')) = '' then
        raise exception 'Este corte abarca cobros de % dias: explique en observaciones si ya entrego efectivo de dias anteriores', v_dias;
    end if;

    insert into cortes_caja (
        id, cortado_por, cortado_por_uid, cortado_por_email,
        periodo_desde, periodo_hasta,
        total_esperado, cantidad_pagos, dias_de_cobro, desglose_por_dia,
        efectivo_contado, observaciones
    )
    values (
        v_corte_id, v_nombre, auth.uid(), auth.jwt() ->> 'email',
        v_desde, v_hasta,
        v_total, v_cantidad, coalesce(v_dias, 1), v_desglose,
        p_efectivo_contado, nullif(btrim(coalesce(p_observaciones, '')), '')
    )
    returning folio_corte into v_folio;

    return jsonb_build_object(
        'id', v_corte_id,
        'folioCorte', v_folio,
        'totalEsperado', v_total,
        'efectivoContado', p_efectivo_contado,
        'diferencia', v_diferencia,
        'pagosCortados', v_cantidad,
        'diasDeCobro', coalesce(v_dias, 1)
    );
end;
$$;

-- ---------------------------------------------------------------------
-- 3. VERIFICACION (solo lectura). `ok` en true en las cinco filas.
-- ---------------------------------------------------------------------
select 1 as orden,
       'las 6 politicas de lectura nombran a contador' as que,
       (select string_agg(policyname, ', ' order by policyname)
          from pg_policies
         where schemaname = 'public'
           and policyname in ('registros_lectura_panel','movimientos_lectura_panel',
                              'pagos_lectura_panel','regest_lectura_panel',
                              'solicitudes_lectura_panel','cortes_lectura_admin')
           and qual like '%''contador''%') as valor,
       (select count(*) = 6
          from pg_policies
         where schemaname = 'public'
           and policyname in ('registros_lectura_panel','movimientos_lectura_panel',
                              'pagos_lectura_panel','regest_lectura_panel',
                              'solicitudes_lectura_panel','cortes_lectura_admin')
           and qual like '%''contador''%') as ok
union all
select 2, 'estado_caja: lo leen admin y contador', null,
       (select position('array[''admin'',''contador'']' in p.prosrc) > 0
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'estado_caja')
union all
select 3, 'cortar_caja: SOLO contador (mas super, por panel_exigir_rol)', null,
       (select position('array[''contador'']' in p.prosrc) > 0
           and position('array[''admin'']' in p.prosrc) = 0
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'cortar_caja')
union all
select 4, 'una sola forma de cada funcion de caja',
       (select string_agg(proname || ':' || n, ', ') from (
            select p.proname, count(*)::text as n
              from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
             where ns.nspname = 'public' and p.proname in ('estado_caja','cortar_caja')
             group by p.proname) x),
       (select bool_and(n = 1) from (
            select count(*) as n
              from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
             where ns.nspname = 'public' and p.proname in ('estado_caja','cortar_caja')
             group by p.proname) x)
union all
select 5, 'la firma ya lo nombraba desde el bloque 71', null,
       (select count(*) = 1 from pg_policies
         where schemaname = 'public' and tablename = 'aceptaciones'
           and qual like '%''contador''%')
order by orden;


-- ---------------------------------------------------------------------
-- 4. QUIEN TIENE QUE ROL, para confirmar el PASO previo del dashboard.
-- ---------------------------------------------------------------------
select email,
       raw_app_meta_data ->> 'rol' as rol,
       (select count(*) from auth.mfa_factors f
         where f.user_id = u.id and f.status = 'verified') as factores_mfa
  from auth.users u
 order by email;
-- El CP debe salir con rol = contador y al menos 1 factor MFA verificado.
-- Con 0 factores no entra al panel, por mas que el rol este bien puesto.


-- ---------------------------------------------------------------------
-- EN PANTALLA, con la cuenta del CP y tras cerrar y volver a abrir sesion:
--   - Entra al panel y ve las pestanas que le da TABS_POR_ROL.
--   - En Finanzas ve «En caja ahora» y puede cerrar el corte.
--   - Con la cuenta de Administracion, «Cerrar corte» ya NO funciona: el
--     RPC responde que su usuario no tiene el rol requerido.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). Devuelve las seis listas y las dos guardias a como
-- estaban. NO hace falta revertir el cliente: con `contador` en la lista
-- del cliente y fuera de la base, ese rol simplemente no lee nada.
--
--   -- Las seis politicas: corra los bloques 27 (lineas 26-48), 30 (36-58)
--   -- y 42 (248-254) tal cual; sus drop/create devuelven las listas
--   -- originales de admin/ti/consulta/super y de admin/super.
--
--   -- Las dos guardias: corra del bloque 42 las funciones estado_caja
--   -- (lineas 338-400) y cortar_caja (414-534) tal cual, que traen
--   -- array['admin'] en las dos.
--
-- Revertir esto le devuelve el corte a Administracion, que es una decision
-- de Gerardo del 17-sep y no un detalle tecnico. No se revierte sin
-- acuerdo.
-- ---------------------------------------------------------------------
