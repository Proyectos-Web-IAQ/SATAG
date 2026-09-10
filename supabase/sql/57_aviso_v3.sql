-- =====================================================================
-- 57_aviso_v3.sql
--
-- Publica la VERSION 3 del aviso de privacidad y le pone el candado que se
-- prometio desde el bloque 44 y nunca se aplico.
--
-- EL PROBLEMA. El texto que hoy aceptan las familias (v2, bloque 22) se
-- escribio a proposito SIN UN SOLO ACENTO, para esquivar problemas de
-- codificacion en el editor SQL. Esa decision era barata cuando el aviso era
-- un borrador; hoy no lo es: ese texto se muestra en pantalla antes de firmar
-- y queda SELLADO EN EL HASH de cada aceptacion (bloque 15, hash_documento).
-- Es decir, lo que queda acreditado en la evidencia de cada expediente es que
-- la familia acepto un documento donde el responsable se llama "Instituto
-- Asuncion de Queretaro", que no es el nombre de la institucion. Ademas al
-- texto vigente le faltan tres cosas exigibles:
--   - el RESPONSABLE NOMBRADO (fila 1 del tablero de decisiones legales de
--     E6): la Administracion, no "el IAQ" a secas;
--   - el PLAZO DE CONSERVACION (fila 4): el aviso vigente promete suprimir
--     los datos "al agotarse el plazo aprobado" sin decir cual es, o sea que
--     promete algo sin contenido;
--   - la VIDEOVIGILANCIA del estacionamiento, que el reglamento anuncia
--     (clausula 29 de la propuesta v3) y el aviso callaba, con su plazo de
--     conservacion propio.
-- Se aprovecha para agregar el apartado de OPCIONES PARA LIMITAR EL USO, que
-- la ley pide entre los elementos del aviso integral y la v2 no traia, y para
-- pasar todo el texto al trato de usted.
--
-- DATOS INSTITUCIONALES CONFIRMADOS que se escriben aqui (no inventar otros):
--   Responsable ............ Administracion del Instituto Asuncion de
--                            Queretaro, A.C.
--   Correo de privacidad ... aviso.privacidad@asuncionqro.edu.mx
--   Conservacion ........... cinco anos desde que termina la finalidad
--   Videovigilancia ........ las grabaciones se conservan dieciseis dias
--
-- NOTA SOBRE EL PLAZO: la nota de decision del 03-ago recomendaba SEIS anos
-- contados desde la baja. Lo confirmado por la institucion es CINCO anos
-- contados desde que TERMINA LA FINALIDAD (que en la practica es la baja del
-- TAG o el cierre del tramite; el texto lo dice asi para que no quede duda).
-- Se escribe lo decidido, no lo recomendado. Queda pendiente de Gerardo
-- actualizar la fila 4 del tablero de E6 y marcarla como Decidida, para que
-- el entregable no siga diciendo otra cosa que el aviso publicado.
--
-- LOS COMENTARIOS DE ESTA CARPETA VAN SIN ACENTOS por tradicion, y asi siguen.
-- EL TEXTO DEL AVISO NO PUEDE DARSE ESE LUJO: es lo que lee una familia y lo
-- que queda sellado en la evidencia. Este archivo esta guardado en UTF-8 y
-- debe pegarse tal cual en el editor SQL. Si al aplicarlo el texto llegara
-- mal codificado, las familias volverian a firmar un aviso roto, que es
-- justo lo que este bloque corrige: por eso el bloque TERMINA con una
-- consulta de verificacion de acentos, y no se da por aplicado sin verla.
--
-- QUE HACE, EN ORDEN (el orden importa):
--   1. Asegura la columna contenido_simplificado (venia del bloque 44; se
--      repite con "if not exists" para que el candado del paso 2 no dependa
--      de que aquel bloque se haya aplicado antes).
--   2. Pone EL CANDADO: ninguna version puede estar vigente sin su texto
--      simplificado. Va ANTES de publicar la v3, para que la v3 sea la
--      primera en pasar por el.
--   3. Publica la v3 y mueve la vigencia.
--   4. Comprueba la invariante (exactamente una vigente, y es la v3) y
--      aborta el bloque completo si no se cumple.
--   5. Verifica los acentos.
--
-- LO QUE ESTE BLOQUE NO TOCA. La fila de la v2 se queda en la tabla, intacta
-- y con vigente = false. No se borra ni se corrige NUNCA: las aceptaciones ya
-- firmadas apuntan a ella por llave foranea (aceptaciones.aviso_version_id) y
-- su hash se calculo sobre ese texto exacto. Editar la v2 para "arreglarle los
-- acentos" invalidaria la evidencia de todos los expedientes existentes. Las
-- firmas viejas siguen siendo validas: acreditan lo que se mostro entonces.
--
-- DESPLIEGUE. No requiere publicar el sitio: la pagina /aviso-de-privacidad/
-- y la burbuja del formulario leen SIEMPRE la version vigente, sea cual sea.
-- Sin funciones almacenadas de por medio, no hay trampa PostgREST aqui: no se
-- crea ni se cambia la firma de ningun RPC, asi que no hace falta drop
-- function, ni volver a emitir grants, ni notify pgrst.
--
-- FORMA DEL TEXTO. El cliente parte el contenido por SALTOS DE LINEA y pinta
-- un parrafo por linea no vacia (lib/supabase/api.ts, getAvisoVigente). Por
-- eso cada titulo de apartado va en su propia linea y cada parrafo en una
-- sola linea larga, sin cortes manuales. Las lineas en blanco se descartan al
-- pintar: estan solo para que este archivo se pueda leer.
-- En el simplificado, el PRIMER parrafo es el unico que se ve sin desplegar
-- (app/registro/page.tsx pinta el primero y esconde el resto tras "Ver mas"),
-- asi que ese primer parrafo carga solo con lo minimo de ley: quien es el
-- responsable, para que se usan los datos y donde esta el aviso integral.
-- La direccion del integral va RELATIVA (/aviso-de-privacidad/): el sitio se
-- sirve en el dominio institucional y en el de respaldo, y una URL absoluta
-- se romperia en uno de los dos.
--
-- Idempotente: se puede reejecutar completo sin dano.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. La columna del texto simplificado (bloque 44).
--    Se repite el "add column if not exists" para que este bloque se
--    sostenga solo: el candado del paso 2 nombra esta columna, y un bloque
--    que se cae por una columna ausente es un bloque que nadie sabe si
--    aplico a medias.
-- ---------------------------------------------------------------------
alter table aviso_versiones
    add column if not exists contenido_simplificado text;

comment on column aviso_versiones.contenido_simplificado is
    'Aviso simplificado que se muestra al momento de recabar los datos, con el enlace al integral. El integral vive en contenido. Obligatorio en la version vigente (constraint aviso_vigente_exige_simplificado).';


-- ---------------------------------------------------------------------
-- 2. EL CANDADO.
--
--    Que impide: publicar una version como vigente sin su texto corto. Ese
--    descuido no da error en ningun lado y no se ve en el panel: el
--    formulario simplemente deja de mostrar el aviso simplificado, que es
--    precisamente el que la ley exige tener a la vista ANTES de recabar los
--    datos. Se recabarian datos sin aviso corto y nadie se enteraria hasta
--    la siguiente auditoria.
--
--    Por que CHECK y no trigger: la regla mira UNA SOLA FILA (la columna
--    vigente y la columna contenido_simplificado de esa misma fila), y ese
--    es exactamente el caso que un CHECK resuelve mejor que cualquier otra
--    cosa. Vale para insert y para update sin escribir nada mas, no se
--    puede saltar (ni con un update a mano desde el editor SQL, que es
--    justo como se publican los avisos), queda a la vista en el esquema
--    para el que audite, y al crearla PostgreSQL valida las filas que ya
--    existen, asi que el bloque falla en el acto si la vigente de hoy
--    estuviera sin texto corto, en vez de dejar viva la inconsistencia.
--    Un trigger solo se justificaria si la regla tuviera que mirar OTRAS
--    filas, y esa parte ya esta cubierta: "no puede haber dos vigentes" lo
--    garantiza el indice unico parcial uq_aviso_una_vigente del bloque 08.
--
--    Lo que un CHECK no puede expresar es "tiene que haber AL MENOS una
--    vigente", porque eso se mira entre filas. Esa mitad la cubre la
--    comprobacion del paso 4.
--
--    Si el bloque se cayera JUSTO AQUI ("violates check constraint"), la
--    lectura es esta: la version vigente de hoy esta sin texto corto, o sea
--    que el formulario lleva quien sabe cuanto recabando datos sin aviso
--    simplificado. No hay que quitar el candado: hay que reaplicar el
--    bloque 44 y volver a correr este.
--
--    drop + add en vez de "add constraint if not exists" (que PostgreSQL no
--    tiene) para que el bloque se pueda reejecutar.
-- ---------------------------------------------------------------------
alter table aviso_versiones
    drop constraint if exists aviso_vigente_exige_simplificado;

alter table aviso_versiones
    add constraint aviso_vigente_exige_simplificado
    check (
        not vigente
        or (contenido_simplificado is not null and btrim(contenido_simplificado) <> '')
    );

comment on constraint aviso_vigente_exige_simplificado on aviso_versiones is
    'Una version vigente debe traer su aviso simplificado: sin el, el formulario recaba datos sin el aviso corto que la ley pide a la vista.';


-- ---------------------------------------------------------------------
-- 3. Publicacion de la version 3.
--
--    ORDEN: primero se apagan las demas, despues entra la v3 encendida. Al
--    reves, el insert chocaria contra uq_aviso_una_vigente (dos vigentes a
--    la vez). El instante intermedio con CERO vigentes no lo ve nadie: el
--    editor SQL manda el archivo como una sola transaccion implicita, de
--    modo que las dos instrucciones se confirman juntas o no se confirma
--    ninguna. Por eso este bloque se ejecuta COMPLETO, de un tiron; nunca
--    con "Run selection" sobre una parte.
--
--    El upsert no toca publicado_en: si alguna vez hay que reejecutar el
--    bloque para corregir una palabra, la fecha de publicacion de la v3
--    debe seguir siendo la original.
-- ---------------------------------------------------------------------
update aviso_versiones
   set vigente = false
 where vigente
   and version <> 3;

insert into aviso_versiones (version, contenido, contenido_simplificado, url_publica, vigente)
values (
    3,
    $aviso_v3$AVISO DE PRIVACIDAD INTEGRAL - SATAG
Sistema de Adquisición de TAG Vehicular
Instituto Asunción de Querétaro, A.C. (IAQ)
Versión 3 del aviso. Última actualización: septiembre de 2026.

IDENTIDAD Y DOMICILIO DEL RESPONSABLE
La Administración del Instituto Asunción de Querétaro, A.C. ("el Instituto"), con domicilio en Cerrada de la Asunción #16, Col. Loma Dorada, Querétaro, Qro., México, C.P. 76060, es la responsable del tratamiento de los datos personales que se recaban a través de SATAG, el sistema con el que el Instituto administra la adquisición, el control, el cambio, la baja y la instalación del TAG vehicular de acceso al estacionamiento escolar. La Administración es también el área designada para atender sus dudas sobre este aviso y las solicitudes que usted presente sobre sus datos personales. Puede dirigirse a ella en el correo institucional aviso.privacidad@asuncionqro.edu.mx.

DATOS PERSONALES QUE SE RECABAN
Para operar SATAG, el Instituto puede recabar: el nombre del usuario del TAG; el nombre del padre, la madre, el tutor o la persona que gestiona el trámite cuando corresponda; el tipo de usuario, es decir, alumno, padre, madre o tutor, docente, personal administrativo u otro rol autorizado; los datos del vehículo, es decir, placas, marca, modelo, color e indicación de vehículo sin placas cuando corresponda; los datos administrativos del TAG, es decir, la solicitud, el estacionamiento asignado, el estado del trámite, el número de dispositivo, los cambios, las reposiciones, la baja y los movimientos asociados; los datos del pago administrativo, es decir, el registro del cobro en efectivo, el monto, la fecha, el folio de recibo interno y la persona que registra el cobro; su firma manuscrita digital, es decir, la imagen, los trazos de captura cuando se conserven, el nombre de quien firma y la fecha y hora de la aceptación; la evidencia digital de la aceptación, es decir, la versión del reglamento, la versión del aviso de privacidad, la huella digital SHA-256, el sello de tiempo y la bitácora del evento; los datos técnicos razonables del uso del sistema, como la fecha y la hora, los identificadores de sesión y la dirección IP o el navegador cuando sean necesarios para la seguridad, la evidencia o la auditoría; y las solicitudes que usted presente sobre sus datos, sobre la revocación de su consentimiento o sobre el cambio o la baja del TAG.
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
El Instituto puede modificar este aviso por cambios legales, institucionales, técnicos u operativos. La versión vigente se publica siempre en la misma dirección, /aviso-de-privacidad/, con su número de versión a la vista. Las versiones anteriores se conservan sin alterarse, de modo que en todo momento pueda acreditarse qué texto exacto aceptó cada persona al momento de firmar.$aviso_v3$,
    $simp_v3$La Administración del Instituto Asunción de Querétaro, A.C. es la responsable de sus datos personales. Los usará para tramitar, asignar, instalar, cambiar o dar de baja su TAG de acceso al estacionamiento escolar, registrar el pago y conservar la evidencia de que usted aceptó el reglamento. El aviso de privacidad integral está en /aviso-de-privacidad/.

Se recaban el nombre del usuario del TAG y de quien gestiona el trámite, el tipo de usuario, los datos del vehículo y sus placas, la firma que usted traza en pantalla junto con los datos que acreditan la aceptación, las versiones del reglamento y del aviso que acepta, los datos administrativos del TAG y el registro del cobro en efectivo. No se le solicitan datos sensibles, y sus datos no se usan con fines publicitarios ni comerciales.

Sus datos se conservan cinco años contados desde que termina la finalidad y se resguardan en los sistemas del Instituto y en los servicios de nube que operan por cuenta de este. Para acceder a ellos, rectificarlos, cancelarlos, oponerse a su uso, limitar su divulgación o revocar su consentimiento, escriba a aviso.privacidad@asuncionqro.edu.mx. El detalle completo, incluida la videovigilancia del estacionamiento, está en el aviso integral: /aviso-de-privacidad/.$simp_v3$,
    '/aviso-de-privacidad/',
    true
)
on conflict (version) do update
    set contenido              = excluded.contenido,
        contenido_simplificado = excluded.contenido_simplificado,
        url_publica            = excluded.url_publica,
        vigente                = true;


-- ---------------------------------------------------------------------
-- 4. La mitad que el CHECK no puede vigilar: que quede EXACTAMENTE UNA
--    vigente, y que sea la v3. Si algo salio mal, esta excepcion aborta la
--    transaccion completa y la base queda como estaba; mas vale eso que un
--    sitio publicando el aviso equivocado, o ninguno.
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
    if v_version <> 3 then
        raise exception 'La version vigente quedo en % y deberia ser la 3. No se aplico nada.', v_version;
    end if;
end
$verificar$;


-- ---------------------------------------------------------------------
-- 5. VERIFICACION DE ACENTOS. Va al final para que sea el resultado que el
--    editor SQL deja en pantalla al terminar; tambien se puede volver a
--    correr sola cuando se quiera.
--
--    Como lee: "acentos_*" cuenta las letras acentuadas restando el texto
--    sin ellas (translate borra los caracteres de la lista). Lo que se mira
--    NO es "que sean muchas", sino que sean EXACTAMENTE las esperadas, y
--    esa es la parte fina: el texto es fijo, asi que la cuenta correcta es
--    un solo numero. Si el aviso se pegara plano, la cuenta se desploma a
--    cero; y si llegara mojibake, se DUPLICA, porque cada letra acentuada
--    se parte en dos caracteres que la lista tambien borra. Un numero que
--    no sea el esperado es texto equivocado, en cualquiera de los dos
--    sentidos.
--
--    "mojibake_detectado" es un apoyo, no la prueba: "Ã" y "Â" son la firma
--    tipica de un UTF-8 leido como Latin-1, pero si el archivo entero se
--    pegara mal, tambien se estropearian esas dos letras DENTRO de la
--    consulta y la comparacion dejaria de encontrarse a si misma. Sirve
--    cuando la verificacion se corre despues, en una sesion limpia. La
--    cuenta exacta es la que no se puede enganar.
--
--    Las banderas de abajo confirman ademas que la version que quedo
--    vigente es la que trae responsable, plazo, videovigilancia, correo y
--    la ruta relativa del integral.
-- ---------------------------------------------------------------------
select version                                                                     as version_vigente,
       length(contenido)                                                           as caracteres_integral,
       octet_length(contenido) - length(contenido)                                 as bytes_de_mas,
       length(contenido)
           - length(translate(contenido, 'áéíóúüñÁÉÍÓÚÜÑ¿¡', ''))                  as acentos_integral,
       length(contenido_simplificado)
           - length(translate(contenido_simplificado, 'áéíóúüñÁÉÍÓÚÜÑ¿¡', ''))     as acentos_simplificado,
       (contenido like '%Ã%' or contenido like '%Â%'
        or contenido_simplificado like '%Ã%'
        or contenido_simplificado like '%Â%')                                      as mojibake_detectado,
       (contenido like '%Instituto Asunción de Querétaro%')                         as responsable_ok,
       (contenido like '%cinco años%')                                             as plazo_ok,
       (contenido like '%dieciséis días%')                                         as videovigilancia_ok,
       (contenido like '%aviso.privacidad@asuncionqro.edu.mx%')                    as correo_ok,
       (contenido_simplificado like '%/aviso-de-privacidad/%')                      as ruta_relativa_ok
  from aviso_versiones
 where vigente;


-- =====================================================================
-- Auditoria esperada:
--
-- - La consulta del paso 5 devuelve UNA fila, con estos valores EXACTOS:
--     version_vigente ...... 3
--     caracteres_integral .. 10188
--     bytes_de_mas ......... 133
--     acentos_integral ..... 133
--     acentos_simplificado . 12
--     mojibake_detectado ... false
--     las cinco banderas _ok  true
--   bytes_de_mas y acentos_integral coinciden porque las 133 letras
--   acentuadas son lo unico fuera de ASCII en el texto, y en UTF-8 ocupan
--   dos bytes cada una. Cero en las cuentas = el aviso se pego plano; el
--   doble (266 y 24) = se pego mojibake. En cualquiera de los dos casos NO
--   dejarlo asi: volver a aplicar el bloque desde el archivo, cuidando que
--   el editor reciba UTF-8.
--
-- - select version, vigente from aviso_versiones order by version;
--   devuelve la v1 y la v2 con vigente = false y la v3 con vigente = true.
--   La v2 sigue existiendo, con su texto original sin tocar: es lo que
--   firmaron los expedientes ya capturados.
--
-- - El candado se prueba en dos direcciones, y ambas deben FALLAR:
--     insert into aviso_versiones (version, contenido, vigente)
--     values (99, 'prueba', true);            -- viola el candado
--     update aviso_versiones set contenido_simplificado = null
--      where vigente;                         -- viola el candado
--   Las dos deben responder "aviso_vigente_exige_simplificado". Si alguna
--   pasa, el candado no quedo puesto. (La primera falla incluso antes por
--   uq_aviso_una_vigente si se corre tal cual con otra vigente presente:
--   para probar solo el candado, correrla dentro de una transaccion que se
--   deshaga con rollback, o con vigente = true tras apagar la v3.)
--
-- - /aviso-de-privacidad/ muestra "Versión 3" al pie y el texto acentuado,
--   un parrafo por apartado. La burbuja del formulario muestra el primer
--   parrafo del simplificado y despliega los otros dos con "Ver más".
--
-- - Un alta nueva sella en aceptaciones el aviso_version_id de la v3; las
--   aceptaciones anteriores conservan el de la v2 y su hash sigue
--   verificando contra el texto viejo. No se resiembra ni se recalcula
--   nada: la evidencia acredita lo que se mostro en su momento.
--
-- - Pendiente de Gerardo, fuera de la base: actualizar la fila 4 del
--   tablero de decisiones legales de E6 (dice seis anos desde la baja; lo
--   publicado es cinco desde que termina la finalidad) y el texto del
--   entregable E6 - Aviso de Privacidad SATAG.md, que sigue siendo el
--   borrador de la v2.
-- =====================================================================
