-- =====================================================================
-- 60_aviso_v4_institucional.sql
--
-- Publica la VERSION 4 del aviso de privacidad de SATAG: el AVISO GENERAL
-- DEL INSTITUTO, textual y completo, mas un ANEXO con lo que SATAG agrega.
--
--
-- LA DECISION (Gerardo Sanchez, Sistemas, 10-sep-2026).
--
-- Hasta la v3, SATAG publicaba un aviso PROPIO: un texto escrito para el
-- tramite del TAG, con sus propios apartados y su propia redaccion. Estaba
-- bien escrito y no le faltaba nada exigible, pero tenia un defecto que no
-- se arregla escribiendo mejor: era un SEGUNDO texto institucional. Dos
-- avisos del mismo responsable, redactados distinto, prometiendo cada uno
-- sus plazos y sus procedimientos, es exactamente lo que no se puede
-- sostener delante de una auditoria ni delante de una solicitud ARCO.
--
-- A partir de la v4, el aviso de SATAG ES el aviso institucional, palabra
-- por palabra, y lo unico que SATAG le pone es un apartado al final.
--
-- ENTERO Y TEXTUAL, aunque hable de cosas que el TAG no toca. El
-- institucional enumera datos de proveedores, de personal docente, de
-- exalumnos, pasaportes y creencias religiosas; nada de eso lo recaba
-- SATAG. Aun asi va completo, sin recortar, sin resumir, sin reordenar y
-- sin "mejorar" su redaccion. Recortarlo obligaria a defender cada tijera
-- ("por que quitaron este parrafo") y a mantener dos versiones del mismo
-- texto oficial, que es como empiezan las contradicciones. Sobra texto que
-- no aplica: eso no le hace dano a nadie. Falta texto que si aplicaba: eso
-- es lo que se paga caro.
--
--
-- QUE APORTA EL ANEXO. Es lo que el institucional NO cubre, y por eso
-- existe:
--   - DATOS DEL VEHICULO: placas, marca, modelo, color y la indicacion de
--     que el vehiculo circula sin placas.
--   - DATOS ADMINISTRATIVOS DEL TAG: folio del tramite, numero de
--     dispositivo, estacionamiento asignado, procedencia (de la escuela o
--     propio), estado del tramite, cambios, reposiciones, baja y
--     movimientos.
--   - APELLIDOS DE LA FAMILIA con la que el alumno esta inscrito: el dato
--     NUEVO que el formulario empieza a pedir el lunes (bloque 55). El
--     anexo le dedica un apartado propio, porque es el que va a generar
--     preguntas en la puerta: explica que el nombre de quien conduce no
--     tiene por que coincidir con los apellidos del alumno, y que su unica
--     finalidad es cotejar contra la lista de inscritos.
--   - LA FIRMA TRAZADA EN PANTALLA y su evidencia: la imagen, los trazos,
--     el nombre y el caracter de quien firma, la fecha y la hora, la
--     version exacta del reglamento y del aviso que se mostraron, la huella
--     de cada uno de esos dos textos, la constancia de que se desplegaron
--     antes de firmar, el sello de tiempo, la bitacora y la huella SHA-256
--     del paquete. El institucional nombra la "firma autografa" del tutor y
--     la "firma electronica" del personal, pero NO esta captura; el anexo
--     dice expresamente que no es ninguna de las dos.
--   - ENCARGADOS TECNOLOGICOS Y NUBE: Supabase y la infraestructura sobre
--     la que opera. Son ENCARGADOS, o sea remision y no transferencia, de
--     modo que no piden consentimiento y no agregan destinatarios a los que
--     el institucional ya enumera. El institucional no menciona ningun
--     encargado tecnologico.
--   - COBRO ADMINISTRATIVO EN EFECTIVO: monto, fecha, folio del recibo
--     interno, quien registra el cobro y el corte de caja donde queda
--     incluido. El institucional solo lo roza con "importe pagado por
--     colegiaturas y demas cuotas". El anexo NO escribe una cifra: dice "el
--     costo administrativo que la Administracion publique", que es lo unico
--     compatible con la clausula 6 del reglamento y evita reescribir el
--     aviso cada vez que cambie el precio.
--
-- QUE YA CUBRIA EL INSTITUCIONAL, y por eso el anexo no lo repite ni lo
-- contradice: responsable y domicilio, el correo aviso.privacidad, la
-- conservacion (cinco anos contados desde que termina la finalidad; diez
-- para proveedores), la videovigilancia (dieciseis dias naturales), el
-- procedimiento ARCO completo con sus 20 dias de respuesta y 15 de entrega
-- y su acreditacion de identidad y de tutela, las transferencias a USEBEQ,
-- SEP, SAT, IMSS, INFONAVIT y demas autoridades, las medidas de seguridad,
-- las vulneraciones, las modificaciones y la direccion IP, que ya viene
-- listada entre los datos electronicos.
--
-- El anexo los ANCLA en lugar de volver a declararlos: "a partir de ese
-- momento corre el plazo de cinco anos que este aviso ya senala", "ya
-- senalada entre los datos electronicos de este aviso", "los medios que
-- este aviso ya senala". Esa es la diferencia entre un anexo y un segundo
-- aviso: anclando, es imposible que el documento acabe con dos plazos, dos
-- correos o dos procedimientos distintos.
--
-- Y donde el anexo agrega, agrega DENTRO de la taxonomia del institucional:
-- un grupo de titular nuevo ("Solicitantes y usuarios del TAG vehicular. -")
-- con las mismas categorias que usa el resto del documento
-- (Identificativos, Electronicos, Patrimoniales), y una frase que remite a
-- los datos que cada persona ya tiene enumerados arriba segun el grupo al
-- que pertenece. Visualmente y juridicamente, el anexo es una continuacion
-- del catalogo, no un texto pegado al final.
--
--
-- POR QUE UNA V4 Y NO CORREGIR LA V3.
--
-- La v3 se publico HOY MISMO (bloques 57 y 59) y el aviso ya esta en el
-- dominio institucional. No hay forma de saber desde aqui si alguien firmo
-- contra ella en las ultimas horas, y si firmo, su hash se calculo sobre
-- ESE texto. Corregir el texto de una version ya firmada invalida la
-- evidencia de esos expedientes: el hash deja de verificar y el expediente
-- ya no acredita nada.
--
-- El bloque 59 resolvia eso preguntandole a la base (si hay firmas, camino
-- B; si no, camino A). Aqui no hace falta preguntar nada, porque el cambio
-- es de otro tamano: no es una frase que se agrega, es el texto entero que
-- se sustituye. Publicar una version NUEVA es la unica operacion que NUNCA
-- invalida evidencia de nadie, se haya firmado o no, y su costo total es un
-- numero de version. Un numero de version es barato; una evidencia rota, no
-- se arregla.
--
-- LO QUE ESTE BLOQUE NO TOCA. Las filas de la v1, la v2 y la v3 se quedan
-- en la tabla, intactas y con vigente = false. No se borran ni se corrigen
-- NUNCA: las aceptaciones ya firmadas apuntan a ellas por llave foranea
-- (aceptaciones.aviso_version_id) y su hash se calculo sobre ese texto
-- exacto. Las firmas viejas siguen siendo validas: acreditan lo que se
-- mostro entonces, que es justo lo que el propio anexo le promete al lector
-- en su ultima linea.
--
--
-- LA LIMPIEZA DEL WORD, que es lo UNICO que se le hizo al texto oficial.
-- El institucional se extrajo del archivo "Aviso Gral de Privacidad
-- Instituto Asuncion (2).docx" y traia tres artefactos de la extraccion:
--   1. El encabezado salio DOS VECES, cada una precedida de la basura de un
--      cuadro de texto ("-8255-205105Aviso de Privacidad" y "00Aviso de
--      Privacidad"). Se dejo UN encabezado limpio.
--   2. El titulo venia partido en dos lineas ("Aviso de Privacidad" /
--      "Integral"); se unio, porque es un solo titulo.
--   3. Un espacio duro (U+00A0) delante del correo, en el parrafo de la
--      oposicion. Es invisible, no cambia ni una palabra, y se normalizo a
--      un espacio normal para que lo unico fuera de ASCII en el texto sean
--      letras acentuadas y las tres comillas tipograficas del apartado de
--      datos fiscales (ver la verificacion del paso 4).
-- Nada mas. Ni una coma, ni un acento, ni un apartado movido de sitio. Las
-- comillas curvas, los dobles espacios y hasta la comilla que el Word dejo
-- sin cerrar siguen ahi, tal como estan en el documento oficial.
--
--
-- FORMA DEL TEXTO. El cliente parte el contenido por SALTOS DE LINEA y
-- pinta un parrafo por linea no vacia (lib/supabase/api.ts, getAvisoVigente;
-- app/aviso-de-privacidad/page.tsx pinta un <p> por parrafo). Por eso cada
-- titulo de apartado va en SU PROPIA LINEA y cada parrafo en UNA SOLA linea
-- larga, sin cortes manuales. Las lineas en blanco se descartan al pintar:
-- estan solo para que este archivo se pueda leer. Esa forma es tambien la
-- razon de que las categorias del catalogo ("Identificativos:",
-- "Electronicos:", "Patrimoniales:") vayan en su propia linea, igual que en
-- el resto del institucional.
--
-- En el SIMPLIFICADO, el PRIMER parrafo es el unico que se ve sin desplegar
-- (app/registro/page.tsx pinta el primero y esconde el resto tras "Ver
-- mas"), asi que ese primer parrafo carga solo con lo minimo de ley: quien
-- es el responsable con su domicilio completo, para que se usan los datos y
-- donde esta el integral.
--
-- La direccion del integral va RELATIVA (/aviso-de-privacidad/), en los dos
-- textos: el sitio se sirve en el dominio institucional y en el de
-- respaldo, y una URL absoluta se romperia en uno de los dos.
--
-- SIN MARCADOR DE VERSION DENTRO DEL TEXTO. La v3 llevaba una linea
-- "Version 3 del aviso" al principio; esta no lleva ninguna, y es a
-- proposito. El texto empieza con el encabezado del institucional y termina
-- con su "Fecha de actualizacion: 01 de septiembre 2026", que es del
-- documento oficial y no se toca. El numero de version lo pone la pagina al
-- pie ("Version 4 del aviso, vigente al momento de esta consulta") leyendo
-- la columna version, que es la que nunca se puede desincronizar del texto.
--
-- TRATO DE USTED en todo el anexo, como en el resto del sitio. El cuerpo
-- institucional habla de "el titular" y "usted" segun el parrafo: se
-- respeta como esta, porque es texto oficial ajeno. Lo que si hace el anexo
-- es rescatar al lector despues de dieciseis mil caracteres de tercera
-- persona, con titulos en segunda ("LOS APELLIDOS DE SU FAMILIA", "LA FIRMA
-- QUE USTED TRAZA EN LA PANTALLA", "EL COBRO DEL TAG") y frases cortas en
-- los apartados que mas dudas generan.
--
--
-- DESPLIEGUE. No requiere publicar el sitio: la pagina /aviso-de-privacidad/
-- y la burbuja del formulario leen SIEMPRE la version vigente, sea cual
-- sea. No se crea ni se cambia la firma de ningun RPC, asi que aqui no hay
-- trampa PostgREST: ni drop function, ni grants, ni notify pgrst.
--
-- LOS COMENTARIOS DE ESTA CARPETA VAN SIN ACENTOS por tradicion, y asi
-- siguen. EL TEXTO DEL AVISO NO PUEDE DARSE ESE LUJO: es lo que lee una
-- familia y lo que queda sellado en la evidencia. Este archivo esta
-- guardado en UTF-8 y debe pegarse tal cual en el editor SQL; por eso el
-- bloque TERMINA con una verificacion de codificacion, y no se da por
-- aplicado sin verla.
--
-- QUE HACE, EN ORDEN (el orden importa):
--   1. Guardia: se asegura de no sobrescribir una v4 ajena YA FIRMADA.
--   2. Publica la v4 y mueve la vigencia.
--   3. Comprueba la invariante (exactamente una vigente, y es la v4) y
--      aborta el bloque completo si no se cumple.
--   4. Verifica la codificacion y el contenido del texto publicado.
--
-- Idempotente: se puede reejecutar completo sin dano.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. GUARDIA: que este bloque no pise una v4 que no sea la suya.
--
--    El bloque 59 puede haber publicado una v4 esta misma tarde: su camino
--    B (habia firmas contra la v3) dejaba la v3 intacta y publicaba el
--    texto corregido como v4. Si eso paso Y ademas alguien firmo contra
--    esa v4, sobrescribirla desde aqui invalidaria su evidencia, que es
--    precisamente el dano que este bloque evita publicando una version
--    nueva. En ese caso NO se toca: se para todo y este mismo texto se
--    publica como v5, cambiando el numero en el insert, en la comprobacion
--    del paso 3 y en la auditoria del pie.
--
--    Si la v4 existe pero NADIE la firmo, se sustituye sin ceremonia: no
--    hay evidencia que romper, y es el mismo criterio del camino A del
--    bloque 59.
--
--    Si la v4 ya es esta (reejecucion del bloque), no pasa nada y sigue.
-- ---------------------------------------------------------------------
do $guardia$
declare
    v_es_otro_texto boolean;
    v_firmas        int;
begin
    select position('TRATAMIENTO ESPECÍFICO PARA SATAG' in contenido) = 0
      into v_es_otro_texto
      from aviso_versiones
     where version = 4;

    if v_es_otro_texto is null then
        return;                       -- no existe la v4: el caso normal
    end if;

    if not v_es_otro_texto then
        raise notice 'La version 4 ya trae este anexo; el bloque la reescribe igual.';
        return;
    end if;

    select count(*)
      into v_firmas
      from aceptaciones a
      join aviso_versiones v on v.id = a.aviso_version_id
     where v.version = 4;

    if v_firmas > 0 then
        raise exception 'Ya existe una version 4 con OTRO texto y % aceptacion(es) firmadas contra el; sobrescribirla romperia esa evidencia. Publique este texto como version 5. No se aplico nada.', v_firmas;
    end if;

    raise notice 'Habia una version 4 con otro texto y sin firmas (probablemente el camino B del bloque 59); se sustituye.';
end
$guardia$;


-- ---------------------------------------------------------------------
-- 2. Publicacion de la version 4.
--
--    ORDEN: primero se apagan las demas, despues entra la v4 encendida. Al
--    reves, el insert chocaria contra el indice unico parcial
--    uq_aviso_una_vigente (bloque 08), que no admite dos vigentes a la
--    vez. El instante intermedio con CERO vigentes no lo ve nadie: el
--    editor SQL manda el archivo como una sola transaccion implicita, de
--    modo que las dos instrucciones se confirman juntas o no se confirma
--    ninguna. Por eso este bloque se ejecuta COMPLETO, de un tiron; nunca
--    con "Run selection" sobre una parte.
--
--    El texto corto es obligatorio en la version vigente: lo exige el
--    candado aviso_vigente_exige_simplificado (bloque 57). Va abajo, en
--    $simp_v4$.
--
--    El upsert no toca publicado_en: si alguna vez hay que reejecutar el
--    bloque para corregir una palabra del anexo, la fecha de publicacion
--    de la v4 debe seguir siendo la original.
-- ---------------------------------------------------------------------
update aviso_versiones
   set vigente = false
 where vigente
   and version <> 4;

insert into aviso_versiones (version, contenido, contenido_simplificado, url_publica, vigente)
values (
    4,
    $aviso_v4$Aviso de Privacidad Integral
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
Este apartado forma parte del aviso de privacidad anterior y lo complementa para un trámite determinado; no sustituye ninguno de sus apartados. Todo lo que este aviso señala sobre la identidad y el domicilio del responsable, el correo de contacto, el tiempo de conservación, las transferencias, el procedimiento para ejercer los derechos de acceso, rectificación, cancelación y oposición, la revocación del consentimiento, las medidas de seguridad, la comunicación de vulneraciones y la comunicación de modificaciones, se aplica en sus mismos términos a este trámite. Aquí se informa únicamente lo que el trámite del TAG vehicular agrega.
SATAG es el sistema con el que el Instituto Asunción de Querétaro, A.C. administra la solicitud, la asignación, la instalación, el cambio, la reposición, la baja y el control del TAG con el que un vehículo ingresa al estacionamiento del inmueble, y con el que se conserva la evidencia de que usted aceptó el reglamento del estacionamiento y este aviso de privacidad.

DATOS PERSONALES QUE SE RECABAN ADICIONALMENTE PARA EL TAG VEHICULAR
Solicitantes y usuarios del TAG vehicular. -
Identificativos:
Los apellidos con los que la familia se encuentra inscrita en el Instituto, que se solicitan a los padres, las madres y los tutores para confirmar que quien pide el TAG pertenece a la comunidad escolar; el tipo de usuario con el que se solicita el TAG, es decir, alumno, padre, madre o tutor, personal docente, personal administrativo u otro rol autorizado, junto con la confirmación administrativa que el Instituto registra cuando comprueba ese tipo; el nombre de quien gestiona el trámite y su relación con el usuario del TAG cuando no son la misma persona; el nombre de quien firma la aceptación y la imagen de la firma manuscrita que traza en la pantalla; y los datos administrativos con los que el TAG queda asociado a usted, es decir, el folio del trámite, el número del dispositivo, el estacionamiento asignado, la procedencia del TAG según sea propiedad del Instituto o propiedad de usted, el estado del trámite, los cambios, las reposiciones, la baja y los movimientos que se registren.
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
Estos apellidos se solicitan a los padres, las madres y los tutores que gestionan el TAG de un alumno; el personal docente y administrativo acredita su pertenencia por su propia relación con el Instituto, de modo que a ellos no se les piden. No se utilizan para ninguna otra finalidad ni se comunican a nadie fuera del personal del Instituto expresamente autorizado.

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

CONSERVACIÓN DE LOS DATOS DE ESTE TRÁMITE
Para el TAG vehicular, la finalidad que justifica el tratamiento termina con la baja del dispositivo o con el cierre del trámite que corresponda; a partir de ese momento corre el plazo de cinco años que este aviso ya señala, y ese mismo plazo se observa cuando el usuario del TAG es personal docente o administrativo del Instituto. Durante ese periodo el expediente deja de usarse en la operación diaria y solo queda disponible para aclaraciones, responsabilidades pendientes o requerimientos de autoridad competente.
Cumplido el plazo, el expediente se suprime o se disocia de forma segura, incluida la imagen de la firma resguardada en el almacenamiento privado. La revisión de los expedientes que ya cumplieron el plazo la solicita la Administración y la ejecuta el área de Tecnologías de la Información.

LIMITACIÓN DEL USO Y REVOCACIÓN DEL CONSENTIMIENTO EN ESTE TRÁMITE
Además de los medios que este aviso ya señala, usted puede pedir, en el mismo correo aviso.privacidad@asuncionqro.edu.mx, que sus datos de SATAG se usen únicamente para lo indispensable de la operación del TAG y que no se comuniquen a nadie fuera del personal del Instituto expresamente autorizado. Tenga presente que las finalidades de este trámite no pueden limitarse sin renunciar al beneficio: sin los datos del vehículo y sin la aceptación firmada del reglamento, el Instituto no puede otorgar ni mantener el acceso vehicular.
Si usted revoca el consentimiento sobre los datos indispensables, el TAG se da de baja y termina el acceso vehicular del vehículo asociado. La evidencia de una aceptación ya firmada no se modifica ni se elimina mientras subsista la responsabilidad que documenta, aun cuando el TAG se dé de baja o usted revoque su consentimiento, ni se eliminan los registros que el Instituto deba conservar por una obligación legal o contable; esa evidencia queda bloqueada y acredita únicamente lo que se le mostró y lo que usted aceptó en ese momento.

VERSIÓN VIGENTE DE ESTE AVISO Y CONSTANCIA DE LO QUE USTED ACEPTÓ
La versión vigente de este aviso, con el presente apartado incluido, se publica siempre en la misma dirección, /aviso-de-privacidad/, con su número de versión a la vista, y es la misma que se le muestra en el formulario antes de firmar. Las modificaciones se comunican, además, por los medios que este aviso ya señala.
Las versiones anteriores se conservan sin alterarse, y cada expediente guarda el número de versión del aviso y del reglamento que se mostraron al firmar, junto con la huella digital del paquete firmado, de modo que en todo momento pueda acreditarse qué texto exacto aceptó cada persona y en qué fecha lo hizo.
Si el aviso cambia, la firma que usted ya dio sigue acreditando el texto que se le mostró entonces, no el nuevo.$aviso_v4$,
    $simp_v4$El Instituto Asunción de Querétaro, A.C., con domicilio en Cerrada de la Asunción No. 16, Colonia Loma Dorada, Querétaro, Querétaro, C.P. 76060, es el responsable del tratamiento de sus datos personales. Los datos que usted proporciona en este formulario se usan para tramitar, asignar, instalar, cambiar o dar de baja el TAG con el que su vehículo ingresa al estacionamiento escolar, registrar el cobro administrativo del dispositivo y conservar la evidencia de que usted aceptó el reglamento y este aviso. Puede consultar el aviso de privacidad integral del Instituto, que incluye el apartado específico de SATAG, en /aviso-de-privacidad/.

En este trámite se recaban el nombre del usuario del TAG y el de quien gestiona la solicitud, los apellidos con los que la familia está inscrita en el Instituto (que sirven para confirmar que quien lo solicita pertenece a la comunidad escolar), el tipo de usuario, los datos del vehículo y sus placas, los datos administrativos del TAG, el registro del cobro en efectivo, la firma que usted traza en la pantalla y la evidencia que acredita su aceptación, es decir, la versión del reglamento y del aviso que se le mostraron, la fecha y la hora, la huella digital del paquete firmado y los datos técnicos de la sesión. No se le solicitan datos sensibles y sus datos no se usan con fines publicitarios ni comerciales.

Sus datos se conservan durante cinco años contados a partir de que termina la finalidad que justificó recabarlos, se resguardan en los sistemas del Instituto y en los servicios de nube que operan por cuenta de este, y solo se comunican a terceros en los supuestos que el propio aviso integral enumera. Para acceder a ellos, rectificarlos, cancelarlos, oponerse a su tratamiento, limitar su uso o revocar su consentimiento, escriba a aviso.privacidad@asuncionqro.edu.mx o presente un escrito en la Dirección del Colegio. El texto completo, incluidos el procedimiento detallado de esos derechos y la videovigilancia del inmueble, está en /aviso-de-privacidad/.$simp_v4$,
    '/aviso-de-privacidad/',
    true
)
on conflict (version) do update
    set contenido              = excluded.contenido,
        contenido_simplificado = excluded.contenido_simplificado,
        url_publica            = excluded.url_publica,
        vigente                = true;


-- ---------------------------------------------------------------------
-- 3. La mitad que ningun CHECK puede vigilar, porque se mira entre filas:
--    que quede EXACTAMENTE UNA vigente, y que sea la v4. Si algo salio
--    mal, esta excepcion aborta la transaccion completa y la base queda
--    como estaba; mas vale eso que un sitio publicando el aviso
--    equivocado, o ninguno.
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
    if v_version <> 4 then
        raise exception 'La version vigente quedo en % y deberia ser la 4. No se aplico nada.', v_version;
    end if;
end
$verificar$;


-- ---------------------------------------------------------------------
-- 4. VERIFICACION DE LA CODIFICACION Y DEL CONTENIDO. Va al final para que
--    sea el resultado que el editor SQL deja en pantalla al terminar;
--    tambien se puede volver a correr sola cuando se quiera.
--
--    LO QUE HAY QUE MIRAR NO ES UNA CUENTA SUELTA, ES UNA IGUALDAD:
--
--        bytes_de_mas = bytes_esperados
--
--    "bytes_de_mas" (octet_length menos length) son los bytes que el texto
--    ocupa de mas sobre su numero de caracteres. En UTF-8, lo unico que
--    ocupa mas de un byte en este aviso son las letras acentuadas, que
--    valen dos bytes (uno de mas), y las TRES comillas tipograficas que el
--    institucional trae en el apartado de datos fiscales, que valen tres
--    bytes (dos de mas). De ahi sale "bytes_esperados": los acentos, mas
--    el doble de las comillas. Las dos columnas se calculan sobre el mismo
--    texto guardado, asi que la igualdad no se puede falsear a mano.
--
--    POR QUE ESA IGUALDAD Y NO UNA CUENTA DE CARACTERES. Porque a la
--    igualdad no la mueve el editor. Si al pegar el archivo los saltos de
--    linea se vuelven CRLF, cada \r que se cuela suma un caracter Y un
--    byte, y en la resta se cancelan; al conteo de acentos ni lo roza. La
--    cuenta de caracteres si se mueve, y por eso aqui no se predice: el
--    bloque 57 predijo 10188 caracteres, la base reporto 10232, y los 44
--    de diferencia eran exactamente un \r por linea, con la codificacion
--    perfecta. Un numero que asusta sin que nada este mal es la manera mas
--    rapida de que la siguiente verificacion ya no la lea nadie.
--
--    Las dos formas de romper el texto rompen la igualdad, cada una por su
--    lado. Si el aviso se pega PLANO (sin acentos), las dos cuentas caen a
--    cero: por eso ademas se exige que acentos_integral no sea cero. Si
--    llega MOJIBAKE, cada letra acentuada se parte en dos caracteres que
--    ocupan dos bytes cada uno, bytes_de_mas se dispara y deja de coincidir
--    con bytes_esperados (que ademas se desploma, porque las letras de la
--    lista ya no estan). Iguales y distintas de cero: texto bueno.
--
--    El texto corto no tiene comillas tipograficas, asi que ahi la prueba
--    es la igualdad directa: bytes_de_mas_simplificado = acentos_simplificado.
--
--    "mojibake_detectado" es un apoyo, no la prueba: "A tilde" y "A
--    circunfleja" son la firma tipica de un UTF-8 leido como Latin-1, pero
--    si el archivo entero se pegara mal, tambien se estropearian esas dos
--    letras DENTRO de la consulta y la comparacion dejaria de encontrarse a
--    si misma. Sirve cuando la verificacion se corre despues, en una sesion
--    limpia. La igualdad es la que no se puede enganar.
--
--    Las banderas confirman que el texto vigente es de verdad el
--    institucional completo (llega hasta su fecha de actualizacion y no
--    arrastra la basura del cuadro de texto del Word), que sigue trayendo
--    lo que el institucional ya prometia (responsable, cinco anos,
--    dieciseis dias, correo) y que el anexo entro entero, apartado por
--    apartado.
-- ---------------------------------------------------------------------
select version                                                                   as version_vigente,
       octet_length(contenido) - length(contenido)                               as bytes_de_mas,
       (length(contenido) - length(translate(contenido, 'áéíóúüñÁÉÍÓÚÜÑ¿¡', '')))
           + 2 * (length(contenido) - length(translate(contenido, '“”', '')))
                                                                                 as bytes_esperados,
       length(contenido) - length(translate(contenido, 'áéíóúüñÁÉÍÓÚÜÑ¿¡', ''))  as acentos_integral,
       length(contenido) - length(translate(contenido, '“”', ''))                as comillas_tipograficas,
       octet_length(contenido_simplificado) - length(contenido_simplificado)     as bytes_de_mas_simplificado,
       length(contenido_simplificado)
           - length(translate(contenido_simplificado, 'áéíóúüñÁÉÍÓÚÜÑ¿¡', ''))   as acentos_simplificado,
       (contenido like '%Ã%' or contenido like '%Â%'
        or contenido_simplificado like '%Ã%'
        or contenido_simplificado like '%Â%')                                    as mojibake_detectado,
       (contenido like '%Fecha de actualización: 01 de septiembre 2026%')        as institucional_completo_ok,
       (contenido not like '%205105%' and contenido not like '%00Aviso%')        as sin_basura_del_word,
       (contenido like '%Instituto Asunción de Querétaro, A.C.%')                as responsable_ok,
       (contenido like '%cinco años%')                                           as plazo_ok,
       (contenido like '%dieciséis días naturales%')                             as videovigilancia_ok,
       (contenido like '%aviso.privacidad@asuncionqro.edu.mx%'
        and contenido_simplificado like '%aviso.privacidad@asuncionqro.edu.mx%') as correo_ok,
       (contenido like '%/aviso-de-privacidad/%'
        and contenido_simplificado like '%/aviso-de-privacidad/%'
        and contenido not like '%http%'
        and contenido_simplificado not like '%http%')                            as ruta_relativa_ok,
       (contenido like '%TRATAMIENTO ESPECÍFICO PARA SATAG%')                    as anexo_ok,
       (contenido like '%Los datos del vehículo que usted asocia al TAG%')       as vehiculo_ok,
       (contenido like '%la procedencia del TAG%')                               as tag_ok,
       (contenido like '%apellidos con los que la familia%'
        and contenido_simplificado like '%apellidos con los que la familia%')    as apellidos_ok,
       (contenido like '%LA FIRMA QUE USTED TRAZA EN LA PANTALLA%')              as firma_ok,
       (contenido like '%ENCARGADOS TECNOLÓGICOS Y SERVICIOS EN LA NUBE%')       as nube_ok,
       (contenido like '%EL COBRO DEL TAG%')                                     as cobro_ok
  from aviso_versiones
 where vigente;


-- =====================================================================
-- Auditoria esperada:
--
-- - La consulta del paso 4 devuelve UNA fila, con la version 4. Lo que se
--   revisa NO es una cuenta de caracteres, sino esto:
--       bytes_de_mas = bytes_esperados        <- la prueba buena
--       acentos_integral distinto de cero
--       bytes_de_mas_simplificado = acentos_simplificado
--       acentos_simplificado distinto de cero
--       mojibake_detectado ... false
--       las catorce banderas de la derecha, de institucional_completo_ok
--       hasta cobro_ok, todas en true
--   Como REFERENCIA, no como prueba: acentos_integral 501,
--   comillas_tipograficas 3 (las del apartado de datos fiscales del
--   institucional), acentos_simplificado 19. Esos numeros si son estables,
--   porque no dependen de como el editor trate los saltos de linea. Si
--   bailaran por uno o dos, no pasa nada; lo que descalifica al texto es el
--   cero y la desigualdad.
--
-- - select version, vigente from aviso_versiones order by version;
--   devuelve la v1, la v2 y la v3 con vigente = false y la v4 con
--   vigente = true. Las tres anteriores siguen con su texto original: es lo
--   que firmaron los expedientes ya capturados y no se toca nunca.
--
-- - Comprobar que la v3 quedo intacta, que es la razon de ser de este
--   bloque:
--     select version, vigente, length(contenido) as caracteres
--       from aviso_versiones order by version;
--   La v4 debe ser con mucho la mas larga (el institucional entero mas el
--   anexo, alrededor del triple de la v3), y la v3 debe conservar su
--   longitud de esta manana. Si la v3 hubiera cambiado de tamano, se
--   reescribio un texto ya firmado: eso invalida la evidencia de esos
--   expedientes y hay que reportarlo, no taparlo.
--
-- - /aviso-de-privacidad/ muestra el aviso institucional completo, un
--   parrafo por linea, empezando por "Aviso de Privacidad Integral" y sin
--   rastro del "-8255-205105" del Word. Al final del institucional, justo
--   despues de "Fecha de actualizacion: 01 de septiembre 2026", arranca
--   "TRATAMIENTO ESPECIFICO PARA SATAG". Al pie, "Version 4 del aviso".
--   Es un texto largo: la pagina se desplaza mucho, y esta bien que asi
--   sea.
--
-- - En el formulario de registro, la burbuja del aviso simplificado muestra
--   el primer parrafo (responsable con domicilio, para que se usan los
--   datos y el enlace al integral) y despliega los otros dos con "Ver mas".
--   El enlace lleva a /aviso-de-privacidad/ dentro del mismo dominio en el
--   que se este sirviendo el sitio, sin salir a ningun dominio absoluto.
--
-- - Un alta nueva sella en aceptaciones el aviso_version_id de la v4; las
--   aceptaciones anteriores conservan el de la v2 o el de la v3 y su hash
--   sigue verificando contra el texto que se les mostro. No se resiembra ni
--   se recalcula nada: la evidencia acredita lo que se mostro en su
--   momento, que es exactamente lo que la ultima linea del anexo le promete
--   al lector.
--
-- - Reejecutar el bloque completo no cambia nada: publica el mismo texto en
--   la misma version y la guardia del paso 1 solo avisa por notice.
--
-- - Pendiente de Gerardo, fuera de la base:
--     * registrar el bloque 60 en el README de esta carpeta;
--     * el entregable "E6 - Aviso de Privacidad SATAG.md" sigue siendo el
--       borrador de la v2 (ya venia anotado en los bloques 57 y 59): ahora
--       lo que corresponde es que remita al aviso institucional y solo
--       documente el anexo;
--     * confirmar con Direccion que el aviso institucional publicado en
--       www.asuncionqro.edu.mx es esta misma version fechada el 01 de
--       septiembre de 2026. Si el sitio del Instituto publicara otra, la
--       que manda es la de Direccion y este bloque se vuelve a generar
--       desde el .docx nuevo.
-- =====================================================================
