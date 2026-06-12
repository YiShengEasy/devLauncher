$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$StateDir = Join-Path $Root ".runtime"
$LogDir = Join-Path $Root "logs"
$PidFile = Join-Path $StateDir "dev.pid"
$LogFile = Join-Path $LogDir "dev.log"
$ErrFile = Join-Path $LogDir "dev.err.log"
$RunScript = Join-Path $PSScriptRoot "run-dev.ps1"

New-Item -ItemType Directory -Force -Path $StateDir, $LogDir | Out-Null

if (Test-Path $PidFile) {
  $ExistingPid = Get-Content $PidFile -ErrorAction SilentlyContinue
  if ($ExistingPid -and (Get-Process -Id ([int]$ExistingPid) -ErrorAction SilentlyContinue)) {
    Write-Host "Dev server already running. PID: $ExistingPid"
    Write-Host "URL: http://127.0.0.1:5173"
    Write-Host "Log: $LogFile"
    exit 0
  }
}

$StartedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$StartedAt] Starting DevLauncher website dev server..." | Set-Content -Path $LogFile -Encoding utf8
"" | Set-Content -Path $ErrFile -Encoding utf8

$Process = Start-Process `
  -FilePath "powershell" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $RunScript) `
  -WorkingDirectory $Root `
  -PassThru `
  -WindowStyle Hidden

$Process.Id | Out-File -FilePath $PidFile -Encoding ascii
Start-Sleep -Milliseconds 600

try {
  $Response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:5173" -TimeoutSec 3
  Write-Host "Dev server started. PID: $($Process.Id)"
  Write-Host "URL: http://127.0.0.1:5173"
  Write-Host "HTTP: $($Response.StatusCode)"
  Write-Host "Log: $LogFile"
} catch {
  Write-Host "Dev server process started, but HTTP check failed."
  Write-Host "PID: $($Process.Id)"
  Write-Host "Log: $LogFile"
  Write-Host "Error log: $ErrFile"
}
