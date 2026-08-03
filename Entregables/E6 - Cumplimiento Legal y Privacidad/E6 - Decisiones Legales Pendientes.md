# Decisiones Legales Pendientes SATAG

> **Proyecto:** SATAG - Sistema de Adquisicion de TAG Vehicular.
> **Institucion:** Instituto Asuncion de Queretaro, A.C. (IAQ).
> **Tarea WBS:** 1.2.3 - Definicion legal y privacidad.
> **Ultima actualizacion:** 01/08/2026.
> **Estado global:** borradores listos; faltan decisiones institucionales para poder publicar el aviso.

## Como usar este documento en cada sesion

Este es el tablero unico de la parte legal. En cada sesion:

1. Abrir este archivo y revisar la tabla de la seccion 2.
2. Trabajar solo sobre las filas en estado **Pendiente** o **En revision**.
3. Cuando IAQ (Direccion/Legal/Administracion) tome una decision, escribirla en la columna **Decision final**, cambiar el estado a **Decidido** y aplicar el cambio en el aviso (`E6 - Aviso de Privacidad SATAG.md`) y donde corresponda.
4. Nada se publica ni pasa a produccion hasta que todas las filas de prioridad Alta esten en **Decidido** y exista aprobacion de Direccion/Legal.

Los entregables base que alimentan este tablero:

- `Entregables/E6 - Cumplimiento Legal y Privacidad/E6 - Aviso de Privacidad SATAG.md`
- `Entregables/E6 - Cumplimiento Legal y Privacidad/E6 - Checklist Legal y Privacidad SATAG.md`
- `Investigacion/02 - Investigacion Legal SATAG.md` (fundamento normativo)
- `Desarrollo/04 - Seguridad, RLS y Privacidad.md` (parte tecnica)

## 2. Tablero de decisiones

| # | Tema | Pregunta a resolver | Recomendacion | Decision final | Quien decide | Prioridad | Estado |
|---|---|---|---|---|---|---|---|
| 1 | Responsable ARCO | Persona con nombre o departamento | Designar al **departamento** (Administracion) como responsable formal, y nombrar internamente a un titular concreto que opere. Da continuidad si alguien se va. | | Direccion / Administracion | Alta | Pendiente |
| 2 | Reparto TI vs Administracion | Si TI y Administracion pueden ejecutar ARCO, quien es el duenno del proceso | **Administracion** es duenna del proceso (recibe, verifica identidad, responde en plazo). **TI** es ejecutor tecnico (exporta, borra del bucket, bloquea registros) a peticion de Administracion. | | Direccion | Alta | Pendiente |
| 3 | Correo ARCO | Correo personal o de departamento | Usar un **buzon institucional de rol** (no personal). Detras, una persona lo monitorea. | `aviso.privacidad@asuncionqro.edu.mx` | Administracion / TI | Alta | Decidido |
| 4 | Plazo de conservacion SATAG | Cuanto se guardan los expedientes del TAG | **Un plazo unico de 6 años desde la baja, para todo el expediente incluida la evidencia de firma.** Se corrigio la recomendacion anterior, que proponia 6 años para lo operativo y 10 para la firma: esa combinacion no es viable sin construir una rutina de disociacion, porque la evidencia esta atada al expediente con borrado en cascada. Las dos opciones limpias son 6 para todo (recomendada) o 10 para todo. Detalle y hoja de firma en [Nota de Decision - Plazo de Conservacion](E6%20-%20Nota%20de%20Decision%20-%20Plazo%20de%20Conservacion.md). | | Direccion / Legal | Alta | **En revision** (nota enviada 01-ago-2026) |
| 7 | Domicilio legal en aviso | Texto exacto del domicilio del IAQ | Copiar el domicilio exacto del aviso general vigente del IAQ. | Cerrada de la Asuncion #16, Col. Loma Dorada, Queretaro, Qro., C.P. 76060 (Legal confirma que coincide con acta/aviso general) | Administracion / Legal | Alta | Decidido |
| 8 | URL del aviso integral | Direccion web donde se publica | Definir ruta fija, p.ej. `/aviso-de-privacidad`, versionada. | Resuelto 28-jul: la pagina `/aviso-de-privacidad` existe, lee la version vigente de la base y muestra su numero de version. El dominio cambiara al migrar al subdominio institucional; la ruta no. | TI | Media | Resuelto |
| 9 | Supabase DPA y region | Firmar DPA y documentar region | Firmar el DPA desde el dashboard de Supabase, archivar el PDF, elegir y documentar region (us-east-1 o us-west). | | TI | Alta | Pendiente |
| 10 | Reglamento de estacionamiento | Validar clausulas y limites de responsabilidad | Revision de Legal sobre responsabilidad civil por daños/robo. | | Legal / Direccion | Alta | Pendiente |
| 11 | Cobro $100 efectivo | Requiere folio/recibo/corte | **Superado por la implementacion:** cada pago emite un **folio de recibo automatico e inmutable** (`SATAG-AAAA-######`, bloque 32, 15-jul) y existe **corte de caja** con conciliacion del efectivo contado (bloque 42, 22-jul), inmutable y con identidad verificable de quien cobra y de quien corta. Control interno; **no** se emite CFDI. Falta confirmar con Administracion el tratamiento contable/fiscal. | Folio y corte: hechos · Tratamiento fiscal: por confirmar | Administracion | Alta | Actualizado |
| 12 | NOM-151 | Contratar constancia de conservacion | Fase 2. Cotizar solo si Direccion quiere mayor fuerza probatoria (~$14-90 MXN por constancia). No es requisito del MVP. | | Direccion | Fase 2 | Pendiente |

> **Nota:** la aprobacion del aviso la revisa Direccion/Legal por separado; por eso no aparece como fila del tablero.

## 3. Notas de respaldo (por que se recomienda cada cosa)

- **ARCO (filas 1-3).** El art. 29 de la LFPDPPP 2025 obliga a designar "una persona o departamento" de datos personales. Ambas opciones son validas; por continuidad conviene el departamento como responsable formal con un titular operativo y un buzon de rol. ARCO = derechos de Acceso, Rectificacion, Cancelacion y Oposicion del titular; el sistema SATAG es la herramienta para ejecutarlos, pero la solicitud la recibe, evalua y responde el responsable en los plazos de 20 dias habiles + 15 para ejecutar (art. 31).
- **Conservacion (fila 4).** No hay plazo legal fijo para particulares. La ley usa 72 meses como referencia de incumplimiento contractual (art. 10) y la evidencia de firma gana fuerza probatoria si se conserva por analogia al art. 49 del Codigo de Comercio (10 años). Al vencer: bloqueo previo y luego supresion. **Revisado el 01-ago-2026:** la analogia con el Codigo de Comercio es debil aqui, porque el IAQ no celebra un acto mercantil con el reglamento de estacionamiento (`Investigacion/02:150`), y buena parte de los conductores son alumnos menores, a quienes la ley pide expresamente no conservar «por si acaso». Por eso la recomendacion baja a un plazo unico de 6 años. Ver la nota de decision enlazada en la fila.

## 4. Definicion de "Decidido"

Una fila pasa a **Decidido** solo cuando: (a) hay una respuesta concreta escrita en la columna Decision final, (b) esa respuesta ya se reflejo en el aviso u otro entregable, y (c) quien correspondia la aprobo. Mientras tanto sigue **Pendiente** o **En revision**.
