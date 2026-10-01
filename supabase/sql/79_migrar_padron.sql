-- =====================================================================
-- BLOQUE 79 — El padron historico entra a SATAG.
--
-- SC-031. Segundo bloque de la pestana Estacionamiento.
--
-- POR QUE
--   El tablero menciona credenciales y nombres que no tienen expediente en
--   SATAG: hoy los resuelve contra la hoja de calculo y el export de ZK, que
--   son archivos sueltos en la maquina de alguien. Mientras eso siga asi, el
--   tablero no es auditable —no se puede abrir el expediente de un renglon—
--   y el padron real del Instituto vive en un Excel.
--
--   La regla que este bloque hace cumplir: NI UN SOLO TAG NI UN SOLO NOMBRE
--   que el tablero mencione sin su expediente en SATAG. Lo que no este en
--   ninguna de las tres fuentes se senala en rojo y se resuelve a mano; lo
--   que este en la hoja o en ZK, entra aqui.
--
-- DE DONDE SALE CADA DATO, Y POR QUE DE AHI
--   La HOJA es la fuente del vehiculo: marca 100%, modelo 99%, color 100%,
--   placa 76%. Y no es casualidad que importe: `registros` exige marca, modelo
--   y color NOT NULL, asi que sin la hoja no se puede dar de alta un
--   expediente completo. ZK no tiene ninguno de los tres.
--   ZK es la fuente del ESTADO ACTUAL: a que departamento pertenece hoy la
--   tarjeta, y la placa cuando la hoja no la trae.
--   Cuando las dos tienen el dato, manda la hoja, porque fue capturada por
--   quien entrego el TAG.
--
-- QUE NO HACE, A PROPOSITO
--   NO inventa un pago. Un expediente migrado no paso por caja en SATAG, y
--   registrar un pago de cero para que «cuadre» ensuciaria el corte y la
--   contabilidad. Por eso existe `origen_expediente`: Finanzas los excluye.
--   NO inventa una aceptacion. `aceptaciones` es llave foranea HACIA
--   `registros` con UNIQUE(registro_id), y NO existe ninguna restriccion que
--   exija una aceptacion: un expediente migrado simplemente no tiene fila.
--   Lo que si queda declarado es DONDE esta la firma, en
--   `evidencia_aceptacion`: quien firmo en papel tiene 'fisica'.
--
-- LA RESTRICCION QUE MANDA EN EL DISENO
--   `uq_registros_no_dispositivo_activo` es UNIQUE sobre `no_dispositivo`
--   cuando el estado no es 'baja'. O sea: dos expedientes vivos NO pueden
--   compartir TAG. La hoja tiene filas repetidas por reposiciones, asi que la
--   carga salta la tarjeta que ya tiene expediente vivo en vez de fallar, y
--   devuelve cuantas salto para que se revisen a mano.
--
-- POR QUE EL NOMBRE SE PARTE EN EL CLIENTE Y NO AQUI
--   `registros` guarda nombres y apellidos por separado y la hoja trae el
--   nombre completo en una sola celda. Partirlo bien —apellidos compuestos,
--   «de la», preposiciones— ya esta resuelto y probado en TypeScript. Repetir
--   esa heuristica en plpgsql seria tener dos versiones que algun dia
--   divergen. Este RPC recibe los campos ya partidos.
--
-- QUE HACE, EN ORDEN
--   1. Guardia: aborta si las columnas ya existen con otro catalogo.
--   2. Agrega `registros.origen_expediente` y `registros.evidencia_aceptacion`.
--   3. Agrega `estacionamientos.cupo_lugares`.
--   4. Crea `migrar_expedientes` (rol ti). Funcion nueva -> solo notify.
--   5. Amplia `reg_placas_requeridas`: un migrado puede no traer placa.
--   6. Verificacion de solo lectura: ocho filas con ok = true.
--
-- OJO CON cupo_lugares: `estacionamientos` tiene lectura PUBLICA
--   (`est_lectura_publica`, bloque 05), asi que cuantos cajones hay queda
--   legible por `anon`. No es dato personal ni sensible —es el tamano de un
--   estacionamiento— pero queda dicho aqui y no descubierto despues.
--
-- Este bloque solo AGREGA: va ANTES del deploy del cliente que lo usa.
--
-- Depende de: 12 (registros), 25 (registro_estacionamientos), 29
--             (panel_exigir_rol), 01 (estacionamientos), 19 (movimientos).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. GUARDIA. Va primero: si aborta, no se aplico nada.
-- ---------------------------------------------------------------------
do $guardia$
declare
    v_def text;
    v_n   int;
begin
    -- Si la columna ya existe, su catalogo tiene que ser el de este bloque.
    select pg_get_constraintdef(c.oid) into v_def
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public' and t.relname = 'registros'
       and c.conname = 'reg_origen_expediente_valido';

    if v_def is not null and v_def not like '%migracion_zk%' then
        raise exception
            'reg_origen_expediente_valido ya existe con otro catalogo (%). Revise que version se aplico. No se aplico nada.', v_def;
    end if;

    -- `origen` ya existe en `solicitudes` con OTRO catalogo ('publico' /
    -- 'interno'). La columna de aqui se llama `origen_expediente` justamente
    -- para no reusar un nombre con dos significados en dos tablas. Si alguien
    -- creo `registros.origen`, hay que mirarlo antes de seguir.
    select count(*) into v_n
      from information_schema.columns
     where table_schema = 'public' and table_name = 'registros' and column_name = 'origen';
    if v_n > 0 then
        raise exception
            'registros ya tiene una columna `origen`, que no es la de este bloque (`origen_expediente`). Revise antes de continuar. No se aplico nada.';
    end if;

    -- La unicidad parcial del TAG es lo que hace segura la carga: sin ella,
    -- migrar la hoja crearia expedientes vivos duplicados sin avisar.
    select count(*) into v_n
      from pg_indexes
     where schemaname = 'public' and tablename = 'registros'
       and indexname = 'uq_registros_no_dispositivo_activo';
    if v_n <> 1 then
        raise exception
            'Falta uq_registros_no_dispositivo_activo. Sin esa unicidad la migracion puede duplicar expedientes vivos. No se aplico nada.';
    end if;

    select count(*) into v_n from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'panel_exigir_rol';
    if v_n = 0 then
        raise exception 'Falta panel_exigir_rol: aplique antes el bloque 29. No se aplico nada.';
    end if;
end;
$guardia$;


-- ---------------------------------------------------------------------
-- 1. LAS COLUMNAS NUEVAS. Aditivas: ninguna fila existente las viola,
--    porque las dos tienen valor por omision y las de hoy son de SATAG.
-- ---------------------------------------------------------------------
alter table registros
    add column if not exists origen_expediente   text not null default 'satag',
    add column if not exists evidencia_aceptacion text not null default 'electronica';

alter table registros drop constraint if exists reg_origen_expediente_valido;
alter table registros add  constraint reg_origen_expediente_valido
    check (origen_expediente in ('satag','migracion_hoja','migracion_zk'));

alter table registros drop constraint if exists reg_evidencia_aceptacion_valida;
alter table registros add  constraint reg_evidencia_aceptacion_valida
    check (evidencia_aceptacion in ('electronica','fisica','no_localizada'));

comment on column registros.origen_expediente is
    'De donde salio el expediente: satag (alta normal, paso por caja), migracion_hoja (padron historico, bloque 79), migracion_zk (solo estaba en el control de acceso). Finanzas excluye los que no son satag.';
comment on column registros.evidencia_aceptacion is
    'Donde obra la aceptacion del reglamento: electronica (hay fila en aceptaciones), fisica (se firmo en papel al entregar el TAG), no_localizada (no se ha encontrado).';

-- --- La placa de un expediente migrado puede faltar, y eso NO es `sin_placas` ---
--
-- `reg_placas_requeridas` exige placa salvo que el vehiculo no la tenga. Esta bien
-- para un alta: el formulario tiene que pedirla. Pero la hoja historica trae 428
-- filas sin placa y solo SIETE son de verdad vehiculos sin placas; las otras 421 son
-- «no se capturo». Marcar `sin_placas` en esas seria meter 421 afirmaciones falsas en
-- el padron, y `sin_placas` no es un cajon de desconocidos: significa que el coche
-- circula con permiso provisional, que es un hecho distinto y que alguien podria
-- consultar.
--
-- Asi que la restriccion se AMPLIA, no se afloja: el hueco se permite solo cuando el
-- expediente viene de una migracion, donde la ausencia es un hecho del archivo de
-- origen y no un descuido de la pantalla. Para las altas normales sigue siendo
-- obligatoria, exactamente igual que hoy.
--
-- Y queda contable, que es lo que lo vuelve un pendiente y no un agujero:
--   select count(*) from registros
--    where origen_expediente <> 'satag' and placas is null and not sin_placas;
alter table registros drop constraint if exists reg_placas_requeridas;
alter table registros add  constraint reg_placas_requeridas
    check (
        (placas is not null and btrim(placas) <> '')
        or sin_placas
        or origen_expediente <> 'satag'
    );

alter table estacionamientos
    add column if not exists cupo_lugares integer;

alter table estacionamientos drop constraint if exists est_cupo_positivo;
alter table estacionamientos add  constraint est_cupo_positivo
    check (cupo_lugares is null or cupo_lugares > 0);

comment on column estacionamientos.cupo_lugares is
    'Cuantos cajones tiene. NULL mientras nadie los haya contado: sin este dato la pantalla dice ocupacion pero no saturacion. Lectura publica, como el resto de la tabla.';


-- ---------------------------------------------------------------------
-- 2. EL RPC DE MIGRACION
--
-- Recibe expedientes ya normalizados y partidos por el cliente. Es
-- idempotente por `no_dispositivo`: una tarjeta que ya tiene expediente vivo
-- se salta y se cuenta, en vez de fallar la carga entera.
-- ---------------------------------------------------------------------
create or replace function migrar_expedientes(
    p_filas     jsonb,
    p_hecho_por text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $migrar$
declare
    v_quien   text;
    v_f       jsonb;
    v_id      uuid;
    v_folio   text;
    v_tag     text;
    v_altas   int := 0;
    v_saltados int := 0;
    v_est     text;
    v_saltadas jsonb := '[]'::jsonb;
    v_placa   text;
    v_placas_sueltas int := 0;
    v_nota    text;
begin
    perform panel_exigir_rol(array['ti']);

    if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
        raise exception 'El lote de expedientes no tiene el formato esperado.';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), auth.jwt() ->> 'email', 'TI');

    for v_f in select value from jsonb_array_elements(p_filas)
    loop
        v_tag := nullif(btrim(coalesce(v_f ->> 'noDispositivo', '')), '');

        -- QUE TARJETA NO SE VUELVE A MIGRAR. Dos casos, y el segundo costo un
        -- defecto encontrado en la base local antes de tocar produccion:
        --
        --   1. La que ya tiene expediente VIVO, venga de donde venga. Suele ser una
        --      reposicion anotada en la hoja como fila aparte.
        --   2. La que YA SE MIGRO, aunque haya entrado dada de baja. Mirando solo los
        --      vivos, reejecutar la carga duplicaba las 1,192 bajas —entraban otra
        --      vez porque ninguna bloqueaba— y la promesa de «se puede repetir sin
        --      miedo» se rompia justo ahi. Una carga que no se puede repetir no
        --      sirve, porque es exactamente lo que hace falta cuando algo sale a
        --      medias.
        --
        -- Lo que SI puede volver a migrarse es una tarjeta dada de baja por la
        -- operacion normal de SATAG: esa es una reasignacion de verdad.
        if v_tag is not null and exists (
            select 1 from registros
             where no_dispositivo = v_tag
               and (estado <> 'baja' or origen_expediente <> 'satag')
        ) then
            v_saltados := v_saltados + 1;
            v_saltadas := v_saltadas || to_jsonb(v_tag);
            continue;
        end if;

        -- LA PLACA SE SUELTA, EL EXPEDIENTE SE CONSERVA.
        --
        -- `uq_registros_placas_vigentes` exige placa unica entre expedientes
        -- vigentes, y el padron historico repite 43 placas en 90 expedientes: suele
        -- ser una familia con dos TAGs para el mismo coche, o una reposicion anotada
        -- como fila nueva. Entre perder el expediente y perder la placa se pierde la
        -- placa: el TAG es la identidad para el control de acceso y la placa es un
        -- atributo. Queda dicho en el expediente, asi que es un pendiente con nombre
        -- y no un dato que se evaporo.
        v_placa := nullif(btrim(coalesce(v_f ->> 'placas', '')), '');
        v_nota  := nullif(btrim(coalesce(v_f ->> 'observaciones', '')), '');

        if v_placa is not null
           and coalesce(nullif(btrim(v_f ->> 'estado'), ''), 'activo') <> 'baja'
           and exists (
               select 1 from registros
                where placas is not null and estado <> 'baja'
                  and upper(placas) = upper(v_placa)
           ) then
            v_nota := coalesce(v_nota || ' ', '') ||
                'La placa ' || v_placa || ' ya estaba en otro expediente vigente, asi que este quedo sin placa. Hay que revisar cual de los dos la tiene.';
            v_placa := null;
            v_placas_sueltas := v_placas_sueltas + 1;
        end if;

        v_folio := 'SATAG-' || lpad(nextval('registros_folio_seq')::text, 6, '0');

        insert into registros (
            folio, usuario_nombres, usuario_apellido_paterno, usuario_apellido_materno,
            gestionante_nombres, gestionante_apellido_paterno,
            tipo_usuario, marca, modelo, color, placas, sin_placas,
            no_dispositivo, procedencia_tag, estado,
            motivo_baja, fecha_baja,
            fecha_adquisicion, fecha_instalacion,
            origen_expediente, evidencia_aceptacion, observaciones
        )
        values (
            v_folio,
            coalesce(nullif(btrim(v_f ->> 'nombres'), ''), 'Sin registrar'),
            coalesce(nullif(btrim(v_f ->> 'apellidoPaterno'), ''), 'Sin registrar'),
            nullif(btrim(coalesce(v_f ->> 'apellidoMaterno', '')), ''),
            nullif(btrim(coalesce(v_f ->> 'gestionanteNombres', '')), ''),
            nullif(btrim(coalesce(v_f ->> 'gestionanteApellidoPaterno', '')), ''),
            coalesce(nullif(btrim(v_f ->> 'tipoUsuario'), ''), 'padres'),
            -- Marca, modelo y color son NOT NULL y no siempre existen. Se
            -- escribe «Sin registrar» y NO una cadena vacia ni un guion: un
            -- hueco declarado se puede buscar y completar; uno disimulado, no.
            coalesce(nullif(btrim(v_f ->> 'marca'), ''),  'Sin registrar'),
            coalesce(nullif(btrim(v_f ->> 'modelo'), ''), 'Sin registrar'),
            coalesce(nullif(btrim(v_f ->> 'color'), ''),  'Sin registrar'),
            v_placa,
            coalesce((v_f ->> 'sinPlacas')::boolean, false),
            v_tag,
            coalesce(nullif(btrim(v_f ->> 'procedenciaTag'), ''), 'escuela'),
            coalesce(nullif(btrim(v_f ->> 'estado'), ''), 'activo'),
            -- `reg_baja_coherente` exige motivo Y fecha cuando el estado es baja. Del
            -- padron historico se sabe QUE esta de baja pero casi nunca CUANDO, asi
            -- que se registra la fecha de la migracion y el motivo lo dice con todas
            -- sus letras. Poner una fecha inventada sin avisar seria peor que el
            -- hueco: alguien la leeria como el dia en que de verdad se dio de baja.
            case when coalesce(nullif(btrim(v_f ->> 'estado'), ''), 'activo') = 'baja'
                 then coalesce(nullif(btrim(v_f ->> 'motivoBaja'), ''),
                               'Ya estaba de baja al migrar el padron. La fecha real no consta en el origen; la que se registra es la de la migracion.')
                 else nullif(btrim(coalesce(v_f ->> 'motivoBaja', '')), '') end,
            case when coalesce(nullif(btrim(v_f ->> 'estado'), ''), 'activo') = 'baja'
                 then coalesce(nullif(v_f ->> 'fechaBaja', '')::date, current_date)
                 else nullif(v_f ->> 'fechaBaja', '')::date end,
            nullif(v_f ->> 'fechaAdquisicion', '')::date,
            nullif(v_f ->> 'fechaInstalacion', '')::date,
            coalesce(nullif(btrim(v_f ->> 'origen'), ''), 'migracion_hoja'),
            coalesce(nullif(btrim(v_f ->> 'evidencia'), ''), 'fisica'),
            v_nota
        )
        returning id into v_id;

        -- El derecho por pluma, si viene.
        for v_est in select jsonb_array_elements_text(coalesce(v_f -> 'estacionamientos', '[]'::jsonb))
        loop
            insert into registro_estacionamientos (registro_id, estacionamiento_clave)
            values (v_id, v_est)
            on conflict do nothing;
        end loop;

        -- La bitacora del expediente dice de donde vino. Un expediente que
        -- aparece sin historia es el que nadie sabe explicar en una auditoria.
        insert into movimientos (registro_id, tipo, fecha, motivo, hecho_por)
        values (
            v_id, 'alta', current_date,
            'Migracion del padron historico (bloque 79). Origen: ' ||
                coalesce(nullif(btrim(v_f ->> 'origen'), ''), 'migracion_hoja') ||
                '. La aceptacion del reglamento obra en fisico.',
            v_quien
        );

        v_altas := v_altas + 1;
    end loop;

    return jsonb_build_object(
        'altas', v_altas,
        'saltados', v_saltados,
        'tarjetasSaltadas', v_saltadas,
        'placasSueltas', v_placas_sueltas
    );
end;
$migrar$;

revoke all    on function migrar_expedientes(jsonb, text) from public;
grant  execute on function migrar_expedientes(jsonb, text) to authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- 3. VERIFICACION (solo lectura). `ok` en true en las ocho filas.
-- ---------------------------------------------------------------------
select 1 as orden,
       'registros tiene origen_expediente y evidencia_aceptacion' as que,
       (select string_agg(column_name, ', ' order by column_name)
          from information_schema.columns
         where table_schema = 'public' and table_name = 'registros'
           and column_name in ('origen_expediente','evidencia_aceptacion')) as valor,
       (select count(*) = 2
          from information_schema.columns
         where table_schema = 'public' and table_name = 'registros'
           and column_name in ('origen_expediente','evidencia_aceptacion')) as ok
union all
select 2, 'todos los expedientes de hoy quedaron marcados como satag',
       (select count(*)::text from registros where origen_expediente = 'satag'),
       (select count(*) = 0 from registros where origen_expediente <> 'satag')
union all
select 3, 'el catalogo de origen admite los tres valores y nada mas',
       (select pg_get_constraintdef(c.oid) from pg_constraint c
          join pg_class t on t.oid = c.conrelid
         where t.relname = 'registros' and c.conname = 'reg_origen_expediente_valido'),
       (select bool_and(pg_get_constraintdef(c.oid) like '%' || v || '%')
          from pg_constraint c
          join pg_class t on t.oid = c.conrelid
          cross join unnest(array['satag','migracion_hoja','migracion_zk']) as v
         where t.relname = 'registros' and c.conname = 'reg_origen_expediente_valido')
union all
select 4, 'estacionamientos tiene cupo_lugares y esta vacio',
       (select string_agg(clave || '=' || coalesce(cupo_lugares::text, 'sin contar'), ', ' order by clave)
          from estacionamientos),
       (select count(*) = 1
          from information_schema.columns
         where table_schema = 'public' and table_name = 'estacionamientos'
           and column_name = 'cupo_lugares')
union all
select 5, 'la unicidad del TAG vivo sigue en pie',
       null,
       (select count(*) = 1 from pg_indexes
         where schemaname = 'public' and tablename = 'registros'
           and indexname = 'uq_registros_no_dispositivo_activo')
union all
select 6, 'hay una sola forma de migrar_expedientes y es security definer',
       (select count(*)::text from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'migrar_expedientes'),
       (select count(*) = 1 and bool_and(p.prosecdef)
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'migrar_expedientes')
union all
select 7, 'un alta normal SIGUE exigiendo placa; el hueco solo se permite a los migrados',
       (select pg_get_constraintdef(c.oid) from pg_constraint c
          join pg_class t on t.oid = c.conrelid
         where t.relname = 'registros' and c.conname = 'reg_placas_requeridas'),
       (select pg_get_constraintdef(c.oid) like '%origen_expediente%'
          from pg_constraint c join pg_class t on t.oid = c.conrelid
         where t.relname = 'registros' and c.conname = 'reg_placas_requeridas')
union all
select 8, 'ningun expediente migrado tiene aceptacion electronica inventada',
       null,
       (select count(*) = 0
          from registros r
          left join aceptaciones a on a.registro_id = r.id
         where r.origen_expediente <> 'satag'
           and r.evidencia_aceptacion = 'electronica'
           and a.id is null)
order by orden;


-- ---------------------------------------------------------------------
-- EN PANTALLA (no es opcional)
--   Con la cuenta de TI (rol ti, NO super):
--     1. Migrar un lote chico primero —diez expedientes— y abrir uno en
--        Consulta: tiene que verse completo, con su folio, su vehiculo y su
--        movimiento de alta que dice de donde vino.
--     2. La seccion de firma tiene que DECLARAR que la aceptacion obra en
--        fisico, no mostrar un hueco.
--     3. Volver a migrar EL MISMO lote: `altas` = 0 y `saltados` = 10.
--     4. Finanzas: el corte no debe cambiar ni un peso.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- ROLLBACK (comentado). En este orden.
--
--   -- 1. Borrar lo migrado. SOLO lo migrado: el filtro es la red.
--   delete from movimientos where registro_id in
--       (select id from registros where origen_expediente <> 'satag');
--   delete from registro_estacionamientos where registro_id in
--       (select id from registros where origen_expediente <> 'satag');
--   delete from registros where origen_expediente <> 'satag';
--
--   -- 2. Quitar la funcion y las columnas.
--   drop function if exists migrar_expedientes(jsonb, text);
--   alter table registros drop constraint if exists reg_origen_expediente_valido;
--   alter table registros drop constraint if exists reg_evidencia_aceptacion_valida;
--   alter table registros drop column if exists origen_expediente;
--   alter table registros drop column if exists evidencia_aceptacion;
--   alter table estacionamientos drop constraint if exists est_cupo_positivo;
--   alter table estacionamientos drop column if exists cupo_lugares;
--   notify pgrst, 'reload schema';
--
-- PRECONDICION: comprobar que ningun expediente migrado ya cobro o firmo,
-- porque entonces dejo de ser migrado y borrarlo perderia trabajo real:
--
--   select count(*) from registros r
--     join pagos p on p.registro_id = r.id
--    where r.origen_expediente <> 'satag';     -- debe ser 0
--   select count(*) from registros r
--     join aceptaciones a on a.registro_id = r.id
--    where r.origen_expediente <> 'satag';     -- debe ser 0
-- ---------------------------------------------------------------------
