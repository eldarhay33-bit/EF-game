# Builds assets/models/q (the skeletal characters) from two CC0 packs by Quaternius (quaternius.itch.io, the free "Standard" versions):
#   Universal Base Characters (bodies with faces, eyes, 20 hair styles) and Universal Animation Library (43 clips on the same skeleton).
# -Src is a folder that holds the packs unzipped as  ubc\x  (Base Characters + Hairstyles) and  ual\x  (Unreal-Godot\*.glb).
# What it does: copies the glTF / bin files we use, rewrites their texture links to small JPEGs (1024 px, and 512 px in tex\s for phones) and puts the animation file next to them.
# The clothes and the gear are made in the game (src/entities/suit.js), nothing else is needed from the packs.
param([Parameter(Mandatory = $true)][string]$Src, [Parameter(Mandatory = $true)][string]$Dst)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$utf8 = New-Object Text.UTF8Encoding($false)
$jpgCodec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ubc = Join-Path $Src 'ubc\x'; $ual = Join-Path $Src 'ual\x'

function Save-Small($from, $to, $size) {
  if (Test-Path -LiteralPath $to) { return }
  $img = [Drawing.Image]::FromFile($from)
  try {
    $bmp = New-Object Drawing.Bitmap $size, $size, ([Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic; $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality; $g.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, $size, $size); $g.Dispose()
    $ep = New-Object Drawing.Imaging.EncoderParameters 1; $ep.Param[0] = New-Object Drawing.Imaging.EncoderParameter ([Drawing.Imaging.Encoder]::Quality), ([long]88)
    $bmp.Save($to, $jpgCodec, $ep); $bmp.Dispose()
  } finally { $img.Dispose() }
}

foreach ($sub in 'base', 'hair', 'tex', 'tex\s') { New-Item -ItemType Directory -Force -Path (Join-Path $Dst $sub) | Out-Null }

# every texture the glTF files point at -> tex\NAME.jpg (+ tex\s\NAME.jpg)
$texSrc = @{}
foreach ($dir in "$ubc\Base Characters\Godot - UE", "$ubc\Hairstyles\Rigged to Head Bone\glTF (Godot -Unreal)") {
  foreach ($f in Get-ChildItem -LiteralPath $dir -Filter *.png -File) { if (-not $texSrc.ContainsKey($f.BaseName)) { $texSrc[$f.BaseName] = $f.FullName } }
}
function Rewrite($srcGltf, $dstDir, $newName) {
  $t = [IO.File]::ReadAllText($srcGltf, $utf8); $oldBin = [IO.Path]::GetFileNameWithoutExtension($srcGltf) + '.bin'
  $t = $t.Replace('"uri": "' + $oldBin + '"', '"uri": "' + $newName + '.bin"').Replace('"uri":"' + $oldBin + '"', '"uri":"' + $newName + '.bin"')
  $t = [regex]::Replace($t, '"uri"\s*:\s*"([^"]+?)\.png"', { param($m) $n = $m.Groups[1].Value
    if (-not $texSrc.ContainsKey($n)) { $n = $n -replace '_png$', '' }                                   # the pack links T_Hair_1_Normal_png.png but ships T_Hair_1_Normal.png
    if (-not $texSrc.ContainsKey($n)) { throw "texture $($m.Groups[1].Value) not found for $srcGltf" }
    '"uri": "../tex/' + $n + '.jpg"' })
  [IO.File]::WriteAllText((Join-Path $dstDir ($newName + '.gltf')), $t, $utf8)
  Copy-Item -LiteralPath ([IO.Path]::ChangeExtension($srcGltf, '.bin')) -Destination (Join-Path $dstDir ($newName + '.bin')) -Force
  [regex]::Matches($t, '\.\./tex/([^"]+)\.jpg') | ForEach-Object { $_.Groups[1].Value }
}
$used = @{}
foreach ($g in 'm', 'f') { $name = if ($g -eq 'm') { 'Superhero_Male_FullBody' } else { 'Superhero_Female_FullBody' }; Rewrite "$ubc\Base Characters\Godot - UE\$name.gltf" "$Dst\base" $g | ForEach-Object { $used[$_] = 1 } }
foreach ($f in Get-ChildItem -LiteralPath "$ubc\Hairstyles\Rigged to Head Bone\glTF (Godot -Unreal)" -Filter *.gltf) { Rewrite $f.FullName "$Dst\hair" $f.BaseName | ForEach-Object { $used[$_] = 1 } }
foreach ($n in ($used.Keys | Sort-Object)) {
  Save-Small $texSrc[$n] (Join-Path $Dst "tex\$n.jpg") 1024
  Save-Small $texSrc[$n] (Join-Path $Dst "tex\s\$n.jpg") 512
}
Copy-Item -LiteralPath "$ual\Unreal-Godot\UAL1_Standard.glb" -Destination (Join-Path $Dst 'anim.glb') -Force
Copy-Item -LiteralPath "$ubc\License_Standard.txt" -Destination (Join-Path $Dst 'LICENSE-quaternius-base.txt') -Force
Copy-Item -LiteralPath "$ual\License.txt" -Destination (Join-Path $Dst 'LICENSE-quaternius-animations.txt') -Force
$sum = (Get-ChildItem -LiteralPath $Dst -Recurse -File | Measure-Object Length -Sum).Sum
'{0} textures, {1:N1} MB written to {2}' -f $used.Count, ($sum / 1MB), $Dst
