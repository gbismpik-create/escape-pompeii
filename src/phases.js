import * as THREE from 'three';
import { PHASES } from './config.js';

// Turns "seconds since the run started" into the current mood of the
// eruption: sky and light colours, fog distances, and so on.
// When a new phase begins, every value blends from the old phase to the
// new one over PHASES.transitionTime seconds, so nothing changes suddenly.

const COLOR_KEYS = ['skyTop', 'skyHorizon', 'sunColor', 'hemiSky', 'hemiGround'];
const NUMBER_KEYS = ['fogNear', 'fogFar', 'sunIntensity', 'hemiIntensity', 'glowIntensity', 'distantHaze'];

// Convert the hex colours to THREE.Color once, rather than every frame.
const phases = PHASES.list.map((phase) => ({
  ...phase,
  ...Object.fromEntries(COLOR_KEYS.map((k) => [k, new THREE.Color(phase[k])])),
}));

const smoothstep = (x) => x * x * (3 - 2 * x); // eases in and out

// The state object is reused every frame (no new objects while playing).
export function createPhaseState() {
  return {
    index: 0,
    name: phases[0].name,
    ...Object.fromEntries(COLOR_KEYS.map((k) => [k, phases[0][k].clone()])),
    ...Object.fromEntries(NUMBER_KEYS.map((k) => [k, phases[0][k]])),
  };
}

export function updatePhaseState(state, time) {
  let index = 0;
  while (index + 1 < phases.length && time >= phases[index + 1].start) index++;
  const current = phases[index];
  const previous = phases[Math.max(0, index - 1)];
  const blend = index === 0 ? 1 : smoothstep(Math.min(1, (time - current.start) / PHASES.transitionTime));

  state.index = index;
  state.name = current.name;
  for (const k of COLOR_KEYS) state[k].lerpColors(previous[k], current[k], blend);
  for (const k of NUMBER_KEYS) state[k] = previous[k] + (current[k] - previous[k]) * blend;
  return state;
}
