# DISEÑO — cómo se ve SATAG y por qué

Reglas de diseño del panel de SATAG. Nacen del rediseño de octubre de 2026, cuando tres
bocetos que solo cambiaban la piel sobre el mismo tablero de tarjetas se rechazaron con una
frase: «el UX/UI evidente de IA». Lo que sí se quería: moderno, útil y amigable para el
humano, con flow Apple, y poder ver por persona.

Las reglas valen para toda pantalla nueva y para toda pantalla que se toque. Las pantallas
viejas no se rehacen por gusto: se rehacen cuando se les mete mano por otra razón.

## 1. La idea en una línea

**La estructura la da la tipografía, no las cajas.** Tamaño, peso, gris y espacio ordenan
la página. El color aparece solo donde significa algo.

## 2. Lo que no se hace

Estas son las señas del tablero genérico. Ninguna entra:

- Filas de tarjetas de cifra con sombra, degradado o borde de color.
- Vidrio, desenfoques, degradados en fondos.
- Pastillas de color para cada estado. Una pastilla es una alerta; si todo lleva una, nada
  alerta.
- Todo en negritas. La negrita marca lo que manda; si todo manda, nada manda.
- Medidores tipo velocímetro, donas y gráficas de doble eje.
- Modo oscuro de sala de control. SATAG se proyecta de día y a veces se imprime.
- Morado y neón como énfasis.
- Íconos de adorno junto a cada cifra.
- Títulos que nombran el tema sin decir nada («Ocupación», «Resumen»).

## 3. Lo que sí se hace

### 3.1 El titular afirma algo

Toda sección abre con una frase que dice el hallazgo, en Raleway y en navy: «El E2 se llena
un cuarto de hora, no todo el día». Debajo, en gris, cómo se midió. Quien lee el titular ya
sabe la conclusión; la gráfica la respalda. Se escribe en «usted» cuando se dirige a quien
mira, y nunca en «tú».

### 3.2 Una gráfica por idea

Cada gráfica responde una sola pregunta. La anotación va sobre el dato, no en una leyenda
lejana: el pico lleva su cifra y su hora pegadas al punto. Lo observado va continuo; lo
calculado, como la mediana entre días, va punteado. La línea de «lleno» son los cajones
contados, rotulados en la misma línea.

### 3.3 Las cifras son filas, no tarjetas

Las cifras de contexto van en filas de texto debajo de la gráfica, al estilo de Salud de
Apple: pregunta a la izquierda, cifra a la derecha. Al tocar una fila se resalta su parte en
la gráfica y se abre su detalle. Es divulgación progresiva: lo que se necesita en tres
segundos está arriba, y lo demás se abre al pedirlo.

### 3.4 Listas que se abren a su detalle

Todo empieza en una lista: personas, secciones, estacionamientos. La lista se busca, se
agrupa y se abre a un detalle al lado, o debajo en el teléfono. La ficha de una persona
tiene una anatomía fija:

- **Arriba**, la identidad: nombre, tipo y sección, con el TAG vigente en monoespaciada.
- **Al lado**, los atributos como pares nombre y valor, y lo que no cuadra como renglones.
- **Abajo**, lo relacionado en tablas sobrias: TAGs con las bajas atenuadas, vehículos, y
  los pasos del día como barras de entrada a salida.

### 3.5 Tablas tipográficas

Solo filetes horizontales finos. Sin fondos de fila, sin rejilla vertical. Cifras
alineadas a la derecha y con dígitos tabulares. El encabezado es texto gris pequeño. Una
fila dada de baja se atenúa, no se tacha con color.

### 3.6 El plano del plantel

Es un esquema propio, dibujado, nunca una foto. Los edificios van en gris claro, las calles
en gris más claro con su nombre, y los dos estacionamientos llevan el único dato en color:
qué tan llenos están a la hora elegida. Cada puerta se dibuja como una sola, porque así son:
entrada de un lado y salida del otro.

## 4. Color

| Papel | Valor | Dónde |
|---|---|---|
| Navy institucional | `--primary` #002E6C, Pantone 294 C | Titulares, el elemento activo, la serie única de las gráficas |
| Tinta | `--ink` #2E2A25 | Texto corrido |
| Gris de apoyo | `--muted` #657080 | Notas, encabezados de tabla, ejes |
| Filete | `--line` #dbe1e8 | Separadores, única línea de las tablas |
| Campo | `--field-bg` #f4f7fc | Fondo de lo elegido en una lista, banda de «lo normal» |
| Alerta | `--rose` #EB0028 | Solo lo que hay que resolver hoy. Un rojo por pantalla |

Los grises llevan un sesgo azul hacia el navy; nunca un gris neutro puro.

En gráficas, una sola serie en el paso claro del navy (`--viz-serie-1`). Cuando la pregunta
es la composición por grupo, se usa la paleta de Okabe-Ito que ya está en `globals.css`
(`--viz-g1` a `--viz-g5`), con el gris al final para «sin clasificar». Nunca más de seis
colores en una gráfica, y el color nunca es el único canal: cada tramo lleva su cifra.

## 5. Tipografía

- **Raleway** en titulares, en peso 700 a 800. Es la cara de la marca.
- Texto corrido en la pila del sistema que ya carga `app/layout.tsx`, alrededor de 16 px y
  interlineado 1.5, con renglones de 65 caracteres como máximo.
- Monoespaciada para TAGs, placas y folios, para que se lean como identificadores.
- Mayúsculas pequeñas con espaciado solo en rótulos de sección, nunca en frases.
- Dígitos tabulares en toda columna de números.

## 6. Espacio, forma y tacto

- Un radio pequeño y uniforme (`--radius`, 8 px). Si un contenedor va dentro de otro, el de
  adentro lleva un radio menor, para que las esquinas sean concéntricas.
- Objetivos táctiles de 44 px. Las filas tocables y los botones de lista los cumplen.
- Separación por espacio y filetes, no por cajas. El panel existe, pero no se ve.
- La página funciona a 400 px de ancho: las columnas se apilan y las tablas anchas se
  desplazan dentro de su propio contenedor.

## 7. Proceso para una pantalla nueva

1. Escribir primero las frases: qué titular responde cada sección.
2. Hacer el esqueleto en escala de grises con datos verosímiles y marcados como ejemplo.
   Si la estructura no se sostiene en gris, ningún color la salva.
3. Vestirlo con la marca según este documento.
4. Mirarlo en el teléfono y proyectado antes de darlo por terminado.

Los esqueletos de octubre de 2026 están publicados como páginas privadas; los tokens de
color viven en `app/globals.css`, que es la fuente de verdad de los valores.
