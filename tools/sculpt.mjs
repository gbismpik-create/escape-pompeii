// Sculpted statues from signed-distance anatomy.
// A figure is a list of smoothly blended primitives (bones, muscles, face, hair, drapery). It is meshed with marching cubes
// on a narrow band at millimetre resolution, decimated with meshoptimizer, then shaded: normals from the SDF gradient,
// ambient occlusion in the creases, and colours by region (ancient paint on marble, inlaid eyes and patina on bronze).
import * as THREE from 'three';
import { edgeTable, triTable } from 'three/addons/objects/MarchingCubes.js';
import { MeshoptSimplifier } from 'meshoptimizer';

// ------------------------------------------------------------------ small vector kit (plain arrays)
export const v = (x, y, z) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = a => Math.hypot(a[0], a[1], a[2]);
export const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// orthonormal frame from yaw (y), roll (z), pitch (x); returns local→world mapper and the axes
export function frame(yaw = 0, roll = 0, pitch = 0) {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch, yaw, roll, 'YZX')).elements;
  const X = [m[0], m[1], m[2]], Y = [m[4], m[5], m[6]], Z = [m[8], m[9], m[10]];
  return { X, Y, Z, at: (o, l) => [o[0] + X[0] * l[0] + Y[0] * l[1] + Z[0] * l[2], o[1] + X[1] * l[0] + Y[1] * l[1] + Z[1] * l[2], o[2] + X[2] * l[0] + Y[2] * l[1] + Z[2] * l[2]] };
}
// frame whose Y axis is along d (for limbs, ellipsoids along a segment)
export function frameAlong(d, hint = [0, 0, 1]) {
  const Y = norm(d); let X = cross(Y, hint); if (len(X) < 1e-4) X = cross(Y, [1, 0, 0]); X = norm(X); const Z = cross(X, Y);
  return { X, Y, Z, at: (o, l) => [o[0] + X[0] * l[0] + Y[0] * l[1] + Z[0] * l[2], o[1] + X[1] * l[0] + Y[1] * l[1] + Z[1] * l[2], o[2] + X[2] * l[0] + Y[2] * l[1] + Z[2] * l[2]] };
}

// ------------------------------------------------------------------ distance primitives
export function sdSphere(c, r) { return (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r; }
export function sdRoundCone(a, b, r1, r2) {
  const ba = sub(b, a), l2 = dot(ba, ba), rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  return (x, y, z) => {
    const pa0 = x - a[0], pa1 = y - a[1], pa2 = z - a[2], yy = pa0 * ba[0] + pa1 * ba[1] + pa2 * ba[2], zz = yy - l2;
    const x0 = pa0 * l2 - ba[0] * yy, x1 = pa1 * l2 - ba[1] * yy, x2v = pa2 * l2 - ba[2] * yy, x2 = x0 * x0 + x1 * x1 + x2v * x2v;
    const y2 = yy * yy * l2, z2 = zz * zz * l2, k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  };
}
export function sdEllipsoid(c, r, F = null) {
  const X = F ? F.X : [1, 0, 0], Y = F ? F.Y : [0, 1, 0], Z = F ? F.Z : [0, 0, 1];
  return (x, y, z) => {
    const px = x - c[0], py = y - c[1], pz = z - c[2];
    const lx = (px * X[0] + py * X[1] + pz * X[2]) / r[0], ly = (px * Y[0] + py * Y[1] + pz * Y[2]) / r[1], lz = (px * Z[0] + py * Z[1] + pz * Z[2]) / r[2];
    const k0 = Math.sqrt(lx * lx + ly * ly + lz * lz), k1 = Math.sqrt((lx / r[0]) ** 2 + (ly / r[1]) ** 2 + (lz / r[2]) ** 2);
    return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(r[0], r[1], r[2]);
  };
}
export function sdRoundBox(c, h, rad, F = null) {
  const X = F ? F.X : [1, 0, 0], Y = F ? F.Y : [0, 1, 0], Z = F ? F.Z : [0, 0, 1];
  return (x, y, z) => {
    const px = x - c[0], py = y - c[1], pz = z - c[2];
    const qx = Math.abs(px * X[0] + py * X[1] + pz * X[2]) - h[0] + rad, qy = Math.abs(px * Y[0] + py * Y[1] + pz * Y[2]) - h[1] + rad, qz = Math.abs(px * Z[0] + py * Z[1] + pz * Z[2]) - h[2] + rad;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - rad;
  };
}
export function sdTorus(c, R, r, F) {
  return (x, y, z) => {
    const px = x - c[0], py = y - c[1], pz = z - c[2];
    const lx = px * F.X[0] + py * F.X[1] + pz * F.X[2], ly = px * F.Y[0] + py * F.Y[1] + pz * F.Y[2], lz = px * F.Z[0] + py * F.Z[1] + pz * F.Z[2];
    return Math.hypot(Math.hypot(lx, lz) - R, ly) - r;
  };
}
export const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
export const smax = (a, b, k) => -smin(-a, -b, k);

// ------------------------------------------------------------------ the op list
export class Sculpture {
  constructor() { this.ops = []; this.eyes = []; }
  // op: 'add' (smooth union), 'sub' (smooth carve); bound sphere for culling; tag for colouring
  push(op, f, bc, br, k = 0.01, tag = 'skin', extra = {}) { this.ops.push({ op, f, bx: bc[0], by: bc[1], bz: bc[2], br, k, tag, ...extra }); return this; }
  sphere(c, r, k, tag, op = 'add') { return this.push(op, sdSphere(c, r), c, r, k, tag); }
  cone(a, b, r1, r2, k, tag, op = 'add') { return this.push(op, sdRoundCone(a, b, r1, r2), lerp3(a, b, 0.5), len(sub(b, a)) / 2 + Math.max(r1, r2), k, tag); }
  ell(c, r, F, k, tag, op = 'add') { return this.push(op, sdEllipsoid(c, r, F), c, Math.max(r[0], r[1], r[2]), k, tag); }
  box(c, h, rad, F, k, tag, op = 'add') { return this.push(op, sdRoundBox(c, h, rad, F), c, Math.hypot(h[0], h[1], h[2]), k, tag); }
  custom(f, bc, br, k, tag, op = 'add') { return this.push(op, f, bc, br, k, tag); }
  eval(x, y, z) {
    let d = 1e9;
    for (const o of this.ops) {
      const lb = Math.hypot(x - o.bx, y - o.by, z - o.bz) - o.br;
      if (o.op === 'add') { if (lb > d + o.k) continue; d = smin(d, o.f(x, y, z), o.k); }
      else { if (lb > o.k) continue; d = smax(d, -o.f(x, y, z), o.k); }
    }
    return d;
  }
  // which region a surface point belongs to: the additive op whose own surface is nearest
  tagAt(x, y, z) {
    let best = 1e9, tag = 'skin', op = null;
    for (const o of this.ops) { if (o.op !== 'add') continue; const lb = Math.hypot(x - o.bx, y - o.by, z - o.bz) - o.br; if (lb > best + 0.02) continue; const s = Math.abs(o.f(x, y, z)) - (o.prio ?? 0); if (s < best) { best = s; tag = o.tag; op = o; } }
    return { tag, op };
  }
  bounds(pad = 0.03) {
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const o of this.ops) if (o.op === 'add') { lo[0] = Math.min(lo[0], o.bx - o.br); lo[1] = Math.min(lo[1], o.by - o.br); lo[2] = Math.min(lo[2], o.bz - o.br); hi[0] = Math.max(hi[0], o.bx + o.br); hi[1] = Math.max(hi[1], o.by + o.br); hi[2] = Math.max(hi[2], o.bz + o.br); }
    return { lo: lo.map(a => a - pad), hi: hi.map(a => a + pad) };
  }
}

// ------------------------------------------------------------------ meshing: narrow-band marching cubes → decimate → normals, AO, colours
export async function mesh(S, { h = 0.004, target = 80000, clip = null, palette, log = console.log } = {}) {
  const f = clip ? (x, y, z) => Math.max(S.eval(x, y, z), clip(x, y, z)) : (x, y, z) => S.eval(x, y, z);
  const { lo, hi } = arguments[1]?.bounds ?? S.bounds();
  const T0 = Date.now();
  // coarse pass
  const C = h * 6, cn = [0, 1, 2].map(i => Math.ceil((hi[i] - lo[i]) / C) + 1);
  const coarse = new Float32Array(cn[0] * cn[1] * cn[2]);
  for (let k = 0; k < cn[2]; k++) for (let j = 0; j < cn[1]; j++) for (let i = 0; i < cn[0]; i++) coarse[(k * cn[1] + j) * cn[0] + i] = f(lo[0] + i * C, lo[1] + j * C, lo[2] + k * C);
  const cAt = (x, y, z) => {
    const fx = Math.min(cn[0] - 1.001, Math.max(0, (x - lo[0]) / C)), fy = Math.min(cn[1] - 1.001, Math.max(0, (y - lo[1]) / C)), fz = Math.min(cn[2] - 1.001, Math.max(0, (z - lo[2]) / C));
    const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz), tx = fx - i, ty = fy - j, tz = fz - k, I = (a, b, c) => coarse[((k + c) * cn[1] + (j + b)) * cn[0] + (i + a)];
    return (I(0, 0, 0) * (1 - tx) + I(1, 0, 0) * tx) * (1 - ty) * (1 - tz) + (I(0, 1, 0) * (1 - tx) + I(1, 1, 0) * tx) * ty * (1 - tz) + (I(0, 0, 1) * (1 - tx) + I(1, 0, 1) * tx) * (1 - ty) * tz + (I(0, 1, 1) * (1 - tx) + I(1, 1, 1) * tx) * ty * tz;
  };
  // fine pass (exact only near the surface)
  const n = [0, 1, 2].map(i => Math.ceil((hi[i] - lo[i]) / h) + 1), nx = n[0], ny = n[1], nz = n[2];
  const F = new Float32Array(nx * ny * nz); let exact = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = lo[0] + i * h, y = lo[1] + j * h, z = lo[2] + k * h, c = cAt(x, y, z);
    F[(k * ny + j) * nx + i] = Math.abs(c) > C * 1.6 ? c : (exact++, f(x, y, z));
  }
  // marching cubes with shared edge vertices
  const pos = [], idx = [], vmap = new Map();
  const cornerOff = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const edgeCorners = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const val = new Float32Array(8), ev = new Int32Array(12);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let ci = 0;
    for (let c = 0; c < 8; c++) { const o = cornerOff[c]; const vv = F[((k + o[2]) * ny + (j + o[1])) * nx + (i + o[0])]; val[c] = vv; if (vv < 0) ci |= 1 << c; }
    const bits = edgeTable[ci]; if (!bits) continue;
    for (let e = 0; e < 12; e++) {
      if (!(bits & (1 << e))) continue;
      const [a, b] = edgeCorners[e], oa = cornerOff[a], ob = cornerOff[b];
      const ga = ((k + oa[2]) * ny + (j + oa[1])) * nx + (i + oa[0]), gb = ((k + ob[2]) * ny + (j + ob[1])) * nx + (i + ob[0]);
      const key = Math.min(ga, gb) * 4 + (oa[0] !== ob[0] ? 0 : oa[1] !== ob[1] ? 1 : 2);
      let id = vmap.get(key);
      if (id === undefined) {
        const t = val[a] / (val[a] - val[b]);
        pos.push(lo[0] + (i + oa[0] + (ob[0] - oa[0]) * t) * h, lo[1] + (j + oa[1] + (ob[1] - oa[1]) * t) * h, lo[2] + (k + oa[2] + (ob[2] - oa[2]) * t) * h);
        id = pos.length / 3 - 1; vmap.set(key, id);
      }
      ev[e] = id;
    }
    const base = ci * 16;
    for (let t = 0; triTable[base + t] !== -1; t += 3) idx.push(ev[triTable[base + t]], ev[triTable[base + t + 2]], ev[triTable[base + t + 1]]);
  }
  log(`    marching cubes: ${nx}×${ny}×${nz}, ${exact} exact samples, ${idx.length / 3} tris, ${((Date.now() - T0) / 1000).toFixed(1)}s`);
  // decimate
  await MeshoptSimplifier.ready;
  const P = new Float32Array(pos), I0 = new Uint32Array(idx);
  const [I1] = MeshoptSimplifier.simplify(I0, P, 3, Math.min(I0.length, target * 3), 0.0004, []);
  const remap = new Int32Array(P.length / 3).fill(-1), P2 = [], I2 = new Uint32Array(I1.length);
  for (let t = 0; t < I1.length; t++) { const o = I1[t]; if (remap[o] < 0) { remap[o] = P2.length / 3; P2.push(P[o * 3], P[o * 3 + 1], P[o * 3 + 2]); } I2[t] = remap[o]; }
  // make the winding agree with the outward SDF gradient
  { let agree = 0, tot = 0; for (let t = 0; t < I2.length && tot < 400; t += 3 * 97) { const a = I2[t], b = I2[t + 1], c = I2[t + 2];
      const A = [P2[a * 3], P2[a * 3 + 1], P2[a * 3 + 2]], B = [P2[b * 3], P2[b * 3 + 1], P2[b * 3 + 2]], Cc = [P2[c * 3], P2[c * 3 + 1], P2[c * 3 + 2]], fn = cross(sub(B, A), sub(Cc, A)), m = mul(add(add(A, B), Cc), 1 / 3);
      const gx = f(m[0] + 1e-3, m[1], m[2]) - f(m[0] - 1e-3, m[1], m[2]), gy = f(m[0], m[1] + 1e-3, m[2]) - f(m[0], m[1] - 1e-3, m[2]), gz = f(m[0], m[1], m[2] + 1e-3) - f(m[0], m[1], m[2] - 1e-3);
      if (fn[0] * gx + fn[1] * gy + fn[2] * gz > 0) agree++; tot++; }
    if (agree < tot / 2) for (let t = 0; t < I2.length; t += 3) { const tmp = I2[t + 1]; I2[t + 1] = I2[t + 2]; I2[t + 2] = tmp; } }
  // normals from the SDF gradient, ambient occlusion along the normal, colour by region
  const nv = P2.length / 3, N = new Float32Array(nv * 3), COLR = new Float32Array(nv * 3), e = 0.0012;
  for (let q = 0; q < nv; q++) {
    const x = P2[q * 3], y = P2[q * 3 + 1], z = P2[q * 3 + 2];
    let gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
    N[q * 3] = gx; N[q * 3 + 1] = gy; N[q * 3 + 2] = gz;
    let occ = 0, wsum = 0;
    for (const [d, w] of [[0.006, 1], [0.015, 0.8], [0.03, 0.6], [0.06, 0.4], [0.1, 0.25]]) { occ += w * Math.max(0, d - f(x + gx * d, y + gy * d, z + gz * d)) / d; wsum += w; }
    const ao = Math.max(0, Math.min(1, 1 - 0.75 * occ / wsum));
    const { tag, op } = S.tagAt(x, y, z), col = palette(tag, [x, y, z], [gx, gy, gz], ao, op);
    COLR[q * 3] = col[0]; COLR[q * 3 + 1] = col[1]; COLR[q * 3 + 2] = col[2];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P2), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.BufferAttribute(COLR, 3));
  g.setIndex(new THREE.BufferAttribute(I2, 1));
  log(`    → ${I2.length / 3} tris after decimation, total ${((Date.now() - T0) / 1000).toFixed(1)}s`);
  return g;
}
