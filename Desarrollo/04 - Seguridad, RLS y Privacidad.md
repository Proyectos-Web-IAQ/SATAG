# Seguridad, RLS y Privacidad - SATAG

> **Estado:** implementado y en produccion; pendiente la validacion final de Direccion/Legal.
> **Ultima actualizacion:** 20/07/2026.
> **Fuente:** Investigacion legal SATAG del 03/07/2026.
> **Uso:** reglas obligatorias para desarrollo; no sustituye la validacion final de Direccion/Legal del IAQ.

## 1. Objetivo

Este documento traduce la definicion legal y de privacidad de SATAG a reglas tecnicas verificables para el MVP. El sistema debe poder operar sin exponer datos personales, conservar evidencia de aceptacion del reglamento y soportar solicitudes basicas ARCO/cambio/baja.

SATAG trata datos personales ordinarios: nombre, tipo de usuario, datos vehiculares, placas, firma manuscrita digital, metadatos de aceptacion, pago administrativo del TAG y solicitudes operativas. Las placas y firmas deben tratarse como datos personales cuando permitan identificar o asociar a una persona.

## 2. Inventario de datos personales

| Categoria | Datos | Ubicacion prevista | Regla de privacidad |
|---|---|---|---|
| Identificacion | Nombre del usuario, nombre del gestionante/firmante, tipo de usuario | `registros`, `aceptaciones` | Solo personal autorizado. No visible para `anon`. |
| Vehiculo | Marca, modelo, color, placas, indicador sin placas | `registros` | Placas protegidas por RLS; evitar listados publicos. |
| Firma | Imagen PNG, trazos vectoriales, firmante, sello de tiempo | Storage privado `firmas`, `aceptaciones` | Nunca URL publica permanente. La lectura de `aceptaciones` esta restringida a `admin`/`super`. Hoy el panel **no** muestra la firma; cuando lo haga debera usar URL firmada temporal. |
| Evidencia | Version de reglamento, version de aviso, hash SHA-256 generado en BD, paquete firmado, bitacora | `aceptaciones`, `movimientos` | Inmutable despues de firmar. |
| Pago | Monto, metodo efectivo, fecha, cobrado por, folio de recibo, sello de corte | `pagos` | Dato administrativo. Folio de recibo **automatico e inmutable**; `cobrado_por`/`cobrado_por_uid` es PII indirecta del personal. Al cortarse queda congelado (`corte_id`, bloque 42). |
| Corte de caja | Total esperado, efectivo contado, diferencia, quien corto (identidad del JWT), observaciones | `cortes_caja` | Documento contable inmutable; lectura solo admin/super. Concilia el efectivo fisico contra lo cobrado. |
| Solicitudes | Solicitudes de `actualizacion`/`baja` identificadas con folio | `solicitudes` | Debe conservar fecha, solicitante, tramite y resolucion (`atendida` + `resolucion`). |
| Buzon de notas (SC-003) | Nombre y rol del solicitante, tramite pedido, alumno y grado, descripcion del vehiculo | `solicitudes` (tipo `nota`) | **Intake publico sin sesion ni verificacion de identidad:** un tercero puede capturar datos de otra persona, incluido un menor (`alumno_nombre`). Debe estar cubierto por el aviso. Sin rate limiting por ahora (riesgo aceptado). |
| Observaciones | Comentarios operativos | `registros.observaciones` | Minimizar; evitar datos sensibles; preferir catalogos. |

## 3. Roles y acceso

Los roles del panel viven en `app_metadata.rol` y son **frontera de seguridad real**: la RLS los exige junto con `aal2`, y cada RPC los vuelve a validar con `panel_exigir_rol`.

| Rol | Uso | Permisos reales |
|---|---|---|
| `anon` / autoservicio | Alta, solicitud y buzon | Leer catalogos y reglamento/aviso vigente; crear registro, solicitud y nota solo por RPC controlada; sin lectura directa de PII. |
| `admin` | Cobro | Leer el padron y **registrar pagos** (`registrar_pago`). Unico rol que cobra. Lee `aceptaciones` (evidencia de firma). |
| `ti` | Ciclo de vida del TAG | Leer el padron; asignar estacionamiento, instalar, actualizar, **dar de baja**, usar el TAG apartado, vincular notas del buzon y descartar solicitudes. |
| `consulta` | Solo lectura | Lee padron, pagos, solicitudes y movimientos. No ejecuta ningun RPC de escritura y **no** lee `aceptaciones`. |
| `super` | Soporte y pruebas integrales | Pasa todas las guardias de `panel_exigir_rol`; uso controlado. |
| `service_role` (fuera de la app) | Configuracion y auditoria | Asignar roles en `app_metadata`, resetear MFA, gestionar Storage y respaldos. Nunca desde el front. |

> Nota: **dar de baja es de `ti`**, no de Administracion. Administracion solo cobra.

Regla base: ninguna tabla con datos personales (`registros`, `aceptaciones`, `pagos`, `movimientos`, `solicitudes`) debe ser legible por `anon`. Las escrituras publicas del formulario deben pasar por una RPC con validacion y transaccion atomica.

## 4. Reglas RLS y Supabase

- Activar RLS en todas las tablas del esquema publico, incluidos catalogos, expedientes, pagos, aceptaciones, movimientos, solicitudes y logs.
- Permitir a `anon` solo `select` de catalogos necesarios y del reglamento/aviso vigente.
- Negar a `anon` lectura directa de registros, firmas, pagos, movimientos y solicitudes.
- Usar RPC `crear_registro` o equivalente para alta de autoservicio; la RPC debe crear registro, aceptacion, evidencia y movimiento inicial en una sola transaccion.
- **Rutas publicas de escritura (son tres, todas sin sesion):** `crear_registro` (alta), `crear_solicitud` (exige folio + placas o No. de TAG) y `crear_nota_solicitud` (buzon sin folio). Ninguna revela datos del expediente: responden sin confirmar si una persona existe. Las dos ultimas capturan PII de terceros sin verificar identidad; queda pendiente agregarles rate limiting/CAPTCHA.
- Mantener separados los permisos de Administracion, TI y Consulta mediante `app_metadata.rol` y guardias dentro de cada RPC.
- Exigir MFA (`aal2`) a todas las cuentas del panel antes de operar.
- Usar backups y bitacoras para reconstruir incidentes y generar lista de titulares afectados.

**Estado de implementacion (Auth del panel, 10-jul-2026):** el panel `/admin` ya usa **Supabase Auth** (correo + contrasena) con sesion persistente en el navegador y recuperacion de contrasena por correo (`/admin/reset-password`). El personal autenticado obtiene el rol `authenticated`. El alta de cuentas es manual desde el dashboard (sin registro publico). Pasos operativos y allowlist de Redirect URLs: [`supabase/README.md`](../supabase/README.md#auth-del-panel-administrativo).

**Roles del panel (actualizado 15-jul-2026):** la fuente de verdad es exclusivamente `app_metadata.rol`, asignada por un administrador; `user_metadata` no participa en autorización. `admin` registra pagos, `ti` asigna estacionamiento e instala/actualiza/da de baja, `consulta` solo lee y `super` permite pruebas integrales controladas. Las RLS exigen `aal2` + rol para leer y las escrituras del expediente pasan por RPC `SECURITY DEFINER` que vuelve a validar el rol. Un usuario sin rol no lee el expediente ni entra al panel operativo. SQL y runbook: [`supabase/README.md`](../supabase/README.md).

## 5. Storage privado de firmas

- El bucket `firmas` debe ser privado.
- El sistema debe guardar rutas internas, no URLs publicas.
- La visualizacion de firmas en panel debe usar URLs firmadas temporales.
- No se deben servir firmas por assets estaticos, CDN publico ni rutas del front.
- Limitar tamano y tipo de archivo: el bucket admite solo `image/png` e `image/jpeg`, con maximo 2 MB. Los **trazos vectoriales no van al bucket**: viven en `aceptaciones.firma_trazos` (jsonb) dentro de Postgres.
- Los trazos vectoriales se usan solo como evidencia de firma, nunca para identificacion biometrica automatizada.

## 6. Firma simple reforzada

La aceptacion del reglamento y del aviso debe conservar un expediente tecnico de firma con:

- Imagen de firma manuscrita digital.
- Trazos vectoriales cuando el modulo los capture.
- Nombre del firmante.
- Rol del firmante: usuario o gestionante padre/madre/tutor.
- Version exacta del reglamento firmado.
- Version exacta del aviso de privacidad aceptado.
- Hash SHA-256 generado por la base sobre el paquete firmado: reglamento, aviso, datos minimos de firmante, timestamp y versiones.
- Paquete canonico firmado (`hash_payload`) para poder auditar que se hasheo exactamente.
- Sello de tiempo UTC de base de datos.
- Bitacora del evento de aceptacion.
- IP/user-agent cuando sea viable y proporcional.

La firma no debe depender solo de la imagen PNG. La fuerza probatoria viene del conjunto: identidad declarada, version del documento, hash, timestamp, bitacora y resguardo privado.

## 7. Aviso de privacidad y textos del formulario

Antes de capturar datos, el formulario debe mostrar:

- Aviso simplificado SATAG.
- Enlace al aviso integral.
- Finalidades primarias del tratamiento.
- Datos personales principales que se recaban.
- Identidad del responsable.
- Casilla no premarcada de lectura/aceptacion.

Al firmar, el sistema debe asociar el registro con la version vigente del aviso y del reglamento. Si cambia el aviso o reglamento, debe crearse una nueva version y conservar la anterior para evidencia historica.

## 8. Menores de edad

Regla obligatoria: si el usuario del TAG es alumno menor de 18 anos, la aceptacion del reglamento y del aviso debe firmarla padre, madre o tutor como gestionante.

Implementacion minima:

- Capturar si el usuario es alumno.
- Capturar si el firmante es el propio usuario o un gestionante.
- Para alumno menor de edad, exigir `gestionante_nombre` y rol `padre/madre/tutor`.
- Mostrar texto claro: el menor puede ser usuario del beneficio vehicular, pero el consentimiento y aceptacion los otorga su representante.
- Bloquear el avance si falta gestionante cuando aplique.

## 9. ARCO, revocacion, cambio y baja

SATAG debe soportar, al menos de forma operativa en panel o proceso documentado:

| Derecho/proceso | Soporte minimo |
|---|---|
| Acceso | Exportar expediente del titular: datos capturados, vehiculo, firma/evidencia, aviso y reglamento aceptados, pagos, movimientos y solicitudes. |
| Rectificacion | Editar datos corregibles con bitacora, motivo y responsable de cambio. |
| Cancelacion | Pasar a estado bloqueado/cancelado cuando proceda; conservar evidencia necesaria durante plazo de responsabilidades. |
| Oposicion | Registrar solicitud, resolver procedencia y limitar tratamiento no necesario. |
| Revocacion | Registrar solicitud; no es retroactiva; puede detonar baja/cancelacion si ya no hay finalidad vigente. |
| Cambio/baja de TAG | Solicitud formal con fecha, solicitante, motivo, estado, resolucion y movimiento asociado. |

El aviso debe indicar el canal institucional ARCO. Hasta que el IAQ confirme un correo/persona responsable, usar marcador pendiente y no publicar como definitivo.

## 10. Conservacion y supresion

Criterio minimo para MVP, pendiente de aprobacion institucional:

- Conservar expediente mientras el TAG este vigente.
- Al dar de baja, bloquear el registro para usos ordinarios y conservar solo lo necesario para responsabilidades administrativas, legales o contables.
- Al agotarse la finalidad y plazo de conservacion aprobado, suprimir o disociar datos personales y eliminar firmas del bucket privado.
- No conservar datos de menores indefinidamente "por si acaso".
- Definir plazo concreto con Direccion/Legal; recomendacion practica: vigencia del TAG + plazo de prescripcion de responsabilidades aplicable.

## 11. Nube, encargados y transferencias

SATAG usa Supabase como proveedor cloud/encargado tecnologico. Antes de produccion se debe:

- Confirmar region del proyecto Supabase.
- Firmar o conservar DPA/terminos aplicables de Supabase.
- Archivar evidencia de controles del proveedor: cifrado, TLS, certificaciones disponibles y subprocesadores.
- Declarar en aviso integral el uso de encargados tecnologicos/nube, incluyendo infraestructura en EE.UU. si aplica.
- Distinguir remision a encargado de transferencia a terceros. No compartir datos con terceros externos al IAQ sin validacion del aviso y base legal.

Cloudflare/GoDaddy no deben procesar datos personales del sistema si el front es estatico y el navegador habla directo con Supabase. Si se usa proxy/custom domain para API con datos personales, revisar DPA correspondiente.

## 12. Requisitos de desarrollo

- Agregar versionado de aviso de privacidad (`aviso_versiones` o campo equivalente en `aceptaciones`).
- Generar en base de datos el hash SHA-256 del paquete firmado; el cliente no debe mandar el hash legal principal.
- Guardar `hash_payload` para auditoria y verificacion posterior.
- Guardar trazos vectoriales de firma si el componente los captura.
- Registrar bitacora de aceptacion y cambios administrativos.
- Implementar validacion de menor/gestionante.
- Evitar campo libre de observaciones sin instruccion; limitar longitud y advertir no capturar salud, discapacidad u otros datos sensibles.
- Implementar export de expediente para acceso ARCO.
- Implementar estado de bloqueo/cancelacion y no solo borrado fisico inmediato.
- Probar RLS con usuario `anon` y `authenticated`.
- Probar que firmas no sean accesibles por URL publica.

## 13. Pendientes institucionales

| Pendiente | Responsable sugerido | Necesario antes de produccion |
|---|---|---|
| Aprobar aviso integral SATAG/anexo | Direccion/Legal | Si |
| Aprobar aviso simplificado y texto de aceptacion | Direccion/Legal | Si |
| Designar persona/departamento ARCO y correo | Direccion/Administracion | Si |
| Definir plazo de conservacion/bloqueo/supresion | Direccion/Legal/Administracion | Si |
| Confirmar region y DPA Supabase | TI/Direccion | Si |
| Validar reglamento de estacionamiento | Direccion/Legal | Si |
| Confirmar tratamiento contable del cobro de $100 | Administracion | Si |
| Cotizar NOM-151 | Direccion/TI | No, fase 2 |

## 14. Criterio NOM-151

NOM-151 no es requisito del MVP. Para fase 1 se implementa hash interno, versionado y sello de tiempo. NOM-151 queda diferida a fase 2/cotizacion si Direccion desea mayor fuerza probatoria o si se anticipan disputas relevantes.

## 15. Pruebas de aceptacion

- `anon` puede leer catalogos y reglamento/aviso vigente.
- `anon` no puede leer `registros`, `aceptaciones`, `pagos`, `movimientos`, `solicitudes` ni objetos de `firmas`.
- Alta por autoservicio crea expediente, aceptacion y movimiento inicial atomicos.
- Firma queda guardada en Storage privado y solo se visualiza con URL temporal.
- Alumno menor de edad no puede firmar sin gestionante padre/madre/tutor.
- Export ARCO incluye datos, firma/evidencia, pagos, movimientos y solicitudes.
- Cancelacion/baja bloquea tratamiento ordinario y conserva evidencia necesaria.
- Observaciones no admiten captura de datos sensibles sin control.

## 16. Referencias internas

- [Investigacion legal SATAG](../Investigacion/02%20-%20Investigacion%20Legal%20SATAG.md)
- [Aviso y textos legales SATAG](../Entregables/E6%20-%20Cumplimiento%20Legal%20y%20Privacidad/E6%20-%20Aviso%20de%20Privacidad%20SATAG.md)
- [Checklist legal y privacidad](../Entregables/E6%20-%20Cumplimiento%20Legal%20y%20Privacidad/E6%20-%20Checklist%20Legal%20y%20Privacidad%20SATAG.md)
- [Modelo de Datos y Base de Datos](01%20-%20Modelo%20de%20Datos%20y%20Base%20de%20Datos.md)
- [Firma Electronica](06%20-%20Firma%20Electronica%20%28mecanica%20y%20valor%20legal%29.md)
