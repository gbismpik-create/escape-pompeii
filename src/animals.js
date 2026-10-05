import * as THREE from 'three';
import { ANIMALS } from './config.js';

// Frightened farm animals bolting across the road in the finale's fields:
// a flock of sheep, a pair of goats, now and then an ox. Like the Forum's
// crowds (crowds.js), each group sets off as the runner comes, timed to be
// crossing the lanes when he gets there; running into one is a stumble.
//
// One InstancedMesh per body kind and one for every leg, so all of them cost
// four draw calls; the legs swing by rewriting their instance matrices.
// Animals live in scene space on the runner's street (z = -metres along the
// path); the finale has no turns.

const between = ([a, b]) => a + Math.random() * (b - a);
const KINDS = Object.keys(ANIMALS.kinds);
const BODY = { sheep: 'Sheep_Body', goat: 'Goat_Body', ox: 'Ox_Body' };

function pickKind() {
  let r = Math.random() * KINDS.reduce((sum, k) => sum + ANIMALS.kinds[k].weight, 0);
  return KINDS.find((k) => (r -= ANIMALS.kinds[k].weight) < 0) ?? KINDS[0];
}

function instanced(scene, parts, count) {
  const [part] = parts;
  const mesh = new THREE.InstancedMesh(part.geometry, part.material, count);
  mesh.count = 0;
  mesh.castShadow = true;
  mesh.frustumCulled = false; // they move all over the road
  scene.add(mesh);
  return mesh;
}

export function createAnimals(scene, kit) {
  const bodies = Object.fromEntries(KINDS.map((k) => [k, instanced(scene, kit.near[BODY[k]], ANIMALS.max)]));
  const legs = instanced(scene, kit.near.Animal_Leg, ANIMALS.max * 4);
  const legColors = Object.fromEntries(KINDS.map((k) => [k, new THREE.Color(ANIMALS.kinds[k].legColor)]));
  legs.setColorAt(0, legColors.sheep); // creates the instance colour buffer

  const animals = Array.from({ length: ANIMALS.max }, () => ({ active: false, kind: 'sheep', x: 0, z: 0, dir: 1, phase: 0, speed: 1, hit: false }));
  let untilNext = 0; // seconds of running until the next group may set off

  const m = new THREE.Matrix4();
  const limb = new THREE.Matrix4();
  const scale = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const box = new THREE.Box3();

  // A group of one kind sets off towards crossingZ (scene z) from a side of the road.
  function spawnGroup(playerDistance, speed) {
    const kind = pickKind();
    const k = ANIMALS.kinds[kind];
    // Set off so as to be in the middle of the road as the runner gets there.
    const crossing = playerDistance + speed * (ANIMALS.startX / k.speed);
    const dir = Math.random() < 0.5 ? 1 : -1; // running towards +x or -x
    const size = Math.round(between(k.group));
    for (let i = 0; i < size; i++) {
      const a = animals.find((s) => !s.active);
      if (!a) return;
      Object.assign(a, {
        active: true,
        kind,
        dir,
        // bunched together, a little spread along the road
        x: -dir * (ANIMALS.startX + i * 0.9 + Math.random() * 0.6),
        z: -crossing + (Math.random() - 0.5) * (size > 1 ? 2.4 : 0),
        phase: Math.random() * Math.PI * 2,
        speed: k.speed * (0.9 + Math.random() * 0.2),
        hit: false,
      });
    }
  }

  function draw() {
    const n = Object.fromEntries(KINDS.map((k) => [k, 0]));
    let l = 0;
    for (const a of animals) {
      if (!a.active) continue;
      const k = ANIMALS.kinds[a.kind];
      const swing = Math.sin(a.phase);
      // Body: facing where it runs, bounding as it gallops.
      e.set(0.06 * swing, (a.dir * Math.PI) / 2, 0);
      q.setFromEuler(e);
      m.compose(v.set(a.x, Math.abs(Math.cos(a.phase)) * 0.08 * k.hip, a.z), q, one);
      bodies[a.kind].setMatrixAt(n[a.kind]++, m);
      // Four legs, diagonal pairs swinging together (a trot), scaled to the kind.
      const [halfWidth, halfLength] = k.legs;
      scale.makeScale(k.hip, k.hip, k.hip);
      for (const [sx, sz, s] of [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]]) {
        limb.makeRotationX(0.6 * swing * s).multiply(scale).setPosition(sx * halfWidth, k.hip, sz * halfLength);
        legs.setMatrixAt(l, limb.premultiply(m));
        legs.setColorAt(l++, legColors[a.kind]);
      }
    }
    for (const kind of KINDS) {
      bodies[kind].count = n[kind];
      bodies[kind].instanceMatrix.needsUpdate = true;
    }
    legs.count = l;
    legs.instanceMatrix.needsUpdate = true;
    legs.instanceColor.needsUpdate = true;
  }

  return {
    reset() {
      for (const a of animals) a.active = false;
      untilNext = 0;
      draw();
    },

    // playerDistance: metres along the path; speed: his m/s. fieldsAt(d):
    // are the fields there? hitbox: his (scene space); onBump(): he ran into
    // an animal (once per animal).
    update(dt, playerDistance, speed, fieldsAt, hitbox, onBump) {
      untilNext -= dt;
      if (untilNext <= 0 && fieldsAt(playerDistance + speed * 2.5) && fieldsAt(playerDistance + 2)) {
        spawnGroup(playerDistance, speed);
        untilNext = between(ANIMALS.spacing);
      }
      for (const a of animals) {
        if (!a.active) continue;
        const k = ANIMALS.kinds[a.kind];
        a.x += a.dir * a.speed * dt;
        a.phase += k.stride * Math.PI * dt;
        // Off into the vines on the far side, or left behind the runner.
        if (a.x * a.dir > ANIMALS.startX + 4 || a.z > -playerDistance + 10) {
          a.active = false;
          continue;
        }
        if (!a.hit && hitbox) {
          const h = k.hitbox;
          // Turned across the road: its length runs along x.
          box.min.set(a.x - h.halfWidth, 0, a.z - h.halfDepth);
          box.max.set(a.x + h.halfWidth, h.height, a.z + h.halfDepth);
          if (box.intersectsBox(hitbox)) {
            a.hit = true;
            onBump?.();
          }
        }
      }
      draw();
    },

    // The animals on the road, for tests and tools: { kind, x, z, speed, dir }.
    list() {
      return animals.filter((a) => a.active).map(({ kind, x, z, speed, dir }) => ({ kind, x, z, speed, dir, hitbox: ANIMALS.kinds[kind].hitbox }));
    },
  };
}
