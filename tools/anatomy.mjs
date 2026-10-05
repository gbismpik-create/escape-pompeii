// Classical figures in signed-distance anatomy: Polykleitan athletes and an emperor in the guise of Jupiter.
// Units: metres, feet on y = 0, facing +z, the figure's left is +x. ~1.86 m tall before scaling.
import { Sculpture, v, add, sub, mul, dot, cross, len, norm, lerp3, frame, frameAlong, sdEllipsoid, sdRoundCone, sdTorus, sdSphere, smin } from './sculpt.mjs';

let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; const rr = (a, b) => a + (b - a) * rnd();

function head(S, Hc, Fh, o = {}) {
  const at = l => Fh.at(Hc, l);
  S.ell(at([0, 0.025, -0.012]), [0.077, 0.098, 0.093], Fh, 0.02);                       // cranium
  S.ell(at([0, -0.024, 0.034]), [0.066, 0.083, 0.064], Fh, 0.025);                      // face mass
  S.ell(at([0, 0.046, 0.05]), [0.06, 0.04, 0.046], Fh, 0.02);                           // forehead
  for (const s of [-1, 1]) {
    S.cone(at([s * 0.057, -0.028, -0.008]), at([s * 0.016, -0.092, 0.06]), 0.021, 0.019, 0.02);   // jaw line
    S.ell(at([s * 0.042, -0.012, 0.064]), [0.022, 0.016, 0.02], Fh, 0.015);            // cheekbones
  }
  S.ell(at([0, -0.099, 0.068]), [0.022, 0.018, 0.019], Fh, 0.014);                      // chin
  S.cone(at([-0.04, 0.021, 0.082]), at([0.04, 0.021, 0.082]), 0.0105, 0.0105, 0.014);    // brow ridge
  S.cone(at([0, 0.016, 0.09]), at([0, -0.03, 0.112]), 0.0085, 0.012, 0.008);            // nose
  for (const s of [-1, 1]) S.sphere(at([s * 0.012, -0.032, 0.101]), 0.0085, 0.006);      // nose wings
  for (const s of [-1, 1]) S.sphere(at([s * 0.0065, -0.041, 0.104]), 0.0042, 0.003, 'skin', 'sub');   // nostrils
  for (const s of [-1, 1]) S.ell(at([s * 0.03, 0.007, 0.09]), [0.02, 0.0125, 0.012], Fh, 0.012, 'skin', 'sub');     // eye sockets under the brow
  for (const s of [-1, 1]) { S.sphere(at([s * 0.03, 0.002, 0.0725]), 0.0145, 0.004, 'eye'); S.eyes.push({ c: at([s * 0.03, 0.002, 0.0725]), front: Fh.Z }); S.ops[S.ops.length - 1].prio = 0.002; }
  for (const s of [-1, 1]) { S.ell(at([s * 0.03, 0.0085, 0.0815]), [0.0168, 0.0042, 0.0075], Fh, 0.003); S.ell(at([s * 0.03, -0.0076, 0.0805]), [0.0152, 0.003, 0.0066], Fh, 0.003); }   // lids
  S.ell(at([0, -0.0525, 0.0955]), [0.0172, 0.0055, 0.0092], Fh, 0.005, 'lip'); S.ops[S.ops.length - 1].prio = 0.002;
  S.ell(at([0, -0.0632, 0.0925]), [0.0145, 0.0066, 0.0094], Fh, 0.005, 'lip'); S.ops[S.ops.length - 1].prio = 0.002;
  S.ell(at([0, -0.058, 0.1045]), [0.0185, 0.0017, 0.012], Fh, 0.0025, 'skin', 'sub');    // mouth line
  for (const s of [-1, 1]) S.sphere(at([s * 0.019, -0.058, 0.095]), 0.004, 0.004, 'skin', 'sub');
  S.cone(at([0, -0.04, 0.1]), at([0, -0.047, 0.103]), 0.003, 0.003, 0.004, 'skin', 'sub');   // philtrum
  for (const s of [-1, 1]) {                                                               // ears
    const Fe = frame(0, 0, 0); const c = at([s * 0.079, -0.006, -0.006]);
    S.ell(c, [0.0095, 0.029, 0.018], Fh, 0.006); S.ell(at([s * 0.0855, -0.008, -0.002]), [0.0055, 0.019, 0.011], Fh, 0.004, 'skin', 'sub');
  }
  // hair: a cap above the hairline plus comma-shaped locks
  const hairline = (lx, ly, lz) => { const front = Math.max(0, lz) / 0.1; return lerp1(-0.072, 0.046, Math.min(1, front)) - (Math.abs(lx) > 0.06 ? 0.02 : 0) - ly; };
  const toL = p => { const d = sub(p, Hc); return [dot(d, Fh.X), dot(d, Fh.Y), dot(d, Fh.Z)]; };
  const cap = sdEllipsoid(at([0, 0.03, -0.014]), [0.081, 0.102, 0.097], Fh);
  S.custom((x, y, z) => { const l = toL([x, y, z]); return Math.max(cap(x, y, z), hairline(l[0], l[1], l[2])); }, at([0, 0.03, -0.014]), 0.11, 0.008, 'hair');
  for (let i = 0; i < (o.curls ?? 210); i++) {
    const th = rr(-Math.PI, Math.PI), ph = Math.asin(rr(-0.75, 1)), lx = Math.cos(ph) * Math.sin(th) * 0.083, ly = 0.03 + Math.sin(ph) * 0.104, lz = -0.014 + Math.cos(ph) * Math.cos(th) * 0.099;
    if (hairline(lx, ly, lz) > -0.004) continue;
    const c = at([lx * 1.04, ly * 1.02, lz * 1.04]), tang = norm(cross(norm(sub(c, Hc)), Fh.Y)), Fc = frameAlong(add(tang, mul(Fh.Y, rr(-0.6, 0.6))), norm(sub(c, Hc)));
    S.ell(c, [0.0075, rr(0.015, 0.021), 0.0062], Fc, 0.004, 'hair');
  }
  if (o.wreath) {                                                                           // laurel wreath
    const Fw = frame(0, 0, 0); const R = 0.092;
    for (let i = 0; i < 46; i++) { const a = -Math.PI * 0.92 + i / 45 * Math.PI * 1.84, c = at([Math.sin(a) * 0.083 * 1.03, 0.045 + 0.012 * Math.cos(a), -0.014 + Math.cos(a) * 0.1]); const t = norm(sub(at([Math.sin(a + 0.1) * 0.083, 0.045, -0.014 + Math.cos(a + 0.1) * 0.1]), c)); for (const s of [-1, 1]) S.ell(add(c, mul(Fh.Y, s * 0.006)), [0.0045, 0.014, 0.003], frameAlong(add(t, mul(Fh.Y, s * 0.7)), norm(sub(c, Hc))), 0.002, 'wreath'); }
  }
  if (o.ribbon) S.custom(sdTorus(at([0, 0.04, -0.012]), 0.087, 0.0045, frame(0, 0, 0)), at([0, 0.04, -0.012]), 0.1, 0.003, 'ribbon');
}
const lerp1 = (a, b, t) => a + (b - a) * t;

function hand(S, W, hd, pn, side, grip, k = 0.008) {
  hd = norm(hd); pn = norm(sub(pn, mul(hd, dot(pn, hd)))); const across = mul(norm(cross(pn, hd)), side === 'r' ? -1 : 1);   // towards the thumb
  const F = { X: across, Y: hd, Z: pn, at: (o, l) => add(add(add(o, mul(across, l[0])), mul(hd, l[1])), mul(pn, l[2])) };
  S.box(F.at(W, [0, 0.048, 0]), [0.038, 0.046, 0.013], 0.011, F, 0.014);                     // palm
  S.ell(F.at(W, [0.024, 0.03, -0.006]), [0.016, 0.03, 0.014], F, 0.01);                       // thenar
  const fingers = [[0.026, 0.062, 0.0085], [0.009, 0.072, 0.0085], [-0.009, 0.068, 0.008], [-0.026, 0.054, 0.0072]];
  for (const [ox, L, r] of fingers) {
    const a = F.at(W, [ox, 0.09, 0]), c1 = Math.cos(grip * 1.3), s1 = Math.sin(grip * 1.3);
    const d1 = add(mul(hd, c1), mul(pn, -s1)), b = add(a, mul(d1, L * 0.55)), c2 = Math.cos(grip * 2.4), s2 = Math.sin(grip * 2.4), d2 = add(mul(hd, c2), mul(pn, -s2)), c = add(b, mul(d2, L * 0.5));
    S.cone(a, b, r, r * 0.92, k); S.cone(b, c, r * 0.92, r * 0.8, k * 0.8);
  }
  const t0 = F.at(W, [0.032, 0.022, -0.004]), t1 = add(t0, mul(norm(add(add(mul(across, 0.7), mul(hd, 0.8)), mul(pn, -0.3 - grip * 0.6))), 0.04)), t2 = add(t1, mul(norm(add(add(mul(across, 0.2 - grip * 0.5), mul(hd, 0.9)), mul(pn, -0.4 - grip * 0.5))), 0.032));
  S.cone(t0, t1, 0.012, 0.0105, k); S.cone(t1, t2, 0.0105, 0.009, k * 0.8);
  return F;
}
function foot(S, A, td, side, k = 0.01) {
  td = norm(td); const flat = norm([td[0], 0, td[2]]), inner = mul(norm(cross([0, 1, 0], flat)), side === 'r' ? -1 : 1);   // towards the midline
  S.sphere(add(add(A, mul(td, -0.045)), [0, -0.05, 0]), 0.034, 0.02);                        // heel
  const ball = add(add(A, mul(td, 0.15)), [0, -0.064, 0]);
  S.cone(add(A, [0, -0.04, 0]), ball, 0.04, 0.034, 0.025);
  S.ell(add(lerp3(A, ball, 0.5), mul(inner, 0.012)), [0.034, 0.024, 0.06], frameAlong(td, [0, 1, 0]), 0.02);   // arch
  const toes = [[0.022, 0.05, 0.0145], [0.004, 0.044, 0.0115], [-0.012, 0.04, 0.0105], [-0.026, 0.035, 0.0095], [-0.038, 0.028, 0.0085]];
  for (const [o, L, r] of toes) { const a = add(add(ball, mul(inner, o)), mul(td, 0.0)), b = add(add(a, mul(td, L)), [0, -0.012, 0]); S.cone(a, b, r, r * 0.85, 0.006); }
  for (const s of [-1, 1]) S.sphere(add(A, mul(inner, s * 0.028)), 0.018, 0.015);           // ankle bones
}

// pose: joints + options → Sculpture
export function figure(p) {
  const S = new Sculpture();
  const Fp = frame(p.pelvisYaw ?? 0, p.pelvisRoll ?? 0, p.pelvisPitch ?? 0), Fc = frame(p.chestYaw ?? 0, p.chestRoll ?? 0, p.chestPitch ?? 0), Fh = frame(p.headYaw ?? 0, p.headRoll ?? 0, p.headPitch ?? 0);
  const P = p.pelvis, C = p.chest, Hc = p.head, PP = l => Fp.at(P, l), CC = l => Fc.at(C, l);
  // ---- torso
  S.ell(PP([0, 0, 0]), [0.16, 0.106, 0.112], Fp, 0.04);
  S.ell(PP([0, 0.09, 0.02]), [0.126, 0.08, 0.09], Fp, 0.04);
  for (const s of [-1, 1]) S.ell(PP([s * 0.074, -0.038, -0.058]), [0.083, 0.094, 0.074], Fp, 0.035);        // gluteals
  for (const s of [-1, 1]) S.ell(PP([s * 0.112, 0.095, 0.004]), [0.05, 0.07, 0.066], Fp, 0.03);             // obliques over the iliac crest
  S.cone(PP([0, 0.11, -0.006]), CC([0, -0.11, -0.004]), 0.12, 0.138, 0.05);                                       // waist
  S.ell(CC([0, 0, 0]), [0.168, 0.172, 0.114], Fc, 0.04);                                                     // rib cage
  S.ell(CC([0, -0.02, -0.034]), [0.188, 0.15, 0.096], Fc, 0.04);                                            // lats
  for (const s of [-1, 1]) S.ell(CC([s * 0.072, 0.034, 0.08]), [0.086, 0.06, 0.046], frame((p.chestYaw ?? 0) + s * 0.25, p.chestRoll ?? 0, 0), 0.022);   // pectorals
  for (const s of [-1, 1]) S.sphere(CC([s * 0.086, 0.008, 0.111]), 0.0055, 0.004);
  for (let j = 0; j < 3; j++) for (const s of [-1, 1]) { const t = 0.28 + j * 0.2; S.ell(add(lerp3(CC([0, -0.07, 0.096]), PP([0, 0.09, 0.106]), t), mul(Fc.X, s * 0.033)), [0.036, 0.032, 0.02], Fc, 0.024); }   // abdominals
    S.sphere(PP([0, 0.1, 0.128]), 0.006, 0.006, 'skin', 'sub');                                              // navel
  for (const sx of [-1, 1]) S.cone(CC([sx * 0.028, 0.02, -0.104]), PP([sx * 0.03, 0.08, -0.094]), 0.03, 0.032, 0.03);   // erector muscles either side of the spine
  for (const s of [-1, 1]) S.ell(CC([s * 0.07, 0.06, -0.086]), [0.066, 0.072, 0.03], Fc, 0.05);          // shoulder blades
  const Sh = { l: CC([0.196, 0.122, -0.012]), r: CC([-0.196, 0.122, -0.012]) }, NB = CC([0, 0.19, -0.012]);
  for (const s of ['l', 'r']) {
    const sx = s === 'l' ? 1 : -1;
    S.cone(CC([sx * 0.024, 0.16, 0.05]), add(Sh[s], mul(Fc.Z, 0.012)), 0.0105, 0.0105, 0.03);              // clavicle
    S.cone(add(NB, mul(Fc.Z, -0.02)), add(Sh[s], [0, 0.03, -0.01]), 0.048, 0.03, 0.03);                      // trapezius
  }
  // ---- neck and head
  S.cone(NB, Fh.at(Hc, [0, -0.076, -0.016]), 0.064, 0.054, 0.04);
  for (const s of [-1, 1]) S.cone(Fh.at(Hc, [s * 0.052, -0.045, -0.026]), CC([s * 0.026, 0.168, 0.05]), 0.0105, 0.0075, 0.03);
  S.sphere(lerp3(Fh.at(Hc, [0, -0.1, 0.03]), CC([0, 0.17, 0.06]), 0.5), 0.0065, 0.02);
  head(S, Hc, Fh, p.headOpts ?? {});
  // ---- arms
  for (const s of ['l', 'r']) {
    const A = p.arms[s], Sj = Sh[s], E = A.elbow, W = A.wrist, ua = sub(E, Sj), fa = sub(W, E);
    let bend = cross(cross(ua, fa), ua); if (len(bend) < 1e-4) bend = Fc.Z; bend = norm(bend);
    S.ell(add(Sj, mul(norm(ua), 0.038)), [0.068, 0.08, 0.07], frameAlong(ua, Fc.Z), 0.03);                  // deltoid
    S.cone(Sj, E, 0.056, 0.042, 0.03);
    const Fu = frameAlong(ua, bend);
    S.ell(add(lerp3(Sj, E, 0.52), mul(bend, 0.014)), [0.043, 0.082, 0.045], Fu, 0.02);                       // biceps
    S.ell(add(lerp3(Sj, E, 0.45), mul(bend, -0.016)), [0.045, 0.092, 0.041], Fu, 0.02);                      // triceps
    S.sphere(add(E, mul(bend, -0.022)), 0.022, 0.015);
    S.cone(E, W, 0.045, 0.029, 0.025);
    S.ell(add(lerp3(E, W, 0.28), mul(bend, 0.01)), [0.044, 0.078, 0.038], frameAlong(fa, bend), 0.02);       // forearm muscles
    hand(S, W, A.hand, A.palm, s, A.grip ?? 0.4);
  }
  // ---- legs
  for (const s of ['l', 'r']) {
    const L = p.legs[s], sx = s === 'l' ? 1 : -1, H = PP([sx * 0.088, -0.042, 0.004]), K = L.knee, A = L.ankle, th = sub(K, H), sh = sub(A, K);
    const front = norm([L.toe[0], 0, L.toe[2]]), inner = [-sx, 0, 0];
    S.cone(H, K, 0.104, 0.06, 0.045);
    const Ft = frameAlong(th, front);
    S.ell(add(lerp3(H, K, 0.45), mul(front, 0.024)), [0.074, 0.18, 0.066], Ft, 0.035);                      // quadriceps
    S.ell(add(add(lerp3(H, K, 0.83), mul(inner, 0.026)), mul(front, 0.018)), [0.034, 0.05, 0.034], Ft, 0.02);   // vastus medialis
    S.ell(add(lerp3(H, K, 0.5), mul(front, -0.03)), [0.066, 0.16, 0.056], Ft, 0.03);                         // hamstrings
    S.ell(add(K, mul(front, 0.042)), [0.025, 0.031, 0.015], Ft, 0.012);                                       // kneecap
    S.cone(K, A, 0.054, 0.033, 0.03);
    const Fs = frameAlong(sh, front);
    for (const q of [-1, 1]) S.ell(add(add(lerp3(K, A, 0.27), mul(front, -0.032)), mul(inner, q * 0.016)), [0.04, 0.105, 0.046], Fs, 0.025);   // calves
    S.cone(add(K, mul(front, 0.032)), add(A, mul(front, 0.02)), 0.014, 0.012, 0.015);                         // shin ridge
    foot(S, A, L.toe, s);
  }
  // ---- drapery
  if (p.drape === 'perizoma') drapePerizoma(S, P, Fp);
  if (p.drape === 'mantle') drapeMantle(S, p, P, Fp, C, Fc);
  // ---- plinth
  if (p.plinth !== false) S.box([0, -0.035, 0.0], [0.27, 0.035, 0.27], 0.008, null, 0.012, 'plinth');
  return S;
}

function folds(f, P, amp, n, vert = 2.0) {
  return (x, y, z) => f(x, y, z) + amp * Math.sin(Math.atan2(x - P[0], z - P[2]) * n + y * vert) + amp * 0.45 * Math.sin(Math.atan2(x - P[0], z - P[2]) * n * 2.3 + y * vert * 1.7 + 1);
}
function drapePerizoma(S, P, Fp) {
  const c = Fp.at(P, [0, -0.04, 0.008]), band = sdEllipsoid(c, [0.178, 0.105, 0.134], Fp);
  const cut = (x, y, z) => { const l = sub([x, y, z], P); const ly = dot(l, Fp.Y); return Math.max(ly - 0.03, -0.155 - ly + 0.03 * Math.sin(x * 40)); };
  S.custom(folds((x, y, z) => Math.max(band(x, y, z), cut(x, y, z)), P, 0.0022, 9, 6), c, 0.2, 0.016, 'cloth');
  S.sphere(Fp.at(P, [0.03, 0.02, 0.128]), 0.02, 0.01, 'cloth'); S.cone(Fp.at(P, [0.03, 0.01, 0.13]), Fp.at(P, [0.045, -0.1, 0.135]), 0.012, 0.016, 0.01, 'cloth');   // knot and hanging end
}
function drapeMantle(S, p, P, Fp, C, Fc) {
  const parts = [];
  for (const s of ['l', 'r']) { const L = p.legs[s], sx = s === 'l' ? 1 : -1, H = Fp.at(P, [sx * 0.088, -0.02, 0.004]); parts.push(sdRoundCone(H, lerp3(L.knee, L.ankle, 0.58), 0.16, 0.115)); }
  parts.push(sdEllipsoid([P[0], 0.62, P[2] + 0.03], [0.15, 0.3, 0.12]));
  const hem = (x, y, z) => 0.3 + 0.035 * Math.sin(x * 16 + z * 6) + 0.05 * (x - P[0]) - y;
  const skirt = (x, y, z) => { let d = 1e9; for (const f of parts) d = smin(d, f(x, y, z), 0.06); return Math.max(d, hem(x, y, z), y - (P[1] + 0.06)); };
  S.custom(folds(skirt, P, 0.008, 12, 2.2), [P[0], 0.62, P[2]], 0.5, 0.02, 'cloth');
  S.custom(folds(sdTorus(Fp.at(P, [0, 0.06, 0.012]), 0.158, 0.042, Fp), P, 0.007, 17, 6), Fp.at(P, [0, 0.06, 0.012]), 0.21, 0.015, 'cloth');   // rolled waistband
  const sw = [Fp.at(P, [0.12, 0.05, 0.11]), Fc.at(C, [0.15, -0.1, 0.1]), Fc.at(C, [0.185, 0.15, 0.03]), Fc.at(C, [0.12, 0.05, -0.12]), Fp.at(P, [0.02, 0.08, -0.15])];
  const swf = []; for (let i = 0; i < sw.length - 1; i++) swf.push(sdRoundCone(sw[i], sw[i + 1], 0.05, 0.05));
  S.custom(folds((x, y, z) => { let d = 1e9; for (const f of swf) d = smin(d, f(x, y, z), 0.04); return d; }, C, 0.006, 9, 9), Fc.at(C, [0.12, 0, 0]), 0.42, 0.018, 'cloth');
  const A = p.arms.l, hang = lerp3(A.elbow, A.wrist, 0.45);
  S.custom(folds(sdEllipsoid(add(hang, [0.01, -0.24, 0]), [0.055, 0.25, 0.1]), hang, 0.008, 7, 3), add(hang, [0, -0.2, 0]), 0.3, 0.025, 'cloth');
}

// ------------------------------------------------------------------ poses
const T = (x, y, z) => [x, y, z];
export const POSES = {
  // spear-bearer: weight on the right leg, left leg trailing, head turned to the right, left hand holds the spear
  doryphoros: {
    pelvis: T(0, 0.975, 0), pelvisRoll: -0.06, pelvisYaw: 0.05, chest: T(-0.004, 1.335, -0.006), chestRoll: 0.07, chestYaw: -0.07,
    head: T(-0.016, 1.702, 0.024), headYaw: -0.38, headPitch: 0.12, headRoll: 0.04, headOpts: {},
    legs: { r: { knee: T(-0.082, 0.515, 0.016), ankle: T(-0.078, 0.086, -0.004), toe: T(-0.16, 0, 1) }, l: { knee: T(0.106, 0.522, 0.05), ankle: T(0.138, 0.13, -0.17), toe: T(0.1, -0.3, 1) } },
    arms: { r: { elbow: T(-0.238, 1.135, -0.012), wrist: T(-0.248, 0.885, 0.038), hand: T(-0.05, -1, 0.1), palm: T(1, 0, 0), grip: 0.35 }, l: { elbow: T(0.262, 1.142, -0.032), wrist: T(0.243, 1.07, 0.21), hand: T(-0.35, -0.15, 0.92), palm: T(-0.9, 0.2, -0.3), grip: 0.95 } },
    drape: 'perizoma',
  },
  // fillet-binder: both arms raised to tie the victor's ribbon round the head
  diadumenos: {
    pelvis: T(0, 0.975, 0), pelvisRoll: -0.055, pelvisYaw: 0.04, chest: T(-0.004, 1.335, -0.004), chestRoll: 0.06, chestYaw: -0.05, chestPitch: -0.04,
    head: T(-0.012, 1.702, 0.03), headYaw: -0.28, headPitch: 0.17, headRoll: -0.05, headOpts: { ribbon: true },
    legs: { r: { knee: T(-0.08, 0.515, 0.016), ankle: T(-0.076, 0.086, -0.004), toe: T(-0.16, 0, 1) }, l: { knee: T(0.108, 0.52, 0.06), ankle: T(0.14, 0.13, -0.15), toe: T(0.12, -0.3, 1) } },
    arms: { r: { elbow: T(-0.36, 1.5, 0.03), wrist: T(-0.15, 1.725, 0.1), hand: T(0.7, 0.55, 0.2), palm: T(0.2, -0.4, -0.85), grip: 0.6 }, l: { elbow: T(0.36, 1.52, 0.01), wrist: T(0.135, 1.745, 0.09), hand: T(-0.7, 0.55, 0.2), palm: T(-0.2, -0.4, -0.85), grip: 0.6 } },
    drape: 'perizoma',
  },
  // emperor as Jupiter: weight on the left leg, sceptre raised in the right hand, globe in the left, mantle round the hips
  emperor: {
    pelvis: T(0, 0.985, 0), pelvisRoll: 0.06, pelvisYaw: -0.04, chest: T(0.004, 1.34, -0.004), chestRoll: -0.06, chestYaw: 0.06,
    head: T(0.012, 1.705, 0.026), headYaw: 0.22, headPitch: 0.04, headRoll: 0.02, headOpts: { wreath: true },
    legs: { l: { knee: T(0.08, 0.515, 0.012), ankle: T(0.075, 0.086, -0.005), toe: T(0.15, 0, 1) }, r: { knee: T(-0.12, 0.522, 0.085), ankle: T(-0.16, 0.096, 0.05), toe: T(-0.25, -0.05, 1) } },
    arms: { r: { elbow: T(-0.31, 1.6, 0.05), wrist: T(-0.3, 1.86, 0.08), hand: T(0.3, 0, 1), palm: T(1, 0, 0), grip: 1 }, l: { elbow: T(0.25, 1.13, 0.05), wrist: T(0.27, 1.02, 0.26), hand: T(0, 0, 1), palm: T(0, 1, 0), grip: 0.3 } },
    drape: 'mantle',
  },
};
