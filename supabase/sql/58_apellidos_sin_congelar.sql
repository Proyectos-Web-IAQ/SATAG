-- =====================================================================
-- 58_apellidos_sin_congelar.sql
-- Revoca la PARTE B del bloque 55 y pone ese mismo control donde si
-- funciona: dentro de crear_registro, en el alta.
--
-- ESTO NO RELAJA EL CONTROL. Lo que Administracion pidio en la junta del
-- 9-sep —que un expediente de padres de familia no exista sin los
-- apellidos con los que se coteja la lista de inscritos— se sigue
-- exigiendo, y con un mensaje en espanol en vez de un error de Postgres.
-- Lo que se retira es el INSTRUMENTO, que estaba mal elegido.
--
--
-- QUE PASO
--
-- La parte B del bloque 55 agrego esta restriccion:
--
--     alter table registros add constraint reg_apellidos_familia_requeridos
--         check (tipo_usuario <> 'padres'
--                or (apellidos_familia is not null
--                    and btrim(apellidos_familia) <> ''))
--         not valid;
--
-- El comentario que la acompanaba afirmaba que `not valid` la dejaba sin
-- efecto sobre las filas que ya existian. Eso es FALSO, y es el error de
-- diseno que este bloque corrige. `not valid` se salta la revision
-- retroactiva UNA sola vez, en el momento de crear la restriccion.
-- Despues de eso el CHECK se evalua en cada insert Y EN CADA UPDATE, y
-- siempre sobre la version NUEVA Y COMPLETA de la fila. Un update que ni
-- siquiera menciona apellidos_familia arrastra al renglon nuevo el valor
-- viejo —vacio— y ahi el CHECK lo rechaza.
--
--
-- POR QUE UN CHECK DE TABLA ERA EL INSTRUMENTO EQUIVOCADO
--
-- Un CHECK de tabla vigila TODA escritura de la fila. Y esa columna no la
-- puede escribir casi ninguna escritura: `apellidos_familia` la llena UN
-- SOLO sitio en todo el sistema, crear_registro (el alta publica).
-- Ninguna pantalla del panel la captura ni la corrige. En cambio hay ONCE
-- bloques que hacen `update registros`: 29, 32, 33, 38, 40, 42, 46, 49,
-- 50, 52 y 53.
--
-- La combinacion deja el expediente CONGELADO: cualquier registro con
-- tipo_usuario = 'padres' y apellidos_familia vacia no se puede instalar
-- (instalar_tag), ni cobrar (registrar_pago escribe fecha_adquisicion y
-- tipo_validado), ni dar de baja, ni actualizar. Y no hay salida desde
-- ninguna pantalla: el unico rescate es un UPDATE a mano en el editor SQL.
-- Es decir, la restriccion no protegia un dato: bloqueaba el expediente
-- completo por la falta de ese dato, y ademas sin manera de llenarlo.
--
-- Los tres danos concretos que ya estaban en la mesa:
--
--   1. EL CASO DE LA JUNTA DEL 9-SEP. registrar_pago (bloques 46 y 50)
--      CORRIGE el tipo de usuario: `update registros set tipo_usuario =
--      v_tipo`. El empleado que ademas es papa se registro como 'maestro'
--      y Administracion lo corrige a 'padres' en la caja. Con la
--      restriccion viva, ese update revienta el CHECK y REVIERTE LA
--      TRANSACCION ENTERA: no hay pago, no hay folio de recibo, no hay
--      correccion del tipo, y no existe pantalla donde llenar el campo que
--      falta. El cajero solo ve un error de Postgres en ingles.
--      Detalle que se paga aparte: la secuencia del folio de recibo
--      (bloque 32) NO se revierte con la transaccion, asi que cada intento
--      fallido de cobro se lleva un numero y deja hueco en la numeracion de
--      los recibos.
--
--   2. capturar_expediente_ti (bloque 53) NO puede crear expedientes de
--      padres: su insert no incluye la columna nueva, asi que el CHECK lo
--      rechaza desde el alta.
--
--   3. seed_tests_dev.sql inserta filas 'padres' sin la columna. Falla
--      DESPUES de su `truncate ... cascade`, o sea que deja la base vacia y
--      sin banco de pruebas.
--
--
-- DONDE QUEDA EL CONTROL AHORA
--
-- En crear_registro, que es el unico lugar que escribe la columna. Un dato
-- se exige donde se captura: ahi se sabe que falta, se puede decir en
-- espanol y de usted, y no se castiga ninguna operacion posterior.
-- El cliente publicado ya lo pide en pantalla (app/registro/page.tsx valida
-- el campo cuando el tipo es 'padres' y lo manda en p_apellidos_familia);
-- la validacion que agrega este bloque es la red del servidor para una
-- llamada directa a la API o para un cliente viejo en cache, igual que las
-- de D-01 en el bloque 49.
--
-- Se considero y se descarto un trigger BEFORE INSERT: haria lo mismo pero
-- escondiendo la regla fuera de la funcion que la aplica, y alcanzaria
-- tambien a capturar_expediente_ti y al seed, que crean expedientes por
-- otras razones. Si algun dia TI vuelve a capturar altas de padres, la
-- regla se le agrega a ESE RPC, no a la tabla.
--
-- Costo asumido, escrito para que no sorprenda: un expediente que nace
-- 'maestro' y que Administracion corrige a 'padres' en la caja se queda con
-- los apellidos de familia VACIOS, porque su alta no los pidio. Queda
-- DEGRADADO, no roto: cobra, instala, se actualiza y se da de baja
-- normalmente, y la tarjeta del panel muestra el campo en blanco. La
-- captura del dato desde el panel es del lote 2 (ver la auditoria).
--
--
-- QUE CAMBIA
--   - se elimina la restriccion reg_apellidos_familia_requeridos;
--   - crear_registro gana una validacion y NADA MAS: se reproduce integro
--     el cuerpo vigente del bloque 55 (folio, versiones obligatorias de
--     D-01, aceptacion con su hash, payload, movimiento de alta, insert en
--     aceptaciones);
--   - el comentario de la columna deja de citar una restriccion que ya no
--     existe.
--
-- QUE NO CAMBIA
--   - LA FIRMA. Los 27 parametros son exactamente los del bloque 55: el
--     parametro 27 ya existe desde entonces. Por eso aqui va
--     `create or replace` EN SITIO: los grants del bloque 55 se conservan y
--     no hace falta drop, ni volver a emitir revoke/grant, ni notify
--     (PostgREST cachea firmas, y esta no se movio). Un notify de mas seria
--     inofensivo, pero no es necesario y se omite a proposito para que
--     quede claro que este bloque NO es de los que cambian firma.
--   - La evidencia de firma: el payload sigue siendo 'satag.acceptance.v1'
--     y el apellido de familia sigue fuera del hash, por el mismo motivo
--     que explica el bloque 55.
--   - La columna sigue siendo nullable. Los expedientes que no son de
--     padres nunca la llevan.
--
--
-- ORDEN Y DEPENDENCIAS
--
-- Aplicar completo, de un tiron, en cualquier momento: no hay ventana que
-- cuidar. Al reves que el 55, este bloque solo AFLOJA la base (quita una
-- restriccion) y endurece una funcion en un punto que el cliente publicado
-- ya cumple, asi que aplicarlo antes o despues de cualquier deploy es
-- indistinto.
--
-- Si ya se corrio `supabase/manual/2026-09-10_URGENTE_soltar_apellidos.sql`
-- (el parche de emergencia de hoy), el paso 1 no hace nada: es el mismo
-- drop y lleva `if exists`. Si la parte B del 55 nunca se aplico, tampoco
-- hace nada. En los dos casos el bloque completo es correcto y repetible.
--
-- OJO AL REAPLICAR EL 55: su parte B queda REVOCADA por este bloque. Si
-- algun dia se reconstruye la base corriendo la carpeta en orden, la parte
-- B del 55 se SALTA (o se corre, y este 58, que va despues, la vuelve a
-- quitar). La parte A del 55 sigue siendo necesaria: de ahi salen la
-- columna y el parametro 27.
--
-- Depende de: bloque 55 parte A aplicada (columna + firma de 27
-- parametros) y, por herencia, de los bloques 12, 19 y 49.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Fuera la restriccion. `if exists` para que el bloque se pueda correr
--    dos veces, y para que no truene si el parche de emergencia de hoy ya
--    la quito.
-- ---------------------------------------------------------------------
alter table registros
    drop constraint if exists reg_apellidos_familia_requeridos;

-- El comentario de la columna citaba "bloque 55, parte B". Esa parte ya no
-- existe: quien lea el esquema dentro de un ano tiene que llegar aqui, no a
-- una restriccion fantasma.
comment on column registros.apellidos_familia is 'PII (LFPDPPP). Apellidos de la familia del alumno, para cotejar contra la lista de inscritos; obligatorio EN EL ALTA cuando tipo_usuario = padres, exigido dentro de crear_registro (bloque 58; la restriccion de tabla del bloque 55 parte B quedo revocada porque congelaba el expediente en cada update)';


-- ---------------------------------------------------------------------
-- 2) crear_registro: MISMA FIRMA de 27 parametros (sin drop, sin regrant,
--    sin notify) y mismo cuerpo del bloque 55. Lo unico que se agrega es la
--    validacion del apellido de familia, justo donde el 55 habia dejado
--    escrito que NO se validaba.
-- ---------------------------------------------------------------------
create or replace function crear_registro(
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
    -- Parametro 27, tal como lo dejo el bloque 55: al final y con default
    -- null. No se mueve ni se le cambia el nombre; `create or replace` no
    -- admite renombrar parametros, y mover uno cambiaria la firma.
    p_apellidos_familia            text default null
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
    v_sello_tiempo timestamptz := clock_timestamp();
    v_hash_payload jsonb;
    v_hash_documento text;
    v_headers json;
    v_xff text;
    v_ip_origen inet;
    v_user_agent text;
begin
    -- D-01 (servidor): las versiones son obligatorias. El cliente corregido
    -- bloquea el envio si los documentos no cargaron, asi que llegar aqui
    -- sin ids solo puede ser un cliente viejo o una llamada directa: se
    -- rechaza en lugar de resolver por cuenta propia.
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
    if p_tipo_usuario not in ('maestro','padres','alumno','admin') then
        raise exception 'tipo_usuario invalido: %', p_tipo_usuario;
    end if;
    if coalesce(btrim(p_modelo),'') = '' then
        raise exception 'El modelo del vehiculo es obligatorio';
    end if;
    if (p_placas is null or btrim(p_placas) = '') and not coalesce(p_sin_placas,false) then
        raise exception 'Debe capturar placas o marcar sin_placas';
    end if;
    if coalesce(btrim(p_firma_url),'') = '' then
        raise exception 'Falta la firma (firma_url)';
    end if;
    if p_firma_imagen_sha256 is not null and p_firma_imagen_sha256 !~ '^[0-9a-f]{64}$' then
        raise exception 'firma_imagen_sha256 debe ser SHA-256 en hexadecimal';
    end if;
    -- Gestionante presente si viene el nombre; en ese caso exige apellido paterno.
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
    -- Control de externos (junta del 9-sep). Aqui es donde el bloque 55
    -- decia que NO se validaba, porque el dato lo exigia una restriccion de
    -- tabla; esa restriccion congelaba el expediente entero (ver el
    -- encabezado), asi que la regla vive ahora en el unico lugar que
    -- escribe la columna. El mensaje va de usted y dice que hacer: lo puede
    -- leer un papa o una mama en su telefono si el navegador le sirvio una
    -- version vieja del formulario.
    if p_tipo_usuario = 'padres'
       and coalesce(btrim(coalesce(p_apellidos_familia,'')),'') = '' then
        -- «Recargue la pagina», no «complete el dato»: el unico modo de que este
        -- mensaje llegue a una pantalla es que el navegador haya servido una
        -- version vieja del formulario, y esa version NO tiene el campo. Pedirle
        -- que complete algo que no ve la deja dando vueltas, y cada reintento
        -- vuelve a subir una firma que queda huerfana en Storage. Misma salida
        -- que dan los mensajes hermanos de D-01, unas lineas mas arriba.
        raise exception 'No se recibieron los apellidos de la familia, que son obligatorios cuando el registro es de un padre, una madre o un tutor. Recargue la pagina e intente de nuevo.';
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

    -- Mismo saneo que el resto del expediente: se van los espacios de sobra
    -- y la cadena vacia se guarda como NULL, para que "vacio" tenga una
    -- sola representacion. La validacion de arriba usa el mismo btrim, asi
    -- que mandar "   " tampoco pasa por ahi.
    v_apellidos_familia := nullif(btrim(coalesce(p_apellidos_familia,'')), '');

    -- Captura confiable de IP y user-agent desde los headers de la peticion (server-side).
    -- Supabase/PostgREST exponen los headers en el setting request.headers.
    v_headers := nullif(current_setting('request.headers', true), '')::json;
    v_user_agent := coalesce(
        nullif(btrim(coalesce(v_headers ->> 'user-agent', '')), ''),
        nullif(btrim(coalesce(p_user_agent, '')), '')
    );
    v_xff := btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1));
    begin
        v_ip_origen := nullif(v_xff, '')::inet;   -- primer IP del x-forwarded-for
    exception when others then
        v_ip_origen := null;                      -- header malformado: no rompe el alta
    end;
    v_ip_origen := coalesce(v_ip_origen, p_ip_origen);

    -- Folio publico humano. Se asigna aqui (no como DEFAULT de la tabla).
    v_folio := 'SATAG-' || lpad(nextval('registros_folio_seq')::text, 6, '0');

    insert into registros (
        folio,
        usuario_nombres, usuario_apellido_paterno, usuario_apellido_materno,
        gestionante_nombres, gestionante_apellido_paterno, gestionante_apellido_materno,
        gestionante_relacion, usuario_es_menor,
        tipo_usuario, procedencia_tag, marca, modelo, color, placas, sin_placas,
        apellidos_familia,
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
        nullif(btrim(coalesce(p_placas,'')), ''),
        coalesce(p_sin_placas, false),
        v_apellidos_familia,
        nullif(btrim(coalesce(p_observaciones,'')), ''),
        'pendiente'
    ) returning id into v_registro_id;

    -- El payload NO cambia (sigue siendo satag.acceptance.v1): el apellido
    -- de familia es control administrativo de la escuela, no parte de lo
    -- que el titular acepto. Ver el encabezado del bloque 55.
    v_hash_payload := jsonb_build_object(
        'schema', 'satag.acceptance.v1',
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
            'marca', btrim(p_marca),
            'modelo', btrim(p_modelo),
            'color', btrim(p_color),
            'placas', nullif(btrim(coalesce(p_placas,'')), ''),
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

-- Sin drop, sin revoke/grant y sin notify a proposito: la firma es la misma
-- del bloque 55, asi que los grants a anon/authenticated siguen en pie y
-- PostgREST no tiene una firma nueva que anunciar. Si hace falta
-- comprobarlo, la auditoria de abajo trae la consulta.


-- ---------------------------------------------------------------------
-- 3) LECTURA, no reparacion. Quienes quedaron cojos.
--
--    Son los expedientes de padres que nacieron antes de que el formulario
--    pidiera el dato, y los que Administracion corrija a 'padres' en la
--    caja de aqui en adelante. Ya NO estan congelados —cobran, instalan, se
--    actualizan y se dan de baja sin problema—, solo les falta el dato con
--    el que se coteja la lista de inscritos.
--
--    No se rellenan solos a proposito: el padron se va a limpiar, y poner
--    apellidos adivinados en el campo que sirve para negarle la instalacion
--    a un externo es peor que dejarlo vacio. Si la consulta devuelve cero
--    filas, no hay nada que hacer.
-- ---------------------------------------------------------------------
select r.folio,
       r.tipo_usuario,
       r.estado,
       r.no_dispositivo,
       r.created_at::date                                         as dado_de_alta,
       exists (select 1 from pagos p where p.registro_id = r.id)  as ya_pago
  from registros r
 where r.tipo_usuario = 'padres'
   and coalesce(btrim(r.apellidos_familia), '') = ''
 order by r.folio;

-- Para completar UNO a mano, ya cotejado contra la lista de inscritos (uno
-- por uno, nunca en lote y nunca a ciegas):
--
-- update registros
--    set apellidos_familia = 'Apellido Apellido'
--  where folio = 'SATAG-000000';


-- Auditoria esperada:
--
-- LA RESTRICCION YA NO EXISTE
-- - `select conname from pg_constraint where conrelid = 'registros'::regclass
--    and conname = 'reg_apellidos_familia_requeridos';` -> CERO filas.
--
-- LA FIRMA NO SE MOVIO (si esto falla, se aplico algo de mas)
-- - `select count(*) from pg_proc where proname = 'crear_registro';` -> 1.
-- - `select pg_get_function_identity_arguments(oid) from pg_proc where
--    proname = 'crear_registro';` -> los mismos 27 parametros, el ultimo
--   `p_apellidos_familia text`.
-- - `select has_function_privilege('anon', 'crear_registro(text,text,text,text,text,text,text,boolean,text,text,text,text,text,text,text,boolean,text,jsonb,text,inet,text,jsonb,text,text,uuid,uuid,text)', 'execute');`
--   -> true, y lo mismo para 'authenticated'. Debe seguir en true SIN haber
--   emitido grants aqui: esa es la prueba de que `create or replace` en
--   sitio los conserva.
--
-- EL CONTROL SIGUE VIVO, PERO EN EL ALTA
-- - Alta de padres CON apellidos de familia (desde el sitio publicado):
--   pasa, devuelve folio y la columna guarda el texto sin espacios de
--   sobra. Mandarlo como "   " se rechaza igual que vacio.
-- - Alta de padres SIN el campo (llamada directa a la API, o un cliente
--   viejo en cache): rechazada por crear_registro con el mensaje en espanol
--   y de usted, NO con un error de CHECK en ingles.
-- - Alta de maestro / alumno / admin sin el campo: pasa, como siempre.
-- - La aceptacion de esas altas conserva su hash verificable y el payload
--   sigue diciendo 'satag.acceptance.v1', sin apellidos de familia dentro.
--
-- LO QUE ESTE BLOQUE DESATORA (comprobarlo: es el motivo del bloque)
-- - COBRO DE UN 'maestro' CORREGIDO A 'padres': ahora SI PASA. Se registra
--   el pago con su folio de recibo, tipo_usuario queda en 'padres',
--   tipo_validado en true y el movimiento 'cambio' con "Tipo de usuario:
--   maestro -> padres (validado al cobrar)". El expediente queda con
--   apellidos_familia VACIA: eso es DEGRADADO Y ESPERADO, no un fallo.
--   Aparece en la consulta del punto 3.
-- - capturar_expediente_ti (bloque 53) VUELVE A PODER crear expedientes de
--   padres. Su insert no incluye apellidos_familia y ya no hay CHECK que lo
--   rechace; el expediente nace con el campo vacio, igual que el caso de
--   arriba. (Ese RPC sigue sin pantalla desde el 8-sep; lo que importa es
--   que dejo de estar roto.)
-- - seed_tests_dev.sql VUELVE A CORRER completo. Antes fallaba DESPUES de
--   su `truncate ... cascade`, dejando la base vacia y sin banco de
--   pruebas. Nota: sigue siendo destructivo y no se corre contra el padron
--   real.
-- - Un expediente de padres con el campo vacio se puede instalar, cobrar,
--   actualizar y dar de baja. Esta es la prueba directa de que el congelado
--   se acabo: antes cualquiera de esas cuatro cosas fallaba.
--
-- PENDIENTE DECLARADO - LOTE 2: CAPTURAR LOS APELLIDOS DESDE EL PANEL
-- - Hoy no existe pantalla para llenar ni corregir apellidos_familia. Los
--   expedientes que enliste el punto 3 solo se completan con un UPDATE a
--   mano en el editor SQL.
-- - Se DIFIERE a proposito, no por olvido: la pantalla natural es
--   "Actualizar datos", y ese camino pasa por
--   actualizar_registro_con_estacionamiento (11 parametros) y por la obrera
--   actualizar_registro (9). Agregarles el campo CAMBIA LAS DOS FIRMAS, y
--   eso es la trampa cara: drop function con la lista completa de tipos
--   vieja, recrear, volver a emitir revoke/grant, notify pgrst, y ademas un
--   deploy del panel que mande el parametro nuevo. Todo eso, con la salida
--   a produccion el lunes 14-sep, es exactamente el tipo de cambio que no
--   se hace en viernes.
-- - Mientras tanto el dato se sigue capturando donde importa (el alta), y
--   los pocos expedientes sin el se ven de un vistazo con la consulta del
--   punto 3.
