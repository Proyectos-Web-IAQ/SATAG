-- =====================================================================
-- 22_publicar_aviso_v2.sql
-- Publica el Aviso de Privacidad integral SATAG como version 2 (vigente).
-- Fuente: Entregables/E6 - Aviso de Privacidad SATAG.md (borrador operativo).
-- El placeholder v1 queda como historico (no vigente).
--
-- Idempotente: desactiva cualquier otra vigente y hace upsert de la v2.
-- Nota: sigue pendiente la aprobacion formal de Direccion/Legal (tablero E6).
-- =====================================================================

-- Solo una version puede estar vigente (uq_aviso_una_vigente). Desactivamos las demas.
update aviso_versiones set vigente = false where version <> 2;

insert into aviso_versiones (version, contenido, url_publica, vigente)
values (
    2,
    $aviso$AVISO DE PRIVACIDAD INTEGRAL - SATAG
Sistema de Adquisicion de TAG Vehicular
Instituto Asuncion de Queretaro, A.C. (IAQ)

IDENTIDAD Y DOMICILIO DEL RESPONSABLE
El Instituto Asuncion de Queretaro, A.C. ("IAQ"), con domicilio en Cerrada de la Asuncion #16, Col. Loma Dorada, Queretaro, Qro., Mexico, C.P. 76060, es responsable del tratamiento de los datos personales recabados mediante SATAG, sistema usado para la adquisicion, administracion, control, cambio, baja e instalacion del TAG vehicular de acceso al estacionamiento escolar. Correo institucional de privacidad: aviso.privacidad@asuncionqro.edu.mx.

DATOS PERSONALES QUE SE RECABAN
Para operar SATAG, el IAQ puede recabar: nombre del usuario del TAG; nombre del padre, madre, tutor o gestionante cuando aplique; tipo de usuario (alumno, padre/madre/tutor, docente, administrativo u otro rol autorizado); datos del vehiculo (placas, marca, modelo, color e indicador de vehiculo sin placas cuando aplique); datos administrativos del TAG (solicitud, estacionamiento asignado, estado del tramite, numero de dispositivo TAG, cambios, reposiciones, baja y movimientos asociados); datos de pago administrativo (registro del cobro en efectivo del TAG, monto, fecha y persona que registra el cobro); firma manuscrita digital (imagen, trazos de captura cuando se conserven, nombre del firmante, fecha y hora de aceptacion); evidencia digital de aceptacion (version del reglamento, version del aviso de privacidad, hash SHA-256, sello de tiempo y bitacora del evento); datos tecnicos razonables del uso del sistema (fecha/hora, identificadores de sesion, IP o user-agent cuando sea necesario para seguridad, evidencia o auditoria); y solicitudes relacionadas con derechos ARCO, revocacion, cambio o baja. Estos datos no se consideran sensibles por si mismos; el IAQ evitara capturar en observaciones informacion de salud, discapacidad, religion, opiniones politicas u otros datos sensibles.

FINALIDADES PRIMARIAS
Los datos se usaran para: registrar solicitudes de adquisicion o uso de TAG vehicular; identificar al usuario, gestionante y vehiculo asociado al TAG; administrar la asignacion de estacionamiento y control de acceso vehicular; registrar la aceptacion del reglamento del estacionamiento; conservar evidencia de la firma electronica simple reforzada; registrar administrativamente el pago en efectivo del TAG; gestionar instalacion, cambio, reposicion, baja o inactivacion del TAG; atender solicitudes ARCO, revocacion, aclaraciones, rectificaciones y bajas; mantener seguridad, auditoria, trazabilidad y control interno del sistema; y cumplir obligaciones legales, administrativas, contables o requerimientos de autoridad competente.

FIRMA ELECTRONICA SIMPLE REFORZADA
La aceptacion del reglamento se realiza mediante firma manuscrita digital capturada en pantalla. Esta firma no es e.firma del SAT ni firma electronica avanzada. Para reforzar su valor probatorio, SATAG conserva junto con la firma la version exacta del reglamento, la version del aviso de privacidad, un sello de tiempo, metadatos de aceptacion, bitacora y hash SHA-256 del paquete firmado. El firmante declara que los datos proporcionados son correctos y que acepta el reglamento de estacionamiento aplicable al TAG solicitado.

MENORES DE EDAD
Cuando el usuario del TAG sea alumno menor de edad, la aceptacion del reglamento y del aviso de privacidad debera realizarla el padre, madre o tutor que actue como gestionante. El alumno menor puede aparecer como usuario del beneficio vehicular, pero la autorizacion y aceptacion deben provenir de su representante.

ENCARGADOS TECNOLOGICOS Y NUBE
SATAG puede alojar datos en servicios de nube, incluyendo Supabase como proveedor tecnologico y la infraestructura cloud que este utilice. Dichos proveedores actuan como encargados tecnologicos para almacenamiento, base de datos, autenticacion, seguridad, respaldos y operacion tecnica del sistema. El IAQ conservara la documentacion contractual o terminos aplicables del proveedor, incluyendo DPA o documento equivalente cuando corresponda, region del proyecto, subprocesadores y medidas de seguridad disponibles.

TRANSFERENCIAS
El IAQ no transferira los datos personales de SATAG a terceros para finalidades distintas a las informadas, salvo los casos permitidos por la legislacion aplicable, requerimiento de autoridad competente, cumplimiento de obligaciones legales o cuando sea necesario para proteger derechos del IAQ o de la comunidad escolar. La comunicacion de datos a proveedores tecnologicos que procesan informacion por cuenta del IAQ se considera remision a encargados y esta documentada en los terminos o contratos aplicables.

DERECHOS ARCO Y REVOCACION
La persona titular, o su representante legal cuando corresponda, puede solicitar acceso, rectificacion, cancelacion u oposicion respecto de sus datos personales, y revocar su consentimiento cuando proceda. Las solicitudes se reciben en el correo institucional aviso.privacidad@asuncionqro.edu.mx, donde se informaran los requisitos de identificacion y los plazos de respuesta y ejecucion aplicables.

CONSERVACION, BLOQUEO Y SUPRESION
Los datos se conservaran mientras el TAG este vigente y durante el plazo necesario para cumplir finalidades administrativas, legales, contables o de responsabilidad relacionadas con el uso del estacionamiento. Cuando proceda la cancelacion o baja, el IAQ podra bloquear el registro para impedir tratamientos ordinarios y conservarlo temporalmente solo para responsabilidades pendientes. Al agotarse la finalidad y el plazo aprobado, los datos se suprimiran o disociaran de forma segura, incluyendo la eliminacion de firmas en almacenamiento cuando corresponda.

MEDIDAS DE SEGURIDAD
El IAQ aplica medidas administrativas, tecnicas y fisicas proporcionales al tratamiento, incluyendo control de accesos, seguridad a nivel de registro (RLS) en base de datos, almacenamiento privado de firmas, URLs firmadas temporales, TLS, respaldos, bitacoras, MFA para administradores y acceso limitado al personal autorizado.

CAMBIOS AL AVISO
El IAQ podra modificar este aviso por cambios legales, institucionales, tecnicos u operativos. Las versiones vigentes y anteriores se conservan para acreditar que aviso acepto cada usuario al momento de firmar.$aviso$,
    '/aviso-de-privacidad',
    true
)
on conflict (version) do update
    set contenido   = excluded.contenido,
        url_publica = excluded.url_publica,
        vigente     = true;

-- Verificacion:
-- select version, vigente, url_publica, length(contenido) from aviso_versiones order by version;
