import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK, KIT, STREET, GRAPHICS, CAMERA, JOURNEY, TURNS, LANES } from './config.js';
import { createObstacles } from './obstacles.js';
import { isLowEnd } from './device.js';
import { addAshCover } from './ashShader.js';
import { speedAt, MAX_SPEED_MULTIPLIER } from './speed.js';

// The street, built from the Pompeii kit.
//
// At load, a few street LAYOUTS are put together (road, kerbs, five houses
// a side and some props) and merged into ONE mesh per material, in two
// versions: full detail and far (simplified). That is ~7 draw calls a chunk.
// Junctions (a T-junction and a crossroads) and the open ground at the sea
// are layouts too.
//
// The street is a PATH of chunks laid one after another, each with a
// heading (0–3, quarter turns to the left). A fixed set of chunk SLOTS is
// reused: when a chunk falls behind the player, its slot moves to the front
// of the path and takes another layout and new obstacles. Nothing is built
// during play: a slot just points its meshes at a layout's merged geometry.
//
// Everything in the town lives in one group, `world`. The runner never
// turns: he always runs towards -z. At a junction the world turns 90°
// around him instead, so the street he chose lines up with -z. The street
// he is on always runs along -z through x = 0, and a point `d` metres along
// the path is at z = -d: distance along the path and the runner's z agree.
//
// Chunks near the player show full detail, distant ones the far version,
// and chunks lost in the fog are not drawn at all. Shadows are cast by an
// invisible copy of the far version on render layer 1, which only the
// sun's shadow camera looks at (see environment.js).

export const SHADOW_LAYER = 1;

const L = TRACK.chunkLength;
const ROAD_HALF = (LANES.count * LANES.width) / 2; // 2.7 m
const SQUARE = 2 * KIT.facadeX; // the junction square, wall to wall (9.2 m)
const SQUARE_START = L - SQUARE; // where the square begins in a junction chunk
const CENTRE = L - SQUARE / 2; // the junction's centre line, from the chunk start

// Direction of a heading (0 = -z, 1 = -x i.e. a left turn, ...).
const angleOf = (heading) => (heading * Math.PI) / 2;
function forward(heading, target = new THREE.Vector3()) {
  const a = angleOf(heading);
  return target.set(-Math.sin(a), 0, -Math.cos(a));
}
const mod4 = (h) => ((h % 4) + 4) % 4;

// A small seeded random generator, so layouts are the same every visit.
function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const pickHouse = (random, previous) => {
  const choices = KIT.houses.filter((h) => h !== previous);
  return choices[Math.floor(random() * choices.length)];
};

// Where each piece goes in one street layout, in kit space (street along +z).
function planLayout(random) {
  const placements = [
    { piece: 'Road_30m', x: 0, z: 0, angle: 0 },
    { piece: 'Kerbs_30m', x: 0, z: 0, angle: 0 },
  ];
  for (const side of [-1, 1]) {
    // Houses: no two of the same type side by side.
    let previous = null;
    for (let i = 0; i < KIT.housesPerSide; i++) {
      const house = (previous = pickHouse(random, previous));
      // Built facing +z: turn -90° on the +x side and +90° on the -x side
      // so the fronts face the street.
      placements.push({ piece: house, x: side * KIT.facadeX, z: KIT.houseWidth * (i + 0.5), angle: -side * Math.PI / 2 });
    }
    // Props on the pavement, at different spots along the chunk.
    const spots = [2.5, 7.5, 12.5, 17.5, 22.5, 27.5].sort(() => random() - 0.5);
    const [min, max] = KIT.props.perSide;
    const count = min + Math.floor(random() * (max - min + 1));
    const names = Object.keys(KIT.props);
    const weights = names.map((n) => KIT.props[n][1]);
    const total = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < count; i++) {
      let r = random() * total;
      const name = names.find((n, k) => (r -= weights[k]) < 0) ?? names[0];
      placements.push({ piece: name, x: side * KIT.props[name][0], z: spots[i], angle: -side * Math.PI / 2 });
    }
  }
  return placements;
}

// A junction chunk in kit space: the street with a few houses a side, then
// the square where it meets the cross street (paved wall to wall). A
// T-junction closes the far side of the square with house fronts.
// The side streets and the street straight on are ordinary chunks.
function planJunction(type, random) {
  const placements = [
    { piece: 'Road_30m', x: 0, z: 0, angle: 0, sz: SQUARE_START / L },
    { piece: 'Kerbs_30m', x: 0, z: 0, angle: 0, sz: SQUARE_START / L },
    // The square: the road piece turned across and stretched to fill it.
    // (Turned 90°, the piece's length runs along x from its origin.)
    { piece: 'Road_30m', x: -SQUARE / 2, z: SQUARE_START + SQUARE / 2, angle: Math.PI / 2, sx: SQUARE / (2 * ROAD_HALF), sz: SQUARE / L },
  ];
  for (const side of [-1, 1]) {
    let previous = null;
    for (let i = 0; i < TURNS.housesBeforeSquare; i++) {
      const house = (previous = pickHouse(random, previous));
      placements.push({ piece: house, x: side * KIT.facadeX, z: KIT.houseWidth * (i + 0.5), angle: -side * Math.PI / 2 });
    }
  }
  if (type === 'T') {
    // The wall: two narrower house fronts across the end, facing back.
    let previous = null;
    for (const side of [-1, 1]) {
      const house = (previous = pickHouse(random, previous));
      placements.push({ piece: house, x: side * (SQUARE / 4), z: L, angle: Math.PI, sx: SQUARE / 2 / KIT.houseWidth });
    }
  }
  return placements;
}

// Merges a layout's pieces into one geometry per material.
// sx / sz stretch a piece along its own x / z before it is turned.
function mergeLayout(pieces, placements) {
  const byMaterial = new Map();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  for (const { piece, x, z, angle, sx = 1, sz = 1 } of placements) {
    m.compose(position.set(x, 0, z), q.setFromAxisAngle(up, angle), scale.set(sx, 1, sz));
    for (const part of pieces[piece] ?? []) {
      if (!byMaterial.has(part.material)) byMaterial.set(part.material, []);
      byMaterial.get(part.material).push(part.geometry.clone().applyMatrix4(m));
    }
  }
  const merged = new Map();
  for (const [material, geometries] of byMaterial) {
    const geometry = mergeGeometries(geometries);
    geometries.forEach((g) => g.dispose());
    geometry.computeBoundingSphere(); // lets Three.js skip it when off screen
    merged.set(material, geometry);
  }
  return merged;
}

// The finish (Escape mode): a line across the road and a signpost to the sea.
// The sign's text is painted on a canvas and used as a texture.
function createFinishMarks(parent) {
  const group = new THREE.Group();
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 0.35).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: JOURNEY.finishLineColor, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  line.position.y = 0.02;
  group.add(line);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const g = canvas.getContext('2d');
  g.fillStyle = '#7a5a36';
  g.fillRect(0, 0, 512, 192);
  g.strokeStyle = '#4a3420';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 502, 182);
  g.fillStyle = '#f2e8d0';
  g.textAlign = 'center';
  const [big, small] = JOURNEY.sign.lines;
  g.font = 'bold 84px Georgia, serif';
  g.fillText(big, 256, 98);
  g.font = 'italic 44px Georgia, serif';
  g.fillText(small, 256, 160);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const wood = new THREE.MeshLambertMaterial({ color: 0x5a3f24 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.06), [wood, wood, wood, wood, new THREE.MeshLambertMaterial({ map: texture }), wood]);
  board.position.set(JOURNEY.sign.x, 2.1, -JOURNEY.sign.distancePast);
  board.castShadow = true;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), wood);
  post.position.set(JOURNEY.sign.x, 1.2, -JOURNEY.sign.distancePast - 0.05);
  post.castShadow = true;
  group.add(board, post);
  group.visible = false;
  parent.add(group);
  return group;
}

// Plain ground beyond the houses, following the player (outside the world
// group: it is the same in every direction).
function createGround(scene) {
  const length = (TRACK.chunksAhead + TRACK.chunksBehind + 2) * L;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(STREET.sideGroundWidth, length),
    addAshCover(new THREE.MeshLambertMaterial({ color: STREET.sideGroundColor })),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1; // just under the road
  ground.receiveShadow = true;
  scene.add(ground);
  return {
    update(playerZ) {
      ground.position.z = playerZ - length / 2 + (TRACK.chunksBehind + 1) * L;
    },
  };
}

// Distance at which to put the next junction: interval seconds of running
// from `from`, rounded up to a chunk boundary.
function nextJunctionAfter(from, seconds) {
  const metres = seconds * speedAt(from) * MAX_SPEED_MULTIPLIER;
  return Math.ceil((from + metres) / L) * L;
}
const randomInterval = () => TURNS.interval[0] + Math.random() * (TURNS.interval[1] - TURNS.interval[0]);

export function createTrack(scene, kit) {
  const world = new THREE.Group();
  world.name = 'world';
  scene.add(world);

  // Slots: the path ahead and behind, plus the side streets of a junction.
  const slotCount = TRACK.chunksBehind + 1 + TRACK.chunksAhead + 3;
  const ground = createGround(scene);
  const obstacles = createObstacles(world, slotCount, kit);
  const materials = Object.values(kit.materials);

  // Build the layouts once.
  const random = seeded(2024);
  const build = (plan) => ({ near: mergeLayout(kit.near, plan), far: mergeLayout(kit.far, plan) });
  const layouts = Array.from({ length: KIT.layouts }, () => build(planLayout(random)));
  const junctionLayouts = { T: build(planJunction('T', random)), X: build(planJunction('X', random)) };
  // From the finish chunk on, the street opens out: road only, no houses.
  const openLayout = build([{ piece: 'Road_30m', x: 0, z: 0, angle: 0 }]);
  const finishMarks = createFinishMarks(world);

  // One slot = a group per detail level, holding one mesh per material:
  // near and far for the camera, and a far copy that only casts shadows.
  function createSlot(slot) {
    const root = new THREE.Group();
    const lods = {};
    for (const lod of ['near', 'far', 'shadow']) {
      const group = new THREE.Group();
      group.userData.meshes = new Map(
        materials.map((material) => {
          const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
          if (lod === 'shadow') {
            mesh.castShadow = true;
            mesh.layers.set(SHADOW_LAYER); // drawn into the shadow map only
          } else {
            mesh.receiveShadow = true;
          }
          group.add(mesh);
          return [material, mesh];
        }),
      );
      root.add(group);
      lods[lod] = group;
    }
    root.visible = false;
    world.add(root);
    // A chunk: where it starts (world-group space), its heading, how far
    // along the path it starts, and its kind ('street', 'T', 'X', 'open').
    return { slot, root, lods, start: new THREE.Vector3(), heading: 0, distance: 0, kind: 'street', matrix: new THREE.Matrix4() };
  }
  const free = Array.from({ length: slotCount }, (_, slot) => createSlot(slot));
  let path = []; // chunks in order along the path
  let exits = null; // a junction's side streets: { left, right, straight } chunks
  let junction = null; // the junction chunk waiting for a choice
  let nextJunction = Infinity; // path distance where the next junction chunk starts
  let finishDistance = null;
  let finishIndex = Infinity; // first open chunk (Escape mode)
  // Where the next chunk on the path goes.
  const cursor = { position: new THREE.Vector3(), heading: 0, distance: 0 };
  const tmp = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  // Puts a chunk at a place on the path and gives it its layout and obstacles.
  function placeChunk(chunk, position, heading, distance, kind) {
    chunk.start.copy(position);
    chunk.heading = heading;
    chunk.distance = distance;
    chunk.kind = kind;
    // The kit street runs along +z; turned 180° it runs along -z, then the heading.
    chunk.root.position.copy(position);
    chunk.root.rotation.y = Math.PI + angleOf(heading);
    // Mirroring left-right doubles the variety. (The kit is double-sided, so
    // the flipped faces still draw correctly.)
    chunk.root.scale.x = kind === 'street' && Math.random() < 0.5 ? -1 : 1;
    chunk.root.visible = true;
    const layout =
      kind === 'T' || kind === 'X' ? junctionLayouts[kind] : kind === 'open' ? openLayout : layouts[Math.floor(Math.random() * layouts.length)];
    for (const lod of ['near', 'far', 'shadow']) {
      for (const [material, mesh] of chunk.lods[lod].userData.meshes) {
        const geometry = layout[lod === 'near' ? 'near' : 'far'].get(material);
        mesh.visible = Boolean(geometry);
        if (geometry) mesh.geometry = geometry;
      }
    }
    // Game-orientation frame of the chunk: its start, turned to its heading.
    chunk.matrix.makeRotationAxis(up, angleOf(heading)).setPosition(position);
    // Rows of obstacles: none in junctions and side streets (they start
    // after them), and none on the run-up to a junction.
    const clearFrom = nextJunction - TURNS.clearBefore * speedAt(nextJunction) * MAX_SPEED_MULTIPLIER;
    obstacles.fill(chunk.slot, chunk, { empty: kind === 'T' || kind === 'X' || kind === 'side', clearFrom, clearTo: nextJunction + L });
    if (finishDistance && distance <= finishDistance && finishDistance < distance + L) {
      // The finish marks, in this chunk's frame.
      finishMarks.position.copy(position).addScaledVector(forward(heading, tmp), finishDistance - distance);
      finishMarks.rotation.y = angleOf(heading);
      finishMarks.visible = true;
    }
  }

  function release(chunk) {
    chunk.root.visible = false;
    obstacles.fill(chunk.slot, chunk, { empty: true });
    free.push(chunk);
  }

  // Lays the next chunk on the path (a junction, if one is due).
  function extend() {
    const chunk = free.pop();
    if (!chunk) return false;
    const d = cursor.distance;
    const kind = d >= finishIndex * L ? 'open' : d === nextJunction ? (Math.random() < TURNS.crossroadsChance ? 'X' : 'T') : 'street';
    placeChunk(chunk, cursor.position, cursor.heading, d, kind);
    path.push(chunk);
    cursor.position.addScaledVector(forward(cursor.heading, tmp), L);
    cursor.distance += L;
    if (kind === 'T' || kind === 'X') openJunction(chunk);
    return true;
  }

  // A junction: lay a short side street down each open way and wait for
  // the runner to choose.
  function openJunction(chunk) {
    junction = chunk;
    exits = {};
    const centre = chunk.start.clone().addScaledVector(forward(chunk.heading, tmp), CENTRE);
    const ways = chunk.kind === 'X' ? { left: 1, right: -1, straight: 0 } : { left: 1, right: -1 };
    for (const [way, turn] of Object.entries(ways)) {
      const side = free.pop();
      if (!side) continue;
      const heading = mod4(chunk.heading + turn);
      const start = turn === 0 ? cursor.position.clone() : centre.clone().addScaledVector(forward(heading, tmp), SQUARE / 2);
      placeChunk(side, start, heading, cursor.distance, 'side');
      exits[way] = side;
    }
  }

  // The runner chose a way out of the junction: that side street becomes the
  // path, the others go. Plans the next junction.
  function chooseExit(way) {
    const chosen = exits[way];
    for (const [w, side] of Object.entries(exits)) if (w !== way) release(side);
    path.push(chosen);
    cursor.heading = chosen.heading;
    cursor.position.copy(chosen.start).addScaledVector(forward(chosen.heading, tmp), L);
    cursor.distance = chosen.distance + L;
    junction = null;
    exits = null;
    planNextJunction(cursor.distance);
  }

  function planNextJunction(from) {
    nextJunction = TURNS.enabled ? nextJunctionAfter(from, randomInterval()) : Infinity;
    if (finishDistance && nextJunction + L > finishDistance - TURNS.finishMargin) nextJunction = Infinity;
  }

  // finish: where the run ends (Escape mode), or null (Endless).
  function reset(finish = null) {
    for (const chunk of path) release(chunk);
    if (exits) for (const side of Object.values(exits)) release(side);
    path = [];
    exits = null;
    junction = null;
    finishDistance = finish;
    finishIndex = finish ? Math.floor(finish / L) : Infinity;
    finishMarks.visible = false;
    world.position.set(0, 0, 0);
    world.rotation.set(0, 0, 0);
    world.updateMatrixWorld();
    cursor.position.set(0, 0, TRACK.chunksBehind * L);
    cursor.heading = 0;
    cursor.distance = -TRACK.chunksBehind * L;
    obstacles.reset(finish ? finish - JOURNEY.finishClearDistance : Infinity);
    planNextJunction(0);
    nextJunction = TURNS.enabled ? Math.max(nextJunction, nextJunctionAfter(0, TURNS.firstAfter)) : Infinity;
    if (finishDistance && nextJunction + L > finishDistance - TURNS.finishMargin) nextJunction = Infinity;
    for (let i = 0; i < TRACK.chunksBehind + 1 + TRACK.chunksAhead && !junction; i++) extend();
  }

  const detailDistance = isLowEnd() ? GRAPHICS.detailDistance.low : GRAPHICS.detailDistance.high;
  const inverse = new THREE.Matrix4();
  const localBox = new THREE.Box3();

  reset();

  return {
    world,
    reset,
    obstacles,

    // The obstacle touching the player's hitbox (scene space), or null.
    // The obstacles are stored in world-group space; with quarter turns a
    // box stays an exact box, so the player's box is moved into that space.
    findCollision(hitbox) {
      inverse.copy(world.matrixWorld).invert();
      const hit = obstacles.findCollision(localBox.copy(hitbox).applyMatrix4(inverse));
      if (!hit) return null;
      return { ...hit, hitbox: hit.hitbox.clone().applyMatrix4(world.matrixWorld) };
    },

    // How far (metres along the path) from `distance` to the nearest obstacle
    // row, or 0 inside a junction's clear zone (nothing should fall there).
    distanceToObstacle(distance) {
      if (junction && Math.abs(distance - (junction.distance + CENTRE)) < L) return 0;
      let best = Infinity;
      for (const o of obstacles.list()) best = Math.min(best, Math.abs(o.distance - distance));
      return best;
    },

    // The junction ahead, if the path is waiting at one: its type, the path
    // distance of its centre line and of its far wall, and the ways out.
    get junction() {
      if (!junction) return null;
      return {
        type: junction.kind,
        centre: junction.distance + CENTRE,
        wall: junction.distance + L,
        ways: Object.keys(exits),
      };
    },

    // Take a way out of the junction. 'left' / 'right' turn the world a
    // quarter turn around the junction's centre (on the runner's street at
    // z = -centre), so the new street runs along -z through x = 0.
    // Returns the angle the world turned (0 for straight on).
    take(way) {
      if (!junction || !exits[way]) return 0;
      const centre = junction.distance + CENTRE;
      chooseExit(way);
      const angle = way === 'left' ? -Math.PI / 2 : way === 'right' ? Math.PI / 2 : 0;
      if (angle) {
        const pivot = tmp.set(0, 0, -centre);
        world.position.sub(pivot).applyAxisAngle(up, angle).add(pivot);
        world.rotation.y += angle;
        world.updateMatrixWorld();
      }
      return angle;
    },

    // Which way the world faces (radians); the sky and the sun turn with it.
    get heading() {
      return world.rotation.y;
    },

    // fogDistance: beyond this, the fog hides everything (metres).
    update(playerZ, fogDistance = Infinity) {
      ground.update(playerZ);
      const playerDistance = -playerZ;
      // Recycle chunks that are now too far behind; lay new ones ahead.
      while (path.length && path[0].distance + L < playerDistance - TRACK.chunksBehind * L) release(path.shift());
      while (!junction && cursor.distance < playerDistance + TRACK.chunksAhead * L && extend());
      // Detail level by distance from the camera; hide chunks lost in the fog.
      const cameraDistance = playerDistance - CAMERA.offset.z;
      const chunks = exits ? [...path, ...Object.values(exits)] : path;
      for (const chunk of chunks) {
        const start = chunk.distance; // the chunk spans start .. start + L
        const distance = Math.max(0, start - cameraDistance, cameraDistance - start - L);
        chunk.root.visible = distance < fogDistance;
        chunk.lods.near.visible = distance < detailDistance;
        chunk.lods.far.visible = !chunk.lods.near.visible;
        chunk.lods.shadow.visible = distance < GRAPHICS.shadowDistance;
      }
    },
  };
}
