-- =====================================================================
-- 63_tipo_otro_y_apellidos_alumno.sql   (junta 9-sep: quien mas maneja)
--
-- Hoy el expediente solo admite cuatro tipos de usuario: maestro, padres,
-- alumno y admin. Quien recoge al alumno muy seguido no es ninguno de los
-- cuatro —la tia, el abuelo, el chofer de la familia— y en el alta acaba
-- eligiendo "padres" porque no hay otra casilla. El dato queda mal desde
-- el origen: Administracion cobra la cuota equivocada y el padron miente
-- sobre quien entra al estacionamiento.
--
-- Este bloque abre el quinto tipo, 'otro', y le pide a quien lo elige que
-- diga su parentesco con la familia en TEXTO LIBRE. El texto libre es una
-- decision, no un descuido (Gerardo, 11-sep): todavia no se sabe que
-- parentescos aparecen de verdad, y un catalogo inventado hoy obligaria a
-- un bloque nuevo la primera vez que llegue uno que no esta en la lista.
-- Cuando el uso real muestre el patron, ese catalogo se hace con datos.
--
-- De paso empieza a cerrar el hueco hermano: los apellidos de la familia
-- —el dato con el que la escuela coteja contra su lista de inscritos— hoy
-- solo se exigen cuando el tipo es 'padres'. Un familiar y un alumno
-- tambien tienen que declararlos, o el cotejo no se puede hacer justo en
-- los dos casos donde mas falta hace. ESTE bloque se los exige a 'otro'.
-- A 'alumno' se los exige el BLOQUE 65, que se aplica despues del deploy
-- del cliente: exigirlos aqui tumbaria las altas de alumno del sitio en
-- vivo (ver ORDEN Y DESPLIEGUE).
--
--
-- QUE HACE, EN ORDEN:
--   1. Columna nueva `registros.parentesco_otro` (PII), nullable y de
--      texto libre a proposito.
--   2. Ensancha el CHECK `reg_tipo_usuario_valido` a los cinco valores.
--   3. `crear_registro`: pasa de 27 a 28 parametros (`p_parentesco_otro`
--      AL FINAL). CAMBIA LA FIRMA, asi que lleva la receta completa de la
--      trampa PostgREST: drop con los 27 tipos viejos (y con los 28, si
--      ya existe), create, volver a emitir revoke/grant y notify. Admite
--      'otro', exige los apellidos de familia a 'padres' y a 'otro' (a
--      'alumno' todavia NO: bloque 65), exige el parentesco cuando el
--      tipo es 'otro', lo guarda saneado y lo mete al payload sellado, que
--      sube a `satag.acceptance.v2`.
--   4. `registrar_pago`: pasa de 4 a 5 parametros (`p_parentesco_otro`
--      AL FINAL). CAMBIA LA FIRMA: la misma receta del paso 3. Admite
--      'otro' y, cuando es el tipo confirmado, exige que haya parentesco
--      —el que manda la caja o el que ya traia el expediente— y deja
--      anotada en `movimientos` la correccion si la caja lo cambia.
--   5. `capturar_expediente_ti`: la misma lista. MISMA firma.
--   6. Verificacion, solo lectura.
--
--
-- POR QUE ENSANCHAR EL CHECK NO REPITE EL INCIDENTE DEL 10-SEP
--
-- El 10-sep un CHECK congelo el padron en produccion (ver el bloque 58):
-- aquel agregaba una EXIGENCIA NUEVA —«si el tipo es padres, la columna
-- de apellidos no puede estar vacia»— sobre filas que no la cumplian, y
-- como el CHECK se evalua en cada update sobre la fila nueva completa,
-- todo expediente que ya existia sin ese dato quedo imposible de tocar.
--
-- Aqui pasa lo contrario. El conjunto permitido pasa de cuatro valores a
-- cinco: toda fila que cumplia el CHECK viejo cumple el nuevo, porque el
-- nuevo permite MAS, no menos. No hay una sola fila del padron a la que
-- se le pida algo que antes no se le pedia, asi que no hay expediente que
-- se pueda congelar. Por eso mismo tampoco se usa `not valid`: la
-- revision retroactiva no puede fallar, y saltarsela solo dejaria la
-- restriccion marcada como no validada sin ganar nada. (Ademas `not
-- valid` no exime de nada a los updates: esa fue justo la creencia falsa
-- que costo el incidente.)
--
--
-- POR QUE EL PAYLOAD SUBE A 'satag.acceptance.v2'
--
-- Los bloques 55 y 58 dejaron `apellidos_familia` EXPRESAMENTE fuera del
-- payload sellado para no cambiar lo que significa la etiqueta v1. Ese
-- criterio se respeta aqui, y por eso mismo `parentesco_otro`, que SI
-- entra al payload, obliga a subir la etiqueta: si se agregara un campo
-- conservando 'satag.acceptance.v1', esa etiqueta significaria dos
-- conjuntos de campos distintos segun la fecha de la firma. El payload es
-- la evidencia que sostiene la firma electronica frente a un abogado, y
-- una etiqueta que dice dos cosas a la vez es exactamente lo que un
-- abogado contrario necesita. Subirla es la operacion honesta: las
-- aceptaciones ya firmadas conservan su v1 intacta —no se les toca un
-- byte— y las nuevas declaran v2.
--
-- YA SE VERIFICO, no hace falta volver a investigarlo:
--   - Ningun codigo valida la etiqueta. La verificacion de integridad
--     recalcula digest(convert_to(hash_payload::text,'UTF8'),'sha256')
--     sobre el payload GUARDADO, que es autodescriptivo; por eso toda
--     firma vieja sigue verificando igual despues de este bloque.
--   - El documento legal VIGENTE (Entregables/E6 - Cumplimiento Legal y
--     Privacidad/E6 - Fundamento legal y confiabilidad de la firma
--     electronica.md) describe el paquete sellado en prosa y NO cita la
--     etiqueta, asi que no hay que tocarlo. La unica version que la cita
--     es la archivada en _historico/, que esta congelada a proposito.
--
-- A PARTIR DE ESTE BLOQUE CONVIVEN DOS ESQUEMAS EN `aceptaciones`: v1 en
-- todo lo firmado hasta hoy, v2 de aqui en adelante. Eso es correcto y
-- deliberado, no un error de migracion: quien lea la tabla dentro de un
-- ano vera las dos etiquetas y debe leerlas como lo que son, el registro
-- honesto de que el documento firmado cambio de contenido en esta fecha.
--
-- LA ASIMETRIA QUE QUEDA, escrita para que no parezca capricho:
--   - `parentesco_otro` SI viaja sellado. Es una declaracion DEL PROPIO
--     TITULAR sobre quien es el frente a la familia, hermana de
--     `gestionante_relacion`, que ya viaja en el payload desde el origen.
--   - `apellidos_familia` NO viaja sellado. Es un dato de cotejo
--     administrativo que produce la escuela contra su lista de inscritos,
--     no algo que el titular declare y acepte. Mismo criterio del 55.
--
--
-- ORDEN Y DESPLIEGUE  —  LEALO ANTES DE PEGAR NADA
--
-- El cambio completo son TRES bloques y UN deploy, en este orden exacto:
--
--   1. Bloque 63 (este). Retrocompatible con el sitio publicado hoy.
--   2. Bloque 64, aviso de privacidad v6. Tambien retrocompatible: el
--      cliente viejo lee de la base el aviso vigente, sea cual sea.
--   3. Deploy del cliente nuevo (formulario con 'otro', parentesco y
--      apellidos para alumno; panel que confirma el parentesco al cobrar).
--   4. Bloque 65. UNICAMENTE con el cliente nuevo publicado y verificado.
--
-- POR QUE ESTE BLOQUE NO EXIGE LOS APELLIDOS A 'alumno'. El formulario
-- PUBLICADO hoy manda apellidos_familia = null en toda alta que no sea de
-- 'padres' (app/registro/page.tsx), y fuerza el tipo a 'alumno' en cuanto
-- se marca "El conductor es menor de edad". Exigirlos aqui a 'alumno'
-- haria que el sitio en vivo rechazara TODA alta de alumno —justo el caso
-- mas comun— desde el momento de pegar el bloque hasta que el bundle
-- nuevo llegara a cada navegador. Exigirselos a 'otro', en cambio, no le
-- cuesta nada a nadie: el cliente publicado ni siquiera puede producir
-- ese tipo.
--
-- LO QUE SI ES VERDAD DE APLICAR ESTE BLOQUE ANTES DEL DEPLOY:
--   - El formulario publicado sigue dando de alta a padres, maestros,
--     alumnos y administrativos igual que hoy: las exigencias nuevas solo
--     alcanzan al tipo 'otro', que ese formulario no ofrece, y el
--     parametro nuevo va al final con default null.
--   - El panel publicado sigue cobrando igual: llama a registrar_pago por
--     argumentos nombrados y no manda el parametro nuevo.
--   - Toda alta que entre desde este momento sella 'satag.acceptance.v2',
--     aunque venga del formulario viejo (con parentesco_otro en null).
--   - Los PASOS 3 y 4 hacen drop + create. Pegue cada uno COMPLETO, de un
--     tiron: corrido a pedazos, entre el drop y el create la funcion no
--     existe y el alta o el cobro que caiga en ese hueco falla.
--   - Al reves NO funciona: el cliente nuevo manda p_parentesco_otro y,
--     contra las firmas viejas, PostgREST no encuentra la funcion. Por eso
--     este bloque va ANTES del deploy, nunca despues.
--   - Si una version ANTERIOR de este bloque llego a aplicarse (la que
--     exigia apellidos a 'alumno'; ver
--     supabase/manual/2026-09-11_URGENTE_alumno_sin_apellidos_familia.sql),
--     este bloque se puede volver a correr COMPLETO encima: los PASOS 1 y
--     2 son idempotentes, y los drops de 3a y 4a quitan tambien las firmas
--     de 28 y 5 parametros antes de recrearlas. El PASO 3 deja la regla de
--     apellidos en ('padres','otro'), igual que ese script urgente.
--   - El aviso v5 no menciona el parentesco ni pide apellidos a alumnos,
--     pero con el cliente viejo ninguna alta produce esos datos todavia.
--     El bloque 64 tiene que estar aplicado antes de que el cliente nuevo
--     empiece a recabarlos.
--
-- Depende de: 12 (tabla y CHECK), 55 parte A (columna y parametro 27),
-- 58 y 62 (cuerpo vigente de crear_registro), 46 y 50 (firma y cuerpo
-- vigentes de registrar_pago) y 53 (capturar_expediente_ti).
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 1 - La columna. Nullable: solo los expedientes de tipo 'otro' la
-- llevan. Texto libre por decision, ver el encabezado.
-- ---------------------------------------------------------------------
alter table registros add column if not exists parentesco_otro text;

comment on column registros.parentesco_otro is 'PII (LFPDPPP). Parentesco declarado con la familia del alumno cuando tipo_usuario = otro (tio, abuelo, chofer...). TEXTO LIBRE A PROPOSITO (decision del 11-sep, bloque 63): aun no se sabe que parentescos aparecen de verdad y un catalogo inventado obligaria a un bloque nuevo en cuanto llegue uno fuera de la lista; se cataloga cuando el uso real muestre el patron. Obligatorio EN EL ALTA, exigido dentro de crear_registro, y AL COBRAR cuando la caja confirma el tipo otro, exigido dentro de registrar_pago (que tambien lo corrige y lo anota en movimientos)';


-- ---------------------------------------------------------------------
-- PASO 2 - El CHECK, de cuatro valores a cinco. Ensanchar el conjunto
-- permitido no le exige nada nuevo a ninguna fila existente: toda fila
-- que cumplia el CHECK viejo cumple el nuevo. Sin `not valid` a
-- proposito (ver el encabezado).
-- ---------------------------------------------------------------------
alter table registros
    drop constraint if exists reg_tipo_usuario_valido;

alter table registros
    add constraint reg_tipo_usuario_valido
    check (tipo_usuario in ('maestro','padres','alumno','admin','otro'));


-- ---------------------------------------------------------------------
-- PASO 3 - crear_registro: de 27 a 28 parametros.
--
-- *** CAMBIA LA FIRMA. `create or replace` NO SIRVE AQUI: crearia una
-- SEGUNDA funcion sobrecargada y dejaria viva la de 27 parametros, que es
-- exactamente la trampa PostgREST que este proyecto vigila en cada
-- bloque (PostgREST anunciaria las dos y serviria la que se le antoje).
-- Va la receta completa del bloque 55: drop con la lista de 27 tipos,
-- create con 28, revoke/grant otra vez —los grants se van con el drop— y
-- notify al final. ***
--
-- El cuerpo es el VIGENTE del bloque 62, linea por linea; los deltas van
-- marcados con "NUEVO 63".
-- ---------------------------------------------------------------------

-- 3a) Fuera la firma vieja. Con la lista COMPLETA de 27 tipos: un
--     `drop function crear_registro` a secas no sabe cual sobrecarga
--     quitar.
drop function if exists crear_registro(
    text, text, text, text, text, text, text, boolean, text,
    text, text, text, text, text, text, boolean, text, jsonb, text, inet, text, jsonb, text, text, uuid, uuid, text
);
--     Y tambien la de 28, si ya existe: si una version anterior de este
--     bloque llego a aplicarse, la funcion ya tiene 28 parametros y el
--     `create function` de 3b fallaria con "ya existe". Tirarla y
--     recrearla en el mismo paso deja la base igual que si partiera de la
--     de 27, con los grants re-emitidos en 3c. Por eso el paso se puede
--     volver a correr completo.
drop function if exists crear_registro(
    text, text, text, text, text, text, text, boolean, text,
    text, text, text, text, text, text, boolean, text, jsonb, text, inet, text, jsonb, text, text, uuid, uuid, text, text
);


-- 3b) La funcion nueva.
create function crear_registro(
    p_usuario_nombres              text,
    p_usuario_apellido_paterno     text,
    p_tipo_usuario                 text,
    p_marca                        text,
    p_modelo                       text,
    p_color                        text,
    p_placas                       text,
    p_sin_placas                   boolean,
    p_firma_url                    text,
    p_usuario_apellido_materno     text default null,
    p_firmante_nombre              text default null,
    p_gestionante_nombres          text default null,
    p_gestionante_apellido_paterno text default null,
    p_gestionante_apellido_materno text default null,
    p_gestionante_relacion         text default null,
    p_usuario_es_menor             boolean default false,
    p_firmante_rol                 text default 'usuario',
    p_firma_trazos                 jsonb default null,
    p_firma_imagen_sha256          text default null,
    p_ip_origen                    inet default null,
    p_user_agent                   text default null,
    p_metadata                     jsonb default '{}'::jsonb,
    p_procedencia_tag              text default 'escuela',
    p_observaciones                text default null,
    p_reglamento_version_id        uuid default null,
    p_aviso_version_id             uuid default null,
    p_apellidos_familia            text default null,
    -- NUEVO 63: parametro 28, AL FINAL y con default null, igual que el 27
    -- en el bloque 55. Asi el cliente publicado hoy sigue dando de alta sin
    -- cambiar nada; lo unico que no puede hacer es elegir el tipo 'otro'.
    -- (Eso vale mientras la exigencia de apellidos no alcance a 'alumno':
    -- ver el encabezado y el bloque 65.)
    p_parentesco_otro              text default null
) returns jsonb
language plpgsql
security definer
-- extensions: en Supabase pgcrypto (digest) vive en el schema extensions.
set search_path = public, extensions
as $$
declare
    v_registro_id uuid;
    v_folio text;
    v_reglamento_version_id uuid;
    v_reglamento_version int;
    v_reglamento_contenido text;
    v_aviso_version_id uuid;
    v_aviso_version int;
    v_aviso_contenido text;
    v_usuario_nombre_completo text;
    v_gestionante_nombre_completo text;
    v_firmante_nombre text;
    v_firmante_rol text;
    v_apellidos_familia text;
    v_parentesco_otro text;             -- NUEVO 63
    v_placas text;                      -- 62: normalizada una sola vez
    v_sello_tiempo timestamptz := clock_timestamp();
    v_hash_payload jsonb;
    v_hash_documento text;
    v_headers json;
    v_xff text;
    v_ip_origen inet;
    v_user_agent text;
begin
    if p_reglamento_version_id is null then
        raise exception 'No se recibio la version del reglamento mostrada en pantalla. Recargue la pagina e intente de nuevo.';
    end if;
    select id, version, contenido
      into v_reglamento_version_id, v_reglamento_version, v_reglamento_contenido
      from reglamento_versiones
     where id = p_reglamento_version_id;
    if v_reglamento_version_id is null then
        raise exception 'La version de reglamento indicada no existe';
    end if;

    if p_aviso_version_id is null then
        raise exception 'No se recibio la version del aviso de privacidad mostrada en pantalla. Recargue la pagina e intente de nuevo.';
    end if;
    select id, version, contenido
      into v_aviso_version_id, v_aviso_version, v_aviso_contenido
      from aviso_versiones
     where id = p_aviso_version_id;
    if v_aviso_version_id is null then
        raise exception 'La version de aviso de privacidad indicada no existe';
    end if;

    if coalesce(btrim(p_usuario_nombres),'') = '' then
        raise exception 'El nombre (usuario_nombres) es obligatorio';
    end if;
    if coalesce(btrim(p_usuario_apellido_paterno),'') = '' then
        raise exception 'El apellido paterno del usuario es obligatorio';
    end if;
    -- NUEVO 63: quinto tipo. El CHECK del PASO 2 ya lo admite en la tabla.
    if p_tipo_usuario not in ('maestro','padres','alumno','admin','otro') then
        raise exception 'tipo_usuario invalido: %', p_tipo_usuario;
    end if;
    if coalesce(btrim(p_modelo),'') = '' then
        raise exception 'El modelo del vehiculo es obligatorio';
    end if;
    if (p_placas is null or btrim(p_placas) = '') and not coalesce(p_sin_placas,false) then
        raise exception 'Debe capturar placas o marcar sin_placas';
    end if;

    -- 62: normalizada UNA SOLA VEZ. De aqui en adelante, tanto el insert
    -- como el hash_payload usan esta misma variable.
    v_placas := nullif(upper(btrim(coalesce(p_placas,''))), '');

    -- 62: aviso temprano, ANTES de gastar un folio de la secuencia
    -- (registros_folio_seq no se revierte con un rollback). El indice
    -- unico uq_registros_placas_vigentes es quien de verdad lo garantiza
    -- si dos altas llegan al mismo tiempo; ver el "exception when
    -- unique_violation" mas abajo, junto al insert.
    if v_placas is not null and exists (
        select 1 from registros where upper(placas) = v_placas and estado <> 'baja'
    ) then
        raise exception 'Las placas % ya estan registradas en otro expediente. Si el vehiculo cambio de titular, solicite primero la baja del expediente anterior.', v_placas;
    end if;

    if coalesce(btrim(p_firma_url),'') = '' then
        raise exception 'Falta la firma (firma_url)';
    end if;
    if p_firma_imagen_sha256 is not null and p_firma_imagen_sha256 !~ '^[0-9a-f]{64}$' then
        raise exception 'firma_imagen_sha256 debe ser SHA-256 en hexadecimal';
    end if;
    if coalesce(btrim(p_gestionante_nombres),'') <> ''
       and coalesce(btrim(p_gestionante_apellido_paterno),'') = '' then
        raise exception 'El gestionante requiere apellido paterno';
    end if;
    if coalesce(p_usuario_es_menor,false) and (
        coalesce(btrim(p_gestionante_nombres),'') = '' or
        coalesce(btrim(p_gestionante_apellido_paterno),'') = '' or
        p_gestionante_relacion not in ('padre','madre','tutor')
    ) then
        raise exception 'Un usuario menor requiere gestionante padre, madre o tutor con nombre y apellido paterno';
    end if;
    -- NUEVO 63: el cotejo contra la lista de inscritos ya no es solo de
    -- 'padres'. Un familiar es justo el caso donde el apellido del
    -- conductor NO coincide con el de la familia, que es el motivo por el
    -- que Administracion pidio el dato (junta del 9-sep).
    -- 'alumno' NO va en esta lista todavia, a proposito: el formulario
    -- publicado manda null a todo alumno y lo rechazaria en vivo. Lo agrega
    -- el bloque 65, despues del deploy (ver el encabezado).
    if p_tipo_usuario in ('padres','otro')
       and coalesce(btrim(coalesce(p_apellidos_familia,'')),'') = '' then
        -- «Recargue la pagina», no «complete el dato»: el unico modo de que
        -- este mensaje llegue a una pantalla es que el navegador haya servido
        -- una version vieja del formulario, y esa version NO tiene el campo.
        raise exception 'No se recibieron los apellidos de la familia, que son obligatorios cuando el registro es de un padre o una madre o de otro familiar. Recargue la pagina e intente de nuevo.';
    end if;
    -- NUEVO 63: 'otro' sin parentesco no sirve de nada. El tipo existe
    -- justamente para saber quien es esa persona; sin el texto, el
    -- expediente quedaria peor que si hubiera elegido 'padres'.
    if p_tipo_usuario = 'otro'
       and coalesce(btrim(coalesce(p_parentesco_otro,'')),'') = '' then
        raise exception 'Indique su parentesco con la familia (tio, abuelo, etcetera): es obligatorio cuando el registro no es de un padre o una madre, de un alumno, de un maestro ni del personal.';
    end if;

    v_usuario_nombre_completo := btrim(
        btrim(p_usuario_nombres) || ' ' || btrim(p_usuario_apellido_paterno) ||
        coalesce(' ' || nullif(btrim(coalesce(p_usuario_apellido_materno,'')), ''), '')
    );
    if coalesce(btrim(p_gestionante_nombres),'') = '' then
        v_gestionante_nombre_completo := null;
    else
        v_gestionante_nombre_completo := btrim(
            btrim(p_gestionante_nombres) ||
            coalesce(' ' || nullif(btrim(coalesce(p_gestionante_apellido_paterno,'')), ''), '') ||
            coalesce(' ' || nullif(btrim(coalesce(p_gestionante_apellido_materno,'')), ''), '')
        );
    end if;

    v_firmante_nombre := coalesce(nullif(btrim(coalesce(p_firmante_nombre,'')), ''), v_usuario_nombre_completo);
    v_firmante_rol := coalesce(p_firmante_rol, 'usuario');
    v_apellidos_familia := nullif(btrim(coalesce(p_apellidos_familia,'')), '');
    -- NUEVO 63: mismo saneo que el resto del expediente, para que "vacio"
    -- tenga una sola representacion y mandar "   " no burle la validacion
    -- de arriba, que usa el mismo btrim.
    v_parentesco_otro := nullif(btrim(coalesce(p_parentesco_otro,'')), '');

    v_headers := nullif(current_setting('request.headers', true), '')::json;
    v_user_agent := coalesce(
        nullif(btrim(coalesce(v_headers ->> 'user-agent', '')), ''),
        nullif(btrim(coalesce(p_user_agent, '')), '')
    );
    v_xff := btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1));
    begin
        v_ip_origen := nullif(v_xff, '')::inet;
    exception when others then
        v_ip_origen := null;
    end;
    v_ip_origen := coalesce(v_ip_origen, p_ip_origen);

    v_folio := 'SATAG-' || lpad(nextval('registros_folio_seq')::text, 6, '0');

    begin
        insert into registros (
            folio,
            usuario_nombres, usuario_apellido_paterno, usuario_apellido_materno,
            gestionante_nombres, gestionante_apellido_paterno, gestionante_apellido_materno,
            gestionante_relacion, usuario_es_menor,
            tipo_usuario, procedencia_tag, marca, modelo, color, placas, sin_placas,
            apellidos_familia,
            parentesco_otro,
            observaciones, estado
        ) values (
            v_folio,
            btrim(p_usuario_nombres),
            btrim(p_usuario_apellido_paterno),
            nullif(btrim(coalesce(p_usuario_apellido_materno,'')), ''),
            nullif(btrim(coalesce(p_gestionante_nombres,'')), ''),
            nullif(btrim(coalesce(p_gestionante_apellido_paterno,'')), ''),
            nullif(btrim(coalesce(p_gestionante_apellido_materno,'')), ''),
            nullif(btrim(coalesce(p_gestionante_relacion,'')), ''),
            coalesce(p_usuario_es_menor, false),
            p_tipo_usuario,
            coalesce(p_procedencia_tag,'escuela'),
            btrim(p_marca),
            btrim(p_modelo),
            btrim(p_color),
            v_placas,
            coalesce(p_sin_placas, false),
            v_apellidos_familia,
            v_parentesco_otro,          -- NUEVO 63
            nullif(btrim(coalesce(p_observaciones,'')), ''),
            'pendiente'
        ) returning id into v_registro_id;
    exception when unique_violation then
        raise exception 'Las placas % ya estan registradas en otro expediente. Si el vehiculo cambio de titular, solicite primero la baja del expediente anterior.', v_placas;
    end;

    -- NUEVO 63: el payload sube a v2 porque gana un campo (parentesco_otro).
    -- Ver el encabezado: una etiqueta no puede significar dos conjuntos de
    -- campos distintos segun la fecha. Las aceptaciones ya firmadas
    -- conservan su v1 y siguen verificando igual.
    -- `apellidos_familia` sigue FUERA a proposito (bloques 55 y 58): es
    -- cotejo administrativo de la escuela, no una declaracion del titular.
    v_hash_payload := jsonb_build_object(
        'schema', 'satag.acceptance.v2',
        'sello_tiempo', v_sello_tiempo,
        'reglamento', jsonb_build_object(
            'id', v_reglamento_version_id,
            'version', v_reglamento_version,
            'contenido_sha256', encode(digest(v_reglamento_contenido, 'sha256'), 'hex')
        ),
        'aviso_privacidad', jsonb_build_object(
            'id', v_aviso_version_id,
            'version', v_aviso_version,
            'contenido_sha256', encode(digest(v_aviso_contenido, 'sha256'), 'hex')
        ),
        'registro', jsonb_build_object(
            'id', v_registro_id,
            'folio', v_folio,
            'usuario_nombres', btrim(p_usuario_nombres),
            'usuario_apellido_paterno', btrim(p_usuario_apellido_paterno),
            'usuario_apellido_materno', nullif(btrim(coalesce(p_usuario_apellido_materno,'')), ''),
            'usuario_nombre_completo', v_usuario_nombre_completo,
            'gestionante_nombres', nullif(btrim(coalesce(p_gestionante_nombres,'')), ''),
            'gestionante_apellido_paterno', nullif(btrim(coalesce(p_gestionante_apellido_paterno,'')), ''),
            'gestionante_apellido_materno', nullif(btrim(coalesce(p_gestionante_apellido_materno,'')), ''),
            'gestionante_nombre_completo', v_gestionante_nombre_completo,
            'gestionante_relacion', nullif(btrim(coalesce(p_gestionante_relacion,'')), ''),
            'usuario_es_menor', coalesce(p_usuario_es_menor, false),
            'tipo_usuario', p_tipo_usuario,
            -- Con la variable ya saneada, no recalculando la expresion: es el
            -- mismo criterio por el que el 62 metio v_placas. Lo sellado y lo
            -- guardado tienen que ser el mismo texto, byte por byte.
            'parentesco_otro', v_parentesco_otro,
            'marca', btrim(p_marca),
            'modelo', btrim(p_modelo),
            'color', btrim(p_color),
            'placas', v_placas,
            'sin_placas', coalesce(p_sin_placas, false),
            'procedencia_tag', coalesce(p_procedencia_tag,'escuela')
        ),
        'firmante', jsonb_build_object(
            'nombre', v_firmante_nombre,
            'rol', v_firmante_rol
        ),
        'aceptacion', jsonb_build_object(
            'acepto_reglamento', true,
            'acepto_privacidad', true,
            'ip_origen', v_ip_origen,
            'user_agent', v_user_agent,
            'metadata', coalesce(p_metadata, '{}'::jsonb)
        ),
        'firma', jsonb_build_object(
            'ruta_storage', btrim(p_firma_url),
            'imagen_sha256', p_firma_imagen_sha256,
            'trazos', p_firma_trazos
        )
    );

    v_hash_documento := encode(digest(convert_to(v_hash_payload::text, 'UTF8'), 'sha256'), 'hex');

    insert into aceptaciones (
        registro_id, reglamento_version_id, aviso_version_id,
        firma_url, firma_imagen_sha256, firma_trazos,
        firmante_nombre, firmante_rol,
        acepto_reglamento, acepto_privacidad, ip_origen, user_agent, metadata,
        hash_algoritmo, hash_documento, hash_payload, sello_tiempo
    ) values (
        v_registro_id, v_reglamento_version_id, v_aviso_version_id,
        btrim(p_firma_url), p_firma_imagen_sha256, p_firma_trazos,
        v_firmante_nombre, v_firmante_rol,
        true, true, v_ip_origen, v_user_agent,
        coalesce(p_metadata, '{}'::jsonb),
        'sha256', v_hash_documento, v_hash_payload, v_sello_tiempo
    );

    insert into movimientos (registro_id, tipo, motivo, hecho_por)
    values (v_registro_id, 'alta', 'Alta por autoservicio', 'autoservicio');

    -- anon no puede leer registros (RLS): el RPC devuelve id + folio + estado.
    return jsonb_build_object(
        'id', v_registro_id,
        'folio', v_folio,
        'estado', 'pendiente'
    );
end;
$$;


-- 3c) Los permisos, otra vez. El drop de 3a se los llevo, y una funcion
--     recien creada solo la puede ejecutar su dueno: sin esto el
--     formulario publico responde "permission denied". La lista es la
--     NUEVA, de 28 tipos, y los roles son los MISMOS del bloque 55.
revoke all on function crear_registro(
    text, text, text, text, text, text, text, boolean, text,
    text, text, text, text, text, text, boolean, text, jsonb, text, inet, text, jsonb, text, text, uuid, uuid, text, text
) from public;
grant execute on function crear_registro(
    text, text, text, text, text, text, text, boolean, text,
    text, text, text, text, text, text, boolean, text, jsonb, text, inet, text, jsonb, text, text, uuid, uuid, text, text
) to anon, authenticated;


-- 3d) PostgREST cachea las firmas: sin esto sigue anunciando la de 27
--     parametros y rechaza el argumento nuevo como desconocido.
notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- PASO 4 - registrar_pago: los cinco tipos y el parentesco.
--
-- Sin esto Administracion no podria confirmar el tipo 'otro' al cobrar y
-- el expediente quedaria atorado en caja: el RPC rechaza cualquier tipo
-- que no este en su lista, y el cobro es el paso que sigue al alta.
--
-- Y admitir 'otro' no basta. Si la caja pudiera corregir un expediente a
-- 'otro' sin decir el parentesco, el sistema fabricaria justo el
-- expediente que crear_registro rechaza, y ninguna pantalla podria
-- repararlo despues. Por eso el RPC gana `p_parentesco_otro`: cuando el
-- tipo confirmado es 'otro' exige que haya parentesco —el que manda la
-- caja o, si no manda ninguno, el que ya traia el expediente—, y si la
-- caja lo cambia, lo guarda y lo anota en `movimientos` igual que ya
-- anota la correccion del tipo.
--
-- *** CAMBIA LA FIRMA, de 4 a 5 parametros. Misma receta que el PASO 3:
-- drop con los 4 tipos de la firma vigente (bloque 46, cuerpo del 50),
-- create, revoke/grant a los MISMOS roles de hoy —solo `authenticated`,
-- como dejo el bloque 46— y notify al final. ***
--
-- RETROCOMPATIBLE: el panel publicado llama por argumentos nombrados
-- (lib/supabase/apiPanel.ts) y no manda el parametro nuevo, que va al
-- final con default null. Sigue cobrando igual.
--
-- El cuerpo es el VIGENTE del bloque 50, linea por linea; los deltas van
-- marcados con "NUEVO 63". Pegue este paso COMPLETO, de un tiron.
-- ---------------------------------------------------------------------

-- 4a) Fuera la firma vieja, con sus 4 tipos exactos. Y la de 5 si ya
--     existe, por el mismo motivo que en 3a: que el paso se pueda volver a
--     correr completo sin que el create de 4b choque con "ya existe".
drop function if exists registrar_pago(uuid, numeric, text, text);
drop function if exists registrar_pago(uuid, numeric, text, text, text);


-- 4b) La funcion nueva.
create function registrar_pago(
    p_registro_id     uuid,
    p_monto           numeric,
    p_cobrado_por     text default null,   -- conservado por compatibilidad; se ignora
    p_tipo_usuario    text default null,
    -- NUEVO 63: AL FINAL y con default null, para que el panel publicado,
    -- que no lo manda, siga cobrando igual.
    p_parentesco_otro text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_estado            text;
    v_tipo_actual       text;
    v_es_menor          boolean;
    v_tipo              text;
    v_quien             text;
    v_folio             text;
    v_corregido         boolean := false;
    v_parentesco_actual text;               -- NUEVO 63
    v_parentesco        text;               -- NUEVO 63
begin
    perform panel_exigir_rol(array['admin']);

    -- La identidad del cobrador es la de la sesion. No hay respaldo tecleado:
    -- si el JWT no trae correo, no hay cobro.
    v_quien := nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '');
    if v_quien is null then
        raise exception 'No se pudo identificar al cobrador desde la sesion. Cierre sesion y vuelva a entrar.';
    end if;

    -- Serializa dos intentos simultaneos sobre el mismo expediente.
    select estado, tipo_usuario, usuario_es_menor, parentesco_otro   -- NUEVO 63: parentesco_otro
      into v_estado, v_tipo_actual, v_es_menor, v_parentesco_actual
      from registros
     where id = p_registro_id
       for update;

    if not found then
        raise exception 'Registro no encontrado';
    end if;
    if v_estado = 'baja' then
        raise exception 'El registro esta dado de baja';
    end if;
    if p_monto is null or p_monto <= 0 then
        raise exception 'El monto debe ser mayor a cero';
    end if;

    -- ---- Validacion del tipo de usuario (CC-05) ----
    v_tipo := nullif(btrim(coalesce(p_tipo_usuario, '')), '');
    if v_tipo is null then
        raise exception 'Confirme el tipo de usuario antes de cobrar (maestro, padres, alumno, admin u otro)';
    end if;
    -- NUEVO 63: quinto tipo, aqui y en los dos mensajes.
    if v_tipo not in ('maestro', 'padres', 'alumno', 'admin', 'otro') then
        raise exception 'Tipo de usuario invalido: % (maestro, padres, alumno, admin u otro)', v_tipo;
    end if;
    if v_es_menor and v_tipo <> 'alumno' then
        raise exception 'El titular es menor de edad: su tipo debe ser alumno';
    end if;

    -- NUEVO 63: antes del insert en pagos, no despues. Un rechazo posterior
    -- revertiria el pago pero quemaria el numero de la secuencia del recibo,
    -- que no se revierte (el mismo dano que describe el bloque 58).
    v_parentesco := nullif(btrim(coalesce(p_parentesco_otro, '')), '');
    if v_tipo = 'otro'
       and coalesce(v_parentesco, nullif(btrim(coalesce(v_parentesco_actual, '')), '')) is null then
        raise exception 'Capture el parentesco del titular con la familia (tio, abuelo, etcetera) antes de cobrar: es obligatorio cuando el tipo de usuario es otro';
    end if;

    select folio_recibo
      into v_folio
      from pagos
     where registro_id = p_registro_id;

    if found then
        raise exception 'El registro ya tiene el pago % registrado', v_folio;
    end if;

    insert into pagos (registro_id, monto, cobrado_por, cobrado_por_uid, cobrado_por_email)
    values (
        p_registro_id,
        p_monto,
        v_quien,
        auth.uid(),
        v_quien
    )
    returning folio_recibo into v_folio;

    if v_tipo is distinct from v_tipo_actual then
        update registros set tipo_usuario = v_tipo where id = p_registro_id;
        insert into movimientos (registro_id, tipo, motivo, hecho_por)
        values (
            p_registro_id, 'cambio',
            'Tipo de usuario: ' || v_tipo_actual || ' -> ' || v_tipo
                || ' (validado al cobrar)',
            v_quien
        );
        v_corregido := true;
    end if;

    -- NUEVO 63: el parentesco solo se escribe cuando el tipo confirmado es
    -- 'otro'. Si llega con cualquier otro tipo se ignora: la columna
    -- describe al familiar de tipo 'otro', y guardarla en un maestro o en
    -- un padre dejaria un dato que ninguna regla sostiene.
    -- La aceptacion NO se toca: su payload sellado conserva lo que el
    -- titular declaro al firmar, y este movimiento es el que documenta que
    -- la escuela lo corrigio despues.
    if v_tipo = 'otro'
       and v_parentesco is not null
       and v_parentesco is distinct from v_parentesco_actual then
        update registros set parentesco_otro = v_parentesco where id = p_registro_id;
        insert into movimientos (registro_id, tipo, motivo, hecho_por)
        values (
            p_registro_id, 'cambio',
            'Parentesco: ' || coalesce(v_parentesco_actual, '(sin dato)') || ' -> ' || v_parentesco
                || ' (validado al cobrar)',
            v_quien
        );
    end if;

    update registros
       set fecha_adquisicion = coalesce(fecha_adquisicion, current_date),
           tipo_validado     = true,
           tipo_validado_por = v_quien,
           tipo_validado_en  = now()
     where id = p_registro_id;

    return jsonb_build_object(
        'id', p_registro_id,
        'folioRecibo', v_folio,
        'tipoUsuario', v_tipo,
        'tipoCorregido', v_corregido,
        'tipoAnterior', case when v_corregido then v_tipo_actual else null end
    );
end;
$$;


-- 4c) Los permisos, otra vez: el drop de 4a se los llevo. Firma NUEVA de
--     5 tipos, y el MISMO rol que le dio el bloque 46: solo authenticated
--     (quien cobra lo decide panel_exigir_rol dentro de la funcion).
revoke all on function registrar_pago(uuid, numeric, text, text, text) from public;
grant execute on function registrar_pago(uuid, numeric, text, text, text) to authenticated;


-- 4d) Sin esto PostgREST sigue anunciando la firma de 4 parametros.
notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- PASO 5 - capturar_expediente_ti: la misma lista de cinco.
--
-- HOY NINGUN CLIENTE LO LLAMA: su pantalla ("Capturar hoja fisica") se
-- retiro el 8-sep por decision de Gerardo, el alta es del titular. Se
-- mantiene coherente porque inserta en la MISMA tabla: si algun dia se
-- vuelve a usar, dejarlo con cuatro tipos lo haria rechazar un expediente
-- que la tabla y el alta publica si admiten, y el motivo seria invisible.
--
-- MISMA FIRMA de 18 parametros del bloque 53: `create or replace` en
-- sitio, sin drop, sin regrant y sin notify. Cuerpo vigente del 53.
-- ---------------------------------------------------------------------
create or replace function capturar_expediente_ti(
    p_usuario_nombres              text,
    p_usuario_apellido_paterno     text,
    p_marca                        text,
    p_modelo                       text,
    p_color                        text,
    p_usuario_apellido_materno     text default null,
    p_tipo_usuario                 text default 'padres',
    p_placas                       text default null,
    p_sin_placas                   boolean default false,
    p_claves                       text[] default null,
    p_no_dispositivo               text default null,
    p_gestionante_nombres          text default null,
    p_gestionante_apellido_paterno text default null,
    p_gestionante_apellido_materno text default null,
    p_gestionante_relacion         text default null,
    p_fecha_hoja                   date default null,
    p_observaciones                text default null,
    p_hecho_por                    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_registro_id uuid;
    v_folio       text;
    v_quien       text;
    v_tag         text;
    v_obs         text;
begin
    perform panel_exigir_rol(array['ti']);

    if coalesce(btrim(p_usuario_nombres), '') = '' then
        raise exception 'Capture el nombre del titular';
    end if;
    if coalesce(btrim(p_usuario_apellido_paterno), '') = '' then
        raise exception 'Capture el apellido paterno del titular';
    end if;
    -- NUEVO 63: quinto tipo, el mismo que admite la tabla.
    if p_tipo_usuario not in ('maestro', 'padres', 'alumno', 'admin', 'otro') then
        raise exception 'Tipo de usuario invalido: %', p_tipo_usuario;
    end if;
    if coalesce(btrim(p_marca), '') = '' then
        raise exception 'Capture la marca del vehiculo';
    end if;
    if coalesce(btrim(p_modelo), '') = '' then
        raise exception 'Capture el modelo del vehiculo';
    end if;
    if coalesce(btrim(p_color), '') = '' then
        raise exception 'Capture el color del vehiculo';
    end if;
    if (p_placas is null or btrim(p_placas) = '') and not coalesce(p_sin_placas, false) then
        raise exception 'Capture las placas o marque "Sin placas"';
    end if;
    if coalesce(btrim(p_gestionante_nombres), '') <> ''
       and coalesce(btrim(p_gestionante_apellido_paterno), '') = '' then
        raise exception 'Quien gestiona requiere apellido paterno';
    end if;
    if nullif(btrim(coalesce(p_gestionante_relacion, '')), '') is not null
       and p_gestionante_relacion not in ('padre', 'madre', 'tutor', 'otro') then
        raise exception 'Relacion de quien gestiona invalida (padre | madre | tutor | otro)';
    end if;

    v_quien := coalesce(nullif(btrim(coalesce(p_hecho_por, '')), ''), 'TI');

    -- El TAG reservado (si viene) tiene que estar DISPONIBLE en el inventario.
    v_tag := nullif(btrim(coalesce(p_no_dispositivo, '')), '');
    if v_tag is not null then
        if v_tag !~ '^[0-9]{6,11}$' then
            raise exception 'El No. de TAG debe tener de 6 a 11 digitos';
        end if;
        perform 1 from inventario_tags
          where no_dispositivo = v_tag
            for update;
        if not found then
            raise exception 'El TAG % no esta en el inventario; dele de alta en "TAGs de la escuela" o capture el expediente sin TAG', v_tag;
        end if;
        if exists (select 1 from inventario_tags where no_dispositivo = v_tag and asignado_a is not null) then
            raise exception 'El TAG % ya esta reservado o en uso por otro expediente', v_tag;
        end if;
    end if;

    v_obs := 'Capturado por TI desde la hoja fisica firmada'
             || coalesce(' del ' || to_char(p_fecha_hoja, 'DD/MM/YYYY'), '')
             || coalesce('. ' || nullif(btrim(coalesce(p_observaciones, '')), ''), '');

    v_folio := 'SATAG-' || lpad(nextval('registros_folio_seq')::text, 6, '0');

    insert into registros (
        folio,
        usuario_nombres, usuario_apellido_paterno, usuario_apellido_materno,
        gestionante_nombres, gestionante_apellido_paterno, gestionante_apellido_materno,
        gestionante_relacion, usuario_es_menor,
        tipo_usuario, procedencia_tag, marca, modelo, color, placas, sin_placas,
        fecha_adquisicion, observaciones, estado
    ) values (
        v_folio,
        btrim(p_usuario_nombres),
        btrim(p_usuario_apellido_paterno),
        nullif(btrim(coalesce(p_usuario_apellido_materno, '')), ''),
        nullif(btrim(coalesce(p_gestionante_nombres, '')), ''),
        nullif(btrim(coalesce(p_gestionante_apellido_paterno, '')), ''),
        nullif(btrim(coalesce(p_gestionante_apellido_materno, '')), ''),
        nullif(btrim(coalesce(p_gestionante_relacion, '')), ''),
        false,
        p_tipo_usuario,
        'escuela',
        btrim(p_marca),
        btrim(p_modelo),
        btrim(p_color),
        case when coalesce(p_sin_placas, false) then null
             else nullif(upper(regexp_replace(coalesce(p_placas, ''), '[^A-Za-z0-9]', '', 'g')), '') end,
        coalesce(p_sin_placas, false),
        p_fecha_hoja,
        v_obs,
        'pendiente'
    ) returning id into v_registro_id;

    insert into movimientos (registro_id, tipo, motivo, hecho_por)
    values (v_registro_id, 'alta', 'Alta capturada por TI desde la hoja fisica firmada', v_quien);

    if p_claves is not null and exists (
        select 1 from unnest(coalesce(array_remove(p_claves, null), '{}'::text[])) as c(clave)
         where btrim(clave) <> ''
    ) then
        perform asignar_estacionamiento(
            p_registro_id => v_registro_id,
            p_claves      => p_claves,
            p_hecho_por   => p_hecho_por
        );
    end if;

    if v_tag is not null then
        update inventario_tags
           set asignado_a = v_registro_id, asignado_en = now(), asignado_por = v_quien
         where no_dispositivo = v_tag and asignado_a is null;
    end if;

    return jsonb_build_object('id', v_registro_id, 'folio', v_folio, 'estado', 'pendiente');
end;
$$;


-- ---------------------------------------------------------------------
-- PASO 6 - VERIFICACION. Todo de solo lectura.
-- ---------------------------------------------------------------------

-- 6a. La columna existe.
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'registros'
   and column_name = 'parentesco_otro';
-- Esperado: 1 fila, text, YES.

-- 6b. El CHECK admite los cinco valores.
select conname, pg_get_constraintdef(oid) as definicion
  from pg_constraint
 where conrelid = 'registros'::regclass
   and conname = 'reg_tipo_usuario_valido';
-- Esperado: 1 fila cuyo texto enumere maestro, padres, alumno, admin y otro.

-- 6c. Ninguna de las tres funciones quedo con una segunda forma.
select proname, count(*) as formas
  from pg_proc
 where proname in ('crear_registro','registrar_pago','capturar_expediente_ti')
 group by proname;
-- Esperado: 1 en las tres filas.
--
-- SI crear_registro DEVUELVE 2, EL DROP DEL PASO 3a FALLO: ninguna de sus
-- dos listas empato con la firma que habia en la base, quedo viva la funcion
-- vieja junto a la nueva y ESO ES la trampa PostgREST —la API anuncia las
-- dos y sirve la que se le antoje, asi que un alta puede entrar por la de
-- 27 parametros y perder el parentesco sin que nada avise—. Resuelvalo
-- ANTES de seguir: vea las dos firmas con
--   select oid::regprocedure from pg_proc where proname = 'crear_registro';
-- y haga el drop de la que tenga 27 parametros, indicandola completa.

-- 6c-bis. registrar_pago: UNA sola forma, y es la de 5 parametros.
select p.oid::regprocedure as firma
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'registrar_pago';
-- Esperado: exactamente 1 fila, registrar_pago(uuid,numeric,text,text,text).
--
-- SI SALEN 2, EL DROP DEL PASO 4a FALLO y convive la de 4 parametros con
-- la nueva. Es la misma trampa: PostgREST puede servirle a la caja la de
-- 4, que admite corregir a 'otro' sin parentesco. Haga el drop de la de 4
-- indicandola completa, registrar_pago(uuid, numeric, text, text), antes
-- de seguir. Si sale 1 fila pero con 4 tipos, el PASO 4 no se aplico.

-- 6d. Los grants quedaron como estaban antes de los dos drops.
select has_function_privilege('anon',
    'crear_registro(text,text,text,text,text,text,text,boolean,text,text,text,text,text,text,text,boolean,text,jsonb,text,inet,text,jsonb,text,text,uuid,uuid,text,text)',
    'execute') as anon_ejecuta,
  has_function_privilege('authenticated',
    'crear_registro(text,text,text,text,text,text,text,boolean,text,text,text,text,text,text,text,boolean,text,jsonb,text,inet,text,jsonb,text,text,uuid,uuid,text,text)',
    'execute') as authenticated_ejecuta,
  has_function_privilege('authenticated',
    'registrar_pago(uuid,numeric,text,text,text)',
    'execute') as panel_cobra;
-- Esperado: true, true y true. Si alguna de las dos primeras sale false,
-- se salto el PASO 3c y el formulario publico responde "permission
-- denied"; si la tercera sale false, se salto el PASO 4c y la caja no
-- puede cobrar.

-- 6e. La lista de los expedientes 'alumno' sin apellidos de familia NO va
--     aqui: este bloque todavia no se los exige. Va al final del bloque
--     65, que es el que empieza a pedirselos.


-- ---------------------------------------------------------------------
-- ROLLBACK del bloque completo (comentado).
--
-- ANTES DE NADA: si el cliente nuevo ya esta publicado, hay que revertir
-- primero el deploy. Ese cliente manda `p_parentesco_otro` a las dos
-- funciones, y contra las firmas viejas de 27 y 4 parametros PostgREST no
-- encuentra la funcion: se caerian todas las altas y todos los cobros. Si
-- el bloque 65 ya se aplico, no hace falta deshacerlo aparte: el paso 1 de
-- abajo tira la funcion de 28 parametros que el 65 reemplazo.
--
-- La COLUMNA se queda: no estorba a nadie (es nullable y ninguna
-- restriccion la mira) y tirarla borraria los parentescos ya capturados.
-- Lo que hay que deshacer es la firma y el CHECK, EN ESTE ORDEN: primero
-- las funciones —para que dejen de admitir 'otro'— y despues el CHECK, que
-- solo se puede estrechar si ya no queda ninguna fila con ese tipo.
-- ---------------------------------------------------------------------
--
-- 1) crear_registro, de vuelta a 27 parametros. El drop va con la lista
--    NUEVA de 28 tipos; el create sale de 62_placas_unicas_y_normalizadas.sql
--    (PASO 1), que es el cuerpo que este bloque reemplazo.
--
-- drop function if exists crear_registro(
--     text, text, text, text, text, text, text, boolean, text,
--     text, text, text, text, text, text, boolean, text, jsonb, text, inet, text, jsonb, text, text, uuid, uuid, text, text
-- );
-- -- ...y volver a correr el PASO 1 del bloque 62 TAL CUAL, pero cambiando
-- -- su `create or replace function` por `create function` (la funcion ya
-- -- no existe), seguido de:
-- revoke all on function crear_registro(
--     text, text, text, text, text, text, text, boolean, text,
--     text, text, text, text, text, text, boolean, text, jsonb, text, inet, text, jsonb, text, text, uuid, uuid, text
-- ) from public;
-- grant execute on function crear_registro(
--     text, text, text, text, text, text, text, boolean, text,
--     text, text, text, text, text, text, boolean, text, jsonb, text, inet, text, jsonb, text, text, uuid, uuid, text
-- ) to anon, authenticated;
-- notify pgrst, 'reload schema';
--
-- 2) registrar_pago, de vuelta a 4 parametros. Tambien cambia la firma:
--    drop con la lista NUEVA de 5 tipos, el cuerpo de
--    50_cobrador_desde_sesion.sql con `create function` en lugar de
--    `create or replace function`, y los permisos de la firma de 4.
--
-- drop function if exists registrar_pago(uuid, numeric, text, text, text);
-- -- ...cuerpo del bloque 50, seguido de:
-- revoke all on function registrar_pago(uuid, numeric, text, text) from public;
-- grant execute on function registrar_pago(uuid, numeric, text, text) to authenticated;
-- notify pgrst, 'reload schema';
--
--    capturar_expediente_ti: volver a correr, tal cual, el punto 1 de
--    53_captura_hoja_fisica.sql. Misma firma: sin drop, sin regrant.
--
-- 3) El CHECK, de vuelta a cuatro valores. Falla si ya existe algun
--    expediente 'otro'; en ese caso hay que decidir a mano que tipo les
--    corresponde ANTES de estrecharlo (la consulta de abajo los lista).
--
-- select folio, tipo_usuario, parentesco_otro from registros where tipo_usuario = 'otro' order by folio;
--
-- alter table registros drop constraint if exists reg_tipo_usuario_valido;
-- alter table registros add constraint reg_tipo_usuario_valido
--     check (tipo_usuario in ('maestro','padres','alumno','admin'));
--
-- 4) Las aceptaciones firmadas con 'satag.acceptance.v2' se quedan como
--    estan. NO se reescriben: su hash se calculo sobre ese payload y
--    tocarlo destruiria la evidencia. El rollback devuelve la funcion, no
--    la historia. Tampoco se borran los movimientos 'cambio' del
--    parentesco: son la bitacora de lo que la caja corrigio.
