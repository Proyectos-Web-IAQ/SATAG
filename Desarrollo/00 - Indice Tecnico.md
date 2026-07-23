# Índice Técnico — SATAG

> **Desarrollo · Documentación técnica viva**
> Esta carpeta contiene el diseño técnico que traduce el Plan de Dirección en decisiones implementables.

> **Fuente de verdad del esquema aplicado:** los bloques SQL numerados de
> [`supabase/sql/`](../supabase/sql/README.md) (`00`→`42`), que es lo que corre en producción. Estos
> documentos describen el diseño y su estado; ante cualquier duda sobre una tabla, columna o RPC, manda
> el SQL aplicado. (`supabase/schema.sql` es un respaldo histórico atrasado.)

| Documento | Fuente de verdad para | Estado |
|---|---|---|
| [`01 - Modelo de Datos y Base de Datos.md`](01%20-%20Modelo%20de%20Datos%20y%20Base%20de%20Datos.md) | Datos, modelo relacional, tablas, reglas de BD, RLS, RPC y Supabase | ✅ En producción |
| [`02 - Modelo de Dominio POO.md`](02%20-%20Modelo%20de%20Dominio%20POO.md) | Clases, objetos de dominio, comportamiento y mapeo clase-tabla | ✅ Al día |
| [`03 - Arquitectura Tecnica.md`](03%20-%20Arquitectura%20Tecnica.md) | Next.js estático, Supabase, hosting, deploy y estructura de código | ✅ En producción (*as-built*) |
| [`04 - Seguridad, RLS y Privacidad.md`](04%20-%20Seguridad%2C%20RLS%20y%20Privacidad.md) | Políticas RLS, roles, Storage privado, datos personales y LFPDPPP | ✅ Implementado; falta validación Dirección/Legal |
| [`05 - Flujos del Sistema.md`](05%20-%20Flujos%20del%20Sistema.md) | Autoservicio, administración, instalación TI, baja, reposición, buzón de notas y tag propio | ✅ En producción (*as-built*) |
| [`06 - Firma Electronica (mecanica y valor legal).md`](06%20-%20Firma%20Electronica%20(mecanica%20y%20valor%20legal).md) | Mecánica de la firma simple reforzada, valor legal y módulo reutilizable | ✅ Implementada (el módulo aún no se extrae a su propio paquete) |
| [`07 - MFA (Autenticacion Multifactor).md`](07%20-%20MFA%20(Autenticacion%20Multifactor).md) | MFA del panel: TOTP, forzado por RLS `aal2` y runbook de reset | ✅ Implementado |

**Features recientes y dónde se documentan:** cobro con folio de recibo automático (01 §9, 05 §3),
apartar y usar el TAG apartado — CC-01 (05 §4-§5), buzón de notas sin folio — SC-003 (05 §7),
roles finos y MFA (04 §3, 07), y **corte de caja / finanzas** (01 §9-bis, 05 §9, bloque SQL 42).
Pendiente activo: reporte de registros incompletos (B2).

---

## Relación con el Plan de Dirección

El Plan de Dirección define alcance, cronograma y entregables. Esta carpeta aterriza el diseño técnico.

| Plan / WBS | Documento técnico |
|---|---|
| WBS 1.2.1 Modelo de datos | `01 - Modelo de Datos y Base de Datos.md` |
| WBS 1.2.2 Diseño UI/UX | `05 - Flujos del Sistema.md` y futuros mockups |
| WBS 1.2.3 Definición legal | `04 - Seguridad, RLS y Privacidad.md` |
| WBS 1.3 Infraestructura | `03 - Arquitectura Tecnica.md` |

**Entregables legales de apoyo:** [`Aviso de Privacidad SATAG`](../Entregables/E6%20-%20Cumplimiento%20Legal%20y%20Privacidad/E6%20-%20Aviso%20de%20Privacidad%20SATAG.md) y [`Checklist Legal y Privacidad SATAG`](../Entregables/E6%20-%20Cumplimiento%20Legal%20y%20Privacidad/E6%20-%20Checklist%20Legal%20y%20Privacidad%20SATAG.md).

---

## Regla de organización

- Si habla de **tablas, columnas, constraints, índices, RLS o RPC**, vive en el documento de datos.
- Si habla de **clases, métodos, comportamiento, servicios o repositorios**, vive en el documento POO.
- Si habla de **hosting, build, deploy o variables de entorno**, vive en arquitectura técnica.
- Si habla de **privacidad, permisos, firma o acceso a datos personales**, vive en seguridad.
- Si habla de **pantallas, pasos y actores**, vive en flujos del sistema.
