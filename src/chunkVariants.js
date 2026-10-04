// Layouts for the street chunks. Each variant is just data: a list of boxes.
// The track reuses the same meshes and rearranges them to match a variant.
//
// Box fields:
//   side   -1 = left of the street, 1 = right
//   z      where the box starts, in metres from the chunk's start (0–30)
//   length size along the street (metres)
//   height
//   depth  size away from the street (default BUILDINGS.defaultDepth)
//   inset  gap between the street edge and the box (default 0)
//   shade  index into BUILDINGS.colors (default 0)

// Helper: a row of buildings on one side. Each entry is [z, length, height, shade].
const row = (side, entries) =>
  entries.map(([z, length, height, shade = 0]) => ({ side, z, length, height, shade }));

// Helper: a line of thin columns, like a colonnade along a forum.
const colonnade = (side, count, spacing, height) =>
  Array.from({ length: count }, (_, i) => ({
    side,
    z: 1 + i * spacing,
    length: 0.6,
    depth: 0.6,
    inset: 1,
    height,
    shade: 2,
  }));

export const CHUNK_VARIANTS = [
  // 1. Row houses: an unbroken wall of buildings of mixed heights.
  [
    ...row(-1, [[0, 6, 5], [6, 5, 7, 1], [11, 7, 4.5], [18, 6, 6, 2], [24, 6, 8, 1]]),
    ...row(1, [[0, 7, 6, 1], [7, 6, 4], [13, 5, 8, 2], [18, 8, 5], [26, 4, 6.5, 1]]),
  ],

  // 2. Alleys: taller buildings with gaps between them.
  [
    ...row(-1, [[0, 8, 7], [11, 9, 9, 1], [23, 7, 6, 2]]),
    ...row(1, [[2, 10, 5, 2], [15, 6, 10], [24, 6, 5.5, 1]]),
  ],

  // 3. Forum: a colonnade with a low wall behind on the left, one long building on the right.
  [
    ...colonnade(-1, 10, 3, 5),
    { side: -1, z: 0, length: 30, height: 3, inset: 4, depth: 6, shade: 1 },
    { side: 1, z: 0, length: 30, height: 9, depth: 10 },
  ],
];
