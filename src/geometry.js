import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Helpers for building low-poly models out of simple shapes.
//
// Each shape is painted with a colour stored on its vertices, then all the
// shapes of one part are merged into a single geometry. One geometry with one
// material = one draw call, however many shapes it was made from.

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();

// A box of the given size, centred at [x, y, z], optionally rotated [rx, ry, rz].
export function box(size, position, color, rotation = [0, 0, 0]) {
  return place(new THREE.BoxGeometry(...size), position, color, rotation);
}

// A cylinder (radius at top and bottom, height, number of sides).
export function cylinder(rTop, rBottom, height, sides, position, color, rotation = [0, 0, 0]) {
  return place(new THREE.CylinderGeometry(rTop, rBottom, height, sides), position, color, rotation);
}

function place(geometry, [x, y, z], color, [rx, ry, rz]) {
  tmpQuat.setFromEuler(tmpEuler.set(rx, ry, rz));
  geometry.applyMatrix4(tmpMatrix.compose(new THREE.Vector3(x, y, z), tmpQuat, new THREE.Vector3(1, 1, 1)));
  const c = new THREE.Color(color);
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// Merges a list of shapes into one geometry.
export function merge(shapes) {
  const merged = mergeGeometries(shapes);
  shapes.forEach((s) => s.dispose());
  return merged;
}
