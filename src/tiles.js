import * as THREE from 'three';
import { LANES, OBSTACLES, TILES, TOWN } from './config.js';
import { laneToX } from './lanes.js';
import { box, merge } from './geometry.js';

// Falling roof tiles. Each tile goes through three stages:
//   warning  – a shadow grows and darkens on the road where it will land
//   falling  – the tile drops for the last part of the warning (dangerous)
//   broken   – it shatters into pieces that scatter and sink away (harmless)
//
// Everything is pooled and instanced: one mesh for all shadows, one for all
// tiles and one for all pieces, so tiles cost 3 draw calls in total.

const S = TILES.size;
const GRAVITY = 25;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const WHITE = new THREE.Color(1, 1, 1);
const DARK = new THREE.Color().setScalar(TILES.shadowDarkness);

// A Roman flat roof tile (tegula) with raised edges.
function tileGeometry() {
  return merge([
    box([S.x, S.y * 0.5, S.z], [0, 0, 0], TOWN.roof),
    box([S.y * 0.6, S.y, S.z], [-S.x / 2 + S.y * 0.3, S.y * 0.4, 0], TOWN.roofDark),
    box([S.y * 0.6, S.y, S.z], [S.x / 2 - S.y * 0.3, S.y * 0.4, 0], TOWN.roofDark),
  ]);
}

function shadowMaterial() {
  // Multiplies whatever is underneath by the instance colour: white leaves
  // the road unchanged, grey darkens it. So the shadow can fade in per tile.
  return new THREE.MeshBasicMaterial({
    blending: THREE.CustomBlending,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.SrcColorFactor,
    depthWrite: false,
    fog: false,
    polygonOffset: true, // draw on top of the road without flickering
    polygonOffsetFactor: -2,
  });
}

function instanced(scene, name, geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.frustumCulled = false; // instances move; see architecture.js
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, HIDDEN);
  scene.add(mesh);
  return mesh;
}

export function createTiles(scene, track) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const shadowGeometry = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  const shadows = instanced(scene, 'tiles:shadow', shadowGeometry, shadowMaterial(), TILES.maxTiles);
  for (let i = 0; i < TILES.maxTiles; i++) shadows.setColorAt(i, WHITE);
  const tiles = instanced(scene, 'tiles:tile', tileGeometry(), material, TILES.maxTiles);
  // No sun shadow for the tile: it would land somewhere else on the road and
  // could be mistaken for the warning circle.
  const pieces = instanced(scene, 'tiles:piece', paintedBox(S.x * 0.4, S.y * 0.5, S.z * 0.35), material, TILES.maxTiles * TILES.pieces);

  const pool = Array.from({ length: TILES.maxTiles }, () => ({
    active: false,
    age: 0,
    x: 0,
    z: 0,
    spin: new THREE.Vector3(),
    hitbox: new THREE.Box3(),
    dangerous: false,
    shattered: false,
    pieces: Array.from({ length: TILES.pieces }, () => ({
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      rotation: new THREE.Euler(),
      spin: new THREE.Vector3(),
      scale: 1,
    })),
  }));

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const color = new THREE.Color();

  // Picks a landing spot about warningTime ahead of the player and checks
  // it can never make the way impossible; returns false if no spot is safe.
  function trySpawn(playerPosition, speed) {
    const tile = pool.find((t) => !t.active);
    if (!tile) return false;

    const playerLane = Math.round(playerPosition.x / LANES.width + (LANES.count - 1) / 2);
    const lane = Math.random() < TILES.targetPlayerChance ? playerLane : Math.floor(Math.random() * LANES.count);
    const clearance = TILES.clearanceTime * speed;
    const landZ = playerPosition.z - speed * TILES.warningTime;

    // Try the spot the player will reach, then nearby spots.
    for (const offset of [0, -3, 3, -6, 6]) {
      const z = landZ + offset;
      if (-z < OBSTACLES.safeStartDistance) continue;
      if (track.distanceToNearestObstacle(z) < clearance) continue;
      if (pool.some((t) => t.active && !t.shattered && Math.abs(t.z - z) < clearance)) continue;

      Object.assign(tile, { active: true, age: 0, x: laneToX(lane), z, dangerous: false, shattered: false });
      tile.spin.set(Math.random() * 6 - 3, Math.random() * 4 - 2, Math.random() * 6 - 3);
      return true;
    }
    return false;
  }

  function shatter(tile) {
    tile.shattered = true;
    tile.dangerous = false;
    tile.pieces.forEach((p, i) => {
      const angle = (i / TILES.pieces) * Math.PI * 2 + Math.random();
      const speed = 1.5 + Math.random() * 2.5;
      p.position.set(tile.x, S.y, tile.z);
      p.velocity.set(Math.cos(angle) * speed, 3 + Math.random() * 3, Math.sin(angle) * speed);
      p.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      p.spin.set(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6);
      p.scale = 0.6 + Math.random() * 0.6;
    });
  }

  function updateTile(tile, index, dt) {
    tile.age += dt;
    const W = TILES.warningTime;
    const t = tile.age;

    // Shadow: grows and darkens until the tile lands.
    if (t < W) {
      const k = t / W;
      const r = TILES.shadowRadius * (0.4 + 0.6 * k);
      shadows.setMatrixAt(index, m.makeScale(r, 1, r).setPosition(tile.x, 0.02, tile.z));
      shadows.setColorAt(index, color.lerpColors(WHITE, DARK, k));
    } else {
      shadows.setMatrixAt(index, HIDDEN);
    }

    // Falling tile: accelerates down like a dropped object, tumbling.
    const fallStart = W - TILES.fallTime;
    if (t >= fallStart && t < W) {
      const f = (t - fallStart) / TILES.fallTime;
      const y = TILES.dropHeight * (1 - f * f) + S.y / 2;
      const tumble = 1 - f;
      q.setFromEuler(e.set(tile.spin.x * tumble, tile.spin.y * tumble, tile.spin.z * tumble));
      tiles.setMatrixAt(index, m.compose(v.set(tile.x, y, tile.z), q, sc.set(1, 1, 1)));
      const h = Math.max(S.x, S.z) / 2 - TILES.hitboxMargin; // covers any tumble angle
      tile.hitbox.min.set(tile.x - h, y - h, tile.z - h);
      tile.hitbox.max.set(tile.x + h, y + h, tile.z + h);
      tile.dangerous = true;
    } else {
      tiles.setMatrixAt(index, HIDDEN);
    }

    if (t >= W && !tile.shattered) shatter(tile);

    // Pieces: fly, fall, skid to a stop, then sink into the road.
    const life = t - W;
    tile.pieces.forEach((p, i) => {
      const slot = index * TILES.pieces + i;
      if (!tile.shattered || life > TILES.pieceLifetime) {
        pieces.setMatrixAt(slot, HIDDEN);
        return;
      }
      p.velocity.y -= GRAVITY * dt;
      p.position.addScaledVector(p.velocity, dt);
      const rest = (S.y * 0.25) * p.scale;
      if (p.position.y <= rest) {
        p.position.y = rest;
        p.velocity.set(p.velocity.x * 0.8, 0, p.velocity.z * 0.8); // friction
        p.spin.multiplyScalar(0.8);
      } else {
        p.rotation.x += p.spin.x * dt;
        p.rotation.y += p.spin.y * dt;
        p.rotation.z += p.spin.z * dt;
      }
      const sink = Math.max(0, life - (TILES.pieceLifetime - 0.4)) * 0.5;
      q.setFromEuler(p.rotation);
      pieces.setMatrixAt(slot, m.compose(v.copy(p.position).setY(p.position.y - sink), q, sc.setScalar(p.scale)));
    });

    if (life > TILES.pieceLifetime) tile.active = false;
  }

  function hideAll() {
    for (let i = 0; i < TILES.maxTiles; i++) {
      shadows.setMatrixAt(i, HIDDEN);
      tiles.setMatrixAt(i, HIDDEN);
      for (let p = 0; p < TILES.pieces; p++) pieces.setMatrixAt(i * TILES.pieces + p, HIDDEN);
    }
    for (const mesh of [shadows, tiles, pieces]) mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    reset() {
      pool.forEach((tile) => (tile.active = false));
      hideAll();
    },

    // rate: tiles per second (from the eruption phase); speed: the player's current speed.
    update(dt, playerPosition, speed, rate) {
      // On average `rate` spawn attempts per second.
      if (Math.random() < rate * dt) trySpawn(playerPosition, speed);

      let changed = false;
      pool.forEach((tile, i) => {
        if (!tile.active) return;
        updateTile(tile, i, dt);
        changed = true;
        if (!tile.active) {
          // Just finished: make sure nothing of it is left on screen.
          shadows.setMatrixAt(i, HIDDEN);
          tiles.setMatrixAt(i, HIDDEN);
        }
      });
      if (changed) {
        shadows.instanceMatrix.needsUpdate = true;
        shadows.instanceColor.needsUpdate = true;
        tiles.instanceMatrix.needsUpdate = true;
        pieces.instanceMatrix.needsUpdate = true;
      }
    },

    collides(hitbox) {
      return pool.some((tile) => tile.active && tile.dangerous && tile.hitbox.intersectsBox(hitbox));
    },
  };
}

// A box with the terracotta colour on every vertex (for the fragments).
function paintedBox(x, y, z) {
  return box([x, y, z], [0, 0, 0], TOWN.roof);
}
