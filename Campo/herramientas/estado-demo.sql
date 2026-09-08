-- =====================================================================
-- estado-demo.sql · Foto completa del estado de SATAG antes de la demo.
-- SOLO LECTURA. El SQL Editor muestra solo el ultimo statement: todo va
-- en UNA consulta. Pegar entero y ejecutar.
-- =====================================================================

with
padron_estado as (
    select 100 + row_number() over (order by count(*) desc) as orden,
           'padron por estado' as seccion, estado as dato, count(*)::text as valor
      from registros group by estado
),
expedientes as (
    select 1000 + row_number() over (order by r.created_at) as orden,
           'expediente' as seccion,
           r.folio || ' · ' || r.usuario_nombre_completo as dato,
           r.estado
           || ' · TAG: ' || coalesce(r.no_dispositivo, '(sin TAG)')
           || ' · placas: ' || coalesce(nullif(r.placas, ''), case when r.sin_placas then 'SIN PLACAS' else '(vacio)' end)
           || ' · pagos: ' || (select count(*) from pagos p where p.registro_id = r.id)::text
           || ' · alta: ' || to_char(r.created_at, 'DD-Mon HH24:MI') as valor
      from registros r
     where r.usuario_nombres <> 'Prueba Carga'
),
roles as (
    select 5000 + row_number() over (order by u.email) as orden,
           'cuenta del panel' as seccion,
           u.email as dato,
           coalesce(u.raw_app_meta_data ->> 'rol', '(SIN ROL)')
           || case when u.last_sign_in_at is null then ' · nunca ha entrado'
                   else ' · ultimo acceso: ' || to_char(u.last_sign_in_at, 'DD-Mon HH24:MI') end as valor
      from auth.users u
),
caja as (
    select 6000 as orden, 'caja' as seccion, 'pagos registrados' as dato,
           count(*)::text || ' · total historico: $' || coalesce(sum(monto), 0)::text from pagos
    union all
    select 6001, 'caja', 'cobros sin cortar (en caja ahora)',
           count(*)::text || ' · $' || coalesce(sum(monto), 0)::text from pagos where corte_id is null
    union all
    select 6002, 'caja', 'cortes cerrados', count(*)::text from cortes_caja
),
buzon as (
    select 7000 + row_number() over (order by count(*) desc) as orden,
           'buzon' as seccion,
           coalesce(resolucion, 'pendiente')
           || case when registro_id is null then ' · nota sin expediente' else '' end as dato,
           count(*)::text as valor
      from solicitudes
     group by coalesce(resolucion, 'pendiente'), (registro_id is null)
),
documentos as (
    select 8000 as orden, 'documento' as seccion,
           'reglamento vigente v' || version::text as dato,
           length(contenido)::text || ' caracteres' as valor
      from reglamento_versiones where vigente
    union all
    select 8001, 'documento', 'aviso vigente v' || version::text,
           length(contenido)::text || ' caracteres (simplificado: ' || coalesce(length(contenido_simplificado), 0)::text || ')'
      from aviso_versiones where vigente
),
catalogos as (
    select 9000 as orden, 'catalogo' as seccion, 'marcas' as dato, count(*)::text from cat_marcas
    union all select 9001, 'catalogo', 'modelos', count(*)::text from cat_modelos
    union all select 9002, 'catalogo', 'colores', count(*)::text from cat_colores
    union all select 9003, 'catalogo', 'estacionamientos', count(*)::text from estacionamientos
),
intentos as (
    select 9990 as orden, 'seguridad' as seccion, 'intentos publicos (ultimas 24 h)' as dato,
           count(*)::text as valor
      from intentos_publicos where creado_en > now() - interval '24 hours'
)
select orden, seccion, dato, valor from padron_estado
union all select orden, seccion, dato, valor from expedientes
union all select * from roles
union all select * from caja
union all select * from buzon
union all select * from documentos
union all select * from catalogos
union all select * from intentos
order by orden;
