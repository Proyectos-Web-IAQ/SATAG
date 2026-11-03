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

## 6. Lo que sigue

1. **Bloque 106** (`vial_rutas`, `vial_muestras`, `vial_importaciones`, RPC `cargar_muestras_vial`) y la carga semanal de los `trayectos-AAAA-MM-DD.csv` desde Datos › Archivos de ZK. Con eso se llenan las tres filas de la calle y una tabla por ruta.
2. La medida del piloto: la Propuesta 1 del buscador (preescolar +15, secundaria −15, 30 del personal a E1) como lo que se pide a Dirección, una sola, la semana del 16-nov.
3. La fila: el botón del portero.
