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

// ================================================================== STEPPING STONES (jump obstacle)
{
  const P = new Piece('SteppingStones');
  for (const x of [-1.8, 0, 1.8]) {
    const s = new THREE.Shape(); s.absellipse(0, 0, 0.42, 0.3, 0, TAU);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.36, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3, curveSegments: 24 });
    xf(g, [x, -0.06, 0], [-Math.PI / 2, 0, 0]);
    P.add(g, 'stone', { colorFn: p => COL.lime.clone().lerp(COL.chip, smooth((p.y - 0.25) * 6) * 0.35).multiplyScalar(0.92), noise: 0.1, freq: 7 });
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

// ================================================================== COLUMN (stuccoed brick, Pompeian red base)
{
  const P = new Piece('Column');
  const H = 3.6, R0 = 0.27, R1 = 0.235;
  P.add(grid(48, 40, (u, v) => {
    const a = u * TAU, y = 0.25 + v * (H - 0.6), r = lerp(R0, R1, v);
    const flute = y > 0.25 + (H - 0.6) / 3 ? 0.012 * Math.abs(Math.cos(a * 10)) : 0;
    return V(Math.sin(a) * (r - flute), y, Math.cos(a) * (r - flute));
  }, true), 'plaster', {
    colorFn: p => {
      let c = p.y < 0.25 + (H - 0.6) / 3 ? COL.pompRed.clone() : COL.whiteWash.clone();
      if (fbm(p.x * 4, p.y * 1.2, p.z * 4 + 5) > 0.63) c = COL.brick.clone();
      return dustUp(c, p.y, 0.8, 0.3);
    }, noise: 0.06,
  });
  P.add(block(0.68, 0.25, 0.68, 0.03), 'stone', { color: COL.lime, noise: 0.1 });
  P.add(xf(lathe([[R1, 0], [R1 + 0.02, 0.04], [0.33, 0.14], [0.34, 0.16], [0, 0.16]], 32), [0, H - 0.35, 0]), 'plaster', { color: COL.whiteWash, noise: 0.06 });
  P.add(xf(block(0.72, 0.2, 0.72, 0.02), [0, H - 0.19, 0]), 'plaster', { color: COL.whiteWash, noise: 0.06 });
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

// ================================================================== EXPORT
const scene = new THREE.Scene();
let total = 0;
for (const p of pieces) { const g = p.build(); scene.add(g); total += g.userData.tris; console.log(`${p.name.padEnd(16)} ${String(Math.round(g.userData.tris)).padStart(7)} tris, ${g.children.length} draw calls`); }
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync('pompeii-kit.glb', Buffer.from(glb));
console.log(`pompeii-kit.glb: ${(glb.byteLength / 1048576).toFixed(2)} MB, ${pieces.length} pieces, ${Math.round(total)} tris total`);
