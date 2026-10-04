import * as THREE from 'three';
import { PHASES, JOURNEY } from './config.js';

// Turns "seconds since the run started" into the current state of the
// eruption: sky, fog, light, falling ash, and a speed multiplier.
// When a new phase begins, every value blends from the old phase to the
// new one over PHASES.transitionTime seconds, so nothing changes suddenly.

const COLOR_KEYS = ['skyTop', 'skyHorizon', 'sunColor', 'hemiSky', 'hemiGround', 'ashColor'];
const NUMBER_KEYS = [
  'fogDensity', 'sunIntensity', 'hemiIntensity', 'glowIntensity', 'distantHaze', 'ashRate', 'speedMultiplier',
  'surgeVisibility', 'envIntensity', 'rumbleVolume', 'columnScale', 'fireGlow', 'ashWaves', 'fallRate',
];

// The tension-music levels are blended too, as tensionDrone etc.
const TENSION_LAYERS = ['drone', 'heartbeat', 'high'];
const tensionKey = (layer) => `tension${layer[0].toUpperCase()}${layer.slice(1)}`;
NUMBER_KEYS.push(...TENSION_LAYERS.map(tensionKey));

// Convert the hex colours to THREE.Color once, rather than every frame.
const phases = PHASES.list.map((phase) => ({
  ...phase,
  ...Object.fromEntries(COLOR_KEYS.map((k) => [k, new THREE.Color(phase[k])])),
  ...Object.fromEntries(TENSION_LAYERS.map((layer) => [tensionKey(layer), phase.tension[layer]])),
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

// Escape mode: turns progress along the journey (0–1) into a "phase time"
// that updatePhaseState understands. Each phase covers its share of the
// journey (JOURNEY.phaseShares) and, inside it, phase time runs from its
// start to the next phase's start. The last phase runs for as long as the
// one before it.
export function journeyPhaseTime(progress) {
  let from = 0;
  for (let i = 0; i < phases.length; i++) {
    const share = JOURNEY.phaseShares[i];
    const start = phases[i].start;
    const end = i + 1 < phases.length ? phases[i + 1].start : start + (start - phases[i - 1].start);
    if (progress < from + share || i === phases.length - 1) {
      return start + (end - start) * Math.min(1, Math.max(0, (progress - from) / share));
    }
    from += share;
  }
  return 0;
}

// The run time at which the phase after the current one starts; after
// the last phase, wraps back to the first. Used by the debug key.
export function nextPhaseStart(time) {
  const next = phases.find((phase) => phase.start > time);
  return next ? next.start : 0;
}
