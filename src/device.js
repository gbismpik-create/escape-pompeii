import { GRAPHICS } from './config.js';

// Is this a phone, tablet or very weak computer? Those get lighter graphics:
// the low-poly legionary, cheaper (Lambert) materials and fewer detailed
// street chunks. GRAPHICS.quality can force 'high' or 'low' for testing.
let lowEnd = null;

export function isLowEnd() {
  if (lowEnd === null) {
    if (GRAPHICS.quality !== 'auto') {
      lowEnd = GRAPHICS.quality === 'low';
    } else {
      const touch = window.matchMedia?.('(pointer: coarse)').matches;
      const weak = (navigator.hardwareConcurrency ?? 8) <= 2 || (navigator.deviceMemory ?? 8) <= 2; // deviceMemory: Chrome only
      lowEnd = Boolean(touch || weak);
    }
  }
  return lowEnd;
}
