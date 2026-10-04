import * as THREE from 'three';
import { LANES, TRACK, OBSTACLES, TOWN } from './config.js';
import { laneToX } from './lanes.js';
import { speedAt, MAX_SPEED_MULTIPLIER } from './speed.js';
import { box, cylinder, merge } from './geometry.js';

// Each obstacle type is one small model (merged, vertex-coloured shapes)
// drawn by one InstancedMesh for the whole track. Models are built from the
// sizes in config.js, so what you see matches the hitbox. Origin: the centre
// of the lane at ground level; the player approaches from +z.
const W = OBSTACLES.width;
const T = OBSTACLES.types;

function steppingStone() {
  const stone = cylinder(0.45, 0.5, 1, 10, [0, 0.5, 0], TOWN.limestone);
  stone.scale(W * 0.9, T.low.height, T.low.depth); // squash into an oval
  return stone;
}

// A roof beam that has come down across the lane, still holding a section
// of tiles, propped up by two poles at the lane edges (clear of a slide).
function fallenBeam() {
  const b = T.bar.bottom;
  const top = b + T.bar.height;
  const tilt = 0.2; // the tile section leans towards the player
  const slabY = (b + 0.32 + top) / 2;
  const shapes = [
    box([W + 0.2, 0.32, 0.4], [0, b + 0.16, 0], TOWN.wood, [0, 0, 0.06]),
    box([W, top - b - 0.36, 0.12], [0, slabY, 0.04], TOWN.roof, [tilt, 0, 0.05]),
  ];
  // Rows of curved tiles on the face the player sees.
  for (let y = b + 0.55; y < top - 0.1; y += 0.32) {
    const z = 0.04 + (y - slabY) * Math.tan(tilt) + 0.08;
    shapes.push(box([W - 0.1, 0.07, 0.06], [0, y, z], TOWN.roofDark, [tilt, 0, 0.05]));
  }
  for (const side of [-1, 1]) {
    shapes.push(cylinder(0.06, 0.07, b + 0.1, 6, [side * 0.85, b / 2, 0], TOWN.wood, [0, 0, side * 0.08]));
  }
  return merge(shapes);
}

// A section of house wall that has collapsed into the street: plaster with
// the red band, a broken top, a toppled column drum and rubble in front.
function collapsedWall() {
  const h = T.block.height;
  return merge([
    box([W - 0.2, h - 0.7, 0.6], [0, (h - 0.7) / 2, -0.2], TOWN.plaster.ochre),
    box([W - 0.18, 1.0, 0.04], [0, 0.5, 0.11], TOWN.dado),
    box([1.1, 0.45, 0.6], [-0.35, h - 0.7 + 0.22, -0.2], TOWN.plaster.ochre),
    box([0.5, 0.25, 0.6], [-0.6, h - 0.12, -0.2], TOWN.plaster.ochre),
    box([0.3, 0.2, 0.3], [0.45, h - 0.6, -0.2], TOWN.plaster.ochre, [0, 0.3, 0.5]),
    cylinder(0.32, 0.32, 1.2, 8, [0.1, 0.32, 0.45], TOWN.stucco, [0, 0.25, Math.PI / 2]),
    box([0.45, 0.3, 0.35], [-0.6, 0.15, 0.5], TOWN.stone, [0.2, 0.5, 0.1]),
    box([0.3, 0.22, 0.3], [0.7, 0.11, 0.55], TOWN.plaster.ochre, [0, 0.9, 0.2]),
    box([0.35, 0.18, 0.25], [-0.15, 0.09, 0.62], TOWN.stone, [0.1, 1.3, 0]),
  ]).translate(0, 0, -0.2); // centre the wall and its rubble over the hitbox
}

const GEOMETRIES = { low: steppingStone(), bar: fallenBeam(), block: collapsedWall() };
const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

// Rows are placed far ahead, before we know which phase (and so which speed
// multiplier) the player will be in when they get there. So rows are spaced
// for the fastest phase: the reaction time is never shorter than
// rowSpacingTime, only longer in slower phases.
const rowSpeed = (distance) => speedAt(distance) * MAX_SPEED_MULTIPLIER;

// Rows are closest together at the slowest speed, so that decides how many
// rows a chunk can ever hold.
const minRowSpacing = rowSpeed(0) * OBSTACLES.rowSpacingTime;
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
    Object.keys(OBSTACLES.types).map((type) => {
      const mesh = new THREE.InstancedMesh(GEOMETRIES[type], material, total);
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
    meshes[type].setMatrixAt(index, matrix.makeTranslation(x, 0, z));

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
        nextRowDistance += rowSpeed(distance) * OBSTACLES.rowSpacingTime;
        if (r < rowsPerChunk && Math.random() < OBSTACLES.rowChance) {
          randomRow().forEach((type, lane) => setSlot(start + r * LANES.count + lane, type, distance, lane));
        }
      }

      for (const mesh of Object.values(meshes)) {
        mesh.instanceMatrix.addUpdateRange(start * 16, slotsPerChunk * 16);
        mesh.instanceMatrix.needsUpdate = true;
      }
    },

    // The obstacle the player is touching as { type, hitbox }, or null.
    findCollision(hitbox) {
      return slots.find((s) => s.type && s.hitbox.intersectsBox(hitbox)) ?? null;
    },

    // Distance along the track from z to the nearest obstacle (Infinity if none).
    distanceToNearest(z) {
      let nearest = Infinity;
      for (const slot of slots) {
        if (!slot.type) continue;
        const slotZ = (slot.hitbox.min.z + slot.hitbox.max.z) / 2;
        nearest = Math.min(nearest, Math.abs(slotZ - z));
      }
      return nearest;
    },
  };
}

// Did the player clip the side of an obstacle (rather than hit it head-on)?
// A swept test: for each axis, how far through the last frame did the
// player's box start overlapping the obstacle on that axis? The axis that
// started overlapping LAST is the face that was hit. If that's the side (x),
// it's a side clip. Running into the front (z), landing on top or standing
// up into it (y) are real crashes. Uses last frame's hitbox, so the answer
// doesn't depend on the frame rate.
function entry(prevMin, prevMax, curMin, curMax, obMin, obMax) {
  if (prevMax > obMin && prevMin < obMax) return -Infinity; // already overlapping
  if (prevMax <= obMin) {
    const moved = curMax - prevMax;
    return moved > 0 ? (obMin - prevMax) / moved : Infinity;
  }
  const moved = prevMin - curMin;
  return moved > 0 ? (prevMin - obMax) / moved : Infinity;
}

export function isSideClip(previousHitbox, hitbox, obstacleHitbox) {
  const p = previousHitbox;
  const c = hitbox;
  const o = obstacleHitbox;
  const x = entry(p.min.x, p.max.x, c.min.x, c.max.x, o.min.x, o.max.x);
  const y = entry(p.min.y, p.max.y, c.min.y, c.max.y, o.min.y, o.max.y);
  const z = entry(p.min.z, p.max.z, c.min.z, c.max.z, o.min.z, o.max.z);
  return x > y && x > z;
}
