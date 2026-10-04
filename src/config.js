// All tunable numbers live here. Tweak values in this file rather than in game code.

export const RENDERER = {
  maxPixelRatio: 2,
};

export const LANES = {
  count: 3,
  width: 1.8, // distance between lane centres (metres): matches the street kit's road
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

// Graphics quality. 'auto' gives phones, tablets and very weak computers the
// lighter settings; 'high' or 'low' forces one (handy for testing).
export const GRAPHICS = {
  quality: 'auto',
  // Street chunks closer than this (metres) use the full-detail kit; further
  // ones use the simplified "far" kit (about a third of the triangles).
  // (Measured from the camera.)
  detailDistance: { high: 50, low: 25 },
  // Furthest the street is drawn (metres). The fog is made at least thick
  // enough to hide everything beyond, so chunks never pop into view.
  viewDistance: { high: 200, low: 140 },
  // Shadows are cast by the simplified street (they look the same on the
  // ground at a fraction of the cost), within this distance of the player.
  shadowDistance: 40,
  // Phones use cheaper Lambert materials instead of MeshStandardMaterial.
  lambertOnLowEnd: true,
};

// The street kit (made with tools/build-pompeii-kit.mjs; npm run build:kit).
// Its street runs along +z from 0 to 30 m; the game runs towards -z, so each
// chunk is built in kit coordinates and turned round 180°.
export const KIT = {
  file: 'assets/pompeii-kit.glb',
  farFile: 'assets/pompeii-kit-far.glb', // simplified, for distant chunks
  layouts: 5, // different street layouts merged at load (each also used mirrored)
  houses: ['House_Red', 'House_Ochre', 'House_White'],
  housesPerSide: 5, // 6 m wide each: 5 fill a 30 m chunk
  houseWidth: 6,
  facadeX: 4.6, // house fronts stand at |x| = 4.6, the pavement's outer edge
  // Props on the pavements (|x| 3.0–4.6), well clear of the lanes.
  props: {
    perSide: [1, 3], // how many per side of a chunk (min, max)
    // name: [distance from the street centre, chance of being picked]
    Column: [3.45, 3],
    Amphora: [3.35, 3],
    Fountain: [3.7, 1],
    Thermopolium: [3.55, 1],
  },
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

// The player's 3D model (glTF files in public/assets, made with tools/).
// Each needs the animations Run, Jump, Slide, Stumble and Idle.
export const CHARACTER = {
  hdModel: 'assets/legionary-hd.glb', // ~70k triangles: desktop
  lowModel: 'assets/legionary.glb', // low-poly: phones and weaker devices
  facing: Math.PI, // the models face +z; the game runs towards -z
  crossFade: 0.12, // seconds to blend between run / jump / slide
  stumbleFade: 0.06, // a quicker blend into the stumble
  idleFade: 0.4, // a slow settle into Idle on the game-over screen
  // Metres covered per Run cycle (two steps). Ties leg speed to run speed.
  runCycleLength: 5.5,
  // The Jump clip starts with a crouch; the player is already airborne, so
  // start this far into the clip (0–1).
  jumpClipStart: 0.2,
  // Extra bone rotations (radians, local x/y/z) added during the Slide clip.
  // As exported, the slide holds the shield upright (top at 1.43 m, above
  // the beams at 1.2 m) and pushes the right foot 0.25 m into the road.
  // These keep him between 0 and 1.16 m. Bones missing from a model are skipped.
  slidePoseFix: { Thigh_R: [-0.5, 0, 0], Shoulder_L: [0.8, 0, 0] },
};

// Sound. Placeholder files live in public/assets/audio/ (replace them with
// real recordings, same names). The rumble and roar loops are .wav: MP3 adds
// a few ms of silence at each end, which leaves a gap every time a plain loop
// repeats. (Music avoids this by overlapping its repeats; see below.)
// The player's own Music and Effects levels (settings panel) scale these.
// "Music" is the tension layers; there is no music in the calm first phase.
export const AUDIO = {
  // A list means variations: one is picked at random each time.
  files: {
    footstep: ['assets/audio/footstep-1.mp3', 'assets/audio/footstep-2.mp3', 'assets/audio/footstep-3.mp3', 'assets/audio/footstep-4.mp3'],
    jump: 'assets/audio/jump.mp3', // whoosh as he leaps
    slide: 'assets/audio/slide.mp3', // scrape along the stones
    impact: 'assets/audio/impact.mp3',
    stumble: 'assets/audio/stumble.mp3',
    rumble: 'assets/audio/rumble.wav', // loops
    roar: 'assets/audio/roar.wav', // loops: the surge cloud, louder as it closes in
    // Tension music (made with tools/compose-tension.py). No tunes: layers
    // that each phase fades in (PHASES tension) as the eruption worsens.
    tensionDrone: 'assets/audio/tension-drone.wav', // loops: low, dark drone
    tensionHigh: 'assets/audio/tension-high.wav', // loops: high, trembling shimmer
    heartbeat: 'assets/audio/heartbeat.wav', // one beat, repeated faster as he speeds up
  },
  // The heartbeat follows the legionary's speed: this many beats per minute
  // at the start speed, rising to the second number at top speed.
  heartbeatBpm: [70, 140],
  volume: { master: 0.8, music: 0.5, effects: 0.8, rumble: 1, roar: 0.9 },
  musicOnGameOver: 0.35, // music drops to this share on the game-over screen
  // One footstep every half run cycle (two steps per cycle), so the steps
  // keep time with the legs at any speed.
  stepsPerRunCycle: 2,
  footstepPitchVariation: 0.08, // each step's pitch varies by up to ±8%
  footstepVolumeVariation: 0.25,
  landingVolume: 1.4, // landing from a jump is a heavier step
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
  far: 260, // the town only; far things are drawn by the backdrop (backdrop.js)
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
//   tension: levels (0–1) of the three tension-music layers.
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
      surgeVisibility: 0, // the glowing surge cloud behind the player (see SURGE)
      envIntensity: 1, // reflections on the legionary's armour (see environment.js)
      rumbleVolume: 0.2, // the earthquake/eruption rumble (see AUDIO)
      columnScale: 0.16, // size of the eruption column (1 = the kit's full 2.7 km)
      fireGlow: 0, // fires on Vesuvius's slopes (0–1)
      tension: { drone: 0, heartbeat: 0, high: 0 }, // music layers (see AUDIO)
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
      distantHaze: 0.5,
      ashRate: 1,
      ashColor: 0x8c857c,
      speedMultiplier: 1.07,
      surgeVisibility: 0, // the glowing surge cloud behind the player (see SURGE)
      envIntensity: 0.45, // reflections on the legionary's armour (see environment.js)
      rumbleVolume: 0.5, // the earthquake/eruption rumble (see AUDIO)
      columnScale: 0.3, // size of the eruption column (1 = the kit's full 2.7 km)
      fireGlow: 0.55, // fires on Vesuvius's slopes (0–1)
      tension: { drone: 0.7, heartbeat: 0.45, high: 0.15 }, // music layers (see AUDIO)
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
      distantHaze: 0.55,
      ashRate: 1,
      ashColor: 0x6e5146,
      speedMultiplier: 1.15,
      surgeVisibility: 1, // the glowing surge cloud behind the player (see SURGE)
      envIntensity: 0.3, // reflections on the legionary's armour (see environment.js)
      rumbleVolume: 0.9, // the earthquake/eruption rumble (see AUDIO)
      columnScale: 0.24, // size of the eruption column (1 = the kit's full 2.7 km)
      fireGlow: 1, // fires on Vesuvius's slopes (0–1)
      tension: { drone: 1, heartbeat: 1, high: 0.75 }, // music layers (see AUDIO)
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

export const DEBUG = {
  // P jumps to the next eruption phase. Set to false before release.
  phaseKey: true,
};

// Far away: the sky, Vesuvius and its eruption column (from the street
// kit), drawn in their own pass (see backdrop.js). The town's harbour lies
// west and the volcano to the north, so while fleeing it sits ahead and to
// the right; at 9° it stays in view even on an upright phone.
export const BACKDROP = {
  near: 10, // the backdrop camera's range (metres)
  far: 6000,
  skyRadius: 5000,
  angle: 9, // degrees right of straight ahead
  distance: 2000,
  baseY: -15, // sinks the mountain's foot just below the horizon
  columnBase: 395, // the eruption column starts at the crater
  firePatches: 10, // glowing streaks on the slopes (Pliny's "sheets of fire")
  fireColor: 0xff7a2a,
  fireSize: 60, // metres (each glow, seen from 2 km)
};
export const TRACK = {
  chunkLength: 30, // metres: one Road_30m from the kit
  chunksAhead: 6, // how many chunks exist in front of the player (6 × 30 = 180 m view)
  chunksBehind: 1, // kept behind the player so the camera never sees a gap
};

export const STREET = {
  sideGroundWidth: 140, // plain ground under and beyond the buildings
  sideGroundColor: 0x8a7a62,
};

export const OBSTACLES = {
  // Obstacles come in rows across the 3 lanes. Spacing is measured in
  // seconds of running, so rows spread out as speed rises and the player
  // always gets the same reaction time. It must stay longer than a jump
  // (~0.6 s), or a jump could carry the player into the next row.
  rowSpacingTime: 0.8,
  safeStartDistance: 40, // the first row is this far in; nothing before it
  rowChance: 0.75, // chance that a row has any obstacles at all
  // Some rows are one piece across all three lanes; the rest mix
  // single-lane pieces. The value is how often each piece is picked.
  fullRowChance: 0.3,
  fullRow: {
    SteppingStones: { move: 'jump', weight: 1 }, // Pompeii's stepping stones
    FallenBeam: { move: 'slide', weight: 1 }, // a roof beam down across the street
  },
  emptyLaneChance: 0.4, // chance that a lane in a row is left empty
  lane: {
    Rubble: { move: 'jump', weight: 1 },
    Cart: { move: 'block', weight: 1 }, // abandoned, 4.3 m long
    AmphoraStack: { move: 'block', weight: 1 },
  },
  // Hitboxes come from each model's size, shrunk by hitboxMargin on every
  // side so near misses feel fair, with two exceptions while the jump is
  // 2.2 m high (higher than these models):
  //   slide pieces: the band from slideGap.bottom to slideGap.top (too high
  //     to jump over, clear of a sliding player at 0.8 m)
  //   block pieces: blockHeight tall, so they can't be jumped
  hitboxMargin: 0.1,
  slideGap: { bottom: 1.2, top: 2.6 },
  blockHeight: 3,
};
