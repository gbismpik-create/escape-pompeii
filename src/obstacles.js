import * as THREE from 'three';
import { LANES, TRACK, OBSTACLES } from './config.js';
import { laneToX } from './lanes.js';

// Shared by every obstacle (see the note on pooling in track.js).
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const materials = Object.fromEntries(
  Object.entries(OBSTACLES.types).map(([type, t]) => [
    type,
    new THREE.MeshStandardMaterial({ color: t.color }),
  ]),
);

const rowsPerChunk = Math.floor((TRACK.chunkLength - OBSTACLES.firstRowOffset) / OBSTACLES.rowSpacing) + 1;

function randomType() {
  const entries = Object.entries(OBSTACLES.weights);
  let r = Math.random() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [type, weight] of entries) {
    r -= weight;
    if (r < 0) return type;
  }
  return entries[0][0];
}

// One row = one entry per lane: null (empty) or an obstacle type.
// The rule that keeps every row passable: at least one lane must not be a
// full block. Low boxes can be jumped and bars slid under, so any lane that
// isn't a block is a way through, and rows are far enough apart to reach it.
function randomRow() {
  for (let tries = 0; tries < 20; tries++) {
    const row = Array.from({ length: LANES.count }, () =>
      Math.random() < OBSTACLES.emptyLaneChance ? null : randomType(),
    );
    const hasObstacle = row.some(Boolean);
    const hasWayThrough = row.some((type) => type !== 'block');
    if (hasObstacle && hasWayThrough) return row;
  }
  return Array(LANES.count).fill(null); // give up: an empty row is always safe
}

// Creates the (hidden) obstacle meshes a chunk will ever need: one per lane per row.
export function createObstacleSlots(group) {
  const slots = [];
  for (let i = 0; i < rowsPerChunk * LANES.count; i++) {
    const mesh = new THREE.Mesh(boxGeometry, materials.block);
    mesh.castShadow = true;
    mesh.visible = false;
    group.add(mesh);
    slots.push({ mesh, hitbox: new THREE.Box3(), active: false });
  }
  return slots;
}

// Fills a chunk's slots with a fresh random set of obstacle rows.
// chunkZ is the world z where the chunk starts (it extends towards -z).
export function placeObstacles(slots, chunkZ) {
  const m = OBSTACLES.hitboxMargin;
  for (let r = 0; r < rowsPerChunk; r++) {
    const localZ = -(OBSTACLES.firstRowOffset + r * OBSTACLES.rowSpacing);
    const distanceFromStart = -(chunkZ + localZ);
    const spawn = distanceFromStart >= OBSTACLES.safeStartDistance && Math.random() < OBSTACLES.rowChance;
    const row = spawn ? randomRow() : [];

    for (let lane = 0; lane < LANES.count; lane++) {
      const slot = slots[r * LANES.count + lane];
      const type = row[lane];
      slot.active = Boolean(type);
      slot.mesh.visible = slot.active;
      if (!type) continue;

      const t = OBSTACLES.types[type];
      const x = laneToX(lane);
      slot.mesh.material = materials[type];
      slot.mesh.scale.set(OBSTACLES.width, t.height, t.depth);
      slot.mesh.position.set(x, t.bottom + t.height / 2, localZ);

      // The hitbox is in world coordinates, so collision checks don't need
      // to know which chunk an obstacle belongs to.
      const z = chunkZ + localZ;
      slot.hitbox.min.set(x - OBSTACLES.width / 2 + m, t.bottom + m, z - t.depth / 2 + m);
      slot.hitbox.max.set(x + OBSTACLES.width / 2 - m, t.bottom + t.height - m, z + t.depth / 2 - m);
    }
  }
}

export function hitsObstacle(slots, hitbox) {
  return slots.some((slot) => slot.active && slot.hitbox.intersectsBox(hitbox));
}
