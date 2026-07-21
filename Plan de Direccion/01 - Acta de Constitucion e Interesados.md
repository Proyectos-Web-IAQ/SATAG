# Doc 1 — Acta de Constitución e Interesados

> **Plan de Dirección · Fase 1 (Iniciación)** · Entregable del Día 1
> Documentos del estándar incluidos: **1.1 Acta de Constitución** + **1.2 Registro de Interesados**
> Estado: v0.2 — pendientes resueltos; listo para validación del auditor (jefe de Sistemas).

| Proyecto | **SATAG** — Sistema de Adquisición de TAG Vehicular |
|---|---|
| Descripción | Alternativa web que reemplaza la hoja física de adquisición de TAG del IAQ |
| Cliente | Instituto Asunción de Querétaro AC (IAQ) — *cliente interno* (la propia escuela) |
| Naturaleza | Software a la medida **interno** — automatización de un proceso de la escuela; el desarrollo lo realiza personal de planta con salario fijo, **sin costo adicional** |
| Responsable / Desarrollador | Gerardo Sánchez Moreno — **Soporte TI Jr.** (desarrolla el proyecto en su totalidad) |
| Aprobador / Auditor | Miguel Ángel González Pacheco — Encargado del Departamento de Sistemas Computacionales (valida y acepta los entregables) |
| Fecha de emisión | 30-jun-2026 (act. 01-jul-2026) |
| Versión | v0.2 |

---

## 1.1 Acta de Constitución (Project Charter)

### Justificación / propósito

Hoy el alta de un usuario al estacionamiento del IAQ se hace **100% en papel**: una hoja de dos
caras que mezcla el **reglamento (22 cláusulas)** y la **captura manual** de datos del usuario y
su vehículo (nombre, marca/modelo/color, No. de dispositivo TAG, placas, estacionamiento asignado,
fecha y firma de aceptación).

Problemas del proceso actual:

- **Registros físicos dispersos**: difíciles de consultar, respaldar y proteger; se pueden perder,
  dañar o volverse ilegibles.
- **Sin búsqueda ni control centralizado**: no hay forma rápida de saber qué TAG o estacionamiento
  está asignado a quién, ni evitar duplicados.
- **Recaptura y trabajo manual**: cada alta se escribe a mano; no hay reportes.
- **Trazabilidad débil de la aceptación**: cuesta demostrar quién aceptó el reglamento y cuándo.

Una **alternativa web** elimina el papel, **centraliza los registros** en una base de datos
consultable, **agiliza la captura** (autoservicio del usuario + cierre por administración y TI) y
deja **evidencia digital con firma manuscrita y sello de tiempo** de la aceptación del reglamento.

### Objetivos (SMART)

1. **Reemplazar la hoja física**: poner en operación un formulario web que capture el 100% de los
   campos de la hoja actual + la aceptación del reglamento, antes del **28-jul-2026** (meta inicial 24-jul).
2. **Centralizar y consultar**: almacenar todos los registros en una base de datos con un panel
   administrativo que permita **buscar cualquier registro por nombre, placa, TAG o estacionamiento
   en < 5 segundos**.
3. **Agilizar el alta**: reducir el tiempo de registro respecto al papel, con meta de **≤ 3 minutos**
   por alta en ventanilla (campos validados, sin recaptura).
4. **Evidencia de aceptación**: que cada registro conserve la **aceptación con firma manuscrita
   digital**, la **versión del reglamento** y **fecha/hora**, y genere un **comprobante** (PDF/pantalla).
5. **Usabilidad**: que un administrativo pueda dar de alta un registro **sin manual** (curva de
   aprendizaje mínima).
6. **Trazar el proceso completo**: registrar el **estado del TAG** (pendiente → instalado →
   inactivo/repuesto), el **estacionamiento** y el **pago ($100, efectivo)** para control y reportes.

### Alcance general (alto nivel)

**Incluye:**
- **Formulario web** con el **reglamento (22 cláusulas)** y captura de datos (usuario + tipo +
  vehículo + placas) y **aceptación con firma manuscrita digital**.
- **Flujo en varias manos:** (1) **autoservicio** del usuario → registro *"pendiente"*;
  (2) **administración** asigna el **estacionamiento** y registra el **pago del TAG ($100, efectivo)**;
  (3) el **Depto. de TI** captura el **No. de TAG** y marca *"instalado"* al instalar.
- **Ciclo de vida del TAG/registro:** pendiente → instalado (activo) → inactivo/repuesto
  (una reposición inactiva el TAG anterior, según el reglamento).
- **Panel administrativo:** consulta, búsqueda, edición y **control de TAGs, estacionamientos, estados
  y pagos** (con reporte de *pendientes*).
- Almacenamiento en base de datos + **comprobante** del registro y de la aceptación.

**No incluye (exclusiones — críticas contra scope creep):**
- **Integración con hardware** de control de acceso (lector RFID/TAG, apertura de pluma/barrera).
  *Se documenta como posible evolución futura (anexo/roadmap), no prioritaria.*
- **Pago en línea** del TAG (el cobro es presencial, en efectivo; el sistema solo **registra** el pago).
- App móvil nativa (se cubre con web responsiva).
- Migración masiva del histórico en papel (se evalúa aparte si se solicita).

*(Detalle fino del alcance, modelo de datos y EDT/WBS → Doc 2.)*

### Criterios de éxito

- El IAQ **deja de usar la hoja de papel** para nuevos registros.
- **Todos los campos** de la hoja actual están cubiertos y **validados** (formatos de placa, TAG, etc.).
- La **aceptación del reglamento** queda registrada con **firma manuscrita digital**, versión del
  reglamento y sello de tiempo.
- El administrador encuentra **cualquier registro en segundos** y ve su **estado y pago**.
- **Aceptación formal** del producto por el **auditor (jefe de Sistemas)** (firma del acta de cierre).

### Hitos principales

| Hito | Descripción | Fecha objetivo (tentativa) | Estado (20-jul-2026) |
|---|---|---|---|
| H1 | Planeación aprobada (Plan de Dirección) | 01-jul-2026 | ✅ Cumplido |
| H2 | Diseño aprobado (UI + modelo de datos) | 07-jul-2026 | ✅ Cumplido |
| H3 | MVP: formulario + firma + guardado (fase autoservicio) | 14-jul-2026 | ✅ Cumplido |
| H4 | Panel admin + fase de administración (pago) e instalación con estacionamiento (No. de TAG, a cargo de TI) | 18-jul-2026 | ✅ Cumplido |
| H5 | Pruebas y ajustes | 22-jul-2026 | 🔄 En curso (banco de QA `seed_tests_dev.sql`) |
| H6 | Despliegue, entrega y aceptación | 28-jul-2026 (meta inicial 24-jul; ajustada a ~03-ago) | 🔄 Ya desplegado en Vercel desde `main`; faltan entrega, manual y aceptación formal |

> **Alcance añadido después del Acta** (ver bitácora, Doc 4): folio de recibo automático (CC-18),
> apartar y usar el TAG apartado (CC-19) y buzón de notas sin folio (CC-20). Pendiente activo:
> **corte de caja / finanzas**.

*(Fechas finas se calculan en el Cronograma — Doc 2.)*

### Presupuesto preliminar (orden de magnitud)

**Naturaleza del costeo:** proyecto **interno**. El desarrollo lo hace personal de planta
(Soporte TI) con **salario fijo** y **sin pago extra** por este proyecto. Por eso el "presupuesto"
no es un precio facturable; se entiende en tres planos:

- **Costo interno (referencia, no se factura):** ≈ **3 semanas** de esfuerzo full-stack
  (referencia: proyecto anterior). Se puede expresar como horas-persona × costo/hora de referencia
  derivado del salario, solo para **dimensionar la inversión de tiempo** de la escuela. No genera cobro.
- **Gasto real out-of-pocket: $0 por ahora** — se reutiliza la infraestructura que la escuela **ya
  tiene contratada** (GoDaddy + Cloudflare + Supabase de SEVAD). Se documenta por si a futuro surge un
  costo (plan mayor de Supabase, licencias, etc.).
- **Reservas del estándar:** la contingencia (5%) y la reserva de gestión (8%) se usan aquí como
  **colchón de tiempo/esfuerzo**, no como margen de precio; el 12% de indirectos **no** aplica como
  sobreprecio.

*(Detalle —horas por actividad, costo/hora de referencia y gasto de infraestructura— en el Doc 3,
con este enfoque interno.)*

### Riesgos de alto nivel

| # | Riesgo | Por qué importa |
|---|---|---|
| RA1 | **Datos personales** (nombres, placas) | Obligación legal (LFPDPPP): **aviso de privacidad** y manejo cuidadoso; RLS estricta. |
| RA2 | **Firma manuscrita digital con valor probatorio** | El IAQ la exige; hay que capturarla y conservarla como evidencia (imagen + versión del reglamento + sello de tiempo + firmante) y verificar respaldo legal. |
| RA3 | **Scope creep hacia hardware** | Presión por integrar lector/pluma; mitigado por la exclusión explícita (documentado como futuro). |
| RA4 | **Disponibilidad del auditor** | **Baja**: el jefe está en la misma oficina y valida el mismo día. Riesgo residual mínimo. |
| RA5 | ~~Hosting/infra no definido~~ **(resuelto)** | Se reutiliza la infraestructura de SEVAD (GoDaddy + Cloudflare + Supabase). Cerrado. |
| RA6 | **Registros "pendientes" acumulados** | El flujo en varias manos deja registros a medias (sin estacionamiento, pago o TAG). Mitigar con estados + reporte de pendientes en el panel. |
| RA7 | **Conciliación del pago en efectivo** | El cobro ($100, efectivo) ocurre fuera del sistema; registrarlo bien (quién cobró, cuándo, folio) para evitar descuadres. Definir control. |

*(Análisis cualitativo y respuestas → Matriz de Riesgos, Doc 3.)*

### Interesados clave

Auditor/aprobador (Miguel Ángel González Pacheco, jefe de Sistemas), usuarios finales (padres de
familia, empleados, alumnos de prepa), **personal administrativo** (asigna estacionamiento y cobra el
TAG), **Departamento de TI** (instala TAGs y completa el registro), y el responsable/desarrollador (Gerardo).
*(Detalle → §1.2.)*

### Autoridad del PM

Gerardo Sánchez Moreno (**Soporte TI Jr.**) actúa como **responsable y desarrollador** del
proyecto. Tiene autoridad para:
- Elegir **tecnología, arquitectura y hosting**. Decisión preliminar: reutilizar la base técnica de
  un sistema interno previo (Next.js estático + Supabase + GoDaddy/Cloudflare + despliegue por
  GitHub Action) para reducir riesgo y tiempo; detalle en el Doc 2.
  *(Ejecutado 20-jul-2026: se reutilizó el stack, pero el despliegue final es **Vercel desde `main`**
  —cada push publica en producción—, sin GitHub Action ni FTPS. El principio "push a `main` =
  producción" se mantiene; cambia el vehículo.)*
- Definir y gestionar el **cronograma** y sus recursos.
- Proponer alcance y diseño.

Quedan **reservados al auditor/jefe de Sistemas (Miguel Ángel González Pacheco)**: la aprobación del
alcance, la aceptación final del producto y cualquier cambio que afecte tiempo/costo (vía Bitácora de
Control de Cambios, Doc 4).

---

## 1.2 Registro de Interesados

| Interesado | Rol | Influencia | Interés | Estrategia |
|---|---|---|---|---|
| Miguel Ángel González Pacheco — Encargado de Sistemas Computacionales | **Auditor / Aprobador** | Alta | Alto | **Gestionar de cerca**: valida y acepta entregables (mismo día, misma oficina) |
| Gerardo Sánchez — Soporte TI Jr. | **Responsable / Desarrollador** | Alta | Alto | Ejecutor: desarrolla el proyecto completo |
| Departamento de Sistemas / TI (4 personas) | **Operativo**: instala TAGs y **completa el registro** (No. de TAG + estado) | Media | Alto | **Involucrar**: definen y prueban la fase de instalación |
| Personal administrativo de la Asunción | **Operativo**: asigna **estacionamiento** y **cobra el TAG ($100, efectivo)** | Media | Alto | **Involucrar**: definir el registro de pago y la asignación de estacionamiento |
| Padres de familia / empleados / alumnos de prepa | **Usuarios finales** (autoservicio) | Baja | Alto | **Mantener informado**; priorizar usabilidad |
| Porteros / personal de estacionamiento | Operación del estacionamiento (verifican TAG) | Baja | Medio | Mantener informado |
| Dirección del IAQ | Autoridad institucional | Alta | Medio | Mantener satisfecho (vía jefe de Sistemas) |