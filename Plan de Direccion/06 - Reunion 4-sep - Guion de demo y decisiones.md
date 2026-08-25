# Doc 6 — Reunión del 4-sep-2026 con Administración: guion de demo y decisiones

> **Plan de Dirección · Fase 3 (Ejecución/Control).** Paquete de trabajo para la reunión de
> requerimientos de SATAG acordada en la junta de Sistemas del 24-ago-2026 (minuta con la Gerencia
> Administrativa). Es la puerta de las pruebas reales con el personal y de la aceptación del 19-sep.

| | |
|---|---|
| **Fecha y lugar** | 4-sep-2026 · [confirmar] hora y sala |
| **Convoca / presenta** | Gerardo Sánchez — Soporte TI Jr. |
| **Asistentes esperados** | Gerencia Administrativa (CP Vicente Hernández) · Miguel Ángel González Pacheco (Encargado de Sistemas, aprobador) · personal de Administración que cobrará y cortará la caja [confirmar nombres] · personal de Sistemas que instalará (Lidia Segundo; Ángel Martínez [confirmar]) |
| **Duración** | 35 min de demo + 30 min de decisiones + 5 min de acuerdos = **70 min** |
| **Objetivo** | Que Administración vea el proceso completo tal como lo va a operar y tome, en la misma sesión, las decisiones de la sección B. Sin ellas no hay pruebas reales y el cierre del 19-sep (SC-021) se mueve. |
| **Qué se lleva** | Ver la lista D. Lo indispensable: sitio abierto con sesión `super` lista, capturas del 17/18/24-ago, comprobante de ejemplo impreso, Manual del Usuario impreso, este documento con la minuta E en blanco. |

**Tres cosas que hay que decir en el primer minuto, para que nadie se confunda:**

1. **El padrón ya es real desde el 18-ago.** El banco de pruebas se vació y el primer expediente
   real es `SATAG-000001` (el vehículo de Gerardo, sin pago aún). Por eso **la demo no crea altas, ni
   cobros, ni cortes, ni instalaciones**: se llega hasta el botón y no se pulsa, o se muestran capturas
   ya existentes, o se usa el arnés que intercepta la red.
2. **El alcance está cerrado desde el 29-jul** (producto funcionalmente completo; desde entonces solo
   correcciones de pruebas y cambios registrados). Lo que se ve es lo que se entrega. Lo que
   Administración pida hoy y no esté, se registra como cambio (CC nuevo) y se evalúa **después** del
   cierre; no se programa antes del 19-sep.
3. **La dirección actual (`satag.vercel.app`) es el entorno de trabajo.** La definitiva es el
   subdominio institucional (`satag.asuncionqro.edu.mx`, WBS 1.3). Las cuentas del personal se
   invitan **después** de migrar, para que nazcan contra el dominio bueno.

---

## A. Guion de demo (35 minutos)

### A.0 Cómo se ejecuta cada paso (leyenda)

| Modo | Qué significa | Cuándo se usa |
|---|---|---|
| **En vivo, sin ejecutar** | Se navega la pantalla real de `satag.vercel.app` y **se llega hasta el botón que escribe, pero no se pulsa** (o se pulsa y se elige **"Cancelar"** en la ventana de confirmación, que no escribe nada). | Alta hasta el paso de firma; cola de cobro; formulario de instalación; buzón hasta el botón de envío. |
| **Capturas** | Pantallas ya tomadas sobre el banco de QA, antes de vaciarlo (17 y 18-ago) y del comprobante nuevo (24-ago). Ver rutas en D. | Todo lo que exige datos que ya no existen: aviso verde del recibo, caja con dinero, corte cerrado, historial de cortes, nota del buzón vinculada. |
| **Arnés** | `arnes/ver-copia-titular.mjs` (fuera del repo, en `SATAG - Evidencia de pruebas/arnes/`): recorre el alta completa **interceptando la subida de la firma y el RPC `crear_registro`**, así que llega al comprobante sin escribir nada en la base. Produce capturas y PDF del comprobante en escritorio y celular. | El paso 6 del alta (comprobante con folio y copia de los documentos). |
| **Staging** | Proyecto Supabase de pruebas, hoy en construcción [confirmar si estará listo el 3-sep]. Si existe, **toda la demo puede correr ahí de punta a punta con el banco de QA** (`seed_tests_dev.sql`), incluidos cobro, corte, instalación y vinculación de notas, con cuentas de prueba por rol. | Variante completa; en cada paso se indica qué cambia. |

**Regla para las dos variantes:** aunque exista staging, **el paso 1 y el paso 5 se muestran también
en el sitio de trabajo real**, porque es lo que van a ver las familias y lo que Administración tiene
que reconocer en ventanilla.

### A.1 Tiempos

| Min | Paso | Modo |
|---|---|---|
| 0–3 | Apertura: las tres cosas del primer minuto, el proceso en tres momentos | — |
| 3–11 | 1 · Alta pública en `/registro/` | En vivo sin ejecutar + arnés (comprobante) |
| 11–17 | 2 · Cobro en el panel de Administración | En vivo sin ejecutar (hasta **"Cancelar"**) + capturas del aviso verde |
| 17–21 | 3 · Corte de caja en Finanzas | Capturas (la caja real está en ceros) · staging si existe |
| 21–27 | 4 · Instalación del TAG por Sistemas | En vivo: **"Esperando pago"** con el expediente real · capturas del formulario · staging si existe |
| 27–32 | 5 · Buzón público `/solicitudes/` y bandeja de TI | En vivo sin ejecutar + capturas de la vinculación |
| 32–35 | 6 · Consulta y evidencia de la firma | En vivo (solo lectura, sobre `SATAG-000001`) |
| 35–65 | **Decisiones** (sección B) | Tabla en pantalla o impresa |
| 65–70 | Acuerdos, responsables y fechas (minuta E) | — |

### A.2 Apertura (3 min)

**Qué se dice.** "SATAG sustituye la hoja física y la hoja de cálculo del TAG. El proceso tiene tres
momentos: la familia captura y firma en línea; Administración cobra; Sistemas instala. Hoy les muestro
los tres tal como van a operar, y al final necesito de ustedes las decisiones de una lista cerrada."

**Qué se muestra.** La portada: encabezado **"Registro de acceso vehicular"**, el texto **"Dé de alta
su vehículo para obtener el TAG de acceso al estacionamiento del Instituto Asunción de Querétaro. El
trámite toma unos minutos."** y el bloque **"¿Cómo funciona?"** con sus tres puntos: **"Capture sus
datos y los de su vehículo."**, **"Lea y firme el reglamento de acceso."** y **"Reciba su comprobante;
pague el TAG en Administración y Sistemas lo instala."**.

---

### Paso 1 · Alta pública en `/registro/` (8 min)

**Modo:** en vivo sin ejecutar hasta el paso 5; el paso 6 con el arnés.

**Qué se muestra.**

1. Pulsar **"Iniciar registro"**. Aparece **"Datos del solicitante"**, **"Paso 1 de 6"**. Señalar el
   recuadro **"Aviso de privacidad"** que encabeza el paso, con el enlace **"Consultar el aviso de
   privacidad integral SATAG"**: es el aviso corto que la ley pide mostrar *al recabar* los datos.
2. Capturar un conductor ficticio (nombre evidente de prueba). Mostrar el texto de ayuda **"La persona
   que manejará el auto que entra al estacionamiento — no necesariamente quien paga o firma."**, la
   etiqueta de apellido materno **(opcional)** y las dos casillas: **"El conductor es menor de edad."**
   y **"El pago y la firma los hace otra persona (padre/madre/tutor/cónyuge)."**. Marcar la de menor
   para que vean el aviso **"El menor puede ser usuario del beneficio vehicular, pero el aviso de
   privacidad y el reglamento debe aceptarlos y firmarlos su padre, madre o tutor como
   representante."** y cómo **"Tipo de usuario"** queda fijo en **"Alumno"** con la nota **"Un conductor
   menor de edad se registra como alumno."**. Desmarcarla y seguir con el caso simple.
3. **"Tipo de usuario"**: **"Padre / Madre / Tutor"**, **"Maestro"**, **"Alumno"** o **"Administración"**.
   Decir que esto es lo que la familia *declara*; Administración lo *confirma* al cobrar (paso 2).
4. **"Siguiente"** → **"Datos del vehículo"**, **"Paso 2 de 6"**: **"Marca"** del catálogo (o **"Otro"**),
   **"Modelo"** dependiente (**"Elija la marca primero"**), **"Color"**, **"Placas"** en mayúsculas
   automáticas (5 a 8 letras o números) y la casilla **"El vehículo aún no tiene placas (nuevo o con
   permiso)."**. En **"TAG"**, los dos botones: **"Lo compro a la escuela"** (aviso: **"El TAG cuesta $100
   y se paga en efectivo en Administración, después de enviar este registro."**) y **"Ya tengo TAG
   propio"** (aviso: **"El registro y la activación tienen el mismo costo ($100). Lleve su TAG el día de
   la instalación: para funcionar debe quedar pegado al parabrisas. Sistemas valorará si ese modelo
   puede darse de alta; si no es compatible, se le instalará uno de la escuela."**).
5. **"Paso 3 de 6"**, aviso de privacidad: **"Lea el aviso completo. La casilla se habilita al llegar al
   final."** Desplazar y mostrar que la casilla **"He leído el aviso de privacidad de SATAG y acepto el
   tratamiento de mis datos personales para las finalidades indicadas."** solo se habilita al final.
   Mencionar que el texto que se lee es la **versión 2** y que la versión 3 (con acentos, plazo de
   conservación y opciones de limitación de uso) está en manos de Legal (decisión B4).
6. **"Paso 4 de 6"**, reglamento: **"Lea el reglamento completo. La casilla se habilita al llegar a la
   cláusula final."**, **"Desplácese hasta la cláusula 22 para poder aceptar."**, casilla **"He leído y
   acepto el reglamento de acceso vehicular (v2)."**.
7. **"Paso 5 de 6"**, firma: la línea **"Firmará"** con el nombre de quien corresponde, la instrucción
   **"Firme sobre la línea, como lo haría en papel: con el dedo (táctil) o con el mouse."**, el botón
   **"Enviar registro"** apagado hasta que exista trazo, **"Borrar firma"**. Trazar una firma en el
   proyector **y no pulsar "Enviar registro"**. Si se pulsa por error, el alta se crea de inmediato y no
   hay confirmación previa: ese sería un expediente real que habría que dar de baja.
8. **Paso 6, con el arnés.** Mostrar las capturas o el PDF generados por `ver-copia-titular.mjs`
   (carpeta `2026-08-24/comprobante-copia-titular/`): **"¡Registro recibido!"**, etiqueta
   **"Pendiente"**, **"Su folio de seguimiento es:"** con el folio `SATAG-000123`, la instrucción
   **"Preséntese en Administración para asignación de estacionamiento y el pago del TAG ($100,
   efectivo). Sistemas instalará y activará su TAG."**, y debajo la sección **"Su copia del trámite"**:
   datos registrados, el reglamento y el aviso que aceptó (plegados en pantalla, completos al imprimir)
   y la constancia de quién firmó y cuándo. Botones **"Imprimir / Descargar"** y **"Volver al inicio"**.
   Entregar el comprobante impreso de ejemplo.

**Qué se dice.** "La familia no tiene cuenta ni contraseña; el trámite es anónimo y dura 10 a 15
minutos. **El folio se muestra una sola vez**: si lo pierde, no hay forma de recuperarlo desde el sitio,
tiene que acudir con Sistemas. El sitio no cobra, no consulta el estado y no manda correos. La firma
queda con la versión exacta del reglamento y del aviso, sello de tiempo y huella digital; si el aviso o
el reglamento no cargan, el sistema no deja avanzar. Y se lleva su copia, como en el papel."

**Preguntas a Administración.**
- ¿El texto del aviso de los $100 y el del TAG propio dicen exactamente lo que ustedes quieren que la
  familia sepa antes de firmar? (Cualquier cambio de texto va a la versión 3 del aviso o a un CC.)
- ¿Quieren que el comprobante lleve un **correo o teléfono de contacto** para dudas del trámite? Hoy
  no lleva ninguno (decisión B3).
- ¿Cómo van a difundir la dirección del sistema a las familias y quién atiende en ventanilla al que
  llega sin folio? (decisión B9)

**Variante staging.** Igual, pero al final se pulsa **"Enviar registro"** y el comprobante sale en vivo;
anotar el folio para usarlo en los pasos 2 a 4.

---

### Paso 2 · Cobro en el panel de Administración (6 min)

**Modo:** en vivo sin ejecutar (se llega a la ventana de confirmación y se pulsa **"Cancelar"**);
el aviso verde del recibo, con captura.

**Qué se muestra.**

1. Abrir la dirección del sistema con `/admin`: pantalla **"Panel administrativo"**, campos **"Correo"** y
   **"Contraseña"**, botón **"Iniciar sesión"**; después **"Verificación en dos pasos"** con el
   **"Código de verificación"** de 6 dígitos y **"Verificar"**. Entrar con la sesión de Gerardo (perfil
   `super`, que ve las cuatro pestañas). Decir: "Sin el segundo factor no se ve ninguna pantalla del
   panel. Cada persona que cobre necesita su cuenta y su teléfono con la aplicación de autenticación."
2. Cabecera **"Panel de gestión de TAG"**, **"Administración y TI · IAQ"**, correo de la sesión, etiqueta
   del rol y **"Salir"**. Con perfil **"Administración"** se ven **"Administración"**, **"Finanzas"** y
   **"Consulta"**; no se ve TI.
3. Pestaña **"Administración"**: tarjeta **"Registrar pago"** con **"Solicitudes nuevas pendientes de
   cobro"** y su contador (verde 0 / ámbar 1–4 / rojo 5 o más). Debajo, **"Padrón completo (N)"** con el
   buscador **"Buscar por nombre, placa, No. de TAG o folio…"**, los chips de filtro (Todos / Por cobrar /
   Pagados / Baja) y las tarjetas con el distintivo **"Por cobrar"**, **"Pagado"** o **"Baja"**.
4. Buscar por folio `SATAG-000001` (el expediente real, aún **"Por cobrar"**) y abrir la tarjeta:
   **"Gestionante (paga y firma)"**, **"Procedencia TAG"**, **"Pagos"** (**"Sin pago"**),
   **"Estacionamiento"** (**"Sin asignar"**).
5. Formulario de pago: **confirmar el tipo de usuario** (chips; el que declaró la familia aparece marcado
   como pendiente de confirmar; si difiere, el sistema corrige el expediente y deja rastro en la
   bitácora). **"Monto en efectivo"**: **$100.00** con la nota **"precio unico del TAG"**, **no es un campo
   capturable**. **"Folio de recibo: se generará automáticamente al confirmar."** **"Cobrado por"**: el
   nombre de la sesión con la nota **"usuario de esta sesion"**, **no se puede cambiar**. Leer también la
   advertencia **"El estacionamiento y el TAG los asigna TI después de confirmar este pago."**.
6. Pulsar **"Registrar pago de $100.00"**. Se abre la ventana **"Registrar pago"**, del tipo: **"Se
   registrará un pago en efectivo de $100.00 para SATAG-000123, NOMBRE DEL TITULAR (ABC-123-D). El
   sistema generará el folio del recibo. Cobrado por Gerardo Sanchez. ¿Continuar?"**. **Pulsar
   "Cancelar".** Decir en voz alta que se canceló y que no se cobró nada.
7. Captura del resultado (17-ago, tanda F): el aviso verde **"Pago de $100.00 registrado · recibo
   SATAG-2026-000045 (SATAG-000123)."**, el distintivo que pasa a **"Pagado"** y el apartado **"Pagos
   registrados"** con fecha, quién cobró y folio del recibo.

**Qué se dice.** "El precio es un dato del sistema, no se teclea: quedó fijado en la minuta del 24-ago.
Quien cobra es quien está firmado en el panel; el recibo lleva su correo sellado. Cada expediente admite
**un solo pago** y **un pago registrado no se corrige ni se cancela**: por eso la ventana de confirmación
es la última oportunidad. El sistema no imprime recibo: lo que existe es el folio `SATAG-AAAA-######`,
que se anota en el momento."

**Preguntas a Administración.**
- ¿Quién va a cobrar? ¿Una persona o varias? Cada una necesita cuenta con perfil **"Administración"** y
  segundo factor (decisión B1).
- ¿El folio interno basta como comprobante para la familia, o requieren un recibo impreso o un
  tratamiento contable específico? El sistema **no emite CFDI** ni imprime (decisión B8).
- ¿El equipo de ventanilla es compartido? La sesión del panel queda abierta en el navegador hasta pulsar
  **"Salir"**; si es compartido, conviene acordar el cierre de sesión al retirarse.

**Variante staging.** Se cobra de verdad el folio del paso 1 y se muestra el aviso verde en vivo.

---

### Paso 3 · Corte de caja en Finanzas (4 min)

**Modo:** capturas del 17-ago (`2026-08-17/panel/03-pestana-finanzas.png` y las de la tanda F). En el
sitio real la pestaña muestra **"✓ La caja está en ceros. No hay cobros pendientes de cortar."** y el
formulario ni siquiera aparece, así que se abre en vivo solo para enseñar los tres indicadores.

**Qué se muestra.**

1. Pestaña **"Finanzas"** (solo perfiles Administración y Super): **"En caja ahora"** (el efectivo que
   debe haber físicamente: suma de los cobros sin cortar; verde un día, ámbar 2 días, rojo 3 o más),
   **"Vendido este mes"** y **"Vendido histórico"** (acumulados que **no** se reinician con el corte).
2. En captura: **"▸ Ver los N cobro(s) en caja"** con la tabla **"Fecha"**, **"Recibo"**,
   **"Expediente"**, **"Monto"**, **"Cobrado por"**.
3. El corte: campo **"Efectivo contado"**, el renglón de conciliación **"Esperado: $X · Diferencia:
   cuadra exacto"** (o **"sobrante $50.00"** / **"faltante $50.00"** en rojo), **"Observaciones
   (obligatorias)"** cuando hay diferencia o el corte mezcla varios días, el aviso **"Este corte
   quedará registrado a su nombre: …"** y el botón rojo **"Cerrar corte de $300.00"**.
4. La ventana **"Cerrar corte de caja"**, que termina con **"La caja quedará en cero y este corte NO se
   podrá modificar después. ¿Continuar?"**, y el aviso **"Corte SATAG-CORTE-2026-000003 cerrado ·
   $300.00 en 3 cobro(s) · cuadró exacto."**.
5. **"Historial de cortes (N)"**: **"Folio"**, **"Fecha"**, **"Esperado"**, **"Contado"**, **"Diferencia"**,
   **"Cobros"**, **"Por"**, **"Observaciones"**; cada renglón despliega sus recibos.

**Qué se dice.** "Se cuenta el efectivo **antes** de tocar la pantalla. El corte no se define por fechas
sino por lo que esté sin cortar; congela los recibos que incluye y **no se puede reabrir ni corregir**,
ni siquiera por Sistemas: un error se explica en las observaciones del corte siguiente. No hay fondo de
cambio, ni corte automático, ni recordatorios: la única señal es el color de **"En caja ahora"**."

**Preguntas a Administración.**
- ¿Quién corta y con qué frecuencia? Recomendación: diario, una sola persona (decisión B1).
- ¿Dónde se entrega el efectivo y qué constancia necesitan fuera del sistema? (decisión B8)

**Variante staging.** Con el cobro del paso 2 en caja, se cierra un corte en vivo y se muestra el
historial.

---

### Paso 4 · Instalación del TAG por Sistemas (6 min)

**Modo:** en vivo para la regla de control interno (el expediente real aparece en **"Esperando
pago"**); el formulario de instalación con capturas (`2026-08-17/panel/02-pestana-ti.png` y
`salida/tanda-f/`).

**Qué se muestra.**

1. Pestaña **"TI"** (perfil **"TI"** la ve como vista única, sin pestañas). Las cuatro colas con su
   contador semáforo: **"Instalar TAG"** (**"En espera de instalación"**), **"Actualizar datos"**
   (**"Placas, vehículo o reposición de TAG"**), **"Dar de baja"** (**"Egresos y cancelaciones"**) y
   **"Notas sin expediente"** (**"Buzón sin folio: vincular o descartar"**). El distintivo de espera
   **"hoy"** / **"hace 1 día"** / **"hace N días"** (verde 0–2, ámbar 3–6, rojo 7 o más).
2. Entrar a **"Instalar TAG"**. `SATAG-000001` está en la sección atenuada **"Esperando pago (N)"** con
   el aviso **"Falta registrar el pago en Administración; el TAG se instala después del pago."**.
   **Aquí no hay formulario ni botón**: es la separación cobro/instalación funcionando en vivo.
3. En captura, el formulario para un expediente ya pagado: chips de **"Estacionamiento (acceso del
   TAG)"** (obligatorio al instalar, se puede elegir más de uno), campo **"No. de TAG (6–11 dígitos)"**
   (ejemplo **"Ej. 9426780"**, se teclea a mano, no hay lector), la casilla **"La familia trae su propio
   TAG (se aparta el de la escuela)"** con el opcional **"No. del TAG apartado (opcional, 6–11
   dígitos)"** (**"Queda reservado, sin instalar, para una reposición futura."**), **"Instalado por"**,
   botón **"Instalar y activar TAG {número}"**, la ventana **"Instalar y activar TAG"** que termina con
   **"Revise bien el número. ¿Continuar?"** y el aviso **"TAG {número} instalado y activado ({folio})."**.
4. Mencionar **"Actualizar datos"** (placas, vehículo, procedencia, estacionamiento) y que cambiar el
   **"No. de TAG"** ahí **registra una reposición** y deja el anterior inactivo; y **"Dar de baja"**, que es
   definitiva.

**Qué se dice.** "Sistemas no puede instalar sin pago registrado; no es un obstáculo técnico, es control
interno. El estacionamiento lo asigna Sistemas al instalar, con la familia presente. Nada de lo que hace
TI se deshace desde el panel."

**Preguntas a Administración.**
- ¿Confirman que el estacionamiento lo asigna Sistemas al instalar y no Administración al cobrar? Así
  está construido y así lo dice el comprobante.
- Si una familia pierde el TAG o cambia de vehículo, **¿se cobra otra vez?** Hoy la reposición desde
  **"Actualizar datos"** no pasa por caja (decisión B7).

**Variante staging.** Se instala en vivo el folio cobrado en el paso 2, con un número de TAG de práctica.

---

### Paso 5 · Buzón público `/solicitudes/` y bandeja de TI (5 min)

**Modo:** en vivo sin ejecutar (se llenan los formularios y **no se pulsa "Enviar solicitud" ni "Enviar
nota"**); la vinculación en TI con capturas de la tanda F.

**Qué se muestra.**

1. Desde la portada, el bloque **"¿Ya tiene TAG?"** (**"Solicite una actualización de datos (placas,
   vehículo, reposición) o la baja de su registro."**) y el enlace **"Solicitar actualización o baja →"**.
   Pantalla **"Actualización o baja de su TAG"**: **"Si necesita actualizar sus datos (placas, vehículo,
   reposición de TAG) o dar de baja su registro, solicítelo aquí. Sistemas lo atenderá en persona."**
2. La pregunta **"¿Tiene su folio de comprobante (SATAG-000123)?"**.
   - **"Sí, tengo mi folio"**: **"¿Qué necesita?"** con **"Actualizar mis datos"** / **"Dar de baja mi
     registro"**, **"Folio de su comprobante"**, **"Placas (o No. de TAG si no tiene placas)"**,
     **"Cuéntenos brevemente qué necesita"** (máximo 500), botón **"Enviar solicitud"**. Decir que si
     folio y placa no coinciden con un registro vigente responde **"Los datos no coinciden con ningun
     registro vigente"** y **nunca muestra datos** del registro.
   - **"← Cambiar"** → **"No tengo folio"**: **"¿Quién solicita?"** (**"Padre/Madre/Tutor"**, **"Maestro"**,
     **"Administrativo"**), **"Su nombre"**, **"Descripción del coche (opcional)"**, y para padres
     **"Nombre del alumno"** y **"Grado y grupo"**; **"¿Qué necesita?"** (**"Actualizar datos"** / **"Dar de
     baja"**), **"Cuéntenos más (detalles)"**, botón **"Enviar nota"**. Al pie, la leyenda de privacidad
     que nombra la ley completa.
3. En el panel, cola **"Notas sin expediente"** (en el sitio real dirá **"✓ No hay notas sin
   expediente. Todo al día."**). En captura: la nota con **"Solicitante"**, **"Quién solicita"**,
   **"Pidió"**, **"Alumno"**, **"Grado"**, **"Coche"**, **"Fecha"**, **"Qué necesita"**; el chip **"Vincular
   a un expediente"**, el buscador **"Busque el expediente por nombre, placa o folio"**, **"Elegir este
   expediente"**, la corroboración **"El cliente pidió {trámite}. ¿Qué trámite corresponde?"** y el
   botón **"Vincular como {Actualizar datos o Dar de baja}"**; o bien **"Descartar"** con **"¿Por qué se
   descarta?"**.

**Qué se dice.** "El buzón **no aplica ningún cambio en línea**: solo deja el aviso; el cambio lo hace
Sistemas con la persona presente. Sin folio, la nota es inerte hasta que TI la vincula por el nombre.
Instalar **no** es un trámite del buzón: el TAG se instala a partir del alta. Desde el 25-ago hay un
límite por conexión (10 notas por hora; 10 intentos fallidos con folio cada 15 minutos) sin depender de
servicios externos."

**Pregunta a Administración.**
- ¿Quién recibe en ventanilla a quien perdió el folio, y a quién lo canalizan? El manual dice que a
  Sistemas; si prefieren que pase primero por Administración, se cambia el texto del manual, no el
  sistema.

**Variante staging.** Se envían una solicitud con folio y una nota sin folio en vivo; en TI se vincula y
se descarta.

---

### Paso 6 · Consulta y evidencia de la firma (3 min)

**Modo:** en vivo, solo lectura, sobre `SATAG-000001` (la firma es la de Gerardo).

**Qué se muestra.**

1. Pestaña **"Consulta"**: indicadores **"Pendientes"**, **"Registros"**, **"Activos"**; el buscador y el
   botón **"Filtros"** (**"Estado"**, **"TAG"**, **"Estacionamiento"**, **"Vehículo"**); el aviso
   permanente **"Vista de solo consulta: las acciones se ejecutan desde Administración o TI, según
   corresponda."**.
2. Abrir la tarjeta: el expediente completo, la **"Bitácora"** (**"Fecha"**, **"Tipo"**, **"Motivo"**,
   **"Por"**) y el bloque **"Evidencia de aceptación"** con el botón **"Ver la firma"** (texto de
   pantalla; los manuales de E8 aún no lo describen). Al pulsarlo: la imagen de la firma, quién firmó y
   en qué calidad, versión del reglamento y del aviso aceptados, sello de tiempo y hash. El enlace de la
   imagen caduca en 60 segundos y el archivo nunca es público.

**Qué se dice.** "Esto es lo que respalda al Instituto si alguien niega haber aceptado el reglamento. Lo
ven los cuatro perfiles del panel, y Consulta solo lee: no puede cobrar, instalar ni borrar. El sistema
no exporta ni imprime listados; si necesitan un concentrado, se pide a Sistemas."

**Pregunta a Administración.**
- ¿Alguien de Administración o Dirección necesita perfil **"Consulta"** (solo lectura) además de quien
  cobra? (decisión B1)

### A.3 Cierre de la demo (puente a las decisiones)

"Todo lo que vieron ya funciona y está probado (la bitácora de pruebas registra, al 25-ago, 52 casos
aprobados y 10 observaciones con riesgo aceptado; los que faltan son los que tienen que ejecutar
ustedes con sus cuentas y con familias reales). Lo que detiene el cierre no es
código: son las decisiones de esta lista."

---

## B. Decisiones que Administración debe tomar en la reunión (lista cerrada)

Fuente de cada fila: tablero `E6 - Decisiones Legales Pendientes`, checklist E6 §4, bitácora de
cambios (Doc 4), guía de sesiones (Doc 5) y la matriz de riesgos (Doc 3, R13). Prioridad: **A** decide
el cierre del 19-sep · **M** conviene hoy · **B** puede esperar.

| # | Decisión | Opciones concretas | Recomendación de TI | Si no se decide el 4-sep | Pri. |
|---|---|---|---|---|---|
| **B1** | **Quién cobra, quién corta y quién instala.** Persona/puesto de Administración con perfil **"Administración"**; persona de Sistemas con perfil **"TI"**; si alguien más requiere **"Consulta"**. Cada cuenta nace por invitación al correo institucional, exige contraseña propia y segundo factor en el teléfono. Hoy los roles de prueba son: Miguel González `admin`, Lidia Segundo `ti`, Gerardo `super`; Ángel Martínez sin rol. | a) Una sola persona de Administración cobra y corta. b) Dos personas cobran, una designada corta. c) Cobra Administración y corta la Gerencia Administrativa. Para Sistemas: Lidia (ya con rol) y/o Ángel [confirmar]. | **b)** con corte diario por una sola persona designada y una suplente; **Consulta** para la Gerencia Administrativa. Migrar al subdominio **antes** de invitar, para que las cuentas nazcan contra el dominio definitivo. | No hay cuentas → no hay pruebas reales (F-01, tanda U) ni capacitación → no se cierra el 19-sep. | A |
| **B2** | **Responsable ARCO** (E6 filas 1 y 2): ¿departamento o persona con nombre? ¿Administración es dueña del proceso y TI ejecutor técnico? | a) Administración como responsable formal, con un titular operativo interno; TI ejecuta (exporta, bloquea, borra) a petición. b) TI como responsable publicado. c) Persona con nombre. | **a)** Da continuidad si alguien cambia de puesto; es lo que el aviso necesita para publicarse. | El aviso v3 no puede nombrar al responsable → Legal no lo aprueba → tanda A (8 casos) abierta. | A |
| **B3** | **Correo de contacto oficial que verán las familias.** El aviso publicado (v2) y el simplificado ya imprimen `aviso.privacidad@asuncionqro.edu.mx` (E6 fila 3, "Decidido"), pero [confirmar] que el buzón exista y quién lo lee. El comprobante no lleva ningún contacto para dudas del trámite. | a) Crear/confirmar el buzón de rol `aviso.privacidad@…` para ARCO y no poner contacto de trámite en el comprobante (el comprobante ya dice a dónde acudir). b) Lo anterior + un correo o teléfono de Administración en el comprobante para dudas del trámite. c) Sustituir por el correo de Administración existente. | **a)** para ARCO (buzón de rol, no personal, leído por quien Administración designe en B2). Sobre el contacto de trámite, lo que Administración prefiera: es un texto, no un desarrollo. | Si el buzón no existe, el aviso promete un canal que nadie atiende (incumplimiento ante el titular). Sin contacto de trámite, las dudas llegan a ventanilla sin filtro. | A |
| **B4** | **Aviso de privacidad: integrado al del portal institucional o independiente; y quién aprueba la v3.** La v3 corrige los acentos (D-13), incorpora el plazo de conservación (B5), las opciones de limitación de uso (art. 15 fr. IV) y la remisión a la videovigilancia del reglamento. Está con Legal vía el contador; tope para no mover el 19-sep: **12-sep**. | a) Aviso SATAG independiente en `/aviso-de-privacidad` (como hoy), referenciado desde el aviso general del IAQ. b) Integrar SATAG como anexo/sección del aviso del portal institucional [confirmar URL y responsable de ese aviso], manteniendo la página propia como copia versionada. c) Solo el aviso del portal, sin página propia. | **a)** o **b)**; **no c)**: el sistema guarda la versión exacta que cada persona aceptó y necesita su propio texto versionado. Quien apruebe debe poder comprometer al IAQ (Dirección o su representante). | Sin v3 aprobada al 12-sep se mueven Definición legal, CC-09, lote D (bloque 52) y el acta; el sistema sigue mostrando la v2 sin acentos. | A |
| **B5** | **Plazo de conservación de los expedientes** (E6 fila 4, nota enviada el 03-ago, en revisión): cuánto se guarda un expediente después de la baja y quién ejecuta la supresión. | a) **6 años desde la baja**, todo el expediente incluida la firma. b) 10 años para todo. c) Otro. *(Dos plazos distintos no es opción limpia: la firma está atada al expediente.)* | **a)**: es la referencia legal (72 meses), evita conservar datos de menores "por si acaso" y se cumple con una revisión anual (Administración pide, TI ejecuta). | El aviso promete suprimir "al vencer el plazo aprobado" y no hay plazo: Legal firmaría una promesa vacía. | A |
| **B6** | **Definición de "vigencia del TAG"** para el plazo anterior: qué evento la termina. | a) La baja del registro (egreso, cambio de vehículo, cancelación). b) El fin de cada ciclo escolar, con renovación al reinscribirse. | **a)**: es lo que el sistema ya registra (estado **"Baja"** con fecha). La opción b) exige un proceso de renovación que no existe. | Sin este dato la v3 no puede redactar el apartado de conservación. | A |
| **B7** | **Reposición de TAG con cobro.** Si el TAG se pierde, se daña o la familia cambia de vehículo: ¿se cobra de nuevo? ¿mismo precio ($100)? ¿quién autoriza? Hoy: la reposición desde **"Actualizar datos"** **no pasa por caja** (cada expediente admite un solo pago) y **"Usar el TAG apartado"** tampoco. | a) Reposición **sin cobro** (como está construido). b) Reposición **con cobro de $100**: se da de baja el registro y la familia hace un alta nueva y paga otra vez (funciona hoy sin cambios; se pierde el historial en un solo expediente). c) Reposición con cobro **dentro del mismo expediente**: requiere desarrollo (segundo pago por expediente, bloque nuevo) → CC posterior al cierre. | **a)** o **b)** para arrancar; si Administración quiere **c)**, se registra como CC-22 con estimación y se hace **después** del 19-sep. Cualquier precio distinto de $100 también es cambio en el sistema, no en ventanilla. | Ventanilla improvisa: unas reposiciones se cobran y otras no, sin regla ni rastro. | M |
| **B8** | **Tratamiento contable del cobro** (E6 fila 11): el sistema emite folio interno `SATAG-AAAA-######`, único por expediente, y corte con folio `SATAG-CORTE-AAAA-######`; **no emite CFDI ni imprime recibo**. | a) El folio interno y el corte bastan como control; el recibo formal, si alguien lo pide, lo emite la Dirección Administrativa fuera del sistema. b) Se requiere recibo impreso o CFDI → fuera de alcance (Doc 2 §2.1), se registra como CC o se resuelve con papelería. c) Definir a dónde se entrega el efectivo cortado y qué constancia se guarda. | **a)** + **c)**. Un comprobante impreso desde el sistema sería un CC posterior. | Contabilidad y ventanilla operan con criterios distintos; los cortes no encajan con la contabilidad. | M |
| **B9** | **Autorización de las pruebas reales con familias y del arranque.** Fecha, alcance (cuántas familias, qué estacionamientos), horario y lugar de cobro e instalación (no hay agenda ni citas), canal de difusión de la dirección, quién comunica. Incluye la capacitación de media jornada (tanda U: 5 casos que **deben ejecutar** Administración y Sistemas, no el desarrollador). | a) Piloto acotado: personal del Instituto y 5–10 familias voluntarias la semana del 7-sep, en el sitio migrado. b) Arranque general con el ciclo escolar en curso desde una fecha fija. c) Diferir: sin fecha. | **a)** la semana del 7-sep, tras la migración y las cuentas de B1; arranque general al aceptar el proyecto (19-sep). Definir en la reunión día y hora de la capacitación. | Sin fecha ni alcance, F-01, la tanda U y el acta no se cierran; el sistema queda terminado y sin uso. | A |
| **B10** | **Reglamento de estacionamiento (v2, 22 cláusulas)**: validación de Legal sobre límites de responsabilidad (daños, robo) y la videovigilancia que anuncia (E6 fila 10). | a) El texto v2 publicado es el definitivo. b) Legal lo modifica → se publica v3 del reglamento (bloque SQL nuevo; las firmas anteriores conservan la v2 que aceptaron). | Que Legal lo revise junto con la v3 del aviso, en el mismo envío, para no abrir dos ciclos. | Se opera con un reglamento no validado por Legal; cualquier cambio posterior obliga a que las familias ya registradas lo acepten de nuevo. | M |
| **B11** | **Señalética física**: cartel corto en el estacionamiento/ventanilla con la dirección del sistema y el aviso simplificado (checklist E6 §4, media-alta). | a) Aprobar cartel corto y ubicación. b) Solo difusión digital. | **a)** después de la migración, para imprimir la dirección definitiva una sola vez. | Las familias no saben dónde registrarse; llegan a ventanilla sin folio. | B |
| **B12** | **Integración con ZKBioSecurity (R13 / SC-006)**: la API de terceros no está activada; se compra aparte (`ZKBS-API-S1`, distribuidor SMARTHAUS). **La decisión de cotizar y comprar es de Contabilidad, no de TI.** TI ya entregó investigación, diseño del conector y plan B por archivo. | a) Cotizar con SMARTHAUS y decidir con precio en mano. b) Operar con el plan B (exportación/importación por archivo, manual). c) No integrar: capturar el No. de TAG en ZKBioSecurity a mano, como hoy. | Fuera del alcance y del cierre. Si Contabilidad la quiere, **a)** primero; no se programa nada hasta que exista la licencia. | Nada se detiene; queda registrada la expectativa de Contabilidad y lo que la resolvería. | B |

> **Lo que no está en esta lista no se decide el 4-sep.** NOM-151 (constancia de conservación) está
> diferida a fase 2 (CC-14) y solo se cotiza si Dirección quiere mayor fuerza probatoria; el DPA y la
> región de Supabase son de TI. Si en la reunión surge una petición nueva de funcionalidad, se anota en
> la minuta como **solicitud de cambio** con su solicitante y se evalúa después del cierre.

---

## C. Lo que TI ya decidió y solo informa (no se reabre)

| Tema | Decisión vigente | Dónde consta |
|---|---|---|
| **Precio del TAG** | **$100** es un dato del sistema (constante), no un campo: el formulario lo muestra y el botón cobra exactamente eso. Quedó fijado en la minuta de la junta de Sistemas del **24-ago-2026** con la Gerencia Administrativa. Cambiarlo es un cambio en el sistema, con registro, no en ventanilla. | Commit `45838a8`; Manual de Administración §3 |
| **TAG propio se cobra igual** | Sin descuentos, exenciones ni precio diferenciado; el sistema no distingue procedencia al cobrar. La escuela aparta un TAG para reposición futura. | CC-19 (Doc 4); Manual de Administración §4 |
| **Quien cobra es la sesión** | **"Cobrado por"** se toma del usuario firmado y no se edita; el bloque 50 sella además el correo del JWT y rechaza un cobro sin identidad. Mismo criterio que el corte. | Commit `c88cbca`; bloque 50 (aplicado 25-ago) |
| **Un solo pago por expediente; nada se corrige** | Folio de recibo automático e inmutable; sin edición, cancelación ni reembolso; corte irreversible, con observaciones obligatorias si hay diferencia o varios días. | CC-18, CC-21 (Doc 4); bloques 32 y 42 |
| **Tipo de usuario se confirma al cobrar** | Cobrar y validar son el mismo acto; si difiere de lo declarado, el expediente se corrige con rastro en bitácora; un menor queda fijo en **"Alumno"**. | Bloque 46 (29-jul) |
| **Apellido materno opcional** | El servidor siempre lo aceptó vacío; la obligación era del formulario. Aplica a conductor y gestionante. | Commit `5ccdb03` (24-ago) |
| **El comprobante lleva la copia del trámite** | Datos registrados + reglamento + aviso aceptados + constancia de quién firmó y cuándo; plegados en pantalla, completos al imprimir o guardar como PDF. Equivale al ejemplar que la familia se llevaba en papel. | Commits `eb524c4`, `714a86a` (24-ago) |
| **Sin documento no hay alta** | Si el aviso o el reglamento no cargan, la casilla no se habilita y el servidor rechaza el alta sin las versiones mostradas (D-01, bloque 49). La evidencia registra lo que se mostró, o no hay alta. | Bloque 49 (18-ago); Pruebas/02 D-01 |
| **Evidencia de la firma visible para los cuatro perfiles** | Admin, TI, Consulta y Super la leen bajo demanda con enlace temporal de 60 s; Consulta no escribe. Riesgo aceptado: la RLS es por fila, no por columna. | Bloque 48 (29-jul); Doc 4 |
| **Buzón: recolectar es público, buscar es privado** | El buzón nunca muestra datos del registro; la nota sin folio es inerte hasta que TI la vincula y **corrobora** el trámite; instalar no es trámite del buzón. | SC-003, CC-20; bloques 34–41 |
| **Límite de intentos sin servicios externos** | 10 notas por conexión por hora; 10 intentos fallidos con folio por 15 min. Sin captcha ni servicios de terceros, a propósito. | Bloque 51 (25-ago); P-11/P-12 |
| **Demos y pruebas sin tocar el padrón real** | Desde el 18-ago el padrón es real: las demostraciones llegan hasta el botón y no lo pulsan, o usan el arnés que intercepta la red, o corren en staging. `seed_tests_dev.sql` **no** se corre contra la base real. | Arranque 18-ago; `ver-copia-titular.mjs` |
| **Alcance cerrado desde el 29-jul** | Sin pago en línea, sin CFDI, sin correos ni avisos automáticos, sin exportación ni impresión desde el panel, sin integración con hardware. Lo nuevo es CC posterior al cierre. | Doc 2 §2.1; README |
| **Hosting** | Vercel es interino; la salida oficial es en `satag.asuncionqro.edu.mx` (subdominio institucional + Cloudflare); el flujo de despliegue ya existe y queda inerte hasta tener el subdominio y la cuenta FTP. Migrar **antes** de invitar al personal. | SC-012; commits `0320e46`, `c14b000` |
| **Nombre del área hacia afuera** | Para las familias el área se llama **Sistemas** (comprobante, buzón); dentro del panel sigue **TI**. | Lote A (D-05) |
| **Trato de usted** | Todo texto de cara a personas, incluidos los mensajes de la base, va de usted; un guardián automático lo verifica en cada envío. | Lote A, bloque 49, commit `7179e82` |
| **Sesión persistente** | Cerrar la ventana no cierra la sesión: en equipo compartido se pulsa **"Salir"**. Un cierre por inactividad se evaluará solo si Administración opera en equipo compartido. | Doc 5 (28-jul); E8 Índice |
| **Padrón paginado** | 25 tarjetas por página con **"Mostrar 25 mas"** y filtros por estado, pensando en 300 familias. | Commit `4245076` (25-ago) |
| **ZKBioSecurity** | TI entregó lo suyo; no hay nada que programar sin licencia. | R13; `Investigacion/03` |

---

## D. Checklist de preparación (todo listo el 3-sep)

### D.1 Cuentas y accesos

- [ ] Sesión de Gerardo (`super`) probada en el equipo de proyección: correo, contraseña, segundo factor.
- [ ] Confirmar roles en `auth.users` (consulta rápida en `supabase/sql/README.md` PASO 0): Miguel `admin`, Lidia `ti`, Gerardo `super`; Ángel pendiente de `ti` [confirmar].
- [ ] Bloques 50 y 51 aplicados y verificados (`arnes/verificar-50-51.sql`); P-11 con el diagnóstico de `arnes/diagnostico-p11.sql` cerrado o anotado como pendiente del bloque 52.
- [ ] Estado de la migración al subdominio: si ya está hecha, la demo corre ahí y la dirección se dice en voz alta; si no, se muestra `satag.vercel.app` y se explica que es temporal. **No invitar todavía al personal de Administración.**
- [ ] `SATAG-000001` sigue **"Por cobrar"** y sin TAG (es el expediente real que se usa en los pasos 2, 4 y 6). No cobrarlo antes de la reunión.

### D.2 Capturas y evidencia a la mano (carpeta `SATAG - Evidencia de pruebas/`)

- [ ] `2026-08-24/comprobante-copia-titular/`: `escritorio-01-comprobante-plegado.png`, `escritorio-02-copia-desplegada.png`, `escritorio-03-como-sale-impreso.png`, `escritorio-comprobante.pdf` y sus gemelas `celular-*`.
- [ ] `2026-08-17/panel/`: `01-pestana-administraci-n.png`, `02-pestana-ti.png`, `03-pestana-finanzas.png`, `04-pestana-consulta.png`, `06-expediente-abierto.png`, `07-E07-evidencia-de-firma.png`.
- [ ] `2026-08-17/tanda-f/` (aviso verde del recibo, corte cerrado, historial, instalación, nota vinculada) — [confirmar] qué capturas exactas y ordenarlas en una carpeta `2026-09-04/demo/` con nombre por paso.
- [ ] `2026-08-18/escritorio/` y `celular/`: recorrido público completo (pasos 1 a 5, buzón, aviso).
- [ ] `2026-08-18/comprobante-SATAG-000001.pdf` (comprobante real, anterior a la copia del titular) por si preguntan por el alta de campo.

### D.3 Arnés

- [ ] `cd "SATAG - Evidencia de pruebas/arnes"` y `node ver-copia-titular.mjs https://satag.vercel.app` (o la dirección migrada) **el 3-sep**, para que el comprobante de ejemplo refleje el sitio publicado ese día. Revisar `salida-copia/`.
- [ ] Si se quiere el comprobante en vivo durante la reunión, correr el mismo guion con navegador visible (ajuste menor al `chromium.launch()`); si no, bastan las capturas y el PDF.
- [ ] `node sesion.mjs` solo si se va a usar `panel.mjs`; para la demo basta la sesión manual.

### D.4 Staging (si existe el 3-sep) [confirmar]

- [ ] Proyecto Supabase de pruebas con los bloques `00`→`51` aplicados y `seed_tests_dev.sql` sembrado (14 escenarios + 6 incompletos + notas sin vincular).
- [ ] Cuentas de prueba por rol con segundo factor inscrito (`admin`, `ti`, `consulta`).
- [ ] Un despliegue del sitio apuntando a ese proyecto (variables `NEXT_PUBLIC_SUPABASE_URL` / clave anónima de staging), con dirección distinta y visible en pantalla para que nadie lo confunda con el real.
- [ ] Número de TAG de práctica (6–11 dígitos, sin dispositivo real) y caja en ceros antes de empezar.
- [ ] Si staging **no** existe: seguir las variantes "sin ejecutar" de cada paso; no improvisar sobre el padrón real.

### D.5 Impresos

- [ ] **Comprobante de ejemplo**: `escritorio-comprobante.pdf` del 3-sep (dos hojas: folio + copia del trámite), una copia por asistente.
- [ ] **Manual del Usuario** (`E8 - Manual del Usuario.md`), una copia; antes de imprimir, agregar en su §10 la sección **"Su copia del trámite"** del comprobante, que hoy no describe.
- [ ] **Manual de Administración**, una copia para quien vaya a cobrar (la nota de §4 sobre el monto se conció el 25-ago con el monto fijo de §3).
- [ ] **Nota de decisión del plazo de conservación** (`E6 - Nota de Decision - Plazo de Conservacion.md`) con su hoja de firma en §7, para resolver B5/B6 en el acto.
- [ ] **Tablero E6 de decisiones** y la **tabla B** de este documento, para marcar en vivo.
- [ ] **Este documento con la minuta E** en blanco, dos copias.
- [ ] Hoja de asistencia (Guía de Capacitación §7) si la capacitación se agenda ahí mismo.

### D.6 Sala

- [ ] Proyector o pantalla, conexión a internet probada en la sala, y un celular con el sitio abierto para mostrar el trámite en teléfono (lote B).
- [ ] Ventana del navegador limpia: una pestaña con la portada, otra con `/admin`, otra con la carpeta de capturas.

---

## E. Minuta (para llenar durante la reunión)

**Reunión de requerimientos SATAG — 4-sep-2026** · Lugar: ______________ · Inicio: ______ · Fin: ______

### E.1 Asistentes

| Nombre | Área / puesto | Firma |
|---|---|---|
| | Gerencia Administrativa | |
| | Administración (cobro / caja) | |
| | Sistemas (instalación) | |
| | Sistemas (aprobador) | |
| Gerardo Sánchez | Soporte TI (presenta) | |
| | | |

### E.2 Decisiones tomadas

| # | Decisión | Opción elegida | Detalle / condiciones | Quien decide (nombre) |
|---|---|---|---|---|
| B1 | Quién cobra, quién corta, quién instala | | Cobra: ________ · Corta: ________ · Instala: ________ · Consulta: ________ | |
| B2 | Responsable ARCO | | | |
| B3 | Correo de contacto para las familias | | Buzón ARCO: ________ · Contacto en comprobante: ________ | |
| B4 | Aviso de privacidad: integrado / independiente · quién aprueba la v3 | | Aprueba: ________ · Fecha tope: ________ | |
| B5 | Plazo de conservación | ☐ 6 años ☐ 10 años ☐ Otro: ____ | | |
| B6 | Fin de la vigencia del TAG | ☐ Baja del registro ☐ Fin de ciclo | | |
| B7 | Reposición con cobro | ☐ Sin cobro ☐ Baja + alta nueva ($100) ☐ CC nuevo | Autoriza: ________ | |
| B8 | Tratamiento contable del cobro | | Entrega del efectivo: ________ · Constancia: ________ | |
| B9 | Pruebas reales y arranque | | Fecha piloto: ________ · Alcance: ________ · Horario cobro: ________ · Horario instalación: ________ · Difusión: ________ · Capacitación: ________ | |
| B10 | Reglamento v2 | ☐ Definitivo ☐ Legal lo modifica | | |
| B11 | Señalética | | | |
| B12 | ZKBioSecurity (Contabilidad) | ☐ Cotizar ☐ Plan B ☐ No integrar | | |

### E.3 Solicitudes de cambio surgidas (no se ejecutan antes del cierre)

| # | Petición | Solicitante | Comentario de TI |
|---|---|---|---|
| CC-__ | | | |
| CC-__ | | | |

### E.4 Acuerdos, responsables y fechas

| Acuerdo | Responsable | Fecha compromiso |
|---|---|---|
| Migración al subdominio institucional | TI (Gerardo) | |
| Invitaciones y roles de las cuentas de B1 | TI (Gerardo) | |
| Alta del segundo factor de cada cuenta | Cada titular, acompañado por TI | |
| Envío a Legal de la v3 del aviso con B2, B5 y B6 resueltos | TI redacta · Gerencia Administrativa entrega | |
| Aprobación de la v3 del aviso (tope 12-sep) | Dirección / Legal | |
| Capacitación de media jornada + tanda U | Administración y Sistemas | |
| Piloto con familias (alcance de B9) | Administración, Sistemas, TI | |
| Cotización ZKBS-API-S1 (si B12 = cotizar) | Contabilidad | |
| Acta de aceptación y cierre | Aprobador (M. Á. González) | 19-sep-2026 |
| | | |

### E.5 Pendientes que quedaron sin decidir y por qué

| # | Motivo | Cuándo se retoma |
|---|---|---|
| | | |

**Elaboró:** Gerardo Sánchez · **Revisó:** ______________ · **Fecha de cierre de la minuta:** ______
