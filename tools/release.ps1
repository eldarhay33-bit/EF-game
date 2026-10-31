# Makes a release: puts one version number everywhere and (optionally) packs the folder into dist\last-squad-standing-<version>.zip.
#   powershell -File tools\release.ps1 -Version 4.3.0          (raises the version in src/boot.js, sw.js and version.json)
#   powershell -File tools\release.ps1 -Version 4.3.0 -Zip     (and builds the zip)
# Why it matters: an installed copy of the game (phone, tablet, computer) finds out that there is something new by comparing version.json on the server with the version it runs,
# and the browser replaces the service worker only when sw.js has changed. So EVERY release must carry a new number, otherwise the players keep the files they already have.
# Nothing is uploaded or published by this script.
param([Parameter(Mandatory = $true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version, [switch]$Zip)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$utf8 = New-Object Text.UTF8Encoding($false)
& (Join-Path $PSScriptRoot 'apply-brand.ps1')                    # the name and the logo files come from src/core/brand.js: make sure index.html, the manifest and sw.js carry the same
function Patch($file, $pattern, $replacement) {
  $p = Join-Path $root $file; $t = [IO.File]::ReadAllText($p, $utf8)
  if (-not [regex]::IsMatch($t, $pattern)) { throw "${file}: the version line was not found" }
  [IO.File]::WriteAllText($p, [regex]::Replace($t, $pattern, $replacement, 1), $utf8); Write-Host ("  {0,-18} -> {1}" -f $file, $Version)
}
# the assets code: a short hash of the names and contents of the big files (models, textures, skies); it only changes when one of them does, so the players keep what they downloaded
$sha = [Security.Cryptography.SHA1]::Create(); $lines = New-Object Collections.Generic.List[string]
foreach ($f in Get-ChildItem (Join-Path $root 'assets') -Recurse -File | Where-Object { $_.FullName -notmatch '\\assets\\(brand|icons)\\' -and $_.Extension -match '^\.(jpg|jpeg|png|glb|gltf|bin|hdr|json)$' } | Sort-Object FullName) {          # (only files the game loads: notes and licence texts do not count)
  $h = ([BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($f.FullName))) -replace '-', '').Substring(0, 12); $lines.Add($f.FullName.Substring($root.Length) + '|' + $h)
}
$rev = 'a' + (([BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes(($lines -join "`n")))) -replace '-', '').Substring(0, 8).ToLower())
Patch 'src\boot.js' "const VERSION = '[^']+', ASSET_REV = '[^']+'" "const VERSION = '$Version', ASSET_REV = '$rev'"
Patch 'sw.js' "const VERSION = '[^']+', ASSET_REV = '[^']+'" "const VERSION = '$Version', ASSET_REV = '$rev'"
Patch 'sw.js' "const CACHE = '[^']+'" "const CACHE = 'lss-v$($Version -replace '\.0$', '')'"
[IO.File]::WriteAllText((Join-Path $root 'version.json'), "{ `"version`": `"$Version`", `"assets`": `"$rev`" }`n", $utf8); Write-Host ("  {0,-18} -> {1}" -f 'version.json', $Version)
Write-Host "Version $Version is in place (players never see the number: it only drives the updates), assets code $rev."
if (-not $Zip) { return }

Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem
$dist = Join-Path $root 'dist'; New-Item -ItemType Directory -Force -Path $dist | Out-Null
$out = Join-Path $dist "last-squad-standing-$Version.zip"; if (Test-Path $out) { Remove-Item $out -Force }
$files = Get-ChildItem $root -Recurse -File -Force | Where-Object { $_.FullName -notmatch '\\(dist|\.claude|\.git)\\' -and $_.FullName -notmatch '\\tools\\unused-tex\\' -and $_.FullName -notmatch '\\_tmp\\' }
$fs = [IO.File]::Open($out, [IO.FileMode]::Create); $arc = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Create); $raw = 0         # ($arc, not $zip: PowerShell names are not case sensitive and -Zip is the switch)
foreach ($f in $files) {
  $rel = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
  $level = if ($f.Extension -match '^\.(jpg|jpeg|png|glb|hdr|bin)$') { [IO.Compression.CompressionLevel]::Fastest } else { [IO.Compression.CompressionLevel]::Optimal }
  $e = $arc.CreateEntry($rel, $level); $e.LastWriteTime = $f.LastWriteTime
  $es = $e.Open(); $in = [IO.File]::OpenRead($f.FullName); $in.CopyTo($es); $in.Dispose(); $es.Dispose(); $raw += $f.Length
}
$arc.Dispose(); $fs.Dispose()
'{0}: {1} files, {2:N1} MB raw -> {3:N1} MB' -f (Split-Path $out -Leaf), $files.Count, ($raw / 1MB), ((Get-Item $out).Length / 1MB)
(Get-FileHash $out -Algorithm SHA256).Hash
