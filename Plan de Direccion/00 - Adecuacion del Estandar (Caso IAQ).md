# Adecuación del Estándar al Caso IAQ

> **Documento 0 del Plan de Dirección** · Punto 1 de la planeación
> Define cómo se aplica mi *Plantilla Maestra de Gestión de Proyectos (PMBOK · v1.0)*
> a este proyecto en concreto. No reemplaza al estándar: lo *instancia* para este caso.

| Campo | Valor |
|---|---|
| **Proyecto** | **SATAV** — Sistema de Adquisición de TAG Vehicular |
| **Descripción** | Alternativa web para reemplazar la hoja de adquisición de TAG vehicular del IAQ |
| **Repo / clave** | `satav` (GitHub) |
| **Cliente** | Instituto Asunción de Querétaro AC (IAQ) — *”la escuela”* (cliente interno) |
| **Naturaleza** | Software a la medida **interno** (automatización de proceso de la escuela); sin costo adicional al salario |
| **PM / Desarrollador** | Gerardo Sánchez Moreno — Soporte TI / desarrollo web interno del IAQ |
| **Solicitado por / Audita** | Miguel Ángel González Pacheco — Encargado del Departamento de Sistemas Computacionales (valida y acepta los entregables; no hay "patrocinador" formal) |
| **Fecha de planeación** | 30-jun-2026 → 01-jul-2026 (se cierra hoy) |
| **Estimación de desarrollo** | ~3 semanas (referencia: proyecto anterior) |
| **Versión** | v0.1 (borrador de planeación) |

---

## 1. Entendimiento del encargo

La hoja física actual del IAQ cumple **dos funciones en un solo papel** (2 caras):

1. **Reglamento y condiciones de uso del estacionamiento** — 22 cláusulas que el usuario debe
   conocer y aceptar (costos, asignación de TAG, responsabilidad por daños/robo, horarios
   6:30–17:00, velocidad máx. 10 km/h, reglas para padres de familia,
   empleados y alumnos de prepa, uso de la pluma, etc.).
2. **Captura de datos + aceptación firmada** — campos y **quién los llena**:
   - Nombre de usuario · tipo (padre de familia / empleado / alumno de prepa) — *usuario*
   - Marca / Modelo / Color del vehículo · **Placas** — *usuario*
   - Fecha · **Nombre y firma** (aceptación del reglamento) — *usuario (firma manuscrita digital)*
   - **Estacionamiento asignado** (número del estacionamiento de la escuela al que tiene acceso — la escuela tiene varios; **no** es un cajón individual) — *lo define el personal administrativo de la Asunción*
   - **Pago del TAG: $100 MXN, solo efectivo** — *lo cobra y registra el personal administrativo (no es pago en línea)*
   - **No. de Dispositivo Asignado (TAG)** — *lo llena el Departamento de TI al instalar el TAG*

**Encargo del jefe (textual):** *“Alternativa web para reemplazar hoja de adquisición de tag vehicular.”*

**Traducción a producto:** un sistema web que (1) presente el reglamento, (2) capture los datos
del usuario y vehículo, (3) registre la **aceptación con firma manuscrita digital**, (4) permita a
**administración** asignar el **estacionamiento** y registrar el **pago ($100 efectivo)**, (5) permita
al **Departamento de TI** capturar el **No. de TAG** y el estado al instalar, y (6) almacene y permita
consultar/administrar todos los registros que hoy viven en papel.

**Flujo en varias manos (confirmado):**
1. **Autoservicio (usuario)** — captura sus datos, vehículo y placas, y **firma** el reglamento
   (firma manuscrita digital). El registro queda **"pendiente"** (sin estacionamiento, sin pago, sin No. de TAG).
2. **Administración (personal de la Asunción)** — **asigna el estacionamiento** y **cobra el TAG:
   $100 MXN, solo efectivo**, registrando el pago en el sistema (cobro presencial, no en línea).
3. **Instalación (Depto. de TI)** — al instalar el TAG, captura el **No. de Dispositivo** (solo
   visible en ese momento) y marca el registro como **"instalado"**. Después se registran los estados
   siguientes (p. ej. inactivo/repuesto, según el reglamento).

> ✅ **Frontera de alcance (confirmada):** por ahora se digitaliza el **formulario y su expediente**
> (+ panel admin); **no** se integra el hardware de control de acceso (lector del TAG, pluma/barrera,
> RFID). Esa integración **queda documentada como posible evolución futura** (no prioritaria).

---

## 2. Clasificación del tamaño del proyecto

El estándar clasifica con: *“● GRANDES = múltiples fases, equipo >3, >2 meses o cliente complejo.”*

| Criterio | Este proyecto | ¿GRANDE? |
|---|---|---|
| Duración | ~3 sem desarrollo + 3 d planeación (≈1 mes) | No (<2 meses) |
| Tamaño de equipo | 1 desarrollador (Gerardo); el área de TI son 4, pero el desarrollo es individual | No (≤3) |
| Fases | Una entrega principal | No |
| Complejidad del cliente | Cliente interno, un aprobador (jefe de TI), alcance acotado | No |

**Clasificación: PROYECTO CHICO — con rigor elevado.**

Es decir: se aplica el **set reducido** de documentos del estándar (se *fusionan* en un Plan de
Dirección único y se *omiten* los marcados ● GRANDES), **con profundidad y buen detalle**. Si el
proyecto lo amerita, pueden *elevarse* documentos puntuales a su versión GRANDE (señalados abajo como
“opcional elevar”).

---

## 3. Documentos que aplican a este proyecto

Leyenda: ✅ se genera · 🔗 se fusiona con otro · ⏸️ se omite (chico) · ⬆️ opcional elevar

| # | Documento del estándar | Etiqueta orig. | Decisión para IAQ | Vive en |
|---|---|---|---|---|
| 1.1 | Acta de Constitución (Charter) | ✓ TODOS | ✅ | Doc 1 |
| 1.2 | Registro de Interesados | ✓ TODOS | ✅ | Doc 1 |
| 2.1 | Enunciado del Alcance + EDT/WBS | ✓ TODOS | ✅ | Doc 2 |
| 2.2 | Diccionario de la WBS | ● GRANDES | ⏸️ (⬆️ opcional) | — |
| 2.3 | Cronograma (AON, ruta crítica, Gantt) | ✓ TODOS | ✅ (ProjectLibre) | Doc 2 |
| 2.4 | Estimación de Costos y Presupuesto | ✓ TODOS | ✅ | Doc 3 |
| 2.5 | Matriz de Riesgos | ✓ TODOS | ✅ | Doc 3 |
| 2.6 | Matriz RACI y Plan de Recursos | ✓ TODOS | ✅ | Doc 3 |
| 2.7 | Plan de Comunicaciones | ● GRANDES | 🔗 versión breve (1 línea/tabla mínima) | Doc 3 |
| 3.1 | Bitácora de Control de Cambios | ✓ TODOS | ✅ (se abre vacía, se usa en ejecución) | Doc 4 |
| 3.2 | Reporte de Avance / Valor Ganado (EVM) | ● GRANDES | ⏸️ → % de avance simple | — |
| 4.1 | Acta de Cierre y Lecciones Aprendidas | ✓ TODOS | ✅ (al cierre) | Doc 4 |

### Agrupación física (set chico → 4 documentos)

- **Doc 1 — Inicio:** Acta de Constitución + Registro de Interesados
- **Doc 2 — Alcance y tiempo:** Enunciado del Alcance + WBS + Cronograma (con Gantt de ProjectLibre)
- **Doc 3 — Costos, riesgos y responsables:** Costos + Matriz de Riesgos + RACI + Comunicaciones (breve)
- **Doc 4 — Ejecución y cierre:** Bitácora de Cambios (durante) + Acta de Cierre (al final)

Más este **Doc 0** (esta adecuación) como portada/índice del Plan de Dirección.

---

## 4. Defaults del estándar para este proyecto

Tomados del estándar; se confirman o ajustan aquí:

| Parámetro | Default del estándar | Para IAQ |
|---|---|---|
| Costos indirectos | 12% sobre directos | 12% (sin cambio) |
| Reserva de contingencia | 5% (a actividades de mayor riesgo) | 5% (sin cambio) |
| Reserva de gestión | 8% del presupuesto base | 8% (sin cambio) |
| Estimación de duración | PERT 3 puntos: tₑ=(a+4b+c)/6 | PERT en tareas inciertas; análoga donde haya referencia del proyecto anterior |
| Cronograma | ProjectLibre | ProjectLibre |
| Documentos | python-docx / docx-js | Markdown durante planeación → export a Word al consolidar |
| **Redacción de textos de usuario** | Trato formal **"de usted"** e inclusivo *(estándar para todos los proyectos — junta 03-jul)* | "De usted" e inclusivo (p. ej. "Padre / Madre / Tutor") en UI, reglamento, aviso de privacidad, comprobante y manual |

> **Nota — costeo de proyecto interno:** al ser un desarrollo **interno** con desarrollador de
> **salario fijo** y **sin pago extra**, los indirectos (12%) **no** se aplican como sobreprecio;
> la contingencia (5%) y la reserva de gestión (8%) se usan como **colchón de tiempo/esfuerzo**, no
> como margen. **Gasto real out-of-pocket: por ahora $0** — se reutiliza el hosting/dominio que la
> escuela **ya tiene contratado** (misma infraestructura de SEVAD: GoDaddy + Cloudflare + Supabase).
> Se deja registrado por si a futuro surge algún costo (licencias, plan mayor de Supabase, etc.). El
> Doc 3 (Costos) se redacta con este enfoque (costo interno de referencia + gasto out-of-pocket ≈ $0).

---

## 5. Organización de carpetas (mejor orden)

```
Tag Vehicular/
├─ Plan de Direccion/     ← documentos de gestión (este Plan)
│   ├─ 00 - Adecuacion del Estandar (Caso IAQ).md   ← este archivo
│   ├─ 01 - Acta de Constitucion e Interesados.md
│   ├─ 02 - Alcance, WBS y Cronograma.md
│   ├─ 03 - Costos, Riesgos y RACI.md
│   └─ 04 - Cierre.md          (al final)
├─ Insumos/               ← material original (fotos de la hoja, estándar)
├─ Investigacion/         ← investigación a profundidad (research)
└─ Entregables/           ← la app, mockups, esquema de BD, etc.
```

*(Nota: las 2 fotos originales se **borraron** por contener datos personales; el `.docx` del estándar
permanece en la raíz, excluido del repo por `.gitignore`.)*

---

## 6. Secuencia y calendario de planeación (cierre 01-jul)

El orden importa: cada documento alimenta al siguiente
(Charter → Interesados → Alcance/WBS → Cronograma → Costos → Riesgos → RACI → Comunicaciones → consolidar).

| Día | Fecha | Entregable |
|---|---|---|
| **Día 1** | mar 30-jun ✔ | Doc 0 (adecuación) · **Doc 1** (Charter + Interesados) · Playbook técnico (reuso de SEVAD) |
| **Día 2 — cierre** | mié 01-jul | **Doc 2** (Alcance + WBS + Cronograma) · **Doc 3** (Costos + Riesgos + RACI + Comunicaciones) · **consolidar** Plan de Dirección |

> La **investigación a profundidad** (control de acceso vehicular / TAG, firma de aceptación
> digital, y obligaciones de datos personales en México — LFPDPPP / aviso de privacidad) se corre
> como apoyo del Alcance en Día 1–2 y se archiva en `Investigacion/`.

---

## 7. Decisiones tomadas (resueltas)

1. **Frontera de alcance:** digitalizar el **formulario + expediente + panel admin**; **sin**
   hardware (documentado como evolución futura).
2. **Flujo en varias manos:** (a) **autoservicio** — el usuario captura sus datos y firma;
   (b) **administración** asigna el **estacionamiento** y cobra el **TAG ($100 MXN, solo efectivo)**;
   (c) **Depto. de TI** captura el **No. de TAG** y marca "instalado".
3. **Equipo / rol:** desarrolla **Gerardo solo** (Soporte TI Jr.); **audita y valida** Miguel Ángel
   González Pacheco (Encargado de Sistemas Computacionales). Área de TI = 4 personas.
4. **Stack / hosting:** reutilizar la base de **SEVAD** (Next.js estático + Supabase + GoDaddy/
   Cloudflare + GitHub Action). Sin gasto extra (infra ya contratada).
5. **Firma de aceptación:** el IAQ pide **firma manuscrita digital**.
6. **Pago:** $100 MXN por TAG, **solo efectivo**, presencial; el sistema **registra** el pago (no lo
   procesa en línea).
7. **Fecha meta:** **24-jul-2026** (validada).
