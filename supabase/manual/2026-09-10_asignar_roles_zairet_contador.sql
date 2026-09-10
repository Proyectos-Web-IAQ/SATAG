-- =====================================================================
-- 2026-09-10_asignar_roles_zairet_contador.sql
--
-- Asigna el rol del panel a las dos cuentas nuevas de hoy: Zairet Ledezma
-- (Administracion) y el contador. Mismo patron que documenta el bloque 30
-- (30_roles_finos.sql, seccion RUNBOOK): app_metadata.rol es la UNICA
-- fuente de verdad que lee la RLS; user_metadata.rol no cuenta para nada.
--
-- ORDEN OBLIGATORIO, o el UPDATE no encuentra a nadie:
--   1. Gerardo manda la invitacion desde el panel (/admin/invite/, o el
--      dashboard de Supabase). Eso CREA la fila en auth.users.
--   2. Se corre este script. Filtra por correo, asi que si el paso 1 no
--      se hizo, actualiza CERO filas -- no truena, pero tampoco hace nada.
--      La verificacion del final lo dice claro si eso pasa.
--   3. Cada persona cierra sesion y vuelve a entrar (o entra por primera
--      vez): el rol viaja en el JWT, y un token emitido antes del paso 2
--      no lo trae.
--
--
-- ZAIRET LEDEZMA -> 'admin'. Decidido desde el 9-sep (junta con la
-- Gerencia Administrativa): cuenta de Administracion con MFA.
--
-- EL CONTADOR -> 'admin', Y ES TEMPORAL. El rol 'contador' NO EXISTE
-- todavia en el codigo: es la tarea SC-028 · L2-02 ("Rol contador: unico
-- que cierra el corte de caja"), en 0% y con vencimiento el 17-sep. La
-- RLS de hoy (bloques 27 y 30) compara app_metadata.rol contra la lista
-- literal ('admin','ti','consulta','super'); un rol 'contador' hoy no
-- pasaria ni la LECTURA de registros, no solo cortar_caja. Se decidio
-- (Gerardo, 10-sep) darle 'admin' mientras tanto, para que pueda entrar,
-- ver el panel completo y ya ir probando el corte de caja real -- que
-- hoy sigue siendo admin/super, no exclusivo de un rol de contador.
--
-- PENDIENTE, cuando L2-02 aterrice: correr un UPDATE que cambie a esta
-- misma cuenta de 'admin' a 'contador', y en ese mismo bloque retirarle
-- a 'admin' la capacidad de cortar caja (la decision del 9-sep fue que
-- el contador sea el UNICO que cierra el corte). No basta con agregar
-- 'contador' a la lista: hay que QUITARLE el permiso a 'admin' tambien,
-- o "unico" no se cumple. Verificar entonces que esta cuenta conserve
-- acceso al padron si Administracion decide que el contador tambien lo
-- necesite fuera de caja; si no, bajarla a un rol mas acotado en ese
-- mismo momento.
--
-- EL CONTADOR ES EL CP VICENTE HERNANDEZ, de Gerencia Administrativa
-- (arriba de Miguel en el organigrama). Correo confirmado por Gerardo el
-- 10-sep: vicente.hernandez@asuncionqro.edu.mx.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Zairet Ledezma -> admin.
-- ---------------------------------------------------------------------
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object('rol', 'admin')
 where email = 'zairet.ledezma@asuncionqro.edu.mx';


-- ---------------------------------------------------------------------
-- 2. El contador (CP Vicente Hernandez) -> admin (temporal; ver la nota
--    de arriba).
-- ---------------------------------------------------------------------
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object('rol', 'admin')
 where email = 'vicente.hernandez@asuncionqro.edu.mx';


-- ---------------------------------------------------------------------
-- 3. Verificacion. Debe devolver DOS filas, una por correo, cada una con
--    rol = "admin". Si devuelve menos de dos, alguna invitacion todavia
--    no se manda (la fila en auth.users no existe) o el correo tiene una
--    errata; en cualquiera de los dos casos el UPDATE de arriba no hizo
--    nada y no truena, asi que esta consulta es la unica forma de
--    enterarse.
-- ---------------------------------------------------------------------
select email,
       raw_app_meta_data ->> 'rol' as rol,
       created_at::date            as invitado_el,
       last_sign_in_at             as ultimo_acceso
  from auth.users
 where email in (
       'zairet.ledezma@asuncionqro.edu.mx',
       'vicente.hernandez@asuncionqro.edu.mx'
   )
 order by email;

-- last_sign_in_at en null es normal si todavia no entran: el rol ya
-- quedo en el JWT que se va a emitir en cuanto acepten la invitacion y
-- entren por primera vez. No hace falta que entren HOY para que el
-- UPDATE haya funcionado.
