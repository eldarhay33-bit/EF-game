<#
  Level-of-detail generator for the game's 3D props (no installs needed: it compiles tools\LodTool.cs on the fly).

  powershell -File tools\make-lods.ps1 -In C:\models\boulder.gltf -OutDir assets\models\ph [-Name boulder] [-Lod0 16000] [-Lod1 3500] [-Lod2 800] [-Split]

  Writes NAME.glb (the detailed model with its textures inside), NAME_lod1.glb and NAME_lod2.glb (geometry only, they use the textures of NAME.glb).
  -Lod0/-Lod1/-Lod2  triangles per object (0 = keep the original, -1 = skip that level)
  -Split             every top-level node of the file becomes its own object centred on the ground (rock sets, kits with several props)
  -MaxErr            stop simplifying when the cheapest remaining step would distort the shape more than this (default 5e-6; clean results show a worst error below ~3e-6,
                     garbage starts around 1e-1). A level may therefore end up with more triangles than asked for: thin or open shells (chests, crates) cannot be reduced that far.
  Then add  "lod": [dist1, dist2]  (metres) to the model's entry in assets\models.json: see docs\ADD-MODELS.md.
#>
param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$Name = '',
  [int]$Lod0 = 16000,
  [int]$Lod1 = 3500,
  [int]$Lod2 = 800,
  [switch]$Split,
  [double]$MaxErr = 5e-6
)
$ErrorActionPreference = 'Stop'
if (-not ('Lss.LodRunner' -as [type])) {
  Add-Type -ReferencedAssemblies 'System.Web.Extensions' -TypeDefinition (Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'LodTool.cs'))
}
$in = (Resolve-Path -LiteralPath $In).Path
New-Item -ItemType Directory -Force $OutDir | Out-Null
$out = (Resolve-Path -LiteralPath $OutDir).Path
Write-Output ([Lss.LodRunner]::Run($in, $out, $Name, $Lod0, $Lod1, $Lod2, [bool]$Split, $MaxErr))
