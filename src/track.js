import * as THREE from 'three';
import { LANES, TRACK, STREET, TOWN } from './config.js';
import { CHUNK_LAYOUTS } from './chunkVariants.js';
import { KERB_X, FACADE_X, createTownMeshes } from './architecture.js';
import { createObstacles } from './obstacles.js';
import { createRoadTexture } from './textures.js';

// The road, pavements and ground: long strips that follow the player.
// They move in whole road-tile steps, so the paving appears to stream past
// even though the strips stay under the player. One draw call each.
function createStreetSurface(scene) {
  const behind = 40;
  const ahead = (TRACK.chunksAhead + 1) * TRACK.chunkLength;
  const length = behind + ahead;
  const centreZ = (behind - ahead) / 2; // relative to the player
  const group = new THREE.Group();

  const roadTexture = createRoadTexture();
  roadTexture.repeat.set(LANES.count, length / LANES.width);
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(LANES.count * LANES.width, length),
    new THREE.MeshLambertMaterial({ map: roadTexture }),
  );
  road.rotation.x = -Math.PI / 2; // planes stand upright by default; lay it flat
  road.position.z = centreZ;
  road.receiveShadow = true;
  group.add(road);

  const pavementWidth = FACADE_X - KERB_X;
  const pavementMaterial = new THREE.MeshLambertMaterial({ color: TOWN.pavement });
  const pavementGeometry = new THREE.BoxGeometry(pavementWidth, STREET.pavementHeight, length);
  for (const side of [-1, 1]) {
    const pavement = new THREE.Mesh(pavementGeometry, pavementMaterial);
    pavement.position.set(side * (KERB_X + pavementWidth / 2), STREET.pavementHeight / 2, centreZ);
    pavement.receiveShadow = true;
    group.add(pavement);
  }

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(STREET.sideGroundWidth, length),
    new THREE.MeshLambertMaterial({ color: TOWN.sideGround }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, centreZ); // just under the road
  ground.receiveShadow = true;
  group.add(ground);

  scene.add(group);
  return {
    update(playerZ) {
      group.position.z = Math.round(playerZ / LANES.width) * LANES.width;
    },
  };
}

// The endless track. Chunk number i covers z from -i·L to -(i+1)·L.
// A fixed set of chunk slots is reused: when one falls behind the player,
// it moves to the front with a new random layout and new obstacles.
// Nothing is created during play; existing instances are just rewritten.
export function createTrack(scene) {
  const L = TRACK.chunkLength;
  const chunkCount = TRACK.chunksBehind + 1 + TRACK.chunksAhead;
  const surface = createStreetSurface(scene);
  const town = createTownMeshes(scene, CHUNK_LAYOUTS, chunkCount);
  const obstacles = createObstacles(scene, chunkCount);

  // Ordered from furthest behind to furthest ahead; `slot` is the chunk's
  // fixed block of instances, `index` its current place along the track.
  const chunks = Array.from({ length: chunkCount }, (_, slot) => ({ slot, index: 0 }));

  function placeChunk(chunk, index) {
    chunk.index = index;
    const chunkZ = -index * L;
    const layout = CHUNK_LAYOUTS[Math.floor(Math.random() * CHUNK_LAYOUTS.length)];
    town.place(chunk.slot, layout, chunkZ);
    obstacles.fill(chunk.slot, chunkZ);
  }

  // Lays every chunk out fresh from the start line (used for new runs).
  function reset() {
    obstacles.reset();
    chunks.forEach((chunk, i) => placeChunk(chunk, i - TRACK.chunksBehind));
  }
  reset();

  return {
    reset,

    collides(hitbox) {
      return obstacles.collides(hitbox);
    },

    distanceToNearestObstacle(z) {
      return obstacles.distanceToNearest(z);
    },

    update(playerZ) {
      surface.update(playerZ);
      const playerIndex = Math.floor(-playerZ / L);
      // Recycle every chunk that is now too far behind.
      while (chunks[0].index < playerIndex - TRACK.chunksBehind) {
        const chunk = chunks.shift();
        placeChunk(chunk, chunks[chunks.length - 1].index + 1);
        chunks.push(chunk);
      }
    },
  };
}
