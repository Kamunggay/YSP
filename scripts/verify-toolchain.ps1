$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
& docker build -f scripts/verification.Dockerfile -t ysp-verification:local .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& docker run --rm ysp-verification:local node --version
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& docker image inspect ysp-verification:local --format '{{.RepoTags}} {{.Id}}'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
