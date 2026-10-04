import { LANES } from './config.js';

// Lane index runs 0..count-1; the middle lane sits at x = 0.
export function laneToX(lane) {
  return (lane - (LANES.count - 1) / 2) * LANES.width;
}
