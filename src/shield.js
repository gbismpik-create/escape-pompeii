import { SHIELD } from './config.js';

// The scutum raised overhead: a small state machine.
//   ready    → a tap (or E) raises it
//   raised   → lowers itself after SHIELD.duration, or on another tap
//   cooldown → SHIELD.cooldown seconds, then ready again
// While raised he runs slower and can't jump (player.js asks isRaised).
export function createShield() {
  let state, timeLeft, speedFactor;

  function reset() {
    state = 'ready';
    timeLeft = 0;
    speedFactor = 1;
  }
  reset();

  function lower() {
    if (state !== 'raised') return;
    state = 'cooldown';
    timeLeft = SHIELD.cooldown;
  }

  return {
    reset,
    lower,

    // Tap / E: raise when ready, lower early when raised.
    // canRaise is false while sliding (the slide pose uses the same arm).
    toggle(canRaise) {
      if (state === 'raised') lower();
      else if (state === 'ready' && canRaise) {
        state = 'raised';
        timeLeft = SHIELD.duration;
      }
    },

    update(dt) {
      timeLeft = Math.max(0, timeLeft - dt);
      if (state === 'raised' && timeLeft === 0) lower();
      else if (state === 'cooldown' && timeLeft === 0) state = 'ready';
      // Ease the speed change so slowing down doesn't jolt.
      const target = state === 'raised' ? SHIELD.speedMultiplier : 1;
      speedFactor += (target - speedFactor) * (1 - Math.exp(-dt / SHIELD.speedEase));
    },

    get isRaised() {
      return state === 'raised';
    },
    get state() {
      return state;
    },
    // How much of the current state is left, 1 → 0 (for the HUD ring).
    get remaining() {
      if (state === 'raised') return timeLeft / SHIELD.duration;
      if (state === 'cooldown') return timeLeft / SHIELD.cooldown;
      return 1;
    },
    // Multiplies the run speed: eases to SHIELD.speedMultiplier while raised.
    get speedFactor() {
      return speedFactor;
    },
  };
}
