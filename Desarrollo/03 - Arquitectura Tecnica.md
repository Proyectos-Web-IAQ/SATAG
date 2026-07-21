# Arquitectura Técnica — SATAG

> **Estado:** implementada y en producción — documento *as-built*.
> **Última actualización:** 20-jul-2026.

Describe cómo está construido SATAG hoy. El diseño reutiliza la base técnica de SEVAD
(ver [Playbook](../Investigacion/01%20-%20Playbook%20Tecnico%20%28reuso%20de%20SEVAD%29.md)) con una
diferencia importante: **el despliegue no usa el pipeline FTPS de SEVAD, sino Vercel**.

## 1. Stack

| Capa | Tecnología |
|---|---|
| Front | Next.js 16 (App Router) con **exportación estática** (`output: "export"`), React 19, TypeScript 5.8 |
| Datos y backend | Supabase: PostgreSQL con RLS, Auth con MFA TOTP, Storage y RPCs vía PostgREST |
| Cliente | `@supabase/supabase-js` 2.110 |
| Hosting y CI/CD | **Vercel**: cada push a `main` publica en producción |

No hay servidor propio ni API intermedia: el sitio es 100 % estático y habla directo con Supabase.
La lógica sensible vive en la base (RLS + RPCs `SECURITY DEFINER`), no en el cliente.

## 2. Configuración del build

`next.config.mjs`:

- `output: "export"` — genera el sitio estático en `out/`.
- `trailingSlash: true` — rutas con `/` final, para servirse desde cualquier hosting estático.
- `images: { unoptimized: true }` — sin optimizador en servidor (requisito del export).

Consecuencia de diseño: **no hay Server Components con datos, ni Route Handlers, ni middleware**.
Todo lo que consulta datos corre en el cliente (`"use client"`).

## 3. Estructura del código

```
app/
├─ page.tsx                    Inicio
├─ layout.tsx                  Layout raíz
├─ registro/page.tsx           Autoservicio: aviso, captura, reglamento y firma
├─ solicitudes/page.tsx        Público: solicitud con folio + buzón de notas sin folio (SC-003)
└─ admin/
   ├─ page.tsx                 Panel: login, MFA y pestañas según rol
   ├─ invite/page.tsx          Activación de cuenta por invitación (token_hash + verifyOtp)
   └─ reset-password/page.tsx  Recuperación de contraseña

components/
├─ SignaturePad.tsx            Captura de firma en canvas → PNG + trazos, sin dependencias
├─ Loader.tsx · ConfirmDialog.tsx
└─ admin/
   ├─ AdminPanel.tsx           Contenedor del panel y pestañas por rol
   ├─ GateMfa.tsx              Puerta de MFA: bloquea el panel hasta alcanzar aal2
   ├─ VistaAdmin.tsx           Administración: cobro y padrón
   ├─ VistaTi.tsx              TI: estacionamiento, instalar, actualizar, baja y notas
   └─ RegistroCard.tsx · EstadoChip.tsx

lib/
├─ supabase/
│  ├─ client.ts                Cliente público (rol anon, sin persistencia de sesión)
│  ├─ auth.ts                  Sesión del panel, rol (app_metadata.rol) y MFA TOTP
│  ├─ api.ts                   Alta pública: catálogos, documentos, subida de firma, crear_registro
│  └─ apiPanel.ts              RPCs del panel: cobro, instalación, actualización, baja y notas
└─ mock/
   └─ types.ts                 Tipos compartidos del dominio, consumidos por las pantallas
```

> `lib/mock/data.ts` y `lib/mock/api.ts` son **vestigios del prototipo inicial**: ya no se importan en
> ninguna pantalla. La app corre contra Supabase real. Solo `types.ts` sigue en uso, como contrato de
> tipos entre `lib/supabase/*` y los componentes.

## 4. Variables de entorno

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Endpoint del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Llave pública del cliente |

Ambas son **públicas por diseño** (viajan al navegador): lo que protege los datos no es la llave, sino
la RLS y los RPCs `SECURITY DEFINER`. Plantilla en `.env.example`; los valores reales van en
`.env.local` (fuera del repo) y en las variables de entorno de Vercel.

Ninguna llave de servicio (`service_role`) vive en el repo ni en el front. Las operaciones que la
requieren —asignar roles, resetear el MFA de alguien— se hacen a mano en el dashboard de Supabase.

## 5. Despliegue

- **Producción:** Vercel, build automático en cada push a `main` (`main` = producción).
- El export estático de `out/` es portable: puede bajarse por FTPS a GoDaddy y servirse desde el
  subdominio institucional sin cambiar código. Esa migración **no se ha hecho**.
- No existe `.github/workflows/` ni pipeline FTPS: el esquema de despliegue de SEVAD
  (GitHub Actions + FTPS) **no se adoptó** en SATAG.

## 6. Frontera de seguridad

La seguridad no está en el front —es estático y su código es visible—, sino en Supabase:

- **RLS** en todas las tablas; `anon` solo lee catálogos y documentos vigentes.
- **Roles finos** en `app_metadata.rol` (`admin` / `ti` / `consulta` / `super`), validados por la RLS y
  de nuevo por `panel_exigir_rol` dentro de cada RPC.
- **MFA obligatorio** (`aal2`) para cualquier lectura o escritura del panel.
- **Escrituras solo por RPC** `SECURITY DEFINER`: el cliente no tiene `insert`/`update`/`delete`.

Detalle en [`04 - Seguridad, RLS y Privacidad`](04%20-%20Seguridad%2C%20RLS%20y%20Privacidad.md) y
[`07 - MFA`](07%20-%20MFA%20%28Autenticacion%20Multifactor%29.md).

## 7. Módulo de firma (reuso)

El objetivo (rev. Dirección 03-jul, B8) era empaquetar la firma como módulo portátil, reutilizable en
otros sistemas del IAQ. **Aún no se ha extraído:** hoy vive repartida entre
`components/SignaturePad.tsx` (captura en canvas) y `lib/supabase/api.ts` (subida al bucket privado y
hash). La frontera propuesta está en
[`06 - Firma Electrónica`](06%20-%20Firma%20Electronica%20%28mecanica%20y%20valor%20legal%29.md) §9.

## 8. Verificación antes de publicar

Como cada push a `main` despliega a producción, nada se sube sin que esto pase en verde:

```bash
npx tsc --noEmit     # tipos
npm run lint         # eslint
npm run build        # export estático completo
```

## Referencias

- [`Investigacion/01 - Playbook Tecnico (reuso de SEVAD).md`](../Investigacion/01%20-%20Playbook%20Tecnico%20%28reuso%20de%20SEVAD%29.md)
- [`00 - Indice Tecnico.md`](00%20-%20Indice%20Tecnico.md)
- [`../supabase/sql/README.md`](../supabase/sql/README.md) — runbook del esquema aplicado
