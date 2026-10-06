import * as THREE from 'three';
import { FINALE, LANES } from './config.js';

// The shore at Stabiae (the finale's end): one set piece placed at the
// finish, where the runner reaches the boats. A boat drawn up ahead of each
// lane, more along the sand, the grey sea beyond and the fleet's galleys
// riding offshore in the ash haze. The boat he leaps into pushes off with
// him aboard (depart).
//
// Built in the path's frame at the finish: x across, forward is -z (so the
// sea lies towards -z), y up from the sand.

const B = FINALE.beach;
const TURN = Math.PI; // kit pieces run along +z; the way to the sea is -z
const SEA_LEVEL = -0.05;

function pieceGroup(parts) {
  const group = new THREE.Group();
  for (const { geometry, material } of parts) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

// The sea: a wide plane from the waterline out, rippled a little, paler
// where the waves break on the sand, darkening offshore.
function createSea() {
  const geometry = new THREE.PlaneGeometry(700, 400, 60, 40).rotateX(-Math.PI / 2).translate(0, 0, -200);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const foam = new THREE.Color(0xe2ded2), near = new THREE.Color(0x24302f), far = new THREE.Color(0x121819), c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    const out = -z; // metres from the waterline
    // (just above the plain ground the game lays under everything, at -0.1)
    position.setY(i, SEA_LEVEL + 0.03 * Math.sin(x * 0.35 + z * 0.8) * Math.min(1, out / 6));
    c.copy(near).lerp(far, Math.min(1, out / 120));
    if (out < 3.5) c.lerp(foam, Math.max(0, 1 - Math.abs(out - 1) / 1.5)); // the surf line
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const sea = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
  sea.receiveShadow = true;
  return sea;
}

// frameAt(s): the path's frame s metres along it.
export function createBeach(world, kit, frameAt) {
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  group.visible = false;
  world.add(group);

  const sea = createSea();
  sea.position.z = -B.shore;
  group.add(sea);

  // A boat ahead of each lane: its stern towards the runner, bow to the sea.
  const laneBoats = Array.from({ length: LANES.count }, (_, lane) => {
    const boat = pieceGroup(kit.near.Boat_Small);
    boat.position.set((lane - (LANES.count - 1) / 2) * LANES.width, 0, -B.boatAt);
    boat.rotation.y = TURN;
    group.add(boat);
    return boat;
  });
  for (const [x, z, turn] of B.sideBoats) {
    const boat = pieceGroup(kit.far.Boat_Small);
    boat.position.set(x, 0, -z);
    boat.rotation.y = TURN + turn;
    group.add(boat);
  }
  const galleys = B.galleys.map(([x, out, turn]) => {
    const galley = pieceGroup(kit.far.Galley);
    galley.position.set(x, -0.6, -B.shore - out);
    galley.rotation.y = Math.PI / 2 + turn; // broadside on, riding at anchor
    group.add(galley);
    return galley;
  });

  // Pliny's boat, afloat off the shore; he is put aboard once his model loads (setPliny).
  const P = B.pliny;
  const plinyBoat = pieceGroup(kit.near.Boat_Small);
  plinyBoat.position.set(P.boat[0], SEA_LEVEL - 0.2, -P.boat[1]);
  plinyBoat.rotation.y = TURN + P.boat[2];
  group.add(plinyBoat);
  let pliny = null;

  let sailing = null; // the boat pulling away, or null
  let time = 0;

  return {
    // The finish (path distance) where the runner reaches the boats.
    place(finish) {
      group.matrix.copy(frameAt(finish));
      group.matrixWorldNeedsUpdate = true;
      group.visible = true;
      laneBoats.forEach((boat, lane) => boat.position.set((lane - (LANES.count - 1) / 2) * LANES.width, 0, -B.boatAt));
      sailing = null;
    },

    // Pliny the Elder: stands at the stern of his boat facing the beach, so he
    // looks towards the runner coming down to the boats.
    setPliny(model) {
      pliny = model;
      pliny.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      // the boat's deck is about 0.52 m up; the stern is towards the beach (+z here)
      const stern = new THREE.Vector3(0, 0.55, -P.standAt).applyAxisAngle(new THREE.Vector3(0, 1, 0), plinyBoat.rotation.y);
      pliny.position.copy(plinyBoat.position).add(stern);
      pliny.rotation.y = Math.atan2(-pliny.position.x, 12 - pliny.position.z); // face a point on the beach where the runner arrives
      group.add(pliny);
    },

    hide() {
      group.visible = false;
      sailing = null;
    },

    // The boat ahead of a lane (x across the path) pushes off. Returns it.
    depart(x) {
      const lane = THREE.MathUtils.clamp(Math.round(x / LANES.width + (LANES.count - 1) / 2), 0, LANES.count - 1);
      sailing = laneBoats[lane];
      return sailing;
    },

    // Galleys and boats rock on the swell; the boat pulling away gathers
    // speed. Returns how far it moved this frame (metres towards the sea).
    update(dt, sailSpeed = 0) {
      if (!group.visible) return 0;
      time += dt;
      galleys.forEach((g, i) => {
        g.rotation.z = 0.025 * Math.sin(time * 0.7 + i * 2);
        g.position.y = -0.6 + 0.12 * Math.sin(time * 0.9 + i);
      });
      // his boat rides the swell, and he with it
      plinyBoat.position.y = SEA_LEVEL - 0.2 + 0.05 * Math.sin(time * 1.4 + 1);
      plinyBoat.rotation.z = 0.035 * Math.sin(time * 1.1 + 2);
      if (pliny) pliny.position.y = plinyBoat.position.y + 0.55, pliny.rotation.z = plinyBoat.rotation.z * 0.6;
      if (!sailing) return 0;
      const moved = sailSpeed * dt;
      sailing.position.z -= moved;
      // settling into the water once past the waterline, then riding the swell
      sailing.position.y = (SEA_LEVEL - 0.2) * THREE.MathUtils.clamp((-sailing.position.z - B.shore) / 3, 0, 1) + 0.04 * Math.sin(time * 1.6);
      sailing.rotation.z = 0.03 * Math.sin(time * 1.3);
      return moved;
    },
  };
}
