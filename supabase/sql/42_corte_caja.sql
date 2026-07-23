-- =====================================================================
-- 42_corte_caja.sql
-- Finanzas de Administracion: cuanto se vendio, cuanto debe haber en la
-- caja, y como se cierra el corte.
--
-- Administracion cobra el TAG en efectivo. Hasta ahora cada cobro quedaba
-- registrado con su folio de recibo, pero nadie podia responder "cuanto
-- dinero traigo en la gaveta" ni dejar constancia de haberlo entregado.
-- Este bloque agrega el corte: se cuenta el efectivo, se compara contra lo
-- que el sistema esperaba, se explica la diferencia si la hay, y la caja
-- vuelve a cero.
--
-- MODELO (decisiones del 21-jul-2026):
--   pagos.corte_id NULL   -> el cobro sigue EN LA CAJA (aun no se corta)
--   pagos.corte_id = X    -> el cobro pertenece al corte X y queda CONGELADO
--   cortes_caja           -> un renglon por corte, INMUTABLE
--
-- El corte NO se define por rango de fechas, a proposito: pagos.fecha usa
-- current_date, que en Supabase evalua en UTC, asi que un cobro de la tarde
-- se fecharia al dia siguiente y caeria en el corte equivocado. La
-- pertenencia se SELLA en la fila del pago; nunca se deduce por fecha.
--
-- Reestablecer la caja y cortar son EL MISMO ACTO: al cerrar el corte, la
-- caja esperada vuelve a cero. No hay fondo de cambio y NO hay forma de
-- deshacer un corte (ver "Auditoria esperada").
--
-- OJO al aplicar:
--   1) registrar_pago CONSERVA su firma (uuid, numeric, text): solo cambia
--      el cuerpo para guardar la identidad de quien cobra. Es create or
--      replace en sitio, SIN trampa PostgREST.
--   2) estado_caja y cortar_caja son NUEVOS: solo notify, sin drop.
--   3) La FK pagos.corte_id es DEFERRABLE INITIALLY DEFERRED a proposito:
--      permite sellar los pagos primero y recien despues insertar el corte
--      con el total ya calculado, sin dejar nunca la fila del corte editable.
--   4) Este bloque instala triggers que PROHIBEN borrar o truncar pagos ya
--      sellados. Eso convierte a seed_tests_dev.sql en un fusible: si se
--      corre por error contra una base con cortes, aborta en vez de destruir.
--
-- Depende de: 24_pagos.sql, 29_rpc_panel.sql, 32_folios_recibo_automaticos.sql.
-- Aplicar despues del bloque 41.
--
-- Devuelve: estado_caja  -> jsonb { totalEnCaja, pagosEnCaja, diasDeCobro, ... }
--           cortar_caja  -> jsonb { id, folioCorte, totalEsperado, diferencia, ... }
-- =====================================================================

-- Preflight: este bloque asume que ningun pago trae corte todavia. Si la
-- columna ya existe con datos, el bloque se detiene antes de tocar nada:
-- no se inventa a que corte pertenece un cobro ya sellado.
do $$
declare
    v_sellados bigint;
begin
    if exists (
        select 1 from information_schema.columns
         where table_name = 'pagos' and column_name = 'corte_id'
    ) then
        execute 'select count(*) from pagos where corte_id is not null'
           into v_sellados;
        if v_sellados > 0 then
            raise exception 'Ya existen % pagos sellados por un corte: revise el estado antes de reaplicar el bloque 42', v_sellados;
        end if;
    end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1) Esquema: la tabla de cortes.
--    Un renglon por corte cerrado. Es un documento contable: se escribe
--    una vez y no se vuelve a tocar.
-- ---------------------------------------------------------------------
create table if not exists cortes_caja (
    id                  uuid primary key default gen_random_uuid(),
    folio_corte         text not null,
    cortado_por         text not null,
    cortado_por_uid     uuid,
    cortado_por_email   text,
    periodo_desde       timestamptz,
    periodo_hasta       timestamptz not null default now(),
    total_esperado      numeric(12,2) not null,
    cantidad_pagos      integer not null,
    dias_de_cobro       integer not null default 1,
    desglose_por_dia    jsonb,
    efectivo_contado    numeric(12,2) not null,
    diferencia          numeric(12,2) generated always as (efectivo_contado - total_esperado) stored,
    observaciones       text,
    created_at          timestamptz not null default now(),

    constraint corte_total_no_negativo    check (total_esperado >= 0),
    constraint corte_contado_no_negativo  check (efectivo_contado >= 0),
    constraint corte_con_pagos            check (cantidad_pagos > 0),
    constraint corte_cortado_por_no_vacio check (btrim(cortado_por) <> ''),
    -- Backstop de la regla de negocio: si el efectivo no cuadra, el corte
    -- NO puede quedar sin explicacion. El RPC ya lo valida, pero esto lo
    -- garantiza incluso para cualquier ruta futura.
    constraint corte_diferencia_explicada check (
        efectivo_contado = total_esperado
        or btrim(coalesce(observaciones, '')) <> ''
    )
);

comment on table  cortes_caja is 'Cortes de caja de Administracion. Documento contable inmutable.';
comment on column cortes_caja.cortado_por is 'PII indirecta: nombre del personal que cerro el corte';
comment on column cortes_caja.cortado_por_uid is 'Identidad verificable (auth.uid) de quien corto; hace el faltante atribuible';
comment on column cortes_caja.desglose_por_dia is 'Subtotales por dia local, congelados al cortar: permite auditar sin recalcular';
comment on column cortes_caja.diferencia is 'Positivo = sobrante, negativo = faltante. Calculada por la base, el cliente no la manda';

create unique index if not exists uq_cortes_folio on cortes_caja (folio_corte);
create index if not exists ix_cortes_created on cortes_caja (created_at desc);

-- Folio del corte generado por secuencia dentro de PostgreSQL, igual que el
-- recibo del bloque 32. El anio se toma en HORA LOCAL, no en UTC: con
-- current_date, un corte del 31 de diciembre por la tarde se folia con el
-- anio siguiente.
create sequence if not exists cortes_caja_folio_seq as bigint minvalue 1;
alter sequence cortes_caja_folio_seq owned by cortes_caja.folio_corte;

alter table cortes_caja
    alter column folio_corte set default (
        'SATAG-CORTE-' || to_char(now() at time zone 'America/Mexico_City', 'YYYY') || '-'
        || lpad(nextval('cortes_caja_folio_seq')::text, 6, '0')
    );

revoke all on sequence cortes_caja_folio_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Esquema: el sello en el pago y la identidad de quien cobra.
--    La FK es DEFERRABLE para poder sellar antes de insertar el corte.
-- ---------------------------------------------------------------------
alter table pagos
    add column if not exists corte_id          uuid,
    add column if not exists cobrado_por_uid   uuid,
    add column if not exists cobrado_por_email text;

comment on column pagos.corte_id is 'Corte que sello este cobro. NULL = el dinero sigue en la caja';
comment on column pagos.cobrado_por_uid is 'Identidad verificable (auth.uid) de quien cobro';

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'pagos_corte_fk'
    ) then
        alter table pagos
            add constraint pagos_corte_fk
            foreign key (corte_id) references cortes_caja(id)
            deferrable initially deferred;
    end if;
end;
$$;

-- Indice parcial: "que hay en la caja ahora" es la consulta caliente.
create index if not exists ix_pagos_en_caja on pagos (corte_id) where corte_id is null;

-- ---------------------------------------------------------------------
-- 3) Blindaje: un corte cerrado no puede adelgazarse ni reescribirse.
--    pagos.registro_id trae ON DELETE CASCADE desde el bloque 24: sin esto,
--    borrar un expediente se llevaria por delante un cobro que ya pertenece
--    a un corte cerrado, y el documento dejaria de cuadrar consigo mismo.
-- ---------------------------------------------------------------------
create or replace function pagos_bloquear_borrado_sellado()
returns trigger
language plpgsql
as $$
begin
    if old.corte_id is not null then
        raise exception 'El pago % pertenece a un corte de caja cerrado y no se puede borrar', coalesce(old.folio_recibo, old.id::text)
            using hint = 'Un corte cerrado es un documento contable. Decida primero que pasa con el corte.';
    end if;
    return old;
end;
$$;

drop trigger if exists tg_pagos_no_borrar_sellado on pagos;
create trigger tg_pagos_no_borrar_sellado
    before delete on pagos
    for each row execute function pagos_bloquear_borrado_sellado();

-- TRUNCATE no dispara el trigger de fila: necesita el suyo. Esto es lo que
-- convierte a seed_tests_dev.sql en un fusible contra correrlo en produccion.
create or replace function pagos_bloquear_truncate_sellado()
returns trigger
language plpgsql
as $$
begin
    if exists (select 1 from pagos where corte_id is not null) then
        raise exception 'Hay pagos sellados por cortes de caja: truncate esta prohibido en esta base'
            using hint = 'seed_tests_dev.sql es solo para desarrollo. Si ve este error, esta apuntando a una base con cortes reales.';
    end if;
    return null;
end;
$$;

drop trigger if exists tg_pagos_no_truncar_sellado on pagos;
create trigger tg_pagos_no_truncar_sellado
    before truncate on pagos
    for each statement execute function pagos_bloquear_truncate_sellado();

-- Un cobro ya sellado queda congelado: ni el monto ni el folio ni el corte
-- al que pertenece pueden cambiar. El sellado mismo si pasa, porque ahi
-- old.corte_id todavia es NULL.
create or replace function pagos_congelar_sellado()
returns trigger
language plpgsql
as $$
begin
    if old.corte_id is not null and (
           new.monto        is distinct from old.monto
        or new.cobrado_por  is distinct from old.cobrado_por
        or new.folio_recibo is distinct from old.folio_recibo
        or new.corte_id     is distinct from old.corte_id
    ) then
        raise exception 'El pago % ya fue cortado y no admite cambios', coalesce(old.folio_recibo, old.id::text);
    end if;
    return new;
end;
$$;

drop trigger if exists tg_pagos_congelar_sellado on pagos;
create trigger tg_pagos_congelar_sellado
    before update on pagos
    for each row execute function pagos_congelar_sellado();

-- El corte es inmutable de verdad, no por convencion: ni el SQL Editor
-- (que corre como owner y se salta RLS y grants) puede editarlo o borrarlo.
create or replace function cortes_caja_inmutable()
returns trigger
language plpgsql
as $$
begin
    raise exception 'Un corte de caja cerrado no se puede modificar ni borrar (folio %)', coalesce(old.folio_corte, old.id::text)
        using hint = 'Si el corte quedo mal, deje constancia en las observaciones del corte siguiente.';
end;
$$;

drop trigger if exists tg_cortes_inmutables on cortes_caja;
create trigger tg_cortes_inmutables
    before update or delete on cortes_caja
    for each row execute function cortes_caja_inmutable();

-- ---------------------------------------------------------------------
-- 4) RLS: las finanzas son de Administracion.
--    A diferencia de pagos (que leen admin/ti/consulta/super), la tabla de
--    cortes la leen SOLO admin y super, igual que aceptaciones en el
--    bloque 30. Sin grant, PostgREST devolveria 401 aunque la policy
--    permitiera: hacen falta los dos.
-- ---------------------------------------------------------------------
alter table cortes_caja enable row level security;

drop policy if exists cortes_lectura_admin on cortes_caja;
create policy cortes_lectura_admin on cortes_caja
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','super')
    );

grant select on cortes_caja to authenticated;

-- anon queda intencionalmente SIN GRANT y sin policy.
-- Nadie escribe cortes_caja directo: solo el RPC cortar_caja.

-- ---------------------------------------------------------------------
-- 5) registrar_pago: misma firma, ahora guarda quien cobro de verdad.
--    cobrado_por es texto tecleado; cobrado_por_uid viene del JWT y no se
--    puede falsear desde el navegador. Reproduce el bloque 32 + identidad.
-- ---------------------------------------------------------------------
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

    insert into pagos (registro_id, monto, cobrado_por, cobrado_por_uid, cobrado_por_email)
    values (
        p_registro_id,
        p_monto,
        nullif(btrim(coalesce(p_cobrado_por, '')), ''),
        auth.uid(),
        auth.jwt() ->> 'email'
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

-- ---------------------------------------------------------------------
-- 6) estado_caja (rol admin): que hay en la caja ahora y cuanto se ha
--    vendido. Responde las dos preguntas que motivaron la feature.
--
--    Todo lo temporal se calcula sobre created_at convertido a hora local,
--    NUNCA sobre pagos.fecha (que es current_date en UTC).
-- ---------------------------------------------------------------------
create or replace function estado_caja()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_zona          text := 'America/Mexico_City';
    v_total         numeric(12,2);
    v_cantidad      integer;
    v_dias          integer;
    v_primero       timestamptz;
    v_desglose      jsonb;
    v_ultimo_corte  timestamptz;
    v_mes           numeric(12,2);
    v_historico     numeric(12,2);
begin
    perform panel_exigir_rol(array['admin']);

    select coalesce(sum(monto), 0),
           count(*),
           count(distinct (created_at at time zone v_zona)::date),
           min(created_at)
      into v_total, v_cantidad, v_dias, v_primero
      from pagos
     where corte_id is null;

    -- Desglose por dia local: deja ver de golpe que parte del efectivo es de
    -- dias anteriores ya entregados, que es de donde salen los faltantes falsos.
    select jsonb_agg(d order by d ->> 'dia')
      into v_desglose
      from (
          select jsonb_build_object(
                     'dia',      (created_at at time zone v_zona)::date,
                     'cantidad', count(*),
                     'subtotal', sum(monto)
                 ) as d
            from pagos
           where corte_id is null
           group by (created_at at time zone v_zona)::date
      ) s;

    select max(created_at) into v_ultimo_corte from cortes_caja;

    select coalesce(sum(monto), 0)
      into v_mes
      from pagos
     where (created_at at time zone v_zona) >= date_trunc('month', now() at time zone v_zona);

    select coalesce(sum(monto), 0) into v_historico from pagos;

    return jsonb_build_object(
        'totalEnCaja',     v_total,
        'pagosEnCaja',     v_cantidad,
        'diasDeCobro',     coalesce(v_dias, 0),
        'primerCobro',     v_primero,
        'desglosePorDia',  coalesce(v_desglose, '[]'::jsonb),
        'ultimoCorte',     v_ultimo_corte,
        'vendidoMes',      v_mes,
        'vendidoHistorico', v_historico
    );
end;
$$;

revoke all on function estado_caja() from public;
grant execute on function estado_caja() to authenticated;

-- ---------------------------------------------------------------------
-- 7) cortar_caja (rol admin): cierra el corte y reestablece la caja.
--
--    El conjunto del corte se define con el propio UPDATE ... RETURNING y
--    el total se calcula DESDE las filas efectivamente selladas. Asi el
--    total guardado y el dinero sellado no pueden divergir: si entra un
--    cobro mientras se corta, o cae dentro y suma, o se queda para el
--    corte siguiente, pero nunca se cuenta a medias.
-- ---------------------------------------------------------------------
create or replace function cortar_caja(
    p_efectivo_contado numeric,
    p_cortado_por      text default null,
    p_observaciones    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_zona       text := 'America/Mexico_City';
    v_corte_id   uuid := gen_random_uuid();
    v_total      numeric(12,2);
    v_cantidad   integer;
    v_dias       integer;
    v_desde      timestamptz;
    v_hasta      timestamptz := now();
    v_desglose   jsonb;
    v_diferencia numeric(12,2);
    v_nombre     text;
    v_folio      text;
begin
    perform panel_exigir_rol(array['admin']);

    -- Serializa dos cortes simultaneos: se forman en fila en vez de competir.
    perform pg_advisory_xact_lock(hashtext('satag:corte_caja'));

    if p_efectivo_contado is null or p_efectivo_contado < 0 then
        raise exception 'El efectivo contado debe ser mayor o igual a cero';
    end if;

    v_nombre := nullif(btrim(coalesce(p_cortado_por, '')), '');
    if v_nombre is null then
        raise exception 'Indique quien realiza el corte';
    end if;

    -- Pre-chequeo: evita quemar un folio de la serie cuando no hay nada que cortar.
    perform 1 from pagos where corte_id is null limit 1;
    if not found then
        raise exception 'No hay cobros pendientes de cortar: la caja esta en ceros';
    end if;

    -- Fotografia del periodo, antes de sellar.
    select min(created_at),
           count(distinct (created_at at time zone v_zona)::date)
      into v_desde, v_dias
      from pagos
     where corte_id is null;

    select jsonb_agg(d order by d ->> 'dia')
      into v_desglose
      from (
          select jsonb_build_object(
                     'dia',      (created_at at time zone v_zona)::date,
                     'cantidad', count(*),
                     'subtotal', sum(monto)
                 ) as d
            from pagos
           where corte_id is null
           group by (created_at at time zone v_zona)::date
      ) s;

    -- El sello define el conjunto. La FK diferida permite hacerlo antes de
    -- que exista la fila del corte; se valida al confirmar la transaccion.
    with sellados as (
        update pagos
           set corte_id = v_corte_id
         where corte_id is null
        returning monto
    )
    select coalesce(sum(monto), 0), count(*)
      into v_total, v_cantidad
      from sellados;

    -- Respaldo real ante concurrencia: si otro corte se adelanto, aqui se
    -- sellaron 0 filas. Sin esto quedaria un corte fantasma en cero cuyo
    -- efectivo contado se registraria como sobrante inexistente.
    if v_cantidad = 0 then
        raise exception 'No hay cobros pendientes de cortar: la caja esta en ceros';
    end if;

    v_diferencia := p_efectivo_contado - v_total;

    -- Una diferencia sin explicar es un documento contable inutil: dentro de
    -- un mes nadie recordara por que no cuadro.
    if v_diferencia <> 0 and btrim(coalesce(p_observaciones, '')) = '' then
        raise exception 'Explique la diferencia de $% antes de cerrar el corte',
            to_char(abs(v_diferencia), 'FM999999990.00');
    end if;

    -- Un corte que arrastra varios dias de cobro suele mezclar efectivo ya
    -- entregado: se exige dejarlo por escrito mientras se recuerda.
    if v_dias > 1 and btrim(coalesce(p_observaciones, '')) = '' then
        raise exception 'Este corte abarca cobros de % dias: explique en observaciones si ya entrego efectivo de dias anteriores', v_dias;
    end if;

    insert into cortes_caja (
        id, cortado_por, cortado_por_uid, cortado_por_email,
        periodo_desde, periodo_hasta,
        total_esperado, cantidad_pagos, dias_de_cobro, desglose_por_dia,
        efectivo_contado, observaciones
    )
    values (
        v_corte_id, v_nombre, auth.uid(), auth.jwt() ->> 'email',
        v_desde, v_hasta,
        v_total, v_cantidad, coalesce(v_dias, 1), v_desglose,
        p_efectivo_contado, nullif(btrim(coalesce(p_observaciones, '')), '')
    )
    returning folio_corte into v_folio;

    return jsonb_build_object(
        'id', v_corte_id,
        'folioCorte', v_folio,
        'totalEsperado', v_total,
        'efectivoContado', p_efectivo_contado,
        'diferencia', v_diferencia,
        'pagosCortados', v_cantidad,
        'diasDeCobro', coalesce(v_dias, 1)
    );
end;
$$;

revoke all on function cortar_caja(numeric, text, text) from public;
grant execute on function cortar_caja(numeric, text, text) to authenticated;

-- Hace visibles de inmediato los RPC nuevos para PostgREST/Supabase API.
notify pgrst, 'reload schema';

-- =====================================================================
-- Auditoria esperada:
-- - anon: sin grant sobre cortes_caja y sin EXECUTE sobre estado_caja ni
--   cortar_caja. No ve ni ejecuta nada de finanzas.
-- - authenticated sin aal2 o sin rol admin/super: no lee cortes_caja.
--   ti y consulta NO ven los cortes (a diferencia de pagos, que si leen).
-- - authenticated sin rol admin: panel_exigir_rol rechaza ambos RPC.
--   super pasa la guardia por diseno (soporte y pruebas integrales).
-- - Cortar dos veces seguidas: el segundo intento falla con "la caja esta
--   en ceros" y NO deja un corte fantasma con sobrante inexistente.
-- - Dos cortes simultaneos: el advisory lock los forma en fila; el segundo
--   sella 0 filas y aborta. Ningun pago queda en dos cortes.
-- - Un cobro registrado durante el corte: o entra completo o queda para el
--   corte siguiente. total_esperado siempre es la suma exacta de lo sellado.
-- - Corte con diferencia y sin observaciones: rechazado por el RPC y, como
--   respaldo, por la constraint corte_diferencia_explicada.
-- - Corte que abarca mas de un dia de cobro sin observaciones: rechazado.
-- - Borrar un registro cuyo pago ya fue cortado: falla (el ON DELETE
--   CASCADE del bloque 24 queda neutralizado por tg_pagos_no_borrar_sellado).
-- - truncate table registros cascade con cortes existentes: falla. Por eso
--   seed_tests_dev.sql solo corre en bases sin cortes.
-- - Editar o borrar un corte, incluso desde el SQL Editor como owner:
--   falla por tg_cortes_inmutables.
-- - Editar el monto o el folio de un pago ya cortado: falla.
-- - Folio del corte: SATAG-CORTE-AAAA-000001, con el anio en hora local
--   (no en UTC, para no folear con el anio equivocado en diciembre).
--
-- Decisiones abiertas (documentadas, no omitidas):
-- - NO existe forma de deshacer un corte. Si se cierra por error o con un
--   dedazo en el efectivo contado, el valor queda para siempre; la
--   correccion se documenta en las observaciones del corte SIGUIENTE.
-- - No hay separacion de funciones: la misma persona cobra, cuenta el
--   efectivo y cierra el corte. Se acepta porque hoy cobra una sola
--   persona; cortado_por_uid deja el acto atribuible.
-- - Un pago mal capturado sigue sin poder corregirse (monto > 0 impide el
--   renglon negativo y uq_pagos_registro impide un segundo renglon).
--   Despues del corte, ademas, queda congelado.
-- - No se implementa desglose por cajero: hoy cobra una sola persona. Si
--   entra un segundo cajero, cobrado_por_uid ya permite agregarlo sin
--   migrar datos.
-- =====================================================================
