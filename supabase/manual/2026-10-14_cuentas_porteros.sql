-- =====================================================================
-- SATAG · Las cuentas de los porteros (caseta, bloque 97) · 14-oct-2026
--
-- ESTE ARCHIVO NO SE CORRE COMPLETO. Son pasos en orden, con cosas en
-- medio que no son SQL (crear el usuario en el dashboard). Pegue UN paso,
-- lea lo que devuelve, y siga.
--
-- REGLAS DE LA CUENTA (Gerardo, 14-oct)
--   - UNA CUENTA POR PERSONA, nunca una cuenta «caseta» compartida: el
--     reporte «abrí con el botón» se firma con el correo de la sesión, y
--     una cuenta compartida no dice quién abrió.
--   - SIN MFA: el portero entra con contraseña en la Chromebook de la
--     caseta. Por eso la contraseña tiene que ser larga y solo suya.
--   - La sesión NO se cierra sola (hay horas sin uso entre los dos picos):
--     al entregar el turno se usa «Cambiar de turno».
--
-- El rol viaja dentro del JWT: puesto ANTES de que la persona entre por
-- primera vez, ya viaja en su primer token.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 0 · ¿Está el bloque 97? Debe devolver una fila con ok = true.
-- Sin él, el portero entra al panel y no ve nada (y no puede reportar).
-- ---------------------------------------------------------------------
select to_regprocedure('public.caseta_buscar(text, text)') is not null
   and to_regclass('public.caseta_reportes') is not null as ok;


-- ---------------------------------------------------------------------
-- PASO 1 · FUERA DE SQL: crear cada usuario.
--   Dashboard › Authentication › Users › Add user › Create new user
--   - correo: el institucional de la persona;
--   - contraseña: larga, y se la entrega usted en persona;
--   - «Auto Confirm User» marcado.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- PASO 2 · El rol. Cambie los correos de ejemplo por los reales (uno por
-- renglón). Solo toca cuentas SIN rol: nunca le quita el rol a nadie del
-- personal que ya opera el panel.
-- ---------------------------------------------------------------------
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('rol', 'portero')
 where lower(email) in (
         'portero.uno@asuncionqro.edu.mx',
         'portero.dos@asuncionqro.edu.mx'
       )
   and coalesce(raw_app_meta_data ->> 'rol', '') = '';


-- ---------------------------------------------------------------------
-- PASO 3 · Comprobar: quién es portero. Debe listar exactamente a los de
-- arriba, con rol 'portero'.
-- ---------------------------------------------------------------------
select email, raw_app_meta_data ->> 'rol' as rol, last_sign_in_at
  from auth.users
 where raw_app_meta_data ->> 'rol' = 'portero'
 order by email;


-- ---------------------------------------------------------------------
-- PASO 3b · Fijar su estacionamiento (28-oct). Con esto la pantalla ya no le
-- deja cambiarlo: no puede trabajar por error como si estuviera en el otro.
-- Cambie 'E?' por el suyo: 'E1', 'E2' o 'E1-E2' (si cubre los dos).
-- Al terminar: que SALGA del panel y vuelva a entrar.
-- ---------------------------------------------------------------------
do $fijar$
declare
    v_caseta text := 'E?';
    v_n int;
begin
    if v_caseta not in ('E1', 'E2', 'E1-E2') then
        raise exception 'Estacionamiento invalido: %. Use E1, E2 o E1-E2.', v_caseta;
    end if;
    update auth.users
       set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('caseta', v_caseta)
     where lower(email) = 'portero.uno@asuncionqro.edu.mx'
       and raw_app_meta_data ->> 'rol' = 'portero';
    get diagnostics v_n = row_count;
    if v_n <> 1 then
        raise exception 'No se fijo: la cuenta no existe o todavia no es portero.';
    end if;
    raise notice 'Listo: % queda fijo en %.', 'portero.uno@asuncionqro.edu.mx', v_caseta;
end;
$fijar$;

-- Comprobar (ok = true):
select email, raw_app_meta_data ->> 'caseta' as estacionamiento,
       raw_app_meta_data ->> 'caseta' in ('E1', 'E2', 'E1-E2') as ok
  from auth.users where lower(email) = 'portero.uno@asuncionqro.edu.mx';

-- Para quitarlo (vuelve a poder elegir en el equipo):
-- update auth.users set raw_app_meta_data = raw_app_meta_data - 'caseta'
--  where lower(email) = 'portero.uno@asuncionqro.edu.mx';


-- ---------------------------------------------------------------------
-- PASO 4 · La prueba, CON UNA CUENTA PORTERO REAL (con super no prueba
-- nada: super pasa todas las guardias). En la Chromebook:
--   1. Entra sin pedir código y ve solo «Caseta del estacionamiento».
--   2. Elige su puerta; busca una placa conocida y ve el veredicto.
--   3. «Abrí con el botón» → motivo → Guardar: dice el número de caso.
--   4. Desde su cuenta de TI: Consulta › Aperturas con botón lo muestra,
--      con el nombre del portero.
--   5. «Cambiar de turno» vuelve al inicio de sesión.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- QUITAR EL ROL a un portero que deja el puesto (y luego, en el dashboard,
-- borrar o deshabilitar su usuario). Sus reportes se conservan firmados.
-- ---------------------------------------------------------------------
-- update auth.users set raw_app_meta_data = raw_app_meta_data - 'rol'
--  where lower(email) = 'portero.uno@asuncionqro.edu.mx'
--    and raw_app_meta_data ->> 'rol' = 'portero';


-- ---------------------------------------------------------------------
-- QUIÉN BUSCÓ QUÉ (contrapeso de entrar sin MFA): las últimas consultas
-- de la caseta. Solo para revisar un uso raro.
-- ---------------------------------------------------------------------
-- select hecho_en at time zone 'America/Mexico_City' as cuando, hecho_por, puerta, texto, resultados
--   from caseta_consultas order by hecho_en desc limit 100;
