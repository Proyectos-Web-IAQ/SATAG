-- =====================================================================
-- 59_aviso_v3_apellidos.sql
--
-- Agrega los APELLIDOS DE LA FAMILIA al catalogo de datos del aviso de
-- privacidad. Nada mas que eso: una frase en el aviso integral y otra en el
-- simplificado.
--
-- EL PROBLEMA. El aviso v3 se publico hoy (bloque 57) y su apartado DATOS
-- PERSONALES QUE SE RECABAN enumera uno por uno los datos que SATAG pide:
-- nombre del usuario, nombre de quien gestiona el tramite, tipo de usuario,
-- datos del vehiculo, datos administrativos del TAG, pago, firma, evidencia,
-- datos tecnicos y solicitudes. No menciona los apellidos de la familia, que
-- es el dato nuevo que el formulario empieza a pedir el lunes (bloque 55).
--
-- POR QUE NO ES UN DESCUIDO DE REDACCION. El catalogo de datos del articulo
-- 16 de la LFPDPPP no vive en la base ni en el codigo: vive en el texto que
-- el titular acepta, y ese texto queda sellado en el hash de la evidencia de
-- cada expediente (bloque 15, hash_documento). Si el formulario captura un
-- dato que el aviso no enumera, lo que queda acreditado en el expediente es
-- un consentimiento sobre un catalogo distinto del que la base guarda. Y
-- desde la junta del 9-sep hay un correo publicado para ejercer derechos
-- ARCO (aviso.privacidad@asuncionqro.edu.mx): esa diferencia la puede leer
-- alguien de fuera, no solo TI.
--
-- LOS DOS CAMINOS. Corregir el texto de un aviso ya publicado tiene dos
-- formas, y cual es la correcta depende de un solo dato: si alguien ya firmo
-- contra la v3.
--
--   A) NADIE ha aceptado la v3 todavia. Se corrige el texto de la v3 EN SU
--      SITIO. No hay evidencia que invalidar, y no tiene sentido quemar un
--      numero de version por un texto que nadie firmo.
--
--   B) YA HAY aceptaciones contra la v3. La v3 se deja INTACTA y se publica
--      una v4 con el texto corregido, moviendo la vigencia; lo mismo que se
--      le hizo a la v2 en el bloque 57. "Intacta" es su TEXTO, que es lo que
--      el hash sella; la bandera vigente si se apaga, porque el indice
--      uq_aviso_una_vigente no admite dos vigentes a la vez.
--
-- POR QUE NO ELIGE EL OPERADOR. Los dos errores no cuestan lo mismo. Elegir
-- A cuando la respuesta era B reescribe la fila a la que apuntan aceptaciones
-- ya firmadas, y esa fila no es decorativa: crear_registro sella en el
-- payload de la aceptacion el SHA-256 del contenido del aviso que se mostro
-- (aviso_privacidad.contenido_sha256). Cambiado el texto, ese sha deja de
-- corresponder con la fila a la que apunta la evidencia, y ya no se puede
-- acreditar que documento acepto la familia. Eso no se deshace. Elegir B
-- cuando la respuesta era A solo quema un numero de version y obliga a
-- explicar algun dia una version que nadie firmo. Como uno de los dos
-- errores es irreversible y la pregunta que los separa cabe en una
-- consulta —cuantas filas de aceptaciones apuntan a la v3—, la decision se
-- toma dentro del bloque, mirando la base, y el operador no tiene donde
-- equivocarse: el unico "Run" posible es el del archivo completo.
--
-- COMO SABER QUE CAMINO CORRIO. Lo dice la consulta del paso 2:
-- version_vigente = 3 es el camino A y version_vigente = 4 es el camino B, y
-- aceptaciones_contra_v3 es la cuenta que lo decidio. No se confia en RAISE
-- NOTICE para eso, porque el editor SQL de Supabase no siempre los muestra.
--
-- EL NUMERO DE VERSION DENTRO DEL TEXTO. El aviso se presenta a si mismo en
-- su cuarta linea ("Version N del aviso"). Por eso el texto se escribe UNA
-- sola vez, con el marcador {{VERSION}}, y cada camino lo sustituye por el
-- numero que le toca; sin eso el camino B publicaria una v4 que se presenta
-- como v3. El bloque aborta si el marcador llegara a quedar a la vista.
--
-- LO QUE SE TOCA DEL TEXTO Y NADA MAS: una frase en la enumeracion del
-- integral y otra en la del simplificado. Cada palabra que se toca cambia el
-- hash de lo que se firma de aqui en adelante, asi que el resto del aviso se
-- copia tal cual del bloque 57, hasta los espacios.
--
-- LO QUE ESTE BLOQUE NO TOCA:
--   - La v2, nunca. Las aceptaciones ya firmadas apuntan a ella por llave
--     foranea y su hash se calculo sobre ese texto exacto.
--   - En el camino B, el texto de la v3, por la misma razon.
--   - publicado_en: en el camino A la v3 conserva su fecha de publicacion.
--   - Ninguna funcion almacenada. No hay firma que cambie, asi que no hay
--     drop function, ni grants que volver a emitir, ni notify pgrst.
--   - La restriccion reg_apellidos_familia_requeridos del bloque 55 ni nada
--     de `registros`: de eso se encarga el bloque 58. Aqui solo se corrige
--     el catalogo de datos del aviso, asi que los dos bloques son
--     independientes y pueden aplicarse en cualquier orden.
--
-- DESPLIEGUE. No requiere publicar el sitio: /aviso-de-privacidad/ y la
-- burbuja del formulario leen SIEMPRE la version vigente, sea cual sea.
--
-- FORMA DEL TEXTO. El cliente parte el contenido por SALTOS DE LINEA y pinta
-- un parrafo por linea no vacia (lib/supabase/api.ts, getAvisoVigente): por
-- eso cada parrafo va en una sola linea larga y las lineas en blanco solo
-- estan para poder leer este archivo. En el simplificado, el PRIMER parrafo
-- es el unico que se ve sin desplegar (app/registro/page.tsx); el dato nuevo
-- va en el SEGUNDO, que es donde vive la enumeracion.
--
-- LOS COMENTARIOS DE ESTA CARPETA VAN SIN ACENTOS, y asi siguen. EL TEXTO
-- DEL AVISO NO PUEDE DARSE ESE LUJO: es lo que lee una familia y lo que
-- queda sellado en la evidencia. El archivo esta guardado en UTF-8 y debe
-- pegarse tal cual, completo y de un tiron; por eso cierra con la
-- verificacion de acentos del paso 2, y no se da por aplicado sin verla.
--
-- Idempotente: si la v3 ya nombra los apellidos, el bloque no hace nada.
-- Depende de: bloque 57 aplicado.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. El bloque que mira la base, decide el camino y lo aplica.
--
--    Va todo dentro de un solo DO por dos motivos. Uno: un DO es UNA
--    instruccion, asi que la decision y la escritura no se pueden separar
--    ni ejecutar a medias con un "Run selection" descuidado. Dos: si algo
--    no cuadra, un raise exception aqui adentro revierte lo que se haya
--    hecho y la base queda como estaba, que es lo que se quiere cuando lo
--    que esta en juego es evidencia firmada.
--
--    El texto vive en variables y no repetido en las dos ramas a
--    proposito: dos copias del aviso en el mismo archivo son dos copias
--    que alguien puede corregir a medias, y la mitad sin corregir es la
--    que acabaria publicada.
-- ---------------------------------------------------------------------
do $bloque59$
declare
    v_integral text := $texto_integral$AVISO DE PRIVACIDAD INTEGRAL - SATAG
Sistema de Adquisición de TAG Vehicular
Instituto Asunción de Querétaro, A.C. (IAQ)
Versión {{VERSION}} del aviso. Última actualización: septiembre de 2026.

IDENTIDAD Y DOMICILIO DEL RESPONSABLE
La Administración del Instituto Asunción de Querétaro, A.C. ("el Instituto"), con domicilio en Cerrada de la Asunción #16, Col. Loma Dorada, Querétaro, Qro., México, C.P. 76060, es la responsable del tratamiento de los datos personales que se recaban a través de SATAG, el sistema con el que el Instituto administra la adquisición, el control, el cambio, la baja y la instalación del TAG vehicular de acceso al estacionamiento escolar. La Administración es también el área designada para atender sus dudas sobre este aviso y las solicitudes que usted presente sobre sus datos personales. Puede dirigirse a ella en el correo institucional aviso.privacidad@asuncionqro.edu.mx.

DATOS PERSONALES QUE SE RECABAN
Para operar SATAG, el Instituto puede recabar: el nombre del usuario del TAG; el nombre del padre, la madre, el tutor o la persona que gestiona el trámite cuando corresponda; los apellidos con los que la familia está inscrita en el Instituto, que sirven para confirmar que quien solicita el TAG pertenece a la comunidad escolar; el tipo de usuario, es decir, alumno, padre, madre o tutor, docente, personal administrativo u otro rol autorizado; los datos del vehículo, es decir, placas, marca, modelo, color e indicación de vehículo sin placas cuando corresponda; los datos administrativos del TAG, es decir, la solicitud, el estacionamiento asignado, el estado del trámite, el número de dispositivo, los cambios, las reposiciones, la baja y los movimientos asociados; los datos del pago administrativo, es decir, el registro del cobro en efectivo, el monto, la fecha, el folio de recibo interno y la persona que registra el cobro; su firma manuscrita digital, es decir, la imagen, los trazos de captura cuando se conserven, el nombre de quien firma y la fecha y hora de la aceptación; la evidencia digital de la aceptación, es decir, la versión del reglamento, la versión del aviso de privacidad, la huella digital SHA-256, el sello de tiempo y la bitácora del evento; los datos técnicos razonables del uso del sistema, como la fecha y la hora, los identificadores de sesión y la dirección IP o el navegador cuando sean necesarios para la seguridad, la evidencia o la auditoría; y las solicitudes que usted presente sobre sus datos, sobre la revocación de su consentimiento o sobre el cambio o la baja del TAG.
No se le solicitan datos personales sensibles. El personal del Instituto tiene instrucción de no capturar en el campo de observaciones información de salud, discapacidad, religión, opiniones políticas ni ningún otro dato sensible.

FINALIDADES PRIMARIAS
Sus datos se usan para registrar la solicitud de adquisición o de uso del TAG vehicular; identificar al usuario, a quien gestiona el trámite y al vehículo asociado al TAG; administrar la asignación de estacionamiento y el control de acceso vehicular; registrar la aceptación del reglamento del estacionamiento; conservar la evidencia de la firma electrónica simple reforzada; registrar administrativamente el pago en efectivo del TAG; gestionar la instalación, el cambio, la reposición, la baja o la inactivación del TAG; atender sus solicitudes de acceso, rectificación, cancelación, oposición, revocación y aclaración; mantener la seguridad, la auditoría, la trazabilidad y el control interno del sistema; y cumplir las obligaciones legales, administrativas y contables del Instituto, así como los requerimientos de una autoridad competente.
Todas las finalidades anteriores son primarias: sin ellas el TAG no puede existir ni funcionar. El Instituto no usa los datos de SATAG con fines publicitarios, comerciales ni de prospección, y no los emplea para finalidades distintas de las que aquí se informan.

VIDEOVIGILANCIA DEL ESTACIONAMIENTO
El estacionamiento del Instituto cuenta con un circuito cerrado de videovigilancia en operación las veinticuatro horas, con la finalidad de proteger a las personas, los vehículos y las instalaciones, y de aclarar los incidentes que ocurran dentro del inmueble. Las grabaciones se conservan dieciséis días contados desde su captura y después se sobrescriben de forma automática, salvo que un segmento deba resguardarse por un incidente en trámite o por requerimiento de una autoridad competente. Las imágenes y las placas de los vehículos se tratan como datos personales cuando permiten identificar o asociar a una persona, y solo el personal expresamente autorizado puede consultarlas.

FIRMA ELECTRÓNICA SIMPLE REFORZADA
La aceptación del reglamento se realiza mediante una firma manuscrita digital que usted traza en la pantalla. Esta firma no es la e.firma del SAT ni una firma electrónica avanzada. Para reforzar su valor probatorio, SATAG conserva junto a la firma la versión exacta del reglamento y del aviso de privacidad que se le mostraron, un sello de tiempo, los metadatos de la aceptación, la bitácora del evento y la huella digital SHA-256 del paquete firmado. Quien firma declara que los datos proporcionados son correctos y que acepta el reglamento de estacionamiento aplicable al TAG solicitado. Los trazos de la firma se resguardan con el mismo cuidado que se debe a un dato biométrico: almacenamiento privado, acceso limitado al personal autorizado y enlaces temporales para consultarlos.

MENORES DE EDAD
Cuando el usuario del TAG sea un alumno menor de edad, la aceptación del reglamento y de este aviso debe hacerla el padre, la madre o el tutor que gestione el trámite, en su calidad de representante legal. El alumno menor puede aparecer como usuario del beneficio vehicular, pero la autorización y la aceptación provienen de quien ejerce la patria potestad o la tutela. Los datos de un menor no se conservan más allá del plazo señalado en este aviso.

OPCIONES PARA LIMITAR EL USO O LA DIVULGACIÓN DE SUS DATOS
Usted puede solicitar que sus datos se usen únicamente para lo indispensable de la operación del TAG y que no se comuniquen a nadie fuera del personal autorizado del Instituto. La solicitud se presenta en el correo aviso.privacidad@asuncionqro.edu.mx. Tenga presente que las finalidades primarias no pueden limitarse sin renunciar al beneficio: sin los datos del vehículo y sin la aceptación firmada del reglamento, el Instituto no puede otorgar ni mantener el acceso vehicular.

ENCARGADOS TECNOLÓGICOS Y NUBE
SATAG se aloja en servicios de nube contratados por el Instituto, entre ellos Supabase y la infraestructura sobre la que ese proveedor opera. Estos proveedores actúan como encargados: tratan los datos por cuenta del Instituto y conforme a sus instrucciones, para el almacenamiento, la base de datos, la autenticación, la seguridad, los respaldos y la operación técnica del sistema. Poner los datos en manos de un encargado es una remisión y no una transferencia, de modo que no requiere su consentimiento. El Instituto conserva la documentación contractual aplicable de cada proveedor, incluido el convenio de tratamiento de datos cuando corresponda, la región donde se alojan los datos, la lista de subprocesadores y las medidas de seguridad disponibles.

TRANSFERENCIAS
El Instituto no transfiere los datos personales de SATAG a terceros para finalidades distintas de las informadas en este aviso, no los vende y no los comparte con fines comerciales. Solo podrá comunicarlos cuando lo requiera una autoridad competente en ejercicio de sus atribuciones, cuando lo imponga una disposición legal, o cuando sea necesario para defender los derechos del Instituto o de la comunidad escolar ante una controversia.

SUS DERECHOS SOBRE LOS DATOS Y LA REVOCACIÓN DEL CONSENTIMIENTO
Usted puede solicitar en cualquier momento el acceso a sus datos personales, su rectificación cuando estén incompletos o sean inexactos, su cancelación cuando considere que no son necesarios, y oponerse al tratamiento para una finalidad determinada. También puede revocar el consentimiento que otorgó al firmar. Escriba a aviso.privacidad@asuncionqro.edu.mx indicando su nombre, un medio para responderle, una descripción clara de lo que solicita y los documentos con los que acredite su identidad o, en su caso, la representación de la persona titular. La Administración le responderá dentro de los plazos que marca la legislación aplicable y, cuando la respuesta sea favorable, hará efectiva su solicitud en el plazo legal siguiente. Si revoca el consentimiento sobre los datos indispensables, el TAG se da de baja y termina el acceso vehicular; la revocación no borra la evidencia de las aceptaciones ya firmadas mientras subsista la responsabilidad que documentan.

PLAZO DE CONSERVACIÓN, BLOQUEO Y SUPRESIÓN
Sus datos se conservan durante cinco años contados a partir de que termina la finalidad que justificó recabarlos, es decir, a partir de la baja del TAG o del cierre del trámite que corresponda. Durante ese periodo el expediente permanece bloqueado: deja de usarse en la operación diaria y solo queda disponible para aclaraciones, responsabilidades pendientes o requerimientos de una autoridad competente. Cumplido el plazo, el expediente se suprime o se disocia de forma segura, incluida la imagen de la firma que se resguarda en el almacenamiento privado. La revisión de los expedientes que ya cumplieron el plazo la solicita la Administración y la ejecuta el área de Tecnologías de la Información.

MEDIDAS DE SEGURIDAD
El Instituto aplica medidas administrativas, técnicas y físicas proporcionales al tratamiento: control de accesos por perfil, seguridad a nivel de registro en la base de datos, almacenamiento privado de las firmas con enlaces temporales, cifrado de la información en tránsito, respaldos, bitácoras de los movimientos, segundo factor de autenticación para el personal con acceso al panel y limitación del acceso al personal expresamente autorizado.

CAMBIOS AL AVISO
El Instituto puede modificar este aviso por cambios legales, institucionales, técnicos u operativos. La versión vigente se publica siempre en la misma dirección, /aviso-de-privacidad/, con su número de versión a la vista. Las versiones anteriores se conservan sin alterarse, de modo que en todo momento pueda acreditarse qué texto exacto aceptó cada persona al momento de firmar.$texto_integral$;

    v_simplificado text := $texto_simplificado$La Administración del Instituto Asunción de Querétaro, A.C. es la responsable de sus datos personales. Los usará para tramitar, asignar, instalar, cambiar o dar de baja su TAG de acceso al estacionamiento escolar, registrar el pago y conservar la evidencia de que usted aceptó el reglamento. El aviso de privacidad integral está en /aviso-de-privacidad/.

Se recaban el nombre del usuario del TAG y de quien gestiona el trámite, los apellidos con los que la familia está inscrita en el Instituto, que sirven para confirmar que pertenece a la comunidad escolar, el tipo de usuario, los datos del vehículo y sus placas, la firma que usted traza en pantalla junto con los datos que acreditan la aceptación, las versiones del reglamento y del aviso que acepta, los datos administrativos del TAG y el registro del cobro en efectivo. No se le solicitan datos sensibles, y sus datos no se usan con fines publicitarios ni comerciales.

Sus datos se conservan cinco años contados desde que termina la finalidad y se resguardan en los sistemas del Instituto y en los servicios de nube que operan por cuenta de este. Para acceder a ellos, rectificarlos, cancelarlos, oponerse a su uso, limitar su divulgación o revocar su consentimiento, escriba a aviso.privacidad@asuncionqro.edu.mx. El detalle completo, incluida la videovigilancia del estacionamiento, está en el aviso integral: /aviso-de-privacidad/.$texto_simplificado$;

    v_id_v3         uuid;
    v_texto_v3      text;
    v_texto_v4      text;
    v_vigente       int;
    v_aceptaciones  bigint;
    v_destino       int;
    v_cuenta_final  int;
    v_version_final int;
begin
    -- La v3 tiene que existir: este bloque corrige lo que publico el 57.
    select id, contenido
      into v_id_v3, v_texto_v3
      from aviso_versiones
     where version = 3;

    if v_id_v3 is null then
        raise exception 'No existe la version 3 del aviso: aplique antes el bloque 57. No se aplico nada.';
    end if;

    -- La vigente de hoy tiene que ser una de las dos que este bloque sabe
    -- manejar. Si alguien publico una version posterior, reejecutar esto
    -- la apagaria y volveria a poner en vigor un texto viejo: mejor
    -- detenerse y que alguien mire.
    select version into v_vigente from aviso_versiones where vigente;
    if v_vigente is null then
        raise exception 'No hay ninguna version del aviso vigente. Revise el bloque 57 antes de continuar. No se aplico nada.';
    end if;
    if v_vigente not in (3, 4) then
        raise exception 'La version vigente del aviso es la %, y este bloque solo sabe corregir la v3 o publicar la v4. No se aplico nada.', v_vigente;
    end if;

    select count(*)
      into v_aceptaciones
      from aceptaciones
     where aviso_version_id = v_id_v3;

    -- La comparacion se hace contra una FRASE y no contra el texto
    -- completo a proposito. El editor de Supabase convierte los saltos de
    -- linea a CRLF al pegar, asi que el mismo aviso guardado desde el
    -- editor y desde psql no es identico byte a byte aunque diga
    -- exactamente lo mismo; una igualdad estricta mandaria al camino
    -- equivocado por un caracter invisible. La frase, ademas, se eligio
    -- sin una sola letra acentuada para que tampoco dependa de como haya
    -- llegado la codificacion.
    if position('apellidos con los que la familia' in v_texto_v3) > 0 then
        -- Ya se corrigio en su sitio en una pasada anterior. Aqui NO se
        -- vuelve a decidir: las aceptaciones que hoy existan se firmaron
        -- contra el texto bueno, y la cuenta de arriba mandaria a publicar
        -- una v4 identica a la v3 sin ningun motivo.
        v_destino := v_vigente;
        raise notice 'Sin cambios: la version 3 ya enumera los apellidos de la familia.';

    elsif v_aceptaciones = 0 then
        -- CAMINO A. Nadie firmo la v3: se corrige en su sitio y la version
        -- sigue siendo la 3. No se toca publicado_en ni vigente.
        v_destino := 3;

        update aviso_versiones
           set contenido              = replace(v_integral, '{{VERSION}}', '3'),
               contenido_simplificado = v_simplificado
         where id = v_id_v3;

        raise notice 'Camino A: nadie habia aceptado la v3; se corrigio su texto en su sitio.';

    else
        -- CAMINO B. Hay evidencia firmada contra la v3: no se toca, y el
        -- texto corregido sale como v4.
        v_destino := 4;

        -- Si ya hubiera una v4 con OTRO texto, alguien la publico por otro
        -- motivo y este bloque no es quien para sobrescribirla.
        select contenido into v_texto_v4 from aviso_versiones where version = 4;
        if v_texto_v4 is not null
           and position('apellidos con los que la familia' in v_texto_v4) = 0 then
            raise exception 'Ya existe una version 4 del aviso con otro texto; este bloque no la sobrescribe. No se aplico nada.';
        end if;

        -- Primero se apaga la vigente y despues entra la v4 encendida: al
        -- reves chocaria contra uq_aviso_una_vigente. El instante con cero
        -- vigentes no lo ve nadie, porque todo esto es una sola
        -- instruccion.
        update aviso_versiones
           set vigente = false
         where vigente
           and version <> 4;

        insert into aviso_versiones (version, contenido, contenido_simplificado, url_publica, vigente)
        values (
            4,
            replace(v_integral, '{{VERSION}}', '4'),
            v_simplificado,
            '/aviso-de-privacidad/',
            true
        )
        on conflict (version) do update
            set contenido              = excluded.contenido,
                contenido_simplificado = excluded.contenido_simplificado,
                url_publica            = excluded.url_publica,
                vigente                = true;

        raise notice 'Camino B: la v3 tiene % aceptacion(es) firmadas; se dejo intacta y se publico la v4.', v_aceptaciones;
    end if;

    -- Que el marcador de version no haya quedado a la vista de una familia.
    if exists (
        select 1
          from aviso_versiones
         where vigente
           and (contenido like '%{{VERSION}}%'
                or coalesce(contenido_simplificado, '') like '%{{VERSION}}%')
    ) then
        raise exception 'El marcador de version quedo sin sustituir en el texto vigente. No se aplico nada.';
    end if;

    -- La mitad que ningun CHECK puede vigilar, porque se mira entre filas:
    -- que quede EXACTAMENTE UNA vigente y que sea la que decidio el camino.
    select count(*), min(version)
      into v_cuenta_final, v_version_final
      from aviso_versiones
     where vigente;

    if v_cuenta_final <> 1 then
        raise exception 'Quedaron % avisos vigentes; deberia haber exactamente 1. No se aplico nada.', v_cuenta_final;
    end if;
    if v_version_final <> v_destino then
        raise exception 'La version vigente quedo en % y deberia ser la %. No se aplico nada.', v_version_final, v_destino;
    end if;
end
$bloque59$;


-- ---------------------------------------------------------------------
-- 2. VERIFICACION. Va al final para que sea el resultado que el editor SQL
--    deja en pantalla al terminar; tambien se puede correr sola despues.
--
--    Lo que hay que mirar NO es una cuenta suelta, es una IGUALDAD:
--
--        bytes_de_mas = acentos_integral
--
--    "bytes_de_mas" (octet_length menos length) son los bytes que el texto
--    ocupa de mas sobre su numero de caracteres, y en este aviso lo unico
--    que ocupa mas de un byte son las letras acentuadas, que en UTF-8
--    ocupan exactamente dos. Por eso la resta tiene que dar el mismo
--    numero que el conteo de acentuadas, que es lo que hace la columna de
--    al lado restando el texto sin ellas (translate borra los caracteres
--    de la lista).
--
--    POR QUE ESA IGUALDAD Y NO UNA CUENTA DE CARACTERES. Porque a la
--    igualdad no la mueve el editor. Si al pegar el archivo los saltos de
--    linea se vuelven CRLF, cada \r que se cuela suma un caracter Y un
--    byte, y en la resta se cancelan; al conteo de acentos ni lo roza. La
--    cuenta de caracteres si se mueve, y por eso aqui no se pide ni se
--    predice: el bloque 57 predijo 10188 caracteres, la base reporto 10232
--    y los 44 de diferencia eran exactamente un \r por linea, con la
--    codificacion perfecta (bytes_de_mas y acentos dieron 133 los dos). Un
--    numero que asusta sin que nada este mal es la manera mas rapida de
--    que la siguiente verificacion ya no la lea nadie.
--
--    Las dos formas de romper el texto rompen la igualdad, cada una por su
--    lado: si el aviso se pega PLANO (sin acentos), las dos cuentas caen a
--    cero; si llega MOJIBAKE, cada letra acentuada se parte en dos
--    caracteres de dos bytes, bytes_de_mas se dispara al doble de lo que
--    deberia y deja de coincidir con acentos_integral. Iguales, y distintas
--    de cero: texto bueno.
--
--    "mojibake_detectado" es un apoyo, no la prueba: si el archivo entero
--    se pegara mal, tambien se estropearian la "Ã" y la "Â" de esta misma
--    consulta y la comparacion dejaria de encontrarse a si misma. Sirve
--    cuando la verificacion se corre despues, en una sesion limpia.
--
--    Las banderas confirman que el dato nuevo esta en los dos textos y que
--    lo que el bloque 57 publico sigue ahi: responsable, plazo,
--    videovigilancia, correo y la ruta relativa del integral.
-- ---------------------------------------------------------------------
select version                                                                     as version_vigente,
       (select count(*)
          from aceptaciones a
          join aviso_versiones v3 on v3.id = a.aviso_version_id
         where v3.version = 3)                                                     as aceptaciones_contra_v3,
       octet_length(contenido) - length(contenido)                                 as bytes_de_mas,
       length(contenido)
           - length(translate(contenido, 'áéíóúüñÁÉÍÓÚÜÑ¿¡', ''))                  as acentos_integral,
       length(contenido_simplificado)
           - length(translate(contenido_simplificado, 'áéíóúüñÁÉÍÓÚÜÑ¿¡', ''))     as acentos_simplificado,
       (contenido like '%Ã%' or contenido like '%Â%'
        or contenido_simplificado like '%Ã%'
        or contenido_simplificado like '%Â%')                                      as mojibake_detectado,
       (contenido like '%apellidos con los que la familia%')                       as apellidos_en_integral,
       (contenido_simplificado like '%apellidos con los que la familia%')          as apellidos_en_simplificado,
       (contenido like '%Instituto Asunción de Querétaro%')                        as responsable_ok,
       (contenido like '%cinco años%')                                             as plazo_ok,
       (contenido like '%dieciséis días%')                                         as videovigilancia_ok,
       (contenido like '%aviso.privacidad@asuncionqro.edu.mx%')                    as correo_ok,
       (contenido_simplificado like '%/aviso-de-privacidad/%')                     as ruta_relativa_ok
  from aviso_versiones
 where vigente;


-- =====================================================================
-- Auditoria esperada:
--
-- - La consulta del paso 2 devuelve UNA fila. Lo que se revisa es esto:
--     bytes_de_mas = acentos_integral ....... la prueba buena
--     ninguna de las dos en cero, y bytes_de_mas no es el doble de la otra
--     acentos_simplificado ................. distinto de cero
--     mojibake_detectado ................... false
--     apellidos_en_integral ................ true
--     apellidos_en_simplificado ............ true
--     las cinco banderas heredadas del 57 .. true
--   NO se predice aqui un numero exacto de caracteres: esa cuenta depende
--   del editor que pego el archivo (ver el paso 2). Como referencia, los
--   acentos si son estables y este bloque suma UNA letra acentuada a cada
--   texto —la de "esta"—, asi que lo esperado es 134 en el integral y 13
--   en el simplificado, contra los 133 y 12 que dejo el bloque 57. Si esos
--   numeros bailaran por uno, no pasa nada: lo que descalifica al texto es
--   el cero y el doble, no el uno de mas.
--
-- - version_vigente dice que camino corrio, y es la unica manera de
--   saberlo despues:
--     3  ->  camino A: nadie habia firmado la v3 y se corrigio en su sitio.
--            Con este resultado, aceptaciones_contra_v3 tiene que ser 0.
--     4  ->  camino B: habia firmas contra la v3, quedo intacta y la
--            vigencia se movio a la v4.
--
-- - select version, vigente from aviso_versiones order by version;
--   devuelve exactamente una fila con vigente = true. La v1 y la v2 siguen
--   ahi, apagadas y con su texto original: es lo que firmaron los
--   expedientes ya capturados y no se toca nunca.
--
-- - Si corrio el camino B, comprobar que la v3 quedo intacta:
--     select version,
--            position('apellidos con los que la familia' in contenido) > 0
--                as nombra_apellidos
--       from aviso_versiones order by version;
--   La v3 debe dar false y la v4 true. Si la v3 diera true, se reescribio
--   un texto ya firmado: eso invalida la evidencia de esos expedientes y
--   hay que reportarlo, no taparlo.
--
-- - /aviso-de-privacidad/ muestra al pie la version que quedo vigente, y en
--   DATOS PERSONALES QUE SE RECABAN aparece la frase de los apellidos con
--   sus acentos, dentro del mismo parrafo de la enumeracion (no como
--   parrafo aparte). En el formulario, la burbuja del aviso simplificado la
--   trae en el segundo parrafo, el que se despliega con "Ver mas".
--
-- - Un alta nueva sella en aceptaciones el aviso_version_id de la version
--   que quedo vigente. Las aceptaciones anteriores conservan la suya y su
--   hash sigue verificando contra el texto que se les mostro: no se
--   resiembra ni se recalcula nada.
--
-- - Reejecutar el bloque completo no cambia nada si la v3 ya nombra los
--   apellidos: entra por el camino "sin cambios" y la consulta del paso 2
--   devuelve lo mismo.
--
-- - Pendiente de Gerardo, fuera de la base: el entregable
--   "E6 - Aviso de Privacidad SATAG.md" sigue siendo el borrador de la v2
--   (ya venia anotado en el bloque 57); cuando se actualice, que incluya
--   tambien los apellidos de la familia en la enumeracion.
-- =====================================================================
