import * as THREE from 'three';
import { CROWDS } from './config.js';

// People fleeing across the Forum: small groups run from one side of the
// square to the other, timed to cross the lanes about when the runner gets
// there. Bumping into someone makes him stumble (main.js); no one is hurt.
//
// Each person is four kit pieces: a body (tinted a different colour per
// person), a head, two legs and two arms. One InstancedMesh per piece holds
// everyone, so the whole crowd costs four draw calls; the limbs swing by
// rewriting their instance matrices each frame.
//
// People move in scene space on the runner's current street (z = -distance
// along the path); a turn clears them (there are no junctions in the Forum).

const MAX_PEOPLE = 16;
const between = ([a, b]) => a + Math.random() * (b - a);

export function createCrowds(scene, kit) {
  const meshes = {};
  const parts = { body: ['Person_Body', 1], head: ['Person_Head', 1], leg: ['Person_Leg', 2], arm: ['Person_Arm', 2] };
  for (const [key, [piece, perPerson]] of Object.entries(parts)) {
    const [part] = kit.near[piece];
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, MAX_PEOPLE * perPerson);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.frustumCulled = false; // people move all over the square
    scene.add(mesh);
    meshes[key] = mesh;
  }
  const colors = CROWDS.tunicColors.map((c) => new THREE.Color(c));
  meshes.body.setColorAt(0, colors[0]); // creates the instance colour buffer

  const people = Array.from({ length: MAX_PEOPLE }, () => ({
    active: false, x: 0, z: 0, dir: 1, phase: 0, speed: CROWDS.speed, color: 0, hit: false,
  }));
  let untilNext = 0; // seconds of running until the next group may set off

  const m = new THREE.Matrix4();
  const limb = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const box = new THREE.Box3();

  function spawnGroup(crossingZ) {
    const size = Math.round(between(CROWDS.groupSize));
    const dir = Math.random() < 0.5 ? 1 : -1; // running towards +x or -x
    for (let i = 0; i < size; i++) {
      const p = people.find((q) => !q.active);
      if (!p) return;
      Object.assign(p, {
        active: true,
        dir,
        // one behind another, a little spread along the street
        x: -dir * (CROWDS.startX + i * 1.1 + Math.random() * 0.4),
        z: crossingZ + (Math.random() - 0.5) * 1.4,
        phase: Math.random() * Math.PI * 2,
        speed: CROWDS.speed * (0.9 + Math.random() * 0.2),
        color: Math.floor(Math.random() * colors.length),
        hit: false,
      });
    }
  }

  function draw() {
    let n = 0;
    for (const p of people) {
      if (!p.active) continue;
      const swing = Math.sin(p.phase);
      // Body: facing where they run, leaning forward, bobbing with each step.
      e.set(0.12, (p.dir * Math.PI) / 2, 0);
      q.setFromEuler(e);
      m.compose(v.set(p.x, Math.abs(Math.cos(p.phase)) * 0.05, p.z), q, one);
      meshes.body.setMatrixAt(n, m);
      meshes.body.setColorAt(n, colors[p.color]);
      meshes.head.setMatrixAt(n, m);
      // Legs from the hips and arms from the shoulders, swinging in turn.
      for (const [side, s] of [[0, 1], [1, -1]]) {
        limb.makeRotationX(0.75 * swing * s).setPosition(s * 0.09, 0.92, 0);
        meshes.leg.setMatrixAt(n * 2 + side, limb.premultiply(m));
        limb.makeRotationX(-0.8 * swing * s).setPosition(s * 0.2, 1.4, 0);
        meshes.arm.setMatrixAt(n * 2 + side, limb.premultiply(m));
      }
      n++;
    }
    meshes.body.count = meshes.head.count = n;
    meshes.leg.count = meshes.arm.count = n * 2;
    for (const mesh of Object.values(meshes)) mesh.instanceMatrix.needsUpdate = true;
    meshes.body.instanceColor.needsUpdate = true;
  }

  return {
    reset() {
      for (const p of people) p.active = false;
      untilNext = 0;
      draw();
    },

    // playerDistance: metres along the path; speed: his m/s.
    // forumAt(distance): is that distance in the Forum? hitbox: his box
    // (scene space). onBump(): he ran into someone (once per person).
    update(dt, playerDistance, speed, forumAt, hitbox, onBump) {
      untilNext -= dt;
      const crossing = playerDistance + speed * CROWDS.leadTime;
      if (untilNext <= 0 && forumAt(crossing) && forumAt(playerDistance + 2)) {
        spawnGroup(-crossing);
        untilNext = between(CROWDS.spacing);
      }
      const h = CROWDS.hitbox;
      for (const p of people) {
        if (!p.active) continue;
        p.x += p.dir * p.speed * dt;
        p.phase += CROWDS.stride * Math.PI * dt;
        // Gone off the far side, or left behind the runner.
        if (p.x * p.dir > CROWDS.startX + 4 || p.z > -playerDistance + 10) {
          p.active = false;
          continue;
        }
        if (!p.hit && hitbox) {
          box.min.set(p.x - h.halfWidth, 0, p.z - h.halfDepth);
          box.max.set(p.x + h.halfWidth, h.height, p.z + h.halfDepth);
          if (box.intersectsBox(hitbox)) {
            p.hit = true;
            onBump?.();
          }
        }
      }
      draw();
    },
  };
}
