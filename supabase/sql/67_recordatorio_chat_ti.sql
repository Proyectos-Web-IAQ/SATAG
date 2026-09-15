-- =====================================================================
-- 67_recordatorio_chat_ti.sql   (OPCIONAL: Gerardo decide si lo aplica)
--
-- POR QUE. El aviso del bloque 66 llega en el momento del cobro. Si ese
-- dia no alcanzo a instalarse todo, a la manana siguiente nadie recibe
-- nada. Este bloque manda, de lunes a viernes a las 08:00 de Queretaro,
-- un recordatorio al mismo espacio de Chat, SOLO si quedan TAGs por
-- instalar.
--
-- EL MENSAJE NO LLEVA DATOS PERSONALES. Mismo criterio del 66:
--   *SATAG:* Buenos días: hay 2 TAGs por instalar. <https://satag.asuncionqro.edu.mx/admin/|Abra el panel>
--
-- HORA. pg_cron corre en UTC. '0 14 * * 1-5' = 14:00 UTC = 08:00 en
-- Queretaro (UTC-6 todo el ano: Mexico no tiene horario de verano desde
-- 2022). Corre tambien en dias sin clases; si no hay TAGs pendientes, no
-- manda nada.
--
-- MISMO INTERRUPTOR del 66: con parametros.aviso_chat_ti distinto de
-- 'activo' no sale nada (lo revisa avisar_chat_ti).
--
-- QUE HACE, EN ORDEN:
--   0. Guardia: aborta si el bloque 66 no esta aplicado.
--   1. Extension pg_cron.
--   2. recordar_chat_ti(): cuenta la cola de TI y avisa si hay algo.
--   3. Programa el trabajo 'satag-recordatorio-ti' (lo reemplaza si ya
--      existia).
--   4. Verificacion y rollback (comentados).
--
-- Idempotente. No cambia firmas de RPC ni toca el sitio: sin notify, sin
-- deploy.
--
-- Depende de: 66.
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
    v_total int;
    v_error text;
begin
    begin
        select count(*)
          into v_total
          from public.registros r
         where r.estado = 'pendiente'
           and r.no_dispositivo is null
           and exists (select 1 from public.pagos p where p.registro_id = r.id);

        if v_total > 0 then
            perform public.avisar_chat_ti(
                '*SATAG:* Buenos días: hay ' || v_total
                || case when v_total = 1 then ' TAG por instalar.' else ' TAGs por instalar.' end
                || ' <https://satag.asuncionqro.edu.mx/admin/|Abra el panel>'
            );
        end if;
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
-- 3. Programacion. Se quita la anterior por nombre antes de crearla, para
--    que reejecutar el bloque no duplique el trabajo.
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
    '0 14 * * 1-5',
    $job$select public.recordar_chat_ti();$job$
);


-- ---------------------------------------------------------------------
-- 4. VERIFICACION (a mano).
--
--    El trabajo, activo y con su horario:
--      select jobid, jobname, schedule, active from cron.job where jobname = 'satag-recordatorio-ti';
--
--    Probarlo sin esperar a manana (si hay TAGs por instalar, manda el
--    mensaje real al espacio):
--      select public.recordar_chat_ti();
--
--    Las ultimas corridas programadas:
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
