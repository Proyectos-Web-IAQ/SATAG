-- =====================================================================
-- CroNoma · SATAG · Limpieza del tablero del 9-sep-2026 · PASO 2: CARGA
-- Correr COMPLETO en el SQL Editor de CroNoma (esquema pmo), después de
-- la lectura. Una sola transacción: si algo no cuadra, aborta y no toca nada.
-- Deja respaldo persistente en pmo_backup.limpieza_20260909_* (rollback aparte).
--
-- Qué hace, en orden:
--   1. Revisiones pendientes: aprueba las que reportan el MISMO porcentaje que
--      ya tiene la actividad (no cambian nada) y rechaza las que reportan
--      MENOS (aprobarlas regresaría el avance). Las que reportan MÁS se dejan.
--   2. Cambios abiertos: SC-021 aprobado; SC-015/019/020 rechazados (superados
--      por SC-021); SC-023 implementado; CC-14 aprobado como fase 2.
--   3. Dudas del 9-sep: se cierran con las respuestas de Gerardo; las que
--      quedan para el lote 2 se retiran del tablero.
--   4. Hito «Salida a producción con pruebas reales» al 14-sep.
--   5. Ocho tareas del lote 1 (SC-028 · L1-01 … L1-08) en el paquete CC.
--   6. Proyectos FIRMAS, NUBE y MINUTAS con pmo.fn_crear_proyecto (con fechas;
--      el conector MCP rechaza fechas por un patrón mal escrito).
-- Todo es idempotente por nombre/folio/código: lo que ya exista se salta.
-- =====================================================================
begin;

create schema if not exists pmo_backup;

do $carga$
declare
  -- ------------------------------------------------ objetivo (editable) --
  v_email     text := 'gerardo.sanchez@asuncionqro.edu.mx';   -- quien firma las decisiones (Miguel tambien tiene cuenta: por eso va fijo)
  v_org_slug  text := null;   -- slug de la organización si editas varias; null = única
  -- ------------------------------------------------------------------------
  v_proj uuid; v_user uuid; v_cc uuid; v_n int; v_plan jsonb; v_res jsonb;
begin
  -- 0. Resolver proyecto, usuario y paquete -------------------------------
  select id into v_proj from pmo.proyecto where codigo = 'SATAG';
  if v_proj is null then raise exception 'No existe el proyecto SATAG.'; end if;

  if v_email is null then
    select count(*), (array_agg(id))[1] into v_n, v_user from pmo.usuario where email ilike '%@asuncionqro.edu.mx';
    if v_n <> 1 then
      raise exception 'Usuario ambiguo o ausente (% con @asuncionqro.edu.mx). Fija v_email en el bloque objetivo.', v_n;
    end if;
  else
    select id into v_user from pmo.usuario where email ilike v_email;
    if v_user is null then raise exception 'No hay usuario con el correo %.', v_email; end if;
  end if;

  select id into v_cc from pmo.paquete_trabajo where proyecto_id = v_proj and codigo_wbs ilike 'CC';
  if v_cc is null then
    raise exception 'No existe el paquete CC en SATAG. Paquetes: %',
      (select string_agg(codigo_wbs || ' ' || nombre, ' | ' order by codigo_wbs) from pmo.paquete_trabajo where proyecto_id = v_proj);
  end if;

  if to_regclass('pmo_backup.limpieza_20260909_revision') is not null then
    raise exception 'Ya existe el respaldo limpieza_20260909_*: la carga ya corrió. Usa el rollback antes de repetir.';
  end if;

  -- Respaldos persistentes -------------------------------------------------
  create table pmo_backup.limpieza_20260909_revision  as select * from pmo.revision_tarea    where proyecto_id = v_proj and estado = 'PENDIENTE';
  create table pmo_backup.limpieza_20260909_actividad as select id, pct_avance, estado from pmo.actividad where proyecto_id = v_proj;
  create table pmo_backup.limpieza_20260909_cambio    as select * from pmo.solicitud_cambio  where proyecto_id = v_proj and estado in ('PENDIENTE','EN_REVISION');
  create table pmo_backup.limpieza_20260909_pregunta  as select * from pmo.pregunta_proyecto where proyecto_id = v_proj and estado = 'ABIERTA';

  -- 1. Revisiones -----------------------------------------------------------
  update pmo.revision_tarea r
     set estado = 'APROBADA', revisor_id = v_user,
         comentario_revision = 'Limpieza 9-sep-2026: el porcentaje reportado coincide con el avance que ya tenía la actividad; se aprueba sin efecto.'
    from pmo.actividad a
   where a.id = r.actividad_id and r.proyecto_id = v_proj and r.estado = 'PENDIENTE'
     and r.pct_reportado = a.pct_avance;

  update pmo.revision_tarea r
     set estado = 'RECHAZADA', revisor_id = v_user,
         comentario_revision = format('Limpieza 9-sep-2026: reporte superado. La actividad ya va en %s%% (lotes C y E cerrados el 25-ago); aprobarlo habría regresado el avance a %s%%.', a.pct_avance, r.pct_reportado)
    from pmo.actividad a
   where a.id = r.actividad_id and r.proyecto_id = v_proj and r.estado = 'PENDIENTE'
     and r.pct_reportado < a.pct_avance;

  -- 2. Cambios --------------------------------------------------------------
  update pmo.solicitud_cambio set estado = 'APROBADO',    decidido_por_usuario_id = v_user, fecha_decision = current_date
   where proyecto_id = v_proj and folio = 'SC-021' and estado in ('PENDIENTE','EN_REVISION');
  update pmo.solicitud_cambio set estado = 'RECHAZADO',   decidido_por_usuario_id = v_user, fecha_decision = current_date
   where proyecto_id = v_proj and folio in ('SC-015','SC-019','SC-020') and estado in ('PENDIENTE','EN_REVISION');
  update pmo.solicitud_cambio set estado = 'IMPLEMENTADO', decidido_por_usuario_id = v_user, fecha_decision = current_date
   where proyecto_id = v_proj and folio = 'SC-023' and estado in ('PENDIENTE','EN_REVISION');
  update pmo.solicitud_cambio set estado = 'APROBADO',    decidido_por_usuario_id = v_user, fecha_decision = current_date
   where proyecto_id = v_proj and folio = 'CC-14' and estado in ('PENDIENTE','EN_REVISION');
  -- Opcionales (descomentar si Gerardo confirma que ya están hechos):
  -- update pmo.solicitud_cambio set estado='IMPLEMENTADO', decidido_por_usuario_id=v_user, fecha_decision=current_date where proyecto_id=v_proj and folio in ('SC-007','SC-010') and estado in ('PENDIENTE','EN_REVISION');

  -- 3. Dudas del 9-sep ------------------------------------------------------
  update pmo.pregunta_proyecto set estado = 'RESPONDIDA', respondido_por = v_user,
         respuesta = 'Dominio institucional como SEVAD (GoDaddy + Cloudflare); Gerardo lo configura el jue 10 con las contraseñas que entrega Miguel. Cobertura del 21 y 22: por confirmar con Miguel.'
   where proyecto_id = v_proj and estado = 'ABIERTA' and texto like 'A Miguel: ¿el lunes 14 se opera en satag.vercel.app%';
  update pmo.pregunta_proyecto set estado = 'RESPONDIDA', respondido_por = v_user,
         respuesta = 'Se exportan los 14 a ZK desde SATAG, se importan en ZK y después se borran con limpiar_padron_piloto; la caja arranca en ceros sin corte.'
   where proyecto_id = v_proj and estado = 'ABIERTA' and texto like 'A Administración: los 14 expedientes y 14 cobros del piloto%';
  update pmo.pregunta_proyecto set estado = 'RESPONDIDA', respondido_por = v_user,
         respuesta = 'Miguel da el visto bueno al texto; el CP lo valida después sobre lo publicado. Base: el aviso institucional (Ana Barrón). Redacción exacta del responsable y estado del buzón: por confirmar con el CP.'
   where proyecto_id = v_proj and estado = 'ABIERTA' and texto like 'Al CP Vicente: redacción exacta del responsable%';
  update pmo.pregunta_proyecto set estado = 'CERRADA', respondido_por = v_user,
         respuesta = 'Ana Barrón ya fue avisada el 9-sep; se espera su documento. Se sigue en la tarea SC-028 · L1-04.'
   where proyecto_id = v_proj and estado = 'ABIERTA' and texto like 'A Ana Barrón (vía Gerardo)%';
  update pmo.pregunta_proyecto set estado = 'CERRADA', respondido_por = v_user,
         respuesta = 'Retirada del tablero el 9-sep: se resuelve con Gerardo antes del lote 2 (semana del 14).'
   where proyecto_id = v_proj and estado = 'ABIERTA'
     and (texto like 'Al CP Vicente: con el corte de caja MENSUAL%'
       or texto like 'Al CP Vicente y a Miguel: ¿«único que corta caja»%'
       or texto like 'Al CP Vicente: ¿qué significa «tiempo de instalación%'
       or texto like 'A Miguel: ¿las cuatro personas de TI%'
       or texto like 'A Administración y Sistemas: el tipo de usuario «otro»%'
       or texto like 'A Administración: si al cobrar la familia declarada%'
       or texto like 'A Administración: reposición de TAG%'
       or texto like 'Al CP Vicente: ¿«corregir los datos del vehículo%');

  -- 4. Hito -----------------------------------------------------------------
  insert into pmo.hito (proyecto_id, nombre, fecha_objetivo, ponderacion)
  select v_proj, 'Salida a producción con pruebas reales', date '2026-09-14', 0
   where not exists (select 1 from pmo.hito where proyecto_id = v_proj and nombre = 'Salida a producción con pruebas reales');

  -- 5. Tareas del lote 1 ------------------------------------------------------
  insert into pmo.actividad (proyecto_id, paquete_trabajo_id, nombre, descripcion,
                             dur_optimista_a, dur_mas_probable_m, dur_pesimista_b,
                             fecha_inicio_plan, fecha_fin_plan, prioridad, responsable_usuario_id)
  select v_proj, v_cc, t.nombre, t.descripcion, t.dias, t.dias, t.dias, t.ini, t.fin, 'ALTA', v_user
    from (values
      ('SC-028 · L1-01 Comentarios al reglamento para Arturo (tope vie 11-sep 12:00)',
       'Borrador contrastando el reglamento v2 (22 cláusulas) con lo decidido el 9-sep (documento en E6). Miguel revisa desde CroNoma (evidencia enlazada) el jue 10; envío a Arturo el vie 11 antes de las 12:00. Estimado asistido: 3 h.',
       0.5, date '2026-09-09', date '2026-09-11'),
      ('SC-028 · L1-02 Bloque 55 y cliente del alta: apellidos de la familia, un solo apellido, aviso «volver» y duplicado',
       'Un solo bloque SQL y un solo deploy. SQL 55: columna registros.apellidos_familia (PII, obligatoria para tipo padres), crear_registro con p_apellidos_familia (drop de la firma de 26 parámetros, create, grants, notify pgrst). Cliente: campo «Apellidos de la familia» en /registro para padres de familia; apellido materno obligatorio con casilla «tiene legalmente un solo apellido» (conductor y gestionante; la declaración va en metadata y queda sellada en el hash); el aviso abre en pestaña nueva y su enlace regresa a /registro; en el paso de firma el aviso integral se pliega (el hash sigue siendo del texto íntegro); panel: apellidos de la familia en la tarjeta y en el cobro con la instrucción de cotejar en GES, y en la búsqueda. Orden: aplicar 55 (ensayo begin/rollback, luego real) → npm run verificar → deploy → arnés sin enviar. Tipo «otro» NO va aquí (lote 2). Estimado asistido: 9 h.',
       1, date '2026-09-10', date '2026-09-10'),
      ('SC-028 · L1-03 Cuenta de Administración (Zairet) con MFA y roles del equipo',
       'Usuario en Supabase Auth desde el dashboard con contraseña temporal (no depender del correo de invitación: SMTP con tope). Rol admin por SQL (PASO 0 del README). Activación acompañada: contraseña, TOTP, clave de respaldo guardada, reingreso, cobro de prueba. Reajuste de roles del equipo y aviso de cerrar sesión. Estimado asistido: 2 h.',
       0.25, date '2026-09-10', date '2026-09-11'),
      ('SC-028 · L1-04 Aviso de privacidad v3 completo (bloque 57), base: aviso institucional',
       'Ana Barrón ya está avisada (9-sep); se espera su documento el jue 10. Redactar v3 (integral y simplificado) con esa base: acentos (cierra D-13), Administración responsable, aviso.privacidad@asuncionqro.edu.mx, plazo de conservación, opciones de limitación (art. 15 fr. IV), remisión a videovigilancia, sin cookies de rastreo. El primer párrafo del simplificado conserva responsable + finalidades (el paso 0 muestra solo ese párrafo plegado). Miguel da el visto bueno; el CP valida después. Bloque 57: check (not vigente or contenido_simplificado is not null) + vigente=false a las demás + un solo insert; .sql en UTF-8, verificar acentos con contenido ~ ''[áéíóúñ]''. Aplicar fuera del horario de capturas; verificar /aviso-de-privacidad, paso 0 y comprobante. Toda corrección posterior es versión nueva. E6 filas 1, 2 y 4 → Decidido. Estimado asistido: 7 h.',
       1, date '2026-09-10', date '2026-09-11'),
      ('SC-028 · L1-05 Catálogo de marcas y modelos 2024-2026 (bloque 56)',
       'Bloque de solo datos, idempotente, sin funciones ni deploy: marcas ausentes de la gama vendida en México 2024-2026 (Tesla, BYD, MG, Geely, Chirey, GWM/Haval, JAC, Omoda/Jaecoo, Jetour, Changan, BAIC, Lincoln, Acura, Lexus, Land Rover, Porsche, Cadillac, Mitsubishi, Infiniti) con modelos principales; on conflict do nothing; join de modelos por lower(nombre); verificación final marcas sin modelos = 0. El histórico de la hoja de cálculo (606 pares, revisión humana) va en el lote 2. Estimado asistido: 3 h.',
       0.5, date '2026-09-11', date '2026-09-11'),
      ('SC-028 · L1-06 Dominio institucional como SEVAD (GoDaddy + Cloudflare) y direcciones de Supabase',
       'Método SEVAD: jue 10 a las 08:00 Miguel entrega las claves y es lo PRIMERO del día. DNS del subdominio en Cloudflare, hosting y despliegue del export estático como en SEVAD (deploy.yml por FTPS). Después: Site URL y Redirect URLs en Supabase Auth, url_publica del aviso vigente, QR y enlaces de /presentacion/, buzón y comprobante. Probar alta pública, panel con MFA y buzón en el dominio nuevo. Vercel queda de respaldo hasta el lunes. Cierra 1.3 Infraestructura y 1.9 Deploy (SC-012). Estimado asistido: 2 h más propagación.',
       0.25, date '2026-09-10', date '2026-09-11'),
      ('SC-028 · L1-07 Exportar el piloto del 8-sep a ZK y limpiar el padrón',
       '(1) TI > TAGs de la escuela > exportar padrón instalado con «Todo el padrón activo»; (2) importar en ZKBioSecurity con la plantilla oficial (Fila de inicio 2, Actualizar ID existente = Sí); (3) niveles de acceso por departamento en ZK; (4) comprobar los 14 en ZK; (5) limpiar_padron_piloto.sql con el candado satag.confirmo_borrado (conserva inventario_tags); (6) Finanzas en ceros y folio siguiente esperado. Estimado asistido: 1.5 h.',
       0.25, date '2026-09-11', date '2026-09-11'),
      ('SC-028 · L1-08 Hoja de instrucciones del lunes, go/no-go y verificación final',
       'Una página para el personal: cotejar el vehículo con «Actualizar datos» antes de instalar; nadie corta caja hasta que exista el rol contador; Administración no abre «Ver la firma»; el empleado que también es padre recibe los accesos de su puesto; tíos y abuelos se registran como tutor con los apellidos de la familia; a quién llamar si algo falla. Go/no-go con Miguel el vie 11 a las 12:00 (si el deploy del jueves no está verde: escenario B, mié 16). Verificación final en el dominio nuevo: npm run verificar y recorrido alta → cobro → instalación → export ZK con un registro propio, luego borrarlo. Registrar horas reales de cada tarea del lote para la tabla estimado contra real. Estimado asistido: 3 h.',
       0.5, date '2026-09-11', date '2026-09-11')
    ) as t(nombre, descripcion, dias, ini, fin)
   where not exists (select 1 from pmo.actividad a where a.proyecto_id = v_proj and a.nombre = t.nombre);

  -- 6. Proyectos nuevos (simulando la sesión del usuario para fn_es_editor) ----
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  if not exists (select 1 from pmo.proyecto where codigo = 'FIRMAS') then
    v_plan := $j${
      "nombre": "Firma electrónica de documentos del handbook", "codigo": "FIRMAS", "fecha_inicio": "2026-09-10", "multiples_fases": true,
      "descripcion": "Firma electrónica de los documentos del handbook que padres y tutores aceptan al inscribir (unos cuatro), con valor probatorio para procesos legales: ambos tutores cuando aplique, envío por correo con enlace, cuentas para Control Escolar y datos desde GES. Encargo del CP Vicente Hernández, 9-sep-2026. El documento legal (fase 0) se entrega esta misma semana porque el contador lo pidió de inmediato.",
      "acta": {"sponsor": "CP Vicente Hernández, Gerencia Administrativa", "fecha_autorizacion": "2026-09-09",
        "justificacion": "Los documentos del handbook se firman en papel, se archivan físicamente y no hay trazabilidad. La Gerencia pidió firma digital con una condición: debe servir para procesos legales. SATAG ya probó la firma simple reforzada; este sistema debe subir el nivel de atribución (enlace al correo registrado en GES con código de un solo uso) y de conservación (constancia NOM-151).",
        "objetivos": ["Documento legal sobre el valor probatorio de la firma simple reforzada, validado por el abogado del Instituto", "Firma de ambos tutores con estado por firmante y recordatorios", "Portal de Control Escolar: quién firmó, quién falta, reenvío", "Datos de alumnos y tutores desde GES sin captura manual"],
        "alcance_alto_nivel": "Fase 0: documento legal y validación con el abogado. Fase 1: requerimientos, inventario de documentos, descubrimiento de GES, diseño. Después: construcción, piloto con un grupo de familias y salida. Fuera de alcance: e.firma del SAT para padres.",
        "criterios_exito": "Opinión escrita del abogado. Piloto con un grupo completo con 100% de firmantes identificados desde GES. Control Escolar opera solo. Evidencia por firmante reconstruible.",
        "riesgos_alto_nivel": "El abogado juzga insuficiente la firma simple. GES sin API. Tutores sin correo. Sin plataforma hasta que NUBE decida. Menores y trazos de firma como biométrico conductual.",
        "autoridad_pm": "Gerardo Sánchez define arquitectura y calendario; alcance y contratación: CP Vicente Hernández; Miguel valida prioridades."},
      "interesados": [
        {"nombre": "CP Vicente Hernández", "rol_cargo": "Gerencia Administrativa, sponsor", "poder": 5, "interes": 5, "actitud": "PARTIDARIO", "estrategia": "GESTIONAR_DE_CERCA"},
        {"nombre": "Miguel", "rol_cargo": "Jefe de Sistemas", "poder": 4, "interes": 4, "actitud": "PARTIDARIO", "estrategia": "GESTIONAR_DE_CERCA"},
        {"nombre": "Abogado del Instituto", "rol_cargo": "Valida el mecanismo de firma", "poder": 4, "interes": 3, "actitud": "NEUTRAL", "estrategia": "MANTENER_SATISFECHO"},
        {"nombre": "Control Escolar", "rol_cargo": "Usuarios del portal de seguimiento", "poder": 3, "interes": 5, "actitud": "NEUTRAL", "estrategia": "MANTENER_INFORMADO"},
        {"nombre": "Dirección", "rol_cargo": "Aprueba el uso institucional", "poder": 5, "interes": 3, "actitud": "NEUTRAL", "estrategia": "MANTENER_SATISFECHO"},
        {"nombre": "Padres y tutores", "rol_cargo": "Firmantes", "poder": 2, "interes": 4, "actitud": "NEUTRAL", "estrategia": "MONITOREAR"}],
      "paquetes": [
        {"wbs": "1", "nombre": "Investigación y validación legal", "padre": null, "criterio_aceptacion": "PDF entregado al contador y opinión del abogado recibida."},
        {"wbs": "2", "nombre": "Requerimientos y diseño", "padre": null, "criterio_aceptacion": "Requerimientos y diseño aprobados por el CP."},
        {"wbs": "3", "nombre": "Plataforma", "padre": null, "criterio_aceptacion": "Entorno operando (depende de NUBE)."},
        {"wbs": "4", "nombre": "Construcción", "padre": null, "criterio_aceptacion": "Flujo completo probado con datos de prueba. Estimación preliminar."},
        {"wbs": "5", "nombre": "Piloto y salida", "padre": null, "criterio_aceptacion": "Piloto concluido y Control Escolar operando solo. Estimación preliminar."}],
      "actividades": [
        {"nombre": "Documento: valor probatorio de la firma simple reforzada", "paquete": "1", "a": 1, "m": 2, "b": 3, "prioridad": "ALTA", "descripcion": "Índice: qué firma usa SATAG y qué guarda; marco legal con artículo y enlace oficial (CCF 1803 y 1834 bis, CFPC 210-A, CNPCF 2 fr. XXI, 308, 348-350, CCom 89, 89 bis, 90, 93, 97, LFPDPPP 2025 y Reglamento art. 19, NOM-151-SCFI-2016, tesis 1a./J. 16/2019); qué prueba y qué no cada elemento; el eslabón débil (atribución en formulario público) y cómo se cierra en el handbook; escalera de opciones y costos; preguntas para el abogado. Redacción asistida en segundo plano mientras avanza SATAG."},
        {"nombre": "Verificación de citas contra los textos oficiales y entrega en Word/PDF", "paquete": "1", "a": 0.5, "m": 1, "b": 1, "prioridad": "ALTA", "descripcion": "Cada cita cotejada contra diputados.gob.mx, DOF y SCJN. Entrega al contador el vie 11-sep en Word (Drive) y PDF."},
        {"nombre": "Opinión del abogado", "paquete": "1", "a": 5, "m": 10, "b": 15, "prioridad": "ALTA", "descripcion": "Espera de la revisión externa vía el contador; no es trabajo de Sistemas."},
        {"nombre": "Taller de requerimientos con Control Escolar y contador", "paquete": "2", "a": 1, "m": 1, "b": 1, "prioridad": "ALTA", "descripcion": "Propuesto para el 2-oct. ¿GES tiene API o exportación? ¿Responsable del handbook? ¿Familias por ciclo y ventana de firma? ¿Tutor que no firma?"},
        {"nombre": "Inventario de documentos del handbook y reglas de firmantes", "paquete": "2", "a": 2, "m": 3, "b": 5, "prioridad": "MEDIA"},
        {"nombre": "Descubrimiento de GES: API o exportación", "paquete": "2", "a": 2, "m": 3, "b": 5, "prioridad": "ALTA"},
        {"nombre": "Diseño: modelo de datos, doble firmante, evidencia y NOM-151", "paquete": "2", "a": 3, "m": 5, "b": 8, "prioridad": "ALTA", "descripcion": "Documento → firmantes requeridos → estado por firmante → recordatorios → evidencia por firmante. Enlace al correo de GES con código de un solo uso (art. 90 fr. II CCom). Constancia NOM-151 por documento o por lote."},
        {"nombre": "Proyecto en la plataforma elegida", "paquete": "3", "a": 1, "m": 2, "b": 3, "prioridad": "MEDIA", "descripcion": "Depende de NUBE; si urge, Supabase Pro como desbloqueo."},
        {"nombre": "Construcción del flujo de firma", "paquete": "4", "a": 10, "m": 15, "b": 25, "prioridad": "ALTA", "descripcion": "Estimación preliminar."},
        {"nombre": "Portal de Control Escolar y correos", "paquete": "4", "a": 5, "m": 8, "b": 12, "prioridad": "MEDIA", "descripcion": "Estimación preliminar."},
        {"nombre": "Integración con GES", "paquete": "4", "a": 3, "m": 5, "b": 10, "prioridad": "MEDIA", "descripcion": "Estimación preliminar."},
        {"nombre": "Piloto con un grupo de familias", "paquete": "5", "a": 5, "m": 10, "b": 15, "prioridad": "ALTA", "descripcion": "Estimación preliminar."},
        {"nombre": "Salida a producción", "paquete": "5", "a": 2, "m": 3, "b": 5, "prioridad": "ALTA", "descripcion": "Estimación preliminar."}],
      "dependencias": [
        {"de": "Documento: valor probatorio de la firma simple reforzada", "a": "Verificación de citas contra los textos oficiales y entrega en Word/PDF"},
        {"de": "Verificación de citas contra los textos oficiales y entrega en Word/PDF", "a": "Opinión del abogado"},
        {"de": "Opinión del abogado", "a": "Taller de requerimientos con Control Escolar y contador"},
        {"de": "Taller de requerimientos con Control Escolar y contador", "a": "Inventario de documentos del handbook y reglas de firmantes"},
        {"de": "Taller de requerimientos con Control Escolar y contador", "a": "Descubrimiento de GES: API o exportación"},
        {"de": "Inventario de documentos del handbook y reglas de firmantes", "a": "Diseño: modelo de datos, doble firmante, evidencia y NOM-151"},
        {"de": "Descubrimiento de GES: API o exportación", "a": "Diseño: modelo de datos, doble firmante, evidencia y NOM-151"},
        {"de": "Diseño: modelo de datos, doble firmante, evidencia y NOM-151", "a": "Proyecto en la plataforma elegida"},
        {"de": "Proyecto en la plataforma elegida", "a": "Construcción del flujo de firma"},
        {"de": "Construcción del flujo de firma", "a": "Portal de Control Escolar y correos"},
        {"de": "Construcción del flujo de firma", "a": "Integración con GES"},
        {"de": "Portal de Control Escolar y correos", "a": "Piloto con un grupo de familias"},
        {"de": "Integración con GES", "a": "Piloto con un grupo de familias"},
        {"de": "Piloto con un grupo de familias", "a": "Salida a producción"}],
      "hitos": [
        {"nombre": "Documento legal entregado al contador", "fecha_objetivo": "2026-09-11", "actividad": "Verificación de citas contra los textos oficiales y entrega en Word/PDF", "ponderacion": 15},
        {"nombre": "Opinión del abogado recibida", "actividad": "Opinión del abogado", "ponderacion": 15},
        {"nombre": "Requerimientos y diseño aprobados", "actividad": "Diseño: modelo de datos, doble firmante, evidencia y NOM-151", "ponderacion": 20},
        {"nombre": "Piloto concluido", "actividad": "Piloto con un grupo de familias", "ponderacion": 30},
        {"nombre": "Salida a producción", "actividad": "Salida a producción", "ponderacion": 20}],
      "riesgos": [
        {"descripcion": "El abogado juzga insuficiente la firma simple reforzada para procesos legales: habría que subir a proveedor certificado con verificación de identidad y costo por firma.", "categoria": "Legal", "tipo": "AMENAZA", "probabilidad": 3, "impacto": 4, "nivel": "ALTO", "estrategia": "MITIGAR", "plan_respuesta": "Diseñar con enlace al correo de GES y código de un solo uso más constancia NOM-151; presentar al abogado la escalera de opciones con costos.", "actividad": "Opinión del abogado"},
        {"descripcion": "GES no tiene API: los datos se cargan por exportación manual y se desactualizan.", "categoria": "Integración", "tipo": "AMENAZA", "probabilidad": 3, "impacto": 3, "nivel": "MEDIO", "estrategia": "MITIGAR", "plan_respuesta": "Descubrimiento temprano; carga por exportación con validación y fecha de corte visible.", "actividad": "Descubrimiento de GES: API o exportación"},
        {"descripcion": "Tutores sin correo en GES o familias con un solo correo: no se puede exigir doble firma.", "categoria": "Datos", "tipo": "AMENAZA", "probabilidad": 4, "impacto": 3, "nivel": "MEDIO", "estrategia": "MITIGAR", "plan_respuesta": "Captura y verificación previa de correo por tutor; regla escrita para familias con un solo tutor.", "actividad": "Inventario de documentos del handbook y reglas de firmantes"},
        {"descripcion": "Sin plataforma hasta que NUBE decida: la construcción no arranca.", "categoria": "Infraestructura", "tipo": "AMENAZA", "probabilidad": 3, "impacto": 3, "nivel": "MEDIO", "estrategia": "MITIGAR", "plan_respuesta": "Supabase Pro como desbloqueo inmediato.", "actividad": "Proyecto en la plataforma elegida"},
        {"descripcion": "Datos de menores y trazos de firma (biométrico conductual): obligaciones reforzadas de aviso, consentimiento del tutor y resguardo.", "categoria": "Privacidad", "tipo": "AMENAZA", "probabilidad": 4, "impacto": 4, "nivel": "ALTO", "estrategia": "MITIGAR", "plan_respuesta": "Aviso propio, consentimiento de quien ejerce la patria potestad, almacenamiento privado y acceso por rol desde el diseño.", "actividad": "Diseño: modelo de datos, doble firmante, evidencia y NOM-151"}]
    }$j$::jsonb;
    if v_org_slug is not null then v_plan := v_plan || jsonb_build_object('organizacion', v_org_slug); end if;
    v_res := pmo.fn_crear_proyecto(v_plan);
    raise notice 'FIRMAS: %', v_res;
  end if;

  if not exists (select 1 from pmo.proyecto where codigo = 'NUBE') then
    v_plan := $j${
      "nombre": "Plataforma en la nube y visita a Google", "codigo": "NUBE", "fecha_inicio": "2026-09-15",
      "descripcion": "Elegir y adoptar la plataforma en la nube para los sistemas del Instituto (SATAG, SIRVE, SEVAD, firmas del handbook y siguientes). Supabase Free no admite un tercer proyecto. El CP indicó que el precio no es la restricción: se decide por capacidades. Incluye preparación, asistencia y reporte de la visita a Google México (21 y 22 de septiembre), con las dudas del contador sobre seguridad y confidencialidad.",
      "acta": {"sponsor": "CP Vicente Hernández, Gerencia Administrativa", "fecha_autorizacion": "2026-09-09",
        "justificacion": "Los dos proyectos gratuitos de Supabase están ocupados y el sistema de firmas no cabe. Al pasar a pagar conviene decidir con criterio: residencia de datos en México, contrato de encargado, integración con Google Workspace, IA en la plataforma y capacidades para el desarrollador.",
        "objetivos": ["Comparativo por capacidades de Supabase Pro, Google Cloud, AWS, DigitalOcean e híbrido, con recomendación", "Resolver en la visita a Google las dudas de seguridad y confidencialidad del contador", "Decisión de plataforma con la Gerencia", "Plan de migración por sistema sin interrumpir SATAG"],
        "alcance_alto_nivel": "Preparación y reporte de la visita; comparativo y recomendación; decisión y contratación; migración de SATAG, SIRVE y SEVAD. Fuera de alcance: rediseño de los sistemas.",
        "criterios_exito": "Comparativo el 25-sep con recomendación argumentada. Reporte de la visita el 23-sep. Plataforma decidida y primer proyecto operando. SATAG migrado sin pérdida ni interrupción visible.",
        "riesgos_alto_nivel": "Dependencia del proveedor. Migración con padrón real. Residencia de datos y contrato de encargado. Gasto recurrente sin partida escrita.",
        "autoridad_pm": "Gerardo Sánchez elabora el comparativo y ejecuta la migración; decisión y contratación: CP Vicente Hernández; Miguel valida la operación."},
      "interesados": [
        {"nombre": "CP Vicente Hernández", "rol_cargo": "Gerencia Administrativa, sponsor y decisor", "poder": 5, "interes": 5, "actitud": "PARTIDARIO", "estrategia": "GESTIONAR_DE_CERCA"},
        {"nombre": "Miguel", "rol_cargo": "Jefe de Sistemas", "poder": 4, "interes": 4, "actitud": "PARTIDARIO", "estrategia": "GESTIONAR_DE_CERCA"},
        {"nombre": "Google México", "rol_cargo": "Proveedor; anfitrión de la visita", "organizacion_externa": "Google", "poder": 3, "interes": 3, "actitud": "PARTIDARIO", "estrategia": "MANTENER_INFORMADO"},
        {"nombre": "Dirección", "rol_cargo": "Aprueba gasto recurrente", "poder": 5, "interes": 2, "actitud": "NEUTRAL", "estrategia": "MANTENER_SATISFECHO"}],
      "paquetes": [
        {"wbs": "1", "nombre": "Visita a Google México (21-22 sep)", "padre": null, "criterio_aceptacion": "Reporte entregado al contador con respuestas a sus dudas."},
        {"wbs": "2", "nombre": "Comparativo de plataformas", "padre": null, "criterio_aceptacion": "PDF el 25-sep con recomendación y plan de migración."},
        {"wbs": "3", "nombre": "Decisión y contratación", "padre": null, "criterio_aceptacion": "Plataforma contratada y primer proyecto operando."},
        {"wbs": "4", "nombre": "Migración", "padre": null, "criterio_aceptacion": "SATAG, SIRVE y SEVAD operando en la plataforma nueva. Estimación preliminar."}],
      "actividades": [
        {"nombre": "Documento de preparación de la visita a Google", "paquete": "1", "a": 2, "m": 3, "b": 4, "prioridad": "ALTA", "descripcion": "Preguntas escritas por proyecto; enlaces a los términos que sí rigen la cuenta institucional (Workspace, CDPA, Aviso de Privacidad de Google Cloud); dudas del contador primero; prueba de Gemini en Meet. Listo el 18-sep."},
        {"nombre": "Visita a Google México", "paquete": "1", "a": 2, "m": 2, "b": 2, "prioridad": "ALTA", "descripcion": "21 y 22 de septiembre."},
        {"nombre": "Reporte de la visita para el contador", "paquete": "1", "a": 1, "m": 1, "b": 2, "prioridad": "ALTA", "descripcion": "Entrega el 23-sep."},
        {"nombre": "Criterios y matriz de comparación", "paquete": "2", "a": 1, "m": 1, "b": 2, "prioridad": "ALTA", "descripcion": "Residencia en México, contrato de encargado, integración con Workspace, SSO, Postgres con RLS, almacenamiento privado, funciones y tareas, correo transaccional, IA, herramientas, costo por sistema, esfuerzo de migración."},
        {"nombre": "Investigación por opción", "paquete": "2", "a": 2, "m": 3, "b": 5, "prioridad": "ALTA", "descripcion": "Supabase Pro; Google Cloud (Cloud SQL o AlloyDB, Cloud Run, Identity Platform, Vertex AI, región Querétaro); AWS (RDS, Lambda, Cognito, Bedrock, región Querétaro); DigitalOcean; híbrido Supabase Pro + Google Cloud."},
        {"nombre": "Comparativo y recomendación en PDF", "paquete": "2", "a": 1, "m": 2, "b": 3, "prioridad": "ALTA", "descripcion": "Entrega el 25-sep con lo confirmado en la visita."},
        {"nombre": "Decisión con la Gerencia y contratación", "paquete": "3", "a": 3, "m": 5, "b": 10, "prioridad": "ALTA", "descripcion": "Trámite externo."},
        {"nombre": "Configuración del primer proyecto y cuentas", "paquete": "3", "a": 1, "m": 2, "b": 3, "prioridad": "ALTA"},
        {"nombre": "Plan de migración por sistema", "paquete": "4", "a": 2, "m": 3, "b": 4, "prioridad": "MEDIA", "descripcion": "SATAG al final por estar en producción."},
        {"nombre": "Migración de SIRVE y SEVAD", "paquete": "4", "a": 2, "m": 4, "b": 6, "prioridad": "MEDIA", "descripcion": "Estimación preliminar."},
        {"nombre": "Migración de SATAG", "paquete": "4", "a": 3, "m": 5, "b": 8, "prioridad": "ALTA", "descripcion": "Respaldo verificado, ventana fuera de horario, rollback probado. Estimación preliminar."}],
      "dependencias": [
        {"de": "Documento de preparación de la visita a Google", "a": "Visita a Google México"},
        {"de": "Visita a Google México", "a": "Reporte de la visita para el contador"},
        {"de": "Criterios y matriz de comparación", "a": "Investigación por opción"},
        {"de": "Investigación por opción", "a": "Comparativo y recomendación en PDF"},
        {"de": "Reporte de la visita para el contador", "a": "Comparativo y recomendación en PDF"},
        {"de": "Comparativo y recomendación en PDF", "a": "Decisión con la Gerencia y contratación"},
        {"de": "Decisión con la Gerencia y contratación", "a": "Configuración del primer proyecto y cuentas"},
        {"de": "Configuración del primer proyecto y cuentas", "a": "Plan de migración por sistema"},
        {"de": "Plan de migración por sistema", "a": "Migración de SIRVE y SEVAD"},
        {"de": "Migración de SIRVE y SEVAD", "a": "Migración de SATAG"}],
      "hitos": [
        {"nombre": "Visita a Google realizada", "fecha_objetivo": "2026-09-22", "actividad": "Visita a Google México", "ponderacion": 15},
        {"nombre": "Reporte de la visita entregado", "fecha_objetivo": "2026-09-23", "actividad": "Reporte de la visita para el contador", "ponderacion": 10},
        {"nombre": "Comparativo entregado", "fecha_objetivo": "2026-09-25", "actividad": "Comparativo y recomendación en PDF", "ponderacion": 25},
        {"nombre": "Plataforma decidida y contratada", "actividad": "Decisión con la Gerencia y contratación", "ponderacion": 20},
        {"nombre": "SATAG migrado", "actividad": "Migración de SATAG", "ponderacion": 30}],
      "riesgos": [
        {"descripcion": "Dependencia del proveedor elegido: cambiar después cuesta una migración completa.", "categoria": "Estratégico", "tipo": "AMENAZA", "probabilidad": 3, "impacto": 3, "nivel": "MEDIO", "estrategia": "MITIGAR", "plan_respuesta": "Preferir Postgres estándar y contenedores; documentar la salida.", "actividad": "Comparativo y recomendación en PDF"},
        {"descripcion": "Migrar SATAG con padrón real: pérdida o corrupción de expedientes y evidencia de firma.", "categoria": "Operación", "tipo": "AMENAZA", "probabilidad": 2, "impacto": 5, "nivel": "ALTO", "estrategia": "MITIGAR", "plan_respuesta": "Respaldo verificado, ventana fuera de horario, rollback probado, SATAG al final.", "actividad": "Migración de SATAG"},
        {"descripcion": "Residencia de datos fuera de México y contrato de encargado sin firmar: observación ante la ley de datos.", "categoria": "Legal", "tipo": "AMENAZA", "probabilidad": 3, "impacto": 4, "nivel": "ALTO", "estrategia": "MITIGAR", "plan_respuesta": "Criterio obligatorio del comparativo; confirmar en la visita la región Querétaro y el CDPA.", "actividad": "Investigación por opción"},
        {"descripcion": "Gasto recurrente sin partida escrita: el CP dijo que el precio no importa, pero no hay autorización formal.", "categoria": "Costo", "tipo": "AMENAZA", "probabilidad": 2, "impacto": 3, "nivel": "MEDIO", "estrategia": "MITIGAR", "plan_respuesta": "Costo mensual estimado por sistema en el comparativo para que la decisión quede por escrito.", "actividad": "Decisión con la Gerencia y contratación"}]
    }$j$::jsonb;
    if v_org_slug is not null then v_plan := v_plan || jsonb_build_object('organizacion', v_org_slug); end if;
    v_res := pmo.fn_crear_proyecto(v_plan);
    raise notice 'NUBE: %', v_res;
  end if;

  if not exists (select 1 from pmo.proyecto where codigo = 'MINUTAS') then
    v_plan := $j${
      "nombre": "Minutas por IA para reuniones presenciales", "codigo": "MINUTAS", "fecha_inicio": "2026-09-16",
      "descripcion": "La Directora Anaís quiere minutas generadas por IA de las reuniones presenciales. Miguel pidió investigar software y hardware; el precio no es restricción si es útil y robusto. La licencia de Google Workspace incluye Gemini: la base (Gemini en Meet) ya está pagada; se evalúan niveles más robustos con argumento. Referencia de Miguel: kit Lenovo ThinkSmart Core Gen 2 (certificado para Teams; el equivalente para Meet es la línea Series One y los kits certificados para Meet de Logitech y Poly).",
      "acta": {"sponsor": "Directora Anaís, a través de Miguel (jefe de Sistemas)", "fecha_autorizacion": "2026-09-09",
        "justificacion": "Las minutas de Dirección se levantan a mano o no se levantan. El audio de esas reuniones es información sensible: la solución debe quedar bajo el contrato de Google Workspace que ya existe, o justificar por escrito cualquier tercero.",
        "objetivos": ["Probar el nivel base ya pagado: Gemini en Meet con micrófono de sala", "Evaluar sala equipada con kit certificado para Meet, NotebookLM como memoria de minutas, script de vaciado a la plantilla oficial y tubería a la medida en Google Cloud", "Recomendación escrita con costos y argumento de privacidad", "Piloto con Dirección"],
        "alcance_alto_nivel": "Investigación, prueba real, recomendación, compra de hardware si aplica, piloto y plantilla oficial. Fuera de alcance: grabación de clases o reuniones con padres.",
        "criterios_exito": "Minuta de una reunión real en español con calidad aceptable para Dirección. Datos dentro del tenant. Recomendación aceptada.",
        "riesgos_alto_nivel": "Privacidad del audio de Dirección. Acústica de la sala. Expectativa de algo vistoso frente a utilidad real.",
        "autoridad_pm": "Gerardo Sánchez investiga, prueba y recomienda; Miguel decide con Dirección; la compra la autoriza la Gerencia Administrativa."},
      "interesados": [
        {"nombre": "Directora Anaís", "rol_cargo": "Dirección, solicitante", "poder": 5, "interes": 5, "actitud": "PARTIDARIO", "estrategia": "GESTIONAR_DE_CERCA"},
        {"nombre": "Miguel", "rol_cargo": "Jefe de Sistemas", "poder": 4, "interes": 4, "actitud": "PARTIDARIO", "estrategia": "GESTIONAR_DE_CERCA"},
        {"nombre": "CP Vicente Hernández", "rol_cargo": "Gerencia Administrativa, autoriza compras", "poder": 4, "interes": 3, "actitud": "PARTIDARIO", "estrategia": "MANTENER_SATISFECHO"}],
      "paquetes": [
        {"wbs": "1", "nombre": "Investigación y prueba", "padre": null, "criterio_aceptacion": "Prueba documentada con una reunión real y matriz de opciones."},
        {"wbs": "2", "nombre": "Recomendación", "padre": null, "criterio_aceptacion": "Recomendación entregada el 25-sep y aceptada por Miguel."},
        {"wbs": "3", "nombre": "Piloto con Dirección", "padre": null, "criterio_aceptacion": "Tres reuniones con minuta generada y revisada. Estimación preliminar."}],
      "actividades": [
        {"nombre": "Prueba de Gemini en Meet en sala con Miguel", "paquete": "1", "a": 0.5, "m": 0.5, "b": 1, "prioridad": "ALTA", "descripcion": "Reunión presencial real, Meet en una laptop, «Tomar notas» de Gemini. Verificar español, calidad con micrófono de laptop y de sala, dónde quedan las notas y por cuánto tiempo. 16-sep."},
        {"nombre": "Investigación de niveles y alternativas", "paquete": "1", "a": 2, "m": 3, "b": 4, "prioridad": "ALTA", "descripcion": "Nivel 2: kit certificado para Meet (Series One, Logitech Rally Bar, Poly Studio), NotebookLM, Apps Script a la plantilla oficial. Nivel 3: tubería en Google Cloud con separación de hablantes y acuerdos a Tasks y Calendar. Terceros: Otter, Fireflies, Plaud, con su implicación de privacidad. Referencia de Miguel: Lenovo ThinkSmart Core Gen 2 (Teams)."},
        {"nombre": "Preguntas sobre minutas en la visita a Google", "paquete": "1", "a": 0.5, "m": 0.5, "b": 0.5, "prioridad": "MEDIA", "descripcion": "Español, diarización, retención, desactivación por reunión, NotebookLM en el tenant. 21-22 sep."},
        {"nombre": "Recomendación escrita con costos", "paquete": "2", "a": 1, "m": 2, "b": 3, "prioridad": "ALTA", "descripcion": "Tres niveles con argumento; qué no se recomienda y por qué. Entrega el 25-sep."},
        {"nombre": "Compra de micrófono de sala o kit", "paquete": "3", "a": 5, "m": 10, "b": 20, "prioridad": "MEDIA", "descripcion": "Trámite externo; depende del nivel elegido."},
        {"nombre": "Plantilla oficial de minuta y script de vaciado", "paquete": "3", "a": 2, "m": 3, "b": 5, "prioridad": "MEDIA", "descripcion": "Estimación preliminar."},
        {"nombre": "Piloto en tres reuniones de Dirección", "paquete": "3", "a": 5, "m": 10, "b": 15, "prioridad": "ALTA", "descripcion": "Con aviso a los asistentes y regla de retención. Estimación preliminar."}],
      "dependencias": [
        {"de": "Prueba de Gemini en Meet en sala con Miguel", "a": "Investigación de niveles y alternativas"},
        {"de": "Investigación de niveles y alternativas", "a": "Preguntas sobre minutas en la visita a Google"},
        {"de": "Preguntas sobre minutas en la visita a Google", "a": "Recomendación escrita con costos"},
        {"de": "Recomendación escrita con costos", "a": "Compra de micrófono de sala o kit"},
        {"de": "Recomendación escrita con costos", "a": "Plantilla oficial de minuta y script de vaciado"},
        {"de": "Compra de micrófono de sala o kit", "a": "Piloto en tres reuniones de Dirección"},
        {"de": "Plantilla oficial de minuta y script de vaciado", "a": "Piloto en tres reuniones de Dirección"}],
      "hitos": [
        {"nombre": "Prueba real realizada", "fecha_objetivo": "2026-09-16", "actividad": "Prueba de Gemini en Meet en sala con Miguel", "ponderacion": 20},
        {"nombre": "Recomendación entregada", "fecha_objetivo": "2026-09-25", "actividad": "Recomendación escrita con costos", "ponderacion": 30},
        {"nombre": "Piloto concluido", "actividad": "Piloto en tres reuniones de Dirección", "ponderacion": 50}],
      "riesgos": [
        {"descripcion": "El audio de reuniones de Dirección sale del tenant (terceros): información sensible bajo contrato ajeno y sin residencia conocida.", "categoria": "Privacidad", "tipo": "AMENAZA", "probabilidad": 3, "impacto": 5, "nivel": "ALTO", "estrategia": "EVITAR", "plan_respuesta": "Preferir Gemini en Meet y NotebookLM; cualquier tercero requiere justificación escrita y contrato de encargado.", "actividad": "Recomendación escrita con costos"},
        {"descripcion": "Acústica de la sala y micrófono de laptop: transcripción pobre.", "categoria": "Técnico", "tipo": "AMENAZA", "probabilidad": 4, "impacto": 3, "nivel": "MEDIO", "estrategia": "MITIGAR", "plan_respuesta": "Probar con micrófono de sala antes de recomendar.", "actividad": "Prueba de Gemini en Meet en sala con Miguel"},
        {"descripcion": "Se compra hardware vistoso antes de probar la utilidad: gasto sin adopción.", "categoria": "Gestión", "tipo": "AMENAZA", "probabilidad": 3, "impacto": 3, "nivel": "MEDIO", "estrategia": "MITIGAR", "plan_respuesta": "Prueba del nivel base primero; la compra depende de la recomendación.", "actividad": "Compra de micrófono de sala o kit"},
        {"descripcion": "Asistentes no informados de la grabación: objeción legal o de confianza.", "categoria": "Legal", "tipo": "AMENAZA", "probabilidad": 3, "impacto": 3, "nivel": "MEDIO", "estrategia": "MITIGAR", "plan_respuesta": "Aviso al inicio de cada reunión y regla de retención.", "actividad": "Piloto en tres reuniones de Dirección"}]
    }$j$::jsonb;
    if v_org_slug is not null then v_plan := v_plan || jsonb_build_object('organizacion', v_org_slug); end if;
    v_res := pmo.fn_crear_proyecto(v_plan);
    raise notice 'MINUTAS: %', v_res;
  end if;
end
$carga$;

-- Resumen antes → después (el SQL Editor muestra solo el último resultado)
select 'revisiones PENDIENTES que quedan' as que, count(*)::text as valor
  from pmo.revision_tarea where proyecto_id = (select id from pmo.proyecto where codigo='SATAG') and estado = 'PENDIENTE'
union all select 'revisiones aprobadas hoy', count(*)::text from pmo.revision_tarea where proyecto_id = (select id from pmo.proyecto where codigo='SATAG') and estado='APROBADA' and fecha_decision = current_date
union all select 'revisiones rechazadas hoy', count(*)::text from pmo.revision_tarea where proyecto_id = (select id from pmo.proyecto where codigo='SATAG') and estado='RECHAZADA' and fecha_decision = current_date
union all select 'cambios abiertos que quedan', count(*)::text from pmo.solicitud_cambio where proyecto_id = (select id from pmo.proyecto where codigo='SATAG') and estado in ('PENDIENTE','EN_REVISION')
union all select 'dudas abiertas que quedan', count(*)::text from pmo.pregunta_proyecto where proyecto_id = (select id from pmo.proyecto where codigo='SATAG') and estado = 'ABIERTA'
union all select 'tareas L1 creadas', count(*)::text from pmo.actividad where proyecto_id = (select id from pmo.proyecto where codigo='SATAG') and nombre like 'SC-028 · L1-%'
union all select 'hito salida 14-sep', count(*)::text from pmo.hito where proyecto_id = (select id from pmo.proyecto where codigo='SATAG') and nombre = 'Salida a producción con pruebas reales'
union all select 'proyectos nuevos', string_agg(codigo, ', ') from pmo.proyecto where codigo in ('FIRMAS','NUBE','MINUTAS');

commit;
