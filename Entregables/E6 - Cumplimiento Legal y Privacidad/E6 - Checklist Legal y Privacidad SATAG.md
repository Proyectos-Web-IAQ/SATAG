# Checklist Legal y Privacidad SATAG

> **Fecha:** 06/07/2026 · **actualizado:** 20/07/2026.
> **Tarea:** WBS 1.2.3 - Definicion legal y privacidad.
> **Estado:** controles tecnicos implementados y en produccion; **aprobacion institucional del aviso aun pendiente**.

## 1. Objetivos del dia

- [x] Convertir la investigacion legal en textos revisables.
- [x] Crear aviso de privacidad integral SATAG/anexo base.
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
| Aviso integral SATAG | `Entregables/E6 - Cumplimiento Legal y Privacidad/E6 - Aviso de Privacidad SATAG.md` | Publicado como v2 vigente en la BD (bloque 22); pendiente la aprobacion formal |
| Aviso simplificado | `Entregables/E6 - Cumplimiento Legal y Privacidad/E6 - Aviso de Privacidad SATAG.md` | Borrador; el formulario muestra el integral completo |
| Texto de aceptacion y firma | `Entregables/E6 - Cumplimiento Legal y Privacidad/E6 - Aviso de Privacidad SATAG.md` | Implementado en el formulario |
| Reglas tecnicas de privacidad | `Desarrollo/04 - Seguridad, RLS y Privacidad.md` | Implementado en produccion |
| Checklist legal/privacidad | Este documento | Listo |

## 3. Checklist para desarrollo

> Estado a 20-jul-2026, verificado contra el codigo y los bloques SQL aplicados.

### Aviso y consentimiento

- [ ] Mostrar aviso simplificado antes de capturar datos. — *Implementado distinto:* el formulario muestra el **aviso integral completo** en un paso intermedio, con avance bloqueado hasta leerlo. Cumple el consentimiento; falta conciliar el texto simplificado con lo que recomienda el art. 16 fr. II.
- [x] Enlazar aviso integral SATAG.
- [x] Usar casilla no premarcada de aceptacion.
- [x] Guardar version exacta del aviso aceptado.
- [x] Guardar version exacta del reglamento firmado.
- [x] Bloquear avance si no hay aceptacion.

### Menores de edad

- [x] Capturar si el usuario del TAG es alumno.
- [x] Capturar si el firmante es gestionante.
- [x] Exigir padre/madre/tutor si el usuario es menor de edad. — constraint `reg_menor_requiere_gestionante` + validacion en el formulario.
- [x] Guardar nombre del gestionante firmante.
- [x] Mostrar texto especifico para representante de menor.

### Firma reforzada

- [x] Guardar imagen PNG de la firma.
- [x] Guardar trazos vectoriales si el componente los captura.
- [x] Guardar firmante, rol, fecha/hora UTC y version de documentos.
- [x] Calcular hash SHA-256 del paquete firmado. — lo genera la base, no el cliente.
- [x] Registrar bitacora de aceptacion.
- [x] Guardar firma en bucket privado, no publico.
- [ ] Visualizar firma solo con URL firmada temporal. — *No aplica todavia:* el panel **no muestra** la firma. Debera cumplirse cuando se implemente esa vista.

### Supabase/RLS

- [x] RLS activa en todas las tablas.
- [x] `anon` solo lee catalogos y documentos vigentes.
- [x] `anon` no lee datos personales.
- [x] Alta publica solo via RPC transaccional.
- [x] MFA en cuentas administrativas. — obligatorio: la RLS exige `aal2`.
- [ ] Backups y bitacoras habilitados. — falta verificar y documentar la politica de respaldos del proyecto.
- [ ] DPA/terminos de Supabase archivados.
- [ ] Region del proyecto documentada.

### ARCO, cambio y baja

- [ ] Exportar expediente completo del titular. — no existe la funcion de export.
- [x] Rectificar datos con bitacora. — `actualizar_registro_con_estacionamiento` deja movimiento.
- [x] Registrar cancelacion/bloqueo cuando proceda. — estado `bloqueado` + campos de conservacion.
- [ ] Registrar oposicion y revocacion. — el esquema no tiene tipos ARCO; se atenderia por procedimiento.
- [x] Implementar flujo de cambio/baja de TAG. — solicitudes de `actualizacion`/`baja` + buzon de notas.
- [ ] Mantener evidencia necesaria durante plazo aprobado. — depende del plazo, aun sin definir.
- [ ] Suprimir o disociar al finalizar finalidad/plazo. — hay andamiaje (`suprimir_despues_de`, `bloqueado_en`) pero no proceso.

### Observaciones y datos sensibles

- [ ] Limitar longitud de observaciones.
- [ ] Evitar captura de datos sensibles.
- [x] Preferir catalogos o motivos cerrados. — marcas, modelos, colores y estacionamientos son catalogos; los motivos de baja quedan en texto.
- [ ] Capacitar a Administracion/TI para no escribir salud, discapacidad u otra informacion sensible.

## 4. Pendientes de Direccion/Legal/Administracion

| Pendiente | Decision requerida | Prioridad |
|---|---|---|
| Responsable ARCO | Nombre de persona/departamento y correo institucional | Alta |
| Domicilio legal en aviso | Confirmar texto exacto del aviso general IAQ | Alta |
| Plazo de conservacion SATAG | Definir vigencia + bloqueo + supresion | Alta |
| Senaletica fisica | Aprobar cartel corto y ubicacion | Media-alta |
| Supabase DPA/region | Firmar/archivar DPA y documentar region | Alta |
| Reglamento de estacionamiento | Validar clausulas y limites de responsabilidad | Alta |
| Cobro $100 efectivo | ACTUALIZADO (15-jul): cada pago emite folio de recibo automatico (`SATAG-AAAA-######`), control interno sin CFDI. El corte de caja sigue pendiente | Alta |
| NOM-151 | Cotizar si Direccion quiere mayor fuerza probatoria | Fase 2 |

> El detalle y estado de todos estos pendientes se lleva en `E6 - Decisiones Legales Pendientes.md` (tablero unico de decisiones por sesion).

## 5. Criterios de aceptacion

- [x] Existe texto revisable del aviso SATAG.
- [x] El formulario tiene texto legal base para implementar.
- [x] Esta definido que pasa con alumnos menores de edad.
- [x] Esta definido que evidencia debe guardar la firma.
- [x] Esta definido como atender ARCO, baja, bloqueo y conservacion.
- [x] Esta claro que configurar en Supabase para privacidad.
- [x] Esta claro que debe aprobar Direccion/Legal antes de produccion.

## 6. Decision de cierre

La tarea **Definicion legal y privacidad** queda en estado:

> **Controles tecnicos implementados y en produccion; aprobacion institucional pendiente.**

⚠️ **Riesgo abierto (20-jul-2026):** SATAG **ya opera en produccion con usuarios reales**, mientras la
aprobacion formal del aviso por Direccion/Legal sigue pendiente, junto con el responsable ARCO, el
plazo de conservacion y el DPA/region de Supabase. Los controles tecnicos exigidos (RLS, MFA, firma
reforzada, bucket privado, tratamiento de menores) **ya estan implementados**; lo que falta es la
**validacion institucional**. Conviene cerrarla cuanto antes o dejar constancia expresa de la decision
de operar mientras tanto.

## 7. Proximo paso recomendado

Enviar a Direccion/Legal:

- `Entregables/E6 - Cumplimiento Legal y Privacidad/E6 - Aviso de Privacidad SATAG.md`
- `Desarrollo/04 - Seguridad, RLS y Privacidad.md`
- Esta lista de pendientes

Despues de aprobacion, implementar en el formulario y actualizar el schema para versionar aviso, hash de firma, trazos y solicitudes ARCO/cambio/baja.
