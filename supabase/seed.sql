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
-- Modelos por marca (comunes en Mexico). Cada una de las 24 marcas con modelos.
-- El flujo permite "Otro"; el catalogo puede crecer con uso.
-- Espejo de sql/21_seed_cat_modelos.sql.
-- ---------------------------------------------------------------------
insert into cat_modelos (marca_id, nombre)
select m.id, v.nombre
from cat_marcas m
join (
    values
        ('Volkswagen','Jetta'), ('Volkswagen','Tiguan'), ('Volkswagen','Vento'),
        ('Volkswagen','Virtus'), ('Volkswagen','Taos'), ('Volkswagen','Teramont'),
        ('Volkswagen','Polo'), ('Volkswagen','Golf'), ('Volkswagen','T-Cross'),
        ('Volkswagen','Nivus'), ('Volkswagen','Saveiro'),
        ('Toyota','Corolla'), ('Toyota','RAV4'), ('Toyota','Sienna'),
        ('Toyota','Hilux'), ('Toyota','Yaris'), ('Toyota','Camry'),
        ('Toyota','Highlander'), ('Toyota','Tacoma'), ('Toyota','Avanza'),
        ('Toyota','C-HR'), ('Toyota','Corolla Cross'), ('Toyota','Prius'),
        ('Honda','Civic'), ('Honda','CR-V'), ('Honda','HR-V'),
        ('Honda','Accord'), ('Honda','City'), ('Honda','BR-V'),
        ('Honda','Pilot'), ('Honda','Fit'),
        ('Nissan','Sentra'), ('Nissan','X-Trail'), ('Nissan','Versa'),
        ('Nissan','Kicks'), ('Nissan','March'), ('Nissan','Frontier'),
        ('Nissan','Altima'), ('Nissan','Murano'), ('Nissan','NP300'),
        ('Nissan','Pathfinder'), ('Nissan','Note'),
        ('Chevrolet','Aveo'), ('Chevrolet','Onix'), ('Chevrolet','Spark'),
        ('Chevrolet','Cavalier'), ('Chevrolet','Trax'), ('Chevrolet','Tracker'),
        ('Chevrolet','Equinox'), ('Chevrolet','Silverado'), ('Chevrolet','Tahoe'),
        ('Chevrolet','Suburban'), ('Chevrolet','Groove'), ('Chevrolet','Beat'),
        ('KIA','Sportage'), ('KIA','Rio'), ('KIA','Forte'),
        ('KIA','Seltos'), ('KIA','Sorento'), ('KIA','Soul'),
        ('KIA','Sonet'), ('KIA','Niro'), ('KIA','K3'), ('KIA','Stinger'),
        ('Mazda','Mazda 3'), ('Mazda','Mazda 2'), ('Mazda','CX-5'),
        ('Mazda','CX-30'), ('Mazda','CX-3'), ('Mazda','CX-9'),
        ('Mazda','CX-50'), ('Mazda','MX-5'),
        ('Ford','Escape'), ('Ford','Figo'), ('Ford','Ranger'),
        ('Ford','Explorer'), ('Ford','EcoSport'), ('Ford','F-150'),
        ('Ford','Bronco'), ('Ford','Mustang'), ('Ford','Edge'),
        ('Ford','Territory'), ('Ford','Maverick'), ('Ford','Expedition'),
        ('Hyundai','Tucson'), ('Hyundai','Elantra'), ('Hyundai','Creta'),
        ('Hyundai','Accent'), ('Hyundai','Grand i10'), ('Hyundai','Santa Fe'),
        ('Hyundai','Kona'), ('Hyundai','Venue'), ('Hyundai','Palisade'),
        ('BMW','Serie 1'), ('BMW','Serie 2'), ('BMW','Serie 3'),
        ('BMW','Serie 5'), ('BMW','X1'), ('BMW','X3'),
        ('BMW','X5'), ('BMW','X6'), ('BMW','X7'), ('BMW','Z4'),
        ('Jeep','Wrangler'), ('Jeep','Grand Cherokee'), ('Jeep','Compass'),
        ('Jeep','Renegade'), ('Jeep','Cherokee'), ('Jeep','Gladiator'),
        ('Audi','A1'), ('Audi','A3'), ('Audi','A4'), ('Audi','A5'),
        ('Audi','A6'), ('Audi','Q2'), ('Audi','Q3'), ('Audi','Q5'),
        ('Audi','Q7'), ('Audi','Q8'),
        ('Mercedes Benz','Clase A'), ('Mercedes Benz','Clase C'),
        ('Mercedes Benz','Clase E'), ('Mercedes Benz','GLA'),
        ('Mercedes Benz','GLB'), ('Mercedes Benz','GLC'),
        ('Mercedes Benz','GLE'), ('Mercedes Benz','CLA'), ('Mercedes Benz','Clase G'),
        ('Suzuki','Swift'), ('Suzuki','Vitara'), ('Suzuki','Ignis'),
        ('Suzuki','Ertiga'), ('Suzuki','S-Cross'), ('Suzuki','Jimny'),
        ('Suzuki','Ciaz'), ('Suzuki','Baleno'), ('Suzuki','Grand Vitara'),
        ('Seat','Ibiza'), ('Seat','Leon'), ('Seat','Ateca'),
        ('Seat','Arona'), ('Seat','Tarraco'), ('Seat','Toledo'),
        ('Volvo','XC40'), ('Volvo','XC60'), ('Volvo','XC90'),
        ('Volvo','S60'), ('Volvo','S90'), ('Volvo','C40'),
        ('Renault','Kwid'), ('Renault','Duster'), ('Renault','Logan'),
        ('Renault','Sandero'), ('Renault','Stepway'), ('Renault','Koleos'),
        ('Renault','Captur'), ('Renault','Oroch'),
        ('Peugeot','208'), ('Peugeot','2008'), ('Peugeot','301'),
        ('Peugeot','3008'), ('Peugeot','5008'), ('Peugeot','308'),
        ('Peugeot','Partner'), ('Peugeot','Landtrek'),
        ('MINI','Cooper'), ('MINI','Countryman'), ('MINI','Clubman'),
        ('MINI','Cooper S'), ('MINI','Cabrio'),
        ('Subaru','Forester'), ('Subaru','Outback'), ('Subaru','XV'),
        ('Subaru','Impreza'), ('Subaru','Legacy'), ('Subaru','Crosstrek'),
        ('Subaru','WRX'),
        ('Fiat','Mobi'), ('Fiat','Argo'), ('Fiat','Cronos'),
        ('Fiat','Pulse'), ('Fiat','Uno'), ('Fiat','500'), ('Fiat','Toro'),
        ('Dodge','Attitude'), ('Dodge','Journey'), ('Dodge','Durango'),
        ('Dodge','Charger'), ('Dodge','Challenger'), ('Dodge','RAM 1500'),
        ('Dodge','RAM 700'),
        ('GMC','Sierra'), ('GMC','Yukon'), ('GMC','Terrain'),
        ('GMC','Acadia'), ('GMC','Savana'),
        ('Chrysler','300'), ('Chrysler','Pacifica'),
        ('Chrysler','Town & Country'), ('Chrysler','Voyager')
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
-- contenido_simplificado es OBLIGATORIO en una version vigente: lo exige el
-- CHECK aviso_vigente_exige_simplificado, agregado despues de que se escribio
-- esta semilla. Sin el, la semilla aborta. Se detecto el 29-sep-2026 al montar
-- el entorno local, que es la primera vez que la semilla se corre contra el
-- esquema de hoy; en produccion nunca se reejecuta y por eso nadie lo vio.
insert into aviso_versiones (version, contenido, contenido_simplificado, url_publica, vigente) values
    (1,
     '[PLACEHOLDER] Aviso de privacidad SATAG. Reemplazar por el texto aprobado ' ||
     'por Direccion/Legal antes de produccion. Correo: aviso.privacidad@asuncionqro.edu.mx.',
     '[PLACEHOLDER] Aviso simplificado: quien trata los datos, para que, y donde ' ||
     'consultar el integro. Reemplazar por el texto aprobado.',
     '/aviso-de-privacidad',
     true)
on conflict (version) do nothing;

-- =====================================================================
-- Fin de seed.sql
-- =====================================================================
