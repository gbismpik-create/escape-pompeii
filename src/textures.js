import * as THREE from 'three';
import { TOWN, STREET } from './config.js';

const toCss = (hex) => `#${hex.toString(16).padStart(6, '0')}`;

// A tile of basalt road, drawn once at load time.
// One tile = one lane square. Irregular stones come from a jittered grid;
// the jitter repeats at the edges so tiles join without seams. A dark cart
// rut runs along the tile's edge, so when tiled the ruts mark the lane lines,
// just as carts wore grooves into the real streets of Pompeii.
export function createRoadTexture() {
  const size = 256;
  const cells = 4; // stones per row
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = toCss(TOWN.road.gaps);
  ctx.fillRect(0, 0, size, size);

  // A fixed pseudo-random sequence, so the road looks the same every load.
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const jitter = [];
  for (let i = 0; i < cells * cells; i++) jitter.push([random() - 0.5, random() - 0.5]);

  const step = size / cells;
  const corner = (i, j) => {
    const [jx, jy] = jitter[(i % cells) + (j % cells) * cells];
    return [i * step + jx * step * 0.5, j * step + jy * step * 0.5];
  };

  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const points = [corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)];
      ctx.fillStyle = toCss(TOWN.road.stones[Math.floor(random() * TOWN.road.stones.length)]);
      // Draw each stone 9 times (shifted by ±1 tile) so stones crossing an
      // edge reappear on the opposite side: that is what makes it tile.
      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          ctx.beginPath();
          points.forEach(([x, y], k) => (k ? ctx.lineTo(x + ox, y + oy) : ctx.moveTo(x + ox, y + oy)));
          ctx.closePath();
          ctx.save();
          ctx.translate(x0(points) + ox, y0(points) + oy);
          ctx.scale(0.9, 0.9); // shrink towards the centre to leave a gap
          ctx.translate(-x0(points) - ox, -y0(points) - oy);
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  // Cart rut on the tile edge (drawn on both sides so it wraps).
  const rut = ctx.createLinearGradient(-10, 0, 10, 0);
  rut.addColorStop(0, 'rgba(0,0,0,0)');
  rut.addColorStop(0.5, toCss(TOWN.road.ruts));
  rut.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rut;
  ctx.fillRect(-10, 0, 20, size);
  ctx.save();
  ctx.translate(size, 0);
  ctx.fillRect(-10, 0, 20, size);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = STREET.anisotropy;
  return texture;
}

const x0 = (pts) => pts.reduce((s, p) => s + p[0], 0) / pts.length;
const y0 = (pts) => pts.reduce((s, p) => s + p[1], 0) / pts.length;
