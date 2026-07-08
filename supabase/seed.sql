-- =====================================================================
-- SATAG - seed.sql (datos base E1)
-- Ejecutar DESPUES de schema.sql. Idempotente. No contiene datos personales.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Estacionamientos
-- ---------------------------------------------------------------------
insert into estacionamientos (clave, descripcion, activo) values
    ('E1', 'Estacionamiento 1', true),
    ('E2', 'Estacionamiento 2', true)
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- Colores base
-- ---------------------------------------------------------------------
insert into cat_colores (nombre) values
    ('Blanco'), ('Gris'), ('Negro'), ('Azul'), ('Rojo'), ('Plata'),
    ('Arena'), ('Verde'), ('Cafe'), ('Dorado'), ('Guinda'), ('Amarillo'),
    ('Naranja'), ('Beige'), ('Vino'), ('Azul marino')
on conflict ((lower(nombre))) do nothing;

-- ---------------------------------------------------------------------
-- Marcas base
-- ---------------------------------------------------------------------
insert into cat_marcas (nombre) values
    ('Volkswagen'), ('Toyota'), ('Honda'), ('Nissan'), ('Chevrolet'),
    ('KIA'), ('Mazda'), ('Ford'), ('Hyundai'), ('BMW'), ('Jeep'), ('Audi'),
    ('Mercedes Benz'), ('Suzuki'), ('Seat'), ('Volvo'), ('Renault'),
    ('Peugeot'), ('MINI'), ('Subaru'), ('Fiat'), ('Dodge'), ('GMC'),
    ('Chrysler')
on conflict ((lower(nombre))) do nothing;

-- ---------------------------------------------------------------------
-- Modelos base minimos. El flujo permite "Otro"; el catalogo crece con uso.
-- ---------------------------------------------------------------------
insert into cat_modelos (marca_id, nombre)
select m.id, v.nombre
from cat_marcas m
join (
    values
        ('Toyota', 'Sienna'),
        ('Toyota', 'Corolla'),
        ('Toyota', 'RAV4'),
        ('Honda', 'CR-V'),
        ('Honda', 'Civic'),
        ('Nissan', 'Sentra'),
        ('Nissan', 'X-Trail'),
        ('Volkswagen', 'Jetta'),
        ('Volkswagen', 'Tiguan'),
        ('Chevrolet', 'Aveo'),
        ('Mazda', 'Mazda 3'),
        ('KIA', 'Sportage'),
        ('Ford', 'Escape'),
        ('Hyundai', 'Tucson')
) as v(marca, nombre) on v.marca = m.nombre
on conflict (marca_id, (lower(nombre))) do nothing;

-- ---------------------------------------------------------------------
-- Reglamento placeholder. Reemplazar por las 22 clausulas reales.
-- ---------------------------------------------------------------------
insert into reglamento_versiones (version, contenido, vigente) values
    (1,
     '[PLACEHOLDER] Reglamento de acceso vehicular IAQ - 22 clausulas. ' ||
     'Reemplazar por el texto oficial antes de produccion.',
     true)
on conflict (version) do nothing;

-- ---------------------------------------------------------------------
-- Aviso de privacidad SATAG placeholder/version inicial.
-- ---------------------------------------------------------------------
insert into aviso_versiones (version, contenido, url_publica, vigente) values
    (1,
     '[PLACEHOLDER] Aviso de privacidad SATAG. Reemplazar por el texto aprobado ' ||
     'por Direccion/Legal antes de produccion. Correo: aviso.privacidad@asuncionqro.edu.mx.',
     '/aviso-de-privacidad',
     true)
on conflict (version) do nothing;

-- =====================================================================
-- Fin de seed.sql
-- =====================================================================
