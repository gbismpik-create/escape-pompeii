import * as THREE from 'three';
import { LANES, TRACK, OBSTACLES, PLAYER } from './config.js';
import { laneToX } from './lanes.js';
import { speedAt } from './speed.js';

// Each obstacle type is drawn by one InstancedMesh for the whole track.
// Stepping stones are rounded (an 10-sided cylinder squashed into an oval);
// bars and blocks are boxes for now.
const GEOMETRIES = {
  low: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  bar: new THREE.BoxGeometry(1, 1, 1),
  block: new THREE.BoxGeometry(1, 1, 1),
};
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

// Rows are closest together at the slowest speed, so that decides how many
// rows a chunk can ever hold.
const minRowSpacing = PLAYER.startSpeed * OBSTACLES.rowSpacingTime;
const rowsPerChunk = Math.ceil(TRACK.chunkLength / minRowSpacing);
const slotsPerChunk = rowsPerChunk * LANES.count;

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
// full block. Stepping stones can be jumped and bars slid under, so any lane
// that isn't a block is a way through, and rows are far enough apart to reach it.
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

// All obstacles on the track. Each chunk owns a fixed block of slots
// (one per lane per row); filling a chunk overwrites its block.
export function createObstacles(scene, chunkCount) {
  const total = slotsPerChunk * chunkCount;
  const slots = Array.from({ length: total }, () => ({ type: null, hitbox: new THREE.Box3() }));

  const meshes = Object.fromEntries(
    Object.entries(OBSTACLES.types).map(([type, t]) => {
      const mesh = new THREE.InstancedMesh(
        GEOMETRIES[type],
        new THREE.MeshLambertMaterial({ color: t.color, flatShading: true }),
        total,
      );
      mesh.name = `obstacle:${type}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // instances move; see architecture.js
      for (let i = 0; i < total; i++) mesh.setMatrixAt(i, HIDDEN);
      scene.add(mesh);
      return [type, mesh];
    }),
  );

  const matrix = new THREE.Matrix4();
  let nextRowDistance = 0;

  function setSlot(index, type, distance, lane) {
    const slot = slots[index];
    slot.type = type;
    for (const [t, mesh] of Object.entries(meshes)) {
      if (t !== type) mesh.setMatrixAt(index, HIDDEN);
    }
    if (!type) return;

    const t = OBSTACLES.types[type];
    const x = laneToX(lane);
    const z = -distance;
    const width = type === 'low' ? OBSTACLES.width * 0.9 : OBSTACLES.width;
    matrix.makeScale(width, t.height, t.depth).setPosition(x, t.bottom + t.height / 2, z);
    meshes[type].setMatrixAt(index, matrix);

    const m = OBSTACLES.hitboxMargin;
    slot.hitbox.min.set(x - OBSTACLES.width / 2 + m, t.bottom + m, z - t.depth / 2 + m);
    slot.hitbox.max.set(x + OBSTACLES.width / 2 - m, t.bottom + t.height - m, z + t.depth / 2 - m);
  }

  return {
    reset() {
      nextRowDistance = OBSTACLES.safeStartDistance;
    },

    // Fills a chunk's slots with the rows that fall inside it. Rows don't
    // line up with chunks: a running "next row" distance carries over from
    // one chunk to the next, so chunks must be filled in order.
    // chunkZ is the world z where the chunk starts (it extends towards -z).
    fill(chunkSlot, chunkZ) {
      const start = chunkSlot * slotsPerChunk;
      for (let i = 0; i < slotsPerChunk; i++) setSlot(start + i, null);

      const chunkEnd = -chunkZ + TRACK.chunkLength;
      for (let r = 0; nextRowDistance < chunkEnd; r++) {
        const distance = nextRowDistance;
        nextRowDistance += speedAt(distance) * OBSTACLES.rowSpacingTime;
        if (r < rowsPerChunk && Math.random() < OBSTACLES.rowChance) {
          randomRow().forEach((type, lane) => setSlot(start + r * LANES.count + lane, type, distance, lane));
        }
      }

      for (const mesh of Object.values(meshes)) {
        mesh.instanceMatrix.addUpdateRange(start * 16, slotsPerChunk * 16);
        mesh.instanceMatrix.needsUpdate = true;
      }
    },

    collides(hitbox) {
      return slots.some((slot) => slot.type && slot.hitbox.intersectsBox(hitbox));
    },
  };
}
