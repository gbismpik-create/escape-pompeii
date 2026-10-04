import * as THREE from 'three';
import { VESUVIUS } from './config.js';
import { cylinder, merge } from './geometry.js';

// Vesuvius and its eruption column, low-poly, far away on the horizon.
// Built once from merged shapes: one draw call.

function cloud(radius, [x, y, z], color, squash = 1) {
  const g = new THREE.IcosahedronGeometry(radius, 0); // 20 flat faces
  g.scale(1, squash, 1);
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv'); // icosahedra have no index; match the other shapes
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return g;
}

export function createVesuvius() {
  const { height: h, baseRadius: r, plumeHeight: ph } = VESUVIUS;
  const mountain = cylinder(r * 0.18, r, h, 9, [0, h / 2, 0], 0x5a5648).toNonIndexed();
  mountain.deleteAttribute('uv');

  // Rough up the outline with a fixed pseudo-random pattern. The offset
  // depends on a corner's position, so every face sharing that corner moves
  // it the same way and no gaps open up.
  const pos = mountain.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > h - 0.5) pos.setY(i, y + Math.sin(pos.getX(i) * 0.37 + pos.getZ(i) * 0.71) * h * 0.12);
  }
  mountain.computeVertexNormals();

  const shapes = [mountain];
  // The column: a stack of puffs, darker at the base, growing as it rises...
  for (let k = 0; k < 6; k++) {
    const t = k / 5;
    shapes.push(cloud(ph * (0.06 + 0.09 * t), [Math.sin(k * 2.1) * ph * 0.025, h + ph * 0.75 * t, 0], t < 0.4 ? 0x5e5853 : 0x857d76));
  }
  // ...then spreading sideways at the top into the "umbrella pine" cloud.
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    shapes.push(cloud(ph * 0.19, [Math.cos(a) * ph * 0.24 - ph * 0.1, h + ph + Math.sin(k) * ph * 0.03, Math.sin(a) * ph * 0.15], 0x9a928a, 0.45));
  }
  shapes.push(cloud(ph * 0.27, [-ph * 0.08, h + ph * 1.06, 0], 0xa8a097, 0.4));

  const nonIndexed = shapes.map((g) => (g.index ? g.toNonIndexed() : g));
  nonIndexed.forEach((g) => g.deleteAttribute('uv'));
  const geometry = merge(nonIndexed);

  // Lit like everything else (so it darkens with each phase), but ignores the
  // scene fog, which would hide it completely at this distance. Haze is faked
  // per phase instead: see setHaze.
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  return {
    mesh,
    // Fades towards the horizon colour: amount 0 = clear, 1 = invisible.
    setHaze(horizonColor, amount) {
      material.color.setScalar(1 - amount);
      material.emissive.copy(horizonColor).multiplyScalar(amount);
    },
  };
}
