# Doc 7 — Reunión del 9-sep-2026: estado del proyecto y argumentario de salida a producción

> **Plan de Dirección · Fase 3 (Ejecución/Control).** La reunión del 4-sep no se realizó; se
> reagenda al **miércoles 9-sep** con un objetivo más ambicioso: presentar SATAG para su
> **salida a producción**. Este documento no sustituye al Doc 6 — el guion de demo (sección A),
> la tabla de decisiones (B) y la minuta (E) del Doc 6 siguen vigentes y se usan tal cual —
> sino que lo complementa con lo que no existía al redactarlo: **la medición del proceso real
> en campo** (31-ago y 1-sep, `Campo/00`) y el argumentario construido sobre ella.

**Materiales de la reunión:** `PRESENTACION.html` (raíz del repo; mismo formato que la de
SEVAD: flechas para avanzar, F11 pantalla completa, Ctrl+P la vuelve PDF) · Doc 6 secciones
B (decisiones) y E (minuta) impresas · checklist D del Doc 6 con las fechas corridas al 8-sep.

---

## 1. Estado del proyecto en una página (corte al 7-sep)

### Hecho y en uso interno

| Qué | Desde | Constancia |
|---|---|---|
| Producto funcionalmente completo (alcance cerrado) | 29-jul | Doc 2 §2.1 |
| Base en datos reales: banco de QA vaciado, primer expediente real `SATAG-000001`. **El padrón histórico (~1,700 familias) sigue en el sheet/ZK: su migración es trabajo aparte, posterior** | 18-ago | Arranque 18-ago |
| Bloques SQL 00→51 aplicados (RLS, cobros, corte, buzón, límites) | 25-ago | `supabase/sql/README.md` |
| Precio del TAG $100 confirmado en minuta con la Gerencia Adm. | 24-ago | Minuta junta de Sistemas |
| 52 casos de prueba aprobados + 10 observaciones con riesgo aceptado | 25-ago | `Pruebas/02` |
| Manuales por rol conciliados con los textos reales de pantalla | 25-ago | Lote E (0f27e0e) |
| Capacidad verificada: **300 familias simultáneas** = 2,982 altas completas en 10 min, p95 239 ms, 0 errores (sin buscar el límite); lecturas ~730–830 req/s | 28-ago | `CAPACIDAD.md` §III.3 |
| Proceso actual medido en campo (38 TAGs reales instalados) | 31-ago/1-sep | `Campo/00` |

### En curso (avance CroNoma: 83.3%, 36/49 tareas)

| Tarea | % | Qué la mueve |
|---|---|---|
| Pruebas del sistema | 80% | Lo que falta es la **tanda U**: la ejecuta el personal con sus cuentas — depende de B1 y B9 |
| Infraestructura + deploy al subdominio | 70/55% | Esperando accesos del jefe; **migrar antes de invitar cuentas** |
| Aviso de privacidad v3 (Legal) | 90% | Con Legal vía el contador; tope **12-sep** para no recorrer la salida |
| CC-08 firma como módulo portable | 80% | Trabajo propio de TI, no bloquea la reunión |
| Salida a producción | 0% | Arranca el 14-sep; **meta 19-sep (SC-021)**. El registro de aceptación es gestión interna de TI: **en la reunión no se firma nada** |

### Deuda administrativa (no técnica) que conviene saldar antes del miércoles

- **CroNoma sin bitácora desde el 25-ago**: las jornadas de campo (31-ago, 1-sep) y este
  paquete no están registrados; cerrar el día con `cerrar_dia` antes de la reunión para que
  el avance que se presente coincida con el sistema de gestión.
- **2 revisiones pendientes del auditor** reportan las Pruebas al 40% cuando la actividad va
  en 80%: aprobarlas tal cual **retrocedería el avance mostrado**; resolverlas antes.

## 2. El argumento de venta (nuevo desde el campo)

La fuerza de la reunión ya no es "el sistema está bonito": es que **el proceso actual se
midió operándolo de verdad** y los números son del propio Instituto:

1. **Cada TAG se captura tres veces** — papel (familia) → hoja de cálculo (TI) → ZKBioSecurity
   (TI). Tres tecleos del mismo dato, ninguno validado.
2. **38 TAGs = dos jornadas completas**: una de instalación física (esa permanece) y **una
   jornada entera de pura recaptura** (esa desaparece con SATAG). ~12 min por TAG por fase.
3. **42% de la tanda salió con errores** (16 de 38): placas incompletas o con formato
   imposible, modelos que son años, un TAG con un dígito de menos, un vehículo sin placa.
4. **El padrón histórico ya está sucio**: en 1,728 filas hay 119 modelos que son años,
   **395 vehículos sin placa registrada** (el formato de papel de 2021 ni siquiera la
   pedía: 369 dicen "N/A-Formato 2021") y 14 números de TAG duplicados. Y al cruzar
   contra ZKBioSecurity apareció una divergencia real de un dígito en el mismo registro:
   **los dos sistemas se separan en silencio y nadie concilia**.
5. Extrapolación honesta: a ese ritmo, el padrón completo representa **del orden de 40
   jornadas acumuladas solo de captura manual**.

**La frase que resume la venta:** *"De cada dos días de trabajo del proceso actual, uno
entero se va en volver a escribir datos que ya existen — y el 42% sale con errores. SATAG
captura una sola vez, validado, con firma y con evidencia."*

**Límite honesto del argumento (decirlo antes de que lo pregunten):** SATAG **no** elimina
el alta en ZKBioSecurity — el número de TAG se seguirá capturando ahí al instalar, hasta que
Contabilidad decida sobre la licencia de la API (B12/SC-006, plan B por archivo ya diseñado).
Lo que sí elimina: el papel, la hoja de cálculo, la recaptura y los datos sin validar.

## 3. Lo que se pide el miércoles (y a qué decisión del Doc 6 corresponde)

| # | Petición | Doc 6 | Sin esto |
|---|---|---|---|
| 1 | **Nombres de quién opera**: quién cobra, quién corta caja, quién instala; sus cuentas y capacitación | B1 | No hay pruebas del personal (tanda U) ni piloto |
| 2 | **Piloto real**: personal + 5–10 familias voluntarias, semana del **14-sep**, para probar el proceso completo tal cual es y levantar mejoras | B9 | El sistema queda terminado y sin uso; la salida a producción del 19-sep se recorre |
| 3 | **Paquete legal en un solo envío**: responsable ARCO (B2), buzón de contacto (B3), aviso v3 (B4), plazo de conservación (B5), fin de vigencia (B6) — tope Legal 12-sep | B2–B6 | El aviso no se publica; la tanda A queda abierta |
| — | Además, dejar resuelto **B7** (¿la reposición se cobra?) porque ventanilla lo va a improvisar el primer día | B7 | Criterios distintos por turno, sin regla |

La mecánica de la reunión es la del Doc 6: demo con el guion A (modos "en vivo sin
ejecutar", capturas y arnés — el padrón es real y **no se pulsa ningún botón que escriba**),
después la tabla B proyectada y la minuta E llenada en el acto.

## 4. Objeciones probables y respuesta corta

| Objeción | Respuesta |
|---|---|
| "¿Y si la familia no puede o no quiere hacerlo en línea?" | La ventanilla sigue existiendo: el personal puede capturar el alta con la familia presente, en el mismo formulario validado. El papel es lo único que desaparece. |
| "¿Por qué producción si las pruebas van al 80%?" | El 20% restante son los casos que **debe ejecutar el personal con sus cuentas** — es exactamente lo que el piloto ejecuta. Sin piloto, ese 20% no se puede cerrar nunca. |
| "¿Esto reemplaza al ZKBio?" | No: lo alimenta. El acceso físico sigue siendo ZKBio; SATAG ordena todo lo anterior (datos, cobro, firma, evidencia) que hoy vive en papel y hojas sueltas. |
| "¿Cuánto cuesta?" | Operación casi cero (desarrollo propio, base en capa gratuita). El único gasto en la mesa es la licencia de la API de ZKBio, que es decisión de Contabilidad y no detiene nada. |
| "¿Y si Legal cambia el aviso o el reglamento?" | El sistema versiona ambos: se publica la versión nueva y cada firma conserva la que aceptó. Es un bloque SQL, no un desarrollo. |
| "¿Qué pasa con lo capturado estos días en el proceso viejo?" | Está en la hoja de cálculo y en ZKBio, como siempre. La migración del histórico al padrón SATAG es un trabajo aparte, ya con los datos limpios que el análisis de campo marcó. |

## 5. Preparación (delta sobre el checklist D del Doc 6)

- [ ] Correr `node ver-copia-titular.mjs` el **8-sep** para que el comprobante de ejemplo
      refleje el sitio publicado ese día (D.3 del Doc 6).
- [ ] Verificar que `SATAG-000001` sigue **"Por cobrar"** y sin TAG (se usa en la demo).
- [ ] Probar `PRESENTACION.html` en el equipo de proyección (doble clic, F11; funciona sin
      internet salvo las fuentes — abrirla una vez con red para que queden en caché).
- [ ] Cerrar bitácora en CroNoma y resolver las 2 revisiones del auditor (sección 1).
- [ ] Imprimir: tabla B y minuta E del Doc 6, comprobante de ejemplo, Manual del Usuario.
- [ ] Si para el 8-sep existe staging, preparar la variante "todo en vivo" del guion A;
      si no, variantes "sin ejecutar" — **no improvisar sobre el padrón real**.

### 5.1 Si la sesión se convierte en el piloto (o su "sneak peek") — probable, dicho por Gerardo el 7-sep

La mecánica limpia, usando los candados del propio sistema:

1. **Altas reales de los asistentes.** Escanean el QR y registran su propio vehículo, con su
   firma. Son personal real del Instituto: no es simulacro, es el arranque del piloto en la
   sala. Cada expediente queda **"Por cobrar"** — estado correcto, sin tocar caja.
2. **Cobro: solo si de verdad pagan.** Si alguien pone los $100 en efectivo, se cobra en vivo
   con la sesión de Gerardo (folio de recibo real) y de paso ven el aviso verde que la demo no
   podía enseñar. Si nadie paga, no se cobra nada: el sistema mismo lo impide sin dinero de por
   medio, y ese es el mensaje.
3. **Instalación: solo con pago registrado.** Si hubo un cobro y hay TAG físico a la mano, se
   instala en vivo en el estacionamiento al salir; si no, la cola "Esperando pago" en pantalla
   ES la lección de control interno.
4. **Nada que limpiar después.** Los expedientes creados son reales y útiles (personal que de
   todos modos necesita TAG). Solo dar de baja si alguien capturó datos de broma — evitarlo
   pidiendo que registren su vehículo verdadero.
5. **Advertencia previa** (decirla antes de repartir el QR): folio y recibo son reales e
   inmutables; el folio del comprobante se muestra una sola vez — que le tomen captura.

## 6. Registro

| Fecha | Qué |
|---|---|
| 7-sep-2026 | Se redacta este documento y `PRESENTACION.html` (formato SEVAD) con los datos de campo de `Campo/00`. La reunión del 4-sep no se realizó; el objetivo del 9-sep es la autorización del piloto y la **salida a producción el 19-sep**. Criterio fijado por Gerardo: frente a Administración no se maneja "acta de aceptación" ni se firma nada — es trabajo de planta, el sistema sale a producción y las modificaciones que pidan se registran y se hacen. El acta queda como registro interno de gestión (CroNoma). |
