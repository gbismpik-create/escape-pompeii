// Escape Pompeii — the two coins: a silver denarius of Titus and a gold aureus of Vespasian, enlarged to read at
// running speed (0.30 m and 0.35 m across).
// The portraits and figures are sculpted with the same signed-distance tools as the statues (sculpt.mjs, anatomy.mjs),
// meshed in full detail, then flattened into low relief and baked into each coin's textures: a normal map (which way
// the surface faces at every point, so the light picks out the relief) and a colour map (polished high points, toned
// recesses). The coin itself is a ~600-triangle disc: two faces, a raised rim and the edge.
//   Denarius: laureate head of Titus right, legend IMP T CAESAR VESPASIANVS AVG round the rim; reverse Pax holding an
//             olive branch. Bright silver, slightly worn (soft relief, rounded rim).
//   Aureus:   laureate head of Vespasian right; reverse Victory crowning a trophy. Warm polished gold, crisp edges.
// Each coin stands upright facing +z (front) and −z (back), centred on the origin.
// Output: tools/coins.glb (then meshopt → public/assets/coins.glb, see npm run build:coins). Run: cd tools && node build-coins.mjs
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createCanvas, ImageData as NapiImageData } from '@napi-rs/canvas';
globalThis.ImageData = NapiImageData;
import { writeFileSync } from 'node:fs';
import { head, figure, POSES } from './anatomy.mjs';
import { Sculpture, mesh, frame, frameAlong, sdRoundCone, sdEllipsoid, sdSphere, sdTorus, smin, add, sub, mul, lerp3, norm } from './sculpt.mjs';

// let GLTFExporter encode the textures in Node
globalThis.FileReader = class { readAsArrayBuffer(b) { b.arrayBuffer().then(x => { this.result = x; this.onloadend?.(); }); } readAsDataURL(b) { b.arrayBuffer().then(x => { this.result = `data:${b.type};base64,` + Buffer.from(x).toString('base64'); this.onloadend?.(); }); } };
globalThis.OffscreenCanvas = function (w, h) { const c = createCanvas(w, h); c.convertToBlob = async (o = {}) => new Blob([c.toBuffer(o.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 90)], { type: o.type || 'image/png' }); return c; };
globalThis.OffscreenCanvas.prototype = Object.getPrototypeOf(createCanvas(1, 1));

const RES = +(process.env.RES || 1024);  // texture pixels across one face
const PXS = RES / 512;                       // blur radii below were tuned at 512 px
const T0 = Date.now(), lap = (n) => console.log(`  ${n} ${((Date.now() - T0) / 1000).toFixed(0)}s`);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), lerp = (a, b, t) => a + (b - a) * t, smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const white = () => [1, 1, 1];

// ------------------------------------------------------------------ the coins
const COINS = {
  denarius: { name: 'Coin_Denarius', diameter: 0.30, thickness: 0.03, rim: 0.012, rimHeight: 0.004, bevel: 0.006, segments: 72,
    relief: 0.009, legendHeight: 0.0032, soften: 1.2, normalStrength: 1.25, beads: 84, wear: 0.35,
    metal: [0.9, 0.9, 0.88], toned: [0.3, 0.31, 0.34], polish: [1.0, 1.0, 0.98], roughness: [0.42, 0.2], seed: 3 },
  aureus: { name: 'Coin_Aureus', diameter: 0.35, thickness: 0.034, rim: 0.013, rimHeight: 0.0045, bevel: 0.0025, segments: 72,
    relief: 0.01, legendHeight: 0.0034, soften: 0.7, normalStrength: 1.25, beads: 92, wear: 0.12,
    metal: [1.0, 0.74, 0.34], toned: [0.55, 0.3, 0.08], polish: [1.0, 0.86, 0.5], roughness: [0.3, 0.12], seed: 7 },
};

// ------------------------------------------------------------------ sculpting
// A laureate head in profile facing right (+x), with the neck cut off in a curve below, as on the coins.
// who: 'titus' (round, full face, thick hair) or 'vespasian' (older, lean and firm: strong chin and brow, aquiline nose).
function portrait(who) {
  const S = new Sculpture(), Fh = frame(Math.PI / 2, 0, 0.05), at = (l) => Fh.at([0, 0, 0], l);
  head(S, [0, 0, 0], Fh, { curls: who === 'titus' ? 170 : 150, wreath: true });
  // neck and the top of the shoulders, leaning forward a little
  S.cone(at([0, -0.07, -0.02]), at([0, -0.2, -0.05]), 0.058, 0.066, 0.03);
  S.ell(at([0, -0.24, -0.06]), [0.1, 0.06, 0.12], Fh, 0.04);
  if (who === 'titus') {
    S.ell(at([0, -0.035, 0.03]), [0.072, 0.07, 0.066], Fh, 0.03);                                    // fuller cheeks
    S.ell(at([0, -0.088, 0.035]), [0.06, 0.03, 0.05], Fh, 0.03);                                     // rounded jaw
  } else {
    // a seasoned soldier-emperor: lean, firm jaw, strong chin, a proud aquiline nose, a strong brow
    S.cone(at([0.055, -0.03, -0.01]), at([0.02, -0.095, 0.062]), 0.012, 0.011, 0.012);                // the jaw line, clean and firm
    S.ell(at([0, -0.104, 0.074]), [0.021, 0.018, 0.017], Fh, 0.01);                                   // a strong chin, forward
    S.ell(at([0.045, -0.035, 0.05]), [0.02, 0.026, 0.016], Fh, 0.012, 'skin', 'sub');                // lean cheek under the cheekbone
    S.cone(at([-0.04, 0.026, 0.086]), at([0.04, 0.026, 0.086]), 0.009, 0.009, 0.01);                  // a strong brow
    S.cone(at([0, 0.017, 0.094]), at([0, -0.034, 0.118]), 0.0085, 0.012, 0.007);                     // a proud aquiline nose
    S.sphere(at([0, -0.004, 0.106]), 0.006, 0.006);                                                    // its bridge
  }
  return S;
}
// The neck is cut in a gentle curve under the portrait.
const truncation = (x, y) => -0.215 + 0.03 * Math.cos(x * 6) - y;

// A standing draped woman (Pax, Victory): the statue anatomy in a pose, with a long robe to the feet.
function robedFigure(pose, extra) {
  const S = figure({ ...pose, plinth: false });
  const P = pose.pelvis, C = pose.chest;
  const robe = (x, y, z) => {
    const t = clamp((1.45 - y) / 1.4), rx = lerp(0.2, 0.3, t), rz = lerp(0.13, 0.2, t);
    const cx = lerp(C[0], P[0] + (pose.robeSway ?? 0), smooth(t * 1.4)), cz = lerp(C[2], P[2], t);
    const d = (Math.hypot((x - cx) / rx, (z - cz) / rz) - 1) * Math.min(rx, rz);
    const a = Math.atan2(x - cx, z - cz), deep = smooth((1.1 - y) / 0.9);   // folds deepen towards the hem
    return Math.max(d, y - 1.47, 0.03 - y) + (0.005 + 0.011 * deep) * Math.sin(a * 11 + y * 1.4) + 0.005 * Math.sin(a * 23 + y * 3.1 + 1);
  };
  S.custom(robe, [P[0], 0.75, P[2]], 0.85, 0.03, 'cloth');
  // a mantle (palla) slung from the left shoulder across to the right hip, in heavy folds
  const sw = [add(C, [0.17, 0.14, 0.02]), add(C, [0.02, -0.08, 0.12]), add(P, [-0.16, 0.0, 0.12]), add(P, [-0.2, -0.2, 0.06])];
  const swf = sw.slice(1).map((q, i) => sdRoundCone(sw[i], q, 0.06, 0.07));
  S.custom((x, y, z) => { let d = 1e9; for (const f of swf) d = smin(d, f(x, y, z), 0.05); return d + 0.006 * Math.sin((x + y) * 60); }, add(C, [0, -0.25, 0.08]), 0.6, 0.02, 'cloth');
  extra?.(S, pose);
  return S;
}
const T = (x, y, z) => [x, y, z];
// Pax: standing, head turned left, the right arm stretched out holding an olive branch, the left gathering her robe.
const PAX = { ...POSES.emperor, drape: null, headYaw: -0.5, headOpts: { curls: 120 },
  arms: { r: { elbow: T(-0.42, 1.28, 0.08), wrist: T(-0.66, 1.36, 0.14), hand: T(-0.9, 0.3, 0.2), palm: T(0, 0, 1), grip: 0.9 },
          l: { elbow: T(0.26, 1.08, 0.06), wrist: T(0.3, 0.86, 0.14), hand: T(0, -1, 0.1), palm: T(-1, 0, 0), grip: 0.8 } } };
function olive(S, base, dir, length) {   // a branch with pairs of narrow leaves and a few olives
  dir = norm(dir); const tip = add(base, mul(dir, length));
  S.cone(base, tip, 0.012, 0.006, 0.006, 'cloth');
  for (let i = 1; i <= 7; i++) for (const s of [-1, 1]) {
    const p = lerp3(base, tip, i / 7.5), leaf = norm(add(dir, [0, s * 0.9, 0.2])), c = add(p, mul(leaf, 0.05));
    S.ell(c, [0.012, 0.05, 0.008], frame(0, Math.atan2(-leaf[0], leaf[1]), 0), 0.006, 'cloth');
  }
  for (let i = 0; i < 4; i++) S.sphere(add(lerp3(base, tip, 0.3 + i * 0.15), [0, i % 2 ? 0.03 : -0.03, 0.02]), 0.016, 0.006, 'cloth');
}
// Victory advancing right, a common Flavian type: the left arm raised holding out a laurel wreath, the right hand
// carrying a palm branch over her shoulder, wings spread behind her (the wings and palm are drawn in relief: see
// victoryDrawn).
const VICTORY = { ...POSES.emperor, drape: null, headYaw: 0.55, headPitch: 0.05, headOpts: { curls: 140 }, robeSway: 0.06,
  legs: { r: { knee: T(-0.08, 0.515, 0.012), ankle: T(-0.075, 0.086, -0.005), toe: T(-0.15, 0, 1) }, l: { knee: T(0.16, 0.53, 0.09), ankle: T(0.24, 0.11, 0.06), toe: T(0.4, -0.05, 1) } },
  arms: { l: { elbow: T(0.36, 1.48, 0.1), wrist: T(0.52, 1.68, 0.14), hand: T(0.5, 0.8, 0.1), palm: T(0, -1, 0), grip: 0.7 },
          r: { elbow: T(-0.27, 1.1, 0.08), wrist: T(-0.28, 1.0, 0.2), hand: T(-0.2, 0.9, 0.3), palm: T(1, 0, 0), grip: 0.95 } } };
function victoryExtras(S, pose) {
  const w = add(pose.arms.l.wrist, [0.1, 0.12, 0.02]);
  S.custom(sdTorus(w, 0.085, 0.018, frame(0, 0, Math.PI / 2)), w, 0.11, 0.005, 'cloth');                  // the wreath
  for (let i = 0; i < 2; i++) S.cone(add(w, [0.02, -0.08, 0]), add(w, [0.05 + i * 0.05, -0.28, 0.01]), 0.008, 0.005, 0.004, 'cloth');   // its ribbons
}
// Relief drawn on a canvas in the figure's own metres (for feathers and palm leaves, which sculpt poorly).
// draw(g, P, m) gets the context, P(x, y) → pixel and m = pixels per metre; grey level = height (white = `height`).
function drawnLayer(view, height, draw) {
  const c = createCanvas(RES, RES), g = c.getContext('2d'), m = RES / view.span;
  const P = (x, y) => [((x - view.cx) / view.span + 0.5) * RES, (0.5 - (y - view.cy) / view.span) * RES];
  g.fillStyle = '#000'; g.fillRect(0, 0, RES, RES);
  draw(g, P, m);
  const d = g.getImageData(0, 0, RES, RES).data, out = new Float32Array(RES * RES);
  for (let i = 0; i < out.length; i++) out[i] = (d[i * 4] / 255) * height;
  return blur(out, 0.7 * PXS);
}
// A domed leaf or feather: an ellipse brightest along its middle.
function domed(g, x, y, len, wid, ang, level = 1, from = 0.35) {
  g.save(); g.translate(x, y); g.rotate(ang); g.scale(1, wid / len);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, len);
  const v = (k) => `rgb(${Math.round(255 * level * k)},${Math.round(255 * level * k)},${Math.round(255 * level * k)})`;
  gr.addColorStop(0, v(1)); gr.addColorStop(0.7, v(0.75)); gr.addColorStop(1, v(from));
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, len, 0, Math.PI * 2); g.fill();
  g.restore();
}
// Victory's two wings (rising behind her shoulders, the far one lower) and the palm branch.
function victoryDrawn(view, height) {
  return drawnLayer(view, height, (g, P, m) => {
    const C = VICTORY.chest;
    // A wing: a solid plate (its silhouette), rows of small coverts near the leading edge, a fan of long
    // primaries at the tip and secondaries along the trailing edge, each feather domed and outlined.
    const wing = (root, ang, Lw, Ww, level, mirror) => {
      const d = [Math.cos(ang), Math.sin(ang)], n = [-d[1] * mirror, d[0] * mirror];          // along the wing; across, towards the trailing edge
      const W = (t, w) => [root[0] + d[0] * t * Lw + n[0] * w * Ww, root[1] + d[1] * t * Lw + n[1] * w * Ww];
      const lead = (t) => -0.12 * Math.sin(t * Math.PI), trail = (t) => 0.85 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.75) * (1 - 0.35 * t);
      const shape = []; for (let k = 0; k <= 30; k++) shape.push(W(k / 30, lead(k / 30))); for (let k = 30; k >= 0; k--) shape.push(W(k / 30, trail(k / 30)));
      g.fillStyle = `rgb(${Math.round(150 * level)},${Math.round(150 * level)},${Math.round(150 * level)})`; g.beginPath(); shape.forEach((p, k) => { const [x, y] = P(...p); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.fill();
      const feather = (p, a, L, w, lv) => {
        const [x, y] = P(p[0] + Math.cos(a) * L * 0.5, p[1] + Math.sin(a) * L * 0.5);
        domed(g, x, y, L * 0.5 * m, w * m, -a, level * lv, 0.45);
        g.save(); g.translate(x, y); g.rotate(-a); g.scale(1, w / (L * 0.5)); g.strokeStyle = `rgba(0,0,0,0.55)`; g.lineWidth = 1.2 * PXS / (w / (L * 0.5)) ** 0.5; g.beginPath(); g.arc(0, 0, L * 0.5 * m, 0, Math.PI * 2); g.restore(); g.stroke();
        g.strokeStyle = `rgba(255,255,255,${0.35 * level})`; g.lineWidth = 0.9 * PXS; const [x0, y0] = P(...p), [x1, y1] = P(p[0] + Math.cos(a) * L * 0.92, p[1] + Math.sin(a) * L * 0.92); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();   // the quill
      };
      // secondaries along the trailing edge, hanging back and down, inner ones first so outer ones overlap them
      for (let k = 0; k < 9; k++) { const t = 0.12 + k * 0.065, base = W(t, trail(t) * 0.35), a = Math.atan2(n[1], n[0]) - mirror * 0.25 + mirror * k * 0.05; feather(base, a, Ww * (trail(t) * 0.75 + 0.2), 0.035, 0.85); }
      // primaries fanned out at the tip
      for (let k = 0; k < 8; k++) { const t = 0.6 + k * 0.035, base = W(t, 0.15), a = ang + mirror * (0.95 - k * 0.12); feather(base, a, Lw * (0.26 + k * 0.028), 0.04, 0.9); }
      // coverts: overlapping scales in rows near the leading edge
      for (let row = 0; row < 3; row++) for (let k = 0; k < 11 - row * 2; k++) { const t = 0.08 + k * (0.075 + row * 0.01), base = W(t, 0.05 + row * 0.16), a = Math.atan2(n[1], n[0]) + mirror * 0.4; feather(base, a, 0.11 + row * 0.035, 0.03, 1); }
    };
    wing([C[0] - 0.12, C[1] + 0.1], Math.PI * 0.66, 0.78, 0.4, 0.62, 1);     // far wing, rising up and out to the left
    wing([C[0] + 0.1, C[1] + 0.12], Math.PI * 0.45, 0.74, 0.38, 0.75, -1);      // near wing, up behind the raised arm
    // the palm branch from her right hand up over the shoulder: a stem and pairs of narrow leaflets
    const h = VICTORY.arms.r.wrist, base = [h[0] - 0.02, h[1] + 0.02], tip = [h[0] - 0.3, h[1] + 0.78];
    const [bx, by] = P(...base), [tx, ty] = P(...tip);
    g.strokeStyle = 'rgb(210,210,210)'; g.lineWidth = 0.022 * m; g.lineCap = 'round'; g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo((bx + tx) / 2 - 0.05 * m, (by + ty) / 2, tx, ty); g.stroke();
    for (let i = 3; i < 22; i++) for (const s of [-1, 1]) {
      const t = i / 22, x = lerp(base[0], tip[0], t), y = lerp(base[1], tip[1], t), dir = Math.atan2(-(tip[1] - base[1]), tip[0] - base[0]);
      const L = 0.2 * Math.sin(t * Math.PI) + 0.05, ang = dir + s * 0.75, [px, py] = P(x, y);
      domed(g, px + Math.cos(ang) * L * 0.5 * m, py + Math.sin(ang) * L * 0.5 * m, L * 0.5 * m, 0.02 * m, ang, 0.85);
    }
  });
}

// ------------------------------------------------------------------ baking the relief
// Mesh a sculpture in full detail and rasterise its front half into a height map (orthographic, looking down −z).
// view: { cx, cy } sculpt point at the coin's centre, span: sculpt metres across the face, z0: the background plane.
async function bakeHeights(S, view, { h, target, clip }) {
  const geo = await mesh(S, { h, target, clip, palette: white, log: () => {} });
  const P = geo.attributes.position.array, I = geo.index.array, H = new Float32Array(RES * RES).fill(-Infinity);
  const px = (x) => ((x - view.cx) / view.span + 0.5) * RES, py = (y) => (0.5 - (y - view.cy) / view.span) * RES;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ax = px(P[a]), ay = py(P[a + 1]), bx = px(P[b]), by = py(P[b + 1]), cx = px(P[c]), cy = py(P[c + 1]);
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay); if (Math.abs(area) < 1e-12) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(RES - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(RES - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const qx = x + 0.5, qy = y + 0.5;
      const w0 = ((bx - qx) * (cy - qy) - (cx - qx) * (by - qy)) / area, w1 = ((cx - qx) * (ay - qy) - (ax - qx) * (cy - qy)) / area, w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const z = w0 * P[a + 2] + w1 * P[b + 2] + w2 * P[c + 2], k = y * RES + x;
      if (z > H[k]) H[k] = z;
    }
  }
  // height above the background plane, in sculpt metres (nothing behind it shows)
  let top = 0;
  for (let k = 0; k < H.length; k++) { H[k] = Math.max(0, H[k] - view.z0); if (H[k] > top) top = H[k]; }
  return { H, top, tris: I.length / 3 };
}
// Squash a height map into low relief: tall parts compressed more than shallow ones (as die engravers did),
// scaled so the highest point stands `relief` metres above the field.
// The fine detail (curls, eyes, laurel leaves, folds) is then added back on top, so squashing doesn't flatten it.
function lowRelief(H, top, relief, detail = 1.6) {
  const out = new Float32Array(H.length), k = 3 / top, lin = Float32Array.from(H, (h) => h * relief / top), soft = blur(lin, 4 * PXS);
  // inside the silhouette, how far from its edge (px): the relief rolls down to the field over `ramp` px
  const dist = distanceInside(H, (h) => h > 1e-6), ramp = 11 * PXS;
  for (let i = 0; i < H.length; i++) {
    if (H[i] <= 1e-6) { out[i] = 0; continue; }
    const body = relief * (1 - Math.exp(-H[i] * k)) / (1 - Math.exp(-3)), roll = 0.06 + 0.94 * Math.sin(Math.min(1, dist[i] / ramp) * Math.PI / 2);
    out[i] = Math.max(0, body * roll + detail * (lin[i] - soft[i]) * smooth((dist[i] - 3 * PXS) / (6 * PXS)));   // no detail ridge along the outline
  }
  return out;
}
// Chamfer distance (in px) from each pixel inside a mask to the nearest pixel outside it.
function distanceInside(H, inside) {
  const D = new Float32Array(H.length), BIG = 1e6;
  for (let i = 0; i < H.length; i++) D[i] = inside(H[i]) ? BIG : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= RES || y >= RES ? 0 : D[y * RES + x]);
  for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) { const i = y * RES + x; if (!D[i]) continue; D[i] = Math.min(D[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414); }
  for (let y = RES - 1; y >= 0; y--) for (let x = RES - 1; x >= 0; x--) { const i = y * RES + x; if (!D[i]) continue; D[i] = Math.min(D[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414); }
  return D;
}
function blur(H, r) {   // separable box blur, run three times (≈ gaussian); r in pixels
  if (r <= 0) return H;
  let a = Float32Array.from(H), b = new Float32Array(H.length); const R = Math.max(1, Math.round(r));
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < RES; y++) { let s = 0; for (let x = -R; x <= R; x++) s += a[y * RES + clamp(x, 0, RES - 1)]; for (let x = 0; x < RES; x++) { b[y * RES + x] = s / (2 * R + 1); s += a[y * RES + Math.min(RES - 1, x + R + 1)] - a[y * RES + Math.max(0, x - R)]; } }
    for (let x = 0; x < RES; x++) { let s = 0; for (let y = -R; y <= R; y++) s += b[clamp(y, 0, RES - 1) * RES + x]; for (let y = 0; y < RES; y++) { a[y * RES + x] = s / (2 * R + 1); s += b[Math.min(RES - 1, y + R + 1) * RES + x] - b[Math.max(0, y - R) * RES + x]; } }
  }
  return a;
}
// Raised letters running clockwise round the rim from the lower left, tops towards the edge, spaced by their own
// widths (as a die engraver punched them). Each letter is rounded: higher in the middle of its strokes.
// gap: [start, end] angles from straight down, clockwise (leave room for the portrait's neck).
function legend(text, coin, height, gap = [0.2, 0.2]) {
  const c = createCanvas(RES, RES), g = c.getContext('2d'), R = RES / 2, pxPerM = RES / coin.diameter;
  const outer = (coin.diameter / 2 - coin.rim - 0.0075) * pxPerM, size = 0.0205 * pxPerM, radius = outer - size * 0.86;
  g.fillStyle = '#fff'; g.font = `bold ${Math.round(size)}px "TeX Gyre Termes"`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const chars = [...text], wide = chars.map((ch) => (ch === ' ' ? size * 0.45 : g.measureText(ch).width * 0.86 + size * 0.06));
  const total = wide.reduce((a, b) => a + b, 0), from = Math.PI * 0 + gap[0], span = Math.PI * 2 - gap[0] - gap[1];
  const k = Math.min(span / (total / radius), 1.15);           // fill the arc, letters at most 15% wider spaced than set
  let a = from + (span - (total / radius) * k) / 2;
  chars.forEach((ch, i) => {
    const w = (wide[i] / radius) * k, mid = a + w / 2; a += w;
    if (ch === ' ') return;
    g.save(); g.translate(R - Math.sin(mid) * radius, R + Math.cos(mid) * radius); g.rotate(mid + Math.PI); g.scale(0.86, 1.12); g.fillText(ch, 0, size * 0.38); g.restore();
  });
  const d = g.getImageData(0, 0, RES, RES).data, mask = new Float32Array(RES * RES);
  for (let i = 0; i < mask.length; i++) mask[i] = d[i * 4] / 255;
  const dist = distanceInside(mask, (m) => m > 0.5), out = new Float32Array(RES * RES), stroke = 1.6 * PXS;
  for (let i = 0; i < out.length; i++) out[i] = mask[i] > 0.5 ? height * (0.55 + 0.45 * smooth(dist[i] / stroke)) : 0;
  return blur(out, 0.5 * PXS);
}
// The beaded border just inside the rim: a ring of small domes.
function beads(coin, height) {
  const out = new Float32Array(RES * RES), pxPerM = RES / coin.diameter, R = RES / 2, rr = (coin.diameter / 2 - coin.rim - 0.0034) * pxPerM, br = 0.0017 * pxPerM;
  for (let b = 0; b < coin.beads; b++) {
    const a = (b / coin.beads) * Math.PI * 2, cx = R + Math.cos(a) * rr, cy = R + Math.sin(a) * rr;
    for (let y = Math.floor(cy - br - 1); y <= cy + br + 1; y++) for (let x = Math.floor(cx - br - 1); x <= cx + br + 1; x++) {
      if (x < 0 || y < 0 || x >= RES || y >= RES) continue;
      const q = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / br; if (q < 1) out[y * RES + x] = Math.max(out[y * RES + x], height * Math.sqrt(1 - q * q));
    }
  }
  return out;
}
// Life on the field: fine hairline scratches and a few small knocks (silver more than gold), as heights below 0.
function wearMarks(coin) {
  const out = new Float32Array(RES * RES); let sd = coin.seed * 7919;
  const rnd = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  const n = Math.round(60 * coin.wear + 10);
  for (let i = 0; i < n; i++) {
    let x = rnd() * RES, y = rnd() * RES; const a = rnd() * Math.PI, L = (0.01 + rnd() * 0.05) * RES, depth = -0.00012 * (0.5 + rnd());
    for (let t = 0; t < L; t += 0.5) { const xi = Math.round(x + Math.cos(a) * t), yi = Math.round(y + Math.sin(a) * t + Math.sin(t * 0.05) * 3); if (xi >= 0 && yi >= 0 && xi < RES && yi < RES) out[yi * RES + xi] = Math.min(out[yi * RES + xi], depth); }
  }
  for (let i = 0; i < Math.round(8 * coin.wear + 2); i++) {
    const cx = rnd() * RES, cy = rnd() * RES, r = (0.004 + rnd() * 0.006) * RES;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) { if (x < 0 || y < 0 || x >= RES || y >= RES) continue; const q = Math.hypot(x - cx, y - cy) / r; if (q < 1) out[y * RES + x] = Math.min(out[y * RES + x], -0.0003 * (1 - q * q)); }
  }
  return blur(out, 0.6 * PXS);
}
// A raised line for the ground the figures stand on (the exergue line).
function groundLine(coin, yMetres, height) {
  const out = new Float32Array(RES * RES), pxPerM = RES / coin.diameter, y0 = RES / 2 - yMetres * pxPerM, half = 0.072 * pxPerM;
  for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) { const dy = Math.abs(y - y0), dx = Math.abs(x - RES / 2); if (dy < 2.2 && dx < half) out[y * RES + x] = height * (1 - dy / 3); }
  return out;
}

// From a height map (metres above the field) to the coin's textures.
// normal: tangent-space, glTF convention (green = up the picture). colour: polished high points, toned recesses,
// worn crowns on the silver, mottled toning across the field. roughness/metal (glTF: G = roughness, B = metal):
// recesses duller, high points bright. Outside the field (rim, edge) plain metal, a little worn.
function textures(H, coin) {
  const pxM = coin.diameter / RES, nrm = createCanvas(RES, RES), col = createCanvas(RES, RES), mr = createCanvas(RES, RES);
  const ni = nrm.getContext('2d').createImageData(RES, RES), ci = col.getContext('2d').createImageData(RES, RES), ri = mr.getContext('2d').createImageData(RES, RES);
  const cav = blur(H, 6 * PXS), wide = blur(H, 18 * PXS), at = (x, y) => H[clamp(y, 0, RES - 1) * RES + clamp(x, 0, RES - 1)];
  const enc = (c) => Math.pow(clamp(c), 1 / 2.2) * 255;
  const rField = 1 - (2 * coin.rim) / coin.diameter;
  const n2 = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, h = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7 + coin.seed * 17) * 43758.5453; return v - Math.floor(v); }, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v); };
  const fbm = (x, y) => 0.5 * n2(x, y) + 0.3 * n2(x * 2.1, y * 2.1) + 0.2 * n2(x * 4.3, y * 4.3);
  for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) {
    const i = y * RES + x;
    // Sobel slope, so the normals are smooth at 1024 px
    const sx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) / (8 * pxM);
    const sy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) / (8 * pxM);
    const n = norm([-sx * coin.normalStrength, sy * coin.normalStrength, 1]);
    ni.data[i * 4] = (n[0] * 0.5 + 0.5) * 255; ni.data[i * 4 + 1] = (n[1] * 0.5 + 0.5) * 255; ni.data[i * 4 + 2] = (n[2] * 0.5 + 0.5) * 255; ni.data[i * 4 + 3] = 255;
    const r = Math.hypot(x + 0.5 - RES / 2, y + 0.5 - RES / 2) / (RES / 2), onField = r < rField - 0.004;
    const rel = (H[i] - cav[i]) / (coin.relief * 0.22), recess = clamp(-rel), proud = clamp(rel);
    const high = clamp((H[i] - wide[i]) / (coin.relief * 0.35));                     // crowns that wear first
    const mottle = fbm(x / RES * 7, y / RES * 7), dirt = clamp((mottle - 0.45) * 2.2) * 0.35;
    let c = coin.metal.slice(), rough = coin.roughness[0] * 0.75;
    if (onField) {
      c = c.map((m, k) => lerp(m, coin.toned[k], clamp(recess * 0.9 + dirt * (1 - proud))));
      c = c.map((m, k) => lerp(m, coin.polish[k], clamp(proud * 0.6 + high * coin.wear)));
      rough = lerp(coin.roughness[0], coin.roughness[1], clamp(proud + high * 0.8)) + recess * 0.15 + dirt * 0.1;
      if (H[i] < -1e-5) { c = c.map((m, k) => lerp(m, coin.toned[k], 0.5)); rough += 0.1; }   // scratches and knocks
    } else {
      c = c.map((m, k) => lerp(m, coin.toned[k], dirt * 0.5));
      rough = coin.roughness[0] * 0.9 + dirt * 0.15;                                       // the rim and edge: handled, satin
    }
    for (let k = 0; k < 3; k++) ci.data[i * 4 + k] = enc(c[k]);
    ci.data[i * 4 + 3] = 255;
    ri.data[i * 4] = 255; ri.data[i * 4 + 1] = clamp(rough) * 255; ri.data[i * 4 + 2] = 255; ri.data[i * 4 + 3] = 255;
  }
  nrm.getContext('2d').putImageData(ni, 0, 0); col.getContext('2d').putImageData(ci, 0, 0); mr.getContext('2d').putImageData(ri, 0, 0);
  return { nrm, col, mr };
}
// Front and back side by side in one texture: front on the left half, back on the right.
function pair(a, b) { const c = createCanvas(RES * 2, RES), g = c.getContext('2d'); g.drawImage(a, 0, 0); g.drawImage(b, RES, 0); return c; }
function tex(canvas, png, linear) {
  const w = canvas.width, h = canvas.height, src = canvas.getContext('2d').getImageData(0, 0, w, h).data, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) data.set(src.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat); t.flipY = false; t.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.userData.mimeType = png ? 'image/png' : 'image/jpeg'; t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------ the low-poly coin
// Rings of a disc: the field (a fan, its relief all in the textures), the inner wall of the rim sloping up, the
// rim's rounded top, then the edge round the side, slightly barrel-shaped like a struck flan. Each band has its
// own vertices so the crease at the field's edge stays sharp. UVs: the face's own picture (front on the left half
// of the texture, back on the right, the back mirrored so it reads correctly from behind).
function coinGeometry(coin) {
  const N = coin.segments, R = coin.diameter / 2, Ri = R - coin.rim, tz = coin.thickness / 2, fz = tz - coin.rimHeight, b = coin.bevel;
  const pos = [], nor = [], uv = [], idx = [];
  const faceUV = (x, y, side) => [side > 0 ? 0.25 + (x / coin.diameter) * 0.5 : 0.75 - (x / coin.diameter) * 0.5, 0.5 + y / coin.diameter];
  const vert = (x, y, z, n, side, uvr = 1) => { pos.push(x, y, z); nor.push(...n); uv.push(...faceUV(x * uvr, y * uvr, side)); return pos.length / 3 - 1; };
  // the flan is not quite round: a gentle wobble in the outer radius
  const wob = (a) => 1 + 0.008 * Math.sin(a * 3 + coin.seed) + 0.005 * Math.sin(a * 5 + coin.seed * 2);
  const ring = (r, z, nf, side, outer = false, uvr = 1) => Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), k = outer ? wob(a) : 1;
    return vert(c * r * k, s * r * k, z, nf(c, s), side, uvr / k);
  });
  const band = (A, B, side) => { for (let i = 0; i < N; i++) { const j = (i + 1) % N, q = side > 0 ? [A[i], B[i], B[j], A[j]] : [A[i], A[j], B[j], B[i]]; idx.push(q[0], q[1], q[2], q[0], q[2], q[3]); } };   // A: the inner ring, B: the outer; faces point out of the coin
  // rim profile from the field edge outwards: [radius, height above the field plane, outward slope of the normal]
  const wall = 0.0035, prof = [[Ri, 0], [Ri + wall * 0.55, coin.rimHeight * 0.75], [Ri + wall, coin.rimHeight], [R - b * 1.4, coin.rimHeight * 0.98], [R - b * 0.5, coin.rimHeight * 0.82], [R, coin.rimHeight - b * 0.9]];
  for (const side of [1, -1]) {
    const up = () => [0, 0, side];
    const centre = vert(0, 0, side * fz, up(), side), field = ring(Ri, side * fz, up, side);
    for (let i = 0; i < N; i++) { const j = (i + 1) % N; side > 0 ? idx.push(centre, field[i], field[j]) : idx.push(centre, field[j], field[i]); }
    let prev = null;
    for (let k = 0; k < prof.length; k++) {
      const [r, h] = prof[k], [r0, h0] = prof[Math.max(0, k - 1)], [r1, h1] = prof[Math.min(prof.length - 1, k + 1)];
      const dr = r1 - r0, dh = h1 - h0, nl = Math.hypot(dr, dh);
      const nf = (c, s) => norm([(-dh / nl) * c, (-dh / nl) * s, side * (dr / nl)]);
      // rim UVs sit just outside the field picture, on plain metal
      const cur = ring(r, side * (fz + h), nf, side, k >= 3, 1);
      if (prev) band(prev, cur, side);
      prev = cur;
      if (k === 0) { /* the field's edge crease: the wall starts with its own vertices */ }
    }
  }
  // the edge round the side: three rings, bulging slightly
  const out = (c, s) => [c, s, 0];
  const zEdge = tz - b * 0.9, rings = [zEdge, 0, -zEdge].map((z, k) => ring(R * (k === 1 ? 1.004 : 1), z, (c, s) => norm([c, s, k === 0 ? 0.25 : k === 2 ? -0.25 : 0]), 1, true, 0.985));
  for (let k = 0; k < 2; k++) { const A = rings[k], B = rings[k + 1]; for (let i = 0; i < N; i++) { const j = (i + 1) % N; idx.push(A[i], B[i], B[j], A[i], B[j], A[j]); } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------------ build
async function buildCoin(coin, faces) {
  const maps = [];
  for (const f of faces) {
    let H = new Float32Array(RES * RES);
    for (const layer of f.layers) { const L = await layer(); for (let i = 0; i < H.length; i++) H[i] = Math.max(H[i], L[i]); }
    H = blur(H, coin.soften * PXS);
    const marks = wearMarks({ ...coin, seed: coin.seed + maps.length });
    for (let i = 0; i < H.length; i++) H[i] += marks[i];
    // nothing outside the field: the rim is real geometry
    const r0 = (coin.diameter / 2 - coin.rim) / coin.diameter * RES;
    for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) if (Math.hypot(x + 0.5 - RES / 2, y + 0.5 - RES / 2) > r0 - 1) H[y * RES + x] = Math.min(0, H[y * RES + x]) * 0.5;
    maps.push(textures(H, coin));
    lap(`${coin.name} ${f.name}`);
  }
  const geo = coinGeometry(coin);
  const material = new THREE.MeshStandardMaterial({
    name: coin.name, color: 0xffffff, metalness: 1, roughness: coin.roughness,
    map: tex(pair(maps[0].col, maps[1].col), false, false),
    normalMap: tex(pair(maps[0].nrm, maps[1].nrm), true, true), normalScale: new THREE.Vector2(1, -1),
    metalnessMap: null, roughnessMap: null,
  });
  // one texture for roughness (G) and metalness (B), as glTF stores them
  const rm = tex(pair(maps[0].mr, maps[1].mr), false, true); material.roughnessMap = rm; material.metalnessMap = rm; material.roughness = 1;
  const m = new THREE.Mesh(geo, material); m.name = coin.name;
  console.log(`${coin.name}: ${geo.index.count / 3} triangles`);
  return m;
}
// A portrait layer: the head sculpted at life size, fitted into the field, flattened into relief.
const portraitLayer = (who, coin, span) => async () => {
  const { H, top } = await bakeHeights(portrait(who), { cx: 0.01, cy: -0.05, span, z0: -0.04 }, { h: +(process.env.HP || 0.0016), target: 400000, clip: (x, y, z) => truncation(x, y) });
  return lowRelief(H, top, coin.relief);
};
const figureLayer = (S, coin, view) => async () => {
  const { H, top } = await bakeHeights(S, view, { h: +(process.env.HF || 0.0045), target: 400000 });
  return lowRelief(H, top, coin.relief * 0.85);
};

const D = COINS.denarius, A = COINS.aureus;
const paxView = { cx: -0.12, cy: 0.9, span: 2.75, z0: -0.12 }, vicView = { cx: -0.05, cy: 1.16, span: 3.05, z0: -0.15 };
const denarius = await buildCoin(D, [
  { name: 'Titus', layers: [portraitLayer('titus', D, 0.6), () => legend('IMP T CAESAR VESPASIANVS AVG', D, D.legendHeight, [0.42, 0.42]), () => beads(D, D.legendHeight * 0.9)] },
  { name: 'Pax', layers: [figureLayer(robedFigure(PAX, (S, p) => olive(S, p.arms.r.wrist, [-0.55, 0.75, 0.1], 0.42)), D, paxView),
    () => groundLine(D, -paxView.cy / paxView.span * D.diameter - 0.004, D.relief * 0.35), () => legend('PAX AVGVST', D, D.legendHeight, [0.6, 0.6]), () => beads(D, D.legendHeight * 0.9)] },
]);
const aureus = await buildCoin(A, [
  { name: 'Vespasian', layers: [portraitLayer('vespasian', A, 0.56), () => legend('IMP CAESAR VESPASIANVS AVG', A, A.legendHeight, [0.42, 0.42]), () => beads(A, A.legendHeight * 0.9)] },
  { name: 'Victory', layers: [figureLayer(robedFigure(VICTORY, victoryExtras), A, vicView), () => victoryDrawn(vicView, A.relief * 0.62),
    () => groundLine(A, -vicView.cy / vicView.span * A.diameter - 0.004, A.relief * 0.35), () => legend('VICTORIA', A, A.legendHeight, [0.45, Math.PI + 0.42]), () => legend('AVGVSTI', A, A.legendHeight, [Math.PI + 0.42, 0.45]), () => beads(A, A.legendHeight * 0.9)] },
]);

const scene = new THREE.Scene();
scene.add(denarius, aureus);
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync('coins.glb', Buffer.from(glb));
console.log(`coins.glb: ${(glb.byteLength / 1048576).toFixed(2)} MB`);
lap('done');
