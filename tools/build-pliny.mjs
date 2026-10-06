// Escape Pompeii — Pliny the Elder, admiral of the fleet at Misenum, waiting in his boat at Stabiae (the finale).
// Sculpted with the same signed-distance anatomy as the palaestra statues, but painted as a living man:
// a wool tunic with a leather belt, the general's scarlet cloak (paludamentum) pinned at the right shoulder,
// grey hair, a weathered face. He stands with his weight on the right leg and raises his right arm, beckoning.
// Output: tools/pliny.glb (then meshopt → public/assets/pliny.glb, see npm run build:pliny).
// Run: cd tools && node build-pliny.mjs
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { writeFileSync } from 'node:fs';
import { figure } from './anatomy.mjs';
import { mesh, frame, sdRoundCone, sdTorus, sdSphere, smin, add, sub, mul, lerp3, len, dot, norm } from './sculpt.mjs';

globalThis.FileReader = class { readAsArrayBuffer(b) { b.arrayBuffer().then(x => { this.result = x; this.onloadend?.(); }); } readAsDataURL(b) { b.arrayBuffer().then(x => { this.result = `data:${b.type};base64,` + Buffer.from(x).toString('base64'); this.onloadend?.(); }); } };

const H = +(process.env.H || 0.004), TARGET = +(process.env.TARGET || 36000);
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x, y, z) => { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf); let r = 0; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) r += hash(xi + a, yi + b, zi + c) * (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? w : 1 - w); return r; };
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), lerp = (a, b, t) => a + (b - a) * t;
const T = (x, y, z) => [x, y, z];

// ---- the pose: weight on the right leg, right arm raised and beckoning, left hand gathering the cloak
const pose = {
  pelvis: T(0, 0.975, 0), pelvisRoll: -0.05, pelvisYaw: 0.04, chest: T(-0.006, 1.335, -0.01), chestRoll: 0.05, chestYaw: -0.08, chestPitch: 0.02,
  head: T(-0.016, 1.7, 0.03), headYaw: -0.12, headPitch: 0.16, headRoll: 0.03, headOpts: { curls: 120 },
  legs: { r: { knee: T(-0.082, 0.515, 0.016), ankle: T(-0.078, 0.086, -0.004), toe: T(-0.14, 0, 1) }, l: { knee: T(0.11, 0.52, 0.06), ankle: T(0.15, 0.12, -0.12), toe: T(0.16, -0.25, 1) } },
  arms: {
    r: { elbow: T(-0.42, 1.62, 0.06), wrist: T(-0.47, 1.9, 0.13), hand: T(-0.08, 1, 0.12), palm: T(0.15, 0.1, 1), grip: 0.12 },
    l: { elbow: T(0.27, 1.12, 0.0), wrist: T(0.27, 0.9, 0.09), hand: T(-0.05, -1, 0.15), palm: T(-1, 0, 0.1), grip: 0.85 },
  },
  plinth: false,
};
const S = figure(pose);
const P = pose.pelvis, C = pose.chest;

// folds: ripples running round the body, longer down the skirt
const folds = (f, c, amp, n, vert) => (x, y, z) => { const a = Math.atan2(x - c[0], z - c[2]); return f(x, y, z) + amp * Math.sin(a * n + y * vert) + amp * 0.4 * Math.sin(a * n * 2.3 + y * vert * 1.6 + 1); };

// ---- tunic: from the shoulders to just above the knee, belted, short sleeves
{
  const yTop = C[1] + 0.17, yHem = 0.6;
  const radius = y => { // half-widths across (x) and front-to-back (z) at height y
    const t = clamp((yTop - y) / (yTop - yHem));
    const rx = t < 0.35 ? lerp(0.205, 0.185, t / 0.35) : t < 0.55 ? lerp(0.185, 0.19, (t - 0.35) / 0.2) : lerp(0.19, 0.245, (t - 0.55) / 0.45);
    const rz = t < 0.35 ? lerp(0.125, 0.135, t / 0.35) : t < 0.55 ? 0.13 : lerp(0.13, 0.19, (t - 0.55) / 0.45);
    return [rx, rz];
  };
  const cx = y => lerp(P[0], C[0], clamp((y - P[1]) / (C[1] - P[1]))), cz = y => lerp(P[2] + 0.005, C[2] + 0.005, clamp((y - P[1]) / (C[1] - P[1])));
  const body = (x, y, z) => {
    const [rx, rz] = radius(y), dx = (x - cx(y)) / rx, dz = (z - cz(y)) / rz, k = Math.hypot(dx, dz);
    const hem = yHem + 0.02 * Math.sin(x * 22 + z * 9) - y, ax = Math.abs(x - C[0]);
    const neck = ax < 0.085 && z > C[2] + 0.02 ? 0.045 * (1 - (ax / 0.085) ** 2) : 0;          // a round neckline at the front
    const top = y - (yTop + 0.015 - 0.9 * ax * ax - neck);                                     // sloping over the shoulders
    return Math.max((k - 1) * Math.min(rx, rz), hem, top);
  };
  S.custom(folds(body, [P[0], 0, P[2]], 0.0045, 11, 3.2), [P[0], (yTop + yHem) / 2, P[2]], (yTop - yHem) / 2 + 0.3, 0.025, 'tunic'); S.ops[S.ops.length - 1].prio = 0.02;   // cloth wins the colour where the body bulges under it
  for (const s of [-1, 1]) {   // sleeves to mid upper arm
    const A = pose.arms[s < 0 ? 'r' : 'l'], Sh = add(C, [s * 0.19, 0.12, -0.01]), mid = lerp3(Sh, A.elbow, 0.48);
    S.custom(folds(sdRoundCone(add(Sh, [0, -0.01, 0]), mid, 0.07, 0.066), Sh, 0.003, 8, 10), lerp3(Sh, mid, 0.5), 0.2, 0.02, 'tunic'); S.ops[S.ops.length - 1].prio = 0.02;
  }
  // belt (cingulum) with a bronze buckle
  const bc = [P[0], P[1] + 0.13, P[2] + 0.004], F0 = frame(0.02, 0, 0);
  S.custom(sdTorus(bc, 0.178, 0.016, F0), bc, 0.2, 0.006, 'belt');
  S.custom(sdSphere([bc[0] - 0.02, bc[1], bc[2] + 0.168], 0.022), [bc[0] - 0.02, bc[1], bc[2] + 0.168], 0.03, 0.004, 'bronze');
}
// ---- cloak (paludamentum): pinned at the right shoulder, falling down the back to the calves, gathered by the left hand
{
  const c0 = [C[0] + 0.01, 0.9, C[2] - 0.035];
  const shell = (x, y, z) => {
    const t = clamp((1.5 - y) / 1.25), rx = lerp(0.235, 0.32, t), rz = lerp(0.16, 0.26, t);
    const dx = (x - c0[0]) / rx, dz = (z - c0[2]) / rz, d = (Math.hypot(dx, dz) - 1) * Math.min(rx, rz);
    return Math.abs(d) - 0.011;
  };
  const cloak = (x, y, z) => {
    let d = shell(x, y, z);
    // open at the front: only the back half, except over the shoulders where it wraps forward
    const frontCut = z - (C[2] - 0.02) - 0.06 * clamp((y - 1.4) / 0.1);
    d = Math.max(d, frontCut);
    // over the top of the shoulders: a rounded cap
    const capTop = y - (1.5 - 0.06 * Math.pow(Math.abs(x - C[0]) / 0.24, 2));
    d = Math.max(d, capTop);
    // the hem, swinging a little
    d = Math.max(d, 0.3 + 0.03 * Math.sin(x * 14) + 0.06 * (x - c0[0]) - y);
    return d;
  };
  S.custom(folds(cloak, c0, 0.006, 15, 1.8), [c0[0], 0.92, c0[2]], 0.75, 0.01, 'cloak'); S.ops[S.ops.length - 1].prio = 0.02;
  // the end the left hand gathers, hanging in folds
  const A = pose.arms.l, g = lerp3(A.elbow, A.wrist, 0.85);
  S.custom(folds((x, y, z) => smin(sdRoundCone(add(C, [0.17, 0.08, -0.08]), add(g, [0.02, 0.02, -0.03]), 0.045, 0.05)(x, y, z), sdRoundCone(add(g, [0.02, 0, 0]), add(g, [0.05, -0.38, 0.0]), 0.055, 0.075)(x, y, z), 0.04), g, 0.006, 7, 6), add(g, [0, -0.1, 0]), 0.55, 0.02, 'cloak');
  // the brooch (fibula) pinning it at the right shoulder
  const fb = add(C, [-0.13, 0.15, 0.085]);
  S.custom(sdTorus(fb, 0.024, 0.008, frame(0, 0, Math.PI / 2)), fb, 0.04, 0.003, 'gold');
  S.custom(sdSphere(fb, 0.013), fb, 0.02, 0.003, 'gold');
}
// ---- sandals: soles and straps
for (const s of ['l', 'r']) {
  const L = pose.legs[s], td = norm([L.toe[0], 0, L.toe[2]]), heel = add(L.ankle, mul(td, -0.06)), toe = add(L.ankle, mul(td, 0.2)), sx = s === 'l' ? 1 : -1;
  const sole = (x, y, z) => { const d = sdRoundCone([heel[0], heel[1] - 0.075, heel[2]], [toe[0], toe[1] - 0.085, toe[2]], 0.046, 0.05)(x, y, z); return Math.max(d, (heel[1] - 0.1) - y, y - (heel[1] - 0.06) - 0.05 * dot(sub([x, y, z], heel), td)); };
  S.custom(sole, lerp3(heel, toe, 0.5), 0.2, 0.004, 'leather');
  for (const k of [0.25, 0.6]) S.custom(sdTorus(add(lerp3(L.ankle, toe, k), [0, -0.05 + k * -0.02, 0]), 0.045, 0.006, frame(Math.atan2(td[0], td[2]), 0, 0)), lerp3(L.ankle, toe, k), 0.06, 0.004, 'leather');
  S.custom(sdTorus(add(L.ankle, [0, 0.02, 0]), 0.042, 0.007, frame(0, 0, 0)), L.ankle, 0.06, 0.004, 'leather');
}

// ---- colours: a living man, not marble
const eyeTone = (p) => {
  let best = null, bd = 1e9; for (const e of S.eyes) { const d = len(sub(p, e.c)); if (d < bd) { bd = d; best = e; } }
  const c = dot(norm(sub(p, best.c)), best.front); return c > 0.975 ? [0.05, 0.04, 0.035] : c > 0.88 ? [0.32, 0.23, 0.15] : [0.74, 0.7, 0.64];
};
const palette = (tag, p, n, ao) => {
  const noise = vnoise(p[0] * 60, p[1] * 60, p[2] * 60) - 0.5, big = vnoise(p[0] * 9, p[1] * 9, p[2] * 9) - 0.5;
  let c;
  if (tag === 'eye') c = eyeTone(p);
  else if (tag === 'hair') c = [0.56 + noise * 0.15, 0.54 + noise * 0.15, 0.52 + noise * 0.15];                        // grey, 56 years old
  else if (tag === 'lip') c = [0.62, 0.36, 0.32];
  else if (tag === 'tunic') c = [0.86 + big * 0.06, 0.82 + big * 0.06, 0.74 + big * 0.05];                            // undyed wool
  else if (tag === 'cloak') c = [0.6 + big * 0.08, 0.1 + big * 0.03, 0.08];                                         // the general's scarlet
  else if (tag === 'belt' || tag === 'leather') c = [0.32, 0.2, 0.12];
  else if (tag === 'bronze') c = [0.62, 0.46, 0.24];
  else if (tag === 'gold') c = [0.85, 0.66, 0.28];
  else {                                                                                                           // sun-browned skin, ruddier on cheeks, nose and hands
    c = [0.74, 0.53, 0.41];
    const warm = clamp(0.5 + noise * 0.8) * 0.06; c = [c[0] + warm, c[1] - warm * 0.2, c[2] - warm * 0.3];
  }
  // ash settling on him: a grey dusting on the upward faces
  const ash = clamp(n[1]) * (0.18 + 0.12 * clamp(big + 0.5));
  c = c.map(v => lerp(v, 0.55, ash));
  // the colours above are as painted (sRGB); vertex colours are linear
  return c.map(v => Math.pow(clamp(v), 2.2) * (0.38 + 0.62 * ao));
};

const T0 = Date.now();
const geo = await mesh(S, { h: H, target: TARGET, palette, log: () => {} });
console.log(`Pliny: ${geo.index.count / 3} triangles, ${((Date.now() - T0) / 1000).toFixed(0)} s`);
const scene = new THREE.Scene();
const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ name: 'pliny', color: 0xffffff, vertexColors: true, roughness: 0.82 }));
m.name = 'Pliny';
scene.add(m);
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync('pliny.glb', Buffer.from(glb));
console.log(`pliny.glb: ${(glb.byteLength / 1048576).toFixed(2)} MB`);
