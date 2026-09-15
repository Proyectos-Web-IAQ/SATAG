-- =====================================================================
-- 67_recordatorio_chat_ti.sql   (OPCIONAL: Gerardo decide si lo aplica)
--
-- POR QUE. Se instala los lunes. El aviso del bloque 66 ya llega en el
-- momento de cada cobro, asi que los pendientes del dia se van sabiendo
-- solos. Lo que TI necesita saber al empezar el lunes es con cuantos TAGs
-- de la escuela cuenta para instalar (el stock dado de alta en el
-- inventario y todavia sin asignar), y si quedo algo cobrado sin instalar
-- de la semana. Decision de Gerardo del 15-sep: solo los lunes, a las
-- 07:30, con los disponibles y los cobrados por instalar.
--
-- EL MENSAJE NO LLEVA DATOS PERSONALES, mismo criterio del 66. Llega TODOS
-- los lunes, aunque no haya pendientes:
--   *SATAG · lunes de instalación:*
--   TAGs disponibles para instalar: 19
--   Cobrados y por instalar: 0
--   Abra el panel
-- Si no hay TAGs disponibles, agrega una linea para dar de alta TAGs en el
-- inventario antes de empezar.
--
-- DEFINICIONES (las mismas del panel):
--   disponibles     = inventario_tags con asignado_a null (bloque 52:
--                     "TAGs de la escuela > Disponibles").
--   por instalar    = registros 'pendiente', sin TAG y con pago (cola de TI).
--
-- HORA. pg_cron corre en UTC. '30 13 * * 1' = lunes 13:30 UTC = 07:30 en
-- Queretaro (UTC-6 todo el ano: Mexico no tiene horario de verano desde
-- 2022). Si un lunes no hay clases, llega igual.
--
-- MISMO INTERRUPTOR del 66: con parametros.aviso_chat_ti distinto de
-- 'activo' no sale nada (lo revisa avisar_chat_ti). Un error queda a la
-- vista en parametros.aviso_chat_ti_ultimo_error, igual que en el 66.
--
-- QUE HACE, EN ORDEN:
--   0. Guardia: aborta si el bloque 66 no esta aplicado o si no existe el
--      inventario (bloque 52).
--   1. Extension pg_cron.
--   2. recordar_chat_ti(): cuenta disponibles y por instalar y avisa.
--   3. Programa el trabajo 'satag-recordatorio-ti' (lo reemplaza si ya
--      existia, asi que reejecutar no lo duplica).
--   4. Verificacion y rollback (comentados).
--
-- Idempotente. No cambia firmas de RPC ni toca el sitio: sin notify, sin
-- deploy.
--
-- Depende de: 66 (avisar_chat_ti, parametros) y 52 (inventario_tags).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. GUARDIA.
-- ---------------------------------------------------------------------
do $guardia$
begin
    if to_regprocedure('public.avisar_chat_ti(text)') is null
       or to_regclass('public.parametros') is null then
        raise exception 'Bloque 67 cancelado: aplique primero el bloque 66 (avisar_chat_ti y parametros). No se aplico nada.';
    end if;
    if to_regclass('public.inventario_tags') is null then
        raise exception 'Bloque 67 cancelado: no existe inventario_tags (bloque 52). No se aplico nada.';
    end if;
end
$guardia$;


-- ---------------------------------------------------------------------
-- 1. pg_cron. Si esta linea falla por permisos, active la extension desde
--    Database > Extensions (pg_cron) y vuelva a correr el bloque.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;


-- ---------------------------------------------------------------------
-- 2. recordar_chat_ti(): nunca lanza.
-- ---------------------------------------------------------------------
create or replace function public.recordar_chat_ti()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_disponibles int;
    v_pendientes  int;
    v_error       text;
begin
    begin
        select count(*)
          into v_disponibles
          from public.inventario_tags i
         where i.asignado_a is null;

        select count(*)
          into v_pendientes
          from public.registros r
         where r.estado = 'pendiente'
           and r.no_dispositivo is null
           and exists (select 1 from public.pagos p where p.registro_id = r.id);

        perform public.avisar_chat_ti(
            '*SATAG · lunes de instalación:*'
            || chr(10) || 'TAGs disponibles para instalar: ' || v_disponibles
            || chr(10) || 'Cobrados y por instalar: ' || v_pendientes
            || case when v_disponibles = 0
                    then chr(10) || 'No hay TAGs disponibles: dé de alta TAGs en el inventario antes de instalar.'
                    else '' end
            || chr(10) || '<https://satag.asuncionqro.edu.mx/admin/|Abra el panel>'
        );
    exception when others then
        -- Mismo criterio del 66: el error queda a la vista en parametros.
        v_error := left(sqlstate || ' ' || sqlerrm, 300);
        raise warning 'SATAG recordatorio a Chat: fallo (%).', v_error;
        begin
            insert into public.parametros (clave, valor, actualizado_en)
            values ('aviso_chat_ti_ultimo_error', 'recordatorio: ' || v_error, now())
            on conflict (clave) do update
               set valor = excluded.valor, actualizado_en = excluded.actualizado_en;
        exception when others then
            null;
        end;
    end;
end;
$$;

alter function public.recordar_chat_ti() owner to postgres;
revoke execute on function public.recordar_chat_ti() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. Programacion: lunes 13:30 UTC = 07:30 en Queretaro. Se quita la
--    anterior por nombre antes de crearla (incluida la version previa de
--    este bloque, de lunes a viernes), para que reejecutar no la duplique.
-- ---------------------------------------------------------------------
do $cron$
begin
    perform cron.unschedule(jobid)
       from cron.job
      where jobname = 'satag-recordatorio-ti';
end
$cron$;

select cron.schedule(
    'satag-recordatorio-ti',
    '30 13 * * 1',
    $job$select public.recordar_chat_ti();$job$
);


-- ---------------------------------------------------------------------
-- 4. VERIFICACION (a mano).
--
--    El trabajo, activo y con su horario (debe decir '30 13 * * 1'):
--      select jobid, jobname, schedule, active from cron.job where jobname = 'satag-recordatorio-ti';
--
--    Probarlo sin esperar al lunes. MANDA EL MENSAJE REAL AL ESPACIO y le
--    llega a todo el equipo: avise antes de que es una prueba.
--      select public.recordar_chat_ti();
--
--    Si no llego, el ultimo error atrapado:
--      select valor, actualizado_en from public.parametros where clave = 'aviso_chat_ti_ultimo_error';
--
--    Las ultimas corridas programadas (despues del primer lunes):
--      select d.status, d.return_message, d.start_time
--        from cron.job_run_details d
--        join cron.job j on j.jobid = d.jobid
--       where j.jobname = 'satag-recordatorio-ti'
--       order by d.start_time desc
--       limit 5;
--
-- ROLLBACK (comentado):
--      select cron.unschedule('satag-recordatorio-ti');
--      drop function if exists public.recordar_chat_ti();
-- ---------------------------------------------------------------------
