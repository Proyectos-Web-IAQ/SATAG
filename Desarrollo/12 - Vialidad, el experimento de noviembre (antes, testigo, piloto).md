# Vialidad › Seguir · el experimento de noviembre

*3-nov-2026 · Fase 2 de tres (la fase 1 es el documento 10). Lo que se compara, cómo se cuenta un día y qué no se mide. Es la única definición que leen el contador y Dirección.*

## 1. El calendario

| Fase | Días | Qué es |
|---|---|---|
| **Antes** (línea base) | 3 al 20 de noviembre | La tarde como es hoy, con los horarios que dio la escuela. |
| **Testigo** | 30 de octubre, 2 y 16 de noviembre | Días hábiles sin alumnos: solo el personal cruza la pluma. Dicen cuánto de la tarde es del colegio y cuánto es de la ciudad. |
| **Piloto** | 23 de noviembre al 4 de diciembre | Solo si Dirección autoriza una medida antes del 23. Mientras no la haya, hereda las horas de salida de antes. |

Lunes a jueves y viernes se comparan por separado: el viernes no hay talleres y la tarde es otra. El calendario vive en `lib/vialidad.ts` (`CALENDARIO_VIAL`); la medida del piloto y las horas que cambie se escriben ahí cuando Dirección decida.

Horas de salida por sección (las que dio la escuela el 27-oct): comunidad infantil 13:15, preescolar 13:25, primaria 14:10, secundaria y preparatoria 14:35.

## 2. Los cinco números de la puerta

Cada celda de la pantalla es la **mediana entre días**, con el menor y el mayor, y «n de m días hábiles»: cuántos días hay con bitácora completa de cuántos tiene la fase. Un número sin su cobertura invita a leer de más.

| Qué | Cómo se calcula | Fuente |
|---|---|---|
| **Minutos dentro por familia** (la cifra que manda) | Media de (sale − entra) de los papás ligados a GES que entran hasta **60 min antes de la salida de la sección del hijo menor** (por quien vienen) y salen entre 13:00 y 16:00. Es la misma regla del buscador de combinaciones del 30-oct (hoy 32 min de lunes a jueves). Los papás sin familia en GES se cuentan aparte y no entran al promedio. | ZK + GES |
| Cajones libres en E2 de 14:35 a 15:00 | Cupo de E2 menos lo más que hay dentro en esa franja. Solo estancias con entrada y salida leídas, así que es un **techo**. | ZK |
| Lo más que sale por la pluma de E2 en 5 min | Máximo de salidas de E2 por celda de 5 min, de 12:30 a 16:00. | ZK |
| Lo más que llega a E2 en 5 min | Máximo de entradas, igual. Es el límite que el buscador no deja empeorar: más llegadas juntas son más fila afuera. | ZK |
| E1 en su momento más lleno | Máximo dentro en E1 en el día. | ZK |

Y tres filas que hoy están vacías a propósito, para que se vea lo que falta:

| Qué | Cuándo entra |
|---|---|
| La fila afuera (autos esperando antes de la pluma) | Con el botón «fila hasta…» del portero en la caseta. Nadie la mide hoy; es la causa, no el síntoma. |
| Índice pico de los accesos en la salida, minutos extra en el peor momento, accesos contra el control | Con el bloque 106: las muestras de Google Routes del muestreador entran a la base cada semana desde Datos, como los exports de ZK. |

## 3. Qué día cuenta

Un día cuenta si su bitácora **empieza antes de las 09:00, termina después de las 15:30**, trae al menos 20 accesos y **no es el día en que se exportó** (ese día la jornada seguía corriendo). Un día que no cumple aparece en «Día por día» con su motivo y suma en «m», no en «n».

Esta regla es propia de Seguir y no la del tablero: `clasificarDias` (`lib/estacionamiento.ts`) tira el primer y el último día de lo que recibe y excluye los días con pocos accesos. Rebanando la bitácora por fase se habrían perdido el 3-nov, el 20-nov, el 23-nov y el 4-dic, y los testigos habrían quedado fuera por tener solo personal. Por eso las estancias se emparejan **una sola vez** sobre toda la ventana y después se agrupan por día.

Consecuencia práctica: el export de ZK de un viernes tiene que hacerse **después de las 21:00** o al día siguiente; si no, ese viernes queda como «el archivo termina a las HH:MM».

## 4. Lo que la pantalla no hace

- No concluye. Las frases son de fuente y de cobertura. Las metas las fija Dirección.
- No escribe nada: Consulta mide. Cuando haya medida autorizada, se escribe en el calendario del código, no en una tabla.
- No ve la calle ni la fila. La calle es el síntoma (termómetro antes y después); la fila es la causa y nadie la mide todavía.

## 5. Dónde vive

- `lib/vialidad.ts` — pura, con pruebas en `pruebas-unitarias/vialidad.test.ts`: calendario (`faseDe`, `tipoDiaDe`, `diasHabilesDe`, `horaSalidaDe`) y medición (`medirSeguimiento` → por día y resumen por fase y tipo de día).
- `components/admin/VialidadSeguir.tsx` — la pantalla. Reemplaza a la beta de Vialidad (minutos capturados a mano en el navegador), que se borró.
- `components/admin/VistaEstacionamiento.tsx` — calcula `seguir` una vez por sesión (memoria del módulo) y lo pasa a la pantalla; sin GES la cifra de familias queda vacía y se dice.

## 6. Siete pantallas (6-nov)

Vialidad dejó de ser solo Seguir. Ahora son siete pantallas, una por pregunta de quien decide, y Seguir es la sexta:

| Pantalla | Pregunta | Qué muestra | Estado |
|---|---|---|---|
| 1. El sistema | Con qué modelo se lee | Llegan → se guardan → salen; la fila afuera (causa) y la calle (síntoma); la cuenta autos dentro = llegan por minuto × minutos que se queda cada uno, y las tres palancas | Con datos |
| 2. Qué pasa | ¿Qué pasa? | Curvas acumuladas de E2 (llegaron, salieron y el tope «salieron + cupo») y la tarde cada 5 minutos con quién sale | Con datos; falta la columna de la calle |
| 3. Por qué | ¿Por qué? | Quién ocupa E2 y E1 a las 14:40 por la salida de su hijo mayor; qué parte tiene hermanos | Con datos |
| 4. Cuánto es nuestro | ¿Por qué? | Calle en días con clases, testigos y control | Espera el bloque de la calle |
| 5. Qué pasa si | ¿Qué pasa si? | El simulador | Espera reescribirse para el panel |
| 6. Cómo sabremos si sirvió | ¿Sirvió? | Seguir | Con datos |
| 7. Qué falta autorizar | — | La fila, el testigo del 16, el circuito, la calle, la medida | Fija |

**La cuenta (ley de Little).** No es una predicción: sobre una tarde completa se cumple siempre, porque es conservación. Sirve para ordenar las palancas: bajar los que llegan por minuto (escalonar, solo si las familias ajustan), bajar los minutos (que lleguen cuando sale el hijo, recogida única) o subir el tope (el personal a E1, que no toca la cuenta).

**Las curvas acumuladas** cuentan cada paso por la pluma; lo demás de Vialidad cuenta solo estancias con entrada y salida leídas. Por eso la curva puede marcar más autos dentro que los cajones: son salidas que la pluma no leyó. La pantalla lo dice cuando pasa.

**Los días** del flujo son los de lunes a jueves con la tarde completa en la bitácora guardada (la misma regla de la sección 3), fuera de los testigos. Código: `medirFlujo` en `lib/vialidad.ts`, con pruebas en `pruebas-unitarias/vialidad.test.ts`; la pantalla es `components/admin/Vialidad.tsx`.

## 7. La calle y el simulador, dentro (6-nov, tarde)

- **La calle, bloque 107.** `vial_rutas` y `vial_muestras` (llave ruta, fecha, ranura: recargar no duplica), lectura ti/contador/super con MFA, escritura solo por `cargar_muestras_vial` (ti). Se carga cada semana en Datos › Archivos de ZK con los `trayectos-AAAA-MM-DD.csv` del muestreador (`components/admin/CargaVial.tsx`, `lib/vial/trayectos.ts`). `medirCalle` (lib/vialidad.ts) usa las reglas de la página de Análisis Vial: rutas de llegada con tramo libre de 2 minutos o más, control aparte, ventana 13:50–15:30, día válido con 7 rondas. Llena la pantalla 4, la columna de la calle de la 2 y las filas de la calle de Seguir. Si el bloque no está aplicado, la pantalla lo dice.
- **El simulador.** `lib/simulador.ts` y `components/admin/SimuladorVialidad.tsx`, portados del mapa con la misma lógica (paridad con las celdas del mapa: hoy 32 min y 17 libres; Propuesta 1, 29 y 53). Las celdas salen de las mismas estancias del flujo y de GES; sin GES la pantalla lo dice.

## 8. Lo que sigue

La medida del piloto ante Dirección y la fila (el botón del portero).
2. La medida del piloto: la Propuesta 1 del buscador (preescolar +15, secundaria −15, 30 del personal a E1) como lo que se pide a Dirección, una sola, la semana del 16-nov.
3. La fila: el botón del portero.
