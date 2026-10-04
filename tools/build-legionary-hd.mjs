// Escape Pompeii — detailed Roman legionary (skinned, ~40k triangles)
// Output: legionary-hd.glb with animations Run, Jump, Slide, Stumble, Idle.
// Run:  node build-legionary-hd.mjs
// Faces +Z (glTF forward). Feet at y = 0. Height ~1.85 m incl. crest.
// Everything is one skeleton + 7 skinned meshes (one per material) = 7 draw calls.

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { writeFileSync } from 'node:fs';

globalThis.FileReader = class {
  readAsArrayBuffer(b) { b.arrayBuffer().then(x => { this.result = x; this.onloadend?.(); }); }
  readAsDataURL(b) { b.arrayBuffer().then(x => { this.result = `data:${b.type};base64,` + Buffer.from(x).toString('base64'); this.onloadend?.(); }); }
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const gauss = (d2, s) => Math.exp(-d2 / (2 * s * s));

// ------------------------------------------------------------------ noise
function hash(x, y, z) {
  let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) {
    r += hash(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return r;
}
const fbm = (p, f = 30) => 0.6 * vnoise(p.x * f, p.y * f, p.z * f) + 0.4 * vnoise(p.x * f * 2.7, p.y * f * 2.7, p.z * f * 2.7);

// ---------------------------------------------------------------- skeleton
const root = new THREE.Group(); root.name = 'Legionary';
const bones = {};
function bone(name, parent, pos) {
  const b = new THREE.Bone(); b.name = name; b.position.set(...pos);
  (parent ? bones[parent] : root).add(b); bones[name] = b; return b;
}
bone('Hips', null, [0, 0.97, 0]);
bone('Spine', 'Hips', [0, 0.08, 0]);
bone('Neck', 'Spine', [0, 0.44, 0]);
bone('Head', 'Neck', [0, 0.08, 0]);
for (const [s, sx] of [['L', 1], ['R', -1]]) {
  bone(`Thigh_${s}`, 'Hips', [0.095 * sx, -0.06, 0]);
  bone(`Shin_${s}`, `Thigh_${s}`, [0, -0.44, 0]);
  bone(`Foot_${s}`, `Shin_${s}`, [0, -0.40, 0]);
  bone(`Shoulder_${s}`, 'Spine', [0.215 * sx, 0.40, 0]);
  bone(`Elbow_${s}`, `Shoulder_${s}`, [0, -0.29, 0]);
  bone(`Hand_${s}`, `Elbow_${s}`, [0, -0.25, 0]);
}
bone('Scutum', 'Elbow_L', [0.135, -0.16, 0.05]);
root.updateMatrixWorld(true);
const BONE_LIST = Object.values(bones);
const BI = Object.fromEntries(BONE_LIST.map((b, i) => [b.name, i]));
const W = n => new THREE.Vector3().setFromMatrixPosition(bones[n].matrixWorld); // bind-pose world pos

// --------------------------------------------------------------- materials
const MATS = {
  skin:    { roughness: 0.62, metalness: 0.0 },
  cloth:   { roughness: 0.95, metalness: 0.0 },
  leather: { roughness: 0.72, metalness: 0.0 },
  iron:    { roughness: 0.38, metalness: 0.7 },
  brass:   { roughness: 0.35, metalness: 0.7 },
  hair:    { roughness: 0.9,  metalness: 0.0 },
  eye:     { roughness: 0.18, metalness: 0.0 },
};
const buf = {};
for (const k of Object.keys(MATS)) buf[k] = { pos: [], nor: [], col: [], si: [], sw: [], idx: [] };

const C = hex => new THREE.Color(hex); // stored linear
function shade(c, k) { return new THREE.Color(c.r * k, c.g * k, c.b * k); }

// add a geometry that is already in bind-pose world space
// opts: bone | weights(p) -> [[name,w],...]; color (Color) | colorFn(p,n,i) -> Color; noise amplitude
function add(geo, mat, opts) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const P = geo.attributes.position, N = geo.attributes.normal, B = buf[mat];
  const base = B.pos.length / 3;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  const noiseAmp = opts.noise ?? 0.06;
  for (let i = 0; i < P.count; i++) {
    p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i);
    B.pos.push(p.x, p.y, p.z); B.nor.push(n.x, n.y, n.z);
    let c = opts.colorFn ? opts.colorFn(p, n, i) : opts.color;
    const k = 1 + (fbm(p, opts.noiseFreq ?? 30) - 0.5) * 2 * noiseAmp;
    B.col.push(c.r * k, c.g * k, c.b * k);
    let w = opts.weights ? opts.weights(p) : [[opts.bone, 1]];
    w = w.filter(x => x[1] > 0.001).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = w.reduce((s, x) => s + x[1], 0);
    for (let j = 0; j < 4; j++) {
      B.si.push(w[j] ? BI[w[j][0]] : 0);
      B.sw.push(w[j] ? w[j][1] / tot : 0);
    }
  }
  if (geo.index) for (let i = 0; i < geo.index.count; i++) B.idx.push(base + geo.index.getX(i));
  else for (let i = 0; i < P.count; i++) B.idx.push(base + i);
}

// grid surface: fn(u, v) -> Vector3, u wraps if wrapU
function grid(nu, nv, fn, wrapU = false) {
  const pos = [], idx = [];
  const cols = wrapU ? nu : nu + 1;
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) {
    const q = fn(i / nu, j / nv); pos.push(q.x, q.y, q.z);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * cols + i, b = j * cols + ((i + 1) % cols), c = (j + 1) * cols + i, d = (j + 1) * cols + ((i + 1) % cols);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// flip winding (for surfaces whose normals come out inward)
function flip(g) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = t; } g.computeVertexNormals(); return g; }
const at = (g, x, y, z) => { g.translate(x, y, z); return g; };
function xf(g, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
  g.applyMatrix4(new THREE.Matrix4().compose(V(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), V(...scl)));
  return g;
}
// blend weight helper along a vertical limb
function limbWeights(boneA, yTop, yBot, upper, lower, upBlend = 0.12, lowBlend = 0.12) {
  return p => {
    const t = (yTop - p.y) / (yTop - yBot);
    const w = [[boneA, 1]];
    if (upper && t < upBlend) { const k = 0.5 * (1 - t / upBlend); w[0][1] -= k; w.push([upper, k]); }
    if (lower && t > 1 - lowBlend) { const k = 0.5 * ((t - (1 - lowBlend)) / lowBlend); w[0][1] -= k; w.push([lower, k]); }
    return w;
  };
}
// vertical limb loft with radius profile
function limb(cx, cz, yTop, yBot, rFn, { rx = 1, rz = 1, zOff = () => 0, nu = 28, nv = 24 } = {}) {
  return grid(nu, nv, (u, v) => {
    const a = u * TAU, r = rFn(v);
    return V(cx + Math.sin(a) * r * rx, lerp(yTop, yBot, v), cz + zOff(v) + Math.cos(a) * r * rz);
  }, true);
}
const ellipsoid = (rx, ry, rz, ws = 24, hs = 16) => new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz);

// ================================================================== COLOURS
const COL = {
  skin: C(0xc69270), skinDk: C(0x9c6a4c), lips: C(0x9e5b51), stubble: C(0x6e5546),
  hair: C(0x2b1f17), brow: C(0x2a1d15),
  tunic: C(0x8e1c20), tunicDk: C(0x5e1013), ash: C(0x8b8279),
  scarf: C(0xcfc3a8),
  iron: C(0xc2c6cb), ironDk: C(0x7b8087),
  brass: C(0xd9ad52),
  leather: C(0x6a4325), leatherDk: C(0x3f2614),
  shield: C(0x8d1b20), shieldBack: C(0x4d3624), gold: C(0xd2aa52),
  crest: C(0xa3161d), crestDk: C(0x5c0b10),
  eyeW: C(0xe8e2d8), iris: C(0x3b2618), pupil: C(0x0d0907),
};
// height-based dust: lower parts get greyer (ash from the eruption)
const dust = (c, y, top = 0.45, amt = 0.35) => c.clone().lerp(COL.ash, clamp((top - y) / top) * amt);

// ================================================================== BODY
const yH = W('Hips').y, yS = W('Spine').y, yN = W('Neck').y, yHd = W('Head').y;
for (const [s, sx] of [['L', 1], ['R', -1]]) {
  const x = 0.095 * sx;
  const yThigh = W(`Thigh_${s}`).y, yKnee = W(`Shin_${s}`).y, yAnk = W(`Foot_${s}`).y;
  const skinC = (p) => dust(COL.skin, p.y, 0.5, 0.25);
  // thigh
  add(limb(x, 0, yThigh + 0.05, yKnee - 0.03,
    v => lerp(0.088, 0.052, Math.pow(v, 0.85)) + 0.007 * Math.sin(Math.PI * v),
    { rx: 0.95, rz: 1.05, zOff: v => 0.006 * Math.sin(Math.PI * v) }),
  'skin', { weights: limbWeights(`Thigh_${s}`, yThigh + 0.05, yKnee - 0.03, 'Hips', `Shin_${s}`, 0.15, 0.14), colorFn: skinC, noise: 0.04 });
  // knee cap
  add(at(ellipsoid(0.05, 0.05, 0.052), x, yKnee, 0.008), 'skin',
    { weights: () => [[`Thigh_${s}`, 0.5], [`Shin_${s}`, 0.5]], colorFn: skinC, noise: 0.04 });
  // shin with calf
  add(limb(x, 0, yKnee + 0.03, yAnk - 0.01,
    v => lerp(0.05, 0.033, smooth(v)) + 0.012 * gauss((v - 0.3) ** 2, 0.15),
    { rx: 0.92, rz: 1.06, zOff: v => -0.01 * gauss((v - 0.3) ** 2, 0.18) }),
  'skin', { weights: limbWeights(`Shin_${s}`, yKnee + 0.03, yAnk - 0.01, `Thigh_${s}`, `Foot_${s}`, 0.14, 0.12), colorFn: skinC, noise: 0.04 });
  // foot
  add(xf(ellipsoid(0.042, 0.032, 0.115), [x, 0.045, 0.045], [0.08, 0, 0]), 'skin', { bone: `Foot_${s}`, colorFn: skinC, noise: 0.04 });

  // ---- caligae (hobnailed sandals)
  const sole = new THREE.Shape();
  sole.moveTo(0, -0.07); sole.bezierCurveTo(0.05, -0.075, 0.05, 0.05, 0.045, 0.12);
  sole.bezierCurveTo(0.04, 0.175, -0.04, 0.175, -0.045, 0.12);
  sole.bezierCurveTo(-0.05, 0.05, -0.05, -0.075, 0, -0.07);
  const soleG = new THREE.ExtrudeGeometry(sole, { depth: 0.02, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1, curveSegments: 16 });
  xf(soleG, [x, 0.0, 0.005], [Math.PI / 2, 0, 0]);
  soleG.translate(0, 0.022, 0);
  add(soleG, 'leather', { bone: `Foot_${s}`, color: COL.leatherDk, noise: 0.1 });
  // hobnails
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * TAU, zz = 0.05 + Math.cos(a) * 0.1, xx = Math.sin(a) * 0.035;
    add(at(new THREE.SphereGeometry(0.004, 6, 4), x + xx, 0.001, zz - 0.0), 'iron', { bone: `Foot_${s}`, color: COL.ironDk, noise: 0.05 });
  }
  // straps over the foot (lattice of arches)
  for (let k = 0; k < 6; k++) {
    const zc = -0.02 + k * 0.032, tilt = (k % 2 ? 0.35 : -0.35);
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const a = -Math.PI / 2 + (i / 16) * Math.PI;
      const ry = 0.034 * (1 - k * 0.07), rx = 0.046;
      pts.push(V(x + Math.sin(a) * rx, 0.03 + Math.cos(a) * ry + 0.012, zc + Math.sin(a) * tilt * 0.02));
    }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.0045, 5, false), 'leather',
      { bone: `Foot_${s}`, color: COL.leather, noise: 0.12 });
  }
  // heel cup and ankle straps
  add(grid(16, 4, (u, v) => { const a = Math.PI * 0.55 + u * Math.PI * 0.9; return V(x + Math.sin(a) * 0.047, 0.02 + v * 0.06, -0.005 + Math.cos(a) * 0.06); }),
    'leather', { bone: `Foot_${s}`, color: COL.leather, noise: 0.12 });
  for (const [yy, rr] of [[0.1, 0.039], [0.14, 0.037], [0.18, 0.036]]) {
    add(at(new THREE.TorusGeometry(rr, 0.005, 5, 24).rotateX(Math.PI / 2), x, yy, -0.002), 'leather',
      { weights: () => [[`Shin_${s}`, yy > 0.12 ? 1 : 0.6], [`Foot_${s}`, yy > 0.12 ? 0 : 0.4]], color: COL.leather, noise: 0.12 });
  }
  // vertical lacing strap front of ankle
  add(xf(new THREE.BoxGeometry(0.012, 0.13, 0.006), [x, 0.12, 0.036]), 'leather', { weights: () => [[`Shin_${s}`, 0.6], [`Foot_${s}`, 0.4]], color: COL.leatherDk });

  // ---- arms
  const xs = 0.215 * sx, yShoulder = W(`Shoulder_${s}`).y, yEl = W(`Elbow_${s}`).y, yWr = W(`Hand_${s}`).y;
  add(limb(xs, 0, yShoulder + 0.03, yEl - 0.02,
    v => lerp(0.052, 0.038, smooth(v)) + 0.006 * gauss((v - 0.45) ** 2, 0.15),
    { rx: 0.92, rz: 1.02, zOff: v => 0.004 * gauss((v - 0.45) ** 2, 0.15) }),
  'skin', { weights: limbWeights(`Shoulder_${s}`, yShoulder + 0.03, yEl - 0.02, 'Spine', `Elbow_${s}`, 0.12, 0.12), color: COL.skin, noise: 0.04 });
  add(at(ellipsoid(0.04, 0.042, 0.04), xs, yEl, -0.004), 'skin', { weights: () => [[`Shoulder_${s}`, 0.5], [`Elbow_${s}`, 0.5]], color: COL.skin, noise: 0.04 });
  add(limb(xs, 0, yEl + 0.02, yWr - 0.005,
    v => lerp(0.041, 0.027, smooth(v)) + 0.006 * gauss((v - 0.2) ** 2, 0.12),
    { rx: 0.85, rz: 1.12 }),
  'skin', { weights: limbWeights(`Elbow_${s}`, yEl + 0.02, yWr - 0.005, `Shoulder_${s}`, `Hand_${s}`, 0.12, 0.1), color: COL.skin, noise: 0.04 });
  // leather wrist guard
  add(limb(xs, 0, yWr + 0.07, yWr + 0.025, () => 0.031, { rx: 0.9, rz: 1.12, nv: 2 }), 'leather', { bone: `Elbow_${s}`, color: COL.leather, noise: 0.12 });
  // hand: palm + 4 two-segment fingers + thumb (palm faces the body)
  const hy = yWr;
  add(xf(ellipsoid(0.017, 0.048, 0.039, 16, 12), [xs, hy - 0.045, 0.004]), 'skin', { bone: `Hand_${s}`, color: COL.skin, noise: 0.04 });
  for (let f = 0; f < 4; f++) {
    const zf = 0.026 - f * 0.0175, len = [0.042, 0.046, 0.044, 0.036][f];
    const curl = -0.5 * sx, x0 = xs - 0.002 * sx, y0 = hy - 0.09;
    const g1 = new THREE.CapsuleGeometry(0.0082, len, 3, 8);
    xf(g1, [0, -len / 2, 0]); xf(g1, [x0, y0, zf], [0, 0, curl]);
    add(g1, 'skin', { bone: `Hand_${s}`, color: COL.skin, noise: 0.04 });
    const ex = x0 + Math.sin(curl) * len, ey = y0 - Math.cos(curl) * len;
    const g2 = new THREE.CapsuleGeometry(0.0075, len * 0.75, 3, 8);
    xf(g2, [0, -len * 0.375, 0]); xf(g2, [ex, ey, zf], [0, 0, curl * 2.1]);
    add(g2, 'skin', { bone: `Hand_${s}`, color: COL.skin, noise: 0.04 });
  }
  const gT = new THREE.CapsuleGeometry(0.0095, 0.045, 3, 8);
  xf(gT, [0, -0.0225, 0]); xf(gT, [xs - 0.008 * sx, hy - 0.035, 0.038], [0.55, 0, -0.45 * sx]);
  add(gT, 'skin', { bone: `Hand_${s}`, color: COL.skin, noise: 0.04 });

  // tunic sleeve
  add(grid(28, 6, (u, v) => {
    const a = u * TAU, r = lerp(0.056, 0.058, v) + 0.004 * Math.sin(a * 7 + v * 2) * v;
    return V(xs + Math.sin(a) * r, lerp(yShoulder + 0.0, yShoulder - 0.14 - 0.01 * Math.sin(a * 3), v), Math.cos(a) * r * 1.05);
  }, true), 'cloth', { weights: limbWeights(`Shoulder_${s}`, yShoulder + 0.05, yShoulder - 0.14, 'Spine', null, 0.3, 0),
    colorFn: (p, n, i) => COL.tunic, noise: 0.08 });
}

// neck
add(limb(0, 0.0, yN - 0.04, yHd + 0.04, v => lerp(0.062, 0.056, v), { rx: 1.0, rz: 0.95, zOff: v => 0.01 * v }), 'skin', {
  weights: p => {
    const t = (p.y - (yN - 0.04)) / 0.16;
    if (t < 0.35) return [['Spine', 0.5 - t], ['Neck', 0.5 + t]];
    if (t > 0.65) return [['Neck', 1.5 - t], ['Head', t - 0.5]];
    return [['Neck', 1]];
  }, color: COL.skin, noise: 0.03,
});

// ================================================================== HEAD
const HC = V(0, yHd + 0.08, 0.012); // head centre
{
  const g = new THREE.SphereGeometry(1, 56, 40);
  const P = g.attributes.position, q = new THREE.Vector3();
  const bumps = [
    // [x, y, z (relative to head centre), sigma, amplitude]
    [0, -0.026, 0.099, 0.009, 0.011],   // nose tip
    [0, -0.004, 0.097, 0.008, 0.004],   // nose bridge
    [0, -0.015, 0.098, 0.009, 0.006],   // nose mid
    [0.011, -0.03, 0.094, 0.006, 0.003], [-0.011, -0.03, 0.094, 0.006, 0.003], // nostrils
    [0.03, 0.017, 0.092, 0.017, 0.006], [-0.03, 0.017, 0.092, 0.017, 0.006], // brow ridge
    [0.05, -0.02, 0.07, 0.022, 0.007], [-0.05, -0.02, 0.07, 0.022, 0.007],     // cheekbones
    [0.032, -0.004, 0.09, 0.012, -0.004], [-0.032, -0.004, 0.09, 0.012, -0.004], // eye sockets
    [0, -0.1, 0.075, 0.018, 0.009],     // chin
    [0, -0.061, 0.096, 0.011, 0.004],   // lips
    [0.028, -0.055, 0.085, 0.015, -0.003], [-0.028, -0.055, 0.085, 0.015, -0.003], // mouth corners
  ];
  for (let i = 0; i < P.count; i++) {
    q.fromBufferAttribute(P, i);
    let { x, y, z } = q;
    let rx = 0.083, ry = 0.11, rz = 0.099;
    if (y < 0) rx *= 1 - 0.17 * Math.pow(-y, 1.6);                // jaw narrows
    if (y < -0.3 && z > 0) rz *= 1 - 0.12 * Math.pow(-y, 2);
    if (z < 0) rz *= 1.08;                                        // back of skull
    let px = x * rx, py = y * ry, pz = z * rz;
    let d = 0;
    for (const [bx, by, bz, s, a] of bumps) d += a * gauss((px - bx) ** 2 + (py - by) ** 2 + (pz - bz) ** 2, s);
    const len = Math.hypot(px, py, pz);
    px += px / len * d; py += py / len * d; pz += pz / len * d;
    P.setXYZ(i, px + HC.x, py + HC.y, pz + HC.z);
  }
  g.computeVertexNormals();
  add(g, 'skin', {
    weights: p => (p.y < HC.y - 0.09 && p.z < 0.0) ? [['Head', 0.7], ['Neck', 0.3]] : [['Head', 1]],
    colorFn: p => {
      const r = p.clone().sub(HC);
      let c = COL.skin.clone();
      c.lerp(COL.skinDk, clamp((-r.y - 0.03) * 3) * 0.25);                                     // shadow under jaw
      c.lerp(COL.lips, gauss(r.x ** 2 * 0.6 + (r.y + 0.061) ** 2 + (r.z - 0.098) ** 2 * 0.3, 0.008) * 0.8);
      if (r.y < -0.035 && r.z > 0.01) c.lerp(COL.stubble, 0.28 * smooth((-r.y - 0.035) / 0.03)); // stubble
      if ((r.z < 0.02 && r.y > -0.04) || r.y > 0.07) c.lerp(COL.hair, smooth((0.03 - r.z) / 0.04) * smooth((r.y + 0.06) / 0.04)); // short hair
      c.multiplyScalar(1 - 0.22 * clamp((r.y - 0.012) / 0.03) * smooth((r.z - 0.0) / 0.06));   // shade under helmet brim
      c.multiplyScalar(1 - 0.25 * gauss((Math.abs(r.x) - 0.031) ** 2 + (r.y + 0.003) ** 2 * 0.5, 0.012)); // eye sockets
      c.multiplyScalar(1 - 0.18 * gauss((Math.abs(r.x) - 0.022) ** 2 + (r.y + 0.04) ** 2, 0.008) * smooth((r.z - 0.07) / 0.02)); // nasolabial
      c.multiplyScalar(1 - 0.3 * gauss(r.x ** 2 + (r.y + 0.036) ** 2, 0.006) * smooth((r.z - 0.085) / 0.01)); // under nose
      c.lerp(new THREE.Color(0xc77a68), gauss(r.x * r.x * 0 + (Math.abs(r.x) - 0.05) ** 2 + (r.y + 0.03) ** 2, 0.015) * 0.12); // cheek warmth
      return c;
    }, noise: 0.035, noiseFreq: 60,
  });
  { const mp = []; for (let i = 0; i <= 10; i++) { const t = i / 10 - 0.5; mp.push(V(t * 0.038, HC.y - 0.059 + 0.0015 * t * t * 4, HC.z + 0.1 - 0.012 * (t * t * 4))); }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(mp), 12, 0.0018, 4), 'skin', { bone: 'Head', color: C(0x5a3128), noise: 0 }); }
  // eyes
  for (const sx of [1, -1]) {
    const ec = V(0.031 * sx, HC.y - 0.004, HC.z + 0.082);
    add(at(new THREE.SphereGeometry(0.0125, 16, 12), ec.x, ec.y, ec.z), 'eye', { bone: 'Head', color: COL.eyeW, noise: 0.02 });
    add(xf(new THREE.SphereGeometry(0.0069, 12, 8), [ec.x, ec.y, ec.z + 0.009], [0, 0, 0], [1, 1, 0.5]), 'eye', { bone: 'Head', color: COL.iris, noise: 0.05 });
    add(xf(new THREE.SphereGeometry(0.0028, 8, 6), [ec.x, ec.y, ec.z + 0.0123], [0, 0, 0], [1, 1, 0.4]), 'eye', { bone: 'Head', color: COL.pupil, noise: 0 });
    // upper eyelid
    add(xf(new THREE.SphereGeometry(0.0135, 16, 8, 0, TAU, 0, Math.PI * 0.36), [ec.x, ec.y + 0.001, ec.z - 0.0008], [0.2, 0, 0]), 'skin', { bone: 'Head', color: COL.skinDk, noise: 0.03 });
    // eyebrow
    const bp = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; bp.push(V(ec.x + sx * lerp(-0.016, 0.02, t), ec.y + 0.021 + 0.004 * Math.sin(t * Math.PI), HC.z + 0.093 - 0.012 * t * t)); }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bp), 10, 0.0032, 5), 'hair', { bone: 'Head', color: COL.brow, noise: 0.05 });
    // ear
    const ear = xf(ellipsoid(0.008, 0.03, 0.019, 14, 10), [0.08 * sx, HC.y - 0.008, HC.z - 0.012], [0.15, 0.25 * sx, 0.1 * sx]);
    add(ear, 'skin', { bone: 'Head', color: COL.skin.clone().lerp(COL.lips, 0.1), noise: 0.04 });
  }
}

// ================================================================== TORSO
// tunic body (spine space) - mostly under armour
const torsoA = y => { const t = (y - (yS - 0.1)) / 0.55; return 0.152 + 0.026 * smooth(t * 1.6) - 0.025 * smooth((t - 0.85) * 6); };
const torsoB = y => { const t = (y - (yS - 0.1)) / 0.55; return 0.11 + 0.02 * smooth(t * 1.5) - 0.02 * smooth((t - 0.85) * 6); };
add(grid(48, 18, (u, v) => {
  const y = lerp(yS - 0.1, yS + 0.36, v), a = u * TAU;
  return V(Math.sin(a) * torsoA(y), y, Math.cos(a) * torsoB(y));
}, true), 'cloth', { weights: p => { const t = clamp((p.y - (yS - 0.1)) / 0.15); return [['Hips', 1 - t], ['Spine', t]]; }, color: COL.tunic, noise: 0.06 });
// shoulder top closing cap of tunic
add(grid(48, 4, (u, v) => {
  const y = yS + 0.36 + v * 0.08, a = u * TAU;
  return V(Math.sin(a) * lerp(torsoA(yS + 0.36), 0.058, Math.sqrt(v)), y, Math.cos(a) * lerp(torsoB(yS + 0.36), 0.054, Math.sqrt(v)));
}, true), 'cloth', { bone: 'Spine', color: COL.tunic });

// tunic skirt with folds, follows the thighs at the hem
add(grid(72, 20, (u, v) => {
  const a = u * TAU, y = lerp(yH + 0.04, 0.665 + 0.012 * Math.sin(a * 5 + 1.3), v);
  const r = lerp(0.165, 0.25, Math.pow(v, 0.8)) + 0.011 * Math.pow(v, 1.2) * Math.sin(a * 11);
  return V(Math.sin(a) * r, y, Math.cos(a) * r * 0.8);
}, true), 'cloth', {
  weights: p => {
    const f = clamp((yH + 0.04 - p.y) / 0.34);
    const wl = 0.75 * Math.pow(f, 1.5) * gauss((p.x - 0.1) ** 2, 0.11);
    const wr = 0.75 * Math.pow(f, 1.5) * gauss((p.x + 0.1) ** 2, 0.11);
    return [['Hips', Math.max(0.05, 1 - wl - wr)], ['Thigh_L', wl], ['Thigh_R', wr]];
  },
  colorFn: p => {
    const a = Math.atan2(p.x, p.z), fold = 0.5 + 0.5 * Math.sin(a * 11);
    const f = clamp((yH + 0.04 - p.y) / 0.34);
    return dust(COL.tunic.clone().lerp(COL.tunicDk, (1 - fold) * 0.45 * f), p.y, 0.95, 0.4);
  }, noise: 0.07,
});
// focale (wool scarf) around neck
add(xf(new THREE.TorusGeometry(0.07, 0.024, 10, 28), [0, yN + 0.03, 0.012], [Math.PI / 2 - 0.15, 0, 0], [1.1, 1, 0.95]), 'cloth',
  { weights: () => [['Spine', 0.6], ['Neck', 0.4]], color: COL.scarf, noise: 0.1 });

// ----- lorica segmentata girth hoops
const hoop = (y0, y1, grow, opts = {}) => grid(80, 3, (u, v) => {
  const a = u * TAU;
  const y = v < 2 / 3 ? lerp(y1, y0, v * 1.5) : y0;
  const flare = v < 2 / 3 ? v * 1.5 * 0.006 : 0.006 - (v - 2 / 3) * 3 * 0.009;
  const A = torsoA(y) + grow + flare, Bz = torsoB(y) + grow + flare;
  return V(Math.sin(a) * A, y, Math.cos(a) * Bz);
}, true);
const ironColor = (p, rowDark) => { const c = COL.iron.clone(); c.lerp(COL.ironDk, rowDark); return c; };
for (let i = 0; i < 7; i++) {
  const y0 = yS - 0.045 + i * 0.044, y1 = y0 + 0.052;
  add(hoop(y0, y1, 0.02 - i * 0.0005), 'iron', {
    weights: p => { const t = clamp((p.y - (yS - 0.06)) / 0.08); return [['Hips', 0.3 * (1 - t)], ['Spine', 1 - 0.3 * (1 - t)]]; },
    colorFn: p => ironColor(p, clamp((y1 - p.y) / 0.05) * 0.55), noise: 0.09, noiseFreq: 45,
  });
}
// chest and back plates (larger bands) + collar plates
for (let i = 0; i < 2; i++) {
  const y0 = yS + 0.265 + i * 0.06, y1 = y0 + 0.068;
  add(hoop(y0, y1, 0.026), 'iron', { bone: 'Spine', colorFn: p => ironColor(p, clamp((y1 - p.y) / 0.06) * 0.45), noise: 0.09, noiseFreq: 45 });
}
add(grid(64, 6, (u, v) => {
  const a = u * TAU, y = yS + 0.385 + v * 0.055;
  return V(Math.sin(a) * lerp(torsoA(yS + 0.39) + 0.026, 0.085, smooth(v)), y, Math.cos(a) * lerp(torsoB(yS + 0.39) + 0.026, 0.075, smooth(v)));
}, true), 'iron', { bone: 'Spine', colorFn: p => ironColor(p, 0.1), noise: 0.09, noiseFreq: 45 });

// front closure: vertical brass strips, hinges and tie buckles
for (const z of [1, -1]) {
  for (let i = 0; i < 9; i++) {
    const y = yS - 0.02 + i * 0.044;
    const zz = (torsoB(y) + 0.028) * z;
    add(xf(new THREE.BoxGeometry(0.03, 0.012, 0.006), [0, y, zz]), 'brass', { bone: 'Spine', color: COL.brass, noise: 0.08 });
    if (z > 0) for (const sx of [1, -1]) add(at(new THREE.SphereGeometry(0.0055, 8, 6), 0.022 * sx, y, zz), 'brass', { bone: 'Spine', color: COL.brass });
  }
}
// rosette rivets on chest plates
for (const sx of [1, -1]) for (const z of [1, -1]) {
  add(xf(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 12), [0.07 * sx, yS + 0.33, (torsoB(yS + 0.33) + 0.031) * z], [Math.PI / 2, 0, 0]), 'brass', { bone: 'Spine', color: COL.brass });
}

// ----- shoulder guards: curved strips arching front-to-back
function shoulderStrip(xc, yc, r, width, a0, a1) {
  return grid(20, 2, (u, v) => {
    const a = lerp(a0, a1, u);
    const rr = r + (v === 0.5 ? 0.002 : 0);
    return V(xc + lerp(-width / 2, width / 2, v), yc + Math.cos(a) * rr, Math.sin(a) * rr * 1.12);
  });
}
for (const [s, sx] of [['L', 1], ['R', -1]]) {
  for (let i = 0; i < 6; i++) {
    const xc = (0.105 + i * 0.03) * sx, r = 0.1 + i * 0.006, yc = yS + 0.345 - i * 0.017;
    const g = shoulderStrip(xc, yc, r, 0.034, -1.6, 1.6);
    if (sx < 0) flip(g);
    const onArm = i >= 3;
    add(g, 'iron', {
      weights: onArm ? () => [[`Shoulder_${s}`, 0.75], ['Spine', 0.25]] : () => [['Spine', 1]],
      colorFn: p => ironColor(p, (i % 2) * 0.2 + clamp((yc - p.y) / 0.15) * 0.3), noise: 0.09, noiseFreq: 45,
    });
    // brass edge on the outermost strip
    if (i === 5) {
      const pts = []; for (let k = 0; k <= 20; k++) { const a = lerp(-1.6, 1.6, k / 20); pts.push(V(xc + 0.017 * sx, yc + Math.cos(a) * r, Math.sin(a) * r * 1.12)); }
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.003, 5), 'brass', { weights: () => [[`Shoulder_${s}`, 0.75], ['Spine', 0.25]], color: COL.brass });
    }
  }
}

// ----- belt (cingulum), studded apron, gladius and pugio
const beltY = yH + 0.02;
add(grid(64, 2, (u, v) => { const a = u * TAU, r = 0.176; return V(Math.sin(a) * r, beltY + (v - 0.5) * 0.046, Math.cos(a) * r * 0.79); }, true),
  'leather', { bone: 'Hips', color: COL.leather, noise: 0.12 });
for (let i = 0; i < 12; i++) {
  const a = -1.35 + (i / 11) * 2.7;
  add(xf(new THREE.BoxGeometry(0.036, 0.036, 0.004), [Math.sin(a) * 0.178, beltY, Math.cos(a) * 0.178 * 0.79], [0, a, 0]), 'brass', { bone: 'Hips', color: COL.brass, noise: 0.1 });
  add(xf(new THREE.CylinderGeometry(0.008, 0.008, 0.004, 10), [Math.sin(a) * 0.181, beltY, Math.cos(a) * 0.181 * 0.79], [Math.PI / 2, a, 0]), 'brass', { bone: 'Hips', color: COL.brass.clone().multiplyScalar(1.15) });
}
for (let i = 0; i < 6; i++) {
  const x = -0.065 + i * 0.026, a = Math.asin(x / 0.19);
  const len = 0.25, zTop = Math.cos(a) * 0.178 * 0.79 + 0.006;
  const strap = xf(new THREE.BoxGeometry(0.017, len, 0.004), [x, beltY - 0.02 - len / 2, zTop + 0.012], [-0.07, a * 0.5, 0]);
  add(strap, 'leather', { bone: 'Hips', color: COL.leatherDk, noise: 0.12 });
  for (let k = 0; k < 6; k++) {
    const y = beltY - 0.04 - k * 0.038;
    add(xf(new THREE.CylinderGeometry(0.0075, 0.0075, 0.004, 10), [x, y, zTop + 0.016 + (beltY - y) * 0.07], [Math.PI / 2, 0, 0]), 'brass', { bone: 'Hips', color: COL.brass, noise: 0.08 });
  }
  add(xf(new THREE.ConeGeometry(0.011, 0.03, 8), [x, beltY - 0.29, zTop + 0.035], [Math.PI, 0, 0]), 'brass', { bone: 'Hips', color: COL.brass });
}
// Pompeii-type gladius on the right hip
{
  const x = -0.2, z = 0.04, yTop = 1.04, len = 0.5;
  const sh = new THREE.Shape();
  sh.moveTo(-0.028, 0); sh.lineTo(0.028, 0); sh.lineTo(0.025, -len + 0.05); sh.lineTo(0, -len); sh.lineTo(-0.025, -len + 0.05); sh.lineTo(-0.028, 0);
  const sc = new THREE.ExtrudeGeometry(sh, { depth: 0.014, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 });
  sc.translate(0, 0, -0.007); xf(sc, [x, yTop, z], [0, Math.PI / 2, -0.08]);
  add(sc, 'leather', { bone: 'Hips', colorFn: p => dust(COL.leatherDk, p.y, 0.9, 0.25), noise: 0.12 });
  for (const [yy, h] of [[-0.02, 0.025], [-0.12, 0.012], [-0.3, 0.012]]) {
    add(xf(new THREE.BoxGeometry(0.03, h, 0.066), [x - 0.003 + yy * 0.08, yTop + yy, z], [0, 0, -0.08]), 'brass', { bone: 'Hips', color: COL.brass, noise: 0.1 });
  }
  add(xf(new THREE.ConeGeometry(0.02, 0.07, 10), [x - 0.035, yTop - len + 0.02, z], [Math.PI, 0, -0.08], [0.7, 1, 1.3]), 'brass', { bone: 'Hips', color: COL.brass });
  const hx = x + 0.008;
  add(xf(ellipsoid(0.02, 0.012, 0.037, 14, 8), [hx, yTop + 0.012, z], [0, 0, -0.08]), 'brass', { bone: 'Hips', color: COL.brass });
  add(xf(new THREE.CylinderGeometry(0.012, 0.013, 0.08, 10), [hx + 0.004, yTop + 0.055, z], [0, 0, -0.08]), 'leather', { bone: 'Hips', color: C(0xd8ccb4), noise: 0.1 });
  for (let k = 0; k < 4; k++) add(xf(new THREE.TorusGeometry(0.013, 0.0025, 4, 12), [hx + 0.003 + k * 0.0016, yTop + 0.025 + k * 0.02, z], [Math.PI / 2, 0, -0.08]), 'leather', { bone: 'Hips', color: C(0xb8a888) });
  add(xf(ellipsoid(0.017, 0.013, 0.027, 14, 10), [hx + 0.009, yTop + 0.1, z], [0, 0, -0.08]), 'brass', { bone: 'Hips', color: C(0xd8ccb4) });
}
// pugio (dagger) on the left hip
{
  const x = 0.19, z = 0.02, yTop = 1.0;
  add(xf(new THREE.ConeGeometry(0.022, 0.22, 4), [x, yTop - 0.12, z], [Math.PI, Math.PI / 4, 0.08], [1, 1, 0.35]), 'brass', { bone: 'Hips', color: COL.brass.clone().multiplyScalar(0.85), noise: 0.1 });
  add(xf(new THREE.CylinderGeometry(0.009, 0.009, 0.06, 8), [x - 0.002, yTop + 0.03, z], [0, 0, 0.08]), 'leather', { bone: 'Hips', color: COL.leatherDk });
  add(at(new THREE.SphereGeometry(0.014, 10, 8), x - 0.005, yTop + 0.065, z), 'brass', { bone: 'Hips', color: COL.brass });
}

// ================================================================== HELMET (Imperial Gallic)
{
  const hc = HC;
  const bowlC = V(0, hc.y + 0.026, hc.z - 0.006);
  const fit = new THREE.Matrix4().makeTranslation(bowlC.x, bowlC.y, bowlC.z)
    .multiply(new THREE.Matrix4().makeScale(0.86, 0.93, 0.89))
    .multiply(new THREE.Matrix4().makeTranslation(-bowlC.x, -bowlC.y, -bowlC.z));
  const addH = (g, m, o) => { g.applyMatrix4(fit); add(g, m, o); };
  const bowl = new THREE.SphereGeometry(1, 48, 22, 0, TAU, 0, Math.PI * 0.53);
  bowl.scale(0.112, 0.118, 0.128); bowl.translate(bowlC.x, bowlC.y, bowlC.z);
  addH(bowl, 'iron', { bone: 'Head', colorFn: p => ironColor(p, clamp((bowlC.y + 0.04 - p.y) / 0.05) * 0.3), noise: 0.08, noiseFreq: 50 });
  // embossed eyebrows on the bowl front
  for (const sx of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, a = sx * lerp(0.08, 0.95, t);
      pts.push(V(Math.sin(a) * 0.114, bowlC.y + 0.02 + 0.03 * Math.sin(t * Math.PI) - 0.01 * t, bowlC.z + Math.cos(a) * 0.13));
    }
    addH(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.004, 5), 'iron', { bone: 'Head', color: COL.iron, noise: 0.08 });
  }
  // brow reinforcement (front peak)
  addH(grid(40, 2, (u, v) => {
    const a = lerp(-0.95, 0.95, u), r = lerp(0.118, 0.142, v);
    return V(Math.sin(a) * r * 0.98, bowlC.y + 0.006 - v * 0.012, bowlC.z + Math.cos(a) * r * 1.03);
  }), 'iron', { bone: 'Head', color: COL.iron, noise: 0.08 });
  addH(grid(40, 1, (u, v) => {
    const a = lerp(-0.95, 0.95, u), r = 0.118;
    return V(Math.sin(a) * r * 0.98, bowlC.y + 0.012 - v * 0.016, bowlC.z + Math.cos(a) * r * 1.03);
  }), 'brass', { bone: 'Head', color: COL.brass, noise: 0.08 });
  // flaring neck guard with stepped ridges
  addH(grid(40, 8, (u, v) => {
    const a = lerp(Math.PI * 0.7, Math.PI * 1.3, u);
    const r = lerp(0.124, 0.178, Math.pow(v, 1.3)), y = bowlC.y - lerp(0.0, 0.085, v) + 0.012 * v * v;
    return V(Math.sin(a) * r * 0.95, y - (v > 0.15 && v < 0.25 ? 0.004 : 0), bowlC.z + Math.cos(a) * r);
  }), 'iron', { bone: 'Head', colorFn: p => ironColor(p, 0.15), noise: 0.08 });
  for (const k of [0.22, 0.95]) {
    const pts = [];
    for (let i = 0; i <= 20; i++) { const a = lerp(Math.PI * 0.7, Math.PI * 1.3, i / 20), r = lerp(0.124, 0.178, Math.pow(k, 1.3)); pts.push(V(Math.sin(a) * r * 0.95, bowlC.y - lerp(0, 0.085, k) + 0.012 * k * k, bowlC.z + Math.cos(a) * r)); }
    addH(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, k > 0.5 ? 0.004 : 0.003, 5), 'brass', { bone: 'Head', color: COL.brass });
  }
  // ear guards
  for (const sx of [1, -1]) addH(grid(12, 2, (u, v) => {
    const a = lerp(-1.2, 1.2, u); const r = 0.03 + v * 0.008;
    return V(sx * (0.114 + v * 0.004), bowlC.y - 0.006 + Math.cos(a) * r * 0.4 - 0.004, hc.z - 0.012 + Math.sin(a) * r);
  }), 'iron', { bone: 'Head', color: COL.iron });
  // cheek guards (hinged plates)
  for (const sx of [1, -1]) {
    const shp = new THREE.Shape();
    shp.moveTo(-0.045, 0); shp.lineTo(0.035, 0);
    shp.bezierCurveTo(0.05, -0.03, 0.045, -0.08, 0.03, -0.12);
    shp.bezierCurveTo(0.015, -0.135, -0.01, -0.13, -0.02, -0.11);
    shp.bezierCurveTo(-0.035, -0.08, -0.05, -0.04, -0.045, 0);
    const cg = new THREE.ExtrudeGeometry(shp, { depth: 0.004, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 1, curveSegments: 10 });
    cg.rotateY(Math.PI / 2 * sx);
    // bend slightly around the face
    const P = cg.attributes.position;
    for (let i = 0; i < P.count; i++) { const zz = P.getZ(i); P.setX(i, P.getX(i) - sx * 0.25 * zz * zz * 8); }
    cg.computeVertexNormals();
    xf(cg, [sx * 0.104, bowlC.y - 0.004, hc.z + 0.02], [0, 0, sx * 0.1]);
    addH(cg, 'iron', { bone: 'Head', color: COL.iron, noise: 0.08 });
    addH(xf(new THREE.CylinderGeometry(0.008, 0.008, 0.004, 12), [sx * 0.114, bowlC.y - 0.05, hc.z + 0.028], [0, 0, Math.PI / 2]), 'brass', { bone: 'Head', color: COL.brass });
    addH(xf(new THREE.BoxGeometry(0.004, 0.012, 0.05), [sx * 0.112, bowlC.y - 0.009, hc.z + 0.02]), 'brass', { bone: 'Head', color: COL.brass });
  }
  // crest holder and horsehair crest (fan of strands front-to-back)
  addH(xf(new THREE.BoxGeometry(0.014, 0.02, 0.17), [0, bowlC.y + 0.123, bowlC.z]), 'brass', { bone: 'Head', color: COL.brass });
  addH(xf(new THREE.CylinderGeometry(0.009, 0.013, 0.02, 10), [0, bowlC.y + 0.115, bowlC.z + 0.0]), 'brass', { bone: 'Head', color: COL.brass });
  const strandGeos = [];
  const N = 230;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), a = lerp(-0.95, 1.05, t);           // front (+) to back (-)
    const baseY = bowlC.y + 0.128, baseZ = bowlC.z + Math.sin(a) * 0.09;
    const len = 0.1 + 0.025 * Math.sin(t * Math.PI) + (hash(i, 1, 2) - 0.5) * 0.015;
    const lean = a * 0.55 + (hash(i, 3, 4) - 0.5) * 0.15;
    const side = (hash(i, 5, 6) - 0.5) * 0.05;
    const pts = [V(side * 0.3, baseY, baseZ)];
    for (let k = 1; k <= 3; k++) {
      const f = k / 3;
      pts.push(V(side * (0.3 + f), baseY + Math.cos(lean * f) * len * f, baseZ + Math.sin(lean * f) * len * f - 0.012 * f * f));
    }
    strandGeos.push([new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 4, 0.0052 - 0.0012 * hash(i, 7, 8), 3), hash(i, 9, 9)]);
  }
  for (const [g, h] of strandGeos) addH(g, 'hair', { bone: 'Head', colorFn: p => COL.crest.clone().lerp(COL.crestDk, 0.15 + 0.5 * h * clamp((bowlC.y + 0.2 - p.y) * 6)), noise: 0.06 });
}

// ================================================================== SCUTUM
{
  const S = W('Scutum');
  const R = 0.52, HH = 0.48, HW = 0.31, arc = HW / R, T = 0.012;
  const surf = (s, y, d) => { const a = s / R; return V(S.x - R + (R + d) * Math.cos(a), S.y + y, S.z + (R + d) * Math.sin(a)); };
  const shieldW = () => [['Scutum', 1]];
  // front face, back face, edges
  add(grid(30, 40, (u, v) => surf(lerp(-HW, HW, u), lerp(-HH, HH, v), 0)), 'cloth', {
    weights: shieldW,
    colorFn: p => {
      const lp = p.clone().sub(S), edge = Math.max(Math.abs(lp.y) / HH, Math.abs(lp.z) / HW);
      return dust(COL.shield.clone().lerp(C(0x5a1114), smooth((edge - 0.82) / 0.18) * 0.45), p.y, 0.8, 0.3);
    }, noise: 0.1, noiseFreq: 18,
  });
  add(flip(grid(30, 20, (u, v) => surf(lerp(-HW, HW, u), lerp(-HH, HH, v), -T))), 'leather', { weights: shieldW, color: COL.shieldBack, noise: 0.15 });
  // brass rim around the edge
  const rim = [];
  for (let i = 0; i <= 30; i++) rim.push(surf(lerp(-HW, HW, i / 30), HH, -T / 2));
  for (let i = 1; i <= 40; i++) rim.push(surf(HW, lerp(HH, -HH, i / 40), -T / 2));
  for (let i = 1; i <= 30; i++) rim.push(surf(lerp(HW, -HW, i / 30), -HH, -T / 2));
  for (let i = 1; i < 40; i++) rim.push(surf(-HW, lerp(-HH, HH, i / 40), -T / 2));
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true, 'catmullrom', 0.05), 260, 0.009, 6, true), 'brass', { weights: shieldW, color: COL.brass, noise: 0.12 });
  // flat painted ornaments bent onto the curve
  function bent(shape, d, depth = 0.002) {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 });
    const P = g.attributes.position, q = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) { q.fromBufferAttribute(P, i); const w = surf(q.x, q.y, d + q.z); P.setXYZ(i, w.x, w.y, w.z); }
    g.computeVertexNormals(); return g;
  }
  const rect = (x0, y0, x1, y1) => { const s = new THREE.Shape(); s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.lineTo(x0, y0); return s; };
  const goldW = { weights: shieldW, color: COL.gold, noise: 0.12 };
  const PAINT = 'cloth';
  // inner border frame
  const fi = 0.035, fw = 0.012;
  for (const r of [rect(-HW + fi, HH - fi - fw, HW - fi, HH - fi), rect(-HW + fi, -HH + fi, HW - fi, -HH + fi + fw),
    rect(-HW + fi, -HH + fi, -HW + fi + fw, HH - fi), rect(HW - fi - fw, -HH + fi, HW - fi, HH - fi)]) {
    const s = new THREE.Shape(r.getPoints()); s.autoClose = true;
    add(bent(s, 0.001), PAINT, goldW);
  }
  // spina (vertical rib) and boss plate
  add(bent(rect(-0.012, -HH + 0.06, 0.012, HH - 0.06), 0.001, 0.006), 'brass', { weights: shieldW, color: COL.brass, noise: 0.1 });
  add(bent(rect(-0.085, -0.085, 0.085, 0.085), 0.001, 0.003), 'iron', { weights: shieldW, color: COL.iron, noise: 0.08 });
  add(xf(new THREE.SphereGeometry(0.068, 24, 12, 0, TAU, 0, Math.PI / 2), [S.x + 0.004, S.y, S.z], [0, 0, -Math.PI / 2], [1, 0.62, 1]), 'brass', { weights: shieldW, color: COL.brass, noise: 0.08 });
  // thunderbolts radiating from the boss
  function bolt(angle) {
    const s = new THREE.Shape(), L = 0.17, w = 0.012;
    const pts = [[0, 0], [L * 0.45, w * 2.2], [L * 0.42, -w * 0.4], [L, w * 0.6], [L * 0.55, -w * 2.4], [L * 0.58, w * 0.3], [0, -w]];
    pts.forEach(([x, y], i) => { const c = Math.cos(angle), sn = Math.sin(angle); const X = 0.1 * c + x * c - y * sn, Y = 0.1 * sn + x * sn + y * c; i ? s.lineTo(X, Y) : s.moveTo(X, Y); });
    return s;
  }
  for (const a of [0.6, Math.PI - 0.6, Math.PI + 0.6, -0.6]) add(bent(bolt(a), 0.0015), PAINT, goldW);
  // wings above and below the boss
  function wing(dirY) {
    const s = new THREE.Shape();
    s.moveTo(0, 0.1 * dirY);
    for (let i = 0; i <= 5; i++) { const t = i / 5; s.lineTo(lerp(0.015, 0.2, t), dirY * (0.1 + 0.11 * Math.sin(t * Math.PI * 0.9) + (i % 2 ? 0.02 : 0))); }
    s.lineTo(0.2, dirY * 0.13);
    for (let i = 5; i >= 0; i--) { const t = i / 5; s.lineTo(lerp(0.015, 0.2, t), dirY * (0.1 + 0.06 * Math.sin(t * Math.PI * 0.9))); }
    return s;
  }
  for (const dy of [1, -1]) for (const sx of [1, -1]) {
    const s = wing(dy); const g = new THREE.ShapeGeometry(s); // mirror x via points
    const sh = new THREE.Shape(s.getPoints().map(p => new THREE.Vector2(p.x * sx, p.y)));
    add(bent(sh, 0.0015), PAINT, goldW);
  }
  // handle bar behind the boss
  add(xf(new THREE.CylinderGeometry(0.011, 0.011, 0.13, 8), [S.x - T - 0.03, S.y, S.z], [Math.PI / 2, 0, 0]), 'leather', { weights: shieldW, color: COL.leather });
}

// ================================================================== BUILD MESHES
const skeleton = new THREE.Skeleton(BONE_LIST);
const scene = new THREE.Scene();
scene.add(root);
let tris = 0;
for (const [k, B] of Object.entries(buf)) {
  if (!B.pos.length) continue;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(B.si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(B.sw, 4));
  const big = B.pos.length / 3 > 65535;
  g.setIndex(big ? new THREE.Uint32BufferAttribute(B.idx, 1) : new THREE.Uint16BufferAttribute(B.idx, 1));
  tris += B.idx.length / 3;
  const mat = new THREE.MeshStandardMaterial({ name: k, color: 0xffffff, vertexColors: true, ...MATS[k],
    side: ['skin', 'eye'].includes(k) ? THREE.FrontSide : THREE.DoubleSide });
  const mesh = new THREE.SkinnedMesh(g, mat);
  mesh.name = `Legionary_${k}`;
  root.add(mesh);
  mesh.bind(skeleton, new THREE.Matrix4());
}

// ================================================================== ANIMATION (same as low-poly version)
const JOINTS = ['Hips', 'Spine', 'Head', 'Thigh_L', 'Thigh_R', 'Shin_L', 'Shin_R',
  'Shoulder_L', 'Shoulder_R', 'Elbow_L', 'Elbow_R', 'Scutum'];
const REST = {
  Hips: [0, 0, 0], Spine: [0, 0, 0], Head: [0, 0, 0],
  Thigh_L: [0, 0, 0], Thigh_R: [0, 0, 0], Shin_L: [0, 0, 0], Shin_R: [0, 0, 0],
  Shoulder_L: [0, 0, 0.12], Shoulder_R: [0, 0, -0.08], Elbow_L: [-0.5, 0, 0], Elbow_R: [-0.15, 0, 0],
  Scutum: [0, 0, 0],
};
const HIPS_Y = 0.97;
function sampleClip(name, duration, fps, poseAt) {
  const n = Math.round(duration * fps) + 1;
  const times = [], rot = Object.fromEntries(JOINTS.map(j => [j, []])), hy = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * duration;
    times.push(t);
    const p = poseAt(t / duration);
    if (!p.Scutum) {
      const sh = (p.Shoulder_L ?? REST.Shoulder_L)[0], el = (p.Elbow_L ?? REST.Elbow_L)[0];
      const sp = (p.Spine ?? REST.Spine)[0];
      p.Scutum = [-(sh + el + sp) * 0.85, 0, -((p.Shoulder_L ?? REST.Shoulder_L)[2]) * 0.6];
    }
    for (const j of JOINTS) {
      const r = p[j] ?? REST[j];
      q.setFromEuler(e.set(r[0], r[1], r[2]));
      rot[j].push(q.x, q.y, q.z, q.w);
    }
    hy.push(0, (p.hipsY ?? 0.95) - 0.95 + HIPS_Y, 0);
  }
  const tracks = JOINTS.map(j => new THREE.QuaternionKeyframeTrack(`${j}.quaternion`, times, rot[j]));
  tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, hy));
  return new THREE.AnimationClip(name, duration, tracks);
}
function keyed(keys) {
  return u => {
    let k = 0;
    while (k < keys.length - 2 && u > keys[k + 1].t) k++;
    const a = keys[k], b = keys[k + 1];
    const s = smooth((u - a.t) / (b.t - a.t));
    const out = {};
    for (const j of [...JOINTS, 'hipsY']) {
      if (j === 'Scutum' && !a.pose.Scutum && !b.pose.Scutum) continue;
      const va = a.pose[j] ?? (j === 'hipsY' ? 0.95 : REST[j]);
      const vb = b.pose[j] ?? (j === 'hipsY' ? 0.95 : REST[j]);
      out[j] = j === 'hipsY' ? lerp(va, vb, s) : va.map((v, i) => lerp(v, vb[i], s));
    }
    return out;
  };
}
const run = sampleClip('Run', 0.66, 30, u => {
  const p = u * TAU, s = Math.sin(p), c = Math.cos(p);
  return {
    hipsY: 0.92 + 0.05 * Math.abs(c), Hips: [0, 0.1 * s, 0],
    Spine: [0.22 + 0.03 * Math.sin(2 * p), -0.16 * s, 0], Head: [-0.16, 0.06 * s, 0],
    Thigh_L: [0.75 * s - 0.1, 0, 0.03], Thigh_R: [-0.75 * s - 0.1, 0, -0.03],
    Shin_L: [0.2 + 1.3 * Math.max(0, -c), 0, 0], Shin_R: [0.2 + 1.3 * Math.max(0, c), 0, 0],
    Shoulder_L: [-0.35 * s - 0.1, 0, 0.18], Shoulder_R: [0.7 * s, 0, -0.12],
    Elbow_L: [-0.9, 0, 0], Elbow_R: [-1.25 + 0.25 * s, 0, 0],
  };
});
const crouch = { hipsY: 0.82, Spine: [0.35, 0, 0], Head: [-0.25, 0, 0], Thigh_L: [-0.7, 0, 0], Thigh_R: [-0.7, 0, 0], Shin_L: [1.2, 0, 0], Shin_R: [1.2, 0, 0], Shoulder_L: [0.3, 0, 0.25], Shoulder_R: [0.5, 0, -0.2], Elbow_L: [-0.8, 0, 0], Elbow_R: [-0.6, 0, 0] };
const tuck = { hipsY: 0.98, Spine: [0.15, 0, 0], Head: [-0.1, 0, 0], Thigh_L: [-1.1, 0, 0.05], Thigh_R: [-0.5, 0, -0.05], Shin_L: [1.7, 0, 0], Shin_R: [1.2, 0, 0], Shoulder_L: [-0.9, 0, 0.35], Shoulder_R: [-1.6, 0, -0.35], Elbow_L: [-1.0, 0, 0], Elbow_R: [-0.5, 0, 0] };
const jump = sampleClip('Jump', 0.9, 30, keyed([{ t: 0, pose: {} }, { t: 0.12, pose: crouch }, { t: 0.3, pose: tuck }, { t: 0.7, pose: tuck }, { t: 0.88, pose: crouch }, { t: 1, pose: {} }]));
const slideLow = { hipsY: 0.42, Spine: [-0.95, 0, 0], Head: [0.55, 0, 0], Thigh_L: [-1.45, 0, 0.06], Thigh_R: [-1.2, 0, -0.06], Shin_L: [0.25, 0, 0], Shin_R: [0.9, 0, 0], Shoulder_L: [-0.4, 0, 0.7], Shoulder_R: [0.6, 0, -0.9], Elbow_L: [-0.9, 0, 0], Elbow_R: [-0.3, 0, 0] };
const slide = sampleClip('Slide', 0.9, 30, keyed([{ t: 0, pose: {} }, { t: 0.18, pose: slideLow }, { t: 0.8, pose: slideLow }, { t: 1, pose: {} }]));
const trip = { hipsY: 0.86, Spine: [0.75, 0.2, 0.1], Head: [-0.45, 0, 0], Thigh_L: [-0.9, 0, 0], Thigh_R: [0.5, 0, 0], Shin_L: [0.6, 0, 0], Shin_R: [1.1, 0, 0], Shoulder_L: [-1.3, 0, 0.9], Shoulder_R: [-1.0, 0, -1.2], Elbow_L: [-0.4, 0, 0], Elbow_R: [-0.3, 0, 0] };
const recover = { hipsY: 0.9, Spine: [0.4, -0.1, -0.05], Head: [-0.25, 0, 0], Thigh_L: [0.3, 0, 0], Thigh_R: [-0.6, 0, 0], Shin_L: [0.9, 0, 0], Shin_R: [0.4, 0, 0], Shoulder_L: [0.4, 0, 0.5], Shoulder_R: [-0.4, 0, -0.6], Elbow_L: [-0.9, 0, 0], Elbow_R: [-0.9, 0, 0] };
const stumble = sampleClip('Stumble', 0.6, 30, keyed([{ t: 0, pose: {} }, { t: 0.3, pose: trip }, { t: 0.65, pose: recover }, { t: 1, pose: {} }]));
const idle = sampleClip('Idle', 2.0, 15, u => {
  const p = u * TAU;
  return {
    hipsY: 0.945 + 0.005 * Math.sin(p), Spine: [0.02 + 0.02 * Math.sin(p), 0, 0],
    Head: [-0.02 * Math.sin(p), 0.05 * Math.sin(p * 0.5), 0],
    Shoulder_L: [0, 0, 0.12 + 0.02 * Math.sin(p)], Shoulder_R: [0, 0, -0.08 - 0.02 * Math.sin(p)],
  };
});
const clips = [run, jump, slide, stumble, idle];

const glb = await new GLTFExporter().parseAsync(scene, { binary: true, animations: clips });
writeFileSync('legionary-hd.glb', Buffer.from(glb));
console.log(`legionary-hd.glb: ${(glb.byteLength / 1024 / 1024).toFixed(2)} MB, ${Math.round(tris)} triangles, ` +
  `${Object.values(buf).filter(b => b.pos.length).length} draw calls, ${clips.length} animations`);
