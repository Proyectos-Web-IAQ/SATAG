-- =====================================================================
-- 66_aviso_chat_ti.sql   (15-sep: que Administracion deje de llamar a TI)
--
-- POR QUE. El lunes 14-sep, primer dia en produccion, Administracion
-- llamo a TI despues de cada cobro para avisar que habia un TAG por
-- instalar, y comento que le daba pena llamar a cada rato. El panel no
-- avisa: el contador de "Instalar TAG" solo cambia si alguien tiene la
-- pagina abierta y la refresca. Este bloque manda un mensaje al espacio
-- de Google Chat "SATAG - TI" cada vez que un cobro deja un TAG por
-- instalar, para que el aviso llegue al celular de quien instala sin que
-- nadie tenga que llamar.
--
-- QUE NO HACE. No toca el sitio (no hay deploy), no cambia la firma de
-- ningun RPC (registrar_pago sigue igual) y no escribe en ninguna tabla
-- del padron. Por eso NO hace falta `notify pgrst`: las dos funciones
-- nuevas no se exponen (sin execute para anon ni authenticated) y la
-- tabla nueva tampoco.
--
-- DEFINICION DE "POR INSTALAR" (la misma de la cola de TI,
-- components/admin/VistaTi.tsx):
--   registros.estado = 'pendiente' and registros.no_dispositivo is null
--   and existe un pago del registro.
--
-- EL MENSAJE NO LLEVA DATOS PERSONALES: ni nombres, ni placas, ni folios.
-- Solo el conteo y el enlace al panel:
--   *SATAG:* hay 3 TAGs por instalar. <https://satag.asuncionqro.edu.mx/admin/|Abra el panel>
--
-- EL AVISO NUNCA TUMBA UN COBRO. El disparador corre dentro de la misma
-- transaccion que registrar_pago: un error sin control revertiria el
-- cobro. Por eso las dos funciones envuelven todo en
-- `exception when others then raise warning` y el disparador siempre
-- regresa NEW. Ademas pg_net es asincrono: net.http_post solo deja la
-- peticion en una cola que un proceso aparte despacha DESPUES del commit.
-- Si el cobro se revierte por cualquier motivo, la peticion se revierte
-- con el y no sale aviso de un cobro que no existe.
--
-- SIN SILENCIO POR FOLIO (decision de Gerardo, 15-sep). Se considero
-- callar los folios SATAG-000101 a 000226 del banco de pruebas
-- (seed_tests_dev.sql), pero los folios se reiniciaron el 14-sep y las
-- familias reales 101 a 226 recibiran esos mismos folios: sus cobros
-- quedarian mudos sin que nadie supiera por que. El seed ya no esta en la
-- base y nunca se corre en produccion. La UNICA forma de callar el aviso
-- es el interruptor, a la vista.
--
-- INTERRUPTOR. Tabla `parametros`, fila 'aviso_chat_ti'. Cualquier valor
-- distinto de 'activo' apaga el aviso:
--   apagar:  update public.parametros set valor = 'inactivo', actualizado_en = now() where clave = 'aviso_chat_ti';
--   prender: update public.parametros set valor = 'activo',   actualizado_en = now() where clave = 'aviso_chat_ti';
--
-- LA URL DEL WEBHOOK vive en Supabase Vault con el nombre
-- 'chat_webhook_satag_ti'. Nunca en el codigo, en el repo ni en un
-- comentario: quien tiene esa URL puede escribir en el espacio.
--
-- QUE HACE, EN ORDEN:
--   0. Guardia: aborta si Vault no esta activo, si no existe el secreto o
--      si no parece un webhook de Google Chat. Asi no se instala un
--      disparador mudo sin darse cuenta.
--   1. Extension pg_net.
--   2. Tabla `parametros` (RLS encendida, sin politicas) y su fila inicial.
--   3. avisar_chat_ti(texto): lee el secreto y hace el POST.
--   4. tg_pagos_avisar_chat_ti(): tras un cobro, cuenta los TAGs por
--      instalar y avisa.
--   5. Disparador pagos_avisar_chat_ti (after insert on pagos).
--   6. Verificacion (comentada, se corre a mano).
--   7. Rollback (comentado).
--
-- ANTES DE APLICARLO el secreto ya debe estar en Vault. Idempotente: se
-- puede volver a correr completo sin dano, y no reescribe el valor del
-- interruptor si ya existe.
--
-- ERRORES A LA VISTA. El SQL Editor de Supabase no muestra los warnings:
-- un aviso que falla sin dejar rastro es un aviso que nadie sabe que no
-- llega. Por eso, ademas del warning, el ultimo error queda en
-- `parametros` (clave 'aviso_chat_ti_ultimo_error', con su fecha) y la
-- verificacion lo muestra. La URL del webhook nunca va en ese texto.
--
-- HISTORIA. Primera aplicacion, 15-sep: mandaba el encabezado
-- Content-Type 'application/json; charset=UTF-8', y net.http_post rechaza
-- cualquier valor distinto de 'application/json' exacto ("Content-Type
-- header must be "application/json""). El exception when others lo volvio
-- un warning invisible: la prueba no llego y no quedo nada ni en la cola ni
-- en las respuestas. Corregido aqui; se reaplica el archivo completo
-- encima (idempotente).
--
-- Depende de: 12 (registros) y 24 (pagos). No depende del sitio.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. GUARDIA. Va primero: si aborta, no se aplico nada.
--    La consulta a Vault va por `execute` para que, si Vault no esta
--    activo, el mensaje sea el de abajo y no un "relation does not exist".
-- ---------------------------------------------------------------------
do $guardia$
declare
    v_url text;
begin
    if to_regclass('vault.decrypted_secrets') is null then
        raise exception 'Bloque 66 cancelado: Supabase Vault no esta activo. Activelo en Integrations > Vault, guarde el secreto chat_webhook_satag_ti y vuelva a correr este bloque. No se aplico nada.';
    end if;

    execute $q$
        select decrypted_secret
          from vault.decrypted_secrets
         where name = 'chat_webhook_satag_ti'
         order by created_at desc
         limit 1
    $q$ into v_url;

    if v_url is null then
        raise exception 'Bloque 66 cancelado: no existe el secreto chat_webhook_satag_ti en Vault. Guardelo primero con vault.create_secret(...) y vuelva a correr este bloque. No se aplico nada.';
    end if;

    if v_url not like 'https://chat.googleapis.com/v1/spaces/%' then
        raise exception 'Bloque 66 cancelado: el secreto chat_webhook_satag_ti no parece un webhook de Google Chat (debe empezar con https://chat.googleapis.com/v1/spaces/). Corrijalo en Vault. No se aplico nada.';
    end if;
end
$guardia$;


-- ---------------------------------------------------------------------
-- 1. pg_net: HTTP asincrono desde Postgres.
-- ---------------------------------------------------------------------
create extension if not exists pg_net;


-- ---------------------------------------------------------------------
-- 2. Interruptores de operacion. RLS encendida y SIN politicas: desde la
--    API nadie la lee ni la escribe; solo las funciones SECURITY DEFINER
--    de este bloque y el SQL Editor.
-- ---------------------------------------------------------------------
create table if not exists public.parametros (
    clave          text primary key,
    valor          text not null,
    actualizado_en timestamptz default now()
);

comment on table public.parametros is
    'Interruptores de operacion que leen funciones SECURITY DEFINER (bloque 66). Sin politicas: no se alcanza desde la API. Se cambian desde el SQL Editor.';

alter table public.parametros enable row level security;
revoke all on table public.parametros from anon, authenticated;

insert into public.parametros (clave, valor)
values ('aviso_chat_ti', 'activo')
on conflict (clave) do nothing;


-- ---------------------------------------------------------------------
-- 3. avisar_chat_ti(texto): manda un mensaje al espacio de TI.
--    No hace nada si el interruptor no esta en 'activo' o si falta el
--    secreto. Nunca lanza: cualquier error se vuelve un warning.
-- ---------------------------------------------------------------------
create or replace function public.avisar_chat_ti(p_texto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_estado text;
    v_url    text;
    v_error  text;
begin
    begin
        if coalesce(btrim(p_texto), '') = '' then
            return;
        end if;

        select valor
          into v_estado
          from public.parametros
         where clave = 'aviso_chat_ti';
        if coalesce(v_estado, '') <> 'activo' then
            return;
        end if;

        select decrypted_secret
          into v_url
          from vault.decrypted_secrets
         where name = 'chat_webhook_satag_ti'
         order by created_at desc
         limit 1;
        if v_url is null or v_url not like 'https://chat.googleapis.com/v1/spaces/%' then
            raise exception 'falta el secreto chat_webhook_satag_ti en Vault o no es un webhook de Google Chat';
        end if;

        -- Content-Type EXACTO 'application/json': net.http_post rechaza
        -- cualquier otro valor, incluido 'application/json; charset=UTF-8'
        -- (ver HISTORIA en el encabezado). JSON ya viaja en UTF-8.
        perform net.http_post(
            url                  := v_url,
            body                 := jsonb_build_object('text', p_texto),
            headers              := jsonb_build_object('Content-Type', 'application/json'),
            timeout_milliseconds := 5000
        );
    exception when others then
        v_error := left(sqlstate || ' ' || sqlerrm, 300);
        raise warning 'SATAG aviso a Chat: no se pudo encolar el aviso (%).', v_error;
        -- A la vista (ver encabezado). Si hasta esto falla, se calla: el aviso
        -- nunca tumba un cobro.
        begin
            insert into public.parametros (clave, valor, actualizado_en)
            values ('aviso_chat_ti_ultimo_error', v_error, now())
            on conflict (clave) do update
               set valor = excluded.valor, actualizado_en = excluded.actualizado_en;
        exception when others then
            null;
        end;
    end;
end;
$$;

alter function public.avisar_chat_ti(text) owner to postgres;
revoke execute on function public.avisar_chat_ti(text) from public, anon, authenticated;

comment on function public.avisar_chat_ti(text) is
    'Bloque 66. Manda un texto SIN datos personales al espacio de Google Chat de TI por pg_net. Lee el webhook de Vault (chat_webhook_satag_ti) y respeta el interruptor parametros.aviso_chat_ti. Nunca lanza.';


-- ---------------------------------------------------------------------
-- 4. Funcion del disparador: tras un cobro que deja un TAG por instalar,
--    cuenta el total actual de la cola de TI y avisa. Siempre regresa NEW.
-- ---------------------------------------------------------------------
create or replace function public.tg_pagos_avisar_chat_ti()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_estado text;
    v_tag    text;
    v_total  int;
    v_error  text;
begin
    begin
        select r.estado, r.no_dispositivo
          into v_estado, v_tag
          from public.registros r
         where r.id = new.registro_id;

        -- Un pago de un registro que no queda en la cola de TI (ya tiene TAG
        -- o no esta pendiente) no cambia nada de lo que TI tiene que hacer.
        if v_estado is distinct from 'pendiente' or v_tag is not null then
            return new;
        end if;

        select count(*)
          into v_total
          from public.registros r
         where r.estado = 'pendiente'
           and r.no_dispositivo is null
           and exists (select 1 from public.pagos p where p.registro_id = r.id);

        if v_total > 0 then
            perform public.avisar_chat_ti(
                '*SATAG:* hay ' || v_total
                || case when v_total = 1 then ' TAG por instalar.' else ' TAGs por instalar.' end
                || ' <https://satag.asuncionqro.edu.mx/admin/|Abra el panel>'
            );
        end if;
    exception when others then
        v_error := left(sqlstate || ' ' || sqlerrm, 300);
        raise warning 'SATAG aviso a Chat: fallo el disparador (%). El cobro no se afecta.', v_error;
        begin
            insert into public.parametros (clave, valor, actualizado_en)
            values ('aviso_chat_ti_ultimo_error', 'disparador: ' || v_error, now())
            on conflict (clave) do update
               set valor = excluded.valor, actualizado_en = excluded.actualizado_en;
        exception when others then
            null;
        end;
    end;
    return new;
end;
$$;

alter function public.tg_pagos_avisar_chat_ti() owner to postgres;
revoke execute on function public.tg_pagos_avisar_chat_ti() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. Disparador. AFTER INSERT: el pago ya existe cuando se cuenta la cola.
-- ---------------------------------------------------------------------
drop trigger if exists pagos_avisar_chat_ti on public.pagos;
create trigger pagos_avisar_chat_ti
    after insert on public.pagos
    for each row
    execute function public.tg_pagos_avisar_chat_ti();


-- ---------------------------------------------------------------------
-- 6. VERIFICACION (a mano, despues de aplicar). La completa, de solo
--    lectura, esta en supabase/manual/2026-09-15_verificar_bloque66_chat.sql.
--
--    6a. Prueba de conexion: manda un mensaje real al espacio.
--        select public.avisar_chat_ti('Prueba de conexión de SATAG');
--
--    6b. Unos segundos despues (debe salir status_code 200):
--        select id, status_code, content from net._http_response order by id desc limit 3;
--
--    6c. Si no llego nada, el ultimo error que atraparon las funciones:
--        select valor, actualizado_en from public.parametros where clave = 'aviso_chat_ti_ultimo_error';
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 7. ROLLBACK (comentado). Si se aplico el 67, quitelo ANTES (su rollback).
--
--    drop trigger if exists pagos_avisar_chat_ti on public.pagos;
--    drop function if exists public.tg_pagos_avisar_chat_ti();
--    drop function if exists public.avisar_chat_ti(text);
--
--    Borrar el secreto de Vault (el webhook deja de estar en la base):
--    delete from vault.secrets where name = 'chat_webhook_satag_ti';
--
--    La tabla `parametros` y la extension pg_net pueden quedarse: no
--    hacen nada solas. Si se quieren quitar tambien:
--    drop table if exists public.parametros;
--    drop extension if exists pg_net;
--
--    Para solo DEJAR DE AVISAR sin desinstalar nada, basta el interruptor
--    (ver el encabezado).
-- ---------------------------------------------------------------------
