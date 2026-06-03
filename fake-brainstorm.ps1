# Listener TCP de prueba que simula Brainstorm: mantiene la conexion abierta y va
# registrando en un log lo que recibe, marcando apertura y cierre de cada conexion.
param([int]$Port = 5123, [string]$Log = "C:\Users\moha_\Desktop\ControlMundial\bs-recv.log")
[System.IO.File]::WriteAllText($Log, "")
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
$listener.Start()
function LogLine($t) { Add-Content -Path $Log -Value $t }
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    LogLine ("=== CONEXION ABIERTA " + (Get-Date -Format "HH:mm:ss.fff") + " ===")
    $stream = $client.GetStream()
    $buf = New-Object byte[] 4096
    try {
      while ($true) {
        if ($stream.DataAvailable) {
          $n = $stream.Read($buf, 0, $buf.Length)
          if ($n -le 0) { break }
          $txt = [System.Text.Encoding]::UTF8.GetString($buf, 0, $n)
          Add-Content -Path $Log -Value ($txt.TrimEnd("`r","`n"))
        } else {
          # Detectar cierre del otro extremo.
          if ($client.Client.Poll(200000, [System.Net.Sockets.SelectMode]::SelectRead) -and $client.Client.Available -eq 0) { break }
        }
      }
    } catch {}
    LogLine ("=== CONEXION CERRADA " + (Get-Date -Format "HH:mm:ss.fff") + " ===")
    try { $client.Close() } catch {}
  }
} finally { $listener.Stop() }
