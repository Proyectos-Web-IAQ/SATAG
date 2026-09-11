-- =====================================================================
-- 2026-09-11_limpiar_base_para_el_lunes.sql
-- DEJA LA BASE DE PRODUCCION LIMPIA PARA EL LUNES 14-SEP-2026,
-- CONSERVANDO EL INVENTARIO DE TAGS.
--
-- !!! ADVERTENCIA !!!  DESTRUCTIVO SOBRE LA BASE REAL. No hay entorno de
-- pruebas: esta es la base de satag.asuncionqro.edu.mx.
--
-- POR QUE EXISTE. Decision de Gerardo del 11-sep-2026: desde ahora el
-- equipo prueba TODO el sistema con datos inventados (altas, cobros,
-- instalaciones, actualizaciones, bajas, buzon, export a ZK) y, al terminar,
-- se borra todo lo que esas pruebas generaron para que el lunes el personal
-- arranque con familias reales sobre una base limpia. Es la version al dia
-- de supabase/sql/limpiar_padron_piloto.sql.
--
-- ---------------------------------------------------------------------
-- QUE HACE, EN ORDEN
-- ---------------------------------------------------------------------
--   PASO 0  Solo lee. Cuenta lo que se va a borrar y lo que se conserva,
--           lista los expedientes y los TAGs asignados, el valor de las
--           secuencias de folios, y corre las mismas guardias que el PASO 1
--           para que vea ANTES si el borrado se va a detener.
--   PASO 1  El borrado, en UNA sola sentencia (un bloque do, que PostgreSQL
--           ejecuta en una sola transaccion: o pasa todo o no pasa nada).
--             1. Candado de confirmacion (frase nueva, ver abajo) y los DOS
--                datos que usted teclea dentro del bloque: el instante en que
--                el equipo dejo de probar y cuantos expedientes conto.
--             2. Bloquea la escritura en las tablas que toca y en las que
--                conserva.
--             3. Guardias: nada creado despues de que terminaron las pruebas
--                (expedientes, pagos, solicitudes y cortes); el padron tiene
--                exactamente los expedientes que usted conto; ninguna llave
--                foranea ni trigger que no este en el repo, y los cuatro
--                triggers del bloque 42 en su estado normal.
--             4. Libera el inventario (asignado_a/_en/_por a null).
--             5. Baja SOLO los dos candados contables del bloque 42 que
--                estorban para borrar.
--             6. Borra, de hijas a madres: movimientos, aceptaciones,
--                registro_estacionamientos, solicitudes (tramites y notas
--                del buzon), pagos, registros, cortes_caja, intentos_publicos.
--             7. Resuelve la cola de la FK diferida y sube los candados.
--             8. Verifica por dentro: lo borrado en cero; inventario, mapa de
--                ZK, catalogos, versiones y cuentas con el MISMO conteo que
--                al empezar. Si algo no cuadra, aborta y revierte todo.
--             9. Reinicia las secuencias de folios (lo ultimo, ver por que).
--            10. Vuelve a cerrar el candado de la sesion.
--   PASO 2  Solo lee. Verificacion: todo lo borrado en cero, lo conservado
--           con el mismo conteo que en el PASO 0, secuencias reiniciadas.
--   PASO 3  Las imagenes de firma del bucket `firmas`. NO se borran con SQL:
--           se vacia el bucket desde el Dashboard. Trae su consulta de antes
--           y de despues.
--
-- ---------------------------------------------------------------------
-- QUE CONSERVA (intacto)
-- ---------------------------------------------------------------------
--   - inventario_tags: todos los TAGs dados de alta. Solo se libera la
--     asignacion; ningun numero se borra.
--   - zk_tarjetas: mapa tarjeta -> ID de ZK (bloque 54), sin datos personales.
--   - Catalogos: estacionamientos, cat_marcas, cat_modelos, cat_colores.
--   - Documentos legales: aviso_versiones (v6 vigente) y reglamento_versiones.
--   - Cuentas del personal: auth.users, sus roles (app_metadata.rol) y MFA.
--   - Esquema completo: funciones, politicas, vistas, triggers, el bucket
--     `firmas` y su configuracion.
--
-- LO QUE ESTE SCRIPT NO ALCANZA (hay que resolverlo por fuera):
--   - Las firmas en Storage: PASO 3, a mano.
--   - ZKBioSecurity: si durante las pruebas se importo a ZK un padron de
--     prueba, esas personas siguen en ZK. La base no puede verlo.
--   - Archivos descargados durante las pruebas (export a ZK, recibos,
--     capturas) en las computadoras del equipo.
--
-- ---------------------------------------------------------------------
-- CUANDO CORRERLO
-- ---------------------------------------------------------------------
--   Al terminar las pruebas del viernes 11-sep y ANTES del lunes 14-sep.
--   Despues de correrlo YA NO SE PRUEBA EN LA BASE: todo lo que entre a
--   partir de ese momento cuenta como dato real. Avise al equipo antes de
--   empezar para que nadie este dando altas, cobrando o instalando mientras
--   corre (el PASO 1 bloquea la escritura unos instantes; un alta que llegue
--   en ese momento espera y entra despues, y quedaria viva).
--
-- NUNCA CON FAMILIAS YA REGISTRADAS. Este script no distingue un expediente
--   de prueba de uno real: borra TODOS. Si ya hay una sola familia real en
--   el padron, NO lo corra.
--
--   La red automatica son DOS datos que usted teclea en el bloque del PASO 1,
--   y sin los dos el bloque aborta sin tocar nada:
--     - c_corte: el instante en que el equipo DEJO DE PROBAR, en hora de
--       Queretaro. El bloque se niega a borrar si encuentra un expediente, un
--       pago, una solicitud o un corte creado despues de ese instante.
--     - c_expedientes: cuantos expedientes conto en la lista del PASO 0.5. Si
--       el padron trae uno mas (o uno menos), el bloque aborta.
--   El corte NO puede ser el lunes 14-sep a las 00:00, como estaba antes: el
--   formulario publico ya esta en linea en satag.asuncionqro.edu.mx y el rol
--   anon puede ejecutar crear_registro (bloque 63), asi que una familia puede
--   darse de alta sola el sabado o el domingo. Con el corte en el lunes, esa
--   alta quedaba por debajo de la guardia y se borraba sin aviso; con el corte
--   en el fin de las pruebas, la detiene.
--
--   REFUERZO RECOMENDADO: mientras no se corra este script, lo mas seguro es
--   que el alta publica este cerrada entre el fin de las pruebas y el lunes
--   (quitar la liga del formulario o revocar el execute de crear_registro a
--   anon y devolverlo el lunes). Eso no lo hace este archivo; es decision de
--   Gerardo.
--
--   Si cualquier guardia salta, no la rodee: detengase, ejecute el reset del
--   candado (ver abajo) y consulte a Gerardo.
--
-- NO HAY VUELTA ATRAS salvo un respaldo de Supabase. Antes del PASO 1 revise
--   en el Dashboard (Database > Backups) si el proyecto tiene uno reciente;
--   no lo de por hecho. Lo que se borra son datos inventados, pero tambien se
--   pierden los cortes de caja, la bitacora y la evidencia de las pruebas.
--   Si quiere conservar algo de eso, corra antes el PASO 1 de
--   supabase/sql/respaldo_padron_piloto.sql (solo lee) y guarde el JSON en
--   Campo/datos/ (gitignored).
--
-- ---------------------------------------------------------------------
-- EL CANDADO (leer antes del PASO 1)
-- ---------------------------------------------------------------------
--   El PASO 1 aborta sin tocar nada salvo que la sesion traiga la frase
--   exacta. Se pega como PRIMERA linea, arriba del `do $$`, y se ejecuta
--   en la MISMA ejecucion que el bloque:
--
--       set satag.confirmo_borrado = 'SI, BORRAR TODO SALVO LOS TAGS';
--
--   En la misma ejecucion y no en una aparte porque, en ejecuciones
--   separadas, el editor de Supabase puede cambiar de conexion y la frase no
--   llega (asi se aplico el bloque 65). La frase es NUEVA a proposito: la de
--   los scripts anteriores ('SI, BORRAR TODO') no abre este. No deje la linea
--   descomentada en el archivo: el candado existe para que un "Run" del
--   archivo completo no vacie la base.
--
--   Al terminar bien, el bloque vuelve a poner la frase en vacio en esa
--   conexion, para que una segunda ejecucion en la misma conexion no
--   encuentre el candado abierto.
--
--   PERO ESO SOLO PASA SI EL BLOQUE TERMINA BIEN. Si el PASO 1 aborta (una
--   guardia salto, un error), la frase puede quedar viva en esa conexion: el
--   SET se revierte solo cuando el editor mando las dos sentencias en una sola
--   transaccion, y desde aqui no hay forma de saber si fue asi. Entonces una
--   ejecucion posterior del archivo -cuya linea del SET esta comentada- podria
--   encontrar el candado ya abierto y borrar. Es justo el peor momento: si una
--   guardia salto, lo mas probable es que haya datos que no se deben borrar.
--
--   POR ESO, DESPUES DE CUALQUIER EJECUCION QUE FALLE, antes de tocar nada
--   mas, ejecute sola esta linea:
--
--       reset satag.confirmo_borrado;
--
--   y compruebe que quedo vacio:
--
--       select coalesce(current_setting('satag.confirmo_borrado', true), '') as candado;
--
--   Debe devolver la cadena vacia. Si devuelve la frase, vuelva a ejecutar el
--   reset en esa misma ventana hasta que salga vacia.
--
-- ---------------------------------------------------------------------
-- DIFERENCIAS CON limpiar_padron_piloto.sql (y por que)
-- ---------------------------------------------------------------------
--   - Borra tambien intentos_publicos (bloque 51): guarda las IP de quien uso
--     el buzon durante las pruebas.
--   - Borra cada tabla de forma explicita (de hijas a madres) en vez de
--     confiar en la cascada, para reportar cuantas filas salieron de cada una.
--     Cada DELETE lleva un WHERE siempre verdadero: el bloque 54 documenta que
--     safeupdate de Supabase rechaza un DELETE sin WHERE; no se ha comprobado
--     si aplica en el SQL Editor, y con el WHERE da igual.
--   - Baja solo los DOS triggers que estorban (tg_pagos_no_borrar_sellado y
--     tg_cortes_inmutables), no los cuatro: aqui nunca se hace UPDATE ni
--     TRUNCATE sobre pagos, asi que tg_pagos_congelar_sellado y
--     tg_pagos_no_truncar_sellado no se disparan y se quedan en guardia.
--   - Bloquea las tablas antes de contar, agrega guardias (fecha, llaves
--     foraneas y triggers desconocidos) y verifica por dentro antes de
--     reiniciar las secuencias.
--   - Reinicia las secuencias AL FINAL: setval NO se revierte con la
--     transaccion (las secuencias no son transaccionales en PostgreSQL). Si se
--     reiniciaran antes y algo fallara despues, el padron quedaria con sus
--     datos pero con el folio en 1, y el alta siguiente chocaria contra un
--     folio ya usado.
--     Ponerlas al final achica esa ventana pero no la cierra del todo: si la
--     transaccion fallara YA AL CONFIRMAR (despues del cuerpo del bloque), los
--     setval quedarian hechos y los datos no. Es muy poco probable -el `set
--     constraints all immediate` del paso 7 ya vacio la cola diferida, asi que
--     solo lo provocaria una falla de infraestructura-, y el PASO 2.2 trae la
--     resincronizacion por si pasa.
--
-- LOS CANDADOS CONTABLES DEL BLOQUE 42, Y POR QUE BAJARLOS ES SEGURO AQUI.
--   `tg_pagos_no_borrar_sellado` impide borrar un pago ya sellado por un
--   corte y `tg_cortes_inmutables` impide borrar un corte, incluso al owner
--   desde el SQL Editor. Las pruebas de cobro y corte los activan de verdad,
--   asi que sin bajarlos el borrado se detiene. Se bajan con
--   `alter table ... disable trigger`, que en PostgreSQL es transaccional:
--     - Ocurre DENTRO de la misma transaccion del borrado y se vuelven a
--       subir antes de que termine. Ninguna otra sesion llega a ver los
--       triggers apagados: el cambio en el catalogo no es visible fuera hasta
--       el commit, y para entonces ya estan encendidos otra vez.
--     - Si cualquier cosa falla en medio, el rollback los deja encendidos.
--     - Mientras dura, las tablas estan bloqueadas contra escritura (paso 2),
--       asi que nadie puede cobrar ni cortar con los candados abajo.
--     - La verificacion interna comprueba que los cuatro triggers del bloque
--       42 terminen encendidos; si no, aborta.
--   Bajarlos solo tiene sentido porque TODOS los cortes que hay hoy son de
--   prueba. Con un solo corte real en la base, este script no se corre.
--
-- LA FK DIFERIDA. pagos.corte_id -> cortes_caja es DEFERRABLE INITIALLY
--   DEFERRED (bloque 42). Borrar un corte deja encolada la comprobacion de
--   esa FK hasta el commit, y con la cola pendiente PostgreSQL rechaza el
--   ALTER TABLE que vuelve a subir el trigger ("cannot ALTER TABLE
--   cortes_caja because it has pending trigger events", ya visto el 10-sep).
--   Por eso se fuerza `set constraints all immediate` antes de subirlos.
--
-- Mensajes de error sin acentos, de usted. Archivo en ASCII.
-- =====================================================================


-- #####################################################################
-- PASO 0 — LECTURA. Solo select. Corralo completo y GUARDE el resultado
-- (captura o CSV): el PASO 2 se compara contra estos numeros.
-- #####################################################################

-- 0.1  Conteo por tabla. Las filas "SE CONSERVA" deben dar el MISMO numero
--      en el PASO 2 (salvo "inventario_tags asignados", que debe dar 0).
select orden, bloque, tabla, filas from (
              select  1 as orden, 'SE BORRA' as bloque, 'registros' as tabla, count(*) as filas from registros
    union all select  2, 'SE BORRA',    'aceptaciones (evidencia de firma)',             count(*) from aceptaciones
    union all select  3, 'SE BORRA',    'movimientos',                                   count(*) from movimientos
    union all select  4, 'SE BORRA',    'pagos',                                         count(*) from pagos
    union all select  5, 'SE BORRA',    'cortes_caja',                                   count(*) from cortes_caja
    union all select  6, 'SE BORRA',    'registro_estacionamientos',                     count(*) from registro_estacionamientos
    union all select  7, 'SE BORRA',    'solicitudes (tramites y notas del buzon)',      count(*) from solicitudes
    union all select  8, 'SE BORRA',    'intentos_publicos',                             count(*) from intentos_publicos
    union all select  9, 'SE BORRA EN EL PASO 3', 'archivos en el bucket firmas',        count(*) from storage.objects where bucket_id = 'firmas'
    union all select 10, 'SE CONSERVA', 'inventario_tags (total)',                       count(*) from inventario_tags
    union all select 11, 'SE CONSERVA', 'inventario_tags asignados hoy (se liberan)',    count(*) from inventario_tags where asignado_a is not null
    union all select 12, 'SE CONSERVA', 'zk_tarjetas',                                   count(*) from zk_tarjetas
    union all select 13, 'SE CONSERVA', 'estacionamientos',                              count(*) from estacionamientos
    union all select 14, 'SE CONSERVA', 'cat_marcas',                                    count(*) from cat_marcas
    union all select 15, 'SE CONSERVA', 'cat_modelos',                                   count(*) from cat_modelos
    union all select 16, 'SE CONSERVA', 'cat_colores',                                   count(*) from cat_colores
    union all select 17, 'SE CONSERVA', 'aviso_versiones',                               count(*) from aviso_versiones
    union all select 18, 'SE CONSERVA', 'reglamento_versiones',                          count(*) from reglamento_versiones
    union all select 19, 'SE CONSERVA', 'auth.users (cuentas)',                          count(*) from auth.users
    union all select 20, 'SE CONSERVA', 'auth.users con rol del panel',                  count(*) from auth.users where raw_app_meta_data ->> 'rol' is not null
) t
order by orden;

-- 0.2  Secuencias de folios, hoy. "proximo" es lo que saldria en la siguiente
--      alta, cobro o corte. Los formatos reproducen los default de los bloques
--      32 (recibo, anio de current_date) y 42 (corte, anio en hora local).
select 'registros_folio_seq' as secuencia, last_value, is_called,
       'SATAG-' || lpad((case when is_called then last_value + 1 else last_value end)::text, 6, '0') as proximo
  from registros_folio_seq
union all
select 'pagos_folio_recibo_seq', last_value, is_called,
       'SATAG-' || to_char(current_date, 'YYYY') || '-'
       || lpad((case when is_called then last_value + 1 else last_value end)::text, 6, '0')
  from pagos_folio_recibo_seq
union all
select 'cortes_caja_folio_seq', last_value, is_called,
       'SATAG-CORTE-' || to_char(now() at time zone 'America/Mexico_City', 'YYYY') || '-'
       || lpad((case when is_called then last_value + 1 else last_value end)::text, 6, '0')
  from cortes_caja_folio_seq;

-- 0.3  Documentos vigentes (deben seguir igual despues). Aviso: version 6.
--      DEBE DEVOLVER EXACTAMENTE DOS FILAS, una del aviso y una del
--      reglamento. Si falta alguna (o si hay dos vigentes de la misma), el
--      PASO 1 hace todo el borrado y lo REVIERTE al final con un "Borrado
--      revertido: no queda exactamente un aviso/reglamento vigente". Arreglelo
--      antes de correr el PASO 1: con el reglamento final de Arturo todavia
--      pendiente, es la condicion que mas facil se rompe.
select 'aviso' as documento, version, vigente from aviso_versiones where vigente
union all
select 'reglamento', version, vigente from reglamento_versiones where vigente;

-- 0.4  Personal con su rol (debe seguir igual despues).
select u.email,
       u.raw_app_meta_data ->> 'rol' as rol,
       (select count(*) from auth.mfa_factors f
         where f.user_id = u.id and f.status = 'verified') > 0 as tiene_mfa
  from auth.users u
 order by u.email;

-- 0.5  Los expedientes que se van a borrar. Reviselos: TODOS deben ser de
--      prueba. Si reconoce una sola familia real, NO siga.
--      ANOTE CUANTAS FILAS SALEN: ese numero va en c_expedientes, en el
--      declare del PASO 1. Si en medio entra o sale un expediente, el bloque
--      se detiene en vez de borrar.
select r.folio, r.usuario_nombre_completo, r.tipo_usuario, r.estado,
       r.no_dispositivo,
       r.created_at at time zone 'America/Mexico_City' as creado_hora_local
  from registros r
 order by r.folio;

-- 0.6  TAGs del inventario asignados hoy: quedaran DISPONIBLES despues del
--      borrado. Confirme que ninguno esta pegado de verdad al parabrisas de
--      un coche que va a seguir usandolo. Si alguno lo esta, anotelo: despues
--      del borrado habra que retirarlo del inventario con el patron de
--      supabase/sql/retirar_tags_instalados.sql, o TI podria entregarlo otra vez.
select i.no_dispositivo,
       r.folio,
       r.usuario_nombre_completo,
       r.estado,
       coalesce(r.no_dispositivo = i.no_dispositivo, false)                            as instalado_en_el_expediente,
       coalesce(r.tag_apartado and r.tag_apartado_no = i.no_dispositivo, false)        as apartado,
       i.asignado_por,
       i.asignado_en at time zone 'America/Mexico_City'                                as asignado_hora_local,
       exists (select 1 from zk_tarjetas z where z.no_dispositivo = i.no_dispositivo)  as esta_en_el_mapa_de_zk
  from inventario_tags i
  left join registros r on r.id = i.asignado_a
 where i.asignado_a is not null
 order by i.no_dispositivo;

-- 0.7  GUARDIA (misma del PASO 1): lo creado DESPUES de que el equipo dejo de
--      probar. DEBE SALIR SIN FILAS. Si sale algo, el PASO 1 se va a negar a
--      borrar: pueden ser familias reales que entraron solas por el formulario
--      publico (esta en linea y anon puede dar de alta).
--
--      >>> CAMBIE LA FECHA Y LA HORA DE LA LINEA DE ABAJO por el instante en
--      >>> que el equipo dejo de probar, en hora de Queretaro, y teclee ese
--      >>> MISMO instante en c_corte del PASO 1.
with corte as (
    select ('2026-09-11 20:00:00'::timestamp at time zone 'America/Mexico_City') as c_corte
)
select 'registros' as tabla, r.folio as referencia, r.created_at at time zone 'America/Mexico_City' as creado_hora_local
  from registros r, corte c
 where r.created_at >= c.c_corte
union all
select 'pagos', p.folio_recibo, p.created_at at time zone 'America/Mexico_City'
  from pagos p, corte c
 where p.created_at >= c.c_corte
union all
select 'solicitudes', s.id::text, s.created_at at time zone 'America/Mexico_City'
  from solicitudes s, corte c
 where s.created_at >= c.c_corte
union all
-- cortes_caja no cuelga de registros: sin esta rama, un corte cerrado sobre
-- cobros anteriores no dispara la guardia y se borraria sin aviso, siendo un
-- documento contable que el bloque 42 no deja rehacer.
select 'cortes_caja', k.folio_corte, k.created_at at time zone 'America/Mexico_City'
  from cortes_caja k, corte c
 where k.created_at >= c.c_corte
order by 3;

-- 0.8  GUARDIA (misma del PASO 1): llaves foraneas que apuntan a una tabla
--      que se va a borrar desde una tabla que NO esta en el repo. DEBE SALIR
--      SIN FILAS. Las conocidas son aceptaciones, movimientos, pagos,
--      registro_estacionamientos, solicitudes e inventario_tags -> registros,
--      y pagos -> cortes_caja. Una desconocida con ON DELETE CASCADE borraria
--      en silencio datos que este script no conoce.
select c.conname,
       ns.nspname || '.' || src.relname as tabla_que_referencia,
       nd.nspname || '.' || dst.relname as tabla_referida,
       c.confdeltype                    as al_borrar   -- a=no action, r=restrict, c=cascade, n=set null, d=set default
  from pg_constraint c
  join pg_class     src on src.oid = c.conrelid
  join pg_namespace ns  on ns.oid  = src.relnamespace
  join pg_class     dst on dst.oid = c.confrelid
  join pg_namespace nd  on nd.oid  = dst.relnamespace
 where c.contype = 'f'
   and nd.nspname = 'public'
   and dst.relname in ('registros','aceptaciones','movimientos','pagos','registro_estacionamientos',
                       'solicitudes','cortes_caja','intentos_publicos')
   and not (ns.nspname = 'public'
            and src.relname in ('registros','aceptaciones','movimientos','pagos','registro_estacionamientos',
                                'solicitudes','cortes_caja','intentos_publicos','inventario_tags'))
 order by 2, 1;

-- 0.9  GUARDIA (misma del PASO 1): triggers de usuario en las tablas que se
--      tocan. DEBEN SALIR EXACTAMENTE CUATRO, los del bloque 42, todos con
--      tgenabled = 'O' (encendido): tg_cortes_inmutables en cortes_caja y
--      tg_pagos_congelar_sellado, tg_pagos_no_borrar_sellado y
--      tg_pagos_no_truncar_sellado en pagos. Uno mas es algo hecho a mano
--      fuera del repo y el PASO 1 se detiene.
select c.relname as tabla, t.tgname as trigger, t.tgenabled
  from pg_trigger t
  join pg_class     c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and not t.tgisinternal
   and c.relname in ('registros','aceptaciones','movimientos','pagos','registro_estacionamientos',
                     'solicitudes','cortes_caja','intentos_publicos','inventario_tags')
 order by 1, 2;

-- 0.10 Tablas de `public` que el script NO clasifica (ni borra ni verifica).
--      DEBE SALIR SIN FILAS: los bloques aplicados definen 16 tablas y todas
--      quedan clasificadas aqui. La unica adicional del repo es `error_logs`
--      (supabase/schema.sql), documentada como nunca instalada en el esquema
--      aplicado (Desarrollo/01 - Modelo de Datos y Base de Datos.md) y que
--      viene del respaldo historico que ese mismo archivo prohibe instalar.
--      Si el resultado la muestra, avise a Gerardo: guardaria detalle jsonb de
--      las pruebas y este script no la borra. Con cualquier otra tabla, igual:
--      este script NO la toca; se decide con Gerardo si es catalogo o dato de
--      prueba.
select t.tablename as tabla_sin_clasificar,
       (xpath('/row/n/text()',
              query_to_xml(format('select count(*) as n from %I.%I', t.schemaname, t.tablename),
                           false, true, '')))[1]::text::bigint as filas
  from pg_tables t
 where t.schemaname = 'public'
   and t.tablename not in ('registros','aceptaciones','movimientos','pagos','registro_estacionamientos',
                           'solicitudes','cortes_caja','intentos_publicos',
                           'inventario_tags','zk_tarjetas','estacionamientos','cat_marcas',
                           'cat_modelos','cat_colores','aviso_versiones','reglamento_versiones')
 order by 1;


-- #####################################################################
-- PASO 1 — BORRADO. Destructivo. Una sola transaccion, con candado.
--
-- Pegue como PRIMERA linea, en la MISMA ejecucion, arriba del do $$:
--
--     set satag.confirmo_borrado = 'SI, BORRAR TODO SALVO LOS TAGS';
--
-- y ejecute las dos cosas juntas. Sin la frase exacta aborta sin tocar nada.
--
-- ANTES DE EJECUTAR, TECLEE LOS DOS DATOS marcados con >>> en el declare:
--   c_corte        el instante en que el equipo DEJO DE PROBAR (hora local),
--                  el mismo que puso en la consulta 0.7.
--   c_expedientes  cuantos expedientes le salieron en la lista del PASO 0.5.
-- Los dos vienen sin valor a proposito: son la unica red automatica contra
-- borrar a una familia que se haya dado de alta sola por el formulario
-- publico. Sin ellos el bloque aborta sin tocar nada.
--
-- Si el editor no muestra los avisos (NOTICE) del final, no importa: los
-- numeros los da el PASO 2. Un error, en cambio, siempre se muestra, y
-- significa que NO se borro nada. DESPUES DE UN ERROR, ejecute sola la linea
-- `reset satag.confirmo_borrado;` (ver el encabezado) antes de seguir.
-- #####################################################################
do $$
declare
    c_frase   constant text := 'SI, BORRAR TODO SALVO LOS TAGS';

    -- >>> TECLEE AQUI el instante en que el equipo dejo de probar, en hora de
    -- >>> Queretaro (el mismo de la consulta 0.7). Todo lo creado a partir de
    -- >>> ese instante detiene el borrado: puede ser una familia real que se
    -- >>> dio de alta sola por el formulario publico. Dejelo en null y el
    -- >>> bloque aborta.
    c_corte   constant timestamptz := null;  -- ejemplo: ('2026-09-11 20:00:00'::timestamp at time zone 'America/Mexico_City')

    -- >>> TECLEE AQUI cuantos expedientes conto en la lista del PASO 0.5. Si
    -- >>> el padron trae otro numero, algo entro o salio entre su lectura y
    -- >>> este borrado y el bloque aborta. En -1 aborta pidiendo el dato.
    c_expedientes constant integer := -1;

    -- Tope de cordura: el corte tiene que ser anterior al lunes 14-sep, que es
    -- cuando el personal empieza a operar con familias reales.
    c_lunes   constant timestamptz := ('2026-09-14 00:00:00'::timestamp at time zone 'America/Mexico_City');
    c_borrar  constant text[] := array['registros','aceptaciones','movimientos','pagos',
                                       'registro_estacionamientos','solicitudes','cortes_caja',
                                       'intentos_publicos'];

    v_confirma  text := coalesce(current_setting('satag.confirmo_borrado', true), '');
    v_lista     text;
    v_n         bigint;
    v_tabla     text;

    -- Lo que se conserva, contado al empezar (ya con las tablas bloqueadas).
    a_inv_total  bigint;
    a_zk         bigint;
    a_estac      bigint;
    a_marcas     bigint;
    a_modelos    bigint;
    a_colores    bigint;
    a_aviso      bigint;
    a_reglamento bigint;
    a_usuarios   bigint;
    a_con_rol    bigint;

    -- Lo que se borra, fila por fila.
    n_liberados  bigint;
    n_mov        bigint;
    n_acep       bigint;
    n_estac      bigint;
    n_sol        bigint;
    n_pagos      bigint;
    n_reg        bigint;
    n_cortes     bigint;
    n_intentos   bigint;
begin
    -- -----------------------------------------------------------------
    -- 1. Candado.
    -- -----------------------------------------------------------------
    if v_confirma <> c_frase then
        raise exception 'Borrado cancelado: falta la confirmacion. Pegue como PRIMERA linea, en la MISMA ejecucion que este paso:  set satag.confirmo_borrado = ''%'';  y vuelva a ejecutar. No se borro nada.', c_frase;
    end if;

    -- -----------------------------------------------------------------
    -- 1b. Los dos datos que teclea el operador. Sin ellos no hay red.
    -- -----------------------------------------------------------------
    if c_corte is null then
        raise exception 'Borrado cancelado: falta c_corte. Teclee en el declare el instante en que el equipo dejo de probar, en hora local, por ejemplo  c_corte constant timestamptz := (''2026-09-11 20:00:00''::timestamp at time zone ''America/Mexico_City'');  No se borro nada.';
    end if;
    if c_corte > now() then
        raise exception 'Borrado cancelado: c_corte (%) esta en el futuro. Tiene que ser el instante en que YA se dejo de probar. No se borro nada.', c_corte at time zone 'America/Mexico_City';
    end if;
    if c_corte > c_lunes then
        raise exception 'Borrado cancelado: c_corte (%) cae en el lunes 14-sep o despues, cuando el sistema ya opera con familias reales. No se borro nada; consulte a Gerardo.', c_corte at time zone 'America/Mexico_City';
    end if;
    if c_expedientes < 0 then
        raise exception 'Borrado cancelado: falta c_expedientes. Teclee en el declare cuantos expedientes le salieron en la lista del PASO 0.5. No se borro nada.';
    end if;

    -- -----------------------------------------------------------------
    -- 2. Nadie escribe mientras se limpia. EXCLUSIVE deja leer (el panel
    --    sigue abriendo) pero hace esperar a cualquier alta, cobro,
    --    instalacion, nota o reserva hasta que esto termine. Sin esto, un alta
    --    podria colarse entre el conteo y el borrado.
    -- -----------------------------------------------------------------
    lock table registros, aceptaciones, movimientos, pagos, registro_estacionamientos,
               solicitudes, cortes_caja, intentos_publicos, inventario_tags
        in exclusive mode;

    -- Las tablas que se CONSERVAN tambien se congelan, en SHARE (deja leer,
    -- hace esperar a quien escriba). No es por el borrado: es porque la
    -- verificacion del paso 8 las cuenta al empezar y al terminar, y un cambio
    -- legitimo en medio (TI agrega un modelo, alguien carga el mapa de ZK)
    -- abortaria todo el borrado con un mensaje que se lee como perdida de
    -- datos. auth.users no se puede bloquear desde aqui (es del esquema auth,
    -- de otro duenio): si cambia en medio, el paso 8 lo explica.
    lock table zk_tarjetas, estacionamientos, cat_marcas, cat_modelos, cat_colores,
               aviso_versiones, reglamento_versiones
        in share mode;

    -- -----------------------------------------------------------------
    -- 3. Guardias. Cualquiera que salte aborta sin tocar nada.
    -- -----------------------------------------------------------------

    -- 3a. Nada creado despues de que terminaron las pruebas (pueden ser
    --     familias reales: el formulario publico esta en linea todo el fin de
    --     semana y anon puede ejecutar crear_registro, bloque 63).
    --     cortes_caja va aparte porque no cuelga de registros: un corte
    --     cerrado sobre cobros anteriores no aparece por ninguna de las otras
    --     ramas, y es un documento contable que el bloque 42 no deja rehacer.
    select string_agg(ref, ', ' order by ref) into v_lista
      from (
            select 'expediente ' || folio      as ref from registros   where created_at >= c_corte
        union all
            select 'recibo '     || folio_recibo       from pagos       where created_at >= c_corte
        union all
            select 'solicitud '  || id::text           from solicitudes where created_at >= c_corte
        union all
            select 'corte '      || folio_corte        from cortes_caja where created_at >= c_corte
      ) s;
    if v_lista is not null then
        raise exception 'Borrado cancelado: hay datos creados despues del corte que usted indico, % (%). Pueden ser de familias reales. No se borro nada; no rodee esta guardia y consulte a Gerardo.', c_corte at time zone 'America/Mexico_City', v_lista;
    end if;

    -- 3b. Ninguna llave foranea desconocida hacia lo que se borra.
    select string_agg(format('%s.%s -> %s (%s)', ns.nspname, src.relname, dst.relname, c.conname), ', ')
      into v_lista
      from pg_constraint c
      join pg_class     src on src.oid = c.conrelid
      join pg_namespace ns  on ns.oid  = src.relnamespace
      join pg_class     dst on dst.oid = c.confrelid
      join pg_namespace nd  on nd.oid  = dst.relnamespace
     where c.contype = 'f'
       and nd.nspname = 'public'
       and dst.relname::text = any (c_borrar)
       and not (ns.nspname = 'public'
                and (src.relname::text = any (c_borrar) or src.relname = 'inventario_tags'));
    if v_lista is not null then
        raise exception 'Borrado cancelado: hay llaves foraneas que no estan en el repo y apuntan a tablas que se borran: %. No se borro nada; revise esas tablas con Gerardo antes de seguir.', v_lista;
    end if;

    -- 3c. Solo los cuatro triggers del bloque 42 en las tablas que se tocan, y
    --     todos en su estado normal (tgenabled = 'O', encendido). Lo segundo
    --     importa porque `alter table ... enable trigger` del paso 7 deja
    --     SIEMPRE 'O': si alguno estuviera en 'A' (always) o 'R' (replica),
    --     este script le cambiaria la configuracion en silencio y la
    --     verificacion final, que exige 'O', pasaria sin avisar. Es el unico
    --     punto donde se alteraria de forma no reversible algo del esquema que
    --     se conserva, asi que se prefiere detenerse.
    select string_agg(format('%s.%s (estado %s)', c.relname, t.tgname, t.tgenabled), ', ')
      into v_lista
      from pg_trigger t
      join pg_class     c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and not t.tgisinternal
       and (c.relname::text = any (c_borrar) or c.relname = 'inventario_tags')
       and ((c.relname::text, t.tgname::text) not in (('pagos', 'tg_pagos_no_borrar_sellado'),
                                                      ('pagos', 'tg_pagos_no_truncar_sellado'),
                                                      ('pagos', 'tg_pagos_congelar_sellado'),
                                                      ('cortes_caja', 'tg_cortes_inmutables'))
            or t.tgenabled <> 'O');
    if v_lista is not null then
        raise exception 'Borrado cancelado: hay triggers que no estan en el repo, o que no estan en el estado esperado ''O'': %. No se borro nada; revise que hacen y en que estado estan antes de seguir.', v_lista;
    end if;

    select count(*) into v_n
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and (c.relname::text, t.tgname::text) in (('pagos', 'tg_pagos_no_borrar_sellado'),
                                                 ('cortes_caja', 'tg_cortes_inmutables'));
    if v_n <> 2 then
        raise exception 'Borrado cancelado: no se encontraron los dos candados del bloque 42 (tg_pagos_no_borrar_sellado y tg_cortes_inmutables); se encontraron %. No se borro nada.', v_n;
    end if;

    -- 3d. El padron trae exactamente los expedientes que usted conto en 0.5.
    --     Es la red contra lo que la fecha no ve: si entro (o salio) un
    --     expediente entre su lectura y este borrado, aqui se detiene aunque
    --     su created_at cayera antes del corte.
    select count(*) into v_n from registros;
    if v_n <> c_expedientes then
        raise exception 'Borrado cancelado: usted conto % expediente(s) en el PASO 0.5 y el padron tiene %. Algo entro o salio en medio. No se borro nada; vuelva a correr el PASO 0 y revise la lista antes de seguir.', c_expedientes, v_n;
    end if;

    -- -----------------------------------------------------------------
    -- Conteo de lo que se conserva, para compararlo al final.
    -- -----------------------------------------------------------------
    select count(*) into a_inv_total  from inventario_tags;
    select count(*) into a_zk         from zk_tarjetas;
    select count(*) into a_estac      from estacionamientos;
    select count(*) into a_marcas     from cat_marcas;
    select count(*) into a_modelos    from cat_modelos;
    select count(*) into a_colores    from cat_colores;
    select count(*) into a_aviso      from aviso_versiones;
    select count(*) into a_reglamento from reglamento_versiones;
    select count(*) into a_usuarios   from auth.users;
    select count(*) into a_con_rol    from auth.users where raw_app_meta_data ->> 'rol' is not null;

    -- -----------------------------------------------------------------
    -- 4. Liberar el inventario ANTES de borrar registros: inventario_tags.
    --    asignado_a referencia a registros sin cascada, asi que con una sola
    --    reserva viva el DELETE de registros fallaria. Ningun TAG se borra.
    --    El CHECK inv_asignacion_coherente admite los tres campos en null.
    -- -----------------------------------------------------------------
    update inventario_tags
       set asignado_a = null, asignado_en = null, asignado_por = null
     where asignado_a is not null;
    get diagnostics n_liberados = row_count;

    -- -----------------------------------------------------------------
    -- 5. Bajar SOLO los dos candados contables que estorban (ver encabezado).
    --    Transaccional: se suben otra vez en el paso 7, y si algo falla, el
    --    rollback los deja encendidos.
    -- -----------------------------------------------------------------
    execute 'alter table pagos       disable trigger tg_pagos_no_borrar_sellado';
    execute 'alter table cortes_caja disable trigger tg_cortes_inmutables';

    -- -----------------------------------------------------------------
    -- 6. Borrado, de hijas a madres. WHERE siempre verdadero (safeupdate).
    -- -----------------------------------------------------------------
    delete from movimientos               where id is not null;           get diagnostics n_mov      = row_count;
    delete from aceptaciones              where id is not null;           get diagnostics n_acep     = row_count;
    delete from registro_estacionamientos where registro_id is not null;  get diagnostics n_estac    = row_count;
    -- Todas: tramites con expediente y notas del buzon sin vincular (registro_id null).
    delete from solicitudes               where id is not null;           get diagnostics n_sol      = row_count;
    delete from pagos                     where id is not null;           get diagnostics n_pagos    = row_count;
    delete from registros                 where id is not null;           get diagnostics n_reg      = row_count;
    -- cortes_caja no cuelga de registros: es pagos quien la referencia.
    delete from cortes_caja               where id is not null;           get diagnostics n_cortes   = row_count;
    delete from intentos_publicos         where id is not null;           get diagnostics n_intentos = row_count;

    -- -----------------------------------------------------------------
    -- 7. Vaciar la cola de la FK diferida pagos.corte_id y subir los candados.
    --    Sin el set constraints, el ALTER TABLE de cortes_caja falla con
    --    "pending trigger events" y revierte todo (visto el 10-sep).
    -- -----------------------------------------------------------------
    execute 'set constraints all immediate';

    execute 'alter table pagos       enable trigger tg_pagos_no_borrar_sellado';
    execute 'alter table cortes_caja enable trigger tg_cortes_inmutables';

    -- -----------------------------------------------------------------
    -- 8. Verificacion por dentro. Si algo no cuadra, se revierte TODO.
    --    Va antes del paso 9 porque setval no se revierte.
    -- -----------------------------------------------------------------
    foreach v_tabla in array c_borrar loop
        execute format('select count(*) from public.%I', v_tabla) into v_n;
        if v_n <> 0 then
            raise exception 'Borrado revertido: la tabla % quedo con % fila(s). No se borro nada.', v_tabla, v_n;
        end if;
    end loop;

    select count(*) into v_n from inventario_tags;
    if v_n <> a_inv_total then
        raise exception 'Borrado revertido: el inventario tenia % TAG(s) y quedaria con %. No se borro nada.', a_inv_total, v_n;
    end if;
    select count(*) into v_n from inventario_tags where asignado_a is not null;
    if v_n <> 0 then
        raise exception 'Borrado revertido: quedaron % TAG(s) asignados en el inventario. No se borro nada.', v_n;
    end if;

    -- Estas comparaciones NO dicen que se haya perdido algo: dicen que el
    -- conteo cambio DURANTE la limpieza. Las tablas de public estan en SHARE
    -- desde el paso 2, asi que aqui practicamente solo puede saltar auth.users
    -- (que no se puede bloquear). Si salta alguna, nadie perdio nada: basta
    -- volver a correr el PASO 1 con el equipo quieto.
    select count(*) into v_n from zk_tarjetas;
    if v_n <> a_zk then raise exception 'Borrado revertido: zk_tarjetas paso de % a % DURANTE la limpieza (nadie perdio datos: alguien escribio en medio). No se borro nada; repita el PASO 1 con el equipo quieto.', a_zk, v_n; end if;
    select count(*) into v_n from estacionamientos;
    if v_n <> a_estac then raise exception 'Borrado revertido: estacionamientos paso de % a % DURANTE la limpieza (nadie perdio datos: alguien escribio en medio). No se borro nada; repita el PASO 1 con el equipo quieto.', a_estac, v_n; end if;
    select count(*) into v_n from cat_marcas;
    if v_n <> a_marcas then raise exception 'Borrado revertido: cat_marcas paso de % a % DURANTE la limpieza (nadie perdio datos: alguien escribio en medio). No se borro nada; repita el PASO 1 con el equipo quieto.', a_marcas, v_n; end if;
    select count(*) into v_n from cat_modelos;
    if v_n <> a_modelos then raise exception 'Borrado revertido: cat_modelos paso de % a % DURANTE la limpieza (nadie perdio datos: alguien escribio en medio). No se borro nada; repita el PASO 1 con el equipo quieto.', a_modelos, v_n; end if;
    select count(*) into v_n from cat_colores;
    if v_n <> a_colores then raise exception 'Borrado revertido: cat_colores paso de % a % DURANTE la limpieza (nadie perdio datos: alguien escribio en medio). No se borro nada; repita el PASO 1 con el equipo quieto.', a_colores, v_n; end if;
    select count(*) into v_n from aviso_versiones;
    if v_n <> a_aviso then raise exception 'Borrado revertido: aviso_versiones paso de % a % DURANTE la limpieza (nadie perdio datos: alguien escribio en medio). No se borro nada; repita el PASO 1 con el equipo quieto.', a_aviso, v_n; end if;
    select count(*) into v_n from reglamento_versiones;
    if v_n <> a_reglamento then raise exception 'Borrado revertido: reglamento_versiones paso de % a % DURANTE la limpieza (nadie perdio datos: alguien escribio en medio). No se borro nada; repita el PASO 1 con el equipo quieto.', a_reglamento, v_n; end if;
    select count(*) into v_n from auth.users;
    if v_n <> a_usuarios then raise exception 'Borrado revertido: auth.users paso de % a % DURANTE la limpieza. No es perdida de datos: se creo o se borro una cuenta del personal mientras corria esto (auth.users no se puede bloquear desde aqui). No se borro nada; repita el PASO 1 cuando nadie este tocando cuentas.', a_usuarios, v_n; end if;
    select count(*) into v_n from auth.users where raw_app_meta_data ->> 'rol' is not null;
    if v_n <> a_con_rol then raise exception 'Borrado revertido: las cuentas con rol pasaron de % a % DURANTE la limpieza. No es perdida de datos: se asigno o se quito un rol mientras corria esto. No se borro nada; repita el PASO 1 cuando nadie este tocando cuentas.', a_con_rol, v_n; end if;

    select count(*) into v_n from aviso_versiones where vigente;
    if v_n <> 1 then raise exception 'Borrado revertido: no queda exactamente un aviso vigente (hay %). No se borro nada.', v_n; end if;
    select count(*) into v_n from reglamento_versiones where vigente;
    if v_n <> 1 then raise exception 'Borrado revertido: no queda exactamente un reglamento vigente (hay %). No se borro nada.', v_n; end if;

    select count(*) into v_n
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and t.tgenabled = 'O'
       and (c.relname::text, t.tgname::text) in (('pagos', 'tg_pagos_no_borrar_sellado'),
                                                 ('pagos', 'tg_pagos_no_truncar_sellado'),
                                                 ('pagos', 'tg_pagos_congelar_sellado'),
                                                 ('cortes_caja', 'tg_cortes_inmutables'));
    if v_n <> 4 then
        raise exception 'Borrado revertido: solo % de los 4 candados del bloque 42 quedarian encendidos. No se borro nada.', v_n;
    end if;

    -- -----------------------------------------------------------------
    -- 9. Folios desde el principio. LO ULTIMO, a proposito: setval no se
    --    revierte con la transaccion. Con (1, false), el siguiente nextval
    --    devuelve 1: primer expediente SATAG-000001, primer recibo
    --    SATAG-2026-000001, primer corte SATAG-CORTE-2026-000001.
    --    La secuencia del id de intentos_publicos (bigserial) no se toca: no
    --    es un folio y nadie la ve.
    -- -----------------------------------------------------------------
    perform setval('public.registros_folio_seq',    1, false);
    perform setval('public.pagos_folio_recibo_seq', 1, false);
    perform setval('public.cortes_caja_folio_seq',  1, false);

    -- -----------------------------------------------------------------
    -- 10. Cerrar otra vez el candado en esta conexion.
    -- -----------------------------------------------------------------
    perform set_config('satag.confirmo_borrado', '', false);

    raise notice 'Base limpia (%). Borrado: % expediente(s), % aceptacion(es), % movimiento(s), % pago(s), % corte(s), % asignacion(es) de estacionamiento, % solicitud(es) y nota(s), % intento(s) publico(s).',
        to_char(now() at time zone 'America/Mexico_City', 'DD-MM-YYYY HH24:MI:SS'),
        n_reg, n_acep, n_mov, n_pagos, n_cortes, n_estac, n_sol, n_intentos;
    raise notice 'Conservado: % TAG(s) en inventario (% liberado(s), todos disponibles), % tarjeta(s) en el mapa de ZK, % cuenta(s) del personal. Folios reiniciados. Siga con el PASO 2 y despues con el PASO 3 (firmas).',
        a_inv_total, n_liberados, a_zk, a_usuarios;
end;
$$;

-- SI EL BLOQUE DE ARRIBA FALLO (guardia que salta o error de cualquier tipo):
-- no se borro nada, pero la frase del candado puede haber quedado viva en esa
-- conexion. Antes de tocar nada mas, ejecute SOLA esta linea:
--
--     reset satag.confirmo_borrado;
--
-- y compruebe que quedo vacia:
--
--     select coalesce(current_setting('satag.confirmo_borrado', true), '') as candado;
--
-- Si no lo hace, una ejecucion posterior de este archivo (con la linea del SET
-- comentada, como esta guardado) podria encontrar el candado abierto y borrar.


-- #####################################################################
-- PASO 2 — VERIFICACION. Solo select. Compare contra lo que guardo del
-- PASO 0: mismo orden de filas.
-- #####################################################################

-- 2.1  Conteo. "esperado" dice lo que debe salir; donde dice "igual que en el
--      PASO 0", compare a mano con su captura. La fila 9 (firmas) solo llega
--      a 0 despues del PASO 3.
--
--      La columna "senal" no depende de esa captura: marca sola lo que se ve
--      mal aunque usted no tenga el PASO 0 delante. Es util porque "igual que
--      en el PASO 0" no distingue un catalogo intacto de uno vaciado, y la
--      fila 11 (asignados = 0) la cumple tambien un inventario vacio.
--      Aun asi, la red de verdad es la verificacion interna del PASO 1, que
--      revierte el borrado si algo de lo conservado cambio; esto es la segunda
--      lectura.
--      Una salvedad: en la fila 12, "REVISE: vacia" es normal si nunca se
--      cargo el mapa de ZK (bloque 54). Confirmelo contra el PASO 0.
select orden, bloque, tabla, filas, esperado, senal from (
              select  1 as orden, 'DEBE ESTAR VACIO' as bloque, 'registros' as tabla, count(*) as filas, '0' as esperado,
                      case when count(*) = 0 then 'ok' else 'ALERTA: quedaron filas' end as senal from registros
    union all select  2, 'DEBE ESTAR VACIO', 'aceptaciones (evidencia de firma)',           count(*), '0', case when count(*) = 0 then 'ok' else 'ALERTA: quedaron filas' end from aceptaciones
    union all select  3, 'DEBE ESTAR VACIO', 'movimientos',                                 count(*), '0', case when count(*) = 0 then 'ok' else 'ALERTA: quedaron filas' end from movimientos
    union all select  4, 'DEBE ESTAR VACIO', 'pagos',                                       count(*), '0', case when count(*) = 0 then 'ok' else 'ALERTA: quedaron filas' end from pagos
    union all select  5, 'DEBE ESTAR VACIO', 'cortes_caja',                                 count(*), '0', case when count(*) = 0 then 'ok' else 'ALERTA: quedaron filas' end from cortes_caja
    union all select  6, 'DEBE ESTAR VACIO', 'registro_estacionamientos',                   count(*), '0', case when count(*) = 0 then 'ok' else 'ALERTA: quedaron filas' end from registro_estacionamientos
    union all select  7, 'DEBE ESTAR VACIO', 'solicitudes (tramites y notas del buzon)',    count(*), '0', case when count(*) = 0 then 'ok' else 'ALERTA: quedaron filas' end from solicitudes
    union all select  8, 'DEBE ESTAR VACIO', 'intentos_publicos',                           count(*), '0', case when count(*) = 0 then 'ok' else 'ALERTA: quedaron filas' end from intentos_publicos
    union all select  9, 'SE VACIA EN EL PASO 3', 'archivos en el bucket firmas',           count(*), '0 despues del PASO 3', case when count(*) = 0 then 'ok: bucket vacio' else 'pendiente: falta el PASO 3' end from storage.objects where bucket_id = 'firmas'
    union all select 10, 'DEBE SEGUIR AHI',  'inventario_tags (total)',                     count(*), 'igual que en el PASO 0', case when count(*) > 0 then 'ok: hay inventario' else 'ALERTA: inventario VACIO' end from inventario_tags
    union all select 11, 'DEBE SEGUIR AHI',  'inventario_tags asignados',                   count(*), '0 (todos disponibles)', case when count(*) = 0 then 'ok: ninguno asignado (vea la fila 10: el total debe ser > 0)' else 'ALERTA: quedaron asignados' end from inventario_tags where asignado_a is not null
    union all select 12, 'DEBE SEGUIR AHI',  'zk_tarjetas',                                 count(*), 'igual que en el PASO 0', case when count(*) > 0 then 'ok: no esta vacia' else 'REVISE: vacia' end from zk_tarjetas
    union all select 13, 'DEBE SEGUIR AHI',  'estacionamientos',                            count(*), 'igual que en el PASO 0', case when count(*) > 0 then 'ok: no esta vacia' else 'ALERTA: vacia' end from estacionamientos
    union all select 14, 'DEBE SEGUIR AHI',  'cat_marcas',                                  count(*), 'igual que en el PASO 0', case when count(*) > 0 then 'ok: no esta vacia' else 'ALERTA: vacia' end from cat_marcas
    union all select 15, 'DEBE SEGUIR AHI',  'cat_modelos',                                 count(*), 'igual que en el PASO 0', case when count(*) > 0 then 'ok: no esta vacia' else 'ALERTA: vacia' end from cat_modelos
    union all select 16, 'DEBE SEGUIR AHI',  'cat_colores',                                 count(*), 'igual que en el PASO 0', case when count(*) > 0 then 'ok: no esta vacia' else 'ALERTA: vacia' end from cat_colores
    union all select 17, 'DEBE SEGUIR AHI',  'aviso_versiones',                             count(*), 'igual que en el PASO 0', case when count(*) > 0 then 'ok: no esta vacia' else 'ALERTA: vacia' end from aviso_versiones
    union all select 18, 'DEBE SEGUIR AHI',  'reglamento_versiones',                        count(*), 'igual que en el PASO 0', case when count(*) > 0 then 'ok: no esta vacia' else 'ALERTA: vacia' end from reglamento_versiones
    union all select 19, 'DEBE SEGUIR AHI',  'auth.users (cuentas)',                        count(*), 'igual que en el PASO 0', case when count(*) > 0 then 'ok: no esta vacia' else 'ALERTA: vacia' end from auth.users
    union all select 20, 'DEBE SEGUIR AHI',  'auth.users con rol del panel',                count(*), 'igual que en el PASO 0', case when count(*) > 0 then 'ok: no esta vacia' else 'ALERTA: nadie tiene rol' end from auth.users where raw_app_meta_data ->> 'rol' is not null
) t
order by orden;

-- 2.2  Secuencias. Las tres deben salir con last_value = 1, is_called = false
--      y "proximo" en ...000001. (Si ya entro una alta real despues del
--      borrado, registros_folio_seq saldra adelantada: es correcto.)
--
--      EL CASO CONTRARIO, Y COMO SALIR DE EL. Si las secuencias salen
--      reiniciadas pero el conteo del 2.1 NO esta en cero (o sea: los folios
--      volvieron a 1 y los expedientes de prueba siguen ahi), la transaccion
--      fallo al confirmar y los setval quedaron hechos de todos modos. NO de
--      de alta nada en ese estado: el alta siguiente pediria SATAG-000001, que
--      ya existe, y chocaria contra el unique de registros.folio.
--      Resincronice primero con estas tres lineas, que dejan cada secuencia
--      justo despues del folio mas alto que ya existe (y en 1 si la tabla
--      quedo vacia):
--
--        select setval('public.registros_folio_seq',
--                      coalesce((select max(substring(folio from '^SATAG-([0-9]+)$')::bigint) from registros), 1),
--                      (select count(*) > 0 from registros));
--        select setval('public.pagos_folio_recibo_seq',
--                      coalesce((select max(substring(folio_recibo from '^SATAG-[0-9]{4}-([0-9]+)$')::bigint) from pagos), 1),
--                      (select count(*) > 0 from pagos));
--        select setval('public.cortes_caja_folio_seq',
--                      coalesce((select max(substring(folio_corte from '^SATAG-CORTE-[0-9]{4}-([0-9]+)$')::bigint) from cortes_caja), 1),
--                      (select count(*) > 0 from cortes_caja));
--
--      Despues vuelva a correr el 2.2 y avise a Gerardo antes de reintentar el
--      PASO 1: si fallo al confirmar, algo paso con la base.
select 'registros_folio_seq' as secuencia, last_value, is_called,
       'SATAG-' || lpad((case when is_called then last_value + 1 else last_value end)::text, 6, '0') as proximo,
       (last_value = 1 and not is_called) as reiniciada
  from registros_folio_seq
union all
select 'pagos_folio_recibo_seq', last_value, is_called,
       'SATAG-' || to_char(current_date, 'YYYY') || '-'
       || lpad((case when is_called then last_value + 1 else last_value end)::text, 6, '0'),
       (last_value = 1 and not is_called)
  from pagos_folio_recibo_seq
union all
select 'cortes_caja_folio_seq', last_value, is_called,
       'SATAG-CORTE-' || to_char(now() at time zone 'America/Mexico_City', 'YYYY') || '-'
       || lpad((case when is_called then last_value + 1 else last_value end)::text, 6, '0'),
       (last_value = 1 and not is_called)
  from cortes_caja_folio_seq;

-- 2.3  Documentos vigentes: los mismos que en el PASO 0 (aviso version 6).
--      Sin ellos el formulario publico no deja pasar del consentimiento.
select 'aviso' as documento, version, vigente from aviso_versiones where vigente
union all
select 'reglamento', version, vigente from reglamento_versiones where vigente;

-- 2.4  Personal con su rol y MFA: la misma lista que en el PASO 0.
select u.email,
       u.raw_app_meta_data ->> 'rol' as rol,
       (select count(*) from auth.mfa_factors f
         where f.user_id = u.id and f.status = 'verified') > 0 as tiene_mfa
  from auth.users u
 order by u.email;

-- 2.5  Los cuatro candados del bloque 42, encendidos (tgenabled = 'O').
select c.relname as tabla, t.tgname as trigger, t.tgenabled, (t.tgenabled = 'O') as encendido
  from pg_trigger t
  join pg_class     c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and not t.tgisinternal
   and c.relname in ('pagos', 'cortes_caja')
 order by 1, 2;


-- #####################################################################
-- PASO 3 — LAS IMAGENES DE FIRMA DEL BUCKET `firmas`. Leer completo.
--
-- Son datos personales (firmas trazadas) aunque sean de prueba, y tienen que
-- irse. Tambien hay firmas huerfanas de altas que se rechazaron: el
-- formulario sube el PNG ANTES de llamar a crear_registro.
--
-- POR QUE NO SE BORRAN CON SQL:
--   1. En este proyecto ya se comprobo que un disparador de Supabase impide
--      borrar filas de storage.objects por SQL (anotado en
--      pruebas-carga/sql/limpiar-pruebas-carga.sql).
--   2. Aun donde no lo impidiera, storage.objects solo guarda los METADATOS.
--      Los bytes del PNG viven en el almacenamiento de objetos de Supabase, y
--      la documentacion de Supabase advierte que borrar la fila por SQL no
--      borra el archivo: queda huerfano, ya sin forma de encontrarlo, que es
--      lo peor que le puede pasar a una imagen de firma. El Dashboard y la
--      API de Storage borran las dos cosas.
--   (El comentario del PASO 4 de supabase/sql/limpiar_datos_prueba.sql, que
--   sugiere un `delete from storage.objects`, contradice esto: no lo use.)
--
--   Tampoco sirve pruebas-carga/limpiar-storage.mjs: solo borra `pc-<hex>.png`
--   de la prueba de carga, y las firmas se llaman `<uuid>.png`.
--
-- HAGALO DESPUES DEL PASO 1 Y ANTES DEL LUNES.
-- #####################################################################

-- 3.1  ANTES de borrar. "ligados_a_un_expediente" DEBE SER 0: despues del
--      PASO 1 no queda ninguna aceptacion, asi que todo archivo esta huerfano.
--      Si sale mayor que 0, entro un alta DESPUES del borrado (posiblemente
--      real): NO vacie el bucket; borre solo los archivos con ligado = false
--      de la lista 3.2, uno por uno, y avise a Gerardo.
select count(*)                                          as archivos_en_firmas,
       count(*) filter (where f.ligado)                  as ligados_a_un_expediente,
       min(f.created_at) at time zone 'America/Mexico_City' as el_mas_viejo,
       max(f.created_at) at time zone 'America/Mexico_City' as el_mas_nuevo
  from (
        select o.created_at,
               exists (select 1 from aceptaciones a
                        where a.firma_url = 'firmas/' || o.name) as ligado
          from storage.objects o
         where o.bucket_id = 'firmas'
       ) f;

-- 3.2  La lista, del mas nuevo al mas viejo.
select o.name as archivo,
       o.created_at at time zone 'America/Mexico_City' as subido_hora_local,
       exists (select 1 from aceptaciones a where a.firma_url = 'firmas/' || o.name) as ligado
  from storage.objects o
 where o.bucket_id = 'firmas'
 order by o.created_at desc;

-- 3.3  COMO VACIARLO (Dashboard de Supabase, con la cuenta duena del proyecto):
--
--   a) Storage > bucket `firmas`.
--   b) Si el menu del bucket (los tres puntos junto a su nombre) ofrece
--      "Empty bucket", uselo: borra todos los archivos y deja el bucket.
--      Si no aparece: dentro del bucket marque la casilla de seleccionar
--      todo y pulse Delete. Si hay mas de una pagina, repita hasta que no
--      quede ninguno.
--   c) NUNCA "Delete bucket" ni "Edit bucket". El bucket y su configuracion
--      (privado, limite de tamano y tipos PNG/JPEG, bloque 20) y sus
--      politicas (bloques 43 y 48) tienen que quedar como estan: sin el
--      bucket, el alta del lunes no puede subir la firma y se cae.
--   d) Vuelva a correr la consulta 3.1: archivos_en_firmas debe dar 0.
-- #####################################################################
