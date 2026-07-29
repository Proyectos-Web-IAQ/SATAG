# Bitácora de Ejecución de Pruebas — SATAG

> Registro de evidencia de la actividad **WBS 1.8**. Se llena **durante** la ejecución, un renglón por
> caso de la [matriz](01%20-%20Matriz%20de%20Casos.md). Es el entregable que respalda el acta de cierre.

| | |
|---|---|
| **Versión probada** | *(commit)* |
| **Entorno** | Proyecto Supabase de desarrollo/QA |
| **Ejecutó** | Gerardo Sánchez — Soporte TI Jr. |
| **Atestiguó** | *(auditor, cuando aplique)* |

**Resultado:** ✅ Aprobado · ❌ Fallido · ⚠️ Aprobado con observación · ⏭️ No ejecutado

---

## Preparación

| Verificación | Fecha | Resultado | Nota |
|---|---|---|---|
| Banco de QA aplicado (`seed_tests_dev.sql`) | | | |
| Cuentas por rol con MFA inscrito | | | |
| `npx tsc --noEmit` en verde | | | |
| `npm run build` en verde | | | |

## Tanda P · Privacidad, RLS, RPC y Storage

| Caso | Fecha | Resultado | Evidencia / observación |
|---|---|---|---|
| P-01 | | | |
| P-02 | | | |
| P-03 | | | |
| P-04 | | | |
| P-05 | | | |
| P-06 | | | |
| P-07 | | | |
| P-08 | | | |
| P-09 | | | *(comprueba el bloque 43, aplicado 28-jul)* |
| P-10 | | | *(comprueba el bloque 43, aplicado 28-jul)* |
| P-11 | | | *(riesgo aceptado: sin rate limiting)* |
| P-12 | | | |
| P-13 | | | *(bloque 48: `consulta` lee la firma pero no escribe nada)* |
| P-14 | | | *(vistas `security_invoker`, bloques 45 y 47)* |

## Tanda E · Evidencia de firma

| Caso | Fecha | Resultado | Evidencia / observación |
|---|---|---|---|
| E-01 | | | |
| E-02 | | | |
| E-03 | | | |
| E-04 | | | |
| E-05 | | | |
| E-06 | | | |
| E-07 | | | *(SC-008, bloque 47)* |
| E-08 | | | |
| E-09 | | | |
| E-10 | | | *(bloque 48; anotar el riesgo aceptado, no como fallo)* |

## Tanda F · Funcional

| Caso | Fecha | Resultado | Evidencia / observación |
|---|---|---|---|
| F-01 | | | |
| F-02 | | | |
| F-03 | | | |
| F-04 | | | |
| F-05 | | | |
| F-06 | | | |
| F-07 | | | |
| F-08 | | | |
| F-09 | | | *(B5 ya conectado: ver F-29…F-33)* |
| F-10 | | | |
| F-11 | | | |
| F-12 | | | |
| F-13 | | | |
| F-14 | | | |
| F-15 | | | |
| F-16 | | | |
| F-17 | | | |
| F-18 | | | |
| F-19 | | | |
| F-20 | | | |
| F-21 | | | |
| F-22 | | | |
| F-23 | | | |
| F-24 | | | |
| F-25 | | | |
| F-26 | | | |
| F-27 | | | |
| F-28 | | | |
| F-29 | | | *(CC-05, bloque 46)* |
| F-30 | | | |
| F-31 | | | *(desde el SQL Editor)* |
| F-32 | | | |
| F-33 | | | |
| F-34 | | | *(CC-02, bloque 45 · folios `…221`…`…226`)* |
| F-35 | | | |
| F-36 | | | |
| F-37 | | | |
| F-38 | | | |
| F-39 | | | *(aviso corto plegable: verificar SIN desplegarlo)* |

## Tanda A · ARCO y ciclo de vida

| Caso | Fecha | Resultado | Evidencia / observación |
|---|---|---|---|
| A-01 | | | |
| A-02 | | | |
| A-03 | | | |
| A-04 | | | |
| A-05 | | | |
| A-06 | | | |
| A-07 | | | *(se espera hallazgo → SC-007)* |
| A-08 | | | |

## Tanda U · Usabilidad

| Caso | Fecha | Participante (rol, no nombre completo) | Resultado | Observación |
|---|---|---|---|---|
| U-01 | | | | |
| U-02 | | | | |
| U-03 | | | | |
| U-04 | | | | |
| U-05 | | | | |

---

## Defectos encontrados

| # | Caso origen | Descripción | Severidad | Estado | Corregido en |
|---|---|---|---|---|---|
| | | | | | |

## Cierre de la actividad

- [ ] 100 % de los casos P aprobados.
- [ ] 100 % de los casos E aprobados.
- [ ] ≥ 95 % de los casos F aprobados.
- [ ] Casos A ejecutados y reflejados en el checklist legal E6.
- [ ] Casos U ejecutados con personal real.
- [ ] Defectos críticos y mayores corregidos y reejecutados.

| | Nombre | Firma | Fecha |
|---|---|---|---|
| **Ejecutó** | Gerardo Sánchez | | |
| **Revisó** | Miguel Ángel González Pacheco | | |
