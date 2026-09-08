# Lanzador de las pruebas de carga de SATAG (Windows PowerShell 5.1).
#
#   .\pruebas-carga\correr.ps1 lecturas  [-VusMax 40] [-Rampa 45] [-Sosten 60] [-Bajada 15] [-Rutas marcas,visitante]
#   .\pruebas-carga\correr.ps1 panel     [-VusMax 10] ...      (sesion fresca del arnes: node sesion.mjs)
#   .\pruebas-carga\correr.ps1 flujo     [-Familias 50] [-RampaMin 2] [-SostenMin 5] [-BajadaMin 1] [-Pensar 20]
#                                        [-Personal 2] [-Escribir si|no] [-Entorno staging|trabajo]
#
# Entornos:
#   staging  (por omision en `flujo`)  lee pruebas-carga\.env.staging (SUPABASE_URL/KEY, PANEL_*, FRONT_URL)
#   trabajo                            lee .env.local (el proyecto real): en `flujo` fuerza -Escribir no
#
# Si $env:SUPABASE_SERVICE_ROLE esta definido en ESTA ventana, `flujo` activa el
# vigia (conexiones y CPU reales). Nunca se lee de un archivo.
#
# k6 se busca en: $env:K6 · k6 en el PATH · el binario descargado en el scratchpad.
param(
    [Parameter(Mandatory = $true)][ValidateSet("lecturas", "panel", "flujo")][string]$Prueba,
    [int]$VusMax = 0, [int]$Rampa = 0, [int]$Sosten = 0, [int]$Bajada = 0, [string]$Rutas = "",
    [int]$Familias = 0, [double]$RampaMin = 0, [double]$SostenMin = 0, [double]$BajadaMin = 0, [int]$Pensar = -1,
    [int]$Personal = -1, [ValidateSet("", "si", "no")][string]$Escribir = "",
    [ValidateSet("staging", "trabajo")][string]$Entorno = "",
    # Ventana acordada y anunciada en el proyecto real (antes de la liberacion): escribe
    # de verdad y usa la sesion del arnes para el personal. Limpiar despues con
    # sql/limpiar-pruebas-carga.sql + limpiar-storage.mjs + sql/restablecer-secuencias.sql.
    [switch]$VentanaProduccion,
    [string]$Metricas = "",
    [string]$Arnes = "..\SATAG - Evidencia de pruebas\arnes\estado-panel.json"
)
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

# --- k6 ---
$k6 = $env:K6
if (-not $k6 -and (Test-Path "pruebas-carga\bin\k6.exe")) { $k6 = (Resolve-Path "pruebas-carga\bin\k6.exe").Path }
if (-not $k6) { $c = Get-Command k6 -ErrorAction SilentlyContinue; if ($c) { $k6 = $c.Source } }
if (-not $k6) {
    $cand = Get-ChildItem "$env:LOCALAPPDATA\Temp\claude" -Recurse -Filter k6.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cand) { $k6 = $cand.FullName }
}
if (-not $k6) { throw "No encuentro k6. Descargue https://github.com/grafana/k6/releases (zip windows-amd64) y fije `$env:K6 a la ruta del k6.exe" }

function Leer-Env($ruta) {
    $h = @{}
    if (-not (Test-Path $ruta)) { return $h }
    foreach ($l in (Get-Content $ruta -Encoding UTF8)) {
        if ($l -match '^\s*#' -or $l -notmatch '=') { continue }
        $k, $v = $l -split "=", 2
        $h[$k.Trim()] = $v.Trim()
    }
    return $h
}

if (-not $Entorno) { $Entorno = if ($Prueba -eq "flujo") { "staging" } else { "trabajo" } }
if ($Entorno -eq "staging") {
    $vars = Leer-Env "pruebas-carga\.env.staging"
    if (-not $vars["SUPABASE_URL"]) { throw "Falta pruebas-carga\.env.staging (copie .env.staging.example y rellene con STAGING)" }
    $url = $vars["SUPABASE_URL"]; $key = $vars["SUPABASE_KEY"]
} else {
    $vars = Leer-Env ".env.local"
    $url = $vars["NEXT_PUBLIC_SUPABASE_URL"]; $key = $vars["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
    if ($Prueba -eq "flujo" -and -not $VentanaProduccion -and $Escribir -ne "no") { Write-Host "Entorno de trabajo (proyecto real): solo lecturas (-Escribir no). Para escribir: -VentanaProduccion."; $Escribir = "no" }
}
if (-not $url -or -not $key) { throw "Faltan SUPABASE_URL / KEY para el entorno $Entorno" }

New-Item -ItemType Directory -Force "pruebas-carga\resultados" | Out-Null
$ts = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
$script = switch ($Prueba) {
    "lecturas" { "pruebas-carga\k6\lecturas-publicas.js" }
    "panel"    { "pruebas-carga\k6\panel-lecturas.js" }
    "flujo"    { "pruebas-carga\k6\flujo-completo.js" }
}
$nombre = "pruebas-carga\resultados\$ts-$Prueba"

$args_k6 = @("run", "-e", "SUPABASE_URL=$url", "-e", "SUPABASE_KEY=$key", "-e", "SALIDA=${nombre}")
if ($Prueba -ne "flujo") { $args_k6 += @("--out", "csv=${nombre}.csv") }   # el flujo no necesita el CSV crudo
if ($VusMax) { $args_k6 += @("-e", "VUS_MAX=$VusMax") }
if ($Rampa)  { $args_k6 += @("-e", "RAMPA=$Rampa") }
if ($Sosten) { $args_k6 += @("-e", "SOSTEN=$Sosten") }
if ($Bajada) { $args_k6 += @("-e", "BAJADA=$Bajada") }
if ($Rutas)  { $args_k6 += @("-e", "RUTAS=$Rutas") }

if ($Prueba -eq "panel") {
    if (-not (Test-Path $Arnes)) { throw "No existe $Arnes. Corra `node sesion.mjs` en la carpeta del arnes (abre Chromium, usted pone usuario + TOTP)." }
    $estado = Get-Content $Arnes -Raw -Encoding UTF8 | ConvertFrom-Json
    $sesion = $null
    foreach ($o in $estado.origins) { foreach ($ls in $o.localStorage) { if ($ls.name -eq "satag-admin-auth") { $sesion = $ls.value | ConvertFrom-Json } } }
    if (-not $sesion) { throw "estado-panel.json no trae la sesion satag-admin-auth" }
    $args_k6 += @("-e", "REFRESH_TOKEN=$($sesion.refresh_token)")
}

if ($Prueba -eq "flujo") {
    if ($Familias)  { $args_k6 += @("-e", "FAMILIAS=$Familias") }
    if ($RampaMin)  { $args_k6 += @("-e", "RAMPA_MIN=$RampaMin") }
    if ($SostenMin) { $args_k6 += @("-e", "SOSTEN_MIN=$SostenMin") }
    if ($BajadaMin) { $args_k6 += @("-e", "BAJADA_MIN=$BajadaMin") }
    if ($Pensar -ge 0)   { $args_k6 += @("-e", "PENSAR=$Pensar") }
    if ($Personal -ge 0) { $args_k6 += @("-e", "PERSONAL=$Personal") }
    if ($Escribir)  { $args_k6 += @("-e", "ESCRIBIR=$Escribir") }
    foreach ($k in @("FRONT_URL", "PANEL_EMAIL", "PANEL_PASSWORD", "PANEL_TOTP_SECRET", "LIMITE_CONEXIONES")) {
        if ($vars[$k]) { $args_k6 += @("-e", "$k=$($vars[$k])") }
    }
    if ($VentanaProduccion) {
        if ($Entorno -ne "trabajo") { throw "-VentanaProduccion solo aplica con -Entorno trabajo (el proyecto real)" }
        Write-Host ""
        Write-Host "  +------------------------------------------------------------------+"
        Write-Host "  |  VENTANA EN EL PROYECTO REAL: va a ESCRIBIR altas, cobros e       |"
        Write-Host "  |  instalaciones marcadas 'Prueba Carga'. Debe estar anunciada y    |"
        Write-Host "  |  nadie debe hacer cortar_caja hasta limpiar. Ctrl+C para abortar. |"
        Write-Host "  +------------------------------------------------------------------+"
        Start-Sleep -Seconds 8
        $args_k6 += @("-e", "VENTANA_PRODUCCION=si", "-e", "ESCRIBIR=si")
        if ($Personal -lt 0) { $args_k6 += @("-e", "PERSONAL=2") }
        if (-not (Test-Path $Arnes)) { throw "No existe $Arnes. Corra `node sesion.mjs` en la carpeta del arnes (usuario + TOTP) para la sesion del personal." }
        $estado = Get-Content $Arnes -Raw -Encoding UTF8 | ConvertFrom-Json
        $sesion = $null
        foreach ($o in $estado.origins) { foreach ($ls in $o.localStorage) { if ($ls.name -eq "satag-admin-auth") { $sesion = $ls.value | ConvertFrom-Json } } }
        if (-not $sesion) { throw "estado-panel.json no trae la sesion satag-admin-auth" }
        $args_k6 += @("-e", "REFRESH_TOKEN=$($sesion.refresh_token)")
        if (-not $vars["FRONT_URL"]) { $args_k6 += @("-e", "FRONT_URL=https://satag.vercel.app") }
    }
    if ($env:SUPABASE_SERVICE_ROLE) { $args_k6 += @("-e", "SUPABASE_SERVICE_ROLE=$env:SUPABASE_SERVICE_ROLE"); Write-Host "vigia: activo (service_role tomada del entorno)" }
    else { Write-Host "vigia: inactivo (sin `$env:SUPABASE_SERVICE_ROLE); no habra umbral de conexiones ni CPU" }
}
$args_k6 += $script

Write-Host "k6: $k6"
Write-Host "entorno: $Entorno ($($url -replace '^https://','' -replace '\..*$',''))"
Write-Host "salida: ${nombre}.*"
& $k6 @args_k6
$codigo = $LASTEXITCODE

if ($Prueba -ne "flujo") {
    $py = @("pruebas-carga\analizar.py", "${nombre}.csv")
    if ($Metricas -and (Test-Path $Metricas)) { $py += @("--metricas", $Metricas) }
    python @py | Out-Null
    Write-Host "analisis: ${nombre}.csv.analisis.md"
}
exit $codigo
