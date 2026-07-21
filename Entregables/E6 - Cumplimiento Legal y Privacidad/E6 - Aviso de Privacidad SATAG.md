# Aviso de Privacidad SATAG

> **Proyecto:** SATAG - Sistema de Adquisicion de TAG Vehicular.
> **Institucion:** Instituto Asuncion de Queretaro, A.C.
> **Fecha de borrador:** 06/07/2026.
> **Estado:** borrador para revision de Direccion/Legal.
> **Nota:** este texto es una base operativa derivada de la investigacion legal del proyecto. Debe validarse formalmente antes de publicarse.

## 1. Aviso de privacidad integral especifico SATAG

### Identidad y domicilio del responsable

El Instituto Asuncion de Queretaro, A.C. ("IAQ"), con domicilio en Cerrada de la Asuncion #16, Col. Loma Dorada, Queretaro, Qro., Mexico, C.P. 76060, es responsable del tratamiento de los datos personales recabados mediante SATAG, sistema usado para la adquisicion, administracion, control, cambio, baja e instalacion del TAG vehicular de acceso al estacionamiento escolar.

> **Correo institucional de privacidad:** `aviso.privacidad@asuncionqro.edu.mx`.
> **Pendiente de completar por IAQ:** persona/departamento responsable de datos personales. (Legal debe confirmar que este domicilio coincide con el del aviso general/acta constitutiva.)

### Datos personales que se recaban

Para operar SATAG, el IAQ puede recabar:

- Nombre del usuario del TAG.
- Nombre del padre, madre, tutor o gestionante, cuando aplique.
- Tipo de usuario: alumno, padre/madre/tutor, docente, administrativo u otro rol autorizado.
- Datos del vehiculo: placas, marca, modelo, color e indicador de vehiculo sin placas cuando aplique.
- Datos administrativos del TAG: solicitud, estacionamiento asignado, estado del tramite, No. de dispositivo TAG, cambios, reposiciones, baja y movimientos asociados.
- Datos de pago administrativo: registro del cobro en efectivo del TAG, monto, fecha, persona que registra el cobro y folio de recibo. El sistema genera un folio de recibo automatico por cada pago (formato `SATAG-AAAA-######`) como control interno; no se emite comprobante fiscal.
- Firma manuscrita digital: imagen, trazos de captura cuando se conserven, nombre del firmante, fecha y hora de aceptacion.
- Evidencia digital de aceptacion: version del reglamento, version del aviso de privacidad, hash SHA-256, sello de tiempo y bitacora del evento.
- Datos tecnicos razonables del uso del sistema, como fecha/hora, identificadores de sesion, IP o user-agent cuando sea necesario para seguridad, evidencia o auditoria.
- Solicitudes relacionadas con derechos ARCO, revocacion, cambio o baja.

Los datos anteriores no se consideran sensibles por si mismos. Sin embargo, el IAQ debe evitar capturar en observaciones informacion de salud, discapacidad, religion, opiniones politicas, datos familiares innecesarios u otros datos sensibles.

### Finalidades primarias

Los datos se usaran para:

- Registrar solicitudes de adquisicion o uso de TAG vehicular.
- Identificar al usuario, gestionante y vehiculo asociado al TAG.
- Administrar la asignacion de estacionamiento y control de acceso vehicular.
- Registrar la aceptacion del reglamento del estacionamiento.
- Conservar evidencia de la firma electronica simple reforzada.
- Registrar administrativamente el pago en efectivo del TAG.
- Gestionar instalacion, cambio, reposicion, baja o inactivacion del TAG.
- Atender solicitudes ARCO, revocacion, aclaraciones, rectificaciones y bajas.
- Mantener seguridad, auditoria, trazabilidad y control interno del sistema.
- Cumplir obligaciones legales, administrativas, contables o requerimientos de autoridad competente.

### Firma electronica simple reforzada

La aceptacion del reglamento se realiza mediante firma manuscrita digital capturada en pantalla. Esta firma no es e.firma del SAT ni firma electronica avanzada. Para reforzar su valor probatorio, SATAG conserva junto con la firma la version exacta del reglamento, la version del aviso de privacidad, un sello de tiempo, metadatos de aceptacion, bitacora y hash SHA-256 del paquete firmado.

El firmante declara que los datos proporcionados son correctos y que acepta el reglamento de estacionamiento aplicable al TAG solicitado.

### Menores de edad

Cuando el usuario del TAG sea alumno menor de edad, la aceptacion del reglamento y del aviso de privacidad debera realizarla el padre, madre o tutor que actue como gestionante. El alumno menor puede aparecer como usuario del beneficio vehicular, pero la autorizacion y aceptacion deben provenir de su representante.

### Encargados tecnologicos y nube

SATAG puede alojar datos en servicios de nube, incluyendo Supabase como proveedor tecnologico y la infraestructura cloud que este utilice. Dichos proveedores actuan como encargados tecnologicos para almacenamiento, base de datos, autenticacion, seguridad, respaldos y operacion tecnica del sistema.

El IAQ debera conservar la documentacion contractual o terminos aplicables del proveedor, incluyendo DPA o documento equivalente cuando corresponda, region del proyecto, subprocesadores y medidas de seguridad disponibles.

### Transferencias

El IAQ no transferira los datos personales de SATAG a terceros para finalidades distintas a las informadas, salvo los casos permitidos por la legislacion aplicable, requerimiento de autoridad competente, cumplimiento de obligaciones legales o cuando sea necesario para proteger derechos del IAQ o de la comunidad escolar.

La comunicacion de datos a proveedores tecnologicos que procesan informacion por cuenta del IAQ se considera remision a encargados y debe estar documentada en los terminos o contratos aplicables.

Si en el futuro se comparten datos con una empresa operadora del estacionamiento, aseguradora u otro tercero independiente, el aviso debera revisarse antes de iniciar esa transferencia.

### Derechos ARCO y revocacion

La persona titular, o su representante legal cuando corresponda, puede solicitar acceso, rectificacion, cancelacion u oposicion respecto de sus datos personales. Tambien puede revocar su consentimiento cuando proceda.

El IAQ debera designar una persona o departamento para atender estas solicitudes e informar:

- Nombre del area responsable.
- Correo electronico.
- Domicilio o medio de recepcion.
- Requisitos de identificacion.
- Plazos de respuesta y ejecucion.

> **Correo institucional para privacidad/ARCO:** `aviso.privacidad@asuncionqro.edu.mx`.
> **Pendiente de completar por IAQ:** persona o departamento responsable ARCO.

### Conservacion, bloqueo y supresion

Los datos se conservaran mientras el TAG este vigente y durante el plazo necesario para cumplir finalidades administrativas, legales, contables o de responsabilidad relacionadas con el uso del estacionamiento.

Cuando proceda la cancelacion o baja, el IAQ podra bloquear el registro para impedir tratamientos ordinarios y conservarlo temporalmente solo para responsabilidades pendientes. Al agotarse la finalidad y el plazo aprobado, los datos deberan suprimirse o disociarse de forma segura, incluyendo la eliminacion de firmas en Storage cuando corresponda.

> **Pendiente de aprobar:** plazo concreto de conservacion/bloqueo/supresion.

### Medidas de seguridad

El IAQ aplicara medidas administrativas, tecnicas y fisicas proporcionales al tratamiento, incluyendo control de accesos, RLS en base de datos, almacenamiento privado de firmas, URLs firmadas temporales, TLS, respaldos, bitacoras, MFA para administradores y acceso limitado al personal autorizado.

### Cambios al aviso

El IAQ podra modificar este aviso por cambios legales, institucionales, tecnicos u operativos. Las versiones vigentes y anteriores deberan conservarse para acreditar que aviso acepto cada usuario al momento de firmar.

## 2. Aviso de privacidad simplificado para formulario

Texto recomendado para mostrar antes de capturar datos:

> El Instituto Asuncion de Queretaro, A.C. es responsable del tratamiento de sus datos personales en SATAG. Usaremos su informacion para registrar y administrar la solicitud del TAG vehicular, asociar el vehiculo y placas al usuario, gestionar asignacion, pago, instalacion, cambio o baja del TAG, conservar evidencia de aceptacion del reglamento y atender solicitudes relacionadas con privacidad o control vehicular. Se recabaran nombre, tipo de usuario, datos del vehiculo, placas, datos del gestionante cuando aplique, firma manuscrita digital, version del reglamento/aviso aceptado, datos administrativos del TAG y registro del cobro en efectivo. Sus datos se resguardan en sistemas institucionales y proveedores tecnologicos de nube usados por el IAQ. Puede consultar el aviso integral y ejercer derechos ARCO o revocar su consentimiento mediante el canal institucional que el IAQ designe.

Casilla no premarcada:

> He leido el aviso de privacidad de SATAG y acepto el tratamiento de mis datos personales para las finalidades indicadas.

Enlace:

> Consultar aviso de privacidad integral SATAG.

## 3. Texto de aceptacion de reglamento, privacidad y firma

Texto recomendado antes de firmar:

> Declaro que la informacion proporcionada es correcta y que he leido y acepto el reglamento de acceso vehicular del Instituto Asuncion de Queretaro aplicable al TAG solicitado. Reconozco que mi firma manuscrita digital se usara como firma electronica simple para dejar evidencia de aceptacion del reglamento y del aviso de privacidad SATAG. Autorizo que se conserve junto con mi firma la version del reglamento, version del aviso, sello de tiempo, hash de integridad y bitacora de aceptacion.

Texto adicional cuando firma un gestionante:

> Declaro que actuo como padre, madre, tutor o gestionante autorizado del usuario del TAG y que cuento con facultad para realizar esta solicitud y aceptar el reglamento y el tratamiento de datos personales en su nombre cuando corresponda.

Texto obligatorio para menores:

> Si el usuario del TAG es alumno menor de edad, la solicitud y firma deben realizarse por padre, madre o tutor. El alumno menor no debe firmar como titular de consentimiento o aceptacion.

## 4. Campos pendientes antes de publicacion

| Campo | Estado |
|---|---|
| Domicilio legal exacto del IAQ | Capturado (Cerrada de la Asuncion #16, Col. Loma Dorada, Queretaro, Qro., C.P. 76060); Legal confirma |
| Correo ARCO | `aviso.privacidad@asuncionqro.edu.mx` |
| Persona/departamento responsable ARCO | Pendiente |
| URL final del aviso integral | Pendiente |
| Plazo de conservacion de expedientes SATAG | Pendiente |
| Region Supabase y DPA archivado | Pendiente |
| Aprobacion de Direccion/Legal | Pendiente |
