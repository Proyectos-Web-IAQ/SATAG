# Runbook · Publicar SATAG en satag.asuncionqro.edu.mx

**Fecha:** 10 de septiembre de 2026. **Responsable:** Gerardo Sánchez (Sistemas).
**Base:** el mismo camino que SEVAD recorrió el 24 de junio de 2026, documentado en `Proyectos WEB/SEVAD/docs/tecnico/05-hosting-godaddy.md`.
**Tiempo estimado:** entre 45 y 90 minutos de trabajo, más la propagación del DNS.

## Buena noticia antes de empezar

El flujo de despliegue **ya está escrito y esperando** en `.github/workflows/deploy.yml`. No hay que programar nada: está inerte por una guarda, y se enciende con una variable de repositorio cuando el resto esté listo. Lo que sigue es configuración en cuatro paneles web.

## Valores que ya se conocen del entorno

| Dato | Valor |
|---|---|
| Usuario de cPanel | `asunqro` |
| IP de origen del hosting | `208.109.203.174` |
| Host FTP | `p3plzcpnl502920.prod.phx3.secureserver.net` |
| Carpeta que crea cPanel | `/home/asunqro/public_html/satag.asuncionqro.edu.mx` |
| DNS | Cloudflare (`brenna` / `harlan.ns.cloudflare.com`) |
| Modo SSL de la zona | «Completo» (Full), ya configurado desde SEVAD |

Confirme la IP en cPanel, barra derecha, «Shared IP Address», por si el hosting cambió de servidor desde junio.

## Paso 1. cPanel: crear el subdominio

1. cPanel de GoDaddy, sección Dominios, **Subdominios**.
2. Subdominio `satag`, dominio `asuncionqro.edu.mx`.
3. La raíz del documento se llena sola como `public_html/satag.asuncionqro.edu.mx`. Déjela así.
4. Crear.

No toque el sitio de la raíz ni los registros de correo. El correo del Instituto vive en Google Workspace y sus registros MX no se tocan nunca.

## Paso 2. cPanel: cuenta FTP dedicada

1. cPanel, sección Archivos, **Cuentas FTP**.
2. Usuario `deploy-satag`, dominio `satag.asuncionqro.edu.mx`. El usuario completo queda `deploy-satag@satag.asuncionqro.edu.mx`.
3. Contraseña larga y generada; guárdela en su gestor.
4. **Directorio: cámbielo a `public_html/satag.asuncionqro.edu.mx`**, no lo deje en la carpeta personal. Así, si esa credencial se filtra, solo alcanza a SATAG.
5. Cuota: sin límite.

## Paso 3. Cloudflare: el registro DNS

1. Cloudflare, zona `asuncionqro.edu.mx`, sección DNS.
2. Agregar registro: tipo **A**, nombre `satag`, dirección IPv4 `208.109.203.174`.
3. **Encienda el proxy, la nube naranja.** Es lo que da el certificado válido: el plan de GoDaddy no tiene AutoSSL disponible.
4. El modo SSL/TLS de la zona ya está en «Completo» desde SEVAD. Solo verifíquelo, no lo cambie: afecta a toda la zona.

## Paso 4. GitHub: secretos y el interruptor

En el repositorio de SATAG, Settings, Secrets and variables, Actions.

**Secretos** (pestaña Secrets):

| Nombre | Valor |
|---|---|
| `FTP_SERVER` | `p3plzcpnl502920.prod.phx3.secureserver.net` |
| `FTP_USERNAME` | `deploy-satag@satag.asuncionqro.edu.mx` |
| `FTP_PASSWORD` | la del paso 2 |
| `NEXT_PUBLIC_SUPABASE_URL` | la de su `.env.local` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | la de su `.env.local` |

**Variable** (pestaña Variables): `DEPLOY_GODADDY` = `true`. Esta es la que enciende el flujo.

No la ponga en `true` hasta terminar los pasos 1 a 3, o el despliegue fallará en rojo.

## Paso 5. Supabase: las direcciones de autenticación

Este paso **SEVAD no lo tuvo** y es el que puede romper algo sin avisar. SATAG manda invitaciones y restablecimiento de contraseña por correo, y esos enlaces apuntan a donde diga la configuración.

Supabase, Authentication, URL Configuration:

- **Site URL**: `https://satag.asuncionqro.edu.mx`
- **Redirect URLs**, agregue las dos:
  - `https://satag.asuncionqro.edu.mx/admin/invite/`
  - `https://satag.asuncionqro.edu.mx/admin/reset-password/`

Ojo con un detalle: el comentario del archivo de despliegue dice `/admin/reset/`, y esa ruta **no existe**. La correcta es `/admin/reset-password/`. Hay que corregir ese comentario para que nadie lo repita.

Deje también las direcciones de Vercel en la lista mientras dure la transición, para no romper una invitación ya enviada.

## Paso 6. Publicar

Desde la pestaña Actions del repositorio, ejecute el flujo «Deploy a GoDaddy (satag)» a mano con «Run workflow». Corre la verificación completa antes de compilar, así que si algo del código está mal, no publica nada.

El primer despliegue de SEVAD tardó unos 44 segundos.

## Paso 7. Comprobar

1. `https://satag.asuncionqro.edu.mx/` abre con candado y sin advertencia.
2. `/registro/` carga el formulario, con el aviso y el reglamento.
3. `/admin/` pide credenciales y el segundo factor.
4. `/solicitudes/` abre el buzón.
5. `/aviso-de-privacidad/` muestra la versión vigente.
6. `/presentacion/` abre la presentación.
7. Los archivos bajo `/_next/` cargan con estilos, no en texto plano. Si el sitio se ve sin diseño, es el problema de permisos que documentó SEVAD, pero el despliegue por FTP no debería provocarlo.

## Paso 8. Lo que hay que actualizar después del cambio de dominio

Esto es lo que se olvida y aparece días después:

- La dirección pública del aviso de privacidad vigente, que se guarda en la base junto con el texto.
- El código QR y los enlaces de la presentación pública, que hoy apuntan a `satag.vercel.app`.
- Los enlaces del comprobante y del buzón, si citan el dominio.
- El arnés de pruebas, que apunta al sitio por una variable de entorno.
- La documentación que cita `satag.vercel.app`.

Pídame la lista exacta con archivo y línea cuando llegue aquí, y le preparo los cambios en un solo lote.

## Si algo sale mal

- **El despliegue falla con error de certificado en el FTP:** cambie `protocol: ftps` por `ftp` en el archivo del flujo.
- **El sitio da error 403 en los archivos de `_next`:** son permisos. Desde la terminal de cPanel, dar 755 a las carpetas y 644 a los archivos dentro de la carpeta del subdominio.
- **El certificado sale inválido:** falta encender la nube naranja en Cloudflare, o el modo SSL de la zona no está en «Completo».
- **Una invitación lleva al dominio viejo:** falta el paso 5, o el correo se envió antes de cambiarlo.
- **Rollback:** apague la variable `DEPLOY_GODADDY` y quite el proxy del registro en Cloudflare. Vercel sigue publicando desde `main` mientras tanto, así que el sitio anterior nunca deja de existir.
