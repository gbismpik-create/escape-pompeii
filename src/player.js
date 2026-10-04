import * as THREE from 'three';
import { LANES, PLAYER, STUMBLE } from './config.js';
import { laneToX } from './lanes.js';
import { speedAt } from './speed.js';
import { createShield } from './shield.js';

// model: the loaded character (character.js) or the built-in legionary;
// both have root, update(), stumble() and reset().
// shield: shield.js; while it is raised he can't jump and runs slower, and
// sliding lowers it.
export function createPlayer(scene, model, shield = createShield()) {
  const size = PLAYER.size;
  const legionary = model;
  // The model's root sits at his feet; moving it moves the whole model.
  const object = legionary.root;
  scene.add(object);

  // The box the obstacles are tested against. It doesn't follow every arm
  // and leg: it's a fixed box the model fits inside, shorter while sliding.
  const hitbox = new THREE.Box3();
  // Where the hitbox was last frame, to tell which way a collision came from.
  const previousHitbox = new THREE.Box3();

  let lane, feetY, velocityY, slideTimeLeft, slideOnLanding;
  let stumbleTimeLeft = 0;

  function reset() {
    lane = Math.floor(LANES.count / 2);
    feetY = 0; // height of the player's feet above the ground
    velocityY = 0;
    slideTimeLeft = 0;
    slideOnLanding = false; // set by a fast drop, so the player rolls into a slide
    stumbleTimeLeft = 0;
    shield.reset();
    object.position.set(laneToX(lane), 0, 0);
    legionary.reset();
  }
  reset();

  const isGrounded = () => feetY <= 0;

  return {
    object,
    hitbox,
    previousHitbox,
    reset,

    // Game over: put him back on his feet on the road and let him idle.
    settle() {
      object.position.y = 0;
      legionary.idle?.(); // the built-in legionary has no idle animation
    },

    // Keeps his animation going after the game has stopped.
    tick(dt) {
      legionary.tick?.(dt);
    },

    get isGrounded() {
      return isGrounded();
    },

    get isSliding() {
      return slideTimeLeft > 0;
    },

    // True just after a stumble: obstacles can't hit again for a moment.
    get inStumbleGrace() {
      return stumbleTimeLeft > STUMBLE.duration - STUMBLE.grace;
    },

    // Clipped the side of an obstacle centred at obstacleX: bounce back to
    // the lane on the player's side of it, slow down for a moment.
    stumble(obstacleX) {
      const obstacleLane = Math.round(obstacleX / LANES.width + (LANES.count - 1) / 2);
      const side = object.position.x < obstacleX ? -1 : 1;
      lane = THREE.MathUtils.clamp(obstacleLane + side, 0, LANES.count - 1);
      stumbleTimeLeft = STUMBLE.duration;
      legionary.stumble();
    },

    handleAction(action) {
      if (action === 'left') lane = Math.max(0, lane - 1);
      if (action === 'right') lane = Math.min(LANES.count - 1, lane + 1);

      if (action === 'shield') shield.toggle(slideTimeLeft <= 0 && !slideOnLanding);

      if (action === 'jump' && isGrounded() && !shield.isRaised) {
        // Starting speed needed to reach jumpHeight under gravity: v = √(2·g·h)
        velocityY = Math.sqrt(2 * PLAYER.gravity * PLAYER.jumpHeight);
        slideTimeLeft = 0; // jumping cancels a slide
      }

      if (action === 'down') {
        shield.lower(); // the slide needs the shield arm
        if (isGrounded()) {
          slideTimeLeft = PLAYER.slideDuration;
        } else {
          velocityY = Math.min(velocityY, -PLAYER.fastFallSpeed);
          slideOnLanding = true;
        }
      }
    },

    // speedMultiplier comes from the current eruption phase.
    update(dt, speedMultiplier = 1) {
      // Forward is -z in Three.js when the camera looks down the track.
      stumbleTimeLeft = Math.max(0, stumbleTimeLeft - dt);
      const stumbleSlow = stumbleTimeLeft > 0 ? STUMBLE.slowdown : 1;
      shield.update(dt);
      const moved = speedAt(-object.position.z) * speedMultiplier * stumbleSlow * shield.speedFactor * dt;
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
        shieldRaised: shield.isRaised,
      });

      const p = object.position;
      previousHitbox.copy(hitbox);
      hitbox.min.set(p.x - size.x / 2, feetY, p.z - size.z / 2);
      hitbox.max.set(p.x + size.x / 2, feetY + height, p.z + size.z / 2);
    },
  };
}
