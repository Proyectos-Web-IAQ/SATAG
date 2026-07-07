# Doc 4 — Bitácora de Control de Cambios y Acta de Cierre

> **Plan de Dirección · Fase 3 (Ejecución/Control) y Fase 4 (Cierre)**
> Documentos del estándar incluidos: **3.1 Bitácora de Control de Cambios** + **4.1 Acta de Cierre y
> Lecciones Aprendidas**. Estas secciones se **llenan durante el desarrollo y al cierre** (no en la
> planeación).
>
> 🔁 **Plantilla reutilizable:** diseñada para copiarse tal cual en cualquier proyecto. Solo cambia el
> encabezado y el aprobador.

| Proyecto | **SATAV** — Sistema de Adquisición de TAG Vehicular |
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
> [`bitacora-cambios.xlsx`](bitacora-cambios.xlsx). La tabla de abajo es solo un **ejemplo del formato**.
>
> 📌 **Cambios de la junta de Dirección (03-jul, `CC-01…CC-08`):** ya cargados en la plantilla
> [`bitacora-cambios.xlsx`](bitacora-cambios.xlsx), listos para **copiar/pegar al Sheet de Drive**.
> No se duplican aquí para no tener dos fuentes de verdad.
>
> 📌 **Ajustes derivados de la investigación legal (03-jul, `CC-09…CC-14`):** se documentan abajo como
> resumen para actualizar la línea base del plan. Deben copiarse también al Sheet de Drive para mantener
> la fuente operativa completa.

| ID | Fecha | Solicitante | Cambio solicitado | Impacto (Alcance / Tiempo / Costo) | Prioridad | Decisión | Aprobó | Estado |
|----|-------|-------------|-------------------|-------------------------------------|-----------|----------|--------|--------|
| CC-01 | 01/07/26 | *(ejemplo)* | Agregar campo "correo" al formulario | Campo nuevo / +0.5 día / — | Media | Aprobado | M. Á. González | Implementado |
| CC-09 | 03/07/26 | Responsable / investigación legal | Crear aviso de privacidad específico SATAV o anexo al aviso general IAQ, más aviso simplificado para formulario | Alcance legal/documental nuevo / +0.5 a 1 d / $0 | 🔴 Alta | Aprobado | M. Á. González | Aprobado |
| CC-10 | 03/07/26 | Responsable / investigación legal | Reforzar firma con hash SHA-256, versión de reglamento/aviso y sello de tiempo | Alcance técnico de evidencia / +0.5 a 1 d / $0 | 🔴 Alta | Aprobado | M. Á. González | Aprobado |
| CC-11 | 03/07/26 | Responsable / investigación legal | Agregar tratamiento de menores: firma obligatoria de padre/madre/tutor cuando aplique | Ajuste formulario/validaciones / +0.5 d / $0 | 🔴 Alta | Aprobado | M. Á. González | Aprobado |
| CC-12 | 03/07/26 | Responsable / investigación legal | Endurecer Supabase: RLS por rol, RPC controlada, Storage privado y MFA admin | Reformulación de seguridad / +1 d / $0 | 🔴 Alta | Aprobado | M. Á. González | Aprobado |
| CC-13 | 03/07/26 | Responsable / investigación legal | Incorporar soporte ARCO básico: acceso, rectificación, cancelación/bloqueo y oposición mediante panel/flujo cambio-baja | Amplía cambio/baja y panel / +0.5 a 1 d / $0 | 🟡 Media | Aprobado | M. Á. González | Aprobado |
| CC-14 | 03/07/26 | Responsable / investigación legal | Evaluar NOM-151 como mejora futura/cotización, no requisito del MVP | Sin impacto inmediato; posible costo futuro por constancia/API / 0 d MVP / costo por cotizar | 🟢 Baja | Diferido | M. Á. González | Diferido |
| CC-15 | 06/07/26 | Responsable / planeación diaria | Crear guía operativa de sesiones y mover textos legales a subcarpeta E6 para revisión en GitHub | Orden documental / 0 d / $0 | 🟡 Media | Aprobado internamente | Gerardo Sánchez | Pendiente aprobación Dirección/Legal |
| CC-16 | 07/07/26 | Contador / reunion de prototipo | Cambiar nombre del proyecto/producto de SATAV a SATAG | Ajuste de identidad, textos visibles, documentacion y posibles rutas/nombres internos / <0.125 d / $0 | 🟡 Media | Solicitado | Pendiente | En evaluacion |
| CC-17 | 07/07/26 | Contador / reunion de prototipo | Separar el nombre del usuario en el formulario: apellido paterno, apellido materno y nombres | Ajuste de formulario, modelo de datos, validaciones, busqueda y migracion de datos existentes / <0.125 d / $0 | 🟡 Media | Solicitado | Pendiente | En evaluacion |

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
| Panel administrativo | ☐ Sí ☐ No | |
| Base de datos + RLS + aviso de privacidad | ☐ Sí ☐ No | |
| Despliegue en producción (subdominio) | ☐ Sí ☐ No | |
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
