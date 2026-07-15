-- =====================================================================
-- 32_folios_recibo_automaticos.sql
-- Genera el folio de cada recibo dentro de PostgreSQL, donde una secuencia
-- garantiza unicidad incluso con dos cajeros trabajando al mismo tiempo.
--
-- Formato: SATAG-AAAA-000001
--
-- Tambien cierra el doble cobro por reintento: el pago del TAG es unico por
-- expediente. Si ya existe, registrar_pago devuelve un error con su folio.
-- Depende de: 24_pagos.sql y 29_rpc_panel.sql.
-- Aplicar despues de 31_rpc_flujos_atomicos.sql.
-- =====================================================================

-- Preflight: no se inventa cual pago conservar si la base ya tiene duplicados.
-- En ese caso este bloque se detiene antes de cambiar el esquema.
do $$
declare
    v_registro_id uuid;
    v_cantidad bigint;
begin
    select registro_id, count(*)
      into v_registro_id, v_cantidad
      from pagos
     group by registro_id
    having count(*) > 1
     limit 1;

    if found then
        raise exception 'El registro % ya tiene % pagos: corrige el duplicado antes de aplicar el bloque 32',
            v_registro_id, v_cantidad;
    end if;
end;
$$;

create sequence if not exists pagos_folio_recibo_seq
    as bigint
    minvalue 1;

alter sequence pagos_folio_recibo_seq owned by pagos.folio_recibo;

-- Si el formato automatico ya se uso antes (por ejemplo al reaplicar el
-- bloque), adelanta la secuencia sin hacerla retroceder.
do $$
declare
    v_max_existente bigint;
    v_ultimo bigint;
begin
    select max(substring(folio_recibo from '^SATAG-[0-9]{4}-([0-9]+)$')::bigint)
      into v_max_existente
      from pagos
     where folio_recibo ~ '^SATAG-[0-9]{4}-[0-9]+$';

    select last_value into v_ultimo from pagos_folio_recibo_seq;

    if v_max_existente is not null and v_max_existente >= v_ultimo then
        perform setval('pagos_folio_recibo_seq', v_max_existente, true);
    end if;
end;
$$;

alter table pagos
    alter column folio_recibo set default (
        'SATAG-' || to_char(current_date, 'YYYY') || '-'
        || lpad(nextval('pagos_folio_recibo_seq')::text, 6, '0')
    );

-- Los pagos historicos sin recibo reciben tambien un folio trazable.
update pagos
   set folio_recibo = default
 where folio_recibo is null;

alter table pagos alter column folio_recibo set not null;

drop index if exists uq_pagos_folio_recibo;
create unique index uq_pagos_folio_recibo on pagos (folio_recibo);
create unique index if not exists uq_pagos_registro on pagos (registro_id);

comment on column pagos.folio_recibo is
    'Folio automatico e inmutable: SATAG-AAAA-secuencia global';

-- Nadie desde el navegador necesita consumir la secuencia directamente.
revoke all on sequence pagos_folio_recibo_seq from public, anon, authenticated;

-- Se elimina la firma anterior de cuatro argumentos: el cliente ya no puede
-- elegir, omitir ni reutilizar un folio. PostgREST expone solo la firma nueva.
drop function if exists registrar_pago(uuid, numeric, text, text);

create or replace function registrar_pago(
    p_registro_id uuid,
    p_monto       numeric,
    p_cobrado_por text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_estado text;
    v_folio text;
begin
    perform panel_exigir_rol(array['admin']);

    -- Serializa dos intentos simultaneos sobre el mismo expediente.
    select estado
      into v_estado
      from registros
     where id = p_registro_id
       for update;

    if not found then
        raise exception 'Registro no encontrado';
    end if;
    if v_estado = 'baja' then
        raise exception 'El registro esta dado de baja';
    end if;
    if p_monto is null or p_monto <= 0 then
        raise exception 'El monto debe ser mayor a cero';
    end if;

    select folio_recibo
      into v_folio
      from pagos
     where registro_id = p_registro_id;

    if found then
        raise exception 'El registro ya tiene el pago % registrado', v_folio;
    end if;

    insert into pagos (registro_id, monto, cobrado_por)
    values (
        p_registro_id,
        p_monto,
        nullif(btrim(coalesce(p_cobrado_por, '')), '')
    )
    returning folio_recibo into v_folio;

    update registros
       set fecha_adquisicion = coalesce(fecha_adquisicion, current_date)
     where id = p_registro_id;

    return jsonb_build_object(
        'id', p_registro_id,
        'folioRecibo', v_folio
    );
end;
$$;

revoke all on function registrar_pago(uuid, numeric, text) from public;
grant execute on function registrar_pago(uuid, numeric, text) to authenticated;

-- Hace visible de inmediato la firma nueva para PostgREST/Supabase API.
notify pgrst, 'reload schema';

-- Auditoria esperada:
-- - Cada pago tiene folio no nulo y unico.
-- - Cada expediente tiene como maximo un pago.
-- - anon y authenticated no consumen la secuencia ni escriben pagos directo.
-- - authenticated sin aal2/rol admin: panel_exigir_rol rechaza.
-- - dos cobros concurrentes del mismo expediente: uno gana y el otro recibe
--   "ya tiene el pago ... registrado".
