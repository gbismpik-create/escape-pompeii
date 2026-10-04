import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK, KIT, STREET, GRAPHICS, CAMERA } from './config.js';
import { createObstacles } from './obstacles.js';
import { isLowEnd } from './device.js';

// The endless street, built from the Pompeii kit.
//
// At load, a few street LAYOUTS are put together (road, kerbs, five houses
// a side and some props) and merged into ONE mesh per material, in two
// versions: full detail and far (simplified). That is ~7 draw calls a chunk.
//
// While running, a fixed set of chunk SLOTS is reused: when a chunk falls
// behind the player it moves to the front, takes a random layout (shown
// mirrored half the time) and new obstacles. Nothing is built during play:
// a slot just points its meshes at another layout's merged geometry.
//
// Chunks near the player show full detail, distant ones the far version,
// and chunks lost in the fog are not drawn at all. Shadows are cast by an
// invisible copy of the far version on render layer 1, which only the
// sun's shadow camera looks at (see environment.js).

export const SHADOW_LAYER = 1;

const L = TRACK.chunkLength;

// A small seeded random generator, so layouts are the same every visit.
function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// Where each piece goes in one layout, in kit space (street along +z).
function planLayout(random) {
  const placements = [
    { piece: 'Road_30m', x: 0, z: 0, angle: 0 },
    { piece: 'Kerbs_30m', x: 0, z: 0, angle: 0 },
  ];
  for (const side of [-1, 1]) {
    // Houses: no two of the same type side by side.
    let previous = null;
    for (let i = 0; i < KIT.housesPerSide; i++) {
      const choices = KIT.houses.filter((h) => h !== previous);
      const house = choices[Math.floor(random() * choices.length)];
      previous = house;
      // Built facing +z: turn -90° on the +x side and +90° on the -x side
      // so the fronts face the street.
      placements.push({ piece: house, x: side * KIT.facadeX, z: KIT.houseWidth * (i + 0.5), angle: -side * Math.PI / 2 });
    }
    // Props on the pavement, at different spots along the chunk.
    const spots = [2.5, 7.5, 12.5, 17.5, 22.5, 27.5].sort(() => random() - 0.5);
    const [min, max] = KIT.props.perSide;
    const count = min + Math.floor(random() * (max - min + 1));
    const names = Object.keys(KIT.props);
    const weights = names.map((n) => KIT.props[n][1]);
    const total = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < count; i++) {
      let r = random() * total;
      const name = names.find((n, k) => (r -= weights[k]) < 0) ?? names[0];
      placements.push({ piece: name, x: side * KIT.props[name][0], z: spots[i], angle: -side * Math.PI / 2 });
    }
  }
  return placements;
}

// Merges a layout's pieces into one geometry per material.
function mergeLayout(pieces, placements) {
  const byMaterial = new Map();
  const m = new THREE.Matrix4();
  for (const { piece, x, z, angle } of placements) {
    m.makeRotationY(angle).setPosition(x, 0, z);
    for (const part of pieces[piece] ?? []) {
      if (!byMaterial.has(part.material)) byMaterial.set(part.material, []);
      byMaterial.get(part.material).push(part.geometry.clone().applyMatrix4(m));
    }
  }
  const merged = new Map();
  for (const [material, geometries] of byMaterial) {
    const geometry = mergeGeometries(geometries);
    geometries.forEach((g) => g.dispose());
    geometry.computeBoundingSphere(); // lets Three.js skip it when off screen
    merged.set(material, geometry);
  }
  return merged;
}

// Plain ground beyond the houses, following the player.
function createGround(scene) {
  const length = (TRACK.chunksAhead + TRACK.chunksBehind + 2) * L;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(STREET.sideGroundWidth, length),
    new THREE.MeshLambertMaterial({ color: STREET.sideGroundColor }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1; // just under the road
  ground.receiveShadow = true;
  scene.add(ground);
  return {
    update(playerZ) {
      ground.position.z = playerZ - length / 2 + (TRACK.chunksBehind + 1) * L;
    },
  };
}

export function createTrack(scene, kit) {
  const chunkCount = TRACK.chunksBehind + 1 + TRACK.chunksAhead;
  const ground = createGround(scene);
  const obstacles = createObstacles(scene, chunkCount);
  const materials = Object.values(kit.materials);

  // Build the layouts once.
  const random = seeded(2024);
  const layouts = Array.from({ length: KIT.layouts }, () => {
    const plan = planLayout(random);
    return { near: mergeLayout(kit.near, plan), far: mergeLayout(kit.far, plan) };
  });

  // One slot = a group per detail level, holding one mesh per material:
  // near and far for the camera, and a far copy that only casts shadows.
  function createSlot(slot) {
    const root = new THREE.Group();
    root.rotation.y = Math.PI; // kit street runs along +z; the game runs to -z
    const lods = {};
    for (const lod of ['near', 'far', 'shadow']) {
      const group = new THREE.Group();
      group.userData.meshes = new Map(
        materials.map((material) => {
          const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
          if (lod === 'shadow') {
            mesh.castShadow = true;
            mesh.layers.set(SHADOW_LAYER); // drawn into the shadow map only
          } else {
            mesh.receiveShadow = true;
          }
          group.add(mesh);
          return [material, mesh];
        }),
      );
      root.add(group);
      lods[lod] = group;
    }
    scene.add(root);
    return { slot, index: 0, root, lods };
  }
  const chunks = Array.from({ length: chunkCount }, (_, slot) => createSlot(slot));

  function placeChunk(chunk, index) {
    chunk.index = index;
    const chunkZ = -index * L;
    chunk.root.position.z = chunkZ;
    const layout = layouts[Math.floor(Math.random() * layouts.length)];
    // Mirroring left-right doubles the variety. (The kit is double-sided, so
    // the flipped faces still draw correctly.)
    chunk.root.scale.x = Math.random() < 0.5 ? 1 : -1;
    for (const lod of ['near', 'far', 'shadow']) {
      for (const [material, mesh] of chunk.lods[lod].userData.meshes) {
        const geometry = layout[lod === 'near' ? 'near' : 'far'].get(material);
        mesh.visible = Boolean(geometry);
        if (geometry) mesh.geometry = geometry;
      }
    }
    obstacles.fill(chunk.slot, chunkZ);
  }

  function reset() {
    obstacles.reset();
    chunks.forEach((chunk, i) => placeChunk(chunk, i - TRACK.chunksBehind));
  }
  reset();

  const detailDistance = isLowEnd() ? GRAPHICS.detailDistance.low : GRAPHICS.detailDistance.high;

  return {
    reset,

    findCollision(hitbox) {
      return obstacles.findCollision(hitbox);
    },

    // fogDistance: beyond this, the fog hides everything (metres).
    update(playerZ, fogDistance = Infinity) {
      ground.update(playerZ);
      const playerIndex = Math.floor(-playerZ / L);
      // Recycle every chunk that is now too far behind.
      while (chunks[0].index < playerIndex - TRACK.chunksBehind) {
        const chunk = chunks.shift();
        placeChunk(chunk, chunks[chunks.length - 1].index + 1);
        chunks.push(chunk);
      }
      // Detail level by distance from the camera; hide chunks lost in the fog.
      const cameraZ = playerZ + CAMERA.offset.z;
      for (const chunk of chunks) {
        const start = -chunk.index * L; // the chunk spans start .. start - L
        const distance = Math.max(0, cameraZ - start, start - L - cameraZ);
        chunk.root.visible = distance < fogDistance;
        chunk.lods.near.visible = distance < detailDistance;
        chunk.lods.far.visible = !chunk.lods.near.visible;
        chunk.lods.shadow.visible = distance < GRAPHICS.shadowDistance;
      }
    },
  };
}
