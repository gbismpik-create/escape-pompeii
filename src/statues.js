import * as THREE from 'three';
import { STATUES, TRACK } from './config.js';

// Statues on pedestals along the street (models from the street kit).
//
// The track tells us about each chunk it lays (place) and frees (release).
// A statue is due every STATUES.spacing metres along the path; it goes on a
// free pavement spot of the first chunk that reaches that distance (a
// street's spot without a prop, or a crossroads corner).
//
// A small pool of statues is reused: each is a pedestal and a figure,
// pointed at the kit's merged geometry for its type. They live in the
// track's turning world group, placed in their chunk's frame.

const TYPES = Object.keys(STATUES.types);
const POOL = 4; // statues are 150 m+ apart, so few are ever near
const L = TRACK.chunkLength;
const randomSpacing = () => STATUES.spacing[0] + Math.random() * (STATUES.spacing[1] - STATUES.spacing[0]);

function partsMesh(parts) {
  const group = new THREE.Group();
  for (const { geometry, material } of parts) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

export function createStatues(world, kit) {
  for (const type of [...TYPES, 'Pedestal']) if (!kit.near[type]) throw new Error(`The street kit has no "${type}"`);
  // One figure group per type per pool slot is wasteful; instead each pool
  // slot holds one group per type and shows the one it needs.
  const pool = Array.from({ length: POOL }, () => {
    const root = new THREE.Group();
    root.add(partsMesh(kit.near.Pedestal));
    const figures = {};
    for (const type of TYPES) {
      const figure = partsMesh(kit.near[type]);
      figure.position.y = STATUES.pedestalHeight;
      figure.visible = false;
      root.add(figure);
      figures[type] = figure;
    }
    root.visible = false;
    world.add(root);
    return { root, figures, active: false, type: null, distance: 0, slot: -1, side: 1, passed: false };
  });

  let nextDistance = randomSpacing();

  function free(statue) {
    statue.active = false;
    statue.root.visible = false;
    statue.figures[statue.type].visible = false;
  }

  return {
    reset() {
      for (const s of pool) if (s.active) free(s);
      nextDistance = randomSpacing();
    },

    // The track laid a path chunk: { slot, distance, matrix, heading, mirrored }
    // with its layout's free spots ({ side, z } in kit space). Puts the next
    // statue here if it is due within this chunk.
    place(chunk, spots) {
      const due = nextDistance - chunk.distance; // metres into this chunk
      if (due >= L) return;
      const spot = spots.filter((s) => s.z >= due).sort((a, b) => a.z - b.z)[0];
      if (!spot) return;
      const statue = pool.find((s) => !s.active);
      if (!statue) return;
      statue.active = true;
      statue.passed = false;
      statue.slot = chunk.slot;
      statue.type = TYPES[Math.floor(Math.random() * TYPES.length)];
      statue.distance = chunk.distance + spot.z;
      // Kit space → the chunk's game frame: the street turned 180° (and
      // mirrored if the chunk is), so x and z swap sign.
      statue.side = -spot.side * (chunk.mirrored ? -1 : 1);
      const local = new THREE.Vector3(statue.side * STATUES.pavementX, STATUES.pavementHeight, -spot.z);
      statue.root.position.copy(local.applyMatrix4(chunk.matrix));
      // Face the road: the figure is built facing +z.
      statue.root.rotation.y = -statue.side * (Math.PI / 2) + (chunk.heading * Math.PI) / 2;
      statue.root.visible = true;
      statue.figures[statue.type].visible = true;
      nextDistance = statue.distance + randomSpacing();
    },

    // The statues standing now ({ type, distance, side }), for tests and tools.
    list() {
      return pool.filter((s) => s.active).map(({ type, distance, side }) => ({ type, distance, side }));
    },

    // The track freed a chunk slot.
    release(slot) {
      for (const s of pool) if (s.active && s.slot === slot) free(s);
    },

    // Each frame. Returns the type of an intact statue the runner has just
    // passed (for the Museum), or null.
    update(playerDistance) {
      for (const s of pool) {
        if (s.active && !s.passed && playerDistance > s.distance) {
          s.passed = true;
          return s.type;
        }
      }
      return null;
    },
  };
}

// Small pictures of each statue for the Museum, drawn once with the game's
// renderer into an off-screen target and copied to image URLs.
export function renderStatuePictures(renderer, kit, size = [160, 200]) {
  const [w, h] = size;
  const target = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2420);
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x4a3a2c, 2.2));
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.2);
  sun.position.set(2, 4, 4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 50);
  camera.position.set(1.6, 2.4, 5.6);
  camera.lookAt(0, 1.75, 0);
  const pixels = new Uint8Array(w * h * 4);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const pictures = {};
  const previousTarget = renderer.getRenderTarget();
  for (const type of TYPES) {
    const statue = partsMesh(kit.near.Pedestal);
    const figure = partsMesh(kit.near[type]);
    figure.position.y = STATUES.pedestalHeight;
    statue.add(figure);
    statue.rotation.y = -0.35;
    scene.add(statue);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, w, h, pixels);
    scene.remove(statue);
    // WebGL rows run bottom to top; the canvas's top to bottom.
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) image.data.set(pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    ctx.putImageData(image, 0, 0);
    pictures[type] = canvas.toDataURL('image/png');
  }
  renderer.setRenderTarget(previousTarget);
  target.dispose();
  return pictures;
}
