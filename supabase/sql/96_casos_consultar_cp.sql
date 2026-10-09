-- =====================================================================
-- BLOQUE 96 — Casos: la columna «Consultar con el CP».
--
-- SC-032 · 09/10/2026
--
-- POR QUE
--   Hay casos que no se pueden resolver sin tocar base con Gerencia
--   Administrativa (el CP). Gerardo pidio el 9-oct una columna propia en el
--   tablero para juntarlos y llevarlos a la consulta, en vez de mezclarlos con
--   «Por atender» o «Esperando».
--
-- QUE CAMBIA
--   1. casos.estado admite 'consultar' (se AMPLIA la lista: nada existente cambia).
--   2. mover_casos: cuerpo EXTRAIDO de 90_casos_tablero.sql (ningun bloque
--      posterior lo toco) con el delta verificado por diff: acepta 'consultar',
--      pide la pregunta (p_espera_texto, como «esperar a un tercero») y la
--      guarda en espera_texto. Misma firma: `create or replace`, sin sobrecarga.
--
-- ORDEN CON EL CLIENTE: este bloque AGREGA, va ANTES del deploy. El cliente
-- publicado nunca manda 'consultar', asi que nada de lo que ya hace cambia.
-- =====================================================================

begin;

-- GUARDIA: el estado de partida es el del bloque 90. Si no, no se aplica nada.
do $guardia$
begin
    if exists (select 1 from pg_constraint where conname = 'casos_estado'
                and pg_get_constraintdef(oid) like '%consultar%') then
        raise exception 'El bloque 96 ya esta aplicado (casos_estado admite consultar). No se aplico nada.';
    end if;
    if (select count(*) from pg_proc where proname = 'mover_casos') <> 1 then
        raise exception 'Hay mas de una mover_casos (o ninguna). No se aplico nada.';
    end if;
    if not exists (select 1 from pg_proc where proname = 'mover_casos'
                    and prosrc like '%El caso solo puede pasar a Por atender, Esperando o Cerrado.%') then
        raise exception 'mover_casos no es la del bloque 90. No se aplico nada: revise que bloque la dejo asi.';
    end if;
end;
$guardia$;

-- 1. El estado nuevo.
alter table casos drop constraint casos_estado;
alter table casos add constraint casos_estado
    check (estado in ('nuevo', 'abierto', 'consultar', 'esperando', 'seguimiento', 'resuelto', 'descartado'));

comment on column casos.espera_texto is 'A quien o que se espera (estado esperando, motivo tercero) o que hay que consultar con el CP (estado consultar, bloque 96).';

-- 2. mover_casos (extraido del 90, delta del 96).
create or replace function mover_casos(
    p_casos         uuid[],
    p_estado        text,
    p_nota          text default '',
    p_motivo        text default null,
    p_espera_motivo text default null,
    p_espera_hasta  date default null,
    p_espera_texto  text default null,
    p_hecho_por     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $mover$
declare
    v_quien   text;
    v_nota    text := btrim(coalesce(p_nota, ''));
    v_motivo  text := nullif(btrim(coalesce(p_motivo, '')), '');
    v_esp     text := nullif(btrim(coalesce(p_espera_motivo, '')), '');
    v_texto   text := nullif(btrim(coalesce(p_espera_texto, '')), '');
    v_cierra  boolean := p_estado in ('resuelto', 'descartado');
    v_linea   text;
    v_caso    record;
    v_movidos int := 0;
begin
    perform panel_exigir_rol(array['ti', 'contador', 'admin']);

    if p_casos is null or cardinality(p_casos) = 0 then
        raise exception 'Elija al menos un caso.';
    end if;
    if cardinality(p_casos) > 500 then
        raise exception 'Son demasiados casos a la vez: mueva menos de 500.';
    end if;
    if p_estado is null or p_estado not in ('abierto', 'consultar', 'esperando', 'resuelto', 'descartado') then
        raise exception 'El caso solo puede pasar a Por atender, Consultar con el CP, Esperando o Cerrado.';
    end if;
    if char_length(v_nota) > 4000 or char_length(coalesce(v_motivo, '')) > 200 or char_length(coalesce(v_texto, '')) > 200 then
        raise exception 'El texto es demasiado largo.';
    end if;
    if p_estado = 'esperando' then
        if v_esp is null or v_esp not in ('persona', 'tercero', 'fecha') then
            raise exception 'Diga que se espera: a la persona, a alguien de fuera o una fecha.';
        end if;
        if v_esp = 'fecha' and (p_espera_hasta is null or p_espera_hasta <= (now() at time zone 'America/Mexico_City')::date) then
            raise exception 'La fecha de espera tiene que ser posterior a hoy.';
        end if;
        if v_esp = 'tercero' and v_texto is null then
            raise exception 'Escriba a quien o que se espera.';
        end if;
    end if;
    -- NUEVO 96: consultar con el CP pide la pregunta, como esperar a un tercero.
    if p_estado = 'consultar' and v_texto is null then
        raise exception 'Escriba qué hay que consultar con el CP.';
    end if;
    if v_cierra and v_motivo is null and v_nota = '' then
        raise exception 'Para cerrar, elija el motivo o escriba que se hizo.';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');
    v_linea := case
        when v_cierra then concat_ws('. ', v_motivo, nullif(v_nota, ''))
        when p_estado = 'consultar' then 'Consultar con el CP: ' || v_texto || coalesce(' — ' || nullif(v_nota, ''), '')
        when p_estado = 'esperando' then concat_ws('. ',
            case v_esp when 'persona' then 'Esperando a que la persona se presente'
                       when 'tercero' then 'Esperando a ' || v_texto
                       else 'Esperando hasta el ' || to_char(p_espera_hasta, 'DD/MM/YYYY') end,
            nullif(v_nota, ''))
        else v_nota
    end;

    for v_caso in select id, estado from casos where id = any (p_casos) order by numero for update loop
        if v_caso.estado = p_estado then
            continue;
        end if;
        update casos
           set estado         = p_estado,
               actualizado_en = now(),
               espera_motivo  = case when p_estado = 'esperando' then v_esp end,
               espera_hasta   = case when p_estado = 'esperando' and v_esp = 'fecha' then p_espera_hasta end,
               espera_texto   = case when p_estado in ('esperando', 'consultar') then v_texto end,
               atorado        = case when p_estado = 'abierto' then atorado else false end,
               cerrado_por    = case when v_cierra then v_quien end,
               cerrado_en     = case when v_cierra then now() end,
               cierre_nota    = case when v_cierra then v_linea end,
               cierre_motivo  = case when v_cierra then v_motivo end
         where id = v_caso.id;
        insert into casos_notas (caso_id, clase, estado_antes, estado_despues, nota, hecho_por)
        values (v_caso.id, 'estado', v_caso.estado, p_estado,
                left(v_linea || case when cardinality(p_casos) > 1 then ' (junto con otros ' || (cardinality(p_casos) - 1) || ')' else '' end, 4000),
                v_quien);
        v_movidos := v_movidos + 1;
    end loop;

    if v_movidos = 0 and not exists (select 1 from casos where id = any (p_casos)) then
        raise exception 'Los casos no existen. Vuelva a abrir la pantalla y reintente.';
    end if;
    return jsonb_build_object('movidos', v_movidos, 'estado', p_estado, 'hechoPor', v_quien);
end;
$mover$;

-- La firma no cambia: los permisos se conservan. Se repiten por si acaso.
revoke all     on function mover_casos(uuid[], text, text, text, text, date, text, text) from public, anon;
grant  execute on function mover_casos(uuid[], text, text, text, text, date, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;


-- VERIFICACION (solo lectura). Cuatro filas con ok = true.
select 1 as orden, 'casos.estado admite consultar y conserva los demas' as que,
       (select pg_get_constraintdef(oid) from pg_constraint where conname = 'casos_estado')
           ~ 'nuevo.*abierto.*consultar.*esperando.*seguimiento.*resuelto.*descartado' as ok
union all
select 2, 'mover_casos acepta consultar y pide la pregunta',
       (select prosrc like '%''abierto'', ''consultar'', ''esperando''%'
               and prosrc like '%Escriba qué hay que consultar con el CP.%'
               and prosrc like '%p_estado in (''esperando'', ''consultar'') then v_texto%'
          from pg_proc where proname = 'mover_casos')
union all
select 3, 'una sola mover_casos, security definer y anon no la ejecuta',
       (select count(*) from pg_proc where proname = 'mover_casos') = 1
       and exists (select 1 from pg_proc where proname = 'mover_casos' and prosecdef)
       and not has_function_privilege('anon', 'mover_casos(uuid[], text, text, text, text, date, text, text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'mover_casos(uuid[], text, text, text, text, date, text, text)', 'EXECUTE')
union all
select 4, 'ningun mensaje tutea',
       (select prosrc !~* '\m(tu|tus|elige|escribe|mueve)\M' from pg_proc where proname = 'mover_casos')
order by orden;


-- ROLLBACK (comentado). Primero devolver a «Por atender» lo que este en
-- Consultar con el CP; luego la lista de estados del 90 y mover_casos del 90.
--
--   begin;
--   insert into casos_notas (caso_id, clase, estado_antes, estado_despues, nota, hecho_por)
--   select id, 'estado', 'consultar', 'abierto', 'Vuelve a Por atender: se quito la columna Consultar con el CP.', 'rollback-96'
--     from casos where estado = 'consultar';
--   update casos set estado = 'abierto', espera_texto = null, actualizado_en = now() where estado = 'consultar';
--   alter table casos drop constraint casos_estado;
--   alter table casos add constraint casos_estado
--       check (estado in ('nuevo', 'abierto', 'esperando', 'seguimiento', 'resuelto', 'descartado'));
--   -- y volver a correr el cuerpo de mover_casos de 90_casos_tablero.sql
--   -- (lineas 228-321) con «create or replace function».
--   commit;
--   notify pgrst, 'reload schema';
