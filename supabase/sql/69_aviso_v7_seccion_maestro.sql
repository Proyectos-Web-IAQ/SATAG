-- =====================================================================
-- 69_aviso_v7_seccion_maestro.sql   (SC-029, L2-09: la seccion del maestro)
--
-- POR QUE. El bloque 70 va a recabar, y a sellar en la firma, la seccion en
-- la que trabaja el maestro que pide un TAG (preescolar, primaria,
-- secundaria o preparatoria), porque de ella depende el estacionamiento al
-- que da acceso su dispositivo (criterio confirmado el 14-sep). El aviso
-- vigente (v6) no la menciona y, en el apartado de los apellidos, dice que al
-- personal docente "no se le piden" datos de cotejo. Un dato que se recaba y
-- se sella sin estar en el aviso firmado es un dato recabado sin informar:
-- el aviso tiene que decirlo ANTES de que el formulario lo pida.
--
-- COMO SE CONSTRUYE LA V7. No se pega una copia del aviso. La v7 sale del
-- texto de la v6 que YA esta en la base, aplicandole tres reemplazos
-- declarados en la tabla temporal de abajo:
--   1. Integral, datos identificativos del anexo: se agrega la seccion.
--   2. Integral, apartado LOS APELLIDOS DE SU FAMILIA: se dice que al
--      personal docente, en cambio, se le pide la seccion.
--   3. Simplificado: la seccion entra a la lista de datos que se recaban.
-- Asi el texto institucional queda identico POR CONSTRUCCION, y la
-- verificacion lo comprueba de todos modos. Ningun cambio toca la frase
-- 'a los alumnos y a cualquier otro familiar', que usan las guardias de los
-- bloques 64 y 65.
--
-- QUE HACE, EN ORDEN:
--   0. Declara los tres cambios (tabla temporal: un solo lugar para el
--      bloque y para su verificacion).
--   1. Guardia y publicacion en un solo bloque: exige la v6; cada frase
--      debe aparecer EXACTAMENTE una vez en la v6; si ya hay una v7 con el
--      mismo texto solo asegura que sea la vigente; si hay una v7 con OTRO
--      texto y firmas, aborta ("publique como v8").
--   2. Invariante: exactamente un aviso vigente, y es la v7.
--   3. Verificacion de solo lectura.
--
-- ORDEN DEL CAMBIO COMPLETO DE L2-09:
--   69 (este) -> 70 (crear_registro con p_seccion_maestro) -> deploy del
--   formulario y del panel -> (despues) el bloque que EXIGE la seccion.
-- Retrocompatible: el sitio publicado lee de la base el aviso vigente.
--
-- Solo datos: sin funciones, sin grants, sin notify. Idempotente.
-- Las versiones 1 a 6 quedan intactas y no vigentes; cada firma conserva el
-- texto que se le mostro.
--
-- Pendiente fuera del SQL: el documento del aviso para Legal
-- (Entregables/E6) debe incorporar la v7 en su historial.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. LOS TRES CAMBIOS. `de` es la frase exacta de la v6; `a`, la de la v7.
-- ---------------------------------------------------------------------
drop table if exists pg_temp._aviso_v7_cambios;
create temp table _aviso_v7_cambios (
    orden int primary key,
    campo text not null check (campo in ('contenido', 'simplificado')),
    de    text not null,
    a     text not null
);

insert into _aviso_v7_cambios (orden, campo, de, a) values
(1, 'contenido',
 'junto con la corrección que el Instituto registra cuando lo comprueba; el nombre de quien gestiona el trámite',
 'junto con la corrección que el Instituto registra cuando lo comprueba; la sección en la que trabaja el personal docente que solicita el TAG, es decir, preescolar, primaria, secundaria o preparatoria, dato del que depende el estacionamiento al que da acceso su dispositivo; el nombre de quien gestiona el trámite'),
-- El cambio 2 va DESPUES de "No se utilizan para ninguna otra finalidad...":
-- ese plural habla de los apellidos, y metida antes, la frase de la seccion
-- lo volvia ambiguo (revision del 15-sep).
(2, 'contenido',
 'de modo que a ellos no se les piden. No se utilizan para ninguna otra finalidad ni se comunican a nadie fuera del personal del Instituto expresamente autorizado.',
 'de modo que a ellos no se les piden. No se utilizan para ninguna otra finalidad ni se comunican a nadie fuera del personal del Instituto expresamente autorizado. Al personal docente, en cambio, se le pide la sección en la que trabaja, es decir, preescolar, primaria, secundaria o preparatoria, porque de ella depende el estacionamiento al que da acceso su TAG.'),
(3, 'simplificado',
 'el parentesco con la familia cuando quien lo solicita es otro familiar, los datos del vehículo',
 'el parentesco con la familia cuando quien lo solicita es otro familiar, la sección en la que trabaja cuando quien lo solicita es maestro, los datos del vehículo');


-- ---------------------------------------------------------------------
-- 1. GUARDIA Y PUBLICACION.
-- ---------------------------------------------------------------------
do $publicar$
declare
    v6        record;
    c         record;
    v_base    text;
    v_n       int;
    v_txt     text;
    v_simp    text;
    v7_id     uuid;
    v7_md5    text;
    v7_md5_s  text;
    v_firmas  int;
begin
    select id, contenido, contenido_simplificado, url_publica
      into v6
      from aviso_versiones
     where version = 6;
    if v6.id is null then
        raise exception 'Bloque 69 cancelado: no existe la version 6 del aviso (bloque 64). No se aplico nada.';
    end if;
    -- Reejecutarlo con una version posterior publicada le quitaria la
    -- vigencia (revision del 15-sep).
    if exists (select 1 from aviso_versiones where version > 7) then
        raise exception 'Bloque 69 cancelado: ya existe una version del aviso posterior a la 7. No se aplico nada.';
    end if;

    v_txt  := v6.contenido;
    v_simp := v6.contenido_simplificado;

    for c in select * from _aviso_v7_cambios order by orden loop
        v_base := case when c.campo = 'contenido' then v6.contenido else v6.contenido_simplificado end;
        v_n := (length(v_base) - length(replace(v_base, c.de, ''))) / length(c.de);
        if v_n <> 1 then
            raise exception 'Bloque 69 cancelado: el cambio % (%) debe encontrar su frase exactamente una vez en la v6 y la encontro % veces. No se aplico nada.', c.orden, c.campo, v_n;
        end if;
        if c.campo = 'contenido' then
            v_txt := replace(v_txt, c.de, c.a);
        else
            v_simp := replace(v_simp, c.de, c.a);
        end if;
    end loop;

    select id, md5(contenido), md5(contenido_simplificado)
      into v7_id, v7_md5, v7_md5_s
      from aviso_versiones
     where version = 7;

    if v7_id is not null then
        if v7_md5 = md5(v_txt) and v7_md5_s = md5(v_simp) then
            raise notice 'La version 7 ya existe con este mismo texto; solo se asegura que sea la vigente.';
        else
            select count(*) into v_firmas
              from aceptaciones
             where aviso_version_id = v7_id;
            if v_firmas > 0 then
                raise exception 'Ya existe una version 7 con OTRO texto y % aceptacion(es) firmadas contra ella; sobrescribirla romperia esa evidencia. Publique este texto como version 8. No se aplico nada.', v_firmas;
            end if;
            raise notice 'Habia una version 7 con otro texto y sin firmas; se sustituye.';
        end if;
    end if;

    update aviso_versiones
       set vigente = false
     where vigente
       and version <> 7;

    insert into aviso_versiones (version, contenido, contenido_simplificado, url_publica, vigente)
    values (7, v_txt, v_simp, v6.url_publica, true)
    on conflict (version) do update
        set contenido              = excluded.contenido,
            contenido_simplificado = excluded.contenido_simplificado,
            url_publica            = excluded.url_publica,
            vigente                = true;
end
$publicar$;


-- ---------------------------------------------------------------------
-- 2. INVARIANTE.
-- ---------------------------------------------------------------------
do $verificar$
declare
    v_vigentes int;
    v_version  int;
begin
    select count(*) into v_vigentes from aviso_versiones where vigente;
    if v_vigentes <> 1 then
        raise exception 'Quedaron % avisos vigentes; deberia haber exactamente 1. No se aplico nada.', v_vigentes;
    end if;
    select version into v_version from aviso_versiones where vigente;
    if v_version <> 7 then
        raise exception 'La version vigente quedo en % y deberia ser la 7. No se aplico nada.', v_version;
    end if;
end
$verificar$;


-- ---------------------------------------------------------------------
-- 3. VERIFICACION (solo lectura). Todas las banderas en true y
--    mojibake_detectado en false.
--    - institucional_identico: todo lo anterior al anexo es igual a la v6.
--    - solo_estos_cambios: deshaciendo los tres cambios sobre la v7 sale la
--      v6 exacta, integral y simplificado.
-- ---------------------------------------------------------------------
select v7.version                                                             as version_vigente,
       (v7.contenido like '%la sección en la que trabaja el personal docente que solicita el TAG%'
        and v7.contenido like '%se le pide la sección en la que trabaja%'
        and v7.contenido_simplificado like '%la sección en la que trabaja cuando quien lo solicita es maestro%')
                                                                              as seccion_ok,
       (v7.contenido like '%a los alumnos y a cualquier otro familiar%')      as frase_de_las_guardias_ok,
       (v7.contenido like '%Ã%' or v7.contenido like '%Â%'
        or v7.contenido_simplificado like '%Ã%' or v7.contenido_simplificado like '%Â%')
                                                                              as mojibake_detectado,
       (left(v7.contenido, position('TRATAMIENTO ESPECÍFICO PARA SATAG' in v7.contenido))
          = left(v6.contenido, position('TRATAMIENTO ESPECÍFICO PARA SATAG' in v6.contenido)))
                                                                              as institucional_identico,
       (replace(replace(v7.contenido,
                    (select a  from _aviso_v7_cambios where orden = 1),
                    (select de from _aviso_v7_cambios where orden = 1)),
                    (select a  from _aviso_v7_cambios where orden = 2),
                    (select de from _aviso_v7_cambios where orden = 2)) = v6.contenido
        and replace(v7.contenido_simplificado,
                    (select a  from _aviso_v7_cambios where orden = 3),
                    (select de from _aviso_v7_cambios where orden = 3)) = v6.contenido_simplificado)
                                                                              as solo_estos_cambios
  from aviso_versiones v7
  join aviso_versiones v6 on v6.version = 6
 where v7.vigente;


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). SOLO si ninguna aceptacion apunta a la v7 y el
-- formulario que pide la seccion NO esta publicado (con el publicado, el
-- aviso vigente tiene que seguir diciendo que se pide):
--
--   -- En DOS updates y en este orden: el indice unico de la vigente no es
--   -- diferible, y uno solo podria dejar dos vigentes a media sentencia.
--   update aviso_versiones set vigente = false where version = 7;
--   update aviso_versiones set vigente = true  where version = 6;
--   delete from aviso_versiones v
--    where v.version = 7
--      and not exists (select 1 from aceptaciones a where a.aviso_version_id = v.id);
--
-- Si ya hay firmas contra la v7, no se revierte: se corrige con una v8.
-- ---------------------------------------------------------------------
