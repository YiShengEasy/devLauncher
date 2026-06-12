$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$StateDir = Join-Path $Root ".runtime"
$LogDir = Join-Path $Root "logs"
$PidFile = Join-Path $StateDir "dev.pid"
$LogFile = Join-Path $LogDir "dev.log"
$ErrFile = Join-Path $LogDir "dev.err.log"

if (Test-Path $PidFile) {
  $PidText = Get-Content $PidFile -ErrorAction SilentlyContinue
  $Process = if ($PidText) { Get-Process -Id ([int]$PidText) -ErrorAction SilentlyContinue } else { $null }
  if ($Process) {
    Write-Host "Status: running"
    Write-Host "PID: $PidText"
  } else {
    Write-Host "Status: stopped (stale PID file)"
    Write-Host "PID: $PidText"
  }
} else {
  Write-Host "Status: stopped"
}

try {
  $Response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:5173" -TimeoutSec 3
  Write-Host "HTTP: $($Response.StatusCode)"
  Write-Host "URL: http://127.0.0.1:5173"
} catch {
  Write-Host "HTTP: unavailable"
}

Write-Host "Log: $LogFile"
Write-Host "Error log: $ErrFile"
