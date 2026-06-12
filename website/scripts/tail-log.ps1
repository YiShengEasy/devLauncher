$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$LogFile = Join-Path $Root "logs\dev.log"
$ErrFile = Join-Path $Root "logs\dev.err.log"

if (Test-Path $LogFile) {
  Write-Host "== dev.log =="
  Get-Content $LogFile -Tail 80
} else {
  Write-Host "dev.log not found."
}

if (Test-Path $ErrFile) {
  Write-Host ""
  Write-Host "== dev.err.log =="
  Get-Content $ErrFile -Tail 80
}
