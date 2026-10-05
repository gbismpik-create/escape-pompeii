// Portico wall of the Great Palaestra: whitewashed plaster over a red socle, covered — as Pompeii's public walls were —
// in red-painted election notices (programmata) and scratched graffiti. 4096 × 2048 = 16 m × 8 m of wall.
import { createCanvas } from '@napi-rs/canvas';
import { rr, pick, rect, line, frame, weather } from './villa-textures.mjs';

export function porticoWall() {
  const W = 4096, H = 2048, c = createCanvas(W, H), g = c.getContext('2d'), py = h => H * (1 - h / 8);
  rect(g, 0, 0, W, H, '#e9e2d0');
  rect(g, 0, py(1.2), W, H - py(1.2), '#8f2318'); line(g, 0, py(1.2), W, py(1.2), '#d9b57a', 5);
  for (let i = 0; i < 16; i++) frame(g, i * W / 16 + 24, py(1.12), W / 16 - 48, py(0.1) - py(1.12), '#c9955a', 3);
  rect(g, 0, py(4.4), W, 14, '#c9b48e');
  // painted election notices: "… AED(ilem) O(ro) V(os) F(aciatis)" — "I ask you to elect … aedile"
  const notices = [['CN · HELVIVM · SABINVM', 'AED · O · V · F'], ['IVVENES · POMPEIANI', 'FELICITER'], ['M · EPIDIVM · SABINVM', 'D · R · P · O · V · F'], ['A · VETTIVM · FIRMVM', 'AED · O · V · F']];
  notices.forEach(([a, b], k) => {
    const x = 320 + k * 960 + rr(-60, 60), y = py(rr(2.6, 3.4));
    rect(g, x - 380, y - 150, 760, 240, 'rgba(250,246,236,0.85)');
    for (const [t, sz, dy] of [[a, 92, 0], [b, 120, 120]]) {
      g.save(); g.translate(x, y + dy); g.transform(1, 0, -0.14, 1, 0, 0); g.font = `bold ${sz}px "Liberation Serif"`; g.textAlign = 'center';
      const w = g.measureText(t).width, s = Math.min(1, 700 / w); g.scale(s, 1);
      g.fillStyle = 'rgba(150,30,20,0.9)'; g.fillText(t, 0, 0); g.restore();
    }
  });
  // scratched graffiti: tallies, little gladiators, ships, names
  g.strokeStyle = 'rgba(70,60,50,0.55)'; g.lineWidth = 2.5; g.font = 'italic 38px "Liberation Serif"'; g.fillStyle = 'rgba(70,60,50,0.55)';
  for (let i = 0; i < 95; i++) {
    const x = rr(0, W), y = py(rr(1.4, 2.4)), k = i % 5;
    if (k === 0) { for (let j = 0; j < 5; j++) line(g, x + j * 10, y, x + j * 10 + 3, y - 34, 'rgba(70,60,50,0.55)', 2.5); line(g, x - 6, y - 10, x + 48, y - 26, 'rgba(70,60,50,0.55)', 2.5); }
    else if (k === 1) g.fillText(pick(['VALE', 'FELIX', 'AMPLIATVS', 'HIC FVIMVS', 'NIKH', 'VICTOR', 'ROMVLA', 'SALVE']), x, y);
    else if (k === 2) { g.beginPath(); g.arc(x, y - 50, 9, 0, 6.28); g.moveTo(x, y - 41); g.lineTo(x, y - 12); g.lineTo(x - 12, y + 6); g.moveTo(x, y - 12); g.lineTo(x + 12, y + 6); g.moveTo(x - 16, y - 30); g.lineTo(x + 22, y - 36); g.stroke(); g.strokeRect(x + 14, y - 46, 16, 26); }
    else if (k === 3) { g.beginPath(); g.moveTo(x - 40, y); g.quadraticCurveTo(x, y + 20, x + 40, y); g.lineTo(x - 40, y); g.moveTo(x, y); g.lineTo(x, y - 50); g.lineTo(x + 30, y - 12); g.stroke(); }
  }
  weather(g, W, H, { fade: 0.08, cracks: 6, lossAmt: 1.2 });
  return c;
}

import { fbm2, n2, h2, clamp, lerp, mix, shade, hex, rgb, dab } from './villa-textures.mjs';

// ------------------------------------------------------------------ PLANE-TREE BARK (1024 × 2048, 0.8 m round × 1.6 m tall)
// The oriental plane sheds its bark in plates, leaving a camouflage of cream, olive, grey-green and fawn patches.
export function planeBark() {
  const W = 1024, H = 2048, c = createCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  const cols = [[206, 200, 174], [160, 156, 136], [178, 168, 142], [138, 140, 124], [218, 212, 190], [150, 150, 132]];
  const tile = (f, x, y, sx, sy) => { const u = x / W, v = y / H; return f(u * sx, v * sy) * (1 - u) * (1 - v) + f((u - 1) * sx, v * sy) * u * (1 - v) + f(u * sx, (v - 1) * sy) * (1 - u) * v + f((u - 1) * sx, (v - 1) * sy) * u * v; };   // seamless blend
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let col = cols[0].slice(), edge = 0;
    for (let L = 0; L < 4; L++) {
      const s = 5 + L * 3, v = tile((a, b) => fbm2(a + L * 17.3, b + L * 9.1), x, y, s, s * 1.4);
      const t = 0.5 + L * 0.03;
      if (v > t) { col = mix(col, cols[1 + L], 0.8); }
      edge = Math.max(edge, clamp(1 - Math.abs(v - t) * 40));
    }
    const fine = (h2(x, y) - 0.5) * 18 + (tile((a, b) => n2(a, b), x, y, 60, 160) - 0.5) * 20;
    const k = (1 - edge * 0.12) * (0.96 + 0.08 * tile((a, b) => n2(a, b), x, y, 30, 2));
    const i = (y * W + x) * 4; d[i] = col[0] * k + fine; d[i + 1] = col[1] * k + fine; d[i + 2] = col[2] * k + fine; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ------------------------------------------------------------------ PLANE LEAVES (1024², alpha): a spray of palmate, five-lobed leaves with veins, and seed balls
export function planeLeaves() {
  const S = 1024, c = createCanvas(S, S), g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  const greens = [[52, 82, 38], [66, 100, 44], [84, 118, 52], [98, 130, 58], [74, 104, 40], [112, 138, 64]];
  const lobeA = [-1.25, -0.62, 0, 0.62, 1.25];
  const leaf = (x, y, size, ang, col) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    const pts = [];
    for (let k = 0; k <= 160; k++) {
      const t = -Math.PI + k / 160 * Math.PI * 2;
      let r = 0.46;
      for (const [j, la] of lobeA.entries()) { const w = j === 2 ? 1 : j === 1 || j === 3 ? 0.9 : 0.62; r = Math.max(r, w * Math.pow(Math.max(0, Math.cos((t - la) * 1.45)), 4.5)); }
      r *= 1 + 0.04 * Math.sin(t * 40);                                           // toothed margin
      if (Math.abs(Math.abs(t) - Math.PI) < 0.35) r *= 0.55 + 0.45 * (Math.abs(Math.abs(t) - Math.PI) / 0.35);   // notch at the stalk
      pts.push([Math.sin(t) * r * size, -Math.cos(t) * r * size]);
    }
    const gr = g.createLinearGradient(-size * 0.6, 0, size * 0.6, 0);
    gr.addColorStop(0, rgb(shade(col, 1.18))); gr.addColorStop(0.5, rgb(col)); gr.addColorStop(1, rgb(shade(col, 0.72)));
    g.fillStyle = gr; g.beginPath(); pts.forEach(([px, py], k) => k ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath(); g.fill();
    g.strokeStyle = rgb(shade(col, 0.6), 0.6); g.lineWidth = 1.2; g.stroke();
    g.strokeStyle = rgb(mix(col, [210, 220, 150], 0.5), 0.75); g.lineWidth = Math.max(1, size * 0.02);
    for (const [j, la] of lobeA.entries()) { const L = size * (j === 2 ? 0.95 : j === 1 || j === 3 ? 0.85 : 0.58); g.beginPath(); g.moveTo(0, size * 0.25); g.quadraticCurveTo(Math.sin(la) * L * 0.4, -Math.cos(la) * L * 0.4 + size * 0.1, Math.sin(la) * L, -Math.cos(la) * L); g.stroke(); }
    g.lineWidth = Math.max(1, size * 0.03); g.beginPath(); g.moveTo(0, size * 0.25); g.lineTo(0, size * 0.55); g.stroke();   // stalk
    g.restore();
  };
  // twigs
  g.lineCap = 'round';
  for (let i = 0; i < 6; i++) { g.strokeStyle = '#5a4c36'; g.lineWidth = 6 - i * 0.5; g.beginPath(); g.moveTo(S / 2, S * 0.98); g.quadraticCurveTo(S / 2 + rr(-200, 200), S * 0.6, rr(120, 900), rr(80, 420)); g.stroke(); }
  // leaves, back to front, smaller and darker inside the spray
  for (let i = 0; i < 95; i++) {
    const r = Math.sqrt(Math.random()) * S * 0.4, a = rr(0, 6.283), x = S / 2 + Math.cos(a) * r, y = S * 0.46 + Math.sin(a) * r * 0.92;
    const depth = i / 95, col = mix(greens[Math.floor(rr(0, greens.length))], [40, 60, 30], (1 - depth) * 0.35);
    leaf(x, y, rr(66, 104) * (0.85 + depth * 0.3), a + Math.PI / 2 + rr(-0.6, 0.6), col);
  }
  // spiky seed balls hanging on long stalks
  for (let i = 0; i < 5; i++) {
    const x = rr(200, 820), y = rr(560, 900);
    g.strokeStyle = '#5a4c36'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + rr(-30, 30), y - 160); g.quadraticCurveTo(x + 20, y - 80, x, y); g.stroke();
    for (let k = 0; k < 60; k++) { const a = rr(0, 6.28), rr2 = rr(10, 20); dab(g, x + Math.cos(a) * rr2, y + Math.sin(a) * rr2, 5, pick(['#7a6a34', '#8a7a40', '#6a5a2c', '#9a8a4a']), 1, a, 0.5); }
  }
  return c;
}

// ------------------------------------------------------------------ COLUMN STUCCO (1024 × 2048, u round, v = height / column height)
// Pompeian stuccoed brick column: the lower third painted red (unfluted, graffiti scratched into it), white fluted above.
export function columnStucco(f = 0.34) {
  const W = 1024, H = 2048, c = createCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data, yB = H * (1 - f);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const red = y > yB, n = fbm2(x / 70, y / 140), fine = (h2(x, y) - 0.5) * 14;
    let col = red ? [150, 34, 24] : [240, 233, 218];
    if (!red) { const dirt = clamp((fbm2(x / 30 + 9, y / 300) - 0.55) * 2) * 0.12 + clamp((y - yB + 300) / 300) * 0.06; col = col.map(v => v * (1 - dirt)); }
    else { const fade = clamp((n - 0.45) * 1.5) * 0.18; col = mix(col, [176, 92, 70], fade); col = col.map(v => v * (1 - clamp((y - H + 160) / 160) * 0.35)); }
    const k = 0.92 + n * 0.16;
    const i = (y * W + x) * 4; d[i] = col[0] * k + fine; d[i + 1] = col[1] * k + fine; d[i + 2] = col[2] * k + fine; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  rect(g, 0, yB - 4, W, 14, '#5a1610'); rect(g, 0, yB - 16, W, 10, '#f6f0e2');          // painted band where the fluting starts
  // scratched graffiti on the red part
  g.strokeStyle = 'rgba(235,205,190,0.38)'; g.fillStyle = 'rgba(235,205,190,0.38)'; g.lineWidth = 1.5; g.font = 'italic 22px "Liberation Serif"';
  for (let i = 0; i < 9; i++) {
    const x = rr(40, W - 160), y = rr(yB + 80, H - 220);
    if (i % 3 === 0) g.fillText(pick(['VALE', 'FELIX', 'VICTOR', 'IVVENES', 'NIKH', 'HIC FVI', 'AMPLIATVS']), x, y);
    else if (i % 3 === 1) { for (let j = 0; j < 6; j++) line(g, x + j * 9, y, x + j * 9 + 2, y - 30, 'rgba(235,205,190,0.55)', 2); }
    else { g.beginPath(); g.arc(x, y - 40, 8, 0, 6.28); g.moveTo(x, y - 32); g.lineTo(x, y - 8); g.lineTo(x - 10, y + 8); g.moveTo(x, y - 8); g.lineTo(x + 10, y + 8); g.moveTo(x - 14, y - 22); g.lineTo(x + 18, y - 28); g.stroke(); }
  }
  return c;
}
