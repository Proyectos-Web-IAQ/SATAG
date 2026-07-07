# Guia de Sesiones y Ruta Operativa - SATAG

> **Fecha base:** 06/07/2026.
> **Horario real de trabajo:** 09:00 a 14:00.
> **Uso:** abrir este documento al inicio de cada sesion para saber que revisar, que cerrar y con que continuar.

## 1. Regla de arranque de cada sesion

Al iniciar una sesion de trabajo:

1. Revisar el estado en `README.md`.
2. Revisar este documento.
3. Confirmar la tarea activa del cronograma.
4. Trabajar solo el siguiente bloqueo real, no saltar directo al formulario si faltan base de datos, privacidad o Supabase seguro.
5. Al cerrar, dejar anotado que se termino, que falta y cual es el siguiente paso.

## 2. Prioridad actual

La prioridad inmediata es cerrar el puente entre:

- **E6 - Cumplimiento legal y privacidad**
- **E1 - Modelo de datos + BD**
- **E7 - Supabase seguro**

No conviene avanzar fuerte en el formulario hasta que el modelo soporte aviso versionado, firma reforzada, menores, solicitudes de cambio/baja y criterios de conservacion.

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
- Confirmacion de que el cobro de $100 no requiere folio, recibo ni corte especifico por ahora.

Decision registrada:

- El cobro por ahora no requiere folio, recibo ni corte especifico.

### 3.2 E1 - Modelo de datos + BD

Estado: primer corte listo, pero debe alinearse con E6.

Revisar y ajustar si falta:

- Tabla o mecanismo para `aviso_versiones`.
- Referencia de version de aviso en `aceptaciones`.
- Hash SHA-256 del paquete firmado.
- Trazos vectoriales de firma.
- Datos de gestionante/tutor para menores.
- Tabla `solicitudes` para cambio/baja/ARCO operativo.
- Estado de bloqueo/cancelacion, distinto a baja operativa si aplica.
- Campos de caja/cobro si Administracion los pide despues.
- `tag_apartado`, `tipo_validado`, catalogo de modelos y vista de incompletos ya documentados como cambios del 03-jul.

### 3.3 E7 - Supabase seguro

Despues de ajustar E1:

- Aplicar schema en proyecto Supabase.
- Activar/probar RLS.
- Crear bucket privado `firmas`.
- Probar que `anon` no puede leer PII.
- Configurar Auth y MFA para administradores.
- Documentar region del proyecto.
- Archivar DPA/terminos de Supabase.

### 3.4 E2 - Formulario de autoservicio

Iniciar solo cuando E1/E6/E7 esten suficientemente claros.

Orden recomendado:

- Aviso simplificado.
- Captura de usuario/vehiculo.
- Validacion de menor/tutor.
- Reglamento versionado.
- Firma simple reforzada.
- Guardado por RPC.
- Comprobante.
- Solicitud de cambio/baja.

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
| E1 Modelo de datos + BD | Primer corte listo | Ajustar por E6 antes de Supabase real |
| E6 Cumplimiento legal y privacidad | Borrador listo | Revisar, completar pendientes y aprobar |
| E7 Infraestructura y Supabase seguro | Pendiente | Aplicar schema, RLS, Storage, Auth/MFA |
| E2 Formulario de autoservicio | Prototipo listo | Conectar a Supabase cuando E1/E7 esten listos |
| E5 Panel administrativo | Prototipo listo | Conectar busqueda, edicion, ARCO y reportes |
| E4 Instalacion TI | Prototipo listo | Conectar TAG, estado y solicitudes |
| E3 Administracion/cobro | Prototipo listo | Conectar asignacion, pago y caja si aplica |
| E8 Manual/capacitacion | Pendiente | Elaborar despues de pruebas |

## 7. Cierre de sesion

Antes de terminar cada dia:

- Actualizar checklist del `README.md` si una tarea quedo cerrada.
- Anotar decisiones nuevas en este documento o en la bitacora de cambios.
- Confirmar siguiente tarea concreta.
- Subir cambios relevantes a GitHub si se necesita revisar fuera del equipo local.
