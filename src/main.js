import './style.css';
import * as THREE from 'three';
import { RENDERER, CAMERA, GAME, DEBUG, STUMBLE, SURGE } from './config.js';
import { createPlayer } from './player.js';
import { loadCharacter } from './character.js';
import { createTrack } from './track.js';
import { createEnvironment } from './environment.js';
import { nextPhaseStart } from './phases.js';
import { createTiles } from './tiles.js';
import { speedAt } from './speed.js';
import { consumeActions } from './input.js';
import { updateDistance, showBest, showGameOver, hideGameOver, setEdgeGlow, setAshFade } from './ui.js';
import { createSurge } from './surge.js';
import { isSideClip } from './obstacles.js';
import { loadBest, saveBest } from './storage.js';

const canvas = document.getElementById('game');

// Renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDERER.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

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
const track = createTrack(scene);
const character = await loadCharacter(environment.envMap);
const player = createPlayer(scene, character);
const tiles = createTiles(scene, track);
const surge = createSurge(scene);
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
  hideGameOver();
  player.reset();
  track.reset();
  tiles.reset();
  surge.reset();
  setAshFade(0);
  shake = 0;
}

function handleAction(action) {
  if (action === 'debugNextPhase') {
    if (DEBUG.phaseKey && !isGameOver) runTime = nextPhaseStart(runTime);
  } else if (!isGameOver && !isCaught) {
    player.handleAction(action);
  } else if ((action === 'restart' || action === 'tap') && timeSinceGameOver >= GAME.restartDelay) {
    restart();
  }
}

// Clipping the side of an obstacle makes the player stumble; running into
// one head-on ends the run. (Falling tiles are only atmosphere: they can't hit.)

const CRASH_REASONS = {
  low: 'You tripped on a stepping stone',
  bar: 'You ran into a fallen roof beam',
  block: 'You ran into a collapsed wall',
};

function checkCollisions() {
  if (player.inStumbleGrace) return;
  const hit = track.findCollision(player.hitbox);
  if (!hit) return;

  const obstacle = hit.hitbox;
  if (!isSideClip(player.previousHitbox, player.hitbox, obstacle)) {
    gameOver(CRASH_REASONS[hit.type]);
    return;
  }
  player.stumble((obstacle.min.x + obstacle.max.x) / 2);
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

  if (isGameOver) {
    timeSinceGameOver += dt; // the world freezes; only the overlay is live
  } else if (isCaught) {
    // The cloud rolls over the player and the screen fades to ash.
    surge.update(dt, player.object.position, 1);
    setAshFade(surge.caughtProgress);
    if (surge.caughtProgress >= 1) gameOver('The surge caught up with you');
  } else {
    runTime += dt;
    const { speedMultiplier, tileRate, envIntensity } = environment.phase;
    character.setEnvIntensity?.(envIntensity); // the built-in legionary has no metal
    player.update(dt, speedMultiplier);
    track.update(player.object.position.z);
    const speed = speedAt(currentDistance()) * speedMultiplier;
    tiles.update(dt, player.object.position, speed, tileRate);
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

  updateFollowers();

  renderer.render(scene, camera);
});
