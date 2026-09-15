-- =====================================================================
-- Probar el aviso a Chat del bloque 66 SIN dejar rastro · 15-sep-2026
--
-- Por que no un alta y un cobro reales para despues borrarlos:
--   - los folios no se recuperan: la prueba se quedaria con el siguiente
--     SATAG-00000N y con el siguiente recibo SATAG-2026-00000N, y la
--     siguiente familia recibiria el numero de despues (un hueco en los
--     recibos es lo que un contador pregunta);
--   - quedaria la firma en el almacenamiento, la bitacora de movimientos y
--     $100 que aparecen y desaparecen de "En caja ahora";
--   - el go/no-go dice que nada de lo capturado se borra.
--
-- Esta prueba cubre lo mismo en dos pasos. Correr cada paso por separado
-- (seleccionar el bloque y "Run"), cuando Administracion no este cobrando.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 1 — La ENTREGA: manda al espacio el mismo formato que recibira TI,
-- marcado como prueba para que nadie vaya a buscar un TAG.
-- Debe llegar al espacio "SATAG - TI" con el enlace "Abra el panel".
-- ---------------------------------------------------------------------
select public.avisar_chat_ti(
    '*SATAG:* se registró un pago. Hay 1 TAG por instalar. Quien vaya a instalar, responda *Voy yo* en este hilo. <https://satag.asuncionqro.edu.mx/admin/|Abra el panel> _(prueba: no hay nada que instalar)_'
);


-- ---------------------------------------------------------------------
-- PASO 2 — El DISPARADOR: un cobro de mentira dentro de un bloque que
-- TERMINA CON UN ERROR A PROPOSITO.
--
-- El error deshace todo lo del bloque: el expediente, el pago y el aviso
-- que quedo en la cola de pg_net. pg_net solo envia lo que ya se confirmo,
-- asi que NO llega ningun mensaje al espacio. El editor de Supabase solo
-- muestra el resultado de la ultima instruccion; por eso el resultado va
-- dentro del texto del error.
--
-- RESULTADO CORRECTO: un error en rojo que dice
--   RESULTADO (todo se deshizo): aviso encolado = true, ... error anotado = (ninguno)
--
-- No gasta ningun folio:
--   - el expediente lleva folio fijo SATAG-999999 (el alta normal usa la
--     secuencia de folios, que no se revierte);
--   - el pago lleva folio de recibo escrito a mano (el valor por omision
--     gastaria un numero de la secuencia de recibos, que tampoco se
--     revierte);
--   - sin placas, para no chocar con las placas unicas.
-- registros no tiene disparadores; pagos solo el del bloque 66 y los de
-- borrado/edicion del bloque 42, que no aplican a un insert.
-- ---------------------------------------------------------------------
do $prueba$
declare
    v_cola_antes   bigint;
    v_cola_despues bigint;
    v_registro     uuid;
    v_error        text;
begin
    select count(*) into v_cola_antes from net.http_request_queue;

    insert into public.registros
        (folio, usuario_nombres, usuario_apellido_paterno, marca, modelo, color, sin_placas)
    values
        ('SATAG-999999', 'Prueba', 'Disparador', 'Prueba', 'Prueba', 'Prueba', true)
    returning id into v_registro;

    insert into public.pagos (registro_id, monto, folio_recibo)
    values (v_registro, 100, 'PRUEBA-DISPARADOR-66');

    select count(*) into v_cola_despues from net.http_request_queue;
    select valor into v_error from public.parametros where clave = 'aviso_chat_ti_ultimo_error';

    raise exception 'RESULTADO (todo se deshizo): aviso encolado = %, cola antes = %, despues = %, error anotado = %',
        (v_cola_despues = v_cola_antes + 1), v_cola_antes, v_cola_despues, coalesce(v_error, '(ninguno)');
end
$prueba$;


-- ---------------------------------------------------------------------
-- PASO 3 (opcional) — Confirmar que no quedo nada. Las tres en 0.
-- ---------------------------------------------------------------------
select
    (select count(*) from public.registros where folio = 'SATAG-999999')          as expediente_prueba,
    (select count(*) from public.pagos where folio_recibo = 'PRUEBA-DISPARADOR-66') as pago_prueba,
    (select count(*) from net.http_request_queue)                                   as en_cola;
