# Matriz de Casos de Prueba — SATAG

> Complemento del [Plan de Pruebas](00%20-%20Plan%20de%20Pruebas.md) · v1.0 · 28-jul-2026.
> Cada caso es ejecutable por un tercero. El resultado se anota en la
> [bitácora de ejecución](02%20-%20Bitacora%20de%20Ejecucion.md), no en este archivo.

**Cómo leer:** `Pre` = precondición · `Pasos` = qué hacer · `Esperado` = qué debe ocurrir para aprobar.
Los folios corresponden al banco de QA (`supabase/sql/seed_tests_dev.sql`).

---

## F · Funcional — Flujo 1: Autoservicio (`/registro/`)

| ID | Caso | Pre | Pasos | Esperado |
|---|---|---|---|---|
| **F-01** | Alta completa de adulto | Sesión anónima | Capturar datos, vehículo, aceptar aviso y reglamento, firmar y enviar | Se emite folio `SATAG-######`; el registro queda **pendiente**; aparece el comprobante |
| **F-02** | Avance bloqueado sin leer | — | En el paso del aviso, intentar continuar sin llegar al final del texto | El botón permanece deshabilitado hasta hacer scroll al final; lo mismo en el reglamento |
| **F-03** | Casilla no premarcada | — | Llegar al final del aviso | La casilla de aceptación está **desmarcada** por defecto y es obligatoria |
| **F-04** | Menor de edad exige tutor | — | Capturar una fecha de nacimiento de menor de 18 | El tipo se fija en `alumno`, se exige gestionante padre/madre/tutor y la firma es del gestionante |
| **F-05** | Marca → modelo dependiente | — | Elegir una marca y abrir modelos; luego elegir "Otro" | Los modelos corresponden a la marca; "Otro" habilita captura libre |
| **F-06** | Validación de placas y campos | — | Enviar con placa inválida o campos vacíos | Se bloquea el envío con mensaje claro por campo; nada se guarda |
| **F-07** | Procedencia del TAG | — | Elegir TAG de la escuela y, en otro registro, TAG propio | Ambos quedan registrados con su procedencia; **los dos se cobran** (CC-01) |
| **F-08** | Redacción "de usted" | — | Recorrer las seis pantallas del wizard | Ningún texto tutea al usuario (CC-07) |

## F · Funcional — Flujo 2: Administración (`/admin/`, pestaña Administración y Finanzas)

| ID | Caso | Pre | Pasos | Esperado |
|---|---|---|---|---|
| **F-09** | Cobro de un pendiente | `…101` sin pago · rol `admin` | Cobrar $100 en efectivo | Se registra el pago con **folio de recibo automático** `SATAG-AAAA-######`; el expediente pasa a la cola de instalación de TI. *(Nota: la validación del tipo de usuario B5 **no** está conectada — se documenta el estado actual, no se reprueba)* |
| **F-10** | No hay doble cobro | `…101` ya cobrado | Intentar cobrar otra vez el mismo expediente | El sistema lo impide; el chip muestra "Pagado"; no se genera segundo folio |
| **F-11** | Doble clic no duplica | `…102` sin pago | Pulsar "Cobrar" dos veces rápido | Se registra **un solo** pago (candado anti-doble-RPC) |
| **F-12** | Monto editable | `…103` sin pago | Cobrar con monto distinto del predeterminado | Se guarda el monto capturado y queda visible en el historial |
| **F-13** | Cola por prioridad de cobro | Banco aplicado | Abrir Administración | Los pendientes sin pago encabezan la lista; los pagados y las bajas se distinguen por chip |
| **F-14** | Estado de caja | Varios cobros del día | Abrir **Finanzas** | "En caja ahora" = suma de cobros **no cortados**; se muestran acumulados de mes e histórico |
| **F-15** | Corte con efectivo exacto | Cobros sin cortar | Cortar caja capturando el efectivo contado igual al esperado | El corte se sella con folio, diferencia $0 y la identidad de quien cortó; la caja vuelve a cero |
| **F-16** | Corte con diferencia | Cobros sin cortar | Cortar capturando un efectivo distinto del esperado | Se exige **observación obligatoria**; la diferencia queda registrada en el corte |
| **F-17** | Corte inmutable | Un corte existente | Intentar modificar o borrar el corte o un pago ya sellado (desde el panel y desde SQL) | Ambas vías fallan: los triggers de blindaje del bloque 42 lo impiden |
| **F-18** | Cobros por corte | Un corte existente | Abrir el detalle del corte | Lista exactamente los cobros sellados en ese corte |

## F · Funcional — Flujo 3: TI (`/admin/`, pestaña TI)

| ID | Caso | Pre | Pasos | Esperado |
|---|---|---|---|---|
| **F-19** | Instalación con estacionamiento | `…111` pagado · rol `ti` | Asignar estacionamiento y capturar el No. de dispositivo | El registro pasa a **activo/instalado** en una sola transacción; queda movimiento en bitácora |
| **F-20** | No instalar sin pago | `…191` sin pago | Buscarlo en la cola de instalación | Aparece en la sub-sección gris **"Esperando pago"** y no permite instalar |
| **F-21** | Validación del No. de dispositivo | `…112` | Capturar un TAG con formato inválido y uno duplicado | Se rechazan ambos (formato `^[0-9]{6,11}$` y unicidad) |
| **F-22** | Actualización de datos | `…141` con solicitud | Atender la solicitud editando placas/color/estacionamiento | Se muestra **resumen de cambios** antes de confirmar; la solicitud queda atendida y se registra el movimiento |
| **F-23** | Baja con motivo | `…151` con solicitud de baja | Dar de baja | El motivo llega prellenado desde la solicitud; el registro pasa a baja y sale de las colas activas |
| **F-24** | Orden por urgencia | Banco aplicado | Abrir las colas de TI | Las peticiones más antiguas encabezan; el badge de espera es verde 0-2 d, ámbar 3-6 d y rojo ≥ 7 d |
| **F-25** | Apartar y usar el TAG (CC-01) | `…211` con TAG propio y TAG apartado | Abrir "Actualizar datos" y usar **"Usar el TAG apartado"** | El TAG apartado se instala como reposición; la procedencia queda coherente y se registra el movimiento |
| **F-26** | Nota vinculada se cierra sola | `…171` con nota vinculada que pide actualizar | Ejecutar la actualización | La nota se cierra automáticamente al ejecutar el trámite (bloque 38) |
| **F-27** | Vincular nota sin expediente | 6 notas sin vincular + gemelos `…201`…`206` | Buscar por nombre y vincular; **corroborar** el trámite que pide el solicitante | La nota queda vinculada al expediente correcto y entra a la cola del trámite corroborado (bloque 39) |
| **F-28** | Descartar nota spam | Una nota sin vincular | Descartarla sin vincular | Se cierra sin error y desaparece de la cola (bloque 36) |

---

## P · Privacidad, RLS, RPC y Storage — **bloquean el cierre**

| ID | Caso | Cómo se prueba | Esperado |
|---|---|---|---|
| **P-01** | `anon` no lee el padrón | Desde la consola del navegador con el cliente anónimo: `select` sobre `registros` | Devuelve **0 filas** o error de permiso. Nunca PII |
| **P-02** | `anon` no lee firmas ni aceptaciones | Igual sobre `aceptaciones`, `pagos`, `movimientos`, `solicitudes` | Sin acceso de lectura en todas |
| **P-03** | El panel exige MFA | Iniciar sesión con una cuenta sin completar el reto TOTP | No se muestra ningún dato: el panel exige `aal2` antes de consultar |
| **P-04** | Sin rol no hay panel | Cuenta autenticada sin `app_metadata.rol` | Pantalla "Sin rol asignado"; ninguna consulta devuelve datos |
| **P-05** | Rol `consulta` no escribe | Con rol `consulta`, invocar `registrar_pago`, `instalar_tag` y `dar_baja` desde el SQL Editor | Las tres fallan por `panel_exigir_rol` |
| **P-06** | Rol `ti` no cobra | Con rol `ti`, invocar `registrar_pago` y `cortar_caja` | Ambas rechazadas |
| **P-07** | Rol `admin` no instala | Con rol `admin`, invocar `instalar_tag` | Rechazada |
| **P-08** | Sin escritura directa | Con cualquier rol del panel, intentar `update registros …` e `insert into pagos …` directos | Ambos rechazados: toda escritura pasa por RPC (bloque 30) |
| **P-09** | Catálogos y documentos (riesgo abierto) | Con rol `consulta` o `ti`, intentar escribir en `cat_marcas` y `aviso_versiones` | **Estado actual esperado: lo permite** (bloques 05/09 aceptan cualquier `authenticated + aal2`). Registrar como hallazgo → SC-009 |
| **P-10** | Bucket de firmas | Solicitar el PNG de una firma por URL directa, sin sesión | No debe ser accesible: el bucket `firmas` es privado. Verificar además si un rol no-admin puede escribir en él (SC-009) |
| **P-11** | RPC públicos sin límite | Enviar 20 notas seguidas al buzón desde la misma IP | **Estado actual esperado: las acepta todas** (sin rate limiting ni CAPTCHA). Riesgo aceptado; se documenta |
| **P-12** | El buzón no filtra datos | Consultar por un folio ajeno en `/solicitudes/` | Confirma que la solicitud se recibió, pero **nunca muestra datos del expediente** |

---

## E · Evidencia de firma

| ID | Caso | Cómo se prueba | Esperado |
|---|---|---|---|
| **E-01** | La firma se conserva | Tras un alta, consultar `aceptaciones` de ese registro | Existe exactamente **una** aceptación, con ruta al PNG en el bucket privado |
| **E-02** | Hash verificable | Descargar el PNG con URL firmada y recalcular su SHA-256 | Coincide con el hash almacenado |
| **E-03** | Versiones correctas | Revisar la aceptación | Apunta a la versión **vigente** del reglamento (v2, 22 cláusulas) y del aviso (v2) al momento de firmar |
| **E-04** | Sello de tiempo | Revisar la aceptación | Conserva la fecha/hora del consentimiento |
| **E-05** | Trazos vectoriales | Revisar la evidencia guardada | Además del PNG, se conservan los trazos `{x, y, t, p}` reproducibles |
| **E-06** | Menor firma el tutor | Alta de menor (F-04) | La aceptación registra al **gestionante** como firmante; la restricción `reg_menor_requiere_gestionante` impide guardarlo sin él |

---

## A · ARCO y ciclo de vida

| ID | Caso | Cómo se prueba | Esperado |
|---|---|---|---|
| **A-01** | Acceso | Solicitar por el buzón con folio el detalle del expediente | Existe una vía documentada para entregar al titular su información (hoy: TI la atiende desde el panel; **no hay exportación automática** — registrar como pendiente) |
| **A-02** | Rectificación por folio | `…141`: pedir corrección de datos y atenderla | El dato queda corregido y con movimiento en bitácora |
| **A-03** | Rectificación sin folio | Enviar nota sin folio pidiendo actualizar; TI vincula y ejecuta | Mismo resultado que A-02 por el canal sin folio |
| **A-04** | Cancelación / baja | `…151`: pedir baja y ejecutarla | El expediente pasa a baja; deja de aparecer en las colas activas |
| **A-05** | Bloqueo | Revisar un registro dado de baja | Conserva el estado `bloqueado` y no se usa en operación diaria |
| **A-06** | Conservación | Revisar `bloqueado_en` y `suprimir_despues_de` | Los campos existen y se llenan. **Estado actual: no hay proceso que ejecute la supresión** — registrar como pendiente de SC-011 |
| **A-07** | Aviso disponible | Buscar el aviso de privacidad fuera del formulario | **Estado actual esperado: no existe la página `/aviso-de-privacidad`** que la BD referencia, ni el aviso simplificado. Hallazgo → SC-007 |
| **A-08** | Canal ARCO publicado | Leer el aviso mostrado en el formulario | Publica un canal único y vigente (`aviso.privacidad@asuncionqro.edu.mx`) y el domicilio del responsable |

---

## U · Usabilidad — **con personal real, no con el desarrollador**

| ID | Caso | Participante | Esperado |
|---|---|---|---|
| **U-01** | Alta sin ayuda | Un padre/madre de familia | Completa el registro sin asistencia y entiende que debe pasar a pagar |
| **U-02** | Cobro sin manual | Personal de Administración | Localiza el expediente y cobra en menos de 2 minutos, sin indicaciones |
| **U-03** | Corte de caja | Personal de Administración | Entiende qué significa "en caja ahora", concilia el efectivo y comprende que el corte **no se puede deshacer** |
| **U-04** | Instalación | Personal de TI | Instala un TAG y comprende las cuatro colas y el badge de espera |
| **U-05** | Búsqueda | Cualquier rol de panel | Encuentra un registro por nombre, placa, TAG o estacionamiento en **menos de 5 segundos** (criterio de aceptación del Doc 2) |

---

## Cobertura frente a los criterios de aceptación

| Criterio de aceptación (Doc 2 §2.1) | Casos que lo cubren |
|---|---|
| Campos cubiertos, validados y guardados | F-01, F-05, F-06, F-21 |
| Firma conservada como evidencia | E-01…E-05 |
| Aviso simplificado antes de capturar | A-07 *(hallazgo abierto)* |
| Menores firman por tutor | F-04, E-06 |
| Administración asigna y cobra | F-09…F-13 |
| TI captura TAG y cambia estado | F-19…F-21, F-25 |
| Búsqueda < 5 s con estado y pago | U-05, F-13 |
| ARCO / cambio / baja | A-01…A-05 |
| Sitio en subdominio con HTTPS y deploy automático | *Pendiente de la migración SC-012; se prueba al migrar* |
| No expone datos ajenos; RPC, Storage privado y MFA | P-01…P-12 |
