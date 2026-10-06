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

const RES = +(process.env.RES || 512);   // texture pixels across one face
const T0 = Date.now(), lap = (n) => console.log(`  ${n} ${((Date.now() - T0) / 1000).toFixed(0)}s`);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), lerp = (a, b, t) => a + (b - a) * t, smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const white = () => [1, 1, 1];

// ------------------------------------------------------------------ the coins
const COINS = {
  denarius: { name: 'Coin_Denarius', diameter: 0.30, thickness: 0.032, rim: 0.011, rimHeight: 0.0045, bevel: 0.006, segments: 40,
    relief: 0.009, legendHeight: 0.0035, soften: 2.2, normalStrength: 1.6,
    metal: [0.93, 0.93, 0.91], toned: [0.42, 0.42, 0.44], roughness: 0.34 },
  aureus: { name: 'Coin_Aureus', diameter: 0.35, thickness: 0.036, rim: 0.012, rimHeight: 0.005, bevel: 0.0015, segments: 40,
    relief: 0.01, legendHeight: 0, soften: 0.7, normalStrength: 1.6,
    metal: [1.0, 0.72, 0.3], toned: [0.6, 0.33, 0.1], roughness: 0.2 },
};

// ------------------------------------------------------------------ sculpting
// A laureate head in profile facing right (+x), with the neck cut off in a curve below, as on the coins.
// who: 'titus' (round, full face, thick hair) or 'vespasian' (older: heavy jaw and jowls, lined brow, thinning hair).
function portrait(who) {
  const S = new Sculpture(), Fh = frame(Math.PI / 2, 0, 0.05), at = (l) => Fh.at([0, 0, 0], l);
  head(S, [0, 0, 0], Fh, { curls: who === 'titus' ? 170 : 90, wreath: true });
  // neck and the top of the shoulders, leaning forward a little
  S.cone(at([0, -0.07, -0.02]), at([0, -0.2, -0.05]), 0.058, 0.066, 0.03);
  S.ell(at([0, -0.24, -0.06]), [0.1, 0.06, 0.12], Fh, 0.04);
  if (who === 'titus') {
    S.ell(at([0, -0.035, 0.03]), [0.072, 0.07, 0.066], Fh, 0.03);                                    // fuller cheeks
    S.ell(at([0, -0.088, 0.035]), [0.06, 0.03, 0.05], Fh, 0.03);                                     // rounded jaw
  } else {
    S.ell(at([0, -0.09, 0.03]), [0.068, 0.04, 0.06], Fh, 0.035);                                     // heavy jaw
    for (const s of [-1, 1]) S.ell(at([s * 0.05, -0.075, 0.035]), [0.024, 0.03, 0.03], Fh, 0.02);  // jowls
    S.ell(at([0, -0.115, 0.02]), [0.04, 0.025, 0.04], Fh, 0.03);                                     // double chin
    for (const y of [0.052, 0.064]) S.cone(at([-0.035, y, 0.088]), at([0.035, y, 0.088]), 0.0022, 0.0022, 0.002, 'skin', 'sub');   // lines across the brow
    S.cone(at([0, 0.018, 0.093]), at([0, -0.036, 0.122]), 0.009, 0.014, 0.008);                      // a bigger, hooked nose
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
    return Math.max(d, y - 1.47, 0.03 - y) + 0.006 * Math.sin(Math.atan2(x - cx, z - cz) * 13 + y * 2.5);
  };
  S.custom(robe, [P[0], 0.75, P[2]], 0.85, 0.03, 'cloth');
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
// Victory: striding to the right with spread wings, the right arm raised to set a wreath on a trophy of arms.
const VICTORY = { ...POSES.emperor, drape: null, headYaw: 0.5, headOpts: { curls: 120 }, robeSway: 0.05,
  arms: { r: { elbow: T(-0.3, 1.62, 0.08), wrist: T(-0.12, 1.9, 0.1), hand: T(0.5, 0.8, 0.1), palm: T(0, -1, 0), grip: 0.7 },
          l: { elbow: T(0.27, 1.1, 0.06), wrist: T(0.32, 0.88, 0.16), hand: T(0, -1, 0.1), palm: T(-1, 0, 0), grip: 0.85 } } };
const TROPHY_X = 0.75;
function victoryExtras(S, pose) {
  const C = pose.chest;
  // wings: long feathered blades rising from the shoulder blades, spread up and out
  for (const s of [-1, 1]) {
    const root = add(C, [s * 0.1, 0.12, -0.06]);
    for (let k = 0; k < 6; k++) {
      const ang = s * (0.45 + k * 0.16), len = 0.82 - k * 0.08, dir = [Math.sin(ang), Math.cos(ang), -0.05];
      S.cone(root, add(root, mul(norm(dir), len)), 0.065 - k * 0.005, 0.02, 0.025, 'cloth');
    }
    // the wing's body, filling between the long feathers
    const mid = norm([Math.sin(s * 0.85), Math.cos(0.85), -0.05]);
    S.ell(add(root, mul(mid, 0.36)), [0.2, 0.38, 0.035], frameAlong(mid, [0, 0, 1]), 0.05, 'cloth');
  }
  // the laurel wreath in the raised hand, held over the trophy
  const w = add(pose.arms.r.wrist, [0.13, 0.08, 0.02]);
  S.custom(sdTorus(w, 0.075, 0.016, frame(0, 0, Math.PI / 2)), w, 0.1, 0.005, 'cloth');
  // the trophy: a post with a crossbar, a cuirass, a crested helmet and two oval shields, on a low mound
  const X = TROPHY_X, Y = (y) => [X, y, -0.02];
  S.cone(Y(0.02), Y(1.62), 0.035, 0.03, 0.01, 'cloth');
  S.cone(add(Y(1.36), [-0.32, 0, 0]), add(Y(1.36), [0.32, 0, 0]), 0.026, 0.026, 0.01, 'cloth');
  S.ell(Y(1.2), [0.17, 0.22, 0.1], null, 0.03, 'cloth');                                               // cuirass
  S.ell(Y(1.04), [0.19, 0.06, 0.11], null, 0.03, 'cloth');                                              // its skirt of straps
  S.sphere(Y(1.6), 0.1, 0.02, 'cloth');                                                                 // helmet
  S.ell(add(Y(1.72), [-0.02, 0, 0]), [0.12, 0.05, 0.03], null, 0.02, 'cloth');                          // crest
  for (const s of [-1, 1]) S.ell(add(Y(1.12), [s * 0.36, 0, 0.04]), [0.12, 0.2, 0.035], null, 0.02, 'cloth');   // shields
  S.ell(Y(0.0), [0.32, 0.08, 0.18], null, 0.05, 'cloth');                                               // mound
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
function lowRelief(H, top, relief, detail = 1.4) {
  const out = new Float32Array(H.length), k = 3 / top, lin = Float32Array.from(H, (h) => h * relief / top), soft = blur(lin, 5);
  for (let i = 0; i < H.length; i++) out[i] = Math.max(0, relief * (1 - Math.exp(-H[i] * k)) / (1 - Math.exp(-3)) + detail * (lin[i] - soft[i]));
  return out;
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
// Raised letters running clockwise round the rim from the lower left, tops towards the edge.
function legend(text, coin, height) {
  const c = createCanvas(RES, RES), g = c.getContext('2d'), R = RES / 2, pxPerM = RES / coin.diameter;
  const outer = (coin.diameter / 2 - coin.rim - 0.003) * pxPerM, size = 0.019 * pxPerM, radius = outer - size * 0.82;
  g.fillStyle = '#fff'; g.font = `bold ${Math.round(size)}px "Liberation Serif"`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const start = Math.PI * 0.72, end = Math.PI * 2.28, step = (end - start) / (text.length - 1);
  [...text].forEach((ch, i) => {
    const a = start + i * step;   // angle from straight down, clockwise on the face
    g.save(); g.translate(R - Math.sin(a) * radius, R + Math.cos(a) * radius); g.rotate(a + Math.PI); g.scale(0.82, 1.15); g.fillText(ch, 0, size * 0.42); g.restore();
  });
  const d = g.getImageData(0, 0, RES, RES).data, out = new Float32Array(RES * RES);
  for (let i = 0; i < out.length; i++) out[i] = (d[i * 4] / 255) * height;
  return blur(out, 0.6);
}
// A raised line for the ground the figures stand on (the exergue line).
function groundLine(coin, yMetres, height) {
  const out = new Float32Array(RES * RES), pxPerM = RES / coin.diameter, y0 = RES / 2 - yMetres * pxPerM, half = 0.072 * pxPerM;
  for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) { const dy = Math.abs(y - y0), dx = Math.abs(x - RES / 2); if (dy < 2.2 && dx < half) out[y * RES + x] = height * (1 - dy / 3); }
  return out;
}

// From a height map (metres above the field) to the coin's textures.
// normal: tangent-space, glTF convention (green = up the picture). colour: polished high points, toned recesses,
// a little wear on the silver; outside the field (rim, edge) plain metal.
function textures(H, coin) {
  const pxM = coin.diameter / RES, nrm = createCanvas(RES, RES), col = createCanvas(RES, RES);
  const ni = nrm.getContext('2d').createImageData(RES, RES), ci = col.getContext('2d').createImageData(RES, RES);
  const cav = blur(H, 6), at = (x, y) => H[clamp(y, 0, RES - 1) * RES + clamp(x, 0, RES - 1)];
  const lin = (c) => Math.pow(c, 1 / 2.2) * 255;
  for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) {
    const i = y * RES + x;
    const dx = (at(x + 1, y) - at(x - 1, y)) / (2 * pxM) * coin.normalStrength, dyUp = -(at(x, y + 1) - at(x, y - 1)) / (2 * pxM) * coin.normalStrength;
    const n = norm([-dx, -dyUp, 1]);
    ni.data[i * 4] = (n[0] * 0.5 + 0.5) * 255; ni.data[i * 4 + 1] = (n[1] * 0.5 + 0.5) * 255; ni.data[i * 4 + 2] = (n[2] * 0.5 + 0.5) * 255; ni.data[i * 4 + 3] = 255;
    // recess: lower than its surroundings → toned; proud: higher → polished
    const rel = (H[i] - cav[i]) / (coin.relief * 0.25), recess = clamp(-rel), proud = clamp(rel);
    const fieldEdge = Math.hypot(x - RES / 2, y - RES / 2) / (RES / 2) > 1 - (2 * coin.rim) / coin.diameter;
    let c = coin.metal.map((m, k) => lerp(m, coin.toned[k], fieldEdge ? 0 : recess * 0.85));
    c = c.map((v) => v * (fieldEdge ? 1 : 0.94 + 0.08 * proud));
    for (let k = 0; k < 3; k++) ci.data[i * 4 + k] = clamp(lin(clamp(c[k])), 0, 255);
    ci.data[i * 4 + 3] = 255;
  }
  nrm.getContext('2d').putImageData(ni, 0, 0); col.getContext('2d').putImageData(ci, 0, 0);
  return { nrm, col };
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
// Rings of a disc: field (a fan), the inner wall of the rim, the rim's top, its bevel, then the edge round the
// side. Each band has its own vertices so the creases stay sharp. UVs: the face's own picture (front on the left
// half of the texture, back on the right, the back mirrored so it reads correctly from behind).
function coinGeometry(coin) {
  const N = coin.segments, R = coin.diameter / 2, Ri = R - coin.rim, tz = coin.thickness / 2, fz = tz - coin.rimHeight, b = coin.bevel;
  const pos = [], nor = [], uv = [], idx = [];
  const faceUV = (x, y, side) => [side > 0 ? 0.25 + (x / coin.diameter) * 0.5 : 0.75 - (x / coin.diameter) * 0.5, 0.5 + y / coin.diameter];
  const vert = (x, y, z, n, side) => { pos.push(x, y, z); nor.push(...n); uv.push(...faceUV(x, y, side)); return pos.length / 3 - 1; };
  const ring = (r, z, nf, side) => Array.from({ length: N }, (_, i) => { const a = (i / N) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); return vert(c * r, s * r, z, nf(c, s), side); });
  const band = (A, B, side) => { for (let i = 0; i < N; i++) { const j = (i + 1) % N, q = side > 0 ? [A[i], A[j], B[j], B[i]] : [A[i], B[i], B[j], A[j]]; idx.push(q[0], q[1], q[2], q[0], q[2], q[3]); } };
  for (const side of [1, -1]) {
    const up = () => [0, 0, side];
    const centre = vert(0, 0, side * fz, up(), side), field = ring(Ri, side * fz, up, side);
    for (let i = 0; i < N; i++) { const j = (i + 1) % N; side > 0 ? idx.push(centre, field[i], field[j]) : idx.push(centre, field[j], field[i]); }
    const inward = (c, s) => [-c, -s, 0];
    band(ring(Ri, side * fz, inward, side), ring(Ri, side * tz, inward, side), side);           // inner wall of the rim
    band(ring(Ri, side * tz, up, side), ring(R - b, side * tz, up, side), side);                 // the rim's top
    const slope = (c, s) => norm([c, s, side]);
    band(ring(R - b, side * tz, slope, side), ring(R, side * (tz - b), slope, side), side);      // rounded (silver) or crisp (gold) edge of the rim
  }
  // the edge: a plain band round the side, between the two bevels
  const out = (c, s) => [c, s, 0];
  const A = ring(R, tz - b, out, 1), B = ring(R, -(tz - b), out, 1);
  for (let i = 0; i < N; i++) { const j = (i + 1) % N; idx.push(A[i], B[i], B[j], A[i], B[j], A[j]); }
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
    H = blur(H, coin.soften);
    // nothing outside the field: the rim is real geometry
    const r0 = (coin.diameter / 2 - coin.rim) / coin.diameter * RES;
    for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) if (Math.hypot(x + 0.5 - RES / 2, y + 0.5 - RES / 2) > r0 - 1) H[y * RES + x] = 0;
    maps.push(textures(H, coin));
    lap(`${coin.name} ${f.name}`);
  }
  const geo = coinGeometry(coin);
  const material = new THREE.MeshStandardMaterial({
    name: coin.name, color: 0xffffff, metalness: 1, roughness: coin.roughness,
    map: tex(pair(maps[0].col, maps[1].col), false, false),
    normalMap: tex(pair(maps[0].nrm, maps[1].nrm), true, true), normalScale: new THREE.Vector2(1, -1),
  });
  const m = new THREE.Mesh(geo, material); m.name = coin.name;
  console.log(`${coin.name}: ${geo.index.count / 3} triangles`);
  return m;
}
// A portrait layer: the head sculpted at life size, fitted into the field, flattened into relief.
const portraitLayer = (who, coin, span) => async () => {
  const { H, top } = await bakeHeights(portrait(who), { cx: 0.01, cy: -0.05, span, z0: -0.04 }, { h: 0.0022, target: 160000, clip: (x, y, z) => truncation(x, y) });
  return lowRelief(H, top, coin.relief);
};
const figureLayer = (S, coin, view) => async () => {
  const { H, top } = await bakeHeights(S, view, { h: 0.006, target: 160000 });
  return lowRelief(H, top, coin.relief * 0.85);
};

const D = COINS.denarius, A = COINS.aureus;
const denarius = await buildCoin(D, [
  { name: 'Titus', layers: [portraitLayer('titus', D, 0.6), () => legend('IMP T CAESAR VESPASIANVS AVG', D, D.legendHeight)] },
  { name: 'Pax', layers: [figureLayer(robedFigure(PAX, (S, p) => olive(S, p.arms.r.wrist, [-0.55, 0.75, 0.1], 0.42)), D, { cx: -0.12, cy: 0.9, span: 2.55, z0: -0.12 }), () => groundLine(D, -0.9 / 2.55 * D.diameter - 0.004, D.relief * 0.35)] },
]);
const aureus = await buildCoin(A, [
  { name: 'Vespasian', layers: [portraitLayer('vespasian', A, 0.52)] },
  { name: 'Victory', layers: [figureLayer(robedFigure(VICTORY, victoryExtras), A, { cx: 0.3, cy: 0.98, span: 2.45, z0: -0.15 }), () => groundLine(A, -0.98 / 2.45 * A.diameter - 0.004, A.relief * 0.35)] },
]);

const scene = new THREE.Scene();
scene.add(denarius, aureus);
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync('coins.glb', Buffer.from(glb));
console.log(`coins.glb: ${(glb.byteLength / 1048576).toFixed(2)} MB`);
lap('done');
