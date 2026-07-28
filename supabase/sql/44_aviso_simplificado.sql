-- =====================================================================
-- 44_aviso_simplificado.sql
--
-- Publica el AVISO SIMPLIFICADO (CC-09), que hasta ahora existia redactado
-- en el entregable E6 pero no en el sistema. El art. 16 fr. II de la LFPDPPP
-- pide un aviso corto en el momento de recabar los datos, con el enlace al
-- integral; hoy el formulario solo mostraba el integral completo, en un paso
-- posterior a la captura.
--
-- Fuente del texto: Entregables/E6 - Cumplimiento Legal y Privacidad/
--                   E6 - Aviso de Privacidad SATAG.md, seccion 2.
--
-- Se guarda como columna de aviso_versiones (no como tabla nueva) para que el
-- simplificado quede VERSIONADO junto al integral: la aceptacion ya conserva
-- la version del aviso, asi que queda acreditado que texto corto vio cada
-- persona al capturar.
--
-- Sin acentos, igual que el bloque 22 (evita problemas de codificacion en el
-- editor SQL). Idempotente: se puede reejecutar.
--
-- NOTA PARA EL FRONT: la pagina tolera que esta columna no exista todavia
-- (consulta aparte, sin romper el alta). Al aplicar este bloque, el aviso
-- simplificado aparece solo en el primer paso del formulario.
-- =====================================================================

alter table aviso_versiones
    add column if not exists contenido_simplificado text;

comment on column aviso_versiones.contenido_simplificado is
    'Aviso simplificado (LFPDPPP art. 16 fr. II) que se muestra al momento de recabar los datos. El integral vive en contenido.';

update aviso_versiones
   set contenido_simplificado = $simp$El Instituto Asuncion de Queretaro, A.C. es responsable del tratamiento de sus datos personales en SATAG. Usaremos su informacion para registrar y administrar la solicitud del TAG vehicular, asociar el vehiculo y placas al usuario, gestionar asignacion, pago, instalacion, cambio o baja del TAG, conservar evidencia de aceptacion del reglamento y atender solicitudes relacionadas con privacidad o control vehicular.
Se recabaran nombre, tipo de usuario, datos del vehiculo, placas, datos del gestionante cuando aplique, firma manuscrita digital, version del reglamento y del aviso aceptados, datos administrativos del TAG y registro del cobro en efectivo.
Sus datos se resguardan en sistemas institucionales y proveedores tecnologicos de nube usados por el IAQ. Puede consultar el aviso integral y ejercer sus derechos ARCO o revocar su consentimiento en aviso.privacidad@asuncionqro.edu.mx.$simp$
 where vigente = true;

-- =====================================================================
-- Comprobacion (SQL Editor):
--   select version, vigente, url_publica,
--          left(contenido_simplificado, 80) as simplificado
--     from aviso_versiones
--    order by version;
--
-- Esperado: la version vigente (v2) trae el texto simplificado y la ruta
-- publica /aviso-de-privacidad, que ya existe como pagina del sitio.
-- =====================================================================
