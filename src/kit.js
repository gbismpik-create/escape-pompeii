import * as THREE from 'three';
import { KIT, GRAPHICS } from './config.js';
import { loadGLTF } from './assets.js';
import { isLowEnd } from './device.js';
import { addAshCover } from './ashShader.js';

// The Pompeii street kit: road, kerbs, houses, props and obstacles, each a
// named piece in a glTF file (made with tools/build-pompeii-kit.mjs).
// The HD street (tools/build-street-hd.mjs) is read in on top: its road,
// kerbs, painted house fronts, props and some obstacles replace the old
// pieces of the same name. Its materials are painted textures, which a
// mesh shows through its UVs (texture coordinates: for each vertex, which
// point of the picture lies there).
//
// Each piece is turned into a list of { geometry, material } parts:
//   - geometry: plain float positions / normals / colours in the piece's
//     own space, ready to be moved and merged. (The file is compressed with
//     whole numbers and a scale; that is undone here.)
//   - material: one shared game material per kit material (stone, plaster,
//     wood, ...), so the whole street uses about seven materials.

// Copies a geometry with every attribute as plain 32-bit floats. UVs are
// kept only for textured materials (the old kit has some it doesn't use,
// and every part merged into one mesh must have the same attributes).
function toFloat(geometry, textured) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color', ...(textured ? ['uv'] : [])]) {
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
    color: source.color,
    map: source.map, // the painted texture (HD street), else none
    normalMap: source.normalMap, // the HD street's water ripples
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

// prefix: added to material names, so files whose materials share a name
// (both kits have 'plaster') keep their own.
function readPieces(gltf, materials, envMap, prefix = '') {
  const pieces = {};
  gltf.scene.updateMatrixWorld(true);
  for (const node of gltf.scene.children) {
    const parts = [];
    node.traverse((o) => {
      if (!o.isMesh) return;
      // The HD street's untextured, non-metal materials differ only in
      // roughness: one material for all of them saves draw calls.
      const plain = prefix && !o.material.map && !o.material.normalMap && o.material.metalness < 0.3;
      const name = prefix + (plain ? 'plain' : o.material.name);
      const material = (materials[name] ??= gameMaterial(o.material, envMap));
      const geometry = toFloat(o.geometry, Boolean(material.map || material.normalMap));
      geometry.applyMatrix4(o.matrixWorld); // into the piece's own space
      parts.push({ geometry, material });
    });
    pieces[node.name] = parts;
  }
  return pieces;
}

// Loads the full-detail and the simplified kit, with the statues of the gods
// as more pieces (their own files). envMap: reflections for metal.
export async function loadKit(envMap) {
  const files = [KIT.file, KIT.farFile, KIT.statuesFile, KIT.statuesFarFile, KIT.streetFile, KIT.streetFarFile];
  const [near, far, statues, statuesFar, street, streetFar] = await Promise.all(files.map(loadGLTF));
  const materials = {};
  // The far street has no textures of its own: it takes the near one's
  // materials (same names), so it must be read after it.
  const streetNear = readPieces(street, materials, envMap, 'street:');
  return {
    materials,
    near: { ...readPieces(near, materials, envMap), ...readPieces(statues, materials, envMap), ...streetNear },
    far: { ...readPieces(far, materials, envMap), ...readPieces(statuesFar, materials, envMap), ...readPieces(streetFar, materials, envMap, 'street:') },
  };
}
