import * as THREE from 'three';
import { LANES, GROUND } from './config.js';

// One square tile = one lane wide. Lines on two edges; repeated, they form a grid
// whose long lines mark the lane edges and whose cross lines show forward speed.
function createTileTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `#${GROUND.color.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = `#${GROUND.lineColor.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, GROUND.lineWidthPx, size); // edge along the lane
  ctx.fillRect(0, 0, size, GROUND.lineWidthPx); // edge across the lane

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = GROUND.anisotropy; // keeps distant lines sharp
  return texture;
}

// The ground follows the player so it never runs out. It moves in whole tile
// steps, so the lines appear to stream past even though the ground stays put.
export function createTrack(scene) {
  const width = LANES.width * GROUND.widthInLanes;
  const lengthInTiles = Math.round(GROUND.length / LANES.width);

  const texture = createTileTexture();
  texture.repeat.set(GROUND.widthInLanes, lengthInTiles);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(width, lengthInTiles * LANES.width),
    new THREE.MeshStandardMaterial({ map: texture }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  return {
    update(playerZ) {
      ground.position.z = Math.round(playerZ / LANES.width) * LANES.width;
    },
  };
}
