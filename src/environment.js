import * as THREE from 'three';
import { LIGHTS, SKY, VESUVIUS } from './config.js';
import { createPhaseState, updatePhaseState } from './phases.js';
import { createVesuvius } from './vesuvius.js';

// Sky, fog, lights and Vesuvius, all driven by the eruption phase.

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

export function createEnvironment(scene) {
  const phase = createPhaseState();

  const sky = createSkyDome();
  scene.add(sky);

  scene.fog = new THREE.Fog(0xffffff, 10, 100);

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
  scene.add(sun, sun.target); // the target must be in the scene for its position to update

  const glow = new THREE.DirectionalLight(LIGHTS.glow.color, 0);
  scene.add(glow, glow.target);

  const vesuvius = createVesuvius();
  scene.add(vesuvius.mesh);
  const angle = THREE.MathUtils.degToRad(VESUVIUS.angle);

  return {
    phase,

    update(runTime, playerPosition, camera) {
      updatePhaseState(phase, runTime);
      const p = playerPosition;

      sky.position.copy(camera.position);
      sky.material.uniforms.topColor.value.copy(phase.skyTop);
      sky.material.uniforms.horizonColor.value.copy(phase.skyHorizon);

      scene.fog.color.copy(phase.skyHorizon);
      scene.fog.near = phase.fogNear;
      scene.fog.far = phase.fogFar;

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
