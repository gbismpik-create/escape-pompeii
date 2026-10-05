// Escape Pompeii — a Pompeian house (domus) built as a runner shortcut.
// Route runs along +Z on the central axis, like real Pompeian houses:
//   fauces (z 0–6) → atrium (6–20) → tablinum (20–25) → peristyle garden (25–52)
//   → bath suite: apodyterium (52–57), tepidarium (57–62), caldarium (62–68) → back door (68–70)
// Lanes at x = -1.8, 0, 1.8. Side rooms: cubicula, alae, lararium, triclinium, kitchen.
// HD version: 4096 px frescoes in the four Pompeian styles, marble/grass/gravel textures, rippled water,
// branching trees with leaf cards, leafy hedges, grass tufts, 48-segment columns with carved capitals.
// Wall programme (after real houses):  fauces – First style (painted marble blocks, Samnite House / Villa of Ariadne)
//   atrium – Fourth style red (House of the Vettii)   cubicula/alae – Fourth style yellow   tablinum – Third style black (Boscotrecase)
//   triclinium – Second style (Oplontis / Boscoreale)   peristyle – garden painting (Villa of Livia)   baths – white marine
// Output (VILLA_QUALITY=hd): pompeii-villa-hd.glb (everything embedded) + pompeii-villa-hd-lite.glb (no images) + tex/*.jpg|png.
// Output (default, the game's phone version): villa.glb — textures at a quarter size, lighter columns and
// foliage, and the whole house merged into one mesh per material. Run: npm run build:villa

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createCanvas, ImageData as NapiImageData } from '@napi-rs/canvas';
globalThis.ImageData = NapiImageData;
import { writeFileSync, mkdirSync } from 'node:fs';
import * as TX from './villa-textures.mjs';

// --- let GLTFExporter encode canvas textures in Node
globalThis.FileReader = class {
  readAsArrayBuffer(b) { b.arrayBuffer().then(x => { this.result = x; this.onloadend?.(); }); }
  readAsDataURL(b) { b.arrayBuffer().then(x => { this.result = `data:${b.type};base64,` + Buffer.from(x).toString('base64'); this.onloadend?.(); }); }
};
globalThis.OffscreenCanvas = function (w, h) {
  const c = createCanvas(w, h);
  c.convertToBlob = async (o = {}) => new Blob([c.toBuffer(o.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 84)], { type: o.type || 'image/png' });
  return c;
};
globalThis.OffscreenCanvas.prototype = Object.getPrototypeOf(createCanvas(1, 1));

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const C = h => new THREE.Color(h);
let seed = 21; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rr = (a, b) => lerp(a, b, rnd());
const pick = a => a[Math.floor(rnd() * a.length)];
function hash(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++)
    r += hash(xi + a, yi + b, zi + c) * (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? w : 1 - w);
  return r;
}
const fbm = (x, y, z) => 0.5 * vnoise(x, y, z) + 0.3 * vnoise(x * 2.3, y * 2.3, z * 2.3) + 0.2 * vnoise(x * 5.1, y * 5.1, z * 5.1);

// ---------------------------------------------------------------- quality: HD (as designed) or the game's phone version
const HD = process.env.VILLA_QUALITY === 'hd';
const Q = HD
  ? { texScale: 1, colSeg: 60, colRows: 14, flutes: true, lathe: 56, ring: 48, capSeg: 64, volute: 120, cushion: [24, 16], foliage: 1, card: 1, beard: true }
  : { texScale: 0.25, colSeg: 20, colRows: 4, flutes: false, lathe: 20, ring: 16, capSeg: 24, volute: 24, cushion: [10, 6], foliage: 0.45, card: 1.4, beard: false };
const fewer = (n) => Math.max(1, Math.round(n * Q.foliage)); // how many foliage cards in this quality

// ---------------------------------------------------------------- textures + materials
if (HD) mkdirSync('tex', { recursive: true });
function tex(canvas, repeat = true, key = null, png = false, linear = false) {
  if (!HD) {
    // the phone version: a quarter of the size (a 4096 px fresco becomes 1024), no preview files
    // (cut-out leaves keep half their size: shrunk further, thin needles fall below the cut-off and vanish)
    const k = png ? Math.max(Q.texScale, 0.5) : Q.texScale;
    const w = Math.max(64, Math.round(canvas.width * k)), h = Math.max(64, Math.round(canvas.height * k));
    const small = createCanvas(w, h);
    small.getContext('2d').drawImage(canvas, 0, 0, w, h);
    canvas = small;
    key = null;
  }
  // standalone image for the web preview (normal orientation, loaded with flipY = true)
  if (key) writeFileSync(`tex/${key}.${png ? 'png' : 'jpg'}`, png ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg', 84));
  // export path: raw RGBA rows, flipped so v = 0 is the bottom of the painting (glTF uses flipY = false)
  const w = canvas.width, h = canvas.height, src = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) data.set(src.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat); t.flipY = false;
  t.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.needsUpdate = true; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.userData.mimeType = png ? 'image/png' : 'image/jpeg'; t.anisotropy = 8;
  return t;
}
const T0 = Date.now(), lap = n => console.log(`  ${n} ${((Date.now() - T0) / 1000).toFixed(0)}s`);
const TEX = {};
const paint = (k, fn, repeat = true, png = false) => { TEX[k] = tex(fn(), repeat, k, png); lap(k); };
paint('fr_first', TX.firstStyle); paint('fr_second', TX.secondStyle); paint('fr_third', () => TX.thirdStyle());
paint('fr_fourth', () => TX.fourthStyle()); paint('fr_fourthY', () => TX.fourthStyle('#c58f2c'));
paint('fr_garden', TX.gardenRoom); paint('fr_bath', TX.bathWall);
paint('mo_geo', TX.mosaicGeometric); paint('mo_canem', TX.mosaicCaveCanem, false); paint('mo_emblema', TX.mosaicEmblema, false);
paint('mo_marine', TX.mosaicMarine); paint('signinum', TX.signinum); paint('lararium', TX.larariumPainting, false);
paint('marble', TX.marbleTexture); paint('grass', TX.grassTexture); paint('gravel', TX.gravelTexture);
for (const k of ['laurel', 'cypress', 'box', 'lemon', 'vine', 'rose']) paint('leaf_' + k, () => TX.leafCluster(k), false, true);
paint('tuft', TX.grassTuft, false, true);
const waterN = tex(TX.waterNormal(), true, 'water_n', true, true);
const MATS = {};
for (const [k, t] of Object.entries(TEX)) {
  const leafy = k.startsWith('leaf_') || k === 'tuft';
  MATS[k] = new THREE.MeshStandardMaterial({ name: k, map: t, vertexColors: true, roughness: k.startsWith('mo_') ? 0.5 : k === 'marble' ? 0.28 : leafy ? 0.8 : 0.85, side: THREE.DoubleSide, alphaTest: leafy ? 0.5 : 0 });
}
const plain = { plaster: [0.95, 0], stone: [0.85, 0], terracotta: [0.8, 0], wood: [0.78, 0], bronze: [0.4, 0.8], cloth: [0.95, 0], plant: [0.9, 0], soil: [1, 0] };
for (const [k, [r, m]] of Object.entries(plain)) MATS[k] = new THREE.MeshStandardMaterial({ name: k, color: 0xffffff, vertexColors: true, roughness: r, metalness: m, side: THREE.DoubleSide });
MATS.water = new THREE.MeshStandardMaterial({ name: 'water', color: 0xffffff, vertexColors: true, roughness: 0.04, metalness: 0.15, transparent: true, opacity: 0.8, side: THREE.DoubleSide, normalMap: waterN, normalScale: new THREE.Vector2(0.6, -0.6) }); // normalScale.y < 0: exported without baking a flip into the image
const AUTO_UV = { marble: 0.9, grass: 1.6, gravel: 1.2, water: 1.4 };       // metres per texture tile, box-projected
const TEXTURED = new Set([...Object.keys(TEX), 'water']);

const COL = {
  white: C(0xffffff), plaster: C(0xe2d6bd), plasterDk: C(0xb8a88a), marble: C(0xece6da), marbleDk: C(0xbfb5a6),
  stone: C(0xbcae94), tuff: C(0xa89a80), terra: C(0xb15f3b), terraDk: C(0x7d3d24), terraLt: C(0xc9784e),
  wood: C(0x6b4a2e), woodDk: C(0x48311d), woodLt: C(0x8c6844), bronze: C(0x6a5232), verd: C(0x4f8a72),
  red: C(0x9a2c1f), black: C(0x1e1714), yellow: C(0xc99a3a), cushion: C(0x8e2a3a), cushion2: C(0x3f5f7a), linen: C(0xe6dcc6),
  leaf: C(0x3f5a30), leafLt: C(0x5f7a40), hedge: C(0x34502a), rose: C(0xc0364a), roseP: C(0xe08a9a), flowerW: C(0xf0ece0), flowerY: C(0xe8c64a),
  soil: C(0x6a5440), gravel: C(0xb3a488), water: C(0x5a8a90), grass: C(0x5d7a3a), fire: C(0xff8a3a),
};

// ---------------------------------------------------------------- builder: one Part per room/node
class Part {
  constructor(name) { this.name = name; this.buf = {}; }
  add(geo, mat, opts = {}) {
    if (!TEXTURED.has(mat)) for (const a of ['uv', 'uv1']) if (geo.attributes[a]) geo.deleteAttribute(a);
    if (AUTO_UV[mat] && !opts.keepUV) {
      if (!geo.attributes.normal) geo.computeVertexNormals();
      const Pp = geo.attributes.position, Nn = geo.attributes.normal, s = 1 / AUTO_UV[mat], uv = new Float32Array(Pp.count * 2);
      for (let i = 0; i < Pp.count; i++) {
        const ax = Math.abs(Nn.getX(i)), ay = Math.abs(Nn.getY(i)), az = Math.abs(Nn.getZ(i)), x = Pp.getX(i), y = Pp.getY(i), z = Pp.getZ(i);
        if (ay >= ax && ay >= az) { uv[i * 2] = x * s; uv[i * 2 + 1] = z * s; } else if (ax >= az) { uv[i * 2] = z * s; uv[i * 2 + 1] = y * s; } else { uv[i * 2] = x * s; uv[i * 2 + 1] = y * s; }
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    if (TEXTURED.has(mat) && !geo.attributes.uv) throw new Error(`${this.name}: textured ${mat} needs uv`);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.index) geo = mergeVertices(geo, 1e-5);
    const B = this.buf[mat] ??= { pos: [], nor: [], col: [], uv: [], idx: [] };
    const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv, base = B.pos.length / 3;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    const amp = opts.noise ?? (TEXTURED.has(mat) ? 0.0 : 0.08), f = opts.freq ?? 5;
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i);
      B.pos.push(p.x, p.y, p.z); B.nor.push(n.x, n.y, n.z);
      if (U) B.uv.push(U.getX(i), U.getY(i));
      let c = opts.colorFn ? opts.colorFn(p, n) : (opts.color ?? (mat === 'plaster' ? COL.plaster : COL.white));
      let k = 1 + (fbm(p.x * f + 11, p.y * f, p.z * f) - 0.5) * 2 * amp;
      if (opts.ao !== false) k *= 0.72 + 0.28 * smooth(p.y / 0.9);        // fake occlusion near the floor
      B.col.push(clamp(c.r * k), clamp(c.g * k), clamp(c.b * k));
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) B.idx.push(base + geo.index.getX(i));
    else for (let i = 0; i < P.count; i++) B.idx.push(base + i);
  }
  build() {
    const g = new THREE.Group(); g.name = this.name; let tris = 0;
    for (const [k, B] of Object.entries(this.buf)) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
      if (B.uv.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
      geo.setIndex(B.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(B.idx, 1) : new THREE.Uint16BufferAttribute(B.idx, 1));
      const m = new THREE.Mesh(geo, MATS[k]); m.name = `${this.name}_${k}`; g.add(m); tris += B.idx.length / 3;
      if (process.env.TRIS) console.log(`    ${this.name} ${k}: ${B.idx.length / 3}`);
    }
    g.userData.tris = tris; return g;
  }
}
function grid(nu, nv, fn, wrapU = false, uvFn = null) {
  const pos = [], idx = [], uv = [], cols = wrapU ? nu : nu + 1;
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) {
    const q = fn(i / nu, j / nv); pos.push(q.x, q.y, q.z);
    if (uvFn) { const t = uvFn(i / nu, j / nv, q); uv.push(t[0], t[1]); }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * cols + i, b = j * cols + ((i + 1) % cols), c = (j + 1) * cols + i, d = (j + 1) * cols + ((i + 1) % cols);
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uvFn) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
function xf(g, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
  g.applyMatrix4(new THREE.Matrix4().compose(V(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), V(...scl))); return g;
}
function block(w, h, d, bevel = 0.02, segs = 1) {
  const b = Math.min(bevel, w / 4, h / 4, d / 4), s = new THREE.Shape();
  s.moveTo(-w / 2 + b, -h / 2 + b); s.lineTo(w / 2 - b, -h / 2 + b); s.lineTo(w / 2 - b, h / 2 - b); s.lineTo(-w / 2 + b, h / 2 - b); s.lineTo(-w / 2 + b, -h / 2 + b);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * b, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: segs, curveSegments: 1 });
  g.translate(0, h / 2, -(d - 2 * b) / 2); return g;
}
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const lathe = (pts, segs = Q.lathe) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
const ell = (rx, ry, rz, w = 28, h = 18) => new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz);
const tint = (c, k) => new THREE.Color(c.r * k, c.g * k, c.b * k);

// wall face between (x0,z0) and (x1,z1) from y0 to y1, with openings [{a, b, h}] measured along the wall.
// uv: u = distance / 2H, v = y / H (fresco is 2:1 and designed for the full wall height H, so it is never stretched).
function wall(P, mat, x0, z0, x1, z1, y1, openings = [], H = y1, side = 0) {
  const L = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / L, dz = (z1 - z0) / L;
  const nx = -dz, nz = dx;                       // face normal (left of direction)
  const rect = (a, b, ya, yb) => {
    if (b - a < 0.01 || yb - ya < 0.01) return;
    const nu = Math.max(1, Math.round((b - a) / 0.5)), nv = Math.max(1, Math.round((yb - ya) / 0.5));
    P.add(grid(nu, nv, (u, v) => { const s = lerp(a, b, u); return V(x0 + dx * s + nx * side, lerp(ya, yb, v), z0 + dz * s + nz * side); }, false,
      (u, v) => [lerp(a, b, u) / (2 * H), lerp(ya, yb, v) / H]), mat);
  };
  const ops = openings.slice().sort((p, q) => p.a - q.a);
  let s = 0;
  for (const o of ops) { rect(s, o.a, 0, y1); rect(o.a, o.b, o.h, y1); s = o.b; }
  rect(s, L, 0, y1);
}
// solid wall body (both faces + top + reveals) with openings; faces painted with matA (normal side) / matB
function solidWall(P, x0, z0, x1, z1, H, T, matA, matB, openings = []) {
  const L = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / L, dz = (z1 - z0) / L, nx = -dz, nz = dx;
  wall(P, matA, x0, z0, x1, z1, H, openings, H, T / 2);
  wall(P, matB, x0, z0, x1, z1, H, openings, H, -T / 2);
  // top cap
  P.add(grid(Math.max(1, Math.round(L / 1)), 1, (u, v) => V(x0 + dx * u * L + nx * lerp(-T / 2, T / 2, v), H, z0 + dz * u * L + nz * lerp(-T / 2, T / 2, v))), 'plaster', { color: COL.plasterDk });
  // reveals around openings
  for (const o of openings) {
    for (const s of [o.a, o.b]) P.add(grid(1, 2, (u, v) => V(x0 + dx * s + nx * lerp(-T / 2, T / 2, u), v * o.h, z0 + dz * s + nz * lerp(-T / 2, T / 2, u))), 'plaster', { color: COL.plaster });
    P.add(grid(4, 1, (u, v) => V(x0 + dx * lerp(o.a, o.b, u) + nx * lerp(-T / 2, T / 2, v), o.h, z0 + dz * lerp(o.a, o.b, u) + nz * lerp(-T / 2, T / 2, v))), 'plaster', { color: COL.plaster });
  }
}
// floor rectangle with a tiled texture (tile metres) or a flat colour
function floor(P, mat, x0, z0, x1, z1, y = 0, tile = 2, opts = {}) {
  const nu = Math.max(1, Math.round((x1 - x0) / 1)), nv = Math.max(1, Math.round((z1 - z0) / 1));
  const g = grid(nu, nv, (u, v) => V(lerp(x0, x1, u), y, lerp(z0, z1, v)), false, TEXTURED.has(mat) ? (u, v, q) => opts.fit ? [u, v] : [q.x / tile, q.z / tile] : null);
  P.add(g, mat, opts);
}
// wooden beamed ceiling
function ceiling(P, x0, z0, x1, z1, y, beamsAlong = 'x') {
  P.add(grid(4, 4, (u, v) => V(lerp(x0, x1, u), y, lerp(z0, z1, v))), 'wood', { color: COL.woodLt, ao: false, noise: 0.12 });
  if (beamsAlong === 'x') for (let z = z0 + 0.5; z < z1; z += 0.9) P.add(box(x1 - x0, 0.16, 0.14, (x0 + x1) / 2, y - 0.16, z), 'wood', { color: COL.woodDk, ao: false, noise: 0.15 });
  else for (let x = x0 + 0.5; x < x1; x += 0.9) P.add(box(0.14, 0.16, z1 - z0, x, y - 0.16, (z0 + z1) / 2), 'wood', { color: COL.woodDk, ao: false, noise: 0.15 });
}
// tiled roof plane with imbrices rows (from ridge to eave), p0..p3 corners
function tiledRoof(P, a, b, c, d) {   // a,b along eave; c,d along ridge (a↔d, b↔c)
  const L = a.distanceTo(b), n = Math.max(2, Math.round(L / 0.36));
  P.add(grid(n, HD ? 6 : 1, (u, v) => a.clone().lerp(b, u).lerp(d.clone().lerp(c, u), v)), 'terracotta', { colorFn: () => tint(COL.terra, 0.85), ao: false, noise: 0.14, freq: 3 });
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, e = a.clone().lerp(b, t), r = d.clone().lerp(c, t);
    const len = e.distanceTo(r);
    const g = new THREE.CylinderGeometry(0.07, 0.08, len, HD ? 8 : 3, HD ? 4 : 1, true, 0, Math.PI); g.rotateZ(Math.PI / 2); g.rotateY(Math.PI / 2);
    g.translate(0, 0, len / 2);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), r.clone().sub(e).normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(e.clone().add(V(0, 0.015, 0)), q, V(1, 1, 1)));
    const k = rr(0.82, 1.15);
    P.add(g, 'terracotta', { colorFn: p => tint(rnd() < 0.3 ? COL.terraLt : COL.terra, k), ao: false, noise: 0.1 });
  }
}
// stuccoed Pompeian column: red unfluted lower third, white fluted shaft with entasis; Tuscan or Ionic capital
function column(P, x, z, H = 3.8, R = 0.24, ionic = false, mat = 'plaster') {
  const y0 = 0.24, yc = H - (ionic ? 0.36 : 0.4), low = y0 + (yc - y0) / 3, flutes = 20;
  const fluteDepth = Q.flutes ? 0.055 : 0;
  P.add(grid(Q.colSeg, Q.colRows, (u, v) => {
    const a = u * TAU, y = y0 + v * (yc - y0), r = R * (1.06 - 0.16 * Math.pow(v, 1.6));
    const f = y > low + 0.03 ? R * fluteDepth * Math.pow(Math.abs(Math.cos(a * flutes / 2)), 0.6) * smooth((y - low) / 0.08) : 0;
    return V(x + Math.sin(a) * (r - f), y, z + Math.cos(a) * (r - f));
  }, true, mat === 'marble' ? (u, v) => [u * 2, v * 3] : null), mat, { colorFn: p => (mat === 'plaster' && p.y < low ? COL.red.clone() : mat === 'marble' ? COL.marble : C(0xf0e9da)), noise: 0.04 });
  // Attic base: plinth + torus + scotia + torus
  P.add(xf(block(R * 2.7, 0.08, R * 2.7, 0.015), [x, 0, z]), 'marble', { color: COL.marble });
  P.add(lathe([[R * 1.3, 0.08], [R * 1.36, 0.11], [R * 1.3, 0.14], [R * 1.12, 0.16], [R * 1.08, 0.19], [R * 1.18, 0.21], [R * 1.12, 0.24], [R * 1.06, 0.245], [0, 0.245]], Q.lathe).translate(x, 0, z), 'marble', { color: COL.marble });
  const cm = mat === 'marble' ? 'marble' : 'plaster', cc = mat === 'marble' ? COL.marble : C(0xf0e9da);
  // astragal ring under the capital
  P.add(xf(new THREE.TorusGeometry(R * 0.92, R * 0.06, 6, Q.ring), [x, yc, z], [Math.PI / 2, 0, 0]), cm, { color: cc });
  if (ionic) {
    // echinus carved with egg-and-dart, then the volute cushion and abacus
    P.add(grid(Q.capSeg, 6, (u, v) => { const a = u * TAU, egg = 0.5 + 0.5 * Math.cos(a * 16); const r = R * (0.92 + 0.3 * Math.sin(v * Math.PI * 0.5)) + egg * R * 0.05 * Math.sin(v * Math.PI); return V(x + Math.sin(a) * r, yc + v * 0.12, z + Math.cos(a) * r); }, true), cm, { color: cc });
    P.add(xf(block(R * 2.5, 0.1, R * 2.2, 0.02), [x, yc + 0.12, z]), cm, { color: cc });
    P.add(xf(block(R * 2.9, 0.06, R * 2.6, 0.01), [x, yc + 0.3, z]), cm, { color: cc });
    for (const sx of [1, -1]) {
      // cushion (pulvinus) running front to back, waisted by a balteus band
      P.add(grid(Q.cushion[0], Q.cushion[1], (u, v) => { const a = u * TAU, zz = lerp(-R * 1.1, R * 1.1, v), waist = 1 - 0.25 * Math.exp(-Math.pow(zz / (R * 0.25), 2)), r = 0.085 * waist; return V(x + sx * R * 1.15 + Math.cos(a) * r, yc + 0.17 + Math.sin(a) * r, z + zz); }, true), cm, { color: cc });
      // spiral volutes on the front and back faces
      for (const sz of [1, -1]) {
        const pts = []; for (let t = 0; t <= 1; t += 0.02) { const ang = t * TAU * 2.6, rad = lerp(0.1, 0.018, t); pts.push(V(x + sx * (R * 1.15 + Math.cos(ang) * rad), yc + 0.17 + Math.sin(ang) * rad * sx, z + sz * R * 1.12)); }
        P.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Q.volute, 0.013, HD ? 6 : 4), cm, { color: cc });
        P.add(xf(new THREE.CylinderGeometry(0.1, 0.1, 0.02, HD ? 32 : 12), [x + sx * R * 1.15, yc + 0.17, z + sz * R * 1.1], [Math.PI / 2, 0, 0]), cm, { color: tint(cc, 0.93) });
        P.add(xf(new THREE.SphereGeometry(0.022, 12, 8), [x + sx * R * 1.15, yc + 0.17, z + sz * R * 1.13]), cm, { color: cc });
      }
    }
  } else {
    // Tuscan: echinus quarter-round + abacus, painted like the Pompeian stucco capitals
    P.add(lathe([[R * 0.92, 0], [R * 0.95, 0.03], [R * 1.12, 0.12], [R * 1.32, 0.2], [R * 1.36, 0.22], [0, 0.22]], Q.lathe).translate(x, yc, z), cm, { color: cc });
    P.add(xf(block(R * 2.95, 0.16, R * 2.95, 0.015), [x, yc + 0.22, z]), cm, { color: cc });
    P.add(xf(block(R * 3.05, 0.03, R * 3.05, 0.005), [x, yc + 0.37, z]), cm, { color: tint(cc, 0.9) });
  }
}
// ---------------- vegetation: textured leaf cards with normals pointing out of the crown (soft, rounded shading)
function leafCard(P, mat, cx, cy, cz, size, center, opts = {}) {
  const g = new THREE.PlaneGeometry(size, size, 1, 1);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(0, TAU), rr(0, TAU), rr(0, TAU)));
  if (opts.face) q.setFromUnitVectors(V(0, 0, 1), opts.face.clone().add(V(rr(-0.5, 0.5), rr(-0.5, 0.5), rr(-0.5, 0.5))).normalize()).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), rr(0, TAU)));
  g.applyQuaternion(q).translate(cx, cy, cz);
  const N = g.attributes.normal, Pp = g.attributes.position;
  for (let i = 0; i < N.count; i++) { const n = V(Pp.getX(i) - center.x, (Pp.getY(i) - center.y) * (opts.flatY ?? 1), Pp.getZ(i) - center.z).normalize(); N.setXYZ(i, n.x, n.y, n.z); }
  const k = rr(0.78, 1.12), hue = opts.tint ?? C(0xffffff);
  P.add(g, mat, { colorFn: (p) => { const sh = 0.75 + 0.25 * clamp((p.y - (center.y - 1)) / 2); return new THREE.Color(hue.r * k * sh, hue.g * k * sh, hue.b * k * sh); }, ao: false, keepUV: true });
}
// tapered limb along a polyline
function limb(P, pts, r0, r1, col = COL.woodDk, radial = 9) {
  const curve = new THREE.CatmullRomCurve3(pts), n = HD ? Math.max(3, pts.length * 3) : Math.max(2, pts.length);
  if (!HD) radial = Math.min(radial, 5);
  const frames = curve.computeFrenetFrames(n, false);
  P.add(grid(radial, n, (u, v) => {
    const i = Math.round(v * n), c = curve.getPointAt(v), r = lerp(r0, r1, v) * (1 + 0.08 * Math.sin(u * TAU * 3 + v * 9)), a = u * TAU;
    return c.clone().addScaledVector(frames.normals[i], Math.cos(a) * r).addScaledVector(frames.binormals[i], Math.sin(a) * r);
  }, true), 'wood', { color: col, noise: 0.25, freq: 14, ao: false });
}
// branching broadleaf tree (lemon, laurel, pomegranate-like) – recursive limbs, leaf cards at the twigs
function tree(P, x, z, h = 3.4, kind = 'lemon') {
  if (kind === 'cypress') return cypress(P, x, z, h);
  const leafMat = 'leaf_' + (kind === 'lemon' ? 'lemon' : 'laurel');
  const crownC = V(x, h * 0.68, z), tips = [];
  const grow = (p0, dir, len, r, depth) => {
    const pts = [p0.clone()]; let d = dir.clone();
    for (let k = 1; k <= 3; k++) { d.add(V(rr(-0.25, 0.25), rr(-0.05, 0.15), rr(-0.25, 0.25))).normalize(); pts.push(pts[k - 1].clone().addScaledVector(d, len / 3)); }
    limb(P, pts, r, r * 0.62, COL.woodDk, depth < 2 ? 10 : 6);
    if (depth >= (HD ? 3 : 2)) { tips.push(pts[3], pts[2]); return; }
    const kids = depth === 0 ? 4 : 3;
    for (let i = 0; i < kids; i++) {
      const t = depth === 0 ? 3 : pick([2, 3]), base = pts[t];
      const out = V(Math.cos(i / kids * TAU + rr(-0.4, 0.4) + depth), 0, Math.sin(i / kids * TAU + rr(-0.4, 0.4) + depth));
      const nd = d.clone().multiplyScalar(0.55).addScaledVector(out, 0.75).add(V(0, 0.35, 0)).normalize();
      grow(base, nd, len * rr(0.6, 0.75), r * 0.6, depth + 1);
    }
  };
  grow(V(x, 0, z), V(rr(-0.08, 0.08), 1, rr(-0.08, 0.08)).normalize(), h * 0.42, h * 0.035, 0);
  for (const tp of tips) for (let k = 0; k < (HD ? 7 : 5); k++) { // (the phone version has a third of the twigs)
    const p = tp.clone().add(V(rr(-0.35, 0.35), rr(-0.25, 0.3), rr(-0.35, 0.35)).multiplyScalar(h / 3.4));
    leafCard(P, leafMat, p.x, p.y, p.z, rr(0.55, 0.85) * h / 3.6 * Q.card, crownC, { flatY: 0.8 });
  }
}
// Italian cypress: slim spindle of dense foliage cards around a trunk
function cypress(P, x, z, h) {
  limb(P, [V(x, 0, z), V(x, h * 0.5, z), V(x, h * 0.95, z)], h * 0.03, h * 0.008, COL.woodDk, 8);
  const n = Math.round(h * 85); // (full count even on phones: cypress cards are cheap and the tree looks bare without them)
  for (let i = 0; i < n; i++) {
    const t = Math.pow(rnd(), 0.85), y = lerp(0.35, h, t), rad = h * 0.13 * Math.sin(Math.PI * Math.pow(lerp(0.06, 1, t), 0.8)) * (t > 0.85 ? (1 - t) * 6.6 : 1);
    const a = rr(0, TAU), d = rad * Math.sqrt(rr(0.3, 1));
    leafCard(P, 'leaf_cypress', x + Math.cos(a) * d, y, z + Math.sin(a) * d, rr(0.35, 0.55) * Q.card, V(x, y, z), { face: V(Math.cos(a), 0.15, Math.sin(a)), flatY: 0.3 });
  }
}
// clipped box hedge: dark core plus small-leaf cards covering its surface
function hedge(P, x0, z0, x1, z1, h = 0.5, w = 0.42) {
  const L = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / L, dz = (z1 - z0) / L, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  P.add(xf(block(w * 0.86, h * 0.9, L + w * 0.86, w * 0.3, 3), [cx, 0, cz], [0, Math.atan2(dx, dz), 0]), 'plant', { color: C(0x2c4423), noise: 0.2, ao: false });
  const n = fewer(L * 60);
  for (let i = 0; i < n; i++) {
    const s = rr(-0.03, L + 0.03), side = rnd(), along = V(x0 + dx * s, 0, z0 + dz * s);
    let p, f;
    if (side < 0.42) { const sd = rnd() < 0.5 ? 1 : -1; p = along.clone().add(V(-dz * sd * w / 2, rr(0.08, h), dx * sd * w / 2)); f = V(-dz * sd, 0.2, dx * sd); }
    else { p = along.clone().add(V(-dz * rr(-w / 2, w / 2), h + rr(-0.03, 0.02), dx * rr(-w / 2, w / 2))); f = V(0, 1, 0); }
    leafCard(P, 'leaf_box', p.x, p.y, p.z, rr(0.3, 0.42) * Q.card, V(p.x - f.x * 0.3, p.y - f.y * 0.3 - 0.05, p.z - f.z * 0.3), { face: f });
  }
}
// flowering shrub (roses / oleander / acanthus)
function shrub(P, x, z, r = 0.5, h = 0.8, kind = 'rose') {
  const c = V(x, h * 0.5, z);
  P.add(xf(ell(r * 0.7, h * 0.45, r * 0.7, 14, 10), [x, h * 0.45, z]), 'plant', { color: C(0x263c1e), ao: false, noise: 0.2 });
  for (let i = 0; i < fewer(150 * r); i++) {
    const a = rr(0, TAU), el = rr(-0.2, 1.2), p = V(x + Math.cos(a) * Math.cos(el) * r * 0.8, h * 0.45 + Math.sin(el) * h * 0.5, z + Math.sin(a) * Math.cos(el) * r * 0.8);
    leafCard(P, kind === 'rose' ? 'leaf_rose' : 'leaf_laurel', p.x, p.y, p.z, rr(0.35, 0.5) * Q.card, c, { face: p.clone().sub(c).normalize() });
  }
}
// grass tuft: two or three crossed alpha cards
function tuft(P, x, z, s = 0.35) {
  const r0 = rr(0, Math.PI);
  for (let k = 0; k < 3; k++) {
    const g = new THREE.PlaneGeometry(s * rr(0.8, 1.3), s * rr(0.7, 1.2)); g.translate(0, s * 0.45, 0); g.rotateY(r0 + k * Math.PI / 3); g.translate(x, 0, z);
    const N = g.attributes.normal; for (let i = 0; i < N.count; i++) N.setXYZ(i, 0, 1, 0);
    const k2 = rr(0.8, 1.1); P.add(g, 'tuft', { color: new THREE.Color(k2, k2, k2), ao: false, keepUV: true });
  }
}
// garden sculpture
function herm(P, x, z, rot = 0) {
  P.add(xf(block(0.28, 1.25, 0.22, 0.02), [x, 0, z], [0, rot, 0]), 'marble', { color: COL.marble, noise: 0.05 });
  P.add(xf(ell(0.1, 0.13, 0.11, 20, 14), [x, 1.42, z]), 'marble', { color: COL.marble });
  if (Q.beard) for (let i = 0; i < 40; i++) { const a = rr(-1.4, 1.4), y = rr(-0.13, -0.02); P.add(xf(new THREE.IcosahedronGeometry(0.022, 0), [x + Math.sin(a + rot) * 0.095, 1.42 + y, z + Math.cos(a + rot) * 0.095]), 'marble', { color: COL.marble }); }   // beard
  if (Q.beard) for (let i = 0; i < 50; i++) { const a = rr(0, TAU), y = rr(0.02, 0.12); P.add(xf(new THREE.IcosahedronGeometry(0.022, 0), [x + Math.sin(a) * 0.1, 1.42 + y, z + Math.cos(a) * 0.1]), 'marble', { color: COL.marble }); }
}
function crater(P, x, z, y = 0) {
  P.add(xf(block(0.5, 0.9, 0.5, 0.02), [x, y, z]), 'marble', { color: COL.marbleDk });
  P.add(xf(lathe([[0, 0], [0.12, 0.02], [0.08, 0.12], [0.1, 0.18], [0.24, 0.34], [0.28, 0.52], [0.3, 0.56], [0.27, 0.56]], 28), [x, y + 0.9, z]), 'marble', { color: COL.marble });
  for (const s of [1, -1]) P.add(xf(new THREE.TorusGeometry(0.07, 0.016, 6, 14, Math.PI), [x + s * 0.27, y + 1.32, z], [0, 0, s * -Math.PI / 2]), 'marble', { color: COL.marble });
}
function oscillum(P, x, y, z) {
  P.add(new THREE.CylinderGeometry(0.003, 0.003, 0.5, 4).translate(x, y + 0.25, z), 'bronze', { color: COL.bronze });
  P.add(xf(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 24), [x, y - 0.15, z], [Math.PI / 2, 0, 0]), 'marble', { color: COL.marble });
  P.add(xf(new THREE.TorusGeometry(0.17, 0.012, 6, 24), [x, y - 0.15, z]), 'marble', { color: COL.marbleDk });
}
function lampStand(P, x, z, h = 1.4) {
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3; P.add(xf(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 5), [x + Math.cos(a) * 0.09, 0.07, z + Math.sin(a) * 0.09], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9]), 'bronze', { color: COL.bronze }); }
  P.add(new THREE.CylinderGeometry(0.014, 0.018, h, 8).translate(x, h / 2 + 0.1, z), 'bronze', { color: COL.bronze });
  P.add(xf(new THREE.CylinderGeometry(0.12, 0.08, 0.03, 16), [x, h + 0.1, z]), 'bronze', { color: COL.bronze });
  P.add(xf(ell(0.07, 0.03, 0.04, 12, 8), [x, h + 0.14, z]), 'terracotta', { color: COL.terraLt });
}
function amphora(P, x, z, rot = 0, lean = 0, y = 0) {
  const g = lathe([[0, 0], [0.03, 0.02], [0.05, 0.12], [0.17, 0.38], [0.2, 0.55], [0.17, 0.72], [0.07, 0.8], [0.055, 0.95], [0.065, 0.98], [0.05, 0.99]], 16);
  xf(g, [x, y, z], [lean, rot, 0]); P.add(g, 'terracotta', { color: tint(rnd() < 0.5 ? COL.terra : COL.terraLt, rr(0.85, 1.1)), noise: 0.1 });
}

// ================================================================== ROOMS
const parts = [];
const part = n => { const p = new Part(n); parts.push(p); return p; };
const obstacles = [];

// ---------------- FACADE + FAUCES (z 0–6)
{
  const P = part('Villa_Fauces');
  // street facade: plastered with red socle, pilasters with Corinthian-like capitals flanking the doorway
  solidWall(P, -9.6, 0, -2.8, 0, 7.0, 0.5, 'plaster', 'plaster');
  solidWall(P, 2.8, 0, 9.6, 0, 7.0, 0.5, 'plaster', 'plaster');
  P.add(box(5.6, 2.4, 0.5, 0, 4.6, 0), 'plaster', { color: COL.plaster });
  for (const s of [1, -1]) {
    P.add(box(0.6, 4.3, 0.2, s * 3.2, 0, 0.32), 'stone', { color: COL.tuff, noise: 0.12 });
    P.add(xf(block(0.8, 0.35, 0.3, 0.03), [s * 3.2, 4.3, 0.32]), 'stone', { color: COL.tuff });
    for (let i = 0; i < 8; i++) P.add(xf(new THREE.IcosahedronGeometry(0.06, 0), [s * 3.2 + rr(-0.3, 0.3), 4.4 + rr(0, 0.2), 0.45]), 'stone', { color: COL.tuff });   // acanthus leaves
  }
  P.add(xf(block(6.4, 0.3, 0.4, 0.02), [0, 4.65, 0.3]), 'stone', { color: COL.tuff });
  for (const sx of [1, -1]) P.add(box(6.8, 0.9, 0.06, sx * 6.2, 0, -0.28), 'plaster', { color: COL.red });   // red socle on the street face, either side of the door                        // red socle outside
  // fauces walls with painted lower band, beamed ceiling
  solidWall(P, -2.8, 0.25, -2.8, 6, 4.6, 0.3, 'plaster', 'fr_first');
  solidWall(P, 2.8, 6, 2.8, 0.25, 4.6, 0.3, 'plaster', 'fr_first');
  ceiling(P, -2.8, 0.25, 2.8, 6, 4.6, 'x');
  floor(P, 'mo_geo', -2.8, 0, 2.8, 6, 0.002, 2);
  P.add(grid(1, 1, (u, v) => V(lerp(-1.6, 1.6, u), 0.006, lerp(0.6, 2.2, v)), false, (u, v) => [1 - u, v]), 'mo_canem');
  P.add(xf(block(5.6, 0.08, 0.5, 0.02), [0, 0, 0.1]), 'stone', { color: COL.marbleDk });       // threshold
  // great double doors folded back against the walls (bronze studs)
  for (const s of [1, -1]) {
    for (let i = 0; i < 2; i++) {
      P.add(box(0.08, 3.9, 1.3, s * 2.6, 0.05, 1.0 + i * 1.32), 'wood', { color: COL.woodDk, noise: 0.15, freq: 12 });
      for (let k = 0; k < 4; k++) for (const y of [0.6, 1.9, 3.3]) P.add(xf(new THREE.SphereGeometry(0.03, 8, 6), [s * 2.55, y, 0.55 + i * 1.32 + k * 0.3]), 'bronze', { color: COL.bronze });
    }
  }
}

// ---------------- ATRIUM (z 6–20)
{
  const P = part('Villa_Atrium');
  const H = 6.2;
  // front wall (towards the fauces) and back wall (towards the tablinum)
  solidWall(P, -7, 6, 7, 6, H, 0.4, 'fr_fourth', 'plaster', [{ a: 4.2, b: 9.8, h: 4.6 }]);
  solidWall(P, 7, 20, -7, 20, H, 0.4, 'fr_fourth', 'plaster', [{ a: 3.6, b: 10.4, h: 5.0 }]);
  // side walls with doors to two cubicula each side and the wide alae
  const doors = [{ a: 1.6, b: 3.2, h: 2.7 }, { a: 6.0, b: 7.6, h: 2.7 }, { a: 10.4, b: 13.6, h: 4.6 }];
  solidWall(P, -7, 20, -7, 6, H, 0.4, 'fr_fourth', 'plaster', doors.map(d => ({ a: 14 - d.b, b: 14 - d.a, h: d.h })));
  solidWall(P, 7, 6, 7, 20, H, 0.4, 'fr_fourth', 'plaster', doors);
  floor(P, 'mo_geo', -7, 6, 7, 20, 0.002, 2);
  // impluvium: marble-rimmed rain pool in the floor (jump in the centre lane)
  const ix = 1.7, iz0 = 11.4, iz1 = 14.6;
  for (const [w, d, x, z] of [[ix * 2 + 0.3, 0.2, 0, iz0], [ix * 2 + 0.3, 0.2, 0, iz1], [0.2, iz1 - iz0, -ix, (iz0 + iz1) / 2], [0.2, iz1 - iz0, ix, (iz0 + iz1) / 2]])
    P.add(xf(block(w, 0.14, d, 0.02), [x, 0, z]), 'marble', { color: COL.marble, noise: 0.05 });
  P.add(box(ix * 2 - 0.2, 0.02, iz1 - iz0 - 0.2, 0, -0.3, (iz0 + iz1) / 2), 'marble', { color: COL.marbleDk });
  for (const s of [1, -1]) {
    P.add(box(0.02, 0.32, iz1 - iz0 - 0.2, s * (ix - 0.1), -0.3, (iz0 + iz1) / 2), 'marble', { color: COL.marbleDk });
    P.add(box(ix * 2 - 0.2, 0.32, 0.02, 0, -0.3, s > 0 ? iz0 + 0.1 : iz1 - 0.1), 'marble', { color: COL.marbleDk });
  }
  P.add(grid(4, 4, (u, v) => V(lerp(-ix + 0.1, ix - 0.1, u), -0.05, lerp(iz0 + 0.1, iz1 - 0.1, v))), 'water', { color: COL.water, ao: false, noise: 0.05 });
  // small fountain jet and a bronze statuette on the rim
  P.add(xf(lathe([[0, 0], [0.15, 0], [0.12, 0.25], [0.18, 0.35], [0, 0.35]], 16), [0, -0.3, 13]), 'marble', { color: COL.marble });
  obstacles.push({ type: 'impluvium', lane: 1, z0: iz0, z1: iz1, act: 'jump' });
  // four columns around the roof opening (just outside the side lanes)
  for (const x of [-2.45, 2.45]) for (const z of [11, 15]) column(P, x, z, 5.5, 0.21, true, 'marble');
  // cartibulum: marble table with lion legs at the end of the pool
  P.add(xf(block(1.5, 0.08, 0.7, 0.02), [0, 0.86, 16.4]), 'marble', { color: COL.marble });
  for (const s of [1, -1]) {
    P.add(xf(block(0.12, 0.8, 0.55, 0.02), [s * 0.6, 0.06, 16.4]), 'marble', { color: COL.marble });
    P.add(xf(ell(0.08, 0.1, 0.12, 12, 8), [s * 0.6, 0.72, 16.72]), 'marble', { color: COL.marble });   // lion head
    P.add(xf(block(0.18, 0.06, 0.6, 0.02), [s * 0.6, 0.0, 16.4]), 'marble', { color: COL.marble });
  }
  P.add(xf(lathe([[0, 0], [0.08, 0.01], [0.1, 0.06], [0.14, 0.14], [0.13, 0.15]], 18), [0.3, 0.94, 16.4]), 'bronze', { color: COL.bronze });
  obstacles.push({ type: 'table', lane: 1, z0: 16.0, z1: 16.8, act: 'dodge' });
  // strongbox (arca) bound in bronze
  P.add(xf(block(1.3, 0.8, 0.8, 0.03), [5.8, 0.15, 9.9]), 'wood', { color: COL.woodDk, noise: 0.15 });
  for (const x of [-0.5, 0, 0.5]) P.add(box(0.06, 0.82, 0.82, 5.8 + x, 0.14, 9.9), 'bronze', { color: COL.bronze });
  P.add(xf(block(1.4, 0.15, 0.9, 0.02), [5.8, 0, 9.9]), 'stone', { color: COL.marbleDk });
  // lararium: household shrine as a small temple front (aedicula) on the left wall
  {
    const x = -6.75, z = 10.0;
    P.add(xf(block(0.5, 0.9, 1.6, 0.02), [x + 0.1, 0, z]), 'plaster', { color: COL.plaster });
    P.add(grid(1, 1, (u, v) => V(x - 0.2 + 0.01, lerp(1.0, 2.2, v), lerp(z + 0.6, z - 0.6, u)), false, (u, v) => [u, v]), 'lararium');
    for (const s of [1, -1]) column(P, x + 0.18, z + s * 0.7, 2.4, 0.06);
    const pd = new THREE.Shape(); pd.moveTo(-0.85, 0); pd.lineTo(0.85, 0); pd.lineTo(0, 0.4); pd.lineTo(-0.85, 0);
    P.add(xf(new THREE.ExtrudeGeometry(pd, { depth: 0.4, bevelEnabled: false }), [x - 0.2, 2.4, z], [0, Math.PI / 2, 0]), 'plaster', { color: C(0xefe8d8) });
    P.add(xf(block(0.4, 0.08, 1.7, 0.02), [x + 0.05, 0.9, z]), 'marble', { color: COL.marble });
    P.add(xf(lathe([[0, 0], [0.06, 0.02], [0.03, 0.1], [0.05, 0.14]], 12), [x + 0.1, 0.98, z]), 'bronze', { color: COL.bronze });
  }
  // compluviate roof: four tiled slopes falling towards the opening; rafters below
  const yW = H, yO = H - 0.75, ox = 2.6, oz0 = 10.6, oz1 = 15.4;
  const quad = (a, b, c, d) => { tiledRoof(P, a, b, c, d); };
  quad(V(-ox, yO, oz0), V(ox, yO, oz0), V(7.3, yW, 5.7), V(-7.3, yW, 5.7));
  quad(V(ox, yO, oz1), V(-ox, yO, oz1), V(-7.3, yW, 20.3), V(7.3, yW, 20.3));
  quad(V(-ox, yO, oz1), V(-ox, yO, oz0), V(-7.3, yW, 5.7), V(-7.3, yW, 20.3));
  quad(V(ox, yO, oz0), V(ox, yO, oz1), V(7.3, yW, 20.3), V(7.3, yW, 5.7));
  // wooden ceiling under the slopes (seen from inside) + rafters
  const under = (a, b, c, d) => P.add(grid(6, 6, (u, v) => a.clone().lerp(b, u).lerp(d.clone().lerp(c, u), v).add(V(0, -0.08, 0))), 'wood', { color: COL.woodLt, ao: false, noise: 0.12 });
  under(V(-ox, yO, oz0), V(ox, yO, oz0), V(7, yW, 6), V(-7, yW, 6));
  under(V(ox, yO, oz1), V(-ox, yO, oz1), V(-7, yW, 20), V(7, yW, 20));
  under(V(-ox, yO, oz1), V(-ox, yO, oz0), V(-7, yW, 6), V(-7, yW, 20));
  under(V(ox, yO, oz0), V(ox, yO, oz1), V(7, yW, 20), V(7, yW, 6));
  for (const [a, b] of [[V(-ox, yO - 0.1, oz0), V(ox, yO - 0.1, oz0)], [V(-ox, yO - 0.1, oz1), V(ox, yO - 0.1, oz1)], [V(-ox, yO - 0.1, oz0), V(-ox, yO - 0.1, oz1)], [V(ox, yO - 0.1, oz0), V(ox, yO - 0.1, oz1)]]) {
    const len = a.distanceTo(b), mid = a.clone().lerp(b, 0.5);
    P.add(xf(new THREE.BoxGeometry(len + 0.4, 0.3, 0.3), [mid.x, mid.y - 0.1, mid.z], [0, Math.abs(a.x - b.x) < 0.01 ? Math.PI / 2 : 0, 0]), 'wood', { color: COL.woodDk, ao: false });
  }
  // terracotta gutter spouts (lion heads) at the opening corners
  for (const x of [-ox, ox]) for (const z of [oz0, oz1]) P.add(xf(ell(0.1, 0.09, 0.12, 12, 8), [x * 0.95, yO - 0.05, z]), 'terracotta', { color: COL.terraLt });
}

// ---------------- CUBICULA + ALAE (side rooms off the atrium)
{
  const P = part('Villa_SideRooms');
  for (const s of [1, -1]) {
    for (const [z0, z1] of [[6.4, 9.4], [10.8, 13.8]]) {
      const x0 = s * 7.2, x1 = s * 10;
      solidWall(P, x1, z0, x1, z1, 3.4, 0.2, s > 0 ? 'fr_fourthY' : 'plaster', s > 0 ? 'plaster' : 'fr_fourthY');
      solidWall(P, x0, z0, x1, z0, 3.4, 0.2, s > 0 ? 'fr_fourthY' : 'plaster', s > 0 ? 'plaster' : 'fr_fourthY');
      solidWall(P, x1, z1, x0, z1, 3.4, 0.2, s > 0 ? 'fr_fourthY' : 'plaster', s > 0 ? 'plaster' : 'fr_fourthY');
      floor(P, 'mo_geo', Math.min(x0, x1), z0, Math.max(x0, x1), z1, 0.002, 2);
      ceiling(P, Math.min(x0, x1), z0, Math.max(x0, x1), z1, 3.4, 'z');
      // bed with mattress, pillow and blanket
      const bx = s * 9.1, bz = (z0 + z1) / 2;
      P.add(xf(block(1.0, 0.45, 2.0, 0.03), [bx, 0.1, bz]), 'wood', { color: COL.wood });
      for (const dx of [-0.42, 0.42]) for (const dz of [-0.88, 0.88]) P.add(new THREE.CylinderGeometry(0.04, 0.035, 0.32, 8).translate(bx + dx, 0.16, bz + dz), 'bronze', { color: COL.bronze });
      P.add(xf(block(0.92, 0.18, 1.92, 0.08, 3), [bx, 0.55, bz]), 'cloth', { color: COL.linen, noise: 0.1 });
      P.add(xf(ell(0.36, 0.09, 0.2, 14, 10), [bx, 0.78, bz - s * 0 - 0.72]), 'cloth', { color: COL.cushion2 });
      P.add(xf(block(0.95, 0.06, 1.1, 0.03, 2), [bx, 0.72, bz + 0.35]), 'cloth', { color: COL.cushion });
      P.add(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20).translate(bx - s * 0.8, 0.55, bz + 0.6), 'wood', { color: COL.woodDk });
    }
    // ala: open room with wooden cabinets for ancestor masks
    const x0 = s * 7.2, x1 = s * 10, z0 = 16.2, z1 = 19.8;
    solidWall(P, x1, z0, x1, z1, 4.6, 0.2, s > 0 ? 'fr_fourthY' : 'plaster', s > 0 ? 'plaster' : 'fr_fourthY');
    solidWall(P, x0, z0, x1, z0, 4.6, 0.2, s > 0 ? 'fr_fourthY' : 'plaster', s > 0 ? 'plaster' : 'fr_fourthY');
    solidWall(P, x1, z1, x0, z1, 4.6, 0.2, s > 0 ? 'fr_fourthY' : 'plaster', s > 0 ? 'plaster' : 'fr_fourthY');
    floor(P, 'mo_geo', Math.min(x0, x1), z0, Math.max(x0, x1), z1, 0.002, 2);
    ceiling(P, Math.min(x0, x1), z0, Math.max(x0, x1), z1, 4.6, 'z');
    P.add(xf(block(0.6, 2.2, 2.4, 0.03), [s * 9.55, 0, 18]), 'wood', { color: COL.wood, noise: 0.15 });
    for (let k = 0; k < 3; k++) for (const dz of [-0.6, 0, 0.6]) P.add(xf(ell(0.1, 0.13, 0.04, 12, 8), [s * 9.24, 0.6 + k * 0.6, 18 + dz], [0, s * Math.PI / 2, 0]), 'marble', { color: C(0xd8c8a8) });  // masks
  }
}

// ---------------- TABLINUM (z 20–25)
{
  const P = part('Villa_Tablinum');
  const H = 5.0;
  solidWall(P, -3.4, 20.2, -3.4, 25, H, 0.3, 'plaster', 'fr_third');
  solidWall(P, 3.4, 25, 3.4, 20.2, H, 0.3, 'plaster', 'fr_third');
  floor(P, 'mo_geo', -3.4, 20.2, 3.4, 25, 0.002, 2);
  P.add(grid(1, 1, (u, v) => V(lerp(-1.1, 1.1, u), 0.006, lerp(21.4, 23.6, v)), false, (u, v) => [u, v]), 'mo_emblema');
  ceiling(P, -3.4, 20.2, 3.4, 25, H, 'z');
  for (let x = -2.9; x <= 2.9; x += 1.45) P.add(box(0.12, 0.14, 4.8, x, H - 0.3, 22.6), 'wood', { color: COL.woodDk, ao: false });
  lampStand(P, -2.9, 20.9); lampStand(P, 2.9, 20.9);
  // bronze-bound writing chest and a folding stool
  P.add(xf(block(1.0, 0.7, 0.55, 0.03), [-2.85, 0, 23.6]), 'wood', { color: COL.wood, noise: 0.15 });
  P.add(xf(block(0.5, 0.06, 0.4, 0.02), [2.7, 0.45, 23.5]), 'cloth', { color: COL.cushion });
  for (const s of [1, -1]) P.add(xf(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 6), [2.7 + s * 0.15, 0.22, 23.5], [0, 0, s * 0.5]), 'bronze', { color: COL.bronze });
}

// ---------------- PERISTYLE (z 25–52): colonnaded garden
{
  const P = part('Villa_Peristyle');
  const H = 4.9, X = 9.6, Z0 = 25, Z1 = 52;
  // garden-painted outer walls; front wall either side of the tablinum, back wall with three openings
  solidWall(P, -X, Z1, -X, Z0, H, 0.4, 'fr_garden', 'plaster');
  solidWall(P, X, Z0, X, Z1, H, 0.4, 'fr_garden', 'plaster');
  solidWall(P, -X, Z0, -3.25, Z0, H, 0.4, 'fr_garden', 'plaster');
  solidWall(P, 3.25, Z0, X, Z0, H, 0.4, 'fr_garden', 'plaster');
  solidWall(P, X, Z1, -X, Z1, H, 0.4, 'fr_garden', 'plaster', [{ a: 1.6, b: 6.0, h: 3.4 }, { a: 6.8, b: 12.4, h: 3.6 }, { a: 13.6, b: 18.0, h: 3.6 }]);
  // portico floors (opus signinum) and garden soil/grass/gravel path
  floor(P, 'signinum', -X, Z0, X, Z0 + 3.0, 0.004, 2); floor(P, 'signinum', -X, Z1 - 3.0, X, Z1, 0.004, 2);
  floor(P, 'signinum', -X, Z0 + 3, -6.3, Z1 - 3, 0.004, 2); floor(P, 'signinum', 6.3, Z0 + 3, X, Z1 - 3, 0.004, 2);
  // garden ground: grass beds either side of a gravel path (real textures), with tufts and wild flowers
  for (const [xa, xb, m] of [[-6.15, -2.8, 'grass'], [-2.8, 2.8, 'gravel'], [2.8, 6.15, 'grass']])
    P.add(grid(Math.round((xb - xa) * 3), 70, (u, v) => { const x = lerp(xa, xb, u), z = lerp(Z0 + 3.15, Z1 - 3.15, v); return V(x, 0.03 + (m === 'grass' ? 0.04 * vnoise(x * 2, 0, z * 2) : 0.005 * vnoise(x * 9, 0, z * 9)), z); }), m, { color: C(0xffffff), noise: 0.18, freq: 0.8, ao: false });
  for (let i = 0; i < fewer(900); i++) { const sx = rnd() < 0.5 ? 1 : -1, x = sx * rr(3.2, 5.7), z = rr(Z0 + 3.8, Z1 - 3.8); if (Math.abs(z - 37) < 1.4 && Math.abs(x) < 4) continue; tuft(P, x, z, rr(0.25, 0.42)); }
  // stylobate kerb around the garden
  for (const [w, d, x, z] of [[12.8, 0.3, 0, Z0 + 3], [12.8, 0.3, 0, Z1 - 3], [0.3, Z1 - Z0 - 6, -6.3, (Z0 + Z1) / 2], [0.3, Z1 - Z0 - 6, 6.3, (Z0 + Z1) / 2]])
    P.add(xf(block(w, 0.14, d, 0.02), [x, 0, z]), 'stone', { color: COL.tuff });
  // colonnade: columns round the garden, a wider gap on the central axis
  const cols = [];
  for (let z = Z0 + 3; z <= Z1 - 3 + 0.01; z += 3) { cols.push([-6.3, z]); cols.push([6.3, z]); }
  for (const x of [-3.15, 3.15]) { cols.push([x, Z0 + 3]); cols.push([x, Z1 - 3]); }
  for (const [x, z] of cols) column(P, x, z, 3.9, 0.22);
  // entablature beams on top of the columns
  for (const [w, d, x, z] of [[13.2, 0.4, 0, Z0 + 3], [13.2, 0.4, 0, Z1 - 3], [0.4, Z1 - Z0 - 6 + 0.4, -6.3, (Z0 + Z1) / 2], [0.4, Z1 - Z0 - 6 + 0.4, 6.3, (Z0 + Z1) / 2]])
    P.add(box(w, 0.42, d, x, 3.9, z), 'plaster', { colorFn: p => (p.y > 4.18 ? COL.red : C(0xefe8d8)) });
  // lean-to portico roofs (tiles above, wooden ceiling below)
  const yW = H, yC = 4.32;
  tiledRoof(P, V(-6.5, yC, Z0 + 3.2), V(6.5, yC, Z0 + 3.2), V(X, yW, Z0), V(-X, yW, Z0));
  tiledRoof(P, V(6.5, yC, Z1 - 3.2), V(-6.5, yC, Z1 - 3.2), V(-X, yW, Z1), V(X, yW, Z1));
  tiledRoof(P, V(-6.5, yC, Z1 - 3.2), V(-6.5, yC, Z0 + 3.2), V(-X, yW, Z0), V(-X, yW, Z1));
  tiledRoof(P, V(6.5, yC, Z0 + 3.2), V(6.5, yC, Z1 - 3.2), V(X, yW, Z1), V(X, yW, Z0));
  for (const [a, b, c, d] of [[V(-6.5, yC, Z0 + 3.2), V(6.5, yC, Z0 + 3.2), V(X, yW, Z0), V(-X, yW, Z0)], [V(6.5, yC, Z1 - 3.2), V(-6.5, yC, Z1 - 3.2), V(-X, yW, Z1), V(X, yW, Z1)],
    [V(-6.5, yC, Z1 - 3.2), V(-6.5, yC, Z0 + 3.2), V(-X, yW, Z0), V(-X, yW, Z1)], [V(6.5, yC, Z0 + 3.2), V(6.5, yC, Z1 - 3.2), V(X, yW, Z1), V(X, yW, Z0)]])
    P.add(grid(8, 4, (u, v) => a.clone().lerp(b, u).lerp(d.clone().lerp(c, u), v).add(V(0, -0.1, 0))), 'wood', { color: COL.woodLt, ao: false, noise: 0.12 });
  // oscilla hanging between the columns
  for (let z = Z0 + 4.5; z < Z1 - 3; z += 3) for (const x of [-6.3, 6.3]) oscillum(P, x, 3.55, z);
  // garden: box hedges edging the path, flower beds, trees, sculpture, fountain, pergola, water channel
  const g0 = Z0 + 3.6, g1 = Z1 - 3.6;
  for (const s of [1, -1]) {
    hedge(P, s * 2.95, g0, s * 2.95, 35.0); hedge(P, s * 2.95, 39.4, s * 2.95, g1);
    hedge(P, s * 5.9, g0, s * 5.9, g1); hedge(P, s * 2.95, g0, s * 5.9, g0); hedge(P, s * 2.95, g1, s * 5.9, g1);
    // euripus: narrow water channel down each bed
    P.add(xf(block(0.5, 0.18, 9, 0.02), [s * 4.45, 0, 44]), 'marble', { color: COL.marble });
    P.add(box(0.36, 0.02, 8.8, s * 4.45, 0.12, 44), 'water', { color: COL.water, ao: false });
    for (const z of [31, 35, 41.5, 47]) shrub(P, s * 4.45, z - 1.2, 0.5, 0.75, z === 35 ? 'laurel' : 'rose');
    tree(P, s * 4.4, 30.0, 3.6, 'lemon'); tree(P, s * 4.6, 45.0, 3.0, 'laurel'); tree(P, s * 5.3, 37.0, 4.6, 'cypress'); tree(P, s * 3.6, 37.0, 4.0, 'cypress');
    herm(P, s * 3.25, 29.2, 0); herm(P, s * 3.25, 49.0, Math.PI);
    crater(P, s * 4.45, 33.2);
    // marble benches facing the path
    P.add(xf(block(1.6, 0.1, 0.45, 0.02), [s * 5.4, 0.42, 41.0]), 'marble', { color: COL.marble });
    for (const dz of [-0.6, 0.6]) P.add(xf(block(0.3, 0.42, 0.4, 0.02), [s * 5.4, 0, 41 + dz]), 'marble', { color: COL.marble });
  }
  // central fountain: round marble basin with a column jet and a small bronze boy with a goose
  {
    const fz = 37.2;
    P.add(lathe([[0, 0], [1.25, 0], [1.3, 0.05], [1.3, 0.5], [1.18, 0.55], [1.12, 0.5], [1.12, 0.12], [0, 0.12]], 48).translate(0, 0, fz), 'marble', { color: COL.marble, noise: 0.05 });
    P.add(new THREE.CircleGeometry(1.12, 40).rotateX(-Math.PI / 2).translate(0, 0.42, fz), 'water', { color: COL.water, ao: false });
    P.add(lathe([[0.16, 0], [0.12, 0.6], [0.32, 0.72], [0.36, 0.8], [0, 0.8]], 24).translate(0, 0.12, fz), 'marble', { color: COL.marble });
    P.add(xf(ell(0.07, 0.1, 0.06, 12, 10), [0, 1.06, fz]), 'bronze', { color: COL.bronze });            // body
    P.add(new THREE.SphereGeometry(0.05, 12, 10).translate(0, 1.2, fz), 'bronze', { color: COL.bronze });
    P.add(xf(ell(0.06, 0.05, 0.09, 12, 8), [0.06, 1.02, fz + 0.06]), 'bronze', { color: COL.verd });  // goose
    P.add(new THREE.CylinderGeometry(0.01, 0.014, 0.55, 8).translate(0, 1.5, fz), 'water', { color: C(0xbcd8dc), ao: false });
    for (let k = 0; k < 8; k++) {                     // arcs falling from the jet top into the basin
      const a = k / 8 * TAU, pts = []; for (let t = 0; t <= 1; t += 0.1) pts.push(V(Math.cos(a) * t * 0.95, 1.75 + 0.25 * t - 1.6 * t * t, fz + Math.sin(a) * t * 0.95));
      P.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.011, 6), 'water', { color: C(0xbcd8dc), ao: false });
    }
    obstacles.push({ type: 'fountain', lane: 1, z0: fz - 1.3, z1: fz + 1.3, act: 'dodge' });
  }
  // pergola with vines over the path
  {
    for (const z of [43, 45.5, 48]) for (const x of [-2.75, 2.75]) {
      P.add(new THREE.CylinderGeometry(0.09, 0.1, 2.7, 10).translate(x, 1.35, z), 'plaster', { color: C(0xefe8d8) });
    }
    for (const z of [43, 45.5, 48]) P.add(box(5.8, 0.12, 0.12, 0, 2.7, z), 'wood', { color: COL.wood });
    for (let x = -2.6; x <= 2.6; x += 0.65) P.add(box(0.07, 0.07, 5.4, x, 2.82, 45.5), 'wood', { color: COL.wood });
    for (let i = 0; i < fewer(520); i++) { const p = V(rr(-3.0, 3.0), rr(2.78, 3.05), rr(42.6, 48.4)); leafCard(P, 'leaf_vine', p.x, p.y, p.z, rr(0.45, 0.7) * Q.card, V(p.x, 2.5, p.z), { face: V(rr(-0.3, 0.3), 1, rr(-0.3, 0.3)) }); }
    for (let i = 0; i < 28; i++) { const x = rr(-2.5, 2.5), z = rr(43, 48); const n = HD ? 18 : 6; for (let k = 0; k < n; k++) { const kk = k / n, rad = 0.07 * (1 - kk); P.add(xf(new THREE.IcosahedronGeometry(HD ? 0.026 : 0.04, HD ? 1 : 0), [x + rr(-rad, rad), 2.7 - kk * 0.28, z + rr(-rad, rad)]), 'plant', { color: pick([C(0x4a2a5a), C(0x5a3468), C(0x3a2048)]), ao: false }); } }  // grapes
    for (const x of [-2.75, 2.75]) for (const z of [43, 45.5, 48]) {
      const pts = []; for (let k = 0; k <= 10; k++) { const a = k * 1.3; pts.push(V(x + Math.cos(a) * 0.13, k * 0.27, z + Math.sin(a) * 0.13)); }
      limb(P, pts, 0.04, 0.02, COL.wood, 6);
      for (let k = 0; k < fewer(14); k++) { const y = rr(0.3, 2.7), a = rr(0, TAU); leafCard(P, 'leaf_vine', x + Math.cos(a) * 0.2, y, z + Math.sin(a) * 0.2, rr(0.35, 0.5) * Q.card, V(x, y, z), { face: V(Math.cos(a), 0, Math.sin(a)) }); }
    }
  }
  obstacles.push({ type: 'pergola posts', lane: -1, z0: 43, z1: 48, act: 'none', note: 'posts stand outside the lanes' });
}

// ---------------- TRICLINIUM (dining room, left of the bath entrance)
{
  const P = part('Villa_Triclinium');
  const x0 = -9.6, x1 = -3.4, z0 = 52.2, z1 = 60.5, H = 4.6;
  solidWall(P, x0, z1, x0, z0, H, 0.3, 'fr_second', 'plaster');
  solidWall(P, -3.75, z0, -3.75, z1, H, 0.3, 'fr_second', 'plaster');
  solidWall(P, x1, z1, x0, z1, H, 0.3, 'fr_second', 'plaster');
  floor(P, 'signinum', x0, z0, x1, z1, 0.002, 2);
  P.add(grid(1, 1, (u, v) => V(lerp(-7.6, -5.4, u), 0.006, lerp(55.0, 57.2, v)), false, (u, v) => [u, v]), 'mo_emblema');
  ceiling(P, x0, z0, x1, z1, H, 'x');
  // three couches in a U around a small round table
  const couch = (cx, cz, rot) => {
    const g = new THREE.Group();
    const parts2 = [[block(2.3, 0.5, 1.0, 0.04), [0, 0.15, 0], 'wood', COL.wood], [block(2.2, 0.2, 0.95, 0.08, 3), [0, 0.65, 0], 'cloth', COL.cushion],
      [block(2.3, 0.35, 0.18, 0.06, 2), [0, 0.8, -0.42], 'cloth', COL.cushion]];
    for (const [geo, pos, m, c] of parts2) { xf(geo, pos); geo.rotateY(rot); geo.translate(cx, 0, cz); P.add(geo, m, { color: c, noise: 0.1 }); }
    for (let i = 0; i < 3; i++) { const p = ell(0.22, 0.12, 0.18, 12, 8); p.translate(-0.7 + i * 0.7, 0.92, -0.25); p.rotateY(rot); p.translate(cx, 0, cz); P.add(p, 'cloth', { color: COL.cushion2 }); }
    for (const dx of [-1.0, 1.0]) for (const dz of [-0.4, 0.4]) { const l = new THREE.CylinderGeometry(0.05, 0.04, 0.16, 8); l.translate(dx, 0.07, dz); l.rotateY(rot); l.translate(cx, 0, cz); P.add(l, 'bronze', { color: COL.bronze }); }
  };
  couch(-6.5, 59.4, 0); couch(-8.9, 56.6, Math.PI / 2); couch(-4.2, 56.6, -Math.PI / 2);
  P.add(lathe([[0, 0], [0.12, 0.02], [0.05, 0.08], [0.05, 0.55], [0.45, 0.58], [0.45, 0.62], [0, 0.62]], 28).translate(-6.5, 0, 56.6), 'marble', { color: COL.marble });
  for (let i = 0; i < 4; i++) { const a = i * 1.6; P.add(xf(new THREE.CylinderGeometry(0.1, 0.06, 0.05, 16), [-6.5 + Math.cos(a) * 0.25, 0.65, 56.6 + Math.sin(a) * 0.25]), 'bronze', { color: COL.bronze }); }
  for (let i = 0; i < 14; i++) P.add(xf(new THREE.SphereGeometry(0.035, 8, 6), [-6.5 + rr(-0.2, 0.2), 0.7, 56.6 + rr(-0.2, 0.2)]), 'plant', { color: pick([C(0x6a2a4a), COL.flowerY, C(0xb8432a)]) });
  amphora(P, -9.1, 53.0, 0, 0.12); lampStand(P, -3.9, 53.0);
}

// ---------------- KITCHEN (right of the bath entrance)
{
  const P = part('Villa_Kitchen');
  const x0 = 3.4, x1 = 9.6, z0 = 52.2, z1 = 58, H = 4.0;
  solidWall(P, 3.75, z1, 3.75, z0, H, 0.3, 'plaster', 'plaster');
  solidWall(P, x1, z0, x1, z1, H, 0.3, 'plaster', 'plaster');
  solidWall(P, x1, z1, x0, z1, H, 0.3, 'plaster', 'plaster');
  floor(P, 'signinum', x0, z0, x1, z1, 0.002, 2);
  ceiling(P, x0, z0, x1, z1, H, 'z');
  // raised masonry hearth with a cauldron on an iron tripod and embers
  P.add(xf(block(2.6, 0.9, 1.0, 0.03), [7.8, 0, 56.9]), 'stone', { color: COL.tuff, noise: 0.15 });
  for (let i = 0; i < 18; i++) P.add(xf(new THREE.IcosahedronGeometry(rr(0.03, 0.06), 0), [7.4 + rr(-0.3, 0.3), 0.93, 56.9 + rr(-0.25, 0.25)]), 'stone', { color: pick([COL.fire, C(0x3a2a22), C(0xc84a20)]), ao: false });
  P.add(lathe([[0, 0], [0.18, 0.02], [0.22, 0.12], [0.2, 0.26], [0.22, 0.28]], 20).translate(7.4, 1.1, 56.9), 'bronze', { color: C(0x3a3a3a) });
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3; P.add(xf(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 5), [7.4 + Math.cos(a) * 0.15, 1.0, 56.9 + Math.sin(a) * 0.15]), 'bronze', { color: C(0x3a3a3a) }); }
  P.add(lathe([[0, 0], [0.14, 0.01], [0.17, 0.12], [0.14, 0.2], [0.1, 0.22]], 16).translate(8.3, 0.9, 57.0), 'terracotta', { color: COL.terra });
  // shelves with pots, amphorae against the wall, kitchen shrine painting
  P.add(box(2.4, 0.05, 0.35, 6.2, 1.6, 57.7), 'wood', { color: COL.wood });
  for (let i = 0; i < 6; i++) P.add(lathe([[0, 0], [0.07, 0.01], [0.09, 0.08], [0.06, 0.15], [0.07, 0.17]], 12).translate(5.2 + i * 0.4, 1.63, 57.7), 'terracotta', { color: tint(COL.terra, rr(0.8, 1.15)) });
  for (let i = 0; i < 4; i++) amphora(P, 9.0, 53.0 + i * 0.5, i, 0.18);
  P.add(grid(1, 1, (u, v) => V(9.43, lerp(1.4, 2.6, v), lerp(55.6, 54.4, u)), false, (u, v) => [u, v]), 'lararium');
}

// ---------------- BATH SUITE (z 52–68): apodyterium, tepidarium, caldarium
{
  const P = part('Villa_Bath');
  const W = 3.4, H = 3.4;
  // side walls and cross walls with doors
  solidWall(P, -W, 68, -W, 52.2, H, 0.3, 'fr_bath', 'plaster');
  solidWall(P, W, 52.2, W, 68, H, 0.3, 'fr_bath', 'plaster');
  for (const z of [57, 62]) solidWall(P, W, z, -W, z, H, 0.3, 'fr_bath', 'fr_bath', [{ a: 0.6, b: 6.2, h: 3.0 }]);
  solidWall(P, W, 68, -W, 68, H, 0.3, 'fr_bath', 'plaster', [{ a: 0.6, b: 6.2, h: 3.0 }]);
  floor(P, 'mo_marine', -W, 52.2, W, 68, 0.004, 3);
  // barrel vaults with painted coffers (stucco relief)
  for (const [z0, z1] of [[52.2, 57], [57, 62], [62, 68]]) {
    P.add(grid(24, 10, (u, v) => { const a = lerp(0, Math.PI, u); return V(Math.cos(a) * W, H + Math.sin(a) * 1.3, lerp(z0, z1, v)); }), 'plaster', {
      colorFn: p => { const a = Math.atan2(p.y - H, p.x), cu = Math.abs(((a / Math.PI * 8) % 1) - 0.5) < 0.38, cv = Math.abs((((p.z - z0) / 0.8) % 1) - 0.5) < 0.38; return cu && cv ? C(0x8fb0c0) : C(0xefe9dc); }, ao: false, noise: 0.05 });
    for (const z of [z0, z1]) P.add(grid(24, 1, (u, v) => { const a = lerp(0, Math.PI, u); return V(Math.cos(a) * W * lerp(1, 0, v * 0), H + Math.sin(a) * 1.3 * v, z); }), 'plaster', { color: COL.plaster, ao: false });
  }
  // apodyterium: benches with pigeonholes for clothes above
  for (const s of [1, -1]) {
    P.add(xf(block(0.45, 0.45, 4.2, 0.03), [s * 3.0, 0, 54.6]), 'marble', { color: COL.marble });
    for (let i = 0; i < 6; i++) {
      P.add(box(0.06, 0.5, 0.46, s * 3.2, 1.6, 52.9 + i * 0.66), 'plaster', { color: C(0xefe9dc) });
      if (i < 5) P.add(box(0.02, 0.36, 0.5, s * 3.36, 1.67, 53.23 + i * 0.66), 'plaster', { color: C(0x5a6a72) });
    }
    P.add(box(0.3, 0.05, 4.2, s * 3.2, 2.12, 54.6), 'plaster', { color: C(0xefe9dc) });
    P.add(box(0.3, 0.05, 4.2, s * 3.2, 1.58, 54.6), 'plaster', { color: C(0xefe9dc) });
  }
  // tepidarium: bronze brazier and benches; a broken floor patch shows the hypocaust pillars below
  P.add(lathe([[0, 0], [0.4, 0.3], [0.55, 0.35], [0.55, 0.42], [0, 0.42]], 28).translate(-2.4, 0.3, 59.5), 'bronze', { color: COL.bronze });
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3; P.add(xf(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), [-2.4 + Math.cos(a) * 0.35, 0.15, 59.5 + Math.sin(a) * 0.35]), 'bronze', { color: COL.bronze }); }
  for (let i = 0; i < 16; i++) P.add(xf(new THREE.IcosahedronGeometry(0.05, 0), [-2.4 + rr(-0.35, 0.35), 0.74, 59.5 + rr(-0.35, 0.35)]), 'stone', { color: pick([COL.fire, C(0x3a2a22)]), ao: false });
  P.add(xf(block(0.45, 0.45, 3.0, 0.03), [3.0, 0, 59.5]), 'marble', { color: COL.marble });
  P.add(box(1.2, 0.01, 1.4, 2.6, -0.01, 58.4), 'stone', { color: C(0x2a201a) });
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) for (let b = 0; b < 6; b++) P.add(box(0.2, 0.06, 0.2, 2.2 + i * 0.4, -0.6 + b * 0.065, 57.9 + k * 0.45), 'terracotta', { color: tint(COL.terra, rr(0.85, 1.1)) });
  P.add(box(1.2, 0.6, 0.02, 2.6, -0.6, 57.7), 'terracotta', { color: COL.terraDk }); P.add(box(1.2, 0.02, 1.4, 2.6, -0.61, 58.4), 'stone', { color: C(0x2a201a) });
  obstacles.push({ type: 'hypocaust hole', lane: 2, z0: 57.7, z1: 59.1, act: 'jump' });
  // caldarium: heated pool (alveus) along the right wall, labrum basin in the apse, steam window
  P.add(xf(block(1.9, 0.5, 4.2, 0.03), [2.4, 0, 65]), 'marble', { color: COL.marble, noise: 0.05 });
  P.add(box(1.6, 0.02, 3.9, 2.45, 0.48, 65), 'water', { color: C(0x6a9aa0), ao: false });
  for (let i = 0; i < 3; i++) P.add(xf(block(0.25, 0.18 + i * 0.16, 3.9, 0.02), [1.4 + i * 0.25, 0, 65]), 'marble', { color: COL.marble });
  obstacles.push({ type: 'hot pool', lane: 2, z0: 62.9, z1: 67.1, act: 'dodge' });
  P.add(lathe([[0, 0], [0.22, 0], [0.16, 0.08], [0.12, 0.7], [0.2, 0.75], [0.62, 0.85], [0.66, 0.95], [0.6, 0.97], [0.2, 0.92], [0, 0.92]], 40).translate(-2.3, 0, 66.6), 'marble', { color: COL.marble, noise: 0.05 });
  P.add(new THREE.CircleGeometry(0.58, 32).rotateX(-Math.PI / 2).translate(-2.3, 0.9, 66.6), 'water', { color: C(0x6a9aa0), ao: false });
  obstacles.push({ type: 'labrum', lane: 0, z0: 66.0, z1: 67.2, act: 'dodge' });
  // small round window in the end wall vault
  P.add(new THREE.TorusGeometry(0.35, 0.05, 8, 24).translate(0, 4.1, 67.85), 'stone', { color: COL.marble });
  // wooden bath clogs and a strigil left on the bench
  P.add(xf(new THREE.TorusGeometry(0.06, 0.012, 6, 14, Math.PI * 1.3), [-3.0, 0.47, 53.5], [Math.PI / 2, 0, 0]), 'bronze', { color: COL.bronze });
  for (const dx of [-0.1, 0.1]) P.add(xf(block(0.1, 0.06, 0.26, 0.02), [-2.6 + dx, 0, 55.5]), 'wood', { color: COL.wood });
}

// ---------------- BACK DOOR (posticum) z 68–70 and outer shell/roofs
{
  const P = part('Villa_BackDoor');
  solidWall(P, -2.8, 68.15, -2.8, 70, 3.4, 0.3, 'plaster', 'fr_first');
  solidWall(P, 2.8, 70, 2.8, 68.15, 3.4, 0.3, 'plaster', 'fr_first');
  floor(P, 'signinum', -2.8, 68, 2.8, 70, 0.004, 2);
  ceiling(P, -2.8, 68.15, 2.8, 70, 3.4, 'x');
  solidWall(P, -9.6, 70, -2.8, 70, 4.6, 0.4, 'plaster', 'plaster'); solidWall(P, 2.8, 70, 9.6, 70, 4.6, 0.4, 'plaster', 'plaster');
  P.add(box(5.6, 1.2, 0.4, 0, 3.4, 70), 'plaster', { color: COL.plaster });
  P.add(xf(block(5.6, 0.08, 0.5, 0.02), [0, 0, 69.9]), 'stone', { color: COL.marbleDk });
  for (const s of [1, -1]) P.add(box(0.08, 3.2, 2.6, s * 2.65, 0.05, 68.9), 'wood', { color: COL.woodDk, noise: 0.15, freq: 12 });
  // outer roofs over the rooms so the house reads correctly from above
  const R = part('Villa_Roofs');
  tiledRoof(R, V(-3.6, 5.0, 25.2), V(3.6, 5.0, 25.2), V(3.6, 6.0, 22.6), V(-3.6, 6.0, 22.6));        // tablinum gable
  tiledRoof(R, V(3.6, 5.0, 20.0), V(-3.6, 5.0, 20.0), V(-3.6, 6.0, 22.6), V(3.6, 6.0, 22.6));
  tiledRoof(R, V(-3.6, 4.8, 52.0), V(-3.6, 4.8, 68.3), V(0, 5.6, 68.3), V(0, 5.6, 52.0));             // bath roof over the vaults
  tiledRoof(R, V(3.6, 4.8, 68.3), V(3.6, 4.8, 52.0), V(0, 5.6, 52.0), V(0, 5.6, 68.3));
  for (const s of [1, -1]) {
    tiledRoof(R, V(s * 10.2, 3.5, 6.2), V(s * 10.2, 3.5, 20.1), V(s * 7.0, 4.4, 20.1), V(s * 7.0, 4.4, 6.2));   // side rooms
    tiledRoof(R, V(s * 9.8, 4.6, 52.0), V(s * 9.8, 4.6, s > 0 ? 58.2 : 60.7), V(s * 3.4, 5.0, s > 0 ? 58.2 : 60.7), V(s * 3.4, 5.0, 52.0));
    tiledRoof(R, V(s * 2.95, 4.6, 0), V(s * 2.95, 4.6, 6.2), V(0, 5.3, 6.2), V(0, 5.3, 0));          // fauces
  }
  // ground under and around the house
  floor(R, 'soil', -14, -6, 14, 76, -0.02, 2, { color: C(0x5a5048), ao: false });
}

// ================================================================== EXPORT
const root = new THREE.Group(); root.name = 'Pompeii_Villa';
root.userData = {
  route: 'Enter at z = 0 (street door), exit at z = 70 (back door). Run along +Z; lanes at x = -1.8, 0, 1.8.',
  obstacles,
};
let total = 0;
const built = [];
for (const p of parts) { const g = p.build(); built.push(g); total += g.userData.tris; console.log(`${p.name.padEnd(18)} ${String(Math.round(g.userData.tris)).padStart(7)} tris, ${g.children.length} meshes`); }
if (!HD) {
  // The game's version: the whole house as one mesh per material (one draw call each).
  const byMat = new Map();
  for (const g of built) for (const m of g.children) {
    if (!byMat.has(m.material)) byMat.set(m.material, []);
    byMat.get(m.material).push(m.geometry);
  }
  for (const [mat, geos] of byMat) {
    const geo = mergeGeometries(geos);
    if (!geo) throw new Error(`could not merge ${mat.name}`);
    const m = new THREE.Mesh(geo, mat); m.name = `Villa_${mat.name}`; root.add(m);
  }
  const scene = new THREE.Scene(); scene.add(root);
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
  writeFileSync('villa.glb', Buffer.from(glb));
  console.log(`villa.glb: ${(glb.byteLength / 1048576).toFixed(2)} MB, ${Math.round(total)} tris, ${byMat.size} meshes, obstacles: ${obstacles.length}`);
  process.exit(0);
}
for (const g of built) root.add(g);
const scene = new THREE.Scene(); scene.add(root);
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync('pompeii-villa-hd.glb', Buffer.from(glb));
console.log(`pompeii-villa-hd.glb: ${(glb.byteLength / 1048576).toFixed(2)} MB, ${Math.round(total)} tris, obstacles: ${obstacles.length}`);

// lite copy for the web preview: same geometry, images stripped (the page loads tex/<material>.jpg|png)
for (const m of Object.values(MATS)) { m.userData.tex = m.map ? m.name : null; m.map = null; m.normalMap = null; }
const lite = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync('pompeii-villa-hd-lite.glb', Buffer.from(lite));
console.log(`lite: ${(lite.byteLength / 1048576).toFixed(2)} MB`);
