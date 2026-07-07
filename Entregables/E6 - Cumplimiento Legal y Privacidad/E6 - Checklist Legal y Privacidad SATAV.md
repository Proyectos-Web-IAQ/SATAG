# Checklist Legal y Privacidad SATAV

> **Fecha:** 06/07/2026.
> **Tarea:** WBS 1.2.3 - Definicion legal y privacidad.
> **Estado:** entregables base listos para revision institucional.

## 1. Objetivos del dia

- [x] Convertir la investigacion legal en textos revisables.
- [x] Crear aviso de privacidad integral SATAV/anexo base.
- [x] Crear aviso simplificado para formulario.
- [x] Crear texto de aceptacion de reglamento, privacidad y firma.
- [x] Definir reglas obligatorias para menores.
- [x] Definir criterios de firma simple reforzada.
- [x] Definir soporte minimo ARCO, revocacion, cambio y baja.
- [x] Definir checklist tecnico de privacidad para desarrollo.
- [x] Separar pendientes de aprobacion institucional.
- [x] Documentar NOM-151 como fase 2/cotizacion, no requisito MVP.

## 2. Entregables generados

| Entregable | Ubicacion | Estado |
|---|---|---|
| Aviso integral SATAV | `Entregables/E6 - Cumplimiento Legal y Privacidad/E6 - Aviso de Privacidad SATAV.md` | Borrador revisable |
| Aviso simplificado | `Entregables/E6 - Cumplimiento Legal y Privacidad/E6 - Aviso de Privacidad SATAV.md` | Borrador revisable |
| Texto de aceptacion y firma | `Entregables/E6 - Cumplimiento Legal y Privacidad/E6 - Aviso de Privacidad SATAV.md` | Borrador revisable |
| Reglas tecnicas de privacidad | `Desarrollo/04 - Seguridad, RLS y Privacidad.md` | Primer corte implementable |
| Checklist legal/privacidad | Este documento | Listo |

## 3. Checklist para desarrollo

### Aviso y consentimiento

- [ ] Mostrar aviso simplificado antes de capturar datos.
- [ ] Enlazar aviso integral SATAV.
- [ ] Usar casilla no premarcada de aceptacion.
- [ ] Guardar version exacta del aviso aceptado.
- [ ] Guardar version exacta del reglamento firmado.
- [ ] Bloquear avance si no hay aceptacion.

### Menores de edad

- [ ] Capturar si el usuario del TAG es alumno.
- [ ] Capturar si el firmante es gestionante.
- [ ] Exigir padre/madre/tutor si el usuario es menor de edad.
- [ ] Guardar nombre del gestionante firmante.
- [ ] Mostrar texto especifico para representante de menor.

### Firma reforzada

- [ ] Guardar imagen PNG de la firma.
- [ ] Guardar trazos vectoriales si el componente los captura.
- [ ] Guardar firmante, rol, fecha/hora UTC y version de documentos.
- [ ] Calcular hash SHA-256 del paquete firmado.
- [ ] Registrar bitacora de aceptacion.
- [ ] Guardar firma en bucket privado, no publico.
- [ ] Visualizar firma solo con URL firmada temporal.

### Supabase/RLS

- [ ] RLS activa en todas las tablas.
- [ ] `anon` solo lee catalogos y documentos vigentes.
- [ ] `anon` no lee datos personales.
- [ ] Alta publica solo via RPC transaccional.
- [ ] MFA en cuentas administrativas.
- [ ] Backups y bitacoras habilitados.
- [ ] DPA/terminos de Supabase archivados.
- [ ] Region del proyecto documentada.

### ARCO, cambio y baja

- [ ] Exportar expediente completo del titular.
- [ ] Rectificar datos con bitacora.
- [ ] Registrar cancelacion/bloqueo cuando proceda.
- [ ] Registrar oposicion y revocacion.
- [ ] Implementar flujo de cambio/baja de TAG.
- [ ] Mantener evidencia necesaria durante plazo aprobado.
- [ ] Suprimir o disociar al finalizar finalidad/plazo.

### Observaciones y datos sensibles

- [ ] Limitar longitud de observaciones.
- [ ] Evitar captura de datos sensibles.
- [ ] Preferir catalogos o motivos cerrados.
- [ ] Capacitar a Administracion/TI para no escribir salud, discapacidad u otra informacion sensible.

## 4. Pendientes de Direccion/Legal/Administracion

| Pendiente | Decision requerida | Prioridad |
|---|---|---|
| Responsable ARCO | Nombre de persona/departamento y correo institucional | Alta |
| Domicilio legal en aviso | Confirmar texto exacto del aviso general IAQ | Alta |
| Plazo de conservacion SATAV | Definir vigencia + bloqueo + supresion | Alta |
| Senaletica fisica | Aprobar cartel corto y ubicacion | Media-alta |
| Supabase DPA/region | Firmar/archivar DPA y documentar region | Alta |
| Reglamento de estacionamiento | Validar clausulas y limites de responsabilidad | Alta |
| Cobro $100 efectivo | DECIDIDO: sin folio/recibo/corte por ahora; solo registro administrativo interno | Alta |
| NOM-151 | Cotizar si Direccion quiere mayor fuerza probatoria | Fase 2 |

> El detalle y estado de todos estos pendientes se lleva en `E6 - Decisiones Legales Pendientes.md` (tablero unico de decisiones por sesion).

## 5. Criterios de aceptacion

- [x] Existe texto revisable del aviso SATAV.
- [x] El formulario tiene texto legal base para implementar.
- [x] Esta definido que pasa con alumnos menores de edad.
- [x] Esta definido que evidencia debe guardar la firma.
- [x] Esta definido como atender ARCO, baja, bloqueo y conservacion.
- [x] Esta claro que configurar en Supabase para privacidad.
- [x] Esta claro que debe aprobar Direccion/Legal antes de produccion.

## 6. Decision de cierre

La tarea **Definicion legal y privacidad** queda en estado:

> **Borradores legales y criterios de privacidad listos para revision institucional.**

No se debe publicar el aviso ni operar SATAV en produccion hasta completar los campos pendientes y obtener aprobacion de Direccion/Legal.

## 7. Proximo paso recomendado

Enviar a Direccion/Legal:

- `Entregables/E6 - Cumplimiento Legal y Privacidad/E6 - Aviso de Privacidad SATAV.md`
- `Desarrollo/04 - Seguridad, RLS y Privacidad.md`
- Esta lista de pendientes

Despues de aprobacion, implementar en el formulario y actualizar el schema para versionar aviso, hash de firma, trazos y solicitudes ARCO/cambio/baja.
