# El puente a ZKBioSecurity: importación masiva de TAGs

**Qué resuelve.** Antes, cada TAG instalado se capturaba en ZKBioSecurity a mano,
uno por uno (buscar la tarjeta, editar, escribir nombre, depto y placa). Este
puente convierte los registros —del sheet histórico o de SATAG— en el archivo
de importación que ZK acepta, y los sube **todos de un jalón** actualizando a
las personas existentes sin duplicarlas.

Validado el 8-sep-2026 con una prueba real de una fila (un TAG recién
instalado): `Correctos: 1. Fallidos: 0.`, mismo ID, sin duplicado.

## Desde el panel (SC-025, 8-sep-2026)

En **TI → TAGs de la escuela → Exportar a ZKBioSecurity** el archivo se genera
directo en el navegador (`lib/zk/plantillaZk.ts`), sin sheet ni línea de
comandos:

- **Descargar plantilla ZK (TAGs disponibles)**: pre-alta de las tarjetas en
  ZK como `DISPONIBLE / STOCK SATAG`, depto **3 STOCK SATAG** (hasta el 14-sep
  iban a Padres de familia), ID = No. de TAG.
- **Descargar padrón instalado para ZK**: los expedientes activos con TAG;
  actualiza la misma tarjeta con nombre, apellidos, depto real y placa (en
  Celular). El aviso de descarga cuenta los de familia y lista los TAGs de
  otro tipo (alumno, administrativo, maestro) para ajustarles niveles en ZK.
- Opcional: cargar el export de ZK (`Usuarios_….csv`) para conservar el ID que
  ZK ya tiene cuando las tarjetas se dieron de alta a mano (evita duplicados).

El archivo sale como **`.xlsx` construido sobre la plantilla oficial** que vive
en `public/zk/plantilla-importacion-personal.xls`: SheetJS conserva las
anotaciones en xlsx y las **pierde en xls** (probado el 8-sep). Si el
importador de ZK rechazara el .xlsx, el respaldo `.csv` (formato del export de
ZK) se convierte con `convertir-zk-a-xls.ps1`. La plantilla NO carga niveles de
acceso: no existe columna para ello.

## Niveles de acceso: lo que ZK hace y lo que no (probado el 14-sep-2026)

El importador de ZK **nunca asigna niveles**: ni al crear la persona ni al
cambiarla de departamento (se probó con el TAG 13078155 moviéndolo de General
a Padres de familia por importación: llegó sin niveles). Lo único que aplica
los niveles a **todos los miembros actuales** de un departamento es, en la
pantalla de acceso por departamento de ZK, **quitar y volver a poner** sus
niveles (guardar sin cambiar nada no basta). Editar la persona a mano también
los aplica, pero es uno por uno.

Con eso, el proceso vigente es:

1. **Stock.** Los DISPONIBLE entran al departamento 3 STOCK SATAG. Después de
   importarlos, se quitan y se vuelven a poner ESTACIONAMIENTO 1 y 2 de ese
   departamento: todo el stock queda activo, y solo el stock (ahí no hay nadie
   más). Consecuencia aceptada: un TAG de la escuela ya abre la pluma desde que
   está en el cajón; la custodia es de TI.
2. **Instalación.** Nada en ZK: el TAG de la escuela funciona desde que se pega.
   Un **TAG propio** de la familia no pasó por el stock y no existe en ZK hasta
   la exportación del padrón.
3. **Padrón, al final de cada día de instalación.** La importación mueve a cada
   persona a su departamento real y **conserva** los niveles que ya tenía. Los
   TAGs propios nacen aquí sin niveles: después de importar, quitar y volver a
   poner los niveles del departamento que corresponda (Padres de familia para
   padres y otros familiares) los activa. Los TAGs de alumno (solo E1) y de
   administrativo (solo E2) conservan el nivel sobrante del stock: se ajustan a
   mano, con la lista que da el aviso de descarga. Maestros: criterio pendiente
   de Miguel.
4. **Bajas.** SATAG no llega a ZK: mover a BAJAS (10) y quitar niveles.

## Las piezas por línea de comandos (en `Campo/herramientas/`)

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

Departamentos: 1 General · 2 Administración · 3 STOCK SATAG (creado el
14-sep-2026 bajo General, para los DISPONIBLE) · 5 Alumnos · 6 Maestros ·
7 Padres de familia · 10 BAJAS. Desde SATAG, `tipo_usuario` se mapea
padres→7, otro→7, maestro→6, alumno→5, admin→2; el stock→3.

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
