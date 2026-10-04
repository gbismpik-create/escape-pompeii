import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK, KIT, STREET, GRAPHICS, CAMERA, JOURNEY, TURNS, LANES, STATUES, DISTRICTS } from './config.js';
import { createObstacles } from './obstacles.js';
import { createStatues } from './statues.js';
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
// placements.free lists the pavement spots left without a prop ({ side, z }),
// where a statue can stand.
function planLayout(random) {
  const free = [];
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
    for (const z of spots.slice(count)) free.push({ side, z });
  }
  placements.free = free;
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
  // A statue can stand at either corner where the houses end before the square.
  placements.free = [-1, 1].map((side) => ({ side, z: (TURNS.housesBeforeSquare * KIT.houseWidth + SQUARE_START) / 2 }));
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

// The Forum, in kit space: the square paved in travertine, a two-storey
// colonnade down each side (6 m bays) or a temple front in place of three
// bays, statues on pedestals in front, and an arch where the way comes in
// (gate 'in', at the start) or goes out ('out', at the end).
// Pieces on the -x side are the +x ones turned half round about the chunk's
// middle: (x, z) → (-x, L - z).
function planForum(random, { temple = 0, gate = null } = {}) {
  const placements = [{ piece: 'Forum_Paving_30m', x: 0, z: 0, angle: 0 }];
  const side = (piece, z, s, extra = {}) =>
    placements.push(s > 0 ? { piece, x: 0, z, angle: 0, ...extra } : { piece, x: 0, z: L - z, angle: Math.PI, ...extra });
  for (const s of [1, -1]) {
    if (temple === s) {
      side('Forum_Colonnade_6m', 0, s);
      side('Forum_Temple', 6, s);
      side('Forum_Colonnade_6m', 24, s);
    } else {
      for (let z = 0; z < L; z += 6) side('Forum_Colonnade_6m', z, s);
    }
    // A statue on its pedestal in front of the colonnade, facing the square
    // (the simplified version: there are many and they are seen from afar).
    const z = 6 + random() * 18;
    const type = STATUES.types[Math.floor(random() * STATUES.types.length)];
    placements.push({ piece: 'Pedestal', x: s * 10.2, z, angle: -s * Math.PI / 2 });
    placements.push({ piece: type, x: s * 10.2, y: STATUES.pedestalHeight, z, angle: -s * Math.PI / 2, lowDetail: true });
  }
  if (gate === 'in') placements.push({ piece: 'Forum_Gate', x: 0, z: 0.7, angle: 0 });
  if (gate === 'out') placements.push({ piece: 'Forum_Gate', x: 0, z: L - 0.7, angle: Math.PI });
  // Where a statue or column that may topple can stand (statues.js).
  placements.free = [-1, 1].flatMap((side) => [4, 10, 16, 22].map((z) => ({ side, z })));
  return placements;
}

// Merges a layout's pieces into one geometry per material.
// sx / sz stretch a piece along its own x / z before it is turned.
// Placements marked lowDetail use lowPieces (the far kit) even up close.
function mergeLayout(pieces, placements, lowPieces = pieces) {
  const byMaterial = new Map();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  for (const { piece, x, y = 0, z, angle, sx = 1, sz = 1, lowDetail = false } of placements) {
    m.compose(position.set(x, y, z), q.setFromAxisAngle(up, angle), scale.set(sx, 1, sz));
    for (const part of (lowDetail ? lowPieces : pieces)[piece] ?? []) {
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

  // Slots: the path ahead and behind, plus the side streets of a junction
  // (and two spare, while the ways not taken are still in view).
  const slotCount = TRACK.chunksBehind + 1 + TRACK.chunksAhead + 5;
  const ground = createGround(scene);
  const obstacles = createObstacles(world, slotCount, kit);
  const statues = createStatues(world, kit);
  const materials = Object.values(kit.materials);

  // Build the layouts once.
  const random = seeded(2024);
  // near and far: one geometry per material. shadow: the far version all in
  // one geometry (the shadow map only needs the shape), so a chunk's shadow
  // is a single draw call.
  const build = (plan) => {
    const far = mergeLayout(kit.far, plan);
    const shadow = mergeGeometries([...far.values()]);
    shadow.computeBoundingSphere();
    return { near: mergeLayout(kit.near, plan, kit.far), far, shadow, free: plan.free ?? [] };
  };
  const layouts = Array.from({ length: KIT.layouts }, () => build(planLayout(random)));
  const junctionLayouts = { T: build(planJunction('T', random)), X: build(planJunction('X', random)) };
  // From the finish chunk on, the street opens out: road only, no houses.
  const openLayout = build([{ piece: 'Road_30m', x: 0, z: 0, angle: 0 }]);
  // The Forum: three middles (colonnades both sides, a temple left or right)
  // and the chunks with the arch in and out.
  const forumLayouts = {
    middle: [build(planForum(random)), build(planForum(random, { temple: 1 })), build(planForum(random, { temple: -1 }))],
    in: build(planForum(random, { gate: 'in' })),
    out: build(planForum(random, { gate: 'out' })),
  };
  const forumLayout = (distance, run) =>
    distance === run.start ? forumLayouts.in : distance === run.end - L ? forumLayouts.out : forumLayouts.middle[Math.floor(Math.random() * 3)];
  const finishMarks = createFinishMarks(world);

  // One slot = a group per detail level, holding one mesh per material:
  // near and far for the camera, and a far copy that only casts shadows.
  function createSlot(slot) {
    const root = new THREE.Group();
    const lods = {};
    for (const lod of ['near', 'far']) {
      const group = new THREE.Group();
      group.userData.meshes = new Map(
        materials.map((material) => {
          const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
          mesh.receiveShadow = true;
          group.add(mesh);
          return [material, mesh];
        }),
      );
      root.add(group);
      lods[lod] = group;
    }
    // The shadow caster: one mesh, drawn into the shadow map only.
    const shadow = new THREE.Mesh(new THREE.BufferGeometry(), materials[0]);
    shadow.castShadow = true;
    shadow.layers.set(SHADOW_LAYER);
    lods.shadow = new THREE.Group();
    lods.shadow.add(shadow);
    lods.shadow.userData.mesh = shadow;
    root.add(lods.shadow);
    root.visible = false;
    world.add(root);
    // A chunk: where it starts (world-group space), its heading, how far
    // along the path it starts, and its kind ('street', 'T', 'X', 'open').
    // district: 'residential' | 'forum'; run: the Forum's { start, end } path distances.
    return { slot, root, lods, start: new THREE.Vector3(), heading: 0, distance: 0, kind: 'street', district: 'residential', run: null, matrix: new THREE.Matrix4() };
  }
  const free = Array.from({ length: slotCount }, (_, slot) => createSlot(slot));
  let path = []; // chunks in order along the path
  let exits = null; // a junction's side streets: { left, right, straight } chunks
  // The ways not taken stay until they are behind the camera (releaseAt:
  // path distance), so they don't vanish in the middle of the turn.
  let leftovers = [];
  let releaseLeftoversAt = Infinity;
  let junction = null; // the junction chunk waiting for a choice
  let nextJunction = Infinity; // path distance where the next junction chunk starts
  let finishDistance = null;
  let finishIndex = Infinity; // first open chunk (Escape mode)
  // Where the next chunk on the path goes (and the Forum it is in, if any).
  const cursor = { position: new THREE.Vector3(), heading: 0, distance: 0, run: null };
  let cameFromForum = false;

  // The path chunk at a distance (the street the runner is on or will be).
  const chunkAt = (d) => path.find((c) => d >= c.distance && d < c.distance + L);
  const tmp = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  // Puts a chunk at a place on the path and gives it its layout and obstacles.
  function placeChunk(chunk, position, heading, distance, kind, district = 'residential', run = null) {
    chunk.start.copy(position);
    chunk.heading = heading;
    chunk.distance = distance;
    chunk.kind = kind;
    chunk.district = district;
    chunk.run = run;
    // The kit street runs along +z; turned 180° it runs along -z, then the heading.
    chunk.root.position.copy(position);
    chunk.root.rotation.y = Math.PI + angleOf(heading);
    // Mirroring left-right doubles the variety. (The kit is double-sided, so
    // the flipped faces still draw correctly.)
    chunk.mirrored = kind === 'street' && Math.random() < 0.5;
    chunk.root.scale.x = chunk.mirrored ? -1 : 1;
    chunk.root.visible = true;
    const layout =
      kind === 'T' || kind === 'X' ? junctionLayouts[kind] : kind === 'open' ? openLayout : district === 'forum' ? forumLayout(distance, run) : layouts[Math.floor(Math.random() * layouts.length)];
    for (const lod of ['near', 'far']) {
      for (const [material, mesh] of chunk.lods[lod].userData.meshes) {
        const geometry = layout[lod].get(material);
        mesh.visible = Boolean(geometry);
        if (geometry) mesh.geometry = geometry;
      }
    }
    chunk.lods.shadow.userData.mesh.geometry = layout.shadow;
    // Game-orientation frame of the chunk: its start, turned to its heading.
    chunk.matrix.makeRotationAxis(up, angleOf(heading)).setPosition(position);
    // A statue, if one is due here. One that may topple keeps the road
    // around where it would land clear of obstacle rows.
    const toppler = kind === 'street' || kind === 'T' || kind === 'X' || kind === 'forum' ? statues.place(chunk, layout.free) : null;
    // Rows of obstacles: none in junctions and side streets (they start
    // after them), none on the run-up to a junction, none by a toppler.
    const clear = [[nextJunction - TURNS.clearBefore * speedAt(nextJunction) * MAX_SPEED_MULTIPLIER, nextJunction + L]];
    if (toppler !== null) {
      const metres = STATUES.clearance * speedAt(toppler) * MAX_SPEED_MULTIPLIER;
      clear.push([toppler - metres, toppler + metres]);
    }
    obstacles.fill(chunk.slot, chunk, { empty: kind === 'T' || kind === 'X' || kind === 'side', clear, openSquare: district === 'forum' });
    if (finishDistance && distance <= finishDistance && finishDistance < distance + L) {
      // The finish marks, in this chunk's frame.
      finishMarks.position.copy(position).addScaledVector(forward(heading, tmp), finishDistance - distance);
      finishMarks.rotation.y = angleOf(heading);
      finishMarks.visible = true;
    }
  }

  function release(chunk) {
    chunk.root.visible = false;
    statues.release(chunk.slot);
    obstacles.fill(chunk.slot, chunk, { empty: true });
    free.push(chunk);
  }

  // Lays the next chunk on the path (a junction, if one is due).
  function extend() {
    const chunk = free.pop();
    if (!chunk) return false;
    const d = cursor.distance;
    const inForum = cursor.run && d < cursor.run.end;
    const kind = d >= finishIndex * L ? 'open' : inForum ? 'forum' : d === nextJunction ? (Math.random() < TURNS.crossroadsChance ? 'X' : 'T') : 'street';
    placeChunk(chunk, cursor.position, cursor.heading, d, kind, kind === 'forum' ? 'forum' : 'residential', kind === 'forum' ? cursor.run : null);
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
      // Where this way leads: sometimes into the Forum (never twice running).
      const forum = !cameFromForum && Math.random() < DISTRICTS.forumChance;
      const [min, max] = DISTRICTS.forumChunks;
      const run = forum ? { start: cursor.distance, end: cursor.distance + L * (min + Math.floor(Math.random() * (max - min + 1))) } : null;
      placeChunk(side, start, heading, cursor.distance, 'side', forum ? 'forum' : 'residential', run);
      exits[way] = side;
    }
  }

  // The runner chose a way out of the junction: that side street becomes the
  // path, the others go. Plans the next junction.
  function chooseExit(way) {
    const chosen = exits[way];
    leftovers = Object.entries(exits).filter(([w]) => w !== way).map(([, side]) => side);
    releaseLeftoversAt = chosen.distance + L / 2;
    path.push(chosen);
    cursor.heading = chosen.heading;
    cursor.position.copy(chosen.start).addScaledVector(forward(chosen.heading, tmp), L);
    cursor.distance = chosen.distance + L;
    cursor.run = chosen.run; // into the Forum, or null
    cameFromForum = Boolean(chosen.run);
    junction = null;
    exits = null;
    // The next junction comes after the Forum, out in the streets again.
    planNextJunction(chosen.run ? chosen.run.end : cursor.distance);
  }

  function planNextJunction(from) {
    nextJunction = TURNS.enabled ? nextJunctionAfter(from, randomInterval()) : Infinity;
    if (finishDistance && nextJunction + L > finishDistance - TURNS.finishMargin) nextJunction = Infinity;
  }

  // finish: where the run ends (Escape mode), or null (Endless).
  function reset(finish = null) {
    for (const chunk of path) release(chunk);
    if (exits) for (const side of Object.values(exits)) release(side);
    for (const side of leftovers) release(side);
    leftovers = [];
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
    cursor.run = null;
    cameFromForum = false;
    obstacles.reset(finish ? finish - JOURNEY.finishClearDistance : Infinity);
    statues.reset();
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
    statues,

    // The obstacle touching the player's hitbox (scene space), or null.
    // The obstacles are stored in world-group space; with quarter turns a
    // box stays an exact box, so the player's box is moved into that space.
    findCollision(hitbox) {
      inverse.copy(world.matrixWorld).invert();
      localBox.copy(hitbox).applyMatrix4(inverse);
      const hit = obstacles.findCollision(localBox) ?? statues.findCollision(localBox);
      if (!hit) return null;
      return { ...hit, hitbox: hit.hitbox.clone().applyMatrix4(world.matrixWorld) };
    },

    // How far (metres along the path) from `distance` to the nearest obstacle
    // row or statue that may topple, or 0 inside a junction's clear zone
    // (nothing should fall there).
    distanceToObstacle(distance) {
      if (junction && Math.abs(distance - (junction.distance + CENTRE)) < L) return 0;
      let best = Infinity;
      for (const o of obstacles.list()) best = Math.min(best, Math.abs(o.distance - distance));
      for (const d of statues.toppleDistances()) best = Math.min(best, Math.abs(d - distance));
      return best;
    },

    // The district at a path distance: the Forum from just inside its
    // entrance to its end.
    districtAt(distance) {
      const run = chunkAt(distance)?.run;
      return run && distance >= run.start + DISTRICTS.gateOpen && distance < run.end ? 'forum' : 'residential';
    },

    // Is a statue free to topple here? No obstacle row and no junction
    // within `metres` (statues themselves don't count).
    clearOfRows(distance, metres) {
      if (junction && Math.abs(distance - (junction.distance + CENTRE)) < L + metres) return false;
      return obstacles.list().every((o) => Math.abs(o.distance - distance) >= metres);
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

    // Escape mode: the sea moved nearer or further (a turn towards or away
    // from it). Only the path not laid yet changes, so call this before
    // take(): the new street is laid after the turn.
    setFinish(finish) {
      finishDistance = finish;
      finishIndex = Math.floor(finish / L);
      obstacles.setLastRow(finish - JOURNEY.finishClearDistance);
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
      if (leftovers.length && playerDistance >= releaseLeftoversAt) {
        leftovers.forEach(release);
        leftovers = [];
      }
      while (!junction && cursor.distance < playerDistance + TRACK.chunksAhead * L && extend());
      // Detail level by distance from the camera; hide chunks lost in the fog.
      const cameraDistance = playerDistance - CAMERA.offset.z;
      const chunks = [...path, ...(exits ? Object.values(exits) : []), ...leftovers];
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
