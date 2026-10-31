// LOD generator for the game's GLB props (compiled on the fly by tools/make-lods.ps1; plain C# 5, no packages needed).
//   read a .gltf / .glb  ->  bake the node transforms  ->  merge primitives that share a material
//   ->  quadric edge-collapse simplification (seams stay closed: vertices are welded by position, UV / normal belong to the triangle corners)
//   ->  write NAME.glb (LOD0, textures embedded), NAME_lod1.glb, NAME_lod2.glb (geometry only, the game re-uses the LOD0 material by name).
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

namespace Lss
{
    public sealed class Prim
    {
        public string Node = "";
        public string Material = "";
        public int MaterialIndex = -1;
        public float[] Pos;
        public float[] Nrm;
        public float[] Uv;
        public int[] Idx;
        public int Tris { get { return Idx.Length / 3; } }
    }

    public sealed class Doc
    {
        public Dictionary<string, object> Json;
        public string Dir;
        public List<byte[]> Buffers = new List<byte[]>();
        public List<Prim> Prims = new List<Prim>();
    }

    // ------------------------------------------------------------------ glTF reading / writing
    public static class GltfIO
    {
        static double D(object o) { return Convert.ToDouble(o); }
        static int I(object o) { return Convert.ToInt32(o); }
        static Dictionary<string, object> O(object o) { return (Dictionary<string, object>)o; }
        static ArrayList A(object o)
        {
            ArrayList al = o as ArrayList; if (al != null) return al;
            object[] oa = o as object[]; if (oa != null) return new ArrayList(oa);
            throw new Exception("array expected");
        }
        static bool Has(Dictionary<string, object> d, string k) { return d.ContainsKey(k) && d[k] != null; }

        public static Doc Load(string path)
        {
            Doc doc = new Doc();
            doc.Dir = Path.GetDirectoryName(Path.GetFullPath(path));
            byte[] file = File.ReadAllBytes(path);
            string jsonText = null; byte[] glbBin = null;
            if (file.Length > 20 && file[0] == 0x67 && file[1] == 0x6C && file[2] == 0x54 && file[3] == 0x46)
            {
                int pos = 12;
                while (pos + 8 <= file.Length)
                {
                    int len = BitConverter.ToInt32(file, pos); uint type = BitConverter.ToUInt32(file, pos + 4); pos += 8;
                    if (type == 0x4E4F534A) jsonText = Encoding.UTF8.GetString(file, pos, len);
                    else if (type == 0x004E4942) { glbBin = new byte[len]; Buffer.BlockCopy(file, pos, glbBin, 0, len); }
                    pos += len;
                }
            }
            else jsonText = Encoding.UTF8.GetString(file);
            JavaScriptSerializer ser = new JavaScriptSerializer(); ser.MaxJsonLength = int.MaxValue; ser.RecursionLimit = 500;
            doc.Json = ser.Deserialize<Dictionary<string, object>>(jsonText);
            if (Has(doc.Json, "buffers"))
                foreach (object b in A(doc.Json["buffers"]))
                {
                    Dictionary<string, object> bd = O(b);
                    if (Has(bd, "uri")) doc.Buffers.Add(ReadUri(doc, (string)bd["uri"]));
                    else doc.Buffers.Add(glbBin);
                }
            int sceneIdx = Has(doc.Json, "scene") ? I(doc.Json["scene"]) : 0;
            Dictionary<string, object> scene = O(A(doc.Json["scenes"])[sceneIdx]);
            foreach (object n in A(scene["nodes"])) Walk(doc, I(n), Identity(), null);
            return doc;
        }

        static byte[] ReadUri(Doc doc, string uri)
        {
            if (uri.StartsWith("data:")) return Convert.FromBase64String(uri.Substring(uri.IndexOf(',') + 1));
            return File.ReadAllBytes(Path.Combine(doc.Dir, Uri.UnescapeDataString(uri).Replace('/', '\\')));
        }

        // ---- matrices (column major, like glTF)
        static double[] Identity() { double[] m = new double[16]; m[0] = m[5] = m[10] = m[15] = 1; return m; }
        static double[] Mul(double[] a, double[] b)
        {
            double[] r = new double[16];
            for (int j = 0; j < 4; j++)
                for (int i = 0; i < 4; i++)
                {
                    double s = 0;
                    for (int k = 0; k < 4; k++) s += a[k * 4 + i] * b[j * 4 + k];
                    r[j * 4 + i] = s;
                }
            return r;
        }
        static double[] NodeMatrix(Dictionary<string, object> n)
        {
            double[] r = new double[16];
            if (Has(n, "matrix")) { ArrayList m = A(n["matrix"]); for (int i = 0; i < 16; i++) r[i] = D(m[i]); return r; }
            double tx = 0, ty = 0, tz = 0, sx = 1, sy = 1, sz = 1, qx = 0, qy = 0, qz = 0, qw = 1;
            if (Has(n, "translation")) { ArrayList t = A(n["translation"]); tx = D(t[0]); ty = D(t[1]); tz = D(t[2]); }
            if (Has(n, "rotation")) { ArrayList q = A(n["rotation"]); qx = D(q[0]); qy = D(q[1]); qz = D(q[2]); qw = D(q[3]); }
            if (Has(n, "scale")) { ArrayList s = A(n["scale"]); sx = D(s[0]); sy = D(s[1]); sz = D(s[2]); }
            double xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
            r[0] = (1 - 2 * (yy + zz)) * sx; r[1] = (2 * (xy + wz)) * sx; r[2] = (2 * (xz - wy)) * sx;
            r[4] = (2 * (xy - wz)) * sy; r[5] = (1 - 2 * (xx + zz)) * sy; r[6] = (2 * (yz + wx)) * sy;
            r[8] = (2 * (xz + wy)) * sz; r[9] = (2 * (yz - wx)) * sz; r[10] = (1 - 2 * (xx + yy)) * sz;
            r[12] = tx; r[13] = ty; r[14] = tz; r[15] = 1;
            return r;
        }

        static void Walk(Doc doc, int ni, double[] parent, string top)
        {
            Dictionary<string, object> n = O(A(doc.Json["nodes"])[ni]);
            double[] w = Mul(parent, NodeMatrix(n));
            string name = Has(n, "name") ? (string)n["name"] : "node" + ni;
            if (top == null) top = name;
            if (Has(n, "mesh")) AddMesh(doc, I(n["mesh"]), w, top);
            if (Has(n, "children")) foreach (object c in A(n["children"])) Walk(doc, I(c), w, top);
        }

        // ---- accessors
        static int CompSize(int ct)
        {
            switch (ct) { case 5120: case 5121: return 1; case 5122: case 5123: return 2; case 5125: case 5126: return 4; }
            throw new Exception("unsupported component type " + ct);
        }
        static int NumComps(string t)
        {
            switch (t) { case "SCALAR": return 1; case "VEC2": return 2; case "VEC3": return 3; case "VEC4": return 4; }
            throw new Exception("unsupported accessor type " + t);
        }
        static double[] ReadAcc(Doc doc, int ai, out int comps)
        {
            Dictionary<string, object> acc = O(A(doc.Json["accessors"])[ai]);
            int ct = I(acc["componentType"]), count = I(acc["count"]); comps = NumComps((string)acc["type"]);
            bool norm = Has(acc, "normalized") && (bool)acc["normalized"];
            double[] vals = new double[count * comps];
            if (!Has(acc, "bufferView")) return vals;
            Dictionary<string, object> bv = O(A(doc.Json["bufferViews"])[I(acc["bufferView"])]);
            byte[] buf = doc.Buffers[I(bv["buffer"])];
            int off = (Has(bv, "byteOffset") ? I(bv["byteOffset"]) : 0) + (Has(acc, "byteOffset") ? I(acc["byteOffset"]) : 0);
            int cs = CompSize(ct), esz = cs * comps, stride = Has(bv, "byteStride") && I(bv["byteStride"]) > 0 ? I(bv["byteStride"]) : esz;
            for (int i = 0; i < count; i++)
                for (int c = 0; c < comps; c++)
                {
                    int p = off + i * stride + c * cs; double v;
                    switch (ct)
                    {
                        case 5126: v = BitConverter.ToSingle(buf, p); break;
                        case 5125: v = BitConverter.ToUInt32(buf, p); break;
                        case 5123: v = BitConverter.ToUInt16(buf, p); if (norm) v /= 65535.0; break;
                        case 5121: v = buf[p]; if (norm) v /= 255.0; break;
                        case 5122: v = BitConverter.ToInt16(buf, p); if (norm) v = Math.Max(v / 32767.0, -1.0); break;
                        default: v = (sbyte)buf[p]; if (norm) v = Math.Max(v / 127.0, -1.0); break;
                    }
                    vals[i * comps + c] = v;
                }
            return vals;
        }

        static void AddMesh(Doc doc, int mi, double[] w, string top)
        {
            Dictionary<string, object> mesh = O(A(doc.Json["meshes"])[mi]);
            foreach (object po in A(mesh["primitives"]))
            {
                Dictionary<string, object> p = O(po);
                if ((Has(p, "mode") ? I(p["mode"]) : 4) != 4) continue;
                Dictionary<string, object> at = O(p["attributes"]);
                int c;
                double[] pos = ReadAcc(doc, I(at["POSITION"]), out c); int nv = pos.Length / 3;
                double[] nrm = Has(at, "NORMAL") ? ReadAcc(doc, I(at["NORMAL"]), out c) : null;
                double[] uv = Has(at, "TEXCOORD_0") ? ReadAcc(doc, I(at["TEXCOORD_0"]), out c) : null;
                int[] idx;
                if (Has(p, "indices")) { double[] di = ReadAcc(doc, I(p["indices"]), out c); idx = new int[di.Length]; for (int i = 0; i < di.Length; i++) idx[i] = (int)di[i]; }
                else { idx = new int[nv]; for (int i = 0; i < nv; i++) idx[i] = i; }
                // 3x3 part: columns c0,c1,c2 ; the normal matrix is made of the cross products of the columns
                double c0x = w[0], c0y = w[1], c0z = w[2], c1x = w[4], c1y = w[5], c1z = w[6], c2x = w[8], c2y = w[9], c2z = w[10];
                double ax = c1y * c2z - c1z * c2y, ay = c1z * c2x - c1x * c2z, az = c1x * c2y - c1y * c2x;          // c1 x c2
                double bx = c2y * c0z - c2z * c0y, by = c2z * c0x - c2x * c0z, bz = c2x * c0y - c2y * c0x;          // c2 x c0
                double cx = c0y * c1z - c0z * c1y, cy = c0z * c1x - c0x * c1z, cz = c0x * c1y - c0y * c1x;          // c0 x c1
                double det = c0x * ax + c0y * ay + c0z * az, sgn = det < 0 ? -1 : 1;
                Prim pr = new Prim(); pr.Node = top;
                pr.Pos = new float[nv * 3]; pr.Idx = idx;
                if (nrm != null) pr.Nrm = new float[nv * 3];
                if (uv != null) pr.Uv = new float[nv * 2];
                for (int i = 0; i < nv; i++)
                {
                    double x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
                    pr.Pos[i * 3] = (float)(w[0] * x + w[4] * y + w[8] * z + w[12]);
                    pr.Pos[i * 3 + 1] = (float)(w[1] * x + w[5] * y + w[9] * z + w[13]);
                    pr.Pos[i * 3 + 2] = (float)(w[2] * x + w[6] * y + w[10] * z + w[14]);
                    if (nrm != null)
                    {
                        double nx = nrm[i * 3], ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2];
                        double mx = sgn * (nx * ax + ny * bx + nz * cx), my = sgn * (nx * ay + ny * by + nz * cy), mz = sgn * (nx * az + ny * bz + nz * cz);
                        double l = Math.Sqrt(mx * mx + my * my + mz * mz); if (l < 1e-12) l = 1;
                        pr.Nrm[i * 3] = (float)(mx / l); pr.Nrm[i * 3 + 1] = (float)(my / l); pr.Nrm[i * 3 + 2] = (float)(mz / l);
                    }
                    if (uv != null) { pr.Uv[i * 2] = (float)uv[i * 2]; pr.Uv[i * 2 + 1] = (float)uv[i * 2 + 1]; }
                }
                if (det < 0) for (int t = 0; t + 2 < idx.Length; t += 3) { int s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
                if (nrm == null) pr.Nrm = SmoothNormals(pr);
                pr.MaterialIndex = Has(p, "material") ? I(p["material"]) : -1;
                pr.Material = "material";
                if (pr.MaterialIndex >= 0 && Has(doc.Json, "materials"))
                {
                    Dictionary<string, object> md = O(A(doc.Json["materials"])[pr.MaterialIndex]);
                    if (Has(md, "name")) pr.Material = (string)md["name"];
                }
                doc.Prims.Add(pr);
            }
        }

        static float[] SmoothNormals(Prim p)
        {
            int nv = p.Pos.Length / 3; double[] acc = new double[nv * 3];
            for (int t = 0; t + 2 < p.Idx.Length; t += 3)
            {
                int a = p.Idx[t], b = p.Idx[t + 1], c = p.Idx[t + 2];
                double ux = p.Pos[b * 3] - p.Pos[a * 3], uy = p.Pos[b * 3 + 1] - p.Pos[a * 3 + 1], uz = p.Pos[b * 3 + 2] - p.Pos[a * 3 + 2];
                double vx = p.Pos[c * 3] - p.Pos[a * 3], vy = p.Pos[c * 3 + 1] - p.Pos[a * 3 + 1], vz = p.Pos[c * 3 + 2] - p.Pos[a * 3 + 2];
                double nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
                foreach (int k in new int[] { a, b, c }) { acc[k * 3] += nx; acc[k * 3 + 1] += ny; acc[k * 3 + 2] += nz; }
            }
            float[] r = new float[nv * 3];
            for (int i = 0; i < nv; i++)
            {
                double l = Math.Sqrt(acc[i * 3] * acc[i * 3] + acc[i * 3 + 1] * acc[i * 3 + 1] + acc[i * 3 + 2] * acc[i * 3 + 2]); if (l < 1e-12) { r[i * 3 + 1] = 1; continue; }
                r[i * 3] = (float)(acc[i * 3] / l); r[i * 3 + 1] = (float)(acc[i * 3 + 1] / l); r[i * 3 + 2] = (float)(acc[i * 3 + 2] / l);
            }
            return r;
        }

        // ---- writing
        sealed class BinBuilder
        {
            public MemoryStream Bin = new MemoryStream();
            public ArrayList Views = new ArrayList();
            public ArrayList Accessors = new ArrayList();
            public int AddView(byte[] data, int target)
            {
                while (Bin.Position % 4 != 0) Bin.WriteByte(0);
                int off = (int)Bin.Position; Bin.Write(data, 0, data.Length);
                Dictionary<string, object> v = new Dictionary<string, object>();
                v["buffer"] = 0; v["byteOffset"] = off; v["byteLength"] = data.Length; if (target != 0) v["target"] = target;
                Views.Add(v); return Views.Count - 1;
            }
            public int AddAccessor(int view, int comp, int count, string type, double[] min, double[] max)
            {
                Dictionary<string, object> a = new Dictionary<string, object>();
                a["bufferView"] = view; a["componentType"] = comp; a["count"] = count; a["type"] = type;
                if (min != null) { ArrayList mn = new ArrayList(), mx = new ArrayList(); for (int i = 0; i < min.Length; i++) { mn.Add(min[i]); mx.Add(max[i]); } a["min"] = mn; a["max"] = mx; }
                Accessors.Add(a); return Accessors.Count - 1;
            }
        }

        static byte[] Bytes(float[] f) { byte[] b = new byte[f.Length * 4]; Buffer.BlockCopy(f, 0, b, 0, b.Length); return b; }

        // groups[i] = primitives of one object (already merged by material); names[i] = node name; shifts[i] = offset added to its positions (or null)
        public static void Write(string path, Doc src, List<List<Prim>> groups, List<string> names, List<double[]> shifts, bool textures)
        {
            Write(path, src, groups, names, shifts, textures, null);
        }

        // matInfo (geometry-only files): material name -> { r, g, b, metallic, roughness } (colours are linear, like glTF's baseColorFactor)
        public static void Write(string path, Doc src, List<List<Prim>> groups, List<string> names, List<double[]> shifts, bool textures, Dictionary<string, double[]> matInfo)
        {
            BinBuilder bb = new BinBuilder();
            Dictionary<string, object> root = new Dictionary<string, object>();
            Dictionary<string, object> asset = new Dictionary<string, object>(); asset["version"] = "2.0"; asset["generator"] = "last-squad-standing lod tool"; root["asset"] = asset;
            ArrayList materials = new ArrayList(); Dictionary<string, int> matIdx = new Dictionary<string, int>();
            if (textures && Has(src.Json, "materials"))
            {
                materials = A(src.Json["materials"]);
                if (Has(src.Json, "textures")) root["textures"] = src.Json["textures"];
                if (Has(src.Json, "samplers")) root["samplers"] = src.Json["samplers"];
                if (Has(src.Json, "extensionsUsed")) root["extensionsUsed"] = src.Json["extensionsUsed"];
                if (Has(src.Json, "images"))
                {
                    ArrayList images = new ArrayList();
                    foreach (object io in A(src.Json["images"]))
                    {
                        Dictionary<string, object> im = O(io), ni = new Dictionary<string, object>();
                        byte[] data; string mime = Has(im, "mimeType") ? (string)im["mimeType"] : null;
                        if (Has(im, "uri")) { string u = (string)im["uri"]; data = ReadUri(src, u); if (mime == null) mime = u.ToLower().EndsWith(".png") ? "image/png" : "image/jpeg"; }
                        else { Dictionary<string, object> bv = O(A(src.Json["bufferViews"])[I(im["bufferView"])]); byte[] sb = src.Buffers[I(bv["buffer"])]; data = new byte[I(bv["byteLength"])]; Buffer.BlockCopy(sb, Has(bv, "byteOffset") ? I(bv["byteOffset"]) : 0, data, 0, data.Length); if (mime == null) mime = "image/jpeg"; }
                        ni["bufferView"] = bb.AddView(data, 0); ni["mimeType"] = mime; if (Has(im, "name")) ni["name"] = im["name"];
                        images.Add(ni);
                    }
                    root["images"] = images;
                }
            }
            ArrayList meshes = new ArrayList(), nodes = new ArrayList(), sceneNodes = new ArrayList();
            for (int g = 0; g < groups.Count; g++)
            {
                ArrayList prims = new ArrayList();
                foreach (Prim p in groups[g])
                {
                    double[] sh = shifts != null && shifts[g] != null ? shifts[g] : new double[3];
                    int nv = p.Pos.Length / 3; float[] pos = new float[nv * 3];
                    double[] mn = { 1e30, 1e30, 1e30 }, mx = { -1e30, -1e30, -1e30 };
                    for (int i = 0; i < nv; i++)
                        for (int k = 0; k < 3; k++) { float v = (float)(p.Pos[i * 3 + k] + sh[k]); pos[i * 3 + k] = v; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
                    Dictionary<string, object> attrs = new Dictionary<string, object>();
                    attrs["POSITION"] = bb.AddAccessor(bb.AddView(Bytes(pos), 34962), 5126, nv, "VEC3", mn, mx);
                    if (p.Nrm != null) attrs["NORMAL"] = bb.AddAccessor(bb.AddView(Bytes(p.Nrm), 34962), 5126, nv, "VEC3", null, null);
                    if (p.Uv != null) attrs["TEXCOORD_0"] = bb.AddAccessor(bb.AddView(Bytes(p.Uv), 34962), 5126, nv, "VEC2", null, null);
                    byte[] ib; int ict; if (nv < 65535) { ib = new byte[p.Idx.Length * 2]; for (int i = 0; i < p.Idx.Length; i++) { ushort u = (ushort)p.Idx[i]; ib[i * 2] = (byte)(u & 255); ib[i * 2 + 1] = (byte)(u >> 8); } ict = 5123; } else { ib = new byte[p.Idx.Length * 4]; Buffer.BlockCopy(p.Idx, 0, ib, 0, ib.Length); ict = 5125; }
                    Dictionary<string, object> pd = new Dictionary<string, object>();
                    pd["attributes"] = attrs; pd["indices"] = bb.AddAccessor(bb.AddView(ib, 34963), ict, p.Idx.Length, "SCALAR", null, null); pd["mode"] = 4;
                    if (textures && p.MaterialIndex >= 0) pd["material"] = p.MaterialIndex;
                    else if (!textures)
                    {
                        if (!matIdx.ContainsKey(p.Material))
                        {
                            Dictionary<string, object> m = new Dictionary<string, object>(), pbr = new Dictionary<string, object>();
                            m["name"] = p.Material; pbr["metallicFactor"] = 0.0; pbr["roughnessFactor"] = 1.0; m["pbrMetallicRoughness"] = pbr;
                            double[] mi; if (matInfo != null && matInfo.TryGetValue(p.Material, out mi)) { ArrayList bc = new ArrayList(); bc.Add(mi[0]); bc.Add(mi[1]); bc.Add(mi[2]); bc.Add(1.0); pbr["baseColorFactor"] = bc; pbr["metallicFactor"] = mi[3]; pbr["roughnessFactor"] = mi[4]; }
                            matIdx[p.Material] = materials.Count; materials.Add(m);
                        }
                        pd["material"] = matIdx[p.Material];
                    }
                    prims.Add(pd);
                }
                Dictionary<string, object> md = new Dictionary<string, object>(); md["name"] = names[g]; md["primitives"] = prims; meshes.Add(md);
                Dictionary<string, object> nd = new Dictionary<string, object>(); nd["name"] = names[g]; nd["mesh"] = meshes.Count - 1; nodes.Add(nd); sceneNodes.Add(nodes.Count - 1);
            }
            root["meshes"] = meshes; root["nodes"] = nodes; if (materials.Count > 0) root["materials"] = materials;
            Dictionary<string, object> sc = new Dictionary<string, object>(); sc["nodes"] = sceneNodes;
            ArrayList scenes = new ArrayList(); scenes.Add(sc); root["scenes"] = scenes; root["scene"] = 0;
            root["accessors"] = bb.Accessors; root["bufferViews"] = bb.Views;
            while (bb.Bin.Position % 4 != 0) bb.Bin.WriteByte(0);
            ArrayList bufs = new ArrayList(); Dictionary<string, object> b0 = new Dictionary<string, object>(); b0["byteLength"] = (int)bb.Bin.Length; bufs.Add(b0); root["buffers"] = bufs;
            JavaScriptSerializer ser = new JavaScriptSerializer(); ser.MaxJsonLength = int.MaxValue;
            byte[] jb = Encoding.UTF8.GetBytes(ser.Serialize(root)); int jpad = (4 - jb.Length % 4) % 4;
            byte[] bin = bb.Bin.ToArray();
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path)));
            using (FileStream fs = File.Create(path))
            using (BinaryWriter w = new BinaryWriter(fs))
            {
                w.Write((uint)0x46546C67); w.Write((uint)2); w.Write((uint)(12 + 8 + jb.Length + jpad + 8 + bin.Length));
                w.Write((uint)(jb.Length + jpad)); w.Write((uint)0x4E4F534A); w.Write(jb); for (int i = 0; i < jpad; i++) w.Write((byte)32);
                w.Write((uint)bin.Length); w.Write((uint)0x004E4942); w.Write(bin);
            }
        }
    }

    // ------------------------------------------------------------------ simplification
    public static class Simplifier
    {
        struct PosKey : IEquatable<PosKey>
        {
            public int X, Y, Z;
            public bool Equals(PosKey o) { return X == o.X && Y == o.Y && Z == o.Z; }
            public override bool Equals(object o) { return o is PosKey && Equals((PosKey)o); }
            public override int GetHashCode() { unchecked { return (X * 73856093) ^ (Y * 19349663) ^ (Z * 83492791); } }
        }
        struct Cand { public double Cost; public int U, V, VerU, VerV; }
        sealed class Heap
        {
            Cand[] a = new Cand[4096]; int n;
            public int Count { get { return n; } }
            public void Push(Cand c)
            {
                if (n == a.Length) Array.Resize(ref a, n * 2);
                int i = n++;
                while (i > 0) { int p = (i - 1) >> 1; if (a[p].Cost <= c.Cost) break; a[i] = a[p]; i = p; }
                a[i] = c;
            }
            public Cand Pop()
            {
                Cand top = a[0]; Cand last = a[--n];
                if (n > 0)
                {
                    int i = 0;
                    while (true)
                    {
                        int l = 2 * i + 1; if (l >= n) break;
                        int r = l + 1, m = (r < n && a[r].Cost < a[l].Cost) ? r : l;
                        if (a[m].Cost >= last.Cost) break;
                        a[i] = a[m]; i = m;
                    }
                    a[i] = last;
                }
                return top;
            }
        }

        static int Bits(float f) { if (f == 0f) f = 0f; return BitConverter.ToInt32(BitConverter.GetBytes(f), 0); }
        static void AddPlane(double[] Q, int v, double a, double b, double c, double d, double w)
        {
            int o = v * 10;
            Q[o] += w * a * a; Q[o + 1] += w * a * b; Q[o + 2] += w * a * c; Q[o + 3] += w * a * d;
            Q[o + 4] += w * b * b; Q[o + 5] += w * b * c; Q[o + 6] += w * b * d;
            Q[o + 7] += w * c * c; Q[o + 8] += w * c * d; Q[o + 9] += w * d * d;
        }
        static double Eval(double[] Q, int v, double x, double y, double z)
        {
            int o = v * 10;
            return Q[o] * x * x + 2 * Q[o + 1] * x * y + 2 * Q[o + 2] * x * z + 2 * Q[o + 3] * x + Q[o + 4] * y * y + 2 * Q[o + 5] * y * z + 2 * Q[o + 6] * y + Q[o + 7] * z * z + 2 * Q[o + 8] * z + Q[o + 9];
        }

        public static double LastCost;        // largest quadric error that was accepted by the last Run (for the log)

        // stops early (result has more than 'target' triangles) when the cheapest remaining collapse would cost more than maxErr
        public static Prim Run(Prim src, int target, double maxErr)
        {
            int T0 = src.Idx.Length / 3; LastCost = 0;
            if (T0 <= target) return src;
            int nA = src.Pos.Length / 3; bool hasUv = src.Uv != null;

            // ---- weld by position (normalised to a unit-size box)
            double minx = 1e30, miny = 1e30, minz = 1e30, maxx = -1e30, maxy = -1e30, maxz = -1e30;
            for (int i = 0; i < nA; i++)
            {
                double x = src.Pos[i * 3], y = src.Pos[i * 3 + 1], z = src.Pos[i * 3 + 2];
                if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; if (z < minz) minz = z; if (z > maxz) maxz = z;
            }
            double cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, cz = (minz + maxz) / 2;
            double diag = Math.Sqrt((maxx - minx) * (maxx - minx) + (maxy - miny) * (maxy - miny) + (maxz - minz) * (maxz - minz)); if (diag < 1e-9) return src;
            double sc = 1.0 / diag;
            Dictionary<PosKey, int> map = new Dictionary<PosKey, int>(nA);
            int[] pid = new int[nA]; List<double> pl = new List<double>(nA * 3); int np = 0;
            for (int i = 0; i < nA; i++)
            {
                PosKey k = new PosKey(); k.X = Bits(src.Pos[i * 3]); k.Y = Bits(src.Pos[i * 3 + 1]); k.Z = Bits(src.Pos[i * 3 + 2]);
                int id;
                if (!map.TryGetValue(k, out id)) { id = np++; map[k] = id; pl.Add((src.Pos[i * 3] - cx) * sc); pl.Add((src.Pos[i * 3 + 1] - cy) * sc); pl.Add((src.Pos[i * 3 + 2] - cz) * sc); }
                pid[i] = id;
            }
            double[] P = pl.ToArray();

            // ---- triangles (position ids + the corner's own attribute vertex)
            int[] tp = new int[T0 * 3], ta = new int[T0 * 3]; int T = 0;
            for (int t = 0; t < T0; t++)
            {
                int a0 = src.Idx[t * 3], a1 = src.Idx[t * 3 + 1], a2 = src.Idx[t * 3 + 2];
                int p0 = pid[a0], p1 = pid[a1], p2 = pid[a2];
                if (p0 == p1 || p1 == p2 || p0 == p2) continue;
                tp[T * 3] = p0; tp[T * 3 + 1] = p1; tp[T * 3 + 2] = p2; ta[T * 3] = a0; ta[T * 3 + 1] = a1; ta[T * 3 + 2] = a2; T++;
            }
            bool[] alive = new bool[T]; for (int t = 0; t < T; t++) alive[t] = true;
            int aliveT = T;
            List<int>[] vt = new List<int>[np];
            for (int t = 0; t < T; t++) for (int k = 0; k < 3; k++) { int v = tp[t * 3 + k]; if (vt[v] == null) vt[v] = new List<int>(8); vt[v].Add(t); }

            // typical UV edge length: corners may follow a surviving vertex as long as their UV stays near
            double uvTol = 0;
            if (hasUv)
            {
                double sum = 0; int cnt = 0;
                for (int t = 0; t < T; t += 3) for (int k = 0; k < 3; k++) { int a = ta[t * 3 + k], b = ta[t * 3 + (k + 1) % 3]; double du = src.Uv[a * 2] - src.Uv[b * 2], dv = src.Uv[a * 2 + 1] - src.Uv[b * 2 + 1]; sum += Math.Sqrt(du * du + dv * dv); cnt++; }
                uvTol = 4.0 * sum / Math.Max(1, cnt);
            }

            // ---- quadrics (area weighted face planes + strong planes along open borders)
            double[] Q = new double[np * 10], W = new double[np];
            Dictionary<long, int> ecount = new Dictionary<long, int>(T * 2);
            for (int t = 0; t < T; t++)
            {
                int a = tp[t * 3], b = tp[t * 3 + 1], c = tp[t * 3 + 2];
                double ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
                double nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.Sqrt(nx * nx + ny * ny + nz * nz);
                if (l > 1e-18)
                {
                    nx /= l; ny /= l; nz /= l; double d = -(nx * P[a * 3] + ny * P[a * 3 + 1] + nz * P[a * 3 + 2]), w = l * 0.5;
                    AddPlane(Q, a, nx, ny, nz, d, w); AddPlane(Q, b, nx, ny, nz, d, w); AddPlane(Q, c, nx, ny, nz, d, w); W[a] += w; W[b] += w; W[c] += w;
                }
                for (int k = 0; k < 3; k++) { int e0 = tp[t * 3 + k], e1 = tp[t * 3 + (k + 1) % 3]; long key = e0 < e1 ? (long)e0 * np + e1 : (long)e1 * np + e0; int cc; ecount.TryGetValue(key, out cc); ecount[key] = cc + 1; }
            }
            for (int t = 0; t < T; t++)
            {
                int a = tp[t * 3], b = tp[t * 3 + 1], c = tp[t * 3 + 2];
                double ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
                double nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.Sqrt(nx * nx + ny * ny + nz * nz); if (l < 1e-18) continue; nx /= l; ny /= l; nz /= l;
                for (int k = 0; k < 3; k++)
                {
                    int e0 = tp[t * 3 + k], e1 = tp[t * 3 + (k + 1) % 3]; long key = e0 < e1 ? (long)e0 * np + e1 : (long)e1 * np + e0;
                    if (ecount[key] != 1) continue;
                    double ex = P[e1 * 3] - P[e0 * 3], ey = P[e1 * 3 + 1] - P[e0 * 3 + 1], ez = P[e1 * 3 + 2] - P[e0 * 3 + 2], el = Math.Sqrt(ex * ex + ey * ey + ez * ez); if (el < 1e-18) continue;
                    double bx = ey * nz - ez * ny, by = ez * nx - ex * nz, bz = ex * ny - ey * nx, bl = Math.Sqrt(bx * bx + by * by + bz * bz); if (bl < 1e-18) continue; bx /= bl; by /= bl; bz /= bl;
                    double d = -(bx * P[e0 * 3] + by * P[e0 * 3 + 1] + bz * P[e0 * 3 + 2]), w = 100.0 * el * el;
                    AddPlane(Q, e0, bx, by, bz, d, w); AddPlane(Q, e1, bx, by, bz, d, w);
                }
            }

            int[] ver = new int[np]; bool[] dead = new bool[np]; int[] markA = new int[np], markB = new int[np]; int stamp = 0;
            Heap heap = new Heap();

            Func<int, int, double> cost = delegate(int u, int v)
            {
                double x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
                double dx = x - P[u * 3], dy = y - P[u * 3 + 1], dz = z - P[u * 3 + 2];
                return Eval(Q, u, x, y, z) + Eval(Q, v, x, y, z) + 1e-3 * (W[u] + W[v]) * (dx * dx + dy * dy + dz * dz);
            };
            Action<int, int> push = delegate(int u, int v)
            {
                Cand c = new Cand(); c.Cost = cost(u, v); c.U = u; c.V = v; c.VerU = ver[u]; c.VerV = ver[v]; heap.Push(c);
            };
            Func<int, List<int>> neighbours = delegate(int v)
            {
                List<int> res = new List<int>(); stamp++;
                List<int> tl = vt[v]; if (tl == null) return res;
                for (int i = 0; i < tl.Count; i++) { int t = tl[i]; if (!alive[t]) continue; for (int k = 0; k < 3; k++) { int w = tp[t * 3 + k]; if (w != v && markA[w] != stamp) { markA[w] = stamp; res.Add(w); } } }
                return res;
            };
            Func<int, int, int> sharedTris = delegate(int u, int v)
            {
                int s = 0; List<int> tl = vt[u]; if (tl == null) return 0;
                for (int i = 0; i < tl.Count; i++) { int t = tl[i]; if (!alive[t]) continue; if (tp[t * 3] == v || tp[t * 3 + 1] == v || tp[t * 3 + 2] == v) s++; }
                return s;
            };
            Func<int, bool> isBorder = delegate(int v)
            {
                List<int> nb = neighbours(v);
                for (int i = 0; i < nb.Count; i++) if (sharedTris(v, nb[i]) == 1) return true;
                return false;
            };

            // initial edges
            HashSet<long> seen = new HashSet<long>();
            for (int t = 0; t < T; t++)
                for (int k = 0; k < 3; k++)
                {
                    int e0 = tp[t * 3 + k], e1 = tp[t * 3 + (k + 1) % 3]; long key = e0 < e1 ? (long)e0 * np + e1 : (long)e1 * np + e0;
                    if (seen.Add(key)) { push(e0, e1); push(e1, e0); }
                }

            while (aliveT > target && heap.Count > 0)
            {
                Cand c = heap.Pop(); int u = c.U, v = c.V;
                if (dead[u] || dead[v] || ver[u] != c.VerU || ver[v] != c.VerV) continue;
                if (c.Cost > maxErr) break;

                // --- is the collapse u -> v allowed?
                int shared = sharedTris(u, v);
                if (shared < 1 || shared > 2) continue;
                bool edgeBorder = shared == 1;
                if (isBorder(u) && !(edgeBorder && isBorder(v))) continue;           // border points may only slide along the border
                // link condition: the only common neighbours are the tips of the shared triangles
                stamp++; int stU = stamp;
                { List<int> tl = vt[u]; for (int i = 0; i < tl.Count; i++) { int t = tl[i]; if (!alive[t]) continue; for (int k = 0; k < 3; k++) { int w = tp[t * 3 + k]; if (w != u) markA[w] = stU; } } }
                int common = 0; stamp++; int stV = stamp;
                { List<int> tl = vt[v]; for (int i = 0; i < tl.Count; i++) { int t = tl[i]; if (!alive[t]) continue; for (int k = 0; k < 3; k++) { int w = tp[t * 3 + k]; if (w != v && w != u && markA[w] == stU && markB[w] != stV) { markB[w] = stV; common++; } } } }
                if (common != shared) continue;
                // no flipped / collapsed triangles around u
                bool ok = true; double pvx = P[v * 3], pvy = P[v * 3 + 1], pvz = P[v * 3 + 2];
                {
                    List<int> tl = vt[u];
                    for (int i = 0; i < tl.Count && ok; i++)
                    {
                        int t = tl[i]; if (!alive[t]) continue;
                        int p0 = tp[t * 3], p1 = tp[t * 3 + 1], p2 = tp[t * 3 + 2]; if (p0 == v || p1 == v || p2 == v) continue;
                        double ax = P[p0 * 3], ay = P[p0 * 3 + 1], az = P[p0 * 3 + 2], bx = P[p1 * 3], by = P[p1 * 3 + 1], bz = P[p1 * 3 + 2], cx2 = P[p2 * 3], cy2 = P[p2 * 3 + 1], cz2 = P[p2 * 3 + 2];
                        double ox = (by - ay) * (cz2 - az) - (bz - az) * (cy2 - ay), oy = (bz - az) * (cx2 - ax) - (bx - ax) * (cz2 - az), oz = (bx - ax) * (cy2 - ay) - (by - ay) * (cx2 - ax);
                        if (p0 == u) { ax = pvx; ay = pvy; az = pvz; } else if (p1 == u) { bx = pvx; by = pvy; bz = pvz; } else { cx2 = pvx; cy2 = pvy; cz2 = pvz; }
                        double nx = (by - ay) * (cz2 - az) - (bz - az) * (cy2 - ay), ny = (bz - az) * (cx2 - ax) - (bx - ax) * (cz2 - az), nz = (bx - ax) * (cy2 - ay) - (by - ay) * (cx2 - ax);
                        double lo = Math.Sqrt(ox * ox + oy * oy + oz * oz), ln = Math.Sqrt(nx * nx + ny * ny + nz * nz);
                        if (ln < 1e-18 || lo < 1e-18) { ok = false; break; }
                        if ((ox * nx + oy * ny + oz * nz) / (lo * ln) < 0.2) ok = false;
                    }
                }
                if (!ok) continue;

                // --- collapse u -> v
                if (c.Cost > LastCost) LastCost = c.Cost;
                List<int> attrsV = new List<int>();
                if (hasUv)
                {
                    List<int> tv = vt[v];
                    for (int i = 0; i < tv.Count; i++) { int t = tv[i]; if (!alive[t]) continue; for (int k = 0; k < 3; k++) if (tp[t * 3 + k] == v) { int at = ta[t * 3 + k]; if (!attrsV.Contains(at)) attrsV.Add(at); } }
                }
                List<int> tu = vt[u];
                for (int i = 0; i < tu.Count; i++)
                {
                    int t = tu[i]; if (!alive[t]) continue;
                    if (tp[t * 3] == v || tp[t * 3 + 1] == v || tp[t * 3 + 2] == v) { alive[t] = false; aliveT--; continue; }
                    for (int k = 0; k < 3; k++)
                        if (tp[t * 3 + k] == u)
                        {
                            tp[t * 3 + k] = v;
                            if (hasUv && attrsV.Count > 0)
                            {
                                int ca = ta[t * 3 + k], best = -1; double bd = 1e30;
                                for (int j = 0; j < attrsV.Count; j++) { int av = attrsV[j]; double du = src.Uv[av * 2] - src.Uv[ca * 2], dv = src.Uv[av * 2 + 1] - src.Uv[ca * 2 + 1], dd = du * du + dv * dv; if (dd < bd) { bd = dd; best = av; } }
                                if (best >= 0 && Math.Sqrt(bd) < uvTol) ta[t * 3 + k] = best;
                            }
                            break;
                        }
                    vt[v].Add(t);
                }
                vt[u] = null; dead[u] = true; ver[u]++;
                for (int i = 0; i < 10; i++) Q[v * 10 + i] += Q[u * 10 + i];
                W[v] += W[u]; ver[v]++;
                vt[v].RemoveAll(delegate(int t) { return !alive[t]; });
                List<int> nbs = neighbours(v);
                for (int i = 0; i < nbs.Count; i++) { push(v, nbs[i]); push(nbs[i], v); }
            }

            // ---- output: one vertex per distinct (position, attribute) pair
            Dictionary<long, int> vmap = new Dictionary<long, int>(); List<float> op = new List<float>(), on = new List<float>(), ou = new List<float>(); List<int> oi = new List<int>();
            for (int t = 0; t < T; t++)
            {
                if (!alive[t]) continue;
                for (int k = 0; k < 3; k++)
                {
                    int p = tp[t * 3 + k], a = ta[t * 3 + k]; long key = (long)p * nA + a; int id;
                    if (!vmap.TryGetValue(key, out id))
                    {
                        id = op.Count / 3; vmap[key] = id;
                        op.Add((float)(P[p * 3] / sc + cx)); op.Add((float)(P[p * 3 + 1] / sc + cy)); op.Add((float)(P[p * 3 + 2] / sc + cz));
                        if (src.Nrm != null) { on.Add(src.Nrm[a * 3]); on.Add(src.Nrm[a * 3 + 1]); on.Add(src.Nrm[a * 3 + 2]); }
                        if (hasUv) { ou.Add(src.Uv[a * 2]); ou.Add(src.Uv[a * 2 + 1]); }
                    }
                    oi.Add(id);
                }
            }
            Prim r = new Prim(); r.Node = src.Node; r.Material = src.Material; r.MaterialIndex = src.MaterialIndex;
            r.Pos = op.ToArray(); r.Nrm = src.Nrm != null ? on.ToArray() : null; r.Uv = hasUv ? ou.ToArray() : null; r.Idx = oi.ToArray();
            return r;
        }
    }

    // ------------------------------------------------------------------ GLB trimmer: keep only the meshes / animations a game needs, drop everything else and compact the binary data
    public static class GlbPrune
    {
        static Dictionary<string, object> O(object o) { return (Dictionary<string, object>)o; }
        static ArrayList A(object o) { ArrayList al = o as ArrayList; if (al != null) return al; object[] oa = o as object[]; if (oa != null) return new ArrayList(oa); throw new Exception("array expected"); }
        static int I(object o) { return Convert.ToInt32(o); }

        // keepAnims: null = all, "" = none, "A,B" = those clip names.  keepMeshes: null = all, "" = none, "Knight_,Cape" = mesh nodes whose name starts with one of these.
        public static string Run(string inPath, string outPath, string keepAnims, string keepMeshes, bool dropMaterials)
        {
            byte[] file = File.ReadAllBytes(inPath); string jsonText = null; byte[] binData = null; int pos = 12;
            while (pos + 8 <= file.Length)
            {
                int len = BitConverter.ToInt32(file, pos); uint type = BitConverter.ToUInt32(file, pos + 4); pos += 8;
                if (type == 0x4E4F534A) jsonText = Encoding.UTF8.GetString(file, pos, len); else if (type == 0x004E4942) { binData = new byte[len]; Buffer.BlockCopy(file, pos, binData, 0, len); }
                pos += len;
            }
            JavaScriptSerializer ser = new JavaScriptSerializer(); ser.MaxJsonLength = int.MaxValue; ser.RecursionLimit = 500;
            Dictionary<string, object> root = ser.Deserialize<Dictionary<string, object>>(jsonText);
            ArrayList accessors = A(root["accessors"]), views = A(root["bufferViews"]);
            ArrayList newAcc = new ArrayList(), newViews = new ArrayList(); Dictionary<int, int> accMap = new Dictionary<int, int>(), viewMap = new Dictionary<int, int>(); MemoryStream bin = new MemoryStream();
            Func<int, int> bv = null, acc = null;
            bv = delegate(int old)
            {
                int nv; if (viewMap.TryGetValue(old, out nv)) return nv;
                Dictionary<string, object> v = O(views[old]); int off = v.ContainsKey("byteOffset") ? I(v["byteOffset"]) : 0, len = I(v["byteLength"]);
                while (bin.Position % 4 != 0) bin.WriteByte(0);
                Dictionary<string, object> d = new Dictionary<string, object>(); d["buffer"] = 0; d["byteOffset"] = (int)bin.Position; d["byteLength"] = len;
                bin.Write(binData, off, len);
                if (v.ContainsKey("byteStride")) d["byteStride"] = v["byteStride"]; if (v.ContainsKey("target")) d["target"] = v["target"];
                newViews.Add(d); viewMap[old] = newViews.Count - 1; return newViews.Count - 1;
            };
            acc = delegate(int old)
            {
                int na; if (accMap.TryGetValue(old, out na)) return na;
                Dictionary<string, object> a = new Dictionary<string, object>(O(accessors[old])); if (a.ContainsKey("bufferView")) a["bufferView"] = bv(I(a["bufferView"]));
                newAcc.Add(a); accMap[old] = newAcc.Count - 1; return newAcc.Count - 1;
            };
            ArrayList nodes = A(root["nodes"]); string[] prefixes = keepMeshes == null ? null : keepMeshes.Split(new char[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
            int keptNodes = 0, droppedNodes = 0;
            foreach (object no in nodes)
            {
                Dictionary<string, object> n = O(no); if (!n.ContainsKey("mesh")) continue;
                string name = n.ContainsKey("name") ? (string)n["name"] : ""; bool keep = prefixes == null;
                if (prefixes != null) foreach (string p in prefixes) if (name.StartsWith(p, StringComparison.OrdinalIgnoreCase)) keep = true;
                if (keep) keptNodes++; else { n.Remove("mesh"); n.Remove("skin"); droppedNodes++; }
            }
            ArrayList oldMeshes = root.ContainsKey("meshes") ? A(root["meshes"]) : new ArrayList(), newMeshes = new ArrayList(); Dictionary<int, int> meshMap = new Dictionary<int, int>(); bool anySkin = false;
            foreach (object no in nodes)
            {
                Dictionary<string, object> n = O(no); if (!n.ContainsKey("mesh")) continue; if (n.ContainsKey("skin")) anySkin = true;
                int om = I(n["mesh"]), nm;
                if (!meshMap.TryGetValue(om, out nm))
                {
                    Dictionary<string, object> m = new Dictionary<string, object>(O(oldMeshes[om])); ArrayList prims = new ArrayList();
                    foreach (object po in A(m["primitives"]))
                    {
                        Dictionary<string, object> p = new Dictionary<string, object>(O(po)), at = new Dictionary<string, object>();
                        foreach (KeyValuePair<string, object> kv in O(p["attributes"])) at[kv.Key] = acc(I(kv.Value));
                        p["attributes"] = at; if (p.ContainsKey("indices")) p["indices"] = acc(I(p["indices"]));
                        if (p.ContainsKey("targets")) { ArrayList tg = new ArrayList(); foreach (object to in A(p["targets"])) { Dictionary<string, object> t2 = new Dictionary<string, object>(); foreach (KeyValuePair<string, object> kv in O(to)) t2[kv.Key] = acc(I(kv.Value)); tg.Add(t2); } p["targets"] = tg; }
                        prims.Add(p);
                    }
                    m["primitives"] = prims; newMeshes.Add(m); nm = newMeshes.Count - 1; meshMap[om] = nm;
                }
                n["mesh"] = nm;
            }
            if (newMeshes.Count > 0) root["meshes"] = newMeshes; else root.Remove("meshes");
            if (root.ContainsKey("skins") && anySkin)
            {
                ArrayList sk = new ArrayList(); foreach (object so in A(root["skins"])) { Dictionary<string, object> s = new Dictionary<string, object>(O(so)); if (s.ContainsKey("inverseBindMatrices")) s["inverseBindMatrices"] = acc(I(s["inverseBindMatrices"])); sk.Add(s); }
                root["skins"] = sk;
            }
            else root.Remove("skins");
            ArrayList anims = root.ContainsKey("animations") ? A(root["animations"]) : new ArrayList(), newAnims = new ArrayList(); int totalAnims = anims.Count;
            HashSet<string> want = keepAnims == null ? null : new HashSet<string>(keepAnims.Split(new char[] { ',' }, StringSplitOptions.RemoveEmptyEntries));
            foreach (object ao in anims)
            {
                Dictionary<string, object> a = O(ao); string name = a.ContainsKey("name") ? (string)a["name"] : ""; if (want != null && !want.Contains(name)) continue;
                Dictionary<string, object> na = new Dictionary<string, object>(a); ArrayList samplers = new ArrayList();
                foreach (object so in A(a["samplers"])) { Dictionary<string, object> s = new Dictionary<string, object>(O(so)); s["input"] = acc(I(s["input"])); s["output"] = acc(I(s["output"])); samplers.Add(s); }
                na["samplers"] = samplers; newAnims.Add(na);
            }
            if (newAnims.Count > 0) root["animations"] = newAnims; else root.Remove("animations");
            if (dropMaterials || newMeshes.Count == 0) { root.Remove("materials"); root.Remove("textures"); root.Remove("images"); root.Remove("samplers"); }
            else if (root.ContainsKey("images")) { ArrayList imgs = new ArrayList(); foreach (object io in A(root["images"])) { Dictionary<string, object> im = new Dictionary<string, object>(O(io)); if (im.ContainsKey("bufferView")) im["bufferView"] = bv(I(im["bufferView"])); imgs.Add(im); } root["images"] = imgs; }
            while (bin.Position % 4 != 0) bin.WriteByte(0);
            root["accessors"] = newAcc; root["bufferViews"] = newViews;
            ArrayList bufs = new ArrayList(); Dictionary<string, object> b0 = new Dictionary<string, object>(); b0["byteLength"] = (int)bin.Length; bufs.Add(b0); root["buffers"] = bufs;
            byte[] jb = Encoding.UTF8.GetBytes(ser.Serialize(root)); int jpad = (4 - jb.Length % 4) % 4; byte[] bd = bin.ToArray();
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outPath)));
            using (FileStream fs = File.Create(outPath)) using (BinaryWriter w = new BinaryWriter(fs))
            {
                w.Write((uint)0x46546C67); w.Write((uint)2); w.Write((uint)(12 + 8 + jb.Length + jpad + 8 + bd.Length));
                w.Write((uint)(jb.Length + jpad)); w.Write((uint)0x4E4F534A); w.Write(jb); for (int i = 0; i < jpad; i++) w.Write((byte)32);
                w.Write((uint)bd.Length); w.Write((uint)0x004E4942); w.Write(bd);
            }
            return string.Format("{0}: {1:N0} KB -> {2:N0} KB  (animations {3} of {4}, mesh nodes kept {5}, dropped {6})", Path.GetFileName(inPath), file.Length / 1024, new FileInfo(outPath).Length / 1024, newAnims.Count, totalAnims, keptNodes, droppedNodes);
        }
    }

    // ------------------------------------------------------------------ Wavefront OBJ + MTL reader (flat colour materials)
    public static class ObjIO
    {
        sealed class Bucket
        {
            public List<float> Pos = new List<float>(), Nrm = new List<float>();
            public List<int> Idx = new List<int>();
            public Dictionary<long, int> Map = new Dictionary<long, int>();
        }

        public static Dictionary<string, double[]> LoadMtl(string path)
        {
            Dictionary<string, double[]> res = new Dictionary<string, double[]>();
            if (!File.Exists(path)) return res;
            string cur = null;
            foreach (string raw in File.ReadAllLines(path))
            {
                string l = raw.Trim(); if (l.Length == 0 || l[0] == '#') continue;
                string[] t = l.Split(new char[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                if (t[0] == "newmtl" && t.Length > 1) { cur = l.Substring(6).Trim(); res[cur] = new double[] { 0.5, 0.5, 0.5 }; }
                else if (t[0] == "Kd" && t.Length > 3 && cur != null) res[cur] = new double[] { P(t[1]), P(t[2]), P(t[3]) };
            }
            return res;
        }
        static double P(string s) { return double.Parse(s, System.Globalization.CultureInfo.InvariantCulture); }

        // one primitive per material; faces of any size are triangulated as fans; normals come from the file (flat shaded when missing)
        public static List<Prim> Load(string objPath, double scale, out string objName, out Dictionary<string, double[]> colours)
        {
            List<double[]> v = new List<double[]>(), vn = new List<double[]>();
            Dictionary<string, Bucket> buckets = new Dictionary<string, Bucket>(); List<string> order = new List<string>();
            string cur = "default"; string mtlFile = null; objName = Path.GetFileNameWithoutExtension(objPath);
            foreach (string raw in File.ReadAllLines(objPath))
            {
                string l = raw.Trim(); if (l.Length == 0 || l[0] == '#') continue;
                string[] t = l.Split(new char[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                switch (t[0])
                {
                    case "v": v.Add(new double[] { P(t[1]) * scale, P(t[2]) * scale, P(t[3]) * scale }); break;
                    case "vn": vn.Add(new double[] { P(t[1]), P(t[2]), P(t[3]) }); break;
                    case "mtllib": mtlFile = l.Substring(6).Trim(); break;
                    case "usemtl": cur = l.Substring(6).Trim(); break;
                    case "f":
                        {
                            Bucket b; if (!buckets.TryGetValue(cur, out b)) { b = new Bucket(); buckets[cur] = b; order.Add(cur); }
                            int n = t.Length - 1; int[] vi = new int[n], ni = new int[n];
                            for (int i = 0; i < n; i++)
                            {
                                string[] c = t[i + 1].Split('/');
                                int a = int.Parse(c[0]); vi[i] = a < 0 ? v.Count + a : a - 1;
                                ni[i] = (c.Length > 2 && c[2].Length > 0) ? (int.Parse(c[2]) < 0 ? vn.Count + int.Parse(c[2]) : int.Parse(c[2]) - 1) : -1;
                            }
                            for (int i = 1; i + 1 < n; i++)
                            {
                                int[] cv = new int[] { vi[0], vi[i], vi[i + 1] }, cn = new int[] { ni[0], ni[i], ni[i + 1] };
                                double[] fn = null;
                                for (int k = 0; k < 3; k++)
                                {
                                    long key = cn[k] >= 0 ? (long)cv[k] * 8388608L + cn[k] : -1;
                                    int id;
                                    if (key < 0 || !b.Map.TryGetValue(key, out id))
                                    {
                                        id = b.Pos.Count / 3; if (key >= 0) b.Map[key] = id;
                                        double[] p = v[cv[k]]; b.Pos.Add((float)p[0]); b.Pos.Add((float)p[1]); b.Pos.Add((float)p[2]);
                                        double[] nn;
                                        if (cn[k] >= 0) nn = vn[cn[k]];
                                        else
                                        {
                                            if (fn == null)
                                            {
                                                double[] a0 = v[cv[0]], a1 = v[cv[1]], a2 = v[cv[2]];
                                                double ux = a1[0] - a0[0], uy = a1[1] - a0[1], uz = a1[2] - a0[2], wx = a2[0] - a0[0], wy = a2[1] - a0[1], wz = a2[2] - a0[2];
                                                double nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, ln = Math.Sqrt(nx * nx + ny * ny + nz * nz); if (ln < 1e-12) ln = 1;
                                                fn = new double[] { nx / ln, ny / ln, nz / ln };
                                            }
                                            nn = fn;
                                        }
                                        b.Nrm.Add((float)nn[0]); b.Nrm.Add((float)nn[1]); b.Nrm.Add((float)nn[2]);
                                    }
                                    b.Idx.Add(id);
                                }
                            }
                            break;
                        }
                }
            }
            colours = mtlFile != null ? LoadMtl(Path.Combine(Path.GetDirectoryName(Path.GetFullPath(objPath)), mtlFile)) : new Dictionary<string, double[]>();
            List<Prim> prims = new List<Prim>();
            foreach (string m in order)
            {
                Bucket b = buckets[m]; Prim p = new Prim(); p.Node = objName; p.Material = m;
                p.Pos = b.Pos.ToArray(); p.Nrm = b.Nrm.ToArray(); p.Idx = b.Idx.ToArray(); prims.Add(p);
            }
            return prims;
        }
    }

    // ------------------------------------------------------------------ command line driver
    public static class LodRunner
    {
        // OBJ + MTL -> one GLB with a flat-colour PBR material per MTL material (metal / wood / plastic guessed from the material name)
        public static string ObjToGlb(string objPath, string outPath, double scale)
        {
            string name; Dictionary<string, double[]> col;
            List<Prim> prims = ObjIO.Load(objPath, scale, out name, out col);
            Dictionary<string, double[]> info = new Dictionary<string, double[]>();
            foreach (Prim p in prims)
            {
                if (info.ContainsKey(p.Material)) continue;
                double[] c; if (!col.TryGetValue(p.Material, out c)) c = new double[] { 0.5, 0.5, 0.5 };
                string n = p.Material.ToLower(); double metal = 0.05, rough = 0.55;
                if (n.IndexOf("metal") >= 0) { metal = 0.8; rough = 0.38; } else if (n.IndexOf("wood") >= 0) { metal = 0.0; rough = 0.62; } else if (n.IndexOf("glass") >= 0) { metal = 0.0; rough = 0.08; }
                info[p.Material] = new double[] { c[0], c[1], c[2], metal, rough };
            }
            List<List<Prim>> groups = new List<List<Prim>>(); groups.Add(prims);
            List<string> names = new List<string>(); names.Add(name);
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outPath)));
            GltfIO.Write(outPath, new Doc(), groups, names, null, false, info);
            int tris = 0; foreach (Prim p in prims) tris += p.Tris;
            return string.Format("{0}: {1} triangles, {2} materials, {3:N0} KB", name, tris, prims.Count, new FileInfo(outPath).Length / 1024);
        }

        static List<Prim> MergeByMaterial(List<Prim> prims)
        {
            List<Prim> res = new List<Prim>(); Dictionary<int, List<Prim>> by = new Dictionary<int, List<Prim>>(); List<int> order = new List<int>();
            foreach (Prim p in prims) { if (!by.ContainsKey(p.MaterialIndex)) { by[p.MaterialIndex] = new List<Prim>(); order.Add(p.MaterialIndex); } by[p.MaterialIndex].Add(p); }
            foreach (int mi in order)
            {
                List<Prim> l = by[mi]; if (l.Count == 1) { res.Add(l[0]); continue; }
                int nv = 0, ni = 0; bool uv = true, nr = true; foreach (Prim p in l) { nv += p.Pos.Length / 3; ni += p.Idx.Length; if (p.Uv == null) uv = false; if (p.Nrm == null) nr = false; }
                Prim m = new Prim(); m.Node = l[0].Node; m.Material = l[0].Material; m.MaterialIndex = mi;
                m.Pos = new float[nv * 3]; m.Idx = new int[ni]; if (uv) m.Uv = new float[nv * 2]; if (nr) m.Nrm = new float[nv * 3];
                int vo = 0, io = 0;
                foreach (Prim p in l)
                {
                    int n = p.Pos.Length / 3; Array.Copy(p.Pos, 0, m.Pos, vo * 3, n * 3); if (uv) Array.Copy(p.Uv, 0, m.Uv, vo * 2, n * 2); if (nr) Array.Copy(p.Nrm, 0, m.Nrm, vo * 3, n * 3);
                    for (int i = 0; i < p.Idx.Length; i++) m.Idx[io + i] = p.Idx[i] + vo;
                    vo += n; io += p.Idx.Length;
                }
                res.Add(m);
            }
            return res;
        }

        // targets[level] = triangles per object (0 = keep, <0 = skip the level)
        public static string Run(string input, string outDir, string name, int lod0, int lod1, int lod2, bool split, double maxErr)
        {
            StringBuilder log = new StringBuilder();
            Doc doc = GltfIO.Load(input);
            if (string.IsNullOrEmpty(name)) name = Path.GetFileNameWithoutExtension(input);
            List<string> order = new List<string>(); Dictionary<string, List<Prim>> byKey = new Dictionary<string, List<Prim>>();
            foreach (Prim p in doc.Prims) { string key = split ? p.Node : "all"; if (!byKey.ContainsKey(key)) { byKey[key] = new List<Prim>(); order.Add(key); } byKey[key].Add(p); }
            // the offset that puts every object on the ground around the origin is taken from the full-resolution mesh and is the same for all levels
            List<double[]> shifts = new List<double[]>(); List<string> names = new List<string>(); int origTris = 0;
            foreach (string key in order)
            {
                double mnx = 1e30, mny = 1e30, mnz = 1e30, mxx = -1e30, mxz = -1e30;
                foreach (Prim p in byKey[key]) { origTris += p.Tris; for (int i = 0; i < p.Pos.Length; i += 3) { if (p.Pos[i] < mnx) mnx = p.Pos[i]; if (p.Pos[i] > mxx) mxx = p.Pos[i]; if (p.Pos[i + 1] < mny) mny = p.Pos[i + 1]; if (p.Pos[i + 2] < mnz) mnz = p.Pos[i + 2]; if (p.Pos[i + 2] > mxz) mxz = p.Pos[i + 2]; } }
                shifts.Add(split ? new double[] { -(mnx + mxx) / 2, -mny, -(mnz + mxz) / 2 } : null);
                names.Add(split ? key : name);
            }
            log.AppendLine(string.Format("{0}: {1} object(s), {2:N0} triangles in", name, order.Count, origTris));
            int[] targets = new int[] { lod0, lod1, lod2 };
            for (int lv = 0; lv < 3; lv++)
            {
                if (targets[lv] < 0) continue;
                List<List<Prim>> groups = new List<List<Prim>>(); int total = 0; DateTime t0 = DateTime.Now; double worst = 0;
                foreach (string key in order)
                {
                    List<Prim> merged = MergeByMaterial(byKey[key]); int gt = 0; foreach (Prim p in merged) gt += p.Tris;
                    List<Prim> outp = new List<Prim>();
                    foreach (Prim p in merged)
                    {
                        int t = targets[lv] == 0 ? p.Tris : (int)Math.Round((double)targets[lv] * p.Tris / Math.Max(1, gt));
                        if (targets[lv] > 0 && t < 24) t = 24;
                        Prim s = t >= p.Tris ? p : Simplifier.Run(p, t, maxErr); if (Simplifier.LastCost > worst && t < p.Tris) worst = Simplifier.LastCost; outp.Add(s); total += s.Tris;
                    }
                    groups.Add(outp);
                }
                string file = Path.Combine(outDir, lv == 0 ? name + ".glb" : name + "_lod" + lv + ".glb");
                GltfIO.Write(file, doc, groups, names, shifts, lv == 0);
                log.AppendLine(string.Format("  LOD{0}: {1,7:N0} triangles  {2,8:N0} KB  {3}  ({4:0.0}s, worst collapse error {5:0.0e+0})", lv, total, new FileInfo(file).Length / 1024, Path.GetFileName(file), (DateTime.Now - t0).TotalSeconds, worst));
            }
            return log.ToString();
        }
    }
}
