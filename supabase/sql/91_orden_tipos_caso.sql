-- =====================================================================
-- BLOQUE 91 — El orden de las familias y de los tipos de caso, para todos.
--
-- SC-032 · 08/10/2026
--
-- POR QUE
--   Gerardo, 8-oct: el tablero agrupado muestra primero «Departamento de ZK
--   distinto» y al final «Exempleado con TAG vivo», o primero «Preguntar al
--   presentarse» y al final «Excepcion de acceso», y lo quiere al reves. El
--   orden ya vive en la base (`casos_familias.orden`, `casos_tipos.orden`),
--   pero solo `guardar_tipo_caso` lo escribia, tipo por tipo y solo para ti.
--   Ahora lo pueden mover TI, super y el contador, y se guarda para todos.
--
-- QUE HACE, EN ORDEN
--   0. Guardia: el 90 aplicado y el 91 no.
--   1. RPC NUEVO `ordenar_tipos_caso(familias, tipos, hecho_por)`: recibe el
--      orden COMPLETO (todas las familias y todos los tipos, retirados
--      incluidos) y lo guarda de 10 en 10. Si la lista no es completa o trae
--      algo que no existe (otra persona creo un tipo mientras tanto), no guarda
--      nada y pide volver a abrir la pantalla. Roles: ti y contador (super
--      pasa siempre: panel_exigir_rol, 29_rpc_panel.sql:49-51).
--   2. Verificacion de solo lectura: filas con ok = true.
--
-- QUE NO HACE
--   No cambia el orden de hoy: eso lo hace la persona desde «Tipos ▾». No toca
--   `guardar_tipo_caso` (cambiar de familia sigue siendo solo de ti).
--
-- Este bloque solo AGREGA una funcion: va ANTES del deploy del cliente.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. GUARDIA
-- ---------------------------------------------------------------------
do $guardia$
begin
    if to_regclass('public.casos_familias') is null
       or to_regprocedure('public.guardar_tipo_caso(text, text, text, text, text[], boolean, int, text)') is null then
        raise exception 'Falta el bloque 90 (casos_familias / guardar_tipo_caso). No se aplico nada.';
    end if;
    if exists (select 1 from pg_proc where proname = 'ordenar_tipos_caso') then
        raise exception 'El bloque 91 ya esta aplicado (existe ordenar_tipos_caso). No se aplico nada.';
    end if;
end;
$guardia$;

-- ---------------------------------------------------------------------
-- 1. ordenar_tipos_caso
-- ---------------------------------------------------------------------
create function ordenar_tipos_caso(
    p_familias  text[],
    p_tipos     text[],
    p_hecho_por text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $ordenar$
declare
    v_quien text;
    v_fam   int;
    v_tip   int;
begin
    perform panel_exigir_rol(array['ti', 'contador']);

    -- El orden completo, sin repetidos ni faltantes: asi un orden viejo no pisa
    -- un tipo que alguien acaba de crear.
    if p_familias is null or p_tipos is null
       or cardinality(p_familias) <> (select count(distinct x) from unnest(p_familias) x)
       or cardinality(p_tipos) <> (select count(distinct x) from unnest(p_tipos) x)
       or exists (select id from casos_familias except select unnest(p_familias))
       or exists (select unnest(p_familias) except select id from casos_familias)
       or exists (select tipo from casos_tipos except select unnest(p_tipos))
       or exists (select unnest(p_tipos) except select tipo from casos_tipos) then
        raise exception 'La lista de tipos cambio mientras la ordenaba. Vuelva a abrir «Tipos» y reintente.';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    update casos_familias f
       set orden = o.n * 10
      from unnest(p_familias) with ordinality as o(id, n)
     where f.id = o.id and f.orden is distinct from o.n * 10;
    get diagnostics v_fam = row_count;

    update casos_tipos t
       set orden = o.n * 10, actualizado_por = v_quien, actualizado_en = now()
      from unnest(p_tipos) with ordinality as o(tipo, n)
     where t.tipo = o.tipo and t.orden is distinct from o.n * 10;
    get diagnostics v_tip = row_count;

    return jsonb_build_object('familias', v_fam, 'tipos', v_tip);
end;
$ordenar$;

revoke all     on function ordenar_tipos_caso(text[], text[], text) from public, anon;
grant  execute on function ordenar_tipos_caso(text[], text[], text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 2. VERIFICACION (solo lectura). Todas las filas con ok = true.
-- ---------------------------------------------------------------------
select 1 as orden, 'ordenar_tipos_caso existe una sola vez, security definer' as que,
       (select count(*) from pg_proc where proname = 'ordenar_tipos_caso') = 1
       and (select prosecdef from pg_proc where proname = 'ordenar_tipos_caso') as ok
union all
select 2, 'anon no la ejecuta; authenticated si',
       not has_function_privilege('anon', 'ordenar_tipos_caso(text[], text[], text)', 'EXECUTE')
       and has_function_privilege('authenticated', 'ordenar_tipos_caso(text[], text[], text)', 'EXECUTE')
union all
select 3, 'pide rol ti o contador',
       (select prosrc from pg_proc where proname = 'ordenar_tipos_caso') like '%panel_exigir_rol(array[''ti'', ''contador''])%'
union all
select 4, 'ningun mensaje tutea',
       (select prosrc !~* '\m(tu|tus|elige|reintenta|verifica|escribe|mueve|di)\M' from pg_proc where proname = 'ordenar_tipos_caso')
order by orden;

-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). Primero revierta el deploy del cliente que la usa.
-- El orden que la gente haya guardado se queda (son solo numeros de orden).
--
--   begin;
--   drop function if exists ordenar_tipos_caso(text[], text[], text);
--   commit;
--   notify pgrst, 'reload schema';
-- =====================================================================
