import * as THREE from 'three';
import { LEGIONARY, STUMBLE } from './config.js';
import { box, cylinder, merge } from './geometry.js';

// A low-poly Roman legionary, built from boxes, with a procedural run cycle.
//
// The body is a small hierarchy of pivots (joints). Each pivot rotates, and
// everything attached to it follows, just like a real skeleton:
//
//   root (feet on the ground)
//   └─ body (leans for slides and lane changes)
//      └─ pelvis (hip height; bobs while running)
//         ├─ torso (waist joint) ─ head, helmet, arms (shoulder → elbow)
//         └─ legs (hip → knee)
//
// He faces -z (down the track), so the camera sees his back.

const C = LEGIONARY.colors;
const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

const HIP_Y = 0.9;
const THIGH = 0.42;
const SHIN = 0.4;

function part(shapes, parent, position = [0, 0, 0]) {
  const mesh = new THREE.Mesh(merge(shapes), material);
  mesh.castShadow = true;
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function buildLeg(pelvis, side) {
  // Thigh hangs down from the hip joint; mostly covered by the tunic.
  const thigh = part(
    [
      box([0.15, THIGH, 0.17], [0, -THIGH / 2, 0], C.skin),
      box([0.17, 0.12, 0.19], [0, -0.06, 0], C.tunic), // tunic hem over the thigh
    ],
    pelvis,
    [side * 0.11, 0, 0],
  );
  // Shin + sandal (caliga) with straps, hanging from the knee.
  const shin = part(
    [
      box([0.12, SHIN, 0.13], [0, -SHIN / 2, 0], C.skin),
      box([0.13, 0.04, 0.14], [0, -SHIN * 0.55, 0], C.leather), // straps
      box([0.13, 0.04, 0.14], [0, -SHIN * 0.8, 0], C.leather),
      box([0.13, 0.07, 0.26], [0, -SHIN - 0.03, -0.05], C.leather), // sandal, toes forward (-z)
    ],
    thigh,
    [0, -THIGH, 0],
  );
  return { thigh, shin };
}

function buildArm(torso, side) {
  const upper = part(
    [
      box([0.11, 0.26, 0.12], [0, -0.13, 0], C.skin),
      box([0.14, 0.12, 0.15], [0, -0.05, 0], C.tunic), // short sleeve
    ],
    torso,
    [side * 0.3, 0.42, 0],
  );
  const fore = part(
    [
      box([0.1, 0.24, 0.11], [0, -0.12, 0], C.skin),
      box([0.11, 0.08, 0.12], [0, -0.2, 0], C.leather), // bracer
      box([0.1, 0.09, 0.1], [0, -0.28, 0], C.skin), // hand
    ],
    upper,
    [0, -0.26, 0],
  );
  return { upper, fore };
}

function buildTorso(pelvis) {
  const s = [];
  // Lorica segmentata: steel hoops, alternating shades so the bands read from behind.
  for (let i = 0; i < 4; i++) {
    s.push(box([0.42 - i * 0.01, 0.09, 0.27], [0, 0.06 + i * 0.09, 0], i % 2 ? C.steelDark : C.steel));
  }
  s.push(box([0.44, 0.1, 0.28], [0, 0.42, 0], C.steel)); // chest plate
  for (const side of [-1, 1]) {
    s.push(box([0.17, 0.06, 0.3], [side * 0.27, 0.47, 0], C.steel)); // shoulder guards
    s.push(box([0.16, 0.05, 0.29], [side * 0.29, 0.42, 0], C.steelDark));
  }
  s.push(box([0.09, 0.08, 0.09], [0, 0.52, 0], C.skin)); // neck
  s.push(box([0.2, 0.21, 0.21], [0, 0.66, -0.01], C.skin)); // head
  // Galea (helmet): bowl, brow ridge, cheek guards, wide neck guard, crest.
  s.push(box([0.24, 0.12, 0.25], [0, 0.76, 0], C.steel));
  s.push(box([0.25, 0.03, 0.04], [0, 0.71, -0.125], C.bronze)); // brow ridge
  for (const side of [-1, 1]) s.push(box([0.03, 0.13, 0.1], [side * 0.115, 0.62, -0.06], C.steel));
  s.push(box([0.3, 0.03, 0.12], [0, 0.67, 0.15], C.steel, [-0.35, 0, 0])); // neck guard
  s.push(box([0.05, 0.1, 0.28], [0, 0.86, 0.01], C.crest)); // horsehair crest, front to back
  return part(s, pelvis, [0, 0.06, 0]);
}

function buildPelvis(body) {
  const s = [
    box([0.4, 0.22, 0.26], [0, -0.03, 0], C.tunic), // tunic skirt
    box([0.43, 0.06, 0.29], [0, 0.07, 0], C.leather), // belt (cingulum)
    box([0.08, 0.06, 0.02], [0, 0.07, -0.15], C.bronze), // buckle
    // Gladius in its scabbard on the right hip.
    box([0.05, 0.42, 0.06], [0.24, -0.12, 0.02], C.leather, [0.15, 0, 0]),
    box([0.06, 0.1, 0.06], [0.24, 0.13, -0.02], C.hilt, [0.15, 0, 0]),
  ];
  // Hanging leather straps (the "apron") at the front.
  for (let i = -1; i <= 1; i++) s.push(box([0.04, 0.2, 0.02], [i * 0.06, -0.06, -0.15], C.leather));
  return part(s, body, [0, HIP_Y, 0]);
}

export function createLegionary() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const pelvis = buildPelvis(body);
  const torso = buildTorso(pelvis);
  const legs = [buildLeg(pelvis, -1), buildLeg(pelvis, 1)];
  const arms = [buildArm(torso, -1), buildArm(torso, 1)];

  let runPhase = 0;
  let airWeight = 0;
  let slideWeight = 0;
  let stumbleWeight = 0; // 1 right after a stumble, fading to 0
  let stumbleTime = 0;

  return {
    root,

    // state: { distance moved this frame, grounded, sliding, sideSpeed }
    update(dt, { moved, grounded, sliding, sideSpeed }) {
      const A = LEGIONARY;
      if (grounded && !sliding) runPhase += (moved / A.runCycleLength) * Math.PI * 2;

      // Ease between poses so changes never snap.
      const k = 1 - Math.exp(-A.poseBlendSpeed * dt);
      airWeight += ((grounded ? 0 : 1) - airWeight) * k;
      slideWeight += ((sliding ? 1 : 0) - slideWeight) * k;
      const runWeight = (1 - airWeight) * (1 - slideWeight);

      const sin = Math.sin(runPhase);
      const cos = Math.cos(runPhase);

      // Each joint angle = run pose, blended with jump and slide poses.
      // Positive x-rotation swings a limb forward (towards -z).
      const pose = (run, jump, slide) => run * runWeight + jump * airWeight * (1 - slideWeight) + slide * slideWeight;

      legs.forEach(({ thigh, shin }, i) => {
        const dir = i === 0 ? 1 : -1; // legs move in opposite phase
        // The knee bends most while the leg swings forward (when cos·dir > 0).
        const swingForward = Math.max(0, cos * dir);
        // In the slide the body is already tilted back, so a small thigh angle
        // points the legs forward along the ground; one leg is tucked.
        thigh.rotation.x = pose(A.strideAngle * sin * dir, i === 0 ? 1.1 : 0.5, i === 0 ? 0.15 : 0.6);
        shin.rotation.x = pose(-(0.15 + 1.25 * swingForward), i === 0 ? -1.6 : -0.9, i === 0 ? -0.1 : -1.1);
      });

      arms.forEach(({ upper, fore }, i) => {
        const dir = i === 0 ? -1 : 1; // arms swing opposite to the legs
        upper.rotation.x = pose(A.armSwing * sin * dir, 0.9 + 0.4 * dir, 0.9);
        upper.rotation.z = pose(0, -dir * 0.5, -dir * 0.6); // spread arms for balance
        fore.rotation.x = pose(1.2 + 0.25 * sin * dir, 0.5, 0.3);
      });

      // Body: lean forward, bob twice per cycle, shoulders twist against the hips.
      torso.rotation.x = pose(-A.forwardLean, -0.1, -0.2);
      torso.rotation.y = pose(0.12 * sin, 0, 0);
      pelvis.rotation.y = pose(-0.08 * sin, 0, 0);
      pelvis.position.y = HIP_Y + pose(A.bodyBob * Math.abs(cos) - A.bodyBob, 0, -0.3);

      // Slide: lean back onto the ground, feet first, like a baseball slide.
      body.rotation.x = 1.15 * slideWeight;
      body.position.z = -0.45 * slideWeight;
      body.position.y = 0.12 * slideWeight; // keeps his back from sinking into the road

      // Stumble: pitch forward and throw the arms out, wobbling, then recover.
      if (stumbleWeight > 0) {
        stumbleTime += dt;
        stumbleWeight = Math.max(0, stumbleWeight - dt / STUMBLE.duration);
        const w = Math.sin(stumbleWeight * Math.PI * 0.5); // eases out
        torso.rotation.x -= 0.55 * w;
        arms.forEach(({ upper, fore }, i) => {
          upper.rotation.x += 1.4 * w;
          upper.rotation.z += (i === 0 ? 0.7 : -0.7) * w;
          fore.rotation.x -= 0.8 * w;
        });
        body.rotation.z = Math.sin(stumbleTime * 22) * 0.18 * w;
      } else {
        body.rotation.z = 0;
      }

      // Lane change: lean into the turn and look where he is going.
      const lean = THREE.MathUtils.clamp(-sideSpeed * A.sideLeanAmount, -A.maxSideLean, A.maxSideLean);
      root.rotation.z += (lean - root.rotation.z) * k;
      root.rotation.y += (lean * 0.6 - root.rotation.y) * k;
    },

    stumble() {
      stumbleWeight = 1;
      stumbleTime = 0;
    },

    reset() {
      runPhase = 0;
      stumbleWeight = 0;
      airWeight = 0;
      slideWeight = 0;
      root.rotation.set(0, 0, 0);
    },
  };
}
