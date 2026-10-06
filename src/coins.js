import * as THREE from 'three';
import { COINS, LANES, PLAYER, TRACK } from './config.js';
import { loadGLTF } from './assets.js';
import { laneToX } from './lanes.js';
import { speedAt } from './speed.js';

// Coins on the street: silver denarii and gold aurei (tools/build-coins.mjs).
//
// Coins come in PATTERNS laid with the obstacle rows, chunk by chunk, so a
// line of coins always shows a safe way through:
//   straight   – a line in a lane that is free at the next row
//   laneSwitch – a line easing over into a free lane before a row
//   jumpArc    – an arc over a jump obstacle, following the jump (gold at
//                the top over the tall ones)
//   slideLine  – low coins under a slide obstacle
//   zigzag     – weaving across the lanes where there are no rows
//   pocket     – one gold coin right beside an obstacle, in a free lane
// Every coin (but the pocket's) is checked: the runner collecting it, in the
// way the pattern means (running, jumping or sliding), never touches an
// obstacle. A pattern with a coin that fails is dropped.
//
// Drawing: one InstancedMesh per coin type for the whole track, pooled like
// the obstacles. Each frame the coins in view are written to the front of
// it (mesh.count), spinning and bobbing; gold ones glint (their instance
// colour flashes brighter).
//
// Positions are kept in path space: x across the path, d metres along it,
// y above the floor there. Like the obstacles, they live in the track's
// turning world group, placed with the path's frame at d.

const TYPES = { silver: 'Coin_Denarius', gold: 'Coin_Aureus' };
const L = TRACK.chunkLength;
const between = ([a, b]) => a + Math.random() * (b - a);
const randomInt = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
// A jump: how long he is in the air, and how high his feet are a fraction u of the way through it.
const AIR_TIME = 2 * Math.sqrt((2 * PLAYER.jumpHeight) / PLAYER.gravity);
const jumpFeet = (u) => 4 * PLAYER.jumpHeight * u * (1 - u);

// Loads both coins. Their textures are scaled down (they are made at 2048
// pixels, far more than a coin on a phone screen needs).
export async function loadCoins(envMap) {
  const gltf = await loadGLTF(COINS.file);
  gltf.scene.updateMatrixWorld(true);
  const models = {};
  for (const [type, name] of Object.entries(TYPES)) {
    const mesh = gltf.scene.getObjectByName(name);
    if (!mesh) throw new Error(`coins.glb has no "${name}"`);
    const material = mesh.material;
    for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
      const texture = material[key];
      if (!texture || texture.userData.scaled) continue;
      texture.userData.scaled = true; // the roughness and metalness maps are one texture
      const image = texture.image, scale = Math.min(1, COINS.textureSize / image.width);
      if (scale >= 1) continue;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      texture.image = canvas;
      texture.needsUpdate = true;
    }
    material.envMap = envMap; // metal shows what it reflects
    // The compressed file keeps each coin's true size and centre in its node's
    // transform (the geometry is stored at unit size): every instance needs it.
    models[type] = { geometry: mesh.geometry, material, matrix: mesh.matrixWorld.clone().premultiply(new THREE.Matrix4().makeScale(COINS.scale, COINS.scale, COINS.scale)) };
  }
  return models;
}

// world: the track's turning group. frameAt(d): the path's frame there.
// obstacles: the track's obstacle rows (to keep coins clear of them).
export function createCoins(world, models, frameAt, obstacles) {
  const meshes = {};
  for (const type of Object.keys(TYPES)) {
    const mesh = new THREE.InstancedMesh(models[type].geometry, models[type].material, COINS.maxPerType);
    mesh.name = `coins:${type}`;
    mesh.frustumCulled = false; // instances move all over the track
    mesh.count = 0;
    for (let i = 0; i < COINS.maxPerType; i++) mesh.setColorAt(i, WHITE);
    world.add(mesh);
    meshes[type] = mesh;
  }

  const active = []; // per chunk slot: its coins { type, x, y, d, floor, base, phase, taken }
  let cursor = 0; // patterns are laid in order along the path; the next starts after this
  let patternsSinceBreak = 0;
  let lastGold = -Infinity;
  let speedMultiplier = 1; // the phase's, for fitting jump arcs to the jump
  const collected = { silver: 0, gold: 0 };
  const laid = { silver: 0, gold: 0, patterns: {} }; // this run's coins laid, by type and pattern (tests and tools)

  const goldGap = (d) => {
    const k = THREE.MathUtils.clamp((speedAt(d) - PLAYER.startSpeed) / (PLAYER.maxSpeed - PLAYER.startSpeed), 0, 1);
    return THREE.MathUtils.lerp(COINS.goldGap[0], COINS.goldGap[1], k);
  };
  const goldAllowed = (d) => d - lastGold >= goldGap(d);

  // ---- safety
  const box = new THREE.Box3();
  const half = PLAYER.size.x / 2;
  // Does the runner, collecting this coin the way its pattern means, touch an obstacle?
  function touchesObstacle(c, near) {
    const feet = c.floor + (c.state === 'jump' ? c.feet : 0);
    const height = c.state === 'slide' ? PLAYER.slideHeight : PLAYER.size.y;
    box.min.set(c.x - half, feet, -c.d - half);
    box.max.set(c.x + half, feet + height, -c.d + half);
    return near.some((o) => o.hitbox.intersectsBox(box));
  }
  // Is there an obstacle a few metres ahead of this coin, in its way? (A
  // line must not lead straight into one.) Jump and slide coins are over or
  // under theirs on purpose.
  function leadsInto(c, near) {
    if (c.state !== 'run') return false;
    return near.some((o) => {
      const ahead = -o.hitbox.max.z - c.d;
      return ahead > 0 && ahead < COINS.endBefore && c.x + half > o.hitbox.min.x && c.x - half < o.hitbox.max.x;
    });
  }

  // ---- the patterns. Each returns a list of coins, or null if it doesn't fit.
  // row: the next obstacle row ({ distance, count, full, lanes }) or null
  // (open road up to `limit`). p: where the pattern may start.
  const coin = (type, x, y, d, state = 'run', feet = 0) => ({ type, x, y, d, state, feet });
  const freeLanes = (row) => row.lanes.map((name, lane) => (name ? -1 : lane)).filter((l) => l >= 0);
  const PATTERNS = {
    straight(row, p, limit, count) {
      const lane = row ? (row.full ? -1 : pick(freeLanes(row))) : Math.floor(Math.random() * count);
      if (lane === undefined || lane < 0) return null;
      const n = Math.min(randomInt(COINS.straight), Math.floor((limit - p) / COINS.spacing) + 1);
      if (n < COINS.straight[0]) return null;
      return Array.from({ length: n }, (_, i) => coin('silver', laneToX(lane, count), COINS.height, p + i * COINS.spacing));
    },
    laneSwitch(row, p, limit, count) {
      if (!row || row.full) return null;
      const options = [];
      row.lanes.forEach((name, a) => { for (const b of [a - 1, a + 1]) if (name && b >= 0 && b < count && !row.lanes[b]) options.push([a, b]); });
      if (!options.length) return null;
      const [a, b] = pick(options), { coins, length } = COINS.laneSwitch;
      const end = row.distance - COINS.endBefore, start = end - length;
      if (start < p) return null;
      return Array.from({ length: coins }, (_, i) => {
        const t = i / (coins - 1), s = t * t * (3 - 2 * t);
        return coin('silver', THREE.MathUtils.lerp(laneToX(a, count), laneToX(b, count), s), COINS.height, start + t * length);
      });
    },
    jumpArc(row, p, limit, count) {
      if (!row) return null;
      const lanes = row.full ? (obstacles.moveOf(row.full) === 'jump' ? [...Array(count).keys()] : [])
        : row.lanes.map((name, lane) => (name && obstacles.moveOf(name) === 'jump' ? lane : -1)).filter((l) => l >= 0);
      if (!lanes.length) return null;
      const lane = pick(lanes), x = laneToX(lane, count);
      const jump = AIR_TIME * speedAt(row.distance) * speedMultiplier, { coins, top, hard } = COINS.jumpArc;
      // How tall the obstacle under the arc is: a tall one earns a gold coin at the top.
      const under = obstacles.list().find((o) => Math.abs(o.distance - row.distance) < 0.1 && o.hitbox.min.x < x && o.hitbox.max.x > x);
      const tall = under && under.hitbox.max.y - under.hitbox.min.y + 2 * 0.1 > hard;
      const list = [];
      for (let k = 0; k < coins; k++) {
        const u = 0.1 + (0.8 * k) / (coins - 1); // through the jump, centred on the obstacle
        const d = row.distance + (u - 0.5) * jump;
        const feet = jumpFeet(u);
        const y = COINS.height + (top - COINS.height) * (feet / PLAYER.jumpHeight);
        const middle = k === (coins - 1) / 2;
        list.push(coin(middle && tall && goldAllowed(d) ? 'gold' : 'silver', x, y, d, 'jump', feet));
      }
      return list[0].d < p ? null : list;
    },
    slideLine(row, p, limit, count) {
      if (!row?.full || obstacles.moveOf(row.full) !== 'slide') return null;
      const lane = Math.floor(Math.random() * count), { coins, height } = COINS.slideLine;
      const list = Array.from({ length: coins }, (_, k) => coin('silver', laneToX(lane, count), height, row.distance + (k - (coins - 1) / 2) * COINS.spacing, 'slide'));
      return list[0].d < p ? null : list;
    },
    zigzag(row, p, limit, count) {
      const n = randomInt(COINS.zigzag);
      if (p + (n - 1) * COINS.spacing > limit) return null;
      const reach = laneToX(count - 1, count), turn = Math.random() < 0.5 ? 1 : -1;
      return Array.from({ length: n }, (_, i) => coin('silver', turn * reach * Math.sin((i / (n - 1)) * Math.PI * 2), COINS.height, p + i * COINS.spacing));
    },
    pocket(row, p, limit, count) {
      if (!row || row.full || row.distance < p || !goldAllowed(row.distance)) return null;
      const options = [];
      row.lanes.forEach((name, lane) => { if (!name) for (const side of [-1, 1]) if (row.lanes[lane + side]) options.push([lane, side]); });
      if (!options.length) return null;
      const [lane, side] = pick(options);
      return [{ ...coin('gold', laneToX(lane, count) + side * COINS.pocketOffset, COINS.height, row.distance), pocket: laneToX(lane, count) }];
    },
  };
  // Which patterns can go with this row.
  function candidates(row) {
    if (!row) return ['straight', 'zigzag'];
    if (row.full) return obstacles.moveOf(row.full) === 'slide' ? ['slideLine'] : ['jumpArc'];
    return ['straight', 'laneSwitch', 'jumpArc', 'pocket'];
  }
  function weightedOrder(names) {
    const left = [...names], order = [];
    while (left.length) {
      let r = Math.random() * left.reduce((s, n) => s + COINS.weights[n], 0);
      const i = left.findIndex((n) => (r -= COINS.weights[n]) < 0);
      order.push(left.splice(i < 0 ? 0 : i, 1)[0]);
    }
    return order;
  }

  // Places a pattern's coins if every one of them is allowed.
  function accept(list, from, to, ctx) {
    const near = obstacles.list().filter((o) => o.distance > from - 6 && o.distance < to + 6);
    for (const c of list) {
      if (c.d < from || c.d > to) return false;
      if (!ctx.allowAt(c.d) || ctx.clear.some(([a, b]) => c.d > a && c.d < b)) return false;
      c.floor = ctx.floorAt(c.d, c.x);
      // The pocket's coin is close to its obstacle on purpose; it is only
      // checked from the middle of its lane, where the runner collects it.
      if (c.pocket !== undefined) {
        if (touchesObstacle({ ...c, x: c.pocket }, near)) return false;
        continue;
      }
      if (touchesObstacle(c, near) || leadsInto(c, near)) return false;
    }
    return true;
  }

  const frame = new THREE.Matrix4();
  const offset = new THREE.Matrix4();
  function addCoins(list, slot) {
    for (const c of list) {
      c.base = frameAt(c.d, frame).clone().multiply(offset.makeTranslation(c.x, c.floor + c.y, 0));
      c.phase = Math.random() * Math.PI * 2;
      c.taken = false;
      active[slot].push(c);
      if (c.type === 'gold') lastGold = Math.max(lastGold, c.d);
      laid[c.type]++;
    }
  }

  const spin = new THREE.Matrix4();
  const bob = new THREE.Matrix4();
  const matrix = new THREE.Matrix4();
  const glint = new THREE.Color();

  return {
    reset() {
      for (let i = 0; i < active.length; i++) active[i] = [];
      cursor = 0;
      patternsSinceBreak = 0;
      lastGold = -Infinity;
      collected.silver = collected.gold = 0;
      laid.silver = laid.gold = 0;
      laid.patterns = {};
      for (const mesh of Object.values(meshes)) mesh.count = 0;
    },

    // The phase's speed multiplier, so jump arcs match the jump.
    setSpeedMultiplier(m) {
      speedMultiplier = m;
    },

    // Lays a chunk's coins, after its obstacle rows (rows: what
    // obstacles.fill returned). ctx: { empty, clear, floorAt(d, x),
    // lanesAt(d), allowAt(d) } as for the obstacles; allowAt is false
    // where there are no rows (set pieces, the gate).
    fill(slot, chunk, rows, { empty = false, clear = [], floorAt = () => 0, lanesAt = () => LANES.count, allowAt = () => true } = {}) {
      active[slot] = [];
      if (empty) return;
      const start = chunk.distance, ctx = { clear, floorAt, allowAt };
      // Coins stay in this chunk, and short of the next chunk's first row.
      const limit = Math.min(start + L, obstacles.nextRowDistance - COINS.endBefore);
      let p = Math.max(cursor, start);
      while (p < limit) {
        const row = rows.find((r) => r.distance > p + 1) ?? null;
        const count = row ? row.count : lanesAt(p);
        const end = row ? Math.min(limit, row.distance + 8) : limit;
        let placed = null;
        if (Math.random() < COINS.patternChance) {
          for (const name of weightedOrder(candidates(row))) {
            const list = PATTERNS[name](row, p, row && name === 'straight' ? row.distance + 2 : end, count);
            if (list && accept(list, p, limit, ctx)) { placed = list; laid.patterns[name] = (laid.patterns[name] ?? 0) + 1; break; }
          }
        }
        if (placed) {
          addCoins(placed, slot);
          p = Math.max(...placed.map((c) => c.d)) + between(COINS.patternGap);
          if (++patternsSinceBreak >= COINS.breakEvery) {
            patternsSinceBreak = 0;
            p += between(COINS.breakGap);
          }
        } else {
          p = row ? row.distance + 2 : limit;
        }
      }
      cursor = Math.max(cursor, p);
    },

    release(slot) {
      active[slot] = [];
    },

    // Each frame: draws the coins in view and collects the ones the runner
    // touches. player: { object, hitbox }. Returns the coins picked up this
    // frame ([{ type, position }], position in world space, for the flight to
    // the counter); collected holds the run's totals.
    update(dt, time, player) {
      const pd = -player.object.position.z, px = player.object.position.x;
      const lowY = player.hitbox.min.y, highY = player.hitbox.max.y, r = COINS.pickupRadius;
      const picked = [];
      const counts = { silver: 0, gold: 0 };
      const angle = time * COINS.spinSpeed;
      for (const list of active) {
        if (!list) continue;
        for (const c of list) {
          if (c.taken) continue;
          const ahead = c.d - pd;
          // Pickup: only coins just around the runner are checked.
          if (ahead > -r && ahead < COINS.pickupAhead) {
            const y = c.floor + c.y, dy = Math.max(0, lowY - y, y - highY);
            if (Math.hypot(c.x - px, ahead, dy) < r) {
              c.taken = true;
              collected[c.type]++;
              const position = new THREE.Vector3().setFromMatrixPosition(c.base);
              picked.push({ type: c.type, position: position.applyMatrix4(world.matrixWorld) });
              continue;
            }
          }
          if (ahead < -2 || ahead > COINS.drawDistance) continue;
          const mesh = meshes[c.type], i = counts[c.type]++;
          if (i >= COINS.maxPerType) continue;
          bob.makeTranslation(0, COINS.bobHeight * Math.sin(time * COINS.bobSpeed + c.phase), 0);
          spin.makeRotationY(angle + c.phase);
          mesh.setMatrixAt(i, matrix.copy(c.base).multiply(bob).multiply(spin).multiply(models[c.type].matrix ?? IDENTITY));
          if (c.type === 'gold') {
            // A short flash once a second, each coin at its own moment.
            const t = ((time + c.phase) % COINS.glintEvery) / COINS.glintLength;
            const flash = t < 1 ? Math.sin(t * Math.PI) * COINS.glintBrightness : 0;
            mesh.setColorAt(i, glint.copy(WHITE).multiplyScalar(1 + flash));
          }
        }
      }
      for (const [type, mesh] of Object.entries(meshes)) {
        mesh.count = Math.min(counts[type], COINS.maxPerType);
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      return picked;
    },

    // The run's totals so far ({ silver, gold }).
    collected,
    laid,

    // Every coin laid and not yet taken (tests and tools).
    list() {
      return active.flat().filter((c) => c && !c.taken);
    },
  };
}
const WHITE = new THREE.Color(1, 1, 1);
const IDENTITY = new THREE.Matrix4();
