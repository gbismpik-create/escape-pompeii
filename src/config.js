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
  size: { x: 1, y: 1.8, z: 1 }, // the hitbox; the legionary model fits inside it
  startSpeed: 12, // forward speed at the start of a run (units per second)
  maxSpeed: 22, // speed never goes above this
  acceleration: 0.15, // speed gained per second; 0.15 reaches max after ~67 s
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

export const LEGIONARY = {
  colors: {
    skin: 0xc68a64,
    tunic: 0xa3241c, // Roman red
    steel: 0x9aa1a8, // lorica segmentata (banded armour)
    steelDark: 0x6c737a,
    bronze: 0xb08a3e, // helmet trim, buckles
    leather: 0x5a3a22, // belt, sandals, straps
    crest: 0xc4261d,
    hilt: 0xd8c9a3,
  },
  // Distance covered by one full running cycle (two steps). Smaller = faster legs.
  runCycleLength: 4.2,
  strideAngle: 0.8, // how far the legs swing forward/back (radians)
  armSwing: 0.65,
  bodyBob: 0.06, // up-and-down per step (units)
  forwardLean: 0.18, // radians
  poseBlendSpeed: 14, // how quickly he moves between run / jump / slide poses
  maxSideLean: 0.35, // lean into lane changes (radians)
  sideLeanAmount: 0.02, // lean per unit of sideways speed
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
  offset: { x: 0, y: 3.2, z: 5.2 },
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
    // Small offsets that stop surfaces shadowing themselves in stripes
    // ("shadow acne") and light leaking at corners.
    shadowBias: -0.0005,
    shadowNormalBias: 0.03,
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
};

export const STREET = {
  pavementHeight: 0.3, // raised pavements (crepidines) on both sides of the road
  sideGroundWidth: 140, // plain ground under and beyond the buildings
  anisotropy: 4, // keeps the distant paving sharp
};

// Colours of the town. Pompeii's walls were painted plaster, often with a
// dark red band along the bottom; roofs were terracotta tiles.
export const TOWN = {
  plaster: { ochre: 0xd6a04a, terracotta: 0xc0643f, cream: 0xe9dcbc, rose: 0xd98c6c },
  dado: 0x8e2b20, // "Pompeian red" lower band
  roof: 0xa9502f,
  roofDark: 0x7f3a22, // shadowed rows of tiles
  stucco: 0xf1ead8, // white columns, door frames
  columnRed: 0xa3342a, // lower third of columns
  wood: 0x5b3a24,
  interior: 0x2a1d15, // dark doorways and shop openings
  stone: 0xb9b2a4,
  limestone: 0xc9c2b2, // stepping stones
  marble: 0xeeeae2,
  water: 0x6f9fae,
  awning: [0xc9b48a, 0xa64235],
  pavement: 0xb5aa96,
  sideGround: 0x8a7a62,
  road: { stones: [0x5d6064, 0x676a6e, 0x717478, 0x5a5c5f], gaps: 0x393b3d, ruts: 0x2e2f31 },
};

export const OBSTACLES = {
  // Obstacles come in rows across the 3 lanes. Spacing is measured in
  // seconds of running, so rows spread out as speed rises and the player
  // always gets the same reaction time. It must stay longer than a jump
  // (~0.6 s), or a jump could carry the player into the next row.
  rowSpacingTime: 0.8,
  safeStartDistance: 40, // the first row is this far in; nothing before it
  rowChance: 0.75, // chance that a row has any obstacles at all
  emptyLaneChance: 0.4, // chance that a lane in a row is left empty
  weights: { low: 1, bar: 1, block: 1.2 }, // how often each type is picked
  width: 2, // across the lane (lane is 2.5 wide)
  // Hitboxes are this much smaller than the visible box on every side,
  // so near misses feel fair rather than cheap.
  hitboxMargin: 0.1,
  types: {
    // Must jump: Pompeii's stepping stones. Solid to the ground, so no sliding.
    low: { bottom: 0, height: 0.5, depth: 1 },
    // Must slide: a collapsed roof beam. Bottom above a sliding player,
    // top above the jump's peak.
    bar: { bottom: 1.2, height: 1.4, depth: 0.5 },
    // Must change lane: a collapsed wall, taller than any jump.
    block: { bottom: 0, height: 3, depth: 1.5 },
  },
};
