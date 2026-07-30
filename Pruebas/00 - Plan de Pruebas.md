# Plan de Pruebas — SATAG

> **WBS 1.8 · Pruebas y aseguramiento** · Est. 3 días · Actividad crítica del cierre.
> Versión **v1.0** · 28-jul-2026 · Responsable de ejecución: Gerardo Sánchez (TI).

| | |
|---|---|
| **Producto bajo prueba** | SATAG — Sistema de Adquisición de TAG Vehicular (IAQ) |
| **Versión auditada** | commit `c27aeff` · bloques SQL `00`→`48` |
| **Entorno** | Proyecto Supabase de **desarrollo/QA** + build local o preview de Vercel |
| **Documentos relacionados** | [Matriz de casos](01%20-%20Matriz%20de%20Casos.md) · [Bitácora de ejecución](02%20-%20Bitacora%20de%20Ejecucion.md) · [Checklist legal E6](../Entregables/E6%20-%20Cumplimiento%20Legal%20y%20Privacidad/E6%20-%20Checklist%20Legal%20y%20Privacidad%20SATAG.md) |

---

## 1. Objetivo y alcance

Verificar, con evidencia registrable, que SATAG cumple los **criterios de aceptación** del
[Doc 2 §2.1](../Plan%20de%20Direccion/02%20-%20Alcance%2C%20WBS%20y%20Cronograma.md) antes de la aceptación
institucional y del acta de cierre.

**Dentro del alcance** — las cinco dimensiones que exige la WBS 1.8:

| Dimensión | Qué se prueba | Casos |
|---|---|---|
| **F · Funcional** | Los tres flujos completos: autoservicio, Administración (cobro y corte), TI (instalación, actualización, baja, notas) | `F-01`…`F-24` |
| **P · Privacidad / RLS / RPC / Storage** | Que `anon` no lea PII, que el panel exija MFA y rol, que no haya escritura directa fuera de RPC y que el bucket de firmas sea privado | `P-01`…`P-12` |
| **E · Evidencia de firma** | Que la firma se conserve verificable: PNG en bucket privado, hash SHA-256, versión de reglamento y aviso, sello de tiempo, gestionante en menores | `E-01`…`E-06` |
| **A · ARCO y ciclo de vida** | Acceso, rectificación, cancelación/bloqueo y oposición por los canales previstos (buzón con folio, nota sin folio, panel de TI) | `A-01`…`A-08` |
| **U · Usabilidad** | Que un administrativo y un miembro de TI completen su tarea sin manual y sin ayuda | `U-01`…`U-05` |

**Fuera del alcance:** integración con hardware de acceso (ZKBioSecurity, SC-006), pago en línea,
app nativa, migración del histórico en papel y NOM-151 (diferida, CC-14).

---

## 2. Estrategia

Las pruebas son **manuales y guionadas**: el proyecto no tiene framework de pruebas automatizadas y
montarlo ahora no cabe en el cronograma de cierre. A cambio, cada caso está escrito para ser
**reproducible por un tercero** (auditor) con el banco de datos versionado.

- **Base de datos:** se parte siempre del banco de QA `supabase/sql/seed_tests_dev.sql`, que deja un
  padrón conocido de 14 escenarios con folios nemotécnicos. Reejecutarlo entre tandas garantiza que
  cada caso arranque del mismo estado.
- **Verificación de la capa de datos:** las pruebas P (privacidad) se ejecutan desde el **SQL Editor**
  de Supabase y desde la consola del navegador con el cliente `anon`, no solo desde la interfaz —
  una fuga de RLS no se ve en la pantalla.
- **Evidencia:** cada caso se registra en la [bitácora de ejecución](02%20-%20Bitacora%20de%20Ejecucion.md)
  con fecha, resultado y captura o salida SQL cuando aplique.

### Datos de prueba (banco QA)

| Folios | Escenario |
|---|---|
| `SATAG-000101`…`104` | Pendiente **sin** pago → Admin "por cobrar" |
| `…111`…`114` | Pendiente **con** pago → TI "Instalar TAG" |
| `…121`…`124` | Activo instalado (sin pendientes) |
| `…131`…`134` | Baja (histórico) |
| `…141`…`144` | Activo + solicitud con folio: **actualizar** |
| `…151`…`154` | Activo + solicitud con folio: **baja** |
| `…161`…`164` | Activo + nota vinculada que pide **baja** |
| `…171`…`174` | Activo + nota vinculada que pide **actualizar** |
| `…181`…`184` | Alta con pago → listos para instalar |
| `…191`…`194` | Alta sin pago → "Esperando pago" (gris) |
| `…201`…`206` | Gemelos de las 6 notas sin vincular (para probar la vinculación por nombre) |
| `…211`…`214` | TAG propio + TAG apartado + reinstalación (CC-01) |
| *(sin folio)* | 6 notas sin vincular en la cola "Notas sin expediente" |

> ⚠️ `seed_tests_dev.sql` **borra todos los datos** y desactiva temporalmente el blindaje contable del
> bloque 42 para poder truncar. **Nunca** debe ejecutarse contra la base donde Administración ya cortó
> caja. Las pruebas de esta tanda corren en el proyecto de desarrollo/QA.

### Cuentas necesarias

Se requiere una cuenta por rol, todas con **MFA (TOTP) inscrito**, porque el panel exige `aal2`:

| Rol | Ve | Uso en las pruebas |
|---|---|---|
| `admin` | Administración · Finanzas · Consulta | Cobro, corte de caja |
| `ti` | TI | Instalación, actualización, baja, notas |
| `consulta` | Consulta | Solo lectura (verificar que no pueda escribir) |
| `super` | Las cuatro pestañas | Recorrido completo del flujo |
| *(sin rol)* | — | Verificar la pantalla "Sin rol asignado" |

---

## 3. Criterios

### Entrada (antes de empezar)
- [ ] Banco de QA aplicado en el proyecto de desarrollo y padrón visible en el panel.
- [ ] Las cinco cuentas de prueba existen, con MFA inscrito donde corresponde.
- [ ] Build en verde: `npx tsc --noEmit` y `npm run build` sin errores.

### Salida (para declarar la actividad terminada)
- [ ] **100 % de los casos P (privacidad/RLS) ejecutados y aprobados.** Un solo fallo aquí bloquea el
      cierre: es el criterio de aceptación *"la app no expone datos de un usuario a otro"*.
- [ ] **100 % de los casos E (firma)** aprobados — sostienen el valor probatorio del consentimiento.
- [ ] ≥ 95 % de los casos F aprobados; los no aprobados, registrados como defecto con severidad.
- [ ] Casos A ejecutados y su resultado reflejado en el checklist legal E6.
- [ ] Casos U ejecutados con **personal real** (un administrativo y un miembro de TI), no por el
      desarrollador.
- [ ] Bitácora de ejecución firmada con fecha.

### Severidad de defectos

| Nivel | Definición | Efecto |
|---|---|---|
| **Crítico** | Fuga de PII, escritura sin control de rol, pérdida o corrupción de evidencia de firma, doble cobro, corte alterable | Bloquea el cierre. Se corrige y se reejecuta la dimensión completa |
| **Mayor** | Un flujo del negocio no puede completarse por la vía prevista | Se corrige antes de la aceptación |
| **Menor** | Texto, formato, orden de columnas, comodidad | Se documenta; puede diferirse a fase 2 |

---

## 4. Riesgos conocidos que las pruebas deben confirmar

La auditoría del 28-jul dejó cuatro puntos abiertos. **Tres se cerraron antes de empezar las
pruebas**, así que los casos correspondientes ya no documentan un hallazgo: ahora **comprueban
que la corrección quedó bien aplicada**.

1. **Bloques 05, 09 y 20** aceptaban cualquier sesión `authenticated + aal2` para escribir
   catálogos, documentos y Storage. **Cerrado el 28-jul** con el bloque 43 (SC-009): la escritura
   exige rol `admin`/`super`. Casos `P-08`…`P-10` verifican el reparto por rol.
2. **Sin rate limiting ni CAPTCHA** en los RPC públicos `crear_solicitud` y `crear_nota_solicitud` —
   **sigue abierto, riesgo aceptado**. Caso `P-11` documenta el comportamiento actual.
3. **Aviso simplificado y página pública** del aviso. **Cerrado el 28-jul** con el bloque 44 y la
   página `/aviso-de-privacidad` (SC-007). Caso `A-07`.
4. **Validación del tipo de usuario al cobrar (B5)**. **Cerrada el 29-jul** con el bloque 46: el
   cobro exige confirmar el tipo y sella quién lo validó. Casos `F-29`…`F-33`.

Del último día de desarrollo (29-jul) entran además dos entregas que se prueban por primera vez y
no traen historia previa: el **reporte de expedientes incompletos** (B2/CC-02, casos `F-34`…`F-38`)
y la **firma visible en el panel con URL firmada** (SC-008, casos `E-07`…`E-11` y `P-13`).

---

## 5. Calendario propuesto

| Día | Tanda | Contenido |
|---|---|---|
| 28-jul (tarde) | Preparación | Banco de QA, cuentas, build en verde |
| 29-jul | **P + E** | Privacidad/RLS/RPC/Storage y evidencia de firma — lo que bloquea el cierre |
| 30-jul | **F** | Los tres flujos completos |
| 31-jul | **A + U** | ARCO y usabilidad con personal real |
| 03-ago | Cierre | Corrección de defectos y reejecución de lo que haya fallado |

*(Se traslapa con manual + capacitación; las pruebas U pueden hacerse durante la misma sesión con el
personal, aprovechando que ya están reunidos.)*
