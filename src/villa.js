import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VILLA, GRAPHICS } from './config.js';
import { loadGLTF } from './assets.js';
import { isLowEnd } from './device.js';

// The rich house (domus) the runner can cut through: one model
// (tools/build-villa.mjs), already merged into one mesh per material.
// Unlike the street kit it is textured: frescoes, mosaics, marble, leaves.
//
// The model runs along +z from its street door (z = 0) to its back door
// (z = VILLA.length), lanes at x = -1.8, 0, 1.8. It carries its own list of
// obstacles ({ type, lane 0..2, z0, z1, act: 'jump' | 'dodge' | 'none' }).

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

// Loads the villa: { meshes, shadowGeometry, obstacles }.
export async function loadVilla(envMap) {
  const gltf = await loadGLTF(VILLA.file);
  const root = gltf.scene.getObjectByName('Pompeii_Villa') ?? gltf.scene;
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  for (const mesh of meshes) mesh.material = gameMaterial(mesh.material, envMap);
  // Leaves and grass are cut out by their textures; their square cards
  // would cast square shadows, so they don't cast any.
  const solid = meshes.filter((m) => !m.material.alphaTest && !m.material.transparent);
  const shadowGeometry = mergeGeometries(solid.map(positionsOnly));
  return { meshes, shadowGeometry, obstacles: root.userData.obstacles ?? [] };
}
