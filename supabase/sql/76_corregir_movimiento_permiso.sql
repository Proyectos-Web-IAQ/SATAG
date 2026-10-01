-- =====================================================================
-- BLOQUE 76 — Corrige un defecto del bloque 75 que rompe la aceptacion
--             del permiso del menor en produccion.
--
-- URGENTE. Aplicar antes de que Administracion acepte el primer permiso.
--
-- POR QUE
--   `validar_permiso_menor` (bloque 75, lineas 667-669) inserta en
--   `movimientos` un renglon con `tipo = 'actualizacion'`, y el CHECK
--   `mov_tipo_valido` NO admite ese valor: solo 'alta', 'baja', 'reposicion',
--   'cambio', 'prueba', 'bloqueo' y 'rectificacion'. La primera vez que
--   alguien pulse «Aceptar el permiso» la transaccion aborta contra el CHECK,
--   el permiso no queda aceptado y la pantalla muestra un error de base de
--   datos. El cobro de ese expediente se queda detenido.
--
--   'actualizacion' SI es un valor valido, pero de OTRA tabla: `solicitudes`
--   lo admite en `sol_tipo_valido`. Las 41 apariciones del literal en el
--   repositorio son todas de solicitudes; ninguna funcion de produccion lo
--   mete en `movimientos`. El bloque 75 fue la primera.
--
-- POR QUE NO LO DETECTO LA VERIFICACION DEL 75
--   Sus ocho filas comprobaban ESTRUCTURA —que las columnas existieran, que
--   hubiera una sola firma de crear_registro, que el bucket tuviera su limite
--   y sus tipos— y ninguna ejecuto el cuerpo de la funcion. Una verificacion
--   de solo lectura no puede encontrar un defecto que solo aparece al
--   escribir. Lo que si lo encuentra es ejercer el camino completo en la base
--   local, que desde el 29-sep ya existe.
--
-- QUE HACE, EN ORDEN
--   1. Guardia: aborta si el CHECK ya fue ampliado por otro camino, si la
--      funcion no existe, si tiene mas de una forma, o si su cuerpo ya esta
--      corregido (en ese caso no hay nada que hacer).
--   2. Amplia `mov_tipo_valido` con el valor 'validacion'.
--   3. Reemplaza el cuerpo de `validar_permiso_menor` para que inserte
--      'validacion'. MISMA FIRMA, asi que va con `create or replace` y sin
--      drop, sin regrant y sin notify: la trampa de PostgREST solo aplica
--      cuando la firma cambia.
--   4. Verificacion de solo lectura: cuatro filas con ok = true.
--
-- POR QUE 'validacion' Y NO REUSAR 'rectificacion'
--   `movimientos` es la bitacora que lee una persona cuando audita un
--   expediente, y el aviso de privacidad v8 promete trazabilidad. Anotar
--   «rectificacion» donde lo que paso fue que Administracion acepto el
--   permiso de un menor describe mal el hecho, y en un proyecto auditado eso
--   cuesta mas que una linea de SQL. Ampliar un CHECK es puramente aditivo:
--   no puede romper una fila existente ni una escritura existente, asi que no
--   necesita que el cliente este publicado antes.
--
-- QUE NO HACE
--   - No toca el cliente. La pantalla ya llama al RPC por su nombre y su
--     firma no cambia, asi que no hay nada que publicar ni que verificar con
--     `npm run publicado`.
--   - No exige el permiso en la base. Eso es el bloque 77: el 75 lo prometia
--     como 76 en su encabezado, y este defecto se le adelanto por urgencia.
--     Hay que corregir esa referencia en el README al registrar los dos.
--   - No arregla expedientes a medias: si el CHECK ya abortó algun intento,
--     la transaccion completa se revirtio y no quedo nada que limpiar. Eso es
--     lo unico bueno de que el defecto reviente en vez de pasar en silencio.
--
-- Depende de: 19 (movimientos), 75 (validar_permiso_menor).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. GUARDIA. Va primero: si aborta, no se aplico nada.
-- ---------------------------------------------------------------------
do $guardia$
declare
    v_def  text;
    v_n    int;
    v_src  text;
begin
    -- El CHECK de partida tiene que ser el de siempre. Si alguien ya lo
    -- amplio por otro camino, hay que mirar que mas cambio antes de tocarlo.
    select pg_get_constraintdef(c.oid) into v_def
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public' and t.relname = 'movimientos'
       and c.conname = 'mov_tipo_valido';
    if v_def is null then
        raise exception 'Bloque 76 cancelado: no existe el CHECK mov_tipo_valido en movimientos. No se aplico nada.';
    end if;
    if v_def like '%validacion%' then
        raise exception 'Bloque 76 cancelado: mov_tipo_valido ya admite validacion; alguien lo amplio antes. Revise que paso. No se aplico nada.';
    end if;
    if v_def not like '%rectificacion%' then
        raise exception 'Bloque 76 cancelado: mov_tipo_valido no es el esperado (%). No se aplico nada.', v_def;
    end if;

    -- Una sola forma de la funcion. Si hay dos, el bloque 75 se aplico dos
    -- veces de formas distintas y PostgREST esta eligiendo una de ellas.
    select count(*), max(p.prosrc) into v_n, v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'validar_permiso_menor';
    if v_n = 0 then
        raise exception 'Bloque 76 cancelado: validar_permiso_menor no existe; aplique primero el bloque 75. No se aplico nada.';
    end if;
    if v_n <> 1 then
        raise exception 'Bloque 76 cancelado: hay % formas de validar_permiso_menor y deberia haber una. No se aplico nada.', v_n;
    end if;

    -- Si el cuerpo ya no trae el literal malo, el defecto esta corregido y
    -- volver a correr esto solo agregaria ruido al CHECK.
    if v_src not like '%''actualizacion''%' then
        raise exception 'Bloque 76 cancelado: validar_permiso_menor ya no inserta actualizacion; el defecto esta corregido. No se aplico nada.';
    end if;
end
$guardia$;


-- ---------------------------------------------------------------------
-- 1. EL CHECK ADMITE 'validacion'. Aditivo: ninguna fila existente puede
--    violarlo, porque solo se amplia el conjunto permitido.
-- ---------------------------------------------------------------------
alter table movimientos drop constraint mov_tipo_valido;

alter table movimientos add constraint mov_tipo_valido
    check (tipo = any (array['alta', 'baja', 'reposicion', 'cambio',
                             'prueba', 'bloqueo', 'rectificacion', 'validacion']));

comment on constraint mov_tipo_valido on movimientos is
    'Tipos de movimiento. «validacion» lo agrego el bloque 76 para la aceptacion '
    'del permiso del menor, que el bloque 75 anotaba como «actualizacion» —valor de '
    'solicitudes, no de movimientos— y reventaba contra este mismo CHECK.';


-- ---------------------------------------------------------------------
-- 2. EL CUERPO DE LA FUNCION. Extraido del bloque 75 (lineas 630-673) con
--    un solo cambio verificado con diff: el literal de la linea 668.
--    MISMA FIRMA: `create or replace`, sin drop, sin regrant y sin notify.
-- ---------------------------------------------------------------------
create or replace function validar_permiso_menor(
    p_registro_id uuid,
    p_hecho_por   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $validar$
declare
    v_reg   registros%rowtype;
    v_quien text;
begin
    perform panel_exigir_rol(array['admin']);

    select * into v_reg from registros where id = p_registro_id;
    if not found then
        raise exception 'No existe el expediente.';
    end if;
    if not v_reg.usuario_es_menor then
        raise exception 'Este expediente no es de un conductor menor de edad: no hay permiso que aceptar.';
    end if;
    if v_reg.permiso_url is null then
        raise exception 'El expediente no tiene permiso cargado. Pida a la familia que lo suba antes de aceptarlo.';
    end if;
    if v_reg.permiso_validado then
        raise exception 'El permiso ya fue aceptado por % el %.', coalesce(v_reg.permiso_validado_por, 'alguien'),
            to_char(v_reg.permiso_validado_en at time zone 'America/Mexico_City', 'DD-Mon-YYYY HH24:MI');
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email');

    update registros
       set permiso_validado     = true,
           permiso_validado_por = v_quien,
           permiso_validado_en  = now()
     where id = p_registro_id;

    -- El tipo correcto es el de abajo. El bloque 75 anotaba aqui un tipo que
    -- pertenece a `solicitudes` y que `mov_tipo_valido` rechaza: ese es el
    -- defecto que corrige este bloque. El valor viejo NO se nombra en este
    -- comentario a proposito: `prosrc` incluye los comentarios, y citarlo aqui
    -- hacia que la fila 3 de la verificacion lo encontrara y diera un falso
    -- negativo sobre su propio arreglo.
    insert into movimientos (registro_id, tipo, fecha, motivo, hecho_por)
    values (p_registro_id, 'validacion', (now() at time zone 'America/Mexico_City')::date,
            'Permiso para conducir del menor aceptado por Administracion', v_quien);

    return jsonb_build_object('id', p_registro_id, 'validadoPor', v_quien);
end;
$validar$;


-- ---------------------------------------------------------------------
-- 3. VERIFICACION (solo lectura). `ok` en true en las cuatro filas.
-- ---------------------------------------------------------------------
select 1 as orden,
       'mov_tipo_valido admite validacion' as que,
       (select pg_get_constraintdef(c.oid)
          from pg_constraint c
          join pg_class t on t.oid = c.conrelid
          join pg_namespace n on n.oid = t.relnamespace
         where n.nspname = 'public' and t.relname = 'movimientos'
           and c.conname = 'mov_tipo_valido') as valor,
       (select pg_get_constraintdef(c.oid) like '%validacion%'
          from pg_constraint c
          join pg_class t on t.oid = c.conrelid
          join pg_namespace n on n.oid = t.relnamespace
         where n.nspname = 'public' and t.relname = 'movimientos'
           and c.conname = 'mov_tipo_valido') as ok
union all
select 2, 'los siete tipos de siempre siguen admitidos', null,
       (select bool_and(pg_get_constraintdef(c.oid) like '%' || v || '%')
          from pg_constraint c
          join pg_class t on t.oid = c.conrelid
          join pg_namespace n on n.oid = t.relnamespace
          cross join unnest(array['alta','baja','reposicion','cambio',
                                  'prueba','bloqueo','rectificacion']) as v
         where n.nspname = 'public' and t.relname = 'movimientos'
           and c.conname = 'mov_tipo_valido')
union all
select 3, 'validar_permiso_menor ya no inserta actualizacion', null,
       (select p.prosrc not like '%''actualizacion''%' and p.prosrc like '%''validacion''%'
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'validar_permiso_menor')
union all
select 4, 'una sola forma de validar_permiso_menor',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'validar_permiso_menor'),
       (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'validar_permiso_menor')
order by orden;


-- EN PANTALLA, y esta vez si hay que hacerlo antes de darlo por bueno:
--   Con la cuenta de Administracion (rol admin, NO super: panel_exigir_rol
--   hace return en seco para super y no probaria nada), abra un expediente de
--   un menor con permiso cargado y pulse «Aceptar el permiso». Debe quedar
--   aceptado y aparecer un movimiento de tipo «validacion» en su historial.
--   Antes de este bloque, ese mismo clic devolvia un error de base de datos.


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado).
--
--   -- 1. El cuerpo vuelve al del bloque 75: corra de 75_permiso_menor.sql
--   --    las lineas 630-673 tal cual. Ojo: eso REPONE el defecto, y la
--   --    aceptacion del permiso vuelve a reventar. Solo tiene sentido si se
--   --    va a revertir el 75 completo.
--
--   -- 2. El CHECK vuelve a los siete valores. Solo si NINGUN movimiento usa
--   --    ya el tipo nuevo: si lo hay, quitar el valor dejaria filas que
--   --    violan su propio CHECK y cualquier alter posterior sobre la tabla
--   --    fallaria.
--   --    select count(*) from movimientos where tipo = 'validacion';  -- debe ser 0
--   alter table movimientos drop constraint mov_tipo_valido;
--   alter table movimientos add constraint mov_tipo_valido
--       check (tipo = any (array['alta','baja','reposicion','cambio',
--                                'prueba','bloqueo','rectificacion']));
-- ---------------------------------------------------------------------
