-- =====================================================================
-- 64_aviso_v6_parentesco.sql
--
-- Publica la VERSION 6 del aviso de privacidad. Acompana al bloque 63
-- (tipo de usuario 'otro' con su parentesco) y al 65 (apellidos de la
-- familia tambien para alumnos). Sin el, el documento que la persona
-- firma se contradice con lo que el sistema hace, que es exactamente el
-- defecto que el bloque 61 se escribio para cerrar.
--
--
-- ORDEN DE APLICACION DEL CAMBIO COMPLETO:
--
--   1. Bloque 63   Retrocompatible con el sitio publicado.
--   2. Bloque 64   (este) Tambien retrocompatible: el cliente viejo lee de
--                  la base el aviso vigente, sea cual sea, y crear_registro
--                  acepta el id de la version que se le mostro aunque ya no
--                  sea la vigente (solo exige que exista).
--   3. Deploy del cliente nuevo.
--   4. Bloque 65   UNICAMENTE con el cliente nuevo publicado y verificado.
--
-- Este bloque va ANTES del deploy porque el cliente nuevo empieza a
-- recabar el parentesco y a pedirles los apellidos a los alumnos desde el
-- primer minuto: el aviso que se firma tiene que decirlo desde ese mismo
-- minuto.
--
--
-- DEFECTO 1 - EL CATALOGO NO MENCIONA EL PARENTESCO.
--
-- El bloque 63 recaba el parentesco del tipo 'otro' y lo SELLA dentro del
-- hash de la aceptacion. El catalogo de datos del anexo de SATAG (v5) no
-- lo enumera. Un dato que se guarda y se sella sin estar en el catalogo
-- del aviso firmado es un dato recabado sin informar.
--
-- Arreglo: el parentesco entra a los datos identificativos del anexo,
-- con la misma forma que ya usan los apellidos de la familia: que dato
-- es, a quien se le pide y para que.
--
--
-- DEFECTO 2 - EL AVISO DICE A QUIEN NO SE LE PIDEN LOS APELLIDOS, Y YA NO
-- ES VERDAD.
--
-- La v5 dice, en el apartado de los apellidos, que "se solicitan a los
-- padres, las madres y los tutores que gestionan el TAG de un alumno; el
-- personal docente y administrativo acredita su pertenencia por su propia
-- relacion con el Instituto, de modo que a ellos no se les piden", y el
-- catalogo repite que se solicitan "a los padres, las madres y los
-- tutores". Con los bloques 63 y 65 se piden tambien a los alumnos y a
-- cualquier otro familiar.
--
-- Arreglo: las dos frases dicen ahora a quien se le piden de verdad —
-- padres, madres, tutores, alumnos y cualquier otro familiar autorizado—,
-- y el personal docente y administrativo sigue fuera.
--
-- Y, por la misma razon, el texto SIMPLIFICADO (el que se muestra en el
-- primer paso del formulario) suma el parentesco a su lista de datos que
-- se recaban: esa lista es la que la persona lee antes de abrir el
-- integral, y no puede omitir lo que el integral ya enumera.
--
-- NINGUN ARREGLO TOCA UNA COMA DEL TEXTO INSTITUCIONAL. Los tres cambios
-- del integral viven en el ANEXO de SATAG, despues de "TRATAMIENTO
-- ESPECIFICO PARA SATAG"; el aviso general del Instituto sigue textual e
-- integro, igual que en la v4 y la v5. La verificacion del paso 4 lo
-- comprueba byte por byte contra la v5.
--
--
-- POR QUE V6 Y NO CORREGIR LA V5 EN SITIO.
--
-- La v5 esta vigente y el sitio esta en produccion: no hay forma de saber
-- desde aqui cuantas aceptaciones ya se firmaron contra ella. Publicar una
-- version nueva es la unica operacion que nunca invalida evidencia de
-- nadie. Su costo es un numero de version; una evidencia rota, no se
-- arregla.
--
-- LO QUE ESTE BLOQUE NO TOCA: las filas de la v1 a la v5 se quedan en la
-- tabla, intactas y con vigente = false. Sus aceptaciones siguen
-- acreditando el texto exacto que se les mostro.
--
--
-- FORMA DEL TEXTO: identica a la v5 (bloque 61). Un parrafo por linea, un
-- apartado por titulo en su propia linea.
--
-- DESPLIEGUE: no requiere publicar el sitio. No se crea ni se cambia
-- ningun RPC: sin drop function, sin grants, sin notify pgrst.
--
-- QUE HACE, EN ORDEN:
--   1. Guardia: no pisa una v6 ajena ya firmada.
--   2. Publica la v6 y mueve la vigencia.
--   3. Comprueba la invariante (exactamente una vigente, y es la v6).
--   4. Verifica la codificacion, que los arreglos entraron y que, fuera de
--      ellos, la v6 es la v5 byte por byte.
--
-- Idempotente: se puede reejecutar completo sin dano.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. GUARDIA: que este bloque no pise una v6 que no sea la suya.
-- ---------------------------------------------------------------------
do $guardia$
declare
    v_es_otro_texto boolean;
    v_firmas        int;
begin
    select position('a los alumnos y a cualquier otro familiar' in contenido) = 0
      into v_es_otro_texto
      from aviso_versiones
     where version = 6;

    if v_es_otro_texto is null then
        return;                       -- no existe la v6: el caso normal
    end if;

    if not v_es_otro_texto then
        raise notice 'La version 6 ya trae estos arreglos; el bloque la reescribe igual.';
        return;
    end if;

    select count(*)
      into v_firmas
      from aceptaciones a
      join aviso_versiones v on v.id = a.aviso_version_id
     where v.version = 6;

    if v_firmas > 0 then
        raise exception 'Ya existe una version 6 con OTRO texto y % aceptacion(es) firmadas contra el; sobrescribirla romperia esa evidencia. Publique este texto como version 7. No se aplico nada.', v_firmas;
    end if;

    raise notice 'Habia una version 6 con otro texto y sin firmas; se sustituye.';
end
$guardia$;


-- ---------------------------------------------------------------------
-- 2. Publicacion de la version 6.
-- ---------------------------------------------------------------------
update aviso_versiones
   set vigente = false
 where vigente
   and version <> 6;

insert into aviso_versiones (version, contenido, contenido_simplificado, url_publica, vigente)
values (
    6,
    $aviso_v6$Aviso de Privacidad Integral
INSTITUTO ASUNCIÓN DE QUERÉTARO, A.C.
Es nuestra política respetar y proteger su privacidad y sus datos personales, por lo que en los términos de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP), y demás disposiciones legales aplicables al tratamiento de los datos personales, el Instituto Asunción de Querétaro, A.C., con domicilio en la Cerrada de la Asunción  No. 16, Colonia Loma Dorada, Querétaro, Querétaro, Código Postal 76060, hace de su conocimiento que es responsable de la recolección y tratamiento de sus datos personales.
AVISO DE PRIVACIDAD INTEGRAL
Para nosotros, la confidencialidad y seguridad de sus datos personales es una prioridad, motivo por el cual, usted puede tener la certeza que su información será manejada bajo los principios de calidad, licitud, confidencialidad, transparencia, temporalidad, seguridad, fidelidad y finalidad, así como en los términos señalados en la LFPDPPP.
La FINALIDAD por la que requerimos sus datos personales, son:
I. Alumnos y padres de familia o tutores legales:
Dar cumplimiento y mantenimiento a las obligaciones contractuales que deriven de la relación entre los alumnos, padres de familia o tutores legales y el Instituto Asunción de Querétaro, A.C. y/o
Para la identificación, operación y administración necesarias para la prestación de los servicios académicos y administrativos que ofrece el Instituto Asunción de Querétaro, A.C. a sus alumnos y padres de familia o tutores legales; como son la integración de expedientes, informes y registro de altas, control de ingresos, otorgamiento de becas.
II. Exalumnos y padres de familia o tutores legales de exalumnos:
Dar cumplimiento a las acciones legales o administrativas que pudieran derivar de la relación contractual que tuvimos en su momento
III. Personal administrativo y/o docente (activos)
Iniciar los procesos de selección de candidatos a ocupar una plaza ofertada por el Instituto Asunción de Querétaro, A.C., y/o establecer en su momento, una relación laboral.
Dar mantenimiento a la relación laboral que se tiene con las personas que prestan sus servicios en las áreas administrativas o de intendencia o como docentes del Instituto Asunción de Querétaro, A.C.
Para la administración, control administrativo y presentar información ante INFONAVIT, FONACOT, IMSS, SAT del personal del Colegio.
IV. Personal administrativo y/o docente que tuvo una relación con nosotros:
Dar cumplimiento a las acciones fiscales, legales o administrativas que pudieran derivar de la relación contractual que tuvimos en su momento.
V. Proveedores (personas físicas) y/o representante legal:
Establecer, dar seguimiento, control y mantenimiento a las relaciones contractuales que tiene con el Instituto Asunción de Querétaro, A.C., o
Dar cumplimiento a las obligaciones fiscales y contractuales que deriven de nuestra relación de proveeduría; o
VI. Video Vigilancia
Las imágenes captadas por el sistema de video vigilancia son obtenidas para su seguridad, la de las personas que nos visitan, así como para la supervisión, control interno y aplicación del reglamento escolar y medidas disciplinarias correspondientes
VII. Dar atención a las consultas y/o ejercicio de los derechos de acceso, rectificación o de oposición de datos personales que usted realice.
Para dar cumplimiento a dichos fines, se requirió o se requieren los siguientes DATOS PERSONALES:
Alumnos menores de edad*. -
Identificativos:
Nombre y apellidos, acta de nacimiento, edad, nacionalidad, sexo, fotografía, imagen (cuando es captada por el sistema de video-vigilancia), Cédula de Identidad Personal, Clave Única de Registro Poblacional (CURP), domicilio, teléfono fijo.
De tránsito y migratorios:
Pasaporte, FM2 o FM3, visas
Creencias religiosas*.
Salud*:
Referencia de enfermedades, vacunas, tipo de sangre, alergias y estado físico de salud.
Académicos:
Calificaciones, certificados, listas de asistencia.
Electrónicos:
Correo electrónico, usuario, contraseña provisional, Dirección IP
Tutor o responsable legal. -
Identificativos:
Nombre y apellidos, fecha de nacimiento, firma autógrafa (en su defecto huella digital), imagen (cuando es captada por el sistema de video-vigilancia), domicilio, teléfono fijo, teléfono celular, copia de identificación oficial, comprobante de domicilio, Clave Única de Registro de Población (CURP).
De tránsito y migratorios:
Pasaporte, FM2 o FM3, visas
Electrónicos:
Correo electrónico.
Fiscales:
Registro Federal de Contribuyentes y domicilio fiscal, facturas.
Patrimoniales:
Número de cuentas bancarias, número de tarjetas de crédito y/o débito, y nombre de institución bancaria, CLABE (Clave Bancaria Estandarizada), importe pagado por conceptos de colegiaturas y demás cuotas.
Jurisdiccionales:
Resoluciones, sentencias o documentos en los que conste la patria potestad del menor de edad.
Alumnos mayores de edad. -
Identificativos:
Nombre y apellidos, acta de nacimiento, edad, nacionalidad, sexo, fotografía, imagen (cuando es captada por el sistema de video-vigilancia), Credencial para Votar expedida por el Instituto Nacional Electoral, Cédula Única de Registro Poblacional (CURP), domicilio, teléfono fijo, teléfono celular, acta de nacimiento, comprobante de domicilio.
De tránsito y migratorios:
Pasaporte, FM2 o FM3, visas
Creencias religiosas*.
Salud*:
Referencia de enfermedades, vacunas, tipo de sangre, alergias y estado físico de salud.
Electrónicos:
Correo electrónico, usuario, contraseña provisional, Dirección IP.
Académicos:
Calificaciones, certificados, listas de asistencia.
Personal administrativo y docente.-
Identificativos:
Nombre, edad, acta de nacimiento, domicilio, firma, teléfono (fijo), número de celular, fotografía, imagen (cuando es captada por el sistema de video-vigilancia), número de la credencial para votar [INE], Clave Única de Registro Población, fotografía, nacionalidad.
Biométricos:
Huella dactilar.
De tránsito y migratorios:
Pasaporte, FM2 o FM3, visas
Electrónicos:
Correo electrónico, usuario, contraseña, firma electrónica, dirección IP, firma electrónica.
Académicos:
Trayectoria académica, títulos, cédula profesional, certificados, reconocimientos.
Fiscales:
Registro Federal de Contribuyentes, domicilio fiscal, recibo de honorarios, declaración anual, “Constancia de Sueldos, Salarios, conceptos asimilados, créditos al salario y subsidios para el empleo”, “Constancia de Pagos y Retenciones del ISR, IVA e IEPS (esto en caso de ser contratado bajo el régimen de persona física), aportaciones obrero patronales, número de seguridad social, hojas de retenciones.
Laborales:
Información contenida en los contratos, referencias laborales y personales, solicitud de empleo, curriculum vitae, incidencias laborales, capacitación, resultados de evaluaciones, número de seguridad social, finiquitos o liquidaciones, renuncias, evaluaciones psicométricas de inteligencia y de personalidad.
Patrimoniales:
Número de cuentas bancarias y nombre institución bancaria, CLABE (Clave Bancaria Estandarizada), seguros, finanzas, salario y/o remuneración, ingresos, historial crediticio.
Jurisdiccionales:
Resoluciones, finiquitos, liquidaciones, demandas, laudos laborales.
Proveedores. - (personas físicas y/o representantes legales):
Identificativos:
Nombre, domicilio (comercial), teléfono (fijo), teléfono celular, Clave Única de Registro Población, firma.
Electrónicos:
Correo electrónico.
Fiscales:
Registro Federal de Contribuyentes, domicilio fiscal, facturas.
Patrimoniales:
Número de cuentas bancarias y nombre institución bancaria, CLABE (Clave Bancaria Estandarizada)
Es importante señalar que los datos marcados con asterisco (*), son considerados como información sensible, por lo que, podrá oponerse a su tratamiento en cualquier momento, en los términos fijados en el siguiente párrafo.
Dichos datos personales son proporcionados por su titular de forma libre y voluntaria al Instituto Asunción de Querétaro, A.C. En el caso, de que Usted no quiera que sus datos personales sigan siendo tratados en nuestros sistemas de datos personales, podrá remitir un correo electrónico a  aviso.privacidad@asuncionqro.edu.mx   o presentando un escrito libre en la Dirección del Colegio, manifestando su OPOSICIÓN A DICHO TRATAMIENTO, esto con el fin de que sean dados de baja de éstos, sin embargo, es importante señalarle que, estos seguirán en nuestros sistemas por un período no mayor de cinco años, con el fin de dar frente a las acciones que pudieran derivar de nuestra relación con usted.
El TIEMPO que conservamos sus datos son:
Alumnos, exalumnos, padres de familia o tutores legales;
Los datos personales serán conservados en nuestros sistemas de datos personales por el tiempo necesario para dar cumplimiento a los fines señalados al inicio de este aviso de privacidad, y las acciones judiciales y/o fiscales que deriven de estos, el cual, por regla general no podrá exceder un período máximo de cinco años, contados a partir de la terminación de esa finalidad.
Personal docente y administrativo; y proveedores;
Los datos personales serán mantenidos en nuestros sistemas de datos personales, por el tiempo necesario para dar cumplimiento a los fines señalados al inicio de este aviso de privacidad, y las acciones judiciales y/o fiscales que deriven de estos, el cual, por regla general no podrá exceder un período máximo de cinco años, contados a partir de la terminación de esa finalidad.
Proveedores;
Los datos personales serán mantenidos en nuestros sistemas de datos personales, por el tiempo necesario para dar cumplimiento a los fines señalados al inicio de este aviso de privacidad, y las acciones judiciales y/o fiscales que deriven de estos, el cual, por regla general no podrá exceder un período máximo de diez años, contados a partir de la terminación de esa finalidad.
Video vigilancia;
Ahora bien, los datos personales de tipo biométrico y/o imagen que son objeto del tratamiento de video-vigilancia, serán conservados exclusivamente por un término de dieciséis días naturales.
La información que voluntariamente usted nos ha proporcionado, podrá ser transmitida directa y/o indirectamente a autoridades de la Unidad de Servicios para la Educación Básica en el Estado de Querétaro(USEBEQ), Secretaría de Educación Pública (Federal), Secretaría de Educación del Gobierno del Estado de Querétaro, Secretaria de Salud, Instituto Mexicano del Seguro Social, del Trabajo y Previsión Social, Instituto Nacional de Estadística y Geografía (INEGI), Servicio de Administración Tributaria (SAT), el Instituto del Fondo Nacional de la Vivienda para los Trabajadores (INFONAVIT), Secretaría de Relaciones Exteriores, Instituto Mexicano de la Propiedad Industrial (IMPI), al Municipio de Querétaro u otras que funden y motiven su requerimiento en los términos del artículo 37 de la LFPDPPPP. Así mismo, podrá ser proporcionada a Instituciones Bancarias, auditores, despachos, consultorías externas íntimamente relacionadas con los fines antes señalados, instituciones de educación superior del sector privado o público (a fin de que éstas proporcionen información sobre los planes académicos que ofertan);  a quienes se les proporcionará una copia del Aviso de Privacidad, los que asumirán las obligaciones que deriven del tratamiento de sus datos personales, en los términos del artículo 36 de la citada Ley Federal de Protección de Datos Personales en Posesión de los Particulares.
En el caso de que, usted se oponga a esta transferencia, deberá hacerlo de nuestro conocimiento, por medio de un escrito libre, dirigido al Instituto Asunción de Querétaro, A.C. o por medio de los formatos que para tal efecto expida el Instituto Federal de Acceso a la Información y Protección de Datos (INAI), en donde manifieste libremente su oposición a esta transferencia, anexando copia de su identificación oficial; se exceptúa de estas transferencias lo señalado en el artículo 37 de la LFPDPPP.  Ese escrito, deberá ser presentado físicamente en la dirección señalada al inicio de este aviso de privacidad.
El titular de los datos personales, en todo momento, y en los términos de la LFPDPPP, podrá ejercitar los DERECHOS DE ACCESO, RECTIFICACIÓN, CANCELACIÓN Y OPOSICIÓN, con respecto a su información que se encuentre bajo tratamiento en alguno de los sistemas datos personales; por lo anterior, el interesado deberá:
Presentar su solicitud físicamente en la dirección señalada al inicio del presente aviso, o por medio del correo electrónico: aviso.privacidad@asuncionqro.edu.mx
La solicitud (física o electrónica) de acceso, rectificación, cancelación y oposición deberá señalar:
Nombre del tutor o responsable legal, o nombre del titular de los datos personales.
El domicilio o medio electrónico para comunicarle la respuesta a su solicitud.
En su caso, el nombre del representante legal o apoderado.
¿Qué derecho está ejercitando? Es decir, si se trata del derecho de acceso, o el de rectificación, o el de cancelación, o el de oposición.
La descripción clara y precisa de los datos personales respecto de los que se busca ejercer alguno de los derechos señalados en el inciso anterior.
En caso de que se trate del derecho de rectificación, deberá señalar, por lo menos, los datos personales que fueren incorrectos, o que se deseen actualizar.
En caso de que se trate del derecho de cancelación u oposición, deberá señalar, por lo menos, los datos personales sobre los que ejercita esos derechos, y algún dato o información por el que usted considere deben proceder esos derechos.
También deberá señalar cualquier elemento o documento que facilite la localización de los datos personales.
La forma en que se requiere la información: copia simple, documento electrónico u otro medio.
Al tratarse de un derecho personalísimo, sí su intención es ejercitar los derechos ARCO sobre la información de un menor de edad, usted deberá acreditar su personalidad (por medio de la Credencial para Votar, expedida por el Instituto Nacional Electoral, o Pasaporte, o Visa vigente, o Cédula Profesional) y la tutela (por medio del acta de nacimiento, resolución judicial, Cédula de Identidad Personal [Registro de Menores de Edad]).
Sí su intención es ejercitar alguno de los derechos ARCO y es tutor de un mayor de edad, usted deberá acreditar su personalidad por medio de la Credencial para Votar, expedida por el Instituto Nacional Electoral, o Pasaporte, o Visa vigente, o Cédula Profesional y la tutela se deberá acreditar por medio del acta de nacimiento, o resolución judicial.
En el supuesto de que usted sea un mayor de edad y desee ejercitar los derechos ARCO, deberá acreditar su personalidad por medio de la Credencial para Votar, expedida por el Instituto Nacional Electoral, o Pasaporte, o Cédula Profesional, o Cartilla Militar.
La acreditación de personalidad o representación se realizará al momento en que se recoja la respuesta que haya recaído a su solicitud.
El señalamiento de que se ha emitido una respuesta a su solicitud, será notificado en el medio señalado para tal efecto.
El plazo que tenemos para dar respuesta a su solicitud, es de 20 días contados a partir de su recepción, y en el supuesto de que la respuesta sea favorable a sus intereses, su entrega se realizará dentro de los 15 días siguientes; no se omite señalar que, estos plazos podrán ser ampliados, en los términos del artículo 32 de la LFPDPPP.
No omitimos señalar que, usted en cualquier momento puede revocar el consentimiento que nos otorgó previamente, para tal efecto, deberá observar el procedimiento señalado en el párrafo anterior.
El Instituto Asunción de Querétaro, A.C., emplea las medidas de seguridad administrativas, técnicas y físicas adecuadas para proteger sus datos personales contra daño, pérdida, alteración, destrucción o divulgación, acceso o tratamiento por terceros no autorizados, en caso de que, se presentará una vulneración, nos comprometemos a hacérselo de su conocimiento, por medio electrónico y/o físico, a fin de evitar una vulneración aún más grave a su privacidad.
En caso de MODIFICACIONES futuras al presente Aviso de Privacidad, le serán comunicados por medio de correo electrónico, y/o a través del sitio de internet del Instituto: www.asuncionqro.edu.mx y/o por cualquier otro medio oral, impreso o electrónico que el Instituto Asunción de Querétaro, A.C. considere idóneo para tal efecto.
Fecha de actualización: 01 de septiembre 2026

TRATAMIENTO ESPECÍFICO PARA SATAG - SISTEMA DE ADQUISICIÓN DE TAG VEHICULAR
Este apartado forma parte del aviso de privacidad anterior y lo complementa para un trámite determinado; no sustituye ninguno de sus apartados. Todo lo que este aviso señala sobre la identidad y el domicilio del responsable, el correo de contacto, el tiempo de conservación, las transferencias en lo que resulten aplicables a este trámite, el procedimiento para ejercer los derechos de acceso, rectificación, cancelación y oposición, la revocación del consentimiento, las medidas de seguridad, la comunicación de vulneraciones y la comunicación de modificaciones, se aplica en sus mismos términos a este trámite. Aquí se informa únicamente lo que el trámite del TAG vehicular agrega.
SATAG es el sistema con el que el Instituto Asunción de Querétaro, A.C. administra la solicitud, la asignación, la instalación, el cambio, la reposición, la baja y el control del TAG con el que un vehículo ingresa al estacionamiento del inmueble, y con el que se conserva la evidencia de que usted aceptó el reglamento del estacionamiento y este aviso de privacidad.

DATOS PERSONALES QUE SE RECABAN ADICIONALMENTE PARA EL TAG VEHICULAR
Solicitantes y usuarios del TAG vehicular. -
Identificativos:
Los apellidos con los que la familia se encuentra inscrita en el Instituto, que se solicitan a los padres, las madres, los tutores, los alumnos y cualquier otro familiar autorizado para confirmar que quien pide el TAG pertenece a la comunidad escolar; el tipo de usuario con el que se solicita el TAG, es decir, alumno, padre, madre o tutor, personal docente, personal administrativo u otro rol autorizado, junto con la confirmación administrativa que el Instituto registra cuando comprueba ese tipo; el parentesco con la familia del alumno que declara, con sus propias palabras, el familiar autorizado que solicita el TAG sin ser padre, madre, tutor ni alumno, como un tío o un abuelo, para saber qué lo vincula con una familia de la comunidad escolar, junto con la corrección que el Instituto registra cuando lo comprueba; el nombre de quien gestiona el trámite y su relación con el usuario del TAG cuando no son la misma persona; el nombre de quien firma la aceptación y la imagen de la firma manuscrita que traza en la pantalla; y los datos administrativos con los que el TAG queda asociado a usted, es decir, el folio del trámite, el número del dispositivo, el estacionamiento asignado, la procedencia del TAG según sea propiedad del Instituto o propiedad de usted, el estado del trámite, los cambios, las reposiciones, la baja y los movimientos que se registren.
Electrónicos:
Los trazos con los que se capturó la firma cuando se conserven, la huella digital SHA-256 de la imagen de la firma, la fecha y la hora de la aceptación, el carácter con el que firma quien acepta, la versión exacta del reglamento y del aviso de privacidad que se le mostraron al firmar, la huella digital de cada uno de esos dos textos y la constancia de que ambos se desplegaron en la pantalla antes de la firma, el sello de tiempo, la huella digital SHA-256 del paquete firmado, la bitácora del evento y los datos técnicos de la sesión que resulten necesarios para la seguridad, la evidencia y la auditoría, como el identificador de la sesión, la dirección IP desde la que se envió la solicitud, ya señalada entre los datos electrónicos de este aviso, y el navegador utilizado; estos datos técnicos también se registran cuando el envío no se completa o cuando los datos no coinciden con ningún trámite, con el único fin de contener intentos automatizados contra el sistema.
Patrimoniales:
Los datos del vehículo que usted asocia al TAG, es decir, las placas, que además identifican al vehículo relacionado con usted, la marca, el modelo, el color y la indicación de que el vehículo circula sin placas cuando ese es el caso; y el registro del cobro administrativo del TAG, es decir, el monto, la fecha, el folio del recibo interno, la persona del Instituto que registra el cobro y el corte de caja en el que ese cobro queda incluido.
Los datos de este apartado se recaban de quien solicita el TAG y de quien lo usa, sea el padre, la madre o el tutor de un alumno, un alumno mayor de edad, el personal docente o administrativo, o cualquier otra persona a la que el Instituto autorice el acceso vehicular; a cada una de ellas le siguen aplicando, además, los datos personales que este aviso ya enumera para el grupo al que pertenece.
En este trámite no se le solicitan datos personales sensibles. El campo de observaciones sirve para anotar detalles operativos del vehículo o del trámite, y el personal del Instituto tiene instrucción de no capturar en él información de salud, discapacidad, creencias religiosas, opiniones políticas ni ningún otro dato sensible.

FINALIDADES DEL TRATAMIENTO EN SATAG
Los datos señalados en el apartado anterior se tratan para registrar la solicitud de adquisición o de uso del TAG vehicular; confirmar que quien la presenta pertenece a la comunidad escolar; identificar al usuario, a quien gestiona el trámite y al vehículo asociado al dispositivo; asignar el lugar de estacionamiento y operar el control de acceso vehicular del inmueble; registrar la aceptación del reglamento del estacionamiento y conservar la evidencia de esa aceptación; registrar el cobro administrativo del TAG y conciliarlo con el efectivo recibido; gestionar la instalación, el cambio, la reposición, la baja o la inactivación del dispositivo; atender las solicitudes y aclaraciones que usted presente sobre el TAG o sobre sus datos personales; y mantener la seguridad, la trazabilidad, la auditoría y el control interno del sistema, así como cumplir las obligaciones administrativas, contables y legales que deriven de este trámite.
Todas estas finalidades son necesarias para que el TAG exista y funcione: sin ellas el Instituto no puede otorgar ni mantener el acceso vehicular. El Instituto no trata los datos recabados en SATAG con fines publicitarios, comerciales o de prospección, ni para finalidades distintas de las que aquí se informan.

LOS APELLIDOS DE SU FAMILIA
El formulario del TAG le pide los apellidos con los que su familia está inscrita en el Instituto, y conviene decir para qué: el nombre de quien conduce no coincide necesariamente con los apellidos del alumno inscrito, y su única finalidad es cotejar la solicitud contra la lista de inscritos para confirmar que el TAG se instala a una familia de la comunidad escolar y negar la instalación a quien no pertenece a ella.
Estos apellidos se solicitan a los padres, las madres y los tutores que gestionan el TAG de un alumno, a los alumnos y a cualquier otro familiar autorizado; el personal docente y administrativo acredita su pertenencia por su propia relación con el Instituto, de modo que a ellos no se les piden. No se utilizan para ninguna otra finalidad ni se comunican a nadie fuera del personal del Instituto expresamente autorizado.

LA FIRMA QUE USTED TRAZA EN LA PANTALLA
La aceptación del reglamento y de este aviso se realiza mediante una firma manuscrita que usted traza con el dedo o con el ratón en la pantalla. No es la firma autógrafa que este aviso ya enumera entre los datos identificativos, ni la firma electrónica que enumera entre los datos electrónicos del personal, ni la e.firma del Servicio de Administración Tributaria, ni una firma electrónica avanzada: es una firma electrónica simple, trazada en el momento sobre el documento que se le muestra, a la que SATAG añade elementos que refuerzan su valor probatorio.
Junto a la firma se guarda el paquete de la aceptación: una copia de lo que usted declaró en el formulario, la imagen de la firma, la versión exacta del reglamento y de este aviso que se le mostraron, la huella digital de cada uno de esos dos textos, la constancia de que ambos se desplegaron en la pantalla antes de que usted firmara, el carácter con el que firma, la fecha y la hora, el sello de tiempo, la bitácora del evento y la huella digital SHA-256 del paquete completo, que es un código que cambia si alguien altera cualquiera de esos elementos.
Se guarda todo esto por una razón: para que después pueda demostrarse qué texto exacto se aceptó, que ese texto no fue alterado y que usted lo tuvo a la vista antes de firmar. La evidencia no se conserva para vigilarlo a usted, sino para que después nadie, tampoco el Instituto, pueda cambiar lo que quedó acordado.
Cuando el usuario del TAG es un alumno menor de edad, quien firma es el padre, la madre o el tutor que gestiona el trámite, en su calidad de representante legal; el alumno puede figurar como usuario del beneficio vehicular, pero la aceptación proviene de quien ejerce la patria potestad o la tutela.
La imagen y los trazos de la firma se resguardan con el mismo cuidado que se debe a un rasgo propio de la persona: almacenamiento privado, acceso limitado al personal expresamente autorizado y enlaces temporales para consultarlos. La firma que usted traza en SATAG se usa exclusivamente para acreditar la aceptación de este trámite y no se reutiliza para ningún otro documento.

EL COBRO DEL TAG
El TAG tiene el costo administrativo que la Administración publique, y se cubre en efectivo en las oficinas del Instituto. Dentro de los datos patrimoniales que este aviso ya enumera, para este trámite se precisa que el Instituto registra el monto cobrado, la fecha del cobro, el folio del recibo interno que se le entrega, la persona del Instituto que lo registra y el corte de caja en el que ese cobro queda incluido, con la finalidad de acreditar el pago, conciliar el efectivo recibido y sustentar el control contable del trámite.
Para el cobro del TAG no se le solicitan datos bancarios, número de tarjeta ni ningún otro instrumento de pago: SATAG no recibe pagos en línea y no le pide datos de tarjetas ni de cuentas bancarias.

ENCARGADOS TECNOLÓGICOS Y SERVICIOS EN LA NUBE
SATAG se opera en servicios de nube contratados por el Instituto, entre ellos Supabase y la infraestructura sobre la que ese proveedor opera, que atienden el almacenamiento, la base de datos, la autenticación, los respaldos, la seguridad y la operación técnica del sistema. Estos proveedores tratan los datos por cuenta del Instituto y conforme a sus instrucciones, sin poder usarlos para fines propios: en los términos de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares son encargados, y poner los datos en sus manos constituye una remisión y no una transferencia, por lo que no requiere su consentimiento, no se enlista entre las transferencias señaladas en este aviso y no agrega destinatarios a los que este aviso ya enumera.
El Instituto conserva la documentación contractual de cada uno de estos proveedores, incluido el convenio de tratamiento de datos cuando corresponda, la región en la que se alojan los datos y las medidas de seguridad comprometidas, y responde del tratamiento que el encargado realiza por su cuenta.
Los datos indispensables para abrir el acceso del estacionamiento, es decir, el nombre del usuario, las placas del vehículo y el número del dispositivo, se registran además en el sistema de control de acceso vehicular que el propio Instituto opera en sus instalaciones; ese registro es un tratamiento interno del responsable y no implica comunicar sus datos a un tercero.

LA VIDEOVIGILANCIA DEL ESTACIONAMIENTO
El estacionamiento al que da acceso el TAG está cubierto por el sistema de videovigilancia que este aviso ya señala, en operación las veinticuatro horas, y sus grabaciones se conservan por el término de dieciséis días naturales que este aviso ya fija. Para este trámite se precisa que las imágenes del vehículo y sus placas se tratan como datos personales cuando permiten identificar o asociar a una persona, y que solo el personal del Instituto expresamente autorizado puede consultarlas.

TRANSFERENCIAS EN ESTE TRÁMITE
De las transferencias que este aviso enumera, los datos que se recaban para el TAG vehicular solo se comunican a la autoridad competente que funde y motive su requerimiento y, en su caso, a los auditores o despachos que revisen el control interno y contable del Instituto. No se comunican a instituciones de educación superior ni para ofrecerle planes académicos, ni para ninguna finalidad publicitaria, comercial o de prospección.

CONSERVACIÓN DE LOS DATOS DE ESTE TRÁMITE
Para el TAG vehicular, la finalidad que justifica el tratamiento termina con la baja del dispositivo o con el cierre del trámite que corresponda; a partir de ese momento corre el plazo de cinco años que este aviso ya señala, y ese mismo plazo se observa cuando el usuario del TAG es personal docente o administrativo del Instituto. Durante ese periodo el expediente deja de usarse en la operación diaria y solo queda disponible para aclaraciones, responsabilidades pendientes o requerimientos de autoridad competente.
Cumplido el plazo, el expediente se suprime o se disocia de forma segura, incluida la imagen de la firma resguardada en el almacenamiento privado. La revisión de los expedientes que ya cumplieron el plazo la solicita la Administración y la ejecuta el área de Tecnologías de la Información.

LIMITACIÓN DEL USO Y REVOCACIÓN DEL CONSENTIMIENTO EN ESTE TRÁMITE
Además de los medios que este aviso ya señala, usted puede pedir, en el mismo correo aviso.privacidad@asuncionqro.edu.mx, que sus datos de SATAG se usen únicamente para lo indispensable de la operación del TAG y que no se comuniquen a nadie fuera del personal del Instituto expresamente autorizado. Tenga presente que las finalidades de este trámite no pueden limitarse sin renunciar al beneficio: sin los datos del vehículo y sin la aceptación firmada del reglamento, el Instituto no puede otorgar ni mantener el acceso vehicular.
Si usted revoca el consentimiento sobre los datos indispensables, el TAG se da de baja y termina el acceso vehicular del vehículo asociado. La evidencia de una aceptación ya firmada no se modifica ni se elimina mientras subsista la responsabilidad que documenta, aun cuando el TAG se dé de baja o usted revoque su consentimiento, ni se eliminan los registros que el Instituto deba conservar por una obligación legal o contable; esa evidencia queda bloqueada y acredita únicamente lo que se le mostró y lo que usted aceptó en ese momento.

VERSIÓN VIGENTE DE ESTE AVISO Y CONSTANCIA DE LO QUE USTED ACEPTÓ
La versión vigente de este aviso, con el presente apartado incluido, se publica siempre en la misma dirección, /aviso-de-privacidad/, con su número de versión a la vista, y es la misma que se le muestra en el formulario antes de firmar. Las modificaciones se comunican, además, por los medios que este aviso ya señala.
Las versiones anteriores se conservan sin alterarse, y cada expediente guarda el número de versión del aviso y del reglamento que se mostraron al firmar, junto con la huella digital del paquete firmado, de modo que en todo momento pueda acreditarse qué texto exacto aceptó cada persona y en qué fecha lo hizo.
Si el aviso cambia, la firma que usted ya dio sigue acreditando el texto que se le mostró entonces, no el nuevo.$aviso_v6$,
    $simp_v6$El Instituto Asunción de Querétaro, A.C., con domicilio en Cerrada de la Asunción No. 16, Colonia Loma Dorada, Querétaro, Querétaro, C.P. 76060, es el responsable del tratamiento de sus datos personales. Los datos que usted proporciona en este formulario se usan para tramitar, asignar, instalar, cambiar o dar de baja el TAG con el que su vehículo ingresa al estacionamiento escolar, registrar el cobro administrativo del dispositivo y conservar la evidencia de que usted aceptó el reglamento y este aviso. Puede consultar el aviso de privacidad integral del Instituto, que incluye el apartado específico de SATAG, en /aviso-de-privacidad/.

En este trámite se recaban el nombre del usuario del TAG y el de quien gestiona la solicitud, los apellidos con los que la familia está inscrita en el Instituto (que sirven para confirmar que quien lo solicita pertenece a la comunidad escolar), el tipo de usuario, el parentesco con la familia cuando quien lo solicita es otro familiar, los datos del vehículo y sus placas, los datos administrativos del TAG, el registro del cobro en efectivo, la firma que usted traza en la pantalla y la evidencia que acredita su aceptación, es decir, la versión del reglamento y del aviso que se le mostraron, la fecha y la hora, la huella digital del paquete firmado y los datos técnicos de la sesión. No se le solicitan datos sensibles y sus datos no se usan con fines publicitarios ni comerciales.

Sus datos se conservan durante cinco años contados a partir de que termina la finalidad que justificó recabarlos, se resguardan en los sistemas del Instituto y en los servicios de nube que operan por cuenta de este, y solo se comunican a terceros en los supuestos que el propio aviso integral enumera. Para acceder a ellos, rectificarlos, cancelarlos, oponerse a su tratamiento, limitar su uso o revocar su consentimiento, escriba a aviso.privacidad@asuncionqro.edu.mx o presente un escrito en la Dirección del Colegio. El texto completo, incluidos el procedimiento detallado de esos derechos y la videovigilancia del inmueble, está en /aviso-de-privacidad/.$simp_v6$,
    '/aviso-de-privacidad/',
    true
)
on conflict (version) do update
    set contenido              = excluded.contenido,
        contenido_simplificado = excluded.contenido_simplificado,
        url_publica            = excluded.url_publica,
        vigente                = true;


-- ---------------------------------------------------------------------
-- 3. La mitad que ningun CHECK puede vigilar.
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
    if v_version <> 6 then
        raise exception 'La version vigente quedo en % y deberia ser la 6. No se aplico nada.', v_version;
    end if;
end
$verificar$;


-- ---------------------------------------------------------------------
-- 4. VERIFICACION. Misma prueba de codificacion que los bloques 60 y 61
--    (igualdad bytes_de_mas = bytes_esperados, nunca una cuenta de
--    caracteres sola, por la razon que explica el bloque 60), las
--    banderas de los arreglos, y dos pruebas de alcance contra la v5:
--
--    - institucional_identico: todo lo que va antes del anexo es igual en
--      la v6 y en la v5, byte por byte.
--    - solo_estos_cambios: si a la v6 se le deshacen los cambios de este
--      bloque (los mismos fragmentos, al reves), sale la v5 exacta. Es la
--      prueba de que no se colo ninguna otra diferencia, ni en el integral
--      ni en el simplificado.
-- ---------------------------------------------------------------------
select v6.version                                                                as version_vigente,
       octet_length(v6.contenido) - length(v6.contenido)                         as bytes_de_mas,
       (length(v6.contenido) - length(translate(v6.contenido, 'áéíóúüñÁÉÍÓÚÜÑ¿¡', '')))
           + 2 * (length(v6.contenido) - length(translate(v6.contenido, '“”', '')))
                                                                                 as bytes_esperados,
       length(v6.contenido) - length(translate(v6.contenido, 'áéíóúüñÁÉÍÓÚÜÑ¿¡', ''))
                                                                                 as acentos_integral,
       (v6.contenido like '%Ã%' or v6.contenido like '%Â%'
        or v6.contenido_simplificado like '%Ã%'
        or v6.contenido_simplificado like '%Â%')                                 as mojibake_detectado,
       (v6.contenido like '%TRATAMIENTO ESPECÍFICO PARA SATAG%')                 as anexo_ok,
       (v6.contenido like '%el parentesco con la familia del alumno que declara%'
        and v6.contenido_simplificado like '%el parentesco con la familia%')     as parentesco_ok,
       (v6.contenido like '%a los alumnos y a cualquier otro familiar%'
        and v6.contenido like '%los tutores, los alumnos y cualquier otro familiar autorizado%'
        and v6.contenido not like '%que gestionan el TAG de un alumno; el personal docente%')
                                                                                 as apellidos_a_quien_ok,
       (left(v6.contenido, position('TRATAMIENTO ESPECÍFICO PARA SATAG' in v6.contenido))
          = left(v5.contenido, position('TRATAMIENTO ESPECÍFICO PARA SATAG' in v5.contenido)))
                                                                                 as institucional_identico,
       (replace(replace(replace(v6.contenido,
               'que se solicitan a los padres, las madres, los tutores, los alumnos y cualquier otro familiar autorizado para confirmar que quien pide el TAG',
               'que se solicitan a los padres, las madres y los tutores para confirmar que quien pide el TAG'),
               'cuando comprueba ese tipo; el parentesco con la familia del alumno que declara, con sus propias palabras, el familiar autorizado que solicita el TAG sin ser padre, madre, tutor ni alumno, como un tío o un abuelo, para saber qué lo vincula con una familia de la comunidad escolar, junto con la corrección que el Instituto registra cuando lo comprueba; el nombre de quien gestiona el trámite',
               'cuando comprueba ese tipo; el nombre de quien gestiona el trámite'),
               'que gestionan el TAG de un alumno, a los alumnos y a cualquier otro familiar autorizado; el personal docente y administrativo',
               'que gestionan el TAG de un alumno; el personal docente y administrativo') = v5.contenido
        and replace(v6.contenido_simplificado,
               'pertenece a la comunidad escolar), el tipo de usuario, el parentesco con la familia cuando quien lo solicita es otro familiar, los datos del vehículo',
               'pertenece a la comunidad escolar), el tipo de usuario, los datos del vehículo') = v5.contenido_simplificado)
                                                                                 as solo_estos_cambios
  from aviso_versiones v6
  join aviso_versiones v5 on v5.version = 5
 where v6.vigente;


-- =====================================================================
-- Auditoria esperada:
--
-- - La consulta del paso 4 devuelve UNA fila, version 6, con
--   bytes_de_mas = bytes_esperados, acentos_integral distinto de cero,
--   mojibake_detectado en false, y las cinco banderas finales
--   (anexo_ok, parentesco_ok, apellidos_a_quien_ok,
--   institucional_identico, solo_estos_cambios) en true. Si no devuelve
--   ninguna fila, la v5 no esta en la tabla: no aplique nada mas y avise.
--
-- - Si solo_estos_cambios sale false con todo lo demas en true, la v5 de
--   la base no es la del bloque 61 tal como esta en el repo (alguien la
--   toco despues, o el editor altero el texto al pegar). No es un fallo
--   de este bloque, pero hay que entender la diferencia antes de seguir.
--
-- - select version, vigente from aviso_versiones order by version;
--   devuelve v1 a v5 con vigente = false, intactas, y v6 en true.
--
-- - /aviso-de-privacidad/ muestra, dentro del apartado SATAG, el
--   parentesco en los datos identificativos y, en LOS APELLIDOS DE SU
--   FAMILIA, que se piden tambien a los alumnos y a cualquier otro
--   familiar autorizado. Al pie, "Version 6 del aviso".
--
-- - Un alta nueva sella en aceptaciones el aviso_version_id de la v6; las
--   aceptaciones anteriores conservan su version y su hash sigue
--   verificando contra el texto que se les mostro.
--
-- - Reejecutar el bloque completo no cambia nada: publica el mismo texto
--   en la misma version y la guardia solo avisa por notice.
-- =====================================================================
