import * as THREE from 'three';
import { LANES, PLAYER } from './config.js';

// Lane index runs 0..count-1; the middle lane sits at x = 0.
function laneToX(lane) {
  return (lane - (LANES.count - 1) / 2) * LANES.width;
}

export function createPlayer(scene) {
  const { x, y, z } = PLAYER.size;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(x, y, z),
    new THREE.MeshStandardMaterial({ color: PLAYER.color }),
  );
  mesh.position.y = y / 2; // stand on the ground, not halfway into it
  mesh.castShadow = true;
  scene.add(mesh);

  let lane = Math.floor(LANES.count / 2);

  return {
    mesh,

    handleAction(action) {
      if (action === 'left') lane = Math.max(0, lane - 1);
      if (action === 'right') lane = Math.min(LANES.count - 1, lane + 1);
    },

    update(dt) {
      // Forward is -z in Three.js when the camera looks down the track.
      mesh.position.z -= PLAYER.runSpeed * dt;

      // Ease towards the target lane. Using 1 - exp(-k·dt) keeps the motion
      // identical whatever the frame rate.
      const t = 1 - Math.exp(-PLAYER.laneChangeSharpness * dt);
      mesh.position.x += (laneToX(lane) - mesh.position.x) * t;
    },
  };
}
