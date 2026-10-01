-- =====================================================================
-- BLOQUE 80 — La bandeja de expedientes incompletos deja de contar los migrados.
--
-- SC-031. Tercer bloque de la pestana Estacionamiento.
--
-- POR QUE
--   Al migrar el padron historico (bloque 79 y su carga) el contador
--   «Expedientes incompletos» de la pestana TI paso de decenas a 1,647: los
--   expedientes migrados entran sin placa, sin vehiculo o sin derecho de pluma,
--   porque eso es lo que traia la hoja, y la vista los cuenta como si fueran altas
--   a medio terminar.
--
--   NO SON LO MISMO Y NO SE RESUELVEN IGUAL. Un expediente incompleto de SATAG es
--   trabajo de TI de hoy: alguien dio de alta y falto un dato. Un expediente
--   migrado incompleto es un hueco del archivo de origen, de hace anos, que se
--   completa cuando esa persona vuelva a pasar por la ventanilla. Mezclarlos
--   convierte una bandeja de trabajo en una lista imposible, y una bandeja que
--   nadie puede vaciar es una bandeja que se deja de mirar.
--
-- QUE NO SE PIERDE
--   Los huecos de lo migrado siguen contados y se sacan cuando se quieran:
--
--     select count(*) filter (where placas is null and not sin_placas) as sin_placa,
--            count(*) filter (where marca = 'Sin registrar')           as sin_vehiculo,
--            count(*) filter (where evidencia_aceptacion = 'no_localizada') as sin_firma
--       from registros where origen_expediente <> 'satag';
--
-- QUE CAMBIA, EXACTAMENTE
--   UNA linea del WHERE de la CTE `base`, y nada mas. El cuerpo de la vista se
--   EXTRAJO de la definicion viva con pg_get_viewdef y se le aplico ese delta
--   verificado con diff; no se transcribio.
--
--     -  WHERE r.estado <> 'baja'::text
--     +  WHERE r.estado <> 'baja'::text AND r.origen_expediente = 'satag'
--
--   Sigue siendo `security_invoker = true`, asi que hereda la RLS del panel y no
--   abre una segunda puerta. El bloque 71 verifica ese invariante.
--
-- Depende de: 45 (v_registros_incompletos), 79 (origen_expediente).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. GUARDIA. Va primero: si aborta, no se aplico nada.
-- ---------------------------------------------------------------------
do $guardia$
declare
    v_n int;
    v_def text;
begin
    select count(*) into v_n
      from information_schema.columns
     where table_schema = 'public' and table_name = 'registros'
       and column_name = 'origen_expediente';
    if v_n <> 1 then
        raise exception 'Falta registros.origen_expediente: aplique antes el bloque 79. No se aplico nada.';
    end if;

    select pg_get_viewdef('v_registros_incompletos'::regclass, true) into v_def;
    if v_def is null then
        raise exception 'No existe v_registros_incompletos: aplique antes el bloque 45. No se aplico nada.';
    end if;
    if v_def like '%origen_expediente%' then
        raise exception 'v_registros_incompletos ya filtra por origen_expediente: este bloque ya se aplico. No se aplico nada.';
    end if;

    -- Si la vista dejo de ser security_invoker, redefinirla aqui podria abrir una
    -- puerta que la RLS del panel no cubre. Mejor abortar y mirarlo.
    select count(*) into v_n from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'v_registros_incompletos'
       and c.reloptions::text like '%security_invoker=%true%';
    if v_n <> 1 then
        raise exception 'v_registros_incompletos no es security_invoker. Revise antes de redefinirla. No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. LA VISTA, con el delta de una linea.
-- ---------------------------------------------------------------------
create or replace view v_registros_incompletos
with (security_invoker = true) as
WITH base AS (
         SELECT r.id,
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
            p.created_at AS pago_created_at,
            (now() AT TIME ZONE 'America/Mexico_City'::text)::date - (r.created_at AT TIME ZONE 'America/Mexico_City'::text)::date AS dias_desde_alta,
            (now() AT TIME ZONE 'America/Mexico_City'::text)::date - (p.created_at AT TIME ZONE 'America/Mexico_City'::text)::date AS dias_desde_pago,
            (EXISTS ( SELECT 1
                   FROM registro_estacionamientos re
                  WHERE re.registro_id = r.id)) AS tiene_estacionamiento
           FROM registros r
             LEFT JOIN pagos p ON p.registro_id = r.id
          WHERE r.estado <> 'baja'::text AND r.origen_expediente = 'satag'
        ), evaluado AS (
         SELECT b.id,
            b.folio,
            b.usuario_nombre_completo,
            b.gestionante_nombre_completo,
            b.tipo_usuario,
            b.marca,
            b.modelo,
            b.color,
            b.placas,
            b.sin_placas,
            b.no_dispositivo,
            b.procedencia_tag,
            b.estado,
            b.created_at,
            b.folio_recibo,
            b.pago_created_at,
            b.dias_desde_alta,
            b.dias_desde_pago,
            b.tiene_estacionamiento,
            array_remove(ARRAY[
                CASE
                    WHEN b.no_dispositivo IS NOT NULL AND b.pago_created_at IS NULL THEN 'tag_sin_pago'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN b.estado = 'activo'::text AND b.no_dispositivo IS NULL THEN 'activo_sin_tag'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN b.no_dispositivo IS NOT NULL AND NOT b.tiene_estacionamiento THEN 'tag_sin_estacionamiento'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN btrim(COALESCE(b.marca, ''::text)) = ''::text OR btrim(COALESCE(b.color, ''::text)) = ''::text THEN 'vehiculo_incompleto'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN b.no_dispositivo IS NOT NULL AND b.sin_placas THEN 'sin_placas'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN b.pago_created_at IS NULL AND b.dias_desde_alta >= 7 THEN 'sin_pago'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN b.pago_created_at IS NOT NULL AND b.no_dispositivo IS NULL AND b.dias_desde_pago >= 7 THEN 'sin_instalar'::text
                    ELSE NULL::text
                END], NULL::text) AS motivos
           FROM base b
        )
 SELECT id,
    folio,
    usuario_nombre_completo,
    gestionante_nombre_completo,
    tipo_usuario,
    marca,
    modelo,
    color,
    placas,
    sin_placas,
    no_dispositivo,
    procedencia_tag,
    estado,
    folio_recibo,
    created_at,
    dias_desde_alta,
    dias_desde_pago,
    motivos,
    cardinality(motivos) AS total_motivos
   FROM evaluado e
  WHERE cardinality(motivos) > 0;

comment on view v_registros_incompletos is
    'Altas de SATAG a las que les falta un dato para operar. EXCLUYE los expedientes migrados (bloque 80): sus huecos vienen del archivo de origen, no de un alta a medias.';


-- ---------------------------------------------------------------------
-- 2. VERIFICACION (solo lectura). ok en true en las cuatro filas.
-- ---------------------------------------------------------------------
select 1 as orden, 'la vista ya filtra por origen_expediente' as que,
       null::text as valor,
       (select pg_get_viewdef('v_registros_incompletos'::regclass, true) like '%origen_expediente%') as ok
union all
select 2, 'sigue siendo security_invoker', null,
       (select count(*) = 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = 'v_registros_incompletos'
           and c.reloptions::text like '%security_invoker=%true%')
union all
select 3, 'ningun expediente migrado aparece ya en la bandeja',
       (select count(*)::text from v_registros_incompletos),
       (select count(*) = 0 from v_registros_incompletos v
          join registros r on r.id = v.id where r.origen_expediente <> 'satag')
union all
select 4, 'los huecos de lo migrado siguen contados aparte',
       (select count(*) filter (where placas is null and not sin_placas)::text || ' sin placa, ' ||
               count(*) filter (where marca = 'Sin registrar')::text || ' sin vehiculo'
          from registros where origen_expediente <> 'satag'),
       (select count(*) > 0 from registros where origen_expediente <> 'satag')
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). Repone el filtro viejo quitando la condicion:
--   create or replace view v_registros_incompletos with (security_invoker = true) as
--   <la definicion de arriba, con el WHERE sin `and r.origen_expediente = 'satag'`>
--
-- PRECONDICION: ninguna. Es una vista, no guarda datos, y volver atras solo hace
-- que la bandeja vuelva a contar 1,647.
-- ---------------------------------------------------------------------