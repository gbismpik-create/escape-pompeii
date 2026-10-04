import './style.css';
import * as THREE from 'three';
import { RENDERER, CAMERA, GAME, DEBUG, STUMBLE, SURGE } from './config.js';
import { createPlayer } from './player.js';
import { loadCharacter } from './character.js';
import { createTrack } from './track.js';
import { loadKit } from './kit.js';
import { createEnvironment } from './environment.js';
import { nextPhaseStart } from './phases.js';
import { speedAt } from './speed.js';
import { consumeActions } from './input.js';
import {
  updateDistance, showBest, showGameOver, hideGameOver, setEdgeGlow, setAshFade, setLoading, onMuteButton, showMuted,
  updateStartSound, hideStart, setupSettings,
} from './ui.js';
import { createAudio } from './audio.js';
import { createSurge } from './surge.js';
import { isSideClip } from './obstacles.js';
import { loadBest, saveBest } from './storage.js';

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
const [kit, character] = await Promise.all([loadKit(environment.envMap), loadCharacter(environment.envMap)]);
const track = createTrack(scene, kit);
environment.addVolcano(kit);
setLoading(false);
const player = createPlayer(scene, character);
const surge = createSurge(scene);
player.settle(); // stand idle on the start screen
let shake = 0; // camera shake after a stumble, fading out

function updateFollowers() {
  const p = player.object.position;

  const camX = p.x * CAMERA.sideFollow;
  // Height is fixed (not p.y) so the camera stays steady during jumps and slides.
  camera.position.set(camX + CAMERA.offset.x, CAMERA.offset.y, p.z + CAMERA.offset.z);
  camera.lookAt(camX + CAMERA.lookAhead.x, CAMERA.lookAhead.y, p.z + CAMERA.lookAhead.z);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
  }

  environment.update(runTime, p, camera);
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
let best = loadBest();
showBest(best);

const currentDistance = () => Math.floor(-player.object.position.z);

function gameOver(reason = '') {
  isGameOver = true;
  isCaught = false;
  player.settle();
  audio.setGameOver(true);
  timeSinceGameOver = 0;
  const distance = currentDistance();
  const isNewBest = distance > best;
  if (isNewBest) {
    best = distance;
    saveBest(best);
    showBest(best);
  }
  showGameOver(distance, best, isNewBest, reason);
}

function restart() {
  isGameOver = false;
  runTime = 0;
  audio.setGameOver(false);
  hideGameOver();
  player.reset();
  track.reset();
  surge.reset();
  setAshFade(0);
  shake = 0;
}

// Any move, tap or Space on the start screen begins the first run. That
// first input is also what lets the browser start the sound (audio.js).
const START_ACTIONS = ['tap', 'jump', 'left', 'right', 'down', 'restart'];

function handleAction(action) {
  if (action === 'toggleMute') {
    toggleMute();
  } else if (isPaused) {
    // Settings are open: the game ignores everything else.
  } else if (!isStarted) {
    if (START_ACTIONS.includes(action)) {
      isStarted = true;
      hideStart();
      restart();
    }
  } else if (action === 'debugNextPhase') {
    if (DEBUG.phaseKey && !isGameOver) runTime = nextPhaseStart(runTime);
  } else if (!isGameOver && !isCaught) {
    player.handleAction(action);
  } else if ((action === 'restart' || action === 'tap') && timeSinceGameOver >= GAME.restartDelay) {
    restart();
  }
}

// Clipping the side of an obstacle makes the player stumble; running into
// one head-on ends the run.

const CRASH_REASONS = {
  SteppingStones: 'You tripped on the stepping stones',
  Rubble: 'You tripped over rubble',
  FallenBeam: 'You ran into a fallen roof beam',
  Cart: 'You ran into an abandoned cart',
  AmphoraStack: 'You ran into a stack of amphorae',
};

function checkCollisions() {
  if (player.inStumbleGrace) return;
  const hit = track.findCollision(player.hitbox);
  if (!hit) return;

  const obstacle = hit.hitbox;
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
  } else {
    runTime += dt;
    const { speedMultiplier, envIntensity } = environment.phase;
    character.setEnvIntensity?.(envIntensity); // the built-in legionary has no metal
    const zBefore = player.object.position.z;
    player.update(dt, speedMultiplier);
    audio.updateMovement(zBefore - player.object.position.z, player.isGrounded, player.isSliding);
    track.update(player.object.position.z, environment.fogDistance); // nothing is drawn beyond the fog
    updateDistance(currentDistance());
    checkCollisions();
    surge.update(dt, player.object.position, environment.phase.surgeVisibility);
  }

  // The glow at the screen edges: steady during the surge phase, stronger
  // as the cloud closes in (half as strong before the surge phase), with a
  // slow flicker.
  const surgePhase = environment.phase.surgeVisibility;
  const glow = Math.max(surgePhase * 0.35, surge.proximity * (0.5 + 0.5 * surgePhase)) * SURGE.edgeGlowMax;
  setEdgeGlow(glow * (0.9 + 0.1 * Math.sin(runTime * 5)));
  shake = Math.max(0, shake - dt * 0.6);
  audio.setRumble(environment.phase.rumbleVolume);
  audio.setRoar(isGameOver ? 0 : isCaught ? 1 : surge.proximity); // fades out on the game-over screen
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
