import * as THREE from 'three';
import { LANES, PLAYER } from './config.js';
import { laneToX } from './lanes.js';
import { speedAt } from './speed.js';
import { createLegionary } from './legionary.js';

export function createPlayer(scene) {
  const size = PLAYER.size;
  const legionary = createLegionary();
  // The legionary's root sits at his feet; moving it moves the whole model.
  const object = legionary.root;
  scene.add(object);

  // The box the obstacles are tested against. It doesn't follow every arm
  // and leg: it's a fixed box the model fits inside, shorter while sliding.
  const hitbox = new THREE.Box3();

  let lane, feetY, velocityY, slideTimeLeft, slideOnLanding;

  function reset() {
    lane = Math.floor(LANES.count / 2);
    feetY = 0; // height of the player's feet above the ground
    velocityY = 0;
    slideTimeLeft = 0;
    slideOnLanding = false; // set by a fast drop, so the player rolls into a slide
    object.position.set(laneToX(lane), 0, 0);
    legionary.reset();
  }
  reset();

  const isGrounded = () => feetY <= 0;

  return {
    object,
    hitbox,
    reset,

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
      const moved = speedAt(-object.position.z) * dt;
      object.position.z -= moved;

      // Ease towards the target lane. Using 1 - exp(-k·dt) keeps the motion
      // identical whatever the frame rate.
      const t = 1 - Math.exp(-PLAYER.laneChangeSharpness * dt);
      const previousX = object.position.x;
      object.position.x += (laneToX(lane) - object.position.x) * t;

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

      // Slide: the hitbox shrinks for a short time.
      slideTimeLeft = Math.max(0, slideTimeLeft - dt);
      const sliding = slideTimeLeft > 0;
      const height = sliding ? PLAYER.slideHeight : size.y;
      object.position.y = feetY;

      legionary.update(dt, {
        moved,
        grounded: isGrounded(),
        sliding,
        sideSpeed: dt > 0 ? (object.position.x - previousX) / dt : 0,
      });

      const p = object.position;
      hitbox.min.set(p.x - size.x / 2, feetY, p.z - size.z / 2);
      hitbox.max.set(p.x + size.x / 2, feetY + height, p.z + size.z / 2);
    },
  };
}
