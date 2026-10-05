// Escape Pompeii — six statues of gods for street decoration and toppling obstacles.
// Output (STATUE_QUALITY=hd): pompeii-statues.glb. Each statue is a node "Statue_<God>" with two children:
//   "<God>_Pedestal"  – stays put
//   "<God>_Figure"    – topples; it contains part groups (_Head, _Torso, _Legs, _ArmL, _ArmR, _Attr)
//                        that can be scattered when it hits the ground.
// Origin: centre of the pedestal base, y = 0. Figures face +Z. Pedestal top at y = PED_H (1.02 m),
// figure height ~2.0 m, total ~3.05 m.
// Output (default, the game's phone version): statues.glb — fewer curls and segments, and for each god two
// top-level pieces for the street kit: "Statue_<God>" (the figure, feet at y = 0) and "Pedestal_<God>".
// Run: npm run build:statues

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { writeFileSync } from 'node:fs';

globalThis.FileReader = class {
  readAsArrayBuffer(b) { b.arrayBuffer().then(x => { this.result = x; this.onloadend?.(); }); }
  readAsDataURL(b) { b.arrayBuffer().then(x => { this.result = `data:${b.type};base64,` + Buffer.from(x).toString('base64'); this.onloadend?.(); }); }
};

// ---------------------------------------------------------------- quality: HD (as designed) or the game's phone version
const HD = process.env.STATUE_QUALITY === 'hd';
const RES = HD ? 1 : 0.45; // share of segments round curved surfaces
const CURLS = HD ? 1 : 0.28; // share of hair and beard curls (each bigger to cover the same head)
const seg = (n) => (HD ? n : Math.max(4, Math.round(n * RES)));
const curls = (n) => (HD ? n : Math.round(n * CURLS));

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const gauss = (d2, s) => Math.exp(-d2 / (2 * s * s));
const C = h => new THREE.Color(h);
let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
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

// ---------------------------------------------------------------- materials (shared with the kit style)
const MATS = {
  marble: { roughness: 0.42, metalness: 0 },
  bronze: { roughness: 0.42, metalness: 0.8 },
  stone:  { roughness: 0.85, metalness: 0 },
};
const materials = Object.fromEntries(Object.entries(MATS).map(([k, v]) =>
  [k, new THREE.MeshStandardMaterial({ name: 'statue_' + k, color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, ...v })]));

const COL = {
  marble: C(0xeee8dd), marbleDk: C(0xb9b0a3), vein: C(0x9c958c),
  bronze: C(0x5a4127), bronzeLt: C(0x8a6a3f), verdigris: C(0x4f8a72),
  stone: C(0xbfb39c), stoneDk: C(0x8d826e),
  paintRed: C(0xb0473a), paintBlue: C(0x4f6d8f), paintOchre: C(0xc39a4f), paintPink: C(0xc98d82), paintHair: C(0x7a4a2c),
};
// material colouring
const marbleColor = (p, n) => {
  const v = Math.abs(fbm(p.x * 3 + 7, p.y * 3, p.z * 3) - 0.5);
  let c = COL.marble.clone().lerp(COL.vein, smooth((0.03 - v) * 40) * 0.35);
  c.lerp(COL.marbleDk, clamp(0.35 - n.y * 0.3) * 0.25 * fbm(p.x * 9, p.y * 9, p.z * 9));   // grime on undersides
  return c;
};
const bronzeColor = (p, n) => {
  let c = COL.bronze.clone().lerp(COL.bronzeLt, smooth(fbm(p.x * 6, p.y * 6, p.z * 6) - 0.35) * 0.5);
  const verd = smooth((fbm(p.x * 7 + 3, p.y * 7, p.z * 7) - 0.52) * 6) * (0.25 + 0.6 * clamp(n.y));
  return c.lerp(COL.verdigris, clamp(verd) * 0.55);
};

// ---------------------------------------------------------------- builder
class Part {
  constructor(name) { this.name = name; this.buf = {}; }
  add(geo, mat, opts = {}) {
    for (const a of ['uv', 'uv1']) if (geo.attributes[a]) geo.deleteAttribute(a);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.index) geo = mergeVertices(geo, 1e-5);
    const B = this.buf[mat] ??= { pos: [], nor: [], col: [], idx: [] };
    const P = geo.attributes.position, N = geo.attributes.normal, base = B.pos.length / 3;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i);
      B.pos.push(p.x, p.y, p.z); B.nor.push(n.x, n.y, n.z);
      let c = opts.colorFn ? opts.colorFn(p, n) : (opts.color ?? (mat === 'bronze' ? bronzeColor(p, n) : mat === 'marble' ? marbleColor(p, n) : COL.stone));
      if (opts.paint) c = c.clone().lerp(opts.paint(p, n) ?? c, opts.paintAmt ?? 0.35);
      B.col.push(clamp(c.r), clamp(c.g), clamp(c.b));
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) B.idx.push(base + geo.index.getX(i));
    else for (let i = 0; i < P.count; i++) B.idx.push(base + i);
  }
  build(matrix) {
    const g = new THREE.Group(); g.name = this.name; let tris = 0;
    for (const [k, B] of Object.entries(this.buf)) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
      geo.setIndex(B.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(B.idx, 1) : new THREE.Uint16BufferAttribute(B.idx, 1));
      if (matrix) geo.applyMatrix4(matrix);
      const m = new THREE.Mesh(geo, materials[k]); m.name = `${this.name}_${k}`; g.add(m); tris += B.idx.length / 3;
    }
    g.userData.tris = tris; return g;
  }
}
function grid(nu, nv, fn, wrapU = false) {
  const pos = [], idx = [], cols = wrapU ? nu : nu + 1;
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) { const q = fn(i / nu, j / nv); pos.push(q.x, q.y, q.z); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * cols + i, b = j * cols + ((i + 1) % cols), c = (j + 1) * cols + i, d = (j + 1) * cols + ((i + 1) % cols);
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function xf(g, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
  g.applyMatrix4(new THREE.Matrix4().compose(V(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), V(...scl))); return g;
}
// elliptical ring (belt / roll of cloth) around the body at height y
function ring(A, Bz, y, r, cx = 0, cz = 0) {
  return grid(seg(48), seg(8), (u, v) => {
    const a = u * TAU, b = v * TAU;
    const nx = Math.sin(a), nz = Math.cos(a);
    return V(cx + nx * (A + r * Math.cos(b)), y + r * Math.sin(b), cz + nz * (Bz + r * Math.cos(b)));
  }, true);
}
const ell = (rx, ry, rz, w = 20, h = 14) => new THREE.SphereGeometry(1, seg(w), seg(h)).scale(rx, ry, rz);
const at = (g, p) => { g.translate(p.x, p.y, p.z); return g; };
// tube along a curve through points with radius profile r(t); ends taper closed
function tube(points, rFn, { nu = 22, nv = 26, sx = 1, sy = 1, closed = true } = {}) {
  nu = seg(nu); nv = seg(nv);
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const fr = curve.computeFrenetFrames(nv, false);
  return grid(nu, nv, (u, v) => {
    const j = Math.round(v * nv), c = curve.getPointAt(v), a = u * TAU;
    let r = rFn(v);
    if (closed) r *= Math.sqrt(clamp(Math.min(v, 1 - v) * 12)) * 0.92 + 0.08;
    return c.clone().addScaledVector(fr.normals[j], Math.cos(a) * r * sx).addScaledVector(fr.binormals[j], Math.sin(a) * r * sy);
  }, true);
}
// orient a geometry built along +Y so that +Y points from a to b, base at a
function along(g, a, b) {
  const d = b.clone().sub(a), len = d.length();
  g.applyMatrix4(new THREE.Matrix4().compose(a, new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()), V(1, 1, 1)));
  return g;
}

// ================================================================== FIGURE BUILDER
// builds a contrapposto figure at 1.8 m in "figure space" (feet at y=0, facing +Z)
function figure(spec) {
  const female = spec.female, M = spec.mat;
  const parts = { Head: new Part(`${spec.name}_Head`), Torso: new Part(`${spec.name}_Torso`), Legs: new Part(`${spec.name}_Legs`),
    ArmL: new Part(`${spec.name}_ArmL`), ArmR: new Part(`${spec.name}_ArmR`), Attr: new Part(`${spec.name}_Attr`) };
  const paint = spec.paint ?? null;

  // --- legs: right = weight leg (straight), left = free leg (bent, foot back)
  const tilt = 0.025;
  const legs = {
    R: { hip: V(-0.092, 0.94 + tilt, 0), knee: V(-0.088, 0.5, 0.012), ankle: V(-0.084, 0.085, -0.005), toe: V(-0.1, 0.03, 0.17) },
    L: { hip: V(0.092, 0.94 - tilt, 0), knee: V(0.115, 0.52, 0.07), ankle: V(0.15, 0.1, -0.075), toe: V(0.17, 0.02, 0.09) },
  };
  for (const s of ['R', 'L']) {
    const L = legs[s];
    parts.Legs.add(tube([L.hip.clone().add(V(0, 0.06, 0)), L.hip.clone().lerp(L.knee, 0.5).add(V(0, 0, 0.012)), L.knee],
      t => lerp(female ? 0.095 : 0.088, 0.052, Math.pow(t, 0.85)) + 0.006 * Math.sin(Math.PI * t), { closed: false }), M, { paint });
    parts.Legs.add(at(ell(0.052, 0.054, 0.055), L.knee), M);
    parts.Legs.add(tube([L.knee, L.knee.clone().lerp(L.ankle, 0.3).add(V(0, 0, -0.018)), L.ankle],
      t => lerp(0.05, 0.032, smooth(t)) + 0.012 * gauss((t - 0.3) ** 2, 0.14), { closed: false }), M);
    parts.Legs.add(at(ell(0.034, 0.034, 0.036), L.ankle), M);
    // foot with sandal sole
    const foot = ell(0.042, 0.03, 0.12, 18, 12);
    const mid = L.ankle.clone().lerp(L.toe, 0.55); mid.y = Math.max(0.03, mid.y);
    const g = foot;
    const dir = L.toe.clone().sub(L.ankle).normalize();
    g.applyMatrix4(new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir), V(1, 1, 1)));
    parts.Legs.add(g, M);
    const sole = xf(new THREE.CylinderGeometry(1, 1, 1, 20), [0, 0, 0], [0, 0, 0], [0.048, 0.016, 0.135]);
    sole.applyMatrix4(new THREE.Matrix4().compose(mid.clone().add(V(0, -0.028, 0)), new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir), V(1, 1, 1)));
    parts.Legs.add(sole, M);
  }
  // support stump behind the weight leg (real marble statues needed one)
  if (M === 'marble') parts.Legs.add(xf(new THREE.CylinderGeometry(0.075, 0.09, 0.62, 14), [-0.15, 0.31, -0.11]), M, {
    colorFn: (p, n) => marbleColor(p, n).lerp(COL.marbleDk, 0.15) });

  // --- torso
  const hipTilt = -tilt * 1.6, shTilt = tilt * 1.2;          // contrapposto counter-tilts
  const T = female
    ? [[0.86, 0.17, 0.12], [0.95, 0.185, 0.13], [1.05, 0.13, 0.1], [1.18, 0.15, 0.11], [1.3, 0.165, 0.125], [1.4, 0.17, 0.105], [1.47, 0.13, 0.085], [1.52, 0.07, 0.058]]
    : [[0.86, 0.155, 0.11], [0.95, 0.165, 0.12], [1.05, 0.145, 0.105], [1.18, 0.165, 0.115], [1.3, 0.19, 0.125], [1.4, 0.2, 0.11], [1.47, 0.15, 0.09], [1.52, 0.08, 0.065]];
  const prof = (y, k) => { for (let i = 0; i < T.length - 1; i++) if (y <= T[i + 1][0]) { const t = smooth((y - T[i][0]) / (T[i + 1][0] - T[i][0])); return lerp(T[i][k], T[i + 1][k], t); } return T[T.length - 1][k]; };
  const torsoPt = (u, y, off = 0) => {
    const a = u * TAU, t = (y - 0.86) / 0.66;
    const tl = lerp(hipTilt, shTilt, smooth(t));
    const cx = 0.012 * Math.sin(t * Math.PI);
    let A = prof(y, 1) + off, Bz = prof(y, 2) + off;
    let x = Math.sin(a) * A, z = Math.cos(a) * Bz;
    // anatomy: chest, abdomen, shoulder blades
    if (!female) {
      z += 0.018 * gauss((Math.abs(x) - 0.075) ** 2 + (y - 1.32) ** 2, 0.045) * clamp(Math.cos(a) * 2);
      z += 0.006 * gauss(x * x + (y - 1.12) ** 2, 0.06) * clamp(Math.cos(a) * 2);
    } else {
      z += 0.035 * gauss((Math.abs(x) - 0.072) ** 2 + (y - 1.29) ** 2, 0.04) * clamp(Math.cos(a) * 2);
    }
    z -= 0.01 * gauss((Math.abs(x) - 0.08) ** 2 + (y - 1.36) ** 2, 0.05) * clamp(-Math.cos(a) * 2);
    const yy = y + x * Math.sin(tl);
    return V(x + cx, yy, z);
  };
  parts.Torso.add(grid(seg(44), seg(30), (u, v) => torsoPt(u, lerp(0.86, 1.52, v)), true), M, { paint });
  // neck
  const neckBase = V(0.006, 1.48, 0), headC = V(0.012, 1.645, 0.016);
  parts.Head.add(tube([neckBase, neckBase.clone().lerp(headC, 0.5).add(V(0, 0, 0.008)), headC.clone().add(V(0, -0.04, -0.01))],
    t => lerp(female ? 0.056 : 0.066, female ? 0.05 : 0.06, t), { closed: false }), M);

  // --- head (sculpted, blank classical eyes)
  {
    const g = new THREE.SphereGeometry(1, seg(52), seg(38)), P = g.attributes.position, q = new THREE.Vector3();
    const s = female ? 0.95 : 1.0;
    const bumps = [
      [0, -0.028, 0.1, 0.009, 0.016], [0, -0.012, 0.099, 0.01, 0.012], [0, 0.004, 0.097, 0.009, 0.007],        // nose
      [0.013, -0.032, 0.093, 0.007, 0.006], [-0.013, -0.032, 0.093, 0.007, 0.006],                          // nostril wings
      [0.03, 0.021, 0.093, 0.015, female ? 0.006 : 0.01], [-0.03, 0.021, 0.093, 0.015, female ? 0.006 : 0.01], // brow ridge
      [0.031, 0.0, 0.091, 0.012, -0.013], [-0.031, 0.0, 0.091, 0.012, -0.013],                              // eye sockets
      [0.052, -0.022, 0.07, 0.02, 0.008], [-0.052, -0.022, 0.07, 0.02, 0.008],                              // cheekbones
      [0, -0.054, 0.098, 0.01, 0.008], [0, -0.068, 0.095, 0.009, 0.008],                                     // lips
      [0.023, -0.06, 0.09, 0.006, -0.006], [-0.023, -0.06, 0.09, 0.006, -0.006],                            // mouth corners
      [0, -0.098, 0.08, 0.016, female ? 0.009 : 0.013],                                                       // chin
      [0, -0.083, 0.092, 0.008, -0.004],                                                                      // under the lip
      ...(M === 'marble' ? [[0.03, -0.001, 0.086, 0.009, 0.0075], [-0.03, -0.001, 0.086, 0.009, 0.0075]] : []), // carved eyeballs
    ];
    for (let i = 0; i < P.count; i++) {
      q.fromBufferAttribute(P, i);
      let { x, y, z } = q, rx = 0.082 * s, ry = 0.112 * s, rz = 0.1 * s;
      if (y < 0) rx *= 1 - (female ? 0.14 : 0.08) * Math.pow(-y, 1.5);
      if (z < 0) rz *= 1.08;
      let px = x * rx, py = y * ry, pz = z * rz, d = 0;
      for (const [bx, by, bz, sg, a] of bumps) d += a * gauss((px - bx * s) ** 2 + (py - by * s) ** 2 + (pz - bz * s) ** 2, sg * s);
      d -= 0.004 * gauss((py + 0.061 * s) ** 2, 0.0022) * gauss(px * px, 0.019) * clamp((pz - 0.07 * s) * 40);   // mouth line
      const len = Math.hypot(px, py, pz); px += px / len * d; py += py / len * d; pz += pz / len * d;
      P.setXYZ(i, px, py, pz);
    }
    g.computeVertexNormals();
    g.rotateY(spec.turn ?? 0.25); g.rotateX(spec.nod ?? 0.05);
    at(g, headC);
    parts.Head.add(g, M, { paint: spec.lipPaint ? (p) => { const r = p.clone().sub(headC); return gauss(r.x * r.x + (r.y + 0.06) ** 2, 0.01) > 0.5 ? COL.paintRed : null; } : null, paintAmt: 0.25 });
    // eyes: eyeballs with lids; bronzes had inlaid eyes, marbles had painted irises
    const headM = new THREE.Matrix4().makeRotationY(spec.turn ?? 0.25).premultiply(new THREE.Matrix4().makeRotationX(spec.nod ?? 0.05));
    for (const sx of [1, -1]) {
      const ec = V(0.03 * sx * s, -0.001, 0.0775 * s);
      const bronze = M === 'bronze';
      const eye = new THREE.SphereGeometry(0.0118 * s, seg(16), seg(12)); eye.translate(ec.x, ec.y, ec.z - (bronze ? 0.002 : 0));
      eye.applyMatrix4(headM); at(eye, headC);
      if (bronze) parts.Head.add(eye, 'marble', { colorFn: (p) => {
        const local = p.clone().sub(headC).applyMatrix4(headM.clone().invert()).sub(ec);
        const r = Math.hypot(local.x, local.y), front = local.z > 0.006;
        if (bronze) return front && r < 0.0075 ? C(0x24180f) : C(0xb9ab95);
        return front && r < 0.0065 ? COL.marble.clone().lerp(C(0x6b5440), 0.35) : COL.marble.clone();
      } });
      for (const [yo, rad, k] of (bronze ? [[0.0045, 0.0138, 1], [-0.006, 0.013, -1]] : [[0.0075, 0.0135, 1]])) {   // lid ridges
        const pts = []; for (let i = 0; i <= 10; i++) { const t = (i / 10 - 0.5) * 2.2; pts.push(V(ec.x + Math.sin(t) * rad, ec.y + yo + k * Math.cos(t) * 0.005 * (k > 0 ? 1.4 : 0.7), ec.z + Math.cos(t) * rad * 0.55)); }
        const lid = tube(pts, () => (k > 0 ? 0.0042 : 0.0024) * s, { nu: 6, nv: 12 }); lid.applyMatrix4(headM); at(lid, headC); parts.Head.add(lid, M);
      }
    }
    // ears
    for (const sx of [1, -1]) {
      const e = xf(ell(0.009, 0.03, 0.019, 12, 10), [0.08 * sx, -0.008, -0.012], [0.15, 0.25 * sx, 0.1 * sx]);
      e.rotateY(spec.turn ?? 0.25); at(e, headC); parts.Head.add(e, M);
    }
    // hair: curls over the scalp, optional bun / beard
    const hairM = new THREE.Matrix4().makeRotationY(spec.turn ?? 0.25);
    const curl = (dir, size, offset = 1.0) => {
      const p = dir.clone().multiply(V(0.085 * s, 0.115 * s, 0.104 * s)).multiplyScalar(offset).applyMatrix4(hairM).add(headC);
      const g2 = new THREE.IcosahedronGeometry(HD ? size : size / Math.sqrt(CURLS) * 0.75, HD ? 1 : 0); g2.scale(1, 0.75, 1); at(g2, p);
      parts.Head.add(g2, M, { paint: paint ? () => COL.paintHair : null, paintAmt: 0.2 });
    };
    if (spec.hair !== 'helmet' && spec.hair !== 'hat') {
      const cap = new THREE.SphereGeometry(1, seg(36), seg(20), 0, TAU, 0, Math.PI * 0.6);
      cap.scale(0.087 * s, 0.117 * s, 0.106 * s); cap.rotateX(-0.5); cap.translate(0, 0.004, -0.004);
      cap.applyMatrix4(hairM); at(cap, headC);
      parts.Head.add(cap, M, { paint: paint ? () => COL.paintHair : null, paintAmt: 0.2 });
      const n = curls(female ? 420 : 520);
      for (let i = 0; i < n; i++) {
        const u = rnd(), v = rnd(), th = u * TAU, ph = Math.acos(1 - 2 * v);
        const d = V(Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th));
        const front = d.z > 0.35 && d.y < 0.5;                    // keep the face clear
        if (front || d.y < (d.z > 0 ? 0.2 : -0.4)) continue;
        curl(d, rr(0.0095, 0.0135) * (female ? 0.95 : 1), 1.025);
      }
    } else {
      for (let i = 0; i < curls(40); i++) {                              // hair visible under helmet/hat
        const th = rr(Math.PI * 0.55, Math.PI * 1.45), y = rr(-0.45, 0.05);
        curl(V(Math.sin(th), y, Math.cos(th)).normalize(), rr(0.016, 0.022), 0.97);
      }
    }
    if (female) {           // bun at the back + headband
      const bun = ell(0.055, 0.045, 0.045, 18, 12); bun.translate(0, 0.03, -0.11); bun.applyMatrix4(hairM); at(bun, headC);
      parts.Head.add(bun, M, { paint: paint ? () => COL.paintHair : null, paintAmt: 0.2 });
      for (let i = 0; i < 14; i++) curl(V(Math.sin(Math.PI + (i / 13 - 0.5) * 1.4) * 0.6, 0.25, -0.9).normalize(), 0.02, 1.25);
      const band = new THREE.TorusGeometry(0.093, 0.006, 6, seg(36)); band.rotateX(Math.PI / 2 - 0.35); band.translate(0, 0.05, -0.005);
      band.applyMatrix4(hairM); at(band, headC); parts.Head.add(band, M, { paint: paint ? () => COL.paintBlue : null, paintAmt: 0.35 });
    }
    if (spec.beard) {
      const mass = ell(0.078 * s, 0.062 * s, 0.072 * s, 24, 16); mass.translate(0, -0.082 * s, 0.03 * s); mass.applyMatrix4(hairM); at(mass, headC);
      parts.Head.add(mass, M);
      for (let i = 0; i < curls(260); i++) {
        const th = rr(-1.35, 1.35), y = rr(-1.05, -0.25);
        const d = V(Math.sin(th) * Math.sqrt(1 - y * y * 0.6), y, Math.cos(th) * Math.sqrt(1 - y * y * 0.6)).normalize();
        if (d.z > 0.75 && d.y > -0.68 && Math.abs(d.x) < 0.33) continue;   // keep lips clear
        curl(d, rr(0.012, 0.018), 1.06 + (y < -0.8 ? 0.16 : 0));
      }
      for (const sx of [1, -1]) curl(V(0.22 * sx, -0.5, 0.95).normalize(), 0.015, 1.02);      // moustache
    }
  }

  // --- arms
  const sh = { L: V(female ? 0.178 : 0.205, 1.452 + shTilt * 3, 0), R: V(female ? -0.178 : -0.205, 1.452 - shTilt * 3, 0) };
  for (const s of ['L', 'R']) {
    const A = spec.arms[s], part = parts['Arm' + s];
    const S = sh[s], E = A.elbow, Wr = A.wrist;
    part.add(at(ell(female ? 0.058 : 0.068, 0.062, 0.06), S.clone().add(V(s === 'L' ? -0.01 : 0.01, -0.01, 0))), M, { paint });  // deltoid
    part.add(tube([S, S.clone().lerp(E, 0.5).add(V(0, 0, 0.006)), E], t => lerp(female ? 0.046 : 0.052, 0.038, smooth(t)) + 0.006 * gauss((t - 0.45) ** 2, 0.15), { closed: false }), M);
    part.add(at(ell(0.04, 0.041, 0.04), E), M);
    part.add(tube([E, E.clone().lerp(Wr, 0.5), Wr], t => lerp(0.04, 0.026, smooth(t)) + 0.005 * gauss((t - 0.2) ** 2, 0.12), { closed: false, sx: 1.12, sy: 0.88 }), M);
    // hand: palm + curled fingers (a loose fist that can hold attributes)
    const dir = (A.handDir ?? Wr.clone().sub(E)).clone().normalize();
    const palm = ell(0.019, 0.045, 0.038, 14, 10); palm.translate(0, 0.045, 0);
    along(palm, Wr, Wr.clone().add(dir)); part.add(palm, M);
    const side = new THREE.Vector3().crossVectors(dir, V(0, 0, 1)); if (side.lengthSq() < 0.01) side.set(1, 0, 0); side.normalize();
    const fwd = new THREE.Vector3().crossVectors(side, dir).normalize();
    for (let f = 0; f < 4; f++) {
      const base = Wr.clone().addScaledVector(dir, 0.085).addScaledVector(fwd, 0.026 - f * 0.017);
      const tip = base.clone().addScaledVector(dir, 0.028).addScaledVector(side, (s === 'L' ? -1 : 1) * (A.open ? 0.005 : 0.025));
      const end = tip.clone().addScaledVector(dir, A.open ? 0.03 : -0.004).addScaledVector(side, (s === 'L' ? -1 : 1) * (A.open ? 0.006 : 0.016));
      part.add(tube([base, tip, end], () => 0.0085, { nu: 8, nv: 8 }), M);
    }
    part.add(tube([Wr.clone().addScaledVector(dir, 0.03).addScaledVector(fwd, 0.035), Wr.clone().addScaledVector(dir, 0.065).addScaledVector(fwd, 0.05),
      Wr.clone().addScaledVector(dir, 0.085).addScaledVector(fwd, 0.035).addScaledVector(side, (s === 'L' ? -1 : 1) * 0.02)], () => 0.01, { nu: 8, nv: 8 }), M);
    A.handPoint = Wr.clone().addScaledVector(dir, 0.07).addScaledVector(side, (s === 'L' ? -1 : 1) * 0.012);
    A.dir = dir;
  }

  // --- drapery
  const folds = (a, v, k = 1) => (0.012 * Math.sin(a * 13 + 0.7) + 0.006 * Math.sin(a * 29 + 2.1) + 0.004 * Math.sin(a * 7)) * k * (0.35 + v);
  const skirt = (yTop, yBot, rTop, rBot, opts = {}) => grid(seg(84), seg(34), (u, v) => {
    const a = u * TAU, y = lerp(yTop, yBot + (opts.hemWave ?? 0.02) * Math.sin(a * 3 + 1), v);
    let r = lerp(rTop, rBot, Math.pow(v, 0.7)) + folds(a, v, opts.fold ?? 1);
    let x = Math.sin(a) * r, z = Math.cos(a) * r * 0.78;
    // the free (left) knee pushes the cloth forward; cloth clings to the weight leg
    const kz = 0.07 * gauss((x - 0.12) ** 2 + (y - 0.52) ** 2, 0.12) * clamp(Math.cos(a) * 1.5);
    z += kz; x += 0.02 * gauss((y - 0.5) ** 2, 0.2) * Math.sign(x);
    return V(x + 0.01, y, z + 0.005);
  }, true);
  const hemPaint = (yBot, col, band = 0.06) => (p) => (p.y < yBot + band ? col : null);
  if (spec.drape.lower) {
    const d = spec.drape.lower;
    parts.Legs.add(skirt(d.top, d.bot, d.rTop, d.rBot, d), M, { paint: d.paint ? hemPaint(d.bot, d.paint) : null, paintAmt: 0.4 });
    // knotted roll at the waist
    parts.Torso.add(ring(prof(d.top, 1) + 0.022, prof(d.top, 2) + 0.02, d.top + 0.005, 0.026, 0.008, 0.005), M);
  }
  if (spec.drape.upper) {       // tunic over the torso (chiton/peplos) with vertical folds and a belt
    const d = spec.drape.upper;
    parts.Torso.add(grid(seg(64), seg(22), (u, v) => {
      const y = lerp(d.bot, 1.47, v), p = torsoPt(u, y, 0.012), a = u * TAU;
      const f = 0.006 * Math.sin(a * 17) * (1 - v * 0.6) + (y < 1.1 ? 0.012 * gauss((y - 1.04) ** 2, 0.04) : 0);
      return p.add(V(Math.sin(a) * f, 0, Math.cos(a) * f));
    }, true), M, { paint: d.paint ? (p) => (p.y > 1.41 ? d.paint : null) : null, paintAmt: 0.35 });
    parts.Torso.add(ring(prof(1.115, 1) + 0.02, prof(1.115, 2) + 0.022, 1.115, 0.011, 0.006, 0.003), M, { paint: d.paint ? () => d.paint : null, paintAmt: 0.4 });
  }
  if (spec.drape.sash) {        // himation over the left shoulder, across the back to the right hip
    const pts = [V(0.17, 1.47, 0.02), V(0.1, 1.38, 0.13), V(-0.06, 1.15, 0.13), V(-0.18, 1.0, 0.06), V(-0.16, 0.98, -0.1), V(0.05, 1.2, -0.14), V(0.17, 1.46, -0.04)];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    parts.Torso.add(grid(seg(90), seg(6), (u, w) => {
      const c = curve.getPointAt(u), t = curve.getTangentAt(u);
      const out = V(c.x, 0, c.z).normalize();
      const side = new THREE.Vector3().crossVectors(t, out).normalize();
      const width = 0.11 + 0.02 * Math.sin(u * 9);
      const ww = (w - 0.5) * width;
      return c.clone().addScaledVector(side, ww).addScaledVector(out, 0.012 + 0.012 * Math.sin(w * Math.PI * 4 + u * 30) + 0.01 * Math.sin(w * Math.PI));
    }), M, { paint: spec.drape.sash.paint ? () => spec.drape.sash.paint : null, paintAmt: 0.18 });
  }
  if (spec.drape.cloak) {       // chlamys hanging from the left shoulder over the arm
    const A = spec.arms.L;
    parts.ArmL.add(grid(14, 20, (u, v) => {
      const top = sh.L.clone().add(V(-0.03 + u * 0.1, 0.03, -0.06 + u * 0.12));
      const bot = A.elbow.clone().lerp(A.wrist, 0.6).add(V(-0.02 + u * 0.08, -0.32 - 0.06 * Math.sin(u * Math.PI), -0.05 + u * 0.08));
      const p = top.clone().lerp(bot, v);
      p.x += 0.02 * Math.sin(u * 12 + v * 2) * v; p.z += 0.03 * Math.sin(v * Math.PI) * (1 - u);
      return p;
    }), M);
  }
  if (spec.drape.aegis) {       // Minerva's scaly aegis cape over the shoulders with a gorgon disc
    parts.Torso.add(grid(seg(48), seg(8), (u, v) => {
      const y = lerp(1.5, 1.32, v), p = torsoPt(u, y, 0.03 + v * 0.012);
      const a = u * TAU; p.y -= 0.03 * Math.sin(a * 9) * v * v;
      return p;
    }, true), M, { paint: () => COL.paintOchre, paintAmt: 0.25 });
    for (let i = 0; i < curls(70); i++) {
      const u = rnd(), v = rnd(); const p = torsoPt(u, lerp(1.48, 1.34, v), 0.045);
      const g = new THREE.IcosahedronGeometry(0.011, 0); g.scale(1.2, 0.7, 0.5); at(g, p); parts.Torso.add(g, M);
    }
    const disc = ell(0.045, 0.045, 0.014, 18, 10); at(disc, torsoPt(0, 1.36, 0.05)); parts.Torso.add(disc, M, { paint: () => COL.paintOchre, paintAmt: 0.35 });
  }
  // --- attributes
  spec.attrs?.(parts.Attr, spec.arms, M, { headC, sh, legs });
  return parts;
}

// ================================================================== ATTRIBUTES
const ATTR = {
  bow(P, hand, M, up = V(0, 1, 0)) {
    const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20 - 0.5; pts.push(hand.clone().add(up.clone().multiplyScalar(t * 1.05)).add(V(0, 0, 0.12 * Math.cos(t * Math.PI) - 0.05))); }
    P.add(tube(pts, t => 0.012 - 0.005 * Math.abs(t - 0.5), { nu: 8, nv: 30, closed: false }), M);
    P.add(tube([pts[0], pts[20]], () => 0.002, { nu: 4, nv: 2, closed: false }), M);
  },
  quiver(P, M, from = V(-0.12, 1.12, -0.13), to = V(0.06, 1.55, -0.16)) {
    P.add(along(new THREE.CylinderGeometry(0.05, 0.045, from.distanceTo(to), 14, 1).translate(0, from.distanceTo(to) / 2, 0), from, to), M);
    for (let i = 0; i < 5; i++) P.add(at(new THREE.ConeGeometry(0.012, 0.06, 4), to.clone().add(V(rr(-0.03, 0.03), 0.04, rr(-0.03, 0.03)))), M);
    P.add(tube([V(-0.13, 1.47, 0.1), V(0.02, 1.3, 0.13), V(0.15, 1.12, 0.06)], () => 0.009, { nu: 6, nv: 10, sx: 2, sy: 0.6, closed: false }), M);
  },
  staff(P, hand, M, h0, h1, tip) {
    const a = V(hand.x, h0, hand.z), b = V(hand.x, h1, hand.z);
    P.add(along(new THREE.CylinderGeometry(0.014, 0.017, h1 - h0, 10).translate(0, (h1 - h0) / 2, 0), a, b), M);
    if (tip === 'spear') P.add(at(xf(new THREE.ConeGeometry(0.035, 0.22, 8), [0, 0, 0], [0, 0, 0], [1, 1, 0.35]), b.clone().add(V(0, 0.11, 0))), M);
    if (tip === 'scepter') { P.add(at(new THREE.SphereGeometry(0.04, 14, 10), b.clone().add(V(0, 0.03, 0))), M); P.add(at(new THREE.TorusGeometry(0.03, 0.008, 6, 16).rotateX(Math.PI / 2), b), M); }
  },
  apple(P, hand, M) { P.add(at(new THREE.SphereGeometry(0.035, 16, 12), hand.clone().add(V(0, 0.02, 0.02))), M); },
  thunderbolt(P, hand, M) {
    const g1 = new THREE.ConeGeometry(0.03, 0.17, 8); g1.translate(0, 0.085, 0);
    const g2 = g1.clone().rotateZ(Math.PI);
    for (const g of [g1, g2]) P.add(at(xf(g, [0, 0, 0], [0.3, 0, 1.2]), hand), M);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; P.add(tube([hand, hand.clone().add(V(Math.cos(a) * 0.05, 0.03, Math.sin(a) * 0.05)), hand.clone().add(V(Math.cos(a) * 0.03, 0.1, Math.sin(a) * 0.03)), hand.clone().add(V(Math.cos(a) * 0.07, 0.15, Math.sin(a) * 0.07))], () => 0.006, { nu: 5, nv: 10 }), M); }
  },
  eagle(P, M, base = V(-0.3, 0, 0.18)) {
    P.add(xf(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 16), [base.x, 0.08, base.z]), M);              // rock
    P.add(xf(ell(0.07, 0.11, 0.08), [base.x, 0.27, base.z], [-0.25, 0, 0]), M);                         // body
    for (const sx of [1, -1]) P.add(xf(ell(0.025, 0.1, 0.075), [base.x + 0.07 * sx, 0.28, base.z - 0.01], [-0.3, 0, -0.15 * sx]), M);
    P.add(at(new THREE.SphereGeometry(0.04, 14, 10), V(base.x, 0.41, base.z + 0.03)), M);
    P.add(xf(new THREE.ConeGeometry(0.014, 0.05, 8), [base.x, 0.4, base.z + 0.08], [Math.PI / 2 + 0.6, 0, 0]), M);
    P.add(xf(ell(0.05, 0.015, 0.09), [base.x, 0.18, base.z - 0.1], [0.6, 0, 0]), M);
  },
  shield(P, M, c = V(0.45, 0.4, 0.08)) {
    const d = xf(new THREE.CylinderGeometry(0.37, 0.37, 0.035, seg(40)), [c.x, c.y, c.z], [0, 0, Math.PI / 2 - 0.12]); d.rotateY(0.45); P.add(d, M);
    const rim = xf(new THREE.TorusGeometry(0.37, 0.018, 6, seg(48)), [0, 0, 0], [0, Math.PI / 2, 0]); rim.rotateZ(-0.12); rim.rotateY(0.45); rim.translate(c.x, c.y, c.z); P.add(rim, M);
    const boss = xf(new THREE.SphereGeometry(0.1, 20, 10, 0, TAU, 0, Math.PI / 2), [0, 0, 0], [0, 0, -Math.PI / 2], [1, 0.45, 1]); boss.rotateZ(-0.12); boss.rotateY(0.45); boss.translate(c.x, c.y, c.z); boss.translate(0.02, 0, 0.012); P.add(boss, M, { paint: () => COL.paintOchre, paintAmt: 0.3 });
  },
  helmet(P, M, headC, turn) {
    const R = new THREE.Matrix4().makeRotationY(turn);
    const put = g => { g.applyMatrix4(R); at(g, headC); P.add(g, M); return g; };
    const dome = new THREE.SphereGeometry(1, seg(40), seg(20), 0, TAU, 0, Math.PI * 0.56); dome.scale(0.096, 0.112, 0.11); dome.rotateX(-0.2); dome.translate(0, 0.03, -0.01); put(dome);
    put(grid(30, 2, (u, v) => { const a = lerp(-1.1, 1.1, u), r = lerp(0.094, 0.13, v); return V(Math.sin(a) * r, 0.046 + 0.014 * v + 0.01 * Math.cos(a), Math.cos(a) * r * 1.08 - 0.012); }));  // brow peak
    put(grid(30, 6, (u, v) => { const a = lerp(Math.PI * 0.68, Math.PI * 1.32, u), r = lerp(0.104, 0.13, v); return V(Math.sin(a) * r, lerp(0.02, -0.05, v), Math.cos(a) * r - 0.015); })); // neck guard
    for (const sx of [1, -1]) put(grid(8, 8, (u, v) => V(sx * (0.096 + 0.004 * v), lerp(0.03, -0.06, v), lerp(-0.02, 0.05, u) + 0.01 * v)));          // cheek guards
    const s = new THREE.Shape(); s.moveTo(-0.13, 0); s.quadraticCurveTo(0, 0.12, 0.13, 0.0); s.lineTo(0.1, -0.012); s.quadraticCurveTo(0, 0.06, -0.1, -0.012); s.lineTo(-0.13, 0);
    const crest = new THREE.ExtrudeGeometry(s, { depth: 0.028, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 16 });
    crest.translate(0, 0, -0.014); crest.rotateY(-Math.PI / 2); crest.translate(0, 0.12, -0.01);
    crest.applyMatrix4(R); at(crest, headC); P.add(crest, M, { paint: () => COL.paintRed, paintAmt: 0.3 });
  },
  petasos(P, M, headC, turn) {
    const brim = new THREE.CylinderGeometry(0.135, 0.135, 0.01, 32); brim.rotateX(-0.12); brim.translate(0, 0.085, -0.005);
    const crown = new THREE.SphereGeometry(0.095, 24, 12, 0, TAU, 0, Math.PI / 2); crown.scale(1, 0.7, 1.05); crown.translate(0, 0.09, -0.005);
    for (const g of [brim, crown]) { g.rotateY(turn); at(g, headC); P.add(g, M); }
    for (const sx of [1, -1]) {
      const w = new THREE.Shape(); w.moveTo(0, 0); for (let i = 0; i <= 4; i++) w.lineTo(0.03 + i * 0.02, 0.03 + i * 0.022 - (i % 2) * 0.012); w.lineTo(0.11, 0.1); w.lineTo(0, 0.02);
      const g = new THREE.ExtrudeGeometry(w, { depth: 0.006, bevelEnabled: false }); g.rotateY(sx > 0 ? -Math.PI / 2 : Math.PI / 2); g.rotateX(0.15);
      g.translate(0.095 * sx, 0.1, -0.03); g.rotateY(turn); at(g, headC); P.add(g, M);
    }
  },
  caduceus(P, hand, M) {
    const a = hand.clone().add(V(0, -0.2, 0)), b = hand.clone().add(V(0, 0.38, 0));
    P.add(along(new THREE.CylinderGeometry(0.011, 0.011, a.distanceTo(b), 8).translate(0, a.distanceTo(b) / 2, 0), a, b), M);
    for (const ph of [0, Math.PI]) {
      const pts = []; for (let i = 0; i <= 30; i++) { const t = i / 30, ang = ph + t * TAU * 2.3; pts.push(V(hand.x + Math.cos(ang) * 0.03 * (1 - t * 0.3), lerp(a.y + 0.25, b.y - 0.02, t), hand.z + Math.sin(ang) * 0.03 * (1 - t * 0.3))); }
      P.add(tube(pts, t => 0.007 + 0.004 * (t > 0.95 ? 1 : 0), { nu: 6, nv: 40 }), M);
    }
    for (const sx of [1, -1]) P.add(xf(ell(0.045, 0.012, 0.02, 10, 6), [hand.x + 0.04 * sx, b.y, hand.z], [0, 0, 0.5 * sx]), M);
  },
  purse(P, hand, M) {
    P.add(xf(ell(0.05, 0.065, 0.045, 16, 12), [hand.x, hand.y - 0.08, hand.z + 0.01]), M);
    P.add(xf(new THREE.TorusGeometry(0.025, 0.008, 6, 14), [hand.x, hand.y - 0.015, hand.z + 0.01], [Math.PI / 2, 0, 0]), M);
  },
  diadem(P, M, headC, turn) {
    const g = new THREE.TorusGeometry(0.06, 0.012, 6, 20, Math.PI); g.rotateZ(Math.PI); g.scale(1, 0.8, 1); g.translate(0, 0.17, 0.055); g.rotateX(-0.3); g.rotateY(turn); at(g, headC); P.add(g, M);
  },
};

// ================================================================== THE SIX GODS
const v = (x, y, z) => V(x, y, z);
const GODS = [
  { name: 'Apollo', label: 'Apollo', mat: 'bronze', female: false, turn: 0.55,
    note: 'Bronze archer from the Temple of Apollo beside the Forum.',
    arms: { L: { elbow: v(0.36, 1.43, 0.2), wrist: v(0.45, 1.41, 0.43), handDir: v(0.25, 0, 1) }, R: { elbow: v(-0.36, 1.4, -0.06), wrist: v(-0.1, 1.4, 0.13), handDir: v(1, 0, 0.3) } },
    drape: { lower: { top: 0.98, bot: 0.66, rTop: 0.18, rBot: 0.22, fold: 0.8 }, cloak: true },
    attrs: (P, A, M) => { ATTR.bow(P, A.L.handPoint, M); ATTR.quiver(P, M); } },
  { name: 'Diana', label: 'Diana', mat: 'bronze', female: true, turn: -0.3, nod: -0.05,
    note: 'Goddess of the hunt; her bronze bust stood with Apollo\'s statue.',
    arms: { L: { elbow: v(0.24, 1.17, 0.05), wrist: v(0.28, 0.94, 0.14), handDir: v(0.1, -1, 0.3) }, R: { elbow: v(-0.3, 1.6, -0.1), wrist: v(-0.13, 1.7, -0.21), handDir: v(0.3, 0.5, -0.6) } },
    drape: { lower: { top: 1.02, bot: 0.56, rTop: 0.19, rBot: 0.24, fold: 1.1 }, upper: { bot: 0.98 } },
    attrs: (P, A, M) => { ATTR.bow(P, A.L.handPoint, M, v(0, 1, 0.25).normalize()); ATTR.quiver(P, M, v(-0.1, 1.2, -0.12), v(-0.04, 1.68, -0.15)); } },
  { name: 'Venus', label: 'Venus', mat: 'marble', female: true, turn: 0.3, nod: 0.12,
    note: 'Venus Pompeiana, the patron goddess of the city.',
    paint: null,
    arms: { L: { elbow: v(0.25, 1.15, 0.0), wrist: v(0.27, 0.9, 0.07), handDir: v(0, -1, 0.15) }, R: { elbow: v(-0.24, 1.13, 0.07), wrist: v(-0.09, 1.26, 0.16), handDir: v(0.6, 0.6, 0.3) } },
    drape: { lower: { top: 1.02, bot: 0.06, rTop: 0.19, rBot: 0.27, fold: 1.25, paint: COL.paintPink }, upper: { bot: 0.98, paint: COL.paintBlue } },
    attrs: (P, A, M) => ATTR.apple(P, A.R.handPoint, M) },
  { name: 'Jupiter', label: 'Jupiter', mat: 'marble', female: false, turn: 0.15, nod: -0.04, beard: true,
    note: 'King of the gods; his temple closes the north end of the Forum.',
    arms: { L: { elbow: v(0.27, 1.16, 0.06), wrist: v(0.31, 0.96, 0.21), handDir: v(0.1, -0.3, 1) }, R: { elbow: v(-0.37, 1.55, 0.04), wrist: v(-0.39, 1.78, 0.12), handDir: v(0, 1, 0.1) } },
    drape: { lower: { top: 1.0, bot: 0.07, rTop: 0.2, rBot: 0.27, fold: 1.15, paint: COL.paintRed }, sash: { paint: COL.paintRed } },
    attrs: (P, A, M) => { ATTR.staff(P, A.R.handPoint, M, 0.06, 2.12, 'scepter'); ATTR.thunderbolt(P, A.L.handPoint, M); ATTR.eagle(P, M); } },
  { name: 'Minerva', label: 'Minerva', mat: 'marble', female: true, turn: -0.15, hair: 'helmet',
    note: 'Goddess of wisdom and crafts, worshipped with Hercules at the Triangular Forum.',
    arms: { L: { elbow: v(0.28, 1.14, 0.05), wrist: v(0.4, 0.95, 0.1), handDir: v(0.3, -0.8, 0) }, R: { elbow: v(-0.33, 1.55, 0.05), wrist: v(-0.36, 1.76, 0.1), handDir: v(0, 1, 0.1) } },
    drape: { lower: { top: 1.02, bot: 0.06, rTop: 0.2, rBot: 0.27, fold: 1.2, paint: COL.paintBlue }, upper: { bot: 0.98 }, aegis: true },
    attrs: (P, A, M, ctx) => { ATTR.staff(P, A.R.handPoint, M, 0.06, 2.05, 'spear'); ATTR.shield(P, M, v(0.47, 0.42, 0.06)); ATTR.helmet(P, M, ctx.headC, -0.15); } },
  { name: 'Mercury', label: 'Mercury', mat: 'bronze', female: false, turn: -0.35, hair: 'hat',
    note: 'God of trade and travellers; his image guarded many Pompeian shops.',
    arms: { L: { elbow: v(0.28, 1.17, 0.03), wrist: v(0.33, 1.2, 0.26), handDir: v(0.05, 0.4, 1) }, R: { elbow: v(-0.25, 1.15, 0.03), wrist: v(-0.28, 0.93, 0.1), handDir: v(0, -1, 0.15) } },
    drape: { lower: { top: 0.98, bot: 0.7, rTop: 0.18, rBot: 0.21, fold: 0.7 }, cloak: true },
    attrs: (P, A, M, ctx) => { ATTR.caduceus(P, A.L.handPoint, M); ATTR.purse(P, A.R.handPoint, M); ATTR.petasos(P, M, ctx.headC, -0.35); } },
];

// ================================================================== PEDESTAL
const PED_H = 1.02, FIG_SCALE = 1.1;
function pedestal(name, label) {
  const P = new Part(name);
  const box = (w, h, d, y, bev = 0.015) => {
    const s = new THREE.Shape(); const b = bev;
    s.moveTo(-w / 2 + b, -h / 2 + b); s.lineTo(w / 2 - b, -h / 2 + b); s.lineTo(w / 2 - b, h / 2 - b); s.lineTo(-w / 2 + b, h / 2 - b); s.lineTo(-w / 2 + b, -h / 2 + b);
    const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * b, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 2 });
    g.translate(0, y + h / 2, -(d - 2 * b) / 2); return g;
  };
  const col = (p, n) => COL.stone.clone().lerp(COL.stoneDk, clamp(0.3 - p.y) * 0.8 + 0.2 * fbm(p.x * 6, p.y * 6, p.z * 6));
  P.add(box(1.0, 0.18, 1.0, 0), 'stone', { colorFn: col });
  P.add(box(0.88, 0.07, 0.88, 0.18), 'stone', { colorFn: col });
  P.add(box(0.72, 0.6, 0.72, 0.25), 'stone', { colorFn: col });
  P.add(box(0.86, 0.07, 0.86, 0.85), 'stone', { colorFn: col });
  P.add(box(0.94, 0.1, 0.94, 0.92), 'stone', { colorFn: col });
  // inscription panel with carved "letters"
  P.add(box(0.5, 0.3, 0.02, 0.4, 0.004), 'stone', { colorFn: (p) => COL.stone.clone().multiplyScalar(1.05) });
  for (let r = 0; r < 2; r++) {
    const n = r === 0 ? label.length : 6;
    for (let i = 0; i < n; i++) {
      if (r === 1 && hash(i, r, label.length) < 0.25) continue;
      const w = 0.032, x = (i - (n - 1) / 2) * 0.045;
      P.add(new THREE.BoxGeometry(w, r === 0 ? 0.05 : 0.035, 0.008).translate(x, 0.6 - r * 0.09, 0.37), 'stone', { color: COL.stoneDk.clone().multiplyScalar(0.7) });
    }
  }
  return P;
}

// ================================================================== BUILD + EXPORT
const scene = new THREE.Scene();
let total = 0;
for (const spec of GODS) {
  const root = new THREE.Group(); root.name = 'Statue_' + spec.name;
  root.userData = { label: spec.label, note: spec.note, pedestalTop: PED_H, figureHeight: 2.0 };
  const ped = pedestal(`${spec.name}_Pedestal_Part`, spec.label.toUpperCase()).build();
  ped.name = `${spec.name}_Pedestal`; root.add(ped); total += ped.userData.tris;
  const parts = figure(spec);
  const fig = new THREE.Group(); fig.name = `${spec.name}_Figure`; fig.position.y = PED_H;
  const m = new THREE.Matrix4().makeScale(FIG_SCALE, FIG_SCALE, FIG_SCALE);
  // small plinth the figure stands on (topples with it)
  parts.Legs.add(new THREE.CylinderGeometry(0.34, 0.36, 0.06, seg(32)).translate(0, -0.005, 0), spec.mat === 'bronze' ? 'stone' : spec.mat);
  let figTris = 0;
  for (const [k, p] of Object.entries(parts)) { const g = p.build(m); g.name = `${spec.name}_${k}`; if (g.children.length) { fig.add(g); figTris += g.userData.tris; } }
  root.add(fig); total += figTris;
  scene.add(root);
  console.log(`${spec.name.padEnd(8)} figure ${Math.round(figTris)} tris`);
}
if (!HD) {
  // The game's version: each god as two top-level pieces for the street kit,
  // the figure (feet at y = 0, so it can stand on any pedestal and topple)
  // and its pedestal.
  const game = new THREE.Scene();
  for (const root of [...scene.children]) {
    const god = root.name.replace('Statue_', '');
    const [ped, fig] = [root.getObjectByName(`${god}_Pedestal`), root.getObjectByName(`${god}_Figure`)];
    ped.name = `Pedestal_${god}`;
    fig.name = `Statue_${god}`;
    fig.position.y = 0;
    fig.userData = { ...root.userData };
    game.add(ped, fig);
  }
  const glb = await new GLTFExporter().parseAsync(game, { binary: true });
  writeFileSync('statues.glb', Buffer.from(glb));
  console.log(`statues.glb: ${(glb.byteLength / 1048576).toFixed(2)} MB, ${Math.round(total)} tris`);
  process.exit(0);
}
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync('pompeii-statues.glb', Buffer.from(glb));
console.log(`pompeii-statues.glb: ${(glb.byteLength / 1048576).toFixed(2)} MB, ${Math.round(total)} tris`);
