# Build SikaPOS installers and copy update artifacts for hosting.
# After running, upload everything in backend/updates/ to your update server
# (or deploy backend so /updates serves this folder on Railway).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

Write-Host 'Building installers...'
npm run dist:publish

$releaseDir = Join-Path $root 'release-staging'
if (-not (Test-Path $releaseDir)) {
  $releaseDir = Join-Path $root 'release'
}
$updatesDir = Join-Path $root 'backend' 'updates'
if (-not (Test-Path $updatesDir)) { New-Item -ItemType Directory -Path $updatesDir | Out-Null }

$yml = Get-ChildItem -Path $releaseDir -Filter 'latest.yml' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $yml) {
  Write-Error "latest.yml not found in release/. Run npm run dist:publish first."
}

Copy-Item -Path $yml.FullName -Destination $updatesDir -Force
Get-ChildItem -Path $releaseDir -Filter '*.exe' | ForEach-Object {
  $destName = $_.Name -replace '\s+', '-'
  Copy-Item -Path $_.FullName -Destination (Join-Path $updatesDir $destName) -Force
  Write-Host "Copied $($_.Name) -> $destName"
}
Get-ChildItem -Path $releaseDir -Filter '*.exe.blockmap' | ForEach-Object {
  $destName = $_.Name -replace '\s+', '-'
  Copy-Item -Path $_.FullName -Destination (Join-Path $updatesDir $destName) -Force
}

Write-Host 'Verifying checksums...'
node (Join-Path $root 'scripts' 'verify-update-artifacts.mjs') $updatesDir
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Update files ready in backend/updates/'
Write-Host 'Deploy backend or upload that folder to your CDN, then bump package.json version for the next release.'
