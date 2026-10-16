-- =====================================================================
-- BLOQUE 98 — Avisos de Sistemas a la caseta, con la respuesta del portero.
--
-- SC-032 · 14/10/2026
--
-- POR QUE
--   Gerardo, 14-oct: la lista automatica de «cambios de Sistemas» del 97 no es
--   lo que la caseta necesita. Quiere que Sistemas la ADMINISTRE: «mas que
--   cambios, que sean reportes». Ejemplo: una persona dada de baja; si viene y
--   la pluma no le abre, que el portero le pregunte quien es. El aviso nace del
--   caso, el portero lo ve al buscar ese carro, responde ahi mismo, y la
--   respuesta llega como nota del caso.
--
-- DECISIONES DE GERARDO (14-oct)
--   - El aviso se crea DESDE EL CASO (TI; super pasa siempre).
--   - La respuesta del portero es una nota del caso, y el caso vuelve a «Por
--     atender» si estaba en Nuevo o en Esperando.
--   - Se QUITA la lista automatica (bajas, cambios de acceso, TAGs nuevos): la
--     caseta solo ve lo que Sistemas decide decirle. Las bajas se siguen viendo
--     en el veredicto al buscar el carro.
--   - El aviso dura hasta que Sistemas lo retira o se cierra su caso; fecha
--     limite opcional.
--
-- QUE HACE, EN ORDEN
--   0. Guardia: el 97 aplicado y caseta_inicio / caseta_buscar como los dejo.
--   1. `caseta_avisos` y `caseta_respuestas`. RLS: leen ti, contador, admin y
--      super con MFA; el portero no lee tablas (como en el 97).
--   2. Interna `caseta_avisos_de` (los avisos vivos de un vehiculo).
--   3. RPC `avisar_caseta` y `retirar_aviso_caseta` (ti) y
--      `caseta_responder_aviso` (portero, ti, super).
--   4. `caseta_buscar`: cuerpo EXTRAIDO de 97_caseta.sql:464-564, delta:
--      cada resultado trae sus `avisos`. Misma firma: create or replace.
--   5. `caseta_inicio`: cuerpo EXTRAIDO de 97_caseta.sql:583-675, delta: la
--      lista `cambios` se reemplaza por `avisos` (los vivos, con sus
--      respuestas). Misma firma: create or replace. El cliente publicado lee
--      `cambios ?? []`: con este bloque ve la lista vacia, no falla.
--   6. Verificacion de solo lectura: filas con ok = true.
--
-- Este bloque AGREGA (tablas y RPC nuevos) y cambia dos cuerpos sin cambiar
-- su firma: va ANTES del deploy del cliente que usa los avisos.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. GUARDIA
-- ---------------------------------------------------------------------
do $guardia$
begin
    if to_regclass('public.caseta_avisos') is not null then
        raise exception 'El bloque 98 ya esta aplicado (existe caseta_avisos). No se aplico nada.';
    end if;
    if to_regclass('public.caseta_reportes') is null then
        raise exception 'Falta el bloque 97 (caseta_reportes). No se aplico nada.';
    end if;
    if (select count(*) from pg_proc where proname = 'caseta_inicio') <> 1
       or (select count(*) from pg_proc where proname = 'caseta_buscar') <> 1 then
        raise exception 'Hay mas de una caseta_inicio o caseta_buscar (o ninguna). No se aplico nada.';
    end if;
    if not exists (select 1 from pg_proc where proname = 'caseta_inicio' and prosrc like '%''cambios'', v_cambios%')
       or not exists (select 1 from pg_proc where proname = 'caseta_buscar' and prosrc like '%''pasos'', coalesce(%')
       or exists (select 1 from pg_proc where proname = 'caseta_buscar' and prosrc like '%caseta_avisos_de%') then
        raise exception 'caseta_inicio o caseta_buscar no son las del 97. No se aplico nada: revise que bloque las dejo asi.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. LOS AVISOS Y SUS RESPUESTAS
-- ---------------------------------------------------------------------
create table caseta_avisos (
    id           uuid primary key default gen_random_uuid(),
    caso_id      uuid not null references casos (id) on delete cascade,
    -- De quien es: se toman del caso al crearlo (el portero lo encuentra por aqui).
    registro_id  uuid references registros (id) on delete set null,
    tarjeta      text,
    texto        text not null,
    -- Estacionamientos donde importa; vacio = los dos.
    lotes        text[] not null default '{}',
    hasta        date,
    creado_por   text not null,
    creado_en    timestamptz not null default now(),
    cerrado_por  text,
    cerrado_en   timestamptz,
    constraint caseta_av_texto   check (char_length(btrim(texto)) between 5 and 300),
    constraint caseta_av_lotes   check (lotes <@ array['E1', 'E2']),
    constraint caseta_av_tarjeta check (tarjeta is null or tarjeta ~ '^[0-9]{4,12}$'),
    constraint caseta_av_cierre  check ((cerrado_por is null) = (cerrado_en is null))
);
create index ix_caseta_avisos_caso on caseta_avisos (caso_id);
create index ix_caseta_avisos_vivos on caseta_avisos (registro_id, tarjeta) where cerrado_en is null;

create table caseta_respuestas (
    id         bigint generated always as identity primary key,
    aviso_id   uuid not null references caseta_avisos (id) on delete cascade,
    respuesta  text not null,
    hecho_por  text not null,
    hecho_en   timestamptz not null default now(),
    constraint caseta_resp_texto check (char_length(btrim(respuesta)) between 2 and 500)
);
create index ix_caseta_respuestas_aviso on caseta_respuestas (aviso_id, hecho_en);

comment on table caseta_avisos is 'Bloque 98. Lo que Sistemas le pide a la caseta sobre un vehiculo, desde su caso. Vivo mientras no se retire, no venza y su caso no se cierre.';
comment on table caseta_respuestas is 'Bloque 98. Lo que respondio la caseta a un aviso; tambien queda como nota del caso.';

alter table caseta_avisos     enable row level security;
alter table caseta_respuestas enable row level security;
create policy caseta_avisos_lectura on caseta_avisos for select to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2'
           and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'contador', 'admin', 'super'));
create policy caseta_respuestas_lectura on caseta_respuestas for select to authenticated
    using ((auth.jwt() ->> 'aal') = 'aal2'
           and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti', 'contador', 'admin', 'super'));
revoke all on table caseta_avisos, caseta_respuestas from anon, public;
revoke insert, update, delete, truncate, references, trigger on table caseta_avisos, caseta_respuestas from authenticated;
grant  select on table caseta_avisos, caseta_respuestas to authenticated;
revoke all on sequence caseta_respuestas_id_seq from anon, public, authenticated;


-- ---------------------------------------------------------------------
-- 2. INTERNA: los avisos vivos de un vehiculo (por expediente o por TAG)
-- ---------------------------------------------------------------------
create function caseta_avisos_de(p_registro_id uuid, p_tarjeta text) returns jsonb
language sql
stable
security definer
set search_path = public
as $avisos$
    -- Con sus respuestas: el portero ve que ya contesto (y que contesto el otro turno).
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'caso', c.numero, 'texto', a.texto, 'desde', a.creado_en,
               'respuestas', coalesce((select jsonb_agg(jsonb_build_object('respuesta', s.respuesta, 'en', s.hecho_en,
                                                                           'mia', s.hecho_por = (auth.jwt() ->> 'email'))
                                                        order by s.hecho_en)
                                         from caseta_respuestas s where s.aviso_id = a.id), '[]'::jsonb))
                              order by a.creado_en desc), '[]'::jsonb)
      from caseta_avisos a
      join casos c on c.id = a.caso_id
     where a.cerrado_en is null
       and c.estado not in ('resuelto', 'descartado')
       and (a.hasta is null or a.hasta >= (now() at time zone 'America/Mexico_City')::date)
       and ((p_registro_id is not null and a.registro_id = p_registro_id)
            or (p_tarjeta is not null and a.tarjeta = p_tarjeta))
$avisos$;


-- ---------------------------------------------------------------------
-- 3. LOS RPC DE LOS AVISOS
-- ---------------------------------------------------------------------
-- 3.1 Avisar a la caseta, desde un caso vivo. Solo TI (super pasa siempre).
create function avisar_caseta(
    p_caso      uuid,
    p_texto     text,
    p_lotes     text[] default '{}',
    p_hasta     date   default null,
    p_hecho_por text   default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $avisar$
declare
    v_quien  text;
    c        casos%rowtype;
    v_texto  text := btrim(coalesce(p_texto, ''));
    v_lotes  text[] := coalesce(p_lotes, '{}');
    v_id     uuid;
begin
    perform panel_exigir_rol(array['ti']);
    select * into c from casos where id = p_caso for update;
    if c.id is null then
        raise exception 'Ese caso no existe. Vuelva a abrir el tablero.';
    end if;
    if c.estado in ('resuelto', 'descartado') then
        raise exception 'El caso está cerrado: reábralo para avisar a la caseta.';
    end if;
    if char_length(v_texto) < 5 or char_length(v_texto) > 300 then
        raise exception 'Escriba qué debe hacer la caseta, en menos de 300 caracteres.';
    end if;
    if not (v_lotes <@ array['E1', 'E2']) then
        raise exception 'El estacionamiento no es válido.';
    end if;
    if p_hasta is not null and p_hasta < (now() at time zone 'America/Mexico_City')::date then
        raise exception 'La fecha límite ya pasó.';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');
    insert into caseta_avisos (caso_id, registro_id, tarjeta, texto, lotes, hasta, creado_por)
    values (c.id, c.registro_id,
            coalesce(c.tarjeta, (select nullif(btrim(no_dispositivo), '') from registros where id = c.registro_id)),
            v_texto, (select coalesce(array_agg(distinct x order by x), '{}') from unnest(v_lotes) x), p_hasta, v_quien)
    returning id into v_id;
    insert into casos_notas (caso_id, clase, nota, hecho_por)
    values (c.id, 'nota', left('Aviso a la caseta: ' || v_texto, 4000), v_quien);
    update casos set actualizado_en = now() where id = c.id;
    return jsonb_build_object('id', v_id);
end;
$avisar$;

-- 3.2 Retirar un aviso. Solo TI.
create function retirar_aviso_caseta(p_aviso uuid, p_hecho_por text default null) returns jsonb
language plpgsql
security definer
set search_path = public
as $retirar$
declare
    v_quien text;
    a       caseta_avisos%rowtype;
begin
    perform panel_exigir_rol(array['ti']);
    select * into a from caseta_avisos where id = p_aviso for update;
    if a.id is null then
        raise exception 'Ese aviso no existe. Vuelva a abrir el caso.';
    end if;
    if a.cerrado_en is not null then
        return jsonb_build_object('id', a.id, 'yaEstaba', true);
    end if;
    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');
    update caseta_avisos set cerrado_por = v_quien, cerrado_en = now() where id = a.id;
    insert into casos_notas (caso_id, clase, nota, hecho_por)
    values (a.caso_id, 'nota', 'Se retiró el aviso a la caseta.', v_quien);
    return jsonb_build_object('id', a.id, 'yaEstaba', false);
end;
$retirar$;

-- 3.3 La caseta responde un aviso. Quien responde es el correo de la sesion.
-- La respuesta es una nota del caso; si el caso estaba en Nuevo o Esperando,
-- vuelve a «Por atender» (Gerardo, 14-oct).
create function caseta_responder_aviso(p_aviso uuid, p_respuesta text) returns jsonb
language plpgsql
security definer
set search_path = public
as $responder$
declare
    v_quien text := auth.jwt() ->> 'email';
    v_resp  text := btrim(coalesce(p_respuesta, ''));
    a       caseta_avisos%rowtype;
    c       casos%rowtype;
    v_movio boolean := false;
begin
    perform caseta_exigir_rol();
    if v_quien is null or btrim(v_quien) = '' then
        raise exception 'Su sesión no trae correo. Cierre sesión y vuelva a entrar.';
    end if;
    if char_length(v_resp) < 2 or char_length(v_resp) > 500 then
        raise exception 'Escriba la respuesta, en menos de 500 caracteres.';
    end if;
    select * into a from caseta_avisos where id = p_aviso;
    if a.id is null or a.cerrado_en is not null then
        raise exception 'Ese aviso ya no está vigente. Vuelva a buscar el vehículo.';
    end if;
    select * into c from casos where id = a.caso_id for update;
    if c.estado in ('resuelto', 'descartado') then
        raise exception 'Sistemas ya cerró ese caso. Vuelva a buscar el vehículo.';
    end if;

    insert into caseta_respuestas (aviso_id, respuesta, hecho_por) values (a.id, v_resp, v_quien);
    insert into casos_notas (caso_id, clase, nota, hecho_por)
    values (c.id, 'nota', left('Respuesta de la caseta: ' || v_resp, 4000), v_quien);

    if c.estado in ('nuevo', 'esperando', 'seguimiento') then
        update casos
           set estado = 'abierto', espera_motivo = null, espera_hasta = null, espera_texto = null,
               actualizado_en = now()
         where id = c.id;
        insert into casos_notas (caso_id, clase, estado_antes, estado_despues, nota, hecho_por)
        values (c.id, 'estado', c.estado, 'abierto', 'Regresa a Por atender: respondió la caseta.', v_quien);
        v_movio := true;
    else
        update casos set actualizado_en = now() where id = c.id;
    end if;
    return jsonb_build_object('caso', c.numero, 'porAtender', v_movio);
end;
$responder$;


-- ---------------------------------------------------------------------
-- 4. caseta_buscar (extraida del 97, delta: los avisos de cada resultado)
-- ---------------------------------------------------------------------
create or replace function caseta_buscar(p_texto text, p_lotes text[]) returns jsonb
language plpgsql
security definer
set search_path = public
as $buscar$
declare
    v_q        text := zk_texto_comparable(left(coalesce(p_texto, ''), 80));
    v_palabras text[];
    v_compacto text;
    v_res      jsonb;
    v_n        int;
begin
    perform caseta_exigir_rol();
    if p_lotes is null or cardinality(p_lotes) = 0 or not (p_lotes <@ array['E1', 'E2']) then
        raise exception 'Elija qué estacionamiento cubre la caseta.';
    end if;
    v_q := btrim(regexp_replace(v_q, '[^A-Z0-9 ]', ' ', 'g'));
    v_q := regexp_replace(v_q, '\s+', ' ', 'g');
    if char_length(replace(v_q, ' ', '')) < 3 then
        raise exception 'Escriba al menos 3 letras o números.';
    end if;
    v_palabras := regexp_split_to_array(v_q, ' ');
    v_compacto := replace(v_q, ' ', '');

    with por_registro as (
        select r.id as registro_id, r.no_dispositivo as tarjeta,
               (r.no_dispositivo = v_compacto or regexp_replace(upper(coalesce(r.placas, '')), '[^A-Z0-9]', '', 'g') = v_compacto) as exacto
          from registros r
         where (select bool_and(zk_texto_comparable(concat_ws(' ', r.usuario_nombre_completo, r.placas, r.marca, r.modelo,
                                                              r.color, r.no_dispositivo, r.tag_apartado_no)) like '%' || w || '%')
                  from unnest(v_palabras) w)
            or regexp_replace(upper(coalesce(r.placas, '')), '[^A-Z0-9]', '', 'g') like '%' || v_compacto || '%'
    ),
    -- Un TAG que ya se cambio: se busca por el numero que el portero lee en el parabrisas.
    por_tag_anterior as (
        select distinct m.registro_id, v_compacto as tarjeta, true as exacto
          from movimientos m
         where v_compacto ~ '^[0-9]{6,12}$' and m.no_dispositivo_anterior = v_compacto
    ),
    por_zk as (
        select (select r.id from registros r where r.no_dispositivo = z.tarjeta
                 order by (r.estado = 'baja'), r.created_at desc limit 1) as registro_id,
               z.tarjeta,
               (z.tarjeta = v_compacto or regexp_replace(upper(coalesce(z.placa, '')), '[^A-Z0-9]', '', 'g') = v_compacto) as exacto
          from zk_padron z
         where (select bool_and(zk_texto_comparable(concat_ws(' ', z.nombre, z.placa, z.tarjeta)) like '%' || w || '%')
                  from unnest(v_palabras) w)
            or regexp_replace(upper(coalesce(z.placa, '')), '[^A-Z0-9]', '', 'g') like '%' || v_compacto || '%'
    ),
    todos as (
        select * from por_registro union all select * from por_tag_anterior union all select * from por_zk
    ),
    -- Uno por TAG (o por expediente si no tiene TAG): gana el expediente vivo.
    unicos as (
        select distinct on (coalesce(t.tarjeta, t.registro_id::text))
               t.registro_id, t.tarjeta,
               bool_or(t.exacto) over (partition by coalesce(t.tarjeta, t.registro_id::text)) as exacto,
               r.estado, coalesce(r.usuario_nombre_completo, z.nombre, '') as nombre
          from todos t
          left join registros r on r.id = t.registro_id
          left join zk_padron z on z.tarjeta = t.tarjeta
         order by coalesce(t.tarjeta, t.registro_id::text),
                  (r.estado is null), (r.estado = 'baja'), r.created_at desc
    ),
    elegidos as (
        select * from unicos
         order by exacto desc, (estado = 'activo') desc nulls last, nombre
         limit 8
    )
    select coalesce(jsonb_agg(jsonb_build_object(
               'registroId', e.registro_id,
               'nombre', nullif(e.nombre, ''),
               'tipo', r.tipo_usuario,
               'estado', r.estado,
               'marca', r.marca, 'modelo', r.modelo, 'color', r.color,
               'placa', r.placas,
               'plumas', coalesce((select array_agg(x.estacionamiento_clave order by x.estacionamiento_clave)
                                     from registro_estacionamientos x where x.registro_id = e.registro_id), '{}'),
               -- Contexto (Gerardo, 14-oct): sus ultimas lecturas en la pluma, las que
               -- abrieron y las que rechazo, para armar sus ultimas estancias. Llegan
               -- hasta el ultimo archivo de ZK que subio Sistemas: no es tiempo real.
               'pasos', coalesce((select jsonb_agg(p order by p.en)
                                    from (select to_char(ev.ocurrio_en, 'YYYY-MM-DD"T"HH24:MI:SS') as en, ev.lote, ev.sentido, ev.concedido
                                            from zk_eventos ev
                                           where e.tarjeta is not null and ev.tarjeta = e.tarjeta and not ev.repeticion
                                           order by ev.ocurrio_en desc
                                           limit 16) p), '[]'::jsonb),
               -- NUEVO 98: lo que Sistemas le pide a la caseta sobre este vehiculo.
               'avisos', caseta_avisos_de(e.registro_id, e.tarjeta),
               'evaluaciones', (select jsonb_object_agg(l, caseta_evaluar(e.registro_id, e.tarjeta, l || '-entrada'))
                                  from unnest(p_lotes) l))
             order by e.exacto desc, (e.estado = 'activo') desc nulls last, e.nombre), '[]'::jsonb),
           count(*)
      into v_res, v_n
      from elegidos e
      left join registros r on r.id = e.registro_id;

    insert into caseta_consultas (hecho_por, puerta, texto, resultados)
    values (coalesce(auth.jwt() ->> 'email', '(sin correo)'), array_to_string(p_lotes, '+'), left(btrim(coalesce(p_texto, '')), 80), v_n);

    return v_res;
end;
$buscar$;

-- ---------------------------------------------------------------------
-- 5. caseta_inicio (extraida del 97, delta: avisos en lugar de cambios)
-- ---------------------------------------------------------------------
create or replace function caseta_inicio(p_todos boolean default false) returns jsonb
language plpgsql
security definer
set search_path = public
as $inicio$
declare
    v_quien    text := auth.jwt() ->> 'email';
    v_desde    timestamp := (select max(ocurrio_en) from zk_eventos) - interval '30 days';
    v_avisos   jsonb;
    v_reportes jsonb;
begin
    perform caseta_exigir_rol();

    -- NUEVO 98 (Gerardo, 14-oct): en lugar de la lista automatica de cambios,
    -- los AVISOS que Sistemas le dejo a la caseta desde los casos, vivos (sin
    -- retirar, sin vencer y con su caso abierto), con lo que ya se respondio.
    select coalesce(jsonb_agg(x order by x.desde desc), '[]'::jsonb)
      into v_avisos
      from (
        select a.id, c.numero as caso, a.texto, a.lotes, a.creado_en as desde, a.hasta, a.tarjeta,
               coalesce(r.usuario_nombre_completo, nullif(z.nombre, '')) as nombre,
               r.marca, r.modelo, r.color,
               coalesce(r.placas, nullif(btrim(coalesce(z.placa, '')), '')) as placa,
               coalesce((select jsonb_agg(jsonb_build_object('respuesta', s.respuesta, 'en', s.hecho_en,
                                                             'mia', s.hecho_por = v_quien) order by s.hecho_en)
                           from caseta_respuestas s where s.aviso_id = a.id), '[]'::jsonb) as respuestas
          from caseta_avisos a
          join casos c on c.id = a.caso_id
          left join registros r on r.id = a.registro_id
          left join zk_padron z on z.tarjeta = a.tarjeta
         where a.cerrado_en is null
           and c.estado not in ('resuelto', 'descartado')
           and (a.hasta is null or a.hasta >= (now() at time zone 'America/Mexico_City')::date)
         order by a.creado_en desc
         limit 60
      ) x;

    select coalesce(jsonb_agg(m order by m.en desc), '[]'::jsonb)
      into v_reportes
      from (
        select cr.hecho_en as en, cr.clase, cr.puerta, cr.motivo, cr.veredicto,
               coalesce(r.usuario_nombre_completo, cr.placa_norm, cr.vehiculo_texto) as quien,
               cr.hecho_por = v_quien as mio,
               cr.ligado_en is not null as ligado,
               c.numero as caso, c.estado as "estadoCaso", c.cierre_motivo as "cierreMotivo", c.cerrado_en as "cerradoEn"
          from caseta_reportes cr
          left join registros r on r.id = cr.registro_id
          left join casos c on c.id = cr.caso_id
         where (cr.hecho_por = v_quien or coalesce(p_todos, false))
           and cr.hecho_en > now() - interval '30 days'
         order by cr.hecho_en desc
         limit 40
      ) m;

    return jsonb_build_object(
        'avisos', v_avisos,
        'reportes', v_reportes,
        'padronZkAl', (select max(cargado_en) from zk_padron_cargas),
        -- Hasta donde llegan las lecturas de la pluma (hora de pared de ZK).
        'eventosHasta', (select to_char(max(ocurrio_en), 'YYYY-MM-DD"T"HH24:MI:SS') from zk_eventos),
        'puertasZkAl', (select max(cargado_en) from zk_puertas_cargas));
end;
$inicio$;

-- Permisos. La interna, para nadie; los RPC, para authenticated (la guardia
-- decide el rol). Las dos funciones del 97 conservan su firma y sus permisos;
-- se repiten por si acaso.
revoke all on function caseta_avisos_de(uuid, text)                    from public, anon, authenticated;
revoke all on function avisar_caseta(uuid, text, text[], date, text)   from public, anon;
revoke all on function retirar_aviso_caseta(uuid, text)                from public, anon;
revoke all on function caseta_responder_aviso(uuid, text)              from public, anon;
revoke all on function caseta_buscar(text, text[])                     from public, anon;
revoke all on function caseta_inicio(boolean)                          from public, anon;
grant execute on function avisar_caseta(uuid, text, text[], date, text) to authenticated;
grant execute on function retirar_aviso_caseta(uuid, text)              to authenticated;
grant execute on function caseta_responder_aviso(uuid, text)            to authenticated;
grant execute on function caseta_buscar(text, text[])                   to authenticated;
grant execute on function caseta_inicio(boolean)                        to authenticated;

notify pgrst, 'reload schema';

commit;


-- ---------------------------------------------------------------------
-- 6. VERIFICACION (solo lectura): todas las filas con ok = true
-- ---------------------------------------------------------------------
select 1 as orden, 'caseta_avisos y caseta_respuestas existen con RLS' as que,
       (select bool_and(relrowsecurity) from pg_class
         where oid in ('public.caseta_avisos'::regclass, 'public.caseta_respuestas'::regclass)) as ok
union all
select 2, 'anon no lee y authenticated no escribe los avisos',
       not has_table_privilege('anon', 'public.caseta_avisos', 'select')
       and not has_table_privilege('anon', 'public.caseta_respuestas', 'select')
       and not has_table_privilege('authenticated', 'public.caseta_avisos', 'insert')
       and not has_table_privilege('authenticated', 'public.caseta_respuestas', 'insert')
union all
select 3, 'una sola forma de cada funcion, security definer',
       (select count(*) from pg_proc where proname in ('caseta_avisos_de', 'avisar_caseta', 'retirar_aviso_caseta',
                                                     'caseta_responder_aviso', 'caseta_buscar', 'caseta_inicio')) = 6
       and (select bool_and(prosecdef) from pg_proc where proname in ('caseta_avisos_de', 'avisar_caseta', 'retirar_aviso_caseta',
                                                                     'caseta_responder_aviso', 'caseta_buscar', 'caseta_inicio'))
union all
select 4, 'caseta_buscar trae los avisos de cada resultado',
       (select prosrc like '%''avisos'', caseta_avisos_de(e.registro_id, e.tarjeta)%' from pg_proc where proname = 'caseta_buscar')
union all
select 5, 'caseta_inicio da avisos y ya no la lista automatica',
       (select prosrc like '%''avisos'', v_avisos%' and prosrc not like '%v_cambios%' from pg_proc where proname = 'caseta_inicio')
union all
select 6, 'anon no ejecuta ningun RPC nuevo y la interna no se expone',
       not has_function_privilege('anon', 'public.avisar_caseta(uuid, text, text[], date, text)', 'execute')
       and not has_function_privilege('anon', 'public.retirar_aviso_caseta(uuid, text)', 'execute')
       and not has_function_privilege('anon', 'public.caseta_responder_aviso(uuid, text)', 'execute')
       and not has_function_privilege('authenticated', 'public.caseta_avisos_de(uuid, text)', 'execute')
union all
select 7, 'authenticated ejecuta los RPC de los avisos y los del 97',
       has_function_privilege('authenticated', 'public.avisar_caseta(uuid, text, text[], date, text)', 'execute')
       and has_function_privilege('authenticated', 'public.retirar_aviso_caseta(uuid, text)', 'execute')
       and has_function_privilege('authenticated', 'public.caseta_responder_aviso(uuid, text)', 'execute')
       and has_function_privilege('authenticated', 'public.caseta_buscar(text, text[])', 'execute')
       and has_function_privilege('authenticated', 'public.caseta_inicio(boolean)', 'execute')
union all
select 8, 'ninguna politica nombra a portero y ningun mensaje tutea',
       not exists (select 1 from pg_policies where schemaname = 'public'
                    and (coalesce(qual, '') like '%portero%' or coalesce(with_check, '') like '%portero%'))
       and not exists (select 1 from pg_proc where proname in ('avisar_caseta', 'retirar_aviso_caseta', 'caseta_responder_aviso', 'caseta_inicio', 'caseta_buscar')
                         and prosrc ~* '\m(tu|tus|elige|escribe|vuelve|abre con|pidele|llama)\M')
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). Primero las funciones y tablas nuevas; luego
-- caseta_buscar y caseta_inicio vuelven al cuerpo del 97: correr con
-- «create or replace function» las lineas 464-564 y 583-675 de
-- 97_caseta.sql. Las notas que dejaron los avisos en los casos se quedan
-- (son historia del caso).
-- ---------------------------------------------------------------------
--   begin;
--   drop function if exists caseta_responder_aviso(uuid, text);
--   drop function if exists retirar_aviso_caseta(uuid, text);
--   drop function if exists avisar_caseta(uuid, text, text[], date, text);
--   -- (aqui, el create or replace de caseta_buscar y caseta_inicio del 97)
--   drop function if exists caseta_avisos_de(uuid, text);
--   drop table if exists caseta_respuestas;
--   drop table if exists caseta_avisos;
--   commit;
--   notify pgrst, 'reload schema';
