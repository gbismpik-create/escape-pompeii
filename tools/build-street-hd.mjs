// Escape Pompeii — HD street kit (Via dell'Abbondanza): painted house and shop fronts, basalt road, props, obstacles.
// Every piece is a named top-level node in the game's street convention (see STREET KIT below), named as the game
// asks for it (Road_30m, Kerbs_30m, the house fronts, Amphora, Fountain, AmphoraStack, Cart, Rubble).
// Output: street-hd.glb, the game's phone version (npm run build:street: simplified for near and far, compressed).
// With STREET_QUALITY=hd, as designed: full-size textures (also written to stexout/) and full geometry.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createCanvas, ImageData as NapiImageData } from '@napi-rs/canvas';
globalThis.ImageData = NapiImageData;
import { writeFileSync, mkdirSync } from 'node:fs';
import * as TX from './villa-textures.mjs';
import * as AT from './amph-textures.mjs';
import * as BT from './baths-textures.mjs';
import * as PT from './palaestra-textures.mjs';
import * as ST from './street-textures.mjs';
import { head } from './anatomy.mjs';
import { Sculpture, mesh as sculptMesh, frame as sframe } from './sculpt.mjs';

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
// ---------------------------------------------------------------- textures + materials
const TEXDIR = 'stexout'; if (process.env.STREET_QUALITY === 'hd') mkdirSync(TEXDIR, { recursive: true });
function tex(canvas, repeat = true, key = null, png = false, linear = false) {
  canvas = shrink(canvas, png ? Math.max(0.5, Q.tex) : key && (key.startsWith('f_') || key === 'basalt') ? Q.texSharp : Q.tex);
  if (key && HD) writeFileSync(`${TEXDIR}/${key}.${png ? 'png' : 'jpg'}`, png ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg', 86));
  const w = canvas.width, h = canvas.height, src = canvas.getContext('2d').getImageData(0, 0, w, h).data, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) data.set(src.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat); t.flipY = false; t.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.needsUpdate = true;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.userData.mimeType = png ? 'image/png' : 'image/jpeg'; t.anisotropy = 8;
  return t;
}
const T0 = Date.now(), lap = n => console.log(`  ${n} ${((Date.now() - T0) / 1000).toFixed(0)}s`);
const TEX = {}, paint = (k, fn, repeat = true, png = false) => { TEX[k] = tex(fn(), repeat, k, png); lap(k); };
const HD = process.env.STREET_QUALITY === 'hd';
// phone: smaller textures (facades and the road at half size, the tiling materials at a quarter), coarser grids, fewer loose bits
const Q = HD ? { tex: 1, texSharp: 1, roadStep: 0.045, roadRelief: true, paveStep: 0.08, wallStep: 0.1, bits: 1, head: 26000, headH: 0.0022, kerbSegs: 3 }
  : { tex: 0.25, texSharp: 0.5, roadStep: 0.3, roadRelief: false, paveStep: 0.4, wallStep: 0.5, bits: 0.3, head: 2500, headH: 0.007, kerbSegs: 1 };
const shrink = (canvas, k) => { if (k >= 1) return canvas; const c = createCanvas(Math.round(canvas.width * k), Math.round(canvas.height * k)), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(canvas, 0, 0, c.width, c.height); return c; };
const FAST = !!process.env.FAST;     // FAST=1 skips the slow painted facades (grey placeholders) for geometry checks
const quick = (W, H, c) => () => { const cv = createCanvas(W, H), g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, W, H); return cv; };
// building fronts (each painted for its own facade) and materials
paint('f_houseA', FAST ? quick(512, 376, '#d8ccb4') : ST.facadeHouseA, false); paint('f_houseB', FAST ? quick(512, 546, '#c99a48') : ST.facadeHouseB, false);
paint('f_thermo', FAST ? quick(512, 392, '#cf8d68') : ST.facadeThermopolium, false); paint('f_bakery', FAST ? quick(512, 410, '#ece4d2') : ST.facadeBakery, false);
paint('f_fullery', FAST ? quick(512, 410, '#d9c08a') : ST.facadeFullonica, false); paint('f_colonnade', FAST ? quick(1024, 358, '#ece4d2') : ST.colonnadeWall, false);
paint('shop', ST.shopInterior); paint('basalt', ST.basaltStreet); paint('kerb', ST.kerbStone); paint('tuff', ST.tuff); paint('lava', ST.lava);
paint('planks', ST.planks); paint('counter', ST.counterVeneer); paint('brick', ST.brickWork); paint('signinum', TX.signinum); paint('marble', TX.marbleTexture);
paint('lararium', TX.larariumPainting, false); paint('stucco', () => PT.columnStucco(0.33), false);
const waterN = tex(TX.waterNormal(), true, 'water_n', true, true);
const MATS = {};
for (const [k, t] of Object.entries(TEX)) MATS[k] = new THREE.MeshStandardMaterial({ name: k, map: t, vertexColors: true, roughness: k === 'marble' ? 0.3 : k === 'basalt' ? 0.62 : k === 'counter' ? 0.4 : 0.88, side: THREE.DoubleSide });
const plain = { plaster: [0.92, 0], stone: [0.85, 0], terracotta: [0.78, 0], wood: [0.78, 0], bronze: [0.36, 0.85], iron: [0.6, 0.7], cloth: [0.95, 0], plant: [0.9, 0], soil: [1, 0], dark: [1, 0], smoke: [1, 0], mountain: [0.95, 0], bread: [0.85, 0], sculpture: [0.75, 0] };
for (const [k, [r, m]] of Object.entries(plain)) MATS[k] = new THREE.MeshStandardMaterial({ name: k, color: 0xffffff, vertexColors: true, roughness: r, metalness: m, side: THREE.DoubleSide });
MATS.water = new THREE.MeshStandardMaterial({ name: 'water', color: 0xffffff, vertexColors: true, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.82, side: THREE.DoubleSide, normalMap: waterN, normalScale: new THREE.Vector2(0.5, -0.5) });
// metres per texture repeat for box-projected materials
const AUTO_UV = { basalt: 4, kerb: 1.4, tuff: 1.0, lava: 0.9, planks: 1.0, counter: 1.5, brick: 1.6, signinum: 1.2, marble: 0.9, water: 1.2, shop: 4 };
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
  if (!HD) return new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);   // phone: plain boxes, no bevels
  const b = Math.min(bevel, w / 4, h / 4, d / 4), s = new THREE.Shape();
  s.moveTo(-w / 2 + b, -h / 2 + b); s.lineTo(w / 2 - b, -h / 2 + b); s.lineTo(w / 2 - b, h / 2 - b); s.lineTo(-w / 2 + b, h / 2 - b); s.lineTo(-w / 2 + b, -h / 2 + b);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * b, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: segs, curveSegments: 1 });
  g.translate(0, h / 2, -(d - 2 * b) / 2); return g;
}
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const lathe = (pts, segs = 56) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), HD ? segs : Math.max(8, Math.round(segs / 3)));
const ell = (rx, ry, rz, w = 28, h = 18) => new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz);
const tint = (c, k) => new THREE.Color(c.r * k, c.g * k, c.b * k);
function tiledRoof(P, a, b, c, d) {   // a,b along eave; c,d along ridge (a↔d, b↔c)
  const L = a.distanceTo(b), n = Math.max(2, Math.round(L / 0.36));
  P.add(grid(n, 6, (u, v) => a.clone().lerp(b, u).lerp(d.clone().lerp(c, u), v)), 'terracotta', { colorFn: () => tint(COL.terra, 0.85), ao: false, noise: 0.14, freq: 3 });
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, e = a.clone().lerp(b, t), r = d.clone().lerp(c, t);
    const len = e.distanceTo(r);
    const g = new THREE.CylinderGeometry(0.07, 0.08, len, 6, 1, true, 0, Math.PI); g.rotateZ(Math.PI / 2); g.rotateY(Math.PI / 2);
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
  P.add(grid(40, 16, (u, v) => {
    const a = u * TAU, y = y0 + v * (yc - y0), r = R * (1.06 - 0.16 * Math.pow(v, 1.6));
    const f = y > low + 0.03 ? R * 0.055 * Math.pow(Math.abs(Math.cos(a * flutes / 2)), 0.6) * smooth((y - low) / 0.08) : 0;
    return V(x + Math.sin(a) * (r - f), y, z + Math.cos(a) * (r - f));
  }, true, mat === 'marble' ? (u, v) => [u * 2, v * 3] : null), mat, { colorFn: p => (mat === 'plaster' && p.y < low ? COL.red.clone() : mat === 'marble' ? COL.marble : C(0xf0e9da)), noise: 0.04 });
  // Attic base: plinth + torus + scotia + torus
  P.add(xf(block(R * 2.7, 0.08, R * 2.7, 0.015), [x, 0, z]), 'marble', { color: COL.marble });
  P.add(lathe([[R * 1.3, 0.08], [R * 1.36, 0.11], [R * 1.3, 0.14], [R * 1.12, 0.16], [R * 1.08, 0.19], [R * 1.18, 0.21], [R * 1.12, 0.24], [R * 1.06, 0.245], [0, 0.245]], 28).translate(x, 0, z), 'marble', { color: COL.marble });
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
        P.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.013, 6), cm, { color: cc });
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
//@@CONTENT@@
// ================================================================== STREET KIT
// Units: metres. The runner moves toward +Z. Player's left = +X.
// Cross-section (the game's): road |x| <= 2.7 (3 lanes of 1.8 m, centres x = -1.8, 0, 1.8), kerb 2.7–3.0, raised pavement
// 3.0–4.6 at y = 0.35, house fronts at |x| = 4.6.
// Facade pieces are built with width along +X from 0 to W, height up +Y from 0 (pavement level), front face at z = 0 facing +Z,
// building behind (−Z); at export they are centred on x and lifted onto the pavement, as the game lays them out.
const ROAD_HALF = 2.7, KERB_W = 0.3, KERB_H = 0.35, PAVE_OUT = 4.6, LEN = 30;
const parts = {}, part = n => (parts[n] = new Part(n));
const k3 = (c, k) => new THREE.Color(c.r * k, c.g * k, c.b * k);
const smoothstep = (a, b, x) => smooth((x - a) / (b - a));
function tube(pts, r, radial = 8, seg = null) { const c = new THREE.CatmullRomCurve3(pts); return new THREE.TubeGeometry(c, seg ?? pts.length * 8, r, radial, false); }
function rod(P, a, b, r, mat, opts = {}, seg = 10) {
  const L = a.distanceTo(b), g = new THREE.CylinderGeometry(r * (opts.taper ?? 1), r, L, seg, 1); g.translate(0, L / 2, 0);
  g.applyMatrix4(new THREE.Matrix4().compose(a, new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()), V(1, 1, 1)));
  P.add(g, mat, opts);
}
// geometry from explicit quads/tris with optional per-vertex uv
function quad(a, b, c, d, uv = null) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c, d].flatMap(v => [v.x, v.y, v.z]), 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv.flat(), 2)); g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); return g;
}
// rectangle face subdivided on a grid of break lines, skipping holes; fn maps (x, y) -> Vector3, uvFn (x, y) -> [u, v]
function holedGrid(W, H, holes, step, fn, uvFn) {
  const brk = (L, extra) => { const s = new Set([0, L]); for (let t = step; t < L - 1e-6; t += step) s.add(+t.toFixed(4)); for (const e of extra) if (e > 0 && e < L) s.add(+e.toFixed(4)); return [...s].sort((a, b) => a - b); };
  const xs = brk(W, holes.flatMap(h => [h[0], h[1]])), ys = brk(H, holes.flatMap(h => [h[2], h[3]]));
  const pos = [], uv = [], idx = [], nx = xs.length;
  for (const y of ys) for (const x of xs) { const p = fn(x, y); pos.push(p.x, p.y, p.z); uv.push(...uvFn(x, y)); }
  for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
    if (holes.some(h => cx > h[0] && cx < h[1] && cy > h[2] && cy < h[3])) continue;
    const a = j * nx + i; idx.push(a, a + 1, a + nx, a + 1, a + nx + 1, a + nx);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// lofted moulding: profile [[z, y], ...] swept along x from x0 to x1
function moulding(P, prof, x0, x1, mat, opts = {}) {
  P.add(grid(Math.max(1, Math.round((x1 - x0) / 0.5)), prof.length - 1, (u, v) => { const t = v * (prof.length - 1), i = Math.min(prof.length - 2, Math.floor(t)), f = t - i; return V(lerp(x0, x1, u), lerp(prof[i][1], prof[i + 1][1], f), lerp(prof[i][0], prof[i + 1][0], f)); }), mat, opts);
}
const C_PL = C(0xe4d8bf), C_PLD = C(0xb9aa8e), C_TERRA = C(0xb4603a), C_TERRA_D = C(0x84432a), C_TERRA_L = C(0xc9784e), C_DARK = C(0x2a221d), C_WOOD = C(0x8a6a48);

// ---------------- facade wall: painted front face (uv = x/W, y/H), reveals, side returns, stucco cornice, tuff base course
function facadeWall(P, mat, W, H, holes, o = {}) {
  const T = o.T ?? 0.45, und = (x, y) => (fbm(x * 2.2, y * 2.2, 3.1) - 0.5) * 0.008;     // trowelled plaster undulation
  P.add(holedGrid(W, H, holes, Q.wallStep, (x, y) => V(x, y, und(x, y) * (x > 0.01 && x < W - 0.01 && y > 0.01 ? 1 : 0)), (x, y) => [x / W, y / H]), mat, { keepUV: true, colorFn: () => C(0xffffff) });
  for (const [x0, x1, y0, y1] of holes) {
    const rm = o.revealMat ?? 'plaster', rc = o.revealCol ?? C_PL, opt = { colorFn: p => k3(rc, 0.75 + 0.25 * smooth(1 + p.z / T)), noise: 0.06 };
    P.add(quad(V(x0, y0, 0), V(x0, y0, -T), V(x0, y1, -T), V(x0, y1, 0)), rm, opt);
    P.add(quad(V(x1, y0, -T), V(x1, y0, 0), V(x1, y1, 0), V(x1, y1, -T)), rm, opt);
    P.add(quad(V(x0, y1, 0), V(x0, y1, -T), V(x1, y1, -T), V(x1, y1, 0)), rm, opt);
    if (y0 > 0.01) P.add(quad(V(x0, y0, -T), V(x0, y0, 0), V(x1, y0, 0), V(x1, y0, -T)), rm, opt);
  }
  for (const x of [0, W]) P.add(quad(V(x, 0, 0), V(x, 0, -T), V(x, H, -T), V(x, H, 0)), 'plaster', { color: C_PLD });
  // stucco cornice under the eaves
  if (o.cornice !== false) moulding(P, [[0, H - 0.3], [0.03, H - 0.27], [0.03, H - 0.22], [0.07, H - 0.18], [0.12, H - 0.1], [0.16, H - 0.06], [0.16, H], [0, H]], -0.02, W + 0.02, 'plaster', { colorFn: p => k3(o.corniceCol ?? C(0xeee6d4), 0.85 + 0.15 * smooth((p.y - H + 0.3) / 0.3)), noise: 0.05 });
  // tuff base course (with the holes for doors left clear)
  if (o.base !== false) { let s = 0; for (const [x0, x1, y0] of [...holes].filter(h => h[2] < 0.05).sort((a, b) => a[0] - b[0]).concat([[W, W, 0]])) { if (x0 - s > 0.05) P.add(xf(block(x0 - s, 0.24, 0.12, 0.02, 2), [(s + x0) / 2, 0, 0.03]), 'tuff', { color: C(0xd8d0c4) }); s = x0 + (x1 - x0); } }
}
// party walls behind a front: so taller neighbours show plastered side walls and the roofs close up
function sideWalls(P, W, H, D = 3.8) {
  for (const x of [0, W]) P.add(grid(Math.round(D / 0.5), Math.round(H / 0.5), (u, v) => V(x, v * H, -u * D)), 'plaster', { colorFn: p => k3(C(0xd2c3a4), 0.75 + 0.2 * fbm(p.z * 2, p.y * 2, x) + 0.1 * smooth(p.y / H)), noise: 0.1, freq: 3 });
  P.add(grid(Math.round(W / 1), 1, (u, v) => V(u * W, 0.02 + v * (H - 0.02), -D)), 'plaster', { color: C(0x9d8f78) });
}
// tiled roof falling towards the street: tegulae (flat) under imbrices (cover tiles), antefixes along the eave, rafter ends
function antefix(P, x, y, z) {
  const s = new THREE.Shape(); s.moveTo(-0.075, 0); s.lineTo(0.075, 0); s.lineTo(0.09, 0.06); s.bezierCurveTo(0.1, 0.16, 0.04, 0.2, 0, 0.21); s.bezierCurveTo(-0.04, 0.2, -0.1, 0.16, -0.09, 0.06); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: HD, bevelSize: 0.005, bevelThickness: 0.005, bevelSegments: 1, curveSegments: HD ? 8 : 2 }); xf(g, [x, y, z]);
  P.add(g, 'terracotta', { colorFn: (p, n) => k3(C_TERRA_L, 0.85 + 0.15 * Math.max(0, n.z)), noise: 0.1 });
  if (!HD) return;
  for (let k = -2; k <= 2; k++) P.add(xf(new THREE.BoxGeometry(0.012, 0.11, 0.008), [x + Math.sin(k * 0.35) * 0.05, y + 0.1 + Math.cos(k * 0.35) * 0.04, z + 0.027], [0, 0, -k * 0.35]), 'terracotta', { color: C_TERRA_D });   // palmette ribs
}
function roof(P, W, H, o = {}) {
  const out = o.out ?? 0.62, back = o.back ?? 3.8, rise = o.rise ?? 0.3, y0 = H + 0.02;
  const a = V(-0.04, y0, out), b = V(W + 0.04, y0, out), c = V(W + 0.04, y0 + (out + back) * rise, -back), d = V(-0.04, y0 + (out + back) * rise, -back);
  // tegulae: rows of flat tiles, each overlapping the next (stepped surface)
  const n = Math.max(2, Math.round(W / 0.4)), rows = Math.round((out + back) / 0.5), slope = c.clone().sub(b), L = slope.length(), dir = slope.normalize();
  if (!HD) P.add(grid(n, rows, (u, v) => a.clone().lerp(b, u).addScaledVector(dir, v * L).add(V(0, 0.012, 0))), 'terracotta', { colorFn: () => k3(C_TERRA, rr(0.82, 1.1)), noise: 0.12, freq: 6 });   // phone: one sheet
  else for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) {
    const p = a.clone().lerp(b, (i + 0.5) / n).addScaledVector(dir, (r + 0.5) * L / rows), tg = block(W / n - 0.012, 0.025, L / rows + 0.06, 0.006);
    tg.applyMatrix4(new THREE.Matrix4().compose(p.add(V(0, 0.012 + (r % 2) * 0.002, 0)), new THREE.Quaternion().setFromUnitVectors(V(0, 0, -1), dir), V(1, 1, 1)));
    const kk = rr(0.82, 1.1); P.add(tg, 'terracotta', { colorFn: () => k3(rnd() < 0.15 ? C_TERRA_L : C_TERRA, kk), noise: 0.12, freq: 6 });
  }
  // imbrices over the joints
  for (let i = 0; i <= n; i++) {
    const e = a.clone().lerp(b, i / n), len = L + 0.02;
    const g = new THREE.CylinderGeometry(0.07, 0.085, len, HD ? 10 : 4, HD ? 6 : 1, true, -Math.PI / 2, Math.PI); g.rotateX(-Math.PI / 2); g.translate(0, 0, -len / 2);
    const pa = g.attributes.position; for (let k = 0; k < pa.count; k++) { const zz = pa.getZ(k); pa.setY(k, pa.getY(k) + Math.max(0, Math.sin(-zz / len * Math.PI * rows)) * 0.004); }   // ridged where one overlaps the next
    g.applyMatrix4(new THREE.Matrix4().compose(e.clone().add(V(0, 0.03, 0)), new THREE.Quaternion().setFromUnitVectors(V(0, 0, -1), dir), V(1, 1, 1)));
    const kk = rr(0.8, 1.12); P.add(g, 'terracotta', { colorFn: p => k3(C_TERRA, kk * (0.9 + 0.1 * fbm(p.x * 4, p.z * 4, 1))), noise: 0.14, freq: 5 });
    if (i < n || true) antefix(P, e.x - 0.0, y0 - 0.02, out - 0.03);
  }
  // eave beam, rafter ends and the dark soffit
  P.add(xf(block(W + 0.1, 0.14, 0.1, 0.01), [W / 2, H - 0.16, out - 0.08]), 'planks', { color: C(0xd8ccbc) });
  for (let x = 0.2; x < W; x += 0.55) P.add(xf(block(0.1, 0.12, out + 0.02, 0.01), [x, H - 0.13, out / 2 - 0.02]), 'planks', { color: C(0xc8bcaa) });
  P.add(grid(Math.round(W), 1, (u, v) => V(u * W, H - 0.005, v * out)), 'planks', { color: C(0x8a7a66) });
  // gable ends closing the roof at the sides
  for (const x of [-0.02, W + 0.02]) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([x, H, 0, x, y0 + (out + back) * rise, -back, x, H, -back], 3)); g.setIndex([0, 1, 2]); g.computeVertexNormals(); P.add(g, 'plaster', { color: C(0xc9b99a) }); }
}
// Samnite doorway: tuff pilasters with cubic capitals and an architrave
function tuffDoorway(P, x0, x1, h, o = {}) {
  const pw = o.pw ?? 0.3;
  for (const [a, b] of [[x0 - pw, x0], [x1, x1 + pw]]) {
    P.add(xf(block(b - a, h, 0.14, 0.012, 2), [(a + b) / 2, 0, 0.04]), 'tuff', { color: C(0xf0e8dc) });
    P.add(xf(block(b - a + 0.08, 0.06, 0.2, 0.01), [(a + b) / 2, h, 0.05]), 'tuff', { color: C(0xf0e8dc) });                 // astragal
    P.add(xf(block(b - a + 0.14, 0.2, 0.24, 0.02, 2), [(a + b) / 2, h + 0.06, 0.06]), 'tuff', { color: C(0xf6eee2) });          // cubic capital
    for (const s of [-1, 1]) P.add(xf(new THREE.CylinderGeometry(0.045, 0.045, 0.02, HD ? 16 : 6), [(a + b) / 2 + s * 0.05, h + 0.16, 0.185], [Math.PI / 2, 0, 0]), 'tuff', { color: C(0xf6eee2) });   // carved rosettes
  }
  P.add(xf(block(x1 - x0 + 2 * pw + 0.2, 0.22, 0.22, 0.02, 2), [(x0 + x1) / 2, h + 0.26, 0.06]), 'tuff', { color: C(0xf0e8dc) });   // architrave
  moulding(P, [[0, h + 0.48], [0.17, h + 0.48], [0.2, h + 0.52], [0.2, h + 0.56], [0, h + 0.56]], x0 - pw - 0.12, x1 + pw + 0.12, 'tuff', { color: C(0xf6eee2) });
}
// two-leaf wooden door with bronze studs and ring handles, set back in the reveal, on a lava threshold
function door(P, x0, x1, h, depth = 0.3) {
  const w = (x1 - x0) / 2;
  for (const s of [0, 1]) {
    const xa = x0 + s * w, ang = s ? -0.0 : 0.0;
    P.add(xf(block(w - 0.015, h - 0.02, 0.07, 0.008), [xa + w / 2, 0.02, -depth]), 'planks', { color: C(0xd8c8b4) });
    for (const y of [0.25, h / 2, h - 0.3]) P.add(xf(block(w - 0.06, 0.12, 0.03, 0.006), [xa + w / 2, y, -depth + 0.05]), 'planks', { color: C(0xb8a894) });   // battens
    for (let r = 0; r < 7; r++) for (let c = 0; c < 3; c++) P.add(xf(new THREE.SphereGeometry(0.016, HD ? 10 : 4, HD ? 6 : 2, 0, TAU, 0, Math.PI / 2), [xa + w * (0.22 + c * 0.28), 0.3 + r * (h - 0.6) / 6, -depth + 0.035], [Math.PI / 2, 0, 0]), 'bronze', { color: C(0x8a6a3a) });
    P.add(xf(new THREE.TorusGeometry(0.06, 0.009, 8, 24), [xa + (s ? 0.12 : w - 0.12), h * 0.48, -depth + 0.05]), 'bronze', { color: C(0x7a5a30) });
    P.add(xf(new THREE.CylinderGeometry(0.03, 0.03, 0.015, 16), [xa + (s ? 0.12 : w - 0.12), h * 0.48 + 0.06, -depth + 0.04], [Math.PI / 2, 0, 0]), 'bronze', { color: C(0x7a5a30) });
  }
  P.add(xf(block(x1 - x0 + 0.1, 0.06, depth + 0.1, 0.01), [(x0 + x1) / 2, -0.04, -depth / 2 + 0.03]), 'lava', { color: C(0xe8e8e8) });          // threshold
  P.add(xf(block(x1 - x0, 0.06, 0.08, 0.01), [(x0 + x1) / 2, h - 0.06, -depth - 0.02]), 'planks', { color: C(0x9a8a76) });                   // lintel beam
  // dark interior behind the door
  P.add(quad(V(x0, 0, -depth - 0.06), V(x1, 0, -depth - 0.06), V(x1, h, -depth - 0.06), V(x0, h, -depth - 0.06)), 'dark', { color: C(0x1a1410) });
}
// window with a tuff sill, iron grille, half-open shutter and a dark room behind
function windowHole(P, x0, x1, y0, y1, T = 0.45) {
  P.add(xf(block(x1 - x0 + 0.16, 0.07, 0.16, 0.01), [(x0 + x1) / 2, y0 - 0.07, 0.04]), 'tuff', { color: C(0xf0e8dc) });
  for (let i = 1; i < 4; i++) rod(P, V(lerp(x0, x1, i / 4), y0, -0.12), V(lerp(x0, x1, i / 4), y1, -0.12), 0.011, 'iron', { color: C(0x4a4440) }, 6);
  rod(P, V(x0, (y0 + y1) / 2, -0.12), V(x1, (y0 + y1) / 2, -0.12), 0.01, 'iron', { color: C(0x4a4440) }, 6);
  P.add(xf(block(x1 - x0 - 0.02, y1 - y0 - 0.02, 0.03, 0.004), [x0 + (x1 - x0) / 2 - 0.12, y0 + 0.01, -T + 0.06], [0, 0.55, 0]), 'planks', { color: C(0xa89480) });
  P.add(quad(V(x0, y0, -T - 0.02), V(x1, y0, -T - 0.02), V(x1, y1, -T - 0.02), V(x0, y1, -T - 0.02)), 'dark', { color: C(0x14100c) });
}
// a shop room behind an opening: floor of signinum, painted walls, beamed ceiling; light falls off towards the back
function shopRoom(P, x0, x1, h, D, T = 0.45, o = {}) {
  const zb = -T - D, fall = p => 0.42 + 0.58 * smooth((p.z - zb) / (D + 0.5)), H2 = o.hc ?? h + 0.4;
  P.add(grid(Math.round((x1 - x0) / 0.5), Math.round(D / 0.5), (u, v) => V(lerp(x0, x1, u), 0.005, lerp(-T + 0.01, zb, v)), false, (u, v, q) => [q.x / 1.2, q.z / 1.2]), o.floor ?? 'signinum', { keepUV: true, colorFn: p => k3(C(0xd8d0c8), fall(p)) });
  const wallUV = (a) => (u, v, q) => [a(q) / (2 * H2), q.y / H2];
  P.add(grid(Math.round(D / 0.5), 4, (u, v) => V(x0, v * H2, lerp(-T, zb, u)), false, wallUV(q => -q.z)), 'shop', { keepUV: true, colorFn: p => k3(C(0xffffff), fall(p)) });
  P.add(grid(Math.round(D / 0.5), 4, (u, v) => V(x1, v * H2, lerp(zb, -T, u)), false, wallUV(q => -q.z)), 'shop', { keepUV: true, colorFn: p => k3(C(0xffffff), fall(p)) });
  if (o.back !== false) P.add(grid(Math.round((x1 - x0) / 0.5), 4, (u, v) => V(lerp(x0, x1, u), v * H2, zb), false, wallUV(q => q.x)), 'shop', { keepUV: true, colorFn: p => k3(C(0xffffff), 0.42) });
  P.add(grid(2, 2, (u, v) => V(lerp(x0, x1, u), H2, lerp(-T, zb, v))), 'planks', { colorFn: p => k3(C(0x9a8a78), fall(p) * 0.8) });
  for (let z = -T - 0.3; z > zb; z -= 0.6) P.add(xf(block(x1 - x0, 0.14, 0.12, 0.01), [(x0 + x1) / 2, H2 - 0.14, z]), 'planks', { colorFn: p => k3(C(0x8a7a66), fall(p)) });
}
// wooden shop closure: boards slotted into a groove in the lava threshold, with a narrow hinged door
function shutters(P, x0, x1, h, openLast = true) {
  P.add(xf(block(x1 - x0 + 0.06, 0.06, 0.4, 0.01), [(x0 + x1) / 2, -0.04, -0.18]), 'lava', { color: C(0xe8e8e8) });
  P.add(xf(new THREE.BoxGeometry(x1 - x0 - 0.02, 0.012, 0.05), [(x0 + x1) / 2, 0.021, -0.2]), 'dark', { color: C(0x0e0b09) });   // the groove
  const nb = Math.round((x1 - x0 - (openLast ? 0.6 : 0)) / 0.24), bw = (x1 - x0 - (openLast ? 0.6 : 0)) / nb;
  for (let i = 0; i < nb; i++) P.add(xf(block(bw - 0.008, h - 0.03, 0.045, 0.006), [x0 + (i + 0.5) * bw, 0.015, -0.2 + rr(-0.006, 0.006)], [0, 0, rr(-0.004, 0.004)]), 'planks', { colorFn: () => k3(C(0xd8c8b4), rr(0.85, 1.05)) });
  P.add(xf(block(x1 - x0, 0.1, 0.12, 0.01), [(x0 + x1) / 2, h - 0.1, -0.2]), 'planks', { color: C(0xa89480) });
  if (openLast) {   // the hinged door, ajar
    P.add(xf(block(0.58, h - 0.05, 0.05, 0.006), [0.29, 0.02, 0], [0, 0, 0]).applyMatrix4(new THREE.Matrix4().makeRotationY(-0.9)).translate(x1 - 0.6, 0, -0.2), 'planks', { color: C(0xd0c0ac) });
    P.add(quad(V(x1 - 0.6, 0, -0.5), V(x1, 0, -0.5), V(x1, h, -0.5), V(x1 - 0.6, h, -0.5)), 'dark', { color: C(0x14100c) });
  }
}
function amphoraGeo(scale = 1, kind = 0) {
  const prof = kind === 1 ? [[0, 0], [0.03, 0.03], [0.07, 0.15], [0.13, 0.32], [0.16, 0.46], [0.15, 0.6], [0.11, 0.7], [0.06, 0.76], [0.045, 0.86], [0.05, 0.9], [0.055, 0.92], [0.045, 0.93], [0.035, 0.92]]
    : [[0, 0], [0.015, 0.01], [0.022, 0.06], [0.04, 0.12], [0.1, 0.26], [0.15, 0.42], [0.165, 0.52], [0.16, 0.6], [0.13, 0.68], [0.09, 0.74], [0.055, 0.78], [0.045, 0.9], [0.055, 0.94], [0.058, 0.96], [0.048, 0.97], [0.038, 0.96]];
  const g = lathe(prof.map(([r, y]) => [r * scale, y * scale]), 36);
  return g;
}
function amphora(P, pos, rot = [0, 0, 0], scale = 1, kind = 0, tone = null) {
  const m = new THREE.Matrix4().compose(V(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), V(1, 1, 1));
  const t = tone ?? k3(rnd() < 0.5 ? C(0xc07a50) : C(0xb4643c), rr(0.85, 1.08));
  P.add(amphoraGeo(scale, kind).applyMatrix4(m), 'terracotta', { colorFn: (p, n) => k3(t, 0.9 + 0.12 * fbm(p.x * 9, p.y * 9, p.z * 9)), noise: 0.06, freq: 14 });
  for (const s of [1, -1]) P.add(tube([V(0.046 * s, 0.88, 0), V(0.1 * s, 0.9, 0), V(0.125 * s, 0.84, 0), V(0.11 * s, 0.72, 0)].map(v => v.multiplyScalar(scale)), 0.014 * scale, 8, 16).applyMatrix4(m), 'terracotta', { color: t });
}
function jugGeo(h = 0.25) { return lathe([[0, 0], [0.09, 0], [0.12, 0.08], [0.13, 0.16], [0.1, 0.26], [0.05, 0.32], [0.045, 0.4], [0.06, 0.43], [0.05, 0.44]].map(([r, y]) => [r * h / 0.44, y * h / 0.44]), 24); }

// ---------------- ROAD, KERBS, PAVEMENTS
{ const P = part('Road_Segment'); seed = 11;
  // Each vertex finds its stone in the same pattern as the basalt texture (uv = x/4, z/4), so the stones are domed,
  // the joints sunk and the two cart ruts worn into the crowns.
  const rut = x => Math.max(Math.exp(-Math.pow((Math.abs(x) - 0.8) / 0.075, 2)), 0.45 * Math.exp(-Math.pow((Math.abs(x - 1.8) - 0.8) / 0.08, 2)));
  const hgt = (x, z) => { const u = ((x / 4) % 1 + 1) % 1, v = ((z / 4) % 1 + 1) % 1, { e, best } = ST.basaltCell(u, 1 - v), em = e * 4;
    if (!Q.roadRelief) return { y: 0, em: 1, r: 0 };   // phone: a flat road, the texture carries the stones
    return { y: -0.022 + 0.022 * smoothstep(0, 0.07, em) - 0.006 * (1 - smoothstep(0.003, 0.016, em)) + (best[2] - 1) * 0.02 - 0.045 * rut(x), em, r: rut(x) }; };
  const nx = Math.round(ROAD_HALF * 2 / Q.roadStep), nz = Math.round(LEN / Q.roadStep);
  const g = grid(nx, nz, (u, v) => { const x = lerp(-ROAD_HALF, ROAD_HALF, u), z = v * LEN; return V(x, hgt(x, z).y, z); }, false, (u, v, q) => [q.x / 4, q.z / 4]);
  P.add(g, 'basalt', { keepUV: true, colorFn: p => { const h = hgt(p.x, p.z); return k3(C(0xffffff), (0.72 + 0.28 * smoothstep(0, 0.03, h.em)) * (1 + 0.18 * h.r)); } });
  // side skirts under the kerbs so no gap shows
  for (const s of [-1, 1]) P.add(grid(1, 30, (u, v) => V(s * ROAD_HALF, lerp(-0.08, 0.0, u), v * LEN)), 'basalt', { keepUV: false, color: C(0x555555) });
}
for (const side of [1, -1]) { const P = part(side > 0 ? 'Pavement_L' : 'Pavement_R'); seed = side > 0 ? 21 : 22;
  // kerbs: long blocks of Sarno limestone, top edge worn round, the odd one pierced for tethering animals
  for (let z = 0; z < LEN - 0.01;) {
    const l = Math.min(rr(0.9, 1.7), LEN - z), cx = side * (ROAD_HALF + KERB_W / 2);
    P.add(xf(block(KERB_W, KERB_H + 0.12, l - 0.012, 0.045, Q.kerbSegs), [cx, -0.1, z + l / 2], [0, 0, side * rr(-0.01, 0.01)]), 'kerb', { colorFn: p => k3(C(0xffffff), 0.82 + 0.18 * smooth((p.y + 0.05) / 0.3)) });
    if (rnd() < 0.18) { const hz = z + l * rr(0.3, 0.7); P.add(xf(new THREE.TorusGeometry(0.035, 0.016, 8, 16), [side * (ROAD_HALF + 0.03), KERB_H - 0.03, hz], [0, Math.PI / 2, 0]), 'kerb', { color: C(0x8a8070) }); P.add(xf(new THREE.CircleGeometry(0.03, 12), [side * (ROAD_HALF - 0.001), KERB_H - 0.06, hz], [0, -side * Math.PI / 2, 0]), 'dark', { color: C(0x15110e) }); }
    z += l;
  }
  // pavement: cocciopesto with white tesserae, gently cambered towards the kerb, a few repaired patches of limestone slabs
  const x0 = ROAD_HALF + KERB_W, W = PAVE_OUT - x0;
  P.add(grid(Math.max(1, Math.round(W / Q.paveStep)), Math.round(LEN / Q.paveStep), (u, v) => V(side * (x0 + u * W), KERB_H - 0.012 + u * 0.018 + (fbm(u * 9, v * 120, side) - 0.5) * 0.008, v * LEN), false, (u, v, q) => [q.x / 1.2, q.z / 1.2]), 'signinum', { keepUV: true, colorFn: p => k3(C(0xf0e8e0), 0.82 + 0.18 * fbm(p.x, p.z * 0.6, 3)) });
  for (let i = 0; i < 3; i++) { const z = rr(2, LEN - 3), l = rr(0.8, 1.6); P.add(xf(block(W * 0.7, 0.04, l, 0.01), [side * (x0 + W * 0.55), KERB_H - 0.02, z]), 'kerb', { color: C(0xe8e0d0) }); }
  P.add(xf(new THREE.BoxGeometry(W, KERB_H, LEN), [side * (x0 + W / 2), KERB_H / 2 - 0.02, LEN / 2]), 'plaster', { color: C(0x6a5a48) });
}
{ const P = part('Stepping_Stones'); seed = 31;
  // three lava stepping stones at kerb height, one in each lane; their sides polished by the passing wheels
  for (const x of [-1.8, 0, 1.8]) {
    const Hs = KERB_H + 0.04, g = lathe([[0, Hs], [0.36, Hs], [0.44, Hs - 0.02], [0.48, Hs - 0.07], [0.5, Hs - 0.2], [0.52, 0.0], [0.5, -0.06]], 64);
    g.scale(1, 1, 0.62);
    const pa = g.attributes.position; for (let i = 0; i < pa.count; i++) { const a = Math.atan2(pa.getZ(i), pa.getX(i)), k = 1 + 0.06 * Math.sin(a * 3 + x) + 0.03 * Math.sin(a * 7 + x * 3); pa.setX(i, pa.getX(i) * k); pa.setZ(i, pa.getZ(i) * k); if (pa.getY(i) > Hs - 0.01) pa.setY(i, pa.getY(i) - 0.012 * (1 - Math.hypot(pa.getX(i), pa.getZ(i) / 0.62) / 0.4)); }
    g.computeVertexNormals(); xf(g, [x, -0.03, 0], [0, rr(-0.15, 0.15), 0]);
    P.add(g, 'lava', { colorFn: (p, n) => k3(C(0xffffff), 0.85 + 0.3 * smooth((p.y - 0.25) * 6) + 0.15 * Math.abs(n.x)) });
  }
}

// ---------------- HOUSE FRONTS
{ const P = part('House_A'); seed = 41; const W = 6, H = 4.4;          // single-storey house: Samnite tuff doorway, studded door, two high grilled windows
  const holes = [[2.2, 3.6, 0, 2.62], [0.7, 1.2, 2.9, 3.45], [4.6, 5.1, 2.9, 3.45]];
  facadeWall(P, 'f_houseA', W, H, holes); sideWalls(P, W, H); roof(P, W, H);
  tuffDoorway(P, 2.2, 3.6, 2.62); door(P, 2.2, 3.6, 2.62, 0.32);
  windowHole(P, 0.7, 1.2, 2.9, 3.45); windowHole(P, 4.6, 5.1, 2.9, 3.45);
  // a bronze lamp bracket and a stone bench by the door (for clients waiting on the patron)
  rod(P, V(1.75, 2.35, 0), V(1.75, 2.35, 0.32), 0.012, 'bronze', { color: C(0x7a5a30) }, 6); P.add(xf(ell(0.08, 0.035, 0.05, 16, 8), [1.75, 2.38, 0.34]), 'bronze', { color: C(0x8a6a3a) });
  P.add(xf(block(1.6, 0.42, 0.42, 0.03, 2), [4.5, 0, 0.22]), 'tuff', { color: C(0xf0e8dc) });
}
{ const P = part('House_B'); seed = 42; const W = 6, H = 6.4;          // two storeys: two shops below (one shuttered, one open: the clothier), timber balcony above
  const holes = [[0.55, 1.65, 0, 2.42], [4.15, 5.45, 0, 2.42], [1.2, 1.7, 4.3, 4.9], [3.0, 3.6, 3.6, 5.2], [4.4, 4.9, 4.3, 4.9]];
  facadeWall(P, 'f_houseB', W, H, holes); sideWalls(P, W, H); roof(P, W, H, { out: 0.5 });
  shutters(P, 0.55, 1.65, 2.42); shopRoom(P, 0.55, 1.65, 2.42, 2.4);
  shopRoom(P, 4.15, 5.45, 2.42, 3.0); P.add(xf(block(1.36, 0.06, 0.48, 0.01), [4.8, -0.04, -0.2]), 'lava', { color: C(0xe8e8e8) });
  // the clothier's stock: dyed bolts on shelves, a garment on a rail, a felt cap and a counter
  for (const y of [0.9, 1.45, 2.0]) P.add(xf(block(1.2, 0.04, 0.4, 0.005), [4.8, y, -3.2]), 'planks', { color: C(0xb8a894) });
  const dyes = [0x5a2e4a, 0x9b2318, 0xc9952f, 0x3b5e7f, 0xe6dcc6, 0x4f6b3a, 0x7a3a2a];
  for (const y of [0.94, 1.49, 2.04]) for (let i = 0; i < 5; i++) P.add(xf(block(0.2, rr(0.12, 0.3), 0.32, 0.03, 2), [4.3 + i * 0.24, y, -3.2]), 'cloth', { color: C(pick(dyes)), noise: 0.12, freq: 9 });
  rod(P, V(4.2, 1.95, -1.4), V(5.4, 1.95, -1.4), 0.015, 'wood', { color: C_WOOD });
  for (let i = 0; i < 3; i++) P.add(grid(8, 10, (u, v) => V(4.35 + i * 0.36 + (u - 0.5) * 0.32 * (1 + v * 0.25), 1.92 - v * 1.1, -1.4 + Math.sin(u * Math.PI * 3) * 0.03 * v)), 'cloth', { color: C(pick(dyes)), noise: 0.15 });
  P.add(xf(block(1.1, 0.85, 0.45, 0.02), [4.8, 0, -0.9]), 'planks', { color: C(0xc8b8a4) });
  // balcony (maenianum): joists from the wall, plank floor, lattice parapet, posts, a lean-to tile roof
  for (let x = 0.9; x <= 5.11; x += 0.42) P.add(xf(block(0.1, 0.13, 1.15, 0.01), [x, 3.33, 0.5]), 'planks', { color: C(0xa89480) });
  P.add(xf(block(4.5, 0.06, 1.06, 0.006), [3.0, 3.46, 0.53]), 'planks', { color: C(0xc8b8a4) });
  const lat = (xa, xb, z) => { const n = Math.round((xb - xa) / 0.3); for (let i = 0; i < n; i++) { const xm = xa + (i + 0.5) * (xb - xa) / n; for (const s of [1, -1]) P.add(xf(new THREE.BoxGeometry(0.03, 0.62, 0.025), [xm, 3.82, z], [0, 0, s * 0.52]), 'planks', { color: C(0xb8a490) }); } };
  lat(0.8, 5.2, 1.04); for (const y of [3.5, 4.14]) P.add(xf(block(4.44, 0.06, 0.07, 0.006), [3.0, y, 1.04]), 'planks', { color: C(0x9a8670) });
  for (const x of [0.8, 5.2]) { P.add(xf(block(0.07, 0.7, 1.0, 0.006), [x, 3.48, 0.53]), 'planks', { color: C(0x9a8670) }); P.add(xf(block(0.12, 5.45, 0.12, 0.01), [x, 0, 1.0]), 'planks', { color: C(0xa08c76) }); }
  { const a = V(0.7, 5.42, 1.22), b = V(5.3, 5.42, 1.22), c = V(5.3, 5.78, 0.0), d = V(0.7, 5.78, 0.0), n = 12;
    P.add(grid(n, 3, (u, v) => a.clone().lerp(b, u).lerp(d.clone().lerp(c, u), v)), 'terracotta', { color: C_TERRA_D });
    for (let i = 0; i <= n; i++) { const e = a.clone().lerp(b, i / n), r = d.clone().lerp(c, i / n), L = e.distanceTo(r), g = new THREE.CylinderGeometry(0.065, 0.075, L, HD ? 10 : 4, HD ? 1 : 1, true, -Math.PI / 2, Math.PI); g.rotateX(-Math.PI / 2); g.translate(0, 0, -L / 2); g.applyMatrix4(new THREE.Matrix4().compose(e.add(V(0, 0.02, 0)), new THREE.Quaternion().setFromUnitVectors(V(0, 0, -1), r.clone().sub(e).normalize()), V(1, 1, 1))); P.add(g, 'terracotta', { color: k3(C_TERRA, rr(0.85, 1.1)), noise: 0.12 }); antefix(P, a.x + (b.x - a.x) * i / n, 5.38, 1.2); }
    P.add(xf(block(4.7, 0.12, 0.1, 0.01), [3.0, 5.3, 1.04]), 'planks', { color: C(0x9a8670) }); }
  // laundry over the parapet and potted herbs
  P.add(grid(10, 10, (u, v) => V(1.6 + u * 0.9, 4.17 - v * 0.75, 1.07 + 0.05 * Math.sin(u * 7) * v)), 'cloth', { color: C(0xe8e0cc), noise: 0.15 });
  P.add(grid(10, 10, (u, v) => V(3.8 + u * 0.7, 4.17 - v * 0.55, 1.07 + 0.04 * Math.sin(u * 8 + 1) * v)), 'cloth', { color: C(0x9b3a2a), noise: 0.15 });
  for (const x of [1.1, 2.9, 4.8]) { P.add(xf(lathe([[0, 0], [0.09, 0], [0.13, 0.2], [0.14, 0.22], [0.12, 0.22]], 24), [x, 3.49, 0.75]), 'terracotta', { color: C_TERRA }); for (let i = 0; i < Math.round(26 * Q.bits); i++) P.add(xf(new THREE.IcosahedronGeometry(rr(0.03, 0.06), 1), [x + rr(-0.12, 0.12), 3.75 + rr(0, 0.25), 0.75 + rr(-0.12, 0.12)]), 'plant', { color: C(pick([0x3f5a30, 0x56753f, 0x4a6a3a])) }); }
  windowHole(P, 1.2, 1.7, 4.3, 4.9); windowHole(P, 4.4, 4.9, 4.3, 4.9);
  P.add(xf(block(0.58, 1.58, 0.06, 0.006), [3.3, 3.61, -0.3]), 'planks', { color: C(0xc0b09c) }); P.add(quad(V(3.0, 3.6, -0.45), V(3.6, 3.6, -0.45), V(3.6, 5.2, -0.45), V(3.0, 5.2, -0.45)), 'dark', { color: C(0x14100c) });
}
{ const P = part('Thermopolium'); seed = 43; const W = 6, H = 4.6, D = 3.0, T = 0.45;    // tavern: L-shaped counter faced with marble scraps, dolia, shrine painting, awning
  facadeWall(P, 'f_thermo', W, H, [[1.0, 4.6, 0, 2.92]]); sideWalls(P, W, H); roof(P, W, H);
  shopRoom(P, 1.0, 4.6, 2.92, D, T, { hc: 3.1 }); P.add(xf(block(3.66, 0.06, 0.5, 0.01), [2.8, -0.04, -0.22]), 'lava', { color: C(0xe8e8e8) });
  // counter: masonry faced with marble fragments, a marble top pierced for four dolia
  const cz = -0.95, cd = 0.62, ch = 0.92;
  P.add(xf(block(2.7, ch - 0.05, cd, 0.02), [2.35, 0, cz]), 'counter', {});
  P.add(xf(block(cd, ch - 0.05, 1.5, 0.02), [3.7 - cd / 2 + 0.31, 0, cz - 0.75 - cd / 2 + 0.31]), 'counter', {});
  const top = new THREE.Shape(); top.moveTo(0.97, 0.61); top.lineTo(4.04, 0.61); top.lineTo(4.04, 2.48); top.lineTo(3.36, 2.48); top.lineTo(3.36, 1.29); top.lineTo(0.97, 1.29); top.closePath();
  const dolia = [[1.45, cz], [2.15, cz], [2.85, cz], [3.72, cz - 0.95]];
  for (const [x, z] of dolia) { const hp = new THREE.Path(); hp.absarc(x, -z, 0.17, 0, TAU, true); top.holes.push(hp); }
  { const g = new THREE.ExtrudeGeometry(top, { depth: 0.05, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 32 }); g.rotateX(-Math.PI / 2); g.translate(0, ch - 0.05, 0); P.add(g, 'marble', { color: C(0xf2ede4) }); }
  for (const [x, z] of dolia) { P.add(xf(new THREE.TorusGeometry(0.17, 0.025, 10, 32), [x, ch - 0.01, z], [Math.PI / 2, 0, 0]), 'terracotta', { color: C_TERRA }); P.add(xf(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 32, 1, true), [x, ch - 0.27, z]), 'terracotta', { color: C(0x4a2a1a) }); P.add(xf(new THREE.CircleGeometry(0.17, 24), [x, ch - 0.45, z], [-Math.PI / 2, 0, 0]), 'dark', { color: C(0x241812) }); }
  // stepped display shelf at the end of the counter with cups and jugs
  for (let s = 0; s < 3; s++) P.add(xf(block(cd, 0.13, 0.32 - s * 0.08, 0.01), [3.71, ch + s * 0.13, -2.25 + 0.04 * s]), 'counter', {});
  for (let s = 0; s < 3; s++) for (let i = 0; i < 3; i++) P.add(xf(lathe([[0, 0], [0.03, 0], [0.04, 0.05], [0.045, 0.08], [0.04, 0.08]], 16), [3.52 + i * 0.19, ch + (s + 1) * 0.13, -2.25 + 0.04 * s]), 'terracotta', { color: k3(pick([C(0xb4643c), C(0x8a3a2a), C(0xc9a070)]), rr(0.9, 1.1)) });
  // bronze cauldron on a brazier, a ladle
  P.add(xf(block(0.5, 0.75, 0.5, 0.02), [1.35, 0, -2.6]), 'brick', {}); P.add(xf(lathe([[0, 0], [0.18, 0.02], [0.24, 0.12], [0.25, 0.26], [0.22, 0.28], [0.21, 0.27]], 32), [1.35, 0.75, -2.6]), 'bronze', { color: C(0x8a6436) });
  rod(P, V(1.3, 0.95, -2.6), V(1.0, 1.25, -2.4), 0.008, 'bronze', { color: C(0x7a5a30) }, 6);
  // the lararium on the back wall: painted panel in a small aedicula, an altar shelf
  const zb = -T - D + 0.01;
  P.add(grid(1, 1, (u, v) => V(2.1 + u * 1.4, 1.15 + v * 1.4, zb + 0.005), false, (u, v) => [u, v]), 'lararium', { keepUV: true, color: C(0xc0c0c0) });
  P.add(xf(block(1.6, 0.06, 0.18, 0.01), [2.8, 1.09, zb + 0.09]), 'plaster', { color: C(0xc8b89c) });
  for (const x of [2.06, 3.54]) P.add(xf(block(0.08, 1.45, 0.08, 0.01), [x, 1.12, zb + 0.06]), 'plaster', { color: C(0xc8b89c) });
  { const s = new THREE.Shape(); s.moveTo(-0.85, 0); s.lineTo(0.85, 0); s.lineTo(0, 0.32); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false }); P.add(xf(g, [2.8, 2.58, zb]), 'plaster', { color: C(0xb8a88c) }); }
  // shelves of jugs, an amphora rack
  for (const y of [1.65, 2.15]) { P.add(xf(block(0.7, 0.04, 0.3, 0.005), [1.42, y, zb + 0.15]), 'planks', { color: C(0x9a8a78) }); for (let i = 0; i < 3; i++) P.add(xf(jugGeo(rr(0.2, 0.28)), [1.2 + i * 0.22, y + 0.02, zb + 0.15]), 'terracotta', { color: k3(C(0xb06a44), rr(0.6, 0.8)) }); }
  for (let i = 0; i < 4; i++) amphora(P, [3.85 + (i % 2) * 0.3, 0.02, zb + 0.35 + Math.floor(i / 2) * 0.35], [0.12, rr(0, 3), 0], 0.95, 0, k3(C(0xb06a44), 0.7));
  // tiled awning on timber beams and posts over the pavement
  { const a = V(0.75, 3.02, 1.02), b = V(4.85, 3.02, 1.02), c = V(4.85, 3.4, 0.0), d = V(0.75, 3.4, 0.0), n = 11;
    for (let x = 0.85; x <= 4.8; x += 0.65) P.add(xf(block(0.09, 0.12, 1.1, 0.01), [x, 3.0 + 0.1, 0.5], [0.36, 0, 0]), 'planks', { color: C(0x9a8670) });
    P.add(grid(n, 3, (u, v) => a.clone().lerp(b, u).lerp(d.clone().lerp(c, u), v).add(V(0, 0.08, 0))), 'terracotta', { color: C_TERRA_D });
    for (let i = 0; i <= n; i++) { const e = a.clone().lerp(b, i / n).add(V(0, 0.08, 0)), r = d.clone().lerp(c, i / n).add(V(0, 0.08, 0)), L = e.distanceTo(r), g = new THREE.CylinderGeometry(0.065, 0.075, L, HD ? 10 : 4, HD ? 1 : 1, true, -Math.PI / 2, Math.PI); g.rotateX(-Math.PI / 2); g.translate(0, 0, -L / 2); g.applyMatrix4(new THREE.Matrix4().compose(e.add(V(0, 0.02, 0)), new THREE.Quaternion().setFromUnitVectors(V(0, 0, -1), r.clone().sub(e).normalize()), V(1, 1, 1))); P.add(g, 'terracotta', { color: k3(C_TERRA, rr(0.85, 1.1)), noise: 0.12 }); antefix(P, e.x, 3.05, 1.05); }
    for (const x of [0.8, 4.8]) P.add(xf(block(0.12, 3.1, 0.12, 0.01), [x, 0, 0.95]), 'planks', { color: C(0xa08c76) });
    P.add(xf(block(4.2, 0.14, 0.12, 0.01), [2.8, 2.98, 0.98]), 'planks', { color: C(0x9a8670) }); }
}
{ const P = part('Bakery'); seed = 44; const W = 6, H = 4.8, D = 5.2, T = 0.45;          // the bakery of Modestus: lava mills, bread oven, the day's loaves
  facadeWall(P, 'f_bakery', W, H, [[1.2, 4.8, 0, 3.02]]); sideWalls(P, W, H, 5.8); roof(P, W, H, { back: 5.8 });
  shopRoom(P, 1.2, 4.8, 3.02, D, T, { hc: 3.3, floor: 'basalt' }); P.add(xf(block(3.66, 0.06, 0.5, 0.01), [3.0, -0.04, -0.22]), 'lava', { color: C(0xe8e8e8) });
  // donkey mills: masonry base with a flour channel, the cone (meta) and the hourglass (catillus) with its wooden yoke
  for (const [x, z] of [[2.05, -2.5], [3.95, -2.7]]) {
    P.add(lathe([[0, 0], [0.78, 0], [0.8, 0.32], [0.74, 0.34], [0.62, 0.34], [0.6, 0.26], [0.5, 0.26], [0.48, 0.34], [0, 0.34]], 72).translate(x, 0, z), 'tuff', { color: C(0xe8e0d4) });
    P.add(lathe([[0, 0.34], [0.46, 0.34], [0.44, 0.4], [0.3, 0.75], [0.12, 1.02], [0, 1.08]], 64).translate(x, 0, z), 'lava', { colorFn: p => k3(C(0xffffff), 0.8 + 0.25 * smooth((p.y - 0.4) / 0.6)) });
    P.add(lathe([[0.5, 0.52], [0.5, 0.56], [0.42, 0.82], [0.3, 0.98], [0.42, 1.14], [0.52, 1.42], [0.52, 1.46], [0.46, 1.46], [0.24, 1.0], [0.28, 0.95], [0.4, 0.56], [0.46, 0.52]], 72).translate(x, 0, z), 'lava', {});
    for (const s of [-1, 1]) P.add(xf(block(0.2, 0.22, 0.24, 0.02), [x + s * 0.5, 0.92, z]), 'lava', {});
    P.add(xf(block(1.9, 0.14, 0.12, 0.01), [x, 0.95, z]), 'planks', { color: C(0x9a8670) });
    for (const s of [-1, 1]) rod(P, V(x + s * 0.95, 1.02, z), V(x + s * 0.95, 1.02, z + s * 0.8), 0.04, 'planks', { color: C(0x9a8670) });
  }
  // the oven: brick dome over a rectangular base, an arched mouth, a flue
  { const ox = 3.0, oz = -T - D + 1.15;
    P.add(xf(block(2.4, 1.15, 1.9, 0.02), [ox, 0, oz]), 'brick', {});
    P.add(xf(ell(1.0, 0.75, 0.85, 40, 20), [ox, 1.15, oz]), 'brick', { colorFn: p => k3(C(0xffffff), 0.85 + 0.15 * smooth((p.y - 1.2) / 0.6)) });
    const arch = new THREE.Shape(); arch.moveTo(-0.32, 0); arch.lineTo(0.32, 0); arch.lineTo(0.32, 0.32); arch.absarc(0, 0.32, 0.32, 0, Math.PI, false); arch.closePath();
    P.add(xf(new THREE.ShapeGeometry(arch, 16), [ox, 0.72, oz + 0.955]), 'dark', { color: C(0x0c0806) });
    P.add(xf(new THREE.ShapeGeometry(arch, 16), [ox, 0.72, oz + 0.956], [0, 0, 0], [0.82, 0.6, 1]), 'dark', { colorFn: () => C(0x5a1e08) });     // embers glow in the back
    P.add(xf(block(1.0, 0.08, 0.6, 0.01), [ox, 0.64, oz + 1.2]), 'tuff', { color: C(0xe8e0d4) });
    P.add(xf(block(0.36, 1.8, 0.36, 0.02), [ox + 0.7, 1.7, oz - 0.5]), 'brick', {}); }
  // loaves on the front counter and in baskets; a kneading table, sacks of grain
  P.add(xf(block(1.6, 0.95, 0.55, 0.02), [2.1, 0, -0.85]), 'planks', { color: C(0xc8b8a4) });
  const loafGeo = (() => { const g = new THREE.SphereGeometry(0.1, HD ? 40 : 12, HD ? 14 : 4, 0, TAU, 0, Math.PI / 2), pa = g.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), a = Math.atan2(z, x), groove = Math.exp(-Math.pow(Math.sin(a * 4), 2) / 0.012) * smooth(Math.hypot(x, z) / 0.03); const k = 1 - 0.18 * groove * (y / 0.1); pa.setXYZ(i, x * (1 - 0.06 * groove), y * 0.48 * k, z * (1 - 0.06 * groove)); } g.computeVertexNormals(); return g; })();
  const putLoaf = (x, y, z, r = 0) => { const g = loafGeo.clone(); xf(g, [x, y, z], [r, rr(0, 3), 0]); P.add(g, 'bread', { colorFn: (p, n) => k3(C(0xa8682e), 0.75 + 0.35 * Math.max(0, n.y)), noise: 0.12, freq: 30 }); };
  for (let i = 0; i < 12; i++) putLoaf(1.45 + (i % 6) * 0.25, 0.95 + Math.floor(i / 6) * 0.06, -0.78 - Math.floor(i / 6) * 0.2);
  for (const [bx, bz] of [[4.3, -0.9], [4.3, -1.5]]) { P.add(xf(lathe([[0, 0], [0.24, 0], [0.32, 0.22], [0.3, 0.24]], 24), [bx, 0, bz]), 'wood', { color: C(0xb08a50), noise: 0.2, freq: 30 }); for (let i = 0; i < 4; i++) putLoaf(bx + rr(-0.12, 0.12), 0.2 + i * 0.03, bz + rr(-0.12, 0.12), rr(-0.3, 0.3)); }
  P.add(xf(block(1.3, 0.85, 0.6, 0.02), [1.85, 0, -4.4]), 'planks', { color: C(0xb8a894) });
  for (let i = 0; i < 4; i++) P.add(xf(ell(0.22, 0.32, 0.18, 18, 12), [4.4 + (i % 2) * 0.3, 0.3, -3.9 - Math.floor(i / 2) * 0.4]), 'cloth', { color: C(0xc9b48c), noise: 0.2, freq: 8 });
}
{ const P = part('Fullonica'); seed = 45; const W = 6, H = 4.8, D = 4.2, T = 0.45;      // the fullery of Stephanus: rinsing vats, treading stalls, the cloth press, drying lines
  facadeWall(P, 'f_fullery', W, H, [[1.6, 4.4, 0, 2.92]]); sideWalls(P, W, H, 4.8); roof(P, W, H, { back: 4.8 });
  shopRoom(P, 1.0, 5.0, 2.92, D, T, { hc: 3.2 }); P.add(xf(block(2.86, 0.06, 0.5, 0.01), [3.0, -0.04, -0.22]), 'lava', { color: C(0xe8e8e8) });
  const zb = -T - D;
  // three rinsing vats along the back wall
  for (let i = 0; i < 3; i++) { const x = 1.8 + i * 1.2;
    for (const [w, d, dx, dz] of [[1.1, 0.1, 0, 0.4], [1.1, 0.1, 0, -0.4], [0.1, 0.9, 0.5, 0], [0.1, 0.9, -0.5, 0]]) P.add(xf(block(w, 0.85, d, 0.02), [x + dx, 0, zb + 0.55 + dz]), 'plaster', { color: C(0xc8b8a0) });
    P.add(xf(new THREE.PlaneGeometry(0.9, 0.7), [x, 0.68, zb + 0.55], [-Math.PI / 2, 0, 0]), 'water', { color: C(0xb0b8a0) }); }
  // treading stalls (saltus fullonicus) along the left wall, each with its low parapets
  for (let i = 0; i < 3; i++) { const z = -T - 0.9 - i * 0.75;
    for (const [w, d, dx, dz] of [[0.7, 0.08, 0, 0.34], [0.08, 0.7, 0.33, 0], [0.7, 0.08, 0, -0.34]]) P.add(xf(block(w, 0.55, d, 0.01), [1.45 + dx, 0, z + dz]), 'plaster', { color: C(0xc8b8a0) });
    P.add(xf(new THREE.PlaneGeometry(0.6, 0.6), [1.42, 0.38, z], [-Math.PI / 2, 0, 0]), 'water', { color: C(0xc0c4a8) }); }
  // the screw press (pressorium) for the finished cloth
  { const x = 4.35, z = -1.4;
    for (const s of [-1, 1]) P.add(xf(block(0.14, 2.1, 0.16, 0.01), [x + s * 0.42, 0, z]), 'planks', { color: C(0xb8a490) });
    P.add(xf(block(1.1, 0.2, 0.22, 0.01), [x, 2.0, z]), 'planks', { color: C(0xa8947e) }); P.add(xf(block(1.0, 0.16, 0.6, 0.01), [x, 0.35, z]), 'planks', { color: C(0xa8947e) });
    for (let i = 0; i < 6; i++) P.add(xf(block(0.78, 0.035, 0.5, 0.005), [x, 0.51 + i * 0.035, z]), 'cloth', { color: C(pick([0xe8e0cc, 0xd9c08a, 0x9b3a2a, 0xe8e0cc])) });
    P.add(xf(block(0.8, 0.08, 0.52, 0.01), [x, 0.72, z]), 'planks', { color: C(0xb8a490) });
    const helix = []; for (let t = 0; t <= 1; t += 0.01) helix.push(V(x + Math.cos(t * TAU * 9) * 0.075, 0.8 + t * 1.2, z + Math.sin(t * TAU * 9) * 0.075));
    P.add(new THREE.CylinderGeometry(0.06, 0.06, 1.25, 16).translate(x, 1.4, z), 'wood', { color: C(0x7a5a3a) }); P.add(tube(helix, 0.02, 6, 400), 'wood', { color: C(0x8a6a48) });
    rod(P, V(x - 0.5, 1.35, z), V(x + 0.5, 1.35, z), 0.03, 'wood', { color: C(0x6a4a2e) }); }
  // drying lines with cloths, and two pots by the door for collecting urine for the fulling
  for (const [z, cols] of [[-1.0, [0xe8e0cc, 0x9b3a2a, 0xe8e0cc]], [-2.2, [0xd9c08a, 0xe8e0cc, 0x5a2e4a, 0xe8e0cc]]]) {
    rod(P, V(1.05, 2.55, z), V(4.95, 2.55, z), 0.008, 'cloth', { color: C(0x8a7a60) }, 5);
    cols.forEach((c, i) => P.add(grid(8, 10, (u, v) => V(1.5 + i * 0.95 + u * 0.8, 2.55 - v * rr(0.9, 1.3), z + Math.sin(u * 5 + i) * 0.04 * v)), 'cloth', { color: C(c), noise: 0.12 }));
  }
  amphora(P, [1.3, 0.35, 0.55], [0.1, 0.5, 0], 0.7, 1); amphora(P, [4.75, 0.35, 0.6], [-0.1, 2, 0], 0.7, 1);
}
// stuccoed street column: Attic base, fluted shaft painted red on the lower third (stucco texture, u round, v up), Tuscan capital
function streetColumn(P, x, z, h = 3.2, r = 0.21) {
  const y0 = 0.16, yc = h - 0.26, flutes = 20, low = y0 + (yc - y0) * 0.33;
  P.add(grid(HD ? 96 : 16, HD ? 40 : 3, (u, v) => { const a = u * TAU, y = y0 + v * (yc - y0), rad = r * (1.04 - 0.14 * Math.pow(v, 1.5)), f = HD && y > low ? r * 0.06 * Math.pow(Math.abs(Math.cos(a * flutes / 2)), 0.5) * smooth((y - low) / 0.06) : 0;
    return V(x + Math.sin(a) * (rad - f), y, z + Math.cos(a) * (rad - f)); }, true, (u, v) => [u * 2, v]), 'stucco', { keepUV: true, color: C(0xffffff) });
  P.add(lathe([[r * 1.45, 0], [r * 1.45, 0.06], [r * 1.38, 0.08], [r * 1.36, 0.11], [r * 1.22, 0.13], [r * 1.12, 0.14], [r * 1.18, 0.15], [r * 1.08, 0.16], [0, 0.16]], 48).translate(x, 0, z), 'plaster', { color: C(0xf0e9da) });
  P.add(lathe([[r * 0.9, 0], [r * 0.95, 0.03], [r * 1.12, 0.08], [r * 1.35, 0.14], [r * 1.4, 0.16], [0, 0.16]], 48).translate(x, yc, z), 'plaster', { color: C(0xf0e9da) });
  P.add(xf(block(r * 3.1, 0.12, r * 3.1, 0.012), [x, yc + 0.15, z]), 'plaster', { color: C(0xf0e9da) });
}
{ const P = part('Column'); streetColumn(P, 0, 0); }
{ const P = part('Colonnade'); seed = 46; const W = 12, H = 4.2, H2 = 6.2;          // street portico: five columns in front of a painted wall with a street shrine
  facadeWall(P, 'f_colonnade', W, H, [[5.3, 6.7, 0, 2.62]], { cornice: false });
  // upper storey of the building behind, above the portico roof
  P.add(holedGrid(W, H2 - H, [[1.5, 2.1, 0.5, 1.15], [5.7, 6.3, 0.5, 1.15], [9.9, 10.5, 0.5, 1.15]], 0.25, (x, y) => V(x, H + y, 0), (x, y) => [x, y]), 'plaster', { colorFn: p => k3(p.y > H2 - 0.45 && p.y < H2 - 0.3 ? C(0x8f2318) : C(0xe0d4ba), 0.8 + 0.2 * fbm(p.x, p.y, 2)), noise: 0.08 });
  for (const xa of [1.5, 5.7, 9.9]) windowHole(P, xa, xa + 0.6, H + 0.5, H + 1.15, 0.3);
  for (const x of [0, W]) P.add(quad(V(x, 0, 0), V(x, 0, -0.45), V(x, H2, -0.45), V(x, H2, 0)), 'plaster', { color: C_PLD });
  sideWalls(P, W, H2); roof(P, W, H2, { out: 0.4 });
  tuffDoorway(P, 5.3, 6.7, 2.62, { pw: 0.24 }); door(P, 5.3, 6.7, 2.62, 0.32);
  for (let i = 0; i < 5; i++) streetColumn(P, 0.9 + i * 2.55, 1.15);
  // architrave, ceiling joists, lean-to roof
  P.add(xf(block(W + 0.2, 0.36, 0.44, 0.02, 2), [W / 2, 3.2, 1.15]), 'plaster', { colorFn: p => p.y > 3.47 ? C(0xf0e9da) : C(0xe6dcc6) });
  moulding(P, [[0.22, 3.56], [0.28, 3.6], [0.3, 3.66], [0.0, 3.66]].map(([zz, y]) => [1.15 + zz, y]), -0.1, W + 0.1, 'plaster', { color: C(0xf0e9da) });
  for (let x = 0.3; x < W; x += 0.6) P.add(xf(block(0.1, 0.14, 1.4, 0.01), [x, 3.42, 0.62]), 'planks', { color: C(0x9a8670) });
  P.add(grid(12, 2, (u, v) => V(u * W, 3.56, v * 1.37)), 'planks', { color: C(0x7a6a58) });
  { const a = V(-0.1, 3.68, 1.5), b = V(W + 0.1, 3.68, 1.5), c = V(W + 0.1, 4.25, 0.0), d = V(-0.1, 4.25, 0.0), n = 30;
    P.add(grid(n, 3, (u, v) => a.clone().lerp(b, u).lerp(d.clone().lerp(c, u), v)), 'terracotta', { color: C_TERRA_D });
    for (let i = 0; i <= n; i++) { const e = a.clone().lerp(b, i / n), r = d.clone().lerp(c, i / n), L = e.distanceTo(r), g = new THREE.CylinderGeometry(0.065, 0.075, L, HD ? 10 : 4, HD ? 3 : 1, true, -Math.PI / 2, Math.PI); g.rotateX(-Math.PI / 2); g.translate(0, 0, -L / 2); g.applyMatrix4(new THREE.Matrix4().compose(e.add(V(0, 0.02, 0)), new THREE.Quaternion().setFromUnitVectors(V(0, 0, -1), r.clone().sub(e).normalize()), V(1, 1, 1))); P.add(g, 'terracotta', { color: k3(C_TERRA, rr(0.85, 1.1)), noise: 0.12 }); antefix(P, e.x, 3.64, 1.48); } }
  // a bench and a pot plant under the portico
  P.add(xf(block(1.8, 0.45, 0.4, 0.02), [9.5, 0, 0.3]), 'tuff', { color: C(0xf0e8dc) });
}
// portico floor under the colonnade (it stands back from the pavement line)
parts.Colonnade.add(grid(24, 3, (u, v) => V(u * 12, 0.0, v * 1.55), false, (u, v, q) => [q.x / 1.2, q.z / 1.2]), 'signinum', { keepUV: true, color: C(0xe8e0d8) });

// ---------------- FOUNTAIN: lava slabs clamped with iron, a pillar with a carved head spouting water
const fountainHead = await (async () => {
  const S = new Sculpture(); head(S, [0, 0, 0], sframe(0, 0, 0), { curls: 160, wreath: true });
  return sculptMesh(S, { h: Q.headH, target: Q.head, palette: (tag, p, n, ao) => { const lich = Math.max(0, vnoise(p[0] * 40, p[1] * 40, p[2] * 40) - 0.62) * 1.5; const base = tag === 'wreath' ? [0.72, 0.7, 0.62] : [0.86, 0.82, 0.74]; return base.map((c, i) => (c * (1 - lich) + [0.5, 0.56, 0.4][i] * lich) * (0.45 + 0.55 * ao)); }, log: () => {} });
})();
lap('fountain head');
{ const P = part('Fountain'); seed = 47; const L = 1.5, Wd = 1.0, Hh = 0.75, T = 0.14;
  const slab = (w, h, d, x, z) => P.add(xf(block(w, h, d, 0.03, 2), [x, 0, z]), 'lava', { colorFn: p => k3(C(0xffffff), 0.8 + 0.25 * smooth(p.y / Hh)) });
  slab(L, Hh, T, 0, Wd / 2 - T / 2); slab(L, Hh, T, 0, -Wd / 2 + T / 2); slab(T, Hh, Wd - 2 * T, L / 2 - T / 2, 0); slab(T, Hh, Wd - 2 * T, -L / 2 + T / 2, 0);
  // the rim worn smooth where people leaned to drink, iron cramps across the joints
  P.add(xf(ell(0.22, 0.05, 0.1, 20, 8), [0.15, Hh, Wd / 2 - T / 2]), 'lava', { color: C(0xf8f8f8) });
  for (const [x, z, r] of [[L / 2 - T / 2, Wd / 2 - T / 2, 0], [-L / 2 + T / 2, Wd / 2 - T / 2, 0], [L / 2 - T / 2, -Wd / 2 + T / 2, 0], [-L / 2 + T / 2, -Wd / 2 + T / 2, 0]]) P.add(xf(new THREE.BoxGeometry(0.2, 0.02, 0.05), [x, Hh + 0.005, z], [0, Math.PI / 4, 0]), 'iron', { color: C(0x5a4a40) });
  P.add(xf(new THREE.PlaneGeometry(L - 2 * T, Wd - 2 * T, 8, 6), [0, Hh - 0.1, 0], [-Math.PI / 2, 0, 0]), 'water', { color: C(0x9ab0b4) });
  P.add(xf(new THREE.PlaneGeometry(L - 2 * T, Wd - 2 * T), [0, 0.06, 0], [-Math.PI / 2, 0, 0]), 'lava', { color: C(0x8a8a80) });
  // pillar
  P.add(xf(block(0.42, 1.38, 0.32, 0.03, 2), [0, 0, -Wd / 2 - 0.12]), 'lava', { colorFn: p => k3(C(0xffffff), 0.82 + 0.2 * smooth(p.y / 1.2)) });
  P.add(xf(block(0.5, 0.08, 0.38, 0.015), [0, 1.38, -Wd / 2 - 0.12]), 'lava', {});
  // overflow channel cut in the front slab and a puddle on the pavement
  P.add(xf(new THREE.BoxGeometry(0.1, 0.05, T + 0.02), [-0.45, Hh - 0.02, Wd / 2 - T / 2]), 'dark', { color: C(0x2a2622) });
  P.add(xf(new THREE.CircleGeometry(0.35, 24), [-0.45, 0.004, Wd / 2 + 0.25], [-Math.PI / 2, 0, 0], [1.4, 0.8, 1]), 'water', { color: C(0x8a9a9c) });
  // falling stream from the mouth into the basin
  const mouth = V(0, 1.0 - 0.068 * 1.35, -Wd / 2 + 0.06 + 0.11 * 1.35), pts = []; for (let t = 0; t <= 1; t += 0.1) pts.push(mouth.clone().add(V(0, -t * t * (mouth.y - Hh + 0.1), 0.05 + t * 0.22)));
  P.add(tube(pts, 0.012, 10, 30), 'water', { color: C(0xc8dce0) });
  rod(P, mouth.clone().add(V(0, 0, -0.06)), mouth.clone().add(V(0, -0.005, 0.06)), 0.014, 'bronze', { color: C(0x6a7a5a) }, 10);
}
// the sculpted head is kept as its own mesh (shared geometry), placed on the pillar
const headMat = new THREE.MeshStandardMaterial({ name: 'sculpture', color: 0xffffff, vertexColors: true, roughness: 0.8 });

// ---------------- PROPS AND OBSTACLES
{ const P = part('Amphora'); seed = 48; amphora(P, [0, 0, 0], [0, 0, 0], 1, 0); }
{ const P = part('Amphora_Stack'); seed = 49;                       // lane blocker: crate of wine amphorae, two lying on top, straw packing
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) amphora(P, [-0.38 + i * 0.38, 0.04, -0.2 + j * 0.4], [rr(-0.05, 0.05), rr(0, 3), rr(-0.05, 0.05)], 1.0, i % 2);
  amphora(P, [-0.45, 1.05, 0.0], [0, 0.1, -1.45], 1.0, 0); amphora(P, [0.5, 1.12, 0.05], [0, -0.2, 1.5], 0.95, 1);
  for (const [x, z] of [[-0.62, -0.42], [0.62, -0.42], [-0.62, 0.42], [0.62, 0.42]]) P.add(xf(block(0.08, 0.82, 0.08, 0.008), [x, 0, z]), 'planks', { color: C(0xa8947e) });
  for (const y of [0.1, 0.72]) { for (const z of [-0.42, 0.42]) P.add(xf(block(1.32, 0.08, 0.05, 0.006), [0, y, z]), 'planks', { color: C(0xc0ac96) }); for (const x of [-0.62, 0.62]) P.add(xf(block(0.05, 0.08, 0.92, 0.006), [x, y, 0]), 'planks', { color: C(0xc0ac96) }); }
  P.add(xf(block(1.3, 0.04, 0.9, 0.005), [0, 0, 0]), 'planks', { color: C(0x9a8670) });
  for (let i = 0; i < Math.round(260 * Q.bits); i++) { const a = rr(0, TAU), x = rr(-0.55, 0.55), z = rr(-0.35, 0.35); rod(P, V(x, rr(0.05, 0.25), z), V(x + Math.cos(a) * 0.12, rr(0.05, 0.3), z + Math.sin(a) * 0.12), 0.004, 'plant', { color: C(pick([0xc9b06a, 0xb89a50, 0xd9c080])) }, 3); }
}
function wheel(P, x, r = 0.62) {
  const ry = [0, Math.PI / 2, 0];
  P.add(xf(new THREE.TorusGeometry(r - 0.03, 0.045, HD ? 10 : 5, HD ? 72 : 24), [x, r, 0], ry, [1, 1, 1.5]), 'planks', { color: C(0xa08c76) });                 // felloes
  P.add(xf(new THREE.TorusGeometry(r, 0.018, HD ? 8 : 4, HD ? 72 : 24), [x, r, 0], ry, [1, 1, 3.4]), 'iron', { color: C(0x4a4440) });                         // iron tyre
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; rod(P, V(x, r, 0), V(x, r + Math.cos(a) * (r - 0.06), Math.sin(a) * (r - 0.06)), 0.026, 'wood', { color: C(0x7a5a3a), taper: 0.7 }, 8); }
  P.add(lathe([[0.05, -0.16], [0.09, -0.15], [0.12, -0.08], [0.12, 0.08], [0.09, 0.15], [0.05, 0.16]], 24).rotateZ(Math.PI / 2).translate(x, r, 0), 'wood', { color: C(0x6a4a2e) });
  for (const s of [-1, 1]) P.add(xf(new THREE.TorusGeometry(0.1, 0.012, 6, 24), [x + s * 0.1, r, 0], ry), 'iron', { color: C(0x4a4440) });
}
{ const P = part('Cart'); seed = 50;                                // lane blocker: abandoned two-wheeled cart tipped onto its shafts, wine and grain spilling
  wheel(P, 0.74); wheel(P, -0.74);
  rod(P, V(-0.95, 0.62, 0), V(0.95, 0.62, 0), 0.05, 'wood', { color: C(0x5a3e26) }, 12);
  const bed = new Part('tmp'), tilt = 0.2;
  bed.add(xf(block(1.3, 0.06, 2.2, 0.008), [0, 0, 0]), 'planks', { color: C(0xc8b8a4) });
  for (const x of [-0.63, 0.63]) bed.add(xf(block(0.05, 0.42, 2.2, 0.008), [x, 0.03, 0]), 'planks', { color: C(0xd0c0ac) });
  bed.add(xf(block(1.3, 0.42, 0.05, 0.008), [0, 0.03, -1.08]), 'planks', { color: C(0xd0c0ac) });
  for (const x of [-0.42, 0.42]) bed.add(xf(block(0.09, 0.09, 1.7, 0.008), [x, -0.06, 1.85]), 'planks', { color: C(0xa08c76) });
  bed.add(xf(block(1.0, 0.07, 0.07, 0.006), [0, -0.06, 2.6]), 'planks', { color: C(0xa08c76) });
  for (let i = 0; i < 4; i++) amphora(bed, [-0.34 + (i % 2) * 0.68, 0.04, -0.55 + Math.floor(i / 2) * 0.6], [rr(-0.1, 0.1), i, rr(-0.1, 0.1)], 0.75, 1);
  bed.add(xf(ell(0.3, 0.16, 0.24, 20, 12), [0.1, 0.16, 0.6]), 'cloth', { color: C(0xc9b48c), noise: 0.2, freq: 8 });
  for (const b of Object.keys(bed.buf)) {} // (merged below)
  // bake the tilted bed into the cart
  const M = new THREE.Matrix4().compose(V(0, 0.72, 0.1), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0)), V(1, 1, 1));
  for (const [mat, B] of Object.entries(bed.buf)) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3)); if (B.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3)); g.setIndex(B.idx); g.applyMatrix4(M);
    const T2 = P.buf[mat] ??= { pos: [], nor: [], col: [], uv: [], idx: [] }, base = T2.pos.length / 3; T2.pos.push(...g.attributes.position.array); T2.nor.push(...g.attributes.normal.array); T2.col.push(...B.col); if (B.uv.length) T2.uv.push(...B.uv); T2.idx.push(...B.idx.map(i => i + base)); }
  // spilled grain on the road
  for (let i = 0; i < Math.round(300 * Q.bits); i++) P.add(xf(new THREE.IcosahedronGeometry(0.008, 0), [rr(-0.5, 0.6), 0.005, rr(1.2, 2.2)]), 'plant', { color: C(0xd9b870) });
}
{ const P = part('Awning_Beam'); seed = 51;                         // slide obstacle: shop awning collapsed across the lane at chest height
  P.add(xf(block(2.6, 0.24, 0.22, 0.012, 2), [0, 1.08, 0], [0, 0, 0.05]), 'planks', { color: C(0xa8947e) });
  for (const x of [-1.15, 1.15]) P.add(xf(block(0.13, 1.12, 0.13, 0.01), [x, 0, 0], [0, 0, x * 0.03]), 'planks', { color: C(0x9a8670) });
  const stripe = p => (Math.floor((p.x + 2) / 0.32) % 2 ? C(0x9b2a22) : C(0xe0d4b8));
  P.add(grid(40, 24, (u, v) => V(lerp(-1.25, 1.25, u), 1.3 - v * 0.75 - 0.1 * Math.sin(u * Math.PI) * v, 0.06 + 0.07 * Math.sin(u * 11 + v * 4) * v + v * 0.1), false), 'cloth', { colorFn: stripe, noise: 0.14 });
  for (let i = 0; i < 9; i++) { const x = rr(-1.2, 1.2), L = rr(0.15, 0.5); P.add(grid(4, 6, (u, v) => V(x + u * 0.12, 0.55 - v * L, 0.16 + 0.04 * Math.sin(v * 6))), 'cloth', { colorFn: stripe }); }      // torn strips
  rod(P, V(-1.15, 1.2, 0.05), V(-0.6, 0.0, 0.5), 0.012, 'cloth', { color: C(0x8a7a60) }, 5);
}
{ const P = part('Awning_Street'); seed = 57;                       // slide obstacle: a shop awning torn down right across the street, its beam at head height
  const W = 2.35, top = 1.85;                                       // posts at the road's edges, clear of the lanes
  P.add(xf(block(2 * W + 0.3, 0.24, 0.22, 0.012, 2), [0, top - 0.24, 0], [0, 0, 0.015]), 'planks', { color: C(0xa8947e) });
  for (const x of [-W, W]) P.add(xf(block(0.13, top - 0.2, 0.13, 0.01), [x, 0, 0], [0, 0, x * 0.008]), 'planks', { color: C(0x9a8670) });
  const stripe = p => (Math.floor((p.x + 4) / 0.32) % 2 ? C(0x9b2a22) : C(0xe0d4b8));
  // the cloth, one strip of grid per painted stripe so the colours meet in sharp edges
  const clothAt = (x, v) => V(x, top - 0.05 - v * 0.55 - 0.08 * Math.sin((x + W) / (2 * W) * Math.PI) * v, 0.06 + 0.06 * Math.sin(x * 3.4 + v * 4) * v + v * 0.08);
  for (let x0 = -W - 0.1, k = 0; x0 < W + 0.1 - 1e-6; x0 += 0.32, k++) { const x1 = Math.min(W + 0.1, x0 + 0.32), col = k % 2 ? C(0x9b2a22) : C(0xe0d4b8);
    P.add(grid(HD ? 4 : 1, HD ? 12 : 4, (u, v) => clothAt(lerp(x0, x1, u), v)), 'cloth', { colorFn: () => col, noise: 0.14 }); }
  for (let i = 0; i < 14; i++) { const x = rr(-W, W), L = rr(0.12, 0.35); P.add(grid(2, 4, (u, v) => V(x + u * 0.12, top - 0.62 - v * L, 0.15 + 0.04 * Math.sin(v * 6))), 'cloth', { colorFn: stripe }); }   // torn strips, all above a sliding runner
}
{ const P = part('Column_Fallen'); seed = 52;                       // jump obstacle: a portico column broken into drums lying across the lane
  const r = 0.21, flutes = 20;
  for (let i = 0; i < 3; i++) {
    const y0 = 0.16 + i * 0.95, y1 = y0 + 0.9, low = 0.16 + 2.78 * 0.33;
    const g = grid(72, 10, (u, v) => { const a = u * TAU, y = lerp(y0, y1, v), f = y > low ? r * 0.06 * Math.pow(Math.abs(Math.cos(a * flutes / 2)), 0.5) : 0, br = 1 + (v < 0.06 || v > 0.94 ? (vnoise(a * 3, i, v) - 0.5) * 0.12 : 0); return V(Math.sin(a) * (r - f) * br, y - y0, Math.cos(a) * (r - f) * br); }, true, (u, v) => [u * 2, (lerp(y0, y1, v)) / 3.2]);
    xf(g, [-0.95 + i * 0.93, 0.21, (i - 1) * 0.08], [0.15 * i, 0, -Math.PI / 2 + (i - 1) * 0.07]);
    P.add(g, 'stucco', { keepUV: true, color: C(0xf0f0f0) });
    for (const e of [0, 0.9]) { const cap = new THREE.CircleGeometry(r, 36); cap.rotateX(e ? -Math.PI / 2 : Math.PI / 2); cap.translate(0, e, 0); const pa = cap.attributes.position; for (let k = 0; k < pa.count; k++) pa.setY(k, pa.getY(k) + (vnoise(pa.getX(k) * 20, pa.getZ(k) * 20, i + e) - 0.5) * 0.05); cap.computeVertexNormals(); xf(cap, [-0.95 + i * 0.93, 0.21, (i - 1) * 0.08], [0.15 * i, 0, -Math.PI / 2 + (i - 1) * 0.07]); P.add(cap, 'brick', {}); }
  }
  // the capital, knocked off and tilted
  P.add(xf(lathe([[r * 0.9, 0], [r * 0.95, 0.03], [r * 1.12, 0.08], [r * 1.35, 0.14], [r * 1.4, 0.16], [0, 0.16]], 40), [1.35, 0.32, -0.15], [0.4, 0.5, 1.2]), 'plaster', { color: C(0xf0e9da) });
  P.add(xf(block(r * 3.1, 0.12, r * 3.1, 0.012), [1.45, 0.12, -0.2], [0.3, 0.5, 0.25]), 'plaster', { color: C(0xf0e9da) });
  for (let i = 0; i < Math.round(30 * Q.bits); i++) P.add(xf(new THREE.IcosahedronGeometry(rr(0.015, 0.05), 0), [rr(-1.4, 1.6), 0.02, rr(-0.5, 0.5)], [rnd(), rnd(), rnd()]), 'plaster', { color: pick([C(0xf0e9da), C(0x9b2318), C(0xc8b89c)]) });
}
{ const P = part('Rubble'); seed = 53;                              // low jump obstacle: fallen masonry, painted plaster, roof tiles, pumice
  const rock = (s, mat, color = C(0xffffff)) => { const g0 = new THREE.IcosahedronGeometry(1, HD ? 3 : 1); const g = mergeVertices(g0.deleteAttribute('normal').deleteAttribute('uv')), pa = g.attributes.position, o = rr(0, 50); for (let i = 0; i < pa.count; i++) { const v = V(pa.getX(i), pa.getY(i), pa.getZ(i)), k = 0.75 + 0.5 * vnoise(v.x * 1.6 + o, v.y * 1.6, v.z * 1.6) + 0.12 * Math.sign(Math.sin(v.x * 3 + o)) * 0.5; pa.setXYZ(i, v.x * s * k, v.y * s * k * rr(0.5, 0.8), v.z * s * k); } g.computeVertexNormals(); return g; };
  for (let i = 0; i < 22; i++) { const a = rr(0, TAU), d = Math.sqrt(rnd()) * 0.85, s = rr(0.1, 0.24), kind = rnd(); const g = rock(s); xf(g, [Math.cos(a) * d * 1.3, s * 0.4 + (1 - d) * 0.18, Math.sin(a) * d * 0.65], [rnd() * 3, rnd() * 3, rnd() * 3]); P.add(g, kind < 0.45 ? 'tuff' : 'lava', {}); }
  for (let i = 0; i < 10; i++) P.add(xf(block(rr(0.2, 0.36), 0.05, rr(0.1, 0.18), 0.008), [rr(-1, 1), rr(0.05, 0.35), rr(-0.5, 0.5)], [rnd() * 3, rnd() * 3, rnd() * 3]), 'brick', {});
  // chunks of painted wall plaster, face up: red dado, white stucco, a scrap of an election notice
  for (let i = 0; i < 9; i++) { const w = rr(0.18, 0.4), d = rr(0.14, 0.3), g = block(w, 0.035, d, 0.006), pa = g.attributes.position, uv = new Float32Array(pa.count * 2), u0 = rr(0.05, 0.8), v0 = pick([rr(0.05, 0.2), rr(0.45, 0.6)]);
    for (let k = 0; k < pa.count; k++) { uv[k * 2] = u0 + (pa.getX(k) + w / 2) / 6; uv[k * 2 + 1] = v0 + (pa.getZ(k) + d / 2) / 4.4; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    xf(g, [rr(-1.1, 1.1), rr(0.02, 0.25), rr(-0.6, 0.6)], [rr(-0.4, 0.4), rnd() * 3, rr(-0.4, 0.4)]); P.add(g, 'f_houseA', { keepUV: true, color: C(0xffffff) }); }
  for (let i = 0; i < 7; i++) { const g = block(0.42, 0.025, 0.55, 0.006); xf(g, [rr(-1, 1), rr(0.05, 0.4), rr(-0.5, 0.5)], [rr(-0.6, 0.6), rnd() * 3, rr(-0.6, 0.6)]); P.add(g, 'terracotta', { color: k3(C_TERRA, rr(0.8, 1.1)), noise: 0.12 }); }
  for (let i = 0; i < Math.round(120 * Q.bits); i++) P.add(xf(new THREE.IcosahedronGeometry(rr(0.012, 0.04), 1), [rr(-1.3, 1.3), 0.015, rr(-0.75, 0.75)]), 'stone', { color: C(pick([0xd8d2c4, 0xc8c0b0, 0x9a948a])), noise: 0.1 });   // pumice lapilli
}
{ const P = part('Roof_Tile'); seed = 54;                            // falling hazard: a single tegula with its side flanges
  P.add(block(0.44, 0.025, 0.58, 0.006, 2), 'terracotta', { color: C_TERRA, noise: 0.12, freq: 9 });
  for (const s of [1, -1]) P.add(xf(block(0.035, 0.05, 0.58, 0.008, 2), [0.205 * s, 0.02, 0]), 'terracotta', { color: C_TERRA_D, noise: 0.1 });
  P.add(xf(block(0.36, 0.03, 0.04, 0.006), [0, 0.02, 0.27]), 'terracotta', { color: C_TERRA_D });
}

// ---------------- BACKDROP: Vesuvius as it stood in 79 (one tall cone, vineyards and woods on the slopes) and the Plinian column
{ const P = part('Vesuvius'); seed = 55;
  P.add(grid(HD ? 360 : 120, HD ? 110 : 40, (u, v) => {
    const a = u * TAU, r = lerp(40, 3200, Math.pow(v, 1.12));
    let h = 1250 * Math.pow(1 - v, 1.7) * (1 + 0.04 * Math.sin(a * 2 + 1));
    h += (fbm(Math.cos(a) * 3 + 5, Math.sin(a) * 3, v * 6) - 0.5) * 160 * (1 - v);                 // big buttresses
    h += Math.pow(Math.abs(Math.sin(a * 23 + vnoise(a * 4, v * 8, 1) * 4)), 3) * 45 * (1 - v) * smooth(v * 6);   // radial gullies
    h -= v < 0.035 ? 70 * (1 - v / 0.035) : 0;                                                             // summit crater
    return V(Math.cos(a) * r, Math.max(0, h), Math.sin(a) * r);
  }, true), 'mountain', { colorFn: (p, n) => {
    const y = p.y, steep = 1 - n.y, veg = smooth((900 - y) / 500), vine = smooth((380 - y) / 200);
    let c = C(0x6a5e52).lerp(C(0x3c4a30), veg * 0.85).lerp(C(0x6b7840), vine * 0.6 * (0.5 + 0.5 * Math.sign(Math.sin(p.x * 0.05 + p.z * 0.04))));
    c.lerp(C(0x5a5048), steep * 0.5).lerp(C(0x3a3430), smooth((y - 1050) / 200));
    return k3(c, 0.8 + 0.3 * fbm(p.x * 0.004, p.y * 0.004, p.z * 0.004)); }, noise: 0 });
}
{ const P = part('Eruption_Column'); seed = 56;                     // ~25 km tall in reality; here ~4 km, to be placed on the summit and scaled
  const puff = (c, r, sy = 0.85, light = 0, glow = 0) => {
    const g0 = new THREE.IcosahedronGeometry(1, HD ? 7 : 2); const g = mergeVertices(g0.deleteAttribute('normal').deleteAttribute('uv')), pa = g.attributes.position, o = rr(0, 99);
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      const k = 1 + (vnoise(x * 1.8 + o, y * 1.8, z * 1.8) - 0.5) * 0.5 + (vnoise(x * 4.5 + o, y * 4.5, z * 4.5) - 0.5) * 0.22 + Math.pow(vnoise(x * 9 + o, y * 9, z * 9), 3) * 0.12;
      pa.setXYZ(i, x * r * k + c.x, Math.max(-0.35, y) * r * k * sy + c.y, z * r * k + c.z); }
    g.computeVertexNormals();
    P.add(g, 'smoke', { colorFn: (p, n) => { const lit = clamp(0.55 + 0.45 * (n.y * 0.7 - n.x * 0.5)), base = C(0x5e5650).lerp(C(0xb8afa4), light); let c = base.clone().lerp(C(0x2a2522), (1 - lit) * 0.65).lerp(C(0xd8d0c6), Math.pow(lit, 3) * 0.35); if (glow) c.lerp(C(0xc8542a), glow * smooth((c.y ?? 0)) * 0); return c; }, noise: 0 });
    if (glow) P.add(xf(new THREE.IcosahedronGeometry(r * 0.9, HD ? 3 : 1), [c.x, c.y - r * 0.3, c.z]), 'smoke', { colorFn: (p, n) => C(0xff7a30).lerp(C(0x5a2010), clamp(n.y + 0.4)), noise: 0 });
  };
  for (let i = 0; i < 52; i++) { const t = i / 51, y = 150 + t * 3000, drift = t * t * 520, wob = Math.sin(t * 9) * 70;
    puff(V(drift + wob + rr(-90, 90) * (1 + t * 2), y + rr(-60, 60), rr(-90, 90) * (1 + t * 2)), lerp(210, 500, t) * rr(0.85, 1.2), 0.9, t * 0.35, i < 3 ? 0.8 : 0); }
  for (let i = 0; i < 80; i++) { const t = Math.pow(rnd(), 0.8), x = 500 + t * 5200 + rr(-300, 300), z = rr(-1, 1) * (700 + t * 1700), y = 3250 + rr(-120, 260) - t * 450;
    puff(V(x, y, z), rr(420, 760) * (1 - t * 0.25), 0.5, 0.45 * (1 - t)); }
  for (let i = 0; i < 16; i++) puff(V(rr(-400, 900), 3300 + rr(0, 300), rr(-600, 600)), rr(380, 600), 0.55, 0.5);
}

// ================================================================== BUILD + CHUNKS + EXPORT
const built = {}; let total = 0;
for (const [n, p] of Object.entries(parts)) { const g = p.build(); built[n] = g; total += g.userData.tris; console.log(`${n.padEnd(18)} ${String(Math.round(g.userData.tris)).padStart(8)} tris, ${g.children.length} meshes`); }
{ const m = new THREE.Mesh(fountainHead, headMat); m.name = 'Fountain_head'; m.position.set(0, 1.0, -0.44); m.scale.setScalar(1.35); built.Fountain.add(m); console.log(`fountain head ${fountainHead.index.count / 3} tris`); }
// ---------------- the game's pieces: renamed, house fronts centred on x and lifted onto the pavement
// (built from 0 to W along x at pavement level; the game puts a front's middle at the pavement's edge, at road level).
// The colonnade's wall stands 1.35 m back from the pavement line, so its columns line up with the other fronts.
const GAME = {
  Road_30m: ['Road_Segment'], Kerbs_30m: ['Pavement_L'],   // + Pavement_R
  House_A: ['House_A', -3, KERB_H], House_B: ['House_B', -3, KERB_H], Tavern: ['Thermopolium', -3, KERB_H],
  Bakery: ['Bakery', -3, KERB_H], Fullery: ['Fullonica', -3, KERB_H], Colonnade: ['Colonnade', -6, KERB_H, -1.35],
  Amphora: ['Amphora'], Fountain: ['Fountain'], AmphoraStack: ['Amphora_Stack'], Cart: ['Cart', 0, 0, 0, 1, 0.8],   // cart at 0.8: about 1.25 m high, jumpable like the old one
  Rubble: ['Rubble', 0, 0, 0, 0.65],   // narrowed to fit one lane
  FallenColumn: ['Column_Fallen', -0.86, 0, 0, 2],   // its drums centred and stretched right across the road
  FallenAwning: ['Awning_Street'], SteppingStones: ['Stepping_Stones'], Roof_Tile: ['Roof_Tile'],
  // Backdrop, seen from 2 km: Vesuvius at 0.3 of its real size (it would reach past the town), the column at 0.7.
  Vesuvius: ['Vesuvius', 0, 0, 0, 1, 0.3], EruptionColumn: ['Eruption_Column', 0, 0, 0, 1, 0.7],
};
const BACKDROP = ['Vesuvius', 'EruptionColumn'];   // not in the far version (the backdrop uses the near one)
const scene = new THREE.Scene();
for (const [name, [src, x = 0, y = 0, z = 0, sx = 1, k = 1]] of Object.entries(GAME)) {
  const node = new THREE.Group(); node.name = name;
  for (const s of [src, ...(name === 'Kerbs_30m' ? ['Pavement_R'] : [])]) { const g = built[s].clone(); g.position.set(x, y, z); g.scale.set(sx * k, k, k); node.add(g); }
  scene.add(node);
}
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync('street-hd.glb', Buffer.from(glb)); console.log(`street-hd.glb: ${(glb.byteLength / 1048576).toFixed(2)} MB`);
// the same without textures, to simplify into the far version (the game gives it the near version's materials)
for (const m of Object.values(MATS)) { m.map = null; m.normalMap = null; }
for (const n of BACKDROP) scene.remove(scene.getObjectByName(n));
const lite = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync('street-hd-lite.glb', Buffer.from(lite)); console.log(`street-hd-lite.glb: ${(lite.byteLength / 1048576).toFixed(2)} MB`);
lap('done');
