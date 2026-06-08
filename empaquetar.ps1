# empaquetar.ps1 - Crea un ZIP con todo lo necesario para llevar la aplicacion a
# otro equipo. En el otro equipo basta con descomprimir y hacer doble clic en
# "Iniciar Control Mundial.bat".
#
#   powershell -ExecutionPolicy Bypass -File empaquetar.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$distDir = Join-Path $root "dist"
$stage   = Join-Path $distDir "ControlMundial"
$zipPath = Join-Path $distDir "ControlMundial.zip"

# Ficheros/carpetas que forman la aplicacion (se excluye estado y herramientas de dev).
$include = @(
  "index.html",
  "escaleta.html",
  "css",
  "js",
  "demo-fondos",
  "server.ps1",
  "iniciar.ps1",
  "Iniciar Control Mundial.bat",
  "README.md"
)

# Limpiar staging anterior.
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

Write-Host "Copiando ficheros..." -ForegroundColor Cyan
foreach ($item in $include) {
  $src = Join-Path $root $item
  if (-not (Test-Path -LiteralPath $src)) {
    Write-Host "  (omitido, no existe) $item" -ForegroundColor DarkYellow
    continue
  }
  $dst = Join-Path $stage $item
  if (Test-Path -LiteralPath $src -PathType Container) {
    Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
  } else {
    Copy-Item -LiteralPath $src -Destination $dst -Force
  }
  Write-Host "  + $item"
}

Write-Host "Comprimiendo en $zipPath ..." -ForegroundColor Cyan
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zipPath -Force

Write-Host ""
Write-Host "Listo." -ForegroundColor Green
Write-Host "  Paquete: $zipPath"
Write-Host "  En el otro equipo: descomprimir y doble clic en 'Iniciar Control Mundial.bat'."
