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

export const GAME = {
  // After a crash, ignore restart input for this long so a swipe that was
  // already in progress doesn't skip the game-over screen.
  restartDelay: 0.5,
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

export const TRACK = {
  // Length of one street chunk (metres = world units). Keep it a multiple of
  // LANES.width so the ground lines join up seamlessly between chunks.
  chunkLength: 30,
  chunksAhead: 6, // how many chunks exist in front of the player (6 × 30 = 180 m view)
  chunksBehind: 1, // kept behind the player so the camera never sees a gap
  // Street width in lanes. 5 = the 3 running lanes plus one pavement lane each side.
  streetWidthInLanes: 5,
  sideGroundWidth: 40, // plain ground beyond the street on each side, under the buildings
};

export const GROUND = {
  streetColor: 0x808080,
  sideColor: 0x6e6e6e,
  lineColor: 0x5a5a5a,
  lineWidthPx: 3, // out of a 64 px tile
  anisotropy: 4,
};

export const OBSTACLES = {
  // Obstacles come in rows across the 3 lanes, this far apart. 10 m at run
  // speed 12 gives ~0.8 s between rows: enough to switch two lanes.
  // If run speed goes up later, this may need to grow.
  rowSpacing: 10,
  firstRowOffset: 5, // first row's distance from the start of each chunk
  safeStartDistance: 40, // no obstacles in the first metres of a run
  rowChance: 0.75, // chance that a row has any obstacles at all
  emptyLaneChance: 0.4, // chance that a lane in a row is left empty
  weights: { low: 1, bar: 1, block: 1.2 }, // how often each type is picked
  width: 2, // across the lane (lane is 2.5 wide)
  // Hitboxes are this much smaller than the visible box on every side,
  // so near misses feel fair rather than cheap.
  hitboxMargin: 0.1,
  types: {
    // Must jump: lower than the jump, too tall to slide under.
    low: { bottom: 0, height: 0.9, depth: 1, color: 0x5c6a7a },
    // Must slide: bottom above a sliding player, top above the jump's peak.
    bar: { bottom: 1.2, height: 1.4, depth: 0.5, color: 0x7a5c6a },
    // Must change lane: taller than any jump.
    block: { bottom: 0, height: 3, depth: 1.5, color: 0x4a4a4a },
  },
};

export const BUILDINGS = {
  // Variants pick a shade by index (0, 1, 2…). All grey for now.
  colors: [0xa0a0a0, 0x8c8c8c, 0xb4b4b4],
  defaultDepth: 8, // how far a building extends away from the street
};
