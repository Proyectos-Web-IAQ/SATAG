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
| Decision cerrada | El placeholder ya se reemplazo por las **22 clausulas oficiales del IAQ**, publicadas como v2 vigente (bloque 23). El v1 placeholder queda como historico. |

### aviso_versiones

| Punto | Revision |
|---|---|
| Proposito | Guardar versiones del aviso de privacidad SATAG. |
| PII | No guarda titulares; el texto puede contener datos institucionales. |
| Clave principal | `id uuid`. |
| Version | `version int unique`, positiva. |
| Vigencia | Solo una fila puede tener `vigente = true`. |
| RLS esperado | `anon` y `authenticated` leen solo vigente; mantenimiento autenticado por ahora. |
| Decision parcialmente cerrada | El **texto integral** del aviso ya esta publicado como v2 vigente (bloque 22); el placeholder v1 queda historico. **Sigue pendiente** la aprobacion formal de Direccion/Legal y la URL definitiva. |

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
| Evidencia | Captura `ip_origen` y `user_agent` server-side desde `request.headers` (confiable, no del cliente); entran al hash. Disclosed en el aviso. |
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

## Bloque 10: Pagos y folio de recibo (24, 32)

### pagos

| Punto | Revision |
|---|---|
| Proposito | Historial del cobro del TAG ($100 en efectivo). Un solo pago por expediente. |
| PII | Indirecta: `cobrado_por` es el nombre del personal que cobro, no del titular. |
| Clave principal | `id uuid`. |
| Relacion | `registro_id -> registros(id) on delete cascade`. |
| Constraints | `monto > 0`; `metodo in ('efectivo')`; `cobrado_por` y `folio_recibo` no vacios. |
| Folio | `folio_recibo` NOT NULL y unico. DEFAULT `'SATAG-' || YYYY || lpad(nextval('pagos_folio_recibo_seq'),6,'0')` (bloque 32). Inmutable: no se edita desde la app. |
| Unicidad | `uq_pagos_folio_recibo` (global) y `uq_pagos_registro` (un pago por expediente). |
| Secuencia | `pagos_folio_recibo_seq` con `revoke all ... from public, anon, authenticated`: nadie la consume desde el navegador. |
| RLS | Solo SELECT para el panel (`aal2` + rol admin/ti/consulta/super). Sin insert/update/delete directos. |
| Escritura | Unicamente `registrar_pago` (SECURITY DEFINER, rol `admin`). |
| Concurrencia | `select ... for update` sobre el registro serializa dos cobros simultaneos; el segundo recibe "El registro ya tiene el pago X registrado". |
| Decision cerrada | El pago no se edita ni se borra desde la app: es historial contable. |
| Decision abierta | Correccion de un pago mal capturado: hoy no existe flujo (habria que definir nota de credito o ajuste). |
| Pendiente | **Corte de caja**: tabla de cortes + sello del corte en cada pago. No implementado. |

## Bloque 11: Asignacion y solicitudes (25, 26, 27)

### registro_estacionamientos

| Punto | Revision |
|---|---|
| Proposito | Puente entre el registro y el acceso asignado (E1/E2). |
| PII | Indirecta por FK al expediente. |
| Relaciones | `registro_id -> registros(id)`; `estacionamiento_clave -> estacionamientos(clave)`. |
| Quien asigna | **TI** (SC-002), no Administracion. |
| RLS | Solo SELECT para el panel (`aal2` + rol). Escritura por RPC. |

### solicitudes

| Punto | Revision |
|---|---|
| Proposito | Solicitudes publicas de `actualizacion`/`baja` y notas del buzon sin folio (`nota`). |
| PII | Si: `solicitante_nombre`, `alumno_nombre` (puede ser un menor), `vehiculo_desc`, `detalle`. |
| Tipos | `sol_tipo_valido`: `actualizacion` \| `baja` \| `nota` (el valor `nota` lo agrega el bloque 34). |
| Tramite pedido | `tramite_solicitado`: `actualizacion` \| `baja`. El bloque 41 elimino `instalacion` porque instalar es solo por el alta. |
| Cierre | `atendida boolean` + `resolucion in ('ejecutada','descartada')`. **No existe columna `estado`.** |
| `registro_id` | **Opcional**: una nota nace sin expediente y TI la vincula despues. Un NULL aqui es legitimo, no un error. |
| Unicidad | Maximo una solicitud pendiente por tipo y expediente. |
| RLS | Solo SELECT para el panel (`aal2` + rol). Escritura por RPC. |
| Riesgo aceptado | Intake publico sin sesion ni verificacion de identidad y **sin rate limiting/CAPTCHA**. Un tercero puede capturar datos de otra persona. |

## Bloque 12: Roles finos y RPCs del panel (27, 29, 30, 31)

### panel_exigir_rol

| Punto | Revision |
|---|---|
| Proposito | Guardia comun de los RPCs del panel: exige sesion `aal2` **y** rol permitido. |
| Por que importa | Los RPCs son `SECURITY DEFINER`: corren como owner y **omiten la RLS**. Sin esta guardia, cualquier sesion autenticada podria escribir el expediente. |
| Comportamiento | `super` pasa cualquier guardia; un `authenticated` sin rol es rechazado. |
| Riesgo revisado | Todos los RPCs declaran `set search_path = public`, lo que evita el secuestro por `search_path`. |

### Roles finos (30)

| Punto | Revision |
|---|---|
| Fuente de verdad | `app_metadata.rol`, que solo fija un admin con `service_role`. `user_metadata` **nunca** se usa en RLS (el usuario puede editarlo). |
| RLS de lectura | `registros` y `movimientos`: admin/ti/consulta/super con `aal2`. `aceptaciones`: **solo admin/super** (evidencia legal de firma). |
| Escritura directa | Revocada: `revoke insert, update, delete ... from authenticated`. |
| Requisito operativo | PASO 0 (asignar rol) **y re-login**: el rol viaja en el JWT; sin volver a entrar, la sesion vieja no lo trae. |

### Inventario de RPCs

| RPC | Rol | Nota de auditoria |
|---|---|---|
| `crear_registro` | anon (publico) | Alta atomica: registro + aceptacion + movimiento. |
| `crear_solicitud` | anon (publico) | Exige folio + placas o No. de TAG; respuesta honesta sin revelar datos. |
| `crear_nota_solicitud` | anon (publico) | Buzon sin folio; **no busca ni confirma** si la persona existe. |
| `registrar_pago` | `admin` | Emite folio; bloquea doble cobro. |
| `asignar_estacionamiento` | `ti` | Asigna E1/E2. |
| `instalar_tag_con_estacionamiento` | `ti` | Instala + asigna en una transaccion. |
| `actualizar_registro_con_estacionamiento` | `ti` | Actualiza y cierra la solicitud/nota que coincide. |
| `dar_baja` | `ti` | Baja + cierre de la solicitud/nota de baja. |
| `usar_tag_apartado` | `ti` | Reposicion desde el TAG apartado. |
| `vincular_nota` | `ti` | Vincula la nota y corrobora el tramite. |
| `descartar_solicitud` | `ti` | Cierra sin ejecutar, con motivo. |

> Los RPC internos `instalar_tag` y `actualizar_registro` quedaron **revocados al cliente** en el bloque 31.

## Bloque 13: CC-01 apartar y usar el TAG apartado (33, 40)

| Punto | Revision |
|---|---|
| Columnas | `procedencia_tag` (`escuela`/`propio`), `tag_apartado boolean`, `tag_apartado_no text` con formato `^[0-9]{6,11}$`. |
| Integridad | CHECK de coherencia entre `tag_apartado` y `tag_apartado_no`, mas indice unico del numero apartado: un mismo TAG no puede quedar reservado dos veces. |
| Quien edita procedencia | Solo TI, nunca el titular (el alta publica no la fija libremente). |
| `usar_tag_apartado` | `no_dispositivo <- tag_apartado_no`, `procedencia_tag <- 'escuela'`, consume la reserva (`tag_apartado=false`, numero a NULL) y registra movimiento `reposicion`. |
| Caso borde cerrado | Cambiar procedencia a `escuela` desde "Actualizar" con un apartado vivo esta **prohibido**: TI debe usar el apartado o quitarlo explicitamente. |
| PostgREST | El bloque 33 hace drop+recreate de los wrappers (cambio de firma); el 40 crea `usar_tag_apartado` (nuevo, solo `notify`). |

## Bloque 14: SC-003 buzon de notas sin folio (34-39, 41)

| Punto | Revision |
|---|---|
| Entrada publica | `crear_nota_solicitud` (anon): registra la nota **sin buscar nada**; no revela si la persona o el expediente existen. |
| Datos de la nota | `solicitante_nombre`, `solicitante_rol` (`maestro`/`padres`/`alumno`/`admin`), `tramite_solicitado`, `alumno_nombre`, `alumno_grado`, `vehiculo_desc`, `detalle`. Alumno y grado obligatorios solo si el rol es `padres` (bloque 35). |
| Vinculacion | `vincular_nota` (rol `ti`) empata la nota con el expediente y **corrobora** el tramite: si el pedido no procede, TI aplica otro y la nota se actualiza (bloque 39). |
| Auto-cierre | Al ejecutar el tramite, se cierra la nota cuyo `tramite_solicitado` **coincide** (bloque 38). Si TI aplica otro tramite, la nota no se cierra sola: se cierra a mano. Evita que un tramite no relacionado borre en silencio otra peticion. |
| Fix auditado | El bloque 36 corrige `descartar_solicitud`, que fallaba con "Solicitud no encontrada" al cerrar una nota sin vincular: `SELECT ... INTO` no distingue "cero filas" de "una fila con NULL"; ahora usa `FOUND`. |
| Regla de alcance | El bloque 41 elimina `instalacion` del catalogo: instalar es siempre por el alta, nunca por solicitud. |
| PII | Datos de terceros (incluido un posible menor) capturados **sin verificar identidad**. Debe estar cubierto por el aviso. |
| PostgREST | Los bloques 35, 37 y 39 cambian firmas de RPC: hacen `drop function` + `notify pgrst`. Los bloques 36, 38, 40 y 41 solo cambian cuerpos. |
| Pendiente | Rate limiting/CAPTCHA en la entrada publica (riesgo aceptado por ahora). |

## Pruebas minimas de pagos y buzon

```sql
-- 1) Folio automatico e inmutable, un pago por expediente.
select folio_recibo, monto, cobrado_por from pagos order by created_at desc limit 3;
-- Formato esperado: SATAG-2026-000001

-- Debe FALLAR el segundo cobro del mismo expediente:
select registrar_pago(p_registro_id => '<uuid>', p_monto => 100, p_cobrado_por => 'Prueba');
select registrar_pago(p_registro_id => '<uuid>', p_monto => 100, p_cobrado_por => 'Prueba');
-- Esperado: "El registro ya tiene el pago SATAG-... registrado"

-- 2) La secuencia no es accesible desde el navegador.
set role anon;      select nextval('pagos_folio_recibo_seq');   -- debe fallar
set role authenticated; select nextval('pagos_folio_recibo_seq'); -- debe fallar
reset role;

-- 3) Nota del buzon: se crea sin folio y sin expediente.
set role anon;
select crear_nota_solicitud(
    p_solicitante_nombre => 'Ana Ruiz',
    p_solicitante_rol    => 'padres',
    p_tramite_solicitado => 'actualizacion',
    p_alumno_nombre      => 'Luis Ruiz',
    p_alumno_grado       => '3A',
    p_detalle            => 'Cambio de coche'
);
reset role;
select tipo, registro_id, tramite_solicitado, atendida, resolucion
from solicitudes where tipo = 'nota' order by created_at desc limit 1;
-- Esperado: tipo=nota, registro_id NULL, atendida=false, resolucion NULL

-- 4) Un tramite invalido debe rechazarse (bloque 41).
set role anon;
select crear_nota_solicitud('X','maestro','instalacion',null,null,'prueba');
reset role;
-- Esperado: falla por sol_tramite_valido

-- 5) Sin rol o sin aal2, el panel no lee ni escribe.
set role authenticated;
select count(*) from pagos;        -- 0 filas o error: la RLS exige aal2 + rol
reset role;
```
