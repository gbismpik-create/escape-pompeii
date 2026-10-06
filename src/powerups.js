import * as THREE from 'three';
import { POWERUPS, LANES, PLAYER, TRACK } from './config.js';
import { loadGLTF } from './assets.js';
import { laneToX } from './lanes.js';

// Power-ups: four pickups floating over the street, about one every 400 m
// (models from tools/build-powerups.mjs).
//   magnet – Mercury's purse: coins within three lanes fly to the runner
//   double – Fortuna's favour: silver coins count double
//   aegis  – Aegis of Minerva: survives the next crash that would end the run
//   wings  – Wings of Pegasus: higher, longer jumps
// The pickups are laid with each chunk, after its obstacles and coins, in a
// lane kept free of both. A small pool of each model is reused.
// createEffects() keeps track of what is working and for how long.

export const TYPES = ['magnet', 'double', 'aegis', 'wings'];
const L = TRACK.chunkLength;
const between = ([a, b]) => a + Math.random() * (b - a);

export async function loadPowerups(envMap) {
  const gltf = await loadGLTF(POWERUPS.file);
  const models = {};
  for (const type of TYPES) {
    const model = gltf.scene.getObjectByName(POWERUPS[type].model);
    if (!model) throw new Error(`powerups.glb has no "${POWERUPS[type].model}"`);
    model.traverse((o) => {
      if (o.isMesh && o.material.metalness > 0.3) o.material.envMap = envMap; // the gold shows what it reflects
    });
    models[type] = model;
  }
  return models;
}

function pickType() {
  const entries = Object.entries(POWERUPS.weights);
  let r = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
  return (entries.find(([, w]) => (r -= w) < 0) ?? entries[0])[0];
}

// world: the track's turning group; frameAt(d): the path's frame there;
// obstacles, coins: to keep the pickups clear of them.
export function createPowerups(world, models, frameAt, obstacles, coins) {
  // two of each model, reused as the street moves on
  const pool = TYPES.flatMap((type) =>
    [0, 1].map(() => {
      const object = models[type].clone();
      object.scale.setScalar(POWERUPS.scale);
      object.visible = false;
      object.matrixAutoUpdate = false;
      world.add(object);
      return { type, object, active: false };
    }),
  );
  let items = []; // { type, x, d, floor, slot, item (pool entry), base, phase }
  let nextAt = POWERUPS.firstAt;
  const box = new THREE.Box3();
  const frame = new THREE.Matrix4(), offset = new THREE.Matrix4(), spin = new THREE.Matrix4();

  function free(item) {
    item.entry.active = false;
    item.entry.object.visible = false;
  }

  // Is this spot clear: no obstacle in its lane for clearAround metres either
  // side, no coin within coinClear metres?
  function clearSpot(x, d, floor, near) {
    box.min.set(x - PLAYER.size.x / 2, floor, -d - POWERUPS.clearAround);
    box.max.set(x + PLAYER.size.x / 2, floor + PLAYER.size.y, -d + POWERUPS.clearAround);
    if (near.some((o) => o.hitbox.intersectsBox(box))) return false;
    return !(coins?.list() ?? []).some((c) => Math.abs(c.d - d) < POWERUPS.coinClear && Math.abs(c.x - x) < LANES.width / 2);
  }

  return {
    reset() {
      for (const item of items) free(item);
      items = [];
      nextAt = POWERUPS.firstAt;
    },

    // Lays a pickup in this chunk if one is due (ctx as for the coins).
    fill(slot, chunk, { empty = false, clear = [], floorAt = () => 0, lanesAt = () => LANES.count, allowAt = () => true } = {}) {
      this.release(slot);
      if (empty) return;
      const start = chunk.distance, end = start + L;
      if (nextAt >= end) return;
      const near = obstacles.list().filter((o) => o.distance > start - 8 && o.distance < end + 8);
      for (let d = Math.max(nextAt, start + 2); d < end - 2; d += 1.5) {
        if (!allowAt(d) || clear.some(([a, b]) => d > a && d < b)) continue;
        const count = lanesAt(d), lanes = [...Array(count).keys()].sort(() => Math.random() - 0.5);
        for (const lane of lanes) {
          const x = laneToX(lane, count), floor = floorAt(d, x);
          if (!clearSpot(x, d, floor, near)) continue;
          const type = pickType(), entry = pool.find((e) => e.type === type && !e.active);
          if (!entry) continue;
          entry.active = true;
          entry.object.visible = true;
          items.push({ type, x, d, floor, slot, entry, phase: Math.random() * Math.PI * 2, base: frameAt(d, new THREE.Matrix4()).multiply(offset.makeTranslation(x, floor + POWERUPS.height, 0)) });
          nextAt = d + between(POWERUPS.spacing);
          return;
        }
      }
      // No room here: try in the next chunk.
      nextAt = Math.max(nextAt, end);
    },

    release(slot) {
      items = items.filter((item) => {
        if (item.slot !== slot) return true;
        free(item);
        return false;
      });
    },

    // Each frame: spins and bobs them, and returns the type picked up (or null).
    update(dt, time, player) {
      const pd = -player.object.position.z, px = player.object.position.x;
      const lowY = player.hitbox.min.y, highY = player.hitbox.max.y;
      let picked = null;
      items = items.filter((item) => {
        const ahead = item.d - pd, y = item.floor + POWERUPS.height;
        if (Math.abs(ahead) < 2) {
          const dy = Math.max(0, lowY - y, y - highY);
          if (Math.hypot(item.x - px, ahead, dy) < POWERUPS.pickupRadius) {
            picked = item.type;
            free(item);
            return false;
          }
        }
        const o = item.entry.object;
        o.visible = ahead > -3 && ahead < POWERUPS.drawDistance;
        if (o.visible) {
          o.matrix.copy(item.base)
            .multiply(offset.makeTranslation(0, POWERUPS.bobHeight * Math.sin(time * POWERUPS.bobSpeed + item.phase), 0))
            .multiply(spin.makeRotationY(time * POWERUPS.spinSpeed + item.phase))
            .multiply(frame.makeScale(POWERUPS.scale, POWERUPS.scale, POWERUPS.scale));
          o.matrixWorldNeedsUpdate = true;
        }
        return true;
      });
      return picked;
    },

    // The pickups laid and not yet taken (tests and tools).
    list() {
      return items.map(({ type, x, d }) => ({ type, x, d }));
    },
  };
}

// What is working now. Timed ones count down; the aegis waits for a crash.
export function createEffects() {
  const left = { magnet: 0, double: 0, wings: 0 };
  let aegis = false;
  let grace = 0; // seconds after the aegis shattered when nothing hits him
  return {
    reset() {
      for (const type of Object.keys(left)) left[type] = 0;
      aegis = false;
      grace = 0;
    },
    // A pickup taken: starts (or restarts) its effect.
    activate(type) {
      if (type === 'aegis') aegis = true;
      else left[type] = POWERUPS[type].duration;
    },
    tick(dt) {
      for (const type of Object.keys(left)) left[type] = Math.max(0, left[type] - dt);
      grace = Math.max(0, grace - dt);
    },
    isOn: (type) => (type === 'aegis' ? aegis : left[type] > 0),
    // A crash that would end the run: true if the aegis takes it instead.
    absorbCrash() {
      if (!aegis) return false;
      aegis = false;
      grace = POWERUPS.aegis.grace;
      return true;
    },
    get inGrace() {
      return grace > 0;
    },
    // For the HUD: [{ type, fraction }], fraction 1 → 0 as it runs out (the aegis stays full).
    list() {
      const out = Object.entries(left).filter(([, t]) => t > 0).map(([type, t]) => ({ type, fraction: t / POWERUPS[type].duration }));
      if (aegis) out.push({ type: 'aegis', fraction: 1 });
      return out;
    },
  };
}
