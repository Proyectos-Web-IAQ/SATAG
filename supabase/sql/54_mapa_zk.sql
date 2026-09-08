-- =====================================================================
-- 54_mapa_zk.sql
-- SC-027: mapa tarjeta -> ID de ZKBioSecurity guardado en la base.
--
-- Motivo (piloto 8-sep-2026): para que el import de ZK ACTUALICE una tarjeta
-- que ZK ya tenia con un ID propio (las dadas de alta a mano), el archivo del
-- padron debe llevar ese ID. Hasta hoy TI cargaba el export de ZK en cada
-- sesion y en cada computadora. Con este bloque el mapa se guarda una vez y
-- se reutiliza; se actualiza subiendo el export cuando ZK cambie (p. ej. los
-- lunes) y deja de ser necesario conforme todas las tarjetas nazcan por SATAG
-- (ID = No. de TAG). No se guardan nombres ni datos de personas: solo el
-- numero de tarjeta, el ID de ZK y quien/cuando lo cargo.
--
-- QUE cambia: tabla nueva zk_tarjetas (lectura ti/super por RLS) y RPC NUEVO
--   cargar_mapa_zk (rol ti) que REEMPLAZA el mapa completo con el export
--   recibido. -> solo notify, sin drop.
-- QUE NO cambia: nada del padron ni del inventario.
--
-- Depende de: 29 (panel_exigir_rol).
-- =====================================================================

create table if not exists zk_tarjetas (
    no_dispositivo text primary key,
    zk_id          text not null,
    cargado_en     timestamptz not null default now(),
    cargado_por    text not null
);

alter table zk_tarjetas enable row level security;

drop policy if exists zk_tarjetas_lectura_panel on zk_tarjetas;
create policy zk_tarjetas_lectura_panel on zk_tarjetas
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('ti','super')
    );

revoke insert, update, delete on zk_tarjetas from authenticated;

-- Recibe [{"tarjeta": "13078091", "id": "113581062"}, ...] (el export de ZK ya
-- leido por el cliente) y deja el mapa igual a lo que hay en ZK: todo o nada.
create or replace function cargar_mapa_zk(
    p_filas     jsonb,
    p_hecho_por text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_quien text;
    v_n     integer;
begin
    perform panel_exigir_rol(array['ti']);

    if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
        raise exception 'El mapa de ZK no tiene el formato esperado';
    end if;
    if not exists (
        select 1 from jsonb_array_elements(p_filas) f
         where coalesce(btrim(f ->> 'tarjeta'), '') <> ''
           and coalesce(btrim(f ->> 'id'), '') <> ''
    ) then
        raise exception 'El archivo no trae tarjetas con ID; verifique que sea el export de ZK (Usuarios_....csv)';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), 'TI');

    delete from zk_tarjetas;

    insert into zk_tarjetas (no_dispositivo, zk_id, cargado_en, cargado_por)
    select distinct on (btrim(f ->> 'tarjeta'))
           btrim(f ->> 'tarjeta'), btrim(f ->> 'id'), now(), v_quien
      from jsonb_array_elements(p_filas) f
     where coalesce(btrim(f ->> 'tarjeta'), '') <> ''
       and coalesce(btrim(f ->> 'id'), '') <> '';

    get diagnostics v_n = row_count;
    return jsonb_build_object('total', v_n);
end;
$$;

revoke all on function cargar_mapa_zk(jsonb, text) from public;
grant execute on function cargar_mapa_zk(jsonb, text) to authenticated;

notify pgrst, 'reload schema';

-- Auditoria esperada:
-- - cargar_mapa_zk con algo que no es arreglo, o sin tarjetas con ID: rechazado.
-- - cargar_mapa_zk ok: la tabla queda EXACTAMENTE con las tarjetas del export
--   (las que ZK ya no tiene desaparecen), sellada con quien y cuando.
-- - anon / sin rol / sin MFA: no lee zk_tarjetas ni ejecuta el RPC.
