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

// ================================================================== STATUES (on pedestals; the figure is its own piece so it can topple)
// Figures are modelled about 1.8 m tall facing +z (left hand at +x), feet at
// y = 0, then scaled by FIG to slightly larger than life. Sculpted from
// smooth shapes: an anatomical torso, limbs that swell and taper like
// muscles, heads with features and curly hair, hands with fingers, and
// cloth with deep folds.
{
  const FIG = 1.12;
  const Y = V(0, 1, 0);
  const marble = C(0xe8e2d6), marbleShade = C(0xc7bfb0), purple = C(0x5b2a5e);
  // Old bronze: dark brown, streaked green where rain ran down it.
  const bronzeDark = C(0x3f3021), verdigris = C(0x4f7a66);
  const bronzeFn = p => bronzeDark.clone().lerp(verdigris, clamp((fbm(p.x * 7, p.y * 2.5, p.z * 7) - 0.42) * 2.4) * 0.7)
    .multiplyScalar(0.9 + 0.2 * clamp(p.y / 2.2));
  const marbleFn = p => marble.clone().lerp(marbleShade, clamp((fbm(p.x * 9 + 3, p.y * 3, p.z * 9) - 0.5) * 2.5) * 0.6)
    .lerp(COL.ash, clamp(1 - p.y / 0.6) * 0.25);
  // a deterministic 0–1 sequence (golden ratio), for curls
  const seq = (i, k = 0) => ((i + 1) * (0.6180339887 + k * 0.1234567) + k * 0.31) % 1;

  // A frame (two axes across) for a direction d.
  const across = (d) => {
    const ref = Math.abs(d.y) > 0.9 ? V(0, 0, 1) : V(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(d, ref).normalize();
    return [u, new THREE.Vector3().crossVectors(u, d).normalize()];
  };
  // A limb from a to b whose radius follows `radii` (muscle swell), slightly
  // flattened across `flat`. Open ends: joints are covered by balls.
  const tube = (a, b, radii, flat = 0.88, around = 14) => {
    const A = V(...a), d = V(...b).sub(A), len = d.length();
    d.normalize();
    const [u, v] = across(d);
    const n = radii.length - 1, rows = n * 3;
    return grid(around, rows, (s, t) => {
      const x = t * n, i = Math.min(n - 1, Math.floor(x)), f = smooth(x - i);
      const r = lerp(radii[i], radii[i + 1], f), a2 = s * TAU;
      return A.clone().addScaledVector(d, t * len).addScaledVector(u, Math.cos(a2) * r).addScaledVector(v, Math.sin(a2) * r * flat);
    }, true);
  };
  const ball = (c, r, s = [1, 1, 1], rot = [0, 0, 0]) => xf(new THREE.SphereGeometry(r, 14, 10), c, rot, s);
  const bead = (c, r, s = [1, 1, 1]) => xf(new THREE.IcosahedronGeometry(r, 0), c, [0, 0, 0], s); // small and cheap: curls, fingertips
  // an ellipsoid stretched along the direction from a to b
  const pod = (a, b, r, s = [1, 1]) => {
    const A = V(...a), d = V(...b).sub(A), len = d.length();
    const g = new THREE.SphereGeometry(1, 12, 8);
    g.scale(r * s[0], len / 2, r * s[1]);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, d.normalize()));
    return g.translate(...A.addScaledVector(d, len / 2).toArray());
  };

  // The torso, hips to neck, as a surface: oval sections of the right width
  // and depth at each height, with the chest, shoulder blades, belly and
  // buttocks pushing out. `clothed` smooths it (a tunic).
  function torso(hip, tilt = [0, 0], clothed = false) {
    const H = [ // height above the hips: half-width, half-depth
      [-0.1, 0.11, 0.1], [0, 0.165, 0.12], [0.1, 0.155, 0.11], [0.2, 0.14, 0.104],
      [0.3, 0.15, 0.112], [0.4, 0.168, 0.12], [0.48, 0.18, 0.118], [0.54, 0.19, 0.1], [0.6, 0.11, 0.07], [0.64, 0.065, 0.06],
    ];
    const g = grid(40, 30, (s, t) => {
      const y = lerp(H[0][0], H[H.length - 1][0], t);
      let k = 0;
      while (k < H.length - 2 && H[k + 1][0] < y) k++;
      const f = smooth((y - H[k][0]) / (H[k + 1][0] - H[k][0]));
      const w = lerp(H[k][1], H[k + 1][1], f), dpt = lerp(H[k][2], H[k + 1][2], f);
      const a = s * TAU, cx = Math.sin(a), cz = Math.cos(a);
      let x = cx * w, z = cz * dpt;
      if (!clothed) {
        const front = Math.max(0, cz), back = Math.max(0, -cz);
        z += front * 0.022 * Math.exp(-(((y - 0.44) / 0.05) ** 2)) * Math.exp(-(((Math.abs(x) - 0.085) / 0.06) ** 2)); // chest
        z += front * 0.006 * Math.sin(y * 42) * (y > 0.12 && y < 0.34 ? 1 : 0) * Math.exp(-((x / 0.05) ** 2)); // belly
        z -= front * 0.008 * Math.exp(-((x / 0.012) ** 2)) * (y > 0.1 && y < 0.4 ? 1 : 0); // the line down the middle
        z -= back * 0.025 * Math.exp(-(((y - 0.03) / 0.07) ** 2)) * Math.exp(-(((Math.abs(x) - 0.07) / 0.06) ** 2)); // buttocks
        z -= back * 0.012 * Math.exp(-(((y - 0.46) / 0.07) ** 2)) * Math.exp(-(((Math.abs(x) - 0.09) / 0.05) ** 2)); // shoulder blades
        z += back * 0.01 * Math.exp(-((x / 0.015) ** 2)) * (y > 0.1 && y < 0.5 ? 1 : 0); // the spine's groove
      } else {
        z += Math.max(0, cz) * 0.008 * Math.sin(a * 9 + y * 6); // soft folds
      }
      return V(x, y, z);
    }, true);
    return xf(g, hip, [tilt[0], 0, tilt[1]]);
  }

  // A head facing +z with skull, jaw, brow, nose, lips, cheeks, ears and
  // hair of `curl` size (0 = short and close). rot: [x, y, z] turn.
  function head(center, rot, hair = { curl: 0.024, n: 60, beard: false }) {
    const parts = [
      ball([0, 0.02, -0.01], 0.104, [0.9, 1.08, 1.04]), // skull
      ball([0, -0.03, 0.035], 0.08, [0.82, 1.08, 0.88]), // face
      ball([0, -0.078, 0.03], 0.058, [1.0, 0.62, 0.9]), // jaw
      ball([0, -0.098, 0.066], 0.024, [1.1, 0.9, 0.9]), // chin
      ball([0, 0.026, 0.084], 0.05, [1.2, 0.24, 0.4]), // brow
      ball([0, -0.012, 0.104], 0.018, [0.75, 1.55, 0.95], [-0.25, 0, 0]), // nose
      ball([0, -0.062, 0.093], 0.02, [1.45, 0.5, 0.6]), // lips
    ];
    for (const s of [1, -1]) {
      parts.push(ball([s * 0.046, -0.022, 0.07], 0.03, [1, 0.8, 0.8])); // cheek
      parts.push(ball([s * 0.096, -0.005, -0.005], 0.03, [0.38, 1.05, 0.7])); // ear
    }
    // hair: a cap over the top and back of the skull, covered in curls,
    // with the hairline across the forehead
    const cap = V(0, 0.042, -0.022), capR = V(0.1, 0.108, 0.108);
    parts.push(ball(cap.toArray(), 1, capR.toArray()));
    for (let i = 0; i < hair.n; i++) {
      const yv = lerp(-0.2, 1, seq(i)), az = seq(i, 1) * TAU;
      const r = Math.sqrt(1 - yv * yv), dir = V(Math.sin(az) * r, yv, Math.cos(az) * r);
      if (dir.z > 0.55 && dir.y < 0.35) continue; // the face
      const size = (hair.curl || 0.014) * (0.8 + 0.4 * seq(i, 2));
      const at = cap.clone().add(V(dir.x * capR.x, dir.y * capR.y, dir.z * capR.z)).addScaledVector(dir, size * 0.25);
      parts.push(bead(at.toArray(), size, [1, 0.8, 1]));
    }
    if (hair.beard) for (let i = 0; i < 26; i++) {
      const a = lerp(-1.4, 1.4, seq(i, 3)), down = seq(i, 4);
      parts.push(bead([Math.sin(a) * 0.06, -0.06 - down * 0.05, 0.03 + Math.cos(a) * 0.045], 0.016));
    }
    const m = new THREE.Matrix4().compose(V(...center), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), V(1, 1, 1));
    return parts.map((g) => g.applyMatrix4(m));
  }

  // A hand at the end of the forearm (elbow → wrist): palm and fingers
  // carry on along the arm, slightly curled; the thumb along `thumbSide`.
  function hand(elbow, wrist, curl = 0.4, thumbSide = 1) {
    const W = V(...wrist), d = W.clone().sub(V(...elbow)).normalize();
    const [u, v] = across(d);
    const at = (along, side, lift) => W.clone().addScaledVector(d, along).addScaledVector(u, side).addScaledVector(v, lift);
    const parts = [pod(at(0, 0, 0).toArray(), at(0.09, 0, 0).toArray(), 0.034, [1.25, 0.55])];
    for (let k = 0; k < 4; k++) {
      const side = (k - 1.5) * 0.017;
      const base = at(0.085, side, 0);
      const mid = base.clone().addScaledVector(d, 0.04).addScaledVector(v, curl * 0.02);
      const tip = mid.clone().addScaledVector(d, 0.03 * (1 - curl * 0.5)).addScaledVector(v, curl * 0.03);
      parts.push(tube(base.toArray(), mid.toArray(), [0.009, 0.008], 1, 5), tube(mid.toArray(), tip.toArray(), [0.008, 0.007], 1, 5), bead(tip.toArray(), 0.007));
    }
    const tb = at(0.02, thumbSide * 0.03, 0.005), tt = tb.clone().addScaledVector(d, 0.045).addScaledVector(u, thumbSide * 0.02).addScaledVector(v, 0.012);
    parts.push(tube(tb.toArray(), tt.toArray(), [0.011, 0.008], 1, 5), bead(tt.toArray(), 0.008));
    return parts;
  }

  // A foot from the ankle towards `toe` (a point on or near the ground).
  function foot(ankle, toe, sandal = false) {
    const A = V(...ankle), T = V(...toe);
    const heel = A.clone().add(V(0, -0.045, -0.035));
    const parts = [
      ball(A.toArray(), 0.033, [1, 0.9, 1.1]),
      ball(heel.toArray(), 0.034, [0.9, 0.8, 1]),
      pod(heel.toArray(), T.toArray(), 0.04, [1.15, 0.6]),
      ball(T.clone().add(V(0, 0.005, 0)).toArray(), 0.028, [1.5, 0.6, 1]),
    ];
    if (sandal) parts.push(pod(heel.clone().add(V(0, -0.025, -0.02)).toArray(), T.clone().add(V(0, -0.02, 0.02)).toArray(), 0.05, [1.15, 0.14]));
    return parts;
  }

  // A whole figure from joint positions. clothed: { torso, legs } parts
  // covered by clothes are left out.
  function figure(P, j, mat, colorFn, opts = {}) {
    const add = (g) => P.add(xf(g, [0, 0, 0], [0, 0, 0], [FIG, FIG, FIG]), mat, { colorFn, noise: 0.04, freq: 8 });
    if (!opts.noTorso) add(torso(j.hip, j.tilt, opts.tunic));
    add(tube(j.neck, [j.head[0], j.head[1] - 0.09, j.head[2] - 0.01], [0.066, 0.058, 0.055]));
    head(j.head, j.headRot ?? [0, 0, 0], opts.hair).forEach(add);
    for (const s of ['L', 'R']) {
      const sh = j['sh' + s], el = j['el' + s], ha = j['ha' + s];
      add(ball(sh, 0.064, [1.12, 1, 0.95])); // shoulder muscle
      add(tube(sh, el, [0.062, 0.058, 0.054, 0.045]));
      add(ball(el, 0.043));
      add(tube(el, ha, [0.045, 0.047, 0.04, 0.032]));
      hand(el, ha, opts.curl?.[s] ?? 0.4, s === 'L' ? -1 : 1).forEach(add);
      if (opts.noLegs) continue;
      const hp = j['hp' + s], kn = j['kn' + s], an = j['an' + s];
      add(ball(hp, 0.1, [1, 1.1, 1])); // where the thigh meets the hip
      add(tube(hp, kn, [0.1, 0.094, 0.082, 0.066, 0.058]));
      add(ball(kn, 0.054, [1, 1, 1.05]));
      add(tube(kn, an, [0.052, 0.058, 0.056, 0.044, 0.036, 0.034]));
    }
    for (const s of ['L', 'R']) {
      const an = j['an' + s], toe = j['toe' + s] ?? [an[0] * 1.05, 0.02, an[2] + 0.17];
      foot(an, toe, opts.sandals).forEach(add);
    }
  }

  // Cloth hanging in folds: a sheet given by sheet(u, v) → point, with folds
  // running down it. Used for cloaks and the toga's overfold.
  const cloth = (nu, nv, sheet) => grid(nu, nv, sheet);

  // ---- Apollo: bronze, weight on the right leg, bow held out in the left hand
  {
    const P = new Piece('Statue_Apollo');
    const j = {
      hip: [0.015, 0.95, 0], tilt: [0, 0.05], neck: [0.0, 1.55, 0.0], head: [-0.015, 1.7, 0.02], headRot: [0.05, 0.35, 0],
      shL: [0.19, 1.48, 0], elL: [0.29, 1.39, 0.2], haL: [0.31, 1.35, 0.44],
      shR: [-0.19, 1.47, 0], elR: [-0.26, 1.21, -0.02], haR: [-0.25, 0.98, 0.06],
      hpL: [0.095, 0.93, 0], knL: [0.075, 0.5, 0.09], anL: [0.13, 0.1, -0.06],
      hpR: [-0.095, 0.93, 0], knR: [-0.1, 0.5, 0.02], anR: [-0.11, 0.08, 0.0],
    };
    figure(P, j, 'metal', bronzeFn, { hair: { curl: 0.02, n: 130 }, curl: { L: 0.9, R: 0.3 } });
    // the bow: held upright in the outstretched left hand, bowed forward, and its string
    const [hx, hy, hz] = j.haL.map((c) => c * FIG);
    const bowCurve = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => {
      const t = i / 4 - 1;
      return V(hx + 0.06, hy + t * 0.62, hz + 0.16 * (1 - t * t) + 0.04);
    }));
    P.add(new THREE.TubeGeometry(bowCurve, 24, 0.016, 6, false), 'metal', { colorFn: bronzeFn, noise: 0.05 });
    P.add(tube([hx + 0.06, hy - 0.6, hz + 0.04], [hx + 0.06, hy + 0.6, hz + 0.04], [0.004, 0.004], 1, 4), 'metal', { colorFn: bronzeFn });
    // a short cloak (chlamys) over the shoulders, hanging down the back in
    // folds, its end thrown over the left forearm
    P.add(xf(cloth(24, 14, (u, v) => {
      const a = lerp(Math.PI - 1.35, Math.PI + 1.35, u); // round the back
      const y = lerp(1.5, 1.02 + 0.22 * (1 - u), v);
      const r = 0.21 + 0.025 + 0.025 * v * Math.sin(u * 14 + v * 2) + 0.03 * v;
      return V(Math.sin(a) * r * 1.05 + 0.015, y, Math.cos(a) * r * 0.62);
    }), [0, 0, 0], [0, 0, 0], [FIG, FIG, FIG]), 'metal', { colorFn: bronzeFn, noise: 0.05 });
    const fa = V(...j.elL), fb = V(...j.haL);
    P.add(xf(cloth(10, 10, (u, v) => {
      const on = fa.clone().lerp(fb, lerp(0.15, 0.75, u)); // along the forearm
      return V(on.x + 0.02 * Math.sin(v * 7), on.y + 0.03 - v * 0.38, on.z + 0.015 * Math.sin(u * 12 + v * 3));
    }), [0, 0, 0], [0, 0, 0], [FIG, FIG, FIG]), 'metal', { colorFn: bronzeFn, noise: 0.05 });
    pieces.push(P);
  }

  // ---- Emperor in a toga: marble, right arm raised to speak, purple border
  {
    const P = new Piece('Statue_Emperor');
    const j = {
      hip: [0, 0.95, 0], tilt: [0, 0], neck: [0, 1.55, 0], head: [0, 1.7, 0.01], headRot: [0, -0.2, 0],
      shL: [0.2, 1.48, 0], elL: [0.27, 1.2, 0.06], haL: [0.2, 1.06, 0.24],
      shR: [-0.2, 1.48, 0], elR: [-0.36, 1.62, 0.12], haR: [-0.43, 1.86, 0.17],
      anL: [0.1, 0.08, 0.04], anR: [-0.11, 0.08, 0.02],
    };
    figure(P, j, 'stone', marbleFn, { noTorso: true, noLegs: true, sandals: true, hair: { curl: 0.013, n: 140 }, curl: { L: 0.7, R: 0.1 } });
    // the toga's outline: how far it stands out from the body at a height
    // (round over the shoulders, close at the waist, wide at the hem)
    const togaR = (y) => {
      if (y > 1.45) return lerp(0.21, 0.08, smooth((y - 1.45) / 0.12));
      if (y > 1.0) return lerp(0.2, 0.215, (1.45 - y) / 0.45);
      return lerp(0.215, 0.3, smooth((1.0 - y) / 0.9));
    };
    // the toga: neck to ankles, deep folds that fan out towards the bottom and an uneven hem
    const toga = grid(72, 36, (u, v) => {
      const a = u * TAU, y = lerp(1.57, 0.07 + 0.035 * Math.sin(a * 5 + 1), v);
      const fold = (0.008 + 0.04 * v) * Math.sin(a * 11 + v * 2.5) + 0.012 * Math.sin(a * 23 + v * 6) * v;
      const r = togaR(y) + fold;
      return V(Math.sin(a) * r * 1.05, y, Math.cos(a) * r * 0.7);
    }, true);
    P.add(xf(toga, [0, 0, 0], [0, 0, 0], [FIG, FIG, FIG]), 'stone', { colorFn: (p) => (p.y < 0.17 * FIG ? purple.clone() : marbleFn(p)), noise: 0.04, freq: 8 });
    // the overfold (sinus): from the left shoulder down across the front to
    // the right hip and round the back, sagging, with its purple edge
    P.add(xf(cloth(40, 8, (u, v) => {
      const a = lerp(-0.6, 3.6, u); // round from the left shoulder, over the front, to the back
      const yTop = lerp(1.5, 0.98, smooth(u * 1.5)) + 0.08 * Math.max(0, u - 0.66) * 3;
      const y = yTop - v * 0.2 - 0.07 * Math.sin(u * Math.PI);
      const r = togaR(y) + 0.035 + 0.015 * v + 0.012 * Math.sin(u * 30) * v;
      return V(Math.sin(a) * r * 1.05, y, Math.cos(a) * r * 0.7);
    }), [0, 0, 0], [0, 0, 0], [FIG, FIG, FIG]), 'stone', { colorFn: marbleFn, noise: 0.04 });
    // the purple border of that fold (toga praetexta)
    const edge = new THREE.CatmullRomCurve3(Array.from({ length: 12 }, (_, i) => {
      const u = i / 11, a = lerp(-0.6, 3.6, u);
      const y = lerp(1.5, 0.98, smooth(u * 1.5)) + 0.08 * Math.max(0, u - 0.66) * 3 - 0.2 - 0.07 * Math.sin(u * Math.PI);
      const r = togaR(y) + 0.052;
      return V(Math.sin(a) * r * 1.05 * FIG, y * FIG, Math.cos(a) * r * 0.7 * FIG);
    }));
    P.add(new THREE.TubeGeometry(edge, 48, 0.012, 5, false), 'stone', { color: purple, noise: 0.03 });
    // the fold hanging over the left forearm
    P.add(xf(cloth(10, 12, (u, v) => V(0.19 + u * 0.13 + 0.012 * Math.sin(v * 10), 1.1 - v * 0.48, 0.2 + 0.06 * Math.sin(u * Math.PI) + 0.02 * Math.sin(u * 14))), [0, 0, 0], [0, 0, 0], [FIG, FIG, FIG]), 'stone', { colorFn: marbleFn, noise: 0.04 });
    pieces.push(P);
  }

  // ---- Dancing faun: bronze, arms raised, head back, on the toes of one foot
  {
    const P = new Piece('Statue_Faun');
    const j = {
      hip: [0, 0.92, 0], tilt: [-0.12, -0.05], neck: [0.03, 1.5, -0.05], head: [0.05, 1.63, -0.1], headRot: [-0.45, 0.2, 0.1],
      shL: [0.2, 1.44, -0.04], elL: [0.34, 1.67, 0.03], haL: [0.31, 1.9, 0.1],
      shR: [-0.19, 1.45, -0.05], elR: [-0.36, 1.63, -0.03], haR: [-0.42, 1.86, 0.06],
      hpL: [0.095, 0.91, 0], knL: [0.11, 0.49, 0.03], anL: [0.12, 0.08, -0.02],
      hpR: [-0.095, 0.91, 0], knR: [-0.12, 0.55, 0.15], anR: [-0.13, 0.2, 0.02], toeR: [-0.13, 0.03, 0.13],
    };
    figure(P, j, 'metal', bronzeFn, { hair: { curl: 0.024, n: 130 }, curl: { L: 0.6, R: 0.6 } });
    // pointed ears and a little tail
    for (const s of [1, -1]) P.add(xf(new THREE.ConeGeometry(0.022, 0.085, 8), [(0.05 + s * 0.105) * FIG, 1.67 * FIG, -0.11 * FIG], [-0.3, 0, -s * 0.7]), 'metal', { colorFn: bronzeFn });
    P.add(xf(tube([0, 0.95, -0.14], [0, 0.86, -0.25], [0.025, 0.014], 1, 8), [0, 0, 0], [0, 0, 0], [FIG, FIG, FIG]), 'metal', { colorFn: bronzeFn });
    pieces.push(P);
  }

  // ---- Seated notable: marble, in a tunic and cloak on a chair, scroll in hand, bearded
  {
    const P = new Piece('Statue_Notable');
    const j = {
      hip: [0, 0.55, -0.08], tilt: [0.04, 0], neck: [0, 1.16, -0.06], head: [0, 1.3, -0.04], headRot: [0.12, 0.15, 0],
      shL: [0.2, 1.08, -0.07], elL: [0.27, 0.84, 0.0], haL: [0.16, 0.6, 0.3],
      shR: [-0.2, 1.08, -0.07], elR: [-0.27, 0.85, 0.05], haR: [-0.18, 0.78, 0.3],
      hpL: [0.1, 0.55, -0.02], knL: [0.12, 0.56, 0.38], anL: [0.13, 0.08, 0.42],
      hpR: [-0.1, 0.55, -0.02], knR: [-0.12, 0.56, 0.38], anR: [-0.14, 0.08, 0.44],
    };
    figure(P, j, 'stone', marbleFn, { tunic: true, sandals: true, hair: { curl: 0.014, n: 130, beard: true }, curl: { L: 0.5, R: 0.9 } });
    // cloak (himation): over the left shoulder, down the back, across the lap
    // and hanging between the shins, in folds
    P.add(xf(cloth(16, 14, (u, v) => {
      const x = lerp(-0.25, 0.25, u);
      const lap = v < 0.5;
      const z = lap ? lerp(-0.06, 0.45, v * 2) : 0.47 + 0.02 * Math.sin(u * 9);
      const y = lap ? 0.67 + 0.02 * Math.sin(u * 13) : lerp(0.67, 0.18, (v - 0.5) * 2);
      return V(x * (lap ? 1 : 0.85 - 0.1 * (v - 0.5)), y, z + 0.018 * Math.sin(u * 17 + v * 3));
    }), [0, 0, 0], [0, 0, 0], [FIG, FIG, FIG]), 'stone', { colorFn: marbleFn, noise: 0.04 });
    P.add(xf(cloth(10, 12, (u, v) => V(lerp(0.08, 0.26, u), lerp(1.12, 0.62, v), -0.15 + 0.06 * Math.sin(u * Math.PI) + 0.015 * Math.sin(u * 12 + v * 4))), [0, 0, 0], [0, 0, 0], [FIG, FIG, FIG]), 'stone', { colorFn: marbleFn, noise: 0.04 });
    // scroll
    P.add(xf(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 12), [-0.2 * FIG, 0.8 * FIG, 0.36 * FIG], [0, 0, Math.PI / 2]), 'stone', { colorFn: marbleFn });
    // the chair: seat, turned legs and a curved back
    const chairFn = () => marbleShade.clone().multiplyScalar(0.95);
    P.add(xf(block(0.62, 0.08, 0.56, 0.02), [0, 0.42 * FIG, -0.05 * FIG]), 'stone', { colorFn: chairFn });
    for (const [x, z] of [[-0.27, -0.28], [0.27, -0.28], [-0.27, 0.18], [0.27, 0.18]]) {
      P.add(xf(lathe([[0.03, 0], [0.04, 0.05], [0.026, 0.2], [0.038, 0.3], [0.028, 0.47], [0, 0.47]], 10), [x * FIG, 0, z * FIG]), 'stone', { colorFn: chairFn });
    }
    P.add(xf(grid(16, 6, (u, v) => { const a = lerp(-1.1, 1.1, u); return V(Math.sin(a) * 0.32, 0.5 + v * 0.55, -0.32 + (1 - Math.cos(a)) * 0.18 - 0.05); }), [0, 0, 0], [0, 0, 0], [FIG, FIG, FIG]), 'stone', { colorFn: chairFn });
    pieces.push(P);
  }

  // ---- Pedestal: a moulded stone base with a blank inscription panel (front +z)
  {
    const P = new Piece('Pedestal');
    const stoneFn = (c) => p => c.clone().multiplyScalar(0.92 + 0.12 * fbm(p.x * 5, p.y * 5, p.z * 5));
    P.add(block(1.0, 0.16, 1.0, 0.02), 'stone', { colorFn: stoneFn(COL.tuff), noise: 0.1 });
    P.add(xf(block(0.84, 0.78, 0.84, 0.015), [0, 0.16, 0]), 'stone', { colorFn: stoneFn(COL.lime), noise: 0.08 });
    P.add(xf(block(0.98, 0.16, 0.98, 0.02), [0, 0.94, 0]), 'stone', { colorFn: stoneFn(COL.tuff), noise: 0.1 });
    P.add(xf(block(0.56, 0.4, 0.02, 0.005), [0, 0.36, 0.425]), 'stone', { colorFn: stoneFn(COL.chip), noise: 0.05 });
    pieces.push(P);
  }
}

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

// ================================================================== EXPORT
const scene = new THREE.Scene();
let total = 0;
for (const p of pieces) { const g = p.build(); scene.add(g); total += g.userData.tris; console.log(`${p.name.padEnd(16)} ${String(Math.round(g.userData.tris)).padStart(7)} tris, ${g.children.length} draw calls`); }
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync('pompeii-kit.glb', Buffer.from(glb));
console.log(`pompeii-kit.glb: ${(glb.byteLength / 1048576).toFixed(2)} MB, ${pieces.length} pieces, ${Math.round(total)} tris total`);
