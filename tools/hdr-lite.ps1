# Halves the size of Radiance .hdr sky pictures (2048x1024 -> 1024x512) for phones: RLE decode, 2x2 box average in linear light, RLE encode. No network, no external tools.
param([Parameter(Mandatory = $true)][string]$InDir, [Parameter(Mandatory = $true)][string]$OutDir)
$ErrorActionPreference = 'Stop'
$src = @'
using System; using System.IO; using System.Collections.Generic; using System.Text;
public static class HdrLite {
  static string Line(byte[] b, ref int p) { int s = p; while (b[p] != 10) p++; string t = Encoding.ASCII.GetString(b, s, p - s); p++; return t; }
  public static void Process(string inPath, string outPath) {
    byte[] b = File.ReadAllBytes(inPath); int p = 0, w = 0, h = 0;
    while (Line(b, ref p).Length != 0) { }
    string[] t = Line(b, ref p).Split(' '); h = int.Parse(t[1]); w = int.Parse(t[3]);
    float[] px = new float[w * h * 3]; byte[] sc = new byte[w * 4];
    for (int y = 0; y < h; y++) {
      if (b[p] != 2 || b[p + 1] != 2 || (b[p + 2] & 0x80) != 0) throw new Exception("scanline " + y + " is not RLE");
      p += 4;
      for (int c = 0; c < 4; c++) {
        int x = 0;
        while (x < w) {
          int n = b[p++];
          if (n > 128) { n -= 128; byte v = b[p++]; for (int i = 0; i < n; i++) sc[(x++) * 4 + c] = v; }
          else { for (int i = 0; i < n; i++) sc[(x++) * 4 + c] = b[p++]; }
        }
      }
      for (int x = 0; x < w; x++) {
        int e = sc[x * 4 + 3]; float f = e == 0 ? 0f : (float)Math.Pow(2.0, e - 136);
        int o = (y * w + x) * 3; px[o] = sc[x * 4] * f; px[o + 1] = sc[x * 4 + 1] * f; px[o + 2] = sc[x * 4 + 2] * f;
      }
    }
    int w2 = w / 2, h2 = h / 2;
    List<byte> outb = new List<byte>(w2 * h2 / 2);
    outb.AddRange(Encoding.ASCII.GetBytes("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y " + h2 + " +X " + w2 + "\n"));
    byte[] os = new byte[w2 * 4];
    for (int y = 0; y < h2; y++) {
      for (int x = 0; x < w2; x++) {
        float r = 0, g = 0, bl = 0;
        for (int dy = 0; dy < 2; dy++) for (int dx = 0; dx < 2; dx++) { int o = ((y * 2 + dy) * w + x * 2 + dx) * 3; r += px[o]; g += px[o + 1]; bl += px[o + 2]; }
        r /= 4; g /= 4; bl /= 4; float mx = Math.Max(r, Math.Max(g, bl));
        if (mx < 1e-32f) { os[x * 4] = os[x * 4 + 1] = os[x * 4 + 2] = os[x * 4 + 3] = 0; continue; }
        int ex = (int)Math.Floor(Math.Log(mx, 2)) + 1; double m = mx / Math.Pow(2.0, ex); double v = m * 256.0 / mx;
        os[x * 4] = (byte)Math.Min(255, (int)(r * v)); os[x * 4 + 1] = (byte)Math.Min(255, (int)(g * v)); os[x * 4 + 2] = (byte)Math.Min(255, (int)(bl * v)); os[x * 4 + 3] = (byte)(ex + 128);
      }
      outb.Add(2); outb.Add(2); outb.Add((byte)(w2 >> 8)); outb.Add((byte)(w2 & 255));
      for (int c = 0; c < 4; c++) {
        int x = 0;
        while (x < w2) {
          int run = 1; while (x + run < w2 && run < 127 && os[(x + run) * 4 + c] == os[x * 4 + c]) run++;
          if (run >= 3) { outb.Add((byte)(128 + run)); outb.Add(os[x * 4 + c]); x += run; }
          else {
            int s = x, n = 0;
            while (x < w2 && n < 128) { int r2 = 1; while (x + r2 < w2 && r2 < 3 && os[(x + r2) * 4 + c] == os[x * 4 + c]) r2++; if (r2 >= 3) break; x++; n++; }
            outb.Add((byte)n); for (int i = 0; i < n; i++) outb.Add(os[(s + i) * 4 + c]);
          }
        }
      }
    }
    File.WriteAllBytes(outPath, outb.ToArray());
  }
}
'@
Add-Type -TypeDefinition $src -Language CSharp
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
foreach ($f in Get-ChildItem -LiteralPath $InDir -Filter *.hdr) {
  $dst = Join-Path $OutDir $f.Name
  [HdrLite]::Process($f.FullName, $dst)
  '{0}: {1:N1} MB -> {2:N1} MB' -f $f.Name, ($f.Length / 1MB), ((Get-Item $dst).Length / 1MB)
}
