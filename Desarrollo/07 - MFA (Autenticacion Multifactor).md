# MFA — Autenticación Multifactor del Panel (SATAG)

> **Desarrollo · Fase 1 (Diseño + Runbook)** · Endurecimiento del acceso del personal interno al
> panel administrativo. Documento **de decisión y operación**: fija cómo se activa el segundo factor,
> cómo se **fuerza** y cómo se **resetea** cuando alguien pierde su dispositivo. Aplica a los tres
> perfiles del panel: **admin, TI y consulta**.

| Proyecto | **SATAG** — Sistema de Adquisición de TAG Vehicular |
|---|---|
| Cliente | Instituto Asunción de Querétaro AC (IAQ) — interno |
| Responsable / Desarrollador | Gerardo Sánchez — Soporte TI Jr. |
| Fecha | 14-jul-2026 · Versión **v0.1** (borrador de diseño) |

**Historial:** v0.1 (decisiones cerradas: TOTP · RLS estricta `aal2` · reset por admin fuera de banda;
runbook de reset completo).

---

## 1. Decisiones cerradas

| Decisión | Elección | Motivo |
|---|---|---|
| Tipo de factor | **TOTP** (app autenticadora, código de 6 dígitos) | Gratis, estándar, sin proveedor SMS ni costos ni dependencia de red celular. |
| Dureza de la aplicación | **RLS estricta**: las tablas con PII exigen `aal2` | Es la frontera **real**; el bloqueo en la UI es solo experiencia. |
| Alcance | **Todo usuario `authenticated`** del panel | Los roles del panel se auto-eligen y **no son frontera de seguridad**, pero todo el que entra es admin/TI/consulta: exigir MFA a `authenticated` los cubre a los tres. |
| Reset por dispositivo perdido | **Acción fuera de banda** por un admin designado (consola de Supabase) | El sitio es estático y **no puede tener `service_role`**; el reset no puede ser un botón del panel (ver §6). |

---

## 2. Conceptos base (Supabase Auth)

- **Factor:** el segundo elemento. Aquí, **TOTP**.
- **AAL (Authentication Assurance Level)** — la pieza clave:
  - `aal1` = solo contraseña.
  - `aal2` = contraseña **+** código MFA verificado en la sesión.
  - El nivel viaja en el **JWT** (claim `aal`), por lo que la BD lo lee sin consultas extra.
- **Ciclo de un factor (SDK):** `mfa.enroll()` (da el QR/secreto, crea factor no verificado) →
  `mfa.challenge()` (abre reto) → `mfa.verify()` (valida el código; la 1.ª vez marca el factor como
  verificado y sube la sesión a `aal2`).

---

## 3. Las dos capas de aplicación

| Capa | Qué hace | ¿Frontera de seguridad? |
|---|---|---|
| **UX del panel (cliente)** | Si la sesión es `aal1`, no muestra el panel: obliga a inscribir/introducir el código | **No** — solo experiencia. |
| **RLS en la BD (`aal = 'aal2'`)** | La base **rechaza** lectura/escritura de PII si el JWT no es `aal2` | **Sí** — esto es lo que fuerza de verdad. |

El alta pública **no se ve afectada**: `crear_registro` es `SECURITY DEFINER` (corre como owner y omite
la RLS), y el formulario usa el cliente anónimo. Subir la RLS a `aal2` solo afecta el acceso directo del
panel.

---

## 4. Flujo del panel (con MFA)

Tras el login se intercala una decisión nueva leyendo el AAL
(`mfa.getAuthenticatorAssuranceLevel() → { currentLevel, nextLevel }`):

```
login (contraseña)
   ├─ current 'aal1' y next 'aal1'  → NO tiene factor        → PANTALLA DE ALTA (QR) → verify → aal2
   ├─ current 'aal1' y next 'aal2'  → tiene factor, falta hoy → PANTALLA DE CÓDIGO   → verify → aal2
   └─ current 'aal2'                → ya cumplió              → panel normal
```

Es el mismo patrón que hoy usa el panel para "sesión pero sin rol → selección de rol"; se agrega un
gate previo "sesión pero sin `aal2` → pantalla MFA".

---

## 5. RLS estricta (`aal2`)

Las políticas hoy dicen `to authenticated using (true)`. La versión con MFA exige `aal2`:

```sql
using ( (auth.jwt() ->> 'aal') = 'aal2' )
```

Tablas a endurecer (PII): `registros` (13), `aceptaciones` y `movimientos` (17), el bucket de firmas
(20) y las escrituras admin de catálogos/documentos. Los catálogos de **lectura** pueden quedarse sin
`aal2` (no son PII).

**Matiz del alta de un usuario nuevo:** aunque las tablas exijan `aal2`, un usuario recién creado igual
puede entrar en `aal1` e **inscribir su factor**, porque `mfa.enroll` es una llamada a la **API de
Auth, no pasa por la RLS de las tablas**. Es decir: puede autenticarse pero **no ve ningún dato** hasta
verificar. Ese es el forzado total, sin dejar a nadie sin poder inscribirse.

---

## 6. Reset del factor (dispositivo perdido) — RUNBOOK

### 6.0 La restricción que lo define

Borrar un factor TOTP requiere privilegios elevados (`service_role` / rol admin de Postgres). Como
SATAG es **estático** y no puede exponer `service_role`, **el reset no es un botón del panel**: es una
acción **fuera de banda** en la consola de Supabase, ejecutada por una persona designada.

### 6.1 Prevención (para que casi nunca haga falta)

TOTP no es un dispositivo: es un **secreto**. La pantalla de alta muestra, junto al QR, el **secreto en
texto**. La UX debe instruir a la persona a:

1. Escanear el QR **y además** guardar el secreto en su **gestor de contraseñas** (que también genera
   TOTP), **o**
2. Registrarlo en **dos dispositivos/apps** (teléfono + respaldo).

Así "perdí el teléfono" se resuelve solo, sin intervención del admin. Debe cubrir la mayoría de los
casos.

### 6.2 Reset por el admin — Método 1: Dashboard (recomendado)

1. Supabase → **Authentication → Users**.
2. Buscar al usuario por su correo institucional.
3. Ficha del usuario → sección **Multi-Factor Authentication** → **Remove / Unenroll** el factor.

### 6.3 Reset por el admin — Método 2: SQL Editor (auditable)

Borrado por correo (sin copiar UUIDs). Los retos pendientes (`auth.mfa_challenges`) caen en cascada:

```sql
-- Borra el/los factores MFA de una persona, buscándola por su correo.
delete from auth.mfa_factors
where user_id = (select id from auth.users where email = 'persona@iaq.edu.mx');
```

En el siguiente login la persona entra en `aal1` sin factor y, por la RLS estricta, **no ve datos hasta
inscribir un factor nuevo**. El candado la fuerza a re-enrolar.

### 6.4 Perdido ≠ robado

Borrar el factor **no cierra** una sesión ya abierta en el dispositivo perdido. Si fue **robado /
comprometido**, además hay que **revocar sesiones**:

- **Dashboard:** ficha del usuario → **"Sign out user"**.
- **SQL:**
  ```sql
  delete from auth.sessions
  where user_id = (select id from auth.users where email = 'persona@iaq.edu.mx');
  ```

**Regla:** extraviado → solo borrar factor · robado/comprometido → borrar factor **y** revocar sesiones.

### 6.5 Gobernanza

El reset es poder para **secuestrar** una cuenta. Por eso:

1. **Quién:** solo la persona designada (recomendado: **jefe de Sistemas**). Su cuenta de Supabase debe
   tener **MFA propio** y acceso limitado a la consola.
2. **Verificación de identidad:** ejecutar el reset **solo** tras confirmar que quien lo pide es la
   persona (presencial o canal oficial verificable). Evita ingeniería social.
3. **Bitácora:** registrar **quién, a quién, cuándo y por qué**. El borrado por SQL no deja rastro de
   negocio por sí solo.

### 6.6 Qué vive el usuario tras el reset

Login (contraseña) → `aal1`, sin factor → pantalla de alta (QR) → verifica → `aal2` → panel. Idéntico a
un usuario nuevo.

---

## 7. Opción futura (no en este MVP): reset dentro del panel

Un botón "resetear MFA de X" en SATAG solo es seguro con una **Edge Function** de Supabase (servidor,
guarda ahí el `service_role`) que: (1) verifique que **quien llama es admin real** (con
`app_metadata.rol`, no el rol auto-seleccionable), y (2) llame a `auth.admin.mfa.deleteFactor(...)`.
Agrega superficie y depende de endurecer antes el rol admin. El runbook de consola (§6) cubre la
necesidad real hoy.

---

## 8. Prerrequisitos y gotchas

- **Habilitar TOTP** en Supabase Dashboard → **Authentication → MFA** (si no, `enroll` falla).
- **Factores no verificados huérfanos:** si alguien abre el QR y abandona, queda un factor sin
  verificar; conviene limpiarlo (`unenroll`) al reintentar.
- **QR sin dependencias externas:** `enroll` devuelve el QR como SVG/data-URL; se pinta inline, sin
  llamar a ningún servicio externo (compatible con export estático / CSP).
- **Recuperación de contraseña** (`/reset-password`): tras resetear, la sesión es `aal1`; si la persona ya
  tenía factor, se le pedirá el código. Cuidar que esa pantalla no lea PII antes de `aal2`.
- **Rol ≠ permisos:** MFA endurece *quién entra*, no *qué puede hacer cada rol*. Limitar `consulta` a
  solo lectura es RLS por `app_metadata.rol` — trabajo **hermano pero separado** de MFA.

---

## 9. Orden de implementación

1. **(d)** Habilitar TOTP en el Dashboard + prueba de humo de `enroll`/`verify`.
2. **(a)** Helpers de MFA en `lib/supabase/auth.ts` + gate/pantallas en el panel.
3. **(b)** RLS estricta `aal2` en las tablas PII (paso **irreversible en experiencia** para los usuarios
   ya creados; va al final, con todos ya inscritos).

> Referencias: `lib/supabase/auth.ts`, `app/admin/page.tsx`, `supabase/sql/13_rls_registros.sql`,
> `supabase/sql/17_rls_alta.sql`, `Desarrollo/04 - Seguridad, RLS y Privacidad.md`.
