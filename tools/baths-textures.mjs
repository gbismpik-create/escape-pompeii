// Textures for the Stabian Baths, Pompeii: white changing-room walls with clothes niches, the stucco ceiling of
// octagons, hexagons and squares with cupids and rosettes, the fluted vault of the hot room, the starry dome of the
// round cold room, the brightly painted stucco façade behind the swimming pool, basalt street paving and the
// building inscription of C. Uulius and P. Aninius.
import { createCanvas } from '@napi-rs/canvas';
import { rr, pick, hex, rgb, shade, clamp, lerp, n2, fbm2, h2, line, dab, rect, frame, weather, marble, bevel, paintedColumn, figure, garland, candelabrum, bird } from './villa-textures.mjs';

// draw something white-on-transparent and turn it into raised stucco: soft cast shadow + shaded white body
function relief(g, x, y, w, h, draw, tone = [242, 236, 222]) {
  const c = createCanvas(w, h), cg = c.getContext('2d'); draw(cg);
  const src = cg.getImageData(0, 0, w, h), d = src.data;
  const sh = createCanvas(w, h), sg = sh.getContext('2d'), si = sg.createImageData(w, h);
  for (let i = 0; i < d.length; i += 4) { si.data[i + 3] = d[i + 3] * 0.7; }
  sg.putImageData(si, 0, 0);
  g.save(); g.filter = 'blur(5px)'; g.drawImage(sh, x + 6, y + 7); g.filter = 'none'; g.restore();
  for (let i = 0; i < d.length; i += 4) { const lum = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255, k = 0.78 + 0.3 * lum; d[i] = tone[0] * k; d[i + 1] = tone[1] * k; d[i + 2] = tone[2] * k; }
  cg.putImageData(src, 0, 0); g.drawImage(c, x, y);
}
const rosette = (g, x, y, r, c1 = '#efe6d2', c2 = '#c9a24a') => { for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; dab(g, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.42, c1, 1, a, 0.5); } dab(g, x, y, r * 0.3, c2, 1, 0, 1); };

// ------------------------------------------------------------------ APODYTERIUM WALL (4096 × 2048 = 9 m × 4.5 m)
export function apodyteriumWall() {
  const W = 4096, H = 2048, c = createCanvas(W, H), g = c.getContext('2d'), py = h => H * (1 - h / 4.5);
  rect(g, 0, 0, W, H, '#ece5d4');
  rect(g, 0, py(0.9), W, H - py(0.9), '#8f2318'); line(g, 0, py(0.9), W, py(0.9), '#e3c27a', 6);   // red base
  for (let i = 0; i < 12; i++) frame(g, i * W / 12 + 30, py(0.85), W / 12 - 60, py(0.1) - py(0.85), '#d9b57a', 3);
  // clothes niches (recesses in the wall) above the benches
  for (let x = 120; x < W - 150; x += 341) {
    const x0 = x, y0 = py(2.35), w = 205, h = py(1.7) - py(2.35);
    rect(g, x0 - 12, y0 - 12, w + 24, h + 24, '#d8cfbc');
    const gr = g.createLinearGradient(x0, y0, x0 + w * 0.6, y0 + h * 0.6); gr.addColorStop(0, '#5a4c3e'); gr.addColorStop(1, '#8a7a64'); g.fillStyle = gr; g.fillRect(x0, y0, w, h);
    g.fillStyle = 'rgba(40,30,20,0.6)'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + w, y0); g.lineTo(x0 + w - 26, y0 + 26); g.lineTo(x0 + 26, y0 + 26); g.closePath(); g.fill();
    g.fillStyle = 'rgba(40,30,20,0.4)'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + 26, y0 + 26); g.lineTo(x0 + 26, y0 + h - 4); g.lineTo(x0, y0 + h); g.closePath(); g.fill();
    rect(g, x0, y0 + h - 8, w, 8, '#c8bca4');
  }
  // painted upper zone: thin red frames, small floating figures and swans, garlands
  for (let i = 0; i < 4; i++) {
    const x0 = i * W / 4 + 60, x1 = (i + 1) * W / 4 - 60, y0 = py(4.0), y1 = py(2.6);
    frame(g, x0, y0, x1 - x0, y1 - y0, '#9b2318', 5); frame(g, x0 + 14, y0 + 14, x1 - x0 - 28, y1 - y0 - 28, '#c9a24a', 2);
    if (i % 2) figure(g, (x0 + x1) / 2, y1 - 120, 1.15, pick(['#3f6e8f', '#c9952f']), 'float'); else { bird(g, (x0 + x1) / 2 - 120, (y0 + y1) / 2 + 60, 6, '#4f7a9a'); bird(g, (x0 + x1) / 2 + 140, (y0 + y1) / 2 + 20, 5, '#8a5a3a', true); }
    candelabrum(g, i * W / 4, y0 - 20, y1 + 30, '#9b2318', 3);
  }
  for (let i = 0; i < 8; i++) garland(g, i * W / 8, (i + 1) * W / 8, py(4.25), 40);
  rect(g, 0, 0, W, py(4.38), '#e2d8c2'); line(g, 0, py(4.38), W, py(4.38), '#9b2318', 5);
  weather(g, W, H, { fade: 0.06, cracks: 5, lossAmt: 0.6 });
  return c;
}

// ------------------------------------------------------------------ STUCCO COFFERS (2048², 2.4 m tile): octagons, squares, hexagons
export function stuccoCoffers() {
  const S = 2048, c = createCanvas(S, S), g = c.getContext('2d');
  rect(g, 0, 0, S, S, '#ebe4d2');
  const cell = S / 2, cut = cell * 0.29;
  const octo = (cx, cy, r, inset = 0) => { const R = r - inset, k = cut * (R / r) * 0.95; return [cx - R + k, cy - R, cx + R - k, cy - R, cx + R, cy - R + k, cx + R, cy + R - k, cx + R - k, cy + R, cx - R + k, cy + R, cx - R, cy + R - k, cx - R, cy - R + k]; };
  const fillPoly = (p, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); g.fill(); };
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const cx = (i + 0.5) * cell, cy = (j + 0.5) * cell, r = cell * 0.46, ground = (i + j) % 2 ? '#3f6e8f' : '#9b2318';
    // stepped stucco frame: light outer ring, shadowed inner step, coloured field
    fillPoly(octo(cx, cy, r), '#f6f0e2'); fillPoly(octo(cx + 5, cy + 6, r, 22), '#b8ad96'); fillPoly(octo(cx, cy, r, 26), '#efe7d4'); fillPoly(octo(cx + 4, cy + 5, r, 46), '#a89c84'); fillPoly(octo(cx, cy, r, 50), ground);
    // egg-and-dart moulding inside the frame
    const ring = octo(cx, cy, r, 38);
    for (let k = 0; k < 8; k++) { const ax = ring[k * 2], ay = ring[k * 2 + 1], bx = ring[(k * 2 + 2) % 16], by = ring[(k * 2 + 3) % 16]; for (let t = 0.04; t < 1; t += 0.08) dab(g, lerp(ax, bx, t), lerp(ay, by, t), 5, '#fbf6ea', 1, Math.atan2(by - ay, bx - ax), 0.6); }
    // centre motif in white relief: cupid, rosette, trophy of arms, Bacchic thyrsus
    const motif = (j * 2 + i) % 4, w = 520, h = 520;
    relief(g, cx - w / 2, cy - h / 2, w, h, cg => {
      cg.fillStyle = '#fff';
      if (motif === 0) figure(cg, w / 2, h / 2 + 120, 2.6, '#ffffff', 'cupid');
      else if (motif === 1) { for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; dab(cg, w / 2 + Math.cos(a) * 110, h / 2 + Math.sin(a) * 110, 70, '#ffffff', 1, a, 0.42); } dab(cg, w / 2, h / 2, 60, '#e0e0e0', 1, 0, 1); for (let k = 0; k < 12; k++) dab(cg, w / 2 + Math.cos(k) * 30, h / 2 + Math.sin(k) * 30, 14, '#ffffff', 1); }
      else if (motif === 2) { cg.fillRect(w / 2 - 10, 120, 20, 300); cg.beginPath(); cg.ellipse(w / 2, 200, 70, 80, 0, 0, 6.28); cg.fill(); cg.fillRect(w / 2 - 110, 260, 220, 120); for (const s of [-1, 1]) { cg.save(); cg.translate(w / 2 + s * 150, 330); cg.rotate(s * 0.5); cg.fillRect(-60, -90, 120, 180); cg.restore(); cg.fillRect(w / 2 + s * 40 - 6, 380, 12, 120); } }
      else { cg.fillRect(w / 2 - 8, 80, 16, 380); for (let k = 0; k < 20; k++) dab(cg, w / 2 + rr(-40, 40), 100 + rr(-30, 40), 18, '#ffffff', 1); for (let k = 0; k < 14; k++) { const a = rr(0, 6.28); dab(cg, w / 2 + Math.cos(a) * rr(60, 160), 300 + Math.sin(a) * rr(30, 100), 34, '#ffffff', 1, a, 0.4); } }
    });
  }
  // small squares between the octagons (diamonds) with gilded rosettes
  for (const [cx, cy] of [[0, 0], [cell, 0], [0, cell], [cell, cell], [S, 0], [0, S], [S, S], [cell, S], [S, cell]]) {
    const r = cut * 1.0; g.save(); g.translate(cx, cy); g.rotate(Math.PI / 4); rect(g, -r / 1.5, -r / 1.5, r * 1.33, r * 1.33, '#f6f0e2'); rect(g, -r / 1.5 + 18, -r / 1.5 + 18, r * 1.33 - 36, r * 1.33 - 36, '#c9952f'); g.restore();
    rosette(g, cx, cy, 70, '#f6ecd0', '#9b2318');
  }
  weather(g, S, S, { fade: 0.05, cracks: 3, lossAmt: 0.3 });
  return c;
}

// ------------------------------------------------------------------ FLUTED VAULT of the caldarium (1024², 1.6 m tile)
export function flutedVault() {
  const S = 1024, c = createCanvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const f = (x % 64) / 64, k = 0.72 + 0.35 * Math.sin(f * Math.PI) ** 0.6 + (h2(x, y) - 0.5) * 0.06 + (fbm2(x / 90, y / 90) - 0.5) * 0.1;
    const band = (y % 512) < 26 ? [150, 40, 30] : (y % 512) < 34 ? [230, 200, 130] : [236, 230, 216];
    const i = (y * S + x) * 4; d[i] = band[0] * k; d[i + 1] = band[1] * k; d[i + 2] = band[2] * k; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ------------------------------------------------------------------ STARRY DOME of the frigidarium (2048 × 1024, u round, v up)
export function starDome() {
  const W = 2048, H = 1024, c = createCanvas(W, H), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, H, 0, 0); gr.addColorStop(0, '#1d3a6a'); gr.addColorStop(0.7, '#2c5490'); gr.addColorStop(1, '#5a86b8'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 520; i++) {
    const x = rr(0, W), y = rr(H * 0.08, H * 0.9), r = rr(5, 13);
    g.fillStyle = pick(['#e8c86a', '#f0d890', '#d9b050']); g.beginPath();
    for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, rad = k % 2 ? r * 0.42 : r; g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad * 1.6); } g.fill();   // v is squeezed near the top, so stars are drawn tall
  }
  rect(g, 0, H * 0.94, W, H * 0.06, '#efe6d0'); for (let x = 0; x < W; x += 32) rect(g, x, H * 0.95, 18, H * 0.03, '#c9b78e');   // dentil cornice at the springing
  rect(g, 0, H * 0.925, W, H * 0.015, '#9b2318');
  weather(g, W, H, { fade: 0.04, cracks: 2, lossAmt: 0.2 });
  return c;
}

// ------------------------------------------------------------------ POLYCHROME STUCCO FAÇADE behind the swimming pool (4096 × 2048 = 12 m × 6 m)
export function stuccoFacade() {
  const W = 4096, H = 2048, c = createCanvas(W, H), g = c.getContext('2d');
  rect(g, 0, 0, W, H, '#e8dcc0');
  const bw = W / 4, dado = H * 0.8;
  marble(g, 0, dado, W, H - dado, '#c9a24a', '#6a4a20', { scale: 1 / 90 }); for (let i = 0; i < 8; i++) frame(g, i * W / 8 + 20, dado + 20, W / 8 - 40, H - dado - 40, '#9b2318', 4);
  rect(g, 0, dado - 30, W, 30, '#f2ead8'); bevel(g, 0, dado - 30, W, 30, 6);
  const grounds = ['#9b2318', '#2f5f8f', '#9b2318', '#c9952f'], who = ['float', 'stand', 'float', 'stand'], drape = ['#ffffff', '#ffffff', '#ffffff', '#ffffff'];
  for (let i = 0; i < 4; i++) {
    const x0 = i * bw, cx = x0 + bw / 2, top = H * 0.18;
    // aedicula: two stucco columns, entablature and a pediment framing a coloured niche
    rect(g, cx - 330, top + 140, 660, dado - top - 170, grounds[i]);
    const ng = g.createLinearGradient(cx - 330, 0, cx + 330, 0); ng.addColorStop(0, 'rgba(0,0,0,0.25)'); ng.addColorStop(0.3, 'rgba(0,0,0,0)'); ng.addColorStop(1, 'rgba(0,0,0,0.15)'); g.fillStyle = ng; g.fillRect(cx - 330, top + 140, 660, dado - top - 170);
    relief(g, cx - 300, top + 160, 600, dado - top - 200, cg => { if (who[i] === 'float') figure(cg, 300, dado - top - 360, 3.2, drape[i], 'float'); else { figure(cg, 300, dado - top - 330, 3.4, drape[i], 'stand'); } });
    for (const s of [-1, 1]) paintedColumn(g, cx + s * 380, top + 130, dado - 30, 34, '#f2ead8', { capCol: '#f6efe0', ionic: true });
    rect(g, cx - 450, top + 60, 900, 70, '#f2ead8'); bevel(g, cx - 450, top + 60, 900, 70, 10); for (let x = cx - 440; x < cx + 440; x += 30) rect(g, x, top + 110, 16, 16, '#d8ccb0');
    g.fillStyle = '#f2ead8'; g.beginPath(); g.moveTo(cx - 470, top + 60); g.lineTo(cx, top - 120); g.lineTo(cx + 470, top + 60); g.closePath(); g.fill();
    g.fillStyle = grounds[(i + 1) % 4]; g.beginPath(); g.moveTo(cx - 380, top + 44); g.lineTo(cx, top - 80); g.lineTo(cx + 380, top + 44); g.closePath(); g.fill();
    relief(g, cx - 80, top - 60, 160, 100, cg => { for (let k = 0; k < 8; k++) dab(cg, 80 + Math.cos(k * 0.785) * 30, 55 + Math.sin(k * 0.785) * 30, 18, '#fff', 1, k, 0.5); });
    // between the aediculae: candelabra and painted marble panels, small cupids in relief above
    candelabrum(g, x0, top + 40, dado - 40, '#c9952f', 5);
    relief(g, x0 - 90, H * 0.05, 180, 160, cg => figure(cg, 90, 120, 1.2, '#fff', 'cupid'));
  }
  rect(g, 0, 0, W, H * 0.04, '#f2ead8'); for (let x = 0; x < W; x += 40) rect(g, x, H * 0.03, 22, H * 0.025, '#d8ccb0');
  weather(g, W, H, { fade: 0.06, cracks: 5, lossAmt: 0.8 });
  return c;
}

// ------------------------------------------------------------------ BASALT PAVING (2048², 4 m tile): polygonal lava blocks of Pompeii's streets
export function basaltPaving() {
  const S = 2048, c = createCanvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  const n = 9, cell = S / n, pts = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pts.push([(i + rr(0.15, 0.85)) * cell, (j + rr(0.15, 0.85)) * cell, rr(0.82, 1.12)]);
  const P = (i, j) => pts[((j + n) % n) * n + ((i + n) % n)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const ci = Math.floor(x / cell), cj = Math.floor(y / cell); let d1 = 1e9, d2 = 1e9, best = null;
    for (let jj = -1; jj <= 1; jj++) for (let ii = -1; ii <= 1; ii++) {
      const p = P(ci + ii, cj + jj), px = p[0] + (ci + ii < 0 ? -S : ci + ii >= n ? S : 0), py = p[1] + (cj + jj < 0 ? -S : cj + jj >= n ? S : 0);
      const dd = Math.hypot(x - px, y - py); if (dd < d1) { d2 = d1; d1 = dd; best = p; } else if (dd < d2) d2 = dd;
    }
    const e = d2 - d1, i = (y * S + x) * 4, gr = (h2(x, y) - 0.5) * 18;
    const pol = 0.9 + 0.2 * fbm2(x / 60, y / 60), k = e < 5 ? 0.45 : best[2] * pol * (0.85 + 0.15 * clamp(e / 25));
    d[i] = 78 * k + gr; d[i + 1] = 74 * k + gr; d[i + 2] = 70 * k + gr; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ------------------------------------------------------------------ INSCRIPTION (CIL X 829): the duumvirs C. Uulius and P. Aninius built the sweat room and the scraping room and repaired the porticoes and palaestra
export function bathsInscription() {
  const W = 2048, H = 640, c = createCanvas(W, H), g = c.getContext('2d');
  marble(g, 0, 0, W, H, '#e9e3d6', '#b0a898', { scale: 1 / 300, angle: 0.2 });
  frame(g, 26, 26, W - 52, H - 52, 'rgba(90,80,70,0.6)', 8); bevel(g, 26, 26, W - 52, H - 52, 12);
  const rows = ['C · VVLIVS · C · F · P · ANINIVS · C · F · II · V · I · D', 'LACONICVM · ET · DESTRICTARIVM', 'FACIVND · ET · PORTICVS · ET · PALAESTR', 'REFICIVNDA · LOCARVNT · EX · D · D'];
  rows.forEach((t, k) => {
    g.font = 'bold 84px "Liberation Serif"'; g.textAlign = 'center';
    const w = g.measureText(t).width, sx = Math.min(1, (W - 160) / w);
    g.save(); g.translate(W / 2, 150 + k * 125); g.scale(sx, 1);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillText(t, 2, 3); g.fillStyle = 'rgba(70,40,30,0.85)'; g.fillText(t, 0, 0); g.fillStyle = 'rgba(160,40,30,0.5)'; g.fillText(t, -1, -1);
    g.restore();
  });
  return c;
}
