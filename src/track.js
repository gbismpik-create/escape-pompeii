import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK, KIT, STREET, GRAPHICS, CAMERA, JOURNEY, TURNS, LANES, STATUES, DISTRICTS, THEATRE, VILLA, OBSTACLES, PUMICE, FINALE } from './config.js';
import { createGateCollapse } from './gate.js';
import { forward, poseOn, theatreRoute, theatreFloor } from './path.js';
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

// Path angles (radians): 0 runs towards -z; positive bends left (towards -x).
// (forward and poseOn, the path maths, are in path.js.)
const QUARTER = Math.PI / 2;
const ROUTE = theatreRoute();
const FINALE_LENGTH = FINALE.sections.reduce((sum, s) => sum + s.length, 0);
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
// where a statue can stand. gap: a side (-1 or 1) whose first house is left
// out, where the rich house stands beside the start of the street.
// from: where the street starts (the house's back lane starts part way in).
function planLayout(random, { gap = 0, from = 0 } = {}) {
  const free = [];
  const placements = [
    { piece: 'Road_30m', x: 0, z: from, angle: 0, sz: (L - from) / L },
    { piece: 'Kerbs_30m', x: 0, z: from, angle: 0, sz: (L - from) / L },
  ];
  for (const side of [-1, 1]) {
    // Houses: no two of the same type side by side.
    let previous = null;
    for (let i = 0; i < KIT.housesPerSide; i++) {
      const house = (previous = pickHouse(random, previous));
      if ((side === gap && i === 0) || KIT.houseWidth * i < from) continue;
      // Built facing +z: turn -90° on the +x side and +90° on the -x side
      // so the fronts face the street.
      placements.push({ piece: house, x: side * KIT.facadeX, z: KIT.houseWidth * (i + 0.5), angle: -side * Math.PI / 2 });
    }
    // Props on the pavement, at different spots along the chunk.
    const spots = [2.5, 7.5, 12.5, 17.5, 22.5, 27.5].filter((z) => z > from && !(side === gap && z < KIT.houseWidth)).sort(() => random() - 0.5);
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
    placements.push({ piece: type.replace('Statue_', 'Pedestal_'), x: s * 10.2, z, angle: -s * Math.PI / 2 });
    placements.push({ piece: type, x: s * 10.2, y: STATUES.pedestalHeight, z, angle: -s * Math.PI / 2, lowDetail: true });
  }
  if (gate === 'in') placements.push({ piece: 'Forum_Gate', x: 0, z: 0.7, angle: 0 });
  if (gate === 'out') placements.push({ piece: 'Forum_Gate', x: 0, z: L - 0.7, angle: Math.PI });
  // Where a statue or column that may topple can stand (statues.js).
  placements.free = [-1, 1].flatMap((side) => [4, 10, 16, 22].map((z) => ({ side, z })));
  return placements;
}

// The finale's first chunk, in kit space: the last houses of the town, then
// the city wall across the street with Porta Stabia's passage through it,
// and the road out beyond.
function planGate(random) {
  const placements = [
    { piece: 'Road_30m', x: 0, z: 0, angle: 0 },
    { piece: 'Kerbs_30m', x: 0, z: 0, angle: 0, sz: FINALE.wallAt / L },
    { piece: 'Porta_Stabia', x: 0, z: FINALE.wallAt, angle: 0 },
  ];
  for (const side of [-1, 1]) {
    let previous = null;
    for (let i = 0; i * KIT.houseWidth < FINALE.wallAt; i++) {
      const house = (previous = pickHouse(random, previous));
      placements.push({ piece: house, x: side * KIT.facadeX, z: KIT.houseWidth * (i + 0.5), angle: -side * Math.PI / 2 });
    }
  }
  return placements;
}

// Outside the walls. Country pieces are built beside the road on its +x
// side, facing the road; on the -x side they are turned half round (and,
// for those running the chunk's length, start at its far end).
function country(placements, piece, side, x, z, { length = false, y = 0 } = {}) {
  placements.push(side > 0 ? { piece, x, y, z, angle: 0 } : { piece, x: -x, y, z: length ? z + L : z, angle: Math.PI });
}
// The road lined with family tombs and cypresses, fields behind a wall.
function planTombs(random) {
  const placements = [{ piece: 'Road_30m', x: 0, z: 0, angle: 0 }];
  for (const side of [-1, 1]) {
    country(placements, 'Country_Ground_30m', side, 0, 0, { length: true });
    country(placements, 'Field_Wall_30m', side, 13, 0, { length: true });
    const [min, max] = FINALE.tombSpacing;
    for (let z = 2 + random() * 3; z < L - 2; z += min + random() * (max - min)) {
      const tomb = ['Tomb_Schola', 'Tomb_Altar', 'Tomb_Aedicula'][Math.floor(random() * 3)];
      country(placements, tomb, side, FINALE.tombsX, z);
      if (random() < 0.6) country(placements, 'Cypress', side, FINALE.tombsX + 5.5 + random() * 2, z + 3);
    }
  }
  return placements;
}
// Vineyards and fields: vine rows, a line of cypresses by the road, now and
// then a farmhouse across the fields.
function planFields(random) {
  const placements = [{ piece: 'Road_30m', x: 0, z: 0, angle: 0 }];
  for (const side of [-1, 1]) {
    country(placements, 'Country_Ground_30m', side, 0, 0, { length: true });
    country(placements, 'Field_Wall_30m', side, 6, 0, { length: true });
    const farm = random() < 0.35;
    const { from, to, every } = FINALE.vineRows;
    for (let x = from; x <= to; x += every) if (!(farm && x > 16)) country(placements, 'Vine_Row_30m', side, x, 0, { length: true });
    if (farm) country(placements, 'Farmhouse', side, 22, 10 + random() * 10);
    for (let z = random() * 6; z < L; z += 8 + random() * 6) if (random() < 0.7) country(placements, 'Cypress', side, 4.4, z);
  }
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
    // sunk: in the theatre, whose orchestra lies below the street.
    update(playerZ, sunk = false) {
      ground.position.z = playerZ - length / 2 + (TRACK.chunksBehind + 1) * L;
      ground.position.y = sunk ? THEATRE.groundDrop : -0.1;
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

// Which obstacles go where in the theatre (rel: metres from its start):
// null for none, else a THEATRE.obstacles table.
function theatreRules(rel) {
  const o = THEATRE.obstacles;
  if (rel < 12) return null; // the way in, just after the turn
  if (rel < ROUTE.passageEnd - 3) return o.passage;
  if (rel < ROUTE.passageEnd + 4) return null; // out onto the stage
  if (rel < ROUTE.stageEnd - 6) return o.stage;
  if (rel < ROUTE.ringStart + 4) return null; // the curve and the stairs
  if (rel < ROUTE.ringEnd - 3) return o.tier;
  return null; // off the steps, the vomitorium, the forecourt
}

// The pumice layer of one chunk: a strip across the street, along the chunk
// (kit space: z = 0..L along it), its height following the depth along the
// path. One mesh per chunk slot; the geometry is rewritten when the chunk
// is laid. depthAt(z): the pumice depth z metres into the chunk.
const PUMICE_ACROSS = 15;
const PUMICE_STEP = 0.5; // metres between rows of points along the chunk
const PUMICE_ALONG = L / PUMICE_STEP + 1;
function createPumiceMesh(material) {
  const count = PUMICE_ACROSS * PUMICE_ALONG;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const index = [];
  for (let j = 0; j < PUMICE_ALONG - 1; j++) for (let i = 0; i < PUMICE_ACROSS - 1; i++) {
    const a = j * PUMICE_ACROSS + i, b = a + 1, c = a + PUMICE_ACROSS, d = c + 1;
    index.push(a, c, b, b, c, d);
  }
  geometry.setIndex(index);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.visible = false;
  const dark = new THREE.Color(PUMICE.colors[0]), light = new THREE.Color(PUMICE.colors[1]), c = new THREE.Color();
  // A little repeatable noise (0..1) for the stones' lumps and colour.
  const noise = (x, z) => { const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return h - Math.floor(h); };
  return {
    mesh,
    // distance: where the chunk starts along the path.
    update(distance, depthAt) {
      let deepest = 0;
      const position = geometry.attributes.position, color = geometry.attributes.color;
      for (let j = 0; j < PUMICE_ALONG; j++) {
        const depth = depthAt(j * PUMICE_STEP);
        deepest = Math.max(deepest, depth);
        for (let i = 0; i < PUMICE_ACROSS; i++) {
          const x = THREE.MathUtils.lerp(-PUMICE.halfWidth, PUMICE.halfWidth, i / (PUMICE_ACROSS - 1));
          const n = noise(x, Math.round(distance / PUMICE_STEP) + j);
          // Drifts piled against the house fronts (barely under the lanes).
          const drift = PUMICE.drift * (Math.abs(x) / PUMICE.halfWidth) ** 4;
          // Just under the road where there is none yet; lumpy where there is.
          const lumps = depth > 0.1 ? (n - 0.5) * 2 * PUMICE.lumps : 0;
          position.setXYZ(j * PUMICE_ACROSS + i, x, depth - 0.05 + lumps + (depth / PUMICE.depth) * drift, j * PUMICE_STEP);
          // Mostly pale stones, with dark ones scattered through.
          c.copy(dark).lerp(light, n < 0.18 ? n : 0.55 + 0.45 * n);
          color.setXYZ(j * PUMICE_ACROSS + i, c.r, c.g, c.b);
        }
      }
      mesh.visible = deepest > 0.06;
      if (!mesh.visible) return;
      position.needsUpdate = color.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    },
  };
}

// The rich house: the model (villa.js) as one set piece, and its obstacles'
// hitboxes in path space once it is placed. Built along +z; the path runs
// along -z, so it is turned half round (its x = -1.8 lane is the path's right).
function createVillaPiece(world, villa) {
  const group = new THREE.Group();
  group.name = 'villa';
  const inner = new THREE.Group();
  inner.rotation.y = Math.PI;
  for (const mesh of villa.meshes) {
    mesh.receiveShadow = true;
    inner.add(mesh);
  }
  const shadow = new THREE.Mesh(villa.shadowGeometry, villa.meshes[0].material);
  shadow.castShadow = true;
  shadow.layers.set(SHADOW_LAYER);
  inner.add(shadow);
  group.add(inner);
  group.visible = false;
  world.add(group);
  let hitboxes = [];
  return {
    group,
    // start: where its street door is (world-group space); angle: the path's
    // angle there; run: its path distances.
    place(start, angle, run) {
      group.position.copy(start);
      group.rotation.y = angle;
      group.visible = true;
      const h = VILLA.laneHalfWidth;
      hitboxes = villa.obstacles
        .filter((o) => o.act !== 'none')
        .map((o) => {
          const x = -(o.lane - 1) * LANES.width; // turned half round
          const top = o.act === 'jump' ? VILLA.jumpHeight : OBSTACLES.blockHeight;
          return {
            type: o.type,
            move: o.act === 'jump' ? 'jump' : 'block',
            stumbleOnly: VILLA.stumbleOnly.includes(o.type),
            used: false,
            distance: run.start + (o.z0 + o.z1) / 2,
            hitbox: new THREE.Box3(new THREE.Vector3(x - h, 0, -(run.start + o.z1)), new THREE.Vector3(x + h, top, -(run.start + o.z0))),
          };
        });
    },
    hide() {
      group.visible = false;
      hitboxes = [];
    },
    findCollision(hitbox) {
      return hitboxes.find((o) => !o.used && o.hitbox.intersectsBox(hitbox)) ?? null;
    },
    list: () => hitboxes,
  };
}

// The Large Theatre: one set piece, full detail only (one draw call per
// material), with a merged copy that only casts shadows (see SHADOW_LAYER).
function createTheatre(world, kit) {
  const group = new THREE.Group();
  group.name = 'theatre';
  for (const { geometry, material } of kit.near.Theatre) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const shadow = new THREE.Mesh(mergeGeometries(kit.far.Theatre.map((p) => p.geometry)), kit.far.Theatre[0].material);
  shadow.castShadow = true;
  shadow.layers.set(SHADOW_LAYER);
  group.add(shadow);
  group.visible = false;
  world.add(group);
  return {
    group,
    // start: where its route begins (world-group space); angle: the path's angle there.
    place(start, angle) {
      group.position.copy(start);
      group.rotation.y = angle;
      group.visible = true;
    },
    hide() {
      group.visible = false;
    },
  };
}

// villa: the rich house (villa.js), or null for none (tests).
export function createTrack(scene, kit, villa = null) {
  const world = new THREE.Group();
  world.name = 'world';
  world.matrixAutoUpdate = false; // placed from the path's pose each frame
  scene.add(world);

  // The path's shape: segments in order of path distance, each a straight or
  // an arc ({ from, start, angle, k }). A new one starts at each turn and at
  // each curve. Anything placed along the path asks pose / frameAt where it is.
  let segments = [];
  const segmentAt = (s) => {
    let i = segments.length - 1;
    while (i > 0 && segments[i].from > s) i--;
    return segments[i];
  };
  const pose = (s, out = new THREE.Vector3()) => poseOn(segmentAt(s), s, out);
  const framePoint = new THREE.Vector3();
  // The path's frame s metres along it: its point, turned to face along it.
  // A thing x metres to the side and y up is at frameAt(s) × (x, y, 0).
  function frameAt(s, target = new THREE.Matrix4()) {
    const angle = pose(s, framePoint);
    return target.makeRotationY(angle).setPosition(framePoint);
  }
  // (groundAt: how deep the pumice is there, so a toppling statue lands on it.)
  const path3 = { frameAt, angleAt: (s) => pose(s, framePoint), groundAt: (s) => pumiceAt(s) };

  // Slots: the path ahead and behind, plus the side streets of a junction
  // (and two spare, while the ways not taken are still in view).
  const slotCount = TRACK.chunksBehind + 1 + TRACK.chunksAhead + 5;
  const ground = createGround(scene);
  const obstacles = createObstacles(world, slotCount, kit, frameAt);
  const statues = createStatues(world, kit, path3);
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
  // The rich house: side streets with a gap for it beside their start, and
  // its back lane. Turning left, the house is on the right of the new street
  // (the kit's -1 side); turning right, on its left (+1).
  const gapLayouts = { left: build(planLayout(random, { gap: -1 })), right: build(planLayout(random, { gap: 1 })) };
  const backLaneLayout = build(planLayout(random, { from: VILLA.length % L }));
  // The finale: Porta Stabia, then (for now) the open road beyond.
  const gateLayout = build(planGate(random));
  const countryLayouts = {
    tombs: [build(planTombs(random)), build(planTombs(random)), build(planTombs(random))],
    fields: [build(planFields(random)), build(planFields(random)), build(planFields(random))],
  };
  const gate = createGateCollapse(world, kit, frameAt, (d, x) => floorAt(d, x));
  const house = villa ? createVillaPiece(world, villa) : null;
  let villaRun = null; // the house on offer or being run through, or null
  let villaLast = false; // the last junction had the house (never two running)
  // Theatre chunks have no layout of their own: the theatre is one set piece
  // laid along its route (built in the path's own frame: forward is -z).
  const emptyLayout = { near: new Map(), far: new Map(), shadow: new THREE.BufferGeometry(), free: [] };
  const theatre = createTheatre(world, kit);
  let theatreRun = null; // the theatre run on offer or being run, or null
  let theatreUsed = false; // once a run

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
    // The pumice filling the street (phase 2 on).
    const pumice = createPumiceMesh(pumiceMaterial);
    root.add(pumice.mesh);
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
    // A chunk: where it starts (world-group space), its angle, how far
    // along the path it starts, and its kind ('street', 'T', 'X', 'open',
    // 'side', 'forum', 'theatre'). district: 'residential' | 'forum' |
    // 'theatre'; run: the district's { kind, start, end } path distances.
    return { slot, root, lods, pumice, start: new THREE.Vector3(), angle: 0, distance: 0, kind: 'street', district: 'residential', run: null };
  }
  const pumiceMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const free = Array.from({ length: slotCount }, (_, slot) => createSlot(slot));
  // The pumice: { start, length } along the path once fixed (main.js), or null.
  let pumice = null;
  function pumiceAt(d) {
    if (!pumice) return 0;
    let depth = PUMICE.depth * THREE.MathUtils.smoothstep(d, pumice.start, pumice.start + pumice.length);
    if (finale) {
      // Outside the walls it thins: a layer on the fields, a crust on the beach.
      const k = (from, to, a) => THREE.MathUtils.lerp(from, to, THREE.MathUtils.smoothstep(d, a, a + FINALE.pumiceTaper));
      const outside = k(PUMICE.depth, FINALE.pumiceOutside, finale.gateExit);
      depth = Math.min(depth, k(outside, FINALE.pumiceBeach, finale.beach));
    }
    return depth;
  }
  // Does a district's run (ending at path distance `to`) end before the pumice starts?
  const beforePumice = (to) => !pumice || to < pumice.start;
  let path = []; // chunks in order along the path
  let exits = null; // a junction's side streets: { left, right, straight } chunks
  // The ways not taken stay until they are behind the camera (releaseAt:
  // path distance), so they don't vanish in the middle of the turn.
  let leftovers = [];
  let releaseLeftoversAt = Infinity;
  let junction = null; // the junction chunk waiting for a choice
  let nextJunction = Infinity; // path distance where the next junction chunk starts
  let finishDistance = null;
  // The finale once it is laid: { start, gateExit, beach, sections: [{ kind, start, end }] }.
  let finale = null;
  // Where the finale would start for a finish: on a chunk boundary, FINALE_LENGTH before it.
  const finaleStartFor = (finish) => Math.ceil((finish - FINALE_LENGTH) / L) * L;
  function layFinale(start) {
    let at = start;
    const sections = FINALE.sections.map(({ kind, length }) => ({ kind, start: at, end: (at += length) }));
    sections[sections.length - 1].end = Infinity; // the shore goes on past the boats
    finale = { start, sections, gateExit: start + FINALE.wallAt + FINALE.wallDepth, beach: sections.find((s) => s.kind === 'beach').start };
    // The finish moves to the boats.
    finishDistance = start + FINALE.boardAt;
    finishIndex = Infinity;
    obstacles.setLastRow(finishDistance - JOURNEY.finishClearDistance);
  }
  const finaleSectionAt = (d) => finale.sections.find((s) => d >= s.start && d < s.end);
  let finishIndex = Infinity; // first open chunk (Escape mode)
  // Where the next chunk on the path goes (and the Forum it is in, if any).
  const cursor = { position: new THREE.Vector3(), angle: 0, distance: 0, run: null };
  let cameFromForum = false;

  // Stretches where the lanes are steps: { from, to, heights: [lane 0, 1, 2] }
  // (rising from flat over TRACK.stepRamp metres and sinking back at the end),
  // or { from, to, floor(metres in, lane) } (the theatre).
  let steps = [];
  function floorAt(d, x) {
    return pumiceAt(d) + stepsAt(d, x);
  }
  function stepsAt(d, x) {
    const run = steps.find((r) => d >= r.from && d < r.to);
    if (!run) return 0;
    const lane = THREE.MathUtils.clamp(Math.round(x / LANES.width + (LANES.count - 1) / 2), 0, LANES.count - 1);
    if (run.floor) return run.floor(d - run.from, lane);
    const k = THREE.MathUtils.clamp(Math.min(d - run.from, run.to - d) / TRACK.stepRamp, 0, 1);
    return run.heights[lane] * k;
  }
  const steppedAt = (from, to) => steps.some((r) => r.from < to && r.to > from);

  // Curvature of the path through the chunk starting at d (0 = straight).
  // TRACK.testCurve (tests only) bends every other chunk.
  const curveFor = (d) => (TRACK.testCurve && Math.round(d / L) % 2 === 1 ? TRACK.testCurve : 0);

  // The path chunk at a distance (the street the runner is on or will be).
  const chunkAt = (d) => path.find((c) => d >= c.distance && d < c.distance + L);
  // How many lanes at a path distance: the Forum is wider, from just past
  // its entrance arch to a little before its end.
  const forumWide = (run, d) => run?.kind === 'forum' && d >= run.start + DISTRICTS.gateOpen && d < run.end - DISTRICTS.narrowBefore;
  const lanesAt = (d) => (forumWide(chunkAt(d)?.run, d) ? DISTRICTS.forumLanes : LANES.count);
  const tmp = new THREE.Vector3();
  const toWorldFrame = new THREE.Matrix4();

  // Puts a chunk at a place on the path and gives it its layout and obstacles.
  function placeChunk(chunk, position, angle, distance, kind, district = 'residential', run = null) {
    chunk.start.copy(position);
    chunk.angle = angle;
    chunk.distance = distance;
    chunk.kind = kind;
    chunk.district = district;
    chunk.run = run;
    // The kit street runs along +z; turned 180° it runs along -z, then the heading.
    chunk.root.position.copy(position);
    chunk.root.rotation.y = Math.PI + angle;
    // Mirroring left-right doubles the variety. (The kit is double-sided, so
    // the flipped faces still draw correctly.)
    chunk.mirrored = kind === 'street' && Math.random() < 0.5;
    if (kind !== 'side') chunk.gap = null;
    chunk.root.scale.x = chunk.mirrored ? -1 : 1;
    chunk.root.visible = true;
    const layout =
      kind === 'T' || kind === 'X' ? junctionLayouts[chunk.villa ? 'X' : kind] // the house's front closes the far side instead of the wall
      : kind === 'open' ? openLayout
      : district === 'theatre' ? emptyLayout
      : district === 'villa' ? (distance === run.end - L ? backLaneLayout : emptyLayout)
      : kind === 'finale' ? (district === 'gate' ? gateLayout : countryLayouts[district] ? countryLayouts[district][Math.floor(Math.random() * 3)] : openLayout)
      : district === 'forum' ? forumLayout(distance, run)
      : chunk.gap ? gapLayouts[chunk.gap]
      : layouts[Math.floor(Math.random() * layouts.length)];
    for (const lod of ['near', 'far']) {
      for (const [material, mesh] of chunk.lods[lod].userData.meshes) {
        const geometry = layout[lod].get(material);
        mesh.visible = Boolean(geometry);
        if (geometry) mesh.geometry = geometry;
      }
    }
    chunk.lods.shadow.userData.mesh.geometry = layout.shadow;
    chunk.pumice.update(distance, (z) => pumiceAt(distance + z));
    if (district === 'gate') gate.place(distance + FINALE.collapse.at);
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
    if (run?.kind === 'forum') {
      // Nothing where the outer lanes end and the runner may be moving in.
      const narrow = run.end - DISTRICTS.narrowBefore;
      const metres = DISTRICTS.laneChangeClear * speedAt(narrow) * MAX_SPEED_MULTIPLIER;
      clear.push([narrow - metres, narrow + metres]);
    }
    obstacles.fill(chunk.slot, chunk, {
      empty: kind === 'T' || kind === 'X' || kind === 'side',
      clear,
      openSquare: district === 'forum',
      // On steps: each piece stands on its own step, and nothing spans the lanes.
      stepped: steppedAt(distance, distance + L),
      floorAt,
      rulesAt: district === 'gate' ? () => null // only the arch coming down
        : FINALE.obstacles[district] ? () => FINALE.obstacles[district]
        : district === 'theatre' ? (d) => theatreRules(d - run.start)
        : district === 'villa' ? (d) => (d - run.start < VILLA.length + 3 ? null : undefined) // inside, only the house's own obstacles
        : undefined,
      lanesAt: (d) => (forumWide(run, d) ? DISTRICTS.forumLanes : LANES.count),
    });
    if (finishDistance && distance <= finishDistance && finishDistance < distance + L) {
      // The finish marks, on the path.
      finishMarks.matrix.copy(frameAt(finishDistance));
      finishMarks.matrixAutoUpdate = false;
      finishMarks.matrixWorldNeedsUpdate = true;
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
    if (finishDistance && !finale && d >= finaleStartFor(finishDistance)) layFinale(d);
    const section = finale && d >= finale.start ? finaleSectionAt(d) : null;
    const run = section ?? (cursor.run && d < cursor.run.end ? cursor.run : null);
    // Past the theatre, wait to lay the street until the runner is inside it,
    // so the street (which leads away round the far side) never shows
    // through the junction he came from.
    if (cursor.run?.kind === 'theatre' && !run && playerDistance < cursor.run.start + ROUTE.passageEnd) {
      free.push(chunk);
      return false;
    }
    const kind = section ? 'finale' : d >= finishIndex * L ? 'open' : run ? run.kind : d === nextJunction ? (Math.random() < TURNS.crossroadsChance ? 'X' : 'T') : 'street';
    // Tests only: a stepped stretch every fourth pair of chunks.
    if (TRACK.testSteps && Math.round(d / L) % 8 === 4) steps.push({ from: d, to: d + 2 * L, heights: TRACK.testSteps });
    // A curve (k ≠ 0): the path bends through this chunk.
    const k = curveFor(d);
    if (TRACK.testCurve && k !== (segmentAt(d).k ?? 0)) segments.push({ from: d, start: cursor.position.clone(), angle: cursor.angle, k });
    // A T-junction may have the rich house across it (never two junctions running).
    chunk.villa = kind === 'T' && house && !villaLast && villaFits(d) && Math.random() < VILLA.chance;
    if (kind === 'T' || kind === 'X') villaLast = chunk.villa;
    placeChunk(chunk, cursor.position, cursor.angle, d, kind, run ? run.kind : 'residential', run);
    path.push(chunk);
    if (section) cursor.run = null;
    // Where the next chunk starts: along the straight or round the curves.
    cursor.angle = pose(d + L, cursor.position);
    cursor.distance += L;
    if (kind === 'T' || kind === 'X') openJunction(chunk);
    return true;
  }

  // A junction: lay a short side street down each open way and wait for
  // the runner to choose.
  function openJunction(chunk) {
    junction = chunk;
    exits = {};
    const centre = chunk.start.clone().addScaledVector(forward(chunk.angle, tmp), CENTRE);
    const ways = chunk.kind === 'X' || chunk.villa ? { left: 1, right: -1, straight: 0 } : { left: 1, right: -1 };
    for (const [way, turn] of Object.entries(ways)) {
      const side = free.pop();
      if (!side) continue;
      const angle = chunk.angle + turn * QUARTER;
      const start = turn === 0 ? cursor.position.clone() : centre.clone().addScaledVector(forward(angle, tmp), SQUARE / 2);
      // Where this way leads: sometimes into the theatre (once a run, if it
      // ends well before the sea), or the Forum (never twice running).
      const d = cursor.distance;
      const theatreFits = (!finishDistance || d + ROUTE.length < lastJunctionBefore()) && beforePumice(d + ROUTE.length);
      let run = null;
      if (chunk.villa && way === 'straight') {
        // Straight on: through the house's door, down its rooms, out of the back door.
        run = villaRun = { kind: 'villa', start: d, end: d + Math.ceil(VILLA.length / L) * L };
        house.place(start, angle, run);
      } else if ((!theatreUsed || THEATRE.testRepeat) && !theatreRun && theatreFits && Math.random() < THEATRE.chance) {
        run = theatreRun = { kind: 'theatre', start: d, end: d + ROUTE.length };
        theatre.place(start, angle);
      } else if (!cameFromForum && Math.random() < DISTRICTS.forumChance) {
        const [min, max] = DISTRICTS.forumChunks;
        run = { kind: 'forum', start: d, end: d + L * (min + Math.floor(Math.random() * (max - min + 1))) };
        if (!beforePumice(run.end)) run = null;
      }
      // Beside the house, the side streets leave a gap for it on its side.
      side.gap = chunk.villa && way !== 'straight' ? way : null;
      placeChunk(side, start, angle, d, 'side', run ? run.kind : 'residential', run);
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
    if (chosen.angle !== cursor.angle) {
      // The path now turns at the junction's centre and runs down the side street.
      const centreDistance = junction.distance + CENTRE;
      segments.push({ from: centreDistance, start: chosen.start.clone().addScaledVector(forward(chosen.angle, tmp), -SQUARE / 2), angle: chosen.angle, k: 0 });
    }
    cursor.angle = chosen.angle;
    cursor.position.copy(chosen.start).addScaledVector(forward(chosen.angle, tmp), L);
    cursor.distance = chosen.distance + L;
    cursor.run = chosen.run; // into the Forum or the theatre, or null
    cameFromForum = chosen.run?.kind === 'forum';
    if (chosen.run?.kind === 'theatre') {
      // The path follows the theatre's route: its curves, and its floors.
      theatreUsed = true;
      for (const { at, k } of ROUTE.bends) {
        const from = chosen.distance + at;
        const start = new THREE.Vector3();
        const angle = poseOn(segments[segments.length - 1], from, start);
        segments.push({ from, start, angle, k });
      }
      steps.push({ from: chosen.run.start, to: chosen.run.end, floor: theatreFloor });
      // The side street was laid empty; the passage has its own obstacles.
      const run = chosen.run;
      obstacles.fill(chosen.slot, chosen, { floorAt, rulesAt: (d) => theatreRules(d - run.start) });
      cursor.angle = pose(cursor.distance, cursor.position);
    } else if (theatreRun) {
      // The theatre was down another way.
      theatreRun.declined = true;
    }
    if (villaRun && chosen.run !== villaRun) villaRun.declined = true;
    junction = null;
    exits = null;
    // The next junction comes after the Forum, out in the streets again.
    planNextJunction(chosen.run ? chosen.run.end : cursor.distance);
  }

  // Is there room for the house before the sea, after a junction at d?
  const villaFits = (d) => {
    const end = d + 2 * L + Math.ceil(VILLA.length / L) * L;
    return beforePumice(end) && (!finishDistance || end < lastJunctionBefore());
  };

  function planNextJunction(from) {
    nextJunction = TURNS.enabled ? nextJunctionAfter(from, randomInterval()) : Infinity;
    if (finishDistance && nextJunction + L > lastJunctionBefore()) nextJunction = Infinity;
  }
  // No junction (or district) reaches past this: the finale and a margin before it.
  const lastJunctionBefore = () => (finale ? finale.start : finishDistance - FINALE_LENGTH) - FINALE.margin;

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
    cursor.position.set(0, 0, TRACK.chunksBehind * L);
    cursor.angle = 0;
    cursor.distance = -TRACK.chunksBehind * L;
    segments = [{ from: cursor.distance, start: cursor.position.clone(), angle: 0, k: 0 }];
    steps = [];
    theatre.hide();
    theatreRun = null;
    theatreUsed = false;
    house?.hide();
    villaRun = null;
    pumice = null;
    finale = null;
    gate.hide();
    villaLast = false;
    placeWorld(0);
    cursor.run = null;
    cameFromForum = false;
    obstacles.reset(finish ? finish - JOURNEY.finishClearDistance : Infinity);
    statues.reset();
    planNextJunction(0);
    nextJunction = TURNS.enabled ? Math.max(nextJunction, nextJunctionAfter(0, TURNS.firstAfter)) : Infinity;
    if (finishDistance && nextJunction + L > lastJunctionBefore()) nextJunction = Infinity;
    for (let i = 0; i < TRACK.chunksBehind + 1 + TRACK.chunksAhead && !junction; i++) extend();
  }

  // Places the world so the path at the runner (s metres along it) runs
  // along -z through x = 0 at z = -s: the runner never turns, the town does.
  let heading = 0;
  let playerDistance = 0;
  const worldTurn = new THREE.Matrix4();
  const toStart = new THREE.Matrix4();
  function placeWorld(s) {
    playerDistance = s;
    const angle = pose(s, framePoint);
    heading = -angle;
    toStart.makeTranslation(-framePoint.x, -framePoint.y, -framePoint.z);
    worldTurn.makeRotationY(-angle);
    world.matrix.makeTranslation(0, 0, -s).multiply(worldTurn).multiply(toStart);
    world.matrixWorldNeedsUpdate = true;
    world.updateMatrixWorld(true);
    // Segments well behind are no longer needed.
    while (segments.length > 1 && segments[1].from < s - 3 * L) segments.shift();
    steps = steps.filter((r) => r.to > s - 3 * L);
  }

  const detailDistance = isLowEnd() ? GRAPHICS.detailDistance.low : GRAPHICS.detailDistance.high;

  reset();

  return {
    world,
    reset,
    obstacles,
    statues,

    // The obstacle touching the player's hitbox, or null. Collisions work in
    // path space: x across the path, y up, z = -(metres along it). On the
    // runner's own street that is exactly the scene, so his hitbox can be
    // used as it is, on straights, after turns and round curves alike.
    findCollision(hitbox) {
      return obstacles.findCollision(hitbox) ?? statues.findCollision(hitbox) ?? gate.findCollision(hitbox) ?? (villaRun && !villaRun.declined ? house.findCollision(hitbox) : null);
    },

    // The rich house's own obstacles while it is on the path (tests and tools).
    houseObstacles: () => (villaRun && !villaRun.declined ? house.list() : []),

    // The floor height at a path distance, x across (0 except on steps).
    floorAt,

    // How many lanes there are at a path distance.
    lanesAt,

    // The pumice depth at a path distance (0 before it starts).
    pumiceAt,

    // Porta Stabia's arch (the finale): update(dt, playerDistance, speed, callbacks).
    gate,

    // Where the run ends (Escape mode): it moves to the boats once the finale is laid.
    get finishDistance() {
      return finishDistance;
    },

    // Fixes where the pumice starts (path distance) and over how many metres
    // it rises. Never under street already laid, nor inside a district run
    // already on its way (the Forum, the theatre, the house).
    setPumice(start, length) {
      if (pumice) return;
      let from = Math.max(start, cursor.distance + 1);
      for (const run of [cursor.run, theatreRun, villaRun]) if (run && !run.declined) from = Math.max(from, run.end);
      pumice = { start: from, length };
    },
    get pumice() {
      return pumice;
    },

    // Path space (x across, y up, z = -metres along) → the world group's space.
    toWorld(point, target = new THREE.Vector3()) {
      return target.set(point.x, point.y, 0).applyMatrix4(frameAt(-point.z, toWorldFrame));
    },
    frameAt,

    // How far (metres along the path) from `distance` to the nearest obstacle
    // row or statue that may topple, or 0 inside a junction's clear zone or
    // a tunnel (nothing should fall there).
    distanceToObstacle(distance) {
      if (junction && Math.abs(distance - (junction.distance + CENTRE)) < L) return 0;
      if (theatreRun && !theatreRun.declined) {
        // Nothing falls in the theatre's vaulted passage or its vomitorium.
        const rel = distance - theatreRun.start;
        if ((rel > -2 && rel < ROUTE.passageEnd) || (rel > ROUTE.tunnelStart - 2 && rel < ROUTE.tunnelEnd + 2)) return 0;
      }
      if (villaRun && !villaRun.declined) {
        // Nothing falls under the house's roofs: only in its open garden.
        const rel = distance - villaRun.start;
        if (rel > -2 && rel < VILLA.length + 2 && !VILLA.openSky.some(([a, b]) => rel > a && rel < b)) return 0;
      }
      let best = Infinity;
      for (const o of obstacles.list()) best = Math.min(best, Math.abs(o.distance - distance));
      for (const d of statues.toppleDistances()) best = Math.min(best, Math.abs(d - distance));
      return best;
    },

    // The district at a path distance: the Forum or the theatre from just
    // inside its entrance to its end.
    districtAt(distance) {
      const run = chunkAt(distance)?.run;
      return run && distance >= run.start + DISTRICTS.gateOpen && distance < run.end ? run.kind : 'residential';
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
        villa: Boolean(junction.villa), // the rich house across it, door open (straight on)
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
      chooseExit(way);
      const angle = way === 'left' ? -QUARTER : way === 'right' ? QUARTER : 0;
      placeWorld(playerDistance);
      return angle;
    },

    // Escape mode: the sea moved nearer or further (a turn towards or away
    // from it). Only the path not laid yet changes, so call this before
    // take(): the new street is laid after the turn.
    setFinish(finish) {
      if (finale) return; // laid: the finish is at the boats
      finishDistance = finish;
      finishIndex = Math.floor(finish / L);
      obstacles.setLastRow(finish - JOURNEY.finishClearDistance);
    },

    // Which way the world faces (radians); the sky and the sun turn with it.
    get heading() {
      return heading;
    },

    // fogDistance: beyond this, the fog hides everything (metres).
    update(playerZ, fogDistance = Infinity) {
      placeWorld(-playerZ);
      const inTheatre = theatreRun && !theatreRun.declined && playerDistance > theatreRun.start && playerDistance < theatreRun.start + ROUTE.ringEnd;
      ground.update(playerZ, inTheatre);
      // Recycle chunks that are now too far behind; lay new ones ahead.
      while (path.length && path[0].distance + L < playerDistance - TRACK.chunksBehind * L) release(path.shift());
      if (leftovers.length && playerDistance >= releaseLeftoversAt) {
        leftovers.forEach(release);
        leftovers = [];
      }
      // The house goes once it is behind (or once its way was not taken).
      if (villaRun && ((villaRun.declined && playerDistance >= releaseLeftoversAt) || playerDistance > villaRun.end + TRACK.chunksBehind * L)) {
        house.hide();
        villaRun = null;
      }
      // The theatre goes once it is behind (or once its way was not taken).
      if (theatreRun && ((theatreRun.declined && playerDistance >= releaseLeftoversAt) || playerDistance > theatreRun.end + TRACK.chunksBehind * L)) {
        theatre.hide();
        theatreRun = null;
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
      if (theatreRun) theatre.group.visible = theatreRun.start - cameraDistance < fogDistance;
      if (villaRun) house.group.visible = villaRun.start - cameraDistance < fogDistance;
    },
  };
}
