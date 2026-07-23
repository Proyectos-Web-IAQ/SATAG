# Guia de Sesiones y Ruta Operativa - SATAG

> **Ultima actualizacion:** 20/07/2026.
> **Horario real de trabajo:** 09:00 a 14:00.
> **Uso:** abrir este documento al inicio de cada sesion para saber que revisar, que cerrar y con que continuar.

## 1. Regla de arranque de cada sesion

Al iniciar una sesion de trabajo:

1. Revisar el estado en `README.md`.
2. Revisar este documento.
3. Confirmar la tarea activa del cronograma.
4. Trabajar solo el siguiente bloqueo real segun la prioridad de la seccion 2.
5. Al cerrar, dejar anotado que se termino, que falta y cual es el siguiente paso.

## 2. Prioridad actual

El nucleo del sistema ya esta **en produccion**: autoservicio con firma reforzada, panel Admin/TI con roles finos y MFA, cobro con folios de recibo automaticos, buzon de notas SC-003 y apartar/usar TAG (bloques SQL `00`->`42`, deploy en Vercel desde `main`).

El **corte de caja / finanzas** (bloque 42 + pestana Finanzas) ya esta implementado: Admin ve la caja
actual y lo vendido, cierra el corte conciliando el efectivo contado, y cada corte queda inmutable con
la identidad de quien lo hizo.

La prioridad inmediata es el **cierre del proyecto:** pruebas formales de privacidad/RLS, manual +
capacitacion y la **aprobacion institucional del aviso de privacidad**. Pendiente menor: el reporte de
registros incompletos (B2).

## 3. Tareas inmediatas

### 3.1 E6 - Cumplimiento legal y privacidad

Estado: borradores listos, pendiente aprobacion institucional.

Archivos:

- `Entregables/E6 - Cumplimiento Legal y Privacidad/E6 - Aviso de Privacidad SATAG.md`
- `Entregables/E6 - Cumplimiento Legal y Privacidad/E6 - Checklist Legal y Privacidad SATAG.md`
- `Desarrollo/04 - Seguridad, RLS y Privacidad.md`

Pendientes por definir con IAQ:

- Responsable ARCO: puede ser una persona o un departamento designado; recomendacion SATAG: Departamento de TI como responsable operativo, con apoyo de Administracion para cambios/pagos y escalamiento a Direccion/Legal.
- Correo ARCO/publicacion: `aviso.privacidad@asuncionqro.edu.mx`.
- Domicilio legal exacto del IAQ para el aviso.
- Plazo de conservacion de registros SATAG.
- Persona que aprueba el aviso antes de publicacion.

Decision registrada:

- El cobro emite un **folio de recibo automatico** (`SATAG-AAAA-######`, bloque 32) y existe **corte de caja** con conciliacion del efectivo (bloque 42). Falta confirmar el tratamiento fiscal/contable con Administracion.

### 3.2 E1 - Modelo de datos + BD  — ✅ en produccion

Aplicado (bloques `00`->`42`): `aviso_versiones` y referencia de version en `aceptaciones`; hash SHA-256 del paquete firmado + trazos vectoriales; gestionante/tutor para menores; tabla `solicitudes` (tipos `actualizacion`/`baja`) + buzon de notas (`nota`); estado `bloqueado`; `tag_apartado`/`tipo_validado`; catalogo de modelos con seed.

Pendiente:

- **Vista de incompletos** (`v_registros_incompletos`, B2): documentada como cambio del 03-jul pero **aun no implementada**.
- Campos de **caja/corte** (`cortes_caja`, `pagos.corte_id`): entran con la feature de corte de caja (ver 3.5). Los folios de recibo ya existen (bloque 32).

### 3.3 E7 - Supabase seguro  — ✅ en produccion

Aplicado y verificado con usuarios reales:

- Esquema aplicado por bloques atomicos (ver runbook `supabase/sql/README.md`, con PASO 0 de roles).
- RLS activa: `anon` no lee PII; el panel exige `aal2` (MFA) + rol.
- Bucket privado `firmas` (subida anon, sin lectura publica).
- Auth + MFA obligatorio para el panel.

Pendiente: documentar region del proyecto y archivar DPA/terminos de Supabase.

### 3.4 E2 - Formulario de autoservicio  — ✅ en produccion

Implementado (`app/registro`): aviso integral con casilla no premarcada, captura de usuario/vehiculo con dropdown marca->modelo, validacion de menor/tutor, reglamento versionado, firma simple reforzada, guardado por RPC `crear_registro` y comprobante. La solicitud de cambio/baja y el buzon de notas sin folio viven en `/solicitudes`.

### 3.5 Corte de caja / finanzas  — ✅ en produccion

Pestana **Finanzas** (admin/super, bloque 42). Sella los pagos por corte (`pagos.corte_id`) contra la
tabla `cortes_caja` inmutable, concilia el efectivo contado vs el esperado y reestablece la caja. El
total se calcula desde lo sellado (no por fecha), con la identidad verificable de quien corta. Sin
fondo de cambio ni deshacer; una correccion se documenta en el corte siguiente.

## 4. Respuestas operativas sobre ARCO

### Que significa ARCO

ARCO significa:

- **Acceso:** entregar al titular su expediente o confirmar que datos se tratan.
- **Rectificacion:** corregir datos incompletos, incorrectos o desactualizados.
- **Cancelacion:** bloquear/cancelar datos cuando proceda y suprimirlos al terminar la finalidad/plazo aplicable.
- **Oposicion:** permitir que el titular se oponga a ciertos tratamientos cuando proceda.

En SATAG, ARCO no significa que todo deba estar 100% automatizado desde el primer dia. Para el MVP basta que el sistema permita ejecutar y documentar esas acciones de forma controlada desde el panel o mediante procedimiento interno.

### Quien puede ser responsable ARCO

Puede designarse una persona o un departamento. Para SATAG se recomienda:

- **Responsable institucional publicado en aviso:** Departamento de TI del IAQ o area institucional de datos personales que Direccion designe.
- **Responsable operativo de sistema:** TI, por acceso tecnico a SATAG, exportaciones, bloqueo/supresion y seguridad.
- **Apoyo operativo:** Administracion, para datos de pago, asignacion, tipo de usuario, cambios administrativos y validacion de solicitudes.
- **Escalamiento:** Direccion/Legal para solicitudes dudosas, negativas, menores, conflictos o requerimientos de autoridad.

El aviso debe publicar un canal claro y unico. Internamente pueden participar TI y Administracion, pero hacia el titular debe existir un responsable/canal oficial.

### Correo ARCO

Debe ser un correo institucional del responsable o departamento, no necesariamente de una persona individual. Para SATAG queda definido:

- `aviso.privacidad@asuncionqro.edu.mx`

La mejor practica es usar un alias o buzon departamental para que no dependa de una persona que pueda cambiar de puesto.

## 5. Criterios recomendados

### Conservacion de registros SATAG

Recomendacion para proponer a Direccion/Legal:

- Conservar mientras el TAG este vigente.
- Al dar de baja el TAG, pasar el expediente a estado bloqueado: no se usa para operacion diaria, solo para aclaraciones, responsabilidades, seguridad o cumplimiento.
- Conservar bloqueado por **6 anos** despues de la baja o cierre de la relacion relacionada con el TAG, salvo que Legal indique otro plazo.
- Despues del plazo, suprimir o disociar datos personales y eliminar firmas cuando ya no haya finalidad.

Razon: 6 anos es un plazo conservador para evidencias administrativas/contractuales y evita conservar indefinidamente datos de alumnos o familias.

### Aprobacion del aviso

Debe aprobarlo quien tenga autoridad institucional para comprometer al IAQ. Recomendacion:

- Direccion o representante autorizado del IAQ.
- Validacion tecnica de TI.
- Validacion operativa de Administracion.
- Validacion legal si el IAQ cuenta con asesor o area legal.

Gerardo/TI puede preparar el borrador, pero no debe publicarlo como definitivo sin aprobacion institucional.

## 6. Orden de entregables

| Entregable | Estado actual | Continuacion |
|---|---|---|
| E1 Modelo de datos + BD | ✅ En produccion (bloques `00`->`42`) | Falta vista de incompletos; los campos de corte de caja entran con E3 |
| E6 Cumplimiento legal y privacidad | 🟡 Implementado; aprobacion pendiente | Aprobacion institucional del aviso + pendientes ARCO/conservacion |
| E7 Infraestructura y Supabase seguro | ✅ En produccion | Documentar region + archivar DPA |
| E2 Formulario de autoservicio | ✅ En produccion | — |
| E5 Panel administrativo | ✅ En produccion (roles finos + MFA) | Reporte de incompletos pendiente |
| E4 Instalacion TI | ✅ En produccion | — |
| E3 Administracion/cobro | ✅ En produccion (cobro + folios + corte de caja) | — |
| E8 Manual/capacitacion | ⚪ Pendiente | Elaborar despues de pruebas |

## 7. Cierre de sesion

Antes de terminar cada dia:

- Actualizar checklist del `README.md` si una tarea quedo cerrada.
- Anotar decisiones nuevas en este documento o en la bitacora de cambios.
- Confirmar siguiente tarea concreta.
- Subir cambios relevantes a GitHub si se necesita revisar fuera del equipo local.
