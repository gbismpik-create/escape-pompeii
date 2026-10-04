import { LANES } from './config.js';

// Lane index runs 0..count-1; the middle lane sits at x = 0. Most of the
// town has LANES.count lanes; the Forum is wider (DISTRICTS.forumLanes).
export function laneToX(lane, count = LANES.count) {
  return (lane - (count - 1) / 2) * LANES.width;
}

// The lane (0..count-1) nearest to x.
export function xToLane(x, count = LANES.count) {
  return Math.min(count - 1, Math.max(0, Math.round(x / LANES.width + (count - 1) / 2)));
}
