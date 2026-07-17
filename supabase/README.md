# supabase/ - SATAG

Paquete SQL del **Entregable E1 (Modelo de datos + BD)**, alineado con E6 legal/privacidad.

> No contiene datos personales. El padron real `Acceso a estacionamiento.xlsx` queda fuera del repo.

## Archivos

| Archivo | Que hace |
|---|---|
| `schema.sql` | Tablas, constraints, indices, RLS, RPC `crear_registro`, RPC `crear_solicitud` y bucket privado `firmas`. |
| `seed.sql` | Estacionamientos, catalogos base, modelos base, reglamento placeholder y aviso placeholder. |
| `sql/` | Version atomica de trabajo para auditar y ejecutar el esquema tabla por tabla. |

> `schema.sql` se conserva como respaldo monolitico. Para auditoria y construccion paso a paso, usar `sql/README.md`.

## Orden de ejecucion

1. Ejecutar `schema.sql` en Supabase SQL Editor.
2. Ejecutar `seed.sql`.

La seccion Storage de `schema.sql` usa el esquema `storage` propio de Supabase. No correra igual en un Postgres local sin Supabase.

Si ya se habia ejecutado una version anterior de `schema.sql` en un proyecto vacio de pruebas, conviene reiniciar la base o aplicar una migracion equivalente. `CREATE TABLE IF NOT EXISTS` no agrega columnas nuevas a tablas ya creadas.

## Que garantiza `schema.sql`

- `anon` solo lee catalogos, reglamento vigente y aviso vigente.
- `anon` no lee `registros`, `aceptaciones`, `pagos`, `movimientos` ni `solicitudes`.
- El alta publica entra por `crear_registro`, que crea registro + aceptacion + movimiento en una transaccion.
- La firma guarda version de reglamento, version de aviso, hash SHA-256 generado por la base, paquete canonico firmado, firmante, rol, ruta de firma y trazos opcionales.
- Alumno menor requiere gestionante con relacion `padre`, `madre` o `tutor`.
- El pago no requiere folio, recibo ni corte especifico por ahora.
- Solicitudes de cambio/baja/ARCO/revocacion entran por `crear_solicitud`.
- El estado `bloqueado` permite cancelacion/bloqueo previo a supresion.
- El bucket `firmas` es privado.

## Checklist manual de pruebas

> Ejecuta como rol de servicio en SQL Editor. Para simular publico usa `set role anon;` y regresa con `reset role;`.

- [ ] **1. Aplicar scripts:** `schema.sql` y `seed.sql` corren sin errores.
- [ ] **2. Semillas OK:**
  ```sql
  select clave from estacionamientos order by clave;
  select version, vigente from reglamento_versiones;
  select version, vigente from aviso_versiones;
  select count(*) from cat_modelos;
  ```
- [ ] **3. Alta por RPC:**
  ```sql
  select crear_registro(
    p_usuario_nombres          => 'Juan',
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
  ```
  Debe devolver un JSON `{ "id": ..., "folio": "SATAG-000001", "estado": "pendiente" }`; debe crear 1 registro `pendiente`, 1 aceptacion y 1 movimiento `alta`.
  El hash debe generarse dentro de Supabase:
  ```sql
  select hash_algoritmo, hash_documento, hash_payload
  from aceptaciones
  order by created_at desc
  limit 1;
  ```
  Y debe poder verificarse contra el paquete guardado:
  ```sql
  select hash_documento = encode(digest(convert_to(hash_payload::text, 'UTF8'), 'sha256'), 'hex') as hash_valido
  from aceptaciones
  order by created_at desc
  limit 1;
  ```
- [ ] **4. Menor sin tutor falla:**
  ```sql
  select crear_registro(
    p_usuario_nombres          => 'Alumno',
    p_usuario_apellido_paterno => 'Menor',
    p_tipo_usuario             => 'alumno',
    p_marca                    => 'Honda',
    p_modelo                   => 'Civic',
    p_color                    => 'Gris',
    p_placas                   => 'XYZ9876',
    p_sin_placas               => false,
    p_firma_url                => 'firmas/demo2.png',
    p_usuario_es_menor         => true
  );
  ```
  Debe fallar porque falta gestionante padre/madre/tutor.
- [ ] **5. Menor con tutor pasa:**
  ```sql
  select crear_registro(
    p_usuario_nombres              => 'Alumno',
    p_usuario_apellido_paterno     => 'Menor',
    p_tipo_usuario                 => 'alumno',
    p_marca                        => 'Honda',
    p_modelo                       => 'Civic',
    p_color                        => 'Gris',
    p_placas                       => 'XYZ9876',
    p_sin_placas                   => false,
    p_firma_url                    => 'firmas/demo3.png',
    p_firmante_nombre              => 'Tutor Legal Ramirez',
    p_gestionante_nombres          => 'Tutor',
    p_gestionante_apellido_paterno => 'Legal',
    p_gestionante_apellido_materno => 'Ramirez',
    p_gestionante_relacion         => 'tutor',
    p_usuario_es_menor             => true,
    p_firmante_rol                 => 'tutor'
  );
  ```
- [ ] **6. RLS de PII:**
  ```sql
  set role anon;
  select * from registros;
  select * from aceptaciones;
  select * from solicitudes;
  select version from reglamento_versiones;
  select version from aviso_versiones;
  reset role;
  ```
  Las tablas con PII no deben ser legibles por `anon`; reglamento/aviso vigentes si.
- [ ] **7. Solicitud publica:**
  ```sql
  select crear_solicitud(
    'baja',
    'Juan Perez Lopez',
    'juan@example.com',
    'Solicito baja del TAG'
  );
  ```
- [ ] **8. Storage:** existe bucket privado `firmas`; `anon` puede subir, no leer.

## Auth del panel administrativo

El panel (`/admin`) usa **Supabase Auth** (correo + contrasena). Al iniciar sesion el
usuario obtiene el rol `authenticated`, que las politicas RLS ya permiten para gestionar el
padron. El sitio es estatico: la sesion vive en el navegador (`lib/supabase/auth.ts`).

Configuracion en el **Dashboard de Supabase** (no vive en el repo):

1. **Crear usuarios del personal** — Authentication -> Users -> *Add user*. Marca el correo como
   confirmado (o envia invitacion). **No hay registro publico**: las cuentas se crean aqui a mano.
2. **Desactivar el alta publica** — Authentication -> Sign In / Providers -> Email ->
   *Allow new users to sign up* = **OFF** (defensa en profundidad; la app nunca llama a `signUp`).
3. **Redirect URLs** (para el enlace de recuperacion) — Authentication -> URL Configuration:
   - **Site URL:** el origen de produccion (ej. `https://satag.vercel.app`).
   - **Redirect URLs** (allowlist): agrega la ruta de reset en cada entorno, con `/` final:
     - `http://localhost:3000/admin/reset-password/`  (desarrollo)
     - `https://satag.vercel.app/admin/reset-password/`  (o comodin `https://satag.vercel.app/**`)
   - Si el correo redirige a una URL fuera de la allowlist, Supabase cae al Site URL y el reset falla.
4. **Correo (SMTP)** — el SMTP integrado de Supabase sirve para pruebas pero tiene limite bajo y
   puede caer en spam. Para produccion, configura **Custom SMTP** en Authentication -> Emails.
5. **MFA (pendiente para produccion)** — E6/CC-12 exige MFA en cuentas administrativas
   (Authentication -> Multi-Factor). No es bloqueante para el MVP interno, pero queda pendiente.

### Flujo de recuperacion (como funciona)

`/admin` -> *¿Olvidaste tu contrasena?* -> `resetPasswordForEmail(correo, { redirectTo: /admin/reset-password/ })`
-> Supabase envia correo -> el enlace regresa a `/admin/reset-password/` con el token en el **hash**
(`#access_token=...&type=recovery`, flujo *implicit* para que funcione cross-device) -> la pagina
establece la sesion de recuperacion y pide la nueva contrasena -> `updateUser({ password })` ->
cierra sesion y el usuario entra con la contrasena nueva.

### Invitar personal (que cada quien cree su contrasena)

En vez de fijar la contrasena a mano, puedes **invitar** al correo del personal y que
active su cuenta. Como el sitio es estatico, se usa el patron `token_hash` + `verifyOtp`
(la app lo procesa en `/admin/invite`, ver `app/admin/invite/page.tsx`).

1. **Site URL** (Authentication -> URL Configuration): el origen del entorno **sin** ruta.
   - Pruebas locales: `http://localhost:3000`
   - Produccion: `https://satag.vercel.app` (o el dominio final)
   > La invitacion construye el enlace a partir del Site URL; cambialo segun donde vayas a probar.
2. **Plantilla del correo** (Authentication -> Emails -> Templates -> **Invite user**): apunta el
   boton a la pagina de invitacion con el `token_hash`:
   ```html
   <h2>Invitación al panel SATAG</h2>
   <p>Has sido invitado a administrar el sistema SATAG del IAQ.</p>
   <p><a href="{{ .SiteURL }}/admin/invite/?token_hash={{ .TokenHash }}&type=invite">Activar mi cuenta y crear contraseña</a></p>
   ```
3. **Enviar la invitacion** (Authentication -> Users -> *Add user* -> **Send invitation**). Si habia
   un usuario pendiente de una invitacion anterior, borralo y reinvitalo para que use la plantilla nueva.
4. El invitado abre el correo -> `/admin/invite/` valida el token, crea su contrasena y ya puede entrar.

> El enlace de invitacion caduca (por defecto 24 h) y es de un solo uso. Si expira, reenvia la invitacion.
> Nota: al invitar se crea el usuario en Auth aunque el registro publico este en OFF (lo crea el admin, no el autoservicio).

### Roles del panel (`app_metadata`)

El rol es un control de acceso real: lo asigna un administrador en
`app_metadata.rol`, la UI lo lee de la sesión y las RLS/RPC lo vuelven a validar
en la base de datos. El usuario no puede elegirlo ni cambiarlo desde el panel.

| Rol | Que ve/hace en el panel |
|---|---|
| `admin` | Pestaña **Administración** (registrar pago) + Consulta. |
| `ti` | Pestaña **TI** (asignar estacionamiento, instalar/reponer TAG, actualizar, dar de baja y atender solicitudes). |
| `consulta` | Solo **Consulta** (lectura del padron, sin acciones). |
| `super` | Las tres pestañas y todos los RPC del panel; solo para soporte/pruebas integrales. |

Asigna el rol después de invitar/crear al usuario y antes de que opere el panel:

```sql
-- Valores: admin | ti | consulta | super
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"rol":"ti"}'::jsonb
 where email = 'persona@asuncionqro.edu.mx';

-- Auditar la asignacion efectiva.
select email,
       raw_app_meta_data ->> 'rol' as rol
  from auth.users
  order by email;
```

El rol viaja dentro del JWT. Después de asignarlo o cambiarlo, la persona debe
cerrar sesión y volver a entrar; recargar la página no sustituye ese paso.

### Prueba manual

1. Crea un usuario de prueba en el dashboard (paso 1) y agrega los Redirect URLs (paso 3).
2. `npm run dev` -> abre `http://localhost:3000/admin/` e inicia sesion con ese usuario.
3. Cierra sesion (**Salir**) y prueba **¿Olvidaste tu contrasena?** con ese correo.
4. Abre el enlace del correo -> deberia mostrar el formulario de nueva contrasena en `/admin/reset-password/`.
5. Guarda la nueva contrasena y verifica que puedas iniciar sesion con ella.
6. **Roles:** sin `app_metadata.rol`, después de MFA debe aparecer **"Sin rol asignado"**.
   Asigna el rol por SQL, cierra sesión y vuelve a entrar. Verifica que `admin`, `ti` y
   `consulta` solo vean sus pestañas; usa `super` únicamente para recorrer el flujo integral.

## Pendientes antes de produccion

- Reemplazar reglamento placeholder por texto oficial.
- Reemplazar aviso placeholder por texto aprobado.
- Endurecer a rol `admin` las escrituras de catálogos, documentos y Storage de firmas
  (SQL 05, 09 y 20 todavía aceptan cualquier sesión `authenticated + aal2`).
- Agregar rate limiting/CAPTCHA al RPC público `crear_solicitud` antes de exponerlo ampliamente.
- Definir responsable ARCO.
- Definir plazo final de conservacion/bloqueo/supresion.
- Confirmar DPA/region Supabase.
- Probar RLS con usuarios reales de Supabase Auth.
