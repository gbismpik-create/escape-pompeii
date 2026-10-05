// All tunable numbers live here. Tweak values in this file rather than in game code.

export const RENDERER = {
  maxPixelRatio: 2,
};

export const LANES = {
  count: 3,
  width: 1.8, // distance between lane centres (metres): matches the street kit's road
};

// Districts (track.js): each way out of a junction leads into one. A street
// is "residential" (Via dell'Abbondanza); some ways lead into the Forum, a
// wide square (still three lanes), for a few chunks, then back into the streets.
export const DISTRICTS = {
  // A junction may offer a district down one of its ways (never the same
  // district twice running, none once the pumice has begun). Which one is
  // picked by weight; one already seen this run counts for less.
  offerChance: 0.6,
  weights: { forum: 3, theatre: 2, baths: 3, amphitheatre: 3, palaestra: 3 },
  seenWeight: 0.25, // a district already seen this run: its weight times this
  only: null, // tests only: always offer this district (null in the real game)
  autoTake: false, // tests only: he turns down the way to it by himself (false in the real game)
  forumChunks: [3, 6], // how long the Forum lasts (chunks of TRACK.chunkLength)
  names: {
    residential: "Via dell'Abbondanza", forum: 'The Forum', theatre: 'The Large Theatre', villa: 'The House of the Vettii', baths: 'The Stabian Baths', amphitheatre: 'The Amphitheatre', palaestra: 'The Great Palaestra',
    // the finale (FINALE)
    gate: 'Porta Stabia', tombs: 'The Tombs outside Porta Stabia', fields: 'The Road to Stabiae', beach: 'The Shore at Stabiae',
  },
  gateOpen: 6, // metres into the Forum (past the entrance arch) where its name shows and the lanes widen
  forumLanes: 5, // lanes across the Forum (LANES.count elsewhere)
  narrowBefore: 20, // metres before the Forum's end where the lanes are back to LANES.count
  laneChangeClear: 0.8, // seconds of running kept free of obstacle rows either side of where the lanes narrow
  titleTime: 2.2, // seconds the district name shows
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
  stepUpSpeed: 7, // m/s he rises onto a higher step (lanes as steps, e.g. the theatre's tiers)

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
  // The statues of the gods (tools/build-statues.mjs), read in as more kit pieces.
  statuesFile: 'assets/statues.glb',
  statuesFarFile: 'assets/statues-far.glb',
  layouts: 5, // different street layouts merged at load (each also used mirrored)
  houses: ['House_Red', 'House_Ochre', 'House_White'],
  housesPerSide: 5, // 6 m wide each: 5 fill a 30 m chunk
  houseWidth: 6,
  facadeX: 4.6, // house fronts stand at |x| = 4.6, the pavement's outer edge
  // Props on the pavements (|x| 3.0–4.6), well clear of the lanes.
  props: {
    perSide: [1, 3], // how many per side of a chunk (min, max)
    // name: [distance from the street centre, chance of being picked]
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
  // Shield raised overhead: these bones are turned to these rotations
  // (radians, local x/y/z) on top of whatever animation is playing, blended
  // in and out over shieldBlendTime. The upper arm goes up, the forearm
  // across above the helmet, and the scutum lies flat on it, face up.
  shieldPose: { Shoulder_L: [0, 0, 2.75], Elbow_L: [0, 0, 1.5], Scutum: [0, 0, -2.68] },
  // Where the scutum sits on the forearm while raised (its bone's position,
  // metres): moved to the upper side so it rests above the arm.
  shieldOffset: [-0.2, -0.25, 0.05],
  shieldBlendTime: 0.15, // seconds to swing the shield up or down
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
    shieldBlock: 'assets/audio/shield-block.mp3', // a tile or pumice bouncing off the scutum
    smash: 'assets/audio/tile.mp3', // a tile or pumice hitting the road
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

// Escape mode: a run is a journey through the town to the sea.
// (Endless mode keeps the phase start times in PHASES.)
export const JOURNEY = {
  length: 1600, // metres from the start to the sea
  // Share of the journey each eruption phase takes (pumice, ash, surge).
  // Phases follow distance here, so stumbles and the shield's slowdown don't
  // shift them, and the last stretch is always the surge.
  phaseShares: [0.35, 0.35, 0.3],
  finishClearDistance: 40, // no obstacles or falling things in the last metres
  // Route choice: the sea lies seaAngle degrees from the first street
  // (+ = to the right). Each turn changes the distance left to the sea by
  // seaTurnMetres × how much more (or less) the new street faces the sea:
  // turning to face it shortens the journey, turning away lengthens it.
  // (Real map: Vesuvius north-west of Pompeii, the shore to the west-south-west.)
  seaAngle: -70,
  seaTurnMetres: 250,
  minAfterTurn: 150, // after a turn the sea is never closer than this
  stopTime: 1.2, // seconds to slow to a stop after the finish line
  // For now the finish is a plain open area: the houses end, a line crosses
  // the road and a signpost points to the sea.
  sign: { lines: ['AD MARE', 'To the sea'], x: 3.4, distancePast: 6 },
  finishLineColor: 0xe9e0c8,
  // The end screen's epilogue: a paragraph each.
  epilogue: [
    'Pliny the Elder, commander of the Roman fleet at Misenum, crossed the bay with his galleys to bring people away ' +
      'from the coast below Vesuvius. Unable to land there, he put in at Stabiae. He died on the shore there.',
    'His nephew, Pliny the Younger, watched the eruption from Misenum. Years later he described it in two letters ' +
      'to the historian Tacitus — the only eyewitness account that survives.',
    "Many of Pompeii's people escaped, as you did. More than a thousand did not; they are remembered there still.",
  ],
};

// The map of the run on the end screen (ui.js).
export const ROUTE_MAP = {
  every: 8, // metres between the route's recorded points
  // The places marked on it, by district (DISTRICTS): their names on the map.
  places: { forum: 'Forum', theatre: 'Theatre', villa: 'Vettii', baths: 'Baths', amphitheatre: 'Amphitheatre', palaestra: 'Palaestra', gate: 'Porta Stabia', beach: 'Stabiae' },
  size: [300, 190], // CSS pixels
};

export const GAME = {
  // After a crash, ignore restart input for this long so a swipe that was
  // already in progress doesn't skip the game-over screen.
  restartDelay: 0.5,
};

// The scutum raised overhead (shield.js). Tap or E raises it; tapping
// again lowers it early.
export const SHIELD = {
  key: 'KeyE',
  duration: 3, // seconds it stays up before lowering itself
  cooldown: 2, // seconds after lowering before it can be raised again
  speedMultiplier: 0.75, // run speed while raised
  speedEase: 0.15, // seconds (time constant) to ease into / out of the slower speed
};

// Roof tiles and pumice falling onto the street (falling.js). A shadow on
// the road warns where each will land. With the shield raised they bounce
// off; otherwise a hit makes him stumble (it never ends the run, and it
// doesn't count towards the surge catching him). How often: PHASES fallRate.
export const FALLING = {
  maxFalling: 8, // at most this many at once
  tileShare: 0.4, // share of roof tiles; the rest are pumice
  targetPlayerChance: 0.7, // chance of landing in the player's lane (else a random lane)
  warningTime: 1.3, // seconds from the shadow appearing to landing
  fallTime: 0.6, // seconds of visible fall; it starts when he is this far from the shadow
  dropHeight: 9, // metres it falls from (above the roofs)
  startDistance: 60, // nothing falls in the first metres of a run
  clearanceTime: 0.5, // seconds of running kept clear between it and obstacles
  hitRadius: 0.2, // size of a falling object for the hit test
  // The space the raised shield covers, around the player (metres).
  shieldArea: { halfWidth: 0.6, halfDepth: 0.6, top: 2.3 },
  shadowRadius: 0.55,
  shadowDarkness: 0.3, // 1 = invisible, 0 = black
  shadowFadeIn: 0.15,
  tileSize: [0.45, 0.06, 0.6],
  tileColor: 0xb15f3b,
  tileEdgeColor: 0x8a4630,
  pumiceRadius: 0.17,
  pumiceColor: 0xcfc6b4, // pumice is light and pale
  dust: {
    maxParticles: 160,
    perBlock: 14, // dust particles when something bounces off the shield
    sparksPerBlock: 6, // plus a few bright sparks off the bronze
    perSmash: 10, // when it hits the road or him
    life: 0.7, // seconds
    size: 0.45, // metres
    opacity: 0.85,
    color: 0x857c70, // ash grey: reads against both the pale walls and the dark road
    sparkColor: 0xffc070,
  },
  blockVolume: 1,
  smashVolume: 0.6,
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
      ashWaves: 0.3, // how strongly the falling ash comes in gusts (0–1)
      fallRate: 0.2, // tiles and pumice falling per second (see FALLING)
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
      ashWaves: 0.6, // how strongly the falling ash comes in gusts (0–1)
      fallRate: 0.35, // tiles and pumice falling per second (see FALLING)
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
      ashWaves: 0.8, // how strongly the falling ash comes in gusts (0–1)
      fallRate: 0.25, // tiles and pumice falling per second (see FALLING)
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
  // Ash falls in waves: the amount and the sideways drift rise and fall in
  // gusts. waveDepth: how deep the lulls are (0 = steady, 1 = to nothing).
  // The gusts grow stronger in each phase (PHASES ashWaves).
  wavePeriods: [11, 4.3], // seconds; two overlapping rhythms feel less mechanical
  // Ash settling on the town (ashShader.js). Cover builds up with how much
  // ash has fallen: ashRate × settleRate per second, up to maxCover.
  settledColor: 0x9b958c,
  settleRate: 0.006,
  maxCover: 0.9,
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
  testCurve: 0, // tests only: curvature (1 / radius) given to every other chunk
  testSteps: null, // tests only: e.g. [0, 0.5, 1] lane floor heights on every fourth pair of chunks
  stepRamp: 6, // metres over which a stepped stretch rises from flat and sinks back
};

// Junctions and turns (track.js). The street is a path of chunks, each with
// a heading; every so often a junction chunk ends the straight: a T-junction
// (turn left or right, or run into the wall) or a crossroads (turn, or run
// straight on). On a turn the whole town rotates 90° around the runner.
export const TURNS = {
  enabled: true,
  interval: [20, 40], // seconds of running between junctions (random in this range)
  firstAfter: 15, // seconds before the first junction of a run
  crossroadsChance: 0.4, // the rest are T-junctions
  window: 1.0, // seconds before the junction's centre when a swipe turns instead of changing lane
  cameraTurnTime: 0.35, // seconds for the camera (and the legionary) to swing round
  clearBefore: 1.5, // seconds of running before a junction kept free of obstacles
  finishMargin: 100, // no junction within this many metres of the sea
  // Junction chunk, in metres from its start: the street (3 houses a side),
  // then the square where the streets cross, 2 × KIT.facadeX wide.
  housesBeforeSquare: 3,
};

// Statues on pedestals (statues.js), from the street kit. One stands every
// so often on a pavement or at the corner of a crossroads.
export const STATUES = {
  spacing: [150, 250], // metres between statues (random in this range)
  pavementX: 3.5, // pedestal centre, metres from the middle of the street
  pavementHeight: 0.36, // the pavement's top: pedestals stand on it
  // Toppling (eruption phases 2 and 3, never at junctions): a shadow shows
  // where it will land, then the figure tips off its pedestal onto the road
  // and lies across one lane: jump it or change lane.
  toppleChance: 0.3,
  toppleFromPhase: 1, // phase index (0 = pumice, 1 = ash, 2 = surge)
  triggerTime: 2.5, // seconds before the runner reaches it that the shadow appears
  warningTime: 1.0, // seconds of shadow before it falls
  fallTime: 0.5, // seconds to fall
  clearance: 0.7, // seconds of running kept free of obstacle rows around it
  // The fallen figure's hitbox, in the statue's frame (z: out towards the road).
  fallen: { halfWidth: 0.3, height: 0.55, from: 0.6, to: 2.6 },
  // In the Forum: more statues, standing right by the lanes (forumX), and
  // free-standing columns further out (column.x) that fall across a lane.
  forumSpacing: [40, 70], // metres between them in the Forum
  forumToppleChance: 0.5,
  forumX: 5.4,
  column: { chance: 0.5, x: 7.3, fallen: { halfWidth: 0.4, height: 0.8, from: 0.3, to: 6.4 }, lieHeight: 0.3 },
  shadowDarkness: 0.18,
  wobble: 0.06, // radians: the statue rocks on its pedestal while the shadow shows
  pedestalHeight: 1.02, // the figure stands this high
  // The six gods (tools/build-statues.mjs); each has its own inscribed pedestal, 'Pedestal_<God>'.
  types: ['Statue_Apollo', 'Statue_Diana', 'Statue_Venus', 'Statue_Jupiter', 'Statue_Minerva', 'Statue_Mercury'],
};

// The finale (Escape mode): the last stretch of the journey, out of the city
// by its south gate, Porta Stabia, along the road lined with tombs, through
// vineyards and fields, to the shore at Stabiae and the boats. Lengths in
// metres; the finale starts on a chunk boundary and the finish (where the
// runner reaches the boats) moves to boardAt metres into it.
export const FINALE = {
  sections: [
    { kind: 'gate', length: 30 }, // the last houses, then the city wall and the passage through it
    { kind: 'tombs', length: 90 },
    { kind: 'fields', length: 180 },
    { kind: 'beach', length: 150 },
  ],
  boardAt: 430,
  margin: 60, // no junction within this many metres before the finale
  wallAt: 12, // the wall's inner face, metres into the gate chunk
  wallDepth: 12, // and its thickness (the passage's length)
  // The arch giving way: a great tufa lintel drops into the passage, just
  // above a sliding runner. It shakes and sheds dust (warningTime), then
  // falls (fallTime), timed to be down doneBefore seconds before he gets there.
  collapse: {
    at: 18, // metres into the gate chunk
    warningTime: 0.9,
    fallTime: 0.35,
    doneBefore: 0.6,
    dropFrom: 4, // metres above where it ends up
    height: 1.25, // its underside above the floor when down (a sliding runner is 0.8 tall)
    halfWidth: 3.2, // the passage
    halfDepth: 0.55,
    wobble: 0.04, // radians while it shakes
  },
  // Outside the walls the pumice thins out (it fell thickest on the town);
  // grey ash settles on the grass instead (the ash cover on every material).
  pumiceOutside: 0,
  pumiceBeach: 0,
  pumiceTaper: 30, // metres over which it thins
  // Obstacles outside the walls, as in OBSTACLES (weights only): along the
  // tombs a toppled column now and then; in the fields, abandoned farm carts.
  obstacles: {
    tombs: { fullRowChance: 0.2, fullRow: { FallenColumn: 1 }, lane: { Rubble: 1, AmphoraStack: 1, Cart: 1 } },
    fields: { fullRowChance: 0, lane: { Cart: 2, Rubble: 1, Basket: 1 } },
  },
  // Beside the road outside the walls (metres from its middle).
  tombsX: 4.3, // the tombs' fronts
  tombSpacing: [6.5, 9], // metres between tombs along the road
  vineRows: { from: 8, to: 32, every: 2.6 },
  // The shore: boats drawn up on the sand, one ahead of each lane, the sea
  // just beyond. Metres from the finish (where the runner reaches the boats).
  beach: {
    shore: 4.5, // the waterline, past the finish
    boatLength: 6, boatAt: 0.8, // each lane's boat: its middle just past the finish
    deck: 0.55, // the boat's deck above the sand
    sprintClear: 60, // no obstacles in the last metres: the final sprint
    obstacles: { fullRowChance: 0, lane: { AmphoraStack: 1, Basket: 1, Rubble: 1 } },
    // Boarding: he leaps in (jumpTime seconds of running before the boat's
    // stern), stops on the deck (stopTime), then the boat pushes off.
    jumpTime: 0.3,
    stopTime: 0.35,
    sailTime: 3.2, // seconds of the boat pulling away before the end screen
    sailSpeed: 4, // m/s it reaches, rowing out
    // The surge closes in behind over the beach (0 = as usual, 1 = right behind).
    surgePress: 0.5,
    // The fleet offshore, beyond the boats: [x, metres past the shore, turn].
    galleys: [[-22, 30, 0.5], [13, 44, -0.35], [-5, 62, 0.15]],
    // More boats drawn up on the sand either side: [x, metres past the finish, turn].
    sideBoats: [[-6.5, 0, 0.25], [7, -1.5, -0.3], [-11, -3, 0.7], [12, 1, -0.1], [-17, -2, 1.3]],
  },
};

// The pumice fall (phase 2): grey pumice stones fill the streets, deeper and
// deeper. Its depth is set along the path (so everything laid ahead knows
// it): from where phase 2 starts it rises to `depth` over `riseTime` seconds
// of running, then stays. The runner, obstacles and statues stand on it.
// Once it has begun, no Forum, theatre or house shortcut is offered.
export const PUMICE = {
  depth: 1.4, // metres at its deepest: doorways half buried
  riseTime: { escape: 15, endless: 30 }, // seconds of running over which it rises
  lockAhead: 450, // metres ahead of the runner at which its start is fixed
  halfWidth: 4.55, // across the street, just short of the house fronts
  lumps: 0.1, // metres of unevenness on its surface
  drift: 0.35, // metres it piles higher against the house fronts
  clearIn: ['forum', 'theatre', 'villa', 'baths', 'amphitheatre', 'palaestra'], // districts kept clear of it (roofed halls, swept squares)
  districtRamp: 10, // metres over which it slopes away just inside them
  colors: [0x5f5f5c, 0xc4c3bc], // dark and light grey-white pumice
};

// The Stabian Baths (a district; the model: tools/build-stabian-baths.mjs,
// loaded by villa.js): across Via dell'Abbondanza to the street front, in by
// the vestibule, across the palaestra past its swimming pool, through the
// men's baths (changing room, round cold room, warm room, hot room) and out
// through the furnace room into the street behind.
// Model space: +z along the way, the street front at z = 0, the back
// street's far side at z = 105; lanes 0..2 at x = -1.8, 0, 1.8 (-1: across).
export const BATHS = {
  file: 'assets/stabian-baths.glb',
  chunks: 4, // 120 m
  gateAt: 15, // metres into the run where its street front is (so the back street ends with the run)
  laneHalfWidth: 0.8, // its obstacles' hitboxes, across one lane
  jumpHeight: 0.35, // 'jump' ones (the bowling track, the firewood); 'slide' ones are OBSTACLES.slideGap
  stumbleOnly: ['cold plunge pool'], // running into the cold pool is a splash and a stumble, not the end
  indoors: [[-1, 5], [39, 91]], // model z: the vestibule, the men's baths (nothing falls there)
  groundDrop: -2, // the plain ground sinks below its pools while he is inside
  steam: {
    vents: [41, 59, 70, 83], // the changing room, the cold room's far door, the hot room, the furnace room
    hideRange: 16, // metres beyond a grate an obstacle can be hidden
    fairClear: 1.0, // seconds: clear by then, before the obstacle arrives
    clearBeforeGrate: 0.3, // seconds: clear by then, before he reaches the grate
    hissLead: 0.35, // seconds of hiss before the steam shows
    rise: 0.45, // seconds to billow up
    hold: 0.8, // seconds at its thickest
    fade: 0.8, // seconds to thin away
    puffs: 26, // per vent
    width: 6.2, // metres across the hall
    height: [0.2, 2.6], // puff centres, metres above the floor
    size: [2.0, 3.4], // puff diameters, metres
    opacity: 0.95,
    color: 0xdedad2,
    hissVolume: 0.5,
  },
};

// The Great Palaestra (a district; the model: tools/build-great-palaestra.mjs,
// its statues tools/build-palaestra-statues.mjs, loaded by villa.js): down a
// street to the west gate, along the shaded avenue of plane trees beside the
// near colonnade (statues of athletes on their pedestals, the pool across
// the court), out by the east gate towards the amphitheatre.
// Model space: +z along the way, the west gate at z = 0, the street beyond
// the east gate ends at z = 155; lanes 0..2 at x = -1.8, 0, 1.8 (-1: across).
export const PALAESTRA = {
  file: 'assets/great-palaestra.glb',
  statuesFile: 'assets/palaestra-statues.glb',
  chunks: 6, // 180 m
  gateAt: 25, // metres into the run where the west gate is (so the street beyond the east gate ends with the run)
  laneHalfWidth: 0.8, // its obstacles' hitboxes, across one lane
  jumpHeight: 0.35, // 'jump' ones (the fallen branch, the hurdle); 'slide' ones are OBSTACLES.slideGap
  stumbleOnly: [],
  fallShare: 0.5, // half as many tiles and stones falling (open sky, far from roofs)
  groundDrop: -3, // the plain ground sinks below its pool while he is inside
};

// The Amphitheatre (a district; the model: tools/build-amphitheatre.mjs,
// loaded by villa.js): the plaza with its market stalls, in by the north
// gate, down the vaulted passage 6 m to the arena, across the sand past what
// was left from the games, up the south passage and out onto a street.
// Model space: +z along the way, the north gate at z = 0, the south gate at
// z = 136, lanes 0..2 at x = -1.8, 0, 1.8 (lane -1: right across).
export const AMPHITHEATRE = {
  file: 'assets/amphitheatre.glb',
  chunks: 7, // 210 m: the plaza, the monument, then the street beyond its south gate
  gateAt: 44, // metres into the run where the north gate is (so the south gate is at 180, a chunk's end)
  exitAt: 180, // metres into the run where the south gate is
  laneHalfWidth: 0.8, // its obstacles' hitboxes, across one lane
  jumpHeight: 0.35, // 'jump' ones (the fallen mast); 'slide' ones are OBSTACLES.slideGap; 'dodge' ones OBSTACLES.blockHeight
  tunnels: [[-2, 26], [109, 138]], // model z: the vaulted passages (nothing falls there)
  groundDrop: -6.4, // the plain ground beyond sinks below the arena while he is in it
};

// The rich house (domus) shortcut: the far side of some T-junctions is a
// house front with its door open, a third way, straight through it (the
// model: tools/build-villa.mjs, loaded by villa.js). Inside, its own
// obstacles (the rain pool, the fountain, the baths), and out of the back
// door onto another street, nearer the sea.
export const VILLA = {
  file: 'assets/villa.glb',
  chance: 0.3, // chance a T-junction has the house across it (never two junctions running)
  length: 70, // metres from its street door to its back door
  shortcut: 150, // Escape mode: metres nearer the sea for going through
  // Its obstacles' hitboxes: across one lane; 'jump' ones this high (the
  // rain pool's rim and a hole in the floor), 'dodge' ones OBSTACLES.blockHeight.
  laneHalfWidth: 0.8,
  jumpHeight: 0.35,
  stumbleOnly: ['impluvium'], // running into the rain pool is a splash and a stumble, not the end
  openSky: [[28, 49]], // metres in where it is open to the sky (the garden): things can fall there
  // Inside, what stands between the camera and the runner is cut away
  // (villa.js): a cone from the camera to his chest (radii in metres), and
  // anything overhead (above headroom) for `ahead` metres in front of him.
  seeThrough: { nearRadius: 0.9, farRadius: 1.7, chest: 1.1, ahead: 9, aheadHalfWidth: 2.4, headroom: 2.2 },
};

// The Large Theatre (theatre route in path.js, the model in the kit): a way
// out of a junction can lead through it, at most once a run. The route: a
// vaulted passage alongside the seating, across the stage, a tight curve up
// onto a band of three broad steps through the seating (the lanes are the
// steps), round the tier, and out through a vaulted exit (vomitorium).
// Sizes follow the real theatre (seating about 31 m in radius, ~5,000 seats).
export const THEATRE = {
  // (offered at junctions like the other districts, DISTRICTS.weights; once a run)
  passage: 29.5, // metres of vaulted passage
  stage: 36.5, // metres across the stage
  turnRadius: 3.5, // the tight curve onto the tier (= the stage front's distance from the path)
  exitRadius: 8, // the wider curve off the tier into the vomitorium
  exitBlend: 4, // metres past the tier over which the three steps even out
  ringRadius: 18, // the tier band's middle lane, from the orchestra's centre
  ringAngle: 120, // degrees run round the tier (the exit then leads away from where you came in)
  vomitorium: 16, // metres of straight exit tunnel
  tierHeights: [2.2, 2.7, 3.2], // the three steps' floors above the stage (lane 0 nearest the orchestra)
  rampIn: 9, // metres of stairs from the stage up to the steps
  // The building (metres; heights from the stage floor).
  orchestraDepth: -1.2, // the orchestra floor below the stage
  firstRow: 11, // radius of the first row of seats (the orchestra's edge)
  rowDepth: 0.75,
  rowRise: 0.42,
  outerRadius: 31, // the seating's outer edge
  stageBack: 4.5, // the stage wall (scaenae frons), right of the path
  stageWallHeight: 14,
  // Obstacles in each part, as in OBSTACLES (weights only). None on the
  // stairs, in the tight curve or in the vomitorium.
  obstacles: {
    // the vaulted passage: mostly fallen beams to slide under
    passage: { fullRowChance: 0.6, fullRow: { FallenBeam: 3, FallenColumn: 1 }, lane: { Rubble: 1, AmphoraStack: 1 } },
    // the stage: fallen scenery and props, no full rows
    stage: { fullRowChance: 0, lane: { Scenery_Panel: 2, AmphoraStack: 1, Basket: 1 } },
    // the three steps: things left behind on them, one lane at a time
    tier: { fullRowChance: 0, lane: { Basket: 2, Rubble: 1, AmphoraStack: 1 } },
  },
  oncePerRun: false, // true: the theatre comes at most once a run
  groundDrop: -1.8, // the plain ground sinks this low in the theatre (the orchestra is below the street)
};

// People fleeing across the Forum (crowds.js): small groups run from one
// side of the square to the other. Bumping into someone makes the runner
// stumble; it never ends the run or counts towards the surge.
export const CROWDS = {
  spacing: [3, 5], // seconds of running between groups
  groupSize: [2, 4],
  speed: 3.5, // m/s across the square
  startX: 11, // they set off from beside the colonnades
  leadTime: 3.4, // seconds before the runner reaches their crossing that they set off
  hitbox: { halfWidth: 0.25, height: 1.7, halfDepth: 0.2 },
  stride: 2.6, // steps per second
  tunicColors: [0xb5452f, 0xd8c9a8, 0x6f7f5a, 0x8a6a45, 0x5d6f8a, 0xc49a3c, 0x9c8f86],
};

// Frightened farm animals bolting across the road in the finale's fields
// (animals.js), timed like the Forum's crowds to cross as the runner comes.
// Running into one is a stumble. Per kind: how many run together, their
// speed across the road (m/s), legs (hip height and spacing, metres; swings
// per second), a hitbox and the legs' colour.
export const ANIMALS = {
  spacing: [2.6, 4.2], // seconds of running between groups
  startX: 9.5, // they burst out from between the vines this far from the road's middle
  kinds: {
    sheep: { weight: 3, group: [3, 5], speed: 4.2, hip: 0.5, legs: [0.14, 0.3], stride: 4.5, hitbox: { halfWidth: 0.5, height: 0.95, halfDepth: 0.3 }, legColor: 0x3b3430 },
    goat: { weight: 2, group: [2, 3], speed: 5.8, hip: 0.62, legs: [0.11, 0.3], stride: 5.5, hitbox: { halfWidth: 0.45, height: 1.2, halfDepth: 0.22 }, legColor: 0x4a3a2c },
    ox: { weight: 1, group: [1, 1], speed: 2.6, hip: 0.9, legs: [0.28, 0.7], stride: 2.4, hitbox: { halfWidth: 1.1, height: 1.6, halfDepth: 0.45 }, legColor: 0x6b4f36 },
  },
  max: 14, // animals on the road at once
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
    // A toppled Greek Doric column across the street. hitboxHeight: only the
    // drums in the lanes count, not the capital lying on the pavement.
    FallenColumn: { move: 'jump', weight: 1, hitboxHeight: 0.6 },
    FallenBeam: { move: 'slide', weight: 1 }, // a roof beam down across the street
  },
  emptyLaneChance: 0.4, // chance that a lane in a row is left empty
  lane: {
    Rubble: { move: 'jump', weight: 1 },
    // Abandoned, about 1.2 m high: jump it or go round. hitboxLength keeps the
    // thin pulling poles out of the hitbox, so only the 2.2 m body counts.
    Cart: { move: 'jump', weight: 1, hitboxLength: 2.2 },
    AmphoraStack: { move: 'jump', weight: 1 }, // about 1 m high: jump it or go round
  },
  // Single-lane pieces found only in some districts (see THEATRE.obstacles).
  special: {
    Basket: { move: 'jump' }, // a spectator's basket left on the steps, about 0.5 m high
    Scenery_Panel: { move: 'block' }, // a painted stage flat fallen across a lane: go round
  },
  // Hitboxes come from each model's size, shrunk by hitboxMargin on every
  // side so near misses feel fair, with two exceptions while the jump is
  // 2.2 m high (higher than these models):
  //   slide pieces: the band from slideGap.bottom to slideGap.top (too high
  //     to jump over, clear of a sliding player at 0.8 m)
  //   block pieces (the cart): blockHeight tall, so they can't be jumped
  hitboxMargin: 0.1,
  slideGap: { bottom: 1.2, top: 2.6 },
  blockHeight: 3,
};
