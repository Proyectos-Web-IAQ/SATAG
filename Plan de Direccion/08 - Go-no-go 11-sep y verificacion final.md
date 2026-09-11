# Doc 8 — Go/no-go del 11-sep-2026 y verificación final

> **Plan de Dirección · Fase 3 (Ejecución/Control).** Decide si SATAG empieza a operar con
> personal real y familias reales el **lunes 14-sep** (escenario A) o el **miércoles 16-sep**
> (escenario B). El esqueleto son las condiciones acordadas en la junta del 9-sep, según el plan de
> acción del 9-sep, versión 2 (vive fuera del repositorio; su ubicación exacta, en Drive o en
> CroNoma: **pendiente de confirmar**) y las tareas L1 y L2 cargadas en CroNoma. El Doc 7 (anterior a
> la junta) solo se usa como antecedente.

| | |
|---|---|
| **Para** | Miguel Ángel González Pacheco — Dirección de TI (decide) |
| **Prepara** | Gerardo Sánchez — Soporte TI |
| **Corte** | Viernes 11-sep-2026, 14:05: push de las 13:23 (commit `b13af63`) en línea desde las 13:26 y bloque 65 aplicado hacia las 14:00 |
| **Se cierra** | Al final del día, llenando la sección 9 |

---

## 1. Recomendación

1. **GO condicionado a la verificación final de hoy (sección 5)** y a las aceptaciones de Miguel que
   pide la sección 8.
2. Lo que la junta pidió para el lunes está cumplido o en curso hoy, con dos puntos pendientes de
   confirmar (filas 20 y 21), tres pasados al lote 2 (filas 17 a 19) y dos que esta revisión agregó
   sin evidencia todavía (filas 23 y 24). La publicación de las 13:23 y el bloque 65 ya quedaron; lo
   siguiente son las tres altas de prueba contra la base como quedó (sección 5), y del documento del
   aviso para Legal solo falta subirlo a Drive. Se busca cerrar hoy; si no, rige la sección 8. Los
   cambios de usabilidad aprobados hoy (sección 3) ya están publicados y verificados (14:09) y no son
   condición del GO.
3. Cualquier casilla indispensable de la sección 5 que falle o que no se haga hoy lleva al
   **escenario B: miércoles 16-sep** (criterio completo en la sección 8).

## 2. Condiciones de la junta del 9-sep contra el estado de hoy

Estados: **Cumplida** (antes de hoy) · **Cumplida hoy** · **En curso, cierra hoy** · **Pasa a lote 2**
(semana del 16-sep, fuera de la condición del lunes). Donde no hay evidencia de hoy dice
**Pendiente de confirmar**.

| # | Condición | Estado | Evidencia |
|---|---|---|---|
| 1 | Sitio en el dominio institucional, no en vercel.app | Cumplida | En `satag.asuncionqro.edu.mx` desde el 10-sep (GitHub Actions + FTPS). Vercel queda solo de respaldo hasta el 14-sep. |
| 2 | Cuenta de quien cobra | Cumplida | Zairet Ledezma: rol admin, MFA verificado (consultado en la base hoy). Que entre al panel en el dominio y su práctica: fila 23. |
| 3 | Cuentas de quien instala | Cumplida | Lidia Segundo y Ángel Martínez (ti), Miguel González y Gerardo Sánchez (super): los cuatro con MFA listo (base, hoy). |
| 4 | Datos del vehículo editables desde TI | Cumplida | Corrección de placas y vehículo desde TI desde el 10-sep (`6b9b991`). Hoy se suma el catálogo con opción «Otro» al corregir, en el código de las 13:23, en línea desde las 13:26. |
| 5 | Placas que no se repitan entre expedientes (L2-05, adelantada del lote 2) | Cumplida hoy | Bloque 62 aplicado y verificado: las mismas placas no entran en dos expedientes vivos y se guardan en mayúsculas. |
| 6 | «Volver» desde el aviso regresa a /registro/ | Cumplida | `20d5a9c`, 10-sep. |
| 7 | Aviso duplicado en el alta | Cumplida | `ec4176b` y `7defd68`, 10-sep: el aviso del paso 1 se presenta como resumen al pie. |
| 8 | Catálogo de marcas y modelos actual | Cumplida | Bloque 56, 10-sep: 45 marcas y 337 modelos, más la opción «Otro». |
| 9 | Catálogo con el histórico de la hoja de cálculo (L2-06) | Pasa a lote 2 | El lunes basta el catálogo 2024-2026 con «Otro». |
| 10 | Dos apellidos obligatorios; uno solo para extranjeros | Cumplida | `d3b2b6f` y `5df37c5`, 10-sep. |
| 11 | Apellidos de la familia obligatorios para padres (cotejo contra GES) | Cumplida | Bloques 55 (parte A) y 58, 10-sep; el expediente los muestra a la vista (`619bba9`). |
| 12 | Apellidos de la familia también para alumnos | Cumplida hoy | El formulario publicado a las 13:26 los pide: Gerardo comprobó a mano que, al marcar «El conductor es menor de edad», aparece «Apellidos de la familia» y no deja avanzar vacío. El bloque 65, aplicado hacia las 14:00, después de la publicación y con su candado, hace que la base también los exija. Las tres altas de prueba posteriores siguen pendientes (sección 5). |
| 13 | Tipo de usuario «otro» (tío, abuelo) con su parentesco (L2-01) | En curso, cierra hoy | Base lista y verificada (bloques 63 y 64); formulario y panel publicados, en línea desde las 13:26 (sección 3). No era condición del lunes (el plan del 9-sep lo había pasado al lote 2), **pero al publicarse hoy, que funcione sí lo es**: sección 5 (alta c y recorrido). |
| 14 | Aviso de privacidad completo (responsable, correo ARCO, plazo) | Cumplida (10-sep, v3/v4); hoy v6 vigente | La v6 (bloque 64, verificado técnicamente) es el aviso institucional textual más el anexo SATAG, que ya menciona el parentesco y a quién se piden los apellidos. **Visto bueno de Miguel a la v6: pendiente de confirmar** (L1-04: Miguel da el visto bueno; el CP valida después sobre lo publicado). |
| 15 | Documento del aviso para revisión de Legal, en Drive | En curso, cierra hoy | Actualizado a la v6 vigente, cotejado línea por línea contra el bloque 64, en Word (`Entregables/E6 - Cumplimiento Legal y Privacidad/E6 - Aviso de Privacidad SATAG.docx`) y versionado (`4f10c07`). Falta solo que Gerardo lo suba a Drive y lo comparta con Ana Barrón y Legal. Lleva dos observaciones para Legal: el anexo conserva frases abiertas de la v4 («u otro rol autorizado») aunque «otro» es solo familiares, y el apartado de la firma dice que se sella «una copia de lo que usted declaró» cuando los apellidos de la familia no se sellan. El Doc 7 fijaba la revisión de Legal con tope 12-sep. Que no detenga el lunes **lo decide Miguel** (sección 9): cada firma conserva la versión que aceptó, así que si Legal cambia algo se publica una v7. |
| 16 | Empleado que también es padre | Cumplida hoy | Instrucción operativa, no cambio del sistema: recibe los accesos de su puesto (un administrativo, solo el estacionamiento 2). Ya está escrita en la Guía rápida del personal (`f752390`), en la confirmación del tipo al cobrar y en la elección de estacionamiento de TI. Falta entregarla impresa (fila 22). |
| 17 | Rol contador, único que corta caja, con su tablero (L2-02) | Pasa a lote 2 | Mientras no exista, **nadie corta caja**; el corte es mensual y del CP Vicente. El tablero que pidió la junta (tiempo de instalación por persona de TI) no aparece en el nombre de L2-02: **pendiente de confirmar** que va ahí. |
| 18 | Firma manuscrita visible solo para TI y contador (L2-03) | Pasa a lote 2 | Hasta entonces Administración y super siguen viendo la firma, **contra lo decidido en la junta**. Excepción temporal que debe aceptar Miguel con el CP Vicente: sección 6 y sección 9. |
| 19 | Hora e identidad de quien instala tomadas de la sesión (L2-04) | Pasa a lote 2 | El lunes la instalación se registra como hasta hoy. |
| 20 | Comentarios al reglamento a Arturo (vie 11, 12:00) | Pendiente de confirmar | No es condición del sistema y no bloquea; no hay constancia en el repositorio de que se enviaron. |
| 21 | Expedientes del piloto exportados a ZK y fuera del padrón (L1-07) | Cumplida la exportación; conteo pendiente | Constancia del 10-sep (`supabase/manual/2026-09-10_cronoma_cierre_carga.sql`): el padrón del piloto se exportó a ZK con cero fallidos y se borró. Cuántos expedientes de prueba siguen vivos hoy: **pendiente de confirmar** (la cifra de «2» no tiene fuente en el repositorio). No bloquea. |
| 22 | Hoja de instrucciones del lunes y go/no-go (L1-08) | En curso, cierra hoy | Vencen hoy; este documento es la mitad del go/no-go. **Instrucciones listas, en Word y versionadas (`f752390`):** «E8 - Guia rapida para familias» (dos páginas) y «E8 - Guia rapida del personal» (cinco páginas), con Administración cotejando en GES al cobrar y los cambios de usabilidad ya publicados; las 105 citas de pantalla de la del personal están cotejadas contra el código publicado. Falta entregarlas impresas. El cartel con QR a https://satag.asuncionqro.edu.mx/registro/ está generado en PDF tamaño carta; falta imprimirlo y probarlo con un celular. |
| 23 | Capacitación y práctica del personal (Doc 7, B1; L1-03 «activación acompañada… cobro de prueba») | Pendiente de confirmar | No consta la activación acompañada ni un cobro de prueba de Zairet, ni práctica de Lidia y Ángel con el panel de hoy (cobro con parentesco, corrección con catálogo). La tanda U sigue sin ejecutar. Si la capacitación del lunes es la hoja más el acompañamiento en sitio, así se acepta en la sección 9. |
| 24 | Reposición o baja del TAG en cuanto se reporte o se detecte (decisión legal de la junta) | Pendiente de confirmar | No consta dónde quedó escrita; confirmar si va en los comentarios al reglamento (fila 20). |

**Tampoco condicionan el lunes y también son lote 2:** la conciliación de los cinco manuales largos
con el panel de hoy (L2-07), la recuperación del comprobante desde el panel (L2-08) y la captura de
los apellidos de la familia desde el panel, que el bloque 58 dejó «para el lote 2» sin tarea propia
en esta lista (dónde quedó registrada: **pendiente de confirmar**).

### Avance en CroNoma

| Tarea | Avance registrado | Lectura |
|---|---|---|
| Proyecto completo | **77.7%** | No es comparable con el 83.3% del Doc 7: después de la junta se cargaron las tareas de los lotes 1 y 2. |
| L2-05 Corrección del vehículo y duplicados | **100%** (actualizado hoy) | Las tres partes publicadas: corrección desde la cola, placas únicas y catálogo con «Otro» en TI. |
| L2-01 Tipo «otro» | **90%** (actualizado hoy) | Base, código, publicación y bloque 65 listos; faltan el alta (c) y el recorrido. |
| Aviso de privacidad | 98% | v6 vigente; el documento para Legal ya está en v6 y versionado, falta subirlo a Drive; falta el visto bueno de Miguel. |
| Manual y capacitación | **90%** (actualizado hoy) | Para el lunes, las dos guías rápidas (familias y personal) en Word; los manuales largos son L2-07. Falta la sesión con el personal. |
| Pruebas | 85% | F-01 sigue parcial por falta de un cobro (rol admin) y una instalación (rol ti) reales. F-04 no cierra con eso: le falta comprobar, en un alta real de conductor menor con gestionante, que la firma queda a nombre del gestionante (junto con E-06). Sin ejecutar: tanda U (usabilidad con personal real) y tanda A (derechos ARCO y ciclo de vida). |

## 3. Lo que entró hoy

**En la base de datos (aplicado y verificado):**

- **Placas únicas.** Ya no se pueden registrar las mismas placas en dos expedientes vivos, y se
  guardan en mayúsculas para que «abc123» y «ABC123» no pasen como distintas.
- **Tipo «otro familiar».** Tíos, abuelos y otros familiares dejan de registrarse como «padres»:
  declaran su parentesco en texto libre, la caja lo confirma o lo corrige al cobrar (y queda
  constancia del cambio) y la firma lo sella. Las firmas nuevas usan la versión 2 del paquete de
  evidencia; las anteriores conservan la versión 1 y se siguen verificando igual.
- **Aviso de privacidad v6 vigente.** Menciona el parentesco y dice que los apellidos de la familia
  se piden a padres, madres, tutores, alumnos y otros familiares.
- **Apellidos de la familia exigidos también a alumnos (bloque 65).** Aplicado hacia las 14:00,
  después de la publicación. El primer intento lo detuvo el candado de sesión sin aplicar nada,
  porque faltaba la frase de confirmación: funcionó como se diseñó. El segundo, con la frase, pasó
  su verificación (`exige_a_alumno`, `anon_ejecuta` y `authenticated_ejecuta` en true).

**En el repositorio:** los bloques 63, 64 y 65 y el script urgente, versionados y empujados
(`b521dce`; el 62 ya estaba en `b072724`), con el índice `supabase/sql/README.md` en el estado
verificado.

**En el sitio (push de las 13:23, en línea desde las 13:26).** Verificado por programa contra el
dominio: /registro/ sirve el cliente nuevo con y sin parámetro de caché; Cloudflare no guarda el
HTML (`cf-cache-status: DYNAMIC`, `cache-control: no-cache`); el paquete publicado trae
`p_parentesco_otro` y la lista `"padres","alumno","otro"`.

- TI corrige marca, modelo y color con el mismo catálogo del alta, con «Otro» para lo que no esté.
- Pantalla de TI en celular, que es donde se instala: el diálogo de confirmación ya no se sale de la
  pantalla, los campos tienen contraste, el resaltado no se queda pegado al tocar y los botones
  miden 44 px.
- Registro público: tipo «otro familiar» con parentesco, y apellidos de la familia pedidos también a
  alumnos.
- Panel: muestra el parentesco. En el archivo para ZK, el tipo «otro» viaja en el departamento
  «Padres de familia».

**Aprobado y publicado hoy** (push de las 14:08, commits `3ab2401` y `d86cbb6`, en línea desde las
14:09; no es condición del GO). Cada cambio pasó dos revisores independientes y `npm run verificar`,
y los siete textos nuevos están en el paquete publicado de /admin/:

- Vista de TI: botón «Actualizar lista»; buscador en «Instalar TAG» que encuentra por placas,
  apellidos o nombre; el número de TAG grande, en su propio renglón, al confirmar; «Instalando el
  TAG…» mientras guarda y, si se cae la red, un mensaje que no invita a repetir a ciegas.
- Cobro de Administración: recordatorio de cotejar en GES, con los apellidos de la familia a la vista
  (el cotejo es de Administración, no de TI).
- Origen: una auditoría de experiencia de usuario de la vista de TI. Veredicto: se puede usar el
  lunes; sin buscador y sin actualizar la lista, la primera mañana trae llamadas.

**Hecho hoy, en este orden:** (1) publicación en línea, 13:26; (2) bloque 65, hacia las 14:00;
(3) cambios de usabilidad en línea, 14:09. El
orden importaba: invertido, es exactamente lo que falló en el segundo incidente. **Lo siguiente:** las
tres altas de prueba contra la base como quedó (sección 5).

## 4. Incidentes de hoy y salvaguardas

| Hora | Qué pasó | Efecto | Corrección | Salvaguarda |
|---|---|---|---|---|
| ~10:50 (fin: pendiente de confirmar) | La primera versión del bloque 63 se aplicó antes de terminar su revisión y exigía apellidos de la familia a alumno, que el formulario publicado no pedía. | El alta pública de alumno —incluido todo conductor menor de edad— quedó rechazada unos minutos. | Script urgente `supabase/manual/2026-09-11_URGENTE_alumno_sin_apellidos_familia.sql`, verificado; después se aplicó el 63 ya revisado. | La exigencia a alumno se separó en un bloque aparte (65) que va después de publicar el formulario. |
| ~12:50 a 13:26 como máximo | El bloque 65 se aplicó antes de publicar el formulario nuevo. | El mismo: altas de alumno rechazadas, unos 36 minutos como máximo. | **No se revirtió con el script.** La ventana se cerró cuando el formulario nuevo quedó en línea (13:26 como máximo): desde entonces el formulario manda los apellidos que la base exige. Hacia las 14:00 se aplicó el 65 con su candado (sección 3). | El 65 ya no corre sin una frase de confirmación en la sesión que declara que el sitio publicado ya pide el dato; a las 14:00 detuvo un intento sin la frase, sin aplicar nada. |

**Lo que todavía no se sabe:** cada alta rechazada sube primero la imagen de la firma y después es
rechazada, así que deja esa imagen guardada sin expediente. **La consulta que las encuentra no existe
todavía** (`limpiar_datos_prueba.sql` solo lista todo el almacén de firmas): hay que escribirla para
que devuelva las imágenes sin aceptación, con su hora de creación. Un conteo total no basta, porque
puede haber imágenes de otros rechazos o de la limpieza del 10-sep; lo que importa son las que caen
en las ventanas de los dos incidentes. La del segundo ya está acotada (~12:50 a 13:26 como máximo);
a la del primero (~10:50) le falta la hora de fin. Si alguna familia cayó en cualquiera de las dos, lo
dirá esa consulta. El sistema no tiene cómo contactar a esas familias: su alta no llegó a crearse.

**Contexto honesto:** ayer (10-sep) hubo otro incidente de la misma familia —una restricción en la
base bloqueó escrituras del panel, como el cobro, sobre expedientes de padres sin ese dato—
corregido el mismo día (bloque 58). Son tres en dos días con el mismo patrón: un cambio en la base
real cuyo efecto sobre el alta o sobre la operación del panel no se comprobó antes de aplicarlo, sin
entorno de pruebas que lo atrape.

**Lección registrada en CroNoma:** ningún bloque SQL se aplica antes de su revisión, y toda regla
nueva del alta se contrasta con el formulario **publicado**, no con el que está por publicarse.

## 5. Verificación final antes del GO

Marcar en orden. Las marcadas **[indispensable]** deciden el GO (sección 8). El recorrido con rol
super no prueba los permisos de nadie más: la revisión de permisos deja pasar al super sin mirar
nada (`panel_exigir_rol`, bloque 49); por eso hay casillas con las cuentas de quien atiende.

### Viernes 11-sep

- [x] **Publicación en verde** [indispensable] — *Gerardo.* **Cumplida: en línea a las 13:26**,
      verificado por programa contra el dominio (sección 3). Que el sitio sirva la versión nueva
      implica que la corrida del push de las 13:23 terminó en verde con `DEPLOY_GODADDY` en `true`
      (sin esa variable el workflow no publica en el dominio); la pestaña de Actions la puede
      confirmar Gerardo, pero ya no bloquea.
- [ ] **/registro/ ofrece «otro familiar»** [indispensable] — *Gerardo.* En ventana privada, en el
      dominio, sin enviar: cargan los catálogos, aparece el tipo con su campo de parentesco, y al
      marcar «El conductor es menor de edad» el formulario pide los apellidos de la familia y no
      avanza sin ellos; **e igual eligiendo Alumno a mano, sin marcar la casilla**. *Al corte:*
      comprobado a mano el caso del menor (aparece «Apellidos de la familia» y no deja avanzar vacío)
      y, por programa, que el paquete publicado trae el parentesco; **faltan** los catálogos, el tipo
      con su parentesco en pantalla y la vía de Alumno a mano.
- [x] **Bloque 65 aplicado con su candado** — *Gerardo.* **Cumplida hacia las 14:00**, después de la
      publicación: el primer intento lo detuvo el candado sin aplicar nada (faltaba la frase); el
      segundo, con la frase, dio `exige_a_alumno`, `anon_ejecuta` y `authenticated_ejecuta` en true.
      Falta anotar en la sección 9 cuántos expedientes de alumno sin apellidos de la familia devuelve
      su consulta 3c.
- [ ] **Tres altas enviadas contra la base como quedó** [indispensable] — *Gerardo, en ventana
      privada, en el dominio, después del 65.* Por /registro/: (a) alumno menor de edad con
      gestionante y apellidos de la familia; (b) Alumno elegido a mano; (c) «otro familiar» con
      parentesco. Cada una termina con folio; se anotan en la sección 9. Con «Sin placas» o placas
      distintas en cada una: el bloque 62 rechaza las mismas placas en dos expedientes vivos. En (a)
      se revisa que la firma quede a nombre del gestionante (sirve para F-04). (a) y (b) se dan de
      baja al terminar; (c) sigue en el recorrido. Una prueba dentro de la base con vuelta atrás no
      sustituye esto: no pasa por el formulario publicado, que es lo que falló, y también gasta
      folio. **El 65 ya está aplicado (~14:00): estas tres altas son lo siguiente.**
- [ ] **Aviso v6 vigente en el sitio, con visto bueno** [indispensable] — *Gerardo; visto bueno de
      Miguel.* `/aviso-de-privacidad/` dice «Versión 6» y el anexo menciona el parentesco. (En la
      base ya se verificó al aplicar el 64; esto confirma que el sitio lo lee.)
- [ ] **Quien atiende entra con su cuenta** [indispensable] — *Zairet y Lidia o Ángel, con Gerardo.*
      En `satag.asuncionqro.edu.mx/admin/`, con su MFA, llegan a su pantalla (Administración o TI).
      Quien no pueda hoy lo hace el lunes antes de abrir (subsección siguiente).
- [ ] **Recorrido real con el alta (c)** [indispensable] — *en el dominio; de preferencia cobra
      Zairet con su cuenta e instala Lidia o Ángel con la suya; si no, Gerardo con su rol super.*
      Cobro (con confirmación del parentesco) → instalación → exportar a ZK desde TI e importarlo →
      baja en SATAG → **baja en ZK** (sacarlo de los niveles de acceso y moverlo al departamento 10
      BAJAS: la baja de SATAG no llega a ZK). Anotar en la sección 9 el recibo, el TAG, el resultado
      del import, la baja en ZK y **quién hizo cada paso**. El cobro es real y no se deshace: quién
      recibe los $100 hoy, **pendiente de definir**, y se avisa a Zairet que «En caja ahora» no
      arranca el lunes en ceros.
- [ ] **Copia de la base** — *Gerardo, después del recorrido.* El PASO 1 de
      `supabase/sql/respaldo_padron_piloto.sql` sirve tal cual (solo lee: expedientes, aceptaciones,
      pagos, movimientos y demás). Es dato personal: va a `Campo/datos/`, fuera del repositorio.
      Confirmar qué respaldo ofrece la cuenta Free. Anotar hora y lugar.
- [ ] **Firmas huérfanas registradas** — *Gerardo, al final.* Con la consulta que falta escribir
      (sección 4): anotar cuántas hay, su hora y cuántas caen en las ventanas de los dos incidentes
      (la del segundo: ~12:50 a 13:26), **antes de borrarlas** (es la única huella de familias
      rechazadas). Después se borran: es la firma manuscrita, el dato más sensible. No bloquea el GO.
- [ ] **MFA del CP Vicente** — *CP Vicente con Gerardo.* No bloquea: el lunes nadie corta caja.
- [ ] **Hoja de instrucciones del lunes entregada** [indispensable] — *Gerardo.* A Zairet, Lidia,
      Ángel y Miguel: quién cobra, quién instala, que nadie corta caja, la regla del empleado-padre,
      que Administración coteja en GES al cobrar y TI instala a quien ya pagó, **que Administración
      no abre «Ver la firma» hasta L2-03**, qué hacer en ZK con toda baja, que ante apellidos «Sin
      capturar» se llama a Sistemas, qué hacer si algo falla (sección 7), la dirección de respaldo y
      teléfonos de guardia.
- [ ] **Teléfonos de guardia definidos** [indispensable, van en la hoja] — *Gerardo con Miguel.*
- [ ] **Cartel con QR impreso** — *Gerardo.* Ya generado en PDF tamaño carta; falta imprimirlo y
      probarlo con un celular: debe abrir /registro/ del dominio institucional.
- [ ] **Expedientes de prueba** — *Gerardo.* Confirmar cuántos quedan vivos en el padrón (incluidos
      los de hoy) y darlos de baja antes del lunes. No bloquea.
- [ ] **Documento del aviso para Legal en Drive actualizado a v6** — *Gerardo.* Ya está en v6,
      cotejado contra el bloque 64 y versionado (`4f10c07`, fila 15); falta subirlo a Drive y
      compartirlo con Ana Barrón y Legal. No bloquea.
- [ ] **Panel con MFA en la dirección de respaldo** — *Gerardo.* Entrar hoy en la dirección de
      Vercel para saber que sirve si hace falta. No bloquea.
- [x] **Versionar los bloques 63, 64 y 65 y el script urgente** — *Gerardo.* **Cumplida:** versionados
      y empujados en `b521dce` (el 62 ya estaba en `b072724`), con el índice
      `supabase/sql/README.md` en el estado verificado. No bloquea.

### Lunes 14-sep, antes de abrir

- [ ] **Supabase activo a las 07:45** — *Gerardo.* Abrir el panel y /registro/ antes de la primera
      familia. Si el proyecto aparece en pausa, reanudarlo desde el tablero de Supabase. No se espera
      pausa (hay uso hoy), pero el primer acceso del día es más lento (`CAPACIDAD.md` §I.10).
- [ ] **Quien no entró el viernes entra con su cuenta y su MFA** — *Lidia o Ángel, con Gerardo.*

## 6. Riesgos aceptados para el lunes y su mitigación

| Riesgo | Qué puede pasar | Mitigación |
|---|---|---|
| **Firma visible para Administración hasta L2-03** | La junta decidió que la firma solo la ven TI y contador, pero hasta L2-03 Administración y super la ven en el panel. Además, el acceso a la tabla de firmas es por fila, no por columna: consultada fuera del panel, alcanza datos técnicos (trazos, IP, navegador). | **Excepción temporal a lo decidido en la junta: la acepta Miguel, con el CP Vicente, en la sección 9.** Instrucción en la hoja: Administración no abre «Ver la firma» hasta L2-03. El panel solo usa una vista recortada (probado en E-09 y E-10); el acceso exige MFA; el personal opera solo el panel. L2-03 lo restringe la semana del 16-sep. |
| **Apellidos de la familia «Sin capturar»** | Si la caja corrige el tipo a padres, alumno u otro, el expediente queda sin apellidos: el cobro no los captura y ninguna pantalla los edita. Igual con altas de alumno anteriores al formulario de hoy. Al cobrar, Administración no tiene en el expediente los apellidos que coteja en GES, y la familia espera en ventanilla. | **Administración coteja en GES al cobrar; TI instala a quien ya pagó.** Ante «Sin capturar» se llama a Sistemas y **Gerardo** escribe un solo cambio por folio en la base real, nunca en lote (vía indicada en el bloque 65). Es la **excepción aceptada** a no tocar la base en horario. Si Gerardo no está disponible, se anota en la bitácora; mientras el campo siga vacío, la caja busca en GES por el nombre del alumno, como indica la pantalla de cobro: si aparece, cobra; **si no aparece, no se recibe el pago ni se instala el TAG** (decisión de Gerardo del 11-sep). La captura desde el panel es lote 2. |
| **Confirmación del parentesco en caja sin probar** | Si el recorrido no se hace sobre el alta (c), el cobro de un «otro familiar» llega al lunes sin haberse probado. | Hacer el recorrido sobre el alta (c). Si no se pudo, queda como riesgo aceptado en la sección 9. |
| **Sin entorno de pruebas** | Cada cambio cae directo sobre la base real. Es la causa común de los incidentes del 10 y 11-sep. | Revisión antes de aplicar, contraste con el formulario publicado y candados de sesión en los bloques delicados. **Propuesta:** lunes y martes no se aplican bloques ni se publica código en horario de atención, salvo corrección urgente o el caso de apellidos de arriba. |
| **Cuenta Free de Supabase** | Se pausa tras 7 días sin uso; guarda registros de actividad solo 1 día; la máquina es chica y el primer acceso del día es lento. | Con operación diaria no llega a 7 días; revisión a las 07:45; cualquier falla se investiga **el mismo día**, porque al siguiente ya no hay registros. Capacidad medida: 300 familias simultáneas con 0 errores (`CAPACIDAD.md` §III.3), **medida con el sitio en Vercel y sin personal en paralelo; el hosting institucional no se ha medido bajo carga**. La plataforma definitiva es el encargo de la nube. |
| **Sin aviso automático de errores** | Si el formulario falla en el teléfono de una familia, nadie se entera salvo que lo diga (`CAPACIDAD.md` §I.6). | Personal en sitio el lunes y martes; teléfonos de guardia; bitácora del día. |
| **Límite del buzón por conexión** | El buzón público admite 10 notas por hora desde una misma conexión. Con familias en el WiFi de la escuela, la undécima vería «demasiadas notas desde esta conexión». | El **alta no tiene ese límite**. El buzón es solo para actualizar o dar de baja, no para instalar; en sitio, la ventanilla atiende directo. |
| **ZK alimentado por archivo** | SATAG no da de alta ni de baja en ZK: TI exporta el archivo, lo importa en ZK y asigna los niveles de acceso por departamento. La exportación es del padrón instalado, así que **una baja en SATAG no quita el acceso en ZK**. Si un paso se omite, los dos sistemas se separan sin aviso (ya se vio en campo). | Exportación desde el panel con la plantilla oficial, que ZK aceptó el 8-sep; el recorrido de hoy la prueba de punta a punta, baja incluida. Instrucción en la hoja para toda baja. **Propuesta:** comparar al cierre de cada día los instalados en SATAG contra ZK. La conexión directa depende de la licencia que decide Contabilidad (SC-006). |
| **Corte de caja sin rol propio** | El sistema hoy permite cortar caja a admin y super, pero la decisión es que solo corte el contador, y ese rol no existe todavía. | Instrucción en la hoja del lunes: **nadie corta caja** hasta L2-02; el corte es mensual y del CP Vicente. Cada cobro queda sellado con quién lo hizo, tomado de su sesión, y la caja muestra lo esperado. |
| **Pruebas que se cierran operando** | F-01 y F-04 parciales; tandas U y A sin ejecutar. Puede aparecer un defecto que solo se ve con uso real. | F-01 cierra con el primer cobro (admin) y la primera instalación (ti) reales; F-04, con un alta real de conductor menor con gestionante en la que se compruebe la firma. Gerardo en sitio y cada hallazgo a la bitácora. |

## 7. Plan de vuelta atrás si algo falla el lunes

**Principio:** nada de lo capturado se borra. Lo que se revierte es el sitio o la regla, nunca el
expediente de una familia.

**Quién decide volver atrás — propuesta:** Miguel, a partir de lo que reporte Gerardo en sitio.

| Qué falla | Qué se hace |
|---|---|
| **Una pantalla nueva del sitio** | Se revierte el cambio en el repositorio y se vuelve a publicar (unos minutos, con la revisión automática antes de publicar). **Si lo que se revierte es el formulario de hoy, primero se regresa la base** (el bloque 65 se deshace con el mismo script urgente) **y después el código**; al revés se repite el incidente de hoy. |
| **El hosting del dominio institucional** | (1) Decide Miguel; los cambios en Cloudflare los hace quien tenga acceso a la zona (Miguel entregó esas claves el 10-sep; quién más: **pendiente de confirmar**). (2) Mientras dure, se trabaja en la dirección de Vercel, que sigue publicando desde `main`: **dirección exacta pendiente de confirmar** (el runbook cita `satag.vercel.app`) y escrita en la hoja del lunes. El QR del cartel no la sigue: se atiende en ventanilla. (3) No se quita el proxy de Cloudflare: el registro apunta al hosting de GoDaddy, así que quitarlo no manda el tráfico a Vercel y deja el certificado inválido. Apagar `DEPLOY_GODADDY` solo detiene publicaciones futuras. **Vercel y sus direcciones de acceso en Supabase no se retiran hasta que el lunes cierre estable** (en escenario B, hasta el miércoles). |
| **Una regla de hoy en la base rechaza altas o cobros** | Los bloques 62, 63 y 65 traen escrita su vuelta atrás; el 64 no (es solo el texto del aviso). El 65 se deshace rápido con el script urgente. **El 63 no se revierte en minutos**: exige revertir antes el código, rehacer a mano dos funciones con sus permisos y decidir el tipo de cada expediente «otro»; con el primer «otro» real ya no se revierte completo. Si falla el 63 en horario, ese día se atiende en papel y la reversa se hace fuera de horario. Los bloques 63, 64 y 65 y el script urgente ya están versionados y empujados (`b521dce`). Respaldo completo de la cuenta Free: **pendiente de confirmar**; lo que hay es la copia de hoy (sección 5). |
| **Apellidos de la familia «Sin capturar» al cobrar** | Administración, que coteja en GES al cobrar, llama a Sistemas; Gerardo completa ese folio con un solo cambio en la base (sección 6). Nunca en lote. TI instala a quien ya pagó. |
| **Supabase no responde o está en pausa** | Reanudar desde el tablero. Mientras, proceso en papel. |
| **Falla general sin arreglo en la mañana** | Ese día se atiende con el proceso en papel (papel → hoja de cálculo → ZK), que opera desde el 31-ago y el personal ya conoce. |

**Con las familias atendidas:**

- **Alta, cobro o instalación ya hechos en SATAG:** se conservan tal cual; folio, recibo y firma son
  reales y el cobro no se deshace. La familia no repite nada. Un TAG que ya está en ZK con su nivel de
  acceso sigue abriendo: el acceso físico no depende de SATAG.
- **Familias que lleguen durante la falla:** se atienden en papel, como hasta el 31-ago. Cómo se pasan
  después a SATAG se decide pasada la falla, no en ventanilla.
- **Alta rechazada durante la falla:** la familia ve «Recargue la página e intente de nuevo»; no se
  guarda nada salvo la imagen de su firma. Al cierre del día se anota su hora con la consulta de
  firmas huérfanas (pendiente de escribir) y después se borra.
- **Cobro rechazado durante la falla:** no queda pago ni recibo, pero puede saltarse un número de
  recibo sin dinero asociado. Se anota en la bitácora del día para que el corte lo explique.

## 8. Criterio de decisión

**GO (lunes 14-sep) solo si al cierre de hoy todo esto es cierto:**

1. La publicación de las 13:23 salió en verde (en línea desde las 13:26) y /registro/, en el dominio,
   ofrece «otro familiar» y pide los apellidos al alumno, por las dos vías (al corte, comprobada solo
   la del menor).
2. El aviso v6 se ve en el sitio y Miguel le dio el visto bueno.
3. El recorrido real completo (alta, cobro, instalación, exportación e import en ZK, baja en SATAG y
   en ZK) pasó, y Zairet y al menos uno de Lidia o Ángel entraron al panel con su cuenta.
4. No hay incidente abierto y las tres altas de la sección 5 terminaron con folio contra la base como
   quedó.
5. La hoja del lunes está entregada, con teléfonos de guardia y la dirección de respaldo.
6. Miguel dejó escritas en la sección 9 las aceptaciones: firma visible para Administración hasta
   L2-03 (con el CP Vicente), revisión de Legal que no detiene la salida y capacitación del lunes.

**Cualquier otra situación es escenario B**, incluida una casilla indispensable que no se hizo (por
ejemplo, si el viernes en la tarde no hay acceso a ZK o nadie puede recibir el efectivo), no solo una
que falló.

**No bloquean el GO** (cierran hoy o durante la semana): subir a Drive el documento del aviso para
Legal, el MFA del CP Vicente, la copia de la base, las firmas huérfanas, las filas 20, 21, 23 (salvo
lo que el criterio 6 acepta) y 24, la prueba de la dirección de respaldo, F-01/F-04 y las tandas U y
A, los cambios de usabilidad aprobados hoy (sección 3) y todo el lote 2.

**Quién comunica la decisión — propuesta:** Gerardo, por indicación de Miguel, a Zairet, Lidia,
Ángel y el CP Vicente; la hora límite la fija Miguel al decidir, antes del lunes a las 07:45.

**Escenario B (miércoles 16-sep):** el lunes y el martes se atiende con el proceso en papel, como
desde el 31-ago, y el cartel con QR no se coloca hasta el miércoles (propuesta). Esos dos días se
usan para cerrar lo que faltó con el mismo criterio. No es retroceso: su costo es de calendario, dos
días menos de operación real antes del cierre del 19-sep.

## 9. Resultado de la verificación

*Se llena al final del día. Lo anotado es el estado al corte de las 14:05.*

| Casilla | Resultado | Hora | Quién | Evidencia |
|---|---|---|---|---|
| Publicación en verde | En línea | 13:26 | Verificación por programa | /registro/ sirve el cliente nuevo con y sin parámetro de caché; `cf-cache-status: DYNAMIC`, `cache-control: no-cache`; el paquete trae `p_parentesco_otro`. Actions: la confirma Gerardo, no bloquea. |
| /registro/ ofrece «otro familiar» (menor y alumno a mano) | Parcial | Antes del corte | Gerardo (a mano) | Vía del menor: pide «Apellidos de la familia» y no avanza vacío. Faltan catálogos, tipo con parentesco en pantalla y Alumno a mano. |
| Bloque 65 aplicado con su candado (alumnos sin apellidos, consulta 3c) | Aplicado | ~14:00 | Gerardo | Primer intento detenido por el candado sin aplicar nada; segundo, con la frase: `exige_a_alumno`, `anon_ejecuta` y `authenticated_ejecuta` en true. Consulta 3c: **pendiente de anotar**. |
| Alta (a) alumno menor: folio y baja | | | | |
| Alta (b) alumno a mano: folio y baja | | | | |
| Alta (c) otro familiar: folio | | | | |
| Aviso v6 vigente en el sitio y visto bueno de Miguel | | | | |
| Zairet entra con su cuenta | | | | |
| Lidia o Ángel entra con su cuenta | | | | |
| Recorrido real: cobro (recibo, quién cobró) | | | | |
| Recorrido real: instalación (TAG, quién instaló) | | | | |
| Recorrido real: exportación e import en ZK | | | | |
| Recorrido real: baja en SATAG y en ZK | | | | |
| Quién recibió los $100 y aviso a Zairet | | | | |
| Copia de la base (hora y lugar) | | | | |
| Firmas huérfanas (total, en ventanas de incidente, borradas) | | | | |
| MFA del CP Vicente | | | | |
| Hoja del lunes entregada | | | | |
| Teléfonos de guardia | | | | |
| Cartel con QR impreso y probado | Generado en PDF carta; sin imprimir ni probar | | | |
| Expedientes de prueba dados de baja | | | | |
| Documento del aviso v6 en Drive | Parcial: en v6 y versionado; falta subirlo a Drive | | | `4f10c07`; falta compartirlo con Ana Barrón y Legal. |
| Panel con MFA en la dirección de respaldo | | | | |
| Bloques 63, 64, 65 y script urgente versionados | Versionados y empujados | | Gerardo | `b521dce` (el 62 en `b072724`); índice `supabase/sql/README.md` en el estado verificado. |
| Lunes 07:45: Supabase activo y cuenta de TI pendiente | | | | |

| | |
|---|---|
| **Decisión** | GO lunes 14-sep / Escenario B miércoles 16-sep |
| **Decide** | |
| **Fecha y hora** | |
| **Acepta: firma visible para Administración hasta L2-03** (Miguel, con el CP Vicente) | |
| **Decide: la revisión de Legal no detiene la salida** (Miguel) | |
| **Acepta: capacitación del lunes = hoja + acompañamiento en sitio** (Miguel) | |
| **Acepta: confirmación del parentesco en caja sin probar** (solo si el recorrido no usó el alta c) | |
| **Decisión comunicada a** (quién, cuándo) | |
| **Observaciones** | |
