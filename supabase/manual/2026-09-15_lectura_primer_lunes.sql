-- =====================================================================
-- 2026-09-15_lectura_primer_lunes.sql
-- Foto del primer dia en produccion (lunes 14-sep-2026): altas, cobros,
-- instalaciones, tiempos, correcciones en campo, firmas y buzon.
--
-- SOLO LECTURA. No escribe nada. Se puede correr con gente capturando.
-- El SQL Editor muestra solo el ultimo statement: todo va en UNA consulta.
-- Pegar entero, ejecutar y descargar el resultado como CSV a
-- Campo/datos/ (no al repo: trae folios y correos del personal).
--
-- Sin datos personales de las familias: ni nombres ni placas. Solo folio,
-- tipo, canal, horas, numero de TAG y quien cobro o instalo.
--
-- Todo lo que hay en la base es real: la limpieza del 14-sep (07:48-08:09)
-- dejo el padron en cero antes de abrir.
--
-- LIMITE CONOCIDO (es justo lo que resuelve L2-04): la base no guarda la
-- hora de instalacion, solo la fecha. La hora «~aprox» sale de cuando se
-- asigno el estacionamiento o se aparto el TAG del inventario, que en un
-- alta por formulario ocurre al instalar. En una captura de hoja fisica
-- esas marcas son de la captura, asi que ahi no se calcula.
-- =====================================================================

with
base as (
    select r.id, r.folio, r.tipo_usuario, r.usuario_es_menor, r.procedencia_tag,
           r.no_dispositivo, r.estado, r.fecha_instalacion, r.instalado_por,
           r.apellidos_familia, r.parentesco_otro, r.tipo_validado_por,
           r.created_at as alta_en,
           case when exists (select 1 from aceptaciones a where a.registro_id = r.id)
                then 'formulario' else 'hoja fisica (TI)' end as canal
      from registros r
),
cobro as (
    select distinct on (p.registro_id)
           p.registro_id, p.created_at as cobro_en, p.monto, p.folio_recibo,
           coalesce(split_part(p.cobrado_por_email, '@', 1), p.cobrado_por) as cobro_quien
      from pagos p
     order by p.registro_id, p.created_at
),
inst as (
    select b.id,
           case when b.canal = 'formulario' and b.no_dispositivo is not null then
               greatest(
                   (select max(re.created_at) from registro_estacionamientos re where re.registro_id = b.id),
                   (select i.asignado_en from inventario_tags i
                     where i.asignado_a = b.id and i.no_dispositivo = b.no_dispositivo)
               )
           end as inst_aprox,
           (select string_agg(re.estacionamiento_clave, '+' order by re.estacionamiento_clave)
              from registro_estacionamientos re where re.registro_id = b.id) as accesos
      from base b
),
todo as (
    select b.*, c.cobro_en, c.monto, c.folio_recibo, c.cobro_quien, i.inst_aprox, i.accesos,
           round(extract(epoch from (c.cobro_en - b.alta_en)) / 60)::int    as min_alta_cobro,
           round(extract(epoch from (i.inst_aprox - c.cobro_en)) / 60)::int as min_cobro_inst
      from base b
      left join cobro c on c.registro_id = b.id
      left join inst  i on i.id = b.id
),

-- 1. Resumen del padron -------------------------------------------------
resumen as (
    select 100 as orden, '1 resumen' as seccion, 'expedientes en total' as dato, count(*)::text as valor from todo
    union all select 101, '1 resumen', 'por estado', string_agg(estado || ': ' || n, ' · ' order by n desc)
      from (select estado, count(*) n from todo group by estado) x
    union all select 102, '1 resumen', 'por tipo de usuario', string_agg(tipo_usuario || ': ' || n, ' · ' order by n desc)
      from (select tipo_usuario, count(*) n from todo group by tipo_usuario) x
    union all select 103, '1 resumen', 'por canal de alta', string_agg(canal || ': ' || n, ' · ' order by n desc)
      from (select canal, count(*) n from todo group by canal) x
    union all select 104, '1 resumen', 'procedencia del TAG (instalados)', coalesce(string_agg(procedencia_tag || ': ' || n, ' · ' order by n desc), '0')
      from (select procedencia_tag, count(*) n from todo where no_dispositivo is not null group by procedencia_tag) x
    union all select 105, '1 resumen', 'conductor menor de edad', count(*)::text from todo where usuario_es_menor
    union all select 106, '1 resumen', 'otro familiar (con parentesco)', count(*)::text from todo where tipo_usuario = 'otro'
    union all select 107, '1 resumen', 'padres/alumno/otro SIN apellidos de familia', count(*)::text
      from todo where tipo_usuario in ('padres','alumno','otro') and btrim(coalesce(apellidos_familia, '')) = ''
    union all select 108, '1 resumen', 'embudo: alta -> cobrado -> con TAG',
           count(*)::text || ' -> ' || count(cobro_en)::text || ' -> ' || count(no_dispositivo)::text from todo
),

-- 2. Cuando llegaron (hora local de Queretaro) ---------------------------
por_hora as (
    select 200 + row_number() over (order by h) as orden, '2 altas por hora' as seccion,
           to_char(h, 'DD-Mon HH24":00"') as dato, n::text as valor
      from (select date_trunc('hour', alta_en at time zone 'America/Mexico_City') h, count(*) n
              from todo group by 1) x
    union all
    select 250 + row_number() over (order by h), '2 cobros por hora',
           to_char(h, 'DD-Mon HH24":00"'), n::text
      from (select date_trunc('hour', cobro_en at time zone 'America/Mexico_City') h, count(*) n
              from todo where cobro_en is not null group by 1) x
),

-- 3. Tiempos --------------------------------------------------------------
tiempos as (
    select 300 as orden, '3 tiempos' as seccion, 'alta -> cobro (minutos): mediana · min · max · n' as dato,
           coalesce(percentile_cont(0.5) within group (order by min_alta_cobro)::int::text, '-')
           || ' · ' || coalesce(min(min_alta_cobro)::text, '-') || ' · ' || coalesce(max(min_alta_cobro)::text, '-')
           || ' · n=' || count(min_alta_cobro)::text as valor
      from todo
    union all
    select 301, '3 tiempos', 'cobro -> instalacion ~aprox (minutos, solo formulario): mediana · min · max · n',
           coalesce(percentile_cont(0.5) within group (order by min_cobro_inst)::int::text, '-')
           || ' · ' || coalesce(min(min_cobro_inst)::text, '-') || ' · ' || coalesce(max(min_cobro_inst)::text, '-')
           || ' · n=' || count(min_cobro_inst)::text
      from todo
    union all
    select 302, '3 tiempos', 'primera alta · ultima alta (hora local)',
           coalesce(to_char(min(alta_en) at time zone 'America/Mexico_City', 'DD-Mon HH24:MI'), '-') || ' · '
           || coalesce(to_char(max(alta_en) at time zone 'America/Mexico_City', 'DD-Mon HH24:MI'), '-')
      from todo
),

-- 4. Cada expediente, sin datos personales --------------------------------
expedientes as (
    select 1000 + row_number() over (order by alta_en) as orden, '4 expediente' as seccion,
           folio || ' · ' || tipo_usuario || case when usuario_es_menor then ' (menor)' else '' end
           || ' · ' || canal || ' · ' || estado as dato,
           'alta ' || to_char(alta_en at time zone 'America/Mexico_City', 'DD-Mon HH24:MI')
           || case when cobro_en is null then ' · SIN COBRO'
                   else ' · cobro ' || to_char(cobro_en at time zone 'America/Mexico_City', 'HH24:MI')
                        || ' (' || coalesce(cobro_quien, '?') || ', ' || coalesce(folio_recibo, 'sin recibo')
                        || ', $' || monto::text || ', +' || min_alta_cobro::text || ' min)' end
           || case when no_dispositivo is null then ' · SIN TAG'
                   else ' · TAG ' || procedencia_tag || ' ' || no_dispositivo
                        || ' · inst ' || coalesce(to_char(fecha_instalacion, 'DD-Mon'), '?')
                        || coalesce(' ~' || to_char(inst_aprox at time zone 'America/Mexico_City', 'HH24:MI'), '')
                        || coalesce(' (+' || min_cobro_inst::text || ' min)', '')
                        || ' por «' || coalesce(instalado_por, '?') || '»'
                        || ' · accesos ' || coalesce(accesos, 'ninguno') end
           || case when tipo_validado_por is not null then ' · tipo confirmado en caja' else '' end as valor
      from todo
),

-- 5. Caja -------------------------------------------------------------------
caja as (
    select 4000 as orden, '5 caja' as seccion, 'pagos · total' as dato,
           count(*)::text || ' · $' || coalesce(sum(monto), 0)::text as valor from pagos
    union all select 4001, '5 caja', 'sin cortar (en caja ahora)',
           count(*)::text || ' · $' || coalesce(sum(monto), 0)::text from pagos where corte_id is null
    union all select 4002, '5 caja', 'cortes cerrados', count(*)::text from cortes_caja
    union all
    select 4010 + row_number() over (order by quien), '5 caja por cobrador', quien, n::text || ' cobros · $' || total::text
      from (select coalesce(split_part(cobrado_por_email, '@', 1), cobrado_por, '?') quien, count(*) n, sum(monto) total
              from pagos group by 1) x
),

-- 6. Instalaciones y correcciones en campo --------------------------------------
campo as (
    select 4500 + row_number() over (order by quien) as orden, '6 instalaciones por quien (texto tecleado)' as seccion,
           quien as dato, n::text as valor
      from (select coalesce(nullif(btrim(instalado_por), ''), '(vacio)') quien, count(*) n
              from registros where no_dispositivo is not null group by 1) x
    union all
    select 4600 + row_number() over (order by tipo, quien), '6 movimientos (sin contar altas)',
           tipo || ' · ' || quien, n::text
      from (select m.tipo, coalesce(nullif(btrim(m.hecho_por), ''), '?') quien, count(*) n
              from movimientos m where m.tipo <> 'alta' group by 1, 2) x
    union all
    select 4700 + row_number() over (order by m.created_at), '6 detalle de correcciones',
           r.folio || ' · ' || m.tipo || ' · ' || to_char(m.created_at at time zone 'America/Mexico_City', 'DD-Mon HH24:MI'),
           -- el motivo puede traer placas (p. ej. «placas ABC -> XYZ»): se muestra
           -- solo lo que va antes de los dos puntos, que dice QUE se corrigio.
           coalesce(m.hecho_por, '?') || ' · ' ||
           case
               -- «Actualizacion: placas X -> Y; marca A -> B - motivo»: solo los campos.
               when m.motivo like 'Actualizacion:%' then
                   'corrigio: ' || (select string_agg(split_part(btrim(d), ' ', 1), ', ')
                                      from unnest(string_to_array(substr(m.motivo, 15), ';')) d)
               -- tipo y procedencia no son datos personales: se muestran completos.
               when m.motivo like 'Tipo de usuario:%' or m.motivo like 'Procedencia TAG:%' then
                   split_part(m.motivo, ' - ', 1)
               -- parentesco, bajas y reposiciones pueden traer texto libre: solo la etiqueta.
               when m.motivo like 'Parentesco:%' then 'parentesco (validado al cobrar)'
               else m.tipo
           end
      from movimientos m join registros r on r.id = m.registro_id
     where m.tipo <> 'alta'
),

-- 7. Firmas: altas que no terminaron ---------------------------------------------
-- La firma se sube ANTES de crear el expediente. Una imagen del bucket sin
-- aceptacion que la use es un alta que se intento y no se completo (o un
-- resto previo a la limpieza). Es la unica huella de esas familias.
firmas as (
    select 6000 as orden, '7 firmas' as seccion, 'imagenes en el bucket · con aceptacion · huerfanas' as dato,
           count(*)::text || ' · ' || count(a.id)::text || ' · ' || (count(*) - count(a.id))::text as valor
      from storage.objects o
      left join aceptaciones a on regexp_replace(a.firma_url, '^.*/', '') = regexp_replace(o.name, '^.*/', '')
     where o.bucket_id = 'firmas'
    union all
    select 6010 + row_number() over (order by o.created_at), '7 firma huerfana (alta no terminada)',
           to_char(o.created_at at time zone 'America/Mexico_City', 'DD-Mon HH24:MI:SS'),
           'sin expediente'
      from storage.objects o
     where o.bucket_id = 'firmas'
       and not exists (select 1 from aceptaciones a
                        where regexp_replace(a.firma_url, '^.*/', '') = regexp_replace(o.name, '^.*/', ''))
),

-- 8. Buzon, inventario y seguridad ----------------------------------------------
otros as (
    select 7000 + row_number() over (order by count(*) desc) as orden, '8 buzon' as seccion,
           coalesce(resolucion, 'pendiente') || case when registro_id is null then ' · nota sin expediente' else '' end as dato,
           count(*)::text as valor
      from solicitudes
     group by coalesce(resolucion, 'pendiente'), (registro_id is null)
    union all select 8000, '8 inventario TAGs', 'total · disponibles · asignados',
           count(*)::text || ' · ' || count(*) filter (where asignado_a is null)::text
           || ' · ' || count(*) filter (where asignado_a is not null)::text from inventario_tags
    union all select 9000, '8 seguridad', 'intentos publicos desde el 14-sep',
           count(*)::text from intentos_publicos where creado_en >= timestamptz '2026-09-14 00:00 America/Mexico_City'
)

select orden, seccion, dato, valor from resumen
union all select * from por_hora
union all select * from tiempos
union all select * from expedientes
union all select * from caja
union all select * from campo
union all select * from firmas
union all select * from otros
order by orden;
