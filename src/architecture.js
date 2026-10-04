import * as THREE from 'three';
import { LANES, TRACK, STREET, TOWN } from './config.js';

// The town is built from just three shapes: a box, a gable roof and a
// column. Every wall, door, roof and counter is one of these, stretched,
// moved and coloured. Each shape is drawn with ONE InstancedMesh for the
// whole track, so all the buildings cost three draw calls in total.

// Distances across the street (x), measured from its centre.
export const KERB_X = (LANES.count * LANES.width) / 2; // where the pavement starts
export const FACADE_X = (TRACK.streetWidthInLanes * LANES.width) / 2; // where buildings start
const PAVE_Y = STREET.pavementHeight;

// A triangular prism: base 1 wide (x), 1 tall (y), 1 long (z), sitting on y = 0.
function createRoofGeometry() {
  const L = -0.5, R = 0.5, B = 0, T = 1, F = -0.5, K = 0.5;
  // prettier-ignore
  const v = [
    L,B,F, R,B,F, 0,T,F, // front gable
    R,B,K, L,B,K, 0,T,K, // back gable
    L,B,F, 0,T,F, 0,T,K,  L,B,F, 0,T,K, L,B,K, // left slope
    R,B,F, R,B,K, 0,T,K,  R,B,F, 0,T,K, 0,T,F, // right slope
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geometry.computeVertexNormals(); // unshared vertices → flat faces
  return geometry;
}

const GEOMETRIES = {
  box: new THREE.BoxGeometry(1, 1, 1),
  roof: createRoofGeometry(),
  column: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
};
export const KINDS = Object.keys(GEOMETRIES);

// One white material shared by all town meshes; each instance carries its own colour.
const material = new THREE.MeshLambertMaterial({ flatShading: true });

// ---------------------------------------------------------------------------
// Layouts: a variant is recorded once at load time as a list of placements
// per shape. Positions are local to the chunk: x across the street, y up,
// and "a" = metres along the chunk (0–30), which becomes z = -a.

const m4 = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const euler = new THREE.Euler();
const pos = new THREE.Vector3();
const scale = new THREE.Vector3();

export function createLayout(name) {
  const items = Object.fromEntries(KINDS.map((k) => [k, []]));
  return {
    name,
    items,
    // centre [x, y, a] (roof: y is its base), size [x, y, along], rotation [x, y, z]
    add(kind, [x, y, a], [sx, sy, sl], color, [rx, ry, rz] = [0, 0, 0]) {
      m4.compose(pos.set(x, y, -a), quat.setFromEuler(euler.set(rx, ry, rz)), scale.set(sx, sy, sl));
      items[kind].push({ matrix: m4.clone(), color: new THREE.Color(color) });
    },
  };
}

// ---------------------------------------------------------------------------
// Building kit. "side" is -1 (left of the street) or 1 (right).
// Thin details (doors, painted bands) sit on the facade, just proud of it.

const proud = (side, thickness) => side * (FACADE_X - thickness / 2);

// A plastered house: wall block, red dado band, tiled roof, door, and
// upper windows if it has two storeys.
export function house(L, { side, a, length, height, plaster, depth = 8, doorAt = 0.5, windows = height > 5.5 }) {
  L.add('box', [side * (FACADE_X + depth / 2), height / 2, a + length / 2], [depth, height, length], plaster);
  L.add('box', [proud(side, 0.06), 0.65, a + length / 2], [0.06, 1.3, length], TOWN.dado);
  L.add('roof', [side * (FACADE_X + depth / 2), height, a + length / 2], [depth + 0.8, 1.1, length + 0.3], TOWN.roof);
  door(L, side, a + length * doorAt);
  if (windows) {
    for (let w = a + 1.5; w < a + length - 1; w += 2.6) {
      L.add('box', [proud(side, 0.08), height - 1.4, w], [0.08, 0.7, 0.6], TOWN.interior);
    }
  }
}

export function door(L, side, a) {
  // Each layer sticks out a little further than the one behind it, so no two
  // faces share a plane (which would flicker).
  L.add('box', [proud(side, 0.09), 1.35, a], [0.09, 2.7, 1.8], TOWN.stucco); // frame
  L.add('box', [proud(side, 0.12), 1.2, a], [0.12, 2.4, 1.3], TOWN.wood);
}

// A shop (taberna): a wide dark opening with a wooden beam above it.
export function shop(L, { side, a, length, height, plaster, depth = 8 }) {
  L.add('box', [side * (FACADE_X + depth / 2), height / 2, a + length / 2], [depth, height, length], plaster);
  L.add('roof', [side * (FACADE_X + depth / 2), height, a + length / 2], [depth + 0.8, 1.1, length + 0.3], TOWN.roof);
  const w = length - 1.6;
  L.add('box', [proud(side, 0.1), 1.4, a + length / 2], [0.1, 2.8, w], TOWN.interior);
  L.add('box', [proud(side, 0.2), 2.95, a + length / 2], [0.2, 0.3, w + 0.4], TOWN.wood);
  L.add('box', [proud(side, 0.06), 0.65, a + 0.4], [0.06, 1.3, 0.8], TOWN.dado);
  L.add('box', [proud(side, 0.06), 0.65, a + length - 0.4], [0.06, 1.3, 0.8], TOWN.dado);
}

// A masonry shop counter on the pavement, with a marble top and the
// mouths of two big storage jars (dolia) set into it.
export function counter(L, side, a, length) {
  const x = side * (FACADE_X - 0.5);
  L.add('box', [x, PAVE_Y + 0.5, a], [0.7, 1.0, length], TOWN.dado);
  L.add('box', [x, PAVE_Y + 1.04, a], [0.8, 0.08, length + 0.1], TOWN.marble);
  for (const o of [-length / 4, length / 4]) {
    L.add('column', [x, PAVE_Y + 1.08, a + o], [0.42, 0.04, 0.42], TOWN.interior);
  }
}

// A fabric awning sloping down over the pavement, held up by two poles.
export function awning(L, side, a, length, color) {
  L.add('box', [side * (FACADE_X - 1.1), 3.1, a], [2.3, 0.06, length], color, [0, 0, side * 0.22]);
  for (const o of [-length / 2 + 0.2, length / 2 - 0.2]) {
    L.add('column', [side * (FACADE_X - 2.1), (PAVE_Y + 2.85) / 2, a + o], [0.12, 2.85 - PAVE_Y, 0.12], TOWN.wood);
  }
}

// A column: white fluted shaft with the lower third painted red, as
// on many Pompeian colonnades, with a square base and capital.
export function column(L, x, a, height) {
  const lower = height / 3;
  L.add('box', [x, 0.1, a], [0.75, 0.2, 0.75], TOWN.stucco);
  L.add('column', [x, 0.2 + lower / 2, a], [0.5, lower, 0.5], TOWN.columnRed);
  L.add('column', [x, 0.2 + lower + (height - lower) / 2, a], [0.46, height - lower, 0.46], TOWN.stucco);
  L.add('box', [x, height + 0.3, a], [0.7, 0.2, 0.7], TOWN.stucco);
}

// A covered colonnade (portico): columns along the street, a beam on top,
// a back wall with doorways, and a lean-to roof.
export function colonnade(L, { side, a, length, height, plaster, spacing = 3.3 }) {
  const colX = side * (FACADE_X + 0.6);
  const wallX = side * (FACADE_X + 4.5);
  for (let c = a + spacing / 2; c < a + length; c += spacing) column(L, colX, c, height);
  L.add('box', [colX, height + 0.65, a + length / 2], [0.8, 0.5, length], TOWN.stucco);
  L.add('box', [wallX + side * 3, (height + 1.5) / 2, a + length / 2], [6, height + 1.5, length], plaster);
  L.add('box', [wallX - side * 0.03, 0.65, a + length / 2], [0.06, 1.3, length], TOWN.dado);
  for (let d = a + spacing; d < a + length - 1; d += spacing * 2) {
    L.add('box', [wallX - side * 0.05, 1.3, d], [0.1, 2.6, 1.6], TOWN.interior);
  }
  // Roof slab from the beam up to the wall.
  const run = Math.abs(wallX - colX);
  const rise = 1.1;
  L.add('box', [(colX + wallX) / 2, height + 0.9 + rise / 2, a + length / 2], [Math.hypot(run, rise) + 0.6, 0.15, length], TOWN.roof, [0, 0, side * Math.atan2(rise, run)]);
}

// A street fountain on a corner: stone basin and a pillar with the spout.
export function fountain(L, side, a) {
  const x = side * (FACADE_X - 1.1);
  L.add('box', [x, PAVE_Y + 0.35, a], [1.3, 0.7, 1.9], TOWN.stone);
  L.add('box', [x, PAVE_Y + 0.62, a], [1.0, 0.1, 1.6], TOWN.water);
  L.add('box', [x + side * 0.55, PAVE_Y + 0.9, a], [0.35, 1.8, 0.45], TOWN.stone);
}

// A crossroads shrine (lararium): a painted niche on a corner wall.
export function shrine(L, side, a) {
  L.add('box', [proud(side, 0.1), 2.0, a], [0.1, 1.4, 1.1], TOWN.stucco);
  L.add('box', [proud(side, 0.14), 2.0, a], [0.14, 1.0, 0.8], TOWN.dado);
  L.add('box', [proud(side, 0.4), 1.3, a], [0.4, 0.1, 1.0], TOWN.stone); // altar shelf
}

// A side street leaving the main road: paving plus decorative stepping stones.
export function sideStreet(L, side, a, width) {
  L.add('box', [side * (FACADE_X + 15), 0.01, a + width / 2], [30, 0.02, width], TOWN.road.stones[1]);
  for (const o of [-1.3, 0, 1.3]) {
    L.add('column', [side * (FACADE_X + 3), 0.2, a + width / 2 + o], [0.6, 0.4, 0.9], TOWN.stone);
  }
}

// ---------------------------------------------------------------------------
// The instanced meshes. Each chunk on the track owns a fixed block of
// instances in each mesh; placing a chunk overwrites its block.

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

export function createTownMeshes(scene, layouts, chunkCount) {
  // The biggest layout decides how many instances each chunk needs.
  const perChunk = Object.fromEntries(
    KINDS.map((k) => [k, Math.max(...layouts.map((l) => l.items[k].length))]),
  );

  const meshes = Object.fromEntries(
    KINDS.map((kind) => {
      const mesh = new THREE.InstancedMesh(GEOMETRIES[kind], material, perChunk[kind] * chunkCount);
      mesh.name = `town:${kind}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Instances move all the time, so skip Three's visibility test (it
      // would need recomputing); the town is always in view anyway.
      mesh.frustumCulled = false;
      for (let i = 0; i < mesh.count; i++) {
        mesh.setMatrixAt(i, HIDDEN);
        mesh.setColorAt(i, new THREE.Color());
      }
      scene.add(mesh);
      return [kind, mesh];
    }),
  );

  const offset = new THREE.Matrix4();

  return {
    // Writes a layout into a chunk's block, shifted to world position chunkZ.
    place(chunkSlot, layout, chunkZ) {
      offset.makeTranslation(0, 0, chunkZ);
      for (const kind of KINDS) {
        const mesh = meshes[kind];
        const start = chunkSlot * perChunk[kind];
        const items = layout.items[kind];
        for (let i = 0; i < perChunk[kind]; i++) {
          const item = items[i];
          if (item) {
            mesh.setMatrixAt(start + i, m4.multiplyMatrices(offset, item.matrix));
            mesh.setColorAt(start + i, item.color);
          } else {
            mesh.setMatrixAt(start + i, HIDDEN);
          }
        }
        // Only upload the part of the buffer that changed (16 numbers per
        // matrix, 3 per colour) instead of the whole thing.
        mesh.instanceMatrix.addUpdateRange(start * 16, perChunk[kind] * 16);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.addUpdateRange(start * 3, perChunk[kind] * 3);
        mesh.instanceColor.needsUpdate = true;
      }
    },
  };
}
