# Bitácora de Ejecución de Pruebas — SATAG

> Registro de evidencia de la actividad **WBS 1.8**. Se llena **durante** la ejecución, un renglón por
> caso de la [matriz](01%20-%20Matriz%20de%20Casos.md). Es el entregable que respalda el acta de cierre.

| | |
|---|---|
| **Versión probada** | `dc37b54` — árbol de trabajo limpio |
| **Entorno** | Proyecto Supabase de desarrollo/QA |
| **Ejecutó** | Gerardo Sánchez — Soporte TI Jr. |
| **Atestiguó** | *(auditor, cuando aplique)* |

**Resultado:** ✅ Aprobado · ❌ Fallido · ⚠️ Aprobado con observación · ⏭️ No ejecutado

---

## Preparación

| Verificación | Fecha | Resultado | Nota |
|---|---|---|---|
| Banco de QA aplicado (`seed_tests_dev.sql`) | | | |
| Cuentas por rol con MFA inscrito | | | |
| `npx tsc --noEmit` en verde | 31-jul-2026 | ✅ | Sin errores de tipos. |
| `npm run build` en verde | 31-jul-2026 | ✅ | Compila en 1.6 s; las 10 rutas se generan como estáticas (`output: "export"`). |

### Expediente de referencia del 03-ago — `SATAG-000303`

Alta **limpia** por `/registro/`, de **menor de edad con gestionante** y **TAG propio**. Es el primer
expediente del sistema con firma **capturada**, no sembrada, y por eso es el que habilita **E-06,
E-07 y E-08**, que no se pueden probar con los 55 folios del banco de QA.

Se comprobó durante el recorrido que el aviso y el reglamento cargaron con texto real y versión
`v2` antes de aceptar, así que **no** reproduce D-01. El expediente de D-01 sigue siendo el `302`,
que se conserva aparte como evidencia del defecto.

> **Procedencia de la firma, para el acta.** El recorrido se ejecutó con un arnés automatizado
> (Playwright sobre Chromium) que opera la interfaz publicada como lo haría una persona: los trazos
> son eventos de puntero reales, con sus coordenadas y tiempos. **No es la firma de una persona
> física**, y no debe presentarse como tal. Sirve para probar el mecanismo —que la evidencia se
> conserva, se ve en el panel y su URL caduca—, no para acreditar el consentimiento de nadie. Los
> casos de usabilidad (tanda U) siguen exigiendo personal real.

## Tanda P · Privacidad, RLS, RPC y Storage

| Caso | Fecha | Resultado | Evidencia / observación |
|---|---|---|---|
| P-01 | 03-ago-2026 | ✅ | `select * from registros` con la clave anónima devuelve `HTTP 200` y **0 filas**. La RLS no filtra ni un registro: no hay PII al alcance de una sesión anónima. |
| P-02 | 03-ago-2026 | ✅ | Igual sobre las cuatro tablas sensibles: `aceptaciones`, `pagos`, `movimientos` y `solicitudes` devuelven `HTTP 200` y **0 filas** cada una. Ninguna expone lectura a `anon`. |
| P-03 | | | |
| P-04 | | | |
| P-05 | | | |
| P-06 | | | |
| P-07 | | | |
| P-08 | | | |
| P-09 | | | *(comprueba el bloque 43, aplicado 28-jul)* **Contraprueba hecha el 03-ago:** la lectura pública **no** se rompió — `cat_marcas`, `cat_colores`, `reglamento_versiones` y `aviso_versiones` siguen devolviendo filas a la clave anónima, así que el formulario público carga. Falta la mitad de escritura, que exige los roles del panel. |
| P-10 | | | *(comprueba el bloque 43, aplicado 28-jul)* **Primera mitad cerrada el 03-ago:** el PNG de `SATAG-000303` no es accesible por URL pública directa (`HTTP 400`) ni descargándolo con la clave anónima (`HTTP 400`). El bucket es privado de verdad. Falta la mitad de escritura por rol. |
| P-11 | | | *(riesgo aceptado: sin rate limiting)* **No ejecutado todavía a propósito:** es el único caso de la tanda que escribe, y deja 20 notas en la cola del buzón que estorban a F-27 y F-28. Se corre cuando toque limpiarlas en el mismo momento. |
| P-12 | 03-ago-2026 | ✅ | Con folio real (`SATAG-000101`) y placas equivocadas, el buzón responde `HTTP 400` con un único mensaje —«Los datos no coinciden con ningún registro vigente»— y **no** revela nombre, vehículo, placas, estado ni tipo de usuario. Comprobado además que un folio **inexistente** da exactamente el mismo mensaje: el buzón no permite distinguir «el folio existe pero la placa está mal» de «el folio no existe», que es lo que impediría usarlo para tantear folios ajenos. |
| P-13 | | | *(bloque 48: `consulta` lee la firma pero no escribe nada)* |
| P-14 | | | *(vistas `security_invoker`, bloques 45 y 47)* |

## Tanda E · Evidencia de firma

| Caso | Fecha | Resultado | Evidencia / observación |
|---|---|---|---|
| E-01 | 03-ago-2026 | ✅ | `SATAG-000303` tiene **exactamente una** aceptación (`registro_id` es `unique`), con la ruta `firmas/5b81d559-551d-4695-98d3-c715d22045e8.png` en el bucket privado. |
| E-02 | 03-ago-2026 | ✅ | **Las dos mitades.** El hash del paquete se recalcula solo en la base y cuadra: `hash_documento = encode(digest(convert_to(hash_payload::text,'UTF8'),'sha256'),'hex')` devuelve `true`. Y el PNG descargado por URL firmada (15 113 bytes, `image/png`) recalcula `7ce99a7013e329a4c37d2f6d4eaf872bcb05cf566b2788a1b09c6709ea87ff88`, **idéntico** al `firma_imagen_sha256` almacenado. |
| E-03 | 03-ago-2026 | ✅ | Sobre `SATAG-000303`. El panel muestra «Reglamento aceptado: **Versión 2**» y «Aviso de privacidad aceptado: **Versión 2**», que son las vigentes. Coincide con lo que se vio al firmar: 22 cláusulas y etiqueta «(v2)». |
| E-04 | 03-ago-2026 | ✅ | Sello de tiempo conservado y legible en el panel: «3 de agosto de 2026 a las 12:35:39 p.m.», hora real del envío. |
| E-05 | 03-ago-2026 | ✅ | El panel declara «Trazos vectoriales: **Conservados junto con la imagen**», además del PNG. Confirmado en base: `firma_trazos` no es nulo y `strokes` trae **1** trazo continuo con sus puntos `{x,y,t,p}`, que es la forma del trazo capturado. |
| E-06 | 03-ago-2026 | ✅ | Sobre el alta de menor. El panel muestra «Firmó: **María Fernanda Solís Cárdenas (la madre)**» — el gestionante, no el menor— y en el expediente «Gestionante (paga y firma)» con el mismo nombre. La segunda mitad también queda: la restricción `reg_menor_requiere_gestionante` existe y dice exactamente lo que debe — `usuario_es_menor = false` **o** gestionante con nombres y apellido paterno no vacíos **y** `gestionante_relacion in ('padre','madre','tutor')`. Es decir, la base **no deja** guardar un menor sin representante, ni con un representante de relación «otro». |
| E-07 | 03-ago-2026 | ✅ | *(SC-008, bloque 47)* Con rol `super`, sobre `SATAG-000303`: se muestran **las seis cosas** que pide el caso — la imagen de la firma, quién firmó y en qué calidad, la versión del reglamento, la del aviso, el sello de tiempo y el hash. De hecho muestra dos hashes: el del paquete firmado (`7716ea349d57…5d8599c7`) y el de la imagen (`7ce99a7013e3…ea87ff88`). Es el primer expediente donde la imagen **sí** aparece: los 55 del banco de QA no la tienen porque el seed no escribe en Storage (E-11). |
| E-08 | 03-ago-2026 | ⚠️ | **Aprobado con observación sobre la redacción del caso.** La URL firmada caduca: recién emitida devuelve `HTTP 200` y **pasados 70 segundos devuelve `HTTP 400`**. «Volver a abrirla» emite una URL distinta, que sirve. El panel lo dice en pantalla: «El enlace de la imagen caduca a los 60 segundos». **Pero la otra mitad del esperado está mal escrita:** el caso pide abrir el enlace «en una ventana sin sesión» y dice que «deja de servir en ambos casos». No es así, y no debe serlo: una URL firmada **autoriza por el token, no por la sesión**, así que dentro del minuto abre correctamente sin sesión —se comprobó, `HTTP 200` desde un contexto limpio—. Lo que protege la imagen es la caducidad de 60 segundos, no la sesión. Quien ejecute el caso tal como está escrito hoy lo reprobará por un motivo equivocado. **Corregir el esperado de E-08 en la matriz.** |
| E-09 | 03-ago-2026 | ✅ | Interceptada la respuesta de red al pedir la evidencia: el panel consulta **únicamente** `v_evidencia_firma` y recibe **501 bytes**. No viaja `hash_payload`, ni `firma_trazos`, ni `ip_origen`, ni `user_agent`. Sí viajan los campos probatorios (`hash_documento`, `sello_tiempo`, `firmante_nombre`, `tiene_trazos`). La vista deja fuera lo que el panel no necesita, tal como se diseñó. |
| E-10 | | | *(bloque 48; anotar el riesgo aceptado, no como fallo. **Único caso E pendiente**: exige abrir el mismo expediente con `admin`, `ti`, `consulta` y `super`; hoy sólo se ejecutó con `super`)* |
| E-11 | 03-ago-2026 | ✅ | Sobre folios sembrados. `SATAG-000101` muestra firmante, versiones, sello y hash **y además la imagen**: `qa-firma-demo.png` ya está en el bucket, así que la salvedad del caso —«que no cargue la imagen no es fallo»— ni siquiera hizo falta. `SATAG-000225` muestra el estado vacío correcto: «Este expediente no tiene evidencia de firma registrada. Los expedientes dados de alta por el formulario siempre la tienen; si falta, el registro se capturó por otra vía.» |

## Tanda F · Funcional

| Caso | Fecha | Resultado | Evidencia / observación |
|---|---|---|---|
| F-01 | | | |
| F-02 | 03-ago-2026 | ⚠️ | **Cerrado con observación.** La mitad del reglamento, que faltaba, quedó verificada el 03-ago: la casilla llega **deshabilitada**, el recuadro trae **22 cláusulas** y la etiqueta dice «(v2)»; al desplazarse al final la casilla se habilita. Igual en el aviso. Observación de redacción del caso: el esperado dice "el botón permanece deshabilitado", pero lo que se deshabilita es **la casilla** (`registro/page.tsx:454`, `disabled={!avisoLeido}`), y el botón muestra "Debe aceptar el aviso de privacidad para continuar". El propósito —no se puede aceptar sin llegar al final— se cumple. |
| F-03 | 31-jul-2026 | ✅ | La casilla llega **desmarcada y deshabilitada**; se habilita al desplazarse al final (tolerancia de 8 px, `alFinal`). El aviso que dice "Desplácese hasta el final para poder aceptar" desaparece al cumplirse. Es obligatoria: sin ella `validarPaso` bloquea el avance (`:159`). |
| F-04 | 03-ago-2026 | | **Parcial: la parte de pantalla queda cerrada.** Con «menor de edad» marcado, el desplegable trae exactamente `["Seleccione…","Padre","Madre","Tutor"]` — **sin «Otro»**; la casilla de gestionante llega **marcada y deshabilitada** (no se puede desmarcar); «Tipo de usuario» queda en `alumno` y bloqueado. Verificado por recorrido automatizado en escritorio (1280) y celular (390). **Falta** la tercera pata del esperado —que la firma sea del gestionante—, que se comprueba con el alta real junto con E-06. |
| F-05 | 31-jul-2026 | ✅ | Seat → Arona, Ateca, Ibiza, Leon, Tarraco, Toledo, Otro: los modelos corresponden a la marca. Marca «Otro» abre captura libre de marca y de modelo. La rama modelo = «Otro» se verificó en el código, no en pantalla. Observación menor: «Leon» debería llevar acento en el catálogo. |
| F-06 | 03-ago-2026 | ✅ | Con el paso vacío salen **los cuatro** mensajes, uno por campo: «Seleccione o escriba la marca.», «…el modelo.», «…el color.» y «Capture las placas o marque «sin placas».». Con placa mal formada (`AB1`) sale «Formato de placa no válido (5–8 letras o números).». En ambos casos el asistente **no avanza** y nada se guarda: el envío ni siquiera se intenta, la validación es previa (`validarPaso`). Verificado en escritorio y celular. |
| F-07 | 03-ago-2026 | | **Parcial.** El chip «Ya tengo TAG propio» activa y muestra el aviso "El registro y la activación de un TAG propio tienen el mismo costo ($100); llévelo el día de la instalación", que es la prueba en pantalla del acuerdo de CC-01. **Falta** el segundo registro con TAG de la escuela para comparar ambas procedencias en la base. |
| F-08 | | | |
| F-09 | | | *(B5 ya conectado: ver F-29…F-33)* |
| F-10 | | | |
| F-11 | | | |
| F-12 | | | |
| F-13 | | | |
| F-14 | | | |
| F-15 | | | |
| F-16 | | | |
| F-17 | | | |
| F-18 | | | |
| F-19 | | | |
| F-20 | | | |
| F-21 | | | |
| F-22 | | | |
| F-23 | | | |
| F-24 | | | |
| F-25 | | | |
| F-26 | | | |
| F-27 | | | |
| F-28 | | | |
| F-29 | | | *(CC-05, bloque 46)* |
| F-30 | | | |
| F-31 | | | *(desde el SQL Editor)* |
| F-32 | | | |
| F-33 | | | |
| F-34 | | | *(CC-02, bloque 45 · folios `…221`…`…226`)* |
| F-35 | | | |
| F-36 | | | |
| F-37 | | | |
| F-38 | | | |
| F-39 | 31-jul-2026 | ✅ | Las tres patas. **Plegado:** se ven responsable, finalidades y el enlace al integral. **Desplegado:** aparecen los otros dos párrafos, el botón cambia a «Ocultar el aviso» y el enlace al integral no se pliega. **Paso 3:** no hay ningún enlace a la página pública; el texto íntegro está ahí mismo. Observación de usabilidad: «Leer el aviso completo» sólo se subraya en `:hover` y en celular no hay hover, así que no se lee como pulsable. |

## Tanda A · ARCO y ciclo de vida

| Caso | Fecha | Resultado | Evidencia / observación |
|---|---|---|---|
| A-01 | | | |
| A-02 | | | |
| A-03 | | | |
| A-04 | | | |
| A-05 | | | |
| A-06 | | | |
| A-07 | | | *(se espera hallazgo → SC-007)* |
| A-08 | | | |

## Tanda U · Usabilidad

| Caso | Fecha | Participante (rol, no nombre completo) | Resultado | Observación |
|---|---|---|---|---|
| U-01 | | | | |
| U-02 | | | | |
| U-03 | | | | |
| U-04 | | | | |
| U-05 | | | | |

---

## Defectos encontrados

| # | Caso origen | Descripción | Severidad | Estado | Corregido en |
|---|---|---|---|---|---|
| D-01 | F-02 / F-03 | **La puerta del consentimiento se abre sola si el aviso no carga.** Las cinco cargas iniciales no tienen `.catch` (`registro/page.tsx:71-77`); si `getAvisoVigente()` falla, `aviso` queda en `null` y el recuadro pinta un solo párrafo, «Cargando…» (`:443`). Ese párrafo cabe en los `max-height: 220px` de `.reglamento` (`globals.css:154`), así que se cumple `scrollHeight <= clientHeight + 8` y el efecto ejecuta `setAvisoLeido(true)` (`:93`). La casilla se habilita y el alta viaja con `aceptaPrivacidad: true`, `avisoLeido: true` y `avisoVersion: null`. Queda constancia en `aceptaciones` de que la persona leyó y aceptó un aviso vacío. El efecto sólo pone la bandera en `true`, nunca en `false`, así que si el texto llega tarde la puerta ya se abrió. Lo mismo con el reglamento en `:97`. **Reproducido el 31-jul** bloqueando `aviso_versiones` y `reglamento_versiones` desde el panel Request conditions: el recuadro mostró «Cargando…» y el aviso «Desplácese hasta el final para poder aceptar» desapareció, lo que confirma `avisoLeido = true`. Afecta **a los dos documentos**: el paso 4 mostró «1. Cargando…» con la casilla habilitada y la etiqueta «…reglamento de acceso vehicular **(v—)**» (`:478`, versión vacía). **Se completó el alta en ese estado y quedó el folio `SATAG-000302`.** Agravante descubierto al revisarlo: cuando el cliente no manda las versiones, `crear_registro` **las resuelve él mismo del lado del servidor** (`19_rpc_crear_registro.sql:81-89` y `:100-108`), escribe `acepto_privacidad` en duro como `true` (`:256`) y calcula el hash sobre el texto completo de la v2 (`:220-226`). Es decir: `aceptaciones` afirma que la persona leyó y aceptó reglamento v2 y aviso v2, con hash válido y sello de tiempo real, **cuando en pantalla no cargó ni un carácter de ninguno de los dos**. E-02 y E-03 aprobarían ese registro: el hash cuadra y las versiones son las vigentes. **Sí queda rastro, pero nadie lo mira:** `metadata->'consentimiento'` conserva lo que reportó el cliente, y ahí `avisoVersion` y `reglamentoVersion` valen `null`, en contradicción con las claves foráneas que apuntan a la v2. Esa contradicción sirve como control de auditoría, siempre que se filtre por `jsonb_exists(metadata,'consentimiento')`: los 55 folios del banco de QA se insertan directo en la tabla y no traen esa clave (`seed_tests_dev.sql:386`), así que sin el filtro salen como falsos positivos. Verificado el 31-jul: **el único expediente afectado es `SATAG-000302`**. | **Crítica** | Abierto | |
| D-04 | F-39 / A-07 | **El aviso simplificado del paso 1 desaparece por completo y en silencio si no carga.** Todo el recuadro es condicional (`registro/page.tsx:244`) y `getAvisoSimplificado` devuelve `null` sin avisar (`api.ts:97`). Reproducido el 31-jul: el paso 1 quedó sin ningún rastro del aviso, sin hueco ni mensaje. Es el mínimo del art. 16 fr. II —informar al recabar— cayéndose sin que nadie se entere; el bloque 44 se aplicó justo para cubrirlo (SC-007/CC-09). | Mayor | Abierto | |
| D-05 | F-08 | El área que instala el TAG se llama de dos maneras en el mismo flujo: la portada dice «**Sistemas** lo instala» (`page.tsx:22`) y el comprobante del paso 6 dice «**TI** instalará y activará su TAG». El Manual del Usuario usa «Sistemas» 21 veces y reserva «TI» para lo interno, así que el comprobante es el que se sale. En el mismo renglón del comprobante, «preséntese en **administración**» va en minúscula. **Ampliado el 03-ago** con tres casos más, todos de cara a alguien de fuera: el buzón público dice «Sistemas **(TI)** del IAQ» (`solicitudes/page.tsx:139`), único punto de esa página que expone la sigla interna —las otras cuatro menciones dicen «Sistemas» a secas—; la pantalla de acceso al panel, a la que se llega por URL pública, dice «Acceso para personal de **administración** y **TI** del IAQ» (`admin/page.tsx:177`), con los dos errores juntos; y la confirmación de cobro dice «El estacionamiento y el TAG los asigna **TI** después de confirmar este pago» (`VistaAdmin.tsx:290`), que es la frase que la cajera lee en voz alta a la familia. Dentro del panel «TI» es correcto y se queda: lo que hay que corregir es donde el texto sale a un lector externo. | Menor | Abierto | |
| D-08 | F-18 / F-14 | **En Finanzas, un detalle de corte que no carga se pinta como un corte sin movimientos.** El `catch` de `toggleDetalle` (`VistaFinanzas.tsx:137`) guarda una lista vacía cuando `listPagosDeCorte` falla, y `DetalleCobros` la renderiza con el texto «Sin cobros en este periodo» (`:42`). No hay forma visible de distinguir «este corte no tuvo cobros» de «la consulta se cayó». El comentario de `:135-136` lo llama «degradación suave», pero es la pantalla del dinero: quien concilia puede dar por bueno un corte vacío y firmar un faltante que no existe. Mismo patrón que D-04, sobre el módulo contable. **Detectado por revisión de código el 03-ago; pendiente de reproducir** bloqueando la consulta desde el navegador. | **Mayor** | Abierto | |
| D-09 | F-19 | **Si el catálogo de estacionamientos no carga, la pantalla de TI se inventa dos claves.** `VistaTi.tsx:145` hace `.catch(() => setEstacionamientos(["E1", "E2"]))`: ante un fallo de red, TI ve dos chips que parecen el catálogo real y no hay aviso de que sean un respaldo. Si asigna con ellos, o el RPC rechaza la clave inexistente —con un error que no explica la causa— o acierta por casualidad y deja fuera los cajones que sí existían. Es un estado inválido con apariencia de válido, en el acto que F-19 declara «una sola transacción». **Detectado por revisión de código el 03-ago; pendiente de reproducir.** | **Mayor** | Abierto | |
| D-10 | P-03 / P-04 | **El panel puede quedarse en «Verificando sesion…» para siempre.** `app/admin/page.tsx:48` llama a `supabaseAuth.auth.getSession()` sin `.catch`. Es la única llamada que saca a la pantalla del estado de verificación: si la promesa se rechaza —red caída, token corrupto en el almacenamiento local— `setVerificando(false)` nunca corre y el Loader de `:119` se queda fijo, sin mensaje de error y sin camino al formulario de acceso. La persona no puede ni entrar ni enterarse de por qué. Afecta la ejecución de P-03 y P-04, que se prueban justo en esa pantalla. **Detectado por revisión de código el 03-ago; pendiente de reproducir.** | **Mayor** | Abierto | |
| D-11 | A-07 / F-39 | **La página pública del aviso se pinta vacía y con apariencia de correcta.** `getAvisoVigente` arma `parrafos` filtrando líneas en blanco y **no lanza** si el resultado queda vacío (`api.ts:76-79`); `aviso-de-privacidad/page.tsx:40-44` lo vuelca sin comprobar. Con un `contenido` en blanco o sólo espacios, el visitante ve el encabezado y la línea «Versión N del aviso, vigente al momento de esta consulta» sobre un cuerpo **sin una sola cláusula**, sin error ni hueco. Es la URL que la propia base publica en `url_publica` y a la que remiten el formulario y la portada: el aviso integral podría estar caído y la página seguiría afirmando que está vigente. Hermano de D-04 y del mismo linaje que D-01: la evidencia de cumplimiento se sostiene sola cuando el contenido falta. **Reproducido el 03-ago** inyectando una respuesta con `contenido` en blanco: la página quedó con **cero párrafos** y siguió afirmando «Versión 2 del aviso, vigente al momento de esta consulta», sin error ni hueco. Un visitante no tiene forma de saber que está viendo un aviso vacío. | **Mayor** | Abierto | |
| D-13 | F-02 / F-39 / A-07 | **El aviso de privacidad publicado no lleva un solo acento.** `22_publicar_aviso_v2.sql` y `44_aviso_simplificado.sql` tienen **cero** caracteres acentuados en todo el archivo: el texto que la persona lee y acepta dice «Adquisicion», «Instituto Asuncion de Queretaro», «transferira», «informacion», «supresion». No es un detalle de código: es **el documento legal** que el titular acepta con su firma y el que Direccion y Legal van a aprobar y a publicar como aviso institucional. El contraste lo hace peor de dos maneras. Dentro de la misma página del aviso, el encabezado escrito en React sí acentúa («Tratamiento de datos personales del Sistema de **Adquisición** de TAG Vehicular… Instituto **Asunción** de **Querétaro**») y el cuerpo que viene de la base, no. Y en el asistente, dos pasos seguidos: el reglamento (`23_publicar_reglamento_v2.sql`, 22 líneas acentuadas) está bien escrito y el aviso del paso anterior no. **Corregirlo obliga a tocar `aviso_versiones.contenido`, lo que fuerza a resembrar el banco de QA** (`seed_tests_dev.sql:352` guarda el sha256 del texto): conviene que viaje en la misma v3 que apruebe Legal, junto con el plazo de conservación y las opciones de limitación de uso, y no como cambio suelto. | **Mayor** | Abierto | |
| D-14 | F-02 / U-01 | **En celular, el consentimiento se otorga mirando por una mirilla.** `.reglamento` fija `max-height: 220px` (`globals.css:154`), así que en un teléfono de 390 px el aviso integral completo y las 22 cláusulas del reglamento se leen por una ventana de unos cinco renglones, con media pantalla vacía por encima. Nadie lee un documento legal así: la puerta de «desplácese hasta el final» se convierte en un trámite de arrastrar el dedo, que es justo lo contrario de lo que la puerta pretende probar. Además **es lo que hace explotable a D-01**: cuanto más pequeño es el recuadro, más fácil es que el párrafo «Cargando…» quepa entero y dispare `scrollHeight <= clientHeight + 8`. Un recuadro alto no arregla D-01, pero le quita la mecha. Se anota junto al lote B, que ya toca el ancho en celular. | Menor | Abierto | |
| D-12 | F-08 | **Seis textos de cara al usuario van sin acentos**, en las dos pantallas de entrada al panel, conviviendo con JSX vecino que sí acentúa: «No se pudo iniciar sesion.» (`app/admin/page.tsx:81`), «…recibira un enlace para restablecer su contrasena…» (`:93`), «Verificando sesion…» (`:119`), «No se encontro el factor verificado.» (`GateMfa.tsx:54`), «No se pudo iniciar la verificacion.» (`:68`) y «No se pudo verificar el codigo.» (`:83`). En la misma pantalla, `page.tsx:193` dice «Iniciar sesión» y `GateMfa.tsx:155` «Verificación en dos pasos», así que la inconsistencia se ve de un vistazo. | Menor | Abierto | |
| D-02 | Pantalla 2 | Al marcar «El conductor es menor de edad» y **desmarcarla**, «Tipo de usuario» se queda en **Alumno** en lugar de volver al predeterminado, sin aviso visual (`registro/page.tsx:295`). Mitigado aguas abajo: el bloque 46 obliga a Administración a confirmar el tipo al cobrar. | Menor | Abierto | |
| D-03 | F-08 | **Cinco** textos tutean dentro del asistente: «Especifica la marca» (`registro/page.tsx:371`), «Especifica el modelo» (`:388`), «Especifica el color» (`:403`), **«Desplázate hasta la cláusula 22 para poder aceptar»** (`:474`) y **«Puedes firmar con el dedo (táctil) o con el mouse»** (`:492`, paso 5). El de `:474` es el más visible: su gemelo del paso anterior (`:447`) sí dice «Despláce**se** hasta el final», así que dos pantallas seguidas tratan al usuario de distinto modo. En la pantalla del vehículo el `:379` dice «Escriba el modelo». Viola CC-07. El Manual del Usuario los cita textualmente en las líneas 103, 107 y 109, así que se corrigen en el mismo cambio. **Ampliado el 03-ago:** el quinto (`:492`) apareció al entrar al paso 5, que el barrido del 31-jul había excluido de su alcance. | Menor | Abierto | |
| D-06 | F-01 / E-05 | **La firma sobrevive a «Atrás» y se envía un PNG que la pantalla ya no muestra.** `retroceder()` (`registro/page.tsx:173-176`) no toca `firma` ni `trazos`, pero `SignaturePad` se desmonta al salir del paso 5 y al volver se remonta **en blanco**: su único efecto de montaje (`SignaturePad.tsx:30-45`) reasigna `canvas.width`/`canvas.height`, lo que borra el lienzo, y `strokes` es un `useRef` que vuelve a nacer vacío. El padre, en cambio, conserva el PNG y el vector anteriores. Resultado: la persona firma, pulsa «Atrás» para releer una cláusula, regresa, ve **el recuadro vacío** y `validarPaso(4)` (`:161`) la deja enviar igual, porque sólo comprueba `!firma`. Se sube la firma de la pasada anterior. La evidencia queda válida en hash y sello, pero **no corresponde a lo que la persona tenía delante al pulsar «Enviar registro»**, que es justo lo que la firma debe probar. Detectado el 31-jul y aplazado por estar el paso 5 fuera del alcance de aquel barrido; **entra hoy al recorrer los pasos 4 a 6**. **Reproducido el 03-ago en escritorio y celular** con el recorrido automatizado: tras «Atrás» + «Siguiente», el lienzo queda con todos sus píxeles transparentes y el botón «Enviar registro» sigue activo. La captura del lienzo posterior al regreso es **byte a byte idéntica** a la del lienzo nunca usado (84 153 bytes en escritorio, 131 509 en celular). El arreglo correcto no es limpiar la firma al retroceder —eso destruye evidencia válida ante cualquier «Atrás» accidental— sino repintar: `trazos` ya sube al padre, falta pasarlo como prop y redibujar los trazos en el efecto de montaje. | Mayor | Abierto | |
| D-07 | F-08 | **El tuteo también viaja desde la base de datos.** `apiPanel.ts:46-47` deja escrito que los errores de negocio de los RPC «se muestran tal cual», y `api.ts:223` y `:254` reenvían `error.message` sin tocarlo, así que el texto del `raise exception` llega literal a la pantalla. Tutean **cuatro cadenas vivas**, en dos funciones: `crear_solicitud` (`28_rpc_crear_solicitud.sql`, bloque 28) con «**Describe** brevemente que **necesitas**» (`:56`), «**Captura tu** folio y **tus** placas (o No. de TAG)» (`:65`) y «…en proceso para **tu** registro» (`:90`); y `panel_exigir_rol` (`29_rpc_panel.sql:53`) con «**Tu** usuario no tiene el rol requerido». Las tres primeras salen en el **buzón público con folio**, cara al usuario; la cuarta en el panel. Se suma «**Debes** aceptar el reglamento» (`api.ts:163`), del cliente. Viola CC-07 en una capa que F-08 no alcanza, porque ese caso acota el recorrido al asistente. **Verificado el 03-ago que el camino de la nota sin folio NO está afectado:** los ficheros `34_buzon_notas_sin_folio.sql:95` y `35_notas_generalizar_solicitante.sql:96` también tutean, pero son código muerto — el bloque 41 reescribió `crear_nota_solicitud` en usted («Falta su nombre», `:55`) y los bloques 35 y 37 hicieron `drop function` de las firmas viejas, así que esas cadenas ya no existen en la base. Quien haga el arreglo debe corregir **sólo** los bloques 28 y 29. Ninguna de las dos funciones cambia de firma, así que basta `create or replace` del cuerpo: **sin `drop function` ni `notify pgrst`**. Va en el **bloque 49**, junto con el arreglo de D-01. | Menor | Abierto | |

## Cierre de la actividad

- [ ] 100 % de los casos P aprobados.
- [ ] 100 % de los casos E aprobados.
- [ ] ≥ 95 % de los casos F aprobados.
- [ ] Casos A ejecutados y reflejados en el checklist legal E6.
- [ ] Casos U ejecutados con personal real.
- [ ] Defectos críticos y mayores corregidos y reejecutados.

| | Nombre | Firma | Fecha |
|---|---|---|---|
| **Ejecutó** | Gerardo Sánchez | | |
| **Revisó** | Miguel Ángel González Pacheco | | |
