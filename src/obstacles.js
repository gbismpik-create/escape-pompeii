import * as THREE from 'three';
import { LANES, TRACK, OBSTACLES } from './config.js';
import { laneToX } from './lanes.js';
import { speedAt, MAX_SPEED_MULTIPLIER } from './speed.js';

// Obstacles from the street kit. A row is either one piece across all
// three lanes (stepping stones to jump, a fallen beam to slide under) or a
// mix of single-lane pieces (rubble to jump; a cart or amphorae to dodge).
//
// Each piece is drawn with one InstancedMesh per material for the whole
// track. Each chunk owns a fixed block of instances; filling a chunk
// rewrites its block. Hitboxes come from the models (see OBSTACLES).

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const TURN = new THREE.Matrix4().makeRotationY(Math.PI); // kit street runs along +z; the game to -z

// Rows are placed far ahead, before we know which phase (and so which speed
// multiplier) the player will be in when they get there. So rows are spaced
// for the fastest phase: the reaction time is never shorter than
// rowSpacingTime, only longer in slower phases.
const rowSpeed = (distance) => speedAt(distance) * MAX_SPEED_MULTIPLIER;
// Rows are closest together at the slowest speed, so that decides how many
// rows a chunk can ever hold.
const rowsPerChunk = Math.ceil(TRACK.chunkLength / (rowSpeed(0) * OBSTACLES.rowSpacingTime));

function weightedPick(table) {
  const entries = Object.entries(table);
  let r = Math.random() * entries.reduce((sum, [, p]) => sum + p.weight, 0);
  for (const [name, p] of entries) if ((r -= p.weight) < 0) return name;
  return entries[0][0];
}

// One row: { full: pieceName } or { lanes: [pieceName | null, ...] }.
// Keeps every row passable: a full row can always be jumped or slid under,
// and a mixed row always keeps at least one lane that isn't a block.
function randomRow() {
  if (Math.random() < OBSTACLES.fullRowChance) return { full: weightedPick(OBSTACLES.fullRow) };
  for (let tries = 0; tries < 20; tries++) {
    const lanes = Array.from({ length: LANES.count }, () =>
      Math.random() < OBSTACLES.emptyLaneChance ? null : weightedPick(OBSTACLES.lane),
    );
    const hasObstacle = lanes.some(Boolean);
    const hasWayThrough = lanes.some((p) => !p || OBSTACLES.lane[p].move !== 'block');
    if (hasObstacle && hasWayThrough) return { lanes };
  }
  return { lanes: Array(LANES.count).fill(null) }; // an empty row is always safe
}

// A piece's hitbox around its own origin, in game orientation (turned 180°).
function pieceHitbox(parts, { move, hitboxLength }) {
  const box = new THREE.Box3();
  for (const { geometry } of parts) {
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox);
  }
  box.applyMatrix4(TURN);
  const m = OBSTACLES.hitboxMargin;
  box.min.addScalar(m);
  box.max.addScalar(-m);
  box.min.y = Math.max(box.min.y, 0);
  if (move === 'slide') {
    box.min.y = OBSTACLES.slideGap.bottom + m;
    box.max.y = OBSTACLES.slideGap.top - m;
  }
  if (move === 'block') box.max.y = OBSTACLES.blockHeight - m;
  if (hitboxLength) {
    // Only hitboxLength metres around the model's origin count (not the cart's thin poles).
    const z = 0;
    box.min.z = Math.max(box.min.z, z - hitboxLength / 2);
    box.max.z = Math.min(box.max.z, z + hitboxLength / 2);
  }
  return box;
}

export function createObstacles(scene, chunkCount, kit) {
  const pieces = {
    ...Object.fromEntries(Object.entries(OBSTACLES.fullRow).map(([name, p]) => [name, { ...p, perRow: 1 }])),
    ...Object.fromEntries(Object.entries(OBSTACLES.lane).map(([name, p]) => [name, { ...p, perRow: LANES.count }])),
  };
  for (const [name, piece] of Object.entries(pieces)) {
    const parts = kit.near[name];
    if (!parts) throw new Error(`The street kit has no "${name}"`);
    piece.hitbox = pieceHitbox(parts, piece);
    const capacity = chunkCount * rowsPerChunk * piece.perRow;
    piece.meshes = parts.map(({ geometry, material }) => {
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.name = `obstacle:${name}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // instances move all over the track
      for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, HIDDEN);
      scene.add(mesh);
      return mesh;
    });
  }

  // The active obstacles of each chunk: { type, move, hitbox } (world space).
  const active = Array.from({ length: chunkCount }, () => []);
  const matrix = new THREE.Matrix4();
  let nextRowDistance = 0;

  function place(name, index, x, z, list) {
    const piece = pieces[name];
    matrix.makeTranslation(x, 0, z).multiply(TURN);
    for (const mesh of piece.meshes) mesh.setMatrixAt(index, matrix);
    const hitbox = piece.hitbox.clone().translate(new THREE.Vector3(x, 0, z));
    list.push({ type: name, move: piece.move, hitbox });
  }

  return {
    reset() {
      nextRowDistance = OBSTACLES.safeStartDistance;
    },

    // Fills a chunk's block with the rows that fall inside it. Rows don't
    // line up with chunks: a running "next row" distance carries over from
    // one chunk to the next, so chunks must be filled in order.
    // chunkZ is the world z where the chunk starts (it extends towards -z).
    fill(chunkSlot, chunkZ) {
      for (const piece of Object.values(pieces)) {
        const block = rowsPerChunk * piece.perRow;
        for (let i = 0; i < block; i++) for (const mesh of piece.meshes) mesh.setMatrixAt(chunkSlot * block + i, HIDDEN);
      }
      const list = (active[chunkSlot] = []);

      const chunkEnd = -chunkZ + TRACK.chunkLength;
      for (let r = 0; nextRowDistance < chunkEnd; r++) {
        const distance = nextRowDistance;
        nextRowDistance += rowSpeed(distance) * OBSTACLES.rowSpacingTime;
        if (r >= rowsPerChunk || Math.random() >= OBSTACLES.rowChance) continue;
        const row = randomRow();
        const rowIndex = chunkSlot * rowsPerChunk + r;
        if (row.full) {
          place(row.full, rowIndex, 0, -distance, list);
        } else {
          row.lanes.forEach((name, lane) => {
            if (name) place(name, rowIndex * LANES.count + lane, laneToX(lane), -distance, list);
          });
        }
      }

      for (const piece of Object.values(pieces)) {
        const block = rowsPerChunk * piece.perRow;
        for (const mesh of piece.meshes) {
          mesh.instanceMatrix.addUpdateRange(chunkSlot * block * 16, block * 16);
          mesh.instanceMatrix.needsUpdate = true;
        }
      }
    },

    // The obstacle the player is touching ({ type, move, hitbox }), or null.
    findCollision(hitbox) {
      for (const list of active) for (const o of list) if (o.hitbox.intersectsBox(hitbox)) return o;
      return null;
    },

    // Every obstacle on the track (for tests and tools).
    list() {
      return active.flat();
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
