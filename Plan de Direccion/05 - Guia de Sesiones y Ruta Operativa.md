# Guia de Sesiones y Ruta Operativa - SATAG

> **Ultima actualizacion:** 30/07/2026 (preparacion del banco de pruebas).
> Cierre del desarrollo: 29/07/2026 (bloques 45-48, aviso sin redundancias y correccion del estado real del sistema).
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

### Bitacora de la sesion del 30-jul-2026

**Que se hizo.** Preparacion del banco de pruebas y sincronizacion de los sistemas de registro.
Se aplico el bloque 48, se re-sembro `seed_tests_dev.sql` — que ahora incluye la evidencia de firma
del paso 3c — y se cargo `qa-firma-demo.png` en el bucket. Se alinearon cinco documentos que
citaban el estado anterior y, sobre todo, la **guia y la bitacora que todavia afirmaban que
`consulta` no accede a la firma**: el bloque 48 invirtio justo eso y son los documentos que
Direccion lee para aceptar el proyecto.

**Reprogramacion del cierre.** Se resolvio la discrepancia que venia anotada: el cronograma daba
el cierre en ~03-ago mientras la ruta operativa ponia migracion el 05-ago y aceptacion el 07-ago.
**Queda el 07-ago**, y asi se carga en Cronoma.

**Sincronizacion con Cronoma.** Los tres scripts viven en el repo de Cronoma, en
`supabase/manual/`, y siguen el patron del 28-jul (respaldo confirmado aparte, mutacion que aborta
si el estado no coincide, rollback propio):

- `2026-07-30_satag_cierre_desarrollo_lectura.sql` — solo lee; correr PRIMERO.
- `2026-07-30_satag_cierre_desarrollo.sql` — avance de las 17 actividades, reprogramacion,
  SC-016 (evidencia de firma abierta a `consulta`) y SC-017 (avisos redundantes), mas el riesgo
  nuevo de que la RLS es por fila y no por columna.
- `2026-07-30_satag_cierre_desarrollo_rollback.sql`.

**Fechas, para que el acta cuadre.** El cierre del desarrollo fue el **29-jul**; lo del **30-jul**
es la preparacion del banco. Se fecho cada cosa por lo que muestra el historial del repositorio,
no por la sesion en que se hablo de ello.

**Dato incomodo que conviene no maquillar.** Hoy es 30-jul y **la ejecucion de las pruebas no ha
empezado**. La actividad estaba planeada del 17 al 22-jul: es la critica atrasada, y asi se carga
en Cronoma (40 %, en curso, reprogramada al 03-ago).

**Cronoma quedo sincronizado.** Se cargo el avance de las 17 actividades del cronograma, se cerraron
CC-02, CC-05 y CC-12 en el paquete de cambios, se dieron de alta SC-016 y SC-017 y el riesgo de la RLS
por fila, y se dejaron 6 revisiones pendientes para el auditor. Verificado con la consulta de control:
3 actividades CC abiertas, cierre en 07-ago, 0 revisiones desincronizadas.

**Hallazgo del proceso, para no repetirlo.** La carga aborto tres veces antes de entrar, y las tres
por suposiciones equivocadas sobre Cronoma: los nombres de actividad llevan acentos y se empatan por
texto exacto; el proyecto no tiene 17 actividades sino ~38, porque cada cambio de control es una
actividad del paquete WBS `CC`; y una revision PENDIENTE con el porcentaje viejo puede deshacer una
carga en silencio al aprobarse, porque el trigger copia `pct_reportado` dentro de la actividad. Las
guardas de los scripts detuvieron las tres antes de tocar datos.

**ZKBioSecurity (SC-006) quedo donde debia.** La investigacion estaba muy bien escrita pero su
conclusion no habia salido del propio documento. Ahora esta como **R13** en la matriz de riesgos, en
la bitacora de cambios y en esta guia. El encuadre correcto: Contabilidad pidio la conexion en la
reunion inicial, el alcance de SATAG —sustituir la hoja fisica y la hoja de calculo— **ya esta
cumplido**, la API no esta activada y se compra aparte (`ZKBS-API-S1`, SMARTHAUS), y **la decision de
adquirirla es de Contabilidad, no de TI**. Queda anotada tambien la divergencia entre lo que espera
Contabilidad y lo que el Encargado de Sistemas entiende por alcance.

**Siguiente tarea concreta:** ejecutar las tandas P y E. No queda ningun paso de preparacion.

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

La base quedo lista la manana del 30-jul: bloque 48 aplicado (los 45-47 se corrieron el 29), banco de
pruebas re-sembrado con la evidencia de firma, y `qa-firma-demo.png` cargado en el bucket. **No queda
ningun paso de preparacion pendiente.**

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
**La integracion con ZKBioSecurity (SC-006) NO se puede empezar a programar.** La investigacion esta
cerrada (`Investigacion/03`) y su conclusion es que **la API no esta activada**: se compra aparte
(`ZKBS-API-S1`, distribuidor SMARTHAUS). No es trabajo de codigo, es una compra, y **la decision es de
Contabilidad**. Lo que TI podia entregar —investigacion, diseno del conector y plan B por archivo— ya
esta entregado. Ver R13 en `Plan de Direccion/03`.

### Bitacora de la sesion del 31-jul-2026

**Que se hizo.** Arranco la **ejecucion** de las pruebas (WBS 1.8), que estaba atrasada: al 30-jul no
se habia corrido un solo caso. Se recorrio el flujo publico pantalla por pantalla, tomando capturas
que sirven a la vez de evidencia de la bitacora, de material para ilustrar E8 —los cinco manuales
estan escritos y **sin una sola imagen**— y de revision de experiencia de uso. Los resultados se
anotaron **conforme se ejecutaba** en `Pruebas/02 - Bitacora de Ejecucion.md`.

**Version bajo prueba: commit `dc37b54`**, arbol limpio. `npx tsc --noEmit` y `npm run build` en
verde; las 10 rutas se generan estaticas.

**Casos cerrados:** F-03, F-05, F-39 y A-08. **Parciales** (falta la otra mitad): F-02 —el aviso si,
el reglamento no—, F-04, F-06, F-07 y A-07.

**Hallazgo critico: la puerta del consentimiento se abre sola (D-01).** Es el defecto mas grave
encontrado hasta hoy y no estaba en ningun documento.

Los cinco cargadores del formulario no tienen `.catch` (`registro/page.tsx:71-77`). Si el aviso no
carga, el recuadro pinta un solo parrafo, "Cargando...", que **cabe** en los `max-height: 220px` de
`.reglamento`; entonces se cumple `scrollHeight <= clientHeight + 8` y el efecto de la linea 93
ejecuta `setAvisoLeido(true)`. La casilla se habilita y la persona acepta un aviso que nunca vio. El
efecto solo pone la bandera en `true`, **nunca en `false`**, asi que no hace falta que la red se
caiga: basta con que el texto tarde y la persona vaya de prisa. Aplica igual al reglamento (linea 97).

Se reprodujo bloqueando `aviso_versiones` y `reglamento_versiones` desde el panel *Request
conditions* del navegador, y se completo un alta en ese estado: **folio `SATAG-000302`**.

**El agravante lo pone el RPC.** Cuando el cliente no manda las versiones —que es justo lo que pasa
cuando los documentos no cargan— `crear_registro` **las resuelve el mismo del lado del servidor**
(`19_rpc_crear_registro.sql:81-89` y `:100-108`), escribe `acepto_privacidad` en duro como `true`
(`:256`) y calcula el hash sobre el texto completo de la v2 (`:220-226`). El resultado en
`aceptaciones` afirma que la persona leyo y acepto reglamento v2 y aviso v2, con hash valido y sello
de tiempo real. **El hash prueba que el documento no fue alterado, no que la persona lo haya visto.**
E-02 y E-03 aprobarian ese registro.

Si queda rastro, pero nadie lo mira: `metadata->'consentimiento'` conserva `avisoVersion: null` y
`reglamentoVersion: null`, en contradiccion con las claves foraneas que apuntan a la v2. Sirve como
control de auditoria **siempre que se filtre por `jsonb_exists(metadata,'consentimiento')`**: los 55
folios del banco de QA se insertan directo en la tabla y no traen esa clave
(`seed_tests_dev.sql:386`), asi que sin el filtro salen como falsos positivos. Verificado:
**el unico expediente afectado es el `302`**, que se conserva como evidencia del defecto y **no**
cuenta como caso de prueba.

El arreglo tiene tres partes y la tercera no se habia visto: condicionar las dos puertas a que el
documento exista; poner `.catch` con mensaje visible; y **que `crear_registro` rechace el alta si las
versiones llegan nulas** en vez de rellenarlas. Lo tercero es un bloque 49 sobre un RPC vivo —va junto
con el despliegue— y arrastra que `getAvisoVigente`/`getReglamentoVigente` devuelvan el `id` y que
`api.ts` lo mande.

**Otros defectos abiertos:** D-04 (el aviso simplificado del paso 1 desaparece entero y en silencio si
no carga: es el minimo del art. 16 fr. II cayendose sin aviso), D-05 (la portada dice "Sistemas lo
instala" y el comprobante "TI instalara": dos nombres para la misma area en el mismo tramite), D-02
(el tipo de usuario se queda en Alumno al **des**marcar la casilla de menor) y D-03 (**cuatro** textos
tutean, no tres: los tres "Especifica..." mas "Desplazate hasta la clausula 22", cuyo gemelo del paso
anterior si dice "Desplacese").

**Revision de pulido con seis lentes.** Se corrio un barrido sobre lo recorrido —redaccion,
accesibilidad, visual y movil, cumplimiento legal, fugas de estado y documentacion contra realidad—
con un pase de refutacion detras. **60 hallazgos vivos, 20 refutados**, organizados en 51 cambios y
cinco lotes por naturaleza del cambio: A texto, B estilos, C logica, D textos legales y base, E
documentacion. El detalle vive en el archivo de trabajo de la sesion.

Tres hallazgos legales que no teniamos:

1. **Al aviso simplificado y al integral les faltan las opciones de limitacion de uso o divulgacion**
   (art. 15 fr. IV), y al simplificado tambien el domicilio del responsable. Lo exige la propia
   investigacion del proyecto (`Investigacion/02:230`, `:240`, `:244`), que se entrega a Direccion
   junto con el texto: hoy F-39 pasa en verde sobre un aviso que el propio expediente considera
   incompleto.
2. **El aviso promete supresion "al vencer el plazo aprobado" y no hay plazo aprobado ni proceso que
   la ejecute.** Ademas el texto derivo al publicarse: el fuente decia "deberan suprimirse"
   (obligacion interna) y quedo "se suprimiran" (compromiso ante el titular). **Es el punto con espera
   externa: hay que decidirlo antes de que Legal firme.**
3. **El reglamento anuncia videovigilancia 24 horas y ninguno de los dos avisos la menciona.** La
   solucion propuesta es remision, no ampliacion: declararlo tratamiento conexo del IAQ informado
   aparte, sin meter "imagen" como dato tratado de SATAG.

Y una mina puesta justo en el siguiente movimiento previsto: el bloque 44 escribe el texto corto con
`update ... where vigente = true`, asi que **al publicar la v3 que apruebe Legal, el aviso
simplificado desapareceria de la pantalla sin dar error**. En el bloque 49 va un
`check (not vigente or contenido_simplificado is not null)` para que falle ruidosamente en el SQL
Editor y no en silencio en el celular.

**Trampa operativa registrada:** tocar `aviso_versiones.contenido` **obliga a resembrar el banco de
QA**, porque `seed_tests_dev.sql:352` mete el sha256 del texto dentro de `hash_payload` y las 55
aceptaciones sembradas quedarian con un hash que ya no corresponde. Tocar solo
`contenido_simplificado` no lo obliga.

**Decisiones de la sesion:**

- Que el tipo de usuario quede fijo en Alumno **mientras** la casilla de menor esta marcada es diseno
  deliberado y se queda asi. Lo que se corrige es el residuo al desmarcarla.
- Los arreglos de pulido se aplican **en un solo lote al terminar las tandas P y E**, para no mover el
  commit bajo prueba a media ejecucion y dejar la bitacora mintiendo sobre que version se probo.
- Orden acordado de los lotes: decidir el plazo de conservacion hoy (espera externa) -> C -> A -> B ->
  D (bloque 49) -> E al final, con el diff de los demas delante, porque E8 y la matriz transcriben
  entre comillas 18 de las cadenas que los otros lotes modifican.
- El lote B recupera ~60 px de ancho en celular, asi que **invalida todas las capturas tomadas hoy**:
  si se van a ilustrar los manuales, hay que aplicarlo antes de capturar en serio.

**Siguiente tarea concreta:** el **alta real limpia** por `/registro/`, sin bloqueo. Es precondicion
de E-06, E-07 y E-08, que no se pueden probar con los folios sembrados porque su firma esta sembrada,
no capturada.

**Lo que falta despues, en orden:** las tres capturas pendientes (la lista de relacion con el menor
abierta para F-04, el paso 2 vacio para F-06 y el chip de TAG propio para F-07); los pasos 4 a 6 del
formulario; `/aviso-de-privacidad/` y el buzon; las seis pantallas del panel; la tanda P completa por
consola y SQL Editor; la aplicacion de los cinco lotes; y CC-08, la extraccion de la firma a
`lib/firma/`, que sigue sin bloquear nada y por eso sigue al final.

**No se toco Cronoma.** La actividad de pruebas sigue al 40 %, que corresponde solo a la preparacion;
se actualiza cuando cierren las tandas P y E, que son las que bloquean el cierre.

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
