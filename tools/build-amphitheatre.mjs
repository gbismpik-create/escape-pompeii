// Escape Pompeii — the Amphitheatre of Pompeii (c. 70 BC, the oldest surviving Roman amphitheatre) as a runner segment.
// Built after the real monument: 135 × 104 m, arena 66.7 × 35.1 m sunk 6 m below the street, 35 rows in three tiers,
// passages on the long axis, external double staircases on the west, painted podium, awning (velarium) on masts.
// Output: amphitheatre.glb, the game's phone version (npm run build:amphitheatre). With AMPH_QUALITY=hd, as designed:
// pompeii-amphitheatre.glb (textures embedded), pompeii-amphitheatre-lite.glb (no images) + atexout/*.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createCanvas, ImageData as NapiImageData } from '@napi-rs/canvas';
globalThis.ImageData = NapiImageData;
import { writeFileSync, mkdirSync } from 'node:fs';
import * as TX from './villa-textures.mjs';
import * as AT from './amph-textures.mjs';

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
const HD = process.env.AMPH_QUALITY === 'hd';
const Q = HD
  ? { texScale: 1, sweep: 640, tube: 480, lathe: 56, ell: [28, 18], foliage: 1, groundOut: 115, limb: 1, vouss: 15, treeDepth: 3, ball: [10, 8] }
  : { texScale: 0.25, sweep: 160, tube: 80, lathe: 14, ell: [10, 7], foliage: 0.25, groundOut: 45, limb: 0.5, vouss: 7, treeDepth: 2, ball: [6, 4] };

// ---------------------------------------------------------------- textures + materials
const TEXDIR = 'atexout'; if (HD) mkdirSync(TEXDIR, { recursive: true });
function tex(canvas, repeat = true, key = null, png = false) {
  if (!HD) {
    // the phone version: a quarter of the size, no preview files (cut-out leaves keep half: thinner ones vanish)
    const k = png ? Math.max(Q.texScale, 0.5) : Q.texScale;
    const small = createCanvas(Math.max(64, Math.round(canvas.width * k)), Math.max(64, Math.round(canvas.height * k)));
    small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
    canvas = small; key = null;
  }
  if (key) writeFileSync(`${TEXDIR}/${key}.${png ? 'png' : 'jpg'}`, png ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg', 84));
  const w = canvas.width, h = canvas.height, src = canvas.getContext('2d').getImageData(0, 0, w, h).data, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) data.set(src.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.userData.mimeType = png ? 'image/png' : 'image/jpeg'; t.anisotropy = 8;
  return t;
}
const T0 = Date.now(), lap = n => console.log(`  ${n} ${((Date.now() - T0) / 1000).toFixed(0)}s`);
const TEX = {}, paint = (k, fn, repeat = true, png = false) => { TEX[k] = tex(fn(), repeat, k, png); lap(k); };
paint('podium', AT.podiumFresco); paint('seat', AT.seatStone); paint('sand', AT.arenaSand); paint('opus', () => AT.opusIncertum());
paint('velum', AT.velum); paint('notice', AT.gamesNotice, false); paint('dedication', AT.dedication, false);
paint('marble', TX.marbleTexture); paint('grass', TX.grassTexture); paint('gravel', TX.gravelTexture);
for (const k of ['laurel', 'cypress', 'lemon']) paint('leaf_' + k, () => TX.leafCluster(k), false, true);
const MATS = {};
for (const [k, t] of Object.entries(TEX)) {
  const leafy = k.startsWith('leaf_');
  MATS[k] = new THREE.MeshStandardMaterial({ name: k, map: t, vertexColors: true, roughness: k === 'marble' ? 0.3 : leafy ? 0.8 : k === 'velum' ? 0.95 : 0.88, side: THREE.DoubleSide, alphaTest: leafy ? 0.5 : 0 });
}
const plain = { plaster: [0.92, 0], stone: [0.85, 0], terracotta: [0.8, 0], wood: [0.78, 0], bronze: [0.38, 0.8], cloth: [0.95, 0], plant: [0.9, 0], soil: [1, 0] };
for (const [k, [r, m]] of Object.entries(plain)) MATS[k] = new THREE.MeshStandardMaterial({ name: k, color: 0xffffff, vertexColors: true, roughness: r, metalness: m, side: THREE.DoubleSide });
MATS.fire = new THREE.MeshStandardMaterial({ name: 'fire', color: 0xffb060, emissive: 0xff7a20, emissiveIntensity: 2.5, vertexColors: true });
const AUTO_UV = { marble: 0.9, grass: 3, gravel: 2, opus: 3, seat: 2, sand: 6 };
const TEXTURED = new Set(Object.keys(TEX));

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
  P.add(grid(n, 6, (u, v) => a.clone().lerp(b, u).lerp(d.clone().lerp(c, u), v)), 'terracotta', { colorFn: () => tint(COL.terra, 0.85), ao: false, noise: 0.14, freq: 3 });
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, e = a.clone().lerp(b, t), r = d.clone().lerp(c, t);
    const len = e.distanceTo(r);
    const g = new THREE.CylinderGeometry(0.07, 0.08, len, 8, 4, true, 0, Math.PI); g.rotateZ(Math.PI / 2); g.rotateY(Math.PI / 2);
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
  P.add(grid(60, 14, (u, v) => {
    const a = u * TAU, y = y0 + v * (yc - y0), r = R * (1.06 - 0.16 * Math.pow(v, 1.6));
    const f = y > low + 0.03 ? R * 0.055 * Math.pow(Math.abs(Math.cos(a * flutes / 2)), 0.6) * smooth((y - low) / 0.08) : 0;
    return V(x + Math.sin(a) * (r - f), y, z + Math.cos(a) * (r - f));
  }, true, mat === 'marble' ? (u, v) => [u * 2, v * 3] : null), mat, { colorFn: p => (mat === 'plaster' && p.y < low ? COL.red.clone() : mat === 'marble' ? COL.marble : C(0xf0e9da)), noise: 0.04 });
  // Attic base: plinth + torus + scotia + torus
  P.add(xf(block(R * 2.7, 0.08, R * 2.7, 0.015), [x, 0, z]), 'marble', { color: COL.marble });
  P.add(lathe([[R * 1.3, 0.08], [R * 1.36, 0.11], [R * 1.3, 0.14], [R * 1.12, 0.16], [R * 1.08, 0.19], [R * 1.18, 0.21], [R * 1.12, 0.24], [R * 1.06, 0.245], [0, 0.245]], 56).translate(x, 0, z), 'marble', { color: COL.marble });
  const cm = mat === 'marble' ? 'marble' : 'plaster', cc = mat === 'marble' ? COL.marble : C(0xf0e9da);
  // astragal ring under the capital
  P.add(xf(new THREE.TorusGeometry(R * 0.92, R * 0.06, 8, 48), [x, yc, z], [Math.PI / 2, 0, 0]), cm, { color: cc });
  if (ionic) {
    // echinus carved with egg-and-dart, then the volute cushion and abacus
    P.add(grid(64, 6, (u, v) => { const a = u * TAU, egg = 0.5 + 0.5 * Math.cos(a * 16); const r = R * (0.92 + 0.3 * Math.sin(v * Math.PI * 0.5)) + egg * R * 0.05 * Math.sin(v * Math.PI); return V(x + Math.sin(a) * r, yc + v * 0.12, z + Math.cos(a) * r); }, true), cm, { color: cc });
    P.add(xf(block(R * 2.5, 0.1, R * 2.2, 0.02), [x, yc + 0.12, z]), cm, { color: cc });
    P.add(xf(block(R * 2.9, 0.06, R * 2.6, 0.01), [x, yc + 0.3, z]), cm, { color: cc });
    for (const sx of [1, -1]) {
      // cushion (pulvinus) running front to back, waisted by a balteus band
      P.add(grid(24, 16, (u, v) => { const a = u * TAU, zz = lerp(-R * 1.1, R * 1.1, v), waist = 1 - 0.25 * Math.exp(-Math.pow(zz / (R * 0.25), 2)), r = 0.085 * waist; return V(x + sx * R * 1.15 + Math.cos(a) * r, yc + 0.17 + Math.sin(a) * r, z + zz); }, true), cm, { color: cc });
      // spiral volutes on the front and back faces
      for (const sz of [1, -1]) {
        const pts = []; for (let t = 0; t <= 1; t += 0.02) { const ang = t * TAU * 2.6, rad = lerp(0.1, 0.018, t); pts.push(V(x + sx * (R * 1.15 + Math.cos(ang) * rad), yc + 0.17 + Math.sin(ang) * rad * sx, z + sz * R * 1.12)); }
        P.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.round(Q.tube / 4), 0.013, 6), cm, { color: cc });
        P.add(xf(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 32), [x + sx * R * 1.15, yc + 0.17, z + sz * R * 1.1], [Math.PI / 2, 0, 0]), cm, { color: tint(cc, 0.93) });
        P.add(xf(new THREE.SphereGeometry(0.022, 12, 8), [x + sx * R * 1.15, yc + 0.17, z + sz * R * 1.13]), cm, { color: cc });
      }
    }
  } else {
    // Tuscan: echinus quarter-round + abacus, painted like the Pompeian stucco capitals
    P.add(lathe([[R * 0.92, 0], [R * 0.95, 0.03], [R * 1.12, 0.12], [R * 1.32, 0.2], [R * 1.36, 0.22], [0, 0.22]], 56).translate(x, yc, z), cm, { color: cc });
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
  radial = Math.max(3, Math.round(radial * Q.limb));
  const curve = new THREE.CatmullRomCurve3(pts), n = Math.max(3, pts.length * 2);
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
    limb(P, pts, r, r * 0.62, COL.woodDk, depth < 1 ? 10 : depth < 2 ? 7 : 4);
    if (depth >= Q.treeDepth) { tips.push(pts[3], pts[2]); return; }
    const kids = depth === 0 ? 4 : 3;
    for (let i = 0; i < kids; i++) {
      const t = depth === 0 ? 3 : pick([2, 3]), base = pts[t];
      const out = V(Math.cos(i / kids * TAU + rr(-0.4, 0.4) + depth), 0, Math.sin(i / kids * TAU + rr(-0.4, 0.4) + depth));
      const nd = d.clone().multiplyScalar(0.55).addScaledVector(out, 0.75).add(V(0, 0.35, 0)).normalize();
      grow(base, nd, len * rr(0.6, 0.75), r * 0.6, depth + 1);
    }
  };
  grow(V(x, 0, z), V(rr(-0.08, 0.08), 1, rr(-0.08, 0.08)).normalize(), h * 0.42, h * 0.035, 0);
  const per = Math.max(2, Math.round(7 * Math.pow(Math.max(1, h / 3.6), 0.9) * Q.foliage));
  for (const tp of tips) for (let k = 0; k < per; k++) {
    const p = tp.clone().add(V(rr(-0.35, 0.35), rr(-0.25, 0.3), rr(-0.35, 0.35)).multiplyScalar(h / 3.4));
    leafCard(P, leafMat, p.x, p.y, p.z, rr(0.55, 0.85) * h / 3.6 / Math.sqrt(Math.max(Q.foliage, 0.5)), crownC, { flatY: 0.8 });
  }
}
// Italian cypress: slim spindle of dense foliage cards around a trunk
function cypress(P, x, z, h) {
  limb(P, [V(x, 0, z), V(x, h * 0.5, z), V(x, h * 0.95, z)], h * 0.03, h * 0.008, COL.woodDk, 8);
  const n = Math.round(h * 85 * Q.foliage);
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

// ================================================================== AMPHITHEATRE
// Plan: an ellipse 135 × 104 m with the long axis on Z. Arena 66.7 × 35.1 m, sunk 6 m below the street.
// The route enters by the north passage (z ≈ 0, street level), slopes down 6 m to the arena (z 34–101) and
// climbs out through the south passage (z ≈ 136). Lanes at x = -1.8, 0, 1.8.
const AX = 17.55, AZ = 33.35, CZ = 67.5, YA = -6, DOUT = 35.1, TW = 3.0, TCUT = 3.3, DT = 9.28;
const ellP = (th, d, y) => V((AX + d) * Math.cos(th), y, CZ + (AZ + d) * Math.sin(th));
const ellN = (th, d) => V(Math.cos(th) / (AX + d), 0, Math.sin(th) / (AZ + d)).normalize();
const ellT = (th, d) => V(-(AX + d) * Math.sin(th), 0, (AZ + d) * Math.cos(th)).normalize();
const TH0 = -Math.PI / 2, TH1 = 1.5 * Math.PI;           // θ runs from the north end, through east (0), south (π/2), west (π)
const ARC = new Map(), M = 4096;
function arcTable(d) {
  const key = d.toFixed(3); if (ARC.has(key)) return ARC.get(key);
  const t = new Float64Array(M + 1); let s = 0, prev = ellP(TH0, d, 0);
  for (let j = 1; j <= M; j++) { const p = ellP(TH0 + j * TAU / M, d, 0); s += p.distanceTo(prev); t[j] = s; prev = p; }
  ARC.set(key, t); return t;
}
function arcLen(th, d) { const t = arcTable(d), f = clamp((th - TH0) / TAU, 0, 1) * M, j = Math.min(M - 1, Math.floor(f)); return t[j] + (t[j + 1] - t[j]) * (f - j); }
const perim = d => arcTable(d)[M];
function thetaAt(s, d) { const t = arcTable(d); let lo = 0, hi = M; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] < s) lo = m; else hi = m; } return TH0 + (lo + (s - t[lo]) / Math.max(1e-9, t[hi] - t[lo])) * TAU / M; }
// kept θ ranges after removing intervals [{c, h}] (centre angle, half-angle)
function keptRanges(cuts) {
  const ex = cuts.map(({ c, h }) => [c - h, c + h]).sort((a, b) => a[0] - b[0]); const out = []; let a = TH0;
  for (const [x0, x1] of ex) { if (x0 > a) out.push([a, Math.min(x0, TH1)]); a = Math.max(a, x1); }
  if (a < TH1) out.push([a, TH1]); return out.filter(([p, q]) => q - p > 1e-4);
}
const trenchCuts = d => { const h = Math.asin(Math.min(1, TCUT / (AX + d))); return [{ c: TH0, h }, { c: Math.PI / 2, h }, { c: TH1, h }]; };
const NSEG = Q.sweep;
function sweepEdge(P, mat, d0, y0, d1, y1, opts = {}) {
  const dm = (d0 + d1) / 2;
  for (const [a, b] of keptRanges(opts.cuts ? opts.cuts(dm) : [])) {
    const n = Math.max(2, Math.round(NSEG * (b - a) / TAU));
    const g = grid(n, 1, (u, v) => ellP(lerp(a, b, u), lerp(d0, d1, v), lerp(y0, y1, v)), false,
      opts.uv ? (u, v) => opts.uv(arcLen(lerp(a, b, u), lerp(d0, d1, v)), v) : null);
    P.add(g, mat, { keepUV: !!opts.uv, color: opts.color ?? COL.white, colorFn: opts.colorFn, noise: opts.noise ?? 0.04, freq: 0.6 });
  }
}
// local frame on the façade: t along the wall, y up, n outward
function frameAt(th, d) { const T = ellT(th, d), N = ellN(th, d), Y = V(0, 1, 0); if (T.clone().cross(Y).dot(N) < 0) T.negate(); return new THREE.Matrix4().makeBasis(T, Y, N).setPosition(ellP(th, d, 0)); }
const place = (g, m) => g.applyMatrix4(m);
function rod(P, a, b, r, mat, color, seg = 6) {
  const len = a.distanceTo(b), g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  g.translate(0, len / 2, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize())).translate(a.x, a.y, a.z);
  P.add(g, mat, { color });
}
const floorY = d => YA + 6 * clamp(d / DOUT);           // passage floor, d measured from the arena edge along the long axis
const parts = [], part = n => { const p = new Part(n); parts.push(p); return p; }, obstacles = [];

// ---------------- CAVEA: podium + 35 rows in three tiers, as a stepped profile swept round the ellipse
const PROF = []; let pd = 0, py = YA;
const E = (d1, y1, mat, extra = {}) => { PROF.push({ d0: pd, y0: py, d1, y1, mat, ...extra }); pd = d1; py = y1; };
E(0, -4.0, 'podium', { door: true }); E(0, -3.8, 'podium');                          // painted parapet round the arena
E(-0.18, -3.8, 'marble'); E(-0.18, -3.4, 'marble'); E(0.6, -3.4, 'marble');            // projecting marble coping
E(2.0, -3.4, 'seat');                                                                   // platform for the magistrates' chairs
for (let i = 0; i < 4; i++) { E(pd, py + 0.36, 'seat'); E(pd + 0.8, py, 'seat'); }    // ima cavea
E(pd + 1.2, py, 'seat'); E(pd, py + 1.1, 'seat');                                      // walkway + balteus wall
E(pd + 0.72, py, 'seat'); for (let i = 0; i < 11; i++) { E(pd, py + 0.4, 'seat'); E(pd + 0.72, py, 'seat'); }   // media cavea
E(pd + 1.2, py, 'seat'); E(pd, py + 1.1, 'seat');
E(pd + 0.72, py, 'seat'); for (let i = 0; i < 17; i++) { E(pd, py + 0.42, 'seat'); E(pd + 0.72, py, 'seat'); }  // summa cavea
const YTOP = py; E(30.6, py, 'seat');                                                   // top walkway
console.log(`  cavea top at y = ${YTOP.toFixed(2)}, d = ${pd.toFixed(2)}`);
{
  const P = part('Amph_Cavea');
  let vRow = 0;
  for (const e of PROF) {
    const len = Math.hypot(e.d1 - e.d0, e.y1 - e.y0), vertical = Math.abs(e.d1 - e.d0) < 1e-6;
    if (vertical && e.y1 > e.y0) vRow = 0;
    const v0 = vRow, v1 = vRow + len / 1.15; vRow = v1;
    const inTrench = Math.max(e.d0, e.d1) <= DT + 1e-6 && !(vertical && Math.abs(e.d0 - DT) < 1e-6);
    const cuts = d => [...(inTrench ? trenchCuts(d) : []), ...(e.door ? [{ c: 0, h: Math.asin(1.0 / AZ) }, { c: Math.PI, h: Math.asin(1.0 / AZ) }] : [])];
    const uv = e.mat === 'podium' ? (s, v) => [s / perim(0) * 18, (lerp(e.y0, e.y1, v) - YA) / 2.2]
      : e.mat === 'marble' ? (s, v) => [s / 0.9, lerp(v0, v1, v) * 1.3] : (s, v) => [s / 2, lerp(v0, v1, v)];
    sweepEdge(P, e.mat, e.d0, e.y0, e.d1, e.y1, { cuts, uv, noise: e.mat === 'seat' ? 0.06 : 0.02, color: e.mat === 'seat' && vertical ? tint(COL.white, 0.8) : COL.white });
  }
  // aisles (scalaria): a half-height step on every row, dividing the seats into wedges (cunei)
  const aisles = 24;
  for (let k = 0; k < aisles; k++) {
    const th0 = TH0 + (k + 0.5) * TAU / aisles;
    if (Math.abs(Math.cos(th0)) < 0.2) continue;                                       // not over the long-axis passages
    for (const e of PROF) {
      if (e.mat !== 'seat' || Math.abs(e.d1 - e.d0) < 0.5 || e.d0 < 2) continue;        // treads only, from the ima cavea up
      if (Math.abs(e.d1 - e.d0) > 0.9) continue;                                        // skip walkways
      const depth = (e.d1 - e.d0) / 2, d = e.d0 + depth / 2, m = frameAt(th0, d);
      const rise = 0.2;
      const b = box(1.1, rise, depth, 0, e.y0, 0); place(b, m); P.add(b, 'seat', { color: tint(COL.white, 0.95), noise: 0.05 });
    }
  }
  // bronze railing on the coping and the two narrow walkway parapets
  for (const [d, y, h] of [[0.0, -3.4, 0.95]]) {
    for (const [a, b] of keptRanges(trenchCuts(d))) {
      const pts = []; for (let i = 0; i <= 120; i++) pts.push(ellP(lerp(a, b, i / 120), d, y + h));
      P.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Q.tube, 0.03, 6), 'bronze', { color: COL.bronze });
      const pts2 = pts.map(p => p.clone().add(V(0, -0.45, 0)));
      P.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts2), Q.tube, 0.02, 6), 'bronze', { color: COL.bronze });
      const L = arcLen(b, d) - arcLen(a, d), n = Math.floor(L / 2.4);
      for (let i = 0; i <= n; i++) { const th = thetaAt(arcLen(a, d) + i * L / n, d); const p = ellP(th, d, y); rod(P, p, p.clone().add(V(0, h, 0)), 0.035, 'bronze', COL.bronze); P.add(xf(new THREE.SphereGeometry(0.06, ...Q.ball), [p.x, p.y + h + 0.03, p.z]), 'bronze', { color: COL.bronze }); }
    }
  }
}

// ---------------- ARENA floor (raked sand), doors on the minor axis, tribunal box
{
  const P = part('Amph_Arena');
  P.add(grid(NSEG / 2, 28, (u, v) => { const th = u * TAU, r = Math.sqrt(v); return V(AX * r * Math.cos(th), YA, CZ + AZ * r * Math.sin(th)); }, true,
    (u, v, q) => [q.x / 6, q.z / 6]), 'sand', { keepUV: true, color: C(0xffffff), noise: 0.08, freq: 0.15 });
  // small doors in the podium on the minor axis (one of them, by tradition, the Porta Libitinensis for the dead)
  for (const s of [1, -1]) {
    const x0 = s * AX, x1 = s * (AX + 1.6), m = new THREE.Matrix4();
    P.add(box(1.6, 2.0, 0.08, (x0 + x1) / 2, YA, CZ - 1.04), 'plaster', { color: C(0x3a2e26) });
    P.add(box(1.6, 2.0, 0.08, (x0 + x1) / 2, YA, CZ + 1.04), 'plaster', { color: C(0x3a2e26) });
    P.add(box(0.08, 2.0, 2.1, x1, YA, CZ), 'plaster', { color: C(0x2a201a) });
    P.add(box(1.6, 0.08, 2.1, (x0 + x1) / 2, YA + 2.0, CZ), 'plaster', { color: C(0x2a201a) });
    P.add(xf(block(0.08, 1.95, 1.0, 0.01), [x0 + s * 0.45, YA, CZ + 0.62], [0, s * 0.9, 0]), 'wood', { color: COL.woodDk, noise: 0.2, freq: 8 });   // door leaf, ajar
    for (let i = 0; i < 3; i++) P.add(box(0.1, 0.06, 1.0, x0 + s * 0.42, YA + 0.3 + i * 0.7, CZ + 0.62), 'bronze', { color: C(0x3a3430) });
  }
  // tribunal (honour box) over the west door: marble platform, balustrade, four columns and an awning
  {
    const xF = -(AX + 0.45), xB = -(AX + 5.2), z0 = CZ - 3.6, z1 = CZ + 3.6, yT = -2.0;
    P.add(box(xF - xB, yT - (YA + 2.6), z1 - z0, (xF + xB) / 2, YA + 2.6, CZ), 'marble', { color: COL.marble });
    P.add(xf(block(0.25, 1.0, z1 - z0, 0.03), [xF + 0.12, yT, CZ]), 'marble', { color: COL.marble });
    for (const z of [z0 + 0.12, z1 - 0.12]) P.add(xf(block(xF - xB, 1.0, 0.25, 0.03), [(xF + xB) / 2, yT, z]), 'marble', { color: COL.marble });
    for (let k = 0; k < 9; k++) P.add(lathe([[0, 0], [0.09, 0.02], [0.05, 0.25], [0.08, 0.45], [0.05, 0.7], [0.09, 0.85], [0, 0.85]], 24).translate(xF - 0.1, yT + 0.05, z0 + 0.6 + k * 0.75), 'marble', { color: COL.marble });   // balusters
    for (const x of [xF + 0.15, xB + 0.3]) for (const z of [z0 + 0.25, z1 - 0.25]) {
      P.add(lathe([[0.17, 0], [0.17, 0.1], [0.14, 0.18], [0.12, 2.9], [0.17, 3.05], [0.2, 3.2], [0, 3.2]], 40).translate(x, yT + 1.0, z), 'marble', { color: COL.marble });
    }
    P.add(grid(8, 8, (u, v) => V(lerp(xF - 0.2, xB, u), yT + 4.25 - 0.25 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v), lerp(z0, z1, v)), false, (u, v) => [u * 2, v]), 'velum', { keepUV: true });
    for (const z of [CZ - 1.2, CZ + 1.2]) {      // two marble double-seats (bisellia) with cushions
      P.add(xf(block(1.3, 0.5, 0.7, 0.03), [xB + 1.6, yT, z]), 'marble', { color: COL.marble });
      P.add(xf(block(1.2, 0.12, 0.62, 0.05, 2), [xB + 1.6, yT + 0.5, z]), 'cloth', { color: C(0x7a1f2a) });
    }
  }
}

// ---------------- PASSAGES: open cut through the lower seats, then a vaulted tunnel to the street
{
  const P = part('Amph_Passages');
  for (const sz of [-1, 1]) {
    const zAt = d => CZ + sz * (AZ + d);
    // floor: stone slabs, sloping 6 m
    P.add(grid(6, 60, (u, v) => { const d = lerp(-0.5, DOUT, v); return V(lerp(-TW, TW, u), d < 0 ? YA + 0.01 : floorY(d) + 0.01, zAt(d)); }), 'seat', { color: tint(COL.white, 0.9), noise: 0.1 });
    // open trench: side walls rise from the floor to the stepped seats; marble cap over the cut seat ends
    const pv = [{ d: 0, y: YA + 2.6 }]; for (const e of PROF) if (Math.max(e.d0, e.d1) <= DT + 1e-6 && e.d1 >= 0) pv.push({ d: e.d1, y: e.y1 });
    for (const sx of [-1, 1]) {
      const zx = (d, x) => CZ + sz * (AZ + d) * Math.sqrt(1 - (x / (AX + d)) ** 2);
      const pos = [], idx = [];
      pv.forEach((q, k) => { pos.push(sx * TW, floorY(Math.max(0, q.d)), zx(Math.max(0, q.d), TW), sx * TW, q.y, zx(Math.max(0, q.d), TW)); if (k) { const a = (k - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      P.add(g, 'opus');
      for (let k = 1; k < pv.length; k++) {
        const a = pv[k - 1], b = pv[k], q = [[TW, a], [TW, b], [TCUT + 0.05, b], [TCUT + 0.05, a]].map(([x, p]) => V(sx * x, p.y + 0.005, zx(Math.max(0, p.d), x)));
        const cg = new THREE.BufferGeometry().setFromPoints([q[0], q[1], q[2], q[0], q[2], q[3]]); cg.computeVertexNormals(); P.add(cg, 'seat', { color: tint(COL.white, 0.95) });
      }
      // timber gate leaf folded back against the trench wall
      P.add(xf(block(0.12, 4.2, 2.9, 0.02), [sx * (TW - 0.1), YA + 0.02, zAt(1.6)]), 'wood', { color: COL.woodDk, noise: 0.25, freq: 6 });
      for (let i = 0; i < 4; i++) P.add(box(0.06, 0.12, 2.9, sx * (TW - 0.17), YA + 0.5 + i * 1.1, zAt(1.6) - 1.45), 'bronze', { color: C(0x3a3430) });
    }
    // portal face above the tunnel mouth, where the cut ends
    const hP = Math.asin(TCUT / (AX + DT)), thC = sz < 0 ? TH0 : Math.PI / 2, yTop = PROF.find(e => Math.abs(e.d1 - DT) < 1e-6 && Math.abs(e.d0 - DT) > 1e-6).y1;
    for (const [a, b] of sz < 0 ? [[TH0, TH0 + hP], [TH1 - hP, TH1]] : [[thC - hP, thC + hP]]) {
      P.add(grid(24, 6, (u, v) => { const th = lerp(a, b, u), x = (AX + DT) * Math.cos(th), f = floorY(DT); const yl = Math.abs(x) >= TW ? f : f + 1.6 + Math.sqrt(TW * TW - x * x); return ellP(th, DT, lerp(yl, yTop, v)); }), 'opus');
    }
    // vaulted tunnel: walls 1.6 m, semicircular vault (radius 3 m)
    const sec = u => { const L1 = 1.6, L2 = Math.PI * TW, L = 2 * L1 + L2, s = u * L; if (s < L1) return [-TW, s]; if (s > L1 + L2) return [TW, L - s]; const a = Math.PI - (s - L1) / TW; return [TW * Math.cos(a), L1 + TW * Math.sin(a)]; };
    P.add(grid(40, 50, (u, v) => { const d = lerp(DT, DOUT, v), [x, y] = sec(u); return V(x, floorY(d) + y, zAt(d)); }, false, (u, v) => [u * (3.2 + Math.PI * TW) / 2.2, v * (DOUT - DT) / 2.2]), 'opus', { keepUV: true });
    // bronze lamps on brackets
    for (let d = DT + 3; d < DOUT - 2; d += 7) for (const sx of [-1, 1]) {
      const y = floorY(d) + 2.3, z = zAt(d);
      P.add(box(0.3, 0.05, 0.05, sx * (TW - 0.15), y, z), 'bronze', { color: COL.bronze });
      P.add(lathe([[0, 0], [0.08, 0.01], [0.1, 0.05], [0.05, 0.08]], 16).translate(sx * (TW - 0.3), y + 0.05, z), 'bronze', { color: COL.bronze });
      P.add(new THREE.ConeGeometry(0.045, 0.16, 10).translate(sx * (TW - 0.3), y + 0.2, z), 'fire', { color: C(0xffffff) });
    }
  }
  // statues of the town's benefactors on pedestals inside the north passage (honorific statues stood in niches here)
  const togatus = (x, y, z, rot) => {
    P.add(xf(block(0.62, 1.15, 0.62, 0.03), [x, y, z]), 'marble', { color: COL.marbleDk });
    const b = lathe([[0, 0], [0.26, 0], [0.27, 0.08], [0.25, 0.5], [0.22, 0.95], [0.25, 1.2], [0.27, 1.38], [0.21, 1.5], [0.07, 1.57], [0, 1.57]], 48);
    const pp = b.attributes.position; for (let i = 0; i < pp.count; i++) { const a = Math.atan2(pp.getZ(i), pp.getX(i)), k = 1 + 0.05 * Math.sin(a * 9 + pp.getY(i) * 6) * clamp(1.3 - pp.getY(i)); pp.setX(i, pp.getX(i) * k); pp.setZ(i, pp.getZ(i) * k); }
    b.computeVertexNormals(); P.add(xf(b, [x, y + 1.15, z], [0, rot, 0]), 'marble', { color: COL.marble });
    P.add(xf(ell(0.105, 0.135, 0.12), [x, y + 1.15 + 1.71, z]), 'marble', { color: COL.marble });
    const c = Math.cos(rot), s = Math.sin(rot), L = (lx, ly, lz) => V(x + lx * c + lz * s, y + 1.15 + ly, z - lx * s + lz * c);
    P.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([L(-0.18, 1.45, 0.05), L(0, 1.2, 0.24), L(0.2, 0.85, 0.2), L(0.26, 0.55, 0.05)]), 24, 0.07, 10), 'marble', { color: COL.marble });   // sinus of the toga
    rod(P, L(0.22, 1.42, 0.02), L(0.3, 1.05, 0.28), 0.05, 'marble', COL.marble, 10); rod(P, L(0.3, 1.05, 0.28), L(0.32, 1.05, 0.62), 0.045, 'marble', COL.marble, 10);
    P.add(xf(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 10), [L(0.32, 1.05, 0.62).x, y + 1.15 + 1.05, L(0.32, 1.05, 0.62).z], [Math.PI / 2, 0, 0]), 'marble', { color: COL.marble });   // scroll
  };
  for (const sx of [-1, 1]) { const d = 29, z = CZ - (AZ + d); togatus(sx * 2.62, floorY(d), z, sx > 0 ? -Math.PI / 2 : Math.PI / 2); }
}

// ---------------- FAÇADE: outer wall with piers and blind arches, top gallery, the west double staircases
const STAIRS = [Math.PI - 0.26, Math.PI + 0.26];
{
  const P = part('Amph_Facade');
  const DO = DOUT, YW = YTOP + 4.06;                  // top of the outer wall
  const portalCut = d => trenchCuts(d).map(c => ({ c: c.c, h: Math.asin(Math.min(1, TW / (AX + d))) }));
  const doorCut = d => STAIRS.map(c => ({ c, h: 1.0 / (AZ + d) }));
  const fUV = (s, v, y0, y1) => [s / 3, lerp(y0, y1, v) / 3];
  const band = (y0, y1, cuts, d = DO) => sweepEdge(P, 'opus', d, y1, d, y0, { cuts, uv: (s, v) => fUV(s, v, y1, y0) });
  band(0, 4.6, portalCut); band(4.6, YTOP, null); band(YTOP, YTOP + 2.6, doorCut); band(YTOP + 2.6, YW, null);
  // gallery side of the outer wall
  sweepEdge(P, 'opus', DO - 0.8, YTOP, DO - 0.8, YW, { cuts: d => doorCut(DO), uv: (s, v) => fUV(s, v, YTOP, YW) });
  sweepEdge(P, 'seat', DO - 0.8, YW, DO + 0.1, YW, { uv: (s, v) => [s / 2, v] });
  // infill over the tunnel portals
  for (const thC of [TH0, Math.PI / 2, TH1]) {
    const h = Math.asin(TW / (AX + DO)), [a, b] = thC === TH0 ? [TH0, TH0 + h] : thC === TH1 ? [TH1 - h, TH1] : [thC - h, thC + h];
    P.add(grid(24, 4, (u, v) => { const th = lerp(a, b, u), x = (AX + DO) * Math.cos(th); return ellP(th, DO, lerp(1.6 + Math.sqrt(Math.max(0, TW * TW - x * x)), 4.6, v)); }, false, (u, v, q) => [arcLen(lerp(a, b, u), DO) / 3, q.y / 3]), 'opus', { keepUV: true });
  }
  // door jambs to the gallery at the stair landings
  for (const th of STAIRS) { const h = 1.0 / (AZ + DO), m = new THREE.Matrix4(); for (const s of [-1, 1]) { const p0 = ellP(th + s * h, DO - 0.8, YTOP), p1 = ellP(th + s * h, DO, YTOP); const g = new THREE.BufferGeometry().setFromPoints([p0, p1, p1.clone().setY(YTOP + 2.6), p0, p1.clone().setY(YTOP + 2.6), p0.clone().setY(YTOP + 2.6)]); g.computeVertexNormals(); P.add(g, 'stone', { color: COL.tuff }); } }
  // plinth moulding and the cornice
  sweepEdge(P, 'stone', DO, 0.7, DO + 0.22, 0.55, { cuts: portalCut, color: COL.tuff }); sweepEdge(P, 'stone', DO + 0.22, 0.55, DO + 0.22, 0, { cuts: portalCut, color: COL.tuff });
  sweepEdge(P, 'stone', DO, 13.2, DO + 0.55, 13.45, { color: C(0xd8ccb0) }); sweepEdge(P, 'stone', DO + 0.55, 13.45, DO + 0.55, 13.65, { color: C(0xd8ccb0) }); sweepEdge(P, 'stone', DO + 0.55, 13.65, DO, 13.65, { color: C(0xd8ccb0) });
  // piers and blind arches (64 bays)
  const NB = 64, Lp = perim(DO), pierTh = [];
  for (let k = 0; k < NB; k++) pierTh.push(thetaAt((k + 0.5) * Lp / NB, DO));
  const nearPortal = th => Math.abs((AX + DO) * Math.cos(th)) < 4.2 && Math.abs(Math.sin(th)) > 0.9;
  for (let k = 0; k < NB; k++) {
    const th = pierTh[k]; if (nearPortal(th)) continue;
    const m = frameAt(th, DO);
    P.add(place(block(1.3, 13.2, 0.5, 0.03), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.25))), 'stone', { color: COL.tuff, noise: 0.12, freq: 2 });
    P.add(place(block(1.55, 0.3, 0.7, 0.03), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 8.5, 0.3))), 'stone', { color: C(0xc8baa0) });
    // arch ring of tuff voussoirs between this pier and the next
    const th2 = pierTh[(k + 1) % NB]; if (nearPortal(th2)) continue;
    const thc = thetaAt(((k + 1) * Lp / NB) % Lp, DO), mc = frameAt(thc, DO), r = (Lp / NB - 1.3) / 2;
    for (let i = 0; i < Q.vouss; i++) {
      const a = Math.PI * (i + 0.5) / Q.vouss, vx = Math.cos(a) * (r + 0.2), vy = 8.8 + Math.sin(a) * (r + 0.2);
      const vb = HD ? block(0.42, 0.24, 0.16, 0.015) : box(0.42, 0.24 * 15 / Q.vouss, 0.16, 0, 0, 0); vb.rotateZ(a - Math.PI / 2); vb.translate(vx, vy - 0.12, 0.08);
      P.add(place(vb, mc), 'stone', { color: tint(COL.tuff, rr(0.9, 1.08)) });
    }
  }
  // painted games notices on the plinth either side of the north entrance, the builders' inscription over it
  for (const s of [-1, 1]) {
    const th = thetaAt(perim(DO) * (s < 0 ? 1 - 1.35 / NB : 1.35 / NB), DO), m = frameAt(th, DO);
    const q = new THREE.PlaneGeometry(2.6, 1.3).translate(0, 2.05, 0.03); place(q, m); P.add(q, 'notice', { keepUV: true });
  }
  { const m = frameAt(TH0, DO); const q = new THREE.PlaneGeometry(4.2, 1.05).translate(0, 5.25, 0.06); place(q, m); P.add(q, 'dedication', { keepUV: true });
    P.add(place(block(4.5, 1.3, 0.1, 0.02), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 4.6, 0.0))), 'marble', { color: COL.marbleDk }); }

  // TOP GALLERY: arcade of piers, architrave and a tiled lean-to roof
  const DG = 30.8, LG = perim(DG), NG = 112;
  for (let k = 0; k < NG; k++) { const th = thetaAt((k + 0.5) * LG / NG, DG), m = frameAt(th, DG); P.add(place(block(0.45, YW - 0.9 - YTOP, 0.45, 0.02), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, YTOP, 0))), 'plaster', { color: C(0xeae2d0) }); }
  sweepEdge(P, 'plaster', DG - 0.3, YW - 0.9, DG + 0.3, YW - 0.9, { color: C(0xeae2d0) }); sweepEdge(P, 'plaster', DG - 0.3, YW - 0.9, DG - 0.3, YW - 0.5, { color: C(0x9a2c1f) });
  sweepEdge(P, 'terracotta', DG - 0.45, YW - 0.5, DO - 0.8, YW + 0.05, { colorFn: p => tint(COL.terra, 0.85 + 0.25 * hash(Math.round(Math.atan2(p.z - CZ, p.x) * 300), 0, 0)) });
  sweepEdge(P, 'wood', DG - 0.3, YW - 0.62, DO - 0.8, YW - 0.12, { color: COL.woodLt });
  sweepEdge(P, 'seat', DG + 0.3, YTOP + 0.01, DO - 0.8, YTOP + 0.01, { uv: (s, v) => [s / 2, v * 2] });

  // DOUBLE STAIRCASES on the west side (two flights rising along the wall to a landing at the gallery door)
  for (const th of STAIRS) {
    const m = frameAt(th, DO + 0.6), run = 14.4, nst = Math.round(YTOP / 0.26), tr = run / nst, rs = YTOP / nst, W = 2.4;
    const sh = new THREE.Shape(); sh.moveTo(-1.5 - run, 0); sh.lineTo(1.5 + run, 0); sh.lineTo(1.5, YTOP - 0.3); sh.lineTo(1.5, YTOP); sh.lineTo(-1.5, YTOP); sh.lineTo(-1.5, YTOP - 0.3); sh.closePath();
    for (const sgn of [-1, 1]) for (const c of [5.2, 8.6, 11.9]) {        // arches through the supports
      const tc = sgn * c, top = YTOP * (1.5 + run - c - 1.25) / run - 1.3, spring = top - 1.2; if (spring < 1.2) continue;
      const hp = new THREE.Path(); hp.moveTo(tc - 1.2, 0.05); hp.lineTo(tc + 1.2, 0.05); hp.lineTo(tc + 1.2, spring); hp.absarc(tc, spring, 1.2, 0, Math.PI, false); hp.lineTo(tc - 1.2, 0.05); sh.holes.push(hp);
    }
    const sup = new THREE.ExtrudeGeometry(sh, { depth: W, bevelEnabled: false, curveSegments: 16 }); place(sup, m); P.add(sup, 'opus');
    for (const sgn of [-1, 1]) for (let i = 0; i < nst; i++) {
      const t0 = sgn * (1.5 + run - (i + 1) * tr), st = block(tr + 0.02, 0.3, W, 0.01); st.translate(t0 + sgn * tr / 2, (i + 1) * rs - 0.3, W / 2); place(st, m);
      P.add(st, 'seat', { color: tint(COL.white, 0.93), noise: 0.08 });
    }
    // parapet along the outer edge of both flights and the landing
    const pp = new THREE.Shape(); pp.moveTo(-1.5 - run, 0); pp.lineTo(-1.5 - run, 1.0); pp.lineTo(-1.5, YTOP + 1.0); pp.lineTo(1.5, YTOP + 1.0); pp.lineTo(1.5 + run, 1.0); pp.lineTo(1.5 + run, 0); pp.lineTo(1.5, YTOP - 0.2); pp.lineTo(-1.5, YTOP - 0.2); pp.closePath();
    const par = new THREE.ExtrudeGeometry(pp, { depth: 0.2, bevelEnabled: false }); par.translate(0, 0, W - 0.2); place(par, m); P.add(par, 'plaster', { color: C(0xe6dcc8), noise: 0.08 });
  }
  // VELARIUM: masts on corbels round the top of the wall; awning panels over the south half (some torn away)
  const V0 = P;
  const masts = [];
  for (let k = 0; k < NB; k += 2) {
    const th = pierTh[k]; if (nearPortal(th)) continue;
    const m = frameAt(th, DO), base = V(0, 13.65, 0.85).applyMatrix4(m), top = V(0, 25.5, 0.85).applyMatrix4(m);
    P.add(place(block(0.7, 0.35, 0.95, 0.03), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 13.3, 0.47))), 'stone', { color: COL.tuff });
    P.add(place(new THREE.TorusGeometry(0.24, 0.06, 8, 16).rotateX(Math.PI / 2), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, YW - 0.2, 0.85))), 'stone', { color: COL.tuff });
    rod(P, base, top, 0.16, 'wood', COL.wood, 12); masts.push({ th, top });
  }
  const PV = part('Amph_Velarium');
  const inner = th => ellP(th, 15.5, 19.2);
  masts.forEach((mm, i) => {
    rod(PV, mm.top.clone().add(V(0, -0.3, 0)), inner(mm.th), 0.03, 'cloth', C(0xc8b890), 5);       // main rope to the inner ring
    const nx = masts[(i + 1) % masts.length];
    const onSun = Math.sin(mm.th) > 0.05 && Math.sin(nx.th) > 0.05, torn = [3, 7, 8].includes(i % 12);
    if (!onSun || torn) return;
    const a0 = mm.top.clone().add(V(0, -0.6, 0)), a1 = nx.top.clone().add(V(0, -0.6, 0)), b0 = inner(mm.th), b1 = inner(nx.th);
    PV.add(grid(10, 12, (u, v) => { const o = a0.clone().lerp(a1, u), q = b0.clone().lerp(b1, u), p = o.lerp(q, v); p.y -= 1.1 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v) + 0.6 * Math.sin(Math.PI * v); return p; }, false, (u, v) => [u, v * 3]), 'velum', { keepUV: true });
  });
  const ringPts = []; for (let i = 0; i <= 160; i++) ringPts.push(inner(TH0 + i * TAU / 160));
  PV.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ringPts, true), Q.tube, 0.05, 6, true), 'cloth', { color: C(0xc8b890) });
}

// ---------------- ARENA PROPS + OBSTACLES (route along +Z, lanes x = -1.8 / 0 / 1.8)
{
  const P = part('Amph_ArenaProps'), y = YA;
  // 1) lion cage with its door hanging open — lane 0
  { const x = -1.8, z = 43; P.add(xf(block(2.0, 0.18, 1.6, 0.02), [x, y, z]), 'wood', { color: COL.woodDk, noise: 0.2, freq: 6 }); P.add(xf(block(2.0, 0.12, 1.6, 0.02), [x, y + 1.62, z]), 'wood', { color: COL.woodDk });
    for (const dx of [-0.95, 0.95]) for (const dz of [-0.75, 0.75]) P.add(box(0.12, 1.6, 0.12, x + dx, y + 0.1, z + dz), 'wood', { color: COL.woodDk });
    for (let i = 1; i < 10; i++) for (const dz of [-0.75, 0.75]) rod(P, V(x - 1 + i * 0.2, y + 0.18, z + dz), V(x - 1 + i * 0.2, y + 1.62, z + dz), 0.025, 'bronze', C(0x3a3430));
    for (let i = 1; i < 8; i++) rod(P, V(x - 0.95, y + 0.18, z - 0.8 + i * 0.2), V(x - 0.95, y + 1.62, z - 0.8 + i * 0.2), 0.025, 'bronze', C(0x3a3430));
    const dm = new THREE.Matrix4().makeRotationY(-1.2).setPosition(x + 0.95, y + 0.18, z - 0.75);
    for (let i = 0; i < 8; i++) { const a = V(0, 0, i * 0.2).applyMatrix4(dm), b = V(0, 1.4, i * 0.2).applyMatrix4(dm); rod(P, a, b, 0.025, 'bronze', C(0x3a3430)); }
    obstacles.push({ type: 'lion cage', lane: 0, z0: 42.2, z1: 43.8, act: 'dodge' }); }
  // 2) awning mast fallen across the arena — jump
  { const a = V(-9, y + 0.17, 48.6), b = V(9, y + 0.17, 51.2); rod(P, a, b, 0.17, 'wood', COL.wood, 14);
    for (let i = 0; i < 3; i++) P.add(xf(new THREE.TorusGeometry(0.32 - i * 0.05, 0.035, 6, 24), [4.5, y + 0.04 + i * 0.07, 47.5], [Math.PI / 2, 0, 0]), 'cloth', { color: C(0xc8b890) });
    const pts = []; for (let i = 0; i <= 8; i++) pts.push(V(lerp(9, 14, i / 8), y + 0.04 + Math.sin(i) * 0.02, lerp(51.2, 56, i / 8))); P.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.035, 5), 'cloth', { color: C(0xc8b890) });
    obstacles.push({ type: 'fallen awning mast', lane: -1, z0: 49.4, z1: 50.6, act: 'jump' }); }
  // 3) weapons rack with shields, swords and helmets — lane 2
  { const x = 1.8, z = 58;
    for (const dz of [-0.55, 0.55]) { rod(P, V(x - 0.6, y, z + dz), V(x, y + 1.5, z + dz), 0.05, 'wood', COL.wood); rod(P, V(x + 0.6, y, z + dz), V(x, y + 1.5, z + dz), 0.05, 'wood', COL.wood); }
    rod(P, V(x, y + 1.5, z - 0.7), V(x, y + 1.5, z + 0.7), 0.05, 'wood', COL.wood);
    for (const [dz, s] of [[-0.35, 1], [0.35, -1]]) {
      const sc = new THREE.CylinderGeometry(0.7, 0.7, 1.05, 24, 1, true, -0.45, 0.9); sc.rotateY(Math.PI / 2); sc.translate(x - 0.7 * s * 0 + s * 0.05, y + 0.6, z + dz);
      P.add(xf(new THREE.CylinderGeometry(0.75, 0.75, 1.05, 24, 1, true, -0.42, 0.84), [x + s * (0.15 - 0.75), y + 0.62, z + dz], [0, s > 0 ? 0 : Math.PI, s * 0.25]), 'cloth', { color: C(0x9a2a1e) });
      P.add(xf(new THREE.SphereGeometry(0.08, 14, 10), [x + s * 0.17, y + 0.62, z + dz]), 'bronze', { color: COL.bronze });
    }
    for (const dz of [-0.4, 0.05, 0.45]) { P.add(xf(ell(0.15, 0.15, 0.17), [x, y + 1.62, z + dz]), 'bronze', { color: COL.bronze }); P.add(xf(new THREE.TorusGeometry(0.2, 0.02, 6, 24), [x, y + 1.55, z + dz], [Math.PI / 2, 0, 0]), 'bronze', { color: COL.bronze }); }
    for (const dz of [-0.6, 0.6]) P.add(xf(box(0.04, 0.62, 0.06, 0, 0, 0), [x + 0.35, y + 0.75, z + dz], [0, 0, 0.5]), 'bronze', { color: C(0xb8b8b0) });
    obstacles.push({ type: 'weapons rack', lane: 2, z0: 57.3, z1: 58.7, act: 'dodge' }); }
  // 4) torn awning hanging from a temporary frame across all lanes — slide
  { const z = 67.5; for (const x of [-3.0, 3.0]) P.add(xf(block(0.22, 2.75, 0.22, 0.02), [x, y, z]), 'wood', { color: COL.wood });
    P.add(xf(block(6.4, 0.18, 0.2, 0.02), [0, y + 2.6, z]), 'wood', { color: COL.wood });
    P.add(grid(18, 8, (u, v) => V(lerp(-2.9, 2.9, u), y + 2.6 - v * (1.2 + 0.25 * Math.sin(u * 9) * v), z + 0.12 + 0.15 * Math.sin(u * 7 + v * 2) * v), false, (u, v) => [u * 2.3, v * 0.6]), 'velum', { keepUV: true });
    obstacles.push({ type: 'torn awning', lane: -1, z0: 67.2, z1: 67.8, act: 'slide' }); }
  // 5) training posts (pali) — lane 1
  for (const [dx, dz] of [[-0.35, -0.2], [0.3, 0.15], [0, 0.45]]) P.add(lathe([[0.13, 0], [0.12, 1.7], [0.1, 1.85], [0, 1.88]], 18).translate(dx, y, 76 + dz), 'wood', { color: COL.wood, noise: 0.2, freq: 8 });
  obstacles.push({ type: 'training posts', lane: 1, z0: 75.6, z1: 76.6, act: 'dodge' });
  // 6) overturned sand cart — lane 0
  { const x = -1.8, z = 84.2; P.add(xf(block(1.5, 0.9, 2.2, 0.03), [x, y + 0.75, z], [0, 0.1, 1.75]), 'wood', { color: COL.wood, noise: 0.2, freq: 6 });
    for (const dz of [-0.7, 0.7]) { P.add(xf(new THREE.TorusGeometry(0.55, 0.06, 8, 28), [x + 0.45, y + 1.35, z + dz], [Math.PI / 2 - 0.1, 0, 0]), 'wood', { color: COL.woodDk }); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 6; rod(P, V(x + 0.45 + Math.cos(a) * 0.55, y + 1.35, z + dz + Math.sin(a) * 0.55), V(x + 0.45 - Math.cos(a) * 0.55, y + 1.35, z + dz - Math.sin(a) * 0.55), 0.03, 'wood', COL.woodDk); } }
    P.add(xf(ell(1.0, 0.3, 1.3, 24, 10), [x - 0.7, y, z - 0.2]), 'sand', { color: C(0xffffff) });
    obstacles.push({ type: 'overturned sand cart', lane: 0, z0: 83.0, z1: 85.4, act: 'dodge' }); }
  // 7) tipped bronze brazier spilling embers — lane 2
  { const x = 1.8, z = 92; P.add(xf(lathe([[0, 0], [0.45, 0.25], [0.6, 0.3], [0.6, 0.36], [0, 0.36]], 32), [x - 0.2, y + 0.45, z], [0, 0, 1.1]), 'bronze', { color: COL.bronze });
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; rod(P, V(x + Math.cos(a) * 0.3, y + 0.75, z + Math.sin(a) * 0.3), V(x + Math.cos(a) * 0.5 + 0.3, y, z + Math.sin(a) * 0.5), 0.03, 'bronze', COL.bronze); }
    for (let i = 0; i < 30; i++) P.add(xf(new THREE.IcosahedronGeometry(rr(0.04, 0.08), 0), [x - 0.8 + rr(-0.5, 0.5), y + 0.03, z + rr(-0.6, 0.6)]), i % 3 ? 'stone' : 'fire', { color: i % 3 ? C(0x2a2220) : C(0xffffff) });
    obstacles.push({ type: 'tipped brazier', lane: 2, z0: 91.4, z1: 92.6, act: 'dodge' }); }
  // dropped equipment near the walls (not in the lanes)
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1, x = side * rr(5.5, 13), z = rr(40, 95);
    if (i % 3 === 0) P.add(xf(ell(0.15, 0.13, 0.17), [x, y + 0.1, z], [rr(0, 3), rr(0, 3), 1.2]), 'bronze', { color: COL.bronze });
    else P.add(xf(new THREE.CylinderGeometry(0.75, 0.75, 1.05, 24, 1, true, -0.42, 0.84), [x, y + 0.08, z], [Math.PI / 2, rr(0, 3), 0]), 'cloth', { color: pick([C(0x9a2a1e), C(0x2a4a7a), C(0x8a6a2a)]) });
  }
}

// ---------------- SURROUNDINGS: ground, the plaza at the north entrance with market stalls, plane trees
{
  const P = part('Amph_Surroundings');
  P.add(grid(HD ? 256 : 128, HD ? 24 : 8, (u, v) => { const th = TH0 + u * TAU, d = DOUT + 0.5 + Q.groundOut * v * v; const p = ellP(th, d, 0); p.y = d > 50 ? 0.6 * (fbm(p.x * 0.02, 0, p.z * 0.02) - 0.5) * clamp((d - 50) / 30) : 0; return p; }, false), 'grass', { colorFn: p => C(0xffffff).lerp(C(0xc8b080), 0.4 * vnoise(p.x * 0.05, 3, p.z * 0.05)), noise: 0.1, freq: 0.1 });
  P.add(grid(12, 12, (u, v) => V(lerp(-24, 24, u), 0.02, lerp(-44.5, -1.2, v))), 'gravel', { colorFn: p => tint(C(0xb4a488), 1 - 0.25 * smooth((Math.abs(p.x) - 18) / 6) - 0.25 * smooth((-p.z - 36) / 6)), noise: 0.12, freq: 0.2 });
  // market stalls (the riot fresco of AD 59 shows stalls set up round the amphitheatre)
  for (const [x, z, rot] of [[-8.5, -10, Math.PI / 2], [8.5, -10, -Math.PI / 2], [-8.5, -20, Math.PI / 2], [8.5, -20, -Math.PI / 2], [-14, -4, Math.PI / 2], [14, -4, -Math.PI / 2]]) {
    const m = new THREE.Matrix4().makeRotationY(rot).setPosition(x, 0, z), L = (a, b, c) => V(a, b, c).applyMatrix4(m);
    for (const [a, c] of [[-1.3, -0.8], [1.3, -0.8], [-1.3, 0.9], [1.3, 0.9]]) rod(P, L(a, 0, c), L(a, c < 0 ? 2.4 : 2.0, c), 0.06, 'wood', COL.wood, 8);
    P.add(place(block(2.7, 0.95, 0.75, 0.02), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.5))), 'wood', { color: COL.woodLt, noise: 0.2, freq: 6 });
    const aw = grid(6, 6, (u, v) => L(lerp(-1.45, 1.45, u), lerp(2.45, 2.0, v) - 0.08 * Math.sin(Math.PI * u), lerp(-1.0, 1.15, v)), false, (u, v) => [u * 1.5, v]); P.add(aw, 'velum', { keepUV: true });
    for (let i = 0; i < 4; i++) { const p = L(-1.0 + i * 0.65, 0.95, -0.5); P.add(lathe([[0, 0], [0.12, 0.02], [0.16, 0.12], [0.1, 0.22], [0.12, 0.24]], 16).translate(p.x, p.y, p.z), 'terracotta', { color: tint(COL.terra, rr(0.8, 1.1)) }); }
    for (let i = 0; i < 3; i++) amphora(P, L(-1.1 + i * 0.45, 0, 0.6).x, L(-1.1 + i * 0.45, 0, 0.6).z, rr(0, 3), 0.15);
    for (let i = 0; i < 2; i++) { const p = L(0.8 + i * 0.5, 0, 0.5); P.add(lathe([[0, 0], [0.2, 0], [0.24, 0.3], [0.25, 0.32]], 14).translate(p.x, 0, p.z), 'wood', { color: C(0xb08a50) }); for (let k = 0; k < 6; k++) P.add(xf(new THREE.SphereGeometry(0.06, 8, 6), [p.x + rr(-0.12, 0.12), 0.34, p.z + rr(-0.12, 0.12)]), 'plant', { color: pick([COL.flowerY, C(0xb8432a), C(0x6a8a3a)]) }); }
  }
  // plane trees of the Great Palaestra next door (west), a few cypresses and laurels elsewhere
  for (let z = 6; z <= 130; z += 13) tree(P, -66 - rr(0, 4), z, rr(11, 13), 'laurel');
  for (const [x, z] of [[62, 20], [66, 40], [64, 95], [60, 115]]) tree(P, x, z, rr(8, 10), 'cypress');
  for (const [x, z] of [[-22, -24], [22, -28], [30, 150], [-28, 152]]) tree(P, x, z, rr(6, 8), 'lemon');
}

// ================================================================== EXPORT
const root = new THREE.Group(); root.name = 'Pompeii_Amphitheatre';
root.userData = {
  route: 'Enter at the north gate (z = -1, street level), down the passage to the arena (z 34–101, 6 m below), out by the south passage (z = 136). Lanes x = -1.8, 0, 1.8.',
  routeY: [[-40, 0], [-0.95, 0], [34.15, -6], [100.85, -6], [135.95, 0], [175, 0]],
  obstacles,
};
let total = 0;
const built = [];
for (const p of parts) { const g = p.build(); built.push(g); total += g.userData.tris; console.log(`${p.name.padEnd(20)} ${String(Math.round(g.userData.tris)).padStart(7)} tris, ${g.children.length} meshes`); if (process.env.AMPH_PROFILE) console.log("   ", g.children.map((m) => `${m.material.name}:${m.geometry.index.count / 3}`).join(" ")); }
if (!HD) {
  // The game's version: the whole monument as one mesh per material (one draw call each).
  const byMat = new Map();
  for (const g of built) for (const m of g.children) {
    if (!byMat.has(m.material)) byMat.set(m.material, []);
    byMat.get(m.material).push(m.geometry);
  }
  for (const [mat, geos] of byMat) {
    const geo = mergeGeometries(geos);
    if (!geo) throw new Error(`could not merge ${mat.name}`);
    const m = new THREE.Mesh(geo, mat); m.name = `Amph_${mat.name}`; root.add(m);
  }
  const scene = new THREE.Scene(); scene.add(root);
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
  writeFileSync('amphitheatre.glb', Buffer.from(glb));
  console.log(`amphitheatre.glb: ${(glb.byteLength / 1048576).toFixed(2)} MB, ${Math.round(total)} tris, ${byMat.size} meshes, obstacles: ${obstacles.length}`);
  process.exit(0);
}
for (const g of built) root.add(g);
const scene = new THREE.Scene(); scene.add(root);
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync('pompeii-amphitheatre.glb', Buffer.from(glb));
console.log(`pompeii-amphitheatre.glb: ${(glb.byteLength / 1048576).toFixed(2)} MB, ${Math.round(total)} tris, obstacles: ${obstacles.length}`);
for (const m of Object.values(MATS)) { m.map = null; m.normalMap = null; }
const lite = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync('pompeii-amphitheatre-lite.glb', Buffer.from(lite));
console.log(`lite: ${(lite.byteLength / 1048576).toFixed(2)} MB`);
