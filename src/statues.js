import * as THREE from 'three';
import { STATUES, TRACK, GRAPHICS } from './config.js';
import { isLowEnd } from './device.js';

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
//
// In the later eruption phases some topple (STATUES.toppleChance): a shadow
// shows on the road where the figure will land, then it tips forward off
// its pedestal and lies across one lane as an obstacle.

const TYPES = STATUES.types;
const POOL = 4; // statues are 150 m+ apart, so few are ever near
const L = TRACK.chunkLength;
const ROAD_Y = -STATUES.pavementHeight; // the road, from the pedestal's foot
const WHITE = new THREE.Color(1, 1, 1);
const SHADOW = new THREE.Color().setScalar(STATUES.shadowDarkness);
const randomSpacing = () => STATUES.spacing[0] + Math.random() * (STATUES.spacing[1] - STATUES.spacing[0]);

// near and far: the kit's full and simplified versions. Both go in one
// group; update() shows one or the other by distance (like the street).
function partsMesh(parts, farParts = null) {
  const group = new THREE.Group();
  if (farParts) {
    group.userData.lod = { near: partsMesh(parts), far: partsMesh(farParts) };
    group.add(group.userData.lod.near, group.userData.lod.far);
    return group;
  }
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
      const figure = partsMesh(kit.near[type], kit.far[type] ?? kit.near[type]);
      figure.position.y = STATUES.pedestalHeight;
      figure.visible = false;
      root.add(figure);
      figures[type] = figure;
    }
    // The landing shadow: darkens the road under it (see falling.js).
    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: WHITE.clone(),
      blending: THREE.CustomBlending,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.SrcColorFactor,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const f = STATUES.fallen;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(f.halfWidth * 3.4, f.to - f.from + 0.4).rotateX(-Math.PI / 2), shadowMaterial);
    shadow.position.set(0, ROAD_Y + 0.02, (f.from + f.to) / 2);
    shadow.visible = false;
    root.add(shadow);
    root.visible = false;
    world.add(root);
    return {
      root, figures, shadow, active: false, type: null, distance: 0, slot: -1, side: 1,
      // toppling: 'standing' | 'warning' | 'falling' | 'down'
      willTopple: false, state: 'standing', time: 0, hitbox: new THREE.Box3(),
    };
  });
  const pivot = new THREE.Vector3();
  const corner = new THREE.Vector3();

  let nextDistance = randomSpacing();
  const detailDistance = isLowEnd() ? GRAPHICS.detailDistance.low : GRAPHICS.detailDistance.high;

  function free(statue) {
    statue.active = false;
    statue.root.visible = false;
    standUp(statue);
    statue.figures[statue.type].visible = false;
  }

  function standUp(statue) {
    const figure = statue.figures[statue.type];
    if (figure) {
      figure.rotation.set(0, 0, 0);
      figure.position.set(0, STATUES.pedestalHeight, 0);
    }
    statue.state = 'standing';
    statue.shadow.visible = false;
  }

  // The figure tips forward (towards the road) about the front of its
  // feet, dropping from the pedestal to the road as it goes. k: 0 → 1.
  function poseFall(statue, k) {
    const figure = statue.figures[statue.type];
    const ease = k * k; // speeds up, like something falling
    pivot.set(0, THREE.MathUtils.lerp(STATUES.pedestalHeight, ROAD_Y + 0.12, ease), THREE.MathUtils.lerp(0.1, STATUES.fallen.from, k));
    figure.rotation.x = (Math.PI / 2) * ease;
    // Keep the foot of the figure at the pivot: offset back by the rotated foot point.
    figure.position.copy(pivot).sub(corner.set(0, 0, 0.1).applyEuler(figure.rotation));
  }

  // The fallen figure's box, in the world group's space (quarter turns
  // only, so it stays an exact box).
  function setHitbox(statue) {
    const f = STATUES.fallen;
    statue.root.updateMatrix();
    statue.hitbox.min.set(-f.halfWidth, ROAD_Y, f.from);
    statue.hitbox.max.set(f.halfWidth, ROAD_Y + f.height, f.to);
    statue.hitbox.applyMatrix4(statue.root.matrix);
  }

  return {
    reset() {
      for (const s of pool) if (s.active) free(s);
      nextDistance = randomSpacing();
    },

    // The track laid a path chunk: { slot, distance, matrix, heading, mirrored }
    // with its layout's free spots ({ side, z } in kit space). Puts the next
    // statue here if it is due within this chunk. Returns its path distance
    // if it may topple (the track keeps obstacle rows away), else null.
    place(chunk, spots) {
      const due = nextDistance - chunk.distance; // metres into this chunk
      if (due >= L) return null;
      const spot = spots.filter((s) => s.z >= due).sort((a, b) => a.z - b.z)[0];
      if (!spot) return null;
      const statue = pool.find((s) => !s.active);
      if (!statue) return null;
      statue.active = true;
      statue.slot = chunk.slot;
      statue.type = TYPES[Math.floor(Math.random() * TYPES.length)];
      statue.willTopple = chunk.kind === 'street' && Math.random() < STATUES.toppleChance;
      standUp(statue);
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
      return statue.willTopple ? statue.distance : null;
    },

    // The statues standing now ({ type, distance, side, willTopple, state }), for tests and tools.
    list() {
      return pool.filter((s) => s.active).map(({ type, distance, side, willTopple, state }) => ({ type, distance, side, willTopple, state }));
    },

    // Path distances of statues that may topple (kept clear of falling tiles).
    toppleDistances() {
      return pool.filter((s) => s.active && s.willTopple).map((s) => s.distance);
    },

    // A fallen statue touching the box (world-group space), or null.
    findCollision(box) {
      for (const s of pool) if (s.active && s.state === 'down' && s.hitbox.intersectsBox(box)) return { type: 'FallenStatue', move: 'jump', hitbox: s.hitbox };
      return null;
    },

    // The fallen statues as obstacles ({ type, move, hitbox, distance }), for tests.
    fallen() {
      return pool.filter((s) => s.active && s.state === 'down').map((s) => ({ type: 'FallenStatue', move: 'jump', hitbox: s.hitbox, distance: s.distance }));
    },

    // The track freed a chunk slot.
    release(slot) {
      for (const s of pool) if (s.active && s.slot === slot) free(s);
    },

    // Each frame. speed: the runner's (m/s). canTopple: the eruption is in a
    // toppling phase. isClear(distance): nothing else is near that spot.
    // onLand(position in world-group space): the figure hit the road.
    update(dt, playerDistance, speed, canTopple, isClear, onLand) {
      for (const s of pool) {
        if (!s.active) continue;
        const ahead = s.distance - playerDistance;
        // Full detail close by, the simplified version further away.
        const lod = s.figures[s.type].userData.lod;
        lod.near.visible = Math.abs(ahead) < detailDistance;
        lod.far.visible = !lod.near.visible;
        if (s.state === 'standing' && s.willTopple && canTopple && ahead > 0 && ahead < speed * STATUES.triggerTime) {
          if (isClear(s.distance)) {
            s.state = 'warning';
            s.time = 0;
            s.shadow.visible = true;
          } else {
            s.willTopple = false; // too close to something else: it stays up
          }
        }
        if (s.state === 'warning' || s.state === 'falling') {
          s.time += dt;
          // The shadow darkens through the warning.
          s.shadow.material.color.lerpColors(WHITE, SHADOW, Math.min(1, s.time / STATUES.warningTime));
          // It rocks on its pedestal, more and more, before it goes.
          if (s.state === 'warning') s.figures[s.type].rotation.x = Math.sin(s.time * 22) * STATUES.wobble * (s.time / STATUES.warningTime);
          if (s.state === 'warning' && s.time >= STATUES.warningTime) s.state = 'falling';
          if (s.state === 'falling') {
            const k = Math.min(1, (s.time - STATUES.warningTime) / STATUES.fallTime);
            poseFall(s, k);
            if (k >= 1) {
              s.state = 'down';
              s.shadow.visible = false;
              setHitbox(s);
              onLand?.(corner.set(0, ROAD_Y, (STATUES.fallen.from + STATUES.fallen.to) / 2).applyMatrix4(s.root.matrix));
            }
          }
        }
      }
    },
  };
}
