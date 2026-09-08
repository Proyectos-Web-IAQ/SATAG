# Campo — Observaciones del proceso en papel (instalación de TAGs)

SATAG aún no está en uso: la escuela opera con el proceso anterior (hoja de papel +
Google Sheets + ZKBioSecurity). Mientras ese proceso se ejecuta en campo, este documento
acumula lo observado para que SATAG lo **simplifique, no solo lo digitalice**.
Alimenta la reunión de requerimientos con Administración del 4-sep-2026.

**Regla de este documento:** cero PII. Ni nombres ni placas completas; los casos se citan
por fila del registro en Sheets. Los datos reales viven en el sheet de la cuenta de trabajo
y sus exports en `Campo/datos/` (ignorado por git).

---

## Protocolo de captura (cero fricción en campo)

1. **En campo: nada extra.** Se trabaja igual que hoy. Si algo sale raro, una nota de una
   línea en una columna `Obs` del sheet (o nota de voz en el teléfono).
2. **Al volver:** dump crudo en el chat con Claude — sin estructura, con faltas, como salga.
   Claude lo convierte en entradas fechadas de este documento.
3. **Datos:** el sheet vive solo en la cuenta de trabajo (decisión del 31-ago: no se
   comparte con otras cuentas). Al terminar cada tanda: Archivo → Descargar → CSV a
   `Campo/datos/`. Claude cruza el export contra el esquema y catálogos de SATAG
   (calidad de captura, campos faltantes, formatos).

## El proceso real hoy (mapa vivo — corregir sobre la marcha)

```
hoja de papel (la llena el padre)
  → instalación física del TAG en el vehículo
    → captura manual en Google Sheets (cuenta de trabajo)
      → en ZKBioSecurity: buscar la tarjeta PRE-CARGADA por número de TAG
        y completar a mano nombre, apellido y departamento (corregido 1-sep:
        los TAGs nuevos ya existen en ZK como personas sin nombre; no se
        crea el registro desde cero. La API sigue bloqueada — SC-006)
```

El mismo dato viaja tres veces; cada salto es una recaptura y una oportunidad de error.
La columna `Usuario` del sheet (Padres/Maestro/Alumno) equivale al departamento en ZK.
ZKBio traía 2,785 registros al 1-sep; el sheet histórico, 1,728 filas.

## Lentes de análisis (qué buscamos en cada observación)

- Pasos que solo existen porque el medio es papel.
- Datos que se capturan más de una vez.
- Dónde y cómo entran los errores (el papel no valida nada).
- Esperas, traslados, idas y vueltas para completar un trámite.
- Qué preguntan los padres en el momento de la instalación.
- Decisiones que el instalador toma sin regla escrita.

---

## Observaciones

### 2026-08-31 — primera jornada de instalación con hojas

1. **Triple captura del mismo dato.** Papel → Sheets → ZKBio: tres veces la misma
   información, tecleada a mano. SATAG debe dejarla en captura única.
2. **El papel no valida el formato de la placa.** Caso real: una placa capturada parecía
   incompleta y resultó ser formato CDMX vigente y completo (1 letra + 2 dígitos +
   3 letras); las de Querétaro llevan 3 letras + 4 dígitos, por eso "se veía corta".
   Ni la hoja ni el personal tienen referencia de formatos.
   → Candidato para SATAG: validación *suave* de formatos comunes de placa en la captura
   (aviso, no bloqueo). Para verificar una placa dudosa: consulta REPUVE (placa → vehículo).
3. **Se puede cerrar una instalación sin un dato obligatorio.** Caso real: TAG ya
   instalado y no se pidió la placa; solo quedaron marca y modelo. No existe consulta
   pública que saque una placa a partir de marca/modelo, así que la única salida es
   contactar a la titular (teléfono de la hoja o directorio de Administración).
   → En SATAG el orden del flujo importa: primero registro completo, después TAG.
   El esquema ya lo exige (`reg_placas_requeridas` o `sin_placas` explícito); la lección
   es que la *operación* debe seguir ese orden también.
4. **La carga a ZKBioSecurity es 100% manual** (confirmado por Gerardo el 31-ago):
   cada registro se vuelve a teclear en la UI de ZKBio. Con la API bloqueada (SC-006),
   la tercera captura no tiene atajo. Pendiente medir: minutos por registro en ZKBio,
   para ponerle número al costo del proceso actual frente a SATAG.
5. **Línea base medida (confirmada el 1-sep): ~2 jornadas completas para 38 TAGs.**
   Una jornada para instalar en campo con hojas (31-ago) y otra jornada entera para
   *subirlos al sistema* (1-sep: teclear al sheet + buscar-y-completar en ZKBio).
   Eso da ~12 minutos por TAG en cada fase. La lectura para Dirección: **de cada dos
   días de trabajo, uno completo se va en volver a capturar lo que ya estaba escrito
   en el papel.** Con SATAG, esa segunda jornada casi desaparece: el titular captura
   sus propios datos una sola vez y validados; lo único que sobrevive es el paso a
   ZKBio (manual hasta que se compre la licencia de la API — SC-006), que con datos
   limpios y en lista se reduce a buscar el TAG y confirmar.
6. **La letra manuscrita produce modelos que no existen.** Caso real: en la hoja se lee
   marca "MG" y en modelo algo entre "MG" y "M6" — y el MG6 no se vende en México (lo
   probable: MG5, el más vendido, o que la titular repitió la marca por no saber su
   modelo). Quien captura termina adivinando o investigando por fuera (REPUVE por placa,
   tarjeta de circulación).
   → SATAG ya lo resuelve de raíz: `cat_marcas`/`cat_modelos` con selección, imposible
   capturar un modelo inexistente. Este caso es el ejemplo para el 4-sep.

### 2026-09-01 — análisis del export (tanda 31-ago + 1-sep, n=38) y del histórico (n=1,728)

7. **42% de la tanda trae al menos una alerta de calidad** (16 de 38): 5 registros con
   el año en el campo de modelo, 5 placas con formato que no corresponde a ningún
   patrón vigente (probables letras/dígitos faltantes o sobrantes), 1 vehículo sin
   placa, 1 número de TAG de 7 dígitos cuando la serie es de 8, 1 año de cinco cifras.
   En el histórico completo: 119 filas con modelo=año (7%), 14 números de TAG repetidos
   y **395 vehículos sin placa registrada** — 26 con el campo vacío y 369 con la leyenda
   "N/A-Formato 2021": *el formato de papel de ese año ni siquiera pedía la placa*
   (23% del padrón). Nada de esto lo detecta el papel ni el sheet; SATAG lo previene
   en la captura (catálogos, placas requeridas o `sin_placas`, TAG único).
   **Corolario (7-sep):** la placa funciona como llave para detectar re-altas: el caso
   del "modelo M" se resolvió porque la misma placa ya existía en el histórico con el
   modelo completo (MG HS) — y reveló que la re-alta deja DOS filas activas del mismo
   vehículo si nadie da de baja la anterior. SATAG lo maneja como reposición dentro
   del mismo expediente, con el TAG anterior inactivo.
8. **Cruzar sistemas ya encontró una divergencia real:** un número de TAG del sheet
   difiere en un dígito del que ZKBio tiene para la misma persona (probable typo de
   la segunda captura). Con tres capturas manuales, sheet y ZK se van separando en
   silencio; nadie concilia. En SATAG el dato se captura una vez.
9. **Los TAGs "externos" son parte normal de la operación:** varios vehículos llegan
   con TAG propio ya pegado y se registra ese número en vez de instalar uno nuevo
   (4 casos en la tanda). CC-01 (apartar TAG con procedencia editable) ya modela esto.
10. **La lista de trabajo generada** (`Campo/datos/tanda-zk-2026-08-31.md`) ordena la
   tanda para el paso ZK: TAG para buscar, nombre a completar, departamento sugerido
   y alertas por fila. Primera vez que el paso 3 se hace con checklist en vez de
   saltando entre ventanas.

## Preguntas abiertas (llevar al 4-sep)

- ¿Quién guarda las hojas de papel, dónde y por cuánto tiempo? ¿Son el respaldo "oficial"?
- ¿Un TAG queda activo en ZK aunque el registro esté incompleto? ¿Quién lo verifica?
- ¿Cómo se registra hoy el cobro del TAG ($100 confirmado en minuta) y quién lo concilia?
  (SATAG ya trae corte de caja; hay que ver contra qué proceso real aterriza.)
