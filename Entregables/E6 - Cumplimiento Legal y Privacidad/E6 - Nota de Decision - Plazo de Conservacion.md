# Nota de decisión — Plazo de conservación de los expedientes SATAG

> **Para:** Dirección del IAQ · Asesoría Legal
> **De:** Soporte TI — Gerardo Sánchez
> **Fecha:** 03-ago-2026
> **Decide:** Dirección / Legal · **Prepara:** TI · **Opera:** Administración
> **Corresponde a:** fila 4 del tablero de [Decisiones Legales Pendientes](E6%20-%20Decisiones%20Legales%20Pendientes.md)

---

## 1. Qué se pide decidir

**Cuánto tiempo conserva el Instituto los expedientes del TAG vehicular después de que el TAG se
da de baja, y qué se hace con ellos al vencer ese plazo.**

Es una sola decisión con dos partes: el número de años y quién ejecuta la supresión.

## 2. Por qué no puede esperar

El aviso de privacidad **ya publicado en el sistema** promete, en su apartado de conservación:

> «Al agotarse la finalidad y el plazo aprobado, los datos se suprimirán o disociarán de forma
> segura, incluyendo la eliminación de firmas en almacenamiento cuando corresponda.»

Hoy **no existe ese plazo aprobado**, y tampoco un procedimiento que ejecute la supresión. El
aviso compromete al Instituto a algo que el Instituto todavía no ha definido. Mientras siga así,
la aprobación del aviso por parte de Legal quedaría firmando una promesa sin contenido.

Hay además un matiz de redacción que conviene corregir en la misma versión. El borrador interno
decía «los datos **deberán** suprimirse» —una obligación del Instituto hacia sí mismo— y el texto
que se publicó dice «los datos **se suprimirán**» —un compromiso frente a la persona titular—.
La segunda forma es más exigente. Es defendible, pero sólo si hay un plazo y alguien encargado
de cumplirlo.

Ninguna de las dos cosas depende del desarrollo del sistema: el sistema ya tiene los campos donde
anotar la fecha de bloqueo y la de supresión. Falta la decisión institucional.

## 3. Qué dice el marco legal

De la [investigación legal del proyecto](../../Investigacion/02%20-%20Investigacion%20Legal%20SATAG.md):

- **No hay un plazo fijo para particulares.** La ley obliga a que exista uno, definido por el
  responsable en función de la finalidad, no a que sea de una duración concreta.
- La LFPDPPP usa **72 meses (6 años)** como referencia al hablar de incumplimientos contractuales
  (art. 10).
- Para evidencia firmada suele invocarse por analogía el **art. 49 del Código de Comercio (10
  años)**. La propia investigación advierte que la analogía es débil en este caso: el Instituto no
  celebra un acto mercantil con el reglamento de estacionamiento.
- La ley pide expresamente **no conservar indefinidamente datos de menores** «por si acaso». Una
  parte importante de los conductores de SATAG son alumnos.

## 4. Recomendación

**Un plazo único de 6 años contados desde la baja del TAG, para todo el expediente, incluida la
evidencia de firma.**

Al darse de baja, el expediente pasa a **bloqueado**: deja de usarse en la operación diaria y sólo
queda disponible para aclaraciones, responsabilidades o requerimientos. Cumplidos los 6 años, se
suprime, incluida la imagen de la firma en el almacenamiento privado.

Por qué 6 y no 10:

1. Es el plazo que la propia ley usa como referencia, y cubre de sobra la vida útil de una
   aclaración sobre un TAG de estacionamiento escolar.
2. Diez años se justifican por la fuerza probatoria de la firma en actos mercantiles, y éste no lo
   es. Conservar una década los datos de un alumno tiene un costo de privacidad que el beneficio
   probatorio no compensa.
3. Es un solo número. Un plazo único se puede cumplir con una revisión anual y una lista; dos
   plazos distintos obligan a construir un mecanismo intermedio (ver el apartado 5).

**Si Dirección prefiere máxima fuerza probatoria**, la alternativa coherente es **10 años para
todo el expediente**, no 10 sólo para la firma. La razón es técnica y está en el apartado
siguiente.

## 5. Advertencia técnica sobre la opción de dos plazos

La recomendación anterior del tablero contemplaba 6 años para los datos operativos y 10 para la
evidencia de firma. **Esa combinación no es gratuita.** En la base, la evidencia de firma está
atada al expediente con borrado en cascada: al eliminar el expediente se elimina también su
aceptación, su firma y su hash.

Conservar la firma cinco años más que el expediente exigiría **no borrar** el expediente a los 6
años sino *disociarlo* —vaciar los datos personales y dejar la fila viva sosteniendo la
evidencia—, lo que implica una rutina nueva que hoy no existe y que habría que construir, probar y
documentar. Es viable, pero es trabajo adicional posterior al cierre del proyecto.

Por eso las dos opciones limpias son **6 años para todo** (recomendada) o **10 años para todo**.

## 6. Qué pasa una vez decidido

Nada de esto bloquea la entrega del sistema; se hace después y por su cuenta.

| Paso | Quién | Cuándo |
|---|---|---|
| Registrar la decisión en el tablero y publicar la v3 del aviso con el plazo escrito | TI | Al recibir la decisión |
| Que la baja calcule y guarde la fecha de supresión en el expediente | TI | Con el lote de arreglos posterior a las pruebas |
| Revisar una vez al año los expedientes que hayan cumplido el plazo y ejecutar la supresión | Administración pide · TI ejecuta | Anual, a partir del primer aniversario |

Dos avisos para quien publique la v3 del aviso:

- Cambiar el texto del aviso **obliga a resembrar el banco de pruebas**, porque las firmas de
  prueba guardan la huella del texto anterior. Hay que hacerlo antes de volver a certificar.
- La publicación de una versión nueva tiene hoy un fallo conocido que borraría el aviso corto del
  formulario sin dar error. Está identificado y va corregido en el mismo bloque de base que se
  aplicará al terminar las pruebas. **No publique la v3 antes de ese bloque.**

## 7. Decisión

| | |
|---|---|
| **Plazo aprobado** | ☐ 6 años desde la baja (recomendado) · ☐ 10 años desde la baja · ☐ Otro: ______ |
| **Área responsable del proceso** | |
| **Nombre y cargo de quien aprueba** | |
| **Fecha** | |
| **Firma** | |

> Al recibir esta decisión, TI la registra en la fila 4 del tablero, la refleja en el aviso de
> privacidad y la marca como **Decidido**.
