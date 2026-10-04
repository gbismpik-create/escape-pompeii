import * as THREE from 'three';
import { LANES, TRACK, GROUND, BUILDINGS } from './config.js';
import { CHUNK_VARIANTS } from './chunkVariants.js';
import { createObstacleSlots, createObstacleSpawner, hitsObstacle } from './obstacles.js';

const toCss = (hex) => `#${hex.toString(16).padStart(6, '0')}`;

// One square tile = one lane wide. Lines on two edges; repeated, they form a grid
// whose long lines mark the lane edges and whose cross lines show forward speed.
function createTileTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = toCss(GROUND.streetColor);
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = toCss(GROUND.lineColor);
  ctx.fillRect(0, 0, GROUND.lineWidthPx, size); // edge along the lane
  ctx.fillRect(0, 0, size, GROUND.lineWidthPx); // edge across the lane

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = GROUND.anisotropy; // keeps distant lines sharp
  return texture;
}

// Everything below is created ONCE and shared by every chunk. Sharing geometry
// and materials means the GPU only stores them once, however many chunks exist.
function createSharedResources() {
  const L = TRACK.chunkLength;
  const streetWidth = TRACK.streetWidthInLanes * LANES.width;

  const texture = createTileTexture();
  texture.repeat.set(TRACK.streetWidthInLanes, L / LANES.width);

  return {
    streetWidth,
    streetGeometry: new THREE.PlaneGeometry(streetWidth, L),
    streetMaterial: new THREE.MeshStandardMaterial({ map: texture }),
    sideGeometry: new THREE.PlaneGeometry(TRACK.sideGroundWidth, L),
    sideMaterial: new THREE.MeshStandardMaterial({ color: GROUND.sideColor }),
    // A 1×1×1 box. Each building is this box scaled to its size.
    boxGeometry: new THREE.BoxGeometry(1, 1, 1),
    buildingMaterials: BUILDINGS.colors.map((color) => new THREE.MeshStandardMaterial({ color })),
  };
}

// Builds one chunk: a street, ground on both sides, and enough building boxes
// for the biggest variant. Positions are local to the chunk's group, which
// starts at z = 0 and extends forward to z = -chunkLength.
function createChunk(shared, maxBoxes) {
  const L = TRACK.chunkLength;
  const group = new THREE.Group();

  const street = new THREE.Mesh(shared.streetGeometry, shared.streetMaterial);
  street.rotation.x = -Math.PI / 2; // planes are vertical by default; lay it flat
  street.position.z = -L / 2;
  street.receiveShadow = true;
  group.add(street);

  for (const side of [-1, 1]) {
    const ground = new THREE.Mesh(shared.sideGeometry, shared.sideMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(side * (shared.streetWidth + TRACK.sideGroundWidth) / 2, 0, -L / 2);
    ground.receiveShadow = true;
    group.add(ground);
  }

  const boxes = [];
  for (let i = 0; i < maxBoxes; i++) {
    const box = new THREE.Mesh(shared.boxGeometry, shared.buildingMaterials[0]);
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
    boxes.push(box);
  }

  const obstacles = createObstacleSlots(group);

  return { group, boxes, obstacles, index: 0 };
}

// Rearranges a chunk's existing boxes to match a variant; unused boxes are hidden.
function applyVariant(chunk, variant, shared) {
  const half = shared.streetWidth / 2;
  chunk.boxes.forEach((box, i) => {
    const b = variant[i];
    box.visible = Boolean(b);
    if (!b) return;
    const depth = b.depth ?? BUILDINGS.defaultDepth;
    const inset = b.inset ?? 0;
    box.scale.set(depth, b.height, b.length);
    box.position.set(b.side * (half + inset + depth / 2), b.height / 2, -(b.z + b.length / 2));
    box.material = shared.buildingMaterials[b.shade ?? 0];
  });
}

// The endless track. Chunk number i covers z from -i·L to -(i+1)·L.
// A fixed pool of chunks is reused: when one falls behind the player, it is
// moved to the front and given a new random layout. Nothing new is created.
export function createTrack(scene) {
  const L = TRACK.chunkLength;
  const shared = createSharedResources();
  const maxBoxes = Math.max(...CHUNK_VARIANTS.map((v) => v.length));

  const chunks = []; // ordered from furthest behind to furthest ahead
  const spawner = createObstacleSpawner();

  function placeChunk(chunk, index) {
    chunk.index = index;
    chunk.group.position.z = -index * L;
    const variant = CHUNK_VARIANTS[Math.floor(Math.random() * CHUNK_VARIANTS.length)];
    applyVariant(chunk, variant, shared);
    spawner.fill(chunk.obstacles, chunk.group.position.z);
  }

  for (let i = -TRACK.chunksBehind; i <= TRACK.chunksAhead; i++) {
    const chunk = createChunk(shared, maxBoxes);
    scene.add(chunk.group);
    chunks.push(chunk);
  }

  // Lays every chunk out fresh from the start line (used for new runs).
  function reset() {
    spawner.reset();
    chunks.forEach((chunk, i) => placeChunk(chunk, i - TRACK.chunksBehind));
  }
  reset();

  return {
    reset,

    collides(hitbox) {
      return chunks.some((chunk) => hitsObstacle(chunk.obstacles, hitbox));
    },

    update(playerZ) {
      const playerIndex = Math.floor(-playerZ / L);
      // Recycle every chunk that is now too far behind.
      while (chunks[0].index < playerIndex - TRACK.chunksBehind) {
        const chunk = chunks.shift();
        placeChunk(chunk, chunks[chunks.length - 1].index + 1);
        chunks.push(chunk);
      }
    },
  };
}
