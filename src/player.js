import * as THREE from 'three';
import { LANES, PLAYER } from './config.js';

// Lane index runs 0..count-1; the middle lane sits at x = 0.
function laneToX(lane) {
  return (lane - (LANES.count - 1) / 2) * LANES.width;
}

export function createPlayer(scene) {
  const size = PLAYER.size;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshStandardMaterial({ color: PLAYER.color }),
  );
  mesh.castShadow = true;
  scene.add(mesh);

  // The box the obstacles will be tested against. It is kept equal to the
  // visible box, so what you see is what can be hit.
  const hitbox = new THREE.Box3();

  let lane = Math.floor(LANES.count / 2);
  let feetY = 0; // height of the player's feet above the ground
  let velocityY = 0;
  let slideTimeLeft = 0;
  let slideOnLanding = false; // set by a fast drop, so the player rolls into a slide

  const isGrounded = () => feetY <= 0;

  return {
    mesh,
    hitbox,

    handleAction(action) {
      if (action === 'left') lane = Math.max(0, lane - 1);
      if (action === 'right') lane = Math.min(LANES.count - 1, lane + 1);

      if (action === 'jump' && isGrounded()) {
        // Starting speed needed to reach jumpHeight under gravity: v = √(2·g·h)
        velocityY = Math.sqrt(2 * PLAYER.gravity * PLAYER.jumpHeight);
        slideTimeLeft = 0; // jumping cancels a slide
      }

      if (action === 'down') {
        if (isGrounded()) {
          slideTimeLeft = PLAYER.slideDuration;
        } else {
          velocityY = Math.min(velocityY, -PLAYER.fastFallSpeed);
          slideOnLanding = true;
        }
      }
    },

    update(dt) {
      // Forward is -z in Three.js when the camera looks down the track.
      mesh.position.z -= PLAYER.runSpeed * dt;

      // Ease towards the target lane. Using 1 - exp(-k·dt) keeps the motion
      // identical whatever the frame rate.
      const t = 1 - Math.exp(-PLAYER.laneChangeSharpness * dt);
      mesh.position.x += (laneToX(lane) - mesh.position.x) * t;

      // Vertical motion: gravity changes velocity, velocity changes height.
      // The ½·g·dt² term makes the arc exact, so jumps reach the same height
      // at any frame rate.
      if (!isGrounded() || velocityY > 0) {
        feetY += velocityY * dt - 0.5 * PLAYER.gravity * dt * dt;
        velocityY -= PLAYER.gravity * dt;
        if (feetY <= 0) {
          feetY = 0;
          velocityY = 0;
          if (slideOnLanding) {
            slideOnLanding = false;
            slideTimeLeft = PLAYER.slideDuration;
          }
        }
      }

      // Slide: squash the box (and so the hitbox) for a short time.
      slideTimeLeft = Math.max(0, slideTimeLeft - dt);
      const height = slideTimeLeft > 0 ? PLAYER.slideHeight : size.y;
      mesh.scale.y = height / size.y;
      mesh.position.y = feetY + height / 2; // box is centred, so lift by half its height

      hitbox.min.set(mesh.position.x - size.x / 2, feetY, mesh.position.z - size.z / 2);
      hitbox.max.set(mesh.position.x + size.x / 2, feetY + height, mesh.position.z + size.z / 2);
    },
  };
}
