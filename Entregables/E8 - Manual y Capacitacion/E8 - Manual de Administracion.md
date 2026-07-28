# Manual de Administracion (cobro y corte de caja)

> **Sistema:** SATAG - Sistema de Adquisicion de TAG Vehicular.
> **Institucion:** Instituto Asuncion de Queretaro, A.C.
> **Modulo:** pestañas "Administración" y "Finanzas" del panel de gestion.
>
> **Nota sobre la direccion del sistema.** El sistema se encuentra hoy en un alojamiento temporal y migrara al subdominio institucional. Por esa razon este manual no incluye ninguna direccion escrita: **la direccion vigente se la proporciona el Departamento de TI**. Solicitela una sola vez, guardela en los favoritos de su navegador y, cuando ocurra la migracion, TI le indicara la nueva. En este documento se le llama simplemente "la direccion del sistema"; el panel de trabajo se abre agregando `/admin` al final de esa direccion.

## Identificacion del capitulo

| Concepto | Detalle |
|---|---|
| **Para quien es** | Personal de Administracion del IAQ que recibe en efectivo el pago del TAG, responde por la caja y cierra el corte. Sirve tambien a Direccion como referencia del control interno del efectivo. |
| **Que resuelve** | Registrar el cobro del TAG de cada expediente, consultar los pagos ya registrados, saber cuanto efectivo debe haber fisicamente en la gaveta y cerrar el corte de caja dejando constancia de lo esperado, lo contado y la diferencia. |
| **Que necesita antes de empezar** | 1) La direccion del sistema (la proporciona el Departamento de TI). 2) Una cuenta institucional con el rol **Administración** ya asignado por el administrador del sistema. 3) La aplicacion de autenticacion (segundo factor) instalada y funcionando en su telefono. 4) Al momento de cortar, el efectivo fisico ya contado. |

## Reglas de oro (lealas antes de operar)

> **ADVERTENCIA 1. El corte de caja no se puede deshacer.** No existe boton, pantalla ni procedimiento para reabrir, corregir, anular o borrar un corte cerrado. El propio sistema lo impide incluso para el personal tecnico, con el mensaje "Un corte de caja cerrado no se puede modificar ni borrar (folio SATAG-CORTE-2026-000003)" y la indicacion "Si el corte quedo mal, deje constancia en las observaciones del corte siguiente.".

> **ADVERTENCIA 2. Un pago registrado tampoco se corrige.** No hay edicion, cancelacion ni reembolso desde el panel. Cada expediente admite **un solo pago**, y una vez incluido en un corte queda congelado: "El pago SATAG-2026-000045 ya fue cortado y no admite cambios".

> **ADVERTENCIA 3. Lo que usted confirma queda a su nombre.** El corte se registra con el nombre de la sesion abierta y ese nombre no es editable. No preste su sesion ni deje el panel abierto sin vigilancia; use "Salir" al terminar.

---

## 1. Entrar al modulo de Administracion

1. Abra la direccion del sistema y agregue `/admin`. Vera la pantalla **"Panel administrativo"**, con la leyenda "Acceso para personal de administración y TI del IAQ.".
2. Escriba su correo institucional en el campo **"Correo"** y su contraseña en **"Contraseña"**.
3. Pulse **"Iniciar sesión"**. Mientras el sistema procesa, el boton cambia a "Entrando…". Si no recuerda su contraseña, use el enlace "¿Olvidó su contraseña?".
4. El sistema le pedira el segundo factor en la pantalla **"Verificación en dos pasos"**. Escriba el codigo de 6 digitos que muestra su aplicacion de autenticacion en el campo **"Código de verificación"** y pulse **"Verificar"** (mientras valida se lee "Verificando…").
   - El campo solo acepta digitos y el boton permanece apagado hasta que el codigo tenga **exactamente 6 digitos**.
   - Los codigos caducan cada pocos segundos: si el sistema lo rechaza, espere a que su aplicacion genere el siguiente e intentelo otra vez.
5. Ya dentro vera el encabezado **"Panel de gestión de TAG"** con el subtitulo "Administración y TI · IAQ". A la derecha aparecen el correo de su sesion, la etiqueta de su rol y el boton **"Salir"**.
6. Con rol Administración, la barra de pestañas muestra **"Administración"**, **"Finanzas"** y **"Consulta"**, y la pestaña activa es "Administración".
7. Al terminar su turno, pulse **"Salir"**.

**Resultado:** queda dentro del panel, con las pestañas "Administración", "Finanzas" y "Consulta" disponibles.

### 1.1. La primera vez: dar de alta el segundo factor

La primera vez que entra, en lugar de pedirle un codigo, el sistema muestra la pantalla **"Configure su segundo factor"** con un codigo QR.

1. Abra su aplicacion de autenticacion y escanee el codigo QR que aparece en pantalla.
2. Si su telefono no puede escanear, use la clave de respaldo que se muestra bajo el texto "¿No puede escanear? Escriba esta clave en su app" y capturela manualmente en la aplicacion.
3. Escriba el primer codigo de 6 digitos que genere la aplicacion y pulse "Verificar".

A partir de ese momento, cada inicio de sesion le pedira unicamente el codigo de 6 digitos.

> **Advertencia.** Sin superar el segundo factor **no se ve ninguna pantalla del panel y no se puede cobrar ni cortar**. Cualquier intento se rechaza con el aviso "Se requiere sesion con segundo factor (MFA)". Si cambia de telefono, avise al Departamento de TI **antes** de borrar la aplicacion de autenticacion.

### 1.2. Si aparece "Sin rol asignado"

Significa que su cuenta ya existe y ya paso el segundo factor, pero todavia no tiene un rol del panel. La pantalla lo explica ("Tu cuenta … aún no tiene un rol del panel…") y ofrece unicamente el boton **"Cerrar sesión"**. El rol lo asigna un administrador del sistema; solicitelo al Departamento de TI y vuelva a iniciar sesion para que se aplique.

---

## 2. Como esta organizada la pestaña "Administración"

Al entrar a **"Administración"** vera, en este orden:

1. La tarjeta de accion **"Registrar pago"**, con el subtitulo "Solicitudes nuevas pendientes de cobro" y, a la derecha, el numero de expedientes que esperan cobro. Ese numero cambia de color:

   | Color del contador | Significado |
   |---|---|
   | Verde | 0 expedientes por cobrar: no hay nada pendiente. |
   | Ambar | De 1 a 4 expedientes por cobrar. |
   | Rojo | 5 o mas expedientes por cobrar. |

2. El panel **"Padrón completo (N)"**, donde N es el numero de tarjetas que se estan mostrando (baja al filtrar con el buscador y vuelve al total al vaciarlo), con el buscador "Buscar por nombre, placa, No. de TAG o folio…" y las tarjetas del padron, ordenadas con los expedientes por cobrar al principio, despues los que siguen en proceso y al final los cerrados o dados de baja.

Cada tarjeta lleva un distintivo de cobro:

| Distintivo | Que indica |
|---|---|
| **"Por cobrar"** (ambar) | Todavia no se registra el cobro. Es el unico distintivo que **puede** admitir el pago, pero no lo garantiza: un expediente bloqueado tambien se muestra "Por cobrar" y al abrirlo no presenta formulario, sino el aviso "Registro bloqueado; debe resolverse el bloqueo antes de continuar.". Reciba el dinero solo cuando vea el formulario de pago. |
| **"Pagado"** (verde) | El cobro ya se registro. |
| **"Baja"** (gris) | El registro esta dado de baja. |

> **Nota importante.** Ese distintivo habla **solo del cobro**, no del ciclo de vida del expediente. Un registro puede decir "Pagado" aunque TI todavia no haya instalado el TAG. Los estados "Pendiente", "Activo", "Bloqueado" y "Baja" del tramite se consultan en la pestaña "Consulta" (la pestaña "TI" no esta disponible con el rol Administración).

---

## 3. Registrar el cobro desde la cola "Registrar pago" (via recomendada)

Es la forma recomendada de trabajar: muestra unicamente lo que falta cobrar y respeta el orden de llegada.

1. En la pestaña **"Administración"**, pulse la tarjeta **"Registrar pago"**.
2. Se abre la pantalla **"Registrar pago"** con la cola ordenada del expediente que lleva **mas tiempo esperando** al mas reciente. Esta pantalla no tiene buscador; para volver, use **"← Inicio"**.
   - Si no hay nada pendiente, se lee "✓ No hay pagos pendientes. Todo al día.".
3. Localice el expediente. Cada tarjeta muestra las placas (o **"SIN PLACAS"** cuando el vehiculo se dio de alta sin placas, o un guion **"—"** cuando no hay placas capturadas), el distintivo "Por cobrar", marca-modelo-color, el nombre y el tipo de usuario, el folio del expediente (formato SATAG-######), el estacionamiento si ya lo tiene, "TAG …" o "sin TAG", y un distintivo de espera que dice "hoy", "hace 1 día" o "hace N días".
4. Toque la cabecera de la tarjeta para abrirla; la pantalla desplazara esa tarjeta al inicio de la vista.
5. **Verifique el expediente antes de recibir el dinero.** En el detalle encontrara "Gestionante (paga y firma)" (puede decir "El mismo conductor"), "Procedencia TAG", el apartado "TAG apartado" cuando existe una reserva, "Pagos" (dira "Sin pago"), "Estacionamiento" (dira "Sin asignar") y "Observaciones", si las hay.
6. Revise el campo **"Monto en efectivo"**: viene prellenado con **100** y es editable. Capture el importe que realmente recibio.
   - Si escribe algo que no sea un numero mayor a cero, el recuadro se marca y aparece "Captura un monto mayor a cero.".
7. Lea el aviso "Folio de recibo: se generará automáticamente al confirmar.". **No existe un campo para teclear el folio**: lo asigna el sistema.
8. Revise **"Cobrado por"**: viene prellenado con su nombre, deducido del correo de la sesion, y **se puede corregir** si el dinero lo recibio otra persona (el campo sugiere "Nombre del cajero"). **Cuidado: el nombre que deje escrito se conserva para todos los cobros siguientes**, tanto en esta cola como en el padron, hasta que usted lo vuelva a cambiar o cierre sesion. Si lo corrigio para un cobro puntual, **devuelvalo a su nombre antes del siguiente**: un pago registrado no se puede editar ni cancelar, de modo que el nombre equivocado queda para siempre en el recibo y en el corte.
   - Si lo deja vacio aparece "Indica quién recibió el pago." y el boton queda deshabilitado.
9. Pulse el boton, que muestra el importe capturado: **"Registrar pago de $100.00"**. Si el monto no es valido, el boton dice solo "Registrar pago" y esta apagado.
10. Se abre la ventana de confirmacion **"Registrar pago"**. Leala completa: resume el monto, el folio del expediente, el nombre del titular, las placas (o "sin placas") y quien cobra. Por ejemplo: "Se registrará un pago en efectivo de $100.00 para SATAG-000123, NOMBRE DEL TITULAR (ABC-123-D). El sistema generará el folio del recibo. Cobrado por Gerardo Sanchez. ¿Continuar?".
11. Pulse **"Registrar pago"** para ejecutar, o **"Cancelar"** para volver sin cobrar.
12. La pantalla se desplaza al aviso verde con el folio del recibo generado, por ejemplo "Pago de $100.00 registrado · recibo SATAG-2026-000045 (SATAG-000123).", y el expediente desaparece de la cola.

**Resultado:** el expediente queda con un pago en efectivo y folio de recibo automatico (formato SATAG-AAAA-000001), sale de la cola de cobro, su distintivo cambia a "Pagado" en el padron, el dinero entra a la caja actual de la pestaña "Finanzas" y TI queda habilitado para instalar el TAG.

> **Advertencia.** Anote el folio del recibo en el momento: el sistema no imprime ni envia comprobante. El folio queda consultable en pantalla (ver seccion 5).

> **Advertencia.** Confirme el dialogo **una sola vez**. El boton se deshabilita mientras la operacion esta en curso y el sistema impide que un doble toque registre dos pagos, pero la buena practica es esperar el aviso verde antes de volver a tocar la pantalla.

### 3.1. Si no puede completar el cobro

Los tres primeros avisos de esta tabla no apagan ningun boton: **sustituyen por completo al formulario de pago** y solo se ven al abrir una tarjeta del "Padrón completo", nunca en la cola "Registrar pago" (esa cola unicamente lista expedientes por cobrar). Los dos ultimos casos si corresponden al boton apagado dentro del formulario.

| Lo que ve | Causa y solucion |
|---|---|
| "✓ Pago registrado. El expediente ya no está en la cola de cobro." | Ese expediente ya fue cobrado. No admite un segundo pago. |
| "Registro dado de baja; no admite cobro desde esta pantalla." | El expediente esta dado de baja. Consulte con TI antes de recibir dinero. |
| "Registro bloqueado; debe resolverse el bloqueo antes de continuar." | El expediente tiene un bloqueo. Debe resolverse antes de cobrar. |
| "Captura un monto mayor a cero." | El campo "Monto en efectivo" tiene algo escrito que no es un numero mayor a cero. Capture un importe valido. Si el campo queda **vacio** no aparece ningun mensaje: el boton simplemente queda apagado y dice "Registrar pago". |
| "Indica quién recibió el pago." | El campo "Cobrado por" quedo vacio o solo con espacios. Escriba el nombre de quien recibio el dinero. |

Si el cobro no se completa, la pantalla muestra en rojo el motivo concreto (por ejemplo "El registro ya tiene el pago SATAG-2026-000045 registrado" o "El registro esta dado de baja") y, solo cuando no logra identificarlo, "No se pudo registrar el pago.". En cualquiera de los casos **no se cobro nada**: corrija lo que indique el mensaje e intentelo de nuevo.

> **Nota.** Si el boton no responde durante unos segundos, hay una operacion en curso: espere el aviso de resultado.

> **Nota.** El formulario de pago no tiene boton "Cancelar" propio. Para desistir, cierre la tarjeta tocando otra vez su cabecera. El unico "Cancelar" esta en la ventana de confirmacion.

---

## 4. Registrar el cobro desde el padron (incluye el caso del TAG propio)

Use esta via cuando ya sabe de que expediente se trata y quiere buscarlo por nombre, placa o folio.

1. En la pestaña **"Administración"**, baje al panel **"Padrón completo (N)"**.
2. Si hace falta, escriba en el buscador **"Buscar por nombre, placa, No. de TAG o folio…"**. Si no hay coincidencias se lee, por ejemplo, "Sin resultados para «ABC123»."; si el padron esta vacio, "Aún no hay registros en el padrón.".
3. Identifique la tarjeta por su distintivo: solo **"Por cobrar"** puede admitir cobro. Abrala y **confirme que aparece el formulario de pago antes de recibir el dinero**: si en su lugar se lee "Registro bloqueado; debe resolverse el bloqueo antes de continuar." o "Registro dado de baja; no admite cobro desde esta pantalla.", ese expediente no se puede cobrar.
4. Toque la cabecera de la tarjeta para abrirla.
5. Revise **"Procedencia TAG"**: dira "Propio" cuando el usuario aporta su propio TAG y "Escuela" cuando lo pone el instituto. Si ya existe una reserva, vera ademas el apartado "TAG apartado" con su numero.
6. Capture **"Monto en efectivo"** y **"Cobrado por"**, y pulse **"Registrar pago de $…"**.
7. Confirme en la ventana **"Registrar pago"** siguiendo los pasos 10 a 12 de la seccion 3.

> **Advertencia. El TAG propio tambien se cobra.** El sistema no distingue la procedencia al momento de cobrar: un expediente con "Procedencia TAG: Propio" aparece en la cola igual que cualquier otro y usa el mismo formulario. **No existen descuentos, exenciones ni precio diferenciado.**

> **Nota sobre el monto.** El 100 prellenado es unicamente una comodidad de captura escrita en la pantalla, **no una tarifa configurable**. Si la cuota autorizada cambia, el nuevo importe se captura a mano en cada cobro.

> **Recuerde.** Administracion cobra; TI instala. La propia pantalla lo advierte: "El estacionamiento y el TAG los asigna TI después de confirmar este pago.".

---

## 5. Consultar los pagos ya registrados de un expediente

1. En la pestaña **"Administración"**, abra la tarjeta del expediente desde el **"Padrón completo (N)"**. El historial no se muestra en la cola "Registrar pago".
2. Debajo del detalle aparece el apartado **"Pagos registrados"**, con un renglon por cobro: el importe en negritas y, despues, la fecha, quien cobro y el folio del recibo, separados por "·".
3. Si algun dato no quedo registrado, se lee "Fecha no disponible" o "Sin responsable".
4. En lugar del formulario aparece el aviso "✓ Pago registrado. El expediente ya no está en la cola de cobro.".

**Resultado:** consulta el folio de recibo, el importe, la fecha y el responsable de cada cobro. Es informacion **de solo lectura**: no hay boton para editar ni para cancelar el pago.

---

## 6. Leer los indicadores de la pestaña "Finanzas"

La pestaña **"Finanzas"** solo esta disponible para el rol Administración (y para el rol de soporte). TI y Consulta no la ven.

1. Pulse la pestaña **"Finanzas"**. Mientras carga se lee "Cargando la caja…".
2. Lea **"En caja ahora"**: es el efectivo que el sistema espera que usted tenga **fisicamente**, es decir la suma de todos los cobros que aun no han sido cortados. Debajo indica de cuantos cobros se compone, por ejemplo "3 cobro(s)".
3. Observe el color de ese indicador:

   | Color de "En caja ahora" | Significado |
   |---|---|
   | Verde | La caja tiene cobros de un solo dia, o esta vacia. |
   | Ambar | Hay 2 dias de cobro distintos sin cortar. |
   | Rojo | Hay 3 dias de cobro distintos o mas sin cortar. |

   El criterio son **dias con cobro**, no dias transcurridos: si no hubo cobros el lunes, ese dia no cuenta.
4. Cuando hay mas de un dia, el subtitulo agrega "· 2 días sin cortar" y aparece una tabla con las columnas "Día de cobro", "Cobros" y "Subtotal", junto al aviso: "Esta caja mezcla cobros de 2 días. Cuente solo el efectivo que aún tiene físicamente y explique en observaciones si ya entregó dinero de días anteriores.".
5. Lea **"Vendido este mes"**: total cobrado en el mes calendario en curso (hora de Queretaro), este o no cortado.
6. Lea **"Vendido histórico"**: total cobrado desde el inicio de la operacion.

> **Advertencia.** "Vendido este mes" y "Vendido histórico" **no se reinician con el corte**: siguen acumulando. El unico indicador que el corte pone en cero es "En caja ahora".

Si la caja no tiene nada pendiente, se lee "✓ La caja está en ceros. No hay cobros pendientes de cortar.".

---

## 7. Ver el detalle de los cobros que estan en la caja

Es la forma de cuadrar **antes** de cerrar el corte.

1. En **"Finanzas"**, dentro del panel **"Caja actual"**, pulse el enlace **"▸ Ver los N cobro(s) en caja"**.
2. Espere a que cargue; mientras tanto se lee "Cargando cobros…".
3. Revise la tabla, con las columnas "Fecha", "Recibo", "Expediente", "Monto" y "Cobrado por". La columna "Expediente" muestra el folio del expediente y, despues de un "·", el nombre del titular.
4. Para cerrar el detalle, pulse **"▾ Ocultar los N cobro(s) en caja"**.

**Resultado:** ve, recibo por recibo, de que se compone el efectivo que va a contar. Si en lugar de la tabla se lee "Sin cobros en este periodo." mientras "En caja ahora" muestra un importe, el detalle no se pudo leer: cierre el renglon con "▾ Ocultar los N cobro(s) en caja" y vuelva a abrirlo antes de contar.

---

## 8. Hacer el corte de caja

> **ADVERTENCIA. Este procedimiento es irreversible.** Al confirmar, el corte queda cerrado en definitiva: no se puede reabrir, corregir ni borrar. Lea con calma cada paso y no lo ejecute con prisa ni con el publico en ventanilla.

1. **Cuente fisicamente el efectivo antes de tocar la pantalla.**
2. Entre a la pestaña **"Finanzas"** y ubique el panel **"Caja actual"**.
   - Si se lee "✓ La caja está en ceros. No hay cobros pendientes de cortar.", no hay nada que cortar y el formulario ni siquiera aparece.
3. Compare su conteo con el detalle: pulse "▸ Ver los N cobro(s) en caja" si necesita revisar recibo por recibo (seccion 7).
4. Escriba lo que conto en el campo **"Efectivo contado"** (sugiere "0.00").
   - Si captura algo que no sea un numero mayor o igual a cero, aparece "Capture un monto mayor o igual a cero." y el boton permanece apagado.
5. En cuanto el importe es valido, el sistema muestra el renglon de conciliacion: "Esperado: $X · Diferencia: cuadra exacto", o bien "sobrante $50.00" o "faltante $50.00". **Cuando no cuadra, ese renglon se muestra en rojo.**
6. Escriba las **"Observaciones"** cuando corresponda. La etiqueta cambia sola:
   - **"Observaciones (obligatorias)"** en cuanto captura un "Efectivo contado" valido y hay diferencia (sobrante o faltante) **o** el corte abarca mas de un dia de cobro. Mientras "Efectivo contado" siga vacio, la etiqueta dice "(opcional)" aunque el corte vaya a exigir explicacion.
   - **"Observaciones (opcional)"** en los demas casos.
   - El campo sugiere "Explique la diferencia o el efectivo ya entregado…" cuando las observaciones son obligatorias, y "Notas del corte (opcional)" cuando no lo son. Escriba una explicacion util para quien audite despues: que paso, cuanto y por que.
7. Verifique el aviso "Este corte quedará registrado a su nombre: …". Ese nombre proviene de su sesion y **no se puede editar** en esta pantalla.
8. Pulse el boton rojo, que muestra el total esperado: **"Cerrar corte de $300.00"**. Mientras no capture el efectivo, dice "Cerrar corte de caja" y esta deshabilitado.
9. Se abre la ventana **"Cerrar corte de caja"**. **Leala completa**: indica cuantos cobros incluye y por cuanto se cerrara, cuanto conto usted, si hay "SOBRANTE de $50.00", "FALTANTE de $50.00" o si "el efectivo cuadra exacto", y advierte que "La caja quedará en cero y este corte NO se podrá modificar después. ¿Continuar?".
10. Pulse **"Cerrar corte"** solo si esta seguro. **"Cancelar"** vuelve sin cerrar nada.
11. Lea el aviso verde con el folio del corte, por ejemplo "Corte SATAG-CORTE-2026-000003 cerrado · $300.00 en 3 cobro(s) · cuadró exacto."; cuando no cuadra, el final del aviso cambia a "· diferencia -$50.00" en lugar de "· cuadró exacto". Los campos "Efectivo contado" y "Observaciones" se vacian y la caja vuelve a cero.

**Resultado:** se genera un corte con folio propio (formato SATAG-CORTE-AAAA-000001) que congela los cobros incluidos y deja constancia de lo esperado, lo contado, la diferencia y sus observaciones, a nombre de quien lo cerro. "En caja ahora" vuelve a $0.00 y el corte aparece al principio del "Historial de cortes".

### 8.1. Si el corte no se deja cerrar

| Lo que ve | Que significa |
|---|---|
| "Capture un monto mayor o igual a cero." | El campo "Efectivo contado" tiene algo escrito que no es un numero valido. Si queda **vacio** no aparece mensaje: el boton permanece apagado y dice "Cerrar corte de caja". |
| "El efectivo no cuadra: explique la diferencia antes de cerrar." | Hay sobrante o faltante y las observaciones son obligatorias. |
| "El corte abarca varios días: explíquelo antes de cerrar." | La caja mezcla cobros de mas de un dia; debe explicarlo aunque el efectivo cuadre exacto. |
| "No se pudo cerrar el corte." | La operacion no se ejecuto. Es el aviso de ultimo recurso: cuando el sistema si identifica el motivo, la pantalla lo muestra en rojo con su texto concreto (por ejemplo "No hay cobros pendientes de cortar: la caja esta en ceros" o "Explique la diferencia de $50.00 antes de cerrar el corte"). |

> **Importante.** Si el corte falla por cualquiera de estas razones, **el efectivo no se corto y no se genero ningun folio**. Corrija lo que indique el mensaje y vuelva a intentarlo.

### 8.2. Advertencias del corte

- **Si se equivoca al teclear el efectivo contado y confirma, ese valor queda para siempre.** La correccion se documenta escribiendola en las "Observaciones" del corte **siguiente**; nunca se corrige el corte anterior.
- **Cerrar el corte y reestablecer la caja son el mismo acto.** Al confirmar, "En caja ahora" vuelve a $0.00. No existe fondo de cambio ni saldo inicial.
- **El corte no se define por fechas, sino por lo que este sin cortar en ese momento.** Si se registra un cobro justo mientras usted cierra, o entra completo al corte o queda para el siguiente, pero nunca se cuenta a medias.
- **No deje pasar los dias.** El indicador se pone ambar a los 2 dias y rojo a los 3 o mas. Un corte que mezcla varios dias suele arrastrar efectivo ya entregado y es el origen tipico de los faltantes falsos: por eso el sistema exige explicarlo por escrito.
- **No corten dos personas al mismo tiempo.** El sistema impide que se cierren dos cortes por un doble toque; si dos personas cortan a la vez, el segundo intento falla con "No hay cobros pendientes de cortar: la caja esta en ceros" y no se crea ningun corte vacio. Acuerden internamente quien corta.

---

## 9. Consultar el historial de cortes y el detalle de un corte

1. En **"Finanzas"**, baje al panel **"Historial de cortes (N)"**. Los cortes se listan del mas reciente al mas antiguo. Si no hay ninguno, se lee "Aún no se ha hecho ningún corte de caja.".
2. Lea las columnas: "Folio", "Fecha", "Esperado", "Contado", "Diferencia", "Cobros", "Por" y "Observaciones".
   - En "Diferencia", un guion **"—"** significa que cuadro exacto; un valor con "+" es sobrante y uno con "−" es faltante.
3. Pulse cualquier parte del renglon para desplegar los cobros de ese corte; el triangulo del folio cambia de "▸" a "▾".
4. Revise la tabla de cobros de ese corte: "Fecha", "Recibo", "Expediente", "Monto" y "Cobrado por".
5. Vuelva a pulsar el renglon para cerrarlo. Solo puede haber un renglon desplegado a la vez.

**Resultado:** puede auditar cualquier corte pasado y ver exactamente que recibos lo integraron. Es **solo consulta**: pulsar un renglon unicamente despliega su detalle; no existe ninguna accion sobre los cortes.

---

## 10. Que hacer cuando la informacion no carga

1. Si en "Administración" aparece el aviso rojo "No se pudieron cargar los registros.", pulse el enlace **"Reintentar"** que lo acompaña.
2. Si en "Finanzas" aparece "No se pudo cargar la caja.", pulse **"Reintentar"**.
3. Si el mensaje dice "Sin conexion con el servidor. Revise su red e intente de nuevo.", verifique su conexion antes de reintentar.
4. Si dice "La sesion expiro. Cierre sesion y vuelva a entrar.", pulse "Salir" y vuelva a iniciar sesion con su segundo factor.
5. Si dice "Su usuario no tiene permiso para esta accion. Verifique su rol con el administrador.", su cuenta no tiene el rol necesario: solicitelo al Departamento de TI.

> **Tranquilidad.** Reintentar **nunca** repite un cobro ni un corte ya ejecutado. Los avisos "Cargando registros…", "Cargando la caja…", "Cargando cobros…", "Verificando sesion…" y "Preparando la verificación…" solo indican que el sistema esta trabajando: espere unos segundos.

---

## 11. Guia rapida de mensajes

| Mensaje | Que ocurrio |
|---|---|
| "Pago de $100.00 registrado · recibo SATAG-2026-000045 (SATAG-000123)." | El cobro se registro correctamente. Anote el folio del recibo. |
| "No se pudo registrar el pago." | El cobro **no** se registro. Corrija e intente de nuevo. |
| "El monto debe ser mayor a cero" | El importe capturado no es valido. |
| "El registro ya tiene el pago SATAG-2026-000045 registrado" | Ese expediente ya fue cobrado; solo admite un pago. |
| "El registro esta dado de baja" | No se puede cobrar un expediente dado de baja. |
| "Registro no encontrado" | El expediente ya no existe. Verifique con TI. |
| "Tu usuario no tiene el rol requerido (admin)" | Su cuenta no tiene el rol de Administracion. |
| "Se requiere sesion con segundo factor (MFA)" | Debe completar la verificacion en dos pasos. |
| "Corte SATAG-CORTE-2026-000003 cerrado · $300.00 en 3 cobro(s) · cuadró exacto." | El corte quedo cerrado en definitiva. |
| "No hay cobros pendientes de cortar: la caja esta en ceros" | No habia nada que cortar (o alguien mas ya corto). |
| "El efectivo contado debe ser mayor o igual a cero" | El importe contado no es valido. |
| "Explique la diferencia de $50.00 antes de cerrar el corte" | Faltan las observaciones obligatorias por diferencia. |
| "Este corte abarca cobros de 3 dias: explique en observaciones si ya entrego efectivo de dias anteriores" | Faltan las observaciones obligatorias por varios dias. |
| "Un corte de caja cerrado no se puede modificar ni borrar (folio SATAG-CORTE-2026-000003)" | Se intento alterar un corte cerrado. No es posible. |

---

## 12. Nota sobre lo que este modulo no hace

Para evitar expectativas equivocadas, conviene decirlo con claridad. **Hoy el sistema no incluye** ninguna de estas funciones; si el instituto requiere alguna, el tramite se atiende de forma directa con el area correspondiente (Direccion Administrativa para el criterio contable, Departamento de TI para lo tecnico):

- Impresion, descarga o envio por correo del recibo o de cualquier comprobante. El folio del recibo se consulta unicamente en pantalla: en el aviso verde del cobro, en el apartado "Pagos registrados" y en la columna "Recibo" de Finanzas.
- Exportacion a Excel, CSV o PDF del padron, de los cobros en caja, del historial de cortes o del detalle de un corte, ni reporte de corte imprimible.
- Editar, cancelar, anular o reembolsar un pago ya registrado, ni reabrir o corregir un corte cerrado.
- Pagos parciales, abonos o un segundo pago sobre el mismo expediente.
- Metodos de pago distintos del efectivo: no hay tarjeta, transferencia ni terminal, ni selector de metodo.
- Fondo de caja o saldo inicial, ni desglose por denominaciones al contar (solo se captura un total en "Efectivo contado").
- Corte parcial, corte por rango de fechas, corte automatico al final del dia, ni alertas o correos que recuerden cortar. La unica señal es el color del indicador "En caja ahora".
- Reportes por cajero, graficas o tableros: solo existen los tres indicadores "En caja ahora", "Vendido este mes" y "Vendido histórico".
- Buscadores, filtros o paginacion en "Finanzas".
- Alta de expedientes desde Administracion: el alta la realiza el propio usuario en el formulario publico.
- Instalar o cambiar el TAG, asignar estacionamiento, dar de baja o actualizar datos del vehiculo: esas tareas corresponden al Departamento de TI. La bitacora de movimientos del expediente se consulta en la pestaña "Consulta".

---

## 13. Preguntas frecuentes

**1. Ya cerre el corte y me di cuenta de que teclee mal el efectivo contado. ¿Como lo corrijo?**
No se corrige. El corte cerrado es definitivo y el sistema impide modificarlo incluso al personal tecnico. Lo que procede es dejar constancia por escrito en las **"Observaciones"** del **corte siguiente**, explicando el error y el importe real. Informe ademas a su jefatura el mismo dia.

**2. Cobre un expediente equivocado o capture mal el monto. ¿Puedo cancelar el pago?**
No. No existe boton para editar, cancelar ni reembolsar un pago, y cada expediente admite un unico pago. Reporte el caso a su jefatura y al Departamento de TI de inmediato, y describalo en las observaciones del corte donde quede incluido ese cobro.

**3. El usuario trae su propio TAG. ¿Se le cobra igual?**
Si. El sistema no distingue la procedencia al cobrar: un expediente con "Procedencia TAG: Propio" aparece en la cola "Registrar pago" igual que cualquier otro y usa el mismo formulario. No existen descuentos ni exenciones en la pantalla.

**4. Cerre el corte y "Vendido este mes" no bajo. ¿Esta mal el sistema?**
No. El corte solo pone en cero **"En caja ahora"**. "Vendido este mes" y "Vendido histórico" son acumulados de venta y siguen sumando: sirven para saber cuanto se ha cobrado, no cuanto efectivo hay en la gaveta.

**5. ¿Tengo que cortar todos los dias?**
El sistema no corta solo ni envia recordatorios: el corte es siempre manual. La unica señal es el color de "En caja ahora", que se pone ambar con 2 dias de cobro sin cortar y rojo con 3 o mas. Se recomienda cortar diario: un corte que mezcla varios dias exige explicacion por escrito y es la causa mas frecuente de faltantes aparentes.

**6. El usuario me pide su recibo impreso o por correo. ¿Que le doy?**
El sistema no imprime ni envia comprobantes. Lo que existe es el **folio del recibo** que genera automaticamente el sistema (formato SATAG-AAAA-000001), visible en el aviso de exito y en el apartado "Pagos registrados" del expediente. Proporcione ese folio y, si el usuario requiere un comprobante formal, canalice la solicitud a la Direccion Administrativa. No confunda el folio del recibo con el folio del expediente, que tiene el formato SATAG-###### y no lleva año.
