// Escape Pompeii — painted textures for the HD street kit (Via dell'Abbondanza style).
// Facades are painted per building (u = x / width, v = y / height), so every sign sits where it belongs:
//   red or black dado, ashlar-imitation stucco (First style), painted election notices (programmata, the real
//   names from Via dell'Abbondanza), shop signs (Venus Pompeiana drawn by elephants from the shop of Verecundus,
//   the price list of wine jugs "Ad Cucumas", Minerva's owl over a fullery, bread loaves at the bakery),
//   a street shrine with the Lares and two serpents, and scratched graffiti.
// Plus ground and material textures: basalt paving (its stone cells are exported so the road mesh can be
// sculpted to match), kerb limestone, Nocera tuff, lava, oak planks, a marble-fragment counter, brick.
import { createCanvas } from '@napi-rs/canvas';
import { rr, pick, hex, rgb, shade, mix, clamp, lerp, n2, fbm2, h2, line, dab, rect, frame, weather, figure, garland, marble as marblePaint, bevel, paintedTree } from './villa-textures.mjs';

// ---------------------------------------------------------------- brush helpers
const PAL = { red: '#9b2318', redO: '#8a3a22', ochre: '#c9952f', black: '#1b1512', white: '#ece4d2', cream: '#e4d6b8', blue: '#3b6e8f', green: '#4f6b3a', salmon: '#cf8d68', minium: 'rgba(160,32,20,0.92)', soot: 'rgba(25,18,14,0.9)' };
function blob(g, x, y, w, h, c, rough = 0.06) {   // rough-edged whitewash patch
  g.fillStyle = c; g.beginPath();
  const n = 40; for (let i = 0; i <= n; i++) { const t = i / n, a = t * 6.283; const k = 1 + (n2(x * 0.01 + Math.cos(a) * 3, y * 0.01 + Math.sin(a) * 3) - 0.5) * rough * 4; g.lineTo(x + Math.cos(a) * w / 2 * k * 1.12, y + Math.sin(a) * h / 2 * k * 1.12); }
  g.fill();
}
// painted capitals in scriptura actuaria: tall, narrow, brushed in red minium or black
function brushText(g, t, x, y, size, color, maxW, opts = {}) {
  g.save(); g.translate(x, y); if (opts.skew !== false) g.transform(1, 0, -0.08, 1, 0, 0);
  g.font = `bold ${size}px "${opts.font ?? 'Liberation Sans'}"`; g.textAlign = opts.align ?? 'center'; g.textBaseline = 'alphabetic';
  const w = g.measureText(t).width, sx = Math.min(1, maxW / w); g.scale(sx, opts.tall ?? 1.25);
  g.fillStyle = color; g.globalAlpha = 0.35; g.fillText(t, 2, 1.5); g.fillText(t, -1.5, -1);
  g.globalAlpha = 1; g.fillText(t, 0, 0);
  g.restore();
}
// an election notice: whitewashed panel, candidate's name large, office and O V F below
function programma(g, x, y, w, lines, opts = {}) {
  const lh = opts.size ?? 70, h = lines.length * lh * 1.45 + 30;
  if (opts.wash !== false) blob(g, x, y + h / 2 - lh * 0.9, w * 1.05, h * 1.05, opts.wash ?? 'rgba(246,240,226,0.88)', 0.08);
  lines.forEach((t, i) => {
    const big = i === 0 ? 1 : 0.78, col = typeof opts.color === 'object' ? opts.color[i] : (opts.color ?? PAL.minium);
    brushText(g, t, x, y + i * lh * 1.4, lh * big, col, w * 0.94);
  });
  if (opts.rule) line(g, x - w * 0.45, y + lines.length * lh * 1.4 - lh * 0.6, x + w * 0.45, y + lines.length * lh * 1.4 - lh * 0.6, opts.color ?? PAL.minium, 3);
}
// scratched graffiti: tallies, names, gladiators, ships, palm branches
function graffiti(g, x0, y0, x1, y1, n, ink = 'rgba(60,48,40,0.6)') {
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 2;
  const words = ['VALE', 'SALVE LVCRV', 'LVCRVM GAVDIVM', 'FELIX', 'HIC FVIMVS', 'VICTOR', 'NIKH', 'ROMVLA', 'SVCCESSVS', 'IVVENES', 'AMPLIATVS', 'MARCELLVS', 'CRESCENS', 'FELICITER', 'CELADVS', 'HAVE'];
  for (let i = 0; i < n; i++) {
    const x = rr(x0, x1), y = rr(y0, y1), k = i % 6;
    g.font = `italic ${Math.round(rr(26, 40))}px "Liberation Serif"`;
    if (k === 0) { for (let j = 0; j < 5; j++) line(g, x + j * 9, y, x + j * 9 + 3, y - 30, ink, 2); line(g, x - 6, y - 8, x + 44, y - 24, ink, 2); }
    else if (k === 1 || k === 4) g.fillText(pick(words), x, y);
    else if (k === 2) { g.beginPath(); g.arc(x, y - 46, 8, 0, 6.28); g.moveTo(x, y - 38); g.lineTo(x, y - 12); g.lineTo(x - 11, y + 5); g.moveTo(x, y - 12); g.lineTo(x + 11, y + 5); g.moveTo(x - 15, y - 28); g.lineTo(x + 20, y - 34); g.stroke(); g.strokeRect(x + 12, y - 42, 14, 24); }
    else if (k === 3) { g.beginPath(); g.moveTo(x - 38, y); g.quadraticCurveTo(x, y + 18, x + 38, y); g.lineTo(x - 38, y); g.moveTo(x, y); g.lineTo(x, y - 46); g.lineTo(x + 28, y - 10); g.stroke(); }
    else { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 50); for (let j = 0; j < 6; j++) { g.moveTo(x, y - 12 - j * 7); g.lineTo(x - 12, y - 20 - j * 7); g.moveTo(x, y - 12 - j * 7); g.lineTo(x + 12, y - 20 - j * 7); } g.stroke(); }
  }
}
// First-style ashlar imitation: stucco blocks with drafted margins, lit from the upper left
function ashlar(g, x0, y0, x1, y1, bw, bh, base, opts = {}) {
  const b = hex(base);
  for (let row = 0, y = y1; y > y0 + 2; row++, y -= bh) {
    const yt = Math.max(y0, y - bh), off = row % 2 ? bw / 2 : 0;
    for (let x = x0 - off; x < x1; x += bw) {
      const xa = Math.max(x0, x), xb = Math.min(x1, x + bw); if (xb - xa < 4) continue;
      const k = opts.flat ? 1 : rr(0.95, 1.05);
      rect(g, xa, yt, xb - xa, y - yt, rgb(shade(b, k)));
      if (opts.marbled) marblePaint(g, xa + 6, yt + 6, xb - xa - 12, y - yt - 12, opts.marbled[row % opts.marbled.length], '#f3ead8', { scale: 1 / 90 });
      bevel(g, xa, yt, xb - xa, y - yt, opts.bevel ?? 6);
    }
  }
}
function serpent(g, x0, y0, x1, y1, amp, dir = 1) {          // agathodaemon: crested green serpent with a yellow belly
  const pts = []; for (let t = 0; t <= 1.0001; t += 0.01) pts.push([lerp(x0, x1, t), lerp(y0, y1, t) + Math.sin(t * Math.PI * 3.2) * amp * (0.4 + t * 0.6)]);
  for (const [w, c] of [[30, '#2f4a24'], [22, '#4f6b3a'], [7, '#d9b23a']]) { g.strokeStyle = c; g.lineCap = 'round'; g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], i) => { const ww = w * (0.35 + 0.65 * Math.sin(Math.min(1, i / pts.length * 1.1) * Math.PI * 0.9 + 0.2)); g.lineWidth = ww; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
  const [hx, hy] = pts[pts.length - 1];
  dab(g, hx + dir * 10, hy, 20, '#3f5a30', 1, 0, 0.6); dab(g, hx + dir * 16, hy - 4, 4, '#111', 1, 0, 1);
  g.fillStyle = '#b8432a'; g.beginPath(); g.moveTo(hx - dir * 4, hy - 14); g.lineTo(hx + dir * 8, hy - 34); g.lineTo(hx + dir * 16, hy - 14); g.fill();   // crest
  line(g, hx + dir * 28, hy + 2, hx + dir * 44, hy + 6, '#b8432a', 2);                                                                         // tongue
}
function altar(g, x, y, s) {
  rect(g, x - 40 * s, y - 90 * s, 80 * s, 90 * s, '#b9a988'); rect(g, x - 50 * s, y - 100 * s, 100 * s, 14 * s, '#cfc0a0'); rect(g, x - 50 * s, y - 8 * s, 100 * s, 10 * s, '#9a8a6a');
  dab(g, x, y - 112 * s, 22 * s, '#e86a2a', 1, 0, 1.2); dab(g, x, y - 128 * s, 12 * s, '#f2c24a', 1, 0, 1.4);
  dab(g, x - 26 * s, y - 104 * s, 9 * s, '#e8dcc0', 1, 0, 0.8);                                                // egg offering
}
function elephant(g, x, y, s, tone = '#7d7670') {
  const c = hex(tone);
  for (const [lx, d] of [[-34, 0.75], [24, 0.75], [-20, 1], [40, 1]]) { g.fillStyle = rgb(shade(c, d)); g.fillRect(x + lx * s, y - 30 * s, 16 * s, 52 * s); }
  const gr = g.createLinearGradient(0, y - 90 * s, 0, y); gr.addColorStop(0, rgb(shade(c, 1.2))); gr.addColorStop(1, rgb(shade(c, 0.7)));
  g.fillStyle = gr; g.beginPath(); g.ellipse(x, y - 52 * s, 62 * s, 40 * s, 0, 0, 6.28); g.fill();
  g.beginPath(); g.ellipse(x + 62 * s, y - 70 * s, 28 * s, 26 * s, 0, 0, 6.28); g.fill();                      // head
  g.fillStyle = rgb(shade(c, 0.85)); g.beginPath(); g.ellipse(x + 50 * s, y - 64 * s, 18 * s, 28 * s, -0.2, 0, 6.28); g.fill();   // ear
  g.strokeStyle = rgb(shade(c, 1.05)); g.lineCap = 'round'; g.lineWidth = 13 * s; g.beginPath(); g.moveTo(x + 82 * s, y - 64 * s); g.quadraticCurveTo(x + 98 * s, y - 20 * s, x + 86 * s, y + 4 * s); g.stroke();   // trunk
  line(g, x + 74 * s, y - 52 * s, x + 96 * s, y - 44 * s, '#efe6d2', 5 * s);                                    // tusk
  dab(g, x + 70 * s, y - 76 * s, 3 * s, '#111', 1, 0, 1);
  line(g, x - 60 * s, y - 56 * s, x - 70 * s, y - 20 * s, rgb(shade(c, 0.7)), 4 * s);                          // tail
}
function jug(g, x, y, h, col) {               // a painted cucuma (wine jug) with a highlight
  const c = hex(col), w = h * 0.62;
  const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0); gr.addColorStop(0, rgb(shade(c, 1.35))); gr.addColorStop(0.4, rgb(c)); gr.addColorStop(1, rgb(shade(c, 0.5)));
  g.fillStyle = gr; g.beginPath(); g.moveTo(x - w * 0.18, y - h); g.bezierCurveTo(x - w * 0.2, y - h * 0.75, x - w * 0.62, y - h * 0.6, x - w * 0.5, y - h * 0.25); g.quadraticCurveTo(x - w * 0.4, y, x, y);
  g.quadraticCurveTo(x + w * 0.4, y, x + w * 0.5, y - h * 0.25); g.bezierCurveTo(x + w * 0.62, y - h * 0.6, x + w * 0.2, y - h * 0.75, x + w * 0.18, y - h); g.closePath(); g.fill();
  g.strokeStyle = rgb(shade(c, 0.4)); g.lineWidth = 3; g.stroke();
  g.lineWidth = h * 0.06; g.beginPath(); g.moveTo(x + w * 0.16, y - h * 0.92); g.bezierCurveTo(x + w * 0.7, y - h * 0.95, x + w * 0.7, y - h * 0.6, x + w * 0.38, y - h * 0.5); g.stroke();   // handle
  rect(g, x - w * 0.24, y - h - 6, w * 0.48, 10, rgb(shade(c, 0.8)));
}
function owl(g, x, y, s) {
  g.fillStyle = '#6b5236'; g.beginPath(); g.ellipse(x, y - 70 * s, 42 * s, 64 * s, 0, 0, 6.28); g.fill();
  for (let i = 0; i < 40; i++) dab(g, x + rr(-30, 30) * s, y + rr(-110, -20) * s, 5 * s, pick(['#8a6a44', '#4a3826', '#a8865a']), 0.8, rr(0, 3), 0.5);
  g.fillStyle = '#7a5e3e'; g.beginPath(); g.ellipse(x, y - 132 * s, 36 * s, 30 * s, 0, 0, 6.28); g.fill();
  for (const sx of [-1, 1]) {
    g.fillStyle = '#7a5e3e'; g.beginPath(); g.moveTo(x + sx * 20 * s, y - 150 * s); g.lineTo(x + sx * 34 * s, y - 178 * s); g.lineTo(x + sx * 34 * s, y - 146 * s); g.fill();   // ear tufts
    dab(g, x + sx * 15 * s, y - 134 * s, 14 * s, '#e3b23a', 1, 0, 1); dab(g, x + sx * 15 * s, y - 134 * s, 7 * s, '#140e0a', 1, 0, 1); dab(g, x + sx * 12 * s, y - 138 * s, 2.5 * s, '#fff', 1, 0, 1);
  }
  g.fillStyle = '#3a2a1a'; g.beginPath(); g.moveTo(x - 5 * s, y - 124 * s); g.lineTo(x + 5 * s, y - 124 * s); g.lineTo(x, y - 110 * s); g.fill();
  line(g, x - 70 * s, y + 2 * s, x + 80 * s, y - 6 * s, '#4a3424', 10 * s);                                      // branch
  for (let i = 0; i < 10; i++) dab(g, x + rr(-70, 80) * s, y + rr(-14, 4) * s, 9 * s, pick(['#4f6b3a', '#6b8a4a']), 0.95, rr(-0.6, 0.6), 0.4);   // olive leaves
  for (const sx of [-1, 1]) line(g, x + sx * 12 * s, y - 10 * s, x + sx * 16 * s, y + 2 * s, '#d9a034', 4 * s);
}
function loaf(g, x, y, r) {                   // panis quadratus: round loaf scored into 8 wedges
  const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r); gr.addColorStop(0, '#d9a25a'); gr.addColorStop(0.7, '#a8682e'); gr.addColorStop(1, '#6e3e1a');
  g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * 0.62, 0, 0, 6.28); g.fill();
  for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; line(g, x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.12, x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.57, 'rgba(70,36,14,0.8)', r * 0.06); }
  g.strokeStyle = 'rgba(70,36,14,0.7)'; g.lineWidth = r * 0.05; g.beginPath(); g.ellipse(x, y, r * 0.22, r * 0.13, 0, 0, 6.28); g.stroke();
}
function mercury(g, x, y, s) {
  figure(g, x, y, s, '#b0402c', 'stand');
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = '#d9c9a0'; g.beginPath(); g.ellipse(2, -156, 22, 6, 0, 0, 6.28); g.fill();                     // petasus
  for (const sx of [-1, 1]) { g.fillStyle = '#ece6da'; g.beginPath(); g.moveTo(sx * 12, -158); g.lineTo(sx * 30, -176); g.lineTo(sx * 18, -152); g.fill(); }   // wings
  g.strokeStyle = '#d9b866'; g.lineWidth = 3; for (const sx of [-1, 1]) { g.beginPath(); for (let t = 0; t <= 1; t += 0.05) g.lineTo(56 + 6 * t + sx * 8 * Math.sin(t * 12), -88 - t * 40); g.stroke(); }   // caduceus snakes
  g.beginPath(); g.ellipse(-26, -36, 9, 12, 0, 0, 6.28); g.fillStyle = '#b8902a'; g.fill();                      // purse
  g.restore();
}
function venusOnElephants(g, x, y, w, h) {    // shop sign from the workshop of Verecundus, Via dell'Abbondanza
  const sky = g.createLinearGradient(0, y, 0, y + h); sky.addColorStop(0, '#2b5a76'); sky.addColorStop(1, '#4d7f94'); g.fillStyle = sky; g.fillRect(x, y, w, h);
  rect(g, x, y + h * 0.84, w, h * 0.16, '#6b5a3e');
  // the team of four elephants pulling to the right, staggered in depth
  for (let i = 3; i >= 0; i--) elephant(g, x + w * (0.52 + i * 0.07), y + h * (0.88 - i * 0.025), w / 560 * (1 - i * 0.05), i % 2 ? '#857d76' : '#706963');
  // the quadriga car with Venus Pompeiana standing in it (mural crown, sceptre), Cupid flying beside her
  g.fillStyle = '#c9a24a'; g.beginPath(); g.moveTo(x + w * 0.18, y + h * 0.84); g.lineTo(x + w * 0.46, y + h * 0.84); g.lineTo(x + w * 0.44, y + h * 0.64); g.lineTo(x + w * 0.2, y + h * 0.6); g.fill();
  line(g, x + w * 0.44, y + h * 0.74, x + w * 0.56, y + h * 0.74, '#5a4a2a', 5);
  g.strokeStyle = '#8a6a22'; g.lineWidth = 5; g.beginPath(); g.arc(x + w * 0.3, y + h * 0.86, h * 0.09, 0, 6.28); g.stroke();
  figure(g, x + w * 0.31, y + h * 0.66, h / 440, '#3b6e8f', 'stand');
  g.fillStyle = '#d9b866'; g.beginPath(); const cx0 = x + w * 0.31 - h * 0.035, cy0 = y + h * 0.66 - h / 440 * 158; g.moveTo(cx0, cy0); for (let k = 0; k <= 6; k++) g.lineTo(cx0 + k * h * 0.012, cy0 - (k % 2 ? h * 0.03 : 0)); g.lineTo(cx0 + h * 0.072, cy0 + 6); g.lineTo(cx0, cy0 + 6); g.fill();   // mural crown
  figure(g, x + w * 0.1, y + h * 0.4, h / 900, '#e8dcc0', 'cupid');
  frame(g, x, y, w, h, '#1b1512', 8); frame(g, x - 14, y - 14, w + 28, h + 28, '#c9952f', 4);
}
function cucumas(g, x, y, w, h) {           // "Ad Cucumas": wine jugs with their prices in asses
  rect(g, x, y, w, h, '#ebe1c8'); frame(g, x + 8, y + 8, w - 16, h - 16, '#7c241a', 5);
  brushText(g, 'AD · CVCVMAS', x + w / 2, y + h * 0.2, h * 0.12, '#7c241a', w * 0.86, { font: 'Liberation Serif' });
  const cols = ['#b65a2a', '#3b6e8f', '#4f6b3a', '#8f3a2a'], prices = ['II', 'III', 'IIII', 'IIS'];
  for (let i = 0; i < 4; i++) { const cx = x + w * (0.15 + i * 0.233); jug(g, cx, y + h * 0.74, h * 0.34, cols[i]); brushText(g, prices[i], cx, y + h * 0.9, h * 0.09, '#1b1512', w * 0.2, { font: 'Liberation Serif' }); }
}
function lararium(g, x, y, w, h) {          // street shrine: the Genius sacrificing between two dancing Lares, serpents below
  rect(g, x, y, w, h, '#ece0c4');
  garland(g, x + w * 0.04, x + w * 0.96, y + h * 0.06, h * 0.06);
  figure(g, x + w * 0.2, y + h * 0.56, h / 470, '#b0402c', 'stand'); figure(g, x + w * 0.8, y + h * 0.56, h / 470, '#b0402c', 'stand');
  figure(g, x + w * 0.5, y + h * 0.58, h / 520, '#e8dcc0', 'stand'); altar(g, x + w * 0.38, y + h * 0.6, h / 800);
  rect(g, x, y + h * 0.62, w, 4, '#7c241a');
  serpent(g, x + w * 0.02, y + h * 0.86, x + w * 0.4, y + h * 0.8, h * 0.05, 1); serpent(g, x + w * 0.98, y + h * 0.86, x + w * 0.6, y + h * 0.8, h * 0.05, -1);
  altar(g, x + w * 0.5, y + h * 0.95, h / 700);
  for (let i = 0; i < 12; i++) paintedTree(g, x + w * rr(0.03, 0.97), y + h * 0.99, h * rr(0.06, 0.1), 'laurel');
  frame(g, x, y, w, h, '#7c241a', 6);
}

// ---------------------------------------------------------------- facades
// spec: W, H metres; dado height & colour; upper ground; bands; paintings; notices; holes to keep clear of paint
function facadeBase(spec) {
  const PX = spec.px ?? 2048 / spec.W, Wp = Math.round(spec.W * PX), Hp = Math.round(spec.H * PX / 4) * 4;
  const c = createCanvas(Wp, Hp), g = c.getContext('2d'), X = m => m * PX, Y = h => Hp * (1 - h / spec.H);
  return { c, g, X, Y, Wp, Hp, PX };
}
function finishFacade(F, spec) {
  const { g, X, Y, Wp, Hp } = F;
  // openings were cut in the mesh, but fill them dark so mip-maps don't bleed light paint into the reveals
  for (const [x0, x1, y0, y1] of spec.holes ?? []) rect(g, X(x0) + 3, Y(y1) + 3, X(x1 - x0) - 6, Y(y0) - Y(y1) - 6, '#3a2e26');
  weather(g, Wp, Hp, { fade: 0.09, cracks: 9, lossAmt: 1.4, losses: 2 });
  // soft rain streaks under the eaves and splash dirt along the pavement
  g.filter = `blur(${Math.round(Wp / 300)}px)`;
  for (let i = 0; i < 45; i++) { const x = rr(0, Wp), w = rr(10, 40), l = rr(60, Hp * 0.3), gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, 'rgba(50,38,28,0.13)'); gr.addColorStop(1, 'rgba(50,38,28,0)'); g.fillStyle = gr; g.fillRect(x, 0, w, l); }
  g.filter = 'none';
  const sp = g.createLinearGradient(0, Hp - X(0.6), 0, Hp); sp.addColorStop(0, 'rgba(60,46,34,0)'); sp.addColorStop(1, 'rgba(60,46,34,0.4)'); g.fillStyle = sp; g.fillRect(0, Hp - X(0.6), Wp, X(0.6));
  return F.c;
}
function dadoAndUpper(F, spec) {
  const { g, X, Y, Wp, Hp } = F;
  rect(g, 0, 0, Wp, Hp, spec.upper);
  if (spec.ashlar) ashlar(g, 0, Y(spec.ashlarTop ?? spec.H), Wp, Y(spec.dadoH), X(spec.ashlar[0]), X(spec.ashlar[1]), spec.upper, { bevel: 5, marbled: spec.marbled });
  rect(g, 0, Y(spec.dadoH), Wp, Hp - Y(spec.dadoH), spec.dado);
  if (spec.dadoSplash !== false) for (let i = 0; i < 260; i++) dab(g, rr(0, Wp), rr(Y(spec.dadoH) + 8, Hp), rr(2, 8), pick(['rgba(20,12,8,0.35)', 'rgba(240,220,200,0.25)']), 0.6);   // spattered dado
  line(g, 0, Y(spec.dadoH), Wp, Y(spec.dadoH), spec.dadoLine ?? '#e6d2a8', 6);
  for (const [h, col, w] of spec.bands ?? []) rect(g, 0, Y(h) - X(w) / 2, Wp, X(w), col);
}

export function facadeHouseA() {          // single-storey house: red dado, ashlar stucco, three election notices
  const spec = { W: 6, H: 4.4, dadoH: 1.15, dado: '#8f2318', upper: '#e2d6bc', ashlar: [0.9, 0.38], ashlarTop: 3.85, bands: [[3.92, '#b4402a', 0.1], [4.05, '#e8dcc2', 0.06]], holes: [[2.2, 3.6, 0, 2.62], [0.7, 1.2, 2.9, 3.45], [4.6, 5.1, 2.9, 3.45]] };
  const F = facadeBase(spec), { g, X, Y } = F; dadoAndUpper(F, spec);
  programma(g, X(1.05), Y(2.55), X(1.8), ['C · IVLIVM · POLYBIVM', 'AED · O · V · F'], { size: X(0.17) });
  programma(g, X(4.85), Y(2.45), X(1.85), ['M · CERRINIVM · VATIAM', 'AED · O · V · F', 'SERIBIBI · VNIVERSI · ROGANT'], { size: X(0.135), color: [PAL.minium, PAL.minium, PAL.soot] });
  programma(g, X(2.9), Y(3.62), X(1.2), ['CN · HELVIVM · SABINVM'], { size: X(0.12), wash: false, color: PAL.soot });
  graffiti(g, X(0.1), Y(1.1), X(2.1), Y(0.3), 16, 'rgba(235,200,180,0.5)'); graffiti(g, X(3.7), Y(1.1), X(5.9), Y(0.3), 16, 'rgba(235,200,180,0.5)');
  graffiti(g, X(0.2), Y(2.0), X(5.8), Y(1.3), 10);
  return finishFacade(F, spec);
}
export function facadeHouseB() {          // two storeys with shops: Venus Pompeiana sign, ochre zone, white upper floor
  const spec = { W: 6, H: 6.4, dadoH: 0.95, dado: '#7c241a', upper: '#c99a48', bands: [[3.35, '#7c241a', 0.16], [3.52, '#ece4d2', 0.06]], holes: [[0.55, 1.65, 0, 2.42], [4.15, 5.45, 0, 2.42], [1.2, 1.7, 4.3, 4.9], [3.0, 3.6, 3.6, 5.2], [4.4, 4.9, 4.3, 4.9]] };
  const F = facadeBase(spec), { g, X, Y, Wp } = F; dadoAndUpper(F, spec);
  rect(g, 0, 0, Wp, Y(3.43), '#e6dcc6'); ashlar(g, 0, Y(6.05), Wp, Y(3.6), X(0.8), X(0.34), '#e6dcc6', { bevel: 4 }); rect(g, 0, Y(6.2), Wp, X(0.12), '#7c241a');
  venusOnElephants(g, X(1.95), Y(2.75), X(2.0), X(1.45));
  programma(g, X(3.05), Y(3.02), X(2.1), ['VERECVNDVS · VESTIARIVS'], { size: X(0.12), wash: false, color: PAL.soot });
  programma(g, X(2.0), Y(5.55), X(1.4), ['A · TREBIVM · VALENTEM', 'AED · O · V · F'], { size: X(0.11) });
  programma(g, X(5.0), Y(3.3) + X(0.55), X(1.4), ['IIVIR · I · D'], { size: X(0.1), wash: false });
  graffiti(g, X(0.05), Y(0.9), X(5.9), Y(0.2), 22, 'rgba(235,200,180,0.5)'); graffiti(g, X(1.7), Y(1.3), X(4.1), Y(1.0), 6);
  return finishFacade(F, spec);
}
export function facadeThermopolium() {    // tavern: black dado, salmon upper, Mercury and the wine-jug price list on the piers
  const spec = { W: 6, H: 4.6, dadoH: 1.0, dado: '#1e1714', upper: '#cf8d68', dadoLine: '#c9952f', bands: [[3.1, '#1e1714', 0.12]], holes: [[1.0, 4.6, 0, 2.92]] };
  const F = facadeBase(spec), { g, X, Y } = F; dadoAndUpper(F, spec);
  rect(g, X(0.08), Y(2.75), X(0.84), X(1.55), '#ece0c4'); frame(g, X(0.08), Y(2.75), X(0.84), X(1.55), '#7c241a', 5); mercury(g, X(0.5), Y(1.35), X(1.15) / 300);
  cucumas(g, X(4.72), Y(2.75), X(1.2), X(1.15));
  programma(g, X(2.8), Y(3.95), X(3.3), ['HOSPITIVM · HIC · LOCATVR', 'TRICLINIVM · CVM · TRIBVS · LECTIS'], { size: X(0.13), color: [PAL.soot, PAL.minium] });
  graffiti(g, X(0.05), Y(0.95), X(0.95), Y(0.2), 6, 'rgba(235,200,180,0.5)'); graffiti(g, X(4.65), Y(0.95), X(5.95), Y(0.2), 8, 'rgba(235,200,180,0.5)');
  return finishFacade(F, spec);
}
export function facadeBakery() {          // the bakery of Modestus: white stucco, red dado, loaves and the bakers' notice
  const spec = { W: 6, H: 4.8, dadoH: 1.1, dado: '#8f2318', upper: '#ece4d2', ashlar: [1.0, 0.42], ashlarTop: 4.3, bands: [[4.42, '#8f2318', 0.1]], holes: [[1.2, 4.8, 0, 3.02]] };
  const F = facadeBase(spec), { g, X, Y } = F; dadoAndUpper(F, spec);
  programma(g, X(0.6), Y(2.95), X(1.05), ['M · EPIDIVM', 'SABINVM', 'AED', 'PISTORES', 'ROGANT'], { size: X(0.11) });
  rect(g, X(4.9), Y(2.7), X(1.0), X(0.95), '#d9c9a4'); rect(g, X(4.9), Y(2.02), X(1.0), Y(1.75) - Y(2.02), '#8a6a44'); frame(g, X(4.9), Y(2.7), X(1.0), X(0.95), '#5a3a22', 5);
  for (let i = 0; i < 5; i++) loaf(g, X(5.1 + (i < 3 ? i * 0.3 : 0.15 + (i - 3) * 0.3)), Y(i < 3 ? 2.06 : 2.22), X(0.12));
  brushText(g, 'PANIS · HIC', X(5.4), Y(2.45), X(0.12), '#5a2a16', X(0.9), { font: 'Liberation Serif' });
  programma(g, X(3.0), Y(3.9), X(3.2), ['MODESTVS · PISTOR'], { size: X(0.16), wash: false, color: PAL.soot });
  graffiti(g, X(0.1), Y(1.0), X(1.1), Y(0.2), 6, 'rgba(235,200,180,0.5)'); graffiti(g, X(4.9), Y(1.0), X(5.9), Y(0.2), 6, 'rgba(235,200,180,0.5)');
  return finishFacade(F, spec);
}
export function facadeFullonica() {       // the fullery: Minerva's owl, the fullers' notice and the Virgil parody graffito
  const spec = { W: 6, H: 4.8, dadoH: 1.05, dado: '#7c241a', upper: '#d9c08a', ashlar: [0.95, 0.4], ashlarTop: 4.25, bands: [[4.38, '#4f6b3a', 0.1]], holes: [[1.6, 4.4, 0, 2.92]] };
  const F = facadeBase(spec), { g, X, Y } = F; dadoAndUpper(F, spec);
  rect(g, X(0.12), Y(2.85), X(1.3), X(1.4), '#ece0c4'); frame(g, X(0.12), Y(2.85), X(1.3), X(1.4), '#7c241a', 5); owl(g, X(0.77), Y(1.65), X(1.3) / 260);
  programma(g, X(5.2), Y(2.8), X(1.4), ['FVLLONES', 'VNIVERSI', 'ROGANT'], { size: X(0.14) });
  programma(g, X(3.0), Y(3.85), X(2.6), ['STEPHANVS · FVLLO'], { size: X(0.15), wash: false, color: PAL.soot });
  g.font = `italic ${Math.round(X(0.07))}px "Liberation Serif"`; g.fillStyle = 'rgba(60,46,36,0.75)';
  g.fillText('FVLLONES · VLVLAMQVE · CANO', X(0.15), Y(1.32)); g.fillText('NON · ARMA · VIRVMQVE', X(0.25), Y(1.2));   // "I sing of fullers and the owl, not arms and the man"
  graffiti(g, X(4.5), Y(1.0), X(5.9), Y(0.2), 8, 'rgba(235,200,180,0.5)');
  return finishFacade(F, spec);
}
export function colonnadeWall() {         // back wall of a street portico: red panels, white zone, street shrine with serpents
  const spec = { W: 12, H: 4.2, px: 4096 / 12, dadoH: 1.0, dado: '#1e1714', upper: '#ece4d2', dadoLine: '#c9952f', bands: [[3.5, '#8f2318', 0.14]], holes: [[5.3, 6.7, 0, 2.62]] };
  const F = facadeBase(spec), { g, X, Y } = F; dadoAndUpper(F, spec);
  for (const [a, b] of [[0.2, 2.3], [2.6, 4.9], [7.1, 9.4], [9.7, 11.8]]) {
    rect(g, X(a), Y(3.2), X(b - a), Y(1.15) - Y(3.2), '#9b2318'); frame(g, X(a) + 16, Y(3.2) + 16, X(b - a) - 32, Y(1.15) - Y(3.2) - 32, '#e6cf96', 3);
  }
  lararium(g, X(2.75), Y(3.15), X(2.0), Y(1.2) - Y(3.15));
  programma(g, X(1.25), Y(2.6), X(1.8), ['L · CEIVM · SECVNDVM', 'IIVIR · O · V · F'], { size: X(0.12), wash: false, color: 'rgba(242,232,210,0.93)' });
  programma(g, X(8.25), Y(2.65), X(2.0), ['CN · HELVIVM · SABINVM', 'AED · D · R · P', 'O · V · F'], { size: X(0.12), wash: false, color: 'rgba(242,232,210,0.93)' });
  programma(g, X(10.75), Y(2.6), X(1.8), ['IVVENES · POMPEIANI', 'FELICITER'], { size: X(0.12), wash: false, color: 'rgba(242,232,210,0.93)' });
  graffiti(g, X(0.2), Y(1.9), X(11.8), Y(1.3), 30); graffiti(g, X(0.1), Y(0.95), X(11.9), Y(0.2), 30, 'rgba(235,200,180,0.5)');
  return finishFacade(F, spec);
}
export function shopInterior() {          // plain painted interior of a shop: red dado, white with thin panel lines, soot
  const W = 2048, H = 1024, c = createCanvas(W, H), g = c.getContext('2d');
  rect(g, 0, 0, W, H, '#ddd0b4'); rect(g, 0, H * 0.72, W, H * 0.28, '#7c241a'); line(g, 0, H * 0.72, W, H * 0.72, '#e6d2a8', 4);
  for (let i = 0; i < 4; i++) frame(g, i * W / 4 + 40, H * 0.12, W / 4 - 80, H * 0.52, '#9b2318', 4);
  const s = g.createLinearGradient(0, 0, 0, H * 0.5); s.addColorStop(0, 'rgba(30,20,14,0.55)'); s.addColorStop(1, 'rgba(30,20,14,0)'); g.fillStyle = s; g.fillRect(0, 0, W, H * 0.5);
  graffiti(g, 40, H * 0.6, W - 40, H * 0.3, 18);
  weather(g, W, H, { fade: 0.1, cracks: 6, lossAmt: 2, losses: 5 });
  return c;
}

// ---------------------------------------------------------------- ground and materials
// basalt road: irregular polygonal blocks (Voronoi on a 4 m repeating tile). The cells are exported for the mesh.
export const BASALT_CELLS = { n: 9, pts: [] };
export function basaltStreet() {
  const S = 2048, n = BASALT_CELLS.n, cell = S / n, c = createCanvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  const pts = BASALT_CELLS.pts = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pts.push([(i + rr(0.15, 0.85)) / n, (j + rr(0.15, 0.85)) / n, rr(0.8, 1.14), rr(0, 99)]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const { e, best, dx, dy } = basaltCell(x / S, y / S), ep = e * S, i = (y * S + x) * 4;
    const gr = (h2(x, y) - 0.5) * 16, ves = n2(x / 3 + best[3], y / 3) > 0.86 ? 0.78 : 1;                     // vesicles in the lava
    const polish = 1 + 0.12 * clamp(1 - Math.hypot(dx, dy) * S / (cell * 0.55));                             // worn shiny crowns
    const k = ep < 4 ? 0.36 : best[2] * (0.84 + 0.2 * fbm2(x / 50 + best[3], y / 50)) * (0.8 + 0.2 * clamp(ep / 30)) * polish * ves;
    const tone = fbm2(x / 300, y / 300); let r = 70 + tone * 14, gg = 67 + tone * 10, b = 64 + tone * 6;
    if (ep < 4) { r = 92; gg = 84; b = 72; }                                                                 // dust and grit in the joints
    d[i] = r * k + gr; d[i + 1] = gg * k + gr; d[i + 2] = b * k + gr; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
// distance to the nearest joint for (u, v) in the 0..1 tile: e (edge distance), the cell, offset to its centre
export function basaltCell(u, v) {
  const n = BASALT_CELLS.n, pts = BASALT_CELLS.pts, ci = Math.floor(u * n), cj = Math.floor(v * n);
  let d1 = 1e9, d2 = 1e9, best = null, bx = 0, by = 0;
  for (let jj = -1; jj <= 1; jj++) for (let ii = -1; ii <= 1; ii++) {
    const I = ci + ii, J = cj + jj, p = pts[((J + n) % n) * n + ((I + n) % n)];
    const px = p[0] + Math.floor(I / n), py = p[1] + Math.floor(J / n), dd = Math.hypot(u - px, v - py);
    if (dd < d1) { d2 = d1; d1 = dd; best = p; bx = px; by = py; } else if (dd < d2) d2 = dd;
  }
  return { e: (d2 - d1) / 2, best, dx: u - bx, dy: v - by };
}
export function kerbStone() {             // Sarno limestone kerbs: porous, worn round on the top edge, scuffed
  const W = 2048, H = 1024, c = createCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = fbm2(x / 120, y / 120), pore = n2(x / 4, y / 4) > 0.8 ? 0.72 : 1, lay = Math.sin(y / 22 + n2(x / 80, y / 40) * 4) * 0.04;
    const col = mix([196, 184, 158], [166, 150, 122], clamp(t * 1.3 - 0.15)), k = (0.9 + 0.2 * fbm2(x / 16, y / 16) + lay) * pore + (h2(x, y) - 0.5) * 0.1;
    const i = (y * W + x) * 4; d[i] = col[0] * k; d[i + 1] = col[1] * k; d[i + 2] = col[2] * k; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 60; i++) { const x = rr(0, W), y = rr(0, H); line(g, x, y, x + rr(-60, 60), y + rr(-8, 8), 'rgba(80,66,50,0.25)', rr(2, 5)); }
  return c;
}
export function tuff() {                  // grey Nocera tuff: ash matrix with pumice and lava lapilli
  const S = 1024, c = createCanvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const t = fbm2(x / 90, y / 90), col = mix([128, 118, 104], [104, 94, 84], t), k = 0.9 + 0.18 * fbm2(x / 10, y / 10) + (h2(x, y) - 0.5) * 0.14;
    const i = (y * S + x) * 4; d[i] = col[0] * k; d[i + 1] = col[1] * k; d[i + 2] = col[2] * k; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 900; i++) dab(g, rr(0, S), rr(0, S), rr(1.5, 7), pick(['#d8d0bf', '#3a3532', '#2a2522', '#c9b89a', '#6a5040']), 0.85);
  return c;
}
export function lava() {                  // vesicular lava for millstones, stepping stones and fountain slabs
  const S = 1024, c = createCanvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const t = fbm2(x / 70, y / 70), v = n2(x / 5, y / 5), ves = v > 0.78 ? 0.45 + (0.9 - v) * 2 : 1;
    const k = (0.85 + 0.3 * fbm2(x / 12, y / 12)) * ves + (h2(x, y) - 0.5) * 0.15;
    const i = (y * S + x) * 4; d[i] = (82 + t * 20) * k; d[i + 1] = (78 + t * 16) * k; d[i + 2] = (76 + t * 12) * k; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
export function planks() {                // oak boards with grain, knots, nail heads and grey weathering (1 board = 1/4 of the width)
  const W = 1024, H = 2048, c = createCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data, bw = W / 4;
  const tones = [rr(0.85, 1.1), rr(0.85, 1.1), rr(0.85, 1.1), rr(0.85, 1.1)];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const b = Math.floor(x / bw), lx = x - b * bw, warp = n2(x / 60 + b * 7, y / 400) * 30;
    const grain = Math.sin((lx + warp) * 0.35 + n2(lx / 8, y / 90 + b) * 6) * 0.5 + 0.5, knot = clamp(1 - Math.hypot(lx - bw * 0.6, (y % 900) - 420 - b * 60) / 26);
    let k = tones[b] * (0.78 + 0.22 * grain) * (1 - knot * 0.5) + (h2(x, y) - 0.5) * 0.08;
    if (lx < 4 || lx > bw - 3) k *= 0.35;
    const grey = clamp(fbm2(x / 100, y / 150) * 1.4 - 0.4) * 0.45, col = mix([112, 76, 46], [128, 120, 108], grey);
    const i = (y * W + x) * 4; d[i] = col[0] * k; d[i + 1] = col[1] * k; d[i + 2] = col[2] * k; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let b = 0; b < 4; b++) for (const y of [180, 1024, 1860]) { dab(g, b * bw + bw * 0.3, y, 7, '#2a2420', 1, 0, 1); dab(g, b * bw + bw * 0.7, y, 7, '#2a2420', 1, 0, 1); dab(g, b * bw + bw * 0.3 - 2, y - 2, 2.5, '#8a8078', 1, 0, 1); }
  return c;
}
export function counterVeneer() {         // tavern counter: fragments of coloured marble set in white mortar (opus sectile scraps)
  const S = 1024, c = createCanvas(S, S), g = c.getContext('2d');
  rect(g, 0, 0, S, S, '#ddd5c4');
  const kinds = [['#e6e0d4', '#9a938a'], ['#5f7a4a', '#c9d8b0'], ['#b04a32', '#e8c0a8'], ['#d9b45a', '#8a6a2a'], ['#6a5a7a', '#c0b0d0'], ['#2a2624', '#8a8078'], ['#c97a52', '#f0d0b0']];
  for (let i = 0; i < 1400; i++) {
    const x = rr(-40, S), y = rr(-40, S), w = rr(30, 100), h = rr(24, 80), [base, vein] = pick(kinds);
    const tc = createCanvas(Math.ceil(w), Math.ceil(h)), tg = tc.getContext('2d'); marblePaint(tg, 0, 0, w, h, base, vein, { scale: 1 / 40 });
    g.save(); g.beginPath(); const nn = Math.floor(rr(4, 7)); for (let k = 0; k < nn; k++) { const a = k / nn * 6.28 + rr(-0.3, 0.3); g.lineTo(x + w / 2 + Math.cos(a) * w / 2 * rr(0.7, 1), y + h / 2 + Math.sin(a) * h / 2 * rr(0.7, 1)); } g.closePath(); g.clip();
    g.drawImage(tc, x, y); g.restore();
  }
  return c;
}
export function brickWork() {             // opus vittatum: courses of tuff blocks and brick, mortar joints
  const S = 1024, c = createCanvas(S, S), g = c.getContext('2d');
  rect(g, 0, 0, S, S, '#b8ab94');
  for (let row = 0, y = 0; y < S; row++) {
    const brick = row % 4 >= 2, h = brick ? 44 : 84, w = brick ? 180 : 140;
    for (let x = row % 2 ? -w / 2 : 0; x < S; x += w) rect(g, x + 5, y + 5, w - 10, h - 10, brick ? rgb(shade(hex('#a5532f'), rr(0.85, 1.1))) : rgb(shade(hex('#8f877a'), rr(0.85, 1.12))));
    y += h;
  }
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < S * S; i++) { const k = 0.9 + 0.2 * fbm2((i % S) / 14, Math.floor(i / S) / 14); d[i * 4] *= k; d[i * 4 + 1] *= k; d[i * 4 + 2] *= k; }
  g.putImageData(img, 0, 0);
  return c;
}
