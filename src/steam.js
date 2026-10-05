import * as THREE from 'three';
import { BATHS } from './config.js';

// Steam vents in the baths: a grate across the floor hisses, then breathes
// out a curtain of steam that hides what lies just beyond it, and thins away
// in good time.
//
// The rule that keeps it fair: how thick the steam is depends only on how
// many seconds he has left before the "clear point", the moment it must be
// gone (fairClear seconds before the hidden obstacle, and before he reaches
// the grate). At the clear point it is exactly zero, whatever his speed.
//
// Drawn like the ash (ash.js): soft round quads that always face the camera,
// all vents' puffs in one instanced mesh, one draw call. They live in the
// track's world group, placed with track.toWorld from path space.

const S = BATHS.steam;

const vertexShader = /* glsl */ `
  attribute vec3 offset; // the puff's centre
  attribute float size;
  attribute float alpha;
  varying vec2 vCorner;
  varying float vAlpha;
  #include <fog_pars_vertex>

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(offset, 1.0);
    mvPosition.xy += position.xy * size; // billboard
    gl_Position = projectionMatrix * mvPosition;
    vCorner = position.xy;
    // fades as it nears the camera, so it never fills the screen with a flat sheet
    vAlpha = alpha * smoothstep(0.8, 2.5, -mvPosition.z);
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 color;
  varying vec2 vCorner;
  varying float vAlpha;
  #include <fog_pars_fragment>

  void main() {
    float d = length(vCorner) * 2.0; // 0 at the centre, 1 at the edge
    float a = vAlpha * (1.0 - smoothstep(0.2, 1.0, d));
    if (a < 0.01) discard;
    gl_FragColor = vec4(color, a);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const between = ([a, b], t) => a + (b - a) * t;

// How thick a vent's steam is (0–1) with `left` seconds before its clear point.
export function steamDensity(left) {
  if (left <= 0) return 0;
  if (left < S.fade) return left / S.fade; // thinning away
  if (left < S.fade + S.hold) return 1;
  const rising = left - S.fade - S.hold; // seconds before it is at its thickest
  return rising < S.rise ? 1 - rising / S.rise : 0;
}
// Seconds before the clear point at which the hiss starts.
export const HISS_AT = S.fade + S.hold + S.rise + S.hissLead;

// track: for vents, obstacles and placing. onHiss(metresAhead): a vent starts.
export function createSteam(world, track, onHiss) {
  const max = S.vents.length * S.puffs;
  const geometry = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.attributes.position);
  const offset = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  const size = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  const alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  for (const a of [offset, size, alpha]) a.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('offset', offset);
  geometry.setAttribute('size', size);
  geometry.setAttribute('alpha', alpha);
  geometry.instanceCount = 0;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { color: { value: new THREE.Color(S.color) } }]),
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; // the puffs move every frame
  mesh.renderOrder = 2; // after the street's own see-through things
  world.add(mesh);

  // The grates: dark bronze bars across the floor, one per vent.
  const grates = new THREE.InstancedMesh(
    new THREE.BoxGeometry(S.width - 0.4, 0.03, 0.6),
    new THREE.MeshLambertMaterial({ color: 0x2b2420 }),
    S.vents.length,
  );
  grates.count = 0;
  grates.frustumCulled = false;
  grates.matrixAutoUpdate = false;
  world.add(grates);

  // Each puff's own fixed randomness: where across, how high, how big, its rhythm.
  const puffs = Array.from({ length: S.puffs }, (_, i) => ({
    x: ((i + Math.random()) / S.puffs - 0.5) * S.width,
    y: Math.random(),
    size: Math.random(),
    phase: Math.random() * Math.PI * 2,
  }));

  let vents = []; // { distance, hissed }
  let time = 0;
  const p = new THREE.Vector3();
  const w = new THREE.Vector3();
  const m = new THREE.Matrix4();

  // Where the steam of the vent at `d` must be gone (path distance).
  function clearPoint(d, speed) {
    const beyond = track.obstacleAfter(d, S.hideRange);
    const fromObstacle = (beyond ?? d) - speed * S.fairClear;
    return Math.min(fromObstacle, d - speed * S.clearBeforeGrate);
  }

  return {
    // The vents of a baths run that has just become the way (path distances), or none.
    setVents(distances) {
      vents = distances.map((distance) => ({ distance, hissed: false }));
      grates.count = vents.length;
      vents.forEach((v, i) => grates.setMatrixAt(i, m.copy(track.frameAt(v.distance)).multiply(new THREE.Matrix4().makeTranslation(0, 0.015, 0))));
      grates.instanceMatrix.needsUpdate = true;
    },

    reset() {
      this.setVents([]);
      geometry.instanceCount = 0;
    },

    // How thick the steam of each vent is now, for tests: [{ distance, density, clearAt }].
    state: [],

    update(dt, playerDistance, speed) {
      time += dt;
      let n = 0;
      this.state = [];
      for (const vent of vents) {
        if (vent.distance < playerDistance - 5) continue;
        const clearAt = clearPoint(vent.distance, speed);
        const left = (clearAt - playerDistance) / Math.max(speed, 0.1);
        if (!vent.hissed && left < HISS_AT && left > 0) {
          vent.hissed = true;
          onHiss?.(vent.distance - playerDistance);
        }
        const density = steamDensity(left);
        this.state.push({ distance: vent.distance, density, clearAt });
        if (density <= 0) continue;
        const swell = 0.6 + 0.4 * density; // grows as it billows
        for (const puff of puffs) {
          const rise = (time * 0.35 + puff.phase) % 1; // drifts up and swells, over and over
          p.set(
            puff.x + 0.25 * Math.sin(time * 0.8 + puff.phase),
            between(S.height, puff.y) * swell + rise * 0.5,
            -(vent.distance + 0.4 * Math.sin(time * 0.6 + puff.phase * 2)),
          );
          track.toWorld(p, w);
          offset.setXYZ(n, w.x, w.y, w.z);
          size.setX(n, between(S.size, puff.size) * swell * (1 + 0.3 * rise));
          alpha.setX(n, S.opacity * density * (1 - 0.5 * rise));
          n++;
        }
      }
      geometry.instanceCount = n;
      if (n) for (const a of [offset, size, alpha]) a.needsUpdate = true;
      if (vents.length && vents.every((v) => v.distance < playerDistance - 20)) this.setVents([]);
    },
  };
}
