<#
  Wavefront OBJ (+ its .MTL) to GLB converter for flat-colour models such as the free Quaternius packs (nothing to install: it compiles tools\LodTool.cs on the fly).

  powershell -File tools\obj2glb.ps1 -In C:\downloads\Pistol_1.obj -OutDir assets\models\guns [-Scale 1]
  powershell -File tools\obj2glb.ps1 -In C:\downloads\OBJ -OutDir assets\models\guns        (a whole folder)

  One GLB per OBJ. Every MTL material becomes a PBR material with the MTL's diffuse colour; names containing "metal" get metallic, "wood" rough, "glass" smooth.
  The model keeps its own axes and size: orientation and scale are set in assets\models.json (or in the game code for guns).
#>
param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [double]$Scale = 1
)
$ErrorActionPreference = 'Stop'
if (-not ('Lss.LodRunner' -as [type])) {
  Add-Type -ReferencedAssemblies 'System.Web.Extensions' -TypeDefinition (Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'LodTool.cs'))
}
$src = (Resolve-Path -LiteralPath $In).Path
$files = if (Test-Path -LiteralPath $src -PathType Container) { Get-ChildItem -LiteralPath $src -Filter *.obj } else { Get-Item -LiteralPath $src }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$out = (Resolve-Path -LiteralPath $OutDir).Path
foreach ($f in $files) { Write-Output ([Lss.LodRunner]::ObjToGlb($f.FullName, (Join-Path $out ($f.BaseName + '.glb')), $Scale)) }
