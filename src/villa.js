import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VILLA, AMPHITHEATRE, GRAPHICS } from './config.js';
import { loadGLTF } from './assets.js';
import { isLowEnd } from './device.js';

// The rich house (domus) the runner can cut through: one model
// (tools/build-villa.mjs), already merged into one mesh per material.
// Unlike the street kit it is textured: frescoes, mosaics, marble, leaves.
//
// The model runs along +z from its street door (z = 0) to its back door
// (z = VILLA.length), lanes at x = -1.8, 0, 1.8. It carries its own list of
// obstacles ({ type, lane 0..2, z0, z1, act: 'jump' | 'dodge' | 'none' }).

// See-through: inside the house the camera, behind and above the runner,
// would often look through a tree, a column or a roof. Every villa material
// cuts a hole along the line from the camera to the runner (a cone, wider
// at his end), above his floor, and clears what hangs overhead just ahead
// of him, so he and the way ahead stay in view.
// main.js sets the camera and runner positions each frame.
export const seeThrough = {
  seeCamera: { value: new THREE.Vector3() },
  seeRunner: { value: new THREE.Vector3(0, -1e6, 0) }, // (far away until set: no hole)
  seeFloor: { value: 0 },
  seeRadius: { value: new THREE.Vector2(VILLA.seeThrough.nearRadius, VILLA.seeThrough.farRadius) },
  // overhead ahead: [metres ahead, half width, height above the floor]
  seeAhead: { value: new THREE.Vector3(VILLA.seeThrough.ahead, VILLA.seeThrough.aheadHalfWidth, VILLA.seeThrough.headroom) },
};

function addSeeThrough(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, seeThrough);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeeWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSeeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vSeeWorld;
        uniform vec3 seeCamera;
        uniform vec3 seeRunner;
        uniform float seeFloor;
        uniform vec2 seeRadius;
        uniform vec3 seeAhead;`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        {
          vec3 line = seeRunner - seeCamera;
          float len = length(line);
          vec3 dir = line / len;
          vec3 rel = vSeeWorld - seeCamera;
          float t = dot(rel, dir); // how far along the line, from the camera
          // a dithered rim so the hole's edge isn't a hard line
          float dither = fract(dot(gl_FragCoord.xy, vec2(0.5, 0.25)) + 0.125 * mod(gl_FragCoord.y, 2.0));
          if (t > 0.0 && t < len - 0.6 && vSeeWorld.y > seeFloor + 0.3) {
            float r = mix(seeRadius.x, seeRadius.y, t / len);
            float d = length(rel - dir * t);
            if (d < r * (0.8 + 0.2 * dither)) discard;
          }
          // and overhead just ahead of him, below the camera: vines, branches, lintels
          vec2 forward = normalize(line.xz);
          vec2 fromRunner = vSeeWorld.xz - seeRunner.xz;
          float ahead = dot(fromRunner, forward);
          float side = abs(fromRunner.x * forward.y - fromRunner.y * forward.x);
          if (ahead > -0.6 && ahead < seeAhead.x && side < seeAhead.y * (0.85 + 0.15 * dither) && vSeeWorld.y > seeFloor + seeAhead.z && vSeeWorld.y < seeCamera.y + 0.2) discard; // (higher up, nothing hides the way)
        }`,
      );
  };
  material.customProgramCacheKey = () => 'villa-see-through';
  return material;
}

// The game's version of a villa material: Lambert on phones (cheaper), with
// the texture, vertex colours and see-through leaf edges kept.
function gameMaterial(source, envMap) {
  const shared = {
    name: source.name,
    map: source.map,
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
  };
  if (isLowEnd() && GRAPHICS.lambertOnLowEnd) return new THREE.MeshLambertMaterial(shared);
  return new THREE.MeshStandardMaterial({
    ...shared,
    normalMap: source.normalMap,
    normalScale: source.normalScale,
    roughness: source.roughness,
    metalness: source.metalness,
    envMap: source.metalness > 0.3 ? envMap : null,
  });
}

// Positions only, as plain floats in the villa's own space (for the shadow copy).
function positionsOnly(mesh) {
  const a = mesh.geometry.getAttribute('position');
  const array = new Float32Array(a.count * 3);
  for (let i = 0; i < a.count; i++) for (let c = 0; c < 3; c++) array[i * 3 + c] = a.getComponent(i, c);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(array, 3));
  if (mesh.geometry.index) g.setIndex(Array.from(mesh.geometry.index.array));
  return g.applyMatrix4(mesh.matrixWorld);
}

// Loads a set piece built like the villa (one mesh per material, its route
// and obstacles in the root's extras): { meshes, shadowGeometry, obstacles, route }.
// noShadow: materials that cast no shadow (flat ground).
export async function loadSetPiece(file, rootName, envMap, noShadow = []) {
  const gltf = await loadGLTF(file);
  const root = gltf.scene.getObjectByName(rootName) ?? gltf.scene;
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  for (const mesh of meshes) mesh.material = addSeeThrough(gameMaterial(mesh.material, envMap));
  // Leaves and grass are cut out by their textures; their square cards
  // would cast square shadows, so they don't cast any.
  const solid = meshes.filter((m) => !m.material.alphaTest && !m.material.transparent && !noShadow.includes(m.material.name));
  const shadowGeometry = mergeGeometries(solid.map(positionsOnly));
  return { meshes, shadowGeometry, obstacles: root.userData.obstacles ?? [], route: root.userData.routeY ?? null };
}

// The rich house (domus).
export const loadVilla = (envMap) => loadSetPiece(VILLA.file, 'Pompeii_Villa', envMap);

// The amphitheatre (tools/build-amphitheatre.mjs): its ground, plaza and
// arena sand cast no shadows.
export const loadAmphitheatre = (envMap) => loadSetPiece(AMPHITHEATRE.file, 'Pompeii_Amphitheatre', envMap, ['grass', 'gravel', 'sand']);
