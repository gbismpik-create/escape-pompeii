import * as THREE from 'three';
import { FALLING, LANES, OBSTACLES } from './config.js';
import { laneToX } from './lanes.js';
import { box, merge } from './geometry.js';

// Roof tiles and lumps of pumice falling onto the street.
// Each one goes through three stages:
//   warning – a shadow darkens and grows on the road where it will land
//   falling – it drops the last stretch, tumbling
//   done    – it bounced off the raised shield (flies off to the side),
//             hit the legionary (he stumbles), or smashed on the road
// A dust puff (dust.js-style points, below) marks every impact.
//
// Everything is pooled and instanced: one mesh per kind for all objects,
// one for all shadows, one Points for all dust.

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const WHITE = new THREE.Color(1, 1, 1);
const DARK = new THREE.Color().setScalar(FALLING.shadowDarkness);

// A Roman flat roof tile (tegula) with raised edges.
function tileGeometry() {
  const [x, y, z] = FALLING.tileSize;
  return merge([
    box([x, y * 0.5, z], [0, 0, 0], FALLING.tileColor),
    box([y * 0.6, y, z], [-x / 2 + y * 0.3, y * 0.4, 0], FALLING.tileEdgeColor),
    box([y * 0.6, y, z], [x / 2 - y * 0.3, y * 0.4, 0], FALLING.tileEdgeColor),
  ]);
}

// A rough lump of pumice: a low-poly ball with its corners pushed in and out.
function pumiceGeometry() {
  const g = new THREE.IcosahedronGeometry(FALLING.pumiceRadius, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.75 + 0.5 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  const color = new THREE.Color(FALLING.pumiceColor);
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.count * 3).map((_, i) => color.toArray()[i % 3]), 3));
  return g;
}

function shadowMaterial() {
  // Multiplies whatever is underneath by the instance colour: white leaves
  // the road unchanged, grey darkens it. So each shadow fades in on its own.
  return new THREE.MeshBasicMaterial({
    blending: THREE.CustomBlending,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.SrcColorFactor,
    depthWrite: false,
    fog: false,
    polygonOffset: true, // draw on top of the road without flickering
    polygonOffsetFactor: -2,
  });
}

function instanced(scene, name, geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.frustumCulled = false; // instances move all over the street
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, HIDDEN);
  scene.add(mesh);
  return mesh;
}

// Dust puffs: a pool of particles drawn as one Points object. Each particle
// has its own colour and fade (alpha), so a burst can mix dust and sparks.
function createDust(scene) {
  const n = FALLING.dust.maxParticles;
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
  const color = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
  const alpha = new THREE.BufferAttribute(new Float32Array(n), 1);
  const size = new THREE.BufferAttribute(new Float32Array(n), 1);
  for (const a of [position, color, alpha, size]) a.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', color);
  geometry.setAttribute('alpha', alpha);
  geometry.setAttribute('size', size);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    uniforms: { scale: { value: window.innerHeight / 2 } },
    vertexShader: `
      attribute float alpha;
      attribute float size;
      uniform float scale;
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        vAlpha = alpha;
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / -mv.z; // further away = smaller
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        gl_FragColor = vec4(vColor, vAlpha * (1.0 - d * d)); // soft round puff
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  const particles = Array.from({ length: n }, () => ({ life: 0, maxLife: 1, v: new THREE.Vector3(), size: 0, spark: false }));
  const dustColor = new THREE.Color(FALLING.dust.color);
  const sparkColor = new THREE.Color(FALLING.dust.sparkColor);
  let next = 0;

  return {
    // A puff at (x, y, z); sparks: how many bright sparks to mix in.
    burst(x, y, z, count, sparks = 0) {
      for (let i = 0; i < count; i++) {
        const p = particles[next];
        const index = next;
        next = (next + 1) % n;
        const spark = i < sparks;
        const a = Math.random() * Math.PI * 2;
        const s = (spark ? 3.5 : 1.2) * (0.5 + Math.random());
        p.v.set(Math.cos(a) * s, (spark ? 2.5 : 0.8) + Math.random() * 1.5, Math.sin(a) * s);
        p.maxLife = p.life = (spark ? 0.25 : FALLING.dust.life) * (0.7 + Math.random() * 0.6);
        p.size = spark ? 0.09 : FALLING.dust.size * (0.6 + Math.random() * 0.8);
        p.spark = spark;
        position.setXYZ(index, x, y, z);
        (spark ? sparkColor : dustColor).toArray(color.array, index * 3);
      }
      color.needsUpdate = true;
    },
    update(dt) {
      particles.forEach((p, i) => {
        if (p.life <= 0) {
          alpha.array[i] = 0;
          return;
        }
        p.life = Math.max(0, p.life - dt);
        p.v.y -= (p.spark ? 9 : 1.5) * dt; // sparks drop, dust drifts
        p.v.multiplyScalar(1 - (p.spark ? 1 : 3) * dt); // air slows the dust quickly
        position.setXYZ(i, position.getX(i) + p.v.x * dt, position.getY(i) + p.v.y * dt, position.getZ(i) + p.v.z * dt);
        const k = p.life / p.maxLife;
        alpha.array[i] = (p.spark ? 1 : FALLING.dust.opacity) * k;
        size.array[i] = p.size * (p.spark ? 1 : 1 + (1 - k) * 1.5); // dust spreads as it fades
      });
      position.needsUpdate = alpha.needsUpdate = size.needsUpdate = true;
    },
    reset() {
      for (const p of particles) p.life = 0;
    },
  };
}

// track: to keep landing spots clear of obstacles.
// on: { block(x, y, z), hit(), smash(x, z) } callbacks for sounds and the stumble.
export function createFalling(scene, track, on) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const max = FALLING.maxFalling;
  const meshes = {
    tile: instanced(scene, 'falling:tile', tileGeometry(), material, max),
    pumice: instanced(scene, 'falling:pumice', pumiceGeometry(), material, max),
  };
  const shadows = instanced(scene, 'falling:shadow', new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), shadowMaterial(), max);
  for (let i = 0; i < max; i++) shadows.setColorAt(i, WHITE);
  const dust = createDust(scene);

  const pool = Array.from({ length: max }, () => ({
    active: false,
    kind: 'tile',
    age: 0,
    stage: 'warning',
    fallAge: 0,
    fallStartZ: 0,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    rotation: new THREE.Euler(),
    spin: new THREE.Vector3(),
  }));

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const color = new THREE.Color();

  // Nearest obstacle row to a z, in metres (0 at a junction). On the
  // runner's street, z = -distance along the path (see track.js).
  const distanceToObstacle = (z) => track.distanceToObstacle(-z);

  // Picks a landing spot warningTime ahead of the player, clear of obstacles
  // (so dodging one never means running under the other) and of other
  // falling things. Returns false if nothing fits this time.
  function trySpawn(player, speed) {
    const item = pool.find((f) => !f.active);
    if (!item) return false;
    const playerLane = Math.round(player.x / LANES.width + (LANES.count - 1) / 2);
    const lane = Math.random() < FALLING.targetPlayerChance ? playerLane : Math.floor(Math.random() * LANES.count);
    const clearance = FALLING.clearanceTime * speed;
    const landZ = player.z - speed * FALLING.warningTime;
    for (const offset of [0, -3, 3, -6, 6]) {
      const z = landZ + offset;
      if (-z < Math.max(OBSTACLES.safeStartDistance, FALLING.startDistance)) continue;
      if (distanceToObstacle(z) < clearance) continue;
      if (pool.some((f) => f.active && f.stage !== 'done' && Math.abs(f.position.z - z) < clearance)) continue;
      item.active = true;
      item.kind = Math.random() < FALLING.tileShare ? 'tile' : 'pumice';
      item.age = 0;
      item.stage = 'warning';
      item.position.set(laneToX(lane), FALLING.dropHeight, z);
      item.velocity.set(0, 0, 0);
      item.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      item.spin.set(Math.random() * 6 - 3, Math.random() * 4 - 2, Math.random() * 6 - 3);
      return true;
    }
    return false;
  }

  function finish(item, index) {
    item.active = false;
    meshes[item.kind].setMatrixAt(index, HIDDEN);
    shadows.setMatrixAt(index, HIDDEN);
  }

  // Is the falling item at the legionary? Raised shield: the area above his
  // head; otherwise his own hitbox.
  function touches(item, player) {
    const p = item.position;
    const r = FALLING.hitRadius;
    if (player.shieldRaised) {
      const s = FALLING.shieldArea;
      // Anything this low above him has met the shield (even if a slow
      // frame stepped it past the shield's height).
      return Math.abs(p.x - player.position.x) < s.halfWidth + r && Math.abs(p.z - player.position.z) < s.halfDepth + r && p.y < s.top + r;
    }
    const h = player.hitbox;
    return p.x > h.min.x - r && p.x < h.max.x + r && p.z > h.min.z - r && p.z < h.max.z + r && p.y < h.max.y + r;
  }

  function updateItem(item, index, dt, player, speed) {
    item.age += dt;
    const W = FALLING.warningTime;
    const mesh = meshes[item.kind];

    if (item.stage !== 'done') {
      // Shadow: darkens quickly, then grows as the object gets closer.
      const k = Math.min(1, item.age / W); // W: roughly how long until it lands
      const r = FALLING.shadowRadius * (0.6 + 0.4 * k) * (1 + 0.06 * Math.sin(item.age * 25));
      shadows.setMatrixAt(index, m.makeScale(r, 1, r).setPosition(item.position.x, 0.02, item.position.z));
      shadows.setColorAt(index, color.lerpColors(WHITE, DARK, Math.min(1, item.age / FALLING.shadowFadeIn)));

      // Starts to fall once he is fallTime away from the shadow at his
      // current speed, so it arrives as he does even if he slowed down
      // (raising the shield) after it appeared.
      if (item.stage === 'warning') {
        const timeToArrive = player ? (player.position.z - item.position.z) / Math.max(speed, 1) : Infinity;
        if (timeToArrive > FALLING.fallTime) {
          mesh.setMatrixAt(index, HIDDEN);
          return;
        }
        item.stage = 'falling';
        item.fallAge = 0;
        item.fallStartZ = item.position.z;
      }
      item.fallAge += dt;
      const f = Math.min(1, item.fallAge / FALLING.fallTime);
      // Drift along the street to meet him even if his speed changes during
      // the fall (raising the shield slows him). Changing lane still dodges.
      if (player) {
        const aimZ = player.position.z - speed * (1 - f) * FALLING.fallTime;
        item.position.z = THREE.MathUtils.lerp(item.fallStartZ, aimZ, f);
      }
      item.position.y = FALLING.dropHeight * (1 - f * f);
      item.rotation.x += item.spin.x * dt;
      item.rotation.y += item.spin.y * dt;
      item.rotation.z += item.spin.z * dt;

      if (player && touches(item, player)) {
        shadows.setMatrixAt(index, HIDDEN);
        if (player.shieldRaised) {
          // Bounces off the scutum: up and away to the side it was on.
          item.stage = 'done';
          item.age = 0;
          const side = Math.sign(item.position.x - player.position.x) || (Math.random() < 0.5 ? -1 : 1);
          item.velocity.set(side * (2.5 + Math.random() * 1.5), 3.5 + Math.random() * 1.5, player.velocityZ * 0.6);
          item.spin.multiplyScalar(3);
          dust.burst(item.position.x, item.position.y, item.position.z, FALLING.dust.perBlock, FALLING.dust.sparksPerBlock);
          on.block(item.kind);
        } else {
          dust.burst(item.position.x, item.position.y, item.position.z, FALLING.dust.perSmash);
          on.hit(item.kind);
          finish(item, index);
          return;
        }
      } else if (f >= 1) {
        dust.burst(item.position.x, 0.1, item.position.z, FALLING.dust.perSmash);
        on.smash(item.kind, item.position.z);
        finish(item, index);
        return;
      }
    } else {
      // Flying off the shield, then gone when it reaches the road.
      item.velocity.y -= 18 * dt;
      item.position.addScaledVector(item.velocity, dt);
      item.rotation.x += item.spin.x * dt;
      item.rotation.z += item.spin.z * dt;
      if (item.position.y < 0.1 || item.age > 2) {
        dust.burst(item.position.x, 0.1, item.position.z, FALLING.dust.perSmash / 2);
        finish(item, index);
        return;
      }
    }
    q.setFromEuler(item.rotation);
    mesh.setMatrixAt(index, m.compose(item.position, q, one));
  }

  function flush() {
    for (const mesh of [...Object.values(meshes), shadows]) mesh.instanceMatrix.needsUpdate = true;
    shadows.instanceColor.needsUpdate = true;
  }

  return {
    // rate: objects per second (from the phase). player: { position, hitbox,
    // shieldRaised, velocityZ }, or null when nothing should be hit.
    update(dt, rate, speed, player) {
      if (player && Math.random() < rate * dt) trySpawn(player.position, speed);
      pool.forEach((item, i) => item.active && updateItem(item, i, dt, player, speed));
      dust.update(dt);
      flush();
    },
    reset() {
      pool.forEach((item, i) => item.active && finish(item, i));
      dust.reset();
      flush();
    },
  };
}
