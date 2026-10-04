import * as THREE from 'three';
import { LANES, TRACK, OBSTACLES } from './config.js';
import { laneToX } from './lanes.js';
import { speedAt, MAX_SPEED_MULTIPLIER } from './speed.js';

// Obstacles from the street kit. A row is either one piece across all
// three lanes (a fallen column to jump, a fallen beam to slide under) or a
// mix of single-lane pieces (rubble to jump; a cart or amphorae to dodge).
//
// Each piece is drawn with one InstancedMesh per material for the whole
// track. After a chunk is filled, the pieces in use are packed at the front
// of each InstancedMesh and only those are drawn (mesh.count): hidden
// spare instances would still cost the GPU their triangles.
// Hitboxes come from the models (see OBSTACLES).

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
function pieceHitbox(parts, { move, hitboxLength, hitboxHeight }) {
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
  if (hitboxHeight) box.max.y = Math.min(box.max.y, hitboxHeight - m);
  if (hitboxLength) {
    // Only hitboxLength metres around the model's origin count (not the cart's thin poles).
    const z = 0;
    box.min.z = Math.max(box.min.z, z - hitboxLength / 2);
    box.max.z = Math.min(box.max.z, z + hitboxLength / 2);
  }
  return box;
}

// parent: the group the obstacles live in (the track's turning world).
export function createObstacles(parent, chunkCount, kit) {
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
      mesh.count = 0;
      parent.add(mesh);
      return mesh;
    });
  }

  // The active obstacles of each chunk: { type, move, hitbox, distance }.
  // Hitboxes are in the parent's (world group's) space; distance is how far
  // along the path the row is.
  const active = Array.from({ length: chunkCount }, () => []);
  const matrix = new THREE.Matrix4();
  let nextRowDistance = 0;
  let lastRowDistance = Infinity; // no rows beyond this (the finish)

  // Places a piece at (x, z) in the chunk's game-orientation frame
  // (street along -z from the chunk's start), then into the world group.
  function place(name, x, z, chunkMatrix, distance, list) {
    const piece = pieces[name];
    const matrix = chunkMatrix.clone().multiply(offset.makeTranslation(x, 0, z)).multiply(TURN);
    // Chunks only turn in quarter turns, so the box stays an exact box.
    const hitbox = piece.hitbox.clone().translate(new THREE.Vector3(x, 0, z)).applyMatrix4(chunkMatrix);
    list.push({ type: name, move: piece.move, hitbox, distance, matrix });
  }

  // Packs every piece in use at the front of its InstancedMeshes.
  function pack() {
    for (const [name, piece] of Object.entries(pieces)) {
      let n = 0;
      for (const list of active) for (const o of list) if (o.type === name) {
        for (const mesh of piece.meshes) mesh.setMatrixAt(n, o.matrix);
        n++;
      }
      for (const mesh of piece.meshes) {
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
  const offset = new THREE.Matrix4();

  return {
    // lastRow: no rows beyond this distance (Escape mode's finish), or Infinity.
    reset(lastRow = Infinity) {
      nextRowDistance = OBSTACLES.safeStartDistance;
      lastRowDistance = lastRow;
    },

    // The finish moved (a turn towards or away from the sea).
    setLastRow(lastRow) {
      lastRowDistance = lastRow;
    },

    // Fills a chunk's block with the rows that fall inside it. Rows don't
    // line up with chunks: a running "next row" distance carries over from
    // one chunk to the next, so path chunks must be filled in order.
    // chunk: { distance (along the path where it starts), matrix (its frame) }.
    // empty: no rows, and the running distance is left alone (junctions,
    // side streets, freed slots). clear: [from, to] distance ranges with no rows.
    fill(chunkSlot, chunk, { empty = false, clear = [] } = {}) {
      const list = (active[chunkSlot] = []);

      const chunkStart = chunk.distance;
      const chunkEnd = chunkStart + TRACK.chunkLength;
      // Rows due before this chunk (skipped over a junction) are dropped.
      while (!empty && nextRowDistance < chunkStart) nextRowDistance += rowSpeed(nextRowDistance) * OBSTACLES.rowSpacingTime;
      for (let r = 0; !empty && nextRowDistance < chunkEnd; r++) {
        const distance = nextRowDistance;
        nextRowDistance += rowSpeed(distance) * OBSTACLES.rowSpacingTime;
        if (r >= rowsPerChunk || distance > lastRowDistance || Math.random() >= OBSTACLES.rowChance) continue;
        if (clear.some(([from, to]) => distance > from && distance < to)) continue;
        const row = randomRow();
        const z = -(distance - chunkStart);
        if (row.full) {
          place(row.full, 0, z, chunk.matrix, distance, list);
        } else {
          row.lanes.forEach((name, lane) => {
            if (name) place(name, laneToX(lane), z, chunk.matrix, distance, list);
          });
        }
      }
      pack();
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
