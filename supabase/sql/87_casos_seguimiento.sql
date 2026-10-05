-- =====================================================================
-- BLOQUE 87 — El seguimiento de los casos del estacionamiento.
--
-- SC-031 · 05/10/2026
--
-- POR QUE
--   Lo que no cuadra entre SATAG, ZK y la pluma ya salia en pantalla, pero
--   suelto (el letrero de «ningun padron», el aviso de BAJAS en Personas, «Lo
--   que no cuadra» en la ficha) y sin memoria: cada dia se volvia a ver lo
--   mismo y nadie podia decir «esto ya lo vimos, va asi». Gerardo, 5-oct: los
--   docentes que la pluma rechaza a diario «hay que reportarlo en SATAG y
--   darle seguimiento dia con dia».
--
--   LOS CASOS NO SE GUARDAN: se calculan en la pantalla con la bitacora, el
--   padron de ZK y los expedientes (lib/casos.ts), igual para quien la abra.
--   Lo unico que se guarda es lo que una persona decide de cada uno: en que
--   estado esta, que se acordo, quien y cuando. Asi un caso que deja de
--   ocurrir desaparece solo, y uno resuelto que vuelve a pasar se ve.
--
-- QUE HACE, EN ORDEN
--   1. Guardia: panel_exigir_rol (bloque 29).
--   2. `casos_seguimiento`: una fila por caso (su clave la arma la pantalla:
--      tipo + tarjeta [+ lote]). Estado, nota, quien y cuando.
--   3. `casos_seguimiento_historial`: cada cambio, para saber quien movio que.
--   4. RLS: leen ti, contador y super con MFA; escribir, solo por el RPC.
--   5. RPC `seguir_caso` (rol ti; super pasa siempre).
--   6. Verificacion de solo lectura: cinco filas con ok = true.
--
-- No lleva datos personales: la clave trae un numero de tarjeta, como
-- zk_eventos, y la nota la escribe TI. Misma RLS que la bitacora.
--
-- Este bloque solo AGREGA: va ANTES del deploy del cliente que lo usa.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. GUARDIA
-- ---------------------------------------------------------------------
do $guardia$
begin
    if to_regprocedure('public.panel_exigir_rol(text[])') is null then
        raise exception 'Falta panel_exigir_rol: aplique antes el bloque 29. No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. LAS TABLAS
-- ---------------------------------------------------------------------
create table if not exists casos_seguimiento (
    clave           text primary key,
    estado          text not null default 'pendiente',
    nota            text not null default '',
    actualizado_por text not null,
    actualizado_en  timestamptz not null default now(),
    constraint casos_clave_formato  check (clave ~ '^[a-z-]+:[0-9]+(:E[0-9]+)?$'),
    constraint casos_estado_valido  check (estado in ('pendiente', 'revision', 'resuelto')),
    constraint casos_nota_corta     check (char_length(nota) <= 2000)
);

create table if not exists casos_seguimiento_historial (
    id         bigint generated always as identity primary key,
    clave      text not null,
    estado     text not null,
    nota       text not null,
    hecho_por  text not null,
    hecho_en   timestamptz not null default now()
);

create index if not exists ix_casos_hist_clave on casos_seguimiento_historial (clave, hecho_en desc);

comment on table casos_seguimiento is 'Lo que una persona decidio de cada caso del estacionamiento (bloque 87). El caso se calcula en la pantalla (lib/casos.ts); aqui solo su estado y nota.';
comment on column casos_seguimiento.clave is 'tipo:tarjeta[:lote], la arma lib/casos.ts. Estable mientras el caso sea el mismo.';
comment on table casos_seguimiento_historial is 'Cada cambio de estado o nota de un caso (bloque 87): quien y cuando.';


-- ---------------------------------------------------------------------
-- 2. RLS Y PRIVILEGIOS. Leen quienes miden; escribir, solo por el RPC.
-- ---------------------------------------------------------------------
alter table casos_seguimiento           enable row level security;
alter table casos_seguimiento_historial enable row level security;

drop policy if exists casos_lectura_panel on casos_seguimiento;
create policy casos_lectura_panel on casos_seguimiento
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti','contador','super')
    );

drop policy if exists casos_hist_lectura_panel on casos_seguimiento_historial;
create policy casos_hist_lectura_panel on casos_seguimiento_historial
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti','contador','super')
    );

revoke all on table casos_seguimiento, casos_seguimiento_historial from anon, public;
revoke insert, update, delete, truncate, references, trigger
    on table casos_seguimiento, casos_seguimiento_historial from authenticated;
grant  select on table casos_seguimiento, casos_seguimiento_historial to authenticated;


-- ---------------------------------------------------------------------
-- 3. EL RPC
-- ---------------------------------------------------------------------
create or replace function seguir_caso(
    p_clave     text,
    p_estado    text,
    p_nota      text default '',
    p_hecho_por text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $seguir$
declare
    v_quien text;
    v_clave text := btrim(coalesce(p_clave, ''));
    v_est   text := btrim(coalesce(p_estado, ''));
    v_nota  text := btrim(coalesce(p_nota, ''));
    v_en    timestamptz;
begin
    perform panel_exigir_rol(array['ti']);

    if v_clave !~ '^[a-z-]+:[0-9]+(:E[0-9]+)?$' then
        raise exception 'El caso no tiene una clave valida. Vuelva a abrir la pantalla y reintente.';
    end if;
    if v_est not in ('pendiente', 'revision', 'resuelto') then
        raise exception 'El estado del caso tiene que ser pendiente, en revision o resuelto.';
    end if;
    if char_length(v_nota) > 2000 then
        raise exception 'La nota es demasiado larga: use menos de 2,000 caracteres.';
    end if;
    if v_est = 'resuelto' and v_nota = '' then
        raise exception 'Para dar un caso por resuelto, escriba en la nota que se hizo.';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    insert into casos_seguimiento as c (clave, estado, nota, actualizado_por, actualizado_en)
    values (v_clave, v_est, v_nota, v_quien, now())
    on conflict (clave) do update
       set estado = excluded.estado, nota = excluded.nota,
           actualizado_por = excluded.actualizado_por, actualizado_en = now()
    returning actualizado_en into v_en;

    insert into casos_seguimiento_historial (clave, estado, nota, hecho_por)
    values (v_clave, v_est, v_nota, v_quien);

    return jsonb_build_object('clave', v_clave, 'estado', v_est, 'nota', v_nota,
                              'actualizadoPor', v_quien, 'actualizadoEn', v_en);
end;
$seguir$;

revoke all    on function seguir_caso(text, text, text, text) from public, anon;
grant  execute on function seguir_caso(text, text, text, text) to authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- 4. VERIFICACION (solo lectura). Cinco filas con ok = true.
-- ---------------------------------------------------------------------
select 1 as orden, 'existen casos_seguimiento y su historial' as que,
       to_regclass('public.casos_seguimiento') is not null
       and to_regclass('public.casos_seguimiento_historial') is not null as ok
union all
select 2, 'las dos tienen RLS',
       (select bool_and(relrowsecurity) from pg_class
         where oid in ('public.casos_seguimiento'::regclass, 'public.casos_seguimiento_historial'::regclass))
union all
select 3, 'anon fuera; authenticated solo lee (la RLS decide quien)',
       not has_table_privilege('anon', 'casos_seguimiento', 'SELECT')
       and not has_table_privilege('anon', 'casos_seguimiento_historial', 'SELECT')
       and has_table_privilege('authenticated', 'casos_seguimiento', 'SELECT')
       and not has_table_privilege('authenticated', 'casos_seguimiento', 'INSERT')
       and not has_table_privilege('authenticated', 'casos_seguimiento', 'UPDATE')
       and not has_table_privilege('authenticated', 'casos_seguimiento_historial', 'INSERT')
union all
select 4, 'seguir_caso: security definer, anon no la ejecuta, authenticated si',
       exists (select 1 from pg_proc where proname = 'seguir_caso' and prosecdef)
       and not has_function_privilege('anon', 'seguir_caso(text, text, text, text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'seguir_caso(text, text, text, text)', 'EXECUTE')
union all
select 5, 'ningun mensaje tutea',
       (select prosrc !~* '\m(tu|tus|elige|reintenta|verifica|escribe)\M' from pg_proc where proname = 'seguir_caso')
order by orden;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). Primero revertir el deploy del cliente. Se pierden
-- los estados y notas guardados; los casos se siguen calculando igual.
--
--   drop function if exists seguir_caso(text, text, text, text);
--   drop table if exists casos_seguimiento_historial;
--   drop table if exists casos_seguimiento;
--   notify pgrst, 'reload schema';
-- ---------------------------------------------------------------------
