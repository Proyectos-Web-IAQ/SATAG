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
     - `http://localhost:3000/admin/reset/`  (desarrollo)
     - `https://satag.vercel.app/admin/reset/`  (o comodin `https://satag.vercel.app/**`)
   - Si el correo redirige a una URL fuera de la allowlist, Supabase cae al Site URL y el reset falla.
4. **Correo (SMTP)** — el SMTP integrado de Supabase sirve para pruebas pero tiene limite bajo y
   puede caer en spam. Para produccion, configura **Custom SMTP** en Authentication -> Emails.
5. **MFA (pendiente para produccion)** — E6/CC-12 exige MFA en cuentas administrativas
   (Authentication -> Multi-Factor). No es bloqueante para el MVP interno, pero queda pendiente.

### Flujo de recuperacion (como funciona)

`/admin` -> *¿Olvidaste tu contrasena?* -> `resetPasswordForEmail(correo, { redirectTo: /admin/reset/ })`
-> Supabase envia correo -> el enlace regresa a `/admin/reset/` con el token en el **hash**
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

### Roles del panel (el usuario elige el suyo)

El panel tiene tres roles y cada uno ve/hace lo suyo:

| Rol | Que ve/hace en el panel |
|---|---|
| `admin` | Pestaña **Administración** (asignar estacionamiento, registrar pago) + Consulta. |
| `ti` | Pestaña **TI** (instalar/reponer TAG, dar de baja) + Consulta. |
| `consulta` | Solo **Consulta** (lectura del padron, sin acciones). |

**Cada usuario elige su propio rol** la primera vez que entra (pantalla "Elige tu area") y
puede cambiarlo luego con el enlace *cambiar* junto a su correo. La eleccion se guarda en
`user_metadata.rol` del usuario de Auth (`lib/supabase/auth.ts` -> `elegirRol`), que el
propio usuario puede escribir desde el navegador; por eso NO hace falta service_role ni
tocar el dashboard. **No hay que asignar nada al invitar**: invitas, la persona activa su
cuenta y al entrar elige su area.

> ⚠️ **El rol auto-seleccionado NO es un control de acceso.** Cualquiera con una cuenta
> podria elegir `admin`. Solo separa la vista y las acciones del panel. El control real
> depende de RLS (pendiente, ver `sql/13_rls_registros.sql`); RLS **no debe confiar** en
> `user_metadata.rol` porque el usuario lo edita.

**Candado opcional del admin.** Si necesitas fijar el rol de alguien para que NO pueda
cambiarlo, escribelo en `app_metadata` (inescribible por el usuario). Ese valor **gana**
sobre la eleccion del usuario y le oculta el enlace *cambiar*:

```sql
-- Fijar (bloquear) el rol de un usuario. Gana sobre su eleccion en user_metadata.
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"rol":"ti"}'::jsonb
 where email = 'persona@iaq.mx';

-- Ver el rol elegido por cada quien (user_metadata) y el candado (app_metadata).
select email,
       raw_user_meta_data ->> 'rol' as rol_elegido,
       raw_app_meta_data  ->> 'rol' as rol_bloqueado
  from auth.users
 order by email;
```

> Valores validos: `admin`, `ti`, `consulta`. El rol se lee al iniciar sesion, al elegirlo
> y al refrescar el token; si lo bloqueas por SQL con la sesion abierta, se aplica al recargar.

### Prueba manual

1. Crea un usuario de prueba en el dashboard (paso 1) y agrega los Redirect URLs (paso 3).
2. `npm run dev` -> abre `http://localhost:3000/admin/` e inicia sesion con ese usuario.
3. Cierra sesion (**Salir**) y prueba **¿Olvidaste tu contrasena?** con ese correo.
4. Abre el enlace del correo -> deberia mostrar el formulario de nueva contrasena en `/admin/reset/`.
5. Guarda la nueva contrasena y verifica que puedas iniciar sesion con ella.
6. **Roles:** al entrar por primera vez debe salir la pantalla **"Elige tu area"**. Elige una
   y verifica que el panel muestre solo la pestaña de ese rol (`admin` -> Administración,
   `ti` -> TI, `consulta` -> solo lectura) y que el enlace *cambiar* (junto al correo) te deje
   elegir otra. Para probar el candado, fija `app_metadata.rol` por SQL y confirma que ese rol
   se impone y desaparece el enlace *cambiar*.

## Pendientes antes de produccion

- Reemplazar reglamento placeholder por texto oficial.
- Reemplazar aviso placeholder por texto aprobado.
- Endurecer RLS por rol. Hoy el rol lo **elige el propio usuario** (se guarda en
  `user_metadata.rol`) y el panel solo lo usa para la UI; RLS sigue en `authenticated
  using(true)`, asi que la separacion es solo visual y evitable. Antes de produccion hay que
  decidir un modelo de rol **confiable** (RLS **no** debe leer `user_metadata`, que el usuario
  edita; solo `app_metadata` o una tabla protegida) y atar las politicas cuando la capa real
  reemplace al mock (ver `supabase/sql/13_rls_registros.sql`).
- Definir responsable ARCO.
- Definir plazo final de conservacion/bloqueo/supresion.
- Confirmar DPA/region Supabase.
- Probar RLS con usuarios reales de Supabase Auth.
