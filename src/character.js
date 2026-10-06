import * as THREE from 'three';
import { CHARACTER, LEGIONARY, PLAYER, STUMBLE } from './config.js';
import { createLegionary } from './legionary.js';
import { loadGLTF } from './assets.js';
import { isLowEnd } from './device.js';

// The player's model: a skinned glTF legionary played with an
// AnimationMixer, with short cross-fades between Run, Jump, Slide and
// Stumble (and Idle on the game-over screen). It only shows the player; collisions use the player's own
// hitbox (player.js), never the model.

// Loads the right model for this device. If the low-poly file is missing,
// tries the detailed one; if no file loads, uses the built-in procedural
// legionary, so the game always has a player.
// envMap: reflections for the armour (see environment.js).
export async function loadCharacter(envMap) {
  const urls = isLowEnd() ? [CHARACTER.lowModel, CHARACTER.hdModel] : [CHARACTER.hdModel];
  for (const url of urls) {
    try {
      return createCharacter(await loadGLTF(url), envMap);
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

  // The raised-shield pose (see CHARACTER.shieldPose). Each frame the
  // bones are slerped from the animation's rotation towards these by
  // shieldWeight. saved holds the animation's own rotation, put back before
  // the mixer runs (like the slide correction above).
  const shieldBones = Object.entries(CHARACTER.shieldPose)
    .filter(([name]) => bones[name])
    .map(([name, rotation]) => ({
      bone: bones[name],
      target: new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      saved: new THREE.Quaternion(),
    }));
  const scutum = bones.Scutum;
  const scutumRest = scutum?.position.clone();
  const scutumRaised = new THREE.Vector3(...CHARACTER.shieldOffset);
  let shieldWeight = 0; // 0 = lowered, 1 = fully raised

  // How far into its low pose the slide is (0–1): the clip goes down over
  // its first ~20% and back up over its last ~20%.
  function slideDepth() {
    const t = actions.slide.time / actions.slide.getClip().duration;
    const ease = (x) => THREE.MathUtils.smoothstep(x, 0, 1);
    return Math.min(ease(t / 0.2), ease((1 - t) / 0.2)) * actions.slide.getEffectiveWeight();
  }
  let current = null;
  let stumbleTimeLeft = 0;

  // ---- Looks (the shop's characters). A tint recolours the legionary's
  // materials (placeholders); a body is another model shown instead of his,
  // moved as a whole (it has no skeleton): a running bob, a lean, a crouch.
  const materials = {};
  model.traverse((o) => {
    if (o.isMesh && !materials[o.material.name]) {
      const m = o.material;
      materials[m.name] = { material: m, original: { color: m.color.clone(), vertexColors: m.vertexColors, metalness: m.metalness, roughness: m.roughness } };
    }
  });
  let body = null; // { object, phase }
  function setLook({ tint = null, bodyModel = null } = {}) {
    for (const { material, original } of Object.values(materials)) {
      material.color.copy(original.color);
      material.metalness = original.metalness;
      material.roughness = original.roughness;
      if (material.vertexColors !== original.vertexColors) {
        material.vertexColors = original.vertexColors;
        material.needsUpdate = true; // the shader is rebuilt with or without vertex colours
      }
    }
    for (const [name, value] of Object.entries(tint ?? {})) {
      const entry = materials[name];
      if (!entry) continue;
      const [color, metalness] = Array.isArray(value) ? value : [value];
      const m = entry.material;
      m.color.set(color);
      if (metalness !== undefined) {
        m.metalness = metalness;
        m.roughness = metalness > 0.3 ? 0.35 : 0.8;
      }
      if (m.vertexColors) {
        m.vertexColors = false; // the painted colours would tint the new one
        m.needsUpdate = true;
      }
    }
    if (body) root.remove(body.object);
    body = bodyModel ? { object: bodyModel, phase: 0 } : null;
    if (body) {
      body.object.rotation.y = CHARACTER.facing;
      body.object.traverse((o) => o.isMesh && (o.castShadow = true));
      root.add(body.object);
    }
    model.visible = !body;
  }
  // The whole-body motion of a body without a skeleton.
  function moveBody(dt, moved, grounded, sliding) {
    if (!body) return;
    const o = body.object;
    body.phase += (moved / CHARACTER.runCycleLength) * Math.PI * 4; // two bobs a cycle, one per step
    const k = 1 - Math.exp(-12 * dt);
    const bob = grounded && !sliding ? Math.abs(Math.sin(body.phase)) * 0.06 : 0;
    o.position.y += (bob - o.position.y) * k;
    o.scale.y += ((sliding ? 0.55 : 1) - o.scale.y) * k; // crouched under a beam
    o.rotation.x += ((sliding ? -0.35 : grounded ? -0.08 : -0.25) - o.rotation.x) * k; // leaning into the run
    o.rotation.z = Math.sin(body.phase / 2) * 0.03;
  }

  // Advances the animation by dt. The mixer only rewrites a bone when its
  // animated value changes, so last frame's slide correction is taken off
  // first (otherwise it would pile up while the slide pose is held), then
  // this frame's is added on top.
  function step(dt) {
    for (const s of shieldBones) s.bone.quaternion.copy(s.saved);
    for (const fix of slideFixes) fix.bone.quaternion.multiply(fix.applied.invert());
    mixer.update(dt);
    const depth = slideDepth();
    for (const fix of slideFixes) {
      const r = fix.rotation;
      fix.applied.setFromEuler(fixEuler.set(r.x * depth, r.y * depth, r.z * depth));
      fix.bone.quaternion.multiply(fix.applied);
    }
    // Slerp: a smooth blend between two rotations, here from the animation
    // towards the shield pose. Eased, so the arm swings rather than slides.
    const w = THREE.MathUtils.smoothstep(shieldWeight, 0, 1);
    for (const s of shieldBones) {
      s.saved.copy(s.bone.quaternion);
      if (w > 0) s.bone.quaternion.slerp(s.target, w);
    }
    if (scutum) scutum.position.lerpVectors(scutumRest, scutumRaised, w);
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
    shieldWeight = 0;
    root.rotation.set(0, 0, 0);
    play('run', 0);
  }
  reset();

  return {
    root,
    setLook,

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

    // Turning at a junction: the model faces yaw radians off the street
    // for a moment and swings round (main.js eases yaw back to 0).
    setTurn(yaw) {
      model.rotation.y = CHARACTER.facing + yaw;
      if (body) body.object.rotation.y = CHARACTER.facing + yaw;
    },

    // Game over: settle into the Idle animation (breathing, looking about).
    idle() {
      shieldWeight = 0;
      play('idle', CHARACTER.idleFade);
      root.rotation.set(0, 0, 0);
    },

    // Keeps the animation moving while the game itself is paused (game over).
    tick(dt) {
      step(dt);
    },

    // Same inputs as the procedural legionary: { moved, grounded, sliding, sideSpeed, shieldRaised }
    update(dt, { moved, grounded, sliding, sideSpeed, shieldRaised }) {
      const shieldStep = dt / CHARACTER.shieldBlendTime;
      shieldWeight = THREE.MathUtils.clamp(shieldWeight + (shieldRaised ? shieldStep : -shieldStep), 0, 1);
      stumbleTimeLeft = Math.max(0, stumbleTimeLeft - dt);
      const wanted = stumbleTimeLeft > 0 ? 'stumble' : sliding ? 'slide' : !grounded ? 'jump' : 'run';
      if (wanted !== 'stumble') play(wanted, CHARACTER.crossFade);

      // Legs keep pace with the ground: one Run cycle per runCycleLength metres.
      const speed = dt > 0 ? moved / dt : 0;
      actions.run.timeScale = (speed * runDuration) / CHARACTER.runCycleLength;
      step(dt);
      moveBody(dt, moved, grounded, sliding);

      // Lane change: lean into the turn and look where he is going.
      const k = 1 - Math.exp(-LEGIONARY.poseBlendSpeed * dt);
      const lean = THREE.MathUtils.clamp(-sideSpeed * LEGIONARY.sideLeanAmount, -LEGIONARY.maxSideLean, LEGIONARY.maxSideLean);
      root.rotation.z += (lean - root.rotation.z) * k;
      root.rotation.y += (lean * 0.6 - root.rotation.y) * k;
    },
  };
}
