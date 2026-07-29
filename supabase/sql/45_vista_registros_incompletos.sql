-- =====================================================================
-- 45_vista_registros_incompletos.sql
-- CC-02 (B2): reporte de expedientes incompletos.
--
-- Documentado desde el 03-jul y nunca implementado. Cierra el ultimo
-- pendiente del panel 1.7 (E5).
--
-- QUE ES UN EXPEDIENTE INCOMPLETO
--
-- El criterio NO es "le falta un paso del flujo": eso seria repetir la cola de
-- cobro de Administracion y la cola de instalacion de TI, que ya existen en el
-- panel. Un reporte que repite las colas es ruido.
--
-- Aqui "incompleto" es una de tres cosas:
--
--   a) FALTANTE DE INTEGRIDAD. Un estado que los RPC no pueden producir. Si
--      aparece, algo se escribio por fuera del panel (SQL editor, seed, import).
--        tag_sin_pago            TAG instalado sin renglon en pagos.
--        activo_sin_tag          estado='activo' sin no_dispositivo.
--        tag_sin_estacionamiento TAG instalado sin ningun estacionamiento.
--        vehiculo_incompleto     marca o color vacios. Ojo: 12_registros.sql
--                                solo tiene reg_modelo_no_vacio; marca y color
--                                NO llevan CHECK, asi que un insert directo si
--                                los puede dejar en blanco.
--
--   b) FALTANTE OPERATIVO REAL.
--        sin_placas              El TAG ya esta instalado y el expediente sigue
--                                marcado sin_placas. reg_placas_requeridas
--                                garantiza que nunca hay un registro sin placas
--                                Y sin la marca, asi que este es el unico caso
--                                de "sin placas cuando deberia tenerlas": el
--                                permiso provisional que nunca se sustituyo.
--
--   c) ATORADO (solo despues del umbral de DIAS_ATORO).
--        sin_pago                Pendiente, sin pago, N dias desde el alta.
--        sin_instalar            Pagado, sin TAG, N dias desde el cobro.
--      Sin el umbral estos dos SON las colas del dia. Con el umbral son
--      "esto se quedo a medias y nadie volvio".
--
-- QUE QUEDA FUERA, A PROPOSITO
--
--   - estado='baja': un expediente cerrado ya no tiene que estar completo.
--   - "Sin firma / sin aceptacion", que legalmente seria el faltante mas grave.
--     Dos razones: seed_tests_dev.sql inserta el banco de QA directo en la
--     tabla, sin aceptaciones, asi que el reporte se encenderia entero; y la
--     vista tendria que leer aceptaciones, que el rol 'consulta' no ve
--     (bloque 30 / bloque 47). Se revisa por separado con una consulta de
--     auditoria, no desde el panel.
--   - "Tipo de usuario sin validar" (tipo_validado, bloque 46): encaja en el
--     concepto, pero marcaria todo lo cobrado antes del bloque 46. Se puede
--     agregar cuando el padron ya tenga cobros validados.
--
-- SEGURIDAD
--
-- security_invoker = true: la vista NO abre una segunda puerta. Corre con los
-- permisos de quien consulta, asi que hereda tal cual la RLS de registros,
-- pagos y registro_estacionamientos (aal2 + rol admin/ti/consulta/super, de
-- los bloques 27 y 30). Un usuario sin rol recibe cero filas, igual que hoy.
-- Requiere PostgreSQL 15+ (Supabase lo cumple).
--
-- Depende de: 12_registros.sql, 24_pagos.sql, 25_registro_estacionamientos.sql.
-- Aplicar despues del bloque 44.
-- =====================================================================

-- drop + create (no "create or replace"): replace falla en cuanto cambia la
-- lista de columnas, y este bloque debe poder reaplicarse tal cual.
drop view if exists v_registros_incompletos;

create view v_registros_incompletos
with (security_invoker = true)
as
with base as (
    select
        r.id,
        r.folio,
        r.usuario_nombre_completo,
        r.gestionante_nombre_completo,
        r.tipo_usuario,
        r.marca,
        r.modelo,
        r.color,
        r.placas,
        r.sin_placas,
        r.no_dispositivo,
        r.procedencia_tag,
        r.estado,
        r.created_at,
        p.folio_recibo,
        p.created_at as pago_created_at,
        -- Todo lo temporal se calcula en hora local, nunca sobre pagos.fecha ni
        -- current_date: los dos evaluan en UTC y un cobro de la tarde se
        -- fecharia al dia siguiente (misma disciplina que el bloque 42).
        ((now() at time zone 'America/Mexico_City')::date
            - (r.created_at at time zone 'America/Mexico_City')::date) as dias_desde_alta,
        ((now() at time zone 'America/Mexico_City')::date
            - (p.created_at at time zone 'America/Mexico_City')::date) as dias_desde_pago,
        exists (
            select 1 from registro_estacionamientos re where re.registro_id = r.id
        ) as tiene_estacionamiento
    from registros r
    -- uq_pagos_registro (bloque 32) garantiza como maximo un pago por
    -- expediente: este left join no multiplica filas.
    left join pagos p on p.registro_id = r.id
    where r.estado <> 'baja'
),
evaluado as (
    select
        b.*,
        array_remove(array[
            -- (a) Integridad: los RPC no pueden producir ninguno de estos.
            case when b.no_dispositivo is not null and b.pago_created_at is null
                 then 'tag_sin_pago' end,
            case when b.estado = 'activo' and b.no_dispositivo is null
                 then 'activo_sin_tag' end,
            case when b.no_dispositivo is not null and not b.tiene_estacionamiento
                 then 'tag_sin_estacionamiento' end,
            case when btrim(coalesce(b.marca, '')) = ''
                       or btrim(coalesce(b.color, '')) = ''
                 then 'vehiculo_incompleto' end,
            -- (b) Faltante operativo real.
            case when b.no_dispositivo is not null and b.sin_placas
                 then 'sin_placas' end,
            -- (c) Atorados: 7 dias naturales. Si este numero cambia, actualice
            -- tambien el manual E8 y Pruebas/01 - Matriz de Casos.md.
            case when b.pago_created_at is null and b.dias_desde_alta >= 7
                 then 'sin_pago' end,
            case when b.pago_created_at is not null
                       and b.no_dispositivo is null
                       and b.dias_desde_pago >= 7
                 then 'sin_instalar' end
        ], null) as motivos
    from base b
)
select
    e.id,
    e.folio,
    e.usuario_nombre_completo,
    e.gestionante_nombre_completo,
    e.tipo_usuario,
    e.marca,
    e.modelo,
    e.color,
    e.placas,
    e.sin_placas,
    e.no_dispositivo,
    e.procedencia_tag,
    e.estado,
    e.folio_recibo,
    e.created_at,
    e.dias_desde_alta,
    e.dias_desde_pago,
    e.motivos,
    cardinality(e.motivos) as total_motivos
from evaluado e
where cardinality(e.motivos) > 0;

comment on view v_registros_incompletos is
    'CC-02: expedientes con algo faltante para operar, con el motivo. Una fila por expediente; motivos[] trae los codigos. Excluye estado=baja. security_invoker: hereda la RLS del panel.';

-- anon no tiene grant sobre registros ni pagos, asi que aunque le quedara un
-- grant heredado la vista no le devolveria nada. Se revoca igual, explicito.
revoke all on v_registros_incompletos from public;
revoke all on v_registros_incompletos from anon;
grant select on v_registros_incompletos to authenticated;

-- Hace visible la vista de inmediato para PostgREST/Supabase API.
notify pgrst, 'reload schema';

-- =====================================================================
-- Auditoria esperada (casos F-29..F-33 de Pruebas/01 - Matriz de Casos.md):
--
-- - anon: sin acceso (sin grant, y sin RLS que lo deje leer las tablas base).
-- - authenticated sin aal2 o sin app_metadata.rol: cero filas.
-- - Roles admin / ti / consulta / super: ven las mismas filas. La vista no
--   contiene firma ni evidencia, asi que 'consulta' la puede leer completa.
-- - Un expediente dado de baja NUNCA aparece, aunque le falte todo.
-- - Un alta de hoy sin pago NO aparece (es la cola normal de Administracion);
--   a los 7 dias aparece con motivo 'sin_pago'.
-- - Un expediente activo, con pago, TAG, estacionamiento y placas capturadas
--   no aparece con ningun motivo.
--
-- Comprobacion rapida (SQL Editor, como owner; el owner omite RLS):
--   select folio, estado, motivos, dias_desde_alta, dias_desde_pago
--     from v_registros_incompletos
--    order by total_motivos desc, dias_desde_alta desc;
--
--   -- Reparto por motivo:
--   select m as motivo, count(*)
--     from v_registros_incompletos, unnest(motivos) as m
--    group by m order by 2 desc;
-- =====================================================================
