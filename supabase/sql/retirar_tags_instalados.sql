-- =====================================================================
-- retirar_tags_instalados.sql  —  SE CORRE DESPUES DE limpiar_padron_piloto.sql
--
-- POR QUE EXISTE
--
-- La limpieza pone `asignado_a = null` en TODO el inventario, para liberar las
-- reservas que quedaron a medias. El efecto secundario es que los TAGs que SI
-- estan instalados —pegados a un parabrisas y dados de alta en ZKBioSecurity—
-- vuelven a figurar como stock disponible, porque el expediente que los
-- justificaba ya no existe.
--
-- Si no se corrige, TI puede entregar el lunes un TAG que ya esta en uso. El
-- conflicto no aparece en SATAG: aparece en la pluma del estacionamiento, con
-- dos coches y un mismo numero de tarjeta.
--
-- Estos 14 numeros son los del piloto del 8-sep, tomados del respaldo. Siguen
-- vivos en ZK y NO deben volver a entregarse.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 1 — QUE HAY HOY. Solo lee.
-- ---------------------------------------------------------------------
with instalados(no_dispositivo) as (
    values ('13078090'),('13078091'),('13078092'),('13078093'),('13078094'),
           ('13078095'),('13078096'),('13078099'),('13078100'),('13078101'),
           ('13078102'),('13078103'),('13078104'),('13078105')
)
select i.no_dispositivo,
       case
           when t.no_dispositivo is null              then 'NO esta en el inventario (nada que hacer)'
           when t.asignado_a is not null              then 'asignado todavia (¿corrio la limpieza?)'
           else 'EN STOCK POR ERROR -> se retira'
       end as situacion
  from instalados i
  left join inventario_tags t on t.no_dispositivo = i.no_dispositivo
 order by i.no_dispositivo;

-- Panorama del inventario completo, para no retirar de mas.
select count(*) filter (where asignado_a is null)     as disponibles,
       count(*) filter (where asignado_a is not null) as asignados,
       count(*)                                       as total
  from inventario_tags;


-- ---------------------------------------------------------------------
-- PASO 2 — RETIRARLOS. Ejecute primero, sola, esta linea en la misma sesion:
--
--     set satag.confirmo_borrado = 'SI, BORRAR TODO';
--
-- Se usa el mismo candado que la limpieza a proposito: es el mismo momento
-- del procedimiento y no conviene inventar una confirmacion distinta.
--
-- No se usa el RPC retirar_tag_inventario porque exige rol `ti` en el JWT y
-- el SQL Editor no lo lleva. El efecto es el mismo: la funcion tambien borra
-- la fila, y aqui ya comprobamos en el PASO 1 que ninguno esta asignado.
-- ---------------------------------------------------------------------
do $$
declare
    v_confirma  text := coalesce(current_setting('satag.confirmo_borrado', true), '');
    v_asignados int;
    v_borrados  int;
    v_lista     text[] := array['13078090','13078091','13078092','13078093','13078094',
                                '13078095','13078096','13078099','13078100','13078101',
                                '13078102','13078103','13078104','13078105'];
begin
    if v_confirma <> 'SI, BORRAR TODO' then
        raise exception
            'Cancelado: falta la confirmacion. Ejecute primero  set satag.confirmo_borrado = ''SI, BORRAR TODO'';';
    end if;

    -- Si alguno sigue asignado, la limpieza no corrio o corrio a medias.
    select count(*) into v_asignados
      from inventario_tags
     where no_dispositivo = any(v_lista) and asignado_a is not null;
    if v_asignados > 0 then
        raise exception
            'Hay % TAG(s) de la lista todavia asignados a un expediente. Corra antes limpiar_padron_piloto.sql y vuelva a este paso.',
            v_asignados;
    end if;

    delete from inventario_tags where no_dispositivo = any(v_lista);
    get diagnostics v_borrados = row_count;

    raise notice 'Retirados % TAG(s) del inventario. Siguen instalados y activos en ZKBioSecurity; ya no se pueden volver a entregar desde SATAG.', v_borrados;
end;
$$;


-- ---------------------------------------------------------------------
-- PASO 3 — VERIFICACION. Ninguno de los 14 debe aparecer.
-- ---------------------------------------------------------------------
select no_dispositivo, dado_de_alta_en, asignado_a
  from inventario_tags
 where no_dispositivo in ('13078090','13078091','13078092','13078093','13078094',
                          '13078095','13078096','13078099','13078100','13078101',
                          '13078102','13078103','13078104','13078105');
-- Cero filas = correcto.

-- Lo que queda para entregar el lunes.
select count(*) as tags_disponibles_para_el_lunes
  from inventario_tags
 where asignado_a is null;

select no_dispositivo
  from inventario_tags
 where asignado_a is null
 order by no_dispositivo;
