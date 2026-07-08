-- =====================================================================
-- 11_seed_documentos_placeholder.sql
-- Semillas temporales para desarrollo.
-- Reemplazar antes de produccion por textos aprobados.
-- =====================================================================

insert into reglamento_versiones (version, contenido, vigente) values
    (1,
     '[PLACEHOLDER] Reglamento de acceso vehicular IAQ - 22 clausulas. ' ||
     'Reemplazar por el texto oficial antes de produccion.',
     true)
on conflict (version) do nothing;

insert into aviso_versiones (version, contenido, url_publica, vigente) values
    (1,
     '[PLACEHOLDER] Aviso de privacidad SATAG. Reemplazar por el texto aprobado ' ||
     'por Direccion/Legal antes de produccion. Correo: aviso.privacidad@asuncionqro.edu.mx.',
     '/aviso-de-privacidad',
     true)
on conflict (version) do nothing;

