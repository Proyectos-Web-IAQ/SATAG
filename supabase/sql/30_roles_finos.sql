-- =====================================================================
-- 30_roles_finos.sql
-- Endurece la RLS del expediente ya existente (registros, movimientos,
-- aceptaciones) con roles finos del panel, y elimina la escritura directa:
-- a partir de aqui TODO write pasa por RPCs SECURITY DEFINER.
--
-- Fuente de verdad del rol: app_metadata.rol ('admin' | 'ti' | 'consulta').
-- app_metadata solo lo fija un admin (service_role); user_metadata.rol es
-- solo preferencia de UI y NUNCA se usa en RLS (el usuario puede editarlo).
-- Cierra el pendiente documentado en 13_rls_registros.sql y 17_rls_alta.sql.
--
-- =====================================================================
-- RUNBOOK — APLICAR EN ESTE ORDEN (si no, el personal pierde lectura):
--
-- 1) Asignar el rol a CADA usuario del personal (SQL editor, como owner):
--      update auth.users
--         set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
--             || jsonb_build_object('rol', 'ti')   -- 'admin' | 'ti' | 'consulta'
--       where email = 'persona@asuncionqro.edu.mx';
--
-- 2) Cada usuario debe cerrar sesion y volver a entrar (el rol viaja en el
--    JWT; un token emitido antes del paso 1 no lo trae).
--
-- 3) Aplicar este script.
--
-- Nota: el panel ya respeta app_metadata.rol como candado sobre la eleccion
-- de user_metadata (ver commit CC-MFA), asi que la UI queda alineada sola.
-- =====================================================================

-- ---------------------------------------------------------------------
-- registros: lectura para los tres roles del panel; sin escritura directa.
-- Escrituras via RPC: crear_registro (alta publica), registrar_pago,
-- asignar_estacionamiento, instalar_tag, actualizar_registro, dar_baja.
-- ---------------------------------------------------------------------
drop policy if exists registros_admin on registros;
drop policy if exists registros_lectura_panel on registros;
create policy registros_lectura_panel on registros
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','ti','consulta','super')
    );

revoke insert, update, delete on registros from authenticated;

-- ---------------------------------------------------------------------
-- movimientos: bitacora de solo lectura para el panel; las filas nuevas
-- las escriben los RPCs (crear_registro, actualizar_registro, dar_baja).
-- ---------------------------------------------------------------------
drop policy if exists movimientos_admin on movimientos;
drop policy if exists movimientos_lectura_panel on movimientos;
create policy movimientos_lectura_panel on movimientos
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','ti','consulta','super')
    );

revoke insert, update, delete on movimientos from authenticated;

-- ---------------------------------------------------------------------
-- aceptaciones: evidencia legal de firma (PII sensible). Se restringe la
-- lectura a admin/super. Es lo unico que 'consulta' y 'ti' NO ven: la firma
-- no es parte del ciclo de vida del TAG, es evidencia legal.
-- Decision abierta: ampliar a 'ti' si su pantalla llegara a mostrar la firma;
-- hoy el panel no la consulta.
-- ---------------------------------------------------------------------
drop policy if exists aceptaciones_lectura_auth on aceptaciones;
drop policy if exists aceptaciones_lectura_admin on aceptaciones;
create policy aceptaciones_lectura_admin on aceptaciones
    for select to authenticated
    using (
        (auth.jwt() ->> 'aal') = 'aal2'
        and (auth.jwt() -> 'app_metadata' ->> 'rol') in ('admin','super')
    );

-- Auditoria esperada:
-- - Un authenticated SIN app_metadata.rol (o sin MFA) no lee nada del
--   expediente y ningun RPC del panel le ejecuta (guardia panel_exigir_rol).
-- - anon: sin cambios (sigue sin acceso; solo crear_registro/crear_solicitud).
-- - Pendiente anotado (decision abierta): endurecer igualmente las policies
--   de escritura de catalogos, documentos y storage de firmas a rol admin
--   (bloques 05, 09 y 20); hoy siguen en authenticated + aal2.
