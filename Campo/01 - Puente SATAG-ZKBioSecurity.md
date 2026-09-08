# El puente a ZKBioSecurity: importación masiva de TAGs

**Qué resuelve.** Antes, cada TAG instalado se capturaba en ZKBioSecurity a mano,
uno por uno (buscar la tarjeta, editar, escribir nombre, depto y placa). Este
puente convierte los registros —del sheet histórico o de SATAG— en el archivo
de importación que ZK acepta, y los sube **todos de un jalón** actualizando a
las personas existentes sin duplicarlas.

Validado el 8-sep-2026 con una prueba real de una fila (un TAG recién
instalado): `Correctos: 1. Fallidos: 0.`, mismo ID, sin duplicado.

## Las piezas (en `Campo/herramientas/`)

| Archivo | Papel |
|---|---|
| `generar-import-zk.cjs` | Fuente: **sheet histórico** (`Campo/datos/Registros.csv`). Para regularizar lo instalado con papel. |
| `export-zk-desde-satag.sql` | Se corre en el SQL Editor de Supabase; el resultado se descarga como `Campo/datos/satag-export.csv`. |
| `generar-import-zk-desde-satag.cjs` | Fuente: **SATAG** (el flujo definitivo). Mismo motor, lee `satag-export.csv`. |
| `convertir-zk-a-xls.ps1` | Convierte el CSV generado al `.xls` que ZK acepta, inyectándolo en la plantilla oficial. |

Ambos generadores necesitan además el export más reciente de ZK
(`Usuarios_AAAAMMDD….csv`) en `Campo/datos/` para cruzar tarjetas y conservar IDs.

## Lo que ZK exige (aprendido a base de prueba y error, 8-sep-2026)

1. **Solo acepta el `.xls` de su propia plantilla.** El importador NO lee los
   encabezados por su texto: lee *anotaciones* (comentarios de celda
   invisibles) que traen el nombre interno de cada campo (`pin`, `validCardNo`,
   `mobilePhone`…). Un Excel fabricado a mano, aunque se vea idéntico, es
   ignorado con el error «Los datos en la fila X, columna 1, no tienen
   anotaciones». La plantilla se descarga en **Personal → Usuarios → Importar ▾
   → descargar plantilla** y debe vivir en la raíz del proyecto o en
   `Campo/datos/` (el conversor la busca en ambos lados, la más reciente).
2. **«Fila de Inicio» es la fila de los ENCABEZADOS anotados, no la primera de
   datos.** En la plantilla los encabezados están en la fila 2 (la fila 1 es el
   título «Usuarios»), así que el valor correcto es el **default: 2**. Los
   datos se leen a partir de la fila siguiente.
3. **«Actualizar el ID de usuario existente en el sistema» = Sí.** Con eso, una
   fila cuyo ID ya existe **actualiza** a la persona en lugar de duplicarla.
   Por eso los generadores conservan el ID del export de ZK en la columna 1.
4. **«Placa Vehicular» (`carPlate`) valida el formato y rechaza placas
   mexicanas** («El formato de la placa … es incorrecto», la fila entera
   falla). Esa es la razón de fondo de la convención IAQ de guardar la placa en
   **Celular** (`mobilePhone`), que no valida nada. Los generadores dejan
   `carPlate` vacío y ponen la placa solo en Celular.

## Columnas de la plantilla (fila 2, con su campo interno)

| Col | Encabezado | Campo interno | Nota |
|---|---|---|---|
| 1 | ID | `pin` | clave primaria; conservarlo = actualizar |
| 2 | Nombre | `name` | MAYÚSCULAS, convención del padrón |
| 3 | Apellido | `lastName` | MAYÚSCULAS |
| 4 | ID de Departamento | `dept.code` | obligatorio |
| 5 | Nombre de Departamento | `dept.name` | obligatorio |
| 11 | Tarjeta | `validCardNo` | número de TAG |
| 12 | Placa Vehicular | `carPlate` | **dejar vacío** (valida formato) |
| 14 | Código de Auto Gestión | `selfPwd` | `123456`, convención IAQ |
| 15 | Celular | `mobilePhone` | **aquí va la placa**, convención IAQ |

Departamentos: 1 General · 2 Administración · 5 Alumnos · 6 Maestros ·
7 Padres de familia · 10 BAJAS. Desde SATAG, `tipo_usuario` se mapea
padres→7, maestro→6, alumno→5, admin→2.

## Procedimiento completo (fuente SATAG)

1. En el SQL Editor, correr `export-zk-desde-satag.sql` y descargar el
   resultado como `Campo\datos\satag-export.csv`.
2. `node .\Campo\herramientas\generar-import-zk-desde-satag.cjs`
   → produce `Campo\datos\zk-actualizacion-desde-satag.csv`.
3. `powershell -ExecutionPolicy Bypass -File .\Campo\herramientas\convertir-zk-a-xls.ps1 -Archivo zk-actualizacion-desde-satag.csv`
   → produce el `.xls` sobre la plantilla oficial.
4. En ZK: Personal → Usuarios → **Importar** → elegir el `.xls` →
   **Fila de Inicio = 2** → **Actualizar ID existente = Sí** → Siguiente.
5. Verificar en ZK una tarjeta del lote: una sola persona, mismo ID, placa en
   Celular.

## Salvaguardas de los generadores

- Solo llenan tarjetas de ZK **sin nombre** (las ya asignadas no se tocan).
- Nunca tocan **BAJAS** (depto 10).
- Reportan los TAGs de la fuente que no existen como tarjeta en ZK, en lugar de
  perderlos en silencio.
- Todo se escribe como texto (sin conversiones de Excel a placas o números).
- Con un lote nuevo grande, probar primero con **una sola fila** (recortar el
  CSV) antes de subir todo — así se validó el formato la primera vez.
