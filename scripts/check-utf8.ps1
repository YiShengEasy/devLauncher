$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$utf8Strict = [System.Text.UTF8Encoding]::new($false, $true)
$textExtensions = @(
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ps1",
  ".rs",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
)
$skipDirs = @(
  ".git",
  "node_modules",
  "dist",
  "target",
  ".runtime",
  "logs"
)

$badFiles = New-Object System.Collections.Generic.List[string]
$repoPrefix = $repoRoot.Path.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

Get-ChildItem -LiteralPath $repoRoot -Recurse -File | ForEach-Object {
  $relative = $_.FullName.Substring($repoPrefix.Length)
  $parts = $relative -split '[\\/]'
  if ($parts | Where-Object { $skipDirs -contains $_ }) {
    return
  }

  if ($textExtensions -notcontains $_.Extension.ToLowerInvariant()) {
    return
  }

  try {
    $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
    $text = $utf8Strict.GetString($bytes)
    if ($text.Contains([char]0xFFFD)) {
      $badFiles.Add("$relative : contains replacement character U+FFFD")
    }
  } catch {
    $badFiles.Add("$relative : $($_.Exception.Message)")
  }
}

if ($badFiles.Count -gt 0) {
  Write-Host "UTF-8 validation failed:"
  $badFiles | ForEach-Object { Write-Host " - $_" }
  exit 1
}

Write-Host "UTF-8 validation passed."
