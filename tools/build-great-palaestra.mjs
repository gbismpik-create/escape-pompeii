// Escape Pompeii — the Great Palaestra (Palestra Grande, Augustan, for the youth associations) as a runner level.
// After the real monument: 141 × 107 m, colonnades on three sides (48 / 48 / 35 columns), a 35 × 22 m pool in the middle,
// double rows of plane trees for shade (known from root casts), a high crenellated wall with gates, a hall on the west side.
// Output: great-palaestra.glb, the game's phone version (npm run build:palaestra). With PALAESTRA_QUALITY=hd, as designed:
// pompeii-great-palaestra.glb (+ -lite.glb, ptexout/*).
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createCanvas, ImageData as NapiImageData } from '@napi-rs/canvas';
globalThis.ImageData = NapiImageData;
import { writeFileSync, mkdirSync } from 'node:fs';
import * as TX from './villa-textures.mjs';
import * as AT from './amph-textures.mjs';
import * as BT from './baths-textures.mjs';
import * as PT from './palaestra-textures.mjs';

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
const HD = process.env.PALAESTRA_QUALITY === 'hd';
const Q = HD
  ? { texScale: 1, lathe: 56, ell: [28, 18], colRad: 100, colRows: 16, colSeg: 48, flutes: true, light: 16, limb: 1, leaves: 1, treeDepth: 3, seeds: true }
  : { texScale: 0.25, lathe: 14, ell: [10, 7], colRad: 16, colRows: 3, colSeg: 12, flutes: false, light: 8, limb: 0.45, leaves: 0.5, treeDepth: 2, seeds: false };

// ---------------------------------------------------------------- textures + materials
const TEXDIR = 'ptexout'; if (HD) mkdirSync(TEXDIR, { recursive: true });
function tex(canvas, repeat = true, key = null, png = false, linear = false) {
  if (!HD) {
    // the phone version: a quarter of the size, no preview files (cut-out leaves and normal maps keep half)
    const k = png ? Math.max(Q.texScale, 0.5) : Q.texScale;
    const small = createCanvas(Math.max(64, Math.round(canvas.width * k)), Math.max(64, Math.round(canvas.height * k)));
    small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
    canvas = small; key = null;
  }
  if (key) writeFileSync(`${TEXDIR}/${key}.${png ? 'png' : 'jpg'}`, png ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg', 84));
  const w = canvas.width, h = canvas.height, src = canvas.getContext('2d').getImageData(0, 0, w, h).data, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) data.set(src.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat); t.flipY = false; t.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.needsUpdate = true;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.userData.mimeType = png ? 'image/png' : 'image/jpeg'; t.anisotropy = 8;
  return t;
}
const T0 = Date.now(), lap = n => console.log(`  ${n} ${((Date.now() - T0) / 1000).toFixed(0)}s`);
const TEX = {}, paint = (k, fn, repeat = true, png = false) => { TEX[k] = tex(fn(), repeat, k, png); lap(k); };
paint('portico', PT.porticoWall); paint('fourthY', () => TX.fourthStyle('#c58f2c'));
paint('basalt', BT.basaltPaving); paint('marble', TX.marbleTexture); paint('signinum', TX.signinum); paint('grass', TX.grassTexture); paint('gravel', TX.gravelTexture);
paint('sand', AT.arenaSand); paint('seat', AT.seatStone);
paint('leaf_vine', () => TX.leafCluster('vine'), false, true);
paint('leaf_plane', PT.planeLeaves, false, true); paint('bark', PT.planeBark); paint('stucco', () => PT.columnStucco((0.36 + (6.2 - 0.62 - 0.36) / 3) / 6.2), false);
const waterN = tex(TX.waterNormal(), true, 'water_n', true, true);
const MATS = {};
for (const [k, t] of Object.entries(TEX)) { const leafy = k.startsWith('leaf_'); MATS[k] = new THREE.MeshStandardMaterial({ name: k, map: t, vertexColors: true, roughness: k === 'marble' ? 0.25 : leafy ? 0.8 : 0.88, side: THREE.DoubleSide, alphaTest: leafy ? 0.5 : 0 }); }
const plain = { plaster: [0.92, 0], stone: [0.85, 0], terracotta: [0.8, 0], wood: [0.78, 0], bronze: [0.38, 0.8], cloth: [0.95, 0], plant: [0.9, 0], soil: [1, 0] };
for (const [k, [r, m]] of Object.entries(plain)) MATS[k] = new THREE.MeshStandardMaterial({ name: k, color: 0xffffff, vertexColors: true, roughness: r, metalness: m, side: THREE.DoubleSide });
MATS.water = new THREE.MeshStandardMaterial({ name: 'water', color: 0xffffff, vertexColors: true, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.84, side: THREE.DoubleSide, normalMap: waterN, normalScale: new THREE.Vector2(0.6, -0.6) });
const AUTO_UV = { marble: 0.9, sand: 6, signinum: 2, basalt: 4, seat: 2, grass: 3, gravel: 2, water: 1.4 };
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
      if (opts.aoFloor !== undefined) k *= 0.72 + 0.28 * smooth((p.y - opts.aoFloor) / 0.9);        // fake occlusion near the floor
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
const ell = (rx, ry, rz, w = Q.ell[0], h = Q.ell[1]) => new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz);
const tint = (c, k) => new THREE.Color(c.r * k, c.g * k, c.b * k);

// wall face between (x0,z0) and (x1,z1) from y0 to y1, with openings [{a, b, h}] measured along the wall.
// uv: u = distance / 2H, v = y / H (fresco is 2:1 and designed for the full wall height H, so it is never stretched).
function wall(P, mat, x0, z0, x1, z1, y1, openings = [], H = y1, side = 0) {
  const L = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / L, dz = (z1 - z0) / L;
  const nx = -dz, nz = dx;                       // face normal (left of direction)
  const rect = (a, b, ya, yb) => {
    if (b - a < 0.01 || yb - ya < 0.01) return;
    const nu = Math.max(1, Math.round((b - a) / 2)), nv = Math.max(1, Math.round((yb - ya) / 1.5));
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
  P.add(grid(n, 6, (u, v) => a.clone().lerp(b, u).lerp(d.clone().lerp(c, u), v)), 'terracotta', { colorFn: () => tint(COL.terra, 0.85), ao: false, noise: 0.14, freq: 3 });
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, e = a.clone().lerp(b, t), r = d.clone().lerp(c, t);
    const len = e.distanceTo(r);
    const g = new THREE.CylinderGeometry(0.07, 0.08, len, HD ? 6 : 3, 1, true, 0, Math.PI); g.rotateZ(Math.PI / 2); g.rotateY(Math.PI / 2);
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
  P.add(grid(HD ? 40 : 12, HD ? 16 : 3, (u, v) => {
    const a = u * TAU, y = y0 + v * (yc - y0), r = R * (1.06 - 0.16 * Math.pow(v, 1.6));
    const f = y > low + 0.03 ? R * 0.055 * Math.pow(Math.abs(Math.cos(a * flutes / 2)), 0.6) * smooth((y - low) / 0.08) : 0;
    return V(x + Math.sin(a) * (r - f), y, z + Math.cos(a) * (r - f));
  }, true, mat === 'marble' ? (u, v) => [u * 2, v * 3] : null), mat, { colorFn: p => (mat === 'plaster' && p.y < low ? COL.red.clone() : mat === 'marble' ? COL.marble : C(0xf0e9da)), noise: 0.04 });
  // Attic base: plinth + torus + scotia + torus
  P.add(xf(block(R * 2.7, 0.08, R * 2.7, 0.015), [x, 0, z]), 'marble', { color: COL.marble });
  P.add(lathe([[R * 1.3, 0.08], [R * 1.36, 0.11], [R * 1.3, 0.14], [R * 1.12, 0.16], [R * 1.08, 0.19], [R * 1.18, 0.21], [R * 1.12, 0.24], [R * 1.06, 0.245], [0, 0.245]], 28).translate(x, 0, z), 'marble', { color: COL.marble });
  const cm = mat === 'marble' ? 'marble' : 'plaster', cc = mat === 'marble' ? COL.marble : C(0xf0e9da);
  // astragal ring under the capital
  P.add(xf(new THREE.TorusGeometry(R * 0.92, R * 0.06, HD ? 8 : 4, HD ? 48 : 12), [x, yc, z], [Math.PI / 2, 0, 0]), cm, { color: cc });
  if (ionic) {
    // echinus carved with egg-and-dart, then the volute cushion and abacus
    P.add(grid(HD ? 64 : 16, HD ? 6 : 2, (u, v) => { const a = u * TAU, egg = 0.5 + 0.5 * Math.cos(a * 16); const r = R * (0.92 + 0.3 * Math.sin(v * Math.PI * 0.5)) + egg * R * 0.05 * Math.sin(v * Math.PI); return V(x + Math.sin(a) * r, yc + v * 0.12, z + Math.cos(a) * r); }, true), cm, { color: cc });
    P.add(xf(block(R * 2.5, 0.1, R * 2.2, 0.02), [x, yc + 0.12, z]), cm, { color: cc });
    P.add(xf(block(R * 2.9, 0.06, R * 2.6, 0.01), [x, yc + 0.3, z]), cm, { color: cc });
    for (const sx of [1, -1]) {
      // cushion (pulvinus) running front to back, waisted by a balteus band
      P.add(grid(HD ? 24 : 8, HD ? 16 : 4, (u, v) => { const a = u * TAU, zz = lerp(-R * 1.1, R * 1.1, v), waist = 1 - 0.25 * Math.exp(-Math.pow(zz / (R * 0.25), 2)), r = 0.085 * waist; return V(x + sx * R * 1.15 + Math.cos(a) * r, yc + 0.17 + Math.sin(a) * r, z + zz); }, true), cm, { color: cc });
      // spiral volutes on the front and back faces
      for (const sz of [1, -1]) {
        const pts = []; for (let t = 0; t <= 1; t += 0.02) { const ang = t * TAU * 2.6, rad = lerp(0.1, 0.018, t); pts.push(V(x + sx * (R * 1.15 + Math.cos(ang) * rad), yc + 0.17 + Math.sin(ang) * rad * sx, z + sz * R * 1.12)); }
        P.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), HD ? 120 : 20, 0.013, HD ? 6 : 3), cm, { color: cc });
        P.add(xf(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 32), [x + sx * R * 1.15, yc + 0.17, z + sz * R * 1.1], [Math.PI / 2, 0, 0]), cm, { color: tint(cc, 0.93) });
        P.add(xf(new THREE.SphereGeometry(0.022, 12, 8), [x + sx * R * 1.15, yc + 0.17, z + sz * R * 1.13]), cm, { color: cc });
      }
    }
  } else {
    // Tuscan: echinus quarter-round + abacus, painted like the Pompeian stucco capitals
    P.add(lathe([[R * 0.92, 0], [R * 0.95, 0.03], [R * 1.12, 0.12], [R * 1.32, 0.2], [R * 1.36, 0.22], [0, 0.22]], 28).translate(x, yc, z), cm, { color: cc });
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
  const curve = new THREE.CatmullRomCurve3(pts), n = Math.max(3, pts.length + 2);
  const frames = curve.computeFrenetFrames(n, false);
  P.add(grid(radial, n, (u, v) => {
    const i = Math.round(v * n), c = curve.getPointAt(v), r = lerp(r0, r1, v) * (1 + 0.08 * Math.sin(u * TAU * 3 + v * 9)), a = u * TAU;
    return c.clone().addScaledVector(frames.normals[i], Math.cos(a) * r).addScaledVector(frames.binormals[i], Math.sin(a) * r);
  }, true), 'wood', { color: col, noise: 0.25, freq: 14, ao: false });
}
// branching broadleaf tree (lemon, laurel, pomegranate-like) – recursive limbs, leaf cards at the twigs
function tree(P, x, z, h = 3.4, kind = 'lemon', opts = {}) {
  if (kind === 'cypress') return cypress(P, x, z, h);
  const leafMat = { lemon: 'leaf_lemon', laurel: 'leaf_laurel', plane: 'leaf_vine' }[kind] ?? 'leaf_laurel', bark = kind === 'plane' ? C(0x7f7a62) : COL.woodDk, maxD = opts.light ? 2 : 3;
  const crownC = V(x, h * 0.68, z), tips = [];
  const grow = (p0, dir, len, r, depth) => {
    const pts = [p0.clone()]; let d = dir.clone();
    for (let k = 1; k <= 3; k++) { d.add(V(rr(-0.25, 0.25), rr(-0.05, 0.15), rr(-0.25, 0.25))).normalize(); pts.push(pts[k - 1].clone().addScaledVector(d, len / 3)); }
    if (depth < maxD) limb(P, pts, r, r * 0.62, bark, opts.light ? (depth < 1 ? 7 : 4) : (depth < 1 ? 10 : depth < 2 ? 7 : 5));
    if (depth >= maxD) { tips.push(pts[3], pts[2], pts[1]); return; }
    if (depth === maxD - 1 && !light) tips.push(pts[2].clone().lerp(pts[3], 0.5));
    const kids = depth === 0 ? 4 : 3;
    for (let i = 0; i < kids; i++) {
      const t = depth === 0 ? 3 : pick([2, 3]), base = pts[t];
      const out = V(Math.cos(i / kids * TAU + rr(-0.4, 0.4) + depth), 0, Math.sin(i / kids * TAU + rr(-0.4, 0.4) + depth));
      const nd = d.clone().multiplyScalar(0.55).addScaledVector(out, 0.75).add(V(0, 0.35, 0)).normalize();
      grow(base, nd, len * rr(0.6, 0.75), r * 0.6, depth + 1);
    }
  };
  grow(V(x, 0, z), V(rr(-0.08, 0.08), 1, rr(-0.08, 0.08)).normalize(), h * 0.42, h * 0.035, 0);
  const per = opts.light ? 12 : Math.round(5 * Math.pow(Math.max(1, h / 3.6), 0.75)), sz = Math.min(2.7, h / 3.6) * (opts.light ? 1.4 : 1);
  for (const tp of tips) for (let k = 0; k < per; k++) {
    const p = tp.clone().add(V(rr(-0.35, 0.35), rr(-0.25, 0.3), rr(-0.35, 0.35)).multiplyScalar(h / 3.4));
    leafCard(P, leafMat, p.x, p.y, p.z, rr(0.6, 0.95) * sz, crownC, { flatY: 0.8 });
  }
}
// Italian cypress: slim spindle of dense foliage cards around a trunk
function cypress(P, x, z, h) {
  limb(P, [V(x, 0, z), V(x, h * 0.5, z), V(x, h * 0.95, z)], h * 0.03, h * 0.008, COL.woodDk, 8);
  const n = Math.round(h * 85);
  for (let i = 0; i < n; i++) {
    const t = Math.pow(rnd(), 0.85), y = lerp(0.35, h, t), rad = h * 0.13 * Math.sin(Math.PI * Math.pow(lerp(0.06, 1, t), 0.8)) * (t > 0.85 ? (1 - t) * 6.6 : 1);
    const a = rr(0, TAU), d = rad * Math.sqrt(rr(0.3, 1));
    leafCard(P, 'leaf_cypress', x + Math.cos(a) * d, y, z + Math.sin(a) * d, rr(0.35, 0.55), V(x, y, z), { face: V(Math.cos(a), 0.15, Math.sin(a)), flatY: 0.3 });
  }
}
// clipped box hedge: dark core plus small-leaf cards covering its surface
function hedge(P, x0, z0, x1, z1, h = 0.5, w = 0.42) {
  const L = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / L, dz = (z1 - z0) / L, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  P.add(xf(block(w * 0.86, h * 0.9, L + w * 0.86, w * 0.3, 3), [cx, 0, cz], [0, Math.atan2(dx, dz), 0]), 'plant', { color: C(0x2c4423), noise: 0.2, ao: false });
  const n = Math.round(L * 60);
  for (let i = 0; i < n; i++) {
    const s = rr(-0.03, L + 0.03), side = rnd(), along = V(x0 + dx * s, 0, z0 + dz * s);
    let p, f;
    if (side < 0.42) { const sd = rnd() < 0.5 ? 1 : -1; p = along.clone().add(V(-dz * sd * w / 2, rr(0.08, h), dx * sd * w / 2)); f = V(-dz * sd, 0.2, dx * sd); }
    else { p = along.clone().add(V(-dz * rr(-w / 2, w / 2), h + rr(-0.03, 0.02), dx * rr(-w / 2, w / 2))); f = V(0, 1, 0); }
    leafCard(P, 'leaf_box', p.x, p.y, p.z, rr(0.3, 0.42), V(p.x - f.x * 0.3, p.y - f.y * 0.3 - 0.05, p.z - f.z * 0.3), { face: f });
  }
}
// flowering shrub (roses / oleander / acanthus)
function shrub(P, x, z, r = 0.5, h = 0.8, kind = 'rose') {
  const c = V(x, h * 0.5, z);
  P.add(xf(ell(r * 0.7, h * 0.45, r * 0.7, 14, 10), [x, h * 0.45, z]), 'plant', { color: C(0x263c1e), ao: false, noise: 0.2 });
  for (let i = 0; i < 150 * r; i++) {
    const a = rr(0, TAU), el = rr(-0.2, 1.2), p = V(x + Math.cos(a) * Math.cos(el) * r * 0.8, h * 0.45 + Math.sin(el) * h * 0.5, z + Math.sin(a) * Math.cos(el) * r * 0.8);
    leafCard(P, kind === 'rose' ? 'leaf_rose' : 'leaf_laurel', p.x, p.y, p.z, rr(0.35, 0.5), c, { face: p.clone().sub(c).normalize() });
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
  for (let i = 0; i < 40; i++) { const a = rr(-1.4, 1.4), y = rr(-0.13, -0.02); P.add(xf(new THREE.IcosahedronGeometry(0.022, 0), [x + Math.sin(a + rot) * 0.095, 1.42 + y, z + Math.cos(a + rot) * 0.095]), 'marble', { color: COL.marble }); }   // beard
  for (let i = 0; i < 50; i++) { const a = rr(0, TAU), y = rr(0.02, 0.12); P.add(xf(new THREE.IcosahedronGeometry(0.022, 0), [x + Math.sin(a) * 0.1, 1.42 + y, z + Math.cos(a) * 0.1]), 'marble', { color: COL.marble }); }
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

// ================================================================== GREAT PALAESTRA
// 141 × 107 m, long axis along +Z (west gate z = 0 → east gate z = 141, towards the amphitheatre).
// Route: the shaded avenue between a double row of plane trees beside the near colonnade (lanes x = -1.8, 0, 1.8).
// Near portico x 8.5–17.75, court x -80.5–8.5 with the 35 × 22 m pool at x -47…-25, z 53–88, far portico to x -89.75,
// west portico z 0.25–9 with the central hall behind it.
const parts = [], part = n => { const p = new Part(n); parts.push(p); return p; }, obstacles = [];
const PL = C(0xe6dcc8), RED = COL.red;
function rod(P, a, b, r, mat, color, seg = 8) {
  const len = a.distanceTo(b), g = new THREE.CylinderGeometry(r, r * 0.9, len, seg, 1, false);
  g.translate(0, len / 2, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize())).translate(a.x, a.y, a.z);
  P.add(g, mat, { color });
}
function jambs(P, xa, xb, za, zb, h, color = PL) {
  for (const x of [xa, xb]) P.add(grid(1, 2, (u, v) => V(x, v * h, lerp(za, zb, u))), 'plaster', { color });
  P.add(grid(2, 1, (u, v) => V(lerp(xa, xb, u), h, lerp(za, zb, v))), 'plaster', { color });
}
// a light column for the far colonnades (seen from 40–90 m away)
function lightColumn(P, x, z, H, R) {
  P.add(new THREE.CylinderGeometry(R * 0.9, R, H * 0.36, Q.light, 1, true).translate(x, H * 0.18, z), 'plaster', { color: RED });
  P.add(new THREE.CylinderGeometry(R * 0.82, R * 0.9, H * 0.6, Q.light, 1, true).translate(x, H * 0.36 + H * 0.3, z), 'plaster', { color: C(0xf0e9da) });
  P.add(box(R * 2.9, 0.3, R * 2.9, x, H * 0.96 - 0.3, z), 'plaster', { color: C(0xf0e9da) });
}
const WALL_H = 9, COL_H = 6.2, COL_R = 0.33;
// crenellated outer wall: plain outer face, painted portico face, merlons along the top
function outerWall(P, x0, z0, x1, z1, gates = [], innerMat = 'portico') {
  wall(P, innerMat, x0, z0, x1, z1, WALL_H, gates, 8, 0);
  const L = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / L, dz = (z1 - z0) / L, nx = -dz, nz = dx;
  wall(P, 'plaster', x1 + nx * -0.6, z1 + nz * -0.6, x0 + nx * -0.6, z0 + nz * -0.6, WALL_H, gates.map(g => ({ a: L - g.b, b: L - g.a, h: g.h })), WALL_H, 0);
  P.add(grid(Math.max(1, Math.round(L)), 1, (u, v) => V(x0 + dx * u * L + nx * lerp(0, -0.6, v), WALL_H, z0 + dz * u * L + nz * lerp(0, -0.6, v))), 'stone', { color: C(0xcfc4ac) });
  for (let s = 0.6; s < L - 0.6; s += 1.8) { const cx = x0 + dx * s + nx * -0.3, cz = z0 + dz * s + nz * -0.3; P.add(xf(new THREE.BoxGeometry(0.55, 0.9, 0.9).translate(0, 0.45, 0), [cx, WALL_H, cz], [0, Math.atan2(dx, dz), 0]), 'stone', { color: C(0xd8ccb0) }); }
  for (const gt of gates) { const a = V(x0 + dx * gt.a, 0, z0 + dz * gt.a), b = V(x0 + dx * gt.b, 0, z0 + dz * gt.b); for (const p of [a, b]) P.add(grid(1, 2, (u, v) => V(p.x + nx * lerp(0, -0.6, u), v * gt.h, p.z + nz * lerp(0, -0.6, u))), 'plaster', { color: PL }); P.add(grid(2, 1, (u, v) => { const p = a.clone().lerp(b, u); return V(p.x + nx * lerp(0, -0.6, v), gt.h, p.z + nz * lerp(0, -0.6, v)); }), 'plaster', { color: PL }); }
}


// ---------------- HIGH-DETAIL PLANE TREES: textured bark limbs with root flare, leaf sprays round the twigs, seed balls
function barkLimb(P, pts, r0, r1, radial, flare = 0) {
  const curve = new THREE.CatmullRomCurve3(pts), n = flare ? (HD ? 10 : 5) : Math.max(HD ? 4 : 3, pts.length + (HD ? 2 : 0)), frames = curve.computeFrenetFrames(n, false), L = curve.getLength();
  const ur = Math.max(1, Math.round(TAU * r0 / 0.8));
  P.add(grid(radial, n, (u, v) => {
    const i = Math.round(v * n), c = curve.getPointAt(v), a = u * TAU;
    let r = lerp(r0, r1, v) * (1 + 0.035 * Math.sin(a * 3 + v * 7) + 0.02 * Math.sin(a * 7));
    if (flare) r *= 1 + flare * Math.exp(-v * L / 0.7) * (0.75 + 0.35 * Math.max(0, Math.sin(a * 5 + 1)));    // root buttresses
    return c.clone().addScaledVector(frames.normals[i], Math.cos(a) * r).addScaledVector(frames.binormals[i], Math.sin(a) * r);
  }, false, (u, v) => [u * ur, v * L / 1.6]), 'bark', { keepUV: true, color: C(0xd2cebe), noise: 0.04 });
}
function planeTree(P, x, z, h, light = false) {
  const tips = [], crownC = V(x, h * 0.66, z), rT = h * 0.033, trunkH = h * rr(0.4, 0.46);
  const lean = V(rr(-0.04, 0.04), 1, rr(-0.04, 0.04)).normalize();
  const tpts = [V(x, -0.05, z)]; for (let k = 1; k <= 4; k++) tpts.push(tpts[k - 1].clone().addScaledVector(lean.clone().add(V(rr(-0.03, 0.03), 0, rr(-0.03, 0.03))).normalize(), trunkH / 4));
  barkLimb(P, tpts, rT, rT * 0.8, Math.max(5, Math.round((light ? 10 : 20) * Q.limb)), light ? 0.35 : 0.55);
  const top = tpts[4], maxD = light ? (HD ? 2 : 1) : Q.treeDepth;
  const grow = (p0, dir, len, r, depth) => {
    const pts = [p0.clone()]; let d = dir.clone();
    for (let k = 1; k <= 3; k++) { d.add(V(rr(-0.16, 0.16), rr(-0.06, 0.08), rr(-0.16, 0.16))).normalize(); pts.push(pts[k - 1].clone().addScaledVector(d, len / 3)); }
    if (depth < maxD) barkLimb(P, pts, r, r * 0.66, Math.max(3, Math.round((light ? [7, 5][depth] ?? 4 : [14, 9, 5][depth] ?? 5) * Q.limb)));
    if (depth >= maxD) { tips.push(pts[3], pts[2], pts[1]); return; }
    if (depth === maxD - 1 && !light) tips.push(pts[2].clone().lerp(pts[3], 0.5));
    for (let i = 0; i < 3; i++) {
      const base = pts[depth === 0 ? 3 : pick([2, 3])], ang = i / 3 * TAU + rr(-0.5, 0.5) + depth * 1.3;
      const nd = d.clone().multiplyScalar(0.5).addScaledVector(V(Math.cos(ang), 0, Math.sin(ang)), 0.85).add(V(0, depth === 0 ? 0.45 : 0.2, 0)).normalize();
      grow(base, nd, len * rr(0.62, 0.78), r * 0.62, depth + 1);
    }
  };
  const nS = light ? 3 : HD ? 4 : 3;
  for (let i = 0; i < nS; i++) { const ang = i / nS * TAU + rr(-0.4, 0.4); grow(top, V(Math.cos(ang) * 0.62, 1, Math.sin(ang) * 0.62).normalize(), h * 0.27, rT * 0.64, 0); }
  const per = Math.max(2, Math.round((light ? 6 : 7) * Q.leaves)), sz = h * (light ? 0.17 : 0.11) / Math.sqrt(Math.max(Q.leaves, 0.5));
  for (const tp of tips) for (let k = 0; k < per; k++) {
    const p = tp.clone().add(V(rr(-1, 1), rr(-0.6, 0.7), rr(-1, 1)).multiplyScalar(h * 0.06));
    leafCard(P, 'leaf_plane', p.x, p.y, p.z, rr(0.8, 1.25) * sz, crownC, { flatY: 0.7, tint: C(0xffffff).lerp(C(0xc8e0a0), rr(0, 0.35)) });
  }
  if (!light && Q.seeds) for (let i = 0; i < 16; i++) {      // seed balls on long stalks
    const tp = pick(tips), p = tp.clone().add(V(rr(-0.5, 0.5), -rr(0.4, 0.9), rr(-0.5, 0.5)));
    rod(P, p.clone().add(V(0, 0.4, 0)), p, 0.006, 'wood', C(0x5a4a30), 4);
    P.add(xf(new THREE.IcosahedronGeometry(0.05, 1), [p.x, p.y, p.z]), 'plant', { color: C(0x8a7a40), noise: 0.2, freq: 40 });
  }
}

// ---------------- DORIC COLUMNS: stuccoed, 20 flutes with arrises above the smooth red lower third, entasis, Attic base, ringed capital
function doricColumn(P, x, z, H, R, hi = true) {
  hi = hi && Q.flutes; const yb = 0.36, yc = H - 0.62, low = yb + (yc - yb) / 3, NF = 20, rad = hi ? Q.colRad : Math.min(32, Q.colRad), depth = hi ? R * 0.11 : 0, uoff = rnd();
  const ys = []; const nr = hi ? Q.colRows : Math.min(6, Q.colRows); for (let i = 0; i <= nr; i++) ys.push(lerp(yb, yc, i / nr)); if (hi) ys.push(low - 0.03, low, low + 0.03, low + 0.07, yc - 0.02); ys.sort((a, b) => a - b);
  const flute = a => { const t = ((a / TAU * NF) % 1 + 1) % 1; return Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)); };     // sharp-arris Doric flutes
  const rAt = y => R * (1.0 - 0.15 * Math.pow((y - yb) / (yc - yb), 1.4) + 0.012 * Math.sin(Math.PI * (y - yb) / (yc - yb)));
  P.add(grid(rad, ys.length - 1, (u, v) => {
    const a = u * TAU, y = ys[Math.round(v * (ys.length - 1))], d = depth * smooth((y - low) / 0.07) * flute(a), r = rAt(y) - d;
    return V(x + Math.sin(a) * r, y, z + Math.cos(a) * r);
  }, false, (u, v) => [u + uoff, ys[Math.round(v * (ys.length - 1))] / H]), 'stucco', { keepUV: true, noise: 0.02, colorFn: p => { const k = p.y > low + 0.04 && hi ? 1 - 0.28 * flute(Math.atan2(p.x - x, p.z - z)) : 1; return new THREE.Color(k, k, k); } });
  const seg = HD ? (hi ? 48 : 16) : 8, W = C(0xf2ecdf);
  // Attic base on a square plinth
  P.add(xf(block(R * 2.9, 0.12, R * 2.9, 0.012, 2), [x, 0, z]), 'plaster', { color: W });
  const prof = [[1.38, 0.12], [1.42, 0.135], [1.44, 0.16], [1.42, 0.19], [1.36, 0.205], [1.24, 0.212], [1.2, 0.222], [1.12, 0.235], [1.08, 0.255], [1.1, 0.27], [1.18, 0.28], [1.22, 0.295], [1.2, 0.315], [1.13, 0.33], [1.06, 0.34], [1.02, 0.35], [1.0, 0.36]];
  const thin = (pts, k) => (HD ? pts : pts.filter((_, i) => i % k === 0 || i === pts.length - 1)); // the phone: fewer rings
  P.add(lathe(thin(prof, 4).map(([r, y]) => [r * R, y]), seg).translate(x, 0, z), 'plaster', { color: W });
  // capital: necking with three annulets, curved echinus, abacus
  const rT = rAt(yc), cap = [[rT, 0], [rT, 0.07], [rT + 0.022, 0.08], [rT + 0.022, 0.095], [rT, 0.1], [rT + 0.022, 0.11], [rT + 0.022, 0.125], [rT, 0.13], [rT + 0.022, 0.14], [rT + 0.022, 0.155], [rT + 0.01, 0.165]];
  for (let k = 0; k <= 8; k++) { const t = k / 8; cap.push([lerp(rT + 0.01, R * 1.42, Math.sin(t * Math.PI / 2) ** 0.8), 0.165 + 0.22 * (1 - Math.cos(t * Math.PI / 2))]); }
  cap.push([R * 1.42, 0.4], [0, 0.4]);
  P.add(lathe(thin(cap, 3), seg).translate(x, yc, z), 'plaster', { color: W });
  P.add(xf(block(R * 3.0, 0.22, R * 3.0, 0.02, 2), [x, yc + 0.4, z]), 'plaster', { color: W });
}

// ---------------- ENCLOSURE, PORTICOES, COLONNADES
{
  const P = part('Palaestra_Porticoes');
  outerWall(P, 17.75, 0.25, 17.75, 140.75);                                                         // near long side
  outerWall(P, -89.75, 140.75, -89.75, 0.25);                                                       // far long side
  outerWall(P, -89.75, 0.25, 17.75, 0.25, [{ a: 87.25, b: 92.25, h: 4.2 }, { a: 47.75, b: 59.75, h: 6.2 }]);   // west: gate on the route, the central hall
  outerWall(P, 17.75, 140.75, -89.75, 140.75, [{ a: 15.25, b: 20.25, h: 4.2 }, { a: 50, b: 54, h: 4.2 }]);  // east: gate towards the amphitheatre
  // portico floors (opus signinum) and the colonnades with their entablature
  floor(P, 'signinum', 8.3, 0.25, 17.75, 140.75, 0.01, 2, { color: C(0xffffff) });
  floor(P, 'signinum', -89.75, 0.25, -80.3, 140.75, 0.01, 2, { color: C(0xffffff) });
  floor(P, 'signinum', -80.3, 0.25, 8.3, 9.2, 0.01, 2, { color: C(0xffffff) });
  const near = []; for (let k = 0; k < 48; k++) near.push(9 + k * (139.6 - 9) / 47);
  for (const z of near) doricColumn(P, 8.5, z, COL_H, COL_R, true);
  for (let k = 1; k < 48; k++) doricColumn(P, -80.5, 9 + k * (139.6 - 9) / 47, COL_H, COL_R, false);
  const west = [2.6, 5.55, 8.5]; for (let k = 0; k < 30; k++) west.push(-2.6 - k * (77.9 / 29));
  for (const x of west) doricColumn(P, x, 9, COL_H, COL_R, Math.abs(x) < 16);
  const ent = (w, d, x, z) => P.add(box(w, 0.5, d, x, COL_H, z), 'plaster', { colorFn: p => (p.y > COL_H + 0.35 ? RED.clone() : C(0xefe8d8)) });
  ent(0.6, 131.4, 8.5, 75.1); ent(0.6, 131.4, -80.5, 75.1); ent(89.6, 0.6, -36, 9);
  // lean-to tiled roofs with boarded ceilings beneath
  const yC = COL_H + 0.5, yW = 8.6;
  for (const [a, b, c, d] of [[V(8.2, yC, 9), V(8.2, yC, 140.75), V(17.75, yW, 140.75), V(17.75, yW, 9)],
    [V(-80.2, yC, 140.75), V(-80.2, yC, 9), V(-89.75, yW, 9), V(-89.75, yW, 140.75)], [V(17.75, yC, 9.3), V(-89.75, yC, 9.3), V(-89.75, yW, 0.25), V(17.75, yW, 0.25)]]) {
    tiledRoof(P, a, b, c, d); P.add(grid(24, 4, (u, v) => a.clone().lerp(b, u).lerp(d.clone().lerp(c, u), v).add(V(0, -0.12, 0))), 'wood', { color: COL.woodLt, noise: 0.12 });
  }
  // statues of athletes and benches along the near colonnade (outside the lanes)
  const athlete = (x, z, rot) => {
    P.add(xf(block(0.9, 1.2, 0.9, 0.03), [x, 0, z]), 'marble', { color: COL.marbleDk });
    const m = new THREE.Matrix4().makeRotationY(rot).setPosition(x, 1.2, z), L = (a, b, c) => V(a, b, c).applyMatrix4(m), r = (a, b, w) => rod(P, a, b, w, 'marble', COL.marble, 12);
    r(L(-0.12, 0.05, 0), L(-0.14, 0.92, 0.02), 0.075); r(L(0.13, 0.05, 0.12), L(0.12, 0.92, 0), 0.075);
    P.add(xf(ell(0.2, 0.36, 0.13, 20, 14), [L(0, 1.25, 0).x, L(0, 1.25, 0).y, L(0, 1.25, 0).z], [0, rot, 0]), 'marble', { color: COL.marble });
    P.add(xf(ell(0.1, 0.13, 0.11), [L(0, 1.78, 0.02).x, L(0, 1.78, 0.02).y, L(0, 1.78, 0.02).z]), 'marble', { color: COL.marble });
    r(L(-0.22, 1.5, 0), L(-0.3, 1.0, 0.1), 0.05); r(L(0.22, 1.5, 0), L(0.42, 1.85, 0.1), 0.05);
    P.add(xf(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 24), [L(0.45, 1.95, 0.1).x, L(0.45, 1.95, 0.1).y, L(0.45, 1.95, 0.1).z], [Math.PI / 2, rot, 0]), 'bronze', { color: COL.bronze });   // discus held high
  };
  for (let k = 0; k < 9; k++) { const z = 24 + k * 13.5; if (!(k % 2)) P.add(xf(block(0.55, 0.45, 2.4, 0.03), [7.3, 0, z]), 'seat', { color: C(0xd8ccb0) }); }
  for (const z of [37.5, 70.5, 91.5, 118.5]) P.add(xf(block(0.9, 1.2, 0.9, 0.03), [7.2, 0, z]), 'marble', { color: COL.marbleDk });   // pedestals; the sculpted statues come from pompeii-palaestra-statues.glb
}

// ---------------- CENTRAL HALL on the west side (a room for the cult of the emperor, opening onto the portico)
{
  const P = part('Palaestra_Hall');
  const x0 = -44, x1 = -28, z0 = -9, z1 = 0.25, H = 7;
  wall(P, 'fourthY', x0, z1, x0, z0, H, [], H, 0); wall(P, 'fourthY', x1, z0, x1, z1, H, [], H, 0); wall(P, 'fourthY', x0, z0, x1, z0, H, [{ a: 6, b: 10, h: 4.6 }], H, 0);
  floor(P, 'marble', x0, z0, x1, z1, 0.02, 0.9, { color: C(0xe0ddd6) });
  P.add(box(x1 - x0, 0.3, z1 - z0, (x0 + x1) / 2, H, (z0 + z1) / 2), 'plaster', { color: PL });
  wall(P, 'plaster', x0 - 0.4, z0 - 2.4, x0 - 0.4, z1, H + 0.3, [], H, 0); wall(P, 'plaster', x1 + 0.4, z1, x1 + 0.4, z0 - 2.4, H + 0.3, [], H, 0); wall(P, 'plaster', x1 + 0.4, z0 - 2.4, x0 - 0.4, z0 - 2.4, H + 0.3, [], H, 0);
  tiledRoof(P, V(x0 - 0.6, H + 0.3, z0 - 2.6), V(x1 + 0.6, H + 0.3, z0 - 2.6), V(x1 + 0.6, H + 1.6, (z0 + z1) / 2), V(x0 - 0.6, H + 1.6, (z0 + z1) / 2)); tiledRoof(P, V(x1 + 0.6, H + 0.3, z1 + 0.3), V(x0 - 0.6, H + 0.3, z1 + 0.3), V(x0 - 0.6, H + 1.6, (z0 + z1) / 2), V(x1 + 0.6, H + 1.6, (z0 + z1) / 2));
  for (const x of [-39, -33]) column(P, x, 0.0, 6.2, 0.38, true, 'marble');
  // apse with a statue on a podium
  const ax = -36, az = z0, r = 2;
  P.add(grid(24, 6, (u, v) => { const a = Math.PI + Math.PI * u; return V(ax + Math.cos(a) * r, lerp(0, 4.6, v), az + Math.sin(a) * r); }), 'plaster', { color: C(0x9b2318) });
  P.add(grid(24, 6, (u, v) => { const a = Math.PI + Math.PI * u, e = v * Math.PI / 2; return V(ax + Math.cos(a) * r * Math.cos(e), 4.6 + r * Math.sin(e), az + Math.sin(a) * r * Math.cos(e)); }), 'plaster', { color: C(0x3f6e8f) });
  P.add(xf(block(1.6, 1.4, 1.2, 0.03), [ax, 0, az - 0.6]), 'marble', { color: COL.marble });
}

// ---------------- THE COURT: ground, pool, plane trees
{
  const P = part('Palaestra_Court');
  // beaten earth with grass under the tree rows, gravel avenue on the route
  for (const [ga, gb, gc, gd] of [[-80.3, 8.3, 9.2, 52.4], [-80.3, 8.3, 88.6, 140.75], [-80.3, -47.6, 52.4, 88.6], [-24.4, 8.3, 52.4, 88.6]]) P.add(grid(Math.max(2, Math.round((gb - ga) / 1.5)), Math.max(2, Math.round((gd - gc) / 1.5)), (u, v) => V(lerp(ga, gb, u), 0.005, lerp(gc, gd, v))), 'gravel', { colorFn: p => { const t = smooth(1 - Math.min(Math.abs(p.x - 4.6), Math.abs(p.x + 4.2), Math.abs(p.x + 76.5), Math.abs(p.x + 71), Math.abs(p.z - 13), Math.abs(p.z - 18.5)) / 2.2); return C(0xd8c49c).lerp(C(0x7a8a4a), t * 0.75); }, noise: 0.12, freq: 0.25 });
  P.add(grid(4, 80, (u, v) => V(lerp(-3.2, 3.2, u), 0.02, lerp(0.25, 140.75, v))), 'gravel', { color: C(0xc8bca4), noise: 0.1 });
  // the swimming pool: 35 × 22 m, shallow (1 m) at the west end sloping to 2.6 m
  const px0 = -47, px1 = -25, pz0 = 53, pz1 = 88, dep = z => lerp(1.0, 2.6, (z - pz0) / (pz1 - pz0));
  for (const [w, d, x, z] of [[px1 - px0 + 1.2, 0.6, (px0 + px1) / 2, pz0 - 0.3], [px1 - px0 + 1.2, 0.6, (px0 + px1) / 2, pz1 + 0.3], [0.6, pz1 - pz0, px0 - 0.3, (pz0 + pz1) / 2], [0.6, pz1 - pz0, px1 + 0.3, (pz0 + pz1) / 2]]) P.add(xf(block(w, 0.35, d, 0.04), [x, 0, z]), 'seat', { color: C(0xe0d6c0) });
  P.add(grid(12, 20, (u, v) => { const z = lerp(pz0, pz1, v); return V(lerp(px0, px1, u), -dep(z), z); }), 'signinum', { color: C(0x8ab0b0) });
  for (const [a, b] of [[V(px0, 0, pz0), V(px1, 0, pz0)], [V(px1, 0, pz1), V(px0, 0, pz1)], [V(px0, 0, pz1), V(px0, 0, pz0)], [V(px1, 0, pz0), V(px1, 0, pz1)]])
    P.add(grid(16, 3, (u, v) => { const q = a.clone().lerp(b, u); return q.setY(lerp(-dep(q.z), 0, v)); }), 'signinum', { color: C(0x9ab8b8) });
  for (let i = 0; i < 4; i++) P.add(xf(block(6, 0.25, 0.4, 0.02), [px0 + 4, -1.0 + i * 0.25, pz0 + 0.2 + (3 - i) * 0.4]), 'seat', { color: C(0xd0c8b0) });   // steps at the shallow end
  P.add(grid(24, 36, (u, v) => V(lerp(px0, px1, u), -0.25, lerp(pz0, pz1, v)), false, (u, v, q) => [q.x / 1.4, q.z / 1.4]), 'water', { color: C(0x5f9aa4), noise: 0.02 });
  // plane trees: a double avenue along the route (full detail), lighter trees along the far side and the west end
  const avenue = []; for (let z = 22; z < 139; z += 6.5) avenue.push(z);
  for (const z of avenue) { if (Math.abs(z - 63.5) > 1) planeTree(P, -4.2, z + rr(-0.3, 0.3), rr(14, 16.5)); planeTree(P, 4.6, z + 3.25 + rr(-0.3, 0.3), rr(14, 16.5)); }
  for (let z = 14; z < 139; z += 8) { planeTree(P, -76.5, z, rr(13, 15), true); planeTree(P, -71, z + 4, rr(13, 15), true); }
  for (let x = -66; x < -8; x += 8) { planeTree(P, x, 13, rr(13, 15), true); planeTree(P, x + 4, 18.5, rr(13, 15), true); }
  // around the pool: low stone benches
  for (const z of [58, 70, 82]) { P.add(xf(block(0.5, 0.45, 2.2, 0.03), [px1 + 2.2, 0, z]), 'seat', { color: C(0xd8ccb0) }); P.add(xf(block(0.5, 0.45, 2.2, 0.03), [px0 - 2.2, 0, z]), 'seat', { color: C(0xd8ccb0) }); }
}

// ---------------- OBSTACLES along the avenue
{
  const P = part('Palaestra_Obstacles');
  // 1) a bronze athlete toppled from his base — lanes 1 and 2 (the sculpted statue itself is in pompeii-palaestra-statues.glb)
  { const z = 28; P.add(xf(block(0.9, 0.5, 0.9, 0.03), [3.2, 0, z], [0.1, 0.3, 0.4]), 'marble', { color: COL.marbleDk });
    obstacles.push({ type: 'toppled bronze athlete', lane: 1, z0: 27.4, z1: 28.6, act: 'dodge', alsoLane: 2 }); obstacles.push({ type: 'toppled bronze athlete', lane: 2, z0: 27.4, z1: 28.6, act: 'dodge' }); }
  // 2) stone bench — lane 0
  { const z = 36; P.add(xf(block(0.6, 0.45, 2.2, 0.03), [-1.8, 0, z]), 'seat', { color: C(0xd8ccb0) }); obstacles.push({ type: 'stone bench', lane: 0, z0: 34.9, z1: 37.1, act: 'dodge' }); }
  // 3) a big plane-tree branch across the avenue — jump
  { const z = 46; barkLimb(P, [V(-6.5, 0.25, z - 1.2), V(0, 0.22, z - 0.1), V(5.5, 0.2, z + 0.9)], 0.22, 0.14, 14);
    for (let i = 0; i < 4; i++) rod(P, V(-3 + i * 2.2, 0.25, z - 0.6 + i * 0.4), V(-3.6 + i * 2.2, 0.35, z - 1.8 + i * 0.4), 0.06, 'wood', C(0x8f8a70));
    for (let i = 0; i < 40; i++) leafCard(P, 'leaf_plane', rr(-7.5, -5), rr(0.2, 1.2), z + rr(-2.4, 0), rr(0.5, 0.8), V(-6.3, 0, z - 1.2));
    obstacles.push({ type: 'fallen branch', lane: -1, z0: 45.0, z1: 47.0, act: 'jump' }); }
  // 4) rack of javelins and jumping weights — lane 2
  { const x = 1.8, z = 55; for (const dz of [-0.6, 0.6]) rod(P, V(x, 0, z + dz), V(x, 1.4, z + dz), 0.05, 'wood', COL.wood); rod(P, V(x, 1.3, z - 0.7), V(x, 1.3, z + 0.7), 0.04, 'wood', COL.wood);
    for (let i = 0; i < 7; i++) rod(P, V(x - 0.35, 0, z - 0.5 + i * 0.16), V(x + 0.25, 2.3, z - 0.5 + i * 0.16), 0.015, 'wood', COL.woodLt, 6);
    for (const dz of [-0.3, 0.2]) P.add(xf(ell(0.15, 0.07, 0.07), [x + 0.4, 0.06, z + dz]), 'stone', { color: C(0x5a5652) });
    obstacles.push({ type: 'javelin rack', lane: 2, z0: 54.2, z1: 55.8, act: 'dodge' }); }
  // 5) a plane tree snapped by the earthquakes, its trunk lying across the avenue at head height — slide
  { const z = 63.5; barkLimb(P, [V(-4.2, -0.05, z), V(-4.2, 0.9, z), V(-4.2, 1.75, z)], 0.48, 0.44, 20, 0.5);
    barkLimb(P, [V(-4.4, 1.75, z), V(2, 1.95, z + 0.4), V(8.3, 2.1, z + 0.8)], 0.42, 0.32, 18);
    for (let i = 0; i < 4; i++) rod(P, V(5 + i, 2.0, z + 0.6), V(7 + i, 4 + i * 0.4, z + rr(-1, 2)), 0.1, 'wood', C(0x8f8a70));
    for (let i = 0; i < 80; i++) leafCard(P, 'leaf_plane', rr(5.5, 10), rr(2, 6), z + rr(-2, 3), rr(0.6, 0.9), V(8, 3.5, z));
    obstacles.push({ type: 'fallen plane tree', lane: -1, z0: 63.0, z1: 64.4, act: 'slide' }); }
  // 6) heap of fine sand for the wrestlers — lane 1
  { const z = 74; P.add(xf(ell(1.0, 0.45, 1.3, 28, 12), [0, 0, z]), 'sand', { color: C(0xffffff) }); P.add(xf(block(0.25, 1.1, 0.06, 0.01), [0.6, 0, z + 1.1], [0.3, 0, 0.2]), 'wood', { color: COL.woodLt });
    obstacles.push({ type: "wrestlers' sand heap", lane: 1, z0: 72.8, z1: 75.2, act: 'dodge' }); }
  // 7) water-seller's cart — lane 0
  { const x = -1.8, z = 84; P.add(xf(block(1.3, 0.6, 2.0, 0.03), [x, 0.55, z]), 'wood', { color: COL.wood, noise: 0.2, freq: 6 });
    for (const dz of [-0.6, 0.6]) { P.add(xf(new THREE.TorusGeometry(0.5, 0.05, 8, 28), [x - 0.7, 0.5, z + dz], [0, Math.PI / 2, 0]), 'wood', { color: COL.woodDk }); P.add(xf(new THREE.TorusGeometry(0.5, 0.05, 8, 28), [x + 0.7, 0.5, z + dz], [0, Math.PI / 2, 0]), 'wood', { color: COL.woodDk }); }
    for (let i = 0; i < 4; i++) amphora(P, x - 0.3 + (i % 2) * 0.6, z - 0.5 + Math.floor(i / 2) * 0.9, i, 0.1, 1.15);
    obstacles.push({ type: "water-seller's cart", lane: 0, z0: 82.9, z1: 85.1, act: 'dodge' }); }
  // 8) olive-oil amphorae for the athletes — lane 2
  { const x = 1.8, z = 95; for (let i = 0; i < 6; i++) amphora(P, x + rr(-0.45, 0.45), z + rr(-0.6, 0.6), rr(0, 3), i < 4 ? 0.15 : 1.3);
    obstacles.push({ type: 'oil amphorae', lane: 2, z0: 94.2, z1: 95.8, act: 'dodge' }); }
  // 9) marble basin knocked off its foot — lane 1
  { const z = 104; P.add(xf(lathe([[0, 0], [0.75, 0.05], [0.8, 0.22], [0.72, 0.24], [0, 0.12]], 48), [0, 0.5, z], [1.3, 0.3, 0]), 'marble', { color: COL.marble });
    P.add(xf(lathe([[0.25, 0], [0.18, 0.1], [0.14, 0.8], [0.22, 0.9], [0, 0.9]], 32), [0.6, 0.2, z + 0.4], [0, 0, Math.PI / 2]), 'marble', { color: COL.marble });
    obstacles.push({ type: 'fallen marble basin', lane: 1, z0: 103.2, z1: 104.8, act: 'dodge' }); }
  // 10) training hurdle across the track — jump
  { const z = 114; for (const x of [-2.7, 2.7]) P.add(xf(block(0.14, 0.75, 0.14, 0.01), [x, 0, z]), 'wood', { color: COL.woodLt }); P.add(xf(block(5.6, 0.1, 0.08, 0.01), [0, 0.62, z]), 'wood', { color: C(0xe6dcc6) });
    obstacles.push({ type: 'hurdle', lane: -1, z0: 113.7, z1: 114.3, act: 'jump' }); }
  // 11) tiles and a beam fallen from the portico roof — lane 2
  { const z = 124; rod(P, V(8.4, 6.3, z - 0.5), V(1.5, 0.15, z + 0.5), 0.14, 'wood', COL.woodDk, 8);
    for (let i = 0; i < 26; i++) P.add(xf(block(0.42, 0.04, 0.32, 0.01), [rr(1.2, 3.2), rr(0.02, 0.35), z + rr(-0.8, 0.8)], [rr(-0.5, 0.5), rr(0, 3), rr(-0.5, 0.5)]), 'terracotta', { color: tint(COL.terra, rr(0.8, 1.1)) });
    obstacles.push({ type: 'fallen roof tiles', lane: 2, z0: 123.2, z1: 124.8, act: 'dodge' }); }
}

// ---------------- OUTSIDE: street at the west gate, the lane towards the amphitheatre, grass beyond
{
  const P = part('Palaestra_Outside');
  floor(P, 'basalt', -100, -24, 30, -0.35, 0, 4, { color: C(0xffffff) });
  floor(P, 'basalt', -100, 141.35, 30, 155, 0, 4, { color: C(0xffffff) });
  for (const [x0, z0, x1, z1] of [[-140, -60, 70, -24], [-140, 155, 70, 210], [-140, -24, -90.4, 155], [18.4, -24, 70, 155]]) P.add(grid(8, 8, (u, v) => V(lerp(x0, x1, u), -0.03, lerp(z0, z1, v))), 'grass', { color: C(0x9aa070) });
  // (the game's version leaves out the house fronts across the west street: the run comes straight down a street to the gate)
  if (HD) { wall(P, 'plaster', 30, -24, -100, -24, 6, [{ a: 20, b: 22, h: 2.8 }, { a: 60, b: 64, h: 3.2 }], 6, 0); P.add(grid(60, 2, (u, v) => V(lerp(-100, 30, u), lerp(0, 1, v), -23.98)), 'plaster', { color: RED }); }
}

// ================================================================== EXPORT
const root = new THREE.Group(); root.name = 'Pompeii_Great_Palaestra';
root.userData = { route: 'Enter by the west gate (z = 0), run the plane-tree avenue beside the colonnade, leave by the east gate (z = 141) towards the amphitheatre. Lanes x = -1.8, 0, 1.8. Floor at y = 0.', routeY: [[-24, 0], [155, 0]], obstacles: obstacles.filter(o => !o.alsoLane).concat(obstacles.filter(o => o.alsoLane).map(({ alsoLane, ...o }) => o)) };
let total = 0;
const built = [];
for (const p of parts) { const g = p.build(); built.push(g); total += g.userData.tris; console.log(`${p.name.padEnd(22)} ${String(Math.round(g.userData.tris)).padStart(7)} tris, ${g.children.length} meshes`); if (process.env.PALAESTRA_PROFILE) console.log('   ', g.children.map((m) => `${m.material.name}:${m.geometry.index.count / 3}`).join(' ')); }
if (!HD) {
  // The game's version: the whole palaestra as one mesh per material (one draw call each).
  const byMat = new Map();
  for (const g of built) for (const m of g.children) {
    if (!byMat.has(m.material)) byMat.set(m.material, []);
    byMat.get(m.material).push(m.geometry);
  }
  for (const [mat, geos] of byMat) {
    const geo = mergeGeometries(geos);
    if (!geo) throw new Error(`could not merge ${mat.name}`);
    const m = new THREE.Mesh(geo, mat); m.name = `Palaestra_${mat.name}`; root.add(m);
  }
  const scene = new THREE.Scene(); scene.add(root);
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
  writeFileSync('great-palaestra.glb', Buffer.from(glb));
  console.log(`great-palaestra.glb: ${(glb.byteLength / 1048576).toFixed(2)} MB, ${Math.round(total)} tris, ${byMat.size} meshes, obstacles: ${root.userData.obstacles.length}`);
  process.exit(0);
}
for (const g of built) root.add(g);
const scene = new THREE.Scene(); scene.add(root);
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync('pompeii-great-palaestra.glb', Buffer.from(glb));
console.log(`pompeii-great-palaestra.glb: ${(glb.byteLength / 1048576).toFixed(2)} MB, ${Math.round(total)} tris, obstacles: ${root.userData.obstacles.length}`);
for (const m of Object.values(MATS)) { m.map = null; m.normalMap = null; }
const lite = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync('pompeii-great-palaestra-lite.glb', Buffer.from(lite));
console.log(`lite: ${(lite.byteLength / 1048576).toFixed(2)} MB`);
