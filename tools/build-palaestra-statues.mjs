// Escape Pompeii — sculpted statues for the Great Palaestra (signed-distance anatomy, meshed at 3.5–4 mm).
// Standing: two spear-bearers (Doryphoros type) and two fillet-binders (Diadumenos type) along the colonnade,
// the emperor as Jupiter in the west hall. Fallen: a bronze fillet-binder across the track with its forearm snapped off,
// and a marble spear-bearer broken at the shins, its feet still on the pedestal.
// Output: pompeii-palaestra-statues.glb. Run: node build-palaestra-statues.mjs
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createCanvas, ImageData as NapiImageData } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { figure, POSES } from './anatomy.mjs';
import { mesh, sdSphere, sub, dot, norm, lerp3, add, mul, len } from './sculpt.mjs';
import * as TX from './villa-textures.mjs';
globalThis.ImageData = NapiImageData;
globalThis.FileReader = class { readAsArrayBuffer(b) { b.arrayBuffer().then(x => { this.result = x; this.onloadend?.(); }); } readAsDataURL(b) { b.arrayBuffer().then(x => { this.result = `data:${b.type};base64,` + Buffer.from(x).toString('base64'); this.onloadend?.(); }); } };
globalThis.OffscreenCanvas = function (w, h) { const c = createCanvas(w, h); c.convertToBlob = async (o = {}) => new Blob([c.toBuffer(o.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 86)], { type: o.type || 'image/png' }); return c; };
globalThis.OffscreenCanvas.prototype = Object.getPrototypeOf(createCanvas(1, 1));

const H = +(process.env.H || 0.0035);
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x, y, z) => { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf); let r = 0; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) r += hash(xi + a, yi + b, zi + c) * (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? w : 1 - w); return r; };
const mixc = (a, b, t) => a.map((x, i) => x + (b[i] - x) * Math.max(0, Math.min(1, t)));

function eyeTone(S, p, white, iris, pupil) {
  let best = null, bd = 1e9; for (const e of S.eyes) { const d = len(sub(p, e.c)); if (d < bd) { bd = d; best = e; } }
  const c = dot(norm(sub(p, best.c)), best.front); return c > 0.985 ? pupil : c > 0.92 ? iris : white;
}
// ancient paint on marble: faded colour on hair, eyes, lips, garments; dirt in the creases
const marblePal = (S, opts = {}) => (tag, p, n, ao) => {
  const base = { skin: [0.94, 0.915, 0.87], hair: [0.76, 0.64, 0.5], lip: [0.86, 0.7, 0.64], cloth: opts.cloth ?? [0.93, 0.9, 0.85], plinth: [0.9, 0.88, 0.84], ribbon: [0.72, 0.24, 0.18], wreath: [0.84, 0.68, 0.32] }[tag];
  let c = tag === 'eye' ? eyeTone(S, p, [0.95, 0.93, 0.88], [0.52, 0.42, 0.32], [0.2, 0.15, 0.12]) : base ?? [0.94, 0.915, 0.87];
  const dirt = (vnoise(p[0] * 30, p[1] * 30, p[2] * 30) - 0.5) * 0.06 + (opts.grime ?? 0) * (1 - Math.max(0, n[1]));
  const k = (0.5 + 0.5 * ao) * (1 - dirt);
  return c.map(x => x * k);
};
// bronze with inlaid stone eyes, copper lips, verdigris in the hollows
const bronzePal = S => (tag, p, n, ao) => {
  if (tag === 'eye') return eyeTone(S, p, [0.86, 0.84, 0.78], [0.36, 0.26, 0.16], [0.08, 0.06, 0.05]);
  let c = tag === 'lip' ? [0.66, 0.36, 0.24] : tag === 'ribbon' ? [0.62, 0.42, 0.3] : [0.46, 0.32, 0.19];
  c = mixc(c, [0.62, 0.46, 0.3], Math.max(0, n[1]) * 0.25 * ao);                                       // rubbed highlights
  c = mixc(c, [0.3, 0.48, 0.4], (0.85 - ao) * 2.2 + (vnoise(p[0] * 18, p[1] * 18, p[2] * 18) - 0.6) * 1.2);   // patina
  return c.map(x => x * (0.62 + 0.38 * ao));
};

const T0 = Date.now(), lap = n => console.log(`${n} ${((Date.now() - T0) / 1000).toFixed(0)}s`);
const geoms = {};
// standing statues
{ const S = figure(POSES.doryphoros); geoms.dory = await mesh(S, { h: H, target: 72000, palette: marblePal(S) }); lap('doryphoros'); }
{ const S = figure(POSES.diadumenos); geoms.diad = await mesh(S, { h: H, target: 72000, palette: marblePal(S) }); lap('diadumenos'); }
{ const S = figure(POSES.emperor); geoms.emperor = await mesh(S, { h: H, target: 110000, palette: marblePal(S, { cloth: [0.66, 0.5, 0.58] }) }); lap('emperor'); }
// fallen bronze fillet-binder: right forearm snapped off at the elbow
{
  const P = { ...POSES.diadumenos, plinth: false }, S = figure(P), E = P.arms.r.elbow, W = P.arms.r.wrist, dir = norm(sub(W, E)), cutP = add(E, mul(dir, 0.03));
  const sphere = sdSphere(lerp3(E, W, 0.7), 0.24), brk = (x, y, z) => -dot(sub([x, y, z], cutP), dir) + 0.012 * Math.sin(x * 160) * Math.sin(y * 140 + z * 90);
  const region = (x, y, z) => Math.max(sphere(x, y, z), brk(x, y, z));
  geoms.diadFallen = await mesh(S, { h: H * 1.15, target: 75000, palette: bronzePal(S), clip: (x, y, z) => -region(x, y, z) }); lap('fallen bronze');
  const c = lerp3(E, W, 0.75); geoms.diadArm = await mesh(S, { h: H, target: 15000, palette: bronzePal(S), clip: region, bounds: { lo: [c[0] - 0.3, c[1] - 0.3, c[2] - 0.3], hi: [c[0] + 0.3, c[1] + 0.3, c[2] + 0.3] } }); lap('broken forearm');
}
// fallen marble spear-bearer: snapped at the shins, feet left on the plinth
{
  const S = figure(POSES.doryphoros), cut = (x, y, z) => 0.24 + 0.02 * Math.sin(x * 90) + 0.015 * Math.sin(z * 120 + x * 40);
  geoms.doryFallen = await mesh(S, { h: H * 1.15, target: 70000, palette: marblePal(S, { grime: 0.08 }), clip: (x, y, z) => cut(x, y, z) - y }); lap('fallen marble');
  geoms.doryStumps = await mesh(S, { h: H, target: 20000, palette: marblePal(S, { grime: 0.04 }), clip: (x, y, z) => y - cut(x, y, z), bounds: { lo: [-0.32, -0.08, -0.32], hi: [0.32, 0.32, 0.32] } }); lap('stumps');
}

// ---------------------------------------------------------------- materials and placement
const tex = (() => { const c = TX.marbleTexture(), w = c.width, h = c.height, src = c.getContext('2d').getImageData(0, 0, w, h).data, data = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) data.set(src.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; t.userData.mimeType = 'image/jpeg'; return t; })();
const MARBLE = new THREE.MeshStandardMaterial({ name: 'marble', map: tex, vertexColors: true, roughness: 0.32 });
const BRONZE = new THREE.MeshStandardMaterial({ name: 'bronze_statue', color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0.75 });
const ROD = new THREE.MeshStandardMaterial({ name: 'bronze', color: 0x6a5232, roughness: 0.4, metalness: 0.8 });
const GOLD = new THREE.MeshStandardMaterial({ name: 'gilt', color: 0xc9a24a, roughness: 0.3, metalness: 0.9 });
const STONE = new THREE.MeshStandardMaterial({ name: 'marble_block', map: tex, color: 0xd8d2c6, roughness: 0.4 });
for (const g of Object.values(geoms)) {           // box-projected marble veins
  const P = g.attributes.position, N = g.attributes.normal, uv = new Float32Array(P.count * 2), s = 1 / 0.9;
  for (let i = 0; i < P.count; i++) { const ax = Math.abs(N.getX(i)), ay = Math.abs(N.getY(i)), az = Math.abs(N.getZ(i)); const [u, v] = ay >= ax && ay >= az ? [P.getX(i), P.getZ(i)] : ax >= az ? [P.getZ(i), P.getY(i)] : [P.getX(i), P.getY(i)]; uv[i * 2] = u * s; uv[i * 2 + 1] = v * s; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
const root = new THREE.Group(); root.name = 'Palaestra_Statues';
const put = (name, g, mat, pos, rot = [0, 0, 0], scale = 1) => { const m = new THREE.Mesh(g, mat); m.name = name; m.position.set(...pos); m.rotation.set(...rot, 'YXZ'); m.scale.setScalar(scale); root.add(m); return m; };
const restOn = (m, y) => { m.updateMatrixWorld(); const b = new THREE.Box3().setFromObject(m); m.position.y += y - b.min.y; };
const rod = (name, a, b, r, mat) => { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B), g = new THREE.CylinderGeometry(r, r, L, 12); g.translate(0, L / 2, 0); const m = new THREE.Mesh(g, mat); m.name = name; m.position.copy(A); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); root.add(m); return m; };
// local → world for a statue standing at (x, y, z) turned by ry
const L2W = (x, y, z, ry, s = 1) => p => { const c = Math.cos(ry), sn = Math.sin(ry); return [x + (p[0] * c + p[2] * sn) * s, y + p[1] * s, z + (-p[0] * sn + p[2] * c) * s]; };

// colonnade: facing the avenue (−x)
const turn = -Math.PI / 2;
for (const [z, kind] of [[37.5, 'dory'], [70.5, 'diad'], [91.5, 'dory'], [118.5, 'diad']]) {
  put(`Statue_${kind}_${z}`, geoms[kind], MARBLE, [7.2, 1.2 + 0.07, z], [0, turn, 0]);
  if (kind === 'dory') {                           // bronze spear through the left fist, resting back on the shoulder
    const A = POSES.doryphoros.arms.l, fist = add(A.wrist, mul(norm(A.hand), 0.06)), d = norm([0.02, 1, -0.42]), w = L2W(7.2, 1.27, z, turn);
    rod(`Spear_${z}`, w(add(fist, mul(d, -0.95))), w(add(fist, mul(d, 1.25))), 0.012, ROD);
  }
}
// west hall: the emperor, 1.12 × life size, sceptre and globe
{ const s = 1.12, w = L2W(-36, 1.4 + 0.07 * s, -9.6, 0, s), A = POSES.emperor.arms;
  put('Statue_emperor', geoms.emperor, MARBLE, [-36, 1.4 + 0.07 * s, -9.6], [0, 0, 0], s);
  const fist = add(A.r.wrist, mul(norm(A.r.hand), 0.05)); rod('Sceptre', w(add(fist, [0, -1.75, 0])), w(add(fist, [0, 0.45, 0])), 0.014, GOLD);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.035, 20, 14), GOLD); top.position.set(...w(add(fist, [0, 0.47, 0]))); top.name = 'Sceptre_finial'; root.add(top);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.075 * s, 40, 28), GOLD); globe.position.set(...w(add(add(A.l.wrist, mul(norm(A.l.hand), 0.055)), [0, 0.09, 0]))); globe.name = 'Globe'; root.add(globe); }
// fallen bronze across lanes 1–2 at z 28: lying on its back, head towards +x
{ const m = put('Fallen_bronze_athlete', geoms.diadFallen, BRONZE, [-0.35, 0, 28.0], [0, -Math.PI / 2, -Math.PI / 2 + 0.06]); restOn(m, 0);
  const a = put('Fallen_bronze_forearm', geoms.diadArm, BRONZE, [2.55, 0, 28.75], [0.4, 1.2, 1.9]); restOn(a, 0); }
// fallen marble spear-bearer beside the colonnade, the feet still on their pedestal
{ const ped = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.9).translate(0, 0.6, 0), STONE); ped.position.set(7.2, 0, 59.5); ped.name = 'Empty_pedestal'; root.add(ped);
  put('Broken_feet', geoms.doryStumps, MARBLE, [7.2, 1.2 + 0.07, 59.5], [0, turn, 0]);
  const m = put('Fallen_marble_athlete', geoms.doryFallen, MARBLE, [6.15, 0, 56.6], [0, Math.PI, -Math.PI / 2 - 0.05]); restOn(m, 0);
  rod('Fallen_spear', [5.6, 0.03, 54.4], [6.3, 0.03, 58.6], 0.012, ROD); }

const scene = new THREE.Scene(); scene.add(root);
let tris = 0; root.traverse(o => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync('pompeii-palaestra-statues.glb', Buffer.from(glb));
console.log(`pompeii-palaestra-statues.glb: ${(glb.byteLength / 1048576).toFixed(2)} MB, ${tris} tris drawn`);
MARBLE.map = null; STONE.map = null;
const lite = await new GLTFExporter().parseAsync(scene, { binary: true });
writeFileSync('pompeii-palaestra-statues-lite.glb', Buffer.from(lite)); console.log(`lite ${(lite.byteLength / 1048576).toFixed(2)} MB`);
