-- =====================================================================
-- GES: personal (docentes y administrativos) — para «Consulta Libre» de GES
--
-- Se corre en GES > Exportar Informacion > Consulta Libre, formato Microsoft Excel,
-- y se guarda como Campo/datos/AAAA-MM-DD/ges-personal.xls (fuera de git).
--
-- SOLO las columnas que hacen falta para saber quien es del personal, en que
-- nivel/area y si sigue activo. El 6-oct un `select * from profesores` saco tambien
-- sueldo, NSS, CURP, RFC, NIP, cuenta bancaria y fotografia: nada de eso se pide.
--
-- `statusactual`: A = activo, B = baja. `nivel`: M preescolar, P primaria,
-- S secundaria, V preparatoria, E (otro). `nombreprofesor` viene APELLIDOS NOMBRE.
-- =====================================================================
select
    profesores.claveprofesor,
    profesores.numempleado,
    profesores.nombreprofesor,
    profesores.genero,
    profesores.nivel,
    profesores.departamento,
    profesores.cargo,
    profesores.statusactual,
    profesores.fecha_ingreso,
    profesores.fecha_baja
from profesores
order by profesores.nombreprofesor

-- =====================================================================
-- EMPLEADOS (administracion, mantenimiento, intendencia) — no estan en `profesores`
--
-- Salen del listado de personal de GES (profesores y empleados juntos; los empleados
-- son las filas SIN «Clave»). Ese listado no trae estatus, asi que se exporta DOS
-- veces el mismo dia: completo y con «ocultar bajas». Quien desaparece en el segundo
-- esta de baja (6-oct: 251 empleados, 75 activos). El listado trae la cedula fiscal:
-- se guarda solo la version reducida `ges-empleados-min.xlsx` (Num. Empleado, Nombre,
-- Contrato, Puesto, Departamento, Nivel, Activo) y los dos originales se borran.
-- =====================================================================
