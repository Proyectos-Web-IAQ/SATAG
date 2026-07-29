# Guía de Capacitación de SATAG

> **Sistema:** SATAG — Sistema de Adquisición de TAG Vehicular.
> **Institución:** Instituto Asunción de Querétaro, A.C.
> **Para quién es esta guía:** para la persona que imparte la capacitación (responsable de capacitación, jefatura de área o el propio Departamento de TI). No sustituye a los manuales: los usa como material de apoyo.
>
> **Nota sobre el estado del sistema.** SATAG está funcionalmente completo y desplegado en el entorno de trabajo, pendiente de liberación: todavía no hay usuarios ni datos reales de la comunidad escolar. Las sesiones que describe esta guía forman parte de esa etapa de pruebas y capacitación, previa a la puesta en marcha.
>
> **Nota sobre la dirección del sistema.** La dirección de internet de SATAG se encuentra hoy en una etapa temporal y migrará al subdominio institucional. Por esa razón esta guía no incluye ninguna dirección escrita: en el texto se le llama siempre "la dirección del sistema". **La dirección vigente se la proporciona el Departamento de TI**; solicítela antes de la sesión y verifique que abre correctamente en el equipo donde va a proyectar.

---

## Cómo se relaciona esta guía con los manuales

Esta guía **no repite** el contenido de los cuatro capítulos ya entregados: los organiza en el tiempo de una sesión y le indica qué demostrar, en qué orden y qué recalcar. Durante la capacitación, apóyese en:

| Capítulo | Para qué lo usará en la sesión |
|---|---|
| **Manual de Acceso al Panel** | El bloque de acceso y segundo factor, común a las dos sesiones. |
| **Manual de Administración** | El detalle de cada procedimiento de cobro y de corte de caja. |
| **Manual del Departamento de TI** | El detalle de instalación, actualización, baja y buzón. |
| **Manual del Usuario** | Lo que hacen los padres de familia por su cuenta. Sirve para que el personal sepa qué se le puede exigir al usuario y qué no. |

Entregue el capítulo que corresponda a cada participante **al inicio** de su sesión, no al final: durante las demostraciones conviene que sigan el texto y anoten en él.

---

## 1. Objetivo y duración de cada sesión

### 1.1. Sesión de Administración

| Concepto | Detalle |
|---|---|
| **Dirigida a** | Personal de Administración que recibe el pago del TAG, responde por la caja y cierra el corte. Se sugiere invitar también a la jefatura de la Dirección Administrativa como observadora. |
| **Duración** | **60 minutos**, sin receso. |
| **Objetivo** | Que al terminar, cada participante entre al panel por su cuenta, registre un cobro correctamente, consulte los pagos de un expediente, lea los indicadores de la pestaña "Finanzas" y cierre un corte de caja con conciliación de efectivo, entendiendo que ni el pago ni el corte se pueden deshacer. |
| **Número de participantes** | De 2 a 6. Con más de 6 personas no alcanza el tiempo para que cada quien ejecute su práctica. |
| **Perfil requerido** | **"Administración"**. |

### 1.2. Sesión de TI

| Concepto | Detalle |
|---|---|
| **Dirigida a** | Personal del Departamento de TI que instala los TAG y mantiene los expedientes al día. |
| **Duración** | **75 minutos**, sin receso. Si el grupo lo prefiere, puede partirse en dos sesiones: minutos 0 a 40 (instalación) y minutos 40 a 75 (mantenimiento y buzón). |
| **Objetivo** | Que al terminar, cada participante lea la prioridad de las cuatro colas, instale un TAG con su estacionamiento, atienda una actualización, entienda qué es una reposición, vincule o descarte una nota del buzón y dé de baja un registro, sabiendo que ninguna de esas acciones se deshace. |
| **Número de participantes** | De 2 a 5. |
| **Perfil requerido** | **"TI"**. |

### 1.3. Padres de familia: no se capacitan

El trámite de los padres, madres, tutores, maestros y alumnos es de **autoservicio** y debe explicarse solo. **No se programa ninguna sesión para ellos.** Lo que sí corresponde hacer:

1. Difundir la dirección del sistema por los canales habituales del Instituto.
2. Tener disponible el **Manual del Usuario** para quien lo solicite en ventanilla.
3. Asegurarse de que el personal de las dos sesiones conozca los tres avisos que más se preguntan en ventanilla, porque el sitio público **no** los resuelve: el folio se muestra una sola vez y no se puede recuperar desde el sitio, el sitio no cobra ni consulta el estado del trámite, y el sitio no envía correos ni mensajes.

---

## 2. Qué preparar antes de la sesión

Prepare esto **con dos o tres días de anticipación**. Si algo de la lista no está listo, posponga la sesión: una sesión detenida por un problema de acceso pierde su tiempo completo.

### 2.1. Cuentas con su perfil ya asignado

1. Solicite al administrador del sistema el alta de cada participante y la **asignación de su perfil**: **"Administración"** para la primera sesión y **"TI"** para la segunda.
2. Verifique que la invitación llegó al correo institucional de cada persona. **La invitación es de un solo uso y caduca**, así que no la envíe con semanas de anticipación.
3. Confirme que nadie quedó sin perfil. Una cuenta sin perfil abre la pantalla **"Sin rol asignado"** y no puede ver nada; corregirlo en plena sesión obliga a **"Cerrar sesión"**, esperar la asignación y volver a entrar.
4. Prepare **una cuenta suya** con el perfil que va a demostrar, para proyectar. No use la cuenta de un participante.

> **Advertencia.** El perfil se asigna fuera de la aplicación y **un cambio de perfil no se refleja en una sesión que ya está abierta**. Si a media sesión hay que corregir un perfil, esa persona deberá pulsar **"Salir"** y entrar de nuevo con correo, contraseña y código.

### 2.2. Segundo factor listo

1. Pida a cada participante que **instale la aplicación de autenticación en su teléfono antes de llegar** (por ejemplo Google Authenticator o Microsoft Authenticator). Instalarla en la sala consume diez minutos que no están presupuestados.
2. Decida si el alta del segundo factor se hace **antes** o **durante** la sesión. Se recomienda hacerla durante los primeros minutos, acompañada, porque es el punto donde más se equivoca la gente.
3. Tenga a la mano **hojas o el gestor de contraseñas institucional** para que cada quien guarde su clave de respaldo en el momento.
4. Pida que todos lleguen con el teléfono **cargado y a la mano**.

> **Advertencia crítica.** El código QR y la clave que aparece bajo **"¿No puede escanear? Escriba esta clave en su app"** se muestran **una sola vez**. Si alguien avanza sin guardarla y después pierde el teléfono, su cuenta queda bloqueada y solo el administrador del sistema puede restablecerla, fuera de la aplicación. Deténgase en ese punto y no continúe hasta que **todos** confirmen que ya guardaron su clave.

### 2.3. El caso de práctica

Las acciones de SATAG **no se deshacen**, así que la práctica no se improvisa: se prepara. Dé de alta los casos **usted mismo**, desde el formulario público, el día anterior.

1. **Para la sesión de Administración:** dé de alta **un registro de práctica** desde la portada con **"Iniciar registro"**, con un nombre que se identifique de inmediato como de prueba y con placas que no correspondan a ningún vehículo real. Anote su folio (formato **SATAG-000123**), porque el comprobante se muestra una sola vez.
2. **Para la sesión de TI:** lo ideal es **reutilizar ese mismo expediente**, ya cobrado en la sesión de Administración. Si las sesiones no van en ese orden, dé de alta un segundo registro de práctica y pida a Administración que le registre el cobro antes de la sesión de TI: **TI no puede instalar sin pago registrado**.
3. **Para la parte del buzón (sesión de TI):** deje **dos notas** desde la portada, con **"Solicitar actualización o baja →"** y después **"No tengo folio"**. Una que corresponda al expediente de práctica —para demostrar cómo se vincula— y otra evidentemente improcedente —para demostrar cómo se descarta—.
4. **Prepare un número de TAG de práctica**, acordado con el responsable del sistema, de 6 a 11 dígitos, que **no corresponda a ningún dispositivo real** y que no esté en uso en otro expediente.

> **Advertencia sobre el efectivo.** El cobro de práctica entra a la caja igual que uno real: el importe se suma a **"En caja ahora"** y tendrá que salir en un corte. **Programe la sesión de Administración cuando la caja esté vacía**, es decir cuando la pestaña "Finanzas" muestre **"✓ La caja está en ceros. No hay cobros pendientes de cortar."**, de preferencia antes de abrir la ventanilla. Así el corte de práctica contendrá únicamente el cobro de práctica y no contaminará el corte real del día.

> **Advertencia sobre el padrón.** Los expedientes de práctica **se quedan en el padrón para siempre**: el panel no borra registros. Por eso el cierre de la sesión de TI consiste en darle de baja al expediente de práctica con un motivo claro, por ejemplo "registro de capacitación, sin vehículo real". Así queda documentado y deja de aparecer como TAG activo.

### 2.4. Sala y equipo

1. Un equipo con proyector o pantalla grande, con la dirección del sistema ya abierta y probada.
2. **Un equipo o dispositivo por participante** para la práctica. Sin práctica individual la sesión no cumple su objetivo.
3. Conexión a internet verificada **en la sala**. Para la sesión de TI, verifíquela además **en el estacionamiento**, que es donde realmente se trabaja: ahí es frecuente el mensaje **"Sin conexion con el servidor. Revise su red e intente de nuevo."**.
4. Copias del capítulo que corresponda a cada participante y de la lista de verificación de la sección 6.
5. La hoja de registro de asistencia de la sección 7, impresa.

### 2.5. Revisión final, el mismo día

- [ ] Todas las cuentas activadas y con su perfil asignado.
- [ ] Todos los teléfonos con la aplicación de autenticación instalada.
- [ ] Expediente de práctica dado de alta y su folio anotado.
- [ ] Dos notas de práctica dejadas en el buzón (solo para la sesión de TI).
- [ ] Número de TAG de práctica acordado y anotado.
- [ ] Caja en ceros verificada (solo para la sesión de Administración).
- [ ] Dirección del sistema probada en el equipo de proyección.
- [ ] Manuales y hoja de asistencia impresos.

---

## 3. Agenda de la sesión de Administración (60 minutos)

Cada bloque indica lo que usted **demuestra en vivo** y lo que **el participante ejecuta** en su propio equipo. Demuestre primero usted, completo y sin interrupciones; después deje que ellos repitan.

### Minutos 0 a 5 — Apertura

1. Presente el objetivo de la sesión y la duración.
2. Entregue el **Manual de Administración** y pida que lo tengan abierto.
3. Enuncie las tres reglas de oro, sin entrar aún al sistema: **el corte de caja no se puede deshacer**, **un pago registrado tampoco se corrige** y **lo que usted confirma queda a su nombre**.
4. Circule la hoja de asistencia para que la firmen mientras avanza la sesión.

### Minutos 5 a 12 — Entrar al panel y dar de alta el segundo factor

1. Muestre en la portada el enlace **"Acceso del personal →"** y aclare que ese enlace **no es para los padres de familia**.
2. Demuestre el acceso: campo **"Correo"**, campo **"Contraseña"** y botón **"Iniciar sesión"**.
3. Acompañe el alta del segundo factor de quienes entran por primera vez, en la pantalla **"Configure su segundo factor"**. **Deténgase aquí.** No avance hasta que todos hayan guardado la clave de respaldo.
4. Muestre la entrada normal: pantalla **"Verificación en dos pasos"**, campo **"Código de verificación"** y botón **"Verificar"**.
5. Señale en la cabecera el correo de la sesión, la etiqueta del perfil y el botón **"Salir"**, y explique que **"Salir"** se ejecuta de inmediato, **sin pedir confirmación**.

### Minutos 12 a 18 — Mapa de la pestaña "Administración"

1. Muestre la barra de pestañas: con perfil **"Administración"** se ven **"Administración"**, **"Finanzas"** y **"Consulta"**, y se abre en **"Administración"**.
2. Diga con todas sus letras qué **no** verán: **la pestaña "TI" no existe para este perfil**. Instalar el TAG, asignar estacionamiento, actualizar datos y dar de baja **son tareas del Departamento de TI**.
3. Señale la tarjeta **"Registrar pago"**, su subtítulo **"Solicitudes nuevas pendientes de cobro"** y el contador de la derecha; explique el semáforo: verde en 0, ámbar de 1 a 4, rojo de 5 en adelante.
4. Señale el panel **"Padrón completo (N)"** y el buscador **"Buscar por nombre, placa, No. de TAG o folio…"**.
5. Explique los tres distintivos de las tarjetas: **"Por cobrar"**, **"Pagado"** y **"Baja"**, y aclare de inmediato que ese distintivo **habla solo del cobro**: un expediente puede decir **"Pagado"** aunque TI todavía no haya instalado el TAG.

### Minutos 18 a 30 — Demostración 1: registrar un cobro (la más importante)

Use el expediente de práctica. **Este es el bloque que no se puede recortar.**

1. Pulse la tarjeta **"Registrar pago"** y muestre la cola: la del expediente que lleva **más tiempo esperando** hasta el más reciente. Señale que esta pantalla **no tiene buscador** y que se regresa con **"← Inicio"**.
2. Abra la tarjeta tocando su cabecera y **revise el expediente antes de hablar de dinero**: **"Gestionante (paga y firma)"**, **"Procedencia TAG"**, **"Pagos"** y **"Estacionamiento"**.
3. Recalque la regla de ventanilla: **reciba el dinero solo cuando ya esté viendo el formulario de pago**. Explique que un expediente bloqueado también se muestra **"Por cobrar"** y que al abrirlo aparece **"Registro bloqueado; debe resolverse el bloqueo antes de continuar."** en lugar del formulario.
4. Muestre el campo **"Monto en efectivo"**, prellenado con **100**, y aclare que ese 100 es **una comodidad de captura, no una tarifa**: si la cuota autorizada cambia, el importe se teclea a mano en cada cobro.
5. Lea en voz alta el aviso **"Folio de recibo: se generará automáticamente al confirmar."** y señale que **no existe ningún campo para teclear el folio**.
6. Deténgase en el campo **"Cobrado por"** y explique **la trampa más costosa de esta pantalla**: viene prellenado con su nombre, **es editable**, y **el nombre que deje escrito se conserva para todos los cobros siguientes** hasta que lo cambie de nuevo o cierre sesión. Si lo corrigió para un cobro puntual, **devuélvalo a su nombre antes del siguiente**.
7. Pulse el botón **"Registrar pago de $100.00"** y **lea completa, en voz alta, la ventana de confirmación**: resume el monto, el folio del expediente, el titular, las placas y quién cobra.
8. **Antes de confirmar, haga la pregunta al grupo:** ¿qué pasa si algo de lo que dice esa ventana está mal? Respuesta: se pulsa **"Cancelar"**, porque **después no hay corrección posible**.
9. Confirme con **"Registrar pago"** y muestre el aviso verde con el folio del recibo. Insista en **anotar el folio en el momento**: el sistema **no imprime ni envía comprobante**.
10. **Práctica:** deje que cada participante recorra la misma pantalla hasta la ventana de confirmación y **pulse "Cancelar"**. Solo usted ejecuta el cobro real de práctica, una sola vez.

### Minutos 30 a 36 — Demostración 2: el padrón y la consulta del pago

1. Vuelva con **"← Inicio"** y busque el expediente de práctica en **"Padrón completo (N)"**. Muestre que su distintivo ya cambió a **"Pagado"**.
2. Ábralo y muestre el apartado **"Pagos registrados"**: importe, fecha, quién cobró y folio del recibo. Señale que en lugar del formulario aparece **"✓ Pago registrado. El expediente ya no está en la cola de cobro."**.
3. Diga con claridad que esa información es **de solo lectura**: **no hay botón para editar ni para cancelar un pago**, y **cada expediente admite un solo pago**.
4. Mencione el caso del TAG propio: **"Procedencia TAG"** puede decir **"Propio"**, y aun así **se cobra igual**. No existen descuentos ni exenciones en la pantalla.
5. **Práctica:** cada participante busca el expediente por nombre, por placa y por folio, y localiza el folio del recibo.

### Minutos 36 a 44 — Demostración 3: leer la pestaña "Finanzas"

1. Pulse **"Finanzas"** y aclare de entrada que **esta pestaña es exclusiva del perfil "Administración"**: TI y Consulta **no la ven en ningún caso**.
2. Explique **"En caja ahora"**: es el efectivo que el sistema espera que usted tenga **físicamente**, y su color depende de **días con cobro sin cortar**: verde con un solo día o vacía, ámbar con 2 días, rojo con 3 o más.
3. Explique **"Vendido este mes"** y **"Vendido histórico"**, y advierta de inmediato el malentendido más común: **esos dos no se reinician con el corte**. El único indicador que el corte pone en cero es **"En caja ahora"**.
4. En el panel **"Caja actual"**, pulse **"▸ Ver los N cobro(s) en caja"** y recorra la tabla: **"Fecha"**, **"Recibo"**, **"Expediente"**, **"Monto"** y **"Cobrado por"**. Explique que **así se cuadra antes de cortar**, recibo por recibo.
5. **Práctica:** cada participante abre y cierra el detalle de la caja con **"▸ Ver los N cobro(s) en caja"** y **"▾ Ocultar los N cobro(s) en caja"**.

### Minutos 44 a 54 — Demostración 4: el corte de caja

Este bloque se demuestra **una sola vez y solo usted lo ejecuta**.

1. Enuncie la advertencia antes de tocar nada: **al confirmar, el corte queda cerrado en definitiva; no se puede reabrir, corregir ni borrar**, ni siquiera por el personal técnico.
2. Recalque el orden correcto: **primero se cuenta el efectivo físico, después se toca la pantalla**. Nunca al revés.
3. Capture el campo **"Efectivo contado"** y muestre cómo aparece el renglón de conciliación: **"Esperado: $X · Diferencia: cuadra exacto"**, o bien el sobrante o el faltante **en rojo**.
4. Muestre en vivo cómo la etiqueta del campo cambia sola de **"Observaciones (opcional)"** a **"Observaciones (obligatorias)"** cuando hay diferencia o cuando el corte abarca más de un día. Advierta la confusión típica: **mientras "Efectivo contado" siga vacío, la etiqueta dice "(opcional)" aunque el corte vaya a exigir explicación**.
5. Enseñe a escribir una observación útil: qué pasó, cuánto y por qué. Para la práctica, escriba algo como "corte de la sesión de capacitación; el cobro de $100.00 corresponde al expediente de práctica y no hubo ingreso real de efectivo".
6. Señale el aviso **"Este corte quedará registrado a su nombre: …"** y aclare que ese nombre **no se puede editar**.
7. Pulse el botón rojo **"Cerrar corte de $100.00"**, **lea completa la ventana "Cerrar corte de caja"** y confirme con **"Cerrar corte"**.
8. Muestre el aviso verde con el folio del corte y compruebe que **"En caja ahora"** volvió a cero.
9. Baje al **"Historial de cortes (N)"**, abra el renglón del corte recién hecho y muestre los cobros que lo integraron. Aclare que ahí **solo se consulta**: pulsar un renglón únicamente despliega su detalle.

> **Advertencia que debe decir en voz alta en este bloque.** Si alguien teclea mal el efectivo contado y confirma, **ese valor queda para siempre**. La corrección se documenta escribiéndola en las **"Observaciones"** del **corte siguiente**, y se informa a la jefatura el mismo día. Nunca se corrige el corte anterior.

### Minutos 54 a 60 — Cierre

1. Repase la sección 5.1 de esta guía: los puntos que más se prestan a confusión en Administración.
2. Reparta la lista de verificación de la sección 6.1 y pida que cada quien marque lo que ya puede hacer sin ayuda. Lo que quede sin marcar se atiende de inmediato, ahí mismo.
3. Acuerde con el grupo **quién corta y con qué frecuencia**: el sistema **no corta solo ni envía recordatorios**, y **no deben cortar dos personas al mismo tiempo**.
4. Cierre las sesiones abiertas con **"Salir"** en todos los equipos de la sala.
5. Recoja la hoja de asistencia firmada.

---

## 4. Agenda de la sesión de TI (75 minutos)

### Minutos 0 a 5 — Apertura

1. Presente el objetivo y la duración.
2. Entregue el **Manual del Departamento de TI**.
3. Enuncie la advertencia que gobierna toda la sesión: **ninguna acción de TI se puede deshacer desde el panel**; todas piden confirmación en una ventana previa y **esa ventana es la única oportunidad de arrepentirse**.
4. Circule la hoja de asistencia.

### Minutos 5 a 10 — Entrar y entender la vista única

1. Demuestre el acceso y el segundo factor tal como en la sesión de Administración. Acompañe el alta de quienes entran por primera vez y **no avance hasta que todos hayan guardado su clave de respaldo**.
2. Aclare de inmediato la duda número uno del perfil **"TI"**: **no aparece ninguna barra de pestañas**, porque el perfil tiene **una sola vista**. **No es un acceso incompleto ni una falla.**
3. Diga qué no verán: **no ven "Administración", ni "Finanzas", ni "Consulta"**. En consecuencia, **la bitácora de movimientos de un expediente no se consulta desde TI**: vive en la pestaña **"Consulta"** y se solicita a Administración, a Consulta o a un perfil Super.
4. Muestre la leyenda **"Cargando registros…"** y advierta que si aparece el error de carga con el enlace **"Reintentar"**, **no debe darse por hecho que no hay trabajo pendiente**: primero se reintenta.

### Minutos 10 a 18 — Las cuatro colas y cómo leer la prioridad

1. Recorra los cuatro botones y sus leyendas: **"Instalar TAG"** — **"En espera de instalación"**; **"Actualizar datos"** — **"Placas, vehículo o reposición de TAG"**; **"Dar de baja"** — **"Egresos y cancelaciones"**; **"Notas sin expediente"** — **"Buzón sin folio: vincular o descartar"**.
2. Explique el contador redondo de cada cola: verde en 0, amarillo de 1 a 4, rojo de 5 en adelante.
3. Advierta la particularidad del contador de **"Instalar TAG"**: **suma dos grupos**, los que ya se pueden instalar **más** los que están esperando el pago. Los otros tres contadores cuentan solo lo que TI puede resolver de inmediato.
4. Muestre el distintivo de espera de las tarjetas: **"hoy"**, **"hace 1 día"**, **"hace N días"**, y su color: verde de 0 a 2 días, ámbar de 3 a 6, rojo de 7 días o más.
5. Insista en el mensaje de fondo: **el sistema ya prioriza el trabajo**; se atiende de arriba hacia abajo y **no hay forma de reordenar las colas**.
6. Advierta que **las pantallas no se actualizan solas**: si un compañero atiende algo, usted no lo verá hasta su siguiente acción o hasta recargar la página. **Conviene recargar al iniciar la jornada.**

### Minutos 18 a 32 — Demostración 1: instalar un TAG (la más importante)

Use el expediente de práctica y el número de TAG de práctica. **Este es el bloque que no se puede recortar.**

1. Pulse **"Instalar TAG"** y abra la tarjeta del expediente de práctica.
2. Revise el detalle antes de tocar el formulario: **"Gestionante (paga y firma)"**, **"Procedencia TAG"**, **"Pagos"**, **"Estacionamiento"** e **"Instalado"**.
3. En **"Estacionamiento (acceso del TAG)"**, toque los chips que correspondan y explique que **se puede elegir más de uno**. Recalque que **al instalar, el estacionamiento es obligatorio**: sin ninguno aparece **"Elija al menos un estacionamiento."** y el botón queda apagado.
4. Capture el campo **"No. de TAG (6–11 dígitos)"** y muestre a propósito un número corto, para que el grupo vea el aviso **"Lleva {n} dígitos; deben ser de 6 a 11."** y el botón deshabilitado.
5. Deténgase en la casilla **"La familia trae su propio TAG (se aparta el de la escuela)"** y explique que **esa casilla es la que decide la procedencia que queda guardada**: llega marcada si la familia lo declaró en el alta, y **debe desmarcarse si el TAG que se está instalando es de la escuela**.
6. Muestre, solo si la casilla está marcada, el campo **"No. del TAG apartado (opcional, 6–11 dígitos)"** y lea el texto de la pantalla: **"Queda reservado, sin instalar, para una reposición futura."**.
7. Señale el campo **"Instalado por"**: viene prellenado y **es editable**. Explique por qué importa: **los dispositivos de caseta son compartidos** y no se debe atribuir una instalación a quien inició sesión antes. Si se deja en blanco, el movimiento queda a nombre de **"TI"**, sin nombre de persona.
8. Pulse el botón **"Instalar y activar TAG {número}"** y **lea completa la ventana de confirmación**, que repite el número, el vehículo, la persona y los estacionamientos, y termina con **"Revise bien el número. ¿Continuar?"**.
9. **Antes de confirmar, haga la demostración clave del día:** ponga el TAG físico junto a la pantalla y **compare dígito por dígito**. Diga en voz alta que **el sistema no puede saber si usted leyó mal el dispositivo** y que **el número se teclea a mano: no hay lector de código de barras**.
10. Confirme con **"Instalar"** y muestre el aviso verde y el cambio de estado a **"Activo"**.
11. **Práctica:** cada participante recorre el formulario completo hasta la ventana de confirmación y **pulsa "Cancelar"**. La instalación real la ejecuta solo usted, una vez.

### Minutos 32 a 40 — Demostración 2: el padrón y "Esperando pago"

1. Vuelva con **"← Inicio"** y muestre el buscador **"Buscar por nombre, placa, No. de TAG o folio…"** del **"Padrón completo (N)"**.
2. Abra una tarjeta y recorra sus chips de acción: **"Actualizar datos"** y **"Dar de baja"** aparecen en todos los expedientes salvo en los dados de baja; **"Instalar TAG"** aparece **únicamente** si el registro está pendiente, no tiene TAG y **ya tiene pago registrado**.
3. Muestre un expediente sin pago y el mensaje **"Sin pago registrado: el TAG se instala después del pago (Administración)."**. Aclare que **no es una falla del sistema ni de su perfil**.
4. Entre a **"Instalar TAG"** y muestre la sección atenuada **"Esperando pago (N)"** con su aviso **"Falta registrar el pago en Administración; el TAG se instala después del pago."**. Señale que **ahí no hay formulario ni botón**.
5. Explique el procedimiento real de caseta: se avisa a Administración y, **cuando confirmen el cobro, hay que recargar la página o volver a entrar a la cola**, porque **la pantalla no se actualiza sola**.
6. Cierre el punto con la razón de fondo: **la separación entre cobro e instalación es una regla de control interno**, no un obstáculo técnico. **No se intenta forzar por otra vía.**
7. Explique el significado del resaltado amarillo de **"SIN PLACAS"**: es **una señal operativa deliberada** —permiso de circulación o unidad nueva—, no un error de captura.

### Minutos 40 a 50 — Demostración 3: actualizar datos y entender la reposición

1. Entre a **"Actualizar datos"**. Muestre que las peticiones aparecen bajo **"Con solicitud pendiente (N)"** y que, **si no hay ninguna, ese encabezado simplemente no aparece** y la pantalla arranca en **"Atender a alguien más"**. Aclare que **esta cola no muestra ningún mensaje de "Todo al día"**, a diferencia de **"Instalar TAG"**.
2. Demuestre **"Atender a alguien más"** para el caso de quien llega sin haber pedido nada.
3. Abra el expediente de práctica y recorra el formulario: **"Placas"** o la casilla **"Sin placas (permiso/nuevo)"**, **"Marca"**, **"Modelo"**, **"Color"**, **"Motivo (opcional)"**, **"Procedencia del TAG"** y los chips de **"Estacionamiento (acceso del TAG)"**.
4. Señale la diferencia con la instalación: **aquí sí se puede dejar sin ningún estacionamiento** y el registro queda **"Sin asignar"**. Advierta que **un TAG sin acceso a ningún estacionamiento no le sirve de nada a la familia**.
5. Muestre que mientras no se modifique nada, el botón está apagado y se lee **"Modifique algún dato para poder guardar."**.
6. **Deténgase en el punto más delicado de esta pantalla.** Explique que cambiar el campo **"No. de TAG (cambiarlo registra una reposición)"** **no es una corrección de dato**: queda registrado como **reposición** y **el TAG anterior queda inactivo de forma permanente**. Muestre el aviso previo **"El TAG {anterior} quedará inactivo."**.
7. Ejecute un cambio menor sin tocar el número de TAG —por ejemplo el color— y confirme con **"Guardar cambios"**, para que vean el resumen literal del cambio en la ventana de confirmación y el aviso verde.
8. **Práctica:** cada participante abre un expediente, modifica un campo, llega a la ventana de confirmación y **pulsa "Cancelar"**.
9. Aclare el alcance del formulario: desde TI **no se pueden corregir el nombre del titular, el gestionante, el tipo de usuario ni los datos del alumno**, y **las "Observaciones" no se pueden escribir ni editar**. Esos casos se reportan al responsable del sistema con el folio a la mano.

### Minutos 50 a 57 — Demostración 4: el TAG apartado (se explica, no se ejecuta)

1. Explique el escenario completo: la familia trajo su propio dispositivo, al instalar se le apartó un TAG de la escuela, y ahora el TAG en uso se dañó o se perdió.
2. Muestre, en un expediente que tenga reserva, el aviso destacado que empieza con **"Reinstalación con el TAG apartado."** y el botón **"Usar el TAG apartado {número}"**.
3. Lea la ventana de confirmación **"Usar el TAG apartado"** sin ejecutarla, y pulse **"Cancelar"**.
4. Enuncie la advertencia con todas sus letras: **esta acción no tiene vuelta atrás**. Deja **inactivo** el TAG que estaba en uso, cambia la procedencia a escuela y **borra la reserva**. **No existe ningún botón para quitar la reserva ni para editar el número apartado después de instalar.**
5. Fije la regla de operación: **antes de pulsar, se confirma con la familia que el TAG actual efectivamente se dañó o se perdió**. Ese paso no es opcional.
6. Mencione la validación que van a encontrar en la práctica: si un expediente tiene un TAG apartado y se intenta cambiar **"Procedencia del TAG"** a **"Escuela"** desde el formulario de actualización, el sistema no lo permite y remite a esta acción.

> **Si no hay ningún expediente con reserva el día de la sesión**, explique el escenario con el manual en la mano y **no invente el caso en el sistema**: crear una reserva de práctica obliga a consumirla o a dejarla colgada de forma permanente.

### Minutos 57 a 65 — Demostración 5: el buzón de notas sin folio

1. Entre a **"Notas sin expediente"** y lea la instrucción de la pantalla: **"Notas del buzón público (sin folio). Búsquelas por nombre y vincúlelas al expediente correcto, o descártelas si son spam."**.
2. Explique el concepto de fondo: **una nota no es un trámite todavía**; se vuelve trámite cuando TI la vincula a un expediente.
3. Con la primera nota de práctica, pulse **"Vincular a un expediente"**, busque por el nombre del alumno o del titular y pulse **"Elegir este expediente"**.
4. Advierta antes de confirmar: **vincular al expediente equivocado le crea un pendiente falso a una familia que no pidió nada**. Se verifica el nombre del alumno y el vehículo.
5. Muestre el paso de corroboración: **"El cliente pidió {trámite}. ¿Qué trámite corresponde?"**, con los chips **"Actualizar datos"** y **"Dar de baja"**. Explique la regla: arranca marcado lo que pidió la persona, pero **lo que TI corrobora manda sobre lo que pidió la persona**.
6. Aclare que **instalar ya no es un trámite que se pueda pedir por el buzón**: al vincular, TI solo puede corroborar **"Actualizar datos"** o **"Dar de baja"**.
7. Confirme con **"Vincular"** y muestre cómo **la pantalla salta sola a la cola de destino** con el expediente ya abierto.
8. Con la segunda nota de práctica, demuestre **"Descartar"**: el campo **"¿Por qué se descarta?"** es **obligatorio**. Advierta que **no hay forma de recuperar una nota descartada** y fije la regla: **si duda entre descartar y vincular, no descarte; consulte primero**.
9. Mencione dos límites que aparecen en la operación diaria: **un expediente admite una sola nota pendiente a la vez**, y el buscador de la nota **no busca por número de TAG**.

### Minutos 65 a 70 — Demostración 6: dar de baja y cerrar peticiones

Aproveche este bloque para **limpiar el expediente de práctica**.

1. Entre a **"Dar de baja"** y abra el expediente de práctica.
2. Muestre el campo **"Motivo de baja"**: es **obligatorio** y llega prellenado si había una petición de baja pendiente.
3. Enseñe a escribir un motivo útil: **el motivo es el único rastro de por qué se dio de baja**. "egreso de la alumna al terminar el ciclo" explica; "baja" no explica nada. Para la práctica, escriba "registro de capacitación, sin vehículo real".
4. Confirme con el botón rojo **"Dar de baja"** y muestre el resultado: el registro queda en estado **"Baja"**, **el TAG queda inactivo** y la tarjeta **pierde todos sus chips de acción**.
5. Enuncie la advertencia final: **la baja es definitiva desde el panel**. **No existe ningún botón para reactivar el registro ni para revertir la baja.** Cualquier intento posterior se rechaza.
6. Muestre por último, en cualquier expediente con petición pendiente, los enlaces **"Descartar esta solicitud sin aplicar cambios…"** y **"Cerrar esta nota…"**, y explique para qué sirven: **cierran la petición sin modificar el registro**, cuando ya se atendió por otra vía, está duplicada o el dato era incorrecto.

### Minutos 70 a 75 — Cierre

1. Repase la sección 5.2 de esta guía: los puntos que más se prestan a confusión en TI.
2. Reparta la lista de verificación de la sección 6.2 y atienda ahí mismo lo que quede sin marcar.
3. Recuerde la regla de comunicación con la familia: **el sistema no envía ningún aviso automático** por correo, mensaje ni WhatsApp al instalar, actualizar, dar de baja, vincular o descartar. **Avisar es responsabilidad del personal, fuera del sistema.**
4. Cierre las sesiones abiertas con **"Salir"** en todos los equipos.
5. Recoja la hoja de asistencia firmada.

---

## 5. Puntos que más se prestan a confusión

Recórralos en voz alta en el bloque de cierre. Son los que generan reprocesos, reclamos en ventanilla y llamadas al Departamento de TI.

### 5.0. Comunes a las dos sesiones

1. **El código QR y la clave de respaldo del segundo factor se muestran una sola vez.** Si se pierde el teléfono y no se guardó la clave, **la cuenta queda bloqueada** y solo el administrador del sistema puede restablecerla, fuera de la aplicación. No existe forma de desactivar ni de reconfigurar el segundo factor desde el panel.
2. **La sesión se queda abierta en el navegador.** Mientras no se pulse **"Salir"**, al volver a abrir la dirección del sistema se entra directo, sin correo, sin contraseña y sin código. **Cerrar la ventana o apagar la pantalla no basta.** En equipos compartidos —y los de caseta lo son— se cierra sesión siempre antes de retirarse.
3. **"Salir" y "Cerrar sesión" no piden confirmación** y se ejecutan de inmediato.
4. **Un cambio de perfil no se aplica en una sesión abierta.** Hay que salir y volver a entrar.
5. **No hay pantalla para cambiar la contraseña dentro del panel.** El único camino es **"¿Olvidó su contraseña?"** en la pantalla de acceso.
6. **El sistema no envía ningún aviso a la familia**, en ninguna de las dos áreas. Avisar es del personal.
7. **No hay exportación, impresión ni comprobante** desde el panel: ni a hoja de cálculo, ni a PDF, ni recibo, etiqueta o acuse.
8. **Cada perfil ve solo lo suyo, y eso es lo correcto.** El perfil **"Administración"** no ve la pestaña **"TI"**; el perfil **"TI"** no ve ninguna pestaña porque tiene una sola vista, y por tanto no ve **"Administración"**, ni **"Finanzas"**, ni **"Consulta"**. **La restricción no es solo visual**: no se alcanza una pantalla ajena escribiendo una dirección.
9. **La bitácora de movimientos vive en la pestaña "Consulta"**, que el perfil **"TI"** no tiene. Se solicita a Administración, a Consulta o a un perfil Super.

### 5.1. Específicos de Administración

1. **El corte de caja no se puede deshacer.** No hay botón, pantalla ni procedimiento para reabrir, corregir, anular o borrar un corte cerrado, ni siquiera para el personal técnico. La corrección se documenta en las **"Observaciones"** del **corte siguiente**.
2. **Un pago registrado tampoco se corrige.** No hay edición, cancelación ni reembolso, y **cada expediente admite un solo pago**.
3. **El campo "Cobrado por" se conserva de un cobro a otro** hasta que se cambie de nuevo o se cierre sesión. Si se corrigió para un cobro puntual, hay que devolverlo antes del siguiente: el nombre equivocado queda para siempre en el recibo y en el corte.
4. **El 100 prellenado no es una tarifa configurable.** Si la cuota autorizada cambia, el importe se captura a mano en cada cobro.
5. **El TAG propio se cobra igual.** No existen descuentos, exenciones ni precio diferenciado en la pantalla.
6. **El distintivo "Pagado" habla solo del cobro**, no del ciclo de vida del expediente: un registro puede decir **"Pagado"** aunque TI todavía no haya instalado el TAG.
7. **Un expediente "Por cobrar" puede estar bloqueado.** El distintivo no garantiza que se pueda cobrar: **reciba el dinero solo cuando ya esté viendo el formulario de pago**.
8. **"Vendido este mes" y "Vendido histórico" no se reinician con el corte.** El único indicador que el corte pone en cero es **"En caja ahora"**.
9. **La etiqueta "Observaciones" engaña mientras el campo del efectivo esté vacío:** dice **"(opcional)"** aunque el corte vaya a exigir explicación. Solo cambia a **"(obligatorias)"** cuando ya se capturó un **"Efectivo contado"** válido.
10. **El corte no se define por fechas**, sino por lo que esté sin cortar en ese momento. Un cobro registrado mientras se cierra o entra completo o queda para el siguiente, pero **nunca se cuenta a medias**.
11. **No cortan dos personas al mismo tiempo.** Debe acordarse internamente quién corta.
12. **El sistema no recuerda cortar.** No hay corte automático, ni alertas, ni correos. La única señal es el color de **"En caja ahora"**: ámbar con 2 días de cobro sin cortar, rojo con 3 o más.
13. **El folio del recibo se anota en el momento.** El sistema no imprime ni envía comprobantes; el folio solo se consulta en pantalla. **No debe confundirse el folio del recibo con el folio del expediente**, que tiene un formato distinto y no lleva año.

### 5.2. Específicos de TI

1. **Nada de lo que hace TI se puede deshacer desde el panel:** ni la instalación, ni la actualización, ni la baja, ni el uso del TAG apartado, ni el descarte de una solicitud o de una nota. **La ventana de confirmación es la última oportunidad de detenerse.**
2. **Cambiar el "No. de TAG" en "Actualizar datos" registra una reposición**, no una corrección: **el TAG anterior queda inactivo de forma permanente**.
3. **"Usar el TAG apartado" borra la reserva**, deja inactivo el TAG en uso y pasa la procedencia a escuela. No hay forma de quitar la reserva ni de editarla después de instalar.
4. **La baja es definitiva.** No hay botón para reactivar ni para revertir.
5. **Descartar una nota no se puede revertir**, y no vincula a nadie.
6. **Al instalar, el estacionamiento es obligatorio; al actualizar, no.** Al actualizar, el registro puede quedar **"Sin asignar"**, y **un TAG sin acceso a ningún estacionamiento no le sirve a la familia**.
7. **La casilla "La familia trae su propio TAG (se aparta el de la escuela)" decide la procedencia que se guarda.** Llega marcada si así se declaró en el alta; **se desmarca si el TAG que se instala es de la escuela**.
8. **El cierre automático de la nota es por coincidencia de trámite.** Si se vincula como **"Actualizar datos"** y se termina dando de baja, **la nota no se cierra sola**: hay que cerrarla a mano con **"Cerrar esta nota…"**.
9. **Un expediente admite una sola nota pendiente a la vez.**
10. **"Instalado por" y "Atendido por" no se conservan entre sesiones, a propósito**, porque los dispositivos de caseta son compartidos. **Se corrige el nombre si quien atiende es otra persona**; si se deja en blanco, el movimiento queda a nombre de **"TI"**, sin nombre de persona.
11. **TI no puede instalar sin pago registrado**, y el apartado **"Pagos"** es de **solo lectura** para TI.
12. **Las pantallas no se actualizan solas.** Las colas y los contadores se refrescan al ejecutar una acción o al recargar la página.
13. **El número de TAG se teclea a mano**, dígito por dígito: **no hay lector de código de barras ni escáner**, y el sistema no puede detectar una mala lectura del dispositivo.
14. **Instalar no es un trámite del buzón**: al vincular una nota solo se puede corroborar **"Actualizar datos"** o **"Dar de baja"**.
15. **Una nota no se puede vincular a un registro dado de baja**: esos expedientes quedan fuera de la búsqueda del buzón de forma deliberada.
16. **Desde TI no se corrigen el nombre del titular, el gestionante, el tipo de usuario ni los datos del alumno**, y **las "Observaciones" no tienen campo editable**.
17. **No hay acciones en lote**: cada expediente se atiende de uno en uno.

---

## 6. Lista de verificación final por participante

Entréguela impresa al inicio del bloque de cierre. Cada participante la marca por su cuenta. **Lo que quede sin marcar se practica ahí mismo, antes de terminar la sesión.** Una casilla sin marcar no es una falta: es trabajo pendiente del instructor.

### 6.1. Administración

**Acceso**

- [ ] Entro al panel por mi cuenta con mi correo, mi contraseña y el código de mi aplicación de autenticación, sin ayuda.
- [ ] Sé dónde guardé mi clave de respaldo del segundo factor y puedo indicarlo ahora mismo.
- [ ] Sé que debo pulsar **"Salir"** antes de retirarme del equipo, y lo hago.

**Cobro**

- [ ] Localizo la tarjeta **"Registrar pago"** y entiendo qué significa el color de su contador.
- [ ] Registro un cobro completo desde la cola **"Registrar pago"**, capturando **"Monto en efectivo"** y **"Cobrado por"**.
- [ ] Localizo un expediente por nombre, por placa y por folio en el **"Padrón completo (N)"** y lo cobro desde ahí.
- [ ] Distingo los distintivos **"Por cobrar"**, **"Pagado"** y **"Baja"**, y sé que hablan solo del cobro.
- [ ] Antes de recibir dinero, verifico que aparezca el formulario de pago y no un aviso de bloqueo o de baja.
- [ ] Leo completa la ventana de confirmación y sé que **"Cancelar"** es mi última salida.
- [ ] Anoto el folio del recibo en el momento y sé explicar por qué el sistema no entrega comprobante impreso.
- [ ] Consulto el apartado **"Pagos registrados"** de un expediente y encuentro el folio, el importe, la fecha y el responsable.
- [ ] Sé que un pago no se puede editar, cancelar ni reembolsar, y qué debo hacer si me equivoco.
- [ ] Reviso el campo **"Cobrado por"** antes de cada cobro y lo devuelvo a mi nombre si lo cambié.

**Finanzas y corte**

- [ ] Explico con mis palabras qué significa **"En caja ahora"** y qué significa el color de ese indicador.
- [ ] Explico por qué **"Vendido este mes"** y **"Vendido histórico"** no bajan al cerrar el corte.
- [ ] Abro y cierro el detalle de los cobros en caja y cuadro recibo por recibo antes de contar.
- [ ] Cuento el efectivo físico **antes** de tocar la pantalla del corte.
- [ ] Capturo **"Efectivo contado"**, leo el renglón de conciliación y sé distinguir un sobrante de un faltante.
- [ ] Escribo unas **"Observaciones"** que expliquen qué pasó, cuánto y por qué.
- [ ] Cierro un corte completo y localizo su folio en el **"Historial de cortes (N)"**.
- [ ] Sé que un corte cerrado **no se puede deshacer** y sé exactamente qué hacer si me equivoqué: documentarlo en el corte siguiente e informar a mi jefatura el mismo día.
- [ ] Sé que no debo cortar al mismo tiempo que otra persona y con quién debo acordarlo.

**Límites del sistema**

- [ ] Sé responder en ventanilla que el sistema no imprime ni envía recibos, y qué entregar en su lugar.
- [ ] Sé que el TAG propio se cobra igual y que no existen descuentos ni exenciones.
- [ ] Sé qué tareas corresponden al Departamento de TI y no a Administración.

### 6.2. Departamento de TI

**Acceso**

- [ ] Entro al panel por mi cuenta con mi correo, mi contraseña y el código de mi aplicación de autenticación, sin ayuda.
- [ ] Sé dónde guardé mi clave de respaldo del segundo factor y puedo indicarlo ahora mismo.
- [ ] Entiendo que no ver la barra de pestañas es lo normal en mi perfil y no un acceso incompleto.
- [ ] Cierro sesión con **"Salir"** en el dispositivo de caseta antes de dejarlo.

**Prioridad**

- [ ] Identifico las cuatro colas y sé para qué sirve cada una.
- [ ] Interpreto el color del contador de cada cola y el color del distintivo de días de espera.
- [ ] Sé que el contador de **"Instalar TAG"** incluye también los que esperan pago.
- [ ] Sé que las pantallas no se actualizan solas y recargo al iniciar la jornada.
- [ ] Si aparece un error de carga, pulso **"Reintentar"** y no doy por hecho que no hay pendientes.

**Instalación**

- [ ] Instalo un TAG completo desde la cola, seleccionando al menos un estacionamiento.
- [ ] Capturo correctamente el campo **"No. de TAG (6–11 dígitos)"** y reconozco el aviso cuando el número no cumple.
- [ ] Marco o desmarco la casilla del TAG propio según corresponda, y sé que esa casilla define la procedencia guardada.
- [ ] Comparo el número en pantalla contra el dispositivo físico antes de confirmar.
- [ ] Corrijo **"Instalado por"** cuando quien instala es otra persona.
- [ ] Instalo también desde el **"Padrón completo (N)"** cuando la familia llega directamente.
- [ ] Explico a una familia por qué su registro está en **"Esperando pago"** y qué debe hacer.

**Mantenimiento**

- [ ] Atiendo una actualización de datos completa y guardo los cambios.
- [ ] Explico la diferencia entre corregir un dato y **cambiar el "No. de TAG"**, y sé que lo segundo es una reposición irreversible.
- [ ] Sé que al actualizar puedo dejar el registro **"Sin asignar"** y por qué eso deja a la familia sin acceso.
- [ ] Explico qué es el TAG apartado, cuándo se usa y qué consecuencias tiene usarlo.
- [ ] Doy de baja un registro con un motivo que explique el caso a quien lo lea meses después.
- [ ] Sé que la baja es definitiva y que no existe forma de reactivar un registro.
- [ ] Cierro una petición pendiente sin modificar el registro cuando ya no procede.

**Buzón**

- [ ] Vinculo una nota al expediente correcto, verificando el nombre del alumno y el vehículo.
- [ ] Corroboro el trámite y sé que lo que yo marco manda sobre lo que pidió la persona.
- [ ] Descarto una nota improcedente escribiendo un motivo que explique la decisión.
- [ ] Sé que una nota descartada no se recupera y que ante la duda debo consultar antes de descartar.
- [ ] Sé cuándo la nota no se cierra sola y cómo cerrarla a mano.

**Límites del sistema**

- [ ] Sé que el sistema no avisa a la familia y que avisar me corresponde a mí, fuera del sistema.
- [ ] Sé qué datos no puedo corregir desde TI y a quién debo reportarlos.
- [ ] Sé dónde vive la bitácora de movimientos y a quién debo solicitarla.

---

## 7. Registro de asistencia

Imprima esta hoja para cada sesión, recójala firmada al terminar e intégrela al expediente del proyecto junto con las listas de verificación.

### Datos de la sesión

| Concepto | Anote aquí |
|---|---|
| **Sesión** | ☐ Administración ☐ Departamento de TI |
| **Fecha** | ______ / ______ / __________ |
| **Horario** | De __________ a __________ |
| **Sede o sala** | ______________________________________________ |
| **Instructor(a)** | ______________________________________________ |
| **Manual entregado** | ☐ Sí ☐ No |
| **Lista de verificación aplicada** | ☐ Sí ☐ No |

### Participantes

| # | Nombre completo | Área y puesto | Correo institucional | Perfil asignado | Firma |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
| 6 | | | | | |
| 7 | | | | | |
| 8 | | | | | |

### Declaración

Los abajo firmantes hacemos constar que asistimos a la sesión de capacitación de SATAG en la fecha señalada, que recibimos el manual correspondiente a nuestra área y que se nos explicaron de manera expresa las acciones del sistema que **no se pueden deshacer**.

**Observaciones de la sesión** (temas que quedaron pendientes, incidencias, participantes que requieren refuerzo):

______________________________________________________________________________

______________________________________________________________________________

______________________________________________________________________________

**Nombre y firma del instructor(a):** ______________________________________________

**Fecha de entrega al expediente del proyecto:** ______ / ______ / __________
