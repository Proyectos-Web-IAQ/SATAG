-- =====================================================================
-- catalogos_base.sql  (solo para armar un proyecto NUEVO de Supabase)
--
-- Semillas de los tres catalogos que NINGUN bloque numerado de sql/ llena:
-- estacionamientos (E1, E2), cat_colores y cat_marcas. En la base de
-- produccion esas filas entraron en julio con el seed.sql monolitico, que el
-- runbook ya no permite usar para instalar. Sin ellas, el bloque 21 inserta
-- cero modelos (hace join contra cat_marcas) y seed_tests_dev.sql falla en el
-- paso 3 por la FK de registro_estacionamientos a estacionamientos.clave.
--
-- Contenido: copia textual de las tres primeras secciones de ../seed.sql.
-- Las 24 marcas son exactamente las que el bloque 21 espera.
-- Idempotente: on conflict do nothing sobre los indices unicos de 01/02/04.
-- armar-tandas.ps1 lo intercala en la tanda 1 justo despues del bloque 04.
-- No lleva datos personales.
-- =====================================================================

insert into estacionamientos (clave, descripcion, activo) values
    ('E1', 'Estacionamiento 1', true),
    ('E2', 'Estacionamiento 2', true)
on conflict (clave) do nothing;

insert into cat_colores (nombre) values
    ('Blanco'), ('Gris'), ('Negro'), ('Azul'), ('Rojo'), ('Plata'),
    ('Arena'), ('Verde'), ('Cafe'), ('Dorado'), ('Guinda'), ('Amarillo'),
    ('Naranja'), ('Beige'), ('Vino'), ('Azul marino')
on conflict ((lower(nombre))) do nothing;

insert into cat_marcas (nombre) values
    ('Volkswagen'), ('Toyota'), ('Honda'), ('Nissan'), ('Chevrolet'),
    ('KIA'), ('Mazda'), ('Ford'), ('Hyundai'), ('BMW'), ('Jeep'), ('Audi'),
    ('Mercedes Benz'), ('Suzuki'), ('Seat'), ('Volvo'), ('Renault'),
    ('Peugeot'), ('MINI'), ('Subaru'), ('Fiat'), ('Dodge'), ('GMC'),
    ('Chrysler')
on conflict ((lower(nombre))) do nothing;
