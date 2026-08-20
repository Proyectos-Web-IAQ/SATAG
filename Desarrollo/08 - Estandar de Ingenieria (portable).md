# Estándar de Ingeniería — portable a otros sistemas

> **Desarrollo · Documentación técnica viva**
> Este documento no describe a SATAG: describe **lo que SATAG enseñó**, en forma de reglas
> aplicables a cualquier sistema nuevo del IAQ. Nació el 19-ago-2026, después de cerrar 14 de
> los 15 defectos detectados por las pruebas.

Los quince defectos de SATAG no fueron quince errores distintos. Fueron **unos pocos errores
repetidos**, y esa es la única razón por la que vale la pena escribir un estándar: si los errores
fueran irrepetibles, no habría nada que estandarizar.

De los 15: **cinco** (D-01, D-04, D-08, D-09, D-11) fueron el mismo error de degradación
silenciosa. **Tres** (D-03, D-05, D-07) fueron el mismo error de tratamiento al usuario. Es decir,
**más de la mitad del esfuerzo de corrección se fue en dos patrones** que una regla de arranque
habría evitado por completo.

---

## 1 · Las tres reglas ejecutables

No son recomendaciones: son un programa que **falla la compilación**. Viven en
[`scripts/guardian.mjs`](../scripts/guardian.mjs) y corren en cada envío desde
[`.github/workflows/verificacion.yml`](../.github/workflows/verificacion.yml).

Un documento se ignora; un guardián que rompe el build, no. Esa es la diferencia entre un
estándar escrito y un estándar vigente.

| Regla | Qué vigila | Defectos que la originaron |
|---|---|---|
| **1. Tuteo en pantalla** | Formas de «tú» en el texto de cara al usuario | D-03, D-05 |
| **2. Tuteo en la base** | Formas de «tú» en los `raise exception` **vivos** de los RPC | D-07 |
| **3. Degradación silenciosa** | Un `catch` de la capa de datos que devuelve un valor en vez de lanzar | D-01, D-04, D-08, D-09, D-11 |

### La regla 2 tiene un truco que conviene entender

Un bloque de migración es un **registro histórico**: no se reescribe nunca. Si el guardián
revisara todos los `.sql`, marcaría como error el pasado — el bloque 28 sigue conteniendo, en
disco, el tuteo que el bloque 49 ya corrigió en la base.

La solución fue enseñarle a resolver **qué cuerpo está vivo**: el del bloque de número más alto
que define cada función. Con eso revisa solo lo vigente, y de paso produce el **mapa de funciones
vivas** (`npm run guardian:mapa`), que es la documentación que este proyecto descubrió que le
faltaba: sin ella, saber qué está corriendo obliga a consultar `pg_proc` en la base.

> Comprobado el 19-ago: las 20 funciones que el mapa calcula del repositorio coinciden una a una
> con el inventario que se sacó de `pg_proc` de la base real el 18-ago.

---

## 2 · Cómo se lleva a un proyecto nuevo

El guardián no tiene dependencias: es un archivo de Node que se copia y se ajusta.

1. Copiar `scripts/guardian.mjs` y `.github/workflows/verificacion.yml`.
2. Ajustar en el guardián las carpetas del proyecto (`app`, `components`, `lib/supabase`,
   `supabase/sql`).
3. Añadir al `package.json`:
   ```json
   "typecheck": "tsc --noEmit",
   "guardian": "node scripts/guardian.mjs",
   "verificar": "npm run typecheck && npm run lint && npm run guardian"
   ```
4. Antes de subir cualquier cambio: `npm run verificar`.

**Las reglas se agregan, no se quitan.** Cada defecto nuevo que resulte ser un patrón —no un
descuido aislado— se convierte en regla del guardián en el mismo commit que lo corrige. Así el
estándar crece con la experiencia en vez de envejecer.

---

## 3 · Lista de verificación de arranque

Decisiones que cuestan lo mismo el primer día y carísimo después. Cada una responde a algo que
en SATAG hubo que arreglar a posteriori.

### Datos y protección

- [ ] **RLS activa desde el bloque cero**, en todas las tablas. La frontera va en la base, no en
      la interfaz: en SATAG eso convirtió defectos de interfaz en incidentes menores en vez de
      fugas de datos.
- [ ] **RPC con `security definer` que exijan rol Y nivel de autenticación por dentro.** Que la
      pantalla se equivoque no debe alcanzar para ver un dato.
- [ ] **Privilegios revocados además de la RLS** en las tablas críticas: dos barreras
      independientes, no una.
- [ ] **La prueba que lo valida:** consultas directas con cada perfil (sin rol, rol sin MFA, cada
      rol con MFA) verificando **cero filas** donde toca. Si la protección solo existe en el
      front, no existe.
- [ ] **Ojo:** la RLS de PostgreSQL es **por fila, no por columna**. Una vista no protege la
      tabla que hay debajo. Si una columna es más sensible que su fila, hace falta otra tabla.

### Identificadores y endpoints públicos

- [ ] **Folios no secuenciales.** Un folio correlativo reduce el espacio a adivinar al tamaño del
      padrón. Cuesta lo mismo el primer día.
- [ ] **Rate limiting antes del primer usuario real**, no después, en todo endpoint público que
      valide identidad con datos semi-públicos.
- [ ] **Al aceptar un riesgo, escribir la condición que lo invalida.** «Aceptable mientras el
      padrón sea de pruebas» envejece solo; «aceptable» a secas se hereda para siempre.

### Evidencia, consentimiento y firma

- [ ] **La evidencia registra lo que se MOSTRÓ**, no lo que el servidor cree vigente. El
      identificador de la versión exhibida es parámetro obligatorio del alta; si no llega, se
      rechaza. (En SATAG, el servidor lo rellenaba solo y producía hashes válidos de documentos
      que nunca se pintaron: evidencia falsa que pasaba las verificaciones.)
- [ ] **Guardar también lo que el cliente declaró haber mostrado.** La contradicción entre eso y
      las llaves foráneas es el único detector de ese fallo.
- [ ] **Y operar ese control**: una consulta guardada y una revisión periódica. Una capacidad de
      detección que nadie ejecuta no es un control.

### Estados de carga

- [ ] **«Cargando», «cargó vacío» y «no cargó» son tres estados distintos**, distinguidos en el
      código desde el primer día. Nunca colapsarlos en `null` ni en un arreglo vacío.
- [ ] **Definir la primitiva una vez y reusarla.** En SATAG el mismo problema se resolvió cinco
      veces de cinco maneras distintas, porque no existía.
- [ ] **El fallo se declara en la pantalla donde iba el dato**, conservando el camino alterno si
      lo hay.

### Operación

- [ ] **Migraciones versionadas con el estado registrado en la base**, no en un README. SATAG
      llegó a 49 bloques aplicados a mano; el repositorio no distinguía «escrito» de «aplicado».
- [ ] **Documentar el orden de despliegue** de todo cambio que toque un RPC vivo, junto al propio
      cambio. Aplicar el bloque antes de publicar el cliente (o al revés, según el caso) es la
      diferencia entre un despliegue limpio y una ventana de caída.
- [ ] **El arnés de pruebas vive versionado**, aunque sea en su propio repositorio. Nunca solo en
      una máquina.
- [ ] **Entregar incluye el runbook de operación**, no solo el manual de usuario: cómo se aplica
      un cambio, cómo se revierte, quién tiene qué acceso.

---

## 4 · Cómo se prueban las cosas

**Reparto por naturaleza, no por comodidad.** A mano lo destructivo, lo encadenado y lo que se
juzga con el ojo; por robot lo repetitivo, lo de muchos perfiles y sobre todo **las
reejecuciones** después de corregir.

El hallazgo D-15 lo encontró una persona justo donde el guion automatizado solo esperaba una
confirmación: unos chips bloqueados que *parecían* pulsables. Técnicamente el sistema hacía lo
correcto, así que ningún robot lo habría reportado. Los defectos de experiencia son invisibles
para las pruebas automatizadas.

**Las pruebas de uso las ejecuta quien va a operar el sistema, nunca quien lo desarrolló.** Y se
les piden capturas **y comentarios**: lo que se sintió raro vale tanto como la evidencia.

**Al probar fallos de red inyectados, esperar al elemento, jamás un tiempo fijo.** Los clientes
modernos reintentan con espera creciente (supabase-js tarda ~7 s en rendirse); una aserción a los
2.5 s da falso negativo sobre código que funciona. Esa trampa costó dos corridas de diagnóstico.

---

## 5 · Lo que SATAG no alcanzó, y el siguiente sistema sí debería

Honestidad sobre los límites de este estándar, para no venderlo mejor de lo que es:

- **El CI no prueba el sitio con navegador.** Verifica tipos, estilo, las tres reglas y que
  compile. El recorrido real vive en el arnés y se dispara a mano contra el sitio publicado. El
  paso natural que falta es un trabajo posterior al despliegue que corra los fallos inyectados
  contra producción.
- **No hay pruebas unitarias.** Para un sistema donde la lógica vive en RPC de PostgreSQL, la
  cobertura útil sería sobre esos RPC (pgTAP o equivalente), no sobre el cliente.
- **El guardián detecta patrones de texto, no razona.** Un tuteo escrito de forma creativa se le
  escapa. Es una red, no una garantía.

---

## Origen

Las lecciones completas —con su situación, impacto y recomendación— están registradas en el
tablero de CroNoma del proyecto SATAG (pestaña Cierre). Este documento es su versión ejecutable
y portable.
