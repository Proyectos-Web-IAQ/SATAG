-- =====================================================================
-- Borrar la DEMOSTRACION del aviso a Chat · 15-sep-2026
--
-- Para que el equipo vea el sistema completo funcionando se hace un alta
-- REAL de prueba por /registro/, Administracion la cobra con su cuenta y
-- el espacio "SATAG - TI" recibe el aviso. Este script la quita despues
-- SIN dejar huecos:
--   - borra solo ese expediente, con su pago, firma registrada,
--     movimientos, estacionamientos y solicitudes;
--   - regresa la secuencia de folios y la de recibos al numero anterior,
--     para que la siguiente familia real reciba el folio y el recibo que
--     le tocaban (sin hueco que explicar al contador).
--
-- REGLAS DE LA DEMOSTRACION (las guardias las exigen):
--   - Titular con "Prueba" en el nombre (por ejemplo: Prueba / Sistemas /
--     Demo), tipo Administrativo, sin placas.
--   - NO se instala TAG. Administracion NO recibe dinero.
--   - Hacerla cuando ninguna familia se este registrando ni pagando: si
--     entra un alta o un cobro real despues de la prueba, el PASO 1 NO
--     borra (borrar dejaria un hueco en los folios reales) y la prueba se
--     da de baja con su motivo.
--
-- ORDEN:
--   PASO 0 (solo lee): antes de la demo y otra vez despues del cobro.
--   PASO 1 (borra, con candado): una sola ejecucion.
--   Dashboard: borrar a mano la imagen de la firma (el SQL no puede).
--   PASO 2 (solo lee): comprobacion.
--
-- El aviso que ya llego al espacio de Chat se queda: es la demostracion.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 0 — Solo lee. Antes de la demo anote en que numero van las dos
-- secuencias. Despues del cobro, la prueba debe salir ARRIBA, con
-- "dice prueba: true", "TAG: ninguno" y "en corte: false", y las
-- secuencias un numero adelante. Anote su folio y el nombre del archivo
-- de la firma.
-- ---------------------------------------------------------------------
with ultimos as (
    select r.id, r.folio, r.created_at, r.tipo_usuario, r.estado, r.no_dispositivo,
           (lower(r.usuario_nombres || ' ' || r.usuario_apellido_paterno || ' ' || coalesce(r.usuario_apellido_materno, ''))
               like '%prueba%') as dice_prueba,
           p.folio_recibo, p.corte_id,
           regexp_replace(a.firma_url, '^firmas/', '') as archivo_firma
      from public.registros r
      left join public.pagos p on p.registro_id = r.id
      left join public.aceptaciones a on a.registro_id = r.id
     order by r.created_at desc
     limit 3
)
select 1 as orden, 'secuencia de folios (ultimo usado)' as que,
       (select last_value::text || case when is_called then '' else ' (sin usar)' end
          from public.registros_folio_seq) as valor
union all
select 2, 'secuencia de recibos (ultimo usado)',
       (select last_value::text || case when is_called then '' else ' (sin usar)' end
          from public.pagos_folio_recibo_seq)
union all
select 10 + row_number() over (order by created_at desc), 'expediente reciente',
       folio || ' · ' || to_char(created_at at time zone 'America/Mexico_City', 'DD-Mon HH24:MI')
       || ' · ' || tipo_usuario || ' · ' || estado
       || ' · dice prueba: ' || dice_prueba::text
       || ' · TAG: ' || coalesce(no_dispositivo, 'ninguno')
       || ' · recibo: ' || coalesce(folio_recibo, 'sin pago')
       || case when folio_recibo is not null then ' · en corte: ' || (corte_id is not null)::text else '' end
       || ' · firma: ' || coalesce(archivo_firma, 'sin firma')
  from ultimos
order by orden;


-- ---------------------------------------------------------------------
-- PASO 1 — BORRA. Pegue como PRIMERA linea, en la MISMA ejecucion, el
-- folio de la prueba que vio en el PASO 0:
--
--     set satag.borrar_demo = 'SATAG-000008';
--
-- Sin esa linea, o si cualquier guardia falla, aborta sin borrar nada.
-- Si termina bien, la ultima consulta muestra el resultado.
-- ---------------------------------------------------------------------
do $borrar$
declare
    v_folio     text := coalesce(current_setting('satag.borrar_demo', true), '');
    v_num       bigint;
    v_reg       public.registros%rowtype;
    v_pago      public.pagos%rowtype;
    v_hay_pago  boolean;
    v_rec_num   bigint;
    v_seq_reg   bigint;
    v_seq_reg_c boolean;
    v_seq_rec   bigint;
    v_seq_rec_c boolean;
    n           int;
begin
    if v_folio !~ '^SATAG-[0-9]{6,}$' then
        raise exception 'Cancelado: falta el candado. Pegue  set satag.borrar_demo = ''SATAG-00000N'';  con el folio de la prueba como primera linea, en la misma ejecucion. No se borro nada.';
    end if;
    v_num := substring(v_folio from '^SATAG-([0-9]+)$')::bigint;

    select * into v_reg from public.registros where folio = v_folio;
    if not found then
        raise exception 'Cancelado: no existe el expediente %. No se borro nada.', v_folio;
    end if;

    if lower(v_reg.usuario_nombres || ' ' || v_reg.usuario_apellido_paterno || ' ' || coalesce(v_reg.usuario_apellido_materno, ''))
       not like '%prueba%' then
        raise exception 'Cancelado: % no trae "Prueba" en el nombre del titular, y este script solo borra la demostracion. No se borro nada.', v_folio;
    end if;

    if v_reg.no_dispositivo is not null
       or exists (select 1 from public.inventario_tags where asignado_a = v_reg.id) then
        raise exception 'Cancelado: % ya tiene un TAG instalado o reservado. No se borra con este script. No se borro nada.', v_folio;
    end if;

    if exists (select 1 from public.registros where created_at > v_reg.created_at) then
        raise exception 'Cancelado: despues de % entro otro expediente. Borrar la prueba dejaria un hueco en los folios reales: se da de baja en lugar de borrarla. No se borro nada.', v_folio;
    end if;

    select last_value, is_called into v_seq_reg, v_seq_reg_c from public.registros_folio_seq;
    if not v_seq_reg_c or v_seq_reg <> v_num then
        raise exception 'Cancelado: la secuencia de folios va en % y la prueba es la %: se gasto otro folio despues. No se borro nada.', v_seq_reg, v_num;
    end if;

    select * into v_pago from public.pagos where registro_id = v_reg.id;
    v_hay_pago := found;
    if v_hay_pago then
        if v_pago.corte_id is not null then
            raise exception 'Cancelado: el pago % ya esta dentro de un corte de caja. No se borro nada.', v_pago.folio_recibo;
        end if;
        if exists (select 1 from public.pagos where created_at > v_pago.created_at) then
            raise exception 'Cancelado: despues del pago % se registro otro cobro. Borrarlo dejaria un hueco en los recibos reales. No se borro nada.', v_pago.folio_recibo;
        end if;
        v_rec_num := substring(v_pago.folio_recibo from '^SATAG-[0-9]{4}-([0-9]+)$')::bigint;
        select last_value, is_called into v_seq_rec, v_seq_rec_c from public.pagos_folio_recibo_seq;
        if v_rec_num is null or not v_seq_rec_c or v_seq_rec <> v_rec_num then
            raise exception 'Cancelado: la secuencia de recibos va en % y el recibo de la prueba es %: se gasto otro recibo despues. No se borro nada.', v_seq_rec, v_pago.folio_recibo;
        end if;
    end if;

    -- Mismo orden que la limpieza del 11-sep.
    delete from public.movimientos               where registro_id = v_reg.id;
    delete from public.aceptaciones              where registro_id = v_reg.id;
    delete from public.registro_estacionamientos where registro_id = v_reg.id;
    delete from public.solicitudes               where registro_id = v_reg.id;
    delete from public.pagos                     where registro_id = v_reg.id;
    delete from public.registros                 where id = v_reg.id;
    get diagnostics n = row_count;
    if n <> 1 then
        raise exception 'Cancelado: se esperaba borrar 1 expediente y fueron %. No se borro nada.', n;
    end if;

    -- AL FINAL, a proposito: setval no se revierte con la transaccion.
    if v_num > 1 then
        perform setval('public.registros_folio_seq', v_num - 1, true);
    else
        perform setval('public.registros_folio_seq', 1, false);
    end if;
    if v_hay_pago then
        if v_rec_num > 1 then
            perform setval('public.pagos_folio_recibo_seq', v_rec_num - 1, true);
        else
            perform setval('public.pagos_folio_recibo_seq', 1, false);
        end if;
    end if;
end
$borrar$;

select
    (select count(*) from public.registros
      where folio = current_setting('satag.borrar_demo', true))            as expediente_debe_ser_0,
    (select last_value from public.registros_folio_seq)                     as folios_ultimo_usado,
    (select last_value from public.pagos_folio_recibo_seq)                  as recibos_ultimo_usado,
    (select count(*)::text || ' cobros · $' || coalesce(sum(monto), 0)::text
       from public.pagos where corte_id is null)                            as en_caja_ahora;


-- ---------------------------------------------------------------------
-- DASHBOARD — Storage > firmas: borre a mano el archivo de la firma que
-- anoto en el PASO 0. El SQL no puede borrar objetos del almacenamiento.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- PASO 2 — Comprobacion. firmas_sin_expediente_de_hoy debe ser 0, y la
-- caja y las secuencias deben estar como antes de la demo (PASO 0).
-- ---------------------------------------------------------------------
select
    (select count(*) from storage.objects o
      where o.bucket_id = 'firmas'
        and o.created_at >= (date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City')
        and not exists (select 1 from public.aceptaciones a
                         where regexp_replace(a.firma_url, '^.*/', '') = regexp_replace(o.name, '^.*/', '')))
                                                                            as firmas_sin_expediente_de_hoy,
    (select count(*) from public.registros
      where lower(usuario_nombres || ' ' || usuario_apellido_paterno) like '%prueba%') as expedientes_con_prueba,
    (select last_value from public.registros_folio_seq)                     as folios_ultimo_usado,
    (select last_value from public.pagos_folio_recibo_seq)                  as recibos_ultimo_usado,
    (select count(*)::text || ' cobros · $' || coalesce(sum(monto), 0)::text
       from public.pagos where corte_id is null)                            as en_caja_ahora;
