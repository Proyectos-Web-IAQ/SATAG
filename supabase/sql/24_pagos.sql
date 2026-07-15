-- =====================================================================
-- 24_pagos.sql
-- Historial de pagos por registro (hoy: $100 en efectivo por el TAG).
-- PII: indirecta (cobrado_por es nombre de personal). Depende de: registros.
--
-- El panel (Administracion) registra pagos via RPC registrar_pago (bloque 29).
-- Regla de negocio: TI instala el TAG solo despues de que exista un pago.
-- =====================================================================

create table if not exists pagos (
    id            uuid primary key default gen_random_uuid(),
    registro_id   uuid not null references registros(id) on delete cascade,
    monto         numeric(8,2) not null,
    metodo        text not null default 'efectivo',
    cobrado_por   text,
    folio_recibo  text,
    fecha         date not null default current_date,
    created_at    timestamptz not null default now(),
    constraint pagos_monto_positivo check (monto > 0),
    constraint pagos_metodo_valido check (metodo in ('efectivo')),
    constraint pagos_cobrado_por_no_vacio check (cobrado_por is null or btrim(cobrado_por) <> ''),
    constraint pagos_folio_recibo_no_vacio check (folio_recibo is null or btrim(folio_recibo) <> '')
);

comment on column pagos.cobrado_por is 'PII indirecta: nombre del personal que cobro';

create index if not exists ix_pagos_registro on pagos (registro_id);

-- Anti doble-cobro. El folio del recibo fisico es unico por naturaleza: si el
-- admin da doble clic o reintenta tras un error de red, el segundo intento
-- choca aqui en vez de duplicar la fila (el RPC lo traduce a un mensaje claro).
-- El indice es PARCIAL a proposito: un pago sin folio de recibo no se topa,
-- porque no hay dato con el cual distinguir un duplicado de un cobro legitimo.
create unique index if not exists uq_pagos_folio_recibo
    on pagos (folio_recibo)
    where folio_recibo is not null;

-- Auditoria esperada:
-- - anon: sin acceso. authenticated: SOLO lectura (roles admin/ti/consulta, aal2).
-- - La escritura ocurre unicamente via RPC registrar_pago (SECURITY DEFINER, rol admin).
-- - No se edita ni borra un pago desde la app; es historial (correcciones: decision abierta).
-- - Decision abierta: un pago SIN folio de recibo sigue pudiendo duplicarse por
--   doble clic. Si en CC-03 (caja) el folio pasa a ser obligatorio, el hueco se
--   cierra solo; mientras tanto la UI debe deshabilitar el boton al enviar.
