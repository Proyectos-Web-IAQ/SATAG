# Dónde vamos · jueves 10 de septiembre, por la tarde

Nota de retomada. Bórrela cuando ya no sirva.

## Lo primero, porque hay algo roto

El bloque 55 quedó aplicado, y su parte B dejó una restricción que **congela expedientes**:

    reg_apellidos_familia_requeridos ... not valid

Se creyó que `not valid` dejaba la restricción sin efecto sobre las filas que ya existían. Es falso.
`not valid` solo se salta la revisión retroactiva **una vez**; el CHECK se evalúa en cada insert **y
en cada update posterior**, sobre la versión nueva completa de la fila.

`apellidos_familia` la escribe un solo sitio en todo el sistema: `crear_registro`, el alta pública.
Ninguna pantalla del panel la captura ni la corrige. Y hay once bloques que hacen `update registros`
(29, 32, 33, 38, 40, 42, 46, 49, 50, 52, 53). Resultado: todo expediente con `tipo_usuario =
'padres'` y el campo vacío queda muerto para todos los RPC. No se instala el TAG, no se cobra, no se
da de baja, no se actualizan datos. Solo se rescata con un UPDATE a mano en el editor SQL.

El peor caso es justo el que se habló en la junta del 9: el empleado que también es papá. El
expediente nace como `maestro`; Administración lo corrige a `padres` en la caja, y `registrar_pago`
hace `update registros set tipo_usuario = ...`. Revienta el CHECK y se revierte la transacción
entera: no hay pago, no hay folio, no hay corrección. Y no existe pantalla donde llenar el campo.

Hay dos remedios, y el orden importa poco porque el segundo incluye al primero:

- `supabase/manual/2026-09-10_URGENTE_soltar_apellidos.sql` — una línea, suelta la restricción y
  devuelve el sistema al aire en el acto. Se escribió para cortar la hemorragia.
- **Bloque 58** — la solución de fondo: suelta la restricción Y devuelve el control al alta, dentro
  de `crear_registro`, con un mensaje en español en vez de un error de Postgres en inglés. Misma
  firma de 27 parámetros, `create or replace` en sitio: sin drop, sin regrant, sin `notify`.

Mientras ninguno de los dos corra, esto sigue vivo.

`supabase/manual/2026-09-10_diagnostico_apellidos.sql` solo lee: dice si la parte B ya está aplicada
y a cuántos expedientes alcanza. Puede correrlo antes o después, no cambia nada.

## Lo que quedó hecho hoy

- **Bloques 55, 56 y 57 aplicados.** 55, apellidos de la familia. 56, catálogo de marcas 2024-2026:
  quedaron 45 marcas y 337 modelos. 57, aviso de privacidad versión 3, vigente, con los acentos
  verificados y sin mojibake.
- **Los textos quedaron justificados**, en SATAG y en SEVAD. Solo CSS, en los dos `app/globals.css`.
  Revisado a 360, 390, 768 y 1280 px, y aprobado. El justificado entra a partir de 481 px; debajo
  vuelve a bandera izquierda a propósito, porque en la columna de un teléfono el renglón lleva tan
  pocas palabras que estirarlo lo agujerea. El acceso del personal y el panel de SATAG no se
  tocaron. **Ya está publicado.**
- **El aviso del paso 1 ya se lee como resumen** y el simplificado bajó al pie como burbuja que se
  cierra. Con eso muere la pregunta de si el aviso estaba duplicado: no lo está. Son el simplificado
  y el integral, y la ley pide los dos.
- **El aviso cambia de base.** Decisión de la tarde: el aviso de SATAG pasa a ser el **aviso
  institucional que pasó Ana**, textual y entero, más un anexo con lo que SATAG agrega (vehículo,
  TAG, apellidos de la familia, firma electrónica y su evidencia, nube y cobro). Lo publica el
  **bloque 60**, como versión 4. El institucional ya confirma responsable, los cinco años, los
  dieciséis días de videovigilancia y el correo; el texto extraído está en
  `_Legal - fuentes oficiales/aviso-institucional-IAQ.txt`, fuera del repo.
  **El bloque 59 quedó obsoleto: parchaba el texto propio que se va a reemplazar. No lo corra.**

**Ya publicado**, en `origin/main` desde las 14:37 (`09a2ed5`, `6b9b991`, `6523457`, `3f43404`,
`410ad0c`): el justificado, el campo de apellidos en el alta y la revalidación del vehículo al
instalar —que TI pueda corregir placas, marca, modelo y color sin salirse del flujo de instalación,
reusando el RPC `actualizar_registro_con_estacionamiento`, que ya existía—. `npm run verificar`
pasa limpio.

## La secuencia. No la reordene

### HOY, jueves 10

**1. El bloque 58, en el editor SQL. Antes que nada.**
Fuera de orden: cada minuto sin él es un minuto con expedientes de padres congelados. Si mañana
alguien cobra y corrige un tipo a `padres`, la caja se cae y el cobro no queda registrado.

**2. El bloque 60** (el aviso institucional de Ana, textual, más el anexo de SATAG, como v4).
**No el 59, que quedó obsoleto.**
Fuera de orden: tiene que estar **antes de la primera familia real**. El texto del aviso se sella en
el hash de la aceptación al firmar. Una familia que firme con el v3 incompleto queda con esa
evidencia para siempre, y corregirlo después obliga a una versión 4, no a un parche.

**3. El cliente ya se publicó** —apellidos en el alta, revalidación del vehículo y justificado—,
a las 14:37 por Actions vía FTPS. Este paso ya está hecho; queda escrito por el orden.
Si alguna vez se restaura un respaldo anterior al 55, o se apunta `NEXT_PUBLIC_SUPABASE_URL` a otro
proyecto, la dependencia es **la parte A completa del bloque 55**, no solo la columna: el cliente
publicado manda `p_apellidos_familia` SIEMPRE, también en null para maestro, alumno y admin
(`lib/supabase/api.ts`), y PostgREST resuelve la función por el conjunto exacto de nombres de
argumento. Contra una base con la función de 26 parámetros, **muere toda alta** —no solo las de
padres— con `PGRST202`, después de que la familia ya firmó en pantalla; y además `SELECT_REGISTRO`
pide `apellidos_familia`, así que el padrón desaparece del panel para los tres roles. Agregar solo
la columna no arregla nada: hace falta la función de 27 parámetros y su `notify pgrst`.

**4. Comprobar en el sitio publicado**: que un alta de padres pida y guarde los apellidos, que el
panel liste el padrón y que al instalar se pueda corregir el vehículo.
Fuera de orden: si lo comprueba después de limpiar el padrón, se queda sin datos con qué probar.

### VIERNES 11

**5. El reglamento v3 a Arturo, antes de las 12:00.** Tope duro, y ajeno a lo técnico.
Fuera de orden: pasadas las 12:00 ya no le queda día hábil para revisarlo antes del lunes.

**6. El arnés de Playwright**, en «SATAG - Evidencia de pruebas/arnes», fuera del repo a propósito.
Actualizar los guiones que llenan el alta **antes** de correr nada: el paso 0 ahora exige los
apellidos de la familia, y el tipo por omisión es `padres`.
Fuera de orden: cualquier guion suyo que dé de alta un expediente se queda atorado en el paso 0 y
usted va a creer que el sitio está roto. Y si lo corre **después** de la limpieza, vuelve a ensuciar
el padrón con expedientes de prueba.

**7. La limpieza del padrón**, con `limpiar_padron_piloto.sql` y su candado
`set satag.confirmo_borrado`. Es el último acto sobre los datos. Está a medias: el respaldo ya se
corrió; falta la limpieza con la corrección de las comprobaciones diferidas, retirar del inventario
los TAGs instalados y borrar las firmas del almacenamiento desde el panel, con la lista del
respaldo.
Fuera de orden: si limpia antes de los pasos 4 y 6, se queda sin banco de prueba. Si no limpia antes
del lunes, los 19 expedientes del piloto se mezclan con familias reales y el primer folio real no
será `SATAG-000001`.

**8. La cuenta de Zairet Ledezma** (zairet.ledezma@asuncionqro.edu.mx, rol administrador), con
contraseña temporal desde el panel y activación acompañada. El rol viaja en el JWT: tiene que cerrar
sesión y volver a entrar para que el panel le abra.
Fuera de orden: si lo deja para el lunes, la primera vez que ella entra es delante de las familias.

**9. Los scripts que corren por su cuenta**: `supabase/manual/2026-09-10_cronoma_cierre_*.sql`, en el
orden lectura, carga y el rollback a la mano, y `2026-09-10_verificar_bloque51_buzon.sql`.
Fuera de orden: cargar sin haber leído antes es cargar a ciegas, y el rollback es lo único que lo
salva.

### LUNES 14

**10. Antes de abrir**, en cinco minutos: padrón vacío, aviso vigente en versión 3, el sitio responde
en satag.asuncionqro.edu.mx y el panel lista para TI, Administración y Dirección.
Fuera de orden: si abre sin mirar, el primer aviso de que algo falta se lo da una familia en la
puerta.

**11. La primera familia real.** Desde aquí el aviso y el reglamento quedan sellados en cada firma:
ya no se corrige un texto, se publica otra versión.

**12. Vercel se apaga** como rollback cuando el lunes corra estable. Hasta entonces sigue arriba.

## Lo que se movió al lote 2

- **Capturar los apellidos de la familia desde el panel.** Hoy solo los escribe el alta. El bloque 58
  mueve la exigencia al alta, así que ya no congela nada; una pantalla para corregirlos desde el
  panel es comodidad, y no cabe antes del lunes.
- ~~La casilla de un solo apellido~~ — **hecha el 10-sep por la tarde**, antes de cerrar: casilla
  «tiene un solo apellido en su identificación oficial» para conductor y gestionante. Oculta el
  materno, lo limpia, y la etiqueta pasa de «Apellido paterno» a «Apellido». Solo cliente: el
  materno ya era opcional en `crear_registro`.

## Una cosa que le van a preguntar

Durante la presentación del 9 se dieron de alta en vivo Miguel, el CP Vicente, Zairet y Arturo.
Avíseles que vuelvan a registrarse el lunes: la limpieza se los lleva. Para el acta es buen dato: la
lámina de «Pruébelo ahora» funcionó.

**El conteo del padrón cambió durante la tarde y no está confirmado.** El runbook decía 19
expedientes; el panel mostraba **2** al capturar la pantalla, ya entrada la tarde del 10. No sé cuál
de las dos cifras corresponde a qué momento ni qué las movió. Antes de dar un número en el acta,
cuéntelos: `select count(*) from registros;`.
