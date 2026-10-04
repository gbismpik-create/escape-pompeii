import * as THREE from 'three';
import { KIT, GRAPHICS } from './config.js';
import { loadGLTF } from './assets.js';
import { isLowEnd } from './device.js';
import { addAshCover } from './ashShader.js';

// The Pompeii street kit: road, kerbs, houses, props and obstacles, each a
// named piece in a glTF file (made with tools/build-pompeii-kit.mjs).
//
// Each piece is turned into a list of { geometry, material } parts:
//   - geometry: plain float positions / normals / colours in the piece's
//     own space, ready to be moved and merged. (The file is compressed with
//     whole numbers and a scale; that is undone here.)
//   - material: one shared game material per kit material (stone, plaster,
//     wood, ...), so the whole street uses about seven materials.

// Copies a geometry with every attribute as plain 32-bit floats.
function toFloat(geometry) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const a = geometry.getAttribute(name);
    if (!a) continue;
    const array = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) {
      for (let c = 0; c < a.itemSize; c++) array[i * a.itemSize + c] = a.getComponent(i, c);
    }
    out.setAttribute(name, new THREE.BufferAttribute(array, a.itemSize));
  }
  if (geometry.index) out.setIndex(Array.from(geometry.index.array));
  return out;
}

// The game's version of a kit material. Phones get Lambert (cheaper);
// desktops keep MeshStandardMaterial's roughness. Metal gets reflections.
function gameMaterial(source, envMap) {
  const shared = {
    name: source.name,
    vertexColors: true,
    side: THREE.DoubleSide, // the kit has single-sided walls seen from both sides
    transparent: source.transparent,
    opacity: source.opacity,
  };
  if (isLowEnd() && GRAPHICS.lambertOnLowEnd) return addAshCover(new THREE.MeshLambertMaterial(shared));
  return addAshCover(new THREE.MeshStandardMaterial({
    ...shared,
    roughness: source.roughness,
    metalness: source.metalness,
    envMap: source.metalness > 0.3 ? envMap : null,
  }));
}

function readPieces(gltf, materials, envMap) {
  const pieces = {};
  gltf.scene.updateMatrixWorld(true);
  for (const node of gltf.scene.children) {
    const parts = [];
    node.traverse((o) => {
      if (!o.isMesh) return;
      const geometry = toFloat(o.geometry);
      geometry.applyMatrix4(o.matrixWorld); // into the piece's own space
      const name = o.material.name;
      materials[name] ??= gameMaterial(o.material, envMap);
      parts.push({ geometry, material: materials[name] });
    });
    pieces[node.name] = parts;
  }
  return pieces;
}

// Loads the full-detail and the simplified kit. envMap: reflections for metal.
export async function loadKit(envMap) {
  const [near, far] = await Promise.all([loadGLTF(KIT.file), loadGLTF(KIT.farFile)]);
  const materials = {};
  return {
    materials,
    near: readPieces(near, materials, envMap),
    far: readPieces(far, materials, envMap),
  };
}
