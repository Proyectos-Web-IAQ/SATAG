# Auditoria SQL atomica

## Bloque 1: Catalogos sin PII

Este primer bloque es deliberadamente simple. Sirve para probar la forma de trabajo antes de entrar a `registros`, `aceptaciones`, `pagos`, `movimientos` y `solicitudes`.

### 00_extensions

| Punto | Revision |
|---|---|
| Proposito | Habilita `pgcrypto`. |
| PII | No guarda datos. |
| Riesgo | Bajo. Requerida por UUID y hash de firma. |
| Decision | Mantener. |

### estacionamientos

| Punto | Revision |
|---|---|
| Proposito | Catalogo de accesos/zonas de estacionamiento que Admin asigna a cada registro. |
| PII | No. |
| Clave principal | `id uuid`. |
| Clave de negocio | `clave text unique`, formato `E` + numero: `E1`, `E2`, futuro `E3`. |
| Soft delete | `activo boolean`; no conviene borrar si ya existen asignaciones historicas. |
| Constraint de formato | `clave ~ '^E[0-9]+$'`. |
| RLS esperado | Lectura publica de activos; mantenimiento solo authenticated/admin. |
| Decision cerrada | Las claves siempre seran `E1`, `E2`, `E3`... |
| Decision abierta | Confirmar si la descripcion debe incluir nombre visible para usuarios o solo para Admin. |

### cat_marcas

| Punto | Revision |
|---|---|
| Proposito | Normalizar marca del vehiculo. |
| PII | No. |
| Clave principal | `id uuid`. |
| Clave de negocio | `nombre text`, unico por indice `lower(nombre)`. |
| Normalizacion | No permite espacios al inicio/final; conserva mayusculas/minusculas de presentacion. |
| RLS esperado | Lectura publica; mantenimiento solo authenticated/admin. |
| Decision cerrada | `"Otro"` vive como opcion de UI, no como fila del catalogo. |

### cat_modelos

| Punto | Revision |
|---|---|
| Proposito | Modelos dependientes de una marca. |
| PII | No. |
| Relacion | `marca_id -> cat_marcas(id)`. |
| Unicidad | `(marca_id, lower(nombre))` evita duplicados por marca sin importar mayusculas/minusculas. |
| Normalizacion | No permite espacios al inicio/final; conserva mayusculas/minusculas de presentacion. |
| RLS esperado | Lectura publica; mantenimiento solo authenticated/admin. |
| Decision cerrada | No usar `on delete cascade`; no se permite borrar marca si tiene modelos asociados. |
| Decision cerrada | `"Otro"` vive como opcion de UI, no como fila del catalogo. |

### cat_colores

| Punto | Revision |
|---|---|
| Proposito | Normalizar color del vehiculo. |
| PII | No. |
| Clave principal | `id uuid`. |
| Clave de negocio | `nombre text`, unico por indice `lower(nombre)`. |
| Normalizacion | No permite espacios al inicio/final; conserva mayusculas/minusculas de presentacion. |
| RLS esperado | Lectura publica; mantenimiento solo authenticated/admin. |
| Decision cerrada | `"Otro"` vive como opcion de UI, no como fila del catalogo. |
| Decision abierta | Confirmar si colores compuestos se capturan como texto libre al elegir "Otro". |

## Pruebas SQL minimas

```sql
select gen_random_uuid();

insert into estacionamientos (clave, descripcion)
values ('E1', 'Estacionamiento 1')
on conflict (clave) do nothing;

insert into cat_marcas (nombre)
values ('Toyota'), ('Honda')
on conflict ((lower(nombre))) do nothing;

insert into cat_modelos (marca_id, nombre)
select id, 'Sienna'
from cat_marcas
where nombre = 'Toyota'
on conflict (marca_id, (lower(nombre))) do nothing;

insert into cat_colores (nombre)
values ('Blanco'), ('Negro')
on conflict ((lower(nombre))) do nothing;

select e.clave from estacionamientos e order by e.clave;
select m.nombre, mo.nombre as modelo
from cat_modelos mo
join cat_marcas m on m.id = mo.marca_id
order by m.nombre, mo.nombre;
select nombre from cat_colores order by nombre;
```

## Pruebas RLS minimas

```sql
-- Como anon: debe poder leer catalogos.
set role anon;
select clave from estacionamientos order by clave;
select nombre from cat_marcas order by nombre;
select nombre from cat_colores order by nombre;
reset role;

-- Como anon: debe fallar al intentar escribir catalogos.
set role anon;
insert into cat_colores (nombre) values ('Azul prueba anon');
reset role;

-- Como authenticated: por ahora puede mantener catalogos.
-- Antes de produccion se debe sustituir por roles finos.
set role authenticated;
insert into cat_colores (nombre)
values ('Azul prueba auth')
on conflict (nombre) do nothing;
reset role;
```

## Observacion de seguridad

El corte actual replica el diseno vigente: `authenticated` puede mantener catalogos. Es aceptable para prototipo o sandbox, pero antes de produccion debe cerrarse con roles finos, por ejemplo `admin`, `ti` o una tabla `perfiles`.

## Bloque 2: Documentos versionados sin PII

### reglamento_versiones

| Punto | Revision |
|---|---|
| Proposito | Guardar versiones del reglamento de acceso vehicular. |
| PII | No. |
| Clave principal | `id uuid`. |
| Version | `version int unique`, positiva. |
| Vigencia | Solo una fila puede tener `vigente = true`. |
| RLS esperado | `anon` y `authenticated` leen solo vigente; mantenimiento autenticado por ahora. |
| Decision abierta | Reemplazar placeholder por las 22 clausulas oficiales aprobadas. |

### aviso_versiones

| Punto | Revision |
|---|---|
| Proposito | Guardar versiones del aviso de privacidad SATAG. |
| PII | No guarda titulares; el texto puede contener datos institucionales. |
| Clave principal | `id uuid`. |
| Version | `version int unique`, positiva. |
| Vigencia | Solo una fila puede tener `vigente = true`. |
| RLS esperado | `anon` y `authenticated` leen solo vigente; mantenimiento autenticado por ahora. |
| Decision abierta | Reemplazar placeholder por aviso aprobado, URL definitiva y aprobacion Direccion/Legal. |

## Pruebas SQL minimas documentos

```sql
select version, vigente from reglamento_versiones;
select version, vigente, url_publica from aviso_versiones;

set role anon;
select version, contenido from reglamento_versiones;
select version, contenido, url_publica from aviso_versiones;
reset role;

-- Debe fallar porque solo puede existir una version vigente.
insert into reglamento_versiones (version, contenido, vigente)
values (2, 'Reglamento prueba vigente duplicado', true);
```

## Bloque 3: Expediente central con PII

### registros

| Punto | Revision |
|---|---|
| Proposito | Expediente central: usuario, gestionante, vehiculo, TAG, ciclo de vida y privacidad. |
| PII | SI. Nombres del titular y gestionante, placas y observaciones. |
| Clave principal | `id uuid`. |
| Nombres separados | `usuario_nombres`, `usuario_apellido_paterno` (NOT NULL) y `usuario_apellido_materno` (opcional). Igual para gestionante. |
| Nombre completo | `usuario_nombre_completo` y `gestionante_nombre_completo` son `GENERATED ALWAYS ... STORED`: no se insertan ni editan; se derivan de las partes. |
| Gestionante | `gestionante_nombres IS NULL` = mismo que el usuario. Si viene, exige nombres + apellido paterno (`reg_gestionante_completo`). |
| Menor | `usuario_es_menor = true` exige gestionante con nombres + apellido paterno + relacion padre/madre/tutor. |
| Vehiculo/TAG | `modelo` obligatorio; `no_dispositivo`/`tag_apartado_no` con formato 6-11 digitos; placas requeridas salvo `sin_placas`. |
| Unicidad TAG | `uq_registros_no_dispositivo_activo`: un `no_dispositivo` solo puede repetirse cuando el registro esta en `baja`. |
| Indices | `estado`, `no_dispositivo`, `upper(placas)`, `lower(usuario_nombre_completo)`, `suprimir_despues_de`. |
| Folio | `folio text not null unique`, formato `SATAG-######`. Sin DEFAULT: lo asigna `crear_registro` via `nextval('registros_folio_seq')`. Un insert directo debe proporcionar folio. |
| RLS esperado | anon SIN acceso directo (alta solo via RPC `crear_registro` SECURITY DEFINER); authenticated administra por ahora. |
| Decision cerrada | Nombres personales separados; `apellido_materno` opcional (titular con un solo apellido). |
| Decision cerrada | Columnas de nombre completo generadas en BD, no mantenidas por trigger ni RPC. |
| Sync | El split de nombres obligo a actualizar el RPC `crear_registro` (params, validacion, hash_payload) en `../schema.sql`. |

## Pruebas SQL minimas registros

> Nota: en pruebas directas hay que pasar `folio` (NOT NULL sin default).
> En el flujo real lo asigna `crear_registro`.

```sql
-- Alta directa como personal interno (adulto con dos apellidos).
insert into registros (
    folio, usuario_nombres, usuario_apellido_paterno, usuario_apellido_materno,
    tipo_usuario, marca, modelo, color, placas, sin_placas
) values (
    'SATAG-900001', 'Juan Carlos', 'Perez', 'Lopez',
    'padres', 'Toyota', 'Sienna', 'Blanco', 'ABC1234', false
);

-- La columna generada arma el nombre completo.
select folio, usuario_nombres, usuario_apellido_paterno, usuario_apellido_materno,
       usuario_nombre_completo
from registros
order by created_at desc
limit 1;
-- Esperado: 'Juan Carlos Perez Lopez'.

-- Titular con un solo apellido: materno NULL, nombre completo sin espacio doble.
insert into registros (
    folio, usuario_nombres, usuario_apellido_paterno,
    tipo_usuario, marca, modelo, color, sin_placas
) values (
    'SATAG-900002', 'Ana', 'Gomez',
    'maestro', 'Honda', 'Civic', 'Gris', true
);
-- Esperado usuario_nombre_completo: 'Ana Gomez'.

-- Debe FALLAR: menor sin gestionante padre/madre/tutor.
insert into registros (
    folio, usuario_nombres, usuario_apellido_paterno,
    tipo_usuario, usuario_es_menor, marca, modelo, color, sin_placas
) values (
    'SATAG-900003', 'Nino', 'Test',
    'alumno', true, 'Nissan', 'Sentra', 'Rojo', true
);

-- Debe PASAR: menor con gestionante completo.
insert into registros (
    folio, usuario_nombres, usuario_apellido_paterno,
    gestionante_nombres, gestionante_apellido_paterno, gestionante_apellido_materno,
    gestionante_relacion, usuario_es_menor,
    tipo_usuario, marca, modelo, color, sin_placas
) values (
    'SATAG-900004', 'Nino', 'Test',
    'Maria', 'Test', 'Ruiz',
    'madre', true,
    'alumno', 'Nissan', 'Sentra', 'Rojo', true
);
select usuario_nombre_completo, gestionante_nombre_completo
from registros
where usuario_es_menor
order by created_at desc
limit 1;
-- Esperado gestionante_nombre_completo: 'Maria Test Ruiz'.

-- Debe FALLAR: columna generada es de solo lectura.
insert into registros (
    folio, usuario_nombres, usuario_apellido_paterno, usuario_nombre_completo,
    tipo_usuario, marca, modelo, color, sin_placas
) values (
    'SATAG-900005', 'X', 'Y', 'valor manual',
    'padres', 'Ford', 'Escape', 'Negro', true
);

-- Debe FALLAR: folio con formato invalido.
insert into registros (
    folio, usuario_nombres, usuario_apellido_paterno,
    tipo_usuario, marca, modelo, color, sin_placas
) values (
    'ABC-1', 'Z', 'W',
    'padres', 'Ford', 'Focus', 'Negro', true
);
```

## Pruebas RLS minimas registros

```sql
-- anon NO debe poder leer ni escribir registros directamente.
set role anon;
select * from registros;                 -- 0 filas / sin permiso.
insert into registros (folio, usuario_nombres, usuario_apellido_paterno,
    tipo_usuario, marca, modelo, color, sin_placas)
values ('SATAG-999999', 'Hacker', 'Anon', 'padres', 'Ford', 'Focus', 'Negro', true);  -- debe fallar.
reset role;

-- authenticated administra por ahora.
set role authenticated;
select count(*) from registros;
reset role;
```

## Bloque 4: Evidencia de firma

### aceptaciones

| Punto | Revision |
|---|---|
| Proposito | Evidencia legal de firma y aceptacion (reglamento + aviso + firma reforzada). |
| PII | SI. `firma_url`, `firma_trazos`, `firmante_nombre`, `ip_origen`, `user_agent`, `hash_payload`. |
| Clave principal | `id uuid`. |
| Una por registro | `registro_id UNIQUE references registros(id) on delete cascade`. |
| Snapshot legal | FKs a `reglamento_versiones` y `aviso_versiones`; guarda que version se acepto. |
| Integridad | `hash_documento` 64 hex; `hash_algoritmo='sha256'`; `firma_imagen_sha256` opcional validado. |
| Consentimiento | `acepto_reglamento AND acepto_privacidad` obligados por constraint. |
| Inmutabilidad | La escribe solo el RPC (owner). authenticated: solo SELECT (bloque 18). |
| RLS esperado | anon sin acceso; authenticated solo lectura. |

## Pruebas SQL minimas aceptaciones

```sql
insert into registros (folio, usuario_nombres, usuario_apellido_paterno,
    tipo_usuario, marca, modelo, color, sin_placas)
values ('SATAG-900010', 'Prueba', 'Aceptacion', 'padres', 'Toyota', 'Corolla', 'Blanco', true);

-- Aceptacion valida (hash de 64 hex de ejemplo).
insert into aceptaciones (registro_id, reglamento_version_id, aviso_version_id,
    firma_url, firmante_nombre, hash_documento, hash_payload)
select r.id, rv.id, av.id,
    'firmas/demo.png', 'Prueba Aceptacion',
    repeat('a', 64), '{"schema":"satag.acceptance.v1"}'::jsonb
from registros r
cross join (select id from reglamento_versiones where vigente limit 1) rv
cross join (select id from aviso_versiones where vigente limit 1) av
where r.folio = 'SATAG-900010';

-- Debe FALLAR: segunda aceptacion para el mismo registro (registro_id UNIQUE).
insert into aceptaciones (registro_id, reglamento_version_id, aviso_version_id,
    firma_url, firmante_nombre, hash_documento, hash_payload)
select r.id, rv.id, av.id, 'firmas/demo2.png', 'Otro', repeat('b', 64), '{}'::jsonb
from registros r
cross join (select id from reglamento_versiones where vigente limit 1) rv
cross join (select id from aviso_versiones where vigente limit 1) av
where r.folio = 'SATAG-900010';

-- Debe FALLAR: hash_documento no es 64 hex.
insert into aceptaciones (registro_id, reglamento_version_id, aviso_version_id,
    firma_url, firmante_nombre, hash_documento, hash_payload)
select r.id, rv.id, av.id, 'firmas/x.png', 'X', 'no-es-hash', '{}'::jsonb
from registros r
cross join (select id from reglamento_versiones where vigente limit 1) rv
cross join (select id from aviso_versiones where vigente limit 1) av
where r.folio = 'SATAG-900010';
```

## Bloque 5: Bitacora

### movimientos

| Punto | Revision |
|---|---|
| Proposito | Historial del ciclo de vida del TAG por registro. |
| PII | Posible/indirecta (`hecho_por`, `motivo`). |
| Clave principal | `id uuid`. |
| Relacion | `registro_id -> registros(id) on delete cascade`. |
| Tipos | `alta`, `baja`, `reposicion`, `cambio`, `prueba`, `bloqueo`, `rectificacion` (CHECK). |
| Cambio de TAG | `no_dispositivo_anterior` / `no_dispositivo_nuevo`. |
| Indice | `ix_movimientos_registro` para listar por expediente. |
| RLS esperado | anon sin acceso; authenticated administra (insert/select). |
| Nota | El `alta` lo escribe el RPC crear_registro; el resto lo agrega TI/Admin. |

## Pruebas SQL minimas movimientos

> Cuidado: `INSERT ... SELECT` con un SELECT vacio inserta 0 filas y NO dispara
> el CHECK. Por eso los tests garantizan primero el registro y el negativo usa
> `VALUES` con subconsulta escalar (siempre intenta 1 fila).

```sql
-- 1) Garantiza el registro (idempotente).
insert into registros (folio, usuario_nombres, usuario_apellido_paterno,
    tipo_usuario, marca, modelo, color, sin_placas)
values ('SATAG-900010', 'Prueba', 'Aceptacion', 'padres', 'Toyota', 'Corolla', 'Blanco', true)
on conflict (folio) do nothing;

-- 2) Alta y una reposicion sobre el mismo registro.
insert into movimientos (registro_id, tipo, motivo, hecho_por)
select id, 'alta', 'Alta de prueba', 'tester'
from registros where folio = 'SATAG-900010';

insert into movimientos (registro_id, tipo, no_dispositivo_anterior, no_dispositivo_nuevo, motivo, hecho_por)
select id, 'reposicion', '1234567', '7654321', 'TAG danado', 'TI'
from registros where folio = 'SATAG-900010';

-- 3) Historial (debe listar 2 filas).
select tipo, fecha, no_dispositivo_anterior, no_dispositivo_nuevo, hecho_por
from movimientos m
join registros r on r.id = m.registro_id
where r.folio = 'SATAG-900010'
order by m.created_at;

-- 4) Debe FALLAR: tipo fuera del CHECK (fila real via VALUES).
insert into movimientos (registro_id, tipo, motivo)
values ((select id from registros where folio = 'SATAG-900010'), 'inventado', 'x');
```

## Bloque 6: RLS del alta (aceptaciones + movimientos)

| Tabla | Policy | Regla |
|---|---|---|
| `aceptaciones` | `aceptaciones_lectura_auth` | `for select to authenticated`. Evidencia inmutable; la escribe el RPC (owner). |
| `movimientos` | `movimientos_admin` | `for all to authenticated`. Bitacora que administra TI/Admin. |
| ambas | (ninguna para anon) | `anon` no lee ni escribe. |

> Correccion de sync: en `schema.sql` `aceptaciones` tenia `for all` con grant solo
> `select`; se dejo coherente en `for select`.

## Pruebas RLS minimas del alta

```sql
-- RLS activada en ambas.
select relname, relrowsecurity
from pg_class
where relname in ('aceptaciones','movimientos');

-- Politicas esperadas.
select tablename, policyname, cmd, roles
from pg_policies
where tablename in ('aceptaciones','movimientos')
order by tablename, policyname;
-- aceptaciones | aceptaciones_lectura_auth | SELECT | {authenticated}
-- movimientos  | movimientos_admin         | ALL    | {authenticated}
```

> La prueba de acceso real de anon/authenticated se hace en el bloque 7 (grants),
> porque sin GRANT el rol falla por "permission denied" antes que la RLS.

## Bloque 7: Grants del alta (aceptaciones + movimientos)

| Tabla | anon | authenticated |
|---|---|---|
| `aceptaciones` | sin grant | `SELECT` |
| `movimientos` | sin grant | `SELECT, INSERT, UPDATE, DELETE` |

El alta publica no usa estos grants: entra por `crear_registro` (SECURITY DEFINER, owner).

## Pruebas de acceso real (RLS + grants)

```sql
insert into registros (folio, usuario_nombres, usuario_apellido_paterno,
    tipo_usuario, marca, modelo, color, sin_placas)
values ('SATAG-900010', 'Prueba', 'Aceptacion', 'padres', 'Toyota', 'Corolla', 'Blanco', true)
on conflict (folio) do nothing;

-- anon: sin acceso a ninguna.
set role anon;
select * from aceptaciones;   -- debe FALLAR: permission denied
select * from movimientos;    -- debe FALLAR: permission denied
reset role;

-- authenticated: lee ambas, escribe solo movimientos.
set role authenticated;
select count(*) from aceptaciones;   -- OK
select count(*) from movimientos;    -- OK
insert into movimientos (registro_id, tipo, motivo, hecho_por)
values ((select id from registros where folio = 'SATAG-900010'), 'prueba', 'test auth', 'auth');  -- OK
insert into aceptaciones (registro_id, reglamento_version_id, aviso_version_id,
    firma_url, firmante_nombre, hash_documento, hash_payload)
values ((select id from registros where folio = 'SATAG-900010'),
        (select id from reglamento_versiones where vigente limit 1),
        (select id from aviso_versiones where vigente limit 1),
        'firmas/x.png', 'X', repeat('c', 64), '{}'::jsonb);  -- debe FALLAR: sin grant insert
reset role;
```

## Bloque 8: RPC crear_registro

| Punto | Revision |
|---|---|
| Proposito | Alta publica atomica: registros + aceptaciones + movimientos en una transaccion. |
| Seguridad | `SECURITY DEFINER` + `set search_path = public, extensions`; corre como owner. (`extensions` porque pgcrypto/`digest` vive alli en Supabase.) |
| Acceso | `revoke all from public` + `grant execute to anon, authenticated`. |
| Folio | Asigna `SATAG-######` con `nextval('registros_folio_seq')`. |
| Hash | `hash_documento` = SHA-256 del `hash_payload` canonico (pgcrypto). |
| Retorno | `jsonb {id, folio, estado}` (anon no puede leer registros). |
| Validaciones | Obligatorios, tipo_usuario, menor con gestionante, formato firma_imagen_sha256. |

## Pruebas RPC minimas

```sql
-- Alta como anon (SECURITY DEFINER permite escribir sin grants directos).
set role anon;
select crear_registro(
    p_usuario_nombres          => 'Juan Carlos',
    p_usuario_apellido_paterno => 'Perez',
    p_usuario_apellido_materno => 'Lopez',
    p_tipo_usuario             => 'padres',
    p_marca                    => 'Toyota',
    p_modelo                   => 'Sienna',
    p_color                    => 'Blanco',
    p_placas                   => 'ABC1234',
    p_sin_placas               => false,
    p_firma_url                => 'firmas/demo.png'
);
reset role;
-- Esperado: { "id": ..., "folio": "SATAG-000001", "estado": "pendiente" }

select folio, usuario_nombre_completo, estado from registros order by created_at desc limit 1;
select hash_documento = encode(digest(convert_to(hash_payload::text,'UTF8'),'sha256'),'hex') as hash_valido
from aceptaciones order by created_at desc limit 1;   -- true
select tipo from movimientos order by created_at desc limit 1;   -- alta

-- Debe FALLAR: menor sin gestionante padre/madre/tutor.
set role anon;
select crear_registro(
    p_usuario_nombres          => 'Nino',
    p_usuario_apellido_paterno => 'Test',
    p_tipo_usuario             => 'alumno',
    p_marca => 'Honda', p_modelo => 'Civic', p_color => 'Gris',
    p_placas => null, p_sin_placas => true,
    p_firma_url => 'firmas/x.png', p_usuario_es_menor => true
);
reset role;
```

## Bloque 9: Storage firmas

| Punto | Revision |
|---|---|
| Proposito | Bucket privado para el PNG de firma. La BD guarda solo la ruta (aceptaciones.firma_url). |
| Privacidad | `public = false`; sin lectura por URL publica. |
| anon | Solo INSERT (subir). No lee, lista ni borra. |
| authenticated | Acceso completo al bucket (ver evidencia). |
| Endurecimiento | `file_size_limit = 2 MB`; `allowed_mime_types = image/png,image/jpeg`. |
| Nota | Requiere schema `storage` de Supabase; no corre en Postgres local. |

## Pruebas Storage

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'firmas';
-- public=false, 2097152, {image/png,image/jpeg}

select policyname, cmd, roles
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'firmas%'
order by policyname;
-- firmas_admin       | ALL    | {authenticated}
-- firmas_subida_anon | INSERT | {anon}
```
