import { PLAYER } from './config.js';

// Forward speed at a given distance into the run.
// Speed grows steadily over time: v = start + acceleration · t. Written in
// terms of distance instead, that becomes v = √(start² + 2 · acceleration · distance).
// Using distance lets the track work out how fast the player will be going
// when they reach a row it is placing far ahead.
export function speedAt(distance) {
  const { startSpeed, maxSpeed, acceleration } = PLAYER;
  return Math.min(maxSpeed, Math.sqrt(startSpeed ** 2 + 2 * acceleration * Math.max(0, distance)));
}
