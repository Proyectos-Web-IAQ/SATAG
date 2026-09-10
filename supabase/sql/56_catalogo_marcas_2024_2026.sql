-- =====================================================================
-- 56_catalogo_marcas_2024_2026.sql   (SC-028 · L1-05)
--
-- Amplia el catalogo con las marcas de la gama vendida en Mexico 2024-2026
-- que faltaban, y sus modelos principales.
--
-- SOLO DATOS. No crea ni recrea funciones, no cambia firmas, no necesita
-- despliegue del cliente ni `notify pgrst`. Se puede aplicar en cualquier
-- momento, incluso con capturas en curso.
--
-- IDEMPOTENTE: se puede correr dos veces sin efecto. Las marcas entran con
-- `on conflict ((lower(nombre))) do nothing` y los modelos con
-- `on conflict (marca_id, (lower(nombre))) do nothing`.
--
-- POR QUE EL JOIN VA CON lower() EN AMBOS LADOS
--
-- El bloque 21 une con `on v.marca = m.nombre`: comparacion exacta y sensible
-- a mayusculas. Pero la unicidad de marcas es `uq_cat_marcas_nombre_normalizado
-- on cat_marcas (lower(nombre))`. Si una marca ya existe escrita distinto
-- —"Mini" contra "MINI", "Land rover" contra "Land Rover"— el insert de marca
-- no la duplica (correcto) y despues el join NO empata, asi que entran CERO
-- modelos y el bloque termina en verde sin decir nada. Aqui se une por
-- lower(v.marca) = lower(m.nombre) para que eso no pueda pasar.
--
-- NOTA SOBRE GWM Y HAVAL: en Mexico el grupo vende bajo las dos marcas y la
-- gente nombra su coche como "Haval Jolion", no como "GWM Jolion". Van como
-- marcas separadas a proposito. Lo mismo con Omoda y Jaecoo.
--
-- El historico de la hoja de calculo (606 pares con revision humana) NO va
-- aqui: es del lote 2.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 0 — ANTES. Solo lee. Anote los numeros para comparar al final.
-- ---------------------------------------------------------------------
select (select count(*) from cat_marcas)  as marcas_antes,
       (select count(*) from cat_modelos) as modelos_antes;

-- Marcas que hoy no tienen ni un modelo (deberia ser cero).
select m.nombre
  from cat_marcas m
  left join cat_modelos mo on mo.marca_id = m.id
 group by m.nombre
having count(mo.id) = 0
 order by m.nombre;


-- ---------------------------------------------------------------------
-- PASO 1 — MARCAS.
-- ---------------------------------------------------------------------
insert into cat_marcas (nombre) values
    -- Electricas y chinas que hoy se ven en la fila del estacionamiento
    ('Tesla'), ('BYD'), ('MG'), ('Geely'), ('Chirey'), ('GWM'), ('Haval'),
    ('JAC'), ('Omoda'), ('Jaecoo'), ('Jetour'), ('Changan'), ('BAIC'),
    -- Premium y japonesas ausentes del catalogo base
    ('Lincoln'), ('Acura'), ('Lexus'), ('Land Rover'), ('Porsche'),
    ('Cadillac'), ('Mitsubishi'), ('Infiniti')
on conflict ((lower(nombre))) do nothing;


-- ---------------------------------------------------------------------
-- PASO 2 — MODELOS.
-- ---------------------------------------------------------------------
insert into cat_modelos (marca_id, nombre)
select m.id, v.nombre
from cat_marcas m
join (
    values
        -- Tesla
        ('Tesla','Model 3'), ('Tesla','Model Y'), ('Tesla','Model S'),
        ('Tesla','Model X'), ('Tesla','Cybertruck'),
        -- BYD
        ('BYD','Dolphin'), ('BYD','Dolphin Mini'), ('BYD','Seagull'),
        ('BYD','Seal'), ('BYD','Song Plus'), ('BYD','Yuan Plus'),
        ('BYD','Han'), ('BYD','Tang'), ('BYD','Shark'), ('BYD','King'),
        -- MG
        ('MG','MG3'), ('MG','MG5'), ('MG','ZS'), ('MG','HS'),
        ('MG','RX8'), ('MG','One'), ('MG','MG7'), ('MG','MG4'),
        ('MG','Cyberster'),
        -- Geely
        ('Geely','Coolray'), ('Geely','Azkarra'), ('Geely','Okavango'),
        ('Geely','Emgrand'), ('Geely','Starray'), ('Geely','Cityray'),
        ('Geely','Monjaro'), ('Geely','Preface'),
        -- Chirey
        ('Chirey','Tiggo 2 Pro'), ('Chirey','Tiggo 4 Pro'), ('Chirey','Tiggo 7 Pro'),
        ('Chirey','Tiggo 8 Pro'), ('Chirey','Tiggo 8 Pro Max'), ('Chirey','Tiggo 9'),
        ('Chirey','Arrizo 5'), ('Chirey','Arrizo 8'),
        -- GWM
        ('GWM','Poer'), ('GWM','Ora 03'), ('GWM','Tank 300'),
        ('GWM','Tank 500'), ('GWM','Wingle 7'),
        -- Haval
        ('Haval','H6'), ('Haval','H6 GT'), ('Haval','Jolion'),
        ('Haval','H9'), ('Haval','Dargo'),
        -- JAC
        ('JAC','SEI2'), ('JAC','SEI3'), ('JAC','SEI4'), ('JAC','SEI6'),
        ('JAC','SEI7'), ('JAC','T6'), ('JAC','T8'), ('JAC','T9'),
        ('JAC','E10X'), ('JAC','Frison'),
        -- Omoda
        ('Omoda','Omoda 5'), ('Omoda','C5'), ('Omoda','E5'), ('Omoda','Omoda 7'),
        -- Jaecoo
        ('Jaecoo','Jaecoo 5'), ('Jaecoo','Jaecoo 7'), ('Jaecoo','Jaecoo 8'),
        -- Jetour
        ('Jetour','Dashing'), ('Jetour','X70'), ('Jetour','X70 Plus'),
        ('Jetour','X90 Plus'), ('Jetour','T2'),
        -- Changan
        ('Changan','CS15'), ('Changan','CS35 Plus'), ('Changan','CS55 Plus'),
        ('Changan','CS75 Plus'), ('Changan','Eado'), ('Changan','Alsvin'),
        ('Changan','Hunter'), ('Changan','UNI-T'), ('Changan','UNI-K'),
        -- BAIC
        ('BAIC','X35'), ('BAIC','X55'), ('BAIC','X7'),
        ('BAIC','U5 Plus'), ('BAIC','BJ40'),
        -- Lincoln
        ('Lincoln','Corsair'), ('Lincoln','Nautilus'),
        ('Lincoln','Aviator'), ('Lincoln','Navigator'),
        -- Acura
        ('Acura','RDX'), ('Acura','MDX'), ('Acura','TLX'),
        ('Acura','ADX'), ('Acura','Integra'),
        -- Lexus
        ('Lexus','NX'), ('Lexus','RX'), ('Lexus','UX'), ('Lexus','ES'),
        ('Lexus','LX'), ('Lexus','GX'), ('Lexus','IS'), ('Lexus','TX'),
        -- Land Rover
        ('Land Rover','Range Rover'), ('Land Rover','Range Rover Sport'),
        ('Land Rover','Range Rover Evoque'), ('Land Rover','Range Rover Velar'),
        ('Land Rover','Discovery'), ('Land Rover','Discovery Sport'),
        ('Land Rover','Defender'),
        -- Porsche
        ('Porsche','Macan'), ('Porsche','Cayenne'), ('Porsche','911'),
        ('Porsche','Panamera'), ('Porsche','Taycan'), ('Porsche','Cayman'),
        ('Porsche','Boxster'),
        -- Cadillac
        ('Cadillac','Escalade'), ('Cadillac','XT4'), ('Cadillac','XT5'),
        ('Cadillac','XT6'), ('Cadillac','CT4'), ('Cadillac','CT5'),
        ('Cadillac','Optiq'), ('Cadillac','Lyriq'),
        -- Mitsubishi
        ('Mitsubishi','Mirage'), ('Mitsubishi','L200'), ('Mitsubishi','Outlander'),
        ('Mitsubishi','Eclipse Cross'), ('Mitsubishi','ASX'),
        ('Mitsubishi','Montero Sport'), ('Mitsubishi','Xpander'),
        -- Infiniti
        ('Infiniti','QX50'), ('Infiniti','QX55'), ('Infiniti','QX60'),
        ('Infiniti','QX80'), ('Infiniti','Q50')
) as v(marca, nombre)
  -- lower() en AMBOS lados: ver la nota de la cabecera.
  on lower(v.marca) = lower(m.nombre)
on conflict (marca_id, (lower(nombre))) do nothing;


-- ---------------------------------------------------------------------
-- PASO 3 — VERIFICACION.
-- ---------------------------------------------------------------------

-- (a) La comprobacion que pide la tarea: NINGUNA marca sin modelos.
--     Debe devolver CERO filas.
select m.nombre as marca_sin_modelos
  from cat_marcas m
  left join cat_modelos mo on mo.marca_id = m.id
 group by m.nombre
having count(mo.id) = 0
 order by m.nombre;

-- (b) Que las 21 marcas nuevas existan y con cuantos modelos quedaron.
--     Si alguna sale con 0, el join no empato: revise su capitalizacion.
with nuevas(nombre) as (
    values ('Tesla'),('BYD'),('MG'),('Geely'),('Chirey'),('GWM'),('Haval'),
           ('JAC'),('Omoda'),('Jaecoo'),('Jetour'),('Changan'),('BAIC'),
           ('Lincoln'),('Acura'),('Lexus'),('Land Rover'),('Porsche'),
           ('Cadillac'),('Mitsubishi'),('Infiniti')
)
select n.nombre,
       case when m.id is null then 'FALTA LA MARCA' else 'ok' end as marca,
       count(mo.id)                                               as modelos
  from nuevas n
  left join cat_marcas  m  on lower(m.nombre)  = lower(n.nombre)
  left join cat_modelos mo on mo.marca_id      = m.id
 group by n.nombre, m.id
 order by count(mo.id), n.nombre;

-- (c) Totales, para comparar con el PASO 0.
select (select count(*) from cat_marcas)  as marcas_despues,
       (select count(*) from cat_modelos) as modelos_despues;

-- (d) Cordura: ningun nombre con espacios sobrantes ni duplicado por
--     capitalizacion. Ambas deben devolver cero filas.
select nombre from cat_marcas where nombre <> btrim(nombre);
select lower(nombre) as normalizado, count(*)
  from cat_marcas group by lower(nombre) having count(*) > 1;
