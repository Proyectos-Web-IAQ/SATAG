# Doc 4 — Bitácora de Control de Cambios y Acta de Cierre

> **Plan de Dirección · Fase 3 (Ejecución/Control) y Fase 4 (Cierre)**
> Documentos del estándar incluidos: **3.1 Bitácora de Control de Cambios** + **4.1 Acta de Cierre y
> Lecciones Aprendidas**. Estas secciones se **llenan durante el desarrollo y al cierre** (no en la
> planeación).
>
> 🔁 **Plantilla reutilizable:** diseñada para copiarse tal cual en cualquier proyecto. Solo cambia el
> encabezado y el aprobador.

| Proyecto | **SATAG** — Sistema de Adquisición de TAG Vehicular |
|---|---|
| Aprobador de cambios | Miguel Ángel González Pacheco — Encargado de Sistemas Computacionales |
| Responsable del registro | Gerardo Sánchez — Soporte TI Jr. |

---

## 3.1 Bitácora de Control de Cambios

> **Qué es:** el registro **único** de toda solicitud de cambio al proyecto (alcance, tiempo, costo o
> calidad): su evaluación, su decisión y su seguimiento. Es la defensa contra el *scope creep* —
> **ningún cambio se ejecuta sin quedar registrado y aprobado aquí.**

### Cómo usar (4 pasos)

1. **Registra** cada solicitud como una fila nueva con un ID consecutivo (`CC-01`, `CC-02`…).
2. **Evalúa el impacto** en las 3 dimensiones — Alcance / Tiempo / Costo — de forma concreta
   (ej. *"+2 días"*, *"+$500"*, *"sin impacto"*).
3. **El aprobador decide:** Aprobado · Rechazado · Diferido. Anota **quién** y **cuándo**.
4. **Da seguimiento** hasta cerrar (Implementado → Cerrado) y **actualiza el plan** si el cambio lo afecta.

### Convenciones

| Campo | Valores |
|---|---|
| **ID** | `CC-01`, `CC-02`… (consecutivo) |
| **Prioridad** | 🔴 Alta · 🟡 Media · 🟢 Baja |
| **Decisión** | Aprobado · Rechazado · Diferido |
| **Estado** | Solicitado → En evaluación → Aprobado/Rechazado → Implementado → Cerrado |
| **Impacto** | Siempre en las 3 dimensiones (Alcance / Tiempo / Costo); usa `—` si no aplica |

### Registro de cambios

> ✅ **Bitácora en línea (Google Sheets):**
> **[▶ Abrir la bitácora](https://docs.google.com/spreadsheets/d/18fdAJkWnAMJOCGTiu-f8GH8XV_JuZzC4/edit)**
> — compartida y editable desde cualquier equipo. Se registra llenando **una fila por cambio**, con
> **listas desplegables** en Prioridad, Decisión y Estado (sin Markdown). Copia offline / plantilla:
> [`bitacora-cambios.xlsx`](bitacora-cambios.xlsx). La tabla de abajo es el **registro local de
> `CC-09` en adelante**; los `CC-01…CC-08` de la junta viven **solo** en el Sheet/xlsx para no
> duplicar fuentes de verdad.
>
> 📌 **Cambios de la junta de Dirección (03-jul, `CC-01…CC-08`):** ya cargados en la plantilla
> [`bitacora-cambios.xlsx`](bitacora-cambios.xlsx), listos para **copiar/pegar al Sheet de Drive**.
> No se duplican aquí para no tener dos fuentes de verdad.
>
> 📌 **Ajustes derivados de la investigación legal (03-jul, `CC-09…CC-14`):** se documentan abajo como
> resumen para actualizar la línea base del plan. Deben copiarse también al Sheet de Drive para mantener
> la fuente operativa completa.
>
> 📌 **Cambios de orden y ejecución (06-15 jul, `CC-15…CC-17`):** guía operativa de sesiones y textos
> legales a E6 (CC-15), renombre a SATAG (CC-16) y separación del nombre en apellidos + nombres (CC-17).
>
> 📌 **Cambios de ejecución (15-22 jul, `CC-18…CC-21`):** mejoras que Administración y TI pidieron
> durante la construcción (folio de recibo automático, apartar/usar el TAG apartado, buzón de notas sin
> folio y corte de caja / finanzas). Se registran abajo con la fecha real tomada del historial del
> repositorio. Copiar también al Sheet de Drive.
>
> 📌 **Auditoría de ejecución (28-jul-2026):** se cotejó esta bitácora contra el código real
> (commit `7b729a3` del 23-jul). Los estados de la tabla reflejan ese corte: los cambios **verificados
> en el código pasan a Cerrado**; `CC-09`, `CC-12` y `CC-13` quedan **parciales** con su pendiente
> anotado, y `CC-14` sigue diferido. Los pendientes derivados se dieron de alta como `SC-007…SC-014`
> en el sistema de seguimiento (Cronoma).
>
> 📌 **Cierre del desarrollo (29-jul-2026).** Último día de construcción antes de congelar
> funcionalidad. Se cerraron los tres huecos que quedaban en el panel — reporte de expedientes
> incompletos (B2, bloque 45), validación del tipo de usuario al cobrar (B5, bloque 46) y firma
> auditable desde el panel con URL firmada temporal (SC-008, bloque 47) —, con lo que **E5 queda
> completo y `CC-12` cerrado**. En la misma sesión se corrigió la documentación de gestión, que
> afirmaba que el sistema está **"en producción"**: no lo está. Está funcionalmente completo y
> desplegado en un **entorno de trabajo**, sin usuarios ni datos reales; la liberación es posterior a
> las pruebas, la migración al subdominio institucional y la aceptación. La corrección es **de
> redacción, no de alcance**: no se movió ningún porcentaje, fecha ni estado del cronograma.
>
> 📌 **Decisión de privacidad tomada el 29-jul (bloque 48).** La evidencia de firma se abrió al rol
> `consulta`. El bloque 30 la había restringido a `admin`/`super` por tratarse de PII sensible; la
> Dirección de TI resolvió ampliarla porque Consulta es la pantalla donde se investiga un expediente
> y sin la evidencia la auditoría quedaba con un hueco. Es coherente con la definición original del
> rol —"su separación es que no escribe, no que vea menos"— y `consulta` **no ganó ni un permiso de
> escritura**. Queda registrado el costo asumido: la RLS de PostgreSQL es por fila, no por columna,
> así que un rol con lectura de `aceptaciones` alcanza también `hash_payload`, los trazos, la IP y el
> user-agent si consulta la tabla directamente. Detalle técnico y alternativa descartada en el
> encabezado del bloque 48; efectos en `Desarrollo/04` y en el checklist E6.
>
> ⚠️ **Pendiente de decisión para el acta de cierre.** El cronograma da el cierre en **~03-ago**,
> mientras que la ruta de trabajo vigente pone la migración el **05-ago** y la aceptación el
> **07-ago**. Las dos fechas siguen como estaban; hay que resolver cuál es la buena y alinear la
> línea base antes de firmar el acta.
>
> ⚠️ **No confundir las dos numeraciones.** Los `CC-xx` de esta bitácora son *cambios de control del
> Plan de Dirección*. Los identificadores que aparecen en el código, el SQL y los mensajes de commit
> (`CC-01` = apartar TAG, `SC-002` = estacionamiento a cargo de TI, `SC-003` = buzón de notas) son
> **otra numeración interna de desarrollo**, sin relación con los `CC-xx` de esta tabla.

| ID | Fecha | Solicitante | Cambio solicitado | Impacto (Alcance / Tiempo / Costo) | Prioridad | Decisión | Aprobó | Estado |
|----|-------|-------------|-------------------|-------------------------------------|-----------|----------|--------|--------|
| CC-09 | 03/07/26 | Responsable / investigación legal | Crear aviso de privacidad específico SATAG o anexo al aviso general IAQ, más aviso simplificado para formulario | Alcance legal/documental nuevo / +0.5 a 1 d / $0 | 🔴 Alta | Aprobado | M. Á. González | **Implementado 28/07** (bloque 22 publica el integral; bloque 43-44 y la página `/aviso-de-privacidad` completan el aviso **simplificado** al momento de recabar los datos, art. 16 fr. II). Único resto: la aprobación institucional del texto |
| CC-10 | 03/07/26 | Responsable / investigación legal | Reforzar firma con hash SHA-256, versión de reglamento/aviso y sello de tiempo | Alcance técnico de evidencia / +0.5 a 1 d / $0 | 🔴 Alta | Aprobado | M. Á. González | **Cerrado 28/07** (verificado en auditoría: `15_aceptaciones` + RPC `crear_registro`) |
| CC-11 | 03/07/26 | Responsable / investigación legal | Agregar tratamiento de menores: firma obligatoria de padre/madre/tutor cuando aplique | Ajuste formulario/validaciones / +0.5 d / $0 | 🔴 Alta | Aprobado | M. Á. González | **Cerrado 28/07** (verificado: constraint `reg_menor_requiere_gestionante` + wizard fuerza gestionante) |
| CC-12 | 03/07/26 | Responsable / investigación legal | Endurecer Supabase: RLS por rol, RPC controlada, Storage privado y MFA admin | Reformulación de seguridad / +1 d / $0 | 🔴 Alta | Aprobado | M. Á. González | **Cerrado 29/07.** Implementado 15/07 (bloques 20, 27, 29, 30: roles admin/ti/consulta/super + `aal2`); ampliado 28/07 con el bloque 43, que restringe por rol la escritura de catálogos, documentos legales y el bucket de firmas; y **completado 29/07** con el bloque 47 (SC-008): el panel muestra la firma con URL firmada temporal, la lectura de `aceptaciones` pasa a admin/TI/super y `consulta` no accede por ninguna vía |
| CC-13 | 03/07/26 | Responsable / investigación legal | Incorporar soporte ARCO básico: acceso, rectificación, cancelación/bloqueo y oposición mediante panel/flujo cambio-baja | Amplía cambio/baja y panel / +0.5 a 1 d / $0 | 🟡 Media | Aprobado | M. Á. González | Implementado parcial (solicitudes actualización/baja + estado `bloqueado`; el procedimiento ARCO formal y las decisiones institucionales se siguen como SC-011) |
| CC-14 | 03/07/26 | Responsable / investigación legal | Evaluar NOM-151 como mejora futura/cotización, no requisito del MVP | Sin impacto inmediato; posible costo futuro por constancia/API / 0 d MVP / costo por cotizar | 🟢 Baja | Diferido | M. Á. González | Diferido |
| CC-15 | 06/07/26 | Responsable / planeación diaria | Crear guía operativa de sesiones y mover textos legales a subcarpeta E6 para revisión en GitHub | Orden documental / 0 d / $0 | 🟡 Media | Aprobado internamente | Gerardo Sánchez | Implementado (pendiente aprobación Dirección/Legal) |
| CC-16 | 07/07/26 | Contador / reunion de prototipo | Cambiar nombre del proyecto/producto a SATAG | Ajuste de identidad, textos visibles, documentacion y rutas/nombres internos / <0.125 d / $0 | 🟡 Media | Aprobado | M. Á. González | **Cerrado 28/07** (verificado: folios `SATAG-`, `package.json` name `satag`) |
| CC-17 | 07/07/26 | Contador / reunion de prototipo | Separar el nombre del usuario en el formulario: apellido paterno, apellido materno y nombres | Ajuste de formulario, modelo de datos, validaciones, busqueda y migracion de datos existentes / <0.125 d / $0 | 🟡 Media | Aprobado | M. Á. González | **Cerrado 28/07** (implementado 08/07 y verificado: `12_registros.sql`: `usuario_nombres` + apellidos + `usuario_nombre_completo` GENERATED) |
| CC-18 | 15/07/26 | Administración / contador | Emitir folio de recibo automático en cada cobro e impedir el doble cobro por expediente | Trazabilidad del cobro / +0.5 d / $0 | 🟡 Media | Aprobado | M. Á. González | **Cerrado 28/07** (implementado 15/07 y verificado: bloque 32, `SATAG-AAAA-######`, único por expediente) |
| CC-19 | 16/07/26 | Administración / TI | Apartar el TAG de la escuela cuando la familia usa su TAG propio, y poder activarlo después como reposición | Amplía cobro/instalación e implica reposición / +1 d / $0 | 🟡 Media | Aprobado | M. Á. González | **Cerrado 28/07** (verificado: bloque 33 el 16/07 + "usar el TAG apartado" bloque 40 el 20/07) |
| CC-20 | 16/07/26 | TI / atención a usuarios | Buzón público de notas sin folio ni placa para quien no recuerda su folio; TI vincula la nota al expediente y corrobora el trámite | Nuevo canal de intake + cola de TI / +1.5 d / $0 | 🟡 Media | Aprobado | M. Á. González | **Cerrado 28/07** (verificado: bloques 34-39 desde el 16/07 + bloque 41 "sin instalación" el 20/07; riesgo aceptado: sin rate limiting en los RPC públicos) |
| CC-21 | 22/07/26 | Administración | Corte de caja / finanzas: que Admin vea la caja actual y lo vendido, cierre el corte conciliando el efectivo contado, y quede registrado (inmutable, con identidad de quien corta) | Nueva pestaña Finanzas (admin/super) + tabla de cortes / +1.5 d / $0 | 🟡 Media | Aprobado | M. Á. González | **Cerrado 28/07** (verificado: bloque 42 + pestaña Finanzas; corte libre desde el último, sin deshacer, blindaje contable de 4 triggers) |

### Flujo de control de cambios

```
Solicitud ─▶ Registro (ID) ─▶ Evaluación de impacto ─▶ Decisión del aprobador
                                                          │
                    ┌─────────────────────┬───────────────┴───────────────┐
                    ▼                     ▼                               ▼
                Aprobado              Rechazado                        Diferido
                    │                     │                               │
             Implementar            Cerrar (documentar             Reevaluar en la
                    │                 el motivo)                    fecha acordada
        Actualizar plan (si aplica)
                    │
                 Cerrar
```

---

## 4.1 Acta de Cierre y Lecciones Aprendidas

> **Qué es:** formaliza la **aceptación del producto** por el aprobador y **captura aprendizajes**
> para futuros proyectos. Se llena **al terminar** el proyecto.

### 1. Aceptación de entregables

| Entregable | ¿Aceptado? | Observaciones |
|---|---|---|
| Formulario web (reglamento + captura + firma) | ☐ Sí ☐ No | |
| Panel administrativo (roles finos + MFA) | ☐ Sí ☐ No | |
| Cobro con folio de recibo + corte de caja | ☐ Sí ☐ No | |
| Buzón de notas sin folio (SC-003) y apartar/usar TAG (CC-01) | ☐ Sí ☐ No | |
| Base de datos + RLS + aviso de privacidad | ☐ Sí ☐ No | |
| Despliegue en producción (subdominio institucional + Cloudflare) | ☐ Sí ☐ No | *Vercel desde `main` opera como hosting interino; la migración es requisito de la aceptación (SC-012)* |
| Manual / capacitación | ☐ Sí ☐ No | |

### 2. Comparación final (plan vs. real)

| Métrica | Planeado | Real | Desviación |
|---|---|---|---|
| Fecha de cierre | ~03-ago-2026 | `[fecha real]` | `[± días]` |
| Esfuerzo | ~22.5 días-persona | `[real]` | `[± días]` |
| Gasto out-of-pocket | ≈ $0 | `[real]` | `[± $]` |

### 3. Lecciones aprendidas

| Qué funcionó bien | Qué no funcionó | Qué cambiar la próxima vez |
|---|---|---|
| | | |

### 4. Cierre administrativo

- ☐ Recursos liberados.
- ☐ Documentación archivada (repositorio).
- ☐ Credenciales/accesos entregados o revocados según corresponda.

### 5. Firma de aceptación

| | Nombre | Firma | Fecha |
|---|---|---|---|
| **Aprobador** | Miguel Ángel González Pacheco | | |
| **Responsable** | Gerardo Sánchez | | |

*La firma del aprobador formaliza la aceptación del producto y el cierre del proyecto.*
