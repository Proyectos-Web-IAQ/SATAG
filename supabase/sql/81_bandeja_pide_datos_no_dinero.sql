-- =====================================================================
-- BLOQUE 81 — Los migrados vuelven a la bandeja, pero solo por lo que
--             alguien puede resolver.
--
-- SC-031. Corrige el bloque 80, que fue demasiado grueso.
--
-- POR QUE
--   El 80 saco de la bandeja a los expedientes migrados ENTEROS, para que el
--   contador de TI no pasara de decenas a 1,647. Resolvio el sintoma y creo otro:
--   97 expedientes sin placa, 89 sin vehiculo y 98 sin derecho de pluma dejaron de
--   verse en ninguna parte. Eso es trabajo real —alguien tiene que capturar esa
--   placa— y una bandeja que lo esconde es tan inutil como una que lo ahoga.
--
--   Lo que no se puede resolver no es el expediente: son TRES MOTIVOS. Un
--   expediente migrado no tiene pago y nunca lo va a tener, porque no paso por
--   caja: no se le invento un pago de cero a proposito. Los 519 saldrian como
--   «sin pago» todos los dias y para siempre, y eso es lo que hay que callar.
--
-- EL CRITERIO, dicho de una vez: a un expediente migrado se le piden los datos
--   que le faltan y no se le pide dinero.
--
-- QUE CAMBIA, EXACTAMENTE
--   La definicion se EXTRAJO de la vista viva con pg_get_viewdef y se le aplicaron
--   6 deltas verificados con diff. No se transcribio nada.
--
--   1. los migrados vuelven a la bandeja; lo que se filtra ahora es el MOTIVO, no la persona
--      -  WHERE r.estado <> 'baja'::text AND r.origen_expediente = 'satag'
--      +  WHERE r.estado <> 'baja'::text
--
--   2. el origen baja a la CTE para poder decidir motivo por motivo
--      -  r.procedencia_tag, r.estado, r.created_at,
--      +  r.procedencia_tag, r.estado, r.origen_expediente, r.created_at,
--
--   3. y se arrastra al siguiente nivel
--      -  b.procedencia_tag, b.estado, b.created_at,
--      +  b.procedencia_tag, b.estado, b.origen_expediente, b.created_at,
--
--   4. un migrado tiene TAG y no tiene pago por definicion: no es un pendiente, es su naturaleza
--      -  WHEN b.no_dispositivo IS NOT NULL AND b.pago_created_at IS NULL THEN 'tag_sin_pago'::text
--      +  WHEN b.origen_expediente = 'satag' AND b.no_dispositivo IS NOT NULL AND b.pago_created_at IS
--
--   5. los 519 migrados saldrian aqui todos los dias, para siempre
--      -  WHEN b.pago_created_at IS NULL AND b.dias_desde_alta >= 7 THEN 'sin_pago'::text
--      +  WHEN b.origen_expediente = 'satag' AND b.pago_created_at IS NULL AND b.dias_desde_alta >= 7 
--
--   6. sin pago no hay dias desde el pago: el motivo no puede dispararse, y dejarlo explicito evita que alguien lo reviva
--      -  WHEN b.pago_created_at IS NOT NULL AND b.no_dispositivo IS NULL AND b.dias_desde_pago >= 7 T
--      +  WHEN b.origen_expediente = 'satag' AND b.pago_created_at IS NOT NULL AND b.no_dispositivo IS
--
--   Sigue siendo security_invoker: hereda la RLS del panel y no abre una segunda
--   puerta. El bloque 71 vigila ese invariante.
--
-- QUE NO CAMBIA
--   Ningun motivo nuevo, ninguna columna nueva, ninguna fila tocada. Una vista no
--   guarda datos: volver atras es correr el 80 otra vez.
--
-- Depende de: 45 (la vista), 79 (origen_expediente), 80 (lo que corrige).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. GUARDIA. Va primero: si aborta, no se aplico nada.
-- ---------------------------------------------------------------------
do $guardia$
declare
    v_def text;
    v_n   int;
begin
    select pg_get_viewdef('v_registros_incompletos'::regclass, true) into v_def;
    if v_def is null then
        raise exception 'No existe v_registros_incompletos: aplique antes el bloque 45. No se aplico nada.';
    end if;

    -- Tiene que venir del bloque 80: si la vista no filtra por origen, este bloque
    -- estaria resolviendo un problema que nadie creo.
    if v_def not like '%origen_expediente%' then
        raise exception 'v_registros_incompletos no filtra por origen_expediente: aplique antes el bloque 80. No se aplico nada.';
    end if;

    -- Y no puede estar ya corregida.
    if v_def like '%origen_expediente = ''satag'' AND b.no_dispositivo%' then
        raise exception 'La vista ya pide los datos a los migrados sin pedirles dinero: este bloque ya se aplico. No se aplico nada.';
    end if;

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
-- 1. LA VISTA, con los 6 deltas.
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
            r.origen_expediente,
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
          WHERE r.estado <> 'baja'::text::text
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
            b.origen_expediente,
            b.created_at,
            b.folio_recibo,
            b.pago_created_at,
            b.dias_desde_alta,
            b.dias_desde_pago,
            b.tiene_estacionamiento,
            array_remove(ARRAY[
                CASE
                    WHEN b.origen_expediente = 'satag' AND b.no_dispositivo IS NOT NULL AND b.pago_created_at IS NULL THEN 'tag_sin_pago'::text
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
                    WHEN b.origen_expediente = 'satag' AND b.pago_created_at IS NULL AND b.dias_desde_alta >= 7 THEN 'sin_pago'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN b.origen_expediente = 'satag' AND b.pago_created_at IS NOT NULL AND b.no_dispositivo IS NULL AND b.dias_desde_pago >= 7 THEN 'sin_instalar'::text
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
    'Expedientes a los que les falta algo para operar. A un expediente migrado se le piden los datos que le faltan —placa, vehiculo, derecho de pluma— y NO se le pide dinero: no paso por caja y nunca va a pagar (bloque 81).';


-- ---------------------------------------------------------------------
-- 2. VERIFICACION (solo lectura). ok en true en las cinco filas.
-- ---------------------------------------------------------------------
select 1 as orden, 'los migrados vuelven a la bandeja' as que,
       (select count(*)::text from v_registros_incompletos v join registros r on r.id = v.id
         where r.origen_expediente <> 'satag') as valor,
       (select count(*) > 0 from v_registros_incompletos v join registros r on r.id = v.id
         where r.origen_expediente <> 'satag') as ok
union all
select 2, 'a ningun migrado se le reclama dinero', null,
       (select count(*) = 0 from v_registros_incompletos v join registros r on r.id = v.id
         where r.origen_expediente <> 'satag'
           and v.motivos && array['sin_pago','tag_sin_pago','sin_instalar'])
union all
select 3, 'los migrados sin placa si aparecen',
       (select count(*)::text from v_registros_incompletos v join registros r on r.id = v.id
         where r.origen_expediente <> 'satag' and 'sin_placas' = any(v.motivos)),
       (select count(*) > 0 from v_registros_incompletos v join registros r on r.id = v.id
         where r.origen_expediente <> 'satag' and 'sin_placas' = any(v.motivos))
union all
select 4, 'las altas de SATAG siguen evaluandose igual que siempre',
       (select count(*)::text from v_registros_incompletos v join registros r on r.id = v.id
         where r.origen_expediente = 'satag'),
       true
union all
select 5, 'sigue siendo security_invoker', null,
       (select count(*) = 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = 'v_registros_incompletos'
           and c.reloptions::text like '%security_invoker=%true%')
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado): volver a correr el bloque 80 completo. Su guardia
-- abortara porque la vista ya filtra por origen_expediente, asi que hay que
-- saltarse esa comprobacion a sabiendas. Una vista no guarda datos: lo unico
-- que se pierde al volver atras son los 97 sin placa y 89 sin vehiculo
-- dejando de verse.
-- ---------------------------------------------------------------------