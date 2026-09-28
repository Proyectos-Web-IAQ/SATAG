-- =====================================================================
-- SATAG · La cuenta del contador, paso por paso (lun 28-sep, junta 13:00)
--
-- ESTE ARCHIVO NO SE CORRE COMPLETO. Son cinco pasos que van en orden y
-- con cosas en medio que no son SQL (aplicar el bloque 74, cerrar sesion,
-- invitar desde el dashboard). Pegue UN paso, lea lo que devuelve, y
-- siga. Cada paso dice que espera encontrar.
--
-- POR QUE ASI. El rol viaja dentro del JWT, no se consulta en cada
-- peticion. Eso tiene dos consecuencias que gobiernan todo el orden de
-- abajo: un token emitido antes del cambio NO trae el rol nuevo (hay que
-- cerrar y volver a abrir sesion), y un rol puesto ANTES de que la
-- persona entre por primera vez ya viaja en su primer token (no hace
-- falta el baile de cerrar sesion enfrente de ella).
-- =====================================================================


-- =====================================================================
-- PASO 0 · ANTES DE ESTE ARCHIVO: el bloque 74
--
--   supabase/sql/74_rol_contador.sql   -> completo, y sus CINCO filas de
--                                         verificacion en true.
--
-- Sin el, todo lo de abajo deja cuentas que entran al panel y no leen
-- nada. Y avisele a Zairet antes de aplicarlo: desde ese momento
-- Administracion pierde cortar_caja para siempre.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 1 · EL ENSAYO. Su cuenta, temporalmente, con rol de contador.
--
-- POR QUE NO SE PUEDE ENSAYAR CON SUPER: panel_exigir_rol
-- (29_rpc_panel.sql:49-51) hace `return` en seco cuando el rol es
-- 'super', SIN mirar la lista de roles que se le pasa. Con una cuenta
-- super todo funciona siempre, asi que un ensayo con super no prueba
-- absolutamente nada del rol contador.
--
-- MIENTRAS DURE: pierde las pestanas de TI y de Administracion. Son diez
-- minutos, pero en esa ventana no puede atender una instalacion.
-- ---------------------------------------------------------------------
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object('rol', 'contador')
 where email = 'gerardo.sanchez@asuncionqro.edu.mx';

-- Constancia. Debe salir una fila con rol = contador.
select email, raw_app_meta_data->>'rol' as rol
  from auth.users
 where email = 'gerardo.sanchez@asuncionqro.edu.mx';

-- AHORA, EN EL PANEL: cierre sesion, vuelva a entrar, y recorra:
--   1. Que aterrice en FINANZAS (no en Consulta) y que solo vea dos
--      pestanas: Finanzas y Consulta.
--   2. Las tres tarjetas: $1,300 en caja, 13 cobros, y el desglose de
--      los dos dias (14 y 21-sep).
--   3. El tablero de instalacion: 13 instalados, 6 con hora sellada.
--   4. Escriba 1300 en "Efectivo contado" y algo en observaciones. Que
--      el boton SE HABILITE es la prueba de que cortar_caja lo admite.
--      *** NO LO APRIETE. *** El corte no se deshace y el primero lo
--      cierra el CP el miercoles 30.
--   5. La pestana Consulta: el padron, los incompletos, y que la firma
--      de un expediente se abra (eso lo dio el bloque 71).
--
-- Si algo de esto falla, PARE: el CP no debe ser quien lo descubra a la
-- 1 de la tarde.


-- ---------------------------------------------------------------------
-- PASO 2 · DEVOLVER SU CUENTA A SUPER.
-- No se le olvide: con rol contador se queda sin TI y sin
-- Administracion.
-- ---------------------------------------------------------------------
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object('rol', 'super')
 where email = 'gerardo.sanchez@asuncionqro.edu.mx';

select email, raw_app_meta_data->>'rol' as rol
  from auth.users
 where email = 'gerardo.sanchez@asuncionqro.edu.mx';
-- Cierre sesion y vuelva a entrar: debe ver las cuatro pestanas.


-- ---------------------------------------------------------------------
-- PASO 3 · GUARDIA DE SOLO LECTURA antes de tocar la cuenta de Vicente.
--
-- Su cuenta existe como super, sin MFA, sin correo confirmado y sin
-- haber entrado nunca. La idea es borrarla y volver a invitarlo, porque
-- el flujo de /admin/invite es el que usaron las otras cinco cuentas y
-- termina con el poniendo su propia contrasena.
--
-- Pero antes hay que probar que no cuelga nada de su uid. Solo hay dos
-- columnas en todo el sistema que guardan un uid de auth.users:
-- registros.instalado_por_uid (bloque 68) y cortes_caja.cortado_por_uid
-- (bloque 42). Ninguna tiene llave foranea, asi que un borrado NO
-- fallaria: dejaria un uid huerfano sin avisar. De ahi la guardia.
--
-- LAS CUATRO FILAS DEBEN SALIR EN 0 / true.
-- ---------------------------------------------------------------------
with v as (
  select id from auth.users where email = 'vicente.hernandez@asuncionqro.edu.mx'
)
select 'instalaciones a su nombre (debe ser 0)' as que,
       (select count(*) from registros r, v where r.instalado_por_uid = v.id)::text as valor
union all
select 'cortes a su nombre (debe ser 0)',
       (select count(*) from cortes_caja c, v where c.cortado_por_uid = v.id)::text
union all
select 'factores MFA inscritos (debe ser 0)',
       (select count(*) from auth.mfa_factors f, v where f.user_id = v.id)::text
union all
select 'nunca ha entrado y no confirmo correo (debe ser true)',
       (select (u.last_sign_in_at is null and u.email_confirmed_at is null)::text
          from auth.users u where u.email = 'vicente.hernandez@asuncionqro.edu.mx');

-- SI ALGUNA FILA NO CUADRA: no borre la cuenta. Deje el rol en contador
-- (paso 5) y mandele un enlace magico desde el dashboard en lugar de una
-- invitacion; se salta el borrado y no se pierde nada.


-- ---------------------------------------------------------------------
-- PASO 4 · NO ES SQL. En el dashboard de Supabase:
--   Authentication -> Users -> vicente.hernandez@asuncionqro.edu.mx
--     a) Delete user
--     b) Invite user -> vicente.hernandez@asuncionqro.edu.mx
--
-- El correo lo lleva a /admin/invite, donde pone su contrasena. Digale
-- que NO abra el enlace hasta la junta: las invitaciones caducan, y el
-- enlace es de un solo uso.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- PASO 5 · EL ROL DE VICENTE, en el mismo minuto en que lo invite.
--
-- Va ANTES de que el entre por primera vez, para que su primer token ya
-- lo traiga: asi no hay que pedirle que cierre sesion y vuelva a entrar
-- delante de todos.
--
-- 'contador', NO 'super'. Como super veria las cuatro pestanas,
-- incluidas TI y Administracion, y cortar_caja dejaria de significar
-- nada (super se salta panel_exigir_rol).
-- ---------------------------------------------------------------------
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object('rol', 'contador')
 where email = 'vicente.hernandez@asuncionqro.edu.mx';

-- Constancia: UNA fila, rol contador, y todavia sin MFA (lo inscribe el
-- en la junta, escaneando el QR que le muestra el panel).
select u.email,
       u.raw_app_meta_data->>'rol' as rol,
       (select count(*) from auth.mfa_factors f
         where f.user_id = u.id and f.status = 'verified') as mfa_verificado,
       u.email_confirmed_at is not null as correo_confirmado
  from auth.users u
 where u.email = 'vicente.hernandez@asuncionqro.edu.mx';


-- ---------------------------------------------------------------------
-- CIERRE · EL PADRON DE CUENTAS, para revisarlo de un golpe.
-- Esperado despues de todo lo anterior:
--   zairet    admin     MFA 1
--   vicente   contador  MFA 0   <- el unico sin MFA, y se inscribe hoy
--   angel     ti        MFA 1
--   gerardo   super     MFA 1   <- si dice ti o contador, falto el paso 2
--   lidia     ti        MFA 1
--   miguel    super     MFA 1
-- ---------------------------------------------------------------------
select u.email,
       u.raw_app_meta_data->>'rol' as rol,
       (select count(*) from auth.mfa_factors f
         where f.user_id = u.id and f.status = 'verified') as mfa_verificado,
       (u.last_sign_in_at at time zone 'America/Mexico_City')::timestamp(0) as ultimo_ingreso_qro
  from auth.users u
 where u.raw_app_meta_data->>'rol' is not null
 order by u.raw_app_meta_data->>'rol', u.email;
