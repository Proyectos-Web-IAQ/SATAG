# Playbook Técnico — Reuso de SEVAD para SATAG

> **Investigación de soporte** · alimenta la arquitectura del **Doc 2 (Alcance/WBS/Cronograma)**.
> Fuente: proyecto interno previo **SEVAD** (`..\SEVAD`). Objetivo: reutilizar su infraestructura
> probada (estático + Supabase + GoDaddy/Cloudflare + GitHub Action) para reducir riesgo y tiempo.

**Nivel de confianza de cada dato:**
- ✅ **Verificado en código** (leído directo del repo de SEVAD).
- 📄 **De la documentación** de SEVAD (`docs/tecnico/`), fiable pero conviene revisar el doc.
- ⚠️ **Confirmar en vivo** (valores de infraestructura que dependen del cPanel/Cloudflare de la escuela).

---

## 1. Arquitectura end-to-end

```
                         (DNS + proxy + SSL)        (hosting estático)
  Usuario ──HTTPS──►  Cloudflare  ──►  GoDaddy cPanel  ──►  App Next.js exportada (out/)
                                                                 │
                                                                 │  llamadas JS desde el navegador
                                                                 ▼
                                                        Supabase (Postgres + API + RLS)
                                                        · datos, auth del panel admin
```

- **No hay servidor propio.** El front es 100% estático; toda la lógica de datos vive en Supabase,
  al que el navegador llama directo con la llave pública (protegida por RLS).
- Cloudflare entrega el certificado SSL válido aunque el origen (GoDaddy) no lo tenga (modo **Full**).

---

## 2. Stack confirmado ✅ (reutilizable tal cual)

| Capa | Tecnología (versión SEVAD) |
|---|---|
| Front | **Next.js 16** + **React 19** + **TypeScript 5.8** |
| Export | `output: "export"` → sitio estático en `out/`; `trailingSlash: true` |
| Datos | **Supabase** (`@supabase/supabase-js` ^2.108) — Postgres + API + **RLS** |
| Gráficas (si aplican) | `d3-array`, `d3-scale` |
| Node CI | Node 20, `npm ci` |

`lib/supabase.ts` (patrón exacto a reusar): cliente de navegador con
`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (llave *publishable*, segura de
exponer porque **RLS** hace la protección real).

---

## 3. Pipeline de despliegue ✅ (de `deploy.yml` real de SEVAD)

Push a `main` → GitHub Action:
1. `actions/checkout@v4`
2. `actions/setup-node@v4` (Node 20, cache npm)
3. `npm ci`
4. `npm run build` (con las 2 llaves de Supabase inyectadas como env)
5. `SamKirkland/FTP-Deploy-Action@v4.3.5` → sube `./out/` por **FTPS (puerto 21)** a cPanel

Detalles reales del workflow de SEVAD:
- `paths-ignore`: `docs/**`, `supabase/**`, `qr/**`, `scripts/**`, `**.md` → cambios de doc **no**
  redepliegan.
- `concurrency: cancel-in-progress` → evita despliegues solapados.
- `server-dir: ./` asume una **cuenta FTP cuya raíz ES la carpeta del subdominio** (recomendado).

**GitHub Secrets requeridos** (mismos nombres para SATAG, valores nuevos):
`FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

**`.htaccess` real ✅:** solo un bloque `mod_headers` que pone el **HTML en `no-cache,
must-revalidate`** (para que el visitante recurrente reciba siempre la última versión). Los assets
`/_next/static/*` llevan hash en el nombre, así que se renuevan solos. *(No hace falta regla de
rewrite: `trailingSlash:true` genera `/admin/index.html` en build.)*

---

## 4. Setup de subdominio (GoDaddy + Cloudflare) 📄 — lo más reutilizable

Procedimiento documentado en `SEVAD/docs/tecnico/05-hosting-godaddy.md`. Para SATAG, replicar con el
subdominio nuevo (p. ej. **`satag.asuncionqro.edu.mx`**):

1. **cPanel (GoDaddy) → Subdomains:** crear `satag` bajo `asuncionqro.edu.mx`. cPanel crea la carpeta
   `public_html/satag.asuncionqro.edu.mx/`.
2. **IP de origen** ⚠️: tomar la *Shared IP Address* del cPanel (SEVAD reportó `208.109.203.174`,
   **confirmar la vigente**).
3. **Cloudflare → DNS:** registro **A**, name `satag`, apuntando a esa IP, **Proxied (nube naranja)**.
4. **Cloudflare → SSL/TLS:** modo **Full** (acepta el cert del origen), TLS mínimo 1.2.
5. **cPanel → FTP Accounts:** cuenta dedicada `deploy-satag@…` con **directorio raíz = la carpeta del
   subdominio** (para que `server-dir: ./` funcione). Contraseña fuerte.
6. **Host FTPS** ⚠️: el que muestre cPanel (SEVAD reportó `p3plz…secureserver.net`, **confirmar**).
7. Cargar `FTP_SERVER/USERNAME/PASSWORD` + llaves Supabase como **GitHub Secrets**.
8. Verificar: `curl -I https://satag.asuncionqro.edu.mx/` → 200; `/admin/` → 200.

> **Gotcha 📄:** si se sube por ZIP manual da **403** por permisos; el deploy por FTP (Action) aplica
> permisos correctos. Con recarga de `/admin` daba **404** hasta poner `trailingSlash:true`.

---

## 5. Patrón de datos Supabase + RLS ⚠️ REENCUADRE

El **patrón** de SEVAD se reutiliza; el **esquema NO** (SEVAD son encuestas anónimas; SATAG es un
**registro con datos personales**). Diferencia crítica y a favor de nuestros riesgos RA1/RA2:

**Patrón reutilizable (✅ del `schema.sql` de SEVAD):**
- **RLS por rol:** público (`anon`) solo puede **INSERTAR** su registro y **LEER** catálogos públicos
  (aquí: el reglamento vigente); **nunca** leer registros de otros. Admin autenticado
  (Supabase Auth) lee/edita todo.
- **RPC `SECURITY DEFINER`** (como `submit_survey()`): un solo procedimiento atómico valida e inserta
  el registro + sus relaciones, y registra errores en `error_logs` sin exponer datos.
- **Convenciones:** claves `uuid`, `created_at timestamptz`, catálogos con `slug/code` estables,
  versionado (nunca borrar; marcar `retired`/`inactive`) → histórico comparable.

**Esquema NUEVO para SATAG (a diseñar en el Doc 2 — borrador):**
- `usuarios` (nombre, tipo: padre/empleado/alumno-prepa, contacto) — **PII**
- `vehiculos` (marca, modelo, color, **placas**) → FK a usuario — **PII**
- `tags` (no_dispositivo, estado: activo/inactivo/repuesto) — una reposición inactiva la anterior
  (cláusula del reglamento)
- `estacionamientos` (1, 2, …)
- `asignaciones` (usuario/vehículo ↔ tag ↔ estacionamiento, fecha)
- `aceptaciones_reglamento` (usuario, **versión del reglamento**, fecha/hora, evidencia) → RA2
- `reglamento_versiones` (texto de las 22 cláusulas, versión, vigencia)

> **Diferencia clave vs SEVAD:** SATAG guarda **datos personales**. Por eso el modo autoservicio debe
> permitir **insertar sin poder leer** lo de otros (RLS estricta), y el **aviso de privacidad
> (LFPDPPP)** es obligatorio (RA1). El modo ventanilla inserta autenticado como admin.

---

## 6. Autenticación y panel admin 📄

- **Supabase Auth** (email + password) protege `/admin`. Sin sesión → formulario de login; con sesión
  → dashboard. Chequeo con `supabase.auth.getSession()` en `useEffect`.
- **Config Supabase → Auth → URL Configuration:** `Site URL` y `Redirect URLs` deben incluir el
  subdominio de SATAG y `http://localhost:3000/admin/`.
- **Reset de contraseña self-service:** `resetPasswordForEmail(...)` → correo → evento
  `PASSWORD_RECOVERY` → `updateUser({password})`. Requiere **SMTP** (SEVAD usó Gmail `smtp.gmail.com`
  :465 con *contraseña de aplicación* de Google, 2FA on).

---

## 7. Flujo de Git y secretos 📄

- Ramas: `main` = producción (deploy automático). Trabajo en `feature/*` → PR → merge a `main`.
- Commits **pequeños y descriptivos** (en español). *(Recordatorio del proyecto: sin rastro de IA.)*
- `.gitignore`: `node_modules/`, `.next/`, `out/`, `.env*`, `*.tsbuildinfo`, PDFs/QR generados.
- **Secretos:** `.env.local` (local, no se versiona) + **GitHub Secrets** (CI). Nunca en el repo.

---

## 8. Estructura de documentación a replicar 📄

SEVAD organiza `docs/` así (buena plantilla para SATAG, más allá del Plan de Dirección PMBOK):

| Carpeta | Audiencia | Para qué |
|---|---|---|
| `producto/` | Dirección / PO | visión, usuarios y roles, decisiones, alcance |
| `mvp/` | PO / Dev | alcance MVP, historias de usuario, backlog |
| `ux/` | Diseño | flujo, pantallas, identidad visual aplicada |
| `tecnico/` | Dev / DevOps | arquitectura, guía de código, **hosting**, modelo de datos, git |
| `manual/` | Operador no técnico | cómo usar el sistema (HTML/PDF imprimible) |

---

## 9. Qué reusar tal cual vs. qué es nuevo en SATAG

**Reutilizable casi sin cambios ✅:** stack, `output:export`/`trailingSlash`, pipeline GitHub Action
→ FTPS, patrón `.htaccess`, cliente Supabase, patrón RLS público-insert/admin-read, RPC atómico,
Supabase Auth para `/admin`, estructura de carpetas y de `docs/`.

**Nuevo / a diseñar 🆕:** subdominio + proyecto Supabase + Secrets propios; **esquema de datos**
(usuarios/vehículos/tags/estacionamientos/aceptaciones); UI del formulario (reglamento de 22
cláusulas + captura + aceptación); panel admin orientado a **búsqueda de registros y control de
TAGs/cajones** (no dashboards de encuesta); **aviso de privacidad** y mecanismo de **aceptación con
valor probatorio**; identidad visual del IAQ.

---

## 10. Checklist de clonado SEVAD → SATAG (resumen)

- [ ] Subdominio `satag.asuncionqro.edu.mx` (cPanel) + registro A proxied (Cloudflare) + cuenta FTP
- [ ] Proyecto Supabase nuevo → URL + llave publishable → GitHub Secrets (+ FTP secrets)
- [ ] Copiar estructura (`app/`, `lib/`, `supabase/`, `docs/`) y `deploy.yml` (ajustar subdominio)
- [ ] **Diseñar `schema.sql` NUEVO** (registro de TAG) con RLS estricta para PII
- [ ] Formulario (reglamento + datos + aceptación) y panel admin (búsqueda + control de TAGs)
- [ ] Aviso de privacidad (LFPDPPP) y registro de aceptación con sello de tiempo
- [ ] Primer push → verificar deploy y `/admin/` login

---

*Referencias en `..\SEVAD`: `docs/tecnico/05-hosting-godaddy.md` (subdominio),
`docs/tecnico/06-diseno-base-datos.md` (modelo/RLS), `supabase/schema.sql` (DDL+RLS+RPC),
`.github/workflows/deploy.yml`, `next.config.mjs`, `docs/tecnico/13-reset-contrasena-admin.md`.*
