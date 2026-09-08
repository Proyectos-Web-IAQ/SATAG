# Convierte un zk-actualizacion*.csv (UTF-16, tabuladores) al .xls que acepta
# el importador de ZKBioSecurity. ZK NO lee los encabezados por su texto: lee
# anotaciones invisibles (comentarios de celda) que solo trae su plantilla
# oficial. Por eso este script COPIA la plantilla descargada de ZK e inyecta
# nuestras filas de datos a partir de la fila 3, sin tocar las filas 1 y 2.
#
# Requiere: la "Plantilla de Importacion de Personal_*.xls" descargada de ZK
# (Personal > Usuarios > Importar > descargar plantilla) en la raiz del
# proyecto o en Campo\datos.
#
# Uso:  powershell -ExecutionPolicy Bypass -File .\Campo\herramientas\convertir-zk-a-xls.ps1
#       (convierte zk-actualizacion-PRUEBA-1-fila.csv por default)
#       -Archivo zk-actualizacion-desde-satag.csv   para otro archivo
param([string]$Archivo = 'zk-actualizacion-PRUEBA-1-fila.csv')

$raiz = Join-Path $env:USERPROFILE 'Documents\Proyectos WEB\SATAG'
$datos = Join-Path $raiz 'Campo\datos'
$origen = Join-Path $datos $Archivo
if (-not (Test-Path $origen)) { Write-Host "NO EXISTE: $origen"; exit 1 }
$destino = [System.IO.Path]::ChangeExtension($origen, '.xls')

$plantilla = Get-ChildItem $datos, $raiz -Filter 'Plantilla*.xls' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $plantilla) { Write-Host "NO ENCUENTRO la Plantilla*.xls de ZK (descargarla desde Importar y ponerla en la raiz o en Campo\datos)"; exit 1 }
Write-Host ("Plantilla: " + $plantilla.Name)

$lineas = [System.IO.File]::ReadAllLines($origen, [System.Text.Encoding]::Unicode) |
  Where-Object { $_.Trim() -ne '' }
if ($lineas.Count -lt 3) { Write-Host "El CSV trae menos de 3 filas (titulo+encabezados+datos); revisar."; exit 1 }
$filasDatos = $lineas | Select-Object -Skip 2

if (Test-Path $destino) { Remove-Item $destino -Force }
Copy-Item $plantilla.FullName $destino

$excel = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $wb = $excel.Workbooks.Open($destino)
  $ws = $wb.Worksheets.Item(1)

  $bom = [char]0xFEFF
  $n = @($filasDatos).Count
  $rango = $ws.Range($ws.Cells.Item(3, 1), $ws.Cells.Item(2 + $n, 25))
  $rango.NumberFormat = '@'
  for ($i = 0; $i -lt $n; $i++) {
    $campos = @($filasDatos)[$i].TrimStart($bom) -split "`t"
    for ($c = 0; $c -lt [Math]::Min($campos.Count, 25); $c++) {
      if ($campos[$c] -ne '') { $ws.Cells.Item(3 + $i, $c + 1).Value2 = $campos[$c] }
    }
  }

  $wb.Save()
  $wb.Close($true)
  Write-Host "ESCRITO: $destino"
  Write-Host ("Personas inyectadas en la plantilla: " + $n)
  Write-Host "En ZK: Fila de Inicio = 2 (la fila de encabezados anotados), Actualizar ID existente = Si"
} finally {
  if ($excel) {
    $excel.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  }
}
