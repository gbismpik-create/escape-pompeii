// Escape Pompeii — street kit generated in code, matching the legionary's style:
// smooth/bevelled shapes, vertex-colour weathering, no textures, merged per material.
// Output: pompeii-kit.glb containing one named node per piece (all at the origin).
// Run:  npm run build:kit   (builds this, then writes public/assets/pompeii-kit.glb, compressed
//       with meshopt, and pompeii-kit-far.glb, simplified to ~25% for distant chunks)
//
// Escape Pompeii changes (kept in sync with the game's lanes, 1.8 m wide):
//  - FallenBeam: side rubble and posts sit on the kerbs (|x| >= 2.7), the beam is
//    higher and flatter and the awning shorter, so a sliding player (top 1.16 m)
//    clears it in every lane;
//  - AmphoraStack and Rubble fit within one lane (|x| <= 0.9).
//
// Street layout convention (metres): the street runs along +Z. Road x ∈ [-2.7, 2.7] (3 lanes of 1.8 m,
// lane centres x = -1.8, 0, 1.8). Kerbs |x| 2.7–3.0, pavements |x| 3.0–4.6 at y = 0.35.
// House fronts are built facing +Z, 6 m wide; rotate ±90° to line the street.

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { writeFileSync } from 'node:fs';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { THEATRE, LANES } from '../src/config.js';
import { theatreRoute, theatreFloor, forward } from '../src/path.js';

globalThis.FileReader = class {
  readAsArrayBuffer(b) { b.arrayBuffer().then(x => { this.result = x; this.onloadend?.(); }); }
  readAsDataURL(b) { b.arrayBuffer().then(x => { this.result = `data:${b.type};base64,` + Buffer.from(x).toString('base64'); this.onloadend?.(); }); }
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const C = h => new THREE.Color(h);

// seeded random so the kit is identical on every build
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rr = (a, b) => lerp(a, b, rnd());

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

// ---------------------------------------------------------------- materials
const MATS = {
  plaster:    { roughness: 0.95, metalness: 0 },
  stone:      { roughness: 0.85, metalness: 0 },
  terracotta: { roughness: 0.8,  metalness: 0 },
  wood:       { roughness: 0.82, metalness: 0 },
  metal:      { roughness: 0.45, metalness: 0.75 },
  cloth:      { roughness: 0.95, metalness: 0 },
  water:      { roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.8 },
};
const materials = Object.fromEntries(Object.entries(MATS).map(([k, v]) =>
  [k, new THREE.MeshStandardMaterial({ name: k, color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, ...v })]));

const COL = {
  basalt: C(0x4b4947), basaltLt: C(0x5c5955), mortar: C(0x2c2a28),
  lime: C(0xc1b69f), limeDk: C(0x8f8571), tuff: C(0xa89a80),
  signinum: C(0x9a6c55), chip: C(0xd8cfc0),
  pompRed: C(0x8e2a20), pompRedDk: C(0x5f1a14), ochre: C(0xc4943f), cream: C(0xe2d5bb), whiteWash: C(0xebe4d6),
  brick: C(0x8a4630), black: C(0x2a2522),
  terra: C(0xb15f3b), terraDk: C(0x7d3d24), terraLt: C(0xc9784e),
  wood: C(0x6b4a2e), woodDk: C(0x48311d), woodLt: C(0x8c6844),
  bronze: C(0x6d7a5a), iron: C(0x3d3d3d),
  cloth: C(0xc9b894), sack: C(0xb3a07a), awning: C(0xa9542f),
  water: C(0x4f7d84), ash: C(0x8b8279),
  grass: C(0x55603a), forest: C(0x3f4a2c), rock: C(0x6e655c), rockDk: C(0x4a433d),
  smoke: C(0x5a524b), smokeDk: C(0x2f2a26), smokeLt: C(0x9a918a),
};

// ---------------------------------------------------------------- builder
// geometry is added in the piece's local space; colorFn(p, n) gives the vertex colour
class Piece {
  constructor(name) { this.name = name; this.buf = {}; }
  add(geo, mat, opts = {}) {
    if (geo.attributes.uv) geo.deleteAttribute('uv');
    if (geo.attributes.uv1) geo.deleteAttribute('uv1');
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.index) geo = mergeVertices(geo, 1e-5);
    const B = this.buf[mat] ??= { pos: [], nor: [], col: [], idx: [] };
    const P = geo.attributes.position, N = geo.attributes.normal, base = B.pos.length / 3;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    const amp = opts.noise ?? 0.08, f = opts.freq ?? 6;
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i);
      B.pos.push(p.x, p.y, p.z); B.nor.push(n.x, n.y, n.z);
      const c = opts.colorFn ? opts.colorFn(p, n) : opts.color;
      const k = 1 + (fbm(p.x * f + 11, p.y * f, p.z * f) - 0.5) * 2 * amp;
      B.col.push(clamp(c.r * k, 0, 1), clamp(c.g * k, 0, 1), clamp(c.b * k, 0, 1));
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
      geo.setIndex(B.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(B.idx, 1) : new THREE.Uint16BufferAttribute(B.idx, 1));
      geo.computeBoundingBox();
      const m = new THREE.Mesh(geo, materials[k]); m.name = `${this.name}_${k}`;
      g.add(m); tris += B.idx.length / 3;
    }
    g.userData.tris = tris;
    return g;
  }
}

function grid(nu, nv, fn, wrapU = false) {
  const pos = [], idx = [], cols = wrapU ? nu : nu + 1;
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) { const q = fn(i / nu, j / nv); pos.push(q.x, q.y, q.z); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * cols + i, b = j * cols + ((i + 1) % cols), c = (j + 1) * cols + i, d = (j + 1) * cols + ((i + 1) % cols);
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function xf(g, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
  g.applyMatrix4(new THREE.Matrix4().compose(V(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), V(...scl)));
  return g;
}
// bevelled block: w (x) × h (y) × d (z), centred on x/z, bottom at y = 0
function block(w, h, d, bevel = 0.02, segs = 1) {
  const b = Math.min(bevel, w / 4, h / 4, d / 4);
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + b, -h / 2 + b); s.lineTo(w / 2 - b, -h / 2 + b); s.lineTo(w / 2 - b, h / 2 - b); s.lineTo(-w / 2 + b, h / 2 - b); s.lineTo(-w / 2 + b, -h / 2 + b);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * b, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: segs, curveSegments: 1 });
  g.translate(0, h / 2, -(d - 2 * b) / 2);
  return g;
}
const lathe = (pts, segs = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
const tint = (c, k) => new THREE.Color(c.r * k, c.g * k, c.b * k);
const dustUp = (c, y, h = 0.8, a = 0.35) => c.clone().lerp(COL.ash, clamp(1 - y / h) * a);

const pieces = [];

// ================================================================== ROAD
{
  const P = new Piece('Road_30m');
  const W = 5.4, L = 30, nx = 13, nz = 72, cx = W / nx, cz = L / nz;
  const pts = [];
  for (let i = 0; i <= nx; i++) { pts[i] = []; for (let j = 0; j <= nz; j++) {
    const edgeX = i === 0 || i === nx, edgeZ = j === 0 || j === nz;
    pts[i][j] = [-W / 2 + i * cx + (edgeX ? 0 : rr(-0.32, 0.32) * cx), j * cz + (edgeZ ? 0 : rr(-0.32, 0.32) * cz)];
  } }
  const rutX = [-0.9, 0.9];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const quad = [pts[i][j], pts[i + 1][j], pts[i + 1][j + 1], pts[i][j + 1]];
    const c = quad.reduce((a, q) => [a[0] + q[0] / 4, a[1] + q[1] / 4], [0, 0]);
    const inset = 0.022;
    const poly = quad.map(([x, z]) => { const dx = c[0] - x, dz = c[1] - z, d = Math.hypot(dx, dz); return [x + dx / d * inset, z + dz / d * inset]; });
    const inRut = rutX.some(r => Math.abs(c[0] - r) < 0.2);
    const topY = inRut ? -0.02 : 0, dome = inRut ? 0.006 : rr(0.012, 0.03);
    const pos = [], idx = [];
    poly.forEach(([x, z]) => pos.push(x, topY, z));                       // 0..3 rim
    pos.push(c[0], topY + dome, c[1]);                                   // 4 centre
    poly.forEach(([x, z]) => pos.push(x + (x - c[0]) * 0.05, -0.08, z + (z - c[1]) * 0.05)); // 5..8 bottom
    for (let k = 0; k < 4; k++) { const n = (k + 1) % 4; idx.push(k, 4, n); idx.push(k, n, 5 + k, n, 5 + n, 5 + k); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    g.toNonIndexed && (g.computeVertexNormals());
    const shade = rr(0.8, 1.18), col = (inRut ? COL.basaltLt : COL.basalt).clone().multiplyScalar(shade);
    if (rnd() < 0.15) col.lerp(C(0x4d4f4a), 0.5);
    P.add((g.computeVertexNormals(), g), 'stone', { color: col, noise: 0.06, freq: 9 });
  }
  P.add(xf(new THREE.PlaneGeometry(W, L, 1, 1), [0, -0.03, L / 2], [-Math.PI / 2, 0, 0]), 'stone', { color: COL.mortar, noise: 0.1 });
  pieces.push(P);
}

// ================================================================== KERBS + PAVEMENTS
{
  const P = new Piece('Kerbs_30m');
  for (const sx of [1, -1]) {
    let z = 0;
    while (z < 30) {
      const len = Math.min(rr(0.8, 1.5), 30 - z);
      const g = block(0.3, 0.44, len - 0.012, 0.03, 2);
      xf(g, [sx * 2.85, -0.08, z + len / 2]);
      const c = (rnd() < 0.5 ? COL.lime : COL.tuff).clone().multiplyScalar(rr(0.88, 1.08));
      P.add(g, 'stone', { colorFn: p => dustUp(c.clone().lerp(COL.limeDk, clamp((0.15 - p.y) * 3) * 0.4), p.y, 0.6, 0.2), noise: 0.1, freq: 8 });
      z += len;
    }
    // pavement (opus signinum: crushed terracotta with white chips)
    P.add(grid(10, 80, (u, v) => {
      const x = sx * lerp(3.0, 4.6, u), z = v * 30;
      return V(x, 0.345 + (vnoise(x * 3, 0, z * 3) - 0.5) * 0.012, z);
    }), 'stone', {
      colorFn: p => { const chips = vnoise(p.x * 40, 1, p.z * 40) > 0.82; return chips ? COL.chip : COL.signinum.clone().multiplyScalar(0.85 + 0.3 * vnoise(p.x * 2, 0, p.z * 2)); },
      noise: 0.12, freq: 4,
    });
    // pavement fill / side
    P.add(xf(new THREE.BoxGeometry(1.6, 0.35, 30), [sx * 3.8, 0.17, 15]), 'stone', { color: COL.tuff.clone().multiplyScalar(0.8) });
  }
  pieces.push(P);
}

// ================================================================== HOUSE FRONTS
function house(name, scheme) {
  const P = new Piece(name);
  const W = 6, H1 = 3.0, H2 = 5.4, T = 0.45;
  const mid = { red: COL.pompRed, ochre: COL.ochre, white: COL.whiteWash }[scheme.mid];
  const flakeSeed = scheme.seed;
  // wall colour as a function of facade position
  const wallCol = p => {
    let c;
    if (p.y < 1.1) {                                          // painted dado with panels
      c = scheme.dado.clone();
      const px = ((p.x + 3) % 1.5) / 1.5;
      if (px > 0.08 && px < 0.92 && p.y > 0.15 && p.y < 0.95) c.lerp(COL.black, 0.18);
    } else if (p.y < H1) {
      c = mid.clone();
      const panel = Math.abs(((p.x + 3) % 2) - 1) < 0.85 && p.y > 1.35 && p.y < 2.75;
      if (panel && scheme.mid !== 'white') c.multiplyScalar(0.9);
      if (Math.abs(p.y - 1.12) < 0.03) c = COL.cream.clone();   // painted line
    } else {
      c = (scheme.upper ?? COL.cream).clone();
    }
    // flaking plaster revealing brick / tuff
    const fl = fbm(p.x * 0.7 + flakeSeed, p.y * 0.7, flakeSeed) + 0.25 * vnoise(p.x * 4, p.y * 4, flakeSeed);
    const bare = (fbm(p.x * 6, p.y * 6, 3) > 0.5 ? COL.brick : COL.tuff).clone().multiplyScalar(0.9);
    c.multiplyScalar(1 - 0.22 * smooth((fl - 0.72) * 25));          // darker rim around flaked areas
    c.lerp(bare, smooth((fl - 0.76) * 20));
    // grime streaks and ground dust
    const streak = vnoise(p.x * 7, p.y * 0.4, flakeSeed);
    c.multiplyScalar(1 - 0.18 * smooth((streak - 0.55) * 4) * smooth((H2 - p.y) / 2));
    c.lerp(COL.ash, clamp(1 - p.y / 0.9) * 0.3);
    return c;
  };
  const relief = (x, y) => {
    const fl = fbm(x * 0.7 + flakeSeed, y * 0.7, flakeSeed) + 0.25 * vnoise(x * 4, y * 4, flakeSeed);
    return -0.012 * smooth((fl - 0.76) * 20) + (vnoise(x * 5, y * 5, 2) - 0.5) * 0.006;
  };
  const wallRect = (x0, x1, y0, y1) => grid(Math.max(2, Math.round((x1 - x0) / 0.15)), Math.max(2, Math.round((y1 - y0) / 0.15)),
    (u, v) => { const x = lerp(x0, x1, u), y = lerp(y0, y1, v); return V(x, y, relief(x, y)); });
  const op = scheme.opening; // [x0, x1, height, kind]
  for (const r of [[-W / 2, op[0], 0, H1], [op[1], W / 2, 0, H1], [op[0], op[1], op[2], H1], [-W / 2, W / 2, H1, H2]]) {
    if (r[1] - r[0] > 0.01) P.add(wallRect(...r), 'plaster', { colorFn: wallCol, noise: 0.07, freq: 3 });
  }
  // wall body (sides, top) behind the facade
  for (const r of [[-W / 2, op[0], 0, H1], [op[1], W / 2, 0, H1], [op[0], op[1], op[2], H1], [-W / 2, W / 2, H1, H2]]) {
    if (r[1] - r[0] > 0.01) P.add(xf(new THREE.BoxGeometry(r[1] - r[0], r[3] - r[2], T), [(r[0] + r[1]) / 2, (r[2] + r[3]) / 2, -T / 2 - 0.006]), 'plaster', { color: tint(COL.tuff, 0.85), noise: 0.1 });
  }
  P.add(xf(new THREE.BoxGeometry(W, H2, 0.2), [0, H2 / 2, -T - 0.1]), 'plaster', { color: tint(COL.tuff, 0.6), noise: 0.1 });
  // opening: jambs, soffit, threshold
  const [ox0, ox1, oh, kind] = op;
  for (const x of [ox0, ox1]) P.add(xf(new THREE.BoxGeometry(0.22, oh, T + 0.06), [x + (x === ox0 ? 0.11 : -0.11), oh / 2, -T / 2 + 0.02]), 'stone', { colorFn: p => dustUp(COL.lime, p.y, 1, 0.3), noise: 0.1 });
  P.add(xf(new THREE.BoxGeometry(ox1 - ox0 + 0.2, 0.24, T + 0.08), [(ox0 + ox1) / 2, oh + 0.12, -T / 2 + 0.03]), 'stone', { color: COL.lime, noise: 0.1 });
  P.add(xf(block(ox1 - ox0, 0.12, 0.5, 0.02), [(ox0 + ox1) / 2, 0.0, 0.05]), 'stone', { color: tint(COL.lime, 0.9), noise: 0.12 });
  P.add(xf(new THREE.PlaneGeometry(ox1 - ox0, oh), [(ox0 + ox1) / 2, oh / 2, -T + 0.005]), 'plaster', { color: tint(COL.black, 0.35), noise: 0.1 });
  if (kind === 'door') {
    // two-leaf wooden door with plank seams and bronze studs
    const dw = ox1 - ox0 - 0.44;
    for (let i = 0; i < 8; i++) {
      const x = ox0 + 0.22 + (i + 0.5) * dw / 8;
      P.add(xf(new THREE.BoxGeometry(dw / 8 - 0.012, oh - 0.05, 0.06), [x, oh / 2, -T + 0.12]), 'wood', { color: (i % 2 ? COL.wood : COL.woodDk).clone().multiplyScalar(rr(0.85, 1.1)), noise: 0.15, freq: 12 });
    }
    for (const y of [0.5, oh - 0.5]) P.add(xf(new THREE.BoxGeometry(dw, 0.1, 0.03), [(ox0 + ox1) / 2, y, -T + 0.165]), 'wood', { color: COL.woodDk });
    for (let i = 0; i < 6; i++) for (const y of [0.5, oh - 0.5]) P.add(xf(new THREE.SphereGeometry(0.018, 8, 6), [ox0 + 0.3 + i * dw / 5.5, y, -T + 0.185]), 'metal', { color: COL.bronze });
  } else {
    // shop: folding wooden shutters half open + counter
    const sw = ox1 - ox0 - 0.44;
    for (let i = 0; i < 6; i++) {
      const x = ox0 + 0.22 + (i + 0.5) * sw / 12;
      P.add(xf(new THREE.BoxGeometry(sw / 12 - 0.01, oh - 0.1, 0.04), [x, oh / 2, -T + 0.1]), 'wood', { color: COL.woodLt.clone().multiplyScalar(rr(0.8, 1.05)), noise: 0.15, freq: 12 });
    }
    P.add(xf(block(sw * 0.45, 0.9, 0.55, 0.03), [ox1 - 0.22 - sw * 0.225, 0, -0.2]), 'stone', { colorFn: p => dustUp(COL.chip.clone().lerp(COL.signinum, fbm(p.x * 8, p.y * 8, 1) > 0.55 ? 0.6 : 0), p.y), noise: 0.1 });
    // shop sign
    P.add(xf(new THREE.BoxGeometry(1.2, 0.35, 0.04), [(ox0 + ox1) / 2, oh + 0.45, 0.04]), 'wood', { color: COL.cream, noise: 0.1 });
    for (let i = 0; i < 4; i++) P.add(xf(new THREE.BoxGeometry(0.16, 0.05, 0.01), [(ox0 + ox1) / 2 - 0.36 + i * 0.24, oh + 0.45, 0.065]), 'plaster', { color: COL.pompRed });
  }
  // painted election notice (red letters on white band) on some walls
  if (scheme.notice) {
    const nx = scheme.notice;
    P.add(xf(new THREE.PlaneGeometry(1.6, 0.42), [nx, 2.4, 0.012]), 'plaster', { color: COL.whiteWash, noise: 0.06 });
    for (let row = 0; row < 2; row++) for (let i = 0; i < 9; i++) {
      if (hash(i, row, scheme.seed) < 0.2) continue;
      P.add(xf(new THREE.PlaneGeometry(0.1, 0.12), [nx - 0.66 + i * 0.165, 2.5 - row * 0.19, 0.016]), 'plaster', { color: COL.pompRed, noise: 0.1 });
    }
  }
  // cornice between storeys
  P.add(grid(60, 4, (u, v) => {
    const x = lerp(-W / 2, W / 2, u), prof = [[0, 0], [0.06, 0.04], [0.08, 0.1], [0.05, 0.16], [0, 0.2]][Math.round(v * 4)];
    return V(x, H1 + prof[1], prof[0]);
  }), 'plaster', { colorFn: p => COL.cream.clone().multiplyScalar(0.95), noise: 0.06 });
  // upper windows with wooden grilles
  for (const x of scheme.windows) {
    P.add(xf(new THREE.PlaneGeometry(0.7, 0.8), [x, 4.15, 0.004]), 'plaster', { color: tint(COL.black, 0.7) });
    P.add(xf(block(0.9, 0.08, 0.16, 0.015), [x, 3.72, 0.03]), 'stone', { color: COL.lime });
    for (let i = 0; i < 4; i++) P.add(xf(new THREE.BoxGeometry(0.04, 0.8, 0.04), [x - 0.27 + i * 0.18, 4.15, 0.02]), 'wood', { color: COL.woodDk });
    P.add(xf(new THREE.BoxGeometry(0.72, 0.04, 0.04), [x, 4.15, 0.02]), 'wood', { color: COL.woodDk });
  }
  // balcony (maenianum)
  if (scheme.balcony) {
    P.add(xf(new THREE.BoxGeometry(4.2, 0.12, 0.9), [0, H1 + 0.25, 0.45]), 'wood', { color: COL.wood, noise: 0.15, freq: 10 });
    for (let i = 0; i < 5; i++) P.add(xf(new THREE.BoxGeometry(0.12, 0.12, 1.0), [-1.9 + i * 0.95, H1 + 0.13, 0.45]), 'wood', { color: COL.woodDk });
    for (let i = 0; i <= 14; i++) P.add(xf(new THREE.BoxGeometry(0.05, 0.9, 0.05), [-2.05 + i * 0.293, H1 + 0.76, 0.86]), 'wood', { color: COL.wood });
    P.add(xf(new THREE.BoxGeometry(4.2, 0.08, 0.1), [0, H1 + 1.2, 0.86]), 'wood', { color: COL.woodDk });
    for (const x of [-2.05, 2.05]) P.add(xf(new THREE.BoxGeometry(0.1, 1.9, 0.1), [x, H1 + 1.2, 0.86]), 'wood', { color: COL.woodDk });
  }
  // tiled roof overhang: tegulae (flat) + imbrices (half-round covers) + antefixes
  const ov = 0.85, y0 = H2 + 0.05, rise = 0.55, dep = 1.6;
  const roofY = z => y0 + (ov - z) / (ov + dep) * rise;      // slopes up toward the back
  P.add(grid(4, 30, (u, v) => { const z = lerp(ov, -dep, u); return V(lerp(-W / 2 - 0.1, W / 2 + 0.1, v), roofY(z) - 0.03, z); }), 'terracotta',
    { colorFn: p => COL.terra.clone().multiplyScalar(0.85), noise: 0.15, freq: 5 });
  for (let i = 0; i < 17; i++) {
    const x = -W / 2 + (i + 0.5) * W / 17;
    const len = Math.hypot(ov + dep, rise), ang = Math.atan2(rise, ov + dep);
    const g = new THREE.CylinderGeometry(0.075, 0.085, len, 10, 6, true, 0, Math.PI);
    g.rotateZ(Math.PI / 2); g.rotateY(Math.PI / 2); // axis along z, half-round facing up
    xf(g, [x, (roofY(ov) + roofY(-dep)) / 2 - 0.01, (ov - dep) / 2], [-ang, 0, 0]);
    const k = rr(0.82, 1.15), base = (rnd() < 0.3 ? COL.terraLt : COL.terra).clone().multiplyScalar(k);
    P.add(g, 'terracotta', { colorFn: p => base.clone().lerp(COL.terraDk, clamp(vnoise(p.x * 9, p.y * 9, p.z * 9) - 0.4) * 0.6), noise: 0.12, freq: 8 });
    // antefix at the eave
    const s = new THREE.Shape(); s.moveTo(-0.08, 0); s.lineTo(0.08, 0); s.lineTo(0.07, 0.1); s.quadraticCurveTo(0, 0.2, -0.07, 0.1); s.lineTo(-0.08, 0);
    P.add(xf(new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }), [x, roofY(ov) - 0.04, ov + 0.01]), 'terracotta', { color: COL.terraLt, noise: 0.1 });
  }
  // rafters under the overhang
  for (let i = 0; i < 7; i++) P.add(xf(new THREE.BoxGeometry(0.1, 0.12, ov + 0.1), [-W / 2 + 0.4 + i * (W - 0.8) / 6, y0 - 0.1, ov / 2 - 0.05]), 'wood', { color: COL.woodDk, noise: 0.15 });
  P.add(xf(new THREE.BoxGeometry(W + 0.2, 0.08, 0.1), [0, y0 - 0.06, ov - 0.04]), 'wood', { color: COL.woodDk });
  pieces.push(P);
}
house('House_Red',   { seed: 3.1, dado: COL.pompRedDk, mid: 'red',   upper: COL.cream, opening: [-0.8, 0.8, 2.3, 'door'], windows: [-1.9, 1.9], notice: null });
house('House_Ochre', { seed: 5.7, dado: COL.pompRed,   mid: 'ochre', upper: COL.cream, opening: [-2.0, 1.4, 2.5, 'shop'], windows: [2.2], notice: 2.0 });
house('House_White', { seed: 8.3, dado: COL.pompRed,   mid: 'white', upper: COL.whiteWash, opening: [0.6, 2.0, 2.3, 'door'], windows: [-1.6, 0.4], notice: -1.6, balcony: true });

// ================================================================== THERMOPOLIUM (street-food counter)
{
  const P = new Piece('Thermopolium');
  const marble = p => {
    const n = fbm(p.x * 5, p.y * 5, p.z * 5);
    const pal = [C(0xd9d2c4), C(0x8a3b2e), C(0x6f7d5c), C(0xc8a96a), C(0xe8e2d6)];
    return pal[Math.floor(clamp(n * 1.6 - 0.2) * 4.99)].clone();
  };
  const pal = [C(0xd9d2c4), C(0x8a3b2e), C(0x5f6e4f), C(0xc8a96a), C(0xe8e2d6), C(0x3e3a36)];
  P.add(block(2.36, 0.88, 0.66, 0.02), 'stone', { color: COL.tuff, noise: 0.1 });
  P.add(xf(block(0.66, 0.88, 1.26, 0.02), [-1.55, 0, -0.3]), 'stone', { color: COL.tuff, noise: 0.1 });
  // marble veneer slabs (opus sectile) on the front and the end
  for (let i = 0; i < 12; i++) for (let j = 0; j < 5; j++) {
    if (rnd() < 0.08) continue;                                    // a few slabs have fallen off
    const c = pal[Math.floor(rnd() * pal.length)].clone();
    P.add(xf(new THREE.BoxGeometry(0.19, 0.165, 0.025), [-1.1 + i * 0.2, 0.09 + j * 0.175, 0.34]), 'stone', { colorFn: p => dustUp(c, p.y, 0.6, 0.25), noise: 0.1, freq: 14 });
  }
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) {
    const c = pal[Math.floor(rnd() * pal.length)].clone();
    P.add(xf(new THREE.BoxGeometry(0.025, 0.165, 0.19), [-1.89, 0.09 + j * 0.175, 0.24 - i * 0.2]), 'stone', { colorFn: p => dustUp(c, p.y, 0.6, 0.25), noise: 0.1, freq: 14 });
  }
  P.add(xf(block(2.55, 0.07, 0.82, 0.02, 2), [0, 0.9, 0]), 'stone', { color: C(0xe4ddcf), noise: 0.06 });
  P.add(xf(block(0.82, 0.07, 1.42, 0.02, 2), [-1.55, 0.9, -0.3]), 'stone', { color: C(0xe4ddcf), noise: 0.06 });
  for (const x of [-0.7, 0.05, 0.8]) {
    P.add(xf(new THREE.TorusGeometry(0.2, 0.035, 8, 24), [x, 0.975, 0], [Math.PI / 2, 0, 0]), 'terracotta', { color: COL.terra });
    P.add(xf(new THREE.CircleGeometry(0.18, 20), [x, 0.95, 0], [-Math.PI / 2, 0, 0]), 'terracotta', { color: tint(COL.terraDk, 0.4) });
  }
  // stepped shelf with jugs
  for (let i = 0; i < 3; i++) P.add(xf(block(0.6, 0.12, 0.25, 0.015), [-1.55, 0.97 + i * 0.12, -0.75 + i * 0.12]), 'stone', { color: COL.chip });
  const jug = () => lathe([[0, 0], [0.05, 0.005], [0.07, 0.06], [0.06, 0.13], [0.03, 0.17], [0.035, 0.2], [0.03, 0.2]], 14);
  for (let i = 0; i < 5; i++) P.add(xf(jug(), [-1.75 + i * 0.1, 1.09 + (i % 3) * 0.12, -0.75 + (i % 3) * 0.12]), 'terracotta', { color: (i % 2 ? COL.terra : COL.terraLt), noise: 0.1 });
  pieces.push(P);
}

// ================================================================== FOUNTAIN (street corner)
{
  const P = new Piece('Fountain');
  const stoneC = p => dustUp(COL.lime.clone().multiplyScalar(0.92), p.y, 0.7, 0.25);
  P.add(xf(block(1.4, 0.72, 0.2, 0.03, 2), [0, 0, 0.5]), 'stone', { colorFn: stoneC, noise: 0.1 });
  P.add(xf(block(1.4, 0.72, 0.2, 0.03, 2), [0, 0, -0.5]), 'stone', { colorFn: stoneC, noise: 0.1 });
  P.add(xf(block(0.2, 0.72, 0.8, 0.03, 2), [0.6, 0, 0]), 'stone', { colorFn: stoneC, noise: 0.1 });
  P.add(xf(block(0.2, 0.72, 0.8, 0.03, 2), [-0.6, 0, 0]), 'stone', { colorFn: stoneC, noise: 0.1 });
  P.add(xf(new THREE.BoxGeometry(1.0, 0.05, 0.8), [0, 0.03, 0]), 'stone', { color: COL.limeDk });
  P.add(xf(new THREE.PlaneGeometry(1.0, 0.8), [0, 0.6, 0], [-Math.PI / 2, 0, 0]), 'water', { color: COL.water, noise: 0.05 });
  // worn groove where hands rest
  P.add(xf(block(0.42, 1.25, 0.3, 0.04, 2), [0, 0, -0.75]), 'stone', { colorFn: stoneC, noise: 0.1 });
  // carved face relief
  P.add(xf(new THREE.SphereGeometry(0.14, 20, 14, 0, TAU, 0, Math.PI / 2), [0, 0.98, -0.6], [Math.PI / 2, 0, 0], [1, 0.45, 1.15]), 'stone', { color: COL.lime });
  for (const sx of [1, -1]) P.add(xf(new THREE.SphereGeometry(0.02, 8, 6), [sx * 0.05, 1.02, -0.54]), 'stone', { color: COL.limeDk });
  P.add(xf(new THREE.CylinderGeometry(0.018, 0.022, 0.14, 10), [0, 0.92, -0.5], [Math.PI / 2, 0, 0]), 'metal', { color: COL.bronze });
  P.add(xf(new THREE.CylinderGeometry(0.012, 0.016, 0.34, 8), [0, 0.76, -0.43], [0.15, 0, 0]), 'water', { color: C(0x8ab1b4), noise: 0 });
  pieces.push(P);
}

// ================================================================== AMPHORA + STACK (lane obstacle)
function amphora(P, pos, rot, scale = 1, broken = false) {
  const prof = [[0, 0], [0.03, 0.02], [0.05, 0.12], [0.17, 0.38], [0.2, 0.55], [0.17, 0.72], [0.07, 0.8], [0.055, 0.95], [0.065, 0.98], [0.05, 0.99]];
  const g = lathe(broken ? prof.slice(0, 5).concat([[0.18, 0.5]]) : prof, 18);
  const m = new THREE.Matrix4().compose(V(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), V(scale, scale, scale));
  g.applyMatrix4(m);
  const base = (rnd() < 0.5 ? COL.terra : COL.terraLt).clone().multiplyScalar(rr(0.85, 1.1));
  P.add(g, 'terracotta', { colorFn: p => base, noise: 0.12, freq: 9 });
  if (!broken) for (const sx of [1, -1]) {
    const pts = [V(sx * 0.05, 0.92, 0), V(sx * 0.13, 0.9, 0), V(sx * 0.15, 0.8, 0), V(sx * 0.13, 0.72, 0)];
    const h = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.018, 6); h.applyMatrix4(m);
    P.add(h, 'terracotta', { color: base, noise: 0.1 });
  }
}
{
  const P = new Piece('Amphora');
  amphora(P, [0, 0, 0], [0, 0, 0]);
  pieces.push(P);
  const S = new Piece('AmphoraStack');
  const spots = [[-0.45, 0, 0.12, 0.25], [0, 0, -0.1, -0.15], [0.45, 0, 0.08, 0.2], [-0.22, 0, 0.42, -0.35], [0.25, 0, 0.45, 0.3]];
  spots.forEach(([x, , z, lean], i) => amphora(S, [x, 0.02, z], [lean * 0.4, i, lean], 1.05));
  amphora(S, [-0.35, 0.18, -0.3], [Math.PI / 2 - 0.1, 0.25, 0], 1.0);        // one lying down, along the street
  amphora(S, [0.6, 0.0, -0.3], [0.1, 0, 0.1], 1.0, true);                      // a broken one
  for (let i = 0; i < 14; i++) S.add(xf(new THREE.BoxGeometry(rr(0.05, 0.14), 0.02, rr(0.04, 0.1)), [rr(-0.8, 0.8), 0.01, rr(-0.6, 0.7)], [rr(-0.3, 0.3), rr(0, 3), rr(-0.3, 0.3)]), 'terracotta', { color: COL.terra });
  pieces.push(S);
}

// ================================================================== CART (lane blocker)
{
  const P = new Piece('Cart');
  const wood = () => (rnd() < 0.5 ? COL.wood : COL.woodLt).clone().multiplyScalar(rr(0.8, 1.05));
  for (let i = 0; i < 6; i++) P.add(xf(new THREE.BoxGeometry(1.26, 0.05, 0.33), [0, 0.72, -0.9 + i * 0.34]), 'wood', { color: wood(), noise: 0.15, freq: 12 });
  for (const sx of [1, -1]) for (let i = 0; i < 3; i++) P.add(xf(new THREE.BoxGeometry(0.05, 0.12, 2.06), [sx * 0.63, 0.82 + i * 0.13, 0]), 'wood', { color: wood(), noise: 0.15, freq: 12 });
  for (const z of [1, -1]) for (let i = 0; i < 3; i++) P.add(xf(new THREE.BoxGeometry(1.3, 0.12, 0.05), [0, 0.82 + i * 0.13, z * 1.03]), 'wood', { color: wood(), noise: 0.15, freq: 12 });
  for (const sx of [1, -1]) for (const z of [1, -1]) P.add(xf(new THREE.BoxGeometry(0.07, 0.5, 0.07), [sx * 0.63, 0.95, z * 1.0]), 'wood', { color: COL.woodDk });
  P.add(xf(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 10), [0, 0.55, 0], [0, 0, Math.PI / 2]), 'wood', { color: COL.woodDk });
  for (const sx of [1, -1]) {
    // spoked wheel with iron tyre
    P.add(xf(new THREE.TorusGeometry(0.52, 0.045, 8, 36), [sx * 0.8, 0.55, 0], [0, Math.PI / 2, 0], [1, 1, 1.4]), 'wood', { color: COL.woodDk, noise: 0.12 });
    P.add(xf(new THREE.TorusGeometry(0.565, 0.018, 6, 36), [sx * 0.8, 0.55, 0], [0, Math.PI / 2, 0], [1, 1, 2.6]), 'metal', { color: COL.iron });
    P.add(xf(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 12), [sx * 0.8, 0.55, 0], [0, 0, Math.PI / 2]), 'wood', { color: COL.wood });
    for (let k = 0; k < 8; k++) P.add(xf(new THREE.CylinderGeometry(0.022, 0.03, 0.44, 6), [sx * 0.8, 0.55 + Math.cos(k / 8 * TAU) * 0.27, Math.sin(k / 8 * TAU) * 0.27], [k / 8 * TAU, 0, 0]), 'wood', { color: COL.wood });
  }
  for (const sx of [1, -1]) P.add(xf(new THREE.CylinderGeometry(0.04, 0.035, 2.3, 8), [sx * 0.45, 0.62, 2.05], [Math.PI / 2 - 0.12, 0, 0]), 'wood', { color: COL.wood });
  // load: sacks + amphorae
  for (let i = 0; i < 4; i++) {
    const g = new THREE.SphereGeometry(1, 16, 12); const Pp = g.attributes.position;
    for (let k = 0; k < Pp.count; k++) { const y = Pp.getY(k); Pp.setY(k, y < 0 ? y * 0.6 : y); Pp.setX(k, Pp.getX(k) * (1 + 0.08 * Math.sin(k))); }
    g.computeVertexNormals();
    P.add(xf(g, [rr(-0.35, 0.35), 0.93, -0.6 + i * 0.32], [0, rr(0, 3), rr(-0.3, 0.3)], [0.24, 0.2, 0.17]), 'cloth', { color: COL.sack.clone().multiplyScalar(rr(0.85, 1.1)), noise: 0.15, freq: 10 });
  }
  amphora(P, [0.25, 0.92, 0.55], [Math.PI / 2, 0, 0.2], 0.9);
  amphora(P, [-0.25, 0.92, 0.6], [Math.PI / 2, 0, -0.1], 0.9);
  pieces.push(P);
}

// ================================================================== FALLEN COLUMN (jump obstacle, full row)
// A Greek Doric column (like those of Pompeii's Triangular Forum) toppled by
// the earthquakes, its drums lying across the street. 20 shallow flutes meet
// in sharp ridges; the shaft tapers towards the capital, which has broken off
// onto the pavement. Weathered cream stucco over grey tuff; the broken drum
// faces show bare stone.
{
  const P = new Piece('FallenColumn');
  const FLUTES = 20, SEG = 5, DEPTH = 0.022;
  const R0 = 0.3, R1 = 0.24;                   // radius at the foot and the neck
  const X0 = -2.64, X1 = 3.0;                  // the shaft lies from x0 (foot) to x1 (neck)
  const radiusAt = (x) => lerp(R0, R1, (x - X0) / (X1 - X0));
  const stucco = (p) => {
    let c = COL.cream.clone().lerp(COL.whiteWash, 0.5);
    const wear = fbm(p.x * 3 + 2, p.y * 3, p.z * 3 + 7);
    if (wear > 0.64) c = COL.tuff.clone();       // stucco fallen away
    else if (wear > 0.6) c.lerp(COL.tuff, 0.5);
    return dustUp(c, p.y, 0.25, 0.3);
  };
  const bare = (p) => COL.tuff.clone().lerp(COL.chip, 0.25 + 0.2 * fbm(p.x * 6, p.y * 6, p.z * 6));
  // one drum lying along x, resting on the road, slightly turned (yaw)
  const drum = (xa, xb, z, yaw, roll) => {
    const ra = radiusAt(xa), rb = radiusAt(xb), len = xb - xa;
    const parts = [];
    for (let f = 0; f < FLUTES; f++) {
      parts.push([grid(SEG, 3, (u, v) => {
        const a = ((f + u) / FLUTES) * TAU + roll;
        const r = lerp(ra, rb, v) - DEPTH * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
        return V(Math.sin(a) * r, v * len, Math.cos(a) * r);
      }), 'plaster', stucco]);
    }
    for (const [y, r, flip] of [[0, ra, 1], [len, rb, -1]]) {
      const g = new THREE.CircleGeometry(r - DEPTH * 0.6, FLUTES * 2);
      parts.push([xf(g, [0, y, 0], [flip * Math.PI / 2, 0, 0]), 'stone', bare]);
    }
    const centre = ra; // rests on its widest end
    for (const [g, mat, colorFn] of parts) {
      // stand the drum on its side along +x, then place it
      xf(g, [0, 0, 0], [0, 0, -Math.PI / 2]);
      xf(g, [xa, centre, 0], [0, yaw, 0]);
      g.translate(0, 0, z);
      P.add(g, mat, { colorFn, noise: 0.05, freq: 9 });
    }
  };
  // drums: [from x, to x, z offset, yaw, roll] - fixed values keep the kit reproducible
  drum(-2.64, -1.62, 0.04, 0.04, 0.0);
  drum(-1.55, -0.6, -0.08, -0.06, 0.4);
  drum(-0.52, 0.55, 0.06, 0.04, 0.9);
  drum(0.63, 1.62, 0.12, 0.08, 1.3);
  drum(1.7, 2.6, 0.03, -0.04, 0.2);
  // the capital, broken off and lying on its side on the pavement
  {
    const parts = [];
    for (let i = 0; i < 3; i++) parts.push(xf(new THREE.TorusGeometry(R1 + 0.012 + i * 0.006, 0.009, 5, 40), [0, 0.02 + i * 0.022, 0], [Math.PI / 2, 0, 0]));
    parts.push(xf(lathe([[R1 + 0.02, 0], [R1 + 0.06, 0.03], [0.33, 0.08], [0.38, 0.13], [0.4, 0.16], [0, 0.16]], 40), [0, 0.06, 0]));
    parts.push(xf(block(0.86, 0.15, 0.86, 0.012), [0, 0.22, 0]));
    const stub = new THREE.CylinderGeometry(R1, R1, 0.1, FLUTES * 2); stub.translate(0, -0.03, 0);
    parts.push(stub);
    for (const g of parts) {
      // tip it over: lying on its side, abacus towards the houses, on the pavement (top 0.36)
      xf(g, [0, 0, 0], [0.25, 0, -Math.PI / 2 + 0.12]);
      xf(g, [3.35, 0.36 + 0.43, -0.15], [0, 0.5, 0]);
      P.add(g, 'plaster', { colorFn: stucco, noise: 0.05 });
    }
  }
  pieces.push(P);
}

// ================================================================== RUBBLE (low obstacle, one lane)
function rubble(P, cx, cz, w, h, n) {
  for (let i = 0; i < n; i++) {
    const t = rnd(), kind = rnd();
    const x = cx + rr(-w / 2, w / 2), z = cz + rr(-0.5, 0.5);
    const prof = Math.max(0, 1 - Math.pow(Math.abs(x - cx) / (w / 2), 2)) * Math.max(0, 1 - Math.pow(Math.abs(z - cz) / 0.55, 2));
    const y = h * prof * Math.sqrt(rnd());
    if (kind < 0.45) {
      const g = new THREE.IcosahedronGeometry(1, 0);
      P.add(xf(g, [x, Math.max(0.05, y), z], [rr(0, 3), rr(0, 3), rr(0, 3)], [rr(0.08, 0.22), rr(0.06, 0.16), rr(0.08, 0.2)]), 'stone',
        { color: (rnd() < 0.5 ? COL.tuff : COL.lime).clone().multiplyScalar(rr(0.75, 1.05)), noise: 0.1 });
    } else if (kind < 0.8) {
      P.add(xf(new THREE.BoxGeometry(rr(0.2, 0.42), 0.03, rr(0.15, 0.32)), [x, Math.max(0.04, y), z], [rr(-0.6, 0.6), rr(0, 3), rr(-0.6, 0.6)]), 'terracotta',
        { color: COL.terra.clone().multiplyScalar(rr(0.8, 1.1)), noise: 0.1 });
    } else {
      P.add(xf(new THREE.BoxGeometry(rr(0.15, 0.35), rr(0.03, 0.06), rr(0.15, 0.3)), [x, Math.max(0.04, y), z], [rr(-0.7, 0.7), rr(0, 3), rr(-0.7, 0.7)]), 'plaster',
        { color: (rnd() < 0.5 ? COL.pompRed : COL.cream).clone(), noise: 0.1 });
    }
  }
}
{
  const P = new Piece('Rubble');
  rubble(P, 0, 0, 1.3, 0.55, 110); // narrow enough for one 1.8 m lane
  pieces.push(P);
}

// ================================================================== FALLEN BEAM (slide obstacle, all lanes)
{
  const P = new Piece('FallenBeam');
  rubble(P, -3.45, 0, 1.0, 1.15, 90); // piles on the kerbs, clear of the lanes
  rubble(P, 3.45, 0, 1.0, 1.4, 90);
  for (const [x, h, lean] of [[-2.95, 1.42, 0.08], [2.95, 1.62, -0.06]]) P.add(xf(new THREE.BoxGeometry(0.2, h, 0.2), [x, h / 2, 0.05], [0.05, 0, lean]), 'wood', { color: COL.woodDk, noise: 0.18, freq: 10 });
  const g = new THREE.BoxGeometry(6.4, 0.24, 0.26, 24, 1, 1);
  const pp = g.attributes.position; for (let i = 0; i < pp.count; i++) pp.setY(i, pp.getY(i) + Math.sin(pp.getX(i) * 0.9) * 0.02);
  g.computeVertexNormals();
  P.add(xf(g, [0, 1.52, 0], [0, 0.05, 0.03]), 'wood', { colorFn: p => COL.woodDk.clone().lerp(C(0x1f1813), clamp(vnoise(p.x * 3, 0, 1) - 0.4)), noise: 0.18, freq: 10 });
  // broken tiles still nailed to it and a torn awning hanging down
  for (let i = 0; i < 12; i++) {
    const x = -2.6 + i * 0.47;
    const t = new THREE.CylinderGeometry(0.07, 0.08, 0.5, 8, 1, true, 0, Math.PI); t.rotateZ(Math.PI / 2); t.rotateY(Math.PI / 2);
    P.add(xf(t, [x, 1.72 + x * 0.03, rr(-0.05, 0.12)], [rr(-0.4, 0.2), rr(-0.2, 0.2), 0.03]), 'terracotta', { color: COL.terra.clone().multiplyScalar(rr(0.8, 1.1)), noise: 0.12 });
  }
  P.add(grid(16, 8, (u, v) => {
    const x = lerp(-1.4, 1.2, u);
    return V(x, 1.44 + x * 0.03 - v * 0.12 - 0.03 * Math.sin(u * Math.PI) * v, 0.14 + 0.04 * Math.sin(u * 9) * v);
  }), 'cloth', { colorFn: p => COL.awning.clone().multiplyScalar(0.8 + 0.25 * vnoise(p.x * 3, p.y * 6, 0)), noise: 0.1 });
  pieces.push(P);
}

// ================================================================== VESUVIUS backdrop (place ~1.5–2 km away, fog off)
{
  const P = new Piece('Vesuvius');
  const R = 900, H = 420;
  P.add(grid(160, 48, (u, v) => {
    const a = u * TAU, r = R * (1 - v);
    const ridge = 0.06 * Math.pow(Math.abs(Math.sin(a * 9 + fbm(u * 6, v * 3, 1) * 3)), 3);
    let h = H * Math.pow(v, 0.75) * (1 + (fbm(u * 8, v * 4, 2) - 0.5) * 0.25) - ridge * H * v * (1 - v);
    if (v > 0.93) h -= (v - 0.93) * H * 1.6;           // summit crater
    return V(Math.sin(a) * r * (1 + (fbm(u * 5, 1, 3) - 0.5) * 0.15), h, Math.cos(a) * r);
  }, true), 'stone', {
    colorFn: p => {
      const t = p.y / H;
      let c = COL.forest.clone().lerp(COL.grass, clamp(vnoise(p.x * 0.02, 0, p.z * 0.02)) * 0.6);
      c.lerp(COL.rock, smooth((t - 0.45) * 3));
      c.lerp(COL.rockDk, smooth((t - 0.85) * 6) * 0.7);
      return c;
    }, noise: 0.12, freq: 0.03,
  });
  pieces.push(P);
}

// ================================================================== ERUPTION COLUMN (Plinian, scale per phase)
{
  const P = new Piece('EruptionColumn');
  const H = 2400;
  for (let i = 0; i < 230; i++) {
    const t = Math.pow(rnd(), 0.8);
    const y = t * H, spread = lerp(60, 380, t);
    const g = new THREE.IcosahedronGeometry(1, 1);
    const r = lerp(70, 260, t) * rr(0.7, 1.3);
    const a = rr(0, TAU), d = rr(0, spread);
    P.add(xf(g, [Math.cos(a) * d, y, Math.sin(a) * d], [0, 0, 0], [r, r * 0.85, r]), 'cloth', {
      colorFn: p => COL.smokeDk.clone().lerp(COL.smoke, smooth(p.y / H * 1.5)).lerp(COL.smokeLt, smooth((p.y - H * 0.75) / (H * 0.5)) * 0.5)
        .lerp(C(0x8a4a2a), smooth((260 - p.y) / 260) * 0.45),
      noise: 0.2, freq: 0.012,
    });
  }
  // umbrella cloud spreading at the top
  for (let i = 0; i < 120; i++) {
    const a = rr(0, TAU), d = Math.sqrt(rnd()) * 1500;
    const g = new THREE.IcosahedronGeometry(1, 1), r = rr(180, 360);
    P.add(xf(g, [Math.cos(a) * d, H + rr(-120, 160) - d * 0.12, Math.sin(a) * d], [0, 0, 0], [r * 1.3, r * 0.6, r * 1.3]), 'cloth', {
      colorFn: p => COL.smoke.clone().lerp(COL.smokeLt, 0.25), noise: 0.2, freq: 0.01,
    });
  }
  pieces.push(P);
}

// (The statues of the gods are their own file: tools/build-statues.mjs.)

// ================================================================== FORUM (paving, colonnade bays, temple front, entrance arch)
// Built in place, kit space: the square runs along +z from z = 0; pieces for
// the +x side face the square (towards -x); the track turns them for the
// other side. Travertine (pale stone), plaster walls, terracotta roofs.
{
  const trav = C(0xe3d8c2), travDk = C(0xc9bca3), joint = C(0x6f675c);
  const travFn = (p) => trav.clone().lerp(travDk, clamp((fbm(p.x * 1.3, p.y * 2, p.z * 1.3) - 0.42) * 2.2)).lerp(COL.ash, clamp(1 - p.y / 0.5) * 0.15);
  // A Doric column for the forum: 16 sides, tapered, with a cushion capital and square abacus.
  const column = (x, y, z, h, r) => [
    xf(lathe([[r, 0], [r * 0.84, h * 0.97], [r * 0.9, h * 0.97], [r * 1.18, h], [0, h]], 16), [x, y, z]),
    xf(block(r * 2.6, h * 0.05, r * 2.6, 0.01), [x, y + h, z]),
  ];

  // ---- paving: the whole square in big slabs (30 m long, 26 m wide), joints showing between them
  {
    const P = new Piece('Forum_Paving_30m');
    P.add(xf(new THREE.PlaneGeometry(26, 30), [0, -0.06, 15], [-Math.PI / 2, 0, 0]), 'stone', { color: joint, noise: 0.1 });
    for (let x = -13; x < 13; x += 1.3) for (let z = 0; z < 30; z += 2.5) {
      const w = 1.3 - 0.05, d = 2.5 - 0.05, sh = (fbm(x * 0.7, 0, z * 0.7) - 0.5) * 0.1;
      P.add(xf(block(w, 0.06, d, 0.012), [x + 0.65, -0.06, z + 1.25]), 'stone', { colorFn: (p) => travFn(p).multiplyScalar(1 + sh), noise: 0.06, freq: 4 });
    }
    pieces.push(P);
  }

  // ---- colonnade bay (6 m): two storeys of columns on a step, a gallery floor,
  // a tiled roof sloping back to a plastered wall with shop doors
  {
    const P = new Piece('Forum_Colonnade_6m');
    const X = 12, BACK = 16.5, L6 = 6;
    P.add(xf(block(BACK - X + 0.8, 0.35, L6, 0.02), [(X - 0.8 + BACK) / 2, 0, L6 / 2]), 'stone', { colorFn: travFn, noise: 0.06 });
    for (const z of [1.5, 4.5]) {
      column(X, 0.35, z, 4.2, 0.34).forEach((g) => P.add(g, 'stone', { colorFn: travFn, noise: 0.05 }));
      column(X, 5.55, z, 3.0, 0.24).forEach((g) => P.add(g, 'stone', { colorFn: travFn, noise: 0.05 }));
    }
    // lower entablature with a frieze of triglyphs (darker blocks), then the gallery floor
    P.add(xf(block(0.9, 0.5, L6, 0.01), [X, 4.76, L6 / 2]), 'stone', { colorFn: travFn });
    P.add(xf(block(0.9, 0.45, L6, 0.01), [X, 5.26, L6 / 2]), 'stone', {
      colorFn: (p) => (Math.abs(((p.z % 1.5) + 1.5) % 1.5 - 0.75) < 0.2 && p.x < X ? travDk.clone().multiplyScalar(0.85) : travFn(p)),
    });
    P.add(xf(block(BACK - X, 0.2, L6, 0.01), [(X + BACK) / 2, 5.35, L6 / 2]), 'stone', { colorFn: travFn });
    P.add(xf(block(0.7, 0.45, L6, 0.01), [X, 8.75, L6 / 2]), 'stone', { colorFn: travFn });
    // roof: terracotta tiles in ridges, sloping up to the back wall
    P.add(grid(16, 6, (u, v) => {
      const x = lerp(X - 0.6, BACK + 0.2, v), z = u * L6;
      return V(x, 9.2 + (x - X) * 0.22 + 0.04 * Math.abs(Math.sin(u * Math.PI * 12)), z);
    }), 'terracotta', { colorFn: (p) => COL.terra.clone().lerp(COL.terraDk, clamp(fbm(p.x, p.y, p.z * 2) - 0.3)), noise: 0.1 });
    // back wall: red dado, cream above, a shop door in each bay
    P.add(xf(block(0.3, 9.6, L6, 0.01), [BACK, 0.35, L6 / 2]), 'plaster', {
      colorFn: (p) => {
        const door = Math.abs(p.z - L6 / 2) < 0.9 && p.y < 2.9;
        return door ? COL.woodDk.clone() : p.y < 1.5 ? COL.pompRed.clone() : COL.cream.clone().lerp(COL.whiteWash, 0.4);
      }, noise: 0.06,
    });
    pieces.push(P);
  }

  // ---- temple front (18 m wide along the square): a high podium with steps,
  // six tall columns, an entablature and a pediment, the cella behind
  {
    const P = new Piece('Forum_Temple');
    const X = 13, W = 18, D = 16, H = 3.0, Z0 = 0;
    P.add(xf(block(D, H, W, 0.03), [X + D / 2, 0, Z0 + W / 2]), 'stone', { colorFn: travFn, noise: 0.06 });
    for (let i = 0; i < 10; i++) P.add(xf(block(0.3, (i + 1) * 0.3, 9, 0.01), [X - 0.15 - (9 - i) * 0.3, 0, Z0 + W / 2]), 'stone', { colorFn: travFn });
    for (let i = 0; i < 6; i++) column(X + 1.2, H, Z0 + 1.6 + i * 2.96, 8.2, 0.48).forEach((g) => P.add(g, 'stone', { colorFn: travFn, noise: 0.05 }));
    P.add(xf(block(D - 0.6, 1.0, W - 0.4, 0.02), [X + D / 2, H + 8.6, Z0 + W / 2]), 'stone', { colorFn: travFn });
    // pediment: a triangle across the front, roof sloping back
    const pediment = new THREE.Shape([new THREE.Vector2(-W / 2, 0), new THREE.Vector2(W / 2, 0), new THREE.Vector2(0, 2.6)]);
    P.add(xf(new THREE.ExtrudeGeometry(pediment, { depth: D - 0.6, bevelEnabled: false }), [X + 0.3, H + 9.6, Z0 + W / 2], [0, Math.PI / 2, 0]), 'stone', { colorFn: travFn });
    for (const s of [1, -1]) P.add(grid(4, 12, (u, v) => V(lerp(X, X + D, v), H + 9.62 + 2.62 * (1 - u), Z0 + W / 2 + s * u * (W / 2 + 0.3))), 'terracotta', { color: COL.terra, noise: 0.1 });
    // the cella: a plastered block behind the columns, its door dark
    P.add(xf(block(D - 4, 8.6, W - 4, 0.02), [X + 2 + (D - 4) / 2, H, Z0 + W / 2]), 'plaster', {
      colorFn: (p) => (Math.abs(p.z - (Z0 + W / 2)) < 1.4 && p.y < H + 5 && p.x < X + 2.2 ? COL.woodDk.clone() : COL.cream.clone()), noise: 0.05,
    });
    pieces.push(P);
  }

  // ---- a free-standing honorific column on its plinth (it can topple across the square)
  {
    const P = new Piece('Forum_Column');
    P.add(block(1.1, 0.4, 1.1, 0.02), 'stone', { colorFn: travFn, noise: 0.06 });
    column(0, 0.4, 0, 6.0, 0.38).forEach((g) => P.add(g, 'stone', { colorFn: travFn, noise: 0.05 }));
    pieces.push(P);
  }

  // ---- entrance arch across the way in (at z = 0), with walls out to the colonnades
  {
    const P = new Piece('Forum_Gate');
    for (const s of [1, -1]) {
      P.add(xf(block(1.4, 6.2, 1.4, 0.03), [s * 4.9, 0, 0]), 'stone', { colorFn: travFn, noise: 0.06 });
      P.add(xf(block(7.6, 6.0, 0.7, 0.02), [s * 9.4, 0, 0]), 'plaster', { colorFn: (p) => (p.y < 1.4 ? COL.pompRed.clone() : COL.cream.clone()), noise: 0.06 });
    }
    // the arch, its keystone, and the attic above with a panel for an inscription
    const arch = new THREE.Shape();
    arch.moveTo(-5.6, 0); arch.lineTo(5.6, 0); arch.lineTo(5.6, 3.6); arch.lineTo(-5.6, 3.6); arch.lineTo(-5.6, 0);
    const hole = new THREE.Path();
    hole.moveTo(-4.2, -0.01); hole.absarc(0, -0.01, 4.2, 0, Math.PI, false); hole.lineTo(-4.2, -0.01);
    arch.holes.push(hole);
    P.add(xf(new THREE.ExtrudeGeometry(arch, { depth: 1.4, bevelEnabled: false, curveSegments: 24 }), [0, 6.2, -0.7]), 'stone', { colorFn: travFn, noise: 0.05 });
    P.add(xf(block(11.6, 1.6, 1.6, 0.03), [0, 9.8, 0]), 'stone', { colorFn: travFn, noise: 0.05 });
    P.add(xf(block(5, 0.9, 0.04, 0.01), [0, 10.15, 0.8]), 'stone', { color: travDk });
    pieces.push(P);
  }
}

// ================================================================== PEOPLE (fleeing crowds in the Forum)
// Simple, respectful figures: a body in a knee-length tunic with a belt and a
// bundle on the back (pale, so each person can be tinted a different colour),
// a head with hair, and a leg and an arm that swing (each its own piece,
// hung from the hip / shoulder at its origin, pointing down).
{
  const skin = C(0xc08a63), hair = C(0x3a2a1e), cloth = C(0xf2ede4), leather = COL.woodDk;
  const lathed = (pts, segs = 10) => lathe(pts, segs);
  {
    const P = new Piece('Person_Body');
    // tunic: shoulders down to the knees, belted at the waist
    P.add(xf(lathed([[0, 1.46], [0.12, 1.45], [0.19, 1.38], [0.17, 1.2], [0.15, 1.02], [0.2, 0.75], [0.22, 0.55], [0, 0.55]], 12), [0, 0, 0], [0, 0, 0], [1, 1, 0.75]), 'cloth', { color: cloth, noise: 0.08 });
    P.add(xf(new THREE.TorusGeometry(0.155, 0.02, 4, 14), [0, 1.03, 0], [Math.PI / 2, 0, 0], [1, 0.75, 1]), 'cloth', { color: leather });
    // a bundle tied on the back
    P.add(xf(new THREE.SphereGeometry(0.16, 8, 6), [0, 1.25, -0.2], [0, 0, 0], [1.1, 0.8, 0.7]), 'cloth', { color: C(0xcdbf9c), noise: 0.12 });
    pieces.push(P);
  }
  {
    const P = new Piece('Person_Head');
    P.add(xf(new THREE.CylinderGeometry(0.045, 0.05, 0.12, 8), [0, 1.5, 0]), 'cloth', { color: skin });
    P.add(xf(new THREE.SphereGeometry(0.1, 10, 8), [0, 1.62, 0.01], [0, 0, 0], [0.9, 1.1, 1]), 'cloth', { color: skin, noise: 0.05 });
    P.add(xf(new THREE.SphereGeometry(0.105, 10, 6, 0, TAU, 0, Math.PI * 0.55), [0, 1.63, -0.01], [-0.3, 0, 0]), 'cloth', { color: hair });
    pieces.push(P);
  }
  {
    const P = new Piece('Person_Leg');
    P.add(xf(new THREE.CylinderGeometry(0.065, 0.045, 0.85, 8), [0, -0.43, 0]), 'cloth', { color: skin, noise: 0.05 });
    P.add(xf(block(0.09, 0.06, 0.22, 0.02), [0, -0.9, 0.05]), 'cloth', { color: leather }); // sandal and foot
    pieces.push(P);
  }
  {
    const P = new Piece('Person_Arm');
    P.add(xf(new THREE.CylinderGeometry(0.045, 0.035, 0.6, 8), [0, -0.3, 0]), 'cloth', { color: skin, noise: 0.05 });
    P.add(xf(new THREE.SphereGeometry(0.045, 6, 5), [0, -0.62, 0]), 'cloth', { color: skin });
    pieces.push(P);
  }
}

// ================================================================== THE LARGE THEATRE (one set piece, built along the theatre route)
// Built in the route's own frame (the passage starts at the origin running
// towards -z, x to the right), from the same numbers and route maths as the
// game (THEATRE in config.js, path.js), so the floors meet the runner's feet.
// The seating is a half-circle round the orchestra, left of the stage; the
// runner crosses the stage, climbs onto a band of three broad steps through
// the seating, runs round it, and leaves by a vaulted exit (vomitorium).
{
  const T = THEATRE;
  const route = theatreRoute();
  const P = new Piece('Theatre');
  // the orchestra's centre: on the stage front line, ringRadius beyond where the tier starts
  const ringStart = route.pose(route.ringStart);
  const C = V(ringStart.point.x, 0, ringStart.point.z + T.ringRadius);
  const at = (r, phi, y) => V(C.x - r * Math.sin(phi), y, C.z - r * Math.cos(phi)); // phi 0 = far end of the stage
  const tuff = C_(0x9d8f78), travertine = C_(0xd9cdb5), seatLight = C_(0xcfc2a8), mortar = C_(0x6f6656);
  function C_(h) { return new THREE.Color(h); }
  const stoneFn = (base) => (p) => base.clone().multiplyScalar(0.9 + 0.18 * fbm(p.x * 0.8, p.y * 2, p.z * 0.8)).lerp(COL.ash, clamp(0.3 - p.y * 0.05) * 0.2);
  const BAND_IN = T.ringRadius - 1.5 * LANES.width, BAND_OUT = T.ringRadius + 1.5 * LANES.width;
  const laneOf = (r) => clamp(Math.floor((r - BAND_IN) / LANES.width), 0, 2);

  // Where the exit tunnel and the stairs cut through: samples along the route.
  const cut = [];
  for (let s = route.ringEnd - 1; s <= route.tunnelEnd + 2; s += 0.75) cut.push(route.pose(s).point.clone());
  const inCut = (p, w = 3.4) => cut.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < w);
  const stairs = [];
  for (let s = route.stageEnd; s <= route.stageEnd + T.rampIn; s += 0.5) stairs.push(route.pose(s).point.clone());
  const onStairs = (p) => stairs.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 2.9);

  // A ring sector between radii r0..r1 at height y (flat top), from phi0 to phi1.
  const SEGS = 72;
  function rowTop(r0, r1, y, colorFn, skip) {
    for (let i = 0; i < SEGS; i++) {
      const a0 = (i / SEGS) * Math.PI, a1 = ((i + 1) / SEGS) * Math.PI;
      const mid = at((r0 + r1) / 2, (a0 + a1) / 2, y);
      if (skip(mid)) continue;
      const g = new THREE.BufferGeometry();
      const pts = [at(r0, a0, y), at(r1, a0, y), at(r1, a1, y), at(r0, a1, y)];
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => p.toArray()), 3));
      g.setIndex([0, 2, 1, 0, 3, 2]);
      g.computeVertexNormals();
      P.add(g, 'stone', { colorFn, noise: 0.06, freq: 2 });
    }
  }
  // A riser: the vertical face at radius r from y0 up to y1, facing the orchestra.
  function riser(r, y0, y1, colorFn, skip) {
    for (let i = 0; i < SEGS; i++) {
      const a0 = (i / SEGS) * Math.PI, a1 = ((i + 1) / SEGS) * Math.PI;
      if (skip(at(r, (a0 + a1) / 2, y1))) continue;
      const g = new THREE.BufferGeometry();
      const pts = [at(r, a0, y0), at(r, a1, y0), at(r, a1, y1), at(r, a0, y1)];
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => p.toArray()), 3));
      g.setIndex([0, 2, 1, 0, 3, 2]);
      g.computeVertexNormals();
      P.add(g, 'stone', { colorFn, noise: 0.05, freq: 2 });
    }
  }
  // Seats: tuff and travertine rows, with lighter radial stairways (scalaria) between the wedges of seats.
  const seatFn = (p) => {
    const phi = Math.atan2(C.x - p.x, C.z - p.z), r = Math.hypot(p.x - C.x, p.z - C.z);
    const stair = [30, 60, 90, 120, 150].some((d) => Math.abs((phi * 180) / Math.PI - d) * (Math.PI / 180) * r < 0.55);
    return stoneFn(stair ? seatLight : Math.floor(r / T.rowDepth) % 2 ? tuff : travertine)(p);
  };
  const noSkip = () => false;
  const skipSeats = (p) => (Math.hypot(p.x - C.x, p.z - C.z) > T.ringRadius && inCut(p)) || onStairs(p); // the exit only cuts the seats above the band

  // ---- orchestra: a half-disc of pale paving below the stage, with three low wide steps round it
  for (let i = 0; i < SEGS; i++) {
    const a0 = (i / SEGS) * Math.PI, a1 = ((i + 1) / SEGS) * Math.PI;
    const g = new THREE.BufferGeometry();
    const pts = [C.clone().setY(T.orchestraDepth), at(T.firstRow - 1.5, a0, T.orchestraDepth), at(T.firstRow - 1.5, a1, T.orchestraDepth)];
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => p.toArray()), 3));
    g.setIndex([0, 2, 1]);
    g.computeVertexNormals();
    P.add(g, 'stone', { colorFn: stoneFn(C_(0xe6dccb)), noise: 0.05, freq: 1 });
  }
  for (let k = 0; k < 3; k++) {
    const r0 = T.firstRow - 1.5 + k * 0.5, y = T.orchestraDepth + 0.15 * (k + 1);
    rowTop(r0, r0 + 0.5, y, stoneFn(C_(0xe0d4bf)), noSkip);
    riser(r0, y - 0.15, y, stoneFn(C_(0xd2c5ad)), noSkip);
  }

  // ---- the seating: rows below the band, the band's three broad steps, rows above
  let y = T.orchestraDepth + 0.45;
  let r = T.firstRow;
  for (; r + T.rowDepth <= BAND_IN + 0.01; r += T.rowDepth) {
    y += T.rowRise;
    rowTop(r, r + T.rowDepth, y, seatFn, skipSeats);
    riser(r, y - T.rowRise, y, seatFn, skipSeats);
  }
  // the parapet (balteus) between the lower seats and the band
  const bandFloor = T.tierHeights;
  riser(BAND_IN, y, bandFloor[0] + 0.8, stoneFn(C_(0xc9b99a)), onStairs);
  rowTop(BAND_IN - 0.25, BAND_IN, bandFloor[0] + 0.8, stoneFn(C_(0xd8cbb0)), onStairs);
  // the band: one step per lane (built past where the stairs end; the stairs are their own ribbon)
  const rampEndPhi = (route.stageEnd + T.rampIn - route.ringStart) / T.ringRadius;
  const pastStairs = (p) => Math.atan2(C.x - p.x, C.z - p.z) < rampEndPhi;
  for (let l = 0; l < 3; l++) {
    const r0 = BAND_IN + l * LANES.width;
    rowTop(r0, r0 + LANES.width, bandFloor[l], stoneFn(l === 1 ? travertine : C_(0xd2c4a6)), pastStairs);
    riser(r0 + (l ? 0 : -0.25), l ? bandFloor[l - 1] : bandFloor[0] - 0.6, bandFloor[l], stoneFn(tuff), pastStairs);
  }
  // rows above the band, up to the top of the seating
  y = bandFloor[2];
  for (r = BAND_OUT; r + T.rowDepth <= T.outerRadius + 0.01; r += T.rowDepth) {
    y += T.rowRise;
    rowTop(r, r + T.rowDepth, y, seatFn, skipSeats);
    riser(r, y - T.rowRise, y, seatFn, skipSeats);
  }
  const top = y;
  // the height of the seating at a distance from the orchestra's centre
  function seatHeight(rr) {
    if (rr < T.firstRow) return T.orchestraDepth + 0.45;
    if (rr < BAND_IN) return T.orchestraDepth + 0.45 + T.rowRise * Math.ceil((rr - T.firstRow) / T.rowDepth);
    if (rr < BAND_OUT) return bandFloor[laneOf(rr)];
    return Math.min(top, bandFloor[2] + T.rowRise * Math.ceil((rr - BAND_OUT) / T.rowDepth));
  }
  // the outer wall round the top, with a cornice
  riser(T.outerRadius, T.orchestraDepth - 0.5, top + 1.4, stoneFn(C_(0xb8a88c)), (p) => inCut(p, 3.3));
  rowTop(T.outerRadius - 0.1, T.outerRadius + 0.5, top + 1.4, stoneFn(travertine), (p) => inCut(p, 3.3));
  // the seating's straight ends (analemmata) along the stage front, stepping up with the rows
  for (const end of [0, Math.PI]) {
    const g = grid(40, 1, (u, v) => {
      const rr = lerp(T.firstRow, T.outerRadius, u);
      return at(rr, end, v ? seatHeight(rr) + 0.3 : T.orchestraDepth - 0.5);
    });
    P.add(g, 'stone', { colorFn: stoneFn(C_(0xa89a80)), noise: 0.08 });
  }

  // ---- stairs from the stage up onto the band: a stepped ribbon along the route, one strip per lane
  const ribbon = (s0, s1, x0, x1, heightAt, mat, colorFn, step = 0.5) => {
    for (let s = s0; s < s1 - 1e-6; s += step) {
      const e = Math.min(s1, s + step);
      const a = route.pose(s), b = route.pose(e);
      const ra = forward(a.angle - Math.PI / 2, V(0, 0, 0)), rb = forward(b.angle - Math.PI / 2, V(0, 0, 0)); // right of the path
      const h = heightAt(s);
      const pts = [
        a.point.clone().addScaledVector(ra, x0).setY(h), a.point.clone().addScaledVector(ra, x1).setY(h),
        b.point.clone().addScaledVector(rb, x1).setY(h), b.point.clone().addScaledVector(rb, x0).setY(h),
      ];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => p.toArray()), 3));
      g.setIndex([0, 2, 1, 0, 3, 2]);
      g.computeVertexNormals();
      P.add(g, mat, { colorFn, noise: 0.05, freq: 2 });
      // its sides, down into the ground, so strips at different heights meet
      for (const [i0, i1] of [[0, 3], [1, 2]]) {
        const sk = [pts[i0], pts[i1], pts[i1].clone().setY(-0.3), pts[i0].clone().setY(-0.3)];
        const gs = new THREE.BufferGeometry();
        gs.setAttribute('position', new THREE.Float32BufferAttribute(sk.flatMap((p) => p.toArray()), 3));
        gs.setIndex([0, 1, 2, 0, 2, 3]);
        gs.computeVertexNormals();
        P.add(gs, mat, { colorFn: stoneFn(tuff), noise: 0.05 });
      }
      // the riser up to the next step
      const h2 = heightAt(e);
      if (Math.abs(h2 - h) > 1e-3) {
        const q = [
          b.point.clone().addScaledVector(rb, x0).setY(Math.min(h, h2)), b.point.clone().addScaledVector(rb, x1).setY(Math.min(h, h2)),
          b.point.clone().addScaledVector(rb, x1).setY(Math.max(h, h2)), b.point.clone().addScaledVector(rb, x0).setY(Math.max(h, h2)),
        ];
        const gr = new THREE.BufferGeometry();
        gr.setAttribute('position', new THREE.Float32BufferAttribute(q.flatMap((p) => p.toArray()), 3));
        gr.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]);
        gr.computeVertexNormals();
        P.add(gr, mat, { colorFn, noise: 0.05 });
      }
    }
  };
  const W = LANES.width;
  for (let l = 0; l < 3; l++) {
    const x0 = (l - 1) * W - W / 2, x1 = x0 + W;
    // stairs: steps of about 0.3 m, following the climb the runner makes
    ribbon(route.stageEnd, route.stageEnd + T.rampIn + 0.5, x0, x1, (s) => theatreFloor(s + 0.25, l), 'stone', stoneFn(travertine), 0.5);
    // where the steps even out past the band (a little above it, so it doesn't flicker against the band)
    ribbon(route.ringEnd, route.ringEnd + T.exitBlend, x0, x1, (s) => theatreFloor(s, l) + 0.02, 'stone', stoneFn(C_(0xbfb39b)), 0.5);
  }
  // the vomitorium's floor, sloping down to the street
  ribbon(route.ringEnd + T.exitBlend, route.tunnelEnd, -1.5 * W, 1.5 * W, (s) => theatreFloor(s, 1) + 0.02, 'stone', stoneFn(C_(0xbfb39b)), 1);

  // ---- the vomitorium: walls and a barrel vault along the exit tunnel
  const tunnelFloor = (s) => Math.min(theatreFloor(s, 0), theatreFloor(s, 1), theatreFloor(s, 2));
  const wallFn = (p) => (p.y - 0 < 0.9 ? C_(0x8a7d68) : C_(0xa39580)).clone().multiplyScalar(0.9 + 0.15 * fbm(p.x * 3, p.y * 3, p.z * 3));
  const tunnel = (s0, s1, halfWidth, wallH, floorAt) => {
    P.add(grid(Math.max(4, Math.ceil((s1 - s0) / 0.75)), 14, (u, v) => {
      const s = lerp(s0, s1, u), pose = route.pose(s);
      const right = forward(pose.angle - Math.PI / 2, V(0, 0, 0));
      const f = floorAt(s);
      // v 0..1 runs up the left wall, over the vault, down the right wall
      const k = v * 2 * (wallH + halfWidth * Math.PI / 2) / 2;
      let x, y;
      const vaultLen = (halfWidth * Math.PI) / 2;
      const t = v * (2 * wallH + 2 * vaultLen);
      if (t < wallH) { x = -halfWidth; y = t; }
      else if (t < wallH + 2 * vaultLen) { const a = Math.PI - (t - wallH) / halfWidth; x = Math.cos(a) * halfWidth; y = wallH + Math.sin(a) * halfWidth; }
      else { x = halfWidth; y = 2 * wallH + 2 * vaultLen - t; }
      void k;
      return pose.point.clone().addScaledVector(right, x).setY(f - 0.3 + y);
    }), 'plaster', { colorFn: wallFn, noise: 0.08, freq: 3 });
  };
  // the solid masonry round a tunnel (it fills the gap cut in the seats above),
  // and an arched portal at each end
  const shell = (s0, s1, halfWidth, wallH, floorAt, colorFn, ends = [s0, s1]) => {
    const outer = halfWidth + 1.2, roof = wallH + halfWidth + 1.0;
    const prof = [[-outer, -0.3], [-outer, roof], [outer, roof], [outer, -0.3]];
    P.add(grid(Math.max(2, Math.ceil((s1 - s0) / 2)), 3, (u, v) => {
      const s = lerp(s0, s1, u), pose = route.pose(s), right = forward(pose.angle - Math.PI / 2, V(0, 0, 0));
      const [x, y] = prof[Math.round(v * 3)];
      return pose.point.clone().addScaledVector(right, x).setY(floorAt(s) - 0.3 + y);
    }), 'stone', { colorFn, noise: 0.06, freq: 1 });
    for (const end of ends) {
      const wall = new THREE.Shape([new THREE.Vector2(-outer, -0.3), new THREE.Vector2(outer, -0.3), new THREE.Vector2(outer, roof), new THREE.Vector2(-outer, roof)]);
      const hole = new THREE.Path();
      hole.moveTo(-halfWidth, -0.29); hole.lineTo(halfWidth, -0.29); hole.lineTo(halfWidth, wallH); hole.absarc(0, wallH, halfWidth, 0, Math.PI, false); hole.lineTo(-halfWidth, -0.29);
      wall.holes.push(hole);
      const pose = route.pose(end);
      // the portal's arch voussoirs in pale travertine, the rest in courses of tuff
      P.add(xf(new THREE.ExtrudeGeometry(wall, { depth: 0.5, bevelEnabled: false, curveSegments: 12 }), pose.point.clone().setY(floorAt(end) - 0.3).toArray(), [0, pose.angle, 0]), 'stone', {
        colorFn: (p) => {
          const local = p.clone().sub(pose.point), right = forward(pose.angle - Math.PI / 2, V(0, 0, 0));
          const x = local.dot(right), y = p.y - floorAt(end) + 0.3;
          const ring = Math.hypot(x, Math.max(0, y - wallH)) < halfWidth + 0.55 && y > wallH - 0.2;
          return ring ? stoneFn(travertine)(p) : stoneFn(Math.floor(y / 0.55) % 2 ? C_(0xa08f74) : C_(0xb3a387))(p);
        }, noise: 0.05,
      });
    }
  };
  // retaining walls where the stairs and the exit cut through the seats
  const cutWall = (s0, s1, x, colorFn, minR = 0) => {
    P.add(grid(Math.ceil((s1 - s0) / 0.5), 1, (u, v) => {
      const s = lerp(s0, s1, u), pose = route.pose(s), right = forward(pose.angle - Math.PI / 2, V(0, 0, 0));
      const q = pose.point.clone().addScaledVector(right, x), rr = Math.hypot(q.x - C.x, q.z - C.z);
      const floor = theatreFloor(s, x < 0 ? 0 : 2);
      return q.setY(v && rr > minR ? Math.max(seatHeight(rr) + 0.15, floor + 0.4) : Math.min(floor, seatHeight(rr)) - 0.3);
    }), 'stone', { colorFn, noise: 0.06, freq: 2 });
  };
  const masonry = (p) => stoneFn(Math.floor(p.y / 0.55) % 2 ? C_(0x9f8e73) : C_(0xaf9f84))(p);
  tunnel(route.tunnelStart, route.tunnelEnd, 3.0, 2.5, tunnelFloor);
  for (const x of [-3.1, 3.1]) {
    cutWall(route.ringEnd, route.tunnelStart, x, masonry, BAND_OUT);
    cutWall(route.stageEnd + 1, route.stageEnd + T.rampIn + 1.5, x, masonry);
  }
  shell(route.tunnelStart, route.tunnelEnd, 3.0, 2.5, tunnelFloor, masonry);

  // ---- the vaulted passage (parodos) beside the seating, onto the stage, and its entrance in the outer wall
  const passage = (s) => 0;
  tunnel(0, route.passageEnd, 3.3, 3.0, passage);
  shell(0, route.passageEnd - 2, 3.3, 3.0, passage, masonry, [route.passageEnd - 2]); // its way in is the arch in the outer wall
  P.add(xf(new THREE.PlaneGeometry(6.6, route.passageEnd), [0, 0.001, -route.passageEnd / 2], [-Math.PI / 2, 0, 0]), 'stone', { colorFn: stoneFn(C_(0x8f8676)), noise: 0.1, freq: 2 });
  {
    // the theatre's outer wall across the entrance, with the passage's arch in it
    // (as wide as the opening off the junction square, between the houses' corners)
    const wall = new THREE.Shape([new THREE.Vector2(-4.6, 0), new THREE.Vector2(4.6, 0), new THREE.Vector2(4.6, 11), new THREE.Vector2(-4.6, 11)]);
    const hole = new THREE.Path();
    hole.moveTo(-3.3, -0.01); hole.lineTo(3.3, -0.01); hole.lineTo(3.3, 3.0); hole.absarc(0, 3.0, 3.3, 0, Math.PI, false); hole.lineTo(-3.3, -0.01);
    wall.holes.push(hole);
    P.add(xf(new THREE.ExtrudeGeometry(wall, { depth: 1.2, bevelEnabled: false, curveSegments: 16 }), [0, 0, -1.2]), 'stone', {
      colorFn: (p) => (p.y > 10.2 ? travertine.clone() : stoneFn(Math.floor(p.y / 0.6) % 2 ? C_(0xa08f74) : C_(0xb3a387))(p)), noise: 0.05,
    });
  }

  // ---- out of the vomitorium: a paved forecourt between low precinct walls, to the street
  {
    const mid = route.pose((route.tunnelEnd + route.length) / 2);
    const len = route.length - route.tunnelEnd;
    P.add(xf(block(9.2, 0.1, len, 0.01), mid.point.clone().setY(-0.08).toArray(), [0, mid.angle, 0]), 'stone', { colorFn: stoneFn(C_(0xb9ad96)), noise: 0.12, freq: 3 });
    const right = forward(mid.angle - Math.PI / 2, V(0, 0, 0));
    for (const side of [-1, 1]) {
      P.add(xf(block(0.6, 2.4, len, 0.03), mid.point.clone().addScaledVector(right, side * 4.4).setY(0).toArray(), [0, mid.angle, 0]), 'plaster', {
        colorFn: (p) => (p.y < 0.8 ? COL.pompRed.clone() : p.y > 2.25 ? travertine.clone() : C_(0xd9cdb5)), noise: 0.06,
      });
    }
  }

  // ---- the stage (pulpitum): a wooden floor from the stage front to the stage wall, its front wall with niches
  const stageZ0 = C.z + 24, stageZ1 = C.z - 24;
  P.add(xf(block(T.stageBack - C.x + 0.5, 0.12, stageZ0 - stageZ1, 0.01), [(C.x + T.stageBack) / 2, -0.12, (stageZ0 + stageZ1) / 2]), 'wood', {
    colorFn: (p) => COL.woodLt.clone().lerp(C_(0xb59a72), 0.4).multiplyScalar(0.9 + 0.12 * (Math.floor((p.z - stageZ1) / 0.3) % 2) + 0.1 * fbm(p.x, p.z * 4, 0)), noise: 0.1,
  });
  P.add(grid(48, 1, (u, v) => V(C.x, lerp(T.orchestraDepth, 0, v), lerp(stageZ0, stageZ1, u))), 'plaster', {
    colorFn: (p) => (Math.abs(((p.z % 2.4) + 2.4) % 2.4 - 1.2) < 0.45 ? COL.pompRedDk.clone() : C_(0xd8cdb6)), noise: 0.06,
  });

  // ---- the stage wall (scaenae frons): two storeys of columns and painted
  // panels, with three doorways (the royal door in the middle)
  const SX = T.stageBack;
  const frontFn = (p) => {
    const door = [0, 12, -12].some((dz) => Math.abs(p.z - (C.z + dz)) < (dz ? 1.3 : 2.1) && p.y < (dz ? 4.2 : 5.6));
    if (door) return COL.woodDk.clone().multiplyScalar(0.6);
    const panel = ((p.z % 4) + 4) % 4;
    if (p.y < 1.2) return C_(0x7d6a52);
    if (p.y < 7.4) return panel > 0.5 && panel < 3.5 ? (Math.floor(p.z / 4) % 2 ? COL.pompRed.clone() : COL.ochre.clone()) : C_(0xe8dfcc);
    return panel > 0.6 && panel < 3.4 ? C_(0x5d6f8a).lerp(C_(0xe8dfcc), 0.35) : C_(0xe8dfcc);
  };
  P.add(xf(block(1.2, T.stageWallHeight, stageZ0 - stageZ1, 0.02), [SX + 0.6, 0, (stageZ0 + stageZ1) / 2]), 'plaster', { colorFn: frontFn, noise: 0.05, freq: 1 });
  // columns in pairs in front of the wall, on a podium, two storeys with entablatures
  const marble = C_(0xece6da);
  const shaft = (x, y0, z, h, r) => {
    P.add(xf(lathe([[r, 0], [r * 0.86, h], [r * 1.15, h + 0.05], [0, h + 0.05]], 14), [x, y0, z]), 'stone', { color: marble, noise: 0.04 });
    P.add(xf(block(r * 2.6, 0.18, r * 2.6, 0.01), [x, y0 + h + 0.05, z]), 'stone', { color: marble });
  };
  P.add(xf(block(1.3, 1.2, stageZ0 - stageZ1, 0.02), [SX - 0.6, 0, (stageZ0 + stageZ1) / 2]), 'stone', { colorFn: stoneFn(travertine) });
  for (let z = stageZ1 + 2; z <= stageZ0 - 2; z += 4) {
    for (const dz of [-0.7, 0.7]) {
      shaft(SX - 0.7, 1.2, z + dz, 5.6, 0.26);
      shaft(SX - 0.6, 7.6, z + dz, 4.2, 0.2);
    }
  }
  P.add(xf(block(1.6, 0.6, stageZ0 - stageZ1, 0.02), [SX - 0.4, 7.0, (stageZ0 + stageZ1) / 2]), 'stone', { color: marble });
  P.add(xf(block(1.4, 0.6, stageZ0 - stageZ1, 0.02), [SX - 0.3, 12.0, (stageZ0 + stageZ1) / 2]), 'stone', { color: marble });
  // the stage's side walls (parascaenia), leaving the way in from the passage open
  P.add(xf(block(SX - C.x + 1.2, 9, 1.0, 0.02), [(C.x + SX) / 2, 0, stageZ1 - 0.5]), 'plaster', { colorFn: (p) => (p.y < 1.4 ? COL.pompRed.clone() : C_(0xd9cdb5)), noise: 0.06 });
  P.add(xf(block(SX - 3.3 + 1.2, 9, 1.0, 0.02), [(3.3 + SX) / 2 + 0.3, 0, stageZ0 + 0.5]), 'plaster', { colorFn: (p) => (p.y < 1.4 ? COL.pompRed.clone() : C_(0xd9cdb5)), noise: 0.06 });

  pieces.push(P);
}

// ================================================================== THEATRE OBSTACLES: a wicker basket left on the tiers (jump), a fallen painted scenery panel (go round)
{
  const P = new Piece('Basket');
  P.add(lathe([[0, 0], [0.26, 0.02], [0.32, 0.3], [0.34, 0.42], [0.3, 0.42], [0.28, 0.32], [0, 0.32]], 16), 'wood', {
    colorFn: (p) => C_b(0xb08a52).multiplyScalar(0.8 + 0.3 * (Math.floor(p.y / 0.05) % 2)), noise: 0.1,
  });
  P.add(xf(new THREE.SphereGeometry(0.26, 10, 6, 0, TAU, 0, Math.PI / 2), [0, 0.34, 0], [0, 0, 0], [1, 0.5, 1]), 'cloth', { color: C_b(0x9c5a3c), noise: 0.15 });
  pieces.push(P);
  function C_b(h) { return new THREE.Color(h); }
}
{
  const P = new Piece('Scenery_Panel');
  // a painted wooden flat, fallen and leaning on its frame across a lane
  P.add(xf(block(1.5, 2.2, 0.08, 0.01), [0, 0, 0], [-0.55, 0, 0]), 'wood', {
    colorFn: (p) => (p.y > 1.2 ? new THREE.Color(0x6b8fb0) : p.y > 0.5 ? new THREE.Color(0x8a9a5a) : new THREE.Color(0xd8c9a8)), noise: 0.12,
  });
  for (const s of [-1, 1]) P.add(xf(block(0.08, 1.4, 0.08, 0.01), [s * 0.7, 0, -0.5], [0.4, 0, 0]), 'wood', { color: COL.woodDk });
  pieces.push(P);
}

// ================================================================== PORTA STABIA (the south gate) and its collapsing arch
// The city wall across the street with a vaulted passage through it, in
// kit space: the wall's inner face at z = 0, its outer face at z = DEPTH.
// Opus incertum (lava and limestone pieces in mortar) with tufa blocks
// round the arch and framing the passage, a walkway with merlons on top.
{
  const P = new Piece('Porta_Stabia');
  const HALF = 3.2, SPRING = 4.4, TOP = 9.0, DEPTH = 12, SPAN = 26;
  const incertum = (p) => {
    const cell = vnoise(p.x * 1.6 + p.z * 0.7, p.y * 1.6, p.z * 1.6 - p.x * 0.3);
    const joint = Math.abs(fbm(p.x * 2.2 + 3, p.y * 2.2, p.z * 2.2) - 0.5) < 0.035;
    if (joint) return COL.mortar.clone().lerp(COL.limeDk, 0.4);
    const base = cell > 0.62 ? COL.lime : cell > 0.38 ? COL.rock : COL.basaltLt;
    return dustUp(base.clone().multiplyScalar(0.85 + 0.3 * vnoise(p.x * 7, p.y * 7, p.z * 7)), p.y, 1.6, 0.35);
  };
  const tuffBlocks = (p) => COL.tuff.clone().multiplyScalar(0.85 + 0.12 * (Math.floor(p.y / 0.55) % 2) + 0.1 * fbm(p.x * 4, p.y * 4, p.z * 4));
  // the wall either side of the passage
  for (const s of [-1, 1]) {
    P.add(xf(block(SPAN - HALF, TOP + 0.5, DEPTH, 0.05), [s * (HALF + SPAN) / 2, -0.5, DEPTH / 2]), 'stone', { colorFn: incertum, noise: 0.06 });
    // tufa blocks framing the passage on both faces
    for (const z of [-0.08, DEPTH + 0.08]) P.add(xf(block(1.1, SPRING + 0.5, 0.3, 0.02), [s * (HALF + 0.55), -0.5, z]), 'stone', { colorFn: tuffBlocks, noise: 0.05 });
  }
  // above the arch: solid wall with the vault cut out of its underside
  const over = new THREE.Shape();
  over.moveTo(-HALF, SPRING);
  over.absarc(0, SPRING, HALF, Math.PI, 0, true);
  over.lineTo(HALF, TOP);
  over.lineTo(-HALF, TOP);
  over.lineTo(-HALF, SPRING);
  P.add(new THREE.ExtrudeGeometry(over, { depth: DEPTH, bevelEnabled: false, curveSegments: 20 }), 'stone', { colorFn: incertum, noise: 0.06 });
  // voussoirs: a ring of tufa blocks round the arch on both faces
  const N = 15;
  for (const z of [-0.12, DEPTH + 0.12]) for (let i = 0; i < N; i++) {
    const a = (Math.PI * (i + 0.5)) / N, r = HALF + 0.45;
    P.add(xf(block(0.62, 0.9, 0.34, 0.03), [Math.cos(a) * r, SPRING + Math.sin(a) * r - 0.45, z], [0, 0, a - Math.PI / 2]), 'stone', { colorFn: tuffBlocks, noise: 0.06 });
  }
  // walkway with merlons along the top, on its inner and outer edges
  for (const z of [0.3, DEPTH - 0.3]) for (let x = -SPAN + 1; x <= SPAN - 1; x += 2.2) {
    P.add(xf(block(1.3, 1.1, 0.6, 0.03), [x, TOP, z]), 'stone', { colorFn: incertum, noise: 0.06 });
  }
  // cracks spreading from the crown of the arch: where it will give way
  for (const z of [-0.3, DEPTH + 0.3]) for (const x of [-1.1, 0.4, 1.5]) {
    P.add(xf(new THREE.PlaneGeometry(0.07, 1.7), [x, SPRING + HALF + 0.4, z], [0, 0, 0.35 * Math.sign(x)]), 'stone', { color: COL.mortar, noise: 0.05 });
  }
  pieces.push(P);
}
{
  // The section of the arch that gives way: a great lintel of tufa wedged
  // across the passage, with broken voussoirs and rubble on it. Its
  // underside is at y = 0 (the game drops it to just above a sliding runner).
  const P = new Piece('Gate_Collapse');
  const tuff = (p) => COL.tuff.clone().multiplyScalar(0.8 + 0.25 * fbm(p.x * 3, p.y * 3, p.z * 3));
  P.add(xf(block(6.7, 0.9, 1.1, 0.06, 2), [0, 0, 0], [0, 0, 0.05]), 'stone', { colorFn: tuff, noise: 0.08 });
  for (const [x, a] of [[-2.2, 0.5], [-0.6, -0.2], [0.9, 0.35], [2.4, -0.45]]) {
    P.add(xf(block(0.62, 0.9, 0.36, 0.03), [x, 0.85, rr(-0.2, 0.2)], [rr(-0.2, 0.2), 0, a]), 'stone', { colorFn: tuff, noise: 0.06 });
  }
  for (let i = 0; i < 26; i++) {
    P.add(xf(new THREE.IcosahedronGeometry(rr(0.08, 0.22), 0), [rr(-3, 3), rr(0.85, 1.3), rr(-0.5, 0.5)]), 'stone', { color: (i % 3 ? COL.lime : COL.rock).clone().multiplyScalar(rr(0.75, 1)), noise: 0.1 });
  }
  pieces.push(P);
}

// ================================================================== OUTSIDE THE WALLS (the finale): tombs, cypresses, vineyards, fields
// Family tombs lined the roads out of Roman towns, as they still do outside
// Porta Stabia: semicircular stone benches (scholae) where travellers could
// rest, altar tombs on stepped bases, and small temple-fronted tombs. Beyond
// them, vineyards on trellises, fields and cypresses. Kit space as for the
// street: +z along the road, built to stand beside it facing -x (towards the
// road when placed on the +x side; the layout turns them for the other side).
{
  // Country ground beside the road: grass, earth and stubble, 30 m long,
  // from the road's edge (x = 2.75) out to 40 m. One side; the layout mirrors it.
  const P = new Piece('Country_Ground_30m');
  P.add(grid(20, 15, (u, v) => {
    const x = lerp(2.75, 40, u ** 1.5), z = v * 30;
    return V(x, -0.03 + 0.25 * fbm(x * 0.08, 0, z * 0.08) * clamp((x - 5) / 6), z);
  }), 'plaster', {
    colorFn: (p) => {
      const n = fbm(p.x * 0.15, 1, p.z * 0.15), m = vnoise(p.x * 0.6, 2, p.z * 0.6);
      let c = n > 0.55 ? COL.grass.clone() : n > 0.4 ? COL.forest.clone().lerp(COL.grass, 0.5) : C(0x6e6142);
      if (p.x < 4) c = C(0x7d7360); // the road's dusty edge
      return c.multiplyScalar(0.85 + 0.3 * m);
    },
    noise: 0.12, freq: 1,
  });
  pieces.push(P);
}
{
  // Italian cypress: a dark green spindle, about 9 m.
  const P = new Piece('Cypress');
  P.add(lathe([[0.18, 0], [0.18, 0.6]], 8), 'wood', { color: COL.woodDk });
  P.add(grid(12, 16, (u, v) => {
    const a = u * TAU, y = lerp(0.5, 9, v);
    const r = 0.95 * Math.sin(Math.PI * Math.pow(v, 0.75)) * (1 - 0.15 * v) * (0.85 + 0.25 * vnoise(Math.cos(a) * 3, y * 1.5, Math.sin(a) * 3));
    return V(Math.cos(a) * r, y, Math.sin(a) * r);
  }, true), 'plaster', { colorFn: (p) => C(0x2c3a22).multiplyScalar(0.75 + 0.45 * vnoise(p.x * 4, p.y * 3, p.z * 4)), noise: 0.1 });
  pieces.push(P);
}
// Tufa and plaster colours for the tombs.
const tombTuff = (p) => COL.tuff.clone().multiplyScalar(0.82 + 0.22 * fbm(p.x * 3, p.y * 3, p.z * 3));
const tombPlaster = (p) => dustUp(COL.whiteWash.clone().lerp(COL.lime, 0.3 * fbm(p.x * 2, p.y * 2, p.z * 2)), p.y, 1.2, 0.4);
function inscription(P, x, y, z, w, rows = 3) {
  P.add(xf(new THREE.BoxGeometry(0.03, 0.12 * rows + 0.1, w), [x, y, z]), 'stone', { color: COL.lime.clone().multiplyScalar(1.1) });
  for (let r = 0; r < rows; r++) for (let i = 0; i < Math.floor(w / 0.09) - 1; i++) {
    if (vnoise(i * 3.1, r * 7.3, w) < 0.25) continue;
    P.add(xf(new THREE.BoxGeometry(0.01, 0.06, 0.05), [x - 0.02, y + 0.12 * (rows / 2 - r - 0.5), z - w / 2 + 0.09 * (i + 1)]), 'stone', { color: COL.limeDk.clone().multiplyScalar(0.6) });
  }
}
{
  // Schola tomb: a semicircular tufa bench open to the road, ending in
  // lion's paws, on a low podium; an inscribed stele behind.
  const P = new Piece('Tomb_Schola');
  P.add(xf(block(3.6, 0.35, 4.6, 0.03), [1.8, 0, 0]), 'stone', { colorFn: tombTuff });
  const R = 2.0, cx = 2.4;
  P.add(grid(24, 4, (u, v) => {
    const a = lerp(-Math.PI / 2, Math.PI / 2, u), r = lerp(R - 0.55, R, v);
    return V(cx + Math.cos(a) * r * 0.55, 0.35 + 0.48, Math.sin(a) * r);
  }), 'stone', { colorFn: tombTuff });
  P.add(grid(24, 3, (u, v) => {
    const a = lerp(-Math.PI / 2, Math.PI / 2, u);
    return V(cx + Math.cos(a) * R * 0.55, lerp(0.35, 1.45, v), Math.sin(a) * R);
  }), 'stone', { colorFn: tombTuff });
  P.add(grid(24, 1, (u, v) => {
    const a = lerp(-Math.PI / 2, Math.PI / 2, u), r = R - 0.55;
    return V(cx + Math.cos(a) * r * 0.55, lerp(0.35, 0.83, v), Math.sin(a) * r);
  }), 'stone', { colorFn: tombTuff });
  for (const s of [-1, 1]) {
    P.add(xf(block(0.5, 0.55, 0.5, 0.04), [0.6, 0.35, s * (R - 0.3)]), 'stone', { colorFn: tombTuff });
    P.add(xf(new THREE.SphereGeometry(0.16, 10, 6, 0, TAU, 0, Math.PI / 2), [0.42, 0.35, s * (R - 0.3)], [0, 0, 0], [1.2, 0.6, 1]), 'stone', { colorFn: tombTuff });
  }
  P.add(xf(block(0.35, 2.2, 0.7, 0.03), [cx + 1.25, 0.35, 0]), 'stone', { colorFn: tombPlaster });
  inscription(P, cx + 1.06, 1.9, 0, 0.6, 4);
  pieces.push(P);
}
{
  // Altar tomb: a stepped base with an altar-shaped monument, plastered
  // white, with bolster rolls on top and an inscription facing the road.
  const P = new Piece('Tomb_Altar');
  const W = 2.6;
  P.add(xf(block(W + 0.8, 0.3, W + 0.8, 0.03), [W / 2 + 0.4, 0, 0]), 'stone', { colorFn: tombTuff });
  P.add(xf(block(W + 0.4, 0.3, W + 0.4, 0.03), [W / 2 + 0.4, 0.3, 0]), 'stone', { colorFn: tombTuff });
  P.add(xf(block(W, 2.2, W, 0.04), [W / 2 + 0.4, 0.6, 0]), 'plaster', { colorFn: tombPlaster });
  P.add(xf(block(W + 0.25, 0.25, W + 0.25, 0.03), [W / 2 + 0.4, 2.8, 0]), 'plaster', { colorFn: tombPlaster });
  for (const s of [-1, 1]) P.add(xf(new THREE.CylinderGeometry(0.22, 0.22, W, 12), [W / 2 + 0.4, 3.27, s * (W / 2 - 0.2)], [0, 0, Math.PI / 2]), 'plaster', { colorFn: tombPlaster });
  P.add(xf(block(0.9, 0.25, 0.9, 0.03), [W / 2 + 0.4, 3.05, 0]), 'stone', { colorFn: tombTuff });
  inscription(P, 0.38, 1.7, 0, 1.4, 4);
  pieces.push(P);
}
{
  // Aedicula tomb: a podium carrying a small temple front, two columns and
  // a pediment framing an empty niche.
  const P = new Piece('Tomb_Aedicula');
  P.add(xf(block(3, 1.6, 3, 0.04), [1.9, 0, 0]), 'plaster', { colorFn: tombPlaster });
  inscription(P, 0.38, 0.85, 0, 1.6, 3);
  P.add(xf(block(2.4, 2.6, 2.6, 0.03), [2.2, 1.6, 0]), 'plaster', { colorFn: tombPlaster });
  P.add(xf(block(0.4, 1.9, 1.3, 0.02), [1.08, 1.85, 0]), 'stone', { color: COL.pompRedDk.clone().multiplyScalar(0.9) }); // the niche
  for (const s of [-1, 1]) P.add(xf(lathe([[0.17, 0], [0.13, 2.5], [0.2, 2.6], [0, 2.6]], 12), [0.75, 1.6, s * 1.0]), 'plaster', { colorFn: tombPlaster });
  P.add(xf(block(0.8, 0.3, 2.8, 0.02), [0.85, 4.2, 0]), 'plaster', { colorFn: tombPlaster });
  const ped = new THREE.Shape(); ped.moveTo(-1.45, 0); ped.lineTo(1.45, 0); ped.lineTo(0, 0.7); ped.lineTo(-1.45, 0);
  P.add(xf(new THREE.ExtrudeGeometry(ped, { depth: 0.8, bevelEnabled: false }), [0.45, 4.5, 0], [0, Math.PI / 2, 0]), 'plaster', { colorFn: tombPlaster });
  pieces.push(P);
}
{
  // A row of vines on a trellis: chestnut stakes, a cross wire, leafy masses
  // and dark grape clusters, 30 m along z.
  const P = new Piece('Vine_Row_30m');
  for (let z = 0.75; z < 30; z += 1.5) {
    P.add(xf(new THREE.CylinderGeometry(0.04, 0.05, 1.9, 5), [0, 0.95, z]), 'wood', { color: COL.woodDk });
    P.add(xf(new THREE.IcosahedronGeometry(0.55, 0), [rr(-0.1, 0.1), 1.55, z + 0.75], [0, 0, 0], [0.8, 0.6, 1.4]), 'plaster', { color: COL.forest.clone().lerp(COL.grass, rr(0, 0.8)), noise: 0.15 });
    if (rnd() < 0.5) P.add(xf(new THREE.IcosahedronGeometry(0.1, 0), [0.35 * (rnd() < 0.5 ? 1 : -1), 1.2, z + rr(0.3, 1.2)], [0, 0, 0], [1, 1.5, 1]), 'cloth', { color: C(0x3b2340) });
  }
  P.add(xf(new THREE.BoxGeometry(0.02, 0.02, 30), [0, 1.75, 15]), 'wood', { color: COL.woodDk });
  pieces.push(P);
}
{
  // A low dry-stone wall along a field, 30 m.
  const P = new Piece('Field_Wall_30m');
  P.add(xf(block(0.6, 0.9, 30, 0.12, 2), [0, 0, 15]), 'stone', {
    colorFn: (p) => (vnoise(p.x * 5, p.y * 5, p.z * 2) > 0.55 ? COL.rock : COL.lime).clone().multiplyScalar(0.8 + 0.25 * vnoise(p.z * 3, p.y * 9, 1)), noise: 0.15,
  });
  pieces.push(P);
}
{
  // A farmhouse (villa rustica) seen across the fields: plastered walls, a
  // tiled roof, a yard wall.
  const P = new Piece('Farmhouse');
  P.add(xf(block(10, 4.2, 7, 0.05), [5, 0, 0]), 'plaster', { colorFn: (p) => dustUp(COL.cream.clone().lerp(COL.ochre, 0.25), p.y, 1, 0.4) });
  const roof = new THREE.Shape(); roof.moveTo(-3.9, 0); roof.lineTo(3.9, 0); roof.lineTo(0, 1.8); roof.lineTo(-3.9, 0);
  P.add(xf(new THREE.ExtrudeGeometry(roof, { depth: 10.6, bevelEnabled: false }), [-0.3, 4.2, 0], [0, Math.PI / 2, 0]), 'terracotta', { color: COL.terra, noise: 0.1 });
  for (const z of [-2, 2]) P.add(xf(new THREE.BoxGeometry(0.05, 0.7, 0.6), [-0.02, 2.8, z]), 'wood', { color: COL.woodDk });
  P.add(xf(new THREE.BoxGeometry(0.05, 2.1, 1.3), [-0.02, 1.05, 0]), 'wood', { color: COL.woodDk });
  P.add(xf(block(0.4, 1.8, 9, 0.04), [-1, 0, 8]), 'plaster', { color: COL.cream.clone().multiplyScalar(0.85) });
  pieces.push(P);
}

// ================================================================== FRIGHTENED ANIMALS (the finale's fields)
// Farm animals bolting across the road: a body (with head) per kind, and one
// leg piece for all of them, scaled to each kind's legs and swung by the game.
// Built facing +z, origin on the ground under the body; the leg's top (its
// hip) is at its origin and it hangs to y = -1.
{
  const P = new Piece('Animal_Leg');
  P.add(xf(new THREE.CylinderGeometry(0.05, 0.035, 0.9, 6), [0, -0.45, 0]), 'cloth', { color: C(0xffffff), noise: 0.05 });
  P.add(xf(new THREE.CylinderGeometry(0.04, 0.05, 0.1, 6), [0, -0.95, 0]), 'cloth', { color: C(0x3a3330), noise: 0.05 });
  pieces.push(P);
}
// A lumpy ellipsoid (fleece, a belly, a head).
function lump(rx, ry, rz, bump = 0.12, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + bump * (vnoise(v.x * 4 + 9, v.y * 4, v.z * 4) - 0.5);
    p.setXYZ(i, v.x * rx * k, v.y * ry * k, v.z * rz * k);
  }
  g.computeVertexNormals();
  return g;
}
{
  // Sheep: a woolly fleece, a dark face and ears.
  const P = new Piece('Sheep_Body');
  P.add(xf(lump(0.3, 0.27, 0.5, 0.35), [0, 0.68, 0]), 'cloth', { colorFn: (p) => C(0xd9d2c2).multiplyScalar(0.8 + 0.3 * vnoise(p.x * 12, p.y * 12, p.z * 12)), noise: 0.1 });
  P.add(xf(lump(0.11, 0.13, 0.17, 0.1, 1), [0, 0.82, 0.55], [0.5, 0, 0]), 'cloth', { color: C(0x3b3430) });
  for (const s of [-1, 1]) P.add(xf(lump(0.08, 0.025, 0.04, 0, 0), [s * 0.12, 0.88, 0.5], [0, 0, s * 0.4]), 'cloth', { color: C(0x3b3430) });
  pieces.push(P);
}
{
  // Goat: lean, rough-coated, curved horns and a beard.
  const P = new Piece('Goat_Body');
  const coat = (p) => C(0x6b4f36).lerp(C(0x2e2620), vnoise(p.x * 6, p.y * 6, p.z * 3)).multiplyScalar(0.9 + 0.2 * vnoise(p.x * 20, p.y * 20, p.z * 20));
  P.add(xf(lump(0.2, 0.22, 0.48, 0.15), [0, 0.8, 0]), 'cloth', { colorFn: coat, noise: 0.1 });
  P.add(xf(lump(0.1, 0.12, 0.2, 0.1, 1), [0, 1.0, 0.55], [0.7, 0, 0]), 'cloth', { colorFn: coat });
  for (const s of [-1, 1]) {
    const pts = [V(s * 0.05, 1.1, 0.5), V(s * 0.09, 1.25, 0.42), V(s * 0.13, 1.28, 0.3)];
    P.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.025, 5), 'cloth', { color: C(0x8a7a62) });
  }
  P.add(xf(new THREE.ConeGeometry(0.04, 0.14, 5), [0, 0.86, 0.66], [Math.PI, 0, 0]), 'cloth', { color: C(0x2e2620) });
  pieces.push(P);
}
{
  // Ox: a big, heavy body, a dewlap, wide horns.
  const P = new Piece('Ox_Body');
  const hide = (p) => C(0x7a5a3e).lerp(C(0xb8a07c), clamp(0.5 - p.y + 0.6) * 0.3).multiplyScalar(0.85 + 0.25 * vnoise(p.x * 5, p.y * 5, p.z * 5));
  P.add(xf(lump(0.45, 0.5, 1.05, 0.08), [0, 1.2, 0]), 'cloth', { colorFn: hide, noise: 0.08 });
  P.add(xf(lump(0.2, 0.28, 0.32, 0.06, 1), [0, 1.3, 1.15], [0.5, 0, 0]), 'cloth', { colorFn: hide });
  P.add(xf(lump(0.1, 0.25, 0.2, 0.05, 1), [0, 0.95, 0.85]), 'cloth', { colorFn: hide }); // dewlap
  for (const s of [-1, 1]) {
    const pts = [V(s * 0.12, 1.5, 1.15), V(s * 0.4, 1.58, 1.18), V(s * 0.5, 1.75, 1.25)];
    P.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.04, 6), 'cloth', { color: C(0xd8ccb0) });
  }
  pieces.push(P);
}

// ================================================================== THE SHORE AT STABIAE (the finale's end)
// Sand right across the road's line, low dunes with tufts of grass further
// out; boats drawn up on the beach; the fleet's galleys offshore. Kit space
// as for the street (+z along the way, towards the sea).
{
  const P = new Piece('Beach_Sand_30m');
  P.add(grid(24, 10, (u, v) => {
    const x = lerp(-50, 50, u), z = v * 30, side = Math.abs(x);
    const dune = side > 12 ? 1.6 * smooth((side - 12) / 20) * (0.6 + 0.6 * fbm(x * 0.07, 0, z * 0.07)) : 0;
    return V(x, -0.02 + dune + 0.06 * vnoise(x * 0.4, 0, z * 0.4), z);
  }), 'stone', {
    colorFn: (p) => C(0xb5a588).lerp(C(0x8f8470), 0.4 * fbm(p.x * 0.2, 0, p.z * 0.2)).multiplyScalar(0.9 + 0.15 * vnoise(p.x * 3, 1, p.z * 3)),
    noise: 0.08, freq: 2,
  });
  // tufts of beach grass on the dunes
  for (let i = 0; i < 40; i++) {
    const s = rnd() < 0.5 ? -1 : 1, x = s * rr(14, 40), z = rr(0, 30);
    P.add(xf(new THREE.ConeGeometry(rr(0.25, 0.45), rr(0.4, 0.7), 5), [x, 0.6 + 1.2 * smooth((Math.abs(x) - 12) / 20), z]), 'plaster', { color: C(0x5d6a3c).multiplyScalar(rr(0.7, 1)), noise: 0.2 });
  }
  pieces.push(P);
}
// A hull along +z (bow at +z): half-round section, rising sheer at both
// ends; length L, beam B, depth D. Returns the planks as a geometry.
function hull(L, B, D, segs = 20) {
  return grid(segs, 8, (u, v) => {
    const z = (u - 0.5) * L, t = Math.abs(u - 0.5) * 2;
    const beam = B / 2 * Math.sqrt(Math.max(0, 1 - t ** 2.2)) + 0.02;
    const a = v * Math.PI; // from one gunwale under the keel to the other
    const sheer = D * (1 + 0.35 * t ** 2);
    return V(Math.cos(a) * beam, sheer - Math.sin(a) * D * (1 - 0.3 * t), z);
  });
}
{
  // A small fishing boat drawn up on the sand, about 6 m: planked hull, a
  // deck of boards, thwarts, two oars shipped, a short mast.
  const P = new Piece('Boat_Small');
  const L = 6, B = 1.9, D = 0.75;
  P.add(hull(L, B, D), 'wood', { colorFn: (p) => (p.y < 0.35 ? C(0x2b231d) : COL.wood.clone().lerp(COL.woodLt, 0.4 * vnoise(p.x * 3, p.y * 12, p.z))), noise: 0.12, freq: 8 });
  P.add(xf(new THREE.BoxGeometry(B * 0.8, 0.05, L * 0.75), [0, 0.52, 0]), 'wood', { color: COL.woodLt, noise: 0.15, freq: 10 }); // the deck the runner lands on
  for (const z of [-1.4, 0.2, 1.6]) P.add(xf(new THREE.BoxGeometry(B * 0.85, 0.06, 0.25), [0, 0.8, z]), 'wood', { color: COL.woodDk });
  for (const s of [-1, 1]) P.add(xf(new THREE.CylinderGeometry(0.035, 0.035, 4, 5), [s * 0.6, 0.9, 0], [Math.PI / 2, 0, s * 0.05]), 'wood', { color: COL.woodLt });
  P.add(xf(new THREE.CylinderGeometry(0.06, 0.07, 3.2, 6), [0, 2.3, 0.9]), 'wood', { color: COL.woodDk });
  // eyes painted on the bow, against bad luck
  for (const s of [-1, 1]) P.add(xf(new THREE.CircleGeometry(0.1, 8), [s * 0.42, 0.95, L / 2 - 0.55], [0, s * 1.2, 0]), 'plaster', { color: C(0xe8e0d0) });
  pieces.push(P);
}
{
  // A war galley of the fleet at Misenum (a quadrireme), about 30 m: a long
  // dark hull with a bronze ram, two banks of oars a side, a curved stern
  // post, a mast with its sail furled on the yard.
  const P = new Piece('Galley');
  const L = 30, B = 4.6, D = 2.2;
  P.add(hull(L, B, D, 36), 'wood', { colorFn: (p) => (p.y < 0.9 ? C(0x1f1a17) : p.y > D - 0.35 ? COL.pompRedDk.clone() : C(0x4b3a2c).multiplyScalar(0.85 + 0.25 * vnoise(p.z * 2, p.y * 6, 0))), noise: 0.1 });
  P.add(xf(new THREE.BoxGeometry(B * 0.9, 0.12, L * 0.85), [0, D - 0.1, 0]), 'wood', { color: COL.wood });
  P.add(xf(new THREE.ConeGeometry(0.45, 2.4, 4), [0, 0.5, L / 2 + 0.9], [-Math.PI / 2, Math.PI / 4, 0]), 'metal', { color: COL.bronze }); // the ram
  // the stern post curling up and forward (the aplustre)
  const curl = [];
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI * 1.2; curl.push(V(0, D + 0.6 + Math.sin(a) * 2.2, -L / 2 - 0.3 + (1 - Math.cos(a)) * 1.3 - 1.3)); }
  P.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curl), 16, 0.16, 6), 'wood', { color: C(0x4b3a2c) });
  // oars: two banks a side, dipping to the water
  for (const s of [-1, 1]) for (const bank of [0, 1]) for (let i = 0; i < 16; i++) {
    const z = -L * 0.36 + i * (L * 0.72 / 15) + bank * 0.4;
    P.add(xf(new THREE.BoxGeometry(0.07, 0.07, 6), [s * (B / 2 + 2.4 + bank * 0.5), D - 1.0 - bank * 0.3, z], [0, Math.PI / 2, s * (0.45 + bank * 0.1)]), 'wood', { color: COL.woodLt });
  }
  // mast, yard and furled sail
  P.add(xf(new THREE.CylinderGeometry(0.16, 0.2, 13, 8), [0, D + 6.5, 2]), 'wood', { color: COL.woodDk });
  P.add(xf(new THREE.CylinderGeometry(0.12, 0.12, 14, 6), [0, D + 11.5, 2], [0, 0, Math.PI / 2]), 'wood', { color: COL.woodDk });
  P.add(xf(new THREE.CylinderGeometry(0.35, 0.35, 12.5, 8), [0, D + 11.1, 2], [0, 0, Math.PI / 2]), 'cloth', { color: C(0xd8ccb0), noise: 0.15 });
  pieces.push(P);
}

// ================================================================== THE GREAT PALAESTRA (a district)
// The exercise ground beside the amphitheatre: a wide field of beaten earth
// in a walled square, porticoes along its sides, double rows of plane trees
// shading them, a swimming pool (natatio) in the middle. Kit space as for the
// street: +z along the way; the way across it is five lanes wide.
const PAL = { wall: 27, portico: 21.5, sand: C(0xb9a47e), sandDk: C(0x9c8762) };
// The field: rectangles [x0, x1, z0, z1] of beaten earth (the pool's chunk leaves a hole for it).
function palaestraGround(name, rects) {
  const P = new Piece(name);
  for (const [x0, x1, z0, z1] of rects) {
    P.add(grid(Math.max(1, Math.round((x1 - x0) / 3)), Math.max(1, Math.round((z1 - z0) / 3)), (u, v) => {
      const x = lerp(x0, x1, u), z = lerp(z0, z1, v);
      return V(x, -0.02 + 0.03 * vnoise(x * 0.37, 0, z * 0.27), z);
    }), 'stone', {
      colorFn: (p) => {
        const worn = 1 - smooth((Math.abs(p.x) - 4.5) / 3); // the runners' track, trodden paler
        return PAL.sand.clone().lerp(PAL.sandDk, 0.5 * fbm(p.x * 0.15, 0, p.z * 0.15)).lerp(C(0xcdbb95), 0.45 * worn);
      },
      noise: 0.1, freq: 2,
    });
  }
  pieces.push(P);
}
palaestraGround('Palaestra_Ground_30m', [[-PAL.wall, PAL.wall, 0, 30]]);
palaestraGround('Palaestra_Ground_Pool_30m', [[-PAL.wall, -12.8, 0, 30], [-5.6, PAL.wall, 0, 30], [-12.8, -5.6, 0, 2.4], [-12.8, -5.6, 27.6, 30]]);
{
  // One side's portico along 30 m (built on the +x side; turned for the other):
  // a stylobate, ten stuccoed brick columns (red below, white above), a beam,
  // a tiled lean-to roof up to the high back wall.
  const P = new Piece('Palaestra_Portico_30m');
  const X = PAL.portico, BACK = PAL.wall, H = 4.6;
  P.add(xf(block(BACK - X + 0.8, 0.3, 30, 0.02), [(X - 0.8 + BACK) / 2, 0, 15]), 'stone', { color: COL.lime, noise: 0.06 });
  for (let i = 0; i < 10; i++) {
    const z = 1.5 + i * 3;
    P.add(xf(lathe([[0.3, 0], [0.3, H * 0.35], [0.27, H * 0.36], [0.25, H], [0, H]], 12), [X, 0.3, z]), 'plaster', {
      colorFn: (p) => (p.y < 0.3 + H * 0.35 ? COL.pompRed.clone() : COL.whiteWash.clone()), noise: 0.05,
    });
    P.add(xf(block(0.75, 0.22, 0.75, 0.01), [X, 0.3 + H, z]), 'plaster', { color: COL.whiteWash });
  }
  P.add(xf(block(0.6, 0.5, 30, 0.01), [X, 0.52 + H, 15]), 'plaster', { color: COL.cream });
  P.add(grid(4, 20, (u, v) => {
    const x = lerp(X - 0.7, BACK + 0.1, u), z = v * 30;
    return V(x, 1.0 + H + (x - X) * 0.28 + 0.04 * Math.abs(Math.sin(v * Math.PI * 60)), z);
  }), 'terracotta', { colorFn: (p) => COL.terra.clone().lerp(COL.terraDk, clamp(fbm(p.x, p.y, p.z * 2) - 0.3)), noise: 0.1 });
  // its underside, seen from the field: boards on rafters (u and v swapped, so it faces down)
  P.add(grid(20, 4, (v, u) => {
    const x = lerp(X - 0.7, BACK + 0.1, u), z = v * 30;
    return V(x, 0.97 + H + (x - X) * 0.28, z);
  }), 'wood', { colorFn: (p) => (Math.abs(((p.z % 1.5) + 1.5) % 1.5 - 0.75) < 0.1 ? COL.woodDk.clone() : COL.wood.clone()), noise: 0.15 });
  // the back (outer) wall: red dado, cream above, a little higher than the roof
  P.add(xf(block(0.5, 8, 30, 0.01), [BACK + 0.25, 0, 15]), 'plaster', {
    colorFn: (p) => (p.y < 1.3 ? COL.pompRed.clone() : COL.cream.clone().lerp(COL.whiteWash, 0.3 * vnoise(p.z * 0.3, p.y * 0.3, 0))), noise: 0.06,
  });
  pieces.push(P);
}
{
  // A plane tree (Platanus orientalis): a pale mottled trunk forking into
  // a broad, lumpy crown, about 11 m.
  const P = new Piece('Plane_Tree');
  const bark = (p) => C(0xa49a84).lerp(C(0x6d6a55), smooth(vnoise(p.x * 6, p.y * 3, p.z * 6) * 1.6 - 0.4));
  P.add(lathe([[0.35, 0], [0.28, 1.2], [0.24, 3.6], [0, 3.8]], 10), 'wood', { colorFn: bark, noise: 0.05 });
  for (const [dx, dz] of [[1, 0.3], [-0.8, 0.6], [0.1, -1]]) {
    const g = new THREE.CylinderGeometry(0.1, 0.18, 3.2, 7);
    g.translate(0, 1.6, 0).rotateZ(-dx * 0.45).rotateX(dz * 0.45).translate(0, 3.4, 0);
    P.add(g, 'wood', { colorFn: bark });
  }
  for (const [x, y, z, r] of [[0, 7.6, 0, 3.4], [2.2, 6.6, 0.8, 2.6], [-2.1, 6.8, 0.6, 2.5], [0.4, 6.4, -2.2, 2.6], [-0.6, 9.2, 0.2, 2.2], [1.4, 8.6, -1.2, 2.0]]) {
    P.add(xf(lump(r, r * 0.72, r, 0.35, 1), [x, y, z]), 'plaster', {
      colorFn: (p) => C(0x4a5e2c).lerp(C(0x7a8a42), smooth((p.y - 5.5) / 5)).multiplyScalar(0.7 + 0.45 * vnoise(p.x * 1.5, p.y * 1.5, p.z * 1.5)),
      noise: 0.15,
    });
  }
  pieces.push(P);
}
{
  // The swimming pool (natatio), 24 x 6 m beside the track (built on the -x
  // side, its near edge at x = -6.2): a raised marble rim round still water.
  // (The water lies just above the game's plain ground, at -0.1, which
  // hides anything deeper; matte, so it reads as water under an ash-dark sky.)
  const P = new Piece('Palaestra_Pool');
  const X0 = -6.2, X1 = -12.2, Z0 = 3, Z1 = 27, xc = (X0 + X1) / 2, zc = (Z0 + Z1) / 2;
  for (const [w, d, x, z] of [[X0 - X1 + 1.2, 0.6, xc, Z0 - 0.3], [X0 - X1 + 1.2, 0.6, xc, Z1 + 0.3], [0.6, Z1 - Z0, X0 + 0.3, zc], [0.6, Z1 - Z0, X1 - 0.3, zc]]) {
    P.add(xf(block(w, 0.3, d, 0.02), [x, -0.05, z]), 'stone', { color: C(0xe8e2d4), noise: 0.05 });
  }
  P.add(xf(new THREE.PlaneGeometry(X0 - X1, Z1 - Z0), [xc, -0.06, zc], [-Math.PI / 2, 0, 0]), 'plaster', { colorFn: (p) => C(0x3f8a92).lerp(C(0x7fb8b4), 0.4 * vnoise(p.x * 0.8, 0, p.z * 0.4)), noise: 0.04 });
  pieces.push(P);
}
{
  // The wall across the way in (z = 0) with its wide gateway, out to the side walls.
  const P = new Piece('Palaestra_Gate');
  const open = 5.6, H = 6.5;
  for (const s of [1, -1]) {
    P.add(xf(block(1.3, H + 0.6, 1.3, 0.03), [s * (open + 0.65), 0, 0]), 'stone', { color: COL.lime, noise: 0.06 });
    P.add(xf(block(PAL.wall - open - 1.3, H, 0.6, 0.02), [s * (open + 1.3 + (PAL.wall - open - 1.3) / 2), 0, 0]), 'plaster', {
      colorFn: (p) => (p.y < 1.3 ? COL.pompRed.clone() : COL.cream.clone()), noise: 0.06,
    });
  }
  P.add(xf(block(2 * open + 2.6, 1.1, 1.3, 0.03), [0, H + 0.6, 0]), 'stone', { color: COL.lime, noise: 0.05 });
  P.add(xf(block(5, 0.7, 0.04, 0.01), [0, H + 0.8, 0.66]), 'stone', { color: COL.limeDk });
  pieces.push(P);
}

// ================================================================== EXPORT
const scene = new THREE.Scene();
let total = 0;
for (const p of pieces) { const g = p.build(); scene.add(g); total += g.userData.tris; console.log(`${p.name.padEnd(16)} ${String(Math.round(g.userData.tris)).padStart(7)} tris, ${g.children.length} draw calls`); }
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync('pompeii-kit.glb', Buffer.from(glb));
console.log(`pompeii-kit.glb: ${(glb.byteLength / 1048576).toFixed(2)} MB, ${pieces.length} pieces, ${Math.round(total)} tris total`);
