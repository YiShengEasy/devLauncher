$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$StateDir = Join-Path $Root ".runtime"
$PidFile = Join-Path $StateDir "dev.pid"
$Port = 5173

if (-not (Test-Path $PidFile)) {
  Write-Host "No PID file found. Dev server is not tracked as running."
  exit 0
}

$PidText = Get-Content $PidFile -ErrorAction SilentlyContinue
if (-not $PidText) {
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
  Write-Host "Empty PID file removed."
  exit 0
}

$Process = Get-Process -Id ([int]$PidText) -ErrorAction SilentlyContinue
if ($Process) {
  Stop-Process -Id $Process.Id -Force
  Write-Host "Stopped dev server. PID: $PidText"
} else {
  Write-Host "PID file existed, but process was not running. PID: $PidText"
}

Remove-Item $PidFile -Force -ErrorAction SilentlyContinue

$Listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($Listeners) {
  $Listeners | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
    Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped process listening on port $Port. PID: $_"
  }
}
