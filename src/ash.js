import * as THREE from 'three';
import { ASH } from './config.js';

// Falling ash: one tiny square per flake, all drawn together with
// instancing (one shape, many copies, one draw call).
//
// The flakes never get moved by JavaScript. Each flake only has a fixed
// random "seed" position; the GPU works out where it is every frame from
// the seed, the time and the camera position. A flake that leaves the box
// around the camera wraps round to the other side, so the box is always
// full of ash wherever the player runs, at zero CPU cost.
//
// The phase's ash rate just changes how many flakes are drawn.

const vertexShader = /* glsl */ `
  attribute vec3 seed; // per flake, each 0–1
  uniform float time;
  uniform vec3 boxCentre;
  uniform vec3 boxSize;
  uniform float fallSpeed;
  uniform float drift;
  uniform float size;
  uniform float nearFade;
  varying vec2 vCorner;
  varying float vNearFade;
  #include <fog_pars_vertex>

  void main() {
    vec3 p = seed * boxSize;
    p.y -= time * fallSpeed * (0.6 + 0.8 * seed.x); // some flakes fall faster
    p.x += sin(time * 0.9 + seed.y * 40.0) * drift;  // gentle swaying
    p.z += cos(time * 0.7 + seed.x * 40.0) * drift;
    // Wrap into the box around the camera.
    p = mod(p - boxCentre + boxSize * 0.5, boxSize) - boxSize * 0.5 + boxCentre;

    // Billboard: offset the corners in view space so flakes always face the camera.
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    mvPosition.xy += position.xy * size * (0.5 + seed.z);
    gl_Position = projectionMatrix * mvPosition;
    vCorner = position.xy;
    vNearFade = smoothstep(nearFade * 0.4, nearFade, -mvPosition.z);
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 color;
  uniform float opacity;
  varying vec2 vCorner;
  varying float vNearFade;
  #include <fog_pars_fragment>

  void main() {
    float alpha = opacity * vNearFade * smoothstep(0.5, 0.25, length(vCorner)); // soft round flake
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function createAsh(scene) {
  const geometry = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.attributes.position);

  const seeds = new Float32Array(ASH.maxParticles * 3);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 3));
  geometry.instanceCount = 0;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        time: { value: 0 },
        boxCentre: { value: new THREE.Vector3() },
        boxSize: { value: new THREE.Vector3(ASH.box.x, ASH.box.y, ASH.box.z) },
        fallSpeed: { value: ASH.fallSpeed },
        drift: { value: ASH.drift },
        size: { value: ASH.size },
        nearFade: { value: ASH.nearFade },
        color: { value: new THREE.Color() },
        opacity: { value: ASH.opacity },
      },
    ]),
    transparent: true,
    depthWrite: false, // flakes don't hide each other
    fog: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; // positions are only known on the GPU
  scene.add(mesh);

  const u = material.uniforms;
  return {
    update(time, camera, rate, color) {
      u.time.value = time;
      u.boxCentre.value.copy(camera.position).add(ASH.boxOffset);
      u.color.value.copy(color);
      geometry.instanceCount = Math.round(ASH.maxParticles * THREE.MathUtils.clamp(rate, 0, 1));
    },
  };
}
