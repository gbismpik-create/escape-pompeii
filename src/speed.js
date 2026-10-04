import { PLAYER, PHASES } from './config.js';

// The fastest any phase makes the player run, relative to speedAt().
export const MAX_SPEED_MULTIPLIER = Math.max(...PHASES.list.map((phase) => phase.speedMultiplier));

// Base forward speed at a given distance into the run (before the
// eruption phase's speed multiplier).
// Speed grows steadily over time: v = start + acceleration · t. Written in
// terms of distance instead, that becomes v = √(start² + 2 · acceleration · distance).
// Using distance lets the track work out how fast the player will be going
// when they reach a row it is placing far ahead.
export function speedAt(distance) {
  const { startSpeed, maxSpeed, acceleration } = PLAYER;
  return Math.min(maxSpeed, Math.sqrt(startSpeed ** 2 + 2 * acceleration * Math.max(0, distance)));
}
