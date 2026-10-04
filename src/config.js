// All tunable numbers live here. Tweak values in this file rather than in game code.

export const RENDERER = {
  maxPixelRatio: 2,
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
  far: 600, // just beyond the sky dome
  // Position relative to the player: behind (+z) and above (+y).
  offset: { x: 0, y: 3.2, z: 5.2 },
  // The point the camera looks at, relative to the player (ahead = -z).
  lookAhead: { x: 0, y: 1, z: -6 },
  // How closely the camera follows the player sideways (0–1).
  // 1 = locked to the player, lower = camera lags behind lane changes a bit.
  sideFollow: 0.6,
};

export const LIGHTS = {
  sun: {
    // Offset from the player; the sun travels with the player so shadows never run out.
    offset: { x: 10, y: 20, z: 10 },
    shadowMapSize: 2048,
    shadowArea: 30, // half-width of the shadow camera frustum
    // Small offsets that stop surfaces shadowing themselves in stripes
    // ("shadow acne") and light leaking at corners.
    shadowBias: -0.0005,
    shadowNormalBias: 0.03,
  },
  // Light from the surge behind the player (phase 3): lights his back and
  // the sides of the buildings orange, without casting shadows.
  glow: { color: 0xff5a1f, offset: { x: -4, y: 6, z: 30 } },
};

// The three phases of the eruption, driven by time since the run started.
// Each phase sets the mood and difficulty; when the next phase begins,
// every value blends into it over transitionTime seconds.
//   fogDensity: higher = thicker. Things are nearly hidden at about
//     2 / fogDensity metres (0.011 → 180 m, 0.03 → 65 m). The fog colour is
//     the sky's horizon colour, so the town fades into the sky.
//   ashRate: share of ASH.maxParticles falling (0–1).
//   tileRate: average falling roof tiles per second.
//   speedMultiplier: multiplies the run speed. Obstacle rows are spaced for
//     the highest multiplier, so every pattern stays passable.
export const PHASES = {
  transitionTime: 5,
  list: [
    {
      name: 'Pumice fall',
      start: 0,
      skyTop: 0x7d93a8,
      skyHorizon: 0xd2bf9f, // yellow-grey haze under the eruption cloud
      fogDensity: 0.0115,
      sunColor: 0xffe2b5,
      sunIntensity: 1.6,
      hemiSky: 0xc4d2e0,
      hemiGround: 0x8a7a62,
      hemiIntensity: 1.0,
      glowIntensity: 0,
      distantHaze: 0.35, // how much Vesuvius fades into the horizon colour
      ashRate: 0.3,
      ashColor: 0xd9d3c7,
      speedMultiplier: 1,
      tileRate: 0.25, // falling roof tiles per second (see TILES)
      surgeVisibility: 0, // the glowing surge cloud behind the player (see SURGE)
    },
    {
      name: 'Ash & darkness',
      start: 60,
      skyTop: 0x2c2723,
      skyHorizon: 0x6b5b4b,
      fogDensity: 0.021,
      sunColor: 0xd99a5c,
      sunIntensity: 0.55,
      hemiSky: 0x8a7f72,
      hemiGround: 0x4a4038,
      hemiIntensity: 0.7,
      glowIntensity: 0,
      distantHaze: 0.7,
      ashRate: 1,
      ashColor: 0x8c857c,
      speedMultiplier: 1.07,
      tileRate: 0.5, // falling roof tiles per second (see TILES)
      surgeVisibility: 0, // the glowing surge cloud behind the player (see SURGE)
    },
    {
      name: 'Surge',
      start: 150,
      skyTop: 0x16100d,
      skyHorizon: 0x3e2a20,
      fogDensity: 0.031,
      sunColor: 0xb8693a,
      sunIntensity: 0.25,
      hemiSky: 0x5a4a40,
      hemiGround: 0x6e2c14, // red light bouncing up from the ground
      hemiIntensity: 0.6,
      glowIntensity: 1.8,
      distantHaze: 0.85,
      ashRate: 1,
      ashColor: 0x6e5146,
      speedMultiplier: 1.15,
      tileRate: 0.85, // falling roof tiles per second (see TILES)
      surgeVisibility: 1, // the glowing surge cloud behind the player (see SURGE)
    },
  ],
};

// Falling ash: tiny flakes in a box that travels with the camera. The GPU
// moves them (see ash.js), so they cost no JavaScript time per frame.
export const ASH = {
  maxParticles: 3000,
  box: { x: 30, y: 18, z: 50 }, // size of the box of flakes around the camera
  boxOffset: { x: 0, y: 3, z: -16 }, // box centre relative to the camera (mostly ahead)
  fallSpeed: 2.2, // metres per second
  drift: 0.8, // sideways swaying (metres)
  size: 0.11, // flake size (metres)
  nearFade: 2.5, // flakes closer to the camera than this fade out (no blobs on the lens)
  opacity: 0.85,
};

// The pyroclastic surge: a glowing cloud of hot ash and gas chasing the
// player. It sits far behind while you run cleanly; a stumble lets it
// close in, and a second stumble soon after means it catches you.
export const SURGE = {
  farGap: 32, // metres behind the player while running cleanly (out of view)
  stumbleGap: 6, // how close it gets after a stumble (its edges reach into view)
  recoverTime: 6, // seconds of clean running for it to drop back to farGap
  catchWindow: 6, // a second stumble within this many seconds = caught
  caughtDuration: 1.6, // seconds of the cloud rolling over before the game-over screen
  puffs: 46, // billowing puffs making up the cloud (one instanced mesh)
  smokeColor: 0x6f6863,
  glowColor: 0xff6a2a,
  edgeGlowMax: 0.6, // strongest orange glow at the screen edges (0–1)
};

// Clipping the side of an obstacle (changing lane into it, including
// catching its front corner) makes the player stumble instead of ending the
// run. Running into its front, landing on it or standing up into it still ends it.
export const STUMBLE = {
  grace: 0.4, // seconds after a stumble during which obstacles can't hit again
  slowdown: 0.85, // speed multiplier while stumbling
  duration: 0.6, // seconds the stumble slows the player and shows in his pose
  cameraShake: 0.18, // metres
};

// Roof tiles shaken loose by the earthquakes and the weight of pumice.
// A shadow warns where one will land; the tile drops and shatters.
export const TILES = {
  warningTime: 1.0, // seconds the shadow shows before the tile lands
  fallTime: 0.45, // the tile is visible falling for the last part of the warning
  dropHeight: 14, // metres above the road where the falling tile appears
  size: { x: 0.7, y: 0.14, z: 0.9 }, // one terracotta roof tile (tegula)
  hitboxMargin: 0.1,
  // Tiles never land closer than this (in seconds of running) to an
  // obstacle row or to another tile, so all lanes are open around a tile
  // and there is time to dodge it and still reach the next row's way through.
  clearanceTime: 0.3,
  targetPlayerChance: 0.65, // chance a tile aims at the player's lane (else a random lane)
  maxTiles: 6, // most tiles in flight or in pieces at once
  shadowRadius: 0.75,
  shadowDarkness: 0.25, // 1 = no shadow, 0 = black
  pieces: 5, // fragments per broken tile
  pieceLifetime: 1.6, // seconds before fragments sink away
};

export const DEBUG = {
  // P jumps to the next eruption phase. Set to false before release.
  phaseKey: true,
};

export const SKY = {
  radius: 450, // the sky dome follows the camera at this distance
};

// Vesuvius on the horizon. The town's harbour lies west and the volcano to
// the north, so while fleeing it sits ahead and to the right. It is placed
// just right of the street's vanishing point so the camera (even on an
// upright phone) sees it in the gap of sky above the street.
export const VESUVIUS = {
  angle: 9, // degrees right of straight ahead
  distance: 420,
  height: 40,
  baseRadius: 130,
  // The eruption column and its "umbrella pine" cloud (Pliny's words).
  // Far shorter than the real 30 km, so it fits on screen.
  plumeHeight: 85,
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
