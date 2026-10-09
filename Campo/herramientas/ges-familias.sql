-- =====================================================================
-- GES: familias activas con papa y mama — para «Consulta Libre» de GES
--
-- HISTORICO DESDE EL 9-OCT-2026. Este machote trae 47 columnas (telefonos,
-- domicilios, CURP) y SATAG rechaza su archivo. La consulta vigente, reducida,
-- vive en lib/ges/consultas.ts y se copia desde el panel: Consulta › Datos ›
-- Archivos de GES.
--
-- Machote del jefe de Gerardo (6-oct-2026). Se corre en GES > Exportar
-- Informacion > Consulta Libre, formato Microsoft Excel, y el archivo se guarda
-- como Campo/datos/AAAA-MM-DD/ges-familias.xls (fuera de git: datos de menores).
--
-- Una fila por alumno activo del ciclo, con su `id_familia` y el nombre completo
-- del papa y de la mama (`familias_mst.padre`, `familias_mst.madre`, en el orden
-- APELLIDOS NOMBRE). Es la fuente que dice si una familia sigue en el colegio.
--
-- CAMBIAR `inicial` CADA CICLO: 2026 = ciclo 2026-2027. El original decia 2025 y
-- el export del 6-oct salio con 2026.
-- Los grupos excluidos (VTM, STM, PTM, PBA, CMTM, CMBA, SBA, PRU) no son grupos
-- escolares regulares (criterio del jefe de Gerardo).
-- =====================================================================
select 
    alumnos_grupos.inicial,
    alumnos_grupos.final,
    alumnos_grupos.periodo,
    alumnos.status,
    alumnos.paterno,
    alumnos.materno,
    alumnos.nombre,
	alumnos.matricula,
	alumnos.genero,
    alumnos_grupos.codigo_grupo,
	alumnos.telefono,
    alumnos.clave_ciudadana,
    alumnos.fecha_nacimiento,
	alumnos.fecha_ingreso,
    alumnos.lugar_nacimiento,
    alumnos.nacionalidad,
    alumnos.estado_civil,
    alumnos.domicilio,
    alumnos.entre_calles,
    alumnos.ciudad,
    alumnos.estado,
    alumnos.cp,
    alumnos.email,
    familias_mst.id_familia,
    familias_mst.padre,
    familias_mst.telefonocelular_padre,
    familias_mst.telefonocasa_padre,
    familias_mst.telefonotrabajo_padre,
    familias_mst.ocupacion_padre,
    familias_mst.domicilio_padre,
    familias_mst.ciudad_padre,
    familias_mst.cp_padre,
    familias_mst.lugartrabajo_padre,
    familias_mst.domiciliotrabajo_padre,
    familias_mst.puestotrabajo_padre,
    familias_mst.email_padre,
    familias_mst.madre,
    familias_mst.telefonocelular_madre,
    familias_mst.telefonocasa_madre,
    familias_mst.telefonotrabajo_madre,
    familias_mst.ocupacion_madre,
    familias_mst.domicilio_madre,
    familias_mst.ciudad_madre,
    familias_mst.cp_madre,
    familias_mst.lugartrabajo_madre,
    familias_mst.domiciliotrabajo_madre,
    familias_mst.puestotrabajo_madre,
    familias_mst.email_madre

from alumnos
   inner join alumnos_grupos on (alumnos.numeroalumno = alumnos_grupos.numeroalumno)
   inner join familias_mst on (alumnos.id_familia = familias_mst.id_familia)
where 
   (
      (alumnos_grupos.inicial = 2026)
   and 
      (alumnos_grupos.codigo_grupo <> 'VTM')
   and 
      (alumnos_grupos.codigo_grupo <> 'STM')
   and 
      (alumnos_grupos.codigo_grupo <> 'PTM')
   and 
      (alumnos_grupos.codigo_grupo <> 'PBA')  
   and 
      (alumnos_grupos.codigo_grupo <> 'CMTM')
   and 
      (alumnos_grupos.codigo_grupo <> 'CMBA')
   and 
      (alumnos_grupos.codigo_grupo <> 'SBA')
   and 
      (alumnos_grupos.codigo_grupo <> 'PRU')
   )
   AND  alumnos.status='A'
order by alumnos_grupos.codigo_grupo