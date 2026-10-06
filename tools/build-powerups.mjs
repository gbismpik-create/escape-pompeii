// Escape Pompeii — the four power-up pickups, sculpted with the same signed-distance tools as the statues and coins
// (sculpt.mjs, anatomy.mjs), each about half a metre across so it reads at running speed:
//   Purse_Mercury    Mercury's purse: a leather pouch gathered with a gold cord, small white wings at its sides
//   Wheel_Fortuna    Fortuna's favour: a small gilded wheel with eight spokes and knobs round the rim
//   Shield_Aegis     Aegis of Minerva: a small round gold shield, the Gorgon's face with snakes for hair at its centre
//   Wings_Pegasus    Wings of Pegasus: a pair of white feathered wings joined by a gold clasp
// Each pickup is meshed twice: its metal parts (gold, metalness 1) and the rest (leather, feathers), so each part
// gets the right material. Vertex colours carry the colour and the shading in the creases. Upright, facing +z,
// centred on the origin.
// Output: tools/powerups.glb (then meshopt → public/assets/powerups.glb, see npm run build:powerups).
// Run: cd tools && node build-powerups.mjs
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { writeFileSync } from 'node:fs';
import { head } from './anatomy.mjs';
import { Sculpture, mesh, frame, frameAlong, sdRoundCone, sdEllipsoid, sdSphere, sdTorus, smin, add, sub, mul, lerp3, norm, len } from './sculpt.mjs';

globalThis.FileReader = class { readAsArrayBuffer(b) { b.arrayBuffer().then(x => { this.result = x; this.onloadend?.(); }); } readAsDataURL(b) { b.arrayBuffer().then(x => { this.result = `data:${b.type};base64,` + Buffer.from(x).toString('base64'); this.onloadend?.(); }); } };

const H = +(process.env.H || 0.0025), TARGET = +(process.env.TARGET || 3500);
const T0 = Date.now(), lap = (n) => console.log(`  ${n} ${((Date.now() - T0) / 1000).toFixed(0)}s`);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), lerp = (a, b, t) => a + (b - a) * t;
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x, y, z) => { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf); let r = 0; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) r += hash(xi + a, yi + b, zi + c) * (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? w : 1 - w); return r; };
// painted colours are sRGB; vertex colours are linear, shaded by the ambient occlusion in the creases
const linear = (c, ao) => c.map((v) => Math.pow(clamp(v), 2.2) * (0.35 + 0.65 * ao));
const GOLD = [1.0, 0.8, 0.42], GOLD_DEEP = [0.78, 0.52, 0.2];
const gold = (p, ao, deep = 0) => linear(GOLD.map((g, i) => lerp(g, GOLD_DEEP[i], clamp(deep + (1 - ao) * 0.8))), 0.55 + 0.45 * ao);

// A wing: a bony leading edge with rows of overlapping feathers, coverts near the edge, long primaries at the tip.
// root: where it joins; dir: along the wing (outwards); down: the way the feathers hang; side: +1 or -1 (mirrors).
function wing(S, root, dir, down, length, tag = 'feather') {
  dir = norm(dir); down = norm(down);
  const tip = add(root, mul(dir, length));
  S.cone(root, lerp3(root, tip, 0.86), 0.015, 0.008, 0.01, tag);                                   // the leading edge, ending among the feathers
  const rows = [[0.32, 0.055, 9], [0.62, 0.095, 8], [1.0, 0.17, 7]];                            // coverts, secondaries, primaries
  rows.forEach(([depth, flen, n], r) => {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, base = lerp3(root, tip, t * (r === 2 ? 1 : 0.92));
      // feathers lengthen towards the tip and fan back from the edge
      const L = flen * (r === 2 ? 0.55 + 0.75 * t : 0.85 + 0.3 * t), fan = norm(add(mul(down, 1), mul(dir, r === 2 ? 0.25 + 0.6 * t : 0.15)));
      const c = add(add(base, mul(down, depth * 0.06)), mul(fan, L * 0.5));
      S.ell(c, [0.017 + 0.004 * r, L * 0.5, 0.006], frameAlong(fan, [0, 0, 1]), 0.006, tag);
    }
  });
}

// ------------------------------------------------------------------ Mercury's purse
function purse() {
  const S = new Sculpture(), M = new Sculpture();
  // the pouch: round below, gathered at the neck, with soft folds running up to it
  const body = sdEllipsoid([0, -0.035, 0], [0.135, 0.13, 0.1]);
  const neck = sdRoundCone([0, 0.04, 0], [0, 0.095, 0], 0.07, 0.04);
  const folds = (x, y, z) => smin(body(x, y, z), neck(x, y, z), 0.06) + 0.004 * Math.sin(Math.atan2(x, z) * 11) * clamp((y + 0.02) / 0.12);
  S.custom(folds, [0, 0.0, 0], 0.2, 0.01, 'leather');
  // the frill above the cord
  S.custom((x, y, z) => Math.max(sdRoundCone([0, 0.1, 0], [0, 0.135, 0], 0.04, 0.072)(x, y, z), y - 0.14) + 0.009 * Math.sin(Math.atan2(x, z) * 10), [0, 0.12, 0], 0.09, 0.008, 'leather');   // the ruffled top, flaring out above the cord
  // a stitched seam round the bottom
  S.custom(sdTorus([0, -0.07, 0], 0.115, 0.005, frame(0, 0, 0)), [0, -0.07, 0], 0.13, 0.004, 'seam');
  // the gold cord, tied round the neck, its two ends hanging with tassels
  M.custom(sdTorus([0, 0.098, 0], 0.048, 0.011, frame(0, 0, 0.08)), [0, 0.098, 0], 0.07, 0.004, 'gold');
  for (const s of [-1, 1]) {
    const a = [s * 0.018, 0.095, 0.05], b = [s * 0.04, 0.01, 0.115];
    M.cone(a, b, 0.007, 0.006, 0.006, 'gold');
    M.ell(add(b, [0, -0.025, 0.002]), [0.014, 0.03, 0.014], null, 0.008, 'gold');
  }
  // small wings at its sides, like Mercury's sandals
  for (const s of [-1, 1]) wing(S, [s * 0.11, 0.03, -0.03], [s * 0.9, 0.6, -0.2], [s * 0.2, -1, -0.1], 0.16);
  const palette = (tag, p, n, ao) => {
    if (tag === 'gold') return gold(p, ao);
    if (tag === 'feather') return linear([0.95, 0.94, 0.9].map((v) => v - 0.04 * vnoise(p[0] * 90, p[1] * 90, p[2] * 90)), ao);
    if (tag === 'seam') return linear([0.32, 0.2, 0.12], ao);
    const grain = vnoise(p[0] * 160, p[1] * 160, p[2] * 160) * 0.08 + vnoise(p[0] * 20, p[1] * 20, p[2] * 20) * 0.1;
    return linear([0.52 - grain, 0.33 - grain * 0.7, 0.18 - grain * 0.4], ao);   // tanned leather
  };
  return { name: 'Purse_Mercury', parts: [[S, palette, false], [M, palette, true]] };
}

// ------------------------------------------------------------------ Fortuna's wheel
function wheel() {
  const M = new Sculpture(), F = frame(0, 0, Math.PI / 2), R = 0.19;            // F: the wheel's plane faces +z
  M.custom(sdTorus([0, 0, 0], R, 0.022, F), [0, 0, 0], R + 0.03, 0.006, 'gold');                       // rim
  M.custom(sdTorus([0, 0, 0], R - 0.03, 0.009, F), [0, 0, 0], R, 0.004, 'gold');                        // an inner bead
  M.cone([0, 0, -0.04], [0, 0, 0.04], 0.045, 0.045, 0.01, 'gold');                                      // hub
  M.sphere([0, 0, 0.045], 0.03, 0.01, 'gold'); M.sphere([0, 0, -0.045], 0.03, 0.01, 'gold');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, d = [Math.cos(a), Math.sin(a), 0];
    M.cone(mul(d, 0.04), mul(d, R - 0.015), 0.012, 0.009, 0.012, 'gold');                             // spokes, flaring at the hub
    M.sphere(mul(d, R + 0.028), 0.017, 0.006, 'gold');                                                  // knobs round the rim (the wheel's handles)
  }
  return { name: 'Wheel_Fortuna', parts: [[M, (tag, p, n, ao) => gold(p, ao), true]] };
}

// ------------------------------------------------------------------ Aegis of Minerva
function aegis() {
  const M = new Sculpture(), R = 0.19;
  // a shallow dome with a raised rim
  const dome = (x, y, z) => { const r = Math.hypot(x, y), back = -0.012, front = 0.04 * (1 - (r / R) ** 2); return Math.max(r - R, back - z, z - front); };
  M.custom(dome, [0, 0, 0.01], R + 0.01, 0.004, 'gold');
  M.custom(sdTorus([0, 0, 0.004], R - 0.004, 0.012, frame(0, 0, Math.PI / 2)), [0, 0, 0], R + 0.02, 0.004, 'gold');
  // the Gorgon's face at the centre: a head from the statues' anatomy, a third of life size, pressed into relief
  const G = new Sculpture(), k = 0.55, squash = 0.5;
  head(G, [0, 0, 0], frame(0, 0, 0), { curls: 0 });
  const face = (x, y, z) => G.eval(x / k, (y - 0.005) / k, (z - 0.03) / (k * squash)) * k * squash;
  M.custom(face, [0, 0.005, 0.03], 0.1, 0.006, 'face');
  // snakes for hair: writhing coils fanning out round the face, heads outwards
  // snakes for hair: thick writhing coils all round the face, their heads outwards
  for (let i = 0; i < 10; i++) {
    const a = Math.PI * (-0.15 + (i / 9) * 1.3), out = [Math.cos(a), Math.sin(a), 0], across = [-out[1], out[0], 0];
    const pts = []; for (let t = 0; t <= 1.0001; t += 0.125) { const r = 0.07 + t * 0.075, wob = 0.016 * Math.sin(t * 10 + i * 1.7) * (0.4 + t); pts.push(add(add(mul(out, r), mul(across, wob)), [0, 0.012, 0.042 - t * 0.022])); }
    for (let j = 0; j < pts.length - 1; j++) M.cone(pts[j], pts[j + 1], 0.011 - j * 0.0009, 0.0102 - j * 0.0009, 0.005, 'snake');
    const tip = pts[pts.length - 1], dir = norm(sub(tip, pts[pts.length - 2]));
    M.ell(add(tip, mul(dir, 0.006)), [0.009, 0.013, 0.006], frameAlong(dir, [0, 0, 1]), 0.004, 'snake');   // the head
  }
  const palette = (tag, p, n, ao) => gold(p, ao, tag === 'snake' ? 0.15 : 0);
  return { name: 'Shield_Aegis', parts: [[M, palette, true]] };
}

// ------------------------------------------------------------------ Wings of Pegasus
function wings() {
  const S = new Sculpture(), M = new Sculpture();
  for (const s of [-1, 1]) wing(S, [s * 0.02, 0.02, 0], [s * 0.85, 0.5, -0.12], [s * 0.15, -1, -0.15], 0.3);
  M.sphere([0, 0.02, 0.005], 0.026, 0.006, 'gold');                                                  // the gold clasp joining them
  M.custom(sdTorus([0, 0.02, 0.01], 0.026, 0.006, frame(0, 0, Math.PI / 2)), [0, 0.02, 0.01], 0.04, 0.003, 'gold');
  const palette = (tag, p, n, ao) => (tag === 'gold' ? gold(p, ao)
    : linear([0.97, 0.96, 0.93].map((v) => v - 0.05 * vnoise(p[0] * 70, p[1] * 70, p[2] * 70)), ao));
  return { name: 'Wings_Pegasus', parts: [[S, palette, false], [M, palette, true]] };
}

// ------------------------------------------------------------------ build
const MATERIALS = {
  metal: new THREE.MeshStandardMaterial({ name: 'powerup_gold', color: 0xffffff, vertexColors: true, metalness: 1, roughness: 0.26 }),
  matte: new THREE.MeshStandardMaterial({ name: 'powerup_matte', color: 0xffffff, vertexColors: true, metalness: 0, roughness: 0.7 }),
};
const scene = new THREE.Scene();
for (const make of [purse, wheel, aegis, wings]) {
  const { name, parts } = make(), group = new THREE.Group();
  group.name = name;
  let tris = 0;
  for (const [S, palette, metal] of parts) {
    const geo = await mesh(S, { h: H, target: metal && parts.length > 1 ? TARGET / 4 : TARGET, palette, log: () => {} });
    tris += geo.index.count / 3;
    const m = new THREE.Mesh(geo, metal ? MATERIALS.metal : MATERIALS.matte);
    m.name = `${name}_${metal ? 'gold' : 'matte'}`;
    group.add(m);
  }
  scene.add(group);
  lap(`${name}: ${tris} triangles`);
}
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync('powerups.glb', Buffer.from(glb));
console.log(`powerups.glb: ${(glb.byteLength / 1048576).toFixed(2)} MB`);
