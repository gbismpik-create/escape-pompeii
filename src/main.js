import './style.css';
import * as THREE from 'three';
import { RENDERER, CAMERA, GAME, DEBUG, STUMBLE, SURGE, JOURNEY, TURNS, LANES, BACKDROP, STATUES, DISTRICTS, VILLA, PHASES, PUMICE, FINALE, ROUTE_MAP, BATHS } from './config.js';
import { createPlayer } from './player.js';
import { createShield } from './shield.js';
import { loadCharacter } from './character.js';
import { createTrack } from './track.js';
import { loadKit } from './kit.js';
import { loadVilla, loadAmphitheatre, seeThrough } from './villa.js';
import { createEnvironment } from './environment.js';
import { nextPhaseStart, journeyPhaseTime } from './phases.js';
import { speedAt } from './speed.js';
import { consumeActions } from './input.js';
import {
  updateDistance, showBest, showGameOver, hideGameOver, setEdgeGlow, setAshFade, setLoading, onMuteButton, showMuted,
  updateStartSound, hideStart, setupSettings, updateShield, setJourney, showFinish,
  setupStartModes, showStart, setupMenuButtons, showMenuButtons, updateCompass, showRouteChange, showDistrict,
} from './ui.js';
import { createAudio } from './audio.js';
import { createSurge } from './surge.js';
import { createFalling } from './falling.js';
import { createCrowds } from './crowds.js';
import { createAnimals } from './animals.js';
import { createSteam } from './steam.js';
import { isSideClip } from './obstacles.js';
import { loadBest, saveBest, loadBestTime, saveBestTime, loadEndlessUnlocked, saveEndlessUnlocked } from './storage.js';

const canvas = document.getElementById('game');

// Renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDERER.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.autoClear = false; // we clear by hand between the two render passes

// Scene
const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(
  CAMERA.fov,
  window.innerWidth / window.innerHeight,
  CAMERA.near,
  CAMERA.far,
);

// Game objects
const environment = createEnvironment(scene, renderer);
const audio = createAudio();
function toggleMute() {
  const muted = audio.toggleMute();
  showMuted(muted);
  updateStartSound(muted);
}
showMuted(audio.muted);
updateStartSound(audio.muted);
onMuteButton(toggleMute);

// The settings panel pauses the game while it is open.
let isPaused = false;
setupSettings(audio.levels, {
  onChange: (levels) => audio.setLevels(levels),
  onOpenChange: (open) => (isPaused = open),
});

setLoading(true);
const [kit, character, villa, amphitheatre] = await Promise.all([
  loadKit(environment.envMap),
  loadCharacter(environment.envMap),
  loadVilla(environment.envMap),
  loadAmphitheatre(environment.envMap),
]);
const track = createTrack(scene, kit, villa, amphitheatre);

environment.addVolcano(kit);
setLoading(false);
const shield = createShield();
const player = createPlayer(scene, character, shield);
// Where the lanes are steps (the theatre's tiers), the floor comes from the track.
player.setFloor((x, z) => track.floorAt(-z, x));
player.setLanes((z) => track.lanesAt(-z));
const surge = createSurge(scene);
// Falling tiles and pumice: bounce off the raised shield, or make him stumble.
const falling = createFalling(track.world, track, {
  block: () => audio.shieldBlock(),
  hit: () => {
    if (player.inStumbleGrace) return;
    player.stumble(); // stays in his lane; never counts towards the surge
    audio.stumble();
    shake = STUMBLE.cameraShake * 0.6;
  },
  smash: (kind, z) => audio.smash(player.object.position.z - z),
});
// People fleeing across the Forum. Bumping into someone is a stumble in his
// lane; it never ends the run or counts towards the surge.
const crowds = createCrowds(scene, kit);
const animals = createAnimals(scene, kit); // the finale's fields
const steam = createSteam(track.world, track, (ahead) => audio.hiss(ahead, BATHS.steam.hissVolume)); // the baths' vents
let steamVents = null; // which vents steam was last given
function onBump() {
  if (player.inStumbleGrace) return;
  player.stumble();
  audio.stumble();
  shake = Math.max(shake, STUMBLE.cameraShake * 0.5);
}

// What falling.js needs to know about the player each frame.
const fallingTarget = { position: player.object.position, hitbox: player.hitbox, shieldRaised: false, velocityZ: 0 };
player.settle(); // stand idle on the start screen
let shake = 0; // camera shake after a stumble, fading out

// After a turn the camera (and the legionary) start facing down the old
// street, which the world has just swung round, and ease onto the new one:
// turnYaw goes from the turn's angle back to 0.
let turnYaw = 0;
let turnFrom = 0;
let turnTime = 0;
const UP = new THREE.Vector3(0, 1, 0);
const camPivot = new THREE.Vector3();
const camTarget = new THREE.Vector3();

function updateTurnEase(dt) {
  turnTime = Math.min(TURNS.cameraTurnTime, turnTime + dt);
  turnYaw = turnFrom * (1 - THREE.MathUtils.smoothstep(turnTime / TURNS.cameraTurnTime, 0, 1));
  player.setTurn(turnYaw);
}

// The floor height the camera follows (eased), for lanes that are steps.
let cameraFloor = 0;

function updateFollowers() {
  const p = player.object.position;

  const camX = p.x * CAMERA.sideFollow;
  // Height ignores jumps and slides so the camera stays steady; it follows
  // only the floor (steps), smoothly.
  camera.position.set(camX + CAMERA.offset.x, CAMERA.offset.y + cameraFloor, p.z + CAMERA.offset.z);
  camTarget.set(camX + CAMERA.lookAhead.x, CAMERA.lookAhead.y + cameraFloor, p.z + CAMERA.lookAhead.z);
  if (turnYaw !== 0) {
    // Swing round the runner.
    camPivot.set(p.x, 0, p.z);
    camera.position.sub(camPivot).applyAxisAngle(UP, turnYaw).add(camPivot);
    camTarget.sub(camPivot).applyAxisAngle(UP, turnYaw).add(camPivot);
  }
  camera.lookAt(camTarget);
  // The villa cuts a hole along the line from the camera to the runner's chest.
  seeThrough.seeCamera.value.copy(camera.position);
  seeThrough.seeRunner.value.set(p.x, cameraFloor + VILLA.seeThrough.chest, p.z);
  seeThrough.seeFloor.value = cameraFloor;
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
  }

  environment.update(runTime, p, camera, phaseTime(), track.heading);
  updateCompassNeedle();
}

// A toppled statue hit the road (position in path space).
function onStatueLanded(position) {
  falling.puff(position.x, position.y + 0.2, position.z, 24);
  audio.smash(player.object.position.z - position.z);
  shake = Math.max(shake, STUMBLE.cameraShake * 0.4);
}

// ---- The finale ----
const finaleLength = FINALE.sections.reduce((sum, s) => sum + s.length, 0);

// Once the finale is laid the finish is at the boats: follow it.
function followFinish() {
  if (mode !== 'escape' || !track.finishDistance || track.finishDistance === journeyLength) return;
  journeyLength = track.finishDistance;
  setJourney(journeyLength);
}

// The shore: he leaps into the boat ahead of his lane, stops on its deck,
// and the boat pulls away from the beach with him aboard.
let boardJumped = false;
let sailing = null; // { boat, time } while the boat pulls away
const BEACH = FINALE.beach;
function updateBoarding() {
  if (mode !== 'escape' || boardJumped || !track.finishDistance) return;
  const stern = track.finishDistance + BEACH.boatAt - BEACH.boatLength / 2;
  if (currentDistance() >= stern - currentSpeed() * BEACH.jumpTime && track.districtAt(currentDistance()) === 'beach') {
    boardJumped = true;
    player.handleAction('jump');
  }
}
// The final sprint over the sand: the surge closes in behind.
function pressSurge() {
  if (mode !== 'escape' || track.districtAt(currentDistance()) !== 'beach') return;
  const left = track.finishDistance - currentDistance();
  surge.press(BEACH.surgePress * THREE.MathUtils.clamp(1 - left / 120, 0, 1));
}

// Porta Stabia's arch: dust while it shakes, a crash of stone when it lands.
const gateEffects = {
  onDust: (p) => falling.puff(p.x + (Math.random() - 0.5) * 4, p.y, p.z, 4),
  onLand: (p) => {
    falling.puff(p.x, p.y, p.z, 30);
    audio.impact();
    shake = STUMBLE.cameraShake * 2;
  },
};

// ---- The pumice (phase 2) ----
// Fixes where along the path the pumice starts, once that is near enough
// (PUMICE.lockAhead): where phase 2 begins. In Escape mode that is a share
// of the journey; in Endless, where the runner will be when phase 2's time
// comes. It rises over PUMICE.riseTime seconds of running at phase 2's speed.
function updatePumice() {
  if (track.pumice) return;
  const d = currentDistance();
  const phase2 = PHASES.list[1];
  let start = mode === 'escape' ? journeyLength * JOURNEY.phaseShares[0] : d + Math.max(0, phase2.start - runTime) * currentSpeed();
  if (environment.phase.index >= 1) start = Math.min(start, d); // already there (the debug key skips ahead)
  if (start - d > PUMICE.lockAhead) return;
  track.setPumice(start, PUMICE.riseTime[mode] * speedAt(start) * phase2.speedMultiplier);
}

// ---- Junctions ----
// Inside the turn window a left/right swipe chooses a way out instead of
// changing lane. The turn itself happens on the junction's centre line.
let queuedTurn = null; // 'left' | 'right' | null
const ROAD_HALF = (LANES.count * LANES.width) / 2;

function currentSpeed() {
  return speedAt(currentDistance()) * environment.phase.speedMultiplier * shield.speedFactor;
}

// Is the runner in the turn window of the junction ahead?
function inTurnWindow() {
  const j = track.junction;
  if (!j) return false;
  const d = -player.object.position.z;
  return d >= j.centre - currentSpeed() * TURNS.window && d < j.centre + ROAD_HALF;
}

// Real directions, as angles clockwise from the first street of a run.
// The world's heading is how far the runner's street is turned from it
// (a left turn takes a quarter turn off), so a direction's bearing from
// straight ahead is its angle minus the heading.
const VESUVIUS_ANGLE = THREE.MathUtils.degToRad(BACKDROP.angle);
const SEA_ANGLE = THREE.MathUtils.degToRad(JOURNEY.seaAngle);
const compassBearings = { vesuvius: 0, sea: 0 };

// The compass eases round with the camera (turnYaw) after a turn.
function updateCompassNeedle() {
  const facing = track.heading - turnYaw;
  compassBearings.vesuvius = VESUVIUS_ANGLE - facing;
  compassBearings.sea = SEA_ANGLE - facing;
  updateCompass(compassBearings);
}

// Escape mode: turning to face the sea more brings it nearer, turning away
// moves it further. The change follows how much more (or less) the street
// faces the sea: cos(bearing) goes from -1 (behind) to 1 (straight ahead).
function routeChangeFor(angle) {
  const before = Math.cos(SEA_ANGLE - track.heading);
  const after = Math.cos(SEA_ANGLE - (track.heading + angle));
  return Math.round((-(after - before) * JOURNEY.seaTurnMetres) / 10) * 10;
}

function turn(way) {
  const turnAngle = way === 'left' ? -Math.PI / 2 : way === 'right' ? Math.PI / 2 : 0;
  if (mode === 'escape' && turnAngle) {
    // Move the sea before the new street is laid (see track.setFinish).
    const centre = track.junction.centre;
    const length = Math.max(journeyLength + routeChangeFor(turnAngle), centre + JOURNEY.minAfterTurn + finaleLength);
    showRouteChange(length - journeyLength);
    journeyLength = length;
    track.setFinish(length);
    setJourney(length);
  }
  const angle = track.take(way);
  if (!angle) return;
  turnFrom = turnYaw + angle; // a turn during a turn carries on from where the camera is
  turnTime = 0;
  falling.reset(); // anything still falling was over the old street
  crowds.reset();
  animals.reset();
  steam.reset();
}

// Each frame while running: take a queued turn on the centre line, carry
// straight on through a crossroads, or run into the wall of a T-junction.
function updateJunction() {
  const j = track.junction;
  if (!j) return;
  const d = -player.object.position.z;
  if (queuedTurn && d >= j.centre) {
    turn(queuedTurn);
    queuedTurn = null;
  } else if (!queuedTurn && j.ways.includes('straight') && d >= j.centre + ROAD_HALF) {
    // Straight on: through a crossroads, or through the door of a house (a shortcut).
    if (j.villa && mode === 'escape') {
      const length = Math.max(journeyLength - VILLA.shortcut, j.centre + VILLA.length + JOURNEY.minAfterTurn + finaleLength);
      showRouteChange(length - journeyLength);
      journeyLength = length;
      track.setFinish(length);
      setJourney(length);
    }
    track.take('straight');
  } else if (!j.ways.includes('straight') && -player.hitbox.min.z >= j.wall) {
    // The front of his hitbox reached the house fronts across the end.
    audio.impact();
    gameOver('You ran into a wall');
  }
}

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Game state
let isStarted = false; // false while the start screen is up
let isGameOver = false;
let timeSinceGameOver = 0;
let runTime = 0; // seconds since this run started; drives the eruption phases
let isCaught = false; // the surge is rolling over the player; game over follows
// 'escape': a journey to the sea, JOURNEY.length metres unless turns move
// it (journeyLength). 'endless': no end.
let mode = 'escape';
let journeyLength = JOURNEY.length;
let phaseProgress = 0; // Escape mode: progress for the phases; never goes back
let debugPhaseSkip = 0; // the P key's jump ahead in phase time (Escape mode)
// Escape mode's finish: after the line he slows to a stop (stopProgress
// 0 → 1), then the end screen shows.
let isFinishing = false;
let stopProgress = 0;
let bestTime = loadBestTime();
let endlessUnlocked = loadEndlessUnlocked();

// What sets the eruption phase: progress to the sea, or time in Endless.
function phaseTime() {
  if (mode === 'endless') return runTime;
  // A turn away from the sea lengthens the journey; the eruption doesn't
  // step back a phase for it.
  phaseProgress = Math.max(phaseProgress, Math.min(1, currentDistance() / journeyLength));
  return journeyPhaseTime(phaseProgress) + debugPhaseSkip;
}
let best = loadBest();
// The best distance only means something in Endless mode.
const showModeBest = () => showBest(mode === 'endless' ? best : 0);
showModeBest();

const currentDistance = () => Math.floor(-player.object.position.z);

function gameOver(reason = '') {
  isGameOver = true;
  shield.lower();
  isCaught = false;
  player.settle();
  audio.setGameOver(true);
  timeSinceGameOver = 0;
  const distance = currentDistance();
  if (mode === 'escape') {
    showGameOver(distance, best, false, reason, { length: journeyLength, bestTime });
    return;
  }
  const isNewBest = distance > best;
  if (isNewBest) {
    best = distance;
    saveBest(best);
    showModeBest();
  }
  showGameOver(distance, best, isNewBest, reason);
}

// Crossed the finish line: stop taking moves and slow to a stop.
function startFinish() {
  isFinishing = true;
  stopProgress = 0;
  shield.lower();
  falling.reset();
}

// Stopped: the end screen. The game then waits like after a game over.
function showEndScreen() {
  isFinishing = false;
  isGameOver = true;
  timeSinceGameOver = 0;
  player.settle();
  audio.setGameOver(true);
  const time = runTime;
  const isNewBest = !bestTime || time < bestTime;
  if (isNewBest) {
    bestTime = time;
    saveBestTime(time);
  }
  const unlocked = !endlessUnlocked;
  if (unlocked) {
    endlessUnlocked = true;
    saveEndlessUnlocked();
    showMenuButtons(true);
  }
  route.points.push(routeHere()); // the shore, where the boat put out
  showFinish({
    distance: journeyLength,
    time,
    saved: 0, // no followers yet (see CLAUDE.md "Later")
    bestTime,
    isNewBest,
    unlocked,
    route,
    epilogue: JOURNEY.epilogue,
  });
}

// Which district the runner is in; its name shows on entering.
let district = null;
function updateDistrict() {
  const now = track.districtAt(currentDistance());
  if (now !== district) {
    district = now;
    showDistrict(DISTRICTS.names[now], DISTRICTS.titleTime);
    if (ROUTE_MAP.places[now]) recordPlace(ROUTE_MAP.places[now]);
  }
}

// ---- The route, for the map on the end screen ----
// Where he has run: points along the path in the town's own coordinates
// (the world group's space, which turns never change), and the places he
// passed on the way.
let route = { points: [], places: [] };
let routeSampledAt = -Infinity;
const routePoint = new THREE.Vector3();
function routeHere() {
  routePoint.setFromMatrixPosition(track.frameAt(Math.max(0, currentDistance())));
  return [routePoint.x, routePoint.z];
}
function recordRoute() {
  if (currentDistance() - routeSampledAt < ROUTE_MAP.every) return;
  routeSampledAt = currentDistance();
  route.points.push(routeHere());
}
function recordPlace(name) {
  const [x, z] = routeHere();
  route.places.push({ name, x, z });
}

function restart() {
  district = null;
  route = { points: [], places: [] };
  routeSampledAt = -Infinity;
  cameraFloor = 0;
  isGameOver = false;
  isFinishing = false;
  boardJumped = false;
  sailing = null;
  queuedTurn = null;
  turnFrom = turnYaw = 0;
  player.setTurn(0);
  runTime = 0;
  debugPhaseSkip = 0;
  journeyLength = JOURNEY.length;
  phaseProgress = 0;
  setJourney(mode === 'escape' ? JOURNEY.length : null);
  showModeBest();
  audio.setGameOver(false);
  hideGameOver();
  player.reset();
  track.reset(mode === 'escape' ? JOURNEY.length : null);
  surge.reset();
  falling.reset();
  crowds.reset();
  animals.reset();
  steam.reset();
  setAshFade(0);
  shake = 0;
}

// Any move, tap or Space on the start screen begins a run (in the last
// mode played; Escape at first). That first input is also what lets the
// browser start the sound (audio.js).
const START_ACTIONS = ['tap', 'jump', 'left', 'right', 'down', 'restart'];

function startRun(chosenMode) {
  mode = chosenMode;
  isStarted = true;
  hideStart();
  restart();
}

// Back to the start menu (from the game-over or end screen).
function openMenu() {
  isStarted = false;
  isGameOver = false;
  hideGameOver();
  setEdgeGlow(0);
  showStart(endlessUnlocked, JOURNEY.length);
}

showStart(endlessUnlocked, JOURNEY.length);
showMenuButtons(endlessUnlocked);
setupStartModes((chosen) => {
  if (!isStarted && !isPaused) startRun(chosen);
});
setupMenuButtons(() => {
  if (isGameOver && !isPaused) openMenu();
});

function handleAction(action) {
  if (action === 'toggleMute') {
    toggleMute();
  } else if (isPaused) {
    // Settings are open: the game ignores everything else.
  } else if (!isStarted) {
    if (action === 'modeEscape') startRun('escape');
    else if (action === 'modeEndless' && endlessUnlocked) startRun('endless');
    else if (START_ACTIONS.includes(action)) startRun(mode);
  } else if (action === 'debugNextPhase') {
    if (DEBUG.phaseKey && !isGameOver) {
      if (mode === 'endless') runTime = nextPhaseStart(runTime);
      else debugPhaseSkip += nextPhaseStart(phaseTime()) - phaseTime(); // skip the look, not the road
    }
  } else if (isFinishing) {
    // Slowing to a stop at the sea: no more moves.
  } else if (!isGameOver && !isCaught) {
    if ((action === 'left' || action === 'right') && inTurnWindow()) {
      if (track.junction.ways.includes(action)) queuedTurn = action; // no lane change in the window
      if (-player.object.position.z >= track.junction.centre) updateJunction(); // a late swipe turns at once
      return;
    }
    player.handleAction(action === 'tap' ? 'shield' : action); // a tap in a run raises the shield
  } else if ((action === 'restart' || action === 'tap') && timeSinceGameOver >= GAME.restartDelay) {
    restart();
  } else if (action === 'menu' && endlessUnlocked && timeSinceGameOver >= GAME.restartDelay) {
    openMenu();
  }
}

// Clipping the side of an obstacle makes the player stumble; running into
// one head-on ends the run.

const CRASH_REASONS = {
  FallenColumn: 'You tripped over a fallen column',
  Rubble: 'You tripped over rubble',
  FallenBeam: 'You ran into a fallen roof beam',
  Cart: 'You ran into an abandoned cart',
  AmphoraStack: 'You ran into a stack of amphorae',
  FallenStatue: 'You tripped over a fallen statue',
  GateCollapse: 'The gateway came down on you',
  Basket: 'You tripped over a basket',
  Scenery_Panel: 'You ran into fallen stage scenery',
  table: 'You ran into a marble table',
  fountain: 'You ran into the garden fountain',
  'hypocaust hole': 'You fell through the bath floor',
  'hot pool': 'You fell into the hot pool',
  labrum: 'You ran into the bath basin',
  brazier: 'You ran into a bronze brazier',
  'lion cage': 'You ran into a beast cage',
  'fallen awning mast': 'You tripped over a fallen awning mast',
  'weapons rack': 'You ran into a rack of arms',
  'torn awning': 'You ran into the torn awning',
  'training posts': 'You ran into the training posts',
  'overturned sand cart': 'You ran into an overturned cart',
  'tipped brazier': 'You ran into a tipped brazier',
};

function checkCollisions() {
  if (player.inStumbleGrace) return;
  const hit = track.findCollision(player.hitbox);
  if (!hit) return;

  const obstacle = hit.hitbox;
  if (hit.stumbleOnly) {
    // A splash, not a crash (the house's rain pool): he stumbles out of it
    // to the side (clear of whatever stands beyond it in its lane), once.
    hit.used = true;
    player.stumble((obstacle.min.x + obstacle.max.x) / 2);
    audio.stumble();
    shake = STUMBLE.cameraShake;
    if (surge.stumble(runTime)) isCaught = true;
    return;
  }
  if (!isSideClip(player.previousHitbox, player.hitbox, obstacle)) {
    audio.impact();
    gameOver(CRASH_REASONS[hit.type]);
    return;
  }
  player.stumble((obstacle.min.x + obstacle.max.x) / 2);
  audio.stumble();
  shake = STUMBLE.cameraShake;
  if (surge.stumble(runTime)) isCaught = true;
}

// Loop
const timer = new THREE.Timer();
timer.connect(document); // pauses the clock while the tab is hidden

renderer.setAnimationLoop((timestamp) => {
  timer.update(timestamp);
  // Cap the step so a long hitch can't teleport the player.
  const dt = Math.min(timer.getDelta(), 0.1);

  for (const action of consumeActions()) handleAction(action);

  if (isPaused) {
    // Settings open: everything holds still.
  } else if (!isStarted) {
    player.tick(dt); // idling on the start screen
  } else if (isGameOver) {
    timeSinceGameOver += dt; // the world freezes; only the overlay and the legionary move
    player.tick(dt);
  } else if (isCaught) {
    // The cloud rolls over the player and the screen fades to ash.
    surge.update(dt, player.object.position, 1);
    setAshFade(surge.caughtProgress);
    if (surge.caughtProgress >= 1) gameOver('The surge caught up with you');
  } else if (isFinishing) {
    // The surge drops back behind: he has got away.
    surge.update(dt, player.object.position, environment.phase.surgeVisibility);
    if (sailing) {
      // The boat pulls away from the shore with him aboard.
      sailing.time += dt;
      const speed = BEACH.sailSpeed * Math.min(1, sailing.time / 1.2);
      player.object.position.z -= track.beach.update(dt, speed);
      player.object.position.y = BEACH.deck + sailing.boat.position.y;
      player.tick(dt);
      track.update(player.object.position.z, environment.fogDistance);
      if (sailing.time >= BEACH.sailTime) showEndScreen();
    } else {
      // Past the line: ease to a stop (on the boat's deck), then the boat pushes off.
      stopProgress = Math.min(1, stopProgress + dt / (boardJumped ? BEACH.stopTime : JOURNEY.stopTime));
      player.update(dt, environment.phase.speedMultiplier * (1 - stopProgress) ** 2);
      track.update(player.object.position.z, environment.fogDistance);
      track.beach.update(dt);
      if (stopProgress >= 1 && player.isGrounded) {
        if (boardJumped) {
          player.settle();
          sailing = { boat: track.beach.depart(player.object.position.x), time: 0 };
        } else showEndScreen();
      }
    }
  } else {
    runTime += dt;
    const { speedMultiplier, envIntensity } = environment.phase;
    character.setEnvIntensity?.(envIntensity); // the built-in legionary has no metal
    const zBefore = player.object.position.z;
    player.update(dt, speedMultiplier);
    audio.updateMovement(zBefore - player.object.position.z, player.isGrounded, player.isSliding);
    updatePumice();
    track.update(player.object.position.z, environment.fogDistance); // nothing is drawn beyond the fog
    followFinish();
    recordRoute();
    track.gate.update(dt, currentDistance(), currentSpeed(), gateEffects);
    updateDistance(currentDistance());
    updateDistrict();
    crowds.update(dt, currentDistance(), currentSpeed(), (d) => track.districtAt(d) === 'forum', player.hitbox, onBump);
    animals.update(dt, currentDistance(), currentSpeed(), (d) => track.districtAt(d) === 'fields', player.hitbox, onBump);
    if (track.steamVents !== steamVents) steam.setVents((steamVents = track.steamVents));
    steam.update(dt, currentDistance(), currentSpeed());
    // Statues: some topple in the later phases (see statues.js).
    const statueSpeed = currentSpeed();
    track.statues.update(
      dt,
      currentDistance(),
      statueSpeed,
      environment.phase.index >= STATUES.toppleFromPhase,
      (d) => track.clearOfRows(d, statueSpeed * STATUES.clearance),
      onStatueLanded,
    );
    updateShield(shield.state, shield.remaining);
    checkCollisions();
    if (!isGameOver) updateJunction();
    updateTurnEase(dt);
    cameraFloor += (player.floor - cameraFloor) * (1 - Math.exp(-dt * 5));
    const speed = speedAt(currentDistance()) * speedMultiplier;
    fallingTarget.shieldRaised = shield.isRaised;
    fallingTarget.velocityZ = -speed * shield.speedFactor;
    // Nothing new falls on the last stretch before the sea.
    const nearFinish = mode === 'escape' && currentDistance() > journeyLength - JOURNEY.finishClearDistance;
    falling.update(dt, nearFinish ? 0 : environment.phase.fallRate, speed * shield.speedFactor, fallingTarget);
    updateBoarding();
    pressSurge();
    track.beach.update(dt);
    surge.update(dt, player.object.position, environment.phase.surgeVisibility);
    if (mode === 'escape' && currentDistance() >= journeyLength && !isGameOver && !isCaught) startFinish();
  }

  // At the sea the surge's glow and roar die away.
  const reachedSea = mode === 'escape' && (isFinishing || (isGameOver && currentDistance() >= journeyLength));
  const calm = reachedSea ? (isFinishing ? 1 - stopProgress : 0) : 1;

  // The glow at the screen edges: steady during the surge phase, stronger
  // as the cloud closes in (half as strong before the surge phase), with a
  // slow flicker.
  const surgePhase = environment.phase.surgeVisibility;
  const glow = Math.max(surgePhase * 0.35, surge.proximity * (0.5 + 0.5 * surgePhase)) * SURGE.edgeGlowMax;
  setEdgeGlow(glow * calm * (0.9 + 0.1 * Math.sin(runTime * 5)));
  shake = Math.max(0, shake - dt * 0.6);
  audio.setRumble(environment.phase.rumbleVolume);
  audio.setRoar(isGameOver ? 0 : isCaught ? 1 : surge.proximity * calm); // fades out on the game-over screen
  const { tensionDrone, tensionHeartbeat, tensionHigh } = environment.phase;
  const running = isStarted && !isGameOver && !isCaught && !isPaused;
  audio.updateTension(
    { drone: tensionDrone, heartbeat: tensionHeartbeat, high: tensionHigh },
    speedAt(currentDistance()) * environment.phase.speedMultiplier,
    running,
  );

  updateFollowers();

  // Two passes: the far backdrop first, then the town over it (backdrop.js).
  renderer.clear();
  environment.renderBackdrop(renderer);
  renderer.clearDepth();
  renderer.render(scene, camera);
});
