import * as THREE from 'three';
import { THEATRE, LANES, TRACK } from './config.js';

// Path maths, shared by the game (track.js) and the kit builder
// (tools/build-pompeii-kit.mjs), so models built along the path line up
// with where the game runs.
//
// A path runs from a start point with an angle (radians: 0 runs towards -z,
// positive bends left, towards -x). It is made of segments, each a straight
// or an arc of curvature k (1 / radius; + bends left).

export function forward(angle, target = new THREE.Vector3()) {
  return target.set(-Math.sin(angle), 0, -Math.cos(angle));
}

const DIR = new THREE.Vector3();

// Where a segment ({ from, start, angle, k }) is, s metres along the path.
// Returns the path's angle there and writes the point into out.
export function poseOn(seg, s, out) {
  const t = s - seg.from;
  if (!seg.k) {
    out.copy(seg.start).addScaledVector(forward(seg.angle, DIR), t);
    return seg.angle;
  }
  const a = seg.angle + seg.k * t;
  out.set(seg.start.x + (Math.cos(a) - Math.cos(seg.angle)) / seg.k, seg.start.y, seg.start.z - (Math.sin(a) - Math.sin(seg.angle)) / seg.k);
  return a;
}

// Builds segments from bends ({ at, k }, in order, metres from the start),
// starting at `start` with `angle`. Returns a function s → { point, angle }.
export function pathFrom(bends, start = new THREE.Vector3(), angle = 0) {
  const segments = [{ from: 0, start: start.clone(), angle, k: 0 }];
  for (const { at, k } of bends) {
    const p = new THREE.Vector3();
    const a = poseOn(segments[segments.length - 1], at, p);
    segments.push({ from: at, start: p, angle: a, k });
  }
  return (s, out = new THREE.Vector3()) => {
    let i = segments.length - 1;
    while (i > 0 && segments[i].from > s) i--;
    const a = poseOn(segments[i], s, out);
    return { point: out, angle: a };
  };
}

// ---- The route through the Large Theatre (see THEATRE in config.js) ----
// Distances are metres from the start of the vaulted passage. In order:
// the passage, across the stage, a tight left curve up onto the tier band,
// round the tier, a tight right curve into the vomitorium (exit tunnel) and
// out across a small forecourt. The theatre model is built along the same
// route.
let route = null; // worked out once (THEATRE doesn't change during a game)
export function theatreRoute() {
  if (route) return route;
  const T = THEATRE;
  const quarter = (Math.PI / 2) * T.turnRadius; // length of the 90° tight curve onto the tier
  const exitQuarter = (Math.PI / 2) * T.exitRadius; // and of the wider one off it
  const ringLength = T.ringRadius * THREE.MathUtils.degToRad(T.ringAngle);
  const s = {};
  s.passageEnd = T.passage;
  s.stageEnd = T.passage + T.stage; // the tight left curve starts here
  s.ringStart = s.stageEnd + quarter;
  s.ringEnd = s.ringStart + ringLength; // the tight right curve starts here
  s.tunnelStart = s.ringEnd + exitQuarter; // the straight vomitorium
  s.tunnelEnd = s.tunnelStart + T.vomitorium;
  // Then a small forecourt, so the theatre fills whole chunks.
  s.length = Math.ceil(s.tunnelEnd / TRACK.chunkLength) * TRACK.chunkLength;
  const bends = [
    { at: s.stageEnd, k: 1 / T.turnRadius },
    { at: s.ringStart, k: 1 / T.ringRadius },
    { at: s.ringEnd, k: -1 / T.exitRadius },
    { at: s.tunnelStart, k: 0 },
  ];
  route = { ...s, bends, pose: pathFrom(bends) };
  return route;
}

// The floor height of a lane on the theatre route (rel: metres from its
// start; lane 0..2, 0 = left = nearest the orchestra). Flat on the stage
// and in the passage; stairs up onto the tier band, where each lane is a
// step; past the band the steps even out to the middle one's height, and
// the vomitorium slopes down from there to the street.
export function theatreFloor(rel, lane) {
  const r = theatreRoute();
  const T = THEATRE;
  if (rel < r.stageEnd || rel >= r.tunnelEnd) return 0;
  const tier = T.tierHeights[THREE.MathUtils.clamp(lane, 0, LANES.count - 1)];
  if (rel < r.ringEnd) return tier * THREE.MathUtils.clamp((rel - r.stageEnd) / T.rampIn, 0, 1);
  const level = T.tierHeights[1];
  const even = r.ringEnd + T.exitBlend;
  if (rel < even) return THREE.MathUtils.lerp(tier, level, (rel - r.ringEnd) / T.exitBlend);
  return level * (r.tunnelEnd - rel) / (r.tunnelEnd - even);
}
