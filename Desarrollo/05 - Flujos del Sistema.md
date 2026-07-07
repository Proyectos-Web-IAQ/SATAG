# Flujos del Sistema — SATAG

> **Estado:** pendiente de desarrollo.
> Este documento describirá los recorridos funcionales por actor y caso de uso.

## Contenido previsto

**Flujos base** *(con los ajustes de la junta de Dirección del 03-jul)*:

- Flujo de autoservicio: captura, reglamento, firma y registro pendiente.
  *(rev. 03-jul: modelo obligatorio con dropdown dependiente marca→modelo; etiqueta "Padre / Madre /
  Tutor"; redacción "de usted".)*
- Flujo de administración: asignación de estacionamiento y registro de pago.
  *(rev. 03-jul: **cobra también el TAG propio** + marca "TAG apartado"; **valida el tipo de usuario**;
  el cobro **abre/asocia un corte de caja**.)*
- Flujo de TI: instalación, captura de No. de TAG y activación.
  *(rev. 03-jul: además atiende la **bandeja de solicitudes** de cambio/baja.)*
- Baja de registro/TAG.
- Reposición de TAG.
- Tag propio: prueba, compatibilidad y fallback *(rev. 03-jul: ahora **con cobro** + TAG apartado)*.
- Reporte de pendientes **e incompletos** *(rev. 03-jul, B2)*.

**Flujos nuevos (rev. Dirección 03-jul):**

- **Solicitud de cambio/baja (usuario)** → cae en la bandeja de TI como "tag pendiente" (B6).
- **Aviso de registros incompletos**: bandeja que lista registros con datos faltantes (B2).
- **Cierre de caja**: abrir/cerrar turno + saldo esperado + reporte de ventas (B3).

## Referencias

- [`01 - Modelo de Datos y Base de Datos.md`](01%20-%20Modelo%20de%20Datos%20y%20Base%20de%20Datos.md)
- [`02 - Modelo de Dominio POO.md`](02%20-%20Modelo%20de%20Dominio%20POO.md)
- Ajustes de la junta 03-jul: [Modelo de Datos](01%20-%20Modelo%20de%20Datos%20y%20Base%20de%20Datos.md) (§3–§6) · [Plan/02 §2.5](../Plan%20de%20Direccion/02%20-%20Alcance%2C%20WBS%20y%20Cronograma.md)
