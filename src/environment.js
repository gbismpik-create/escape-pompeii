import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LIGHTS, GRAPHICS } from './config.js';
import { createPhaseState, updatePhaseState } from './phases.js';
import { createBackdrop } from './backdrop.js';
import { ashUniforms } from './ashShader.js';
import { ASH } from './config.js';
import { createAsh } from './ash.js';
import { SHADOW_LAYER } from './track.js';
import { isLowEnd } from './device.js';

// FogExp2 hides nearly everything (98%) beyond about 2.2 / density metres.
const FOG_REACH = 2.2;
const viewDistance = () => (isLowEnd() ? GRAPHICS.viewDistance.low : GRAPHICS.viewDistance.high);

// Sky, fog, lights, falling ash and Vesuvius, all driven by the eruption phase.

export function createEnvironment(scene, renderer) {
  const phase = createPhaseState();

  // Reflections for the legionary's metal armour: a simple lit room,
  // pre-blurred once at load by PMREMGenerator. Metal reflects its
  // surroundings, so without this the iron and brass look dark grey.
  // It is given to the character's materials only (not scene.environment):
  // in this Three.js version scene.environment also tints every Lambert
  // material, which would change the look of the whole town.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const backdrop = createBackdrop(); // sky, Vesuvius, eruption column
  let settled = 0; // how much ash has settled on the town (0–1)
  let lastRunTime = 0;

  // Exponential fog: thickens smoothly with distance, set by one density value.
  scene.fog = new THREE.FogExp2(0xffffff, 0.01);
  const ash = createAsh(scene);

  // Light from the sky above and bounced off the ground below: cheap and
  // much softer than a flat ambient light.
  const hemi = new THREE.HemisphereLight();
  scene.add(hemi);

  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.set(LIGHTS.sun.shadowMapSize, LIGHTS.sun.shadowMapSize);
  const s = LIGHTS.sun.shadowArea;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
  sun.shadow.bias = LIGHTS.sun.shadowBias;
  sun.shadow.normalBias = LIGHTS.sun.shadowNormalBias;
  sun.shadow.camera.layers.enable(SHADOW_LAYER); // the street's shadow-only copy
  scene.add(sun, sun.target); // the target must be in the scene for its position to update

  const sunOffset = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  // The surge's glow comes from behind the runner, whichever way he faces.
  const glow = new THREE.DirectionalLight(LIGHTS.glow.color, 0);
  scene.add(glow, glow.target);


  return {
    phase,
    envMap,

    // Adds Vesuvius and the eruption column once the street kit has loaded.
    addVolcano(kit) {
      backdrop.addVolcano(kit);
    },

    // Draws the sky and the volcano; the caller then draws the town on top.
    renderBackdrop(renderer) {
      backdrop.render(renderer);
    },

    // How far the camera can see through the fog (metres).
    get fogDistance() {
      return FOG_REACH / scene.fog.density;
    },

    // phaseTime: what sets the eruption phase. Endless mode: the run time.
    // Escape mode: progress along the journey (see journeyPhaseTime).
    // heading: how far the town has turned at junctions (radians). The sun,
    // Vesuvius and the sky turn with it, so they keep their real directions.
    update(runTime, playerPosition, camera, phaseTime = runTime, heading = 0) {
      updatePhaseState(phase, phaseTime);
      const p = playerPosition;

      scene.fog.color.copy(phase.skyHorizon);
      // At least thick enough to hide the end of the drawn street.
      scene.fog.density = Math.max(phase.fogDensity, FOG_REACH / viewDistance());

      // Ash settles on the town in proportion to how much is falling; a new
      // run (run time going back) starts clean.
      const falling = ash.update(runTime, camera, phase.ashRate, phase.ashColor, phase.ashWaves);
      const dt = runTime - lastRunTime;
      if (dt < 0) settled = 0;
      else settled = Math.min(ASH.maxCover, settled + dt * falling * ASH.settleRate);
      lastRunTime = runTime;
      ashUniforms.ashCover.value = settled;

      hemi.color.copy(phase.hemiSky);
      hemi.groundColor.copy(phase.hemiGround);
      hemi.intensity = phase.hemiIntensity;

      const o = LIGHTS.sun.offset;
      sun.color.copy(phase.sunColor);
      sun.intensity = phase.sunIntensity;
      sunOffset.set(o.x, o.y, o.z).applyAxisAngle(UP, heading);
      sun.position.set(sunOffset.x, sunOffset.y, p.z + sunOffset.z);
      sun.target.position.set(0, 0, p.z);

      const g = LIGHTS.glow.offset;
      glow.intensity = phase.glowIntensity;
      glow.position.set(g.x, g.y, p.z + g.z);
      glow.target.position.set(0, 0, p.z);

      backdrop.update(phase, camera, { hemi, sun }, runTime, heading);
    },
  };
}
