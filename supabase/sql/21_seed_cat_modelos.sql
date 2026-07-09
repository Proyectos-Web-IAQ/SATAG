-- =====================================================================
-- 21_seed_cat_modelos.sql
-- Catalogo ampliado de modelos: cada una de las 24 marcas con modelos comunes.
-- Idempotente: on conflict (marca_id, lower(nombre)) do nothing.
-- "Otro" NO va aqui (es opcion de UI).
-- =====================================================================

insert into cat_modelos (marca_id, nombre)
select m.id, v.nombre
from cat_marcas m
join (
    values
        -- Volkswagen
        ('Volkswagen','Jetta'), ('Volkswagen','Tiguan'), ('Volkswagen','Vento'),
        ('Volkswagen','Virtus'), ('Volkswagen','Taos'), ('Volkswagen','Teramont'),
        ('Volkswagen','Polo'), ('Volkswagen','Golf'), ('Volkswagen','T-Cross'),
        ('Volkswagen','Nivus'), ('Volkswagen','Saveiro'),
        -- Toyota
        ('Toyota','Corolla'), ('Toyota','RAV4'), ('Toyota','Sienna'),
        ('Toyota','Hilux'), ('Toyota','Yaris'), ('Toyota','Camry'),
        ('Toyota','Highlander'), ('Toyota','Tacoma'), ('Toyota','Avanza'),
        ('Toyota','C-HR'), ('Toyota','Corolla Cross'), ('Toyota','Prius'),
        -- Honda
        ('Honda','Civic'), ('Honda','CR-V'), ('Honda','HR-V'),
        ('Honda','Accord'), ('Honda','City'), ('Honda','BR-V'),
        ('Honda','Pilot'), ('Honda','Fit'),
        -- Nissan
        ('Nissan','Sentra'), ('Nissan','X-Trail'), ('Nissan','Versa'),
        ('Nissan','Kicks'), ('Nissan','March'), ('Nissan','Frontier'),
        ('Nissan','Altima'), ('Nissan','Murano'), ('Nissan','NP300'),
        ('Nissan','Pathfinder'), ('Nissan','Note'),
        -- Chevrolet
        ('Chevrolet','Aveo'), ('Chevrolet','Onix'), ('Chevrolet','Spark'),
        ('Chevrolet','Cavalier'), ('Chevrolet','Trax'), ('Chevrolet','Tracker'),
        ('Chevrolet','Equinox'), ('Chevrolet','Silverado'), ('Chevrolet','Tahoe'),
        ('Chevrolet','Suburban'), ('Chevrolet','Groove'), ('Chevrolet','Beat'),
        -- KIA
        ('KIA','Sportage'), ('KIA','Rio'), ('KIA','Forte'),
        ('KIA','Seltos'), ('KIA','Sorento'), ('KIA','Soul'),
        ('KIA','Sonet'), ('KIA','Niro'), ('KIA','K3'), ('KIA','Stinger'),
        -- Mazda
        ('Mazda','Mazda 3'), ('Mazda','Mazda 2'), ('Mazda','CX-5'),
        ('Mazda','CX-30'), ('Mazda','CX-3'), ('Mazda','CX-9'),
        ('Mazda','CX-50'), ('Mazda','MX-5'),
        -- Ford
        ('Ford','Escape'), ('Ford','Figo'), ('Ford','Ranger'),
        ('Ford','Explorer'), ('Ford','EcoSport'), ('Ford','F-150'),
        ('Ford','Bronco'), ('Ford','Mustang'), ('Ford','Edge'),
        ('Ford','Territory'), ('Ford','Maverick'), ('Ford','Expedition'),
        -- Hyundai
        ('Hyundai','Tucson'), ('Hyundai','Elantra'), ('Hyundai','Creta'),
        ('Hyundai','Accent'), ('Hyundai','Grand i10'), ('Hyundai','Santa Fe'),
        ('Hyundai','Kona'), ('Hyundai','Venue'), ('Hyundai','Palisade'),
        -- BMW
        ('BMW','Serie 1'), ('BMW','Serie 2'), ('BMW','Serie 3'),
        ('BMW','Serie 5'), ('BMW','X1'), ('BMW','X3'),
        ('BMW','X5'), ('BMW','X6'), ('BMW','X7'), ('BMW','Z4'),
        -- Jeep
        ('Jeep','Wrangler'), ('Jeep','Grand Cherokee'), ('Jeep','Compass'),
        ('Jeep','Renegade'), ('Jeep','Cherokee'), ('Jeep','Gladiator'),
        -- Audi
        ('Audi','A1'), ('Audi','A3'), ('Audi','A4'), ('Audi','A5'),
        ('Audi','A6'), ('Audi','Q2'), ('Audi','Q3'), ('Audi','Q5'),
        ('Audi','Q7'), ('Audi','Q8'),
        -- Mercedes Benz
        ('Mercedes Benz','Clase A'), ('Mercedes Benz','Clase C'),
        ('Mercedes Benz','Clase E'), ('Mercedes Benz','GLA'),
        ('Mercedes Benz','GLB'), ('Mercedes Benz','GLC'),
        ('Mercedes Benz','GLE'), ('Mercedes Benz','CLA'), ('Mercedes Benz','Clase G'),
        -- Suzuki
        ('Suzuki','Swift'), ('Suzuki','Vitara'), ('Suzuki','Ignis'),
        ('Suzuki','Ertiga'), ('Suzuki','S-Cross'), ('Suzuki','Jimny'),
        ('Suzuki','Ciaz'), ('Suzuki','Baleno'), ('Suzuki','Grand Vitara'),
        -- Seat
        ('Seat','Ibiza'), ('Seat','Leon'), ('Seat','Ateca'),
        ('Seat','Arona'), ('Seat','Tarraco'), ('Seat','Toledo'),
        -- Volvo
        ('Volvo','XC40'), ('Volvo','XC60'), ('Volvo','XC90'),
        ('Volvo','S60'), ('Volvo','S90'), ('Volvo','C40'),
        -- Renault
        ('Renault','Kwid'), ('Renault','Duster'), ('Renault','Logan'),
        ('Renault','Sandero'), ('Renault','Stepway'), ('Renault','Koleos'),
        ('Renault','Captur'), ('Renault','Oroch'),
        -- Peugeot
        ('Peugeot','208'), ('Peugeot','2008'), ('Peugeot','301'),
        ('Peugeot','3008'), ('Peugeot','5008'), ('Peugeot','308'),
        ('Peugeot','Partner'), ('Peugeot','Landtrek'),
        -- MINI
        ('MINI','Cooper'), ('MINI','Countryman'), ('MINI','Clubman'),
        ('MINI','Cooper S'), ('MINI','Cabrio'),
        -- Subaru
        ('Subaru','Forester'), ('Subaru','Outback'), ('Subaru','XV'),
        ('Subaru','Impreza'), ('Subaru','Legacy'), ('Subaru','Crosstrek'),
        ('Subaru','WRX'),
        -- Fiat
        ('Fiat','Mobi'), ('Fiat','Argo'), ('Fiat','Cronos'),
        ('Fiat','Pulse'), ('Fiat','Uno'), ('Fiat','500'), ('Fiat','Toro'),
        -- Dodge
        ('Dodge','Attitude'), ('Dodge','Journey'), ('Dodge','Durango'),
        ('Dodge','Charger'), ('Dodge','Challenger'), ('Dodge','RAM 1500'),
        ('Dodge','RAM 700'),
        -- GMC
        ('GMC','Sierra'), ('GMC','Yukon'), ('GMC','Terrain'),
        ('GMC','Acadia'), ('GMC','Savana'),
        -- Chrysler
        ('Chrysler','300'), ('Chrysler','Pacifica'),
        ('Chrysler','Town & Country'), ('Chrysler','Voyager')
) as v(marca, nombre) on v.marca = m.nombre
on conflict (marca_id, (lower(nombre))) do nothing;

-- Verificacion: todas las marcas deben tener al menos 1 modelo.
-- select m.nombre, count(mo.id) as modelos
-- from cat_marcas m left join cat_modelos mo on mo.marca_id = m.id
-- group by m.nombre order by modelos, m.nombre;
