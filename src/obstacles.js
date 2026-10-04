import * as THREE from 'three';
import { LANES, TRACK, OBSTACLES, PLAYER } from './config.js';
import { laneToX } from './lanes.js';
import { speedAt } from './speed.js';

// Shared by every obstacle (see the note on pooling in track.js).
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const materials = Object.fromEntries(
  Object.entries(OBSTACLES.types).map(([type, t]) => [
    type,
    new THREE.MeshStandardMaterial({ color: t.color }),
  ]),
);

// Rows are closest together at the slowest speed, so that decides how many
// rows (and so how many meshes) a chunk can ever need.
const minRowSpacing = PLAYER.startSpeed * OBSTACLES.rowSpacingTime;
const rowsPerChunk = Math.ceil(TRACK.chunkLength / minRowSpacing);

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

// Places obstacle rows along the track. Rows don't line up with chunks:
// a running "next row" distance carries over from one chunk to the next.
export function createObstacleSpawner() {
  let nextRowDistance = 0;

  return {
    reset() {
      nextRowDistance = OBSTACLES.safeStartDistance;
    },

    // Fills a chunk's slots with the rows that fall inside it.
    // Chunks must be filled in order. chunkZ is the world z where the chunk
    // starts (it extends towards -z).
    fill(slots, chunkZ) {
      for (const slot of slots) {
        slot.active = false;
        slot.mesh.visible = false;
      }

      const chunkEnd = -chunkZ + TRACK.chunkLength;
      for (let r = 0; nextRowDistance < chunkEnd; r++) {
        const distance = nextRowDistance;
        nextRowDistance += speedAt(distance) * OBSTACLES.rowSpacingTime;
        if (r < rowsPerChunk && Math.random() < OBSTACLES.rowChance) {
          placeRow(slots.slice(r * LANES.count, (r + 1) * LANES.count), randomRow(), distance, chunkZ);
        }
      }
    },
  };
}

function placeRow(rowSlots, row, distance, chunkZ) {
  const m = OBSTACLES.hitboxMargin;
  const z = -distance; // world z of the row
  row.forEach((type, lane) => {
    if (!type) return;
    const slot = rowSlots[lane];
    const t = OBSTACLES.types[type];
    const x = laneToX(lane);
    slot.active = true;
    slot.mesh.visible = true;
    slot.mesh.material = materials[type];
    slot.mesh.scale.set(OBSTACLES.width, t.height, t.depth);
    slot.mesh.position.set(x, t.bottom + t.height / 2, z - chunkZ); // local to the chunk

    // The hitbox is in world coordinates, so collision checks don't need
    // to know which chunk an obstacle belongs to.
    slot.hitbox.min.set(x - OBSTACLES.width / 2 + m, t.bottom + m, z - t.depth / 2 + m);
    slot.hitbox.max.set(x + OBSTACLES.width / 2 - m, t.bottom + t.height - m, z + t.depth / 2 - m);
  });
}

export function hitsObstacle(slots, hitbox) {
  return slots.some((slot) => slot.active && slot.hitbox.intersectsBox(hitbox));
}
