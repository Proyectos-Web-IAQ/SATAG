-- =====================================================================
-- 27_rls_grants_panel.sql
-- RLS + grants de las tablas nuevas del panel: pagos,
-- registro_estacionamientos y solicitudes.
--
-- Modelo (roles finos desde el inicio en estas tablas):
-- - anon: sin policy ni grant (sin acceso; el publico solo entra por RPC).
-- - authenticated: SOLO SELECT, con sesion aal2 (MFA) y rol del panel en
--   app_metadata.rol ('admin' | 'ti' | 'consulta' | 'super'). app_metadata
--   solo lo fija un admin con service_role; user_metadata NO se usa en RLS.
-- - Escrituras: unicamente via RPCs SECURITY DEFINER (bloques 28 y 29).
--
-- Decision (2026-07-15): 'consulta' LEE las tres tablas. Su trabajo es ver el
-- ciclo de vida completo del TAG, todo el padron y las tareas pendientes, asi
-- que necesita pagos (si ya pago) y solicitudes (que falta por hacer). Lo que
-- NO ve es la firma: aceptaciones queda en admin/super (bloque 30), porque es
-- evidencia legal con PII sensible y no es parte del ciclo de vida del TAG.
-- La separacion real de 'consulta' no es que vea menos, es que no escribe:
-- no tiene policy de insert/update/delete ni pasa la guardia de ningun RPC.
-- =====================================================================

alter table pagos enable row level security;
alter table registro_estacionamientos enable row level security;
alter table solicitudes enable row level security;

drop policy if exists pagos_lectura_panel on pagos;
create policy pagos_lectura_panel on pagos
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','ti','consulta','super')
    );

drop policy if exists regest_lectura_panel on registro_estacionamientos;
create policy regest_lectura_panel on registro_estacionamientos
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','ti','consulta','super')
    );

drop policy if exists solicitudes_lectura_panel on solicitudes;
create policy solicitudes_lectura_panel on solicitudes
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','ti','consulta','super')
    );

grant select on pagos to authenticated;
grant select on registro_estacionamientos to authenticated;
grant select on solicitudes to authenticated;

-- anon queda intencionalmente SIN GRANT sobre las tres tablas.

-- Auditoria esperada:
-- - Sin policies de insert/update/delete: ni siquiera authenticated escribe
--   directo; todo write pasa por RPCs (validan rol y son transaccionales).
-- - Requiere que el personal tenga app_metadata.rol asignado (runbook en 30).
