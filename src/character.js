import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHARACTER, LEGIONARY, PLAYER, STUMBLE } from './config.js';
import { createLegionary } from './legionary.js';

// The player's model: a skinned glTF legionary played with an
// AnimationMixer, with short cross-fades between Run, Jump, Slide and
// Stumble (and Idle on the game-over screen). It only shows the player; collisions use the player's own
// hitbox (player.js), never the model.

// Phones and tablets (touch screens) get the low-poly file, and so do very
// weak computers; other desktops get the detailed one.
function prefersLowPoly() {
  if (CHARACTER.quality !== 'auto') return CHARACTER.quality === 'low';
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  const weak = (navigator.hardwareConcurrency ?? 8) <= 2 || (navigator.deviceMemory ?? 8) <= 2; // deviceMemory: Chrome only
  return touch || weak;
}

// Loads the right model for this device. If the low-poly file is missing,
// tries the detailed one; if no file loads, uses the built-in procedural
// legionary, so the game always has a player.
// envMap: reflections for the armour (see environment.js).
export async function loadCharacter(envMap) {
  const urls = prefersLowPoly() ? [CHARACTER.lowModel, CHARACTER.hdModel] : [CHARACTER.hdModel];
  const loader = new GLTFLoader();
  for (const url of urls) {
    try {
      return createCharacter(await loader.loadAsync(url), envMap);
    } catch (error) {
      console.warn(`Could not load ${url}.`, error);
    }
  }
  console.warn('Using the built-in legionary instead.');
  return createLegionary();
}

// Seconds a jump spends in the air: up and down under gravity.
const AIR_TIME = 2 * Math.sqrt((2 * PLAYER.jumpHeight) / PLAYER.gravity);

function createCharacter(gltf, envMap) {
  // The game uses this one loaded copy. (A skinned model must be copied
  // with SkeletonUtils.clone(), not .clone(), if that is ever needed.)
  const model = gltf.scene;
  model.rotation.y = CHARACTER.facing;
  const shinyMaterials = new Set();
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    if (o.material.isMeshStandardMaterial) {
      o.material.envMap = envMap;
      shinyMaterials.add(o.material);
    }
    // Animated limbs move outside the bounding box Three.js computes from
    // the resting pose; skip its visibility test so they never flicker out.
    o.frustumCulled = false;
  });

  // root: moved by the player; leans into lane changes. model: animated.
  const root = new THREE.Group();
  root.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const clip = (name) => {
    const c = THREE.AnimationClip.findByName(gltf.animations, name);
    if (!c) throw new Error(`Model has no "${name}" animation`);
    return c;
  };
  const actions = {
    run: mixer.clipAction(clip('Run')),
    jump: mixer.clipAction(clip('Jump')),
    slide: mixer.clipAction(clip('Slide')),
    stumble: mixer.clipAction(clip('Stumble')),
    idle: mixer.clipAction(clip('Idle')),
  };
  for (const name of ['jump', 'slide', 'stumble']) {
    actions[name].setLoop(THREE.LoopOnce, 1);
    actions[name].clampWhenFinished = true; // hold the last pose, don't snap back
  }
  // Stretch the one-off clips to match the game's timings.
  actions.jump.timeScale = (clip('Jump').duration * (1 - CHARACTER.jumpClipStart)) / AIR_TIME;
  actions.slide.timeScale = clip('Slide').duration / PLAYER.slideDuration;
  actions.stumble.timeScale = clip('Stumble').duration / STUMBLE.duration;

  const runDuration = clip('Run').duration;

  // Bones corrected during the slide (see CHARACTER.slidePoseFix).
  const bones = {};
  model.traverse((o) => o.isBone && (bones[o.name] = o));
  const slideFixes = Object.entries(CHARACTER.slidePoseFix)
    .filter(([name]) => bones[name])
    .map(([name, rotation]) => ({
      bone: bones[name],
      rotation: new THREE.Euler(...rotation),
      applied: new THREE.Quaternion(), // the correction currently on the bone
    }));
  const fixEuler = new THREE.Euler();

  // How far into its low pose the slide is (0–1): the clip goes down over
  // its first ~20% and back up over its last ~20%.
  function slideDepth() {
    const t = actions.slide.time / actions.slide.getClip().duration;
    const ease = (x) => THREE.MathUtils.smoothstep(x, 0, 1);
    return Math.min(ease(t / 0.2), ease((1 - t) / 0.2)) * actions.slide.getEffectiveWeight();
  }
  let current = null;
  let stumbleTimeLeft = 0;

  // Advances the animation by dt. The mixer only rewrites a bone when its
  // animated value changes, so last frame's slide correction is taken off
  // first (otherwise it would pile up while the slide pose is held), then
  // this frame's is added on top.
  function step(dt) {
    for (const fix of slideFixes) fix.bone.quaternion.multiply(fix.applied.invert());
    mixer.update(dt);
    const depth = slideDepth();
    for (const fix of slideFixes) {
      const r = fix.rotation;
      fix.applied.setFromEuler(fixEuler.set(r.x * depth, r.y * depth, r.z * depth));
      fix.bone.quaternion.multiply(fix.applied);
    }
  }

  function play(name, fade) {
    if (current === name) return;
    const next = actions[name];
    next.reset(); // start from the beginning (also clears any fade-out)
    if (name === 'jump') next.time = next.getClip().duration * CHARACTER.jumpClipStart;
    next.setEffectiveWeight(1);
    next.fadeIn(fade).play();
    if (current) actions[current].fadeOut(fade);
    current = name;
  }

  function reset() {
    mixer.stopAllAction();
    for (const fix of slideFixes) {
      fix.bone.quaternion.multiply(fix.applied.invert()); // take any correction off
      fix.applied.identity();
    }
    current = null;
    stumbleTimeLeft = 0;
    root.rotation.set(0, 0, 0);
    play('run', 0);
  }
  reset();

  return {
    root,

    // Dim the armour's reflections as the sky darkens (from the phase).
    setEnvIntensity(value) {
      for (const material of shinyMaterials) material.envMapIntensity = value;
    },

    stumble() {
      stumbleTimeLeft = STUMBLE.duration;
      current = null; // force a fresh start even if already stumbling
      play('stumble', CHARACTER.stumbleFade);
    },

    reset,

    // Game over: settle into the Idle animation (breathing, looking about).
    idle() {
      play('idle', CHARACTER.idleFade);
      root.rotation.set(0, 0, 0);
    },

    // Keeps the animation moving while the game itself is paused (game over).
    tick(dt) {
      step(dt);
    },

    // Same inputs as the procedural legionary: { moved, grounded, sliding, sideSpeed }
    update(dt, { moved, grounded, sliding, sideSpeed }) {
      stumbleTimeLeft = Math.max(0, stumbleTimeLeft - dt);
      const wanted = stumbleTimeLeft > 0 ? 'stumble' : sliding ? 'slide' : !grounded ? 'jump' : 'run';
      if (wanted !== 'stumble') play(wanted, CHARACTER.crossFade);

      // Legs keep pace with the ground: one Run cycle per runCycleLength metres.
      const speed = dt > 0 ? moved / dt : 0;
      actions.run.timeScale = (speed * runDuration) / CHARACTER.runCycleLength;
      step(dt);

      // Lane change: lean into the turn and look where he is going.
      const k = 1 - Math.exp(-LEGIONARY.poseBlendSpeed * dt);
      const lean = THREE.MathUtils.clamp(-sideSpeed * LEGIONARY.sideLeanAmount, -LEGIONARY.maxSideLean, LEGIONARY.maxSideLean);
      root.rotation.z += (lean - root.rotation.z) * k;
      root.rotation.y += (lean * 0.6 - root.rotation.y) * k;
    },
  };
}
