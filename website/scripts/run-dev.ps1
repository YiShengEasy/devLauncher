$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$LogDir = Join-Path $Root "logs"
$LogFile = Join-Path $LogDir "dev.log"
$ErrFile = Join-Path $LogDir "dev.err.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location $Root

try {
  "[$(Get-Date -Format "yyyy-MM-dd HH:mm:ss")] wrapper started" | Out-File -FilePath $LogFile -Encoding utf8 -Append
  & cmd /c "node server.mjs >> logs\dev.log 2>> logs\dev.err.log"
  "[$(Get-Date -Format "yyyy-MM-dd HH:mm:ss")] node exited with code $LASTEXITCODE" | Out-File -FilePath $LogFile -Encoding utf8 -Append
} catch {
  "[$(Get-Date -Format "yyyy-MM-dd HH:mm:ss")] wrapper error: $($_.Exception.Message)" | Out-File -FilePath $ErrFile -Encoding utf8 -Append
  exit 1
}
