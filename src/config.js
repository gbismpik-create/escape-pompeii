// All tunable numbers live here. Tweak values in this file rather than in game code.

export const RENDERER = {
  maxPixelRatio: 2,
  clearColor: 0x87a0b8,
};

export const LANES = {
  count: 3,
  width: 2.5, // distance between lane centres (world units)
};

export const PLAYER = {
  size: { x: 1, y: 1.8, z: 1 },
  color: 0xe07a2f,
  runSpeed: 12, // units per second, forward
  // How quickly the player slides into a new lane. Higher = snappier.
  // ~12 means the move is mostly done in about 0.25 s.
  laneChangeSharpness: 12,

  jumpHeight: 2.2, // peak height of a jump (units)
  // Game gravity is much stronger than real gravity (9.8) so jumps feel snappy.
  // With jumpHeight 2.2 and gravity 50 a jump lasts about 0.6 s.
  gravity: 50,
  fastFallSpeed: 30, // downward speed when pressing down mid-air (units/s)

  slideDuration: 0.8, // seconds
  slideHeight: 0.8, // player (and hitbox) height while sliding
};

export const INPUT = {
  // A touch must move at least this far (CSS pixels) to count as a swipe,
  // so plain taps don't trigger moves.
  minSwipeDistance: 30,
};

export const CAMERA = {
  fov: 60,
  near: 0.1,
  far: 1000,
  // Position relative to the player: behind (+z) and above (+y).
  offset: { x: 0, y: 4, z: 7 },
  // The point the camera looks at, relative to the player (ahead = -z).
  lookAhead: { x: 0, y: 1, z: -6 },
  // How closely the camera follows the player sideways (0–1).
  // 1 = locked to the player, lower = camera lags behind lane changes a bit.
  sideFollow: 0.6,
};

export const LIGHTS = {
  ambient: { color: 0xffffff, intensity: 0.4 },
  sun: {
    color: 0xffffff,
    intensity: 1.5,
    // Offset from the player; the sun travels with the player so shadows never run out.
    offset: { x: 10, y: 20, z: 10 },
    shadowMapSize: 2048,
    shadowArea: 30, // half-width of the shadow camera frustum
  },
};

export const GROUND = {
  length: 100,
  // Width is LANES.width × this. Keep it odd so grid lines fall on lane edges.
  widthInLanes: 41,
  color: 0x808080,
  lineColor: 0x5a5a5a,
  lineWidthPx: 3, // out of a 64 px tile
  anisotropy: 4,
};
