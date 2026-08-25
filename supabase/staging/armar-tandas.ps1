# =====================================================================
# armar-tandas.ps1  -  Concatena los bloques de supabase/sql/ en TANDAS
# listas para pegar enteras en el SQL Editor de un proyecto NUEVO de Supabase.
#
# Uso (desde la raiz del repo o desde cualquier carpeta):
#   powershell -ExecutionPolicy Bypass -File supabase\staging\armar-tandas.ps1
#
# Salida: supabase/staging/salida/  (ignorada por git)
#   tanda-1.sql, tanda-2.sql, ...   una por corte
#   seed.sql                        copia de seed_tests_dev.sql con advertencia
#
# Compatible con Windows PowerShell 5.1 (sin &&, sin ??, sin ternario).
# Lee UTF-8 y escribe UTF-8 sin BOM, con saltos LF como los archivos del repo.
# =====================================================================

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------
# CORTES: numero de bloque donde EMPIEZA cada tanda. El primero es 0.
# Para mover un corte basta con editar esta lista y volver a correr.
# ---------------------------------------------------------------------
$Cortes = @(0, 24, 31, 46)

# Paso manual que debe estar HECHO antes de pegar la tanda que empieza en
# ese bloque. Se imprime en el encabezado de la tanda. Sin acentos: el texto
# acaba dentro de un archivo .sql.
$PasoPrevio = @{
    0  = 'Proyecto de Supabase (staging) creado. Nada mas: esta tanda no depende de auth ni del cliente.'
    24 = 'PASO 0 hecho: cuentas del personal de prueba creadas en Authentication > Users y con app_metadata.rol asignado por SQL (README, paso 3). Verifique: select email, raw_app_meta_data ->> ''rol'' as rol from auth.users order by 1;'
    31 = 'Punto de verificacion: inicie sesion en el panel (staging, con MFA) con una cuenta de prueba y confirme que lee el padron vacio sin error. Si el PASO 0 quedo mal se ve aqui, no 21 bloques despues.'
    46 = 'El preview de Vercel de la rama staging ya esta publicado con el codigo actual de main (incluye 4245076 y 0b0c913): 46, 49 y 51 van acoplados a esa version del cliente.'
}

# Archivos de ESTA carpeta que se intercalan justo DESPUES del bloque indicado.
# (catalogos_base.sql: ningun bloque numerado llena estacionamientos, marcas y
#  colores; ver su encabezado.)
$Extras = @{
    4 = 'catalogos_base.sql'
}

# Archivos de supabase/sql/ que NUNCA entran en una tanda.
$Excluidos = @('seed_tests_dev.sql', 'limpiar_datos_prueba.sql')

# ---------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------
$Aqui      = $PSScriptRoot
$DirSql    = (Resolve-Path (Join-Path $Aqui '..\sql')).Path
$DirSalida = Join-Path $Aqui 'salida'

$Utf8SinBom = New-Object System.Text.UTF8Encoding($false)

function Leer-Utf8([string] $ruta) {
    $texto = [System.IO.File]::ReadAllText($ruta, [System.Text.Encoding]::UTF8)
    # Normaliza a LF y garantiza salto final.
    $texto = $texto -replace "`r`n", "`n"
    if (-not $texto.EndsWith("`n")) { $texto = $texto + "`n" }
    return $texto
}

function Escribir-Utf8([string] $ruta, [string] $texto) {
    [System.IO.File]::WriteAllText($ruta, $texto, $Utf8SinBom)
}

function Linea-Separadora { return ('-- ' + ('=' * 69)) }

# ---------------------------------------------------------------------
# 1) Inventario de bloques: NN_nombre.sql, en orden numerico, sin huecos.
# ---------------------------------------------------------------------
$bloques = Get-ChildItem -Path $DirSql -Filter '*.sql' |
    Where-Object { $_.Name -match '^\d\d_.*\.sql$' -and ($Excluidos -notcontains $_.Name) } |
    Sort-Object Name

if ($bloques.Count -eq 0) { throw "No se encontraron bloques NN_*.sql en $DirSql" }

$esperado = 0
foreach ($b in $bloques) {
    $n = [int] $b.Name.Substring(0, 2)
    if ($n -ne $esperado) {
        throw ("Hueco o duplicado en la numeracion: se esperaba el bloque {0:00} y aparecio {1}" -f $esperado, $b.Name)
    }
    $esperado = $esperado + 1
}
$ultimo = $esperado - 1

foreach ($c in $Cortes) {
    if ($c -lt 0 -or $c -gt $ultimo) { throw "El corte $c no corresponde a ningun bloque (00..$ultimo)" }
}
if ($Cortes[0] -ne 0) { throw 'El primer corte debe ser 0.' }
$CortesOrdenados = $Cortes | Sort-Object -Unique

foreach ($k in $Extras.Keys) {
    $rutaExtra = Join-Path $Aqui $Extras[$k]
    if (-not (Test-Path $rutaExtra)) { throw "Falta el archivo extra $($Extras[$k]) en $Aqui" }
}

# ---------------------------------------------------------------------
# 2) Carpeta de salida limpia.
# ---------------------------------------------------------------------
if (-not (Test-Path $DirSalida)) { New-Item -ItemType Directory -Path $DirSalida | Out-Null }
Get-ChildItem -Path $DirSalida -Filter 'tanda-*.sql' | Remove-Item -Force
$rutaSeedSalida = Join-Path $DirSalida 'seed.sql'
if (Test-Path $rutaSeedSalida) { Remove-Item -Force $rutaSeedSalida }

# ---------------------------------------------------------------------
# 3) Reparto de bloques por tanda.
# ---------------------------------------------------------------------
$totalTandas = $CortesOrdenados.Count
$resumen = @()

for ($t = 0; $t -lt $totalTandas; $t++) {
    $desde = $CortesOrdenados[$t]
    if ($t + 1 -lt $totalTandas) { $hasta = $CortesOrdenados[$t + 1] - 1 } else { $hasta = $ultimo }

    $delaTanda = @($bloques | Where-Object { ([int] $_.Name.Substring(0, 2)) -ge $desde -and ([int] $_.Name.Substring(0, 2)) -le $hasta })

    # Lista de lo que contiene (bloques + extras intercalados), en orden.
    $contiene = @()
    foreach ($b in $delaTanda) {
        $contiene += $b.Name
        $n = [int] $b.Name.Substring(0, 2)
        if ($Extras.ContainsKey($n)) { $contiene += ('staging/' + $Extras[$n]) }
    }

    $paso = 'Ninguno registrado. Revise el README antes de pegar.'
    if ($PasoPrevio.ContainsKey($desde)) { $paso = $PasoPrevio[$desde] }

    $sb = New-Object System.Text.StringBuilder
    [void] $sb.Append((Linea-Separadora) + "`n")
    [void] $sb.Append(("-- TANDA {0} de {1}  -  bloques {2:00} a {3:00}  (generado por armar-tandas.ps1)`n" -f ($t + 1), $totalTandas, $desde, $hasta))
    [void] $sb.Append("-- Pegue este archivo ENTERO en el SQL Editor del proyecto de STAGING y ejecute.`n")
    [void] $sb.Append("-- NO es para produccion: alli los bloques se aplican uno por uno, como siempre.`n")
    [void] $sb.Append("--`n")
    [void] $sb.Append("-- ANTES DE PEGAR debe estar hecho:`n")
    [void] $sb.Append("--   " + $paso + "`n")
    [void] $sb.Append("--`n")
    [void] $sb.Append("-- Contiene, en este orden:`n")
    foreach ($c in $contiene) { [void] $sb.Append("--   - " + $c + "`n") }
    [void] $sb.Append((Linea-Separadora) + "`n`n")

    foreach ($b in $delaTanda) {
        [void] $sb.Append("-- " + ('-' * 69) + "`n")
        [void] $sb.Append("-- >>> " + $b.Name + "`n")
        [void] $sb.Append("-- " + ('-' * 69) + "`n")
        [void] $sb.Append((Leer-Utf8 $b.FullName))
        [void] $sb.Append("`n")

        $n = [int] $b.Name.Substring(0, 2)
        if ($Extras.ContainsKey($n)) {
            $rutaExtra = Join-Path $Aqui $Extras[$n]
            [void] $sb.Append("-- " + ('-' * 69) + "`n")
            [void] $sb.Append("-- >>> staging/" + $Extras[$n] + "  (extra: se intercala despues del bloque " + ("{0:00}" -f $n) + ")`n")
            [void] $sb.Append("-- " + ('-' * 69) + "`n")
            [void] $sb.Append((Leer-Utf8 $rutaExtra))
            [void] $sb.Append("`n")
        }
    }

    [void] $sb.Append((Linea-Separadora) + "`n")
    [void] $sb.Append(("-- FIN DE LA TANDA {0}. Antes de seguir, corra las verificaciones del README para esta tanda.`n" -f ($t + 1)))

    $rutaTanda = Join-Path $DirSalida ("tanda-{0}.sql" -f ($t + 1))
    Escribir-Utf8 $rutaTanda $sb.ToString()

    $kb = [math]::Round(((Get-Item $rutaTanda).Length / 1KB), 1)
    $resumen += New-Object PSObject -Property @{
        Tanda   = ($t + 1)
        Bloques = ("{0:00}-{1:00}" -f $desde, $hasta)
        Archivos = $contiene.Count
        KB      = $kb
        Archivo = $rutaTanda
    }
}

# ---------------------------------------------------------------------
# 4) Seed de QA aparte, con advertencia en la primera linea.
# ---------------------------------------------------------------------
$rutaSeedOrigen = Join-Path $DirSql 'seed_tests_dev.sql'
if (Test-Path $rutaSeedOrigen) {
    $adv = '-- !!! SOLO STAGING / QA. Este archivo BORRA todo el padron (truncate ... cascade) y lo sustituye por datos ficticios. JAMAS en produccion. Copia de supabase/sql/seed_tests_dev.sql generada por armar-tandas.ps1: correr UNA vez, despues de la ultima tanda. !!!' + "`n"
    Escribir-Utf8 $rutaSeedSalida ($adv + (Leer-Utf8 $rutaSeedOrigen))
} else {
    Write-Warning "No se encontro $rutaSeedOrigen; no se genero salida/seed.sql"
}

# ---------------------------------------------------------------------
# 5) Resumen
# ---------------------------------------------------------------------
Write-Output ''
Write-Output ("Bloques encontrados: 00..{0:00}  ({1} archivos)" -f $ultimo, $bloques.Count)
Write-Output ("Cortes: " + ($CortesOrdenados -join ', '))
Write-Output ''
$resumen | Select-Object Tanda, Bloques, Archivos, KB, Archivo | Format-Table -AutoSize | Out-String -Width 200 | Write-Output
if (Test-Path $rutaSeedSalida) {
    Write-Output ("seed.sql: {0} KB  ->  {1}" -f [math]::Round(((Get-Item $rutaSeedSalida).Length / 1KB), 1), $rutaSeedSalida)
}
Write-Output ''
Write-Output 'Listo. Siga el orden del README: una tanda, sus verificaciones, la siguiente.'
