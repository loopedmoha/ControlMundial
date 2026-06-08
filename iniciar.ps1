# iniciar.ps1 - Lanzador del Control de Pantallas del Mundial (red local, puerto 8090).
#
# IMPORTANTE: el servidor se ejecuta SIN privilegios de administrador, para que
# CONSERVE el acceso a las unidades de red del usuario (p. ej. Z: o rutas \\servidor\...).
# Un proceso elevado NO ve esas unidades/sesiones de red y daria "carpeta no existe".
#
# La unica parte que requiere administrador es la PREPARACION (una sola vez):
#   - Reserva de URL (netsh http add urlacl): permite ESCUCHAR EN RED sin ser admin.
#   - Regla de firewall para el puerto.
# Si ya estan hechas, no se vuelve a pedir administrador.

$ErrorActionPreference = "Stop"
$Port = 8090
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$url  = "http://+:$Port/"
$ruleName = "Control Mundial $Port"

function Test-UrlAcl {
  $out = cmd /c "netsh http show urlacl url=$url" 2>$null
  return (($out -join "`n") -match ([regex]::Escape($url)))
}
function Test-FwRule {
  $out = cmd /c "netsh advfirewall firewall show rule name=`"$ruleName`"" 2>$null
  return (($out -join "`n") -match ([regex]::Escape($ruleName)))
}

# Preparacion de red (elevada, una sola vez) si falta la reserva de URL o la regla.
if ((-not (Test-UrlAcl)) -or (-not (Test-FwRule))) {
  Write-Host "Preparacion inicial de red (pedira permisos de administrador, solo una vez)..." -ForegroundColor Yellow
  $user = "$env:USERDOMAIN\$env:USERNAME"
  $parts = @()
  $parts += "netsh http add urlacl url=$url user=`"$user`""
  $parts += "netsh advfirewall firewall add rule name=`"$ruleName`" dir=in action=allow protocol=TCP localport=$Port profile=any"
  $inner = "/c " + ($parts -join " & ")
  try {
    Start-Process -FilePath "cmd.exe" -Verb RunAs -ArgumentList $inner -Wait
  } catch {
    Write-Host "Se cancelo el permiso de administrador; sin la preparacion puede que no se" -ForegroundColor Red
    Write-Host "pueda escuchar en red. Se intentara arrancar de todas formas." -ForegroundColor DarkYellow
  }
}

# Arrancar el servidor SIN elevar -> conserva el acceso a unidades de red (Z:, \\servidor\...).
$server = Join-Path $root "server.ps1"
if (-not (Test-Path -LiteralPath $server)) {
  Write-Host "ERROR: no se encuentra server.ps1 junto a este lanzador." -ForegroundColor Red
  Read-Host "Pulsa Enter para salir"
  exit 1
}

& $server -Port $Port -Lan -Open
