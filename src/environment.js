import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LIGHTS, SKY, VESUVIUS, GRAPHICS } from './config.js';
import { createPhaseState, updatePhaseState } from './phases.js';
import { createVesuvius } from './vesuvius.js';
import { createAsh } from './ash.js';
import { SHADOW_LAYER } from './track.js';
import { isLowEnd } from './device.js';

// FogExp2 hides nearly everything (98%) beyond about 2.2 / density metres.
const FOG_REACH = 2.2;
const viewDistance = () => (isLowEnd() ? GRAPHICS.viewDistance.low : GRAPHICS.viewDistance.high);

// Sky, fog, lights, falling ash and Vesuvius, all driven by the eruption phase.

// A big sphere around the camera, painted on the inside with a gradient
// from the horizon colour up to the top colour. Drawn first, behind everything.
function createSkyDome() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color() },
      horizonColor: { value: new THREE.Color() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      varying vec3 vDirection;
      void main() {
        float up = pow(max(vDirection.y, 0.0), 0.5);
        gl_FragColor = vec4(mix(horizonColor, topColor, up), 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide, // we're inside the sphere
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY.radius, 24, 12), material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

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

  const sky = createSkyDome();
  scene.add(sky);

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

  const glow = new THREE.DirectionalLight(LIGHTS.glow.color, 0);
  scene.add(glow, glow.target);

  const vesuvius = createVesuvius();
  scene.add(vesuvius.mesh);
  const angle = THREE.MathUtils.degToRad(VESUVIUS.angle);

  return {
    phase,
    envMap,

    // How far the camera can see through the fog (metres).
    get fogDistance() {
      return FOG_REACH / scene.fog.density;
    },

    update(runTime, playerPosition, camera) {
      updatePhaseState(phase, runTime);
      const p = playerPosition;

      sky.position.copy(camera.position);
      sky.material.uniforms.topColor.value.copy(phase.skyTop);
      sky.material.uniforms.horizonColor.value.copy(phase.skyHorizon);

      scene.fog.color.copy(phase.skyHorizon);
      // At least thick enough to hide the end of the drawn street.
      scene.fog.density = Math.max(phase.fogDensity, FOG_REACH / viewDistance());

      ash.update(runTime, camera, phase.ashRate, phase.ashColor);

      hemi.color.copy(phase.hemiSky);
      hemi.groundColor.copy(phase.hemiGround);
      hemi.intensity = phase.hemiIntensity;

      const o = LIGHTS.sun.offset;
      sun.color.copy(phase.sunColor);
      sun.intensity = phase.sunIntensity;
      sun.position.set(o.x, o.y, p.z + o.z);
      sun.target.position.set(0, 0, p.z);

      const g = LIGHTS.glow.offset;
      glow.intensity = phase.glowIntensity;
      glow.position.set(g.x, g.y, p.z + g.z);
      glow.target.position.set(0, 0, p.z);

      // Vesuvius keeps its place on the horizon as the player runs.
      vesuvius.mesh.position.set(
        Math.sin(angle) * VESUVIUS.distance,
        -4,
        p.z - Math.cos(angle) * VESUVIUS.distance,
      );
      vesuvius.setHaze(phase.skyHorizon, phase.distantHaze);
    },
  };
}
