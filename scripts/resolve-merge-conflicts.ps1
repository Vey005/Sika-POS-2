# Keep "ours" (<<<<<<< HEAD) side of unfinished git merges
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$pattern = '(?s)<<<<<<< HEAD\r?\n(.*?)=======\r?\n.*?>>>>>>>[^\r\n]*\r?\n?'
$count = 0
Get-ChildItem -Path $root -Recurse -File | Where-Object {
  ($_.FullName -notmatch '\\node_modules\\|\\release\\|\\dist\\|\\dist-electron\\|\\.git\\')
} | ForEach-Object {
  try {
    $raw = [IO.File]::ReadAllText($_.FullName)
  } catch { return }
  if ($raw -notmatch '<<<<<<< HEAD') { return }
  $fixed = [regex]::Replace($raw, $pattern, '$1')
  if ($fixed -ne $raw) {
    [IO.File]::WriteAllText($_.FullName, $fixed)
    $count++
    Write-Host $_.FullName
  }
}
Write-Host "Resolved $count files."
