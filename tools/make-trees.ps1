# Prepares the trees of Quaternius' "Stylized Nature MegaKit" (Standard, CC0) for the game: assets/models/mk/
#   powershell -File tools\make-trees.ps1 -Zip <path to stylized_nature_megakitstandard.zip>
# The zip is downloaded data and is only READ here: the chosen glTF + bin files are extracted, the big PNG textures become small JPEG / PNG files (bark is opaque, the leaves keep their alpha),
# the bark materials lose their needless alpha test and double sides, and the file names inside each .gltf are pointed at the new pictures. Nothing from the zip is ever run.
param(
  [Parameter(Mandatory = $true)][string]$Zip,
  [string]$Out = (Join-Path $PSScriptRoot '..\assets\models\mk'),
  [int]$Size = 1024
)
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$Out = (Resolve-Path $Out).Path

$variants = 'Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5', 'CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5'
# picture named in the model -> [new file, kind, picture it is made from]  (jpg: opaque colour, jpgn: normal map, png: keeps its alpha). The broadleaf trees get the pack's WHITE leaf picture
# (Leaves_NormalTree): the game tints every tree itself (greens, and the odd autumn, golden or blossom one), a green leaf picture would only turn brown under an orange tint.
$pics = @{
  'Bark_NormalTree'        = @('bark_a.jpg', 'jpg', 'Bark_NormalTree');   'Bark_NormalTree_Normal' = @('bark_a_n.jpg', 'jpgn', 'Bark_NormalTree_Normal')
  'Leaf_Pine_C'            = @('leaf_pine.png', 'png', 'Leaf_Pine_C');    'Leaves_NormalTree_C'    = @('leaf_common.png', 'png', 'Leaves_NormalTree')
}

function Save-Pic($src, $dst, $kind, $size) {
  $im = [System.Drawing.Image]::FromFile($src)
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'; $g.CompositingMode = 'SourceCopy'; $g.SmoothingMode = 'HighQuality'
  $g.DrawImage($im, 0, 0, $size, $size); $g.Dispose(); $im.Dispose()
  if ($kind -eq 'png') { $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png) }
  else {
    $enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $ep = New-Object System.Drawing.Imaging.EncoderParameters(1); $q = if ($kind -eq 'jpgn') { 92 } else { 88 }
    $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$q)
    $bmp.Save($dst, $enc, $ep)
  }
  $bmp.Dispose()
}

$work = Join-Path ([System.IO.Path]::GetTempPath()) ('mk-' + [guid]::NewGuid().ToString('N').Substring(0, 8)); New-Item -ItemType Directory -Path $work | Out-Null
try {
  $z = [System.IO.Compression.ZipFile]::OpenRead($Zip)
  $want = @{}; foreach ($v in $variants) { $want["glTF/$v.gltf"] = $v + '.gltf'; $want["glTF/$v.bin"] = $v + '.bin' }
  foreach ($k in $pics.Keys) { $s = $pics[$k][2]; $want["glTF/$s.png"] = $s + '.png' }
  $want['License_Standard.txt'] = 'License_Standard.txt'
  foreach ($e in $z.Entries) { if ($want.ContainsKey($e.FullName)) { [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, (Join-Path $work $want[$e.FullName]), $true) } }
  $z.Dispose()

  $used = @{}
  foreach ($v in $variants) {
    $j = Get-Content (Join-Path $work "$v.gltf") -Raw | ConvertFrom-Json
    foreach ($im in $j.images) {
      if (-not $pics.ContainsKey($im.name)) { throw "$v uses a picture that is not in the list: $($im.name)" }
      $im.uri = $pics[$im.name][0]; $im.mimeType = if ($pics[$im.name][1] -eq 'png') { 'image/png' } else { 'image/jpeg' }; $used[$im.name] = $true
    }
    foreach ($m in $j.materials) { if ($m.name -like 'Bark_*') { $m.PSObject.Properties.Remove('alphaMode'); $m.PSObject.Properties.Remove('alphaCutoff'); $m.doubleSided = $false } }
    ($j | ConvertTo-Json -Depth 40 -Compress) | Set-Content -Path (Join-Path $Out "$v.gltf") -Encoding UTF8
    Copy-Item (Join-Path $work "$v.bin") (Join-Path $Out "$v.bin") -Force
  }
  foreach ($k in $used.Keys) { Save-Pic (Join-Path $work ($pics[$k][2] + '.png')) (Join-Path $Out $pics[$k][0]) $pics[$k][1] $Size }
  Copy-Item (Join-Path $work 'License_Standard.txt') (Join-Path $Out 'LICENSE-quaternius-stylized-nature-megakit.txt') -Force
}
finally { Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue }
Get-ChildItem $Out | ForEach-Object { '{0,10}  {1}' -f $_.Length, $_.Name }
'total {0:N2} MB' -f ((Get-ChildItem $Out | Measure-Object Length -Sum).Sum / 1MB)
