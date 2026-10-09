-- =====================================================================
-- 2026-10-09 — Movimientos en ZK: solo lo decidido (datos, despues del 94)
--
-- POR QUE
--   Gerardo, 9-oct: en Movimientos en ZK quiere ver SOLO lo que se cerro con
--   su accion en ZK. El boton «Buscar movimientos en los casos» (ya retirado
--   del panel) creo un movimiento pendiente por cada caso ABIERTO que podria
--   pedir algo en ZK, decidido o no. Si esos se quedan, el dia que su caso se
--   cierre sin accion apareceria como si se hubiera decidido.
--
-- QUE HACE
--   Cancela los movimientos PENDIENTES cuyo caso sigue abierto (nuevo, por
--   atender, esperando). No toca:
--     - los de casos cerrados (resueltos): son las decisiones;
--     - los «no coincide»: ZK no confirmo lo hecho y hay que verlo;
--     - los que estan en una tanda, hechos o verificados.
--   Cada cancelado lleva en su detalle por que, para poder revertirlo.
--
-- Se pega completo en el SQL Editor. Solo datos: no cambia funciones.
-- =====================================================================

begin;

do $guardia$
begin
    if to_regprocedure('public.pedir_movimiento_zk(uuid, text, text, text, text)') is null then
        raise exception 'Falta el bloque 94. No se aplico nada.';
    end if;
end;
$guardia$;

update zk_movimientos m
   set estado = 'cancelado', actualizado_en = now(),
       detalle = 'Sugerido para un caso abierto, sin decision (limpieza del 9-oct: solo entra lo que se cierra con accion).'
 where m.estado = 'pendiente'
   and exists (select 1 from casos c where c.id = m.caso_id and c.estado in ('nuevo', 'abierto', 'esperando', 'seguimiento'));

commit;


-- VERIFICACION (solo lectura). Las dos filas en ok = true; la tercera dice cuantos quedan.
select 1 as orden, 'ningun movimiento pendiente es de un caso abierto' as que,
       not exists (select 1 from zk_movimientos m join casos c on c.id = m.caso_id
                    where m.estado = 'pendiente' and c.estado in ('nuevo', 'abierto', 'esperando', 'seguimiento')) as ok,
       null::bigint as cuantos
union all
select 2, 'los cancelados por esta limpieza', true,
       (select count(*) from zk_movimientos where detalle like 'Sugerido para un caso abierto%')
union all
select 3, 'pendientes que se quedan (casos cerrados con su accion)', true,
       (select count(*) from zk_movimientos where estado = 'pendiente')
order by orden;


-- ROLLBACK (comentado): devuelve a pendientes los que cancelo esta limpieza.
--
--   update zk_movimientos set estado = 'pendiente', detalle = '', actualizado_en = now()
--    where estado = 'cancelado' and detalle like 'Sugerido para un caso abierto%';
