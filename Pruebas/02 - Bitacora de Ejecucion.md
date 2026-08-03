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

## Tanda P · Privacidad, RLS, RPC y Storage

| Caso | Fecha | Resultado | Evidencia / observación |
|---|---|---|---|
| P-01 | | | |
| P-02 | | | |
| P-03 | | | |
| P-04 | | | |
| P-05 | | | |
| P-06 | | | |
| P-07 | | | |
| P-08 | | | |
| P-09 | | | *(comprueba el bloque 43, aplicado 28-jul)* |
| P-10 | | | *(comprueba el bloque 43, aplicado 28-jul)* |
| P-11 | | | *(riesgo aceptado: sin rate limiting)* |
| P-12 | | | |
| P-13 | | | *(bloque 48: `consulta` lee la firma pero no escribe nada)* |
| P-14 | | | *(vistas `security_invoker`, bloques 45 y 47)* |

## Tanda E · Evidencia de firma

| Caso | Fecha | Resultado | Evidencia / observación |
|---|---|---|---|
| E-01 | | | |
| E-02 | | | |
| E-03 | | | |
| E-04 | | | |
| E-05 | | | |
| E-06 | | | |
| E-07 | | | *(SC-008, bloque 47)* |
| E-08 | | | |
| E-09 | | | |
| E-10 | | | *(bloque 48; anotar el riesgo aceptado, no como fallo)* |
| E-11 | | | *(evidencia sembrada; la imagen exige subir qa-firma-demo.png a mano)* |

## Tanda F · Funcional

| Caso | Fecha | Resultado | Evidencia / observación |
|---|---|---|---|
| F-01 | | | |
| F-02 | 31-jul-2026 | | Mitad del aviso verificada; **falta el reglamento** (paso 4). Observación de redacción del caso: el esperado dice "el botón permanece deshabilitado", pero lo que se deshabilita es **la casilla** (`registro/page.tsx:454`, `disabled={!avisoLeido}`), y el botón muestra "Debe aceptar el aviso de privacidad para continuar". El propósito —no se puede aceptar sin llegar al final— se cumple. |
| F-03 | 31-jul-2026 | ✅ | La casilla llega **desmarcada y deshabilitada**; se habilita al desplazarse al final (tolerancia de 8 px, `alFinal`). El aviso que dice "Desplácese hasta el final para poder aceptar" desaparece al cumplirse. Es obligatoria: sin ella `validarPaso` bloquea el avance (`:159`). |
| F-04 | | | |
| F-05 | 31-jul-2026 | ✅ | Seat → Arona, Ateca, Ibiza, Leon, Tarraco, Toledo, Otro: los modelos corresponden a la marca. Marca «Otro» abre captura libre de marca y de modelo. La rama modelo = «Otro» se verificó en el código, no en pantalla. Observación menor: «Leon» debería llevar acento en el catálogo. |
| F-06 | | | |
| F-07 | | | |
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
| D-05 | F-08 | El área que instala el TAG se llama de dos maneras en el mismo flujo: la portada dice «**Sistemas** lo instala» (`page.tsx:22`) y el comprobante del paso 6 dice «**TI** instalará y activará su TAG». El Manual del Usuario usa «Sistemas» 21 veces y reserva «TI» para lo interno, así que el comprobante es el que se sale. En el mismo renglón del comprobante, «preséntese en **administración**» va en minúscula. | Menor | Abierto | |
| D-02 | Pantalla 2 | Al marcar «El conductor es menor de edad» y **desmarcarla**, «Tipo de usuario» se queda en **Alumno** en lugar de volver al predeterminado, sin aviso visual (`registro/page.tsx:295`). Mitigado aguas abajo: el bloque 46 obliga a Administración a confirmar el tipo al cobrar. | Menor | Abierto | |
| D-03 | F-08 | **Cuatro** textos tutean: «Especifica la marca» (`registro/page.tsx:371`), «Especifica el modelo» (`:388`), «Especifica el color» (`:403`) y **«Desplázate hasta la cláusula 22 para poder aceptar»** (`:474`). Este último es el más visible: su gemelo del paso anterior (`:447`) sí dice «Despláce**se** hasta el final», así que dos pantallas seguidas tratan al usuario de distinto modo. En la pantalla del vehículo el `:379` dice «Escriba el modelo». Viola CC-07. El Manual del Usuario los cita textualmente en las líneas 103, 107 y 109, así que se corrigen los dos en el mismo cambio. | Menor | Abierto | |

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
