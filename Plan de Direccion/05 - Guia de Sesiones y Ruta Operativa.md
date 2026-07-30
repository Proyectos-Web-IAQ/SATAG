# Guia de Sesiones y Ruta Operativa - SATAG

> **Ultima actualizacion:** 29/07/2026 (cierre del desarrollo: bloques 45-48, aviso sin redundancias y correccion del estado real del sistema).
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

> **Estado real del sistema.** SATAG esta **en desarrollo, no liberado**. Funcionalmente esta
> completo y desplegado en el sitio de Vercel, que se usa como **entorno de trabajo y demostracion**:
> no hay usuarios ni datos reales de la comunidad escolar. La liberacion ocurre despues de las
> pruebas, de la migracion al subdominio institucional y de la aceptacion. Los documentos que decian
> "en produccion" se corrigieron el 29-jul: es lo que Direccion va a leer para aceptar el proyecto y
> lo que el acta de cierre compara contra lo planeado.

**El desarrollo esta terminado y la funcionalidad queda congelada.** Ya funcionan: autoservicio con
firma reforzada, panel Admin/TI/Finanzas/Consulta con roles finos y MFA, cobro con folios de recibo
automaticos, corte de caja, buzon de notas SC-003, apartar/usar TAG, reporte de expedientes
incompletos, validacion del tipo de usuario al cobrar y firma auditable desde el panel
(bloques SQL `00`->`48`, deploy automatico en Vercel desde `main`).

El **corte de caja / finanzas** (bloque 42 + pestana Finanzas) esta implementado: Admin ve la caja
actual y lo vendido, cierra el corte conciliando el efectivo contado, y cada corte queda inmutable con
la identidad de quien lo hizo.

La prioridad inmediata es el **cierre del proyecto**, en este orden:

1. **Pruebas formales** (funcional + privacidad/RLS + firma + ARCO). Es la actividad critica atrasada:
   existe el banco de datos (`seed_tests_dev.sql`, 14 escenarios) pero **no habia casos de prueba
   documentados**; el plan y la matriz viven ahora en `Pruebas/` (SC-010).
2. **Manual + capacitacion** (E8).
3. **Aprobacion institucional del aviso de privacidad** (E6) — gestionarla en paralelo desde ya, porque
   no depende del desarrollo y es el mayor riesgo para la fecha de cierre.
4. **Migracion del hosting** a subdominio institucional + Cloudflare antes de la salida oficial
   (SC-012): Vercel es **interino**, no definitivo.

Resueltos el 29-jul (cierran E5 y CC-12): reporte de registros incompletos (B2/CC-02, bloque 45),
validacion del tipo de usuario al cobrar (B5/CC-05, bloque 46) y firma visible en el panel con URL
firmada temporal (SC-008, bloque 47).

Resueltos el 28-jul: pagina publica del aviso y aviso simplificado (SC-007, bloque 44) y
endurecimiento por rol de catalogos, documentos y firmas (SC-009, bloque 43).

Unico pendiente menor que queda: extraccion de la firma a `lib/firma/` (B8, va el 31-jul y no bloquea
nada). El rate limiting de los RPC publicos sigue como riesgo aceptado y documentado (caso `P-11`).

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

### 3.2 E1 - Modelo de datos + BD  — ✅ completo

Aplicado en la base de trabajo (bloques `00`->`48`): `aviso_versiones` y referencia de version en `aceptaciones`; hash SHA-256 del paquete firmado + trazos vectoriales; gestionante/tutor para menores; tabla `solicitudes` (tipos `actualizacion`/`baja`) + buzon de notas (`nota`); estado `bloqueado`; `tag_apartado`/`tipo_validado`; catalogo de modelos con seed.

Cerrado el 29-jul:

- **Vista de incompletos** (`v_registros_incompletos`, B2), bloque 45. Siete motivos en tres grupos: integridad (estados que los RPC no pueden producir), faltante operativo (sin placas con el TAG ya instalado) y atorados a los 7 dias naturales (sin pago desde el alta, pagado sin instalar). Excluye `estado = 'baja'`. `security_invoker = true`: hereda la RLS del panel en vez de abrir una segunda puerta.
- **Validacion del tipo de usuario al cobrar** (B5), bloque 46. `registrar_pago` gana `p_tipo_usuario` **obligatorio** y sella `tipo_validado` / `_por` / `_en`. Si el tipo confirmado difiere del declarado en el alta, corrige el expediente y deja movimiento `cambio` en la bitacora. Un menor de edad queda fijo en `alumno` (coherencia con CC-11).

Ya aplicado (no confundir con pendiente): los campos de **caja/corte** (`cortes_caja`, `pagos.corte_id`) entraron con el bloque 42 (ver 3.5) y los folios de recibo con el bloque 32.

### 3.3 E7 - Supabase seguro  — ✅ implementado

Aplicado y verificado con cuentas reales de Supabase Auth (personal del instituto):

- Esquema aplicado por bloques atomicos (ver runbook `supabase/sql/README.md`, con PASO 0 de roles).
- RLS activa: `anon` no lee PII; el panel exige `aal2` (MFA) + rol.
- Bucket privado `firmas` (subida anon, sin lectura publica). Desde el bloque 47 el panel puede ver la firma con **URL firmada de 60 segundos**; el bucket sigue privado. El bloque 48 abrio esa lectura tambien al rol `consulta`, que sigue sin poder escribir ni borrar objetos.
- Auth + MFA obligatorio para el panel.

Pendiente: documentar region del proyecto y archivar DPA/terminos de Supabase.

### 3.4 E2 - Formulario de autoservicio  — ✅ implementado

Implementado (`app/registro`): aviso integral con casilla no premarcada, captura de usuario/vehiculo con dropdown marca->modelo, validacion de menor/tutor, reglamento versionado, firma simple reforzada, guardado por RPC `crear_registro` y comprobante. La solicitud de cambio/baja y el buzon de notas sin folio viven en `/solicitudes`.

### 3.5 Corte de caja / finanzas  — ✅ implementado

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
| E1 Modelo de datos + BD | ✅ Completo (bloques `00`->`48` aplicados en la base de trabajo) | — |
| E6 Cumplimiento legal y privacidad | 🟡 Implementado; aprobacion pendiente | Aprobacion institucional del aviso + pendientes ARCO/conservacion |
| E7 Infraestructura y Supabase seguro | 🟡 Supabase completo y endurecido (bloques 43 y 47); hosting **interino** en Vercel | Migrar al subdominio institucional + Cloudflare (SC-012); documentar region + archivar DPA |
| E2 Formulario de autoservicio | ✅ Implementado | — |
| E5 Panel administrativo | ✅ **Completo** (roles finos + MFA + reporte de incompletos, 29-jul) | — |
| E4 Instalacion TI | ✅ Implementado | — |
| E3 Administracion/cobro | ✅ Implementado (cobro + folios + corte de caja + validacion de tipo) | — |
| E8 Manual/capacitacion | 🟡 Borrador completo (28-jul) | Cinco documentos en `Entregables/E8 - Manual y Capacitacion`. Falta impartir la sesion y recabar firmas de asistencia |

## 7. Cierre de sesion

Antes de terminar cada dia:

- Actualizar checklist del `README.md` si una tarea quedo cerrada.
- Anotar decisiones nuevas en este documento o en la bitacora de cambios.
- Confirmar siguiente tarea concreta.
- Subir cambios relevantes a GitHub si se necesita revisar fuera del equipo local.

### Bitacora de la sesion del 29-jul-2026

**Que se termino.** El desarrollo. Se cerraron los tres huecos que quedaban en el panel, con lo que
**E5 queda completo y CC-12 cerrado**, y se corrigio la documentacion que afirmaba que el sistema
esta en produccion.

1. **Reporte de expedientes incompletos** (B2/CC-02, bloque 45). Estaba documentado desde el 03-jul y
   nunca se implemento. Vive en la pestana de **TI** (con contador propio, porque TI resuelve cinco de
   los siete motivos y no ve la pestana Consulta) y como panel colapsable en **Consulta**.
2. **Validacion del tipo de usuario al cobrar** (B5/CC-05, bloque 46). Las columnas existian desde el
   bloque 12 sin que nada las tocara. Ahora cobrar y validar son el mismo acto.
3. **Firma visible en el panel con URL firmada temporal** (SC-008, bloque 47). Cierra CC-12. La
   evidencia existia pero era inauditable desde la aplicacion.
4. **Correccion documental.** 18 documentos afirmaban "en produccion" u "operando". Se sustituyo por
   la descripcion exacta del estado, sin tocar alcance, fechas ni porcentajes. Los manuales de E8
   llevan ahora una nota de estado para que el personal no crea que ya se opera con familias reales.

**Ajustes de la misma tarde, ya con las pantallas a la vista:**

- **Bloque 48 — la evidencia de firma se abre al rol `consulta`.** El bloque 30 la habia acotado a
  admin/super por ser PII sensible, y el 47 la amplio a `ti`. Decision de la Direccion de TI:
  Consulta es la pantalla donde se investiga un expediente, y sin la evidencia la auditoria quedaba
  con un hueco. Es coherente con lo que el bloque 27 ya decia al definir el rol ("la separacion real
  de `consulta` no es que vea menos, es que no escribe"). Consulta gano **solo lectura**: no escribe
  en el bucket ni pasa la guardia de ningun RPC. **Costo asumido, no descuido:** la RLS de PostgreSQL
  es por fila, no por columna, asi que quien lee `aceptaciones` alcanza tambien `hash_payload`,
  trazos, IP y user-agent al consultar la tabla directo. Quedo registrado en el encabezado del
  bloque, en `Desarrollo/04` y en el checklist E6.
- **Avisos de privacidad redundantes en el formulario.** Aparecia tres veces: portada, aviso corto
  del paso 1 y aviso integral del paso 3. Solo una era redundante de verdad — el enlace a la pagina
  publica **dentro** del paso del integral, con el texto completo en la misma pantalla, que solo
  invitaba a abrir otra pestana justo cuando hay que desplazarse hasta el final para habilitar la
  casilla. Se retiro. Las otras dos se quedan porque cumplen cosas distintas: el corto es el art. 16
  fr. II (informar **al recabar** los datos) y el integral es el que se acepta con firma y produce la
  evidencia. Lo que si se arreglo fue la sensacion de muro de texto: el aviso corto ahora va plegado
  salvo su primer parrafo, y el enlace al integral **nunca** se pliega, porque es parte del minimo
  legal.

**Decision de criterio (la que definia si el reporte servia o era ruido).** Un expediente incompleto
NO es "le falta un paso del flujo": eso ya son las colas de Admin y de TI, y repetirlas seria ruido.
Son tres cosas distintas: faltantes de **integridad** (estados que los RPC no pueden producir; si
aparecen, algo se escribio por fuera del panel), un faltante **operativo** real (sin placas con el TAG
ya instalado) y los **atorados**, que solo entran a los 7 dias naturales. Se dejo fuera a proposito el
motivo "sin firma": seria el mas grave legalmente, pero `seed_tests_dev.sql` inserta el banco de QA
directo en la tabla, sin `aceptaciones`, y el reporte se encenderia entero.

**Correcciones a la matriz de pruebas.** Los casos `P-09`, `P-10` y `A-07` seguian describiendo el
sistema **antes** de los bloques 43 y 44, que se aplicaron el 28-jul: manana habrian "fallado" contra
un resultado esperado obsoleto. Ya dicen lo correcto. Ademas, `P-13` y `P-10` se reescribieron por el
bloque 48, que invirtio lo que afirmaban. La matriz paso de 59 a **77 casos**.

**Siguiente tarea concreta, en este orden:**

La base quedo lista el mismo 29-jul: bloques `00`->`48` aplicados, banco de pruebas re-sembrado con
la evidencia de firma, y `qa-firma-demo.png` cargado en el bucket. **No queda ningun paso de
preparacion pendiente.**

1. **Ejecutar las tandas P y E** de `Pruebas/01 - Matriz de Casos.md`. Son las que bloquean el cierre:
   ningun fallo es admisible. Empezar por `P-13` y `E-10`, que verifican el bloque 48; por `F-39`,
   que comprueba que el aviso corto sigue cumpliendo el minimo legal sin desplegarse; y por `E-11`,
   que cubre la evidencia sembrada.
2. **Dar de alta un registro real por `/registro/`**, firmando. El banco de QA se inserta directo en
   la tabla, asi que su firma es sembrada: `E-07` y `E-08` (PNG real y su SHA-256) y `E-06` (menor que
   firma su tutor) **solo se pueden probar con un alta de verdad**.
3. Anotar cada resultado en `Pruebas/02 - Bitacora de Ejecucion.md` conforme se ejecuta, no al final.
4. Impartir la capacitacion y recabar firmas de asistencia.
5. Solicitar la aprobacion institucional del aviso. **Gestionarla desde el primer dia**: es el mayor
   riesgo para la fecha de cierre.
6. Migrar al subdominio institucional + Cloudflare (SC-012).

**Discrepancia de fechas por resolver.** El `README.md` y el cronograma dan el cierre en **~03-ago**;
la ruta de trabajo actual pone la migracion el **05-ago** y la aceptacion el **07-ago**. No se toco
ninguna de las dos: hay que decidir cual es la buena y alinear el cronograma antes del acta de cierre.

**Pendiente que no bloquea:** extraccion de la firma a `lib/firma/` (B8), programada para el 31-jul.
Despues de eso empieza la integracion con ZKBioSecurity (SC-006); la investigacion esta en
`Investigacion/03 - Integracion ZKBioSecurity.md`.

### Bitacora de la sesion del 28-jul-2026

**Que se termino.** Auditoria completa del sistema contra el codigo real y conciliacion de toda la
documentacion de gestion, que llevaba fechas y estados contradictorios. Se escribio el plan de pruebas
con 59 casos (WBS 1.8, que no tenia ninguno) y el manual de operacion completo (E8, cinco documentos).
Se cerraron CC-09 y CC-12 aplicando los bloques 43 y 44. Se corrigio el tuteo que quedaba en varias
pantallas y se retiro el codigo muerto del prototipo. Todo publicado en GitHub (7 commits).

**Siguiente tarea concreta, en este orden:**

1. **Ejecutar las tandas P y E** de `Pruebas/01 - Matriz de Casos.md` (privacidad y firma). Son las que
   bloquean el cierre: ningun fallo es admisible. Los casos P-09 y P-10 sirven ademas para comprobar
   que el bloque 43 quedo bien aplicado.
2. Verificar en el navegador que el aviso corto aparece en el primer paso del registro (bloque 44).
3. Impartir la capacitacion siguiendo `Entregables/E8 - Guia de Capacitacion.md` y recabar firmas.
4. Solicitar la aprobacion institucional del aviso. **Gestionarla desde el primer dia**: no depende del
   desarrollo y es el mayor riesgo para la fecha de cierre.
5. Migrar al subdominio institucional + Cloudflare (SC-012).

**Decision registrada.** Vercel es hosting **interino**, no sustituto del subdominio institucional. La
migracion es requisito de la salida oficial y de la aceptacion.

**Hallazgo abierto por decidir.** La sesion del panel se guarda en el navegador: cerrar la ventana no
cierra la sesion, asi que en un equipo compartido la siguiente persona entra sin contrasena ni segundo
factor. Quedo advertido en el manual. Si Administracion opera en un equipo compartido, evaluar un
cierre de sesion por inactividad.
