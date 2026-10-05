// Textures for the Amphitheatre of Pompeii (c. 70 BC).
// Podium fresco (the parapet round the arena was painted with gladiators, hunts and Victories; the paintings
// were recorded when excavated in 1815 and have since faded), seat stone, arena sand, opus incertum masonry,
// awning cloth, a painted games notice and the builders' dedication inscription.
import { createCanvas } from '@napi-rs/canvas';
import { rr, pick, hex, rgb, shade, mix, clamp, lerp, n2, fbm2, h2, line, dab, rect, frame, weather, marble, bevel, figure, paintedTree, garland, candelabrum } from './villa-textures.mjs';

// ------------------------------------------------------------------ people and animals
const SKIN = [190, 128, 88];
function grad(g, c, x0, x1) { const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, rgb(shade(c, 1.25))); gr.addColorStop(0.5, rgb(c)); gr.addColorStop(1, rgb(shade(c, 0.55))); return gr; }
function limb(g, pts, w, col = SKIN) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = rgb(shade(col, 0.45), 0.7); g.lineWidth = w + 3; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]); g.stroke();
  g.strokeStyle = grad(g, col, Math.min(pts[0], pts[pts.length - 2]) - w, Math.max(pts[0], pts[pts.length - 2]) + w); g.lineWidth = w; g.stroke();
  g.strokeStyle = rgb(shade(col, 1.3), 0.45); g.lineWidth = w * 0.3; g.beginPath(); g.moveTo(pts[0] - w * 0.2, pts[1]); for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k] - w * 0.2, pts[k + 1]); g.stroke();
}
function poly(g, pts, col, outline = true) {
  g.fillStyle = typeof col === 'string' ? col : col; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]); g.closePath(); g.fill();
  if (outline) { g.strokeStyle = 'rgba(40,22,12,0.55)'; g.lineWidth = 2.5; g.stroke(); }
}
// A gladiator in fighting stance, facing right (use flip = -1 to face left). Units: ~300 px tall at s = 1.
function gladiator(g, x, y, s, type, flip = 1) {
  g.save(); g.translate(x, y); g.scale(s * flip, s);
  const bronze = [176, 132, 64], steel = [170, 170, 165], white = [236, 228, 210], red = [150, 40, 30];
  const hip = [0, -140], kneeF = [42, -78], ankF = [70, -6], kneeB = [-38, -74], ankB = [-66, -4], sh = [12, -232], neck = [14, -246];
  // back leg, front leg (with greaves / padding by type)
  limb(g, [...hip, ...kneeB, ...ankB], 24); limb(g, [...hip, ...kneeF, ...ankF], 26);
  for (const [a, b] of [[kneeF, ankF], [kneeB, ankB]]) {                 // shin greaves (ocreae) / leg wraps
    if (type === 'thraex' || type === 'murmillo' || type === 'secutor') { const tall = type === 'thraex'; limb(g, [a[0] + (tall ? -6 : 3), a[1] + (tall ? -18 : 12), b[0], b[1] - 8], 22, bronze); }
    else limb(g, [a[0] + 4, a[1] + 24, b[0], b[1] - 10], 20, white);
  }
  for (const a of [ankF, ankB]) dab(g, a[0] + 8, a[1] + 2, 12, '#4a2e1a', 1, 0, 0.5);
  // torso (bare chest), subligaculum (loincloth) and broad belt (balteus)
  poly(g, [hip[0] - 30, hip[1] + 6, hip[0] + 30, hip[1] + 6, sh[0] + 34, sh[1] + 6, sh[0] - 26, sh[1] + 10], grad(g, SKIN, -30, 40));
  dab(g, 4, -200, 12, 'rgba(120,70,45,0.35)', 1, 0.2, 1.3); dab(g, 22, -198, 10, 'rgba(120,70,45,0.3)', 1, -0.2, 1.3);
  poly(g, [-34, -150, 36, -150, 44, -112, 10, -96, -40, -110], rgb(white)); line(g, -20, -140, -10, -104, 'rgba(120,110,90,0.6)', 2); line(g, 20, -140, 18, -104, 'rgba(120,110,90,0.6)', 2);
  poly(g, [-34, -168, 36, -168, 36, -146, -34, -146], grad(g, bronze, -34, 36)); for (let i = -26; i < 34; i += 12) dab(g, i, -157, 3, '#f0d890', 1, 0, 1);
  // back arm (sword arm, raised) and weapon
  const swordArm = type === 'retiarius' ? [sh[0] - 10, sh[1] + 6, -40, -190, -70, -150] : [sh[0] - 6, sh[1] + 4, -30, -190, -6, -172];
  limb(g, swordArm, 20, type === 'retiarius' ? SKIN : white);   // padded arm guard (manica) on fighters
  if (type === 'retiarius') {  // trident held low, net in the other hand
    line(g, -70, -150, 150, -260, '#6a4a2a', 6); for (const o of [-14, 0, 14]) line(g, 150 + o * 0.5, -260 + o, 176 + o * 0.5, -276 + o, '#9a9a96', 4);
  } else if (type === 'thraex') { g.strokeStyle = '#b8b8b2'; g.lineWidth = 7; g.beginPath(); g.moveTo(-6, -172); g.quadraticCurveTo(40, -150, 70, -196); g.stroke(); }   // curved sica
  else { line(g, -6, -172, 60, -214, '#c8c8c0', 8); line(g, -14, -164, 2, -180, '#6a4a2a', 7); }   // gladius
  // head and helmet
  const hc = [neck[0] + 8, neck[1] - 26];
  if (type === 'retiarius') {
    dab(g, hc[0], hc[1], 22, rgb(SKIN), 1, 0, 1.15); dab(g, hc[0] - 6, hc[1] - 16, 20, '#3a2214', 1, 0, 0.55); dab(g, hc[0] + 12, hc[1] - 4, 3, '#1a1008', 1, 0, 1);
    poly(g, [sh[0] + 10, sh[1] - 10, sh[0] + 40, sh[1] - 40, sh[0] + 48, sh[1] - 4, sh[0] + 30, sh[1] + 16], grad(g, bronze, sh[0] + 10, sh[0] + 48));   // galerus shoulder guard
  } else {
    const hcol = type === 'secutor' ? steel : bronze;
    g.fillStyle = grad(g, hcol, hc[0] - 30, hc[0] + 30); g.beginPath(); g.ellipse(hc[0], hc[1], type === 'secutor' ? 26 : 30, 30, 0, 0, 6.283); g.fill(); g.strokeStyle = 'rgba(40,22,12,0.6)'; g.lineWidth = 2.5; g.stroke();
    if (type !== 'secutor') { poly(g, [hc[0] - 42, hc[1] + 12, hc[0] + 44, hc[1] + 10, hc[0] + 38, hc[1] + 18, hc[0] - 38, hc[1] + 20], grad(g, hcol, hc[0] - 42, hc[0] + 44)); }   // brim
    for (let i = -14; i <= 14; i += 7) for (let j = -8; j <= 8; j += 7) dab(g, hc[0] + 14 + j * 0.4, hc[1] + i * 0.6, 2, '#2a1a0c', 1, 0, 1);   // visor grille
    if (type === 'murmillo') { g.fillStyle = rgb(red); g.beginPath(); g.moveTo(hc[0] - 34, hc[1] - 18); g.quadraticCurveTo(hc[0] - 10, hc[1] - 80, hc[0] + 30, hc[1] - 40); g.lineTo(hc[0] + 20, hc[1] - 26); g.quadraticCurveTo(hc[0] - 6, hc[1] - 52, hc[0] - 24, hc[1] - 18); g.fill(); }   // crest
    if (type === 'thraex') { g.fillStyle = grad(g, bronze, hc[0] - 10, hc[0] + 40); g.beginPath(); g.moveTo(hc[0] - 6, hc[1] - 28); g.quadraticCurveTo(hc[0] + 24, hc[1] - 74, hc[0] + 44, hc[1] - 52); g.lineTo(hc[0] + 26, hc[1] - 44); g.lineTo(hc[0] + 10, hc[1] - 26); g.fill(); for (let i = 0; i < 9; i++) dab(g, hc[0] - 20 + i * 4, hc[1] - 40 - i * 5, 7, '#e8e0d0', 0.9); }   // griffin crest and feathers
    if (type === 'secutor') line(g, hc[0] - 22, hc[1] - 6, hc[0] + 18, hc[1] - 24, 'rgba(255,255,255,0.4)', 4);
  }
  // front arm with shield / net
  if (type === 'retiarius') {
    limb(g, [sh[0] + 20, sh[1] + 6, 70, -200, 110, -210], 20);
    g.strokeStyle = 'rgba(200,190,160,0.85)'; g.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(110, -210); g.quadraticCurveTo(140 + i * 6, -170, 120 + i * 14, -110 + i * 4); g.stroke(); }
    for (let k = 0; k < 6; k++) { g.beginPath(); for (let i = 0; i < 9; i++) g.lineTo(116 + i * 13 + k * 2, -190 + k * 15 + i * 6); g.stroke(); }
  } else if (type === 'thraex') {
    limb(g, [sh[0] + 20, sh[1] + 6, 56, -196, 76, -176], 20);
    poly(g, [56, -240, 116, -236, 112, -150, 54, -154], grad(g, [150, 50, 36], 56, 116)); frame(g, 62, -232, 46, 74, '#e0c070', 3); dab(g, 84, -194, 9, '#d0a850', 1, 0, 1);   // parmula
  } else {
    limb(g, [sh[0] + 20, sh[1] + 6, 54, -196, 72, -180], 20);
    const sc = type === 'secutor' ? [176, 52, 36] : [150, 44, 30];
    g.fillStyle = grad(g, sc, 50, 128); g.beginPath(); g.moveTo(54, -290); g.quadraticCurveTo(96, -300, 126, -286); g.lineTo(124, -80); g.quadraticCurveTo(92, -66, 56, -80); g.closePath(); g.fill(); g.strokeStyle = 'rgba(40,22,12,0.6)'; g.lineWidth = 3; g.stroke();   // curved scutum
    g.strokeStyle = '#e0c070'; g.lineWidth = 4; g.strokeRect(62, -280, 56, 192); dab(g, 90, -186, 14, '#d8b060', 1, 0, 1); line(g, 90, -276, 90, -96, 'rgba(224,192,112,0.8)', 4);
  }
  g.restore();
}
function animal(g, x, y, s, kind, flip = 1) {
  g.save(); g.translate(x, y); g.scale(s * flip, s);
  const C = { lion: [196, 148, 82], bear: [92, 62, 40], bull: [52, 40, 34], stag: [160, 104, 60], boar: [70, 56, 46], leopard: [210, 160, 80] }[kind];
  const L = kind === 'stag' ? 34 : 0, H = kind === 'stag' ? 30 : 0;
  // legs: running/leaping pose
  for (const [hx, kx, fx, w] of [[-70, -110, -136, 20], [-50, -60, -40, 22], [60, 100, 126, 20], [80, 70, 86, 22]]) limb(g, [hx, -70 - H, kx, -40 - H * 0.6, fx, -4], w - (kind === 'stag' ? 8 : 0), shade(C, 0.9));
  // body
  g.fillStyle = grad(g, C, -100, 110); g.beginPath(); g.ellipse(0, -84 - H, 110 + L, 46 - (kind === 'stag' ? 12 : 0) + (kind === 'bear' ? 10 : 0), kind === 'bull' ? -0.05 : 0.08, 0, 6.283); g.fill();
  g.strokeStyle = 'rgba(30,16,8,0.55)'; g.lineWidth = 2.5; g.stroke();
  dab(g, -10, -70 - H, 60, rgb(shade(C, 1.15), 0.4), 1, 0, 0.35);
  // tail
  g.strokeStyle = rgb(shade(C, 0.8)); g.lineWidth = kind === 'lion' || kind === 'leopard' ? 7 : 5; g.beginPath(); g.moveTo(-104, -96 - H); g.quadraticCurveTo(-150, -120 - H, -170, kind === 'bull' ? -60 : -150 - H); g.stroke();
  if (kind === 'lion') dab(g, -172, -152, 9, '#5a3a1e', 1, 0, 1);
  // head
  const hx = 118 + L, hy = -112 - H;
  if (kind === 'lion') for (let i = 0; i < 80; i++) { const a = rr(0, 6.28), d = rr(10, 52); dab(g, hx - 14 + Math.cos(a) * d, hy + Math.sin(a) * d * 0.9, 13, pick(['#7a4a22', '#8e5a2a', '#6a3a1a', '#a06830']), 0.95); }
  g.fillStyle = grad(g, C, hx - 30, hx + 40); g.beginPath(); g.ellipse(hx, hy, kind === 'bull' ? 34 : 30, kind === 'bear' ? 28 : 26, 0.3, 0, 6.283); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(hx + 28, hy + 10, 20, 14, 0.4, 0, 6.283); g.fill(); g.stroke();   // muzzle
  dab(g, hx + 8, hy - 8, 4, '#1a0e06', 1, 0, 1); dab(g, hx + 44, hy + 10, 4, '#1a0e06', 1, 0, 1);
  if (kind === 'lion' || kind === 'leopard' || kind === 'bear') { g.fillStyle = '#7a1a14'; g.beginPath(); g.moveTo(hx + 30, hy + 18); g.lineTo(hx + 50, hy + 22); g.lineTo(hx + 32, hy + 28); g.fill(); for (const t of [0, 8]) { g.fillStyle = '#f0ece0'; g.beginPath(); g.moveTo(hx + 36 + t, hy + 18); g.lineTo(hx + 39 + t, hy + 25); g.lineTo(hx + 42 + t, hy + 18); g.fill(); } }
  if (kind === 'bull') for (const s2 of [1, -1]) { g.strokeStyle = '#e8dcc0'; g.lineWidth = 9; g.beginPath(); g.moveTo(hx - 10, hy - 20); g.quadraticCurveTo(hx - 10 + s2 * 6, hy - 60, hx + 26, hy - 64 + s2 * 6); g.stroke(); }
  if (kind === 'stag') { g.strokeStyle = '#8a6a44'; g.lineWidth = 5; for (const s2 of [0, 14]) { g.beginPath(); g.moveTo(hx - 10 + s2, hy - 20); g.lineTo(hx - 30 + s2, hy - 90); g.stroke(); for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(hx - 16 + s2 - k * 5, hy - 40 - k * 18); g.lineTo(hx + 4 + s2 - k * 5, hy - 60 - k * 18); g.stroke(); } } }
  if (kind === 'leopard') for (let i = 0; i < 70; i++) dab(g, rr(-100, 100), -84 + rr(-36, 36), 6, '#3a2410', 0.85, 0, 1);
  if (kind === 'boar') for (let i = 0; i < 30; i++) line(g, rr(-60, 80), -126, rr(-60, 80), -138, '#2a1e16', 3);
  dab(g, hx - 20, hy - 24, 9, rgb(shade(C, 0.8)), 1, 0, 1.2);      // ear
  g.restore();
}
function hunter(g, x, y, s, flip = 1, tunic = [170, 60, 40]) {
  g.save(); g.translate(x, y); g.scale(s * flip, s);
  limb(g, [0, -140, -40, -74, -70, -4], 24); limb(g, [0, -140, 50, -80, 80, -6], 26);
  poly(g, [-34, -250, 40, -250, 54, -116, -46, -116], grad(g, tunic, -40, 54)); line(g, -34, -170, 44, -170, '#4a2a16', 6);
  for (let i = 0; i < 5; i++) line(g, -30 + i * 18, -168, -36 + i * 22, -118, rgb(shade(tunic, 0.7), 0.6), 2);
  limb(g, [-20, -240, -30, -190, 20, -176], 18); limb(g, [30, -240, 80, -214, 120, -224], 18);
  line(g, -60, -150, 230, -260, '#6a4a2a', 7); poly(g, [230, -260, 262, -276, 244, -250], '#c8c8c0');   // venabulum (hunting spear)
  dab(g, 20, -274, 24, rgb(SKIN), 1, 0, 1.12); dab(g, 12, -292, 22, '#2e1a10', 1, 0, 0.55); dab(g, 32, -276, 3, '#1a0e06', 1, 0, 1);
  g.restore();
}
function victory(g, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s);
  for (const sx of [-1, 1]) {                                 // wings
    for (let k = 0; k < 9; k++) { g.fillStyle = k % 2 ? '#efe6d2' : '#d9ccb0'; g.beginPath(); g.moveTo(0, -150); g.quadraticCurveTo(sx * (60 + k * 14), -230 - k * 6, sx * (110 + k * 10), -140 + k * 18); g.quadraticCurveTo(sx * (40 + k * 6), -150 + k * 6, 0, -130); g.fill(); }
  }
  g.restore();
  figure(g, x, y - 60 * s, 1.7 * s, '#e8dcc0', 'float');
  // palm branch and wreath
  g.strokeStyle = '#4a6a2a'; g.lineWidth = 4 * s; g.beginPath(); g.moveTo(x + 70 * s, y - 70 * s); g.quadraticCurveTo(x + 90 * s, y - 200 * s, x + 60 * s, y - 330 * s); g.stroke();
  for (let i = 0; i < 18; i++) { const t = i / 18, px = x + lerp(80, 62, t) * s, py = y - lerp(90, 320, t) * s; for (const sx of [-1, 1]) line(g, px, py, px + sx * 30 * s * (1 - t * 0.5), py + 18 * s, '#5a7a32', 3 * s); }
  g.strokeStyle = '#5a7a32'; g.lineWidth = 9 * s; g.beginPath(); g.arc(x - 80 * s, y - 330 * s, 28 * s, 0, 6.283); g.stroke();
  for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283; dab(g, x - 80 * s + Math.cos(a) * 28 * s, y - 330 * s + Math.sin(a) * 28 * s, 7 * s, '#6a8a3a', 1, a, 0.5); }
}
function referee(g, x, y, s, flip = 1) { g.save(); g.translate(x, y - 92 * s); g.scale(flip, 1); figure(g, 0, 0, 1.95 * s, '#efe8d8', 'stand'); g.restore(); }

// ------------------------------------------------------------------ PODIUM FRESCO (4096 × 1024 = 8.8 m × 2.2 m)
export function podiumFresco() {
  const W = 4096, H = 1024, c = createCanvas(W, H), g = c.getContext('2d');
  rect(g, 0, 0, W, H, '#8f2318');
  const dadoY = H * 0.8, topY = H * 0.075, pw = W / 4;
  // black dado with painted marble slabs and plants
  rect(g, 0, dadoY, W, H - dadoY, '#18120f');
  for (let i = 0; i < 8; i++) { const x = i * W / 8; if (i % 2) { marble(g, x + 30, dadoY + 34, W / 8 - 60, H - dadoY - 64, i % 4 === 1 ? '#c9a24a' : '#7a2e3a', '#efe0c0', { scale: 1 / 70 }); frame(g, x + 30, dadoY + 34, W / 8 - 60, H - dadoY - 64, '#e3c27a', 3); } else for (let k = 0; k < 9; k++) { const a = -Math.PI / 2 + rr(-0.9, 0.9), l = rr(50, 120), bx = x + W / 16; g.strokeStyle = pick(['#5a7a3a', '#78924a']); g.lineWidth = 4; g.beginPath(); g.moveTo(bx, H - 26); g.quadraticCurveTo(bx + Math.cos(a) * l * 0.5, H - 26 + Math.sin(a) * l * 0.4, bx + Math.cos(a) * l, H - 26 + Math.sin(a) * l); g.stroke(); } }
  line(g, 0, dadoY, W, dadoY, '#e3c27a', 6);
  // top band with a running vine scroll on white
  rect(g, 0, 0, W, topY, '#e8dfcc');
  for (let x = 0; x < W; x += 128) { g.strokeStyle = '#3f5a30'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, topY / 2); g.bezierCurveTo(x + 32, 4, x + 64, topY - 4, x + 128, topY / 2); g.stroke(); dab(g, x + 64, topY / 2, 8, '#b8432a', 1, 0, 1); dab(g, x + 30, 14, 7, '#56753f', 1, 0.5, 0.5); }
  line(g, 0, topY, W, topY, '#e3c27a', 5);
  // four scenes on pale grounds, framed, separated by painted pilasters with candelabra
  const scenes = ['duel1', 'hunt', 'victory', 'duel2'];
  scenes.forEach((sc, i) => {
    const x0 = i * pw + 70, x1 = (i + 1) * pw - 70, y0 = topY + 46, y1 = dadoY - 40, gy = y1 - 40;
    const bg = sc === 'victory' ? '#9b2a1c' : '#e6dcc4';
    rect(g, x0, y0, x1 - x0, y1 - y0, bg);
    if (sc !== 'victory') {            // a hint of the arena: sand ground, palm trees on the horizon
      const gr = g.createLinearGradient(0, gy - 80, 0, y1); gr.addColorStop(0, 'rgba(201,178,132,0)'); gr.addColorStop(0.4, '#cdb78a'); gr.addColorStop(1, '#b89e6e'); g.fillStyle = gr; g.fillRect(x0, gy - 80, x1 - x0, y1 - gy + 80);
      for (let k = 0; k < 40; k++) dab(g, rr(x0, x1), rr(gy - 10, y1), rr(2, 5), 'rgba(120,90,50,0.4)', 1);
    }
    const cx = (x0 + x1) / 2;
    if (sc === 'duel1') { gladiator(g, cx - 250, gy, 1.5, 'murmillo', 1); gladiator(g, cx + 130, gy, 1.5, 'thraex', -1); referee(g, x1 - 80, gy + 6, 0.8, -1); }
    if (sc === 'duel2') { gladiator(g, cx - 230, gy, 1.5, 'retiarius', 1); gladiator(g, cx + 190, gy, 1.5, 'secutor', -1); paintedTree(g, x0 + 60, gy + 10, 320, 'laurel'); }
    if (sc === 'hunt') { hunter(g, x0 + 150, gy, 1.45, 1); animal(g, cx + 140, gy, 1.25, 'lion', -1); animal(g, x1 - 90, gy - 6, 0.5, 'stag', 1); dab(g, cx + 30, gy + 8, 30, 'rgba(110,20,14,0.6)', 1, 0, 0.3); }
    if (sc === 'victory') { victory(g, cx, gy - 120, 1.2); garland(g, x0 + 20, x1 - 20, y0 + 20, 60); }
    frame(g, x0, y0, x1 - x0, y1 - y0, '#e3c27a', 6); frame(g, x0 + 14, y0 + 14, x1 - x0 - 28, y1 - y0 - 28, 'rgba(60,20,10,0.5)', 2);
  });
  for (let i = 0; i <= 4; i++) { const x = i * pw; rect(g, x - 30, topY + 10, 60, dadoY - topY - 10, '#1e1612'); candelabrum(g, x, topY + 40, dadoY - 20, '#d9b866', 4); }
  weather(g, W, H, { fade: 0.06, cracks: 4, lossAmt: 1.6 });
  return c;
}

// ------------------------------------------------------------------ SEAT STONE (2048 × 1024: 2 m along the row × 1 m)
export function seatStone() {
  const W = 2048, H = 1024, c = createCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  const base = [184, 172, 150], grey = [150, 146, 138];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const blk = Math.floor(x / 1024), t = fbm2(x / 160 + blk * 7, y / 160), f = fbm2(x / 18, y / 18);
    let col = mix(base, grey, clamp(t * 1.4 - 0.2));
    let k = 0.86 + 0.28 * f + (h2(x, y) - 0.5) * 0.12;
    const jx = Math.min(x % 1024, 1024 - (x % 1024)); if (jx < 5) k *= 0.45 + jx * 0.08;            // block joint
    if (jx >= 5 && jx < 14) k *= 0.88 + jx * 0.008;                                                    // worn arris
    const pit = n2(x / 6, y / 6); if (pit > 0.82) k *= 0.8;                                            // limestone pores
    const lich = fbm2(x / 90 + 30, y / 90); if (lich > 0.66) col = mix(col, [120, 128, 92], (lich - 0.66) * 1.6);   // lichen
    k *= 1 - 0.25 * clamp((y / H - 0.75) * 4) * fbm2(x / 50, y / 30);                                  // dirt low on the riser
    const i = (y * W + x) * 4; d[i] = col[0] * k; d[i + 1] = col[1] * k; d[i + 2] = col[2] * k; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // carved seat-width marks and the odd chipped corner
  for (let i = 0; i < 4; i++) { const x = 256 + i * 512; line(g, x, 40, x, 90, 'rgba(60,50,40,0.5)', 4); }
  for (let i = 0; i < 6; i++) { const x = rr(0, W), y = rr(0, 120), r = rr(10, 40); g.fillStyle = 'rgba(110,98,80,0.55)'; g.beginPath(); for (let a = 0; a < 6.28; a += 0.5) g.lineTo(x + Math.cos(a) * r * rr(0.6, 1.2), y + Math.sin(a) * r * rr(0.4, 0.8)); g.fill(); }
  return c;
}

// ------------------------------------------------------------------ ARENA SAND (2048², 6 m tile)
export function arenaSand() {
  const S = 2048, c = createCanvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const t = fbm2(x / 260, y / 260), f = h2(x * 1.3, y * 1.7), k = 0.82 + 0.3 * t + (f - 0.5) * 0.22;
    const rake = 0.5 + 0.5 * Math.sin((y + 40 * fbm2(x / 400, y / 400)) / 7);          // raked furrows
    const kk = k * (0.95 + 0.07 * rake * clamp(1 - fbm2(x / 300 + 9, y / 300) * 1.4));
    const i = (y * S + x) * 4; d[i] = 205 * kk; d[i + 1] = 178 * kk; d[i + 2] = 132 * kk; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 9000; i++) dab(g, rr(0, S), rr(0, S), rr(1.5, 5), pick(['#8a7458', '#e2d0a8', '#a08a66', '#6a5a48', '#f0e2c0']), 0.8);
  for (let i = 0; i < 26; i++) {      // trails of sandal prints
    let x = rr(0, S), y = rr(0, S), a = rr(0, 6.28);
    for (let k = 0; k < 14; k++) { a += rr(-0.2, 0.2); x += Math.cos(a) * 60; y += Math.sin(a) * 60; const side = k % 2 ? 1 : -1; dab(g, x - Math.sin(a) * 12 * side, y + Math.cos(a) * 12 * side, 15, 'rgba(110,86,56,0.35)', 1, a, 0.42); }
  }
  for (let i = 0; i < 4; i++) dab(g, rr(0, S), rr(0, S), rr(30, 70), 'rgba(90,30,20,0.25)', 1);
  return c;
}

// ------------------------------------------------------------------ OPUS INCERTUM (2048², 3 m tile): irregular lava & limestone in mortar
export function opusIncertum(tint = 0) {
  const S = 2048, c = createCanvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  const cell = 128, n = Math.ceil(S / cell), pts = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pts.push([(i + rr(0.1, 0.9)) * cell, (j + rr(0.1, 0.9)) * cell, pick([[96, 90, 86], [112, 104, 96], [150, 140, 122], [134, 120, 102], [122, 110, 96], [160, 150, 132]]), rr(0.85, 1.15)]);
  const P = (i, j) => pts[((j + n) % n) * n + ((i + n) % n)];
  const mortar = tint ? [200, 186, 160] : [176, 166, 146];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const ci = Math.floor(x / cell), cj = Math.floor(y / cell); let d1 = 1e9, d2 = 1e9, best = null, bx = 0, by = 0;
    for (let jj = -1; jj <= 1; jj++) for (let ii = -1; ii <= 1; ii++) {
      const p = P(ci + ii, cj + jj), px = p[0] + (ci + ii < 0 ? -S : ci + ii >= n ? S : 0), py = p[1] + (cj + jj < 0 ? -S : cj + jj >= n ? S : 0);
      const dd = Math.hypot(x - px, y - py) * (1 + 0.25 * (n2(x / 25, y / 25) - 0.5));
      if (dd < d1) { d2 = d1; d1 = dd; best = p; bx = px; by = py; } else if (dd < d2) d2 = dd;
    }
    const edge = d2 - d1, i = (y * S + x) * 4, gr = h2(x, y) - 0.5;
    if (edge < 15) { const k = 0.9 + gr * 0.2 - (edge < 4 ? 0.12 : 0); d[i] = mortar[0] * k; d[i + 1] = mortar[1] * k; d[i + 2] = mortar[2] * k; }
    else {
      const sh = clamp((edge - 15) / 30), lit = ((bx - x) + (by - y)) / (cell * 1.2);       // rounded stone face lit from the top left
      const k = best[3] * (0.72 + 0.28 * sh) * (1 + lit * 0.18) * (0.92 + 0.16 * fbm2(x / 14, y / 14)) + gr * 0.1;
      d[i] = best[2][0] * k; d[i + 1] = best[2][1] * k; d[i + 2] = best[2][2] * k;
    }
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ------------------------------------------------------------------ AWNING CLOTH (1024²): undyed linen with madder-red stripes
export function velum() {
  const S = 1024, c = createCanvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const stripe = (Math.floor(x / 128) % 2) === 0, w = 0.92 + 0.08 * ((x % 4 < 2) !== (y % 4 < 2)) + (n2(x / 3, y / 40) - 0.5) * 0.1, st = fbm2(x / 200, y / 200);
    const col = stripe ? [166, 58, 40] : [222, 208, 178], k = w * (0.9 + 0.15 * st);
    const i = (y * S + x) * 4; d[i] = col[0] * k; d[i + 1] = col[1] * k; d[i + 2] = col[2] * k; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let x = 0; x < S; x += 128) line(g, x, 0, x, S, 'rgba(60,40,30,0.4)', 3);      // seams
  return c;
}

// ------------------------------------------------------------------ PAINTED GAMES NOTICE (2048 × 1024): red letters on whitewash
export function gamesNotice() {
  const W = 2048, H = 1024, c = createCanvas(W, H), g = c.getContext('2d');
  rect(g, 0, 0, W, H, '#ebe4d4');
  const rows = [['GLADIATORVM · PARIA · XX', 150], ['PVGNABVNT · POMPEIS', 130], ['VENATIO · ET · SPARSIONES', 120], ['VELA · ERVNT', 170], ['FELICITER', 110]];
  let y = 170;
  for (const [t, sz] of rows) {
    g.save(); g.translate(W / 2, y); g.transform(1, 0, -0.12, 1, 0, 0); g.font = `bold ${sz}px "Liberation Serif"`; g.textAlign = 'center';
    g.fillStyle = 'rgba(150,30,20,0.92)'; g.fillText(t, 0, 0); g.fillStyle = 'rgba(150,30,20,0.35)'; g.fillText(t, 3, 2); g.restore();
    y += sz + 40;
  }
  weather(g, W, H, { fade: 0.1, cracks: 3, lossAmt: 2 });
  return c;
}

// ------------------------------------------------------------------ DEDICATION (2048 × 512): the builders' inscription (CIL X 852)
export function dedication() {
  const W = 2048, H = 512, c = createCanvas(W, H), g = c.getContext('2d');
  marble(g, 0, 0, W, H, '#e9e3d6', '#b0a898', { scale: 1 / 300, angle: 0.3 });
  frame(g, 26, 26, W - 52, H - 52, 'rgba(90,80,70,0.6)', 8); bevel(g, 26, 26, W - 52, H - 52, 12);
  const rows = ['C · QVINCTIVS · C · F · VALG · M · PORCIVS · M · F · DVO · VIR · QVINQ', 'COLONIAI · HONORIS · CAVSSA · SPECTACVLA · DE · SVA · PEQ', 'FAC · COER · ET · COLONEIS · LOCVM · IN · PERPETVOM · DEDER'];
  rows.forEach((t, k) => {
    const y = 160 + k * 120; g.font = 'bold 82px "Liberation Serif"'; g.textAlign = 'center';
    const w = g.measureText(t).width, sx = Math.min(1, (W - 140) / w);
    g.save(); g.translate(W / 2, y); g.scale(sx, 1);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillText(t, 2, 3); g.fillStyle = 'rgba(70,40,30,0.85)'; g.fillText(t, 0, 0); g.fillStyle = 'rgba(160,40,30,0.5)'; g.fillText(t, -1, -1);   // incised, traces of red paint
    g.restore();
  });
  return c;
}
