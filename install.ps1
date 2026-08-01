# Install cursor-telegram into %USERPROFILE%\.cursor
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
node scripts/install.mjs @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
