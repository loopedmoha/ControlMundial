# server.ps1 - Backend del Control de Pantallas del Mundial (sin dependencias).
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File server.ps1
#   powershell -ExecutionPolicy Bypass -File server.ps1 -Port 8090 -Open
#
# Sirve el frontend estatico y expone una pequena API:
#   GET  /api/list?dir=<ruta>     -> lista imagenes y videos de una carpeta
#   GET  /api/dirs?dir=<ruta>     -> navegacion de carpetas (para el explorador)
#   GET  /media?path=<ruta>       -> sirve un fichero (con soporte de Range para video)
#   GET  /api/escaleta            -> escaleta guardada (JSON)
#   POST /api/escaleta            -> guarda la escaleta (JSON en el cuerpo)
param(
  [int]$Port = 8090,
  [switch]$Open,
  [switch]$Lan    # Escuchar en todas las interfaces para acceso desde otros equipos de la red.
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$escaletaFile = Join-Path $root "escaleta.json"
$bsLogFile = Join-Path $root "brainstorm.log"

# Estado de la conexion persistente con Brainstorm (el servidor es de un solo hilo,
# asi que estas variables se conservan entre peticiones sin condiciones de carrera).
$script:bsClient = $null
$script:bsStream = $null
$script:bsAddr = $null

$imageExt = @(".jpg",".jpeg",".png",".gif",".webp",".bmp",".svg",".avif",".jfif",".tif",".tiff")
$videoExt = @(".mp4",".webm",".mov",".mkv",".avi",".m4v",".mpg",".mpeg",".wmv",".ogv")

$mime = @{
  ".html"="text/html; charset=utf-8"; ".css"="text/css; charset=utf-8";
  ".js"="application/javascript; charset=utf-8"; ".json"="application/json; charset=utf-8";
  ".svg"="image/svg+xml"; ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg";
  ".gif"="image/gif"; ".webp"="image/webp"; ".bmp"="image/bmp"; ".avif"="image/avif";
  ".jfif"="image/jpeg"; ".tif"="image/tiff"; ".tiff"="image/tiff"; ".ico"="image/x-icon";
  ".mp4"="video/mp4"; ".webm"="video/webm"; ".mov"="video/quicktime"; ".mkv"="video/x-matroska";
  ".avi"="video/x-msvideo"; ".m4v"="video/x-m4v"; ".mpg"="video/mpeg"; ".mpeg"="video/mpeg";
  ".wmv"="video/x-ms-wmv"; ".ogv"="video/ogg";
}

function Get-Mime([string]$ext) {
  $e = $ext.ToLower()
  if ($mime.ContainsKey($e)) { return $mime[$e] }
  return "application/octet-stream"
}

function Send-Json($ctx, [string]$json, [int]$status = 200) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = "application/json; charset=utf-8"
  $ctx.Response.AddHeader("Cache-Control","no-store")
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Send-Text($ctx, [string]$text, [int]$status = 200, [string]$ct = "text/plain; charset=utf-8") {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = $ct
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function To-JsonArray($items) {
  $arr = @($items)
  if ($arr.Count -eq 0) { return "[]" }
  if ($arr.Count -eq 1) { return "[" + ($arr[0] | ConvertTo-Json -Depth 8 -Compress) + "]" }
  return ($arr | ConvertTo-Json -Depth 8 -Compress)
}

# Unidades de red mapeadas del usuario (persistentes), leidas del registro.
# Devuelve un hash: letra (mayuscula) -> ruta UNC. Funciona tambien cuando el
# servidor corre elevado (las unidades mapeadas no se "ven" en sesion elevada,
# pero su definicion sigue en HKCU:\Network del mismo usuario).
function Get-MappedDrives {
  $map = @{}
  try {
    if (Test-Path "HKCU:\Network") {
      foreach ($k in (Get-ChildItem "HKCU:\Network" -ErrorAction SilentlyContinue)) {
        $letter = $k.PSChildName.ToUpper()
        $remote = (Get-ItemProperty -Path $k.PSPath -Name RemotePath -ErrorAction SilentlyContinue).RemotePath
        if ($remote) { $map[$letter] = $remote }
      }
    }
  } catch {}
  return $map
}

# Si la ruta empieza por una letra de unidad de RED mapeada y esa letra no es
# accesible directamente (p. ej. en contexto elevado), la reescribe a su ruta UNC.
function Resolve-NetPath([string]$path) {
  if ([string]::IsNullOrWhiteSpace($path)) { return $path }
  if ($path -match '^([A-Za-z]):(\\.*)?$') {
    $letter = $matches[1].ToUpper()
    $rest = $matches[2]
    if (-not (Test-Path -LiteralPath ($letter + ':\'))) {
      $map = Get-MappedDrives
      if ($map.ContainsKey($letter)) {
        return ($map[$letter].TrimEnd('\') + $rest)
      }
    }
  }
  return $path
}

function Handle-List($ctx) {
  $dir = $ctx.Request.QueryString["dir"]
  if ([string]::IsNullOrWhiteSpace($dir)) { Send-Json $ctx '{"ok":false,"error":"Falta el parametro dir"}' 400; return }
  $dir = Resolve-NetPath $dir
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) {
    Send-Json $ctx ('{"ok":false,"error":"La carpeta no existe: ' + ($dir -replace '\\','\\\\' -replace '"','\"') + '"}') 404; return
  }
  $all = $imageExt + $videoExt
  $files = Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue | Where-Object { $all -contains $_.Extension.ToLower() } | Sort-Object Name
  $items = foreach ($f in $files) {
    $ext = $f.Extension.ToLower()
    $type = if ($imageExt -contains $ext) { "image" } else { "video" }
    [ordered]@{
      name  = $f.Name
      path  = $f.FullName
      type  = $type
      ext   = $ext
      size  = $f.Length
      mtime = [int64]([DateTimeOffset]$f.LastWriteTimeUtc).ToUnixTimeMilliseconds()
      url   = "/media?path=" + [System.Uri]::EscapeDataString($f.FullName)
    }
  }
  $payload = '{"ok":true,"dir":' + (($dir) | ConvertTo-Json -Compress) + ',"items":' + (To-JsonArray $items) + '}'
  Send-Json $ctx $payload
}

# ¿Es la raiz de un servidor UNC?  \\servidor  o  \\servidor\
function Is-UncServerRoot([string]$p) {
  return ($p -match '^\\\\[^\\/]+\\?$')
}

# Enumera los recursos compartidos de un servidor UNC (\\servidor) con 'net view'.
# Best-effort: si no se puede (permisos, SMB), devuelve lista vacia.
function Get-NetworkShares([string]$server) {
  $shares = @()
  try {
    $lines = cmd /c "net view `"$server`" /all" 2>$null
    foreach ($l in $lines) {
      $parts = ($l -split '\s{2,}') | Where-Object { $_ -ne "" }
      if ($parts.Count -ge 2 -and ($parts[1] -eq 'Disco' -or $parts[1] -eq 'Disk')) {
        $name = $parts[0].Trim()
        if ($name) {
          $shares += [ordered]@{ name = $name; path = ($server.TrimEnd('\') + '\' + $name) }
        }
      }
    }
  } catch {}
  return ($shares | Sort-Object { $_.name })
}

function Handle-Dirs($ctx) {
  $dir = $ctx.Request.QueryString["dir"]
  $result = [ordered]@{ ok = $true }
  if ([string]::IsNullOrWhiteSpace($dir)) {
    # Listar unidades disponibles (locales + de red mapeadas)
    $seen = @{}
    $drivesList = @()
    foreach ($d in (Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue)) {
      $seen[$d.Name.ToUpper()] = $true
      $drivesList += [ordered]@{ name = ($d.Name + ":\"); path = ($d.Name + ":\") }
    }
    # Unidades de red mapeadas que no aparezcan ya (p. ej. cuando se corre elevado).
    # Se apuntan a su ruta UNC para que funcionen en cualquier contexto.
    $map = Get-MappedDrives
    foreach ($letter in ($map.Keys | Sort-Object)) {
      if ($seen.ContainsKey($letter)) { continue }
      $drivesList += [ordered]@{ name = ($letter + ":\  (red: " + $map[$letter] + ")"); path = $map[$letter] }
    }
    $result.current = ""
    $result.parent = $null
    $result.dirs = @($drivesList)
    Send-Json $ctx ($result | ConvertTo-Json -Depth 6 -Compress)
    return
  }

  $dir = (Resolve-NetPath ($dir.Trim()))

  # Raiz de servidor UNC (\\servidor): enumerar sus recursos compartidos.
  if (Is-UncServerRoot $dir) {
    $server = '\\' + ($dir -replace '^\\+','' -replace '\\+$','')
    $shares = @(Get-NetworkShares $server)
    $result.current = $server
    $result.parent = ""   # subir = volver a las unidades locales
    $result.dirs = @($shares)
    Send-Json $ctx ($result | ConvertTo-Json -Depth 6 -Compress)
    return
  }

  if (-not (Test-Path -LiteralPath $dir -PathType Container)) {
    Send-Json $ctx '{"ok":false,"error":"La carpeta no existe o no es accesible"}' 404; return
  }
  $sub = Get-ChildItem -LiteralPath $dir -Directory -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object {
    [ordered]@{ name = $_.Name; path = $_.FullName }
  }
  # Padre: para \\servidor\recurso el padre es \\servidor (se enumeran sus recursos).
  $parent = $null
  try { $p = Split-Path -Parent $dir; if ($p) { $parent = $p } } catch {}
  $result.current = $dir
  $result.parent = $parent
  $result.dirs = @($sub)
  Send-Json $ctx ($result | ConvertTo-Json -Depth 6 -Compress)
}

function Serve-Media($ctx) {
  $path = $ctx.Request.QueryString["path"]
  if ([string]::IsNullOrWhiteSpace($path)) { Send-Text $ctx "Falta path" 400; return }
  $path = Resolve-NetPath $path
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Send-Text $ctx "No encontrado" 404; return }
  $ext = [System.IO.Path]::GetExtension($path).ToLower()
  if (-not (($imageExt + $videoExt) -contains $ext)) { Send-Text $ctx "Tipo no permitido" 403; return }

  $fileInfo = Get-Item -LiteralPath $path
  $total = $fileInfo.Length
  $start = 0
  $end = $total - 1
  $isPartial = $false

  $range = $ctx.Request.Headers["Range"]
  if ($range -and ($range -match "bytes=(\d*)-(\d*)")) {
    $s = $matches[1]; $e = $matches[2]
    if ($s -ne "" -and $e -ne "") { $start = [int64]$s; $end = [int64]$e }
    elseif ($s -ne "" -and $e -eq "") { $start = [int64]$s; $end = $total - 1 }
    elseif ($s -eq "" -and $e -ne "") { $start = $total - [int64]$e; $end = $total - 1 }
    if ($start -lt 0) { $start = 0 }
    if ($end -ge $total) { $end = $total - 1 }
    if ($start -le $end) { $isPartial = $true }
  }

  $ctx.Response.AddHeader("Accept-Ranges","bytes")
  $ctx.Response.ContentType = Get-Mime $ext
  $ctx.Response.AddHeader("Cache-Control","public, max-age=3600")
  $len = $end - $start + 1
  if ($isPartial) {
    $ctx.Response.StatusCode = 206
    $ctx.Response.AddHeader("Content-Range", "bytes $start-$end/$total")
  } else {
    $ctx.Response.StatusCode = 200
  }
  $ctx.Response.ContentLength64 = $len

  $fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  try {
    [void]$fs.Seek($start, [System.IO.SeekOrigin]::Begin)
    $buf = New-Object byte[] 131072
    $remaining = $len
    while ($remaining -gt 0) {
      $toRead = [int][Math]::Min([int64]$buf.Length, $remaining)
      $read = $fs.Read($buf, 0, $toRead)
      if ($read -le 0) { break }
      $ctx.Response.OutputStream.Write($buf, 0, $read)
      $remaining -= $read
    }
  } finally {
    $fs.Close()
  }
}

function Handle-Escaleta($ctx) {
  if ($ctx.Request.HttpMethod -eq "POST") {
    $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream, [System.Text.Encoding]::UTF8)
    $body = $reader.ReadToEnd()
    $reader.Close()
    if ([string]::IsNullOrWhiteSpace($body)) { $body = "[]" }
    [System.IO.File]::WriteAllText($escaletaFile, $body, [System.Text.Encoding]::UTF8)
    Send-Json $ctx '{"ok":true}'
    return
  }
  # GET
  if (Test-Path -LiteralPath $escaletaFile -PathType Leaf) {
    $content = [System.IO.File]::ReadAllText($escaletaFile, [System.Text.Encoding]::UTF8)
    if ([string]::IsNullOrWhiteSpace($content)) { $content = "[]" }
    Send-Json $ctx $content
  } else {
    Send-Json $ctx "[]"
  }
}

function Write-BSLog([string[]]$lines) {
  try { [System.IO.File]::AppendAllText($bsLogFile, ($lines -join "`r`n") + "`r`n", [System.Text.Encoding]::UTF8) } catch {}
}

# ¿Sigue viva la conexion persistente?
function BS-Alive {
  if (-not $script:bsClient) { return $false }
  try {
    $sock = $script:bsClient.Client
    if (-not $sock.Connected) { return $false }
    # Si es legible y no hay datos disponibles, el otro extremo cerro.
    if ($sock.Poll(0, [System.Net.Sockets.SelectMode]::SelectRead) -and $sock.Available -eq 0) { return $false }
    return $true
  } catch { return $false }
}

function BS-Close {
  try { if ($script:bsStream) { $script:bsStream.Close() } } catch {}
  try { if ($script:bsClient) { $script:bsClient.Close() } } catch {}
  $script:bsStream = $null; $script:bsClient = $null; $script:bsAddr = $null
}

function BS-Connect([string]$ip, [int]$port) {
  BS-Close
  $client = New-Object System.Net.Sockets.TcpClient
  $iar = $client.BeginConnect($ip, $port, $null, $null)
  if (-not $iar.AsyncWaitHandle.WaitOne(3000, $false)) { try { $client.Close() } catch {}; throw "Timeout: no responde $ip`:$port" }
  $client.EndConnect($iar)
  $script:bsClient = $client
  $script:bsStream = $client.GetStream()
  $script:bsAddr = "$ip`:$port"
}

function Handle-BrainstormConnect($ctx) {
  if ($ctx.Request.HttpMethod -ne "POST") { Send-Json $ctx '{"ok":false,"error":"Usar POST"}' 405; return }
  $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream, [System.Text.Encoding]::UTF8)
  $body = $reader.ReadToEnd(); $reader.Close()
  $data = $null
  try { $data = $body | ConvertFrom-Json } catch {}
  $ip = if ($data.ip) { [string]$data.ip } else { "127.0.0.1" }
  $port = if ($data.port) { [int]$data.port } else { 5123 }
  $ts = (Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff")
  try {
    BS-Connect $ip $port
    Write-BSLog @("[$ts] $script:bsAddr  CONEXION ABIERTA (persistente)")
    Send-Json $ctx ('{"ok":true,"connected":true,"addr":' + ($script:bsAddr | ConvertTo-Json -Compress) + '}')
  } catch {
    $msg = $_.Exception.Message
    Write-BSLog @("[$ts] $ip`:$port  ERROR al conectar: $msg")
    $err = ($msg -replace '\\','\\' -replace '"','\"')
    Send-Json $ctx ('{"ok":false,"connected":false,"error":"' + $err + '"}') 502
  }
}

function Handle-BrainstormDisconnect($ctx) {
  $ts = (Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff")
  $addr = if ($script:bsAddr) { $script:bsAddr } else { "-" }
  BS-Close
  Write-BSLog @("[$ts] $addr  CONEXION CERRADA")
  Send-Json $ctx '{"ok":true,"connected":false}'
}

function Handle-BrainstormStatus($ctx) {
  $alive = BS-Alive
  if (-not $alive) { BS-Close }
  $addrJson = if ($script:bsAddr) { $script:bsAddr | ConvertTo-Json -Compress } else { "null" }
  Send-Json $ctx ('{"ok":true,"connected":' + ($alive.ToString().ToLower()) + ',"addr":' + $addrJson + '}')
}

function Handle-BrainstormLog($ctx) {
  if ($ctx.Request.QueryString["clear"] -eq "1") {
    try { [System.IO.File]::WriteAllText($bsLogFile, "", [System.Text.Encoding]::UTF8) } catch {}
    Send-Text $ctx "" 200; return
  }
  if (Test-Path -LiteralPath $bsLogFile -PathType Leaf) {
    $content = [System.IO.File]::ReadAllText($bsLogFile, [System.Text.Encoding]::UTF8)
    $ctx.Response.AddHeader("Cache-Control","no-store")
    Send-Text $ctx $content 200
  } else {
    Send-Text $ctx "" 200
  }
}

function Handle-Brainstorm($ctx) {
  if ($ctx.Request.HttpMethod -ne "POST") { Send-Json $ctx '{"ok":false,"error":"Usar POST"}' 405; return }
  $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream, [System.Text.Encoding]::UTF8)
  $body = $reader.ReadToEnd(); $reader.Close()
  $data = $null
  try { $data = $body | ConvertFrom-Json } catch { Send-Json $ctx '{"ok":false,"error":"JSON invalido"}' 400; return }

  $ip = if ($data.ip) { [string]$data.ip } else { "127.0.0.1" }
  $port = if ($data.port) { [int]$data.port } else { 5123 }
  $commands = @()
  if ($data.commands) { $commands = @($data.commands) }
  $ts = (Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff")

  # Reutilizar la conexion persistente si esta abierta; si no, una transitoria.
  $persistent = BS-Alive
  $transient = $null
  $stream = $null
  $addr = "$ip`:$port"

  try {
    if ($persistent) {
      $stream = $script:bsStream
      $addr = $script:bsAddr
    } else {
      $transient = New-Object System.Net.Sockets.TcpClient
      $iar = $transient.BeginConnect($ip, $port, $null, $null)
      if (-not $iar.AsyncWaitHandle.WaitOne(3000, $false)) { throw "Timeout: no responde $addr" }
      $transient.EndConnect($iar)
      $stream = $transient.GetStream()
    }

    $enc = [System.Text.Encoding]::UTF8
    $sent = 0
    $log = @()
    if ($commands.Count -eq 0) {
      $log += "[$ts] $addr  CONEXION OK (prueba, sin ordenes)"
    }
    foreach ($cmd in $commands) {
      if ([string]::IsNullOrWhiteSpace($cmd)) { continue }
      $line = ([string]$cmd).TrimEnd()
      if (-not $line.EndsWith(";")) { $line += ";" }   # toda orden de Brainstorm acaba en ;
      $bytes = $enc.GetBytes($line + "`r`n")
      $stream.Write($bytes, 0, $bytes.Length)
      $sent++
      $log += "[$ts] $addr  ENVIADO  $line"
    }
    $stream.Flush()
    # Solo cerrar si NO es la conexion persistente.
    if (-not $persistent) { Start-Sleep -Milliseconds 40; try { $transient.Close() } catch {} }
    Write-BSLog $log
    Send-Json $ctx ('{"ok":true,"sent":' + $sent + ',"persistent":' + ($persistent.ToString().ToLower()) + '}')
  } catch {
    $msg = $_.Exception.Message
    if ($persistent) { BS-Close } else { try { $transient.Close() } catch {} }
    $log = @("[$ts] $addr  ERROR: $msg")
    foreach ($cmd in $commands) {
      if ([string]::IsNullOrWhiteSpace($cmd)) { continue }
      $log += "[$ts] $addr  NO ENVIADO  $cmd"
    }
    Write-BSLog $log
    $err = ($msg -replace '\\','\\' -replace '"','\"')
    Send-Json $ctx ('{"ok":false,"error":"' + $err + '"}') 502
  }
}

function Serve-Static($ctx) {
  $reqPath = $ctx.Request.Url.AbsolutePath
  if ($reqPath -eq "/") { $reqPath = "/index.html" }
  $rel = ($reqPath.TrimStart("/") -replace "/", "\")
  $file = Join-Path $root $rel
  # Evitar salir de la raiz
  $fullRoot = [System.IO.Path]::GetFullPath($root)
  $fullFile = [System.IO.Path]::GetFullPath($file)
  if (-not $fullFile.StartsWith($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    Send-Text $ctx "403" 403; return
  }
  if (Test-Path -LiteralPath $fullFile -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($fullFile).ToLower()
    $bytes = [System.IO.File]::ReadAllBytes($fullFile)
    $ctx.Response.ContentType = Get-Mime $ext
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    Send-Text $ctx "404 No encontrado: $reqPath" 404
  }
}

# ---- Conexion a recurso de red con credenciales (opcional) ----
# Si existe red-credenciales.json junto al servidor, se autentica al recurso
# (p. ej. \\Ipf735\compartida deportes) para poder leer los fondos de red.
# Formato: { "host": "\\\\Ipf735\\compartida deportes", "user": "...", "password": "..." }
$credFile = Join-Path $root "red-credenciales.json"
if (Test-Path -LiteralPath $credFile) {
  try {
    $cred = Get-Content -LiteralPath $credFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($cred.host -and $cred.user) {
      cmd /c "net use ""$($cred.host)"" /delete /y" 2>$null | Out-Null
      cmd /c "net use ""$($cred.host)"" /user:""$($cred.user)"" ""$($cred.password)"" /persistent:no" 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) {
        Write-Host ("  Red: autenticado en " + $cred.host + " como " + $cred.user) -ForegroundColor DarkGray
      } else {
        Write-Host ("  Aviso: no se pudo autenticar en " + $cred.host + " (codigo $LASTEXITCODE).") -ForegroundColor DarkYellow
      }
    }
  } catch {
    Write-Host ("  Aviso: error leyendo red-credenciales.json: " + $_.Exception.Message) -ForegroundColor DarkYellow
  }
}

# En modo -Lan se escucha en todas las interfaces (http://+:Port) para que otros
# equipos de la red puedan conectarse. Eso requiere ejecutar como administrador
# (lo hace el lanzador iniciar.ps1). Sin -Lan solo se escucha en localhost.
$prefix = if ($Lan) { "http://+:$Port/" } else { "http://localhost:$Port/" }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host "  ERROR: no se pudo abrir el puerto $Port." -ForegroundColor Red
  if ($Lan) {
    Write-Host "  Para escuchar en red usa 'Iniciar Control Mundial.bat' (hace la reserva de URL y el" -ForegroundColor Yellow
    Write-Host "  firewall una sola vez como administrador). NO ejecutes el servidor como administrador:" -ForegroundColor Yellow
    Write-Host "  un proceso elevado pierde el acceso a las unidades de red (Z:, \\servidor\...)." -ForegroundColor Yellow
  }
  Write-Host ("  Detalle: " + $_.Exception.Message) -ForegroundColor DarkYellow
  Write-Host ""
  Read-Host "Pulsa Enter para salir"
  exit 1
}

# Direcciones IPv4 locales (para mostrar como conectarse desde otros equipos).
$lanIps = @()
try {
  $lanIps = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
    Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.ToString() -ne '127.0.0.1' } |
    ForEach-Object { $_.ToString() }
} catch {}

Write-Host ""
Write-Host "  Control de Pantallas del Mundial" -ForegroundColor Cyan
Write-Host "  Servidor escuchando en el puerto $Port" -ForegroundColor Green
Write-Host "  En este equipo:        http://localhost:$Port/"
if ($Lan -and $lanIps.Count -gt 0) {
  Write-Host "  Desde otros equipos:" -ForegroundColor Green
  foreach ($ip in $lanIps) { Write-Host ("     http://$ip" + ":$Port/") -ForegroundColor White }
  Write-Host "  (deben estar en la misma red)"
}
Write-Host "  Raiz: $root"
Write-Host "  Ctrl+C para parar."
Write-Host ""

if ($Open) { try { Start-Process "http://localhost:$Port/" } catch {} }

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $path = $ctx.Request.Url.AbsolutePath
      switch -Regex ($path) {
        "^/api/list$"     { Handle-List $ctx; break }
        "^/api/dirs$"     { Handle-Dirs $ctx; break }
        "^/api/escaleta$" { Handle-Escaleta $ctx; break }
        "^/api/brainstorm/connect$"    { Handle-BrainstormConnect $ctx; break }
        "^/api/brainstorm/disconnect$" { Handle-BrainstormDisconnect $ctx; break }
        "^/api/brainstorm/status$"     { Handle-BrainstormStatus $ctx; break }
        "^/api/brainstorm/log$" { Handle-BrainstormLog $ctx; break }
        "^/api/brainstorm$" { Handle-Brainstorm $ctx; break }
        "^/media$"        { Serve-Media $ctx; break }
        default           { Serve-Static $ctx }
      }
    } catch {
      try { Write-Host ("Aviso: " + $_.Exception.Message) -ForegroundColor DarkYellow } catch {}
      try { if ($ctx.Response.StatusCode -eq 200) { $ctx.Response.StatusCode = 500 } } catch {}
    } finally {
      try { $ctx.Response.OutputStream.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
}
