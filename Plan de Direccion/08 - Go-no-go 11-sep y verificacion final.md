# Doc 8 — Go/no-go del 11-sep: lo que está listo, las pruebas y la limpieza para el lunes

> **Plan de Dirección · Fase 3 (Ejecución/Control).** Versión ligera del viernes 11-sep-2026 por la
> tarde; sustituye a la versión larga del mismo día.

| | |
|---|---|
| **Para** | Miguel Ángel González Pacheco — Dirección de TI (decide) |
| **Prepara** | Gerardo Sánchez — Soporte TI |
| **Se cierra** | Cuando terminen las pruebas y la limpieza, llenando la sección 9 |

---

## 1. En resumen

**Recomendación: SATAG empieza a operar el lunes 14-sep.** Esta semana pasó al dominio institucional, el alta quedó con todo lo que pidió la junta del 9-sep (incluido el tipo «Otro familiar»), la pantalla de TI quedó lista para instalar desde el celular y el aviso de privacidad v6 tiene el visto bueno de Miguel.

**La recomendación se sostiene si las pruebas de la sección 4 salen sin hallazgos graves y la limpieza queda corrida antes del lunes. Si algo grave sale, Gerardo le avisa el sábado y la salida se decide de nuevo.**

Lo que falta ya no es programar: es **probar todo el sistema con datos inventados**, usando las cuentas de quien lo va a operar; después **limpiar la base** (conservando el inventario de TAGs), e imprimir las guías y el cartel.

## 2. Lo que ya está listo

**Sitio y cuentas**

- SATAG está en https://satag.asuncionqro.edu.mx desde el 10-sep (se publica con GitHub Actions por FTPS).
- Cuentas con verificación en dos pasos: Zairet Ledezma (Administración); Lidia Segundo y Ángel Martínez (TI); Miguel González y Gerardo Sánchez (super).
- La verificación en dos pasos del CP Vicente está pendiente y no bloquea: nadie corta caja hasta que exista su rol de contador.
- El padrón del piloto se limpió completo: lo que hay hoy en la base son pruebas del equipo.

**El alta, con lo que pidió la junta del 9-sep**

- Dos apellidos obligatorios; uno solo, para extranjeros.
- «Apellidos de la familia» obligatorios para padres, alumnos (incluido todo conductor menor de edad) y otros familiares, para que Administración coteje en GES.
- Tipo Otro familiar, con su parentesco escrito a mano, en el formulario y en el panel (bloques 63, 64 y 65). La ayuda del campo conserva sus ejemplos como guía para escribir: tío del alumno, abuela, primo.
- Las mismas placas no entran en dos expedientes vivos y se guardan en mayúsculas (bloque 62).
- Catálogo al día: 45 marcas y 337 modelos, más la opción «Otro» (bloque 56).
- El aviso ya no se ve duplicado en el alta, y «Volver» desde el aviso regresa a /registro/.

**Pantalla de TI y pantalla de cobro**

- TI corrige placas, marca, modelo y color con el mismo catálogo del alta, con «Otro» para lo que no esté.
- En celular: el diálogo de confirmación cabe en la pantalla, los campos tienen contraste y los botones son lo bastante grandes para tocarlos con el dedo, sin lupa.
- «Actualizar lista», buscador en «Instalar TAG» por placas, apellidos o nombre, el número de TAG en grande al confirmar, «Instalando el TAG…» mientras guarda y un mensaje que no invita a repetir a ciegas si se cae la red.
- Cobro: confirma el tipo de usuario y el parentesco, y recuerda cotejar en GES con los apellidos de la familia a la vista.
- **Regla de GES:** Administración coteja a la familia en GES al cobrar; si la familia no aparece, no se recibe el pago ni se instala el TAG. TI no coteja en GES: instala a quien ya pagó.
- Exportación a ZKBioSecurity desde «TAGs de la escuela», con la plantilla oficial que ZK aceptó el 8-sep; el «Otro familiar» viaja en el departamento «Padres de familia».

**Aviso y reglamento**

- Aviso de privacidad v6 vigente (el aviso institucional textual más el anexo SATAG, que ya menciona el parentesco), **con el visto bueno de Miguel**.
- El documento del aviso para Legal ya está en Drive, documentado y listo para el lunes. Legal lo revisará después y lo modificará si hace falta; no se acordó una revisión previa. Si cambia algo, se publica una versión nueva y cada firma conserva la versión que aceptó.
- Reglamento: los comentarios ya se enviaron a Arturo; se espera el reglamento final.

**Guías**

- «E8 - Guía rápida para familias» y «E8 - Guía rápida del personal», en Word, al día con lo publicado hoy.
- Falta llenar sus espacios en blanco e imprimirlas (sección 6).

> **Contra qué versión se prueba.** Todo lo anterior corresponde al sitio publicado hoy con el último cambio del formulario (`a464c4a`, 11-sep 14:20). Los cambios del día que llegaron al sitio: `b13af63`, `0ef7841`, `468fbce`, `3ab2401`, `d86cbb6` y `a464c4a`; los bloques 63, 64 y 65 van en `b521dce`. Si se publica algo después, las pruebas de la sección 4 valen para esa versión nueva.

## 3. Lo que falta probar de punta a punta

Todo esto está implementado y publicado; lo que falta es recorrerlo completo con las cuentas reales:

- **Cobro con la cuenta de Administración** (Zairet, en el dominio). El perfil super se salta la revisión de permisos, así que no prueba los de nadie más.
- **Instalación con una cuenta de TI en celular** (Lidia o Ángel), que es donde se va a instalar.
- **«Otro familiar» completo:** alta con parentesco, cobro con confirmación del parentesco e instalación.
- **«Actualizar lista» y el buscador en celular**, con varios expedientes en la cola.
- **Exportación a ZK con los datos de hoy**, revisando que cada tipo caiga en su departamento.
- **Firma de un conductor menor de edad:** que quede a nombre de quien firma por él, no del menor.
- **«Alumno» elegido a mano**, sin marcar «menor de edad»: que también pida los apellidos de la familia.

## 4. Las pruebas: quién prueba qué

Todo se prueba con **datos inventados**, en el sitio real, y todo se borra con la limpieza de la sección 5. **El paso a paso no está aquí:** vive en «E8 - Hoja de pruebas del 11-sep», que es la hoja que se imprime y se le da a cada quien.

| Bloque | Qué se prueba | Quién | Con qué cuenta |
|---|---|---|---|
| A | Registro público: 7 altas de prueba | Cualquiera del equipo | Sin cuenta, en celular |
| B | Cobro y finanzas | Zairet | La suya, de Administración |
| C | Instalación del TAG | Lidia o Ángel | La suya, de TI, en celular |
| D | Buzón: actualizar y dar de baja | TI | La suya |
| E | Exportación a ZKBioSecurity | TI o Gerardo | La suya |

Los bloques van **en ese orden**: A crea los expedientes, B los cobra, C los instala; D y E al final, cuando ya haya instalaciones. Quien empiece por B o por C sin que A esté hecho encontrará la cola vacía, y eso no es una falla.

Cada quien anota los folios que generó y lo que no funcionó (qué hizo, en qué pantalla y qué mensaje salió) **y se lo pasa a Gerardo**, que lo concentra en la sección 9.

## 5. Limpieza de la base antes del lunes

**Antes de nada, la copia:**

1. Revise en el tablero de Supabase (Database > Backups) si el proyecto tiene un respaldo reciente. **No lo dé por hecho.**
2. Corra el PASO 1 de `supabase/sql/respaldo_padron_piloto.sql` (solo lee) y guarde el resultado en `Campo/datos/`, fuera del repositorio, porque son datos personales.
3. Hasta entonces, el PASO 1 de la limpieza. **No hay vuelta atrás.**

**Qué se borra:** todo lo que generaron las pruebas y cualquier otro expediente que haya en la base: altas, firmas, cobros y recibos, instalaciones, estacionamientos asignados, solicitudes y notas del buzón, y el historial de movimientos.

**Qué se conserva:**

- Los TAGs dados de alta en el inventario; los que se usaron en las pruebas quedan otra vez disponibles.
- Los catálogos: marcas, modelos, colores y estacionamientos.
- Las versiones del aviso de privacidad y del reglamento.
- Las cuentas del personal, con sus roles y su verificación en dos pasos.
- El mapa de IDs de ZK (bloque 54) se conserva: la limpieza no lo toca. Se comprueba viendo que «TAGs de la escuela» siga mostrando el mapa con su fecha de carga.

**Los folios y los recibos vuelven a empezar:** la primera alta real del lunes será **SATAG-000001** y el primer recibo el **1**, aunque las pruebas del viernes consuman decenas. Conviene avisárselo a Zairet: lo va a ver en la primera atención.

**Cuándo:** cuando terminen las pruebas y antes del lunes a las 07:45, de preferencia el fin de semana. **Después de correrla ya no se prueba en la base:** cualquier alta o cobro posterior llegaría al lunes como si fuera real.

**El cartel con QR no se coloca hasta después de la limpieza y del arranque del lunes.** Se imprime y se prueba antes. Si se pega el viernes o el sábado, una familia real puede registrarse por su cuenta, y entonces la limpieza **se detiene**: el script se niega a borrar cualquier cosa creada después del instante en que el equipo dejó de probar, que es un dato que usted teclea al correrlo. Nadie pierde nada, pero alguien tendría que decidir a mano, en fin de semana, qué hacer con ese expediente antes de poder limpiar.

**Cómo:** con el script `supabase/manual/2026-09-11_limpiar_base_para_el_lunes.sql`, en el editor SQL de Supabase, siguiendo sus pasos en orden. No use ningún otro script de limpieza del proyecto: los anteriores están escritos para el banco de pruebas y dejarían vivos estos expedientes. Condiciones que el script exige:

- **Se corre con el equipo avisado y sin nadie capturando**, no solo sin capturar después.
- **Antes del PASO 1, revise la lista de expedientes que imprime el PASO 0** y confirme uno por uno que todos son del equipo (los del apellido «Prueba»). Si aparece un alta ajena, deténgase y consulte.
- El script pide una **frase de confirmación propia, distinta de la de los scripts anteriores**; sin ella aborta sin tocar nada.
- **Las firmas se borran a mano** vaciando el bucket desde el tablero de Supabase (PASO 3), no con SQL. Antes de vaciarlo, anote cuántas imágenes hay y a qué hora se subieron (la consulta del propio PASO 3 las lista): las altas que se rechazaron durante los incidentes del viernes dejaron ahí su firma, y es la única huella de que esas familias lo intentaron. Ese conteo va a la sección 9.

**Comprobación rápida** (sin crear nada):

- Antes de correrla, anote cuántos TAGs disponibles marca «TAGs de la escuela» (en el botón «Descargar plantilla ZK»). Después el número debe ser igual o mayor, nunca menor.
- Al terminar: «Padrón completo» vacío y «En caja ahora» en ceros.
- Que las secuencias quedaron reiniciadas (el PASO 2 del script lo imprime).
- /registro/ carga los catálogos y el aviso v6 (sin enviar nada), y cada quien sigue entrando al panel.

## 6. Plan de acción

**Hoy, viernes 11 — lo que solo se puede hacer hoy, porque la gente está en la escuela:**

- El **bloque B con Zairet** y el **bloque C con Lidia o Ángel**, cada quien con su cuenta. Es lo único que no se puede recuperar el fin de semana.
- Confirmar con Miguel la salida del lunes y los riesgos de la sección 8; avisar a Zairet, Lidia, Ángel y el CP Vicente.

**Hoy si da tiempo, o el fin de semana:**

- Llenar los seis espacios «[PENDIENTE]» de la guía del personal: teléfonos y horario de guardia, el criterio de Miguel para los estacionamientos de padres, maestros y otros familiares, quién exporta a ZK y cada cuándo, y los horarios de Administración y de instalación en la guía para familias.
- Imprimir las dos guías.
- **Falta generar el cartel con QR** a https://satag.asuncionqro.edu.mx/registro/ e imprimirlo; todavía no existe el archivo. Se prueba el QR con un celular, pero **no se coloca** (sección 5).
- Regenerar «08 - Go-no-go 11-sep y verificacion final.docx» desde este documento y enviárselo a Miguel: el Word que hay en la carpeta es la versión larga de las 14:56 y no es la buena.

**Fin de semana**

- Terminar las pruebas que falten (registro, buzón, exportación a ZK, actualizar y dar de baja).
- Correr la limpieza con su copia previa, borrar a mano las firmas del almacenamiento y hacer la comprobación rápida.
- Desde ese momento, nadie da altas ni cobra en el sistema hasta el lunes, y el cartel sigue sin colocarse.

**Lunes 14**

- **07:45:** Gerardo revisa que Supabase esté activo (si el proyecto aparece en pausa, lo reanuda desde el tablero) y que el panel y /registro/ abran, sin enviar nada.
- **Guardia de Sistemas:** Gerardo en sitio lunes y martes, con los teléfonos de la guía del personal. Cada hallazgo va a la bitácora del día y se investiga ese mismo día, porque la cuenta gratuita de Supabase guarda los registros solo un día.
- **Si algo falla:** no se repite un cobro ni una instalación hasta ver si ya quedó, y nada de lo capturado se borra. Si el sitio o la base no responden y no se arregla en la mañana, ese día se atiende con el proceso en papel (papel, hoja de cálculo y ZK) que el personal conoce desde el 31-ago; volver atrás lo decide Miguel con lo que reporte Gerardo.
- **Si hubiera que deshacer un cambio del alta, primero se regresa la regla de la base y después el código, nunca al revés:** al revés se repite exactamente el incidente del viernes.
- **Sobre Vercel:** no es un interruptor. Su dirección está sin confirmar y sin probar con verificación en dos pasos, y no se alcanza quitando el proxy de Cloudflare (el registro apunta al hosting de GoDaddy y sin proxy el certificado queda inválido). Usarla exigiría un cambio de DNS que decide Miguel; mientras tanto, la caída se atiende en papel.

**Semana del 16-sep: lote 2**

- Rol contador, único que corta caja, con su tablero (y la verificación en dos pasos del CP Vicente).
- Firma manuscrita visible solo para TI y contador.
- Hora e identidad de quien instala, tomadas de su sesión.
- Catálogo con el histórico de la hoja de cálculo.
- Conciliar los manuales largos con el panel de hoy.
- Recuperar el comprobante desde el panel.
- Capturar los apellidos de la familia desde el panel.
- Cuando lleguen: publicar el reglamento final de Arturo y atender la revisión de Legal del aviso.

## 7. Lo que aprendimos esta semana

El jueves 10 y el viernes 11 hubo cambios en la base que frenaron por un rato el cobro de algunos expedientes (jueves) y el alta de alumnos (viernes); se corrigieron el mismo día. La causa fue la misma: sin entorno de pruebas, un cambio llegó a la base real antes de comprobar su efecto en el sitio publicado. Quedaron tres salvaguardas: ningún bloque se aplica antes de su revisión, toda regla nueva del alta se contrasta con el sitio ya publicado, y los bloques delicados no corren sin una frase de confirmación (el viernes esa frase detuvo un intento sin aplicar nada, como se diseñó).

## 8. Riesgos que se aceptan para el lunes

| Riesgo | Cómo se atiende |
|---|---|
| Administración y super siguen viendo la firma hasta el lote 2, aunque la junta decidió que solo la vean TI y contador. | Administración no abre «Ver la firma»; se corrige la semana del 16. |
| Un expediente puede llegar a caja con los apellidos de la familia «Sin capturar». | Administración busca en GES por el nombre del alumno; si no aparece, no se cobra ni se instala. |
| ZK se alimenta por archivo: una baja en SATAG no quita el acceso en ZK. | Toda baja se repite en ZK: se quita de los niveles de acceso y se mueve al departamento BAJAS. |
| Nadie corta caja hasta que exista el rol de contador. | El corte es mensual y del CP Vicente; cada cobro queda sellado con quién lo hizo. |

Los otros dos riesgos conocidos (sin entorno de pruebas y cuenta gratuita de Supabase) se atienden como dicen las secciones 6 y 7.

## 9. Resultado

| | |
|---|---|
| **Pruebas hechas** (fecha, quién, folios de prueba, hallazgos) | |
| **Copia previa** (respaldo de Supabase revisado; JSON guardado en Campo/datos/) | |
| **Limpieza hecha** (fecha y hora, quién, TAGs disponibles antes y después) | |
| **Firmas borradas** (cuántas imágenes había y a qué horas se subieron) | |
| **Decisión con Miguel** (salida el lunes 14-sep: sí o no; acepta los riesgos de la sección 8) | |
| **Comunicada a** (Zairet, Lidia, Ángel y CP Vicente; cuándo) | |
| **Observaciones** | |
