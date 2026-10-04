import './style.css';
import * as THREE from 'three';
import { RENDERER, CAMERA, GAME, DEBUG } from './config.js';
import { createPlayer } from './player.js';
import { createTrack } from './track.js';
import { createEnvironment } from './environment.js';
import { nextPhaseStart } from './phases.js';
import { consumeActions } from './input.js';
import { updateDistance, showBest, showGameOver, hideGameOver } from './ui.js';
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
const environment = createEnvironment(scene);
const track = createTrack(scene);
const player = createPlayer(scene);

function updateFollowers() {
  const p = player.object.position;

  const camX = p.x * CAMERA.sideFollow;
  // Height is fixed (not p.y) so the camera stays steady during jumps and slides.
  camera.position.set(camX + CAMERA.offset.x, CAMERA.offset.y, p.z + CAMERA.offset.z);
  camera.lookAt(camX + CAMERA.lookAhead.x, CAMERA.lookAhead.y, p.z + CAMERA.lookAhead.z);

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
let best = loadBest();
showBest(best);

const currentDistance = () => Math.floor(-player.object.position.z);

function gameOver() {
  isGameOver = true;
  timeSinceGameOver = 0;
  const distance = currentDistance();
  const isNewBest = distance > best;
  if (isNewBest) {
    best = distance;
    saveBest(best);
    showBest(best);
  }
  showGameOver(distance, best, isNewBest);
}

function restart() {
  isGameOver = false;
  runTime = 0;
  hideGameOver();
  player.reset();
  track.reset();
}

function handleAction(action) {
  if (action === 'debugNextPhase') {
    if (DEBUG.phaseKey && !isGameOver) runTime = nextPhaseStart(runTime);
  } else if (!isGameOver) {
    player.handleAction(action);
  } else if ((action === 'restart' || action === 'tap') && timeSinceGameOver >= GAME.restartDelay) {
    restart();
  }
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
  } else {
    runTime += dt;
    player.update(dt, environment.phase.speedMultiplier);
    track.update(player.object.position.z);
    updateDistance(currentDistance());
    if (track.collides(player.hitbox)) gameOver();
  }

  updateFollowers();

  renderer.render(scene, camera);
});
