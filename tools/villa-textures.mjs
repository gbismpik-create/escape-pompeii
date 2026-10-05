// High-resolution painted textures for the Pompeii house, following the four Pompeian styles:
//   First style  – stucco blocks painted as coloured marble (Samnite houses, Villa of Ariadne)
//   Second style – illusionistic architecture: columns, podium, openings to sky (Boscoreale, Oplontis)
//   Third style  – flat monochrome fields, hair-thin candelabra, tiny floating landscapes (Boscotrecase)
//   Fourth style – red/yellow panels with floating figures, fantasy architecture vistas, white upper zone (House of the Vettii)
// plus a garden room (Villa of Livia), a white bath wall, mosaics and nature textures.
// Wall textures are 4096 x 2048 and cover 4 m of wall width and the full wall height.
import { createCanvas } from '@napi-rs/canvas';

let seed = 5;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rr = (a, b) => a + (b - a) * rnd();
const pick = a => a[Math.floor(rnd() * a.length)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
function h2(x, y) { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); }
function n2(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(h2(xi, yi), h2(xi + 1, yi), u), lerp(h2(xi, yi + 1), h2(xi + 1, yi + 1), u), v); }
const fbm2 = (x, y) => 0.5 * n2(x, y) + 0.25 * n2(x * 2.1, y * 2.1) + 0.125 * n2(x * 4.3, y * 4.3) + 0.0625 * n2(x * 8.7, y * 8.7);
const hex = c => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// Pompeian palette (cinnabar & red ochre, yellow ochre, Egyptian blue, green earth, carbon black, lime white)
const P = { cinnabar: '#9b2318', redOchre: '#8a3a22', yellow: '#c9952f', black: '#17110e', white: '#ece3cf', blue: '#3b6e8f', green: '#4f6b3a', purple: '#5a2e3a', cream: '#e6d6b2' };

// ---------------------------------------------------------------- brush helpers
const line = (g, x1, y1, x2, y2, c, w = 2) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
function dab(g, x, y, r, c, a = 0.9, rot = null, sq = null) { g.globalAlpha = a; g.fillStyle = c; g.beginPath(); g.ellipse(x, y, r, r * (sq ?? rr(0.45, 0.85)), rot ?? rr(0, 3.14), 0, 6.283); g.fill(); g.globalAlpha = 1; }
function rect(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
function frame(g, x, y, w, h, c, lw = 3) { g.strokeStyle = c; g.lineWidth = lw; g.strokeRect(x, y, w, h); }
// lime-plaster surface: grain, fading blotches, hairline cracks, small losses near the floor
function weather(g, W, H, opts = {}) {
  // soften hard vector edges as a brush would
  const tmp = createCanvas(W, H), tg = tmp.getContext('2d'); tg.drawImage(g.canvas, 0, 0);
  g.globalAlpha = 0.75; g.filter = `blur(${(W / 2048).toFixed(1)}px)`; g.drawImage(tmp, 0, 0); g.filter = 'none'; g.globalAlpha = 1;
  const img = g.getImageData(0, 0, W, H), d = img.data, sc = 4096 / W, plaster = [203, 186, 156], loss = opts.lossAmt ?? 1;
  const ox = rr(0, 500), oy = rr(0, 500);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const i = (y * W + x) * 4, X = x * sc, Y = y * sc;
    // brushwork: short anisotropic strokes, plus fine plaster grain
    const stroke = (n2(X / 26 + ox + n2(X / 200, Y / 200) * 6, Y / 9) - 0.5) * 0.06 + (n2(X / 12, Y / 40 + oy) - 0.5) * 0.04;
    const grain = (h2(X * 0.7, Y * 0.7) - 0.5) * 14 + (n2(X / 90, Y / 90) - 0.5) * 20;
    let r = d[i] * (1 + stroke) + grain, gg = d[i + 1] * (1 + stroke) + grain, b = d[i + 2] * (1 + stroke) + grain;
    // pigment fading towards chalky light tones
    const fade = clamp((fbm2(X / 380 + ox, Y / 380) - 0.45) * 0.9) * 0.22;
    const lum = (r + gg + b) / 3; r = lerp(r, lum * 1.12 + 18, fade); gg = lerp(gg, lum * 1.1 + 16, fade); b = lerp(b, lum * 1.05 + 12, fade);
    // lamp soot near the ceiling
    const soot = clamp(1 - Y / 900) * 0.18; r *= 1 - soot; gg *= 1 - soot; b *= 1 - soot * 0.9;
    // paint loss revealing intonaco (more near the floor), with a dark rim
    const m = fbm2(X / 70 + oy, Y / 70 + ox) + (h2(X * 0.31, Y * 0.29) - 0.5) * 0.04 + clamp((Y / (H * sc) - 0.88) * 8) * 0.12;
    const th = 0.84 - 0.03 * loss;
    if (m > th) { const t = clamp((m - th) * 30); const pc = plaster.map(v => v + grain * 0.6); r = lerp(r * 0.72, pc[0], t); gg = lerp(gg * 0.72, pc[1], t); b = lerp(b * 0.72, pc[2], t); }
    d[i] = r; d[i + 1] = gg; d[i + 2] = b;
  }
  g.putImageData(img, 0, 0);
  g.globalAlpha = opts.fade ?? 0.08;
  for (let i = 0; i < 420 * W * H / 8388608; i++) {
    const x = rnd() * W, y = rnd() * H, r = rr(40, 300), gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rnd() < 0.55 ? 'rgba(255,246,228,0.7)' : 'rgba(45,30,20,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(35,24,16,0.22)'; g.lineWidth = 1.2;
  for (let i = 0; i < (opts.cracks ?? 6); i++) { let x = rnd() * W, y = rnd() * H; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 30; k++) { x += rr(-20, 20); y += rr(-6, 24); g.lineTo(x, y); } g.stroke(); }
  for (let i = 0; i < (opts.losses ?? 0); i++) {
    const x = rnd() * W, y = H - rr(0, H * 0.14), r = rr(14, 60);
    g.fillStyle = 'rgba(196,178,148,0.92)'; g.beginPath();
    for (let a = 0; a < 6.28; a += 0.35) g.lineTo(x + Math.cos(a) * r * rr(0.6, 1.25), y + Math.sin(a) * r * rr(0.6, 1.25)); g.fill();
    g.strokeStyle = 'rgba(80,60,40,0.4)'; g.lineWidth = 2; g.stroke();
  }
}
// painted imitation marble filling a rectangle (pixel level)
function marble(g, x0, y0, w, h, base, vein, opts = {}) {
  x0 |= 0; y0 |= 0; w |= 0; h |= 0; if (w < 2 || h < 2) return;
  const img = g.getImageData(x0, y0, w, h), d = img.data, b = hex(base), v = hex(vein), s = opts.scale ?? 1 / 160, k = opts.seed ?? rr(0, 99), ang = opts.angle ?? rr(-0.8, 0.8);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = (x * ca - y * sa) * s + k, Y = (x * sa + y * ca) * s;
    const t = fbm2(X * 1.3, Y * 1.3);
    const veinV = Math.abs(Math.sin((X + t * 4.5) * 3.1));
    let c = mix(b, shade(b, 0.82), t);
    if (opts.breccia) { const cell = n2(X * 3, Y * 3); c = mix(c, shade(b, cell > 0.6 ? 1.18 : 0.75), 0.5); }
    c = mix(c, v, clamp(1 - veinV * 14) * 0.75 + clamp(1 - veinV * 40) * 0.25);
    const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  g.putImageData(img, x0, y0);
}
// stucco relief edge: light top-left, shadow bottom-right
function bevel(g, x, y, w, h, b = 10) {
  g.fillStyle = 'rgba(255,250,235,0.35)'; g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w - b, y + b); g.lineTo(x + b, y + b); g.lineTo(x + b, y + h - b); g.closePath(); g.fill();
  g.fillStyle = 'rgba(20,12,8,0.35)'; g.beginPath(); g.moveTo(x + w, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.lineTo(x + b, y + h - b); g.lineTo(x + w - b, y + h - b); g.lineTo(x + w - b, y + b); g.closePath(); g.fill();
}
// shaded painted column (fluted shaft, base, capital)
function paintedColumn(g, cx, yTop, yBot, r, col, opts = {}) {
  const c = hex(col), gr = g.createLinearGradient(cx - r, 0, cx + r, 0);
  gr.addColorStop(0, rgb(shade(c, 0.45))); gr.addColorStop(0.35, rgb(shade(c, 1.15))); gr.addColorStop(0.55, rgb(shade(c, 1.0))); gr.addColorStop(1, rgb(shade(c, 0.4)));
  g.fillStyle = gr; g.fillRect(cx - r, yTop, 2 * r, yBot - yTop);
  if (opts.flutes !== false) for (let i = 1; i < 8; i++) { const x = cx - r + (2 * r) * i / 8; line(g, x, yTop + 10, x, yBot - 10, rgb(shade(c, 0.6), 0.5), 2); }
  // base and capital
  g.fillStyle = rgb(shade(c, 0.9)); g.fillRect(cx - r * 1.35, yBot - r * 0.5, r * 2.7, r * 0.5);
  g.fillStyle = rgb(shade(c, 0.6)); g.fillRect(cx - r * 1.35, yBot - r * 0.12, r * 2.7, r * 0.12);
  const cap = opts.capCol ? hex(opts.capCol) : shade(c, 1.1);
  g.fillStyle = rgb(cap); g.beginPath(); g.moveTo(cx - r, yTop); g.lineTo(cx + r, yTop); g.lineTo(cx + r * 1.6, yTop - r * 0.7); g.lineTo(cx - r * 1.6, yTop - r * 0.7); g.fill();
  g.fillStyle = rgb(shade(cap, 0.8)); g.fillRect(cx - r * 1.8, yTop - r * 1.0, r * 3.6, r * 0.32);
  if (opts.ionic) for (const s of [-1, 1]) { g.strokeStyle = rgb(shade(cap, 0.6)); g.lineWidth = 3; g.beginPath(); g.arc(cx + s * r * 1.3, yTop - r * 0.45, r * 0.35, 0, 6.28); g.stroke(); }
}
// leafy painted plant / tree (thousands of dabs, light from upper left)
function paintedTree(g, x, yBase, h, kind = 'laurel') {
  const trunkC = '#5a4330';
  line(g, x, yBase, x + rr(-10, 10), yBase - h * 0.55, trunkC, h * 0.035);
  for (let b = 0; b < 5; b++) { const by = yBase - h * rr(0.3, 0.55); line(g, x, by, x + rr(-h * 0.25, h * 0.25), by - h * rr(0.1, 0.25), trunkC, h * 0.012); }
  const pal = { laurel: ['#2f4a2a', '#3f5e33', '#56753f', '#6f8d4c'], pine: ['#2a3f2a', '#36502f', '#4b6a3a'], quince: ['#3d5a2e', '#55743d', '#7a9450'], oleander: ['#3f5e3a', '#56754a', '#6f8a55'] }[kind];
  const cy = yBase - h * 0.7, R = h * (kind === 'pine' ? 0.42 : 0.33);
  for (let i = 0; i < h * 11; i++) {
    const a = rr(0, 6.28), d = Math.sqrt(rnd()) * R, x2 = x + Math.cos(a) * d * 1.15, y2 = cy + Math.sin(a) * d * (kind === 'pine' ? 0.45 : 0.85);
    const lit = clamp(0.5 - (x2 - x) / (R * 3) - (y2 - cy) / (R * 2));
    const c = pal[Math.min(pal.length - 1, Math.floor(lit * pal.length + rnd() * 1.2))];
    dab(g, x2, y2, rr(3, 7) * (h / 400 + 0.6), c, 0.85, rr(-0.8, 0.8), 0.45);
  }
  if (kind === 'quince') for (let i = 0; i < 26; i++) { const a = rr(0, 6.28), d = rnd() * R; dab(g, x + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, h * 0.016, pick(['#e3b23a', '#d9a02a', '#c9802a']), 1, 0, 0.9); }
  if (kind === 'oleander') for (let i = 0; i < 70; i++) { const a = rr(0, 6.28), d = rnd() * R; dab(g, x + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, h * 0.01, pick(['#e690a8', '#f2c0cf', '#d0607e']), 1); }
}
function bird(g, x, y, s, col, flying = false) {
  dab(g, x, y, 14 * s, col, 1, 0.2, 0.6); dab(g, x + 12 * s, y - 6 * s, 7 * s, col, 1, 0, 1);
  g.fillStyle = '#2a2018'; g.beginPath(); g.moveTo(x + 18 * s, y - 6 * s); g.lineTo(x + 25 * s, y - 4 * s); g.lineTo(x + 18 * s, y - 3 * s); g.fill();
  if (flying) { g.fillStyle = col; g.beginPath(); g.moveTo(x - 4 * s, y - 4 * s); g.quadraticCurveTo(x - 10 * s, y - 34 * s, x + 6 * s, y - 30 * s); g.lineTo(x + 4 * s, y - 2 * s); g.fill(); }
  else line(g, x - 12 * s, y + 2 * s, x - 26 * s, y + 8 * s, col, 6 * s);
  dab(g, x + 14 * s, y - 8 * s, 1.6 * s, '#111', 1, 0, 1);
}
// small classical figure: floating maenad/cupid or standing figure, impressionistic
function figure(g, x, y, s, drape, kind = 'float') {
  const skin = [196, 140, 100], d = hex(drape);
  g.save(); g.translate(x, y); g.scale(s, s);
  const grad = (c, x0, x1) => { const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, rgb(shade(c, 1.25))); gr.addColorStop(0.45, rgb(c)); gr.addColorStop(1, rgb(shade(c, 0.55))); return gr; };
  const limb = (pts, w) => { g.strokeStyle = grad(skin, -w, w); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = w; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]); g.stroke(); g.strokeStyle = 'rgba(90,50,30,0.35)'; g.lineWidth = 1.5; g.stroke(); };
  const head = (hx, hy, r, hair = '#3a2216') => {
    g.fillStyle = grad(skin, hx - r, hx + r); g.beginPath(); g.ellipse(hx, hy, r * 0.85, r, 0, 0, 6.28); g.fill();
    g.fillStyle = hair; g.beginPath(); g.ellipse(hx - r * 0.1, hy - r * 0.45, r * 0.95, r * 0.6, -0.2, Math.PI * 0.95, Math.PI * 2.1); g.fill();
    g.beginPath(); g.ellipse(hx - r * 0.75, hy - r * 0.1, r * 0.35, r * 0.4, 0, 0, 6.28); g.fill();          // bun
    dab(g, hx + r * 0.35, hy - r * 0.05, r * 0.1, '#2a1a10', 1, 0, 1); line(g, hx + r * 0.5, hy + r * 0.2, hx + r * 0.75, hy + r * 0.25, 'rgba(90,40,30,0.6)', 1.5);
    dab(g, hx + r * 0.4, hy + r * 0.35, r * 0.18, 'rgba(200,90,70,0.35)', 1, 0, 1);
  };
  if (kind === 'cupid') {
    for (const sx of [-1, 1]) { g.fillStyle = 'rgba(236,226,206,0.9)'; g.beginPath(); g.moveTo(0, -40); g.bezierCurveTo(sx * 40, -110, sx * 80, -70, sx * 72, -28); g.quadraticCurveTo(sx * 34, -46, 0, -30); g.fill(); g.strokeStyle = 'rgba(120,100,80,0.5)'; g.lineWidth = 1.5; g.stroke(); for (let k = 0; k < 4; k++) line(g, sx * (20 + k * 12), -40 - k * 6, sx * (34 + k * 12), -60 - k * 8, 'rgba(150,130,110,0.5)', 1.2); }
    g.fillStyle = grad(skin, -26, 26); g.beginPath(); g.ellipse(0, -18, 24, 30, 0, 0, 6.28); g.fill();
    limb([-10, 6, -18, 26, -24, 44], 13); limb([10, 6, 18, 24, 22, 42], 13); limb([-16, -34, -36, -44, -50, -54], 9); limb([16, -34, 34, -24, 44, -12], 9);
    head(0, -60, 18, '#7a4a22');
  } else {
    const fl = kind === 'float' ? 1 : 0, dl = shade(d, 1.3), dd = shade(d, 0.55);
    // billowing mantle behind the figure
    if (fl) { g.fillStyle = rgb(shade(d, 1.15), 0.8); g.beginPath(); g.moveTo(-14, -108); g.bezierCurveTo(-90, -190, -190, -110, -170, -40); g.bezierCurveTo(-120, -90, -60, -80, -20, -60); g.closePath(); g.fill(); g.strokeStyle = rgb(dd, 0.5); g.lineWidth = 2; g.stroke(); }
    // legs under the chiton (one bare leg kicking back when floating)
    limb(fl ? [6, 40, 30, 80, 56, 96] : [-10, 50, -12, 96], 12); limb(fl ? [-8, 40, -30, 76, -56, 74] : [12, 50, 16, 94], 12);
    // chiton with a waist and flaring hem
    const gr = g.createLinearGradient(-60, 0, 60, 0); gr.addColorStop(0, rgb(dl)); gr.addColorStop(0.5, rgb(d)); gr.addColorStop(1, rgb(dd)); g.fillStyle = gr;
    g.beginPath(); g.moveTo(-18, -112); g.bezierCurveTo(-34, -80, -24, -54, -22, -42); g.bezierCurveTo(-40, -6, -56 - fl * 30, 40, -64 - fl * 40, 62 - fl * 6);
    g.quadraticCurveTo(-10, 76, 58 + fl * 46, 58 - fl * 10); g.bezierCurveTo(46, 30, 30, -6, 22, -42); g.bezierCurveTo(26, -56, 32, -84, 18, -112); g.closePath(); g.fill();
    g.strokeStyle = rgb(shade(d, 0.4), 0.6); g.lineWidth = 2; g.stroke();
    // folds: dark grooves with light ridges beside them
    for (let k = 0; k < 9; k++) { const t = k / 8, fx = lerp(-40, 40, t); for (const [off, c, w] of [[0, rgb(dd, 0.55), 3], [5, rgb(dl, 0.5), 2]]) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(fx * 0.3 + off, -40); g.quadraticCurveTo(fx * 0.8 + off + fl * 10, 10, fx * 1.25 + off + fl * 24, 60); g.stroke(); } }
    line(g, -24, -44, 24, -44, rgb(shade(d, 0.4)), 4);                                  // girdle
    // arms and shoulders
    g.fillStyle = grad(skin, -20, 20); g.beginPath(); g.ellipse(0, -112, 20, 8, 0, 0, 6.28); g.fill();
    limb(fl ? [-18, -106, -40, -134, -50, -164] : [-18, -106, -30, -70, -24, -40], 9);
    limb(fl ? [18, -106, 44, -88, 70, -70] : [18, -106, 34, -76, 52, -88], 9);
    limb([0, -114, 0, -128], 11);
    head(2, -142, 15);
    if (fl) { g.strokeStyle = '#d9b866'; g.lineWidth = 3; g.beginPath(); g.ellipse(-52, -168, 14, 6, 0.3, 0, 6.28); g.stroke(); }   // a plate/tambourine
    else line(g, 52, -88, 60, 10, '#7a5a30', 4);                                          // a staff
  }
  g.restore();
}
// framed picture: sacral-idyllic landscape, still life, or a mythological pair
function picture(g, x, y, w, h, kind = 'landscape', frameCol = '#2a1e16') {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  if (kind === 'still') {
    rect(g, x, y, w, h, '#cdb68c'); rect(g, x, y + h * 0.6, w, h * 0.4, '#a9895c'); line(g, x, y + h * 0.6, x + w, y + h * 0.6, '#6a5236', 3);
    g.fillStyle = 'rgba(205,225,220,0.55)'; g.beginPath(); g.ellipse(x + w * 0.34, y + h * 0.5, w * 0.17, h * 0.18, 0, 0, Math.PI); g.fill();
    for (let i = 0; i < 16; i++) dab(g, x + w * rr(0.21, 0.47), y + h * rr(0.42, 0.56), w * 0.028, pick(['#b8432a', '#d9a034', '#6f8a3a', '#8d2f4a', '#e8c86a']), 1, 0, 0.95);
    g.fillStyle = '#7a4024'; g.beginPath(); g.ellipse(x + w * 0.72, y + h * 0.47, w * 0.075, h * 0.14, 0, 0, 6.28); g.fill(); rect(g, x + w * 0.7, y + h * 0.27, w * 0.04, h * 0.1, '#7a4024');
    dab(g, x + w * 0.705, y + h * 0.44, w * 0.02, '#c9905a', 0.6);
    bird(g, x + w * 0.86, y + h * 0.56, w / 500, '#6a5a48');
  } else if (kind === 'myth') {
    const sky = g.createLinearGradient(0, y, 0, y + h); sky.addColorStop(0, '#8aa6b4'); sky.addColorStop(1, '#d9c9a4'); g.fillStyle = sky; g.fillRect(x, y, w, h);
    rect(g, x + w * 0.6, y + h * 0.15, w * 0.32, h * 0.6, '#d9ccb0'); for (let i = 0; i < 4; i++) line(g, x + w * (0.63 + i * 0.09), y + h * 0.18, x + w * (0.63 + i * 0.09), y + h * 0.74, '#a99572', 4);
    rect(g, x, y + h * 0.75, w, h * 0.25, '#b39a72');
    figure(g, x + w * 0.32, y + h * 0.7, w / 520, '#9a3a2a', 'stand'); figure(g, x + w * 0.52, y + h * 0.72, w / 560, '#d9c9a0', 'stand');
    paintedTree(g, x + w * 0.12, y + h * 0.78, h * 0.6, 'laurel');
  } else {
    const sky = g.createLinearGradient(0, y, 0, y + h); sky.addColorStop(0, '#9db6c2'); sky.addColorStop(0.6, '#e0d4b4'); sky.addColorStop(1, '#c4ae84'); g.fillStyle = sky; g.fillRect(x, y, w, h);
    g.fillStyle = '#9aa38a'; g.beginPath(); g.moveTo(x, y + h * 0.58); for (let i = 0; i <= 20; i++) g.lineTo(x + w * i / 20, y + h * (0.5 + 0.05 * Math.sin(i * 1.3) + rr(-0.02, 0.02))); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.fill();
    rect(g, x, y + h * 0.74, w, h * 0.26, '#c2ad84');
    const sx = x + w * rr(0.35, 0.55), sy = y + h * 0.4;
    rect(g, sx, sy, w * 0.2, h * 0.3, '#efe5d0'); g.fillStyle = '#b39b74'; g.beginPath(); g.moveTo(sx - 6, sy); g.lineTo(sx + w * 0.1, sy - h * 0.1); g.lineTo(sx + w * 0.2 + 6, sy); g.fill();
    for (let i = 0; i < 4; i++) line(g, sx + 5 + i * w * 0.055, sy + 2, sx + 5 + i * w * 0.055, sy + h * 0.3, '#a99572', 3);
    rect(g, sx + w * 0.06, sy + h * 0.3, w * 0.08, h * 0.05, '#9a8a72');   // altar
    for (let t = 0; t < 3; t++) paintedTree(g, x + w * rr(0.05, 0.95), y + h * 0.76, h * rr(0.45, 0.65), pick(['laurel', 'pine']));
    for (let i = 0; i < 3; i++) { const fx = x + w * rr(0.12, 0.88), fy = y + h * 0.86; line(g, fx, fy, fx, fy - h * 0.1, '#5a3a2a', 4); dab(g, fx, fy - h * 0.12, 4, '#5a3a2a', 1, 0, 1); }
    for (let i = 0; i < 3; i++) dab(g, x + w * rr(0.1, 0.9), y + h * 0.88, 6, '#e8e0d0', 1, 0, 0.6);    // sheep
  }
  g.restore();
  frame(g, x, y, w, h, frameCol, 6); frame(g, x - 10, y - 10, w + 20, h + 20, 'rgba(240,225,190,0.6)', 2);
}
// candelabrum: hair-thin vertical ornament with discs, tendrils and tiny figures (Third style)
function candelabrum(g, x, y0, y1, c = '#d9c08a', w = 3) {
  line(g, x, y0, x, y1, c, w);
  for (let y = y0 + 40; y < y1 - 30; y += rr(70, 120)) {
    g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rr(10, 22), 4, 0, 0, 6.28); g.fill();
    if (rnd() < 0.5) for (const s of [-1, 1]) { g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + s * 30, y - 10, x + s * 26, y - 34); g.stroke(); dab(g, x + s * 26, y - 36, 4, c, 1, 0, 1); }
  }
  g.fillStyle = c; g.beginPath(); g.moveTo(x - 24, y0 + 10); g.lineTo(x + 24, y0 + 10); g.lineTo(x, y0 - 22); g.fill();
}
function garland(g, x0, x1, y, sag = 40) {
  for (let t = 0; t <= 1; t += 0.008) {
    const x = lerp(x0, x1, t), yy = y + Math.sin(t * Math.PI) * sag;
    dab(g, x, yy, 7, pick(['#4f6b3a', '#6b8a4a', '#3f5a30']), 0.9);
    if (rnd() < 0.12) dab(g, x, yy + 4, 5, pick(['#b8432a', '#e3b23a', '#e8e0d0']), 1, 0, 1);
  }
  line(g, x0, y, x0, y + 30, '#b8432a', 3); line(g, x1, y, x1, y + 30, '#b8432a', 3);
}
// fantasy architecture vista (Fourth style intercolumn / upper zone)
function vista(g, x, y, w, h, bg, ink) {
  rect(g, x, y, w, h, bg);
  const cx = x + w / 2, hz = y + h * 0.45;
  // receding thin columns and a pavilion roof in perspective
  for (let i = 0; i < 4; i++) {
    const t = i / 3, xl = lerp(x + w * 0.1, cx - w * 0.08, t), xr = lerp(x + w * 0.9, cx + w * 0.08, t), top = lerp(y + h * 0.15, hz - h * 0.1, t), bot = lerp(y + h * 0.95, hz + h * 0.25, t);
    line(g, xl, top, xl, bot, ink, lerp(5, 2, t)); line(g, xr, top, xr, bot, ink, lerp(5, 2, t));
    line(g, xl, top, xr, top, ink, lerp(4, 1.5, t));
  }
  g.strokeStyle = ink; g.lineWidth = 3; g.beginPath(); g.moveTo(x + w * 0.1, y + h * 0.15); g.lineTo(cx, y + h * 0.04); g.lineTo(x + w * 0.9, y + h * 0.15); g.stroke();
  line(g, x + w * 0.1, y + h * 0.95, x + w * 0.9, y + h * 0.95, ink, 4);
  for (let i = 0; i < 6; i++) line(g, x + w * (0.12 + i * 0.15), y + h * 0.95, x + w * (0.12 + i * 0.15), y + h * 0.88, ink, 2);   // balustrade
  // a small statue on a pedestal in the middle distance
  rect(g, cx - 10, hz + h * 0.1, 20, 30, ink); dab(g, cx, hz + h * 0.05, 9, ink, 1, 0, 2.2);
}

// ================================================================== WALL STYLES
const W = 4096, H = 2048;
const zone = { dado: H * 0.83, main: H * 0.3 };     // y from top: dado starts at 83% down, upper zone above 30%

// FIRST STYLE: painted stucco blocks imitating coloured marble
export function firstStyle() {
  const c = createCanvas(W, H), g = c.getContext('2d');
  rect(g, 0, 0, W, H, '#e2d6bb');
  // plinth
  marble(g, 0, H * 0.9, W, H * 0.1, '#3a2a24', '#c9b89a', { scale: 1 / 120 });
  // tall orthostats in alternating marbles
  const ortho = [['#c9a24a', '#8a5a2a'], ['#8f2a22', '#e0b8a0'], ['#d8d0c4', '#5a4a6a'], ['#3f5a3a', '#cfd8b8']];
  const ow = W / 6;
  for (let i = 0; i < 6; i++) { const [b, v] = ortho[i % 4]; marble(g, i * ow + 6, H * 0.58, ow - 12, H * 0.32 - 6, b, v, { breccia: i % 4 === 1 }); bevel(g, i * ow + 6, H * 0.58, ow - 12, H * 0.32 - 6, 14); }
  // stringcourse
  rect(g, 0, H * 0.55, W, H * 0.03, '#efe5cf'); bevel(g, 0, H * 0.55, W, H * 0.03, 8);
  // isodomic courses of drafted blocks
  const rows = [[H * 0.42, H * 0.13], [H * 0.29, H * 0.13], [H * 0.16, H * 0.13]];
  rows.forEach(([y, hh], r) => {
    const bw = W / 5, off = r % 2 ? bw / 2 : 0;
    for (let x = -off; x < W; x += bw) {
      const [b, v] = r === 1 ? pick([['#b8463a', '#e8c0a8'], ['#c9a24a', '#7a5228'], ['#5a2e3a', '#d8b8c0']]) : [['#e8dfcc', '#b0a28a'], ['#ddd2bd', '#a99a80']][(x / bw | 0) & 1];
      marble(g, x + 5, y + 5, bw - 10, hh - 10, b, v, { scale: 1 / 200 }); bevel(g, x + 5, y + 5, bw - 10, hh - 10, 10);
    }
  });
  // dentil cornice at the top
  rect(g, 0, H * 0.08, W, H * 0.08, '#efe5cf');
  for (let x = 0; x < W; x += 36) { rect(g, x, H * 0.12, 22, H * 0.035, '#d8cbb0'); rect(g, x + 22, H * 0.12, 4, H * 0.035, 'rgba(40,25,15,0.3)'); }
  line(g, 0, H * 0.16, W, H * 0.16, 'rgba(40,25,15,0.4)', 4);
  weather(g, W, H, { fade: 0.06 });
  return c;
}

// SECOND STYLE: illusionistic architecture (after Oplontis and Boscoreale)
export function secondStyle() {
  const c = createCanvas(W, H), g = c.getContext('2d');
  // back wall: deep red orthostats between which openings show sky and a receding colonnade
  rect(g, 0, 0, W, H, '#7c1f16');
  const unit = W / 2;
  for (let u = 0; u < 2; u++) {
    const x0 = u * unit;
    // central opening with sky and a tholos in perspective
    const ox = x0 + unit * 0.3, ow = unit * 0.4, oy = H * 0.12, oh = H * 0.42;
    const sky = g.createLinearGradient(0, oy, 0, oy + oh); sky.addColorStop(0, '#7f9fb8'); sky.addColorStop(1, '#d8d0bc'); g.fillStyle = sky; g.fillRect(ox, oy, ow, oh);
    const tcx = ox + ow / 2, tcy = oy + oh * 0.66, top = tcy - oh * 0.36, rx = ow * 0.3;
    for (let i = 0; i < 6; i++) paintedTree(g, ox + rr(0, ow), oy + oh * 0.62, oh * rr(0.35, 0.55), pick(['pine', 'laurel']));
    rect(g, ox, tcy - oh * 0.04, ow, oh * 0.4, '#b8a07a');
    g.fillStyle = '#d8c8a6'; g.beginPath(); g.ellipse(tcx, tcy + oh * 0.04, rx * 1.12, oh * 0.05, 0, 0, 6.28); g.fill();          // stylobate
    const cols = []; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283 + 0.13; cols.push([Math.cos(a), Math.sin(a)]); }
    cols.sort((p, q) => p[1] - q[1]);
    for (const [cx2, sz] of cols) { const yb = tcy + oh * 0.04 + sz * oh * 0.03, yt = top + sz * oh * 0.03; paintedColumn(g, tcx + cx2 * rx, yt, yb, 6.5, sz < 0 ? '#bfae8a' : '#f2e8d2', { flutes: false }); }
    g.fillStyle = '#e6d8b8'; g.fillRect(tcx - rx * 1.1, top - oh * 0.07, rx * 2.2, oh * 0.06); g.fillStyle = '#a8946e'; g.fillRect(tcx - rx * 1.1, top - oh * 0.016, rx * 2.2, oh * 0.012);
    const dg = g.createLinearGradient(tcx - rx, 0, tcx + rx, 0); dg.addColorStop(0, '#d0bc94'); dg.addColorStop(0.4, '#b89e74'); dg.addColorStop(1, '#7a6648'); g.fillStyle = dg;
    g.beginPath(); g.ellipse(tcx, top - oh * 0.07, rx * 1.1, oh * 0.2, 0, Math.PI, 0); g.fill();
    dab(g, tcx, top - oh * 0.28, 10, '#b89e74', 1, 0, 1.4);
    // side orthostats: purple and yellow panels with marble frames
    for (const [px, pw] of [[x0 + unit * 0.06, unit * 0.2], [x0 + unit * 0.74, unit * 0.2]]) {
      rect(g, px, H * 0.18, pw, H * 0.36, '#4e1f2a'); marble(g, px + 18, H * 0.2, pw - 36, H * 0.32, '#c9a24a', '#7a4a20', { scale: 1 / 140 }); bevel(g, px + 18, H * 0.2, pw - 36, H * 0.32, 10);
    }
    // painted cornice in perspective with dentils, then a theatrical mask and peacock on it
    const cy = H * 0.12;
    rect(g, x0, cy - 30, unit, 30, '#e2d4b4'); rect(g, x0, cy, unit, 14, '#8a7a5a');
    for (let x = x0; x < x0 + unit; x += 28) rect(g, x, cy - 24, 16, 18, '#b8a888');
    // mask
    const mx = x0 + unit * 0.16;
    dab(g, mx, cy - 70, 40, '#e8d8bc', 1, 0, 1.2); dab(g, mx - 14, cy - 78, 7, '#1a1410', 1, 0, 1); dab(g, mx + 14, cy - 78, 7, '#1a1410', 1, 0, 1); dab(g, mx, cy - 50, 12, '#1a1410', 1, 0, 0.7);
    for (let i = 0; i < 18; i++) dab(g, mx + rr(-46, 46), cy - 110 + rr(-10, 10), 8, '#6a3a1e', 1);
    // peacock
    const px = x0 + unit * 0.84, py = cy - 40;
    for (let i = 0; i < 40; i++) { const a = rr(Math.PI * 0.8, Math.PI * 1.25), d = rr(30, 140); dab(g, px + Math.cos(a) * d, py + Math.sin(a) * d * 0.3 + 20, 7, pick(['#2a6a5a', '#3a8a6a', '#2a4a7a']), 1); if (rnd() < 0.3) dab(g, px + Math.cos(a) * d, py + Math.sin(a) * d * 0.3 + 20, 4, '#e3b23a', 1, 0, 1); }
    dab(g, px, py, 22, '#2a5a8a', 1, 0.3, 0.6); dab(g, px + 18, py - 30, 8, '#2a5a8a', 1, 0, 1); line(g, px + 10, py - 10, px + 18, py - 26, '#2a5a8a', 8);
  }
  // projecting podium (dado) in perspective
  const py0 = H * 0.68;
  rect(g, 0, py0, W, H * 0.04, '#e8dcc0');                                        // podium top (lit)
  rect(g, 0, py0 + H * 0.04, W, H * 0.28, '#2a201c');
  for (let i = 0; i < 8; i++) { marble(g, i * W / 8 + 20, py0 + H * 0.07, W / 8 - 40, H * 0.2, i % 2 ? '#5a2e3a' : '#c9a24a', '#e8d8c0', { scale: 1 / 110 }); bevel(g, i * W / 8 + 20, py0 + H * 0.07, W / 8 - 40, H * 0.2, 10); }
  rect(g, 0, H * 0.97, W, H * 0.03, '#1a1410');
  // foreground columns standing on the podium (strong light from the left), cast shadows on the wall
  for (let u = 0; u < 4; u++) {
    const x = u * W / 4 + (u % 2 ? W / 4 * 0.5 : 0) * 0 + (u * W / 4 === 0 ? 70 : 0) + (u ? 0 : 0);
    const cx = (u + 0.5) * W / 4 - (u % 2 ? 0 : 0);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(cx + 30, H * 0.06, 60, py0 - H * 0.06);
    paintedColumn(g, cx, H * 0.08, py0 + 4, 34, '#d8c49a', { capCol: '#e8dcbc' });
  }
  // architrave across the top
  rect(g, 0, 0, W, H * 0.07, '#d8c49a'); rect(g, 0, H * 0.055, W, H * 0.015, '#8a7656');
  weather(g, W, H, { fade: 0.07 });
  return c;
}

// THIRD STYLE: black fields, hair-thin candelabra, tiny floating landscapes (after Boscotrecase)
export function thirdStyle(ground = '#17110e', dado = '#7c241a', line1 = '#c9a85a', vign = 'landscape') {
  const c = createCanvas(W, H), g = c.getContext('2d');
  rect(g, 0, 0, W, H, ground);
  const pw = W / 3;
  for (let i = 0; i < 3; i++) {
    const x = i * pw;
    candelabrum(g, x + 40, H * 0.08, zone.dado - 20, line1, 4);
    // thin double frame
    frame(g, x + 120, H * 0.1, pw - 200, zone.dado - H * 0.16, line1, 3); frame(g, x + 136, H * 0.1 + 16, pw - 232, zone.dado - H * 0.16 - 32, line1, 1.2);
    // delicate swags hanging from the frame top
    for (let k = 0; k < 3; k++) { g.strokeStyle = line1; g.lineWidth = 1.5; g.beginPath(); const sx = x + 136 + k * (pw - 232) / 3; g.moveTo(sx, H * 0.1 + 16); g.quadraticCurveTo(sx + (pw - 232) / 6, H * 0.1 + 70, sx + (pw - 232) / 3, H * 0.1 + 16); g.stroke(); }
    // the tiny floating picture
    const vw = pw * 0.42, vh = vw * 0.72;
    picture(g, x + pw / 2 - vw / 2 + 40, H * 0.3, vw, vh, i === 1 && vign === 'landscape' ? 'myth' : vign, '#0d0a08');
    // small birds and plants on thin lines
    line(g, x + 180, H * 0.66, x + pw - 120, H * 0.66, line1, 1.5);
    bird(g, x + pw * 0.3, H * 0.655, 1.1, '#7a8a8a'); bird(g, x + pw * 0.75, H * 0.655, 1.0, '#a07050');
  }
  // upper frieze: tendrils and swans on black/white
  rect(g, 0, 0, W, H * 0.07, '#e8dfcc');
  for (let x = 0; x < W; x += 160) { g.strokeStyle = '#3a5a3a'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, H * 0.035); g.bezierCurveTo(x + 40, 0, x + 80, H * 0.07, x + 160, H * 0.035); g.stroke(); dab(g, x + 80, H * 0.035, 9, '#b8432a', 1, 0, 1); }
  line(g, 0, H * 0.07, W, H * 0.07, line1, 5);
  // dado with plants
  rect(g, 0, zone.dado, W, H - zone.dado, dado);
  line(g, 0, zone.dado, W, zone.dado, line1, 6);
  for (let i = 0; i < 12; i++) {
    const x = (i + 0.5) * W / 12, yb = H - 20;
    for (let k = 0; k < 9; k++) { const a = -Math.PI / 2 + rr(-0.9, 0.9), l = rr(80, 200); g.strokeStyle = pick(['#5a7a3a', '#3f5a30', '#78924a']); g.lineWidth = 4; g.beginPath(); g.moveTo(x, yb); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5, yb + Math.sin(a) * l * 0.4, x + Math.cos(a) * l, yb + Math.sin(a) * l); g.stroke(); }
  }
  weather(g, W, H, { fade: 0.07 });
  return c;
}

// FOURTH STYLE: Pompeian red panels with floating figures, black vistas, white upper zone (after the House of the Vettii)
export function fourthStyle(panel = P.cinnabar) {
  const c = createCanvas(W, H), g = c.getContext('2d');
  rect(g, 0, 0, W, H, panel);
  const pw = W * 0.35, vw = W * 0.15;      // panel, vista, panel, vista
  const figs = ['#d9c9a0', '#3f6e8f', '#e3b23a', '#6a8a4a'];
  for (let u = 0; u < 2; u++) {
    const x0 = u * (pw + vw);
    // panel with embroidered border and a floating figure
    const px = x0, top = H * 0.32, bot = zone.dado - 30;
    g.strokeStyle = '#e8d29a'; g.lineWidth = 5; g.strokeRect(px + 60, top + 30, pw - 120, bot - top - 60);
    for (let y = top + 30; y < bot - 30; y += 22) { dab(g, px + 60, y, 4, '#e8d29a', 1, 0, 1); dab(g, px + pw - 60, y, 4, '#e8d29a', 1, 0, 1); }
    figure(g, px + pw / 2, top + (bot - top) * 0.6, 1.5, figs[u * 2], 'float');
    // black vista with fantasy architecture
    vista(g, x0 + pw, top - H * 0.02, vw, bot - top + H * 0.04, P.black, '#d9b866');
    // thin column between panel and vista
    paintedColumn(g, x0 + pw, top - 10, bot + 10, 10, '#e8d29a', { flutes: false });
  }
  // cupids frieze on a black band above the dado (the Vettii cupids at work)
  const fy = zone.dado - H * 0.11;
  rect(g, 0, fy, W, H * 0.1, P.black);
  for (let i = 0; i < 7; i++) {
    const x = (i + 0.5) * W / 7;
    figure(g, x, fy + H * 0.085, 0.75, '#c58a62', 'cupid');
    if (i % 2) { rect(g, x + 40, fy + H * 0.06, 50, 26, '#a07040'); dab(g, x + 65, fy + H * 0.06, 14, '#c9a24a', 1, 0, 1); }   // an amphora or work table
    else line(g, x + 30, fy + H * 0.09, x + 110, fy + H * 0.04, '#8a6a3a', 6);
  }
  line(g, 0, fy, W, fy, '#e8d29a', 4); line(g, 0, fy + H * 0.1, W, fy + H * 0.1, '#e8d29a', 4);
  // white upper zone with airy architecture, statues and garlands
  rect(g, 0, 0, W, H * 0.3, '#ece3cf');
  vista(g, W * 0.04, H * 0.02, W * 0.26, H * 0.25, '#ece3cf', '#9a6a3a');
  vista(g, W * 0.54, H * 0.02, W * 0.26, H * 0.25, '#ece3cf', '#9a6a3a');
  for (let i = 0; i < 8; i++) garland(g, i * W / 8, (i + 1) * W / 8, H * 0.03, 50);
  for (const x of [W * 0.4, W * 0.9]) figure(g, x, H * 0.22, 0.8, '#b8432a', 'stand');
  rect(g, 0, H * 0.295, W, H * 0.012, '#c9a24a');
  // black dado with marble imitation and plants
  rect(g, 0, zone.dado, W, H - zone.dado, P.black);
  for (let i = 0; i < 8; i++) {
    const x = i * W / 8;
    if (i % 2) { marble(g, x + 30, zone.dado + 40, W / 8 - 60, H - zone.dado - 80, '#c9a24a', '#5a3a20', { scale: 1 / 90 }); frame(g, x + 30, zone.dado + 40, W / 8 - 60, H - zone.dado - 80, '#e8d29a', 3); }
    else for (let k = 0; k < 11; k++) { const a = -Math.PI / 2 + rr(-1, 1), l = rr(70, 180), bx = x + W / 16; g.strokeStyle = pick(['#5a7a3a', '#78924a']); g.lineWidth = 4; g.beginPath(); g.moveTo(bx, H - 30); g.quadraticCurveTo(bx + Math.cos(a) * l * 0.5, H - 30 + Math.sin(a) * l * 0.4, bx + Math.cos(a) * l, H - 30 + Math.sin(a) * l); g.stroke(); }
  }
  line(g, 0, zone.dado, W, zone.dado, '#e8d29a', 6);
  weather(g, W, H, { fade: 0.08 });
  return c;
}

// GARDEN ROOM: a painted garden behind a lattice fence (after the Villa of Livia at Prima Porta)
export function gardenRoom() {
  const c = createCanvas(W, H), g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, H * 0.8); sky.addColorStop(0, '#5f8fa3'); sky.addColorStop(1, '#bcd2c8');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // back row of trees, a low wall with niches, then the front fence
  for (let i = 0; i < 18; i++) paintedTree(g, rnd() * W, H * 0.55, rr(520, 820), pick(['laurel', 'pine', 'quince', 'laurel']));
  rect(g, 0, H * 0.55, W, H * 0.06, '#d8ccb0');
  for (let x = 120; x < W; x += 560) { g.fillStyle = '#bfb293'; g.beginPath(); g.ellipse(x, H * 0.55, 90, 70, 0, Math.PI, 0); g.fill(); paintedTree(g, x, H * 0.555, 220, 'oleander'); }
  for (let i = 0; i < 16; i++) paintedTree(g, rnd() * W, H * 0.72, rr(260, 420), pick(['oleander', 'quince', 'laurel']));
  // flowers along the ground: roses, irises, poppies
  for (let i = 0; i < 2200; i++) dab(g, rnd() * W, rr(H * 0.66, H * 0.8), rr(4, 9), pick(['#3f5a30', '#56753f', '#2f4a2a']), 0.9);
  for (let i = 0; i < 500; i++) dab(g, rnd() * W, rr(H * 0.64, H * 0.79), rr(4, 8), pick(['#d0405a', '#f0e8e0', '#6a5aa0', '#e8c64a', '#d9603a']), 1, 0, 0.9);
  // birds perched and flying
  for (let i = 0; i < 26; i++) bird(g, rnd() * W, rr(H * 0.15, H * 0.7), rr(1.2, 2.0), pick(['#3f5f7a', '#8a5a3a', '#e8e0d0', '#2a2a2a', '#a07050']), rnd() < 0.35);
  // lattice fence in the foreground
  const fy = H * 0.66, fh = H * 0.14;
  for (let x = 0; x < W; x += 110) { line(g, x, fy, x + 110, fy + fh, '#efe4c8', 7); line(g, x + 110, fy, x, fy + fh, '#efe4c8', 7); line(g, x, fy, x, fy + fh, '#efe4c8', 9); }
  rect(g, 0, fy - 8, W, 16, '#efe4c8'); rect(g, 0, fy + fh - 8, W, 16, '#efe4c8');
  // a painted marble basin with a bird drinking
  for (const x of [W * 0.27, W * 0.77]) { rect(g, x - 18, fy - 120, 36, 120, '#e8e2d6'); g.fillStyle = '#ece6da'; g.beginPath(); g.ellipse(x, fy - 120, 120, 30, 0, 0, 6.28); g.fill(); bird(g, x + 60, fy - 140, 1.4, '#3f5f7a'); }
  // red dado
  rect(g, 0, H * 0.82, W, H * 0.18, '#7c241a');
  for (let i = 0; i < 10; i++) frame(g, i * W / 10 + 20, H * 0.845, W / 10 - 40, H * 0.13, '#d9b57a', 3);
  rect(g, 0, H * 0.82 - 8, W, 8, '#d9b57a');
  weather(g, W, H, { fade: 0.06, cracks: 4 });
  return c;
}

// BATH: white Fourth-style walls with marine creatures and a blue dado
export function bathWall() {
  const c = createCanvas(W, H), g = c.getContext('2d');
  rect(g, 0, 0, W, H, '#ece6d8');
  const pw = W / 4;
  for (let i = 0; i < 4; i++) {
    const x = i * pw;
    frame(g, x + 70, H * 0.2, pw - 140, zone.dado - H * 0.26, '#9b2318', 5); frame(g, x + 90, H * 0.2 + 20, pw - 180, zone.dado - H * 0.26 - 40, '#3b6e8f', 2);
    candelabrum(g, x + 10, H * 0.1, zone.dado - 20, '#3b6e8f', 3);
    // floating sea creature in the centre: dolphin, sea-horse or fish
    const cx = x + pw / 2, cy = H * 0.5;
    g.save(); g.translate(cx, cy); g.rotate(rr(-0.3, 0.3)); g.fillStyle = pick(['#3b6e8f', '#5a7a8a', '#2a5a6a']);
    g.beginPath(); g.moveTo(-120, 0); g.quadraticCurveTo(0, -70, 120, -8); g.lineTo(160, 0); g.lineTo(120, 16); g.quadraticCurveTo(0, 40, -120, 8); g.lineTo(-170, -40); g.lineTo(-150, 0); g.lineTo(-170, 40); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-10, -40); g.lineTo(30, -90); g.lineTo(40, -32); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(0, -16, 90, 10, 0, 0, 6.28); g.fill();
    g.restore();
    for (let k = 0; k < 10; k++) dab(g, cx + rr(-160, 160), cy + rr(50, 90), 5, '#3b6e8f', 0.6);
  }
  rect(g, 0, 0, W, H * 0.08, '#e3d8c2'); for (let i = 0; i < 8; i++) garland(g, i * W / 8, (i + 1) * W / 8, H * 0.02, 34);
  rect(g, 0, zone.dado, W, H - zone.dado, '#2f5f78');
  for (let i = 0; i < 30; i++) { const x = rnd() * W, y = rr(zone.dado + 60, H - 50); g.fillStyle = pick(['#e8d8b0', '#d9a04a', '#c9503a']); g.beginPath(); g.ellipse(x, y, 30, 11, 0, 0, 6.28); g.fill(); g.beginPath(); g.moveTo(x - 28, y); g.lineTo(x - 46, y - 12); g.lineTo(x - 46, y + 12); g.fill(); }
  line(g, 0, zone.dado, W, zone.dado, '#9b2318', 6);
  weather(g, W, H, { fade: 0.05, cracks: 3 });
  return c;
}

// ================================================================== MOSAICS (2048 px)
function tesserae(src, Wt, Ht, cell = 9, grout = '#c4baa8') {
  const c = createCanvas(Wt, Ht), g = c.getContext('2d');
  rect(g, 0, 0, Wt, Ht, grout);
  const sd = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
  for (let y = 0; y < Ht; y += cell) for (let x = 0; x < Wt; x += cell) {
    const jx = rr(-1, 1), jy = rr(-1, 1);
    const sx = Math.min(src.width - 1, Math.floor((x + cell / 2) / Wt * src.width)), sy = Math.min(src.height - 1, Math.floor((y + cell / 2) / Ht * src.height));
    const i = (sy * src.width + sx) * 4, k = rr(0.88, 1.08);
    g.fillStyle = `rgb(${clamp(sd[i] * k, 0, 255)},${clamp(sd[i + 1] * k, 0, 255)},${clamp(sd[i + 2] * k, 0, 255)})`;
    g.beginPath(); g.moveTo(x + 1 + jx, y + 1 + jy); g.lineTo(x + cell - rr(1, 2.5), y + rr(0.5, 1.8)); g.lineTo(x + cell - rr(1, 2.5), y + cell - rr(1, 2.5)); g.lineTo(x + rr(0.5, 1.8), y + cell - rr(1, 2.5)); g.fill();
  }
  return c;
}
export function mosaicGeometric() {
  const s = createCanvas(512, 512), g = s.getContext('2d');
  rect(g, 0, 0, 512, 512, '#e9e2d2'); g.fillStyle = '#1e1a17';
  for (let y = 0; y < 512; y += 128) for (let x = 0; x < 512; x += 128) {
    g.fillRect(x + 6, y + 6, 116, 10); g.fillRect(x + 6, y + 112, 116, 10); g.fillRect(x + 6, y + 6, 10, 116); g.fillRect(x + 112, y + 6, 10, 116);
    g.beginPath(); g.moveTo(x + 64, y + 26); g.lineTo(x + 102, y + 64); g.lineTo(x + 64, y + 102); g.lineTo(x + 26, y + 64); g.fill();
    g.fillStyle = '#e9e2d2'; g.beginPath(); g.moveTo(x + 64, y + 46); g.lineTo(x + 82, y + 64); g.lineTo(x + 64, y + 82); g.lineTo(x + 46, y + 64); g.fill(); g.fillStyle = '#1e1a17';
    g.beginPath(); g.arc(x + 64, y + 64, 6, 0, 6.28); g.fill();
  }
  return tesserae(s, 2048, 2048, 10, '#bdb3a2');
}
export function mosaicCaveCanem() {
  const s = createCanvas(640, 320), g = s.getContext('2d');
  rect(g, 0, 0, 640, 320, '#e8e0cf'); g.fillStyle = '#1b1715'; g.strokeStyle = '#1b1715'; g.lineWidth = 8; g.strokeRect(8, 8, 624, 304);
  g.save(); g.scale(2, 2);
  g.beginPath(); g.moveTo(70, 70); g.quadraticCurveTo(140, 48, 196, 56); g.quadraticCurveTo(214, 62, 210, 92); g.quadraticCurveTo(150, 100, 82, 92); g.closePath(); g.fill();
  g.beginPath(); g.ellipse(222, 62, 22, 18, -0.2, 0, 6.28); g.fill();
  g.beginPath(); g.moveTo(236, 52); g.lineTo(272, 54); g.lineTo(270, 62); g.lineTo(240, 64); g.fill();
  g.beginPath(); g.moveTo(238, 70); g.lineTo(266, 80); g.lineTo(262, 86); g.lineTo(234, 78); g.fill();
  g.fillStyle = '#b0402c'; g.beginPath(); g.moveTo(240, 65); g.lineTo(262, 72); g.lineTo(240, 70); g.fill();
  g.fillStyle = '#e8e0cf'; for (let i = 0; i < 4; i++) g.fillRect(246 + i * 6, 62, 2, 3);
  g.fillStyle = '#1b1715'; g.beginPath(); g.moveTo(208, 46); g.quadraticCurveTo(200, 40, 204, 62); g.lineTo(214, 52); g.fill();
  g.lineWidth = 9; for (const [x1, x2] of [[96, 78], [118, 112], [186, 204], [202, 224]]) { g.beginPath(); g.moveTo(x1, 88); g.lineTo(x2, 128); g.stroke(); }
  g.lineWidth = 5; g.beginPath(); g.moveTo(74, 72); g.quadraticCurveTo(48, 46, 40, 66); g.stroke();
  g.fillStyle = '#b0402c'; g.fillRect(200, 66, 8, 22);
  g.lineWidth = 2; g.beginPath(); g.moveTo(204, 80); g.quadraticCurveTo(250, 120, 304, 100); g.stroke();
  g.fillStyle = '#e8e0cf'; g.beginPath(); g.arc(226, 56, 3, 0, 6.28); g.fill();
  g.fillStyle = '#1b1715'; g.font = 'bold 22px serif'; g.fillText('CAVE CANEM', 92, 150);
  g.restore();
  return tesserae(s, 2048, 1024, 8, '#c4baa8');
}
export function mosaicEmblema() {
  const s = createCanvas(512, 512), g = s.getContext('2d');
  const sea = g.createLinearGradient(0, 0, 0, 512); sea.addColorStop(0, '#3f6f7a'); sea.addColorStop(1, '#1f3a42'); g.fillStyle = sea; g.fillRect(0, 0, 512, 512);
  const fish = (x, y, sc, col, a) => { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, 40 * sc, 15 * sc, 0, 0, 6.28); g.fill(); g.beginPath(); g.moveTo(-36 * sc, 0); g.lineTo(-60 * sc, -18 * sc); g.lineTo(-60 * sc, 18 * sc); g.fill(); g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(4 * sc, -5 * sc, 26 * sc, 4 * sc, 0, 0, 6.28); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(24 * sc, -3 * sc, 3 * sc, 0, 6.28); g.fill(); g.restore(); };
  for (let i = 0; i < 20; i++) fish(rr(60, 452), rr(60, 452), rr(0.6, 1.3), pick(['#d9a04a', '#c9503a', '#d9d2c0', '#8a9a5a', '#b06a8a', '#6a8aa0']), rr(-0.6, 0.6) + (rnd() < 0.5 ? Math.PI : 0));
  g.fillStyle = '#b0503a'; g.beginPath(); g.ellipse(256, 240, 44, 36, 0, 0, 6.28); g.fill();
  g.strokeStyle = '#b0503a'; g.lineWidth = 12; for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(256, 260); g.quadraticCurveTo(256 + Math.cos(k) * 100, 300 + Math.sin(k) * 60, 256 + Math.cos(k * 0.8) * 140, 360 + Math.sin(k) * 80); g.stroke(); }
  g.fillStyle = '#e8c06a'; for (let i = 0; i < 2; i++) { g.beginPath(); g.ellipse(120 + i * 270, 400, 40, 20, 0, 0, 6.28); g.fill(); }  // lobster/shells hint
  g.strokeStyle = '#e8e0cf'; g.lineWidth = 18; g.strokeRect(10, 10, 492, 492); g.strokeStyle = '#1b1715'; g.lineWidth = 8; g.strokeRect(24, 24, 464, 464);
  for (let i = 0; i < 40; i++) { const t = i / 40; g.fillStyle = i % 2 ? '#b0402c' : '#e8e0cf'; g.fillRect(28 + t * 456, 28, 11, 11); g.fillRect(28 + t * 456, 473, 11, 11); }
  return tesserae(s, 2048, 2048, 7, '#2a3a3a');
}
export function mosaicMarine() {
  const s = createCanvas(512, 512), g = s.getContext('2d');
  rect(g, 0, 0, 512, 512, '#ebe5d6'); g.fillStyle = '#1b1715';
  const dolphin = (x, y, sc, a) => { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(-60 * sc, 0); g.quadraticCurveTo(0, -36 * sc, 60 * sc, -4 * sc); g.lineTo(80 * sc, 0); g.lineTo(60 * sc, 8 * sc); g.quadraticCurveTo(0, 20 * sc, -60 * sc, 4 * sc); g.lineTo(-84 * sc, -20 * sc); g.lineTo(-76 * sc, 0); g.lineTo(-84 * sc, 20 * sc); g.closePath(); g.fill(); g.beginPath(); g.moveTo(-4 * sc, -20 * sc); g.lineTo(12 * sc, -40 * sc); g.lineTo(20 * sc, -16 * sc); g.fill(); g.restore(); };
  for (let i = 0; i < 8; i++) dolphin(rr(70, 442), rr(70, 442), rr(0.7, 1.1), rr(-3.1, 3.1));
  // a triton blowing a conch
  g.beginPath(); g.ellipse(256, 256, 30, 46, 0.2, 0, 6.28); g.fill(); g.beginPath(); g.arc(250, 196, 18, 0, 6.28); g.fill();
  g.lineWidth = 12; g.beginPath(); g.moveTo(256, 296); g.quadraticCurveTo(320, 380, 400, 330); g.stroke();
  for (let i = 0; i < 50; i++) { g.beginPath(); g.arc(rr(0, 512), rr(0, 512), rr(2, 5), 0, 6.28); g.fill(); }
  g.lineWidth = 3; for (let i = 0; i < 8; i++) { g.beginPath(); const y = rr(0, 512); for (let x = 0; x <= 512; x += 10) g.lineTo(x, y + Math.sin(x / 14) * 4); g.stroke(); }
  return tesserae(s, 2048, 2048, 10, '#bdb3a2');
}
export function signinum() {
  const S = 1024, c = createCanvas(S, S), g = c.getContext('2d');
  rect(g, 0, 0, S, S, '#9a5c45');
  for (let i = 0; i < 16000; i++) dab(g, rnd() * S, rnd() * S, rr(1, 4), pick(['#8a4f3a', '#a86a50', '#7d4634', '#b07658']), 0.6);
  g.fillStyle = '#ece4d4';
  for (let y = 24; y < S; y += 48) for (let x = 24; x < S; x += 48) g.fillRect(x + rr(-3, 3), y + rr(-3, 3), 9, 9);
  return c;
}
export function larariumPainting() {
  const S = 1024, c = createCanvas(S, S), g = c.getContext('2d');
  rect(g, 0, 0, S, S, '#ece0c4');
  figure(g, 230, 600, 2.3, '#b0402c', 'stand'); figure(g, 800, 600, 2.3, '#b0402c', 'stand');
  figure(g, 512, 620, 2.0, '#e8dcc0', 'stand');
  rect(g, 470, 470, 84, 140, '#9a8a72'); dab(g, 512, 455, 26, '#e86a2a', 1, 0, 1); dab(g, 512, 432, 14, '#f2c24a', 1, 0, 1);
  garland(g, 60, 964, 80, 80);
  g.strokeStyle = '#4a6a3a'; g.lineWidth = 28; g.beginPath(); for (let x = 60; x <= 820; x += 8) g.lineTo(x, 870 + Math.sin(x / 60) * 50); g.stroke();
  g.strokeStyle = '#e3b23a'; g.lineWidth = 4; g.beginPath(); for (let x = 60; x <= 820; x += 8) g.lineTo(x, 870 + Math.sin(x / 60) * 50); g.stroke();
  dab(g, 830, 874, 26, '#3a5a2a', 1, 0, 0.8); rect(g, 870, 800, 80, 100, '#9a8a72');
  weather(g, S, S, { fade: 0.06, cracks: 6, losses: 2 });
  return c;
}

// ================================================================== NATURE TEXTURES
// leaf cluster with alpha (for leaf cards): kind sets leaf shape and colours
export function leafCluster(kind) {
  const S = 512, c = createCanvas(S, S), g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  const cfg = {
    laurel: { n: 120, len: [34, 58], wid: 0.32, col: ['#2f4a2a', '#3f5e33', '#56753f', '#4a6a38'] },
    cypress: { n: 500, len: [10, 20], wid: 0.5, col: ['#24381f', '#2f4a28', '#3a5a30'] },
    box: { n: 520, len: [10, 16], wid: 0.6, col: ['#3a5a2e', '#4a6e36', '#5c8040', '#6f944c'] },
    lemon: { n: 110, len: [36, 60], wid: 0.42, col: ['#2f4f26', '#3f6430', '#56783c'] },
    vine: { n: 40, len: [60, 90], wid: 0.95, col: ['#3f6430', '#56783c', '#6a8a44'] },
    rose: { n: 160, len: [18, 28], wid: 0.55, col: ['#2f4a26', '#3f5e30', '#4f6e38'] },
  }[kind];
  // twigs
  g.strokeStyle = '#4a3a28'; g.lineWidth = 4;
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(S / 2, S); g.quadraticCurveTo(rr(100, 412), rr(200, 400), rr(40, 472), rr(40, 300)); g.stroke(); }
  for (let i = 0; i < cfg.n; i++) {
    const r = Math.sqrt(rnd()) * S * 0.44, a = rr(0, 6.28), x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r * 0.9;
    const L = rr(...cfg.len), ang = a + rr(-0.6, 0.6);
    const lit = clamp(0.55 - (x - S / 2) / S - (y - S / 2) / S + rr(-0.2, 0.2));
    const col = cfg.col[Math.min(cfg.col.length - 1, Math.floor(lit * cfg.col.length))];
    g.save(); g.translate(x, y); g.rotate(ang);
    if (kind === 'vine') {        // five-lobed vine leaf
      g.fillStyle = col; g.beginPath(); for (let k = 0; k <= 10; k++) { const t = k / 10 * 6.283, rad = L * (0.55 + 0.25 * Math.cos(t * 2.5)); g.lineTo(Math.cos(t) * rad, Math.sin(t) * rad); } g.fill();
    } else {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.5, -L * cfg.wid, L, 0); g.quadraticCurveTo(L * 0.5, L * cfg.wid, 0, 0); g.fill();
      g.strokeStyle = 'rgba(255,255,230,0.18)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, 0); g.lineTo(L * 0.9, 0); g.stroke();
    }
    g.restore();
  }
  if (kind === 'lemon') for (let i = 0; i < 9; i++) { const a = rr(0, 6.28), r = rr(40, 200); dab(g, S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 15, pick(['#e8c63a', '#f0d04a', '#d9b02a']), 1, rr(0, 3), 0.75); }
  if (kind === 'rose') for (let i = 0; i < 16; i++) { const a = rr(0, 6.28), r = rr(20, 210), x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r, col = pick(['#c0364a', '#e08a9a', '#f0e8e0', '#a82a3a']); for (let k = 0; k < 6; k++) dab(g, x + rr(-6, 6), y + rr(-6, 6), rr(6, 12), col, 1, rr(0, 3), 0.8); dab(g, x, y, 4, '#6a1a2a', 1, 0, 1); }
  return c;
}
export function grassTexture() {
  const S = 1024, c = createCanvas(S, S), g = c.getContext('2d');
  rect(g, 0, 0, S, S, '#4f6a32');
  for (let i = 0; i < 26000; i++) { const x = rnd() * S, y = rnd() * S, l = rr(6, 18); g.strokeStyle = pick(['#3f5a28', '#5a7a3a', '#6a8a44', '#47622e', '#7a9450']); g.lineWidth = rr(1, 2.2); g.beginPath(); g.moveTo(x, y); g.lineTo(x + rr(-4, 4), y - l); g.stroke(); }
  for (let i = 0; i < 300; i++) dab(g, rnd() * S, rnd() * S, rr(10, 40), pick(['rgba(90,70,50,0.25)', 'rgba(120,140,70,0.2)']), 1);
  return c;
}
export function gravelTexture() {
  const S = 1024, c = createCanvas(S, S), g = c.getContext('2d');
  rect(g, 0, 0, S, S, '#a8977a');
  for (let i = 0; i < 22000; i++) dab(g, rnd() * S, rnd() * S, rr(2, 6), pick(['#bfae8f', '#968566', '#cfc0a2', '#8a7a5e', '#b8a688']), 1, rr(0, 3), rr(0.6, 0.95));
  return c;
}
export function marbleTexture() {
  const S = 1024, c = createCanvas(S, S), g = c.getContext('2d');
  marble(g, 0, 0, S, S, '#ece6da', '#9a938a', { scale: 1 / 260, angle: 0.5, seed: 3 });
  return c;
}
// tangent-space normal map of small water ripples (tileable)
export function waterNormal() {
  const S = 512, c = createCanvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  const hgt = (x, y) => { let v = 0; for (let k = 1; k <= 4; k++) { const f = k * 2 * Math.PI / S; v += Math.sin(x * f * (k + 1) + y * f * k * 0.7 + k) * Math.cos(y * f * (k + 2) - x * f * 0.3 * k) / k; } return v; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1);
    const nx = -dx * 2.2, ny = -dy * 2.2, nz = 1, l = Math.hypot(nx, ny, nz), i = (y * S + x) * 4;
    d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (nz / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return c;
}

// grass tuft with alpha (crossed cards in the garden beds)
export function grassTuft() {
  const S = 256, c = createCanvas(S, S), g = c.getContext('2d');
  g.clearRect(0, 0, S, S); g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x = rr(30, 226), h = rr(90, 240), bend = rr(-50, 50);
    g.strokeStyle = pick(['#3f5a28', '#56753a', '#6a8a44', '#4a6a30', '#7a9450', '#8a9a58']); g.lineWidth = rr(2, 5);
    g.beginPath(); g.moveTo(x, S); g.quadraticCurveTo(x + bend * 0.3, S - h * 0.6, x + bend, S - h); g.stroke();
  }
  for (let i = 0; i < 6; i++) dab(g, rr(40, 216), rr(40, 140), rr(4, 7), pick(['#f0e8e0', '#e8c64a', '#d0405a']), 1, 0, 1);
  return c;
}
