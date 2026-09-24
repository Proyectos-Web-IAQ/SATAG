-- =====================================================================
-- SATAG · Contrastar el tablero de instalacion contra la base
-- SOLO LECTURA. No crea nada, no toca nada. Se puede correr completo
-- cuantas veces se quiera.
--
-- PARA QUE SIRVE. El tablero de la pestana Finanzas calcula las medianas
-- EN EL NAVEGADOR, sobre las filas que le entrega PostgREST. Eso es
-- correcto con unas decenas de expedientes, pero significa que la
-- pantalla es la unica que hace la cuenta: si el calculo estuviera mal,
-- nada en la base lo contradiria. Esta consulta hace la misma cuenta del
-- lado del servidor, con percentile_cont, para poder compararlas.
--
-- COMO USARLA. Abra el panel en Finanzas, corra esto, y compare. Los
-- numeros deben coincidir renglon por renglon. La pantalla redondea a
-- minutos y aqui salen intervalos exactos, asi que puede haber un minuto
-- de diferencia por el redondeo: mas que eso es un hallazgo.
--
-- LAS MISMAS TRES REGLAS QUE APLICA LA PANTALLA:
--   1. Entra todo lo que tiene fecha_instalacion, no solo lo que tiene
--      hora. La hora existe desde el bloque 68 (15-sep-2026); filtrar por
--      ella contaria menos TAGs de los que se instalaron.
--   2. Del expediente se toma su PRIMER cobro. Un expediente puede tener
--      mas de uno (reinstalacion, segundo TAG) y el que arranca la espera
--      es el mas antiguo.
--   3. Si la instalacion quedo sellada ANTES de su cobro, la resta saldria
--      negativa: ese caso no entra en las medianas y se cuenta aparte.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LAS CUATRO TARJETAS
-- ---------------------------------------------------------------------
with base as (
  select r.id,
         r.folio,
         r.fecha_instalacion,
         r.created_at as alta_en,
         r.instalado_en,
         r.instalado_por_email,
         (select min(p.created_at) from pagos p where p.registro_id = r.id) as cobrado_en
    from registros r
   where r.fecha_instalacion is not null
),
d as (
  select b.*,
         case when b.instalado_en is not null
               and b.cobrado_en   is not null
               and b.instalado_en >= b.cobrado_en
              then b.instalado_en - b.cobrado_en end as tramite,
         case when b.cobrado_en is not null
               and b.cobrado_en >= b.alta_en
              then b.cobrado_en - b.alta_en end as espera_pago
    from base b
)
select count(*)                     as tags_instalados,      -- tarjeta 1, numero grande
       count(instalado_en)          as con_hora_sellada,     -- tarjeta 1, renglon de abajo
       count(tramite)               as medibles,             -- tarjeta 2, "mediana de N"
       percentile_cont(0.5) within group (order by tramite)     as mediana_cobro_instalacion, -- tarjeta 2
       percentile_cont(0.5) within group (order by espera_pago) as mediana_alta_cobro,        -- tarjeta 3
       count(*) filter (
         where instalado_en is not null
           and cobrado_en   is not null
           and instalado_en <  cobrado_en
       )                            as fuera_de_orden        -- el aviso, si sale > 0
  from d;

-- ---------------------------------------------------------------------
-- 2. POR PERSONA (tabla "Quien instalo")
--    Ordenada por cantidad, igual que la pantalla. NO es un ranking de
--    velocidad: el reloj corre mientras la familia llega.
-- ---------------------------------------------------------------------
with base as (
  select r.id, r.instalado_en, r.instalado_por_email, r.created_at as alta_en,
         (select min(p.created_at) from pagos p where p.registro_id = r.id) as cobrado_en
    from registros r
   where r.fecha_instalacion is not null
),
d as (
  select b.*,
         case when b.instalado_en is not null
               and b.cobrado_en   is not null
               and b.instalado_en >= b.cobrado_en
              then b.instalado_en - b.cobrado_en end as tramite
    from base b
)
select coalesce(instalado_por_email, '(sin identificar)') as quien,
       count(*)       as tags,
       count(tramite) as con_hora,
       percentile_cont(0.5) within group (order by tramite) as mediana_tramite,
       min(tramite)   as la_mas_rapida,
       max(tramite)   as la_mas_tardada
  from d
 group by 1
 order by tags desc, quien;

-- ---------------------------------------------------------------------
-- 3. POR DIA (tabla "Instalacion por dia")
--    fecha_instalacion ya viene en fecha de Queretaro: la calcula la BD
--    en el bloque 68, asi que aqui no hay que convertir nada.
-- ---------------------------------------------------------------------
with base as (
  select r.id, r.fecha_instalacion, r.instalado_en,
         (select min(p.created_at) from pagos p where p.registro_id = r.id) as cobrado_en
    from registros r
   where r.fecha_instalacion is not null
),
d as (
  select b.*,
         case when b.instalado_en is not null
               and b.cobrado_en   is not null
               and b.instalado_en >= b.cobrado_en
              then b.instalado_en - b.cobrado_en end as tramite
    from base b
)
select fecha_instalacion as dia,
       count(*)       as tags,
       count(tramite) as con_hora,
       percentile_cont(0.5) within group (order by tramite) as mediana_tramite
  from d
 group by 1
 order by dia desc;

-- ---------------------------------------------------------------------
-- 4. EL DETALLE, EXPEDIENTE POR EXPEDIENTE
--    Para cuando un numero de arriba no cuadre y haya que ver de donde
--    sale. No trae ningun dato de la familia (ni nombre ni placa): solo
--    folios, horas y el correo institucional de quien instalo.
-- ---------------------------------------------------------------------
select r.folio,
       r.fecha_instalacion,
       to_char(r.created_at   at time zone 'America/Mexico_City', 'DD-Mon HH24:MI') as alta_qro,
       to_char(pg.primer_cobro at time zone 'America/Mexico_City', 'DD-Mon HH24:MI') as cobro_qro,
       to_char(r.instalado_en at time zone 'America/Mexico_City', 'DD-Mon HH24:MI') as instalado_qro,
       r.instalado_por_email,
       case when r.instalado_en is null then 'sin hora (anterior al bloque 68)'
            when pg.primer_cobro is null then 'sin cobro'
            when r.instalado_en < pg.primer_cobro then 'FUERA DE ORDEN'
            else (r.instalado_en - pg.primer_cobro)::text end as tramite
  from registros r
  left join lateral (
    select min(p.created_at) as primer_cobro from pagos p where p.registro_id = r.id
  ) pg on true
 where r.fecha_instalacion is not null
 order by r.instalado_en desc nulls last, r.fecha_instalacion desc;
