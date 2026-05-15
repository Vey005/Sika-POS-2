# SikaPOS — publish a desktop update via GitHub Releases
# Before first run: edit GITHUB_OWNER in electron/update-config.ts and package.json build.publish

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$configPath = Join-Path $root 'electron\update-config.ts'
$config = Get-Content $configPath -Raw
if ($config -match "GITHUB_OWNER = 'YOUR_GITHUB_USERNAME'") {
  Write-Host ''
  Write-Host 'ERROR: Set your GitHub username first:' -ForegroundColor Red
  Write-Host '  1. electron/update-config.ts  -> GITHUB_OWNER'
  Write-Host '  2. package.json               -> build.publish.owner'
  Write-Host ''
  exit 1
}

Write-Host '=== SikaPOS GitHub Release ===' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Choose how to publish:'
Write-Host '  [A] Automatic — needs GH_TOKEN (uploads to GitHub for you)'
Write-Host '  [M] Manual    — build locally, you upload files in the browser'
Write-Host ''
$choice = Read-Host 'Enter A or M'

if ($choice -eq 'A' -or $choice -eq 'a') {
  if (-not $env:GH_TOKEN) {
    Write-Host ''
    Write-Host 'Set a GitHub Personal Access Token (repo scope):' -ForegroundColor Yellow
    Write-Host '  Settings -> Developer settings -> Personal access tokens'
    Write-Host '  Then in PowerShell:'
    Write-Host '    $env:GH_TOKEN = "ghp_your_token_here"'
    Write-Host '    .\scripts\release-github.ps1'
    exit 1
  }
  Write-Host 'Building and publishing to GitHub...'
  npm run release:github
  Write-Host 'Done. Shops with the previous installer will see the update in Settings -> About.'
  exit 0
}

Write-Host 'Building installers (no upload)...'
npm run dist:publish

$releaseDir = Join-Path $root 'release'
Write-Host ''
Write-Host 'Files to upload to GitHub Release:' -ForegroundColor Green
Get-ChildItem $releaseDir -File | Where-Object {
  $_.Extension -in '.yml', '.exe', '.blockmap'
} | ForEach-Object { Write-Host "  - $($_.Name)" }

$pkg = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$ver = $pkg.version
Write-Host ''
Write-Host 'Manual steps:' -ForegroundColor Cyan
Write-Host "  1. Commit and push your code"
Write-Host "  2. Create tag:  git tag v$ver"
Write-Host "  3. Push tag:    git push origin v$ver"
Write-Host '  4. GitHub -> your repo -> Releases -> Draft a new release'
Write-Host "  5. Choose tag v$ver, title v$ver"
Write-Host '  6. Upload ALL files listed above from the release/ folder'
Write-Host '  7. Publish release'
Write-Host ''
Write-Host 'Shops: Settings -> About -> Check for updates'
