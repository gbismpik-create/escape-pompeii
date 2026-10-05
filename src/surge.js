import * as THREE from 'three';
import { SURGE } from './config.js';

// The pyroclastic surge: a rolling wall of glowing grey-orange ash cloud
// behind the player. It is drawn as one InstancedMesh of low-poly puffs
// that slowly swell and turn, so it seems to boil.
//
// Its distance behind the player ("gap") is the game rule made visible:
//   running cleanly → it hangs back at farGap, out of view
//   a stumble        → it lunges in to stumbleGap; its edges enter the view
//   clean running    → it drops back again over recoverTime seconds
//   second stumble within catchWindow → it rolls over the player (caught)

// Fixed pseudo-random numbers, so the cloud has the same shape every run.
let seed = 11;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function createPuffs() {
  const puffs = [];
  // The main wall: fills the street and rises above the roofs.
  for (let i = 0; i < SURGE.puffs - 8; i++) {
    puffs.push({
      position: new THREE.Vector3(random() * 22 - 11, random() * 11, 2 + random() * 16),
      radius: 2.5 + random() * 2.5,
      phase: random() * Math.PI * 2,
      spin: new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5),
      warmth: random(), // how orange this puff glows
    });
  }
  // Leading tongues along the pavements and over the street, reaching
  // forward: these are what the camera sees first when the cloud closes in.
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    const overhead = i >= 6; // two roll over the top of the street
    puffs.push({
      position: new THREE.Vector3(
        overhead ? side * 1.5 : side * (3.8 + random() * 1.5),
        overhead ? 6.5 : 1.5 + random() * 4,
        -5 - random() * 6,
      ),
      radius: 1.8 + random() * 1.4,
      phase: random() * Math.PI * 2,
      spin: new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5),
      warmth: 0.6 + random() * 0.4,
    });
  }
  return puffs;
}

export function createSurge(scene) {
  const puffs = createPuffs();
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  // Lit by the scene like everything else, plus its own orange glow
  // (emissive) that is strongest during the surge phase.
  const material = new THREE.MeshLambertMaterial({
    flatShading: true,
    fog: false,
    side: THREE.DoubleSide, // still visible from inside when it engulfs the camera
  });
  const mesh = new THREE.InstancedMesh(geometry, material, puffs.length);
  mesh.name = 'surge';
  mesh.frustumCulled = false;
  mesh.visible = false; // until update() has placed the puffs
  const smoke = new THREE.Color(SURGE.smokeColor);
  const glow = new THREE.Color(SURGE.glowColor);
  const c = new THREE.Color();
  puffs.forEach((p, i) => mesh.setColorAt(i, c.lerpColors(smoke, glow, p.warmth * 0.2)));
  scene.add(mesh);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();

  let gap = SURGE.farGap;
  let lastStumble = -Infinity;
  let caughtTime = -1; // ≥ 0 while the cloud is rolling over the player
  let time = 0;

  return {
    // 0 = far back, 1 = right behind (used for the screen-edge glow).
    get proximity() {
      return THREE.MathUtils.clamp((SURGE.farGap - gap) / (SURGE.farGap - SURGE.stumbleGap), 0, 1);
    },

    // How far through the "caught" animation we are (0–1), or -1.
    get caughtProgress() {
      return caughtTime < 0 ? -1 : Math.min(1, caughtTime / SURGE.caughtDuration);
    },

    // Call when the player stumbles. Returns true if this means caught.
    stumble(runTime) {
      const caught = runTime - lastStumble < SURGE.catchWindow;
      lastStumble = runTime;
      gap = SURGE.stumbleGap;
      if (caught) caughtTime = 0;
      return caught;
    },

    // The final sprint: keeps the cloud at least this close behind (0 = as
    // usual, 1 = right behind). It never catches him by itself.
    press(k) {
      gap = Math.min(gap, THREE.MathUtils.lerp(SURGE.farGap, SURGE.stumbleGap, k));
    },

    reset() {
      gap = SURGE.farGap;
      lastStumble = -Infinity;
      caughtTime = -1;
    },

    // visibility: from the eruption phase (1 in the surge phase).
    update(dt, playerPosition, visibility) {
      time += dt;
      if (caughtTime >= 0) {
        caughtTime += dt;
        // Roll forward over the player and past the camera.
        gap = THREE.MathUtils.lerp(SURGE.stumbleGap, -12, Math.min(1, caughtTime / SURGE.caughtDuration));
      } else {
        // Drop back steadily while the player runs cleanly.
        gap = Math.min(SURGE.farGap, gap + ((SURGE.farGap - SURGE.stumbleGap) / SURGE.recoverTime) * dt);
      }

      // Outside the surge phase the cloud only shows when it has closed in.
      const shown = Math.max(visibility, this.proximity, caughtTime >= 0 ? 1 : 0);
      mesh.visible = shown > 0.01;
      if (!mesh.visible) return;
      // Glows from within, more when it is close; mostly ash grey.
      material.emissive.copy(glow).multiplyScalar(0.12 + 0.18 * shown);

      const baseZ = playerPosition.z + gap;
      puffs.forEach((p, i) => {
        const swell = 1 + 0.15 * Math.sin(time * 1.3 + p.phase);
        const r = p.radius * swell * (0.4 + 0.6 * shown);
        q.setFromEuler(e.set(p.spin.x * time, p.spin.y * time, p.spin.z * time));
        // Puffs churn forward and back a little, like a rolling front.
        const roll = Math.sin(time * 0.8 + p.phase) * 1.2;
        mesh.setMatrixAt(i, m.compose(v.set(p.position.x, p.position.y, baseZ + p.position.z + roll), q, s.setScalar(r)));
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
