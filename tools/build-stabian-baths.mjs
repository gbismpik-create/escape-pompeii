// Escape Pompeii — the Stabian Baths (Terme Stabiane, begun c. 125 BC, the oldest baths in Pompeii) as a runner level.
// Real rooms: palaestra with Doric porticoes, swimming pool with painted stucco façade and two nymphaea, bowling track,
// sundial, scraping room, latrine; men's changing room with niches and stucco ceiling, round cold room with dome and
// oculus, warm room, hot room with alveus and labrum, furnace with three boilers. Arranged in a line for the run.
// Output: stabian-baths.glb, the game's phone version (npm run build:baths). With BATHS_QUALITY=hd, as designed:
// pompeii-stabian-baths.glb (+ -lite.glb without images, btexout/*).
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createCanvas, ImageData as NapiImageData } from '@napi-rs/canvas';
globalThis.ImageData = NapiImageData;
import { writeFileSync, mkdirSync } from 'node:fs';
import * as TX from './villa-textures.mjs';
import * as AT from './amph-textures.mjs';
import * as BT from './baths-textures.mjs';

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
const HD = process.env.BATHS_QUALITY === 'hd';
const Q = HD
  ? { texScale: 1, lathe: 56, ell: [28, 18], foliage: 1, limb: 1, colSeg: 60, colRows: 14, flutes: true, ring: 48, imbrex: [8, 4] }
  : { texScale: 0.25, lathe: 14, ell: [10, 7], foliage: 0.35, limb: 0.5, colSeg: 12, colRows: 3, flutes: false, ring: 12, imbrex: [3, 1] };

// ---------------------------------------------------------------- textures + materials
const TEXDIR = 'btexout'; if (HD) mkdirSync(TEXDIR, { recursive: true });
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
paint('apo', BT.apodyteriumWall); paint('coffers', BT.stuccoCoffers); paint('fluted', BT.flutedVault); paint('dome', BT.starDome);
paint('facade', BT.stuccoFacade); paint('basalt', BT.basaltPaving); paint('inscr', BT.bathsInscription, false);
paint('garden', TX.gardenRoom); paint('fourthR', () => TX.fourthStyle()); paint('fourthY', () => TX.fourthStyle('#c58f2c'));
paint('marble', TX.marbleTexture); paint('signinum', TX.signinum); paint('grass', TX.grassTexture);
paint('sand', AT.arenaSand); paint('opus', () => AT.opusIncertum()); paint('seat', AT.seatStone);
const waterN = tex(TX.waterNormal(), true, 'water_n', true, true);
const MATS = {};
for (const [k, t] of Object.entries(TEX)) MATS[k] = new THREE.MeshStandardMaterial({ name: k, map: t, vertexColors: true, roughness: k === 'marble' ? 0.25 : k === 'basalt' ? 0.6 : 0.85, side: THREE.DoubleSide });
const plain = { plaster: [0.92, 0], stone: [0.85, 0], terracotta: [0.8, 0], wood: [0.78, 0], bronze: [0.38, 0.8], cloth: [0.95, 0], plant: [0.9, 0], soil: [1, 0] };
for (const [k, [r, m]] of Object.entries(plain)) MATS[k] = new THREE.MeshStandardMaterial({ name: k, color: 0xffffff, vertexColors: true, roughness: r, metalness: m, side: THREE.DoubleSide });
MATS.fire = new THREE.MeshStandardMaterial({ name: 'fire', color: 0xffb060, emissive: 0xff7a20, emissiveIntensity: 2.5, vertexColors: true });
MATS.water = new THREE.MeshStandardMaterial({ name: 'water', color: 0xffffff, vertexColors: true, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.82, side: THREE.DoubleSide, normalMap: waterN, normalScale: new THREE.Vector2(0.6, -0.6) });
const AUTO_UV = { marble: 0.9, opus: 3, sand: 6, signinum: 2, basalt: 4, seat: 2, grass: 3, water: 1.4 };
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
    const g = new THREE.CylinderGeometry(0.07, 0.08, len, ...Q.imbrex, true, 0, Math.PI); g.rotateZ(Math.PI / 2); g.rotateY(Math.PI / 2);
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
  P.add(grid(Q.colSeg, Q.colRows, (u, v) => {
    const a = u * TAU, y = y0 + v * (yc - y0), r = R * (1.06 - 0.16 * Math.pow(v, 1.6));
    const f = Q.flutes && y > low + 0.03 ? R * 0.055 * Math.pow(Math.abs(Math.cos(a * flutes / 2)), 0.6) * smooth((y - low) / 0.08) : 0;
    return V(x + Math.sin(a) * (r - f), y, z + Math.cos(a) * (r - f));
  }, true, mat === 'marble' ? (u, v) => [u * 2, v * 3] : null), mat, { colorFn: p => (mat === 'plaster' && p.y < low ? COL.red.clone() : mat === 'marble' ? COL.marble : C(0xf0e9da)), noise: 0.04 });
  // Attic base: plinth + torus + scotia + torus
  P.add(xf(block(R * 2.7, 0.08, R * 2.7, 0.015), [x, 0, z]), 'marble', { color: COL.marble });
  P.add(lathe([[R * 1.3, 0.08], [R * 1.36, 0.11], [R * 1.3, 0.14], [R * 1.12, 0.16], [R * 1.08, 0.19], [R * 1.18, 0.21], [R * 1.12, 0.24], [R * 1.06, 0.245], [0, 0.245]], Q.lathe).translate(x, 0, z), 'marble', { color: COL.marble });
  const cm = mat === 'marble' ? 'marble' : 'plaster', cc = mat === 'marble' ? COL.marble : C(0xf0e9da);
  // astragal ring under the capital
  P.add(xf(new THREE.TorusGeometry(R * 0.92, R * 0.06, HD ? 8 : 4, Q.ring), [x, yc, z], [Math.PI / 2, 0, 0]), cm, { color: cc });
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
        P.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.013, 6), cm, { color: cc });
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
  const curve = new THREE.CatmullRomCurve3(pts), n = Math.max(3, pts.length * 3);
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
    if (depth >= 3) { tips.push(pts[3], pts[2]); return; }
    const kids = depth === 0 ? 4 : 3;
    for (let i = 0; i < kids; i++) {
      const t = depth === 0 ? 3 : pick([2, 3]), base = pts[t];
      const out = V(Math.cos(i / kids * TAU + rr(-0.4, 0.4) + depth), 0, Math.sin(i / kids * TAU + rr(-0.4, 0.4) + depth));
      const nd = d.clone().multiplyScalar(0.55).addScaledVector(out, 0.75).add(V(0, 0.35, 0)).normalize();
      grow(base, nd, len * rr(0.6, 0.75), r * 0.6, depth + 1);
    }
  };
  grow(V(x, 0, z), V(rr(-0.08, 0.08), 1, rr(-0.08, 0.08)).normalize(), h * 0.42, h * 0.035, 0);
  for (const tp of tips) for (let k = 0; k < Math.max(2, Math.round(7 * Q.foliage)); k++) {
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

// ================================================================== STABIAN BATHS
// The real rooms, put in a line for the runner (lanes x = -1.8, 0, 1.8, running along +Z):
//   street (Via dell'Abbondanza) z < 0 → vestibule 0–4 → palaestra with Doric porticoes 4–40 (swimming pool, nymphaea and
//   scraping room on the west side) → men's baths: apodyterium 40–50 → round frigidarium 50–60 → tepidarium 60–68 →
//   caldarium 68–82 → praefurnium (furnace) 82–90 → side street 90+.
const parts = [], part = n => { const p = new Part(n); parts.push(p); return p; }, obstacles = [];
const PL = C(0xe6dcc8), RED = COL.red, socle = h => p => (p.y < h ? RED.clone() : PL.clone());
function vault(P, mat, x0, x1, z0, z1, ys, tile = 2.4) {
  const R = (x1 - x0) / 2, xc = (x0 + x1) / 2, L = Math.PI * R;
  P.add(grid(40, Math.max(2, Math.round((z1 - z0) / 0.6)), (u, v) => { const a = Math.PI * u; return V(xc + R * Math.cos(a), ys + R * Math.sin(a), lerp(z0, z1, v)); }, false,
    (u, v) => [u * L / tile, lerp(z0, z1, v) / tile]), mat, { keepUV: true, color: COL.white, noise: 0.03 });
}
function lunette(P, x0, x1, z, ys, color = C(0xe8e0cc)) {
  const R = (x1 - x0) / 2, xc = (x0 + x1) / 2;
  P.add(grid(32, 2, (u, v) => { const a = Math.PI * u; return V(xc + R * Math.cos(a), lerp(ys, ys + R * Math.sin(a), v), z); }), 'plaster', { color });
}
function jambs(P, xa, xb, za, zb, h, color = PL) {
  for (const x of [xa, xb]) P.add(grid(1, 2, (u, v) => V(x, v * h, lerp(za, zb, u))), 'plaster', { color });
  P.add(grid(2, 1, (u, v) => V(lerp(xa, xb, u), h, lerp(za, zb, v))), 'plaster', { color });
}
function rod(P, a, b, r, mat, color, seg = 8) {
  const len = a.distanceTo(b), g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  g.translate(0, len / 2, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize())).translate(a.x, a.y, a.z);
  P.add(g, mat, { color });
}
const water = (P, g, color = C(0x6a9aa4)) => P.add(g, 'water', { color, noise: 0.02 });
function plaque(P, mat, x, y, z, w, h, rotY = 0) { const q = new THREE.PlaneGeometry(w, h); q.rotateY(rotY); q.translate(x, y, z); P.add(q, mat, { keepUV: true }); }

// ---------------- STREET FRONT (Via dell'Abbondanza) and the vestibule
{
  const P = part('Baths_Street');
  floor(P, 'basalt', -40, -16, 30, 0, 0, 4, { color: C(0xffffff) });
  // façade with shop openings, the main entrance in the middle and the building inscription above it
  const shops = [];
  for (const [a, b] of [[-28, -24], [-21, -17], [-14, -10], [-7, -3.6], [3.6, 7], [10, 14]]) shops.push({ a: a + 30, b: b + 30, h: 3.0 });
  wall(P, 'plaster', -30, -0.25, 16, -0.25, 7, [...shops, { a: 27.5, b: 32.5, h: 3.6 }], 7, 0);   // faces the street (normal -z)
  P.add(grid(92, 1, (u, v) => V(lerp(-30, 16, u), lerp(0, 0.9, v), -0.27)), 'plaster', { color: RED });
  for (const s of shops) {   // shop interiors: dark rooms with counters
    const x0 = s.a - 30, x1 = s.b - 30;
    P.add(box(x1 - x0, 3.0, 0.1, (x0 + x1) / 2, 0, 3.9), 'plaster', { color: C(0x5a4a3a) }); jambs(P, x0, x1, -0.25, 3.9, 3.0, C(0x7a6a58));
    P.add(xf(block(x1 - x0 - 0.6, 0.95, 0.7, 0.02), [(x0 + x1) / 2, 0, 0.6]), 'stone', { color: C(0xd8ccb0) });
    for (let k = 0; k < 3; k++) amphora(P, x0 + 0.5 + k * 0.6, 3.4, rr(0, 3), 0.1);
  }
  // vestibule: corridor through to the palaestra
  jambs(P, -2.5, 2.5, -0.25, 4.0, 3.6);
  plaque(P, 'inscr', 0, 4.4, -0.38, 3.6, 1.12, Math.PI);
  // cornice and small upper-floor windows along the street
  P.add(box(46.4, 0.3, 0.5, -7, 6.7, -0.4), 'stone', { color: C(0xd8ccb0) }); P.add(box(46.4, 0.12, 0.3, -7, 3.25, -0.35), 'stone', { color: C(0xd8ccb0) });
  for (let x = -27; x < 15; x += 3.2) if (Math.abs(x) > 3) { P.add(box(0.7, 0.9, 0.06, x, 4.6, -0.28), 'plaster', { color: C(0x3a2e26) }); P.add(box(0.9, 0.08, 0.12, x, 4.55, -0.3), 'stone', { color: C(0xd8ccb0) }); }
  P.add(xf(block(4.0, 1.4, 0.12, 0.02), [0, 3.7, -0.3]), 'marble', { color: COL.marbleDk });
  floor(P, 'marble', -2.5, -0.25, 2.5, 4, 0.01, 0.9, { color: C(0xb8b6b0) });
  P.add(grid(4, 4, (u, v) => V(lerp(-2.5, 2.5, u), 3.6, lerp(-0.25, 4, v))), 'wood', { color: COL.woodLt });
  // a Pompeian street fountain on the corner and a few things on the pavement
  { const x = 13, z = -5; for (const [w, d, dx, dz] of [[1.8, 0.2, 0, -0.6], [1.8, 0.2, 0, 0.6], [0.2, 1.4, -0.8, 0], [0.2, 1.4, 0.8, 0]]) P.add(xf(block(w, 0.75, d, 0.03), [x + dx, 0, z + dz]), 'seat', { color: C(0x8a8680) });
    water(P, new THREE.PlaneGeometry(1.4, 1.0).rotateX(-Math.PI / 2).translate(x, 0.6, z));
    P.add(xf(block(0.4, 1.3, 0.4, 0.02), [x, 0, z - 0.9]), 'seat', { color: C(0x8a8680) }); P.add(xf(ell(0.13, 0.16, 0.1), [x, 1.05, z - 0.68]), 'marble', { color: COL.marbleDk });
    P.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(x, 1.0, z - 0.6), V(x, 0.95, z - 0.4), V(x, 0.6, z - 0.2)]), 10, 0.025, 6), 'water', { color: C(0xbcd8dc) }); }
  for (let i = 0; i < 5; i++) amphora(P, -12 + i * 0.5, -1.0, rr(0, 3), 0.2);
}

// ---------------- PALAESTRA: open court, Doric porticoes on three sides
{
  const P = part('Baths_Palaestra');
  const yC = 4.4, yW = 6.2;
  // ground: beaten earth in the court, opus signinum under the porticoes and round the pool
  P.add(grid(28, 28, (u, v) => V(lerp(-16, 12, u), 0.005, lerp(8.2, 35.8, v))), 'sand', { color: C(0xcdb894), noise: 0.1, freq: 0.3 });
  floor(P, 'signinum', -16, 4, 16, 8.2, 0.01, 2, { color: C(0xffffff) }); floor(P, 'signinum', -16, 35.8, 16, 40, 0.01, 2, { color: C(0xffffff) }); floor(P, 'signinum', 12, 8.2, 16, 35.8, 0.01, 2, { color: C(0xffffff) });
  for (const [x0, z0, x1, z1] of [[-30, 0, -16, 13.6], [-30, 30.4, -16, 40], [-30, 13.6, -27.4, 30.4], [-18.6, 13.6, -16, 30.4]]) floor(P, 'signinum', x0, z0, x1, z1, 0.01, 2, { color: C(0xffffff) });
  // back walls of the porticoes: plaster over a red socle
  wall(P, 'plaster', 16, 3.75, -16, 3.75, yW, [{ a: 13.5, b: 18.5, h: 3.6 }], yW, 0); P.add(grid(64, 2, (u, v) => V(lerp(-16, 16, u), lerp(0, 1.0, v), 3.76)), 'plaster', { color: RED });
  wall(P, 'plaster', 16.25, 40, 16.25, 4, yW, [], yW, 0); P.add(grid(72, 2, (u, v) => V(16.24, lerp(0, 1.0, v), lerp(4, 40, u))), 'plaster', { color: RED });
  wall(P, 'plaster', -30, 39.75, 16, 39.75, 7.4, [{ a: 27.7, b: 32.3, h: 3.4 }, { a: 15.2, b: 16.8, h: 2.6 }], 7.4, 0); P.add(grid(92, 2, (u, v) => V(lerp(-30, 16, u), lerp(0, 1.0, v), 39.74)), 'plaster', { color: RED });
  // colonnades: stuccoed tuff columns, red lower third, fluted white above
  const xs = [-15.6, -12.8, -9.6, -6.4, -3.2, 3.2, 6.4, 9.6, 12];
  for (const x of xs) { column(P, x, 8.2, yC, 0.25); column(P, x, 35.8, yC, 0.25); }
  for (let z = 11.7; z < 35; z += 3.5) column(P, 12, z, yC, 0.25);
  for (const [w, d, x, z] of [[28.2, 0.42, -1.8, 8.2], [28.2, 0.42, -1.8, 35.8], [0.42, 27.6, 12, 22]]) P.add(box(w, 0.42, d, x, yC, z), 'plaster', { colorFn: p => (p.y > yC + 0.3 ? RED.clone() : C(0xefe8d8)) });
  // lean-to roofs: tiles above, boarded ceilings below
  const roofs = [[V(-16, yC + 0.4, 8.4), V(16, yC + 0.4, 8.4), V(16, yW, 3.75), V(-16, yW, 3.75)], [V(16, yC + 0.4, 35.6), V(-16, yC + 0.4, 35.6), V(-16, yW, 39.75), V(16, yW, 39.75)], [V(11.8, yC + 0.4, 8.4), V(11.8, yC + 0.4, 35.6), V(16.25, yW, 35.6), V(16.25, yW, 8.4)]];
  for (const [a, b, c, d] of roofs) { tiledRoof(P, a, b, c, d); P.add(grid(16, 4, (u, v) => a.clone().lerp(b, u).lerp(d.clone().lerp(c, u), v).add(V(0, -0.12, 0))), 'wood', { color: COL.woodLt, noise: 0.12 }); }

  // SWIMMING POOL (natatio) on the west side, the painted stucco façade behind it, two nymphaea with garden paintings
  { const x0 = -27, x1 = -19, z0 = 14, z1 = 30, dep = 1.6;
    for (const [w, d, x, z] of [[x1 - x0 + 0.8, 0.4, (x0 + x1) / 2, z0 - 0.2], [x1 - x0 + 0.8, 0.4, (x0 + x1) / 2, z1 + 0.2], [0.4, z1 - z0, x0 - 0.2, (z0 + z1) / 2], [0.4, z1 - z0, x1 + 0.2, (z0 + z1) / 2]]) P.add(xf(block(w, 0.3, d, 0.03), [x, 0, z]), 'marble', { color: COL.marble });
    P.add(box(x1 - x0, 0.02, z1 - z0, (x0 + x1) / 2, -dep, (z0 + z1) / 2), 'marble', { color: C(0x9ab8c0) });
    for (const [a, b] of [[V(x0, 0, z0), V(x1, 0, z0)], [V(x1, 0, z1), V(x0, 0, z1)], [V(x0, 0, z1), V(x0, 0, z0)], [V(x1, 0, z0), V(x1, 0, z1)]]) P.add(grid(8, 3, (u, v) => a.clone().lerp(b, u).setY(lerp(-dep, 0, v))), 'marble', { color: C(0xa8c4ca) });
    for (let i = 0; i < 4; i++) P.add(xf(block(x1 - x0, 0.3, 0.45, 0.02), [(x0 + x1) / 2, -dep + i * 0.38, z0 + 0.25 + (3 - i) * 0.45]), 'marble', { color: C(0xc8d8da) });   // steps
    water(P, grid(16, 32, (u, v) => V(lerp(x0, x1, u), -0.2, lerp(z0, z1, v)), false, (u, v, q) => [q.x / 1.4, q.z / 1.4]));
    wall(P, 'facade', -29.75, 34, -29.75, 10, 6, [], 6, 0);
    P.add(grid(48, 1, (u, v) => V(-29.7, 6 + v * 0.4, lerp(10, 34, u))), 'plaster', { color: C(0xefe6d0) });
    for (const [za, zb] of [[8.5, 13.5], [30.5, 35.5]]) {           // nymphaea: small open rooms with shallow pools
      wall(P, 'garden', -29.7, za, -29.7, zb, 4, [], 4, 0.0);
      wall(P, 'garden', -29.7, zb, -25, zb, 4, [], 4, 0.0); wall(P, 'garden', -25, za, -29.7, za, 4, [], 4, 0.0);
      P.add(box(4.9, 0.25, 5.2, -27.35, 4.0, (za + zb) / 2), 'plaster', { color: C(0xe8e0cc) });
      P.add(xf(block(4.2, 0.4, 4.4, 0.03), [-27.4, 0, (za + zb) / 2]), 'marble', { color: COL.marble });
      water(P, new THREE.PlaneGeometry(3.8, 4.0).rotateX(-Math.PI / 2).translate(-27.4, 0.36, (za + zb) / 2));
      column(P, -25, za + 0.4, 4.0, 0.18); column(P, -25, zb - 0.4, 4.0, 0.18);
    }
  }
  // scraping room (destrictarium) in the south-west corner: its outer wall carries the painted stucco reliefs
  wall(P, 'facade', -30, 7.25, -22, 7.25, 6, [{ a: 3, b: 5, h: 2.8 }], 6, 0);
  wall(P, 'plaster', -21.75, 7.5, -21.75, 0, 6, [], 6, 0);
  P.add(box(8.2, 0.3, 7.8, -26, 6, 3.7), 'terracotta', { color: COL.terra });
  // the West boundary and the latrine room off the north portico
  wall(P, 'plaster', -30.25, 0, -30.25, 40, 6, [], 6, 0);
  { const x0 = -16, x1 = -10, z0 = 40, z1 = 46;
    wall(P, 'plaster', x0, z1, x0, z0, 4, [], 4, 0); wall(P, 'plaster', x1, z0, x1, z1, 4, [], 4, 0); wall(P, 'plaster', x1, z1, x0, z1, 4, [], 4, 0);
    floor(P, 'signinum', x0, z0, x1, z1, 0.01, 2, { color: C(0xffffff) }); P.add(box(6, 0.2, 6, -13, 4, 43), 'plaster', { color: PL });
    P.add(xf(block(5.6, 0.5, 0.6, 0.02), [-13, 0, 45.4]), 'stone', { color: C(0xd8ccb0) }); for (let i = 0; i < 6; i++) P.add(box(0.25, 0.02, 0.35, -15.4 + i * 0.9, 0.5, 45.4), 'plaster', { color: C(0x2a201a) });
    P.add(box(5.6, 0.1, 0.3, -13, 0, 44.9), 'water', { color: C(0x6a8a8a) });
    jambs(P, -14.2, -12.6, 39.75, 40.25, 2.6); }

  // ---- obstacles in the court
  // 1) sundial on a pedestal (the baths' Oscan sundial) — lane 2
  { const x = 1.8, z = 13; P.add(xf(block(0.7, 1.0, 0.7, 0.03), [x, 0, z]), 'seat', { color: C(0xd8ccb0) }); P.add(xf(block(0.9, 0.12, 0.9, 0.02), [x, 1.0, z]), 'seat', { color: C(0xd8ccb0) });
    P.add(xf(new THREE.SphereGeometry(0.4, 32, 16, 0, Math.PI, 0, Math.PI / 2), [x, 1.5, z], [-Math.PI / 2, 0, 0]), 'marble', { color: COL.marble });
    P.add(xf(block(0.85, 0.42, 0.5, 0.02), [x, 1.12, z + 0.1]), 'marble', { color: COL.marble }); rod(P, V(x, 1.5, z - 0.05), V(x, 1.5, z + 0.3), 0.012, 'bronze', COL.bronze);
    for (let k = 0; k < 11; k++) { const a = k * Math.PI / 10; rod(P, V(x + Math.cos(a) * 0.1, 1.5 + Math.sin(a) * 0.1, z - 0.02), V(x + Math.cos(a) * 0.38, 1.5 + Math.sin(a) * 0.38, z + 0.1), 0.004, 'stone', C(0x5a4a3a), 4); }
    obstacles.push({ type: 'sundial', lane: 2, z0: 12.5, z1: 13.5, act: 'dodge' }); }
  // 2) athletes' bench with oil flasks, jumping weights and a discus — lane 0
  { const x = -1.8, z = 18; P.add(xf(block(0.6, 0.45, 1.8, 0.03), [x, 0, z]), 'wood', { color: COL.wood });
    for (let k = 0; k < 3; k++) P.add(lathe([[0, 0], [0.06, 0.01], [0.09, 0.08], [0.03, 0.15], [0.035, 0.2]], 16).translate(x + rr(-0.15, 0.15), 0.45, z - 0.6 + k * 0.5), 'terracotta', { color: COL.terraLt });
    P.add(xf(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 32), [x + 0.1, 0.47, z + 0.3]), 'bronze', { color: COL.bronze });
    for (const dz of [-0.3, 0.3]) P.add(xf(ell(0.16, 0.08, 0.07), [x - 0.5, 0.06, z + dz], [0, 0.4, 0]), 'stone', { color: C(0x6a6460) });
    obstacles.push({ type: "athletes' bench", lane: 0, z0: 17.0, z1: 19.0, act: 'dodge' }); }
  // 3) bowling track across the court, stone balls on it — jump
  { const z = 24; P.add(xf(block(26, 0.22, 0.95, 0.03), [-2, 0, z]), 'seat', { color: C(0xd0c4aa) });
    P.add(box(26, 0.02, 0.45, -2, 0.21, z), 'stone', { color: C(0x8a7e68) });
    for (const x of [0.6, -7.5, 6.2]) P.add(xf(new THREE.SphereGeometry(rr(0.17, 0.22), 24, 16), [x, 0.4, z]), 'stone', { color: C(0x5a5652) });
    obstacles.push({ type: 'bowling track', lane: -1, z0: 23.5, z1: 24.5, act: 'jump' }); }
  // 4) stone roller for levelling the ground — lane 1
  { const z = 30; P.add(xf(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 32), [0, 0.4, z], [0, 0, Math.PI / 2]), 'seat', { color: C(0xc0b49a) });
    rod(P, V(-0.65, 0.4, z), V(-0.65, 0.9, z + 1.4), 0.04, 'wood', COL.wood); rod(P, V(0.65, 0.4, z), V(0.65, 0.9, z + 1.4), 0.04, 'wood', COL.wood); rod(P, V(-0.7, 0.9, z + 1.4), V(0.7, 0.9, z + 1.4), 0.04, 'wood', COL.wood);
    obstacles.push({ type: 'stone roller', lane: 1, z0: 29.5, z1: 31.5, act: 'dodge' }); }
  // 5) builders' scaffolding (the baths were being repaired in AD 79) — slide under
  { const z = 37.4; for (const x of [-3.0, 3.0]) for (const dz of [-0.5, 0.5]) P.add(xf(block(0.14, 3.2, 0.14, 0.01), [x, 0, z + dz]), 'wood', { color: COL.woodLt });
    P.add(xf(block(6.4, 0.08, 1.2, 0.01), [0, 1.35, z]), 'wood', { color: COL.woodLt }); P.add(xf(block(6.4, 0.06, 1.2, 0.01), [0, 2.9, z]), 'wood', { color: COL.woodLt });
    for (let i = 0; i < 4; i++) P.add(xf(box(0.3, 0.25, 0.22, 0, 0, 0), [-1.6 + i * 0.9, 1.43, z + rr(-0.3, 0.3)]), 'terracotta', { color: COL.terra });   // bricks
    P.add(xf(lathe([[0, 0], [0.2, 0], [0.24, 0.3], [0.25, 0.32]], 16), [2.2, 1.43, z]), 'wood', { color: C(0xb08a50) });
    rod(P, V(-3.0, 1.0, z - 0.5), V(3.0, 2.6, z - 0.5), 0.03, 'wood', COL.woodLt);
    obstacles.push({ type: 'scaffolding', lane: -1, z0: 36.8, z1: 38.0, act: 'slide' }); }
}

// ---------------- MEN'S BATHS
{
  const P = part('Baths_Mens'), H = 4.5, X = 4.5, door = [{ a: 2.2, b: 6.8, h: 3.2 }];
  // APODYTERIUM (changing room): white walls with clothes niches, benches, coffered stucco vault, grey marble floor
  wall(P, 'apo', -X, 40.25, X, 40.25, H, door, H, 0); wall(P, 'apo', X, 49.75, -X, 49.75, H, [{ a: 2.2, b: 6.8, h: 3.0 }], H, 0);
  wall(P, 'apo', -X, 49.75, -X, 40.25, H, [], H, 0); wall(P, 'apo', X, 40.25, X, 49.75, H, [], H, 0);
  vault(P, 'coffers', -X, X, 40.25, 49.75, H, 2.4); lunette(P, -X, X, 40.25, H); lunette(P, -X, X, 49.75, H);
  jambs(P, -2.3, 2.3, 39.75, 40.25, 3.2);
  floor(P, 'marble', -X + 0.3, 40.55, X - 0.3, 49.45, 0.01, 0.9, { color: C(0xa8a8a6) });
  for (const [x0, z0, x1, z1] of [[-X, 40.25, X, 40.55], [-X, 49.45, X, 49.75], [-X, 40.55, -X + 0.3, 49.45], [X - 0.3, 40.55, X, 49.45]]) floor(P, 'basalt', x0, z0, x1, z1, 0.012, 1.2, { color: C(0xffffff) });
  for (const s of [-1, 1]) { P.add(xf(block(0.6, 0.48, 9.0, 0.03), [s * (X - 0.3), 0, 45]), 'plaster', { color: PL }); P.add(xf(block(0.68, 0.06, 9.1, 0.02), [s * (X - 0.32), 0.48, 45]), 'marble', { color: COL.marble }); }
  // a bench knocked over, with clothes and sandals spilled — lane 1
  { const z = 45; P.add(xf(block(1.8, 0.45, 0.45, 0.03), [0, 0.22, z], [0.2, 0.3, Math.PI / 2 - 0.2]), 'wood', { color: COL.wood });
    for (let k = 0; k < 4; k++) P.add(xf(block(rr(0.5, 0.8), 0.12, rr(0.4, 0.7), 0.05, 2), [rr(-0.6, 0.6), 0.02, z + rr(-0.6, 0.6)], [0, rr(0, 3), 0]), 'cloth', { color: pick([C(0xe6dcc6), C(0x8e2a3a), C(0x3f5f7a), C(0xc9a24a)]) });
    for (let k = 0; k < 2; k++) P.add(xf(block(0.1, 0.05, 0.26, 0.02), [rr(-0.7, 0.7), 0, z + 0.9 + k * 0.15], [0, rr(0, 3), 0]), 'wood', { color: COL.woodDk });
    obstacles.push({ type: 'overturned bench and clothes', lane: 1, z0: 44.2, z1: 45.8, act: 'dodge' }); }

  // FRIGIDARIUM: round room, garden paintings in four niches, cold plunge pool, starry dome with an open oculus
  { const cz = 55, R = 5, ys = 3.6, dh = Math.asin(2.3 / R), nh = Math.asin(1.1 / R), oc = 0.75;
    const ring = (a0, a1, y0, y1) => { const n = Math.max(2, Math.round((a1 - a0) / 0.04)); P.add(grid(n, Math.max(1, Math.round((y1 - y0) / 0.5)), (u, v) => { const a = lerp(a0, a1, u); return V(R * Math.cos(a), lerp(y0, y1, v), cz + R * Math.sin(a)); }, false, (u, v) => [lerp(a0, a1, u) * R / (2 * ys) * 1.5, lerp(y0, y1, v) / ys]), 'garden', { keepUV: true }); };
    const doors = [-Math.PI / 2, Math.PI / 2], niches = [Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 4, -3 * Math.PI / 4];
    const cutsLow = doors.map(c => [c - dh, c + dh]), cutsMid = [...cutsLow, ...niches.map(c => [c - nh, c + nh])];
    const ranges = cuts => { const s = cuts.slice().sort((p, q) => p[0] - q[0]); const out = []; let a = -Math.PI; for (const [p, q] of s) { if (p > a) out.push([a, p]); a = Math.max(a, q); } if (a < Math.PI) out.push([a, Math.PI]); return out; };
    for (const [a, b] of ranges(cutsLow)) ring(a, b, 0, 0.6);
    for (const [a, b] of ranges(cutsMid)) ring(a, b, 0.6, 3.0);
    ring(-Math.PI, Math.PI, 3.0, ys);
    for (const c of niches) {     // niche: half-cylinder recess with a half dome, garden painting, little fountain basin
      const nx = R * Math.cos(c), nz = cz + R * Math.sin(c), r = 1.1;
      P.add(grid(16, 5, (u, v) => { const a = c - Math.PI / 2 + Math.PI * u; return V(nx + Math.cos(a) * r, lerp(0.6, 3.0, v), nz + Math.sin(a) * r); }, false, (u, v) => [u * 0.9, lerp(0.6, 3.0, v) / ys]), 'garden', { keepUV: true });
      P.add(grid(16, 6, (u, v) => { const a = c - Math.PI / 2 + Math.PI * u, e = v * Math.PI / 2; return V(nx + Math.cos(a) * r * Math.cos(e), 3.0 + r * Math.sin(e) * 0.55, nz + Math.sin(a) * r * Math.cos(e)); }), 'plaster', { color: C(0x5a86b8) });
      P.add(grid(12, 1, (u, v) => { const a = c - Math.PI / 2 + Math.PI * u; return V(nx + Math.cos(a) * r * v, 0.6, nz + Math.sin(a) * r * v); }), 'marble', { color: COL.marble });
      P.add(xf(lathe([[0, 0], [0.32, 0], [0.36, 0.2], [0.33, 0.22], [0, 0.18]], 32), [nx * 0.92, 0.6, cz + (nz - cz) * 0.92]), 'marble', { color: COL.marble });
      water(P, new THREE.CircleGeometry(0.3, 24).rotateX(-Math.PI / 2).translate(nx * 0.92, 0.79, cz + (nz - cz) * 0.92));
      const sp = V(nx * 1.02, 1.4, cz + (nz - cz) * 1.02); P.add(xf(ell(0.08, 0.1, 0.08), [sp.x, sp.y, sp.z]), 'bronze', { color: COL.bronze });
      P.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([sp, sp.clone().lerp(V(nx * 0.92, 0.8, cz + (nz - cz) * 0.92), 0.5).add(V(0, 0.15, 0)), V(nx * 0.92, 0.8, cz + (nz - cz) * 0.92)]), 12, 0.012, 6), 'water', { color: C(0xbcd8dc) });
    }
    // dome with oculus
    const e1 = Math.acos(oc / R);
    P.add(grid(96, 24, (u, v) => { const a = u * TAU, e = v * e1; return V(R * Math.cos(e) * Math.cos(a), ys + R * Math.sin(e), cz + R * Math.cos(e) * Math.sin(a)); }, true, (u, v) => [u * 3, v]), 'dome', { keepUV: true });
    P.add(new THREE.CylinderGeometry(oc, oc, 1.2, 32, 1, true).translate(0, ys + R * Math.sin(e1) + 0.6, cz), 'plaster', { color: C(0xd8d0bc) });
    // floor and the plunge pool (white marble, 1 m deep)
    P.add(grid(96, 8, (u, v) => { const a = u * TAU, r = lerp(1.45, R, v); return V(r * Math.cos(a), 0.01, cz + r * Math.sin(a)); }, true), 'marble', { color: C(0xd8d6d0) });
    P.add(lathe([[1.15, -1.0], [1.15, 0.18], [1.3, 0.25], [1.45, 0.22], [1.45, 0.0]], 64).translate(0, 0, cz), 'marble', { color: COL.marble });
    P.add(new THREE.CircleGeometry(1.15, 48).rotateX(-Math.PI / 2).translate(0, -1.0, cz), 'marble', { color: C(0x9ab8c0) });
    water(P, new THREE.CircleGeometry(1.15, 48).rotateX(-Math.PI / 2).translate(0, 0.05, cz), C(0x7aa8b0));
    obstacles.push({ type: 'cold plunge pool', lane: 1, z0: cz - 1.45, z1: cz + 1.45, act: 'dodge' });
    // passages between the round room and the rectangular rooms
    for (const [za, zb] of [[49.75, cz - Math.sqrt(R * R - 2.3 * 2.3)], [cz + Math.sqrt(R * R - 2.3 * 2.3), 60.25]]) { jambs(P, -2.3, 2.3, za, zb, 3.0, C(0xd8cfbc)); floor(P, 'marble', -2.3, za, 2.3, zb, 0.012, 0.9, { color: C(0xd8d6d0) }); }
  }

  // TEPIDARIUM: warm room, yellow walls, coffered vault, bronze brazier and bench
  wall(P, 'fourthY', -X, 60.25, X, 60.25, H, [{ a: 2.2, b: 6.8, h: 3.0 }], H, 0); wall(P, 'fourthY', X, 67.75, -X, 67.75, H, [{ a: 2.2, b: 6.8, h: 3.0 }], H, 0);
  wall(P, 'fourthY', -X, 67.75, -X, 60.25, H, [], H, 0); wall(P, 'fourthY', X, 60.25, X, 67.75, H, [], H, 0);
  vault(P, 'coffers', -X, X, 60.25, 67.75, H, 2.4); lunette(P, -X, X, 60.25, H); lunette(P, -X, X, 67.75, H);
  floor(P, 'marble', -X, 60.25, X, 67.75, 0.01, 0.9, { color: C(0xe0ddd6) });
  { const x = -1.8, z = 63;      // bronze brazier — lane 0
    P.add(lathe([[0, 0], [0.55, 0.05], [0.75, 0.3], [0.78, 0.38], [0, 0.38]], 48).translate(x, 0.5, z), 'bronze', { color: COL.bronze });
    for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + 0.4; P.add(xf(new THREE.CylinderGeometry(0.035, 0.025, 0.55, 8), [x + Math.cos(a) * 0.55, 0.27, z + Math.sin(a) * 0.55]), 'bronze', { color: COL.bronze }); P.add(xf(ell(0.07, 0.07, 0.1), [x + Math.cos(a) * 0.58, 0.04, z + Math.sin(a) * 0.58]), 'bronze', { color: COL.bronze }); }
    for (let i = 0; i < 26; i++) P.add(xf(new THREE.IcosahedronGeometry(rr(0.05, 0.09), 0), [x + rr(-0.5, 0.5), 0.9, z + rr(-0.5, 0.5)]), i % 3 ? 'stone' : 'fire', { color: i % 3 ? C(0x2a2220) : C(0xffffff) });
    obstacles.push({ type: 'bronze brazier', lane: 0, z0: 62.2, z1: 63.8, act: 'dodge' }); }
  { const x = 1.8, z = 66;       // bronze bench on cow-legs — lane 2
    P.add(xf(block(0.7, 0.06, 1.9, 0.02), [x, 0.45, z]), 'bronze', { color: COL.bronze });
    for (const dz of [-0.8, 0.8]) for (const dx of [-0.25, 0.25]) { rod(P, V(x + dx, 0.05, z + dz), V(x + dx, 0.45, z + dz * 0.95), 0.04, 'bronze', COL.bronze); P.add(xf(ell(0.05, 0.05, 0.07), [x + dx, 0.03, z + dz + 0.03]), 'bronze', { color: COL.bronze }); }
    obstacles.push({ type: 'bronze bench', lane: 2, z0: 65.0, z1: 67.0, act: 'dodge' }); }

  // CALDARIUM: hot room, red walls, fluted vault, hot pool (alveus) along the east wall, labrum in an apse to the west
  wall(P, 'fourthR', X, 68.25, -X, 68.25, H, [{ a: 2.2, b: 6.8, h: 3.0 }], H, 0);
  wall(P, 'fourthR', -X, 81.75, X, 81.75, H, [{ a: 2.2, b: 6.8, h: 3.0 }], H, 0);
  wall(P, 'fourthR', -X, 81.75, -X, 68.25, H, [{ a: 81.75 - 76.8, b: 81.75 - 73.2, h: 3.6 }], H, 0); wall(P, 'fourthR', X, 68.25, X, 81.75, H, [], H, 0);
  // the tepidarium/caldarium cross wall: other side of the shared wall
  vault(P, 'fluted', -X, X, 68.25, 81.75, H, 1.6); lunette(P, -X, X, 68.25, H, C(0xefe8d8)); lunette(P, -X, X, 81.75, H, C(0xefe8d8));
  jambs(P, -2.3, 2.3, 67.75, 68.25, 3.0); jambs(P, -2.3, 2.3, 81.75, 82.25, 3.0);
  floor(P, 'marble', -X, 68.25, X, 81.75, 0.01, 0.9, { color: C(0xe8e6e0) });
  { // apse with the labrum
    const ax = -X, az = 75, r = 1.8;
    P.add(grid(24, 6, (u, v) => { const a = Math.PI / 2 + Math.PI * u; return V(ax + Math.cos(a) * r, lerp(0, 3.6, v), az + Math.sin(a) * r); }), 'plaster', { color: C(0xe8e0cc) });
    P.add(grid(24, 8, (u, v) => { const a = Math.PI / 2 + Math.PI * u, e = v * Math.PI / 2; return V(ax + Math.cos(a) * r * Math.cos(e), 3.6 + r * Math.sin(e), az + Math.sin(a) * r * Math.cos(e)); }, false, (u, v) => [u * 3, v]), 'fluted', { keepUV: true });
    P.add(grid(24, 2, (u, v) => { const a = Math.PI / 2 + Math.PI * u; return V(ax + Math.cos(a) * r * v, 0.012, az + Math.sin(a) * r * v); }), 'marble', { color: C(0xe8e6e0) });
    P.add(lathe([[0, 0], [0.3, 0], [0.22, 0.1], [0.16, 0.8], [0.3, 0.86], [0.85, 0.95], [0.9, 1.06], [0.82, 1.08], [0.3, 1.0], [0, 1.0]], 64).translate(ax - 0.75, 0, az), 'marble', { color: COL.marble });
    water(P, new THREE.CircleGeometry(0.8, 40).rotateX(-Math.PI / 2).translate(ax - 0.75, 1.02, az));
    P.add(new THREE.CylinderGeometry(0.015, 0.02, 0.5, 6).translate(ax - 0.75, 1.3, az), 'water', { color: C(0xbcd8dc) });
  }
  { // alveus — lane 2
    const x0 = 1.45, x1 = X, z0 = 70, z1 = 78;
    for (const [w, d, x, z] of [[x1 - x0, 0.3, (x0 + x1) / 2, z0 + 0.15], [x1 - x0, 0.3, (x0 + x1) / 2, z1 - 0.15], [0.3, z1 - z0, x0 + 0.15, (z0 + z1) / 2]]) P.add(xf(block(w, 0.65, d, 0.03), [x, 0, z]), 'marble', { color: COL.marble });
    P.add(xf(block(0.35, 0.3, z1 - z0 - 0.6, 0.02), [x0 + 0.47, 0, (z0 + z1) / 2]), 'marble', { color: COL.marble });
    water(P, new THREE.PlaneGeometry(x1 - x0 - 0.3, z1 - z0 - 0.6).rotateX(-Math.PI / 2).translate((x0 + x1) / 2 + 0.15, 0.5, (z0 + z1) / 2), C(0x6a9aa0));
    obstacles.push({ type: 'hot pool (alveus)', lane: 2, z0: z0, z1: z1, act: 'dodge' }); }
  { // wooden bathing tub with towels — lane 1
    const z = 75; P.add(lathe([[0, 0], [0.55, 0], [0.62, 0.55], [0.58, 0.57], [0.5, 0.06], [0, 0.06]], 40).translate(0, 0, z), 'wood', { color: COL.woodLt, noise: 0.2, freq: 10 });
    for (const y of [0.12, 0.45]) P.add(new THREE.TorusGeometry(0.6 - (0.45 - y) * 0.1, 0.02, 6, 40).rotateX(Math.PI / 2).translate(0, y, z), 'bronze', { color: C(0x4a4038) });
    water(P, new THREE.CircleGeometry(0.55, 32).rotateX(-Math.PI / 2).translate(0, 0.45, z));
    P.add(xf(block(0.6, 0.08, 0.35, 0.03, 2), [0.6, 0.57, z - 0.1], [0, 0, -0.5]), 'cloth', { color: C(0xe6dcc6) });
    obstacles.push({ type: 'wooden tub', lane: 1, z0: 74.4, z1: 75.6, act: 'dodge' }); }

  // PRAEFURNIUM: the furnace room behind the hot room — boilers, glowing furnace mouth, firewood
  { const x0 = -4, x1 = 4, z0 = 82.25, z1 = 89.75, h = 3.2;
    wall(P, 'opus', x0, z1, x0, z0, h, [], h, 0); wall(P, 'opus', x1, z0, x1, z1, h, [], h, 0);
    wall(P, 'opus', x1, z1, x0, z1, h, [{ a: 1.7, b: 6.3, h: 3.0 }], h, 0);
    wall(P, 'opus', x0, z0, x1, z0, h, [{ a: 1.7, b: 6.3, h: 3.0 }], h, 0);
    vault(P, 'opus', x0, x1, z0, z1, h, 3); lunette(P, x0, x1, z0, h, C(0x8a8070)); lunette(P, x0, x1, z1, h, C(0x8a8070));
    P.add(grid(8, 8, (u, v) => V(lerp(x0, x1, u), 0.01, lerp(z0, z1, v))), 'sand', { color: C(0x8a7a66) });
    // furnace on the west side
    P.add(xf(block(1.6, 1.6, 3.6, 0.03), [x0 + 0.8, 0, 86]), 'opus');
    P.add(grid(12, 4, (u, v) => { const a = Math.PI * u; return V(x0 + 1.61, lerp(0, 0.4 + 0.45 * Math.sin(a), v), 86 + 0.5 * Math.cos(a)); }), 'fire', { color: C(0xffffff) });
    for (let i = 0; i < 20; i++) P.add(xf(new THREE.IcosahedronGeometry(rr(0.04, 0.08), 0), [x0 + 1.75 + rr(0, 0.4), 0.03, 86 + rr(-0.5, 0.5)]), i % 2 ? 'fire' : 'stone', { color: i % 2 ? C(0xffffff) : C(0x2a2220) });
    // three boilers (hot, warm, cold) on a masonry base on the east side
    P.add(xf(block(1.5, 1.0, 6.4, 0.03), [x1 - 0.75, 0, 86]), 'opus');
    for (const [z, hh] of [[83.8, 1.4], [86, 1.6], [88.2, 1.4]]) { P.add(new THREE.CylinderGeometry(0.55, 0.6, hh, 40).translate(x1 - 0.75, 1.0 + hh / 2, z), 'bronze', { color: C(0x6a6058) }); P.add(new THREE.TorusGeometry(0.56, 0.035, 8, 40).rotateX(Math.PI / 2).translate(x1 - 0.75, 1.0 + hh, z), 'bronze', { color: C(0x5a4a3a) }); rod(P, V(x1 - 0.75, 1.3, z), V(x1 + 0.1, 3.0, z), 0.06, 'stone', C(0x6a6460)); }
    // firewood across the floor — jump
    for (let i = 0; i < 6; i++) rod(P, V(-2.3 + rr(-0.1, 0.1), 0.12 + (i % 2) * 0.2, 86 + rr(-0.4, 0.4) + (i - 3) * 0.12), V(2.1, 0.12 + (i % 2) * 0.2, 86 + rr(-0.4, 0.4)), rr(0.08, 0.12), 'wood', i % 2 ? COL.wood : COL.woodDk);
    for (let i = 0; i < 18; i++) rod(P, V(x0 + 0.3 + rr(0, 0.3), 0.1 + (i % 6) * 0.18, 83 + Math.floor(i / 6) * 0.25), V(x0 + 0.3 + rr(0, 0.3), 0.1 + (i % 6) * 0.18, 84.4 + Math.floor(i / 6) * 0.25), 0.07, 'wood', COL.woodDk);   // stacked logs
    obstacles.push({ type: 'firewood', lane: -1, z0: 85.4, z1: 86.6, act: 'jump' });
  }
  // outer shell, gable roofs, the cone roof over the round room
  const sh = 8.6;
  for (const s of [-1, 1]) { wall(P, 'plaster', s * 5.5, s > 0 ? 40 : 90, s * 5.5, s > 0 ? 90 : 40, sh, [], sh, 0); }
  wall(P, 'plaster', -5.5, 90.25, 5.5, 90.25, sh, [{ a: 1.2, b: 9.8, h: 3.0 }], sh, 0);
  for (const [z0, z1] of [[40, 50.2], [59.8, 82.2]]) { tiledRoof(P, V(5.8, sh, z0), V(5.8, sh, z1), V(0, 10.6, z1), V(0, 10.6, z0)); tiledRoof(P, V(-5.8, sh, z1), V(-5.8, sh, z0), V(0, 10.6, z0), V(0, 10.6, z1)); }
  tiledRoof(P, V(5.8, 6.4, 82.2), V(5.8, 6.4, 90.3), V(0, 7.6, 90.3), V(0, 7.6, 82.2)); tiledRoof(P, V(-5.8, 6.4, 90.3), V(-5.8, 6.4, 82.2), V(0, 7.6, 82.2), V(0, 7.6, 90.3));
  P.add(grid(64, 4, (u, v) => { const a = u * TAU, r = lerp(5.9, 0.8, v); return V(r * Math.cos(a), lerp(sh, 9.4 + 1.0, v), 55 + r * Math.sin(a)); }, true), 'terracotta', { colorFn: p => tint(COL.terra, 0.85 + 0.25 * hash(Math.round(Math.atan2(p.z - 55, p.x) * 20), 0, 0)) });
  for (const z of [50, 60]) P.add(box(11, 2.0, 0.4, 0, sh - 2.0, z), 'plaster', { color: PL });
}

// ---------------- WOMEN'S BATHS (closed block to the east) and the side street at the back
{
  const P = part('Baths_Surroundings');
  for (const [x0, z0, x1, z1] of [[5.5, 40, 16.25, 40], [16.25, 40, 16.25, 72], [16.25, 72, 5.5, 72]]) wall(P, 'plaster', x0, z0, x1, z1, 7, [], 7, 0);
  tiledRoof(P, V(16.5, 7, 40), V(16.5, 7, 72), V(10.9, 8.6, 72), V(10.9, 8.6, 40)); tiledRoof(P, V(5.5, 7, 72), V(5.5, 7, 40), V(10.9, 8.6, 40), V(10.9, 8.6, 72));
  floor(P, 'basalt', -30, 90.25, 30, 104, 0, 4, { color: C(0xffffff) });
  if (HD) {
    wall(P, 'plaster', 30, 104, -30, 104, 6, [{ a: 8, b: 10, h: 2.8 }, { a: 22, b: 26, h: 3.0 }, { a: 40, b: 42, h: 2.8 }], 6, 0);
    P.add(grid(60, 2, (u, v) => V(lerp(-30, 30, u), lerp(0, 1.0, v), 103.98)), 'plaster', { color: RED });
  } else {
    // the game's version: the run goes straight on, up a street across from the back door
    wall(P, 'plaster', 30, 104, -30, 104, 6, [{ a: 8, b: 10, h: 2.8 }, { a: 25, b: 35, h: 6 }, { a: 40, b: 42, h: 2.8 }], 6, 0);
    for (const [x0, x1] of [[-30, -5], [5, 30]]) P.add(grid(25, 2, (u, v) => V(lerp(x0, x1, u), lerp(0, 1.0, v), 103.98)), 'plaster', { color: RED });
  }
  for (const [x, z] of [[-14, 98], [12, 99]]) amphora(P, x, z, rr(0, 3), 0.2);
  for (const [x0, z0, x1, z1] of [[-60, -40, 60, -16], [-60, 104, 60, 130], [-60, -16, -40, 104], [30, -16, 60, 104], [-40, 0, -30.5, 90.25], [16.5, 0, 30, 90.25]]) P.add(grid(8, 8, (u, v) => V(lerp(x0, x1, u), -0.05, lerp(z0, z1, v))), 'grass', { color: C(0x9aa070) });
}

// ================================================================== EXPORT
const root = new THREE.Group(); root.name = 'Pompeii_Stabian_Baths';
root.userData = {
  route: 'Enter from Via dell\'Abbondanza (z = 0), cross the palaestra, run through the men\'s baths, out through the furnace room (z = 90). Lanes x = -1.8, 0, 1.8. Floor at y = 0 throughout.',
  routeY: [[-20, 0], [110, 0]], obstacles,
};
let total = 0;
const built = [];
for (const p of parts) { const g = p.build(); built.push(g); total += g.userData.tris; console.log(`${p.name.padEnd(20)} ${String(Math.round(g.userData.tris)).padStart(7)} tris, ${g.children.length} meshes`); if (process.env.BATHS_PROFILE) console.log('   ', g.children.map((m) => `${m.material.name}:${m.geometry.index.count / 3}`).join(' ')); }
if (!HD) {
  // The game's version: the whole building as one mesh per material (one draw call each).
  const byMat = new Map();
  for (const g of built) for (const m of g.children) {
    if (!byMat.has(m.material)) byMat.set(m.material, []);
    byMat.get(m.material).push(m.geometry);
  }
  for (const [mat, geos] of byMat) {
    const geo = mergeGeometries(geos);
    if (!geo) throw new Error(`could not merge ${mat.name}`);
    const m = new THREE.Mesh(geo, mat); m.name = `Baths_${mat.name}`; root.add(m);
  }
  const scene = new THREE.Scene(); scene.add(root);
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
  writeFileSync('stabian-baths.glb', Buffer.from(glb));
  console.log(`stabian-baths.glb: ${(glb.byteLength / 1048576).toFixed(2)} MB, ${Math.round(total)} tris, ${byMat.size} meshes, obstacles: ${obstacles.length}`);
  process.exit(0);
}
for (const g of built) root.add(g);
const scene = new THREE.Scene(); scene.add(root);
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync('pompeii-stabian-baths.glb', Buffer.from(glb));
console.log(`pompeii-stabian-baths.glb: ${(glb.byteLength / 1048576).toFixed(2)} MB, ${Math.round(total)} tris, obstacles: ${obstacles.length}`);
for (const m of Object.values(MATS)) { m.map = null; m.normalMap = null; }
const lite = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync('pompeii-stabian-baths-lite.glb', Buffer.from(lite));
console.log(`lite: ${(lite.byteLength / 1048576).toFixed(2)} MB`);
