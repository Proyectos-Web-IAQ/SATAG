-- =====================================================================
-- SOLO LECTURA · Frecuencia de los procesos de SATAG (21-oct-2026).
--
-- Para el rediseño de la pantalla de TI (Gerardo, 21-oct): «ver que procesos
-- se usan mas seguido» con datos, no de memoria. Cada proceso se cuenta por el
-- rastro que deja en la base (su fecha). No cambia nada y no saca nombres:
-- solo cuentas, y cuantas personas distintas lo hicieron.
--
-- Ventana: desde el 14-sep-2026 (personal real en produccion). Lo anterior es
-- piloto y migracion, y distorsiona.
--
-- Columnas:
--   veces            cuantas veces ocurrio en la ventana
--   por_semana       veces / semanas de la ventana
--   dias             en cuantos dias distintos ocurrio (¿es diario o de rafaga?)
--   ult_7_dias       veces en los ultimos 7 dias (lo de hoy)
--   personas         cuantas personas distintas lo hicieron (sin nombres)
--   ultima_vez       la ultima vez, hora de Queretaro
-- =====================================================================

with ventana as (
    select timestamptz '2026-09-14 00:00:00-06' as desde
),
ev(area, proceso, en, quien) as (
    -- Expedientes
    select 'Expedientes', 'Alta de expediente (' || coalesce(origen_expediente, 'sin origen') || ')', created_at, null::text from registros
    union all select 'Expedientes', 'Instalar TAG (sellado)', instalado_en, instalado_por_email from registros where instalado_en is not null
    union all select 'Expedientes', 'Movimiento: ' || tipo, created_at, hecho_por from movimientos
    union all select 'Expedientes', 'Validar tipo de usuario', tipo_validado_en, null from registros where tipo_validado_en is not null
    union all select 'Expedientes', 'Validar permiso de menor', permiso_validado_en, null from registros where permiso_validado_en is not null
    -- Caja
    union all select 'Caja', 'Cobro', created_at, null from pagos
    union all select 'Caja', 'Devolucion de cobro', devuelto_en, null from pagos where devuelto_en is not null
    union all select 'Caja', 'Corte de caja', created_at, null from cortes_caja
    -- Inventario de TAGs
    union all select 'Inventario', 'Dar de alta TAG en inventario', dado_de_alta_en, null from inventario_tags where dado_de_alta_en is not null
    union all select 'Inventario', 'Asignar TAG del inventario', asignado_en, null from inventario_tags where asignado_en is not null
    -- Buzon y solicitudes
    union all select 'Buzon', 'Solicitud recibida: ' || tipo || coalesce(' / ' || tramite_solicitado, ''), created_at, null from solicitudes
    union all select 'Buzon', 'Solicitud atendida: ' || coalesce(resolucion, 'sin resolucion'), atendida_en, atendida_por from solicitudes where atendida_en is not null
    -- Casos
    union all select 'Casos', 'Caso abierto (' || coalesce(origen, 'sin origen') || ')', creado_en, creado_por from casos
    union all select 'Casos', 'Caso cerrado (' || estado || ')', cerrado_en, null from casos where cerrado_en is not null
    union all select 'Casos', 'Nota en caso', hecho_en, hecho_por from casos_notas where clase = 'nota'
    union all select 'Casos', 'Mover caso a ' || coalesce(estado_despues, '?'), hecho_en, hecho_por from casos_notas where clase = 'estado'
    -- Caseta
    union all select 'Caseta', 'Portero busca un vehiculo', hecho_en, hecho_por from caseta_consultas
    union all select 'Caseta', 'Portero reporta (' || clase || ')', hecho_en, hecho_por from caseta_reportes
    union all select 'Caseta', 'Ligar reporte a expediente', ligado_en, null from caseta_reportes where ligado_en is not null
    union all select 'Caseta', 'Aviso a la caseta creado', creado_en, creado_por from caseta_avisos
    union all select 'Caseta', 'Aviso a la caseta retirado', cerrado_en, null from caseta_avisos where cerrado_en is not null
    union all select 'Caseta', 'Portero responde un aviso', hecho_en, hecho_por from caseta_respuestas
    -- ZK
    union all select 'ZK', 'Subir Todos los Eventos', importado_en, importado_por from zk_importaciones
    union all select 'ZK', 'Subir Personas (padron)', cargado_en, cargado_por from zk_padron_cargas
    union all select 'ZK', 'Subir Personal de Apertura', cargado_en, cargado_por from zk_puertas_cargas
    union all select 'ZK', 'Movimiento en ZK pedido (' || que || ')', creado_en, creado_por from zk_movimientos
    union all select 'ZK', 'Movimiento en ZK verificado', verificado_en, null from zk_movimientos where verificado_en is not null
    union all select 'ZK', 'Tanda de ZK creada', creada_en, creada_por from zk_tandas
    union all select 'ZK', 'Tanda de ZK hecha', hecha_en, hecha_por from zk_tandas where hecha_en is not null
    -- GES
    union all select 'GES', 'Subir archivo de GES', cargado_en, cargado_por from ges_cargas
),
w as (
    select ev.*, (select desde from ventana) as desde from ev where en >= (select desde from ventana)
)
select area,
       proceso,
       count(*)                                                                        as veces,
       round(count(*) / greatest(extract(epoch from (now() - min(desde))) / 604800, 1)::numeric, 1) as por_semana,
       count(distinct (en at time zone 'America/Mexico_City')::date)                   as dias,
       count(*) filter (where en >= now() - interval '7 days')                         as ult_7_dias,
       count(distinct quien)                                                           as personas,
       to_char(max(en) at time zone 'America/Mexico_City', 'DD-Mon HH24:MI')           as ultima_vez
  from w
 group by area, proceso
 order by veces desc;
