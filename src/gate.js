import * as THREE from 'three';
import { FINALE } from './config.js';

// Porta Stabia's arch giving way (the finale): a great tufa lintel up in the
// crown of the passage shakes and sheds dust, then drops to just above a
// sliding runner, timed to be down a moment before he gets there. Lying
// across the passage it is a slide obstacle.
//
// Like the obstacles, it is drawn in the path's frame (frameAt) and tested
// in path space (x across, y up, z = -metres along).

const C = FINALE.collapse;
const TURN = new THREE.Matrix4().makeRotationY(Math.PI); // kit pieces run along +z; the game to -z

// frameAt(s): the path's frame; floorAt(s, x): the floor height there.
export function createGateCollapse(world, kit, frameAt, floorAt) {
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  group.visible = false;
  for (const { geometry, material } of kit.near.Gate_Collapse) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  world.add(group);

  // 'idle' (not on the path) | 'waiting' | 'warning' | 'falling' | 'down'
  let state = 'idle';
  let distance = 0;
  let floor = 0;
  let time = 0;
  let dustTime = 0;
  const hitbox = new THREE.Box3();
  const m = new THREE.Matrix4();
  const tilt = new THREE.Matrix4();

  // drop: metres above where it ends up; wobble: its sway (radians).
  function pose(drop, wobble = 0) {
    tilt.makeRotationZ(wobble);
    group.matrix.copy(frameAt(distance)).multiply(m.makeTranslation(0, floor + C.height + drop, 0)).multiply(TURN).multiply(tilt);
    group.matrixWorldNeedsUpdate = true;
  }

  return {
    // The gate is laid: the arch comes down `at` metres along the path.
    place(at) {
      distance = at;
      floor = floorAt(at, 0);
      state = 'waiting';
      group.visible = true;
      pose(C.dropFrom);
      hitbox.min.set(-C.halfWidth, floor + C.height - 0.05, -at - C.halfDepth);
      hitbox.max.set(C.halfWidth, floor + C.height + 1.6, -at + C.halfDepth);
    },

    hide() {
      state = 'idle';
      group.visible = false;
    },

    // playerDistance: metres along the path; speed: his m/s. Callbacks get
    // a point in path space: onDust while it shakes, onLand when it comes down.
    update(dt, playerDistance, speed, { onDust, onLand } = {}) {
      if (state === 'idle') return;
      if (playerDistance > distance + 40) return this.hide();
      const point = { x: 0, y: floor + C.height, z: -distance };
      if (state === 'waiting') {
        const timeLeft = (distance - playerDistance) / Math.max(1, speed);
        if (timeLeft <= C.warningTime + C.fallTime + C.doneBefore) {
          state = 'warning';
          time = 0;
        }
        return;
      }
      time += dt;
      if (state === 'warning') {
        pose(C.dropFrom - 0.06 * time, Math.sin(time * 40) * C.wobble);
        dustTime -= dt;
        if (dustTime <= 0) {
          dustTime = 0.15;
          onDust?.({ ...point, y: point.y + C.dropFrom });
        }
        if (time >= C.warningTime) {
          state = 'falling';
          time = 0;
        }
      } else if (state === 'falling') {
        const k = Math.min(1, time / C.fallTime);
        pose((C.dropFrom - 0.06 * C.warningTime) * (1 - k * k), 0.05 * k);
        if (k >= 1) {
          state = 'down';
          pose(0, 0.05);
          onLand?.(point);
        }
      }
    },

    // The fallen lintel, if the player's hitbox (path space) touches it.
    findCollision(box) {
      return state === 'down' && hitbox.intersectsBox(box) ? { type: 'GateCollapse', move: 'slide', hitbox } : null;
    },

    // For tests and tools: the lintel's row, once it is coming down.
    list() {
      return state === 'idle' ? [] : [{ type: 'GateCollapse', move: 'slide', hitbox, distance }];
    },
  };
}
