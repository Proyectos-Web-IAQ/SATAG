# Campo — Primer lunes en producción (14-sep-2026)

Primer día de instalación de TAGs con SATAG y con familias reales. Continúa
[00 - Observaciones del proceso en papel](00%20-%20Observaciones%20del%20proceso%20en%20papel.md), que midió
la línea base del proceso anterior.

**Regla de este documento:** cero datos personales de las familias. Ni nombres ni placas; los
expedientes se citan por folio. **Fuentes:** la consulta de solo lectura
`supabase/manual/2026-09-15_lectura_primer_lunes.sql`, corrida el 15-sep contra producción (su
resultado vive en `Campo/datos/`, fuera del repositorio), y el relato de Gerardo del 15-sep.

---

## En resumen

- **15 TAGs instalados ese lunes: 7 con SATAG y 8 con el proceso en papel**, que siguió en paralelo.
- **Los 7 de SATAG completaron el ciclo entero**: alta → cobro → TAG instalado. Ninguno se quedó a
  medias y ninguna familia abandonó un alta: no hay firmas sin expediente después de abrir.
- **Del envío del formulario al TAG instalado: mediana de 8 minutos** (entre 5 y 8). El cobro llegó
  1–2 minutos después del envío y la instalación 3–7 minutos después del cobro.
- **Nada se volvió a capturar.** Los 7 TAGs llegaron a ZKBioSecurity con una sola importación al
  final del día.
- **Lo único difícil fue ZK**: activar los niveles de acceso de los TAGs precargados. Se resolvió ese
  mismo día (sección 4).

## 1. Las cifras

| | |
|---|---|
| Altas por el formulario público | 7 (6 padre/madre/tutor, 1 maestro) |
| Cobradas por Administración | 7, con su cuenta; tipo confirmado en caja en las 7 |
| Instaladas | 7, todas con TAG de la escuela (ninguno propio) |
| Menores de edad / otro familiar | 0 / 0 |
| Apellidos de la familia sin capturar | 0 |
| Caja | $700 en 7 cobros, sin cortar (el corte es mensual) |
| Buzón | 0 notas |
| Intentos bloqueados del buzón público | 0 |
| Inventario de TAGs al 15-sep | 26: 19 disponibles y 7 asignados |

**Cuándo llegaron** (hora de Querétaro): 2 altas entre 11:00 y 12:00, 1 entre 12:00 y 13:00, y
4 entre 13:00 y 14:00. Primera a las 11:15 y última a las 13:57. Los cobros siguen exactamente la
misma distribución.

**Cada expediente.** La hora de instalación es aproximada (≈): la base guarda la fecha y no la hora,
así que se toma de cuándo se asignó el estacionamiento, que ocurre al instalar. Resolverlo es la
tarea L2-04.

| Folio | Tipo | Envío | Cobro | Instalación | Envío → TAG | Acceso |
|---|---|---|---|---|---|---|
| SATAG-000001 | Padres | 11:15 | 11:17 (+2) | ≈11:23 (+6) | 8 min | E1+E2 |
| SATAG-000002 | Maestro | 11:42 | 11:43 (+1) | ≈11:50 (+7) | 8 min | E1 |
| SATAG-000003 | Padres | 12:49 | 12:51 (+2) | ≈12:57 (+6) | 8 min | E1+E2 |
| SATAG-000004 | Padres | 13:23 | 13:24 (+1) | ≈13:29 (+5) | 6 min | E1+E2 |
| SATAG-000005 | Padres | 13:34 | 13:35 (+1) | ≈13:40 (+5) | 6 min | E1+E2 |
| SATAG-000006 | Padres | 13:40 | 13:42 (+2) | ≈13:45 (+3) | 5 min | E1+E2 |
| SATAG-000007 | Padres | 13:57 | 13:58 (+1) | ≈14:05 (+7) | 8 min | E1+E2 |

Cobró Administración los 7. Instaló Sistemas: Gerardo 6 y Miguel 1, los dos con perfil *super*.

## 2. Contra el proceso en papel

La línea base del 31-ago y el 1-sep (observación 5 de `00`) fue de **38 TAGs en dos jornadas**:
unos 12 minutos por TAG en campo y otros **12 minutos por TAG solo para volver a capturarlo** en la
hoja de cálculo y en ZK.

Con SATAG, el lunes:

- **La segunda jornada desaparece.** El titular captura sus datos una vez y validados, y ZK los
  recibe por archivo con una sola importación al final del día (7 TAGs de un jalón).
- **En campo: unos 7 minutos por familia**, desde que envía el formulario hasta que el TAG queda
  pegado y cobrado.

**Cuidado al comparar las dos cifras de campo.** El tiempo que la familia tarda en *llenar* el
formulario no está en la base, porque el alta se sella al enviarse. La cifra de papel sí incluye
llenar la hoja. Lo que sí es comparable sin matices es la recaptura: ~12 minutos por TAG antes, cero
ahora.

Los 8 TAGs del proceso en papel de ese mismo día siguen el camino de siempre: hoja, hoja de cálculo
y ZK.

## 3. Lo que se observó

1. **Rápido y sencillo para las familias.** De dos padres a quienes se les preguntó al instalar,
   los dos dijeron que el trámite fue más rápido y que el formulario fue fácil de llenar.
2. **Un caso que el papel no distinguía se guardó bien.** Firmó el hermano del padre de familia,
   pero el vehículo lo maneja el padre, que es quien lo dio de alta. El expediente quedó con el padre
   como conductor y el tío como gestionante que firma. Es la separación conductor/gestionante del
   modelo de datos funcionando en un caso real.
3. **La corrección de placas en campo funcionó.** En SATAG-000002 no se sabían las placas al dar de
   alta. TI las corrigió con «¿Los datos del vehículo no coinciden?» antes de instalar, y la
   corrección quedó en la bitácora del expediente. Además de ese caso, cada instalación dejó su
   propio movimiento en la bitácora.
4. **Administración avisaba a TI por teléfono después de cada cobro**, y le daba pena llamar tan
   seguido. Preguntó si «con la app» se podía ver. Hoy el panel no avisa: el número de «Instalar TAG»
   solo cambia si alguien tiene la página abierta y la refresca, así que la llamada seguía siendo lo
   más efectivo. De aquí salen dos cambios del 15-sep: el **aviso en el espacio de Google Chat de
   TI** en cada cobro (bloque 66) y el **panel instalable como app** en el celular y la computadora.
5. **ZK: los TAGs precargados no quedaban activos.** Importar el stock directo al departamento
   Padres de familia no aplicaba sus niveles de acceso, porque el importador de ZK nunca los asigna.
   Se corrigió ese mismo día:
   - el stock entra al departamento **STOCK SATAG**;
   - con los TAGs ya dados de alta (fueron 20), se quitan y se vuelven a poner los niveles de ese
     departamento, y todo el stock queda activo.

   El detalle está en [01 - Puente SATAG-ZKBioSecurity](01%20-%20Puente%20SATAG-ZKBioSecurity.md).
6. **Quién puede entrar a cada estacionamiento depende de quién es el titular.** El maestro de
   SATAG-000002 quedó solo con E1 porque se le preguntó su sección en persona: el alta no la pide.
   Ese criterio (preescolar y primaria E2; secundaria y preparatoria E1) es lo que pide SC-029 (L2-09).
7. **Hallazgos de Miguel al entrar el 14-sep, que se volvieron SC-029:** la sección del maestro en
   el alta, el aviso de privacidad justificado, el tipo de usuario sin valor por omisión y una
   etiqueta que nombre al conductor. Los tres últimos se publicaron el 15-sep.

## 4. Lo que queda abierto por este día

- **La instalación con una cuenta de TI no se ha probado en producción.** Las 7 las hizo Sistemas
  con perfil *super*, que se salta la revisión de permisos. Se cierra con la primera instalación de
  Lidia o Ángel con su propia cuenta.
- **Hora e identidad de quien instala** desde la sesión (L2-04). Hoy la hora es aproximada y el
  nombre se teclea.
- **El almacenamiento de firmas no quedó vacío tras la limpieza.** Al 15-sep hay 18 imágenes:
  - 7 de las familias del lunes;
  - 11 sin expediente: 1 del 18-ago, 5 del 10-sep, 3 del 11-sep y 2 del 14-sep (07:57 y 08:05,
    antes de abrir).

  Ninguna es posterior a la apertura. Las del 10 y 11-sep coinciden con los días de los incidentes
  del alta: pueden ser pruebas o altas rechazadas. Quedaron anotadas en la sección 9 del go/no-go y
  se borraron a mano el 15-sep, porque no tenían expediente ni finalidad.
