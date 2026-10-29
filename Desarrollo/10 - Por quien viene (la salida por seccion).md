# Por quién viene · la salida por sección en Consulta › Estacionamiento

*28-oct-2026 · Fase 1 de tres. Lo que el contador vio en el mapa de Análisis Vial, ahora dentro de SATAG con la bitácora de todos los días.*

## 1. El problema que se replantea

Lo que se llamaba «el tráfico» de la tarde son tres cosas distintas:

| Qué | Quién lo mide | Qué es |
|---|---|---|
| La calle (índice de Google) | Análisis Vial | El **síntoma**. Sirve de termómetro antes y después; no explica nada. |
| Los autos dentro de E1 y E2 | ZK → SATAG | Lo que esta pantalla dibuja: quién está dentro, cuándo entra y cuándo sale. |
| La fila afuera de las plumas | Nadie, todavía | La **causa**: N autos llegan antes de la salida, se forman en el circuito y en la calle, y se despachan a un ritmo. Fase 3. |

Un modelo calle ≈ f(plumas) con los datos de octubre dio R² ≈ 0: la calle **no se infiere** desde las plumas. Por eso Google baja a termómetro y la fila se observa directo.

La conclusión que hay que corregir el lunes: «secundaria saliendo más tarde resuelve la congestión». Los datos dicen que mover a secundaria mueve la oleada, no la achica, y arrastra a los hermanos de primaria (las familias salen con el mayor).

## 2. La regla

**Quién tiene el TAG lo dice ZK; quién es la persona lo dice GES** (bloque 92, `lib/personas/identificar.ts`). A eso se le agrega una sola regla nueva: **la sección de un papá es la sección de sus hijos.** Los grupos del tutor en GES (`ges_personas.grupos`) se traducen a sección con los códigos confirmados el 28-oct:

| Código de grupo | Sección |
|---|---|
| LAC, CIA, CIB | comunidad infantil |
| K1–K3, PFA–PFC | preescolar (PF = pre-first) |
| P1–P6 | primaria |
| S1–S3 | secundaria |
| 101–503 (numéricos) | preparatoria |

Una familia con P3 y S1 es «Padres de primaria y secundaria». Quien no se pudo ligar a una familia **se dice** («Padres de familia · sin familia en GES»), no se reparte.

## 3. Lo que hay en el código

- `lib/recogida.ts` — pura, con pruebas en `pruebas-unitarias/recogida.test.ts` (25).
  - `seccionDeGrupo`, `seccionesDe`, `nombrarSecciones`: la tabla de arriba.
  - `clasificarRecogida` / `indexarRecogida`: por tarjeta, la **etiqueta** («Padres de primaria», o el departamento de ZK para el personal) y el **grupo** de cinco para la gráfica: primaria y menores · solo secundaria o preparatoria (y alumnos que manejan) · hijos en varias secciones · personal · otros. La identidad sale de `identificar` con la decisión de TI primero y el cruce estricto por nombre (SATAG y ZK) después.
  - `salidaPorGrupo`: de 12:30 a 16:00 cada 5 min, por estacionamiento y grupo: dentro, entran, salen. Mediana **por grupo** entre los días hábiles comparables (`clasificarDias`, sin sábados ni domingos), solo estancias con entrada y salida leídas.
  - `viajesPorSeccion` (29-oct, **la tabla central**): por sección, a qué hora entran y a qué hora salen los papás, con una fila por la sección **mayor** de la familia. Un papá cuenta en cada sección de sus hijos. Dos momentos: **tarde** = recoger (salen 13:00–16:00, entraron antes de 15:40; la entrada se recorta a las 12:00) y la fila es «hasta qué sección se quedan»; **mañana** = dejar (entran 06:00–09:30; la salida se recorta a las 20:00) y la fila es «con qué hijos vienen». Autos al día (cada viaje pesa 1/días), cuartiles de entrada, salida y minutos dentro, y cuántos tienen además un hijo en una sección mayor. Los papás sin ligar a GES van aparte; personal, alumnos e institucionales no entran (`Recogida.esPapa`). Es el mismo cálculo del mapa de Análisis Vial que Gerardo señaló como el de mayor impacto.
- `components/admin/VistaEstacionamiento.tsx` — carga GES con el mismo `useGes` de la ficha (solo roles que lo leen: ti, contador, admin, super) y con eso la clave «por departamento» de la medición pasa a ser «por quién viene» (`deptoDe`). Sin GES todo sigue igual que antes.
- `components/admin/GenteEstacionamiento.tsx` › **Secciones** — las filas ya no meten a todos los papás en «Padres de familia»: salen por la sección de sus hijos, con sus cajones a la vez, su mediana y su gente (la ficha dice «Padres de primaria y secundaria · 12 entradas…»). Arriba, `SalidaPorSeccion.tsx`: primero **«Por sección: a qué hora entran y a qué hora salen los papás»** (`viajesPorSeccion`, tarde y mañana, una tabla por sección con la barra claro = entran / oscuro = salen en el color único de serie) y después **«La salida: quién está dentro, por quién viene»**, en dos niveles: (1) la vista de conjunto por cinco grupos —dentro de cada estacionamiento apilado, salidas por la pluma cada cinco minutos y la tabla con las oleadas por media hora— y (2) el detalle «tal cual»: **una fila por sección y por combinación de secciones** («Padres de primaria y secundaria», «PRIMARIA DOCENTE»…), en el orden en que salen, con autos al día, cuándo entran y cuándo salen (cuartiles y mediana de quienes se van entre 12:30 y 16:00) y su curva de dentro a su propia escala (`salidaPorClave` con la etiqueta fina; sin color, una serie por fila).
- `components/admin/LecturasZk.tsx` — columna «Viene por» en cada paso por la pluma.

Colores: la paleta de cinco declarada en `app/globals.css` (Okabe-Ito, gris para el residuo), en el orden que el validador acepta para los pares vecinos; cada columna lleva su rótulo al puntero y al teclado, y la tabla trae la misma cifra en texto.

No lleva bloque SQL: lee lo que ya está en la base (bloques 78, 83 y 92).

## 4. Lo que no puede decir

- La **calle**: no está en SATAG y no se infiere de las plumas.
- La **fila**: las plumas ven al que ya entró. Lo que se forma afuera lo mide la fase 3.
- Las estancias **sin salida leída** no están en la curva (igual que en «Ocupación»): la cifra es un piso.
- La suma de los tramos es «un día típico de cada grupo», no la mediana del total.

## 5. Lo que sigue

- **Fase 2 · «¿Y si…?»** en Consulta: personal de E2 a E1 (por departamento) y salida de secundaria/prepa ±minutos, sobre estas mismas series. Después de tener el conteo de la fila, para que lo que diga esté anclado.
- **Fase 3 · la fila**: botón del portero en la caseta («fila hasta…», cada 10 minutos en la salida; bloque SQL chico) o tres tardes de video fijo 14:30–15:15. Convierte a SATAG en el instrumento que mide la causa.
- Horarios de salida por sección como anotaciones en la gráfica, cuando Gerardo los confirme.
