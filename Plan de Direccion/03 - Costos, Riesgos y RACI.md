# Doc 3 — Costos, Riesgos, RACI y Comunicaciones

> **Plan de Dirección · Fase 2 (Planeación)**
> Documentos del estándar incluidos: **2.4 Costos** + **2.5 Riesgos** + **2.6 RACI/Recursos** +
> **2.7 Comunicaciones** (versión breve). Se apoya en el Doc 1 (Charter) y el Doc 2 (Alcance/WBS/Cronograma).

| Proyecto | **SATAV** — Sistema de Adquisición de TAG Vehicular |
|---|---|
| Cliente | Instituto Asunción de Querétaro AC (IAQ) — interno |
| Responsable / Desarrollador | Gerardo Sánchez — Soporte TI Jr. |
| Aprobador / Auditor | Miguel Ángel González Pacheco — Encargado de Sistemas Computacionales |
| Fecha | 03-jul-2026 · Versión v0.2 |

---

## 2.4 Estimación de costos y presupuesto

**Naturaleza del costeo:** proyecto **interno**. El desarrollo lo realiza personal de planta
(Soporte TI) con **salario fijo** y **sin pago adicional** por este proyecto. Por eso el costo **no
es un precio facturable**; se expresa en dos planos: (a) **esfuerzo** (métrica principal) y
(b) **gasto out-of-pocket** (lo único que podría requerir presupuesto).

### a) Costo por esfuerzo (referencia interna)

| Concepto | Valor |
|---|---|
| Esfuerzo total (línea base vigente) | **≈ 22.5 días-persona ≈ 180 h** (incluye junta 03-jul + opción A legal, Doc 2) |
| Recurso | 1 desarrollador full-stack (Gerardo) |
| Equivalente monetario *(opcional, interno)* | 180 h × **costo/hora cargado del puesto** — solo para dimensionar la inversión de la escuela; **no genera cobro** ni lleva sobreprecio |

### b) Gasto real (out-of-pocket)

| Concepto | Monto | Nota |
|---|---|---|
| Hosting + dominio (subdominio) | **$0** | Se reutiliza la infraestructura ya contratada (GoDaddy) |
| DNS / proxy (Cloudflare) | **$0** | Ya en uso |
| Base de datos (Supabase) | **$0** | Plan gratuito suficiente para el volumen esperado; verificar límites al pasar a producción |
| NOM-151 (opcional fase 2) | **Por cotizar** | No es requisito del MVP; se evaluará si Dirección requiere constancias de conservación |
| **Total out-of-pocket** | **≈ $0** | Documentado por si a futuro surge un costo (plan mayor de Supabase, licencias) |

### Reservas del estándar (como colchón, no como precio)

| Reserva | % | Aplicación en este proyecto |
|---|---|---|
| Costos indirectos | 12% | **No aplica** como sobreprecio (proyecto interno) |
| Reserva de contingencia | 5% | ≈ **1 día** de colchón, asignado a las actividades de mayor riesgo (Modelo de datos/RLS, Firma digital, Pruebas) |
| Reserva de gestión | 8% | ≈ **1.5 días** de colchón general del proyecto |

> Con las reservas, el amortiguador total sobre la línea base vigente (~22.5 d) es de ~3 días. Sirve para
> absorber desviaciones durante la ejecución; no se recomienda consumirlo recortando pruebas de privacidad/RLS.

---

## 2.5 Matriz de riesgos

Análisis cualitativo (probabilidad × impacto → nivel) y respuesta. Deriva de los riesgos de alto
nivel del Charter (RA1–RA7), ampliados. Estrategias: **Evitar, Mitigar, Transferir, Aceptar**.

| ID | Riesgo | Prob. | Impacto | Nivel | Respuesta | Responsable |
|---|---|---|---|---|---|---|
| R1 | **Datos personales** (nombres, placas, firmas y datos de menores) sin protección legal/técnica | Media | Alto | **Alto** | **Mitigar:** aviso específico SATAV, aviso simplificado, RLS estricta, RPC controlada, Storage privado, MFA admin y pruebas de privacidad | Gerardo |
| R2 | **Firma manuscrita digital** sin valor probatorio suficiente | Media | Alto | **Alto** | **Mitigar:** firma simple reforzada: imagen + trazos si aplica + hash SHA-256 + versión del reglamento/aviso + sello de tiempo + bitácora | Gerardo / Auditor |
| R3 | **Scope creep hacia hardware** (lector/pluma) | Media | Medio | **Medio** | **Evitar:** exclusión explícita en el alcance; integración documentada como roadmap futuro | Gerardo / Auditor |
| R4 | **Registros "pendientes" acumulados** (flujo en varias manos) | Media | Medio | **Medio** | **Mitigar:** estado del registro + reporte de pendientes en el panel; seguimiento | Gerardo / TI |
| R5 | **Conciliación del pago en efectivo** ($100) fuera del sistema | Media | Medio | **Medio** | **Mitigar:** registrar cada pago (monto, folio, quién cobró, cuándo); control periódico | Administración |
| R6 | **Curva de aprendizaje** del personal (admin/TI) al cambiar de papel a web | Baja | Medio | **Bajo** | **Mitigar:** usabilidad (alta sin manual) + manual breve + capacitación | Gerardo |
| R7 | **Pérdida de datos** / falta de respaldo | Baja | Alto | **Medio** | **Mitigar/Transferir:** respaldos automáticos de Supabase; verificar política de backups | Gerardo |
| R8 | **Disponibilidad del auditor** para validar | Baja | Medio | **Bajo** | **Aceptar:** el jefe está en la misma oficina y valida el mismo día (riesgo residual mínimo) | Gerardo |
| R9 | **Aviso institucional insuficiente para SATAV** (no cubre placas, firma web, nube ni finalidad TAG) | Media | Alto | **Alto** | **Mitigar:** crear aviso específico SATAV/anexo y someterlo a aprobación antes de producción | Gerardo / Auditor |
| R10 | **Tratamiento de menores sin firma de tutor** | Media | Alto | **Alto** | **Evitar/Mitigar:** cuando el usuario sea menor, exigir firma del padre/madre/tutor como gestionante | Gerardo / Administración |
| R11 | **Configuración incorrecta de RLS/RPC/Storage** que exponga firmas o placas | Media | Alto | **Alto** | **Mitigar:** pruebas RLS/RPC, bucket privado, URLs firmadas, revisión por rol y MFA admin | Gerardo / Auditor |
| R12 | **NOM-151 no presupuestada** si se exige mayor fuerza probatoria | Baja | Medio | **Medio** | **Aceptar/Diferir:** no incluir en MVP; cotizar Cincel/ATEB/PSC acreditados como fase 2 | Auditor / Dirección |

*(R5 hosting/infra "no definido" del Charter quedó **cerrado**: se reutiliza la infraestructura de SEVAD.)*

---

## 2.6 Matriz RACI y plan de recursos

**RACI:** **R** = Responsable (ejecuta) · **A** = Aprobador (Accountable) · **C** = Consultado ·
**I** = Informado.

| Entregable / Actividad | Gerardo (Dev) | Auditor (jefe Sist.) | Administración | TI | Usuarios |
|---|---|---|---|---|---|
| Planeación (Plan de Dirección) | R | A | I | I | — |
| Modelo de datos + BD segura (RLS/RPC/Storage/MFA) | R | A | — | C | — |
| Cumplimiento legal y privacidad (aviso SATAV, firma, menores, ARCO) | R | A | C | C | I |
| Infraestructura + CI/CD | R | A | — | C | — |
| Fase 1 — Formulario + firma (autoservicio) | R | A | — | — | C |
| Fase 2 — Administración (estacionamiento + pago) | R | A | **C** | — | — |
| Fase 3 — Instalación (No. de TAG + estados) | R | A | — | **C** | — |
| Panel administrativo | R | A | C | C | — |
| Pruebas (funcional, privacidad/RLS/RPC, firma, ARCO, usabilidad) | R | A | C | C | C |
| Despliegue a producción | R | A | I | I | — |
| Manual + capacitación | R | A | C | C | I |
| Aceptación + acta de cierre | R | **A** | I | I | I |

### Plan de recursos

| Recurso | Rol | Dedicación |
|---|---|---|
| **Gerardo Sánchez** | Único desarrollador (full-stack, PM del proyecto) | Desarrollo completo |
| **Departamento de TI** (4 personas) | Definen y prueban la fase de instalación | Puntual (fase 3 + pruebas) |
| **Personal administrativo** | Define el registro de pago y asignación de estacionamiento | Puntual (fase 2 + pruebas) |
| **Herramientas** | Next.js + Supabase + GoDaddy + Cloudflare + GitHub Actions · ProjectLibre (cronograma) | — |

---

## 2.7 Plan de comunicaciones (breve)

Al ser proyecto chico, se reduce a lo esencial. La cercanía física (misma oficina que el auditor)
permite una validación ágil.

| Información | Audiencia | Frecuencia | Medio | Responsable |
|---|---|---|---|---|
| Avance y validación de entregables | Auditor (jefe de Sistemas) | Diaria / por entregable | En persona (misma oficina) | Gerardo |
| Coordinación de las fases operativas | Administración + TI | Al llegar a las fases 2 y 3 | Reunión breve | Auditor |
| Validación legal mínima (aviso SATAV, menores, ARCO, firma) | Auditor + Dirección/Legal si aplica | Antes de producción | Revisión documental breve | Gerardo / Auditor |
| Estado del proyecto en hitos clave | Dirección del IAQ | En hitos (H1–H6) | Vía jefe de Sistemas | Auditor |
| Reporte de pendientes / incidencias | Auditor + TI | Según ocurra | En persona / correo | Gerardo |

---

*Con este documento se completa el set de planeación (Docs 0–3). La **Bitácora de Control de Cambios**
y el **Acta de Cierre** (Doc 4) se abren y usan durante la ejecución y el cierre.*
