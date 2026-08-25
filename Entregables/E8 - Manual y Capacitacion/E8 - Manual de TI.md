# Manual del Departamento de TI (instalación y ciclo de vida)

> **Sistema:** SATAG — Sistema de Adquisición de TAG Vehicular.
> **Institución:** Instituto Asunción de Querétaro, A.C.
> **Módulo:** vista **"TI"** del panel de gestión.
>
> **Nota sobre el estado del sistema.** SATAG está funcionalmente completo y desplegado en el entorno de trabajo, pendiente de liberación: todavía no hay usuarios ni datos reales de la comunidad escolar. Los expedientes que se atiendan en esta etapa corresponden a pruebas y capacitación.
>
> **Nota sobre la dirección del sistema.** La dirección de internet del panel se encuentra en una etapa temporal y migrará al subdominio institucional. Por esa razón este manual no incluye ninguna dirección escrita: en el texto se le llama siempre "la dirección del sistema". **La dirección vigente se la proporciona el Departamento de TI**; consérvela en los favoritos del equipo o del celular de caseta y actualícela cuando TI avise del cambio.

---

## Identificación del capítulo

| Concepto | Detalle |
|---|---|
| **Para quién es** | Personal del Departamento de TI del Instituto Asunción de Querétaro que instala los TAG y mantiene los expedientes al día. También sirve de referencia a Dirección y a Administración para saber qué puede y qué no puede hacer TI. |
| **Qué resuelve** | Todo el ciclo de vida operativo del TAG: instalarlo, actualizar los datos del vehículo, reponerlo, dar de baja el registro y atender las notas del buzón público que llegan sin folio. |
| **Qué necesita antes de empezar** | 1) Una cuenta activa con perfil **"TI"** (o **"Super"**). 2) El teléfono con la aplicación de autenticación, porque la verificación en dos pasos es obligatoria. 3) La dirección del sistema, proporcionada por el Departamento de TI. 4) El número del TAG físico que va a instalar, a la vista y legible. 5) Saber a qué estacionamientos tiene derecho la familia. |

> **Advertencia inicial y general.** **Ninguna acción de TI se puede deshacer desde el panel**: ni la instalación, ni la actualización, ni la baja, ni el uso del TAG apartado, ni el descarte de una solicitud o de una nota. Todas piden confirmación en una ventana previa, y **esa confirmación es la única oportunidad de arrepentirse**. Léala completa antes de pulsar.

---

## 1. Entrar al módulo de TI y entender lo que se ve

1. Abra la dirección del sistema e inicie sesión con su correo y su contraseña.
2. Complete la verificación en dos pasos con el código de 6 dígitos de su aplicación. **Sin ese segundo paso el sistema rechaza toda acción**, aunque alcanzara a ver una pantalla.
3. Si su cuenta todavía no tiene perfil, verá la pantalla **"Sin rol asignado"** con el mensaje **"Su cuenta ({correo}) aún no tiene un perfil del panel. Solicite al administrador del sistema que se lo asigne y vuelva a iniciar sesión para que se aplique."**. Pulse **"Cerrar sesión"** y solicite la asignación al administrador del sistema.
4. Con perfil **"TI"** entrará directo a la vista de TI: **no aparece la barra de pestañas**, porque su perfil tiene una sola vista. Con perfil **"Super"** sí verá la barra de pestañas de la cabecera, con **"Administración"**, **"TI"**, **"Finanzas"** y **"Consulta"** en ese orden.
5. En la cabecera se lee el título **"Panel de gestión de TAG"**, el subtítulo **"Administración y TI · IAQ"** y, a la derecha, su correo, la etiqueta de su perfil y el botón **"Salir"**.
6. Mientras el sistema trae los expedientes aparece la leyenda **"Cargando registros…"**. Espere; no vuelva a pulsar.
7. Si la carga falla verá el aviso en rojo con el enlace **"Reintentar"**; cuando el sistema no puede explicar el motivo, el texto es **"No se pudieron cargar los registros."**.

**Resultado:** queda en la pantalla de inicio de TI, con los cuatro botones de cola y, debajo, el **"Padrón completo (N)"**.

**Las cuatro colas de trabajo:**

| Botón | Leyenda que lo acompaña | Para qué sirve |
|---|---|---|
| **"Instalar TAG"** | **"En espera de instalación"** | Colocar el TAG en los vehículos que ya pagaron. |
| **"Actualizar datos"** | **"Placas, vehículo o reposición de TAG"** | Cambios de placas, vehículo, color, procedencia, estacionamiento y reposición de TAG. |
| **"Dar de baja"** | **"Egresos y cancelaciones"** | Egresos y cancelaciones. |
| **"Notas sin expediente"** | **"Buzón sin folio: vincular o descartar"** | Recados del buzón público que llegaron sin folio. |

> **Advertencia.** Mientras los registros no se hayan cargado, los contadores **no se pintan en verde** y **no aparece "Todo al día"**. Si ve el error de carga, no dé por hecho que no hay trabajo pendiente: primero pulse **"Reintentar"**.

---

## 2. Leer la prioridad: contadores y distintivo de días de espera

El sistema ya prioriza el trabajo. No hace falta ordenar nada a mano.

1. Observe el **contador redondo** de cada cola en el inicio. Funciona como semáforo: **verde** cuando vale 0, **amarillo** de 1 a 4, **rojo** de 5 en adelante.
2. Tome en cuenta que el contador de **"Instalar TAG"** suma **dos grupos**: los que ya se pueden instalar **más** los que están esperando el pago. Los otros tres contadores cuentan solo lo que TI puede resolver de inmediato.
3. Entre a cualquier cola. Las tarjetas llegan ordenadas **de la petición más antigua a la más nueva**: hasta arriba está la familia que más lleva esperando.
4. En **"Instalar TAG"**, la espera se cuenta desde la fecha del pago más antiguo del registro; si no hay pago, desde el alta.
5. En **"Actualizar datos"** y **"Dar de baja"**, la espera se cuenta desde la petición pendiente más antigua de ese trámite: una solicitud con folio o una nota del buzón ya vinculada que pidió ese trámite.
6. Lea el **distintivo** de la cabecera de cada tarjeta: dice **"hoy"** el mismo día, **"hace 1 día"** al día siguiente y **"hace N días"** después. Al posar el cursor sobre él aparece **"Solicitado el {fecha}"**.
7. Interprete el color del distintivo:

| Color del distintivo | Días de espera | Cómo leerlo |
|---|---|---|
| Verde | 0 a 2 días | Reciente. Sin prisa. |
| Ámbar | 3 a 6 días | Conviene atenderla pronto. |
| Rojo | 7 días o más | Urgente: lleva una semana o más esperando. |

8. Recuerde dónde aparece el distintivo: en las tarjetas de las colas, en **"Con solicitud pendiente"** y en la fecha de cada nota del buzón. **No aparece** en el **"Padrón completo"** ni en los resultados de **"Atender a alguien más"**.
9. El **"Padrón completo"** usa un orden distinto, pensado para no perder de vista lo pendiente: primero lo que TI puede resolver ya (por instalar), luego las bajas pendientes, luego las actualizaciones pendientes, después lo que está por cobrar (le toca a Administración) y al final lo que no tiene ningún pendiente.

**Resultado:** sabe a quién atender primero con solo mirar la pantalla, y el color del distintivo le avisa si algo se está quedando rezagado.

---

## 3. Instalar un TAG desde la cola "Instalar TAG"

Es el procedimiento principal de TI y el que se realiza en el estacionamiento, junto al vehículo.

1. En el inicio pulse **"Instalar TAG"**. La pantalla se abre con **"← Inicio"** y el título **"Instalar TAG"**.
2. Si no hay trabajo, verá **"✓ No hay TAGs pendientes de instalar. Todo al día."**.
3. Toque la cabecera de la tarjeta de la persona para abrir su expediente. Al abrirse, la tarjeta sube sola al inicio visible de la pantalla.
4. Revise el detalle antes de tocar nada: **"Gestionante (paga y firma)"** (dice **"El mismo conductor"** cuando coinciden), **"Procedencia TAG"**, **"TAG apartado"** si lo hay, **"Pagos"**, **"Estacionamiento"**, **"Instalado"** y **"Observaciones"**.
5. En **"Estacionamiento (acceso del TAG)"** toque los chips de los estacionamientos que le corresponden a esa familia (E1, E2, …). **Puede elegir más de uno.** Vienen preseleccionados los que el registro ya traiga.
6. Capture el número en el campo **"No. de TAG (6–11 dígitos)"**. El campo **solo acepta dígitos** y admite un máximo de 11; el ejemplo que muestra es **"Ej. 9426780"**.
7. Revise la casilla **"La familia trae su propio TAG (se aparta el de la escuela)"**. **Llega ya marcada si en el alta la familia declaró que trae su propio TAG**, y en ese caso la etiqueta del campo ya dice **"No. de TAG (6–11 dígitos) — el propio de la familia"**. Márquela si la familia trajo su dispositivo y **desmárquela si el TAG que va a instalar es de la escuela**: esta casilla es la que decide la procedencia que queda guardada en el expediente.
8. **Solo si marcó esa casilla**, puede capturar el **"No. del TAG apartado (opcional, 6–11 dígitos)"** con el número del TAG de la escuela que queda reservado. La pantalla lo explica: **"Queda reservado, sin instalar, para una reposición futura."**. El campo es opcional; puede dejarlo vacío.
9. Revise **"Instalado por"**. Llega prellenado con el nombre derivado del correo de la sesión y **es editable**: corríjalo si quien está instalando es otra persona.
10. Pulse el botón grande. Dice **"Instalar y activar TAG {número}"** en cuanto el número es válido, y **"Instalar y activar"** mientras no lo es.
11. Lea completo el diálogo **"Instalar y activar TAG"**. Repite el número, el vehículo, la persona y los estacionamientos: *"Se instalará el TAG {número} en el {marca} {modelo} {color} ({placas}) de {titular}, con acceso a {estacionamientos}, y el registro quedará activo."*, más **"Se apartará el TAG {número} de la escuela."** si aplica, más **"El TAG quedará marcado como escuela."** o **"El TAG quedará marcado como propio."** cuando la procedencia cambie respecto de lo que traía el expediente, y termina con **"Revise bien el número. ¿Continuar?"**.
12. Pulse **"Instalar"** para ejecutar, o **"Cancelar"** para volver sin cambios.

**Resultado:** el registro pasa a estado **"Activo"**, queda con su número de TAG y sus estacionamientos, sale de la cola de instalación y aparece el aviso verde **"TAG {número} instalado y activado ({folio})."** (seguido de **"TAG {número} apartado."** si se apartó uno). La pantalla se desplaza hasta el aviso para que usted lo lea.

**Validaciones que puede encontrar en esta pantalla:**

- Si no seleccionó ningún estacionamiento aparece **"Elija al menos un estacionamiento."** y el botón queda deshabilitado. **Al instalar, el estacionamiento es obligatorio.**
- Si el número tiene menos de 6 dígitos o el formato no cuadra, el campo se pinta en rojo y muestra **"Lleva {n} dígitos; deben ser de 6 a 11."** (en singular, **"Lleva 1 dígito; deben ser de 6 a 11."**), y el botón queda deshabilitado.
- Si el número apartado tampoco tiene de 6 a 11 dígitos, aparece el mismo aviso y el botón se deshabilita.
- Si el número apartado es idéntico al que se está instalando, aparece **"El TAG apartado no puede ser el mismo que el que se instala."**.
- El botón también permanece deshabilitado mientras haya una operación en curso. Espere; no vuelva a pulsar.

> **Advertencia.** Un TAG sin acceso a ningún estacionamiento no le sirve de nada a la familia. Verifique los chips seleccionados **antes** de confirmar: después, corregirlos exige entrar de nuevo por **"Actualizar datos"**.

> **Advertencia.** El número se teclea a mano y **el sistema no puede saber si usted leyó mal el dispositivo**. Por eso el diálogo insiste con **"Revise bien el número. ¿Continuar?"**. Compare el número en pantalla contra el TAG físico antes de pulsar **"Instalar"**.

**Rechazos que puede devolver el sistema al confirmar:**

- **"El TAG {número} ya esta activo en otro registro ({folio})"** o **"El TAG {número} ya esta activo en otro registro"** — ese número ya está en uso; revise el dispositivo.
- **"El TAG {número} ya esta apartado en otro registro"** y **"El TAG apartado {número} ya esta activo en otro registro"**.
- Un aviso de que el registro ya tiene TAG instalado — la reposición no se hace aquí, sino desde **"Actualizar datos"**.
- **"Solo se instala TAG en registros pendientes (este esta en {estado})"**.
- **"Elija al menos un estacionamiento antes de instalar el TAG"**.
- **"El TAG apartado no puede ser el mismo que el TAG que se instala"**.
- **"Solo se aparta un TAG cuando la familia usa su propio TAG (procedencia propio)"** — solo se aparta el TAG de la escuela cuando la familia trae el suyo.
- **"El registro esta dado de baja"** / **"El registro ya esta dado de baja"**.
- **"Estacionamiento invalido o inactivo: {claves}"** — reporte el caso al responsable del catálogo de estacionamientos.

---

## 4. Instalar un TAG desde el "Padrón completo", sin pasar por la cola

Sirve cuando la familia se presenta directamente y usted ya tiene su nombre o sus placas.

1. Desde la pantalla de inicio de TI, escriba en **"Buscar por nombre, placa, No. de TAG o folio…"**.
2. Si no hay coincidencias verá **"Sin resultados para «{lo buscado}»."**; si el padrón está vacío, **"Aún no hay registros en el padrón."**.
3. Toque la tarjeta para abrirla.
4. Pulse el chip **"Instalar TAG"**. Este chip **solo aparece** si el registro está pendiente, no tiene TAG y **ya tiene pago registrado**.
5. Continúe con el mismo formulario y la misma confirmación de la sección 3.

**Resultado:** el efecto es idéntico al de instalar desde la cola.

> **Nota.** Si el registro no tiene pago, el chip **"Instalar TAG"** simplemente no está y en su lugar se lee **"Sin pago registrado: el TAG se instala después del pago (Administración)."**. No es una falla del sistema ni de su perfil.

---

## 5. Qué hacer con un registro que está "Esperando pago"

1. Entre a **"Instalar TAG"**.
2. Baje a la sección atenuada **"Esperando pago (N)"**, debajo de los registros que sí puede instalar.
3. Abra la tarjeta si necesita revisar el expediente.
4. Lea el aviso: **"Falta registrar el pago en Administración; el TAG se instala después del pago."**.
5. **Aquí no hay formulario ni botón.** Avise a Administración para que registre el cobro. **La pantalla no se actualiza sola:** cuando Administración le confirme el cobro, recargue la página o vuelva a entrar a la cola. Entonces el registro dejará de estar en **"Esperando pago"** y pasará a la parte de arriba, entre los que sí puede instalar.

**Resultado:** el expediente está en la fila de instalación, pero el siguiente paso le corresponde a Administración.

> **Advertencia.** No intente forzar la instalación por otra vía. El sistema la rechaza con **"El registro no tiene pago: el TAG se instala despues del pago"**. La separación entre cobro e instalación es una regla del control interno, no un obstáculo técnico.

---

## 6. Atender una actualización de datos

Cubre placas, vehículo, color, procedencia, estacionamiento y reposición del TAG.

1. En el inicio pulse **"Actualizar datos"**.
2. Las peticiones aparecen bajo **"Con solicitud pendiente (N)"**, ordenadas de la más antigua a la más nueva y con su distintivo de espera. **Si no hay ninguna pendiente, ese encabezado no aparece** y la pantalla arranca directo en **"Atender a alguien más"**: a diferencia de **"Instalar TAG"** y de **"Notas sin expediente"**, estas dos colas no muestran ningún mensaje de **"Todo al día"**.
3. Si la persona llega **sin haber pedido nada**, use la sección **"Atender a alguien más"**. Antes de escribir se lee **"Busque el registro de la persona para actualizar sus datos."**; escriba en **"Buscar por nombre, placa, No. de TAG o folio…"**.
4. Abra la tarjeta del expediente.
5. Revise el primer campo:
   - Si el registro **ya tiene TAG**, se llama **"No. de TAG (cambiarlo registra una reposición)"**.
   - Si **no tiene TAG**, en su lugar se lee **"Este registro aún no tiene TAG; el número se captura desde «Instalar TAG»."**.
6. Ajuste **"Placas"** (el ejemplo es **"Ej. UAB1234"**) o marque **"Sin placas (permiso/nuevo)"**, que deshabilita el campo de placas.
7. Ajuste **"Marca"** y **"Modelo"**.
8. Ajuste **"Color"**.
9. Escriba el **"Motivo (opcional)"** del cambio; el ejemplo que sugiere es **"Ej. placas nuevas, TAG dañado"**.
10. Revise **"Procedencia del TAG"**. Las dos opciones son **"Escuela"** y **"Propio (la familia trae su TAG)"**.
11. Ajuste los chips de **"Estacionamiento (acceso del TAG)"**. **Aquí sí puede dejarlo sin ninguno**, y el registro queda **"Sin asignar"**, a diferencia de la instalación.
12. Revise **"Atendido por"**: llega prellenado y es editable.
13. Pulse **"Guardar cambios"**. Mientras no haya modificado nada, el botón está apagado y abajo se lee **"Modifique algún dato para poder guardar."**.
14. Lea el diálogo **"Actualizar registro"**, que resume literalmente cada cambio con el texto *"Cambios en {folio} ({titular}): {resumen}. ¿Guardar?"*.
15. Pulse **"Guardar cambios"** para ejecutar, o **"Cancelar"**.

**Resultado:** los cambios se aplican en una sola operación (datos y estacionamiento a la vez), la solicitud o la nota de actualización pendiente se cierra sola y aparece el aviso verde **"Registro {folio} actualizado."**.

> **Advertencia sobre la reposición.** Cambiar el **"No. de TAG"** en esta pantalla **no es una corrección de dato**: queda registrada como **reposición** y **el TAG anterior queda inactivo de forma permanente**. Antes de guardar, el sistema lo advierte con **"El TAG {anterior} quedará inactivo."**. Úselo únicamente cuando el dispositivo realmente se cambió.

**Validaciones que puede encontrar:**

- Si el registro ya tiene TAG y el número queda fuera del rango, aparece **"El No. de TAG debe tener de 6 a 11 dígitos."** y **"Guardar cambios"** se deshabilita.
- Si desmarca **"Sin placas (permiso/nuevo)"** y deja el campo vacío, el campo se pinta en rojo y no se puede guardar. El sistema lo repite con **"Captura las placas o marca sin placas"**.
- Si no modificó nada, se lee **"Modifique algún dato para poder guardar."**; el sistema lo repite con **"No hay cambios que guardar"**.
- Si el registro tiene un TAG apartado y usted elige **"Escuela"** en **"Procedencia del TAG"**, aparece **"Este registro tiene un TAG apartado ({número}). Para pasar a escuela, use «Usar TAG apartado» desde el expediente."** y no se puede guardar. Vea la sección 7.

> **Nota sobre el alcance del formulario.** **"Actualizar datos"** cubre únicamente el TAG, las placas, la marca, el modelo, el color, la procedencia y el estacionamiento. **Desde TI no se pueden corregir el nombre del titular, el gestionante, el tipo de usuario ni los datos del alumno**, y las **"Observaciones"** se muestran en el detalle solo si el registro ya las trae: no hay campo para escribirlas ni para editarlas. Si un dato de esos está mal, repórtelo al responsable del sistema con el folio a la mano.

---

## 7. Reponer el TAG usando el que quedó apartado

Aplica cuando la familia trajo su propio dispositivo, se le apartó un TAG de la escuela al instalar, y ahora el TAG en uso se dañó o se perdió.

1. Abra el expediente en **"Actualizar datos"**, ya sea desde la cola o con el chip **"Actualizar datos"** del padrón.
2. Si el registro tiene reserva, arriba del formulario aparece un aviso destacado que empieza con **"Reinstalación con el TAG apartado."** y continúa con **"Este registro tiene reservado el TAG {número}."** y **"Si el TAG actual ({número}) se dañó o se perdió, actívelo: el apartado queda en uso, la procedencia pasa a escuela y el TAG anterior queda inactivo."**.
3. **Confirme con la familia** que el TAG actual efectivamente se dañó o se perdió. Este paso no es opcional.
4. Pulse el botón **"Usar el TAG apartado {número}"**.
5. Lea el diálogo **"Usar el TAG apartado"**: *"Se activará el TAG apartado {número} en {folio} ({titular}). El TAG actual {número} quedará inactivo y la procedencia pasará a escuela. ¿Continuar?"*.
6. Pulse **"Usar TAG apartado"** para ejecutar, o **"Cancelar"**.

**Resultado:** el TAG apartado pasa a ser el TAG activo del registro, la procedencia queda en escuela, **la reserva se borra** y el TAG anterior queda inactivo. Aviso verde: **"TAG apartado {número} activado en {folio}. El anterior quedó inactivo."**.

> **Advertencia. Esta acción no tiene vuelta atrás.** Deja inactivo el TAG que estaba en uso, cambia la procedencia a escuela y **borra la reserva**. No existe ningún botón para quitar la reserva ni para editar el número apartado después de instalar: la reserva solo se consume ejecutando esta acción. Úsela únicamente cuando el TAG actual realmente se dañó o se perdió.

> **Nota.** Si el registro no tiene reserva, el aviso y el botón no aparecen. Si aun así se intentara la acción, el sistema responde **"Este registro no tiene un TAG apartado"**.

---

## 8. Dar de baja un registro

1. En el inicio pulse **"Dar de baja"**.
2. Localice el expediente bajo **"Con solicitud pendiente (N)"** o búsquelo en **"Atender a alguien más"**, donde antes de escribir se lee **"Busque el registro de la persona para darla de baja."**.
3. Abra la tarjeta.
4. Revise el **"Motivo de baja"**. Si había una petición de baja pendiente —una solicitud con folio o una nota del buzón ya vinculada que pidió baja—, el campo llega **prellenado con su detalle**. Si no, escríbalo; el ejemplo que sugiere es **"Ej. egreso, cambio de vehículo"**. **Es obligatorio.**
5. Revise **"Atendido por"**.
6. Pulse el botón rojo **"Dar de baja"**. Está apagado mientras el motivo esté vacío o solo tenga espacios; el sistema lo repite con **"Indique el motivo de la baja"**.
7. Lea el diálogo **"Dar de baja"**: *"Se dará de baja el registro {folio} ({titular}) y su TAG quedará inactivo. ¿Continuar?"*.
8. Pulse el botón rojo **"Dar de baja"** para ejecutar, o **"Cancelar"**.

**Resultado:** el registro queda en estado **"Baja"** con su motivo y su fecha, el TAG queda inactivo y se cierran las peticiones de baja pendientes. Aviso verde: **"Registro {folio} dado de baja."**.

> **Advertencia. La baja es definitiva desde el panel.** No existe ningún botón para reactivar el registro ni para revertir la baja. En adelante, la tarjeta pierde todos sus chips de acción y solo muestra **"Registro dado de baja el {fecha} — {motivo}."**. Cualquier intento posterior de actuar sobre ella se rechaza con **"El registro ya esta dado de baja"**.

> **Advertencia.** El motivo que usted escriba es el único rastro de por qué se dio de baja. Escriba algo que le sirva a quien revise el expediente meses después: "egreso de la alumna al terminar el ciclo" explica; "baja" no explica nada.

---

## 9. Vincular una nota del buzón al expediente correcto

El buzón público recibe recados de personas que no tienen su folio a la mano. La nota **no es un trámite todavía**: se vuelve trámite cuando TI la vincula a un expediente.

1. En el inicio pulse **"Notas sin expediente"**.
2. Si no hay nada verá **"✓ No hay notas sin expediente. Todo al día."**.
3. Lea la instrucción de la pantalla: **"Notas del buzón público (sin folio). Búsquelas por nombre y vincúlelas al expediente correcto, o descártelas si son spam."**.
4. Cada nota se muestra ya desplegada y llegan de la más antigua a la más reciente. Revise **"Solicitante"**, **"Quién solicita"** (**"padre/madre/tutor"**, **"maestro"**, **"administrativo"** o **"alumno"**), **"Pidió"**, **"Alumno"**, **"Grado"**, **"Coche"**, **"Fecha"** (con su distintivo de espera) y **"Qué necesita"**.
5. Pulse el chip **"Vincular a un expediente"**.
6. En **"Busque el expediente por nombre, placa o folio"** escriba el nombre del alumno o del titular; el campo sugiere **"Nombre del alumno o del titular…"**. Antes de escribir se lee **"Escriba para buscar el expediente al que corresponde esta nota."**, y sin coincidencias, **"Sin resultados para «{lo buscado}»."**.
7. Revise los resultados. Se muestran **como máximo 8** y **nunca aparecen registros dados de baja**. Cada uno muestra el titular, el vehículo, el folio y el TAG o **"sin TAG"**.
8. Pulse **"Elegir este expediente"** en el correcto. Queda a la vista como **"Expediente: {folio} — {titular}"**; si se equivocó, use el enlace **"cambiar"** para volver a buscar.
9. **Corrobore el trámite.** La pantalla pregunta **"El cliente pidió {trámite}. ¿Qué trámite corresponde?"** y ofrece los chips **"Actualizar datos"** y **"Dar de baja"**. Arranca marcado el que pidió la persona; **cámbielo si al hablar con ella el trámite real es otro**.
10. Pulse **"Vincular como {Actualizar datos o Dar de baja}"**.
11. Lea el diálogo **"Vincular nota al expediente"**: *"Se vinculará la nota de {solicitante} al expediente {folio} ({titular}) y aparecerá en «{cola}»."*. Si usted cambió el trámite, el mensaje lo advierte expresamente con **"El cliente había pedido {X}; se atenderá como {Y}."**.
12. Pulse **"Vincular"** para ejecutar, o **"Cancelar"**.

**Resultado:** la nota deja el buzón y queda colgada del expediente como petición pendiente del trámite corroborado, por lo que el expediente entra a esa cola. La pantalla **salta sola a la cola de destino** con el expediente ya abierto y el buscador limpio, listo para ejecutar el trámite. Aviso verde: **"Nota vinculada a {folio}. Aparece en «{cola}»."**.

> **Advertencia.** Vincular una nota al expediente equivocado le crea un pendiente falso a una familia que no pidió nada. **Verifique el nombre del alumno y el vehículo** antes de pulsar **"Elegir este expediente"**.

> **Advertencia sobre el cierre automático.** La nota se cierra sola **solo si el trámite coincide**. Si usted vincula como **"Actualizar datos"** y después termina dando de baja el registro, **la nota no se cierra sola**: hay que cerrarla a mano con **"Cerrar esta nota…"** desde el expediente (sección 11).

**Notas y rechazos que conviene conocer:**

- **Instalar ya no es un trámite que se pueda pedir por el buzón.** Al vincular, TI solo puede corroborar **"Actualizar datos"** o **"Dar de baja"**.
- El buscador de la nota **no busca por número de TAG** (a diferencia del buscador del padrón): busca por titular, gestionante, placas, folio, marca y modelo.
- **Un expediente admite una sola nota pendiente a la vez.** Si llega otra, el sistema responde **"Ese expediente ya tiene una nota pendiente; cierrala antes de vincular otra"**: primero cierre la anterior.
- Si un compañero atendió la nota antes que usted, verá **"La nota ya esta vinculada a un expediente"** o **"La nota ya estaba cerrada"**. También pueden aparecer **"Nota no encontrada"** y **"Esta solicitud no es una nota sin expediente"**.

---

## 10. Descartar una nota improcedente del buzón

Para spam, datos falsos o recados que no proceden.

1. En el inicio pulse **"Notas sin expediente"**.
2. Localice la nota y **lea su contenido completo antes de decidir**.
3. Pulse el chip **"Descartar"**.
4. Escriba el motivo en **"¿Por qué se descarta?"**; el campo sugiere **"Ej. spam, datos falsos, no procede"**. **Es obligatorio.**
5. Pulse **"Descartar nota"**. El botón está apagado mientras el motivo esté vacío; el sistema lo repite con **"Indique por que se descarta la solicitud"**. Si se arrepintió, pulse **"Cancelar"**, que limpia el motivo y cierra el bloque.
6. Lea el diálogo **"Descartar nota"**: *"Se descartará la nota de {solicitante} sin vincularla a ningún expediente. Motivo: {motivo}. ¿Continuar?"*, y pulse el botón rojo **"Descartar"**, o **"Cancelar"**.

**Resultado:** la nota se cierra con su motivo y desaparece del buzón sin haber tocado ningún expediente. Aviso verde: **"Nota descartada."**.

> **Advertencia.** **No hay forma de recuperar una nota descartada desde el panel.** Si duda entre descartar y vincular, no descarte: consulte primero. El motivo queda guardado, así que escriba algo que explique la decisión a quien lo revise después.

---

## 11. Descartar una solicitud o cerrar una nota desde el expediente

Sirve cuando la petición ya no procede: se atendió por otra vía, está duplicada o el dato era incorrecto. **Cierra la petición sin modificar el registro.**

1. Abra la tarjeta del registro, desde el **"Padrón completo"** o desde cualquiera de las colas.
2. En el detalle, debajo de los datos, aparece una línea por cada petición pendiente: **"Solicita actualización ({fecha}): {detalle}"**, **"Solicita baja ({fecha}): {detalle}"** o **"Nota de {nombre} ({rol}) — pidió {trámite} ({fecha}): {detalle}"**.
3. Pulse el enlace que corresponda:
   - **"Descartar esta solicitud sin aplicar cambios…"** si es una solicitud con folio.
   - **"Cerrar esta nota…"** si es una nota del buzón ya vinculada.
4. Escriba el motivo. Para una solicitud, el campo es **"¿Por qué se descarta?"** y sugiere **"Ej. ya estaba aplicado, duplicada, no procede"**. Para una nota, es **"¿Por qué se cierra?"** y sugiere **"Ej. ya se atendió, no procede, dato incorrecto"**. **Es obligatorio.**
5. Pulse **"Descartar solicitud"** o **"Cerrar nota"**. El botón está apagado sin motivo. **"Cancelar"** cierra el bloque y borra lo escrito.
6. Confirme en el diálogo **"Descartar solicitud"** o **"Cerrar nota"** con el botón rojo **"Descartar"** o **"Cerrar nota"**.

**Resultado:** la petición se cierra con su motivo y el expediente sale de esa cola, **sin que se haya modificado ningún dato del registro**. Aviso verde: **"Solicitud descartada ({folio})."** o **"Nota cerrada ({folio})."**.

> **Nota.** Si otro compañero ya la había cerrado, el sistema responde **"La solicitud ya estaba cerrada"**. Recargue la pantalla y continúe con el siguiente pendiente.

---

## 12. Buscar un expediente en el "Padrón completo"

1. Quédese en la pantalla de inicio de TI.
2. Escriba en **"Buscar por nombre, placa, No. de TAG o folio…"**. La búsqueda revisa el titular, el gestionante, las placas, el número de TAG, el folio, la marca y el modelo.
3. El contador del título **"Padrón completo (N)"** refleja lo que se está mostrando en ese momento.
4. Abra la tarjeta que busca. En la cabecera verá las placas —o **"SIN PLACAS"** resaltado en amarillo si el vehículo no tiene—, el chip de estado (**"Pendiente"**, **"Activo"**, **"Bloqueado"** o **"Baja"**), el vehículo, el titular con su tipo, y la línea de folio, estacionamientos y TAG (o **"sin TAG"**).
5. Use los chips de acción de la tarjeta según lo que necesite: **"Actualizar datos"** y **"Dar de baja"** aparecen en todos los expedientes, salvo en los dados de baja, que no muestran ningún chip. **"Instalar TAG"** aparece únicamente si el registro está pendiente, no tiene TAG y ya tiene pago registrado.

**Resultado:** llega a cualquier expediente del padrón, esté o no en una cola, y puede actuar sobre él sin salir del inicio.

> **Nota.** El resaltado amarillo de **"SIN PLACAS"** es **una señal operativa deliberada** —permiso de circulación o unidad nueva—, no un error de captura.

> **Nota.** Pulsar **"← Inicio"** limpia el buscador, la selección y los avisos de éxito o de error de la pantalla anterior.

---

## 13. Consultar la bitácora de movimientos (pestaña "Consulta")

> **Esta pestaña no está disponible para el perfil "TI".** Se describe aquí para que el Departamento de TI sepa dónde vive el historial de un expediente y a quién solicitarlo. Se abre con un perfil de **"Administración"**, **"Consulta"** o **"Super"**.

1. En la cabecera del panel pulse **"Consulta"**.
2. Arriba se leen tres indicadores: **"Pendientes"** (con semáforo: verde en 0, amarillo de 1 a 4, rojo de 5 en adelante), **"Registros"** y **"Activos"**.
3. Escriba en **"Buscar por nombre, placa, No. de TAG o folio…"** para acotar por texto.
4. Pulse el botón **"Filtros"** para desplegar la barra; se cierra con la misma flecha.
5. En **"Estado"** toque los chips que necesite: **"Pendiente"**, **"Activo"**, **"Bloqueado"**, **"Baja"**. Solo se ofrecen los estados que realmente existen en el padrón, y varios chips suman.
6. En **"TAG"** elija **"Con TAG"** o **"Sin TAG"**. Son excluyentes: al tocar el que ya estaba activo, se apaga.
7. En **"Estacionamiento"** toque las claves que necesite; solo se ofrecen las que realmente están asignadas, y varias suman.
8. En **"Vehículo"** toque **"Sin placas"** para ver únicamente los de permiso o unidad nueva.
9. Cierre la barra si quiere leer con la pantalla limpia: los filtros activos quedan como píldoras junto al botón **"Filtros"**, que además muestra cuántos hay aplicados. Cada píldora se quita con su **"×"**.
10. Pulse **"Limpiar"** para quitar todos los filtros de golpe.
11. Abra una tarjeta para ver el expediente completo y, debajo, la **"Bitácora"** con las columnas **"Fecha"**, **"Tipo"**, **"Motivo"** y **"Por"**. La bitácora solo aparece si el registro tiene movimientos.

**Resultado:** se obtiene la lista filtrada del padrón y, al abrir cada expediente, su historial completo de movimientos —alta, baja, reposición, cambio, prueba, bloqueo y rectificación— con quién los hizo. Desde aquí **no se puede ejecutar ninguna acción**, tal como lo indica el aviso permanente **"Vista de solo consulta: las acciones se ejecutan desde Administración o TI, según corresponda."**.

> **Nota.** **"Limpiar"** borra los filtros de chips pero **no** el texto del buscador. Si sigue viendo pocos resultados, revise también el campo de búsqueda. Si nada coincide, aparece **"Sin resultados con los filtros actuales."**.

---

## 14. Guía rápida de mensajes del sistema

| Mensaje en pantalla | Qué significa y qué hacer |
|---|---|
| **"Cargando registros…"** | El sistema está trayendo los expedientes. Espere; no vuelva a pulsar. |
| **"No se pudieron cargar los registros."** | No se pudo leer el padrón o el buzón. Pulse **"Reintentar"**. No dé por hecho que no hay pendientes. |
| **"Se requiere sesion con segundo factor (MFA)"** | La sesión no completó la verificación en dos pasos. Salga y vuelva a entrar capturando el código. |
| **"La sesion expiro. Cierre sesion y vuelva a entrar."** | Su sesión caducó. Pulse **"Salir"** y entre de nuevo. |
| **"Sin conexion con el servidor. Revise su red e intente de nuevo."** | Falla de red, frecuente en el estacionamiento. Acérquese a una zona con señal y repita la acción. |
| **"Su usuario no tiene el rol requerido (ti)"** / **"Su usuario no tiene permiso para esta accion. Verifique su rol con el administrador."** | Su cuenta no tiene el perfil necesario. Solicite el ajuste al administrador del sistema. |
| **"Elija al menos un estacionamiento."** | Al instalar es obligatorio marcar al menos un estacionamiento. |
| **"Lleva {n} dígitos; deben ser de 6 a 11."** | El número de TAG está incompleto o mal capturado. |
| **"Modifique algún dato para poder guardar."** | No cambió nada en el formulario de actualización. |
| **"El TAG {anterior} quedará inactivo."** | Aviso previo de reposición: el TAG que estaba en uso dejará de funcionar. |
| **"Sin pago registrado: el TAG se instala después del pago (Administración)."** | El cobro no se ha registrado. Avise a Administración. |
| **"Registro dado de baja el {fecha} — {motivo}."** | El expediente está en baja. Ya no admite ninguna acción. |

Los avisos de éxito y de error se muestran **arriba de las tarjetas**, y la pantalla se desplaza sola hasta ellos después de cada acción.

> **Advertencia.** Si no ve el resultado de lo que hizo, **suba en la pantalla**: el aviso está ahí. **No vuelva a pulsar el botón.**

---

## 15. Advertencias que conviene recordar

- Todo el módulo de TI exige **sesión con segundo factor** y perfil **"TI"** o **"Super"**. Un perfil de Administración o de Consulta no puede ejecutar estas acciones aunque llegara a la pantalla.
- El perfil **"TI"** tiene **una sola vista**: no ve **"Administración"**, ni **"Finanzas"**, ni **"Consulta"**, y por eso no se dibuja la barra de pestañas. Es lo normal.
- **Nada de lo que hace TI se puede deshacer desde el panel.** La ventana de confirmación es la última oportunidad de detenerse.
- **La baja es definitiva.** No hay botón para reactivar ni para revertir.
- Cambiar el **"No. de TAG"** en **"Actualizar datos"** **registra una reposición** y deja el TAG anterior inactivo de forma permanente.
- **"Usar el TAG apartado"** deja inactivo el TAG en uso, pasa la procedencia a escuela y borra la reserva.
- Descartar una nota del buzón **no se puede revertir** y no vincula a nadie.
- El cierre automático de la nota es **por coincidencia de trámite**. Si aplica un trámite distinto al vinculado, ciérrela a mano.
- Un expediente admite **una sola nota pendiente** a la vez.
- Los campos **"Instalado por"** y **"Atendido por"** se prellenan con el nombre derivado del correo de la sesión, **pero no se conservan entre sesiones a propósito**: los dispositivos de caseta son compartidos y no se debe atribuir una acción a quien inició sesión antes. **Corrija el nombre si quien atiende es otra persona.**
- Si deja **"Instalado por"** o **"Atendido por"** en blanco, el movimiento se registra a nombre de **"TI"**, sin nombre de persona.
- Al instalar, el estacionamiento es **obligatorio**; al actualizar **sí** se puede dejar sin ninguno y el registro queda **"Sin asignar"**. Un TAG sin acceso a ningún estacionamiento no sirve: revise antes de guardar.
- TI **no** puede instalar sin pago registrado. El cobro lo hace Administración.
- **Las pantallas no se actualizan solas.** Las colas y los contadores se refrescan al ejecutar una acción o al recargar la página. Si un compañero atiende algo, usted no lo verá hasta su siguiente acción o recarga; por eso conviene recargar antes de una jornada larga.
- Pulsar **"← Inicio"** limpia el buscador, la selección y los avisos de la pantalla anterior.

---

## 16. Trámites que se atienden fuera del módulo de TI

Los siguientes asuntos **no se resuelven con ningún botón de las pantallas de TI**. Se gestionan de forma directa con el área que corresponde:

| Asunto | Con quién se atiende |
|---|---|
| Registrar o consultar un cobro | Administración. En el expediente, el apartado **"Pagos"** es de **solo lectura** para TI. |
| Dar de alta un registro nuevo | El alta la genera el formulario público. TI instala y mantiene, no da de alta. |
| Consultar la **"Bitácora"** de movimientos de un expediente | Administración, Consulta o Super, desde la pestaña **"Consulta"**. |
| Obtener una lista, un concentrado o un reporte del padrón | Administración o Dirección. TI no cuenta con exportación ni con reportes. |
| Alta, cambio o desactivación de estacionamientos, marcas o colores | El responsable del catálogo del sistema. No se administran desde ninguna pantalla del panel. |
| Reactivar un registro dado de baja, revertir una instalación o anular una reposición | No existe esa acción en el panel. Reporte el caso al responsable del sistema. |
| Bloquear o desbloquear un registro | No existe esa pantalla. El estado **"Bloqueado"** se muestra si el registro ya lo trae, pero el panel no lo produce. |
| Avisar a la familia de un trámite realizado | **El sistema no envía ningún aviso automático** por correo, mensaje ni WhatsApp al instalar, actualizar, dar de baja, vincular o descartar. Avisar es responsabilidad del personal, fuera del sistema. |
| Responder o contactar a quien dejó una nota en el buzón | Se hace por los medios habituales de la institución. El sistema no permite responder al buzón. |
| Corregir el nombre del titular, el gestionante, el tipo de usuario o los datos del alumno | No se editan desde TI. Repórtelo al responsable del sistema con el folio del expediente. |
| Agregar o modificar las **"Observaciones"** de un expediente | No hay campo editable en TI. Las observaciones solo se leen si el registro ya las trae. |

### 16.1. Funciones con las que el módulo de TI no cuenta

Convienen tenerlas presentes para no buscarlas en pantalla ni prometérselas a una familia:

- **No hay exportación ni impresión**: ni a hoja de cálculo, ni a PDF, ni comprobante, etiqueta, credencial o acuse. Lo que se necesite entregar por escrito se elabora fuera del sistema.
- **No hay avisos automáticos** a la familia al instalar, actualizar, dar de baja, vincular o descartar. Avisar es responsabilidad del personal.
- **No hay lector de código de barras ni escáner**: el número de TAG se teclea a mano, dígito por dígito.
- **No hay acciones en lote ni selección múltiple**: cada expediente se atiende de uno en uno.
- **No hay archivos adjuntos**: no se pueden subir fotografías ni documentos al expediente.
- **No se puede cambiar el orden de las colas ni del padrón**, ni filtrar por fecha o por antigüedad de espera. El orden lo fija el sistema por urgencia.
- **Sobre las notas del buzón, solo existen dos salidas**: vincular o descartar. No hay estados intermedios, ni asignación a un compañero, ni comentarios internos.
- **Una nota no se puede vincular a un registro dado de baja**: esos expedientes quedan fuera de la búsqueda del buzón de forma deliberada.

---

## 17. Preguntas frecuentes

**1. La familia ya está aquí con el coche, pero el registro aparece en "Esperando pago". ¿Puedo instalar y que paguen después?**
No. Esa sección está atenuada y **no tiene formulario ni botón**: el sistema rechaza la instalación con **"El registro no tiene pago: el TAG se instala despues del pago"**. Avise a Administración para que registre el cobro; en cuanto exista el pago, **recargue la pantalla o vuelva a entrar a la cola** y el expediente aparecerá en la parte de arriba de **"Instalar TAG"**, listo para instalarlo.

**2. Me equivoqué al teclear el número de TAG y ya confirmé la instalación. ¿Cómo lo deshago?**
No se deshace. **No existe ningún botón para revertir una instalación.** El camino es abrir el expediente en **"Actualizar datos"** y corregir el **"No. de TAG"**, pero tome en cuenta que **eso se registra como una reposición** y el número anterior queda inactivo de forma permanente. Por eso el diálogo insiste con **"Revise bien el número. ¿Continuar?"**: compare el número en pantalla contra el dispositivo físico antes de confirmar.

**3. Di de baja el registro equivocado. ¿Hay forma de reactivarlo?**
Desde el panel no. La tarjeta pierde todos sus chips de acción y solo muestra **"Registro dado de baja el {fecha} — {motivo}."**, y cualquier intento posterior se rechaza con **"El registro ya esta dado de baja"**. No hay **"Reactivar registro"** ni **"Quitar la baja"**. Reporte de inmediato el caso al responsable del sistema, con el folio a la mano.

**4. La persona dejó una nota pidiendo un cambio de placas, pero al hablar con ella resulta que se va del colegio. ¿Vinculo como actualización o como baja?**
Vincule como **"Dar de baja"**. En el paso de corroboración, la pantalla pregunta **"El cliente pidió {trámite}. ¿Qué trámite corresponde?"** y usted puede cambiar el chip: **lo que TI marca manda sobre lo que pidió la persona**. El diálogo lo advertirá con **"El cliente había pedido {X}; se atenderá como {Y}."** y la nota entrará a la cola de baja.

**5. Vinculé una nota como "Actualizar datos" pero terminé dando de baja el registro. La nota sigue apareciendo. ¿Es una falla?**
No. El cierre automático de la nota ocurre **solo cuando el trámite coincide** con el que quedó vinculado. Como usted aplicó un trámite distinto, hay que cerrarla a mano: abra el expediente, pulse **"Cerrar esta nota…"**, escriba el motivo en **"¿Por qué se cierra?"** y confirme con **"Cerrar nota"**.

**6. ¿Dónde veo el historial de lo que se le ha hecho a un TAG?**
No está dentro de las pantallas de TI. La **"Bitácora"** de movimientos —con **"Fecha"**, **"Tipo"**, **"Motivo"** y **"Por"**— se ve al abrir una tarjeta en la pestaña **"Consulta"**, que el perfil **"TI"** no tiene. Solicítela a Administración, a Consulta o a un perfil Super.
